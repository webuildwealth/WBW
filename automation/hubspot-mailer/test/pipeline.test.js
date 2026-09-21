'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { baueTestPipeline, musterKontakt, httpFehler, netzFehler } = require('./helpers.js');
const { STATUS } = require('../src/status.js');

/* ========================================================================== */
/*  Der gute Fall                                                             */
/* ========================================================================== */

test('eine freigegebene Mail geht raus und HubSpot wird nachgefuehrt', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt());

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'test');

  assert.strictEqual(ergebnis.ergebnis, 'sent');
  assert.strictEqual(t.gmail.versendet.length, 1);
  assert.strictEqual(t.gmail.versendet[0].postfach, 'info@finanz-medizin.com');

  const geschrieben = t.hubspot.datensaetze.get('contacts:1').properties;
  assert.strictEqual(geschrieben.automation_email_status, STATUS.SENT);
  assert.strictEqual(geschrieben.automation_email_id, ergebnis.sendId);
  assert.strictEqual(geschrieben.automation_email_message_id, 'gmail-1');
  assert.ok(geschrieben.automation_email_sent_at, 'Versandzeitpunkt steht drin');
  assert.strictEqual(geschrieben.automation_email_error, '');

  /* Der Zwischenstand "sending" muss unterwegs sichtbar gewesen sein. */
  const stati = t.hubspot.schreibvorgaenge.map((s) => s.properties.automation_email_status);
  assert.ok(stati.indexOf(STATUS.SENDING) !== -1, 'Zwischenstand sending wurde gesetzt');
});

test('Platzhalter werden vor dem Versand aus HubSpot gefuellt', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt());

  await t.pipeline.verarbeite('contacts', '1', 'test');

  const roh = t.gmail.versendet[0].roh;
  const teile = roh.split(/--wbw_[0-9a-f]+/);
  const text = Buffer.from(teile[1].split('\r\n\r\n')[1].trim(), 'base64').toString('utf8');

  assert.ok(text.indexOf('Guten Tag Max Mustermann') !== -1, 'Vor- und Nachname eingesetzt');
  assert.ok(roh.indexOf('{{') === -1, 'kein Platzhalter mehr uebrig');
});

/* ========================================================================== */
/*  Keine doppelten Mails — der Kern der Anforderung                          */
/* ========================================================================== */

test('derselbe Datensatz zweimal verarbeitet sendet nur einmal', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt());

  const erste = await t.pipeline.verarbeite('contacts', '1', 'webhook');
  assert.strictEqual(erste.ergebnis, 'sent');

  /* Jemand stellt den Status von Hand zurueck auf queued. */
  t.hubspot.datensaetze.get('contacts:1').properties.automation_email_status = STATUS.QUEUED;

  const zweite = await t.pipeline.verarbeite('contacts', '1', 'webhook');
  assert.strictEqual(zweite.ergebnis, 'duplicate');
  assert.strictEqual(t.gmail.versendet.length, 1, 'es ging genau eine Mail raus');
  assert.strictEqual(zweite.sendId, erste.sendId);

  /* Und HubSpot steht danach wieder richtig. */
  assert.strictEqual(t.hubspot.datensaetze.get('contacts:1').properties.automation_email_status, STATUS.SENT);
});

test('funf gleichzeitige Webhook-Ereignisse ergeben eine Mail', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt());

  const ergebnisse = await Promise.all([1, 2, 3, 4, 5].map(() => t.pipeline.verarbeite('contacts', '1', 'webhook')));

  assert.strictEqual(t.gmail.versendet.length, 1, 'genau eine Mail');
  assert.strictEqual(ergebnisse.filter((e) => e.ergebnis === 'sent').length, 1);
  assert.strictEqual(ergebnisse.filter((e) => e.ergebnis === 'skipped').length, 4);
});

