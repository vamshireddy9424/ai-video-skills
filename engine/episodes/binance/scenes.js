// Binance heist, 29 Oct 2026. Paper-cut diorama + real 3D props. Style: episodes/abroad/style.md
// (Vox paper/pastel cards, Johnny Harris map + stamps, MagnatesMedia dark-red money grade, LEMMiNO holds,
// Ali Abdaal brightness for the hopeful turn). Base helpers are shared with petrol/water.
import { THREE, shoot, mix3, prog, bakeTexture, lerp } from "/web/engine.js";
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

// ================================================================ heist pieces
const HEIST = { ...NIGHT, top: 0x050508, bottom: 0x0d0a10, fog: 0.03, fogCol: 0x070609, sun: 1.0, sunCol: 0xc8d4ff, sunDir: [-2, 5, 4], shadow: 6, hemiI: 0.3, hemiSky: 0x6070a0, hemiGround: 0x120a0a, bloom: { strength: 0.8, radius: 0.55, threshold: 0.75 }, near: 0.05, fov: 40 };
const NEON = "#ff2d55", ICE = "#7fd8ff", GOLD = "#f7b733";
/** A red alarm beacon: a rotating spotlight + glowing cap. */
function alarm(g, x, y, z) {
  const l = new THREE.SpotLight(0xff1a2a, 60, 14, 0.5, 0.5, 1.2); l.position.set(x, y, z); g.add(l, l.target);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10), glowMat(0xff2030, 3)); cap.position.set(x, y, z); g.add(cap);
  return (t) => { const a = t * 5; l.target.position.set(x + Math.cos(a) * 4, y - 3, z + Math.sin(a) * 4); cap.material.color.setRGB(3 * (0.6 + 0.4 * Math.sin(t * 10)), 0.2, 0.3); };
}
/** A glowing digital readout plate, baked per value (cache). */
const readCache = {};
function readout(text, { w = 2.6, h = 0.8, color = NEON, size = 150 } = {}) {
  const k = text + color + w;
  if (!readCache[k]) readCache[k] = drawn(Math.round(w * 200), Math.round(h * 200), (c, W, H) => {
    c.fillStyle = "rgba(8,6,10,0.88)"; rr(c, 0, 0, W, H, 18); c.fill();
    c.strokeStyle = color; c.lineWidth = 5; rr(c, 6, 6, W - 12, H - 12, 14); c.stroke();
    c.fillStyle = color; c.textAlign = "center"; c.textBaseline = "middle"; c.shadowColor = color; c.shadowBlur = 24;
    fitText(c, text, W / 2, H / 2 + 6, W - 40, 800, size, true);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: readCache[k], transparent: true, toneMapped: false }));
  return m;
}
function setReadout(m, text, o) { const n = readout(text, o); m.material.map = n.material.map; m.material.needsUpdate = true; }
/** Coins bursting out of a point toward the camera (instanced copies of a GLB). */
async function coinBurst(g, path, n, seed) {
  const proto = await model(path, { length: 0.45 });
  const coins = Array.from({ length: n }, (_, i) => { const c = proto.clone(true); g.add(c); const r = rand(seed + i); c.userData.v = [(r() - 0.5) * 3, 1.5 + r() * 2.5, 2 + r() * 4]; c.userData.spin = [r() * 6, r() * 6]; c.userData.d = r() * 1.2; return c; });
  return (t, t0, origin = [0, 0, 0]) => coins.forEach((c) => {
    const tt = t - t0 - c.userData.d;
    c.visible = tt > 0 && tt < 3.5;
    if (!c.visible) return;
    const [vx, vy, vz] = c.userData.v;
    c.position.set(origin[0] + vx * tt, origin[1] + vy * tt - 2.2 * tt * tt, origin[2] + vz * tt);
    c.rotation.set(c.userData.spin[0] * tt, c.userData.spin[1] * tt, 0);
  });
}
/** Red string between two points (evidence board), drawn by k. */
function redString(a, b) {
  const geo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6); geo.translate(0, 0.5, 0);
  const m = new THREE.Mesh(geo, std(0xd0202a, { roughness: 0.6 }));
  m.position.copy(a); m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  const L = a.distanceTo(b);
  m.userData.set = (k) => { m.scale.set(1, Math.max(0.001, L * clamp01(k)), 1); m.visible = k > 0.001; };
  m.userData.set(0); m.castShadow = true;
  return m;
}
/** Dark satellite map crop, facing the camera, w units wide. */
async function darkMap(lon0, lon1, lat0, lat1, w) {
  const tex = await new THREE.TextureLoader().loadAsync("/assets/earth/earth_atmos_2048.jpg");
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
  tex.offset.set((lon0 + 180) / 360, (lat0 + 90) / 180); tex.repeat.set((lon1 - lon0) / 360, (lat1 - lat0) / 180);
  const h = w * (lat1 - lat0) / (lon1 - lon0) * 1.25;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, color: 0xdfe6f2, roughness: 0.95, emissive: 0x141a24 }));
  m.receiveShadow = true;
  m.userData.P = (lat, lon, z = 0.02) => V(((lon - lon0) / (lon1 - lon0) - 0.5) * w, ((lat - lat0) / (lat1 - lat0) - 0.5) * h, z);
  return m;
}
const fmtB = (x) => `$${x.toFixed(2)}B`;
/** Laptop screen: a dim, tinted glow instead of a blown-out white panel. */
function darkScreen(lap, color = 0x2a0a10, glow = 0.5) {
  lap.traverse((o) => { if (o.isMesh && /Screen/i.test(o.material?.name || "")) { o.material = new THREE.MeshStandardMaterial({ color: 0x050507, emissive: color, emissiveIntensity: glow, roughness: 0.2 }); } });
}

