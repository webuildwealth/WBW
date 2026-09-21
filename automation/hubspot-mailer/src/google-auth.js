/* =============================================================================
 *  Google OAuth 2.0
 *
 *  Zwei Wege, beide echtes OAuth, beide ohne fremde Bibliothek:
 *
 *  1. Dienstkonto mit domainweiter Delegierung (Standard)
 *     Der RFC-7523-Fluss: Wir bauen ein JWT, signieren es mit dem privaten
 *     Schluessel des Dienstkontos und tauschen es bei Google gegen einen
 *     Access-Token. Im Feld "sub" steht das Postfach, in dessen Namen gesendet
 *     wird — info@finanz-medizin.com. Das funktioniert ohne Browser, ohne
 *     Benutzer und ohne Token, der irgendwann ablaeuft. Fuer einen Dienst, der
 *     jahrelang unbeaufsichtigt laufen soll, ist das der richtige Weg.
 *     Voraussetzung: Ein Workspace-Administrator traegt die Client-ID des
 *     Dienstkontos einmalig mit dem Scope gmail.send frei (siehe README).
 *
 *  2. Refresh-Token eines einzelnen Postfachs
 *     Fuer den Fall ohne Adminrechte. Gleicher Code, anderer Grant. Wichtig:
 *     Solange der OAuth-Zustimmungsbildschirm auf "Testing" steht, laeuft der
 *     Refresh-Token nach sieben Tagen ab. Fuer den Dauerbetrieb muss die App
 *     auf "In production" stehen.
 *
 *  Der private Schluessel wird nie protokolliert und verlaesst diesen Modul
 *  nicht. Tokens liegen nur im Arbeitsspeicher und werden eine Minute vor
 *  Ablauf erneuert.
 * ========================================================================== */

'use strict';

const crypto = require('crypto');
const { anfrage } = require('./http.js');
const log = require('./log.js');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const SCOPE_SENDEN = 'https://www.googleapis.com/auth/gmail.send';
const SCOPE_LESEN = 'https://www.googleapis.com/auth/gmail.readonly';

const b64url = (puffer) => Buffer.from(puffer).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

class GoogleAuth {
  constructor(cfg) {
    this.cfg = cfg.google;
    this.tokens = new Map();   /* schluessel -> { wert, bis } */
    this.konto = null;

    if (this.cfg.modus === 'service_account' && this.cfg.dienstkonto) {
      this.konto = this._leseDienstkonto(this.cfg.dienstkonto);
    }
  }

  _leseDienstkonto(roh) {
    let konto;
    try {
      konto = JSON.parse(roh);
    } catch (e) {
      /* Mehrzeiliges JSON ueberlebt .env-Dateien und Secret-Oberflaechen
         selten. Base64 ist deshalb der empfohlene Weg — genauso wie in
         lib/booking-core.js im selben Repository. */
      try {
        konto = JSON.parse(Buffer.from(roh, 'base64').toString('utf8'));
      } catch (e2) {
        const f = new Error('GOOGLE_SERVICE_ACCOUNT ist weder JSON noch base64-kodiertes JSON');
        f.code = 'GOOGLE_SA_UNLESBAR';
        throw f;
      }
    }

    if (!konto.client_email || !konto.private_key) {
      const f = new Error('GOOGLE_SERVICE_ACCOUNT: client_email oder private_key fehlt');
      f.code = 'GOOGLE_SA_UNVOLLSTAENDIG';
      throw f;
    }
    return konto;
  }

  /** Die Scopes, die der Betrieb tatsaechlich braucht. */
  scopes() {
    return this.cfg.verifizieren ? [SCOPE_SENDEN, SCOPE_LESEN] : [SCOPE_SENDEN];
  }

  /**
   * Access-Token fuer ein bestimmtes Postfach.
   * @param {string} postfach  z. B. info@finanz-medizin.com
   */
  async token(postfach) {
    const scope = this.scopes().join(' ');
    const schluessel = (postfach || '-') + '|' + scope;
    const jetzt = Date.now();

    const vorhanden = this.tokens.get(schluessel);
    if (vorhanden && vorhanden.bis > jetzt + 60000) return vorhanden.wert;

    const daten = this.cfg.modus === 'oauth'
      ? await this._perRefreshToken(scope)
      : await this._perDienstkonto(postfach, scope);

    this.tokens.set(schluessel, {
      wert: daten.access_token,
      bis: jetzt + ((daten.expires_in || 3600) * 1000)
    });

    log.debug('google.token.erneuert', {
      modus: this.cfg.modus,
      postfach: postfach,
      gueltig_sek: daten.expires_in || 3600
    });
    return daten.access_token;
  }

