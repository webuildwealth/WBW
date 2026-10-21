// Visual Story: "Der Arzt mit 6.000 € netto" – 1080x960 (9:8), 30 fps
// Deterministischer Canvas-Renderer: render(T) zeichnet exakt das Bild zur Sekunde T.
const cv = document.getElementById('c');
const c = cv.getContext('2d');
const W = 1080, H = 960;
const FONT = '"Inter","Liberation Sans",Arial,sans-serif';

// ---------- Timing (Sekunden) – hier an die gesprochene Version anpassen ----------
const SCENES = [4.5, 4.5, 4.5, 5.5, 5.0];
const TRANS = 0.5;
const STARTS = SCENES.reduce((a, d, i) => (a.push(i ? a[i - 1] + SCENES[i - 1] : 0), a), []);
const TOTAL = SCENES.reduce((a, b) => a + b, 0);

// ---------- Palette (aus der Referenz: dunkel, warmes Amber als Lichtakzent) ----------
const AMBER = '#ff9a1f', AMBER2 = '#ffc15e', TEAL = '#3fe0c5', CORAL = '#ff6b4a', VIOLET = '#8b7bff';
const NAVY0 = '#070b17', NAVY1 = '#101831', NAVY2 = '#1b2748';

// ---------- Helfer ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eo = t => 1 - Math.pow(1 - t, 3);
const eio = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const back = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const R = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const fmt = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

function rr(x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
function lg(x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, col]) => g.addColorStop(o, col)); return g;
}
function rg(x, y, r0, r1, stops) {
  const g = c.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach(([o, col]) => g.addColorStop(o, col)); return g;
}
function ell(x, y, rx, ry, fill) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }
function text(s, x, y, size, col, align = 'left', weight = 800, alpha = 1) {
  c.save(); c.globalAlpha *= alpha; c.font = `${weight} ${size}px ${FONT}`; c.fillStyle = col; c.textAlign = align; c.textBaseline = 'alphabetic';
  c.fillText(s, x, y); c.restore();
}
function glow(col, blur) { c.shadowColor = col; c.shadowBlur = blur; }
function noGlow() { c.shadowBlur = 0; c.shadowColor = 'transparent'; }

// ---------- Mimik ----------
const MOODS = {
  neutral: { brow: 0, browIn: 0, smile: .1, open: 0, eye: 1 },
  proud: { brow: 3, browIn: -1, smile: .75, open: 0, eye: 1 },
  happy: { brow: 3, browIn: 0, smile: .95, open: .18, eye: 1 },
  wow: { brow: 11, browIn: 2, smile: .55, open: .5, eye: 1.2 },
  worry: { brow: 4, browIn: 8, smile: -.4, open: 0, eye: 1.05 },
  shock: { brow: 13, browIn: 5, smile: -.6, open: .5, eye: 1.3 },
  think: { brow: 3, browIn: 3, smile: -.12, open: 0, eye: .9 },
  know: { brow: 1, browIn: -1, smile: .4, open: 0, eye: .95 },
};
const mix = (a, b, t) => { const o = {}; for (const k in a) o[k] = lerp(a[k], b[k], t); return o; };
// keys: [[zeit, mood], ...] – weiche Übergänge zwischen den Stimmungen
function moodTrack(t, keys) {
  if (t <= keys[0][0]) return MOODS[keys[0][1]];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) return mix(MOODS[keys[i - 1][1]], MOODS[keys[i][1]], eio(seg(t, keys[i - 1][0], keys[i][0])));
  }
  return MOODS[keys[keys.length - 1][1]];
}

