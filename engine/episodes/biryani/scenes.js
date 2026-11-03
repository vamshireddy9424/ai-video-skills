// Biryani: where your ₹300 goes. Paper-cut diorama + real 3D props. Style: episodes/abroad/style.md
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

// ================================================================ biryani pieces
// The ₹300 bar: one tall paper column, ₹300 = BAR_H units, filled bottom-up as each cost is named.
const BAR_H = 5.6, BAR_W = 1.15;
const COSTS = [
  ["Chicken", 52, "#e76f51"], ["Rice", 17, "#f4d58d"], ["Masala", 25, "#d08c3a"], ["Gas", 8, "#7aa6c2"],
  ["Staff", 50, "#6a4c93"], ["Rent", 50, "#30638e"], ["Packing", 44, "#8d99ae"], ["GST", 14, "#3d405b"], ["Profit", 40, "#2a9d8f"],
];
function costBar() {
  const g = new THREE.Group();
  const frame = cutout(BAR_W + 0.24, BAR_H + 0.24, (c, W, H) => { c.fillStyle = "#fffaf0"; rr(c, 0, 0, W, H, 18); c.fill(); c.strokeStyle = INK; c.lineWidth = 6; rr(c, 6, 6, W - 12, H - 12, 14); c.stroke(); });
  frame.position.set(0, BAR_H / 2, -0.05); g.add(frame);
  const head = tag([{ text: "₹300", size: 110, latin: true }], { w: 1.5, h: 0.6, bg: "#ffd166", seed: 300 });
  head.position.set(0, BAR_H + 0.55, 0.05); g.add(head);
  let y = 0;
  const blocks = COSTS.map(([name, v, col], i) => {
    const h = (v / 300) * BAR_H;
    const b = cutout(BAR_W, h, (c, W, H) => { c.fillStyle = col; c.fillRect(0, 0, W, H); c.fillStyle = "rgba(255,255,255,0.92)"; c.textAlign = "center"; c.textBaseline = "middle"; if (H > 34) fitText(c, `₹${v}`, W / 2, H / 2 + 3, W - 16, 800, Math.min(70, H * 0.8), true); });
    b.position.set(0, y + h / 2, 0.02 + i * 0.002); b.castShadow = false;
    b.userData.y = y + h / 2; y += h;
    g.add(b); return b;
  });
  g.userData.blocks = blocks;
  /** show(i, k): blocks before i fully in, block i dropping in with progress k. */
  g.userData.show = (t, times) => blocks.forEach((b, i) => {
    const k = pop(t, times[i] ?? 1e9, 0.35);
    b.visible = k > 0;
    b.position.y = b.userData.y + (1 - Math.min(1, k)) * 1.4;
  });
  return g;
}
/** A price label with a leader to the bar. */
function priceTag(text, sub, col, seed) {
  return tag([{ text, size: 96, latin: true, color: ["#f4d58d", "#8d99ae"].includes(col) ? INK : col }, { text: sub, size: 58 }], { w: 1.7, h: 0.95, seed });
}
/** A phone (paper) with a generic food-app screen. */
function appPhone() {
  const ph = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.9, 0.09), std(0x1d1e21, { roughness: 0.4 })); body.castShadow = true; ph.add(body);
  const scr = cutout(1.36, 2.72, (c, W, H) => {
    c.fillStyle = "#fff"; rr(c, 0, 0, W, H, 30); c.fill();
    c.fillStyle = "#fc8019"; c.fillRect(0, 0, W, H * 0.11);
    c.fillStyle = "#fff"; c.font = FONTL(800, 44); c.textAlign = "center"; c.fillText("Food app", W / 2, H * 0.075);
    c.fillStyle = "#f3e2c3"; rr(c, 24, H * 0.15, W - 48, H * 0.3, 20); c.fill();
    c.fillStyle = "#b5651d"; c.beginPath(); c.ellipse(W / 2, H * 0.31, W * 0.28, H * 0.09, 0, 0, 7); c.fill();
    c.fillStyle = INK; c.textAlign = "left"; c.font = FONTL(800, 46); c.fillText("Chicken Biryani", 30, H * 0.53);
    c.font = FONTL(600, 38); c.fillStyle = "#555"; c.fillText("Hyderabadi dum", 30, H * 0.58);
    c.fillStyle = "#1f8a4c"; rr(c, 30, H * 0.83, W - 60, H * 0.1, 18); c.fill();
    c.fillStyle = "#fff"; c.textAlign = "center"; c.font = FONTL(800, 46); c.fillText("ORDER", W / 2, H * 0.895);
  }, { fib: 0.15 });
  scr.position.z = 0.05; scr.castShadow = false; ph.add(scr);
  const price = tag([{ text: "₹300", size: 90, latin: true }], { w: 0.9, h: 0.38, bg: "#fff", seed: 310 });
  price.position.set(0.12, -0.55, 0.07); price.castShadow = false; ph.add(price);
  ph.userData.price = price;
  return ph;
}
const WARM = { ...PAPER, top: 0x1a0f0a, bottom: 0x2a160e, sun: 1.6, sunCol: 0xffc890, sunDir: [-2, 5, 5], shadow: 5, hemiI: 0.45, hemiSky: 0xffd9b0, hemiGround: 0x22140c, env: 0.35, exposure: 1.0, bloom: { strength: 0.35, radius: 0.5, threshold: 0.85 } };
function steam(g, n, x, y, z) {
  const puffs = Array.from({ length: n }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff4e6, transparent: true, opacity: 0.05, depthWrite: false })); g.add(m); return m; });
  return (t) => puffs.forEach((m, i) => { const life = (t * 0.3 + i / n) % 1; m.position.set(x + Math.sin(life * 5 + i) * 0.25 * life + Math.sin(i * 7) * 0.2, y + life * 1.6, z + Math.cos(i * 2) * 0.15); m.scale.setScalar(0.8 + life * 3.2); m.material.opacity = 0.035 * Math.sin(life * Math.PI); });
}
/** Cost-scene timing: the moment each bar block drops, keyed off spoken words, else never. */
function barTimes(ctx, upTo) {
  const words = ["Chicken", "Basmati", "Masala", "Gas", "staff", "Rent", "Packing", "GST", "మిగిలేది"];
  return words.map((w, i) => (i < upTo ? -1e9 : (() => { try { return ctx.at(w) - 0.1; } catch { return 1e9; } })()));
}

