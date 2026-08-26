/* =============================================================================
 *  Netlify-Adapter für POST /api/lead
 *
 *  Enthält bewusst keine Fachlogik — die steht in lib/lead-core.js und ist
 *  hosterunabhängig. Hier wird nur das Netlify-Event-Format übersetzt.
 *  Für einen anderen Hoster genügt ein entsprechend kurzer Adapter.
 * ========================================================================== */

'use strict';

const { verarbeiteLead } = require('../../lib/lead-core.js');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Cache-Control': 'no-store' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return raus(405, { ok: false, fehler: 'Nur POST erlaubt.' });
  }

  const ergebnis = await verarbeiteLead(event.body, process.env);
  return raus(ergebnis.status, ergebnis.body);
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