test('derselbe Text an denselben Empfaenger ergibt dieselbe Send-ID', () => {
  const t = baueTestPipeline();
  const basis = {
    objektTyp: 'contacts', objektId: '1', empfaenger: 'max@example.com',
    absender: 'info@finanz-medizin.com', betreff: 'Hallo', rumpf: 'Text', vorlage: '', freigabe: ''
  };

  assert.strictEqual(t.pipeline.baueSendId(basis), t.pipeline.baueSendId(Object.assign({}, basis)));

  /* Unsichtbare Unterschiede aendern nichts. */
  assert.strictEqual(
    t.pipeline.baueSendId(basis),
    t.pipeline.baueSendId(Object.assign({}, basis, { rumpf: '  Text  \r\n' })),
    'Leerzeichen und Zeilenenden zaehlen nicht'
  );

  /* Echte Aenderungen schon. */
  assert.notStrictEqual(t.pipeline.baueSendId(basis), t.pipeline.baueSendId(Object.assign({}, basis, { rumpf: 'Anderer Text' })));
  assert.notStrictEqual(t.pipeline.baueSendId(basis), t.pipeline.baueSendId(Object.assign({}, basis, { betreff: 'Anders' })));
  assert.notStrictEqual(t.pipeline.baueSendId(basis), t.pipeline.baueSendId(Object.assign({}, basis, { empfaenger: 'anna@example.com' })));
  assert.notStrictEqual(t.pipeline.baueSendId(basis), t.pipeline.baueSendId(Object.assign({}, basis, { objektId: '2' })));
  assert.notStrictEqual(t.pipeline.baueSendId(basis), t.pipeline.baueSendId(Object.assign({}, basis, { freigabe: 'Nachfass 1' })));
});

test('der Freigabeschluessel gibt denselben Text absichtlich erneut frei', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt());

  await t.pipeline.verarbeite('contacts', '1', 'test');

  const props = t.hubspot.datensaetze.get('contacts:1').properties;
  props.automation_email_status = STATUS.QUEUED;
  props.automation_email_send_key = 'Nachfass 1';

  const zweite = await t.pipeline.verarbeite('contacts', '1', 'test');
  assert.strictEqual(zweite.ergebnis, 'sent');
  assert.strictEqual(t.gmail.versendet.length, 2, 'diesmal ausdruecklich ein zweites Mal');
});

test('ein Absturz nach dem Versand fuehrt beim Neustart nicht zur zweiten Mail', async () => {
  const { Pipeline } = require('../src/pipeline.js');
  const { Ledger } = require('../src/store.js');

  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt());

  /* HubSpot nimmt den Erfolg nicht mehr an — wie bei einem Absturz oder
     einem Netzausfall genau in diesem Moment. */
  await t.pipeline.verarbeite('contacts', '1', 'test');
  assert.strictEqual(t.gmail.versendet.length, 1);

  t.hubspot.datensaetze.get('contacts:1').properties.automation_email_status = STATUS.QUEUED;
  t.ledger.schliesse();

  /* Dienst startet neu, Ledger wird von der Platte gelesen. */
  const neuesLedger = new Ledger(t.cfg.ablage).oeffne();
  const neuePipeline = new Pipeline({ cfg: t.cfg, hubspot: t.hubspot, gmail: t.gmail, ledger: neuesLedger });

  const ergebnis = await neuePipeline.verarbeite('contacts', '1', 'poller');
  assert.strictEqual(ergebnis.ergebnis, 'duplicate');
  assert.strictEqual(t.gmail.versendet.length, 1, 'immer noch genau eine Mail');
});

/* ========================================================================== */
/*  Wann nicht gesendet wird                                                  */
/* ========================================================================== */

test('ohne Freigabe passiert nichts', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt({ automation_email_enabled: 'false' }));

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'test');
  assert.strictEqual(ergebnis.grund, 'nicht_freigegeben');
  assert.strictEqual(t.gmail.versendet.length, 0);
});

test('abgeschlossene und abgebrochene Zustaende loesen nichts aus', async () => {
  for (const status of [STATUS.SENT, STATUS.CANCELLED, STATUS.DRAFT, STATUS.NEEDS_REVIEW, STATUS.FAILED]) {
    const t = baueTestPipeline();
    t.hubspot.lege('contacts', '1', musterKontakt({ automation_email_status: status }));

    const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'test');
    assert.strictEqual(ergebnis.ergebnis, 'skipped', status + ' darf nichts ausloesen');
    assert.strictEqual(t.gmail.versendet.length, 0);
  }
});

test('gesetzter Haken ohne Status genuegt — der einfachste Weg aus der Anforderung', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt({ automation_email_status: '' }));

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'webhook');
  assert.strictEqual(ergebnis.ergebnis, 'sent');
  assert.strictEqual(t.gmail.versendet.length, 1);
});

test('ein Entwurf bleibt ein Entwurf, auch mit gesetztem Haken', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt({ automation_email_status: 'draft' }));

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'webhook');
  assert.strictEqual(ergebnis.grund, 'status_draft');
  assert.strictEqual(t.gmail.versendet.length, 0);
});

