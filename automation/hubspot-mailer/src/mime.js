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

/** Eine Message-ID gehoert in spitze Klammern — mit oder ohne kommt sie an. */
function inSpitzklammern(wert) {
  const s = saubereKopfzeile(wert).replace(/[<>\s]/g, '');
  if (!s || s.indexOf('@') === -1) return '';
  return '<' + s + '>';
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

  /* Nachfassmail im selben Verlauf: In-Reply-To nennt die Vorgaengermail,
     References die ganze Kette. Ohne References haengen Mailprogramme die
     Nachricht zwar an, verlieren aber die Reihenfolge — und Gmail nimmt
     die Verlaufskennung beim Versand nur an, wenn beide Zeilen stimmen. */
  if (n.antwortAuf) {
    const bezug = inSpitzklammern(n.antwortAuf);
    if (bezug) {
      kopfzeilen.push(['In-Reply-To', bezug]);

      const kette = String(n.verweise || '')
        .split(/\s+/)
        .map(inSpitzklammern)
        .filter(Boolean);
      if (kette.indexOf(bezug) === -1) kette.push(bezug);

      /* References darf lang werden; mehr als die letzten zehn Glieder
         braucht kein Mailprogramm, und die Kopfzeile bleibt handlich. */
      kopfzeilen.push(['References', kette.slice(-10).join(' ')]);
    }
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

  const anhaenge = (n.anhaenge || []).filter((a) => a && a.inhalt && a.inhalt.length);

  /* Der Textteil bleibt in jedem Fall multipart/alternative: Nur-Text und
     HTML sind zwei Fassungen derselben Nachricht, das Mailprogramm waehlt.
     Kommen Anhaenge dazu, wandert dieser Block unveraendert in ein
     multipart/mixed — Anhaenge sind keine Alternative zum Text, sondern
     etwas daneben. Wer beides in eine Ebene wirft, bekommt Postfaecher, die
     den Anhang anzeigen und den Text verschlucken. */
  const textteil = [
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

  let rumpf;

  if (!anhaenge.length) {
    kopfzeilen.push(['Content-Type', 'multipart/alternative; boundary="' + grenze + '"']);
    rumpf = textteil;
  } else {
    const aussen = 'wbwmix_' + crypto.randomBytes(16).toString('hex');
    kopfzeilen.push(['Content-Type', 'multipart/mixed; boundary="' + aussen + '"']);

    const stuecke = [
      '--' + aussen,
      'Content-Type: multipart/alternative; boundary="' + grenze + '"',
      '',
      textteil
    ];

    for (const anhang of anhaenge) {
      const name = dateinameFeld(anhang.dateiname);
      stuecke.push(
        '--' + aussen,
        'Content-Type: ' + (anhang.typ || 'application/octet-stream') + '; ' + name,
        'Content-Transfer-Encoding: base64',
        'Content-Disposition: attachment; ' + name,
        '',
        base64Puffer(anhang.inhalt),
        ''
      );
    }

    stuecke.push('--' + aussen + '--', '');
    rumpf = stuecke.join(CRLF);
  }

  const kopf = kopfzeilen.map((z) => z[0] + ': ' + z[1]).join(CRLF);

  const objekt = {};
  for (const z of kopfzeilen) objekt[z[0]] = z[1];

  return {
    raw: kopf + CRLF + CRLF + rumpf,
    messageId: messageId,
    kopf: objekt,
    anhaenge: anhaenge.map((a) => a.dateiname)
  };
}

/**
 * Der Dateiname eines Anhangs, in beiden Schreibweisen.
 *
 * filename="…" versteht jedes Programm, vertraegt aber nur ASCII.
 * filename*=UTF-8''… (RFC 2231) traegt Umlaute, kennen aber nicht alle.
 * Beide nebeneinander: Wer 2231 kann, nimmt es; der Rest bekommt eine
 * lesbare Ersatzschreibweise statt eines zerhackten Namens.
 */
function dateinameFeld(roh) {
  const name = saubereKopfzeile(roh).replace(/["\\]/g, '').slice(0, 120) || 'anhang';

  const ascii = name
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .replace(/[^\x20-\x7E]/g, '_');

  const kodiert = encodeURIComponent(name).replace(/[!'()*]/g, (c) =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase());

  return 'filename="' + ascii + '"' +
    (ascii === name ? '' : "; filename*=UTF-8''" + kodiert);
}

/** Wie base64Block, nur fuer Binaerdaten statt Text. */
function base64Puffer(puffer) {
  const b = Buffer.from(puffer).toString('base64');
  const zeilen = [];
  for (let i = 0; i < b.length; i += 76) zeilen.push(b.slice(i, i + 76));
  return zeilen.join(CRLF);
}

/** Die Gmail-API erwartet die Nachricht base64url-kodiert. */
const alsBase64Url = (roh) => Buffer.from(roh, 'utf8').toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

module.exports = {
  baueNachricht, alsBase64Url, istAdresse, saubereKopfzeile,
  kodiereWort, adressfeld, datumsfeld, base64Block, inSpitzklammern,
  dateinameFeld, base64Puffer
};
