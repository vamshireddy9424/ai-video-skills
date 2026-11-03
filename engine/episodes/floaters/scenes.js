// Floaters & the blue-sky dots. A realistic head, then the camera goes into the eye.
// No on-screen text in these shots: the pictures carry it.
import { THREE, shoot, mix3, prog } from "/web/engine.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const captions = false;

const loadTex = (url, srgb) =>
  new Promise((ok, err) =>
    new THREE.TextureLoader().load(url, (t) => {
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      ok(t);
    }, undefined, err)
  );

/** Sky backdrop: a soft vertical gradient, pale blue at the top to warm haze at the horizon. */
function skyTexture(top = "#7fb2e6", mid = "#bcd6ef", low = "#f2e9dc") {
  const cv = document.createElement("canvas");
  cv.width = 8;
  cv.height = 512;
  const g = cv.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, top);
  grad.addColorStop(0.55, mid);
  grad.addColorStop(1, low);
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 512);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- the eyeball
/** Iris: radial fibres, a darker collarette and limbal ring, a black pupil. Brown, like most Indian eyes. */
function irisTexture(size = 1024) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d");
  const c = size / 2, R = size / 2;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const base = g.createRadialGradient(c, c, R * 0.25, c, c, R);
  base.addColorStop(0, "#2a160a");
  base.addColorStop(0.35, "#6b3d1c");
  base.addColorStop(0.7, "#4a2a12");
  base.addColorStop(0.93, "#2a170a");
  base.addColorStop(1, "#120a05");
  g.fillStyle = base;
  g.beginPath();
  g.arc(c, c, R, 0, Math.PI * 2);
  g.fill();
  // fibres: thousands of thin wavy radial strokes, light and dark
  for (let i = 0; i < 2600; i++) {
    const a = rnd() * Math.PI * 2;
    const r0 = R * (0.26 + rnd() * 0.1), r1 = R * (0.6 + rnd() * 0.38);
    const light = rnd() < 0.55;
    g.strokeStyle = light ? `rgba(${170 + rnd() * 60},${110 + rnd() * 50},${55 + rnd() * 30},${0.08 + rnd() * 0.18})` : `rgba(20,10,4,${0.1 + rnd() * 0.2})`;
    g.lineWidth = 0.6 + rnd() * 1.6;
    g.beginPath();
    const wob = (rnd() - 0.5) * 0.06;
    for (let k = 0; k <= 12; k++) {
      const r = r0 + ((r1 - r0) * k) / 12, aa = a + Math.sin(k * 0.9 + i) * wob;
      const x = c + Math.cos(aa) * r, y = c + Math.sin(aa) * r;
      k ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
  // collarette: a bright, slightly irregular ring
  g.strokeStyle = "rgba(170,115,60,0.16)";
  g.lineWidth = R * 0.05;
  g.beginPath();
  for (let k = 0; k <= 64; k++) {
    const a = (k / 64) * Math.PI * 2, r = R * (0.42 + Math.sin(a * 9) * 0.02 + Math.sin(a * 23 + 1) * 0.012);
    k ? g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r) : g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
  }
  g.stroke();
  // crypts: small dark pits
  g.filter = "blur(2px)";
  for (let i = 0; i < 28; i++) {
    const a = rnd() * Math.PI * 2, r = R * (0.45 + rnd() * 0.35);
    g.fillStyle = `rgba(25,12,5,${0.12 + rnd() * 0.18})`;
    g.beginPath();
    g.ellipse(c + Math.cos(a) * r, c + Math.sin(a) * r, R * (0.01 + rnd() * 0.02), R * (0.025 + rnd() * 0.04), a, 0, Math.PI * 2);
    g.fill();
  }
  g.filter = "none";
  // limbal ring and pupil
  const limb = g.createRadialGradient(c, c, R * 0.8, c, c, R);
  limb.addColorStop(0.4, "rgba(10,5,2,0)");
  limb.addColorStop(1, "rgba(10,5,2,0.95)");
  g.fillStyle = limb;
  g.beginPath();
  g.arc(c, c, R, 0, Math.PI * 2);
  g.fill();
  const pup = g.createRadialGradient(c, c, R * 0.24, c, c, R * 0.3);
  pup.addColorStop(0, "#020101");
  pup.addColorStop(1, "rgba(2,1,1,0)");
  g.fillStyle = pup;
  g.beginPath();
  g.arc(c, c, R * 0.3, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Sclera: warm white, pinker toward the back, with fine vessels creeping toward the iris. v = 0 is the front. */
function scleraTexture(w = 2048, h = 1024) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d");
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#e9e0d6");
  grad.addColorStop(0.35, "#ddd0c4");
  grad.addColorStop(1, "#d9aea2");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const vessel = (x, y, a, len, width, depth) => {
    g.strokeStyle = `rgba(${150 + rnd() * 40},${28 + rnd() * 25},${32 + rnd() * 20},${0.3 + rnd() * 0.35})`;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < len; k++) {
      a += (rnd() - 0.5) * 0.45;
      x += Math.cos(a) * 7;
      y += Math.sin(a) * 4;
      g.lineTo(x, y);
      if (depth < 3 && rnd() < 0.07) vessel(x, y, a + (rnd() - 0.5) * 1.4, len * 0.5, width * 0.6, depth + 1);
    }
    g.stroke();
  };
  // from the back (bottom of the map) up toward the iris (top), thinning as they go
  for (let i = 0; i < 90; i++) vessel(rnd() * w, h * (0.3 + rnd() * 0.35), -Math.PI / 2 + (rnd() - 0.5) * 0.5, 18 + rnd() * 26, 1.4 + rnd() * 2.4, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function eyeball() {
  const g = new THREE.Group();
  // open at the front where the cornea sits, so the iris shows through
  const scleraGeo = new THREE.SphereGeometry(1, 160, 96, 0, Math.PI * 2, 0.52, Math.PI - 0.52);
  scleraGeo.rotateX(Math.PI / 2);
  const sclera = new THREE.Mesh(
    scleraGeo,
    new THREE.MeshPhysicalMaterial({ map: scleraTexture(), color: 0xd9cec3, roughness: 0.55, clearcoat: 0.8, clearcoatRoughness: 0.15, sheen: 0.2, sheenColor: new THREE.Color(0xffd6cc) })
  );
  g.add(sclera);
  // iris: a slightly cone-shaped disc set just behind the cornea
  const irisGeo = new THREE.CircleGeometry(0.5, 128);
  const pos = irisGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    pos.setZ(i, 0.05 * (1 - r / 0.5)); // pupil edge sits forward, like a real iris
  }
  irisGeo.computeVertexNormals();
  const iris = new THREE.Mesh(irisGeo, new THREE.MeshStandardMaterial({ map: irisTexture(), roughness: 0.55 }));
  iris.position.z = 0.86;
  g.add(iris);
  // cornea: a clear, wet dome
  const corneaGeo = new THREE.SphereGeometry(0.62, 96, 48, 0, Math.PI * 2, 0, 1.08);
  corneaGeo.rotateX(Math.PI / 2);
  const cornea = new THREE.Mesh(
    corneaGeo,
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, thickness: 0.08, ior: 1.376, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 1, envMapIntensity: 0.1 })
  );
  cornea.position.z = 0.43;
  g.add(cornea);
  return g;
}

