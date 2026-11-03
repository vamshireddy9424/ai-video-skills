// The stranger wedding (Yunnan, Oct 2026): LEMMiNO-style 3D reconstruction. Paper-cut diorama + real 3D props. Style: episodes/abroad/style.md
// (Vox paper/pastel cards, Johnny Harris map + stamps, MagnatesMedia dark-red money grade, LEMMiNO holds,
// Ali Abdaal brightness for the hopeful turn). Base helpers are shared with petrol/water.
import { THREE, shoot, mix3, prog, bakeTexture, lerp, crowd } from "/web/engine.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const captions = false;


// ---------------------------------------------------------------- helpers
const rand = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const outE = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const lin = (x) => x;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const fmt = (n) => Math.round(n).toLocaleString("en-IN");

// value noise + fbm, for every baked texture
function noise2(seed = 1) {
  const r = rand(seed * 7919 + 13);
  const P = 256, g = new Float32Array(P * P);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (x, y) => g[(((y % P) + P) % P) * P + (((x % P) + P) % P)];
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(at(xi, yi), at(xi + 1, yi), u), lerp(at(xi, yi + 1), at(xi + 1, yi + 1), u), v);
  };
  return (x, y, oct = 4) => {
    let s = 0, a = 0.5, f = 1, t = 0;
    for (let o = 0; o < oct; o++) { s += a * n(x * f, y * f); t += a; a *= 0.5; f *= 2; }
    return s / t;
  };
}

/** Paint a canvas pixel by pixel: fn(u, v) → [r, g, b]; baked, wrapped, sRGB. */
function paint(size, fn, { repeat = 1, srgb = true } = {}) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d", { willReadFrequently: true });
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = fn(x / size, y / size, x, y), i = (y * size + x) * 4;
    img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = bakeTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** Draw on a 2D canvas, then bake. */
function drawn(w, h, fn, srgb = true) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d", { willReadFrequently: true });
  fn(g, w, h);
  const t = bakeTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const texCache = {};
const once = (k, f) => texCache[k] || (texCache[k] = f());

/** Sun-cracked mud: voronoi plates, dark cracks, dusty tops. Colour + bump. */
function mud(seed = 3, tint = [186, 152, 112]) {
  return once("mud" + seed + tint, () => {
    const S = 512, r = rand(seed), N = 150, pts = [];
    for (let i = 0; i < N; i++) pts.push([r() * S, r() * S, 0.8 + r() * 0.35]);
    const nz = noise2(seed);
    const d1 = new Float32Array(S * S), d2 = new Float32Array(S * S), id = new Uint16Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let a = 1e9, b = 1e9, ai = 0;
      for (let i = 0; i < N; i++) {
        let dx = Math.abs(x - pts[i][0]), dy = Math.abs(y - pts[i][1]);
        if (dx > S / 2) dx = S - dx;
        if (dy > S / 2) dy = S - dy;
        const d = dx * dx + dy * dy;
        if (d < a) { b = a; a = d; ai = i; } else if (d < b) b = d;
      }
      const k = y * S + x;
      d1[k] = Math.sqrt(a); d2[k] = Math.sqrt(b); id[k] = ai;
    }
    const crack = (k) => clamp01((d2[k] - d1[k] - 1.2) / 3.5);
    const map = paint(S, (u, v, x, y) => {
      const k = y * S + x, c = crack(k), sh = pts[id[k]][2] * (0.86 + 0.28 * nz(u * 18, v * 18)), edge = 1 - 0.12 * clamp01(1 - d1[k] / 30);
      const m = sh * edge * (0.35 + 0.65 * c);
      return [tint[0] * m, tint[1] * m, tint[2] * m];
    });
    const bump = paint(S, (u, v, x, y) => { const k = y * S + x, h = 255 * (0.25 + 0.75 * crack(k)) * (0.9 + 0.1 * nz(u * 30, v * 30)); return [h, h, h]; }, { srgb: false });
    return { map, bump };
  });
}
/** Fine grain for concrete, plaster, rock, soil: base colour with mottling. */
function grain(seed, base, { scale = 12, amt = 0.25, size = 256, speck = 0 } = {}) {
  return once("grain" + seed + base + scale + amt + speck, () => {
    const nz = noise2(seed), r = rand(seed + 5);
    return paint(size, (u, v) => {
      let m = 1 - amt + 2 * amt * nz(u * scale, v * scale, 5);
      if (speck && r() < speck) m *= 0.55 + r() * 0.9;
      return [base[0] * m, base[1] * m, base[2] * m];
    });
  });
}
/** Tileable ripple normal map for water surfaces. */
function rippleNormal() {
  return once("ripple", () => {
    const nz = noise2(77), S = 256, h = (x, y) => nz(x * 6, y * 6, 4) + 0.5 * nz(x * 17 + 3, y * 17, 3);
    return paint(S, (u, v) => {
      const e = 1 / S, dx = (h(u + e, v) - h(u - e, v)) * 40, dy = (h(u, v + e) - h(u, v - e)) * 40;
      const l = Math.hypot(dx, dy, 1);
      return [(-dx / l * 0.5 + 0.5) * 255, (-dy / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255];
    }, { srgb: false });
  });
}
const waterMat = (color = 0x2f8fbf, { opacity = 0.86, repeat = 4, rough = 0.06 } = {}) => {
  const n = rippleNormal().clone();
  n.needsUpdate = true;
  n.repeat.set(repeat, repeat);
  return new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0.05, transparent: true, opacity, clearcoat: 1, clearcoatRoughness: 0.04, normalMap: n, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.6, depthWrite: true });
};
const glass = () => new THREE.MeshPhysicalMaterial({ color: 0xdfefff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 1, envMapIntensity: 2, side: THREE.DoubleSide, depthWrite: false });
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });
const glowMat = (color, k = 1.6) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });

/** A label plate (baked): lines of text on a coloured card. */
function plate(lines, { w = 4, h = 2, bg = "#ffffff", fg = "#1d1e21", px = 200, size = 120, radius = 0.12 } = {}) {
  const tex = drawn(Math.round(w * px), Math.round(h * px), (g, W, H) => {
    const r = radius * px;
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(0, 0, W, H, r);
    g.fill();
    g.textAlign = "center";
    g.textBaseline = "middle";
    const arr = Array.isArray(lines) ? lines : [lines];
    arr.forEach((l, i) => {
      const s = typeof l === "string" ? { text: l } : l;
      g.font = `${s.weight || 800} ${s.size || size}px "Inter Tight", "Anek Telugu"`;
      g.fillStyle = s.color || fg;
      g.fillText(s.text, W / 2, (H * (i + 0.5)) / arr.length + (s.dy || 0));
    });
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, transparent: true }));
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------- stage
let hemi, envTex;
const skyCache = {};
function sky(top, bottom) {
  const k = top + "-" + bottom;
  return skyCache[k] || (skyCache[k] = drawn(4, 512, (g, W, H) => {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#" + new THREE.Color(top).getHexString());
    grd.addColorStop(1, "#" + new THREE.Color(bottom).getHexString());
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
  }));
}
/**
 * One call per frame sets the whole look: sky gradient, haze, sun (direction relative to what the
 * camera looks at, and the size of its shadow box), fill, exposure, glow.
 */
