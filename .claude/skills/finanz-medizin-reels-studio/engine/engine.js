/* Zeitgesteuerter Szenen-Renderer: window.__init(timeline), window.__setTime(t) */
(function () {
  const { E, cl, P } = FM;
  let TL = null, scenes = [], capEl, capSpan;
  const OUT = 0.14; // Ausblend-Ueberlappung in Sekunden
  const mood = (s) => (s.mood || (s.type === 'error' ? 'red' : 'blue')) === 'red' ? 1 : 0;

  window.__init = function (tl) {
    TL = tl;
    const q = new URLSearchParams(location.search);
    if (tl.overlay) { document.documentElement.style.background = 'transparent'; document.body.style.background = 'transparent'; document.getElementById('bg').style.display = 'none'; }
    if (tl.brandFooter === false) document.getElementById('brand').style.display = 'none';
    capEl = document.getElementById('cap'); capSpan = capEl.firstElementChild;
    const root = document.getElementById('scenes'); root.innerHTML = '';
    scenes = tl.scenes.map((s) => ({ s, host: null, upd: null }));
    if (q.get('safe')) { const d = document.createElement('div'); d.className = 'safe-debug'; d.style.cssText = 'position:absolute;left:0;top:250px;width:1080px;height:1300px;border:3px dashed #f33;z-index:99'; document.getElementById('root').appendChild(d); }
    return true;
  };

  function mount(o) {
    const host = document.createElement('div'); host.className = 'scene';
    document.getElementById('scenes').appendChild(host);
    const comp = FM.components[o.s.type]; if (!comp) throw new Error('Unbekannter Szenentyp: ' + o.s.type);
    const words = (o.s.words || []).map((w) => ({ w: w.w, t0: w.t0 - o.s.start, t1: w.t1 - o.s.start }));
    o.host = host; o.upd = comp(host, o.s.data || {}, { dur: o.s.dur, words }); host.style.display = 'none';
  }

  function background(t) {
    const g1 = document.getElementById('g1'), g2 = document.getElementById('g2'), g3 = document.getElementById('g3');
    // Stimmung (Blau/Rot) weich zwischen Szenen ueberblenden
    let m = 0;
    for (let i = 0; i < scenes.length; i++) { const s = scenes[i].s; if (t >= s.start) { const prev = i ? mood(scenes[i - 1].s) : mood(s); m = prev + (mood(s) - prev) * E.inOutCubic(cl((t - s.start) / 0.6)); } }
    const bgc = document.getElementById('bg');
    bgc.style.background = `linear-gradient(170deg,var(--navy-800) 0%,var(--navy-900) 55%,var(--navy-950) 100%)`;
    const gl = (el, w, x, y, rgb, a) => { el.style.cssText = `width:${w}px;height:${w}px;left:${x}px;top:${y}px;background:radial-gradient(closest-side,rgba(${rgb},${a}) 0%,rgba(${rgb},${a * 0.55}) 40%,rgba(${rgb},0) 100%)`; };
    gl(g1, 1500, -550 + 60 * Math.sin(t * 0.35), -420 + 50 * Math.cos(t * 0.3), '30,90,136', 0.6 - 0.28 * m);
    gl(g2, 1700, -100 + 70 * Math.cos(t * 0.28), 950 + 60 * Math.sin(t * 0.33), '165,41,59', 0.42 + 0.3 * m);
    gl(g3, 1000, 380 + 40 * Math.sin(t * 0.5), -100 + 40 * Math.cos(t * 0.4), '214,58,80', 0.10 + 0.14 * m);
  }

  function captions(t) {
    const c = (TL.captions || []);
    let cur = null;
    for (let i = 0; i < c.length; i++) { const nxt = c[i + 1]; const end = Math.min(c[i].t1 + 0.12, nxt ? nxt.t0 : 1e9); if (t >= c[i].t0 && t < end) { cur = c[i]; break; } }
    if (!cur) { capSpan.style.opacity = 0; return; }
    if (capSpan.dataset.k !== cur.t0 + cur.text) { capSpan.dataset.k = cur.t0 + cur.text; capSpan.textContent = cur.text; capSpan.className = cur.hi ? 'hi' : ''; }
    const p = P(t, cur.t0, 0.11, E.outBack);
    capSpan.style.opacity = 1; capSpan.style.transform = `scale(${0.88 + 0.12 * p}) translateY(${(1 - p) * 10}px)`;
  }

  window.__setTime = function (t) {
    background(t);
    scenes.forEach((o) => {
      const s = o.s, end = s.start + s.dur, vis = t >= s.start && t < end + OUT;
      if (!vis) { if (o.host) o.host.style.display = 'none'; return; }
      if (!o.host) mount(o);
      o.host.style.display = 'block';
      const lt = t - s.start; o.upd(lt);
      const out = t > end ? E.inOutCubic(cl((t - end) / OUT)) : 0;
      o.host.style.opacity = 1 - out; o.host.style.zIndex = t > end ? 0 : 1;
      const z = 1 + 0.035 * cl(lt / s.dur);
      const pl = s.place || {}; const ps = pl.scale || 1;   // Overlay-Modus: Szene verkleinern/verschieben, damit der Sprecher sichtbar bleibt
      o.host.style.transform = `translateY(${(pl.y || 0) - out * 40}px) scale(${z * ps})`; o.host.style.transformOrigin = pl.origin || '50% 40%';
    });
    const hideCap = scenes.some((o) => o.s.captions === false && t >= o.s.start && t < o.s.start + o.s.dur);
    if (hideCap) capSpan.style.opacity = 0; else captions(t);
    return true;
  };
})();
