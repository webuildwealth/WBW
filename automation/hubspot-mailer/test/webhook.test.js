'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const { pruefeSignaturV3, normalisiereEreignisse, oeffentlicheUrl, gleich } = require('../src/webhook.js');
const { istWiederholbar, wartezeit, Tempolimit } = require('../src/retry.js');
const { Warteschlange } = require('../src/queue.js');

const GEHEIM = 'client-secret-der-app';
const URL = 'https://automation.finanz-medizin.com/hubspot/webhook';

function signiere(rumpf, zeitstempel, geheimnis) {
  return crypto.createHmac('sha256', geheimnis || GEHEIM)
    .update('POST' + URL + rumpf + zeitstempel, 'utf8').digest('base64');
}

/* ------------------------------------------------------------ Signatur */

test('eine echte Signatur wird angenommen', () => {
  const rumpf = '[{"objectId":1}]';
  const ts = String(Date.now());
  assert.deepStrictEqual(pruefeSignaturV3('POST', URL, rumpf, ts, signiere(rumpf, ts), GEHEIM), { ok: true });
});

test('ein veraenderter Rumpf faellt auf', () => {
  const ts = String(Date.now());
  const signatur = signiere('[{"objectId":1}]', ts);
  const ergebnis = pruefeSignaturV3('POST', URL, '[{"objectId":999}]', ts, signatur, GEHEIM);
  assert.strictEqual(ergebnis.ok, false);
  assert.strictEqual(ergebnis.grund, 'signatur_falsch');
});

test('ein fremdes Geheimnis reicht nicht', () => {
  const rumpf = '[]'; const ts = String(Date.now());
  assert.strictEqual(pruefeSignaturV3('POST', URL, rumpf, ts, signiere(rumpf, ts, 'falsch'), GEHEIM).ok, false);
});

test('eine mitgeschnittene Anfrage laesst sich nicht spaeter erneut einspielen', () => {
  const rumpf = '[]';
  const alt = String(Date.now() - 6 * 60 * 1000);
  const ergebnis = pruefeSignaturV3('POST', URL, rumpf, alt, signiere(rumpf, alt), GEHEIM);
  assert.strictEqual(ergebnis.grund, 'zeitstempel_abgelaufen');
});

test('eine andere URL passt nicht zur Signatur', () => {
  const rumpf = '[]'; const ts = String(Date.now());
  const signatur = signiere(rumpf, ts);
  assert.strictEqual(pruefeSignaturV3('POST', 'https://fremd.example/hook', rumpf, ts, signatur, GEHEIM).ok, false);
});

test('ohne Geheimnis oder ohne Signatur wird nichts durchgelassen', () => {
  const ts = String(Date.now());
  assert.strictEqual(pruefeSignaturV3('POST', URL, '[]', ts, 'x', '').grund, 'kein_geheimnis_konfiguriert');
  assert.strictEqual(pruefeSignaturV3('POST', URL, '[]', ts, '', GEHEIM).grund, 'signatur_fehlt');
  assert.strictEqual(pruefeSignaturV3('POST', URL, '[]', '', 'x', GEHEIM).grund, 'zeitstempel_fehlt');
});

test('der Vergleich verraet ueber die Laufzeit nichts', () => {
  assert.strictEqual(gleich('abc', 'abc'), true);
  assert.strictEqual(gleich('abc', 'abd'), false);
  assert.strictEqual(gleich('abc', 'abcd'), false);
  assert.strictEqual(gleich('', ''), true);
});

test('die oeffentliche URL wird aus der Konfiguration oder den Proxy-Kopfzeilen gebaut', () => {
  assert.strictEqual(
    oeffentlicheUrl({ url: '/hubspot/webhook', headers: {} },
      { oeffentlicheUrl: 'https://automation.finanz-medizin.com/' }),
    URL
  );
  assert.strictEqual(
    oeffentlicheUrl({ url: '/hubspot/webhook', headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'automation.finanz-medizin.com' } },
      { oeffentlicheUrl: '' }),
    URL
  );
});

/* ------------------------------------------------------------ Ereignisse */

test('Abonnement-Ereignisse werden vereinheitlicht', () => {
  const e = normalisiereEreignisse([
    { subscriptionType: 'contact.propertyChange', objectId: 123, propertyName: 'automation_email_status', propertyValue: 'queued', eventId: 9 },
    { subscriptionType: 'company.propertyChange', objectId: 55 }
  ]);
  assert.strictEqual(e.length, 2);
  assert.strictEqual(e[0].objektTyp, 'contacts');
  assert.strictEqual(e[0].objektId, '123');
  assert.strictEqual(e[0].propertyValue, 'queued');
  assert.strictEqual(e[1].objektTyp, 'companies');
});

test('Leads kommen ueber die objectTypeId herein', () => {
  const e = normalisiereEreignisse([{ subscriptionType: 'object.propertyChange', objectTypeId: '0-136', objectId: 7 }]);
  assert.strictEqual(e[0].objektTyp, 'leads');
  assert.strictEqual(e[0].objektId, '7');
});