function look(stage, { top = 0x7fa6cc, bottom = 0xe6d8c0, fog = 0.0025, fogCol = null, exposure = 0.95, sun = 3.2, sunCol = 0xfff0d8, sunDir = [35, 60, 25], shadow = 70, hemiI = 0.85, hemiSky = 0xdfe8f2, hemiGround = 0x8a7458, env = 0.55, bloom = null, near = 0.5, far = 4000, fov = 40, ao = false } = {}) {
  const sc = stage.scene;
  if (envTex === undefined) envTex = sc.environment;
  sc.background = sky(top, bottom);
  sc.fog = fog ? new THREE.FogExp2(fogCol ?? bottom, fog) : null;
  sc.environment = envTex;
  sc.environmentIntensity = env;
  stage.ground.visible = false;
  const s = stage.sun;
  s.visible = sun > 0;
  s.intensity = sun;
  s.color.set(sunCol);
  s.userData.dir = sunDir;
  const sc2 = s.shadow.camera;
  if (sc2.right !== shadow) {
    sc2.left = sc2.bottom = -shadow;
    sc2.right = sc2.top = shadow;
    sc2.far = shadow * 6;
    sc2.updateProjectionMatrix();
  }
  s.shadow.bias = -0.0002 * (shadow / 70);
  s.shadow.normalBias = 0.02 * Math.min(1, shadow / 20);
  if (!hemi) sc.traverse((o) => { if (o.isHemisphereLight) hemi = o; });
  hemi.intensity = hemiI;
  hemi.color.set(hemiSky);
  hemi.groundColor.set(hemiGround);
  stage.camera.near = near;
  stage.camera.far = far;
  stage.camera.fov = fov;
  stage.camera.updateProjectionMatrix();
  stage.renderer.toneMappingExposure = exposure;
  stage.bloom(bloom);
  stage.ao?.(ao);
  stage.dof(null);
}
/** Camera from → to, with the sun placed along its own direction from the target. */
function cam(stage, from, to) {
  shoot(stage, from, to);
  const d = stage.sun.userData.dir || [35, 60, 25], L = Math.hypot(...d), sh = stage.sun.shadow.camera.right * 2.2;
  stage.sun.position.set(to[0] + (d[0] / L) * sh, to[1] + (d[1] / L) * sh, to[2] + (d[2] / L) * sh);
}
/** Keyframed camera: [[t, from, to], ...] eased between keys. */
function camKeys(stage, t, keys) {
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
  const [ta, pa, la] = keys[i], [tb, pb, lb] = keys[Math.min(i + 1, keys.length - 1)];
  const k = tb > ta ? prog(t, ta, tb) : 1;
  cam(stage, mix3(pa, pb, k), mix3(la, lb, k));
}

// ---------------------------------------------------------------- models
const loader = new GLTFLoader();
const modelCache = {};
/** A model fitted to a size, base at y=0, centred; `hide` drops meshes whose material name matches. */
const retexCache = {};
async function model(path, { length, height, rotY = 0, hide = null, retex = null } = {}) {
  if (!modelCache[path]) modelCache[path] = loader.loadAsync(path);
  const src = (await modelCache[path]).scene.clone(true);
  if (retex) {
    const [re, url] = retex;
    if (!retexCache[url]) retexCache[url] = new THREE.TextureLoader().loadAsync(url).then((t) => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; });
    const tex = await retexCache[url];
    src.traverse((o) => { if (o.isMesh && re.test(o.material?.name || "")) { o.material = o.material.clone(); o.material.map = tex; } });
  }
  if (hide) { const drop = []; src.traverse((o) => { if (o.isMesh && hide.test(o.material?.name || "")) drop.push(o); }); drop.forEach((o) => o.removeFromParent()); }
  src.rotation.y = rotY;
  src.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(src, true);
  const size = box.getSize(new THREE.Vector3());
  const s = length ? length / Math.max(size.x, size.z) : height / size.y;
  const inner = new THREE.Group();
  inner.add(src);
  src.position.sub(box.getCenter(new THREE.Vector3())).add(V(0, size.y / 2, 0));
  inner.scale.setScalar(s);
  src.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.receiveShadow = true;
      if (o.material) o.material.envMapIntensity = 1;
    }
  });
  const outer = new THREE.Group();
  outer.add(inner);
  outer.userData.size = size.clone().multiplyScalar(s);
  return outer;
}

// ---------------------------------------------------------------- shared pieces
function groundPlane(size, { tex, bump, repeat = 8, color = 0xffffff, rough = 0.95, seg = 1, shape = null } = {}) {
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  if (shape) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, shape(p.getX(i), p.getZ(i)));
    geo.computeVertexNormals();
  }
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough });
  if (tex) { m.map = tex.clone(); m.map.needsUpdate = true; m.map.repeat.set(repeat, repeat); }
  if (bump) { m.bumpMap = bump.clone(); m.bumpMap.needsUpdate = true; m.bumpMap.repeat.set(repeat, repeat); m.bumpScale = 2.2; }
  const mesh = new THREE.Mesh(geo, m);
  mesh.receiveShadow = true;
  return mesh;
}
function mudGround(size = 400, repeat = 14, opts = {}) {
  const { map, bump } = mud(opts.seed || 3, opts.tint);
  return groundPlane(size, { tex: map, bump, repeat, ...opts });
}

/** A glass gauge with water inside: set(level) in world units. */

/** A glowing route tube that draws itself: set(k). */
function routeLine(points, color = 0xff8a1f, r = 0.09) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, 200, r, 8, false);
  const m = new THREE.Mesh(geo, glowMat(color, 1.4));
  const total = geo.index.count;
  m.userData.set = (k) => { geo.setDrawRange(0, Math.floor(total * clamp01(k) / 6) * 6); m.visible = k > 0.001; };
  m.userData.curve = curve;
  m.userData.set(0);
  return m;
}
/** A soft flame/glow blob (mesh, not a sprite — sprites break the AO pass). */
function flame(color = 0xff7a1a, s = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.5 * s, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), toneMapped: false, transparent: true, opacity: 0.9 }));
  m.scale.y = 1.8;
  return m;
}
/** A thin dark-red grid backdrop (MagnatesMedia money shots). */
function gridWall(w, h, color = "#2a0b0b", line = "rgba(255,70,50,0.22)") {
  const t = drawn(1024, 1024, (g, W, H) => {
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    g.strokeStyle = line; g.lineWidth = 2;
    for (let i = 0; i <= W; i += 48) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, H); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(W, i); g.stroke(); }
    const v = g.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.7);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.85)");
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
}
const NIGHT = { top: 0x07080c, bottom: 0x1b1410, fog: 0.02, fogCol: 0x0c0a09, exposure: 0.95, sun: 0, hemiI: 0.25, hemiSky: 0x6a7aa0, hemiGround: 0x1a120c, env: 0.25, bloom: { strength: 0.55, radius: 0.5, threshold: 0.85 }, near: 0.05 };


