// Hyderabad Metro Phase 2: five new routes on a night-lit 3D Hyderabad.
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
function viaduct(curve, { h = 9, every = 4.2, deckW = 4.4, rise = 1 } = {}) {
  const g = new THREE.Group();
  const len = curve.getLength();
  const nP = Math.floor(len / every), nD = Math.floor(len / 1.4);
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.75 });
  const pillar = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.75, 0.9, 1, 20).translate(0, 0.5, 0), concrete, nP);
  const cap = new THREE.InstancedMesh(new THREE.BoxGeometry(deckW * 0.95, 1.1, 1.8), concrete, nP);
  const deck = new THREE.InstancedMesh(new THREE.BoxGeometry(deckW, 0.9, 1.5), concrete, nD);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const pillars = [];
  for (let i = 0; i < nP; i++) {
    const u = (i + 0.5) / nP;
    const p = curve.getPointAt(u), t = curve.getTangentAt(u);
    q.setFromAxisAngle(up, Math.atan2(t.x, t.z));
    pillars.push({ p, q: q.clone(), u });
    m4.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(1, h * rise, 1));
    pillar.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(p.x, h * rise - 0.55, p.z), q, new THREE.Vector3(1, 1, 1));
    cap.setMatrixAt(i, m4);
  }
  const decks = [];
  for (let i = 0; i < nD; i++) {
    const u = (i + 0.5) / nD;
    const p = curve.getPointAt(u), t = curve.getTangentAt(u);
    q.setFromAxisAngle(up, Math.atan2(t.x, t.z));
    decks.push({ p, q: q.clone(), u });
    m4.compose(new THREE.Vector3(p.x, h + 0.45, p.z), q, new THREE.Vector3(1, 1, 1));
    deck.setMatrixAt(i, m4);
  }
  for (const m of [pillar, cap, deck]) { m.castShadow = m.receiveShadow = true; g.add(m); }
  // edge lights: two thin blue lines along the deck
  const edges = [];
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 200; i++) {
      const u = i / 200, p = curve.getPointAt(u), t = curve.getTangentAt(u);
      const n = new THREE.Vector3(t.z, 0, -t.x).normalize().multiplyScalar(side * deckW * 0.5);
      pts.push(new THREE.Vector3(p.x + n.x, h + 0.92, p.z + n.z));
    }
    const e = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 0.05, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4fb8ff).multiplyScalar(2.5), toneMapped: false }));
    edges.push(e);
    g.add(e);
  }
  return { group: g, pillar, cap, deck, pillars, decks, edges, h, m4, len };
}

/** A night road under the viaduct: wet asphalt, lamps, and car light streaks. update(t). */
function streetSet(curve, { seed = 3, lamps = 60, cars = 140, keepOut = null } = {}) {
  const g = new THREE.Group();
  const r = rand(seed);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x0e1116, roughness: 0.28, metalness: 0.35 }));
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  g.add(road);
  const F = glowField(lamps * 2 + cars * 2 + 3000);
  const lampPts = [];
  for (let i = 0; i < lamps; i++) {
    const u = i / lamps, p = curve.getPointAt(u), t = curve.getTangentAt(u);
    for (const side of [-1, 1]) {
      const n = new THREE.Vector3(t.z, 0, -t.x).normalize().multiplyScalar(side * 9);
      lampPts.push(new THREE.Vector3(p.x + n.x, 6.5, p.z + n.z));
    }
  }
  // the city beyond: distant windows and lights on a backdrop of low blocks
  const far = [];
  for (let i = 0; i < 3000; i++) {
    const a = r() * Math.PI * 2, d = 60 + r() * 380;
    far.push([Math.cos(a) * d, r() < 0.7 ? 0.3 : r() * 18, Math.sin(a) * d, 0.3 + r() * 0.9, r()]);
  }
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x0d1118, roughness: 0.6, metalness: 0.3, emissive: 0xffffff, emissiveMap: cityCache.win || (cityCache.win = windowsTex()), emissiveIntensity: 1.1 }), 420);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  const route = curve.getSpacedPoints(160);
  const clear = (x, z, w) => route.every((p) => Math.hypot(p.x - x, p.z - z) > 16 + w) && (!keepOut || Math.hypot(x - keepOut[0], z - keepOut[1]) > keepOut[2] + w);
  for (let i = 0; i < 420; i++) {
    let a, d, w;
    do { a = r() * Math.PI * 2; d = 26 + r() * 300; w = 4 + r() * 10; } while (!clear(Math.cos(a) * d, Math.sin(a) * d, w));
    m4.compose(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 3), new THREE.Vector3(w, 4 + r() * (d < 90 ? 26 : 50), w));
    blocks.setMatrixAt(i, m4);
  }
  blocks.castShadow = true;
  g.add(blocks, F.mesh);
  return {
    group: g,
    update(t) {
      let i = 0;
      for (const p of lampPts) F.set(i++, p.x, p.y, p.z, 0.26, 0.9, 0.56, 0.28);
      for (let k = 0; k < cars; k++) {
        const dir = k % 2 ? 1 : -1, lane = (k % 4 < 2 ? 2.4 : 4.6) * dir;
        const u = (((k * 0.6180339) % 1) + dir * t * 0.018 + 10) % 1;
        const p = curve.getPointAt(u), tg = curve.getTangentAt(u);
        const n = new THREE.Vector3(tg.z, 0, -tg.x).normalize().multiplyScalar(lane);
        const col = dir > 0 ? [2.2, 1.9, 1.5] : [2.0, 0.25, 0.15];
        F.set(i++, p.x + n.x, 0.6, p.z + n.z, 0.26, ...col);
        F.set(i++, p.x + n.x + tg.x * 0.9 * dir, 0.6, p.z + n.z + tg.z * 0.9 * dir, 0.2, col[0] * 0.5, col[1] * 0.5, col[2] * 0.5);
      }
      for (const [x, y, z, s, tw] of far) F.set(i++, x, y, z, s, 1.1 * (0.6 + tw * 0.6), 0.7 * (0.6 + tw * 0.5), 0.4, 0);
      F.commit();
    },
  };
}

/** Put a train on a curve at u (0..1), nose forward, sitting on the deck. */
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
// shows the same site at a later stage. Pier 5 is the one the camera watches being built.
const PIER_H = 10;
function siteCurve() {
  const pts = [];
  for (let i = 0; i <= 22; i++) pts.push(new THREE.Vector3(i * 6 - 66, 0, 0));
  return new THREE.CatmullRomCurve3(pts);
}
const CONCRETE = () => new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.75 });
const STEEL_Y = () => new THREE.MeshStandardMaterial({ color: 0xf2b21b, roughness: 0.5, metalness: 0.4 });

/** Shared bones: road, lamps, traffic, pillars/caps/deck instanced, crane in the distance. */
async function siteBase(stage, { soil = false, seed = 6 } = {}) {
  const g = new THREE.Group();
  const curve = siteCurve();
  const v = viaduct(curve, { h: PIER_H, every: 12 });
  const st = streetSet(curve, { seed, cars: 110 });
  if (soil) st.group.children[0].visible = false; // the road plane; the cutaway draws its own ground
  g.add(st.group, v.group);
  nightLights(g, { moonI: 0.7 });
  const flood = new THREE.SpotLight(0xffd9a0, 600, 140, 0.75, 0.5, 1.4);
  flood.position.set(10, 34, 34);
  flood.target.position.set(0, 4, 0);
  flood.castShadow = true;
  g.add(flood, flood.target);
  const crane = await model("/assets/sf-crane/model.glb", { height: 46 });
  crane.position.set(34, 0, -26);
  g.add(crane);
  return { g, curve, v, st, crane };
}

