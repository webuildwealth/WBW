'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { baueNachricht, istAdresse, kodiereWort, adressfeld, datumsfeld, saubereKopfzeile } = require('../src/mime.js');

const grund = {
  von: { email: 'info@finanz-medizin.com', name: 'Finanz & Medizin' },
  an: 'max@example.com',
  betreff: 'Betreff',
  html: '<p>Hallo</p>',
  text: 'Hallo',
  sendId: 'abc123',
  zeitzone: 'Europe/Berlin'
};

test('Adressen: gueltige werden angenommen, zweifelhafte nicht', () => {
  assert.ok(istAdresse('max@example.com'));
  assert.ok(istAdresse('vorname.nachname+kennung@sub.example.co.uk'));

  assert.ok(!istAdresse('max@example'), 'Domain ohne Punkt');
  assert.ok(!istAdresse('max @example.com'), 'Leerzeichen');
  assert.ok(!istAdresse('max..mustermann@example.com'), 'doppelter Punkt');
  assert.ok(!istAdresse('@example.com'), 'kein lokaler Teil');
  assert.ok(!istAdresse(''), 'leer');
  assert.ok(!istAdresse('a@b.de\nBcc: x@y.de'), 'Zeilenumbruch');
});

test('Umlaute im Betreff werden nach RFC 2047 kodiert und bleiben lesbar', () => {
  const n = baueNachricht(Object.assign({}, grund, {
    betreff: 'Ihr Gespraech am Dienstag – Übersicht für Ärztinnen und Ärzte in der Praxis'
  }));

  const zeilen = n.kopf.Subject.split('\r\n ');
  for (const w of zeilen) {
    assert.ok(w.length <= 75, 'kodiertes Wort haelt die Grenze von 75 Zeichen ein: ' + w.length);
    assert.match(w, /^=\?UTF-8\?B\?.+\?=$/);
  }

  const zurueck = zeilen
    .map((w) => Buffer.from(w.replace(/^=\?UTF-8\?B\?/, '').replace(/\?=$/, ''), 'base64').toString('utf8'))
    .join('');
  assert.strictEqual(zurueck, 'Ihr Gespraech am Dienstag – Übersicht für Ärztinnen und Ärzte in der Praxis');
});

test('Kodierung schneidet an Zeichengrenzen, nicht mitten im Zeichen', () => {
  /* 60 Umlaute: zwei Bytes je Zeichen, die Teilung faellt garantiert in
     die Naehe einer Zeichengrenze. */
  const lang = 'ü'.repeat(60);
  const zurueck = kodiereWort(lang).split('\r\n ')
    .map((w) => Buffer.from(w.replace(/^=\?UTF-8\?B\?/, '').replace(/\?=$/, ''), 'base64').toString('utf8'))
    .join('');
  assert.strictEqual(zurueck, lang);
  assert.ok(zurueck.indexOf('�') === -1, 'kein Ersatzzeichen');
});

test('Header-Injection ueber den Betreff geht nicht', () => {
  const n = baueNachricht(Object.assign({}, grund, {
    betreff: 'Harmlos\r\nBcc: heimlich@example.com'
  }));

  assert.ok(n.kopf.Subject.indexOf('\r') === -1 && n.kopf.Subject.indexOf('\n') === -1);
  /* Der Kopf endet nach Content-Type; danach beginnt der Rumpf. */
  const kopfBereich = n.raw.split('\r\n\r\n')[0];
  assert.ok(!/^Bcc:/mi.test(kopfBereich), 'kein eingeschmuggeltes Bcc');
});

test('Header-Injection ueber den Anzeigenamen geht auch nicht', () => {
  const n = baueNachricht(Object.assign({}, grund, {
    von: { email: 'info@finanz-medizin.com', name: 'Test\r\nX-Schmuggel: ja' }
  }));
  const kopfBereich = n.raw.split('\r\n\r\n')[0];
  assert.ok(!/^X-Schmuggel:/mi.test(kopfBereich));
});

test('saubereKopfzeile entfernt auch die Unicode-Zeilentrenner', () => {
  assert.strictEqual(saubereKopfzeile('a' + String.fromCharCode(0x2028) + 'b'), 'a b');
  assert.strictEqual(saubereKopfzeile('a' + String.fromCharCode(0x2029) + 'b'), 'a b');
});

test('Nachricht traegt Send-ID als Message-ID und als eigene Kopfzeile', () => {
  const n = baueNachricht(grund);
  assert.strictEqual(n.messageId, '<abc123@finanz-medizin.com>');
  assert.strictEqual(n.kopf['X-Automation-Send-Id'], 'abc123');
  assert.strictEqual(n.kopf['Auto-Submitted'], 'auto-generated');
});

test('Nachricht ist multipart/alternative mit Text- und HTML-Teil', () => {
  const n = baueNachricht(grund);
  assert.match(n.kopf['Content-Type'], /^multipart\/alternative; boundary="wbw_[0-9a-f]{32}"$/);

  const grenze = /boundary="([^"]+)"/.exec(n.kopf['Content-Type'])[1];
  const teile = n.raw.split('--' + grenze);
  assert.strictEqual(teile.length, 4, 'zwei Teile plus Kopf plus Abschluss');
  assert.ok(teile[1].indexOf('text/plain') !== -1);
  assert.ok(teile[2].indexOf('text/html') !== -1);

  const htmlTeil = teile[2].split('\r\n\r\n')[1].trim();
  assert.strictEqual(Buffer.from(htmlTeil, 'base64').toString('utf8'), '<p>Hallo</p>');
});

test('Base64-Zeilen bleiben unter der MIME-Grenze', () => {
  const n = baueNachricht(Object.assign({}, grund, { html: '<p>' + 'x'.repeat(5000) + '</p>' }));
  for (const zeile of n.raw.split('\r\n')) {
    assert.ok(zeile.length <= 998, 'Zeile ist ' + zeile.length + ' Zeichen lang');
  }
});

test('Datum steht im RFC-5322-Format mit numerischer Zone', () => {
  const sommer = datumsfeld(new Date('2026-07-15T10:00:00Z'), 'Europe/Berlin');
  assert.match(sommer, /^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} \+0200$/);

  const winter = datumsfeld(new Date('2026-01-15T10:00:00Z'), 'Europe/Berlin');
  assert.match(winter, /\+0100$/, 'Winterzeit wird erkannt');
});

test('Anzeigename wird je nach Zeichensatz gequotet oder kodiert', () => {
  assert.strictEqual(adressfeld('a@b.de', 'Finanz & Medizin'), '"Finanz & Medizin" <a@b.de>');
  assert.match(adressfeld('a@b.de', 'Müller'), /^=\?UTF-8\?B\?.+\?= <a@b\.de>$/);
  assert.strictEqual(adressfeld('a@b.de', ''), 'a@b.de');
});

test('Ungueltige Eingaben werden zurueckgewiesen statt verschickt', () => {
  assert.throws(() => baueNachricht(Object.assign({}, grund, { an: 'kaputt' })), /Empfaengeradresse/);
  assert.throws(() => baueNachricht(Object.assign({}, grund, { betreff: '   ' })), /Betreff/);
  assert.throws(() => baueNachricht(Object.assign({}, grund, { von: { email: 'x' } })), /Absenderadresse/);
});
