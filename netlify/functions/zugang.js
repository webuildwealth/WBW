/* Entfernt: Der Zugangsschutz des Cashflow-Rechners wurde abgeschafft.
 * Diese Datei kann gelöscht werden; sie tut nichts mehr. */

'use strict';

exports.handler = async function () {
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' },
    body: 'Nicht gefunden.'
  };
};
