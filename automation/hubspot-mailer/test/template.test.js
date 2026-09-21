'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  baueMail, rendere, maskiereHtml, textZuHtml, htmlZuText, istHtml,
  entferneGefaehrliches, entferneKommentare, formatiereDatum, formatiereUhrzeit
} = require('../src/template.js');

test('Platzhalter werden ersetzt, fehlende gemeldet', () => {
  const r = rendere('Hallo {{firstname}} {{lastname}}', { firstname: 'Max' }, { regel: 'strict' });
  assert.deepStrictEqual(r.fehlend, ['lastname']);
  assert.ok(r.text.indexOf('{{lastname}}') !== -1, 'der Platzhalter bleibt sichtbar stehen');
});

test('Ersatzwerte nach dem Strich fangen leere Felder ab', () => {
  assert.strictEqual(rendere('Hallo {{firstname|zusammen}}', {}).text, 'Hallo zusammen');
  assert.strictEqual(rendere('Hallo {{firstname|zusammen}}', { firstname: 'Max' }).text, 'Hallo Max');
  assert.strictEqual(rendere('Hallo {{firstname|zusammen}}', { firstname: '   ' }).text, 'Hallo zusammen');
});

test('Leerzeichen in der Schreibweise stoeren nicht', () => {
  assert.strictEqual(rendere('{{ firstname }}', { firstname: 'Max' }).text, 'Max');
});

test('Werte aus dem CRM koennen das HTML nicht zerlegen', () => {
  const r = rendere('Sehr geehrte {{lastname}}', { lastname: '<b>Meier</b> & "Partner"' }, { maskieren: true });
  assert.strictEqual(r.text, 'Sehr geehrte &lt;b&gt;Meier&lt;/b&gt; &amp; &quot;Partner&quot;');
});

test('im Nur-Text-Teil wird nicht maskiert', () => {
  const r = rendere('Sehr geehrte {{lastname}}', { lastname: 'Meier & Partner' }, { maskieren: false });
  assert.strictEqual(r.text, 'Sehr geehrte Meier & Partner');
});

test('Klartext wird zu Absaetzen mit klickbaren Links', () => {
  const html = textZuHtml('Erste Zeile\nZweite Zeile\n\nNeuer Absatz mit https://finanz-medizin.com/beratung');
  assert.ok(html.indexOf('<p>Erste Zeile<br>Zweite Zeile</p>') !== -1);
  assert.ok(html.indexOf('<a href="https://finanz-medizin.com/beratung">') !== -1);
});

test('HTML im Feld wird als HTML erkannt und nicht doppelt maskiert', () => {
  assert.ok(istHtml('<p>Hallo</p>'));
  assert.ok(istHtml('Text mit <strong>Auszeichnung</strong>'));
  assert.ok(!istHtml('Text mit < und > aber ohne Tags'));

  const r = baueMail({ betreff: 'x', rumpf: '<p>Hallo <strong>Welt</strong></p>', werte: {} });
  assert.ok(r.html.indexOf('<strong>Welt</strong>') !== -1);
  assert.ok(r.html.indexOf('&lt;p&gt;') === -1);
});

test('Skripte, Rahmen und Ereignisattribute werden entfernt', () => {
  const schmutzig = '<p onclick="boese()">Text</p>' +
    '<script>fetch("https://fremd.example")</scr' + 'ipt>' +
    '<iframe src="https://fremd.example"></iframe>' +
    '<a href="javascript:boese()">Link</a>';
  const sauber = entferneGefaehrliches(schmutzig);

  assert.ok(sauber.indexOf('onclick') === -1);
  assert.ok(sauber.indexOf('<script') === -1);
  assert.ok(sauber.indexOf('<iframe') === -1);
  assert.ok(sauber.indexOf('javascript:') === -1);
  assert.ok(sauber.indexOf('<p>Text</p>') !== -1, 'der eigentliche Inhalt bleibt');
});

