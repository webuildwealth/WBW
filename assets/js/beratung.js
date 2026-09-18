/* ==========================================================================
   finanz-medizin.com — Kurzcheck (beratung.html)

   Eine Frage je Bildschirm, am Ende ein echter Termin. Gedacht für Verkehr
   aus Instagram: Der Link in der Biografie führt hierher, nicht auf eine
   Landingpage mit 3.000 Wörtern.

   Ablauf
     Startbild → fünf Fragen → Terminwahl → Kontakt → Bestätigung

   Zwei Wege, je nachdem was der Kalender hergibt:
     „termin"   /api/slots liefert freie Zeiten → Buchung über /api/booking.
                Der Interessent wählt selbst, der Termin steht sofort.
     „rueckruf" Kalender nicht eingerichtet, nicht erreichbar oder voll →
                statt der Zeiten wird nach der Erreichbarkeit gefragt und der
                Lead geht über /api/lead ins CRM.

   Der Grundsatz ist derselbe wie beim Widget auf „Über uns": Die Seite
   verspricht nie einen Termin, den sie nicht vergeben kann. Deshalb wird der
   Kalender schon beim Laden abgefragt — bis der Interessent fünf Fragen
   beantwortet hat, ist die Antwort längst da und niemand wartet auf einen
   Ladebalken.

   Kein Aufruf an Dritte: Alles läuft über die eigenen Endpunkte, es gibt
   keinen fremden Rahmen und keine fremde Einbettung.
   ========================================================================== */
