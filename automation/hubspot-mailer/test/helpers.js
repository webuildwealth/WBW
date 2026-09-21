/* =============================================================================
 *  Attrappen fuer die Tests
 *
 *  HubSpot und Gmail werden nachgebaut, soweit die Pipeline sie benutzt.
 *  Das ist kein Selbstzweck: Die Aussagen, auf die es ankommt — "es ging
 *  genau eine Mail raus", "nach einem Absturz geht keine zweite raus" —
 *  lassen sich nur pruefen, wenn mitgezaehlt werden kann, wie oft gesendet
 *  wurde. Gegen die echte API ginge das nur, indem man echte Mails
 *  verschickt.
 * ========================================================================== */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/* ------------------------------------------------------------- HubSpot */
class FakeHubSpot {
  constructor() {
    this.datensaetze = new Map();     /* "typ:id" -> { id, properties } */
    this.verknuepft = new Map();      /* "vonTyp:vonId:zuTyp" -> [ids] */
    this.schreibvorgaenge = [];
    this.fehlerBeimSchreiben = null;
    this.suchergebnis = { results: [] };
  }

  lege(typ, id, properties) {
    this.datensaetze.set(typ + ':' + id, { id: String(id), properties: Object.assign({}, properties) });
    return this;
  }

  verknuepfe(vonTyp, vonId, zuTyp, ids) {
    this.verknuepft.set(vonTyp + ':' + vonId + ':' + zuTyp, ids.map(String));
    return this;
  }

  async datensatz(typ, id) {
    const d = this.datensaetze.get(typ + ':' + id);
    if (!d) { const f = new Error('nicht gefunden'); f.status = 404; throw f; }
    return { id: d.id, properties: Object.assign({}, d.properties) };
  }

  async aktualisiere(typ, id, properties) {
    if (this.fehlerBeimSchreiben) throw this.fehlerBeimSchreiben;
    const d = this.datensaetze.get(typ + ':' + id);
    if (!d) { const f = new Error('nicht gefunden'); f.status = 404; throw f; }
    Object.assign(d.properties, properties);
    this.schreibvorgaenge.push({ typ: typ, id: String(id), properties: Object.assign({}, properties) });
    return d;
  }

  async verknuepfungen(vonTyp, vonId, zuTyp) {
    return (this.verknuepft.get(vonTyp + ':' + vonId + ':' + zuTyp) || []).map((id) => ({ id: id, etiketten: [] }));
  }

  async kontakteStapel(ids) {
    const raus = [];
    for (const id of ids) {
      const d = this.datensaetze.get('contacts:' + id);
      if (d) raus.push({ id: d.id, properties: Object.assign({}, d.properties) });
    }
    return raus;
  }

  async suche() { return this.suchergebnis; }
  async portalInfo() { return { portalId: 1, timeZone: 'Europe/Berlin' }; }

  /** Der zuletzt geschriebene Wert einer Property. */
  letzterWert(name) {
    for (let i = this.schreibvorgaenge.length - 1; i >= 0; i--) {
      if (this.schreibvorgaenge[i].properties[name] !== undefined) {
        return this.schreibvorgaenge[i].properties[name];
      }
    }
    return undefined;
  }
}

/* --------------------------------------------------------------- Gmail */
class FakeGmail {
  constructor(cfg) {
    this.cfg = cfg;
    this.versendet = [];          /* jede angenommene Nachricht */
    this.fehlerFolge = [];        /* Fehler, die sende() der Reihe nach wirft */
    this.pruefungAntwort = { gefunden: false, messageId: '', pruefbar: false };
    this.pruefungen = 0;
  }

  async sende(postfach, roh) {
    const fehler = this.fehlerFolge.shift();
    if (fehler) throw fehler;

    const id = 'gmail-' + (this.versendet.length + 1);
    this.versendet.push({ postfach: postfach, roh: roh, id: id });
    return { id: id, threadId: 't-' + id };
  }

  async pruefeVersand() {
    this.pruefungen++;
    return this.pruefungAntwort;
  }

  /** Wie oft ging eine Nachricht mit dieser Send-ID raus? */
  anzahlMitSendId(sendId) {
    return this.versendet.filter((n) => n.roh.indexOf('X-Automation-Send-Id: ' + sendId) !== -1).length;
  }
}

/* ------------------------------------------------------------ Fehlertypen */
/* Gmail hat sauber geantwortet: es ist belegt, dass nichts gesendet wurde. */
function httpFehler(status, nachricht) {
  const f = new Error(nachricht || ('Status ' + status));
  f.status = status;
  f.detail = nachricht || '';
  return f;
}