// Kopf: Mittelpunkt (0,0), Gesicht 96 x 120 Einheiten
function drawHead(m, look, t, tilt = 0) {
  const blink = (() => { const p = (t % 3.4); return p > 3.25 ? 1 - Math.sin((p - 3.25) / .15 * Math.PI) * .95 : 1; })();
  c.save(); c.rotate(tilt);
  // Hals
  c.fillStyle = '#c98f6c'; rr(-20, 40, 40, 46, 10); c.fill();
  // Ohren
  ell(-49, 4, 7, 11, '#d49b77'); ell(49, 4, 7, 11, '#ecb48c');
  // Gesicht
  const face = new Path2D();
  face.moveTo(-48, -8); face.bezierCurveTo(-48, 35, -28, 60, 0, 60); face.bezierCurveTo(28, 60, 48, 35, 48, -8);
  face.bezierCurveTo(48, -45, 25, -60, 0, -60); face.bezierCurveTo(-25, -60, -48, -45, -48, -8);
  c.fillStyle = lg(-48, 0, 48, 0, [[0, '#d39f7a'], [.55, '#e9b58f'], [1, '#f6c8a2']]); c.fill(face);
  c.save(); c.clip(face);
  c.fillStyle = lg(0, 14, 0, 62, [[0, 'rgba(50,34,34,0)'], [1, 'rgba(50,34,34,.38)']]); c.fillRect(-50, 14, 100, 50); // Bartschatten
  if (m.smile > .45) { ell(-30, 22, 11, 7, `rgba(255,120,110,${(m.smile - .45) * .35})`); ell(30, 22, 11, 7, `rgba(255,120,110,${(m.smile - .45) * .35})`); }
  c.restore();
  // Rim-Light (warmes Amber von rechts)
  c.save(); c.strokeStyle = 'rgba(255,170,70,.55)'; c.lineWidth = 3; c.beginPath(); c.moveTo(46, -34); c.bezierCurveTo(50, -5, 46, 30, 26, 52); c.stroke(); c.restore();
  // Haare
  c.fillStyle = lg(-50, -80, 50, -30, [[0, '#2a1b15'], [1, '#4a2f22']]);
  c.beginPath(); c.moveTo(-50, -6); c.bezierCurveTo(-56, -62, -22, -82, 8, -78); c.bezierCurveTo(44, -76, 58, -48, 50, -6);
  c.bezierCurveTo(46, -30, 36, -42, 18, -44); c.bezierCurveTo(-4, -48, -30, -40, -42, -24); c.bezierCurveTo(-46, -16, -48, -10, -50, -6); c.fill();
  c.strokeStyle = 'rgba(255,170,70,.5)'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(14, -77); c.bezierCurveTo(40, -74, 54, -52, 49, -22); c.stroke();
  // Augen
  const e = m.eye * blink;
  for (const sx of [-1, 1]) {
    c.save(); c.translate(sx * 19, -4);
    ell(0, 0, 9, Math.max(.8, 7 * e), '#fbfbff');
    c.save(); c.beginPath(); c.ellipse(0, 0, 9, Math.max(.8, 7 * e), 0, 0, Math.PI * 2); c.clip();
    ell(look.x * 3.2, look.y * 2.4, 4.6, 4.6, '#3b2a22'); ell(look.x * 3.2, look.y * 2.4, 2.2, 2.2, '#0d0907');
    ell(look.x * 3.2 + 1.6, look.y * 2.4 - 1.6, 1.3, 1.3, '#fff');
    c.restore(); c.restore();
  }
  // Brauen
  const yb = -27 - m.brow * .6, bi = m.browIn;
  c.strokeStyle = '#2a1b15'; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-8, yb - bi * .8); c.lineTo(-31, yb + bi * .3 - 1); c.stroke();
  c.beginPath(); c.moveTo(8, yb - bi * .8); c.lineTo(31, yb + bi * .3 - 1); c.stroke();
  // Brille (Wiedererkennungsmerkmal)
  c.strokeStyle = '#14141c'; c.lineWidth = 3.2;
  rr(-35, -17, 31, 25, 8); c.stroke(); rr(4, -17, 31, 25, 8); c.stroke();
  c.beginPath(); c.moveTo(-4, -7); c.lineTo(4, -7); c.moveTo(-35, -8); c.lineTo(-48, -7); c.moveTo(35, -8); c.lineTo(48, -7); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.07)'; rr(-35, -17, 31, 25, 8); c.fill(); rr(4, -17, 31, 25, 8); c.fill();
  // Nase
  c.strokeStyle = 'rgba(130,78,56,.55)'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(1, 0); c.quadraticCurveTo(-5, 14, -1, 17); c.quadraticCurveTo(3, 18, 6, 15); c.stroke();
  // Mund
  const cy = 36 - m.smile * 4, ctl = 36 + m.smile * 20;
  if (m.open > .05) {
    c.fillStyle = '#3a1616'; c.beginPath(); c.moveTo(-15, cy); c.quadraticCurveTo(0, ctl, 15, cy);
    c.quadraticCurveTo(0, ctl + m.open * 36, -15, cy); c.fill();
    if (m.smile > .2) { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(-12, cy + 1); c.quadraticCurveTo(0, ctl + 2, 12, cy + 1); c.quadraticCurveTo(0, ctl + 7, -12, cy + 1); c.fill(); }
  }
  c.strokeStyle = '#7d3b30'; c.lineWidth = 3; c.beginPath(); c.moveTo(-15, cy); c.quadraticCurveTo(0, ctl, 15, cy); c.stroke();
  c.restore();
}

// 2-Segment-Arm per IK
function ik(sx, sy, tx, ty, l1, l2, side) {
  const dx = tx - sx, dy = ty - sy; const d = Math.min(Math.hypot(dx, dy), l1 + l2 - .01);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)); const base = Math.atan2(dy, dx);
  const cands = [base + a, base - a].map(ang => [sx + Math.cos(ang) * l1, sy + Math.sin(ang) * l1]);
  const score = p => p[1] + side * p[0] * .35;
  const el = score(cands[0]) > score(cands[1]) ? cands[0] : cands[1];
  const k = d / Math.hypot(dx, dy) || 1; return { el, hand: [sx + dx * k, sy + dy * k] };
}

