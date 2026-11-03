// The 3D half of the kit: one renderer, a soft "architectural model" look,
// and the building blocks scenes are made of. Everything is driven by an
// explicit time value, never by requestAnimationFrame, so a frame rendered
// for the MP4 is identical to the one you scrub to in the browser.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export { THREE };

export const C = {
  bg: 0xe8e4db,
  ground: 0xe3dfd5,
  paper: 0xf3f1eb,
  light: 0xd6d2c8,
  mid: 0x9a9da3,
  dark: 0x2b2d31,
  ink: 0x1d1e21,
  blue: 0x2f6bff,
  orange: 0xf39a1e,
  red: 0xe5483b,
  green: 0x22a85a,
  tree: 0xa3b09a,
};

// ---------- time helpers ----------
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const easeOut = (k) => 1 - Math.pow(1 - k, 3);
/** 0→1 between a and b, eased. */
export const prog = (t, a, b, ease = easeInOut) => ease(clamp((t - a) / Math.max(1e-6, b - a)));
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- stage ----------
let HQ = false;
export function createStage({ width = 1080, height = 1920, pixelRatio = 1, ao = true } = {}) {
  HQ = ao;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.bg);
  scene.fog = new THREE.Fog(C.bg, 80, 320);

  const camera = new THREE.PerspectiveCamera(40, width / height, 0.5, 1200);

  if (HQ) {
    // a soft studio reflection on every surface, so plastic reads as plastic and glass as glass
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.45;
  }

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b2a2, 1.45));
  const sun = new THREE.DirectionalLight(0xfff6e8, 2.4);
  sun.position.set(40, 80, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(HQ ? 4096 : 2048, HQ ? 4096 : 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -70;
  sc.right = sc.top = 70;
  sc.near = 1;
  sc.far = 260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000),
    new THREE.MeshStandardMaterial({ color: C.ground, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  let composer = null;
  let gtao = null;
  let bokeh = null;
  let bloom = null;
  if (ao) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    gtao = new GTAOPass(scene, camera, width, height);
    gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.2 });
    gtao.blendIntensity = 1;
    composer.addPass(gtao);
    // depth of field, off unless a shot asks for it (stage.dof)
    bokeh = new BokehPass(scene, camera, { focus: 10, aperture: 0.002, maxblur: 0.01 });
    bokeh.enabled = false;
    composer.addPass(bokeh);
    // glow around anything brighter than the threshold — neon lines, city lights; off unless asked (stage.bloom)
    bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.9, 0.5, 0.82);
    bloom.enabled = false;
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  return {
    renderer,
    scene,
    camera,
    sun,
    ground,
    /** Keep the shadow frustum centred on what the camera is looking at. */
    focus(target) {
      sun.target.position.copy(target);
      sun.position.copy(target).add(new THREE.Vector3(40, 80, 30));
    },
    /** Shallow focus for this frame: { focus: distance to the sharp plane, aperture, maxblur }, or null. */
    dof(opts) {
      if (!bokeh) return;
      bokeh.enabled = !!opts;
      if (!opts) return;
      bokeh.uniforms.focus.value = opts.focus;
      bokeh.uniforms.aperture.value = opts.aperture ?? 0.004;
      bokeh.uniforms.maxblur.value = opts.maxblur ?? 0.012;
    },
    /** Ambient occlusion on or off for this frame (it draws sprites and see-through quads as dark squares). */
    ao(on) {
      if (gtao) gtao.enabled = !!on;
    },
    /** Glow for this frame: { strength, radius, threshold }, or null. */
    bloom(opts) {
      if (!bloom) return;
      bloom.enabled = !!opts;
      if (!opts) return;
      bloom.strength = opts.strength ?? 0.9;
      bloom.radius = opts.radius ?? 0.5;
      bloom.threshold = opts.threshold ?? 0.82;
    },
    render() {
      if (composer) composer.render();
      else renderer.render(scene, camera);
    },
  };
}

/** Point the camera from `from` at `to` (both [x,y,z]). */
export function shoot(stage, from, to) {
  stage.camera.position.set(...from);
  const target = new THREE.Vector3(...to);
  stage.camera.lookAt(target);
  stage.focus(target);
}
export const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

/**
 * Shots with hard cuts: [[start, [from xyz], [look], [to xyz], [look]], ...].
 * Each shot glides from→to until the next shot starts (or `end`), then cuts.
 */