/** Set how much of the viaduct exists: pillars up to `nPier` (+ partial), decks up to `nDeck`. */
function siteState(v, { piers = 0, pierK = 1, active = -1, decks = 0 } = {}) {
  v.pillars.forEach((p, i) => {
    const k = i < piers ? 1 : i === active ? pierK : 0;
    v.m4.compose(new THREE.Vector3(p.p.x, 0, p.p.z), p.q, new THREE.Vector3(1, Math.max(0.001, PIER_H * k), 1));
    v.pillar.setMatrixAt(i, v.m4);
    const ck = i < piers ? 1 : 0;
    v.m4.compose(new THREE.Vector3(p.p.x, PIER_H - 0.55, p.p.z), p.q, new THREE.Vector3(Math.max(0.001, ck), Math.max(0.001, ck), Math.max(0.001, ck)));
    v.cap.setMatrixAt(i, v.m4);
  });
  v.pillar.instanceMatrix.needsUpdate = v.cap.instanceMatrix.needsUpdate = true;
  v.deck.count = Math.max(0, Math.min(v.decks.length, decks));
  for (const e of v.edges) e.visible = decks >= v.decks.length;
}

let soilT;
function soilTex() {
  if (soilT) return soilT;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const g = cv.getContext("2d", { willReadFrequently: true });
  g.fillStyle = "#c8c8c8";
  g.fillRect(0, 0, 256, 256);
  const r = rand(44);
  for (let i = 0; i < 2600; i++) {
    const v = 120 + Math.floor(r() * 135);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath();
    g.ellipse(r() * 256, r() * 256, 1 + r() * 4, 1 + r() * 2.5, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  soilT = bakeTexture(cv);
  soilT.wrapS = soilT.wrapT = THREE.RepeatWrapping;
  soilT.repeat.set(14, 2);
  return soilT;
}

/** The soil in section: the ground cut open along the line, so piles can be seen going down. */
function soilSection() {
  const g = new THREE.Group();
  const layers = [[0, 1, 0x1c1e22], [1, 4.5, 0x6b3b22], [5.5, 5, 0x8a6a45], [10.5, 9, 0x56585e]];
  for (const [top, th, col] of layers) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(170, th, 60), new THREE.MeshStandardMaterial({ color: col, roughness: 0.95, map: soilTex() }));
    m.position.set(0, -top - th / 2, -31.7); // cut face just behind the piles, so their section shows
    m.receiveShadow = true;
    g.add(m);
  }
  // a thin lit edge where the section is cut, so the face reads
  const edge = new THREE.Mesh(new THREE.BoxGeometry(170, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd9a0).multiplyScalar(1.5), toneMapped: false }));
  edge.position.set(0, 0.02, 0.02);
  g.add(edge);
  return g;
}

/** A pile in section: a half-cylinder hole, a steel cage, and concrete rising inside it. */
function pileSection(x, depth = 17) {
  const g = new THREE.Group();
  const half = (r, col, opts = {}) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 28, 1, true, Math.PI / 2, Math.PI).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: col, roughness: 0.9, side: THREE.DoubleSide, ...opts }));
  const hole = half(1.6, 0x120d0a);
  const conc = half(1.58, 0xa8a8a2);
  const cage = new THREE.Group();
  const bars = [];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI / 2 + (i / 8) * Math.PI;
    bars.push(Math.sin(a) * 1.3, 0, Math.cos(a) * 1.3, Math.sin(a) * 1.3, -depth, Math.cos(a) * 1.3);
  }
  for (let y = 0; y > -depth; y -= 1.2) for (let i = 0; i < 8; i++) {
    const a1 = Math.PI / 2 + (i / 8) * Math.PI, a2 = Math.PI / 2 + ((i + 1) / 8) * Math.PI;
    bars.push(Math.sin(a1) * 1.3, y, Math.cos(a1) * 1.3, Math.sin(a2) * 1.3, y, Math.cos(a2) * 1.3);
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute("position", new THREE.Float32BufferAttribute(bars, 3));
  cage.add(new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: 0xff9a4d })));
  g.add(hole, conc, cage);
  g.position.set(x, 0, 0);
  return {
    group: g,
    /** dig, cage, pour: each 0..1 */
    set(dig, cg, pour) {
      hole.scale.y = Math.max(0.001, depth * dig);
      hole.visible = dig > 0;
      cage.visible = cg > 0;
      cage.position.y = (1 - cg) * (depth + 2);
      conc.visible = pour > 0;
      conc.scale.y = Math.max(0.001, depth * pour);
      conc.position.y = -depth * (1 - pour);
    },
  };
}

/** A piling rig: tracked base, tall yellow mast, a spinning auger on a kelly bar. */
function pilingRig() {
  const g = new THREE.Group();
  const y = STEEL_Y();
  const base = new THREE.Mesh(new THREE.BoxGeometry(5, 1.6, 3.4), new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.7 }));
  base.position.set(0, 0.8, -3.2);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 2.8), y);
  cab.position.set(-0.6, 2.8, -3.2);
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.7, 22, 0.7), y);
  mast.position.set(0, 12, -1.2);
  const kelly = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 24, 10).translate(0, 12, 0), new THREE.MeshStandardMaterial({ color: 0x777b82, metalness: 0.8, roughness: 0.3 }));
  const auger = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.6, 2.4, 12, 6), new THREE.MeshStandardMaterial({ color: 0x8c9096, metalness: 0.8, roughness: 0.35, flatShading: true }));
  auger.position.y = -1.2;
  const tool = new THREE.Group();
  tool.add(kelly, auger);
  const beacon = glowField(1);
  for (const m of [base, cab, mast]) m.castShadow = true;
  g.add(base, cab, mast, tool, beacon.mesh);
  return {
    group: g,
    update(depth, t) {
      tool.position.y = -depth;
      tool.rotation.y = t * 9;
      const b = Math.sin(t * 6) > 0 ? 1 : 0.2;
      const p = new THREE.Vector3(0, 23.2, -1.2).applyMatrix4(g.matrixWorld);
      beacon.set(0, p.x, p.y, p.z, 1.1 * b, 2.6 * b, 1.4 * b, 0.2);
      beacon.commit();
    },
  };
}

/** Steel formwork that a pillar is cast inside; it rises with the concrete, then lifts away. */
function formwork() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 1, 20, 1, true).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xe8792c, roughness: 0.55, metalness: 0.3, side: THREE.DoubleSide }));
  m.castShadow = true;
  return m;
}

/** A launching girder over one span: twin yellow trusses on the pier caps, a winch trolley. */
function launchingGirder(x0, x1) {
  const g = new THREE.Group();
  const y = STEEL_Y();
  const len = x1 - x0 + 8;
  for (const z of [-2.6, 2.6]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(len, 1.6, 0.6), y);
    beam.position.set((x0 + x1) / 2, PIER_H + 4.2, z);
    beam.castShadow = true;
    g.add(beam);
    for (let i = 0; i <= 12; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.62), y);
      post.position.set(x0 - 4 + (len / 12) * i, PIER_H + 4.2, z);
      post.rotation.z = i % 2 ? 0.6 : -0.6;
      g.add(post);
    }
  }
  for (const x of [x0, x1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.4, 6), y);
    leg.position.set(x, PIER_H + 1.8, 0);
    g.add(leg);
  }
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 6.2), new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.6 }));
  trolley.position.y = PIER_H + 5.4;
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: 0x1e1e1e }));
  g.add(trolley, cable);
  return { group: g, trolley, cable };
}