// ================================================================ paper-cut kit
// Every flat thing is a cut-out: a shape on a baked canvas with paper fibre, alpha-tested so it
// casts a real shadow on the layer behind it. Paper moves on 12 fps steps (stop-motion feel);
// the 3D props and the camera stay smooth, which is what makes the mix read as a diorama.
const SM = 12;
const step = (t) => Math.floor(t * SM) / SM;
const backOut = (x) => { x = clamp01(x); const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
/** Stop-motion pop 0→1 (with overshoot) starting at t0. */
const pop = (t, t0, d = 0.42) => (step(t) < t0 ? 0 : backOut((step(t) - t0) / d));
/** Smooth 0→1. */
const fade = (t, t0, d = 0.4) => prog(t, t0, t0 + d);
/** Per-step paper wobble, ±a radians. */
const wob = (t, seed, a = 0.012) => (rand(Math.floor(t * SM) * 31 + seed * 977 + 1)() - 0.5) * 2 * a;
const A = (ctx, word, frac = 0.5) => { try { return ctx.at(word); } catch { return ctx.start + (ctx.end - ctx.start) * frac; } };

let FIB;
function fibreCanvas() {
  if (FIB) return FIB;
  const S = 512, cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const g = cv.getContext("2d");
  const img = g.createImageData(S, S), n = noise2(5), r = rand(77);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = 236 + (n(x / 60, y / 60, 3) - 0.5) * 34 + (r() - 0.5) * 22 + (n(x / 2.5, y / 70, 2) - 0.5) * 18;
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v);
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return (FIB = cv);
}
/** A paper cut-out: draw(g, W, H) paints the shape; fibre is multiplied in, inside the shape only. */
function cutout(w, h, draw, { px = 170, fib = 1, rough = 0.95 } = {}) {
  const tex = drawn(Math.round(w * px), Math.round(h * px), (g, W, H) => {
    g.save(); draw(g, W, H); g.restore();
    const mask = document.createElement("canvas");
    mask.width = W; mask.height = H;
    mask.getContext("2d").drawImage(g.canvas, 0, 0);
    g.globalCompositeOperation = "multiply";
    g.globalAlpha = fib;
    const F = fibreCanvas();
    for (let y = 0; y < H; y += 512) for (let x = 0; x < W; x += 512) g.drawImage(F, x, y);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "destination-in";
    g.drawImage(mask, 0, 0);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: rough, side: THREE.DoubleSide }));
  m.castShadow = m.receiveShadow = true;
  return m;
}
/** Rounded rectangle path. */
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
/** A slightly hand-cut polygon outline (jittered corners) — scissors, not a ruler. */
function handRect(g, x, y, w, h, seed = 1, j = 6) {
  const r = rand(seed), J = () => (r() - 0.5) * 2 * j;
  g.beginPath();
  g.moveTo(x + J(), y + J()); g.lineTo(x + w + J(), y + J()); g.lineTo(x + w + J(), y + h + J()); g.lineTo(x + J(), y + h + J());
  g.closePath();
}
const FONT = (wt, size) => `${wt} ${size}px "Anek Telugu", "Inter Tight"`;
const FONTL = (wt, size) => `${wt} ${size}px "Inter Tight", "Anek Telugu"`;
/** Fit text into maxW by shrinking the font. */
function fitText(g, text, x, y, maxW, wt, size, latin = false) {
  let s = size;
  do { g.font = latin ? FONTL(wt, s) : FONT(wt, s); s -= 4; } while (g.measureText(text).width > maxW && s > 20);
  g.fillText(text, x, y);
}
/** A paper tag: hand-cut card with one or two lines. */
function tag(lines, { w = 2.2, h = 0.7, bg = "#fbf6ea", fg = "#1d1e21", seed = 3, size = 74, latin = false } = {}) {
  const arr = Array.isArray(lines) ? lines : [lines];
  return cutout(w, h, (g, W, H) => {
    handRect(g, 8, 8, W - 16, H - 16, seed);
    g.fillStyle = bg; g.fill();
    g.textAlign = "center"; g.textBaseline = "middle";
    arr.forEach((l, i) => {
      const s = typeof l === "string" ? { text: l } : l;
      g.fillStyle = s.color || fg;
      fitText(g, s.text, W / 2, (H * (i + 0.5)) / arr.length + 4, W - 50, s.weight || 700, s.size || size, s.latin ?? latin);
    });
  });
}
/** A rubber stamp: outlined rotated word, ink-roughened. */
function stamp(text, { w = 2.6, h = 0.9, color = "#d23a2c", rot = -0.18, size = 120 } = {}) {
  const m = cutout(w, h, (g, W, H) => {
    g.strokeStyle = color; g.lineWidth = 12;
    rr(g, 14, 14, W - 28, H - 28, 18); g.stroke();
    g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle";
    fitText(g, text, W / 2, H / 2 + 6, W - 70, 900, size, true);
    // ink breakup
    const r = rand(text.length * 13);
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 260; i++) { g.globalAlpha = 0.5 + r() * 0.5; g.fillRect(r() * W, r() * H, 2 + r() * 7, 2 + r() * 5); }
  }, { fib: 0.4 });
  m.rotation.z = rot;
  m.castShadow = false;
  return m;
}
/** A person silhouette: head + shoulders/body, in one paper colour. */
function person({ w = 1.0, h = 2.0, color = "#2f3b52", skin = null, hair = "#1b1b1f", bag = false, seed = 1, sit = false } = {}) {
  return cutout(w, h, (g, W, H) => {
    const cx = W / 2, hr = W * 0.2, hy = H * 0.17;
    // body
    g.fillStyle = color;
    g.beginPath();
    const top = hy + hr * 1.25, bw = W * 0.86;
    g.moveTo(cx - bw * 0.3, top);
    g.quadraticCurveTo(cx - bw / 2, top + 6, cx - bw / 2, top + H * 0.14);
    g.lineTo(cx - bw * (sit ? 0.5 : 0.42), H - 4);
    g.lineTo(cx + bw * (sit ? 0.5 : 0.42), H - 4);
    g.lineTo(cx + bw / 2, top + H * 0.14);
    g.quadraticCurveTo(cx + bw / 2, top + 6, cx + bw * 0.3, top);
    g.closePath(); g.fill();
    // neck + head
    g.fillStyle = skin || "#c98f6a";
    g.fillRect(cx - hr * 0.42, hy + hr * 0.6, hr * 0.84, hr * 0.9);
    g.beginPath(); g.ellipse(cx, hy, hr, hr * 1.1, 0, 0, Math.PI * 2); g.fill();
    // hair
    g.fillStyle = hair;
    g.beginPath(); g.ellipse(cx, hy - hr * 0.35, hr * 1.04, hr * 0.78, 0, Math.PI, Math.PI * 2); g.fill();
    if (bag) { g.fillStyle = "#e0a43a"; rr(g, cx + bw * 0.22, top + H * 0.1, W * 0.2, H * 0.3, 10); g.fill(); }
  });
}
/** A full paper backdrop sheet. */
function sheet(w, h, color, { lines = null, seed = 1 } = {}) {
  const m = cutout(w, h, (g, W, H) => {
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    if (lines) lines(g, W, H);
  }, { px: 90 });
  m.castShadow = false;
  return m;
}
function cloud(w = 1.6, color = "#ffffff", seed = 1) {
  return cutout(w, w * 0.55, (g, W, H) => {
    g.fillStyle = color;
    const r = rand(seed);
    g.beginPath();
    g.ellipse(W * 0.5, H * 0.7, W * 0.46, H * 0.28, 0, 0, Math.PI * 2);
    for (let i = 0; i < 4; i++) g.ellipse(W * (0.25 + i * 0.17), H * (0.52 - r() * 0.15), W * (0.14 + r() * 0.06), H * (0.3 + r() * 0.12), 0, 0, Math.PI * 2);
    g.fill();
  });
}
/** Layered hills / skyline strip across the bottom. */
function skyline(w, h, color, seed = 2, city = false) {
  return cutout(w, h, (g, W, H) => {
    g.fillStyle = color;
    const r = rand(seed);
    g.beginPath(); g.moveTo(0, H);
    if (city) {
      let x = 0;
      while (x < W) { const bw = 40 + r() * 90, bh = H * (0.25 + r() * 0.6); g.lineTo(x, H - bh); g.lineTo(x + bw, H - bh); x += bw; }
    } else for (let x = 0; x <= W; x += 20) g.lineTo(x, H * 0.45 + Math.sin(x / W * 6 + seed) * H * 0.18 + Math.sin(x / W * 17 + seed * 3) * H * 0.06);
    g.lineTo(W, H); g.closePath(); g.fill();
  });
}
/** A dashed route that draws itself in the plane z = const: set(k). */
function dashLine(points, color = "#ff8a1f", r = 0.03) {
  const curve = new THREE.CatmullRomCurve3(points);
  const N = 40, g = new THREE.Group(), segs = [];
  for (let i = 0; i < N; i++) {
    if (i % 2) continue;
    const a = curve.getPoint(i / N), b = curve.getPoint((i + 1) / N);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 6), std(color, { roughness: 0.9 }));
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    m.castShadow = true;
    g.add(m); segs.push([i / N, m]);
  }
  g.userData.set = (k) => segs.forEach(([u, m]) => (m.visible = u < k));
  g.userData.curve = curve;
  return g;
}
/** Paper look: daylight on a desk, long soft shadows to the lower right. */
const PAPER = { top: 0xf3ead8, bottom: 0xe9dcc2, fog: 0, exposure: 1.0, sun: 2.7, sunCol: 0xfff3e0, sunDir: [-3, 5, 7], shadow: 6, hemiI: 1.15, hemiSky: 0xffffff, hemiGround: 0xd6c6aa, env: 0.45, near: 0.1, far: 300, fov: 40 };
const DUSK = { ...PAPER, top: 0x0e1424, bottom: 0x18203a, sun: 1.1, sunCol: 0xffc68a, hemiI: 0.35, hemiSky: 0x7f8fc0, hemiGround: 0x20160f, env: 0.2, exposure: 1.0, bloom: { strength: 0.6, radius: 0.5, threshold: 0.8 } };
const paperLook = (stage, o = {}) => look(stage, { ...PAPER, ...o });
/** Gentle drifting camera on a stage at the origin, z distance d. */
function drift(stage, ctx, { d = 10, y = 0, from = [0.25, 0.1], to = [-0.2, -0.05], push = 0.9, lookY = 0 } = {}) {
  const k = prog(ctx.t, ctx.start, ctx.end, lin);
  const z = lerp(d, d * push, k);
  cam(stage, [lerp(from[0], to[0], k), y + lerp(from[1], to[1], k), z], [0, lookY, 0]);
}
const place3 = (o, x, y, z, s = 1) => { o.position.set(x, y, z); o.scale.setScalar(s); return o; };
/** Enter from below with a pop; returns k. */
function popIn(o, t, t0, { base = o.userData.base, dy = -0.6, spin = 0, seed = 0 } = {}) {
  if (!o.userData.base) o.userData.base = (base = o.position.clone());
  const k = pop(t, t0);
  o.visible = k > 0.001;
  o.position.set(base.x, base.y + (1 - Math.min(1, k)) * dy, base.z);
  o.rotation.z = (o.userData.rz || 0) + wob(t, seed + 1, 0.01) + (1 - Math.min(1, k)) * spin;
  if (o.userData.s0 === undefined) o.userData.s0 = o.scale.x;
  const s = Math.max(0.001, k) * o.userData.s0;
  o.scale.set(s, s, o.userData.s0);
  return k;
}
const INK = "#1d1e21", CREAM = "#fbf6ea", ORANGE = "#ff8a1f", RED = "#d23a2c", TEAL = "#2c7a7b", NAVY = "#24324f";

