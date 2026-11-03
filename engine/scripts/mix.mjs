// Lay the sound design under a rendered video: voice + music bed + effects.
//   node scripts/mix.mjs --ep=tatkal            out/tatkal.mp4 → out/tatkal-final.mp4
// The video stream is copied, never re-encoded, so a new mix takes seconds.
// Cues come from episodes/<ep>/cues.json (written by render.mjs).
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { ROOT, arg } from "./lib.mjs";

const ep = arg("ep", "tatkal");
const dir = join(ROOT, "episodes", ep);
const video = join(ROOT, "out", arg("video", `${ep}.mp4`));
const out = join(ROOT, "out", `${ep}-final.mp4`);
const tl = JSON.parse(readFileSync(join(dir, "timeline.json"), "utf8"));
const cues = JSON.parse(readFileSync(join(dir, "cues.json"), "utf8"));
const sfx = (n) => join(ROOT, "sfx", `${n}.mp3`);
// each episode can pick its music bed in script.json ("music": "bed-ambient"); default is the tech pulse
const music = JSON.parse(readFileSync(join(dir, "script.json"), "utf8")).music || "bed";
for (const c of cues) if (!existsSync(sfx(c.s))) throw new Error(`missing sfx/${c.s}.mp3 — run scripts/sfx.mjs`);

const musicGain = Number(arg("music", 0.13));
const sfxGain = Number(arg("sfx", 1));
const D = tl.duration;
const inputs = ["-i", video, "-i", join(dir, "voice.mp3"), "-stream_loop", "-1", "-i", sfx(music)];
const parts = [
  `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${Math.round((tl.lead || 0) * 1000)}:all=1,apad,atrim=0:${D}[voice]`,
  `[2:a]aformat=sample_rates=44100:channel_layouts=stereo,atrim=0:${D},volume=${musicGain},afade=t=in:d=1.5,afade=t=out:st=${D - 2}:d=2[bed]`,
];
const labels = [];
cues.forEach((c, i) => {
  inputs.push("-i", sfx(c.s));
  const ms = Math.max(0, Math.round(c.t * 1000));
  parts.push(`[${i + 3}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${(c.gain * sfxGain).toFixed(3)},adelay=${ms}|${ms}[c${i}]`);
  labels.push(`[c${i}]`);
});
// Effects and music dip under the voice (sidechain), so words always stay on top.
parts.push(`[bed]${labels.join("")}amix=inputs=${labels.length + 1}:normalize=0,atrim=0:${D}[fx]`);
parts.push(`[voice]asplit=2[v1][vkey]`);
parts.push(`[fx][vkey]sidechaincompress=threshold=0.04:ratio=5:attack=20:release=350[duck]`);
parts.push(`[v1][duck]amix=inputs=2:normalize=0,alimiter=limit=0.95,loudnorm=I=-14:TP=-1.5:LRA=9[mix]`);

execFileSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", parts.join(";"),
  "-map", "0:v", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-shortest", out], { stdio: "inherit" });
console.log(`${out}  (${cues.length} effects + music bed under the voice)`);
