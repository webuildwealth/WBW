/* =============================================================================
 *  Konfiguration
 *
 *  Liest alles aus Umgebungsvariablen. Im Quelltext steht kein einziger
 *  Schluessel, kein Token, keine Adresse. Liegt eine .env neben dem Projekt,
 *  wird sie gelesen — aber sie ueberschreibt nie etwas, das die Umgebung schon
 *  gesetzt hat (auf dem Server gewinnt also immer systemd/Docker).
 *
 *  Die Namen der HubSpot-Properties sind durchgehend konfigurierbar. Wer in
 *  seinem Portal andere Namen hat, setzt sie hier um, ohne eine Zeile Code
 *  anzufassen. Ein leerer Wert schaltet die jeweilige Property ab.
 * ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const WURZEL = path.resolve(__dirname, '..');

/* ------------------------------------------------------------ .env-Leser */
/* Bewusst klein gehalten: KEY=WERT je Zeile, # als Kommentar, Anfuehrungs-
   zeichen optional. Mehrzeilige Werte (das Dienstkonto-JSON) gehoeren
   base64-kodiert in die Datei — genau wie in lib/booking-core.js. */
function ladeEnvDatei(datei) {
  let roh;
  try {
    roh = fs.readFileSync(datei, 'utf8');
  } catch (e) {
    return 0;
  }

  let uebernommen = 0;
  for (const zeile of roh.split(/\r?\n/)) {
    const t = zeile.trim();
    if (!t || t.charAt(0) === '#') continue;

    const trenner = t.indexOf('=');
    if (trenner < 1) continue;

    const schluessel = t.slice(0, trenner).trim();
    let wert = t.slice(trenner + 1).trim();

    if (wert.length > 1 && wert.charAt(0) === '"' && wert.slice(-1) === '"') {
      wert = wert.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else if (wert.length > 1 && wert.charAt(0) === "'" && wert.slice(-1) === "'") {
      wert = wert.slice(1, -1);
    }

    if (process.env[schluessel] === undefined) {
      process.env[schluessel] = wert;
      uebernommen++;
    }
  }
  return uebernommen;
}

/* ------------------------------------------------------------- Lesehilfen */
const text = (name, standard) => {
  const w = process.env[name];
  return (w === undefined || w === null) ? (standard === undefined ? '' : standard) : String(w).trim();
};

const zahl = (name, standard) => {
  const w = parseInt(process.env[name], 10);
  return Number.isFinite(w) ? w : standard;
};

const jaNein = (name, standard) => {
  const w = text(name, '').toLowerCase();
  if (!w) return standard;
  return ['1', 'true', 'ja', 'yes', 'on', 'an'].indexOf(w) !== -1;
};

const liste = (name, standard) => {
  const w = text(name, '');
  if (!w) return standard || [];
  return w.split(',').map((s) => s.trim()).filter(Boolean);
};

/* JSON, das auch base64-kodiert dastehen darf — mehrzeilige Werte sind in
   .env-Dateien und in den meisten Secret-Oberflaechen eine Fehlerquelle. */
function jsonWert(name) {
  const roh = text(name, '');
  if (!roh) return null;
  try {
    return JSON.parse(roh);
  } catch (e) { /* dann vielleicht base64 */ }
  try {
    return JSON.parse(Buffer.from(roh, 'base64').toString('utf8'));
  } catch (e) {
    const f = new Error(name + ' ist weder gueltiges JSON noch base64-kodiertes JSON');
    f.code = 'CONFIG_JSON';
    throw f;
  }
}

/* ------------------------------------------------------------- Absender */
/* Einfachster Fall: eine Adresse ueber GMAIL_SENDER_EMAIL. Wer mehrere
   Postfaecher braucht (Info, Beratung, Buchhaltung), hinterlegt sie als JSON
   in SENDER_ACCOUNTS und waehlt je Datensatz ueber die Property aus. */
function baueAbsender() {
  const konten = {};
  const ausJson = jsonWert('SENDER_ACCOUNTS');

  if (ausJson && typeof ausJson === 'object') {
    for (const schluessel of Object.keys(ausJson)) {
      const k = ausJson[schluessel] || {};
      if (!k.email) continue;
      konten[schluessel] = {
        key: schluessel,
        email: String(k.email).trim().toLowerCase(),
        name: String(k.name || '').trim(),
        replyTo: String(k.replyTo || k.reply_to || '').trim(),
        bcc: String(k.bcc || '').trim(),
        signature: String(k.signature || k.signatur || '').trim()
      };
    }
  }

  const einzelAdresse = text('GMAIL_SENDER_EMAIL', '').toLowerCase();
  if (einzelAdresse && !konten[text('SENDER_DEFAULT', 'info')]) {
    konten[text('SENDER_DEFAULT', 'info')] = {
      key: text('SENDER_DEFAULT', 'info'),
      email: einzelAdresse,
      name: text('GMAIL_SENDER_NAME', ''),
      replyTo: text('GMAIL_REPLY_TO', ''),
      bcc: text('GMAIL_BCC', ''),
      signature: ''
    };
  }

  return konten;
}

/* --------------------------------------------------------------- Aufbau */
function baueKonfig() {
  const konten = baueAbsender();
  const standardAbsender = text('SENDER_DEFAULT', 'info');

  return {
    umgebung: text('NODE_ENV', 'production'),
    zeitzone: text('TIMEZONE', 'Europe/Berlin'),
    gebietsschema: text('LOCALE', 'de-DE'),

    /* ------------------------------------------------------------ HubSpot */
    hubspot: {
      /* Privater App-Token (empfohlen) ODER OAuth-Refresh-Token. */
      token: text('HUBSPOT_ACCESS_TOKEN', ''),
      oauth: {
        clientId: text('HUBSPOT_CLIENT_ID', ''),
        clientSecret: text('HUBSPOT_CLIENT_SECRET', ''),
        refreshToken: text('HUBSPOT_REFRESH_TOKEN', '')
      },
      basis: text('HUBSPOT_API_BASE', 'https://api.hubapi.com'),
      timeoutMs: zahl('HUBSPOT_TIMEOUT_MS', 15000),
      /* Geheimnis der App — nur fuer die Signaturpruefung der Webhooks. */
      clientSecretWebhook: text('HUBSPOT_WEBHOOK_SECRET', '') || text('HUBSPOT_CLIENT_SECRET', ''),
      maxAnfragenProSekunde: zahl('HUBSPOT_MAX_RPS', 8)
    },

    /* ------------------------------------------------------------- Google */
    google: {
      /* 'service_account' = Dienstkonto mit domainweiter Delegierung (Standard,
         laeuft ohne Benutzerinteraktion durch). 'oauth' = Refresh-Token eines
         einzelnen Postfachs, falls keine Workspace-Adminrechte vorliegen. */
      modus: text('GOOGLE_AUTH_MODE', 'service_account'),
      dienstkonto: text('GOOGLE_SERVICE_ACCOUNT', ''),
      oauth: {
        clientId: text('GOOGLE_CLIENT_ID', ''),
        clientSecret: text('GOOGLE_CLIENT_SECRET', ''),
        refreshToken: text('GOOGLE_REFRESH_TOKEN', '')
      },
      timeoutMs: zahl('GMAIL_TIMEOUT_MS', 20000),
      /* Nachpruefen, ob eine Mail trotz Netzfehler doch raus ist. Braucht den
         zusaetzlichen Scope gmail.readonly — siehe README, Abschnitt Gmail. */
      verifizieren: jaNein('GMAIL_VERIFY_ENABLED', false),
      verifyFenster: zahl('GMAIL_VERIFY_LOOKBACK', 50)
    },

    /* ----------------------------------------------------------- Absender */
    absender: {
      standard: standardAbsender,
      konten: konten
    },

    /* --------------------------------------------------------- Properties */
    /* Leerer Wert = Property wird nicht gelesen und nicht geschrieben. */
    props: {
      enabled:    text('PROP_ENABLED', 'automation_email_enabled'),
      subject:    text('PROP_SUBJECT', 'automation_email_subject'),
      body:       text('PROP_BODY', 'automation_email_body'),
      sendAt:     text('PROP_SEND_AT', 'automation_send_at'),
      status:     text('PROP_STATUS', 'automation_email_status'),
      sentAt:     text('PROP_SENT_AT', 'automation_email_sent_at'),
      id:         text('PROP_ID', 'automation_email_id'),
      messageId:  text('PROP_MESSAGE_ID', 'automation_email_message_id'),
      error:      text('PROP_ERROR', 'automation_email_error'),
      attempts:   text('PROP_ATTEMPTS', 'automation_email_attempts'),
      sender:     text('PROP_SENDER', 'automation_email_sender'),
      template:   text('PROP_TEMPLATE', 'automation_email_template'),
      recipient:  text('PROP_RECIPIENT', 'automation_email_recipient'),
      sendKey:    text('PROP_SEND_KEY', 'automation_email_send_key'),
      meetingAt:  text('PROP_MEETING_AT', 'automation_meeting_at'),
      /* Nur auf Unternehmen: der eine, eindeutig gewollte Ansprechpartner. */
      contactId:  text('PROP_CONTACT_ID', 'automation_email_contact_id'),

      /* Kampagnen mit Nachfassmails. */
      sequence:       text('PROP_SEQUENCE', 'automation_sequence'),
      sequenceStep:   text('PROP_SEQUENCE_STEP', 'automation_sequence_step'),
      sequenceStatus: text('PROP_SEQUENCE_STATUS', 'automation_sequence_status')
    },

    /* ---------------------------------------------------------- Kampagnen */
    sequenz: {
      verzeichnis: text('SEQUENCE_DIR', path.join(WURZEL, 'sequences')),

      /* Keine Nachfassmail, solange nicht nachgesehen werden kann, ob der
         Empfaenger geantwortet hat. Das ist der teuerste Fehler in der
         Kaltakquise: Wer antwortet und trotzdem zweimal nachgefasst wird,
         ist als Kunde weg und markiert die Mail als Spam. Abschalten nur,
         wenn die Abbrueche in HubSpot von Hand gepflegt werden. */
      antwortpruefungPflicht: jaNein('SEQUENCE_REQUIRE_REPLY_CHECK', true),

      /* Globale Abbruchbedingungen, zusaetzlich zu denen je Kampagne.
         { "lifecyclestage": ["customer"], "hs_lead_status": ["CONNECTED"] } */
      abbruchWenn: (() => {
        try { return jsonWert('SEQUENCE_STOP_IF') || {}; } catch (e) { return {}; }
      })(),

      /* Optionale Einwilligungssperre: Solange diese Property nicht auf
         wahr steht, startet keine Kampagne. Leer = aus. Siehe README,
         Abschnitt "Bevor Sie kalt anschreiben". */
      einwilligungProperty: text('SEQUENCE_CONSENT_PROPERTY', ''),

      /* Kein Versand ausserhalb dieser Ortszeit-Stunden. Leer = jederzeit.
         "8-18" heisst: ab 08:00 und bis 17:59. */
      sendefenster: text('SEQUENCE_SEND_WINDOW', ''),
      sendetage: liste('SEQUENCE_SEND_DAYS', ['1', '2', '3', '4', '5'])
    },

    /* ----------------------------------------------------- Objektarten */
    objekte: liste('OBJECT_TYPES', ['contacts', 'companies', 'leads']),

    /* --------------------------------------------------------- Empfaenger */
    empfaenger: {
      /* Genau ein verknuepfter Kontakt am Unternehmen gilt als eindeutig.
         Alles andere (null, zwei, zehn) wird nie geraten. */
      einzelkontaktErlaubt: jaNein('RECIPIENT_SINGLE_CONTACT_FALLBACK', true),
      maxAssoziationen: zahl('RECIPIENT_MAX_ASSOCIATIONS', 50),

      /* Hat ein Unternehmen mehrere Kontakte, entscheidet die Position:
         Angeschrieben wird die Praxisinhaberin oder der Praxisinhaber, nicht
         die Empfangskraft. Trifft genau einer zu, ist der Empfaenger damit
         eindeutig; treffen mehrere zu, wird weiterhin nicht geraten. */
      inhaberTitel: liste('RECIPIENT_OWNER_TITLES', [
        'Inhaber', 'Inhaberin', 'Praxisinhaber', 'Praxisinhaberin',
        'Praxisleitung', 'Geschäftsführer', 'Geschäftsführerin',
        'Geschaeftsfuehrer', 'Geschaeftsfuehrerin', 'Ärztliche Leitung', 'Owner'
      ])
    },

    /* ------------------------------------------------------------ Versand */
    versand: {
      maxVersuche: zahl('SEND_MAX_ATTEMPTS', 3),
      grundverzoegerungMs: zahl('SEND_RETRY_BASE_MS', 2000),
      maxVerzoegerungMs: zahl('SEND_RETRY_MAX_MS', 60000),
      proMinute: zahl('SEND_MAX_PER_MINUTE', 30),
      tageslimit: zahl('SEND_DAILY_LIMIT', 1500),
      /* Alles durchlaufen, nur den Gmail-Aufruf auslassen. */
      trockenlauf: jaNein('DRY_RUN', false),
      /* Sicherheitsnetz fuer Tests am echten Portal: Ist die Liste gesetzt,
         geht Post ausschliesslich an diese Adressen oder @domains. */
      erlaubteEmpfaenger: liste('SEND_ALLOWLIST', []),
      /* Fehlt der Wert zu einem benutzten Platzhalter: 'strict' bricht ab,
         'blank' setzt Leerstring ein. */
      platzhalterRegel: text('PLACEHOLDER_POLICY', 'strict'),
      signaturAn: jaNein('SIGNATURE_ENABLED', true),

      /* Wie {{anrede}} gebildet wird, wenn am Kontakt keine Anrede steht:
           strict  gar nicht — die Mail geht nicht raus (Standard)
           formal  "Sehr geehrte Damen und Herren"
           neutral "Guten Tag"
         Das Geschlecht wird nie aus dem Vornamen erraten. Eine Praxisinhaberin
         mit "Sehr geehrter Herr" anzuschreiben ist schlimmer als gar nicht. */
      anredeRegel: text('ANREDE_POLICY', 'strict'),

      /* Feste Werte, die in jeder Mail zur Verfuegung stehen — der
         Buchungslink vor allem. Sie stehen hier und nicht im Mailtext,
         damit eine geaenderte Adresse nicht in zwanzig Texten nachgezogen
         werden muss. */
      extraPlatzhalter: (() => {
        try {
          const eigene = jsonWert('EXTRA_PLACEHOLDERS') || {};
          return Object.assign({ booking_link: text('BOOKING_LINK', 'https://finanz-medizin.com/beratung') }, eigene);
        } catch (e) {
          return { booking_link: text('BOOKING_LINK', 'https://finanz-medizin.com/beratung') };
        }
      })(),
      /* Nebenlaeufigkeit 1 ist Absicht: sequentiell gibt es keine Rennen und
         das Tempo reicht fuer jedes realistische Volumen. */
      arbeiter: zahl('WORKER_CONCURRENCY', 1)
    },

    /* ---------------------------------------------------------- Scheduler */
    poller: {
      an: jaNein('POLL_ENABLED', true),
      intervallMs: zahl('POLL_INTERVAL_MS', 60000),
      menge: zahl('POLL_BATCH_SIZE', 50),
      /* Kleiner Vorlauf, damit eine Mail nicht wegen Sekunden liegen bleibt. */
      vorlaufMs: zahl('POLL_LOOKAHEAD_MS', 30000)
    },

    /* ------------------------------------------------------------- Server */
    server: {
      port: zahl('PORT', 8080),
      host: text('HOST', '0.0.0.0'),
      webhookPfad: text('WEBHOOK_PATH', '/hubspot/webhook'),
      triggerPfad: text('TRIGGER_PATH', '/hubspot/trigger'),
      /* Fuer den Workflow-Webhook und den manuellen Trigger. */
      geteiltesGeheimnis: text('WEBHOOK_SHARED_SECRET', ''),
      /* Die von aussen sichtbare URL — geht in die HubSpot-Signatur v3 ein. */
      oeffentlicheUrl: text('PUBLIC_BASE_URL', ''),
      signaturPflicht: jaNein('WEBHOOK_REQUIRE_SIGNATURE', true),
      maxBodyBytes: zahl('WEBHOOK_MAX_BODY_BYTES', 1048576)
    },

    /* ----------------------------------------------------------- Anhaenge */
    anhang: {
      verzeichnis: text('ATTACHMENT_DIR', path.join(WURZEL, 'attachments')),
      /* Gmail nimmt 25 MB je Nachricht, und die Kodierung fuer den Versand
         schlaegt rund ein Drittel drauf. 10 MB je Datei sind reichlich fuer
         einen Flyer und lassen Luft nach oben. */
      maxBytes: zahl('ATTACHMENT_MAX_BYTES', 10 * 1024 * 1024),
      maxGesamtBytes: zahl('ATTACHMENT_MAX_TOTAL_BYTES', 15 * 1024 * 1024)
    },

    /* ------------------------------------------------------------ Ablagen */
    ablage: {
      datei: text('STORE_FILE', path.join(WURZEL, 'data', 'ledger.jsonl')),
      /* Ab dieser Zeilenzahl wird beim Start verdichtet. */
      verdichtenAb: zahl('STORE_COMPACT_LINES', 20000),
      /* Eintraege aelter als dies duerfen beim Verdichten wegfallen. */
      aufbewahrungTage: zahl('STORE_RETENTION_DAYS', 400)
    },

    /* ---------------------------------------------------------- Protokoll */
    protokoll: {
      stufe: text('LOG_LEVEL', 'info'),
      /* Standardmaessig steht kein Betreff im Log und niemals ein Mailtext. */
      betreffLoggen: jaNein('LOG_SUBJECTS', false),
      datei: text('LOG_FILE', '')
    },

    vorlagen: {
      signaturDatei: text('SIGNATURE_FILE', path.join(WURZEL, 'templates', 'signature.html')),
      rahmenDatei: text('WRAPPER_FILE', path.join(WURZEL, 'templates', 'wrapper.html'))
    }
  };
}

/* ------------------------------------------------------------- Pruefung */
/* Gibt eine Liste von Klartextproblemen zurueck. Leere Liste = startklar. */
function pruefeKonfig(cfg) {
  const probleme = [];

  if (!cfg.hubspot.token && !(cfg.hubspot.oauth.clientId && cfg.hubspot.oauth.clientSecret && cfg.hubspot.oauth.refreshToken)) {
    probleme.push('HubSpot: weder HUBSPOT_ACCESS_TOKEN noch ein vollstaendiges OAuth-Tripel (HUBSPOT_CLIENT_ID, HUBSPOT_CLIENT_SECRET, HUBSPOT_REFRESH_TOKEN) gesetzt.');
  }

  if (cfg.google.modus === 'service_account') {
    if (!cfg.google.dienstkonto) {
      probleme.push('Google: GOOGLE_SERVICE_ACCOUNT fehlt (JSON des Dienstkontos, roh oder base64).');
    }
  } else if (cfg.google.modus === 'oauth') {
    if (!cfg.google.oauth.clientId || !cfg.google.oauth.clientSecret || !cfg.google.oauth.refreshToken) {
      probleme.push('Google: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET und GOOGLE_REFRESH_TOKEN werden im Modus "oauth" alle drei gebraucht.');
    }
  } else {
    probleme.push('Google: GOOGLE_AUTH_MODE muss "service_account" oder "oauth" sein, ist aber "' + cfg.google.modus + '".');
  }

  const kontenNamen = Object.keys(cfg.absender.konten);
  if (!kontenNamen.length) {
    probleme.push('Absender: kein Postfach hinterlegt. GMAIL_SENDER_EMAIL setzen oder SENDER_ACCOUNTS als JSON.');
  } else if (!cfg.absender.konten[cfg.absender.standard]) {
    probleme.push('Absender: SENDER_DEFAULT ist "' + cfg.absender.standard + '", vorhanden sind nur: ' + kontenNamen.join(', ') + '.');
  }

  for (const pflicht of ['enabled', 'subject', 'body', 'status']) {
    if (!cfg.props[pflicht]) {
      probleme.push('Properties: PROP_' + pflicht.toUpperCase() + ' darf nicht leer sein — ohne diese Property kann die Automation nicht arbeiten.');
    }
  }

  if (cfg.server.signaturPflicht && !cfg.hubspot.clientSecretWebhook && !cfg.server.geteiltesGeheimnis) {
    probleme.push('Webhook: WEBHOOK_REQUIRE_SIGNATURE ist an, aber weder HUBSPOT_WEBHOOK_SECRET noch WEBHOOK_SHARED_SECRET ist gesetzt. Ungesicherte Endpunkte werden nicht bedient.');
  }

  if (['strict', 'blank'].indexOf(cfg.versand.platzhalterRegel) === -1) {
    probleme.push('PLACEHOLDER_POLICY muss "strict" oder "blank" sein.');
  }

  if (['strict', 'formal', 'neutral'].indexOf(cfg.versand.anredeRegel) === -1) {
    probleme.push('ANREDE_POLICY muss "strict", "formal" oder "neutral" sein, ist aber "' +
      cfg.versand.anredeRegel + '".');
  }

  if (cfg.versand.maxVersuche < 1 || cfg.versand.maxVersuche > 10) {
    probleme.push('SEND_MAX_ATTEMPTS muss zwischen 1 und 10 liegen.');
  }

  return probleme;
}

/* Einmal laden, danach ueberall dasselbe Objekt. */
let zwischenspeicher = null;

function konfig(neuLaden) {
  if (!zwischenspeicher || neuLaden) {
    ladeEnvDatei(path.join(WURZEL, '.env'));
    zwischenspeicher = baueKonfig();
  }
  return zwischenspeicher;
}

module.exports = { konfig, pruefeKonfig, ladeEnvDatei, WURZEL };