/** A low-bed trailer with its tractor; carries a segment. */
function trailer() {
  const g = new THREE.Group();
  const cabM = new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.4, metalness: 0.3 });
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 2.8), cabM);
  cab.position.set(7.5, 1.9, 0);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 2.8), new THREE.MeshStandardMaterial({ color: 0x2a2c30 }));
  bed.position.set(0, 1.0, 0);
  for (const m of [cab, bed]) { m.castShadow = true; g.add(m); }
  const lights = glowField(4);
  g.add(lights.mesh);
  return {
    group: g,
    update() {
      g.updateMatrixWorld();
      [[9, 1.4, -1.1, [2.2, 2.0, 1.6]], [9, 1.4, 1.1, [2.2, 2.0, 1.6]], [-6, 1.2, -1.1, [2, 0.2, 0.1]], [-6, 1.2, 1.1, [2, 0.2, 0.1]]].forEach(([x, y, z, c], i) => {
        const p = new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld);
        lights.set(i, p.x, p.y, p.z, 0.5, ...c);
      });
      lights.commit();
    },
  };
}

const segMat = () => new THREE.MeshStandardMaterial({ color: 0xb0b0aa, roughness: 0.7 });
const PX = (v, i) => v.pillars[i].p.x;

const constructionScenes = {
  // ------------------------------------------------ piles: drill, steel cage, concrete
  piles: {
    sounds: (ctx) => [
      { t: ctx.start, s: "city", gain: 0.25 },
      { t: ctx.at("drill") - 0.6, s: "crane", gain: 0.55 },
      { t: ctx.at("drill") + 1.6, s: "crane", gain: 0.45 },
      { t: ctx.at("steel") - 0.1, s: "clunk", gain: 0.45 },
      { t: ctx.at("concrete") - 0.1, s: "underwater", gain: 0.25 },
    ],
    async build(stage) {
      const s = await siteBase(stage, { soil: true });
      s.g.add(soilSection());
      const A = 5;
      const piles = [];
      s.v.pillars.forEach((p, i) => { for (const dx of [-2.2, 2.2]) { const ps = pileSection(p.p.x + dx); piles.push({ i, ps }); s.g.add(ps.group); } });
      const rig = pilingRig();
      rig.group.position.set(PX(s.v, A) - 2.2, 0, 0);
      s.g.add(rig.group);
      return {
        group: s.g,
        update(ctx) {
          setStage(stage, { bg: 0x070b16, fog: 0.0035, hemiI: 0.28, bloom: { strength: 0.6, radius: 0.5, threshold: 0.88 } });
          // no street lights here: the road is cut away, and lamps would hang over nothing
          siteState(s.v, { piers: 0, decks: 0 });
          const tD = ctx.at("drill"), tS = ctx.at("steel"), tC = ctx.at("concrete"), tP = ctx.at("piles");
          const dig = prog(ctx.t, tD - 0.6, tS - 0.3, (x) => x), cg = prog(ctx.t, tS - 0.2, tC - 0.3), pour = prog(ctx.t, tC - 0.1, tP, (x) => x);
          piles.forEach(({ i, ps }, j) => {
            if (i < A) ps.set(1, 1, 1);
            else if (i === A && j % 2 === 0) ps.set(dig, cg, pour);
            else if (i === A) ps.set(1, 1, 1);
            else ps.set(0, 0, 0);
          });
          rig.update(dig * 17 * (1 - cg), ctx.t); // the auger comes back up before the cage goes in
          rig.group.visible = pour < 0.98;
          // camera: in the cutaway, level with the hole; rise out at "piles"
          const up = prog(ctx.t, tP - 0.8, ctx.end, (x) => 1 - Math.pow(1 - x, 2));
          const x = PX(s.v, A);
          shoot(stage, mix3([x + 3, -5, 19], [x - 10, 22, 58], up), mix3([x - 2.2, -8, 0], [x - 14, -4, 0], up));
          stage.dof(null);
          callout(ctx, "pl", new THREE.Vector3(x - 2.2, -9, 0.5), "Pile · 15-20 m deep", prog(ctx.t, tP - 0.4, tP + 0.2) * (1 - up * 0.6), -70, -60);
          callout(ctx, "cg", new THREE.Vector3(x - 2.2, -4, 0.5), "Steel cage", prog(ctx.t, tS - 0.1, tS + 0.3) * (1 - prog(ctx.t, tC, tC + 0.4)), 70, -80);
        },
      };
    },
  },

  // ------------------------------------------------ pier: the pillar is cast in formwork, then the T-shaped cap
  pier: {
    sounds: (ctx) => [{ t: ctx.start, s: "city", gain: 0.25 }, { t: ctx.at("pillars") - 0.1, s: "riser", gain: 0.3 }, { t: ctx.at("pier") - 0.05, s: "clunk", gain: 0.6 }, { t: ctx.at("బరువు") - 0.1, s: "thud", gain: 0.45 }],
    async build(stage) {
      const s = await siteBase(stage);
      const A = 5;
      const fw = formwork();
      fw.position.set(PX(s.v, A), 0, 0);
      s.g.add(fw);
      const tcap = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 5.6), CONCRETE());
      tcap.castShadow = true;
      s.g.add(tcap);
      const arrows = glowField(6);
      s.g.add(arrows.mesh);
      return {
        group: s.g,
        update(ctx) {
          setStage(stage, { bg: 0x070b16, fog: 0.0035, hemiI: 0.3, bloom: { strength: 0.6, radius: 0.5, threshold: 0.88 } });
          s.st.update(ctx.t);
          const tPl = ctx.at("pillars"), tPc = ctx.at("pier"), tW = ctx.at("బరువు");
          const rise = prog(ctx.t, ctx.start + 0.2, tPc - 0.4, (x) => x);
          siteState(s.v, { piers: A, active: A, pierK: rise });
          const x = PX(s.v, A);
          fw.scale.set(1, Math.max(0.001, PIER_H * Math.min(1, rise + 0.08)), 1);
          fw.position.y = prog(ctx.t, tPc - 0.5, tPc, (x2) => x2) * 14;
          fw.visible = fw.position.y < 13;
          const capK = prog(ctx.t, tPc - 0.2, tPc + 0.5, outE);
          tcap.position.set(x, PIER_H + 0.7 + (1 - capK) * 6, 0);
          tcap.visible = capK > 0;
          const w = prog(ctx.t, tW - 0.3, tW + 0.3) * (1 - prog(ctx.t, ctx.end - 0.6, ctx.end));
          for (let i = 0; i < 6; i++) {
            const z = -2.4 + (i % 3) * 2.4, yy = PIER_H + 6 - ((ctx.t * 4 + i * 0.37) % 1) * 4;
            arrows.set(i, x, yy, z, 0.9 * w, 2.2 * w, 1.6 * w, 0.6 * w);
          }
          arrows.commit();
          const k = prog(ctx.t, ctx.start, ctx.end, (x2) => x2);
          shoot(stage, [x + 22 - k * 8, 4 + k * 10, 26 - k * 4], [x, 4 + k * 5, 0]);
          stage.dof({ focus: 32, aperture: 0.0004, maxblur: 0.004 });
          callout(ctx, "tc", new THREE.Vector3(x, PIER_H + 1.4, 2.8), "Pier cap (T shape)", prog(ctx.t, tPc + 0.2, tPc + 0.6), 70, -120);
        },
      };
    },
  },

  // ------------------------------------------------ segments: trailer, launching girder, glue, steel cables
  segments: {
    sounds: (ctx) => [
      { t: ctx.start, s: "city", gain: 0.3 },
      { t: ctx.at("trailers") - 0.6, s: "metro", gain: 0.25 },
      { t: ctx.at("Launching") - 0.2, s: "crane", gain: 0.6 },
      { t: ctx.at("glue") - 0.1, s: "clunk", gain: 0.55 },
      { t: ctx.at("గట్టిగా") - 0.1, s: "clunk", gain: 0.7 },
    ],
    async build(stage) {
      const s = await siteBase(stage);
      const A = 5;
      const x0 = PX(s.v, A), x1 = PX(s.v, A + 1);
      const lg = launchingGirder(x0, x1);
      s.g.add(lg.group);
      const tr = trailer();
      s.g.add(tr.group);
      const N = 7, segL = (x1 - x0 - 0.4) / N;
      const segs = [];
      for (let i = 0; i < N; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(segL - 0.06, 0.9, 4.4), segMat());
        m.castShadow = m.receiveShadow = true;
        segs.push(m);
        s.g.add(m);
      }
      const carried = new THREE.Mesh(new THREE.BoxGeometry(segL - 0.06, 0.9, 4.4), segMat());
      carried.castShadow = true;
      s.g.add(carried);
      // the joints and the post-tensioning tendons
      const seams = glowField(N + 1);
      const tendons = [];
      for (const z of [-1.4, -0.5, 0.5, 1.4]) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a3d).multiplyScalar(2.4), toneMapped: false }));
        t.position.set((x0 + x1) / 2, PIER_H + 0.3, z);
        tendons.push(t);
        s.g.add(t);
      }
      s.g.add(seams.mesh);
      const deckBefore = s.v.decks.filter((d) => d.p.x < x0).length;
      return {
        group: s.g,
        update(ctx) {
          setStage(stage, { bg: 0x070b16, fog: 0.0035, hemiI: 0.3, bloom: { strength: 0.7, radius: 0.5, threshold: 0.85 } });
          s.st.update(ctx.t);
          siteState(s.v, { piers: s.v.pillars.length, decks: deckBefore });
          const tT = ctx.at("trailers"), tL = ctx.at("Launching"), tG = ctx.at("glue"), tS = ctx.at("గట్టిగా");
          // trailer drives in under the span
          const kt = prog(ctx.t, tT - 1.2, tL - 0.2, (x) => 1 - Math.pow(1 - x, 2));
          tr.group.position.set((x0 + x1) / 2 + 70 * (1 - kt), 0, 6.5);
          tr.update();
          // segments lifted one by one from the trailer to the span
          const kl = prog(ctx.t, tL - 0.2, tG - 0.1, (x) => x) * N;
          const placed = Math.floor(kl), f = kl - placed;
          segs.forEach((m, i) => {
            m.visible = i < placed;
            m.position.set(x0 + 0.2 + segL * (i + 0.5), PIER_H + 0.45, 0);
          });
          const cur = Math.min(N - 1, placed);
          const target = new THREE.Vector3(x0 + 0.2 + segL * (cur + 0.5), PIER_H + 0.45, 0);
          const from = new THREE.Vector3(tr.group.position.x, 1.7, 6.5);
          const lift = smooth(f / 0.5), slide = smooth((f - 0.5) / 0.5);
          const cp = new THREE.Vector3(from.x + (target.x - from.x) * slide, 1.7 + lift * (PIER_H + 2.5 - 1.7) - slide * 2.0, from.z + (target.z - from.z) * slide);
          const carrying = ctx.t > tL - 0.2 && placed < N;
          carried.visible = carrying || kt < 0.99 || placed === 0;
          carried.position.copy(carrying ? cp : from);
          lg.trolley.position.x = carried.position.x;
          lg.cable.position.set(carried.position.x, PIER_H + 5.1, carried.position.z);
          lg.cable.scale.y = Math.max(0.01, PIER_H + 5.1 - carried.position.y - 0.45);
          lg.cable.visible = carrying;
          // glue: each seam flashes cyan; cables: tendons glow orange and tighten
          const gk = prog(ctx.t, tG - 0.1, tG + 0.8);
          for (let i = 0; i <= N; i++) {
            const a = gk * Math.max(0, 1 - Math.abs(gk * (N + 1) - i - 0.5));
            seams.set(i, x0 + 0.2 + segL * i, PIER_H + 0.95, 0, 2.2 * a, 0.4 * a, 2.2 * a, 2.4 * a);
          }
          seams.commit();
          const tk = prog(ctx.t, tS - 0.6, tS + 0.4);
          tendons.forEach((t) => { t.visible = tk > 0; t.scale.x = Math.max(0.001, tk); t.position.x = x0 + (x1 - x0) * tk / 2; t.material.color.setScalar(0).add(new THREE.Color(0xff8a3d).multiplyScalar(1 + 2.2 * tk)); });
          // camera: wide on the trailer, then up beside the girder
          const k2 = prog(ctx.t, tL - 0.8, tL + 0.6);
          const mx = (x0 + x1) / 2;
          shoot(stage, mix3([mx + 30, 6, 34], [mx + 8, PIER_H + 6, 20], k2), mix3([mx + 8, 3, 4], [mx - 1, PIER_H + 1, 0], k2));
          stage.dof({ focus: 24, aperture: 0.0004, maxblur: 0.004 });
          callout(ctx, "lg", new THREE.Vector3(mx, PIER_H + 5, -2.6), "Launching girder", prog(ctx.t, tL, tL + 0.4) * (1 - prog(ctx.t, tG - 0.3, tG)), -60, -140);
          callout(ctx, "td", new THREE.Vector3(mx, PIER_H + 0.3, 1.4), "Steel cables", prog(ctx.t, tS - 0.2, tS + 0.2), 60, 120);
        },
      };
    },
  },

  // ------------------------------------------------ track: rails, 25 kV line, signals, trial run
  track: {
    sounds: (ctx) => [
      { t: ctx.start, s: "city", gain: 0.25 },
      { t: ctx.at("rails") - 0.1, s: "clicks", gain: 0.4 },
      { t: ctx.at("volts") - 0.2, s: "zaps", gain: 0.4 },
      { t: ctx.at("signals") - 0.05, s: "beep", gain: 0.45 },
      { t: ctx.at("Trial") - 0.6, s: "metro", gain: 0.65 },
      { t: ctx.at("passengers") - 0.1, s: "chime", gain: 0.5 },
    ],
    async build(stage) {
      const s = await siteBase(stage);
      const len = 132;
      const rails = [-0.75, 0.75].map((z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.14, 0.12), new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.9, roughness: 0.25 }));
        m.position.set(0, PIER_H + 1.0, z);
        s.g.add(m);
        return m;
      });
      const nM = 22;
      const masts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 5, 0.18).translate(0, 2.5, 0), new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 0.6, roughness: 0.4 }), nM);
      const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 2.4), new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 0.6 }), nM);
      s.g.add(masts, arms);
      const wire = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fd4ff).multiplyScalar(1.6), toneMapped: false }));
      wire.position.set(0, PIER_H + 5.2, 0);
      s.g.add(wire);
      const spark = glowField(3);
      const sig = glowField(8);
      s.g.add(spark.mesh, sig.mesh);
      const train = await model("/assets/sf-metro/model.glb", { length: 34, glass: 1.3 });
      s.g.add(train);
      const m4 = new THREE.Matrix4();
      return {
        group: s.g,
        update(ctx) {
          setStage(stage, { bg: 0x070b16, fog: 0.0035, hemiI: 0.28, bloom: { strength: 0.75, radius: 0.5, threshold: 0.85 } });
          s.st.update(ctx.t);
          siteState(s.v, { piers: s.v.pillars.length, decks: s.v.decks.length });
          const tR = ctx.at("rails"), tV = ctx.at("volts"), tSg = ctx.at("signals"), tTr = ctx.at("Trial"), tPs = ctx.at("passengers");
          const kr = prog(ctx.t, tR - 0.3, tV - 0.4, (x) => x);
          rails.forEach((r) => { r.scale.x = Math.max(0.001, len * kr); r.position.x = -66 + (len * kr) / 2; });
          const km = prog(ctx.t, tV - 0.6, tV + 0.8, (x) => x);
          for (let i = 0; i < nM; i++) {
            const x = -63 + i * 6, on = km * nM > i ? 1 : 0.001;
            m4.makeScale(1, on, 1).setPosition(x, PIER_H + 0.9, -2.0);
            masts.setMatrixAt(i, m4);
            m4.makeScale(1, 1, on).setPosition(x, PIER_H + 5.4, -0.9);
            arms.setMatrixAt(i, m4);
          }
          masts.instanceMatrix.needsUpdate = arms.instanceMatrix.needsUpdate = true;
          const kw = prog(ctx.t, tV - 0.2, tV + 1.0, (x) => x);
          wire.scale.x = Math.max(0.001, len * kw);
          wire.position.x = -66 + (len * kw) / 2;
          // current running along the wire
          for (let i = 0; i < 3; i++) {
            const xx = -66 + ((ctx.t * 40 + i * 44) % (len * kw + 0.01));
            const a = kw > 0.05 ? 1 : 0;
            spark.set(i, xx, PIER_H + 5.2, 0, 1.2 * a, 1.4 * a, 2.2 * a, 3 * a);
          }
          spark.commit();
          const green = ctx.t > tSg + 0.6;
          for (let i = 0; i < 4; i++) {
            const x = -48 + i * 30, on = ctx.t > tSg - 0.2 ? 1 : 0;
            sig.set(i * 2, x, PIER_H + 3.2, 2.3, 0.6 * on, green ? 0.2 : 2.6 * on, green ? 2.6 * on : 0.25, 0.3 * on);
            sig.set(i * 2 + 1, x, PIER_H + 2.6, 2.3, 0.3 * on, 0.5 * on, 0.5 * on, 0.5 * on);
          }
          sig.commit();
          const kTrain = prog(ctx.t, tTr - 0.6, ctx.end, (x) => x);
          train.visible = kTrain > 0;
          train.position.set(-45 + kTrain * 120, PIER_H + 0.9, 0);
          train.rotation.y = Math.PI / 2;
          const k = prog(ctx.t, ctx.start, ctx.end, (x) => x);
          shoot(stage, [-30 + k * 40, PIER_H + 5 + k * 3, 16 - k * 2], [-10 + k * 40, PIER_H + 1.5, 0]);
          stage.dof({ focus: 18, aperture: 0.0004, maxblur: 0.004 });
          callout(ctx, "kv", new THREE.Vector3(-10 + k * 40, PIER_H + 5.2, 0), "25,000 volts", prog(ctx.t, tV - 0.1, tV + 0.3) * (1 - prog(ctx.t, tSg, tSg + 0.4)), 60, -120);
          ctx.O.chip("tr", "Trial runs ✓   Safety checks ✓", { alpha: prog(ctx.t, tTr, tTr + 0.4), top: 1460 });
        },
      };
    },
  },
};

