// Study abroad: the reality check. Paper-cut diorama + real 3D props. Style: episodes/abroad/style.md
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

// ================================================================ scenes
export const scenes = {
  // ------------------------------------------------ s1: the dream — paper sky, a real jet; then "ఆగు" freezes it
  hook: {
    sounds: (ctx) => [
      { t: ctx.start, s: "wind", gain: 0.12 },
      { t: ctx.start + 0.6, s: "jet", gain: 0.25 },
      { t: A(ctx, "ఆగు") - 0.05, s: "stamp", gain: 0.6 },
      { t: A(ctx, "loan") - 0.35, s: "thud", gain: 0.55 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const bg = sheet(14, 18, "#a9d3e6"); bg.position.z = -2.5; g.add(bg);
      const sun = cutout(1.6, 1.6, (c, W, H) => { c.fillStyle = "#ffd36b"; c.beginPath(); c.arc(W / 2, H / 2, W * 0.46, 0, 7); c.fill(); });
      sun.position.set(-1.1, 3.1, -2.3); g.add(sun);
      const clouds = [[-1.4, 2.0, -1.8, 1.7, 1], [1.5, 1.0, -1.2, 1.3, 2], [-1.0, 0.2, -0.6, 1.2, 3], [1.3, 3.0, -2.0, 1.4, 4], [0.2, -0.6, -1.5, 1.6, 5]].map(([x, y, z, w, s]) => {
        const c = cloud(w, "#ffffff", s); c.position.set(x, y, z); g.add(c); return c;
      });
      const hills = skyline(9, 2.6, "#7fb48a", 4); hills.position.set(0, -2.6, -1.0); g.add(hills);
      const city = skyline(9, 2.2, "#c9b28f", 7, true); city.position.set(0, -2.9, -0.5); g.add(city);
      const front = skyline(9, 1.6, "#3e7d5a", 9); front.position.set(0, -3.6, 0.2); g.add(front);
      const charm = await model("/assets/sf-charminar/model.glb", { height: 1.2 }); charm.position.set(-0.9, -3.3, -0.2); g.add(charm);
      const plane = await model("/assets/sf-a320/model.glb", { length: 2.2 }); g.add(plane);
      const kid = person({ color: NAVY, bag: true, seed: 2 }); kid.scale.setScalar(0.8); kid.position.set(0.75, -2.35, 0.6); g.add(kid);
      const suit = await model("/assets/sf-suitcase/model.glb", { height: 0.55 }); suit.position.set(1.5, -3.05, 0.75); suit.rotation.y = -0.5; g.add(suit);
      const wait = stamp("WAIT.", { w: 2.4, h: 0.95, rot: -0.12 }); wait.position.set(0, 0.6, 1.4); g.add(wait);
      const price = tag([{ text: "₹20 – 50 లక్షల", size: 110, weight: 700 }, { text: "EDUCATION LOAN", size: 64, latin: true, color: RED }], { w: 2.9, h: 1.25, bg: "#ffffff", seed: 9 });
      price.position.set(0, -0.5, 1.6); g.add(price);
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 6), std(0x333333)); g.add(string);
      return {
        group: g,
        update(ctx) {
          paperLook(stage);
          const tw = A(ctx, "ఆగు"), tl = A(ctx, "loan");
          const frozen = Math.min(ctx.t, tw);          // the world stops on "ఆగు"
          const tt = step(frozen);
          clouds.forEach((c, i) => { c.position.x += 0; c.position.x = [-1.4, 1.5, -1.0, 1.3, 0.2][i] + Math.sin(tt * 0.25 + i) * 0.25; });
          const fk = ((frozen - ctx.start) / 9) % 1;
          plane.position.set(lerp(-3.2, 3.4, fk), lerp(0.4, 2.6, fk), -0.4);
          plane.rotation.set(0.05, Math.PI / 2 - 0.25, 0.18);
          kid.rotation.z = wob(tt, 3, 0.01);
          // after "ఆగు": desaturate by dimming the sun, stamp lands
          const wk = pop(ctx.t, tw, 0.3);
          wait.visible = wk > 0 && ctx.t < tl - 0.4;
          wait.scale.setScalar(lerp(2.2, 1, Math.min(1, wk)));
          // the price tag drops on its string
          const pk = pop(ctx.t, tl - 0.45, 0.5);
          price.visible = string.visible = pk > 0;
          price.position.y = lerp(5, -0.4, Math.min(1, pk)) + (pk > 1 ? 0 : 0);
          price.rotation.z = Math.sin(ctx.t * 2.2) * 0.04 * Math.max(0, 1 - (ctx.t - tl) / 4);
          string.position.set(0, price.position.y + 0.62 + 3, 1.6);
          drift(stage, ctx, { d: 10.5, push: 0.86, lookY: -0.2, from: [0.3, 0.2], to: [-0.1, 0] });
          look(stage, { ...PAPER, sun: ctx.t > tw ? 2.0 : 2.7, exposure: ctx.t > tw ? 0.92 : 1.0 });
        },
      };
    },
  },

  // ------------------------------------------------ s2: marks, parents' savings, the flight, the simple plan
  loan: {
    sounds: (ctx) => [
      { t: A(ctx, "talented") - 0.1, s: "paper", gain: 0.5 },
      { t: A(ctx, "guarantee") - 0.05, s: "stamp", gain: 0.6 },
      { t: A(ctx, "అమ్మా") - 0.1, s: "paper", gain: 0.5 },
      { t: A(ctx, "అమ్మా") + 0.8, s: "cash", gain: 0.35 },
      { t: A(ctx, "flight") - 0.3, s: "jet", gain: 0.4 },
      { t: A(ctx, "Plan") - 0.1, s: "paper", gain: 0.5 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const bg = sheet(14, 18, "#f1e3c6"); bg.position.z = -1.0; g.add(bg);
      // beat A: marks memo + medal, then NO GUARANTEE
      const memo = tag([{ text: "MARKS MEMO", size: 54, latin: true, color: "#6b5d48" }, { text: "95%", size: 150, latin: true }, { text: "A+  ·  Distinction", size: 50, latin: true, color: TEAL }], { w: 2.4, h: 2.6, bg: "#ffffff", seed: 4 });
      memo.position.set(-0.6, 1.2, 0); memo.userData.rz = 0.06; g.add(memo);
      const medal = cutout(0.9, 1.3, (c, W, H) => {
        c.fillStyle = "#2c6fb5"; c.beginPath(); c.moveTo(W * 0.3, 0); c.lineTo(W * 0.5, H * 0.45); c.lineTo(W * 0.7, 0); c.fill();
        c.fillStyle = "#f2b632"; c.beginPath(); c.arc(W / 2, H * 0.66, W * 0.38, 0, 7); c.fill();
        c.fillStyle = "#c98a12"; c.font = FONTL(900, 120); c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("1", W / 2, H * 0.68);
      });
      medal.position.set(0.95, 0.5, 0.25); g.add(medal);
      const nog = stamp("NO GUARANTEE", { w: 3.0, h: 0.8, rot: -0.2 }); nog.position.set(-0.2, 1.0, 0.5); g.add(nog);
      // beat B: home, parents, savings into the suitcase
      const house = cutout(3.0, 2.6, (c, W, H) => {
        c.fillStyle = "#c4553a"; c.beginPath(); c.moveTo(W * 0.04, H * 0.42); c.lineTo(W / 2, H * 0.02); c.lineTo(W * 0.96, H * 0.42); c.fill();
        c.fillStyle = "#f6d9a8"; c.fillRect(W * 0.12, H * 0.4, W * 0.76, H * 0.58);
        c.fillStyle = "#7a4a2a"; c.fillRect(W * 0.42, H * 0.62, W * 0.16, H * 0.36);
        c.fillStyle = "#8fc3d8"; c.fillRect(W * 0.18, H * 0.5, W * 0.16, H * 0.14); c.fillRect(W * 0.66, H * 0.5, W * 0.16, H * 0.14);
      });
      house.position.set(0, 1.6, -1.2); g.add(house);
      const amma = person({ color: "#b8325a", hair: "#151515", seed: 5 }); amma.scale.setScalar(0.8); amma.position.set(-0.85, -0.3, -0.4); g.add(amma);
      const nanna = person({ color: "#3d5a80", hair: "#5c5c5c", seed: 6 }); nanna.scale.setScalar(0.88); nanna.position.set(-0.05, -0.25, -0.5); g.add(nanna);
      const me = person({ color: NAVY, bag: true, seed: 7 }); me.scale.setScalar(0.8); me.position.set(1.1, -0.3, -0.3); g.add(me);
      const cash = await model("/assets/sf-cash/model.glb", { length: 0.7 }); g.add(cash);
      const suit = await model("/assets/sf-suitcase/model.glb", { height: 0.55 }); suit.position.set(1.25, -1.3, 0.3); suit.rotation.y = -0.4; g.add(suit);
      const floor = sheet(14, 4, "#d9c39b"); floor.rotation.x = -Math.PI / 2; floor.position.set(0, -1.3, 0); floor.receiveShadow = true; g.add(floor);
      // beat C: flight
      const plane = await model("/assets/sf-a320/model.glb", { length: 2.0 }); g.add(plane);
      const trail = dashLine([V(-2.2, -1.2, 0.4), V(-0.5, 0.2, 0.4), V(1.0, 1.6, 0.4), V(2.6, 3.0, 0.4)], ORANGE, 0.025); g.add(trail);
      // beat D: the plan card
      const plan = tag([{ text: "THE PLAN", size: 60, latin: true, color: "#6b5d48" }, { text: "Part-time job", size: 100 }, { text: "+ చదువు  ✓", size: 100 }], { w: 2.8, h: 2.2, bg: "#fffdf4", seed: 8 });
      plan.position.set(0, 0.6, 1.0); g.add(plan);
      return {
        group: g,
        update(ctx) {
          paperLook(stage);
          const tT = A(ctx, "talented"), tG = A(ctx, "guarantee"), tA = A(ctx, "అమ్మా"), tF = A(ctx, "flight"), tP = A(ctx, "Plan");
          const beatA = ctx.t < tA - 0.3, beatB = ctx.t >= tA - 0.3 && ctx.t < tF - 0.2;
          memo.visible = medal.visible = nog.visible = false;
          if (beatA) {
            popIn(memo, ctx.t, tT - 0.3, { seed: 1 });
            popIn(medal, ctx.t, tT + 0.4, { seed: 2, spin: 0.6 });
            const nk = pop(ctx.t, tG, 0.25); nog.visible = nk > 0; nog.scale.setScalar(lerp(2, 1, Math.min(1, nk)));
          }
          [house, amma, nanna, me, floor, suit, cash].forEach((o) => (o.visible = !beatA && ctx.t < tP - 0.2));
          if (!beatA) {
            popIn(amma, ctx.t, tA - 0.2, { seed: 3 }); popIn(nanna, ctx.t, tA, { seed: 4 }); popIn(me, ctx.t, tA + 0.25, { seed: 5 });
            // savings travel from the parents to the suitcase
            const ck = prog(ctx.t, tA + 0.6, tA + 2.2);
            cash.position.set(lerp(-0.4, 1.15, ck), lerp(-0.6, -1.0, ck) + Math.sin(ck * Math.PI) * 0.9, 0.4);
            cash.rotation.set(0.3, ctx.t * 0.8, 0.2);
            cash.visible = ck < 0.98 && ctx.t > tA + 0.4 && ctx.t < tP - 0.2;
          }
          const fk = prog(ctx.t, tF - 0.3, tF + 2.4, (x) => x * x);
          plane.visible = trail.visible = ctx.t > tF - 0.3 && ctx.t < tP + 0.6;
          const pp = trail.userData.curve.getPoint(Math.min(1, fk));
          plane.position.copy(pp); plane.rotation.set(0, Math.PI / 2 - 0.3, 0.75);
          trail.userData.set(fk);
          if (ctx.t >= tP - 0.2) [house, amma, nanna, me, floor, suit, cash].forEach((o) => (o.visible = false));
          const pk = popIn(plan, ctx.t, tP - 0.15, { seed: 6 });
          plan.visible = pk > 0;
          drift(stage, ctx, { d: 9.5, push: 0.9, lookY: 0.4 });
        },
      };
    },
  },

  // ------------------------------------------------ s3: rejection wall + months on a calendar
  jobs: {
    sounds: (ctx) => {
      const t0 = A(ctx, "కష్టం");
      return [0, 1, 2, 3, 4, 5].map((i) => ({ t: t0 - 0.2 + i * 0.45, s: "stamp", gain: 0.45 })).concat([{ t: A(ctx, "నెలలు") - 0.6, s: "paper", gain: 0.5 }]);
    },
    async build(stage) {
      const g = new THREE.Group();
      const cork = sheet(14, 18, "#b98f5e", { lines: (c, W, H) => { const r = rand(3); for (let i = 0; i < 9000; i++) { c.fillStyle = r() > 0.5 ? "rgba(90,55,25,0.35)" : "rgba(240,210,160,0.3)"; c.fillRect(r() * W, r() * H, 2, 2); } } });
      cork.position.z = -1; g.add(cork);
      const names = ["Café", "Grocery store", "Warehouse", "Restaurant", "Library", "Delivery"];
      const cards = names.map((n, i) => {
        const c = tag([{ text: "APPLICATION", size: 44, latin: true, color: "#7a6a52" }, { text: n, size: 78, latin: true }], { w: 1.65, h: 1.05, bg: "#fffdf6", seed: 10 + i });
        c.position.set(i % 2 ? 0.92 : -0.92, 2.3 - Math.floor(i / 2) * 1.35, -0.7 + i * 0.01); c.userData.rz = (i % 3 - 1) * 0.06; g.add(c);
        const pin = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), std(0xd23a2c, { roughness: 0.4 })); pin.position.set(c.position.x, c.position.y + 0.4, -0.6); g.add(pin);
        const s = stamp(i % 2 ? "NO VACANCY" : "REJECTED", { w: 1.5, h: 0.5, rot: -0.22 + (i % 2) * 0.1, size: 90 }); s.position.set(c.position.x, c.position.y - 0.05, -0.55); g.add(s);
        return [c, s];
      });
      // a calendar whose pages tear off: month 1 → 4
      const cal = new THREE.Group(); cal.position.set(0, -2.4, 0.4); g.add(cal);
      const pages = [4, 3, 2, 1].map((m, i) => {
        const p = cutout(1.7, 1.9, (c, W, H) => {
          c.fillStyle = "#ffffff"; rr(c, 6, 6, W - 12, H - 12, 14); c.fill();
          c.fillStyle = RED; c.fillRect(6, 6, W - 12, H * 0.24);
          c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle"; c.font = FONTL(800, 54); c.fillText("MONTH", W / 2, H * 0.14);
          c.fillStyle = INK; c.font = FONTL(900, 190); c.fillText(String(m), W / 2, H * 0.62);
        });
        p.position.z = i * 0.012; cal.add(p); return p;
      });
      const noJob = tag([{ text: "0 jobs", size: 96, latin: true, color: RED }], { w: 1.5, h: 0.62, seed: 21 }); noJob.position.set(1.25, -1.6, 0.6); noJob.userData.rz = 0.12; g.add(noJob);
      return {
        group: g,
        update(ctx) {
          paperLook(stage, { sunDir: [-2, 4, 7] });
          const t0 = A(ctx, "కష్టం"), tm = A(ctx, "నెలలు");
          cards.forEach(([c, s], i) => {
            popIn(c, ctx.t, ctx.start + 0.1 + i * 0.18, { seed: i });
            const k = pop(ctx.t, t0 - 0.2 + i * 0.45, 0.22);
            s.visible = k > 0; s.scale.setScalar(lerp(1.8, 1, Math.min(1, k)));
          });
          cal.visible = ctx.t > tm - 2.2;
          // pages 1..3 fly off one by one, ending on 4
          [3, 2, 1].forEach((pi, j) => {
            const p = pages[pi], k = prog(step(ctx.t), tm - 1.5 + j * 0.45, tm - 1.1 + j * 0.45);
            p.position.set(k * 1.8, k * 1.4, pi * 0.012 + k * 0.3); p.rotation.z = -k * 0.9; p.visible = k < 0.99;
          });
          popIn(noJob, ctx.t, tm + 0.2, { seed: 8 });
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [lerp(0.2, -0.1, k), lerp(0.9, -0.6, k), lerp(9.5, 8.6, k)], [0, lerp(0.8, -0.8, k), 0]);
        },
      };
    },
  },

  // ------------------------------------------------ s4: the pay strip cut away; interest climbs; 2–3 jobs?
  math: {
    sounds: (ctx) => [
      ...["Rent", "groceries", "bus", "electricity"].map((w) => ({ t: A(ctx, w) - 0.05, s: "snip", gain: 0.55 })),
      { t: A(ctx, "వడ్డీ") - 0.1, s: "riser", gain: 0.3 },
      { t: A(ctx, "రెండు") - 0.1, s: "paper", gain: 0.5 },
      { t: A(ctx, "రెండు") + 0.5, s: "paper", gain: 0.4 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const bg = sheet(14, 18, "#e7efe6", { lines: (c, W, H) => { c.strokeStyle = "rgba(60,110,90,0.12)"; c.lineWidth = 2; for (let y = 0; y < H; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); } } });
      bg.position.z = -0.75; g.add(bg);
      const head = tag([{ text: "PART-TIME PAY", size: 70, latin: true, color: "#2f6b4f" }], { w: 2.6, h: 0.6, bg: "#ffffff", seed: 30 }); head.position.set(0, 3.0, -0.2); g.add(head);
      // the strip: 5 pieces stacked vertically, the top 4 get cut
      const parts = [["Rent", "#e76f51", 1.4], ["Groceries", "#f4a261", 0.8], ["Bus pass", "#e9c46a", 0.45], ["Bills", "#8ab17d", 0.45], ["Left", "#2a9d8f", 0.18]];
      let y = 2.6;
      const strips = parts.map(([n, col, h], i) => {
        const s = cutout(2.0, h, (c, W, H) => {
          c.fillStyle = col; c.fillRect(0, 0, W, H);
          c.fillStyle = "rgba(0,0,0,0.75)"; c.textAlign = "center"; c.textBaseline = "middle";
          if (H > 40) fitText(c, n, W / 2, H / 2 + 3, W - 30, 800, Math.min(80, H * 0.55), true);
          c.setLineDash([10, 10]); c.strokeStyle = "rgba(0,0,0,0.5)"; c.lineWidth = 3; c.beginPath(); c.moveTo(0, H - 2); c.lineTo(W, H - 2); c.stroke();
        });
        s.position.set(0, y - h / 2, -0.4); y -= h; g.add(s); return s;
      });
      const left = tag([{ text: "మిగిలేది?", size: 80 }], { w: 1.6, h: 0.55, seed: 31 }); left.position.set(0.9, strips[4].position.y - 0.45, 0.2); g.add(left);
      // interest meter
      const meter = new THREE.Group(); meter.position.set(0, -1.7, 0); g.add(meter);
      const dial = cutout(2.6, 1.5, (c, W, H) => {
        c.fillStyle = "#ffffff"; c.beginPath(); c.arc(W / 2, H * 0.95, W * 0.46, Math.PI, 0); c.closePath(); c.fill();
        const cols = ["#8ab17d", "#e9c46a", "#f4a261", "#e76f51"];
        cols.forEach((cl, i) => { c.strokeStyle = cl; c.lineWidth = 40; c.beginPath(); c.arc(W / 2, H * 0.95, W * 0.38, Math.PI + (i * Math.PI) / 4, Math.PI + ((i + 1) * Math.PI) / 4); c.stroke(); });
        c.fillStyle = INK; c.textAlign = "center"; c.font = FONT(700, 64); c.fillText("Loan వడ్డీ", W / 2, H * 0.8);
      });
      meter.add(dial);
      const needle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.03), std(0x1d1e21)); needle.geometry.translate(0, 0.5, 0); needle.position.set(0, -0.68, 0.05); needle.castShadow = true; meter.add(needle);
      // jobs 1, 2, 3
      const jobs = [0, 1, 2].map((i) => {
        const t = tag([{ text: `JOB ${i + 1}`, size: 70, latin: true }, { text: i ? "?" : "✓ కష్టం", size: 70, color: i ? RED : "#2f6b4f" }], { w: 1.15, h: 1.15, bg: "#fffdf6", seed: 40 + i });
        t.position.set((i - 1) * 1.3, -3.0, 0.3); t.userData.rz = (i - 1) * 0.08; g.add(t); return t;
      });
      return {
        group: g,
        update(ctx) {
          paperLook(stage, { sunDir: [-3, 5, 7] });
          popIn(head, ctx.t, ctx.start + 0.1);
          ["Rent", "groceries", "bus", "electricity"].forEach((w, i) => {
            const tc = A(ctx, w), k = prog(step(ctx.t), tc, tc + 0.9, (x) => x * x);
            const s = strips[i];
            s.position.x = k * (i % 2 ? 2.5 : -2.5); s.rotation.z = k * (i % 2 ? -0.8 : 0.8);
            s.position.y = s.userData.y0 ??= s.position.y; s.position.y -= k * 1.5;
            s.visible = ctx.t > ctx.start && k < 1;
          });
          strips[4].visible = true;
          popIn(left, ctx.t, A(ctx, "electricity") + 0.8, { seed: 2 });
          const tv = A(ctx, "వడ్డీ");
          meter.visible = ctx.t > tv - 0.3;
          const nk = prog(ctx.t, tv, tv + 3.5, lin);
          needle.rotation.z = lerp(1.35, -1.25, nk) + Math.sin(ctx.t * 9) * 0.02;
          const t2 = A(ctx, "రెండు");
          jobs.forEach((j, i) => popIn(j, ctx.t, (i ? t2 + (i - 1) * 0.4 : A(ctx, "ఇంటికి") - 0.4), { seed: 5 + i }));
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [0.15, lerp(1.2, -1.6, k), lerp(9.4, 9.0, k)], [0, lerp(1.0, -1.8, k), 0]);
        },
      };
    },
  },

  // ------------------------------------------------ s5: the shared room (3D diorama) and its roommates
  room: {
    sounds: (ctx) => [
      { t: A(ctx, "నలుగురైదుగురు") - 0.1, s: "paper", gain: 0.5 },
      { t: A(ctx, "వంట") - 0.05, s: "paper", gain: 0.4 },
      { t: A(ctx, "Splitwise") - 0.05, s: "ding", gain: 0.35 },
      { t: A(ctx, "Splitwise") + 0.35, s: "ding", gain: 0.3 },
      { t: A(ctx, "Splitwise") + 0.7, s: "ding", gain: 0.3 },
      { t: A(ctx, "share") - 0.05, s: "paper", gain: 0.4 },
      { t: A(ctx, "caste") - 0.05, s: "thud", gain: 0.3 },
      { t: A(ctx, "corner") - 0.05, s: "thud", gain: 0.35 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const bg = sheet(20, 20, "#f4d9b0"); bg.position.z = -4; g.add(bg);
      const room = await model("/assets/sf-studentroom/model.glb", { length: 4.2 }); room.position.set(0, -0.2, -1.2); room.rotation.y = -0.7; g.add(room);
      const cols = ["#d1495b", "#00798c", "#edae49", "#30638e", "#6a4c93"];
      const mates = cols.map((c, i) => { const p = person({ color: c, hair: i === 2 ? "#3b2a1a" : "#151515", seed: 50 + i }); p.scale.setScalar(0.62); p.position.set((i - 2) * 0.72, -2.15, 1.2 + (i % 2) * 0.15); g.add(p); return p; });
      const notes = ["వంట చేయడు", "Fake bills", "Share pay చేయడు", "Caste చూస్తాడు", "Corner చేస్తాడు"].map((txt, i) => {
        const t = tag(txt, { w: 2.1, h: 0.55, size: 72, seed: 60 + i, bg: i === 3 ? "#ffd9d2" : CREAM });
        t.position.set(Math.max(-0.75, Math.min(0.75, mates[i].position.x)), -0.95, 1.7);
        t.userData.rz = (i % 2 ? -0.05 : 0.05); g.add(t); return t;
      });
      const ph = new THREE.Group(); ph.position.set(0.55, 1.5, 1.0); ph.rotation.z = -0.08; g.add(ph);
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.08), std(0x1d1e21, { roughness: 0.4 })); body.castShadow = true; ph.add(body);
      const screen = cutout(1.08, 2.0, (c, W, H) => {
        c.fillStyle = "#f6f7f2"; rr(c, 0, 0, W, H, 30); c.fill();
        c.fillStyle = "#1cc29f"; c.fillRect(0, 0, W, H * 0.14);
        c.fillStyle = "#fff"; c.font = FONTL(800, 46); c.textAlign = "center"; c.fillText("Split bills", W / 2, H * 0.09);
        ["Wi-Fi", "Netflix?", "Party (I wasn't there)", "Cleaning"].forEach((s, i) => {
          c.fillStyle = "#ffffff"; rr(c, 20, H * (0.19 + i * 0.19), W - 40, H * 0.15, 16); c.fill();
          c.fillStyle = INK; c.textAlign = "left"; fitText(c, "+ " + s, 44, H * (0.27 + i * 0.19), W - 90, 700, 40, true);
          c.fillStyle = RED; c.font = FONTL(700, 32); c.fillText("you owe", 44, H * (0.31 + i * 0.19));
        });
      }, { fib: 0.3 });
      screen.position.z = 0.05; screen.castShadow = false; ph.add(screen);
      const cover = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 1.6), std(0xf6f7f2)); cover.position.set(0, -0.2, 0.06); ph.add(cover);
      return {
        group: g,
        update(ctx) {
          paperLook(stage, { sunDir: [-4, 6, 6], shadow: 5 });
          const tn = A(ctx, "నలుగురైదుగురు");
          mates.forEach((m, i) => popIn(m, ctx.t, tn - 0.3 + i * 0.12, { seed: 10 + i }));
          const ts0 = [A(ctx, "వంట"), A(ctx, "Splitwise"), A(ctx, "share"), A(ctx, "caste"), A(ctx, "corner")];
          mates.forEach((m, i) => { const on = ctx.t > ts0[i] - 0.1 && (i === 4 || ctx.t < ts0[i + 1] - 0.1); if (on) m.position.y += 0.22 + Math.abs(Math.sin(step(ctx.t) * 6)) * 0.05; });
          const ts = [A(ctx, "వంట"), A(ctx, "Splitwise"), A(ctx, "share"), A(ctx, "caste"), A(ctx, "corner")];
          // each roommate steps forward on his line
          const cur = ts.reduce((c, t0, i) => (ctx.t > t0 - 0.1 ? i : c), -1);
          notes.forEach((n, i) => { popIn(n, ctx.t, ts[i] - 0.1, { seed: 20 + i }); if (i < 4 && ctx.t > ts[i + 1] - 0.1) n.visible = false; });
          const tw = ts[1];
          ph.visible = ctx.t > tw - 0.4 && ctx.t < ts[2] + 0.4;
          // the list fills in, one expense per ding
          const shown = ctx.t < tw ? 0 : Math.min(4, 1 + Math.floor((ctx.t - tw) / 0.35));
          cover.scale.y = 1 - shown / 4; cover.position.y = -0.2 - (1.6 * (shown / 4)) / 2 + 0;
          cover.visible = shown < 4;
          ph.position.y = 1.4 + (1 - Math.min(1, pop(ctx.t, tw - 0.4))) * -1;
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          const a = lerp(-0.35, 0.3, k);
          cam(stage, [Math.sin(a) * 11.2, lerp(1.6, 0.7, k), Math.cos(a) * 11.2], [0, -0.4, 0]);
        },
      };
    },
  },

  // ------------------------------------------------ s6: alone in the dark; the worries close in (LEMMiNO hold)
  alone: {
    sounds: (ctx) => [
      { t: ctx.start, s: "heartbeat", gain: 0.35 },
      { t: ctx.start + 1.3, s: "heartbeat", gain: 0.3 },
      { t: A(ctx, "pressure") - 0.1, s: "paper", gain: 0.35 },
      { t: A(ctx, "ఒంటరితనం") - 0.1, s: "paper", gain: 0.35 },
      { t: A(ctx, "అలసిపోతావు") - 0.3, s: "heartbeat", gain: 0.4 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const bg = sheet(16, 20, "#1a2238"); bg.position.z = -2; g.add(bg);
      const win = cutout(1.6, 2.2, (c, W, H) => { c.fillStyle = "#2b3a63"; c.fillRect(0, 0, W, H); c.fillStyle = "#f3e7b5"; c.beginPath(); c.arc(W * 0.7, H * 0.25, 30, 0, 7); c.fill(); c.strokeStyle = "#141a2c"; c.lineWidth = 14; c.strokeRect(0, 0, W, H); c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke(); });
      win.position.set(-1.1, 1.8, -1.8); g.add(win);
      const desk = cutout(3.0, 1.2, (c, W, H) => { c.fillStyle = "#3a2c22"; c.fillRect(0, 0, W, H * 0.18); c.fillRect(W * 0.08, 0, W * 0.06, H); c.fillRect(W * 0.86, 0, W * 0.06, H); });
      desk.position.set(0, -1.6, -0.3); g.add(desk);
      const me = person({ color: "#4a5a7a", hair: "#0f0f12", sit: true, seed: 70 }); me.scale.setScalar(0.85); me.position.set(0, -1.15, -0.5); g.add(me);
      const lap = await model("/assets/sf-laptop/model.glb", { length: 0.8 }); lap.position.set(0.15, -1.1, -0.1); lap.rotation.y = Math.PI; g.add(lap);
      const lamp = new THREE.PointLight(0xffb36b, 2.2, 4, 2); lamp.position.set(0.5, -0.4, 0.6); g.add(lamp);
      const words = ["Loan EMI", "Rent", "ఒంటరితనం", "Job tension", "Visa tension", "Pressure"].map((w, i) => {
        const t = tag(w, { w: 1.3, h: 0.42, size: 58, bg: "#f2ead8", seed: 80 + i, latin: false }); g.add(t); return t;
      });
      const order = ["pressure", "ఒంటరితనం", "job", "visa"];
      return {
        group: g,
        update(ctx) {
          look(stage, { ...DUSK, sunDir: [3, 4, 6], shadow: 5 });
          const tl = A(ctx, "అలసిపోతావు");
          const close = prog(ctx.t, tl - 0.5, tl + 2.5);
          const times = [ctx.start + 0.4, ctx.start + 1.0, A(ctx, "ఒంటరితనం") - 0.1, A(ctx, "job") - 0.1, A(ctx, "visa") - 0.1, A(ctx, "pressure") - 0.1];
          words.forEach((w, i) => {
            const slot = [[-0.7, 1.5], [0.7, 1.0], [-0.7, 0.45], [0.7, -0.1], [-0.7, -0.65], [0.7, -1.2]][i];
            const R = lerp(1, 0.7, close);
            w.position.set(slot[0] * R, -0.1 + slot[1] * R, 0.6 + (i % 2) * 0.2);
            w.userData.base = w.position.clone();
            const k = pop(ctx.t, times[i]);
            w.visible = k > 0; w.scale.set(Math.min(1.2, k), Math.min(1.2, k), 1);
            w.rotation.z = wob(ctx.t, i, 0.03);
          });
          lamp.intensity = lerp(2.2, 0.8, close) * (1 + Math.sin(ctx.t * 13) * 0.02);
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [0, lerp(-0.1, -0.5, k), lerp(9.0, 6.6, k)], [0, -0.6, 0]);
          void order;
        },
      };
    },
  },

  // ------------------------------------------------ s7: the bad habits (MagnatesMedia dark red), then what they eat
  habits: {
    sounds: (ctx) => [
      { t: A(ctx, "drinking") - 0.1, s: "clunk", gain: 0.4 },
      { t: A(ctx, "betting") - 0.1, s: "coins", gain: 0.4 },
      { t: A(ctx, "smoking") - 0.1, s: "whoosh", gain: 0.3 },
      { t: A(ctx, "మెల్లగా") - 0.2, s: "riser", gain: 0.3 },
      { t: A(ctx, "డబ్బుని") - 0.05, s: "snip", gain: 0.45 },
      { t: A(ctx, "health") - 0.05, s: "snip", gain: 0.45 },
      { t: A(ctx, "career") - 0.05, s: "snip", gain: 0.45 },
      { t: A(ctx, "చెడు") - 0.2, s: "thud", gain: 0.5 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const wall = gridWall(14, 18); wall.position.z = -2.5; g.add(wall);
      const table = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.1, 48), std(0x2a1712, { roughness: 0.55 })); table.position.y = -1.6; table.receiveShadow = true; g.add(table);
      const beer = await model("/assets/sf-beer/model.glb", { height: 1.3 }); beer.position.set(-0.9, -1.55, 0.2); g.add(beer);
      const chips = await model("/assets/sf-chips/model.glb", { length: 1.0 }); chips.position.set(0.95, -1.55, 0.2); g.add(chips);
      const cig = new THREE.Group(); cig.position.set(0.05, -1.48, 1.0); cig.rotation.set(0, 0.4, 0.06); g.add(cig);
      const paper_ = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.9, 16), std(0xb9b2a8)); paper_.rotation.z = Math.PI / 2; cig.add(paper_);
      const filt = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.25, 16), std(0xd08a3a)); filt.rotation.z = Math.PI / 2; filt.position.x = -0.55; cig.add(filt);
      const ember = flame(0xff4a12, 0.12); ember.scale.set(1, 1, 1); ember.position.x = 0.46; cig.add(ember);
      const smoke = Array.from({ length: 36 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xbfb6ae, transparent: true, opacity: 0.25, depthWrite: false })); g.add(m); return m; });
      const key = new THREE.SpotLight(0xffc89a, 22, 12, 0.6, 0.7, 1.4); key.position.set(0, 3.5, 3); key.target.position.set(0, -1.5, 0); key.castShadow = true; g.add(key, key.target);
      // the three things they eat: money, health, career — paper cards that get cut
      const cards = [["₹", "డబ్బు", "#2a9d8f"], ["♥", "Health", "#e76f51"], ["↗", "Career", "#e9c46a"]].map(([ic, n, col], i) => {
        const c = tag([{ text: ic, size: 120, color: "#fff" }, { text: n, size: 70 }], { w: 0.95, h: 1.25, bg: col, seed: 90 + i });
        c.position.set((i - 1) * 1.05, 0.7, 0.5); g.add(c); return c;
      });
      return {
        group: g,
        update(ctx) {
          const tb = A(ctx, "కానీ"), tc = A(ctx, "చెడు");
          const bad = prog(ctx.t, tb - 0.2, tb + 1.2);
          look(stage, { ...NIGHT, top: 0x0b0505, bottom: 0x1d0b08, sun: lerp(1.2, 0.6, bad), sunCol: 0xffd0a0, sunDir: [2, 6, 5], shadow: 5, hemiI: 0.3, near: 0.05, fov: 40 });
          key.color.setRGB(1, lerp(0.78, 0.35, bad), lerp(0.6, 0.25, bad));
          const td = A(ctx, "drinking"), tbt = A(ctx, "betting"), ts = A(ctx, "smoking");
          [[beer, td], [chips, tbt], [cig, ts]].forEach(([o, t0]) => { const k = pop(ctx.t, t0 - 0.15, 0.4); o.visible = k > 0; o.scale.setScalar(Math.max(0.001, Math.min(1.1, k))); });
          smoke.forEach((m, i) => {
            const life = ((ctx.t - ts) * 0.35 + i / smoke.length) % 1;
            m.visible = ctx.t > ts;
            m.position.set(0.47 + Math.sin(life * 6 + i) * 0.15 * life, -1.4 + life * 2.4, 1.15 + Math.cos(i) * 0.1);
            m.scale.setScalar(0.5 + life * 3.0); m.material.opacity = 0.08 * (1 - life);
          });
          ["డబ్బుని", "health", "career"].forEach((w, i) => {
            const c = cards[i], tw = A(ctx, w);
            const inK = pop(ctx.t, A(ctx, "మెల్లగా") + i * 0.25);
            const cut = prog(step(ctx.t), tw, tw + 0.8, (x) => x * x);
            c.visible = inK > 0 && cut < 1;
            c.scale.set(Math.min(1, inK), Math.min(1, inK) * (1 - cut * 0.2), 1);
            c.position.y = 0.7 - cut * 3.4; c.rotation.z = cut * (i - 1 || 1) * 0.9;
          });
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          camKeys(stage, ctx.t, [
            [ctx.start, [0, -0.6, 4.2], [0, -1.3, 0.3]],
            [A(ctx, "మెల్లగా") - 0.2, [0.3, 0.1, 7.6], [0, -0.4, 0.3]],
            [tc - 0.3, [0, 0.6, 8.6], [0, 0.4, 0]],
            [ctx.end, [0, 0.4, 7.4], [0, 0.2, 0]],
          ]);
          ctx.O.chip("punch", "చెడు అలవాట్లే… నీ future ని దెబ్బతీయొచ్చు", { alpha: fade(ctx.t, tc - 0.1) * (1 - fade(ctx.t, ctx.end - 0.3, 0.3)), top: 1540, kind: "big warn" });
          void k;
        },
      };
    },
  },

  // ------------------------------------------------ s8: don't carry it alone — a call home, friends, help
  help: {
    sounds: (ctx) => [
      { t: ctx.start + 0.2, s: "shimmer", gain: 0.3 },
      { t: A(ctx, "ఇంట్లో") - 0.2, s: "beep", gain: 0.3 },
      { t: A(ctx, "friends") - 0.1, s: "paper", gain: 0.4 },
      { t: A(ctx, "professional") - 0.1, s: "chime", gain: 0.35 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const bg = sheet(14, 18, "#ffe7c2"); bg.position.z = -0.9; g.add(bg);
      const sunrise = cutout(3.2, 3.2, (c, W, H) => { const gr = c.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W / 2); gr.addColorStop(0, "#ffd27a"); gr.addColorStop(1, "#ffd27a00"); c.fillStyle = gr; c.fillRect(0, 0, W, H); c.fillStyle = "#ffbf52"; c.beginPath(); c.arc(W / 2, H / 2, W * 0.24, 0, 7); c.fill(); }, { fib: 0.5 });
      sunrise.material.alphaTest = 0.05; sunrise.castShadow = false; sunrise.position.set(0, 2.4, -0.85); g.add(sunrise);
      const me = person({ color: NAVY, seed: 100 }); me.scale.setScalar(0.85); me.position.set(0, -1.5, 0); g.add(me);
      const ph = new THREE.Group(); ph.position.set(0.0, 0.9, 0.8); g.add(ph);
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.9, 0.07), std(0x1d1e21, { roughness: 0.4 })); body.castShadow = true; ph.add(body);
      const scr = cutout(0.95, 1.75, (c, W, H) => {
        const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#3a7d6b"); gr.addColorStop(1, "#1f4b52"); c.fillStyle = gr; rr(c, 0, 0, W, H, 26); c.fill();
        c.fillStyle = "#fff"; c.textAlign = "center"; c.font = FONT(600, 70); c.fillText("అమ్మ", W / 2, H * 0.26); c.font = FONTL(500, 34); c.fillText("calling…", W / 2, H * 0.33);
        c.fillStyle = "#c9e8de"; c.beginPath(); c.arc(W / 2, H * 0.55, W * 0.2, 0, 7); c.fill();
        c.fillStyle = "#34c759"; c.beginPath(); c.arc(W / 2, H * 0.85, 46, 0, 7); c.fill();
      }, { fib: 0.2 });
      scr.position.z = 0.04; scr.castShadow = false; ph.add(scr);
      const fam = person({ color: "#b8325a", seed: 101 }); fam.scale.setScalar(0.6); fam.position.set(-1.35, 0.3, -0.2); g.add(fam);
      const fr1 = person({ color: "#00798c", seed: 102 }); fr1.scale.setScalar(0.55); fr1.position.set(1.35, 0.5, -0.2); g.add(fr1);
      const fr2 = person({ color: "#edae49", seed: 103 }); fr2.scale.setScalar(0.5); fr2.position.set(1.7, -0.3, -0.3); g.add(fr2);
      const pro = tag([{ text: "✚", size: 90, color: "#2a9d8f" }, { text: "Professional help", size: 54, latin: true }], { w: 1.9, h: 1.0, seed: 104 }); pro.position.set(-1.2, -0.95, 0.6); pro.userData.rz = 0.06; g.add(pro);
      const l1 = dashLine([V(-1.1, 0.5, 0), V(-0.6, 0.2, 0.3), V(-0.25, -0.4, 0.3)], "#e76f51", 0.02); g.add(l1);
      const l2 = dashLine([V(1.15, 0.6, 0), V(0.7, 0.2, 0.3), V(0.3, -0.4, 0.3)], "#2a9d8f", 0.02); g.add(l2);
      return {
        group: g,
        update(ctx) {
          paperLook(stage, { sunCol: 0xffe2b8, sunDir: [-2, 5, 7] });
          popIn(me, ctx.t, ctx.start);
          const ti = A(ctx, "ఇంట్లో"), tf = A(ctx, "friends"), tp = A(ctx, "professional");
          ph.visible = ctx.t > ti - 0.4 && ctx.t < tf + 0.6;
          ph.position.y = 0.9 + (1 - Math.min(1, pop(ctx.t, ti - 0.4))) * -0.8 + Math.sin(ctx.t * 20) * 0.006;
          popIn(fam, ctx.t, ti, { seed: 2 });
          popIn(fr1, ctx.t, tf - 0.1, { seed: 3 }); popIn(fr2, ctx.t, tf + 0.15, { seed: 4 });
          l1.userData.set(prog(ctx.t, ti + 0.2, ti + 1.0)); l2.userData.set(prog(ctx.t, tf + 0.2, tf + 1.0));
          popIn(pro, ctx.t, tp - 0.1, { seed: 5 });
          sunrise.position.y = lerp(1.6, 2.6, prog(ctx.t, ctx.start, ctx.end));
          drift(stage, ctx, { d: 8.8, push: 0.92, lookY: 0.1 });
          ctx.O.chip("alone", "ఒంటరిగా మోయకు 🤝", { alpha: fade(ctx.t, ctx.start + 0.5) * (1 - fade(ctx.t, ti - 0.6, 0.3)), top: 300, kind: "big" });
        },
      };
    },
  },

  // ------------------------------------------------ s9: graduation, then the three gates: job → sponsor → work visa
  visa: {
    sounds: (ctx) => [
      { t: A(ctx, "degree") - 0.1, s: "whoosh", gain: 0.4 },
      { t: A(ctx, "పరీక్ష") - 0.1, s: "tick", gain: 0.4 },
      { t: A(ctx, "job") - 0.05, s: "ding", gain: 0.3 },
      { t: A(ctx, "sponsor") - 0.05, s: "ding", gain: 0.3 },
      { t: A(ctx, "Work") - 0.05, s: "ding", gain: 0.3 },
      { t: A(ctx, "రాకపోతే") - 0.05, s: "stamp", gain: 0.55 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const bg = sheet(14, 18, "#dfe8f1"); bg.position.z = -0.6; g.add(bg);
      const cap = await model("/assets/sf-gradcap/model.glb", { length: 1.3 }); g.add(cap);
      const hg = await model("/assets/sf-hourglass/model.glb", { height: 1.5 }); hg.position.set(1.3, -3.0, 0.2); g.add(hg);
      const steps = [["1", "Job"], ["2", "Sponsor"], ["3", "Work visa"]].map(([n, s], i) => {
        const off = tag([{ text: n, size: 70, latin: true, color: "#7b8494" }, { text: s, size: 80, latin: true, color: "#3b4252" }], { w: 1.9, h: 1.0, bg: "#ffffff", seed: 110 + i });
        const on = tag([{ text: n, size: 70, latin: true, color: "#fff" }, { text: s, size: 80, latin: true, color: "#fff" }], { w: 1.9, h: 1.0, bg: "#e07a1f", seed: 110 + i });
        const p = new THREE.Group(); p.add(off, on); p.position.set(-0.55, 1.6 - i * 1.45, 0.2); g.add(p);
        const q = stamp("?", { w: 0.8, h: 0.8, rot: 0.15, size: 130 }); q.position.set(0.55, 1.75 - i * 1.45, 0.45); g.add(q);
        return { p, off, on, q };
      });
      const arrows = [0, 1].map((i) => { const a = dashLine([V(-0.55, 1.05 - i * 1.45, 0.25), V(-0.55, 0.65 - i * 1.45, 0.25)], "#8a94a6", 0.02); g.add(a); return a; });
      const sand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4), new THREE.MeshBasicMaterial({ color: 0xe8c27a })); sand.position.set(1.3, -2.25, 0.2); g.add(sand);
      return {
        group: g,
        update(ctx) {
          paperLook(stage, { sunDir: [-3, 5, 7] });
          const td = A(ctx, "degree"), tx = A(ctx, "పరీక్ష");
          const ck = prog(ctx.t, td - 0.4, td + 1.8, lin);
          cap.visible = ctx.t < tx + 0.4;
          cap.position.set(0, -2.5 + Math.sin(ck * Math.PI) * 4.4, 0.6);
          cap.rotation.set(0.4 + ck * 6, ck * 3, 0.2);
          const ts = [A(ctx, "job"), A(ctx, "sponsor"), A(ctx, "Work")], tr = A(ctx, "రాకపోతే");
          steps.forEach((s, i) => {
            const k = pop(ctx.t, tx + 0.2 + i * 0.2);
            s.p.visible = k > 0; s.p.scale.set(Math.min(1, k), Math.min(1, k), 1);
            s.p.rotation.z = wob(ctx.t, 30 + i, 0.01);
            const lit = ctx.t > ts[i] - 0.1 && ctx.t < tr - 0.1;
            s.on.visible = lit; s.off.visible = !lit; s.on.position.z = 0.005;
            const qk = pop(ctx.t, tr + (i === 0 ? 0 : i === 1 ? 1.0 : 2.0), 0.25);
            s.q.visible = qk > 0; s.q.scale.setScalar(lerp(2, 1, Math.min(1, qk)));
          });
          arrows.forEach((a, i) => a.userData.set(prog(ctx.t, ts[i], ts[i] + 0.6)));
          hg.visible = sand.visible = ctx.t > tx;
          sand.visible = hg.visible && Math.floor(ctx.t * 8) % 2 === 0;
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [lerp(0.4, -0.2, k), lerp(-0.3, 0.1, k), lerp(9.5, 9.0, k)], [0.1, -0.3, 0]);
        },
      };
    },
  },

  // ------------------------------------------------ s10: Johnny Harris map — some fly home, some stay stuck
  stuck: {
    sounds: (ctx) => [
      { t: A(ctx, "expiry") - 0.1, s: "tick", gain: 0.5 },
      { t: A(ctx, "expiry") + 0.5, s: "tick", gain: 0.45 },
      { t: A(ctx, "India") - 0.3, s: "jet", gain: 0.3 },
      { t: A(ctx, "reality") - 0.1, s: "stamp", gain: 0.6 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const tex = await new THREE.TextureLoader().loadAsync("/assets/earth/earth_atmos_2048.jpg");
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
      // a printed map lying on the desk: lon -100..100, lat 0..65, warm-tinted
      const LO0 = -100, LO1 = 100, LA0 = 0, LA1 = 65, MW = 20, MH = MW * (LA1 - LA0) / (LO1 - LO0) * 1.2;
      tex.offset.set((LO0 + 180) / 360, (LA0 + 90) / 180); tex.repeat.set((LO1 - LO0) / 360, (LA1 - LA0) / 180);
      const map = new THREE.Mesh(new THREE.PlaneGeometry(MW, MH), new THREE.MeshStandardMaterial({ map: tex, color: 0xffe2b0, roughness: 0.95, emissive: 0x3a2a14 }));
      map.rotation.x = -Math.PI / 2; map.receiveShadow = true; g.add(map);
      const desk = sheet(60, 60, "#6b4a30"); desk.rotation.x = -Math.PI / 2; desk.position.y = -0.02; desk.receiveShadow = true; g.add(desk);
      const P = (lat, lon, y = 0.02) => V(((lon - LO0) / (LO1 - LO0) - 0.5) * MW, y, -((lat - LA0) / (LA1 - LA0) - 0.5) * MH);
      const india = P(17.4, 78.5), west = P(40, -78), uk = P(52, -1);
      const arc = (a, b, h) => [a, a.clone().lerp(b, 0.5).add(V(0, h, 0)), b];
      const home1 = routeLine(arc(west, india, 3.2), 0xff8a1f, 0.05); g.add(home1);
      const home2 = routeLine(arc(uk, india, 2.0), 0xff8a1f, 0.05); g.add(home2);
      const planes = [];
      for (let i = 0; i < 2; i++) { const pl = await model("/assets/sf-a320/model.glb", { length: 0.9 }); g.add(pl); planes.push(pl); }
      const pinI = cutout(0.6, 0.85, (c, W, H) => { c.fillStyle = ORANGE; c.beginPath(); c.arc(W / 2, W / 2, W * 0.42, 0, 7); c.lineTo(W / 2, H); c.fill(); c.fillStyle = "#fff"; c.beginPath(); c.arc(W / 2, W / 2, W * 0.16, 0, 7); c.fill(); });
      pinI.position.copy(india).add(V(0, 0.42, 0)); g.add(pinI);
      const lblI = tag("India", { w: 1.2, h: 0.42, size: 64, latin: true, bg: ORANGE, fg: "#fff", seed: 120 }); lblI.position.copy(india).add(V(-0.9, 0.6, 0.6)); g.add(lblI);
      const stuckFolks = [[west, "#30638e"], [uk, "#6a4c93"]].map(([p, col], i) => { const s = person({ color: col, seed: 130 + i }); s.geometry = s.geometry.clone(); s.geometry.translate(0, 1, 0); s.scale.setScalar(0.5); s.position.copy(p); g.add(s); return s; });
      const hg = await model("/assets/sf-hourglass/model.glb", { height: 1.4 }); hg.position.copy(india).add(V(1.6, 0, 1.2)); g.add(hg);
      const real = stamp("REALITY", { w: 2.6, h: 0.9, rot: -0.14 }); g.add(real);
      const faces = [pinI, lblI, ...stuckFolks];
      return {
        group: g,
        update(ctx) {
          paperLook(stage, { sunDir: [-3, 6, 4], shadow: 9, top: 0xe9dcc2, bottom: 0xd8c6a6 });
          const te = A(ctx, "expiry"), ti = A(ctx, "India"), tr = A(ctx, "reality"), tsg = A(ctx, "struggle");
          const k1 = prog(ctx.t, ti - 0.4, ti + 2.4), k2 = prog(ctx.t, ti + 0.1, ti + 2.8);
          home1.userData.set(k1); home2.userData.set(k2);
          [[planes[0], home1, k1], [planes[1], home2, k2]].forEach(([pl, r, k]) => {
            pl.visible = k > 0 && k < 1;
            const p = r.userData.curve.getPoint(k), q = r.userData.curve.getPoint(Math.min(1, k + 0.01));
            pl.position.copy(p); pl.lookAt(q); pl.rotateY(-Math.PI / 2);
          });
          stuckFolks.forEach((s, i) => { s.visible = ctx.t > tsg - 0.3 + i * 0.2; });
          faces.forEach((f) => f.quaternion.copy(stage.camera.quaternion));
          hg.visible = ctx.t > te - 0.5;
          hg.rotation.z = Math.PI * prog(ctx.t, te, te + 0.6);
          const rk = pop(ctx.t, tr - 0.05, 0.25); real.visible = rk > 0;
          // camera: behind India, looking west across the map towards where they studied
          const ck = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, india.clone().add(V(lerp(0.3, 0.6, ck), lerp(5.0, 8.0, ck), lerp(3.5, 5.5, ck))).toArray(), india.clone().add(V(lerp(-0.5, -1.2, ck), 0, lerp(-1.8, -3.0, ck))).toArray());
          real.position.copy(stage.camera.position).add(V(0, -0.3, 0).add(stage.camera.getWorldDirection(V(0, 0, 0)).multiplyScalar(7)));
          real.quaternion.copy(stage.camera.quaternion); real.rotateZ(-0.14); real.scale.setScalar(lerp(2, 1, Math.min(1, rk)));
        },
      };
    },
  },

  // ------------------------------------------------ s11: AI and layoffs — workers tip over, a robot takes the desk
  ai: {
    sounds: (ctx) => [
      { t: A(ctx, "restructure") - 0.1, s: "zaps", gain: 0.25 },
      ...[0, 1, 2, 3].map((i) => ({ t: A(ctx, "Layoffs") + i * 0.3, s: "paper", gain: 0.45 })),
      { t: A(ctx, "నిన్న") - 0.1, s: "beep", gain: 0.3 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const bg = sheet(16, 18, "#cfd8e3", { lines: (c, W, H) => { c.strokeStyle = "rgba(40,60,90,0.12)"; c.lineWidth = 2; for (let x = 0; x < W; x += 60) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); } } });
      bg.position.z = -2; g.add(bg);
      const floor = sheet(16, 6, "#b7c3d1"); floor.rotation.x = -Math.PI / 2; floor.position.y = -2.2; floor.receiveShadow = true; g.add(floor);
      const workers = [0, 1, 2, 3].map((i) => {
        const w = person({ color: ["#456990", "#6b818c", "#456990", "#6b818c"][i], seed: 140 + i, sit: true });
        w.scale.setScalar(0.55); w.geometry = w.geometry.clone(); w.geometry.translate(0, 1.0, 0);
        w.position.set((i - 1.5) * 1.0, -2.2, -0.8 + (i % 2) * 0.5); g.add(w);
        const d = cutout(0.9, 0.5, (c, W, H) => { c.fillStyle = "#5b4636"; c.fillRect(0, 0, W, H * 0.2); c.fillRect(W * 0.06, 0, W * 0.08, H); c.fillRect(W * 0.86, 0, W * 0.08, H); c.fillStyle = "#222"; c.fillRect(W * 0.35, -H, W * 0.3, H); });
        d.position.set(w.position.x, -1.95, w.position.z - 0.25); g.add(d);
        return w;
      });
      const bot = cutout(1.5, 2.3, (c, W, H) => {
        c.fillStyle = "#9aa7b8"; c.fillRect(W / 2 - 4, 0, 8, H * 0.08); c.beginPath(); c.arc(W / 2, 10, 14, 0, 7); c.fillStyle = "#ff5a45"; c.fill();
        c.fillStyle = "#c9d3df"; rr(c, W * 0.2, H * 0.07, W * 0.6, H * 0.27, 24); c.fill();
        c.fillStyle = "#1d2a3a"; rr(c, W * 0.27, H * 0.13, W * 0.46, H * 0.14, 16); c.fill();
        c.fillStyle = "#5fd4ff"; c.beginPath(); c.arc(W * 0.39, H * 0.2, 16, 0, 7); c.arc(W * 0.61, H * 0.2, 16, 0, 7); c.fill();
        c.fillStyle = "#aeb9c7"; rr(c, W * 0.12, H * 0.38, W * 0.76, H * 0.38, 28); c.fill();
        c.fillStyle = "#24324f"; rr(c, W * 0.26, H * 0.45, W * 0.48, H * 0.16, 12); c.fill();
        c.fillStyle = "#5fd4ff"; c.font = FONTL(800, 44); c.textAlign = "center"; c.fillText("AI", W / 2, H * 0.56);
        c.fillStyle = "#8d99a8"; c.fillRect(W * 0.28, H * 0.76, W * 0.14, H * 0.22); c.fillRect(W * 0.58, H * 0.76, W * 0.14, H * 0.22);
        c.fillRect(W * 0.02, H * 0.42, W * 0.1, H * 0.26); c.fillRect(W * 0.88, H * 0.42, W * 0.1, H * 0.26);
      }); bot.geometry = bot.geometry.clone(); bot.geometry.translate(0, 1.15, 0); bot.position.set(0, -2.2, 0.8); g.add(bot);
      const lay = stamp("LAYOFFS", { w: 2.6, h: 0.85, rot: -0.12 }); lay.position.set(0, 1.9, 0.6); g.add(lay);
      const glob = tag([{ text: "India 🇮🇳  +  Abroad 🌍", size: 64 }], { w: 2.8, h: 0.6, seed: 150 }); glob.position.set(0, 1.0, 0.4); g.add(glob);
      const risk = tag([{ text: "1 job = 1 skill = RISK", size: 70, latin: true, color: RED }], { w: 3.0, h: 0.6, seed: 151 }); risk.position.set(0, 2.0, 0.7); g.add(risk);
      return {
        group: g,
        update(ctx) {
          paperLook(stage, { sunCol: 0xe8f0ff, sunDir: [-3, 6, 6], top: 0xcfd8e3, bottom: 0xb7c3d1 });
          const tL = A(ctx, "Layoffs"), tb = A(ctx, "బయట"), tn = A(ctx, "నిన్న"), ts = A(ctx, "skill");
          workers.forEach((w, i) => {
            const k = prog(step(ctx.t), tL + i * 0.3, tL + i * 0.3 + 0.35, (x) => x * x);
            w.rotation.z = k * (i % 2 ? -1.2 : 1.2); w.position.y = -2.2 - k * 0.15; w.visible = true;
          });
          const bk = prog(ctx.t, A(ctx, "restructure") - 0.5, tn + 1.0);
          bot.position.set(lerp(3.4, 0.0, bk), -2.2 + Math.abs(Math.sin(ctx.t * 6)) * 0.04 * (bk < 1 ? 1 : 0), 0.8);
          bot.rotation.z = bk < 1 ? Math.sin(step(ctx.t) * 9) * 0.06 : 0;
          const lk = pop(ctx.t, tL - 0.05, 0.25); lay.visible = lk > 0 && ctx.t < ts - 0.4; lay.scale.setScalar(lerp(2, 1, Math.min(1, lk)));
          glob.visible = ctx.t > tb - 0.2 && ctx.t < ts - 0.4; popIn(glob, ctx.t, tb - 0.2, { seed: 4 });
          popIn(risk, ctx.t, ts - 0.3, { seed: 5 });
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [lerp(-1.2, 0.8, k), lerp(0.6, 0.2, k), lerp(9.0, 8.4, k)], [0, -0.3, 0]);
        },
      };
    },
  },

  // ------------------------------------------------ s12: the turn to hope — other fields (Ali Abdaal bright)
  fields: {
    sounds: (ctx) => [
      { t: ctx.start, s: "shimmer", gain: 0.4 },
      ...["VLSI", "semiconductor", "chip", "hardware", "civil"].map((w) => ({ t: A(ctx, w) - 0.08, s: "paper", gain: 0.45 })),
      { t: A(ctx, "demand") - 0.1, s: "ding", gain: 0.3 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const bg = sheet(14, 18, "#fff1c9"); bg.position.z = -0.9; g.add(bg);
      const rays = cutout(9, 9, (c, W, H) => { c.fillStyle = "#ffe08a"; for (let i = 0; i < 16; i += 2) { c.beginPath(); c.moveTo(W / 2, H / 2); c.arc(W / 2, H / 2, W, (i / 16) * Math.PI * 2, ((i + 1) / 16) * Math.PI * 2); c.fill(); } }, { px: 60 });
      rays.position.z = -0.85; rays.castShadow = false; g.add(rays);
      const chip = new THREE.Group(); chip.position.set(0, 0.2, 0.6); g.add(chip);
      const die = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.16), std(0x1f2328, { roughness: 0.35, metalness: 0.3 })); die.castShadow = true; chip.add(die);
      const top = cutout(1.1, 1.1, (c, W, H) => { c.fillStyle = "#2b3138"; c.fillRect(0, 0, W, H); c.strokeStyle = "#5fd4ff"; c.lineWidth = 4; for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(20, 30 + i * 18); c.lineTo(W * 0.4, 30 + i * 18); c.lineTo(W * 0.5, 60 + i * 12); c.stroke(); } c.fillStyle = "#e9f6ff"; c.textAlign = "center"; c.font = FONTL(800, 46); c.fillText("VLSI", W / 2, H * 0.82); }, { fib: 0.1 });
      top.position.z = 0.085; top.castShadow = false; top.material.emissive = new THREE.Color(0x103040); chip.add(top);
      for (let side = 0; side < 4; side++) for (let i = 0; i < 8; i++) { const pin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.04), std(0xd9b45a, { metalness: 0.8, roughness: 0.3 })); const u = -0.6 + i * (1.2 / 7); const a = (side * Math.PI) / 2; pin.position.set(Math.cos(a) * 0.82 - Math.sin(a) * u, Math.sin(a) * 0.82 + Math.cos(a) * u, 0); pin.rotation.z = a + Math.PI / 2; chip.add(pin); }
      const glow = new THREE.PointLight(0x7fe0ff, 4, 4, 2); glow.position.set(0, 0.6, 1.0); g.add(glow);
      const items = [["VLSI", "#2a9d8f"], ["Semiconductor", "#264653"], ["Chip design", "#e76f51"], ["Hardware", "#6a4c93"], ["Civil Engg.", "#f4a261"]];
      const pos = [[-1.1, 2.0], [1.05, 2.4], [-1.2, -1.6], [1.15, -1.9], [0, -3.0]];
      const cards = items.map(([n, col], i) => { const t = tag([{ text: n, size: 74, latin: true, color: "#fff" }], { w: 1.9, h: 0.62, bg: col, seed: 160 + i }); t.position.set(pos[i][0], pos[i][1], 0.6); t.userData.rz = (i % 2 ? -1 : 1) * 0.07; g.add(t); return t; });
      const bridge = cutout(2.2, 0.9, (c, W, H) => { c.strokeStyle = "#7a5230"; c.lineWidth = 16; c.beginPath(); c.moveTo(0, H * 0.4); c.quadraticCurveTo(W / 2, -H * 0.3, W, H * 0.4); c.stroke(); c.fillStyle = "#7a5230"; c.fillRect(0, H * 0.45, W, H * 0.14); for (let x = 0.1; x < 1; x += 0.15) c.fillRect(W * x, H * 0.1, 8, H * 0.4); c.fillRect(W * 0.08, H * 0.5, 20, H * 0.5); c.fillRect(W * 0.88, H * 0.5, 20, H * 0.5); });
      bridge.position.set(0, -3.75, 0.3); g.add(bridge);
      const ask = tag([{ text: "Demand?  Interest?  Research ✓", size: 64, latin: true }], { w: 3.2, h: 0.6, seed: 170 }); ask.position.set(0, 3.25, 0.7); g.add(ask);
      return {
        group: g,
        update(ctx) {
          const bright = prog(ctx.t, ctx.start, ctx.start + 1.2);
          paperLook(stage, { exposure: lerp(0.7, 1.05, bright), sunCol: 0xfff6dc });
          rays.rotation.z = step(ctx.t) * 0.05;
          chip.rotation.set(-0.35 + Math.sin(ctx.t * 0.7) * 0.12, Math.sin(ctx.t * 0.5) * 0.4, 0.1);
          const pk = pop(ctx.t, A(ctx, "VLSI") - 0.6); chip.visible = pk > 0; chip.scale.setScalar(Math.max(0.001, Math.min(1, pk)));
          glow.intensity = 4 + Math.sin(ctx.t * 3) * 1.2;
          ["VLSI", "semiconductor", "chip", "hardware", "civil"].forEach((w, i) => popIn(cards[i], ctx.t, A(ctx, w) - 0.1, { seed: 40 + i }));
          popIn(bridge, ctx.t, A(ctx, "civil") + 0.1, { seed: 46 });
          popIn(ask, ctx.t, A(ctx, "demand") - 0.15, { seed: 47 });
          drift(stage, ctx, { d: 10.6, push: 0.93, lookY: -0.3 });
        },
      };
    },
  },

  // ------------------------------------------------ s13: one main skill + 4–5 more; the side options
  skills: {
    sounds: (ctx) => [
      ...["digital", "content", "freelancing"].map((w) => ({ t: A(ctx, w) - 0.08, s: "paper", gain: 0.45 })),
      { t: A(ctx, "main") - 0.1, s: "stamp", gain: 0.45 },
      ...[0, 1, 2, 3, 4].map((i) => ({ t: A(ctx, "నాలుగైదు") + i * 0.18, s: "tick", gain: 0.35 })),
      { t: A(ctx, "opportunity") - 0.1, s: "chime", gain: 0.4 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const bg = sheet(14, 18, "#dff3ea"); bg.position.z = -0.6; g.add(bg);
      const lap = await model("/assets/sf-laptop/model.glb", { length: 1.6 }); lap.position.set(0, 1.55, 0.2); lap.rotation.set(0.3, 0, 0); g.add(lap);
      const side = [["Digital marketing", "#e76f51"], ["Content creation", "#6a4c93"], ["Freelancing", "#2a9d8f"]].map(([n, c], i) => { const t = tag([{ text: n, size: 66, latin: true, color: "#fff" }], { w: 2.4, h: 0.55, bg: c, seed: 180 + i }); t.position.set((i - 1) * 0.35, 1.0 - i * 0.62, 0.5); t.userData.rz = (i - 1) * 0.05; g.add(t); return t; });
      const main = tag([{ text: "MAIN SKILL", size: 92, latin: true, color: "#fff" }], { w: 2.1, h: 0.8, bg: INK, seed: 190 }); main.position.set(0, -1.9, 0.6); g.add(main);
      const extra = [0, 1, 2, 3, 4].map((i) => {
        const a = Math.PI * (0.1 + i * 0.2);
        const t = tag([{ text: `+ skill ${i + 1}`, size: 56, latin: true }], { w: 1.25, h: 0.45, bg: "#fffdf6", seed: 200 + i });
        t.position.set(Math.cos(a) * 1.2, -1.9 - Math.sin(a) * 1.3, 0.5); g.add(t);
        const l = dashLine([V(0, -1.9, 0.45), V(Math.cos(a) * 1.0, -1.9 - Math.sin(a) * 0.85, 0.45)], "#5b6b63", 0.015); g.add(l);
        return [t, l];
      });
      const shield = tag([{ text: "Job పోయినా → కొత్త opportunity", size: 60 }], { w: 3.3, h: 0.6, bg: "#ffe08a", seed: 210 }); shield.position.set(0, -3.65, 0.8); g.add(shield);
      return {
        group: g,
        update(ctx) {
          paperLook(stage, { sunDir: [-3, 5, 7] });
          lap.visible = true; popIn(lap, ctx.t, ctx.start, { dy: -0.3 }); lap.scale.setScalar(1); lap.rotation.z = 0;
          ["digital", "content", "freelancing"].forEach((w, i) => popIn(side[i], ctx.t, A(ctx, w) - 0.1, { seed: 50 + i }));
          popIn(main, ctx.t, A(ctx, "main") - 0.1, { seed: 55 });
          const tn = A(ctx, "నాలుగైదు");
          extra.forEach(([t, l], i) => { popIn(t, ctx.t, tn + i * 0.18, { seed: 60 + i }); l.userData.set(prog(ctx.t, tn + i * 0.18, tn + i * 0.18 + 0.4)); });
          popIn(shield, ctx.t, A(ctx, "opportunity") - 0.2, { seed: 66 });
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [0.2, lerp(1.4, -1.4, k), lerp(8.6, 9.2, k)], [0, lerp(1.2, -1.6, k), 0]);
        },
      };
    },
  },

  // ------------------------------------------------ s14: the notebook checklist
  checklist: {
    sounds: (ctx) => [
      { t: A(ctx, "mindset") - 0.1, s: "snip", gain: 0.4 },
      ...["country", "course", "market", "rules", "ఖర్చు", "తీరుస్తావు", "దొరుకుతాయా"].map((w) => ({ t: A(ctx, w) - 0.05, s: "tick", gain: 0.5 })),
      { t: A(ctx, "research") - 0.1, s: "ding", gain: 0.35 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const desk = sheet(14, 18, "#8a6a4a"); desk.position.z = -0.5; g.add(desk);
      const nb = cutout(3.6, 6.6, (c, W, H) => {
        c.fillStyle = "#fffdf6"; rr(c, 0, 0, W, H, 16); c.fill();
        c.strokeStyle = "rgba(70,120,200,0.35)"; c.lineWidth = 3; for (let y = H * 0.12; y < H; y += H / 22) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
        c.strokeStyle = "rgba(220,60,60,0.55)"; c.beginPath(); c.moveTo(W * 0.14, 0); c.lineTo(W * 0.14, H); c.stroke();
      }, { px: 120 });
      nb.position.set(0, -0.2, -0.3); nb.castShadow = false; g.add(nb);
      const both = [["Foreign ✓", "#2a9d8f"], ["India ✓", "#e76f51"]].map(([s, c], i) => { const t = tag([{ text: s, size: 80, latin: true, color: "#fff" }], { w: 1.5, h: 0.6, bg: c, seed: 220 + i }); t.position.set(i ? 0.85 : -0.85, 2.55, 0); g.add(t); return t; });
      const myth = tag([{ text: "Foreign = Life settle", size: 70, latin: true }], { w: 2.9, h: 0.55, bg: "#fff4d6", seed: 225 }); myth.position.set(0, 1.75, 0); g.add(myth);
      const strike = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.07, 0.02), std(0xd23a2c)); strike.position.set(0, 1.75, 0.05); strike.rotation.z = -0.05; g.add(strike);
      const qs = ["ఏ country?", "ఏ course?", "Job market?", "Visa rules?", "మొత్తం ఖర్చు?", "Loan repayment?", "Part-time jobs?"];
      const rows = qs.map((q, i) => {
        const y = 0.95 - i * 0.56;
        const t = cutout(2.8, 0.5, (c, W, H) => { c.fillStyle = INK; c.textBaseline = "middle"; c.textAlign = "left"; fitText(c, q, 90, H / 2 + 4, W - 100, 600, 66); c.strokeStyle = INK; c.lineWidth = 5; c.strokeRect(12, H * 0.2, H * 0.6, H * 0.6); }, { fib: 0.3 });
        t.position.set(0.05, y, -0.25); t.castShadow = false; g.add(t);
        const tick = cutout(0.5, 0.5, (c, W, H) => { c.strokeStyle = "#1f8a4c"; c.lineWidth = 14; c.lineCap = "round"; c.beginPath(); c.moveTo(W * 0.15, H * 0.5); c.lineTo(W * 0.42, H * 0.78); c.lineTo(W * 0.9, H * 0.15); c.stroke(); }, { fib: 0.2 });
        tick.position.set(-1.12, y + 0.05, -0.2); tick.castShadow = false; g.add(tick);
        return [t, tick];
      });
      return {
        group: g,
        update(ctx) {
          paperLook(stage, { sunDir: [-2, 5, 8], shadow: 5 });
          const ti = A(ctx, "India"), tm = A(ctx, "mindset");
          popIn(both[0], ctx.t, ctx.start + 0.2, { seed: 70 }); popIn(both[1], ctx.t, ti - 0.1, { seed: 71 });
          popIn(myth, ctx.t, tm - 1.4, { seed: 72 });
          const sk = prog(step(ctx.t), tm, tm + 0.35); strike.visible = sk > 0; strike.scale.x = Math.max(0.001, sk); strike.position.x = -1.5 + 1.5 * sk;
          ["country", "course", "market", "rules", "ఖర్చు", "తీరుస్తావు", "దొరుకుతాయా"].forEach((w, i) => {
            const tw = A(ctx, w);
            const [t, tick] = rows[i];
            t.visible = ctx.t > tw - 0.6;
            const kk = pop(ctx.t, tw + 0.15, 0.25); tick.visible = kk > 0; tick.scale.setScalar(Math.max(0.001, Math.min(1.2, kk)));
          });
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [lerp(0.6, -0.2, k), lerp(1.6, -0.6, k), lerp(7.2, 9.6, k)], [0, lerp(1.6, -0.4, k), 0]);
        },
      };
    },
  },

  // ------------------------------------------------ s15: not a degree, not a job, not a country — SKILLS; then the take-off
  finale: {
    sounds: (ctx) => [
      ...["degree", "job", "country"].map((w) => ({ t: A(ctx, w) - 0.05, s: "snip", gain: 0.45 })),
      { t: A(ctx, "skills") - 0.1, s: "stamp", gain: 0.7 },
      { t: A(ctx, "planning") - 0.4, s: "jet", gain: 0.45 },
      { t: A(ctx, "share") - 0.2, s: "chime", gain: 0.4 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const sky = sheet(16, 20, "#ffb27a"); sky.position.z = -3; g.add(sky);
      const sun = cutout(2.2, 2.2, (c, W, H) => { c.fillStyle = "#ffe08a"; c.beginPath(); c.arc(W / 2, H / 2, W * 0.46, 0, 7); c.fill(); }); sun.position.set(0.6, -0.4, -2.8); g.add(sun);
      const h1 = skyline(10, 3.2, "#e0785a", 11); h1.position.set(0, -2.4, -2.2); g.add(h1);
      const h2 = skyline(10, 3.0, "#a3504a", 12); h2.position.set(0, -3.0, -1.4); g.add(h2);
      const h3 = skyline(10, 2.4, "#4b2e3a", 13); h3.position.set(0, -3.7, -0.5); g.add(h3);
      const me = person({ color: "#2b2d42", hair: "#0f0f12", bag: true, seed: 230 }); me.scale.setScalar(0.85); me.position.set(-0.6, -2.55, 0.4); g.add(me);
      const suit = await model("/assets/sf-suitcase/model.glb", { height: 0.45 }); suit.position.set(0.05, -3.05, 0.6); suit.rotation.y = -0.6; g.add(suit);
      const plane = await model("/assets/sf-a320/model.glb", { length: 1.6 }); g.add(plane);
      const trail = dashLine([V(-2.6, -1.0, -1.0), V(-0.6, 0.6, -1.0), V(1.4, 2.2, -1.0), V(3.0, 3.4, -1.0)], "#fff4dc", 0.02); g.add(trail);
      const nots = ["Degree", "Job", "Country"].map((s, i) => {
        const t = tag([{ text: s, size: 84, latin: true }], { w: 1.4, h: 0.55, bg: CREAM, seed: 240 + i }); t.position.set((i - 1) * 1.25, 1.9, 0.6); t.userData.rz = (i - 1) * 0.06; g.add(t);
        const x = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.02), std(0xd23a2c)); x.position.set(t.position.x, 1.9, 0.65); x.rotation.z = -0.2; g.add(x);
        return [t, x];
      });
      const dreams = tag([{ text: "Dreams కోసం risk ✓", size: 74 }], { w: 2.8, h: 0.6, bg: "#fff4dc", seed: 250 }); dreams.position.set(0, 2.0, 0.6); g.add(dreams);
      const one = tag([{ text: "Future = 1 decision ✗", size: 74, latin: true, color: RED }], { w: 2.8, h: 0.6, bg: "#fff4dc", seed: 251 }); one.position.set(0, 1.25, 0.6); g.add(one);
      const upg = tag([{ text: "Upgrade ↻", size: 70, latin: true }], { w: 1.7, h: 0.5, bg: "#ffe08a", seed: 252 }); upg.position.set(0, -0.15, 0.95); g.add(upg);
      const sk = stamp("SKILLS", { w: 3.3, h: 1.2, color: "#1d1e21", rot: -0.1, size: 170 }); sk.position.set(0, 0.75, 0.9); g.add(sk);
      return {
        group: g,
        update(ctx) {
          paperLook(stage, { sunCol: 0xffd6a0, sunDir: [2, 3, 7], top: 0xffb27a, bottom: 0xffd6a8 });
          ["degree", "job", "country"].forEach((w, i) => {
            const tw = A(ctx, w);
            popIn(nots[i][0], ctx.t, tw - 0.35, { seed: 80 + i });
            const xk = prog(step(ctx.t), tw + 0.25, tw + 0.5); nots[i][1].visible = xk > 0; nots[i][1].scale.x = Math.max(0.001, xk);
          });
          const tdg = A(ctx, "degree");
          popIn(dreams, ctx.t, ctx.start + 0.1, { seed: 95 }); popIn(one, ctx.t, A(ctx, "decision") - 0.2, { seed: 96 });
          if (ctx.t > tdg - 0.5) dreams.visible = one.visible = false;
          popIn(upg, ctx.t, A(ctx, "upgrade") - 0.1, { seed: 97 });
          const ts = A(ctx, "skills");
          const k = pop(ctx.t, ts - 0.05, 0.3); sk.visible = k > 0; sk.scale.setScalar(lerp(2.4, 1, Math.min(1, k)));
          const tp = A(ctx, "planning");
          const fk = prog(ctx.t, tp - 0.5, tp + 4.0, (x) => x * x);
          plane.visible = fk > 0 && fk < 1; trail.userData.set(fk);
          const p = trail.userData.curve.getPoint(Math.min(0.999, fk)), q = trail.userData.curve.getPoint(Math.min(1, fk + 0.01));
          plane.position.copy(p); plane.lookAt(q); plane.rotateY(-Math.PI / 2);
          sun.position.y = lerp(-1.0, 0.6, prog(ctx.t, ctx.start, ctx.end));
          popIn(me, ctx.t, ctx.start, { seed: 90 });
          const kk = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [lerp(0.2, 0, kk), lerp(0.4, -0.2, kk), lerp(9.0, 10.6, kk)], [0, lerp(0.8, 0, kk), 0]);
          const tsh = A(ctx, "share");
          ctx.O.chip("share", "Abroad plan చేస్తున్న friend కి share చెయ్ 👇", { alpha: fade(ctx.t, tsh - 0.4), top: 1560, kind: "big" });
        },
      };
    },
  },
};
