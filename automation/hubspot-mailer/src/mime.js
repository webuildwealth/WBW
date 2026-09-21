/* =============================================================================
 *  Die Nachricht selbst (RFC 5322 / MIME)
 *
 *  Warum von Hand und nicht mit nodemailer: Die Gmail-API will ohnehin nur die
 *  fertige Nachricht als base64url. Dafuer eine Abhaengigkeit samt Lieferkette
 *  ins Haus zu holen, lohnt sich nicht — es sind dreihundert Zeilen, die sich
 *  vollstaendig testen lassen.
 *
 *  Zwei Dinge, die hier wirklich zaehlen:
 *
 *  Umlaute. Betreff und Absendername muessen nach RFC 2047 kodiert werden,
 *  sonst steht beim Empfaenger "Ihr Gespr=?ch". Die Kodierung schneidet an
 *  Zeichengrenzen, nicht an Byte-Grenzen — sonst zerfaellt ein "ü" in zwei
 *  halbe Bytes und der Client zeigt ein Fragezeichen.
 *
 *  Header-Injection. Der Betreff kommt aus einem CRM-Feld, in das Menschen
 *  tippen. Ein Zeilenumbruch darin waere ein zusaetzlicher Kopfzeilenbereich —
 *  damit liesse sich ein Bcc anhaengen. saubereKopfzeile() entfernt CR und LF
 *  ausnahmslos, bevor irgendetwas in den Kopf geschrieben wird.
 * ========================================================================== */

'use strict';

const crypto = require('crypto');

const CRLF = '\r\n';

/* Absichtlich streng: keine Quoted-Strings, keine Kommentare, keine
   IP-Literale. Wer so etwas als Empfaenger hinterlegt, hat sich vertippt. */
const ADRESSE_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64}@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

function istAdresse(wert) {
  const s = String(wert || '').trim();
  if (s.length < 6 || s.length > 254) return false;
  if (s.indexOf('..') !== -1) return false;
  return ADRESSE_RE.test(s);
}

/* CR, LF und die beiden Unicode-Zeilentrenner. Ueber Zeichencodes gebaut,
   damit in dieser Datei kein echter Zeilentrenner steht. */
const ZEILENTRENNER = new RegExp('[\\r\\n\\u2028\\u2029]+', 'g');

/** Alles, was eine neue Kopfzeile eroeffnen koennte, faellt weg. */
function saubereKopfzeile(wert) {
  return String(wert == null ? '' : wert)
    .replace(ZEILENTRENNER, ' ')
    .replace(/\u0000/g, '')
    .trim();
}

const nurAscii = (s) => !/[^\x20-\x7E]/.test(s);

/**
 * RFC 2047, Base64-Variante. Schneidet an Zeichengrenzen und haelt jedes
 * kodierte Wort unter 75 Zeichen, wie der Standard es verlangt.
 */
function kodiereWort(wert) {
  const s = saubereKopfzeile(wert);
  if (!s) return '';
  if (nurAscii(s) && s.length <= 70) return s;

  /* "=?UTF-8?B?" + "?=" sind 12 Zeichen; 45 Rohbytes ergeben 60 Base64-Zeichen,
     zusammen 72 — mit Reserve unter der Grenze von 75. 45 ist durch 3 teilbar,
     dadurch entsteht in keinem Teilstueck eine Auffuellung. */
  const teile = [];
  let puffer = Buffer.alloc(0);

  for (const zeichen of s) {
    const b = Buffer.from(zeichen, 'utf8');
    if (puffer.length + b.length > 45) {
      teile.push(puffer);
      puffer = Buffer.alloc(0);
    }
    puffer = Buffer.concat([puffer, b]);
  }
  if (puffer.length) teile.push(puffer);

  return teile
    .map((t) => '=?UTF-8?B?' + t.toString('base64') + '?=')
    .join(CRLF + ' ');
}

