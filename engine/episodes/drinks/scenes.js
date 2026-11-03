// Drinks: "what's the difference?" — Detective Panda explains, the Tiger asks.
// Format after the Telugu difference reels that work (two items up top, the line in the middle,
// the characters below, white set). Unbranded bottles; our own labels. Characters are licensed
// animated models (Sketchfab, CC-BY), clips chosen per line.
import { THREE, shoot, prog, bakeTexture, lerp } from "/web/engine.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { drawCast } from "./toon.js";
const VIS = await (await fetch("/episodes/drinks/visemes.json")).json();

export const captions = true;

// Canvas text falls back to a system face if the Telugu font is not loaded yet (it drew సారా as నారా).
if (typeof document !== "undefined" && document.fonts) {
  await Promise.all(["600 100px \"Anek Telugu\"", "500 100px \"Anek Telugu\"", "700 100px \"Inter Tight\""].map((f) => document.fonts.load(f, "కల్లు సారా తేడా ఏంటి మద్యం Liquor")));
  await document.fonts.ready;
}

// Theda-style captions: dark words on the white set, sitting between the products and the cast.
if (typeof document !== "undefined" && !document.getElementById("drinks-cap")) {
  document.head.insertAdjacentHTML("beforeend", `<style id="drinks-cap">
    .caption { bottom:auto !important; top:860px; background:none !important; color:#b9b9b9 !important;
      font-size:58px !important; font-weight:700 !important; padding:0 !important; white-space:normal !important;
      width:960px; line-height:1.3 !important; }
    .caption .said { color:#141414 !important; }
  </style>`);
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
// Voice loudness per frame + who is speaking ('t' tiger, 'p' panda): drives the mouths.
const MOUTH = await (await fetch("/episodes/drinks/mouth.json")).json();
const mouthAt = (t, who) => { const i = Math.round((t - MOUTH.lead) * MOUTH.fps); const f = MOUTH.f[Math.max(0, Math.min(MOUTH.f.length - 1, i))]; return f && f[1] === who ? f[0] : 0; };

/** The tiger's model has no jaw: bend its lower lip down about a hinge, and darken the mouth seam as it opens. */
function tigerMouth(root) {
  const u = { value: 0 };
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.side = THREE.DoubleSide;
    o.material.onBeforeCompile = (sh) => {
      sh.uniforms.uOpen = u;
      sh.vertexShader = "uniform float uOpen;\nvarying float vMouth;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
        {
          vMouth = smoothstep(39.6, 41.2, transformed.y) * (1.0 - smoothstep(41.4, 42.4, transformed.y)) * smoothstep(36.0, 40.0, transformed.z) * (1.0 - smoothstep(2.5, 6.0, abs(transformed.x))) * clamp(uOpen * 3.5, 0.0, 1.0);
          float w = (1.0 - smoothstep(41.0, 42.6, transformed.y)) * smoothstep(33.0, 38.0, transformed.z) * (1.0 - smoothstep(3.5, 7.0, abs(transformed.x))) * smoothstep(34.0, 37.5, transformed.y);
          vec2 hinge = vec2(42.5, 30.0);
          vec2 d = vec2(transformed.y, transformed.z) - hinge;
          float a = uOpen * w, c = cos(a), s = sin(a);
          vec2 r = vec2(d.x * c - d.y * s, d.x * s + d.y * c) + hinge;
          transformed.y = r.x; transformed.z = r.y;
        }`);
      sh.fragmentShader = "varying float vMouth;\n" + sh.fragmentShader.replace("#include <dithering_fragment>", "#include <dithering_fragment>\n gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.22, 0.04, 0.05), clamp(vMouth * 1.6, 0.0, 1.0));\n if (!gl_FrontFacing) gl_FragColor.rgb = vec3(0.18, 0.04, 0.05);");
    };
  });
  return u;
}
const backOut = (x) => { x = clamp01(x); const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const pop = (t, t0, d = 0.38) => (t < t0 ? 0 : backOut((t - t0) / d));
const A = (ctx, w, frac = 0.3) => { try { return ctx.at(w); } catch { return ctx.start + (ctx.end - ctx.start) * frac; } };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });

/** Baked text card. */
function card(lines, { w = 2, h = 0.6, bg = "rgba(0,0,0,0)", fg = "#141414", px = 220, size = 120, radius = 0.12, glow = false } = {}) {
  const cv = document.createElement("canvas");
  cv.width = Math.round(w * px); cv.height = Math.round(h * px);
  const g = cv.getContext("2d", { willReadFrequently: true });
  g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, cv.width, cv.height, radius * px); g.fill();
  g.textAlign = "center"; g.textBaseline = "middle";
  const arr = Array.isArray(lines) ? lines : [lines];
  arr.forEach((l, i) => {
    const s = typeof l === "string" ? { text: l } : l;
    let fs = s.size || size;
    const font = (f) => `${s.weight || 600} ${f}px "Anek Telugu", "Inter Tight"`;
    g.font = font(fs);
    while (g.measureText(s.text).width > cv.width - 30 && fs > 20) { fs -= 4; g.font = font(fs); }
    g.fillStyle = s.color || fg;
    g.fillText(s.text, cv.width / 2, (cv.height * (i + 0.5)) / arr.length + fs * 0.06);
  });
  const t = bakeTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false }));
}

// ---------------------------------------------------------------- bottles and glasses (procedural, unbranded)
const glassMat = (tint = 0xffffff, op = 0.25) => new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.05, metalness: 0, transmission: 0.0, transparent: true, opacity: op, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
const liquidMat = (c, op = 0.92) => new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.25), roughness: 0.2, transparent: true, opacity: op });
function lathe(profile, mat, seg = 48) {
  const m = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
  m.castShadow = true; return m;
}
/** A bottle: shape 'tall' | 'round' | 'wine' | 'flask'; glass tint, liquid colour, label text. */
function bottle({ shape = "tall", glass = 0xdde6e8, glassOp = 0.35, liquid = 0xc98a2b, fill = 0.72, label = "", labelBg = "#f6efe2", labelFg = "#1d1d1d", cap = 0x2b2b2b, h = 1.5 } = {}) {
  const g = new THREE.Group();
  const P = {
    tall: [[0, 0], [0.26, 0], [0.28, 0.04], [0.28, 0.66], [0.25, 0.74], [0.11, 0.86], [0.1, 1.0]],
    round: [[0, 0], [0.2, 0], [0.32, 0.12], [0.34, 0.36], [0.26, 0.6], [0.11, 0.72], [0.1, 1.0]],
    wine: [[0, 0], [0.22, 0], [0.23, 0.04], [0.23, 0.58], [0.2, 0.68], [0.09, 0.8], [0.085, 1.0]],
    flask: [[0, 0], [0.24, 0], [0.26, 0.05], [0.26, 0.5], [0.12, 0.7], [0.1, 1.0]],
  }[shape];
  const prof = P.map(([r, y]) => [r * h * 0.9, y * h]);
  g.add(lathe(prof, glassMat(glass, glassOp)));
  const fillY = fill * h * (shape === "round" ? 0.55 : 0.62);
  const liq = prof.filter(([, y]) => y <= fillY).map(([r, y]) => [Math.max(0, r - 0.015), y]);
  liq.push([0, fillY]);
  g.add(lathe(liq, liquidMat(liquid)));
  const capM = new THREE.Mesh(new THREE.CylinderGeometry(prof.at(-1)[0] + 0.01, prof.at(-1)[0] + 0.01, 0.12 * h, 24), std(cap, { roughness: 0.4 }));
  capM.position.y = h + 0.03; capM.castShadow = true; g.add(capM);
  if (label) {
    const r = prof[3][0] + 0.004;
    const tex = (() => {
      const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 512;
      const c = cv.getContext("2d"); c.fillStyle = labelBg; c.fillRect(0, 0, 1024, 512);
      c.strokeStyle = labelFg; c.lineWidth = 8; c.strokeRect(300, 40, 424, 432);
      c.fillStyle = labelFg; c.textAlign = "center"; c.textBaseline = "middle";
      let fs = 120; c.font = `600 ${fs}px "Anek Telugu","Inter Tight"`;
      while (c.measureText(label).width > 400 && fs > 30) { fs -= 6; c.font = `600 ${fs}px "Anek Telugu","Inter Tight"`; }
      c.fillText(label, 512, 256);
      const t = bakeTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const lab = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3 * h, 48, 1, true), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    lab.position.y = (shape === "round" ? 0.26 : 0.38) * h; lab.rotation.y = Math.PI; g.add(lab);
  }
  return g;
}
function glassCup({ kind = "mug", liquid = 0xf0b43a, foam = true, h = 1.0 } = {}) {
  const g = new THREE.Group();
  const prof = kind === "wine"
    ? [[0, 0], [0.32, 0], [0.32, 0.02], [0.04, 0.05], [0.04, 0.45], [0.24, 0.55], [0.3, 0.72], [0.28, 1.0]]
    : [[0, 0], [0.3, 0], [0.32, 0.02], [0.34, 1.0]];
  const p = prof.map(([r, y]) => [r * h, y * h]);
  g.add(lathe(p, glassMat(0xffffff, 0.12)));
  if (kind === "wine") {
    g.add(lathe([[0, 0.5 * h], [0.2 * h, 0.55 * h], [0.27 * h, 0.7 * h], [0, 0.7 * h]], liquidMat(liquid, 0.95)));
  } else {
    g.add(lathe([[0, 0.02 * h], [0.3 * h, 0.02 * h], [0.32 * h, 0.82 * h], [0, 0.82 * h]], liquidMat(liquid, 0.98)));
    if (foam) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.33 * h, 0.32 * h, 0.14 * h, 32), std(0xfffaf0, { roughness: 0.9 })); f.position.y = 0.89 * h; g.add(f); }
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2 * h, 0.04 * h, 10, 24, Math.PI), glassMat(0xffffff, 0.35)); handle.rotation.z = -Math.PI / 2; handle.position.set(0.34 * h, 0.5 * h, 0); g.add(handle);
  }
  return g;
}

// ---------------------------------------------------------------- models + characters
const loader = new GLTFLoader();
const cache = {};
async function load(path) { return (cache[path] ||= loader.loadAsync(path)); }
async function model(path, height, rotY = 0) {
  const gl = await load(path);
  const src = gl.scene.clone(true);
  src.rotation.y = rotY; src.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(src, true), size = box.getSize(V());
  const inner = new THREE.Group(); inner.add(src);
  src.position.sub(box.getCenter(V())).add(V(0, size.y / 2, 0));
  inner.scale.setScalar(height / size.y);
  src.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; } });
  const g = new THREE.Group(); g.add(inner);
  return g;
}
/** An animated character: clips by name; play(name, localTime) each frame (deterministic). */
async function actor(path, height, rotY, { jaw = null, head = null, shaderMouth = false } = {}) {
  const gl = await load(path);
  const { clone } = await import("three/addons/utils/SkeletonUtils.js");
  const src = clone(gl.scene);
  const mixer = new THREE.AnimationMixer(src);
  let jawB = null, headB = null;
  src.traverse((o) => { if (o.isBone && o.name === jaw) jawB = o; if (o.isBone && o.name === head) headB = o; });
  const mouthU = shaderMouth ? tigerMouth(src) : null;
  const acts = Object.fromEntries(gl.animations.map((c) => [c.name, mixer.clipAction(c)]));
  // size from the first clip's pose
  const first = Object.values(acts)[0]; if (first) { first.play(); mixer.update(0.5); }
  src.rotation.y = rotY; src.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(src, true), size = box.getSize(V());
  const inner = new THREE.Group(); inner.add(src);
  src.position.x -= box.getCenter(V()).x; src.position.z -= box.getCenter(V()).z; src.position.y -= box.min.y;
  inner.scale.setScalar(height / size.y);
  src.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  const g = new THREE.Group(); g.add(inner);
  let cur = null;
  g.userData.play = (name, local) => {
    const a = acts[name]; if (!a) return;
    if (cur !== a) { Object.values(acts).forEach((x) => { x.stop(); x.enabled = false; }); a.enabled = true; a.play(); cur = a; }
    const d = a.getClip().duration;
    mixer.setTime(((local % d) + d) % d);
  };
  /** Open the mouth by amp (0..1) after the clip has posed the skeleton. */
  g.userData.talk = (amp, t) => {
    if (jawB) jawB.rotateX(amp * 0.5);
    if (headB) { headB.rotateX(amp * 0.07 * Math.sin(t * 7)); headB.rotateZ(amp * 0.04 * Math.sin(t * 3.1)); }
    if (mouthU) mouthU.value = amp * 0.36;
  };
  return g;
}

// ---------------------------------------------------------------- the set
const SET = { top: 0xffffff };
function studio(stage, g) {
  stage.scene.background = new THREE.Color(0xffffff);
  stage.scene.fog = null;
  stage.ground.visible = false;
  stage.bloom(null);
  stage.ao?.(false);
  stage.renderer.toneMappingExposure = 1.05;
  const s = stage.sun; s.visible = true; s.intensity = 2.2; s.color.set(0xffffff);
  s.position.set(-3, 9, 7); s.target.position.set(0, 1, 0);
  const sc = s.shadow.camera; sc.left = sc.bottom = -6; sc.right = sc.top = 6; sc.far = 40; sc.updateProjectionMatrix();
  s.shadow.bias = -0.0004; s.shadow.normalBias = 0.02;
  stage.scene.traverse((o) => { if (o.isHemisphereLight) { o.intensity = 1.35; o.color.set(0xffffff); o.groundColor.set(0xd8d4cc); } });
  stage.camera.fov = 40; stage.camera.near = 0.1; stage.camera.far = 100; stage.camera.updateProjectionMatrix();
  void g;
}
function backdrop() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  m.position.set(0, 10, -12); return m;
}
function floor() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.14 })); sh.position.z = 0.002; sh.receiveShadow = true; m.add(sh);
  m.rotation.x = -Math.PI / 2; m.receiveShadow = true; return m;
}
const TIGER_X = -1.05, PANDA_X = 1.0;
async function cast(g) {
  g.add(floor(), backdrop());
  return {};
}
/** Who speaks when: the line's speaker gets a gentle bob; the other idles. */
function animateCast(ctx, c, { speaking = "panda", tigerX = 270, celebrate = false, wave = false } = {}) {
  const step = Math.floor(ctx.t / 1.3);
  const tigerPose = celebrate ? "both" : speaking === "puli" ? (step % 2 ? "open" : "think") : "rest";
  const pandaPose = wave ? "wave" : speaking === "panda" ? ["point", "open", "point", "rest"][step % 4] : "rest";
  drawCast({ t: ctx.t, vis: VIS, tigerX, tigerPose, pandaPose });
  void c;
}
const CAM = (stage, ctx) => {
  const k = prog(ctx.t, ctx.start, ctx.end);
  shoot(stage, [lerp(-0.15, 0.15, k), 2.35, lerp(9.4, 9.0, k)], [0, 2.3, 0]);
};

/** A product pair scene: left item, right item, their labels, and an answer tag under each. */
function pairScene({ q, a, left, right, lTag, rTag, warn = null, extra = null }) {
  return {
    sounds: (ctx) => [
      { t: A(ctx, "ఇది", 0.05) - 0.1, s: "paper", gain: 0.5 },
      { t: A(ctx, "Difference", 0.2) - 0.1, s: "ding", gain: 0.35 },
    ],
    async build(stage) {
      const g = new THREE.Group();
      const c = await cast(g);
      const L = await left(); L.position.set(-0.95, 3.0, 0); g.add(L);
      const R = await right(); R.position.set(0.95, 3.0, 0); g.add(R);
      const lT = card([{ text: lTag[0], size: 110 }], { w: 1.75, h: 0.42 }); lT.position.set(-0.95, 5.2, 0); g.add(lT);
      const rT = card([{ text: rTag[0], size: 110 }], { w: 1.75, h: 0.42 }); rT.position.set(0.95, 5.2, 0); g.add(rT);
      const lA = card([{ text: lTag[1], size: 64, color: "#c62828" }], { w: 1.75, h: 0.3 }); lA.position.set(-0.95, 4.82, 0); g.add(lA);
      const rA = card([{ text: rTag[1], size: 64, color: "#c62828" }], { w: 1.75, h: 0.3 }); rA.position.set(0.95, 4.82, 0); g.add(rA);
      const W = warn ? card([{ text: warn[1], size: 60, color: "#ffffff" }], { w: 3.6, h: 0.32, bg: "#c62828" }) : null;
      if (W) { W.position.set(0, 2.72, 0.8); g.add(W); }
      const X = extra ? await extra(g) : null;
      return {
        group: g,
        update(ctx) {
          studio(stage, g);
          const tq = A(ctx, "ఇది", 0.02), tq2 = A(ctx, rTag[0].split(" ")[0], 0.1), tA = ctx.at ? (() => { try { return ctx.at(a.startWord); } catch { return ctx.start + (ctx.end - ctx.start) * 0.35; } })() : ctx.start;
          const tL = (() => { try { return ctx.at(a.lWord); } catch { return tA; } })();
          const tR = (() => { try { return ctx.at(a.rWord); } catch { return tA + 2; } })();
          const kL = pop(ctx.t, tq - 0.15), kR = pop(ctx.t, Math.max(tq + 0.6, tq2 - 0.25));
          L.visible = kL > 0; L.scale.setScalar(Math.max(0.001, Math.min(1.08, kL))); L.rotation.y = Math.sin(ctx.t * 0.8) * 0.25;
          R.visible = kR > 0; R.scale.setScalar(Math.max(0.001, Math.min(1.08, kR))); R.rotation.y = -Math.sin(ctx.t * 0.8) * 0.25;
          lT.visible = kL > 0; rT.visible = kR > 0;
          // highlight the item being explained
          const onL = ctx.t > tL - 0.1 && ctx.t < tR - 0.1, onR = ctx.t > tR - 0.1;
          L.position.y = 3.0 + (onL ? 0.12 : 0); R.position.y = 3.0 + (onR ? 0.12 : 0);
          lA.visible = ctx.t > tL + 0.2; rA.visible = ctx.t > tR + 0.2;
          if (W) W.visible = ctx.t > A(ctx, warn[0], 0.9) - 0.1;
          const pandaTalks = ctx.t > tA - 0.3;
          animateCast(ctx, c, { speaking: pandaTalks ? "panda" : "puli" });
          if (X) X(ctx);
          CAM(stage, ctx);
        },
      };
    },
  };
}

// ---------------------------------------------------------------- scenes
export const scenes = {
  // ------------------------------------------------ hook: the tiger walks in with the question; panda greets
  intro: {
    sounds: (ctx) => [{ t: ctx.start, s: "whoosh", gain: 0.35 }, { t: A(ctx, "అస్సలు", 0.4) - 0.1, s: "ding", gain: 0.35 }],
    async build(stage) {
      const g = new THREE.Group();
      const c = await cast(g);
      const title = card([{ text: "మందు అంతా ఒకటేనా?", size: 130 }], { w: 4.0, h: 0.75 }); title.position.set(0, 4.6, 0); g.add(title);
      const sub = card([{ text: "Difference ఏంటి?", size: 120, color: "#c62828" }], { w: 3.4, h: 0.6 }); sub.position.set(0, 3.85, 0); g.add(sub);
      const items = [
        bottle({ shape: "tall", liquid: 0xb5651d, label: "?", h: 0.9 }),
        bottle({ shape: "wine", glass: 0x2e5d32, glassOp: 0.7, liquid: 0x5a1020, label: "?", h: 0.95 }),
        glassCup({ kind: "mug", liquid: 0xf2b630, h: 0.62 }),
        bottle({ shape: "round", liquid: 0x8a1c2a, label: "?", h: 0.85 }),
      ];
      items.forEach((m, i) => { m.position.set(-1.5 + i * 1.0, 2.75, -0.2); g.add(m); });
      return {
        group: g,
        update(ctx) {
          studio(stage, g);
          const walk = prog(ctx.t, ctx.start, ctx.start + 1.0);
          const t2 = A(ctx, "అస్సలు", 0.45);
          animateCast(ctx, c, { tigerX: lerp(-250, 270, walk), speaking: ctx.t > t2 - 0.4 ? "panda" : "puli" });
          title.visible = true;
          const ks = pop(ctx.t, ctx.start + 0.5); sub.scale.setScalar(Math.max(0.001, Math.min(1, ks)));
          items.forEach((m, i) => { const k = pop(ctx.t, t2 + i * 0.12); m.visible = k > 0; m.scale.setScalar(Math.max(0.001, Math.min(1, k))); m.rotation.y = ctx.t * 0.6 + i; });
          CAM(stage, ctx);
        },
      };
    },
  },

  p1: pairScene({
    a: { startWord: "కల్లు,", lWord: "కల్లు,", rWord: "సారా," },
    left: async () => {
      const g = new THREE.Group();
      const pot = await model("/assets/sf-claypot/model.glb", 0.9); g.add(pot);
      const froth = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 32), std(0xf6f0e0, { roughness: 0.95 })); froth.position.y = 0.86; g.add(froth);
      const palm = await model("/assets/sf-palm/model.glb", 1.4); palm.position.set(-0.55, 0, -0.4); g.add(palm);
      return g;
    },
    right: async () => bottle({ shape: "flask", glass: 0xeef4f4, glassOp: 0.3, liquid: 0xeef6f8, fill: 0.7, label: "సారా", h: 1.3 }),
    lTag: ["కల్లు", "Distill చేయరు"], rTag: ["సారా", "Distilled · గట్టిది"],
    warn: ["Licence", "⚠ Licence లేని సారా = ప్రాణాలకే ప్రమాదం".replace("⚠ ", "")],
  }),

  p2: pairScene({
    a: { startWord: "అంటే,", lWord: "అంటే,", rWord: "చక్కెర" },
    left: async () => bottle({ shape: "tall", liquid: 0xb8610f, glassOp: 0.18, label: "LIQUOR", h: 1.45 }),
    right: async () => bottle({ shape: "round", liquid: 0x9c1f3a, label: "LIQUEUR", labelBg: "#2a1418", labelFg: "#f6d38a", h: 1.35 }),
    lTag: ["Liquor", "Distilled మద్యం"], rTag: ["Liqueur", "+ చక్కెర, flavours"],
  }),

  p3: pairScene({
    a: { startWord: "రెండూ", lWord: "Lager,", rWord: "Ale," },
    left: async () => glassCup({ kind: "mug", liquid: 0xc07a08, h: 1.15 }),
    right: async () => glassCup({ kind: "mug", liquid: 0x3e1604, h: 1.15 }),
    lTag: ["Lager", "చల్లగా · crisp"], rTag: ["Ale", "వెచ్చగా · fruity"],
  }),

  p4: pairScene({
    a: { startWord: "నల్ల", lWord: "నల్ల", rWord: "లేకుండా," },
    left: async () => { const g = new THREE.Group(); const b = bottle({ shape: "wine", glass: 0x23401f, glassOp: 0.75, liquid: 0x5a0f1c, label: "RED", h: 1.4 }); b.position.x = -0.32; g.add(b); const c = glassCup({ kind: "wine", liquid: 0x6d1023, h: 0.9 }); c.position.set(0.38, 0, 0.2); g.add(c); return g; },
    right: async () => { const g = new THREE.Group(); const b = bottle({ shape: "wine", glass: 0xcfe0b8, glassOp: 0.45, liquid: 0xf3e3a0, label: "WHITE", h: 1.4 }); b.position.x = -0.32; g.add(b); const c = glassCup({ kind: "wine", liquid: 0xf2e7b0, h: 0.9 }); c.position.set(0.38, 0, 0.2); g.add(c); return g; },
    lTag: ["Red wine", "తొక్కలతో సహా"], rTag: ["White wine", "రసం మాత్రమే"],
  }),

  p5: pairScene({
    a: { startWord: "secret.", lWord: "France", rWord: "మిగతావన్నీ," },
    left: async () => model("/assets/sf-champagne/model.glb", 1.5),
    right: async () => bottle({ shape: "wine", glass: 0x2f5a3a, glassOp: 0.7, liquid: 0xf2e3a0, label: "SPARKLING", cap: 0xd4b04a, h: 1.45 }),
    lTag: ["Champagne", "France · Champagne ప్రాంతం"], rTag: ["Sparkling wine", "మిగతావన్నీ"],
    extra: async (g) => {
      const bub = Array.from({ length: 26 }, (_, i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); g.add(m); m.userData.r = Math.random(); return m; });
      return (ctx) => bub.forEach((m, i) => { const life = (ctx.t * 0.5 + m.userData.r) % 1; const side = i % 2 ? 0.95 : -0.95; m.position.set(side + Math.sin(i * 3 + life * 6) * 0.15, 4.5 + life * 0.6, 0.2); m.visible = life < 0.9; });
    },
  }),

  // ------------------------------------------------ outro: the tiger celebrates; the warning; the question
  outro: {
    sounds: (ctx) => [{ t: ctx.start, s: "sparkle", gain: 0.35 }, { t: A(ctx, "Comment", 0.8) - 0.2, s: "chime", gain: 0.45 }],
    async build(stage) {
      const g = new THREE.Group();
      const c = await cast(g);
      const warn = card([{ text: "మద్యం ఆరోగ్యానికి హానికరం", size: 90, color: "#ffffff" }], { w: 3.6, h: 0.5, bg: "#c62828" }); warn.position.set(0, 4.7, 0); g.add(warn);
      const q = card([{ text: "ఇంకా ఏ difference తెలియాలి?", size: 105 }, { text: "Comment చేయండి 👇".replace(" 👇", ""), size: 100, color: "#c62828" }], { w: 3.8, h: 1.1 }); q.position.set(0, 3.55, 0); g.add(q);
      return {
        group: g,
        update(ctx) {
          studio(stage, g);
          const tw = A(ctx, "గుర్తుంచుకో", 0.3), tc = A(ctx, "Comment", 0.8);
          animateCast(ctx, c, { celebrate: ctx.t < tw - 0.3, wave: ctx.t > tc - 0.5, speaking: ctx.t < tw - 0.3 ? "puli" : "panda" });
          warn.visible = ctx.t > tw - 0.2; q.visible = ctx.t > tc - 1.2;
          q.scale.setScalar(Math.max(0.001, Math.min(1, pop(ctx.t, tc - 1.2))));
          CAM(stage, ctx);
        },
      };
    },
  },
};
