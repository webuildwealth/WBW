/* Finanz-Medizin Reels — Talking-Head-Overlays
 * FM.overlays[type](host, data, ctx) -> update(lt)
 * host hat die natuerliche Groesse des Typs (planner.NAT); der Renderer skaliert/positioniert ihn (box.s).
 * Alles ist reine Funktion der lokalen Zeit lt (Sekunden seit Einblendung) -> frame-genau. */
(function () {
  const { E, cl, P } = FM; const { mk, rich, richHTML, svg, setSvg, rev, fmt } = FM.util;
  const O = (FM.overlays = {});
  const SH = 'text-shadow:0 4px 24px rgba(0,0,0,.55),0 2px 4px rgba(0,0,0,.45)';
  const fit = (el, maxW, maxH, min = 20) => { let fs = parseFloat(getComputedStyle(el).fontSize); while ((el.scrollWidth > maxW + 1 || el.scrollHeight > maxH + 1) && fs > min) { fs -= 3; el.style.fontSize = fs + 'px'; } };

  /* ---------- Illustrationen (eigene SVGs, Markenfarben; Teile mit class="p" poppen gestaffelt) ---------- */
  const N = '#0C2C4F', N5 = '#1E5A88', R = '#A5293B', S = '#D63A50', RO = '#E8919E', IV = '#F4F0EF', WH = '#fff';
  const ILL = {
    hourglass: `<g class="p"><rect x="120" y="70" width="160" height="26" rx="10" fill="${N}"/><rect x="120" y="304" width="160" height="26" rx="10" fill="${N}"/></g><g class="p"><path d="M140 96h120c0 70-50 84-50 104s50 34 50 104H140c0-70 50-84 50-104s-50-34-50-104z" fill="${WH}" stroke="${N5}" stroke-width="8"/></g><g class="p"><path d="M160 120h80c-6 30-30 44-40 54-10-10-34-24-40-54z" fill="${RO}"/><path d="M150 296c8-34 30-50 50-56 20 6 42 22 50 56z" fill="${S}"/></g>`,
    shield: `<g class="p"><path d="M200 60l120 44v86c0 80-52 136-120 164-68-28-120-84-120-164v-86z" fill="${R}"/><path d="M200 60l120 44v86c0 80-52 136-120 164z" fill="${S}"/></g><g class="p"><path d="M150 200l36 36 70-80" fill="none" stroke="${WH}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/></g>`,
    tax: `<g class="p"><rect x="110" y="60" width="180" height="250" rx="16" fill="${WH}"/><rect x="140" y="100" width="120" height="14" rx="7" fill="${N5}"/><rect x="140" y="134" width="90" height="14" rx="7" fill="${N5}" opacity=".6"/><rect x="140" y="168" width="110" height="14" rx="7" fill="${N5}" opacity=".6"/></g><g class="p"><circle cx="268" cy="282" r="64" fill="${S}"/><text x="268" y="306" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="72" fill="${WH}">%</text></g>`,
    chart: `<g class="p"><rect x="70" y="310" width="270" height="10" rx="5" fill="${WH}"/></g><g class="p"><rect x="95" y="230" width="44" height="80" rx="8" fill="${N5}"/><rect x="160" y="190" width="44" height="120" rx="8" fill="${N5}"/><rect x="225" y="140" width="44" height="170" rx="8" fill="${N5}"/><rect x="290" y="96" width="44" height="214" rx="8" fill="${N}"/></g><g class="p"><path d="M90 220l70-50 60 30 100-110" fill="none" stroke="${S}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M290 80h46v46" fill="none" stroke="${S}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/></g>`,
    banknote: `<g class="p"><rect x="60" y="120" width="260" height="150" rx="16" fill="${IV}" stroke="${N}" stroke-width="8"/><circle cx="190" cy="195" r="44" fill="none" stroke="${N5}" stroke-width="8"/><text x="190" y="214" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="56" fill="${N}">€</text></g><g class="p"><rect x="230" y="210" width="130" height="78" rx="10" fill="${RO}" stroke="${R}" stroke-width="6"/><text x="295" y="262" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="40" fill="${R}">€</text></g><g class="p"><path d="M330 150v40m-14-14l14 14 14-14" stroke="${S}" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`,
    piggy: `<g class="p"><ellipse cx="200" cy="225" rx="125" ry="95" fill="${RO}"/><circle cx="120" cy="155" r="30" fill="${RO}"/><rect x="110" y="290" width="34" height="50" rx="12" fill="${RO}"/><rect x="250" y="290" width="34" height="50" rx="12" fill="${RO}"/><ellipse cx="320" cy="225" rx="30" ry="34" fill="${S}"/><circle cx="160" cy="200" r="9" fill="${N}"/><rect x="170" y="140" width="70" height="12" rx="6" fill="${R}"/></g><g class="p"><circle cx="205" cy="80" r="40" fill="${IV}" stroke="${N}" stroke-width="8"/><text x="205" y="98" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="48" fill="${N}">€</text></g>`,
    coins: `<g class="p">${[0, 1, 2, 3].map((i) => `<ellipse cx="150" cy="${300 - i * 34}" rx="80" ry="26" fill="${IV}" stroke="${N}" stroke-width="7"/>`).join('')}</g><g class="p">${[0, 1, 2, 3, 4, 5].map((i) => `<ellipse cx="270" cy="${310 - i * 34}" rx="70" ry="23" fill="${RO}" stroke="${R}" stroke-width="7"/>`).join('')}</g><g class="p"><path d="M300 70l20-30 20 30" fill="none" stroke="${S}" stroke-width="12" stroke-linecap="round"/></g>`,
    wallet: `<g class="p"><rect x="90" y="100" width="180" height="90" rx="10" fill="${IV}" stroke="${N5}" stroke-width="6" transform="rotate(-10 180 145)"/></g><g class="p"><rect x="70" y="150" width="270" height="180" rx="26" fill="${N}"/><path d="M250 210h110v70H250a35 35 0 010-70z" fill="${R}"/><circle cx="262" cy="245" r="12" fill="${IV}"/></g>`,
    stethoscope: `<g class="p"><path d="M130 70v90a70 70 0 00140 0V70" fill="none" stroke="${N}" stroke-width="18" stroke-linecap="round"/><circle cx="130" cy="64" r="14" fill="${N5}"/><circle cx="270" cy="64" r="14" fill="${N5}"/></g><g class="p"><path d="M200 230v40a60 60 0 00120 0v-30" fill="none" stroke="${N}" stroke-width="18" stroke-linecap="round"/><circle cx="320" cy="220" r="40" fill="${S}"/><circle cx="320" cy="220" r="16" fill="${IV}"/></g>`,
    house: `<g class="p"><path d="M70 200L200 90l130 110" fill="${S}"/><path d="M60 205L200 85l140 120" fill="none" stroke="${R}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/></g><g class="p"><rect x="100" y="195" width="200" height="140" fill="${IV}"/><rect x="180" y="250" width="44" height="85" rx="6" fill="${N}"/><rect x="120" y="225" width="40" height="40" rx="6" fill="${N5}"/><rect x="240" y="225" width="40" height="40" rx="6" fill="${N5}"/></g>`,
    receipt: `<g class="p"><path d="M110 60h180v270l-22-16-22 16-23-16-23 16-22-16-22 16-23-16-23 16z" fill="${WH}"/><rect x="140" y="100" width="120" height="12" rx="6" fill="${N5}"/><rect x="140" y="132" width="90" height="12" rx="6" fill="${N5}" opacity=".6"/><rect x="140" y="164" width="105" height="12" rx="6" fill="${N5}" opacity=".6"/></g><g class="p"><rect x="140" y="222" width="120" height="44" rx="10" fill="${S}"/></g>`,
    book: `<g class="p"><path d="M200 110c-40-26-90-30-140-20v210c50-10 100-6 140 20z" fill="${IV}"/><path d="M200 110c40-26 90-30 140-20v210c-50-10-100-6-140 20z" fill="${WH}"/><rect x="194" y="108" width="12" height="214" fill="${N}"/></g><g class="p"><path d="M90 140c30-5 60-2 90 10M90 175c30-5 60-2 90 10M90 210c30-5 60-2 90 10M220 150c30-12 60-15 90-10M220 185c30-12 60-15 90-10" stroke="${N5}" stroke-width="8" stroke-linecap="round" fill="none"/></g><g class="p"><path d="M280 90v70l20-14 20 14V90" fill="${S}"/></g>`,
    heart: `<g class="p"><path d="M200 330S70 250 70 160a65 65 0 01130-20 65 65 0 01130 20c0 90-130 170-130 170z" fill="${S}"/></g><g class="p"><path d="M115 150a35 35 0 0140-30" stroke="${WH}" stroke-width="14" fill="none" stroke-linecap="round" opacity=".7"/></g>`,
    compass: `<g class="p"><circle cx="200" cy="200" r="130" fill="${N}"/><circle cx="200" cy="200" r="104" fill="none" stroke="${N5}" stroke-width="8"/></g><g class="p"><path d="M200 90l30 110h-60z" fill="${S}"/><path d="M200 310l-30-110h60z" fill="${IV}"/><circle cx="200" cy="200" r="14" fill="${WH}"/></g>`,
    target: `<g class="p"><circle cx="190" cy="210" r="130" fill="${S}"/><circle cx="190" cy="210" r="94" fill="${WH}"/><circle cx="190" cy="210" r="58" fill="${S}"/><circle cx="190" cy="210" r="22" fill="${WH}"/></g><g class="p"><path d="M195 205L330 70" stroke="${N}" stroke-width="14" stroke-linecap="round"/><path d="M310 60l30 10-10 30" fill="${N}"/></g>`,
    warning: `<g class="p"><path d="M200 60l150 260H50z" fill="${S}" stroke="${R}" stroke-width="10" stroke-linejoin="round"/></g><g class="p"><rect x="186" y="140" width="28" height="100" rx="14" fill="${WH}"/><circle cx="200" cy="280" r="17" fill="${WH}"/></g>`,
    bulb: `<g class="p"><circle cx="200" cy="170" r="105" fill="${RO}" opacity=".35"/><path d="M200 80a80 80 0 00-50 142c14 12 20 26 20 44h60c0-18 6-32 20-44a80 80 0 00-50-142z" fill="${IV}"/></g><g class="p"><path d="M180 266v-50l20 20 20-20v50" fill="none" stroke="${N5}" stroke-width="8" stroke-linejoin="round"/><rect x="168" y="268" width="64" height="20" rx="6" fill="${N}"/><rect x="176" y="294" width="48" height="18" rx="6" fill="${N}"/></g>`,
    scale: `<g class="p"><rect x="190" y="90" width="20" height="230" rx="8" fill="${N}"/><rect x="130" y="314" width="140" height="22" rx="10" fill="${N}"/><rect x="70" y="110" width="260" height="14" rx="7" fill="${N5}"/></g><g class="p"><path d="M70 120l-36 90h72z" fill="none" stroke="${N5}" stroke-width="6"/><path d="M30 210a40 24 0 0080 0z" fill="${IV}"/><path d="M330 120l-36 70h72z" fill="none" stroke="${N5}" stroke-width="6"/><path d="M290 190a40 24 0 0080 0z" fill="${S}"/></g>`,
    calendar: `<g class="p"><rect x="80" y="90" width="240" height="230" rx="24" fill="${WH}"/><path d="M80 114a24 24 0 0124-24h192a24 24 0 0124 24v46H80z" fill="${S}"/><rect x="128" y="66" width="18" height="50" rx="9" fill="${N}"/><rect x="254" y="66" width="18" height="50" rx="9" fill="${N}"/></g><g class="p">${[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<rect x="${112 + c * 48}" y="${186 + r * 40}" width="28" height="24" rx="5" fill="${N5}" opacity=".5"/>`).join('')).join('')}</g><g class="p"><circle cx="300" cy="300" r="46" fill="${N}"/><path d="M280 300l14 14 26-28" fill="none" stroke="${WH}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></g>`,
    clock: `<g class="p"><circle cx="200" cy="200" r="130" fill="${IV}" stroke="${N}" stroke-width="14"/>${[...Array(12)].map((_, i) => `<rect x="196" y="82" width="8" height="${i % 3 ? 14 : 24}" rx="4" fill="${N5}" transform="rotate(${i * 30} 200 200)"/>`).join('')}</g><g class="p"><path d="M200 200V120M200 200l56 34" stroke="${N}" stroke-width="14" stroke-linecap="round"/><circle cx="200" cy="200" r="12" fill="${S}"/></g>`,
  };
  FM.ILLUSTRATIONS = Object.keys(ILL);
  const illSvg = (name, tone) => `<svg viewBox="0 0 400 400" width="100%" height="100%"><circle cx="200" cy="200" r="190" fill="${tone || 'rgba(12,44,79,.88)'}"/><circle cx="200" cy="200" r="190" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="4"/>${ILL[name] || ILL.bulb}</svg>`;
  const popParts = (root, lt, t0 = 0.1, gap = 0.12) => root.querySelectorAll('.p').forEach((g, i) => { const p = P(lt, t0 + i * gap, 0.4, E.outBack); g.style.transformOrigin = '200px 200px'; g.style.transformBox = 'view-box'; g.style.opacity = cl(p * 2); g.style.transform = `scale(${0.6 + 0.4 * p})`; });

  const card = (bg, extra = '') => `border-radius:36px;background:${bg};box-shadow:0 30px 70px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.16);${extra}`;
  const enter = (host, lt, mode = 'up') => { const p = P(lt, 0, 0.45, E.outBackSoft); host.firstChild.style.opacity = cl(p * 2); host.firstChild.style.transform = mode === 'fade' ? `scale(${1.04 - 0.04 * p})` : `translateY(${(1 - p) * 60}px) scale(${0.92 + 0.08 * p})`; return p; };

  /* HOOK: Woerter erscheinen im Sprechtakt; Serif-Kursiv + Akzent fuer Schluesselwoerter (Style DNA R1) */
  O.hook = (host, d) => {
    const box = mk('div'); box.style.cssText = `width:960px;height:300px;display:flex;flex-wrap:wrap;align-content:flex-start;justify-content:center;gap:0 22px;text-align:center;line-height:1.02;${SH}`;
    host.appendChild(box);
    const ws = d.words.map((w) => { const n = mk('span', 'd' + (w.serif ? ' s' : '') + (w.ac ? ' ac' : ''), w.w); n.style.cssText = `font-size:${w.serif ? 128 : 92}px;display:inline-block;${w.serif ? 'font-weight:500' : ''}`; box.appendChild(n); return n; });
    let fs = 1; while (box.scrollHeight > 300 && fs > 0.4) { fs -= 0.06; ws.forEach((n, i) => (n.style.fontSize = (d.words[i].serif ? 128 : 92) * fs + 'px')); }
    const t00 = d.words.length ? d.words[0].t : 0;
    return (lt) => ws.forEach((n, i) => rev(n, P(lt, d.words[i].t - t00 + 0.05, 0.3), { y: 40, b: 10 }));
  };

  /* TITEL oben links + NR-Badge (Referenz: 'Buchempfehlung / NR. 1', danach Titel des Elements) */
  O.title = (host, d) => {
    const w = mk('div'); w.style.cssText = `width:720px;height:170px;display:flex;flex-direction:column;align-items:flex-start;gap:10px;${SH}`;
    const t = mk('div', 'd'); t.style.cssText = 'font-size:78px;white-space:nowrap;letter-spacing:-.045em'; t.textContent = d.label || d.title;
    const b = mk('div', 'badge', 'NR. ' + d.nr); b.style.cssText += ';font-size:34px;box-shadow:0 6px 20px rgba(0,0,0,.35)';
    w.appendChild(t); w.appendChild(b); host.appendChild(w);
    let swapped = false;
    return (lt) => {
      if (!swapped && lt > 1.6 && d.title && d.label && d.title !== d.label) { t.textContent = d.title; t.style.fontSize = '78px'; fit(t, 720, 100, 30); swapped = true; }
      if (swapped && lt <= 1.6) { t.textContent = d.label; t.style.fontSize = '78px'; fit(t, 720, 100, 30); swapped = false; }
      if (lt < 0.05) fit(t, 720, 100, 30);
      const p = P(lt, 0, 0.3, E.outCubic); w.style.opacity = p; w.style.transform = `translateX(${(1 - p) * -30}px)`;
      const pb = P(lt, 0.12, 0.35, E.outBack); b.style.transform = `scale(${pb})`;
    };
  };

  /* PLAKAT: typografisches Cover fuer benannte Dinge (Buch, Gesetz, Produktkategorie) - erscheint hinter der Person */
  const TONES = { red: [`linear-gradient(160deg,${S},${R} 60%,#751524)`, WH, IV], navy: [`linear-gradient(160deg,${N5},${N})`, WH, RO], ivory: [IV, N, R], rose: [`linear-gradient(160deg,#F3B8C1,${RO})`, N, R] };
  O.poster = (host, d) => {
    const [bg, fg, ac] = TONES[d.tone] || TONES.red;
    const c = mk('div'); c.style.cssText = card(bg, `width:500px;height:700px;padding:44px 40px;display:flex;flex-direction:column;justify-content:space-between;color:${fg};border-radius:18px;overflow:hidden;position:relative`);
    c.innerHTML = `<div style="font-family:var(--f-display);font-weight:800;font-size:26px;letter-spacing:.18em;text-transform:uppercase;opacity:.85">${d.kicker || ''}</div>
      <div class="pt" style="font-family:var(--f-serif);font-style:italic;font-weight:500;font-size:96px;line-height:.98;letter-spacing:-.02em;color:${fg}"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end"><div style="width:120px;height:6px;background:${ac};border-radius:3px"></div><div class="pm" style="width:150px;height:150px"></div></div>
      <div style="position:absolute;inset:14px;border:2px solid ${fg};opacity:.18;border-radius:10px;pointer-events:none"></div>`;
    host.appendChild(c); const tt = c.querySelector('.pt'); tt.textContent = d.title; fit(tt, 420, 400, 30);
    c.querySelector('.pm').innerHTML = illSvg(d.motif, 'rgba(255,255,255,.14)');
    return (lt) => { const p = P(lt, 0, 0.3, E.outCubic); c.style.opacity = p; c.style.transform = `scale(${1.03 - 0.03 * p})`; popParts(c, lt, 0.3); };
  };

  O.illus = (host, d) => { const c = mk('div'); c.style.cssText = 'width:520px;height:520px;filter:drop-shadow(0 30px 50px rgba(0,0,0,.45))'; c.innerHTML = illSvg(d.motif); host.appendChild(c);
    return (lt) => { const p = P(lt, 0, 0.5, E.outBack); c.style.opacity = cl(p * 2); c.style.transform = `scale(${0.7 + 0.3 * p}) rotate(${(1 - p) * -8}deg)`; popParts(c, lt, 0.2); }; };

  O.number = (host, d) => {
    const c = mk('div'); c.style.cssText = card('rgba(12,44,79,.92)', 'width:600px;height:360px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:10px;padding:30px');
    c.innerHTML = `<div class="kpi" style="font-size:170px;white-space:nowrap"></div><div class="body" style="font-size:40px;font-weight:700;color:var(--rose);text-align:center"></div>`; host.appendChild(c);
    const kv = c.children[0], kl = c.children[1]; kl.innerHTML = richHTML(d.label || ''); const dec = d.v % 1 ? 1 : 0; const unit = d.unit === '€' ? ' €' : d.unit === '%' ? ' %' : d.unit ? ' ' + d.unit : '';
    kv.textContent = fmt(d.v, dec) + unit; fit(kv, 540, 200, 60);
    return (lt) => { enter(host, lt); kv.textContent = fmt(d.v * P(lt, 0.1, 1.2, E.outCubic), dec) + unit; rev(kl, P(lt, 0.5, 0.4), { y: 16 }); };
  };

  O.ring = (host, d) => {
    const c = mk('div'); c.style.cssText = card('rgba(12,44,79,.92)', 'width:420px;height:470px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px');
    const Rr = 140, ci = 2 * Math.PI * Rr;
    c.innerHTML = `<div style="position:relative;width:320px;height:320px"><svg viewBox="0 0 320 320" style="transform:rotate(-90deg)"><circle cx="160" cy="160" r="${Rr}" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="26"/><circle class="arc" cx="160" cy="160" r="${Rr}" fill="none" stroke="${S}" stroke-width="26" stroke-linecap="round" stroke-dasharray="${ci}" stroke-dashoffset="${ci}"/></svg><div class="kpi" style="position:absolute;inset:0;display:grid;place-items:center;font-size:96px"></div></div><div class="body" style="font-size:34px;font-weight:700;color:var(--rose);text-align:center"></div>`;
    host.appendChild(c); const arc = c.querySelector('.arc'), kv = c.querySelector('.kpi'); c.children[1].innerHTML = richHTML(d.label || '');
    return (lt) => { enter(host, lt); const p = P(lt, 0.15, 1.2, E.outCubic); arc.style.strokeDashoffset = ci * (1 - cl(d.v / 100) * p); kv.textContent = fmt(d.v * p, d.v % 1 ? 1 : 0) + ' %'; };
  };

  O.bars = (host, d) => {
    const c = mk('div'); c.style.cssText = card('rgba(12,44,79,.92)', 'width:560px;height:520px;padding:40px 44px 30px;display:flex;align-items:flex-end;justify-content:space-around;gap:30px');
    host.appendChild(c); const max = Math.max(...d.bars.map((b) => b.v));
    const cols = d.bars.map((b, i) => { const col = mk('div'); col.style.cssText = 'flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:12px';
      col.innerHTML = `<div class="d" style="font-size:46px;white-space:nowrap">${b.label}</div><div style="width:100%;border-radius:18px 18px 6px 6px;background:${i ? `linear-gradient(180deg,${S},${R})` : `linear-gradient(180deg,#fff,${'#D6E1EC'})`};height:0"></div>`; c.appendChild(col); return col; });
    cols.forEach((col) => fit(col.children[0], 220, 60, 22));
    return (lt) => { enter(host, lt); cols.forEach((col, i) => { const p = P(lt, (d.bars[i].at || i * 0.6) + 0.15, 0.7); col.children[1].style.height = (d.bars[i].v / max) * 330 * p + 'px'; col.children[0].style.opacity = cl(p * 3); }); };
  };

  const miniCard = (host, bg, chip, chipStyle, icon, title, fg = '#fff') => {
    const c = mk('div'); c.style.cssText = card(bg, `width:440px;min-height:200px;padding:30px 32px;display:flex;flex-direction:column;gap:18px;color:${fg}`);
    c.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><span class="chip ${chipStyle}" style="font-size:24px;padding:10px 18px">${chip}</span><div class="ico" style="width:70px;height:70px">${svg(icon, 0)}</div></div><div class="d" style="font-size:52px;color:${fg}">${richHTML(title)}</div>`;
    host.appendChild(c); fit(c.children[1], 380, 190, 26); return c;
  };
  O.tip = (host, d) => { const c = miniCard(host, `linear-gradient(160deg,${N5},${N})`, 'Tipp', 'w1', d.icon || 'bulb', d.title);
    return (lt) => { enter(host, lt); setSvg(c.querySelector('svg'), '', P(lt, 0.3, 0.5, E.inOutCubic)); }; };
  O.error = (host, d) => { const c = miniCard(host, `linear-gradient(160deg,${S},${R})`, 'Fehler', 'w1', 'cross', d.title);
    return (lt) => { const p = enter(host, lt); setSvg(c.querySelector('svg'), '', P(lt, 0.25, 0.35)); const sh = lt > 0.3 && lt < 0.55 ? Math.sin((lt - 0.3) * 80) * (0.55 - lt) * 30 : 0; c.style.marginLeft = sh + 'px'; }; };
  O.myth = (host, d) => {
    const c = miniCard(host, IV, 'Mythos', 'r', 'search', '„' + d.claim + '“', N); c.querySelector('.ico').style.background = R;
    const st = mk('div', 'd'); st.style.cssText = `position:absolute;right:20px;bottom:18px;font-size:44px;color:${R};border:7px solid ${R};border-radius:14px;padding:6px 18px;text-transform:uppercase;background:rgba(244,240,239,.85)`; st.textContent = d.verdict || 'Mythos?'; c.appendChild(st);
    return (lt) => { enter(host, lt); const ps = P(lt, 0.9, 0.28, E.outBack); st.style.opacity = lt >= 0.9 ? 1 : 0; st.style.transform = `rotate(-8deg) scale(${2 - ps})`; };
  };

  O.sticker = (host, d) => {
    const c = mk('div'); c.style.cssText = `width:440px;height:130px;display:flex;align-items:center;justify-content:center`;
    const pill = mk('div', 'd', richHTML(d.text)); pill.style.cssText = `font-size:56px;background:#fff;color:${R};padding:20px 34px;border-radius:999px;box-shadow:0 18px 40px rgba(0,0,0,.4);white-space:nowrap;transform-origin:center`;
    c.appendChild(pill); host.appendChild(c); fit(pill, 430, 128, 24);
    return (lt) => { const p = P(lt, 0, 0.35, E.outBack); pill.style.opacity = cl(p * 2); pill.style.transform = `rotate(-5deg) scale(${0.5 + 0.5 * p + 0.02 * Math.sin(lt * 5)})`; };
  };

  O.vs = (host, d) => {
    const c = mk('div'); c.style.cssText = 'width:900px;height:190px;display:flex;align-items:center;justify-content:center;gap:24px';
    const a = mk('div', 'd', d.a), v = mk('div', 'd', 'VS'), b = mk('div', 'd', d.b);
    a.style.cssText = card(N5, 'font-size:60px;padding:28px 40px;border-radius:28px;white-space:nowrap'); b.style.cssText = card(S, 'font-size:60px;padding:28px 40px;border-radius:28px;white-space:nowrap');
    v.style.cssText = `font-size:44px;width:110px;height:110px;border-radius:50%;background:#fff;color:${N};display:grid;place-items:center;flex:none;box-shadow:0 14px 30px rgba(0,0,0,.4)`;
    [a, v, b].forEach((n) => c.appendChild(n)); host.appendChild(c); fit(a, 360, 150, 28); fit(b, 360, 150, 28);
    return (lt) => { const p = P(lt, 0, 0.45, E.outCubic); a.style.transform = `translateX(${(1 - p) * -300}px)`; b.style.transform = `translateX(${(1 - p) * 300}px)`; a.style.opacity = b.style.opacity = p; const pv = P(lt, 0.3, 0.35, E.outBack); v.style.transform = `scale(${pv})`; };
  };

  O.cta = (host, d) => {
    const c = mk('div'); c.style.cssText = card('#fff', `width:640px;height:150px;border-radius:999px;display:flex;align-items:center;gap:22px;padding:0 36px 0 18px;color:${N}`);
    c.innerHTML = `<img src="../assets/img/mark-finanz-medizin.png" style="width:116px;height:116px;border-radius:50%;flex:none"><div class="d" style="font-size:48px;color:${N}">${richHTML(d.text || 'Folgen & speichern')}</div>`;
    host.appendChild(c); fit(c.children[1], 460, 130, 24);
    return (lt) => { const p = enter(host, lt); if (lt > 0.6) c.style.transform = `scale(${1 + 0.02 * Math.sin((lt - 0.6) * 5)})`; };
  };

  O.kinetic = (host, d) => {
    const c = mk('div', 'd s'); c.style.cssText = `width:940px;height:300px;font-size:230px;font-weight:500;line-height:1;text-align:center;white-space:nowrap;color:#fff;${SH};display:flex;align-items:center;justify-content:center`;
    const chars = [...d.text].map((ch) => { const s = mk('span', null, ch === ' ' ? '&nbsp;' : ch); s.style.display = 'inline-block'; c.appendChild(s); return s; }); host.appendChild(c); fit(c, 930, 300, 60);
    return (lt) => chars.forEach((s, i) => rev(s, P(lt, i * 0.035, 0.35), { y: 50, b: 8 }));
  };

  O.image = (host, d) => {
    const c = mk('div'); c.style.cssText = card('#000', 'width:520px;height:650px;border-radius:24px;overflow:hidden;position:relative');
    c.innerHTML = `<img src="${d.src}" style="width:100%;height:100%;object-fit:cover">${d.credit ? `<div style="position:absolute;left:0;right:0;bottom:0;padding:10px 16px;font:500 18px Inter;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.6))">${d.credit}</div>` : ''}`;
    host.appendChild(c); return (lt) => { const p = P(lt, 0, 0.3); c.style.opacity = p; c.style.transform = `scale(${1.03 - 0.03 * p})`; };
  };
  /* WISCH-UEBERGANG: zwei diagonale Markenbalken fegen durchs Bild, kurzer Logo-Blitz (Abschnittswechsel, ~0,42 s) */
  O.wipe = (host, d) => {
    const c = mk('div'); c.style.cssText = 'width:1080px;height:1920px;position:relative;overflow:hidden';
    const col = d.tone === 'navy' ? [N5, N] : [S, R];
    const b1 = mk('div'), b2 = mk('div'), logo = mk('img');
    b1.style.cssText = `position:absolute;left:-400px;top:-300px;width:1900px;height:2600px;background:${col[0]};transform-origin:center`;
    b2.style.cssText = `position:absolute;left:-400px;top:-300px;width:1900px;height:2600px;background:${col[1]};transform-origin:center`;
    logo.src = '../assets/img/mark-finanz-medizin.png'; logo.style.cssText = 'position:absolute;left:440px;top:860px;width:200px;height:200px;border-radius:50%;background:#F4F0EF;padding:12px';
    [b1, b2, logo].forEach((n) => c.appendChild(n)); host.appendChild(c);
    return (lt) => {
      const D = 0.42; const x = (k) => { const p = cl((lt - k) / D); return -2200 + 4400 * E.inOutCubic(p); };
      b1.style.transform = `rotate(-16deg) translateX(${x(0)}px)`; b2.style.transform = `rotate(-16deg) translateX(${x(0.06)}px)`;
      const pl = cl(1 - Math.abs(lt - 0.24) / 0.1); logo.style.opacity = pl; logo.style.transform = `scale(${0.7 + 0.3 * pl})`;
    };
  };

  /* LABEL: kleine Pille mit Icon neben dem Kopf (Meso-Rhythmus, Kontrast zu grossen Elementen) */
  O.lowerthird = (host, d) => {
    const c = mk('div'); c.style.cssText = 'width:520px;height:120px;display:flex;align-items:center';
    const pill = mk('div'); pill.style.cssText = `display:flex;align-items:center;gap:16px;background:${N};color:#fff;border-radius:999px;padding:14px 30px 14px 14px;box-shadow:0 16px 40px rgba(0,0,0,.4);max-width:520px;overflow:hidden;clip-path:inset(0 100% 0 0 round 999px)`;
    pill.innerHTML = `<div class="ico" style="width:72px;height:72px;background:${S};flex:none">${svg(d.icon || 'check', 0)}</div><div class="d" style="font-size:46px;white-space:nowrap;color:#fff">${richHTML(d.text)}</div>`;
    c.appendChild(pill); host.appendChild(c); fit(pill.children[1], 390, 70, 22);
    return (lt) => { const p = P(lt, 0, 0.4, E.outCubic); pill.style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0 round 999px)`; setSvg(pill.querySelector('svg'), '', P(lt, 0.25, 0.35)); };
  };
})();
