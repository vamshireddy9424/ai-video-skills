// Petrol: where your ₹100 goes. Style from episodes/petrol/style.md (Vox cards, Johnny Harris maps,
// MagnatesMedia dark warm grade, LEMMiNO quiet holds). Helpers are shared with the water episode.
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

// ---------------------------------------------------------------- petrol pieces
const ORANGE = "#ff8a1f";

/** A stylised ₹100 note (not a replica): lavender, big ₹100, guilloche lines. */
function noteTex() {
  return once("note", () => drawn(1240, 520, (g, W, H) => {
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, "#b9a7d6"); grd.addColorStop(0.5, "#cdbfe3"); grd.addColorStop(1, "#a594c8");
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(70,50,110,0.18)"; g.lineWidth = 2;
    for (let i = 0; i < 40; i++) { g.beginPath(); for (let x = 0; x <= W; x += 10) g.lineTo(x, H * 0.5 + Math.sin(x / 40 + i) * (60 + i * 4)); g.stroke(); }
    g.strokeStyle = "rgba(60,40,100,0.6)"; g.lineWidth = 10; g.strokeRect(22, 22, W - 44, H - 44);
    g.fillStyle = "#3d2b66"; g.textBaseline = "middle";
    g.font = '900 210px "Inter Tight"'; g.textAlign = "left"; g.fillText("₹100", 70, H * 0.52);
    g.font = '800 64px "Inter Tight"'; g.textAlign = "right"; g.fillText("100", W - 70, 110); g.fillText("100", W - 70, H - 100);
    g.beginPath(); g.arc(W * 0.74, H * 0.5, 120, 0, Math.PI * 2); g.fillStyle = "rgba(255,255,255,0.35)"; g.fill();
  }));
}
/** A strip of the note from u0 to u1 (0..1), as its own mesh, sized in world units. */
function noteSlice(u0, u1, W = 6.2, H = 2.6) {
  const w = (u1 - u0) * W;
  const geo = new THREE.BoxGeometry(w, H, 0.012);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
  const front = new THREE.MeshStandardMaterial({ map: noteTex(), roughness: 0.75 });
  const m = new THREE.Mesh(geo, front);
  m.castShadow = true;
  return m;
}
/** A big stamped word (Johnny Harris): a rotated bold block plate. */
function stampPlate(text, { w = 5, h = 1.6, bg = "rgba(0,0,0,0)", fg = "#ffffff", size = 200, rot = -0.12 } = {}) {
  const p = plate([{ text, size, weight: 900, color: fg }], { w, h, bg, px: 180 });
  p.material.depthTest = false;
  p.renderOrder = 10;
  p.rotation.z = rot;
  return p;
}
/** Flat satellite map of West Asia → India (equirectangular crop of the Blue Marble). */
const MAPW = 40, LON0 = 40, LON1 = 95, LAT0 = 5, LAT1 = 35, MAPH = MAPW * (LAT1 - LAT0) / (LON1 - LON0);
const mp = (lat, lon, y = 0) => V(((lon - LON0) / (LON1 - LON0) - 0.5) * MAPW, y, -((lat - LAT0) / (LAT1 - LAT0) - 0.5) * MAPH);
async function satMap() {
  const tex = await new THREE.TextureLoader().loadAsync("/assets/earth/earth_atmos_2048.jpg");
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.offset.set((LON0 + 180) / 360, (LAT0 + 90) / 180);
  tex.repeat.set((LON1 - LON0) / 360, (LAT1 - LAT0) / 180);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(MAPW, MAPH), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, color: 0xb8b0a4 }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}
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

/** The forecourt: dispenser, canopy with lights, wet concrete. Shared by hook, pump and finale. */
async function forecourt(g) {
  const pump = await model("/assets/sf-dispenser/model.glb", { height: 2.4 });
  g.add(pump);
  const floor = groundPlane(60, { tex: grain(41, [70, 70, 72], { scale: 30, amt: 0.2, size: 512 }), repeat: 6, rough: 0.35 });
  floor.material.metalness = 0.1;
  g.add(floor);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 8), std(0xe9e9ea, { roughness: 0.5 }));
  canopy.position.set(0, 5.4, 0);
  g.add(canopy);
  for (const x of [-4, 0, 4]) for (const z of [-2, 2]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.6), glowMat(0xfff6e6, 2.5));
    lamp.position.set(x, 5.13, z);
    g.add(lamp);
  }
  const key = new THREE.SpotLight(0xfff1dc, 140, 18, 0.9, 0.6, 1.6);
  key.position.set(0, 5.1, 1.5);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  g.add(key, key.target);
  const rim = new THREE.PointLight(0xff8a3a, 20, 14, 2);
  rim.position.set(-4, 1.5, -3);
  g.add(rim);
  return pump;
}

