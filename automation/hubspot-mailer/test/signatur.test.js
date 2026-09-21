'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { schneideSignatur, findeHtml, vonBase64Url } = require('../scripts/import-signature.js');

const alsTeil = (mimeType, text) => ({
  mimeType: mimeType,
  body: { data: Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_') }
});

test('der HTML-Teil wird auch tief verschachtelt gefunden', () => {
  const nachricht = {
    mimeType: 'multipart/mixed',
    parts: [
      { mimeType: 'multipart/alternative', parts: [alsTeil('text/plain', 'Nur Text'), alsTeil('text/html', '<p>Mit HTML</p>')] },
      alsTeil('application/pdf', 'nicht relevant')
    ]
  };
  assert.strictEqual(findeHtml(nachricht), '<p>Mit HTML</p>');
});

test('ohne HTML-Teil wird nichts erfunden', () => {
  assert.strictEqual(findeHtml({ mimeType: 'text/plain', parts: [] }), '');
  assert.strictEqual(findeHtml(null), '');
});

test('base64url wird richtig gelesen', () => {
  assert.strictEqual(vonBase64Url(Buffer.from('Grüße & <Umlaute>', 'utf8').toString('base64url')), 'Grüße & <Umlaute>');
});

test('die Signatur wird vollstaendig herausgeschnitten, samt verschachtelter Ebenen', () => {
  const html = '<div dir="ltr">Guten Tag,<br><br>Text der Mail.<br><br>' +
    '<div class="gmail_signature" data-smartmail="gmail_signature">' +
    '<div dir="ltr"><b>Benedict Hintz</b><div>Finanz Medizin</div>' +
    '<div><a href="https://finanz-medizin.com">finanz-medizin.com</a></div></div>' +
    '</div></div>';

  const signatur = schneideSignatur(html);

  assert.ok(signatur.indexOf('Benedict Hintz') !== -1);
  assert.ok(signatur.indexOf('finanz-medizin.com') !== -1, 'die letzte Zeile fehlt nicht');
  assert.ok(signatur.indexOf('Text der Mail') === -1, 'der Mailtext gehoert nicht dazu');
  assert.ok(signatur.endsWith('</div>'), 'das schliessende Tag ist dabei');

  /* Gleich viele oeffnende wie schliessende div — sonst waere es eine
     halbe Signatur, und die zerlegt jede Mail, in der sie steht. */
  const auf = (signatur.match(/<div\b/g) || []).length;
  const zu = (signatur.match(/<\/div>/g) || []).length;
  assert.strictEqual(auf, zu, 'die Verschachtelung ist ausgeglichen');
});

test('ohne Gmail-Markierung wird nichts geraten', () => {
  assert.strictEqual(schneideSignatur('<div dir="ltr">Nur ein Mailtext ohne Signatur.</div>'), '');
  assert.strictEqual(schneideSignatur(''), '');
});

test('die aeltere Markierung ohne data-smartmail wird auch erkannt', () => {
  const html = '<div>Text<div class="gmail_signature"><span>Benedict</span></div></div>';
  assert.ok(schneideSignatur(html).indexOf('Benedict') !== -1);
});