// Figur "Dr. Jonas": (0,0) = Mitte zwischen den Füßen
// o: {walk, ph, mood, look, tilt, arms:{l:[x,y], r:[x,y]}, phone:'l'|'r'|null, headOnly}
function drawDoc(o) {
  const walk = o.walk || 0, p = o.ph || 0;
  const bob = -Math.abs(Math.sin(p)) * 7 * walk, sway = Math.sin(p) * 4 * walk;
  if (!o.noShadow) ell(0, 4, 95, 16, 'rgba(0,0,0,.4)');
  // Beine
  for (const i of [-1, 1]) {
    const lift = Math.max(0, Math.sin(p + (i > 0 ? Math.PI : 0))) * 20 * walk;
    c.strokeStyle = '#16203a'; c.lineWidth = 40; c.lineCap = 'round';
    c.beginPath(); c.moveTo(i * 26 + sway, -135 + bob); c.lineTo(i * 26, -14 - lift); c.stroke();
    ell(i * 27, -8 - lift, 25, 11, '#f1f1f4'); ell(i * 27, -4 - lift, 25, 8, '#cfd3dc');
  }
  c.save(); c.translate(sway, bob);
  // Kittel-Unterteil / Scrubs
  c.fillStyle = lg(-72, 0, 72, 0, [[0, '#17788a'], [1, '#27a0b3']]);
  rr(-70, -285, 140, 160, 22); c.fill();
  // V-Ausschnitt & Hals
  c.fillStyle = '#c98f6c'; c.beginPath(); c.moveTo(-24, -287); c.lineTo(0, -240); c.lineTo(24, -287); c.closePath(); c.fill();
  // Kittel (offen)
  const coat = lg(-80, 0, 80, 0, [[0, '#d6dded'], [.6, '#f4f2ee'], [1, '#ffe9cf']]);
  c.fillStyle = coat;
  c.beginPath(); c.moveTo(-72, -280); c.quadraticCurveTo(-72, -288, -60, -288); c.lineTo(-24, -288); c.lineTo(-11, -236); c.lineTo(-10, -104); c.lineTo(-84, -104); c.quadraticCurveTo(-90, -190, -72, -280); c.fill();
  c.beginPath(); c.moveTo(72, -280); c.quadraticCurveTo(72, -288, 60, -288); c.lineTo(24, -288); c.lineTo(11, -236); c.lineTo(10, -104); c.lineTo(84, -104); c.quadraticCurveTo(90, -190, 72, -280); c.fill();
  c.strokeStyle = 'rgba(80,95,130,.35)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-24, -288); c.lineTo(-11, -236); c.moveTo(24, -288); c.lineTo(11, -236); c.stroke();
  c.fillStyle = 'rgba(255,160,60,.18)'; rr(40, -280, 40, 170, 10); c.fill(); // Amber-Rim rechts
  // Stethoskop + Namensschild
  c.strokeStyle = '#1b1d28'; c.lineWidth = 5; c.beginPath(); c.moveTo(-26, -290); c.bezierCurveTo(-30, -250, -10, -228, 0, -226); c.bezierCurveTo(10, -228, 30, -250, 26, -290); c.stroke();
  c.fillStyle = AMBER; c.beginPath(); c.arc(0, -222, 8, 0, 7); c.fill(); c.strokeStyle = '#1b1d28'; c.lineWidth = 3; c.stroke();
  c.fillStyle = AMBER; rr(36, -240, 28, 12, 3); c.fill();
  c.restore();
  // Arme
  const hands = [];
  for (const i of [-1, 1]) {
    const key = i < 0 ? 'l' : 'r';
    let tgt = o.arms && o.arms[key];
    if (!tgt) tgt = [i * 88, -112 - Math.sin(p + (i > 0 ? Math.PI : 0)) * 15 * walk];
    const sx = i * 66 + sway, sy = -272 + bob;
    let el, hand;
    if (o.elbow && o.elbow[key]) { el = [o.elbow[key][0] + sway, o.elbow[key][1] + bob]; hand = [tgt[0] + sway, tgt[1] + bob]; }
    else ({ el, hand } = ik(sx, sy, tgt[0] + sway, tgt[1] + bob, 90, 84, i));
    c.strokeStyle = i > 0 ? '#f0ebe6' : '#d9e0ee'; c.lineWidth = 34; c.lineCap = 'round';
    c.beginPath(); c.moveTo(sx, sy); c.lineTo(el[0], el[1]); c.lineTo(hand[0], hand[1]); c.stroke();
    c.strokeStyle = 'rgba(60,75,110,.25)'; c.lineWidth = 3; c.beginPath(); c.moveTo(sx, sy); c.lineTo(el[0], el[1]); c.stroke();
    ell(hand[0], hand[1], 16, 16, '#e3ab86');
    hands.push({ key, hand, el });
    if (o.phone === key) {
      c.save(); c.translate(hand[0], hand[1] - 6);
      const ang = Math.atan2(hand[1] - el[1], hand[0] - el[0]) + Math.PI / 2; c.rotate(ang * .5);
      glow('rgba(255,170,60,.7)', 24); c.fillStyle = '#0b0d14'; rr(-20, -52, 40, 68, 8); c.fill(); noGlow();
      c.fillStyle = lg(0, -48, 0, 12, [[0, '#ffcf80'], [1, '#ff8a1f']]); rr(-16, -48, 32, 58, 5); c.fill();
      ell(-1, 8, 16, 14, '#e3ab86'); c.restore();
    }
  }
  // Kopf
  c.save(); c.translate(sway, -358 + bob); c.scale(.95, .95);
  drawHead(o.mood || MOODS.neutral, o.look || { x: 0, y: 0 }, o.t || 0, o.tilt || 0);
  c.restore();
  return hands;
}

// ---------- UI-Karten (schweben wie in der Referenz) ----------
function card(x, y, w, h, k, accent, fn) {
  if (k <= 0) return;
  c.save(); c.translate(x + w / 2, y + h / 2); const s = back(clamp(k)); c.scale(s, s); c.globalAlpha = clamp(k * 1.6);
  c.translate(-w / 2, -h / 2);
  glow(accent, 36); c.fillStyle = 'rgba(8,12,26,.9)'; rr(0, 0, w, h, 26); c.fill(); noGlow();
  c.strokeStyle = accent; c.lineWidth = 3; rr(0, 0, w, h, 26); c.stroke();
  c.fillStyle = lg(0, 0, w, h, [[0, 'rgba(255,255,255,.07)'], [1, 'rgba(255,255,255,0)']]); rr(0, 0, w, h, 26); c.fill();
  fn(w, h); c.restore();
}
function coin(x, y, r, a = 1, rot = 0) {
  c.save(); c.translate(x, y); c.globalAlpha *= a; c.scale(Math.abs(Math.cos(rot)) * .8 + .2, 1);
  glow('rgba(255,170,40,.8)', 14); c.fillStyle = lg(0, -r, 0, r, [[0, '#ffe29a'], [1, '#e8870c']]); c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); noGlow();
  c.strokeStyle = '#b8620a'; c.lineWidth = r * .14; c.beginPath(); c.arc(0, 0, r * .68, 0, 7); c.stroke(); c.restore();
}
function footnote(a) { text('Beispielrechnung · keine Anlageberatung', W / 2, 930, 21, '#cfd6ea', 'center', 600, .62 * a); }