// ---------------------------------------------------------------- the person
// assets/person-up: a sculpted bust, head back, looking at the sky. It has no colours and no
// eyes (only closed-lid bumps), so we paint it by region and seat a real eyeball in each socket.
// Everything is measured in the FACE FRAME: u = across (+x), v = up the face, w = out of the face.
// The face points 40° above +z. Each eye was measured on its own (they differ by ~4 model-mm in
// depth), from a straight-on render with a millimetre grid. Model units are ~2.5× life size.
const FACE_TILT = THREE.MathUtils.degToRad(40);
const NOSE = new THREE.Vector3(0, 0.729, 0.206);
const AX_U = new THREE.Vector3(1, 0, 0);
const AX_V = new THREE.Vector3(0, Math.cos(FACE_TILT), -Math.sin(FACE_TILT));
const AX_W = new THREE.Vector3(0, Math.sin(FACE_TILT), Math.cos(FACE_TILT));
const EYE_R = 0.03; // model units (12 mm in life)
const LID_A = 0.034, LID_B = 0.0115; // half-width and half-height of the opening
const EYE_SPECS = [
  { u: -0.08, v: 0.075, lid: -0.0866 }, // his right (image left)
  { u: 0.078, v: 0.075, lid: -0.0829 }, // his left
];
const ROLL = 0.05; // eyes rolled a touch further up than the face
const fromFace = (u, v, w) => NOSE.clone().addScaledVector(AX_U, u).addScaledVector(AX_V, v).addScaledVector(AX_W, w);
const toFace = (p) => {
  const d = p.clone().sub(NOSE);
  return { u: d.dot(AX_U), v: d.dot(AX_V), w: d.dot(AX_W) };
};
// eyeball centre: its front sits just behind the closed-lid surface, so the lids overlap its edge
export const EYES = EYE_SPECS.map((e) => fromFace(e.u, e.v, e.lid - EYE_R * 0.93));
const SCALE = 8; // world units per model unit: the camera needs room to get millimetres from the eye

/** Split triangles near any of `centers` into 4, `levels` times, interpolating every attribute. */
function subdivideNear(geo, centers, radius, levels) {
  for (let l = 0; l < levels; l++) {
    const names = Object.keys(geo.attributes);
    const src = names.map((n) => geo.attributes[n]);
    const out = names.map(() => []);
    const tri = geo.attributes.position.count / 3;
    const c = new THREE.Vector3();
    for (let t = 0; t < tri; t++) {
      const i0 = t * 3, i1 = i0 + 1, i2 = i0 + 2;
      const P = geo.attributes.position;
      c.set((P.getX(i0) + P.getX(i1) + P.getX(i2)) / 3, (P.getY(i0) + P.getY(i1) + P.getY(i2)) / 3, (P.getZ(i0) + P.getZ(i1) + P.getZ(i2)) / 3);
      const near = centers.some((e) => e.distanceTo(c) < radius);
      src.forEach((a, k) => {
        const n = a.itemSize, get = (i) => Array.from({ length: n }, (_, j) => a.array[i * n + j]);
        const v0 = get(i0), v1 = get(i1), v2 = get(i2);
        if (!near) return out[k].push(...v0, ...v1, ...v2);
        const m = (p, q) => p.map((x, j) => (x + q[j]) / 2);
        const a01 = m(v0, v1), a12 = m(v1, v2), a20 = m(v2, v0);
        out[k].push(...v0, ...a01, ...a20, ...a01, ...v1, ...a12, ...a20, ...a12, ...v2, ...a01, ...a12, ...a20);
      });
    }
    const g2 = new THREE.BufferGeometry();
    names.forEach((n, k) => g2.setAttribute(n, new THREE.Float32BufferAttribute(out[k], src[k].itemSize)));
    geo = g2;
  }
  return geo;
}

/** Press an almond opening into each closed lid, back to just behind the eyeball's surface. */
function openEyes(geo) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  EYE_SPECS.forEach((e, k) => {
    const centre = toFace(EYES[k]);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const f = toFace(v);
      if (f.w < centre.w) continue;
      const du = (f.u - e.u) / LID_A, dv = (f.v - (e.v - 0.002)) / LID_B;
      const d = du * du + dv * dv;
      if (d >= 1) continue;
      const lu = f.u - e.u, lv = f.v - e.v;
      // well behind the iris (which sits 0.86 R in), so no skin can show through the clear cornea
      const behind = centre.w + 0.6 * Math.sqrt(Math.max(0, EYE_R * EYE_R - lu * lu - lv * lv));
      const k2 = Math.pow(1 - d, 0.35);
      const w = Math.min(f.w, f.w + (behind - f.w) * k2);
      v.copy(fromFace(f.u, f.v, w));
      p.setXYZ(i, v.x, v.y, v.z);
    }
  });
  p.needsUpdate = true;
}

/** Paint by region: curly black hair, warm brown skin, darker brows and lips, a navy tee. */
function paint(geo) {
  const p = geo.attributes.position, n = p.count, col = new Float32Array(n * 3), v = new THREE.Vector3();
  const skin = new THREE.Color(0x86593f), hair = new THREE.Color(0x15110e), brow = new THREE.Color(0x2a1d16),
    lip = new THREE.Color(0x7a4234), tee = new THREE.Color(0x26344a), c = new THREE.Color();
  // hair boundary in the side view (y → z): hair lies behind it
  const hairZ = (y) => {
    const pts = [[1.0, 0.2], [0.867, 0.09], [0.76, 0.03], [0.6, -0.02], [0.565, -0.02], [0.56, -0.15], [0.3, -0.17]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [y0, z0] = pts[i], [y1, z1] = pts[i + 1];
      if (y <= y0 && y >= y1) return z0 + ((y - y0) / (y1 - y0)) * (z1 - z0);
    }
    return -1;
  };
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(p, i);
    const f = toFace(v);
    const noise = Math.sin(v.x * 410) * Math.sin(v.y * 377) * Math.sin(v.z * 433); // fine mottling
    const collar = 0.11 + Math.min(0.12, Math.max(0, (0.14 - v.z) * 0.48));
    if (v.y < collar) c.copy(tee).multiplyScalar(0.92 + 0.08 * noise);
    // hair: on the face, above a hairline that dips at the temples; elsewhere, behind the side-view line
    // (the f.w > -0.06 test catches curls that hang out in front of the forehead)
    else if ((f.v > 0.168 - 0.03 * Math.min(1, (f.u / 0.12) ** 2) && f.w > -0.17) || (f.v > 0.145 && f.w > -0.06) || (v.y > 0.32 && v.z < hairZ(v.y) && f.w <= -0.17))
      c.copy(hair).multiplyScalar(0.85 + 0.3 * Math.abs(noise));
    else {
      c.copy(skin).multiplyScalar(0.96 + 0.06 * noise);
      // brows: an arched band above each eye
      for (const e of EYE_SPECS) {
        const du = (f.u - e.u * 1.05) / 0.05, arch = 0.132 + 0.008 * (1 - du * du);
        if (Math.abs(du) < 1 && Math.abs(f.v - arch) < 0.0075 && f.w > -0.12) c.lerp(brow, 0.85);
      }
      // lips
      if (Math.abs(f.u) < 0.042 && f.v < -0.095 && f.v > -0.14 && f.w > -0.08) c.lerp(lip, 0.45);
    }
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
}


