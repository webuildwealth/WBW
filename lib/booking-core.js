/* =============================================================================
 *  Terminbuchung — hosterunabhängiger Kern
 *
 *  Liest freie Zeiten aus Google Kalender und legt Termine an. Ohne externe
 *  Abhängigkeiten: Der OAuth2-Zugriff läuft über ein selbst signiertes JWT
 *  (RS256, node:crypto), danach ganz normale HTTPS-Aufrufe an die Calendar API.
 *
 *  Warum kein Calendly oder eingebetteter Google-Terminplan: Beides wäre ein
 *  fremdes Skript auf der Seite. Damit wäre die Consent-Freiheit dahin und das
 *  Design nicht mehr unseres. So bleibt beides erhalten.
 *
 *  Umgebungsvariablen
 *    GOOGLE_SERVICE_ACCOUNT   Pflicht. Das komplette JSON des Dienstkontos
 *    GOOGLE_CALENDAR_ID       Pflicht. Kalender-ID, oft die E-Mail-Adresse
 *    BOOKING_TIMEZONE         optional, Standard "Europe/Berlin"
 *    BOOKING_HOURS            optional, Standard "9-18" (Ortszeit)
 *    BOOKING_DAYS             optional, Standard "1,2,3,4,5" (Mo–Fr)
 *    BOOKING_DURATION_MIN     optional, Standard 25
 *    BOOKING_LEAD_HOURS       optional, Standard 24 — Vorlauf bis zum ersten Slot
 *    BOOKING_HORIZON_DAYS     optional, Standard 14 — wie weit nach vorn
 *    GOOGLE_MEET_URL          optional. Fester Meet-Raum als Rückfallebene,
 *                             falls das Dienstkonto keinen erzeugen darf
 *
 *  Wichtige Einschränkung: Ein Dienstkonto ohne Domain-Wide Delegation darf
 *  keine Kalendereinladungen an Dritte verschicken. Der Termin landet daher mit
 *  allen Angaben im Kalender der Beratung; die Bestätigung an den Interessenten
 *  läuft über die Danke-Seite und die persönliche Rückmeldung.
 *
 *  Google Meet: Der Termin wird mit Videoraum angelegt, damit das Gespräch
 *  überhaupt eines ist, dem Fathom beitreten kann (siehe lib/fathom-core.js).
 *  Auch das ist eine Stelle, an der ein Dienstkonto ohne Domain-Wide Delegation
 *  scheitern kann. Deshalb der zweistufige Versuch weiter unten: erst mit
 *  Videoraum und Teilnehmer, bei Ablehnung ohne beides. Ein Termin ohne
 *  Einwahllink ist unschön, ein abgelehnter Termin wäre schlimmer.
 * ========================================================================== */

'use strict';

const crypto = require('crypto');
const { legeLeadAn, baueLead } = require('./close.js');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CAL_API = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

const antwort = (status, body) => ({ status: status, body: body });

function kurz(wert, max) {
  return String(wert == null ? '' : wert).trim().slice(0, max || 300);
}

/* ----------------------------------------------------------- Konfiguration */
function konfig(env) {
  const rohJson = env.GOOGLE_SERVICE_ACCOUNT;
  const kalender = env.GOOGLE_CALENDAR_ID;
  if (!rohJson || !kalender) return null;

  let konto;
  try {
    konto = JSON.parse(rohJson);
  } catch (e) {
    // Manche Oberflächen speichern das JSON base64-kodiert.
    try { konto = JSON.parse(Buffer.from(rohJson, 'base64').toString('utf8')); }
    catch (e2) { return null; }
  }
  if (!konto.client_email || !konto.private_key) return null;

  const stunden = String(env.BOOKING_HOURS || '9-18').split('-');
  return {
    konto: konto,
    kalender: kalender,
    zone: env.BOOKING_TIMEZONE || 'Europe/Berlin',
    vonStunde: parseInt(stunden[0], 10) || 9,
    bisStunde: parseInt(stunden[1], 10) || 18,
    tage: String(env.BOOKING_DAYS || '1,2,3,4,5').split(',').map(function (t) {
      return parseInt(t.trim(), 10);
    }).filter(function (t) { return !isNaN(t); }),
    dauer: parseInt(env.BOOKING_DURATION_MIN, 10) || 25,
    vorlauf: parseInt(env.BOOKING_LEAD_HOURS, 10) || 24,
    horizont: parseInt(env.BOOKING_HORIZON_DAYS, 10) || 14,
    meetErsatz: String(env.GOOGLE_MEET_URL || '').trim()
  };
}

