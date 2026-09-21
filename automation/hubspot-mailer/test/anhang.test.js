'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { ladeAnhaenge } = require('../src/anhang.js');
const { baueNachricht, dateinameFeld } = require('../src/mime.js');
const { tempVerzeichnis, baueTestPipeline, musterKontakt, musterKampagne } = require('./helpers.js');

function mitDateien(dateien) {
  const verzeichnis = tempVerzeichnis();
  for (const [name, inhalt] of Object.entries(dateien)) {
    fs.writeFileSync(path.join(verzeichnis, name), inhalt);
  }
  return {
    verzeichnis: verzeichnis,
    maxBytes: 1024 * 1024,
    maxGesamtBytes: 2 * 1024 * 1024
  };
}

/* ========================================================================== */
/*  Laden — und vor allem: was nicht geladen wird                             */
/* ========================================================================== */

test('eine vorhandene Datei wird mit ihrem Typ geladen', () => {
  const cfg = mitDateien({ 'flyer.pdf': Buffer.from('%PDF-1.4 Inhalt') });
  const geladen = ladeAnhaenge(['flyer.pdf'], cfg);

  assert.strictEqual(geladen.length, 1);
  assert.strictEqual(geladen[0].dateiname, 'flyer.pdf');
  assert.strictEqual(geladen[0].typ, 'application/pdf');
  assert.strictEqual(geladen[0].inhalt.toString(), '%PDF-1.4 Inhalt');
});

test('ein Pfad statt eines Dateinamens wird abgewiesen', () => {
  const cfg = mitDateien({ 'flyer.pdf': 'x' });

  /* Genau hier liesse sich sonst die Konfiguration samt Zugangsdaten
     an eine beliebige Adresse verschicken. */
  for (const boese of ['../../.env', '/etc/passwd', 'unter/flyer.pdf', '..\\..\\.env']) {
    assert.throws(() => ladeAnhaenge([boese], cfg), (e) => {
      assert.ok(e.anhangProblem, 'gilt als Datenproblem, wird nicht wiederholt');
      assert.match(e.message, /Dateinamen|gefunden|gueltiger/);
      return true;
    }, 'durchgelassen: ' + boese);
  }
});

test('eine fehlende Datei nennt das erwartete Verzeichnis', () => {
  const cfg = mitDateien({});
  assert.throws(() => ladeAnhaenge(['gibtsnicht.pdf'], cfg), (e) => {
    assert.strictEqual(e.code, 'ANHANG_FEHLT');
    assert.ok(e.message.indexOf(cfg.verzeichnis) !== -1);
    return true;
  });
});

test('zu grosse Dateien werden abgewiesen, einzeln und in Summe', () => {
  const gross = Buffer.alloc(600 * 1024, 0x41);
  const cfg = mitDateien({ 'a.pdf': gross, 'b.pdf': gross, 'c.pdf': gross });

  cfg.maxBytes = 500 * 1024;
  assert.throws(() => ladeAnhaenge(['a.pdf'], cfg), /ist 0,6 MB gross/);

  cfg.maxBytes = 1024 * 1024;
  cfg.maxGesamtBytes = 1024 * 1024;
  assert.throws(() => ladeAnhaenge(['a.pdf', 'b.pdf'], cfg), /zusammen/);
});

test('unbekannte Formate gehen nicht raus', () => {
  const cfg = mitDateien({ 'skript.exe': 'MZ', 'makro.docm': 'x', 'ohne': 'y' });

  for (const name of ['skript.exe', 'makro.docm', 'ohne']) {
    assert.throws(() => ladeAnhaenge([name], cfg), /wird nicht verschickt/, 'durchgelassen: ' + name);
  }
});

test('ohne Anhaenge passiert nichts', () => {
  assert.deepStrictEqual(ladeAnhaenge([], mitDateien({})), []);
  assert.deepStrictEqual(ladeAnhaenge(null, mitDateien({})), []);
});

/* ========================================================================== */
/*  Die Nachricht mit Anhang                                                  */
/* ========================================================================== */

const grund = {
  von: { email: 'info@finanz-medizin.com', name: 'Finanz & Medizin' },
  an: 'max@example.com',
  betreff: 'Mit Anhang',
  html: '<p>Hallo</p>',
  text: 'Hallo',
  sendId: 'abc123',
  zeitzone: 'Europe/Berlin'
};

test('ohne Anhang bleibt die Nachricht multipart/alternative', () => {
  const n = baueNachricht(grund);
  assert.match(n.kopf['Content-Type'], /^multipart\/alternative/);
});

