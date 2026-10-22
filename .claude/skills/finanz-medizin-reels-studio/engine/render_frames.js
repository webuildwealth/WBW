#!/usr/bin/env node
/* Frame-genaues Rendering: Timeline -> (Playwright/Chromium) -> FFmpeg.
 * node render_frames.js --timeline t.json --out video.mp4 [--workers 4] [--stills 0.5,3.2 --stills-dir dir] [--base raw.mp4]
 * Der Browser wird nur als deterministische Zeichenmaschine genutzt: pro Frame wird __setTime(t) gerufen. */
const fs = require('fs'), path = require('path'), { spawn, spawnSync } = require('child_process');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
function loadPlaywright() {
  const cands = [process.env.PLAYWRIGHT_MODULE, 'playwright', path.join(require('os').homedir(), '.fm-reels/node_modules/playwright'), '/opt/node-tools/node_modules/playwright', '/usr/lib/node_modules/playwright', '/opt/homebrew/lib/node_modules/playwright', path.join(process.cwd(), 'node_modules/playwright')].filter(Boolean);
  for (const c of cands) { try { return require(c); } catch (e) {} }
  console.error('playwright nicht gefunden. Installation: npm i playwright (Chromium: PLAYWRIGHT_BROWSERS_PATH setzen) oder PLAYWRIGHT_MODULE=/pfad/zu/playwright'); process.exit(2);
}
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try { for (const d of fs.readdirSync(base).sort().reverse()) { const p = path.join(base, d, 'chrome-linux', 'chrome'); if (/^chromium-/.test(d) && fs.existsSync(p)) return p; } } catch (e) {}
  return undefined;
}
(async () => {
  const { chromium } = loadPlaywright();
  const tl = JSON.parse(fs.readFileSync(arg('timeline'), 'utf8'));
  const fps = tl.fps || 30, total = Math.ceil(tl.duration * fps);
  const url = 'file://' + path.resolve(__dirname, tl.mode === 'th' ? 'th.html' : 'scene.html'); const LAYER = arg('layer');
  const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox', '--font-render-hinting=none', '--disable-gpu'] });
  const mkPage = async () => { const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 }); const pg = await ctx.newPage(); await pg.goto(url); await pg.evaluate(() => document.fonts.ready); await pg.evaluate((t) => window.__init(t), tl); if (LAYER) await pg.evaluate((l) => window.__setLayer(l), LAYER); await pg.evaluate(() => document.fonts.ready); return pg; };
  const shot = (pg, t, o) => pg.evaluate((tt) => window.__setTime(tt), t).then(() => pg.screenshot(o));

  const stills = arg('stills');
  if (stills) {
    const dir = arg('stills-dir', '.'); fs.mkdirSync(dir, { recursive: true }); const pg = await mkPage();
    for (const s of stills.split(',')) { const t = parseFloat(s); await shot(pg, t, { path: path.join(dir, `still_${t.toFixed(2)}.png`), type: 'png', omitBackground: !!tl.overlay }); }
    await browser.close(); return;
  }
  if (arg('layout-check')) {   // Safe-Zone-/Ueberlauf-Pruefung: Textknoten im Endzustand jeder Szene gegen Instagram-Sicherheitsbereiche
    const pg = await mkPage(); const res = [];
    for (const sc of tl.scenes) {
      const t = sc.start + sc.dur - 0.1;
      const v = await pg.evaluate(([t, caps, type]) => {
        window.__setTime(t); const host = [...document.querySelectorAll('.scene')].find((h) => h.style.display === 'block' && h.style.zIndex === '1'); const bad = [];
        if (!host) return bad; const w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) { const n = w.currentNode; if (!n.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect(); if (!b.width) continue;
          const tx = n.textContent.trim().slice(0, 28); const E = 14;
          if (b.left < 60 - E || b.right > 1020 + E) bad.push(`${tx}: horizontal ausserhalb 60-1020 (${Math.round(b.left)}-${Math.round(b.right)})`);
          if (b.top < 226 - E) bad.push(`${tx}: in oberer Instagram-Zone (y=${Math.round(b.top)})`);
          if (b.bottom > 1236 + E && caps !== false && b.top < 1456) bad.push(`${tx}: kollidiert mit Caption-Zone (bottom=${Math.round(b.bottom)})`);
          if (b.bottom > 1500 + E && !b.top > 1472) bad.push(`${tx}: in unterer Instagram-Zone (bottom=${Math.round(b.bottom)})`);
          if (b.right > 960 && b.bottom > 900 && b.top < 1450 && caps !== false) bad.push(`${tx}: in rechter Button-Zone (right=${Math.round(b.right)})`); }
        return bad; }, [t, sc.captions, sc.type]);
      res.push({ scene: sc.id, issues: [...new Set(v)] });
    }
    fs.writeFileSync(arg('layout-check'), JSON.stringify(res, null, 1)); await browser.close(); return;
  }
  const out = path.resolve(arg('out', 'video.mp4')); const workers = Math.max(1, parseInt(arg('workers', '4')));
  const base = arg('base'); const tmp = out + '.parts'; fs.mkdirSync(tmp, { recursive: true });
  const per = Math.ceil(total / workers), parts = [];
  const t0 = Date.now();
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const a = w * per, b = Math.min(total, a + per); if (a >= b) return;
    const part = path.join(tmp, `p${w}.${LAYER ? 'mov' : 'mp4'}`); parts[w] = part; const pg = await mkPage();
    const ff = ['-y', '-v', 'error'];
    if (base) ff.push('-ss', String(a / fps), '-t', String((b - a) / fps), '-i', base);
    ff.push('-f', 'image2pipe', '-framerate', String(fps), '-c:v', (tl.overlay || LAYER) ? 'png' : 'mjpeg', '-i', '-');
    if (base) ff.push('-filter_complex', '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=' + fps + '[b];[b][1:v]overlay=0:0:format=auto[o]', '-map', '[o]');
    if (LAYER) ff.push('-c:v', 'png', '-pix_fmt', 'rgba', '-r', String(fps), '-an', part);
    else ff.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(fps), '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-an', part);
    const p = spawn('ffmpeg', ff, { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((r) => p.on('close', r));
    for (let f = a; f < b; f++) {
      const buf = await shot(pg, f / fps, (tl.overlay || LAYER) ? { type: 'png', omitBackground: true } : { type: 'jpeg', quality: 95 });
      if (!p.stdin.write(buf)) await new Promise((r) => p.stdin.once('drain', r));
    }
    p.stdin.end(); await done;
  }));
  await browser.close();
  const list = path.join(tmp, 'list.txt'); fs.writeFileSync(list, parts.filter(Boolean).map((p) => `file '${p}'`).join('\n'));
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`gerendert: ${total} Frames in ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });
