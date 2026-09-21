/* =============================================================================
 *  Zusammenbau
 *
 *  Haelt die Teile zusammen und bietet nach aussen drei Dinge: Ereignisse
 *  annehmen, starten, anhalten. Der HTTP-Adapter in server.js kennt nur
 *  diese Schnittstelle — genau wie lib/lead-core.js im selben Repository
 *  nichts von Netlify weiss. Wechselt der Hoster, wird ein neuer Adapter
 *  geschrieben, und an dieser Datei aendert sich nichts.
 * ========================================================================== */

'use strict';

const fs = require('fs');

const { konfig, pruefeKonfig } = require('./config.js');
const log = require('./log.js');
const { HubSpot } = require('./hubspot.js');
const { GoogleAuth } = require('./google-auth.js');
const { Gmail } = require('./gmail.js');
const { Ledger } = require('./store.js');
const { Pipeline } = require('./pipeline.js');
const { Warteschlange } = require('./queue.js');
const { Scheduler } = require('./scheduler.js');
const { STATUS } = require('./status.js');
const { entferneKommentare } = require('./template.js');

/* Statuswerte, bei denen ein Ereignis nichts ausloesen kann. Spart je
   uebersprungenem Ereignis einen HubSpot-Aufruf. */
const UNINTERESSANT = new Set([STATUS.SENT, STATUS.CANCELLED, STATUS.DRAFT, STATUS.SENDING, STATUS.NEEDS_REVIEW]);

class App {
  constructor(cfgOptional) {
    this.cfg = cfgOptional || konfig();

    log.richteEin(this.cfg.protokoll);

    const probleme = pruefeKonfig(this.cfg);
    if (probleme.length) {
      const f = new Error('Konfiguration unvollstaendig:\n  - ' + probleme.join('\n  - '));
      f.code = 'KONFIG';
      f.probleme = probleme;
      throw f;
    }

    this.ledger = new Ledger(this.cfg.ablage).oeffne();
    this.hubspot = new HubSpot(this.cfg);
    this.auth = new GoogleAuth(this.cfg);
    this.gmail = new Gmail(this.cfg, this.auth);

    this.pipeline = new Pipeline({
      cfg: this.cfg,
      hubspot: this.hubspot,
      gmail: this.gmail,
      ledger: this.ledger,
      vorlagen: ladeVorlagen(this.cfg),
      herkunft: leseHerkunft()
    });

    this.warteschlange = new Warteschlange(
      (aufgabe) => this.pipeline.verarbeite(aufgabe.objektTyp, aufgabe.objektId, aufgabe.quelle),
      { breite: this.cfg.versand.arbeiter }
    );

    this.scheduler = new Scheduler({
      cfg: this.cfg,
      hubspot: this.hubspot,
      einstellen: (aufgabe) => this.warteschlange.stelleEin(aufgabe)
    });

    this.gestartet = null;
  }

  /**
   * Nimmt vereinheitlichte Ereignisse entgegen und stellt sie ein.
   * Antwortet sofort — gearbeitet wird im Hintergrund.
   */
  nimmEreignisse(ereignisse) {
    let angenommen = 0, uebersprungen = 0;

    for (const e of ereignisse) {
      if (!e.objektTyp || !e.objektId) { uebersprungen++; continue; }

      if (this.cfg.objekte.indexOf(e.objektTyp) === -1) {
        log.debug('ereignis.objektart_nicht_aktiv', { objectType: e.objektTyp, objectId: e.objektId });
        uebersprungen++;
        continue;
      }

      /* Wird der Status auf etwas gesetzt, das nie einen Versand ausloest,
         braucht der Datensatz gar nicht erst geladen zu werden. */
      if (e.propertyName && e.propertyName === this.cfg.props.status &&
          UNINTERESSANT.has(String(e.propertyValue || '').toLowerCase())) {
        log.debug('ereignis.ohne_wirkung', {
          objectType: e.objektTyp, objectId: e.objektId, status: e.propertyValue
        });
        uebersprungen++;
        continue;
      }

      const ergebnis = this.warteschlange.stelleEin({
        objektTyp: e.objektTyp, objektId: e.objektId, quelle: e.quelle || 'webhook'
      });

      if (ergebnis === 'voll') {
        log.error('ereignis.abgelehnt', { objectType: e.objektTyp, objectId: e.objektId });
      } else {
        angenommen++;
      }
    }

    return { angenommen: angenommen, uebersprungen: uebersprungen, warteschlange: this.warteschlange.laenge };
  }