test('ohne Empfaengeradresse wird nichts blind verschickt', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt({ email: '' }));

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'test');
  assert.strictEqual(ergebnis.ergebnis, 'failed');
  assert.strictEqual(t.gmail.versendet.length, 0);
  assert.match(t.hubspot.letzterWert('automation_email_error'), /keine E-Mail-Adresse/);
});

test('fehlender Betreff oder Inhalt haelt den Versand auf', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt({ automation_email_subject: '' }));

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'test');
  assert.strictEqual(ergebnis.ergebnis, 'failed');
  assert.match(t.hubspot.letzterWert('automation_email_error'), /automation_email_subject/);
});

test('ein Platzhalter ohne Wert bricht ab statt eine Luecke zu verschicken', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt({
    firstname: '',
    automation_email_body: 'Guten Tag {{firstname}},\n\nanbei die Unterlagen.'
  }));

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'test');
  assert.strictEqual(ergebnis.ergebnis, 'failed');
  assert.strictEqual(t.gmail.versendet.length, 0);
  assert.match(t.hubspot.letzterWert('automation_email_error'), /firstname/);
  assert.match(t.hubspot.letzterWert('automation_email_error'), /\{\{firstname\|Kunde\}\}/, 'nennt den Ausweg');
});

test('mit Ersatzwert im Text geht dieselbe Mail durch', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt({
    firstname: '',
    automation_email_subject: 'Unterlagen',
    automation_email_body: 'Guten Tag {{firstname|zusammen}},\n\nanbei die Unterlagen.'
  }));

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'test');
  assert.strictEqual(ergebnis.ergebnis, 'sent');
  assert.ok(t.gmail.versendet[0].roh.indexOf('R3V0ZW4gVGFn') !== -1 ||
    Buffer.from(t.gmail.versendet[0].roh.split(/--wbw_[0-9a-f]+/)[1].split('\r\n\r\n')[1].trim(), 'base64')
      .toString('utf8').indexOf('Guten Tag zusammen') !== -1);
});

test('SEND_ALLOWLIST schuetzt echte Kontakte im Testbetrieb', async () => {
  const t = baueTestPipeline({ SEND_ALLOWLIST: 'test@finanz-medizin.com,@beispiel.test' });
  t.hubspot.lege('contacts', '1', musterKontakt());
  t.hubspot.lege('contacts', '2', musterKontakt({ email: 'probe@beispiel.test' }));

  const gesperrt = await t.pipeline.verarbeite('contacts', '1', 'test');
  assert.strictEqual(gesperrt.ergebnis, 'failed');
  assert.match(t.hubspot.letzterWert('automation_email_error'), /SEND_ALLOWLIST/);

  const erlaubt = await t.pipeline.verarbeite('contacts', '2', 'test');
  assert.strictEqual(erlaubt.ergebnis, 'sent');
  assert.strictEqual(t.gmail.versendet.length, 1);
});

test('DRY_RUN durchlaeuft alles, ruft aber Gmail nicht auf', async () => {
  const t = baueTestPipeline({ DRY_RUN: 'true' });
  t.hubspot.lege('contacts', '1', musterKontakt());

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'test');
  assert.strictEqual(ergebnis.ergebnis, 'sent');
  assert.strictEqual(ergebnis.trockenlauf, true);
  assert.strictEqual(t.gmail.versendet.length, 0);
  assert.strictEqual(t.hubspot.letzterWert('automation_email_message_id'), 'dry-run');
});

test('ein unbekanntes Absenderkonto sendet nicht aus dem falschen Postfach', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt({ automation_email_sender: 'gibtsnicht' }));

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'test');
  assert.strictEqual(ergebnis.ergebnis, 'failed');
  assert.strictEqual(t.gmail.versendet.length, 0);
  assert.match(t.hubspot.letzterWert('automation_email_error'), /gibtsnicht/);
});

/* ========================================================================== */
/*  Zeitsteuerung                                                             */
/* ========================================================================== */

test('ein Zeitpunkt in der Zukunft stellt die Mail zurueck', async () => {
  const t = baueTestPipeline();
  const morgen = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  t.hubspot.lege('contacts', '1', musterKontakt({ automation_send_at: morgen }));

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'test');
  assert.strictEqual(ergebnis.ergebnis, 'scheduled');
  assert.strictEqual(t.gmail.versendet.length, 0);
  assert.strictEqual(t.hubspot.letzterWert('automation_email_status'), STATUS.SCHEDULED);
  assert.ok(t.ledger.eintrag(ergebnis.sendId) === null, 'ohne Versand kein Anspruch im Ledger');
});

