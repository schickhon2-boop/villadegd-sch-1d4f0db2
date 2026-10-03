/**
 * VILLA DE GD — 3D logo sting
 * Every number you are likely to want to change lives here.
 */

export const CONFIG = {
  /* ── Format ────────────────────────────────────────────────────────── */
  duration: 2.0, // seconds
  fps: 60,
  width: 1920, // 16:9
  height: 1080,

  /* ── Logo source ───────────────────────────────────────────────────── */
  logo: {
    // Drop a real logo at any of these paths and it is used automatically
    // (alpha channel preferred, otherwise dark ink on light is engraved).
    // If none resolve, the typographic wordmark below is struck instead.
    imageCandidates: [
      'assets/villadegd-logo.svg',
      'assets/villadegd-logo.png',
      'assets/villadegd.svg',
      'assets/villadegd.png',
    ],
    imageScale: 0.60, // fraction of the field diameter the artwork fills
    // Typographic fallback wordmark
    line1: 'VILLA',
    line2: 'DE GD',
    font: 'Cinzel',
    tracking: 0.17, // em
    frame: true, // double hairline ring + lozenge ornaments
  },

  /* ── Badge proportions (world units, coin radius = 1) ──────────────── */
  badge: {
    radius: 1.0,
    halfThickness: 0.078,
    fieldRadius: 0.76, // the recessed disc the logo is struck into
    reeds: 132, // milled grooves around the edge
    engraveDepth: 1.1, // normal-map strength of the engraving
    bevel: 7, // engraving bevel softness, px at 2048
  },

  /* ── Grey studio ───────────────────────────────────────────────────── */
  mood: {
    bgInner: '#383d45',
    bgOuter: '#1b1e23',
    metal: '#c8ccd2',
    engraved: '#949ba5',
    exposure: 1.12,
    vignette: 0.44,
    grain: 0.02,
    bloom: 0.34,
  },

  /* ── Camera ────────────────────────────────────────────────────────── */
  camera: { fov: 30, zStart: 6.05, zEnd: 5.82, y: 0.02 },

  /* ── Motion blur (accumulation) ────────────────────────────────────── */
  blur: {
    shutter: 0.68, // fraction of a frame the shutter stays open
    maxSamples: 14, // offline render
    liveSamples: 4, // interactive playback
    radPerSample: 0.012, // sample density target, radians of spin per sample
  },
};

/* ── Beat sheet. Times in seconds; the whole sting is 2.00s. ─────────── */
export const BEATS = {
  arrive: 0.30, // scale/dolly settle
  spinEnd: 1.18, // rotation comes to rest
  turns: 1.9, // full revolutions before it stops
  sweepIn: 1.21, // light begins its pass
  sweepOut: 1.80, // light leaves the badge
  sweepAngle: 0.60, // radians, axis the light travels along
};
