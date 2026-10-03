/**
 * Backdrop, atmosphere, and the compositor.
 *
 * The compositor is what gives the sting its motion blur: the scene is
 * rendered several times inside one frame at slightly different times and
 * accumulated, then graded once (bloom, anamorphic streak, flash, vignette,
 * grain) on the way to the screen.
 *
 * Colour note: built-in materials are tone mapped and sRGB-encoded by three
 * on the way into the target, so the hand-written shaders here deliberately
 * work in sRGB too — the glints composite like a 2D pass, which is what we
 * want for a glossy sweep.
 */

import * as THREE from 'three';
import { CONFIG } from './config.js';

/** Raw sRGB components, bypassing the linear working space on purpose. */
function srgbVec(hex) {
  const h = hex.replace('#', '');
  return new THREE.Vector3(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  );
}

const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

/* ──────────────────────────────── backdrop ───────────────────────────── */

export function makeBackdrop(aspect) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uInner: { value: srgbVec(CONFIG.mood.bgInner) },
      uOuter: { value: srgbVec(CONFIG.mood.bgOuter) },
      uAspect: { value: aspect },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: /* glsl */ `
      uniform vec3 uInner;
      uniform vec3 uOuter;
      uniform float uAspect;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - vec2(0.5, 0.52);
        p.x *= uAspect;
        float r = clamp(length(p) * 1.45, 0.0, 1.0);
        vec3 col = mix(uInner, uOuter, smoothstep(0.0, 1.0, r));
        // A faint floor bounce keeps the lower frame from going pure black.
        col += vec3(0.012, 0.013, 0.015) * smoothstep(0.42, 0.0, vUv.y);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}

/* ───────────────────────── glow behind the badge ─────────────────────── */

export function makeGlow() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uInt: { value: 0.2 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uInt;
      varying vec2 vUv;
      void main() {
        float r = length(vUv * 2.0 - 1.0);
        float a = exp(-pow(r * 2.1, 2.0));
        gl_FragColor = vec4(vec3(0.80, 0.83, 0.88) * a * uInt, 1.0);
      }
    `,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5), mat);
  mesh.position.z = -0.75;
  mesh.renderOrder = -900;
  return mesh;
}

/* ───────────────────────────── drifting motes ────────────────────────── */

function dotSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeMotes(count = 110) {
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const size = new Float32Array(count);
  // Deterministic placement so every render of the sting is identical.
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rnd() - 0.5) * 6.2;
    pos[i * 3 + 1] = (rnd() - 0.5) * 3.6;
    pos[i * 3 + 2] = (rnd() - 0.5) * 2.4 + 0.3;
    vel[i * 3] = (rnd() - 0.5) * 0.05;
    vel[i * 3 + 1] = 0.02 + rnd() * 0.05;
    vel[i * 3 + 2] = (rnd() - 0.5) * 0.03;
    size[i] = 0.008 + rnd() * 0.016;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
  const mat = new THREE.PointsMaterial({
    map: dotSprite(),
    color: 0x9aa1ab,
    size: 0.03,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.renderOrder = 10;

  points.userData.update = (t) => {
    const a = geo.getAttribute('position');
    for (let i = 0; i < count; i++) {
      a.array[i * 3] = pos[i * 3] + vel[i * 3] * t;
      a.array[i * 3 + 1] = pos[i * 3 + 1] + vel[i * 3 + 1] * t;
      a.array[i * 3 + 2] = pos[i * 3 + 2] + vel[i * 3 + 2] * t;
    }
    a.needsUpdate = true;
  };
  return points;
}

/* ──────────────────────────── the compositor ─────────────────────────── */

const GRADE_FRAG = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  uniform float uAspect;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uTime;
  uniform float uFlash;
  uniform float uStreak;
  uniform float uBloom;
  varying vec2 vUv;

  // 12-tap golden-angle spiral — a cheap stand-in for a real bloom chain.
  const vec2 TAPS[12] = vec2[12](
    vec2( 0.9709,  0.2393), vec2(-0.5469,  1.1495), vec2(-1.1932, -1.1932),
    vec2( 1.8014, -0.9312), vec2( 0.5220,  2.1560), vec2(-2.3024,  0.7853),
    vec2( 2.0412,  1.8747), vec2(-0.6878, -2.9113), vec2(-2.6295,  2.0982),
    vec2( 3.5201,  0.3419), vec2(-1.6342, -3.5692), vec2(-2.3469,  3.3942)
  );

  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb;

    vec3 bl = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      vec2 o = TAPS[i] * 7.0 * uTexel;
      bl += max(vec3(0.0), texture2D(tSrc, vUv + o).rgb - 0.72);
    }
    c += (bl / 12.0) * uBloom * 1.5;

    // Anamorphic hint as the light crosses the badge.
    float sx = exp(-pow((vUv.x - 0.5) / 0.17, 2.0));
    float sy = exp(-pow((vUv.y - 0.5) / 0.009, 2.0));
    c += vec3(0.93, 0.96, 1.0) * uStreak * sx * sy;

    c += uFlash;

    vec2 q = vUv - 0.5;
    q.x *= uAspect;
    c *= clamp(1.0 - uVignette * pow(clamp(length(q) * 1.2, 0.0, 1.0), 2.3), 0.0, 1.0);

    float n = fract(sin(dot(vUv * vec2(1731.0, 977.0) + uTime * 11.37, vec2(12.9898, 78.233))) * 43758.5453);
    c += (n - 0.5) * uGrain;

    gl_FragColor = vec4(c, 1.0);
  }