(function () {
  'use strict';

  var wurzel = document.querySelector('[data-bq]');
  if (!wurzel) return;

  var form = wurzel.querySelector('[data-bq-form]');
  var tastenhinweis = wurzel.querySelector('[data-bq-tastenhinweis]');
  var knopf = wurzel.querySelector('[data-bq-weiter]');
  var zurueckKnopf = wurzel.querySelector('[data-bq-zurueck]');
  var balken = wurzel.querySelector('[data-bq-balken]');
  var balkenSpur = wurzel.querySelector('[data-bq-balken-spur]');
  var zaehler = wurzel.querySelector('[data-bq-zaehler]');
  var fehlerBox = wurzel.querySelector('[data-bq-fehler]');
  if (!form || !knopf) return;

  var schritte = Array.prototype.slice.call(form.querySelectorAll('.bq__schritt'));
  if (!schritte.length) return;

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
  var BUCHSTABEN = 'ABCDEFGHIJ';
  var TAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  var MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
                'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  var CHECK = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
    '<path d="M2.5 8.5l3.5 3.5 7.5-8" stroke="currentColor" stroke-width="2.4" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var zustand = {
    i: 0,
    daten: {},          /* Feldname → Antwort, für CRM und Kalender */
    beschriftung: {},   /* Feldname → lesbare Beschriftung */
    modus: null,        /* "termin" | "rueckruf", steht nach /api/slots fest */
    tage: [],
    tag: null,
    slot: null,
    kontakt: {},        /* Vorname, E-Mail … aus dem letzten Schritt */
    dauer: 25,
    zone: 'Europe/Berlin',
    gesendet: false,
    t0: Date.now()
  };

  /* Die gezählten Schritte: Start- und Schlussbild sind keine Aufgabe, sie
     gehören nicht in „3 von 7". */
  var gezaehlt = schritte.filter(function (s) {
    return !s.hasAttribute('data-start') && !s.hasAttribute('data-fertig');
  });

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function jetzigerSchritt() { return schritte[zustand.i]; }

  /* ---------------------------------------------------------- Kalender laden
     Läuft sofort beim Laden der Seite los, parallel zum Startbild. */
  function ladeKalender() {
    return fetch('/api/slots', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (d) {
        if (!d || !d.ok || !d.tage || !d.tage.length) { zustand.modus = 'rueckruf'; return; }
        zustand.tage = d.tage;
        zustand.tag = d.tage[0];
        zustand.dauer = d.dauer || zustand.dauer;
        zustand.zone = d.zone || zustand.zone;
        zustand.modus = 'termin';
      })
      .catch(function () { zustand.modus = 'rueckruf'; });
  }

  var kalenderBereit = ladeKalender();

  /* --------------------------------------------------------- Zeit formatieren */
  function uhrzeit(iso) {
    return new Intl.DateTimeFormat('de-DE', {
      timeZone: zustand.zone, hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(iso));
  }

  function langesDatum(iso) {
    var teile = new Intl.DateTimeFormat('de-DE', {
      timeZone: zustand.zone, weekday: 'short', day: 'numeric', month: 'long'
    }).formatToParts(new Date(iso));
    var t = {};
    teile.forEach(function (p) { if (p.type !== 'literal') t[p.type] = p.value; });
    return t.weekday + ', ' + t.day + '. ' + t.month;
  }

  /* -------------------------------------------------------- Antwortflächen */
  /* Die Kürzel und das Häkchen stehen nicht im Markup: Sie sind Zutat der
     Bedienung, nicht des Inhalts. Im Quelltext steht nur die Antwort.

     Gezählt wird je Schritt, nicht über das ganze Formular: Die Tastatur wählt
     innerhalb des laufenden Schritts aus, also muss dort auch jedes Mal wieder
     bei A angefangen werden. */
  function ruesteOptionen(schritt) {
    schritt.querySelectorAll('.opt').forEach(function (opt, k) {
      opt.setAttribute('type', 'button');
      opt.setAttribute('aria-pressed', 'false');

      if (!opt.querySelector('.opt__box')) {
        var box = document.createElement('span');
        box.className = 'opt__box';
        box.innerHTML = CHECK;
        opt.insertBefore(box, opt.firstChild);
      }
      if (!opt.querySelector('.opt__taste') && k < BUCHSTABEN.length) {
        var taste = document.createElement('span');
        taste.className = 'opt__taste';
        taste.setAttribute('aria-hidden', 'true');
        taste.textContent = BUCHSTABEN.charAt(k);
        opt.appendChild(taste);
      }
    });
  }

  function waehle(opt) {
    var schritt = opt.closest('.bq__schritt');
    var mehrfach = schritt.hasAttribute('data-multi');

    if (mehrfach) {
      var an = opt.classList.toggle('is-picked');
      opt.setAttribute('aria-pressed', String(an));
    } else {
      schritt.querySelectorAll('.opt').forEach(function (o) {
        o.classList.remove('is-picked');
        o.setAttribute('aria-pressed', 'false');
      });
      opt.classList.add('is-picked');
      opt.setAttribute('aria-pressed', 'true');
    }

    sammle(schritt);
    verbergeFehler();

    /* Einfachauswahl geht von selbst weiter — die kurze Pause lässt das
       Häkchen sichtbar werden, sonst wirkt der Sprung wie ein Fehler. */
    if (!mehrfach) {
      window.setTimeout(function () {
        if (jetzigerSchritt() === schritt) weiter();
      }, 280);
    }
  }

  function sammle(schritt) {
    var name = schritt.getAttribute('data-name');
    if (!name) return;

    var gewaehlt = Array.prototype.slice.call(schritt.querySelectorAll('.opt.is-picked'));
    if (gewaehlt.length) {
      zustand.daten[name] = gewaehlt.map(function (o) {
        return o.getAttribute('data-value') ||
          (o.querySelector('.opt__text') || o).textContent.trim();
      }).join(', ');
      zustand.beschriftung[name] = schritt.getAttribute('data-label') || name;
    } else {
      delete zustand.daten[name];
    }
  }

  /* ------------------------------------------------------------ Validierung */
  function pruefeFelder(schritt) {
    var gut = true;

    schritt.querySelectorAll('[data-pflicht]').forEach(function (el) {
      var wert = el.type === 'checkbox' ? el.checked : el.value.trim();
      var schlecht = !wert;
      if (!schlecht && el.type === 'email') schlecht = !EMAIL_RE.test(el.value.trim());
      if (!schlecht && el.getAttribute('data-min')) {
        schlecht = el.value.trim().length < parseInt(el.getAttribute('data-min'), 10);
      }
      if (schlecht) {
        gut = false;
        var feld = el.closest('.field') || el.closest('.consent');
        if (feld) feld.classList.add('has-err');
        el.setAttribute('aria-invalid', 'true');
      }
    });

    if (!gut) {
      ruckeln(schritt);
      var erstes = schritt.querySelector('[aria-invalid="true"]');
      if (erstes) erstes.focus({ preventScroll: false });
    }
    return gut;
  }

  function ruckeln(el) {
    if (!el.animate) return;
    el.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' },
       { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
      { duration: 320, easing: 'ease-in-out' }
    );
  }

  function zeigeFehler(text) {
    if (!fehlerBox) return;
    fehlerBox.textContent = text;
    fehlerBox.hidden = false;
  }

  function verbergeFehler() {
    if (fehlerBox) fehlerBox.hidden = true;
  }

  /* -------------------------------------------------------------- Anzeige */
  function zeige(i, still) {
    zustand.i = Math.max(0, Math.min(schritte.length - 1, i));
    var schritt = jetzigerSchritt();

    schritte.forEach(function (s) { s.classList.toggle('ist-aktiv', s === schritt); });
    verbergeFehler();

    /* Fortschritt. Das Startbild steht bewusst schon bei einem Rest, damit der
       Balken nicht leer wirkt; das Schlussbild ist voll. */
    var platz = gezaehlt.indexOf(schritt);
    var anteil = schritt.hasAttribute('data-fertig') ? 1
      : platz < 0 ? 0
      : (platz + 1) / (gezaehlt.length + 1);

    if (balken) balken.style.width = Math.max(4, anteil * 100) + '%';
    if (balkenSpur) balkenSpur.setAttribute('aria-valuenow', String(Math.round(anteil * 100)));

    if (zaehler) {
      zaehler.textContent = platz < 0 ? '' : (platz + 1) + ' / ' + gezaehlt.length;
    }
    if (zurueckKnopf) {
      zurueckKnopf.hidden = zustand.i === 0 || schritt.hasAttribute('data-fertig');
    }

    /* Der Knopf trägt je Schritt eine eigene Aufschrift; beim Schlussbild und
       bei der Terminwahl (dort führt die gewählte Zeit weiter) gibt es keinen.
       Ausgeblendet wird nur der Knopf, nicht die Leiste: In ihr stehen
       Impressum und Datenschutz, und die müssen von jeder Ansicht aus
       erreichbar bleiben. */
    knopf.hidden = schritt.hasAttribute('data-fertig') ||
      (schritt.hasAttribute('data-termin') && zustand.modus === 'termin');
    knopf.textContent = schritt.getAttribute('data-weiter') || 'Ok';
    knopf.disabled = false;
    if (tastenhinweis) tastenhinweis.hidden = knopf.hidden;

    if (still) return;

    /* Nach oben, damit die Frage im Blick steht — und den Fokus auf die Frage,
       damit Screenreader den Wechsel mitbekommen. */
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });

    var ueberschrift = schritt.querySelector('.bq__frage');
    if (ueberschrift) {
      ueberschrift.setAttribute('tabindex', '-1');
      ueberschrift.focus({ preventScroll: true });
    }
  }

  /* ------------------------------------------------------------ Navigation */
  function weiter() {
    var schritt = jetzigerSchritt();
    sammle(schritt);

    /* Von der Terminwahl führt nur eine gewählte Uhrzeit weiter. Der Knopf ist
       dort ausgeblendet, die Tastatur aber nicht: Ohne diese Sperre käme man
       mit der Eingabetaste an der Auswahl vorbei und landete im Rückruf,
       obwohl der Kalender freie Zeiten hat. Dasselbe gilt, solange der
       Kalender noch antwortet (modus noch unbekannt).
       Nur wenn statt der Zeiten nach der Erreichbarkeit gefragt wird
       (modus „rueckruf"), ist dieser Schritt eine ganz normale Frage. */
    if (schritt.hasAttribute('data-termin') && zustand.modus !== 'rueckruf' && !zustand.slot) {
      ruckeln(schritt);
      return;
    }

    /* Auswahlschritt ohne Auswahl: nicht weiter, aber auch nicht schimpfen —
       das Ruckeln sagt genug. */
    var brauchtWahl = schritt.querySelector('.opt') && !schritt.hasAttribute('data-optional');
    if (brauchtWahl && !schritt.querySelector('.opt.is-picked')) {
      ruckeln(schritt);
      return;
    }
    if (!pruefeFelder(schritt)) return;

    if (schritt.hasAttribute('data-kontakt')) { sende(); return; }

    if (schritt.hasAttribute('data-start')) meldeEreignis('kurzcheck_gestartet');

    var naechster = schritte[zustand.i + 1];
    if (naechster && naechster.hasAttribute('data-termin')) {
      zeige(zustand.i + 1);
      richteTerminSchritt();
      return;
    }
    if (naechster && naechster.hasAttribute('data-kontakt')) {
      richteKontaktSchritt();
    }
    zeige(zustand.i + 1);
  }

  function zurueck() {
    if (zustand.i > 0) zeige(zustand.i - 1);
  }

  /* -------------------------------------------------------- Terminschritt */
  function richteTerminSchritt() {
    var schritt = form.querySelector('[data-termin]');
    if (!schritt) return;

    if (zustand.modus) { zeichneTermin(schritt); return; }

    /* Der Kalender antwortet noch. Über die Tastatur ist das in einer Sekunde
       zu schaffen, also muss dieser Fall sitzen: Solange unklar ist, ob es
       Zeiten gibt, verschwindet der Knopf. Sonst liesse sich die Terminwahl
       überspringen und der Interessent landete im Rückruf, obwohl der
       Kalender kurz darauf freie Zeiten meldet. zeige() setzt den Knopf
       wieder richtig, sobald die Antwort da ist. */
    knopf.hidden = true;
    if (tastenhinweis) tastenhinweis.hidden = true;
    schritt.innerHTML =
      '<div class="book__lade"><div class="book__spinner" aria-hidden="true"></div>' +
      '<span>Freie Termine werden geladen …</span></div>';
    kalenderBereit.then(function () {
      if (jetzigerSchritt() === schritt) { zeichneTermin(schritt); zeige(zustand.i, true); }
    });
  }

  function zeichneTermin(schritt) {
    if (zustand.modus === 'termin') {
      /* Stand hier vorher die Erreichbarkeitsfrage (Kalender war noch nicht
         erreichbar), wird ihre Antwort mit der Frage zusammen entfernt. */
      schritt.removeAttribute('data-name');
      delete zustand.daten.erreichbarkeit;
      schritt.innerHTML =
        '<span class="bq__nummer">Termin</span>' +
        '<h2 class="bq__frage">Wann passt es dir?</h2>' +
        '<p class="bq__hinweis">' + zustand.dauer + ' Minuten, per Telefon oder Video. ' +
        'Alle Zeiten in deutscher Zeit — du wählst, wir richten uns danach.</p>' +
        '<div class="book__tage" data-bq-tage></div>' +
        '<div class="book__zeiten" data-bq-zeiten></div>' +
        '<p class="bq__kleingedruckt">Kein Verkaufsgespräch. Wir hören zu, ordnen ein und ' +
        'sagen dir ehrlich, ob bei dir etwas zu holen ist.</p>';
      zeichneZeiten(schritt);

    } else {
      /* Ohne Kalender wird aus der Terminwahl eine ganz normale Frage. */
      schritt.setAttribute('data-name', 'erreichbarkeit');
      schritt.setAttribute('data-label', 'Erreichbarkeit');
      schritt.setAttribute('data-weiter', 'Ok');
      schritt.innerHTML =
        '<span class="bq__nummer">Erreichbarkeit</span>' +
        '<h2 class="bq__frage">Wann erreichen wir dich am besten?</h2>' +
        '<p class="bq__hinweis">Wir rufen an, wenn es dir passt — nicht mitten in der ' +
        'Sprechstunde.</p>' +
        '<div class="bq__opts">' +
        ['Vormittags (8 – 12 Uhr)', 'Mittagspause (12 – 14 Uhr)',
         'Nachmittags (14 – 18 Uhr)', 'Abends (nach 18 Uhr)', 'Ist mir gleich'
        ].map(function (t) {
          return '<button class="opt" data-value="' + esc(t) + '">' +
            '<span class="opt__text">' + esc(t) + '</span></button>';
        }).join('') +
        '</div>';
      ruesteOptionen(schritt);
    }
  }

  function zeichneZeiten(schritt) {
    var reiterBox = schritt.querySelector('[data-bq-tage]');
    var zeitenBox = schritt.querySelector('[data-bq-zeiten]');
    if (!reiterBox || !zeitenBox) return;

    reiterBox.innerHTML = zustand.tage.map(function (t, i) {
      /* Mittag in UTC: So liegt der Tag sicher im richtigen Datum, egal in
         welcher Zeitzone das Gerät steht. */
      var d = new Date(t.datum + 'T12:00:00Z');
      return '<button type="button" class="book__tag' +
        (t === zustand.tag ? ' is-on' : '') + '" data-bq-tag="' + i + '">' +
        '<i>' + TAGE[d.getUTCDay()] + '</i><b>' + d.getUTCDate() + '</b>' +
        '<small>' + MONATE[d.getUTCMonth()] + '</small></button>';
    }).join('');

    zeitenBox.innerHTML = (zustand.tag ? zustand.tag.slots : []).map(function (s) {
      return '<button type="button" class="book__zeit" data-bq-slot="' + esc(s) + '">' +
        uhrzeit(s) + '</button>';
    }).join('');
  }

  /* -------------------------------------------------------- Kontaktschritt */
  function richteKontaktSchritt() {
    var schritt = form.querySelector('[data-kontakt]');
    if (!schritt) return;

    var termin = zustand.modus === 'termin' && zustand.slot;
    var kasten = schritt.querySelector('[data-bq-gewaehlt]');

    if (kasten) {
      kasten.hidden = !termin;
      if (termin) {
        kasten.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
          'aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/>' +
          '<path d="M3.5 9.5h17M8 3v4M16 3v4" stroke-linecap="round"/></svg>' +
          '<span><b>' + esc(langesDatum(zustand.slot)) + ', ' + esc(uhrzeit(zustand.slot)) +
          ' Uhr</b><small>' + zustand.dauer + ' Minuten</small></span>' +
          '<button type="button" class="book__aendern" data-bq-anderer>ändern</button>';
      }
    }

    schritt.querySelectorAll('[data-wenn]').forEach(function (el) {
      el.hidden = el.getAttribute('data-wenn') !== (termin ? 'termin' : 'rueckruf');
    });
    schritt.setAttribute('data-weiter', termin ? 'Termin verbindlich buchen' : 'Rückruf anfragen');
  }

  /* --------------------------------------------------------------- Absenden */
  function antworten() {
    return Object.keys(zustand.daten).map(function (k) {
      return { feld: zustand.beschriftung[k] || k, wert: zustand.daten[k] };
    });
  }

  function kampagne() {
    try { return sessionStorage.getItem('fm_campaign') || ''; } catch (e) { return ''; }
  }

  function felder(schritt) {
    var werte = {};
    schritt.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (!el.name) return;
      werte[el.name] = el.type === 'checkbox' ? (el.checked ? 'ja' : 'nein') : el.value.trim();
    });
    return werte;
  }

  function sende() {
    if (zustand.gesendet) return;

    var schritt = jetzigerSchritt();
    var werte = felder(schritt);
    zustand.kontakt = werte;

    /* Honeypot: Menschen sehen dieses Feld nicht, Bots füllen es aus. */
    if (werte.website) { zeigeAbschluss(); return; }

    var termin = zustand.modus === 'termin' && zustand.slot;
    var nutzlast, ziel;

    if (termin) {
      ziel = '/api/booking';
      nutzlast = {
        beginn: zustand.slot,
        segment: wurzel.getAttribute('data-segment') || 'Kurzcheck',
        seite: location.pathname,
        antworten: antworten()
      };
    } else {
      ziel = '/api/lead';
      nutzlast = {
        funnel: wurzel.getAttribute('data-funnel') || 'kurzcheck',
        seite: location.pathname,
        verweis: document.referrer || '',
        zeitpunkt: new Date().toISOString(),
        _labels: {}
      };
      Object.keys(zustand.daten).forEach(function (k) {
        nutzlast[k] = zustand.daten[k];
        nutzlast._labels[k] = zustand.beschriftung[k] || k;
      });
    }

    nutzlast.dauer_sek = Math.round((Date.now() - zustand.t0) / 1000);
    var k = kampagne();
    if (k) nutzlast.kampagne = k;
    Object.keys(werte).forEach(function (n) { nutzlast[n] = werte[n]; });

    knopf.disabled = true;
    var aufschrift = knopf.textContent;
    knopf.textContent = termin ? 'Wird gebucht …' : 'Wird gesendet …';
    verbergeFehler();

    fetch(ziel, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(nutzlast)
    })
      .then(function (r) {
        return r.json()
          .catch(function () { return {}; })
          .then(function (b) { return { ok: r.ok, status: r.status, body: b }; });
      })
      .then(function (a) {
        if (a.ok && a.body.ok !== false) { zeigeAbschluss(); return; }

        knopf.disabled = false;
        knopf.textContent = aufschrift;

        /* 409 heisst: in der Zwischenzeit hat jemand anders gebucht. Dann
           zurück zur Terminwahl, mit frisch geholten Zeiten.

           Die Reihenfolge ist wichtig: erst den Inhalt aufbauen, dann
           hinspringen, dann melden. zeige() räumt die Meldung auf — sie darf
           also erst danach gesetzt werden, sonst wäre sie sofort wieder weg.
           Und der Inhalt muss vor zeige() stehen, weil sich der Kalender
           beim erneuten Laden als leer erweisen kann: Dann wird aus der
           Terminwahl die Frage nach der Erreichbarkeit, und der Knopf in der
           Fussleiste ist wieder nötig. */
        if (a.status === 409 && termin) {
          var meldung = a.body.fehler || 'Dieser Termin wurde gerade vergeben.';
          zustand.slot = null;
          kalenderBereit = ladeKalender().then(function () {
            var terminSchritt = form.querySelector('[data-termin]');
            if (!terminSchritt) return;
            richteTerminSchritt();
            zeige(schritte.indexOf(terminSchritt));
            zeigeFehler(meldung + ' Bitte wähle eine andere Zeit.');
          });
          return;
        }
        zeigeFehler((a.body.fehler ? a.body.fehler + ' ' : 'Das hat gerade nicht geklappt. ') +
          'Schreib uns kurz an info@finanz-medizin.com — wir melden uns umgehend.');
      })
      .catch(function () {
        knopf.disabled = false;
        knopf.textContent = aufschrift;
        zeigeFehler('Das hat gerade nicht geklappt. Schreib uns kurz an ' +
          'info@finanz-medizin.com — wir melden uns umgehend.');
      });
  }

  function zeigeAbschluss() {
    zustand.gesendet = true;
    var schritt = form.querySelector('[data-fertig]');
    if (!schritt) return;

    var termin = zustand.modus === 'termin' && zustand.slot;
    schritt.querySelectorAll('[data-wenn]').forEach(function (el) {
      el.hidden = el.getAttribute('data-wenn') !== (termin ? 'termin' : 'rueckruf');
    });

    var zeile = schritt.querySelector('[data-bq-termin]');
    if (zeile) {
      zeile.hidden = !termin;
      if (termin) {
        zeile.textContent = langesDatum(zustand.slot) + ', ' + uhrzeit(zustand.slot) + ' Uhr';
      }
    }

    var name = schritt.querySelector('[data-bq-name]');
    var vorname = (zustand.kontakt.vorname || '').trim();
    if (name) name.textContent = vorname ? ' ' + vorname : '';

    zeige(schritte.indexOf(schritt));

    /* Für die Messung im GTM. Die Seite leitet bewusst nicht auf danke.html
       um — ein Seitenwechsel würde die gerade gebuchte Bestätigung wegnehmen.
       Deshalb meldet sie den Abschluss selbst. */
    meldeEreignis(termin ? 'kurzcheck_termin_gebucht' : 'kurzcheck_lead_gesendet');
  }

  function meldeEreignis(name) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: name,
        kurzcheck_modus: zustand.modus || 'unbekannt',
        kurzcheck_rolle: zustand.daten.rolle || ''
      });
    } catch (e) { /* ohne Messung geht es auch */ }
  }

  /* ------------------------------------------------------------- Bedienung */
  schritte.forEach(ruesteOptionen);

  form.addEventListener('click', function (e) {
    var opt = e.target.closest('.opt');
    if (opt) { waehle(opt); return; }

    var tag = e.target.closest('[data-bq-tag]');
    if (tag) {
      zustand.tag = zustand.tage[parseInt(tag.getAttribute('data-bq-tag'), 10)];
      zeichneZeiten(jetzigerSchritt());
      return;
    }

    var slot = e.target.closest('[data-bq-slot]');
    if (slot) {
      zustand.slot = slot.getAttribute('data-bq-slot');
      slot.classList.add('is-on');
      window.setTimeout(function () {
        richteKontaktSchritt();
        var kontakt = form.querySelector('[data-kontakt]');
        if (kontakt) zeige(schritte.indexOf(kontakt));
      }, 240);
      return;
    }

    if (e.target.closest('[data-bq-anderer]')) {
      zustand.slot = null;
      var terminSchritt = form.querySelector('[data-termin]');
      if (terminSchritt) { zeige(schritte.indexOf(terminSchritt)); richteTerminSchritt(); }
    }
  });

  form.addEventListener('submit', function (e) { e.preventDefault(); weiter(); });

  knopf.addEventListener('click', function (e) { e.preventDefault(); weiter(); });
  if (zurueckKnopf) zurueckKnopf.addEventListener('click', function (e) {
    e.preventDefault();
    zurueck();
  });

  /* Fehlermarkierung verschwindet, sobald getippt wird. */
  form.addEventListener('input', function (e) {
    var feld = e.target.closest('.field') || e.target.closest('.consent');
    if (feld) feld.classList.remove('has-err');
    e.target.removeAttribute('aria-invalid');
  });

  /* Tastatur: Enter geht weiter, A/B/C wählt eine Antwort. Das ist am Rechner
     die schnellste Bedienung und kostet auf dem Handy nichts. */
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    var imFeld = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);

    if (e.key === 'Enter') {
      if (e.target.tagName === 'TEXTAREA') return;
      if (e.target.closest('.opt, [data-bq-slot], [data-bq-tag], [data-bq-zurueck]')) return;
      e.preventDefault();
      weiter();
      return;
    }

    if (imFeld || e.key.length !== 1) return;

    var stelle = BUCHSTABEN.indexOf(e.key.toUpperCase());
    if (stelle < 0) return;
    var optionen = jetzigerSchritt().querySelectorAll('.opt');
    if (optionen[stelle]) { e.preventDefault(); waehle(optionen[stelle]); }
  });

  /* ------------------------------------------------------------------ Start */
  zeige(0, true);
})();