export function shots(stage, t, end, list) {
  let i = 0;
  while (i < list.length - 1 && t >= list[i + 1][0]) i++;
  const [a, p0, l0, p1 = p0, l1 = l0] = list[i];
  const b = i + 1 < list.length ? list[i + 1][0] : end;
  const k = prog(t, a, b, (x) => 1 - Math.pow(1 - x, 2));
  shoot(stage, mix3(p0, p1, k), mix3(l0, l1, k));
}

/**
 * Camera keyframes: [[time, [camera xyz], [look-at xyz]], ...] in episode
 * seconds. Eased between keys, held before the first and after the last.
 */
export function camKeys(stage, t, keys) {
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
  const [ta, pa, la] = keys[i];
  const [tb, pb, lb] = keys[Math.min(i + 1, keys.length - 1)];
  const k = tb > ta ? prog(t, ta, tb) : 1;
  shoot(stage, mix3(pa, pb, k), mix3(la, lb, k));
}

// ---------- materials & blocks ----------
const mats = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02, ...opts }));
  return mats.get(key);
}
export const glow = (color) => {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false });
};

export function box(w, h, d, material, [x, y, z] = [0, 0, 0], parent) {
  const r = Math.min(0.22, Math.min(w, h, d) * 0.12);
  const geo = HQ && r > 0.02 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, typeof material === "number" ? mat(material) : material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  parent?.add(m);
  return m;
}

/**
 * Freeze a 2D canvas into a plain-bytes texture. A CanvasTexture uploads from the canvas at draw
 * time, and on a Mac GPU render those canvases came through blank (black land, no clouds).
 * Copying the pixels out right after drawing takes the GPU canvas out of the path entirely.
 */
export function bakeTexture(cv) {
  const { width: w, height: h } = cv;
  const src = cv.getContext("2d").getImageData(0, 0, w, h).data;
  const data = new Uint8Array(src.length), row = w * 4;
  for (let y = 0; y < h; y++) data.set(src.subarray(y * row, (y + 1) * row), (h - 1 - y) * row); // canvas is top-down, GL bottom-up
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** A canvas-textured plane: signage, screens, number plates. Telugu renders fine once fonts are loaded. */
export function sign(lines, { w = 4, h = 1, bg = "#1d1e21", fg = "#f3f1eb", font = '700 120px "Inter Tight", "Anek Telugu"', px = 256, align = "center" } = {}) {
  const cv = document.createElement("canvas");
  cv.width = Math.round(px * w);
  cv.height = Math.round(px * h);
  const g = cv.getContext("2d");
  const draw = (ls, colour = fg, background = bg) => {
    g.fillStyle = background;
    g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = colour;
    g.textAlign = align;
    g.textBaseline = "middle";
    const arr = Array.isArray(ls) ? ls : [ls];
    arr.forEach((l, i) => {
      const spec = typeof l === "string" ? { text: l } : l;
      g.font = spec.font || font;
      g.fillStyle = spec.color || colour;
      const x = align === "center" ? cv.width / 2 : cv.width * 0.06;
      g.fillText(spec.text, x, (cv.height * (i + 0.5)) / arr.length);
    });
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  draw(lines);
  mesh.userData.draw = draw;
  return mesh;
}

// ---------- people ----------
let personGeo;
export function personGeometry() {
  if (!personGeo) {
    const body = new THREE.CapsuleGeometry(0.24, 0.72, 4, 10);
    body.translate(0, 0.6, 0);
    const head = new THREE.SphereGeometry(0.19, 14, 10);
    head.translate(0, 1.42, 0);
    personGeo = mergeGeometries([body, head]);
  }
  return personGeo;
}
export function crowd(n, color = C.dark) {
  const m = new THREE.InstancedMesh(personGeometry(), mat(0xffffff), n);
  m.castShadow = true;
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) m.setColorAt(i, c);
  return m;
}

// ---------- instanced particles (requests, packets) ----------
export function dots(n, radius = 0.22) {
  const m = new THREE.InstancedMesh(new THREE.SphereGeometry(radius, 12, 8), glow(0xffffff), n);
  m.frustumCulled = false;
  const c = new THREE.Color(C.blue);
  for (let i = 0; i < n; i++) m.setColorAt(i, c);
  return m;
}
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
export function place(inst, i, pos, scale = 1, rotY = 0) {
  _p.set(pos[0], pos[1], pos[2]);
  _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
  _s.set(scale, scale, scale);
  inst.setMatrixAt(i, _m.compose(_p, _q, _s));
}
/** Quadratic arc from a to b, lifted by `lift` at the middle. */
export function arc(a, b, k, lift) {
  const mx = (a[0] + b[0]) / 2, mz = (a[2] + b[2]) / 2, my = Math.max(a[1], b[1]) + lift;
  const u = 1 - k;
  return [u * u * a[0] + 2 * u * k * mx + k * k * b[0], u * u * a[1] + 2 * u * k * my + k * k * b[1], u * u * a[2] + 2 * u * k * mz + k * k * b[2]];
}

// ---------- scenery ----------
export function scatterCity(parent, { seed = 7, n = 60, inner = 30, outer = 140, avoid = () => false } = {}) {
  const r = rng(seed);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const inst = new THREE.InstancedMesh(geo, mat(0xffffff), n);
  inst.castShadow = inst.receiveShadow = true;
  const col = new THREE.Color();
  for (let i = 0, made = 0; made < n && i < n * 20; i++) {
    const a = r() * Math.PI * 2, d = lerp(inner, outer, Math.sqrt(r()));
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (avoid(x, z)) continue;
    const w = 4 + r() * 8, h = 4 + Math.pow(r(), 2) * 34, dd = 4 + r() * 8;
    _p.set(x, 0, z);
    _q.identity();
    _s.set(w, h, dd);
    inst.setMatrixAt(made, _m.compose(_p, _q, _s));
    col.setHex(r() < 0.5 ? 0xd9d6ce : 0xc9c7c1);
    inst.setColorAt(made++, col);
  }
  parent.add(inst);
  return inst;
}
export function trees(parent, points, seed = 3) {
  const r = rng(seed);
  for (const [x, z] of points) {
    const s = 0.8 + r() * 0.7;
    const t = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 * s, 1), mat(C.tree, { flatShading: true }));
    t.position.set(x, 2.2 * s, z);
    t.castShadow = true;
    parent.add(t);
  }
}

