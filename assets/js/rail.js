/* ==========================================================================
   finanz-medizin.com — Progressive Sticky-CTA

   Der Gedanke dahinter: Ein Buchungs-Button, der nach fünf Sekunden ins Bild
   springt, erzeugt Reaktanz — der Besucher hat noch nichts verstanden und wird
   trotzdem gefragt. Deshalb richtet sich diese Leiste nach der Lesetiefe:

     unter 25 %   unsichtbar   — er soll erst verstehen
     25 – 42 %    weich        — „Ihre Situation prüfen"
     über 42 %    bestimmt     — „25 Minuten, kostenfrei" mit Vertrauenszeile

   Die 42 % sind gemessen, nicht geraten: Auf den Landingpages rückt der Funnel
   je nach Seite ab 56 bis 78 % Lesetiefe ins Bild, und dort schweigt die Leiste.
   Läge die Schwelle höher, käme die bestimmte Stufe auf der Praxisinhaber-Seite
   nie zum Vorschein.

   Sie verschwindet, sobald der eigentliche Funnel oder das Buchungs-Widget im
   Bild ist — zwei Aufforderungen gleichzeitig wären eine zu viel. Wer sie
   schließt, sieht sie in dieser Sitzung nicht wieder.
   ========================================================================== */
(function () {
  'use strict';

  var rail = document.querySelector('[data-rail]');
  if (!rail) return;

  var SPEICHER = 'fm_rail_zu';
  try {
    if (sessionStorage.getItem(SPEICHER) === '1') { rail.remove(); return; }
  } catch (e) { /* Storage kann blockiert sein */ }

  var textEl  = rail.querySelector('[data-rail-text]');
  var titelEl = rail.querySelector('[data-rail-titel]');
  var btnEl   = rail.querySelector('[data-rail-btn]');
  var schliessen = rail.querySelector('[data-rail-close]');

  /* Die bestimmte Stufe muss halten, was sie verspricht. Auf den Zielgruppen-
     seiten führt der Knopf in den Check, nicht in den Kalender — dort wäre
     „Termin ansehen" ein gebrochenes Versprechen, und genau daran verliert eine
     Seite, deren ganzer Anspruch „kein harter Verkauf" ist, ihre Glaubwürdigkeit.
     Jede Seite sagt deshalb selbst, wohin ihr Knopf führt; die Kalender-Fassung
     bleibt die Vorgabe für Seiten mit Buchungs-Widget. */
  function von(name, vorgabe) {
    var v = rail.getAttribute('data-rail-' + name);
    return v === null ? vorgabe : v;
  }

  var STUFEN = {
    weich: {
      titel: von('weich-titel', 'Kurz prüfen, ob sich das für Sie lohnt'),
      text:  von('weich-text',  'Fünf Fragen, rund 90 Sekunden.'),
      btn:   von('weich-btn',   'Ihre Situation prüfen')
    },
    fest: {
      titel: von('fest-titel', '25 Minuten Erstgespräch'),
      text:  von('fest-text',  'Kostenfrei und unverbindlich.'),
      btn:   von('fest-btn',   'Termin ansehen')
    }
  };

  var stufe = null;

  function setzeStufe(neu) {
    if (neu === stufe) return;
    stufe = neu;
    var s = STUFEN[neu];
    if (!s) return;
    if (titelEl) titelEl.textContent = s.titel;
    if (textEl) textEl.childNodes[textEl.childNodes.length - 1].nodeValue = ' ' + s.text;
    if (btnEl) btnEl.firstChild.nodeValue = s.btn + ' ';
    rail.classList.toggle('is-firm', neu === 'fest');
  }

  /* Elemente, neben denen die Leiste schweigt. Der Funnel, das Buchungs-Widget
     und das CTA-Band sind dieselbe Aufforderung — zweimal fragen ist einmal zu
     viel. Der Rechner steht aus einem anderen Grund auf der Liste: Dort erzeugt
     der Besucher gerade seine eigene Zahl. Diesen Moment stört man nicht, und
     die Leiste verdeckte auf dem Desktop sogar das Ergebnis.

     Das Rückrufformular gehört mit auf die Liste: Ist der Kalender nicht
     erreichbar, tritt es an die Stelle des Widgets. Fehlte es hier, stünde die
     Leiste ausgerechnet dann mit einer zweiten Aufforderung über dem Formular,
     wenn ohnehin schon etwas nicht funktioniert. */
  var rivalen = Array.prototype.slice.call(
    document.querySelectorAll(
      '.funnel, [data-booking], [data-booking-ausweich], [data-calc], .cta-band, .footer'
    )
  );

  var rivalSichtbar = false;
  if ('IntersectionObserver' in window && rivalen.length) {
    var sichtbare = new Set();
    var io = new IntersectionObserver(function (eintraege) {
      eintraege.forEach(function (e) {
        if (e.isIntersecting) sichtbare.add(e.target); else sichtbare.delete(e.target);
      });
      rivalSichtbar = sichtbare.size > 0;
      pruefe();
      // Schwelle 0: Schon ein sichtbarer Pixel zählt. Bei hohen Blöcken wie dem
      // Funnel wären 8 % des Elements mehrere hundert Pixel — die Leiste bliebe
      // dann sichtbar, obwohl der Funnel längst angeschnitten ist.
    }, { threshold: 0 });
    rivalen.forEach(function (r) { io.observe(r); });
  }

  function lesetiefe() {
    var h = document.documentElement;
    var scrollbar = h.scrollHeight - window.innerHeight;
    if (scrollbar <= 0) return 0;
    return Math.min(1, Math.max(0, window.scrollY / scrollbar));
  }

  function pruefe() {
    var t = lesetiefe();

    if (t < 0.25 || rivalSichtbar) {
      rail.classList.remove('is-on');
      return;
    }
    setzeStufe(t < 0.42 ? 'weich' : 'fest');
    rail.classList.add('is-on');
  }

  if (schliessen) {
    schliessen.addEventListener('click', function () {
      rail.classList.remove('is-on');
      try { sessionStorage.setItem(SPEICHER, '1'); } catch (e) {}
      window.setTimeout(function () { rail.remove(); }, 500);
    });
  }

  var wartet = false;
  window.addEventListener('scroll', function () {
    if (wartet) return;
    wartet = true;
    window.requestAnimationFrame(function () { pruefe(); wartet = false; });
  }, { passive: true });

  window.addEventListener('resize', pruefe, { passive: true });
  pruefe();
})();
