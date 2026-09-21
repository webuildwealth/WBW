/* =============================================================================
 *  Scheduler — der zweite Weg, auf dem Arbeit hereinkommt
 *
 *  Er hat zwei Aufgaben, und die zweite ist die wichtigere:
 *
 *  1. Geplante Mails faellig stellen. Ein Webhook kann nicht melden, dass
 *     "jetzt Dienstag 09:00" ist. Irgendwer muss nachsehen.
 *
 *  2. Verpasstes nachholen. Webhooks gehen verloren — der Dienst startet
 *     gerade neu, das Netz haengt, HubSpot gibt nach funf Versuchen auf.
 *     Verlaesst man sich allein darauf, bleibt eine Mail irgendwann
 *     unbemerkt liegen. Diese Abfrage findet sie beim naechsten Durchlauf.
 *
 *  Der Aufwand dafuer ist klein: eine Suchabfrage je Objektart und Durchlauf,
 *  im Minutentakt also rund 4.300 Aufrufe am Tag gegen ein Limit von 100 je
 *  zehn Sekunden. Das ist der Preis dafuer, dass nichts liegen bleibt — und
 *  weil der Weg ueber dieselbe idempotente Pipeline laeuft, kann er nichts
 *  doppelt senden, was der Webhook schon erledigt hat.
 * ========================================================================== */

'use strict';

const log = require('./log.js');
const { STATUS } = require('./status.js');

class Scheduler {
  constructor(bauteile) {
    this.cfg = bauteile.cfg;
    this.hubspot = bauteile.hubspot;
    this.einstellen = bauteile.einstellen;      /* Aufgabe -> Warteschlange */
    this.uhr = null;
    this.gestoppt = false;
    /* Objektarten, die dieses Portal nicht kennt (Leads gibt es nicht in
       jedem Tarif). Nach dem ersten Fehlschlag nicht weiter fragen. */
    this.nichtVerfuegbar = new Set();
    this.statistik = { durchlaeufe: 0, gefunden: 0, letzterLauf: null, letzterFehler: null };
  }

  starte() {
    if (this.uhr) return;
    this.gestoppt = false;
    log.info('poller.start', {
      intervall_ms: this.cfg.poller.intervallMs,
      objekte: this.cfg.objekte.join(',')
    });

    /* Erster Durchlauf mit etwas Versatz, damit der Dienst zuerst
       ansprechbar ist. */
    this.uhr = setTimeout(() => this._schleife(), 3000);
  }

  halte() {
    /* Das Merkzeichen ist noetig, weil halte() mitten in einem laufenden
       Durchlauf kommen kann. Nur den Timer zu loeschen genuegt dann nicht —
       der finally-Zweig unten wuerde gleich den naechsten setzen. */
    this.gestoppt = true;
    if (this.uhr) { clearTimeout(this.uhr); this.uhr = null; }
  }

  async _schleife() {
    try {
      await this.durchlauf();
    } catch (e) {
      this.statistik.letzterFehler = e.message;
      log.error('poller.fehler', { fehler: e.message, code: e.code || '' });
    } finally {
      if (!this.gestoppt) {
        this.uhr = setTimeout(() => this._schleife(), this.cfg.poller.intervallMs);
        /* Der Timer darf den Prozess nicht am Beenden hindern. */
        if (this.uhr.unref) this.uhr.unref();
      }
    }
  }

  /** Ein Durchlauf ueber alle Objektarten. @returns {Promise<number>} gefundene Datensaetze */
  async durchlauf() {
    const begonnen = Date.now();
    let gesamt = 0;

    for (const objektTyp of this.cfg.objekte) {
      if (this.nichtVerfuegbar.has(objektTyp)) continue;

      try {
        gesamt += await this._objektart(objektTyp);
      } catch (e) {
        if (e.status === 404 || (e.status === 400 && /object type|unknown/i.test(String(e.detail || '')))) {
          this.nichtVerfuegbar.add(objektTyp);
          log.warn('poller.objektart_unbekannt', {
            objectType: objektTyp,
            hinweis: 'Dieses Portal kennt die Objektart nicht — sie wird uebersprungen. ' +
              'Leads gibt es erst ab Sales Hub Professional.'
          });
        } else {
          log.error('poller.objektart_fehler', { objectType: objektTyp, fehler: e.message, status: e.status || 0 });
        }
      }
    }

    this.statistik.durchlaeufe++;
    this.statistik.gefunden += gesamt;
    this.statistik.letzterLauf = new Date().toISOString();

    log.debug('poller.durchlauf', { gefunden: gesamt, dauer_ms: Date.now() - begonnen });
    return gesamt;
  }

  async _objektart(objektTyp) {
    const p = this.cfg.props;
    const jetzt = Date.now() + this.cfg.poller.vorlaufMs;

    /* Gruppen sind ODER-verknuepft, Filter innerhalb einer Gruppe UND. */
    const gruppen = [];

    const freigabe = p.enabled ? [{ propertyName: p.enabled, operator: 'EQ', value: 'true' }] : [];

    /* Freigegeben und auf "jetzt" gestellt. */
    gruppen.push({ filters: freigabe.concat([{ propertyName: p.status, operator: 'EQ', value: STATUS.QUEUED }]) });

    /* Freigegeben, aber ohne Status. Das ist der Fall, den die Anforderung
       als einfachsten beschreibt: Haken setzen, fertig. Ueber den Webhook
       loest er ohnehin aus — ohne diese Gruppe faende ihn der Poller nicht,
       und dieselbe Handlung haette je nach Weg ein anderes Ergebnis. */
    if (freigabe.length) {
      gruppen.push({ filters: freigabe.concat([{ propertyName: p.status, operator: 'NOT_HAS_PROPERTY' }]) });
    }

    /* Geplant und faellig. */
    if (p.sendAt) {
      gruppen.push({
        filters: freigabe.concat([
          { propertyName: p.status, operator: 'EQ', value: STATUS.SCHEDULED },
          { propertyName: p.sendAt, operator: 'LTE', value: String(jetzt) }
        ])
      });
    } else {
      gruppen.push({ filters: freigabe.concat([{ propertyName: p.status, operator: 'EQ', value: STATUS.SCHEDULED }]) });
    }

    let weiterAb = null;
    let gefunden = 0;
    let seite = 0;

    do {
      const ergebnis = await this.hubspot.suche(
        objektTyp, gruppen, [p.status, p.sendAt].filter(Boolean),
        this.cfg.poller.menge, weiterAb
      );

      const treffer = (ergebnis && ergebnis.results) || [];
      for (const datensatz of treffer) {
        gefunden++;
        this.einstellen({ objektTyp: objektTyp, objektId: String(datensatz.id), quelle: 'poller' });
      }

      weiterAb = (ergebnis && ergebnis.paging && ergebnis.paging.next && ergebnis.paging.next.after) || null;
      seite++;
      /* Mehr als das in einer Minute abzuarbeiten schafft ohnehin kein
         Gmail-Postfach; der Rest kommt im naechsten Durchlauf. */
    } while (weiterAb && seite < 5);

    if (gefunden) log.info('poller.gefunden', { objectType: objektTyp, anzahl: gefunden });
    return gefunden;
  }
}

module.exports = { Scheduler };
