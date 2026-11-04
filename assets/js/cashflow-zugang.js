/* ==========================================================================
   finanz-medizin.com — Verwaltung der Cashflow-Zugänge (cashflow-zugang.html)
   Schickt Name, Gültigkeit und Passwort an /api/zugang und zeigt den Link.
   Das Passwort bleibt nur für diese Sitzung im Tab (sessionStorage).
   ========================================================================== */
(function () {
  'use strict';

  var form = document.querySelector('[data-form]');
  var fehler = document.querySelector('[data-fehler]');
  var ergebnis = document.querySelector('[data-ergebnis]');
  var pw = document.getElementById('v-pw');

  try { pw.value = sessionStorage.getItem('fm-cf-admin') || ''; } catch (e) { /* egal */ }

  function zeigeFehler(t) { fehler.textContent = t; fehler.hidden = !t; }

  function nachricht(d) {
    var vorname = d.name;
    return 'Guten Tag ' + vorname + ',\n\n' +
      'wie besprochen erhalten Sie hier Ihren persönlichen Zugang zum Cashflow-Rechner:\n' +
      d.link + '\n\n' +
      'Tragen Sie Ihre Einnahmen und Ausgaben in Ruhe ein und speichern Sie das Ergebnis über „Speichern“ als Datei. ' +
      'Beim nächsten Mal laden Sie die Datei einfach wieder hoch. Ihre Zahlen werden nur auf Ihrem Gerät berechnet.\n\n' +
      'Herzliche Grüße\nIhr Team von Finanz-Medizin';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    zeigeFehler('');
    var knopf = form.querySelector('button[type="submit"]');
    knopf.disabled = true;

    fetch('/api/zugang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aktion: 'erstellen',
        name: form.name.value,
        tage: form.tage.value,
        passwort: pw.value,
        basis: location.origin
      })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) { zeigeFehler(d.fehler || 'Das hat nicht geklappt.'); return; }
      try { sessionStorage.setItem('fm-cf-admin', pw.value); } catch (e2) { /* egal */ }
      document.querySelector('[data-link]').value = d.link;
      document.querySelector('[data-oeffnen]').href = d.link;
      document.querySelector('[data-e="name"]').textContent = d.name;
      document.querySelector('[data-e="id"]').textContent = d.id;
      document.querySelector('[data-e="bis"]').textContent = d.gueltigBis
        ? new Date(d.gueltigBis + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'unbegrenzt';
      document.querySelector('[data-text]').value = nachricht(d);
      ergebnis.hidden = false;
      ergebnis.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }).catch(function () {
      zeigeFehler('Keine Verbindung zum Server.');
    }).then(function () { knopf.disabled = false; });
  });

  document.addEventListener('click', function (e) {
    var k = e.target.closest('[data-kopieren]');
    if (!k) return;
    var feld = document.querySelector(k.getAttribute('data-kopieren') === 'link' ? '[data-link]' : '[data-text]');
    var fertig = function () {
      var alt = k.textContent;
      k.textContent = 'Kopiert';
      setTimeout(function () { k.textContent = alt; }, 1600);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(feld.value).then(fertig, function () { feld.select(); });
    else { feld.select(); document.execCommand('copy'); fertig(); }
  });
})();
