// Tatkal: what happens inside that one minute.
// Every timed event hangs off a spoken word (ctx.at("…")), so when the voice
// is re-recorded, the pictures move with it.
import {
  THREE, C, mat, glow, box, sign, crowd, dots, place, arc, scatterCity, trees, coach, serverTower, phone,
  prog, clamp, lerp, rng, easeOut,
} from "/web/engine.js";

export const steps = ["10:00", "రద్దీ", "Bots", "కవచం", "Aadhaar", "సీటు"];

const inr = (n) => Math.round(n).toLocaleString("en-IN");
const hms = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const TEN = 10 * 3600;

/** Lights on a server tower: `load` 0..1 of them lit, flickering. */
function towerLoad(tower, t, load, hot = C.blue) {
  const L = tower.userData.lights;
  const on = new THREE.Color(hot), off = new THREE.Color(0x4a4e57);
  for (let i = 0; i < L.count; i++) {
    const flick = (Math.sin(i * 12.9898 + Math.floor(t * 8) * 78.233) * 43758.5453) % 1;
    L.setColorAt(i, Math.abs(flick) < load ? on : off);
  }
  L.instanceColor.needsUpdate = true;
}

/** A stream of request dots flying from sources to a target. */
function stream(inst, t, list) {
  let i = 0;
  for (const d of list) {
    if (i >= inst.count) break;
    const k = (t - d.t0) / d.dur;
    if (k < 0 || k > 1) continue;
    place(inst, i, d.path ? d.path(k) : arc(d.from, d.to, k, d.lift ?? 10), d.scale ?? 1);
    inst.setColorAt(i++, d.color);
  }
  for (; i < inst.count; i++) place(inst, i, [0, -50, 0], 0);
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
}
const BLUE = new THREE.Color(C.blue), RED = new THREE.Color(C.red), GREEN = new THREE.Color(C.green), ORANGE = new THREE.Color(C.orange);