/** A coach: body, stripe, roof, bogies, and a window list scenes can recolour. */
export function coach(parent, [x, y, z], { length = 22, stripe = C.blue } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  box(length, 3.2, 3.1, C.paper, [0, 0.9, 0], g);
  box(length + 0.02, 0.35, 3.14, stripe, [0, 1.35, 0], g);
  box(length - 0.4, 0.4, 2.8, C.light, [0, 4.1, 0], g);
  box(3, 0.8, 2.6, C.dark, [-length / 2 + 3, 0.1, 0], g);
  box(3, 0.8, 2.6, C.dark, [length / 2 - 3, 0.1, 0], g);
  const windows = [];
  const n = Math.floor(length / 2.1);
  for (let i = 0; i < n; i++) {
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 0.06), new THREE.MeshStandardMaterial({ color: 0x3a3d43, roughness: 0.3 }));
      w.position.set(-length / 2 + 1.4 + i * ((length - 2.8) / (n - 1)), 2.75, side * 1.57);
      g.add(w);
      windows.push(w);
    }
  }
  parent.add(g);
  g.userData.windows = windows;
  return g;
}

/** The IRCTC "machine": a dark tower with a grid of status lights. */
export function serverTower(parent, [x, y, z], { w = 9, h = 26, d = 9, rows = 14, cols = 5 } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  box(w, h, d, C.dark, [0, 0, 0], g);
  box(w + 0.6, 0.6, d + 0.6, C.ink, [0, h, 0], g);
  const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.42, 0.08), glow(0xffffff), rows * cols * 2);
  const col = new THREE.Color(0x4a4e57);
  let i = 0;
  for (const face of [1, -1]) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        place(lights, i, [((c + 0.5) / cols - 0.5) * (w - 1.6), 1.6 + (r / (rows - 1)) * (h - 3.5), face * (d / 2 + 0.05)]);
        lights.setColorAt(i++, col);
      }
    }
  }
  g.add(lights);
  g.userData.lights = lights;
  parent.add(g);
  return g;
}

export function phone(parent, [x, y, z], screenLines, { scale = 1, rotY = 0 } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  g.scale.setScalar(scale);
  box(2.2, 4.4, 0.32, C.ink, [0, 0, 0], g);
  const s = sign(screenLines, { w: 1.95, h: 3.95, bg: "#f3f1eb", fg: "#1d1e21", font: '700 70px "Inter Tight", "Anek Telugu"' });
  s.position.set(0, 2.2, 0.17);
  g.add(s);
  g.userData.screen = s;
  parent.add(g);
  return g;
}
