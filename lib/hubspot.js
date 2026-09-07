/* =============================================================================
 *  HubSpot-CRM — gemeinsame Anbindung
 *
 *  Löst lib/close.js ab. Die Schnittstelle ist absichtlich identisch
 *  (kurz, baueLead, legeLeadAn), damit lead-core.js und booking-core.js
 *  nur ihre require-Zeile tauschen mussten.
 *
 *  Zwei Wege führen hierher:
 *    lib/lead-core.js     — jemand hat einen Check ausgefüllt
 *    lib/booking-core.js  — jemand hat direkt einen Termin gebucht
 *
 *  Was im CRM entsteht
 *    Kontakt   die Person. Schlüssel ist die E-Mail-Adresse — HubSpot
 *              dedupliziert ausschließlich darüber, deshalb suchen wir
 *              erst und legen nur an, wenn es sie noch nicht gibt.
 *    Firma     die Praxis, falls im Formular genannt. Wird über den Namen
 *              gesucht, damit nicht bei jeder Anfrage eine neue entsteht.
 *    Notiz     der lesbare Vorgang, verknüpft mit beidem.
 *
 *  Anders als Close kennt HubSpot keinen "Lead" als eigenes Objekt: dort ist
 *  ein Lead eine Organisation mit Kontakten, hier sind Kontakt und Firma zwei
 *  gleichrangige Datensätze. Deshalb baut baueLead() eine neutrale Zwischen-
 *  form, die legeLeadAn() dann in beide Objekte übersetzt.
 *
 *  Bewusst KEIN Deal: ein ausgefüllter Funnel ist noch kein Termin. Deals
 *  entstehen erst, wenn eine Beratung vereinbart ist — sonst stünden nach
 *  einem Jahr zehntausende Deals in der Pipeline und jede Prognose wäre wertlos.
 *
 *  Umgebungsvariablen
 *    HUBSPOT_TOKEN      Pflicht. Private App → Token
 *                       Scopes: crm.objects.contacts.write,
 *                               crm.objects.companies.write,
 *                               crm.objects.notes.write (jeweils read dazu)
 *    HUBSPOT_OWNER_ID   optional. Zuständiger Mitarbeiter, z. B. "82906351".
 *                       Ohne diesen Wert bleibt der Datensatz ohne Zuständigen
 *                       und taucht in keiner "Meine Kontakte"-Ansicht auf.
 * ========================================================================== */

'use strict';

const HUBSPOT_API = 'https://api.hubapi.com';

/* Alle drei Funnels laufen auf finanz-medizin.com und gehören damit zu FM.
   Kommt später ein WBW-Funnel dazu, steht er hier — und nur hier. */
const FUNNEL_GESCHAEFTSBEREICH = {
  'praxisinhaber': 'FM',
  'angestellte-aerzte': 'FM',
  'mfa-praxisteam': 'FM'
};

const STANDARD_GESCHAEFTSBEREICH = 'FM';

/* Kappt überlange Eingaben, bevor sie ins CRM wandern. */
function kurz(wert, max) {
  return String(wert == null ? '' : wert).trim().slice(0, max || 300);
}

async function hubspotRequest(pfad, token, payload, methode) {
  const res = await fetch(HUBSPOT_API + pfad, {
    method: methode || (payload ? 'POST' : 'GET'),
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: payload ? JSON.stringify(payload) : undefined
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 400); } catch (e) { /* egal */ }
    const fehler = new Error('HubSpot ' + pfad + ' antwortete ' + res.status);
    fehler.status = res.status;
    fehler.detail = detail;
    throw fehler;
  }

  // DELETE und die Association-Endpunkte antworten mit leerem Körper.
  const roh = await res.text();
  return roh ? JSON.parse(roh) : {};
}

/* Sucht genau einen Datensatz über ein Feld. Gibt die ID zurück oder null. */
async function sucheEinen(objekt, token, feld, wert) {
  const treffer = await hubspotRequest('/crm/v3/objects/' + objekt + '/search', token, {
    filterGroups: [{ filters: [{ propertyName: feld, operator: 'EQ', value: wert }] }],
    properties: ['hs_object_id'],
    limit: 1
  });
  return (treffer.results && treffer.results.length) ? treffer.results[0].id : null;
}

/* Verknüpft zwei Datensätze mit der Standardbeziehung.
   Der v4-"default"-Endpunkt erspart uns, Association-Type-IDs hart zu
   verdrahten — die ändern sich je Portal und Objektpaar. */
async function verknuepfe(vonObjekt, vonId, zuObjekt, zuId, token) {
  await hubspotRequest(
    '/crm/v4/objects/' + vonObjekt + '/' + vonId +
    '/associations/default/' + zuObjekt + '/' + zuId,
    token, null, 'PUT'
  );
}

/**
 * Baut die neutrale Zwischenform aus den Formulardaten.
 *
 * Signatur und Aufrufstelle sind dieselben wie beim Close-Adapter, damit die
 * beiden Kerne unverändert bleiben konnten. Zurück kommt aber kein fertiges
 * API-Objekt, sondern die Beschreibung dessen, was angelegt werden soll —
 * HubSpot braucht dafür zwei Objekte statt einem.
 */
