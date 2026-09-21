/* =============================================================================
 *  Kampagnen mit Nachfassmails
 *
 *  Eine Sequenz ist eine Liste von Schritten mit Abstaenden. Sie liegt als
 *  Textdatei in sequences/ und laesst sich bearbeiten, ohne den Code
 *  anzufassen.
 *
 *  Der wichtigste Teil dieser Datei ist nicht das Verschicken, sondern das
 *  Aufhoeren. Wer auf eine Kaltakquise-Mail antwortet und danach trotzdem
 *  zwei Nachfassmails bekommt, ist als Kunde verloren — und markiert die
 *  Nachricht als Spam, was der Domain mehr schadet als der Kontakt wert war.
 *
 *  Deshalb gibt es vier Abbruchbedingungen, und drei davon greifen ohne
 *  jedes Zutun:
 *
 *    1. Antwort im Thread    braucht Gmail-Lesezugriff (gmail.readonly)
 *    2. HubSpot-Felder       z. B. lifecyclestage = customer
 *    3. Statusfeld von Hand  automation_sequence_status = stopped_manual
 *    4. Sequenz zu Ende      alle Schritte verschickt
 *
 *  Ohne 1. laeuft die Sequenz blind weiter. Deshalb verweigert der Dienst
 *  standardmaessig die Nachfassmail, wenn er nicht nachsehen kann, ob
 *  geantwortet wurde (SEQUENCE_REQUIRE_REPLY_CHECK). Wer das abschaltet,
 *  muss die Abbrueche in HubSpot selbst pflegen.
 * ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const log = require('./log.js');

const SEQ_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  STOPPED_REPLY: 'stopped_reply',
  STOPPED_CONDITION: 'stopped_condition',
  STOPPED_MANUAL: 'stopped_manual'
};

const SEQ_STATUS_ALLE = [
  SEQ_STATUS.ACTIVE, SEQ_STATUS.COMPLETED, SEQ_STATUS.STOPPED_REPLY,
  SEQ_STATUS.STOPPED_CONDITION, SEQ_STATUS.STOPPED_MANUAL
];

const SEQ_BESCHRIFTUNG = {
  active: 'Laeuft',
  completed: 'Abgeschlossen',
  stopped_reply: 'Gestoppt — hat geantwortet',
  stopped_condition: 'Gestoppt — Bedingung erfuellt',
  stopped_manual: 'Gestoppt — von Hand'
};

/* Zustaende, aus denen heraus kein weiterer Schritt mehr verschickt wird. */
const SEQ_BEENDET = [
  SEQ_STATUS.COMPLETED, SEQ_STATUS.STOPPED_REPLY,
  SEQ_STATUS.STOPPED_CONDITION, SEQ_STATUS.STOPPED_MANUAL
];

class Sequenzen {
  constructor(verzeichnis) {
    this.verzeichnis = verzeichnis;
    this.liste = new Map();
  }

  /** Laedt alle sequences/*.js. Eine kaputte Datei haelt die anderen nicht auf. */
  lade() {
    this.liste.clear();

    let dateien;
    try {
      dateien = fs.readdirSync(this.verzeichnis).filter((d) => d.endsWith('.js'));
    } catch (e) {
      if (e.code !== 'ENOENT') log.warn('sequenz.verzeichnis_unlesbar', { pfad: this.verzeichnis, fehler: e.message });
      return this;
    }

    for (const datei of dateien) {
      const pfad = path.join(this.verzeichnis, datei);
      try {
        delete require.cache[require.resolve(pfad)];
        const sequenz = require(pfad);
        const probleme = pruefeSequenz(sequenz);

        if (probleme.length) {
          log.error('sequenz.ungueltig', { datei: datei, probleme: probleme });
          continue;
        }

        this.liste.set(sequenz.schluessel, sequenz);
        log.debug('sequenz.geladen', { schluessel: sequenz.schluessel, schritte: sequenz.schritte.length });
      } catch (e) {
        log.error('sequenz.nicht_ladbar', { datei: datei, fehler: e.message });
      }
    }

    return this;
  }

  fuer(schluessel) {
    const s = String(schluessel || '').trim();
    return s ? (this.liste.get(s) || null) : null;
  }

  schluessel() {
    return Array.from(this.liste.keys());
  }
}