// ======================= SZENE 1: Krankenhaus =======================
function sceneHospital(t) {
  const VP = { x: 540, y: 400 };
  const P = (x, y, s) => [VP.x + (x - VP.x) * s, VP.y + (y - VP.y) * s];
  const poly = (pts, fill) => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fillStyle = fill; c.fill(); };
  c.save(); const z = 1 + .06 * seg(t, 0, 4.5); c.translate(540, 480); c.scale(z, z); c.translate(-540, -480);
  const S0 = .25;
  poly([P(0, 0, 1), P(W, 0, 1), P(W, 0, S0), P(0, 0, S0)], lg(0, 0, 0, 400, [[0, '#0a1020'], [1, '#16233f']]));
  poly([P(0, H, 1), P(W, H, 1), P(W, H, S0), P(0, H, S0)], lg(0, 960, 0, 480, [[0, '#0c1224'], [1, '#2a3a5c']]));
  poly([P(0, 0, 1), P(0, 0, S0), P(0, H, S0), P(0, H, 1)], lg(0, 0, 400, 0, [[0, '#14335a'], [1, '#2a5a86']]));
  poly([P(W, 0, 1), P(W, 0, S0), P(W, H, S0), P(W, H, 1)], lg(1080, 0, 680, 0, [[0, '#1a3b5e'], [1, '#2f6a8a']]));
  const b0 = P(0, 0, S0), b1 = P(W, H, S0);
  c.fillStyle = lg(0, b0[1], 0, b1[1], [[0, '#3b6f95'], [1, '#2d5a7a']]); c.fillRect(b0[0], b0[1], b1[0] - b0[0], b1[1] - b0[1]);
  glow(TEAL, 30); c.fillStyle = '#35e0c5'; // medizinisches Kreuz
  c.fillRect(VP.x - 8, VP.y - 80, 16, 52); c.fillRect(VP.x - 26, VP.y - 62, 52, 16); noGlow();
  // Fortschritt der Kamerafahrt
  const a = 1.7, b = 2.4, v = .13;
  const pos = t < a ? v * t : t < b ? v * (a + (b - a) * (1 - Math.pow(1 - (t - a) / (b - a), 4)) / 4) : v * (a + (b - a) / 4);
  const items = [];
  const N = 8;
  for (let i = 0; i < N; i++) { const ph = ((i / N + pos) % 1 + 1) % 1; items.push({ i, ph }); }
  items.sort((p, q) => p.ph - q.ph);
  for (const { i, ph } of items) {
    const s = S0 * Math.pow(6.4, ph), s2 = s * 1.16, fade = clamp(ph * 6) * clamp((1 - ph) * 8);
    c.globalAlpha = fade;
    // Deckenleuchte
    const cl = [P(330, 0, s), P(750, 0, s), P(750, 0, s2), P(330, 0, s2)];
    glow('rgba(255,215,150,.9)', 24); poly(cl, '#fff1d6'); noGlow();
    poly([P(380, H, s), P(700, H, s), P(700, H, s2), P(380, H, s2)], 'rgba(255,205,130,.14)');
    // Türen
    for (const side of [0, 1]) {
      if ((i + side) % 2) continue;
      const X = side ? W : 0, d0 = P(X, 230, s), d1 = P(X, 230, s2), d2 = P(X, H, s2), d3 = P(X, H, s);
      poly([d0, d1, d2, d3], lg(d0[0], 0, d1[0], 0, [[0, '#0d1a30'], [1, '#183154']]));
      const w0 = P(X, 330, lerp(s, s2, .25)), w1 = P(X, 330, lerp(s, s2, .75)), w2 = P(X, 520, lerp(s, s2, .75)), w3 = P(X, 520, lerp(s, s2, .25));
      glow('rgba(255,170,60,.7)', 18); poly([w0, w1, w2, w3], lg(0, w0[1], 0, w2[1], [[0, '#ffd08a'], [1, '#ff9a1f']])); noGlow();
    }
    c.globalAlpha = 1;
  }
  // Figur
  const sc = lerp(.98, 1.14, eo(seg(t, 0, 2.2)));
  const walking = 1 - eo(seg(t, 1.8, 2.4));
  const phase = t * 8.5;
  const showK = seg(t, 2.35, 3.0), up = eio(seg(t, 2.1, 2.8));
  const mood = moodTrack(t, [[0, 'neutral'], [2.4, 'neutral'], [3.0, 'wow'], [3.8, 'proud']]);
  c.save(); c.translate(400, 925); c.scale(sc, sc);
  const hands = drawDoc({ walk: walking, ph: phase, mood, look: { x: lerp(0, 1, up), y: lerp(0, -.2, up) }, t, tilt: up * .05, phone: up > 0.05 ? 'r' : null, arms: { r: [lerp(88, 165, up), lerp(-112, -300, up)] } });
  c.restore(); c.restore();
  // UI-Karte "Gehalt"
  for (let k = 0; k < 14; k++) {
    const u = (t - 3.0 - k * .04) / 1.6; if (u < 0 || u > 1) continue;
    const ang = -Math.PI * (.2 + R(k) * .6), sp = 260 + R(k + 9) * 220;
    coin(860 + Math.cos(ang) * sp * u * .7, 400 + Math.sin(ang) * sp * u * .5 + 560 * u * u, 13 + R(k + 3) * 6, 1 - u, u * 12 + k);
  }
  const cnt = eo(seg(t, 2.9, 3.9));
  card(690, 200, 340, 210, showK, AMBER, (w, h) => {
    text('Gehalt eingegangen', 28, 52, 26, '#cfd6ea', 'left', 600);
    c.fillStyle = TEAL; c.beginPath(); c.arc(w - 40, 44, 14, 0, 7); c.fill(); c.strokeStyle = '#06241f'; c.lineWidth = 4; c.beginPath(); c.moveTo(w - 47, 44); c.lineTo(w - 41, 50); c.lineTo(w - 32, 38); c.stroke();
    text('+' + fmt(6000 * cnt) + ' €', 28, 128, 66, '#fff', 'left', 800);
    text('netto pro Monat', 28, 172, 26, AMBER2, 'left', 600);
  });
}

