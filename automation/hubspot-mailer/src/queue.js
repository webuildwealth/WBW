/* =============================================================================
 *  Warteschlange
 *
 *  HubSpot erwartet auf einen Webhook binnen Sekunden eine Antwort, sonst
 *  gilt die Zustellung als fehlgeschlagen und wird wiederholt. Einen Versand
 *  im Anfrage-Handler zu erledigen ist deshalb der sichere Weg in eine
 *  Schleife aus Zeitueberschreitungen und Wiederholungen. Also: annehmen,
 *  quittieren, im Hintergrund abarbeiten.
 *
 *  Nebenlaeufigkeit 1 ist Absicht. Sequentiell gibt es keine Rennen um
 *  dieselbe Send-ID, keine Stolperstellen beim Tempolimit, und ein Versand
 *  dauert Bruchteile einer Sekunde — das reicht fuer jedes Volumen, das ein
 *  Gmail-Postfach ueberhaupt verschicken darf (2.000 Empfaenger am Tag).
 *
 *  Gleiche Datensaetze, die mehrfach anstehen, werden zusammengefasst: Wer
 *  in HubSpot dreimal hintereinander speichert, loest drei Ereignisse aus,
 *  meint aber eine Mail.
 * ========================================================================== */

'use strict';

const log = require('./log.js');

class Warteschlange {
  constructor(arbeit, optionen) {
    optionen = optionen || {};
    this.arbeit = arbeit;
    this.breite = Math.max(1, optionen.breite || 1);
    this.obergrenze = optionen.obergrenze || 5000;

    this.liste = [];
    this.wartend = new Set();    /* "typ:id" -> verhindert Doppeleintraege */
    this.laufend = 0;
    this.beendet = false;
    this.statistik = { angenommen: 0, zusammengefasst: 0, abgelehnt: 0, erledigt: 0, fehler: 0 };
  }

  /** @returns {'angenommen'|'zusammengefasst'|'voll'} */
  stelleEin(aufgabe) {
    if (this.beendet) return 'voll';

    const schluessel = aufgabe.objektTyp + ':' + aufgabe.objektId;

    if (this.wartend.has(schluessel)) {
      this.statistik.zusammengefasst++;
      log.debug('queue.zusammengefasst', { objectType: aufgabe.objektTyp, objectId: aufgabe.objektId });
      return 'zusammengefasst';
    }

    if (this.liste.length >= this.obergrenze) {
      this.statistik.abgelehnt++;
      log.error('queue.voll', { laenge: this.liste.length, obergrenze: this.obergrenze });
      return 'voll';
    }

    this.liste.push(aufgabe);
    this.wartend.add(schluessel);
    this.statistik.angenommen++;

    setImmediate(() => this._pumpe());
    return 'angenommen';
  }

  _pumpe() {
    while (this.laufend < this.breite && this.liste.length) {
      const aufgabe = this.liste.shift();
      this.wartend.delete(aufgabe.objektTyp + ':' + aufgabe.objektId);
      this.laufend++;

      Promise.resolve()
        .then(() => this.arbeit(aufgabe))
        .then(() => { this.statistik.erledigt++; })
        .catch((e) => {
          this.statistik.fehler++;
          /* Ein unerwarteter Fehler darf den Arbeiter nicht anhalten. Der
             Datensatz bleibt in HubSpot auf queued und der Poller nimmt ihn
             beim naechsten Durchlauf erneut auf. */
          log.error('queue.arbeitsfehler', {
            objectType: aufgabe.objektTyp, objectId: aufgabe.objektId,
            fehler: e && e.message, code: (e && e.code) || ''
          });
        })
        .finally(() => {
          this.laufend--;
          if (this.liste.length) setImmediate(() => this._pumpe());
        });
    }
  }

  get laenge() { return this.liste.length; }

  /** Wartet, bis alles Angenommene abgearbeitet ist — fuer Tests und Abschalten. */
  async leerlauf(maxMs) {
    const ende = Date.now() + (maxMs || 30000);
    while ((this.liste.length || this.laufend) && Date.now() < ende) {
      await new Promise((f) => setTimeout(f, 50));
    }
    return this.liste.length === 0 && this.laufend === 0;
  }

  schliesse() { this.beendet = true; }
}

module.exports = { Warteschlange };
