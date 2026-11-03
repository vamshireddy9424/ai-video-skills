// Hyderabad RRR: the Regional Ring Road on a night-lit 3D Hyderabad (restrained lighting).
// Everything visual hangs off spoken words (ctx.at), so a new voice take re-times itself.
// The city is real geography (lat/lon) seen at night: lights are dense where Hyderabad is
// dense, the lake and the Musi stay dark, routes glow and bloom. Map geometry is illustrative.
// No GL points (Apple Metal caps their size) and no live CanvasTextures (blank on a Mac GPU):
// glows are instanced quads with their own shader, and every drawn texture is baked to bytes.
import { THREE, shoot, mix3, prog, bakeTexture } from "/web/engine.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const captions = false;

// ---------------------------------------------------------------- helpers
const rand = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const outE = (x) => 1 - Math.pow(1 - clamp01(x), 3);

const LAT0 = 17.4, LON0 = 78.47, SCALE = 600; // 1 km ≈ 5.7 units
const ll = (lat, lon, y = 0) => new THREE.Vector3((lon - LON0) * SCALE, y, -(lat - LAT0) * SCALE);

const NIGHT = 0x03050a;

/** Night stage: background, fog, the kit's sun and ground off, bloom on. */
let hemi;
function setStage(stage, { bg = NIGHT, fog = 0.0035, bloom = { strength: 0.8, radius: 0.45, threshold: 0.92 }, hemiI = 0.12, near = 1, exposure = 0.78 } = {}) {
  const sc = stage.scene;
  sc.background = new THREE.Color(bg);
  sc.fog = fog ? new THREE.FogExp2(bg, fog) : null;
  sc.environment = null;
  stage.ground.visible = false;
  stage.sun.visible = false;
  if (!hemi) sc.traverse((o) => { if (o.isHemisphereLight) hemi = o; });
  if (hemi) hemi.intensity = hemiI;
  stage.camera.near = near;
  stage.camera.far = 3000;
  stage.camera.fov = 40;
  stage.camera.updateProjectionMatrix();
  stage.bloom(bloom);
  stage.dof(null);
  stage.renderer.toneMappingExposure = exposure;
}

/** A soft round glow: bright core, long falloff. Baked to bytes. */
let glowT;
function glowTex() {
  if (glowT) return glowT;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const g = cv.getContext("2d", { willReadFrequently: true });
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.18, "rgba(255,255,255,0.55)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.12)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowT = bakeTexture(cv);
  return glowT;
}

/**
 * n glowing quads in one draw: flat on the ground (city lights) or facing the camera (lamps,
 * train lights). set(i, x, y, z, size, r, g, b) then commit(). Additive, never writes depth.
 * `position` is all zeros and the corners ride in their own attribute, so the ambient-occlusion
 * pass (which redraws the scene with its own material) sees nothing, not a dark square.
 */
