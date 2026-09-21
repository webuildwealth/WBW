'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { baueTestPipeline, musterKontakt, musterKampagne } = require('./helpers.js');
const { STATUS } = require('../src/status.js');
const { SEQ_STATUS, pruefeSequenz, naechsterSchritt, faelligkeitDanach } = require('../src/sequence.js');
const { baueAnrede, betreffMitRe } = require('../src/pipeline.js');

const TAG = 86400000;

/** Ein Kontakt, der in einer Kampagne steckt. */
function kampagnenKontakt(ueberschreibungen) {
  return musterKontakt(Object.assign({
    automation_email_subject: '',
    automation_email_body: '',
    automation_sequence: 'test-kampagne',
    salutation: 'Herr Dr.',
    lastname: 'Meier'
  }, ueberschreibungen || {}));
}

/* Nach Schritt 1 steht der Datensatz auf "scheduled" mit Faelligkeit in
   sieben Tagen. Fuer den naechsten Schritt wird die Uhr vorgestellt. */
function faelligStellen(hubspot, id) {
  const p = hubspot.datensaetze.get('contacts:' + id).properties;
  p.automation_send_at = new Date(Date.now() - 60000).toISOString();
  return p;
}

/* ========================================================================== */
/*  Der Ablauf einer Kampagne                                                 */
/* ========================================================================== */

test('Schritt 1 geht raus und stellt Schritt 2 auf in sieben Tagen', async () => {
  const t = baueTestPipeline({}, [musterKampagne()]);
  t.hubspot.lege('contacts', '1', kampagnenKontakt());

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'webhook');

  assert.strictEqual(ergebnis.ergebnis, 'sent');
  assert.strictEqual(t.gmail.versendet.length, 1);

  const p = t.hubspot.datensaetze.get('contacts:1').properties;
  assert.strictEqual(p.automation_sequence_step, '1');
  assert.strictEqual(p.automation_sequence_status, SEQ_STATUS.ACTIVE);
  assert.strictEqual(p.automation_email_status, STATUS.SCHEDULED, 'wartet auf die Nachfassmail');

  const faellig = Date.parse(p.automation_send_at) - Date.now();
  assert.ok(faellig > 6.9 * TAG && faellig < 7.1 * TAG, 'in rund sieben Tagen, ist ' + Math.round(faellig / TAG) + ' Tage');
});

test('die Nachfassmail bleibt liegen, solange sie nicht faellig ist', async () => {
  const t = baueTestPipeline({}, [musterKampagne()]);
  t.hubspot.lege('contacts', '1', kampagnenKontakt());

  await t.pipeline.verarbeite('contacts', '1', 'webhook');
  const zweite = await t.pipeline.verarbeite('contacts', '1', 'poller');

  assert.strictEqual(zweite.ergebnis, 'scheduled');
  assert.strictEqual(t.gmail.versendet.length, 1, 'noch immer nur die Erstansprache');
});

test('alle drei Schritte laufen durch und die Kampagne endet', async () => {
  const t = baueTestPipeline({ GMAIL_VERIFY_ENABLED: 'true' }, [musterKampagne()]);
  t.gmail.antwortAntwort = { gefunden: false, von: '', pruefbar: true };
  t.hubspot.lege('contacts', '1', kampagnenKontakt());

  await t.pipeline.verarbeite('contacts', '1', 'webhook');
  faelligStellen(t.hubspot, '1');
  await t.pipeline.verarbeite('contacts', '1', 'poller');
  faelligStellen(t.hubspot, '1');
  const dritte = await t.pipeline.verarbeite('contacts', '1', 'poller');

  assert.strictEqual(dritte.ergebnis, 'sent');
  assert.strictEqual(t.gmail.versendet.length, 3);

  const p = t.hubspot.datensaetze.get('contacts:1').properties;
  assert.strictEqual(p.automation_sequence_step, '3');
  assert.strictEqual(p.automation_sequence_status, SEQ_STATUS.COMPLETED);
  assert.strictEqual(p.automation_email_status, STATUS.SENT, 'nach dem letzten Schritt kein neuer Termin');

  /* Und danach passiert nichts mehr, auch wenn jemand nachhilft. */
  p.automation_email_status = STATUS.QUEUED;
  const vierte = await t.pipeline.verarbeite('contacts', '1', 'webhook');
  assert.strictEqual(vierte.ergebnis, 'sequence_stopped');
  assert.strictEqual(t.gmail.versendet.length, 3);
});