/* ------------------------------------------------------------- Pruefung */
function pruefeSequenz(sequenz) {
  const probleme = [];
  if (!sequenz || typeof sequenz !== 'object') return ['ist kein Objekt'];
  if (!sequenz.schluessel) probleme.push('schluessel fehlt');
  if (!Array.isArray(sequenz.schritte) || !sequenz.schritte.length) {
    probleme.push('schritte fehlen oder sind leer');
    return probleme;
  }

  sequenz.schritte.forEach((schritt, i) => {
    const nr = i + 1;
    if (!schritt || typeof schritt !== 'object') { probleme.push('Schritt ' + nr + ' ist kein Objekt'); return; }
    if (!String(schritt.betreff || '').trim()) probleme.push('Schritt ' + nr + ': betreff fehlt');
    if (!String(schritt.rumpf || '').trim()) probleme.push('Schritt ' + nr + ': rumpf fehlt');

    const tage = Number(schritt.nachTagen);
    if (!Number.isFinite(tage) || tage < 0) probleme.push('Schritt ' + nr + ': nachTagen muss eine Zahl >= 0 sein');
    if (i === 0 && tage !== 0) probleme.push('Schritt 1: nachTagen muss 0 sein — der erste Schritt geht sofort raus');

    if (schritt.anhaenge !== undefined) {
      if (!Array.isArray(schritt.anhaenge)) {
        probleme.push('Schritt ' + nr + ': anhaenge muss eine Liste von Dateinamen sein');
      } else {
        for (const name of schritt.anhaenge) {
          if (typeof name !== 'string' || !name.trim()) {
            probleme.push('Schritt ' + nr + ': ein Anhang ohne Dateinamen');
          } else if (name !== require('path').basename(name)) {
            probleme.push('Schritt ' + nr + ': "' + name + '" ist ein Pfad. Erlaubt sind nur Dateinamen; ' +
              'die Datei gehoert in das Anhangverzeichnis.');
          }
        }
      }
    }
  });

  return probleme;
}

/* ------------------------------------------------------------ Abbruch */
/**
 * Prueft die Abbruchbedingungen, die sich allein aus HubSpot beantworten
 * lassen. Die Antwortpruefung ueber Gmail laeuft getrennt, weil sie einen
 * Netzaufruf kostet und nur ab dem zweiten Schritt noetig ist.
 *
 * @returns {{grund:string, feld?:string, wert?:string}|null}
 */
function pruefeAbbruch(sequenz, props, cfg) {
  /* 1. Von Hand gestoppt oder schon beendet. */
  const status = String(props[cfg.props.sequenceStatus] || '').trim().toLowerCase();
  if (status && SEQ_BEENDET.indexOf(status) !== -1) {
    return { grund: status };
  }

  /* 2. Bedingungen aus der Sequenz und aus der Umgebung, zusammengefuehrt.
        Beide Seiten duerfen dasselbe Feld nennen; die Werte addieren sich. */
  const bedingungen = {};
  for (const quelle of [cfg.sequenz.abbruchWenn, sequenz.abbruchWenn]) {
    if (!quelle || typeof quelle !== 'object') continue;
    for (const [feld, werte] of Object.entries(quelle)) {
      const liste = Array.isArray(werte) ? werte : [werte];
      bedingungen[feld] = (bedingungen[feld] || []).concat(liste.map((w) => String(w).toLowerCase()));
    }
  }

  for (const [feld, werte] of Object.entries(bedingungen)) {
    const ist = String(props[feld] || '').trim().toLowerCase();
    if (ist && werte.indexOf(ist) !== -1) {
      return { grund: SEQ_STATUS.STOPPED_CONDITION, feld: feld, wert: ist };
    }
  }

  return null;
}

/**
 * Welcher Schritt ist als naechstes dran?
 * @returns {{nummer:number, schritt:object}|null}  null = Sequenz durch
 */
function naechsterSchritt(sequenz, zuletztGesendet) {
  const nummer = (parseInt(zuletztGesendet, 10) || 0) + 1;
  if (nummer > sequenz.schritte.length) return null;
  return { nummer: nummer, schritt: sequenz.schritte[nummer - 1] };
}

/** Wann der Schritt nach diesem faellig ist — null, wenn es keinen mehr gibt. */
function faelligkeitDanach(sequenz, geradeGesendet, ab) {
  const naechster = sequenz.schritte[geradeGesendet];   /* 0-basiert = der uebernaechste in 1-basiert */
  if (!naechster) return null;
  return (ab || Date.now()) + Number(naechster.nachTagen || 0) * 86400000;
}

module.exports = {
  Sequenzen, pruefeSequenz, pruefeAbbruch, naechsterSchritt, faelligkeitDanach,
  SEQ_STATUS, SEQ_STATUS_ALLE, SEQ_BESCHRIFTUNG, SEQ_BEENDET
};
