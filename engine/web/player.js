// Loads an episode's timeline and scenes, and exposes window.__seek(t).
//   /web/?ep=tatkal            preview in a browser, click to play with voice
//   /web/?ep=tatkal&t=12.5     a single still
// The renderer (scripts/render.mjs) drives __seek frame by frame.
import { createStage, shots } from "./engine.js";
import * as O from "./overlay.js";

const q = new URLSearchParams(location.search);
const ep = q.get("ep") || "tatkal";
const stage = createStage({ pixelRatio: Number(q.get("pr") || 1), ao: q.get("ao") !== "0" });
document.getElementById("frame").prepend(stage.renderer.domElement);

const timeline = await (await fetch(`/episodes/${ep}/timeline.json`, { cache: "no-store" })).json();
const episode = await import(`/episodes/${ep}/scenes.js`);
await Promise.all([
  document.fonts.load('600 60px "Anek Telugu"', "తెలుగు"),
  document.fonts.load('500 60px "Anek Telugu"', "తెలుగు"),
  document.fonts.load('800 60px "Inter Tight"', "0123"),
  document.fonts.load('700 60px "Inter Tight"', "0123"),
]);
await document.fonts.ready;

const chunks = O.makeChunks(timeline.words);
// build() may be async (scenes that load models)
const scenes = [];
for (const s of timeline.scenes) {
  const def = episode.scenes[s.id];
  if (!def) throw new Error(`episode has no scene "${s.id}"`);
  const built = await def.build(stage);
  built.group.visible = false;
  stage.scene.add(built.group);
  scenes.push({ ...s, def, built });
}

function wordTime(phrase, from) {
  const w = timeline.words.find((x) => x.start >= from - 0.01 && x.w.includes(phrase));
  if (!w) throw new Error(`no spoken word "${phrase}" after ${from.toFixed(2)}s`);
  return w.start;
}

function context(cur, t) {
  const ctx = {
    t,
    lt: t - cur.start,
    start: cur.start,
    end: cur.end,
    dur: cur.end - cur.start,
    stage,
    camera: stage.camera,
    O,
    at: (phrase) => wordTime(phrase, cur.start),
    seg: (id) => timeline.segments.find((s) => s.id === id),
    cuts: [],
    shots(list) {
      ctx.cuts = list.map((x) => x[0]);
      shots(stage, t, cur.end, list);
    },
  };
  return ctx;
}

function seek(t) {
  O.beginFrame();
  const cur = scenes.find((s) => t >= s.start && t < s.end) || scenes[scenes.length - 1];
  for (const s of scenes) s.built.group.visible = s === cur;
  const ctx = context(cur, t);
  stage.dof(null);
  cur.built.update(ctx);
  if (episode.steps && cur.def.step != null) O.stepper(episode.steps, cur.def.step);
  if (episode.captions !== false) O.caption(chunks, t);
  O.endFrame();
  // ?cam=x,y,z,tx,ty,tz overrides the shot (for checking a model from any side)
  if (q.has("cam")) {
    const v = q.get("cam").split(",").map(Number);
    stage.camera.position.set(v[0], v[1], v[2]);
    stage.camera.lookAt(v[3], v[4], v[5]);
    stage.dof(null);
  }
  stage.render();
}

/** Sound cues for the mix: a whoosh on every cut, plus each scene's own sounds. */
window.__cues = () => {
  const cues = [];
  for (const s of scenes) {
    O.beginFrame();
    const ctx = context(s, s.start);
    s.built.update(ctx);
    O.endFrame();
    for (const c of ctx.cuts) if (c > 0.3) cues.push({ t: c - 0.15, s: "whoosh", gain: 0.4 });
    if (s.start > 0.3 && !ctx.cuts.some((c) => Math.abs(c - s.start) < 0.3)) cues.push({ t: s.start - 0.15, s: "whoosh", gain: 0.4 });
    cues.push(...(s.def.sounds?.(ctx) || []));
  }
  return cues.filter((c) => c.t >= 0).sort((a, b) => a.t - b.t);
};
window.__timeline = timeline;
window.__seek = (t) => {
  seek(t);
  return true;
};
window.__ready = true;

// ?clean=1 hides every overlay: a bare 3D frame for thumbnails.
if (q.has("clean")) document.getElementById("overlay").style.display = "none";
if (q.has("t")) seek(Number(q.get("t")));
else if (!q.has("render")) {
  seek(0);
  const audio = timeline.audio ? new Audio(`/episodes/${ep}/${timeline.audio}`) : null;
  let t0 = null;
  const loop = (now) => {
    const el = (now - t0) / 1000;
    if (audio && el >= (timeline.lead || 0) && audio.paused && !audio.ended) audio.play();
    const t = audio && !audio.paused ? audio.currentTime + (timeline.lead || 0) : el;
    seek(t % timeline.duration);
    requestAnimationFrame(loop);
  };
  addEventListener("click", () => {
    if (t0 !== null) return;
    t0 = performance.now();
    requestAnimationFrame(loop);
  });
}