test('Workflow-Webhooks in ihren verschiedenen Formen', () => {
  assert.strictEqual(normalisiereEreignisse({ objectType: 'companies', objectId: '55' })[0].objektTyp, 'companies');
  assert.strictEqual(normalisiereEreignisse({ objectTypeId: '0-1', objectId: '9' })[0].objektTyp, 'contacts');
  assert.strictEqual(normalisiereEreignisse({ vid: 4711 })[0].objektTyp, 'contacts');
  assert.strictEqual(normalisiereEreignisse({ companyId: 4711 })[0].objektTyp, 'companies');
});

test('unbrauchbare Rumpfe ergeben keine Aufgaben statt falscher', () => {
  assert.deepStrictEqual(normalisiereEreignisse(null), []);
  assert.deepStrictEqual(normalisiereEreignisse({}), []);
  assert.deepStrictEqual(normalisiereEreignisse([]), []);
  assert.deepStrictEqual(normalisiereEreignisse([{ subscriptionType: 'contact.propertyChange' }]), [], 'ohne objectId nichts');
});

/* ------------------------------------------------- Wiederholbarkeit */

test('nur belegbar folgenlose Fehler gelten als wiederholbar', () => {
  assert.strictEqual(istWiederholbar({ status: 503 }), 'ja');
  assert.strictEqual(istWiederholbar({ status: 429 }), 'ja');
  assert.strictEqual(istWiederholbar({ status: 500 }), 'ja');
  assert.strictEqual(istWiederholbar({ code: 'ECONNREFUSED' }), 'ja', 'die Verbindung kam nie zustande');

  assert.strictEqual(istWiederholbar({ status: 400 }), 'nein');
  assert.strictEqual(istWiederholbar({ status: 403 }), 'nein');
  assert.strictEqual(istWiederholbar({ status: 404 }), 'nein');

  assert.strictEqual(istWiederholbar({ code: 'ECONNRESET' }), 'unklar', 'die Anfrage koennte angekommen sein');
  assert.strictEqual(istWiederholbar({ code: 'ETIMEDOUT' }), 'unklar');
  assert.strictEqual(istWiederholbar({ name: 'AbortError' }), 'unklar');
  assert.strictEqual(istWiederholbar(new Error('etwas Unbekanntes')), 'unklar', 'im Zweifel unklar');
});

test('die Wartezeit waechst und bleibt unter der Obergrenze', () => {
  for (let versuch = 1; versuch <= 6; versuch++) {
    const w = wartezeit(versuch, 2000, 60000);
    assert.ok(w > 0 && w <= 60000 * 1.25, 'Versuch ' + versuch + ': ' + w);
  }
  const summe = (n) => { let s = 0; for (let i = 0; i < 40; i++) s += wartezeit(n, 2000, 60000); return s / 40; };
  assert.ok(summe(3) > summe(1), 'spaetere Versuche warten laenger');
});

test('das Tempolimit bremst tatsaechlich', async () => {
  const limit = new Tempolimit(50, 2);
  const start = Date.now();
  for (let i = 0; i < 4; i++) await limit.nimm(1);
  assert.ok(Date.now() - start >= 30, 'nach dem Eimer wird gewartet');
});

/* ---------------------------------------------------- Warteschlange */

test('mehrfach eingestellte Datensaetze werden zusammengefasst', async () => {
  const gesehen = [];
  const w = new Warteschlange(async (a) => { await new Promise((f) => setTimeout(f, 10)); gesehen.push(a.objektId); });

  assert.strictEqual(w.stelleEin({ objektTyp: 'contacts', objektId: '1' }), 'angenommen');
  assert.strictEqual(w.stelleEin({ objektTyp: 'contacts', objektId: '1' }), 'zusammengefasst');
  assert.strictEqual(w.stelleEin({ objektTyp: 'contacts', objektId: '2' }), 'angenommen');

  await w.leerlauf(2000);
  assert.deepStrictEqual(gesehen.sort(), ['1', '2']);
});

test('ein Fehler in einer Aufgabe haelt die Warteschlange nicht an', async () => {
  const erledigt = [];
  const w = new Warteschlange(async (a) => {
    if (a.objektId === '1') throw new Error('kaputt');
    erledigt.push(a.objektId);
  });

  w.stelleEin({ objektTyp: 'contacts', objektId: '1' });
  w.stelleEin({ objektTyp: 'contacts', objektId: '2' });

  await w.leerlauf(2000);
  assert.deepStrictEqual(erledigt, ['2']);
  assert.strictEqual(w.statistik.fehler, 1);
});

test('eine volle Warteschlange lehnt ab statt Arbeitsspeicher zu fressen', () => {
  const w = new Warteschlange(() => new Promise(() => {}), { obergrenze: 3 });
  for (let i = 0; i < 3; i++) assert.strictEqual(w.stelleEin({ objektTyp: 'contacts', objektId: String(i) }), 'angenommen');
  assert.strictEqual(w.stelleEin({ objektTyp: 'contacts', objektId: '99' }), 'voll');
});