// ======================= SZENE 2: Sportwagen =======================
function sceneCar(t) {
  c.save(); const z = lerp(1.06, 1.0, eio(seg(t, 0, 4.5))); c.translate(540, 560); c.scale(z, z); c.translate(-540 + lerp(30, -30, seg(t, 0, 4.5)), -560);
  c.fillStyle = lg(0, 0, 0, 620, [[0, '#120b2a'], [.55, '#4a2250'], [.85, '#ff7a2a'], [1, '#ffb347']]); c.fillRect(-100, 0, W + 200, 640);
  glow('rgba(255,170,60,.8)', 80); ell(860, 590, 120, 120, 'rgba(255,200,110,.9)'); noGlow(); // tiefstehende Sonne
  const scroll = (k) => t * k;
  const skyline = (k, base, hMin, hMax, col, seed, lit) => {
    const total = 1500, off = scroll(k) % total;
    for (let i = 0; i < 22; i++) {
      const bw = 60 + R(i + seed) * 70, bh = hMin + R(i * 3 + seed) * (hMax - hMin);
      let x = (i * 78 - off) % total; if (x < -150) x += total;
      c.fillStyle = col; c.fillRect(x, base - bh, bw, bh + 4);
      if (lit) for (let r = 0; r < bh / 28; r++) for (let q = 0; q < bw / 22; q++) if (R(i * 31 + r * 7 + q + seed) > .55) { c.fillStyle = 'rgba(255,190,100,.75)'; c.fillRect(x + 8 + q * 22, base - bh + 10 + r * 28, 9, 12); }
    }
  };
  skyline(40, 640, 100, 240, '#2a1740', 1, false);
  skyline(110, 660, 80, 200, '#150d26', 50, true);
  c.fillStyle = lg(0, 640, 0, 960, [[0, '#1b1626'], [1, '#07060d']]); c.fillRect(-100, 640, W + 200, 330); // Straße
  c.fillStyle = 'rgba(255,170,60,.55)'; c.fillRect(-100, 650, W + 200, 4);
  const dash = 140, off = (t * 900) % dash;
  c.fillStyle = 'rgba(255,230,190,.7)'; for (let x = -dash; x < W + dash; x += dash) { rr(x - off, 835, 80, 10, 4); c.fill(); }
  // Laternen
  const lo = (t * 430) % 520;
  for (let x = -60; x < W + 520; x += 520) { const px = x - lo; c.fillStyle = '#0b0914'; c.fillRect(px, 380, 8, 270); glow('#ffc15e', 40); ell(px + 4, 380, 18, 10, '#ffe6b0'); noGlow(); }
  // Auto fährt ein
  const cx = lerp(-330, 540, eo(seg(t, 0, 1.3))) + Math.sin(t * 2) * 2, cyy = 770 + Math.sin(t * 9) * 1.2;
  c.save(); c.translate(cx, cyy);
  ell(0, 4, 360, 20, 'rgba(0,0,0,.55)'); ell(0, 6, 330, 30, 'rgba(255,150,40,.25)');
  // Scheinwerferkegel
  const beam = rg(330, -80, 5, 520, [[0, 'rgba(255,240,200,.65)'], [1, 'rgba(255,200,120,0)']]);
  c.fillStyle = beam; c.beginPath(); c.moveTo(325, -92); c.lineTo(900, -230); c.lineTo(900, 40); c.lineTo(325, -62); c.fill();
  const body = new Path2D();
  body.moveTo(-300, -40); body.lineTo(-304, -96); body.bezierCurveTo(-296, -122, -250, -132, -190, -136);
  body.bezierCurveTo(-130, -142, -108, -184, -40, -188); body.lineTo(70, -188); body.bezierCurveTo(130, -186, 175, -150, 225, -130);
  body.bezierCurveTo(280, -122, 322, -104, 328, -72); body.lineTo(328, -40); body.closePath();
  c.fillStyle = lg(0, -210, 0, -30, [[0, '#ffc15e'], [.45, '#ff8a1f'], [1, '#b8420a']]); c.fill(body);
  c.save(); c.clip(body); c.fillStyle = lg(-300, 0, 330, 0, [[0, 'rgba(0,0,0,.28)'], [.5, 'rgba(255,255,255,0)'], [1, 'rgba(255,230,160,.3)']]); c.fillRect(-310, -220, 650, 200);
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 4; c.beginPath(); c.moveTo(-290, -100); c.bezierCurveTo(-100, -118, 120, -110, 320, -92); c.stroke(); c.restore();
  // Fenster mit Fahrer
  const win = new Path2D(); win.moveTo(-112, -138); win.bezierCurveTo(-96, -168, -78, -180, -44, -182); win.lineTo(62, -182); win.bezierCurveTo(110, -180, 145, -156, 168, -138); win.closePath();
  c.fillStyle = lg(-100, -200, 100, -130, [[0, '#18233f'], [1, '#4a3558']]); c.fill(win);
  c.save(); c.clip(win);
  c.fillStyle = '#e9edf5'; rr(-14, -122, 90, 70, 16); c.fill(); // Kittelschulter
  c.save(); c.translate(30, -146); c.scale(.33, .33); drawHead(moodTrack(t, [[0, 'neutral'], [1.4, 'proud'], [3, 'happy']]), { x: 1, y: 0 }, t); c.restore();
  c.strokeStyle = '#0b0b12'; c.lineWidth = 7; c.beginPath(); c.moveTo(62, -116); c.lineTo(88, -146); c.stroke(); // Lenkrad
  c.restore();
  c.fillStyle = 'rgba(255,255,255,.14)'; c.beginPath(); c.moveTo(-90, -176); c.lineTo(-40, -180); c.lineTo(-90, -140); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 3; c.beginPath(); c.moveTo(-8, -182); c.lineTo(-8, -50); c.stroke();
  c.fillStyle = '#7a2a08'; rr(22, -128, 40, 8, 4); c.fill();
  glow('#fff0cc', 28); ell(318, -82, 14, 8, '#fffbe8'); noGlow(); glow('#ff2a2a', 22); ell(-300, -90, 5, 14, '#ff4040'); noGlow();
  for (const wx of [-185, 200]) { // Räder
    c.save(); c.translate(wx, -58); c.fillStyle = '#05060a'; c.beginPath(); c.arc(0, 0, 60, 0, 7); c.fill();
    c.rotate(t * 16); c.fillStyle = '#c9ced9'; c.beginPath(); c.arc(0, 0, 40, 0, 7); c.fill();
    c.strokeStyle = '#2b2f3d'; c.lineWidth = 7; for (let k = 0; k < 5; k++) { c.rotate(Math.PI * 2 / 5); c.beginPath(); c.moveTo(0, 0); c.lineTo(38, 0); c.stroke(); }
    c.fillStyle = AMBER; c.beginPath(); c.arc(0, 0, 8, 0, 7); c.fill(); c.restore();
  }
  c.restore();
  // Speedlines
  c.strokeStyle = 'rgba(255,230,190,.35)'; c.lineWidth = 3;
  for (let k = 0; k < 9; k++) { const sy = 690 + k * 18, sx = ((t * 1400 + k * 311) % 1500) - 200; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx - 120 - R(k) * 160, sy); c.stroke(); }
  c.restore();
  card(560, 150, 440, 150, seg(t, 2.1, 2.7), AMBER, (w, h) => {
    text('Leasing Sportwagen', 28, 52, 26, '#cfd6ea', 'left', 600);
    text('900 €', 28, 120, 64, '#fff', 'left', 800); text('/ Monat', 205, 120, 30, AMBER2, 'left', 600);
  });
}

