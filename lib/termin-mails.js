/* =============================================================================
 *  Texte und Kalenderdatei fuer Terminbestaetigung und Erinnerungen
 *
 *  Bewusst schlicht gehalten: kein Bild, kein Zaehlpixel, hoechstens ein Link.
 *  Das ist keine Sparsamkeit, sondern Zustellbarkeit — Bildlast und Tracking
 *  sind bei Mails an Erstkontakte ein starkes Spam-Signal, und bei einer
 *  Handvoll Terminen am Tag bringt eine Oeffnungsrate ohnehin keine Erkenntnis.
 *
 *  Umgebungsvariablen
 *    MAIL_FUSSZEILE   optional. Signatur mit Anbieterangaben. Ohne sie steht
 *                     dort nur der Hinweis auf das Impressum.
 *    MAIL_ABSENDERNAME optional, Standard "Benedict Hintz"
 *    SITE_URL         optional, Standard "https://finanz-medizin.com"
 * ========================================================================== */

'use strict';

const STANDARD_SEITE = 'https://finanz-medizin.com';

/* ------------------------------------------------------------ Zeitformate */
function teile(datum, zone) {
  const fmt = new Intl.DateTimeFormat('de-DE', {
    timeZone: zone, weekday: 'long', day: 'numeric', month: 'long',
    year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  });
  const p = {};
  fmt.formatToParts(datum).forEach(function (t) { p[t.type] = t.value; });
  return p;
}

/* "Montag, 22. September 2026 um 14:30 Uhr" */
function langeZeit(datum, zone) {
  const p = teile(datum, zone);
  return p.weekday + ', ' + p.day + '. ' + p.month + ' ' + p.year +
         ' um ' + p.hour + ':' + p.minute + ' Uhr';
}

/* "22. September, 14:30 Uhr" — fuer Betreffzeilen */
function kurzeZeit(datum, zone) {
  const p = teile(datum, zone);
  return p.day + '. ' + p.month + ', ' + p.hour + ':' + p.minute + ' Uhr';
}

function nurUhrzeit(datum, zone) {
  const p = teile(datum, zone);
  return p.hour + ':' + p.minute + ' Uhr';
}

