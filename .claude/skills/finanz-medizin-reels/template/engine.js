/* Finanz-Medizin Reels – baut die GSAP-Zeitleiste aus den Zeitangaben im HTML.
   Jede Einblendung ist ein .clip mit data-start/data-duration und data-anim.
   Animiert werden nur die Kinder eines .clip, nie der .clip selbst (HyperFrames-Regel). */
(function () {
  "use strict";
  var R = window.REEL || {};
  var tl = gsap.timeline({ paused: true });

  function attr(el, name, fallback) {
    var v = parseFloat(el.getAttribute(name));
    return isNaN(v) ? fallback : v;
  }

  // Zu breite Zeilen verkleinern, bis sie passen (einmal vor dem Aufbau, deterministisch)
  function fit(el) {
    var max = attr(el, "data-fit-max", 960), min = attr(el, "data-fit-min", 40);
    var size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > max && size > min) {
      size -= 2;
      el.style.fontSize = size + "px";
    }
  }

  function exitAt(t0, t1, lead) {
    return Math.max(t0 + 0.5, t1 - (lead || 0.24));
  }

  var fmtCache = {};
  function fmt(v, dec) {
    if (!fmtCache[dec]) fmtCache[dec] = new Intl.NumberFormat("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return fmtCache[dec].format(v);
  }

  var ANIM = {
    hook: function (c, t0, t1) {
      var lines = c.querySelectorAll(".hook-line");
      tl.fromTo(lines, { opacity: 0, y: 46, scale: 0.84 },
        { opacity: 1, y: 0, scale: 1, duration: 0.34, ease: "back.out(1.8)", stagger: 0.07 }, t0 + 0.02);
      tl.to(lines, { opacity: 0, y: -26, duration: 0.22, ease: "power2.in", stagger: 0.03 }, exitAt(t0, t1, 0.28));
    },
    question: function (c, t0, t1) {
      var card = c.querySelector(".q-card");
      tl.fromTo(card, { opacity: 0, y: 60, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.38, ease: "back.out(1.6)" }, t0 + 0.02);
      tl.to(card, { opacity: 0, y: -24, duration: 0.24, ease: "power2.in" }, exitAt(t0, t1, 0.28));
    },
    cap: function (c, t0) {
      var el = c.querySelector(".cap-text");
      tl.fromTo(el, { opacity: 0, scale: 0.9, y: 14 }, { opacity: 1, scale: 1, y: 0, duration: 0.12, ease: "power2.out" }, t0);
    },
    num: function (c, t0, t1) {
      var box = c.querySelector(".num-value"), lab = c.querySelector(".num-label");
      var parts = lab ? [box, lab] : [box];
      tl.fromTo(box, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.36, ease: "back.out(2.2)" }, t0);
      if (lab) tl.fromTo(lab, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.26, ease: "power2.out" }, t0 + 0.12);
      var span = box.querySelector(".count");
      if (span) {
        var to = attr(span, "data-to", 0), from = attr(span, "data-from", 0), dec = attr(span, "data-dec", 0);
        var o = { v: from };
        tl.set(span, { textContent: fmt(from, dec) }, t0);
        tl.to(o, { v: to, duration: Math.min(0.9, (t1 - t0) * 0.6), ease: "power2.out",
          onUpdate: function () { span.textContent = fmt(o.v, dec); } }, t0 + 0.05);
      }
      tl.to(parts, { opacity: 0, scale: 0.92, duration: 0.2, ease: "power2.in" }, exitAt(t0, t1, 0.22));
    },
    item: function (c, t0, t1) {
      var n = c.querySelector(".item-n"), title = c.querySelector(".item-title");
      tl.fromTo(n, { opacity: 0, scale: 0.4, rotation: -30 }, { opacity: 1, scale: 1, rotation: 0, duration: 0.36, ease: "back.out(2)" }, t0);
      tl.fromTo(title, { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.32, ease: "power3.out" }, t0 + 0.1);
      tl.to([n, title], { opacity: 0, y: -20, duration: 0.2, ease: "power2.in" }, exitAt(t0, t1, 0.22));
    },
    mf: function (c, t0, t1) {
      var tag = c.querySelector(".mf-tag"), box = c.querySelector(".mf-box"), strike = c.querySelector(".mf-strike");
      tl.fromTo(tag, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)" }, t0);
      tl.fromTo(box, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.32, ease: "power3.out" }, t0 + 0.12);
      if (strike) tl.fromTo(strike, { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: "power2.inOut" }, Math.min(t0 + 0.9, t1 - 0.6));
      tl.to([tag, box], { opacity: 0, y: -20, duration: 0.2, ease: "power2.in" }, exitAt(t0, t1, 0.22));
    },
    cta: function (c, t0, t1) {
      var card = c.querySelector(".cta-card"), key = c.querySelector(".cta-key");
      tl.fromTo(card, { opacity: 0, y: 90, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.42, ease: "back.out(1.4)" }, t0);
      var pulses = Math.max(0, Math.min(3, Math.floor((t1 - t0 - 0.8) / 0.7)));
      if (pulses > 0) tl.fromTo(key, { scale: 1 }, { scale: 1.07, duration: 0.33, ease: "sine.inOut", yoyo: true, repeat: pulses * 2 - 1 }, t0 + 0.6);
    }
  };

  function build() {
    document.querySelectorAll(".fit").forEach(fit);

    // Zoom: Sprünge an Schnitten und leichte Zooms an wichtigen Stellen (vorberechnet)
    var cam = document.getElementById("cam-wrap");
    tl.set(cam, { scale: 1 }, 0);
    (R.zoom || []).forEach(function (z) {
      if (z.dur > 0) tl.to(cam, { scale: z.scale, duration: z.dur, ease: z.ease || "power2.out" }, z.t);
      else tl.set(cam, { scale: z.scale }, z.t);
    });

    document.querySelectorAll("[data-anim]").forEach(function (c) {
      var t0 = attr(c, "data-start", 0), t1 = t0 + attr(c, "data-duration", 0);
      var fn = ANIM[c.getAttribute("data-anim")];
      if (fn) fn(c, t0, t1);
    });

    window.__timelines["main"] = tl;
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
  else build();
})();
