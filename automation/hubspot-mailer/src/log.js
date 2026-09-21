/* =============================================================================
 *  Protokoll
 *
 *  Eine Zeile JSON je Ereignis auf stdout — von journalctl, Docker, Loki oder
 *  CloudWatch gleichermassen lesbar, ohne Parser.
 *
 *  Zwei Regeln, die hier hart verdrahtet sind:
 *    1. Der Text einer Mail taucht im Protokoll nie auf. Nicht gekuerzt,
 *       nicht gehasht, gar nicht.
 *    2. Adressen stehen maskiert da (m***@finanz-medizin.com). Fuer die Suche
 *       nach "an wen ging das" reicht das; fuer ein Datenleck nicht.
 *
 *  Nachvollziehbar bleibt trotzdem alles, was die Anforderung verlangt:
 *  Zeitpunkt, Objekt, Datensatz-ID, Send-ID, Versuch, Ergebnis, Fehler.
 * ========================================================================== */

'use strict';

const fs = require('fs');

const STUFEN = { debug: 10, info: 20, warn: 30, error: 40 };

/* Felder, deren Inhalt niemals ins Protokoll gehoert — egal wie sie
   hereingereicht werden. */
const GEHEIM = /^(authorization|token|access_token|refresh_token|client_secret|private_key|password|secret|signature|raw|body|html|text)$/i;

/* Sieht ein Wert wie ein Schluessel aus, wird er auch dann unkenntlich
   gemacht, wenn er unter einem harmlosen Feldnamen steht. */
const SCHLUESSELMUSTER = [
  /pat-[a-z0-9]{2,4}-[A-Za-z0-9-]{8,}/gi,
  /\bya29\.[A-Za-z0-9._-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g
];

function entschaerfe(wert) {
  let s = String(wert);
  for (const muster of SCHLUESSELMUSTER) s = s.replace(muster, '[entfernt]');
  return s;
}

/** m***@finanz-medizin.com — Domain bleibt lesbar, der Name nicht. */
function maskiereAdresse(adresse) {
  const s = String(adresse || '').trim();
  const at = s.lastIndexOf('@');
  if (at < 1) return s ? '[adresse]' : '';
  const name = s.slice(0, at);
  const domain = s.slice(at + 1);
  const sichtbar = name.length <= 1 ? name : name.charAt(0);
  return sichtbar + '***@' + domain;
}

let einstellungen = { stufe: 'info', datei: '', betreffLoggen: false };
let dateiGriff = null;

function richteEin(protokollKonfig) {
  einstellungen = {
    stufe: (protokollKonfig && protokollKonfig.stufe) || 'info',
    datei: (protokollKonfig && protokollKonfig.datei) || '',
    betreffLoggen: !!(protokollKonfig && protokollKonfig.betreffLoggen)
  };
  if (dateiGriff !== null) {
    try { fs.closeSync(dateiGriff); } catch (e) { /* egal */ }
    dateiGriff = null;
  }
  if (einstellungen.datei) {
    try {
      dateiGriff = fs.openSync(einstellungen.datei, 'a');
    } catch (e) {
      process.stderr.write('Protokolldatei nicht beschreibbar: ' + e.message + '\n');
    }
  }
}

function saeubere(daten) {
  const raus = {};
  if (!daten || typeof daten !== 'object') return raus;

  for (const schluessel of Object.keys(daten)) {
    if (GEHEIM.test(schluessel)) continue;
    const wert = daten[schluessel];
    if (wert === undefined || wert === null) continue;

    if (schluessel === 'recipient' || schluessel === 'to' || schluessel === 'from' || schluessel === 'email') {
      raus[schluessel] = maskiereAdresse(wert);
    } else if (schluessel === 'subject' && !einstellungen.betreffLoggen) {
      raus.subject_len = String(wert).length;
    } else if (typeof wert === 'string') {
      raus[schluessel] = entschaerfe(wert).slice(0, 500);
    } else if (typeof wert === 'number' || typeof wert === 'boolean') {
      raus[schluessel] = wert;
    } else if (Array.isArray(wert)) {
      raus[schluessel] = wert.slice(0, 20).map((w) => (typeof w === 'string' ? entschaerfe(w).slice(0, 200) : w));
    } else {
      raus[schluessel] = saeubere(wert);
    }
  }
  return raus;
}

function schreibe(stufe, ereignis, daten) {
  if (STUFEN[stufe] < (STUFEN[einstellungen.stufe] || 20)) return;

  const zeile = JSON.stringify(Object.assign(
    { ts: new Date().toISOString(), level: stufe, event: ereignis },
    saeubere(daten)
  )) + '\n';

  if (stufe === 'error') process.stderr.write(zeile);
  else process.stdout.write(zeile);

  if (dateiGriff !== null) {
    try { fs.writeSync(dateiGriff, zeile); } catch (e) { /* Protokoll darf nie der Grund sein, dass etwas stehen bleibt */ }
  }
}

const log = {
  richteEin: richteEin,
  debug: (ereignis, daten) => schreibe('debug', ereignis, daten),
  info: (ereignis, daten) => schreibe('info', ereignis, daten),
  warn: (ereignis, daten) => schreibe('warn', ereignis, daten),
  error: (ereignis, daten) => schreibe('error', ereignis, daten),
  maskiereAdresse: maskiereAdresse,
  entschaerfe: entschaerfe
};

module.exports = log;
