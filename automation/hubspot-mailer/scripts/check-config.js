#!/usr/bin/env node
/* =============================================================================
 *  Selbsttest
 *
 *      npm run check
 *
 *  Geht der Reihe nach durch, was stimmen muss, und sagt bei jedem Punkt
 *  nicht nur "kaputt", sondern woran es liegt. Es wird nichts geschrieben
 *  und nichts verschickt.
 *
 *  Gedacht fuer zwei Momente: einmal nach der Einrichtung, und dann jedes
 *  Mal, wenn der Dienst nicht tut, was er soll. Die haeufigsten Ursachen —
 *  fehlender Scope, nicht eingetragene Delegierung, vergessene Property —
 *  stehen hier mit dem konkreten Handgriff dabei.
 * ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const { konfig, pruefeKonfig } = require('../src/config.js');
const { HubSpot } = require('../src/hubspot.js');
const { GoogleAuth } = require('../src/google-auth.js');
const { Gmail } = require('../src/gmail.js');
const { Ledger } = require('../src/store.js');
const { Sequenzen } = require('../src/sequence.js');
const { ladeAnhaenge } = require('../src/anhang.js');

const schreib = (s) => process.stdout.write(s + '\n');
const OK = '  [ok]   ';
const FEHLER = '  [!!]   ';
const HINWEIS = '  [--]   ';

let fehlerZahl = 0;
const gescheitert = (text, rat) => {
  fehlerZahl++;
  schreib(FEHLER + text);
  if (rat) for (const zeile of String(rat).split('\n')) schreib('         ' + zeile);
};

async function main() {
  schreib('\n=== Selbsttest hubspot-mailer ===\n');

  /* ------------------------------------------------------- 1. Konfiguration */
  schreib('1. Konfiguration');
  let cfg;
  try {
    cfg = konfig();
  } catch (e) {
    gescheitert('Konfiguration nicht lesbar: ' + e.message);
    return abschluss();
  }

  const probleme = pruefeKonfig(cfg);
  if (probleme.length) {
    for (const p of probleme) gescheitert(p);
  } else {
    schreib(OK + 'vollstaendig');
  }

  schreib(HINWEIS + 'Zeitzone ' + cfg.zeitzone + ', Objektarten: ' + cfg.objekte.join(', '));
  schreib(HINWEIS + 'Absender: ' + Object.values(cfg.absender.konten).map((k) => k.key + '=' + k.email).join(', '));
  if (cfg.versand.trockenlauf) schreib(HINWEIS + 'DRY_RUN ist an — es geht keine echte Mail raus.');
  schreib(HINWEIS + 'Anrede: ' + ({
    strict: 'nur Frau/Herr mit Namen — sonst geht die Mail nicht raus',
    formal: 'Frau/Herr mit Namen, sonst "Sehr geehrte Damen und Herren"',
    neutral: 'Frau/Herr mit Namen, sonst "Guten Tag"'
  }[cfg.versand.anredeRegel] || cfg.versand.anredeRegel));

  if (cfg.versand.erlaubteEmpfaenger.length) {
    schreib(HINWEIS + 'SEND_ALLOWLIST aktiv: ' + cfg.versand.erlaubteEmpfaenger.join(', '));
  }

  if (fehlerZahl) return abschluss();

  /* ------------------------------------------------------------ 2. Ablage */
  schreib('\n2. Ledger (Dublettenschutz)');
  try {
    const ledger = new Ledger(cfg.ablage).oeffne();
    schreib(OK + cfg.ablage.datei);
    schreib(HINWEIS + ledger.index.size + ' Eintraege, davon ' + ledger.offeneFaelle().length + ' offen');
    schreib(HINWEIS + 'in den letzten 24 h versendet: ' + ledger.zaehleVersendetSeit(Date.now() - 86400000) +
      ' von ' + cfg.versand.tageslimit);

    const offen = ledger.offeneFaelle();
    for (const f of offen.slice(0, 5)) {
      schreib(HINWEIS + '  offen: ' + f.objectType + '/' + f.objectId + ' (' + f.zustand + ', seit ' + f.seit + ')');
    }
    ledger.schliesse();
  } catch (e) {
    gescheitert('Ledger nicht beschreibbar: ' + e.message,
      'Das Verzeichnis ' + path.dirname(cfg.ablage.datei) + ' muss fuer den Dienstbenutzer schreibbar sein.\n' +
      'Ohne diese Datei gibt es keinen Schutz vor doppelten Mails — der Dienst startet dann nicht.');
  }

  /* ----------------------------------------------------------- 3. Vorlagen */
  schreib('\n3. Vorlagen');
  for (const [titel, datei] of [['Signatur', cfg.vorlagen.signaturDatei], ['Geruest', cfg.vorlagen.rahmenDatei]]) {
    if (!datei) { schreib(HINWEIS + titel + ': nicht konfiguriert'); continue; }
    try {
      const inhalt = fs.readFileSync(datei, 'utf8');
      schreib(OK + titel + ': ' + datei + ' (' + inhalt.length + ' Zeichen)');
    } catch (e) {
      schreib(HINWEIS + titel + ': ' + datei + ' fehlt — wird ohne verschickt');
    }
  }

  /* ------------------------------------------------------------ 4. HubSpot */
  schreib('\n4. HubSpot');
  const hubspot = new HubSpot(cfg);
  let portalOk = false;

  try {
    const info = await hubspot.portalInfo();
    schreib(OK + 'Portal ' + (info.portalId || '?') + ' erreichbar (Zeitzone dort: ' + (info.timeZone || '?') + ')');
    portalOk = true;
    if (info.timeZone && info.timeZone !== cfg.zeitzone) {
      schreib(HINWEIS + 'HubSpot steht auf ' + info.timeZone + ', die Automation rechnet in ' + cfg.zeitzone + '. ' +
        'Zeitpunkte werden intern in UTC verglichen, das ist also unkritisch — aber die Anzeige in HubSpot ' +
        'kann von {{meeting_time}} abweichen.');
    }
  } catch (e) {
    if (e.status === 403) {
      /* Nur dieser eine Endpunkt ist gesperrt. Die eigentliche Arbeit
         haengt nicht daran — die Pruefungen darunter zeigen es. */
      schreib(HINWEIS + 'Portal-Kennung nicht abrufbar (403) — der Token hat den Scope nicht. Unerheblich.');
      portalOk = true;
    } else {
      gescheitert('HubSpot antwortet nicht: ' + e.message,
        e.status === 401
          ? 'Der Token ist ungueltig oder widerrufen.\nEinstellungen > Integrationen > Private Apps > die App > Auth > Token anzeigen.'
          : 'Netzwerk oder Berechtigung pruefen. Details: ' + String(e.detail || '').slice(0, 200));
    }
  }

  if (portalOk) {
    for (const objektTyp of cfg.objekte) {
      try {
        const vorhandene = await hubspot.propertyListe(objektTyp);
        const namen = new Set(vorhandene.map((p) => p.name));

        const pflicht = ['enabled', 'subject', 'body', 'status'].map((k) => cfg.props[k]).filter(Boolean);
        const gewuenscht = Object.values(cfg.props).filter(Boolean);
        const fehlendePflicht = pflicht.filter((n) => !namen.has(n));
        const fehlendeKuer = gewuenscht.filter((n) => !namen.has(n) && pflicht.indexOf(n) === -1);

        if (fehlendePflicht.length) {
          gescheitert(objektTyp + ': Pflicht-Properties fehlen: ' + fehlendePflicht.join(', '),
            'Bitte "npm run setup:properties" ausfuehren.');
        } else if (fehlendeKuer.length) {
          schreib(HINWEIS + objektTyp + ': optionale Properties fehlen (' + fehlendeKuer.join(', ') +
            ') — "npm run setup:properties" legt sie an.');
        } else {
          schreib(OK + objektTyp + ': alle ' + gewuenscht.length + ' Properties vorhanden');
        }
      } catch (e) {
        if (e.status === 404 || e.status === 400) {
          schreib(HINWEIS + objektTyp + ': Objektart in diesem Portal nicht vorhanden — wird uebersprungen');
        } else {
          gescheitert(objektTyp + ': Properties nicht lesbar — ' + e.message);
        }
      }
    }

    /* Schreibrecht ist ein eigener Scope und faellt sonst erst beim ersten
       echten Versand auf. */
    try {
      await hubspot.suche('contacts', [{ filters: [{ propertyName: 'email', operator: 'HAS_PROPERTY' }] }], ['email'], 1);
      schreib(OK + 'Suche nutzbar (der Scheduler braucht sie)');
    } catch (e) {
      gescheitert('Suche nicht nutzbar: ' + e.message,
        'Dem Token fehlt vermutlich der Scope crm.objects.contacts.read.');
    }
  }

  /* ------------------------------------------------------------- 5. Google */
  schreib('\n5. Google / Gmail');
  schreib(HINWEIS + 'Modus: ' + cfg.google.modus + ', Scopes: ' + new GoogleAuth(cfg).scopes().join(' '));

  let auth;
  try {
    auth = new GoogleAuth(cfg);
    if (cfg.google.modus === 'service_account' && auth.konto) {
      schreib(OK + 'Dienstkonto gelesen: ' + auth.konto.client_email);
      schreib(HINWEIS + 'Client-ID fuer die domainweite Delegierung: ' + (auth.konto.client_id || '(fehlt im JSON)'));
    }
  } catch (e) {
    gescheitert('Dienstkonto nicht lesbar: ' + e.message,
      'GOOGLE_SERVICE_ACCOUNT muss das vollstaendige JSON enthalten, roh oder base64-kodiert.');
    return abschluss();
  }

  const gmail = new Gmail(cfg, auth);

  for (const konto of Object.values(cfg.absender.konten)) {
    try {
      await auth.token(konto.email);
      schreib(OK + konto.email + ': Token erhalten — Versand im Namen dieses Postfachs ist freigegeben');
    } catch (e) {
      gescheitert(konto.email + ': ' + e.message,
        e.code === 'GOOGLE_DWD_FEHLT'
          ? 'admin.google.com > Sicherheit > Zugriffs- und Datenkontrolle > API-Steuerung >\n' +
            'Domainweite Delegierung verwalten. Client-ID: ' + ((auth.konto && auth.konto.client_id) || '?') + '\n' +
            'Scope: ' + auth.scopes().join(',')
          : '');
      continue;
    }

    if (cfg.google.verifizieren) {
      try {
        const profil = await gmail.profil(konto.email);
        schreib(OK + konto.email + ': Postausgang lesbar (' + (profil.messagesTotal || 0) + ' Nachrichten) — ' +
          'unklare Faelle koennen automatisch geklaert werden');
      } catch (e) {
        gescheitert(konto.email + ': Postausgang nicht lesbar — ' + e.message,
          'GMAIL_VERIFY_ENABLED ist an, aber der Scope gmail.readonly fehlt in der Delegierung.\n' +
          'Entweder den Scope ergaenzen oder GMAIL_VERIFY_ENABLED=false setzen.');
      }
    } else {
      schreib(HINWEIS + 'GMAIL_VERIFY_ENABLED=false — bei abgerissener Verbindung landet die Mail auf ' +
        'needs_review statt automatisch geklaert zu werden.');
    }
  }

  /* ---------------------------------------------------------- 6. Kampagnen */
  schreib('\n6. Kampagnen');
  const kampagnen = new Sequenzen(cfg.sequenz.verzeichnis).lade();
  const namen = kampagnen.schluessel();

  if (!namen.length) {
    schreib(HINWEIS + 'keine hinterlegt (' + cfg.sequenz.verzeichnis + ')');
  } else {
    for (const schluessel of namen) {
      const s = kampagnen.fuer(schluessel);
      const tage = s.schritte.map((x) => '+' + x.nachTagen + 'd').join(' ');
      schreib(OK + schluessel + ': ' + s.schritte.length + ' Schritte (' + tage + ')' +
        (s.absender ? ', Absender ' + s.absender : ''));

      if (s.absender && !cfg.absender.konten[s.absender]) {
        gescheitert(schluessel + ': Absenderkonto "' + s.absender + '" ist nicht konfiguriert.',
          'In SENDER_ACCOUNTS ergaenzen oder in sequences/' + schluessel + '.js aendern.');
      }

      /* Ein Text, der einen Anhang verspricht, darf nicht ohne ihn
         rausgehen — und das faellt besser hier auf als im Betrieb. */
      for (const schritt of s.schritte) {
        for (const anhang of (schritt.anhaenge || [])) {
          try {
            const geladen = ladeAnhaenge([anhang], cfg.anhang);
            schreib(OK + '  Anhang ' + anhang + ' (' +
              (geladen[0].inhalt.length / 1024).toFixed(0) + ' KB, ' + geladen[0].typ + ')');
          } catch (e) {
            gescheitert(schluessel + ': ' + e.message,
              e.code === 'ANHANG_FEHLT'
                ? 'Den Flyer bauen mit: npm run build:flyer'
                : '');
          }
        }
      }
    }

    /* Der teuerste Fehler in der Kaltakquise: nach einer Antwort weiter
       nachfassen. Das gehoert hier gesagt, nicht erst im Betrieb. */
    if (!cfg.google.verifizieren) {
      if (cfg.sequenz.antwortpruefungPflicht) {
        gescheitert('Nachfassmails koennen nicht verschickt werden: es ist nicht nachzusehen, ob geantwortet wurde.',
          'GMAIL_VERIFY_ENABLED=true setzen und in der domainweiten Delegierung den Scope\n' +
          'gmail.readonly ergaenzen. Alternativ SEQUENCE_REQUIRE_REPLY_CHECK=false — dann gehen\n' +
          'Nachfassmails blind raus und die Abbrueche muessen in HubSpot von Hand gepflegt werden.');
      } else {
        schreib(FEHLER + 'Nachfassmails gehen blind raus: GMAIL_VERIFY_ENABLED ist aus und die');
        schreib('         Antwortpruefung ist abgeschaltet. Wer antwortet, wird trotzdem zweimal');
        schreib('         nachgefasst — es sei denn, Sie pflegen ' + cfg.props.sequenceStatus + ' von Hand.');
      }
    } else {
      schreib(OK + 'Antworten werden erkannt — wer antwortet, bekommt keine Nachfassmail mehr');
    }

    if (cfg.sequenz.einwilligungProperty) {
      schreib(OK + 'Einwilligungssperre aktiv: ' + cfg.sequenz.einwilligungProperty);
    } else {
      schreib(HINWEIS + 'SEQUENCE_CONSENT_PROPERTY ist nicht gesetzt — Kampagnen starten fuer jeden ' +
        'Datensatz mit Haken. Bei Kaltakquise an Unternehmen empfohlen (siehe README).');
    }

    schreib(HINWEIS + (cfg.sequenz.sendefenster
      ? 'Sendefenster ' + cfg.sequenz.sendefenster + ' Uhr an Tagen ' + cfg.sequenz.sendetage.join(',') +
        ' (' + cfg.zeitzone + ')'
      : 'kein Sendefenster — Kampagnenmails gehen auch nachts raus'));

    const abbrueche = Object.keys(cfg.sequenz.abbruchWenn || {});
    schreib(HINWEIS + (abbrueche.length
      ? 'globale Abbruchbedingungen: ' + abbrueche.join(', ')
      : 'keine globalen Abbruchbedingungen (SEQUENCE_STOP_IF)'));
  }

  /* ------------------------------------------------------------ 7. Webhook */
  schreib('\n7. Webhook-Endpunkt');
  if (cfg.server.oeffentlicheUrl) {
    schreib(OK + 'Signatur wird gegen ' + cfg.server.oeffentlicheUrl + cfg.server.webhookPfad + ' geprueft');
  } else {
    schreib(HINWEIS + 'PUBLIC_BASE_URL ist nicht gesetzt. Die URL fuer die Signaturpruefung wird dann aus ' +
      'X-Forwarded-Proto/Host rekonstruiert. Hinter einem Reverse-Proxy sollte sie fest eingetragen werden.');
  }
  schreib(HINWEIS + (cfg.hubspot.clientSecretWebhook ? 'Client-Secret fuer Signatur v3 vorhanden' : 'kein Client-Secret hinterlegt'));
  schreib(HINWEIS + (cfg.server.geteiltesGeheimnis ? 'geteiltes Geheimnis fuer /hubspot/trigger vorhanden' : 'kein geteiltes Geheimnis — /hubspot/trigger antwortet immer mit 401'));

  return abschluss();
}

function abschluss() {
  schreib('');
  if (fehlerZahl) {
    schreib('=== ' + fehlerZahl + ' Punkt' + (fehlerZahl === 1 ? '' : 'e') + ' offen. Der Dienst ist noch nicht startklar. ===\n');
    process.exit(1);
  }
  schreib('=== Alles in Ordnung. Naechster Schritt: npm run send:test -- --to <adresse> ===\n');
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write('\nUnerwarteter Fehler: ' + e.message + '\n' + (e.stack || '') + '\n');
  process.exit(1);
});
