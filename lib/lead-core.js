/* =============================================================================
 *  Lead-Verarbeitung — hosterunabhängiger Kern
 *
 *  Enthält die gesamte Logik: Eingaben prüfen, Close-Lead und Notiz bauen,
 *  an die Close-API senden. Kennt weder Netlify noch Base44 noch sonst eine
 *  Plattform — sie bekommt nur den Anfrage-Body und die Umgebungsvariablen und
 *  gibt { status, body } zurück.
 *
 *  Der Adapter der jeweiligen Plattform übersetzt das in deren Format:
 *    netlify/functions/lead.js   → Netlify Functions
 *
 *  Wechselt der Hoster, wird nur ein neuer Adapter geschrieben; an dieser Datei
 *  ändert sich nichts.
 *
 *  Umgebungsvariablen
 *    CLOSE_API_KEY          Pflicht. Close → Settings → API Keys
 *    CLOSE_LEAD_STATUS_ID   optional, z. B. "stat_..." — sonst Close-Standard
 *    CLOSE_CUSTOM_FIELDS    optional, JSON-Mapping Funnel-Feld → Close-Feld-ID
 * ========================================================================== */

'use strict';

const { kurz, closeRequest, legeLeadAn, baueLead } = require('./close.js');

/* Diese Schlüssel haben eine feste Bedeutung; alles andere sind Funnel-Antworten
   und wandert generisch in die Notiz — so funktionieren alle drei Funnels ohne
   Sonderbehandlung. */
const RESERVIERT = new Set([
  'funnel', 'vorname', 'nachname', 'praxis', 'email', 'telefon',
  'erreichbarkeit', 'geburtsjahr', 'einwilligung', 'kampagne',
  'seite', 'verweis', 'dauer_sek', 'zeitpunkt', 'website', '_labels',
  /* Die Wunschzeiten aus beratung.html. Sie stehen nicht zwischen den
     Antworten, sondern bekommen einen eigenen Abschnitt: Wer die Notiz
     öffnet, um zurückzurufen, sucht genau diese Zeile. */
  'terminwuensche'
]);

const FUNNEL_TITEL = {
  'praxisinhaber': 'Praxis-Check',
  'angestellte-aerzte': 'Vermögens-Check',
  'mfa-praxisteam': 'Vorsorge-Check',
  /* beratung.html. Dort wird normalerweise direkt ein Termin gebucht; über
     diesen Weg kommt die Anfrage nur, wenn der Kalender nicht erreichbar ist
     und statt der Uhrzeit nach der Erreichbarkeit gefragt wurde. */
  'instagram': 'Anfrage aus dem Kurzcheck'
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

const antwort = (status, body) => ({ status: status, body: body });

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

  if (d.terminwuensche) {
    zeilen.push('WANN ZURÜCKRUFEN');
    kurz(d.terminwuensche, 400).split(' · ').forEach(function (zeit) {
      if (zeit.trim()) zeilen.push('  • ' + zeit.trim());
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

/**
 * Verarbeitet eine Funnel-Absendung.
 * @param {string|object} body  Roher JSON-Body oder bereits geparstes Objekt
 * @param {object} env          Umgebungsvariablen (process.env oder Deno.env.toObject())
 * @returns {Promise<{status:number, body:object}>}
 */
async function verarbeiteLead(body, env) {
  env = env || {};
  const key = env.CLOSE_API_KEY;
  if (!key) {
    console.error('lead: CLOSE_API_KEY ist nicht gesetzt');
    return antwort(500, { ok: false, fehler: 'Konfiguration unvollständig.' });
  }

  /* ------------------------------------------------------------- Eingabe */
  let d;
  try {
    d = (typeof body === 'string') ? JSON.parse(body || '{}') : (body || {});
  } catch (e) {
    return antwort(400, { ok: false, fehler: 'Ungültiges JSON.' });
  }

  // Honeypot: Menschen sehen dieses Feld nicht. Bots füllen es aus.
  // Wir antworten mit 200, damit der Bot keinen Fehler zum Nachjustieren bekommt.
  if (kurz(d.website, 50)) return antwort(200, { ok: true });

  const email = kurz(d.email, 200).toLowerCase();
  const vorname = kurz(d.vorname, 80);
  const nachname = kurz(d.nachname, 80);
  const telefon = kurz(d.telefon, 60);

  if (!EMAIL_RE.test(email)) {
    return antwort(400, { ok: false, fehler: 'E-Mail-Adresse ist ungültig.' });
  }
  if (!vorname || !nachname) {
    return antwort(400, { ok: false, fehler: 'Name fehlt.' });
  }
  /* Telefon ist Pflicht, nicht nur im Formular. Jeder Funnel verlangt es
     bereits im Browser (data-required), aber eine Prüfung im Browser ist
     keine Prüfung: Wer die Anfrage von Hand zusammensetzt, kommt sonst ohne
     Nummer durch — und ein Lead ohne Rückrufnummer ist für ein Erstgespräch
     am Telefon nur die halbe Adresse. Sechs Zeichen ist die gleiche
     Untergrenze, die die Formulare ansetzen. */
  if (telefon.length < 6) {
    return antwort(400, { ok: false, fehler: 'Telefonnummer fehlt oder ist zu kurz.' });
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
  const funnel = kurz(d.funnel, 60);

  const lead = baueLead(
    d, (FUNNEL_TITEL[funnel] || 'Anfrage') + ' über finanz-medizin.com', env
  );

  // Optionales Mapping auf echte Close-Custom-Fields, falls hinterlegt.
  if (env.CLOSE_CUSTOM_FIELDS) {
    try {
      const mapping = JSON.parse(env.CLOSE_CUSTOM_FIELDS);
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
    const leadId = await legeLeadAn(key, lead, baueNotiz(d, antworten));
    return antwort(200, { ok: true, lead_id: leadId });

  } catch (e) {
    // Bewusst ohne personenbezogene Daten, damit die Funktionslogs sauber bleiben.
    console.error('lead: Anlage in Close fehlgeschlagen —', e.message, '|', e.detail || '');
    return antwort(502, { ok: false, fehler: 'CRM nicht erreichbar.' });
  }
}

module.exports = { verarbeiteLead };