// ---------------------------------------------------------------- scenes
const callout = (ctx, key, pos, text, a, dx = 60, dy = -150) => ctx.O.callout(key, ctx.camera, pos.toArray(), text, { dx, dy, alpha: a, pill: true });

/** Where on a curve (0..1) a lat/lon sits: the nearest of 600 samples. */
function uOn(curve, p) {
  let best = 0, bd = 1e9;
  for (let i = 0; i <= 600; i++) {
    const q = curve.getPointAt(i / 600), d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
    if (d < bd) { bd = d; best = i / 600; }
  }
  return best;
}

/**
 * Stations on a route: a dot, and a light beam that rises the moment the route reaches it.
 * Interchanges get a wide pulsing ring in the colour of the line they meet.
 */
function stationLights(route, stations) {
  const g = new THREE.Group();
  const F = glowField(stations.length * 3);
  g.add(F.mesh);
  const list = stations.map(([name, la, lo, say, xcol]) => {
    const p = ll(la, lo, 0.9);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 1, 10, 1, true).translate(0, 0.5, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(xcol || 0xffffff).multiplyScalar(xcol ? 1.6 : 1.1), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    );
    beam.position.copy(p);
    g.add(beam);
    return { name, p, say, xcol, u: uOn(route.curve, p), beam };
  });
  return {
    group: g,
    list,
    /** k: how far the route has drawn; t: time, for the pulse. Returns the stations just reached. */
    update(k, t) {
      list.forEach((s, i) => {
        const on = smooth((k - s.u) * 25 + 1);
        const fresh = Math.max(0, 1 - Math.max(0, k - s.u) * 6) * on;
        s.beam.scale.set(1, Math.max(0.001, on * (s.xcol ? 14 : 8) * (1 + fresh * 0.8)), 1);
        s.beam.visible = on > 0.01;
        const c = new THREE.Color(s.xcol || 0xfff2d8);
        F.set(i * 3, s.p.x, s.p.y + 0.2, s.p.z, on * (s.xcol ? 0.9 : 0.6) * (1 + fresh * 0.5), c.r * 2.4 * on, c.g * 2.4 * on, c.b * 2.4 * on);
        const pulse = s.xcol ? on * (0.6 + 0.4 * Math.sin(t * 6)) : 0;
        F.set(i * 3 + 1, s.p.x, s.p.y + 0.2, s.p.z, (1.6 + fresh * 2) * pulse, c.r * 0.9 * pulse, c.g * 0.9 * pulse, c.b * 0.9 * pulse);
        F.set(i * 3 + 2, s.p.x, s.p.y + 0.2, s.p.z, 3 * fresh * (s.xcol ? 1 : 0.5), 1.0 * fresh, 1.0 * fresh, 1.0 * fresh);
      });
      F.commit();
    },
  };
}