test('ist der Zeitpunkt erreicht, geht die Mail raus', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt({
    automation_email_status: STATUS.SCHEDULED,
    automation_send_at: new Date(Date.now() - 60000).toISOString()
  }));

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'poller');
  assert.strictEqual(ergebnis.ergebnis, 'sent');
  assert.strictEqual(t.gmail.versendet.length, 1);
});

test('eine Verschiebung erzeugt keine zweite Mail', () => {
  const t = baueTestPipeline();
  const basis = {
    objektTyp: 'contacts', objektId: '1', empfaenger: 'max@example.com',
    absender: 'info@finanz-medizin.com', betreff: 'Hallo', rumpf: 'Text'
  };
  /* Der Wunschzeitpunkt geht bewusst nicht in die Send-ID ein. */
  assert.strictEqual(t.pipeline.baueSendId(basis), t.pipeline.baueSendId(basis));
});

/* ========================================================================== */
/*  Fehler und Wiederholungen                                                 */
/* ========================================================================== */

test('ein endgueltiger Fehler wird nicht wiederholt', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt());
  t.gmail.fehlerFolge = [httpFehler(400, 'Invalid to header')];

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'test');
  assert.strictEqual(ergebnis.ergebnis, 'failed');
  assert.strictEqual(t.hubspot.letzterWert('automation_email_status'), STATUS.FAILED);
  assert.match(t.hubspot.letzterWert('automation_email_error'), /Invalid to header/);
  assert.strictEqual(t.hubspot.letzterWert('automation_email_attempts'), '1',
    'ein endgueltiger Fehler kostet genau einen Versuch, und genau das steht auch in HubSpot');
});

test('vorübergehende Fehler werden wiederholt, der dritte Versuch gelingt', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt());
  t.gmail.fehlerFolge = [httpFehler(503, 'Service Unavailable'), httpFehler(429, 'Rate limit')];

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'test');
  assert.strictEqual(ergebnis.ergebnis, 'sent');
  assert.strictEqual(t.gmail.versendet.length, 1, 'trotz drei Anlaeufen genau eine Mail');
});

test('nach der letzten Wiederholung steht failed mit drei Versuchen in HubSpot', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt());
  t.gmail.fehlerFolge = [httpFehler(503, 'a'), httpFehler(503, 'b'), httpFehler(503, 'c'), httpFehler(503, 'd')];

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'test');
  assert.strictEqual(ergebnis.ergebnis, 'failed');
  assert.strictEqual(t.gmail.versendet.length, 0);
  assert.strictEqual(t.gmail.fehlerFolge.length, 1, 'genau drei Versuche, nicht vier');
  assert.strictEqual(t.hubspot.letzterWert('automation_email_attempts'), '3');
});

test('ein gescheiterter Versand darf spaeter erneut angestossen werden', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt());
  t.gmail.fehlerFolge = [httpFehler(503, 'a'), httpFehler(503, 'b'), httpFehler(503, 'c')];

  await t.pipeline.verarbeite('contacts', '1', 'test');
  assert.strictEqual(t.hubspot.letzterWert('automation_email_status'), STATUS.FAILED);

  /* Gmail ist wieder da, jemand stellt zurueck auf queued. */
  t.hubspot.datensaetze.get('contacts:1').properties.automation_email_status = STATUS.QUEUED;
  const zweite = await t.pipeline.verarbeite('contacts', '1', 'test');

  assert.strictEqual(zweite.ergebnis, 'sent');
  assert.strictEqual(t.gmail.versendet.length, 1);
});

/* ---- Der gefaehrliche Fall: abgerissene Verbindung ---------------------- */

test('bei abgerissener Verbindung ohne Nachsehmoeglichkeit wird nichts wiederholt', async () => {
  const t = baueTestPipeline({ GMAIL_VERIFY_ENABLED: 'false' });
  t.hubspot.lege('contacts', '1', musterKontakt());
  t.gmail.fehlerFolge = [netzFehler('ECONNRESET')];
  t.gmail.pruefungAntwort = { gefunden: false, messageId: '', pruefbar: false };

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'test');

  assert.strictEqual(ergebnis.ergebnis, 'review');
  assert.strictEqual(t.gmail.versendet.length, 0, 'kein zweiter Anlauf ins Blaue');
  assert.strictEqual(t.hubspot.letzterWert('automation_email_status'), STATUS.NEEDS_REVIEW);
  assert.match(t.hubspot.letzterWert('automation_email_error'), /ungeklaert/);
  assert.match(t.hubspot.letzterWert('automation_email_error'), /info@finanz-medizin\.com/);
});

