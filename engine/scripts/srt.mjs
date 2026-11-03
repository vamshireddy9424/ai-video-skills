// Telugu subtitles from the voice timing → out/<ep>.te.srt (upload as "Telugu" captions).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, arg } from "./lib.mjs";

const ep = arg("ep", "tatkal");
const tl = JSON.parse(readFileSync(join(ROOT, "episodes", ep, "timeline.json"), "utf8"));
const ts = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
// One cue per sentence-ish chunk: break at punctuation or ~42 characters.
const cues = [];
let cur = [];
for (const w of tl.words) {
  if (cur.length && (w.seg !== cur[0].seg || cur.map((x) => x.w).join(" ").length + w.w.length > 42)) cues.push(cur), (cur = []);
  cur.push(w);
  if (/[.?!]$/.test(w.w)) cues.push(cur), (cur = []);
}
if (cur.length) cues.push(cur);
const srt = cues.map((c, i) => `${i + 1}\n${ts(c[0].start)} --> ${ts(c[c.length - 1].end + 0.15)}\n${c.map((x) => x.w).join(" ")}\n`).join("\n");
const out = join(ROOT, "out", `${ep}.te.srt`);
writeFileSync(out, srt);
console.log(`${out}  (${cues.length} captions)`);
