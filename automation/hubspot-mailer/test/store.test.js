'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { Ledger, ZUSTAND } = require('../src/store.js');
const { tempVerzeichnis } = require('./helpers.js');

function neuesLedger(optionen) {
  const verzeichnis = tempVerzeichnis();
  const datei = path.join(verzeichnis, 'ledger.jsonl');
  return { ledger: new Ledger(Object.assign({ datei: datei }, optionen || {})).oeffne(), datei: datei };
}

test('erster Anspruch geht durch, der zweite nicht', () => {
  const { ledger } = neuesLedger();

  assert.strictEqual(ledger.claim('s1', { objectId: '1' }).ergebnis, 'acquired');
  assert.strictEqual(ledger.claim('s1', { objectId: '1' }).ergebnis, 'in_flight');
});

test('nach erfolgreichem Versand meldet jeder weitere Anspruch eine Dublette', () => {
  const { ledger } = neuesLedger();

  ledger.claim('s1', {});
  ledger.markiereVersendet('s1', { messageId: 'gmail-1' });

  const zweiter = ledger.claim('s1', {});
  assert.strictEqual(zweiter.ergebnis, 'duplicate');
  assert.strictEqual(zweiter.eintrag.messageId, 'gmail-1');
  assert.ok(zweiter.eintrag.sentAt);
});

test('nach sauberem Fehlschlag darf erneut versucht werden', () => {
  const { ledger } = neuesLedger();

  ledger.claim('s1', {});
  ledger.markiereFehler('s1', { fehlerCode: '400' });

  assert.strictEqual(ledger.claim('s1', {}).ergebnis, 'acquired');
});

test('was auf Pruefung steht, wird nicht wieder angefasst', () => {
  const { ledger } = neuesLedger();

  ledger.claim('s1', {});
  ledger.markierePruefung('s1', { fehlerCode: 'ECONNRESET' });

  assert.strictEqual(ledger.claim('s1', {}).ergebnis, 'blocked');
  /* Auch beim zehnten Versuch nicht. */
  for (let i = 0; i < 10; i++) assert.strictEqual(ledger.claim('s1', {}).ergebnis, 'blocked');
});

test('ein Absturz zwischen Anspruch und Versand fuehrt nicht zur zweiten Mail', () => {
  const { ledger, datei } = neuesLedger();

  ledger.claim('s1', { objectId: '42' });
  /* Hier stuerzt der Dienst ab: kein markiereVersendet, kein sauberes
     Schliessen. Die Datei liegt so da, wie sie liegt. */

  const nachNeustart = new Ledger({ datei: datei }).oeffne();
  assert.strictEqual(nachNeustart.claim('s1', {}).ergebnis, 'in_flight',
    'der Anspruch aus der Datei ueberlebt den Neustart');
});

test('eine abgeschnittene letzte Zeile macht das Ledger nicht unbrauchbar', () => {
  const { ledger, datei } = neuesLedger();

  ledger.claim('s1', {});
  ledger.markiereVersendet('s1', { messageId: 'gmail-1' });
  ledger.schliesse();

  /* Stromausfall mitten im Schreiben. */
  fs.appendFileSync(datei, '{"sendId":"s2","zustand":"sen');

  const nachNeustart = new Ledger({ datei: datei }).oeffne();
  assert.strictEqual(nachNeustart.claim('s1', {}).ergebnis, 'duplicate', 'die heilen Zeilen zaehlen weiter');
  assert.strictEqual(nachNeustart.claim('s2', {}).ergebnis, 'acquired', 'die halbe Zeile wird verworfen');
});

test('jeder Schreibvorgang landet wirklich auf der Platte', () => {
  const { ledger, datei } = neuesLedger();

  ledger.claim('s1', {});
  /* Ohne erneutes Oeffnen direkt von der Platte lesen. */
  const roh = fs.readFileSync(datei, 'utf8');
  assert.ok(roh.indexOf('"s1"') !== -1);
  assert.ok(roh.indexOf('"' + ZUSTAND.SENDING + '"') !== -1);
});

test('Zaehlung fuer das Tageslimit beruecksichtigt nur echte Versendungen', () => {
  const { ledger } = neuesLedger();

  ledger.claim('a', {}); ledger.markiereVersendet('a', {});
  ledger.claim('b', {}); ledger.markiereVersendet('b', {});
  ledger.claim('c', {}); ledger.markiereFehler('c', {});
  ledger.claim('d', {});   /* noch unterwegs */

  assert.strictEqual(ledger.zaehleVersendetSeit(Date.now() - 3600000), 2);
  assert.strictEqual(ledger.zaehleVersendetSeit(Date.now() + 1000), 0, 'in der Zukunft nichts');
});

test('offene Faelle werden fuer den Betrieb ausgewiesen', () => {
  const { ledger } = neuesLedger();

  ledger.claim('a', { objectType: 'contacts', objectId: '1' });
  ledger.markiereVersendet('a', {});
  ledger.claim('b', { objectType: 'contacts', objectId: '2' });
  ledger.markierePruefung('b', {});
  ledger.claim('c', { objectType: 'companies', objectId: '3' });

  const offen = ledger.offeneFaelle();
  assert.strictEqual(offen.length, 2);
  assert.deepStrictEqual(offen.map((f) => f.sendId).sort(), ['b', 'c']);
});

test('Verdichten behaelt den letzten Stand und wirft nur Altes weg', () => {
  const { ledger, datei } = neuesLedger({ aufbewahrungTage: 30 });

  for (let i = 0; i < 5; i++) { ledger.claim('s' + i, {}); ledger.markiereVersendet('s' + i, { messageId: 'm' + i }); }

  /* Ein alter, abgeschlossener Eintrag. */
  ledger.index.set('alt', {
    sendId: 'alt', zustand: ZUSTAND.SENT,
    sentAt: new Date(Date.now() - 400 * 86400000).toISOString()
  });
  /* Und ein alter, offener — der muss bleiben. */
  ledger.index.set('altOffen', {
    sendId: 'altOffen', zustand: ZUSTAND.NEEDS_REVIEW,
    reviewAt: new Date(Date.now() - 400 * 86400000).toISOString()
  });

  const behalten = ledger.verdichte();
  assert.strictEqual(behalten, 6, '5 junge plus der alte offene Fall');

  const nachNeustart = new Ledger({ datei: datei }).oeffne();
  assert.strictEqual(nachNeustart.claim('s3', {}).ergebnis, 'duplicate');
  assert.strictEqual(nachNeustart.claim('altOffen', {}).ergebnis, 'blocked');
  assert.strictEqual(nachNeustart.claim('alt', {}).ergebnis, 'acquired', 'der alte abgeschlossene Fall ist weg');
});

test('tausend Ansprueche auf dieselbe ID ergeben genau eine Freigabe', () => {
  const { ledger } = neuesLedger();

  let freigaben = 0;
  for (let i = 0; i < 1000; i++) {
    if (ledger.claim('einmalig', {}).ergebnis === 'acquired') freigaben++;
  }
  assert.strictEqual(freigaben, 1);
});
