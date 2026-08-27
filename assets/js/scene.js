/* ==========================================================================
   finanz-medizin.com — 3D Scroll Scene
   Abhängigkeitsfreier 3D-Renderer auf Canvas 2D.
   Eigene Perspektiv-Projektion, tiefensortierte Tube-Segmente, Speculars.

   Erzählbogen (scrollgesteuert):
     0  STETHOSKOP   – das Werkzeug, das jeder in der Praxis kennt
     1  EKG          – wir nehmen die Finanzen auf wie einen Befund
     2  WACHSTUM     – aus dem Befund wird eine Vermögenskurve
     3  SIGNET       – alles fügt sich zur Bildmarke Finanz-Medizin

   Öffentliche API:  FMScene.mount(canvas, { mode, target, stage })
   ========================================================================== */
(function (global) {
  'use strict';

  var N = 132;                 // Punkte pro Strang
  var TARGETS = 4;
  var TAU = Math.PI * 2;

  var reduceMotion = global.matchMedia &&
    global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- Utils */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function easeInOut(t) {
    t = clamp(t, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function hex(h) {
    h = h.replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function mixRGB(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  }
  function rgba(c, shade, alpha) {
    var r = clamp(c[0] * shade, 0, 255) | 0,
        g = clamp(c[1] * shade, 0, 255) | 0,
        b = clamp(c[2] * shade, 0, 255) | 0;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  // Stützstellen über t = 0..1 weich interpolieren
  function kf(t, keys) {
    var n = keys.length - 1;
    var x = clamp(t, 0, 1) * n;
    var i = Math.min(n - 1, Math.floor(x));
    return lerp(keys[i], keys[i + 1], easeInOut(x - i));
  }
  var YAW_KF   = [-0.58, -0.16, 0.30, 0.02];
  var PITCH_KF = [0.17, 0.06, 0.03, 0.00];

  /* ------------------------------------------------- Geometrie: Zielformen */

  // EKG-Kurve (P-Q-R-S-T) über u = 0..1
  function ekgY(u) {
    function g(c, s) { var d = (u - c) / s; return Math.exp(-d * d); }
    return 0.15 * g(0.28, 0.045)   // P-Welle
         - 0.12 * g(0.435, 0.014)  // Q
         + 0.98 * g(0.468, 0.012)  // R-Zacke
         - 0.30 * g(0.505, 0.017)  // S
         + 0.28 * g(0.65, 0.058);  // T-Welle
  }

  // Liefert für Strang si (0..2) und Ziel ti (0..3) den Punkt bei s = 0..1
  function shape(si, ti, s) {
    var x = 0, y = 0, z = 0, k, ang;

    if (ti === 0) {
      /* ---------------------------------------------- 0 · STETHOSKOP ---- */
      if (si === 0) {                       // Ohrbügel (Binaural, Lyra-Form)
        var q = s * 2 - 1;                  // -1 .. 1
        var a = Math.abs(q);
        // Exponent < 1 zieht die Bügel unten zusammen und lässt sie oben
        // ausschwingen — genau die Silhouette, die man als Stethoskop liest.
        x = 0.68 * q * Math.pow(a, 0.55);
        y = 0.10 + 0.94 * Math.pow(a, 1.22);
        z = 0.28 * q * (1 - 0.35 * a);
      } else if (si === 1) {                // Schlauch vom Y-Stück zum Stutzen
        k = s;
        x = 0.40 * Math.sin(Math.PI * k) * (0.25 + 0.75 * k) + 0.10 * k;
        y = 0.10 - 0.82 * k;
        z = 0.34 * Math.sin(Math.PI * k) * Math.cos(Math.PI * k * 0.7) + 0.06 * k;
      } else {                              // Puls im Schlauch (Glanzlinie)
        k = s;
        x = 0.40 * Math.sin(Math.PI * k) * (0.25 + 0.75 * k) + 0.10 * k + 0.020;
        y = 0.10 - 0.82 * k;
        z = 0.34 * Math.sin(Math.PI * k) * Math.cos(Math.PI * k * 0.7) + 0.06 * k + 0.030;
      }

    } else if (ti === 1) {
      /* ---------------------------------------------------- 1 · EKG ----- */
      if (si === 0) {                       // Grundlinie / Achse
        x = -1.18 + 2.36 * s;
        y = -0.72;
        z = -0.05;
      } else if (si === 1) {                // EKG-Spur
        x = -1.15 + 2.30 * s;
        y = -0.16 + 0.78 * ekgY(s);
        z = 0;
      } else {                              // Echo-Spur (versetzt, leiser)
        x = -1.15 + 2.30 * s;
        y = -0.16 + 0.78 * ekgY(clamp(s + 0.055, 0, 1)) - 0.05;
        z = -0.26;
      }

    } else if (ti === 2) {
      /* ----------------------------------------------- 2 · WACHSTUM ----- */
      if (si === 0) {                       // Achsenkreuz (L-Form, ein Strich)
        if (s < 0.46) {
          x = -1.06;
          y = 0.92 - (s / 0.46) * 1.84;
        } else {
          x = -1.06 + ((s - 0.46) / 0.54) * 2.14;
          y = -0.92;
        }
        z = -0.16;
      } else if (si === 1) {                // "Mit Plan" – Zinseszinskurve
        k = s;
        x = -1.00 + 2.02 * k;
        y = -0.84 + 1.72 * Math.pow(k, 2.25);
        z = 0.16 * Math.sin(Math.PI * k);
      } else {                              // "Ohne Plan" – flache Gerade
        k = s;
        x = -1.00 + 2.02 * k;
        y = -0.84 + 0.52 * k;
        z = -0.30 + 0.06 * Math.sin(Math.PI * k);
      }

    } else {
      /* ------------------------------------------------- 3 · SIGNET ----- */
      if (si === 0) {                       // linker Bogen (navy)
        ang = Math.PI * 0.5 + s * Math.PI;
        x = 0.92 * Math.cos(ang);
        y = 0.92 * Math.sin(ang);
        z = 0.04 * Math.sin(s * Math.PI);
      } else if (si === 1) {                // rechter Bogen (bordeaux)
        ang = Math.PI * 0.5 - s * Math.PI;
        x = 0.92 * Math.cos(ang);
        y = 0.92 * Math.sin(ang);
        z = 0.04 * Math.sin(s * Math.PI);
      } else {                              // Äskulapstab mit Schlange
        k = s;
        y = -0.78 + 1.44 * k;
        x = -0.04 + 0.19 * Math.sin(k * Math.PI * 3.05) * (0.45 + 0.55 * k);
        z = 0.19 * Math.cos(k * Math.PI * 3.05) * (0.45 + 0.55 * k);
      }
    }
    return [x, y, z];
  }

  // Alle Zielformen einmalig vorberechnen: strands[si][ti] = Float32Array(N*3)
  function buildStrands() {
    var strands = [], si, ti, i, s, p;
    for (si = 0; si < 3; si++) {
      var per = [];
      for (ti = 0; ti < TARGETS; ti++) {
        var arr = new Float32Array(N * 3);
        for (i = 0; i < N; i++) {
          s = i / (N - 1);
          p = shape(si, ti, s);
          arr[i * 3] = p[0]; arr[i * 3 + 1] = p[1]; arr[i * 3 + 2] = p[2];
        }
        per.push(arr);
      }
      strands.push(per);
    }
    return strands;
  }
  var STRANDS = buildStrands();

  /* --------------------------------------------------------- Farbpaletten */
  var COL = {
    a: [hex('#1D4E7E'), hex('#4E7EA6'), hex('#1E5A88'), hex('#0C2C4F')],
    b: [hex('#123A61'), hex('#8C1E2F'), hex('#751524'), hex('#751524')],
    c: [hex('#EFE9E4'), hex('#F0C6CD'), hex('#6F93B4'), hex('#EDE8E7')]
  };
  var WIDTH = {
    a: [0.062, 0.020, 0.014, 0.070],
    b: [0.066, 0.030, 0.034, 0.070],
    c: [0.020, 0.017, 0.017, 0.048]
  };
  var ALPHA = {
    a: [1, 0.55, 0.5, 1],
    b: [1, 1, 1, 1],
    c: [0.85, 0.5, 0.55, 1]
  };

  // Bruststück / Knoten: Position, Radius, Neigung je Ziel
  var DISC = [
    { p: [0.10, -1.02, 0.06], r: 0.30, tilt: 0.55, alpha: 1 },
    { p: [0.03, 0.60, 0.02], r: 0.075, tilt: 0.0, alpha: 0.95 },
    { p: [1.00, 0.86, 0.02], r: 0.085, tilt: 0.0, alpha: 1 },
    { p: [-0.04, 0.78, 0.00], r: 0.125, tilt: 0.0, alpha: 1 }
  ];

  // Ohroliven (nur Ziel 0 sichtbar)
  var BUDS = [
    [[-0.68, 1.05, -0.18], [0.68, 1.05, 0.18]],
    [[-1.18, -0.72, -0.05], [1.18, -0.72, -0.05]],
    [[-1.06, 0.92, -0.16], [1.08, -0.92, -0.16]],
    [[-0.92, 0.0, 0.0], [0.92, 0.0, 0.0]]
  ];
  var BUD_A = [1, 0, 0, 0];
  var BUD_R = [0.105, 0.085, 0.085, 0.085];

  // Anteil der Stethoskop-Form an der aktuellen Morph-Stufe. Steuert die
  // Bauteile, die es nur dort gibt: Y-Stück, Ansatzstutzen, Riffelrand.
  var STETH_A = [1, 0, 0, 0];

  // Y-Stück (Zusammenführung der Ohrbügel) und Stutzen am Bruststück
  var YOKE = [0.00, 0.13, 0.00];
  var STEM = [[0.10, -0.72, 0.06], [0.10, -0.95, 0.06]];

  // Balken (Logo-Motiv). x, Basis-y, Höhe, Breite
  var BARS = [
    [[0.30, -0.90, 0.0, 0.16], [0.60, -0.90, 0.0, 0.16], [0.90, -0.90, 0.0, 0.16]],
    [[0.30, -0.72, 0.0, 0.16], [0.60, -0.72, 0.0, 0.16], [0.90, -0.72, 0.0, 0.16]],
    [[0.12, -0.90, 0.62, 0.20], [0.50, -0.90, 1.06, 0.20], [0.88, -0.90, 1.52, 0.20]],
    [[0.26, -0.60, 0.30, 0.112], [0.47, -0.60, 0.52, 0.112], [0.68, -0.60, 0.76, 0.112]]
  ];
  var BAR_A = [0, 0, 1, 1];

  /* ------------------------------------------------------------- Renderer */

  function Scene(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = opts.mode || 'idle';          // 'stage' | 'idle'
    this.stage = opts.stage || null;          // Element für Scroll-Fortschritt
    this.baseTarget = opts.target != null ? opts.target : 0;
    this.driftTo = opts.driftTo != null ? opts.driftTo : null;
    this.spinSpeed = opts.spin != null ? opts.spin : 0.16;
    this.tilt = opts.tilt != null ? opts.tilt : 0.10;

    this.dpr = 1; this.w = 0; this.h = 0;
    this.t = 0;                 // 0..1 Morph-Fortschritt über alle Ziele
    this.tSmooth = 0;
    this.time = 0;
    this.mx = 0; this.my = 0;   // Mausparallaxe
    this.tmx = 0; this.tmy = 0;
    this.visible = true;
    this.items = [];            // tiefensortierte Zeichenbefehle
    this.pts = new Float32Array(N * 3);
    this.proj = new Float32Array(N * 3); // sx, sy, w
    this.particles = [];
    for (var i = 0; i < 54; i++) {
      this.particles.push({
        x: (Math.random() * 2 - 1) * 2.4,
        y: (Math.random() * 2 - 1) * 1.7,
        z: (Math.random() * 2 - 1) * 1.5,
        s: 0.4 + Math.random() * 0.9,
        ph: Math.random() * TAU
      });
    }
    this.resize();
    this.bind();
  }

  Scene.prototype.bind = function () {
    var self = this;
    this._onResize = function () { self.resize(); };
    global.addEventListener('resize', this._onResize, { passive: true });

    if (!reduceMotion) {
      this._onMove = function (e) {
        var r = self.canvas.getBoundingClientRect();
        self.tmx = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1);
        self.tmy = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
      };
      global.addEventListener('pointermove', this._onMove, { passive: true });
    }

    if ('IntersectionObserver' in global) {
      var io = new IntersectionObserver(function (es) {
        self.visible = es[0].isIntersecting;
      }, { rootMargin: '120px' });
      io.observe(this.stage || this.canvas);
      this._io = io;
    }
  };

  Scene.prototype.resize = function () {
    var r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(global.devicePixelRatio || 1, 2);
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.scale = Math.min(this.w, this.h) * (this.mode === 'stage' ? 0.30 : 0.34);
    this.cx = this.w * 0.5;
    this.cy = this.h * 0.5;
    if (this.mode === 'stage') {
      if (this.w > 980) { this.cx = this.w * 0.60; }
      else { this.cy = this.h * 0.21; this.scale = Math.min(this.w, this.h) * 0.215; }
    }
  };

  Scene.prototype.destroy = function () {
    global.removeEventListener('resize', this._onResize);
    if (this._onMove) global.removeEventListener('pointermove', this._onMove);
    if (this._io) this._io.disconnect();
    this.dead = true;
  };

  /* -- Kamera / Projektion ------------------------------------------------ */
  Scene.prototype.setCam = function () {
    var t = this.tSmooth, time = this.time;
    var yaw, pitch;

    if (this.mode === 'stage') {
      // Keyframes je Akt: das Signet steht am Ende frontal zur Kamera
      yaw = kf(t, YAW_KF) + Math.sin(time * 0.18) * 0.045;
      pitch = kf(t, PITCH_KF) + Math.sin(time * 0.23) * 0.028;
    } else {
      yaw = Math.sin(time * this.spinSpeed) * 0.55;
      pitch = this.tilt + Math.sin(time * this.spinSpeed * 0.73) * 0.06;
    }
    yaw += this.mx * 0.22;
    pitch += -this.my * 0.14;

    this.cyaw = Math.cos(yaw); this.syaw = Math.sin(yaw);
    this.cpit = Math.cos(pitch); this.spit = Math.sin(pitch);
    this.dist = 4.3;
    this.f = 3.5;
  };

  Scene.prototype.project = function (x, y, z, out, o) {
    var rx = x * this.cyaw + z * this.syaw;
    var rz = -x * this.syaw + z * this.cyaw;
    var ry = y * this.cpit - rz * this.spit;
    rz = y * this.spit + rz * this.cpit;
    var w = this.f / Math.max(0.6, this.dist - rz);
    out[o] = this.cx + rx * w * this.scale;
    out[o + 1] = this.cy - ry * w * this.scale;
    out[o + 2] = w;
    return rz;
  };

  /* -- Morph -------------------------------------------------------------- */
  // Liefert {i0, i1, f} — Interpolation zwischen zwei Zielformen
  Scene.prototype.morph = function () {
    if (this.mode !== 'stage') {
      if (this.driftTo == null) return { i0: this.baseTarget, i1: this.baseTarget, f: 0 };
      var osc = 0.5 - 0.5 * Math.cos(this.time * 0.34);
      return { i0: this.baseTarget, i1: this.driftTo, f: smooth(osc) };
    }
    var m = clamp(this.tSmooth, 0, 0.9999) * (TARGETS - 1);
    var i0 = Math.floor(m);
    return { i0: i0, i1: Math.min(i0 + 1, TARGETS - 1), f: easeInOut(m - i0) };
  };

  /* -- Zeichenbefehle sammeln --------------------------------------------- */
  Scene.prototype.push = function (z, fn) { this.items.push({ z: z, fn: fn }); };

  Scene.prototype.drawStrand = function (si, mo) {
    var A = STRANDS[si][mo.i0], B = STRANDS[si][mo.i1], f = mo.f;
    var key = si === 0 ? 'a' : si === 1 ? 'b' : 'c';
    var col = mixRGB(COL[key][mo.i0], COL[key][mo.i1], f);
    var wid = lerp(WIDTH[key][mo.i0], WIDTH[key][mo.i1], f);
    var alp = lerp(ALPHA[key][mo.i0], ALPHA[key][mo.i1], f);
    if (alp < 0.02) return;

    var i, o, depth, ctx = this.ctx, self = this;
    var pr = this.proj, dep = this._dep || (this._dep = new Float32Array(N));

    for (i = 0; i < N; i++) {
      o = i * 3;
      dep[i] = this.project(
        lerp(A[o], B[o], f),
        lerp(A[o + 1], B[o + 1], f),
        lerp(A[o + 2], B[o + 2], f),
        pr, o
      );
    }

    // Segmente einzeln einreihen → korrekte Tiefensortierung über alle Objekte
    var snap = new Float32Array(pr);      // Frame-Kopie (pr wird wiederverwendet)
    var dsnap = new Float32Array(dep);

    for (i = 0; i < N - 1; i++) {
      (function (i) {
        var o1 = i * 3, o2 = (i + 1) * 3;
        var zmid = (dsnap[i] + dsnap[i + 1]) * 0.5;
        self.push(zmid, function () {
          var x1 = snap[o1], y1 = snap[o1 + 1], w1 = snap[o1 + 2];
          var x2 = snap[o2], y2 = snap[o2 + 1], w2 = snap[o2 + 2];
          var lw = wid * ((w1 + w2) * 0.5) * self.scale;
          if (lw < 0.35) lw = 0.35;
          // Tiefenschattierung: nah = heller, fern = dunkler
          var shade = 0.62 + 0.55 * clamp((zmid + 1.1) / 2.2, 0, 1);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = rgba(col, shade, alp);
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
          ctx.stroke();
          // Spekular-Glanz (Zylinder-Illusion)
          if (lw > 2.2) {
            var ox = -lw * 0.20, oy = -lw * 0.24;
            ctx.strokeStyle = rgba(col, shade * 1.9 + 0.28, alp * 0.5);
            ctx.lineWidth = lw * 0.30;
            ctx.beginPath();
            ctx.moveTo(x1 + ox, y1 + oy); ctx.lineTo(x2 + ox, y2 + oy);
            ctx.stroke();
          }
        });
      })(i);
    }

    // Pulswelle: Lichtpunkt, der durch Schlauch / EKG / Kurve läuft
    if (si === 1 && !reduceMotion) {
      var head = (this.time * 0.30) % 1.35;
      if (head < 1) {
        var hi = Math.min(N - 2, Math.max(1, Math.round(head * (N - 1))));
        var tail = 16;
        for (i = Math.max(0, hi - tail); i < hi; i++) {
          (function (i, hi) {
            var o1 = i * 3, o2 = (i + 1) * 3;
            var g = (i - (hi - tail)) / tail;
            self.push(dsnap[i] + 0.02, function () {
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              ctx.lineCap = 'round';
              ctx.strokeStyle = 'rgba(255,236,222,' + (0.55 * g * g).toFixed(3) + ')';
              ctx.lineWidth = wid * snap[o1 + 2] * self.scale * (0.42 + 0.5 * g);
              ctx.beginPath();
              ctx.moveTo(snap[o1], snap[o1 + 1]); ctx.lineTo(snap[o2], snap[o2 + 1]);
              ctx.stroke();
              ctx.restore();
            });
          })(i, hi);
        }
      }
    }
  };

  // Bruststück / Knotenpunkt als schattierte Scheibe
  Scene.prototype.drawDisc = function (mo) {
    var d0 = DISC[mo.i0], d1 = DISC[mo.i1], f = mo.f, self = this, ctx = this.ctx;
    var px = lerp(d0.p[0], d1.p[0], f),
        py = lerp(d0.p[1], d1.p[1], f),
        pz = lerp(d0.p[2], d1.p[2], f),
        r = lerp(d0.r, d1.r, f),
        alpha = lerp(d0.alpha, d1.alpha, f);
    var out = new Float32Array(3);
    var z = this.project(px, py, pz, out, 0);
    var sx = out[0], sy = out[1], w = out[2];
    var R = r * w * this.scale;
    var squash = 0.62 + 0.38 * Math.abs(this.cyaw);
    var steth = lerp(STETH_A[mo.i0], STETH_A[mo.i1], f);

    this.push(z + 0.01, function () {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(self.syaw * 0.30);
      // Gehäusering
      var g = ctx.createLinearGradient(-R, -R, R, R);
      g.addColorStop(0, '#FBF7F4');
      g.addColorStop(0.42, '#D9D0C9');
      g.addColorStop(0.7, '#B7ADA5');
      g.addColorStop(1, '#EFE8E2');
      ctx.beginPath();
      ctx.ellipse(0, 0, R, R * squash, 0, 0, TAU);
      ctx.fillStyle = g;
      ctx.globalAlpha = alpha;
      ctx.fill();
      // Membran
      var g2 = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.05, 0, 0, R * 0.82);
      g2.addColorStop(0, 'rgba(255,255,255,.95)');
      g2.addColorStop(0.55, '#E7E0DA');
      g2.addColorStop(1, '#C6BCB4');
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 0.78, R * 0.78 * squash, 0, 0, TAU);
      ctx.fillStyle = g2;
      ctx.fill();
      // Glanzkante
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 0.96, R * 0.96 * squash, 0, Math.PI * 1.05, Math.PI * 1.85);
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = Math.max(1, R * 0.07);
      ctx.stroke();

      /* Nur in der Stethoskop-Stufe: die Details, an denen man das Bruststück
         tatsächlich erkennt — geriffelter Metallrand, abgesetzte Membrankante
         und der eingelassene Membranring. */
      if (steth > 0.02) {
        ctx.globalAlpha = alpha * steth;

        // Riffelung (Rändelrand) des Gehäuses
        ctx.strokeStyle = 'rgba(120,110,102,.55)';
        ctx.lineWidth = Math.max(0.6, R * 0.035);
        for (var t = 0; t < 46; t++) {
          var an = (t / 46) * TAU;
          var ca = Math.cos(an), sa = Math.sin(an) * squash;
          ctx.beginPath();
          ctx.moveTo(ca * R * 0.845, sa * R * 0.845);
          ctx.lineTo(ca * R * 0.985, sa * R * 0.985);
          ctx.stroke();
        }

        // Kante zwischen Gehäuse und Membran
        ctx.beginPath();
        ctx.ellipse(0, 0, R * 0.80, R * 0.80 * squash, 0, 0, TAU);
        ctx.strokeStyle = 'rgba(96,88,82,.6)';
        ctx.lineWidth = Math.max(1, R * 0.055);
        ctx.stroke();

        // Membranring
        ctx.beginPath();
        ctx.ellipse(0, 0, R * 0.60, R * 0.60 * squash, 0, 0, TAU);
        ctx.strokeStyle = 'rgba(140,131,123,.45)';
        ctx.lineWidth = Math.max(0.6, R * 0.03);
        ctx.stroke();

        // Mittelpunkt der Membran
        ctx.beginPath();
        ctx.ellipse(0, 0, R * 0.10, R * 0.10 * squash, 0, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.fill();

        ctx.globalAlpha = 1;
      }
      ctx.restore();
    });
  };

  // Ohroliven
  Scene.prototype.drawBuds = function (mo) {
    var a = lerp(BUD_A[mo.i0], BUD_A[mo.i1], mo.f);
    if (a < 0.02) return;
    var P0 = BUDS[mo.i0], P1 = BUDS[mo.i1], ctx = this.ctx, self = this;
    var budR = lerp(BUD_R[mo.i0], BUD_R[mo.i1], mo.f);
    var steth = lerp(STETH_A[mo.i0], STETH_A[mo.i1], mo.f);
    for (var i = 0; i < 2; i++) {
      var out = new Float32Array(3);
      var z = this.project(
        lerp(P0[i][0], P1[i][0], mo.f),
        lerp(P0[i][1], P1[i][1], mo.f),
        lerp(P0[i][2], P1[i][2], mo.f), out, 0);
      (function (sx, sy, w, z, tilt) {
        self.push(z + 0.02, function () {
          var R = budR * w * self.scale;
          var g = ctx.createRadialGradient(sx - R * 0.4, sy - R * 0.45, R * 0.1, sx, sy, R);
          g.addColorStop(0, '#FFFFFF');
          g.addColorStop(0.6, '#DED6CE');
          g.addColorStop(1, '#A79D95');
          ctx.save();
          ctx.globalAlpha = a;
          ctx.translate(sx, sy);
          // Leicht gestauchte, gekippte Form: eine Olive, keine Kugel
          ctx.rotate(tilt);
          ctx.beginPath(); ctx.ellipse(0, 0, R, R * 0.76, 0, 0, TAU);
          ctx.fillStyle = g; ctx.fill();
          if (steth > 0.02 && R > 2) {
            ctx.globalAlpha = a * steth;
            ctx.beginPath(); ctx.ellipse(0, R * 0.30, R * 0.72, R * 0.20, 0, 0, TAU);
            ctx.strokeStyle = 'rgba(104,96,89,.45)';
            ctx.lineWidth = Math.max(0.6, R * 0.09);
            ctx.stroke();
          }
          ctx.restore();
        });
      })(out[0], out[1], out[2], z, i === 0 ? 0.55 : -0.55);
    }
  };

  /* Kurzes Metallrohr zwischen zwei Raumpunkten. Wird für die beiden
     Bauteile gebraucht, die ein Stethoskop unverwechselbar machen:
     das Y-Stück unter den Ohrbügeln und der Stutzen am Bruststück. */
  Scene.prototype.chromeTube = function (p0, p1, rad, alpha, zbias, knurl) {
    var o0 = new Float32Array(3), o1 = new Float32Array(3);
    var z0 = this.project(p0[0], p0[1], p0[2], o0, 0);
    var z1 = this.project(p1[0], p1[1], p1[2], o1, 0);
    var ax = o0[0], ay = o0[1], bx = o1[0], by = o1[1];
    var R = rad * ((o0[2] + o1[2]) * 0.5) * this.scale;
    if (R < 0.4) return;
    var ctx = this.ctx;

    this.push(Math.max(z0, z1) + (zbias || 0), function () {
      var dx = bx - ax, dy = by - ay;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / len, ny = dx / len;           // Querachse

      var g = ctx.createLinearGradient(ax - nx * R, ay - ny * R, ax + nx * R, ay + ny * R);
      g.addColorStop(0, '#7E756D');
      g.addColorStop(0.26, '#FCF8F4');
      g.addColorStop(0.58, '#D5CCC4');
      g.addColorStop(1, '#8A817A');

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';
      ctx.strokeStyle = g;
      ctx.lineWidth = R * 2;
      ctx.beginPath();
      ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      ctx.stroke();

      // Rändelringe – die feinen Rillen machen aus dem Zylinder ein Bauteil
      if (knurl !== false && R > 1.6) {
        ctx.strokeStyle = 'rgba(90,82,75,.42)';
        ctx.lineWidth = Math.max(0.6, R * 0.16);
        for (var i = 1; i <= 3; i++) {
          var t = i / 4;
          var cx = ax + dx * t, cy = ay + dy * t;
          ctx.beginPath();
          ctx.moveTo(cx - nx * R * 0.9, cy - ny * R * 0.9);
          ctx.lineTo(cx + nx * R * 0.9, cy + ny * R * 0.9);
          ctx.stroke();
        }
      }
      ctx.restore();
    });
  };

  Scene.prototype.drawSteth = function (mo) {
    var a = lerp(STETH_A[mo.i0], STETH_A[mo.i1], mo.f);
    if (a < 0.02) return;
    // Y-Stück: dort laufen die beiden Ohrbügel in den Schlauch zusammen
    this.chromeTube([YOKE[0], YOKE[1] + 0.11, YOKE[2]],
                    [YOKE[0], YOKE[1] - 0.10, YOKE[2]], 0.072, a, 0.015, true);
    // Ansatzstutzen zum Bruststück
    this.chromeTube(STEM[0], STEM[1], 0.058, a, 0.02, true);
  };

  // Balken (Logo-Motiv / Vermögensaufbau) als extrudierte 3D-Quader
  Scene.prototype.drawBars = function (mo) {
    var a = lerp(BAR_A[mo.i0], BAR_A[mo.i1], mo.f);
    if (a < 0.02) return;
    var B0 = BARS[mo.i0], B1 = BARS[mo.i1], ctx = this.ctx, self = this;
    var d = 0.10; // Tiefe

    for (var i = 0; i < 3; i++) {
      var x = lerp(B0[i][0], B1[i][0], mo.f);
      var y0 = lerp(B0[i][1], B1[i][1], mo.f);
      var hgt = lerp(B0[i][2], B1[i][2], mo.f);
      var bw = lerp(B0[i][3], B1[i][3], mo.f);
      if (hgt < 0.01) continue;
      // Wachstum leicht versetzt animieren
      var y1 = y0 + hgt;
      var c = [];
      var zs = 0;
      var pts = [
        [x - bw, y0, -d], [x + bw, y0, -d], [x + bw, y1, -d], [x - bw, y1, -d],
        [x - bw, y0, d], [x + bw, y0, d], [x + bw, y1, d], [x - bw, y1, d]
      ];
      var out = new Float32Array(3);
      for (var p = 0; p < 8; p++) {
        zs += this.project(pts[p][0], pts[p][1], pts[p][2], out, 0) / 8;
        c.push([out[0], out[1]]);
      }
      (function (c, zs, a) {
        self.push(zs, function () {
          ctx.globalAlpha = a;
          // Rückfläche → Seitenflächen → Frontfläche
          function quad(idx, fill) {
            ctx.beginPath();
            ctx.moveTo(c[idx[0]][0], c[idx[0]][1]);
            for (var k = 1; k < idx.length; k++) ctx.lineTo(c[idx[k]][0], c[idx[k]][1]);
            ctx.closePath();
            ctx.fillStyle = fill; ctx.fill();
          }
          quad([1, 2, 6, 5], '#5A0F1B');           // rechte Seite
          quad([0, 3, 7, 4], '#5A0F1B');           // linke Seite
          quad([3, 2, 6, 7], '#94263A');           // Deckel
          quad([0, 1, 2, 3], '#751524');           // Front
          // Frontglanz
          ctx.beginPath();
          ctx.moveTo(c[0][0], c[0][1]); ctx.lineTo(c[3][0], c[3][1]);
          ctx.strokeStyle = 'rgba(255,255,255,.22)';
          ctx.lineWidth = 2; ctx.stroke();
          ctx.globalAlpha = 1;
        });
      })(c, zs, a);
    }
  };

  Scene.prototype.drawParticles = function () {
    var ctx = this.ctx, self = this, out = new Float32Array(3);
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      var yy = p.y + Math.sin(this.time * 0.22 + p.ph) * 0.12;
      var z = this.project(p.x, yy, p.z, out, 0);
      (function (sx, sy, w, z, s) {
        self.push(z - 0.5, function () {
          var R = s * w * 1.5;
          ctx.beginPath(); ctx.arc(sx, sy, R, 0, TAU);
          ctx.fillStyle = 'rgba(126,162,196,' + (0.05 + 0.12 * clamp((z + 1.2) / 2.4, 0, 1)).toFixed(3) + ')';
          ctx.fill();
        });
      })(out[0], out[1], out[2], z, p.s);
    }
  };

  /* -- Frame -------------------------------------------------------------- */
  Scene.prototype.readScroll = function () {
    if (this.mode !== 'stage' || !this.stage) return;
    var r = this.stage.getBoundingClientRect();
    var total = r.height - global.innerHeight;
    if (total <= 0) { this.t = 0; return; }
    this.t = clamp(-r.top / total, 0, 1);
  };

  Scene.prototype.frame = function (dt) {
    this.time += dt;
    this.mx += (this.tmx - this.mx) * Math.min(1, dt * 3.2);
    this.my += (this.tmy - this.my) * Math.min(1, dt * 3.2);
    this.readScroll();
    this.tSmooth += (this.t - this.tSmooth) * Math.min(1, dt * 6.5);

    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    this.setCam();
    this.items.length = 0;

    var mo = this.morph();
    this.drawParticles();
    this.drawBars(mo);
    this.drawStrand(0, mo);
    this.drawStrand(1, mo);
    this.drawStrand(2, mo);
    this.drawSteth(mo);
    this.drawDisc(mo);
    this.drawBuds(mo);

    this.items.sort(function (a, b) { return a.z - b.z; });
    for (var i = 0; i < this.items.length; i++) this.items[i].fn();
  };

  /* --------------------------------------------------------------- Runner */
  var scenes = [];
  var last = 0, running = false;

  function tick(now) {
    if (!running) return;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    for (var i = scenes.length - 1; i >= 0; i--) {
      var s = scenes[i];
      if (s.dead) { scenes.splice(i, 1); continue; }
      if (s.visible) s.frame(dt);
    }
    global.requestAnimationFrame(tick);
  }

  function mount(canvas, opts) {
    if (!canvas || !canvas.getContext) return null;
    var s = new Scene(canvas, opts);
    scenes.push(s);
    if (reduceMotion) {
      // Ein einziges statisches Bild – keine Endlosschleife
      s.time = 1.2; s.t = s.tSmooth = 0; s.frame(0.016);
      return s;
    }
    if (!running) { running = true; global.requestAnimationFrame(tick); }
    return s;
  }

  function autoInit() {
    var nodes = document.querySelectorAll('[data-scene]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var cfg = {
        mode: el.getAttribute('data-scene'),
        target: parseFloat(el.getAttribute('data-target') || '0'),
        spin: el.hasAttribute('data-spin') ? parseFloat(el.getAttribute('data-spin')) : undefined,
        tilt: el.hasAttribute('data-tilt') ? parseFloat(el.getAttribute('data-tilt')) : undefined
      };
      if (el.hasAttribute('data-drift')) cfg.driftTo = parseFloat(el.getAttribute('data-drift'));
      if (cfg.mode === 'stage') cfg.stage = el.closest('.stage') || el.parentElement;
      mount(el, cfg);
    }
  }

  global.FMScene = { mount: mount, init: autoInit, reduceMotion: reduceMotion };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})(window);
