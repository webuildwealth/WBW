/* ==========================================================================
   finanz-medizin.com — UI
   Navigation, Scroll-Reveals, Zähler, FAQ, Stage-Panels
   ========================================================================== */
(function () {
  'use strict';

  var reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ Nav */
  var nav = document.querySelector('.nav');
  var burger = document.querySelector('.nav__burger');
  var mobile = document.querySelector('.nav__mobile');

  if (nav) {
    var darkZone = document.querySelector('[data-nav-dark]');
    var onScroll = function () {
      nav.classList.toggle('is-stuck', window.scrollY > 24);
      if (darkZone) {
        var end = darkZone.offsetTop + darkZone.offsetHeight - 90;
        nav.classList.toggle('is-dark', window.scrollY < end);
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  if (burger && mobile) {
    /* Der weiche Übergang über der Fußleiste darf nur erscheinen, wenn das
       Menü tatsächlich scrollt. Auf einem iPhone 16/17 Pro passt es ganz —
       dort legte ein fest eingebauter Verlauf einen Schleier über die letzte
       Zeile, die gar nichts verdeckt. CSS kann Scrollbarkeit nicht abfragen,
       deshalb wird sie hier gemessen. */
    var pruefeScroll = function () {
      var scrollt = mobile.scrollHeight - mobile.clientHeight > 2;
      mobile.classList.toggle('scrollt', scrollt);
      // Am unteren Ende ist nichts mehr verdeckt — dann Verlauf wieder aus.
      var amEnde = mobile.scrollTop + mobile.clientHeight >= mobile.scrollHeight - 2;
      mobile.classList.toggle('am-ende', scrollt && amEnde);
    };
    mobile.addEventListener('scroll', pruefeScroll, { passive: true });
    window.addEventListener('resize', pruefeScroll, { passive: true });

    burger.addEventListener('click', function () {
      var open = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!open));
      mobile.classList.toggle('is-open', !open);
      document.body.classList.toggle('nav-open', !open);
      if (!open) window.requestAnimationFrame(pruefeScroll);
    });
    mobile.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        burger.setAttribute('aria-expanded', 'false');
        mobile.classList.remove('is-open');
        document.body.classList.remove('nav-open');
      }
    });
  }

  // Aktiven Menüpunkt markieren
  var here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__link').forEach(function (a) {
    var href = (a.getAttribute('href') || '').split('#')[0];
    if (href && href === here) a.classList.add('is-active');
  });

  /* -------------------------------------------------------------- Reveals */
  var revealables = document.querySelectorAll('[data-reveal]');
  if (reduce || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        ro.unobserve(en.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    revealables.forEach(function (el, i) {
      // Automatische Staffelung innerhalb einer Gruppe
      if (!el.style.getPropertyValue('--d') && el.hasAttribute('data-stagger')) {
        el.style.setProperty('--d', (parseInt(el.getAttribute('data-stagger'), 10) || 90) * (i % 6) + 'ms');
      }
      ro.observe(el);
    });
  }

  // Explizite Staffelung über data-stagger am Container
  document.querySelectorAll('[data-stagger-group]').forEach(function (grp) {
    var step = parseInt(grp.getAttribute('data-stagger-group'), 10) || 90;
    grp.querySelectorAll('[data-reveal]').forEach(function (el, i) {
      el.style.setProperty('--d', (i * step) + 'ms');
    });
  });

  /* --------------------------------------------------------------- Zähler */
  function formatDE(n, dec) {
    return n.toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  var counters = document.querySelectorAll('[data-count]');
  if (counters.length) {
    if (reduce || !('IntersectionObserver' in window)) {
      counters.forEach(function (el) {
        var to = parseFloat(el.getAttribute('data-count'));
        var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
        el.textContent = (el.getAttribute('data-prefix') || '') + formatDE(to, dec) +
          (el.getAttribute('data-suffix') || '');
      });
    } else {
      var co = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var el = en.target;
          co.unobserve(el);
          var to = parseFloat(el.getAttribute('data-count'));
          var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
          var pre = el.getAttribute('data-prefix') || '';
          var suf = el.getAttribute('data-suffix') || '';
          var dur = 1400, t0 = null;
          function step(ts) {
            if (!t0) t0 = ts;
            var p = Math.min(1, (ts - t0) / dur);
            var e = 1 - Math.pow(1 - p, 3);
            el.textContent = pre + formatDE(to * e, dec) + suf;
            if (p < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        });
      }, { threshold: 0.5 });
      counters.forEach(function (el) { co.observe(el); });
    }
  }

  /* ------------------------------------------------------------------ FAQ */
  document.querySelectorAll('.faq__q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.faq__item');
      var open = item.classList.contains('is-open');
      var group = btn.closest('.faq');
      if (group && !group.hasAttribute('data-multi')) {
        group.querySelectorAll('.faq__item.is-open').forEach(function (i) {
          i.classList.remove('is-open');
          i.querySelector('.faq__q').setAttribute('aria-expanded', 'false');
        });
      }
      item.classList.toggle('is-open', !open);
      btn.setAttribute('aria-expanded', String(!open));
    });
  });

  /* --------------------------------------------------- Stage-Textpaneele */
  var stage = document.querySelector('.stage');
  if (stage) {
    var panels = Array.prototype.slice.call(stage.querySelectorAll('.stage__panel'));
    if (panels.length) {
      if (reduce) {
        panels.forEach(function (p) { p.classList.add('is-live'); });
      } else {
        var syncPanels = function () {
          var r = stage.getBoundingClientRect();
          var total = r.height - window.innerHeight;
          var t = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
          // Panels gleichmäßig über den Scrollweg verteilen
          var idx = Math.min(panels.length - 1, Math.floor(t * panels.length * 0.999));
          panels.forEach(function (p, i) { p.classList.toggle('is-live', i === idx); });
        };
        syncPanels();
        window.addEventListener('scroll', syncPanels, { passive: true });
        window.addEventListener('resize', syncPanels, { passive: true });
      }
    }
  }

  /* ------------------------------------------------- Jahr im Impressum/Footer */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  /* ------------------------------------- Kampagnen-Parameter durchreichen */
  try {
    var qs = new URLSearchParams(location.search);
    var keep = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid'];
    var store = {};
    keep.forEach(function (k) { if (qs.get(k)) store[k] = qs.get(k); });
    if (Object.keys(store).length) {
      sessionStorage.setItem('fm_campaign', JSON.stringify(store));
    }
  } catch (e) { /* Storage kann blockiert sein – unkritisch */ }

  /* ------------------------------------------ Cookie-Einstellungen erneut öffnen
     Der Knopf steht auf jeder Seite in der Fußzeile. Er ruft Cookiebot.renew()
     auf, das den Dialog erneut einblendet.

     Solange Cookiebot nicht geladen ist — weil die Domain-Group-ID noch nicht
     eingetragen ist, ein Blocker eingreift oder das Netz klemmt — gäbe es sonst
     eine tote Schaltfläche. Ein Knopf, der nichts tut, ist schlimmer als
     keiner: Beim Thema Einwilligung erweckt er den Eindruck, der Widerruf sei
     möglich, obwohl er ins Leere geht. Deshalb blendet er sich in diesem Fall
     aus und verweist auf die Cookie-Richtlinie. */
  (function () {
    // Mehrzahl: Datenschutzerklärung und Cookie-Richtlinie tragen den Knopf
    // zusätzlich im Fließtext, dort wo vom Widerruf die Rede ist.
    var knoepfe = Array.prototype.slice.call(
      document.querySelectorAll('[data-cookie-renew]')
    );
    if (!knoepfe.length) return;

    function verfuegbar() {
      return typeof window.Cookiebot !== 'undefined' &&
             typeof window.Cookiebot.renew === 'function';
    }

    knoepfe.forEach(function (knopf) {
      knopf.addEventListener('click', function () {
        if (verfuegbar()) window.Cookiebot.renew();
      });
    });

    function pruefe() {
      var aus = !verfuegbar();
      knoepfe.forEach(function (k) { k.hidden = aus; });
    }

    pruefe();
    // Cookiebot meldet sich per Event, sobald es bereit ist; der Timer fängt
    // den Fall ab, dass das Skript später oder gar nicht kommt.
    window.addEventListener('CookiebotOnLoad', pruefe);
    window.addEventListener('CookiebotOnDialogInit', pruefe);
    var versuche = 0;
    var takt = window.setInterval(function () {
      pruefe();
      if (verfuegbar() || ++versuche > 20) window.clearInterval(takt);
    }, 250);
  })();
})();