// ================================================================ inside the eye: shared pieces
const rand = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** A world-space sky dome (so it turns when the eye turns), with soft clouds. */
function skyDome(seed = 5) {
  const cv = document.createElement("canvas");
  cv.width = 2048;
  cv.height = 1024;
  const g = cv.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0, "#1f5fb8");
  grad.addColorStop(0.3, "#3f7fd2");
  grad.addColorStop(0.46, "#8ab6e6");
  grad.addColorStop(0.5, "#d6e4f2");
  grad.addColorStop(1, "#b9ad9c");
  g.fillStyle = grad;
  g.fillRect(0, 0, 2048, 1024);
  const r = rand(seed);
  g.filter = "blur(18px)";
  // a few soft clouds low in the sky; the sky he looks up at stays clear blue
  for (let i = 0; i < 14; i++) {
    const x = r() * 2048, y = 400 + r() * 70, w = 60 + r() * 160;
    g.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.15})`;
    g.beginPath();
    g.ellipse(x, y, w, w * 0.32, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.SphereGeometry(60, 64, 32), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, toneMapped: false }));
}

/** Retina as seen inside the eye: orange-red, a bright optic disc, branching vessels. */
function retinaTexture() {
  const cv = document.createElement("canvas");
  cv.width = 2048;
  cv.height = 1024;
  const g = cv.getContext("2d");
  const r = rand(11);
  const grad = g.createRadialGradient(1024, 512, 50, 1024, 512, 1100);
  grad.addColorStop(0, "#c8562c");
  grad.addColorStop(0.6, "#a8401f");
  grad.addColorStop(1, "#6e2412");
  g.fillStyle = grad;
  g.fillRect(0, 0, 2048, 1024);
  const disc = [1240, 520];
  const dg = g.createRadialGradient(...disc, 10, ...disc, 90);
  dg.addColorStop(0, "#ffe2a8");
  dg.addColorStop(1, "rgba(255,200,140,0)");
  g.fillStyle = dg;
  g.beginPath();
  g.arc(...disc, 90, 0, Math.PI * 2);
  g.fill();
  const vessel = (x, y, a, len, w, depth) => {
    g.strokeStyle = depth % 2 ? "rgba(110,14,10,0.85)" : "rgba(150,22,16,0.85)";
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < len; k++) {
      a += (r() - 0.5) * 0.3;
      x += Math.cos(a) * 9;
      y += Math.sin(a) * 9;
      g.lineTo(x, y);
      if (depth < 4 && r() < 0.05) vessel(x, y, a + (r() < 0.5 ? 0.6 : -0.6), len * 0.6, w * 0.7, depth + 1);
    }
    g.stroke();
  };
  for (let i = 0; i < 8; i++) vessel(...disc, (i / 8) * Math.PI * 2 + r() * 0.4, 70, 9, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A wobbly open curve through `n` points, scattered on a plane `z` in front of the eye. */
function squiggle(r, cx, cy, size, z, n = 7) {
  const pts = [];
  let x = cx, y = cy, a = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    pts.push(new THREE.Vector3(x, y, z + (r() - 0.5) * 0.05));
    a += (r() - 0.5) * 1.8;
    x += Math.cos(a) * size;
    y += Math.sin(a) * size;
  }
  return new THREE.CatmullRomCurve3(pts);
}

/** Floaters as he sees them: faint grey threads and rings, a little out of focus. */
function floaterSet(seed, count = 9) {
  const g = new THREE.Group();
  const r = rand(seed);
  const core = new THREE.MeshBasicMaterial({ color: 0x2f3a46, transparent: true, opacity: 0.22, depthWrite: false, fog: false });
  const halo = new THREE.MeshBasicMaterial({ color: 0x2f3a46, transparent: true, opacity: 0.08, depthWrite: false, fog: false });
  for (let i = 0; i < count; i++) {
    const c = squiggle(r, (r() - 0.5) * 1.1, (r() - 0.5) * 1.9, 0.08 + r() * 0.08, 0);
    const rad = 0.008 + r() * 0.01;
    g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 80, rad, 6), core));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 80, rad * 3, 6), halo));
  }
  for (let i = 0; i < count * 1.5; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02 + r() * 0.03, 0.006, 6, 24), core);
    ring.position.set((r() - 0.5) * 1.2, (r() - 0.5) * 2.0, (r() - 0.5) * 0.1);
    g.add(ring);
  }
  return g;
}

/** Deterministic spring: where a lagging object is at time t when chasing target(t). */
function lagged(target, t0, t, stiffness = 26, damping = 7) {
  let x = target(t0), v = 0;
  const dt = 1 / 240;
  for (let tt = t0; tt < t; tt += dt) {
    const a = stiffness * (target(tt) - x) - damping * v;
    v += a * dt;
    x += v * dt;
  }
  return x;
}

/** First-person: the sky dome at the origin, the eye looking up and around. */
function povScene(stage, update) {
  const g = new THREE.Group();
  const dome = skyDome();
  g.add(dome);
  return { g, apply(ctx) {
    const sc = stage.scene;
    sc.background = new THREE.Color(0x9cc3ec);
    sc.fog = null;
    stage.ground.visible = false;
    stage.sun.visible = false;
    stage.camera.near = 0.01;
    stage.camera.updateProjectionMatrix();
    update?.(ctx);
  } };
}

/** A biconcave red blood cell: a lathe of the classic dimpled-disc profile. */
function rbcGeometry() {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const x = (i / 24) * 1.0;
    // Evans–Fung shape: thickness rises from a dimpled centre to a rounded rim
    const h = 0.5 * Math.sqrt(Math.max(0, 1 - x * x)) * (0.207 + 2.003 * x * x - 1.123 * x ** 4);
    pts.push(new THREE.Vector2(Math.max(0.001, x), h));
  }
  for (let i = 23; i >= 0; i--) pts.push(new THREE.Vector2(Math.max(0.001, pts[i].x), -pts[i].y));
  const geo = new THREE.LatheGeometry(pts, 48);
  geo.computeVertexNormals();
  return geo;
}

/** A soft round sprite: specks in the gel catch the light instead of reading as square dots. */
function softDot() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d"), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.35, "rgba(255,255,255,0.45)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

/** The inside of the eyeball: glossy, wet retina with raised vessels, darkening toward the edges. */
function retinaMaterial() {
  const map = retinaTexture();
  return new THREE.MeshPhysicalMaterial({ map, bumpMap: map, bumpScale: 2.5, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.25, side: THREE.BackSide });
}

/** Light through the gel: nested cones that fade, so the beam has a soft core and soft edges. */
function lightCone(r0, r1, len, color = 0xfff1d6, strength = 0.05) {
  const g = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const k = 1 - i * 0.35;
    const geo = new THREE.CylinderGeometry(r0 * k, r1 * k, len, 48, 1, true);
    geo.rotateX(Math.PI / 2);
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: strength, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
  }
  return g;
}

/** Endothelium: the vessel wall's thin cells, long and overlapping, each with a darker nucleus. */
function vesselWallTexture() {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = 512;
  const g = cv.getContext("2d");
  const r = rand(17);
  g.fillStyle = "#c9786a";
  g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 220; i++) {
    const x = r() * 1024, y = r() * 512;
    g.fillStyle = `rgba(${230 + r() * 20},${150 + r() * 30},${140 + r() * 20},0.35)`;
    g.beginPath();
    g.ellipse(x, y, 60 + r() * 50, 16 + r() * 10, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(120,40,35,0.35)";
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = "rgba(110,40,60,0.45)";
    g.beginPath();
    g.ellipse(x + (r() - 0.5) * 20, y, 12, 6, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 1);
  return t;
}

// =====================================================================
export const scenes = {
  // ------------------------------------------------ a person looks up at the sky
  face: {
    sounds(ctx) {
      return [
        { t: ctx.start + 0.2, s: "underwater", gain: 0.12 },
        { t: ctx.end - 2.6, s: "riser", gain: 0.3 },
        { t: ctx.end - 0.5, s: "whoosh", gain: 0.5 },
        { t: ctx.end - 0.05, s: "thud", gain: 0.45 },
      ];
    },
    async build(stage) {
      const g = new THREE.Group();
      const body = new THREE.Group();
      body.scale.setScalar(SCALE);
      g.add(body);
      const gltf = await new GLTFLoader().loadAsync("/assets/person-up/model.glb");
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        geo.applyMatrix4(o.matrixWorld);
        geo.deleteAttribute("normal");
        geo = subdivideNear(geo, EYES, 0.055, 3);
        openEyes(geo);
        geo.computeVertexNormals();
        paint(geo);
        const m = new THREE.Mesh(
          geo,
          new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.62, sheen: 0.22, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xb97a60) })
        );
        m.castShadow = m.receiveShadow = true;
        body.add(m);
      });
      EYES.forEach((e) => {
        const eb = eyeball();
        eb.scale.setScalar(EYE_R);
        eb.position.copy(e);
        eb.rotation.x = -(FACE_TILT + ROLL); // looking where his face looks, a touch higher
        body.add(eb);
      });
      const key = new THREE.DirectionalLight(0xfff1dc, 3.0);
      key.position.set(4, 20, 9);
      const fill = new THREE.HemisphereLight(0xbfd8ff, 0x8a6a55, 1.2);
      const rim = new THREE.DirectionalLight(0xcfe3ff, 2.0);
      rim.position.set(-8, 8, -10);
      g.add(key, fill, rim);
      const sky = skyTexture();
      // outdoor reflections: the eye mirrors a soft sky above and warm ground below, not a studio softbox
      const envCanvas = document.createElement("canvas");
      envCanvas.width = 256;
      envCanvas.height = 128;
      const eg = envCanvas.getContext("2d");
      const egr = eg.createLinearGradient(0, 0, 0, 128);
      egr.addColorStop(0, "#9cc4ee");
      egr.addColorStop(0.48, "#e8eef4");
      egr.addColorStop(0.52, "#b8a48c");
      egr.addColorStop(1, "#6b5a48");
      eg.fillStyle = egr;
      eg.fillRect(0, 0, 256, 128);
      const envSrc = new THREE.CanvasTexture(envCanvas);
      envSrc.mapping = THREE.EquirectangularReflectionMapping;
      envSrc.colorSpace = THREE.SRGBColorSpace;
      const skyEnv = new THREE.PMREMGenerator(stage.renderer).fromEquirectangular(envSrc).texture;
      // the camera path, in world units: low and wide → his upturned face → in through his left eye's lids → the pupil
      const W = (v) => v.clone().multiplyScalar(SCALE);
      const eye = W(EYES[1]);
      const gaze = new THREE.Vector3(0, Math.sin(FACE_TILT + ROLL), Math.cos(FACE_TILT + ROLL));
      const pupil = eye.clone().addScaledVector(gaze, EYE_R * SCALE * 0.95);
      const along = (d, side = 0) => pupil.clone().addScaledVector(AX_W, d).add(new THREE.Vector3(side, 0, 0));
      const head = W(NOSE).addScaledVector(AX_V, 0.05 * SCALE);
      const path = {
        pos: new THREE.CatmullRomCurve3([new THREE.Vector3(5, 0.5, 16), new THREE.Vector3(3.2, 5, 9), along(3, 0.6), along(0.9, 0.15), along(0.09), along(0.015)]),
        look: new THREE.CatmullRomCurve3([new THREE.Vector3(0, 3.6, 0), head.clone(), pupil.clone(), pupil.clone(), pupil.clone(), pupil.clone()]),
      };
      // a black veil just in front of the lens: the pupil swallows the frame at the very end
      const veil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false }));
      veil.renderOrder = 999;
      g.add(veil);
      return {
        group: g,
        update(ctx) {
          const { t } = ctx;
          const sc = stage.scene;
          sc.background = sky;
          sc.environment = skyEnv;
          sc.fog = null;
          stage.ground.visible = false;
          stage.sun.visible = false;
          // moving from the first frame (a Short can't open on a still), gliding to a stop in the pupil
          const k = prog(t, ctx.start, ctx.end, (x) => 0.25 * x + 0.75 * x * x * x * (x * (x * 6 - 15) + 10));
          const p = path.pos.getPointAt(k), l = path.look.getPointAt(k);
          stage.camera.near = 0.01;
          stage.camera.updateProjectionMatrix();
          shoot(stage, p.toArray(), l.toArray());
          const cam = stage.camera;
          veil.position.copy(cam.position).addScaledVector(cam.getWorldDirection(new THREE.Vector3()), 0.02);
          veil.quaternion.copy(cam.quaternion);
          veil.material.opacity = prog(t, ctx.end - 0.45, ctx.end - 0.05);
          veil.visible = veil.material.opacity > 0;
          // the face goes soft as we close in, the iris stays sharp
          stage.dof({ focus: p.distanceTo(pupil), aperture: 0.0008 + 0.02 * Math.pow(k, 3), maxblur: 0.012 + 0.012 * Math.pow(k, 3) });
        },
      };
    },
  },

  // ------------------------------------------------ extreme close-up, toward the pupil
  macro: {
    build(stage) {
      const g = new THREE.Group();
      const eye = eyeball();
      g.add(eye);
      const key = new THREE.DirectionalLight(0xfff3e4, 2.6);
      key.position.set(2.5, 3, 4);
      const catchlight = new THREE.PointLight(0xffffff, 18, 12, 2);
      catchlight.position.set(1.4, 1.6, 3.2);
      const rim = new THREE.DirectionalLight(0x9ec5ff, 1.6);
      rim.position.set(-3, 1, -2);
      g.add(key, catchlight, rim, new THREE.HemisphereLight(0xdfe8ff, 0x3a2418, 0.5));
      const dark = new THREE.Color(0x0d0b0a);
      return {
        group: g,
        update(ctx) {
          const { t } = ctx;
          const sc = stage.scene;
          sc.background = dark;
          sc.fog = null;
          stage.ground.visible = false;
          stage.sun.visible = false;
          // the eye drifts a touch, like it is alive
          eye.rotation.y = Math.sin(t * 0.7) * 0.05 - 0.1;
          eye.rotation.x = Math.sin(t * 0.5 + 1) * 0.03;
          const k = prog(t, ctx.start, ctx.start + 6, (x) => 1 - Math.pow(1 - x, 2));
          shoot(stage, mix3([1.3, 0.5, 4.2], [0.12, 0.05, 1.75], k), mix3([0, 0, 0.3], [0, 0, 0.9], k));
          const dist = 4.2 - (4.2 - 1.75) * k - 0.9;
          stage.dof({ focus: dist, aperture: 0.03, maxblur: 0.012 });
        },
      };
    },
  },

  // ------------------------------------------------ s2: his view; floaters lag when the eye darts
  pov: {
    sounds(ctx) {
      // a soft swish each time the eye darts, and a shimmer as the floaters drift
      return [
        { t: ctx.start + 0.2, s: "shimmer", gain: 0.25 },
        ...[1.4, 3.0, 4.4].map((d) => ({ t: ctx.start + d, s: "whoosh", gain: 0.22 })),
      ];
    },
    build(stage) {
      const floaters = floaterSet(21);
      const v = povScene(stage);
      v.g.add(floaters);
      // where the eye points (yaw, pitch): looking up, then quick darts
      const darts = (t0) => [[t0, 0, 0.55], [t0 + 1.6, 0.45, 0.62], [t0 + 3.2, -0.38, 0.5], [t0 + 4.6, 0.12, 0.58]];
      const aim = (keys, t, i) => {
        let k = 0;
        while (k < keys.length - 1 && t >= keys[k + 1][0]) k++;
        const [ta, ...a] = keys[k], b = keys[Math.min(k + 1, keys.length - 1)];
        const u = b[0] > ta ? Math.min(1, Math.max(0, (t - b[0] + 0.22) / 0.22)) : 0; // a dart takes ~0.2 s
        const e = u * u * (3 - 2 * u);
        return a[i] + ((b[i + 1] ?? a[i]) - a[i]) * e;
      };
      return {
        group: v.g,
        update(ctx) {
          v.apply(ctx);
          const keys = darts(ctx.start);
          const yaw = aim(keys, ctx.t, 0), pitch = aim(keys, ctx.t, 1);
          const cam = stage.camera;
          cam.position.set(0, 0, 0);
          cam.rotation.set(pitch, yaw, 0, "YXZ");
          // floaters ride in the gel: they follow the eye late, overshoot, and drift on
          const fy = lagged((tt) => aim(keys, tt, 0), ctx.start, ctx.t), fp = lagged((tt) => aim(keys, tt, 1), ctx.start, ctx.t);
          floaters.rotation.set(fp, fy, 0, "YXZ");
          // place the floater layer 2.5 units in front of the lagged gaze, drifting slowly down
          floaters.position.copy(new THREE.Vector3(0, -0.05 * (ctx.t - ctx.start), -2.5).applyEuler(floaters.rotation));
          stage.dof({ focus: 30, aperture: 0.0006, maxblur: 0.006 });
        },
      };
    },
  },

  // ------------------------------------------------ s3–s4: inside the eye; the collagen web clumps
  gel: {
    sounds(ctx) {
      return [
        { t: ctx.start, s: "underwater", gain: 0.5 },
        { t: ctx.start + 9.5, s: "underwater", gain: 0.45 },
        { t: ctx.at("ముద్దలుగా") - 1.5, s: "shimmer", gain: 0.4 },
      ];
    },
    build(stage) {
      const g = new THREE.Group();
      const R = 10;
      g.add(new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), retinaMaterial()));
      const lens = new THREE.Mesh(new THREE.SphereGeometry(2.2, 48, 24), new THREE.MeshBasicMaterial({ color: 0xfff2d8, transparent: true, opacity: 0.6, fog: false }));
      lens.scale.set(1, 1, 0.45);
      lens.position.set(0, 0, R - 1.6);
      g.add(lens);
      const beam = lightCone(1.8, 4.8, 2 * R - 2, 0xfff1d6, 0.022);
      g.add(beam);
      // collagen fibres: a loose web, then clumps; each fibre has a bright core and a soft glow
      const r = rand(42);
      const clumps = Array.from({ length: 6 }, () => new THREE.Vector3((r() - 0.5) * 9, (r() - 0.5) * 9, (r() - 0.5) * 9));
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xd8efff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
      const glowMat = new THREE.MeshBasicMaterial({ color: 0x8cc6ff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false });
      const fibres = [];
      for (let i = 0; i < 140; i++) {
        const pts = [];
        let p = new THREE.Vector3((r() - 0.5) * 14, (r() - 0.5) * 14, (r() - 0.5) * 14).clampLength(0, 7.5);
        const d = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
        for (let k = 0; k < 9; k++) {
          pts.push(p.clone());
          d.add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(1.1)).normalize();
          p = p.clone().addScaledVector(d, 0.75);
        }
        const c = clumps[i % clumps.length];
        const packed = pts.map((q, k) => c.clone().add(q.clone().sub(pts[0]).multiplyScalar(0.18)).add(new THREE.Vector3(Math.sin(k + i), Math.cos(k * 1.3 + i), Math.sin(k * 0.7 + i * 2)).multiplyScalar(0.15)));
        for (const [rad, mat] of [[0.012, coreMat], [0.06, glowMat]]) {
          const a = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, rad, 5);
          const b = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(packed), 64, rad * 2.2, 5);
          const mesh = new THREE.Mesh(a.clone(), mat);
          fibres.push({ mesh, a: a.attributes.position.array, b: b.attributes.position.array });
          g.add(mesh);
        }
      }
      // specks drifting in the water, glinting as they pass through the light
      const specks = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 900 }, () => new THREE.Vector3((r() - 0.5) * 16, (r() - 0.5) * 16, (r() - 0.5) * 16).clampLength(0, 8.5)));
      const speckPts = new THREE.Points(specks, new THREE.PointsMaterial({ map: softDot(), color: 0xfff4e6, size: 0.14, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
      g.add(speckPts);
      const light = new THREE.PointLight(0xfff0dd, 26, 40, 1.5);
      light.position.set(0, 0, R - 2.5);
      const rim = new THREE.PointLight(0xff9a6a, 8, 25, 1.5);
      rim.position.set(0, 0, -R + 2);
      g.add(light, rim, new THREE.HemisphereLight(0xffd9c2, 0x3a0e06, 0.18));
      return {
        group: g,
        update(ctx) {
          const sc = stage.scene;
          sc.background = new THREE.Color(0x120604);
          sc.environment = null;
          sc.fog = new THREE.FogExp2(0x2a0c06, 0.035); // depth: far fibres sink into the red-dark
          stage.ground.visible = false;
          stage.sun.visible = false;
          stage.camera.near = 0.01;
          stage.camera.updateProjectionMatrix();
          const tc = ctx.at("ముద్దలుగా");
          const k = prog(ctx.t, tc - 2.2, tc + 1.2);
          for (const f of fibres) {
            const pos = f.mesh.geometry.attributes.position;
            for (let i = 0; i < pos.array.length; i++) pos.array[i] = f.a[i] + (f.b[i] - f.a[i]) * k;
            pos.needsUpdate = true;
          }
          speckPts.rotation.y = (ctx.t - ctx.start) * 0.02;
          const u = prog(ctx.t, ctx.start, ctx.end, (x) => x);
          shoot(stage, [Math.sin(u * 1.2) * 2.5, 1.2 - u * 1.5, 7.5 - u * 6], [Math.sin(u * 1.2 + 0.6) * 1.5, -0.5, -6]);
          stage.dof({ focus: 5, aperture: 0.005, maxblur: 0.012 });
        },
      };
    },
  },

  // ------------------------------------------------ s5: a clump's shadow falls on the retina
  retina: {
    sounds(ctx) {
      return [
        { t: ctx.start, s: "underwater", gain: 0.4 },
        { t: ctx.at("నీడలు"), s: "thud", gain: 0.35 },
      ];
    },
    build(stage) {
      const g = new THREE.Group();
      // the back of the same eyeball: we look across its curved, glossy floor
      const R = 14;
      const wall = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), retinaMaterial());
      wall.receiveShadow = true;
      g.add(wall);
      const r = rand(7);
      const clump = new THREE.Group();
      const cm = new THREE.MeshPhysicalMaterial({ color: 0xe6f2ff, transparent: true, opacity: 0.6, roughness: 0.2, clearcoat: 1, emissive: 0x223344 });
      for (let i = 0; i < 9; i++) {
        const c = squiggle(r, (r() - 0.5) * 0.6, (r() - 0.5) * 0.6, 0.35, (r() - 0.5) * 0.4, 8);
        const m = new THREE.Mesh(new THREE.TubeGeometry(c, 90, 0.05, 8), cm);
        m.castShadow = true;
        clump.add(m);
      }
      clump.position.set(0, 0, -7.5);
      g.add(clump);
      const spot = new THREE.SpotLight(0xfff2dc, 140, 40, 0.38, 0.75, 1.2);
      spot.position.set(0, 0.5, 8);
      spot.target.position.set(0, 0, -R);
      spot.castShadow = true;
      spot.shadow.mapSize.set(2048, 2048);
      spot.shadow.bias = -0.0005;
      spot.shadow.radius = 4;
      g.add(spot, spot.target, new THREE.HemisphereLight(0xffd6c0, 0x2a0a05, 0.12));
      const beam = lightCone(0.4, 3.2, 20, 0xfff1d6, 0.03);
      beam.position.set(0, 0.25, -3);
      g.add(beam);
      const specks = new THREE.Points(
        new THREE.BufferGeometry().setFromPoints(Array.from({ length: 400 }, () => new THREE.Vector3((r() - 0.5) * 8, (r() - 0.5) * 8, -2 - r() * 10))),
        new THREE.PointsMaterial({ map: softDot(), color: 0xfff4e6, size: 0.1, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      g.add(specks);
      return {
        group: g,
        update(ctx) {
          const sc = stage.scene;
          sc.background = new THREE.Color(0x0e0503);
          sc.environment = null;
          sc.fog = new THREE.FogExp2(0x2a0c06, 0.03);
          stage.ground.visible = false;
          stage.sun.visible = false;
          clump.rotation.set(ctx.t * 0.15, ctx.t * 0.22, 0);
          const tShadow = ctx.at("నీడలు");
          ctx.shots([
            [ctx.start, [3.5, 1.5, 3], [0, 0, -7.5], [2.2, 1, -1.5], [0, 0, -8]],
            [tShadow, [2.6, 1.6, -7.5], [0, -0.3, -13.6], [1.2, 0.9, -10], [0, -0.2, -13.8]],
          ]);
          stage.dof({ focus: stage.camera.position.distanceTo(new THREE.Vector3(0, 0, -13.8)), aperture: 0.002, maxblur: 0.008 });
        },
      };
    },
  },

  // ------------------------------------------------ s6: bright dots zip across the blue sky
  bluesky: {
    sounds(ctx) {
      return [
        { t: ctx.start + 0.1, s: "sparkle", gain: 0.45 },
        { t: ctx.start + 3.1, s: "sparkle", gain: 0.35 },
      ];
    },
    build(stage) {
      const v = povScene(stage);
      const r = rand(77);
      const dotGeo = new THREE.SphereGeometry(1, 12, 8);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
      const paths = [];
      while (paths.length < 34) {
        // the frame at 2.5 units is about ±0.5 wide and ±0.9 tall
        const cx = (r() - 0.5) * 1.0, cy = (r() - 0.5) * 1.8;
        if (Math.hypot(cx, cy * 0.55) < 0.14) continue; // none in the very centre: no capillaries cross the fovea
        paths.push({ curve: squiggle(r, cx, cy, 0.08, 0, 6), phase: r() * 0.9, period: 0.7 + r() * 0.5 });
      }
      const dots = new THREE.InstancedMesh(dotGeo, dotMat, paths.length * 6);
      const layer = new THREE.Group();
      layer.add(dots);
      v.g.add(layer);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion();
      return {
        group: v.g,
        update(ctx) {
          v.apply(ctx);
          const cam = stage.camera;
          cam.position.set(0, 0, 0);
          cam.rotation.set(0.55 + Math.sin(ctx.t * 0.3) * 0.02, Math.sin(ctx.t * 0.2) * 0.03, 0, "YXZ");
          layer.position.copy(new THREE.Vector3(0, 0, -2.5).applyEuler(cam.rotation));
          layer.rotation.copy(cam.rotation);
          // each dot runs its path in under a second, with a short fading tail
          let n = 0;
          const pulse = 1 + 0.35 * Math.max(0, Math.sin(ctx.t * Math.PI * 2 * 1.2)) ** 6;
          for (const p of paths) {
            const life = ((ctx.t * pulse + p.phase) % p.period) / p.period;
            for (let k = 0; k < 6; k++) {
              const u = life - k * 0.035;
              const s = u < 0 ? 0 : 0.028 * (1 - k / 7) * Math.sin(Math.PI * Math.min(1, life * 1.2));
              m.compose(p.curve.getPointAt(Math.max(0, Math.min(1, u))), q, new THREE.Vector3(s, s, s));
              dots.setMatrixAt(n++, m);
            }
          }
          dots.instanceMatrix.needsUpdate = true;
        },
      };
    },
  },

  // ------------------------------------------------ s7: light crosses the vessels before the light-sensing cells
  vessels: {
    sounds(ctx) {
      return [
        { t: ctx.start, s: "underwater", gain: 0.3 },
        { t: ctx.at("చెరిపేస్తుంది") - 0.3, s: "shimmer", gain: 0.3 },
      ];
    },
    build(stage) {
      const g = new THREE.Group();
      const r = rand(9);
      // light-sensing cells: a field of rods standing on the back of the retina
      const rodGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 10);
      rodGeo.translate(0, 0.8, 0);
      const rodMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
      const rows = 60, cols = 34;
      const rods = new THREE.InstancedMesh(rodGeo, rodMat, rows * cols);
      const col = new THREE.Color(), m = new THREE.Matrix4();
      let i = 0;
      for (let a = 0; a < rows; a++) for (let b = 0; b < cols; b++) {
        m.makeTranslation(-6 + a * 0.2 + (r() - 0.5) * 0.04, 0, -3.4 + b * 0.2 + (r() - 0.5) * 0.04);
        rods.setMatrixAt(i, m);
        rods.setColorAt(i++, col.setHSL(0.92 + r() * 0.06, 0.55, 0.55));
      }
      rods.receiveShadow = true;
      g.add(rods);
      g.add(new THREE.Mesh(new THREE.BoxGeometry(13, 0.2, 7.4), new THREE.MeshStandardMaterial({ color: 0x3a120c })).translateY(-0.1));
      // blood vessels running across, above the rods
      const vm = new THREE.MeshPhysicalMaterial({ color: 0xa3140e, roughness: 0.35, clearcoat: 0.6, transmission: 0.1 });
      for (const [z, rad] of [[-1.6, 0.32], [0.9, 0.22], [2.4, 0.14]]) {
        const c = new THREE.CatmullRomCurve3([-7, -3, 0, 3, 7].map((x, k) => new THREE.Vector3(x, 3.1 + Math.sin(k + z) * 0.15, z + Math.cos(k * 1.7 + z) * 0.5)));
        const tube = new THREE.Mesh(new THREE.TubeGeometry(c, 80, rad, 16), vm);
        tube.castShadow = true;
        g.add(tube);
      }
      const sunlight = new THREE.DirectionalLight(0xfff3df, 3.2);
      sunlight.position.set(0.5, 12, 0.3);
      sunlight.castShadow = true;
      sunlight.shadow.mapSize.set(2048, 2048);
      Object.assign(sunlight.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 20 });
      sunlight.shadow.bias = -0.0005;
      const fill = new THREE.HemisphereLight(0xffffff, 0x441b14, 0.25);
      g.add(sunlight, fill);
      // incoming light, drawn as soft rays
      const rays = new THREE.Group();
      for (let k = 0; k < 26; k++) {
        const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 7, 6), new THREE.MeshBasicMaterial({ color: 0xfff4d8, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
        ray.position.set(-5.5 + (k % 13) * 0.9, 5.5, -2 + Math.floor(k / 13) * 3);
        rays.add(ray);
      }
      g.add(rays);
      return {
        group: g,
        update(ctx) {
          const sc = stage.scene;
          sc.background = new THREE.Color(0x0b0a12);
          sc.fog = null;
          stage.ground.visible = false;
          stage.sun.visible = false;
          // the rays fall; then the brain "erases" the still shadows: the fill rises until they vanish
          rays.children.forEach((ray, k) => (ray.position.y = 8 - (((ctx.t - ctx.start) * 3 + k * 0.37) % 7)));
          const tErase = ctx.at("చెరిపేస్తుంది");
          fill.intensity = 0.25 + 2.6 * prog(ctx.t, tErase - 0.6, tErase + 1.2);
          const u = prog(ctx.t, ctx.start, ctx.end, (x) => x);
          shoot(stage, [6 - u * 4, 4.2 - u * 1.2, 7 - u * 1.5], [0, 1.4, 0]);
          stage.dof({ focus: 8, aperture: 0.0015, maxblur: 0.006 });
        },
      };
    },
  },

  // ------------------------------------------------ s8: a white cell squeezes through; blue light pours through the gap
  capillary: {
    sounds(ctx) {
      // the heartbeat that drives the flow, ~72 a minute
      const beats = [];
      for (let t = ctx.start + 0.1; t < ctx.end - 0.5; t += 1 / 1.2) beats.push({ t, s: "heartbeat", gain: 0.55 });
      return [...beats, { t: ctx.at("ఖాళీ") - 0.3, s: "shimmer", gain: 0.35 }];
    },
    async build(stage) {
      const g = new THREE.Group();
      const L = 60;
      // a cutaway capillary: only the back half of the wall, so we see straight inside
      const wallGeo = new THREE.CylinderGeometry(1, 1, L, 96, 1, true, Math.PI / 2, Math.PI); // θ ∈ [π/2, 3π/2]: the half behind the cells
      wallGeo.rotateZ(Math.PI / 2);
      const wall = new THREE.Mesh(wallGeo, new THREE.MeshPhysicalMaterial({ map: vesselWallTexture(), roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, side: THREE.DoubleSide, sheen: 0.4, sheenColor: new THREE.Color(0xffb0a0) }));
      g.add(wall);
      // the wall's cut edge, as a thin rim
      for (const y of [-1, 1]) {
        const rim = new THREE.Mesh(new THREE.BoxGeometry(L, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0xb4584c }));
        rim.position.set(0, y * 0.99, 0);
        g.add(rim);
      }
      // the light-sensing cells beneath: they glow blue where the light gets through
      const rodGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.4, 10);
      rodGeo.translate(0, -0.7, 0);
      const rodCount = 30 * 6; // a strip of retina under the vessel
      const rods = new THREE.InstancedMesh(rodGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), rodCount);
      const rodPos = [];
      const r = rand(31), mm = new THREE.Matrix4(), cc = new THREE.Color();
      for (let i = 0; i < rodCount; i++) {
        const x = -15 + (i % 30) * 1.0, z = -1.4 + Math.floor(i / 30) * 0.5;
        rodPos.push(x);
        mm.makeTranslation(x + (r() - 0.5) * 0.08, -1.35, z);
        rods.setMatrixAt(i, mm);
        rods.setColorAt(i, cc.setHSL(0.94, 0.45, 0.5));
      }
      g.add(rods);
      const shaft = lightCone(0.5, 0.8, 9, 0x6aaaff, 0);
      shaft.rotation.x = Math.PI / 2;
      shaft.position.y = 2.3;
      g.add(shaft);
      // red cells, single file: glossy dimpled discs
      const N = 120;
      const rbc = new THREE.InstancedMesh(rbcGeometry(), new THREE.MeshPhysicalMaterial({ color: 0xb3150f, roughness: 0.3, sheen: 0.7, sheenColor: new THREE.Color(0xff5a40), clearcoat: 0.6, clearcoatRoughness: 0.2 }), N);
      g.add(rbc);
      const cells = Array.from({ length: N }, (_, i) => ({ x: -L / 2 + (i / N) * L, y: (r() - 0.5) * 0.25, z: (r() - 0.5) * 0.25, spin: r() * 6, axis: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize() }));
      // plasma: tiny particles carried along
      const plasma = new THREE.Points(
        new THREE.BufferGeometry().setFromPoints(Array.from({ length: 500 }, () => new THREE.Vector3((r() - 0.5) * L, (r() - 0.5) * 1.6, (r() - 0.5) * 1.6))),
        new THREE.PointsMaterial({ map: softDot(), color: 0xffd8c8, size: 0.06, transparent: true, opacity: 0.5, depthWrite: false })
      );
      g.add(plasma);
      // the white cell: the Sketchfab lymphocyte, squeezed into the vessel and bulging as it crawls
      const gltf = await new GLTFLoader().loadAsync("/assets/sf-lymphocyte/model.glb");
      const wbc = gltf.scene;
      const box = new THREE.Box3().setFromObject(wbc), size = box.getSize(new THREE.Vector3()).length();
      wbc.scale.setScalar(2.4 / size);
      const wbcHolder = new THREE.Group();
      wbcHolder.add(wbc);
      g.add(wbcHolder);
      g.add(new THREE.HemisphereLight(0xffe2d4, 0x3a0f0a, 0.8));
      const key = new THREE.DirectionalLight(0xfff0e0, 2.4);
      key.position.set(3, 6, 6);
      const back = new THREE.DirectionalLight(0xff9a80, 1.2);
      back.position.set(-4, 2, -6);
      g.add(key, back);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(0.55, 0.55, 0.55);
      return {
        group: g,
        update(ctx) {
          const sc = stage.scene;
          sc.background = new THREE.Color(0x140707);
          sc.environment = null;
          sc.fog = new THREE.FogExp2(0x1a0807, 0.045);
          stage.ground.visible = false;
          stage.sun.visible = false;
          const lt = ctx.t - ctx.start;
          const beat = (tt) => tt + 0.25 * Math.sin(tt * Math.PI * 2 * 1.2); // ~72 beats a minute
          const xw = -10 + beat(lt) * 1.1;
          const squeeze = 1 + 0.08 * Math.sin(lt * Math.PI * 2 * 1.2);
          wbcHolder.position.set(xw, 0, 0);
          wbcHolder.scale.set(1.35 * squeeze, 0.82 / Math.sqrt(squeeze), 0.82 / Math.sqrt(squeeze));
          wbcHolder.rotation.x = lt * 0.4;
          plasma.position.x = (beat(lt) * 3.2) % 20;
          let queued = 0;
          const sorted = cells.map((c, i) => ({ c, i, x: ((c.x + beat(lt) * 3.2 + L / 2) % L) - L / 2 })).sort((a, b) => b.x - a.x);
          let nextAhead = Infinity;
          for (const s2 of sorted) {
            let x = s2.x;
            if (x < xw + 1.6 && x > xw - 12) x = Math.min(x, xw - 1.7 - queued++ * 0.42);
            else if (x >= xw + 1.6) nextAhead = Math.min(nextAhead, x);
            q.setFromAxisAngle(s2.c.axis, s2.c.spin + lt * 2.5);
            m.compose(new THREE.Vector3(x, s2.c.y, s2.c.z), q, one);
            rbc.setMatrixAt(s2.i, m);
          }
          rbc.instanceMatrix.needsUpdate = true;
          const gapX = xw + 1.6 + Math.min(4, (nextAhead - xw - 1.6) / 2);
          const tGap = ctx.at("ఖాళీ");
          const on = prog(ctx.t, tGap - 0.4, tGap + 0.6) * (0.75 + 0.25 * Math.sin(lt * Math.PI * 2 * 1.2));
          shaft.position.x = gapX;
          shaft.children.forEach((c) => (c.material.opacity = 0.05 * on));
          // rods under the gap light up blue
          for (let i = 0; i < rodCount; i++) {
            const d = Math.abs(rodPos[i] - gapX);
            const lit = on * Math.max(0, 1 - d / 1.6);
            rods.setColorAt(i, cc.setHSL(0.94 - lit * 0.34, 0.45 + lit * 0.4, 0.5 + lit * 0.3));
          }
          rods.instanceColor.needsUpdate = true;
          shoot(stage, [xw + 1.6, 1.6, 6.8], [xw + 1.3, -0.6, 0]);
          stage.dof({ focus: 6.1, aperture: 0.003, maxblur: 0.01 });
        },
      };
    },
  },

  // ------------------------------------------------ s9: warning signs
  warning: {
    sounds(ctx) {
      return [
        { t: ctx.at("మెరుపులు"), s: "flash", gain: 0.45 },
        { t: ctx.at("తెర") - 0.3, s: "riser", gain: 0.3 },
        { t: ctx.at("doctor"), s: "ding", gain: 0.35 },
      ];
    },
    build(stage) {
      const v = povScene(stage);
      const shower = new THREE.Group();
      const r = rand(99);
      const specks = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0x1f262e, transparent: true, opacity: 0.5, depthWrite: false, fog: false }), 260);
      const seeds = Array.from({ length: 260 }, () => [(r() - 0.5) * 2.6, (r() - 0.5) * 4, 0.006 + r() * 0.02, 0.1 + r() * 0.3]);
      shower.add(specks, floaterSet(3, 14));
      v.g.add(shower);
      const flash = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 64, 1, Math.PI * 0.75, Math.PI * 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.92, depthWrite: false, fog: false }));
      v.g.add(flash, curtain);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion();
      return {
        group: v.g,
        update(ctx) {
          v.apply(ctx);
          const cam = stage.camera;
          cam.position.set(0, 0, 0);
          cam.rotation.set(0.55, 0.05 * Math.sin(ctx.t), 0, "YXZ");
          const fwd = (d, x = 0, y = 0) => new THREE.Vector3(x, y, -d).applyEuler(cam.rotation);
          shower.position.copy(fwd(2.5));
          shower.rotation.copy(cam.rotation);
          // a sudden shower of new floaters
          const tShower = ctx.at("floaters"), k = prog(ctx.t, tShower - 0.3, tShower + 0.8);
          seeds.forEach(([x, y, s, fall], i) => {
            m.compose(new THREE.Vector3(x, y - fall * (ctx.t - tShower), 0), q, new THREE.Vector3(1, 1, 1).multiplyScalar(s * k));
            specks.setMatrixAt(i, m);
          });
          specks.instanceMatrix.needsUpdate = true;
          // a flash at the edge of vision
          const tFlash = ctx.at("మెరుపులు");
          flash.position.copy(fwd(2.4));
          flash.rotation.copy(cam.rotation);
          flash.material.opacity = Math.max(0, 1 - Math.abs(ctx.t - tFlash - 0.2) / 0.25) * 0.9;
          // a curtain sliding down over the view
          const tCurtain = ctx.at("తెర");
          const c = prog(ctx.t, tCurtain - 0.2, tCurtain + 1.6);
          curtain.position.copy(fwd(2.3, 0, 5.2 - c * 3.6));
          curtain.rotation.copy(cam.rotation);
          // the one line on screen: see a doctor the same day
          const tDoc = ctx.at("doctor");
          ctx.O.stat("doc", "eye doctor", "ఒక్కసారిగా ఎక్కువైతే, అదే రోజు", { alpha: prog(ctx.t, tDoc - 0.3, tDoc + 0.4), top: 1180 });
        },
      };
    },
  },
};