test('jeder Schritt hat eine eigene Send-ID und kann nicht doppelt raus', async () => {
  const t = baueTestPipeline({ GMAIL_VERIFY_ENABLED: 'true' }, [musterKampagne()]);
  t.gmail.antwortAntwort = { gefunden: false, von: '', pruefbar: true };
  t.hubspot.lege('contacts', '1', kampagnenKontakt());

  const erste = await t.pipeline.verarbeite('contacts', '1', 'webhook');
  faelligStellen(t.hubspot, '1');
  const zweite = await t.pipeline.verarbeite('contacts', '1', 'poller');

  assert.notStrictEqual(erste.sendId, zweite.sendId, 'zwei Schritte, zwei Send-IDs');

  /* Schritt 2 noch einmal anstossen: Schrittzaehler zurueck, faellig, los.
     Der Wunschtermin muss mit zurueckgesetzt werden — sonst wartet der
     Datensatz auf den Termin von Schritt 3 und es kaeme gar nicht erst
     zur Dublettenpruefung. */
  const p = faelligStellen(t.hubspot, '1');
  p.automation_sequence_step = '1';
  p.automation_email_status = STATUS.QUEUED;

  const nochmal = await t.pipeline.verarbeite('contacts', '1', 'webhook');
  assert.strictEqual(nochmal.ergebnis, 'duplicate');
  assert.strictEqual(t.gmail.versendet.length, 2, 'die Nachfassmail ging genau einmal raus');
});

/* ========================================================================== */
/*  Aufhoeren — der wichtigere Teil                                           */
/* ========================================================================== */

test('wer geantwortet hat, bekommt keine Nachfassmail mehr', async () => {
  const t = baueTestPipeline({ GMAIL_VERIFY_ENABLED: 'true' }, [musterKampagne()]);
  t.hubspot.lege('contacts', '1', kampagnenKontakt());

  await t.pipeline.verarbeite('contacts', '1', 'webhook');
  assert.strictEqual(t.gmail.versendet.length, 1);

  /* Der Praxisinhaber antwortet. */
  t.gmail.antwortAntwort = { gefunden: true, von: 'dr.meier@praxis.example', pruefbar: true };
  faelligStellen(t.hubspot, '1');

  const zweite = await t.pipeline.verarbeite('contacts', '1', 'poller');

  assert.strictEqual(zweite.ergebnis, 'sequence_stopped');
  assert.strictEqual(zweite.grund, SEQ_STATUS.STOPPED_REPLY);
  assert.strictEqual(t.gmail.versendet.length, 1, 'es ging keine zweite Mail raus');

  const p = t.hubspot.datensaetze.get('contacts:1').properties;
  assert.strictEqual(p.automation_sequence_status, SEQ_STATUS.STOPPED_REPLY);
  assert.strictEqual(p.automation_email_status, STATUS.CANCELLED);
});

test('ohne Nachsehmoeglichkeit wird die Nachfassmail nicht blind verschickt', async () => {
  const t = baueTestPipeline({ GMAIL_VERIFY_ENABLED: 'false' }, [musterKampagne()]);
  t.hubspot.lege('contacts', '1', kampagnenKontakt());

  await t.pipeline.verarbeite('contacts', '1', 'webhook');
  faelligStellen(t.hubspot, '1');

  const zweite = await t.pipeline.verarbeite('contacts', '1', 'poller');

  assert.strictEqual(zweite.ergebnis, 'failed');
  assert.strictEqual(t.gmail.versendet.length, 1);
  assert.match(t.hubspot.letzterWert('automation_email_error'), /gmail\.readonly/, 'nennt die Abhilfe');
  assert.match(t.hubspot.letzterWert('automation_email_error'), /SEQUENCE_REQUIRE_REPLY_CHECK=false/, 'nennt auch den Ausweg');
});

