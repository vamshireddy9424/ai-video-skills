// Hyderabad water crisis × El Niño: a dry tap, the warm Pacific, failed rain, the city's pipelines,
// the water trapped under Nagarjuna Sagar's outlet, and the months ahead.
// Realistic daylight with real models (Sketchfab, credits in assets/sf-*/credit.json); built pieces
// (dam, map, soil sections) use baked noise textures so nothing reads as flat plastic.
// Every event hangs off a spoken word (ctx.at). No GL points and no live CanvasTextures (both fail
// on a Mac GPU): glows are meshes, every drawn texture is baked to bytes.
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
  if (hide) src.traverse((o) => { if (o.isMesh && hide.test(o.material?.name || "")) o.visible = false; });
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
function gauge(r, h, { color = 0x2f8fbf } = {}) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 64, 1, true), glass());
  shell.position.y = h / 2;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.08, r * 1.12, 0.3, 64), std(0x3a3c40, { roughness: 0.4, metalness: 0.6 }));
  base.position.y = 0.15;
  base.castShadow = base.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 8, 64), std(0xcfd6dc, { roughness: 0.3, metalness: 0.8 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = h;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.97, r * 0.97, 1, 64), waterMat(color, { opacity: 0.88, repeat: 1 }));
  water.castShadow = false;
  g.add(base, water, shell, rim);
  g.userData.set = (lv) => {
    water.visible = lv > 0.02;
    water.scale.y = Math.max(0.02, lv);
    water.position.y = 0.3 + Math.max(0.02, lv) / 2;
  };
  g.userData.set(0);
  return g;
}

/** Instanced bright beads that flow along a curve (water in a pipe, a stream). */
function flow(curve, n, color = 0x7fd8ff, r = 0.25) {
  const m = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 10, 8), glowMat(color, 1.8), n);
  m.frustumCulled = false;
  const M = new THREE.Matrix4();
  return {
    mesh: m,
    place(t, speed = 0.12, upto = 1, alpha = 1) {
      for (let i = 0; i < n; i++) {
        const u = ((i / n + t * speed) % 1) * upto;
        const p = curve.getPointAt(u);
        M.makeScale(alpha, alpha, alpha).setPosition(p);
        m.setMatrixAt(i, M);
      }
      m.instanceMatrix.needsUpdate = true;
      m.visible = alpha > 0.01;
    },
  };
}
/** Falling rain: thin streaks inside a box, deterministic in time. */
function rain(n, [x0, x1], [y0, y1], [z0, z1], color = 0xcfe6ff) {
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 1.1, 0.035), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }), n);
  m.frustumCulled = false;
  const r = rand(5), seeds = Array.from({ length: n }, () => [r(), r(), r()]);
  const M = new THREE.Matrix4();
  return {
    mesh: m,
    place(t, k = 1) {
      for (let i = 0; i < n; i++) {
        const [a, b, c] = seeds[i];
        const on = b < k;
        const y = y1 - (((t * 22 + c * (y1 - y0)) % (y1 - y0)));
        M.makeScale(on ? 1 : 0, on ? 1 : 0, on ? 1 : 0).setPosition(lerp(x0, x1, a), y, lerp(z0, z1, (a * 7.31 + c * 3.7) % 1));
        m.setMatrixAt(i, M);
      }
      m.instanceMatrix.needsUpdate = true;
      m.visible = k > 0.01;
    },
  };
}
/** Soft cloud billboard texture. */
function cloudTex() {
  return once("cloud", () => drawn(256, 256, (g) => {
    const r = rand(91);
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.8) * 70;
      const x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d, rad = 18 + r() * 44;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(255,255,255,${0.08 + r() * 0.08})`);
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 256);
    }
  }));
}
function cloudBank(n, spread, { seed = 4, size = 16, color = 0xffffff, opacity = 0.9 } = {}) {
  const g = new THREE.Group(), r = rand(seed);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex(), color, transparent: true, opacity, depthWrite: false }));
    s.position.set((r() - 0.5) * spread[0], (r() - 0.5) * spread[1], (r() - 0.5) * spread[2]);
    s.scale.setScalar(size * (0.6 + r() * 0.8));
    s.userData.o = opacity;
    g.add(s);
  }
  g.userData.fade = (a) => g.children.forEach((s) => (s.material.opacity = s.userData.o * a));
  return g;
}

/** Simple low-rise Indian city blocks: plastered boxes with windows, rooftop tanks. */
function cityBlocks(n, { seed = 9, inner = 0, outer = 40, centre = [0, 0], minH = 4, maxH = 22, avoid = () => false, footprint = [4, 9] } = {}) {
  const r = rand(seed);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const winTex = once("win", () => drawn(128, 128, (g) => {
    g.fillStyle = "#ece6da"; g.fillRect(0, 0, 128, 128);
    const r2 = rand(17);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(120,105,85,${r2() * 0.06})`; g.fillRect(r2() * 128, r2() * 128, 3 + r2() * 10, 3 + r2() * 10); }
    for (let y = 6; y < 128; y += 32) {
      g.fillStyle = "rgba(0,0,0,0.10)"; g.fillRect(0, y + 22, 128, 3);
      for (let x = 6; x < 128; x += 42) { g.fillStyle = "#cfc8bb"; g.fillRect(x - 2, y - 2, 30, 22); g.fillStyle = "#5d6b77"; g.fillRect(x, y, 26, 18); g.fillStyle = "#8697a3"; g.fillRect(x, y, 26, 4); }
    }
  }));
  const mat = new THREE.MeshStandardMaterial({ map: winTex, roughness: 0.9 });
  const inst = new THREE.InstancedMesh(geo, mat, n);
  inst.castShadow = inst.receiveShadow = true;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), C = new THREE.Color();
  const list = [];
  const cols = [0xf3ead8, 0xe9dcc6, 0xdcd3c4, 0xf0e2c9, 0xd9e1e6, 0xe8d0b8];
  for (let i = 0, made = 0; made < n && i < n * 30; i++) {
    const a = r() * Math.PI * 2, d = lerp(inner, outer, Math.sqrt(r()));
    const x = centre[0] + Math.cos(a) * d, z = centre[1] + Math.sin(a) * d;
    if (avoid(x, z)) continue;
    const w = lerp(footprint[0], footprint[1], r()), dd = lerp(footprint[0], footprint[1], r()), h = lerp(minH, maxH, Math.pow(r(), 2));
    P.set(x, 0, z); Q.setFromAxisAngle(V(0, 1, 0), Math.round(r() * 4) * Math.PI / 2 + (r() - 0.5) * 0.1); S.set(w, h, dd);
    inst.setMatrixAt(made, M.compose(P, Q, S));
    inst.setColorAt(made, C.setHex(cols[Math.floor(r() * cols.length)]));
    list.push({ x, z, w, h, d: dd, i: made, q: Q.clone() });
    made++;
  }
  inst.userData.list = list;
  return inst;
}

// latitude/longitude → map units (sources and lakes maps)
const MAP = { lat: 17.6, lon: 78.6, k: 59 };
const ll = (lat, lon, y = 0) => V((lon - MAP.lon) * MAP.k, y, -(lat - MAP.lat) * MAP.k);