  starte() {
    this.gestartet = new Date().toISOString();
    if (this.cfg.poller.an) this.scheduler.starte();

    log.info('dienst.start', {
      objekte: this.cfg.objekte.join(','),
      absender: Object.keys(this.cfg.absender.konten).join(','),
      google_modus: this.cfg.google.modus,
      poller: this.cfg.poller.an,
      trockenlauf: this.cfg.versand.trockenlauf,
      allowlist_aktiv: this.cfg.versand.erlaubteEmpfaenger.length > 0,
      ledger_eintraege: this.ledger.index.size
    });

    if (this.cfg.versand.trockenlauf) {
      log.warn('dienst.trockenlauf', { hinweis: 'DRY_RUN ist an — es geht keine echte Mail raus.' });
    }
    return this;
  }

  async halte() {
    this.scheduler.halte();
    this.warteschlange.schliesse();
    await this.warteschlange.leerlauf(20000);
    this.ledger.schliesse();
    log.info('dienst.gestoppt', this.pipeline.zaehler);
  }

  /** Fuer /healthz und /metrics. */
  zustand() {
    return {
      gestartet: this.gestartet,
      laufzeit_sek: Math.round(process.uptime()),
      warteschlange: this.warteschlange.laenge,
      warteschlange_statistik: this.warteschlange.statistik,
      versand: this.pipeline.zaehler,
      poller: this.scheduler.statistik,
      ledger: {
        eintraege: this.ledger.index.size,
        gesendet_24h: this.ledger.zaehleVersendetSeit(Date.now() - 86400000),
        offene_faelle: this.ledger.offeneFaelle().length
      },
      trockenlauf: this.cfg.versand.trockenlauf
    };
  }
}

/* ----------------------------------------------------------- Vorlagen */
function ladeVorlagen(cfg) {
  /* Die Kommentare in den Vorlagen erklaeren, wie sie zu bearbeiten sind —
     in der Mail selbst haben sie nichts verloren. Sie wuerden jede Nachricht
     um ein bis zwei Kilobyte aufblaehen, und wer sich die Quelltextansicht
     einer Mail ansieht, soll nicht unsere Notizen lesen. Ausserdem stuende
     sonst der erklaerende Hinweis auf {{content}} vor der echten Stelle und
     bekaeme den Mailtext ab. */
  const lies = (pfad) => {
    if (!pfad) return '';
    try {
      return entferneKommentare(fs.readFileSync(pfad, 'utf8')).replace(/^\s*\n/gm, '').trim();
    } catch (e) {
      if (e.code !== 'ENOENT') log.warn('vorlage.unlesbar', { datei: pfad, fehler: e.message });
      return '';
    }
  };

  const signatur = cfg.versand.signaturAn ? lies(cfg.vorlagen.signaturDatei) : '';
  const rahmen = lies(cfg.vorlagen.rahmenDatei);

  log.debug('vorlagen.geladen', { signatur: signatur.length, rahmen: rahmen.length });
  return { signatur: signatur, rahmen: rahmen };
}

/* Zusaetzliche Platzhalter aus der Umgebung, z. B.
   PLACEHOLDER_MAP={"praxis":"company:name","fachgebiet":"contact:fachgebiet"} */
function leseHerkunft() {
  const roh = (process.env.PLACEHOLDER_MAP || '').trim();
  if (!roh) return {};
  try {
    const abbildung = JSON.parse(roh);
    return (abbildung && typeof abbildung === 'object') ? abbildung : {};
  } catch (e) {
    log.error('konfig.placeholder_map_ungueltig', { fehler: e.message });
    return {};
  }
}

module.exports = { App, ladeVorlagen, leseHerkunft };
