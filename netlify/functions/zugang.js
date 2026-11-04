/* =============================================================================
 *  Netlify-Adapter für POST /api/zugang (Cashflow-Rechner)
 *  Fachlogik steht in lib/zugang-core.js.
 * ========================================================================== */

'use strict';

const { verarbeiteZugang } = require('../../lib/zugang-core.js');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Cache-Control': 'no-store' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return raus(405, { ok: false, fehler: 'Nur POST erlaubt.' });
  }
  const ergebnis = await verarbeiteZugang(event.body, process.env);
  return raus(ergebnis.status, ergebnis.body);
};

function raus(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex'
    },
    body: JSON.stringify(body)
  };
}
