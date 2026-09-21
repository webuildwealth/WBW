/* =============================================================================
 *  Gmail-Versand
 *
 *  Ein einziger API-Aufruf tut die eigentliche Arbeit: messages.send mit der
 *  fertigen Nachricht. Alles Uebrige hier dient der Frage, die nach einem
 *  Fehler zaehlt — ist die Mail nun raus oder nicht.
 *
 *  Dafuer gibt es pruefeVersand(): ein Blick in den Ordner "Gesendet" nach der
 *  Kopfzeile X-Automation-Send-Id. Nicht ueber die Gmail-Suche (die indiziert
 *  eigene Kopfzeilen nicht), sondern indem die letzten Nachrichten im Ordner
 *  einzeln nach ihren Kopfzeilen gefragt werden. Das kostet ein paar Aufrufe,
 *  passiert aber nur im Zweifelsfall.
 *
 *  Dieser Blick braucht den Scope gmail.readonly. Wer ihn nicht vergeben will,
 *  laesst GMAIL_VERIFY_ENABLED aus — dann landen unklare Faelle auf
 *  needs_review und ein Mensch sieht nach. Beides ist vertretbar; was nicht
 *  vertretbar waere, ist im Zweifel einfach noch einmal zu senden.
 * ========================================================================== */

'use strict';

const { anfrage } = require('./http.js');
const { Tempolimit, istWiederholbar, wartezeit, schlafe } = require('./retry.js');
const { alsBase64Url } = require('./mime.js');
const log = require('./log.js');

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';

class Gmail {
  constructor(cfg, auth) {
    this.cfg = cfg;
    this.auth = auth;
    /* Gmail rechnet in Kontingenteinheiten; ein Versand kostet 100 von 250 je
       Sekunde und Postfach. Das Limit hier ist zusaetzlich betrieblich
       gedacht: Es verhindert, dass ein versehentlich massenhaft gesetztes
       Kennzeichen in Minuten das Tageskontingent verbrennt. */
    this.limit = new Tempolimit(Math.max(0.05, (cfg.versand.proMinute || 30) / 60), 5);
  }

  async _ruf(postfach, pfad, optionen) {
    optionen = optionen || {};
    const token = await this.auth.token(postfach);
    return anfrage(GMAIL_API + pfad, {
      method: optionen.method || 'GET',
      timeoutMs: this.cfg.google.timeoutMs,
      headers: Object.assign({
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json'
      }, optionen.body ? { 'Content-Type': 'application/json' } : {}),
      body: optionen.body ? JSON.stringify(optionen.body) : undefined
    });
  }

  /**
   * Sendet genau einmal. Keine Wiederholung an dieser Stelle — ob wiederholt
   * werden darf, entscheidet die Pipeline anhand des Fehlertyps, weil nur dort
   * der Anspruch im Ledger bekannt ist.
   *
   * @returns {{id:string, threadId:string}}
   */
  async sende(postfach, rohNachricht) {
    await this.limit.nimm(1);

    try {
      const daten = await this._ruf(postfach, '/users/me/messages/send', {
        method: 'POST',
        body: { raw: alsBase64Url(rohNachricht) }
      });
      return { id: (daten && daten.id) || '', threadId: (daten && daten.threadId) || '' };
    } catch (e) {
      throw deutlicherGmailFehler(e, postfach);
    }
  }

  /**
   * Sieht im Ordner "Gesendet" nach, ob eine Send-ID schon rausgegangen ist.
   * @returns {Promise<{gefunden:boolean, messageId:string, pruefbar:boolean}>}
   *   pruefbar=false heisst: konnte nicht nachgesehen werden (Scope fehlt,
   *   Gmail nicht erreichbar). Der Aufrufer darf das nie als "nicht gesendet"
   *   auslegen.
   */
  async pruefeVersand(postfach, sendId) {
    if (!this.cfg.google.verifizieren) return { gefunden: false, messageId: '', pruefbar: false };

    try {
      const liste = await this._ruf(postfach,
        '/users/me/messages?labelIds=SENT&maxResults=' + (this.cfg.google.verifyFenster || 50));

      const nachrichten = (liste && liste.messages) || [];

      for (const n of nachrichten) {
        const kopf = await this._ruf(postfach,
          '/users/me/messages/' + encodeURIComponent(n.id) +
          '?format=metadata&metadataHeaders=X-Automation-Send-Id&metadataHeaders=Message-ID');

        const zeilen = (kopf && kopf.payload && kopf.payload.headers) || [];
        const treffer = zeilen.find((z) => String(z.name).toLowerCase() === 'x-automation-send-id');

        if (treffer && String(treffer.value).trim() === sendId) {
          const mid = zeilen.find((z) => String(z.name).toLowerCase() === 'message-id');
          return { gefunden: true, messageId: (mid && mid.value) || n.id, pruefbar: true };
        }
      }

      return { gefunden: false, messageId: '', pruefbar: true };
    } catch (e) {
      log.warn('gmail.pruefung.fehlgeschlagen', {
        postfach: postfach, sendId: sendId, status: e.status || 0, fehler: e.message
      });
      return { gefunden: false, messageId: '', pruefbar: false };
    }
  }

  /** Nur fuer den Selbsttest: beweist, dass Token und Postfach zusammenpassen. */
  async profil(postfach) {
    return this._ruf(postfach, '/users/me/profile');
  }
}

/* Die vier Gmail-Fehler, die in der Praxis vorkommen, im Klartext. */
function deutlicherGmailFehler(e, postfach) {
  const detail = String(e.detail || '');

  if (e.status === 403 && /Delegation denied|failedPrecondition/i.test(detail)) {
    e.message = 'Gmail verweigert den Versand im Namen von ' + postfach +
      '. Die domainweite Delegierung deckt den Scope gmail.send fuer dieses Postfach nicht ab.';
    e.code = 'GMAIL_DELEGATION';
  } else if (e.status === 403 && /insufficient|ACCESS_TOKEN_SCOPE/i.test(detail)) {
    e.message = 'Gmail meldet fehlende Berechtigung. Der Token traegt den noetigen Scope nicht — ' +
      'bei aktivem GMAIL_VERIFY_ENABLED muss zusaetzlich gmail.readonly freigegeben sein.';
    e.code = 'GMAIL_SCOPE';
  } else if (e.status === 429 || (e.status === 403 && /rateLimitExceeded|quotaExceeded/i.test(detail))) {
    e.message = 'Gmail-Kontingent erschoepft (Tageslimit oder Sendefrequenz). ' +
      'Google Workspace erlaubt 2.000 Empfaenger je Tag und Postfach.';
    e.code = 'GMAIL_QUOTA';
    /* Kontingentfehler sind wiederholbar — aber erst spaeter, nicht in Sekunden. */
    e.status = 429;
  } else if (e.status === 400 && /Invalid.*to header|Invalid recipient/i.test(detail)) {
    e.message = 'Gmail weist die Empfaengeradresse zurueck.';
    e.code = 'GMAIL_EMPFAENGER';
  }
  return e;
}

module.exports = { Gmail, deutlicherGmailFehler, GMAIL_API };
