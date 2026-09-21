/* Netlify-Adapter: geplanter Lauf — faellige Terminerinnerungen verschicken.
   Der Zeitplan steht in netlify.toml, nicht hier. So bleibt die Funktion frei
   von Abhaengigkeiten; das Paket @netlify/functions waere die einzige im
   ganzen Projekt. */
'use strict';
const { sendeFaellige } = require('../../lib/erinnerungen-core.js');

exports.handler = async function () {
  try {
    const bericht = await sendeFaellige(process.env, new Date());

    if (!bericht.ok) {
      console.error('erinnerungen: Lauf nicht moeglich —', bericht.fehler);
      return { statusCode: 200, body: JSON.stringify(bericht) };
    }

    // Nur protokollieren, wenn etwas passiert ist. Ein Eintrag alle 15 Minuten
    // rund um die Uhr macht das Log unlesbar und verdeckt echte Fehler.
    if (bericht.gesendet || bericht.fehler.length) {
      console.log('erinnerungen: ' + bericht.gesendet + ' verschickt, ' +
        bericht.geprueft + ' Termine geprueft' +
        (bericht.fehler.length ? ', ' + bericht.fehler.length + ' Problem(e)' : ''));
      bericht.fehler.forEach(function (f) {
        console.error('erinnerungen: Termin', f.termin, '—', f.grund);
      });
    }

    return { statusCode: 200, body: JSON.stringify(bericht) };
  } catch (err) {
    /* Ein geworfener Fehler laesst Netlify den Lauf als fehlgeschlagen werten
       und erneut versuchen. Genau das ist hier richtig: Vermerkt wird erst
       nach erfolgreichem Versand, ein Wiederholungslauf schadet also nicht. */
    console.error('erinnerungen: Lauf abgebrochen —', err.message, '|', err.detail || '');
    throw err;
  }
};
