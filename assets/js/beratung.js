/* ==========================================================================
   finanz-medizin.com — Kurzcheck (beratung.html)

   Eine Frage je Bildschirm, am Ende Wunschzeiten für den Rückruf. Gedacht für
   Verkehr aus Instagram: Der Link in der Biografie führt hierher, nicht auf
   eine Landingpage mit 3.000 Wörtern.

   Ablauf
     Startbild → fünf Fragen → bis zu drei Wunschzeiten → Kontakt → Bestätigung

   Der Termin wird hier ausdrücklich NICHT verbindlich gebucht. Der
   Interessent schlägt eine bis drei Zeiten vor, wir melden uns und bestätigen
   eine davon. Das ist der Unterschied zum Widget auf „Über uns", das über
   /api/booking sofort einen Kalendereintrag anlegt: Dort weiss der Besucher,
   worauf er sich einlässt — wer aus einer Story kommt, will erst wissen, ob
   das überhaupt etwas für ihn ist. Drei Vorschläge kosten ihn nichts und
   ersparen uns das Hin und Her per Nachricht.

   Woher die angebotenen Zeiten kommen, hängt vom Kalender ab:
     „termin"   /api/slots liefert freie Zeiten → zur Auswahl stehen echte
                Zeiten, in denen wir tatsächlich können. Gebucht wird nichts,
                der Kalender dient nur als Vorschlagsliste.
     „rueckruf" Kalender nicht eingerichtet, nicht erreichbar oder voll →
                zur Auswahl stehen Tageszeiten („vormittags", „abends").
   In beiden Fällen geht die Anfrage über /api/lead ins CRM.

   Der Kalender wird schon beim Laden abgefragt, nicht erst beim Terminschritt
   — bis der Interessent fünf Fragen beantwortet hat, ist die Antwort längst
   da und niemand wartet auf einen Ladebalken.

   Kein Aufruf an Dritte: Alles läuft über die eigenen Endpunkte, es gibt
   keinen fremden Rahmen und keine fremde Einbettung.
   ========================================================================== */
