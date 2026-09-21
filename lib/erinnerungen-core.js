/* =============================================================================
 *  Terminerinnerungen — hosterunabhaengiger Kern
 *
 *  Laeuft im Takt (alle 15 Minuten), liest kommende Termine aus dem Google
 *  Kalender und verschickt je Termin hoechstens eine Erinnerung pro Lauf.
 *
 *  Die drei Stufen haben ein FENSTER, keinen Zeitpunkt:
 *
 *      7 Tage   [Start-7d ... Start-24h)
 *      1 Tag    [Start-24h ... Start-3h)
 *      3 Stunden[Start-3h  ... Start)
 *
 *  Der Unterschied ist wichtig. Faellt der Dienst zwei Tage aus, wird die
 *  7-Tage-Mail nicht verspaetet nachgereicht — zu dem Zeitpunkt ist laengst
 *  das Tagesfenster dran, und "Ihr Termin naechste Woche" fuenf Tage vorher
 *  zu schicken sieht kaputt aus. Es gewinnt immer die Stufe, in deren Fenster
 *  die Gegenwart faellt.
 *
 *  Zwei weitere Regeln, die Unsinn verhindern:
 *
 *    Wer drei Tage vorher bucht, bekommt keine 7-Tage-Mail nachgereicht.
 *    Geprueft wird das am Anlagezeitpunkt des Kalendereintrags.
 *
 *    Zwischen Buchung und Erinnerung liegen mindestens drei Stunden. Sonst
 *    bekaeme jemand, der 26 Stunden vorher bucht, zwei Stunden spaeter die
 *    Tages-Erinnerung — direkt nach der Bestaetigung, die er schon hat.
 *
 *  Doppelversand wird am Kalendereintrag selbst vermerkt, in den privaten
 *  Zusatzfeldern. Damit ueberlebt der Stand jeden Neustart und jedes neue
 *  Deployment, ohne dass eine Datenbank dazukommt.
 *
 *  Reihenfolge bewusst: erst senden, dann vermerken. Schlaegt der Vermerk
 *  fehl, kann eine Erinnerung doppelt rausgehen. Andersherum ginge sie im
 *  Fehlerfall ganz verloren — und ein nicht erschienener Interessent kostet
 *  mehr als eine doppelte Mail.
 * ========================================================================== */

'use strict';

const { konfig, zugriffstoken, calApi } = require('./booking-core.js');
const { erinnerung } = require('./termin-mails.js');
const { versende, mailKonfig } = require('./mail.js');

const STUNDE = 3600 * 1000;
const TAG = 24 * STUNDE;

/* Mindestabstand zwischen Buchung und Erinnerung. */
const MINDESTABSTAND = 3 * STUNDE;

const STUFEN = [
  { id: '7t', vorlauf: 7 * TAG, fensterEnde: 1 * TAG },
  { id: '1t', vorlauf: 1 * TAG, fensterEnde: 3 * STUNDE },
  { id: '3h', vorlauf: 3 * STUNDE, fensterEnde: 0 }
];

const MERKMAL = (id) => 'erinnert_' + id;

/* ------------------------------------------------------- Termin auslesen */
/* Neue Buchungen tragen die Kontaktdaten in den privaten Zusatzfeldern.
   Aeltere haben nur die Beschreibung — die wird deshalb als Rueckfallebene
   gelesen, damit bereits gebuchte Termine nicht leer ausgehen. */
function ausBeschreibung(text, feld) {
  const treffer = new RegExp('^' + feld + ':\\s*(.+)$', 'im').exec(String(text || ''));
  return treffer ? treffer[1].trim() : '';
}

function lieseTermin(eintrag) {
  const privat = (eintrag.extendedProperties && eintrag.extendedProperties.private) || {};
  const beschreibung = eintrag.description || '';

  const email = (privat.lead_email || ausBeschreibung(beschreibung, 'E-Mail')).toLowerCase();
  const name = privat.lead_name || ausBeschreibung(beschreibung, 'Name');
  const telefonRoh = privat.lead_telefon || ausBeschreibung(beschreibung, 'Telefon');
  const teile = name.split(/\s+/).filter(Boolean);

  return {
    id: eintrag.id,
    email: email,
    vorname: privat.lead_vorname || (teile.length > 1 ? teile.slice(0, -1).join(' ') : teile[0] || ''),
    nachname: privat.lead_nachname || (teile.length > 1 ? teile[teile.length - 1] : ''),
    telefon: (telefonRoh === '—' ? '' : telefonRoh),
    start: new Date(eintrag.start && (eintrag.start.dateTime || eintrag.start.date)),
    angelegt: new Date(eintrag.created || 0),
    privat: privat
  };
}

