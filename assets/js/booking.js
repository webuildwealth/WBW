/* ==========================================================================
   finanz-medizin.com — Buchungs-Widget

   Holt echte freie Zeiten aus dem Kalender und legt den Termin direkt an.
   Kein fremdes Skript, kein Rahmen von Calendly — damit bleibt die Seite
   frei von externen Aufrufen und das Design unseres.

   Grundsatz: Die Seite verspricht nie einen Termin, den sie nicht vergeben
   kann. Ist der Kalender nicht eingerichtet oder nicht erreichbar, tritt
   still der Funnel an seine Stelle — kein Fehlertext, keine tote Oberfläche.
   ========================================================================== */
(function () {
  'use strict';

  var wurzel = document.querySelector('[data-booking]');
  if (!wurzel) return;

  var ausweich = document.querySelector('[data-booking-ausweich]');
  var koerper = wurzel.querySelector('[data-booking-body]');
  if (!koerper) return;

  var zustand = { tage: [], tag: null, slot: null, dauer: 25, zone: 'Europe/Berlin' };

  function zeigeAusweich() {
    wurzel.hidden = true;
    if (ausweich) ausweich.hidden = false;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var TAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  var MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
                'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  function uhrzeit(iso) {
    return new Intl.DateTimeFormat('de-DE', {
      timeZone: zustand.zone, hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(iso));
  }

  function langesDatum(iso) {
    var d = new Date(iso);
    return TAGE[d.getDay()] + ', ' + d.getDate() + '. ' + MONATE[d.getMonth()];
  }

  /* ------------------------------------------------------------ Laden */
  fetch('/api/slots', { headers: { 'Accept': 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (d) {
      if (!d.ok || !d.tage || !d.tage.length) { zeigeAusweich(); return; }
      zustand.tage = d.tage;
      zustand.dauer = d.dauer || 25;
      zustand.zone = d.zone || zustand.zone;
      zustand.tag = d.tage[0];
      zeichneAuswahl();
    })
    .catch(zeigeAusweich);

  /* --------------------------------------------------- Schritt 1: Termin */
  function zeichneAuswahl() {
    var reiter = zustand.tage.map(function (t, i) {
      var d = new Date(t.datum + 'T12:00:00Z');
      return '<button type="button" class="book__tag' +
        (t === zustand.tag ? ' is-on' : '') + '" data-tag="' + i + '">' +
        '<i>' + TAGE[d.getUTCDay()] + '</i>' +
        '<b>' + d.getUTCDate() + '</b>' +
        '<small>' + MONATE[d.getUTCMonth()] + '</small></button>';
    }).join('');

    var zeiten = zustand.tag.slots.map(function (s) {
      return '<button type="button" class="book__zeit" data-slot="' + esc(s) + '">' +
        uhrzeit(s) + '</button>';
    }).join('');

    koerper.innerHTML =
      '<div class="book__schritt is-active">' +
        '<h3>Wann passt es Ihnen?</h3>' +
        '<p class="fstep__hint">' + zustand.dauer + ' Minuten, per Telefon oder Video. ' +
          'Alle Zeiten in mitteleuropäischer Zeit.</p>' +
        '<div class="book__tage" role="tablist">' + reiter + '</div>' +
        '<div class="book__zeiten">' + zeiten + '</div>' +
        '<p class="book__hinweis">Kein Verkaufsgespräch. Wir klären Ihre Ausgangslage ' +
          'und sagen Ihnen ehrlich, ob sich der Aufwand für Sie lohnt.</p>' +
      '</div>';
  }

  /* ------------------------------------------------- Schritt 2: Kontakt */
  function zeichneFormular() {
    koerper.innerHTML =
      '<div class="book__schritt is-active">' +
        '<div class="book__gewaehlt">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true">' +
            '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/>' +
            '<path d="M3.5 9.5h17M8 3v4M16 3v4" stroke-linecap="round"/></svg>' +
          '<span><b>' + langesDatum(zustand.slot) + ', ' + uhrzeit(zustand.slot) + ' Uhr</b>' +
          '<small>' + zustand.dauer + ' Minuten</small></span>' +
          '<button type="button" class="book__aendern" data-zurueck>ändern</button>' +
        '</div>' +

        '<h3>Wie erreichen wir Sie?</h3>' +

        '<div class="fields-2">' +
          feld('b-vorname', 'vorname', 'Vorname', 'text', 'given-name') +
          feld('b-nachname', 'nachname', 'Nachname', 'text', 'family-name') +
        '</div>' +
        '<div class="fields-2">' +
          feld('b-mail', 'email', 'E-Mail', 'email', 'email') +
          feld('b-tel', 'telefon', 'Telefon', 'tel', 'tel') +
        '</div>' +

        '<div class="field">' +
          '<label for="b-anliegen">Worum geht es? (optional)</label>' +
          '<textarea id="b-anliegen" name="anliegen" rows="3" ' +
            'placeholder="Ein, zwei Sätze genügen — dann können wir uns vorbereiten."></textarea>' +
        '</div>' +

        '<div style="position:absolute;left:-9999px" aria-hidden="true">' +
          '<label for="b-hp">Bitte leer lassen</label>' +
          '<input id="b-hp" name="website" type="text" tabindex="-1" autocomplete="off">' +
        '</div>' +

        '<label class="consent">' +
          '<input type="checkbox" name="einwilligung" data-pflicht>' +
          '<span>Ich möchte diesen Termin verbindlich vereinbaren und habe die ' +
            '<a href="datenschutz.html" target="_blank" rel="noopener">Datenschutzhinweise</a> ' +
            'gelesen. Meine Angaben werden ausschließlich zur Durchführung des Gesprächs ' +
            'verwendet und nicht an Dritte weitergegeben.</span>' +
        '</label>' +

        '<p class="field__err" data-fehler hidden style="display:block;margin-top:1rem"></p>' +

        '<div class="fnav">' +
          '<button class="btn btn--primary btn--lg" type="button" data-senden>' +
            'Termin verbindlich buchen <span class="arr" aria-hidden="true">→</span></button>' +
          '<button class="fback" type="button" data-zurueck>' +
            '<span aria-hidden="true">←</span> anderer Termin</button>' +
        '</div>' +

        '<div class="funnel__trust">' +
          trust('Kostenfrei und unverbindlich') +
          trust('Absage jederzeit möglich') +
          trust('Keine Weitergabe Ihrer Daten') +
        '</div>' +
      '</div>';
  }

  function feld(id, name, label, typ, autocomplete) {
    return '<div class="field">' +
      '<label for="' + id + '">' + label + '</label>' +
      '<input id="' + id + '" name="' + name + '" type="' + typ + '" ' +
        'autocomplete="' + autocomplete + '" data-pflicht>' +
      '<span class="field__err">Bitte ausfüllen.</span></div>';
  }

  function trust(text) {
    return '<span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
      'stroke-width="2.2" aria-hidden="true"><path d="M2.5 8.5l3.5 3.5 7.5-8" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg> ' + text + '</span>';
  }

  /* ------------------------------------------------- Schritt 3: Bestätigt */
  function zeichneBestaetigung() {
    koerper.innerHTML =
      '<div class="book__schritt is-active book__ok">' +
        '<div class="book__ok-icon">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true">' +
            '<path d="M4 12.5l5 5L20 6.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</div>' +
        '<h3>Der Termin steht.</h3>' +
        '<p class="lead" style="margin-top:.8rem;font-size:1.05rem">' +
          langesDatum(zustand.slot) + ' um ' + uhrzeit(zustand.slot) + ' Uhr</p>' +
        '<p class="small mute" style="margin-top:1.2rem;max-width:34rem;margin-inline:auto">' +
          'Sie erhalten in Kürze eine persönliche Bestätigung per E-Mail mit den ' +
          'Einwahldaten. Wenn etwas dazwischenkommt, genügt eine kurze Nachricht an ' +
          '<a href="mailto:info@finanz-medizin.com" style="color:var(--navy-700);' +
          'text-decoration:underline">info@finanz-medizin.com</a>.</p>' +
      '</div>';
  }

  /* ------------------------------------------------------------ Bedienung */
  koerper.addEventListener('click', function (e) {
    var tag = e.target.closest('[data-tag]');
    if (tag) {
      zustand.tag = zustand.tage[parseInt(tag.getAttribute('data-tag'), 10)];
      zeichneAuswahl();
      return;
    }

    var slot = e.target.closest('[data-slot]');
    if (slot) {
      zustand.slot = slot.getAttribute('data-slot');
      slot.classList.add('is-on');
      window.setTimeout(zeichneFormular, 220);
      return;
    }

    if (e.target.closest('[data-zurueck]')) { zustand.slot = null; zeichneAuswahl(); return; }
    if (e.target.closest('[data-senden]')) { sende(); }
  });

  koerper.addEventListener('input', function (e) {
    var f = e.target.closest('.field');
    if (f) { f.classList.remove('has-err'); e.target.removeAttribute('aria-invalid'); }
  });

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

  function sende() {
    var btn = koerper.querySelector('[data-senden]');
    var fehlerBox = koerper.querySelector('[data-fehler]');
    var gueltig = true;

    koerper.querySelectorAll('[data-pflicht]').forEach(function (el) {
      var wert = el.type === 'checkbox' ? el.checked : el.value.trim();
      var schlecht = !wert;
      if (!schlecht && el.type === 'email') schlecht = !EMAIL_RE.test(el.value.trim());
      if (schlecht) {
        gueltig = false;
        var f = el.closest('.field') || el.closest('.consent');
        if (f) f.classList.add('has-err');
        el.setAttribute('aria-invalid', 'true');
      }
    });
    if (!gueltig) {
      var erstes = koerper.querySelector('[aria-invalid="true"]');
      if (erstes) erstes.focus({ preventScroll: true });
      return;
    }

    var nutzlast = { beginn: zustand.slot, seite: location.pathname };
    koerper.querySelectorAll('input, textarea').forEach(function (el) {
      if (!el.name) return;
      nutzlast[el.name] = el.type === 'checkbox' ? (el.checked ? 'ja' : 'nein') : el.value.trim();
    });

    var segment = wurzel.getAttribute('data-segment');
    if (segment) nutzlast.segment = segment;
    try {
      var k = sessionStorage.getItem('fm_campaign');
      if (k) nutzlast.kampagne = k;
    } catch (e) { /* egal */ }

    btn.disabled = true;
    var alt = btn.textContent;
    btn.textContent = 'Wird gebucht …';
    if (fehlerBox) fehlerBox.hidden = true;

    fetch('/api/booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(nutzlast)
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, b: b }; }); })
      .then(function (a) {
        if (a.ok && a.b.ok) { zeichneBestaetigung(); return; }
        btn.disabled = false;
        btn.textContent = alt;
        if (fehlerBox) {
          fehlerBox.hidden = false;
          fehlerBox.textContent = a.b && a.b.fehler
            ? a.b.fehler + ' Bitte wählen Sie einen anderen Termin.'
            : 'Das hat gerade nicht geklappt. Schreiben Sie uns an info@finanz-medizin.com.';
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = alt;
        if (fehlerBox) {
          fehlerBox.hidden = false;
          fehlerBox.textContent = 'Das hat gerade nicht geklappt. ' +
            'Schreiben Sie uns an info@finanz-medizin.com.';
        }
      });
  }
})();