function baueLead(d, beschreibung, env) {
  const funnel = kurz(d.funnel, 60);
  const telefon = kurz(d.telefon, 60);
  const praxis = kurz(d.praxis, 160);

  const kontakt = {
    email: kurz(d.email, 200).toLowerCase(),
    firstname: kurz(d.vorname, 80),
    lastname: kurz(d.nachname, 80),
    lifecyclestage: 'lead',
    hs_lead_status: 'NEW',
    geschaftsbereich: FUNNEL_GESCHAEFTSBEREICH[funnel] || STANDARD_GESCHAEFTSBEREICH,
    kanal: 'website',
    lead_source_detail: 'website',
    anrufversuche: '0'
  };

  if (telefon) kontakt.phone = telefon;
  if (praxis) kontakt.company = praxis;
  if (kurz(d.erreichbarkeit, 100)) kontakt.message = 'Erreichbarkeit: ' + kurz(d.erreichbarkeit, 100);
  if (env && env.HUBSPOT_OWNER_ID) kontakt.hubspot_owner_id = kurz(env.HUBSPOT_OWNER_ID, 30);

  const firma = praxis ? {
    name: praxis,
    lifecyclestage: 'lead',
    hs_lead_status: 'NEW',
    geschaftsbereich: FUNNEL_GESCHAEFTSBEREICH[funnel] || STANDARD_GESCHAEFTSBEREICH,
    lead_source_detail: 'website'
  } : null;

  if (firma && telefon) firma.phone = telefon;
  if (firma && env && env.HUBSPOT_OWNER_ID) firma.hubspot_owner_id = kurz(env.HUBSPOT_OWNER_ID, 30);

  return { kontakt: kontakt, firma: firma, beschreibung: beschreibung };
}

/* Legt den Kontakt an — oder aktualisiert ihn, wenn die E-Mail schon bekannt ist.
   Beim Aktualisieren werden bewusst nur leere Felder gefüllt und Kanal, Quelle
   und Geschäftsbereich NICHT überschrieben: die erste Herkunft ist die wahre,
   und eine gesetzte Sperre darf ein Formular nie aufheben. */
async function kontaktAnlegenOderAktualisieren(token, kontakt) {
  const vorhanden = await sucheEinen('contacts', token, 'email', kontakt.email);

  if (!vorhanden) {
    const neu = await hubspotRequest('/crm/v3/objects/contacts', token, { properties: kontakt });
    return { id: neu.id, neuAngelegt: true };
  }

  const nachtrag = {};
  ['firstname', 'lastname', 'phone', 'company'].forEach(function (feld) {
    if (kontakt[feld]) nachtrag[feld] = kontakt[feld];
  });
  if (Object.keys(nachtrag).length) {
    await hubspotRequest('/crm/v3/objects/contacts/' + vorhanden, token,
      { properties: nachtrag }, 'PATCH');
  }
  return { id: vorhanden, neuAngelegt: false };
}

/* Firma über den Namen finden oder anlegen. Der Name ist ein schwacher
   Schlüssel — "Zahnarztpraxis Müller" gibt es mehrfach —, aber aus einem
   Formular ohne Domain ist er das Beste, was wir haben. Die Alternative
   wäre, bei jeder Anfrage eine neue Firma zu erzeugen. */
async function firmaAnlegenOderFinden(token, firma) {
  const vorhanden = await sucheEinen('companies', token, 'name', firma.name);
  if (vorhanden) return vorhanden;

  const neu = await hubspotRequest('/crm/v3/objects/companies', token, { properties: firma });
  return neu.id;
}

/**
 * Legt Kontakt, Firma und Notiz an und verknüpft sie.
 *
 * Die Notiz und die Firmenverknüpfung dürfen scheitern, ohne den Vorgang zu
 * kippen: ein Kontakt ohne Notiz ist ein kleiner Verlust, ein verlorener
 * Interessent ein großer. Genau wie im Close-Adapter.
 *
 * @returns {Promise<string>} die Kontakt-ID
 */
async function legeLeadAn(token, lead, notiz) {
  const kontakt = await kontaktAnlegenOderAktualisieren(token, lead.kontakt);

  let firmaId = null;
  if (lead.firma) {
    try {
      firmaId = await firmaAnlegenOderFinden(token, lead.firma);
      await verknuepfe('contacts', kontakt.id, 'companies', firmaId, token);
    } catch (e) {
      console.error('hubspot: Firma konnte nicht angelegt oder verknüpft werden —', e.message);
    }
  }

  if (notiz) {
    try {
      const angelegt = await hubspotRequest('/crm/v3/objects/notes', token, {
        properties: {
          hs_note_body: kurz(notiz, 65000),
          hs_timestamp: new Date().toISOString()
        }
      });
      await verknuepfe('notes', angelegt.id, 'contacts', kontakt.id, token);
      if (firmaId) await verknuepfe('notes', angelegt.id, 'companies', firmaId, token);
    } catch (e) {
      console.error('hubspot: Notiz konnte nicht angelegt werden —', e.message);
    }
  }

  return kontakt.id;
}

module.exports = {
  HUBSPOT_API,
  kurz,
  hubspotRequest,
  legeLeadAn,
  baueLead,
  verknuepfe
};