/* ------------------------------------------------------- Faellige Stufe */
/* Gibt die Stufe zurueck, die JETZT fuer diesen Termin dran ist — oder null.
   Exportiert, weil genau hier die Fehler sitzen und das ohne Netz und ohne
   Kalender testbar sein muss. */
function faelligeStufe(termin, jetztMs) {
  const startMs = termin.start.getTime();
  if (!isFinite(startMs) || jetztMs >= startMs) return null;

  for (let i = 0; i < STUFEN.length; i++) {
    const stufe = STUFEN[i];
    const faellig = startMs - stufe.vorlauf;
    const fensterEnde = startMs - stufe.fensterEnde;

    if (jetztMs < faellig || jetztMs >= fensterEnde) continue;
    if (termin.privat[MERKMAL(stufe.id)]) continue;
    // Zum Zeitpunkt der Buchung musste diese Erinnerung noch in der Zukunft liegen.
    if (termin.angelegt.getTime() > faellig - MINDESTABSTAND) continue;

    return stufe;
  }
  return null;
}

/* ------------------------------------------------------------- Vermerken */
async function vermerke(k, token, termin, stufeId) {
  const privat = Object.assign({}, termin.privat);
  privat[MERKMAL(stufeId)] = new Date().toISOString();

  // Ein PATCH ersetzt die private Map als Ganzes, deshalb vollstaendig senden.
  await calApi(
    '/calendars/' + encodeURIComponent(k.kalender) + '/events/' + encodeURIComponent(termin.id),
    token,
    { method: 'PATCH', body: JSON.stringify({ extendedProperties: { private: privat } }) }
  );
}

/* ----------------------------------------------------------- Hauptlauf */
async function sendeFaellige(env, jetzt) {
  const k = konfig(env);
  if (!k) return { ok: false, fehler: 'Kalender nicht eingerichtet.' };
  if (!mailKonfig(env)) return { ok: false, fehler: 'Mailversand nicht eingerichtet.' };

  const jetztMs = (jetzt || new Date()).getTime();
  const token = await zugriffstoken(k.konto);

  const bis = new Date(jetztMs + 7 * TAG + 60000);
  const liste = await calApi(
    '/calendars/' + encodeURIComponent(k.kalender) + '/events' +
    '?timeMin=' + encodeURIComponent(new Date(jetztMs).toISOString()) +
    '&timeMax=' + encodeURIComponent(bis.toISOString()) +
    '&singleEvents=true&orderBy=startTime&maxResults=250',
    token
  );

  const ergebnis = { ok: true, geprueft: 0, gesendet: 0, uebersprungen: 0, fehler: [] };

  for (const eintrag of (liste.items || [])) {
    if (eintrag.status === 'cancelled') continue;
    ergebnis.geprueft++;

    let termin;
    try { termin = lieseTermin(eintrag); }
    catch (e) { ergebnis.fehler.push({ termin: eintrag.id, grund: 'unlesbar' }); continue; }

    const stufe = faelligeStufe(termin, jetztMs);
    if (!stufe) { ergebnis.uebersprungen++; continue; }

    if (!termin.email) {
      // Ohne Adresse ist nichts zu machen. Kein Fehler, aber sichtbar machen.
      ergebnis.fehler.push({ termin: termin.id, grund: 'keine E-Mail-Adresse hinterlegt' });
      continue;
    }

    try {
      const mail = erinnerung(stufe.id, {
        vorname: termin.vorname, nachname: termin.nachname,
        start: termin.start, zone: k.zone, dauer: k.dauer, telefon: termin.telefon
      }, env);

      await versende(env, {
        an: termin.email,
        anName: [termin.vorname, termin.nachname].filter(Boolean).join(' '),
        betreff: mail.betreff, text: mail.text, html: mail.html
      });
      ergebnis.gesendet++;

      try {
        await vermerke(k, token, termin, stufe.id);
      } catch (e) {
        // Laut, weil der naechste Lauf sonst dieselbe Mail noch einmal schickt.
        console.error('erinnerungen: Vermerk fehlgeschlagen fuer', termin.id,
          'Stufe', stufe.id, '—', e.message, '|', e.detail || '');
        ergebnis.fehler.push({ termin: termin.id, grund: 'gesendet, aber nicht vermerkt' });
      }
    } catch (e) {
      // Bewusst ohne personenbezogene Daten im Protokoll.
      console.error('erinnerungen: Versand fehlgeschlagen fuer', termin.id,
        'Stufe', stufe.id, '—', e.message, '|', e.detail || '');
      ergebnis.fehler.push({ termin: termin.id, grund: 'Versand fehlgeschlagen' });
    }
  }

  return ergebnis;
}

module.exports = { sendeFaellige, faelligeStufe, lieseTermin, STUFEN, MINDESTABSTAND };