(function () {
  'use strict';

  var wurzel = document.querySelector('[data-bq]');
  if (!wurzel) return;

  var form = wurzel.querySelector('[data-bq-form]');
  var knopf = wurzel.querySelector('[data-bq-weiter]');
  var tastenhinweis = wurzel.querySelector('[data-bq-tastenhinweis]');
  var zurueckKnopf = wurzel.querySelector('[data-bq-zurueck]');
  var balken = wurzel.querySelector('[data-bq-balken]');
  var balkenSpur = wurzel.querySelector('[data-bq-balken-spur]');
  var zaehler = wurzel.querySelector('[data-bq-zaehler]');
  var fehlerBox = wurzel.querySelector('[data-bq-fehler]');
  if (!form || !knopf) return;

  var schritte = Array.prototype.slice.call(form.querySelectorAll('.bq__schritt'));
  if (!schritte.length) return;

  /* Mehr als drei Vorschläge helfen niemandem: Wer alles anklickt, sagt nichts
     aus — und wir müssten trotzdem eine Zeit auswählen und bestätigen. */
  var MAX_WUENSCHE = 3;

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
    daten: {},          /* Feldname → Antwort, wandert so ins CRM */
    beschriftung: {},   /* Feldname → lesbare Beschriftung */
    kontakt: {},        /* Vorname, E-Mail … aus dem letzten Schritt */
    modus: null,        /* "termin" | "rueckruf", steht nach /api/slots fest */
    tage: [],
    tag: null,
    wuensche: [],       /* gewählte Zeiten: { iso, text } */
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
        zustand.zone = d.zone || 'Europe/Berlin';
        zustand.modus = 'termin';
      })
      .catch(function () { zustand.modus = 'rueckruf'; });
  }

  var kalenderBereit = ladeKalender();

  /* --------------------------------------------------------- Zeit formatieren */
  function zone() { return zustand.zone || 'Europe/Berlin'; }

  function uhrzeit(iso) {
    return new Intl.DateTimeFormat('de-DE', {
      timeZone: zone(), hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(iso));
  }

  function langesDatum(iso) {
    var teile = new Intl.DateTimeFormat('de-DE', {
      timeZone: zone(), weekday: 'short', day: 'numeric', month: 'long'
    }).formatToParts(new Date(iso));
    var t = {};
    teile.forEach(function (p) { if (p.type !== 'literal') t[p.type] = p.value; });
    return t.weekday + ', ' + t.day + '. ' + t.month;
  }

  function alsText(iso) {
    return langesDatum(iso) + ', ' + uhrzeit(iso) + ' Uhr';
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
      var grenze = parseInt(schritt.getAttribute('data-max'), 10);
      var schon = schritt.querySelectorAll('.opt.is-picked').length;
      /* Grenze erreicht und das hier ist eine zusätzliche Auswahl: nicht
         stillschweigend etwas anderes abwählen, sondern sagen, was los ist. */
      if (grenze && schon >= grenze && !opt.classList.contains('is-picked')) {
        ruckeln(opt);
        zeigeFehler('Mehr als ' + grenze + ' brauchen wir nicht — nimm eine Auswahl weg, ' +
          'wenn du sie tauschen willst.');
        return;
      }
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

    /* Der Knopf trägt je Schritt eine eigene Aufschrift. Weg ist er nur auf dem
       Schlussbild und solange der Kalender noch antwortet — dann gibt es nichts
       zu wählen und nichts zu bestätigen.
       Ausgeblendet wird immer nur der Knopf, nie die Leiste: In ihr stehen
       Impressum und Datenschutz, und die müssen von jeder Ansicht aus
       erreichbar bleiben. */
    knopf.hidden = schritt.hasAttribute('data-fertig') ||
      (schritt.hasAttribute('data-termin') && !zustand.modus);
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

    /* Vom Wunschzeiten-Schritt führt nur eine gewählte Zeit weiter. Solange der
       Kalender noch antwortet, steht dort nichts zur Wahl — dann bleibt auch
       die Eingabetaste ohne Wirkung, sonst käme man an der Auswahl vorbei.
       Im Modus „rueckruf" ist der Schritt eine ganz normale Mehrfachauswahl;
       die Prüfung darunter greift dann von selbst. */
    if (schritt.hasAttribute('data-termin') && zustand.modus !== 'rueckruf') {
      if (!zustand.modus || !zustand.wuensche.length) {
        ruckeln(schritt);
        if (zustand.modus) zeigeFehler('Bitte wähle mindestens eine Zeit, die dir passt.');
        return;
      }
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

  /* --------------------------------------------------- Wunschzeiten-Schritt */
  function richteTerminSchritt() {
    var schritt = form.querySelector('[data-termin]');
    if (!schritt) return;

    if (zustand.modus) { zeichneTermin(schritt); return; }

    /* Der Kalender antwortet noch. Über die Tastatur ist das in einer Sekunde
       zu schaffen, also muss dieser Fall sitzen. zeige() nimmt den Knopf
       solange weg und setzt ihn wieder, sobald die Antwort da ist. */
    schritt.innerHTML =
      '<div class="book__lade"><div class="book__spinner" aria-hidden="true"></div>' +
      '<span>Freie Zeiten werden geladen …</span></div>';
    zeige(zustand.i, true);
    kalenderBereit.then(function () {
      if (jetzigerSchritt() === schritt) { zeichneTermin(schritt); zeige(zustand.i, true); }
    });
  }

  function zeichneTermin(schritt) {
    if (zustand.modus === 'termin') {
      /* Stand hier vorher die Tageszeiten-Frage (Kalender war noch nicht
         erreichbar), wird ihre Antwort mit der Frage zusammen entfernt. */
      schritt.removeAttribute('data-name');
      schritt.removeAttribute('data-multi');
      delete zustand.daten.terminwuensche;

      schritt.innerHTML =
        '<span class="bq__nummer">Wunschzeiten</span>' +
        '<h2 class="bq__frage">Wann sollen wir dich erreichen?</h2>' +
        '<p class="bq__hinweis">Wähle bis zu drei Zeiten, die dir passen — wir melden ' +
        'uns und bestätigen eine davon. Rund 15 Minuten, per Telefon oder Video, ' +
        'alle Zeiten in deutscher Zeit.</p>' +
        '<div class="book__tage" data-bq-tage></div>' +
        '<div class="book__zeiten" data-bq-zeiten></div>' +
        '<div class="bq__gewaehlt" data-bq-liste></div>' +
        '<p class="bq__kleingedruckt">Noch nichts ist damit verbindlich. Kein ' +
        'Verkaufsgespräch: Wir hören zu, ordnen ein und sagen dir ehrlich, ob bei dir ' +
        'etwas zu holen ist.</p>';
      zeichneZeiten(schritt);

    } else {
      /* Ohne Kalender wird aus der Zeitauswahl eine ganz normale Frage — die
         Vorschläge sind dann Tageszeiten statt Uhrzeiten. */
      zustand.wuensche = [];
      schritt.setAttribute('data-name', 'terminwuensche');
      schritt.setAttribute('data-label', 'Terminvorschläge');
      schritt.setAttribute('data-multi', '');
      schritt.setAttribute('data-max', String(MAX_WUENSCHE));
      schritt.setAttribute('data-weiter', 'Weiter');
      schritt.innerHTML =
        '<span class="bq__nummer">Wunschzeiten</span>' +
        '<h2 class="bq__frage">Wann sollen wir dich erreichen?</h2>' +
        '<p class="bq__hinweis">Mehrfachauswahl, bis zu drei — wir melden uns und ' +
        'schlagen dir eine passende Zeit vor. Rund 15 Minuten, per Telefon oder Video.</p>' +
        '<div class="bq__opts">' +
        ['Werktags vormittags (8 – 12 Uhr)', 'In der Mittagspause (12 – 14 Uhr)',
         'Werktags nachmittags (14 – 18 Uhr)', 'Werktags abends (nach 18 Uhr)',
         'Am Wochenende'
        ].map(function (t) {
          return '<button class="opt" data-value="' + esc(t) + '">' +
            '<span class="opt__text">' + esc(t) + '</span></button>';
        }).join('') +
        '</div>' +
        '<p class="bq__kleingedruckt">Noch nichts ist damit verbindlich. Kein ' +
        'Verkaufsgespräch: Wir hören zu, ordnen ein und sagen dir ehrlich, ob bei dir ' +
        'etwas zu holen ist.</p>';
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
      var gewaehltHier = t.slots.filter(istGewaehlt).length;
      return '<button type="button" class="book__tag' +
        (t === zustand.tag ? ' is-on' : '') + (gewaehltHier ? ' hat-wahl' : '') +
        '" data-bq-tag="' + i + '">' +
        '<i>' + TAGE[d.getUTCDay()] + '</i><b>' + d.getUTCDate() + '</b>' +
        '<small>' + (gewaehltHier ? gewaehltHier + ' gewählt' : MONATE[d.getUTCMonth()]) +
        '</small></button>';
    }).join('');

    zeitenBox.innerHTML = (zustand.tag ? zustand.tag.slots : []).map(function (s) {
      return '<button type="button" class="book__zeit' + (istGewaehlt(s) ? ' is-on' : '') +
        '" aria-pressed="' + (istGewaehlt(s) ? 'true' : 'false') +
        '" data-bq-slot="' + esc(s) + '">' + uhrzeit(s) + '</button>';
    }).join('');

    zeichneListe(schritt);
  }

  function istGewaehlt(iso) {
    return zustand.wuensche.some(function (w) { return w.iso === iso; });
  }

  /* Die gewählten Zeiten stehen unter der Auswahl noch einmal als Liste. Ohne
     sie müsste man sich über mehrere Tagesreiter hinweg merken, was schon
     angeklickt ist.

     nurLesen gilt ab dem Kontaktschritt: Dort ist die Liste eine Erinnerung,
     kein Bedienfeld. Sonst könnte man dort den letzten Vorschlag wegnehmen und
     stünde ohne Zeit vor dem Absenden — die Prüfung darauf sitzt einen Schritt
     davor. Wer etwas ändern will, geht mit „zurück" hin. */
  function zeichneListe(bereich, nurLesen) {
    var box = (bereich || form).querySelector('[data-bq-liste]');
    if (!box) return;

    if (!zustand.wuensche.length) {
      box.innerHTML = '';
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.innerHTML =
      '<span class="bq__gewaehlt-titel">Deine Vorschläge (' + zustand.wuensche.length +
      ' von ' + MAX_WUENSCHE + ')</span>' +
      zustand.wuensche.map(function (w) {
        return '<span class="bq__marke-zeit' + (nurLesen ? ' bq__marke-zeit--lesen' : '') +
          '">' + esc(w.text) + (nurLesen ? '' :
          '<button type="button" class="bq__weg" data-bq-weg="' + esc(w.iso) + '" ' +
          'aria-label="' + esc(w.text) + ' wieder abwählen">×</button>') + '</span>';
      }).join('');
  }

  function waehleZeit(btn) {
    var iso = btn.getAttribute('data-bq-slot');

    if (istGewaehlt(iso)) { entferneZeit(iso); return; }

    if (zustand.wuensche.length >= MAX_WUENSCHE) {
      ruckeln(btn);
      zeigeFehler('Drei Vorschläge genügen — nimm einen weg, wenn du ihn tauschen willst.');
      return;
    }

    zustand.wuensche.push({ iso: iso, text: alsText(iso) });
    sortiereWuensche();
    verbergeFehler();
    zeichneZeiten(jetzigerSchritt());
  }

  function entferneZeit(iso) {
    zustand.wuensche = zustand.wuensche.filter(function (w) { return w.iso !== iso; });
    /* Nicht nur die Liste am Bildschirm: Ohne das bliebe der alte Stand in
       zustand.daten stehen und eine abgewählte Zeit landete trotzdem im CRM. */
    sortiereWuensche();
    verbergeFehler();
    zeichneZeiten(form.querySelector('[data-termin]'));
  }

  /* Der Reihe nach, nicht in der Reihenfolge des Anklickens: Wer die Notiz im
     CRM liest, will den frühesten Vorschlag zuerst sehen. */
  function sortiereWuensche() {
    zustand.wuensche.sort(function (a, b) { return a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0; });
    if (!zustand.wuensche.length) {
      delete zustand.daten.terminwuensche;
      return;
    }
    zustand.daten.terminwuensche = zustand.wuensche.map(function (w) { return w.text; }).join(' · ');
    zustand.beschriftung.terminwuensche = 'Terminvorschläge';
  }

  /* -------------------------------------------------------- Kontaktschritt */
  function richteKontaktSchritt() {
    var schritt = form.querySelector('[data-kontakt]');
    if (!schritt) return;
    /* Bei echten Uhrzeiten stehen die Vorschläge hier noch einmal — bei
       Tageszeiten wäre es eine wörtliche Wiederholung der Antwort von
       eben und damit nur Platzverbrauch. */
    zeichneListe(schritt, true);
  }

  /* --------------------------------------------------------------- Absenden */
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

    var nutzlast = {
      funnel: wurzel.getAttribute('data-funnel') || 'kurzcheck',
      seite: location.pathname,
      verweis: document.referrer || '',
      zeitpunkt: new Date().toISOString(),
      dauer_sek: Math.round((Date.now() - zustand.t0) / 1000),
      _labels: {}
    };

    Object.keys(zustand.daten).forEach(function (k) {
      nutzlast[k] = zustand.daten[k];
      nutzlast._labels[k] = zustand.beschriftung[k] || k;
    });

    var k = kampagne();
    if (k) nutzlast.kampagne = k;
    Object.keys(werte).forEach(function (n) { nutzlast[n] = werte[n]; });

    knopf.disabled = true;
    var aufschrift = knopf.textContent;
    knopf.textContent = 'Wird gesendet …';
    verbergeFehler();

    fetch('/api/lead', {
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

    var name = schritt.querySelector('[data-bq-name]');
    var vorname = (zustand.kontakt.vorname || '').trim();
    if (name) name.textContent = vorname ? ' ' + vorname : '';

    /* Die eigenen Vorschläge noch einmal schwarz auf weiss: Danach weiss der
       Interessent, worauf er wartet — und wir haben es zugesagt. */
    var liste = schritt.querySelector('[data-bq-vorschlaege]');
    if (liste) {
      var wuensche = zustand.daten.terminwuensche;
      liste.hidden = !wuensche;
      if (wuensche) {
        liste.innerHTML = '<span class="bq__gewaehlt-titel">Das hast du vorgeschlagen</span>' +
          wuensche.split(' · ').map(function (t) {
            return '<span class="bq__marke-zeit bq__marke-zeit--lesen">' + esc(t) + '</span>';
          }).join('');
      }
    }

    zeige(schritte.indexOf(schritt));

    /* Für die Messung im GTM. Die Seite leitet bewusst nicht auf danke.html
       um — ein Seitenwechsel würde die gerade gegebene Zusage wegnehmen.
       Deshalb meldet sie den Abschluss selbst. */
    meldeEreignis('kurzcheck_abgeschickt');
  }

  function meldeEreignis(name) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: name,
        kurzcheck_modus: zustand.modus || 'unbekannt',
        kurzcheck_rolle: zustand.daten.rolle || '',
        kurzcheck_vorschlaege: zustand.wuensche.length ||
          (zustand.daten.terminwuensche || '').split(' · ').filter(Boolean).length
      });
    } catch (e) { /* ohne Messung geht es auch */ }
  }

  /* ------------------------------------------------------------- Bedienung */
  schritte.forEach(ruesteOptionen);

  form.addEventListener('click', function (e) {
    var weg = e.target.closest('[data-bq-weg]');
    if (weg) { entferneZeit(weg.getAttribute('data-bq-weg')); return; }

    var opt = e.target.closest('.opt');
    if (opt) { waehle(opt); return; }

    var tag = e.target.closest('[data-bq-tag]');
    if (tag) {
      zustand.tag = zustand.tage[parseInt(tag.getAttribute('data-bq-tag'), 10)];
      zeichneZeiten(jetzigerSchritt());
      return;
    }

    var slot = e.target.closest('[data-bq-slot]');
    if (slot) { waehleZeit(slot); }
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
      if (e.target.closest('.opt, [data-bq-slot], [data-bq-tag], [data-bq-weg]')) return;
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
