/**
 * The struck face of the badge.
 *
 * Produces an engraving mask: white = metal removed. If a real logo file is
 * present (see CONFIG.logo.imageCandidates) it is used; otherwise the
 * wordmark is set typographically in inscriptional capitals.
 */

import { CONFIG } from './config.js';
import { makeCanvas } from './textures.js';

const SIZE = 2048;

/** Try each candidate path; resolve with the first that decodes. */
export async function loadLogoImage(paths = CONFIG.logo.imageCandidates) {
  for (const src of paths) {
    try {
      const img = new Image();
      img.decoding = 'sync';
      const ok = await new Promise((res) => {
        img.onload = () => res(true);
        img.onerror = () => res(false);
        img.src = src;
      });
      if (ok && img.width > 0) return img;
    } catch {
      /* keep trying */
    }
  }
  return null;
}

/** Draw `img` centred and turn it into a white-on-black engraving mask. */
function stampImage(ctx, img, diameter) {
  const scale = Math.min(diameter / img.width, diameter / img.height);
  const w = img.width * scale;
  const h = img.height * scale;

  const tmp = makeCanvas(SIZE);
  const t = tmp.getContext('2d', { willReadFrequently: true });
  t.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);

  const px = t.getImageData(0, 0, SIZE, SIZE);
  const d = px.data;

  // Prefer the alpha channel; fall back to inverted luminance for artwork
  // delivered as opaque ink-on-white.
  let opaque = 0;
  for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 250) opaque++;
  const useAlpha = opaque < d.length / (4 * 97) - 1;

  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    let m;
    if (useAlpha) {
      m = a;
    } else {
      const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      m = a * (1 - lum);
    }
    const v = Math.max(0, Math.min(1, m)) * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  t.putImageData(px, 0, 0);
  ctx.drawImage(tmp, 0, 0);
}

function trackedText(ctx, text, cx, cy, size, tracking) {
  ctx.font = `700 ${size}px "${CONFIG.logo.font}", "Liberation Serif", Georgia, serif`;
  const sp = size * tracking;
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
  let x = cx - total / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], x, cy);
    x += widths[i] + sp;
  }
  return total;
}

function lozenge(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.62, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.62, y);
  ctx.closePath();
  ctx.fill();
}

/** Front face: the wordmark (or logo file) inside a hairline frame. */
export async function frontMask() {
  const c = makeCanvas(SIZE);
  const g = c.getContext('2d', { willReadFrequently: true });
  const C = SIZE / 2;
  const R = SIZE / 2;

  g.fillStyle = '#000';
  g.fillRect(0, 0, SIZE, SIZE);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineCap = 'round';

  if (CONFIG.logo.frame) {
    // Double hairline ring just inside the field.
    for (const [rr, lw] of [[0.93, 7], [0.885, 3.5]]) {
      g.lineWidth = lw;
      g.beginPath();
      g.arc(C, C, R * rr, 0, Math.PI * 2);
      g.stroke();
    }
  }

  const img = await loadLogoImage();
  if (img) {
    stampImage(g, img, R * 2 * CONFIG.logo.imageScale);
  } else {
    const { line1, line2, tracking } = CONFIG.logo;
    trackedText(g, line1, C, C - R * 0.085, R * 0.345, tracking);
    trackedText(g, line2, C, C + R * 0.275, R * 0.345, tracking);
  }

  if (CONFIG.logo.frame) {
    // A lozenge flanked by hairlines above and below the wordmark.
    for (const y of [C - R * 0.5, C + R * 0.52]) {
      g.lineWidth = 5;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(C + s * R * 0.085, y);
        g.lineTo(C + s * R * 0.33, y);
        g.stroke();
      }
      lozenge(g, C, y, R * 0.05);
    }
  }

  return c;
}

/** Back face: a turned guilloché, only ever glimpsed mid-spin. */
export function backMask() {
  const c = makeCanvas(1024);
  const g = c.getContext('2d');
  const S = 1024;
  const C = S / 2;

  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#fff';
  g.lineCap = 'butt';

  // Radial milling.
  g.lineWidth = 2.6;
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    g.beginPath();
    g.moveTo(C + Math.cos(a) * C * 0.2, C + Math.sin(a) * C * 0.2);
    g.lineTo(C + Math.cos(a) * C * 0.82, C + Math.sin(a) * C * 0.82);
    g.stroke();
  }
  // Concentric rings.
  for (const [rr, lw] of [[0.93, 5], [0.89, 2.5], [0.2, 4], [0.165, 2]]) {
    g.lineWidth = lw;
    g.beginPath();
    g.arc(C, C, C * rr, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#fff';
  lozenge(g, C, C, C * 0.075);

  return c;
}
