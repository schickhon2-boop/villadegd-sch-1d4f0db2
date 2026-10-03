/**
 * VILLA DE GD — 3D logo sting (Three.js)
 *
 * A metal-rimmed coin badge with the logo struck into its face: it spins in,
 * decelerates to a stop, and a single light sweeps across the surface.
 * 2.00s, 16:9, grey studio.
 *
 * Exposes `window.STING` so tools/render.mjs can step time by hand and pull
 * out a deterministic frame sequence.
 */

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { state, samplesFor, clamp01 } from './timeline.js';
import { buildEnvironment } from './textures.js';
import { buildBadge } from './badge.js';
import { Compositor, makeBackdrop, makeGlow, makeMotes } from './fx.js';

const params = new URLSearchParams(location.search);
const EXPORT = params.has('export');

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false, // MSAA happens on the render target instead
  alpha: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true, // lets the exporter read the canvas back
});
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = CONFIG.mood.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 16 / 9, 0.1, 100);
camera.position.set(0, CONFIG.camera.y, CONFIG.camera.zStart);
camera.lookAt(0, 0, 0);

const comp = new Compositor(renderer);

/* ─────────────────────────────── lighting ────────────────────────────── */

const key = new THREE.DirectionalLight(0xf2f5f9, 2.1);
key.position.set(-2.4, 2.3, 3.1);
const rim = new THREE.DirectionalLight(0xa9b1bc, 1.6);
rim.position.set(2.9, -0.7, -1.7);
const fill = new THREE.DirectionalLight(0x8d939d, 0.55);
fill.position.set(1.5, 0.4, 2.5);
/** The physical half of the sweep: a hard light raking across the face. */
const raker = new THREE.PointLight(0xffffff, 0, 10, 2.0);
scene.add(key, rim, fill, raker);

/* ──────────────────────────────── assembly ───────────────────────────── */

let badge = null;
let glow = null;
let motes = null;

async function loadFont() {
  try {
    const face = new FontFace(
      CONFIG.logo.font,
      'url(assets/fonts/cinzel-latin.woff2)',
      { weight: '400 900', style: 'normal' },
    );
    await face.load();
    document.fonts.add(face);
    await document.fonts.load(`700 200px "${CONFIG.logo.font}"`);
  } catch (err) {
    console.warn('[sting] inscriptional face unavailable, falling back to serif', err);
  }
}

export const ready = (async () => {
  await loadFont();

  const env = buildEnvironment(renderer);
  scene.environment = env;

  badge = await buildBadge(env);
  glow = makeGlow();
  motes = makeMotes();
  scene.add(makeBackdrop(16 / 9), glow, motes, badge.root);

  resize();
  renderAt(0);
  document.body.classList.add('is-ready');
  return true;
})();

/* ─────────────────────────────── per-frame ───────────────────────────── */

function applyState(t) {
  const s = state(t);
  badge.root.position.z = s.posZ;
  badge.root.scale.setScalar(s.scale);
  badge.tilt.rotation.set(s.tiltX, 0, s.tiltZ);
  badge.spinner.rotation.y = s.rotY;

  badge.sweepMat.uniforms.uProg.value = s.sweepProg;
  badge.sweepMat.uniforms.uInt.value = s.sweepInt;
  glow.material.uniforms.uInt.value = s.glow;

  const a = -1 + 2 * s.sweepProg;
  raker.position.set(a * 3.1, 1.35 - a * 1.15, 2.15);
  raker.intensity = 15 * s.sweepInt;

  camera.position.z = s.camZ;
  motes.userData.update(t);
}

export function renderAt(t, samples) {
  if (!badge) return;
  const dt = 1 / CONFIG.fps;
  const n =
    samples ??
    samplesFor(t, dt, EXPORT ? CONFIG.blur.maxSamples : CONFIG.blur.liveSamples);
  const span = dt * CONFIG.blur.shutter;

  comp.begin();
  for (let i = 0; i < n; i++) {
    const offset = n === 1 ? 0 : i / (n - 1) - 0.5;
    applyState(Math.max(0, t + offset * span));
    comp.sample(scene, camera, 1 / n);
  }
  const s = state(t);
  comp.finish({ time: t, flash: s.flash, streak: s.streak });
}

/* ──────────────────────────────── sizing ─────────────────────────────── */

let renderW = CONFIG.width;
let renderH = CONFIG.height;

function resize() {
  if (EXPORT) {
    // The exporter may ask for a different master size than the config default.
    renderW = Number(params.get('w')) || CONFIG.width;
    renderH = Number(params.get('h')) || CONFIG.height;
    canvas.style.width = `${renderW}px`;
    canvas.style.height = `${renderH}px`;
    renderer.setPixelRatio(1);
    renderer.setSize(renderW, renderH, false);
  } else {
    const stage = canvas.parentElement;
    const cssW = stage.clientWidth;
    const cssH = stage.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderW = Math.max(16, Math.round(cssW * dpr));
    renderH = Math.max(9, Math.round(cssH * dpr));
    renderer.setPixelRatio(1);
    renderer.setSize(renderW, renderH, false);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
  }
  camera.aspect = 16 / 9;
  camera.updateProjectionMatrix();
  comp.setSize(renderW, renderH);
}

if (!EXPORT) {
  let raf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      resize();
      renderAt(playhead);
    });
  });
}

/* ───────────────────────── interactive playback ──────────────────────── */

let playing = false;
let startedAt = 0;
let playhead = 0;
const bar = document.getElementById('bar');

function tick() {
  if (!playing) return;
  playhead = (performance.now() - startedAt) / 1000;
  if (playhead >= CONFIG.duration) {
    playhead = CONFIG.duration;
    playing = false;
  }
  renderAt(playhead);
  if (bar) bar.style.transform = `scaleX(${clamp01(playhead / CONFIG.duration)})`;
  if (playing) requestAnimationFrame(tick);
  else document.body.classList.remove('is-playing');
}

export function play() {
  if (!badge) return;
  playing = true;
  startedAt = performance.now();
  document.body.classList.add('is-playing');
  requestAnimationFrame(tick);
}

if (!EXPORT) {
  ready.then(() => {
    document.getElementById('replay')?.addEventListener('click', play);
    canvas.addEventListener('click', play);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        play();
      }
    });
    play();
  });
}

/* ───────────────────── handle for the offline renderer ───────────────── */

window.STING = {
  duration: CONFIG.duration,
  fps: CONFIG.fps,
  width: CONFIG.width,
  height: CONFIG.height,
  ready,
  renderAt,
  play,
  samplesFor: (t) => samplesFor(t, 1 / CONFIG.fps, CONFIG.blur.maxSamples),
  frame: (t, samples) => {
    renderAt(t, samples);
    return canvas.toDataURL('image/png');
  },
};
