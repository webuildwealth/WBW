/* Netlify-Adapter: POST /api/booking — Termin in Google Kalender anlegen. */
'use strict';
const { bucheTermin } = require('../../lib/booking-core.js');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, body: '' };
  if (event.httpMethod !== 'POST') return raus(405, { ok: false, fehler: 'Nur POST erlaubt.' });
  try {
    const e = await bucheTermin(event.body, process.env);
    return raus(e.status, e.body);
  } catch (err) {
    console.error('booking: Anlage fehlgeschlagen —', err.message, '|', err.detail || '');
    return raus(502, { ok: false, fehler: 'Kalender nicht erreichbar.' });
  }
};

function raus(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}
