#!/usr/bin/env node
/**
 * Offline renderer: steps the sting's timeline by hand in a headless
 * Chromium, pulls each frame off the canvas, and encodes the masters.
 *
 *   node tools/render.mjs                      # full 2s at 1920x1080
 *   node tools/render.mjs --probe=0,0.35,1.5   # just those stills
 *   node tools/render.mjs --size=1280x720 --samples=6
 *
 * Frames are deterministic: the page draws from a pure function of time, so
 * two runs produce identical output.
 */

import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);

const OUT = join(ROOT, argv.out || 'out');
const FRAMES_DIR = join(OUT, 'frames');
const [W, H] = (argv.size || '1920x1080').split('x').map(Number);
const SAMPLES = argv.samples ? Number(argv.samples) : null;
const KEEP = argv.keep === 'true';
const FORMATS = (argv.formats || 'mp4,prores,webm,gif').split(',');

/* ─────────────────────────── static file server ──────────────────────── */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function serve() {
  const server = createServer(async (req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const path = normalize(join(ROOT, url === '/' ? 'sting.html' : url));
    if (!path.startsWith(ROOT)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(path);
      res.writeHead(200, {
        'Content-Type': MIME[extname(path)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/* ──────────────────────────────── ffmpeg ─────────────────────────────── */

async function ffmpegPath() {
  try {
    const mod = await import('ffmpeg-static');
    const p = mod.default || mod;
    if (p && existsSync(p)) return p;
  } catch {
    /* fall through */
  }
  for (const p of ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']) if (existsSync(p)) return p;
  return null;
}

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}\n${err.slice(-2500)}`)),
    );
  });
}

/* ──────────────────────────────── render ─────────────────────────────── */

const pad = (n) => String(n).padStart(4, '0');

async function main() {
  const { chromium } = await import('playwright');
  const { server, port } = await serve();

  await mkdir(FRAMES_DIR, { recursive: true });
  for (const f of await readdir(FRAMES_DIR)) {
    if (f.endsWith('.png')) await rm(join(FRAMES_DIR, f));
  }

  const browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-lcd-text',
      '--force-device-scale-factor=1',
      `--window-size=${W},${H}`,
    ],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.error('  [page error]', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.error(`  [${m.type()}]`, m.text());
  });

  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/sting.html?export=1`, { waitUntil: 'load' });
  await page.waitForFunction('window.STING && window.STING.ready', null, { timeout: 180000 });
  await page.evaluate(() => window.STING.ready);
  const meta = await page.evaluate(() => ({
    duration: window.STING.duration,
    fps: window.STING.fps,
  }));
  console.log(
    `scene ready in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${meta.duration}s @ ${meta.fps}fps, ${W}x${H}`,
  );

  const shoot = async (t, name) => {
    const data = await page.evaluate(([tt, ss]) => window.STING.frame(tt, ss), [t, SAMPLES]);
    await writeFile(join(FRAMES_DIR, name), Buffer.from(data.split(',')[1], 'base64'));
  };

  /* Probe mode: a handful of stills, no encode. */
  if (argv.probe) {
    const times = String(argv.probe).split(',').map(Number);
    for (const t of times) {
      const s = Date.now();
      await shoot(t, `probe-${t.toFixed(3)}.png`);
      console.log(`  probe t=${t.toFixed(3)}s  ${Date.now() - s}ms`);
    }
    await browser.close();
    server.close();
    console.log(`stills in ${FRAMES_DIR}`);
    return;
  }

  const total = Math.round(meta.duration * meta.fps);
  const start = Date.now();
  for (let i = 0; i < total; i++) {
    await shoot(i / meta.fps, `f${pad(i)}.png`);
    if (i % 10 === 0 || i === total - 1) {
      const per = (Date.now() - start) / (i + 1);
      const eta = ((total - i - 1) * per) / 1000;
      process.stdout.write(
        `\r  frame ${i + 1}/${total}  ${per.toFixed(0)}ms/frame  eta ${eta.toFixed(0)}s   `,
      );
    }
  }
  console.log('\nframes done');

  await writeFile(
    join(OUT, 'villadegd-sting-poster.png'),
    await readFile(join(FRAMES_DIR, `f${pad(total - 1)}.png`)),
  );

  await browser.close();
  server.close();

  /* ──────────────────────────── encode ──────────────────────────── */

  const ff = await ffmpegPath();
  if (!ff) {
    console.log('ffmpeg not found — PNG sequence left in out/frames');
    return;
  }

  const seq = join(FRAMES_DIR, 'f%04d.png');
  const input = ['-y', '-framerate', String(meta.fps), '-i', seq];
  const jobs = {
    mp4: [
      ...input,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '15',
      '-pix_fmt', 'yuv420p',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
      '-movflags', '+faststart',
      join(OUT, 'villadegd-sting-1080p.mp4'),
    ],
    prores: [
      ...input,
      '-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le',
      join(OUT, 'villadegd-sting-prores422hq.mov'),
    ],
    webm: [
      ...input,
      '-c:v', 'libvpx-vp9', '-crf', '26', '-b:v', '0', '-row-mt', '1',
      '-pix_fmt', 'yuv420p',
      join(OUT, 'villadegd-sting-1080p.webm'),
    ],
    gif: [
      ...input,
      '-vf',
      'fps=20,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=sierra2_4a',
      '-loop', '0',
      join(OUT, 'villadegd-sting-preview.gif'),
    ],
  };

  for (const name of FORMATS) {
    if (!jobs[name]) continue;
    const s = Date.now();
    process.stdout.write(`  encoding ${name}… `);
    try {
      await run(ff, jobs[name]);
      console.log(`${((Date.now() - s) / 1000).toFixed(1)}s`);
    } catch (e) {
      console.log(`failed\n${e.message}`);
    }
  }

  if (!KEEP) await rm(FRAMES_DIR, { recursive: true, force: true });
  console.log(`\nmasters in ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
