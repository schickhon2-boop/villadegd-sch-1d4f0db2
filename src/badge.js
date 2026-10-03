/**
 * The coin: a revolved body with a milled edge and a raised polished rim,
 * plus two struck faces and the gloss-sweep disc that rides in front.
 */

import * as THREE from 'three';
import { CONFIG } from './config.js';
import {
  bodyMaps,
  blurred,
  canvasTexture,
  makeCanvas,
  normalAndEdgeFromHeight,
} from './textures.js';
import { frontMask, backMask } from './logo.js';

const { radius: R, halfThickness: T, fieldRadius: F } = CONFIG.badge;
const FACE_Z = T * 0.8;

/* Profile revolved around Y: field → bevel → polished rim → milled edge. */
const PROFILE = [
  [0.0, T * 0.8],
  [0.7, T * 0.8],
  [F + 0.002, T * 0.8],
  [0.8, T * 0.99],
  [0.845, T * 1.0],
  [0.92, T * 1.0],
  [0.962, T * 0.87],
  [0.992, T * 0.52],
  [1.0, 0.0],
  [0.992, -T * 0.52],
  [0.962, -T * 0.87],
  [0.92, -T * 1.0],
  [0.845, -T * 1.0],
  [0.8, -T * 0.99],
  [F + 0.002, -T * 0.8],
  [0.7, -T * 0.8],
  [0.0, -T * 0.8],
].map(([r, y]) => new THREE.Vector2(r * R, y));

const EDGE_BAND = [7 / 16 - 0.018, 9 / 16 + 0.018];
const RIM_BANDS = [[3 / 16, 6 / 16], [10 / 16, 13 / 16]];

/** Downscale a canvas — albedo/roughness are low frequency, 1k is plenty. */
function resized(canvas, size) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(canvas, 0, 0, size, size);
  return c;
}

/**
 * Turn an engraving mask (white = metal removed) into the map set for a
 * struck face: tinted albedo with contact shading, bevelled normals, and
 * roughness/metalness that make the recesses read as cut rather than printed.
 */
function struckFace(mask, { bevel = CONFIG.badge.bevel } = {}) {
  const height = blurred(mask, bevel);
  const { normal, edge } = normalAndEdgeFromHeight(height, CONFIG.badge.engraveDepth * 4.0);

  const S = 1024;
  const soft = resized(blurred(mask, bevel * 2.2), S);
  const sharp = resized(mask, S);
  const edgeSmall = resized(edge, S);

  const sd = soft.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, S, S).data;
  const hd = sharp.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, S, S).data;
  const ed = edgeSmall.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, S, S).data;

  const albedo = makeCanvas(S);
  const orm = makeCanvas(S);
  const ag = albedo.getContext('2d');
  const og = orm.getContext('2d');
  const aImg = ag.createImageData(S, S);
  const oImg = og.createImageData(S, S);

  const base = new THREE.Color(CONFIG.mood.metal);
  const cut = new THREE.Color(CONFIG.mood.engraved);

  for (let i = 0; i < aImg.data.length; i += 4) {
    const ao = sd[i] / 255; // soft occlusion around the engraving
    const m = hd[i] / 255; // inside the engraving
    const e = ed[i] / 255; // on a bevel wall

    const k = Math.min(1, ao * 0.75 + m * 0.5);
    aImg.data[i] = (base.r + (cut.r - base.r) * k) * 255;
    aImg.data[i + 1] = (base.g + (cut.g - base.g) * k) * 255;
    aImg.data[i + 2] = (base.b + (cut.b - base.b) * k) * 255;
    aImg.data[i + 3] = 255;

    // Satin field, slightly rougher cut floor, polished bevel walls.
    const rough = Math.max(0.06, Math.min(1, 0.3 + m * 0.13 - e * 0.17));
    oImg.data[i] = 255;
    oImg.data[i + 1] = rough * 255;
    oImg.data[i + 2] = (1 - m * 0.05) * 255;
    oImg.data[i + 3] = 255;
  }
  ag.putImageData(aImg, 0, 0);
  og.putImageData(oImg, 0, 0);

  const clamp = (tex) => {
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  };

  return {
    maps: {
      map: clamp(canvasTexture(albedo, { srgb: true })),
      normalMap: clamp(canvasTexture(normal)),
      roughnessMap: clamp(canvasTexture(orm)),
      metalnessMap: clamp(canvasTexture(orm)),
    },
    maskTex: clamp(canvasTexture(resized(mask, 512))),
    edgeTex: clamp(canvasTexture(resized(edge, 512))),
  };
}

