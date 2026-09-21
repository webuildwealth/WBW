#!/usr/bin/env node
/* =============================================================================
 *  Den Flyer bauen
 *
 *      npm run build:flyer
 *
 *  Nimmt attachments/quelle/leistungsumfang.html, setzt Logo, Hausschriften
 *  und den Buchungslink ein und druckt das Ganze mit Chromium nach
 *  attachments/finanz-medizin-leistungsumfang.pdf.
 *
 *  Warum ueber Chromium und nicht ueber eine PDF-Bibliothek: Der Flyer soll
 *  aussehen wie die Website, und die ist in HTML und CSS beschrieben. Eine
 *  PDF-Bibliothek haette dasselbe Layout ein zweites Mal beschrieben — mit
 *  der sicheren Aussicht, dass beide Fassungen auseinanderlaufen. Chromium
 *  liegt in dieser Umgebung ohnehin bereit.
 *
 *  Schriften und Logo werden eingebettet, damit das PDF beim Empfaenger
 *  genauso aussieht wie hier — ohne Nachladen aus dem Netz.
 *
 *  Eine Eigenheit, die man kennen sollte: Die Hausschriften sind Variable
 *  Fonts, und die kann das PDF-Format nicht abbilden. Chromium legt sie
 *  deshalb als Type-3-Schriften an — jedes Zeichen als Vektorzeichnung.
 *  Das Ergebnis sieht auf jedem Geraet und im Druck richtig aus, aber der
 *  Text laesst sich nicht markieren, nicht durchsuchen und nicht vorlesen.
 *
 *  Fuer einen zweiseitigen Flyer ist das vertretbar; fuer die Zugaenglichkeit
 *  ist es das nicht allein. Deshalb nennt die Nachfassmail zusaetzlich die
 *  Seite finanz-medizin.com/praxisinhaber, auf der dieselben Zahlen als
 *  normales HTML stehen — lesbar auch mit Screenreader.
 * ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { konfig } = require('../src/config.js');

const WURZEL = path.resolve(__dirname, '..');
const REPO = path.resolve(WURZEL, '..', '..');

const QUELLE = path.join(WURZEL, 'attachments', 'quelle', 'leistungsumfang.html');
const ZIEL = path.join(WURZEL, 'attachments', 'finanz-medizin-leistungsumfang.pdf');

const schreib = (s) => process.stdout.write(s + '\n');

/** Findet den Chromium, den diese Umgebung mitbringt. */
function findeChromium() {
  const kandidaten = [];

  const pwPfad = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (pwPfad) {
    try {
      for (const eintrag of fs.readdirSync(pwPfad)) {
        if (!/^chromium/.test(eintrag)) continue;
        kandidaten.push(
          path.join(pwPfad, eintrag, 'chrome-linux', 'chrome'),
          path.join(pwPfad, eintrag, 'chrome-linux', 'headless_shell'),
          path.join(pwPfad, eintrag)
        );
      }
    } catch (e) { /* dann eben die festen Pfade */ }
  }

  kandidaten.push(
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'
  );

  for (const pfad of kandidaten) {
    try {
      if (fs.statSync(pfad).isFile()) return pfad;
    } catch (e) { /* weiter */ }
  }
  return null;
}

/** Datei als data:-URL, damit das PDF nichts nachladen muss. */
function alsDatenUrl(pfad, typ) {
  return 'data:' + typ + ';base64,' + fs.readFileSync(pfad).toString('base64');
}

function main() {
  const cfg = konfig();

  let html;
  try {
    html = fs.readFileSync(QUELLE, 'utf8');
  } catch (e) {
    schreib('\nQuelle fehlt: ' + QUELLE + '\n');
    process.exit(1);
  }

  /* ---- Einsetzen ---- */
  const teile = {
    __LOGO__: [path.join(REPO, 'assets', 'img', 'logo-finanz-medizin.png'), 'image/png'],
    __FONT_MANROPE__: [path.join(REPO, 'assets', 'fonts', 'manrope-normal-latin.woff2'), 'font/woff2'],
    __FONT_INTER__: [path.join(REPO, 'assets', 'fonts', 'inter-normal-latin.woff2'), 'font/woff2']
  };

  for (const [marke, [pfad, typ]] of Object.entries(teile)) {
    if (!fs.existsSync(pfad)) {
      schreib('\nFehlt: ' + pfad);
      schreib('Der Flyer holt Logo und Schriften aus dem Website-Repository.\n');
      process.exit(1);
    }
    html = html.split(marke).join(alsDatenUrl(pfad, typ));
  }

  const buchung = String(cfg.versand.extraPlatzhalter.booking_link || '')
    .replace(/^https?:\/\//, '');
  html = html.split('__BOOKING__').join(buchung);

  const stand = new Intl.DateTimeFormat('de-DE', {
    timeZone: cfg.zeitzone, month: 'long', year: 'numeric'
  }).format(new Date());
  html = html.split('__STAND__').join(stand);

  /* ---- Drucken ---- */
  const chromium = findeChromium();
  if (!chromium) {
    schreib('\nKein Chromium gefunden. Der Flyer wird damit aus HTML gedruckt.');
    schreib('Auf einem Server: apt-get install chromium  (oder chromium-browser).');
    schreib('Alternativ die Quelle im Browser oeffnen und von Hand als PDF drucken:');
    schreib('  ' + QUELLE + '\n');
    process.exit(1);
  }

  const temp = path.join(WURZEL, 'attachments', 'quelle', '.build.html');
  fs.writeFileSync(temp, html);
  fs.mkdirSync(path.dirname(ZIEL), { recursive: true });

  try {
    execFileSync(chromium, [
      '--headless', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer',
      '--print-to-pdf-no-header',
      '--print-to-pdf=' + ZIEL,
      'file://' + temp
    ], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 120000 });
  } catch (e) {
    schreib('\nChromium konnte nicht drucken: ' + (e.stderr ? String(e.stderr).slice(0, 400) : e.message) + '\n');
    process.exit(1);
  } finally {
    try { fs.unlinkSync(temp); } catch (e) { /* egal */ }
  }

  const groesse = fs.statSync(ZIEL).size;
  schreib('\nFlyer gebaut: ' + ZIEL);
  schreib('Groesse: ' + (groesse / 1024).toFixed(0) + ' KB, Stand ' + stand);

  if (groesse > cfg.anhang.maxBytes) {
    schreib('\nACHTUNG: groesser als ATTACHMENT_MAX_BYTES — so wird er nicht verschickt.');
    process.exit(1);
  }

  schreib('\nZum Ansehen oeffnen, dann:');
  schreib('  npm run send:test -- --to <ihre adresse>   (Probemail ohne Anhang)');
  schreib('  npm run check                              (prueft, ob der Anhang gefunden wird)\n');
}

if (require.main === module) main();

module.exports = { findeChromium, QUELLE, ZIEL };
