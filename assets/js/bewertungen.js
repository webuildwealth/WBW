/* ==========================================================================
   finanz-medizin.com — Bewertungsanzeigen

   Lädt die Widgets von ProvenExpert und Trustpilot nach — und zwar erst,
   nachdem der Besucher in die Kategorie „Marketing" eingewilligt hat.

   Warum nicht einfach einbauen: Schon das Anfordern eines solchen Widgets
   überträgt die IP-Adresse des Besuchers an den Portalbetreiber, bei
   Trustpilot kommen Cookies dazu. Das ist nach § 25 Abs. 1 TDDDG
   einwilligungspflichtig. Cookiebot würde die Skripte zwar meistens selbst
   blockieren — nachweisbar ist aber nur, was gar nicht erst passiert.
   Deshalb dieselbe Vorgehensweise wie beim GTM-Container im Seitenkopf:
   Wir fragen den Einwilligungsstand ab und laden selbst.

   Jede Karte kennt drei Zustände:

     1. Nicht eingerichtet — die Kennungen im HTML sind noch leer. Dann
        erscheint der Einrichtungs-Hinweis. Kein toter Link, kein leeres
        Feld, keine Anzeige, die nie kommt.
     2. Eingerichtet, keine Einwilligung — es erscheint eine selbst
        ausgelieferte Karte mit einem gewöhnlichen Link zum Profil. Ein Link
        überträgt nichts, solange niemand ihn anklickt; wer ihn anklickt,
        entscheidet das selbst.
     3. Eingerichtet und eingewilligt — das echte Widget wird geladen.

   Die Kennungen stehen als data-Attribute im HTML, nicht hier. Wer ein
   Profil anlegt, trägt sie an genau einer Stelle ein; siehe BEWERTUNGEN.md.
   ========================================================================== */
