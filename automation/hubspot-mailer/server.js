#!/usr/bin/env node
/* =============================================================================
 *  HTTP-Adapter
 *
 *  Der einzige Teil, der Node-HTTP kennt. Er nimmt an, prueft, quittiert —
 *  und gibt weiter. Gearbeitet wird in der Warteschlange dahinter.
 *
 *  Warum sofort quittiert wird: HubSpot wertet eine Zustellung als
 *  fehlgeschlagen, wenn nicht binnen weniger Sekunden geantwortet wird, und
 *  wiederholt sie dann. Wer im Anfrage-Handler auf Gmail wartet, baut sich
 *  damit genau die Ereignisflut, gegen die anderswo die Dublettenlogik
 *  ankaempft. Also: 202, dann arbeiten.
 *
 *  Endpunkte
 *    POST /hubspot/webhook   Abonnement-Ereignisse, Signatur v3 pflicht
 *    POST /hubspot/trigger   Workflow-Webhook und Handaufruf, geteiltes Geheimnis
 *    GET  /healthz           lebt der Prozess
 *    GET  /readyz            ist er arbeitsfaehig
 *    GET  /metrics           Zaehler, mit Geheimnis geschuetzt
 * ========================================================================== */

'use strict';

const http = require('http');

const { App } = require('./src/app.js');
const log = require('./src/log.js');
const { pruefeSignaturV3, normalisiereEreignisse, oeffentlicheUrl, gleich } = require('./src/webhook.js');