/** Route progress synced to speech: each spoken station name is when the line reaches it. */
function spokenProgress(ctx, stations, t0, t1) {
  const keys = [[t0, 0]];
  for (const s of stations) if (s.say) {
    let at;
    try { at = ctx.at(s.say); } catch { continue; }
    if (at > keys[keys.length - 1][0] && s.u > keys[keys.length - 1][1]) keys.push([at + 0.15, s.u]);
  }
  keys.push([Math.max(t1, keys[keys.length - 1][0] + 0.5), 1]);
  const t = ctx.t;
  if (t <= keys[0][0]) return 0;
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i];
      return a[1] + (b[1] - a[1]) * smooth((t - a[0]) / (b[0] - a[0]));
    }
  }
  return 1;
}

/**
 * A scene that flies along one Phase 2 route from its first station to its last, the line
 * drawing under the camera and each station lighting up as it is named.
 */
function routeScene(key, { sounds = () => [], insert = null, height = 26, back = 34, side = 14 } = {}) {
  return {
    sounds: (ctx) => [{ t: ctx.start, s: "city", gain: 0.3 }, ...sounds(ctx)],
    async build(stage) {
      const g = new THREE.Group();
      const map = new THREE.Group();
      map.add(city({ seed: 20 + ORDER.indexOf(key), buildings: key === "kokapet" ? 2600 : 900 }));
      const net = network({ headSize: 0.7 });
      map.add(net.group);
      const route = net.p2[key];
      const st = stationLights(route, ST[key]);
      map.add(st.group);
      g.add(map);
      const ins = insert ? await insert.build(stage) : null;
      if (ins) g.add(ins.group);
      const done = ORDER.slice(0, ORDER.indexOf(key));
      return {
        group: g,
        update(ctx) {
          const inIns = ins && insert.when(ctx);
          map.visible = !inIns;
          if (ins) ins.group.visible = !!inIns;
          if (ins) ctx.cuts = insert.cuts(ctx);
          if (inIns) return ins.update(ctx);
          setStage(stage);
          for (const l of net.p1) l.draw(1, false);
          for (const k2 of ORDER) if (k2 !== key) net.p2[k2].draw(done.includes(k2) ? 1 : 0, false);
          const k = spokenProgress(ctx, st.list, ctx.start + 0.2, ctx.end - 0.4);
          route.draw(k);
          st.update(k, ctx.t);
          // camera: behind and above the drawing head, looking down the line ahead
          const kk = clamp01(k), head = route.curve.getPointAt(kk);
          const tan = route.curve.getTangentAt(Math.min(0.999, Math.max(0.001, kk)));
          const nrm = new THREE.Vector3(-tan.z, 0, tan.x);
          const ahead = route.curve.getPointAt(Math.min(1, kk + 0.08));
          shoot(stage, [head.x - tan.x * back + nrm.x * side, height, head.z - tan.z * back + nrm.z * side], [(head.x + ahead.x) / 2, 0, (head.z + ahead.z) / 2]);
          st.list.forEach((s, i) => {
            const a = smooth((k - s.u) * 30 + 0.5) * (1 - smooth((k - s.u - 0.3) * 8));
            const label = s.xcol ? `${s.name} ⇄` : s.name;
            callout(ctx, `${key}${i}`, s.p, label, s.u === 0 || s.u === 1 || s.say ? a : a * 0.75, i % 2 ? -70 : 60, -140);
          });
        },
      };
    },
  };
}