function glowField(n, { flat = false, opacity = 1 } = {}) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
  geo.setAttribute("corner", new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
  const centre = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const size = new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
  const col = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aCentre", centre);
  geo.setAttribute("aSize", size);
  geo.setAttribute("aCol", col);
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: glowTex() }, uOpacity: { value: opacity } },
    vertexShader: `
      attribute vec2 corner; attribute vec3 aCentre; attribute float aSize; attribute vec3 aCol;
      varying vec2 vUv; varying vec3 vCol;
      void main() {
        vUv = corner * 0.5 + 0.5; vCol = aCol;
        ${flat
          ? "gl_Position = projectionMatrix * modelViewMatrix * vec4(aCentre + vec3(corner.x, 0.0, corner.y) * aSize, 1.0);"
          : "vec4 mv = modelViewMatrix * vec4(aCentre, 1.0); mv.xy += corner * aSize; gl_Position = projectionMatrix * mv;"}
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uOpacity;
      varying vec2 vUv; varying vec3 vCol;
      void main() {
        float a = texture2D(uMap, vUv).r;
        gl_FragColor = vec4(vCol * a * uOpacity, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, // the flat quads face down as wound; without this the city's lights were all culled
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return {
    mesh,
    mat,
    n,
    set(i, x, y, z, s, r, g, b) {
      centre.array[i * 3] = x; centre.array[i * 3 + 1] = y; centre.array[i * 3 + 2] = z;
      size.array[i] = s;
      col.array[i * 3] = r; col.array[i * 3 + 1] = g; col.array[i * 3 + 2] = b;
    },
    commit() { centre.needsUpdate = size.needsUpdate = col.needsUpdate = true; },
  };
}

// ---------------------------------------------------------------- geography
// Dense parts of the city, as [lat, lon, weight, spread in degrees].
const HUBS = [
  [17.395, 78.475, 1.0, 0.05], [17.44, 78.5, 0.85, 0.03], [17.445, 78.38, 1.0, 0.028], [17.42, 78.345, 0.8, 0.022],
  [17.49, 78.4, 0.85, 0.035], [17.36, 78.54, 0.85, 0.03], [17.4, 78.56, 0.6, 0.03], [17.36, 78.47, 0.95, 0.025],
  [17.395, 78.43, 0.7, 0.025], [17.5, 78.36, 0.6, 0.03], [17.25, 78.42, 0.35, 0.025], [17.53, 78.27, 0.4, 0.03],
  [17.39, 78.335, 0.45, 0.02], [17.33, 78.6, 0.35, 0.025], [17.54, 78.48, 0.45, 0.04], [17.47, 78.56, 0.4, 0.03],
];
const LAKE = { lat: 17.4239, lon: 78.4738, a: 0.011, b: 0.0085 }; // Hussain Sagar
const MUSI = [[17.388, 78.33], [17.38, 78.39], [17.376, 78.43], [17.372, 78.46], [17.373, 78.49], [17.368, 78.53], [17.375, 78.57], [17.385, 78.62]];
// Arterial roads, so lights string out along them the way a night photo of a city does.
const ROADS = [
  [[17.395, 78.475], [17.44, 78.38], [17.42, 78.33]], [[17.395, 78.475], [17.5, 78.37], [17.535, 78.26]],
  [[17.395, 78.475], [17.36, 78.54], [17.33, 78.62]], [[17.395, 78.475], [17.4, 78.56], [17.45, 78.65]],
  [[17.395, 78.475], [17.3, 78.44], [17.24, 78.43]], [[17.395, 78.475], [17.55, 78.49], [17.62, 78.5]],
  [[17.44, 78.5], [17.5, 78.55]], [[17.395, 78.475], [17.38, 78.38], [17.36, 78.3]],
];
const inLake = (la, lo) => ((lo - LAKE.lon) / LAKE.a) ** 2 + ((la - LAKE.lat) / LAKE.b) ** 2 < 1;
function distToPolyline(la, lo, pl) {
  let best = 1e9;
  for (let i = 0; i < pl.length - 1; i++) {
    const [a1, o1] = pl[i], [a2, o2] = pl[i + 1];
    const dx = o2 - o1, dy = a2 - a1, L = dx * dx + dy * dy;
    const t = clamp01(((lo - o1) * dx + (la - a1) * dy) / L);
    best = Math.min(best, Math.hypot(lo - (o1 + dx * t), la - (a1 + dy * t)));
  }
  return best;
}
function density(la, lo) {
  if (inLake(la, lo) || distToPolyline(la, lo, MUSI) < 0.0022) return 0;
  let d = 0;
  for (const [a, o, w, s] of HUBS) d += w * Math.exp(-(((la - a) ** 2 + (lo - o) ** 2) / (2 * s * s)));
  const r = Math.hypot(la - 17.4, lo - 78.47);
  d += r < 0.21 ? 0.1 : 0.015;
  for (const rd of ROADS) if (distToPolyline(la, lo, rd) < 0.0018) d += 0.55;
  return Math.min(d, 1.4);
}

/** City at night: ground, lights, buildings, lake, river, ring road. */
const cityCache = {};
function windowsTex() {
  const cv = document.createElement("canvas");
  cv.width = 64; cv.height = 128;
  const g = cv.getContext("2d", { willReadFrequently: true });
  g.fillStyle = "#000"; g.fillRect(0, 0, 64, 128);
  const r = rand(5);
  for (let y = 4; y < 124; y += 8) for (let x = 4; x < 60; x += 8) {
    if (r() < 0.45) continue;
    const w = r();
    g.fillStyle = w < 0.6 ? `rgba(255,${190 + r() * 40},${120 + r() * 50},${0.5 + r() * 0.5})` : `rgba(${180 + r() * 40},${210 + r() * 30},255,${0.4 + r() * 0.5})`;
    g.fillRect(x, y, 5, 4);
  }
  const t = bakeTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function city({ lights = 70000, buildings = 0, seed = 11 } = {}) {
  const g = new THREE.Group();
  const r = rand(seed);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: 0x070a10, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  g.add(ground);

  // The sprawl's own glow: the density map baked into a warm emissive layer, the continuous
  // orange haze a night aerial shows between individual lights.
  if (!cityCache.sprawl) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 512;
    const c2 = cv.getContext("2d", { willReadFrequently: true });
    const img = c2.createImageData(512, 512);
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const ex = Math.min(x, 511 - x) / 70, ey = Math.min(y, 511 - y) / 70;
      const d = Math.pow(density(17.4 + (0.5 - y / 512) * 0.5, 78.47 + (x / 512 - 0.5) * 0.62) / 1.4, 2.3) * smooth(Math.min(ex, ey));
      const o = (y * 512 + x) * 4;
      img.data[o] = Math.min(255, d * 255); img.data[o + 1] = Math.min(255, d * 105); img.data[o + 2] = Math.min(255, d * 30); img.data[o + 3] = 255;
    }
    c2.putImageData(img, 0, 0);
    c2.filter = "blur(3px)";
    c2.drawImage(cv, 0, 0);
    cityCache.sprawl = bakeTexture(cv);
  }
  const sprawl = new THREE.Mesh(new THREE.PlaneGeometry(0.62 * SCALE, 0.5 * SCALE), new THREE.MeshBasicMaterial({ map: cityCache.sprawl, color: new THREE.Color(0.2, 0.2, 0.2), fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sprawl.rotation.x = -Math.PI / 2;
  sprawl.position.y = 0.2;
  Object.assign(sprawl.material, { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  sprawl.renderOrder = 1;
  g.add(sprawl);

  // Hussain Sagar: a dark glassy lake with the Necklace Road lights around it.
  const lc = ll(LAKE.lat, LAKE.lon, 0.02);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: 0x0a1626, roughness: 0.12, metalness: 0.7 }));
  lake.rotation.x = -Math.PI / 2;
  lake.scale.set(LAKE.a * SCALE, LAKE.b * SCALE, 1);
  lake.position.copy(lc);
  g.add(lake);

  // The Musi: a dark ribbon through the old city.
  const musiCurve = new THREE.CatmullRomCurve3(MUSI.map(([a, o]) => ll(a, o, 0.03)));
  const musi = new THREE.Mesh(new THREE.TubeGeometry(musiCurve, 200, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x0b1a2a, roughness: 0.2, metalness: 0.5 }));
  musi.scale.y = 0.05;
  g.add(musi);

  const L = glowField(lights + 1600 + 900, { flat: true });
  let i = 0;
  while (i < lights) {
    const la = 17.4 + (r() - 0.5) * 0.5, lo = 78.47 + (r() - 0.5) * 0.62;
    if (r() > density(la, lo) * 0.85) continue;
    const p = ll(la, lo, 0.35);
    const tone = r(), b = 0.26 + r() * 0.5;
    const [cr, cg, cb] = tone < 0.62 ? [1.0, 0.6, 0.26] : tone < 0.9 ? [1.0, 0.92, 0.8] : [0.62, 0.78, 1.0];
    L.set(i++, p.x, p.y, p.z, 0.07 + r() * 0.1, cr * b, cg * b, cb * b);
  }
  // Necklace Road: a bright ring of lamps around the lake
  for (let k = 0; k < 1600; k++, i++) {
    const a = (k / 1600) * Math.PI * 2;
    const p = ll(LAKE.lat + Math.sin(a) * LAKE.b * 1.08, LAKE.lon + Math.cos(a) * LAKE.a * 1.08, 0.4);
    L.set(i, p.x, p.y, p.z, 0.13, 1.0, 0.68, 0.36);
  }
  // Outer Ring Road: a faint amber circle at the edge of the city
  for (let k = 0; k < 900; k++, i++) {
    const a = (k / 900) * Math.PI * 2;
    const p = ll(17.4 + Math.sin(a) * 0.205, 78.47 + Math.cos(a) * 0.235, 0.35);
    L.set(i, p.x, p.y, p.z, 0.16, 0.8, 0.5, 0.18);
  }
  L.commit();
  g.add(L.mesh);

  // Buildings: dark blocks with lit windows, taller in the IT corridor and the core. Only for
  // low flyovers; from high up they read as black squares over the glow.
  if (!buildings) return g;
  if (!cityCache.win) cityCache.win = windowsTex();
  const bm = new THREE.MeshStandardMaterial({ color: 0x0d1118, roughness: 0.6, metalness: 0.3, emissive: 0xffffff, emissiveMap: cityCache.win, emissiveIntensity: 0.75 });
  const bg = new THREE.BoxGeometry(1, 1, 1);
  bg.translate(0, 0.5, 0);
  const B = new THREE.InstancedMesh(bg, bm, buildings);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3();
  let j = 0;
  while (j < buildings) {
    const la = 17.4 + (r() - 0.5) * 0.36, lo = 78.47 + (r() - 0.5) * 0.44;
    const d = density(la, lo);
    if (d < 0.45 || r() > d * 0.8) continue;
    const it = Math.exp(-(((la - 17.435) ** 2 + (lo - 78.365) ** 2) / (2 * 0.025 ** 2)));
    const h = 0.4 + r() * 1.6 * d + it * (3 + r() * 8);
    const w = 0.5 + r() * 0.9 + it * 0.8;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI);
    m4.compose(ll(la, lo), q, sv.set(w, h, w * (0.7 + r() * 0.6)));
    B.setMatrixAt(j++, m4);
  }
  B.castShadow = B.receiveShadow = true;
  g.add(B);
  return g;
}

// ---------------------------------------------------------------- the network
const RED = [[17.4967, 78.3711], [17.493, 78.3889], [17.484, 78.396], [17.485, 78.412], [17.477, 78.442], [17.457, 78.435], [17.4375, 78.4483], [17.428, 78.451], [17.417, 78.463], [17.404, 78.465], [17.392, 78.469], [17.3784, 78.4836], [17.373, 78.498], [17.369, 78.525], [17.3457, 78.5522]];
const BLUE = [[17.391, 78.5591], [17.401, 78.559], [17.418, 78.543], [17.4285, 78.5397], [17.435, 78.52], [17.4436, 78.5015], [17.443, 78.486], [17.443, 78.463], [17.4375, 78.4483], [17.438, 78.438], [17.43, 78.409], [17.438, 78.392], [17.4486, 78.381], [17.441, 78.377]];
const GREEN = [[17.4486, 78.4986], [17.44, 78.498], [17.425, 78.501], [17.417, 78.499], [17.406, 78.496], [17.396, 78.488], [17.387, 78.483], [17.3784, 78.4836]];
// Phase 2 routes drawn through their stations. [name shown, lat, lon, spoken word to sync on, interchange colour]
// Station names from HMRL / the Corridor IV proposal / press reports; positions approximate (illustrative).
const ST = {
  airport: [
    ["Nagole", 17.391, 78.5591, "Nagole", 0x3d7bff], ["Alkapuri", 17.37, 78.556], ["LB Nagar", 17.3457, 78.5522, "LB", 0xff3b3b],
    ["Karmanghat", 17.339, 78.532, "Karmanghat"], ["Owaisi Hospital", 17.333, 78.511, "Owaisi"], ["DRDO", 17.33, 78.498],
    ["Chandrayangutta", 17.327, 78.487, "Chandrayangutta", 0xff4fd8], ["Mailardevpally", 17.319, 78.444, "Mailardevpally"],
    ["Aramghar", 17.313, 78.429, "Aramghar"], ["New High Court", 17.3, 78.426], ["Gaganpahad", 17.284, 78.433],
    ["Shamshabad", 17.262, 78.405, "Shamshabad"], ["Airport", 17.2403, 78.4294],
  ],
  kokapet: [
    ["Raidurg", 17.441, 78.377, "Raidurg", 0x3d7bff], ["Biodiversity Jn", 17.433, 78.376, "Biodiversity"], ["Nanakramguda", 17.42, 78.35, "Nanakramguda"],
    ["Wipro Junction", 17.421, 78.341, "Wipro"], ["Financial District", 17.413, 78.336, "Financial"], ["Kokapet Neopolis", 17.393, 78.333, "Kokapet"],
  ],
  patancheru: [
    ["Miyapur", 17.4967, 78.3711, "Miyapur", 0xff3b3b], ["Madinaguda", 17.493, 78.35, "Madinaguda"], ["Chandanagar", 17.495, 78.329, "Chandanagar"],
    ["BHEL", 17.5, 78.305, "BHEL"], ["Beeramguda", 17.515, 78.29, "Beeramguda"], ["Patancheru", 17.533, 78.264, "Patancheru"],
  ],
  oldcity: [
    ["MGBS", 17.3784, 78.4836, "MGBS", 0x2fd06a], ["Charminar area", 17.3616, 78.4747, "Charminar"], ["Falaknuma", 17.331, 78.467, "Falaknuma"],
    ["Chandrayangutta", 17.327, 78.487, "Chandrayangutta", 0xffc23d],
  ],
  hayath: [
    ["LB Nagar", 17.3457, 78.5522, "LB", 0xff3b3b], ["Chintalkunta", 17.342, 78.564], ["Vanasthalipuram", 17.333, 78.57, "Vanasthalipuram"],
    ["Hayathnagar", 17.327, 78.604, "Hayathnagar"],
  ],
};
const P2 = {
  airport: { pts: ST.airport.map((s) => [s[1], s[2]]), col: 0xffc23d },
  kokapet: { pts: ST.kokapet.map((s) => [s[1], s[2]]), col: 0x2fe6ff },
  oldcity: { pts: ST.oldcity.map((s) => [s[1], s[2]]), col: 0xff4fd8 },
  patancheru: { pts: ST.patancheru.map((s) => [s[1], s[2]]), col: 0x7dff6a },
  hayath: { pts: ST.hayath.map((s) => [s[1], s[2]]), col: 0xb48cff },
};
const ORDER = ["airport", "kokapet", "patancheru", "oldcity", "hayath"];
// Phase 1 ends and interchanges
const P1_ENDS = [["Miyapur", 17.4967, 78.3711, 0xff3b3b], ["LB Nagar", 17.3457, 78.5522, 0xff3b3b], ["Nagole", 17.391, 78.5591, 0x3d7bff], ["Raidurg", 17.441, 78.377, 0x3d7bff], ["JBS", 17.4486, 78.4986, 0x2fd06a], ["MGBS", 17.3784, 78.4836, 0x2fd06a]];
const P1_X = [["Ameerpet", 17.4375, 78.4483, "Ameerpet"], ["Parade Ground", 17.444, 78.4985, "Parade"], ["MGBS", 17.3784, 78.4836, "దగ్గర"]];

/** A route that draws itself: a bright core, a soft halo, a glowing head. draw(k), 0..1. */
function routeLine(latlons, color, { y = 0.9, radius = 0.32, halo = 3.2, bright = 2.6, headSize = 2.4 } = {}) {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(latlons.map(([a, o]) => ll(a, o, y)), false, "centripetal");
  const segs = Math.max(80, latlons.length * 60), radial = 8;
  const c = new THREE.Color(color);
  const core = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, radius, radial), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(bright), toneMapped: false }));
  const glow = new THREE.Mesh(
    new THREE.TubeGeometry(curve, segs, radius * halo, radial),
    new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(0.55), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  );
  glow.renderOrder = 3;
  const head = glowField(2);
  g.add(core, glow, head.mesh);
  const ends = [curve.getPointAt(0), curve.getPointAt(1)];
  const per = radial * 6;
  return {
    group: g,
    curve,
    ends,
    draw(k, headOn = true) {
      k = clamp01(k);
      const n = Math.floor(k * segs) * per;
      core.geometry.setDrawRange(0, n);
      glow.geometry.setDrawRange(0, n);
      g.visible = k > 0.001;
      const p = curve.getPointAt(Math.max(0.0001, k));
      const s = headOn && k < 0.999 ? 1 : 0.55;
      head.set(0, p.x, p.y + 0.1, p.z, headSize * s, c.r * 2.0, c.g * 2.0, c.b * 2.0);
      const e = curve.getPointAt(0);
      head.set(1, e.x, e.y + 0.1, e.z, headSize * 0.66, c.r * 1.4, c.g * 1.4, c.b * 1.4);
      head.commit();
    },
  };
}

/** Trains as little bright capsules running along a route; place(t). */
function runners(route, n, color, speed = 0.05) {
  const f = glowField(n * 3);
  const c = new THREE.Color(color);
  return {
    mesh: f.mesh,
    place(t) {
      for (let i = 0; i < n; i++) {
        const u0 = (i / n + t * speed) % 1;
        for (let k = 0; k < 3; k++) {
          const p = route.curve.getPointAt((u0 + k * 0.004) % 1);
          f.set(i * 3 + k, p.x, p.y + 0.35, p.z, 0.9 - k * 0.2, 1.6 + c.r, 1.6 + c.g, 1.6 + c.b);
        }
      }
      f.commit();
    },
  };
}

function network({ phase1 = true, phase2 = true, headSize = 2.4 } = {}) {
  const g = new THREE.Group();
  const p1 = phase1 ? [routeLine(RED, 0xff3b3b, { bright: 1.8, headSize }), routeLine(BLUE, 0x3d7bff, { bright: 1.8, headSize }), routeLine(GREEN, 0x2fd06a, { bright: 1.8, headSize })] : [];
  const p2 = phase2 ? Object.fromEntries(ORDER.map((k) => [k, routeLine(P2[k].pts, P2[k].col, { radius: 0.4, bright: 3.0, headSize })])) : {};
  for (const l of p1) g.add(l.group);
  for (const k of Object.keys(p2)) g.add(p2[k].group);
  return { group: g, p1, p2 };
}

// ---------------------------------------------------------------- models
const loader = new GLTFLoader();
const modelCache = {};
/** A model fitted to a size: its longest horizontal side along +Z (so lookAt aims its nose), base at y=0. */
async function model(path, { length, height, glass = 0 } = {}) {
  if (!modelCache[path]) modelCache[path] = loader.loadAsync(path);
  const src = (await modelCache[path]).scene.clone(true);
  const box = new THREE.Box3().setFromObject(src);
  const size = box.getSize(new THREE.Vector3());
  const inner = new THREE.Group();
  inner.add(src);
  if (length && size.x > size.z) inner.rotation.y = Math.PI / 2;
  const s = length ? length / Math.max(size.x, size.z) : height / size.y;
  src.position.sub(box.getCenter(new THREE.Vector3())).add(new THREE.Vector3(0, size.y / 2, 0));
  inner.scale.setScalar(s);
  src.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.receiveShadow = true;
      if (o.material) o.material.envMapIntensity = 1.2;
      // a train at night: its glass glows warm from the saloon lights
      if (glass && o.material && /glass|window/i.test(o.material.name + o.name)) {
        o.material = o.material.clone();
        o.material.emissive = new THREE.Color(0xffe6c2);
        o.material.emissiveIntensity = glass;
      }
    }
  });
  const outer = new THREE.Group();
  outer.add(inner);
  return outer;
}

// ---------------------------------------------------------------- close-up sets
/** An elevated viaduct along a curve: pillars, pier caps, the deck, and blue edge lights. */
function onCurve(obj, curve, u, y) {
  const a = curve.getPointAt(clamp01(u)), b = curve.getPointAt(clamp01(u + 0.002));
  obj.position.set(a.x, y, a.z);
  obj.lookAt(b.x, y, b.z);
}

function nightLights(g, { moon = 0x8fb0ff, moonI = 0.9, warm = 0xffb070, warmI = 0 } = {}) {
  const m = new THREE.DirectionalLight(moon, moonI);
  m.position.set(-60, 90, 40);
  m.castShadow = true;
  m.shadow.mapSize.set(2048, 2048);
  Object.assign(m.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, far: 300 });
  g.add(m, m.target);
  if (warmI) {
    const w = new THREE.PointLight(warm, warmI, 0, 1.6);
    w.position.set(10, 12, 10);
    g.add(w);
  }
  return m;
}


// ---------------------------------------------------------------- the construction site
// One straight stretch of road, eleven pier positions every 12 units; each construction scene

// ================================================================ RRR pieces
// Night city, restrained: the city dims, inactive lines sit low, and only what is being talked
// about lights up. Routes are approximate (towns joined), not the surveyed alignment.
const lerp = (a, b, k) => a + (b - a) * k;
const lin = (t, a, b) => clamp01((t - a) / Math.max(1e-6, b - a));
const A = (ctx, w, frac = 0.5) => { try { return ctx.at(w); } catch { return ctx.start + (ctx.end - ctx.start) * frac; } };
const CAL = { strength: 0.42, radius: 0.4, threshold: 0.95 };
const calm = (stage, o = {}) => setStage(stage, { fog: 0.0004, bloom: CAL, hemiI: 0.18, exposure: 0.72, near: 1, ...o });
const CEN = [17.4, 78.47];
const ORR = Array.from({ length: 37 }, (_, i) => { const a = (i / 36) * Math.PI * 2; const r = 0.225 + 0.02 * Math.sin(a * 3 + 1); return [CEN[0] + Math.sin(a) * r, CEN[1] + Math.cos(a) * r * 1.05]; });
const NORTH = [["సంగారెడ్డి", 17.6247, 78.0866], ["నర్సాపూర్", 17.738, 78.283], ["తూప్రాన్", 17.846, 78.48], ["గజ్వేల్", 17.85, 78.683], ["భువనగిరి", 17.511, 78.889], ["చౌటుప్పల్", 17.251, 78.898]];
const NORTH_PTS = [[17.6247, 78.0866], [17.70, 78.18], [17.738, 78.283], [17.80, 78.38], [17.846, 78.48], [17.86, 78.58], [17.85, 78.683], [17.75, 78.82], [17.60, 78.90], [17.511, 78.889], [17.38, 78.91], [17.251, 78.898]];
const SOUTH_PTS = [[17.251, 78.898], [17.08, 78.80], [16.95, 78.65], [16.86, 78.50], [16.92, 78.33], [17.07, 78.21], [17.25, 78.13], [17.42, 78.08], [17.6247, 78.0866]];
const KOKAPET = [17.395, 78.335];
const P = (la, lo, y = 1) => ll(la, lo, y);

/** Baked text card (a plane) — for the billboard face and map plates. */
function card(lines, { w = 40, h = 20, bg = "#101318", fg = "#ffffff", px = 22, size = 120, glow = 0 } = {}) {
  const cv = document.createElement("canvas");
  cv.width = Math.round(w * px); cv.height = Math.round(h * px);
  const g = cv.getContext("2d", { willReadFrequently: true });
  g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height);
  g.textAlign = "center"; g.textBaseline = "middle";
  const arr = Array.isArray(lines) ? lines : [lines];
  arr.forEach((l, i) => {
    const s = typeof l === "string" ? { text: l } : l;
    let fs = s.size || size;
    g.font = `800 ${fs}px "Inter Tight", "Anek Telugu"`;
    while (g.measureText(s.text).width > cv.width - 40 && fs > 20) { fs -= 4; g.font = `800 ${fs}px "Inter Tight", "Anek Telugu"`; }
    g.fillStyle = s.color || fg;
    g.fillText(s.text, cv.width / 2, (cv.height * (i + 0.5)) / arr.length);
  });
  const t = bakeTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glow ? new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color(glow, glow, glow) }) : new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
  return m;
}
/** A dashed (uncertain) route: alternating visible segments that draw with k. */
function dashedRoute(pts, color, { y = 1.2, r = 0.9, bright = 1.6 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([a, o]) => ll(a, o, y)), false, "centripetal");
  const g = new THREE.Group(), segs = [];
  const N = 90, mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(bright), toneMapped: false });
  for (let i = 0; i < N; i += 2) {
    const a = curve.getPointAt(i / N), b = curve.getPointAt((i + 1) / N);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 6), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(m); segs.push([i / N, m]);
  }
  return { group: g, curve, mat, draw(k) { segs.forEach(([u, m]) => (m.visible = u < k)); } };
}
/** Town marker: a small pin of light that flares while named. */
function townPins(list) {
  const f = glowField(list.length);
  return { mesh: f.mesh, set(t, times, base = 7) { list.forEach(([, la, lo], i) => { const p = ll(la, lo, 2); const on = t > times[i] - 0.1; const k = on ? 1 + 1.4 * Math.exp(-(t - times[i]) * 2.5) : 0; f.set(i, p.x, p.y, p.z, base * k, 1.4 * k, 1.2 * k, 0.8 * k); }); f.commit(); } };
}
/** A tall soft price column standing on a point. */
function priceColumn(color = 0xffc23d) {
  const g = new THREE.Group();
  const col = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.2), transparent: true, opacity: 0.55, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
  col.geometry.translate(0, 0.5, 0); g.add(col);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.2, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), toneMapped: false })); g.add(cap);
  g.userData.set = (h) => { col.scale.y = Math.max(0.001, h); cap.position.y = h; g.visible = h > 0.01; };
  return g;
}
const callout = (ctx, key, pos, text, a, dx = 60, dy = -150) => ctx.O.callout(key, ctx.camera, pos.toArray(), text, { dx, dy, alpha: a, pill: true });
/** Region camera: high, tilted, looking at the ring centre. */
function regionCam(stage, k, { from = 1650, to = 1500 } = {}) {
  const c = ll(17.33, 78.5, 0), d = lerp(from, to, k);
  shoot(stage, [c.x + lerp(-40, 40, k), d * 0.82, c.z + d * 0.6], [c.x, 0, c.z - 20]);
}

// ================================================================ scenes
export const scenes = {
  // ------------------------------------------------ s1: one acre, ₹120 crore — Kokapet; then the ORR, then the RRR beyond it
  hook: {
    sounds: (ctx) => [
      { t: ctx.start, s: "city", gain: 0.12 },
      { t: A(ctx, "₹120") - 0.1, s: "thud", gain: 0.6 },
      { t: A(ctx, "ప్రశ్న") - 0.2, s: "whoosh", gain: 0.35 },
      { t: A(ctx, "ORR") - 0.1, s: "shimmer", gain: 0.3 },
      { t: A(ctx, "RRR") - 0.3, s: "riser", gain: 0.4 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      g.add(city({ buildings: 2600, seed: 21, lights: 50000 }));
      nightLights(g, { moonI: 0.5 });
      const k0 = P(...KOKAPET, 0);
      const plot = new THREE.Mesh(new THREE.RingGeometry(3.6, 4.0, 4, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc23d).multiplyScalar(2), toneMapped: false, side: THREE.DoubleSide }));
      plot.rotation.set(-Math.PI / 2, 0, Math.PI / 4); plot.position.set(k0.x, 0.3, k0.z); g.add(plot);
      const colm = priceColumn(); colm.position.set(k0.x, 0, k0.z); g.add(colm);
      const orr = routeLine(ORR, 0xdfe6ff, { radius: 0.9, bright: 1.1, halo: 2.0, headSize: 8 }); g.add(orr.group);
      const rrrN = routeLine(NORTH_PTS, 0x39d0ff, { radius: 1.3, bright: 1.8, halo: 2.0, headSize: 12 }); g.add(rrrN.group);
      const rrrS = dashedRoute(SOUTH_PTS, 0xffa53d, { r: 1.2 }); g.add(rrrS.group);
      return {
        group: g,
        update(ctx) {
          calm(stage);
          const t120 = A(ctx, "₹120"), tq = A(ctx, "ప్రశ్న"), to = A(ctx, "ORR"), tr = A(ctx, "RRR");
          colm.userData.set(lerp(0, 38, prog(ctx.t, t120 - 0.6, t120 + 0.4)));
          plot.visible = ctx.t > ctx.start + 0.3;
          orr.draw(lin(ctx.t, to - 0.4, to + 1.4));
          const rk = lin(ctx.t, tr - 0.6, tr + 1.6); rrrN.draw(rk); rrrS.draw(rk);
          // camera: low over Kokapet → rises → region
          const kp = k0.clone();
          const c1 = [kp.x + 30, 22, kp.z + 55], l1 = [kp.x, 10, kp.z];
          const c2 = [kp.x + 60, 260, kp.z + 330], l2 = [kp.x + 60, 0, kp.z - 40];
          const reg = ll(17.33, 78.5, 0), c3 = [reg.x + 30, 1550, reg.z + 1150], l3 = [reg.x + 30, 0, reg.z - 60];
          const a = prog(ctx.t, tq - 0.4, to + 0.2), b = prog(ctx.t, tr - 1.0, tr + 1.6);
          const pos = mix3(mix3(c1, c2, a), c3, b), look = mix3(mix3(l1, l2, a), l3, b);
          shoot(stage, [pos[0] + Math.sin(ctx.t * 0.3) * 4, pos[1], pos[2]], look);
          const ca = prog(ctx.t, t120 - 0.2, t120 + 0.3) * (1 - prog(ctx.t, tq - 0.6, tq - 0.2));
          callout(ctx, "k", new THREE.Vector3(k0.x, 38, k0.z), "Kokapet · 1 ఎకరం = ₹120 కోట్లు", ca, 40, -170);
          ctx.O.chip("auc", "HMDA auction · Sep 2026", { alpha: ca, top: 1500, kind: "big" });
          callout(ctx, "o", P(CEN[0] + 0.225, CEN[1], 2), "ORR", prog(ctx.t, to, to + 0.4) * (1 - prog(ctx.t, tr - 0.2, tr)), 30, -80);
          callout(ctx, "r", P(17.85, 78.48, 2), "RRR", prog(ctx.t, tr + 0.2, tr + 0.7), 30, -80);
        },
      };
    },
  },

  // ------------------------------------------------ s2: 362 km, two halves; what grows around it
  rings: {
    sounds: (ctx) => [{ t: A(ctx, "Northern") - 0.1, s: "ding", gain: 0.3 }, { t: A(ctx, "Southern") - 0.1, s: "ding", gain: 0.3 }, ...["townships", "industries", "logistics"].map((w) => ({ t: A(ctx, w) - 0.1, s: "paper", gain: 0.4 }))],
    async build(stage) {
      const g = new THREE.Group();
      g.add(city({ seed: 22, lights: 40000 }));
      nightLights(g, { moonI: 0.45 });
      const orr = routeLine(ORR, 0xdfe6ff, { radius: 0.9, bright: 0.7, halo: 1.6, headSize: 0 }); g.add(orr.group);
      const n = routeLine(NORTH_PTS, 0x39d0ff, { radius: 1.6, bright: 1.0, halo: 2.0, headSize: 0 }); g.add(n.group);
      const s = dashedRoute(SOUTH_PTS, 0xffa53d, { r: 1.4, bright: 1.0 }); g.add(s.group);
      const props = [];
      for (const [path, la, lo, size] of [["/assets/sf-building/model.glb", 17.7, 78.2, 22], ["/assets/sf-warehouse/model.glb", 17.86, 78.6, 26], ["/assets/sf-warehouse/model.glb", 17.33, 78.92, 26]]) {
        const m = await model(path, { length: size }); const p = P(la, lo, 0); m.position.set(p.x, 0, p.z); g.add(m); props.push(m);
      }
      return {
        group: g,
        update(ctx) {
          calm(stage);
          orr.draw(1); n.draw(1); s.draw(1);
          const tn = A(ctx, "Northern"), ts = A(ctx, "Southern");
          const nOn = ctx.t > tn - 0.1 && ctx.t < ts - 0.1, sOn = ctx.t > ts - 0.1 && ctx.t < ts + 2.0;
          n.group.children[0].material.color.set(new THREE.Color(0x39d0ff).multiplyScalar(nOn ? 2.2 : 1.0));
          s.mat.color.set(new THREE.Color(0xffa53d).multiplyScalar(sOn ? 2.2 : 1.0));
          const tw = [A(ctx, "townships"), A(ctx, "industries"), A(ctx, "logistics")];
          props.forEach((m, i) => { const k = prog(ctx.t, tw[i] - 0.3, tw[i] + 0.3); m.visible = k > 0.01; m.scale.setScalar(Math.max(0.001, k)); });
          regionCam(stage, prog(ctx.t, ctx.start, ctx.end));
          ctx.O.stat("len", "362 km", "Regional Ring Road", { alpha: prog(ctx.t, ctx.start + 0.3, ctx.start + 0.8) * (1 - prog(ctx.t, tn - 0.4, tn)), top: 300 });
          callout(ctx, "nn", P(17.86, 78.5, 2), "North · 161 km", prog(ctx.t, tn, tn + 0.4), 30, -120);
          callout(ctx, "ss", P(16.86, 78.5, 2), "South · 201 km", prog(ctx.t, ts, ts + 0.4), 30, 120);
        },
      };
    },
  },

  // ------------------------------------------------ s3: the northern half, town by town; acquisition done; tenders delayed six times
  north: {
    sounds: (ctx) => [...NORTH.map(([n]) => ({ t: A(ctx, n.slice(0, 3)) - 0.05, s: "tick", gain: 0.4 })), { t: A(ctx, "ట్విస్ట్") - 0.1, s: "thud", gain: 0.5 }, { t: A(ctx, "తప్పు") - 0.1, s: "stamp", gain: 0.5 }],
    async build(stage) {
      const g = new THREE.Group();
      g.add(city({ seed: 23, lights: 36000 }));
      nightLights(g, { moonI: 0.45 });
      const orr = routeLine(ORR, 0xdfe6ff, { radius: 0.9, bright: 0.5, halo: 1.4, headSize: 0 }); g.add(orr.group);
      const n = routeLine(NORTH_PTS, 0x39d0ff, { radius: 1.6, bright: 2.0, halo: 2.0, headSize: 14 }); g.add(n.group);
      const s = dashedRoute(SOUTH_PTS, 0xffa53d, { r: 1.2, bright: 0.5 }); g.add(s.group);
      const pins = townPins(NORTH); g.add(pins.mesh);
      return {
        group: g,
        update(ctx) {
          calm(stage);
          const tt = NORTH.map(([nm]) => A(ctx, nm.slice(0, 3)));
          n.draw(lin(ctx.t, tt[0] - 0.5, tt[5] + 0.4)); orr.draw(1); s.draw(1);
          pins.set(ctx.t, tt);
          // camera tracks the head of the line, high and tilted
          const u = lin(ctx.t, tt[0] - 0.5, tt[5] + 0.4), p = n.curve.getPointAt(Math.max(0.001, Math.min(1, u)));
          const after = prog(ctx.t, tt[5] + 0.6, tt[5] + 2.4);
          const reg = ll(17.5, 78.5, 0);
          const cx = lerp(p.x, reg.x, after), cz = lerp(p.z, reg.z, after), h = lerp(420, 1100, after);
          shoot(stage, [cx, h, cz + h * 0.75], [cx, 0, cz - 20]);
          NORTH.forEach(([nm, la, lo], i) => callout(ctx, "t" + i, P(la, lo, 2), nm, prog(ctx.t, tt[i] - 0.1, tt[i] + 0.3) * (1 - prog(ctx.t, tt[5] + 1.6, tt[5] + 2.0)), 24, -90));
          const tl = A(ctx, "లేన్లు"), tb = A(ctx, "భూసేకరణ"), tw = A(ctx, "ట్విస్ట్"), tf = A(ctx, "తప్పు");
          ctx.O.chip("ln", "161 km · 6 lanes", { alpha: prog(ctx.t, tl - 0.3, tl) * (1 - prog(ctx.t, tb - 0.2, tb)), top: 300, kind: "big" });
          ctx.O.chip("bs", "భూసేకరణ దాదాపు పూర్తి ✓", { alpha: prog(ctx.t, tb, tb + 0.3) * (1 - prog(ctx.t, tw - 0.2, tw)), top: 300, kind: "big" });
          ctx.O.chip("td", "Tender deadline · 6 సార్లు మారింది", { alpha: prog(ctx.t, tw + 0.2, tw + 0.5) * (1 - prog(ctx.t, tf - 0.3, tf)), top: 300, kind: "big warn" });
          ctx.O.chip("nr", "రోడ్డు ఇంకా రెడీ కాదు", { alpha: prog(ctx.t, tf - 0.1, tf + 0.3), top: 300, kind: "big warn" });
        },
      };
    },
  },

  // ------------------------------------------------ s4: the southern half — a flickering, dashed, uncertain line
  south: {
    sounds: (ctx) => [{ t: A(ctx, "Southern") - 0.1, s: "riser", gain: 0.3 }, { t: A(ctx, "రైతుల") - 0.1, s: "thud", gain: 0.4 }, { t: A(ctx, "గీత") - 0.1, s: "glitch", gain: 0.4 }],
    async build(stage) {
      const g = new THREE.Group();
      g.add(city({ seed: 24, lights: 36000 }));
      nightLights(g, { moonI: 0.45 });
      const orr = routeLine(ORR, 0xdfe6ff, { radius: 0.9, bright: 0.5, halo: 1.4, headSize: 0 }); g.add(orr.group);
      const n = routeLine(NORTH_PTS, 0x39d0ff, { radius: 1.4, bright: 0.7, halo: 1.6, headSize: 0 }); g.add(n.group);
      const s = dashedRoute(SOUTH_PTS, 0xffa53d, { r: 1.5, bright: 1.6 }); g.add(s.group);
      const qs = [[16.95, 78.65], [16.92, 78.33], [17.25, 78.13]].map(([la, lo]) => { const c = card([{ text: "?", size: 300, color: "#ffa53d" }], { w: 22, h: 22, bg: "#0c0f14" }); const p = P(la, lo, 14); c.position.copy(p); g.add(c); return c; });
      return {
        group: g,
        update(ctx) {
          calm(stage);
          orr.draw(1); n.draw(1);
          const ts = A(ctx, "Southern"), ta = A(ctx, "Alignment"), tr = A(ctx, "రైతుల"), tg = A(ctx, "గీత");
          s.draw(lin(ctx.t, ts - 0.3, ts + 1.6));
          s.mat.color.set(new THREE.Color(0xffa53d).multiplyScalar(1.2 + 0.6 * (Math.floor(ctx.t * 5) % 2)));
          qs.forEach((q, i) => { q.visible = ctx.t > ta + i * 0.3; q.quaternion.copy(stage.camera.quaternion); });
          const reg = ll(17.05, 78.5, 0), k = prog(ctx.t, ctx.start, ctx.end);
          shoot(stage, [reg.x + lerp(-20, 40, k), lerp(1050, 900, k), reg.z + lerp(820, 700, k)], [reg.x + 10, 0, reg.z - 60]);
          callout(ctx, "s1", P(16.86, 78.5, 2), "South · 201 km · proposed", prog(ctx.t, ts, ts + 0.4) * (1 - prog(ctx.t, ta - 0.2, ta)), 30, 120);
          ctx.O.chip("ap", "Alignment · Approvals · Funding ?", { alpha: prog(ctx.t, ta - 0.1, ta + 0.3) * (1 - prog(ctx.t, tr - 0.2, tr)), top: 300, kind: "big" });
          ctx.O.chip("fr", "రైతుల అభ్యంతరాలు", { alpha: prog(ctx.t, tr, tr + 0.3) * (1 - prog(ctx.t, tg - 0.2, tg)), top: 300, kind: "big warn" });
          ctx.O.chip("ln", "మ్యాప్ లో గీత ≠ రోడ్డు", { alpha: prog(ctx.t, tg, tg + 0.3), top: 300, kind: "big warn" });
        },
      };
    },
  },

  // ------------------------------------------------ s4b: connectivity — each radial highway lights up where the RRR crosses it
  links: {
    sounds: (ctx) => [...["Mumbai", "Nanded", "Nagpur", "Warangal", "Vijayawada", "Bengaluru"].map((w) => ({ t: A(ctx, w) - 0.08, s: "ding", gain: 0.3 })), { t: A(ctx, "interchanges") - 0.1, s: "shimmer", gain: 0.35 }],
    async build(stage) {
      const g = new THREE.Group();
      g.add(city({ seed: 28, lights: 32000 }));
      nightLights(g, { moonI: 0.4 });
      const orr = routeLine(ORR, 0xdfe6ff, { radius: 0.9, bright: 0.4, halo: 1.3, headSize: 0 }); g.add(orr.group);
      const n = routeLine(NORTH_PTS, 0x39d0ff, { radius: 1.4, bright: 0.8, halo: 1.6, headSize: 0 }); g.add(n.group);
      const s = dashedRoute(SOUTH_PTS, 0xffa53d, { r: 1.2, bright: 0.6 }); g.add(s.group);
      const C = [17.385, 78.4867];
      // [word, label, crossing lat/lon, far end]
      const HW = [
        ["Mumbai", "Mumbai · NH-65", [17.6247, 78.0866], [17.68, 77.85]],
        ["Nanded", "Nanded · NH-161", [17.6247, 78.0866], [17.95, 77.95]],
        ["Nagpur", "Nagpur · NH-44", [17.846, 78.48], [18.08, 78.44]],
        ["Warangal", "Warangal · NH-163", [17.511, 78.889], [17.64, 79.12]],
        ["Vijayawada", "Vijayawada · NH-65", [17.251, 78.898], [17.14, 79.12]],
        ["Bengaluru", "Bengaluru · NH-44", [17.07, 78.21], [16.82, 78.1]],
      ];
      const roads = HW.map(([, , x, far]) => { const r = routeLine([C, x, far], 0xffe2b0, { radius: 1.0, bright: 1.6, halo: 1.6, headSize: 6 }); g.add(r.group); return r; });
      const rings = HW.map(([, , x]) => { const m = new THREE.Mesh(new THREE.RingGeometry(6, 7.5, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe2b0).multiplyScalar(1.6), toneMapped: false, transparent: true, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; const p = P(x[0], x[1], 2.5); m.position.copy(p); g.add(m); return m; });
      return {
        group: g,
        update(ctx) {
          calm(stage);
          orr.draw(1); n.draw(1); s.draw(1);
          const tw = HW.map(([w]) => A(ctx, w)), ti = A(ctx, "interchanges");
          roads.forEach((r, i) => {
            r.draw(lin(ctx.t, tw[i] - 0.3, tw[i] + 0.6));
            const live = ctx.t > tw[i] - 0.3 && (i === roads.length - 1 ? ctx.t < ti : ctx.t < tw[i + 1] - 0.2);
            r.group.children[0].material.color.set(new THREE.Color(0xffe2b0).multiplyScalar(live || ctx.t > ti ? 1.6 : 0.5));
          });
          rings.forEach((m, i) => { const on = ctx.t > tw[i] + 0.3; const pulse = ctx.t > ti ? 1 + 0.25 * Math.sin(ctx.t * 6 + i) : 1; m.visible = on; m.scale.setScalar(pulse); });
          regionCam(stage, prog(ctx.t, ctx.start, ctx.end), { from: 1600, to: 1500 });
          HW.forEach(([, label, x], i) => {
            const next = i === HW.length - 1 ? ti : tw[i + 1];
            callout(ctx, "hw" + i, P(x[0], x[1], 2), label, prog(ctx.t, tw[i], tw[i] + 0.3) * (1 - prog(ctx.t, next - 0.2, next)), i % 2 ? -40 : 40, i < 3 ? -110 : 110);
          });
          ctx.O.chip("ix", "Highway కలిసే చోటే interchange", { alpha: prog(ctx.t, ti - 0.1, ti + 0.3), top: 300, kind: "big" });
        },
      };
    },
  },

  // ------------------------------------------------ s5: should you buy? — the interchange vs a plot that only sees the road
  question: {
    sounds: (ctx) => [{ t: A(ctx, "simple") - 0.1, s: "thud", gain: 0.4 }, { t: A(ctx, "access") - 0.1, s: "ding", gain: 0.35 }, { t: A(ctx, "interchange") - 0.1, s: "ding", gain: 0.35 }, { t: A(ctx, "దూరంలో") - 0.1, s: "glitch", gain: 0.35 }],
    async build(stage) {
      const g = new THREE.Group();
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: 0x0a0d0a, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; g.add(ground);
      const moon = nightLights(g, { moonI: 0.6 });
      const ic = await model("/assets/sf-interchange/model.glb", { length: 120 }); g.add(ic);
      const lamp = new THREE.PointLight(0xffc890, 900, 120, 1.6); lamp.position.set(0, 30, 0); g.add(lamp);
      const plotA = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x40ff90).multiplyScalar(0.6), transparent: true, opacity: 0.35, toneMapped: false })); plotA.rotation.x = -Math.PI / 2; plotA.position.set(75, 0.4, 25); g.add(plotA);
      const plotB = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5050).multiplyScalar(0.6), transparent: true, opacity: 0.35, toneMapped: false })); plotB.rotation.x = -Math.PI / 2; plotB.position.set(-150, 0.4, -140); g.add(plotB);
      const link = new THREE.Mesh(new THREE.BoxGeometry(30, 0.3, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x40ff90).multiplyScalar(1.2), toneMapped: false })); link.position.set(58, 0.5, 25); g.add(link);
      void moon;
      return {
        group: g,
        update(ctx) {
          calm(stage, { fog: 0.0025, hemiI: 0.25, exposure: 0.8 });
          const tac = A(ctx, "access"), ti = A(ctx, "interchange"), td = A(ctx, "దూరంలో");
          plotA.visible = link.visible = ctx.t > tac - 0.2; plotB.visible = ctx.t > td - 0.2;
          const k = prog(ctx.t, ctx.start, ctx.end);
          const ang = lerp(0.6, 2.2, k);
          shoot(stage, [Math.cos(ang) * 230, lerp(150, 200, k), Math.sin(ang) * 230], [-20, 0, -20]);
          ctx.O.chip("q", "RRR దగ్గర భూమి కొనాలా?", { alpha: prog(ctx.t, ctx.start + 0.2, ctx.start + 0.6) * (1 - prog(ctx.t, tac - 0.4, tac)), top: 300, kind: "big" });
          callout(ctx, "a", new THREE.Vector3(75, 2, 25), "Direct access ✓", prog(ctx.t, tac, tac + 0.3), 40, -140);
          callout(ctx, "i", new THREE.Vector3(0, 12, 0), "Interchange దగ్గర ✓", prog(ctx.t, ti, ti + 0.3), -60, -200);
          callout(ctx, "b", new THREE.Vector3(-150, 2, -140), "దూరంలో RRR కనిపిస్తుంది అంతే ✗", prog(ctx.t, td, td + 0.3), 30, -120);
        },
      };
    },
  },

  // ------------------------------------------------ s6: why Kokapet is Kokapet — FD, HITEC City, IT jobs, ORR
  kokapet: {
    sounds: (ctx) => [...["Financial", "HITEC", "IT", "ORR"].map((w) => ({ t: A(ctx, w) - 0.05, s: "tick", gain: 0.4 })), { t: A(ctx, "లేదు") - 0.05, s: "stamp", gain: 0.55 }],
    async build(stage) {
      const g = new THREE.Group();
      g.add(city({ buildings: 2600, seed: 25, lights: 50000 }));
      nightLights(g, { moonI: 0.5 });
      const orr = routeLine(ORR, 0xdfe6ff, { radius: 0.35, bright: 0.6, halo: 1.4, headSize: 0 }); g.add(orr.group);
      const spots = [["Financial District", 17.415, 78.34], ["HITEC City", 17.447, 78.376], ["Kokapet", 17.395, 78.335]];
      const pins = townPins(spots); g.add(pins.mesh);
      return {
        group: g,
        update(ctx) {
          calm(stage);
          const tf = A(ctx, "Financial"), th = A(ctx, "HITEC"), ti = A(ctx, "IT"), to = A(ctx, "ORR"), tl = A(ctx, "లేదు");
          orr.draw(1);
          orr.group.children[0].material.color.set(new THREE.Color(0xdfe6ff).multiplyScalar(ctx.t > to - 0.1 && ctx.t < to + 1.5 ? 1.4 : 0.5));
          pins.set(ctx.t, [tf, th, ctx.start + 0.2], 1.4);
          const c = P(17.42, 78.36, 0), k = prog(ctx.t, ctx.start, ctx.end);
          shoot(stage, [c.x + lerp(70, -50, k), lerp(110, 150, k), c.z + lerp(130, 160, k)], [c.x, 0, c.z]);
          callout(ctx, "f", P(17.415, 78.34, 3), "Financial District", prog(ctx.t, tf, tf + 0.3), -40, -150);
          callout(ctx, "h", P(17.447, 78.376, 3), "HITEC City", prog(ctx.t, th, th + 0.3), 40, -170);
          ctx.O.chip("it", "IT jobs · ORR · ఏళ్ళ అభివృద్ధి", { alpha: prog(ctx.t, ti, ti + 0.3) * (1 - prog(ctx.t, tl - 0.3, tl)), top: 300, kind: "big" });
          ctx.O.chip("no", "ప్రతి ఊరు ≠ Kokapet", { alpha: prog(ctx.t, tl - 0.1, tl + 0.3), top: 300, kind: "big warn" });
        },
      };
    },
  },

  // ------------------------------------------------ s7: the brochure trap — a billboard at night; brochure line vs official line
  trap: {
    sounds: (ctx) => [{ t: ctx.start + 0.1, s: "zaps", gain: 0.2 }, { t: A(ctx, "Brochure") - 0.1, s: "glitch", gain: 0.4 }, { t: A(ctx, "survey") - 0.1, s: "tick", gain: 0.4 }, { t: A(ctx, "connect") - 0.1, s: "thud", gain: 0.5 }],
    async build(stage) {
      const g = new THREE.Group();
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x0b0d09, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; g.add(ground);
      nightLights(g, { moonI: 0.4 });
      const bb = await model("/assets/sf-billboard/model.glb", { height: 26 }); g.add(bb);
      const box = new THREE.Box3().setFromObject(bb), sz = box.getSize(new THREE.Vector3());
      const face = card([{ text: "RRR FACING PLOTS!", size: 150, color: "#ffd166" }, { text: "Limited offer 🔥 Rates double!", size: 90 }], { w: Math.max(sz.x, sz.z) * 0.92, h: sz.y * 0.42, bg: "#7a0c18", glow: 0.9 });
      face.position.set(box.getCenter(new THREE.Vector3()).x, box.max.y - sz.y * 0.26, box.max.z + 0.2); g.add(face);
      const flood = new THREE.SpotLight(0xffe0b0, 600, 80, 0.6, 0.6, 1.5); flood.position.set(0, 4, 25); flood.target = face; g.add(flood);
      // brochure line vs official line on the ground
      const mk = (pts, col) => { const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0.4, z))); const m = new THREE.Mesh(new THREE.TubeGeometry(c, 60, 0.25, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.0), toneMapped: false })); g.add(m); return m; };
      const brochure = mk([[-60, 30], [-20, 24], [20, 26], [60, 32]], 0xff5050);
      const official = mk([[-60, 70], [-20, 62], [20, 66], [60, 74]], 0x39d0ff);
      const roller = await model("/assets/sf-roller/model.glb", { length: 12 }); roller.position.set(28, 0, 66); g.add(roller);
      return {
        group: g,
        update(ctx) {
          calm(stage, { fog: 0.004, hemiI: 0.22, exposure: 0.85 });
          const tb = A(ctx, "Brochure"), ts = A(ctx, "survey"), tc = A(ctx, "connect"), tk = A(ctx, "కోట్లలో");
          face.material.color.setScalar(0.75 + 0.25 * (Math.floor(ctx.t * 3) % 2));
          brochure.visible = ctx.t > tb - 0.2; official.visible = ctx.t > tb + 1.0;
          const a = prog(ctx.t, ctx.start, tb), b = prog(ctx.t, tb, ctx.end);
          const pos = mix3(mix3([28, 14, 55], [10, 45, 120], a), [0, 70, 150], b), look = mix3(mix3([0, 16, 0], [0, 6, 35], a), [0, 4, 40], b);
          shoot(stage, pos, look);
          callout(ctx, "br", new THREE.Vector3(-30, 1, 24), "Brochure లో గీత", prog(ctx.t, tb, tb + 0.3), -20, 120);
          callout(ctx, "of", new THREE.Vector3(30, 1, 66), "Official alignment", prog(ctx.t, tb + 1.0, tb + 1.3), 30, 120);
          ctx.O.chip("ck", "Survey no. · Official alignment · Access ✓", { alpha: prog(ctx.t, ts - 0.2, ts + 0.2) * (1 - prog(ctx.t, tc - 0.4, tc)), top: 1500, kind: "big" });
          ctx.O.chip("cn", "దగ్గర ఉండటం ≠ connect అవ్వడం", { alpha: prog(ctx.t, tc - 0.2, tc + 0.2), top: 1500, kind: "big warn" });
          void tk;
        },
      };
    },
  },

  // ------------------------------------------------ s8: the bigger picture — Hyderabad's next growth map
  bigger: {
    sounds: (ctx) => [{ t: ctx.start, s: "shimmer", gain: 0.3 }, { t: A(ctx, "guaranteed") - 0.1, s: "thud", gain: 0.45 }],
    async build(stage) {
      const g = new THREE.Group();
      g.add(city({ seed: 26, lights: 45000 }));
      nightLights(g, { moonI: 0.45 });
      const orr = routeLine(ORR, 0xdfe6ff, { radius: 0.9, bright: 0.8, halo: 1.6, headSize: 0 }); g.add(orr.group);
      const n = routeLine(NORTH_PTS, 0x39d0ff, { radius: 1.5, bright: 1.3, halo: 1.8, headSize: 0 }); g.add(n.group);
      const s = dashedRoute(SOUTH_PTS, 0xffa53d, { r: 1.3, bright: 1.0 }); g.add(s.group);
      return {
        group: g,
        update(ctx) {
          calm(stage);
          orr.draw(1); n.draw(1); s.draw(1);
          const k = prog(ctx.t, ctx.start, ctx.end), c = ll(17.33, 78.5, 0), a = lerp(-0.35, 0.35, k);
          shoot(stage, [c.x + Math.sin(a) * 1500, 1250, c.z + Math.cos(a) * 1500 * 0.75], [c.x, 0, c.z]);
          const tg = A(ctx, "guaranteed");
          ctx.O.chip("gm", "Hyderabad next growth map", { alpha: prog(ctx.t, ctx.start + 0.3, ctx.start + 0.7) * (1 - prog(ctx.t, tg - 0.6, tg - 0.2)), top: 300, kind: "big" });
          ctx.O.chip("gp", "Potential ≠ Guaranteed profit", { alpha: prog(ctx.t, tg - 0.2, tg + 0.2), top: 300, kind: "big warn" });
        },
      };
    },
  },

  // ------------------------------------------------ s9: is your village near the RRR? — comment
  finale: {
    sounds: (ctx) => [{ t: A(ctx, "Comment") - 0.2, s: "chime", gain: 0.45 }],
    async build(stage) {
      const g = new THREE.Group();
      g.add(city({ seed: 27, lights: 45000 }));
      nightLights(g, { moonI: 0.45 });
      const orr = routeLine(ORR, 0xdfe6ff, { radius: 0.9, bright: 0.7, halo: 1.6, headSize: 0 }); g.add(orr.group);
      const n = routeLine(NORTH_PTS, 0x39d0ff, { radius: 1.5, bright: 1.4, halo: 1.8, headSize: 0 }); g.add(n.group);
      const s = dashedRoute(SOUTH_PTS, 0xffa53d, { r: 1.3, bright: 1.1 }); g.add(s.group);
      const pins = townPins(NORTH); g.add(pins.mesh);
      return {
        group: g,
        update(ctx) {
          calm(stage);
          orr.draw(1); n.draw(1); s.draw(1);
          pins.set(ctx.t, NORTH.map((_, i) => ctx.start + 0.2 + i * 0.25), 6);
          regionCam(stage, prog(ctx.t, ctx.start, ctx.end), { from: 1500, to: 1700 });
          NORTH.forEach(([nm, la, lo], i) => callout(ctx, "f" + i, P(la, lo, 2), nm, prog(ctx.t, ctx.start + 0.2 + i * 0.25, ctx.start + 0.5 + i * 0.25), 20, -70));
          ctx.O.chip("cm", "మీ ఊరు RRR దగ్గర ఉందా? Comment 👇", { alpha: prog(ctx.t, A(ctx, "Comment") - 0.5, A(ctx, "Comment")), top: 1560, kind: "big" });
        },
      };
    },
  },
};
