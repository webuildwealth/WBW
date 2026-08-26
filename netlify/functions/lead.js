/* =============================================================================
 *  POST /api/lead  →  Close CRM
 *
 *  Nimmt die Funnel-Absendung entgegen und legt in Close einen Lead mit Kontakt
 *  und einer Notiz an, die alle Antworten im Klartext enthält.
 *
 *  Der API-Key liegt ausschließlich hier serverseitig in einer Netlify-
 *  Umgebungsvariablen. Er darf niemals ins Frontend gelangen: Ein Close-Key
 *  erlaubt Vollzugriff auf das gesamte CRM.
 *
 *  Umgebungsvariablen
 *    CLOSE_API_KEY          Pflicht. Close → Settings → API Keys
 *    CLOSE_LEAD_STATUS_ID   optional, z. B. "stat_..." — sonst Close-Standard
 *    CLOSE_CUSTOM_FIELDS    optional, JSON-Mapping Funnel-Feld → Close-Feld-ID,
 *                           z. B. {"funnel":"cf_abc123","praxisform":"cf_def456"}
 * ========================================================================== */

'use strict';

const CLOSE_API = 'https://api.close.com/api/v1';

/* Diese Schlüssel haben eine feste Bedeutung; alles andere sind Funnel-Antworten
   und wandert generisch in die Notiz — so funktionieren alle drei Funnels ohne
   Sonderbehandlung. */
const RESERVIERT = new Set([
  'funnel', 'vorname', 'nachname', 'praxis', 'email', 'telefon',
  'erreichbarkeit', 'geburtsjahr', 'einwilligung', 'kampagne',
  'seite', 'verweis', 'dauer_sek', 'zeitpunkt', 'website', '_labels'
]);

const FUNNEL_TITEL = {
  'praxisinhaber': 'Praxis-Check',
  'angestellte-aerzte': 'Vermögens-Check',
  'mfa-praxisteam': 'Vorsorge-Check'
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

const antwort = (status, body) => ({
  statusCode: status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  },
  body: JSON.stringify(body)
});

/* Kappt überlange Eingaben, bevor sie ins CRM wandern. */
function kurz(wert, max) {
  return String(wert == null ? '' : wert).trim().slice(0, max || 300);
}

