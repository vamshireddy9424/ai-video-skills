// Cyclone Arnab: how it formed and where it went. Pure graphics: a 3D storm, a map, the physics.
// Everything visual hangs off spoken words (ctx.at), so a new voice take re-times itself.
// Clouds are camera-facing instanced quads, not GL points: points have a GPU-specific size cap
// (small on Apple Metal), which made the storm vanish on a Mac render.
import { THREE, shoot, mix3, prog, bakeTexture } from "/web/engine.js";

export const captions = false;

// ---------------------------------------------------------------- helpers
const rand = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** Set the stage for a scene: background, fog, no ground or sun from the kit. */
function setStage(stage, bg, fog) {
  const sc = stage.scene;
  sc.background = new THREE.Color(bg);
  sc.fog = fog ? new THREE.FogExp2(bg, fog) : null;
  sc.environment = null;
  stage.ground.visible = false;
  stage.sun.visible = false;
  stage.camera.near = 0.05;
  stage.camera.far = 3000;
  stage.camera.updateProjectionMatrix();
}

/** A wispy cloud sprite: overlapping soft blobs, so each puff has texture, not a smooth disc. */
let cloudTex;
function cloudSprite() {
  if (cloudTex) return cloudTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const g = cv.getContext("2d", { willReadFrequently: true });
  const r = rand(91);
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.8) * 80;
    const x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d, rad = 18 + r() * 46;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(255,255,255,${0.07 + r() * 0.08})`);
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  }
  cloudTex = bakeTexture(cv);
  return cloudTex;
}

/**
 * Soft, lit cloud puffs: `n` camera-facing quads drawn in one call.
 * set(i, x, y, z, size, shade) then commit(). Shade is brightness (0..1); `flash` lights them up.
 * The quad corners live in their own attribute and `position` is all zeros, so passes that draw
 * the scene with an override material (ambient occlusion) see nothing instead of a stray square.
 */
function puffField(n, { opacity = 0.6, tint = [1, 1, 1.03], soft = 1.6 } = {}) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
  geo.setAttribute("corner", new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
  const centre = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const size = new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
  const shade = new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
  const spin = new THREE.InstancedBufferAttribute(Float32Array.from({ length: n }, (_, i) => (i * 2.399) % 6.283), 1);
  geo.setAttribute("aCentre", centre);
  geo.setAttribute("aSize", size);
  geo.setAttribute("aShade", shade);
  geo.setAttribute("aSpin", spin);
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: cloudSprite() }, uOpacity: { value: opacity }, uFlash: { value: 0 }, uTint: { value: new THREE.Vector3(...tint) }, uSoft: { value: soft } },
    vertexShader: `
      attribute vec2 corner; attribute vec3 aCentre; attribute float aSize; attribute float aShade; attribute float aSpin;
      varying vec2 vUv; varying vec2 vTex; varying float vShade;
      void main() {
        vUv = corner; vShade = aShade;
        float c = cos(aSpin), s = sin(aSpin);
        vTex = mat2(c, -s, s, c) * corner * 0.5 + 0.5;
        vec4 mv = modelViewMatrix * vec4(aCentre, 1.0);
        mv.xy += corner * aSize;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uOpacity; uniform float uFlash; uniform vec3 uTint; uniform float uSoft;
      varying vec2 vUv; varying vec2 vTex; varying float vShade;
      void main() {
        float d = length(vUv);
        if (d > 1.0) discard;
        float a = texture2D(uMap, vTex).r * pow(1.0 - d, uSoft * 0.5);
        float lit = vShade * (0.74 + 0.26 * (vUv.y * 0.5 + 0.5));
        vec3 col = lit * uTint + uFlash * vec3(0.55, 0.65, 1.0) * (1.0 - d);
        gl_FragColor = vec4(col, a * uOpacity);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return {
    mesh,
    mat,
    set(i, x, y, z, s, sh) {
      centre.array[i * 3] = x;
      centre.array[i * 3 + 1] = y;
      centre.array[i * 3 + 2] = z;
      size.array[i] = s;
      shade.array[i] = sh;
    },
    commit() {
      centre.needsUpdate = size.needsUpdate = shade.needsUpdate = true;
    },
  };
}

/**
 * The storm: spiral rain bands of soft lit cloud around a clear eye, inner clouds spinning
 * faster, all turning anticlockwise seen from above. Eyewall leans outward like stadium stands.
 * update(t, strength, cut?) every frame; `flash` (0..1) for lightning inside the clouds.
 */
function cycloneStorm(R, seed = 1, n = 9000, vertical = 1) {
  const r = rand(seed);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const band = r();
    let rad, th, h, size;
    if (band < 0.24) {
      h = R * (0.03 + r() * 0.17) * vertical;
      rad = R * (0.12 + r() * 0.05) + h * 0.45;
      th = r() * Math.PI * 2;
      size = R * (0.035 + r() * 0.035);
    } else {
      const arm = Math.floor(r() * 4);
      const s = Math.pow(r(), 0.75);
      rad = R * (0.16 + s * 0.84);
      th = (arm / 4) * Math.PI * 2 + Math.log(rad / (R * 0.16)) * 2.2 + (r() - 0.5) * (0.45 + s * 0.55);
      h = R * (0.01 + r() * 0.08 * (1 - s)) * Math.sqrt(vertical);
      size = R * (0.03 + r() * 0.045) * (1 + s * 0.5);
    }
    pts.push({ rad, th, h, size, shade: 0.72 + r() * 0.28 });
  }
  const field = puffField(n, { opacity: 1.0 });
  const g = new THREE.Group();
  // a soft cloud deck under the bands so the storm reads as one mass, not separate dots
  const deck = new THREE.Mesh(new THREE.CircleGeometry(R * 1.05, 96), new THREE.MeshBasicMaterial({ map: radialHaze(), transparent: true, opacity: 0.4, depthWrite: false }));
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = R * 0.005;
  g.add(deck, field.mesh);
  g.userData.flash = 0;
  g.userData.update = (t, strength = 1, cut = null) => {
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const w = 0.9 * Math.pow((R * 0.12) / Math.max(p.rad, R * 0.1), 0.6);
      const th = p.th + w * t;
      const rad = p.rad * (0.85 + 0.15 * strength);
      const x = Math.cos(th) * rad, z = -Math.sin(th) * rad;
      const hide = cut && cut(x, z);
      const top = p.h / (R * 0.2 * vertical);
      field.set(i, x, p.h * strength, z, hide ? 0 : p.size * (0.6 + 0.4 * strength), p.shade * (0.8 + 0.2 * clamp01(top)));
    }
    field.commit();
    field.mat.uniforms.uOpacity.value = 1.0 * strength;
    field.mat.uniforms.uFlash.value = g.userData.flash;
    deck.material.opacity = 0.4 * strength;
    deck.rotation.z = t * 0.2;
  };
  return g;
}