// ======================= SZENE 3: Wohnung =======================
function sceneApartment(t) {
  c.save(); const z = lerp(1.05, 1.0, seg(t, 0, 4.5)); c.translate(540, 520); c.scale(z, z); c.translate(-540 + lerp(40, -40, seg(t, 0, 4.5)), -520);
  c.fillStyle = lg(0, 0, 0, 700, [[0, '#101831'], [1, '#243764']]); c.fillRect(-100, 0, W + 200, 700);
  c.fillStyle = lg(0, 690, 0, 960, [[0, '#3a2a22'], [1, '#150f0d']]); c.fillRect(-100, 690, W + 200, 280);
  for (let k = 0; k < 7; k++) { c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-100, 700 + k * k * 6); c.lineTo(W + 100, 700 + k * k * 6); c.stroke(); }
  // Fenster
  c.save(); rr(560, 100, 470, 500, 12); c.clip();
  c.fillStyle = lg(0, 100, 0, 600, [[0, '#0b1030'], [.6, '#4a2860'], [1, '#ff8a3d']]); c.fillRect(560, 100, 470, 500);
  glow('rgba(255,230,180,.9)', 40); ell(930, 190, 34, 34, '#fff3d6'); noGlow();
  for (let i = 0; i < 12; i++) { const bw = 50 + R(i + 5) * 50, bh = 150 + R(i) * 230, x = 560 + i * 42; c.fillStyle = i % 2 ? '#1a1030' : '#120a24'; c.fillRect(x, 600 - bh, bw, bh);
    for (let r = 0; r < bh / 26; r++) for (let q = 0; q < bw / 18; q++) if (R(i * 17 + r * 5 + q) > .5) { c.fillStyle = 'rgba(255,200,120,.8)'; c.fillRect(x + 7 + q * 18, 600 - bh + 10 + r * 26, 8, 11); } }
  c.restore();
  c.strokeStyle = '#05070f'; c.lineWidth = 12; rr(560, 100, 470, 500, 12); c.stroke(); c.lineWidth = 8; c.beginPath(); c.moveTo(795, 100); c.lineTo(795, 600); c.moveTo(560, 350); c.lineTo(1030, 350); c.stroke();
  c.fillStyle = lg(560, 600, 400, 900, [[0, 'rgba(255,170,80,.22)'], [1, 'rgba(255,170,80,0)']]); c.beginPath(); c.moveTo(560, 700); c.lineTo(1030, 700); c.lineTo(760, 960); c.lineTo(330, 960); c.fill();
  // Bilderrahmen
  for (const [x, y, w, h, col] of [[90, 150, 130, 170, AMBER], [250, 190, 90, 120, TEAL]]) { c.fillStyle = '#05070f'; rr(x - 8, y - 8, w + 16, h + 16, 6); c.fill(); c.fillStyle = lg(x, y, x + w, y + h, [[0, col], [1, '#2a1550']]); c.fillRect(x, y, w, h); ell(x + w * .65, y + h * .35, w * .18, w * .18, 'rgba(255,255,255,.55)'); }
  // Sofa
  c.fillStyle = '#0c1020'; rr(30, 480, 440, 220, 36); c.fill();
  c.fillStyle = lg(0, 520, 0, 700, [[0, '#2a3a63'], [1, '#18223f']]); rr(50, 560, 400, 130, 30); c.fill(); rr(50, 500, 400, 100, 34); c.fill();
  c.fillStyle = AMBER; rr(80, 540, 90, 80, 22); c.fill(); c.fillStyle = TEAL; rr(340, 545, 80, 75, 22); c.fill();
  c.fillStyle = '#0a0d18'; rr(70, 690, 24, 24, 4); c.fill(); rr(410, 690, 24, 24, 4); c.fill();
  ell(300, 840, 420, 60, 'rgba(255,154,31,.18)'); // Teppich
  c.fillStyle = '#10162b'; rr(250, 760, 200, 18, 6); c.fill(); c.fillRect(268, 776, 10, 40); c.fillRect(422, 776, 10, 40); // Couchtisch
  // Stehlampe geht an
  const lamp = eio(seg(t, 1.0, 1.8));
  c.fillStyle = '#0a0d18'; c.fillRect(516, 340, 8, 370); ell(520, 712, 36, 8, '#0a0d18');
  c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = rg(520, 340, 10, 520, [[0, `rgba(255,190,100,${.5 * lamp})`], [1, 'rgba(255,150,40,0)']]); c.fillRect(-100, -100, 1300, 1100); c.restore();
  glow('rgba(255,190,100,.9)', 50 * lamp); c.fillStyle = lamp > .05 ? lg(0, 290, 0, 350, [[0, '#ffe3a8'], [1, '#ffb347']]) : '#2a2f45';
  c.beginPath(); c.moveTo(490, 350); c.lineTo(550, 350); c.lineTo(536, 290); c.lineTo(504, 290); c.closePath(); c.fill(); noGlow();
  // Pflanze
  c.fillStyle = '#e9e1d6'; rr(960, 640, 70, 70, 10); c.fill();
  c.strokeStyle = '#1f8f6a'; c.lineWidth = 12; c.lineCap = 'round'; for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(995, 650); c.quadraticCurveTo(995 + (k - 2.5) * 40, 560, 995 + (k - 2.5) * 70, 500 + Math.abs(k - 2.5) * 20 + Math.sin(t + k) * 4); c.stroke(); }
  // Figur läuft herein
  const wx = lerp(-80, 470, eo(seg(t, 0, 2.2))), walk = 1 - eo(seg(t, 1.7, 2.3));
  const open = eio(seg(t, 2.3, 3.0));
  const lookX = lerp(.2, 1, eio(seg(t, 2.2, 3.0))) * (1 - seg(t, 3.6, 4.2)) + seg(t, 3.6, 4.2) * 0;
  c.save(); c.translate(wx, 905); c.scale(.9, .9);
  drawDoc({ walk, ph: t * 8.5, mood: moodTrack(t, [[0, 'neutral'], [2.3, 'neutral'], [3.0, 'wow'], [3.8, 'proud']]), look: { x: lookX, y: -.1 }, t, tilt: open * .05,
    arms: open > .02 ? { l: [lerp(-88, -170, open), lerp(-112, -250, open)], r: [lerp(88, 170, open), lerp(-112, -250, open)] } : null });
  c.restore();
  c.restore();
  card(650, 750, 400, 150, seg(t, 3.0, 3.6), AMBER, (w, h) => {
    text('Große Wohnung · Miete', 28, 52, 24, '#cfd6ea', 'left', 600);
    text('2.000 €', 28, 120, 64, '#fff', 'left', 800); text('/ Monat', 270, 120, 28, AMBER2, 'left', 600);
  });
}