(function () {
  'use strict';

  var karten = Array.prototype.slice.call(document.querySelectorAll('[data-siegel]'));
  if (!karten.length) return;

  /* Die Kategorie, an der die Anzeigen hängen. Bewertungsportale sind in der
     Cookiebot-Deklaration als „Marketing" eingestuft — steht das dort eines
     Tages anders, ist hier die einzige Stelle, die mitzuziehen ist. */
  var KATEGORIE = 'marketing';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function attr(el, name) {
    return (el.getAttribute(name) || '').trim();
  }

  function eingewilligt() {
    var c = window.Cookiebot && window.Cookiebot.consent;
    return !!(c && c[KATEGORIE]);
  }

  /* Ist alles da, was dieses Portal zum Anzeigen braucht? */
  function eingerichtet(karte) {
    var art = attr(karte, 'data-siegel');
    if (!attr(karte, 'data-profil')) return false;
    if (art === 'provenexpert') return !!attr(karte, 'data-widget');
    if (art === 'trustpilot') return !!(attr(karte, 'data-businessunit') && attr(karte, 'data-template'));
    return false;
  }

  /* ----------------------------------------------------------- Zustände */

  // 1. Profil noch nicht angelegt.
  function zeigeEinrichtung(buehne, name) {
    buehne.innerHTML =
      '<div class="siegel__ersatz">' +
        '<p class="siegel__ersatz-text">Das Profil bei <b>' + esc(name) + '</b> wird gerade ' +
        'eingerichtet. Sobald es freigeschaltet ist, stehen die Bewertungen hier — ' +
        'vollständig und unverändert, so wie das Portal sie ausliefert.</p>' +
      '</div>';
  }

  // 2. Eingerichtet, aber ohne Einwilligung: Link statt Widget.
  function zeigeErsatz(buehne, karte, name) {
    var profil = attr(karte, 'data-profil');
    buehne.innerHTML =
      '<div class="siegel__ersatz">' +
        '<p class="siegel__ersatz-text">Die Bewertungsanzeige von <b>' + esc(name) + '</b> ' +
        'wird erst geladen, wenn Sie der Kategorie „Marketing" zugestimmt haben. ' +
        'Bis dahin überträgt diese Seite nichts an ' + esc(name) + '.</p>' +
        '<div class="siegel__ersatz-wege">' +
          '<button type="button" class="btn btn--navy btn--sm" data-cookie-renew>Anzeige erlauben</button>' +
          '<a class="btn btn--ghost btn--sm" href="' + esc(profil) + '" target="_blank" rel="noopener">' +
            'Profil direkt öffnen <span class="arr" aria-hidden="true">→</span></a>' +
        '</div>' +
      '</div>';

    /* main.js hängt sich beim Laden der Seite an alle [data-cookie-renew] und
       blendet sie aus, wenn Cookiebot fehlt. Dieser Knopf entsteht später,
       also ist er hier selbst zu versorgen — mit derselben Regel: Ein Knopf,
       der die Einwilligung nicht öffnen kann, darf nicht dastehen, als könnte
       er es. */
    var knopf = buehne.querySelector('[data-cookie-renew]');
    if (!knopf) return;
    if (typeof window.Cookiebot === 'undefined' ||
        typeof window.Cookiebot.renew !== 'function') {
      knopf.hidden = true;
      return;
    }
    knopf.addEventListener('click', function () { window.Cookiebot.renew(); });
  }

  // 3. Eingewilligt: das echte Widget.
  function zeigeWidget(buehne, karte) {
    var art = attr(karte, 'data-siegel');
    if (art === 'provenexpert') ladeProvenExpert(buehne, karte);
    if (art === 'trustpilot') ladeTrustpilot(buehne, karte);
  }

  /* ---------------------------------------------------- ProvenExpert
     ProvenExpert liefert im Portal unter „Marketing → Widgets" eine fertige
     Adresse aus. Sie wandert unverändert in data-widget und wird hier als
     Rahmen eingehängt — kein fremdes Skript in unserem Dokument, also auch
     kein fremder Zugriff auf die Seite drumherum. */
  function ladeProvenExpert(buehne, karte) {
    var quelle = attr(karte, 'data-widget');
    var hoehe = attr(karte, 'data-hoehe') || '430';
    var rahmen = document.createElement('iframe');
    rahmen.src = quelle;
    rahmen.title = 'Bewertungen von Finanz-Medizin auf ProvenExpert';
    rahmen.loading = 'lazy';
    rahmen.setAttribute('scrolling', 'no');
    rahmen.style.width = '100%';
    rahmen.style.height = hoehe + 'px';
    rahmen.style.border = '0';
    buehne.innerHTML = '';
    buehne.appendChild(rahmen);
  }

  /* ------------------------------------------------------- Trustpilot
     Trustpilot braucht ein eigenes Skript, das die vorbereiteten Behälter im
     Dokument sucht und füllt. Das Skript wird genau einmal geladen, auch
     wenn mehrere Trustpilot-Anzeigen auf der Seite stünden. */
  var tpSkript = null;

  function ladeTrustpilot(buehne, karte) {
    var behaelter = document.createElement('div');
    behaelter.className = 'trustpilot-widget';
    behaelter.setAttribute('data-locale', 'de-DE');
    behaelter.setAttribute('data-template-id', attr(karte, 'data-template'));
    behaelter.setAttribute('data-businessunit-id', attr(karte, 'data-businessunit'));
    behaelter.setAttribute('data-style-height', (attr(karte, 'data-hoehe') || '380') + 'px');
    behaelter.setAttribute('data-style-width', '100%');
    behaelter.setAttribute('data-theme', 'light');

    /* Fällt das Skript aus — Netz, Blocker, Ausfall beim Anbieter —, bleibt
       dieser Link stehen. Trustpilot verlangt ihn ohnehin. */
    var profil = attr(karte, 'data-profil');
    var link = document.createElement('a');
    link.href = profil;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Bewertungen auf Trustpilot ansehen';
    behaelter.appendChild(link);

    buehne.innerHTML = '';
    buehne.appendChild(behaelter);

    if (tpSkript) {
      // Skript ist schon da: den neuen Behälter einzeln nachladen lassen.
      if (window.Trustpilot && typeof window.Trustpilot.loadFromElement === 'function') {
        window.Trustpilot.loadFromElement(behaelter, true);
      }
      return;
    }

    tpSkript = document.createElement('script');
    tpSkript.src = 'https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js';
    tpSkript.async = true;
    /* Cookiebot blockiert unbekannte Skripte von sich aus. Hier ist die
       Einwilligung bereits geprüft, sonst wäre diese Funktion nicht
       aufgerufen worden — das Attribut verhindert nur eine zweite,
       zeitlich unbestimmte Prüfung durch das Banner. */
    tpSkript.setAttribute('data-cookieconsent', 'ignore');
    document.head.appendChild(tpSkript);
  }

  /* -------------------------------------------------------------- Ablauf
     Gezeichnet wird nur, wenn sich der Zustand einer Karte tatsächlich
     ändert. Ohne diese Prüfung baute der Takt weiter unten die Ersatzkarte
     zwanzigmal neu auf — unsichtbar, aber unnötig, und ein bereits geladenes
     Widget flöge dabei jedes Mal aus dem Dokument. */
  var geladen = false;

  function zeichne() {
    var darf = eingewilligt();

    karten.forEach(function (karte) {
      var buehne = karte.querySelector('[data-siegel-buehne]');
      if (!buehne) return;

      var soll = !eingerichtet(karte) ? 'einrichtung' : (darf ? 'widget' : 'ersatz');
      if (karte.getAttribute('data-zustand') === soll) return;
      karte.setAttribute('data-zustand', soll);

      var name = attr(karte, 'data-name') || 'dem Portal';
      if (soll === 'einrichtung') zeigeEinrichtung(buehne, name);
      else if (soll === 'ersatz') zeigeErsatz(buehne, karte, name);
      else zeigeWidget(buehne, karte);
    });

    geladen = darf;
  }

  /* Die Knöpfe im Abschnitt „Bewertung abgeben" zeigen erst auf #siegel.
     Erst wenn die Bewertungsadresse eingetragen ist, wird daraus ein echter
     Verweis nach draußen. So steht dort nie ein Link ins Leere. */
  function verdrahteBewertungslinks() {
    document.querySelectorAll('[data-bewerten-link]').forEach(function (a) {
      var art = a.getAttribute('data-bewerten-link');
      var karte = document.querySelector('[data-siegel="' + art + '"]');
      if (!karte) return;
      var ziel = attr(karte, 'data-bewerten');
      if (!ziel) return;
      a.href = ziel;
      a.target = '_blank';
      a.rel = 'noopener';
      a.setAttribute('data-bereit', 'ja');
    });
  }

  verdrahteBewertungslinks();
  zeichne();

  // Cookiebot meldet den Einwilligungsstand über diese Ereignisse; ein
  // Widerruf führt über CookiebotOnConsentReady zurück auf den Ersatz.
  window.addEventListener('CookiebotOnAccept', zeichne);
  window.addEventListener('CookiebotOnDecline', zeichne);
  window.addEventListener('CookiebotOnConsentReady', zeichne);

  /* Wiederkehrende Besucher: Cookiebot kann die gespeicherte Einwilligung
     erst nach diesem Skript setzen. Der Takt fragt kurz nach und hört auf,
     sobald geladen wurde oder fünf Sekunden vergangen sind. */
  var versuche = 0;
  var takt = window.setInterval(function () {
    if (!geladen) zeichne();
    if (geladen || ++versuche > 20) window.clearInterval(takt);
  }, 250);
})();