// ================================================================ scenes
export const scenes = {
  // ------------------------------------------------ s1: the hero plate, ₹300 → ₹40 → app: loss
  hook: {
    sounds: (ctx) => [
      { t: ctx.start, s: "heat", gain: 0.2 },
      { t: A(ctx, "Just") - 0.05, s: "stamp", gain: 0.7 },
      { t: A(ctx, "app") - 0.1, s: "ding", gain: 0.4 },
      { t: A(ctx, "నష్టం") - 0.05, s: "thud", gain: 0.6 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const wall = gridWall(14, 18, "#2a120b", "rgba(255,150,80,0.16)"); wall.position.z = -2.5; g.add(wall);
      const table = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.12, 48), std(0x5a3622, { roughness: 0.6 })); table.position.y = -1.7; table.receiveShadow = true; g.add(table);
      const bir = await model("/assets/sf-biryani/model.glb", { length: 2.2 }); bir.position.set(0, -1.64, 0.3); g.add(bir);
      const puff = steam(g, 40, 0, -1.2, 0.3);
      const key = new THREE.SpotLight(0xffd2a0, 40, 12, 0.55, 0.6, 1.4); key.position.set(0.5, 3.2, 3); key.target.position.set(0, -1.5, 0.3); key.castShadow = true; g.add(key, key.target);
      const q = tag([{ text: "₹300 biryani", size: 96, latin: true }, { text: "Hotel కి ఎంత?", size: 92 }], { w: 3.0, h: 1.3, bg: "#fff4dc", seed: 320 });
      q.position.set(0, 1.55, 0.6); g.add(q);
      const forty = stamp("₹40", { w: 2.2, h: 1.2, color: "#2a9d8f", rot: -0.12, size: 200 }); forty.position.set(0, 0.2, 1.0); g.add(forty);
      const ph = appPhone(); ph.position.set(1.0, 0.3, 1.1); ph.rotation.z = -0.1; ph.scale.setScalar(0.85); g.add(ph);
      const loss = stamp("నష్టం!", { w: 2.2, h: 1.0, rot: 0.1, size: 150 }); loss.position.set(-0.3, -0.3, 1.5); g.add(loss);
      return {
        group: g,
        update(ctx) {
          look(stage, WARM);
          const tj = A(ctx, "Just"), ta = A(ctx, "app"), tn = A(ctx, "నష్టం");
          bir.rotation.y = ctx.t * 0.35;
          puff(ctx.t);
          q.visible = true; q.rotation.z = wob(ctx.t, 1, 0.012);
          const fk = pop(ctx.t, tj - 0.05, 0.25); forty.visible = fk > 0 && ctx.t < ta - 0.2; forty.scale.setScalar(lerp(2.2, 1, Math.min(1, fk)));
          const pk = pop(ctx.t, ta - 0.2, 0.4); ph.visible = pk > 0; ph.position.y = 0.3 + (1 - Math.min(1, pk)) * -2.5;
          const lk = pop(ctx.t, tn - 0.05, 0.25); loss.visible = lk > 0; loss.scale.setScalar(lerp(2.2, 1, Math.min(1, lk)));
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [lerp(0.3, -0.2, k), lerp(0.2, 0.0, k), lerp(8.6, 7.6, k)], [0, lerp(-0.1, 0.0, k), 0]);
        },
      };
    },
  },

  // ------------------------------------------------ s2: what goes on the plate — the bar starts filling
  food: {
    sounds: (ctx) => [
      ...["Chicken", "Basmati", "Masala", "Gas"].map((w) => ({ t: A(ctx, w) - 0.1, s: "paper", gain: 0.5 })),
      { t: A(ctx, "మొత్తం") - 0.05, s: "cash", gain: 0.4 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const bg = sheet(14, 18, "#f6e7cc"); bg.position.z = -0.7; g.add(bg);
      const bar = costBar(); bar.position.set(1.05, -3.1, 0); g.add(bar);
      const leg = await model("/assets/sf-chickenleg/model.glb", { length: 1.4 }); g.add(leg);
      const sack = cutout(1.1, 1.3, (c, W, H) => { c.fillStyle = "#e9dcc0"; c.beginPath(); c.moveTo(W * 0.15, H * 0.12); c.lineTo(W * 0.85, H * 0.12); c.lineTo(W * 0.95, H); c.lineTo(W * 0.05, H); c.fill(); c.fillStyle = "#c9b48a"; c.fillRect(W * 0.12, 0, W * 0.76, H * 0.14); c.fillStyle = "#2f6b4f"; c.textAlign = "center"; c.font = FONTL(900, 54); c.fillText("BASMATI", W / 2, H * 0.6); });
      g.add(sack);
      const jars = cutout(1.3, 1.0, (c, W, H) => { [["#c0392b", 0.18], ["#e1a33b", 0.5], ["#7a4a2a", 0.82]].forEach(([col, x]) => { c.fillStyle = "#f0e6d6"; c.fillRect(W * x - 50, H * 0.15, 100, H * 0.8); c.fillStyle = col; c.fillRect(W * x - 50, H * 0.45, 100, H * 0.5); c.fillStyle = "#555"; c.fillRect(W * x - 54, H * 0.08, 108, 22); }); });
      g.add(jars);
      const lpg = await model("/assets/sf-lpg/model.glb", { height: 1.3 }); g.add(lpg);
      const items = [leg, sack, jars, lpg];
      const slots = [[-0.55, 1.6], [-0.55, 0.25], [-0.55, -1.05], [-0.55, -2.45]];
      items.forEach((o, i) => o.position.set(slots[i][0] - 0.05, slots[i][1] - (o.isMesh ? 0 : 0.5), 0.3));
      const labels = COSTS.slice(0, 4).map(([n, v, col], i) => { const t = priceTag(`₹${v}`, n, col, 330 + i); t.scale.setScalar(0.62); t.position.set(0.05, slots[i][1] + 0.55, 0.6); g.add(t); return t; });
      const total = tag([{ text: "Food + Gas = ₹102", size: 76, latin: true }], { w: 2.9, h: 0.55, bg: "#ffd166", seed: 340 }); total.position.set(-0.45, -3.55, 0.8); g.add(total);
      return {
        group: g,
        update(ctx) {
          paperLook(stage, { sunDir: [-3, 5, 7], shadow: 6 });
          const ts = ["Chicken", "Basmati", "Masala", "Gas"].map((w) => A(ctx, w));
          bar.userData.show(ctx.t, barTimes(ctx, 0).map((x, i) => (i < 4 ? ts[i] - 0.1 : 1e9)));
          items.forEach((o, i) => { const k = pop(ctx.t, ts[i] - 0.25); o.visible = k > 0; if (!o.isMesh) { o.scale.set(Math.max(0.001, Math.min(1, k)), Math.max(0.001, Math.min(1, k)), 1); } else o.scale.setScalar(Math.max(0.001, Math.min(1, k))); });
          leg.rotation.set(0.3, ctx.t * 0.6, 0.4); lpg.rotation.y = ctx.t * 0.3;
          labels.forEach((l, i) => popIn(l, ctx.t, ts[i], { seed: 40 + i }));
          popIn(total, ctx.t, A(ctx, "మొత్తం") - 0.1, { seed: 50 });
          drift(stage, ctx, { d: 10.4, push: 0.96, lookY: 0.15 });
        },
      };
    },
  },

  // ------------------------------------------------ s3: staff, rent, packing, GST
  costs: {
    sounds: (ctx) => ["staff", "Rent", "Packing", "GST"].map((w, i) => ({ t: A(ctx, w) - 0.1, s: i === 3 ? "stamp" : "paper", gain: 0.5 })),
    async build(stage) {
      const g = new THREE.Group();
      const bg = sheet(14, 18, "#e8eef3"); bg.position.z = -0.7; g.add(bg);
      const bar = costBar(); bar.position.set(1.15, -3.1, 0); g.add(bar);
      const cooks = [0, 1, 2].map((i) => { const p = person({ color: "#264653", hair: "#ffffff", seed: 350 + i }); p.scale.setScalar(0.42); p.position.set(-1.55 + i * 0.5, 1.75, 0.2); g.add(p); return p; });
      const shop = cutout(1.6, 1.25, (c, W, H) => { c.fillStyle = "#d1495b"; c.beginPath(); c.moveTo(0, H * 0.3); c.lineTo(W * 0.1, 0); c.lineTo(W * 0.9, 0); c.lineTo(W, H * 0.3); c.fill(); c.fillStyle = "#f6e1c3"; c.fillRect(W * 0.06, H * 0.3, W * 0.88, H * 0.7); c.fillStyle = "#30638e"; c.fillRect(W * 0.38, H * 0.5, W * 0.24, H * 0.5); c.fillStyle = "#ffd166"; c.beginPath(); c.arc(W * 0.2, H * 0.55, 22, 0, 7); c.fill(); c.fillStyle = INK; c.font = FONTL(800, 40); c.textAlign = "center"; c.fillText("RENT", W / 2, H * 0.22); });
      shop.position.set(-1.05, 0.35, 0.2); g.add(shop);
      const bag = await model("/assets/sf-delbag/model.glb", { height: 1.0 }); bag.position.set(-1.1, -1.55, 0.3); g.add(bag);
      const gst = stamp("GST 5%", { w: 1.7, h: 0.7, color: "#3d405b", rot: -0.15, size: 110 }); gst.position.set(-0.95, -2.3, 0.6); g.add(gst);
      const words = ["staff", "Rent", "Packing", "GST"];
      const slots = [1.75, 0.35, -1.05, -2.3];
      const labels = COSTS.slice(4, 8).map(([n, v, col], i) => { const t = priceTag(`₹${v}`, n, col, 360 + i); t.scale.setScalar(0.62); t.position.set(-0.05, slots[i] + (i === 3 ? 0.55 : 0), 0.55); g.add(t); return t; });
      return {
        group: g,
        update(ctx) {
          paperLook(stage, { sunDir: [-3, 5, 7], shadow: 6 });
          const ts = words.map((w) => A(ctx, w));
          bar.userData.show(ctx.t, [-9, -9, -9, -9, ...ts.map((x) => x - 0.1), 1e9]);
          cooks.forEach((c, i) => popIn(c, ctx.t, ts[0] - 0.2 + i * 0.1, { seed: 60 + i }));
          popIn(shop, ctx.t, ts[1] - 0.2, { seed: 64 });
          const bk = pop(ctx.t, ts[2] - 0.25); bag.visible = bk > 0; bag.scale.setScalar(Math.max(0.001, Math.min(1, bk))); bag.rotation.y = ctx.t * 0.5;
          const gk = pop(ctx.t, ts[3] - 0.05, 0.25); gst.visible = gk > 0; gst.scale.setScalar(lerp(2, 1, Math.min(1, gk)));
          labels.forEach((l, i) => popIn(l, ctx.t, ts[i], { seed: 70 + i }));
          drift(stage, ctx, { d: 10.4, push: 0.96, lookY: 0.15 });
        },
      };
    },
  },

  // ------------------------------------------------ s4: what's left — the green ₹40 on top
  profit: {
    sounds: (ctx) => [{ t: A(ctx, "మిగిలేది") - 0.1, s: "chime", gain: 0.5 }, { t: A(ctx, "₹40") - 0.05, s: "stamp", gain: 0.6 }],
    async build(stage) {
      const g = new THREE.Group();
      const bg = sheet(14, 18, "#e3f2ec"); bg.position.z = -0.7; g.add(bg);
      const bar = costBar(); bar.position.set(0.8, -3.1, 0); g.add(bar);
      const glow = new THREE.PointLight(0x5fffd0, 0, 3, 2); glow.position.set(0.8, 2.2, 0.8); g.add(glow);
      const big = tag([{ text: "₹40", size: 170, latin: true, color: "#1f7a6e" }, { text: "hotel లాభం", size: 74 }], { w: 1.6, h: 1.2, bg: "#fff", seed: 380 });
      big.position.set(-0.85, 1.6, 0.8); big.userData.rz = 0.06; g.add(big);
      const of = tag([{ text: "≈ 13%", size: 80, latin: true }], { w: 1.2, h: 0.5, bg: "#ffd166", seed: 381 }); of.position.set(-0.85, 0.65, 0.8); g.add(of);
      return {
        group: g,
        update(ctx) {
          paperLook(stage, { sunDir: [-3, 5, 7], shadow: 6 });
          const tm = A(ctx, "మిగిలేది");
          bar.userData.show(ctx.t, [-9, -9, -9, -9, -9, -9, -9, -9, tm - 0.1]);
          glow.intensity = ctx.t > tm ? 3 + Math.sin(ctx.t * 6) : 0;
          popIn(big, ctx.t, tm + 0.15, { seed: 80 }); popIn(of, ctx.t, tm + 0.6, { seed: 81 });
          const k = prog(ctx.t, ctx.start, ctx.end);
          cam(stage, [lerp(-0.4, -0.6, k), lerp(0.6, 1.6, k), lerp(10.0, 7.2, k)], [lerp(-0.2, -0.4, k), lerp(0.2, 1.4, k), 0]);
        },
      };
    },
  },

  // ------------------------------------------------ s5: the app takes ₹85 — the green turns red
  app: {
    sounds: (ctx) => [
      { t: ctx.start + 0.1, s: "beep", gain: 0.4 },
      { t: A(ctx, "Commission") - 0.05, s: "snip", gain: 0.6 },
      { t: A(ctx, "₹85") - 0.05, s: "coins", gain: 0.4 },
      { t: A(ctx, "minus") - 0.1, s: "thud", gain: 0.6 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const bg = sheet(16, 18, "#fde2d0"); bg.position.z = -0.7; g.add(bg);
      const bar = costBar(); bar.position.set(1.0, -3.1, 0); bar.scale.setScalar(0.9); g.add(bar);
      // the app's bite: a red block that drops in over the top of the bar
      const cut = 85, hcut = (cut / 300) * BAR_H;
      const bite = cutout(BAR_W, hcut, (c, W, H) => { c.fillStyle = "#e63946"; c.fillRect(0, 0, W, H); c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle"; fitText(c, "App ₹85", W / 2, H / 2, W - 16, 800, 64, true); });
      bite.castShadow = false; bar.add(bite);
      const minus = tag([{ text: "−₹45", size: 150, latin: true, color: "#e63946" }, { text: "hotel కి నష్టం", size: 70 }], { w: 2.0, h: 1.3, bg: "#fff", seed: 390 });
      minus.position.set(-0.95, -1.9, 0.9); g.add(minus);
      const ph = appPhone(); ph.position.set(-1.0, 1.2, 0.6); ph.scale.setScalar(0.8); ph.rotation.z = 0.06; g.add(ph);
      const sc = await model("/assets/sf-delscooter/model.glb", { length: 1.8 }); g.add(sc);
      const pct = tag([{ text: "~25% + GST", size: 84, latin: true, color: "#e63946" }], { w: 2.1, h: 0.55, bg: "#fff", seed: 391 }); pct.position.set(-0.95, -0.55, 1.0); g.add(pct);
      return {
        group: g,
        update(ctx) {
          paperLook(stage, { sunDir: [-3, 5, 7], shadow: 6 });
          bar.userData.show(ctx.t, [-9, -9, -9, -9, -9, -9, -9, -9, -9]);
          const tc = A(ctx, "Commission"), t85 = A(ctx, "₹85"), tm = A(ctx, "minus");
          // the bite lands on top: covers profit and pushes ₹45 above the ₹300 line
          const bk = pop(ctx.t, t85 - 0.2, 0.4);
          bite.visible = bk > 0;
          bite.position.set(0, BAR_H - (40 / 300) * BAR_H + hcut / 2 + (1 - Math.min(1, bk)) * 2.5, 0.05);
          bar.userData.blocks[8].material.color.set(ctx.t > tm ? 0xff9a9a : 0xffffff);
          ph.visible = true; ph.rotation.z = 0.06 + wob(ctx.t, 3, 0.01);
          const sk = prog(ctx.t, ctx.start, ctx.start + 1.6);
          sc.position.set(lerp(-3.6, -1.0, sk), -3.05, 0.6); sc.rotation.y = Math.PI / 2;
          sc.visible = ctx.t < tm - 0.3;
          popIn(pct, ctx.t, tc + 0.1, { seed: 90 });
          popIn(minus, ctx.t, tm - 0.1, { seed: 91 });
          drift(stage, ctx, { d: 10.6, push: 0.95, lookY: 0.1 });
        },
      };
    },
  },

  // ------------------------------------------------ s6: so the app price climbs past ₹360 — and you pay it
  price: {
    sounds: (ctx) => [{ t: A(ctx, "₹360") - 0.6, s: "clicks", gain: 0.35 }, { t: A(ctx, "₹360") - 0.05, s: "stamp", gain: 0.5 }, { t: A(ctx, "నువ్వే") - 0.1, s: "thud", gain: 0.4 }],
    async build(stage) {
      const g = new THREE.Group();
      const bg = sheet(14, 18, "#fff1c9"); bg.position.z = -0.7; g.add(bg);
      const counter = tag([{ text: "Counter", size: 70, latin: true }, { text: "₹300", size: 140, latin: true }], { w: 1.7, h: 1.35, bg: "#ffffff", seed: 400 });
      counter.position.set(-0.95, 1.3, 0.3); g.add(counter);
      const nums = [300, 320, 340, 360].map((n) => { const t = tag([{ text: "App", size: 70, latin: true, color: "#fc8019" }, { text: `₹${n}+`, size: 140, latin: true, color: n === 360 ? "#e63946" : INK }], { w: 1.7, h: 1.35, bg: "#ffffff", seed: 401 }); t.position.set(0.95, 1.3, 0.3); g.add(t); return t; });
      const you = person({ color: "#2b2d42", seed: 410 }); you.scale.setScalar(0.85); you.position.set(0, -1.9, 0.3); g.add(you);
      const arrow = dashLine([V(0.95, 0.5, 0.4), V(0.6, -0.3, 0.5), V(0.25, -0.9, 0.5)], "#e63946", 0.03); g.add(arrow);
      const pay = tag([{ text: "Extra నువ్వే కడతావు", size: 72 }], { w: 2.9, h: 0.6, bg: "#ffd9d2", seed: 411 }); pay.position.set(0, -3.4, 0.7); g.add(pay);
      return {
        group: g,
        update(ctx) {
          paperLook(stage, { sunDir: [-3, 5, 7], shadow: 6 });
          const t360 = A(ctx, "₹360"), tn = A(ctx, "నువ్వే");
          popIn(counter, ctx.t, ctx.start, { seed: 100 });
          const idx = ctx.t < t360 - 0.6 ? 0 : Math.min(3, Math.floor((step(ctx.t) - (t360 - 0.6)) / 0.18) + 1);
          nums.forEach((t, i) => (t.visible = i === idx && ctx.t > ctx.start + 0.2));
          popIn(you, ctx.t, tn - 0.6, { seed: 101 });
          arrow.userData.set(prog(ctx.t, tn - 0.4, tn + 0.3));
          popIn(pay, ctx.t, tn, { seed: 102 });
          drift(stage, ctx, { d: 10.2, push: 0.95, lookY: -0.6 });
        },
      };
    },
  },

  // ------------------------------------------------ s7: counter or app? — comment
  finale: {
    sounds: (ctx) => [{ t: A(ctx, "counter") - 0.1, s: "paper", gain: 0.5 }, { t: A(ctx, "app") - 0.1, s: "paper", gain: 0.5 }, { t: A(ctx, "Comment") - 0.2, s: "chime", gain: 0.45 }],
    async build(stage) {
      const g = new THREE.Group();
      const wall = gridWall(14, 18, "#2a120b", "rgba(255,150,80,0.16)"); wall.position.z = -2.5; g.add(wall);
      const table = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.12, 48), std(0x5a3622, { roughness: 0.6 })); table.position.y = -1.7; table.receiveShadow = true; g.add(table);
      const bir = await model("/assets/sf-biryani/model.glb", { length: 2.0 }); bir.position.set(0, -1.64, 0.3); g.add(bir);
      const puff = steam(g, 40, 0, -1.2, 0.3);
      const key = new THREE.SpotLight(0xffd2a0, 40, 12, 0.55, 0.6, 1.4); key.position.set(0.5, 3.2, 3); key.target.position.set(0, -1.5, 0.3); key.castShadow = true; g.add(key, key.target);
      const a = tag([{ text: "Counter", size: 80, latin: true }], { w: 1.45, h: 0.7, bg: "#2a9d8f", fg: "#fff", seed: 420 }); a.position.set(-0.9, 1.3, 0.8); g.add(a);
      const b = tag([{ text: "App", size: 80, latin: true }], { w: 1.45, h: 0.7, bg: "#fc8019", fg: "#fff", seed: 421 }); b.position.set(0.9, 1.3, 0.8); g.add(b);
      const vs = tag([{ text: "vs", size: 90, latin: true }], { w: 0.55, h: 0.42, bg: "#fff", seed: 422 }); vs.position.set(0, 0.75, 1.0); g.add(vs);
      return {
        group: g,
        update(ctx) {
          look(stage, WARM);
          bir.rotation.y = ctx.t * 0.35; puff(ctx.t);
          popIn(a, ctx.t, A(ctx, "counter") - 0.15, { seed: 110 }); popIn(b, ctx.t, A(ctx, "app") - 0.15, { seed: 111 }); popIn(vs, ctx.t, A(ctx, "app") + 0.1, { seed: 112 });
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [0, lerp(0.3, 0.6, k), lerp(9.0, 9.8, k)], [0, 0, 0]);
          ctx.O.chip("cm", "Counter లో కొంటావా, app లో? Comment చెయ్ 👇", { alpha: fade(ctx.t, A(ctx, "Comment") - 0.4), top: 1560, kind: "big" });
        },
      };
    },
  },
};
