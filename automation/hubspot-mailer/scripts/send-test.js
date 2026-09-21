#!/usr/bin/env node
/* =============================================================================
 *  Testversand
 *
 *  Drei Betriebsarten, von harmlos nach echt:
 *
 *   1. Nur ansehen — rendert die Mail eines echten Datensatzes und schreibt
 *      sie als HTML-Datei weg. Nichts geht raus, nichts wird geschrieben.
 *        npm run send:test -- --type contacts --id 123 --preview
 *
 *   2. Gmail allein — verschickt eine Probemail an eine feste Adresse, ohne
 *      HubSpot. Beantwortet die Frage "funktioniert die Google-Seite?"
 *        npm run send:test -- --to benedict.hintz@gmail.com
 *
 *   3. Der volle Weg — genau das, was auch der Webhook ausloest, samt
 *      Dublettensperre und Ruecklauf nach HubSpot.
 *        npm run send:test -- --type contacts --id 123
 *
 *  Der volle Weg ist mit Absicht nicht harmlos: Er schickt eine echte Mail
 *  an die echte Adresse des Datensatzes. Wer das am Wirkbetrieb ausprobiert,
 *  setzt vorher SEND_ALLOWLIST.
 * ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const { App } = require('../src/app.js');
const { baueMail } = require('../src/template.js');
const { baueNachricht } = require('../src/mime.js');
const { ermittleEmpfaenger } = require('../src/recipient.js');

function argumente() {
  const a = process.argv.slice(2);
  const raus = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].indexOf('--') !== 0) continue;
    const name = a[i].slice(2);
    const wert = (a[i + 1] && a[i + 1].indexOf('--') !== 0) ? a[++i] : 'true';
    raus[name] = wert;
  }
  return raus;
}

const schreib = (s) => process.stdout.write(s + '\n');

async function main() {
  const arg = argumente();

  if (!arg.to && !arg.id) {
    schreib('\nVerwendung:\n' +
      '  npm run send:test -- --to <adresse>                     Probemail nur ueber Gmail\n' +
      '  npm run send:test -- --type contacts --id <id> --preview  nur rendern, HTML-Datei\n' +
      '  npm run send:test -- --type contacts --id <id>            voller Weg, echte Mail\n\n' +
      '  --type   contacts (Standard), companies oder leads\n');
    process.exit(1);
  }

  const app = new App();
  const cfg = app.cfg;

  /* ------------------------------------------------- 2. Gmail allein */
  if (arg.to) {
    const kontoSchluessel = arg.sender || cfg.absender.standard;
    const konto = cfg.absender.konten[kontoSchluessel];
    if (!konto) {
      schreib('Absenderkonto "' + kontoSchluessel + '" ist nicht konfiguriert. Bekannt: ' +
        Object.keys(cfg.absender.konten).join(', '));
      process.exit(1);
    }

    const sendId = 'probe-' + Date.now().toString(36);
    const mail = baueMail({
      betreff: arg.subject || 'Probemail der HubSpot-Automation',
      rumpf: arg.body ||
        'Guten Tag,\n\ndiese Nachricht kommt aus der HubSpot-Automation und belegt, dass der Weg ' +
        'ueber die Gmail-API steht.\n\nAbsender: ' + konto.email + '\nSend-ID: ' + sendId +
        '\nGesendet: ' + new Date().toLocaleString('de-DE', { timeZone: cfg.zeitzone }) +
        '\n\nEine Antwort ist nicht noetig.',
      werte: { firstname: 'Test', lastname: 'Empfaenger', sender_name: konto.name || konto.email },
      signatur: cfg.versand.signaturAn ? app.pipeline.vorlagen.signatur : '',
      rahmen: app.pipeline.vorlagen.rahmen,
      regel: 'blank'
    });

    const nachricht = baueNachricht({
      von: { email: konto.email, name: konto.name },
      an: arg.to,
      antwortAn: konto.replyTo || '',
      betreff: mail.betreff, html: mail.html, text: mail.text,
      sendId: sendId, zeitzone: cfg.zeitzone
    });

    schreib('\nProbemail\n  von:      ' + konto.email + '\n  an:       ' + arg.to +
      '\n  Betreff:  ' + mail.betreff + '\n  Send-ID:  ' + sendId + '\n');

    if (cfg.versand.trockenlauf) {
      schreib('DRY_RUN ist an — es wird nichts verschickt. Die Nachricht waere ' +
        nachricht.raw.length + ' Bytes gross.');
      const ziel = path.join(cfg.ablage.datei, '..', 'probemail.eml');
      fs.writeFileSync(ziel, nachricht.raw);
      schreib('Zum Ansehen abgelegt: ' + ziel);
      await app.halte();
      return;
    }

    const quittung = await app.gmail.sende(konto.email, nachricht.raw);
    schreib('Versendet. Gmail-ID: ' + quittung.id);
    schreib('Im Postausgang von ' + konto.email + ' steht sie mit der Kopfzeile X-Automation-Send-Id: ' + sendId + '\n');
    await app.halte();
    return;
  }

  /* --------------------------------------------- 1./3. ueber einen Datensatz */
  const objektTyp = arg.type || 'contacts';
  const objektId = String(arg.id);

  if (arg.preview === 'true' || arg.preview === '') {
    const datensatz = await app.pipeline.ladeDatensatz(objektTyp, objektId);
    const props = datensatz.properties || {};
    const ziel = await ermittleEmpfaenger(objektTyp, datensatz, app.hubspot, cfg);
    const absender = app.pipeline.waehleAbsender(props) || cfg.absender.konten[cfg.absender.standard];
    const werte = app.pipeline.baueWerte(datensatz, ziel, absender);

    const mail = baueMail({
      betreff: props[cfg.props.subject] || '(kein Betreff hinterlegt)',
      rumpf: props[cfg.props.body] || '(kein Inhalt hinterlegt)',
      werte: werte,
      signatur: cfg.versand.signaturAn ? (absender.signature || app.pipeline.vorlagen.signatur) : '',
      rahmen: app.pipeline.vorlagen.rahmen,
      regel: cfg.versand.platzhalterRegel
    });

    const sendId = app.pipeline.baueSendId({
      objektTyp: objektTyp, objektId: objektId, empfaenger: ziel.email, absender: absender.email,
      betreff: props[cfg.props.subject] || '', rumpf: props[cfg.props.body] || '',
      vorlage: props[cfg.props.template] || '', freigabe: props[cfg.props.sendKey] || ''
    });

    const vorhanden = app.ledger.eintrag(sendId);

    schreib('\nVorschau ' + objektTyp + '/' + objektId);
    schreib('  Empfaenger:   ' + ziel.email + '   (ermittelt ueber: ' + ziel.quelle + ')');
    schreib('  Absender:     ' + absender.email);
    schreib('  Betreff:      ' + mail.betreff);
    schreib('  Send-ID:      ' + sendId);
    schreib('  Im Ledger:    ' + (vorhanden ? vorhanden.zustand + ' seit ' + (vorhanden.sentAt || vorhanden.claimedAt) : 'noch nicht vorhanden'));
    schreib('  Status jetzt: ' + (props[cfg.props.status] || '(leer)'));
    schreib('  Freigegeben:  ' + (props[cfg.props.enabled] || '(leer)'));
    if (mail.fehlend.length) schreib('  ACHTUNG — Platzhalter ohne Wert: ' + mail.fehlend.join(', '));
    schreib('  Platzhalter:  ' + Object.entries(werte).filter((p) => p[1]).map((p) => p[0] + '=' + p[1]).join(', '));

    const dateiHtml = path.join(path.dirname(cfg.ablage.datei), 'vorschau-' + objektTyp + '-' + objektId + '.html');
    fs.writeFileSync(dateiHtml, mail.html);
    fs.writeFileSync(dateiHtml.replace(/\.html$/, '.txt'), mail.text);
    schreib('\n  HTML:  ' + dateiHtml);
    schreib('  Text:  ' + dateiHtml.replace(/\.html$/, '.txt') + '\n');

    await app.halte();
    return;
  }

  schreib('\nVoller Durchlauf fuer ' + objektTyp + '/' + objektId +
    (cfg.versand.trockenlauf ? '  [DRY_RUN]' : '  [es geht eine echte Mail raus]') + '\n');

  const ergebnis = await app.pipeline.verarbeite(objektTyp, objektId, 'manuell');

  schreib('\nErgebnis: ' + JSON.stringify(ergebnis, null, 2) + '\n');

  if (ergebnis.ergebnis === 'duplicate') {
    schreib('Die Dublettensperre hat gegriffen — diese Mail ist schon einmal rausgegangen.');
    schreib('Zum absichtlichen erneuten Senden in ' + cfg.props.sendKey + ' etwas Neues eintragen.\n');
  }

  await app.halte();
}

main().catch((e) => {
  process.stderr.write('\nFehler: ' + e.message + '\n' +
    (e.detail ? String(e.detail).slice(0, 400) + '\n' : '') +
    (e.probleme ? '' : (e.stack || '').split('\n').slice(1, 4).join('\n') + '\n') + '\n');
  process.exit(1);
});
