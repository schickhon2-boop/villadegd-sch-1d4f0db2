/**
 * Procedural texture synthesis — no image assets required.
 *
 * Everything the metal needs (studio environment, milled edge, engraving
 * normals / roughness) is painted into canvases at load time.
 */

import * as THREE from 'three';
import { CONFIG } from './config.js';

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function canvasTexture(canvas, { srgb = false, repeat = null, aniso = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = aniso;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  if (repeat) tex.repeat.set(repeat[0], repeat[1]);
  tex.needsUpdate = true;
  return tex;
}

/* ───────────────────────── grey studio environment ───────────────────── */

/**
 * An equirectangular grey studio: a broad top softbox, a weaker fill, a
 * horizon strip and two vertical strip lights whose reflections streak
 * across the milled edge while the badge turns.
 */
export function studioEquirect(w = 1024, h = 512) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');

  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0.0, '#f4f6f8');
  sky.addColorStop(0.14, '#ced3da');
  sky.addColorStop(0.34, '#9aa0a9');
  sky.addColorStop(0.5, '#7e848d');
  sky.addColorStop(0.7, '#4a4f56');
  sky.addColorStop(1.0, '#23262a');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  const blob = (u, v, rx, ry, color, alpha) => {
    const x = u * w;
    const y = v * h;
    const grad = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry) * w);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = alpha;
    g.translate(x, y);
    g.scale(1, (ry * h) / (rx * w));
    g.translate(-x, -y);
    g.fillStyle = grad;
    g.fillRect(x - rx * w * 2, y - rx * w * 2, rx * w * 4, rx * w * 4);
    g.restore();
  };

  // The big one: a softbox on the camera side. A flat face reflects straight
  // back past the lens, so without this the struck field stays dark however
  // bright the rest of the room is. +Z lands at u = 0.75 in equirect.
  blob(0.75, 0.34, 0.26, 0.4, '#ffffff', 0.42);

  // Key softbox, upper left.
  blob(0.17, 0.2, 0.17, 0.3, '#ffffff', 0.8);
  // Cooler fill, upper right.
  blob(0.66, 0.29, 0.2, 0.34, '#b6bcc5', 0.6);
  // Kicker behind, keeps the far rim from going flat.
  blob(0.92, 0.46, 0.1, 0.22, '#8d939c', 0.5);
  // Side wraps at ±X — these are what the face catches while it is spinning
  // edge-on to the lens, so the metal keeps flashing all the way round.
  blob(0.46, 0.36, 0.18, 0.3, '#dfe4ea', 0.34);
  blob(0.03, 0.36, 0.18, 0.3, '#cfd5dd', 0.3);

  // Horizon strip — gives the round rim one continuous highlight band.
  g.save();
  g.globalCompositeOperation = 'lighter';
  const strip = g.createLinearGradient(0, h * 0.1, 0, h * 0.2);
  strip.addColorStop(0, 'rgba(0,0,0,0)');
  strip.addColorStop(0.5, 'rgba(150,157,167,0.85)');
  strip.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = strip;
  g.fillRect(0, h * 0.1, w, h * 0.1);

  // Vertical strip lights — these are what streak across the milled edge.
  for (const u of [0.4, 0.86]) {
    const x = u * w;
    const vs = g.createLinearGradient(x - w * 0.012, 0, x + w * 0.012, 0);
    vs.addColorStop(0, 'rgba(0,0,0,0)');
    vs.addColorStop(0.5, 'rgba(226,231,238,0.8)');
    vs.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = vs;
    g.fillRect(x - w * 0.012, h * 0.06, w * 0.024, h * 0.42);
  }
  g.restore();

  return c;
}

export function buildEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const tex = canvasTexture(studioEquirect(), { srgb: true });
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const rt = pmrem.fromEquirectangular(tex);
  tex.dispose();
  pmrem.dispose();
  return rt.texture;
}

/* ───────────────────────── height → normal + edge ────────────────────── */

/**
 * Sobel the blurred engraving mask into a tangent-space normal map, and
 * return the gradient magnitude as a separate "where the bevel walls are"
 * map. The sweep shader uses that second map to make the engraving flare.
 */
