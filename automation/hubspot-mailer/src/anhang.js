/* =============================================================================
 *  Anhaenge
 *
 *  Dateien fuer den Mailversand liegen in einem festen Verzeichnis
 *  (ATTACHMENT_DIR, Standard attachments/). Eine Kampagne nennt nur den
 *  Dateinamen — nie einen Pfad.
 *
 *  Genau das ist hier der Punkt, an dem aufgepasst wird: Ein Dateiname kommt
 *  aus einer Kampagnendatei oder spaeter vielleicht aus einem CRM-Feld. Waere
 *  "../../etc/hubspot-mailer.env" erlaubt, liesse sich die Konfiguration samt
 *  Zugangsdaten an eine beliebige Adresse verschicken. Deshalb wird jeder
 *  Name auf seinen Basisnamen reduziert und der aufgeloeste Pfad danach noch
 *  einmal gegen das Verzeichnis geprueft.
 *
 *  Ausserdem: Groesse begrenzen. Gmail nimmt 25 MB je Nachricht, und
 *  base64 blaeht den Inhalt um ein Drittel auf — ein 20-MB-Flyer waere
 *  also schon zu gross. Wer das ueberschreitet, bekommt eine klare Meldung
 *  statt eines abgelehnten Versands.
 * ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const log = require('./log.js');

/* Nur Formate, die in einer Geschaeftsmail vorkommen. Alles andere wird
   von Mailprogrammen und Filtern ohnehin misstrauisch beaeugt. */
const TYPEN = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=UTF-8',
  '.csv': 'text/csv; charset=UTF-8',
  '.ics': 'text/calendar; charset=UTF-8',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};

function fehler(nachricht, code) {
  const f = new Error(nachricht);
  f.code = code;
  /* Ein fehlender Anhang ist ein Datenproblem, kein Netzproblem —
     wiederholen wuerde nichts aendern. */
  f.anhangProblem = true;
  return f;
}

/**
 * Laedt die genannten Dateien.
 *
 * @param {string[]} namen      Dateinamen, ohne Pfad
 * @param {object}   cfgAnhang  { verzeichnis, maxBytes, maxGesamtBytes }
 * @returns {{dateiname:string, typ:string, inhalt:Buffer}[]}
 */
function ladeAnhaenge(namen, cfgAnhang) {
  if (!namen || !namen.length) return [];

  const verzeichnis = path.resolve(cfgAnhang.verzeichnis);
  const geladen = [];
  let gesamt = 0;

  for (const roh of namen) {
    const gewuenscht = String(roh || '').trim();
    if (!gewuenscht) continue;

    /* Erst auf den reinen Dateinamen reduzieren: basename() wirft jedes
       "../" weg, bevor ueberhaupt ein Pfad entsteht. */
    const name = path.basename(gewuenscht);
    if (name !== gewuenscht) {
      throw fehler('Anhang "' + gewuenscht + '": Es sind nur Dateinamen erlaubt, keine Pfade. ' +
        'Die Datei gehoert nach ' + verzeichnis + '.', 'ANHANG_PFAD');
    }
    if (name === '.' || name === '..' || name.charAt(0) === '.') {
      throw fehler('Anhang "' + gewuenscht + '": kein gueltiger Dateiname.', 'ANHANG_NAME');
    }

    const pfad = path.resolve(verzeichnis, name);

    /* Guertel und Hosentraeger: Auch nach basename() wird geprueft, dass der
       aufgeloeste Pfad wirklich im Verzeichnis liegt. Ein symbolischer Link
       darin koennte sonst nach aussen zeigen. */
    const drin = pfad === verzeichnis
      ? false
      : pfad.startsWith(verzeichnis + path.sep);
    if (!drin) {
      throw fehler('Anhang "' + name + '" liegt ausserhalb von ' + verzeichnis + '.', 'ANHANG_PFAD');
    }

    let stat;
    try {
      stat = fs.statSync(pfad);
    } catch (e) {
      throw fehler('Anhang "' + name + '" wurde nicht gefunden. Erwartet in: ' + verzeichnis,
        'ANHANG_FEHLT');
    }

    if (!stat.isFile()) {
      throw fehler('Anhang "' + name + '" ist keine Datei.', 'ANHANG_KEINE_DATEI');
    }
    if (stat.size > cfgAnhang.maxBytes) {
      throw fehler('Anhang "' + name + '" ist ' + mb(stat.size) + ' gross, erlaubt sind ' +
        mb(cfgAnhang.maxBytes) + '. (ATTACHMENT_MAX_BYTES)', 'ANHANG_ZU_GROSS');
    }

    const endung = path.extname(name).toLowerCase();
    if (!TYPEN[endung]) {
      throw fehler('Anhang "' + name + '": Das Format ' + (endung || '(ohne Endung)') +
        ' wird nicht verschickt. Erlaubt sind: ' + Object.keys(TYPEN).join(' '), 'ANHANG_FORMAT');
    }

    gesamt += stat.size;
    if (gesamt > cfgAnhang.maxGesamtBytes) {
      throw fehler('Die Anhaenge sind zusammen ' + mb(gesamt) + ' gross, erlaubt sind ' +
        mb(cfgAnhang.maxGesamtBytes) + '. Gmail nimmt 25 MB je Nachricht, und die Kodierung ' +
        'fuer den Versand schlaegt rund ein Drittel drauf.', 'ANHANG_ZU_GROSS');
    }

    geladen.push({ dateiname: name, typ: TYPEN[endung], inhalt: fs.readFileSync(pfad) });
  }

  if (geladen.length) {
    log.debug('anhaenge.geladen', {
      anzahl: geladen.length,
      dateien: geladen.map((a) => a.dateiname),
      bytes: gesamt
    });
  }

  return geladen;
}

const mb = (bytes) => (bytes / 1048576).toFixed(1).replace('.', ',') + ' MB';

module.exports = { ladeAnhaenge, TYPEN };
