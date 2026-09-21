#!/usr/bin/env node
/* =============================================================================
 *  Die echte Gmail-Signatur uebernehmen
 *
 *      npm run import:signature
 *      npm run import:signature -- --from info@finanz-medizin.com
 *      npm run import:signature -- --dry          nur anzeigen, nicht schreiben
 *
 *  Holt die zuletzt verschickte Nachricht aus dem Postfach, schneidet den
 *  Signaturblock heraus und schreibt ihn nach templates/signature.html.
 *  Damit steht in den automatischen Mails genau dieselbe Signatur wie unter
 *  einer von Hand geschriebenen.
 *
 *  Warum ueber eine verschickte Nachricht und nicht ueber die Einstellung:
 *  Die Signatur liegt in der Gmail-Settings-API unter sendAs — und die
 *  verlangt den Scope gmail.settings.basic, also Zugriff auf saemtliche
 *  Kontoeinstellungen. Eine verschickte Mail enthaelt dieselbe Signatur und
 *  kommt mit gmail.readonly aus, das fuer die Kampagnen ohnehin gebraucht
 *  wird. Weniger Rechte fuer dasselbe Ergebnis.
 *
 *  Voraussetzung: GMAIL_VERIFY_ENABLED=true und der Scope gmail.readonly in
 *  der domainweiten Delegierung. Ohne beides sagt das Skript, was fehlt.
 *
 *  Wichtig: Im Postfach muss mindestens eine von Hand geschriebene Mail mit
 *  Signatur liegen. Ist der Ordner "Gesendet" leer, schreiben Sie sich
 *  einmal selbst — das genuegt.
 * ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const { konfig } = require('../src/config.js');
const { GoogleAuth } = require('../src/google-auth.js');
const { Gmail } = require('../src/gmail.js');
const { entferneKommentare } = require('../src/template.js');

const schreib = (s) => process.stdout.write(s + '\n');

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

/* ------------------------------------------------------------ MIME lesen */
const vonBase64Url = (s) => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

/** Sucht rekursiv den HTML-Teil einer Nachricht. */
function findeHtml(teil) {
  if (!teil) return '';
  if (teil.mimeType === 'text/html' && teil.body && teil.body.data) return vonBase64Url(teil.body.data);
  for (const kind of (teil.parts || [])) {
    const treffer = findeHtml(kind);
    if (treffer) return treffer;
  }
  return '';
}

/**
 * Schneidet den Signaturblock heraus.
 *
 * Gmail markiert die Signatur beim Verfassen mit class="gmail_signature"
 * (neuere Konten zusaetzlich mit data-smartmail). Findet sich die Markierung
 * nicht, war die Signatur vermutlich nicht in Gmail eingerichtet — dann wird
 * bewusst nichts geraten, sondern gesagt, was los ist.
 */
function schneideSignatur(html) {
  const start = /<div[^>]*(?:class="[^"]*gmail_signature[^"]*"|data-smartmail="gmail_signature")[^>]*>/i.exec(html);
  if (!start) return '';

  /* Ab dem oeffnenden div die Verschachtelung mitzaehlen, bis es zu ist. */
  let tiefe = 0;
  let i = start.index;
  const ende = html.length;

  while (i < ende) {
    const auf = html.indexOf('<div', i);
    const zu = html.indexOf('</div', i);

    if (zu === -1) break;

    if (auf !== -1 && auf < zu) {
      tiefe++;
      i = auf + 4;
    } else {
      tiefe--;
      i = zu + 5;
      if (tiefe === 0) {
        const schluss = html.indexOf('>', i);
        return html.slice(start.index, schluss === -1 ? i : schluss + 1);
      }
    }
  }
  return '';
}

