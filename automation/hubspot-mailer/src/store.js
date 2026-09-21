/* =============================================================================
 *  Ledger — die Stelle, an der doppelte Mails scheitern
 *
 *  Eine Datei, eine Zeile JSON je Ereignis, nach jedem Schreiben ein fsync.
 *  Daneben ein Index im Arbeitsspeicher, der beim Start aus der Datei
 *  wiederhergestellt wird.
 *
 *  Der entscheidende Punkt ist die Reihenfolge: Der Anspruch auf eine Send-ID
 *  wird geschrieben und auf die Platte gezwungen, BEVOR Gmail aufgerufen wird.
 *  Stuerzt der Dienst mitten im Versand ab, findet er nach dem Neustart einen
 *  Eintrag im Zustand "sending" vor und sendet eben nicht noch einmal. Der
 *  umgekehrte Weg — erst senden, dann vermerken — verliert genau in diesem
 *  Moment und verschickt die Mail doppelt.
 *
 *  claim() ist bewusst durchgehend synchron. Damit kann sich zwischen der
 *  Pruefung und dem Vermerk kein zweiter Vorgang dazwischenschieben; in einer
 *  Node-Ereignisschleife gibt es innerhalb eines synchronen Blocks kein Rennen.
 *
 *  Grenze, klar benannt: Das schuetzt einen Prozess auf einer Maschine. Wer
 *  mehrere Instanzen parallel betreibt, tauscht diese Datei gegen Postgres
 *  oder Redis — die vier Methoden unten sind die ganze Schnittstelle.
 * ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const ZUSTAND = {
  SENDING: 'sending',       /* beansprucht, Ausgang offen */
  SENT: 'sent',             /* quittiert von Gmail */
  FAILED: 'failed',         /* sauber gescheitert, darf erneut versucht werden */
  NEEDS_REVIEW: 'needs_review' /* Ausgang unklar, nie automatisch wiederholen */
};

class Ledger {
  constructor(optionen) {
    optionen = optionen || {};
    this.datei = optionen.datei || path.join(__dirname, '..', 'data', 'ledger.jsonl');
    this.verdichtenAb = optionen.verdichtenAb || 20000;
    this.aufbewahrungTage = optionen.aufbewahrungTage || 400;
    this.index = new Map();
    this.zeilen = 0;
    this.griff = null;
  }

  /* ----------------------------------------------------------- Oeffnen */
  oeffne() {
    fs.mkdirSync(path.dirname(this.datei), { recursive: true });
    this._lies();
    if (this.zeilen > this.verdichtenAb) this.verdichte();
    this.griff = fs.openSync(this.datei, 'a');
    return this;
  }

  schliesse() {
    if (this.griff !== null) {
      try { fs.closeSync(this.griff); } catch (e) { /* egal */ }
      this.griff = null;
    }
  }