// ---------------------------------------------------------------- scenes
export const scenes = {
  // ------------------------------------------------ s1: a tap in a Hyderabad home; the last drops
  hook: {
    sounds: (ctx) => {
      const out = [{ t: ctx.start + 0.1, s: "heat", gain: 0.25 }, { t: ctx.start + 0.4, s: "sputter", gain: 0.55 }];
      for (const t of hookDrops(ctx)) out.push({ t: t + 0.42, s: "drip", gain: 0.55 });
      out.push({ t: ctx.at("2.8mm") - 0.1, s: "thud", gain: 0.45 });
      return out;
    },
    async build(stage) {
      const g = new THREE.Group();
      const plaster = grain(21, [214, 196, 168], { scale: 18, amt: 0.12, size: 512 });
      const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 0.3), new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.95 }));
      wall.position.set(0, 2, -0.5);
      wall.receiveShadow = true;
      // a darker damp band where water used to splash
      const damp = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.55), new THREE.MeshStandardMaterial({ map: grain(22, [150, 140, 118], { scale: 30, amt: 0.25 }), roughness: 1, transparent: true, opacity: 0.55 }));
      damp.position.set(0, 0.28, -0.34);
      const floor = groundPlane(12, { tex: grain(23, [176, 168, 156], { scale: 40, amt: 0.1, size: 512 }), repeat: 3, rough: 0.8 });
      const tap = await model("/assets/sf-tap/model.glb", { height: 0.3, rotY: Math.PI / 2 });
      tap.position.set(0, 0.86, -0.36 + tap.userData.size.z / 2);
      const bucket = await model("/assets/sf-bucket/model.glb", { height: 0.36 });
      g.add(wall, floor, tap, bucket);
      g.updateMatrixWorld(true);
      const tb = new THREE.Box3().setFromObject(tap, true);
      const spout = V((tb.min.x + tb.max.x) / 2, tb.min.y + 0.005, tb.max.z - 0.035);
      bucket.position.set(spout.x, 0, spout.z + 0.02);
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.011, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, roughness: 0, transmission: 0.6, transparent: true, opacity: 0.9, clearcoat: 1, envMapIntensity: 3 }));
      drop.scale.y = 1.25;
      g.add(drop);
      // a thin film of water left in the bucket
      const film = new THREE.Mesh(new THREE.CircleGeometry(0.115, 48), waterMat(0x6f8d96, { opacity: 0.7, repeat: 1, rough: 0.02 }));
      film.rotation.x = -Math.PI / 2;
      film.position.set(spout.x, 0.04, spout.z + 0.02);
      g.add(film);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.01, 0.014, 32), new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.6 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(spout.x, 0.042, spout.z + 0.02);
      g.add(ring);
      return {
        group: g,
        update(ctx) {
          look(stage, { top: 0x3a3430, bottom: 0x8c7660, fog: 0, exposure: 0.9, sun: 3.4, sunCol: 0xffd9a8, sunDir: [-3, 3.2, 2.4], shadow: 2.2, hemiI: 0.45, hemiSky: 0xffe9cc, hemiGround: 0x6a5a48, env: 0.5, near: 0.02 });
          const drops = hookDrops(ctx);
          drop.visible = false;
          ring.visible = false;
          for (const t0 of drops) {
            const dt = ctx.t - t0;
            if (dt > -0.5 && dt < 0) { // forming at the lip
              drop.visible = true;
              const k = (dt + 0.5) / 0.5;
              drop.scale.setScalar(0.4 + 0.6 * k);
              drop.scale.y *= 1.2;
              drop.position.set(spout.x, spout.y - 0.011 * k, spout.z);
            } else if (dt >= 0 && dt < 0.42) {
              drop.visible = true;
              drop.scale.set(0.9, 1.35, 0.9);
              drop.position.set(spout.x, Math.max(0.05, spout.y - 0.011 - 0.5 * 9.8 * dt * dt), spout.z);
            } else if (dt >= 0.42 && dt < 1.2) {
              ring.visible = true;
              const k = (dt - 0.42) / 0.78;
              ring.scale.setScalar(1 + k * 6);
              ring.material.opacity = 0.6 * (1 - k);
            }
          }
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          const s = spout.clone();
          cam(stage, mix3([1.0, 1.15, 2.1], [0.55, 1.0, 1.35], k), mix3([0, 0.62, -0.05], [s.x, s.y - 0.22, s.z], k));
          stage.dof({ focus: stage.camera.position.distanceTo(s), aperture: 0.0025, maxblur: 0.008 });
          const t88 = ctx.at("88mm"), t28 = ctx.at("2.8mm");
          ctx.O.stat("n88", "88 mm", "October లో పడాల్సిన వర్షం", { alpha: prog(ctx.t, t88 - 0.2, t88 + 0.3) * (1 - prog(ctx.t, t28 - 0.6, t28 - 0.2)), top: 1560 });
          ctx.O.stat("n28", "2.8 mm", "పడింది ఇంతే", { alpha: prog(ctx.t, t28 - 0.2, t28 + 0.3), top: 1560, color: "#ff5a45" });
        },
      };
    },
  },

  // ------------------------------------------------ s2-s3: El Niño — warm water slides east, the monsoon clouds leave India
  globe: {
    sounds: (ctx) => [
      { t: ctx.start, s: "wind", gain: 0.18 },
      { t: ctx.at("తూర్పు") - 0.3, s: "shimmer", gain: 0.4 },
      { t: ctx.at("దూరం") - 0.3, s: "wind", gain: 0.25 },
      { t: ctx.at("ఈసారి") - 1.2, s: "riser", gain: 0.35 },
      { t: ctx.at("+4°C") - 0.1, s: "thud", gain: 0.5 },
      { t: ctx.at("1997") - 0.1, s: "flash", gain: 0.35 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const load = (f, srgb) => new Promise((ok) => new THREE.TextureLoader().load(`/assets/earth/${f}`, (t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; ok(t); }));
      const [day, clouds, normal, spec] = await Promise.all([load("earth_atmos_2048.jpg", true), load("earth_clouds_1024.png", true), load("earth_normal_2048.jpg"), load("earth_specular_2048.jpg")]);
      const E = 20;
      const earth = new THREE.Group();
      earth.add(new THREE.Mesh(new THREE.SphereGeometry(E, 160, 120), new THREE.MeshPhongMaterial({ map: day, normalMap: normal, specularMap: spec, shininess: 22 })));
      const cl = new THREE.Mesh(new THREE.SphereGeometry(E * 1.012, 120, 90), new THREE.MeshLambertMaterial({ map: clouds, transparent: true, opacity: 0.45, depthWrite: false }));
      earth.add(cl);
      // the warm-water anomaly: a soft red-orange blob on the ocean, centred on uLon
      const anomaly = new THREE.Mesh(new THREE.SphereGeometry(E * 1.004, 160, 120), new THREE.ShaderMaterial({
        uniforms: { uLon: { value: 160 }, uAmp: { value: 0 }, uWide: { value: 38 } },
        vertexShader: "varying vec3 vN; void main(){ vN = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `
          uniform float uLon, uAmp, uWide; varying vec3 vN;
          void main(){
            float lat = degrees(asin(vN.y));
            float lon = degrees(atan(-vN.z, vN.x));
            float d = mod(lon - uLon + 540.0, 360.0) - 180.0;
            float a = exp(-pow(d / uWide, 2.0) - pow(lat / 9.0, 2.0)) * uAmp;
            vec3 c = mix(vec3(1.0, 0.55, 0.12), vec3(1.0, 0.18, 0.08), smoothstep(0.3, 0.9, a));
            gl_FragColor = vec4(c * a * 1.2, 1.0);
          }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      earth.add(anomaly);
      // trade winds: arrows along the equator blowing west, which weaken
      const onSphere = (lat, lon, h) => {
        const la = THREE.MathUtils.degToRad(lat), lo = THREE.MathUtils.degToRad(lon);
        return V(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)).multiplyScalar(E * h);
      };
      const arrows = [];
      const arrowMat = new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.9 });
      for (let i = 0; i < 9; i++) for (const lat of [-6, 6]) {
        const lon = 150 + i * 13;
        const a = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.2, 8), arrowMat);
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 12), arrowMat);
        head.position.y = 1.5;
        a.add(shaft, head);
        const p = onSphere(lat, lon, 1.03), q = onSphere(lat, lon + 5, 1.03);
        a.position.copy(p);
        a.quaternion.setFromUnitVectors(V(0, 1, 0), p.clone().sub(q).normalize()); // westward
        earth.add(a);
        arrows.push(a);
      }
      // monsoon clouds over India
      const bank = cloudBank(26, [7, 5, 2], { seed: 8, size: 4.2, opacity: 0.95 });
      const bankHolder = new THREE.Group();
      bankHolder.add(bank);
      earth.add(bankHolder);
      const placeBank = (lon) => {
        const p = onSphere(17, lon, 1.06);
        bankHolder.position.copy(p);
        bankHolder.quaternion.setFromUnitVectors(V(0, 0, 1), p.clone().normalize());
      };
      g.add(earth);
      g.add(new THREE.Mesh(new THREE.SphereGeometry(E * 1.05, 64, 48), new THREE.MeshBasicMaterial({ color: 0x6fb0ff, transparent: true, opacity: 0.13, side: THREE.BackSide })));
      const sun = new THREE.DirectionalLight(0xffffff, 2.8);
      sun.position.set(30, 25, 70);
      g.add(sun, new THREE.AmbientLight(0x223344, 0.5));
      const stars = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), 1400);
      const r = rand(3), M = new THREE.Matrix4();
      for (let i = 0; i < 1400; i++) { const v = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(700 + r() * 300); M.makeScale(0.5 + r(), 0.5 + r(), 0.5 + r()).setPosition(v); stars.setMatrixAt(i, M); }
      g.add(stars);
      const faceLon = (L) => -Math.PI / 2 - THREE.MathUtils.degToRad(L);
      return {
        group: g,
        update(ctx) {
          look(stage, { top: 0x000005, bottom: 0x02040c, fog: 0, sun: 0, hemiI: 0.15, env: 0, exposure: 1, bloom: { strength: 0.6, radius: 0.5, threshold: 0.8 }, near: 1 });
          const tE = ctx.at("తూర్పు"), tI = ctx.at("India"), tD = ctx.at("దూరం"), tR = ctx.at("ఈసారి"), t4 = ctx.at("+4°C"), t97 = ctx.at("1997");
          // where the camera faces: the Pacific, then India, then back to the Pacific for the record
          const L = lerp(lerp(-165, -280, prog(ctx.t, tI - 0.6, tI + 1.0)), -495, prog(ctx.t, tR - 0.6, tR + 1.0));
          earth.rotation.y = faceLon(L) + (ctx.t - ctx.start) * 0.006;
          earth.rotation.x = 0.16;
          cl.rotation.y = (ctx.t - ctx.start) * 0.01;
          // the warm pool slides east (160°E → ~100°W) and grows
          const kE = prog(ctx.t, tE - 0.4, tE + 2.0);
          anomaly.material.uniforms.uLon.value = lerp(160, 255, kE);
          anomaly.material.uniforms.uAmp.value = lerp(0.35, 0.8, kE) + prog(ctx.t, tR, t4 + 0.3) * 0.5 + 0.08 * Math.sin(ctx.t * 4) * prog(ctx.t, t4, t4 + 0.4);
          anomaly.material.uniforms.uWide.value = lerp(28, 40, kE) + prog(ctx.t, tR, t4) * 12;
          const weak = prog(ctx.t, ctx.at("బలహీనపడి") - 0.3, ctx.at("బలహీనపడి") + 1.0);
          arrows.forEach((a, i) => { const s = lerp(1, 0.35, weak) * (0.9 + 0.1 * Math.sin(ctx.t * 3 + i)); a.scale.setScalar(s); });
          arrowMat.opacity = lerp(0.9, 0.35, weak);
          // the monsoon clouds drift away from India and thin out
          const kD = prog(ctx.t, tD - 0.3, tD + 2.2);
          placeBank(lerp(80, 104, kD));
          bank.userData.fade(1 - 0.85 * kD);
          const z = lerp(88, 70, prog(ctx.t, tI - 0.5, tI + 1.5)) + prog(ctx.t, tR - 0.5, tR + 1) * 14 - prog(ctx.t, t4 - 0.5, t97 + 1.5) * 10;
          cam(stage, [0, 6, z], [0, 1, 0]);
          ctx.O.callout("pac", stage.camera, [0, 1.5, 18], "Pacific Ocean", { alpha: prog(ctx.t, ctx.at("Pacific") - 0.2, ctx.at("Pacific") + 0.3) * (1 - prog(ctx.t, tI - 0.8, tI - 0.4)), dx: 80, dy: -260, pill: true });
          ctx.O.callout("ind", stage.camera, bankHolder.getWorldPosition(new THREE.Vector3()).toArray(), "India · monsoon", { alpha: prog(ctx.t, tI - 0.1, tI + 0.4) * (1 - prog(ctx.t, tR - 0.8, tR - 0.4)), dx: -60, dy: -260, pill: true });
          ctx.O.stat("c4", "+4°C", "Pacific · normal కంటే వేడి", { alpha: prog(ctx.t, t4 - 0.2, t4 + 0.3), top: 300, color: "#ff7a3d" });
          ctx.O.chip("r97", "1997 record బద్దలు", { alpha: prog(ctx.t, t97 - 0.2, t97 + 0.3), top: 1480, left: 260, kind: "big warn" });
        },
      };
    },
  },

  // ------------------------------------------------ s4: the monsoon failed: two rain gauges, then 365 mandals go red
  monsoon: {
    sounds: (ctx) => [{ t: ctx.start, s: "heat", gain: 0.45 }, { t: ctx.at("17%") - 0.1, s: "thud", gain: 0.45 }, { t: ctx.at("365") - 0.2, s: "clicks", gain: 0.45 }],
    build(stage) {
      const g = new THREE.Group();
      g.add(mudGround(500, 26));
      const gN = gauge(1.3, 9), g26 = gauge(1.3, 9);
      gN.position.set(-2.1, 0, 0);
      g26.position.set(2.1, 0, 0);
      const ghost = new THREE.Mesh(new THREE.CylinderGeometry(1.27, 1.27, 1, 48), new THREE.MeshBasicMaterial({ color: 0xff4636, transparent: true, opacity: 0.35, depthWrite: false }));
      g26.add(ghost);
      // tick marks on the gauges
      for (const gg of [gN, g26]) for (let i = 1; i < 9; i++) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.04), std(0xffffff, { roughness: 0.4 }));
        t.position.set(0, 0.3 + i, 1.31);
        gg.add(t);
      }
      g.add(gN, g26);
      // 365 mandals: tiles spread over a rough Telangana-shaped blob around the gauges
      const r = rand(12), tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.25, 1), std(0xffffff, { roughness: 0.7 }), 365);
      const M = new THREE.Matrix4(), order = [];
      let n = 0;
      while (n < 365) {
        const x = (r() - 0.5) * 90, z = (r() - 0.5) * 90;
        const shape = Math.hypot(x / 44, z / 36) + 0.12 * Math.sin(Math.atan2(z, x) * 3);
        if (shape > 1 || Math.hypot(x, z) < 7) continue;
        M.makeScale(2.1, 1, 2.1).setPosition(x, 0.12, z);
        tiles.setMatrixAt(n, M);
        order.push(r());
        n++;
      }
      tiles.receiveShadow = tiles.castShadow = true;
      g.add(tiles);
      const C = new THREE.Color(), tan = new THREE.Color(0xc9ae84), red = new THREE.Color(0xe0412f);
      return {
        group: g,
        update(ctx) {
          look(stage, { top: 0x8eb0cc, bottom: 0xeadcc2, fog: 0.004, exposure: 1.0, sun: 3.6, sunCol: 0xfff0d6, sunDir: [30, 70, 20], shadow: 30, hemiI: 0.8 });
          const t17 = ctx.at("17%"), t365 = ctx.at("365");
          gN.userData.set(8.0 * prog(ctx.t, ctx.start + 0.2, ctx.start + 1.6, outE));
          const l26 = 6.64 * prog(ctx.t, ctx.start + 0.8, t17 - 0.1, outE);
          g26.userData.set(l26);
          const gk = prog(ctx.t, t17 - 0.1, t17 + 0.4);
          ghost.visible = gk > 0.01;
          ghost.scale.y = 1.36;
          ghost.position.y = 0.3 + 6.64 + 0.68;
          ghost.material.opacity = 0.35 * gk * (0.75 + 0.25 * Math.sin(ctx.t * 6));
          const kR = prog(ctx.t, t365 - 0.2, t365 + 1.6, lin);
          for (let i = 0; i < 365; i++) tiles.setColorAt(i, C.copy(tan).lerp(red, order[i] < kR ? 1 : 0));
          tiles.instanceColor.needsUpdate = true;
          tiles.visible = ctx.t > t365 - 0.6;
          const up = prog(ctx.t, t365 - 0.8, t365 + 1.6);
          const k = prog(ctx.t, ctx.start, t365, lin);
          cam(stage, mix3(mix3([10, 6, 15], [7, 8.5, 12], k), [55, 70, 62], up), mix3([0, 4.4, 0], [0, 0, 0], up));
          ctx.O.callout("gn", stage.camera, [-2.1, 8.4, 0], "Normal · 740 mm", { alpha: prog(ctx.t, ctx.start + 0.8, ctx.start + 1.4) * (1 - up), dx: -40, dy: -170, pill: true });
          ctx.O.callout("g26", stage.camera, [2.1, 7, 0], "2026 · 615 mm", { alpha: prog(ctx.t, t17 - 0.6, t17) * (1 - up), dx: 40, dy: -260, pill: true });
          ctx.O.stat("p17", "−17%", "Telangana లో తక్కువ వర్షం", { alpha: prog(ctx.t, t17 - 0.2, t17 + 0.3) * (1 - prog(ctx.t, t365 - 0.5, t365 - 0.2)), top: 280, color: "#ff5a45" });
          ctx.O.stat("m365", "365", "drought mandals", { alpha: prog(ctx.t, t365 - 0.2, t365 + 0.3), top: 280, color: "#ff5a45" });
        },
      };
    },
  },

  // ------------------------------------------------ s5: where Hyderabad's water comes from: a map, the pipelines draw on
  sources: {
    sounds: (ctx) => [
      { t: ctx.start, s: "whoosh", gain: 0.4 },
      { t: ctx.at("Nagarjuna") - 0.1, s: "flow", gain: 0.4 },
      ...["Godavari,", "Singur,", "Osman", "Himayat"].map((w) => ({ t: ctx.at(w) - 0.1, s: "sparkle", gain: 0.35 })),
      { t: ctx.at("ఎత్తుకు") - 0.3, s: "pump", gain: 0.45 },
    ],
    build(stage) {
      const g = new THREE.Group();
      // the map: dry Deccan land, rivers, the city
      const nz = noise2(41);
      const RIV = {
        krishna: [[16.25, 77.4], [16.12, 77.95], [16.08, 78.45], [16.08, 78.87], [16.35, 79.1], [16.575, 79.31], [16.7, 79.75], [16.6, 80.3]],
        godavari: [[18.95, 77.6], [18.9, 78.3], [18.85, 78.9], [18.8, 79.42], [18.85, 79.9], [18.55, 80.3]],
        manjira: [[18.05, 77.25], [17.8, 77.7], [17.75, 77.93], [17.95, 78.1], [18.3, 78.0], [18.5, 77.95]],
        musi: [[17.36, 78.15], [17.37, 78.33], [17.37, 78.47], [17.33, 78.7], [17.15, 79.05], [16.95, 79.4]],
      };
      const span = 4.6, mapPx = 1024;
      const toPx = (lat, lon) => [((lon - (MAP.lon - span / 2)) / span) * mapPx, ((MAP.lat + span / 2 - lat) / span) * mapPx];
      const mapTex = drawn(mapPx, mapPx, (c, W, H) => {
        const img = c.createImageData(W, H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const u = x / W, v = y / H, n = nz(u * 9, v * 9, 6), m = 0.8 + 0.4 * n, gr = clamp01((nz(u * 4 + 7, v * 4, 3) - 0.55) * 3);
          const i = (y * W + x) * 4;
          img.data[i] = (196 - 60 * gr) * m; img.data[i + 1] = (172 - 22 * gr) * m; img.data[i + 2] = (128 - 30 * gr) * m; img.data[i + 3] = 255;
        }
        c.putImageData(img, 0, 0);
        c.lineCap = c.lineJoin = "round";
        for (const [k, pl] of Object.entries(RIV)) {
          c.strokeStyle = k === "musi" ? "rgba(70,110,130,0.8)" : "rgba(52,120,170,0.95)";
          c.lineWidth = k === "musi" ? 2.5 : k === "manjira" ? 4 : 7;
          c.beginPath();
          pl.forEach(([la, lo], i) => { const [x, y] = toPx(la, lo); i ? c.lineTo(x, y) : c.moveTo(x, y); });
          c.stroke();
        }
        // the city's grey footprint
        const [cx, cy] = toPx(17.385, 78.487);
        const grd = c.createRadialGradient(cx, cy, 0, cx, cy, 70);
        grd.addColorStop(0, "rgba(120,118,112,0.85)");
        grd.addColorStop(1, "rgba(120,118,112,0)");
        c.fillStyle = grd;
        c.fillRect(cx - 80, cy - 80, 160, 160);
      });
      const land = new THREE.Mesh(new THREE.PlaneGeometry(span * MAP.k, span * MAP.k), new THREE.MeshStandardMaterial({ map: mapTex, roughness: 0.95 }));
      land.rotation.x = -Math.PI / 2;
      land.receiveShadow = true;
      g.add(land);
      const under = groundPlane(3000, { tex: grain(42, [176, 156, 120], { scale: 20, amt: 0.15 }), repeat: 30 });
      under.position.y = -0.05;
      g.add(under);
      const city = cityBlocks(260, { seed: 4, outer: 9, centre: [ll(17.385, 78.487).x, ll(17.385, 78.487).z], minH: 0.4, maxH: 3.2, footprint: [0.35, 0.9] });
      g.add(city);
      // reservoirs as real water on the map
      const SRC = {
        nagarjuna: { at: [16.575, 79.313], r: 5.5, word: "Nagarjuna", name: "Nagarjuna Sagar · Krishna", lift: 6 },
        godavari: { at: [18.8, 79.42], r: 4, word: "Godavari,", name: "Yellampally · Godavari", lift: 5 },
        singur: { at: [17.75, 77.93], r: 3.4, word: "Singur,", name: "Singur · Manjira", lift: 3 },
        osman: { at: [17.38, 78.3], r: 1.6, word: "Osman", name: "Osman Sagar", lift: 1 },
        himayat: { at: [17.33, 78.37], r: 1.4, word: "Himayat", name: "Himayat Sagar", lift: 1 },
      };
      const hyd = ll(17.385, 78.487, 0.6);
      const pipes = {};
      for (const [k, s] of Object.entries(SRC)) {
        const p = ll(...s.at, 0.08);
        const w = new THREE.Mesh(new THREE.CircleGeometry(s.r, 48), waterMat(0x2b84b8, { opacity: 0.95, repeat: 1 }));
        w.rotation.x = -Math.PI / 2;
        w.position.copy(p);
        g.add(w);
        const a = ll(...s.at, 0.5), mid = a.clone().lerp(hyd, 0.5).setY(s.lift);
        const curve = new THREE.CatmullRomCurve3([a, a.clone().lerp(hyd, 0.25).setY(s.lift * 0.6), mid, a.clone().lerp(hyd, 0.8).setY(s.lift * 0.6 + 0.6), hyd]);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, k === "nagarjuna" ? 0.55 : 0.38, 12), std(0x8a949c, { roughness: 0.35, metalness: 0.75 }));
        tube.castShadow = true;
        g.add(tube);
        const fl = flow(curve, 26, 0x86e0ff, k === "nagarjuna" ? 0.42 : 0.3);
        g.add(fl.mesh);
        pipes[k] = { tube, fl, s, p, curve };
      }
      // pumping stations along the Krishna line
      const kc = pipes.nagarjuna.curve;
      const pumps = [0.33, 0.66].map((u) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.4), std(0xd9d4c8, { roughness: 0.7 }));
        const p = kc.getPointAt(u);
        b.position.set(p.x, p.y - 0.2, p.z);
        b.castShadow = true;
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), glowMat(0x7fe0ff, 2));
        lamp.position.set(p.x, p.y + 0.9, p.z);
        g.add(b, lamp);
        return [b, lamp];
      });
      return {
        group: g,
        update(ctx) {
          look(stage, { top: 0x86a9c8, bottom: 0xe7d9c0, fog: 0.0012, exposure: 0.98, sun: 3.2, sunDir: [25, 60, 30], shadow: 140, hemiI: 0.9, ao: true });
          const tN = ctx.at("Nagarjuna"), tG = ctx.at("Godavari,"), tS = ctx.at("Singur,"), tO = ctx.at("Osman"), tH = ctx.at("Himayat"), t110 = ctx.at("110km"), tUp = ctx.at("ఎత్తుకు");
          const times = { nagarjuna: tN, godavari: tG, singur: tS, osman: tO, himayat: tH };
          for (const [k, P] of Object.entries(pipes)) {
            const kk = prog(ctx.t, times[k] - 0.2, times[k] + 1.6, outE);
            const ic = P.tube.geometry.index.count;
            P.tube.geometry.setDrawRange(0, Math.floor((ic * kk) / 6) * 6);
            P.tube.visible = kk > 0.005;
            P.fl.place(ctx.t, 0.1, kk, kk > 0.02 ? 1 : 0);
            ctx.O.callout("src" + k, stage.camera, P.p.toArray(), P.s.name, { alpha: prog(ctx.t, times[k] - 0.1, times[k] + 0.3) * (1 - prog(ctx.t, t110 - 0.6, t110 - 0.2)), dx: k === "singur" || k === "osman" ? -60 : 60, dy: k === "himayat" ? 140 : -160, pill: true });
          }
          pumps.forEach(([b, l], i) => { const on = prog(ctx.t, tUp - 0.2 + i * 0.3, tUp + 0.3 + i * 0.3); b.scale.setScalar(Math.max(0.001, on)); l.visible = on > 0.5; });
          const kS = prog(ctx.t, ctx.start, tN - 0.4), kG = prog(ctx.t, tG - 0.5, tG + 1), kAll = prog(ctx.t, tS - 0.5, tO), kUp = prog(ctx.t, tUp - 1.2, tUp + 0.6);
          const nag = pipes.nagarjuna.p, god = pipes.godavari.p;
          let from = mix3([hyd.x + 10, 70, hyd.z + 60], [nag.x - 6, 55, nag.z + 52], kS), to = mix3([hyd.x, 0, hyd.z], [nag.x * 0.6, 0, nag.z * 0.7], kS);
          from = mix3(from, [god.x - 10, 70, god.z + 70], kG); to = mix3(to, [god.x * 0.6, 0, god.z * 0.6], kG);
          from = mix3(from, [hyd.x + 6, 175, hyd.z + 150], kAll); to = mix3(to, [hyd.x + 6, 0, hyd.z - 4], kAll);
          const pm = kc.getPointAt(0.5);
          from = mix3(from, [pm.x + 34, 16, pm.z + 30], kUp); to = mix3(to, [pm.x - 10, 2, pm.z - 12], kUp);
          cam(stage, from, to);
          ctx.O.stat("half", "50%", "నీళ్లు Krishna నుంచి", { alpha: prog(ctx.t, ctx.at("సగం") - 0.2, ctx.at("సగం") + 0.3) * (1 - prog(ctx.t, tG - 0.5, tG)), top: 280 });
          ctx.O.stat("km", "~110 km", "pipelines · ఎత్తుకు pumping", { alpha: prog(ctx.t, t110 - 0.2, t110 + 0.3), top: 280 });
          ctx.O.callout("hyd", stage.camera, hyd.toArray(), "Hyderabad", { alpha: prog(ctx.t, ctx.start + 0.3, ctx.start + 0.8) * (1 - prog(ctx.t, tN - 0.6, tN - 0.2)), dx: -80, dy: -200, pill: true });
        },
      };
    },
  },

  // ------------------------------------------------ s6: Nagarjuna Sagar: looks full, but most of it sits below the outlet
  dam: {
    sounds: (ctx) => [{ t: ctx.start, s: "flow", gain: 0.3 }, { t: ctx.at("trap") - 0.2, s: "thud", gain: 0.5 }, { t: ctx.at("కిందే") - 0.1, s: "underwater", gain: 0.3 }, { t: ctx.at("pumps") - 0.4, s: "pump", gain: 0.55 }],
    build(stage) {
      const g = new THREE.Group();
      const L = 140, H = 44, crest = 9, toe = 40;
      // masonry gravity dam: vertical upstream face, sloping downstream face, crest road
      const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, H), new THREE.Vector2(crest, H), new THREE.Vector2(toe, 0)]);
      const dg = new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false });
      dg.rotateY(-Math.PI / 2);
      dg.translate(L / 2, 0, 0);
      // UVs for the stone texture, by world position
      const pos = dg.attributes.position, uv = dg.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + pos.getZ(i)) / 12, pos.getY(i) / 12);
      const stone = grain(51, [150, 142, 128], { scale: 26, amt: 0.22, size: 512, speck: 0.03 });
      stone.repeat.set(1, 1);
      const dam = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ map: stone, roughness: 0.9 }));
      dam.castShadow = dam.receiveShadow = true;
      g.add(dam);
      // spillway piers and radial gates on the crest
      const pierMat = std(0xa8a294, { roughness: 0.8 }), gateMat = std(0x56606a, { roughness: 0.5, metalness: 0.6 });
      for (let i = 0; i <= 26; i++) {
        const x = -L / 2 + 8 + i * ((L - 16) / 26);
        const p = new THREE.Mesh(new THREE.BoxGeometry(1.1, 7, crest + 1), pierMat);
        p.position.set(x, H + 3.5, crest / 2);
        p.castShadow = true;
        g.add(p);
        if (i < 26) {
          const gt = new THREE.Mesh(new THREE.BoxGeometry((L - 16) / 26 - 1.1, 5.4, 0.5), gateMat);
          gt.position.set(x + (L - 16) / 52, H + 2.8, 0.6);
          gt.castShadow = true;
          g.add(gt);
        }
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(L - 12, 0.9, 4.5), pierMat);
      bridge.position.set(0, H + 7.2, crest / 2);
      bridge.castShadow = true;
      g.add(bridge);
      // valley sides and river bed
      const rock = grain(52, [168, 150, 122], { scale: 10, amt: 0.25, size: 512 });
      for (const sx of [-1]) {
        const hill = new THREE.Mesh(new THREE.BoxGeometry(260, H + 14, 520), new THREE.MeshStandardMaterial({ map: rock, roughness: 1 }));
        hill.position.set(sx * (L / 2 + 130), (H + 14) / 2 - 6, -120);
        hill.receiveShadow = hill.castShadow = true;
        g.add(hill);
      }
      const bed = mudGround(900, 30, { seed: 6, tint: [150, 132, 104] });
      bed.position.y = -0.02;
      g.add(bed);
      // reservoir, split at the outlet: usable water above, dead storage below. The +x end is cut open.
      const OUT = 16, RES = [-L / 2, L / 2], RZ = [-300, 0];
      const usableMat = waterMat(0x2a95cf, { opacity: 0.9, repeat: 8 }), deadMat = new THREE.MeshStandardMaterial({ color: 0x15384f, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.94 });
      const box = (mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(RES[1] - RES[0], 1, RZ[1] - RZ[0]), mat); m.position.set(0, 0, (RZ[0] + RZ[1]) / 2 - 0.1); return m; };
      const dead = box(deadMat), usable = box(usableMat);
      dead.scale.y = OUT;
      dead.position.y = OUT / 2;
      g.add(dead, usable);
      // the outlet: a dark tunnel mouth on the upstream face, and a marked line
      const mouth = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshBasicMaterial({ color: 0x050607 }));
      mouth.position.set(L / 2 - 14, OUT + 2.2, 0.05);
      mouth.rotation.y = Math.PI;
      const line = new THREE.Mesh(new THREE.BoxGeometry(L + 2, 0.25, 0.25), glowMat(0xffc23d, 2.2));
      line.position.set(0, OUT, 0.4);
      const lineSide = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 300), glowMat(0xffc23d, 2.2));
      lineSide.position.set(L / 2 + 0.2, OUT, -150);
      g.add(mouth, line, lineSide);
      // emergency pumps: floating pontoons with pipes over the crest
      const pumpG = new THREE.Group();
      const pumpFlows = [];
      for (let i = 0; i < 3; i++) {
        const x = L / 2 - 30 - i * 12;
        const pont = new THREE.Mesh(new THREE.BoxGeometry(6, 1.4, 5), std(0xe7a637, { roughness: 0.6 }));
        pont.position.set(x, 0, -14);
        const motor = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.6, 20), std(0x2f5f9c, { roughness: 0.4, metalness: 0.5 }));
        motor.rotation.z = Math.PI / 2;
        motor.position.set(x, 1.8, -14);
        const curve = new THREE.CatmullRomCurve3([V(x, 1.5, -12), V(x, 10, -6), V(x, H + 9, 2), V(x, H + 9, crest + 2), V(x, H - 4, crest + 10)]);
        const pipe = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.45, 10), std(0x3b3f44, { roughness: 0.5, metalness: 0.6 }));
        const fl = flow(curve, 18, 0x9fe6ff, 0.3);
        pumpG.add(pont, motor, pipe, fl.mesh);
        pont.castShadow = motor.castShadow = pipe.castShadow = true;
        pumpFlows.push({ fl, pont, motor });
      }
      g.add(pumpG);
      return {
        group: g,
        update(ctx) {
          look(stage, { top: 0x7ea4c6, bottom: 0xe2d4ba, fog: 0.0016, exposure: 0.98, sun: 3.4, sunDir: [40, 55, 30], shadow: 160, hemiI: 0.85, ao: true });
          const tT = ctx.at("trap"), tO = ctx.at("outlet"), tK = ctx.at("కిందే"), tP = ctx.at("pumps");
          // the level drops toward the outlet as the narration explains the trap
          const level = lerp(31, OUT + 2.2, prog(ctx.t, tK - 0.3, tK + 2.2));
          usable.scale.y = level - OUT;
          usable.position.y = OUT + (level - OUT) / 2;
          const reveal = prog(ctx.t, tO - 0.4, tO + 0.4);
          deadMat.color.set(0x15384f).lerp(new THREE.Color(0x2a95cf), 1 - reveal);
          line.visible = lineSide.visible = reveal > 0.02;
          line.material.color.setRGB(2.2 * reveal, 1.5 * reveal, 0.3 * reveal);
          lineSide.material.color.copy(line.material.color);
          const pk = prog(ctx.t, tP - 0.5, tP + 0.6, outE);
          pumpG.visible = pk > 0.01;
          pumpFlows.forEach(({ fl, pont, motor }, i) => {
            pont.position.y = lerp(-6, level - 0.5, pk);
            motor.position.y = pont.position.y + 1.6;
            fl.place(ctx.t, 0.25, 1, pk > 0.6 ? 1 : 0);
          });
          camKeys(stage, ctx.t, [
            [ctx.start, [170, 95, -190], [0, 18, -50]],
            [tT - 0.6, [130, 70, -150], [0, 22, -40]],
            [tT + 0.8, [L / 2 + 120, 24, -18], [L / 2, 21, -18]],
            [tP - 0.3, [L / 2 + 112, 22, -16], [L / 2, 19, -16]],
            [tP + 1.2, [90, 52, -110], [30, 16, -14]],
            [ctx.end, [84, 50, -104], [30, 16, -14]],
          ]);
          const aSide = prog(ctx.t, tO - 0.3, tO + 0.4) * (1 - prog(ctx.t, tP - 0.4, tP));
          ctx.O.callout("out", stage.camera, [L / 2, OUT, -30], "Outlet level", { alpha: aSide, dx: -60, dy: -330, pill: true });
          ctx.O.callout("dead", stage.camera, [L / 2, OUT / 2, -20], "బయటకు రాని నీళ్లు", { alpha: aSide * prog(ctx.t, tK - 0.2, tK + 0.4), dx: 40, dy: 200, pill: true });
          ctx.O.callout("use", stage.camera, [L / 2, (level + OUT) / 2, -40], "వాడుకునే నీళ్లు", { alpha: aSide * prog(ctx.t, tK + 0.6, tK + 1.2), dx: 40, dy: -330, pill: true });
          ctx.O.chip("pmp", "Emergency pumps", { alpha: prog(ctx.t, tP - 0.2, tP + 0.4), top: 280, left: 64, kind: "big warn" });
          ctx.O.callout("ns", stage.camera, [0, H + 8, crest / 2], "Nagarjuna Sagar", { alpha: prog(ctx.t, ctx.start + 0.3, ctx.start + 0.8) * (1 - prog(ctx.t, tT - 0.5, tT)), dx: 0, dy: -250, pill: true });
        },
      };
    },
  },

  // ------------------------------------------------ s7: Singur at 10%: a boat on cracked mud, a puddle where the lake was
  singur: {
    sounds: (ctx) => [{ t: ctx.start, s: "heat", gain: 0.5 }, { t: ctx.at("10%") - 0.1, s: "thud", gain: 0.4 }, { t: ctx.at("Osman") - 0.1, s: "tick", gain: 0.4 }],
    async build(stage) {
      const g = new THREE.Group();
      const bowl = (x, z) => -6 * Math.exp(-(x * x + z * z) / (2 * 60 * 60)) + 0.6 * Math.sin(x * 0.05) * Math.cos(z * 0.04);
      const ground = mudGround(600, 34, { seg: 160, shape: bowl, seed: 9, tint: [176, 146, 108] });
      g.add(ground);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(7, 64), waterMat(0x55684f, { opacity: 0.95, repeat: 2 }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(-8, bowl(-8, -14) + 0.25, -14);
      pool.scale.set(1.6, 1, 1);
      g.add(pool);
      const boat = await model("/assets/sf-rowboat/model.glb", { length: 4.6 });
      boat.position.set(4, bowl(4, 6) - 0.05, 6);
      boat.rotation.set(0.06, -0.7, 0.12);
      g.add(boat);
      // the old level gauge: a concrete post with marks, 0 at the bed, 100% far above
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 14, 0.5), new THREE.MeshStandardMaterial({ map: grain(55, [200, 196, 186], { scale: 20, amt: 0.15 }), roughness: 0.9 }));
      const px = 12, pz = -4, py = bowl(px, pz);
      post.position.set(px, py + 7 - 0.5, pz);
      post.castShadow = true;
      g.add(post);
      for (let i = 0; i <= 10; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(i % 5 ? 0.35 : 0.6, 0.08, 0.05), std(i <= 1 ? 0x2f8fbf : 0x222222));
        m.position.set(px, py + 0.4 + i * 1.25, pz + 0.27);
        g.add(m);
      }
      const stain = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.25, 0.52), std(0x6f6a5f, { roughness: 1 }));
      stain.position.set(px, py + 0.4 + 0.62, pz);
      g.add(stain);
      // dead stumps
      const r = rand(77);
      for (let i = 0; i < 14; i++) {
        const x = (r() - 0.5) * 120, z = (r() - 0.5) * 120 - 20;
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, 1.4 + r() * 2.5, 6), std(0x4b3d30));
        s.position.set(x, bowl(x, z) + 0.6, z);
        s.rotation.z = (r() - 0.5) * 0.3;
        s.castShadow = true;
        g.add(s);
      }
      return {
        group: g,
        update(ctx) {
          look(stage, { top: 0x9ab6cc, bottom: 0xf0dcb8, fog: 0.006, exposure: 1.02, sun: 3.8, sunCol: 0xfff0d0, sunDir: [-30, 42, 18], shadow: 30, hemiI: 0.8 });
          const t10 = ctx.at("10%"), tO = ctx.at("Osman"), tH = ctx.at("Himayat");
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, mix3([13, 3.2, 19], [-4, 11, 30], k), mix3([3, 0.2, 4], [2, -3, -6], k));
          stage.dof({ focus: stage.camera.position.distanceTo(boat.position), aperture: 0.0008, maxblur: 0.006 });
          ctx.O.stat("s10", "10%", "Singur reservoir లో మిగిలింది", { alpha: prog(ctx.t, t10 - 0.2, t10 + 0.3) * (1 - prog(ctx.t, tO - 0.5, tO - 0.2)), top: 280, color: "#ff5a45" });
          ctx.O.chip("os", "Osman Sagar · 3.5 → 2.2 TMC", { alpha: prog(ctx.t, tO - 0.2, tO + 0.3), top: 300, kind: "big" });
          ctx.O.chip("hs", "Himayat Sagar · 2.5 → 2.1 TMC", { alpha: prog(ctx.t, tH - 0.2, tH + 0.3), top: 390, kind: "big" });
        },
      };
    },
  },

  // ------------------------------------------------ s8: supply once in three days: an apartment, three day-cards
  supply: {
    sounds: (ctx) => [{ t: ctx.start, s: "city", gain: 0.3 }, { t: ctx.at("3") - 0.6, s: "tick", gain: 0.4 }, { t: ctx.at("3") - 0.3, s: "tick", gain: 0.4 }, { t: ctx.at("3"), s: "ding", gain: 0.45 }],
    async build(stage) {
      const g = new THREE.Group();
      const street = groundPlane(400, { tex: grain(61, [96, 94, 92], { scale: 60, amt: 0.15, size: 512, speck: 0.02 }), repeat: 40, rough: 0.9 });
      g.add(street);
      const bld = await model("/assets/sf-building/model.glb", { height: 18 });
      g.add(bld);
      const bs = bld.userData.size;
      const tank = await model("/assets/sf-tank/model.glb", { height: 2.4 });
      tank.position.set(-bs.x * 0.2, 18, 0);
      g.add(tank);
      const city = cityBlocks(90, { seed: 3, inner: 18, outer: 120, minH: 8, maxH: 30, footprint: [8, 16] });
      g.add(city);
      const days = [0, 1, 2].map((i) => {
        const on = i === 2;
        const p = plate([{ text: `రోజు ${i + 1}`, size: 110, dy: -20 }, { text: on ? "💧" : "✕", size: 170, color: on ? "#1f87d6" : "#c9302c" }], { w: 3.1, h: 3.9, bg: on ? "#eaf6ff" : "#f5f1ea" });
        p.position.set(-3.7 + i * 3.7, 0, 0);
        return p;
      });
      const dayG = new THREE.Group();
      days.forEach((d) => dayG.add(d));
      dayG.position.set(0, 9, bs.z / 2 + 8);
      g.add(dayG);
      return {
        group: g,
        update(ctx) {
          look(stage, { top: 0x87aacb, bottom: 0xe8dcc6, fog: 0.004, exposure: 0.98, sun: 3.3, sunDir: [30, 50, 40], shadow: 40, hemiI: 0.85, ao: true });
          const t3 = ctx.at("3");
          days.forEach((d, i) => {
            const a = prog(ctx.t, t3 - 0.9 + i * 0.3, t3 - 0.6 + i * 0.3, outE);
            d.scale.setScalar(Math.max(0.001, a));
            d.position.y = (1 - a) * -2;
          });
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, mix3([20, 7, bs.z / 2 + 44], [10, 12, bs.z / 2 + 40], k), mix3([0, 9, 0], [0, 9, bs.z / 2 + 6], k));
          ctx.O.stat("s3", "3 రోజులకు 1 సారి", "చాలా areas లో నీళ్లు", { alpha: prog(ctx.t, t3 - 0.1, t3 + 0.4), top: 280 });
        },
      };
    },
  },

  // ------------------------------------------------ s9: tankers: a queue down the road, the count climbs to 8,000
  tankers: {
    sounds: (ctx) => [{ t: ctx.start, s: "trucks", gain: 0.6 }, { t: ctx.at("8,000") - 0.1, s: "thud", gain: 0.45 }, { t: ctx.at("1,500") - 0.1, s: "tick", gain: 0.35 }],
    async build(stage) {
      const g = new THREE.Group();
      const dust = groundPlane(800, { tex: grain(71, [184, 166, 136], { scale: 30, amt: 0.15 }), repeat: 40 });
      g.add(dust);
      const road = new THREE.Mesh(new THREE.PlaneGeometry(16, 800), new THREE.MeshStandardMaterial({ map: drawn(256, 1024, (c, W, H) => {
        const nz = noise2(72), img = c.createImageData(W, H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const m = 70 + 26 * nz(x / 30, y / 30, 4), i = (y * W + x) * 4; img.data[i] = m; img.data[i + 1] = m; img.data[i + 2] = m + 3; img.data[i + 3] = 255; }
        c.putImageData(img, 0, 0);
        c.fillStyle = "#e9e3cf";
        for (let y = 0; y < H; y += 64) c.fillRect(W / 2 - 3, y, 6, 34);
        c.fillRect(8, 0, 5, H); c.fillRect(W - 13, 0, 5, H);
      }), roughness: 0.92 }));
      road.material.map.wrapT = THREE.RepeatWrapping;
      road.material.map.repeat.set(1, 12);
      road.rotation.x = -Math.PI / 2;
      road.position.y = 0.02;
      road.receiveShadow = true;
      g.add(road);
      g.add(cityBlocks(160, { seed: 7, inner: 14, outer: 160, minH: 5, maxH: 18, footprint: [7, 13], avoid: (x) => Math.abs(x) < 14 }));
      const base = await model("/assets/sf-kraz/model.glb", { length: 9.5, hide: /sticker|flags/, retex: [/^Material\.016$/, "/assets/sf-kraz/tank-plain.png"] });
      const trucks = [];
      for (let i = 0; i < 24; i++) {
        const t = base.clone(true);
        const lane = i % 2;
        t.userData.lane = lane;
        t.userData.z = -i * 6.4 - lane * 3;
        t.rotation.y = lane ? Math.PI : 0;
        g.add(t);
        trucks.push(t);
      }
      return {
        group: g,
        update(ctx) {
          look(stage, { top: 0x93b0c9, bottom: 0xecd9b8, fog: 0.006, exposure: 1.0, sun: 3.6, sunCol: 0xffe8c4, sunDir: [-35, 45, 20], shadow: 60, hemiI: 0.8, ao: true });
          const lt = ctx.t - ctx.start;
          trucks.forEach((t, i) => {
            const lane = t.userData.lane, crawl = lane ? -1.2 : 1.6;
            t.position.set(lane ? -3.6 : 3.6, 0, t.userData.z + lt * crawl + Math.sin(lt * 0.8 + i) * 0.3);
          });
          const t8 = ctx.at("8,000"), t15 = ctx.at("1,500");
          const up = prog(ctx.t, t8 - 1.0, t8 + 1.2);
          cam(stage, mix3([11, 2.2, 14 + lt * 1.6], [26, 46, 40], up), mix3([2, 2.4, -2 + lt * 1.6], [0, 0, -60], up));
          const n = 8000 * prog(ctx.t, t8 - 1.0, t8 + 0.2, outE);
          ctx.O.stat("tk", fmt(n), "tanker bookings / రోజుకు", { alpha: prog(ctx.t, t8 - 1.0, t8 - 0.6), top: 280, color: "#ffb02e" });
          ctx.O.chip("nm", "మామూలుగా: 1,500 లోపే", { alpha: prog(ctx.t, t15 - 0.2, t15 + 0.3), top: 460, left: 64, kind: "big" });
        },
      };
    },
  },

  // ------------------------------------------------ s10: borewells: a soil section, the water table sinks past a 1,000 ft bore
  borewell: {
    sounds: (ctx) => [{ t: ctx.start, s: "underwater", gain: 0.25 }, { t: ctx.at("1,000") - 0.6, s: "drill", gain: 0.55 }, { t: ctx.at("14,000") - 0.1, s: "thud", gain: 0.5 }],
    build(stage) {
      const g = new THREE.Group();
      const W = 40, D = 14;
      // layers top → bottom: [thickness, colour, grain]
      const LAY = [[2, [120, 88, 60], 0.2], [7, [168, 92, 58], 0.2], [14, [176, 150, 116], 0.25], [44, [128, 126, 124], 0.28]];
      let y = 0;
      LAY.forEach(([h, col, amt], i) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(W, h, D), new THREE.MeshStandardMaterial({ map: grain(80 + i, col, { scale: 14, amt, size: 512, speck: i === 3 ? 0.05 : 0.01 }), roughness: 0.95 }));
        m.position.set(0, y - h / 2, 0);
        m.receiveShadow = m.castShadow = true;
        g.add(m);
        y -= h;
      });
      const bottom = y; // -67
      const top = mudGround(300, 20, { seed: 4 });
      top.position.y = 0.01;
      // the section is open toward +z: no ground in front of it
      top.geometry.translate(0, 0, -150 + D / 2);
      g.add(top);
      // a house and a rooftop tank on the surface
      const house = new THREE.Mesh(new THREE.BoxGeometry(7, 6, 6), std(0xeee2cc));
      house.position.set(-9, 3, -2);
      house.castShadow = true;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.4, 6.4), std(0xd6c7ae));
      roof.position.set(-9, 6.2, -2);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 24), std(0x1f2124, { roughness: 0.5 }));
      tank.position.set(-10, 7.2, -2);
      g.add(house, roof, tank);
      // the water table: a blue band in the cut face that sinks
      const aq = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 1, D + 0.1), new THREE.MeshPhysicalMaterial({ color: 0x2a8fd0, roughness: 0.2, transparent: true, opacity: 0.55, clearcoat: 1, depthWrite: false }));
      g.add(aq);
      // the bore: steel casing drilled down, the bit, depth marks
      const BX = 3, BZ = D / 2, depth = 58;
      const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 16), std(0x9aa3aa, { roughness: 0.35, metalness: 0.8 }));
      g.add(casing);
      const bit = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 16), std(0x444444, { metalness: 0.8, roughness: 0.3 }));
      bit.rotation.x = Math.PI;
      g.add(bit);
      const rig = new THREE.Group();
      const legM = std(0xd94f2b, { roughness: 0.5, metalness: 0.4 });
      for (const [a, b] of [[-1.2, -1.2], [1.2, -1.2], [0, 1.4]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 8), legM);
        leg.position.set(BX + a * 0.5, 4.4, BZ + b * 0.5);
        leg.lookAt(BX, 9, BZ);
        leg.rotateX(Math.PI / 2);
        leg.castShadow = true;
        rig.add(leg);
      }
      g.add(rig);
      const marks = [100, 500, 1000].map((ft) => {
        const yy = -(ft / 1000) * depth;
        const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.12), glowMat(0xffffff, 1.2));
        m.position.set(BX - 2.2, yy, D / 2 + 0.1);
        g.add(m);
        return { m, yy, ft };
      });
      return {
        group: g,
        update(ctx) {
          look(stage, { top: 0x8fb0cc, bottom: 0xe2d4bc, fog: 0.004, exposure: 1.0, sun: 3.2, sunDir: [20, 50, 40], shadow: 60, hemiI: 0.95, ao: true });
          const tL = ctx.at("లోతుకు"), t1k = ctx.at("1,000"), tR = ctx.at("రావట్లేదు."), t14 = ctx.at("14,000");
          const wt = lerp(-12, -63, prog(ctx.t, tL - 0.8, tR + 0.6));
          aq.scale.y = 5;
          aq.position.y = wt - 2.5;
          const dk = prog(ctx.t, t1k - 1.0, t1k + 1.2, lin);
          const by = -depth * dk;
          casing.scale.y = Math.max(0.01, -by + 2);
          casing.position.set(BX, (by + 2) / 2, BZ);
          bit.position.set(BX, by - 0.4, BZ);
          bit.rotation.y = ctx.t * 20;
          const pan = prog(ctx.t, tL - 1.2, t1k + 0.6), out = prog(ctx.t, t14 - 1.0, t14 + 0.6);
          const yLook = lerp(lerp(0, -30, pan), -26, out);
          cam(stage, mix3([14 - pan * 4, 4 + yLook * 0.6, 92], [10, 12, 125], out), [2, lerp(-12, -32, pan) * (1 - out) + -26 * out, 0]);
          marks.forEach(({ m, yy, ft }) => {
            const a = clamp01((-by - -yy + 1) / 2) * (1 - out);
            m.visible = a > 0.05;
            ctx.O.callout("ft" + ft, stage.camera, [BX - 3.4, yy, D / 2], ft.toLocaleString("en-IN") + " ft", { alpha: a, dx: -70, dy: 0, pill: true });
          });
          ctx.O.callout("wt", stage.camera, [W / 2 - 4, wt, D / 2], "నీళ్లు ఇక్కడ", { alpha: prog(ctx.t, tL - 0.4, tL + 0.2) * (1 - out), dx: 40, dy: -120, pill: true });
          ctx.O.stat("b14", "14,000+", "borewells ఎండిపోయాయి", { alpha: prog(ctx.t, t14 - 0.2, t14 + 0.3), top: 280, color: "#ff5a45" });
        },
      };
    },
  },

  // ------------------------------------------------ s11: the daily gap: two glass tanks, 735 needed vs 585 arriving
  gap: {
    sounds: (ctx) => [{ t: ctx.at("735") - 0.3, s: "flow", gain: 0.45 }, { t: ctx.at("585") - 0.3, s: "flow", gain: 0.4 }, { t: ctx.at("150") - 0.1, s: "thud", gain: 0.55 }],
    build(stage) {
      const g = new THREE.Group();
      const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: 0x14181e, roughness: 0.2, metalness: 0.5 }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      g.add(floor);
      const need = gauge(3, 15, { color: 0x2f8fbf }), have = gauge(3, 15, { color: 0x2f8fbf });
      need.position.set(-4.2, 0, 0);
      have.position.set(4.2, 0, 0);
      g.add(need, have);
      const ghost = new THREE.Mesh(new THREE.CylinderGeometry(2.92, 2.92, 1, 48), new THREE.MeshBasicMaterial({ color: 0xff4636, transparent: true, opacity: 0.4, depthWrite: false }));
      have.add(ghost);
      const key = new THREE.SpotLight(0xfff2dc, 3200, 140, 0.55, 0.6, 1.5);
      key.position.set(12, 36, 24);
      key.target.position.set(0, 6, 0);
      key.castShadow = true;
      const rim = new THREE.PointLight(0x6ab8ff, 260, 80, 1.5);
      rim.position.set(-16, 14, -12);
      g.add(key, key.target, rim);
      const U = 14 / 800; // world units per MGD
      return {
        group: g,
        update(ctx) {
          look(stage, { top: 0x06080c, bottom: 0x0c1118, fog: 0.008, exposure: 1.0, sun: 0, hemiI: 0.25, env: 0.7, bloom: { strength: 0.5, radius: 0.5, threshold: 0.85 } });
          const tN = ctx.at("735"), tH = ctx.at("585"), tG = ctx.at("150");
          need.userData.set(735 * U * prog(ctx.t, tN - 0.6, tN + 1.0, outE));
          have.userData.set(585 * U * prog(ctx.t, tH - 0.6, tH + 1.0, outE));
          const gk = prog(ctx.t, tG - 0.2, tG + 0.4);
          ghost.visible = gk > 0.01;
          ghost.scale.y = 150 * U;
          ghost.position.y = 0.3 + 585 * U + (150 * U) / 2;
          ghost.material.opacity = gk * (0.3 + 0.15 * Math.sin(ctx.t * 6));
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, [Math.sin(0.35 - k * 0.5) * 46, 9 + k * 3, Math.cos(0.35 - k * 0.5) * 46], [0, 8.5, 0]);
          ctx.O.callout("cn", stage.camera, [-4.2, 735 * U + 0.4, 0], "కావాలి · 735", { alpha: prog(ctx.t, tN - 0.2, tN + 0.3), dx: -40, dy: -90, pill: true });
          ctx.O.callout("ch", stage.camera, [4.2, 585 * U + 0.4, 0], "వస్తున్నది · 585", { alpha: prog(ctx.t, tH - 0.2, tH + 0.3), dx: 40, dy: -160, pill: true });
          ctx.O.stat("gp", "−150", "million gallons / రోజూ తక్కువ", { alpha: prog(ctx.t, tG - 0.2, tG + 0.3), top: 1420, color: "#ff5a45" });
        },
      };
    },
  },

  // ------------------------------------------------ s12-s14: the months ahead: a row of gauges drains into summer 2027, then maybe rain
  future: {
    sounds: (ctx) => [
      { t: ctx.start, s: "riser", gain: 0.25 },
      ...[0, 1].map((i) => ({ t: ctx.at("December") - 0.2 + i * 0.4, s: "tick", gain: 0.35 })),
      { t: ctx.at("చివరికి") - 0.1, s: "thud", gain: 0.4 },
      { t: ctx.at("2027") - 0.2, s: "heat", gain: 0.6 },
      { t: ctx.at("8–10") - 0.1, s: "thud", gain: 0.5 },
      { t: ctx.at("monsoon") - 0.6, s: "thunder", gain: 0.5 },
      { t: ctx.at("monsoon") - 0.2, s: "rain", gain: 0.5 },
    ],
    build(stage) {
      const g = new THREE.Group();
      g.add(mudGround(600, 30, { seed: 5 }));
      const MON = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];
      // illustrative storage path for a city reservoir through the dry months (no forecast is implied by the exact heights)
      const LV = [0.34, 0.26, 0.21, 0.17, 0.13, 0.09, 0.06, 0.05, 0.05, 0.05];
      const H = 8, gap = 5.2;
      const cols = MON.map((m, i) => {
        const gg = gauge(1.5, H);
        gg.position.set((i - 4.5) * gap, 0, 0);
        const card = plate([{ text: m, size: 120, dy: -18 }, { text: i < 2 ? "2026" : "2027", size: 70, weight: 600, color: "#6b6f76" }], { w: 3.4, h: 2.2, bg: "#fbf8f2" });
        card.position.set(0, H + 2.4, 0);
        gg.add(card);
        g.add(gg);
        return { gg, card };
      });
      const sunBall = new THREE.Mesh(new THREE.SphereGeometry(6, 32, 24), glowMat(0xffc46b, 2.2));
      sunBall.position.set(20, 52, -90);
      g.add(sunBall);
      const clouds = cloudBank(40, [60, 6, 20], { seed: 3, size: 16, color: 0x5d6670, opacity: 0.95 });
      clouds.position.set(18, 26, -6);
      g.add(clouds);
      const rn = rain(1600, [0, 40], [0, 26], [-8, 8]);
      g.add(rn.mesh);
      return {
        group: g,
        update(ctx) {
          const tD = ctx.at("December"), tC = ctx.at("చివరికి"), t27 = ctx.at("2027"), tE = ctx.at("ఎండ"), tJ = ctx.at("July,"), t810 = ctx.at("8–10"), tM = ctx.at("monsoon"), tGu = ctx.at("guarantee");
          const heat = prog(ctx.t, t27 - 0.5, tE + 1.0) * (1 - prog(ctx.t, tM - 1.0, tM + 0.5));
          const wet = prog(ctx.t, tM - 0.8, tM + 0.6) * (1 - 0.6 * prog(ctx.t, tGu - 0.2, tGu + 0.8));
          look(stage, {
            top: new THREE.Color(0x86a8c8).lerp(new THREE.Color(0xd9b27a), heat).lerp(new THREE.Color(0x4b5560), wet).getHex(),
            bottom: new THREE.Color(0xe6d8c0).lerp(new THREE.Color(0xf6c78a), heat).lerp(new THREE.Color(0x8c949a), wet).getHex(),
            fog: 0.006, exposure: 1.0 + heat * 0.12 - wet * 0.15, sun: 3.4 + heat * 1.5 - wet * 2.4, sunCol: new THREE.Color(0xfff0d8).lerp(new THREE.Color(0xffc27a), heat).getHex(), sunDir: [20, 45, 30], shadow: 40, hemiI: 0.85,
            bloom: heat > 0.05 ? { strength: 0.5 * heat, radius: 0.6, threshold: 0.8 } : null,
          });
          // months advance with the narration; each gauge drains as its month arrives
          const reach = ctx.t < t27 ? lerp(0, 1.99, prog(ctx.t, ctx.start + 0.4, tC + 0.6, lin)) : ctx.t < tJ ? lerp(1.99, 7.99, prog(ctx.t, t27 - 0.3, tE + 2.0, lin)) : lerp(7.99, 9.99, prog(ctx.t, tJ - 0.3, tJ + 1.2, lin));
          cols.forEach(({ gg, card }, i) => {
            const on = clamp01(reach - i + 1);
            let lv = LV[i];
            if (i >= 7) lv += 0.25 * wet * (i - 6) / 3; // the monsoon could refill the last months
            gg.userData.set(H * lv * on);
            gg.visible = on > 0.01;
            gg.scale.setScalar(Math.max(0.001, outE(on)));
            const hot = i >= 4 && i <= 7 ? heat : 0;
            card.material.color.setRGB(1, 1 - 0.35 * hot, 1 - 0.55 * hot);
          });
          sunBall.visible = heat > 0.02;
          sunBall.scale.setScalar(0.5 + heat);
          clouds.visible = wet > 0.01;
          clouds.userData.fade(wet);
          rn.place(ctx.t, wet);
          const fx = (i) => (i - 4.5) * gap;
          const all = prog(ctx.t, t810 - 0.6, t810 + 0.6) * (1 - prog(ctx.t, tM - 1.2, tM));
          const focusX = lerp(fx(Math.min(9, Math.max(0, reach - 0.6))), 0, all);
          const dist = lerp(26, 62, all) + wet * 10;
          cam(stage, [focusX + 6, 9 + all * 8 + wet * 4, dist], [focusX, 5, 0]);
          ctx.O.chip("dec", "December చివరికి: కొన్ని reservoirs ఖాళీ?", { alpha: prog(ctx.t, tC - 0.2, tC + 0.3) * (1 - prog(ctx.t, t27 - 0.6, t27 - 0.2)), top: 280, kind: "big warn" });
          ctx.O.stat("sm", "2027 summer", "అసలు danger", { alpha: prog(ctx.t, t27 - 0.2, t27 + 0.3) * (1 - prog(ctx.t, t810 - 0.6, t810 - 0.2)), top: 260, color: "#ff8a3d" });
          ctx.O.stat("mo", "8–10 నెలలు", "నీళ్ల కష్టం · కరెంటు కష్టం", { alpha: prog(ctx.t, t810 - 0.2, t810 + 0.3) * (1 - prog(ctx.t, tM - 1.0, tM - 0.6)), top: 260, color: "#ff5a45" });
          ctx.O.chip("gu", "Next monsoon మీదే ఆశ · guarantee లేదు", { alpha: prog(ctx.t, tGu - 0.2, tGu + 0.3), top: 280, kind: "big" });
        },
      };
    },
  },

  // ------------------------------------------------ s15: it's not only El Niño: a lake built over, a leaking main, the tanker mafia
  lakes: {
    sounds: (ctx) => [{ t: ctx.start, s: "digger", gain: 0.5 }, { t: ctx.at("leaks") - 0.3, s: "flow", gain: 0.5 }],
    async build(stage) {
      const g = new THREE.Group();
      g.add(groundPlane(600, { tex: grain(91, [150, 146, 110], { scale: 24, amt: 0.2, size: 512 }), repeat: 30 }));
      const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 96), waterMat(0x3f8ea0, { opacity: 0.95, repeat: 6 }));
      lake.rotation.x = -Math.PI / 2;
      lake.position.y = 0.05;
      g.add(lake);
      const shore = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 96), std(0x8d7a5c));
      shore.rotation.x = -Math.PI / 2;
      shore.position.y = 0.04;
      g.add(shore);
      // encroaching buildings: rings of blocks that rise from the old shoreline inward
      const blocks = cityBlocks(140, { seed: 21, inner: 24, outer: 46, minH: 4, maxH: 14, footprint: [4, 7] });
      g.add(blocks);
      const exc = await model("/assets/sf-excavator/model.glb", { length: 10 });
      g.add(exc);
      // the leaking main: a steel pipe with a jet of water out of a crack
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 60, 24), std(0x6f7880, { roughness: 0.4, metalness: 0.7 }));
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(0, 1, 70);
      pipe.castShadow = true;
      g.add(pipe);
      const N = 700, jet = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 6, 4), new THREE.MeshPhysicalMaterial({ color: 0xcfeeff, roughness: 0.05, transparent: true, opacity: 0.75, clearcoat: 1 }), N);
      jet.frustumCulled = false;
      g.add(jet);
      const pud = new THREE.Mesh(new THREE.CircleGeometry(6, 48), waterMat(0x6b8a92, { opacity: 0.85, repeat: 2 }));
      pud.rotation.x = -Math.PI / 2;
      pud.position.set(4, 0.04, 74);
      g.add(pud);
      const M = new THREE.Matrix4(), r = rand(31), seeds = Array.from({ length: N }, () => [r(), r(), r()]);
      return {
        group: g,
        update(ctx) {
          look(stage, { top: 0x8aaecb, bottom: 0xe6dac4, fog: 0.004, exposure: 1.0, sun: 3.3, sunDir: [30, 55, 25], shadow: 60, hemiI: 0.85 });
          const tC = ctx.at("చెరువులు"), tL = ctx.at("leaks");
          const enc = prog(ctx.t, tC - 0.8, tC + 2.4, lin);
          const R = lerp(42, 20, enc);
          lake.scale.set(R, R, 1);
          shore.scale.set(R, R, 1);
          const list = blocks.userData.list, Mt = new THREE.Matrix4(), S = new THREE.Vector3(), P = new THREE.Vector3();
          list.forEach((b) => {
            const d = Math.hypot(b.x, b.z), on = d > R + 2 ? clamp01((enc * 46 - (46 - d)) / 6) : 0;
            S.set(b.w, Math.max(0.001, b.h * outE(on)), b.d);
            P.set(b.x, 0, b.z);
            blocks.setMatrixAt(b.i, Mt.compose(P, b.q, S));
          });
          blocks.instanceMatrix.needsUpdate = true;
          exc.position.set(R + 3, 0, 4);
          exc.rotation.y = -Math.PI / 2 + Math.sin(ctx.t * 0.6) * 0.15;
          const jk = prog(ctx.t, tL - 0.4, tL + 0.2);
          for (let i = 0; i < N; i++) {
            const [a, b, c] = seeds[i], life = (ctx.t * 1.1 + a) % 1;
            const vx = 3 + b * 4, vy = 9 + c * 4, vz = (b - 0.5) * 3;
            M.makeScale(jk, jk, jk).setPosition(2 + vx * life, 2 + vy * life - 9.8 * life * life * 1.2, 70 + vz * life);
            jet.setMatrixAt(i, M);
          }
          jet.instanceMatrix.needsUpdate = true;
          jet.visible = jk > 0.01;
          pud.scale.setScalar(Math.max(0.01, jk));
          camKeys(stage, ctx.t, [
            [ctx.start, [95, 120, 95], [0, 0, 0]],
            [tL - 0.8, [70, 80, 64], [0, 0, 0]],
            [tL + 0.4, [16, 8, 88], [3, 3, 70]],
            [ctx.end, [12, 7, 87], [2, 3, 70]],
          ]);
          ctx.O.chip("ck", "చెరువులు కబ్జా", { alpha: prog(ctx.t, tC - 0.2, tC + 0.3) * (1 - prog(ctx.t, tL - 0.8, tL - 0.4)), top: 280, kind: "big warn" });
          ctx.O.chip("lk", "Pipeline leaks · నీళ్లు వృథా", { alpha: prog(ctx.t, tL - 0.2, tL + 0.3), top: 280, kind: "big warn" });
        },
      };
    },
  },

  // ------------------------------------------------ s15b: the water mafia: a man laughing over his cash beside a tanker with a fake board
  mafia: {
    sounds: (ctx) => [
      { t: ctx.start, s: "trucks", gain: 0.25 },
      { t: ctx.at("business") - 0.2, s: "cash", gain: 0.6 },
      { t: ctx.at("borewells") - 0.2, s: "pump", gain: 0.35 },
      { t: ctx.at("fake") - 0.1, s: "thud", gain: 0.5 },
      { t: ctx.at("అమ్ముతున్నారు.") - 0.1, s: "coins", gain: 0.45 },
      { t: ctx.at("దాహం,") - 0.4, s: "laugh", gain: 0.7 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const yard = groundPlane(300, { tex: grain(121, [92, 86, 78], { scale: 50, amt: 0.2, size: 512, speck: 0.03 }), repeat: 30, rough: 0.85 });
      g.add(yard);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(60, 9, 0.6), new THREE.MeshStandardMaterial({ map: grain(122, [150, 136, 118], { scale: 16, amt: 0.22, size: 512 }), roughness: 0.95 }));
      wall.position.set(0, 4.5, -9);
      wall.receiveShadow = true;
      g.add(wall);
      // the tanker, with a fake board on its tank
      const tk = await model("/assets/sf-kraz/model.glb", { length: 9.5, hide: /sticker|flags/, retex: [/^Material\.016$/, "/assets/sf-kraz/tank-plain.png"] });
      tk.position.set(1.5, 0, -4.2);
      tk.rotation.y = Math.PI / 2;
      g.add(tk);
      const board = plate([{ text: "WATER BOARD", size: 92, color: "#ffffff" }], { w: 3.6, h: 0.9, bg: "#1f5fa8", radius: 0.06 });
      board.position.set(0.6, 2.75, -3.0);
      g.add(board);
      const stamp = plate([{ text: "FAKE", size: 150, color: "#ffffff" }], { w: 2.4, h: 1.0, bg: "#d6322a", radius: 0.08 });
      stamp.position.set(0.6, 2.75, -2.9);
      stamp.rotation.z = 0.18;
      g.add(stamp);
      // an illegal borewell with a hose into the tank
      const bw = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.2, 16), std(0x8c949b, { metalness: 0.8, roughness: 0.35 }));
      bw.position.set(6.6, 0.6, -6.5);
      const hoseC = new THREE.CatmullRomCurve3([V(6.6, 1.2, -6.5), V(6.2, 2.2, -6), V(5, 3.3, -5), V(4, 3.5, -4.6)]);
      const hose = new THREE.Mesh(new THREE.TubeGeometry(hoseC, 40, 0.09, 8), std(0x1d2a22, { roughness: 0.6 }));
      const hf = flow(hoseC, 12, 0x9fe6ff, 0.08);
      g.add(bw, hose, hf.mesh);
      // the man: a rigged avatar posed by hand
      const gl = await loader.loadAsync("/assets/sf-kurta/model.glb");
      const man = gl.scene;
      man.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      const box0 = new THREE.Box3().setFromObject(man);
      const mh = box0.getSize(new THREE.Vector3()).y;
      const holder = new THREE.Group();
      holder.add(man);
      man.scale.setScalar(1.75 / mh);
      man.position.y = -box0.min.y * (1.75 / mh);
      holder.position.set(-1.0, 0, 0.4);
      holder.rotation.y = 0.35;
      g.add(holder);
      const B = (n) => man.getObjectByName(n);
      const bones = { spine: B("Spine2_04"), neck: B("Neck_05"), head: B("Head_08"), rArm: B("RightArm_039"), rFore: B("RightForeArm_040"), rHand: B("RightHand_043"), lArm: B("LeftArm_013"), lFore: B("LeftForeArm_014"), lHand: B("LeftHand_017"), rSh: B("RightShoulder_038"), lSh: B("LeftShoulder_012") };
      const rest = {};
      for (const [k, b] of Object.entries(bones)) rest[k] = b ? b.quaternion.clone() : null;
      // rupee notes: drawn as illustrative ₹500 notes (not a replica)
      const noteTex = drawn(512, 236, (c, W, H) => {
        const grd = c.createLinearGradient(0, 0, W, H);
        grd.addColorStop(0, "#c9cfc0"); grd.addColorStop(1, "#a9b3a0");
        c.fillStyle = grd; c.fillRect(0, 0, W, H);
        c.strokeStyle = "rgba(60,70,55,0.5)"; c.lineWidth = 6; c.strokeRect(10, 10, W - 20, H - 20);
        c.fillStyle = "rgba(70,80,60,0.25)"; c.beginPath(); c.arc(W * 0.66, H / 2, 70, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#3f4a3a"; c.font = '800 96px "Inter Tight"'; c.textBaseline = "middle"; c.fillText("₹500", 34, H / 2);
        c.font = '800 34px "Inter Tight"'; c.fillText("500", W - 100, 46); c.fillText("500", W - 100, H - 40);
      });
      const noteMat = new THREE.MeshStandardMaterial({ map: noteTex, roughness: 0.8, side: THREE.DoubleSide });
      const noteGeo = new THREE.PlaneGeometry(0.21, 0.097);
      const fan = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const n = new THREE.Mesh(noteGeo, noteMat);
        n.geometry = noteGeo;
        n.position.set(0.0, 0.06, 0);
        const piv = new THREE.Group();
        piv.rotation.z = -0.55 + i * 0.18;
        n.position.y = 0.05;
        piv.add(n);
        fan.add(piv);
      }
      fan.scale.setScalar(mh / 1.75 > 0 ? 1 : 1);
      g.add(fan);
      // notes raining down around him
      const NR = 160, rainNotes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.074), noteMat, NR);
      rainNotes.frustumCulled = false;
      g.add(rainNotes);
      const r = rand(57), seeds = Array.from({ length: NR }, () => [r(), r(), r(), r()]);
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
      // night lighting: a warm lamp from the side, a cool rim from behind
      const lamp = new THREE.SpotLight(0xffc27a, 70, 40, 0.6, 0.6, 1.4);
      lamp.position.set(-6, 7, 6);
      lamp.target.position.set(-1, 1.2, 0);
      lamp.castShadow = true;
      lamp.shadow.mapSize.set(2048, 2048);
      const rim = new THREE.PointLight(0x5f9dff, 60, 20, 1.6);
      rim.position.set(2, 3.5, -2.5);
      g.add(lamp, lamp.target, rim);
      const tmpQ = new THREE.Quaternion(), ax = (x, y, z, a) => tmpQ.setFromAxisAngle(V(x, y, z).normalize(), a);
      const pose = (b, k, q) => { if (bones[k]) bones[k].quaternion.copy(rest[k]).multiply(q); };
      return {
        group: g,
        update(ctx) {
          look(stage, { top: 0x05070c, bottom: 0x161b24, fog: 0.03, fogCol: 0x0b0e14, exposure: 0.9, sun: 0.2, sunCol: 0x8fb0ff, sunDir: [10, 20, 15], shadow: 12, hemiI: 0.22, hemiSky: 0x7f95b8, hemiGround: 0x2a2620, env: 0.25, bloom: { strength: 0.3, radius: 0.4, threshold: 0.97 } });
          const tB = ctx.at("business"), tF = ctx.at("fake"), tD = ctx.at("దాహం,"), tL = ctx.at("లాభం.");
          const laugh = prog(ctx.t, tD - 0.6, tD) , lt = ctx.t - ctx.start;
          const shake = laugh * Math.sin(lt * 26) * 0.06 + laugh * Math.sin(lt * 13) * 0.03;
          // right arm up with the cash, left hand on the belly, head thrown back when he laughs
          const up = prog(ctx.t, ctx.start + 0.2, tB + 0.2, outE);
          pose(null, "rArm", ax(0, 0, 1, -lerp(0, 1.15, up)).multiply(ax(1, 0, 0, lerp(0, -0.5, up))));
          pose(null, "rFore", ax(0, 0, 1, -lerp(0, 1.25, up)));
          pose(null, "lArm", ax(1, 0, 0, 1.2));
          pose(null, "lFore", ax(1, 0, 0, 0.35));
          pose(null, "spine", ax(1, 0, 0, -0.12 * laugh + shake * 0.6));
          pose(null, "neck", ax(1, 0, 0, -0.4 * laugh));
          pose(null, "head", ax(1, 0, 0, -0.5 * laugh + shake * 2).multiply(ax(0, 1, 0, 0.15 * Math.sin(lt * 2))));
          man.updateMatrixWorld(true);
          if (bones.rHand) {
            bones.rHand.getWorldPosition(P);
            bones.rHand.getWorldQuaternion(Q);
            fan.position.copy(P);
            fan.quaternion.copy(Q);
            fan.rotateX(Math.PI / 2);
            fan.translateY(0.08);
            fan.children.forEach((pv, i) => (pv.rotation.z = (-0.55 + i * 0.18) * (0.6 + 0.4 * up) + Math.sin(lt * 9 + i) * 0.03 * up));
          }
          const rk = prog(ctx.t, tD - 1.2, tD);
          for (let i = 0; i < NR; i++) {
            const [a, b, c, d] = seeds[i], fall = (lt * (0.35 + d * 0.3) + c) % 1;
            const on = rk > a ? 1 : 0;
            P.set(-1 + (a - 0.5) * 6, 4.5 - fall * 4.6, 0.4 + (b - 0.5) * 4);
            E.set(lt * (1 + a * 3), lt * (0.5 + b * 2), lt * (1 + c * 2));
            S.setScalar(on);
            rainNotes.setMatrixAt(i, M.compose(P, Q.setFromEuler(E), S));
          }
          rainNotes.instanceMatrix.needsUpdate = true;
          rainNotes.visible = rk > 0;
          hf.place(ctx.t, 0.6, 1, prog(ctx.t, ctx.at("borewells") - 0.3, ctx.at("borewells")) > 0.5 ? 1 : 0);
          const st = prog(ctx.t, tF - 0.1, tF + 0.25, outE);
          stamp.scale.setScalar(Math.max(0.001, st > 0 ? 1.6 - 0.6 * st : 0));
          stamp.visible = st > 0.01;
          camKeys(stage, ctx.t, [
            [ctx.start, [1.4, 1.5, 4.2], [-0.9, 1.3, 0.2]],
            [tB + 0.6, [0.9, 1.55, 3.4], [-0.9, 1.45, 0.3]],
            [ctx.at("borewells") - 0.2, [5.2, 2.6, 4.8], [3.5, 1.8, -4.6]],
            [tF - 0.4, [3.2, 2.6, 4.4], [0.8, 2.6, -3]],
            [tD - 0.8, [1.6, 1.8, 4.6], [-0.6, 1.5, 0.2]],
            [tL + 0.2, [-0.2, 1.3, 2.3], [-1.0, 1.62, 0.3]],
            [ctx.end, [-0.3, 1.28, 2.1], [-1.0, 1.64, 0.3]],
          ]);
          ctx.O.chip("ib", "Illegal borewells", { alpha: prog(ctx.t, ctx.at("borewells") - 0.2, ctx.at("borewells") + 0.3) * (1 - prog(ctx.t, tF - 0.5, tF - 0.2)), top: 280, kind: "big warn" });
          ctx.O.chip("fs", "Fake Water Board stickers", { alpha: prog(ctx.t, tF - 0.2, tF + 0.3) * (1 - prog(ctx.t, tD - 0.8, tD - 0.4)), top: 280, kind: "big warn" });
          ctx.O.stat("lb", "దాహం → లాభం", "water mafia", { alpha: prog(ctx.t, tD - 0.2, tD + 0.3), top: 260, color: "#ffb02e" });
        },
      };
    },
  },

  // ------------------------------------------------ s16: what we can do: rain into a recharge pit, a dead bore made a recharge well, Godavari water
  solutions: {
    sounds: (ctx) => [{ t: ctx.at("rainwater") - 0.5, s: "rain", gain: 0.45 }, { t: ctx.at("recharge") - 0.2, s: "flow", gain: 0.4 }, { t: ctx.at("Leaks") - 0.1, s: "ding", gain: 0.35 }, { t: ctx.at("Godavari") - 0.2, s: "shimmer", gain: 0.45 }],
    async build(stage) {
      const g = new THREE.Group();
      // the plot is cut open toward +z to show what goes into the ground
      const D = 20, W = 50;
      const LAY = [[1.5, [112, 84, 58]], [6, [164, 94, 60]], [14, [150, 140, 128]]];
      let y = 0;
      LAY.forEach(([h, col], i) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(W, h, D), new THREE.MeshStandardMaterial({ map: grain(100 + i, col, { scale: 12, amt: 0.22, size: 512 }), roughness: 0.95 }));
        m.position.set(0, y - h / 2, 0);
        m.receiveShadow = true;
        g.add(m);
        y -= h;
      });
      const lawn = groundPlane(400, { tex: grain(104, [118, 130, 84], { scale: 30, amt: 0.2 }), repeat: 40 });
      lawn.geometry.translate(0, 0.01, -200 + D / 2);
      g.add(lawn);
      // house with a roof downpipe
      const house = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 9), std(0xf1e6d2));
      body.position.y = 3.5;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.5, 9.8), std(0xd8c9b0));
      slab.position.y = 7.25;
      const tank = await model("/assets/sf-tank/model.glb", { height: 2 });
      tank.position.set(-3, 7.5, -1);
      body.castShadow = slab.castShadow = true;
      house.add(body, slab, tank);
      house.position.set(-12, 0, -2);
      g.add(house);
      const down = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 7.4, 10), std(0xe9e9e9));
      down.position.set(-5.8, 3.7, 2.4);
      g.add(down);
      const barrel = await model("/assets/sf-rainbarrel/model.glb", { height: 1.4 });
      barrel.position.set(-4.5, 0, 4.4);
      g.add(barrel);
      // recharge pit: gravel, sand, charcoal layers in a cylinder, shown in section
      const PX = 2, PZ = D / 2;
      const pitLayers = [[1.2, 0xb9aa8f], [1.2, 0x2b2b2b], [2.4, 0x8d8a85]];
      let py = 0;
      for (const [h, c] of pitLayers) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, h, 32), new THREE.MeshStandardMaterial({ map: grain(110 + h * 10, [(c >> 16) & 255, (c >> 8) & 255, c & 255], { scale: 30, amt: 0.35, speck: 0.08 }), roughness: 1 }));
        m.position.set(PX, py - h / 2 + 0.02, PZ);
        g.add(m);
        py -= h;
      }
      const lid = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.5, 32), std(0xbdb6a8));
      lid.rotation.x = -Math.PI / 2;
      lid.position.set(PX, 0.05, PZ);
      g.add(lid);
      const roofRun = new THREE.CatmullRomCurve3([V(-5.8, 0.2, 2.4), V(-3, 0.25, 4.5), V(PX - 1, 0.25, PZ - 0.5), V(PX, -1, PZ), V(PX, -4.6, PZ), V(PX + 1, -12, PZ + 1)]);
      const rf = flow(roofRun, 30, 0x8fe2ff, 0.2);
      g.add(rf.mesh);
      // the old borewell, turned into a recharge well
      const BX = 13;
      const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 21, 12), std(0x9aa3aa, { metalness: 0.8, roughness: 0.35 }));
      bore.position.set(BX, -10, D / 2);
      g.add(bore);
      const boreRun = new THREE.CatmullRomCurve3([V(BX, 1.2, D / 2), V(BX, -20, D / 2)]);
      const bf = flow(boreRun, 24, 0x8fe2ff, 0.22);
      g.add(bf.mesh);
      // the Godavari line arriving across the land
      const gc = new THREE.CatmullRomCurve3([V(160, 0.8, -160), V(90, 1.2, -70), V(40, 1.0, -30), V(16, 0.8, -8)]);
      const gTube = new THREE.Mesh(new THREE.TubeGeometry(gc, 120, 1.5, 16), std(0x7f8a92, { metalness: 0.75, roughness: 0.35 }));
      gTube.castShadow = true;
      const gf = flow(gc, 40, 0x86e0ff, 0.8);
      g.add(gTube, gf.mesh);
      const rn = rain(1400, [-26, 26], [0, 22], [-14, 12]);
      g.add(rn.mesh);
      return {
        group: g,
        update(ctx) {
          const tR = ctx.at("rainwater"), tB = ctx.at("recharge"), tL = ctx.at("Leaks"), tG = ctx.at("Godavari");
          const wet = prog(ctx.t, tR - 0.6, tR + 0.4) * (1 - prog(ctx.t, tL - 0.6, tL));
          look(stage, { top: new THREE.Color(0x89adcc).lerp(new THREE.Color(0x6a7684), wet).getHex(), bottom: new THREE.Color(0xe7dcc8).lerp(new THREE.Color(0xa9b0b4), wet).getHex(), fog: 0.004, exposure: 1.0, sun: 3.3 - wet * 1.6, sunDir: [25, 50, 35], shadow: 40, hemiI: 0.9 });
          rn.place(ctx.t, wet);
          rf.place(ctx.t, 0.35, 1, prog(ctx.t, tR, tR + 0.6) > 0.5 ? 1 : 0);
          bf.place(ctx.t, 0.3, 1, prog(ctx.t, tB - 0.2, tB + 0.4) > 0.5 ? 1 : 0);
          const gk = prog(ctx.t, tG - 0.3, tG + 1.5, outE);
          gTube.geometry.setDrawRange(0, Math.floor((gTube.geometry.index.count * gk) / 6) * 6);
          gTube.visible = gk > 0.01;
          gf.place(ctx.t, 0.12, gk, gk > 0.05 ? 1 : 0);
          camKeys(stage, ctx.t, [
            [ctx.start, [30, 14, 52], [-4, 2, 0]],
            [tR + 0.6, [8, 4, 40], [-1, -2, 6]],
            [tB - 0.4, [8, 4, 40], [-1, -2, 6]],
            [tB + 0.8, [20, 2, 42], [10, -6, 8]],
            [tG - 0.4, [26, 10, 42], [4, -1, 0]],
            [tG + 1.2, [34, 44, 78], [2, 0, -14]],
            [ctx.end, [36, 46, 80], [2, 0, -14]],
          ]);
          const items = [["rainwater", "Rainwater pit"], ["recharge", "Borewell → recharge well"], ["Leaks", "Leaks fix"], ["Godavari", "Godavari water project"]];
          items.forEach(([w, txt], i) => ctx.O.chip("sol" + i, "✓ " + txt, { alpha: prog(ctx.t, ctx.at(w) - 0.2, ctx.at(w) + 0.3), top: 250 + i * 104, left: 64, kind: "big" }));
        },
      };
    },
  },

  // ------------------------------------------------ s17: every drop counts: one drop into still water
  finale: {
    sounds: (ctx) => [{ t: ctx.start + 1.15, s: "splash", gain: 0.6 }, { t: ctx.at("Comment") - 0.2, s: "ding", gain: 0.4 }],
    build(stage) {
      const g = new THREE.Group();
      const surf = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), waterMat(0x0f3550, { opacity: 1, repeat: 20, rough: 0.02 }));
      surf.rotation.x = -Math.PI / 2;
      g.add(surf);
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 24), new THREE.MeshPhysicalMaterial({ color: 0xd6f0ff, roughness: 0, transmission: 0.7, transparent: true, opacity: 0.9, clearcoat: 1, envMapIntensity: 3 }));
      drop.scale.y = 1.3;
      g.add(drop);
      const rings = [0, 1, 2, 3].map(() => {
        const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 8, 96), new THREE.MeshPhysicalMaterial({ color: 0xcfeeff, roughness: 0.05, transparent: true, opacity: 0.8, clearcoat: 1 }));
        m.rotation.x = Math.PI / 2;
        m.position.y = 0.03;
        g.add(m);
        return m;
      });
      const N = 40, crown = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 10, 8), drop.material, N);
      crown.frustumCulled = false;
      g.add(crown);
      const key = new THREE.SpotLight(0xdff2ff, 900, 60, 0.5, 0.7, 1.4);
      key.position.set(4, 16, 6);
      key.target.position.set(0, 0, 0);
      g.add(key, key.target);
      const M = new THREE.Matrix4();
      return {
        group: g,
        update(ctx) {
          look(stage, { top: 0x020407, bottom: 0x07121c, fog: 0.02, exposure: 1.0, sun: 0, hemiI: 0.2, env: 0.9, bloom: { strength: 0.45, radius: 0.5, threshold: 0.85 }, near: 0.05 });
          const lt = ctx.t - ctx.start, hit = 1.15;
          drop.visible = lt < hit;
          drop.position.set(0, Math.max(0, 6 - 0.5 * 9.8 * lt * lt * 0.9), 0);
          rings.forEach((m, i) => {
            const k = lt - hit - i * 0.35;
            m.visible = k > 0;
            m.scale.setScalar(0.3 + Math.max(0, k) * 2.6);
            m.material.opacity = 0.8 * Math.max(0, 1 - k / 4);
          });
          const ck = lt - hit;
          for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2, s = ck > 0 && ck < 0.8 ? 1 : 0;
            M.makeScale(s, s, s).setPosition(Math.cos(a) * (0.4 + ck * 1.6), Math.max(0, ck * 3.2 - 6 * ck * ck), Math.sin(a) * (0.4 + ck * 1.6));
            crown.setMatrixAt(i, M);
          }
          crown.instanceMatrix.needsUpdate = true;
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, mix3([0, 1.4, 7.5], [0, 7, 9], k), mix3([0, 1.2, 0], [0, 0, 0], k));
          const tc = ctx.at("Comment");
          ctx.O.stat("drop", "ప్రతి చుక్క", "విలువైనదే", { alpha: prog(ctx.t, ctx.at("ప్రతి") - 0.1, ctx.at("ప్రతి") + 0.4), top: 300 });
          ctx.O.chip("cm", "మీ area లో నీళ్లు ఎన్ని రోజులకు? 👇", { alpha: prog(ctx.t, tc - 0.6, tc), top: 1500, kind: "big" });
        },
      };
    },
  },
};

/** When the drops leave the tap in the opening: steady at first, the last one alone on "2.8". */
function hookDrops(ctx) {
  const out = [];
  const stop = ctx.at("పడింది") - 0.2;
  for (let t = ctx.start + 0.9; t < stop; t += 1.1) out.push(t);
  out.push(ctx.at("2.8mm") - 0.3);
  return out;
}
