// The 2D half of the kit: captions, callouts, stepper, stats, chips, clock.
// Scenes call these every frame; anything not called in a frame is hidden,
// so a scene never has to remember to clean up after itself.
import { THREE, clamp } from "./engine.js";

const root = document.getElementById("overlay");
const W = 1080, H = 1920;
const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
svg.classList.add("lines");
root.append(svg);

const pool = new Map();
let touched = new Set();
function el(key, make) {
  touched.add(key);
  if (!pool.has(key)) pool.set(key, make());
  return pool.get(key);
}
function div(cls, parent = root) {
  const d = document.createElement("div");
  d.className = cls;
  parent.append(d);
  return d;
}
function show(node, alpha) {
  node.style.opacity = alpha;
  node.style.display = alpha <= 0.001 ? "none" : "";
}

let statShown = false;
export function beginFrame() {
  touched = new Set();
  statShown = false;
}
export function endFrame() {
  if (statShown && pool.has("clock")) pool.get("clock").style.display = "none";
  for (const [key, node] of pool) {
    if (touched.has(key)) continue;
    for (const n of [].concat(node.nodes || node)) n.style.display = "none";
  }
}

// ---------- callouts pinned to 3D points ----------
const _v = new THREE.Vector3();
export function project(camera, pos) {
  _v.set(pos[0], pos[1], pos[2]).project(camera);
  return { x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H, behind: _v.z > 1 };
}
/**
 * A label with a leader line to a world point, like the reference reels.
 * `dx, dy` place the label relative to the point, in screen pixels.
 */
export function callout(key, camera, pos, text, { dx = -120, dy = -220, alpha = 1, pill = false, accent } = {}) {
  const node = el("co:" + key, () => {
    const box = div("callout");
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("r", 7);
    svg.append(line, dot);
    return { nodes: [box, line, dot], box, line, dot };
  });
  const p = project(camera, pos);
  if (p.behind) alpha = 0;
  node.box.textContent = text;
  node.box.classList.toggle("pill", pill);
  node.box.style.borderColor = accent || "";
  const bw = node.box.offsetWidth || 300;
  // dx < 0: label sits left of the point and the line leaves its right end; dx > 0 the reverse
  const left = clamp(dx < 0 ? p.x + dx - bw : p.x + dx, 40, W - 40 - bw);
  const ly = clamp(p.y + dy, 330, H - 560);
  node.box.style.left = left + "px";
  node.box.style.top = ly + "px";
  node.box.style.transform = "translateY(-100%)";
  const anchorX = dx < 0 ? left + bw : left;
  node.line.setAttribute("points", `${anchorX},${ly} ${p.x},${p.y}`);
  node.dot.setAttribute("cx", p.x);
  node.dot.setAttribute("cy", p.y);
  for (const n of node.nodes) show(n, alpha);
  node.line.style.strokeDasharray = 2000;
  node.line.style.strokeDashoffset = 2000 * (1 - clamp(alpha * 1.4));
}

// ---------- the stepper across the top ----------
export function stepper(steps, active, alpha = 1) {
  const node = el("stepper", () => {
    const wrap = div("stepper");
    const track = div("track", wrap);
    const marks = steps.map((_, i) => {
      const m = div("mark", track);
      m.style.left = (i / (steps.length - 1)) * 100 + "%";
      return m;
    });
    const tag = div("tag", wrap);
    return { nodes: [wrap], wrap, marks, tag };
  });
  const i = Math.round(active);
  node.marks.forEach((m, k) => m.classList.toggle("on", k === i));
  node.marks.forEach((m, k) => m.classList.toggle("done", k < i));
  node.tag.textContent = steps[i];
  node.tag.style.left = (i / (steps.length - 1)) * 100 + "%";
  show(node.wrap, alpha);
}

// ---------- big statistic ----------
export function stat(key, value, label, { alpha = 1, top = 330, color } = {}) {
  const node = el("st:" + key, () => {
    const wrap = div("stat");
    const v = div("value", wrap);
    const l = div("label", wrap);
    return { nodes: [wrap], wrap, v, l };
  });
  node.v.textContent = value;
  node.v.classList.toggle("te", /[\u0C00-\u0C7F]/.test(value));
  node.v.style.color = color || "";
  if (alpha > 0.05) statShown = true;
  node.l.textContent = label;
  node.wrap.style.top = top + "px";
  node.wrap.style.transform = `translateY(${(1 - alpha) * 30}px)`;
  show(node.wrap, alpha);
}

export function chip(key, text, { alpha = 1, top = 250, left = 64, kind = "" } = {}) {
  const node = el("ch:" + key, () => div("chip"));
  node.textContent = text;
  node.className = "chip " + kind;
  node.style.top = top + "px";
  node.style.left = left + "px";
  show(node, alpha);
}

/** The bottom-left live readout, like "65 mph · live". */
export function readout(key, value, unit, note, { alpha = 1, color = "#22a85a" } = {}) {
  const node = el("ro:" + key, () => {
    const wrap = div("readout");
    const bar = div("bar", wrap);
    const v = div("v", wrap);
    const u = div("u", wrap);
    const n = div("n", wrap);
    return { nodes: [wrap], wrap, bar, v, u, n };
  });
  node.bar.style.background = color;
  node.v.textContent = value;
  node.u.textContent = unit;
  node.n.textContent = note;
  show(node.wrap, alpha);
}

export function clock(text, { alpha = 1, urgent = false } = {}) {
  const node = el("clock", () => div("clock"));
  node.textContent = text;
  node.classList.toggle("urgent", urgent);
  show(node, alpha);
}

// ---------- captions ----------
/**
 * Word-by-word captions. Words already spoken are white, the rest grey,
 * shown a short chunk at a time so a phone screen never holds a paragraph.
 */
export function makeChunks(words, maxChars = 19) {
  const chunks = [];
  let cur = [];
  const flush = () => cur.length && chunks.push(cur) && (cur = []);
  words.forEach((w, i) => {
    const len = cur.reduce((s, x) => s + x.w.length + 1, 0);
    if (cur.length && (w.seg !== cur[0].seg || len + w.w.length > maxChars)) flush();
    cur.push({ ...w, i });
    if (/[.?!,]$/.test(w.w) && len > maxChars * 0.45) flush();
  });
  flush();
  return chunks.map((ws) => ({ words: ws, start: ws[0].start, end: ws[ws.length - 1].end }));
}
export function caption(chunks, t) {
  const node = el("caption", () => div("caption"));
  let c = null;
  for (const ch of chunks) {
    if (t >= ch.start - 0.05) c = ch;
    else break;
  }
  if (!c || t > c.end + 0.6) return show(node, 0);
  const html = c.words
    .map((w) => `<span class="${t >= w.start ? "said" : ""}">${w.w.replace(/[<>&]/g, "")}</span>`)
    .join(" ");
  if (node.innerHTML !== html) node.innerHTML = html;
  show(node, 1);
}
