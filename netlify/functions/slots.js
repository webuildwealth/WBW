/* Netlify-Adapter: GET /api/slots — freie Termine aus Google Kalender. */
'use strict';
const { freieSlots } = require('../../lib/booking-core.js');

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') return raus(405, { ok: false, fehler: 'Nur GET erlaubt.' });
  try {
    const e = await freieSlots(process.env);
    return raus(e.status, e.body);
  } catch (err) {
    console.error('slots: Abruf fehlgeschlagen —', err.message, '|', err.detail || '');
    return raus(502, { ok: false, grund: 'kalender_nicht_erreichbar' });
  }
};

function raus(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Kurz cachen: entlastet bei Lastspitzen, bleibt trotzdem aktuell.
      'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store'
    },
    body: JSON.stringify(body)
  };
}