// ================================================================ wedding pieces (LEMMiNO restraint: fog, slow holds, small titles)
const COOL = { top: 0x6f7d8c, bottom: 0xb9b6ae, fog: 0.006, fogCol: 0xc9cdd2, exposure: 0.9, sun: 1.2, sunCol: 0xdfe6f0, sunDir: [-4, 3, 6], shadow: 14, hemiI: 0.7, hemiSky: 0xc9d2de, hemiGround: 0x5a554c, env: 0.3, near: 0.1, far: 500, fov: 38 };
const WARM = { ...COOL, top: 0x6a90c0, bottom: 0xf2c48a, fog: 0.003, fogCol: 0xe8c9a0, exposure: 1.0, sun: 2.2, sunCol: 0xffc88a, sunDir: [-6, 2.5, 4], hemiI: 0.8, hemiSky: 0xffd9b0, hemiGround: 0x4a2e1e, bloom: { strength: 0.5, radius: 0.5, threshold: 0.8 } };
const NITE = { ...COOL, top: 0x070a12, bottom: 0x141a26, fog: 0.008, fogCol: 0x0c1018, exposure: 0.95, sun: 0.25, sunCol: 0x8fa0c8, hemiI: 0.25, hemiSky: 0x5a6a90, hemiGround: 0x15100c, bloom: { strength: 0.35, radius: 0.4, threshold: 0.9 } };
const WRED = 0xc8102e;