test('wer die Pruefung ausdruecklich abschaltet, bekommt die Nachfassmail trotzdem', async () => {
  const t = baueTestPipeline({
    GMAIL_VERIFY_ENABLED: 'false', SEQUENCE_REQUIRE_REPLY_CHECK: 'false'
  }, [musterKampagne()]);
  t.hubspot.lege('contacts', '1', kampagnenKontakt());

  await t.pipeline.verarbeite('contacts', '1', 'webhook');
  faelligStellen(t.hubspot, '1');

  const zweite = await t.pipeline.verarbeite('contacts', '1', 'poller');
  assert.strictEqual(zweite.ergebnis, 'sent');
  assert.strictEqual(t.gmail.versendet.length, 2);
});

test('eine Abbruchbedingung aus der Kampagne stoppt die Sequenz', async () => {
  const kampagne = musterKampagne({ abbruchWenn: { lifecyclestage: ['customer'] } });
  const t = baueTestPipeline({ GMAIL_VERIFY_ENABLED: 'true' }, [kampagne]);
  t.gmail.antwortAntwort = { gefunden: false, von: '', pruefbar: true };
  t.hubspot.lege('contacts', '1', kampagnenKontakt());

  await t.pipeline.verarbeite('contacts', '1', 'webhook');

  /* Aus dem Interessenten ist ein Kunde geworden. */
  const p = faelligStellen(t.hubspot, '1');
  p.lifecyclestage = 'customer';

  const zweite = await t.pipeline.verarbeite('contacts', '1', 'poller');

  assert.strictEqual(zweite.ergebnis, 'sequence_stopped');
  assert.strictEqual(zweite.grund, SEQ_STATUS.STOPPED_CONDITION);
  assert.strictEqual(t.gmail.versendet.length, 1);
  assert.match(t.hubspot.letzterWert('automation_email_error'), /lifecyclestage/);
});

test('eine globale Abbruchbedingung wirkt genauso', async () => {
  const t = baueTestPipeline({
    GMAIL_VERIFY_ENABLED: 'true',
    SEQUENCE_STOP_IF: JSON.stringify({ hs_lead_status: ['CONNECTED'] })
  }, [musterKampagne()]);
  t.gmail.antwortAntwort = { gefunden: false, von: '', pruefbar: true };
  t.hubspot.lege('contacts', '1', kampagnenKontakt());

  await t.pipeline.verarbeite('contacts', '1', 'webhook');
  const p = faelligStellen(t.hubspot, '1');
  p.hs_lead_status = 'CONNECTED';

  const zweite = await t.pipeline.verarbeite('contacts', '1', 'poller');
  assert.strictEqual(zweite.grund, SEQ_STATUS.STOPPED_CONDITION);
  assert.strictEqual(t.gmail.versendet.length, 1);
});

test('von Hand gestoppt bleibt gestoppt', async () => {
  const t = baueTestPipeline({ GMAIL_VERIFY_ENABLED: 'true' }, [musterKampagne()]);
  t.hubspot.lege('contacts', '1', kampagnenKontakt({
    automation_sequence_status: SEQ_STATUS.STOPPED_MANUAL
  }));

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'webhook');
  assert.strictEqual(ergebnis.ergebnis, 'sequence_stopped');
  assert.strictEqual(t.gmail.versendet.length, 0, 'nicht einmal die Erstansprache');
});

test('ohne Einwilligung startet die Kampagne gar nicht', async () => {
  const t = baueTestPipeline({ SEQUENCE_CONSENT_PROPERTY: 'einwilligung_werbung' }, [musterKampagne()]);
  t.hubspot.lege('contacts', '1', kampagnenKontakt());
  t.hubspot.lege('contacts', '2', kampagnenKontakt({ einwilligung_werbung: 'true' }));

  const ohne = await t.pipeline.verarbeite('contacts', '1', 'webhook');
  assert.strictEqual(ohne.grund, 'keine_einwilligung');
  assert.strictEqual(t.gmail.versendet.length, 0);

  const mit = await t.pipeline.verarbeite('contacts', '2', 'webhook');
  assert.strictEqual(mit.ergebnis, 'sent');
  assert.strictEqual(t.gmail.versendet.length, 1);
});

