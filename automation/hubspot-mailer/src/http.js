/* =============================================================================
 *  HTTP mit Zeitgrenze
 *
 *  Duenne Schicht um fetch(): harte Zeitgrenze, Fehler mit Status und
 *  gekuerztem Antworttext, damit die Aufrufer oben nicht jedes Mal dasselbe
 *  Geruest bauen. Antworttexte werden auf 500 Zeichen geschnitten — Google und
 *  HubSpot schicken im Fehlerfall gern ganze HTML-Seiten.
 * ========================================================================== */

'use strict';

async function anfrage(url, optionen) {
  optionen = optionen || {};
  const zeitgrenze = optionen.timeoutMs || 15000;
  const abbruch = new AbortController();
  const uhr = setTimeout(() => abbruch.abort(), zeitgrenze);

  let antwort;
  try {
    antwort = await fetch(url, {
      method: optionen.method || 'GET',
      headers: optionen.headers || {},
      body: optionen.body,
      signal: abbruch.signal
    });
  } catch (e) {
    clearTimeout(uhr);
    const f = new Error('Verbindung zu ' + kurzeUrl(url) + ' fehlgeschlagen: ' + e.message);
    f.code = e.code || (e.cause && e.cause.code) || e.name;
    f.cause = e;
    /* Kein f.status — genau daran erkennt retry.js, dass der Ausgang offen ist. */
    throw f;
  } finally {
    clearTimeout(uhr);
  }

  const roh = await antwort.text();

  if (!antwort.ok) {
    const f = new Error(kurzeUrl(url) + ' antwortete ' + antwort.status);
    f.status = antwort.status;
    f.detail = roh.slice(0, 500);
    f.retryAfter = parseInt(antwort.headers.get('retry-after') || '', 10) || 0;
    try { f.daten = JSON.parse(roh); } catch (e) { /* kein JSON, dann eben nicht */ }
    throw f;
  }

  if (!roh) return null;
  try {
    return JSON.parse(roh);
  } catch (e) {
    return roh;
  }
}

/* Ohne Query-String: dort stehen manchmal Tokens. */
function kurzeUrl(url) {
  const s = String(url);
  const frage = s.indexOf('?');
  return frage === -1 ? s : s.slice(0, frage);
}

module.exports = { anfrage, kurzeUrl };
