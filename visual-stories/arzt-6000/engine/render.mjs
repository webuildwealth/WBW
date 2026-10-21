// Nutzung: node render.mjs preview <out.png> t1,t2,...   |   node render.mjs video <out.mp4> [fps]
import { createRequire } from 'module';
import { spawn, execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const [mode, out, arg] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 960 } });
page.on('pageerror', e => { console.error('PAGEERR', e.message); });
await page.goto(pathToFileURL(path.join(here, 'index.html')).href);
await page.evaluate(() => document.fonts.ready);
const el = await page.$('#c');
if (mode === 'preview') {
  const ts = arg.split(',').map(Number);
  const dir = path.dirname(out); const base = path.basename(out, '.png');
  const files = [];
  for (const t of ts) { await page.evaluate(t => window.render(t), t); const f = `${dir}/${base}_${t.toFixed(2)}.png`; await el.screenshot({ path: f }); files.push(f); }
  // Kontaktbogen
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...files.flatMap(f => ['-i', f]), '-filter_complex',
    `${files.map((_, i) => `[${i}:v]scale=360:-1[s${i}]`).join(';')};${files.map((_, i) => `[s${i}]`).join('')}xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % 3) * 360}_${Math.floor(i / 3) * 320}`).join('|')}`,
    `${dir}/${base}_sheet.png`]);
} else {
  const fps = Number(arg) || 30;
  const total = await page.evaluate(() => window.TOTAL);
  const n = Math.round(total * fps);
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < n; i++) {
    await page.evaluate(t => window.render(t), i / fps);
    const buf = await el.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
}
await browser.close();