  _lies() {
    let roh;
    try {
      roh = fs.readFileSync(this.datei, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return;
      throw e;
    }

    this.index.clear();
    this.zeilen = 0;

    for (const zeile of roh.split('\n')) {
      if (!zeile.trim()) continue;
      this.zeilen++;
      let e;
      try {
        e = JSON.parse(zeile);
      } catch (fehler) {
        /* Eine abgeschnittene letzte Zeile ist nach einem harten Absturz
           normal. Sie wird uebergangen, nicht als Datenverlust behandelt. */
        continue;
      }
      if (!e || !e.sendId) continue;
      this.index.set(e.sendId, Object.assign(this.index.get(e.sendId) || {}, e));
    }
  }

  _schreibe(eintrag) {
    const zeile = JSON.stringify(eintrag) + '\n';
    if (this.griff === null) this.griff = fs.openSync(this.datei, 'a');
    fs.writeSync(this.griff, zeile);
    /* Ohne fsync steht der Eintrag nur im Seiten-Cache des Betriebssystems.
       Bei Stromausfall waere er weg — und die Mail ginge beim Neustart
       ein zweites Mal raus. Der Aufruf kostet ein paar Millisekunden. */
    fs.fsyncSync(this.griff);
    this.zeilen++;
    this.index.set(eintrag.sendId, Object.assign(this.index.get(eintrag.sendId) || {}, eintrag));
  }

  /* ----------------------------------------------------------- Abfragen */
  eintrag(sendId) {
    return this.index.get(sendId) || null;
  }

  /**
   * Beansprucht eine Send-ID. Synchron und unteilbar.
   *
   * @returns {{ergebnis:string, eintrag:object|null}}
   *   'acquired'   — der Aufrufer darf senden, und nur er
   *   'duplicate'  — diese Mail ist nachweislich schon raus
   *   'in_flight'  — ein anderer Vorgang haelt den Anspruch gerade
   *   'blocked'    — steht auf Pruefung, wird nicht angefasst
   */
  claim(sendId, kopfdaten) {
    const vorhanden = this.index.get(sendId);

    if (vorhanden) {
      if (vorhanden.zustand === ZUSTAND.SENT) return { ergebnis: 'duplicate', eintrag: vorhanden };
      if (vorhanden.zustand === ZUSTAND.SENDING) return { ergebnis: 'in_flight', eintrag: vorhanden };
      if (vorhanden.zustand === ZUSTAND.NEEDS_REVIEW) return { ergebnis: 'blocked', eintrag: vorhanden };
      /* FAILED: ein sauberer Fehlschlag. Dass Gmail nicht gesendet hat, ist
         belegt, sonst staende hier needs_review. Also darf erneut. */
    }

    const eintrag = Object.assign({
      sendId: sendId,
      zustand: ZUSTAND.SENDING,
      versuche: (vorhanden && vorhanden.versuche) || 0,
      claimedAt: new Date().toISOString(),
      erstClaimAt: (vorhanden && vorhanden.erstClaimAt) || new Date().toISOString()
    }, kopfdaten || {});

    this._schreibe(eintrag);
    return { ergebnis: 'acquired', eintrag: eintrag };
  }

  markiereVersendet(sendId, daten) {
    this._schreibe(Object.assign({
      sendId: sendId,
      zustand: ZUSTAND.SENT,
      sentAt: new Date().toISOString()
    }, daten || {}));
    return this.index.get(sendId);
  }

  markiereFehler(sendId, daten) {
    this._schreibe(Object.assign({
      sendId: sendId,
      zustand: ZUSTAND.FAILED,
      failedAt: new Date().toISOString()
    }, daten || {}));
    return this.index.get(sendId);
  }

  markierePruefung(sendId, daten) {
    this._schreibe(Object.assign({
      sendId: sendId,
      zustand: ZUSTAND.NEEDS_REVIEW,
      reviewAt: new Date().toISOString()
    }, daten || {}));
    return this.index.get(sendId);
  }

  /** Wie viele Mails seit einem Zeitpunkt tatsaechlich rausgegangen sind. */
  zaehleVersendetSeit(abMs) {
    let n = 0;
    for (const e of this.index.values()) {
      if (e.zustand !== ZUSTAND.SENT || !e.sentAt) continue;
      if (Date.parse(e.sentAt) >= abMs) n++;
    }
    return n;
  }

  /** Alles, was auf einen Menschen wartet — fuer /metrics und den Betrieb. */
  offeneFaelle() {
    const faelle = [];
    for (const e of this.index.values()) {
      if (e.zustand === ZUSTAND.NEEDS_REVIEW || e.zustand === ZUSTAND.SENDING) {
        faelle.push({
          sendId: e.sendId, zustand: e.zustand,
          objectType: e.objectType, objectId: e.objectId,
          seit: e.reviewAt || e.claimedAt
        });
      }
    }
    return faelle;
  }

  /* --------------------------------------------------------- Verdichten */
  /* Aus der Ereignisliste wird der jeweils letzte Stand je Send-ID. Was
     endgueltig und aelter als die Aufbewahrungsfrist ist, faellt weg —
     offene Faelle bleiben unabhaengig vom Alter immer erhalten. */
  verdichte() {
    const grenze = Date.now() - this.aufbewahrungTage * 86400000;
    const behalten = [];

    for (const e of this.index.values()) {
      const offen = e.zustand === ZUSTAND.SENDING || e.zustand === ZUSTAND.NEEDS_REVIEW;
      const stempel = Date.parse(e.sentAt || e.failedAt || e.reviewAt || e.claimedAt || '') || 0;
      if (offen || stempel >= grenze) behalten.push(e);
    }

    const temp = this.datei + '.tmp';
    fs.writeFileSync(temp, behalten.map((e) => JSON.stringify(e)).join('\n') + (behalten.length ? '\n' : ''));

    const t = fs.openSync(temp, 'r');
    try { fs.fsyncSync(t); } finally { fs.closeSync(t); }

    if (this.griff !== null) { try { fs.closeSync(this.griff); } catch (e) { /* egal */ } this.griff = null; }
    fs.renameSync(temp, this.datei);

    this.zeilen = behalten.length;
    this.index.clear();
    for (const e of behalten) this.index.set(e.sendId, e);
    return behalten.length;
  }
}

module.exports = { Ledger, ZUSTAND };
