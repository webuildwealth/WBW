/* =============================================================================
 *  Wiederholungen, Wartezeiten, Tempolimit
 *
 *  Der wichtigste Teil steht in istWiederholbar(): Ein Fehler darf nur dann
 *  wiederholt werden, wenn feststeht, dass die Gegenseite NICHTS getan hat.
 *  Eine saubere HTTP-Antwort (429, 503) belegt das. Eine abgerissene
 *  Verbindung belegt gar nichts — die Anfrage kann angekommen und die Mail
 *  verschickt worden sein, nur die Antwort hat den Rueckweg nicht geschafft.
 *  Solche Faelle bekommen 'unklar' und werden oben behandelt, nicht hier.
 * ========================================================================== */

'use strict';

const schlafe = (ms) => new Promise((fertig) => setTimeout(fertig, ms));

/* Netzfehler, bei denen der Ausgang offen ist. */
const UNKLARE_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNABORTED',
  'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'ABORT_ERR'
]);

/* Netzfehler, bei denen sicher nichts angekommen ist. */
const SICHER_NICHT_ANGEKOMMEN = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT'
]);

/**
 * @returns {'ja'|'nein'|'unklar'}
 *   'ja'     wiederholbar, die Gegenseite hat nichts getan
 *   'nein'   endgueltig gescheitert (falsche Adresse, fehlende Rechte)
 *   'unklar' Ausgang unbekannt — nie blind wiederholen
 */
function istWiederholbar(fehler) {
  if (!fehler) return 'nein';

  /* Antwort mit Statuscode: die Gegenseite hat geantwortet, also weiss sie,
     was sie getan hat — und 4xx/5xx heisst hier: nicht gesendet. */
  if (typeof fehler.status === 'number') {
    if (fehler.status === 429) return 'ja';
    if (fehler.status >= 500 && fehler.status <= 599) return 'ja';
    if (fehler.status === 408) return 'ja';
    return 'nein';
  }

  const code = fehler.code || (fehler.cause && fehler.cause.code) || '';
  if (SICHER_NICHT_ANGEKOMMEN.has(code)) return 'ja';
  if (UNKLARE_CODES.has(code)) return 'unklar';
  if (fehler.name === 'AbortError' || fehler.name === 'TimeoutError') return 'unklar';

  return 'unklar';
}

/** Exponentiell mit Streuung — damit nicht alle Wiederholungen im Gleichschritt laufen. */
function wartezeit(versuch, grund, obergrenze) {
  grund = grund || 2000;
  obergrenze = obergrenze || 60000;
  const basis = Math.min(grund * Math.pow(4, Math.max(0, versuch - 1)), obergrenze);
  return Math.round(basis * (0.75 + Math.random() * 0.5));
}

/* ---------------------------------------------------------- Tempolimit */
/* Token-Bucket. Haelt uns unter den Grenzen von HubSpot (100 Anfragen je
   10 Sekunden) und Gmail, ohne dass irgendwo ein 429 gezaehlt werden muss. */
class Tempolimit {
  constructor(proSekunde, eimergroesse) {
    this.rate = Math.max(0.01, proSekunde);
    this.max = eimergroesse || Math.max(1, Math.ceil(proSekunde));
    this.vorrat = this.max;
    this.zuletzt = Date.now();
  }

  async nimm(anzahl) {
    anzahl = anzahl || 1;
    for (;;) {
      const jetzt = Date.now();
      this.vorrat = Math.min(this.max, this.vorrat + ((jetzt - this.zuletzt) / 1000) * this.rate);
      this.zuletzt = jetzt;

      if (this.vorrat >= anzahl) {
        this.vorrat -= anzahl;
        return;
      }
      await schlafe(Math.ceil(((anzahl - this.vorrat) / this.rate) * 1000) + 10);
    }
  }
}

module.exports = { schlafe, istWiederholbar, wartezeit, Tempolimit };