function radialHaze() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const g = cv.getContext("2d", { willReadFrequently: true }), grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, "rgba(255,255,255,0)");
  grd.addColorStop(0.12, "rgba(255,255,255,0.9)");
  grd.addColorStop(0.5, "rgba(235,240,245,0.5)");
  grd.addColorStop(1, "rgba(220,230,240,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return bakeTexture(cv);
}

/** Lightning: brief, irregular double-flashes; returns 0..1 brightness at time t. */
function lightning(t, seed = 3, rate = 0.35) {
  const slot = Math.floor(t * rate * 4);
  const r = rand(seed + slot * 7919);
  if (r() > 0.3) return 0;
  const at = slot / (rate * 4) + r() * 0.5;
  const d = t - at;
  if (d < 0 || d > 0.35) return 0;
  return d < 0.06 ? 1 : d < 0.12 ? 0.25 : d < 0.18 ? 0.8 : Math.max(0, 1 - (d - 0.18) / 0.17) * 0.5;
}
/** The seconds within [a, b) when lightning() flashes, for thunder cues. */
function flashTimes(a, b, seed = 3, rate = 0.35) {
  const out = [];
  for (let t = a; t < b; t += 0.02) if (lightning(t, seed, rate) === 1 && !out.some((x) => Math.abs(x - t) < 0.5)) out.push(t);
  return out;
}