  async _perDienstkonto(postfach, scope) {
    if (!this.konto) {
      const f = new Error('Google: kein Dienstkonto geladen');
      f.code = 'GOOGLE_SA_FEHLT';
      throw f;
    }
    if (!postfach) {
      const f = new Error('Google: ohne Postfach kann kein Token angefordert werden');
      f.code = 'GOOGLE_SUBJECT_FEHLT';
      throw f;
    }

    const jetztSek = Math.floor(Date.now() / 1000);
    const kopf = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const rumpf = b64url(JSON.stringify({
      iss: this.konto.client_email,
      sub: postfach,                 /* <- die domainweite Delegierung */
      scope: scope,
      aud: TOKEN_URL,
      iat: jetztSek,
      exp: jetztSek + 3600
    }));

    const signatur = b64url(
      crypto.createSign('RSA-SHA256')
        .update(kopf + '.' + rumpf)
        .sign(this.konto.private_key.replace(/\\n/g, '\n'))
    );

    try {
      return await anfrage(TOKEN_URL, {
        method: 'POST',
        timeoutMs: this.cfg.timeoutMs,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: kopf + '.' + rumpf + '.' + signatur
        }).toString()
      });
    } catch (e) {
      throw this._deutlicherFehler(e, postfach);
    }
  }

  async _perRefreshToken(scope) {
    const o = this.cfg.oauth;
    try {
      return await anfrage(TOKEN_URL, {
        method: 'POST',
        timeoutMs: this.cfg.timeoutMs,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: o.clientId,
          client_secret: o.clientSecret,
          refresh_token: o.refreshToken,
          scope: scope
        }).toString()
      });
    } catch (e) {
      throw this._deutlicherFehler(e, null);
    }
  }

  /* Googles Fehlermeldungen sind kurz und die Ursache liegt fast immer an
     einer von drei Stellen. Das steht hier im Klartext, damit niemand
     raten muss. */
  _deutlicherFehler(e, postfach) {
    const detail = String(e.detail || '');

    if (/unauthorized_client/.test(detail)) {
      e.message = 'Google lehnt das Dienstkonto ab (unauthorized_client). Die domainweite Delegierung ist ' +
        'nicht oder mit anderen Scopes eingetragen. In der Admin-Konsole unter Sicherheit > API-Steuerung > ' +
        'Domainweite Delegierung muss die Client-ID (numerische client_id aus dem Dienstkonto-JSON, nicht die ' +
        'E-Mail) mit dem Scope ' + this.scopes().join(', ') + ' stehen. Nach dem Eintrag bis zu 15 Minuten warten.';
      e.code = 'GOOGLE_DWD_FEHLT';
    } else if (/invalid_grant/.test(detail)) {
      e.message = postfach
        ? 'Google lehnt die Delegierung ab (invalid_grant). Haeufigste Ursachen: das Postfach "' + postfach +
          '" existiert in dieser Workspace-Domain nicht, oder die Systemuhr des Servers geht mehr als ' +
          'eine Minute falsch (NTP pruefen).'
        : 'Google lehnt den Refresh-Token ab (invalid_grant). Entweder ist er widerrufen worden, oder der ' +
          'OAuth-Zustimmungsbildschirm steht noch auf "Testing" — dort laufen Refresh-Tokens nach sieben Tagen ab.';
      e.code = 'GOOGLE_INVALID_GRANT';
    } else if (/invalid_scope/.test(detail)) {
      e.message = 'Google lehnt die angeforderten Scopes ab: ' + this.scopes().join(', ');
      e.code = 'GOOGLE_SCOPE';
    }
    return e;
  }
}

module.exports = { GoogleAuth, SCOPE_SENDEN, SCOPE_LESEN };