/* ------------------------------------------------------------- Werkzeug */
function antworte(res, status, koerper) {
  const text = typeof koerper === 'string' ? koerper : JSON.stringify(koerper || {});
  res.writeHead(status, {
    'Content-Type': typeof koerper === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(text);
}

/** Liest den Rumpf mit harter Obergrenze — unbegrenztes Lesen ist eine Einladung. */
function leseRumpf(req, maxBytes) {
  return new Promise((fertig, scheitern) => {
    const teile = [];
    let laenge = 0;

    req.on('data', (stueck) => {
      laenge += stueck.length;
      if (laenge > maxBytes) {
        const f = new Error('Rumpf zu gross');
        f.zuGross = true;
        req.destroy();
        scheitern(f);
        return;
      }
      teile.push(stueck);
    });

    req.on('end', () => fertig(Buffer.concat(teile).toString('utf8')));
    req.on('error', scheitern);
  });
}

function geheimnisAusAnfrage(req) {
  const kopf = req.headers || {};
  const auth = String(kopf.authorization || '');
  if (auth.toLowerCase().indexOf('bearer ') === 0) return auth.slice(7).trim();
  return String(kopf['x-automation-token'] || '').trim();
}

/* ---------------------------------------------------------------- Start */
function starte() {
  let app;
  try {
    app = new App().starte();
  } catch (e) {
    process.stderr.write('\nStart nicht moeglich.\n\n' + e.message + '\n\n' +
      'Die Konfiguration steht in .env oder in den Umgebungsvariablen des Dienstes.\n' +
      'Zum Pruefen: npm run check\n\n');
    process.exit(1);
    return;
  }

  const cfg = app.cfg;

  const server = http.createServer(async (req, res) => {
    const pfad = String(req.url || '').split('?')[0];
    const methode = String(req.method || 'GET').toUpperCase();

    try {
      /* ------------------------------------------------------ Gesundheit */
      if (methode === 'GET' && pfad === '/healthz') {
        return antworte(res, 200, { ok: true, dienst: 'hubspot-mailer' });
      }

      if (methode === 'GET' && pfad === '/readyz') {
        const bereit = app.ledger.griff !== null;
        return antworte(res, bereit ? 200 : 503, { ok: bereit, warteschlange: app.warteschlange.laenge });
      }

      if (methode === 'GET' && pfad === '/metrics') {
        /* Ohne hinterlegtes Geheimnis bleibt der Endpunkt zu. Die Zahlen
           verraten zwar keine Inhalte, aber sehr wohl, wie viel wann an wen
           verschickt wird — das ist nichts fuer die offene Strasse. */
        if (!cfg.server.geteiltesGeheimnis) {
          return antworte(res, 404, { ok: false, fehler: 'nicht verfuegbar — WEBHOOK_SHARED_SECRET ist nicht gesetzt' });
        }
        if (!gleich(geheimnisAusAnfrage(req), cfg.server.geteiltesGeheimnis)) {
          return antworte(res, 401, { ok: false, fehler: 'nicht berechtigt' });
        }
        return antworte(res, 200, app.zustand());
      }

      /* -------------------------------------------------------- Webhook */
      if (methode === 'POST' && (pfad === cfg.server.webhookPfad || pfad === cfg.server.triggerPfad)) {
        let roh;
        try {
          roh = await leseRumpf(req, cfg.server.maxBodyBytes);
        } catch (e) {
          return antworte(res, e.zuGross ? 413 : 400, { ok: false, fehler: 'Rumpf nicht lesbar' });
        }

        const istAbonnement = pfad === cfg.server.webhookPfad;

        /* ---- Berechtigung ---- */
        if (istAbonnement) {
          const pruefung = pruefeSignaturV3(
            methode,
            oeffentlicheUrl(req, cfg.server),
            roh,
            req.headers['x-hubspot-request-timestamp'],
            req.headers['x-hubspot-signature-v3'],
            cfg.hubspot.clientSecretWebhook
          );

          if (!pruefung.ok) {
            /* Ein Ausweg fuer Portale, die keine Signatur schicken koennen:
               dasselbe geteilte Geheimnis wie am Trigger-Endpunkt. */
            const mitGeheimnis = cfg.server.geteiltesGeheimnis &&
              gleich(geheimnisAusAnfrage(req), cfg.server.geteiltesGeheimnis);

            if (!mitGeheimnis && cfg.server.signaturPflicht) {
              log.warn('webhook.abgewiesen', {
                grund: pruefung.grund, pfad: pfad,
                ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()
              });
              /* 401 und nicht 403: HubSpot wiederholt dann nicht endlos. */
              return antworte(res, 401, { ok: false, fehler: 'Signatur nicht gueltig' });
            }
          }
        } else {
          if (!cfg.server.geteiltesGeheimnis || !gleich(geheimnisAusAnfrage(req), cfg.server.geteiltesGeheimnis)) {
            log.warn('trigger.abgewiesen', {
              ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()
            });
            return antworte(res, 401, { ok: false, fehler: 'nicht berechtigt' });
          }
        }

        /* ---- Auswerten ---- */
        let rumpf;
        try {
          rumpf = roh ? JSON.parse(roh) : {};
        } catch (e) {
          return antworte(res, 400, { ok: false, fehler: 'Kein gueltiges JSON' });
        }

        const ereignisse = normalisiereEreignisse(rumpf);
        if (!ereignisse.length) {
          log.warn('webhook.ohne_datensatz', { pfad: pfad, bytes: roh.length });
          return antworte(res, 202, { ok: true, angenommen: 0, hinweis: 'Kein Datensatz erkennbar' });
        }

        const ergebnis = app.nimmEreignisse(ereignisse);
        log.info('webhook.angenommen', Object.assign({ pfad: pfad, ereignisse: ereignisse.length }, ergebnis));

        return antworte(res, 202, Object.assign({ ok: true }, ergebnis));
      }

      antworte(res, 404, { ok: false, fehler: 'unbekannter Pfad' });

    } catch (e) {
      log.error('server.fehler', { pfad: pfad, fehler: e.message, code: e.code || '' });
      antworte(res, 500, { ok: false, fehler: 'interner Fehler' });
    }
  });

  /* Etwas mehr als die 10 Sekunden, die HubSpot wartet. */
  server.headersTimeout = 20000;
  server.requestTimeout = 30000;

  server.listen(cfg.server.port, cfg.server.host, () => {
    log.info('server.bereit', {
      host: cfg.server.host, port: cfg.server.port,
      webhook: cfg.server.webhookPfad, trigger: cfg.server.triggerPfad
    });
  });

  /* ------------------------------------------------------- Sauber enden */
  let endetGerade = false;
  const ende = async (signal) => {
    if (endetGerade) return;
    endetGerade = true;
    log.info('dienst.beenden', { signal: signal });

    server.close();
    /* Angenommene Arbeit wird noch fertig gemacht — sonst bliebe ein
       Anspruch im Ledger stehen und die Mail muesste von Hand geprueft
       werden, obwohl gar nichts schiefgegangen ist. */
    await app.halte();
    process.exit(0);
  };

  process.on('SIGTERM', () => ende('SIGTERM'));
  process.on('SIGINT', () => ende('SIGINT'));

  process.on('unhandledRejection', (grund) => {
    log.error('prozess.unbehandelte_ablehnung', {
      fehler: (grund && grund.message) || String(grund),
      code: (grund && grund.code) || ''
    });
  });

  process.on('uncaughtException', (e) => {
    log.error('prozess.ausnahme', { fehler: e.message, stack: String(e.stack || '').split('\n').slice(0, 4).join(' | ') });
    /* Nach einer unbehandelten Ausnahme ist der Zustand des Prozesses
       ungewiss. Beenden und vom Dienstmanager neu starten lassen ist
       sicherer als weiterzumachen — das Ledger liegt auf der Platte. */
    ende('uncaughtException').catch(() => process.exit(1));
  });
}

if (require.main === module) starte();

module.exports = { starte };
