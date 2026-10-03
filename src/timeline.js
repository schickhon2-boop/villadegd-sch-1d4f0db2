/**
 * The whole sting as a pure function of time.
 *
 * `state(t)` has no side effects and no dependence on frame rate, which is
 * what lets the offline renderer step time by hand and lets the motion
 * blur sample the same curve several times inside one frame.
 *
 * Retime the sting by editing BEATS in config.js and the curves below.
 */

import { CONFIG, BEATS } from './config.js';

const TAU = Math.PI * 2;

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep01 = (x) => {
  const p = clamp01(x);
  return p * p * (3 - 2 * p);
};

export const easeOutQuart = (p) => 1 - Math.pow(1 - p, 4);
export const easeOutQuint = (p) => 1 - Math.pow(1 - p, 5);
export const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
export const easeInOutCubic = (p) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
export const easeOutBack = (p, s = 1.18) =>
  1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);

/** A gaussian pulse — used for the strike flash and the anamorphic streak. */
const pulse = (t, at, width) => Math.exp(-Math.pow((t - at) / width, 2));

/**
 * Spin: a hard decelerating ease into zero, then a small damped rock so the
 * badge lands with some weight instead of simply freezing.
 */
function spin(t) {
  const p = clamp01(t / BEATS.spinEnd);
  let rot = BEATS.turns * TAU * (1 - easeOutQuart(p));

  const u = Math.max(0, t - BEATS.spinEnd);
  // The smoothstep gate kills the velocity step where the two curves meet.
  rot += 0.062 * Math.exp(-6.2 * u) * Math.sin(17.5 * u) * smoothstep01(u / 0.055);

  // A hair of continued drift so the last frame is not dead still.
  rot += 0.022 * easeOutCubic(clamp01((t - BEATS.spinEnd) / 0.82));
  return rot;
}

export function state(t) {
  const { camera, blur } = CONFIG;
  const tt = clamp01(t / CONFIG.duration) * CONFIG.duration;

  /* Arrival — scales up with a touch of overshoot and dollies in. */
  const arrive = clamp01(tt / BEATS.arrive);
  const scale = 0.92 + 0.08 * easeOutBack(arrive);
  const posZ = -0.22 * (1 - easeOutCubic(clamp01(tt / 0.42)));

  /* Rest attitude: tilted a few degrees so the rim catches the key light. */
  const settle = Math.max(0, tt - BEATS.spinEnd);
  const rock = Math.exp(-7.0 * settle) * Math.sin(15.0 * settle) * smoothstep01(settle / 0.05);
  const tiltX = -0.085 + 0.020 * rock;
  const tiltZ = -0.022 - 0.014 * rock;

  /* Light sweep across the face. */
  const sp = clamp01((tt - BEATS.sweepIn) / (BEATS.sweepOut - BEATS.sweepIn));
  const sweepOn = tt > BEATS.sweepIn && tt < BEATS.sweepOut;
  const sweepProg = easeInOutCubic(sp);
  const sweepInt = sweepOn ? Math.pow(Math.sin(Math.PI * sp), 0.55) : 0;
  const sweepMid = BEATS.sweepIn + 0.5 * (BEATS.sweepOut - BEATS.sweepIn);

  /* Screen-space finishing. */
  const flash = 0.12 * pulse(tt, 0.045, 0.055) + 0.035 * pulse(tt, sweepMid, 0.075);
  const streak = 0.26 * pulse(tt, sweepMid, 0.08);

  return {
    t: tt,
    scale,
    posZ,
    rotY: spin(tt),
    tiltX,
    tiltZ,
    camZ: camera.zStart - (camera.zStart - camera.zEnd) * easeOutCubic(clamp01(tt / 1.9)),
    sweepProg,
    sweepInt,
    glow: 0.2 + 0.55 * sweepInt,
    flash,
    streak,
  };
}

/**
 * How many sub-samples this frame needs: dense while the badge is whipping
 * round, one once it has stopped. Keeps the offline render honest and fast.
 */
export function samplesFor(t, dt, max = CONFIG.blur.maxSamples) {
  const h = dt * 0.5;
  const speed = Math.abs(state(t + h).rotY - state(t - h).rotY) / Math.max(dt, 1e-6);
  const n = Math.ceil((speed * dt * CONFIG.blur.shutter) / CONFIG.blur.radPerSample);
  return Math.max(1, Math.min(max, n));
}
