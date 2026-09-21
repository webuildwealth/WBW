/* =============================================================================
 *  HubSpot-Client
 *
 *  Nur das, was diese Automation braucht: Datensatz lesen, Datensatz schreiben,
 *  suchen, Verknuepfungen aufloesen, Properties anlegen.
 *
 *  Authentifizierung, zwei Wege:
 *    1. Private App — ein dauerhafter Token im Authorization-Header. Das ist
 *       der von HubSpot vorgesehene Weg fuer eine Integration, die nur im
 *       eigenen Portal laeuft, und der hier empfohlene.
 *    2. OAuth 2.0 mit Refresh-Token — fuer den Fall, dass die Automation
 *       spaeter mehrere Portale bedienen soll. Der Access-Token wird selbst
 *       erneuert und im Speicher gehalten.
 *
 *  Zu 429 und 5xx: HubSpot begrenzt auf 100 Anfragen je 10 Sekunden. Das
 *  Tempolimit haelt uns von vornherein darunter; die Wiederholung ist nur das
 *  Netz darunter und respektiert Retry-After.
 * ========================================================================== */

'use strict';

const { anfrage } = require('./http.js');
const { Tempolimit, istWiederholbar, wartezeit, schlafe } = require('./retry.js');
const log = require('./log.js');

/* HubSpot spricht in Webhooks von "contact", in Pfaden von "contacts". */
const PFAD = {
  contact: 'contacts', contacts: 'contacts',
  company: 'companies', companies: 'companies',
  lead: 'leads', leads: 'leads',
  deal: 'deals', deals: 'deals',
  ticket: 'tickets', tickets: 'tickets'
};

const OBJEKT_ID = {
  contacts: '0-1', companies: '0-2', deals: '0-3', tickets: '0-5', leads: '0-136'
};

const pfadFuer = (typ) => PFAD[String(typ || '').toLowerCase()] || String(typ || '').toLowerCase();

class HubSpot {
  constructor(cfg) {
    this.cfg = cfg.hubspot;
    this.basis = this.cfg.basis.replace(/\/+$/, '');
    this.limit = new Tempolimit(this.cfg.maxAnfragenProSekunde || 8);
    this.tokenCache = { wert: this.cfg.token || null, bis: this.cfg.token ? Infinity : 0 };
  }