/* ========================================================================== */
/*  Inhalt, Absender, Zeitfenster                                             */
/* ========================================================================== */

test('die Kampagne liefert Betreff und Text, nicht die Freitextfelder', async () => {
  const t = baueTestPipeline({}, [musterKampagne()]);
  t.hubspot.lege('contacts', '1', kampagnenKontakt({
    automation_email_subject: 'Wird nicht benutzt',
    automation_email_body: 'Auch nicht.'
  }));

  await t.pipeline.verarbeite('contacts', '1', 'webhook');
  const roh = t.gmail.versendet[0].roh;
  assert.ok(roh.indexOf('Wird nicht benutzt') === -1);
  assert.ok(Buffer.from(roh.split(/--wbw_[0-9a-f]+/)[1].split('\r\n\r\n')[1].trim(), 'base64')
    .toString('utf8').indexOf('erster Text') !== -1);
});

test('die Kampagne bestimmt das Absenderpostfach', async () => {
  const konten = {
    info: { email: 'info@finanz-medizin.com', name: 'Finanz & Medizin' },
    akquise: { email: 'benedict@fm-praxisteam.de', name: 'Benedict Hintz' }
  };
  const t = baueTestPipeline(
    { SENDER_ACCOUNTS: JSON.stringify(konten), SENDER_DEFAULT: 'info' },
    [musterKampagne({ absender: 'akquise' })]
  );
  t.hubspot.lege('contacts', '1', kampagnenKontakt());

  await t.pipeline.verarbeite('contacts', '1', 'webhook');
  assert.strictEqual(t.gmail.versendet[0].postfach, 'benedict@fm-praxisteam.de');
});

test('was am Datensatz steht, schlaegt das Postfach der Kampagne', async () => {
  const konten = {
    info: { email: 'info@finanz-medizin.com', name: 'Finanz & Medizin' },
    akquise: { email: 'benedict@fm-praxisteam.de', name: 'Benedict Hintz' }
  };
  const t = baueTestPipeline(
    { SENDER_ACCOUNTS: JSON.stringify(konten), SENDER_DEFAULT: 'info' },
    [musterKampagne({ absender: 'akquise' })]
  );
  t.hubspot.lege('contacts', '1', kampagnenKontakt({ automation_email_sender: 'info' }));

  await t.pipeline.verarbeite('contacts', '1', 'webhook');
  assert.strictEqual(t.gmail.versendet[0].postfach, 'info@finanz-medizin.com');
});

test('der Buchungslink kommt aus der Konfiguration, nicht aus dem Text', async () => {
  const t = baueTestPipeline({ BOOKING_LINK: 'https://finanz-medizin.com/beratung' }, [musterKampagne()]);
  t.hubspot.lege('contacts', '1', kampagnenKontakt());

  await t.pipeline.verarbeite('contacts', '1', 'webhook');
  assert.ok(t.gmail.versendet[0].roh.length > 0);

  const text = Buffer.from(
    t.gmail.versendet[0].roh.split(/--wbw_[0-9a-f]+/)[1].split('\r\n\r\n')[1].trim(), 'base64'
  ).toString('utf8');
  assert.ok(text.indexOf('https://finanz-medizin.com/beratung') !== -1);
  assert.ok(text.indexOf('{{booking_link}}') === -1);
});

test('die Nachfassmail traegt "Re:", solange sie nicht im Verlauf haengt', async () => {
  const t = baueTestPipeline({
    GMAIL_VERIFY_ENABLED: 'false', SEQUENCE_REQUIRE_REPLY_CHECK: 'false'
  }, [musterKampagne()]);
  t.hubspot.lege('contacts', '1', kampagnenKontakt());

  await t.pipeline.verarbeite('contacts', '1', 'webhook');
  faelligStellen(t.hubspot, '1');
  await t.pipeline.verarbeite('contacts', '1', 'poller');

  const kopf = t.gmail.versendet[1].roh.split('\r\n\r\n')[0];
  assert.match(kopf, /Subject: Re: Nachfass eins/);
  assert.strictEqual(t.gmail.versendet[1].threadId, '', 'ohne echte Message-ID kein Verlauf');
});