/* Die Verbindung riss ab: der Ausgang ist offen. */
function netzFehler(code) {
  const f = new Error('Verbindung abgebrochen');
  f.code = code || 'ECONNRESET';
  return f;
}

/* ------------------------------------------------------------ Umgebung */
function tempVerzeichnis() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hsmailer-test-'));
}

/**
 * Baut eine Konfiguration fuer Tests. Setzt die noetigen Umgebungsvariablen
 * und laedt config.js frisch.
 */
function testKonfig(ueberschreibungen) {
  const verzeichnis = tempVerzeichnis();

  const basis = {
    HUBSPOT_ACCESS_TOKEN: 'pat-test',
    HUBSPOT_WEBHOOK_SECRET: 'webhook-geheim',
    WEBHOOK_SHARED_SECRET: 'trigger-geheim',
    GOOGLE_AUTH_MODE: 'service_account',
    GOOGLE_SERVICE_ACCOUNT: JSON.stringify({
      client_email: 'automation@projekt.iam.gserviceaccount.com',
      /* Kein Schluessel, nur ein Platzhalter: In den Tests kommt GoogleAuth
         nie zum Zuge, gesendet wird gegen FakeGmail. Bewusst ohne
         PEM-Kopfzeile, damit kein Geheimnis-Scanner hier anschlaegt. */
      private_key: 'platzhalter-kein-echter-schluessel',
      client_id: '1234567890'
    }),
    GMAIL_SENDER_EMAIL: 'info@finanz-medizin.com',
    GMAIL_SENDER_NAME: 'Finanz & Medizin',
    SENDER_DEFAULT: 'info',
    STORE_FILE: path.join(verzeichnis, 'ledger.jsonl'),
    POLL_ENABLED: 'false',
    LOG_LEVEL: 'error',
    SIGNATURE_FILE: '',
    WRAPPER_FILE: '',
    TIMEZONE: 'Europe/Berlin',
    SEND_MAX_ATTEMPTS: '3',
    SEND_RETRY_BASE_MS: '1',
    SEND_RETRY_MAX_MS: '2',
    SEND_MAX_PER_MINUTE: '6000',
    DRY_RUN: 'false',
    SEND_ALLOWLIST: '',
    PLACEHOLDER_POLICY: 'strict',
    GMAIL_VERIFY_ENABLED: 'false'
  };

  /* Alte Werte wegraeumen, damit Tests sich nicht gegenseitig beeinflussen. */
  for (const schluessel of Object.keys(basis)) delete process.env[schluessel];
  for (const schluessel of ['PLACEHOLDER_MAP', 'SENDER_ACCOUNTS', 'PROP_ENABLED', 'OBJECT_TYPES',
    'SEND_DAILY_LIMIT', 'POLL_LOOKAHEAD_MS', 'RECIPIENT_SINGLE_CONTACT_FALLBACK']) {
    delete process.env[schluessel];
  }

  Object.assign(process.env, basis, ueberschreibungen || {});

  const { konfig } = require('../src/config.js');
  const cfg = konfig(true);
  cfg._verzeichnis = verzeichnis;
  return cfg;
}

/** Eine Pipeline mit Attrappen — der uebliche Aufbau fuer die Ablauftests. */
function baueTestPipeline(ueberschreibungen) {
  const { Pipeline } = require('../src/pipeline.js');
  const { Ledger } = require('../src/store.js');

  const cfg = testKonfig(ueberschreibungen);
  const hubspot = new FakeHubSpot();
  const gmail = new FakeGmail(cfg);
  const ledger = new Ledger(cfg.ablage).oeffne();

  const pipeline = new Pipeline({ cfg: cfg, hubspot: hubspot, gmail: gmail, ledger: ledger });

  return { cfg: cfg, hubspot: hubspot, gmail: gmail, ledger: ledger, pipeline: pipeline };
}

/** Ein Kontakt, an dem alles stimmt. */
function musterKontakt(ueberschreibungen) {
  return Object.assign({
    email: 'max.mustermann@example.com',
    firstname: 'Max',
    lastname: 'Mustermann',
    company: 'Praxis Mustermann',
    automation_email_enabled: 'true',
    automation_email_status: 'queued',
    automation_email_subject: 'Ihre Unterlagen, {{firstname}}',
    automation_email_body: 'Guten Tag {{firstname}} {{lastname}},\n\nanbei die Unterlagen.\n\nViele Gruesse'
  }, ueberschreibungen || {});
}

module.exports = {
  FakeHubSpot, FakeGmail, httpFehler, netzFehler,
  testKonfig, baueTestPipeline, musterKontakt, tempVerzeichnis
};
