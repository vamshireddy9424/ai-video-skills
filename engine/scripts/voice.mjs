// Telugu voiceover from ElevenLabs, with per-character timing for captions.
//
//   node scripts/voice.mjs voices              list Telugu voices (yours + the shared library)
//   node scripts/voice.mjs --ep=tatkal         voice the episode → voice.mp3 + alignment.json
//   node scripts/voice.mjs --ep=tatkal --voice=<id>   choose a voice (saved into script.json)
//
// Model: eleven_v3 — the ElevenLabs model that lists Telugu, and the one that
// understands emotion tags such as [curious] or [serious]. The key is read from
// explainer/.env.local and never printed.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { ROOT, arg, env } from "./lib.mjs";
import { buildTimeline, spoken } from "./timeline.mjs";

// Node's fetch ignores HTTPS_PROXY unless asked; behind a proxy, re-run with it on.
if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  process.exit(r.status ?? 1);
}

const API = "https://api.elevenlabs.io";
const KEY = env("ELEVENLABS_API_KEY");
if (!KEY) throw new Error("ELEVENLABS_API_KEY missing — put it in explainer/.env.local");

async function call(path, init = {}) {
  const res = await fetch(API + path, { ...init, headers: { "xi-api-key": KEY, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path} → ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

async function teluguVoices() {
  const shared = await call("/v1/shared-voices?language=te&page_size=40&sort=usage_character_count_1y");
  return shared.voices.map((v) => ({
    id: v.voice_id, owner: v.public_owner_id, name: v.name, gender: v.gender, age: v.age, accent: v.accent,
    use: v.use_case, category: v.category, uses1y: v.usage_character_count_1y,
  }));
}

if (process.argv[2] === "voices") {
  const mine = await call("/v1/voices");
  console.log("Your voices:");
  for (const v of mine.voices) console.log(`  ${v.voice_id}  ${v.name}  (${v.category})`);
  console.log("\nShared library, Telugu, most used first:");
  for (const v of await teluguVoices()) console.log(`  ${v.id}  ${v.name} · ${v.gender}/${v.age} · ${v.accent || "-"} · ${v.use || "-"} · ${v.category}`);
  process.exit(0);
}

const ep = arg("ep", "tatkal");

// --sample=id1,id2,…: the first line in each voice → out/sample-<name>.mp3, to choose by ear.
if (arg("sample", null)) {
  const sc = JSON.parse(readFileSync(join(ROOT, "episodes", ep, "script.json"), "utf8"));
  const first = sc.segments[0];
  const mine = (await call("/v1/voices")).voices;
  mkdirSync(join(ROOT, "out"), { recursive: true });
  for (const id of String(arg("sample")).split(",")) {
    const name = (mine.find((v) => v.voice_id === id)?.name || id).split(/\s[-–]/)[0].replace(/\W+/g, "_");
    const res = await fetch(`${API}/v1/text-to-speech/${id}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": KEY, "content-type": "application/json" },
      body: JSON.stringify({ text: `${first.tone} ${spoken(first.text)}`, model_id: sc.voice.model_id, language_code: sc.voice.language_code, voice_settings: sc.voice.voice_settings }),
    });
    if (!res.ok) throw new Error(`${id}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    const file = join(ROOT, "out", `sample-${name}.mp3`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(file);
  }
  process.exit(0);
}
const dir = join(ROOT, "episodes", ep);
const scriptPath = join(dir, "script.json");
const script = JSON.parse(readFileSync(scriptPath, "utf8"));
const cfg = script.voice;

let voiceId = arg("voice", null) || cfg.voice_id;
if (!voiceId) {
  // No voice chosen: take the most-used narration-style Telugu voice from the library.
  // Override any time with --voice=<id> after listing with `voices`.
  const all = await teluguVoices();
  // Male narrator first (the channel's voice), then any male, then anything Telugu.
  const male = all.filter((v) => v.gender === "male");
  const pick = male.find((v) => /narrat|informative|educat|news/i.test(v.use || "")) || male[0] || all[0];
  if (!pick) throw new Error("no Telugu voices in the shared library — pass --voice=<id>");
  console.log(`voice: ${pick.name} (${pick.gender}, ${pick.accent || "no accent tag"}, ${pick.use || "general"})`);
  voiceId = pick.id;
  const mine = await call("/v1/voices");
  if (!mine.voices.some((v) => v.voice_id === voiceId)) {
    await call(`/v1/voices/add/${pick.owner}/${pick.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ new_name: `${pick.name} (Telugu narrator)` }),
    });
  }
}
if (voiceId !== cfg.voice_id) {
  cfg.voice_id = voiceId;
  writeFileSync(scriptPath, JSON.stringify(script, null, 2) + "\n");
}

// Tags steer the delivery; they are spoken-around, not spoken, and the
// timeline finds each caption word in the alignment so tags never reach the captions.
// A segment may name its own voice (two-character episodes); consecutive lines in the same voice share a request.
const lines = script.segments.map((s) => ({ text: `${s.tone ? s.tone + " " : ""}${spoken(s.text)}`, voice: s.voice_id || voiceId }));
// eleven_v3 takes a few thousand characters per request; stay well under.
const parts = [];
for (const l of lines) {
  const last = parts[parts.length - 1];
  if (last && last.voice === l.voice && last.text.length + l.text.length < (cfg.chunk || 2400)) last.text += " " + l.text;
  else parts.push({ ...l });
}

const tmp = join(dir, ".voice-parts");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const merged = { characters: [], character_start_times_seconds: [], character_end_times_seconds: [] };
let offset = 0;
let spent = 0;
for (const [i, part] of parts.entries()) {
  const text = part.text, partVoice = part.voice;
  const body = { text, model_id: cfg.model_id, voice_settings: cfg.voice_settings };
  if (cfg.language_code) body.language_code = cfg.language_code;
  let out;
  try {
    out = await call(`/v1/text-to-speech/${partVoice}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
  } catch (e) {
    if (!body.language_code || !/language/i.test(e.message)) throw e;
    delete body.language_code;
    out = await call(`/v1/text-to-speech/${partVoice}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
  }
  spent += text.length;
  const file = join(tmp, `part${i}.mp3`);
  writeFileSync(file, Buffer.from(out.audio_base64, "base64"));
  let al = out.alignment;
  if (!al?.characters?.length) al = await forcedAlign(file, text);
  merged.characters.push(...al.characters, " ");
  merged.character_start_times_seconds.push(...al.character_start_times_seconds.map((x) => x + offset), null);
  merged.character_end_times_seconds.push(...al.character_end_times_seconds.map((x) => x + offset), null);
  offset += Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());
}

// Join the parts (one part for a normal-length episode) into voice.mp3.
const list = join(tmp, "list.txt");
writeFileSync(list, parts.map((_, i) => `file 'part${i}.mp3'`).join("\n"));
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", join(dir, "voice.mp3")]);
rmSync(tmp, { recursive: true, force: true });
writeFileSync(join(dir, "alignment.json"), JSON.stringify(merged));
console.log(`voice.mp3: ${offset.toFixed(1)}s from ${spent} characters (≈ credits used)`);
const tl = buildTimeline(ep);
console.log(`timeline: ${tl.duration}s, ${tl.words.length} caption words timed from the voice`);

/** Fallback when the TTS reply carries no timing: ElevenLabs' forced alignment. */
async function forcedAlign(file, text) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(file)], { type: "audio/mpeg" }), "voice.mp3");
  form.append("text", text);
  const r = await call("/v1/forced-alignment", { method: "POST", body: form });
  return {
    characters: r.characters.map((c) => c.text),
    character_start_times_seconds: r.characters.map((c) => c.start),
    character_end_times_seconds: r.characters.map((c) => c.end),
  };
}
