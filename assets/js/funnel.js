/* ==========================================================================
   finanz-medizin.com — Lead-Funnel
   Mehrstufiger Qualifizierungs-Funnel mit Progressive Profiling.

   Prinzip: die leichte Frage zuerst, die Kontaktdaten zuletzt. Jeder
   beantwortete Schritt erhöht die Abschlusswahrscheinlichkeit (Commitment-
   Bias), die Zusammenfassung vor dem Absenden erzeugt Kontrolle.

   Markup:
     <form class="funnel" data-funnel="praxisinhaber" data-endpoint="">
       <div class="fstep" data-name="…" [data-multi] [data-optional]> … </div>
       <div class="fstep" data-final> Kontaktfelder </div>
     </form>
   ========================================================================== */
(function () {
  'use strict';

  var CHECK = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
    '<path d="M2.5 8.5l3.5 3.5 7.5-8" stroke="currentColor" stroke-width="2.4" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

  function Funnel(form) {
    this.form = form;
    this.name = form.getAttribute('data-funnel') || 'lead';
    this.endpoint = form.getAttribute('data-endpoint') || '';
    this.steps = Array.prototype.slice.call(form.querySelectorAll('.fstep'));
    this.bar = form.querySelector('.funnel__progress i');
    this.stepLabel = form.querySelector('[data-fm-step]');
    this.summaryBox = form.querySelector('[data-fm-summary]');
    this.backBtn = form.querySelector('[data-fm-back]');
    this.data = {};
    this.i = 0;
    this.started = false;
    this.t0 = Date.now();

    this.prepOptions();
    this.bind();
    this.show(0, true);
  }

  /* ------------------------------------------------------ Optionen aufbauen */
  Funnel.prototype.prepOptions = function () {
    this.form.querySelectorAll('.opt').forEach(function (opt) {
      if (!opt.querySelector('.opt__box')) {
        var box = document.createElement('span');
        box.className = 'opt__box';
        box.innerHTML = CHECK;
        opt.insertBefore(box, opt.firstChild);
      }
      opt.setAttribute('type', 'button');
      opt.setAttribute('aria-pressed', 'false');
    });
  };

  /* ------------------------------------------------------------- Bindings */
  Funnel.prototype.bind = function () {
    var self = this;

    this.form.addEventListener('click', function (e) {
      var opt = e.target.closest('.opt');
      if (opt) { self.pick(opt); return; }

      var next = e.target.closest('[data-fm-next]');
      if (next) { e.preventDefault(); self.next(); return; }

      var back = e.target.closest('[data-fm-back]');
      if (back) { e.preventDefault(); self.prev(); return; }
    });

    this.form.addEventListener('submit', function (e) {
      e.preventDefault();
      self.submit();
    });

    // Enter im Eingabefeld = weiter
    this.form.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var el = e.target;
      if (el.tagName === 'TEXTAREA') return;
      if (el.tagName === 'INPUT' && !self.isFinal()) { e.preventDefault(); self.next(); }
    });

    // Live-Fehler entfernen
    this.form.addEventListener('input', function (e) {
      var field = e.target.closest('.field');
      if (field) { field.classList.remove('has-err'); e.target.removeAttribute('aria-invalid'); }
    });
  };

  Funnel.prototype.isFinal = function () {
    return this.steps[this.i] && this.steps[this.i].hasAttribute('data-final');
  };

  /* ---------------------------------------------------------- Auswahl */
  Funnel.prototype.pick = function (opt) {
    var step = opt.closest('.fstep');
    var multi = step.hasAttribute('data-multi');
    var self = this;

    if (multi) {
      var on = opt.classList.toggle('is-picked');
      opt.setAttribute('aria-pressed', String(on));
    } else {
      step.querySelectorAll('.opt').forEach(function (o) {
        o.classList.remove('is-picked');
        o.setAttribute('aria-pressed', 'false');
      });
      opt.classList.add('is-picked');
      opt.setAttribute('aria-pressed', 'true');
    }
    this.collect(step);

    if (!multi) {
      // Kurze Bestätigungspause, dann automatisch weiter
      window.setTimeout(function () {
        if (self.steps[self.i] === step) self.next();
      }, 260);
    }
  };

  Funnel.prototype.collect = function (step) {
    var key = step.getAttribute('data-name');
    if (!key) return;
    var picked = Array.prototype.slice.call(step.querySelectorAll('.opt.is-picked'));
    if (picked.length) {
      this.data[key] = picked.map(function (o) {
        return o.getAttribute('data-value') || (o.querySelector('.opt__label') || o).textContent.trim();
      }).join(', ');
    } else {
      delete this.data[key];
    }
  };

  /* --------------------------------------------------------- Navigation */
  Funnel.prototype.show = function (i, silent) {
    var self = this;
    this.i = Math.max(0, Math.min(this.steps.length - 1, i));
    this.steps.forEach(function (s, k) { s.classList.toggle('is-active', k === self.i); });

    var pct = (this.i / (this.steps.length - 1)) * 100;
    if (this.bar) this.bar.style.width = Math.max(6, pct) + '%';
    if (this.stepLabel) {
      this.stepLabel.textContent = 'Schritt ' + (this.i + 1) + ' von ' + this.steps.length;
    }
    if (this.backBtn) this.backBtn.style.visibility = this.i === 0 ? 'hidden' : 'visible';

    if (this.isFinal()) this.renderSummary();

    if (!silent) {
      // Sanft in den Blick rücken, ohne die Seite zu verreißen
      var r = this.form.getBoundingClientRect();
      if (r.top < 70 || r.top > window.innerHeight * 0.55) {
        window.scrollTo({
          top: window.scrollY + r.top - 100,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
        });
      }
      var focusable = this.steps[this.i].querySelector('input, select, textarea, .opt');
      if (focusable && !('ontouchstart' in window)) {
        window.setTimeout(function () { focusable.focus({ preventScroll: true }); }, 320);
      }
    }
  };

  Funnel.prototype.next = function () {
    var step = this.steps[this.i];
    this.collect(step);

    if (this.isFinal()) { this.submit(); return; }

    var needsChoice = step.querySelector('.opt') && !step.hasAttribute('data-optional');
    if (needsChoice && !step.querySelector('.opt.is-picked')) {
      this.shake(step);
      return;
    }
    if (!this.validateFields(step)) return;

    this.started = true;
    this.show(this.i + 1);
  };

  Funnel.prototype.prev = function () {
    if (this.i > 0) this.show(this.i - 1);
  };

  Funnel.prototype.shake = function (step) {
    step.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' },
       { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
      { duration: 320, easing: 'ease-in-out' }
    );
  };

  /* --------------------------------------------------------- Validierung */
  Funnel.prototype.validateFields = function (step) {
    var ok = true;
    step.querySelectorAll('input[data-required], select[data-required]').forEach(function (el) {
      var field = el.closest('.field') || el.closest('.consent');
      var val = el.type === 'checkbox' ? el.checked : el.value.trim();
      var bad = !val;
      if (!bad && el.type === 'email') bad = !EMAIL_RE.test(el.value.trim());
      if (!bad && el.getAttribute('data-min')) bad = el.value.trim().length < parseInt(el.getAttribute('data-min'), 10);
      if (bad) {
        ok = false;
        if (field) field.classList.add('has-err');
        el.setAttribute('aria-invalid', 'true');
      }
    });
    if (!ok) {
      this.shake(step);
      var first = step.querySelector('[aria-invalid="true"]');
      if (first) first.focus({ preventScroll: true });
    }
    return ok;
  };

  /* ------------------------------------------------------ Zusammenfassung */
  Funnel.prototype.renderSummary = function () {
    if (!this.summaryBox) return;
    var self = this;
    var rows = [];
    this.steps.forEach(function (s) {
      var key = s.getAttribute('data-name');
      if (!key || !self.data[key]) return;
      var label = s.getAttribute('data-label') || key;
      rows.push('<div><span>' + esc(label) + '</span><b>' + esc(self.data[key]) + '</b></div>');
    });
    this.summaryBox.innerHTML = rows.length
      ? rows.join('')
      : '<div><span>Ihre Angaben</span><b>werden im Gespräch besprochen</b></div>';
    this.summaryBox.style.display = rows.length ? '' : 'none';
  };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* --------------------------------------------------------------- Absenden */
  Funnel.prototype.submit = function () {
    var step = this.steps[this.i];
    this.collect(step);
    if (!this.validateFields(step)) return;

    // Honeypot – Bots füllen unsichtbare Felder aus
    var hp = this.form.querySelector('[name="website"]');
    if (hp && hp.value) return;

    var payload = { funnel: this.name };
    var self = this;
    Object.keys(this.data).forEach(function (k) { payload[k] = self.data[k]; });

    // Die lesbaren Feldnamen stehen im Markup (data-label). Wir schicken sie mit,
    // damit im CRM „Teamgröße“ steht und nicht der technische Schlüssel.
    var labels = {};
    this.steps.forEach(function (st) {
      var key = st.getAttribute('data-name');
      if (key && self.data[key]) labels[key] = st.getAttribute('data-label') || key;
    });
    if (Object.keys(labels).length) payload._labels = labels;

    this.form.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (!el.name || el.name === 'website') return;
      payload[el.name] = el.type === 'checkbox' ? (el.checked ? 'ja' : 'nein') : el.value.trim();
    });

    try {
      var camp = sessionStorage.getItem('fm_campaign');
      if (camp) payload.kampagne = camp;
    } catch (e) { /* egal */ }
    payload.seite = location.pathname;
    payload.verweis = document.referrer || '';
    payload.dauer_sek = Math.round((Date.now() - this.t0) / 1000);
    payload.zeitpunkt = new Date().toISOString();

    var btn = this.form.querySelector('[data-fm-submit]');
    if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Wird gesendet …'; }

    var done = function () {
      try { sessionStorage.setItem('fm_lead', JSON.stringify(payload)); } catch (e) {}
      var q = '?f=' + encodeURIComponent(self.name);
      if (payload.vorname) q += '&n=' + encodeURIComponent(payload.vorname);
      location.href = 'danke.html' + q;
    };

    var fail = function () {
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || 'Absenden'; }
      var box = self.form.querySelector('[data-fm-error]');
      if (box) {
        box.hidden = false;
        box.textContent = 'Das hat gerade nicht geklappt. Bitte schreiben Sie uns kurz an ' +
          'info@finanz-medizin.com – wir melden uns umgehend.';
      }
    };

    if (!this.endpoint) { done(); return; }

    fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { r.ok ? done() : fail(); }).catch(fail);
  };

  /* ----------------------------------------------------------------- Init */
  document.querySelectorAll('[data-funnel]').forEach(function (f) { new Funnel(f); });

  /* -------------------------------------------- Danke-Seite personalisieren */
  var thanks = document.querySelector('[data-thanks]');
  if (thanks) {
    var qs = new URLSearchParams(location.search);
    var n = qs.get('n');
    var f = qs.get('f');
    var greet = document.querySelector('[data-thanks-name]');
    if (greet && n) greet.textContent = ' ' + n.replace(/[<>&"]/g, '');
    document.querySelectorAll('[data-thanks-for]').forEach(function (el) {
      el.hidden = el.getAttribute('data-thanks-for') !== f;
    });
  }
})();