/* ------------------------------------------------------------ OAuth2 (JWT) */
function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let tokenCache = { wert: null, bis: 0 };

async function zugriffstoken(konto) {
  const jetzt = Math.floor(Date.now() / 1000);
  if (tokenCache.wert && tokenCache.bis > jetzt + 60) return tokenCache.wert;

  const kopf = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const rumpf = b64url(JSON.stringify({
    iss: konto.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: jetzt,
    exp: jetzt + 3600
  }));

  const signatur = b64url(
    crypto.createSign('RSA-SHA256')
      .update(kopf + '.' + rumpf)
      .sign(konto.private_key.replace(/\\n/g, '\n'))
  );

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: kopf + '.' + rumpf + '.' + signatur
    }).toString()
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    const f = new Error('Google-Token abgelehnt (' + res.status + ')');
    f.detail = detail;
    throw f;
  }

  const daten = await res.json();
  tokenCache = { wert: daten.access_token, bis: jetzt + (daten.expires_in || 3600) };
  return tokenCache.wert;
}

async function calApi(pfad, token, optionen) {
  const res = await fetch(CAL_API + pfad, Object.assign({
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  }, optionen || {}));

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    const f = new Error('Calendar API ' + pfad + ' antwortete ' + res.status);
    f.status = res.status;
    f.detail = detail;
    throw f;
  }
  return res.json();
}

/* --------------------------------------------------------- Zeitrechnung */
/* Der Versatz einer Zeitzone zu UTC, ermittelt über Intl — damit gilt
   automatisch Sommer- oder Winterzeit, ohne Tabelle und ohne Bibliothek. */
function versatzMinuten(datum, zone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const t = {};
  fmt.formatToParts(datum).forEach(function (p) {
    if (p.type !== 'literal') t[p.type] = p.value;
  });
  const alsUTC = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  return (alsUTC - Math.floor(datum.getTime() / 1000) * 1000) / 60000;
}

/* Baut aus Ortszeit-Angaben einen echten Zeitpunkt. */
function ortszeit(jahr, monat, tag, stunde, minute, zone) {
  let ms = Date.UTC(jahr, monat, tag, stunde, minute, 0);
  // Zwei Durchgänge genügen, auch an den Umstellungstagen.
  for (let i = 0; i < 2; i++) {
    const v = versatzMinuten(new Date(ms), zone);
    ms = Date.UTC(jahr, monat, tag, stunde, minute, 0) - v * 60000;
  }
  return new Date(ms);
}

function teileInZone(datum, zone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour12: false, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  const t = {};
  fmt.formatToParts(datum).forEach(function (p) {
    if (p.type !== 'literal') t[p.type] = p.value;
  });
  const wochentage = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    jahr: +t.year, monat: +t.month - 1, tag: +t.day,
    stunde: +t.hour, minute: +t.minute,
    wochentag: wochentage[t.weekday]
  };
}

/* Deutsches Datum in der Zielzeitzone — für die Notiz im CRM. Ein
   ISO-Zeitstempel in UTC wäre dort nur eine Rechenaufgabe für den, der die
   Notiz später liest. */
function inZone(datum, zone) {
  const t = teileInZone(datum, zone);
  const zwei = (n) => String(n).padStart(2, '0');
  const tage = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  return tage[t.wochentag] + ', ' + zwei(t.tag) + '.' + zwei(t.monat + 1) + '.' +
         t.jahr + ', ' + zwei(t.stunde) + ':' + zwei(t.minute);
}

