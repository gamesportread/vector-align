#!/usr/bin/env node
/**
 * Automatic screenshot demo video for the NASA Space Apps submission.
 *
 *   npm run build && npm run demo:video
 *
 * Starts `vite preview` on the built dist/, drives the four missions through
 * their built-in autopilot demos with Playwright, captures timed screenshots,
 * overlays short captions (injected only into the captured page, never into
 * the app), then assembles a <=30 s 1920x1080 H.264 MP4 with ffmpeg.
 *
 * Output: demo/vector-align-demo.mp4 (+ frames in demo/frames/).
 * Requires ffmpeg on PATH (brew install ffmpeg).
 */
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT_DIR = path.join(ROOT, 'demo');
const FRAME_DIR = path.join(OUT_DIR, 'frames');
const OUT_FILE = path.join(OUT_DIR, 'vector-align-demo.mp4');
const PORT = 4179;
const FPS = 30;
const MAX_SECONDS = 29.5;
const HEADED = process.argv.includes('--headed');

rmSync(FRAME_DIR, { recursive: true, force: true });
mkdirSync(FRAME_DIR, { recursive: true });

/** Each captured frame keeps how long it should be shown in the final video. */
const frames = [];
let frameNo = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setCaption(page, title, sub = '') {
  await page.evaluate(
    ([title, sub]) => {
      let el = document.getElementById('__demo_caption');
      if (!el) {
        el = document.createElement('div');
        el.id = '__demo_caption';
        el.style.cssText = [
          'position:fixed', 'left:50%', 'bottom:56px', 'transform:translateX(-50%)', 'z-index:2147483647',
          'pointer-events:none', 'padding:14px 30px', 'border-radius:14px', 'text-align:center',
          'background:rgba(6,12,32,0.78)', 'border:1px solid rgba(120,170,255,0.45)',
          'box-shadow:0 10px 40px rgba(0,0,0,0.45)', 'backdrop-filter:blur(6px)',
          'font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif', 'color:#fff', 'max-width:80vw',
        ].join(';');
        document.body.appendChild(el);
      }
      el.innerHTML =
        `<div style="font-size:30px;font-weight:800;letter-spacing:0.02em">${title}</div>` +
        (sub ? `<div style="font-size:19px;opacity:0.85;margin-top:4px">${sub}</div>` : '');
      el.style.display = title ? 'block' : 'none';
    },
    [title, sub],
  );
}

/**
 * Screenshot as fast as possible for `wallSec` of real time and squeeze the
 * result into `videoSec` of video, keeping each frame's real spacing so the
 * motion reads as a smooth time-lapse.
 */