test('mit Anhang wird daraus multipart/mixed — mit dem Text darin', () => {
  const n = baueNachricht(Object.assign({}, grund, {
    anhaenge: [{ dateiname: 'flyer.pdf', typ: 'application/pdf', inhalt: Buffer.from('%PDF-1.4 test') }]
  }));

  assert.match(n.kopf['Content-Type'], /^multipart\/mixed; boundary="wbwmix_[0-9a-f]{32}"$/);

  const aussen = /boundary="(wbwmix_[0-9a-f]+)"/.exec(n.kopf['Content-Type'])[1];
  const teile = n.raw.split('--' + aussen);

  assert.strictEqual(teile.length, 4, 'Kopf, Textblock, Anhang, Abschluss');
  assert.match(teile[1], /Content-Type: multipart\/alternative/);
  assert.match(teile[2], /Content-Type: application\/pdf; filename="flyer\.pdf"/);
  assert.match(teile[2], /Content-Disposition: attachment; filename="flyer\.pdf"/);
  assert.match(teile[2], /Content-Transfer-Encoding: base64/);

  /* Beide Textfassungen sind weiterhin da — der haeufigste Fehler beim
     Umbau auf mixed ist, dass der Text verschwindet. */
  assert.ok(teile[1].indexOf('text/plain') !== -1);
  assert.ok(teile[1].indexOf('text/html') !== -1);
});

test('der Anhang kommt unversehrt an', () => {
  const inhalt = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xFF, 0xFE, 0x01, 0x80]);
  const n = baueNachricht(Object.assign({}, grund, {
    anhaenge: [{ dateiname: 'binaer.pdf', typ: 'application/pdf', inhalt: inhalt }]
  }));

  const aussen = /boundary="(wbwmix_[0-9a-f]+)"/.exec(n.kopf['Content-Type'])[1];
  const anhangTeil = n.raw.split('--' + aussen)[2];
  const base64 = anhangTeil.split('\r\n\r\n')[1].split('\r\n').filter((z) => z && z.indexOf('--') !== 0).join('');

  assert.deepStrictEqual(Buffer.from(base64, 'base64'), inhalt);
});

test('base64-Zeilen bleiben auch im Anhang unter der Grenze', () => {
  const n = baueNachricht(Object.assign({}, grund, {
    anhaenge: [{ dateiname: 'gross.pdf', typ: 'application/pdf', inhalt: Buffer.alloc(50000, 0x42) }]
  }));
  for (const zeile of n.raw.split('\r\n')) {
    assert.ok(zeile.length <= 998, 'Zeile ist ' + zeile.length + ' Zeichen lang');
  }
});

test('mehrere Anhaenge landen alle in der Nachricht', () => {
  const n = baueNachricht(Object.assign({}, grund, {
    anhaenge: [
      { dateiname: 'a.pdf', typ: 'application/pdf', inhalt: Buffer.from('eins') },
      { dateiname: 'b.png', typ: 'image/png', inhalt: Buffer.from('zwei') }
    ]
  }));
  assert.deepStrictEqual(n.anhaenge, ['a.pdf', 'b.png']);

  const aussen = /boundary="(wbwmix_[0-9a-f]+)"/.exec(n.kopf['Content-Type'])[1];
  assert.strictEqual(n.raw.split('--' + aussen).length, 5);
});

test('Umlaute im Dateinamen bekommen beide Schreibweisen', () => {
  assert.strictEqual(dateinameFeld('flyer.pdf'), 'filename="flyer.pdf"');

  const mitUmlaut = dateinameFeld('Leistungsübersicht.pdf');
  assert.match(mitUmlaut, /filename="Leistungsuebersicht\.pdf"/, 'lesbarer Ersatz fuer alte Programme');
  assert.match(mitUmlaut, /filename\*=UTF-8''Leistungs%C3%BCbersicht\.pdf/, 'RFC 2231 fuer neue');
});

