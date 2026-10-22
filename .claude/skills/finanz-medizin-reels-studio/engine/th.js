/* Talking-Head-Renderer: zwei transparente Ebenen ("back" = hinter der freigestellten Person, "front" = davor + Untertitel).
 * window.__init(timeline), window.__setLayer('back'|'front'), window.__setTime(t) */
(function () {
  const { E, cl, P } = FM;
  let TL = null, LAYER = 'front', items = [], capSpan;
  const OUT = 0.25;
  window.__init = function (tl) {
    TL = tl; capSpan = document.querySelector('#cap span'); if (tl.theme === 'light') document.body.classList.add('light-bg');
    items = tl.overlays.map((o) => ({ o, host: null, upd: null }));
    if (new URLSearchParams(location.search).get('debug')) document.body.style.background = '#556';
    return true;
  };
  window.__setLayer = (l) => { LAYER = l; return true; };
  function mount(it) {
    const o = it.o, h = document.createElement('div'); h.className = 'ovl'; document.getElementById('ovl').appendChild(h);
    const comp = FM.overlays[o.type]; if (!comp) throw new Error('Unbekannter Overlay-Typ ' + o.type);
    it.host = h; it.upd = comp(h, o.data || {}, { dur: o.t1 - o.t0 }); h.style.display = 'none';
  }
  window.__setTime = function (t) {
    items.forEach((it) => {
      const o = it.o, vis = o.layer === LAYER && t >= o.t0 && t < o.t1 + OUT;
      if (!vis) { if (it.host) it.host.style.display = 'none'; return; }
      if (!it.host) mount(it);
      it.host.style.display = 'block'; it.upd(t - o.t0);
      const out = t > o.t1 ? E.inOutCubic(cl((t - o.t1) / OUT)) : 0, b = o.box;
      it.host.style.opacity = 1 - out;
      it.host.style.transform = `translate(${b.x}px,${b.y + out * 20}px) scale(${b.s * (1 - 0.04 * out)})`;
    });
    // Untertitel nur in der Vorder-Ebene, nicht waehrend des Hooks (Style DNA R2)
    const ctaOn = TL.overlays.some((o) => o.type === 'ctaword' && t >= o.t0 && t < o.t1 + 0.3);
    if (LAYER !== 'front' || t < (TL.hookEnd || 0) || ctaOn) { capSpan.style.opacity = 0; return true; }
    const c = TL.captions; let cur = null;
    for (let i = 0; i < c.length; i++) { const nx = c[i + 1]; const end = Math.min(c[i].t1 + 0.12, nx ? nx.t0 : 1e9); if (t >= c[i].t0 && t < end) { cur = c[i]; break; } }
    if (!cur) { capSpan.style.opacity = 0; return true; }
    if (capSpan.dataset.k !== cur.t0 + cur.text) { capSpan.dataset.k = cur.t0 + cur.text; capSpan.textContent = cur.text; capSpan.className = cur.hi ? 'hi' : ''; }
    const p = P(t, cur.t0, cur.hi ? 0.16 : 0.11, E.outBack), big = cur.hi ? 1.14 : 1;   // Schluesselwort: groesser, farbig, staerkerer Pop
    capSpan.style.opacity = 1; capSpan.style.transform = `scale(${(0.88 + 0.12 * p) * big}) translateY(${(1 - p) * 10}px) rotate(${cur.hi ? (1 - p) * -4 : 0}deg)`;
    return true;
  };
})();