function basicAuth(key) {
  return 'Basic ' + Buffer.from(key + ':').toString('base64');
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

/* Baut die Notiz: erst die Funnel-Antworten, dann Kontakt und Herkunft. */
function baueNotiz(d, antworten) {
  const zeilen = [];
  const titel = FUNNEL_TITEL[d.funnel] || d.funnel || 'Anfrage';
  zeilen.push('=== ' + titel + ' über finanz-medizin.com ===', '');

  if (antworten.length) {
    zeilen.push('ANGABEN AUS DEM CHECK');
    antworten.forEach(function (a) {
      zeilen.push('  • ' + a.feld + ': ' + a.wert);
    });
    zeilen.push('');
  }

  zeilen.push('KONTAKT');
  if (d.praxis) zeilen.push('  • Praxis: ' + d.praxis);
  if (d.geburtsjahr) zeilen.push('  • Geburtsjahr: ' + d.geburtsjahr);
  if (d.erreichbarkeit) zeilen.push('  • Erreichbarkeit: ' + d.erreichbarkeit);
  zeilen.push('  • Einwilligung Kontaktaufnahme: ' + (d.einwilligung || 'nein'));
  zeilen.push('');

  zeilen.push('HERKUNFT');
  zeilen.push('  • Landingpage: ' + (d.seite || '—'));
  if (d.verweis) zeilen.push('  • Verweis: ' + d.verweis);
  if (d.kampagne) {
    let kampagne = String(d.kampagne);
    try {
      const k = JSON.parse(kampagne);
      kampagne = Object.keys(k).map(function (n) { return n + '=' + k[n]; }).join(', ');
    } catch (e) { /* kein JSON — dann eben roh */ }
    if (kampagne) zeilen.push('  • Kampagne: ' + kampagne);
  }
  if (d.dauer_sek) zeilen.push('  • Ausfülldauer: ' + d.dauer_sek + ' Sekunden');
  zeilen.push('  • Zeitpunkt: ' + (d.zeitpunkt || new Date().toISOString()));

  return zeilen.join('\n');
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return antwort(204, {});
  if (event.httpMethod !== 'POST') {
    return antwort(405, { ok: false, fehler: 'Nur POST erlaubt.' });
  }

  const key = process.env.CLOSE_API_KEY;
  if (!key) {
    console.error('lead: CLOSE_API_KEY ist nicht gesetzt');
    return antwort(500, { ok: false, fehler: 'Konfiguration unvollständig.' });
  }

  /* ------------------------------------------------------------- Eingabe */
  let d;
  try {
    d = JSON.parse(event.body || '{}');
  } catch (e) {
    return antwort(400, { ok: false, fehler: 'Ungültiges JSON.' });
  }

  // Honeypot: Menschen sehen dieses Feld nicht. Bots füllen es aus.
  // Wir antworten mit 200, damit der Bot keinen Fehler zum Nachjustieren bekommt.
  if (kurz(d.website, 50)) return antwort(200, { ok: true });

  const email = kurz(d.email, 200).toLowerCase();
  const vorname = kurz(d.vorname, 80);
  const nachname = kurz(d.nachname, 80);

  if (!EMAIL_RE.test(email)) {
    return antwort(400, { ok: false, fehler: 'E-Mail-Adresse ist ungültig.' });
  }
  if (!vorname || !nachname) {
    return antwort(400, { ok: false, fehler: 'Name fehlt.' });
  }
  if (kurz(d.einwilligung, 10).toLowerCase() !== 'ja') {
    return antwort(400, { ok: false, fehler: 'Ohne Einwilligung dürfen wir die Daten nicht verarbeiten.' });
  }

  /* ------------------------------------------------------ Antworten sammeln */
  const labels = (d._labels && typeof d._labels === 'object') ? d._labels : {};
  const antworten = [];
  Object.keys(d).forEach(function (k) {
    if (RESERVIERT.has(k)) return;
    const wert = kurz(d[k], 500);
    if (!wert) return;
    const feld = kurz(labels[k], 80) || (k.charAt(0).toUpperCase() + k.slice(1));
    antworten.push({ schluessel: k, feld: feld, wert: wert });
  });

  /* ------------------------------------------------------------ Close-Lead */
  const personName = (vorname + ' ' + nachname).trim();
  const praxis = kurz(d.praxis, 160);
  const telefon = kurz(d.telefon, 60);
  const funnel = kurz(d.funnel, 60);

  const lead = {
    // In Close ist ein Lead die Organisation. Praxisname, wenn vorhanden —
    // sonst der Personenname, damit die Liste lesbar bleibt.
    name: praxis || personName,
    description: (FUNNEL_TITEL[funnel] || 'Anfrage') + ' über finanz-medizin.com',
    contacts: [{
      name: personName,
      emails: [{ type: 'office', email: email }],
      phones: telefon ? [{ type: 'office', phone: telefon }] : []
    }]
  };

  if (process.env.CLOSE_LEAD_STATUS_ID) {
    lead.status_id = process.env.CLOSE_LEAD_STATUS_ID;
  }

  // Optionales Mapping auf echte Close-Custom-Fields, falls hinterlegt.
  if (process.env.CLOSE_CUSTOM_FIELDS) {
    try {
      const mapping = JSON.parse(process.env.CLOSE_CUSTOM_FIELDS);
      const quelle = {};
      antworten.forEach(function (a) { quelle[a.schluessel] = a.wert; });
      quelle.funnel = funnel;
      quelle.seite = kurz(d.seite, 200);
      quelle.kampagne = kurz(d.kampagne, 300);
      quelle.erreichbarkeit = kurz(d.erreichbarkeit, 100);

      Object.keys(mapping).forEach(function (feld) {
        const id = mapping[feld];
        if (quelle[feld] && /^cf_[A-Za-z0-9]+$/.test(id)) {
          lead['custom.' + id] = quelle[feld];
        }
      });
    } catch (e) {
      console.error('lead: CLOSE_CUSTOM_FIELDS ist kein gültiges JSON');
    }
  }

  /* --------------------------------------------------------------- Senden */
  try {
    const angelegt = await closeRequest('/lead/', key, lead);

    // Die Notiz separat: Schlägt sie fehl, ist der Lead trotzdem im CRM.
    try {
      await closeRequest('/activity/note/', key, {
        lead_id: angelegt.id,
        note: baueNotiz(d, antworten)
      });
    } catch (e) {
      console.error('lead: Notiz konnte nicht angelegt werden —', e.message);
    }

    return antwort(200, { ok: true, lead_id: angelegt.id });

  } catch (e) {
    // Bewusst ohne personenbezogene Daten, damit die Funktionslogs sauber bleiben.
    console.error('lead: Anlage in Close fehlgeschlagen —', e.message, '|', e.detail || '');
    return antwort(502, { ok: false, fehler: 'CRM nicht erreichbar.' });
  }
};