test('HTML-Kommentare verschwinden, bedingte Kommentare fuer Outlook bleiben', () => {
  assert.strictEqual(entferneKommentare('<p>a</p><!-- Notiz --><p>b</p>'), '<p>a</p><p>b</p>');
  assert.ok(entferneKommentare('<!--[if mso]><p>x</p><![endif]-->').indexOf('[if mso]') !== -1);
});

test('der Nur-Text-Teil ist wirklich lesbar', () => {
  const text = htmlZuText(
    '<h2>&Uuml;berschrift</h2><p>Erster Absatz mit <strong>Betonung</strong>.</p>' +
    '<ul><li>Punkt eins</li><li>Punkt zwei</li></ul>' +
    '<p>Mehr dazu auf <a href="https://finanz-medizin.com">unserer Seite</a>.</p>'
  );

  assert.ok(text.indexOf('Überschrift') !== -1, 'Entitaeten aufgeloest');
  assert.ok(text.indexOf('• Punkt eins') !== -1, 'Listenpunkte sichtbar');
  assert.ok(text.indexOf('unserer Seite (https://finanz-medizin.com)') !== -1, 'Linkziel sichtbar');
  assert.ok(text.indexOf('<') === -1, 'keine Tags mehr');
});

test('deutsche Entitaeten werden richtig aufgeloest', () => {
  assert.strictEqual(htmlZuText('<p>Gr&uuml;&szlig;e an &Auml;rzte &middot; 50&nbsp;&euro;</p>'),
    'Grüße an Ärzte · 50 €');
});

test('Signatur und Geruest werden zusammengesetzt', () => {
  const r = baueMail({
    betreff: 'Betreff',
    rumpf: 'Der Text.',
    werte: { sender_name: 'Benedict Hintz' },
    signatur: '<p class="sig">{{sender_name}}</p>',
    rahmen: '<html><body><div id="rahmen">{{content}}</div></body></html>'
  });

  const innen = r.html.indexOf('Der Text.');
  assert.ok(innen > r.html.indexOf('<div id="rahmen">') && innen < r.html.indexOf('</div>'),
    'der Text steht im Geruest, nicht dahinter');
  assert.ok(r.html.indexOf('<p class="sig">Benedict Hintz</p>') !== -1);
});

test('ein leerer Platzhalter in der Signatur haelt keine Mail auf', () => {
  const r = baueMail({
    betreff: 'Betreff', rumpf: 'Text', werte: {},
    signatur: '<p>{{sender_name}}</p>',
    rahmen: '<html><body>{{content}}</body></html>',
    regel: 'strict'
  });
  assert.deepStrictEqual(r.fehlend, [], 'nur Betreff und Mailtext zaehlen');
});

test('{{content}} im Kommentar der Vorlage bekommt den Text nicht ab', () => {
  const rahmen = '<!-- hier wird {{content}} ersetzt --><html><body>{{content}}</body></html>';
  const r = baueMail({ betreff: 'x', rumpf: 'Mailtext', werte: {}, rahmen: entferneKommentare(rahmen) });
  assert.strictEqual(r.html.indexOf('<!--'), -1);
  const pos = r.html.indexOf('Mailtext');
  assert.ok(pos > r.html.indexOf('<body>') && pos < r.html.indexOf('</body>'));
});

test('Datum und Uhrzeit erscheinen in Berliner Zeit und auf Deutsch', () => {
  const zeitpunkt = Date.parse('2026-09-22T08:30:00Z');   /* Sommerzeit: 10:30 */
  assert.strictEqual(formatiereDatum(zeitpunkt, 'Europe/Berlin', 'de-DE'), 'Dienstag, 22.09.2026');
  assert.strictEqual(formatiereUhrzeit(zeitpunkt, 'Europe/Berlin', 'de-DE'), '10:30 Uhr');

  const winter = Date.parse('2026-01-20T08:30:00Z');      /* Winterzeit: 09:30 */
  assert.strictEqual(formatiereUhrzeit(winter, 'Europe/Berlin', 'de-DE'), '09:30 Uhr');
});

test('maskiereHtml faengt alle fuenf kritischen Zeichen', () => {
  assert.strictEqual(maskiereHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
});
