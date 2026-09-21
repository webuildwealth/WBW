/* =============================================================================
 *  Eingang: Signatur pruefen, Ereignisse vereinheitlichen
 *
 *  Der Endpunkt steht offen im Netz. Wer ihn kennt, koennte sonst beliebige
 *  Datensatz-IDs hineinreichen und damit Mails ausloesen. Deshalb wird jede
 *  Anfrage geprueft, bevor auch nur der Rumpf ausgewertet wird:
 *
 *    Signatur v3 — HubSpot bildet HMAC-SHA256 ueber Methode + vollstaendige
 *    URL + Rumpf + Zeitstempel, mit dem Client-Secret der App als Schluessel.
 *    Der Zeitstempel darf nicht aelter als funf Minuten sein, sonst liesse
 *    sich eine einmal mitgeschnittene Anfrage beliebig oft wiedereinspielen.
 *
 *    Geteiltes Geheimnis — fuer Workflow-Webhooks und den manuellen Trigger,
 *    die keine Signatur mitschicken. Verglichen wird zeitkonstant; ein
 *    einfaches === verraet ueber die Laufzeit, wie viele Zeichen stimmen.
 *
 *  Vereinheitlicht wird, weil dieselbe Sache in drei Formaten hereinkommt:
 *  als Abonnement-Ereignis, als Workflow-Webhook und als Handaufruf.
 * ========================================================================== */

'use strict';

const crypto = require('crypto');
const { OBJEKT_ID, pfadFuer } = require('./hubspot.js');

const MAX_ALTER_MS = 5 * 60 * 1000;

/* '0-1' -> 'contacts' */
const VON_OBJEKT_ID = {};
for (const [pfad, id] of Object.entries(OBJEKT_ID)) VON_OBJEKT_ID[id] = pfad;

/** Zeitkonstanter Vergleich — auch bei verschiedenen Laengen. */
function gleich(a, b) {
  const pa = Buffer.from(String(a || ''), 'utf8');
  const pb = Buffer.from(String(b || ''), 'utf8');
  if (pa.length !== pb.length) {
    /* timingSafeEqual verlangt gleiche Laenge. Trotzdem einmal rechnen,
       damit die Laufzeit nicht von der Laenge abhaengt. */
    crypto.timingSafeEqual(pa, pa);
    return false;
  }
  return crypto.timingSafeEqual(pa, pb);
}

/**
 * HubSpot-Signatur v3.
 * @param {string} methode   'POST'
 * @param {string} uri       vollstaendige URL, wie HubSpot sie aufgerufen hat
 * @param {string} rohBody   der Rumpf als Zeichenkette, unveraendert
 * @param {string} zeitstempel  Header X-HubSpot-Request-Timestamp
 * @param {string} signatur     Header X-HubSpot-Signature-v3
 * @param {string} geheimnis    Client-Secret der App
 * @returns {{ok:boolean, grund?:string}}
 */
function pruefeSignaturV3(methode, uri, rohBody, zeitstempel, signatur, geheimnis) {
  if (!geheimnis) return { ok: false, grund: 'kein_geheimnis_konfiguriert' };
  if (!signatur) return { ok: false, grund: 'signatur_fehlt' };
  if (!zeitstempel) return { ok: false, grund: 'zeitstempel_fehlt' };

  const alter = Date.now() - parseInt(zeitstempel, 10);
  if (!Number.isFinite(alter) || alter > MAX_ALTER_MS || alter < -MAX_ALTER_MS) {
    return { ok: false, grund: 'zeitstempel_abgelaufen' };
  }

  const quelle = String(methode).toUpperCase() + uri + rohBody + zeitstempel;
  const erwartet = crypto.createHmac('sha256', geheimnis).update(quelle, 'utf8').digest('base64');

  return gleich(erwartet, signatur) ? { ok: true } : { ok: false, grund: 'signatur_falsch' };
}

/**
 * Die von aussen sichtbare URL rekonstruieren. Hinter einem Reverse-Proxy
 * sieht der Node-Prozess nur http://127.0.0.1 — HubSpot hat aber die
 * oeffentliche https-Adresse signiert.
 */
function oeffentlicheUrl(anfrage, cfgServer) {
  if (cfgServer.oeffentlicheUrl) {
    return cfgServer.oeffentlicheUrl.replace(/\/+$/, '') + anfrage.url;
  }
  const kopf = anfrage.headers || {};
  const schema = String(kopf['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(kopf['x-forwarded-host'] || kopf.host || '').split(',')[0].trim();
  return schema + '://' + host + anfrage.url;
}

/**
 * Macht aus allem, was hereinkommen kann, eine Liste von
 * { objektTyp, objektId, quelle, propertyName, propertyValue, eventId }.
 */
function normalisiereEreignisse(rumpf) {
  const ereignisse = [];

  const hinzu = (typ, id, zusatz) => {
    if (!typ || !id) return;
    ereignisse.push(Object.assign({
      objektTyp: pfadFuer(typ),
      objektId: String(id)
    }, zusatz || {}));
  };

  /* 1. Abonnement-Ereignisse: immer ein Array. */
  if (Array.isArray(rumpf)) {
    for (const e of rumpf) {
      if (!e || typeof e !== 'object') continue;

      let typ = '';
      if (e.subscriptionType && String(e.subscriptionType).indexOf('.') !== -1) {
        typ = String(e.subscriptionType).split('.')[0];
      }
      /* Bei "object.propertyChange" steht die Art in objectTypeId. */
      if ((!typ || typ === 'object') && e.objectTypeId) {
        typ = VON_OBJEKT_ID[String(e.objectTypeId)] || '';
      }

      hinzu(typ, e.objectId, {
        quelle: 'abonnement',
        propertyName: e.propertyName || '',
        propertyValue: e.propertyValue === undefined ? '' : String(e.propertyValue),
        eventId: e.eventId === undefined ? '' : String(e.eventId),
        occurredAt: e.occurredAt || 0
      });
    }
    return ereignisse;
  }

  if (!rumpf || typeof rumpf !== 'object') return ereignisse;

  /* 2. Ausdrueckliche Angabe — Workflow mit eigenem Rumpf, oder Handaufruf. */
  const typAngabe = rumpf.objektTyp || rumpf.objectType ||
    (rumpf.objectTypeId ? VON_OBJEKT_ID[String(rumpf.objectTypeId)] : '');
  const idAngabe = rumpf.objektId || rumpf.objectId || rumpf.recordId || rumpf.hs_object_id;

  if (typAngabe && idAngabe) {
    hinzu(typAngabe, idAngabe, {
      quelle: 'direkt',
      propertyName: rumpf.propertyName || '',
      propertyValue: rumpf.propertyValue === undefined ? '' : String(rumpf.propertyValue)
    });
    return ereignisse;
  }

  /* 3. Standardrumpf eines HubSpot-Workflow-Webhooks. */
  if (rumpf.vid) { hinzu('contacts', rumpf.vid, { quelle: 'workflow' }); return ereignisse; }
  if (rumpf.companyId) { hinzu('companies', rumpf.companyId, { quelle: 'workflow' }); return ereignisse; }
  if (rumpf.dealId) { hinzu('deals', rumpf.dealId, { quelle: 'workflow' }); return ereignisse; }

  if (idAngabe) hinzu('contacts', idAngabe, { quelle: 'workflow_vermutet' });
  return ereignisse;
}

module.exports = { pruefeSignaturV3, normalisiereEreignisse, oeffentlicheUrl, gleich, MAX_ALTER_MS };