/* ---------------------------------------------------------- Kalenderdatei */
function utcStempel(datum) {
  return datum.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/* Zeilen ueber 75 Oktett muessen nach RFC 5545 umgebrochen werden. Outlook
   verzeiht das, Apple Kalender nicht immer — deshalb korrekt umbrechen. */
function falte(zeile) {
  if (zeile.length <= 74) return zeile;
  const teileListe = [zeile.slice(0, 74)];
  let rest = zeile.slice(74);
  while (rest.length > 73) {
    teileListe.push(' ' + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  if (rest) teileListe.push(' ' + rest);
  return teileListe.join('\r\n');
}

function schuetze(wert) {
  return String(wert == null ? '' : wert)
    .replace(/\\/g, '\\\\').replace(/;/g, '\;')
    .replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function baueIcs(t) {
  const zeilen = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//finanz-medizin.com//Terminbuchung//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + schuetze(t.terminId || (utcStempel(t.start) + '@finanz-medizin.com')),
    'DTSTAMP:' + utcStempel(new Date()),
    'DTSTART:' + utcStempel(t.start),
    'DTEND:' + utcStempel(t.ende),
    falte('SUMMARY:' + schuetze(t.titel || 'Erstgespräch Finanzen & Medizin')),
    falte('DESCRIPTION:' + schuetze(t.beschreibung || '')),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return zeilen.join('\r\n') + '\r\n';
}

/* ----------------------------------------------------------- Bausteine */
function fusszeile(env) {
  const eigene = env && env.MAIL_FUSSZEILE;
  if (eigene) return String(eigene);
  const seite = (env && env.SITE_URL) || STANDARD_SEITE;
  return 'Anbieterangaben: ' + seite + '/impressum.html';
}

function absenderName(env) {
  return (env && env.MAIL_ABSENDERNAME) || 'Benedict Hintz';
}

function anrede(vorname, nachname) {
  const voll = [vorname, nachname].filter(Boolean).join(' ').trim();
  return voll ? 'Guten Tag ' + voll + ',' : 'Guten Tag,';
}

function alsHtml(absaetze, fuss) {
  const inhalt = absaetze.map(function (a) {
    return '<p style="margin:0 0 14px">' + a.replace(/\n/g, '<br>') + '</p>';
  }).join('');
  return '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;' +
         'font-size:15px;line-height:1.55;color:#1a1a1a;max-width:560px">' + inhalt +
         '<hr style="border:0;border-top:1px solid #e3e3e3;margin:22px 0 12px">' +
         '<p style="margin:0;font-size:12px;color:#707070">' +
         fuss.replace(/\n/g, '<br>') + '</p></div>';
}

function baue(absaetze, betreff, env) {
  const fuss = fusszeile(env);
  return {
    betreff: betreff,
    text: absaetze.join('\n\n') + '\n\n--\n' + fuss + '\n',
    html: alsHtml(absaetze, fuss)
  };
}

/* -------------------------------------------------------- Bestaetigung */
function bestaetigung(t, env) {
  const absaetze = [
    anrede(t.vorname, t.nachname),
    'Ihr Termin steht:',
    langeZeit(t.start, t.zone) + '\nDauer: etwa ' + t.dauer + ' Minuten\nTelefonisch — ich rufe Sie an' +
      (t.telefon ? ' unter ' + t.telefon : '') + '.',
    'Im Anhang finden Sie den Termin zum Eintragen in Ihren Kalender. ' +
      'Vor dem Gespräch melde ich mich noch einmal zur Erinnerung.',
    'Passt der Zeitpunkt doch nicht? Antworten Sie einfach auf diese Mail, ' +
      'dann finden wir einen neuen.',
    'Bis dahin\n' + absenderName(env)
  ];
  return baue(absaetze, 'Ihr Termin am ' + kurzeZeit(t.start, t.zone), env);
}

/* --------------------------------------------------------- Erinnerungen */
const ERINNERUNGSTEXTE = {
  '7t': function (t, env) {
    return {
      betreff: 'Nächste Woche: Ihr Termin am ' + kurzeZeit(t.start, t.zone),
      absaetze: [
        anrede(t.vorname, t.nachname),
        'eine kurze Vorerinnerung — wir sprechen nächste Woche:',
        langeZeit(t.start, t.zone) + '\nDauer: etwa ' + t.dauer + ' Minuten',
        'Sollte der Termin nicht mehr passen, geben Sie mir gern jetzt schon ' +
          'Bescheid. Eine Antwort auf diese Mail genügt.',
        'Viele Grüße\n' + absenderName(env)
      ]
    };
  },
  '1t': function (t, env) {
    return {
      betreff: 'Morgen um ' + nurUhrzeit(t.start, t.zone) + ': unser Gespräch',
      absaetze: [
        anrede(t.vorname, t.nachname),
        'wir sprechen morgen:',
        langeZeit(t.start, t.zone) + '\nDauer: etwa ' + t.dauer + ' Minuten',
        'Legen Sie sich gern bereit, was Sie beschäftigt — dann nutzen wir die ' +
          'Zeit gut. Wenn etwas dazwischenkommt, schreiben Sie mir kurz.',
        'Bis morgen\n' + absenderName(env)
      ]
    };
  },
  '3h': function (t, env) {
    return {
      betreff: 'Heute um ' + nurUhrzeit(t.start, t.zone),
      absaetze: [
        anrede(t.vorname, t.nachname),
        'wir sprechen heute um ' + nurUhrzeit(t.start, t.zone) + '.',
        t.telefon
          ? 'Ich rufe Sie unter ' + t.telefon + ' an. Falls Sie da gerade schlecht ' +
            'erreichbar sind, schreiben Sie mir bitte kurz.'
          : 'Ich melde mich pünktlich bei Ihnen.',
        'Bis gleich\n' + absenderName(env)
      ]
    };
  }
};

function erinnerung(stufe, t, env) {
  const bauer = ERINNERUNGSTEXTE[stufe];
  if (!bauer) throw new Error('Unbekannte Erinnerungsstufe: ' + stufe);
  const roh = bauer(t, env);
  return baue(roh.absaetze, roh.betreff, env);
}

module.exports = {
  bestaetigung, erinnerung, baueIcs,
  langeZeit, kurzeZeit, nurUhrzeit, STUFEN_IDS: Object.keys(ERINNERUNGSTEXTE)
};
