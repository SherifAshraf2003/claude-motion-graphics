// Frame-exact renderer: drives window.render(t) in headless Chromium, pipes
// every frame into ffmpeg, and muxes the generated soundtrack.
//
//   node scripts/render.mjs                    -> output/manasetak-promo.mp4
//   node scripts/render.mjs --stills 1,3.5,9   -> output/stills/*.png (quick checks)
//   node scripts/render.mjs --fps 30           -> lower fps for fast drafts
//   node scripts/render.mjs --audio-only       -> swap the soundtrack into the existing video (no re-render)
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const FPS = Number(arg('--fps', 60));
const stills = arg('--stills');
const out = path.join(root, arg('--out', 'output/manasetak-promo.mp4'));
const audio = path.join(root, 'output/soundtrack.wav');
// loudness-normalise to the usual social-video target, with a true-peak ceiling
const AUDIO_OUT = ['-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '256k'];

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { return execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim(); } catch { return 'ffmpeg'; }
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/src/index.html?render=1`;

const browser = await chromium.launch({ args: ['--disable-web-security', '--font-render-hinting=none', '--force-color-profile=srgb'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', e => { console.error('page error:', e); process.exitCode = 1; });
await page.goto(url);
await page.evaluate(() => window.ready);
const duration = await page.evaluate(() => window.DURATION);
const frame = async t => { await page.evaluate(t => window.render(t), t); return page.screenshot({ type: 'png' }); };

if (args.includes('--audio-only')) {
  const tmp = out.replace(/\.mp4$/, '.tmp.mp4');
  execFileSync(ffmpegPath(), ['-y', '-loglevel', 'error', '-i', out, '-i', audio, '-map', '0:v', '-map', '1:a',
    '-c:v', 'copy', ...AUDIO_OUT, '-shortest', '-movflags', '+faststart', tmp]);
  fs.renameSync(tmp, out);
  console.log(`swapped soundtrack into ${path.relative(root, out)}`);
} else if (args.includes('--cues')) {
  const cues = await page.evaluate(() => window.getCues());
  fs.mkdirSync(path.join(root, 'output'), { recursive: true });
  fs.writeFileSync(path.join(root, 'output/cues.json'), JSON.stringify(cues, null, 2));
  console.log('wrote output/cues.json');
} else if (stills) {
  const dir = path.join(root, 'output/stills'); fs.mkdirSync(dir, { recursive: true });
  for (const s of stills.split(',').map(Number)) {
    fs.writeFileSync(path.join(dir, `t${s.toFixed(2).padStart(5, '0')}.png`), await frame(s));
    console.log('still', s);
  }
} else {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const hasAudio = fs.existsSync(audio);
  const ff = spawn(ffmpegPath(), [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    ...(hasAudio ? ['-i', audio] : []),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    ...(hasAudio ? [...AUDIO_OUT, '-shortest'] : []),
    '-movflags', '+faststart', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = Math.round(duration * FPS);
  const t0 = Date.now();
  for (let f = 0; f < total; f++) {
    const buf = await frame(f / FPS);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % FPS === 0) process.stdout.write(`\rframe ${f}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', c => (c === 0 ? r() : j(new Error('ffmpeg exit ' + c)))));
  console.log(`\nwrote ${path.relative(root, out)} (${hasAudio ? 'with' : 'no'} audio)`);
}
await browser.close();
server.close();