test('ein Anfuehrungszeichen im Dateinamen sprengt die Kopfzeile nicht', () => {
  const feld = dateinameFeld('bo"ese".pdf');
  assert.ok(feld.indexOf('"bo"') === -1 || /filename="boese\.pdf"/.test(feld));
  assert.strictEqual((feld.match(/"/g) || []).length % 2, 0, 'Anfuehrungszeichen bleiben paarig');
});

/* ========================================================================== */
/*  Im Ablauf                                                                 */
/* ========================================================================== */

test('ein Kampagnenschritt verschickt seinen Anhang mit', async () => {
  const verzeichnis = tempVerzeichnis();
  fs.writeFileSync(path.join(verzeichnis, 'flyer.pdf'), '%PDF-1.4 Leistungsumfang');

  const kampagne = musterKampagne();
  kampagne.schritte[0].anhaenge = ['flyer.pdf'];

  const t = baueTestPipeline({ ATTACHMENT_DIR: verzeichnis }, [kampagne]);
  t.hubspot.lege('contacts', '1', musterKontakt({
    automation_sequence: 'test-kampagne', automation_email_subject: '', automation_email_body: '',
    salutation: 'Herr', lastname: 'Meier'
  }));

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'webhook');

  assert.strictEqual(ergebnis.ergebnis, 'sent');
  assert.match(t.gmail.versendet[0].roh, /Content-Type: multipart\/mixed/);
  assert.match(t.gmail.versendet[0].roh, /filename="flyer\.pdf"/);
});

test('fehlt der Anhang, geht die Mail gar nicht statt ohne ihn', async () => {
  const kampagne = musterKampagne();
  kampagne.schritte[0].anhaenge = ['nicht-da.pdf'];

  const t = baueTestPipeline({ ATTACHMENT_DIR: tempVerzeichnis() }, [kampagne]);
  t.hubspot.lege('contacts', '1', musterKontakt({
    automation_sequence: 'test-kampagne', automation_email_subject: '', automation_email_body: '',
    salutation: 'Herr', lastname: 'Meier'
  }));

  const ergebnis = await t.pipeline.verarbeite('contacts', '1', 'webhook');

  assert.strictEqual(ergebnis.ergebnis, 'failed');
  assert.strictEqual(t.gmail.versendet.length, 0, 'ein Text, der auf den Anhang verweist, geht nicht ohne ihn raus');
  assert.match(t.hubspot.letzterWert('automation_email_error'), /nicht-da\.pdf/);

  /* Der Anspruch darf danach wieder frei sein — ein nachgelegter Flyer
     soll den Versand ohne Umweg nachholen koennen. */
  assert.strictEqual(t.ledger.eintrag(ergebnis.sendId || '') === null ||
    t.ledger.eintrag(ergebnis.sendId).zustand === 'failed', true);
});

test('der Anhangname geht in die Send-ID ein, sein Inhalt nicht', () => {
  const t = baueTestPipeline();
  const basis = {
    objektTyp: 'contacts', objektId: '1', empfaenger: 'a@b.de', absender: 'i@f.de',
    betreff: 'B', rumpf: 'R', sequenz: 'k', schritt: 2
  };

  assert.strictEqual(
    t.pipeline.baueSendId(Object.assign({}, basis, { anhaenge: ['flyer.pdf'] })),
    t.pipeline.baueSendId(Object.assign({}, basis, { anhaenge: ['flyer.pdf'] })),
    'derselbe Name ergibt dieselbe ID — ein korrigierter Flyer loest keinen zweiten Versand aus'
  );

  assert.notStrictEqual(
    t.pipeline.baueSendId(Object.assign({}, basis, { anhaenge: ['flyer.pdf'] })),
    t.pipeline.baueSendId(Object.assign({}, basis, { anhaenge: ['anderer.pdf'] }))
  );

  assert.notStrictEqual(
    t.pipeline.baueSendId(Object.assign({}, basis, { anhaenge: [] })),
    t.pipeline.baueSendId(Object.assign({}, basis, { anhaenge: ['flyer.pdf'] }))
  );
});

test('die echte Kampagne verweist auf einen Flyer, den es gibt', () => {
  const echte = require('../sequences/mfa-fluktuation.js');
  const mitAnhang = echte.schritte.filter((s) => s.anhaenge && s.anhaenge.length);

  assert.strictEqual(mitAnhang.length, 1, 'genau die erste Nachfassmail traegt den Flyer');
  assert.deepStrictEqual(mitAnhang[0].anhaenge, ['finanz-medizin-leistungsumfang.pdf']);

  /* Der Text verspricht einen Anhang — dann muss auch einer dran sein. */
  assert.match(mitAnhang[0].rumpf, /Im Anhang/);

  const pfad = path.join(__dirname, '..', 'attachments', 'finanz-medizin-leistungsumfang.pdf');
  assert.ok(fs.existsSync(pfad), 'Flyer fehlt — "npm run build:flyer" ausfuehren');
  assert.ok(fs.readFileSync(pfad).slice(0, 5).toString() === '%PDF-', 'ist eine PDF-Datei');
});
