/* =============================================================================
 *  Netlify-Adapter für POST /api/fathom
 *
 *  Wie die anderen Adapter enthält diese Datei keine Fachlogik — die steht in
 *  lib/fathom-core.js. Ein Unterschied ist aber wesentlich: Die Signatur wird
 *  über den **rohen** Rumpf gebildet. Er darf hier nicht geparst, umformatiert
 *  oder neu serialisiert werden, sonst stimmt die Prüfsumme nicht mehr.
 *  Deshalb reichen wir event.body unverändert weiter und dekodieren nur, falls
 *  Netlify den Rumpf base64-verpackt hat.
 * ========================================================================== */

'use strict';

const { verarbeiteWebhook } = require('../../lib/fathom-core.js');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Cache-Control': 'no-store' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return raus(405, { ok: false, fehler: 'Nur POST erlaubt.' });
  }

  const roh = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');

  /* Netlify liefert die Kopfzeilen bereits kleingeschrieben; wir verlassen uns
     nicht darauf, sondern normalisieren selbst. */
  const kopfzeilen = {};
  Object.keys(event.headers || {}).forEach(function (name) {
    kopfzeilen[name.toLowerCase()] = event.headers[name];
  });

  try {
    const ergebnis = await verarbeiteWebhook(roh, kopfzeilen, process.env);
    return raus(ergebnis.status, ergebnis.body);
  } catch (err) {
    console.error('fathom: Verarbeitung fehlgeschlagen —', err.message, '|', err.detail || '');
    return raus(502, { ok: false, fehler: 'Verarbeitung fehlgeschlagen.' });
  }
};

function raus(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}
