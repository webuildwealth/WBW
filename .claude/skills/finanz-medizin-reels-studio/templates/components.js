/* Finanz-Medizin Reels — Komponentenbibliothek
 * Jede Komponente: FM.components[type](host, data, ctx) -> update(lt)
 *   host : DOM-Knoten der Szene (1080x1920)
 *   data : Szenen-Daten aus dem Storyboard (Elemente mit "at" = Sekunden relativ zum Szenenstart)
 *   ctx  : { dur, words:[{w,t0,t1}] (relativ zum Szenenstart) }
 * update(lt) ist eine REINE Funktion der lokalen Zeit -> Frame-genaues, deterministisches Rendering.
 */
(function () {
  const FM = (window.FM = window.FM || {});
  const E = {
    lin: (t) => t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outBackSoft: (t) => { const c1 = 1.0, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  };
  const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const P = (lt, at, d, e = E.outCubic) => e(cl((lt - at) / d));
  FM.E = E; FM.cl = cl; FM.P = P;

  const mk = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const T = (x) => (x == null ? '' : typeof x === 'string' ? x : x.t || '');
  const A = (x, d) => (x && typeof x === 'object' && x.at != null ? x.at : d);
  const fmt = (v, dec = 0) => v.toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  // Auszeichnung: *Akzent*  _Serif-Kursiv_  ~durchgestrichen~
  function tokens(str) {
    const out = []; let ac = false, s = false, st = false, cur = '';
    const push = () => { if (cur) { out.push({ t: cur, ac, s, st }); cur = ''; } };
    for (const ch of String(str)) {
      if (ch === '*') { push(); ac = !ac; }
      else if (ch === '_') { push(); s = !s; }
      else if (ch === '~') { push(); st = !st; }
      else if (ch === ' ') { push(); out.push({ sp: true }); }
      else cur += ch;
    }
    push(); return out;
  }
  const inner = (k) => mk('span', (k.ac ? 'ac ' : '') + (k.s ? 's ' : '') + (k.st ? 'strike' : ''), k.t);
  // Wort-Einheit = alle Tokens zwischen zwei Leerzeichen (z.B. "*sicher*?") -> kein Umbruch vor Satzzeichen
  function units(str) {
    const out = []; let cur = [];
    tokens(str).forEach((k) => { if (k.sp) { if (cur.length) out.push(cur); cur = []; } else cur.push(k); });
    if (cur.length) out.push(cur); return out;
  }
  const unitSpan = (u) => { const n = mk('span', 'w'); n.style.whiteSpace = 'nowrap'; u.forEach((k) => n.appendChild(inner(k))); if (u.every((k) => k.s)) n.classList.add('s'); return n; };
  function rich(str) { const f = document.createDocumentFragment(); units(str).forEach((u, i) => { if (i) f.appendChild(document.createTextNode(' ')); f.appendChild(unitSpan(u)); }); return f; }
  function richHTML(str) { const d = mk('span'); d.appendChild(rich(str)); return d.innerHTML; }
  function rev(n, p, o = {}) {
    if (p >= 1) { n.style.opacity = 1; n.style.transform = 'none'; n.style.filter = 'none'; return; }
    const y = o.y == null ? 36 : o.y, sc = o.s == null ? 1 : o.s, b = o.b || 0;
    n.style.opacity = cl(p * 1.4);
    n.style.transform = `translateY(${(1 - p) * y}px) scale(${sc + (1 - sc) * p})`;
    n.style.filter = b ? `blur(${(1 - p) * b}px)` : 'none';
  }

  // Icons (24er Raster, Strich)
  const IC = {
    check: 'M5 12.5l4.5 4.5L19 7.5', cross: 'M6 6l12 12M18 6L6 18',
    shield: 'M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6z',
    banknote: 'M3 7h18v10H3z M12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z M6 10v.01 M18 14v.01',
    trend: 'M3 17l6-6 4 4 8-8 M15 7h6v6', trenddown: 'M3 7l6 6 4-4 8 8 M15 17h6v-6',
    clock: 'M12 7v5l3 2 M12 3a9 9 0 100 18 9 9 0 000-18z', doc: 'M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h6',
    alert: 'M12 4l9 16H3z M12 10v4 M12 17v.01', plus: 'M12 5v14M5 12h14',
    coins: 'M12 4c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3z M4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7 M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5',
    lock: 'M6 11h12v9H6z M8 11V8a4 4 0 118 0v3', search: 'M11 4a7 7 0 100 14 7 7 0 000-14z M20 20l-4-4',
  };
  function svg(name, p = 1, cls = '') {
    const d = (IC[name] || IC.check).split(' M').map((s, i) => (i ? 'M' + s : s));
    return `<svg viewBox="0 0 24 24" class="${cls}">${d.map((x) => `<path d="${x}" pathLength="1" style="stroke-dasharray:1;stroke-dashoffset:${1 - p}"/>`).join('')}</svg>`;
  }
  function setSvg(node, name, p) { node.querySelectorAll('path').forEach((x) => (x.style.strokeDashoffset = 1 - p)); }
  const icoBox = (name, extra = '') => { const b = mk('div', 'ico ' + extra, svg(name, 0)); b._n = name; return b; };
  const icoUpd = (b, p) => setSvg(b, b._n, p);

  function header(host, label) {
    if (!label) return null;
    const h = mk('div', 'abs'); h.style.cssText = 'left:120px;top:236px;width:840px;display:flex;align-items:center;gap:20px';
    h.innerHTML = `<div class="d" style="font-size:64px">${richHTML(T(label.t || label.title || ''))}</div>${label.nr ? `<div class="badge" style="font-size:30px">${label.nr}</div>` : ''}`;
    host.appendChild(h); return h;
  }
  const stage = (host, gap) => { const s = mk('div', 'stage'); if (gap != null) s.style.gap = gap + 'px'; host.appendChild(s); return s; };

  FM.util = { mk, T, A, fmt, tokens, units, unitSpan, rich, richHTML, rev, svg, setSvg, IC };
  const C = (FM.components = {});

  /* ---------------- HOOK: Wort-fuer-Wort-Text (Referenz: Mix aus Sans und Serif-Kursiv, Akzentfarbe) --------------- */
  C.hook = (host, d, ctx) => {
    const ring = mk('div', 'abs'); ring.style.cssText = 'left:-260px;top:880px;width:1000px;height:1000px;border-radius:50%;border:70px solid rgba(255,255,255,.05)'; host.appendChild(ring);
    const ring2 = mk('div', 'abs'); ring2.style.cssText = 'left:520px;top:60px;width:700px;height:700px;border-radius:50%;border:50px solid rgba(165,41,59,.22)'; host.appendChild(ring2);
    const s = stage(host, 18); s.style.top = '300px'; s.style.height = '900px'; s.style.alignItems = 'flex-start'; s.style.justifyContent = 'center';
    let kick = null;
    if (d.kicker) { kick = mk('div', 'chip ' + (d.kicker.style || 'r'), richHTML(T(d.kicker))); kick.style.alignSelf = 'flex-start'; s.appendChild(kick); }
    const items = []; // {node,at}
    let idx = 0;
    const flat = [];
    (d.lines || []).forEach((ln) => {
      const row = mk('div', ln.serif ? 'd s' : 'd'); row.style.fontSize = (ln.size || 120) + 'px'; row.style.lineHeight = '1.02'; row.style.whiteSpace = 'nowrap';
      if (ln.serif) row.style.fontWeight = 500;
      units(T(ln)).forEach((u, i) => { if (i) row.appendChild(document.createTextNode(' ')); const w = unitSpan(u); if (ln.serif) w.classList.add('s'); row.appendChild(w); flat.push({ node: w, line: ln }); });
      s.appendChild(row);
      let fs = ln.size || 120; while (row.scrollWidth > 840 && fs > 40) { fs -= 4; row.style.fontSize = fs + 'px'; }
    });
    const nW = flat.length, vo = ctx.words || [];
    flat.forEach((f, i) => {
      let at = A(f.line, null);
      if (at != null) at += i * 0.0;
      else if (vo.length >= nW) at = vo[vo.length - nW + i].t0 - 0.06;
      else if (vo.length) at = vo[Math.round(i * (vo.length - 1) / Math.max(1, nW - 1))].t0 - 0.06;
      else at = 0.15 + i * 0.22;
      f.at = Math.max(0.02, at);
    });
    return (lt) => {
      if (kick) rev(kick, P(lt, 0.02, 0.35, E.outBackSoft), { y: -30, s: 0.85 });
      flat.forEach((f) => rev(f.node, P(lt, f.at, 0.32, E.outCubic), { y: 44, b: 10 }));
      ring.style.transform = `rotate(${lt * 6}deg) scale(${1 + 0.02 * Math.sin(lt * 1.4)})`;
      ring2.style.transform = `rotate(${-lt * 5}deg)`;
    };
  };

  /* ---------------- TIPP: blaues Informationsfeld ---------------- */
  C.tip = (host, d, ctx) => {
    header(host, d.label);
    const s = stage(host); const card = mk('div', 'card blue'); s.appendChild(card);
    const top = mk('div'); top.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:36px';
    const left = mk('div'); left.style.cssText = 'display:flex;gap:16px;align-items:center';
    left.innerHTML = `<span class="chip w1">${T(d.chip) || 'Tipp'}</span>${d.nr ? `<span class="badge">NR. ${d.nr}</span>` : ''}`;
    const ico = icoBox(d.icon || 'check'); top.appendChild(left); top.appendChild(ico); card.appendChild(top);
    const title = mk('div', 'd'); title.style.fontSize = (d.titleSize || 92) + 'px'; title.appendChild(rich(T(d.title))); card.appendChild(title);
    const rule = mk('div', 'rule'); rule.style.cssText = 'margin:34px 0 30px;width:100%;transform-origin:left'; card.appendChild(rule);
    const lines = (d.body || []).map((b) => { const n = mk('div', 'body'); n.style.marginBottom = '16px'; n.appendChild(rich(T(b))); card.appendChild(n); return n; });
    let kp = null;
    if (d.kpi) { kp = mk('div'); kp.style.cssText = 'margin-top:28px;display:flex;align-items:baseline;gap:18px'; kp.innerHTML = `<span class="kpi" style="font-size:150px">${T(d.kpi.value)}</span><span class="body" style="font-size:38px">${T(d.kpi.label)}</span>`; card.appendChild(kp); }
    return (lt) => {
      const pc = P(lt, 0.0, 0.55, E.outBackSoft); card.style.opacity = cl(pc * 2); card.style.transform = `translateY(${(1 - pc) * 180}px) scale(${0.94 + 0.06 * pc})`;
      icoUpd(ico, P(lt, 0.3, 0.7, E.inOutCubic));
      rule.style.transform = `scaleX(${P(lt, 0.35, 0.6, E.outExpo)})`;
      title.style.opacity = P(lt, 0.15, 0.3); title.style.transform = `translateY(${(1 - P(lt, 0.15, 0.45)) * 30}px)`;
      lines.forEach((n, i) => rev(n, P(lt, A(d.body[i], 0.7 + i * 0.35), 0.4), { y: 24 }));
      if (kp) rev(kp, P(lt, A(d.kpi, 1.2), 0.5, E.outBackSoft), { y: 40, s: 0.9 });
    };
  };

  /* ---------------- FEHLER: rote Fehlerkarte -> Folge -> bessere Alternative ---------------- */
  C.error = (host, d, ctx) => {
    header(host, d.label);
    const s = stage(host, 22);
    const card = mk('div', 'card red'); card.style.padding = '48px 52px 52px'; s.appendChild(card);
    const top = mk('div'); top.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:30px';
    top.innerHTML = `<div style="display:flex;gap:16px;align-items:center"><span class="chip w1" style="color:var(--red-700)">${T(d.chip) || 'Fehler'}</span>${d.nr ? `<span class="badge" style="color:var(--red-700)">NR. ${d.nr}</span>` : ''}</div>`;
    const ico = icoBox('cross'); top.appendChild(ico); card.appendChild(top);
    const st = mk('div', 'd'); st.style.fontSize = (d.titleSize || 78) + 'px'; st.appendChild(rich(T(d.title))); card.appendChild(st);
    const cost = mk('div'); cost.style.cssText = 'margin-top:34px;background:rgba(0,0,0,.26);border-radius:28px;padding:30px 34px;display:flex;align-items:center;gap:26px';
    cost.innerHTML = `<div class="ico" style="background:rgba(255,255,255,.16);flex:none">${svg('alert', 1)}</div><div><div class="body" style="font-size:30px;opacity:.8;letter-spacing:.06em;text-transform:uppercase;font-weight:700">${T(d.costLabel) || 'Die Folge'}</div><div class="d" style="font-size:52px;margin-top:6px">${richHTML(T(d.cost))}</div></div>`;
    card.appendChild(cost);
    const fix = mk('div', 'card white on-light'); fix.style.cssText = 'padding:34px 40px;display:flex;align-items:center;gap:28px;border-radius:36px'; fix.innerHTML = `<div class="ico" style="background:var(--navy-800);flex:none">${svg('check', 1)}</div><div><div class="body" style="font-size:28px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--navy-500)">${T(d.fixLabel) || 'Besser'}</div><div class="d" style="font-size:46px;margin-top:6px;color:var(--navy-900)">${richHTML(T(d.fix))}</div></div>`;
    s.appendChild(fix);
    return (lt) => {
      const pc = P(lt, 0, 0.5, E.outBackSoft); card.style.opacity = cl(pc * 2); card.style.transform = `translateY(${(1 - pc) * 160}px)`;
      const sh = lt > 0.35 && lt < 0.6 ? Math.sin((lt - 0.35) * 90) * (0.6 - lt) * 22 : 0; card.style.marginLeft = sh + 'px';
      icoUpd(ico, P(lt, 0.25, 0.4));
      const pcst = P(lt, 0.1, 0.4); st.style.opacity = pcst;
      rev(cost, P(lt, A(d.cost, 1.2), 0.45), { y: 30 });
      rev(fix, P(lt, A(d.fix, 2.4), 0.5, E.outBackSoft), { y: 90, s: 0.96 });
    };
  };

  /* ---------------- MYTHOS -> pruefen -> Stempel -> FAKT-Karte (Flip) ---------------- */
  C.myth = (host, d, ctx) => {
    header(host, d.label);
    const s = stage(host); const wrap = mk('div'); wrap.style.cssText = 'position:relative;width:100%;height:' + (d.height || 700) + 'px;perspective:2200px'; s.appendChild(wrap);
    const face = (cls) => { const f = mk('div', 'card ' + cls); f.style.cssText += ';position:absolute;inset:0;backface-visibility:hidden;display:flex;flex-direction:column;justify-content:center;gap:26px'; wrap.appendChild(f); return f; };
    const front = face('white on-light'), back = face('blue');
    front.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><span class="chip r">Mythos</span><div class="ico" style="background:var(--red-500)">${svg('search', 1)}</div></div>`;
    const claim = mk('div', 'd'); claim.style.cssText = `font-size:${d.claimSize || 100}px;color:var(--navy-900)`; claim.appendChild(rich('„' + T(d.claim) + '“')); front.appendChild(claim);
    const scan = mk('div', 'abs'); scan.style.cssText = 'left:0;right:0;height:10px;background:linear-gradient(90deg,transparent,var(--signal),transparent);opacity:0;border-radius:6px;box-shadow:0 0 40px 8px rgba(214,58,80,.5)'; front.appendChild(scan);
    const stamp = mk('div', 'abs d'); const vv = d.verdict || { t: 'Geprüft' };
    stamp.style.cssText = 'right:40px;bottom:46px;font-size:56px;color:var(--red-600);border:9px solid var(--red-600);border-radius:20px;padding:12px 26px;letter-spacing:.02em;text-transform:uppercase;transform-origin:center;background:rgba(244,240,239,.6)';
    stamp.textContent = T(vv); front.appendChild(stamp);
    back.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><span class="chip w1">Fakt</span><div class="ico">${svg('check', 1)}</div></div>`;
    const fact = mk('div', 'd'); fact.style.fontSize = (d.factSize || 88) + 'px'; fact.appendChild(rich(T(d.factText || d.fact))); back.appendChild(fact);
    const pts = (d.points || []).map((p) => { const n = mk('div', 'body'); n.style.cssText = 'display:flex;gap:16px;align-items:flex-start;font-size:44px'; n.innerHTML = `<span style="flex:none;color:var(--rose);font-weight:800">→</span><span>${richHTML(T(p))}</span>`; back.appendChild(n); return n; });
    return (lt) => {
      const pc = P(lt, 0, 0.5, E.outBackSoft); wrap.style.opacity = cl(pc * 2);
      const tf = A(d.fact, 99), flip = P(lt, tf, 0.55, E.inOutCubic);
      wrap.style.transform = `translateY(${(1 - pc) * 160}px) scale(${0.96 + 0.04 * pc})`;
      front.style.transform = `rotateY(${-180 * flip}deg)`; back.style.transform = `rotateY(${180 - 180 * flip}deg)`;
      const tc = A(d.check, 99), sp = cl((lt - tc) / (A(vv, tc + 1.2) - tc || 1));
      scan.style.opacity = lt > tc && lt < A(vv, 99) ? 1 : 0; scan.style.top = (cl((lt - tc) / 0.9) % 1) * 90 + '%';
      const ts = A(vv, 99), ps = P(lt, ts, 0.28, E.outBack); stamp.style.opacity = lt >= ts ? 1 : 0; stamp.style.transform = `rotate(-8deg) scale(${lt >= ts ? 2 - ps : 2})`;
      const hit = lt > ts + 0.2 && lt < ts + 0.45 ? Math.sin((lt - ts - 0.2) * 70) * 8 : 0; front.style.marginLeft = hit + 'px';
      pts.forEach((n, i) => rev(n, P(lt, A(d.points[i], tf + 0.7 + i * 0.35), 0.4), { y: 20 }));
      rev(fact, P(lt, tf + 0.35, 0.4), { y: 20 });
    };
  };

  /* ---------------- FAKT: Aussage + Quelle ---------------- */
  C.fact = (host, d, ctx) => {
    header(host, d.label);
    const s = stage(host); const card = mk('div', 'card ' + (d.style || 'blue')); card.style.cssText += ';display:flex;flex-direction:column;gap:30px'; s.appendChild(card);
    card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><span class="chip ${d.style === 'red' ? 'w1' : 'w1'}">${T(d.chip) || 'Fakt'}</span><div class="ico">${svg(d.icon || 'check', 1)}</div></div>`;
    const big = mk('div', 'd'); big.style.fontSize = (d.size || 92) + 'px'; big.appendChild(rich(T(d.title))); card.appendChild(big);
    const sub = d.sub ? mk('div', 'body', richHTML(T(d.sub))) : null; if (sub) card.appendChild(sub);
    const src = d.source ? mk('div', 'body', 'Quelle: ' + T(d.source)) : null; if (src) { src.style.cssText += ';font-size:26px;opacity:.7;margin-top:6px'; card.appendChild(src); }
    return (lt) => {
      const pc = P(lt, 0, 0.5, E.outBackSoft); card.style.opacity = cl(pc * 2); card.style.transform = `translateY(${(1 - pc) * 160}px) scale(${0.95 + 0.05 * pc})`;
      rev(big, P(lt, 0.2, 0.45), { y: 30 });
      if (sub) rev(sub, P(lt, A(d.sub, 0.9), 0.4), { y: 20 });
      if (src) rev(src, P(lt, A(d.source, 1.4), 0.4), { y: 10 });
    };
  };

  /* ---------------- ZAHL: Count-up mit Ring ---------------- */
  C.stat = (host, d, ctx) => {
    header(host, d.label);
    const s = stage(host); s.style.alignItems = 'center'; s.style.textAlign = 'center';
    const lab = mk('div', 'chip b', T(d.chip) || 'Rechenbeispiel'); s.appendChild(lab);
    const box = mk('div'); box.style.cssText = 'position:relative;width:700px;height:700px;display:grid;place-items:center'; s.appendChild(box);
    const R = 320, circ = 2 * Math.PI * R;
    box.innerHTML = `<svg viewBox="0 0 700 700" style="position:absolute;inset:0;transform:rotate(-90deg)"><circle cx="350" cy="350" r="${R}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="34"/><circle id="arc" cx="350" cy="350" r="${R}" fill="none" stroke="var(--signal)" stroke-width="34" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="0"/></svg>`;
    const arc = box.querySelector('#arc');
    const num = mk('div'); num.style.cssText = 'position:relative;text-align:center'; num.innerHTML = '<div class="kpi" style="font-size:250px"></div><div class="body" style="font-size:42px;margin-top:10px"></div>'; box.appendChild(num);
    const kv = num.children[0], kl = num.children[1]; kl.innerHTML = richHTML(T(d.caption));
    const sub = d.sub ? mk('div', 'd', richHTML(T(d.sub))) : null; if (sub) { sub.style.fontSize = '48px'; s.appendChild(sub); }
    const from = d.from, to = d.to, dec = d.decimals || 0, unit = d.unit || '', max = d.max || Math.max(from, to);
    const nlen = Math.max((d.prefix || '').length + fmt(from, dec).length, (d.prefix || '').length + fmt(to, dec).length) + unit.length; kv.style.fontSize = Math.min(250, Math.floor(1300 / nlen)) + 'px';
    return (lt) => {
      const at = A(d, 0.4), dur = d.countDur || 1.6, p = P(lt, at, dur, E.outCubic);
      const v = from + (to - from) * p; kv.textContent = (d.prefix || '') + fmt(v, dec) + unit;
      arc.style.strokeDashoffset = circ * (1 - cl(v / max)) * 1; arc.style.stroke = v < from ? 'var(--signal)' : 'var(--navy-300)';
      const pb = P(lt, 0, 0.5, E.outBackSoft); box.style.opacity = cl(pb * 2); box.style.transform = `scale(${0.9 + 0.1 * pb})`; lab.style.opacity = pb;
      if (sub) rev(sub, P(lt, at + dur * 0.8, 0.45), { y: 24 });
    };
  };

  /* ---------------- BALKEN: wachsende / schrumpfende Werte ---------------- */
  C.bars = (host, d, ctx) => {
    header(host, d.label);
    const s = stage(host, 18);
    const ttl = mk('div', 'd', richHTML(T(d.title))); ttl.style.fontSize = (d.titleSize || 62) + 'px'; s.appendChild(ttl);
    const H = 560, area = mk('div'); area.style.cssText = `position:relative;height:${H + 110}px;display:flex;align-items:flex-end;justify-content:space-between;gap:22px;padding-top:70px`; s.appendChild(area);
    const max = d.max || Math.max(...d.bars.map((b) => b.value));
    const base = mk('div', 'abs'); base.style.cssText = 'left:0;right:0;bottom:62px;height:4px;background:rgba(255,255,255,.35);border-radius:2px;transform-origin:left'; area.appendChild(base);
    const ref = d.refLine !== false ? mk('div', 'abs') : null;
    if (ref) { ref.style.cssText = `left:0;right:0;bottom:${62 + H}px;border-top:4px dashed rgba(255,255,255,.28)`; area.appendChild(ref); }
    const cols = d.bars.map((b, i) => {
      const c = mk('div'); c.style.cssText = 'position:relative;flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center';
      const col = i === 0 ? 'linear-gradient(180deg,#fff,var(--navy-100))' : `linear-gradient(180deg,var(--signal),var(--red-700))`;
      c.innerHTML = `<div class="d val" style="font-size:${d.valSize || 54}px;margin-bottom:12px;white-space:nowrap"></div><div class="bar" style="width:100%;height:0;border-radius:22px 22px 8px 8px;background:${col};box-shadow:0 20px 50px rgba(0,0,0,.3)"></div><div class="body" style="height:62px;display:flex;align-items:center;font-size:34px;font-weight:700;white-space:nowrap">${T(b.label)}</div>`;
      area.appendChild(c); return { c, val: c.children[0], bar: c.children[1], b };
    });
    const dl = d.delta ? mk('div', 'chip r', T(d.delta)) : null; if (dl) { dl.style.cssText += ';position:absolute;right:0;top:-6px;font-size:40px;padding:16px 28px'; area.appendChild(dl); }
    const note = d.note ? mk('div', 'body', richHTML(T(d.note))) : null; if (note) { note.style.cssText += ';font-size:30px;opacity:.75'; s.appendChild(note); }
    return (lt) => {
      rev(ttl, P(lt, 0, 0.4), { y: 24 });
      base.style.transform = `scaleX(${P(lt, 0.1, 0.5, E.outExpo)})`; if (ref) ref.style.opacity = P(lt, 0.3, 0.4);
      cols.forEach((o, i) => {
        const at = A(o.b, 0.5 + i * 0.5), p = P(lt, at, 0.7, E.outCubic), v = o.b.value;
        o.bar.style.height = (v / max) * H * p + 'px';
        o.val.textContent = fmt(v * p, d.decimals || 0) + (d.unit || ''); o.val.style.opacity = cl(p * 3);
        o.val.style.transform = `translateY(${(1 - p) * 10}px)`;
      });
      if (dl) rev(dl, P(lt, A(d.delta, 3), 0.4, E.outBack), { y: -20, s: 0.7 });
      if (note) rev(note, P(lt, A(d.note, 3.4), 0.4), { y: 14 });
    };
  };

  /* ---------------- VERGLEICH: Tabelle A vs. B ---------------- */
  C.compare = (host, d, ctx) => {
    header(host, d.label);
    const s = stage(host, 16);
    const hd = mk('div'); hd.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:18px';
    hd.innerHTML = `<div class="card blue" style="padding:30px;border-radius:30px;text-align:center"><div class="d" style="font-size:54px">${richHTML(T(d.a))}</div></div><div class="card red" style="padding:30px;border-radius:30px;text-align:center"><div class="d" style="font-size:54px">${richHTML(T(d.b))}</div></div>`; s.appendChild(hd);
    const rows = d.rows.map((r) => {
      const n = mk('div'); n.style.cssText = 'background:rgba(255,255,255,.08);border-radius:28px;padding:22px 26px;border:1px solid rgba(255,255,255,.12)';
      n.innerHTML = `<div class="body" style="font-size:26px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;opacity:.7;text-align:center;margin-bottom:10px">${T(r.label)}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;text-align:center"><div class="d" style="font-size:${r.size || 46}px;${r.win === 'a' ? 'color:#fff' : 'opacity:.8'}">${richHTML(T(r.a))}</div><div class="d" style="font-size:${r.size || 46}px;${r.win === 'b' ? 'color:#fff' : 'opacity:.8'}">${richHTML(T(r.b))}</div></div>`;
      s.appendChild(n); return n;
    });
    return (lt) => {
      rev(hd, P(lt, 0, 0.5, E.outBackSoft), { y: 80, s: 0.96 });
      rows.forEach((n, i) => rev(n, P(lt, A(d.rows[i], 0.8 + i * 0.6), 0.45), { y: 40 }));
    };
  };

  /* ---------------- CHECKLISTE: Haken zeichnen sich ---------------- */
  C.checklist = (host, d, ctx) => {
    header(host, d.label);
    const s = stage(host, 20);
    const ttl = mk('div', 'd', richHTML(T(d.title))); ttl.style.fontSize = '66px'; ttl.style.marginBottom = '10px'; s.appendChild(ttl);
    const items = d.items.map((it) => {
      const n = mk('div'); n.style.cssText = 'display:flex;gap:28px;align-items:center;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.14);border-radius:30px;padding:26px 30px';
      n.innerHTML = `<div class="ico" style="background:var(--navy-500);flex:none;width:86px;height:86px">${svg('check', 0)}</div><div><div class="d" style="font-size:48px">${richHTML(T(it))}</div>${it.sub ? `<div class="body" style="font-size:30px;margin-top:6px;opacity:.75">${T(it.sub)}</div>` : ''}</div>`;
      s.appendChild(n); return n;
    });
    return (lt) => {
      rev(ttl, P(lt, 0, 0.4), { y: 20 });
      items.forEach((n, i) => { const at = A(d.items[i], 0.6 + i * 0.7); rev(n, P(lt, at - 0.1, 0.4), { y: 40 }); const p = P(lt, at + 0.15, 0.35, E.inOutCubic); setSvg(n.querySelector('svg'), 'check', p); n.firstChild.style.transform = `scale(${1 + 0.18 * Math.sin(Math.PI * cl((lt - at - 0.15) / 0.3))})`; });
    };
  };

  /* ---------------- OUTRO / CTA ---------------- */
  C.outro = (host, d, ctx) => {
    const s = stage(host, 28); s.style.alignItems = 'center'; s.style.textAlign = 'center'; s.style.top = '270px';
    const logo = mk('div'); logo.style.cssText = 'width:230px;height:230px;border-radius:50%;background:var(--ivory);display:grid;place-items:center;box-shadow:0 30px 80px rgba(0,0,0,.4)'; logo.innerHTML = '<img src="../assets/img/mark-finanz-medizin.png" style="width:196px;height:196px;border-radius:50%">'; s.appendChild(logo);
    const hl = mk('div', 'd', richHTML(T(d.headline))); hl.style.fontSize = (d.size || 88) + 'px'; s.appendChild(hl);
    const sub = d.sub ? mk('div', 'body', richHTML(T(d.sub))) : null; if (sub) { sub.style.fontSize = '42px'; s.appendChild(sub); }
    const cta = d.cta ? mk('div', 'chip w1', T(d.cta)) : null; if (cta) { cta.style.cssText += ';font-size:38px;letter-spacing:.02em;text-transform:none;padding:24px 44px;border-radius:999px'; s.appendChild(cta); }
    const dis = d.disclaimer ? mk('div', 'abs body', T(d.disclaimer)) : null; if (dis) { dis.style.cssText = 'left:120px;width:840px;top:1262px;font-size:30px;line-height:1.35;opacity:.75;text-align:center'; host.appendChild(dis); }
    return (lt) => {
      const p = P(lt, 0, 0.6, E.outBack); logo.style.transform = `scale(${0.4 + 0.6 * p})`; logo.style.opacity = cl(p * 2);
      rev(hl, P(lt, 0.25, 0.5), { y: 40, b: 8 });
      if (sub) rev(sub, P(lt, A(d.sub, 0.8), 0.45), { y: 24 });
      if (cta) { const pc = P(lt, A(d.cta, 1.3), 0.5, E.outBack); rev(cta, pc, { y: 30, s: 0.8 }); if (lt > A(d.cta, 1.3) + 0.6) cta.style.transform = `scale(${1 + 0.025 * Math.sin((lt - 1.9) * 5)})`; }
      if (dis) dis.style.opacity = 0.8 * P(lt, 1.6, 0.6);
    };
  };
})();