async function capture(page, wallSec, videoSec, stopWhen) {
  const shots = [];
  const tEnd = Date.now() + wallSec * 1000;
  do {
    const file = path.join(FRAME_DIR, `f${String(frameNo++).padStart(4, '0')}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
    shots.push({ file, t: Date.now() });
  } while (Date.now() < tEnd && !(stopWhen && (await stopWhen.isVisible().catch(() => false))));
  const span = shots.length > 1 ? shots[shots.length - 1].t - shots[0].t : 1;
  shots.forEach((s, i) => {
    const next = shots[i + 1]?.t ?? s.t + span / Math.max(1, shots.length - 1);
    frames.push({ file: s.file, dur: ((next - s.t) / (span + span / Math.max(1, shots.length - 1))) * videoSec });
  });
}

/** Hold a single still for `sec` seconds. */
async function still(page, sec) {
  const file = path.join(FRAME_DIR, `f${String(frameNo++).padStart(4, '0')}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
  frames.push({ file, dur: sec });
}

/** Close any debrief / result dialog a demo leaves open. */
async function closeOverlays(page) {
  for (let i = 0; i < 3; i++) {
    const dlg = page.locator('[role="dialog"], .modal-backdrop').first();
    if (!(await dlg.isVisible().catch(() => false))) return;
    const close = dlg.getByRole('button', { name: /close/i }).first();
    if (await close.isVisible().catch(() => false)) await close.click().catch(() => {});
    else await page.keyboard.press('Escape');
    await sleep(400);
  }
}

async function goHome(page) {
  await closeOverlays(page);
  const back = page.getByRole('link', { name: 'Return to Main Menu' });
  if (await back.isVisible().catch(() => false)) await back.click();
  await page.locator('.home-title').waitFor();
  await setCaption(page, '');
}

async function main() {
  const server = await preview({ root: ROOT, preview: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  const browser = await chromium.launch({
    headless: !HEADED,
    channel: process.env.PLAYWRIGHT_CHANNEL,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.warn('[pageerror]', e.message));

  try {
    // ── 0. Title: home panorama ──────────────────────────────────────────
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.locator('.home-title').waitFor();
    await sleep(3500); // let models, textures and panorama settle
    await setCaption(page, 'Vector Align · Orbital Academy', 'Space Mission Design Game — fly a NASA mission from launch to splashdown');
    await capture(page, 2, 2.5);

    // ── 1a. Liftoff: Saturn V autopilot demo from LC-39A ─────────────────
    await page.getByRole('button', { name: /Saturn V Apollo Launch/ }).click();
    await page.locator('.liftoff-main .scene-container canvas').waitFor();
    await sleep(2500);
    await page.locator('.liftoff-scene-toolbar').getByRole('button', { name: 'Demo', exact: true }).click();
    await setCaption(page, '① Liftoff — Saturn V · Apollo · LC-39A', 'Real thrust, drag & mass-flow physics · staging · gravity turn');
    await sleep(800);
    await capture(page, 9, 5.5);
    await goHome(page);

    // ── 1b. Liftoff: SLS Artemis I from LC-39B ───────────────────────────
    await page.getByRole('button', { name: /^Liftoff/ }).click();
    await page.getByRole('button', { name: /SLS · Artemis I Moon Rocket Launch/ }).click();
    await page.locator('.liftoff-main .scene-container canvas').waitFor();
    await sleep(3000);
    await page.locator('.liftoff-scene-toolbar').getByRole('button', { name: 'Demo', exact: true }).click();
    await setCaption(page, '① Liftoff — SLS · Artemis I · LC-39B', 'Same simulator, different vehicle: design choices change the ascent');
    await sleep(1500);
    await capture(page, 6, 3.5);
    await goHome(page);

    // ── 2. Station Docking: ISS autopilot demo ───────────────────────────
    await page.getByRole('button', { name: /^Station Docking/ }).click();
    await page.getByRole('button', { name: /ISS Standard Autonomous & Manual Docking/ }).click();
    await page.getByRole('heading', { name: /Learn to stop/ }).waitFor();
    await sleep(2500);
    await page.getByRole('button', { name: /Watch demo/i }).first().click();
    await setCaption(page, '② Station Docking — ISS', '6-DOF RCS control · inertia, closing rate & alignment corridors');
    await sleep(300);
    await capture(page, 8, 3.6, page.locator('[role="dialog"]').first());
    await page.locator('[role="dialog"]').first().waitFor({ timeout: 15000 }).catch(() => {});
    await sleep(600);
    await setCaption(page, '② Station Docking — Debrief', 'Every flight is scored against real capture limits');
    await still(page, 1.4);
    await goHome(page);

    // ── 3. Departure: ISS radial departure demo ──────────────────────────
    await page.getByRole('button', { name: /^Departure/ }).click();
    await page.getByRole('button', { name: /ISS Radial Departure Corridor/ }).click();
    await page.getByRole('heading', { name: /Latch Release/ }).first().waitFor();
    await sleep(2500);
    await page.getByRole('button', { name: /Watch Demo/i }).first().click();
    await setCaption(page, '③ Station Departure — ISS', 'Hooks open, spring push-off, safe radial separation');
    await sleep(500);
    await capture(page, 9, 4.3);
    await goHome(page);

    // ── 4. Landing: Apollo 11 splashdown demo ────────────────────────────
    await page.getByRole('button', { name: /^Landing/ }).click();
    await page.getByRole('button', { name: /Apollo 11 Pacific Splashdown Recovery/ }).click();
    await page.getByRole('heading', { name: /Plasma Blackout/ }).first().waitFor();
    await sleep(2500);
    await page.getByRole('button', { name: /Watch Demo/i }).first().click();
    await setCaption(page, '④ Capsule Landing — Apollo 11', 'Entry heating, parachutes & Pacific splashdown');
    await sleep(500);
    await capture(page, 7, 4.5);
    await goHome(page);

    // ── 5. Outro ─────────────────────────────────────────────────────────
    await sleep(800);
    await setCaption(page, 'Vector Align · NASA Space Apps 2026 · New York', 'Space Mission Design Game · free, offline, runs in any browser');
    await still(page, 2.5);
  } finally {
    await browser.close();
    await new Promise((r) => server.httpServer.close(r));
  }

  // Fit to the time limit.
  const total = frames.reduce((s, f) => s + f.dur, 0);
  const scale = total > MAX_SECONDS ? MAX_SECONDS / total : 1;
  console.log(`captured ${frames.length} frames, ${total.toFixed(2)} s raw, scale ${scale.toFixed(3)}`);

  const list = frames.map((f) => `file '${f.file}'\nduration ${(f.dur * scale).toFixed(3)}`).join('\n');
  // concat demuxer ignores the last duration unless the file is repeated.
  const listFile = path.join(OUT_DIR, 'frames.txt');
  writeFileSync(listFile, `${list}\nfile '${frames[frames.length - 1].file}'\n`);

  const res = spawnSync(
    'ffmpeg',
    [
      '-y', '-loglevel', 'error',
      '-f', 'concat', '-safe', '0', '-i', listFile,
      '-vf', `fps=${FPS},scale=1920:1080:flags=lanczos,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart',
      '-t', String(MAX_SECONDS),
      OUT_FILE,
    ],
    { stdio: 'inherit' },
  );
  if (res.status !== 0) throw new Error('ffmpeg failed');
  console.log(`wrote ${path.relative(ROOT, OUT_FILE)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
