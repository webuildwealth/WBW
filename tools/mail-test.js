#!/usr/bin/env node
/* =============================================================================
 *  Einmalige Probe: Kommt eine Mail bei dir an, und stimmt die Domain-Freigabe?
 *
 *  Vor dem ersten Deployment laufen lassen. Das Skript verschickt genau EINE
 *  Mail an eine Adresse, die du angibst — mit dem echten Bestaetigungstext und
 *  der Kalenderdatei im Anhang. Damit pruefst du in einem Durchgang:
 *
 *    - Schluessel und Anbieter stimmen
 *    - die Absenderdomain ist beim Anbieter freigegeben
 *    - DKIM greift (im Posteingang: Kopfzeilen anzeigen, "dkim=pass")
 *    - der Anhang laesst sich in den Kalender uebernehmen
 *
 *  Aufruf
 *    export MAIL_API_KEY="xkeysib-..."
 *    export MAIL_FROM="Benedict Hintz <termine@finanz-medizin.com>"
 *    node tools/mail-test.js deine@adresse.de
 *
 *  Es geht NICHTS an echte Leads. Die Adresse steht im Aufruf.
 * ========================================================================== */

'use strict';

const { versende, mailKonfig } = require('../lib/mail.js');
const { bestaetigung, baueIcs } = require('../lib/termin-mails.js');

function maskiere(wert) {
  const s = String(wert || '');
  if (s.length < 12) return '****';
  return s.slice(0, 8) + '…' + s.slice(-4);
}

async function main() {
  const ziel = process.argv[2];
  if (!ziel || !/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(ziel)) {
    console.error('Aufruf: node tools/mail-test.js deine@adresse.de');
    return 2;
  }

  const k = mailKonfig(process.env);
  if (!k) {
    console.error('\nMAIL_API_KEY und MAIL_FROM muessen gesetzt sein.\n');
    console.error('  export MAIL_API_KEY="xkeysib-..."');
    console.error('  export MAIL_FROM="Benedict Hintz <termine@finanz-medizin.com>"\n');
    return 2;
  }

  console.log('\nKonfiguration');
  console.log('  Anbieter   ' + k.anbieter);
  console.log('  Schluessel ' + maskiere(k.schluessel));
  console.log('  Absender   ' + (k.absender.name ? k.absender.name + ' <' + k.absender.adresse + '>' : k.absender.adresse));
  console.log('  Antwort an ' + (k.antwortAn || '(wie Absender)'));
  console.log('  Ziel       ' + ziel + '\n');

  /* Ein Termin in vier Tagen — nah genug, um im Kalender aufzufallen, weit
     genug weg, um nicht mit echten Terminen verwechselt zu werden. */
  const start = new Date(Date.now() + 4 * 24 * 3600 * 1000);
  start.setMinutes(30, 0, 0);
  const dauer = parseInt(process.env.BOOKING_DURATION_MIN, 10) || 25;
  const ende = new Date(start.getTime() + dauer * 60000);
  const zone = process.env.BOOKING_TIMEZONE || 'Europe/Berlin';

  const daten = {
    vorname: 'Probe', nachname: 'Versand', start: start,
    zone: zone, dauer: dauer, telefon: ''
  };
  const mail = bestaetigung(daten, process.env);

  try {
    const antwort = await versende(process.env, {
      an: ziel, anName: 'Probe Versand',
      betreff: '[Probe] ' + mail.betreff,
      text: mail.text, html: mail.html,
      anhang: {
        name: 'termin.ics',
        typ: 'text/calendar; charset=utf-8; method=PUBLISH',
        inhalt: baueIcs({
          start: start, ende: ende, terminId: 'probe-' + Date.now(),
          titel: '[Probe] Erstgespräch Finanzen & Medizin',
          beschreibung: 'Testeintrag aus tools/mail-test.js — kann gelöscht werden.'
        })
      }
    });

    console.log('Verschickt.' + (antwort && (antwort.messageId || antwort.id)
      ? ' Kennung: ' + (antwort.messageId || antwort.id) : ''));
    console.log('\nJetzt im Posteingang pruefen:');
    console.log('  1. Ist die Mail angekommen — und im Posteingang, nicht im Spam?');
    console.log('  2. Steht als Absender deine Domain, nicht der Anbieter?');
    console.log('  3. Original anzeigen lassen: steht dort "dkim=pass" und "spf=pass"?');
    console.log('  4. Laesst sich termin.ics in den Kalender uebernehmen?\n');
    return 0;
  } catch (e) {
    console.error('\nFehlgeschlagen: ' + e.message);
    if (e.detail) console.error('Antwort des Anbieters:\n  ' + e.detail + '\n');
    if (e.status === 401 || e.status === 403) {
      console.error('Meist der Schluessel — oder er gehoert zu einem anderen Anbieter,');
      console.error('als MAIL_PROVIDER angibt (Standard ist brevo).\n');
    } else if (e.status === 400) {
      console.error('Meist die Absenderdomain: bei Brevo muss finanz-medizin.com unter');
      console.error('Senders, Domains & Dedicated IPs freigegeben und verifiziert sein.\n');
    }
    return 1;
  }
}

main().then(function (code) { process.exit(code); });