test('mit Lesezugriff haengt die Nachfassmail im Verlauf der Erstansprache', async () => {
  const t = baueTestPipeline({ GMAIL_VERIFY_ENABLED: 'true' }, [musterKampagne()]);
  t.gmail.kopfLesbar = true;
  t.gmail.antwortAntwort = { gefunden: false, von: '', pruefbar: true };
  t.hubspot.lege('contacts', '1', kampagnenKontakt());

  await t.pipeline.verarbeite('contacts', '1', 'webhook');
  faelligStellen(t.hubspot, '1');
  await t.pipeline.verarbeite('contacts', '1', 'poller');

  const kopf = t.gmail.versendet[1].roh.split('\r\n\r\n')[0];
  assert.match(kopf, /In-Reply-To: <gmail-1@finanz-medizin\.com>/);
  assert.match(kopf, /References: <gmail-1@finanz-medizin\.com>/);
  assert.match(kopf, /Subject: Nachfass eins/, 'im Verlauf braucht es kein "Re:"');
  assert.strictEqual(t.gmail.versendet[1].threadId, 't-gmail-1');
});

test('ausserhalb des Sendefensters wird vertagt statt nachts verschickt', async () => {
  /* Ein Fenster, das jetzt garantiert geschlossen ist. */
  const jetzt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin', hour12: false, hour: '2-digit'
  }).format(new Date());
  const stunde = parseInt(jetzt, 10) % 24;
  const von = (stunde + 2) % 24;
  const fenster = von < 23 ? von + '-' + (von + 1) : '3-4';

  const t = baueTestPipeline({
    SEQUENCE_SEND_WINDOW: fenster, SEQUENCE_SEND_DAYS: '0,1,2,3,4,5,6'
  }, [musterKampagne()]);
  t.hubspot.lege('contacts', '1', kampagnenKontakt());

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'webhook');

  assert.strictEqual(ergebnis.ergebnis, 'scheduled');
  assert.strictEqual(ergebnis.grund, 'sendefenster');
  assert.strictEqual(t.gmail.versendet.length, 0);
  assert.ok(t.hubspot.letzterWert('automation_send_at'), 'ein neuer Termin steht drin');
});

test('eine unbekannte Kampagne sendet nicht irgendetwas', async () => {
  const t = baueTestPipeline({}, [musterKampagne()]);
  t.hubspot.lege('contacts', '1', kampagnenKontakt({ automation_sequence: 'gibtsnicht' }));

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'webhook');
  assert.strictEqual(ergebnis.ergebnis, 'failed');
  assert.strictEqual(t.gmail.versendet.length, 0);
  assert.match(t.hubspot.letzterWert('automation_email_error'), /test-kampagne/, 'nennt, was es gibt');
});

/* ========================================================================== */
/*  Anrede und Kleinteile                                                     */
/* ========================================================================== */

test('die Anrede wird gebaut, aber niemals geraten', () => {
  assert.strictEqual(baueAnrede('Herr', 'Meier'), 'Sehr geehrter Herr Meier');
  assert.strictEqual(baueAnrede('Frau', 'Schmidt'), 'Sehr geehrte Frau Schmidt');
  assert.strictEqual(baueAnrede('Herr Dr.', 'Meier'), 'Sehr geehrter Herr Dr. Meier');
  assert.strictEqual(baueAnrede('Frau Dr. med.', 'Schmidt'), 'Sehr geehrte Frau Dr. med. Schmidt');
  assert.strictEqual(baueAnrede('Mr.', 'Brown'), 'Sehr geehrter Herr Brown');
  assert.strictEqual(baueAnrede('Ms', 'Brown'), 'Sehr geehrte Frau Brown');

  /* Ohne Geschlecht lieber neutral als falsch. */
  assert.strictEqual(baueAnrede('', 'Meier'), 'Guten Tag');
  assert.strictEqual(baueAnrede('Dr.', 'Meier'), 'Guten Tag');
  assert.strictEqual(baueAnrede('Herr', ''), 'Guten Tag');
  assert.strictEqual(baueAnrede(null, null), 'Guten Tag');
});