// ======================= SZENE 4: Schreibtisch / Finanzen =======================
function iconCar(x, y, col) { c.fillStyle = col; rr(x - 18, y - 6, 36, 12, 4); c.fill(); rr(x - 10, y - 14, 20, 10, 4); c.fill(); ell(x - 10, y + 7, 5, 5, '#0b0f1d'); ell(x + 10, y + 7, 5, 5, '#0b0f1d'); }
function iconHouse(x, y, col) { c.fillStyle = col; c.beginPath(); c.moveTo(x - 20, y); c.lineTo(x, y - 18); c.lineTo(x + 20, y); c.lineTo(x + 14, y); c.lineTo(x + 14, y + 14); c.lineTo(x - 14, y + 14); c.lineTo(x - 14, y); c.closePath(); c.fill(); }
function iconGlass(x, y, col) { c.fillStyle = col; c.beginPath(); c.moveTo(x - 16, y - 14); c.lineTo(x + 16, y - 14); c.lineTo(x, y + 4); c.closePath(); c.fill(); c.fillRect(x - 2, y + 3, 4, 12); c.fillRect(x - 10, y + 14, 20, 3); }
function sceneDesk(t) {
  c.save(); const z = lerp(1.0, 1.05, eio(seg(t, 0, 5.5))); c.translate(300, 480); c.scale(z, z); c.translate(-300, -480);
  c.fillStyle = lg(0, 0, 0, 700, [[0, '#0b1124'], [1, '#1d2a4d']]); c.fillRect(-60, -60, W + 120, 780);
  c.fillStyle = lg(0, 700, 0, 960, [[0, '#2a1d1c'], [1, '#0d0809']]); c.fillRect(-60, 700, W + 120, 400);
  c.save(); rr(40, 90, 230, 280, 10); c.clip(); c.fillStyle = lg(0, 90, 0, 370, [[0, '#0b1030'], [.7, '#4a2860'], [1, '#ff8a3d']]); c.fillRect(40, 90, 230, 280); for (let i = 0; i < 6; i++) { c.fillStyle = '#120a24'; c.fillRect(50 + i * 38, 370 - 60 - R(i) * 120, 34, 200); } c.restore();
  c.strokeStyle = '#05070f'; c.lineWidth = 10; rr(40, 90, 230, 280, 10); c.stroke();
  c.fillStyle = '#0a0f1f'; rr(150, 360, 300, 380, 60); c.fill(); // Stuhllehne
  // Figur sitzt
  const mood = moodTrack(t, [[0, 'neutral'], [1.5, 'neutral'], [3.0, 'worry'], [4.0, 'worry'], [4.5, 'shock']]);
  c.save(); c.translate(300, 800); c.scale(1.0, 1.0);
  drawDoc({ mood, look: { x: lerp(.3, 1, eio(seg(t, .3, 1.2))), y: .1 }, t, noShadow: true, tilt: seg(t, 3, 4.5) * -.06,
    arms: { l: [-60, -150], r: [60, -150] } });
  c.restore();
  // Tisch + Laptop (Rückseite)
  c.fillStyle = lg(0, 650, 0, 960, [[0, '#4a3326'], [1, '#1a110d']]); c.fillRect(-60, 650, 700, 400);
  c.fillStyle = 'rgba(255,170,80,.25)'; c.fillRect(-60, 650, 700, 4);
  c.fillStyle = lg(0, 560, 0, 650, [[0, '#2a3040'], [1, '#14171f']]); rr(130, 560, 340, 96, 10); c.fill();
  glow('rgba(255,170,60,.9)', 40); ell(300, 608, 16, 16, 'rgba(255,200,120,.9)'); noGlow();
  c.fillStyle = '#1b1f2b'; rr(100, 650, 400, 14, 6); c.fill();
  // Kaffeetasse + Dampf
  c.fillStyle = '#f1ece4'; rr(540, 610, 54, 42, 8); c.fill(); c.strokeStyle = '#f1ece4'; c.lineWidth = 7; c.beginPath(); c.arc(598, 630, 12, -1.5, 1.5); c.stroke();
  c.restore();
  // Holo-Panel mit Budget
  const k = seg(t, .3, 1.0);
  card(470, 120, 570, 500, k, AMBER, (w, h) => {
    text('Monatsbudget', 30, 56, 26, '#cfd6ea', 'left', 600);
    text('6.000 €', 30, 138, 72, '#fff', 'left', 800); text('netto', 326, 138, 30, AMBER2, 'left', 600);
    const bx = 30, by = 230, bw = 510, bh = 76, tot = 6000;
    c.strokeStyle = 'rgba(255,193,94,.5)'; c.lineWidth = 3; rr(bx, by, bw, bh, 14); c.stroke();
    const items = [['Auto', 900, AMBER, iconCar, 1.0, 2.0], ['Wohnung', 2000, CORAL, iconHouse, 1.9, 2.9], ['Lebensstil', 2900, VIOLET, iconGlass, 2.8, 3.9]];
    let x = bx;
    items.forEach(([name, v, col, ico, a, b]) => {
      const wd = v / tot * bw, kk = seg(t, a, b), e = back(kk);
      if (kk > 0) {
        c.save(); c.globalAlpha = clamp(kk * 2); c.translate(0, (1 - e) * -90);
        glow(col, 22); c.fillStyle = col; rr(x + 2, by + 4, wd - 4, bh - 8, 10); c.fill(); noGlow(); c.restore();
        c.save(); c.globalAlpha = seg(kk, .6, 1); ico(x + wd / 2, by + bh + 52, col); text(name, x + wd / 2, by + bh + 108, 24, '#e6ebf8', 'center', 700); text(fmt(v) + ' €', x + wd / 2, by + bh + 142, 30, '#fff', 'center', 800); c.restore();
      }
      x += wd;
    });
    // winziger Rest
    const kk = seg(t, 3.9, 4.6);
    if (kk > 0) {
      const wd = 200 / tot * bw, pulse = .6 + .4 * Math.sin(t * 7);
      glow(TEAL, 28 * pulse); c.fillStyle = TEAL; c.globalAlpha = kk; rr(x + 1, by + 4, wd - 2, bh - 8, 6); c.fill(); noGlow();
      c.strokeStyle = TEAL; c.lineWidth = 3; c.beginPath(); c.moveTo(x + wd / 2, by - 6); c.lineTo(x + wd / 2, by - 36); c.stroke();
      text('übrig: 200 €', bx + bw, by - 48, 28, TEAL, 'right', 800); c.globalAlpha = 1;
    }
  });
  footnote(seg(t, .6, 1.2));
}