/** "Finanz & Medizin" <info@...> — mit korrekter Behandlung von Umlauten. */
function adressfeld(adresse, anzeigename) {
  const mail = saubereKopfzeile(adresse).toLowerCase();
  const name = saubereKopfzeile(anzeigename);
  if (!name) return mail;

  if (nurAscii(name)) {
    /* Sonderzeichen aus RFC 5322 erzwingen Anfuehrungszeichen. */
    const gequotet = '"' + name.replace(/([\\"])/g, '\\$1') + '"';
    return gequotet + ' <' + mail + '>';
  }
  /* Kodierte Woerter duerfen nicht in Anfuehrungszeichen stehen. */
  return kodiereWort(name) + ' <' + mail + '>';
}

/** Base64 in Zeilen zu 76 Zeichen, wie MIME es vorschreibt. */
function base64Block(text) {
  const b = Buffer.from(text, 'utf8').toString('base64');
  const zeilen = [];
  for (let i = 0; i < b.length; i += 76) zeilen.push(b.slice(i, i + 76));
  return zeilen.join(CRLF);
}

/** RFC-5322-Datum, immer mit numerischer Zone. */
function datumsfeld(datum, zeitzone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: zeitzone || 'UTC', hour12: false, weekday: 'short',
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZoneName: 'longOffset'
  });

  const t = {};
  for (const p of fmt.formatToParts(datum)) if (p.type !== 'literal') t[p.type] = p.value;

  /* "GMT+02:00" -> "+0200" */
  const zone = String(t.timeZoneName || 'GMT+00:00').replace(/^GMT/, '').replace(':', '') || '+0000';

  return t.weekday + ', ' + t.day + ' ' + t.month + ' ' + t.year + ' ' +
         t.hour + ':' + t.minute + ':' + t.second + ' ' + (zone === '' ? '+0000' : zone);
}

/**
 * Baut die vollstaendige Nachricht.
 *
 * @param {object} n
 *   von            {email, name}
 *   an             Empfaengeradresse
 *   antwortAn      optional
 *   bcc            optional, Komma-getrennt
 *   betreff        Klartext
 *   html           HTML-Teil
 *   text           Nur-Text-Teil
 *   sendId         unsere Send-ID — geht als eigener Kopfzeileneintrag mit
 *   messageIdHost  Domain fuer die Message-ID
 *   zeitzone       fuer das Date-Feld
 * @returns {{raw:string, messageId:string, kopf:object}}
 */
function baueNachricht(n) {
  if (!istAdresse(n.an)) {
    const f = new Error('Empfaengeradresse ist ungueltig');
    f.code = 'EMPFAENGER_UNGUELTIG';
    throw f;
  }
  if (!istAdresse(n.von && n.von.email)) {
    const f = new Error('Absenderadresse ist ungueltig');
    f.code = 'ABSENDER_UNGUELTIG';
    throw f;
  }

  const betreff = saubereKopfzeile(n.betreff);
  if (!betreff) {
    const f = new Error('Betreff ist leer');
    f.code = 'BETREFF_LEER';
    throw f;
  }

  const host = n.messageIdHost || String(n.von.email).split('@')[1] || 'localhost';
  const messageId = '<' + (n.sendId || crypto.randomUUID()) + '@' + host + '>';
  const grenze = 'wbw_' + crypto.randomBytes(16).toString('hex');

  const kopfzeilen = [
    ['MIME-Version', '1.0'],
    ['Date', datumsfeld(n.datum || new Date(), n.zeitzone)],
    ['Message-ID', messageId],
    ['From', adressfeld(n.von.email, n.von.name)],
    ['To', adressfeld(n.an, n.anName)],
    ['Subject', kodiereWort(betreff)]
  ];

  if (n.antwortAn && istAdresse(n.antwortAn)) {
    kopfzeilen.push(['Reply-To', adressfeld(n.antwortAn, n.von.name)]);
  }

  if (n.bcc) {
    const adressen = String(n.bcc).split(',').map((a) => a.trim()).filter(istAdresse);
    if (adressen.length) kopfzeilen.push(['Bcc', adressen.join(', ')]);
  }

  /* Die Send-ID als eigene Kopfzeile: Damit laesst sich im Postausgang
     zweifelsfrei nachsehen, ob eine bestimmte Mail wirklich raus ist —
     unabhaengig davon, ob Gmail die Message-ID durch eine eigene ersetzt. */
  if (n.sendId) {
    kopfzeilen.push(['X-Automation-Send-Id', saubereKopfzeile(n.sendId)]);
    kopfzeilen.push(['X-Automation-Source', 'hubspot-mailer']);
  }
  if (n.objectRef) kopfzeilen.push(['X-Automation-Record', saubereKopfzeile(n.objectRef)]);

  /* Automatisch erzeugte Post gehoert markiert: Abwesenheitsnotizen und
     andere Automaten antworten darauf nicht, das erspart Schleifen. */
  kopfzeilen.push(['Auto-Submitted', 'auto-generated']);
  kopfzeilen.push(['Content-Type', 'multipart/alternative; boundary="' + grenze + '"']);

  const kopf = kopfzeilen.map((z) => z[0] + ': ' + z[1]).join(CRLF);

  const teile = [
    '--' + grenze,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Block(n.text || ''),
    '',
    '--' + grenze,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Block(n.html || ''),
    '',
    '--' + grenze + '--',
    ''
  ].join(CRLF);

  const objekt = {};
  for (const z of kopfzeilen) objekt[z[0]] = z[1];

  return { raw: kopf + CRLF + CRLF + teile, messageId: messageId, kopf: objekt };
}

/** Die Gmail-API erwartet die Nachricht base64url-kodiert. */
const alsBase64Url = (roh) => Buffer.from(roh, 'utf8').toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

module.exports = {
  baueNachricht, alsBase64Url, istAdresse, saubereKopfzeile,
  kodiereWort, adressfeld, datumsfeld, base64Block
};