/* ------------------------------------------------------------ Freie Slots */
async function freieSlots(env) {
  const k = konfig(env);
  if (!k) return antwort(503, { ok: false, grund: 'nicht_konfiguriert' });

  const token = await zugriffstoken(k.konto);

  const start = new Date(Date.now() + k.vorlauf * 3600 * 1000);
  const ende = new Date(Date.now() + k.horizont * 24 * 3600 * 1000);

  const belegt = await calApi('/freeBusy', token, {
    method: 'POST',
    body: JSON.stringify({
      timeMin: start.toISOString(),
      timeMax: ende.toISOString(),
      timeZone: k.zone,
      items: [{ id: k.kalender }]
    })
  });

  const sperren = ((belegt.calendars && belegt.calendars[k.kalender] &&
    belegt.calendars[k.kalender].busy) || []).map(function (b) {
    return { von: new Date(b.start).getTime(), bis: new Date(b.end).getTime() };
  });

  const dauerMs = k.dauer * 60000;
  const tage = [];
  const heute = teileInZone(start, k.zone);
  let zeiger = new Date(Date.UTC(heute.jahr, heute.monat, heute.tag));

  for (let d = 0; d <= k.horizont && tage.length < 10; d++) {
    const p = teileInZone(zeiger, k.zone);
    const wt = new Date(Date.UTC(p.jahr, p.monat, p.tag)).getUTCDay();

    if (k.tage.indexOf(wt) !== -1) {
      const slots = [];
      for (let std = k.vonStunde; std < k.bisStunde; std++) {
        for (let min = 0; min < 60; min += 30) {
          const beginn = ortszeit(p.jahr, p.monat, p.tag, std, min, k.zone);
          const bMs = beginn.getTime();
          if (bMs < start.getTime() || bMs + dauerMs > ende.getTime()) continue;

          const kollision = sperren.some(function (s) {
            return bMs < s.bis && (bMs + dauerMs) > s.von;
          });
          if (!kollision) slots.push(beginn.toISOString());
        }
      }
      if (slots.length) {
        tage.push({
          datum: p.jahr + '-' + String(p.monat + 1).padStart(2, '0') + '-' +
                 String(p.tag).padStart(2, '0'),
          slots: slots
        });
      }
    }
    zeiger = new Date(zeiger.getTime() + 24 * 3600 * 1000);
  }

  return antwort(200, {
    ok: true, zone: k.zone, dauer: k.dauer, tage: tage
  });
}