export function normalAndEdgeFromHeight(heightCanvas, strength) {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const src = heightCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;

  const nrm = makeCanvas(w, h);
  const edg = makeCanvas(w, h);
  const nImg = new ImageData(w, h);
  const eImg = new ImageData(w, h);
  const N = nImg.data;
  const E = eImg.data;

  const at = (x, y) => {
    const xx = x < 0 ? 0 : x >= w ? w - 1 : x;
    const yy = y < 0 ? 0 : y >= h ? h - 1 : y;
    return src[(yy * w + xx) << 2] / 255;
  };

  let maxMag = 1e-6;
  const mags = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));

      // Engraving is recessed, so the gradient is negated.
      let nx = -dx * strength;
      let ny = dy * strength; // canvas Y runs down; OpenGL normal maps are Y-up
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * w + x) << 2;
      N[i] = ((nx / len) * 0.5 + 0.5) * 255;
      N[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      N[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      N[i + 3] = 255;

      const mag = Math.hypot(dx, dy);
      mags[y * w + x] = mag;
      if (mag > maxMag) maxMag = mag;
    }
  }

  for (let i = 0, p = 0; i < mags.length; i++, p += 4) {
    const v = Math.min(1, mags[i] / maxMag) ** 0.65;
    E[p] = E[p + 1] = E[p + 2] = v * 255;
    E[p + 3] = 255;
  }

  nrm.getContext('2d').putImageData(nImg, 0, 0);
  edg.getContext('2d').putImageData(eImg, 0, 0);
  return { normal: nrm, edge: edg };
}

/** Gaussian-blur a mask by re-drawing it through the 2D filter. */
export function blurred(canvas, px) {
  const c = makeCanvas(canvas.width, canvas.height);
  const g = c.getContext('2d');
  g.filter = `blur(${px}px)`;
  g.drawImage(canvas, 0, 0);
  g.filter = 'none';
  return c;
}

/* ───────────────────────── coin body (lathe UV space) ────────────────── */

/**
 * The lathe's UVs are (angle, profile), so a vertical stripe pattern in `u`
 * is exactly a milled coin edge, and faint noise in `u` is circular brushing.
 * `edgeBand` is the v range the edge occupies on the profile.
 */
export function bodyMaps(edgeBand, rimBands) {
  const W = 2048;
  const H = 512;
  const [v0, v1] = edgeBand;

  const nrm = makeCanvas(W, H);
  const orm = makeCanvas(W, H); // R unused, G roughness, B metalness
  const n = nrm.getContext('2d');
  const o = orm.getContext('2d');

  const nImg = n.createImageData(W, H);
  const oImg = o.createImageData(W, H);
  const reeds = CONFIG.badge.reeds;

  // A cheap value-noise for the brushed finish.
  const hash = (i) => {
    const s = Math.sin(i * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  };
  const brush = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    brush[x] = (hash(x) - 0.5) * 0.55 + (hash(Math.floor(x / 7) + 999) - 0.5) * 0.45;
  }

  const inBand = (v, [a, b]) => v >= a && v <= b;

  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    const onEdge = v > v0 && v < v1;
    const edgeFade =
      onEdge ? Math.min(1, Math.min(v - v0, v1 - v) / ((v1 - v0) * 0.18)) : 0;
    const onRim = rimBands.some((b) => inBand(v, b));

    for (let x = 0; x < W; x++) {
      const u = x / W;
      let nx = brush[x] * 0.06; // circular brushing everywhere
      if (edgeFade > 0) nx += Math.sin(u * Math.PI * 2 * reeds) * 0.95 * edgeFade;

      const len = Math.hypot(nx, 0, 1);
      const i = (y * W + x) << 2;
      nImg.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      nImg.data[i + 1] = 0.5 * 255;
      nImg.data[i + 2] = (1 / len) * 0.5 * 255 + 0.5 * 255;
      nImg.data[i + 3] = 255;

      // Rim is polished, the field satin, the milled edge in between.
      let rough = onRim ? 0.22 : 0.3;
      if (edgeFade > 0) rough = 0.2 + 0.06 * Math.abs(Math.sin(u * Math.PI * 2 * reeds));
      rough += brush[x] * 0.03;
      oImg.data[i] = 255;
      oImg.data[i + 1] = Math.max(0, Math.min(1, rough)) * 255;
      oImg.data[i + 2] = 255; // fully metal
      oImg.data[i + 3] = 255;
    }
  }

  n.putImageData(nImg, 0, 0);
  o.putImageData(oImg, 0, 0);
  return { normal: nrm, orm };
}