/* ───────────────────────────── gloss sweep ───────────────────────────── */

const SWEEP_FRAG = /* glsl */ `
  uniform float uProg;      // 0..1, the light's travel across the badge
  uniform float uInt;       // master intensity
  uniform float uAngle;     // travel axis
  uniform float uRatio;     // badge radius / field radius
  uniform sampler2D uMask;  // engraving mask
  uniform sampler2D uEdge;  // bevel walls
  varying vec2 vUv;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float disc = smoothstep(1.0, 0.982, r);
    if (disc <= 0.0) discard;

    vec2 dir = vec2(cos(uAngle), sin(uAngle));
    float s = dot(p, dir);
    float head = mix(-1.9, 1.9, uProg);
    float d = s - head;

    float core = exp(-pow(d / 0.075, 2.0));
    float halo = exp(-pow(d / 0.40, 2.0)) * 0.40;
    float band = core + halo;

    vec2 fuv = p * uRatio * 0.5 + 0.5;
    float inField = step(0.0, fuv.x) * step(fuv.x, 1.0) * step(0.0, fuv.y) * step(fuv.y, 1.0);
    float edge = texture2D(uEdge, fuv).r * inField;
    float mask = texture2D(uMask, fuv).r * inField;

    // The engraving's bevel walls are what actually catch a raking light.
    float flare = band * (0.16 + 1.5 * edge + 0.13 * mask);

    // Polished rim and milled edge pick it up too.
    float rimBand = smoothstep(0.78, 0.84, r) * smoothstep(1.0, 0.93, r);
    flare += band * rimBand * 0.6;

    vec3 col = vec3(1.0, 1.0, 1.015) * flare * uInt * disc * 0.62;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const SWEEP_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/* ──────────────────────────────── build ──────────────────────────────── */

export async function buildBadge(env) {
  const front = struckFace(await frontMask());
  const back = struckFace(backMask(), { bevel: 7 });
  const body = bodyMaps(EDGE_BAND, RIM_BANDS);

  const bodyNormal = canvasTexture(body.normal);
  const bodyOrm = canvasTexture(body.orm);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: CONFIG.mood.metal,
    metalness: 1.0,
    roughness: 1.0,
    normalMap: bodyNormal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: bodyOrm,
    metalnessMap: bodyOrm,
    envMap: env,
    envMapIntensity: 1.3,
  });

  const faceMat = (f) =>
    new THREE.MeshStandardMaterial({
      ...f.maps,
      metalness: 1.0,
      roughness: 1.0,
      normalScale: new THREE.Vector2(1, 1),
      envMap: env,
      envMapIntensity: 1.38,
    });

  const bodyMesh = new THREE.Mesh(new THREE.LatheGeometry(PROFILE, 256), bodyMat);
  bodyMesh.rotation.x = Math.PI / 2; // stand the coin up, axis along +Z

  const plate = new THREE.CircleGeometry(F, 192);
  const frontMesh = new THREE.Mesh(plate, faceMat(front));
  frontMesh.position.z = FACE_Z + 0.0014;

  const backMesh = new THREE.Mesh(plate, faceMat(back));
  backMesh.position.z = -(FACE_Z + 0.0014);
  backMesh.rotation.y = Math.PI;

  const sweepMat = new THREE.ShaderMaterial({
    uniforms: {
      uProg: { value: 0 },
      uInt: { value: 0 },
      uAngle: { value: 0.6 },
      uRatio: { value: R / F },
      uMask: { value: front.maskTex },
      uEdge: { value: front.edgeTex },
    },
    vertexShader: SWEEP_VERT,
    fragmentShader: SWEEP_FRAG,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  const sweep = new THREE.Mesh(new THREE.CircleGeometry(R, 160), sweepMat);
  sweep.position.z = T + 0.006;
  sweep.renderOrder = 5;

  const spinner = new THREE.Group();
  spinner.add(bodyMesh, frontMesh, backMesh, sweep);

  const tilt = new THREE.Group();
  tilt.add(spinner);

  const root = new THREE.Group();
  root.add(tilt);

  return { root, tilt, spinner, sweepMat };
}