  /* ------------------------------------------------------------- Token */
  async token() {
    const jetzt = Date.now();
    if (this.tokenCache.wert && this.tokenCache.bis > jetzt + 60000) return this.tokenCache.wert;

    const o = this.cfg.oauth;
    if (!o.clientId || !o.clientSecret || !o.refreshToken) {
      const f = new Error('HubSpot: kein Zugangstoken konfiguriert');
      f.code = 'HUBSPOT_NO_AUTH';
      throw f;
    }

    const daten = await anfrage(this.basis + '/oauth/v1/token', {
      method: 'POST',
      timeoutMs: this.cfg.timeoutMs,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: o.clientId,
        client_secret: o.clientSecret,
        refresh_token: o.refreshToken
      }).toString()
    });

    this.tokenCache = {
      wert: daten.access_token,
      bis: jetzt + ((daten.expires_in || 1800) * 1000)
    };
    log.debug('hubspot.token.erneuert', { gueltig_sek: daten.expires_in || 1800 });
    return this.tokenCache.wert;
  }

  /* ------------------------------------------------------------ Aufruf */
  async ruf(pfad, optionen) {
    optionen = optionen || {};
    const maxVersuche = optionen.maxVersuche || 4;

    for (let versuch = 1; ; versuch++) {
      await this.limit.nimm(1);
      const token = await this.token();

      try {
        return await anfrage(this.basis + pfad, {
          method: optionen.method || 'GET',
          timeoutMs: this.cfg.timeoutMs,
          headers: Object.assign({
            'Authorization': 'Bearer ' + token,
            'Accept': 'application/json'
          }, optionen.body ? { 'Content-Type': 'application/json' } : {}),
          body: optionen.body ? JSON.stringify(optionen.body) : undefined
        });
      } catch (e) {
        /* Abgelaufener OAuth-Token: einmal erneuern, dann weiter. */
        if (e.status === 401 && this.cfg.oauth.refreshToken && versuch === 1) {
          this.tokenCache = { wert: null, bis: 0 };
          continue;
        }

        const wiederholbar = istWiederholbar(e);
        if (wiederholbar === 'nein' || versuch >= maxVersuche) {
          e.message = 'HubSpot ' + pfad.split('?')[0] + ': ' + e.message;
          throw e;
        }

        const pause = e.retryAfter ? e.retryAfter * 1000 : wartezeit(versuch, 1000, 20000);
        log.warn('hubspot.wiederholung', { pfad: pfad.split('?')[0], versuch: versuch, status: e.status || 0, pause_ms: pause });
        await schlafe(pause);
      }
    }
  }

  /* ---------------------------------------------------------- Lesen */
  /**
   * Einen Datensatz mit ausgewaehlten Properties holen.
   * Unbekannte Property-Namen quittiert HubSpot mit 400; deshalb wird der
   * Fehler abgefangen und die Ursache im Klartext genannt, statt den
   * Aufrufer mit "400 Bad Request" stehen zu lassen.
   */
  async datensatz(typ, id, properties, assoziationen) {
    const p = new URLSearchParams();
    if (properties && properties.length) p.set('properties', properties.join(','));
    if (assoziationen && assoziationen.length) p.set('associations', assoziationen.join(','));
    p.set('archived', 'false');

    try {
      return await this.ruf('/crm/v3/objects/' + pfadFuer(typ) + '/' + encodeURIComponent(id) + '?' + p.toString());
    } catch (e) {
      if (e.status === 400 && /does not exist/i.test(e.detail || '')) {
        const treffer = /property "?([A-Za-z0-9_]+)"? does not exist/i.exec(e.detail || '');
        e.message = 'HubSpot kennt die Property "' + (treffer ? treffer[1] : '?') +
          '" am Objekt ' + pfadFuer(typ) + ' nicht. Bitte "npm run setup:properties" ausfuehren.';
        e.code = 'HUBSPOT_PROP_MISSING';
      }
      throw e;
    }
  }

  async aktualisiere(typ, id, properties) {
    return this.ruf('/crm/v3/objects/' + pfadFuer(typ) + '/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: { properties: properties }
    });
  }

  async suche(typ, filterGruppen, properties, grenze, weiterAb, sortierung) {
    const rumpf = {
      filterGroups: filterGruppen,
      properties: properties || [],
      limit: Math.min(grenze || 50, 100)
    };
    if (weiterAb) rumpf.after = weiterAb;
    if (sortierung) rumpf.sorts = sortierung;

    return this.ruf('/crm/v3/objects/' + pfadFuer(typ) + '/search', { method: 'POST', body: rumpf });
  }

  /** Verknuepfte Datensatz-IDs, z. B. Unternehmen -> Kontakte. */
  async verknuepfungen(vonTyp, vonId, zuTyp, grenze) {
    const daten = await this.ruf(
      '/crm/v4/objects/' + pfadFuer(vonTyp) + '/' + encodeURIComponent(vonId) +
      '/associations/' + pfadFuer(zuTyp) + '?limit=' + (grenze || 50)
    );
    return ((daten && daten.results) || []).map((r) => ({
      id: String(r.toObjectId),
      etiketten: ((r.associationTypes || []).map((t) => t.label).filter(Boolean))
    }));
  }

  async kontakteStapel(ids, properties) {
    if (!ids.length) return [];
    const daten = await this.ruf('/crm/v3/objects/contacts/batch/read', {
      method: 'POST',
      body: {
        properties: properties || [],
        inputs: ids.slice(0, 100).map((id) => ({ id: String(id) }))
      }
    });
    return (daten && daten.results) || [];
  }

  /* ------------------------------------------------------- Properties */
  async propertyListe(typ) {
    const daten = await this.ruf('/crm/v3/properties/' + pfadFuer(typ));
    return (daten && daten.results) || [];
  }

  async legePropertyAn(typ, definition) {
    return this.ruf('/crm/v3/properties/' + pfadFuer(typ), { method: 'POST', body: definition });
  }

  async aenderePropertyAn(typ, name, definition) {
    return this.ruf('/crm/v3/properties/' + pfadFuer(typ) + '/' + encodeURIComponent(name), {
      method: 'PATCH', body: definition
    });
  }

  async gruppenListe(typ) {
    const daten = await this.ruf('/crm/v3/properties/' + pfadFuer(typ) + '/groups');
    return (daten && daten.results) || [];
  }

  async legeGruppeAn(typ, definition) {
    return this.ruf('/crm/v3/properties/' + pfadFuer(typ) + '/groups', { method: 'POST', body: definition });
  }

  /** Portal-Kennung — dient dem Selbsttest als Beweis, dass der Token traegt. */
  async portalInfo() {
    return this.ruf('/account-info/v3/details');
  }
}

/* ------------------------------------------------------------- Werte */
/* HubSpot liefert alles als Zeichenkette. Hier stehen die drei Umwandlungen,
   die immer wieder gebraucht werden — an einer Stelle, damit sie ueberall
   gleich ausfallen. */

function alsWahrheitswert(wert) {
  const s = String(wert == null ? '' : wert).trim().toLowerCase();
  return ['true', 'ja', 'yes', 'y', '1', 'on', 'x'].indexOf(s) !== -1;
}

/** @returns {number|null} Zeitpunkt in Millisekunden seit 1970, UTC. */
function alsZeitpunkt(wert) {
  if (wert === null || wert === undefined || wert === '') return null;
  const s = String(wert).trim();
  if (/^\d{10,}$/.test(s)) return parseInt(s, 10);      /* Epoche in Millisekunden */
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

/** Schreibformat fuer HubSpot-Datetime-Properties. */
const alsHubSpotZeit = (ms) => new Date(ms).toISOString();

module.exports = { HubSpot, pfadFuer, OBJEKT_ID, alsWahrheitswert, alsZeitpunkt, alsHubSpotZeit };