/* --------------------------------------------------------- Termin anlegen */
async function bucheTermin(body, env) {
  const k = konfig(env);
  if (!k) return antwort(503, { ok: false, grund: 'nicht_konfiguriert' });

  let d;
  try {
    d = (typeof body === 'string') ? JSON.parse(body || '{}') : (body || {});
  } catch (e) {
    return antwort(400, { ok: false, fehler: 'Ungültiges JSON.' });
  }

  if (kurz(d.website, 50)) return antwort(200, { ok: true });   // Honeypot

  const email = kurz(d.email, 200).toLowerCase();
  const vorname = kurz(d.vorname, 80);
  const nachname = kurz(d.nachname, 80);
  const telefon = kurz(d.telefon, 60);
  const beginn = kurz(d.beginn, 40);
  /* Eigene, freiwillige Einwilligung — nicht Teil der Pflichtzustimmung oben.
     Wer nichts ankreuzt, wird nicht aufgezeichnet. */
  const aufzeichnung = kurz(d.aufzeichnung, 10).toLowerCase() === 'ja';

  if (!EMAIL_RE.test(email)) return antwort(400, { ok: false, fehler: 'E-Mail-Adresse ist ungültig.' });
  if (!vorname || !nachname) return antwort(400, { ok: false, fehler: 'Name fehlt.' });
  if (kurz(d.einwilligung, 10).toLowerCase() !== 'ja') {
    return antwort(400, { ok: false, fehler: 'Ohne Einwilligung dürfen wir die Daten nicht verarbeiten.' });
  }

  const start = new Date(beginn);
  if (isNaN(start.getTime())) return antwort(400, { ok: false, fehler: 'Terminzeit ist ungültig.' });
  if (start.getTime() < Date.now() + (k.vorlauf - 1) * 3600 * 1000) {
    return antwort(409, { ok: false, fehler: 'Dieser Termin liegt zu kurzfristig.' });
  }

  const ende = new Date(start.getTime() + k.dauer * 60000);
  const token = await zugriffstoken(k.konto);

  /* Gegenprüfen, ob der Platz noch frei ist — zwischen Anzeige und Klick
     können Minuten liegen. */
  const belegt = await calApi('/freeBusy', token, {
    method: 'POST',
    body: JSON.stringify({
      timeMin: start.toISOString(), timeMax: ende.toISOString(),
      timeZone: k.zone, items: [{ id: k.kalender }]
    })
  });
  const sperren = (belegt.calendars && belegt.calendars[k.kalender] &&
    belegt.calendars[k.kalender].busy) || [];
  if (sperren.length) {
    return antwort(409, { ok: false, fehler: 'Dieser Termin wurde gerade vergeben.' });
  }

  const person = (vorname + ' ' + nachname).trim();
  const zeilen = [
    'Erstgespräch über finanz-medizin.com',
    '',
    'Name:     ' + person,
    'E-Mail:   ' + email,
    'Telefon:  ' + (telefon || '—')
  ];
  if (d.segment) zeilen.push('Segment:  ' + kurz(d.segment, 80));
  if (d.anliegen) zeilen.push('', 'Anliegen:', kurz(d.anliegen, 800));
  if (d.seite) zeilen.push('', 'Landingpage: ' + kurz(d.seite, 200));
  if (d.kampagne) zeilen.push('Kampagne: ' + kurz(d.kampagne, 300));
  zeilen.push('', 'Einwilligung zur Kontaktaufnahme: ja');
  /* Steht im Termin selbst, damit vor dem Gespräch ein Blick in den Kalender
     genügt, um zu wissen, ob mitgeschnitten werden darf. */
  zeilen.push('Einwilligung zur Aufzeichnung: ' + (aufzeichnung ? 'ja' : 'NEIN — nicht mitschneiden'));

  /* --------------------------------------------------------- Videoraum
     Der Termin soll ein Google Meet sein: Nur dann kann Fathom beitreten und
     mitschreiben (lib/fathom-core.js nimmt das Ergebnis später entgegen).

     Zwei Dinge daran kann ein Dienstkonto ohne Domain-Wide Delegation nicht:
     einen Meet-Raum erzeugen und einen fremden Teilnehmer eintragen. Google
     quittiert das mit 403, je nach Konstellation auch mit 400. Statt vorher zu
     raten, welche Rechte gerade gelten, versuchen wir es einmal mit und — falls
     abgelehnt — einmal ohne. Der Termin selbst steht in beiden Fällen. */
  const grunddaten = {
    summary: 'Erstgespräch · ' + person + (aufzeichnung ? '' : ' [ohne Aufzeichnung]'),
    description: zeilen.join('\n'),
    start: { dateTime: start.toISOString(), timeZone: k.zone },
    end: { dateTime: ende.toISOString(), timeZone: k.zone },
    reminders: { useDefault: true }
  };

  const pfad = '/calendars/' + encodeURIComponent(k.kalender) + '/events';
  let termin;
  try {
    termin = await calApi(pfad + '?conferenceDataVersion=1', token, {
      method: 'POST',
      body: JSON.stringify(Object.assign({}, grunddaten, {
        attendees: [{ email: email, displayName: person }],
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      }))
    });
  } catch (e) {
    /* Nur bei einer Absage aus Rechte- oder Formatgründen ein zweiter Versuch.
       Bei allem anderen — Netzfehler, 409, 5xx — wissen wir nicht, ob der
       Termin doch angelegt wurde; ein zweiter Aufruf risikierte einen
       Doppeleintrag. Dann lieber der Fehler nach oben. */
    if (e.status !== 400 && e.status !== 403) throw e;
    console.warn('booking: Termin mit Meet-Raum abgelehnt (' + e.status +
                 ') — zweiter Versuch ohne. Für Meet-Räume aus dem Dienstkonto ' +
                 'ist Domain-Wide Delegation nötig; alternativ GOOGLE_MEET_URL setzen.');
    termin = await calApi(pfad, token, {
      method: 'POST',
      body: JSON.stringify(grunddaten)
    });
  }

  /* Google hängt den Link an mehreren Stellen an. Kam keiner zustande, greift
     der feste Raum aus GOOGLE_MEET_URL — besser ein Raum für alle Gespräche
     als gar keiner. */
  let meetUrl = termin.hangoutLink ||
    ((termin.conferenceData && termin.conferenceData.entryPoints || [])
      .filter(function (p) { return p.entryPointType === 'video' && p.uri; })
      .map(function (p) { return p.uri; })[0]) || '';

  if (!meetUrl && k.meetErsatz) {
    meetUrl = k.meetErsatz;
    /* Nachtragen, damit der Link auch im Kalender steht und nicht nur in der
       Bestätigung auf der Seite. */
    try {
      termin = await calApi(pfad + '/' + encodeURIComponent(termin.id), token, {
        method: 'PATCH',
        body: JSON.stringify({
          location: meetUrl,
          description: grunddaten.description + '\n\nVideoraum: ' + meetUrl
        })
      });
    } catch (e) {
      console.error('booking: Meet-Link konnte nicht nachgetragen werden —', e.message);
    }
  }

  /* --------------------------------------------------------------- Close
     Der Termin steht jetzt. Was hier noch folgt, darf ihn nicht mehr kippen:
     Der Besucher hat eine zugesagte Uhrzeit, und ein CRM-Ausfall ist kein
     Grund, sie ihm wieder zu nehmen. Ein fehlender Lead ist ärgerlich und in
     zwei Minuten von Hand nachgetragen — ein zurückgewiesener Termin kostet
     den Interessenten. Deshalb: protokollieren, nicht scheitern. */
  let leadId = null;
  if (env && env.CLOSE_API_KEY) {
    try {
      const lead = baueLead(d, 'Terminbuchung über finanz-medizin.com', env);
      leadId = await legeLeadAn(env.CLOSE_API_KEY, lead, [
        '=== Erstgespräch gebucht über finanz-medizin.com ===',
        '',
        'TERMIN',
        '  • ' + inZone(start, k.zone) + ' Uhr (' + k.zone + ')',
        '  • Dauer: ' + k.dauer + ' Minuten',
        '  • Videoraum: ' + (meetUrl || '— (kein Meet-Link erzeugt)'),
        '  • Kalendereintrag: ' + termin.id,
        '',
        'KONTAKT',
        '  • Name: ' + person,
        '  • E-Mail: ' + email,
        '  • Telefon: ' + (telefon || '—'),
        '  • Einwilligung Kontaktaufnahme: ja',
        '  • Einwilligung Aufzeichnung: ' + (aufzeichnung ? 'ja' : 'nein'),
        ''
      ].concat(
        d.anliegen ? ['ANLIEGEN', '  ' + kurz(d.anliegen, 800), ''] : []
      ).concat([
        'HERKUNFT',
        '  • Bereich: ' + (kurz(d.segment, 80) || '—'),
        '  • Seite: ' + (kurz(d.seite, 200) || '—'),
        '  • Zeitpunkt der Buchung: ' + new Date().toISOString()
      ]).join('\n'));
    } catch (e) {
      // Bewusst ohne personenbezogene Daten.
      console.error('booking: Lead in Close fehlgeschlagen —', e.message, '|', e.detail || '');
    }
  }

  return antwort(200, {
    ok: true, termin_id: termin.id, beginn: start.toISOString(),
    meet_url: meetUrl || null, aufzeichnung: aufzeichnung, lead_id: leadId
  });
}

module.exports = { freieSlots, bucheTermin, konfig };
