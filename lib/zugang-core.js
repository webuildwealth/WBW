/* =============================================================================
 *  Persönlicher Zugang zum Cashflow-Rechner — hosterunabhängiger Kern
 *
 *  Jeder Kunde bekommt einen eigenen Link der Form
 *      https://finanz-medizin.com/cashflow?z=<schluessel>
 *  Der Schlüssel enthält Name, Zugangs-ID und optional ein Ablaufdatum und ist
 *  mit CASHFLOW_SECRET signiert (HMAC-SHA256). Eine Datenbank ist dafür nicht
 *  nötig: Gültig ist, was die Signatur trägt. Gesperrt wird über die
 *  Zugangs-ID in CASHFLOW_GESPERRT.
 *
 *  Die Finanzangaben der Kunden kommen hier nie an. Der Server prüft nur den
 *  Schlüssel; gerechnet und gespeichert wird ausschließlich im Browser.
 *
 *  Umgebungsvariablen
 *    CASHFLOW_SECRET           Pflicht. Zufällige Zeichenkette, mind. 32 Zeichen.
 *                              Wird sie geändert, werden ALLE Links ungültig.
 *    CASHFLOW_ADMIN_PASSWORT   Pflicht für die Verwaltungsseite (Links erstellen).
 *    CASHFLOW_GESPERRT         optional, Zugangs-IDs mit Komma getrennt.
 * ========================================================================== */

'use strict';

const crypto = require('crypto');

const antwort = (status, body) => ({ status: status, body: body });

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function vonB64url(text) {
  return Buffer.from(String(text).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function signatur(teil, secret) {
  return b64url(crypto.createHmac('sha256', secret).update(teil).digest());
}

function gleich(a, b) {
  /* Vergleich in konstanter Zeit. Über die Hashes, damit unterschiedliche
     Längen nicht vorab verraten werden. */
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function secretAus(env) {
  const s = env && env.CASHFLOW_SECRET;
  return s && String(s).length >= 32 ? String(s) : null;
}

function gesperrt(env) {
  return String((env && env.CASHFLOW_GESPERRT) || '')
    .split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}

/** Erstellt einen signierten Schlüssel. tage = 0 heißt: ohne Ablauf. */
function erstelleSchluessel(name, tage, secret, jetzt) {
  const heute = jetzt || new Date();
  const daten = {
    v: 1,
    i: b64url(crypto.randomBytes(6)),
    n: name,
    t: heute.toISOString().slice(0, 10)
  };
  if (tage > 0) {
    daten.e = new Date(heute.getTime() + tage * 86400000).toISOString().slice(0, 10);
  }
  const teil = b64url(JSON.stringify(daten));
  return { schluessel: teil + '.' + signatur(teil, secret), daten: daten };
}

/** Prüft einen Schlüssel. Gibt { ok, daten } oder { ok:false, grund } zurück. */
function pruefeSchluessel(schluessel, env, jetzt) {
  const secret = secretAus(env);
  if (!secret) return { ok: false, grund: 'nicht-eingerichtet' };

  const roh = String(schluessel || '').trim();
  const teile = roh.split('.');
  if (teile.length !== 2 || !teile[0] || !teile[1] || roh.length > 600) {
    return { ok: false, grund: 'ungueltig' };
  }
  if (!gleich(signatur(teile[0], secret), teile[1])) {
    return { ok: false, grund: 'ungueltig' };
  }

  let daten;
  try { daten = JSON.parse(vonB64url(teile[0]).toString('utf8')); }
  catch (e) { return { ok: false, grund: 'ungueltig' }; }
  if (!daten || daten.v !== 1 || !daten.i || !daten.n) {
    return { ok: false, grund: 'ungueltig' };
  }

  if (gesperrt(env).indexOf(daten.i) !== -1) return { ok: false, grund: 'gesperrt' };

  if (daten.e) {
    const heute = (jetzt || new Date()).toISOString().slice(0, 10);
    if (heute > daten.e) return { ok: false, grund: 'abgelaufen' };
  }
  return { ok: true, daten: daten };
}

const MELDUNG = {
  'nicht-eingerichtet': 'Der Zugang ist gerade nicht verfügbar. Bitte versuchen Sie es später erneut.',
  'ungueltig': 'Dieser Zugangslink ist nicht gültig. Bitte prüfen Sie, ob er vollständig kopiert wurde.',
  'abgelaufen': 'Dieser Zugangslink ist abgelaufen. Ihr Berater sendet Ihnen gern einen neuen.',
  'gesperrt': 'Dieser Zugangslink wurde deaktiviert. Ihr Berater sendet Ihnen gern einen neuen.'
};

/**
 * Verarbeitet POST /api/zugang.
 *   { aktion: "pruefen",   schluessel }
 *   { aktion: "erstellen", passwort, name, tage, basis }
 */
async function verarbeiteZugang(rohBody, env) {
  let d;
  try { d = JSON.parse(rohBody || '{}'); }
  catch (e) { return antwort(400, { ok: false, fehler: 'Ungültige Anfrage.' }); }

  if (d.aktion === 'pruefen') {
    const r = pruefeSchluessel(d.schluessel, env);
    if (!r.ok) {
      const status = r.grund === 'nicht-eingerichtet' ? 503 : 403;
      return antwort(status, { ok: false, grund: r.grund, fehler: MELDUNG[r.grund] });
    }
    return antwort(200, {
      ok: true,
      id: r.daten.i,
      name: r.daten.n,
      gueltigBis: r.daten.e || null
    });
  }

  if (d.aktion === 'erstellen') {
    const secret = secretAus(env);
    const adminPw = env && env.CASHFLOW_ADMIN_PASSWORT;
    if (!secret || !adminPw) {
      return antwort(503, {
        ok: false,
        fehler: 'CASHFLOW_SECRET (mind. 32 Zeichen) und CASHFLOW_ADMIN_PASSWORT sind in Netlify noch nicht hinterlegt.'
      });
    }
    if (!gleich(String(d.passwort || ''), String(adminPw))) {
      /* Kleine Pause bremst das Durchprobieren von Passwörtern. */
      await new Promise(function (r) { setTimeout(r, 800); });
      return antwort(401, { ok: false, fehler: 'Das Passwort ist nicht korrekt.' });
    }

    const name = String(d.name || '').replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 80) {
      return antwort(400, { ok: false, fehler: 'Bitte einen Namen mit 2 bis 80 Zeichen angeben.' });
    }
    const tage = Math.max(0, Math.min(3650, parseInt(d.tage, 10) || 0));

    const s = erstelleSchluessel(name, tage, secret);
    const basis = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(String(d.basis || ''))
      ? String(d.basis) : 'https://finanz-medizin.com';
    return antwort(200, {
      ok: true,
      id: s.daten.i,
      name: s.daten.n,
      gueltigBis: s.daten.e || null,
      link: basis + '/cashflow?z=' + s.schluessel
    });
  }

  return antwort(400, { ok: false, fehler: 'Unbekannte Aktion.' });
}

module.exports = { verarbeiteZugang, erstelleSchluessel, pruefeSchluessel };