/* ------------------------------------------------------------------ Lauf */
async function main() {
  const arg = argumente();
  const cfg = konfig();

  if (!cfg.google.verifizieren) {
    schreib('\nGMAIL_VERIFY_ENABLED steht auf false — ohne Lesezugriff kann die Signatur nicht geholt werden.');
    schreib('In der domainweiten Delegierung den Scope gmail.readonly ergaenzen und');
    schreib('GMAIL_VERIFY_ENABLED=true setzen. Danach dieses Skript erneut aufrufen.\n');
    process.exit(1);
  }

  const kontoSchluessel = arg.sender || cfg.absender.standard;
  const konto = cfg.absender.konten[kontoSchluessel];
  const postfach = arg.from || (konto && konto.email);

  if (!postfach) {
    schreib('\nKein Postfach. Entweder --from <adresse> angeben oder GMAIL_SENDER_EMAIL setzen.\n');
    process.exit(1);
  }

  const auth = new GoogleAuth(cfg);
  const gmail = new Gmail(cfg, auth);

  schreib('\nSignatur aus ' + postfach + ' holen …');

  let nachrichten;
  try {
    nachrichten = arg.message
      ? [{ id: arg.message }]
      : await gmail.letzteNachrichten(postfach, 'SENT', 15);
  } catch (e) {
    schreib('\nPostausgang nicht lesbar: ' + e.message);
    schreib((e.code === 'GMAIL_SCOPE' || e.status === 403)
      ? 'Der Scope gmail.readonly fehlt in der domainweiten Delegierung.\n'
      : '');
    process.exit(1);
  }

  if (!nachrichten.length) {
    schreib('\nIm Ordner "Gesendet" liegt nichts. Schreiben Sie sich einmal selbst eine Mail');
    schreib('(mit Signatur), dann noch einmal versuchen.\n');
    process.exit(1);
  }

  for (const n of nachrichten) {
    let voll;
    try {
      voll = await gmail.nachrichtVoll(postfach, n.id);
    } catch (e) {
      continue;
    }

    const html = findeHtml(voll.payload);
    if (!html) continue;

    const signatur = schneideSignatur(html);
    if (!signatur) continue;

    const sauber = entferneKommentare(signatur).trim();

    schreib('\nGefunden in Nachricht ' + n.id + ' (' + sauber.length + ' Zeichen).');
    schreib('-------------------------------------------------------------');
    schreib(sauber.replace(/></g, '>\n<').slice(0, 1200));
    schreib('-------------------------------------------------------------');

    if (arg.dry === 'true') {
      schreib('\n--dry: es wurde nichts geschrieben.\n');
      return;
    }

    const ziel = arg.to || cfg.vorlagen.signaturDatei;
    if (!ziel) {
      schreib('\nKein Ziel. SIGNATURE_FILE setzen oder --to <datei> angeben.\n');
      process.exit(1);
    }

    /* Die bisherige Fassung nicht einfach ueberschreiben — in ihr steckt
       Arbeit, und ein Rueckweg kostet hier nichts. */
    if (fs.existsSync(ziel)) {
      const sicherung = ziel + '.' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '') + '.bak';
      fs.copyFileSync(ziel, sicherung);
      schreib('\nBisherige Fassung gesichert: ' + sicherung);
    }

    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel,
      '<!-- Aus dem Postfach ' + postfach + ' uebernommen am ' +
      new Date().toISOString().slice(0, 10) + '.\n' +
      '     Erneut holen mit: npm run import:signature\n' +
      '     Platzhalter wie {{sender_name}} funktionieren auch hier. -->\n' + sauber + '\n');

    schreib('Geschrieben: ' + ziel);
    schreib('\nZum Ansehen:  npm run send:test -- --to <ihre adresse>');
    schreib('Danach den Dienst neu starten, damit die Signatur uebernommen wird.\n');
    return;
  }

  schreib('\nIn den letzten ' + nachrichten.length + ' verschickten Nachrichten war kein Signaturblock');
  schreib('zu finden. Gmail markiert Signaturen nur, wenn sie unter Einstellungen > Signatur');
  schreib('hinterlegt sind und beim Verfassen automatisch eingefuegt wurden.');
  schreib('');
  schreib('Abhilfe: in Gmail eine Signatur einrichten, sich selbst eine Mail schreiben,');
  schreib('dann dieses Skript erneut aufrufen. Oder templates/signature.html von Hand pflegen —');
  schreib('die dort hinterlegte Fassung ist vollstaendig und einsatzbereit.\n');
  process.exit(1);
}

if (require.main === module) {
  main().catch((e) => {
    process.stderr.write('\nFehler: ' + e.message + '\n' + (e.detail ? String(e.detail).slice(0, 300) + '\n' : '') + '\n');
    process.exit(1);
  });
}

/* Das Herausschneiden hat einen eigenen Test — es ist der einzige Teil,
   an dem sich unbemerkt eine halbe Signatur einschleichen koennte. */
module.exports = { schneideSignatur, findeHtml, vonBase64Url };