// a small LEMMiNO-style title: letter-spaced caps, thin rule, bottom-left
if (typeof document !== "undefined" && !document.getElementById("lem-style")) {
  document.head.insertAdjacentHTML("beforeend", `<style id="lem-style">
    #lem { position:absolute; left:72px; bottom:330px; color:#fff; font-family:"Inter Tight","Anek Telugu"; text-shadow:0 2px 18px rgba(0,0,0,.5); transition:none; }
    #lem .k { font-size:28px; letter-spacing:.42em; font-weight:500; opacity:.85; }
    #lem .r { width:120px; height:2px; background:#fff; margin:14px 0 12px; opacity:.8; }
    #lem .t { font-size:46px; font-weight:700; letter-spacing:.06em; }
    #lem-big { position:absolute; left:0; right:0; top:46%; text-align:center; color:#fff; font:700 96px "Inter Tight","Anek Telugu"; letter-spacing:.02em; text-shadow:0 4px 30px rgba(0,0,0,.55); }
    #lem-big small { display:block; font-size:34px; letter-spacing:.38em; font-weight:500; opacity:.85; margin-top:14px; }
    #lem-tag { position:absolute; right:40px; top:40px; color:rgba(255,255,255,.65); font:500 22px "Inter Tight"; letter-spacing:.28em; }
  </style>`);
}
function lemDiv(id) { let d = document.getElementById(id); if (!d) { d = document.createElement("div"); d.id = id; document.getElementById("overlay").append(d); } return d; }
/** Lower title (kicker + title), faded by alpha. */
function lemTitle(kicker, title, alpha) { const d = lemDiv("lem"); d.style.opacity = alpha; if (alpha > 0) d.innerHTML = `<div class="k">${kicker}</div><div class="r"></div><div class="t">${title}</div>`; }
function lemBig(text, sub, alpha) { const d = lemDiv("lem-big"); d.style.opacity = alpha; if (alpha > 0) d.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ""}`; }
function lemTag(alpha = 1) { const d = lemDiv("lem-tag"); d.style.opacity = alpha; d.textContent = "3D RECONSTRUCTION"; }
function lemClear() { lemTitle("", "", 0); lemBig("", "", 0); }

/** The stage floor: a wide paved square with soft noise. */
function square(size = 160, color = [116, 112, 104]) {
  const f = groundPlane(size, { tex: grain(77, color, { scale: 26, amt: 0.22, size: 512 }), repeat: 10, rough: 0.9 });
  return f;
}
/** Simple tiled-roof houses around the square (procedural, light). */
function houses(g, n, { seed = 3, inner = 22, outer = 70, lit = 0 } = {}) {
  const r = rand(seed), out = [];
  const wallM = std(0xd8d2c4, { roughness: 0.9 }), roofM = std(0x3b3f44, { roughness: 0.7 });
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = inner + r() * (outer - inner);
    const w = 5 + r() * 5, h = 3.5 + r() * 4, dpt = 5 + r() * 4;
    const hg = new THREE.Group(); hg.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); hg.rotation.y = -a + Math.PI / 2;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, dpt), wallM); body.position.y = h / 2; body.castShadow = body.receiveShadow = true; hg.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, dpt) * 0.78, 2.2, 4), roofM); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, dpt / w); roof.position.y = h + 1.1; roof.castShadow = true; hg.add(roof);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.0), new THREE.MeshBasicMaterial({ color: 0x2a2a2a })); win.position.set(0, h * 0.55, dpt / 2 + 0.02); hg.add(win);
    hg.userData.win = win; g.add(hg); out.push(hg);
  }
  return out;
}
/** Red lanterns on strings across the square; set(k) lights them in order. */
async function lanterns(g, n, { y = 7, span = 24, seed = 9 } = {}) {
  const r = rand(seed), list = [];
  for (let i = 0; i < n; i++) {
    const L = await model("/assets/wd-lantern/model.glb", { height: 1.1 });
    const x = (i % 8 - 3.5) * (span / 8), z = (Math.floor(i / 8) - (n / 16) + 0.5) * 6;
    L.position.set(x, y + Math.sin(i) * 0.3, z); g.add(L);
    const glowL = new THREE.PointLight(0xff3020, 0, 9, 1.8); glowL.position.set(x, y - 0.2, z); g.add(glowL);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5a1a14), toneMapped: false })); core.position.set(x, y + 0.45, z); g.add(core);
    list.push({ L, glowL, core, d: r() });
  }
  return { set(k, t) { list.forEach((o, i) => { const on = clamp01(k * list.length - i); o.glowL.intensity = on * 5 * (1 + Math.sin(t * 3 + i) * 0.08); o.core.material.color.set(new THREE.Color(0x5a1a14).lerp(new THREE.Color(0xff5030).multiplyScalar(2.2), on)); }); } };
}
/** Banquet tables in a grid (instanced round tables + stools). */
function tables(g, rows, cols, gap = 4.2) {
  const n = rows * cols;
  const top = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.2, 1.2, 0.08, 28), std(0xb31b2a, { roughness: 0.7 }), n);
  const leg = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.1, 0.75, 8), std(0x3a2a20), n);
  const seats = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.22, 0.45, 12), std(0x8c1a24, { roughness: 0.8 }), n * 8);
  const M = new THREE.Matrix4(); let s = 0; const pos = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const x = (j - (cols - 1) / 2) * gap, z = (i - (rows - 1) / 2) * gap, k = i * cols + j;
    M.makeTranslation(x, 0.8, z); top.setMatrixAt(k, M); M.makeTranslation(x, 0.38, z); leg.setMatrixAt(k, M);
    for (let a = 0; a < 8; a++) { const an = (a / 8) * Math.PI * 2; M.makeTranslation(x + Math.cos(an) * 1.55, 0.23, z + Math.sin(an) * 1.55); seats.setMatrixAt(s++, M); pos.push([x + Math.cos(an) * 1.75, z + Math.sin(an) * 1.75]); }
  }
  [top, leg, seats].forEach((m) => { m.castShadow = m.receiveShadow = true; g.add(m); });
  return { top, seats, pos };
}
/** Real human figures: 8 low-poly people from one pack, each a separate instanced variant. */
let PEOPLE;
async function peopleGeos() {
  if (PEOPLE) return PEOPLE;
  const gl = await loader.loadAsync("/assets/wd-people/model.glb");
  gl.scene.updateMatrixWorld(true);
  const out = [];
  gl.scene.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    geo.computeBoundingBox();
    const b = geo.boundingBox, sc = 1.7 / (b.max.y - b.min.y);
    geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    geo.scale(sc, sc, sc); geo.computeVertexNormals();
    out.push(geo);
  });
  return (PEOPLE = out);
}
const CLOTHES = [0x2b2d33, 0x3a4a6a, 0x6a3b2e, 0x9a2430, 0x2f5a5a, 0xd6d0c4, 0x7a6a50, 0xb85a3a, 0x445566];
async function people(g, n, place, { colors = CLOTHES } = {}) {
  const geos = await peopleGeos(), k = geos.length;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true });
  const meshes = geos.map((geo) => { const m = new THREE.InstancedMesh(geo, mat, Math.ceil(n / k)); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; });
  const r = rand(5), P = [];
  for (let i = 0; i < n; i++) { const [x, z] = place(i, r); P.push([x, z, r() * Math.PI * 2, 0.9 + r() * 0.2]); meshes[i % k].setColorAt(Math.floor(i / k), new THREE.Color(colors[Math.floor(r() * colors.length)])); }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  return {
    show(count, t = 0) {
      for (let i = 0; i < n; i++) {
        const [x, z, rot, s] = P[i];
        const kk = i < count ? clamp01((count - i) / 80) : 0;
        S.set(s * kk, s * kk, s * kk); Q.setFromAxisAngle(Y, rot + Math.sin(t * 0.7 + i) * 0.12);
        M.compose(V(x, 0, z), Q, S); meshes[i % k].setMatrixAt(Math.floor(i / k), M);
      }
      meshes.forEach((m) => (m.instanceMatrix.needsUpdate = true));
    },
  };
}
/** One human figure (variant idx), tinted. */
async function person1(idx, color, scale = 1) {
  const geos = await peopleGeos();
  const m = new THREE.Mesh(geos[idx % geos.length], new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, transparent: true }));
  m.castShadow = true; m.scale.setScalar(scale); return m;
}
function sun(g, color = 0xffd9a0) { const m = new THREE.Mesh(new THREE.SphereGeometry(6, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), toneMapped: false, fog: false })); g.add(m); return m; }

// ================================================================ scenes
export const scenes = {
  // ------------------------------------------------ s1: an empty square at dawn; one chair; the lanterns come on
  hook: {
    sounds: (ctx) => [{ t: ctx.start, s: "wind", gain: 0.25 }, { t: A(ctx, "అపరిచితులందరినీ") - 0.2, s: "riser", gain: 0.35 }, { t: A(ctx, "ఊహించలేదు") - 0.1, s: "thud", gain: 0.5 }],
    async build(stage) {
      const g = new THREE.Group();
      g.add(square());
      houses(g, 26, { seed: 4 });
      const T = tables(g, 3, 4);
      const chair = await model("/assets/wd-banquet/model.glb", { length: 3.2 }); chair.position.set(0, 0, 9); g.add(chair);
      const lit = await lanterns(g, 16, { y: 6.5 });
      return {
        group: g,
        update(ctx) {
          const tu = A(ctx, "ఊహించలేదు");
          const warm = prog(ctx.t, tu - 0.3, tu + 1.2);
          look(stage, warm > 0.5 ? { ...COOL, top: 0x3a4a6a, bottom: 0xd9a070, fogCol: 0xc9a080, exposure: 0.95 } : COOL);
          lit.set(warm, ctx.t);
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [lerp(2, -1, k), lerp(3.2, 2.4, k), lerp(26, 15, k)], [0, 1.4, 4]);
          lemTag(1);
          lemTitle("YUNNAN, CHINA", "OCTOBER 2026", prog(ctx.t, ctx.start + 0.4, ctx.start + 1.4) * (1 - prog(ctx.t, ctx.start + 5, ctx.start + 6)));
          lemBig("", "", 0);
          void T;
        },
      };
    },
  },

  // ------------------------------------------------ s2: one small house at night; the family fades away, one by one
  childhood: {
    sounds: (ctx) => [{ t: ctx.start, s: "heartbeat", gain: 0.2 }, { t: A(ctx, "చనిపోయింది") - 0.2, s: "thud", gain: 0.35 }],
    async build(stage) {
      const g = new THREE.Group();
      g.add(square(120, [70, 74, 80]));
      const house = await model("/assets/wd-house/model.glb", { length: 12 }); house.position.set(0, 0, -6); g.add(house);
      const glowW = new THREE.PointLight(0xffb060, 3, 14, 1.8); glowW.position.set(0, 2.5, -1); g.add(glowW);
      const fam = [];
      for (const [x, sc, c, v] of [[-2.6, 1.05, 0x3a3f48, 0], [-1.3, 1.0, 0x8a3b4e, 1], [1.5, 0.95, 0x6a5a48, 5], [0.1, 0.62, 0x2f5a6a, 2], [0.75, 0.7, 0x2f5a6a, 6]]) { const m = await person1(v, c, sc); m.position.set(x, 0, 2.5); g.add(m); fam.push(m); }
      return {
        group: g,
        update(ctx) {
          look(stage, NITE);
          const tn = A(ctx, "నాన్న"), ta = A(ctx, "అమ్మ"), tg = A(ctx, "చనిపోయింది");
          [tn + 0.4, ta + 0.6, tg + 0.2].forEach((t0, i) => { const k = prog(ctx.t, t0, t0 + 1.2); fam[i].material.opacity = 1 - k; fam[i].visible = k < 0.99; });
          glowW.intensity = lerp(3, 1.2, prog(ctx.t, tg, tg + 2));
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [lerp(-5, 3, k), lerp(4.5, 3.2, k), lerp(24, 18, k)], [0, 2.4, -2]);
          lemTitle("XU CHENGHONG", "24", prog(ctx.t, ctx.start + 0.5, ctx.start + 1.3) * (1 - prog(ctx.t, tn - 0.6, tn - 0.1)));
          lemBig("", "", 0);
        },
      };
    },
  },

  // ------------------------------------------------ s3: a lone walk at dusk; savings stack; she arrives
  work: {
    sounds: (ctx) => [{ t: A(ctx, "లక్షా") - 0.1, s: "coins", gain: 0.35 }, { t: A(ctx, "ప్రేమించిన") - 0.1, s: "shimmer", gain: 0.35 }],
    async build(stage) {
      const g = new THREE.Group();
      g.add(square(200, [96, 92, 86]));
      const road = new THREE.Mesh(new THREE.PlaneGeometry(4, 200), std(0x3b3b3f, { roughness: 0.8 })); road.rotation.x = -Math.PI / 2; road.position.y = 0.02; g.add(road);
      const s = sun(g, 0xffb070); s.position.set(-60, 8, -120);
      const he = await person1(0, 0x2f4a5a), she = await person1(1, 0x9a2430); g.add(he, she);
      const coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.32, 0.07, 24), std(0xd4b04a, { metalness: 0.7, roughness: 0.3 }), 40); g.add(coins);
      const M = new THREE.Matrix4();
      return {
        group: g,
        update(ctx) {
          look(stage, { ...WARM, fog: 0.004 });
          const tl = A(ctx, "లక్షా"), tp = A(ctx, "ప్రేమించిన");
          const walk = prog(ctx.t, ctx.start, ctx.end, lin);
          const z = lerp(20, -4, walk);
          he.position.set(-0.6, Math.abs(Math.sin(ctx.t * 6)) * 0.04, z); he.rotation.y = Math.PI;
          const sk = prog(ctx.t, tp - 0.2, tp + 1.2);
          she.position.set(lerp(3, 0.6, sk), 0, z - 0.2); she.rotation.y = Math.PI; she.visible = sk > 0;
          for (let i = 0; i < 40; i++) { const on = ctx.t > tl - 0.4 + i * 0.03 ? 1 : 0; M.compose(V(2.4, 0.04 + i * 0.075, z + 1.5), new THREE.Quaternion(), V(on, on, on)); coins.setMatrixAt(i, M); }
          coins.instanceMatrix.needsUpdate = true;
          cam(stage, [5, 2.2, z + 9], [0, 1.5, z]);
          lemTitle("SAVED", "¥1,60,000", prog(ctx.t, tl + 0.2, tl + 0.8) * (1 - prog(ctx.t, tp - 0.4, tp)));
          lemBig("", "", 0);
        },
      };
    },
  },

  // ------------------------------------------------ s4: rows of empty banquet tables; the fear
  tables: {
    sounds: (ctx) => [{ t: ctx.start, s: "wind", gain: 0.25 }, { t: A(ctx, "tables") - 0.1, s: "tick", gain: 0.3 }],
    async build(stage) {
      const g = new THREE.Group();
      g.add(square(140, [104, 100, 94]));
      const T = tables(g, 6, 6);
      const few = await people(g, 10, (i) => T.pos[i * 3]);
      const L = await model("/assets/wd-lantern/model.glb", { height: 1.2 }); L.position.set(0, 6, 0); g.add(L);
      return {
        group: g,
        update(ctx) {
          look(stage, { ...COOL, sun: 1.0, exposure: 0.9 });
          few.show(10, ctx.t);
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [lerp(-14, 10, k), lerp(9, 6, k), lerp(22, 18, k)], [0, 0.8, 0]);
          lemBig("", "", 0); lemTitle("", "", 0);
        },
      };
    },
  },

  // ------------------------------------------------ s5: one phone in the dark; the video goes viral (light flies out)
  invite: {
    sounds: (ctx) => [{ t: A(ctx, "Douyin") - 0.1, s: "beep", gain: 0.35 }, { t: A(ctx, "viral") - 0.2, s: "swarm", gain: 0.45 }],
    async build(stage) {
      const g = new THREE.Group();
      const ph = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 0.12), std(0x111216, { roughness: 0.3, metalness: 0.4 })); ph.position.set(0, 1.55, 0.03); g.add(ph);
      const scr = plate([{ text: "నా పెళ్లికి", size: 70, weight: 600, color: "#fff" }, { text: "రండి", size: 90, weight: 600, color: "#fff" }, { text: "▶", size: 120, color: "#fff" }], { w: 1.3, h: 2.2, bg: "#c8102e", px: 220 });
      scr.material = new THREE.MeshBasicMaterial({ map: scr.material.map, toneMapped: false }); scr.position.set(0, 1.55, 0.12); g.add(scr);
      const bits = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd0a0).multiplyScalar(2.5), toneMapped: false }), 900); g.add(bits);
      const R = rand(7), dirs = Array.from({ length: 900 }, () => V(R() - 0.5, R() * 0.8 - 0.2, R() - 0.2).normalize());
      const M = new THREE.Matrix4();
      return {
        group: g,
        update(ctx) {
          look(stage, NITE);
          const tv = A(ctx, "viral");
          for (let i = 0; i < 900; i++) {
            const tt = ctx.t - tv - (i / 900) * 1.5;
            const on = tt > 0;
            const d = on ? tt * (5 + (i % 7)) : 0;
            M.compose(V(dirs[i].x * d, 1.5 + dirs[i].y * d, dirs[i].z * d), new THREE.Quaternion(), V(on ? 1 : 0, on ? 1 : 0, on ? 1 : 0)); bits.setMatrixAt(i, M);
          }
          bits.instanceMatrix.needsUpdate = true;
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [lerp(0.6, -0.4, k), lerp(1.7, 1.5, k), lerp(4.2, 9, prog(ctx.t, tv, ctx.end))], [0, 1.5, 0]);
          lemTitle("DOUYIN", "ONE VIDEO", prog(ctx.t, A(ctx, "Douyin"), A(ctx, "Douyin") + 0.6) * (1 - prog(ctx.t, tv - 0.3, tv)));
          lemBig("", "", 0);
        },
      };
    },
  },

  // ------------------------------------------------ s6: strangers arrive: chefs and woks, gifts, a car convoy, the luxury car
  arrive: {
    sounds: (ctx) => [{ t: ctx.start, s: "city", gain: 0.2 }, { t: A(ctx, "chefs") - 0.1, s: "heat", gain: 0.3 }, { t: A(ctx, "convoy") - 0.2, s: "whoosh", gain: 0.4 }, { t: A(ctx, "Maybach") - 0.2, s: "sparkle", gain: 0.4 }],
    async build(stage) {
      const g = new THREE.Group();
      g.add(square());
      houses(g, 24, { seed: 6 });
      const woks = [];
      for (let i = 0; i < 8; i++) { const w = await model("/assets/wd-wok/model.glb", { length: 1.2 }); w.position.set(-9 + i * 2.6, 0.9, -8); g.add(w); const st = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.2), std(0x6b6b70)); st.position.set(w.position.x, 0.45, -8); g.add(st); const fl = flame(0xff6a1a, 0.6); fl.position.set(w.position.x, 1.0, -8); g.add(fl); woks.push(fl); }
      const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), std(WRED, { roughness: 0.6 }), 24); g.add(boxes);
      const cars = []; for (let i = 0; i < 6; i++) { const c = await model("/assets/wd-cars/model.glb", { length: 4.4 }); c.scale.setScalar(1); g.add(c); cars.push(c); }
      const lux = await model("/assets/wd-cars/model.glb", { length: 5.2 }); lux.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color?.set?.(0x0c0c0e); o.material.metalness = 0.8; o.material.roughness = 0.25; } }); g.add(lux);
      const crowdA = await people(g, 600, (i, r) => [(r() - 0.5) * 26, 2 + (r() - 0.5) * 16]);
      const lit = await lanterns(g, 16, { y: 6.5 });
      const M = new THREE.Matrix4();
      return {
        group: g,
        update(ctx) {
          look(stage, { ...WARM, fog: 0.003 });
          const tc = A(ctx, "chefs"), ta = A(ctx, "appliances"), tcv = A(ctx, "convoy"), tm = A(ctx, "Maybach");
          lit.set(1, ctx.t);
          woks.forEach((f, i) => { const on = ctx.t > tc - 0.2 + i * 0.12; f.visible = on; f.scale.set(1, 1.6 + Math.sin(ctx.t * 14 + i) * 0.25, 1); });
          for (let i = 0; i < 24; i++) { const on = ctx.t > ta - 0.2 + i * 0.05 ? 1 : 0; M.compose(V(6 + (i % 6) * 0.9, 0.3 + Math.floor(i / 6) * 0.6, 4 + (i % 2) * 0.9), new THREE.Quaternion(), V(on, on, on)); boxes.setMatrixAt(i, M); }
          boxes.instanceMatrix.needsUpdate = true;
          cars.forEach((c, i) => { const k = prog(ctx.t, tcv - 0.4 + i * 0.35, tcv + 2.2 + i * 0.35); c.position.set(-13, 0, lerp(60, 14 - i * 6, k)); c.rotation.y = Math.PI; c.visible = ctx.t > tcv - 0.4 + i * 0.35; });
          const lk = prog(ctx.t, tm - 0.5, tm + 1.8); lux.position.set(-4, 0, lerp(50, 12, lk)); lux.rotation.y = Math.PI; lux.visible = ctx.t > tm - 0.5;
          crowdA.show(Math.floor(lerp(20, 600, prog(ctx.t, ctx.start, ctx.end, lin))), ctx.t);
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          camKeys(stage, ctx.t, [
            [ctx.start, [6, 3, 6], [-2, 1.2, -8]],
            [tcv - 0.5, [10, 5, 18], [0, 1, 2]],
            [tm - 0.4, [-1, 2.2, 24], [-4, 1.0, 14]],
            [ctx.end, [-6, 3.5, 30], [-4, 1.0, 12]],
          ]);
          lemTitle("A LUXURY CAR", "FOR THE COUPLE", prog(ctx.t, tm + 0.3, tm + 0.9));
          lemBig("", "", 0);
          void k;
        },
      };
    },
  },

  // ------------------------------------------------ s7: the square fills — 20,000; hotels full; the event moves
  crowd: {
    sounds: (ctx) => [{ t: A(ctx, "ఇరవై") - 0.3, s: "riser", gain: 0.45 }, { t: A(ctx, "hotels") - 0.1, s: "ding", gain: 0.3 }, { t: A(ctx, "Traffic") - 0.1, s: "city", gain: 0.25 }],
    async build(stage) {
      const g = new THREE.Group();
      g.add(square(260));
      const hs = houses(g, 60, { seed: 8, inner: 34, outer: 110 });
      const N = 9000;
      const mass = await people(g, N, (i, r) => { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 32; return [Math.cos(a) * d, Math.sin(a) * d]; });
      const lit = await lanterns(g, 32, { y: 8, span: 40 });
      const full = hs.map((h) => { const s = plate([{ text: "FULL", size: 150, color: "#fff" }], { w: 2.4, h: 1.0, bg: "#c8102e", px: 140 }); s.material = new THREE.MeshBasicMaterial({ map: s.material.map, toneMapped: false }); s.position.set(0, 5.5, 0); s.visible = false; h.add(s); return s; });
      const count = document.createElement("div"); count.id = "wd-count";
      return {
        group: g,
        update(ctx) {
          look(stage, { ...WARM, fog: 0.0015, far: 900 });
          const t20 = A(ctx, "ఇరవై"), th = A(ctx, "hotels"), tp = A(ctx, "public");
          lit.set(1, ctx.t);
          const grow = prog(ctx.t, ctx.start, t20 + 1.2);
          mass.show(Math.floor(lerp(600, N, grow)), ctx.t);
          full.forEach((s, i) => { s.visible = ctx.t > th - 0.2 + i * 0.03; s.quaternion.copy(stage.camera.quaternion); });
          const n = Math.round(lerp(600, 20000, grow) / 100) * 100;
          lemBig(n.toLocaleString("en-IN"), "STRANGERS", grow > 0.02 ? 1 - prog(ctx.t, th - 0.5, th) : 0);
          lemTitle("HOTELS", "100% FULL", prog(ctx.t, th + 0.2, th + 0.7) * (1 - prog(ctx.t, tp - 0.4, tp)));
          const k = prog(ctx.t, ctx.start, ctx.end);
          cam(stage, [lerp(8, 0, k), lerp(14, 70, k), lerp(30, 60, k)], [0, 0, 0]);
        },
      };
    },
  },

  // ------------------------------------------------ s8: was it a stunt? fake accounts fall away; the real one stays
  stunt: {
    sounds: (ctx) => [{ t: A(ctx, "stunt") - 0.1, s: "glitch", gain: 0.4 }, { t: A(ctx, "fake") - 0.1, s: "zaps", gain: 0.35 }, { t: A(ctx, "confirm") - 0.1, s: "chime", gain: 0.4 }],
    async build(stage) {
      const g = new THREE.Group();
      const R = rand(12), fakes = [];
      for (let i = 0; i < 42; i++) {
        const p = plate([{ text: "Xiao Xu", size: 34, color: "#ddd" }, { text: "fake?", size: 40, color: "#e04050" }], { w: 0.9, h: 1.5, bg: "#1b1e24", px: 160 });
        p.material = new THREE.MeshBasicMaterial({ map: p.material.map, toneMapped: false, transparent: true });
        p.position.set((R() - 0.5) * 9, 1.5 + (R() - 0.5) * 7, -2 - R() * 6); g.add(p); fakes.push(p);
      }
      const real = plate([{ text: "Xiao Xu", size: 54, color: "#fff" }, { text: "✓ REAL", size: 60, color: "#ffffff" }], { w: 1.4, h: 2.3, bg: "#c8102e", px: 180 });
      real.material = new THREE.MeshBasicMaterial({ map: real.material.map, toneMapped: false }); real.position.set(0, 1.5, 0.5); g.add(real);
      return {
        group: g,
        update(ctx) {
          look(stage, NITE);
          const tf = A(ctx, "fake"), tc = A(ctx, "confirm");
          fakes.forEach((p, i) => { const k = prog(ctx.t, tf + i * 0.03, tf + 0.8 + i * 0.03, lin); p.position.y -= 0; p.material.opacity = 1 - k; p.rotation.z = k * (i % 2 ? 0.6 : -0.6); p.scale.setScalar(1 - k * 0.5); });
          real.scale.setScalar(ctx.t > tc - 0.2 ? 1 + Math.sin(ctx.t * 3) * 0.02 : 0.001);
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [lerp(-1, 0.5, k), 1.5, lerp(10, 5, k)], [0, 1.5, 0]);
          lemTitle("DOUYIN", "100+ FAKE ACCOUNTS REMOVED", prog(ctx.t, tf + 0.6, tf + 1.2));
          lemBig("", "", 0);
        },
      };
    },
  },

  // ------------------------------------------------ s9: golden hour — the couple at the centre; strangers around them
  ending: {
    sounds: (ctx) => [{ t: A(ctx, "కుటుంబం") - 0.3, s: "shimmer", gain: 0.35 }, { t: A(ctx, "Comment") - 0.2, s: "chime", gain: 0.35 }],
    async build(stage) {
      const g = new THREE.Group();
      g.add(square(220));
      houses(g, 40, { seed: 11, inner: 34, outer: 100 });
      const mass = await people(g, 6000, (i, r) => { const a = r() * Math.PI * 2, d = 4 + Math.sqrt(r()) * 30; return [Math.cos(a) * d, Math.sin(a) * d]; });
      const couple = await model("/assets/wd-couple/model.glb", { height: 1.9 }); couple.position.set(0, 0, 0); g.add(couple);
      const spot = new THREE.PointLight(0xffd08a, 4, 10, 1.8); spot.position.set(0, 5, 1); g.add(spot);
      const lit = await lanterns(g, 32, { y: 8, span: 40 });
      const s = sun(g, 0xffb060); s.position.set(-120, 14, -160);
      return {
        group: g,
        update(ctx) {
          look(stage, { ...WARM, fog: 0.0015, far: 900 });
          lit.set(1, ctx.t); mass.show(6000, ctx.t);
          const tk = A(ctx, "కుటుంబం"), tc = A(ctx, "Comment");
          const k = prog(ctx.t, ctx.start, ctx.end);
          cam(stage, [lerp(2.5, 14, k), lerp(1.8, 24, k), lerp(5, 30, k)], [0, lerp(1.2, 0, k), 0]);
          lemBig("Family is also", "WHO SHOWS UP", prog(ctx.t, tk + 2.5, tk + 3.5) * (1 - prog(ctx.t, tc - 0.6, tc - 0.2)));
          lemTitle("", "", 0);
          ctx.O.chip("cm", "మీ జీవితంలో అలాంటి అపరిచితులు ఉన్నారా? Comment 👇", { alpha: prog(ctx.t, tc - 0.4, tc), top: 1560, kind: "big" });
          void couple;
        },
      };
    },
  },
};
