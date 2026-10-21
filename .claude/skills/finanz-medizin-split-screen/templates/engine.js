/* Finanz-Medizin Split-Screen Engine – obere Bildhälfte
 * Deterministisch: FM.seek(t) setzt das DOM exakt auf Zeitpunkt t (Sekunden).
 * Der Renderer (scripts/render_top.py) ruft seek(t) je Frame auf und macht Screenshots.
 * Szenentypen: title, character, counter, gap_bars, inflation, timeline, myth, compare, bullets, image, stat
 */
(function () {
  'use strict';
  const W = 1080;
  const C = {
    navy900: '#071B32', navy800: '#0C2C4F', navy700: '#11395F', navy600: '#17486F', navy500: '#1E5A88',
    navy300: '#6F93B4', navy100: '#D6E1EC', navy050: '#EDF2F7', red700: '#751524', red600: '#8C1E2F',
    red500: '#A5293B', red100: '#F1DDE0', red050: '#FAF0F1', ivory: '#F4F0EF', bone: '#E3DCD6',
    green: '#17683F', greenL: '#E4F3EA', white: '#fff', ink: '#3D5064', skin: '#E8B894', skinD: '#D39E78'
  };
  let H = 960, TOP = 150, BOT = 820, SB = null; // SB = Storyboard
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const E = {
    out: t => 1 - Math.pow(1 - clamp(t), 3),
    inout: t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    back: t => { t = clamp(t); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    expo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t))),
    lin: t => clamp(t)
  };
  const pr = (lt, t0, d, f = E.out) => f(clamp((lt - t0) / d));
  const de = (n, dec = 0) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const mixHex = (a, b, t) => {
    const pa = a.match(/\w\w/g).map(h => parseInt(h, 16)), pb = b.match(/\w\w/g).map(h => parseInt(h, 16));
    return '#' + pa.map((v, i) => Math.round(lerp(v, pb[i], t)).toString(16).padStart(2, '0')).join('');
  };
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const toneCol = t => ({ red: C.red500, blue: C.navy700, gray: C.navy300, green: C.green, navy: C.navy800 }[t] || C.navy700);
  const svg = (inner, extra = '') => `<svg class="abs" style="left:0;top:0" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${extra}>${inner}</svg>`;

  /* ---------- Figur: Arzt/Ärztin (konsistent, altert) ---------- */
  function person(o) {
    const a = o.age || 40, t = o.t || 0, s = o.scale || 1;
    const gray = clamp((a - 38) / 32), hair = mixHex(o.hairColor || '2B2320', 'D4D4D4', gray);
    const lean = clamp((a - 55) / 25) * 5, wr = clamp((a - 46) / 24);
    const casual = o.outfit === 'casual', fem = o.gender === 'f';
    const bob = Math.sin(t * 2.2) * 2.2, wave = o.pose === 'wave' ? Math.sin(t * 7) * 14 : Math.sin(t * 1.6) * 2;
    const worried = o.mood === 'worried', cane = a >= 64 || o.cane;
    const coat = casual ? C.navy500 : '#FFFFFF', pants = casual ? '#B7A78E' : C.navy800;
    const armR = o.pose === 'wave' ? `<g transform="rotate(${-150 + wave} 62 -325)"><path d="M62 -325 L84 -232" stroke="${coat}" stroke-width="34" stroke-linecap="round"/><circle cx="84" cy="-226" r="15" fill="${C.skin}"/></g>`
      : `<g transform="rotate(${wave} 62 -325)"><path d="M62 -325 L86 -196" stroke="${coat}" stroke-width="34" stroke-linecap="round"/><circle cx="87" cy="-188" r="15" fill="${C.skin}"/></g>`;
    const hairBack = fem ? `<path d="M-50 -420 Q-58 -470 0 -476 Q58 -470 50 -420 L56 -352 Q0 -340 -56 -352 Z" fill="${hair}"/>` : '';
    const hairTop = a >= 56 && !fem
      ? `<path d="M-46 -418 Q-50 -452 -22 -462 Q-30 -440 -42 -412 Z M46 -418 Q50 -452 22 -462 Q30 -440 42 -412 Z" fill="${hair}"/><path d="M-30 -462 Q0 -474 30 -462 Q0 -456 -30 -462Z" fill="${hair}" opacity=".7"/>`
      : `<path d="M-47 -412 Q-52 -478 0 -480 Q52 -478 47 -412 Q42 -446 8 -450 Q-30 -444 -47 -412 Z" fill="${hair}"/>`;
    const glasses = a >= 48 || o.glasses ? `<g fill="rgba(255,255,255,.18)" stroke="${C.navy900}" stroke-width="3"><circle cx="-18" cy="-411" r="15"/><circle cx="18" cy="-411" r="15"/><path d="M-3 -411 H3" fill="none"/></g>` : '';
    const wrinkles = wr > 0 ? `<g stroke="${C.skinD}" stroke-width="2.4" fill="none" opacity="${wr}" stroke-linecap="round"><path d="M-22 -440 Q0 -446 22 -440"/><path d="M-20 -432 Q0 -437 20 -432"/><path d="M-40 -405 l-7 -3 M-40 -399 l-8 1"/><path d="M40 -405 l7 -3 M40 -399 l8 1"/><path d="M-20 -383 Q-27 -388 -22 -394"/><path d="M20 -383 Q27 -388 22 -394"/></g>` : '';
    const mouth = worried ? `<path d="M-13 -380 Q0 -389 13 -380" stroke="${C.navy900}" stroke-width="3.4" fill="none" stroke-linecap="round"/>` : `<path d="M-14 -387 Q0 -373 14 -387" stroke="${C.navy900}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
    const brows = worried ? `<path d="M-30 -428 L-8 -434 M30 -428 L8 -434" stroke="${hair}" stroke-width="4" stroke-linecap="round"/>` : `<path d="M-29 -432 Q-18 -438 -7 -432 M29 -432 Q18 -438 7 -432" stroke="${hair}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    const caneSvg = cane ? `<g><path d="M126 -196 V0" stroke="#8A5A33" stroke-width="9" stroke-linecap="round"/><path d="M126 -196 q0 -24 -24 -24" stroke="#8A5A33" stroke-width="9" fill="none" stroke-linecap="round"/></g>` : '';
    const upper = `
      <g transform="translate(0 ${bob.toFixed(2)})">
      <g transform="rotate(${lean.toFixed(2)} 0 -130)">
        ${hairBack}
        <g><path d="M-62 -325 L-86 -196" stroke="${coat}" stroke-width="34" stroke-linecap="round"/><circle cx="-87" cy="-188" r="15" fill="${C.skin}"/></g>
        <path d="M-62 -335 Q-72 -330 -72 -300 L-76 -140 Q-76 -124 -60 -124 L60 -124 Q76 -124 76 -140 L72 -300 Q72 -330 62 -335 L26 -343 L-26 -343 Z" fill="${coat}" stroke="${casual ? C.navy700 : C.navy100}" stroke-width="3"/>
        ${casual ? `<path d="M-24 -343 Q0 -318 24 -343" fill="${C.ivory}" stroke="${C.navy700}" stroke-width="3"/>` : `<path d="M-26 -343 L0 -292 L26 -343 Z" fill="${C.navy500}"/><path d="M0 -292 V-124" stroke="${C.navy100}" stroke-width="3"/><rect x="30" y="-296" width="30" height="16" rx="3" fill="${C.navy100}"/>`}
        ${casual ? '' : `<path d="M-24 -345 Q-34 -252 0 -240 Q34 -252 24 -345" stroke="${C.navy900}" stroke-width="5" fill="none"/><circle cx="0" cy="-236" r="10" fill="${C.red600}" stroke="${C.navy900}" stroke-width="3"/>`}
        ${armR}
        <rect x="-13" y="-372" width="26" height="36" fill="${C.skinD}"/>
        <circle cx="-46" cy="-408" r="9" fill="${C.skinD}"/><circle cx="46" cy="-408" r="9" fill="${C.skinD}"/>
        <ellipse cx="0" cy="-410" rx="45" ry="52" fill="${C.skin}"/>
        ${hairTop}${brows}
        <circle cx="-18" cy="-411" r="4.8" fill="${C.navy900}"/><circle cx="18" cy="-411" r="4.8" fill="${C.navy900}"/>
        <path d="M-2 -402 Q-6 -392 1 -392" stroke="${C.skinD}" stroke-width="3" fill="none" stroke-linecap="round"/>
        ${glasses}${mouth}${wrinkles}
      </g></g>`;
    return `<g transform="translate(${o.x} ${o.y}) scale(${s * (o.flip ? -1 : 1)} ${s})">
      <ellipse cx="0" cy="3" rx="92" ry="11" fill="rgba(7,27,50,.16)"/>
      <rect x="-36" y="-196" width="28" height="182" rx="6" fill="${pants}"/><rect x="8" y="-196" width="28" height="182" rx="6" fill="${pants}"/>
      <path d="M-46 -16 Q-46 -2 -34 0 L-4 0 L-6 -16 Z" fill="${C.navy900}"/><path d="M46 -16 Q46 -2 34 0 L4 0 L6 -16 Z" fill="${C.navy900}"/>
      ${upper}${caneSvg}</g>`;
  }

  /* ---------- Umgebungen ---------- */
  const FLOOR = () => BOT - 8;
  function envApartment(t) {
    const f = FLOOR();
    return `<rect width="${W}" height="${f}" fill="${C.navy050}"/><rect y="${f}" width="${W}" height="${H - f}" fill="${C.bone}"/>
    <rect y="${f - 6}" width="${W}" height="10" fill="${C.navy100}"/>
    <g><rect x="80" y="190" width="330" height="360" rx="10" fill="#fff" stroke="${C.navy300}" stroke-width="8"/>
      <rect x="92" y="202" width="306" height="336" fill="#BFD6EA"/>
      <g fill="${C.navy300}"><rect x="104" y="400" width="60" height="138"/><rect x="176" y="350" width="50" height="188"/><rect x="238" y="420" width="70" height="118"/><rect x="320" y="370" width="64" height="168"/></g>
      <g fill="#fff" opacity=".9"><rect x="112" y="420" width="10" height="14"/><rect x="132" y="420" width="10" height="14"/><rect x="186" y="380" width="10" height="14"/><rect x="330" y="400" width="10" height="14"/></g>
      <path d="M245 202 V538 M92 370 H398" stroke="#fff" stroke-width="8"/></g>
    <g><rect x="700" y="${f - 150}" width="310" height="150" rx="22" fill="${C.navy700}"/><rect x="680" y="${f - 100}" width="40" height="100" rx="14" fill="${C.navy600}"/><rect x="990" y="${f - 100}" width="40" height="100" rx="14" fill="${C.navy600}"/>
      <rect x="720" y="${f - 190}" width="270" height="70" rx="22" fill="${C.navy600}"/><rect x="736" y="${f - 118}" width="238" height="26" rx="10" fill="${C.navy500}"/></g>
    <g><rect x="760" y="210" width="190" height="130" fill="#fff" stroke="${C.navy800}" stroke-width="6"/><path d="M772 330 L830 260 L870 305 L900 275 L940 330 Z" fill="${C.navy300}"/><circle cx="905" cy="245" r="14" fill="${C.red500}"/></g>
    <g><path d="M470 ${f} V${f - 175}" stroke="${C.navy900}" stroke-width="0"/></g>
    <g><rect x="40" y="${f - 90}" width="54" height="90" rx="8" fill="${C.red100}" transform="translate(560 0)"/><path d="M587 ${f - 90} q-40 -80 -10 -120 M587 ${f - 90} q36 -70 12 -130 M587 ${f - 90} q0 -90 -6 -150" stroke="${C.green}" stroke-width="10" fill="none" stroke-linecap="round" transform="translate(0 0)"/></g>`;
  }
  function envHospital(t) {
    const f = FLOOR();
    return `<rect width="${W}" height="${f}" fill="#E8F0F6"/><rect y="${f}" width="${W}" height="${H - f}" fill="#C9D6E2"/>
    <rect y="${f - 6}" width="${W}" height="10" fill="${C.navy100}"/><rect y="520" width="${W}" height="14" fill="#fff"/><rect y="534" width="${W}" height="6" fill="${C.navy100}"/>
    <g><rect x="90" y="250" width="200" height="270" rx="8" fill="#fff" stroke="${C.navy300}" stroke-width="6"/><rect x="104" y="264" width="172" height="242" fill="#CFE0EE"/><path d="M190 264 V506" stroke="${C.navy300}" stroke-width="5"/></g>
    <g><rect x="740" y="${f - 380}" width="230" height="380" rx="8" fill="#fff" stroke="${C.navy300}" stroke-width="6"/><rect x="770" y="${f - 350}" width="170" height="150" fill="#CFE0EE" stroke="${C.navy300}" stroke-width="4"/><circle cx="940" cy="${f - 170}" r="9" fill="${C.navy700}"/></g>
    <g transform="translate(330 -10)"><rect x="470" y="190" width="130" height="130" rx="22" fill="#fff" stroke="${C.navy100}" stroke-width="4"/><path d="M510 255 h50 M535 230 v50" stroke="${C.red500}" stroke-width="22" stroke-linecap="butt"/></g>
    <g transform="translate(-90 -20)"><circle cx="350" cy="230" r="42" fill="#fff" stroke="${C.navy700}" stroke-width="7"/><path d="M350 230 V202 M350 230 L370 240" stroke="${C.navy800}" stroke-width="6" stroke-linecap="round"/></g>
    <g><rect x="990" y="${f - 280}" width="12" height="280" fill="${C.navy300}"/><rect x="960" y="${f - 280}" width="70" height="8" fill="${C.navy300}"/><rect x="965" y="${f - 250}" width="22" height="46" rx="6" fill="${C.red100}" stroke="${C.red500}" stroke-width="3"/></g>`;
  }
  function envRetire(t) {
    const f = FLOOR();
    return `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7D9B0"/><stop offset="1" stop-color="#F4F0EF"/></linearGradient></defs>
    <rect width="${W}" height="${f}" fill="url(#sk)"/><circle cx="840" cy="250" r="70" fill="#F2B563" opacity=".9"/>
    <path d="M0 ${f - 150} Q250 ${f - 260} 520 ${f - 170} T1080 ${f - 200} V${f} H0Z" fill="#CFDCC8"/>
    <rect y="${f}" width="${W}" height="${H - f}" fill="#9DB794"/><rect y="${f - 6}" width="${W}" height="10" fill="#86A07C"/>
    <g><rect x="70" y="${f - 250}" width="250" height="250" fill="#fff" stroke="${C.navy300}" stroke-width="5"/><path d="M50 ${f - 250} L195 ${f - 360} L340 ${f - 250}Z" fill="${C.red600}"/><rect x="170" y="${f - 140}" width="50" height="140" fill="${C.navy700}"/><rect x="95" y="${f - 210}" width="55" height="55" fill="#BFD6EA" stroke="${C.navy300}" stroke-width="4"/><rect x="245" y="${f - 210}" width="55" height="55" fill="#BFD6EA" stroke="${C.navy300}" stroke-width="4"/></g>
    <g><rect x="700" y="${f - 90}" width="280" height="14" rx="5" fill="#8A5A33"/><rect x="700" y="${f - 140}" width="280" height="14" rx="5" fill="#8A5A33"/><rect x="716" y="${f - 90}" width="14" height="90" fill="#6E4627"/><rect x="950" y="${f - 90}" width="14" height="90" fill="#6E4627"/></g>
    <g><rect x="560" y="${f - 210}" width="20" height="210" fill="#6E4627"/><circle cx="570" cy="${f - 260}" r="85" fill="#6F9A6A"/><circle cx="520" cy="${f - 220}" r="55" fill="#7DAA77"/></g>`;
  }
  function envPraxis(t) {
    const f = FLOOR();
    return `<rect width="${W}" height="${f}" fill="${C.navy050}"/><rect y="${f}" width="${W}" height="${H - f}" fill="${C.bone}"/>
    <rect x="620" y="${f - 170}" width="400" height="170" rx="12" fill="${C.navy700}"/><rect x="610" y="${f - 186}" width="420" height="22" rx="8" fill="#fff" stroke="${C.navy100}" stroke-width="3"/>
    <rect x="720" y="${f - 280}" width="150" height="94" rx="8" fill="#fff" stroke="${C.navy800}" stroke-width="6"/><rect x="780" y="${f - 186}" width="30" height="14" fill="${C.navy800}"/>
    <g><rect x="90" y="220" width="320" height="300" rx="8" fill="#fff" stroke="${C.navy100}" stroke-width="4"/><path d="M90 320 H410 M90 420 H410" stroke="${C.navy100}" stroke-width="4"/>
      <g fill="${C.navy500}"><rect x="110" y="240" width="22" height="70"/><rect x="140" y="250" width="22" height="60"/></g><g fill="${C.red500}"><rect x="200" y="340" width="22" height="70"/><rect x="230" y="350" width="22" height="60"/></g><g fill="${C.navy300}"><rect x="300" y="440" width="22" height="70"/><rect x="330" y="450" width="22" height="60"/></g></g>
    <g><rect x="470" y="190" width="120" height="120" rx="20" fill="#fff" stroke="${C.navy100}" stroke-width="4"/><path d="M505 250 h50 M530 225 v50" stroke="${C.red500}" stroke-width="20"/></g>`;
  }
  const ENVS = { apartment: envApartment, hospital: envHospital, retirement: envRetire, praxis: envPraxis };

  /* ---------- Callouts (handschriftlich wirkende Annotation + Pfeil) ---------- */
  function callouts(list, lt) {
    return (list || []).map(c => {
      const u = pr(lt, c.t || 0, .35, E.back); if (lt < (c.t || 0)) return '';
      const x = c.x ?? 300, y = c.y ?? 300, d = pr(lt, (c.t || 0) + .15, .45, E.out);
      const ar = c.arrow ? `<svg class="abs" style="left:0;top:0" width="${W}" height="${H}"><path d="M${x + 10} ${y + 22} q ${c.arrow.dx * .15} ${c.arrow.dy * .7} ${c.arrow.dx} ${c.arrow.dy}" stroke="${C.red500}" stroke-width="5" fill="none" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - d).toFixed(3)}"/></svg>` : '';
      return `<div class="abs serif" style="left:${x}px;top:${y}px;font-size:${c.size || 58}px;color:${C.red500};transform:scale(${u}) rotate(${c.rot ?? -4}deg);transform-origin:0 100%;white-space:nowrap">${esc(c.text)}</div>${ar}`;
    }).join('');
  }

  /* ---------- Szenentypen ---------- */
  const SC = {};

  SC.title = (p, lt) => {
    const words = (p.line1 || '').split(' '), acc = (p.accent || '').split(' ').filter(Boolean);
    const all = words.map(w => ({ w, a: 0 })).concat(acc.map(w => ({ w, a: 1 })));
    let i = 0;
    const spans = all.map(o => { const u = pr(lt, .08 + i++ * .09, .4, E.back); return `<span style="display:inline-block;opacity:${clamp(u * 2)};transform:translateY(${(1 - u) * 36}px) scale(${.9 + .1 * u})" class="${o.a ? 'serif' : 'hl'}"><span style="${o.a ? `color:${C.red500};font-size:1.12em;font-weight:500` : ''}">${esc(o.w)}</span>&nbsp;</span>`; }).join('');
    const kick = p.kicker ? `<div class="abs" style="left:0;width:100%;text-align:center;top:${TOP + 110}px;font-weight:800;font-size:30px;letter-spacing:.2em;color:${C.red500};opacity:${pr(lt, 0, .3)}">${esc(p.kicker.toUpperCase())}</div>` : '';
    const sub = p.sub ? `<div class="abs" style="left:90px;width:900px;text-align:center;top:${TOP + 470}px;font-size:40px;font-weight:600;color:${C.ink};opacity:${pr(lt, .7, .4)};transform:translateY(${(1 - pr(lt, .7, .4)) * 20}px)">${esc(p.sub)}</div>` : '';
    return `${kick}<div class="abs" style="left:70px;width:940px;top:${TOP + 170}px;text-align:center;font-size:${p.size || 104}px;line-height:1.08;color:${C.navy800}">${spans}</div>${sub}`;
  };

  SC.character = (p, lt, dur) => {
    const f = FLOOR(), fig = (SB.figures || {})[p.figure || 'doc'] || {};
    const hasAge = p.ageTo != null && p.ageTo !== p.age;
    const span = p.lapse || Math.min(dur * .6, 3.2), t0 = p.lapseStart ?? Math.min(.9, dur * .2);
    const u = hasAge ? pr(lt, t0, span, E.inout) : 0;
    const age = hasAge ? lerp(p.age, p.ageTo, u) : (p.age || 40);
    const envA = p.env || 'apartment', envB = p.envTo || envA;
    const m = envA === envB ? 0 : clamp((u - .42) / .16);
    let env = ENVS[envA](lt); if (m > 0) env = `<g opacity="${1 - m}">${env}</g><g opacity="${m}">${ENVS[envB](lt)}</g>`;
    const tint = hasAge ? `<rect width="${W}" height="${H}" fill="${C.navy900}" opacity="${(Math.sin(u * Math.PI * 3) * .5 + .5) * Math.sin(u * Math.PI) * .12}"/>` : '';
    const outfit = (age >= 62 && envB === 'retirement' && (!hasAge || u > .55)) ? 'casual' : (fig.outfit || 'coat');
    const x = (p.x ?? 470) + (p.walk ? Math.sin(lt * 2) * 6 : 0);
    const who = person({ x, y: f, scale: p.scale || 1.28, age, t: lt, gender: fig.gender, hairColor: fig.hair, outfit, pose: p.pose, mood: p.mood, glasses: fig.glasses });
    let year = '';
    if (p.year != null) {
      const yr = hasAge ? Math.round(lerp(p.year, p.yearTo, u)) : p.year, flick = hasAge && u > 0 && u < 1;
      year = `<div class="abs" style="right:70px;top:${TOP + 10}px;padding:8px 26px;border-radius:18px;background:#fff;border:3px solid ${C.navy800};box-shadow:0 6px 0 ${C.navy800};font-weight:800;font-size:52px;color:${C.navy800};transform:rotate(${flick ? Math.sin(lt * 30) * 1.2 : 0}deg)">${yr}</div>`;
    }
    let badge = '';
    if (p.badge) {
      const b = p.badge, bu = pr(lt, b.t ?? .5, .5, E.back), tone = toneCol(b.tone || 'blue');
      let val = b.text;
      if (b.countFrom != null) { const cu = pr(lt, b.t ?? .5, .9); val = de(lerp(b.countFrom, b.value, cu), 0) + (b.unit ? ' ' + b.unit : ''); }
      if (b.valueTo != null && hasAge) val = de(lerp(b.value, b.valueTo, u), 0) + ' ' + (b.unit || '');
      badge = `<div class="abs" style="left:${b.x ?? 620}px;top:${b.y ?? 300}px;transform:scale(${bu}) rotate(-2deg);transform-origin:0 100%;background:#fff;border-radius:26px;padding:22px 34px;border:4px solid ${tone};box-shadow:0 10px 0 ${tone}">
        <div style="font-weight:800;font-size:${b.size || 78}px;color:${tone};letter-spacing:-.03em;line-height:1">${esc(val)}</div>${b.label ? `<div style="font-weight:700;font-size:30px;color:${C.ink};margin-top:6px">${esc(b.label)}</div>` : ''}</div>`;
    }
    const sign = p.warn ? (() => { const w = pr(lt, p.warn.t ?? .8, .45, E.back); return `<svg class="abs" style="left:${p.warn.x ?? 640}px;top:${p.warn.y ?? 240}px" width="190" height="170" viewBox="0 0 190 170"><g transform="translate(95 85) scale(${w}) translate(-95 -85)"><path d="M95 8 L182 160 H8 Z" fill="${C.red500}" stroke="${C.red700}" stroke-width="8" stroke-linejoin="round"/><rect x="87" y="62" width="16" height="54" rx="6" fill="#fff"/><circle cx="95" cy="136" r="9" fill="#fff"/></g></svg>`; })() : '';
    return svg(env + tint + who) + year + badge + sign;
  };

  SC.counter = (p, lt, dur) => {
    const u = pr(lt, .15, p.count_time || Math.min(dur * .7, 2.2), E.out), tone = toneCol(p.tone || 'blue');
    const v = lerp(p.from || 0, p.to, u), pop = pr(lt, 0, .45, E.back);
    return `<div class="abs" style="left:0;width:100%;top:${TOP + 130}px;text-align:center;font-weight:800;font-size:36px;letter-spacing:.14em;color:${C.ink};opacity:${pr(lt, 0, .3)}">${esc((p.label || '').toUpperCase())}</div>
      <div class="abs" style="left:0;width:100%;top:${TOP + 210}px;text-align:center;transform:scale(${.7 + .3 * pop});color:${tone};font-weight:800;font-size:${p.size || 190}px;letter-spacing:-.04em;line-height:1">${de(v, p.decimals || 0)}<span style="font-size:.55em;margin-left:.12em">${esc(p.unit || '')}</span></div>
      ${p.caption ? `<div class="abs serif" style="left:0;width:100%;top:${TOP + 460}px;text-align:center;font-size:62px;color:${C.red500};opacity:${pr(lt, .9, .4)}">${esc(p.caption)}</div>` : ''}`;
  };
  SC.stat = SC.counter;

  SC.gap_bars = (p, lt, dur) => {
    const bars = p.bars, max = p.max || Math.max(...bars.map(b => b.value)) * 1.05, base = BOT - 90, hMax = base - (TOP + 130);
    const bw = 250, gapX = 120, x0 = (W - (bars.length * bw + (bars.length - 1) * gapX)) / 2;
    const unit = p.unit || '€';
    let out = `<div class="abs" style="left:0;width:100%;top:${TOP + 10}px;text-align:center;font-weight:800;font-size:34px;letter-spacing:.12em;color:${C.ink}">${esc((p.title || '').toUpperCase())}</div>`;
    let tops = [];
    const s = bars.map((b, i) => {
      const u = pr(lt, .25 + i * .55, 1.0, E.out), h = b.value / max * hMax * u, x = x0 + i * (bw + gapX), col = toneCol(b.tone || (i ? 'gray' : 'blue'));
      tops.push({ x, y: base - b.value / max * hMax, b });
      return `<rect x="${x}" y="${base - h}" width="${bw}" height="${h}" rx="14" fill="${col}"/>
        <text x="${x + bw / 2}" y="${base - h - 20}" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="60" fill="${col}" opacity="${clamp(u * 3)}">${de(b.value * u, 0)} ${unit}</text>
        <text x="${x + bw / 2}" y="${base + 52}" text-anchor="middle" font-family="Manrope" font-weight="700" font-size="34" fill="${C.ink}">${esc(b.label)}</text>`;
    }).join('');
    let gap = '';
    if (bars.length >= 2) {
      const gu = pr(lt, p.gap_t ?? (.25 + .55 + 1.1), .7, E.out), a = tops[0], b = tops[1], gv = p.gap && p.gap.value != null ? p.gap.value : (a.b.value - b.b.value);
      if (lt >= (p.gap_t ?? 1.9)) {
        const pulse = 1 + Math.sin(lt * 5) * .015;
        gap = `<path d="M${a.x + bw} ${a.y} H${b.x + bw}" stroke="${C.red500}" stroke-width="4" stroke-dasharray="12 10" fill="none" opacity="${gu}"/>
          <rect x="${b.x}" y="${a.y}" width="${bw}" height="${(b.y - a.y) * gu}" rx="14" fill="${C.red100}" stroke="${C.red500}" stroke-width="4" stroke-dasharray="14 10"/>
          <g transform="translate(${b.x + bw / 2} ${(a.y + b.y) / 2}) scale(${pulse * (.6 + .4 * gu)})" opacity="${gu}"><text text-anchor="middle" y="-6" font-family="Manrope" font-weight="800" font-size="44" fill="${C.red600}">${esc((p.gap && p.gap.label) || 'Lücke')}</text><text text-anchor="middle" y="48" font-family="Manrope" font-weight="800" font-size="56" fill="${C.red500}">${de(gv, 0)} ${unit}</text></g>`;
      }
    }
    return svg(`<line x1="${x0 - 40}" x2="${W - x0 + 40}" y1="${base}" y2="${base}" stroke="${C.navy800}" stroke-width="5" stroke-linecap="round"/>${s}${gap}`) + out;
  };

  const realValue = (a, r, y) => a / Math.pow(1 + r / 100, y);
  SC.inflation = (p, lt, dur) => {
    const A = p.amount || 100, R = p.rate || 3, Y = p.years || 20, x0 = 140, x1 = 940, yT = TOP + 170, yB = BOT - 70;
    const u = pr(lt, .6, Math.max(1.2, dur * .6), E.inout), yr = Y * u, val = realValue(A, R, yr);
    const X = y => x0 + (x1 - x0) * y / Y, Yv = v => yB - (v / A) * (yB - yT);
    let d = '', area = '';
    for (let i = 0; i <= 80; i++) { const y = Y * i / 80; if (y > yr) break; d += (i ? 'L' : 'M') + X(y).toFixed(1) + ' ' + Yv(realValue(A, R, y)).toFixed(1) + ' '; }
    area = d ? `<path d="${d} L${X(yr).toFixed(1)} ${yB} L${x0} ${yB}Z" fill="${C.red100}"/>` : '';
    const grid = [0, 25, 50, 75, 100].map(g => `<line x1="${x0}" x2="${x1}" y1="${Yv(A * g / 100)}" y2="${Yv(A * g / 100)}" stroke="${C.navy100}" stroke-width="2"/><text x="${x0 - 14}" y="${Yv(A * g / 100) + 8}" text-anchor="end" font-family="Manrope" font-weight="700" font-size="26" fill="${C.ink}">${A * g / 100}</text>`).join('');
    const xt = [0, Math.round(Y / 2), Y].map(y => `<text x="${X(y)}" y="${yB + 42}" text-anchor="middle" font-family="Manrope" font-weight="700" font-size="28" fill="${C.ink}">Jahr ${y}</text>`).join('');
    const dot = `<circle cx="${X(yr)}" cy="${Yv(val)}" r="14" fill="${C.red500}" stroke="#fff" stroke-width="5"/>`;
    const loss = (1 - realValue(A, R, Y) / A) * 100, lu = pr(lt, .6 + Math.max(1.2, dur * .6), .5, E.back);
    const note = noteSvg(W - 330, TOP - 4, Math.sqrt(val / A), val);
    const head = `<div class="abs" style="left:70px;top:${TOP - 6}px;font-weight:800;font-size:34px;letter-spacing:.06em;color:${C.ink}">KAUFKRAFT VON ${de(A)} € BEI ${de(R, 1)} % INFLATION</div>`;
    const read = `<div class="abs" style="left:${x0}px;top:${TOP + 52}px;font-weight:800;font-size:86px;color:${C.red500};letter-spacing:-.03em;line-height:1">${de(val, 2)} €<span style="font-size:.38em;color:${C.ink};margin-left:.4em">nach ${Math.round(yr)} Jahren</span></div>`;
    const badge = lt > .6 + Math.max(1.2, dur * .6) ? `<div class="abs" style="left:${x1 - 330}px;top:${yT + 20}px;transform:scale(${lu}) rotate(-3deg);background:${C.red500};color:#fff;border-radius:22px;padding:14px 30px;font-weight:800;font-size:58px;box-shadow:0 8px 0 ${C.red700}">−${de(loss, 1)} %</div>` : '';
    return svg(grid + xt + area + `<path d="${d}" stroke="${C.red500}" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` + dot) + head + read + badge;
  };
  function noteSvg(x, y, s, v) { return ''; }

  SC.timeline = (p, lt, dur) => {
    const y0 = p.from, y1 = p.to, u = pr(lt, .3, Math.max(1, dur * .75), E.inout), yr = lerp(y0, y1, u), lineY = TOP + 410, xa = 110, xb = 970;
    const X = y => xa + (xb - xa) * (y - y0) / (y1 - y0);
    let ticks = '';
    for (let y = y0; y <= y1; y += (p.step || 5)) ticks += `<line x1="${X(y)}" x2="${X(y)}" y1="${lineY - 14}" y2="${lineY + 14}" stroke="${C.navy800}" stroke-width="5"/><text x="${X(y)}" y="${lineY + 56}" text-anchor="middle" font-family="Manrope" font-weight="700" font-size="28" fill="${C.ink}">${esc(p.prefix||"")}${y}</text>`;
    const pins = (p.markers || []).map(m => { const mu = pr(lt, .3 + (m.year - y0) / (y1 - y0) * Math.max(1, dur * .75), .45, E.back); if (yr < m.year) return ''; return `<g transform="translate(${X(m.year)} ${lineY - 40}) scale(${mu})"><circle r="16" fill="${toneCol(m.tone || 'red')}"/><path d="M0 16 V60" stroke="${toneCol(m.tone || 'red')}" stroke-width="5"/></g><text x="${X(m.year)}" y="${lineY - 120}" text-anchor="middle" font-family="Newsreader" font-style="italic" font-size="46" fill="${toneCol(m.tone || 'red')}" opacity="${mu}">${esc(m.label)}</text>`; }).join('');
    return svg(`<line x1="${xa}" x2="${xb}" y1="${lineY}" y2="${lineY}" stroke="${C.navy800}" stroke-width="8" stroke-linecap="round"/><line x1="${xa}" x2="${X(yr)}" y1="${lineY}" y2="${lineY}" stroke="${C.red500}" stroke-width="12" stroke-linecap="round"/>${ticks}${pins}<circle cx="${X(yr)}" cy="${lineY}" r="18" fill="${C.red500}" stroke="#fff" stroke-width="6"/>`) +
      `<div class="abs" style="left:0;width:100%;text-align:center;top:${TOP + 90}px;font-weight:800;font-size:150px;letter-spacing:-.04em;color:${C.navy800}">${esc(p.prefix||"")}${Math.round(yr)}</div>` +
      (p.label ? `<div class="abs" style="left:0;width:100%;text-align:center;top:${TOP + 510}px;font-weight:700;font-size:40px;color:${C.ink}">${esc(p.label)}</div>` : '');
  };

  SC.myth = (p, lt) => {
    const cu = pr(lt, .25, .5, E.back), st = pr(lt, p.stamp_t ?? 1.3, .3, E.back), strike = pr(lt, p.strike_t ?? 1.0, .45, E.out);
    const shake = lt > (p.stamp_t ?? 1.3) && lt < (p.stamp_t ?? 1.3) + .25 ? Math.sin(lt * 90) * 6 * (1 - (lt - (p.stamp_t ?? 1.3)) / .25) : 0;
    return `<div class="abs" style="left:100px;width:880px;top:${TOP + 130}px;transform:scale(${.8 + .2 * cu});opacity:${clamp(cu * 2)};background:#fff;border-radius:32px;border:5px solid ${C.navy800};box-shadow:0 14px 0 ${C.navy800};padding:50px 54px;text-align:center">
      <div style="font-weight:800;font-size:30px;letter-spacing:.2em;color:${C.red500};margin-bottom:18px">${esc(p.kicker || 'DAS HÖRT MAN OFT')}</div>
      <div class="serif" style="position:relative;display:inline-block;font-size:${p.size || 70}px;line-height:1.12;color:${C.navy800}">${esc(p.text)}<span style="position:absolute;left:-2%;top:54%;height:8px;width:${104 * strike}%;background:${C.red500};border-radius:4px;transform:rotate(-1.5deg)"></span></div></div>
      <div class="abs" style="right:${p.sr ?? 60}px;top:${p.sy ?? TOP + 420}px;transform:translateX(${shake}px) rotate(-9deg) scale(${lt < (p.stamp_t ?? 1.3) ? 0 : 2 - st});opacity:${st};border:9px solid ${C.red500};color:${C.red500};border-radius:18px;padding:6px 36px;font-weight:800;font-size:${p.stampSize || 110}px;letter-spacing:.04em;background:rgba(244,240,239,.85)">${esc(p.stamp || 'MYTHOS')}</div>` +
      (p.warn !== false ? `<svg class="abs" style="left:110px;top:${TOP + 440}px" width="150" height="135" viewBox="0 0 190 170"><g transform="translate(95 85) scale(${pr(lt, .7, .45, E.back)}) translate(-95 -85)"><path d="M95 8 L182 160 H8 Z" fill="${C.red500}" stroke="${C.red700}" stroke-width="8" stroke-linejoin="round"/><rect x="87" y="62" width="16" height="54" rx="6" fill="#fff"/><circle cx="95" cy="136" r="9" fill="#fff"/></g></svg>` : '');
  };

  const mark = (k, col) => k === 'check' ? `<circle cx="22" cy="22" r="22" fill="${C.green}"/><path d="M11 23 L19 31 L34 14" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    : k === 'cross' ? `<circle cx="22" cy="22" r="22" fill="${C.red500}"/><path d="M13 13 L31 31 M31 13 L13 31" stroke="#fff" stroke-width="6" stroke-linecap="round"/>` : `<circle cx="22" cy="22" r="10" fill="${col}"/>`;
  SC.compare = (p, lt) => {
    const col = (side, i) => {
      const s = p[side], x = i ? 580 : 50, tone = toneCol(s.tone || (i ? 'blue' : 'gray')), u = pr(lt, .15 + i * .25, .5, E.back);
      const items = (s.items || []).map((it, k) => {
        const iu = pr(lt, .8 + k * .55 + i * .15, .4, E.back);
        return `<div style="display:flex;align-items:center;gap:16px;margin-top:20px;opacity:${clamp(iu * 2)};transform:translateX(${(1 - iu) * 30}px)"><svg width="44" height="44" viewBox="0 0 44 44" style="flex:none">${mark(it.mark, tone)}</svg><div style="font-weight:700;font-size:36px;line-height:1.15;color:${C.navy800}">${esc(it.text)}</div></div>`;
      }).join('');
      return `<div class="abs" style="left:${x}px;top:${TOP + 70}px;width:450px;transform:scale(${.85 + .15 * u});opacity:${clamp(u * 2)};background:#fff;border-radius:28px;border:5px solid ${tone};box-shadow:0 12px 0 ${tone};padding:30px 30px 34px"><div style="font-weight:800;font-size:44px;color:${tone};line-height:1.1">${esc(s.title)}</div>${items}</div>`;
    };
    const vs = p.vs !== false ? `<div class="abs" style="left:500px;top:${TOP + 300}px;width:80px;height:80px;border-radius:50%;background:${C.navy800};color:#fff;font-weight:800;font-size:32px;display:flex;align-items:center;justify-content:center;transform:scale(${pr(lt, .5, .4, E.back)});z-index:3;border:4px solid #fff">${esc(p.vs || 'VS')}</div>` : '';
    return col('left', 0) + col('right', 1) + vs;
  };

  SC.bullets = (p, lt) => {
    const items = (p.items || []).map((t, i) => { const u = pr(lt, .3 + i * .6, .45, E.back); return `<div style="display:flex;align-items:center;gap:22px;margin-bottom:26px;opacity:${clamp(u * 2)};transform:translateX(${(1 - u) * -60}px)"><div style="flex:none;width:66px;height:66px;border-radius:50%;background:${C.red500};color:#fff;font-weight:800;font-size:38px;display:flex;align-items:center;justify-content:center">${i + 1}</div><div style="font-weight:800;font-size:44px;line-height:1.1;color:${C.navy800}">${esc(t)}</div></div>`; }).join('');
    return `<div class="abs" style="left:90px;width:900px;top:${TOP + 90}px"><div class="serif" style="font-size:66px;color:${C.red500};margin-bottom:30px;opacity:${pr(lt, 0, .3)}">${esc(p.title || '')}</div>${items}</div>`;
  };

  SC.image = (p, lt, dur) => {
    const u = clamp(lt / dur), z = lerp(p.zoom_from || 1.0, p.zoom_to || 1.15, E.inout(u)), px = lerp(p.pan_x_from || 0, p.pan_x_to || 0, u), py = lerp(p.pan_y_from || 0, p.pan_y_to || 0, u);
    const h = BOT - TOP - 30;
    return `<div class="abs" style="left:60px;top:${TOP - 10}px;width:960px;height:${h}px;border-radius:30px;overflow:hidden;border:5px solid ${C.navy800};box-shadow:0 12px 0 ${C.navy800};background:${C.navy100}"><img src="${esc(p.src)}" style="width:100%;height:100%;object-fit:cover;transform:translate(${px}px,${py}px) scale(${z})"></div>` +
      (p.caption ? `<div class="abs serif" style="left:60px;width:960px;text-align:center;top:${TOP + 20}px;font-size:56px;color:#fff;text-shadow:0 3px 12px rgba(7,27,50,.7);opacity:${pr(lt, .4, .4)}">${esc(p.caption)}</div>` : '');
  };

  /* ---------- Untertitel ---------- */
  function buildChunks() {
    const o = (SB.meta && SB.meta.subtitles) || {}, words = SB.words || [], maxW = o.max_words || 3, chunks = [];
    let cur = [];
    const flush = () => { if (cur.length) { chunks.push({ words: cur, s: cur[0].s, e: cur[cur.length - 1].e }); cur = []; } };
    words.forEach((w, i) => {
      if (cur.length && (cur.length >= maxW || w.s - cur[cur.length - 1].e > .55)) flush();
      cur.push(w);
      if (/[.!?:;,]$/.test(w.w)) flush();
    });
    flush();
    return chunks;
  }
  let CH = [], KW = new Set();
  const isKey = w => KW.has(w.toLowerCase().replace(/[^a-zäöüß0-9€%.,]/g, '')) || /\d|€|%/.test(w);
  function subsHTML(t) {
    const o = (SB.meta && SB.meta.subtitles) || {};
    if (o.enabled === false) return '';
    let c = null;
    for (let i = 0; i < CH.length; i++) { const nxt = CH[i + 1], end = nxt ? Math.min(CH[i].e + .35, nxt.s) : CH[i].e + .35; if (t >= CH[i].s - .02 && t < end) { c = CH[i]; break; } }
    if (!c) return '';
    const pop = pr(t - c.s, 0, .14, E.back), len = c.words.map(w => w.w).join(' ').length, longest = Math.max(...c.words.map(w => w.w.length)), size = o.font_size || Math.max(40, Math.min(len > 26 ? 56 : len > 20 ? 64 : len > 13 ? 76 : 90, Math.floor(820 / (0.6 * longest))));
    const karaoke = c.words.length > 1;
    const sp = c.words.map(w => {
      const on = t >= w.s, cur = t >= w.s && t < w.e + .05, key = isKey(w.w);
      return `<span style="color:${key ? C.red500 : C.navy800};opacity:${karaoke && !on ? .32 : 1};transform:scale(${cur && karaoke ? 1.07 : 1});text-shadow:0 0 0 ${C.ivory},3px 3px 0 ${C.ivory},-3px -3px 0 ${C.ivory},3px -3px 0 ${C.ivory},-3px 3px 0 ${C.ivory},0 5px 14px rgba(244,240,239,.9)">${esc(w.w.replace(/^[„"“]|[“"”]$/g, ''))}</span>`;
    }).join('');
    return `<div style="font-size:${size}px;transform:scale(${.86 + .14 * pop});opacity:${clamp(pop * 2)}">${sp}</div>`;
  }

  /* ---------- Orchestrierung ---------- */
  const els = {};
  function init(sb) {
    SB = sb; const m = sb.meta || {};
    H = m.panel_height || 960; TOP = m.safe_top || 150; BOT = H - (m.subtitle_band || 140);
    document.getElementById('stage').style.height = H + 'px';
    const pn = document.getElementById('panel'); pn.style.height = H + 'px';
    const dv = document.getElementById('divider'); dv.style.top = (H - 10) + 'px';
    const sbEl = document.getElementById('subs'); sbEl.style.top = (H - 150) + 'px'; sbEl.style.height = '130px'; sbEl.style.display = 'flex'; sbEl.style.alignItems = 'center'; sbEl.style.justifyContent = 'center';
    const br = document.getElementById('brand'); br.style.left = (W - 100) + 'px'; br.style.top = (H - 82) + 'px';
    if (m.brand_mark === false) br.style.display = 'none'; else document.getElementById('brandimg').src = m.brand_mark_src || '../assets/img/mark-finanz-medizin.png';
    if (m.panel_bg) pn.style.backgroundColor = m.panel_bg;
    pn.innerHTML = '';
    (sb.scenes || []).forEach((sc, i) => { const d = document.createElement('div'); d.className = 'scene'; d.style.display = 'none'; pn.appendChild(d); els[i] = d; });
    CH = buildChunks(); KW = new Set(); (sb.scenes || []).forEach(s => (s.keywords || []).forEach(k => KW.add(String(k).toLowerCase())));
    (sb.meta.keywords || []).forEach(k => KW.add(String(k).toLowerCase()));
    return true;
  }
  function trIn(kind, u, i) {
    // liefert {neu, alt} CSS für Übergang; u = 0..1
    const e = E.out(u);
    switch (kind) {
      case 'cut': return { n: '', o: '' };
      case 'fade': return { n: `opacity:${e}`, o: '' };
      case 'slide': return { n: `transform:translateX(${(1 - e) * 100}%)`, o: `transform:translateX(${-e * 25}%);opacity:${1 - e * .6}` };
      case 'zoom': return { n: `transform:scale(${1.25 - .25 * e});opacity:${clamp(e * 1.6)}`, o: `transform:scale(${1 + e * .25});opacity:${1 - e}` };
      case 'wipe': return { n: `clip-path:inset(0 ${(1 - e) * 100}% 0 0)`, o: '' };
      case 'push': default: return { n: `transform:translateY(${(1 - e) * 100}%)`, o: `transform:translateY(${-e * 22}%);opacity:${1 - e * .5}` };
    }
  }
  function seek(t) {
    const sc = SB.scenes, dur = SB.meta.duration;
    let cur = sc.length - 1;
    for (let i = 0; i < sc.length; i++) if (t < sc[i].end - 1e-6) { cur = i; break; }
    for (let i = 0; i < sc.length; i++) {
      const s = sc[i], el = els[i]; const isCur = i === cur, tr = (s.transition || 'push'), td = s.tr_duration ?? .35;
      const next = sc[i + 1], inTrNext = next && (t >= next.start && t < next.start + (next.tr_duration ?? .35)) && i === cur - 1;
      let vis = isCur || inTrNext;
      if (i === 0) { /* erste Szene: kein Übergang */ }
      if (!vis) { el.style.display = 'none'; continue; }
      el.style.display = 'block';
      const lt = t - s.start, d = s.end - s.start; let css = 'z-index:' + (isCur ? 2 : 1) + ';';
      if (isCur && i > 0 && lt < td) css += trIn(tr, lt / td).n;
      if (inTrNext) { const nt = next.transition || 'push'; css += trIn(nt, (t - next.start) / (next.tr_duration ?? .35)).o; }
      const fn = SC[s.type]; let html = '';
      try { html = fn ? fn(s.props || s, Math.max(0, lt), d) : `<div class="abs fm-error" style="top:300px;left:60px;color:red;font-size:40px">Unbekannter Szenentyp: ${esc(s.type)}</div>`; } catch (e) { html = `<div class="abs fm-error" style="top:300px;left:40px;color:red;font-size:30px">${esc(s.type)}: ${esc(e.message)}</div>`; }
      el.style.cssText = css + 'display:block;';
      el.innerHTML = html + callouts(s.callouts, Math.max(0, lt));
    }
    document.getElementById('subs').innerHTML = subsHTML(t);
    document.querySelector('#divider i').style.width = (W * clamp(t / dur)) + 'px';
    return true;
  }
  window.FM = { init, seek, SC, C, E };
})();