test('ein Fall auf Pruefung bleibt auch bei weiteren Ereignissen liegen', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt());
  t.gmail.fehlerFolge = [netzFehler('ECONNRESET')];

  await t.pipeline.verarbeite('contacts', '1', 'test');
  t.hubspot.datensaetze.get('contacts:1').properties.automation_email_status = STATUS.QUEUED;

  const zweite = await t.pipeline.verarbeite('contacts', '1', 'webhook');
  assert.strictEqual(zweite.ergebnis, 'review');
  assert.strictEqual(t.gmail.versendet.length, 0);
});

test('war die Mail trotz Abbruch doch raus, wird sie nachtraeglich als versendet gebucht', async () => {
  const t = baueTestPipeline({ GMAIL_VERIFY_ENABLED: 'true' });
  t.hubspot.lege('contacts', '1', musterKontakt());
  t.gmail.fehlerFolge = [netzFehler('UND_ERR_HEADERS_TIMEOUT')];
  t.gmail.pruefungAntwort = { gefunden: true, messageId: '<abc@finanz-medizin.com>', pruefbar: true };

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'test');

  assert.strictEqual(ergebnis.ergebnis, 'sent');
  assert.strictEqual(t.gmail.versendet.length, 0, 'es wurde nicht noch einmal gesendet');
  assert.strictEqual(t.hubspot.letzterWert('automation_email_status'), STATUS.SENT);
  assert.strictEqual(t.hubspot.letzterWert('automation_email_message_id'), '<abc@finanz-medizin.com>');
});

test('ist nachweislich nichts rausgegangen, wird gefahrlos wiederholt', async () => {
  const t = baueTestPipeline({ GMAIL_VERIFY_ENABLED: 'true' });
  t.hubspot.lege('contacts', '1', musterKontakt());
  t.gmail.fehlerFolge = [netzFehler('ECONNRESET')];
  t.gmail.pruefungAntwort = { gefunden: false, messageId: '', pruefbar: true };

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'test');

  assert.strictEqual(ergebnis.ergebnis, 'sent');
  assert.strictEqual(t.gmail.versendet.length, 1);
  assert.strictEqual(t.gmail.pruefungen, 1);
});

test('schlaegt das Schreiben nach HubSpot fehl, gilt die Mail trotzdem als versendet', async () => {
  const t = baueTestPipeline();
  t.hubspot.lege('contacts', '1', musterKontakt());
  t.hubspot.fehlerBeimSchreiben = httpFehler(500, 'HubSpot kaputt');

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'test');

  assert.strictEqual(ergebnis.ergebnis, 'sent');
  assert.strictEqual(t.gmail.versendet.length, 1);
  assert.strictEqual(t.ledger.eintrag(ergebnis.sendId).zustand, 'sent',
    'das Ledger ist massgeblich, nicht HubSpot');

  /* Und beim naechsten Anlauf wird HubSpot nachgezogen statt neu gesendet. */
  t.hubspot.fehlerBeimSchreiben = null;
  const zweite = await t.pipeline.verarbeite('contacts', '1', 'poller');
  assert.strictEqual(zweite.ergebnis, 'duplicate');
  assert.strictEqual(t.gmail.versendet.length, 1);
  assert.strictEqual(t.hubspot.letzterWert('automation_email_status'), STATUS.SENT);
});

test('das Tageslimit haelt einen Massenversand auf', async () => {
  const t = baueTestPipeline({ SEND_DAILY_LIMIT: '2' });
  for (let i = 1; i <= 4; i++) {
    t.hubspot.lege('contacts', String(i), musterKontakt({ email: 'k' + i + '@example.com' }));
  }

  const ergebnisse = [];
  for (let i = 1; i <= 4; i++) ergebnisse.push(await t.pipeline.verarbeite('contacts', String(i), 'test'));

  assert.strictEqual(t.gmail.versendet.length, 2);
  assert.strictEqual(ergebnisse[2].grund, 'tageslimit');
  assert.strictEqual(ergebnisse[3].grund, 'tageslimit');
});