// ================================================================ scenes
export const scenes = {
  // ------------------------------------------------ s1: BREAKING — the vault opens, $6.3 BILLION, 20 minutes; twist: Bitcoin wasn't hacked
  hook: {
    sounds: (ctx) => [
      { t: ctx.start, s: "alarm", gain: 0.35 },
      { t: ctx.start + 0.1, s: "thud", gain: 0.6 },
      { t: A(ctx, "billion") - 0.1, s: "stamp", gain: 0.7 },
      { t: A(ctx, "యాభై") - 0.1, s: "coins", gain: 0.5 },
      { t: A(ctx, "ఇరవై") - 0.1, s: "tick", gain: 0.5 },
      { t: A(ctx, "twist") - 0.1, s: "glitch", gain: 0.6 },
      { t: A(ctx, "system") - 0.1, s: "thud", gain: 0.5 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const wall = gridWall(16, 18, "#0c0a10", "rgba(255,45,85,0.10)"); wall.position.z = -3; g.add(wall);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), std(0x0e0d12, { roughness: 0.35, metalness: 0.4 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -2.4; floor.receiveShadow = true; g.add(floor);
      const vault = await model("/assets/sf-vault/model.glb", { height: 4.0 }); vault.position.set(0, -2.4, -1.6); g.add(vault);
      const inner = new THREE.PointLight(0xffb347, 0, 8, 1.6); inner.position.set(0, -0.6, -1.0); g.add(inner);
      const spin = alarm(g, -2.0, 2.6, -0.5), spin2 = alarm(g, 2.0, 2.6, -0.5);
      const btc = await coinBurst(g, "/assets/sf-btc/model.glb", 26, 11), eth = await coinBurst(g, "/assets/sf-eth/model.glb", 16, 71);
      // breaking-news strip
      const strip = cutout(3.3, 0.48, (c, W, H) => { c.fillStyle = "#c1121f"; c.fillRect(0, 0, W, H); c.fillStyle = "#fff"; c.fillRect(0, 0, W * 0.34, H); c.fillStyle = "#c1121f"; c.textBaseline = "middle"; fitText(c, "BREAKING", 14, H / 2 + 3, W * 0.32, 900, 60, true); c.fillStyle = "#fff"; fitText(c, "BINANCE HACKED", W * 0.37, H / 2 + 3, W * 0.6, 800, 60, true); }, { fib: 0.15 });
      strip.position.set(0, 2.85, 0.7); strip.castShadow = false; g.add(strip);
      const timer = readout("20:00", { w: 2.4, h: 0.8 }); timer.position.set(0, 2.1, 0.6); g.add(timer);
      const big = readout("$6.3 BILLION", { w: 3.0, h: 0.95, color: GOLD, size: 190 }); big.position.set(0, 0.9, 1.6); g.add(big);
      const inr = tag([{ text: "₹50,000+ కోట్లు", size: 110, color: "#fff" }], { w: 3.0, h: 0.75, bg: "#c1121f", seed: 501 }); inr.position.set(0, -0.15, 1.7); g.add(inr);
      // twist: a bitcoin with a shield ("not hacked"), and the withdrawal system lit red
      const coin = await model("/assets/sf-btc/model.glb", { length: 1.3 }); coin.position.set(-0.6, -0.6, 1.4); g.add(coin);
      const nh = tag([{ text: "BITCOIN ✓", size: 70, latin: true, color: "#1f8a4c" }, { text: "hack కాలేదు", size: 60 }], { w: 1.6, h: 0.8, seed: 502 }); nh.position.set(-0.6, 0.55, 1.6); g.add(nh);
      const sys = tag([{ text: "WITHDRAWAL", size: 66, latin: true, color: "#fff" }, { text: "SYSTEM ✗", size: 66, latin: true, color: "#fff" }], { w: 1.7, h: 0.85, bg: "#c1121f", seed: 503 }); sys.position.set(0.75, -0.1, 1.7); g.add(sys);
      return {
        group: g,
        update(ctx) {
          look(stage, HEIST);
          spin(ctx.t); spin2(ctx.t);
          const tb = A(ctx, "billion"), ty = A(ctx, "యాభై"), t20 = A(ctx, "ఇరవై"), ttw = A(ctx, "twist"), tbtc = A(ctx, "Bitcoin"), tsys = A(ctx, "system");
          inner.intensity = 12 * prog(ctx.t, ctx.start, ctx.start + 0.8);
          const before = ctx.t < ttw - 0.2;
          strip.visible = true; strip.position.x = lerp(4.5, 0, prog(ctx.t, ctx.start, ctx.start + 0.5));
          const left = Math.max(0, Math.round(20 * (1 - prog(ctx.t, t20 - 0.2, t20 + 2.0, lin))));
          setReadout(timer, `${String(left).padStart(2, "0")}:00`, { w: 2.4, h: 0.8 });
          timer.visible = before;
          const bk = pop(ctx.t, tb - 0.2, 0.3); big.visible = bk > 0 && before; big.scale.setScalar(Math.max(0.001, lerp(1.8, 1, Math.min(1, bk))));
          btc(ctx.t, tb - 0.4, [0, -0.8, -1.0]); eth(ctx.t, tb - 0.2, [0, -0.8, -1.0]);
          popIn(inr, ctx.t, ty - 0.1, { seed: 3 }); if (!before) inr.visible = false;
          const ck = pop(ctx.t, tbtc - 0.3); coin.visible = !before && ck > 0; coin.scale.setScalar(Math.max(0.001, Math.min(1, ck))); coin.rotation.y = ctx.t * 1.2;
          popIn(nh, ctx.t, tbtc, { seed: 4 }); if (before) nh.visible = false;
          popIn(sys, ctx.t, tsys - 0.4, { seed: 5 });
          camKeys(stage, ctx.t, [
            [ctx.start, [0, 0.6, 8.6], [0, 0.8, -0.5]],
            [tb, [0.3, 0.5, 9.0], [0, 0.6, 0]],
            [ttw, [0, 0.4, 8.0], [0, 0.3, 0]],
            [ctx.end, [0, 0.2, 8.4], [0, 0.1, 0.8]],
          ]);
        },
      };
    },
  },
  // ------------------------------------------------ s2: what Binance is — the server floor, crores of users
  target: {
    sounds: (ctx) => [{ t: ctx.start, s: "zaps", gain: 0.15 }, { t: A(ctx, "users") - 0.1, s: "swarm", gain: 0.3 }, { t: A(ctx, "October") - 0.1, s: "alarm", gain: 0.3 }],
    async build(stage) {
      const g = new THREE.Group();
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), std(0x0b0c12, { roughness: 0.3, metalness: 0.5 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -2.4; floor.receiveShadow = true; g.add(floor);
      for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) { const r = await model("/assets/sf-server/model.glb", { height: 2.6 }); r.position.set(row ? 1.5 : -1.5, -2.4, -i * 1.2); r.rotation.y = row ? -Math.PI / 2 : Math.PI / 2; g.add(r); }
      const leds = Array.from({ length: 60 }, (_, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.02), glowMat(i % 3 ? 0x40ff90 : 0x40a0ff, 3)); const r = rand(i * 7); m.position.set(r() > 0.5 ? 1.05 : -1.05, -2.0 + r() * 2.1, -r() * 6.5); g.add(m); return m; });
      const name = tag([{ text: "BINANCE", size: 120, latin: true, color: GOLD }, { text: "Crypto కొనడం · అమ్మడం", size: 58, color: "#fff" }], { w: 3.0, h: 1.1, bg: "#111318", seed: 510 });
      name.position.set(0, 0.45, -0.5); name.scale.setScalar(0.6); g.add(name);
      const coins = [["BTC", "#f7931a"], ["ETH", "#627eea"]].map(([n, col], i) => { const t = tag([{ text: n, size: 80, latin: true, color: "#fff" }], { w: 0.8, h: 0.42, bg: col, seed: 511 + i }); t.position.set(i ? 0.6 : -0.6, -0.25, -0.4); t.scale.setScalar(0.6); g.add(t); return t; });
      const users = readout("కోట్ల మంది users", { w: 2.4, h: 0.5, color: ICE, size: 80 }); users.position.set(0, -0.7, -0.4); users.scale.setScalar(0.6); g.add(users);
      const when = readout("29 OCT 2026 · SECURITY BREACH", { w: 3.2, h: 0.5, color: NEON, size: 80 }); when.position.set(0, -1.15, -0.4); when.scale.setScalar(0.6); g.add(when);
      return {
        group: g,
        update(ctx) {
          look(stage, HEIST);
          leds.forEach((l, i) => (l.visible = Math.floor(ctx.t * 8 + i * 1.7) % 3 !== 0));
          popIn(name, ctx.t, ctx.start + 0.2, { seed: 1 });
          coins.forEach((c, i) => popIn(c, ctx.t, A(ctx, i ? "Ethereum" : "Bitcoin") - 0.1, { seed: 2 + i }));
          users.visible = ctx.t > A(ctx, "users") - 0.2;
          when.visible = ctx.t > A(ctx, "October") - 0.1 && Math.floor(ctx.t * 4) % 4 !== 0;
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [0, lerp(-0.6, -0.2, k), lerp(6.0, 4.4, k)], [0, lerp(-0.4, -0.2, k), -6]);
        },
      };
    },
  },

  // ------------------------------------------------ s3: hot wallet vs cold wallet
  wallets: {
    sounds: (ctx) => [{ t: A(ctx, "Cold") - 0.1, s: "clunk", gain: 0.5 }, { t: A(ctx, "Hot") - 0.1, s: "zaps", gain: 0.3 }, { t: A(ctx, "దాడి") - 0.1, s: "alarm", gain: 0.4 }],
    async build(stage) {
      const g = new THREE.Group();
      const wall = gridWall(16, 18, "#07080c", "rgba(127,216,255,0.08)"); wall.position.z = -1.5; g.add(wall);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), std(0x0d0e14, { roughness: 0.4, metalness: 0.3 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -2.2; floor.receiveShadow = true; g.add(floor);
      // cold: vault + padlock, ice-blue, no cable
      const cold = new THREE.Group(); cold.position.set(0, 1.25, 0); g.add(cold);
      const vault = await model("/assets/sf-vault/model.glb", { height: 1.5 }); vault.position.set(-0.8, -0.75, -0.3); cold.add(vault);
      const lock = await model("/assets/sf-padlock/model.glb", { height: 0.7 }); lock.position.set(0.7, -0.3, 0.2); cold.add(lock);
      const coldL = tag([{ text: "COLD WALLET", size: 80, latin: true, color: "#0b2a3a" }, { text: "Offline · safe లో దాచినట్టు", size: 54 }], { w: 2.9, h: 0.85, bg: "#bfe9ff", seed: 520 });
      coldL.position.set(0, 1.25, 0.4); cold.add(coldL);
      const noNet = tag([{ text: "NO INTERNET", size: 60, latin: true, color: "#0b2a3a" }], { w: 1.6, h: 0.42, bg: "#e8f6ff", seed: 521 }); noNet.position.set(0.9, 0.45, 0.5); cold.add(noNet);
      const coldLight = new THREE.PointLight(0x7fd8ff, 4, 5, 2); coldLight.position.set(0, 0.5, 1.5); cold.add(coldLight);
      // hot: laptop/phone with a live cable to a cloud, coins flowing, red
      const hot = new THREE.Group(); hot.position.set(0, -1.6, 0); g.add(hot);
      const lap = await model("/assets/sf-laptop/model.glb", { length: 1.2 }); lap.position.set(-0.8, -0.55, 0.2); darkScreen(lap, 0x602010, 0.4); hot.add(lap);
      const cloudC = cloud(1.2, "#ffb3a7", 7); cloudC.position.set(0.9, 0.4, 0); hot.add(cloudC);
      const cable = routeLine([V(-0.6, -0.2, 0.3), V(0.0, 0.5, 0.3), V(0.7, 0.35, 0.1)], 0xff6a3d, 0.025); hot.add(cable);
      const pulses = Array.from({ length: 5 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), glowMat(0xffc040, 3)); hot.add(m); return m; });
      const hotL = tag([{ text: "HOT WALLET", size: 80, latin: true, color: "#fff" }, { text: "Online · రోజువారీ withdrawals", size: 54, color: "#ffe0d8" }], { w: 2.9, h: 0.85, bg: "#c1121f", seed: 522 });
      hotL.position.set(0, 1.15, 0.5); hot.add(hotL);
      const target = stamp("TARGET", { w: 1.8, h: 0.7, color: NEON, rot: -0.15, size: 120 }); target.position.set(0.6, -0.35, 0.9); hot.add(target);
      return {
        group: g,
        update(ctx) {
          look(stage, HEIST);
          const tc = A(ctx, "Cold"), th = A(ctx, "Hot"), ta = A(ctx, "దాడి");
          const ck = pop(ctx.t, tc - 0.3); cold.visible = ck > 0; cold.scale.setScalar(Math.max(0.001, Math.min(1, ck)));
          lock.rotation.y = ctx.t * 0.5;
          const hk = pop(ctx.t, th - 0.3); hot.visible = hk > 0; hot.scale.setScalar(Math.max(0.001, Math.min(1, hk)));
          cable.userData.set(prog(ctx.t, th, th + 0.8));
          pulses.forEach((m, i) => { const u = ((ctx.t * 0.6 + i / 5) % 1); m.position.copy(cable.userData.curve.getPoint(u)); m.visible = ctx.t > th + 0.8; });
          const tk = pop(ctx.t, ta - 0.05, 0.25); target.visible = tk > 0; target.scale.setScalar(lerp(2, 1, Math.min(1, tk)));
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [lerp(0.2, -0.2, k), -0.3, lerp(10.0, 9.4, k)], [0, -0.3, 0]);
        },
      };
    },
  },
  // ------------------------------------------------ s3: 36 hours earlier — the evidence board with red string
  prep: {
    sounds: (ctx) => [
      { t: ctx.start + 0.1, s: "paper", gain: 0.5 },
      { t: A(ctx, "Tornado") - 0.1, s: "paper", gain: 0.5 },
      { t: A(ctx, "test") - 0.1, s: "paper", gain: 0.5 },
      { t: A(ctx, "rehearsal") - 0.1, s: "stamp", gain: 0.5 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const cork = sheet(12, 16, "#5a3d26", { lines: (c, W, H) => { const r = rand(5); for (let i = 0; i < 9000; i++) { c.fillStyle = r() > 0.5 ? "rgba(30,15,5,0.45)" : "rgba(200,150,100,0.25)"; c.fillRect(r() * W, r() * H, 2, 2); } } });
      cork.position.z = -0.4; g.add(cork);
      const lamp = new THREE.SpotLight(0xffe2b0, 30, 14, 0.6, 0.6, 1.3); lamp.position.set(0, 3, 4); lamp.target.position.set(0, 0, 0); lamp.castShadow = true; g.add(lamp, lamp.target);
      const cards = [
        [[-0.85, 2.3], ["T − 36 HRS", "#c1121f"], "Plan starts"],
        [[0.9, 1.4], ["TORNADO CASH", INK], "mixer · small amounts"],
        [[-0.9, 0.3], ["TEST WALLET 1 ✓", INK], "code works"],
        [[0.9, -0.7], ["TEST WALLET 2 ✓", INK], "again"],
        [[-0.4, -2.0], ["FULL REHEARSAL ✓", "#c1121f"], "wallet 3"],
      ].map(([[x, y], [t1, col], t2], i) => {
        const c = tag([{ text: t1, size: 70, latin: true, color: col }, { text: t2, size: 50, latin: true, color: "#555" }], { w: 1.5, h: 0.75, bg: i % 2 ? "#fffdf2" : "#fff6d6", seed: 520 + i });
        c.position.set(x * 0.82, y, 0); c.userData.rz = (i % 2 ? -1 : 1) * 0.07; g.add(c);
        const pin = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), std(0xd0202a, { roughness: 0.3 })); pin.position.set(x * 0.82, y + 0.3, 0.06); g.add(pin);
        return [c, pin];
      });
      const strings = [];
      for (let i = 0; i < cards.length - 1; i++) { const s = redString(cards[i][1].position.clone(), cards[i + 1][1].position.clone()); g.add(s); strings.push(s); }
      const photo = cutout(1.0, 1.2, (c, W, H) => { c.fillStyle = "#e8e4da"; c.fillRect(0, 0, W, H); c.fillStyle = "#1b1b1f"; c.fillRect(14, 14, W - 28, H * 0.78); c.fillStyle = "#3a3a44"; c.beginPath(); c.arc(W / 2, H * 0.32, W * 0.16, 0, 7); c.fill(); c.beginPath(); c.ellipse(W / 2, H * 0.78, W * 0.3, H * 0.22, 0, Math.PI, 0); c.fill(); c.fillStyle = "#fff"; c.font = FONTL(900, 120); c.textAlign = "center"; c.fillText("?", W / 2, H * 0.42); });
      photo.position.set(0.95, 2.65, 0.02); photo.rotation.z = -0.08; g.add(photo);
      return {
        group: g,
        update(ctx) {
          paperLook(stage, { top: 0x1a120c, bottom: 0x1a120c, sun: 0.9, sunCol: 0xffd8a0, hemiI: 0.35, exposure: 0.95, sunDir: [-2, 4, 6], shadow: 5 });
          const times = [ctx.start + 0.1, A(ctx, "Tornado") - 0.1, A(ctx, "test") - 0.2, A(ctx, "test") + 0.5, A(ctx, "rehearsal") - 0.2];
          cards.forEach(([c, p], i) => { popIn(c, ctx.t, times[i], { seed: 5 + i }); p.visible = c.visible; });
          strings.forEach((s, i) => s.userData.set(prog(ctx.t, times[i + 1] - 0.3, times[i + 1] + 0.1)));
          popIn(photo, ctx.t, ctx.start + 0.4, { seed: 20 });
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [lerp(-0.2, 0.2, k), lerp(1.4, -0.9, k), lerp(8.6, 9.2, k)], [0, lerp(1.2, -0.8, k), 0]);
        },
      };
    },
  },

  // ------------------------------------------------ s4: the way in — one engineer's laptop → the signing system
  laptop: {
    sounds: (ctx) => [{ t: A(ctx, "engineer") - 0.1, s: "glitch", gain: 0.6 }, { t: A(ctx, "sign") - 0.2, s: "zaps", gain: 0.35 }, { t: A(ctx, "sign") + 0.6, s: "clunk", gain: 0.5 }],
    async build(stage) {
      const g = new THREE.Group();
      const wall = gridWall(16, 18, "#08090d", "rgba(127,216,255,0.08)"); wall.position.z = -3; g.add(wall);
      const desk = new THREE.Mesh(new THREE.BoxGeometry(6, 0.1, 3), std(0x1a1512, { roughness: 0.5 })); desk.position.y = -1.3; desk.receiveShadow = true; g.add(desk);
      const lap = await model("/assets/sf-laptop/model.glb", { length: 1.9 }); lap.position.set(-0.6, -1.25, 0.2); lap.rotation.y = 0.35; darkScreen(lap, 0x103a20, 0.5); g.add(lap);
      const screen = readout("ACCESS GRANTED", { w: 1.5, h: 0.5, color: "#40ff90", size: 90 }); screen.position.set(-0.55, -0.5, 0.75); screen.rotation.y = 0.35; g.add(screen);
      const lock = await model("/assets/sf-padlock/model.glb", { height: 1.1 }); lock.position.set(0.7, 0.8, -0.4); g.add(lock);
      const lbl = tag([{ text: "SIGNING SYSTEM", size: 70, latin: true, color: "#fff" }, { text: "payments sign చేసేది", size: 50, color: "#ddd" }], { w: 2.0, h: 0.75, bg: "#1d2433", seed: 540 });
      lbl.position.set(0.55, 2.05, 0); g.add(lbl);
      const eng = tag([{ text: "ENGINEER'S LAPTOP", size: 66, latin: true, color: "#fff" }], { w: 2.2, h: 0.5, bg: "#c1121f", seed: 541 }); eng.position.set(-0.6, -2.0, 1.2); g.add(eng);
      const beam = routeLine([V(-0.5, -0.4, 0.6), V(0.0, 0.9, 0.6), V(0.6, 1.0, -0.2)], 0xff2d55, 0.03); g.add(beam);
      const red = new THREE.PointLight(0xff2d55, 0, 4, 2); red.position.set(1.0, 0.9, 0.6); g.add(red);
      const hacker = person({ color: "#0a0a0d", hair: "#0a0a0d", skin: "#0a0a0d", seed: 545 }); hacker.scale.setScalar(1.3); hacker.position.set(-1.3, -0.1, -1.6); g.add(hacker);
      const rim = new THREE.PointLight(0x40ff90, 2.5, 4, 2); rim.position.set(-1.3, 0.6, -2.4); g.add(rim);
      const more = tag([{ text: "+ more breach points", size: 66, latin: true, color: "#fff" }], { w: 2.5, h: 0.5, bg: "#7a0c18", seed: 546 }); more.position.set(-0.3, -2.6, 1.2); g.add(more);
      const eip = readout("EIP-7702 · misused", { w: 2.4, h: 0.5, color: ICE, size: 80 }); eip.position.set(0.3, 2.75, 0.2); g.add(eip);
      const noPw = tag([{ text: "Password guess ✗", size: 66, latin: true, color: "#c1121f" }], { w: 2.2, h: 0.5, seed: 547 }); noPw.position.set(0.2, 2.9, 0.5); g.add(noPw);
      return {
        group: g,
        update(ctx) {
          look(stage, HEIST);
          const te = A(ctx, "engineer"), ts = A(ctx, "sign");
          screen.visible = ctx.t > te - 0.1 && Math.floor(ctx.t * 6) % 5 !== 0;
          popIn(eng, ctx.t, te, { seed: 2 });
          beam.userData.set(prog(ctx.t, ts - 0.6, ts + 0.4));
          const lk = prog(ctx.t, ts + 0.4, ts + 0.9); lock.rotation.set(0, ctx.t * 0.4, lk * 0.5); red.intensity = lk * 8;
          popIn(lbl, ctx.t, ts - 0.4, { seed: 3 });
          popIn(noPw, ctx.t, A(ctx, "password") - 0.1, { seed: 6 }); if (ctx.t > te - 0.4) noPw.visible = false;
          popIn(more, ctx.t, A(ctx, "breach") - 0.1, { seed: 7 });
          eip.visible = ctx.t > A(ctx, "EIP") - 0.2;
          hacker.visible = true; rim.intensity = 2.5 + Math.sin(ctx.t * 3) * 0.6;
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [lerp(-0.6, 0.3, k), lerp(0.2, 0.6, k), lerp(7.0, 8.6, k)], [lerp(-0.4, 0.1, k), lerp(-0.2, 0.4, k), 0]);
        },
      };
    },
  },

  // ------------------------------------------------ s5: the 20 minutes — wallets drain one by one, the counter races
  heist: {
    sounds: (ctx) => [
      { t: ctx.start, s: "riser", gain: 0.35 },
      ...["XRP", "bitcoin", "Tron", "Ethereum"].map((w) => ({ t: A(ctx, w) - 0.1, s: "glitch", gain: 0.45 })),
      { t: A(ctx, "ఖాళీ") - 0.1, s: "thud", gain: 0.7 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const wall = gridWall(16, 18, "#0a0709", "rgba(255,45,85,0.12)"); wall.position.z = -1.2; g.add(wall);
      const chains = [["XRP", 0.30, "#23292f"], ["BTC", 1.47, "#f7931a"], ["TRON", 0.63, "#eb0029"], ["ETH", 3.79, "#627eea"], ["SOL + 5", 0.17, "#14f195"]];
      const maxH = 3.6;
      const bars = chains.map(([n, v, col], i) => {
        const x = (i - 2) * 0.78;
        const full = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.3), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.4 }));
        full.geometry.translate(0, 0.5, 0); full.position.set(x, -2.4, 0); full.castShadow = true; g.add(full);
        const h = Math.max(0.25, (v / 3.79) * maxH); full.userData.h = h; full.scale.y = h;
        const ghost = new THREE.Mesh(new THREE.BoxGeometry(0.62, h, 0.32), new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.35 })); ghost.position.set(x, -2.4 + h / 2, 0); g.add(ghost);
        const lbl = tag([{ text: n, size: 64, latin: true, color: "#fff" }, { text: fmtB(v), size: 52, latin: true, color: "#ddd" }], { w: 0.76, h: 0.6, bg: "#15151b", seed: 550 + i });
        lbl.position.set(x, -2.85, 0.3); g.add(lbl);
        return full;
      });
      const counter = readout("$0.00B", { w: 3.0, h: 0.9 }); counter.position.set(0, 2.35, 0.4); g.add(counter);
      const eth = readout("ETH: 3 MIN 24 SEC", { w: 2.8, h: 0.55, color: ICE, size: 90 }); eth.position.set(0, 1.6, 0.45); g.add(eth);
      const empty = stamp("EMPTY", { w: 2.4, h: 0.9, color: NEON, rot: -0.12, size: 150 }); empty.position.set(0, 0.4, 0.8); g.add(empty);
      const btc = await coinBurst(g, "/assets/sf-btc/model.glb", 20, 31);
      const blocks = Array.from({ length: 6 }, (_, i) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), new THREE.MeshStandardMaterial({ color: 0x1a2236, emissive: 0x3a7bff, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.4 })); b.position.set(-1.9 + i * 0.76, 0.3, 0.6); g.add(b); return b; });
      const links = blocks.slice(1).map((b, i) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8), glowMat(0x7fd8ff, 2)); l.rotation.z = Math.PI / 2; l.position.set(-1.52 + i * 0.76, 0.3, 0.6); g.add(l); return l; });
      const rider = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), glowMat(0xffc040, 3)); g.add(rider);
      const ten = readout("10 BLOCKCHAINS", { w: 2.6, h: 0.5, color: ICE, size: 90 }); ten.position.set(0, 0.95, 0.8); g.add(ten);
      return {
        group: g,
        update(ctx) {
          look(stage, HEIST);
          const tx = A(ctx, "XRP"), tb = A(ctx, "bitcoin"), tt = A(ctx, "Tron"), te = A(ctx, "Ethereum"), tk = A(ctx, "ఖాళీ");
          const drainT = [tx, tb, tt, te, tt + 0.5];
          let stolen = 0;
          bars.forEach((b, i) => {
            const k = prog(ctx.t, drainT[i], drainT[i] + (i === 3 ? tk - te : 1.2), lin);
            b.scale.y = Math.max(0.001, b.userData.h * (1 - k));
            stolen += chains[i][1] * k;
          });
          setReadout(counter, fmtB(stolen), { w: 3.0, h: 0.9 });
          const tpd = A(ctx, "blockchains");
          blocks.forEach((b, i) => { const kb = pop(ctx.t, tpd - 0.6 + i * 0.1, 0.3); b.visible = kb > 0; b.scale.setScalar(Math.max(0.001, Math.min(1, kb))); b.rotation.y = ctx.t * 0.8 + i; });
          links.forEach((l, i) => (l.visible = ctx.t > tpd - 0.4 + i * 0.1));
          const ru = ((ctx.t - tpd) * 0.6) % 1; rider.visible = ctx.t > tpd; rider.position.set(-1.9 + ru * 3.8, 0.3 + Math.sin(ru * Math.PI * 5) * 0.08, 0.9);
          ten.visible = ctx.t > tpd - 0.2 && ctx.t < tx - 0.2;
          const chainOn = ctx.t < tx - 0.2; blocks.forEach((b) => (b.visible = b.visible && chainOn)); links.forEach((l) => (l.visible = l.visible && chainOn)); rider.visible = rider.visible && chainOn;
          btc(ctx.t, tb - 0.1, [-0.78, -1.0, 0.3]);
          eth.visible = ctx.t > te - 0.1;
          const ek = pop(ctx.t, tk - 0.05, 0.25); empty.visible = ek > 0; empty.scale.setScalar(lerp(2, 1, Math.min(1, ek)));
          const shake = ctx.t > tk && ctx.t < tk + 0.4 ? 0.05 : 0;
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [lerp(-0.4, 0.3, k) + Math.sin(ctx.t * 60) * shake, lerp(0.2, 0.0, k), lerp(9.6, 8.8, k)], [0, lerp(0.0, -0.1, k), 0]);
        },
      };
    },
  },

  // ------------------------------------------------ s7: Binance's response — withdrawals paused, ~$3B frozen, losses covered (SAFU)
  freeze: {
    sounds: (ctx) => [
      { t: A(ctx, "Deposits") - 0.1, s: "clunk", gain: 0.5 },
      { t: A(ctx, "Tether") - 0.1, s: "shimmer", gain: 0.45 },
      { t: A(ctx, "freeze") - 0.05, s: "stamp", gain: 0.55 },
      { t: A(ctx, "SAFU") - 0.1, s: "chime", gain: 0.45 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const wall = gridWall(16, 18, "#05090f", "rgba(127,216,255,0.10)"); wall.position.z = -1.2; g.add(wall);
      const paused = readout("WITHDRAWALS PAUSED", { w: 3.2, h: 0.6, color: NEON, size: 90 }); paused.position.set(0, 3.0, 0.4); g.add(paused);
      const rows = [["USDT · Tether", "$1.77B", "#26a17b"], ["USDC · Circle", "$0.83B", "#2775ca"], ["Others", "$0.10B+", "#8a8fa3"]].map(([n, v, col], i) => {
        const r = tag([{ text: n, size: 62, latin: true, color: "#fff" }, { text: v, size: 90, latin: true, color: "#fff" }], { w: 2.4, h: 0.85, bg: col, seed: 560 + i });
        r.position.set(0, 1.85 - i * 0.98, 0.2); g.add(r);
        const ice = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.95, 0.25), new THREE.MeshPhysicalMaterial({ color: 0xbfe9ff, roughness: 0.1, transmission: 0.6, transparent: true, opacity: 0.55, thickness: 0.4 }));
        ice.position.set(0, 1.85 - i * 0.98, 0.38); g.add(ice);
        return [r, ice];
      });
      const fz = stamp("FROZEN ≈ $3B", { w: 2.9, h: 0.85, color: ICE, rot: -0.1, size: 120 }); fz.position.set(0, -1.2, 0.8); g.add(fz);
      const safu = tag([{ text: "SAFU + company funds", size: 70, latin: true, color: "#fff" }, { text: "Customers నష్టం Binance భరిస్తుంది", size: 52, color: "#e6fff4" }], { w: 3.1, h: 0.95, bg: "#1f7a4c", seed: 570 });
      safu.position.set(0, -2.6, 0.6); g.add(safu);
      const shield = await model("/assets/sf-padlock/model.glb", { height: 0.7 }); shield.position.set(1.45, -2.5, 1.0); g.add(shield);
      return {
        group: g,
        update(ctx) {
          look(stage, { ...HEIST, sunCol: 0xcfe8ff });
          const td = A(ctx, "Deposits"), tT = A(ctx, "Tether"), tf = A(ctx, "freeze"), ts = A(ctx, "SAFU");
          paused.visible = ctx.t > td - 0.2 && Math.floor(ctx.t * 3) % 4 !== 0;
          rows.forEach(([r, ice], i) => { popIn(r, ctx.t, tT - 0.3 + i * 0.2, { seed: 7 + i }); const k = prog(ctx.t, tf - 0.2 + i * 0.25, tf + 0.3 + i * 0.25); ice.visible = k > 0; ice.scale.set(1, Math.max(0.001, k), 1); });
          const fk = pop(ctx.t, A(ctx, "billion") - 0.1, 0.25); fz.visible = fk > 0; fz.scale.setScalar(lerp(2, 1, Math.min(1, fk)));
          popIn(safu, ctx.t, ts - 0.4, { seed: 12 });
          const sk = pop(ctx.t, ts - 0.2); shield.visible = sk > 0; shield.scale.setScalar(Math.max(0.001, Math.min(1, sk))); shield.rotation.y = ctx.t;
          drift(stage, ctx, { d: 9.8, push: 0.94, lookY: 0.0 });
        },
      };
    },
  },

  // ------------------------------------------------ s8: lessons — a checklist that ticks itself
  lessons: {
    sounds: (ctx) => ["risk-free", "వంద", "ఒకే", "password", "links", "Private"].map((w) => ({ t: A(ctx, w) - 0.05, s: "tick", gain: 0.5 })),
    async build(stage) {
      const g = new THREE.Group();
      const desk = sheet(14, 18, "#1c1f26"); desk.position.z = -0.5; g.add(desk);
      const nb = cutout(3.7, 6.4, (c, W, H) => {
        c.fillStyle = "#fffdf6"; rr(c, 0, 0, W, H, 16); c.fill();
        c.strokeStyle = "rgba(70,120,200,0.3)"; c.lineWidth = 3; for (let y = H * 0.14; y < H; y += H / 18) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
        c.fillStyle = INK; c.font = FONTL(900, 60); c.fillText("CRYPTO SAFETY", 40, H * 0.08);
      }, { px: 120 });
      nb.position.set(0, -0.1, -0.3); nb.castShadow = false; g.add(nb);
      const items = ["Crypto ≠ risk-free", "పెద్ద exchange ≠ 100% safe", "అన్నీ ఒకే exchange లో వద్దు", "Strong password + 2FA", "Unknown links, fake calls ✗", "Private keys / seed: share ✗"];
      const words = ["risk-free", "వంద", "ఒకే", "password", "links", "Private"];
      const rows = items.map((q, i) => {
        const y = 2.2 - i * 0.82;
        const t = cutout(3.0, 0.6, (c, W, H) => { c.fillStyle = i >= 4 ? "#c1121f" : INK; c.textBaseline = "middle"; c.textAlign = "left"; fitText(c, q, 100, H / 2 + 4, W - 110, 650, 66); c.strokeStyle = INK; c.lineWidth = 5; c.strokeRect(14, H * 0.2, H * 0.6, H * 0.6); }, { fib: 0.3 });
        t.position.set(0.15, y, -0.25); t.castShadow = false; g.add(t);
        const tick = cutout(0.55, 0.55, (c, W, H) => { c.strokeStyle = "#1f8a4c"; c.lineWidth = 14; c.lineCap = "round"; c.beginPath(); c.moveTo(W * 0.15, H * 0.5); c.lineTo(W * 0.42, H * 0.78); c.lineTo(W * 0.9, H * 0.15); c.stroke(); }, { fib: 0.2 });
        tick.position.set(-1.25, y + 0.05, -0.2); tick.castShadow = false; g.add(tick);
        return [t, tick];
      });
      return {
        group: g,
        update(ctx) {
          paperLook(stage, { top: 0x1c1f26, bottom: 0x1c1f26, sunDir: [-2, 5, 8], shadow: 5 });
          words.forEach((w, i) => {
            const tw = A(ctx, w); const [t, tick] = rows[i];
            t.visible = ctx.t > tw - 0.5;
            const kk = pop(ctx.t, tw + 0.2, 0.25); tick.visible = kk > 0; tick.scale.setScalar(Math.max(0.001, Math.min(1.2, kk)));
          });
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [lerp(0.2, -0.1, k), lerp(0.9, -0.5, k), lerp(9.6, 9.8, k)], [0, lerp(0.9, -0.5, k), 0]);
        },
      };
    },
  },
  // ------------------------------------------------ s6: who — North Korea lit red, with the caveat on screen
  who: {
    sounds: (ctx) => [{ t: A(ctx, "North") - 0.1, s: "thud", gain: 0.6 }, { t: A(ctx, "TraderTraitor") - 0.05, s: "stamp", gain: 0.6 }, { t: A(ctx, "గుర్తుపెట్టుకోండి") - 0.1, s: "paper", gain: 0.5 }],
    async build(stage) {
      const g = new THREE.Group();
      const map = await darkMap(112, 146, 28, 46, 9); g.add(map);
      const P = map.userData.P;
      const nk = [[42.4, 130.6], [41.4, 129.7], [40.6, 129.6], [40.0, 128.4], [39.2, 127.5], [38.6, 128.3], [38.3, 127.1], [37.8, 126.6], [37.7, 126.1], [38.0, 125.0], [38.6, 125.2], [39.6, 124.4], [40.0, 124.4], [40.9, 126.0], [41.6, 126.9], [41.8, 128.1], [42.0, 128.9], [42.4, 130.0]];
      const shape = new THREE.Shape(nk.map(([la, lo]) => { const p = P(la, lo); return new THREE.Vector2(p.x, p.y); }));
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff2d55").multiplyScalar(1.4), transparent: true, opacity: 0.85, toneMapped: false })); fill.position.z = 0.03; g.add(fill);
      const centre = P(40.2, 127.2);
      const lbl = tag([{ text: "NORTH KOREA?", size: 84, latin: true, color: "#fff" }], { w: 2.4, h: 0.55, bg: "#c1121f", seed: 580 }); lbl.position.copy(centre).add(V(0, 1.15, 0.2)); g.add(lbl);
      const tt = stamp("TRADERTRAITOR", { w: 2.6, h: 0.7, color: "#ffffff", rot: -0.12, size: 100 }); tt.position.copy(centre).add(V(0.4, -1.4, 0.4)); g.add(tt);
      const firms = tag([{ text: "TRM Labs · Chainalysis", size: 60, latin: true }], { w: 2.5, h: 0.45, bg: "#f2f2f2", seed: 581 }); firms.position.copy(centre).add(V(0.3, -2.25, 0.45)); g.add(firms);
      const caveat = tag([{ text: "ANALYSTS SUSPECT", size: 76, latin: true, color: "#ffd166" }, { text: "Not officially confirmed", size: 58, latin: true, color: "#fff" }], { w: 2.9, h: 0.95, bg: "#111318", seed: 582 });
      caveat.position.copy(centre).add(V(0.3, 2.3, 0.5)); g.add(caveat);
      return {
        group: g,
        update(ctx) {
          look(stage, { ...HEIST, sun: 1.6, hemiI: 0.6 });
          const tn = A(ctx, "North"), tr = A(ctx, "TraderTraitor"), tg = A(ctx, "గుర్తుపెట్టుకోండి");
          const fk = prog(ctx.t, tn - 0.2, tn + 0.4); fill.material.opacity = 0.85 * fk * (0.75 + 0.25 * Math.sin(ctx.t * 5));
          popIn(lbl, ctx.t, tn, { seed: 3 });
          const k2 = pop(ctx.t, tr - 0.05, 0.25); tt.visible = k2 > 0; tt.scale.setScalar(lerp(2, 1, Math.min(1, k2)));
          popIn(firms, ctx.t, ctx.start + 0.6, { seed: 4 });
          popIn(caveat, ctx.t, tg - 0.2, { seed: 5 });
          const k = prog(ctx.t, ctx.start, ctx.end);
          cam(stage, [centre.x + lerp(0.9, 0.3, k), centre.y + lerp(-0.2, 0.1, k), lerp(9.5, 8.6, k)], [centre.x + lerp(0.6, 0.2, k), centre.y + lerp(-0.4, 0.0, k), 0]);
        },
      };
    },
  },
  // ------------------------------------------------ s8: where it stands — Vox-style card: record vs Bybit, $2.4B still out, BTC −5%
  now: {
    sounds: (ctx) => [{ t: A(ctx, "రెండున్నర") - 0.1, s: "tick", gain: 0.5 }, { t: A(ctx, "Binance") - 0.1, s: "paper", gain: 0.4 }, { t: A(ctx, "Bitcoin") - 0.1, s: "whoosh", gain: 0.4 }],
    async build(stage) {
      const g = new THREE.Group();
      const card = sheet(14, 18, "#efe9dc"); card.position.z = -0.6; g.add(card);
      const title = cutout(3.6, 0.6, (c, W, H) => { c.fillStyle = INK; c.font = FONTL(800, 60); c.textBaseline = "middle"; c.fillText("Biggest crypto heists", 10, H / 2); }, { fib: 0.2 }); title.position.set(0, 3.0, 0); title.castShadow = false; g.add(title);
      const heists = [["Binance 2026", 6.36, "#c1121f"], ["Bybit 2025", 1.5, "#3d405b"]];
      const bars = heists.map(([n, v, col], i) => {
        const w = (v / 6.36) * 3.4;
        const b = cutout(w, 0.55, (c, W, H) => { c.fillStyle = col; c.fillRect(0, 0, W, H); }); b.geometry.translate(w / 2, 0, 0); b.position.set(-1.7, 2.2 - i * 0.95, 0); g.add(b);
        const t = cutout(3.4, 0.38, (c, W, H) => { c.fillStyle = INK; c.font = FONTL(700, 54); c.textBaseline = "middle"; c.fillText(`${n} · $${v}B`, 4, H / 2); }, { fib: 0.2 }); t.position.set(0, 1.78 - i * 0.95, 0); t.castShadow = false; g.add(t);
        return b;
      });
      const still = tag([{ text: "$2.4B", size: 140, latin: true, color: "#c1121f" }, { text: "ఇంకా hacker దగ్గరే", size: 62 }], { w: 2.1, h: 1.15, seed: 590 }); still.position.set(-0.7, 0.0, 0.3); g.add(still);
      const cover = tag([{ text: "Binance:", size: 58, latin: true }, { text: "నష్టం మేమే భరిస్తాం", size: 58 }], { w: 1.9, h: 0.9, bg: "#fff6d6", seed: 591 }); cover.position.set(0.95, -1.15, 0.4); cover.userData.rz = -0.06; g.add(cover);
      const pts = [0, 0.1, 0.05, 0.12, 0.08, -0.2, -0.45, -0.55, -0.5].map((y, i) => V(-1.6 + i * 0.4, -2.0 + y * 2, 0.05));
      const line = routeLine(pts, 0xd0202a, 0.04); g.add(line);
      const btc = tag([{ text: "BTC −5%", size: 80, latin: true, color: "#c1121f" }], { w: 1.6, h: 0.5, seed: 592 }); btc.position.set(1.1, -3.1, 0.3); g.add(btc);
      return {
        group: g,
        update(ctx) {
          paperLook(stage, { sunDir: [-3, 5, 7] });
          bars.forEach((b, i) => { const k = prog(ctx.t, ctx.start + 0.1 + i * 0.3, ctx.start + 0.9 + i * 0.3); b.scale.x = Math.max(0.001, k); });
          popIn(still, ctx.t, A(ctx, "రెండున్నర") - 0.2, { seed: 5 });
          popIn(cover, ctx.t, A(ctx, "Binance") - 0.1, { seed: 6 });
          const tb = A(ctx, "Bitcoin"); line.userData.set(prog(ctx.t, tb - 0.2, tb + 1.2)); popIn(btc, ctx.t, A(ctx, "ఐదు") - 0.1, { seed: 7 });
          drift(stage, ctx, { d: 10.2, push: 0.95, lookY: 0.0 });
        },
      };
    },
  },

  // ------------------------------------------------ s9: not Bitcoin — a centralized exchange. Crypto = Risk + Responsibility
  finale: {
    sounds: (ctx) => [{ t: A(ctx, "centralized") - 0.1, s: "glitch", gain: 0.5 }, { t: A(ctx, "Crypto") - 0.1, s: "stamp", gain: 0.7 }, { t: A(ctx, "share") - 0.2, s: "chime", gain: 0.45 }],
    async build(stage) {
      const g = new THREE.Group();
      const wall = gridWall(16, 18, "#0c0a10", "rgba(247,183,51,0.10)"); wall.position.z = -3; g.add(wall);
      const coin = await model("/assets/sf-btc/model.glb", { length: 1.4 }); coin.position.set(-0.6, 1.5, 0); g.add(coin);
      const ok = tag([{ text: "Bitcoin tech ✓", size: 70, latin: true, color: "#1f8a4c" }], { w: 2.0, h: 0.5, seed: 600 }); ok.position.set(-0.55, 0.45, 0.4); g.add(ok);
      const ex = tag([{ text: "Centralized", size: 66, latin: true, color: "#fff" }, { text: "exchange ✗", size: 66, latin: true, color: "#fff" }], { w: 1.55, h: 0.85, bg: "#c1121f", seed: 601 }); ex.position.set(0.8, 1.2, 0.4); g.add(ex);
      const eq = readout("CRYPTO = RISK + RESPONSIBILITY", { w: 3.2, h: 0.8, color: GOLD, size: 110 }); eq.position.set(0, -0.9, 1.0); g.add(eq);
      const spin = alarm(g, 0, 3.0, -0.5);
      return {
        group: g,
        update(ctx) {
          look(stage, HEIST);
          spin(ctx.t);
          coin.rotation.y = ctx.t * 0.8;
          popIn(ok, ctx.t, ctx.start + 0.3, { seed: 7 });
          popIn(ex, ctx.t, A(ctx, "centralized") - 0.1, { seed: 8 });
          const ek = pop(ctx.t, A(ctx, "Crypto") - 0.1, 0.3); eq.visible = ek > 0; eq.scale.setScalar(Math.max(0.001, lerp(1.6, 1, Math.min(1, ek))));
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [lerp(0.4, 0, k), lerp(0.4, 0.2, k), lerp(7.6, 9.0, k)], [0, lerp(0.4, 0.0, k), 0]);
          ctx.O.chip("cm", "Useful అనిపిస్తే share చేయండి 🔁", { alpha: fade(ctx.t, A(ctx, "share") - 0.4), top: 1560, kind: "big" });
        },
      };
    },
  },
};