// ---------------------------------------------------------------- scenes
export const scenes = {
  // ------------------------------------------------ s1: a quiet night forecourt; a ₹100 note held out (LEMMiNO hold)
  hook: {
    sounds: (ctx) => [
      { t: ctx.start, s: "city", gain: 0.15 },
      { t: ctx.at("ఇస్తారు") - 0.2, s: "whoosh", gain: 0.3 },
      { t: ctx.at("లేదు") - 0.05, s: "thud", gain: 0.5 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const pump = await forecourt(g);
      const note = noteSlice(0, 1, 0.62, 0.26);
      g.add(note);
      return {
        group: g,
        update(ctx) {
          look(stage, NIGHT);
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, mix3([2.0, 1.7, 7.5], [0.9, 1.4, 3.6], k), mix3([0, 1.4, 0], [0.2, 1.2, 0.6], k));
          const tn = ctx.at("ఇస్తారు");
          const a = prog(ctx.t, tn - 0.8, tn + 0.4);
          note.position.set(lerp(1.4, 0.35, a), 1.15 + Math.sin(ctx.t * 1.3) * 0.01, lerp(2.2, 1.0, a));
          note.rotation.set(-0.25, -0.5, 0.08);
          note.visible = a > 0;
          const tl = ctx.at("లేదు");
          ctx.O.stat("q", "₹100", "మొత్తం petrol కి వెళ్తుందా?", { alpha: prog(ctx.t, tn, tn + 0.4) * (1 - prog(ctx.t, tl - 0.3, tl)), top: 1480 });
          ctx.O.stat("no", "లేదు.", "చాలా భాగం వేరే జేబుల్లోకి", { alpha: prog(ctx.t, tl - 0.1, tl + 0.3), top: 1480, color: ORANGE });
        },
      };
    },
  },

  // ------------------------------------------------ s2: the price on the board — Hyderabad vs Delhi
  pump: {
    sounds: (ctx) => [
      { t: ctx.start + 0.2, s: "pump", gain: 0.35 },
      { t: ctx.at("₹115.69") - 0.1, s: "tick", gain: 0.5 },
      { t: ctx.at("Delhi") - 0.1, s: "whoosh", gain: 0.3 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      await forecourt(g);
      // a price totem: baked board, Hyderabad price lit
      const board = plate([{ text: "PETROL", size: 90, color: "#ffb15c" }, { text: "₹115.69", size: 170, color: "#ff3b2f" }, { text: "per litre · Hyderabad", size: 58, color: "#c9c9c9", weight: 600 }], { w: 3.2, h: 2.4, bg: "#101114", px: 220 });
      board.material = new THREE.MeshBasicMaterial({ map: board.material.map, toneMapped: false });
      board.position.set(4.3, 3.2, -0.5);
      board.rotation.y = -0.35;
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2, 0.25), std(0x2a2b2e));
      pole.position.set(4.3, 1, -0.5);
      g.add(board, pole);
      return {
        group: g,
        update(ctx) {
          look(stage, NIGHT);
          const td = ctx.at("Delhi");
          camKeys(stage, ctx.t, [
            [ctx.start, [1.0, 1.8, 7.5], [1.6, 1.8, 0]],
            [ctx.at("₹115.69"), [4.1, 3.2, 9.5], [4.3, 2.9, -0.5]],
            [td, [4.3, 3.2, 9.0], [4.3, 2.9, -0.5]],
            [ctx.end, [1.6, 2.6, 10.5], [2.4, 2.0, -0.5]],
          ]);
          const th = ctx.at("₹115.69");
          ctx.O.stat("del", "₹102.12", "Delhi · అదే petrol", { alpha: prog(ctx.t, td + 0.6, td + 1.0), top: 1600 });
          ctx.O.chip("big", "పెద్ద cities లో అన్నిటికంటే ఎక్కువ", { alpha: prog(ctx.t, th + 2.4, th + 2.8) * (1 - prog(ctx.t, td, td + 0.3)), top: 260, kind: "big warn" });
        },
      };
    },
  },

  // ------------------------------------------------ s3: Gulf → India, a tanker crossing the Arabian Sea (Johnny Harris map)
  tanker: {
    sounds: (ctx) => [
      { t: ctx.start, s: "waves", gain: 0.3 },
      { t: ctx.at("Gulf") - 0.1, s: "thud", gain: 0.4 },
      { t: ctx.at("ports") - 0.1, s: "thud", gain: 0.35 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      g.add(await satMap());
      const pts = [mp(26.7, 50.3, 0.15), mp(26.4, 56.4, 0.15), mp(24.0, 60.5, 0.15), mp(22.4, 66.0, 0.15), mp(22.5, 69.4, 0.15)];
      const route = routeLine(pts);
      g.add(route);
      const ship = await model("/assets/sf-oilship/model.glb", { length: 2.4 });
      g.add(ship);
      const gulf = stampPlate("GULF", { w: 5, h: 1.6, rot: 0.1 });
      gulf.rotation.x = -Math.PI / 2;
      gulf.position.copy(mp(28.6, 49, 0.3));
      const india = stampPlate("INDIA", { w: 6, h: 1.8, rot: -0.12 });
      india.rotation.x = -Math.PI / 2;
      india.position.copy(mp(21, 77, 0.3));
      g.add(gulf, india);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 32), glowMat(0xff8a1f, 1.6));
      pin.position.copy(mp(22.5, 69.4, 0.12));
      g.add(pin);
      return {
        group: g,
        update(ctx) {
          look(stage, { top: 0x0d1016, bottom: 0x1d1a16, fog: 0, exposure: 1.0, sun: 2.6, sunCol: 0xfff0dc, sunDir: [-20, 40, 20], shadow: 30, hemiI: 0.5, env: 0.4, bloom: { strength: 0.4, radius: 0.4, threshold: 0.9 }, near: 0.1, fov: 38 });
          const tg = ctx.at("Gulf"), tp = ctx.at("ports");
          const k = prog(ctx.t, tg - 0.3, tp + 0.4, lin);
          route.userData.set(k);
          const u = Math.min(0.999, k);
          const p = route.userData.curve.getPointAt(u), q = route.userData.curve.getPointAt(Math.min(1, u + 0.01));
          ship.position.set(p.x, 0.05, p.z);
          ship.lookAt(q.x, 0.05, q.z);
          gulf.visible = ctx.t > tg - 0.1;
          gulf.scale.setScalar(1 + 0.4 * (1 - prog(ctx.t, tg - 0.1, tg + 0.15)));
          india.visible = ctx.t > tp - 0.1;
          india.scale.setScalar(1 + 0.4 * (1 - prog(ctx.t, tp - 0.1, tp + 0.15)));
          pin.scale.setScalar(1 + 0.25 * Math.sin(ctx.t * 6));
          pin.visible = ctx.t > tp;
          const kc = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, mix3([mp(24, 60).x, 34, mp(24, 60).z + 16], [p.x + 1, 16, p.z + 9], kc), mix3(mp(24, 62).toArray(), [p.x + 1, 0, p.z - 1], kc));
          ctx.O.chip("crude", "Crude oil · ఎక్కువ భాగం విదేశాల నుంచి", { alpha: prog(ctx.t, ctx.start + 1, ctx.start + 1.5), top: 260, kind: "big" });
        },
      };
    },
  },

  // ------------------------------------------------ s4: the refinery at night, flare stacks (MagnatesMedia grade)
  refinery: {
    sounds: (ctx) => [
      { t: ctx.start, s: "heat", gain: 0.35 },
      { t: ctx.at("refinery") - 0.2, s: "flash", gain: 0.3 },
      { t: ctx.at("₹69") - 0.1, s: "thud", gain: 0.5 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const ref = await model("/assets/sf-refinery/model.glb", { length: 30 });
      g.add(ref);
      g.add(groundPlane(160, { tex: grain(51, [60, 55, 50], { scale: 20, amt: 0.25 }), repeat: 10 }));
      const flames = [];
      for (const [x, z, h] of [[-12, -8, 16], [13, -10, 13]]) {
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, h, 16), std(0x3a3532, { roughness: 0.6, metalness: 0.4 }));
        stack.position.set(x, h / 2, z);
        const f = flame(0xff6a12, 1.6);
        f.position.set(x, h + 1, z);
        const l = new THREE.PointLight(0xff7a2a, 400, 45, 1.8);
        l.position.set(x, h + 1.5, z);
        g.add(stack, f, l);
        flames.push(f);
      }
      return {
        group: g,
        update(ctx) {
          look(stage, { ...NIGHT, top: 0x0a0604, bottom: 0x3a1a0c, fog: 0.012, fogCol: 0x1a0d07, hemiI: 0.35, hemiSky: 0x5a6a8a, exposure: 1.0, bloom: { strength: 0.8, radius: 0.6, threshold: 0.8 }, near: 0.2 });
          flames.forEach((f, i) => { const s = 1 + 0.15 * Math.sin(ctx.t * 9 + i * 2) + 0.08 * Math.sin(ctx.t * 23 + i); f.scale.set(s, 1.8 * s, s); });
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, mix3([-26, 7, 26], [-8, 4.5, 16], k), mix3([0, 4, 0], [2, 5, -2], k));
          const t69 = ctx.at("₹69");
          const parts = ["Crude", "Refining", "Transport", "Company లాభం"];
          parts.forEach((p, i) => ctx.O.chip("p" + i, p, { alpha: prog(ctx.t, t69 - 4 + i * 0.6, t69 - 3.6 + i * 0.6) * (1 - prog(ctx.t, t69 - 0.2, t69)), top: 240 + i * 100, kind: "big" }));
          ctx.O.stat("c69", "₹69", "ఒక litre · oil company దగ్గర ఖర్చు", { alpha: prog(ctx.t, t69, t69 + 0.4), top: 1500, color: ORANGE });
        },
      };
    },
  },

  // ------------------------------------------------ s5-s6: the ₹100 note splits into who-gets-what
  split: {
    sounds: (ctx) => [
      { t: ctx.start, s: "riser", gain: 0.3 },
      { t: ctx.at("₹60") - 0.05, s: "whoosh", gain: 0.45 },
      { t: ctx.at("₹4") - 0.05, s: "whoosh", gain: 0.4 },
      { t: ctx.at("Central") - 0.05, s: "thud", gain: 0.5 },
      { t: ctx.at("₹26") - 0.05, s: "thud", gain: 0.6 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const wall = gridWall(40, 24);
      wall.position.set(0, 3, -6);
      g.add(wall);
      const cuts = [0, 0.6, 0.64, 0.74, 1.0];
      const names = [["Oil company", "₹60", "#f4f1ea"], ["Dealer", "₹4", "#f4f1ea"], ["CENTRE · Excise", "₹10", "#ff8a1f"], ["STATE · VAT", "₹26", "#ff3b2f"]];
      const slices = [], tags = [];
      for (let i = 0; i < 4; i++) {
        const s = noteSlice(cuts[i], cuts[i + 1]);
        s.userData.w = (cuts[i + 1] - cuts[i]) * 6.2;
        s.userData.cx = ((cuts[i] + cuts[i + 1]) / 2 - 0.5) * 6.2;
        slices.push(s);
        const t = plate([{ text: names[i][1], size: 150, color: names[i][2] }, { text: names[i][0], size: 60, color: "#d8d2c8", weight: 700 }], { w: 2.6, h: 1.3, bg: "rgba(0,0,0,0)", px: 200 });
        t.material.depthWrite = false;
        tags.push(t);
        g.add(s, t);
      }
      const key = new THREE.SpotLight(0xffe2c0, 160, 30, 0.5, 0.5, 1.5);
      key.position.set(2, 6, 7);
      key.target.position.set(0, 1.5, 0);
      g.add(key, key.target);
      return {
        group: g,
        update(ctx) {
          look(stage, { top: 0x050303, bottom: 0x120606, fog: 0, exposure: 1.0, sun: 0, hemiI: 0.3, env: 0.4, bloom: { strength: 0.3, radius: 0.4, threshold: 0.95 }, near: 0.1 });
          const at = [ctx.at("₹60"), ctx.at("₹4"), ctx.at("Central") - 0.4, ctx.at("₹26")];
          // target layout: oil company low-left, dealer, centre, state stacked right
          const dest = [[-1.4, 5.6], [-1.4, 2.6], [-1.4, -0.4], [-1.4, -3.6]];
          slices.forEach((s, i) => {
            const k = outE(prog(ctx.t, at[i] - 0.2, at[i] + 0.5));
            // each slice lands left-aligned in its row, so the widths read as shares
            s.position.set(lerp(s.userData.cx, dest[i][0] - 1.6 + s.userData.w / 2, k), lerp(1.5, dest[i][1], k), lerp(0, i >= 2 ? 0.8 : 0, k));
            s.rotation.set(0, lerp(0, i % 2 ? 0.18 : -0.18, k), lerp(0, (i - 1.5) * 0.07, k));
            const tg = tags[i];
            tg.position.set(lerp(s.position.x, 2.7, k), s.position.y, s.position.z + 0.05);
            tg.material.opacity = prog(ctx.t, at[i] + 0.1, at[i] + 0.5);
            tg.visible = tg.material.opacity > 0.01;
          });
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, mix3([0, 1.5, 13], [0.3, 1.0, 20], k), mix3([0, 1.5, 0], [0.3, 1.0, 0], k));
        },
      };
    },
  },

  // ------------------------------------------------ s7: CENTRE + STATE fuse → ₹36 TAX stamp
  stamp: {
    sounds: (ctx) => [
      { t: ctx.at("₹36") - 0.15, s: "thud", gain: 0.8 },
      { t: ctx.at("₹36") + 0.1, s: "coins", gain: 0.4 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const wall = gridWall(40, 24);
      wall.position.set(0, 3, -6);
      g.add(wall);
      const tax = noteSlice(0.64, 1.0);
      const rest = noteSlice(0, 0.64);
      g.add(tax, rest);
      const st = stampPlate("₹36 TAX", { w: 4.4, h: 1.4, fg: "#ff3b2f", size: 170, rot: -0.14 });
      g.add(st);
      return {
        group: g,
        update(ctx) {
          look(stage, { top: 0x050303, bottom: 0x120606, fog: 0, exposure: 1.0, sun: 1.6, sunCol: 0xffe2c0, sunDir: [3, 6, 8], shadow: 6, hemiI: 0.35, env: 0.4, bloom: { strength: 0.35, radius: 0.4, threshold: 0.92 }, near: 0.1 });
          const t36 = ctx.at("₹36");
          const k = outE(prog(ctx.t, ctx.start, t36 - 0.3));
          rest.position.set(lerp(-0.2, -0.6, k), lerp(4.2, 4.6, k), -0.5);
          rest.material.opacity = 1;
          rest.material.transparent = true;
          rest.material.opacity = 1 - 0.65 * k;
          tax.position.set(0, lerp(1.2, 1.0, k), lerp(0, 1.2, k));
          tax.scale.setScalar(1 + 0.35 * k);
          const s = prog(ctx.t, t36 - 0.15, t36 + 0.05);
          st.visible = s > 0;
          st.scale.setScalar(lerp(2.2, 1, outE(s)));
          st.position.set(0, 1.0, 2.2);
          cam(stage, [Math.sin(ctx.t * 30) * 0.06 * (1 - prog(ctx.t, t36, t36 + 0.4)) * (ctx.t > t36 ? 1 : 0), 1.6, 14], [0, 1.6, 0]);
        },
      };
    },
  },

  // ------------------------------------------------ s8: why Hyderabad — VAT pillars on the map
  map: {
    sounds: (ctx) => [
      { t: ctx.at("Telangana") - 0.1, s: "thud", gain: 0.45 },
      { t: ctx.at("Delhi") - 0.1, s: "thud", gain: 0.35 },
      { t: ctx.at("₹13.5") - 0.1, s: "cash", gain: 0.4 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      g.add(await satMap());
      const bar = (lat, lon, color) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1, 1.1), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4 }));
        b.geometry.translate(0, 0.5, 0);
        b.position.copy(mp(lat, lon));
        b.castShadow = true;
        g.add(b);
        return b;
      };
      const hyd = bar(17.4, 78.5, 0xff3b2f), del = bar(28.6, 77.2, 0xd9d4ca);
      const lab = (lines, at) => {
        const p = plate(lines, { w: 5.2, h: 2.5, bg: "rgba(12,12,14,0.85)", px: 200 });
        p.position.copy(at);
        g.add(p);
        return p;
      };
      const lh = lab([{ text: "Telangana VAT", size: 70, color: "#ffffff", weight: 700 }, { text: "35.2%", size: 150, color: "#ff3b2f" }], mp(17.4, 78.5, 0));
      const ld = lab([{ text: "Delhi VAT", size: 70, color: "#ffffff", weight: 700 }, { text: "19.4%", size: 150, color: "#e8e2d6" }], mp(28.6, 77.2, 0));
      return {
        group: g,
        update(ctx) {
          look(stage, { top: 0x0d1016, bottom: 0x1d1a16, fog: 0, exposure: 1.0, sun: 2.6, sunCol: 0xfff0dc, sunDir: [-20, 40, 20], shadow: 30, hemiI: 0.5, env: 0.4, bloom: { strength: 0.35, radius: 0.4, threshold: 0.9 }, near: 0.1, fov: 38 });
          const tt = ctx.at("Telangana"), td = ctx.at("Delhi");
          const kh = outE(prog(ctx.t, tt - 0.2, tt + 0.8)), kd = outE(prog(ctx.t, td - 0.2, td + 0.8));
          hyd.scale.y = 0.01 + 7.04 * kh;
          del.scale.y = 0.01 + 3.88 * kd;
          lh.position.copy(mp(17.4, 78.5, 0)).add(V(0, 7.04 * kh + 1.8, 0));
          ld.position.copy(mp(28.6, 77.2, 0)).add(V(0, 3.88 * kd + 1.8, 0));
          lh.visible = kh > 0.05; ld.visible = kd > 0.05;
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          const c = mp(23, 78);
          cam(stage, mix3([c.x + 2, 26, c.z + 17], [c.x + 3, 22, c.z + 15], k), mix3([c.x, 2, c.z - 1], [c.x, 2.5, c.z - 1], k));
          const t13 = ctx.at("₹13.5");
          lh.quaternion.copy(stage.camera.quaternion); ld.quaternion.copy(stage.camera.quaternion);
          ctx.O.stat("diff", "+₹13.5", "ప్రతి litre కి · Hyderabad ఎక్కువ", { alpha: prog(ctx.t, t13, t13 + 0.4), top: 1500, color: "#ff5a45" });
        },
      };
    },
  },

  // ------------------------------------------------ s9: VAT is a percentage — the State slice grows with the price; excise doesn't
  trick: {
    sounds: (ctx) => [
      { t: ctx.at("పెరిగితే") - 0.2, s: "riser", gain: 0.35 },
      { t: ctx.at("Centre") - 0.1, s: "clunk", gain: 0.45 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const wall = gridWall(40, 24, "#0d0b0a", "rgba(255,160,80,0.14)");
      wall.position.set(0, 3, -6);
      g.add(wall);
      const col = (color, x) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 1.6), new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 }));
        b.geometry.translate(0, 0.5, 0);
        b.position.x = x;
        b.castShadow = true;
        g.add(b);
        return b;
      };
      const state = col(0xff3b2f, 1.1), centre = col(0xff8a1f, -1.1);
      const ls = plate([{ text: "STATE", size: 80, color: "#ffffff" }, { text: "VAT %", size: 64, color: "#ff8a6a" }], { w: 2.0, h: 1.0, bg: "rgba(0,0,0,0)" });
      const lc = plate([{ text: "CENTRE", size: 80, color: "#ffffff" }, { text: "fixed ₹", size: 64, color: "#ffc27a" }], { w: 2.0, h: 1.0, bg: "rgba(0,0,0,0)" });
      ls.position.set(1.1, 3.6, 0.9); lc.position.set(-1.1, 1.0, 0.9);
      g.add(ls, lc);
      const floor = groundPlane(40, { tex: grain(61, [40, 36, 34], { scale: 20, amt: 0.2 }), repeat: 4, rough: 0.4 });
      floor.position.y = -0.9;
      g.add(floor);
      state.position.y = centre.position.y = -0.9;
      return {
        group: g,
        update(ctx) {
          look(stage, { top: 0x060504, bottom: 0x15100c, fog: 0, exposure: 1.0, sun: 2.4, sunCol: 0xffe6c8, sunDir: [4, 8, 6], shadow: 8, hemiI: 0.4, env: 0.5, bloom: { strength: 0.25, radius: 0.4, threshold: 0.95 }, near: 0.1 });
          const tp = ctx.at("పెరిగితే");
          const grow = prog(ctx.t, tp - 0.3, tp + 2.2);
          // price rising ×1.0 → ×1.3: VAT grows with it, excise stays put
          state.scale.y = 3.0 * (1 + 0.3 * grow) * (1 + 0.04 * Math.sin(ctx.t * 4) * grow);
          centre.scale.y = 1.2;
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          ls.position.y = -0.9 + state.scale.y + 0.8;
          lc.position.y = -0.9 + centre.scale.y + 0.8;
          cam(stage, mix3([0, 2.0, 13], [0.6, 1.8, 11.5], k), mix3([0, 1.4, 0], [0.3, 1.4, 0], k));
          ctx.O.chip("up", "Petrol ధర ↑  →  State tax ↑", { alpha: prog(ctx.t, tp, tp + 0.4), top: 1500, kind: "big warn" });
          const tc = ctx.at("Centre");
          ctx.O.chip("fx", "Centre excise = ₹11.90 / litre (fixed)", { alpha: prog(ctx.t, tc, tc + 0.4), top: 1600, kind: "big" });
        },
      };
    },
  },

  // ------------------------------------------------ s10: Vox card — Delhi price through 2026
  chart: {
    sounds: (ctx) => [
      { t: ctx.at("March") - 0.1, s: "tick", gain: 0.4 },
      { t: ctx.at("May") - 0.1, s: "thud", gain: 0.45 },
      { t: ctx.at("₹102") - 0.1, s: "flash", gain: 0.35 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      // the card: pastel, title, thin line chart, source in small caps — drawn per progress step (baked frames)
      const W = 1000, H = 1400;
      const pts = [[0, 94.77], [0.35, 94.77], [0.42, 98.5], [0.5, 102.12], [1, 102.12]]; // Apr → Oct
      const frames = [];
      for (let f = 0; f <= 20; f++) {
        const p = f / 20;
        frames.push(drawn(W, H, (c) => {
          c.fillStyle = "#ecebdc"; c.fillRect(0, 0, W, H);
          c.fillStyle = "#3a3d40"; c.font = '800 64px "Inter Tight"'; c.fillText("Delhi petrol price, 2026", 80, 120);
          c.font = '600 26px "Inter Tight"'; c.fillStyle = "#7a7c7e"; c.fillText("₹ PER LITRE · SOURCE: PPAC / BUSINESS STANDARD", 80, 170);
          const X = (x) => 110 + x * 820, Y = (y) => 1180 - (y - 90) * 60;
          c.strokeStyle = "rgba(0,0,0,0.12)"; c.lineWidth = 2;
          for (const y of [92, 96, 100, 104]) { c.beginPath(); c.moveTo(X(0), Y(y)); c.lineTo(X(1), Y(y)); c.stroke(); c.fillStyle = "#8a8c8e"; c.font = '500 26px "Inter Tight"'; c.fillText("₹" + y, 30, Y(y) + 8); }
          c.fillStyle = "#8a8c8e";
          ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"].forEach((m, i) => c.fillText(m, X(i / 6) - 20, 1250));
          c.strokeStyle = "#e0602a"; c.lineWidth = 7; c.lineJoin = "round"; c.beginPath();
          let last = null;
          for (let i = 0; i < pts.length; i++) {
            const [x, y] = pts[i];
            if (x > p) { if (last) { const [x0, y0] = last, k = (p - x0) / (x - x0); c.lineTo(X(p), Y(y0 + (y - y0) * k)); } break; }
            i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y));
            last = [x, y];
          }
          c.stroke();
          c.fillStyle = "#3a3d40"; c.font = '800 44px "Inter Tight"';
          c.fillText("₹94.77", X(0) + 10, Y(94.77) + 60);
          if (p >= 0.5) c.fillText("₹102.12", X(0.55), Y(102.12) - 24);
          if (p >= 0.38) { c.fillStyle = "#e0602a"; c.font = '700 34px "Inter Tight"'; c.fillText("May: West Asia → crude ↑", X(0.3), Y(105.5)); }
        }));
      }
      const card = new THREE.Mesh(new THREE.PlaneGeometry(5, 7), new THREE.MeshBasicMaterial({ map: frames[0], toneMapped: false }));
      card.position.set(0, 1.6, 0);
      g.add(card);
      const cut = plate([{ text: "March: excise −₹10", size: 90, color: "#ffffff" }], { w: 4.2, h: 0.8, bg: "#e0602a", px: 200 });
      cut.position.set(0, 6.0, 0.3);
      cut.rotation.z = 0.05;
      g.add(cut);
      return {
        group: g,
        update(ctx) {
          look(stage, { top: 0xd8d6c4, bottom: 0xd8d6c4, fog: 0, exposure: 1.0, sun: 0, hemiI: 1.0, env: 0.3, near: 0.1 });
          const tm = ctx.at("May"), t102 = ctx.at("₹102");
          const p = clamp01(0.36 * prog(ctx.t, ctx.start, tm) + 0.64 * prog(ctx.t, tm, t102 + 0.6));
          card.material.map = frames[Math.round(p * 20)];
          const tc = ctx.at("March");
          cut.visible = ctx.t > tc - 0.1;
          cut.scale.setScalar(1 + 0.3 * (1 - prog(ctx.t, tc - 0.1, tc + 0.15)));
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, mix3([0, 2.3, 13], [0.2, 2.2, 12], k), [0, 2.3, 0]);
        },
      };
    },
  },

  // ------------------------------------------------ s11: your own bill — coins stacking up for a year
  wallet: {
    sounds: (ctx) => [
      { t: ctx.at("30") - 0.1, s: "tick", gain: 0.4 },
      { t: ctx.at("₹1,250") - 0.1, s: "coins", gain: 0.5 },
      { t: ctx.at("₹15,000") - 0.1, s: "cash", gain: 0.6 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const N = 12 * 18;
      const coin = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 32), new THREE.MeshStandardMaterial({ color: 0xd8a64a, metalness: 0.9, roughness: 0.28 }), N);
      coin.castShadow = coin.receiveShadow = true;
      coin.frustumCulled = false;
      g.add(coin);
      const floor = groundPlane(40, { tex: grain(71, [34, 30, 28], { scale: 20, amt: 0.2 }), repeat: 4, rough: 0.5 });
      g.add(floor);
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const labels = months.map((m, i) => {
        const p = plate([{ text: m, size: 90, color: "#cfc8bb", weight: 700 }], { w: 0.6, h: 0.27, bg: "rgba(0,0,0,0)" });
        p.rotation.x = -Math.PI / 2;
        p.position.set(((i % 4) - 1.5) * 1.0, 0.01, Math.floor(i / 4) * 1.3 - 1.3 + 0.48);
        g.add(p);
        return p;
      });
      const M = new THREE.Matrix4();
      return {
        group: g,
        update(ctx) {
          look(stage, { ...NIGHT, top: 0x070605, bottom: 0x1a130d, sun: 2.4, sunCol: 0xffe2b8, sunDir: [3, 7, 5], shadow: 8, hemiI: 0.35, bloom: { strength: 0.3, radius: 0.5, threshold: 0.9 }, near: 0.05 });
          const t1 = ctx.at("₹1,250"), t15 = ctx.at("₹15,000");
          // first month's stack on ₹1,250, the rest of the year on ₹15,000
          for (let m = 0; m < 12; m++) for (let j = 0; j < 18; j++) {
            const tStart = m === 0 ? t1 - 0.6 : t15 - 2.2 + m * 0.18;
            const k = prog(ctx.t, tStart + j * 0.02, tStart + j * 0.02 + 0.25);
            const y = j * 0.065 + 0.03 + (1 - outE(k)) * 2.5;
            const s = k > 0 ? 1 : 0;
            M.makeScale(s, s, s).setPosition(((m % 4) - 1.5) * 1.0, y, Math.floor(m / 4) * 1.3 - 1.3 + Math.sin(j * 1.7 + m) * 0.02);
            coin.setMatrixAt(m * 18 + j, M);
          }
          coin.instanceMatrix.needsUpdate = true;
          labels.forEach((l, i) => (l.visible = ctx.t > (i === 0 ? t1 - 0.6 : t15 - 2.2 + i * 0.18)));
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          camKeys(stage, ctx.t, [
            [ctx.start, [-1.2, 1.4, 1.2], [-1.5, 0.5, -1.3]],
            [t15 - 2.4, [-0.8, 1.8, 2.2], [-1.5, 0.6, -1.3]],
            [t15 + 1, [0, 5.2, 6.5], [0, 0.3, 0]],
            [ctx.end, [0, 5.6, 7.2], [0, 0.3, 0]],
          ]);
          const t30 = ctx.at("30");
          ctx.O.stat("30", "30 litres / నెల", "ఒక ఉదాహరణ", { alpha: prog(ctx.t, t30, t30 + 0.4) * (1 - prog(ctx.t, t1 - 0.3, t1)), top: 1480 });
          ctx.O.stat("m", "₹1,250", "నెలకి tax", { alpha: prog(ctx.t, t1, t1 + 0.4) * (1 - prog(ctx.t, t15 - 0.3, t15)), top: 1480, color: ORANGE });
          ctx.O.stat("y", "₹15,000", "సంవత్సరానికి tax", { alpha: prog(ctx.t, t15, t15 + 0.4), top: 1480, color: "#ff5a45" });
        },
      };
    },
  },

  // ------------------------------------------------ s12: back to the pump, slow pull-out, the question
  finale: {
    sounds: (ctx) => [{ t: ctx.start, s: "city", gain: 0.15 }, { t: ctx.at("Comment") - 0.2, s: "chime", gain: 0.4 }],
    async build(stage) {
      const g = new THREE.Group();
      await forecourt(g);
      return {
        group: g,
        update(ctx) {
          look(stage, NIGHT);
          const k = prog(ctx.t, ctx.start, ctx.end, lin);
          cam(stage, mix3([1.2, 1.6, 4.5], [3, 3.6, 13], k), mix3([0, 1.3, 0], [0, 2.2, 0], k));
          const tc = ctx.at("Comment");
          ctx.O.stat("end", "₹100 లో ₹36 tax", "గుర్తుపెట్టుకోండి", { alpha: prog(ctx.t, ctx.start + 0.6, ctx.start + 1.2), top: 300 });
          ctx.O.chip("cm", "మీరు నెలకి petrol కి ఎంత? 👇", { alpha: prog(ctx.t, tc - 0.6, tc), top: 1500, kind: "big" });
        },
      };
    },
  },
};