`;

export class Compositor {
  constructor(renderer) {
    this.renderer = renderer;
    // Accumulation only works if three stops wiping the target for us.
    renderer.autoClear = false;
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.addMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uW: { value: 1 } },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc;
        uniform float uW;
        varying vec2 vUv;
        void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb * uW, 1.0); }
      `,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });

    this.gradeMat = new THREE.ShaderMaterial({
      uniforms: {
        tSrc: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uAspect: { value: 16 / 9 },
        uVignette: { value: CONFIG.mood.vignette },
        uGrain: { value: CONFIG.mood.grain },
        uBloom: { value: CONFIG.mood.bloom },
        uTime: { value: 0 },
        uFlash: { value: 0 },
        uStreak: { value: 0 },
      },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: GRADE_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.addMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  setSize(w, h) {
    const opts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    };
    this.rtScene?.dispose();
    this.rtAccum?.dispose();
    this.rtScene = new THREE.WebGLRenderTarget(w, h, {
      ...opts,
      type: THREE.UnsignedByteType,
      colorSpace: THREE.SRGBColorSpace,
      samples: 4,
    });
    this.rtAccum = new THREE.WebGLRenderTarget(w, h, {
      ...opts,
      type: THREE.HalfFloatType,
      depthBuffer: false,
    });
    this.gradeMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.gradeMat.uniforms.uAspect.value = w / h;
  }

  /** Begin a frame: wipe the accumulation buffer. */
  begin() {
    const r = this.renderer;
    r.setRenderTarget(this.rtAccum);
    r.setClearColor(0x000000, 1);
    r.clear(true, false, false);
    r.setRenderTarget(null);
  }

  /** Render one sub-sample of the scene and fold it into the accumulation. */
  sample(scene, camera, weight) {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.clear(true, true, false);
    r.render(scene, camera);

    this.quad.material = this.addMat;
    this.addMat.uniforms.tSrc.value = this.rtScene.texture;
    this.addMat.uniforms.uW.value = weight;
    r.setRenderTarget(this.rtAccum);
    r.render(this.quadScene, this.quadCam);
    r.setRenderTarget(null);
  }

  /** Grade the accumulated frame out to the canvas. */
  finish({ time, flash, streak }) {
    const u = this.gradeMat.uniforms;
    u.tSrc.value = this.rtAccum.texture;
    u.uTime.value = time;
    u.uFlash.value = flash;
    u.uStreak.value = streak;

    this.quad.material = this.gradeMat;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCam);
  }
}