/** The airport ride: a lit train on the viaduct, an A320 climbing out overhead. */
async function airRideSet(stage) {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 40; i++) { const x = i * 12 - 240; pts.push(new THREE.Vector3(x, 0, Math.sin(i * 0.22) * 22)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const v = viaduct(curve, { h: 9 });
  const st = streetSet(curve, { seed: 4 });
  g.add(st.group, v.group);
  nightLights(g, { moonI: 0.6 });
  const train = await model("/assets/sf-metro/model.glb", { length: 34, glass: 1.3 });
  const fill = new THREE.DirectionalLight(0xc8d8ff, 1.1);
  fill.position.set(-40, 30, 60);
  g.add(fill);
  const tl = glowField(2);
  g.add(train, tl.mesh);
  const plane = await model("/assets/sf-a320/model.glb", { length: 40 });
  const pl = glowField(5);
  g.add(plane, pl.mesh);
  return {
    group: g,
    update(ctx, tp) {
      setStage(stage, { bg: 0x060a14, fog: 0.0042, hemiI: 0.2 });
      const lt = ctx.t - ctx.start;
      st.update(ctx.t);
      const u = 0.28 + lt * 0.026;
      onCurve(train, curve, u, v.h + 0.9);
      train.updateMatrixWorld();
      for (const [i, side] of [[0, -1], [1, 1]]) {
        const p = new THREE.Vector3(side * 0.9, 1.6, 17.2).applyMatrix4(train.matrixWorld);
        tl.set(i, p.x, p.y, p.z, 0.35, 1.5, 1.4, 1.2);
      }
      tl.commit();
      const kUp = prog(ctx.t, tp - 1.4, ctx.end, (x) => x);
      const mid = curve.getPointAt(clamp01(u)), nose = curve.getPointAt(clamp01(u + 0.04));
      shoot(stage, [mid.x - 12, v.h + 2.5 + kUp * 6, mid.z + 19], mix3([mid.x + 6, v.h + 2.5, mid.z], [mid.x + 18, v.h + 16, mid.z - 8], kUp));
      const kp = prog(ctx.t, tp - 1.6, tp + 3.2, (x) => x);
      plane.visible = kp > 0 && kp < 1;
      plane.position.set(nose.x - 80 + kp * 210, v.h + 26 + kp * 34, nose.z - 60 + kp * 30);
      plane.lookAt(plane.position.x + 10, plane.position.y + 1.6, plane.position.z + 1.4);
      plane.updateMatrixWorld();
      const blink = Math.sin(ctx.t * 9) > 0.6 ? 1 : 0.15;
      [[0, 0.4, 19, 2.2, [2.4, 2.4, 2.1]], [-19, 1.2, 1, 0.9 * blink, [2.4, 0.2, 0.2]], [19, 1.2, 1, 0.9 * blink, [0.2, 2.4, 0.4]], [0, 4.5, -2, 0.7 * blink, [2.4, 0.3, 0.3]], [0, 6, -18, 0.6, [2, 2, 2]]].forEach(([x, y, z, s, c], i) => {
        const p = new THREE.Vector3(x, y, z).applyMatrix4(plane.matrixWorld);
        pl.set(i, p.x, p.y, p.z, plane.visible ? s * 2 : 0, ...c);
      });
      pl.commit();
      stage.dof({ focus: 23, aperture: 0.0005, maxblur: 0.004 });
    },
  };
}

/** Charminar at night, floodlit, the metro curving past behind it. */
async function charminarSet(stage) {
  const close = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 30; i++) { const a = -1.1 + i * 0.075; pts.push(new THREE.Vector3(Math.sin(a) * 120, 0, -Math.cos(a) * 120 + 70)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const v = viaduct(curve, { h: 10 });
  const st = streetSet(curve, { seed: 9, cars: 90, keepOut: [0, 30, 80] });
  close.add(st.group, v.group);
  nightLights(close, { moonI: 0.4 });
  const ch = await model("/assets/sf-charminar/model.glb", { height: 34 });
  ch.position.set(0, 0, 12);
  close.add(ch);
  for (const [x, z] of [[-16, 30], [16, 30], [0, -10]]) {
    const s = new THREE.SpotLight(0xffb45a, 300, 90, 0.6, 0.5, 1.4);
    s.position.set(x, 1, z);
    s.target.position.set(0, 16, 12);
    close.add(s, s.target);
  }
  const train = await model("/assets/sf-metro/model.glb", { length: 34, glass: 1.3 });
  close.add(train);
  return {
    group: close,
    update(ctx, t0, t1) {
      setStage(stage, { bg: 0x070a14, fog: 0.004, hemiI: 0.18, bloom: { strength: 0.75, radius: 0.5, threshold: 0.85 } });
      st.update(ctx.t);
      const k = prog(ctx.t, t0, t1, (x) => x);
      onCurve(train, curve, 0.15 + k * 0.6, v.h + 0.9);
      const a = 0.9 - k * 0.7;
      shoot(stage, [Math.sin(a) * 58, 9 + k * 6, 12 + Math.cos(a) * 58], [0, 15, 8]);
      stage.dof({ focus: 58, aperture: 0.0005, maxblur: 0.005 });
    },
  };
}

// Charminar is held at least 2.4 s: "Charminar area, Falaknuma" are spoken back to back.
const charminarEnd = (ctx) => Math.max(ctx.at("Falaknuma") - 0.3, ctx.at("Charminar") + 2.2);

export const scenes = {
  // ------------------------------------------------ s1: the city at night; the five new routes flash on
  reveal: {
    sounds: (ctx) => [{ t: ctx.start, s: "city", gain: 0.5 }, { t: ctx.start + 0.1, s: "riser", gain: 0.3 }, { t: ctx.at("green") - 0.1, s: "shimmer", gain: 0.45 }],
    build(stage) {
      const g = new THREE.Group();
      g.add(city({ seed: 11 }));
      const net = network({ phase1: true, phase2: true });
      g.add(net.group);
      return {
        group: g,
        update(ctx) {
          setStage(stage);
          const k = prog(ctx.t, ctx.start, ctx.end, (x) => 1 - Math.pow(1 - x, 2.2));
          for (const l of net.p1) l.draw(1, false);
          const tg = ctx.at("green");
          ORDER.forEach((key, i) => net.p2[key].draw(prog(ctx.t, tg + i * 0.35, tg + 1.6 + i * 0.35, outE)));
          shoot(stage, mix3([60, 330, 300], [-10, 120, 170], k), mix3([0, 0, 40], [-6, 0, 14], k));
          const t76 = ctx.at("76");
          ctx.O.stat("km", "76 km", "5 కొత్త routes", { alpha: prog(ctx.t, t76 - 0.3, t76 + 0.3), top: 1350 });
        },
      };
    },
  },

  // ------------------------------------------------ s2: Phase 1: three lines draw on, the interchanges pulse
  phase1: {
    sounds: (ctx) => [
      { t: ctx.start, s: "city", gain: 0.35 },
      ...["Red", "Blue", "Green"].map((w) => ({ t: ctx.at(w) - 0.1, s: "sparkle", gain: 0.35 })),
      ...["Ameerpet", "Parade", "దగ్గర"].map((w) => ({ t: ctx.at(w) - 0.05, s: "chime", gain: 0.4 })),
    ],
    build(stage) {
      const g = new THREE.Group();
      g.add(city({ seed: 16 }));
      const net = network({ phase2: false });
      g.add(net.group);
      const X = glowField(P1_X.length * 2);
      const ends = glowField(P1_ENDS.length);
      g.add(X.mesh, ends.mesh);
      return {
        group: g,
        update(ctx) {
          setStage(stage);
          const tR = ctx.at("Red"), tB = ctx.at("Blue"), tG = ctx.at("Green"), tA = ctx.at("Ameerpet");
          const kr = prog(ctx.t, tR, tB, (x) => x), kb = prog(ctx.t, tB, tG, (x) => x), kg = prog(ctx.t, tG, tA - 0.2, (x) => x);
          [kr, kb, kg].forEach((k, i) => net.p1[i].draw(k));
          // camera drifts with whichever line is drawing
          const active = ctx.t < tB ? net.p1[0] : ctx.t < tG ? net.p1[1] : net.p1[2];
          const kk = ctx.t < tB ? kr : ctx.t < tG ? kb : kg;
          const h = active.curve.getPointAt(clamp01(kk));
          const kAll = prog(ctx.t, tA - 0.6, tA + 0.6);
          const look = mix3([h.x * 0.6, 0, h.z * 0.6 + 6], [-4, 0, -6], kAll);
          shoot(stage, [look[0] + 50 + kAll * 30, 150 + kAll * 30, look[2] + 120 + kAll * 30], look);
          P1_ENDS.forEach(([n, la, lo, col], i) => {
            const p = ll(la, lo, 1), c = new THREE.Color(col), on = [kr, kr, kb, kb, kg, kg][i] >= (i % 2 ? 0.99 : 0.01) ? 1 : 0;
            ends.set(i, p.x, p.y, p.z, 1.6 * on, c.r * 1.8 * on, c.g * 1.8 * on, c.b * 1.8 * on);
            callout(ctx, "e" + i, p, n, on * (1 - kAll), i % 2 ? -60 : 60, -130);
          });
          ends.commit();
          P1_X.forEach(([n, la, lo, say], i) => {
            const tx = ctx.at(say), p = ll(la, lo, 1);
            const on = prog(ctx.t, tx - 0.2, tx + 0.2), fresh = on * Math.max(0, 1 - (ctx.t - tx) * 0.8);
            const pulse = on * (0.6 + 0.4 * Math.sin(ctx.t * 6));
            X.set(i * 2, p.x, p.y, p.z, 2 * on + fresh * 3, 1.8 * on, 1.8 * on, 1.8 * on);
            X.set(i * 2 + 1, p.x, p.y, p.z, 5 * pulse, 0.6 * pulse, 0.6 * pulse, 0.6 * pulse);
            callout(ctx, "x" + i, p, n, on, i === 1 ? 70 : -70, -150);
          });
          X.commit();
          const t69 = ctx.at("69"), tL = ctx.at("లక్షల");
          ctx.O.stat("p1", "69 km", "Phase 1 · 3 lines", { alpha: prog(ctx.t, t69 - 0.3, t69 + 0.2) * (1 - prog(ctx.t, tL - 0.3, tL)), top: 1380 });
          ctx.O.stat("rid", "5 lakh+", "రోజూ passengers", { alpha: prog(ctx.t, tL - 0.2, tL + 0.3), top: 1380 });
        },
      };
    },
  },

  // ------------------------------------------------ s3: Phase 2 grows out of Phase 1's ends
  network: {
    sounds: (ctx) => [{ t: ctx.start, s: "city", gain: 0.35 }, { t: ctx.at("మొదలవుతాయి") - 0.2, s: "shimmer", gain: 0.45 }, { t: ctx.at("connect") - 0.1, s: "chime", gain: 0.4 }],
    build(stage) {
      const g = new THREE.Group();
      g.add(city({ seed: 12 }));
      const net = network();
      g.add(net.group);
      const ends = glowField(P1_ENDS.length * 2);
      g.add(ends.mesh);
      return {
        group: g,
        update(ctx) {
          setStage(stage);
          for (const l of net.p1) l.draw(1, false);
          const tStart = ctx.at("మొదలవుతాయి");
          ORDER.forEach((key, i) => net.p2[key].draw(prog(ctx.t, tStart - 0.4 + i * 0.2, tStart + 2.2 + i * 0.2, outE)));
          const k = prog(ctx.t, ctx.start, ctx.end, (x) => x);
          const a = -0.4 + k * 0.5;
          shoot(stage, [Math.sin(a) * (150 + k * 40), 210 + k * 60, 20 + Math.cos(a) * (150 + k * 40)], [-8, 0, 14]);
          const pulse = prog(ctx.t, ctx.start + 0.3, tStart) * (1 - prog(ctx.t, tStart + 1.5, tStart + 2.5));
          P1_ENDS.forEach(([n, la, lo, col], i) => {
            const p = ll(la, lo, 1), c = new THREE.Color(col), s = pulse * (0.6 + 0.4 * Math.sin(ctx.t * 7 + i));
            ends.set(i * 2, p.x, p.y, p.z, 2 + 4 * s, c.r * 1.8 * s, c.g * 1.8 * s, c.b * 1.8 * s);
            ends.set(i * 2 + 1, p.x, p.y, p.z, 1.2, 1.6 * pulse, 1.6 * pulse, 1.6 * pulse);
            if (n !== "JBS") callout(ctx, "pe" + i, p, n, pulse, i % 2 ? -60 : 60, -130);
          });
          ends.commit();
          const tc = ctx.at("connect");
          ctx.O.stat("p2", "69 → 145 km", "ఒకే network", { alpha: prog(ctx.t, tc - 0.2, tc + 0.4), top: 1380 });
        },
      };
    },
  },

  // ------------------------------------------------ s4-s9: one flyover per new route
  airport: routeScene("airport", { sounds: (ctx) => [{ t: ctx.at("LB") - 0.1, s: "chime", gain: 0.35 }, { t: ctx.at("Chandrayangutta") - 0.1, s: "chime", gain: 0.35 }] }),

  airride: {
    sounds: (ctx) => [{ t: ctx.start, s: "metro", gain: 0.6 }, { t: ctx.at("flight") - 1.2, s: "jet", gain: 0.6 }],
    async build(stage) {
      const set = await airRideSet(stage);
      return { group: set.group, update: (ctx) => {
        set.update(ctx, ctx.at("flight"));
        ctx.O.chip("ug", "Airport station · underground", { alpha: prog(ctx.t, ctx.start + 0.4, ctx.start + 0.9), top: 300 });
      } };
    },
  },

  kokapet: routeScene("kokapet", { height: 22, back: 26, side: 12 }),
  patancheru: routeScene("patancheru", { height: 24, back: 30 }),

  oldcity: routeScene("oldcity", {
    // higher than the others: the airport line crosses right under the end of this route
    height: 34, back: 36, side: 16,
    insert: {
      async build(stage) {
        const set = await charminarSet(stage);
        return { group: set.group, update: (ctx) => set.update(ctx, ctx.at("Charminar") - 0.2, charminarEnd(ctx)) };
      },
      when: (ctx) => ctx.t >= ctx.at("Charminar") - 0.2 && ctx.t < charminarEnd(ctx),
      cuts: (ctx) => [ctx.at("Charminar") - 0.2, charminarEnd(ctx)],
    },
    sounds: (ctx) => [{ t: ctx.at("Charminar") - 0.2, s: "metro", gain: 0.45 }, { t: ctx.at("connect") - 0.1, s: "chime", gain: 0.4 }],
  }),

  hayath: routeScene("hayath", { height: 22, back: 26 }),

  // ------------------------------------------------ s6: the money: three stacks of gold
  cost: {
    sounds: (ctx) => [{ t: ctx.start + 0.2, s: "coins", gain: 0.55 }, { t: ctx.at("State") - 0.1, s: "coins", gain: 0.45 }, { t: ctx.at("ఇరవై") - 0.1, s: "thud", gain: 0.45 }],
    build(stage) {
      const g = new THREE.Group();
      const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.25, metalness: 0.6 }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      g.add(floor);
      const gold = new THREE.MeshStandardMaterial({ color: 0xffc95a, roughness: 0.25, metalness: 1, emissive: 0x3a2400, emissiveIntensity: 0.4 });
      const coinG = new THREE.CylinderGeometry(1.6, 1.6, 0.32, 40);
      // State about a third, Centre a smaller share, loans the largest: illustrative proportions
      const STACKS = [{ x: -6, n: 30, col: 0xff8a3d, label: "State" }, { x: 0, n: 16, col: 0x3d9bff, label: "Centre" }, { x: 6, n: 44, col: 0x37e08a, label: "Loans" }];
      const stacks = STACKS.map((s, si) => {
        const im = new THREE.InstancedMesh(coinG, gold, s.n);
        const r = rand(30 + si);
        const m4 = new THREE.Matrix4();
        for (let i = 0; i < s.n; i++) {
          m4.makeRotationY(r() * 6);
          m4.setPosition(s.x + (r() - 0.5) * 0.18, 0.16 + i * 0.33, (r() - 0.5) * 0.18);
          im.setMatrixAt(i, m4);
        }
        im.castShadow = im.receiveShadow = true;
        const ring = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.4, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(s.col).multiplyScalar(2.4), toneMapped: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(s.x, 0.02, 0);
        g.add(im, ring);
        return { ...s, im };
      });
      const key = new THREE.SpotLight(0xfff0d0, 2600, 120, 0.5, 0.6, 1.5);
      key.position.set(10, 34, 22);
      key.target.position.set(0, 4, 0);
      key.castShadow = true;
      const rim = new THREE.PointLight(0x6aa8ff, 150, 60, 1.6);
      rim.position.set(-14, 10, -12);
      g.add(key, key.target, rim);
      return {
        group: g,
        update(ctx) {
          setStage(stage, { bg: 0x05070c, fog: 0.006, hemiI: 0.15, bloom: { strength: 0.7, radius: 0.5, threshold: 0.85 } });
          const tS = ctx.at("State");
          stacks.forEach((s, i) => { s.im.count = Math.max(1, Math.floor(s.n * prog(ctx.t, ctx.start + 0.2 + i * 0.25, tS + 1.6 + i * 0.4, outE))); });
          const k = prog(ctx.t, ctx.start, ctx.end, (x) => x);
          shoot(stage, [Math.sin(0.4 - k * 0.4) * 46, 16 + k * 3, Math.cos(0.4 - k * 0.4) * 46], [0, 6.5, 0]);
          stage.dof({ focus: 46, aperture: 0.0005, maxblur: 0.005 });
          const tc = ctx.at("ఇరవై");
          ctx.O.stat("cost", "₹24,269 Cr", "Total cost", { alpha: prog(ctx.t, tc - 0.3, tc + 0.3), top: 1400 });
          stacks.forEach((s, i) => callout(ctx, "st" + i, new THREE.Vector3(s.x, s.n * 0.33 + 0.6, 0), s.label, prog(ctx.t, tS + i * 0.45, tS + 0.4 + i * 0.45), i === 0 ? -80 : 60, -120));
        },
      };
    },
  },

  ...constructionScenes,

  // ------------------------------------------------ s8: the whole network alive, trains running, 2029
  finale: {
    sounds: (ctx) => [{ t: ctx.start, s: "city", gain: 0.45 }, { t: ctx.at("2029") - 0.1, s: "thud", gain: 0.4 }, { t: ctx.at("Comment") - 0.2, s: "ding", gain: 0.4 }],
    build(stage) {
      const g = new THREE.Group();
      g.add(city({ seed: 15 }));
      const net = network();
      g.add(net.group);
      const lines = [...net.p1.map((l, i) => [l, [0xff3b3b, 0x3d7bff, 0x2fd06a][i]]), ...ORDER.map((k) => [net.p2[k], P2[k].col])];
      const run = lines.map(([l, c]) => runners(l, 3, c, 0.04));
      for (const r of run) g.add(r.mesh);
      return {
        group: g,
        update(ctx) {
          setStage(stage, { bloom: { strength: 0.9, radius: 0.5, threshold: 0.9 } });
          for (const l of net.p1) l.draw(1, false);
          for (const k of ORDER) net.p2[k].draw(1, false);
          run.forEach((r) => r.place(ctx.t));
          const k = prog(ctx.t, ctx.start, ctx.end, (x) => x);
          const a = 0.6 + k * 0.7;
          shoot(stage, [Math.sin(a) * (120 + k * 120), 120 + k * 200, 20 + Math.cos(a) * (120 + k * 120)], [-6, 0, 16]);
          const t9 = ctx.at("2029");
          ctx.O.stat("yr", "2029", "Target", { alpha: prog(ctx.t, t9 - 0.3, t9 + 0.3), top: 330 });
          const tc = ctx.at("Comment");
          ctx.O.chip("cm", "మీ area కి metro వస్తుందా? 👇", { alpha: prog(ctx.t, tc - 0.3, tc + 0.3), top: 1500 });
        },
      };
    },
  },
};