/** Heavy rain: fast falling streaks around a centre. */
function rainField(n, area, height, seed = 21, color = 0xcfe0ff) {
  const r = rand(seed);
  const seeds = Array.from({ length: n }, () => [r() * area - area / 2, r() * height, r() * area - area / 2, 0.6 + r() * 0.8]);
  const pos = new Float32Array(n * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  return {
    lines,
    mat,
    update(t, cx = 0, cz = 0, slant = 0.25, speed = 30) {
      seeds.forEach(([x, y, z, len], i) => {
        const yy = (((y - t * speed) % height) + height) % height;
        pos.set([cx + x + yy * slant, yy, cz + z, cx + x + (yy + len) * slant, yy + len, cz + z], i * 6);
      });
      geo.attributes.position.needsUpdate = true;
    },
  };
}

/** Deep ocean seen from above: subtle swell, darker with depth. */
function oceanPlane(size, color = 0x0b3a63) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 512;
  const g = cv.getContext("2d", { willReadFrequently: true });
  const r = rand(5);
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 512, 512);
  g.filter = "blur(3px)";
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? 255 : 0},${r() < 0.5 ? 255 : 0},255,0.08)`;
    g.beginPath();
    g.ellipse(r() * 512, r() * 512, 6 + r() * 14, 2 + r() * 4, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const bump = bakeTexture(cv);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(size / 20, size / 20);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, bumpMap: bump, bumpScale: 0.6, clearcoat: 0.4 }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

// ---------------------------------------------------------------- the map of the Bay of Bengal
// lon/lat → world: 1° = SCALE units; x east, z south.
const SCALE = 4, LON0 = 84, LAT0 = 16;
const ll = (lat, lon, y = 0) => new THREE.Vector3((lon - LON0) * SCALE, y, -(lat - LAT0) * SCALE);
const INDIA = [[24, 70], [24, 88.4], [21.65, 88.2], [21.6, 87.5], [20.8, 87.0], [20.3, 86.7], [19.8, 85.85], [19.3, 84.95], [18.6, 84.4], [18.3, 84.1], [17.9, 83.6], [17.7, 83.3], [17.3, 82.6], [17.0, 82.3], [16.75, 82.3], [16.5, 82.05], [16.33, 81.72], [16.1, 81.3], [15.85, 81.05], [15.75, 80.9], [15.85, 80.55], [15.5, 80.1], [14.6, 80.15], [13.9, 80.25], [13.1, 80.3], [12.0, 79.85], [11.0, 79.85], [10.3, 79.85], [9.3, 79.2], [8.1, 77.5], [9.5, 76.3], [12.0, 75.0], [15.5, 73.8], [19.0, 72.8], [21.0, 72.6], [23.0, 70.0]];
const LANKA = [[9.8, 80.0], [9.6, 80.6], [8.5, 81.2], [7.5, 81.8], [6.5, 81.7], [5.95, 80.6], [6.5, 79.9], [7.5, 79.8], [8.5, 79.9], [9.3, 79.9]];
const EAST = [[24, 88.6], [21.6, 89.0], [22.0, 90.5], [22.4, 91.6], [21.4, 92.0], [20.5, 92.6], [19.5, 93.6], [18.0, 94.3], [16.5, 94.3], [15.8, 95.4], [16.6, 97.5], [14.0, 98.0], [10.0, 98.5], [10.0, 104], [24, 104]];
// Arnab's track (approximate centres): formed 26 Oct in the east-central Bay; 27 Oct ~15.9N 84.8E; landfall near Narsapur early 28 Oct
const TRACK = [[12.6, 87.8], [13.6, 87.0], [14.8, 86.0], [15.9, 84.8], [16.25, 83.2], [16.4, 81.85], [16.6, 81.2], [17.0, 80.6]];
export const PLACES = {
  narsapur: [16.43, 81.7],
  kakinada: [16.95, 82.25],
  vizag: [17.69, 83.22],
};

let landTex;
function landTexture() {
  if (landTex) return landTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1024;
  const g = cv.getContext("2d", { willReadFrequently: true });
  const r = rand(77);
  g.fillStyle = "#56743c";
  g.fillRect(0, 0, 1024, 1024);
  g.filter = "blur(6px)";
  for (let i = 0; i < 2600; i++) {
    const tone = r();
    g.fillStyle = tone < 0.45 ? `rgba(70,${100 + r() * 40},50,0.35)` : tone < 0.8 ? `rgba(${120 + r() * 40},${110 + r() * 30},70,0.3)` : "rgba(40,70,35,0.4)";
    // Drawn wrapped across the tile edges so the repeat is seamless — a blob cut at
    // the edge showed every tile boundary as a straight line across the land.
    const [x, y, rx, ry, rot] = [r() * 1024, r() * 1024, 10 + r() * 50, 6 + r() * 30, r() * 3];
    for (const dx of [-1024, 0, 1024]) for (const dy of [-1024, 0, 1024]) {
      if (Math.abs(x + dx - 512) > 512 + rx + 24 || Math.abs(y + dy - 512) > 512 + rx + 24) continue;
      g.beginPath();
      g.ellipse(x + dx, y + dy, rx, ry, rot, 0, Math.PI * 2);
      g.fill();
    }
  }
  landTex = bakeTexture(cv);
  landTex.colorSpace = THREE.SRGBColorSpace;
  landTex.wrapS = landTex.wrapT = THREE.RepeatWrapping;
  landTex.repeat.set(0.012, 0.012);
  return landTex;
}

function landMesh(poly, color) {
  const shape = new THREE.Shape(poly.map(([la, lo]) => new THREE.Vector2((lo - LON0) * SCALE, (la - LAT0) * SCALE)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.25, bevelSegments: 2 });
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: landTexture(), color: 0xffffff, roughness: 0.9 }));
  m.receiveShadow = true;
  return m;
}

function bayMap() {
  const g = new THREE.Group();
  const sea = oceanPlane(600, 0x0d3b66);
  sea.position.y = -0.05;
  g.add(sea);
  g.add(landMesh(INDIA, 0x5f7f45), landMesh(LANKA, 0x5f7f45), landMesh(EAST, 0x5a7442));
  // Andhra Pradesh's coast highlighted: a thin bright rim from Srikakulam to Nellore
  const apCoast = INDIA.filter(([la, lo]) => la < 18.9 && la > 14.0 && lo > 79.9);
  const rim = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(apCoast.map(([la, lo]) => ll(la, lo, 0.9))), 200, 0.18, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd36a, toneMapped: false })
  );
  rim.material.transparent = true;
  g.add(rim);
  for (const [la, lo] of Object.values(PLACES)) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    dot.position.copy(ll(la, lo, 1.0));
    g.add(dot);
  }
  g.add(new THREE.HemisphereLight(0xdbe8ff, 0x1a2a3a, 1.2));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  sun.position.set(-40, 80, 30);
  g.add(sun);
  return { g, rim };
}

/** The track as a glowing tube drawn on progressively. */
function trackLine() {
  const curve = new THREE.CatmullRomCurve3(TRACK.map(([la, lo]) => ll(la, lo, 1.2)));
  const geo = new THREE.TubeGeometry(curve, 300, 0.22, 8);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff5a3c, toneMapped: false }));
  const total = geo.index.count;
  return { mesh: m, curve, draw(k) { geo.setDrawRange(0, Math.floor(total * clamp01(k) / 6) * 6); } };
}

// =====================================================================
export const scenes = {
  // ------------------------------------------------ s1: from space, diving down onto the storm
  space: {
    sounds: (ctx) => [
      { t: ctx.start, s: "wind", gain: 0.55 },
      { t: ctx.start + 0.2, s: "riser", gain: 0.35 },
      ...flashTimes(ctx.start, ctx.end, 3, 0.45).map((t) => ({ t, s: "thunder", gain: 0.6 })),
    ],
    build(stage) {
      const { g } = bayMap();
      const storm = cycloneStorm(14, 3, 14000);
      g.add(storm);
      const bolt = new THREE.PointLight(0xbfd4ff, 0, 60, 1.2);
      g.add(bolt);
      return {
        group: g,
        update(ctx) {
          const lt = ctx.t - ctx.start;
          // Space-black from 240 up, sea haze by the bottom of the dive: low over the
          // spiral the camera sees the horizon, and black there read as the map's edge.
          const dive = prog(ctx.t, ctx.start, ctx.end, (x) => 1 - Math.pow(1 - x, 2.4));
          const h0 = Math.max(0, (dive - 0.45) / 0.55), haze = h0 * h0 * (3 - 2 * h0);
          setStage(stage, new THREE.Color(0x020610).lerp(new THREE.Color(0x24486e), haze), 0.0016 + haze * 0.011);
          storm.position.copy(ll(16.3, 82.4, 1.5));
          storm.userData.flash = lightning(ctx.t, 3, 0.45);
          storm.userData.update(lt * 1.1, 1);
          bolt.position.copy(storm.position).add(new THREE.Vector3(3, 6, -2));
          bolt.intensity = storm.userData.flash * 900;
          // from high above the Bay, a fast dive down onto the spiral arms
          const k = prog(ctx.t, ctx.start, ctx.end, (x) => 1 - Math.pow(1 - x, 2.4));
          const c = storm.position;
          shoot(stage, mix3([c.x + 30, 240, c.z + 90], [c.x + 3, 9, c.z + 22], k), mix3([c.x - 6, 0, c.z - 10], [c.x - 1, 2, c.z - 1], k));
          stage.dof({ focus: stage.camera.position.distanceTo(c), aperture: 0.0008, maxblur: 0.006 });
        },
      };
    },
  },

  // ------------------------------------------------ s2: the track, day by day, to Narsapur
  track: {
    sounds: (ctx) => [{ t: ctx.start, s: "wind", gain: 0.35 }, { t: ctx.at("landfall") - 0.2, s: "thunder", gain: 0.6 }, { t: ctx.at("landfall") - 0.1, s: "thud", gain: 0.5 }],
    build(stage) {
      const { g } = bayMap();
      const tr = trackLine();
      g.add(tr.mesh);
      const storm = cycloneStorm(9, 5, 5000);
      g.add(storm);
      const dayDots = [[13.6, 87.0], [15.9, 84.8], [16.4, 81.85]].map(([la, lo]) => {
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
        d.position.copy(ll(la, lo, 1.3));
        g.add(d);
        return d;
      });
      return {
        group: g,
        update(ctx) {
          setStage(stage, 0x020610, 0.0012);
          const k = prog(ctx.t, ctx.start + 0.3, ctx.at("landfall") + 0.3, (x) => x);
          tr.draw(k * 0.86);
          const p = tr.curve.getPointAt(Math.min(0.86, k * 0.86));
          storm.position.set(p.x, 1.5, p.z);
          storm.userData.flash = lightning(ctx.t, 5, 0.5);
          storm.userData.update((ctx.t - ctx.start) * 1.1, 0.95);
          dayDots.forEach((d, i) => (d.visible = k * 0.86 >= [0.12, 0.45, 0.83][i]));
          shoot(stage, [p.x + 10, 80, p.z + 50], [p.x - 2, 0, p.z - 4]);
          const lab = (key, latlon, text, dx, dy, a) => ctx.O.callout(key, stage.camera, ll(...latlon, 1.2).toArray(), text, { dx, dy, alpha: a });
          lab("d26", [13.6, 87.0], "Oct 26", 40, -120, dayDots[0].visible ? 1 : 0);
          lab("d27", [15.9, 84.8], "Oct 27", 40, -140, dayDots[1].visible ? 1 : 0);
          lab("nar", PLACES.narsapur, "Narsapur · Oct 28", -40, -160, prog(ctx.t, ctx.at("Narsapur") - 0.3, ctx.at("Narsapur") + 0.3));
        },
      };
    },
  },

  // ------------------------------------------------ s3: warm sea water turns to rising vapour
  warm: {
    sounds: (ctx) => [{ t: ctx.start, s: "waves", gain: 0.3 }, { t: ctx.at("ఆవిరి") - 0.3, s: "shimmer", gain: 0.45 }],
    build(stage) {
      const g = new THREE.Group();
      const W = 60, N = 140;
      const seaGeo = new THREE.PlaneGeometry(W, W, N, N);
      seaGeo.rotateX(-Math.PI / 2);
      const colors = new Float32Array(seaGeo.attributes.position.count * 3);
      seaGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const sea = new THREE.Mesh(seaGeo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.2, clearcoat: 0.8 }));
      g.add(sea);
      const r = rand(9);
      const vapour = Array.from({ length: 1600 }, () => ({ x: (r() - 0.5) * W * 0.8, z: (r() - 0.5) * W * 0.8, phase: r(), speed: 0.6 + r() * 0.8, s: 0.25 + r() * 0.35 }));
      const puffs = puffField(vapour.length, { opacity: 0.8, soft: 2.2 });
      g.add(puffs.mesh);
      g.add(new THREE.HemisphereLight(0xcfe2ff, 0x10202c, 1.0));
      const sun = new THREE.DirectionalLight(0xffe6c0, 3.2);
      sun.position.set(20, 30, -20);
      g.add(sun);
      const cold = new THREE.Color(0x0a3a6e), hot = new THREE.Color(0xff7a2e), c = new THREE.Color();
      return {
        group: g,
        update(ctx) {
          setStage(stage, 0x7fa9d1, 0.003);
          const lt = ctx.t - ctx.start;
          const tw = ctx.at("degrees");
          const heat = prog(ctx.t, tw - 2.2, tw + 0.4);
          const p = seaGeo.attributes.position;
          for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), z = p.getZ(i);
            p.setY(i, Math.sin(x * 0.35 + lt * 1.6) * 0.45 + Math.cos(z * 0.28 + lt * 1.1) * 0.4);
            const patch = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.17) * 2) * Math.cos(z * 0.19 - Math.sin(x * 0.13) * 2);
            c.copy(cold).lerp(hot, clamp01(heat * patch * 1.1) * 0.7);
            colors.set([c.r, c.g, c.b], i * 3);
          }
          p.needsUpdate = true;
          seaGeo.attributes.color.needsUpdate = true;
          seaGeo.computeVertexNormals();
          const rise = prog(ctx.t, ctx.at("ఆవిరి") - 0.8, ctx.at("ఆవిరి") + 0.8);
          vapour.forEach((v, i) => {
            const y = ((lt * v.speed + v.phase * 8) % 8) * 1.6;
            puffs.set(i, v.x + Math.sin(y + i) * 0.4, y, v.z, v.s * rise * (0.6 + y / 12), 0.95);
          });
          puffs.commit();
          shoot(stage, [lt * 0.6 - 4, 14 + lt * 0.4, 30], [0, 2 + rise * 4, -4]);
          ctx.O.callout("temp", stage.camera, [0, 0.6, 0], "26.5°C +", { dx: -60, dy: -220, alpha: prog(ctx.t, tw - 0.2, tw + 0.4) });
        },
      };
    },
  },

  // ------------------------------------------------ s4: the heat engine: vapour → cloud → heat → low pressure → inflow
  engine: {
    sounds: (ctx) => [{ t: ctx.start, s: "wind", gain: 0.3 }, { t: ctx.at("pressure") - 0.3, s: "riser", gain: 0.4 }, { t: ctx.at("rush") - 0.3, s: "wind", gain: 0.7 }, { t: ctx.at("rush") - 0.2, s: "whoosh", gain: 0.6 }],
    build(stage) {
      const g = new THREE.Group();
      g.add(oceanPlane(220, 0x0d4d82));
      const r = rand(13);
      const cells = Array.from({ length: 2400 }, () => ({ a: r() * Math.PI * 2, u: r(), rr: r(), s: 1.4 + r() * 2.2, sh: 0.8 + r() * 0.2 }));
      const tower = puffField(cells.length, { opacity: 0.95 });
      g.add(tower.mesh);
      const arrows = new THREE.Group();
      const arrowMat = new THREE.MeshBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.95 });
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const arrow = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 9, 12), arrowMat);
        shaft.rotation.z = Math.PI / 2;
        const head = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3, 16), arrowMat);
        head.rotation.z = Math.PI / 2;
        head.position.x = -5.6;
        arrow.add(shaft, head);
        arrow.userData.a = a;
        arrows.add(arrow);
      }
      g.add(arrows);
      const low = new THREE.Mesh(new THREE.CircleGeometry(8, 48), new THREE.MeshBasicMaterial({ map: radialHaze(), color: 0xff7a40, transparent: true, opacity: 0, depthWrite: false }));
      low.rotation.x = -Math.PI / 2;
      low.position.y = 0.2;
      g.add(low);
      const heatLight = new THREE.PointLight(0xff9a50, 0, 120, 1.2);
      heatLight.position.set(0, 40, 0);
      g.add(heatLight, new THREE.HemisphereLight(0xcfe2ff, 0x10202c, 1.1));
      return {
        group: g,
        update(ctx) {
          setStage(stage, 0x5e8fbd, 0.005);
          const lt = ctx.t - ctx.start;
          const tHeat = ctx.at("heat"), tLow = ctx.at("pressure"), tIn = ctx.at("rush");
          const glow = prog(ctx.t, tHeat - 0.4, tHeat + 0.8);
          const flash = lightning(ctx.t, 13, 0.6) * glow;
          cells.forEach((p, i) => {
            const u = (p.u + lt * 0.08) % 1;
            const y = u * 64;
            const spread = y > 40 ? (y - 40) * 1.5 : 0;
            const rad = 3 + p.rr * (5 + spread);
            const a = p.a + lt * 0.6 + u * 4;
            // condensing puffs higher up glow warm: the heat they release
            const warmth = glow * clamp01((y - 20) / 20);
            tower.set(i, Math.cos(a) * rad, y, Math.sin(a) * rad, p.s * (0.7 + u), p.sh * (1 - 0.15 * warmth));
          });
          tower.commit();
          tower.mat.uniforms.uTint.value.set(1, 1 - 0.25 * glow, 1 - 0.45 * glow);
          tower.mat.uniforms.uFlash.value = flash;
          heatLight.intensity = 2500 * glow;
          low.material.opacity = 0.8 * prog(ctx.t, tLow - 0.3, tLow + 0.6);
          const inflow = prog(ctx.t, tIn - 1.4, tIn + 0.3);
          arrows.children.forEach((arrow, i) => {
            const d = 46 - ((lt * 9 + i * 3.1) % 30) * inflow;
            arrow.position.set(Math.cos(arrow.userData.a) * d, 1.2, Math.sin(arrow.userData.a) * d);
            arrow.rotation.y = -arrow.userData.a;
            arrow.visible = inflow > 0.01;
          });
          const k = prog(ctx.t, ctx.start, ctx.end, (x) => x);
          shoot(stage, [Math.sin(0.4 + k * 1.1) * 80, 20 + k * 26, Math.cos(0.4 + k * 1.1) * 80], [0, 22 - k * 10, 0]);
          ctx.O.callout("low", stage.camera, [0, 0.4, 0], "Low pressure", { dx: 60, dy: -180, alpha: prog(ctx.t, tLow - 0.2, tLow + 0.4) });
        },
      };
    },
  },

  // ------------------------------------------------ s5: Earth's spin bends the inflow into an anticlockwise swirl
  spin: {
    sounds: (ctx) => [{ t: ctx.start, s: "whoosh", gain: 0.5 }, { t: ctx.at("anti-clockwise") - 0.4, s: "wind", gain: 0.45 }, { t: ctx.at("anti-clockwise") - 0.2, s: "shimmer", gain: 0.4 }],
    async build(stage) {
      const g = new THREE.Group();
      const load = (f, srgb) => new Promise((ok) => new THREE.TextureLoader().load(`/assets/earth/${f}`, (t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; ok(t); }));
      const [day, clouds, normal, spec] = await Promise.all([load("earth_atmos_2048.jpg", true), load("earth_clouds_1024.png", true), load("earth_normal_2048.jpg"), load("earth_specular_2048.jpg")]);
      const earth = new THREE.Group();
      const E = 20;
      earth.add(new THREE.Mesh(new THREE.SphereGeometry(E, 128, 96), new THREE.MeshPhongMaterial({ map: day, normalMap: normal, specularMap: spec, shininess: 18 })));
      const cl = new THREE.Mesh(new THREE.SphereGeometry(E * 1.012, 96, 64), new THREE.MeshLambertMaterial({ map: clouds, transparent: true, opacity: 0.55, depthWrite: false }));
      earth.add(cl);
      const storm = cycloneStorm(2.4, 7, 2600);
      const lat = THREE.MathUtils.degToRad(16), lon = THREE.MathUtils.degToRad(86);
      const n = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
      const holder = new THREE.Group();
      holder.position.copy(n).multiplyScalar(E * 1.02);
      holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      holder.add(storm);
      earth.add(holder);
      g.add(earth);
      g.add(new THREE.Mesh(new THREE.SphereGeometry(E * 1.06, 64, 48), new THREE.MeshBasicMaterial({ color: 0x6fb0ff, transparent: true, opacity: 0.12, side: THREE.BackSide })));
      const sun = new THREE.DirectionalLight(0xffffff, 2.6);
      sun.position.set(40, 20, 60);
      g.add(sun, new THREE.AmbientLight(0x223344, 0.6));
      const starGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 1500 }, () => new THREE.Vector3().randomDirection().multiplyScalar(500 + Math.random() * 300)));
      g.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false })));
      return {
        group: g,
        update(ctx) {
          setStage(stage, 0x000006, 0);
          const lt = ctx.t - ctx.start;
          earth.rotation.y = Math.PI - 0.1 + lt * 0.05;
          cl.rotation.y = lt * 0.01;
          const formed = prog(ctx.t, ctx.at("anti-clockwise") - 1.8, ctx.at("anti-clockwise") + 0.5);
          storm.userData.update(lt * 2.2, Math.max(0.05, formed));
          const k = prog(ctx.t, ctx.start, ctx.end, (x) => 1 - Math.pow(1 - x, 2));
          const target = holder.getWorldPosition(new THREE.Vector3());
          shoot(stage, mix3([0, 10, 70], target.clone().multiplyScalar(1.75).add(new THREE.Vector3(0, 3, 0)).toArray(), k), mix3([0, 0, 0], target.toArray(), k));
        },
      };
    },
  },

  // ------------------------------------------------ s6: dive into the eye, then see the wall in section
  anatomy: {
    sounds: (ctx) => [
      { t: ctx.start, s: "wind", gain: 0.45 },
      { t: ctx.at("strongest") - 0.3, s: "wind", gain: 0.85 },
      { t: ctx.at("140") - 0.2, s: "thud", gain: 0.5 },
      ...flashTimes(ctx.start, ctx.end, 11, 0.5).map((t) => ({ t, s: "thunder", gain: 0.55 })),
    ],
    build(stage) {
      const g = new THREE.Group();
      g.add(oceanPlane(500, 0x0b3a63));
      const storm = cycloneStorm(30, 11, 18000, 2.6);
      g.add(storm);
      const ring = new THREE.Group();
      for (let i = 0; i < 10; i++) {
        const m = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.22, 8, 24, 0.5), new THREE.MeshBasicMaterial({ color: 0xff6040, toneMapped: false }));
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = (i / 10) * Math.PI * 2;
        m.position.y = 4;
        ring.add(m);
      }
      g.add(ring);
      const bolt = new THREE.PointLight(0xbfd4ff, 0, 80, 1.2);
      bolt.position.set(-6, 12, -4);
      g.add(bolt, new THREE.HemisphereLight(0xdbe8ff, 0x0a1a2a, 1.2));
      const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
      sun.position.set(30, 60, 20);
      g.add(sun);
      return {
        group: g,
        update(ctx) {
          setStage(stage, 0x2b4a68, 0.004);
          const lt = ctx.t - ctx.start;
          const tWall = ctx.at("wall");
          const cutOn = ctx.t > tWall - 0.5;
          storm.userData.flash = lightning(ctx.t, 11, 0.5);
          bolt.intensity = storm.userData.flash * 1500;
          storm.userData.update(lt * 0.9, 1, cutOn ? (x, z) => z > 0 && x > -2 : null);
          ring.rotation.y = lt * 1.8;
          ring.visible = ctx.t > ctx.at("strongest") - 0.4;
          // a dive straight down into the calm eye, walls rising around us; then the cutaway
          ctx.shots([
            [ctx.start, [0.5, 90, 3], [0, 0, 0], [0.4, 9, 1.2], [0, 0, 0]],
            [tWall - 0.4, [18, 13, 32], [0, 4, 0], [11, 9, 22], [0, 4, 0]],
            [ctx.at("Arnab") - 0.2, [42, 24, 42], [0, 3, 0], [30, 16, 34], [0, 4, 0]],
          ]);
          ctx.O.callout("eye", stage.camera, [0, 0.5, 0], "Eye", { dx: -50, dy: -200, alpha: prog(ctx.t, ctx.at("calm") - 0.2, ctx.at("calm") + 0.4) * (1 - prog(ctx.t, tWall - 0.6, tWall - 0.4)) });
          ctx.O.callout("wall", stage.camera, [4.4, 6, 0.5], "Eye wall", { dx: 50, dy: -180, alpha: prog(ctx.t, tWall, tWall + 0.4) });
          ctx.O.stat("wind", "140 km/h", "wind speed (gusts)", { alpha: prog(ctx.t, ctx.at("140") - 0.3, ctx.at("140") + 0.3), top: 300 });
        },
      };
    },
  },

  // ------------------------------------------------ s7: storm surge: big waves pile onto the coast
  surge: {
    sounds: (ctx) => [
      { t: ctx.start, s: "waves", gain: 0.7 },
      { t: ctx.start + 0.1, s: "rain", gain: 0.45 },
      { t: ctx.start + 0.2, s: "wind", gain: 0.5 },
      { t: ctx.start + 7.5, s: "waves", gain: 0.7 },
      { t: ctx.at("surge") - 0.4, s: "thud", gain: 0.55 },
      ...flashTimes(ctx.start, ctx.end, 17, 0.5).map((t) => ({ t, s: "thunder", gain: 0.6 })),
    ],
    build(stage) {
      const g = new THREE.Group();
      const land = new THREE.Mesh(new THREE.BoxGeometry(40, 2, 46), new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.95 }));
      land.position.set(26, -0.6, 0);
      land.rotation.z = 0.05;
      g.add(land);
      const grass = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 46), new THREE.MeshStandardMaterial({ color: 0x4f7a3a }));
      grass.position.set(32, 0.9, 0);
      g.add(grass);
      const palms = [];
      for (let i = 0; i < 7; i++) {
        const house = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2, 2.6), new THREE.MeshStandardMaterial({ color: [0xe8dcc4, 0xd4a373, 0xf1e3d3][i % 3] }));
        body.position.y = 1;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.4, 4), new THREE.MeshStandardMaterial({ color: 0x9c4a2f }));
        roof.position.y = 2.7;
        roof.rotation.y = Math.PI / 4;
        house.add(body, roof);
        house.position.set(22 + (i % 2) * 6, 1.1, -15 + i * 5);
        g.add(house);
        const palm = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 5, 8), new THREE.MeshStandardMaterial({ color: 0x7a5a3a }));
        trunk.position.y = 2.5;
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), new THREE.MeshStandardMaterial({ color: 0x3f7a35, flatShading: true }));
        crown.position.y = 5.2;
        palm.add(trunk, crown);
        palm.position.set(16 + (i % 3), 0.8, -16 + i * 5.2);
        g.add(palm);
        palms.push(palm);
      }
      // the sea: rolling swells marching to the shore, with foam on the crests
      const seaGeo = new THREE.PlaneGeometry(90, 46, 220, 110);
      seaGeo.rotateX(-Math.PI / 2);
      const seaCol = new Float32Array(seaGeo.attributes.position.count * 3);
      seaGeo.setAttribute("color", new THREE.BufferAttribute(seaCol, 3));
      const sea = new THREE.Mesh(seaGeo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.18, clearcoat: 1, transparent: true, opacity: 0.95 }));
      sea.position.x = -25;
      g.add(sea);
      const rain = rainField(2600, 70, 26, 21);
      g.add(rain.lines);
      const bolt = new THREE.PointLight(0xc8dcff, 0, 200, 1);
      bolt.position.set(-30, 40, -10);
      g.add(bolt, new THREE.HemisphereLight(0xb0c4d8, 0x2a2a2a, 1.0));
      const key = new THREE.DirectionalLight(0xdde6f0, 1.3);
      key.position.set(-20, 30, 20);
      g.add(key);
      const deep = new THREE.Color(0x173f57), foam = new THREE.Color(0xe8f2f6), c = new THREE.Color();
      return {
        group: g,
        update(ctx) {
          setStage(stage, 0x3d4b58, 0.011);
          const lt = ctx.t - ctx.start;
          const tRise = ctx.at("పెరుగుతుంది");
          const level = 1.7 * prog(ctx.t, tRise - 2.5, tRise + 1.5);
          const p = seaGeo.attributes.position;
          for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), z = p.getZ(i);
            // swells travel toward +x (the shore); sharper crests read as breaking waves
            const ph = x * 0.32 - lt * 2.6 + Math.sin(z * 0.15) * 0.8;
            const crest = Math.pow(0.5 + 0.5 * Math.sin(ph), 2.2);
            const y = level + crest * 1.6 + Math.sin(z * 0.5 + lt * 2) * 0.12;
            p.setY(i, y);
            c.copy(deep).lerp(foam, clamp01((crest - 0.72) * 3.2));
            seaCol.set([c.r, c.g, c.b], i * 3);
          }
          p.needsUpdate = true;
          seaGeo.attributes.color.needsUpdate = true;
          seaGeo.computeVertexNormals();
          rain.update(lt, 0, 0, 0.35, 34);
          const flash = lightning(ctx.t, 17, 0.5);
          bolt.intensity = flash * 6000;
          stage.scene.background.lerp(new THREE.Color(0x9fb3c8), flash * 0.6);
          palms.forEach((pm, i) => (pm.rotation.z = -0.18 - Math.sin(lt * 4 + i) * 0.08));
          const k = prog(ctx.t, ctx.start, ctx.end, (x) => x);
          shoot(stage, [-20 + k * 8, 4.5 + level * 0.6, 26 - k * 8], [12, 1.5, 0]);
          ctx.O.callout("surge", stage.camera, [4, 1 + level, 6], "+1 – 1.5 m", { dx: -40, dy: -200, alpha: prog(ctx.t, tRise - 0.4, tRise + 0.4) });
        },
      };
    },
  },

  // ------------------------------------------------ s8: over land the fuel is cut off; the rain goes on
  inland: {
    sounds: (ctx) => [{ t: ctx.start, s: "rain", gain: 0.55 }, { t: ctx.at("rains") - 0.3, s: "rain", gain: 0.6 }],
    build(stage) {
      const { g } = bayMap();
      const tr = trackLine();
      tr.draw(1);
      g.add(tr.mesh);
      const storm = cycloneStorm(9, 5, 5000);
      g.add(storm);
      const rain = rainField(2200, 26, 14, 31, 0xbcd6ff);
      g.add(rain.lines);
      return {
        group: g,
        update(ctx) {
          setStage(stage, 0x020610, 0.0012);
          const lt = ctx.t - ctx.start;
          const k = prog(ctx.t, ctx.start, ctx.end, (x) => x);
          const p = tr.curve.getPointAt(0.86 + 0.14 * k);
          storm.position.set(p.x, 1.5, p.z);
          const weak = 1 - 0.7 * prog(ctx.t, ctx.at("weak") - 1, ctx.at("weak") + 1.5);
          storm.userData.flash = lightning(ctx.t, 31, 0.4) * weak;
          storm.userData.update(lt * 1.0 * weak, weak);
          rain.update(lt, p.x, p.z, 0.15, 14);
          rain.mat.opacity = 0.55 * prog(ctx.t, ctx.at("rains") - 1.2, ctx.at("rains") + 0.4);
          shoot(stage, [p.x + 12, 46, p.z + 36], [p.x, 0, p.z]);
        },
      };
    },
  },

  // ------------------------------------------------ s9: stay safe
  safety: {
    sounds: (ctx) => [{ t: ctx.start, s: "rain", gain: 0.3 }, { t: ctx.at("Safe") - 0.2, s: "ding", gain: 0.35 }],
    build(stage) {
      const { g, rim } = bayMap();
      return {
        group: g,
        update(ctx) {
          setStage(stage, 0x020610, 0.0012);
          const lt = ctx.t - ctx.start;
          rim.material.opacity = 0.55 + 0.45 * Math.sin(lt * 4) ** 2;
          const k = prog(ctx.t, ctx.start, ctx.end, (x) => x);
          const c = ll(16.3, 81.8);
          shoot(stage, [c.x + 30 - k * 12, 110 - k * 30, c.z + 60 - k * 10], [c.x, 0, c.z - 4]);
          const tw = ctx.at("Safe");
          ctx.O.stat("safe", "Stay Safe", "ఇంట్లోనే ఉండండి · sea కి దూరంగా · alerts follow అవ్వండి", { alpha: prog(ctx.t, tw - 0.6, tw), top: 1160 });
        },
      };
    },
  },
};