test('die Anrede landet in der Mail', async () => {
  const t = baueTestPipeline({}, [musterKampagne()]);
  t.hubspot.lege('contacts', '1', kampagnenKontakt({ salutation: 'Frau Dr.', lastname: 'Schöller' }));

  await t.pipeline.verarbeite('contacts', '1', 'webhook');
  const text = Buffer.from(
    t.gmail.versendet[0].roh.split(/--wbw_[0-9a-f]+/)[1].split('\r\n\r\n')[1].trim(), 'base64'
  ).toString('utf8');
  assert.ok(text.indexOf('Sehr geehrte Frau Dr. Schöller,') !== -1, text.slice(0, 80));
});

test('"Re:" wird genau einmal gesetzt', () => {
  assert.strictEqual(betreffMitRe('Nachfass'), 'Re: Nachfass');
  assert.strictEqual(betreffMitRe('Re: Nachfass'), 'Re: Nachfass');
  assert.strictEqual(betreffMitRe('AW: Nachfass'), 'AW: Nachfass');
});

/* ========================================================================== */
/*  Die Definition selbst                                                     */
/* ========================================================================== */

test('kaputte Kampagnen werden beim Laden erkannt, nicht beim Versand', () => {
  assert.deepStrictEqual(pruefeSequenz(musterKampagne()), []);

  assert.ok(pruefeSequenz({ schritte: [] }).length, 'ohne Schritte');
  assert.ok(pruefeSequenz({ schluessel: 'x', schritte: [{ betreff: 'a', rumpf: 'b', nachTagen: 3 }] })
    .some((p) => /Schritt 1/.test(p)), 'Schritt 1 muss sofort rausgehen');
  assert.ok(pruefeSequenz({ schluessel: 'x', schritte: [{ betreff: '', rumpf: 'b', nachTagen: 0 }] })
    .some((p) => /betreff/.test(p)));
  assert.ok(pruefeSequenz({ schluessel: 'x', schritte: [{ betreff: 'a', rumpf: '', nachTagen: 0 }] })
    .some((p) => /rumpf/.test(p)));
});

test('Schrittzaehlung und Faelligkeit', () => {
  const k = musterKampagne();
  assert.strictEqual(naechsterSchritt(k, '').nummer, 1);
  assert.strictEqual(naechsterSchritt(k, '1').nummer, 2);
  assert.strictEqual(naechsterSchritt(k, 3), null, 'nach dem letzten Schritt ist Schluss');

  const ab = Date.parse('2026-09-21T08:00:00Z');
  assert.strictEqual(faelligkeitDanach(k, 1, ab), ab + 7 * TAG);
  assert.strictEqual(faelligkeitDanach(k, 2, ab), ab + 7 * TAG);
  assert.strictEqual(faelligkeitDanach(k, 3, ab), null);
});

test('die echte Kampagne mfa-fluktuation ist gueltig', () => {
  const echte = require('../sequences/mfa-fluktuation.js');
  assert.deepStrictEqual(pruefeSequenz(echte), []);
  assert.strictEqual(echte.schritte.length, 3, 'Erstansprache plus zwei Nachfassmails');
  assert.strictEqual(echte.schritte[1].nachTagen, 7);
  assert.strictEqual(echte.schritte[2].nachTagen, 7);

  for (const schritt of echte.schritte) {
    assert.ok(schritt.rumpf.indexOf('{{anrede}}') !== -1, 'jeder Schritt spricht den Empfaenger an');
    assert.ok(schritt.rumpf.indexOf('{{booking_link}}') !== -1, 'jeder Schritt bietet einen Termin an');
  }

  /* Die letzte Mail muss einen Ausweg anbieten. Wer keinen anbietet, wird
     als Spam markiert — und das kostet die Domain, nicht den Kontakt. */
  assert.match(echte.schritte[2].rumpf, /kein Interesse/i);
});
