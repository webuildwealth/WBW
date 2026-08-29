/* =============================================================================
 *  Close-CRM — gemeinsame Anbindung
 *
 *  Zwei Wege führen in dieses Modul:
 *    lib/lead-core.js     — jemand hat einen Check ausgefüllt
 *    lib/booking-core.js  — jemand hat direkt einen Termin gebucht
 *
 *  Beide legen im CRM dasselbe an: einen Lead mit Kontakt und eine Notiz, die
 *  den Vorgang lesbar zusammenfasst. Deshalb liegt der gemeinsame Teil hier
 *  und nicht zweimal nebeneinander.
 *
 *  Umgebungsvariablen
 *    CLOSE_API_KEY          Pflicht. Close → Settings → API Keys
 *    CLOSE_LEAD_STATUS_ID   optional, z. B. "stat_..." — sonst Close-Standard
 * ========================================================================== */

'use strict';

const CLOSE_API = 'https://api.close.com/api/v1';

function basicAuth(key) {
  return 'Basic ' + Buffer.from(key + ':').toString('base64');
}

/* Kappt überlange Eingaben, bevor sie ins CRM wandern. */
function kurz(wert, max) {
  return String(wert == null ? '' : wert).trim().slice(0, max || 300);
}

/* Lesender Zugriff. Close beantwortet Suchen über die normale Listen-Route,
   die Abfrage steckt im Query-String — deshalb ein eigener Helfer statt eines
   Schalters in closeRequest. */
async function closeGet(pfad, key) {
  const res = await fetch(CLOSE_API + pfad, {
    headers: {
      'Authorization': basicAuth(key),
      'Accept': 'application/json'
    }
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 400); } catch (e) { /* egal */ }
    const fehler = new Error('Close ' + pfad + ' antwortete ' + res.status);
    fehler.status = res.status;
    fehler.detail = detail;
    throw fehler;
  }
  return res.json();
}

async function closeRequest(pfad, key, payload) {
  const res = await fetch(CLOSE_API + pfad, {
    method: 'POST',
    headers: {
      'Authorization': basicAuth(key),
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 400); } catch (e) { /* egal */ }
    const fehler = new Error('Close ' + pfad + ' antwortete ' + res.status);
    fehler.status = res.status;
    fehler.detail = detail;
    throw fehler;
  }
  return res.json();
}

/**
 * Legt einen Lead samt Kontakt an und hängt eine Notiz daran.
 *
 * Die Notiz wird bewusst separat gesendet und ihr Fehlschlag verschluckt:
 * Ein Lead ohne Notiz ist ein kleiner Verlust, ein verlorener Lead ein großer.
 *
 * @returns {Promise<string>} die Lead-ID
 */
async function legeLeadAn(key, lead, notiz) {
  const angelegt = await closeRequest('/lead/', key, lead);

  if (notiz) {
    try {
      await closeRequest('/activity/note/', key, { lead_id: angelegt.id, note: notiz });
    } catch (e) {
      console.error('close: Notiz konnte nicht angelegt werden —', e.message);
    }
  }
  return angelegt.id;
}

/**
 * Baut das Lead-Objekt aus den Kontaktdaten.
 * In Close ist ein Lead die Organisation — deshalb steht der Praxisname vorn,
 * wenn es einen gibt, sonst der Personenname, damit die Liste lesbar bleibt.
 */
function baueLead(d, beschreibung, env) {
  const person = (kurz(d.vorname, 80) + ' ' + kurz(d.nachname, 80)).trim();
  const praxis = kurz(d.praxis, 160);
  const telefon = kurz(d.telefon, 60);

  const lead = {
    name: praxis || person,
    description: beschreibung,
    contacts: [{
      name: person,
      emails: [{ type: 'office', email: kurz(d.email, 200).toLowerCase() }],
      phones: telefon ? [{ type: 'office', phone: telefon }] : []
    }]
  };

  if (env && env.CLOSE_LEAD_STATUS_ID) lead.status_id = env.CLOSE_LEAD_STATUS_ID;
  return lead;
}

module.exports = { CLOSE_API, basicAuth, kurz, closeGet, closeRequest, legeLeadAn, baueLead };