// =====================================================================
export const scenes = {
  // ------------------------------------------------ 1. the clock strikes ten
  clock: {
    step: 0,
    sounds(ctx) {
      const tTen = ctx.at("గంటలు");
      return [
        { t: tTen - 3, s: "tick", gain: 0.6 }, { t: tTen - 2, s: "tick", gain: 0.6 }, { t: tTen - 1, s: "tick", gain: 0.6 },
        { t: tTen, s: "ding", gain: 0.55 },
        { t: ctx.at("ఒక్క") - 0.5, s: "riser", gain: 0.35 },
        { t: ctx.at("అయిపోతాయి"), s: "thud", gain: 0.6 },
      ];
    },
    build() {
      const g = new THREE.Group();
      box(150, 0.4, 7, 0x8e8a82, [0, 0, 0], g); // ballast
      for (const z of [-0.75, 0.75]) box(150, 0.18, 0.18, 0x6f727a, [0, 0.4, z], g);
      box(150, 1.1, 9, C.light, [0, 0, 8.5], g); // platform
      box(150, 0.12, 0.5, 0xe0c341, [0, 1.1, 4.4], g); // yellow edge
      const coaches = [];
      for (let i = 0; i < 5; i++) coaches.push(coach(g, [-46 + i * 23, 0.4, 0]));
      const windows = coaches.flatMap((c) => c.userData.windows.filter((w) => w.position.z > 0));
      const people = crowd(70);
      const r = rng(11);
      for (let i = 0; i < 70; i++) place(people, i, [lerp(-60, 60, r()), 1.1, 6 + r() * 5], 1, Math.PI + (r() - 0.5));
      people.instanceMatrix.needsUpdate = true;
      g.add(people);
      const tower = serverTower(g, [10, 0, -38], { h: 30 });
      const label = sign("IRCTC", { w: 9, h: 2.2, bg: "#1d1e21", fg: "#f3f1eb" });
      label.position.set(10, 33, -33.4);
      g.add(label);
      scatterCity(g, { seed: 5, n: 40, inner: 60, outer: 170, avoid: (x, z) => z > -20 && z < 30 });
      trees(g, [[-40, -14], [-30, -18], [25, -16], [44, -13], [60, -20]]);
      return {
        group: g,
        update(ctx) {
          const { t, O } = ctx;
          const tTen = ctx.at("గంటలు");
          const tSell = ctx.at("ఒక్క"), tGone = ctx.at("అయిపోతాయి");
          const tWhy = ctx.seg("s2").start;
          ctx.shots([
            [0, [-62, 3.2, 15], [0, 2.6, 0], [-46, 3.6, 16], [6, 2.8, 0]],
            [tTen, [-19, 6.8, 8.5], [-23, 3, 0], [-13, 7, 8.5], [-17, 3, 0]],
            [tGone - 0.3, [-10, 14, 34], [4, 3, 0], [-4, 16, 36], [8, 3, 0]],
            [tWhy, [10, 8, 18], [10, 20, -38], [18, 22, 26], [10, 20, -38]],
          ]);
          // clock: 09:59:57 → 10:00:00 lands on "గంటలు", then real seconds tick
          const sec = TEN + (t - tTen);
          O.clock(hms(sec), { urgent: t >= tTen });
          // seats sell out, window by window, while the sentence runs
          const sold = clamp((t - tSell) / (tGone + 0.8 - tSell));
          windows.forEach((w, i) => {
            const red = i / windows.length < sold;
            w.material.color.setHex(red ? C.red : 0x3a3d43);
            w.material.emissive?.setHex(red ? 0x5a0d08 : 0x000000);
          });
          const left = Math.round(120 * (1 - sold));
          O.readout("seats", String(left), "సీట్లు మిగిలాయి", "Tatkal quota", { color: left ? "#22a85a" : "#e5483b", alpha: prog(t, tTen - 0.3, tTen) });
          O.callout("coach", ctx.camera, [-23, 4.5, 1.6], "Tatkal సీట్లు", { dx: 40, dy: -230, alpha: prog(t, tTen, tTen + 0.5) * (1 - prog(t, tWhy, tWhy + 0.3)) });
          O.callout("irctc", ctx.camera, [10, 31, -33], "IRCTC సర్వర్లు", { dx: -60, dy: -160, alpha: prog(t, tWhy + 1.2, tWhy + 1.8) });
          towerLoad(tower, t, t < tTen ? 0.15 : 0.15 + 0.8 * prog(t, tTen, tTen + 2));
          O.chip("illus", "illustrative", { kind: "illustrative", top: 250 });
        },
      };
    },
  },

  // ------------------------------------------------ 2. lakhs of phones, one button
  rush: {
    step: 1,
    sounds(ctx) {
      return [
        { t: ctx.at("ఒకేసారి") - 0.4, s: "swarm", gain: 0.5 },
        { t: ctx.at("ఒకేసారి") + 4.2, s: "swarm", gain: 0.35 },
        { t: ctx.at("ముప్పై"), s: "riser", gain: 0.3 },
        { t: ctx.at("టికెట్లు"), s: "ding", gain: 0.5 },
      ];
    },
    build() {
      const g = new THREE.Group();
      const tower = serverTower(g, [0, 0, 0], { w: 12, h: 34, d: 12, rows: 16, cols: 6 });
      const label = sign("IRCTC", { w: 11, h: 2.6 });
      label.position.set(0, 37.6, 6.4);
      g.add(label);
      for (let k = 0; k < 6; k++) {
        const road = new THREE.Group();
        box(7, 0.08, 190, 0x3b3e44, [0, 0, 104], road);
        box(0.3, 0.1, 190, 0xf3f1eb, [0, 0, 104], road);
        box(1.4, 0.1, 190, C.green, [4.4, 0, 104], road);
        road.rotation.y = (k / 6) * Math.PI * 2 + 0.3;
        g.add(road);
      }
      scatterCity(g, { seed: 9, n: 110, inner: 40, outer: 200, avoid: (x, z) => Math.hypot(x, z) < 34 || Math.abs(Math.sin(Math.atan2(x, z) * 3 - 0.9)) < 0.18 });
      const r = rng(21);
      const N = 220;
      const phones = [];
      const bodyGeo = new THREE.BoxGeometry(1.5, 2.8, 0.25);
      bodyGeo.translate(0, 1.6, 0);
      const bodies = new THREE.InstancedMesh(bodyGeo, mat(C.ink), N);
      const scrGeo = new THREE.PlaneGeometry(1.25, 2.4);
      scrGeo.translate(0, 1.6, 0.14);
      const screens = new THREE.InstancedMesh(scrGeo, glow(0xffffff), N);
      for (let i = 0; i < N; i++) {
        const a = r() * Math.PI * 2, d = lerp(20, 120, Math.sqrt(r()));
        const p = [Math.cos(a) * d, 0, Math.sin(a) * d];
        const face = Math.atan2(-p[0], -p[2]);
        phones.push({ p, delay: r() });
        place(bodies, i, p, 1, face);
        place(screens, i, p, 1, face);
        screens.setColorAt(i, new THREE.Color(0xdfe8ff));
      }
      bodies.castShadow = true;
      g.add(bodies, screens);
      const packets = dots(1400, 0.32);
      g.add(packets);
      return {
        group: g,
        update(ctx) {
          const { t, O } = ctx;
          const tGo = ctx.at("ఒకేసారి"), tRec = ctx.seg("s4").start;
          const tNum = ctx.at("ముప్పై"), tTk = ctx.at("టికెట్లు");
          const orbit = (k, rad, h) => [Math.sin(0.6 + k) * rad, h, Math.cos(0.6 + k) * rad];
          ctx.shots([
            [ctx.start, [30, 3, 70], [0, 20, 0], [24, 4.5, 60], [0, 22, 0]],
            [tGo, orbit(0.2, 140, 95), [0, 8, 0], orbit(0.45, 128, 85), [0, 10, 0]],
            [tRec, [22, 6, 30], [0, 30, 0], [15, 9, 25], [0, 33, 0]],
            [tTk, orbit(0.8, 105, 60), [0, 38, 0], orbit(1.0, 98, 56), [0, 38, 0]],
          ]);
          // each phone fires a few requests, nearly all after "ఒకేసారి"
          const list = [];
          phones.forEach((ph, i) => {
            for (let k = 0; k < 6; k++) {
              const t0 = tGo - 0.6 + ph.delay * 1.2 + k * 1.6 + ((i * 7 + k * 13) % 10) * 0.05;
              list.push({ t0, dur: 1.5 + ph.delay * 0.6, from: [ph.p[0], 3, ph.p[2]], to: [0, 30, 0], lift: 18, color: BLUE });
            }
          });
          stream(packets, t, list);
          const lit = prog(t, tGo, tGo + 1.5);
          for (let i = 0; i < phones.length; i++) screens.setColorAt(i, lit > phones[i].delay ? new THREE.Color(0x7aa2ff) : new THREE.Color(0xdfe8ff));
          screens.instanceColor.needsUpdate = true;
          towerLoad(tower, t, 0.2 + 0.75 * lit, lit > 0.9 ? C.orange : C.blue);
          O.clock(hms(TEN + 3 + (t - ctx.start) * 0.4), { urgent: true });
          O.callout("phones", ctx.camera, phones[3].p.map((v, i) => (i === 1 ? 4.5 : v)), "లక్షల ఫోన్లు", { dx: 30, dy: -200, alpha: prog(t, ctx.start + 0.6, ctx.start + 1.2) * (1 - prog(t, tRec, tRec + 0.3)) });
          O.callout("one", ctx.camera, [0, 36, 0], "ఒకే బటన్, ఒకే క్షణం", { dx: -40, dy: -150, alpha: prog(t, tGo, tGo + 0.5) * (1 - prog(t, tRec, tRec + 0.3)) });
          const a = prog(t, tRec - 0.1, tRec + 0.5);
          O.stat("rec", inr(31814 * prog(t, tNum, tTk + 0.3, easeOut)), "టికెట్లు · ఒక్క నిమిషంలో", { alpha: a, top: 300 });
          O.chip("src", "Source: Ministry of Railways · record, 22 May 2025", { alpha: a, top: 560 });
          O.readout("rps", inr(31814 * prog(t, tNum, tTk + 0.3, easeOut)), "టికెట్లు/నిమిషం", "record", { alpha: a, color: "#f39a1e" });
        },
      };
    },
  },

  // ------------------------------------------------ 3. not everyone is human
  bots: {
    step: 2,
    sounds(ctx) {
      return [
        { t: ctx.at("bots") - 0.2, s: "zaps", gain: 0.35 },
        { t: ctx.at("software"), s: "swarm", gain: 0.35 },
        { t: ctx.seg("s6").start, s: "thud", gain: 0.5 },
      ];
    },
    build() {
      const g = new THREE.Group();
      const tower = serverTower(g, [0, 0, -40], { w: 11, h: 30, d: 11 });
      const label = sign("IRCTC", { w: 10, h: 2.4 });
      label.position.set(0, 33.4, -34.4);
      g.add(label);
      // humans with phones on the right
      const humans = [];
      const people = crowd(12, C.dark);
      const r = rng(4);
      for (let i = 0; i < 12; i++) {
        const p = [4 + (i % 3) * 3.4 + r() * 0.8, 0, 4 + Math.floor(i / 3) * 3.6 + r()];
        humans.push(p);
        place(people, i, p, 1.3, Math.PI);
        phone(g, [p[0], 1.3, p[2] - 0.55], [""], { scale: 0.22, rotY: Math.PI });
      }
      g.add(people);
      // bot rigs on the left: racks with red status strips
      const bots = [];
      for (let i = 0; i < 4; i++) {
        const p = [-11 + (i % 2) * 5, 0, 4 + Math.floor(i / 2) * 7];
        bots.push(p);
        box(4, 7, 3.2, C.ink, p, g);
        for (let k = 0; k < 6; k++) box(3.2, 0.25, 0.1, glow(C.red), [p[0], 0.8 + k * 1.05, p[2] + 1.62], g);
      }
      trees(g, [[18, -14], [-20, -20], [22, 14], [-24, 10]]);
      scatterCity(g, { seed: 3, n: 40, inner: 60, outer: 170 });
      const packets = dots(1600, 0.26);
      g.add(packets);
      return {
        group: g,
        update(ctx) {
          const { t, O } = ctx;
          const tBots = ctx.at("bots"), tSoft = ctx.at("software"), tPeak = ctx.seg("s6").start;
          ctx.shots([
            [ctx.start, [10, 4, 25], [7, 2, 8], [7, 5, 23], [6, 2, 6]],
            [tBots, [-3, 7, 27], [-9, 3.5, 7], [-9, 8, 28], [-9, 3.5, 6]],
            [tSoft, [-12, 10, 26], [0, 18, -34], [-7, 12, 24], [0, 20, -34]],
            [tPeak, [0, 44, 70], [0, 14, -14], [0, 56, 84], [0, 18, -20]],
          ]);
          const list = [];
          const target = [0, 22, -34];
          humans.forEach((p, i) => {
            for (let k = 0; k < 12; k++) list.push({ t0: ctx.start + (i % 7) * 0.31 + k * 1.3, dur: 2.2, from: [p[0], 2.2, p[2]], to: target, lift: 8, color: BLUE });
          });
          const botOn = ctx.start + (tBots - ctx.start) * 0.6;
          bots.forEach((p, b) => {
            for (let k = 0; k < 260; k++) {
              const t0 = botOn + b * 0.05 + k * 0.075;
              list.push({ t0, dur: 1.1, from: [p[0], 6.5, p[2]], to: target, lift: 6, color: RED, scale: 0.8 });
            }
          });
          stream(packets, t, list);
          towerLoad(tower, t, 0.4 + 0.55 * prog(t, botOn, botOn + 2), t > botOn + 1.5 ? C.red : C.blue);
          O.callout("human", ctx.camera, [humans[2][0], 2.4, humans[2][2]], "మనిషి", { dx: 20, dy: -170, alpha: prog(t, ctx.start + 0.4, ctx.start + 1) });
          O.callout("bot", ctx.camera, [bots[0][0], 7.2, bots[0][2]], "bot · software", { dx: -20, dy: -200, alpha: prog(t, tBots, tBots + 0.5), accent: "#e5483b" });
          O.callout("fast", ctx.camera, [-6, 14, -12], "సెకనుకి ఎన్నో clicks", { dx: -40, dy: -200, alpha: prog(t, tSoft, tSoft + 0.5) * (1 - prog(t, tPeak, tPeak + 0.3)) });
          // "first five minutes": the clock runs 10:00 → 10:05 under the sentence
          const k = prog(t, tPeak, ctx.end - 0.6, (x) => x);
          O.clock(hms(TEN + k * 300), { urgent: true, alpha: prog(t, tPeak - 0.2, tPeak + 0.2) });
          O.stat("peak", "5 నిమిషాలు", "bot traffic ఎక్కువగా ఉండేది ఇప్పుడే", { alpha: prog(t, tPeak + 0.4, tPeak + 1), top: 300 });
          O.chip("src", "Source: Ministry of Railways, June 2025", { alpha: prog(t, tPeak + 0.4, tPeak + 1), top: 540 });
          O.chip("illus", "illustrative", { kind: "illustrative", top: 250, alpha: 1 - prog(t, tPeak, tPeak + 0.3) });
        },
      };
    },
  },

  // ------------------------------------------------ 4. the shield
  shield: {
    step: 3,
    sounds(ctx) {
      return [
        { t: ctx.at("CDN") - 0.2, s: "zaps", gain: 0.45 },
        { t: ctx.at("ఆపేస్తుంది") - 0.2, s: "zaps", gain: 0.5 },
        { t: ctx.seg("s8").start, s: "thud", gain: 0.55 },
      ];
    },
    build() {
      const g = new THREE.Group();
      const tower = serverTower(g, [0, 0, -36], { w: 12, h: 30, d: 12 });
      const label = sign("IRCTC", { w: 11, h: 2.6 });
      label.position.set(0, 33.6, -29.4);
      g.add(label);
      // the wall: glass panel on a frame
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(34, 14, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x9fb8ff, transparent: true, opacity: 0.28, roughness: 0.1 })
      );
      wall.position.set(0, 7.4, 0);
      g.add(wall);
      for (let x = -17; x <= 17; x += 5.666) box(0.6, 14.8, 0.8, C.dark, [x, 0, 0], g);
      box(35, 0.7, 0.9, C.dark, [0, 14.4, 0], g);
      const gridMat = new THREE.LineBasicMaterial({ color: 0x5c7cd6, transparent: true, opacity: 0.5 });
      const pts = [];
      for (let y = 2; y < 14; y += 2) pts.push(new THREE.Vector3(-17, y + 0.4, 0.25), new THREE.Vector3(17, y + 0.4, 0.25));
      g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
      const r = rng(8);
      const sources = [];
      for (let i = 0; i < 40; i++) sources.push({ p: [lerp(-15, 15, r()), 2, lerp(24, 70, r())], bot: r() < 0.45, d: r() });
      // a heap of blocked requests grows at the foot of the wall
      const heap = dots(500, 0.34);
      g.add(heap);
      const packets = dots(1500, 0.3);
      g.add(packets);
      scatterCity(g, { seed: 13, n: 50, inner: 70, outer: 190 });
      return {
        group: g,
        update(ctx) {
          const { t, O } = ctx;
          const tCdn = ctx.at("CDN"), tStop = ctx.at("ఆపేస్తుంది"), tIds = ctx.seg("s8").start;
          ctx.shots([
            [ctx.start, [6, 34, 104], [0, 8, -6], [2, 28, 88], [0, 8, -6]],
            [tCdn, [26, 10, 14], [0, 7, 0], [21, 12, 19], [0, 7, 0]],
            [tStop, [7, 2.6, 14], [0, 3, 0], [-5, 3, 14], [0, 3, 0]],
            [tIds, [-16, 24, 60], [0, 12, -6], [-6, 40, 82], [0, 16, -14]],
          ]);
          const list = [];
          let blocked = 0;
          sources.forEach((s, i) => {
            const every = s.bot ? 0.22 : 1.1;
            for (let k = 0; k * every < ctx.dur + 2; k++) {
              const t0 = ctx.start - 1 + s.d * every + k * every;
              const from = s.p, wallHit = [s.p[0] * 0.9, 3 + s.d * 9, 0];
              if (s.bot) {
                // flies to the wall, then drops
                const fly = 1.0, fall = 0.7;
                if (t > t0 + fly + fall) {
                  blocked++;
                  continue;
                }
                list.push({ t0, dur: fly + fall, color: RED, scale: 0.85, path: (kk) => {
                  const tt = kk * (fly + fall);
                  if (tt < fly) return arc(from, wallHit, tt / fly, 3);
                  const f = (tt - fly) / fall;
                  return [wallHit[0], lerp(wallHit[1], 0.4, f * f), 0.9 + f * 1.6];
                } });
              } else {
                list.push({ t0, dur: 2.4, color: BLUE, path: (kk) => (kk < 0.5 ? arc(from, [s.p[0] * 0.8, 7, 0], kk * 2, 3) : arc([s.p[0] * 0.8, 7, 0], [0, 22, -30], (kk - 0.5) * 2, 4)) });
              }
            }
          });
          stream(packets, t, list);
          for (let i = 0; i < heap.count; i++) {
            const show = i < blocked * 0.6;
            place(heap, i, [lerp(-15, 15, ((i * 0.618) % 1)), 0.35 + ((i * 7) % 5) * 0.12, 1.2 + ((i * 3) % 7) * 0.35], show ? 1 : 0);
            heap.setColorAt(i, RED);
          }
          heap.instanceMatrix.needsUpdate = true;
          heap.instanceColor.needsUpdate = true;
          towerLoad(tower, t, 0.55, C.blue);
          O.callout("wall", ctx.camera, [-9, 14.8, 0], "కవచం · CDN", { dx: -30, dy: -170, alpha: prog(t, tCdn, tCdn + 0.5) });
          O.callout("stop", ctx.camera, [6, 0.8, 2], "bots ఇక్కడే ఆగిపోతాయి", { dx: 30, dy: -190, alpha: prog(t, tStop, tStop + 0.5) * (1 - prog(t, tIds, tIds + 0.3)), accent: "#e5483b" });
          const a = prog(t, tIds, tIds + 0.6);
          const tNum = ctx.at("కోట్లకు");
          O.stat("ids", (3.02 * prog(t, tIds, tNum + 0.4, easeOut)).toFixed(2) + " కోట్లు", "అనుమానాస్పద IDs · deactivate", { alpha: a, top: 300, color: "#e5483b" });
          O.chip("src", "Source: Lok Sabha reply · since Jan 2025", { alpha: a, top: 540 });
          O.chip("illus", "illustrative", { kind: "illustrative", top: 250 });
        },
      };
    },
  },

  // ------------------------------------------------ 5. Aadhaar gate + agents wait
  verify: {
    step: 4,
    sounds(ctx) {
      const tOtp = ctx.at("OTP");
      return [
        { t: ctx.start + 1.2, s: "beep", gain: 0.3 }, { t: ctx.start + 2.6, s: "beep", gain: 0.3 },
        { t: tOtp - 0.4, s: "keys", gain: 0.55 },
        { t: tOtp + 0.9, s: "ding", gain: 0.45 },
        { t: ctx.seg("s10").start, s: "thud", gain: 0.4 },
      ];
    },
    build() {
      const g = new THREE.Group();
      box(40, 0.15, 70, 0xdcd8cf, [0, 0, 0], g);
      const gates = [];
      for (let i = 0; i < 4; i++) {
        const x = -6.75 + i * 4.5;
        box(0.7, 2.4, 3, C.dark, [x - 1.6, 0, 0], g);
        box(0.7, 2.4, 3, C.dark, [x + 1.6, 0, 0], g);
        const light = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.3, 0.5), glow(0x6a6d74));
        light.material = light.material.clone();
        light.position.set(x, 3.6, 0);
        box(0.25, 1.2, 0.25, C.dark, [x - 1.9, 2.4, 0], g);
        box(0.25, 1.2, 0.25, C.dark, [x + 1.9, 2.4, 0], g);
        g.add(light);
        gates.push({ x, light });
      }
      for (let i = 0; i < 5; i++) box(0.2, 0.02, 30, 0xf3f1eb, [-9 + i * 4.5, 0.15, 14], g);
      const N = 40;
      const walkers = crowd(N, C.dark);
      g.add(walkers);
      const r = rng(17);
      const plan = Array.from({ length: N }, (_, i) => ({ lane: i % 4, t: (i / N) * 16 + r() * 0.6, sp: 4.2 + r() * 1.2 }));
      // the agents, held behind a boom barrier
      const agents = crowd(9, C.orange);
      for (let i = 0; i < 9; i++) place(agents, i, [10 + (i % 3) * 2.2, 0, 16 + Math.floor(i / 3) * 2.4], 1.15, Math.PI);
      agents.instanceMatrix.needsUpdate = true;
      g.add(agents);
      box(1, 3, 1, C.dark, [9, 0, 13.5], g);
      const boom = new THREE.Group();
      boom.position.set(9, 2.6, 13.5);
      for (let k = 0; k < 6; k++) box(1.6, 0.4, 0.4, k % 2 ? C.paper : C.red, [1.2 + k * 1.6, -0.2, 0], boom);
      g.add(boom);
      const ph = phone(g, [-11, 0.6, 14], ["Aadhaar OTP", "", ""], { scale: 1.7, rotY: 0.3 });
      return {
        group: g,
        update(ctx) {
          const { t, O } = ctx;
          const tOtp = ctx.at("OTP"), tAg = ctx.seg("s10").start, tAc = ctx.at("AC");
          ctx.shots([
            [ctx.start, [0, 13, 46], [0, 2.5, 2], [0, 10, 36], [0, 2.5, 2]],
            [ctx.at("verify"), [13, 5, 11], [-2, 2, -1], [11, 5.5, 7], [-2, 2, -2]],
            [tOtp, [-8, 9, 34], [-9, 4.5, 13], [-9.5, 6, 25], [-10, 4, 14]],
            [tAg, [10, 10, 40], [11, 2.5, 15], [14, 6, 30], [11, 2, 16]],
            [tAc, [4, 22, 56], [4, 2, 6], [2, 26, 62], [3, 2, 4]],
          ]);
          const lt = t - ctx.start;
          const lit = gates.map(() => 0);
          plan.forEach((p, i) => {
            const z = 26 - (lt - p.t) * p.sp;
            const x = gates[p.lane].x + ((i * 0.37) % 1 - 0.5) * 0.6;
            place(walkers, i, [x, 0.15, z], z > 30 || z < -40 ? 0 : 1.15, Math.PI);
            if (Math.abs(z) < 1.6) lit[p.lane] = 1;
          });
          walkers.instanceMatrix.needsUpdate = true;
          gates.forEach((gt, i) => gt.light.material.color.setHex(lit[i] ? C.green : 0x6a6d74));
          const code = ["4", "8", "2", "9", "1", "6"];
          const typed = Math.floor(clamp((t - tOtp + 0.4) / 1.2) * 6);
          ph.userData.screen.userData.draw([
            { text: "Aadhaar OTP", font: '700 60px "Inter Tight"' },
            { text: code.map((c, i) => (i < typed ? c : "•")).join(" "), font: '800 96px "Inter Tight"' },
            { text: typed >= 6 ? "✓ verified" : "", color: "#22a85a", font: '700 64px "Inter Tight"' },
          ]);
          boom.rotation.z = 0;
          O.callout("gate", ctx.camera, [0, 3.8, 0], "Aadhaar verified accounts మాత్రమే", { dx: -40, dy: -200, alpha: prog(t, ctx.start + 0.5, ctx.start + 1.1) * (1 - prog(t, tAg, tAg + 0.3)) });
          O.callout("agents", ctx.camera, [12.2, 2.4, 18.4], "Agents · ఆగాలి", { dx: -30, dy: -210, alpha: prog(t, tAg, tAg + 0.5), accent: "#f39a1e" });
          const k = prog(t, tAc, ctx.end - 0.5, (x) => x);
          O.clock(hms(TEN + k * 1800), { alpha: prog(t, tAc - 0.3, tAc), urgent: true });
          const ca = prog(t, tAc, tAc + 0.5);
          O.chip("ac", "AC: 10:00–10:30  ·  Non-AC: 11:00–11:30", { alpha: ca, top: 340 });
          O.chip("src", "Source: Ministry of Railways, Tatkal rules from July 2025", { alpha: ca, top: 400 });
        },
      };
    },
  },

  // ------------------------------------------------ 6. one queue, 72 berths
  seats: {
    step: 5,
    sounds(ctx) {
      return [
        { t: ctx.at("వరుసలో") - 0.4, s: "clicks", gain: 0.5 },
        { t: ctx.at("వరుసలో") + 3.4, s: "clicks", gain: 0.45 },
        { t: ctx.at("వాళ్ళదే") + 0.8, s: "thud", gain: 0.6 },
        { t: ctx.at("ఆట"), s: "ding", gain: 0.5 },
      ];
    },
    build() {
      const g = new THREE.Group();
      const L = 30, Wd = 7;
      box(Wd, 0.4, L, C.paper, [0, 0, 0], g);
      for (const x of [-Wd / 2, Wd / 2]) box(0.25, 1.6, L, C.light, [x, 0.4, 0], g);
      for (const z of [-L / 2, L / 2]) box(Wd, 1.6, 0.25, C.light, [0, 0.4, z], g);
      const berths = [];
      for (let bay = 0; bay < 9; bay++) {
        const z0 = -L / 2 + 1.7 + bay * 3.2;
        const spots = [[-2.5, z0 - 0.7], [-2.5, z0 + 0.7], [-1.5, z0 - 0.7], [-1.5, z0 + 0.7], [-0.5, z0 - 0.7], [-0.5, z0 + 0.7], [2.0, z0], [2.9, z0]];
        for (const [x, z] of spots) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 1.2), new THREE.MeshStandardMaterial({ color: C.light, roughness: 0.7 }));
          m.position.set(x, 0.6, z);
          m.castShadow = m.receiveShadow = true;
          g.add(m);
          berths.push(m);
        }
      }
      const r = rng(31);
      const order = berths.map((_, i) => i).sort(() => r() - 0.5);
      const queue = dots(140, 0.36);
      g.add(queue);
      box(1.4, 0.06, 46, 0xd2cdc2, [0.9, 0, -L / 2 - 23], g);
      const late = crowd(16, C.mid);
      for (let i = 0; i < 16; i++) place(late, i, [0.9, 0, -L / 2 - 24 - i * 1.6], 1.1, 0);
      late.instanceMatrix.needsUpdate = true;
      g.add(late);
      trees(g, [[-12, -20], [12, 6], [-11, 18], [13, -30]]);
      return {
        group: g,
        update(ctx) {
          const { t, O } = ctx;
          const tQ = ctx.at("వరుసలో"), tWin = ctx.at("వాళ్ళదే"), tTip = ctx.seg("s12").start, tGame = ctx.at("ఆట");
          ctx.shots([
            [ctx.start, [14, 22, 40], [0, 0, -4], [10, 20, 34], [0, 0, -4]],
            [tQ, [4, 3, -9], [0.9, 1.3, -32], [3, 3.6, -12], [0.9, 1.3, -32]],
            [ctx.at("request"), [5, 34, 30], [0, 0, -6], [0, 40, 24], [0, 0, -6]],
            [tTip, [0, 46, 26], [0, 0, -8], [0, 60, 36], [0, 0, -12]],
          ]);
          // one dot per berth, in a single file from the right; first come, first seated
          const fillStart = tQ - 0.4, fillEnd = tWin + 0.8;
          const list = [];
          let filled = 0;
          order.forEach((b, k) => {
            const land = lerp(fillStart, fillEnd, k / order.length);
            const target = berths[b].position;
            const t0 = land - 1.2;
            if (t >= land) filled++;
            list.push({ t0, dur: 1.2, color: BLUE, path: (kk) => {
              const door = [0.9, 1.3, -L / 2 + 0.5];
              if (kk < 0.6) return [0.9, 1.3, lerp(-L / 2 - 22, door[2], kk / 0.6)];
              return arc(door, [target.x, 1.1, target.z], (kk - 0.6) / 0.4, 1.5);
            } });
            berths[b].material.color.setHex(t >= land ? C.green : C.light);
          });
          stream(queue, t, list);
          const left = berths.length - filled;
          O.readout("left", String(left), "సీట్లు మిగిలాయి", left ? "Tatkal" : "Waitlist మొదలు", { color: left ? "#22a85a" : "#e5483b" });
          O.clock(hms(TEN + 50 + (t - ctx.start) * 0.4), { urgent: true, alpha: 1 - prog(t, tTip, tTip + 0.3) });
          O.callout("queue", ctx.camera, [0.9, 1.5, -L / 2 - 8], "ఒకే వరుస", { dx: 20, dy: -180, alpha: prog(t, tQ, tQ + 0.5) * (1 - prog(t, tTip, tTip + 0.3)) });
          O.callout("late", ctx.camera, [0.9, 2, -L / 2 - 30], "ఆలస్యం = waitlist", { dx: -30, dy: -170, alpha: prog(t, tWin + 0.8, tWin + 1.3) * (1 - prog(t, tTip, tTip + 0.3)), accent: "#e5483b" });
          O.stat("tip", "09:58", "కే login అయి, వివరాలు సిద్ధం", { alpha: prog(t, tTip + 0.3, tTip + 0.9), top: 300 });
          O.stat("end", "ఆ ఒక్క నిమిషమే", "అసలు ఆట", { alpha: prog(t, tGame - 0.2, tGame + 0.3), top: 640, color: "#2f6bff" });
          O.chip("illus", "illustrative", { kind: "illustrative", top: 250 });
        },
      };
    },
  },
};