// ======================= SZENE 5: Erkenntnis =======================
function sceneRealize(t) {
  c.fillStyle = lg(0, 0, 0, H, [[0, '#0a0f20'], [1, '#1a1030']]); c.fillRect(0, 0, W, H);
  for (let i = 0; i < 16; i++) { const x = R(i) * W, y = R(i + 20) * H, r = 30 + R(i + 40) * 90; c.fillStyle = rg(x, y, 0, r, [[0, 'rgba(255,160,50,.16)'], [1, 'rgba(255,160,50,0)']]); c.fillRect(x - r, y - r, r * 2, r * 2); }
  c.save(); const z = lerp(1, 1.07, eio(seg(t, 0, 5))); c.translate(400, 520); c.scale(z, z); c.translate(-400, -520);
  const mood = moodTrack(t, [[0, 'shock'], [1.0, 'worry'], [1.6, 'think'], [3.2, 'think'], [4.0, 'know'], [5, 'know']]);
  const lookT = t < 1.0 ? { x: -.9, y: .9 } : t < 3.6 ? { x: lerp(-.9, .8, eio(seg(t, 1.0, 1.8))), y: lerp(.9, -.7, eio(seg(t, 1.0, 1.8))) } : { x: lerp(.8, 0, eio(seg(t, 3.6, 4.2))), y: lerp(-.7, 0, eio(seg(t, 3.6, 4.2))) };
  c.save(); c.translate(400, 1450); c.scale(2.7, 2.7);
  const chin = eio(seg(t, 1.4, 2.2)) * (1 - eio(seg(t, 3.6, 4.2)));
  drawDoc({ mood, look: lookT, t, noShadow: true, tilt: lerp(0, .07, chin) + Math.sin(t * 1.3) * .01,
    arms: { r: [lerp(88, 34, chin), lerp(-112, -306, chin)] }, elbow: chin > .02 ? { r: [lerp(110, 96, chin), lerp(-60, -168, chin)] } : null });
  c.restore(); c.restore();
  // Gedankenblase: leeres Sparglas
  const kb = seg(t, 2.6, 3.4);
  if (kb > 0) {
    c.save(); c.globalAlpha = clamp(kb * 2);
    [[640, 560, 10], [680, 500, 16], [735, 430, 24]].forEach(([x, y, r], i) => { c.globalAlpha = clamp((kb - i * .12) * 3); ell(x, y, r, r, 'rgba(235,240,255,.9)'); });
    c.globalAlpha = clamp(kb * 2);
    const s = back(kb); c.translate(840, 270); c.scale(s, s);
    c.fillStyle = 'rgba(235,240,255,.94)'; for (const [x, y, r] of [[-130, 20, 80], [-60, -50, 100], [40, -60, 100], [120, -10, 90], [130, 70, 70], [30, 90, 90], [-70, 85, 80]]) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
    // Glas
    c.strokeStyle = '#4a5a8a'; c.lineWidth = 6; rr(-45, -80, 90, 150, 22); c.stroke(); rr(-50, -100, 100, 24, 8); c.stroke();
    c.fillStyle = 'rgba(120,160,230,.15)'; rr(-45, -80, 90, 150, 22); c.fill();
    coin(-12, 52, 18, 1, 0); coin(14, 48, 18, 1, 0); coin(0, 30, 18, 1, 0);
    c.save(); c.globalAlpha *= .4; iconCar(-135, 40, '#4a5a8a'); iconHouse(135, 40, '#4a5a8a'); c.restore();
    text('Vermögen', 0, 122, 26, '#26335a', 'center', 800);
    c.restore();
  }
  footnote(1);
}

// ======================= Komposition =======================
const SCENE_FNS = [sceneHospital, sceneCar, sceneApartment, sceneDesk, sceneRealize];
function renderScene(i, T) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.save(); c.beginPath(); c.rect(0, 0, W, H); c.clip(); SCENE_FNS[i](Math.max(0, T - STARTS[i])); c.restore(); }

function render(T) {
  T = clamp(T, 0, TOTAL - 1e-4);
  let i = 0; for (let k = 0; k < SCENES.length; k++) if (T >= STARTS[k]) i = k;
  renderScene(i, T);
  const endT = STARTS[i] + SCENES[i];
  if (i < SCENES.length - 1 && T > endT - TRANS) {
    const w = eio((T - (endT - TRANS)) / TRANS); // Amber-Lichtwisch
    const X = lerp(-260, W + 260, w);
    c.save(); c.beginPath(); c.moveTo(-200, -10); c.lineTo(X + 160, -10); c.lineTo(X - 160, H + 10); c.lineTo(-200, H + 10); c.closePath(); c.clip();
    renderScene(i + 1, T); c.restore();
    c.save(); glow(AMBER, 70); c.strokeStyle = '#ffd08a'; c.lineWidth = 8; c.beginPath(); c.moveTo(X + 160, -10); c.lineTo(X - 160, H + 10); c.stroke(); noGlow();
    c.fillStyle = lg(X - 460, 0, X, 0, [[0, 'rgba(255,154,31,0)'], [1, 'rgba(255,154,31,.35)']]);
    c.beginPath(); c.moveTo(X - 300, -10); c.lineTo(X + 160, -10); c.lineTo(X - 160, H + 10); c.lineTo(X - 620, H + 10); c.closePath(); c.fill(); c.restore();
  }
  // Vignette für Kino-Look
  c.fillStyle = rg(W / 2, H / 2, 380, 780, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.45)']]); c.fillRect(0, 0, W, H);
}
window.render = render; window.TOTAL = TOTAL;
render(0);
