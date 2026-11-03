// Generate the shared sound library with ElevenLabs sound effects.
//   node scripts/sfx.mjs            make any missing sounds in sfx/
//   node scripts/sfx.mjs --redo=zap remake one
// Costs credits per generated second; existing files are never regenerated.
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ROOT, arg, env } from "./lib.mjs";

if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  process.exit(r.status ?? 1);
}

export const LIBRARY = {
  "bed-heist": ["dark tense cinematic heist thriller underscore, ticking pulse, low synth bass, subtle percussion, suspense, 100 bpm, no vocals, seamless loop", 22],
  alarm: ["distant security alarm siren wailing, muffled, cinematic, two cycles", 2.5],
  glitch: ["short digital glitch hit, data corruption stutter, crisp", 0.6],
  paper: ["single sheet of thick paper sliding and flapping into place, crisp papercraft foley, close mic, dry", 0.8],
  stamp: ["heavy rubber stamp slammed onto paper on a wooden desk, single hit, punchy", 0.7],
  snip: ["scissors cutting through thick paper, two quick snips, close mic, crisp", 0.9],
  "bed-piano": ["slow emotional cinematic piano with soft warm strings, reflective, hopeful undertone, 70 bpm, no drums, no vocals, seamless loop", 22],
  tick: ["single crisp mechanical clock tick, close mic, clean, dry", 0.5],
  ding: ["bright clean digital notification chime, single hit, modern UI", 1.5],
  whoosh: ["short soft airy cinematic whoosh transition, smooth, modern", 0.8],
  swarm: ["many tiny soft digital pops and clicks rising in density, data packets flying, ASMR, crisp", 5],
  zaps: ["rapid series of small electric zaps hitting a glass force field, sci-fi, crisp", 4],
  beep: ["friendly two-tone electronic turnstile approval beep, short", 0.7],
  keys: ["six soft phone keypad taps, ASMR, close mic, clean", 1.6],
  clicks: ["rapid soft satisfying clicks accelerating, ASMR, like keys locking into place", 4],
  thud: ["deep soft cinematic boom hit, low impact, short tail", 1.5],
  riser: ["short tension riser, suspense building, clean synth swell", 3],
  bed: ["minimal modern tech explainer background music, soft pulsing synth arpeggio, calm, steady tempo, no drums, no vocals, seamless loop", 22],
  heartbeat: ["slow calm human heartbeat, two soft deep thumps, close, warm, ASMR, single beat cycle", 1.2],
  underwater: ["soft muffled underwater ambience inside a liquid, gentle low hum, very calm, ASMR, seamless", 10],
  shimmer: ["delicate glassy shimmer, tiny crystalline chimes rising softly, magical, ASMR", 3],
  sparkle: ["quick soft sparkling zips, tiny bright particles flying past, airy, ASMR", 3],
  flash: ["sudden soft electric flash crackle, short, airy", 1.2],
  wind: ["howling cyclone wind gusting hard, deep roar with whistling gusts, intense storm, close, cinematic", 10],
  thunder: ["huge close thunder crack followed by a deep rolling rumble, cinematic, powerful", 5],
  rain: ["heavy tropical downpour, dense rain on water and roofs, intense, ASMR, seamless", 10],
  waves: ["big storm waves crashing hard on a beach, deep surf roar, spray, powerful, cinematic", 8],
  "bed-city": ["modern cinematic city documentary music, warm pulsing synth, soft deep bass, hopeful and grand, steady slow tempo, no drums, no vocals, seamless loop", 22],
  metro: ["modern electric metro train gliding past on an elevated track, smooth rising electric hum, soft wheel rhythm, whoosh as it passes, clean, ASMR, cinematic", 6],
  chime: ["three-note soft metro station door chime, clean, gentle, modern", 2],
  jet: ["jet airliner taking off overhead, deep powerful engine roar rising then fading, cinematic", 6],
  city: ["calm night city ambience from a high rooftop, distant soft traffic hum, faint horns far away, gentle wind, seamless", 10],
  crane: ["heavy construction crane winch whirring smoothly, mechanical hum with soft cable creak, close, ASMR", 4],
  clunk: ["huge concrete segment locking into place, deep satisfying heavy metallic clunk with short rumble, ASMR, close", 1.5],
  coins: ["pile of gold coins pouring and clinking into a stack, crisp, satisfying, ASMR", 3],
  drip: ["single water drop falling from a tap into an empty metal bucket, clear plink, close mic, ASMR", 1],
  sputter: ["old water tap opened, pipe coughs and sputters air, a few spits of water, then dry, close mic", 3],
  heat: ["hot dry summer afternoon ambience, cicadas buzzing, faint dry wind, distant crows, seamless", 10],
  flow: ["water rushing through a large pipe, steady deep flowing gurgle, clean, ASMR, seamless", 6],
  pump: ["large electric water pump starting up and humming steadily, mechanical, powerful, close", 5],
  trucks: ["line of heavy diesel trucks idling and moving slowly in traffic, indian horns honking, dusty street", 6],
  drill: ["borewell drilling rig pounding and grinding deep into rock, heavy rhythmic hammering, dusty", 5],
  splash: ["single big water drop falling into still water, deep clear plop, slow motion, ASMR", 2],
  digger: ["excavator engine revving, hydraulic arm moving, bucket dumping soil and rubble", 5],
  laugh: ["greedy villain man laughing loudly and smugly, deep hearty evil laugh, ha ha ha, close mic, cinematic", 4],
  cash: ["stack of paper currency notes being flipped and fanned quickly, crisp paper riffle, close, ASMR", 2],
  "bed-ambient": ["calm ambient cinematic science documentary music, soft warm synth pads, slow, gentle wonder, no drums, no vocals, seamless loop", 22],
};

const key = env("ELEVENLABS_API_KEY");
const dir = join(ROOT, "sfx");
mkdirSync(dir, { recursive: true });
const redo = arg("redo", null);
if (redo) rmSync(join(dir, `${redo}.mp3`), { force: true });
for (const [name, [text, seconds]] of Object.entries(LIBRARY)) {
  const file = join(dir, `${name}.mp3`);
  if (existsSync(file)) continue;
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, duration_seconds: seconds, prompt_influence: 0.5, ...(name === "bed" ? { loop: true } : {}) }),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`${name}.mp3  (${seconds}s)`);
}
