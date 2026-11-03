// Re-voice a run of segments in place, keeping every other line's take (and its checked numbers).
//   node scripts/voice-splice.mjs --ep=water --from=s15 --to=s15b
// The old take is cut between the line before `from` and the line after `to`; the new lines go in between.
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { ROOT, arg, env } from "./lib.mjs";
import { buildTimeline, spoken } from "./timeline.mjs";

if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  process.exit(r.status ?? 1);
}
const ep = arg("ep"), from = arg("from"), to = arg("to");
const dir = join(ROOT, "episodes", ep);
const script = JSON.parse(readFileSync(join(dir, "script.json"), "utf8"));
const cfg = script.voice;
const al = JSON.parse(readFileSync(join(dir, "alignment.json"), "utf8"));
const text = al.characters.join("");
const ids = script.segments.map((s) => s.id);
const i0 = ids.indexOf(from), i1 = ids.indexOf(to);
const prev = script.segments[i0 - 1], next = script.segments[i1 + 1];
const line = (s) => `${s.tone ? s.tone + " " : ""}${spoken(s.text)}`;
// where the old take's neighbours sit in the alignment
const prevAt = text.indexOf(line(prev).replace(/^\[[^\]]*\]\s*/, "").slice(-12));
const prevEnd = prevAt + 11;
const nextAt = text.indexOf(line(next), prevEnd);
if (prevAt < 0 || nextAt < 0) throw new Error("could not find the neighbouring lines in the old alignment");
const st = al.character_start_times_seconds, en = al.character_end_times_seconds;
const lastTime = (k) => { for (; k >= 0; k--) if (en[k] != null) return en[k]; return 0; };
const firstTime = (k) => { for (; k < st.length; k++) if (st[k] != null) return st[k]; return 0; };
const cutA = (lastTime(prevEnd) + firstTime(prevEnd + 1)) / 2;
const cutB = (lastTime(nextAt - 1) + firstTime(nextAt)) / 2;

const body = { text: script.segments.slice(i0, i1 + 1).map(line).join(" "), model_id: cfg.model_id, voice_settings: cfg.voice_settings, language_code: cfg.language_code };
const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${cfg.voice_id}/with-timestamps?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": env("ELEVENLABS_API_KEY"), "content-type": "application/json" }, body: JSON.stringify(body) });
if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
const out = await res.json();
const tmp = join(dir, ".splice");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
copyFileSync(join(dir, "voice.mp3"), join(dir, "voice.before-splice.mp3"));
writeFileSync(join(tmp, "new.mp3"), Buffer.from(out.audio_base64, "base64"));
const wav = (src, dst, a, b) => execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, ...(a != null ? ["-ss", String(a)] : []), ...(b != null ? ["-to", String(b)] : []), "-ar", "44100", "-ac", "1", dst]);
wav(join(dir, "voice.mp3"), join(tmp, "a.wav"), 0, cutA);
wav(join(tmp, "new.mp3"), join(tmp, "n.wav"));
wav(join(dir, "voice.mp3"), join(tmp, "b.wav"), cutB, null);
const pad = 0.25;
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(tmp, "a.wav"), "-i", join(tmp, "n.wav"), "-i", join(tmp, "b.wav"), "-filter_complex", `[0]apad=pad_dur=${pad}[a];[1]apad=pad_dur=${pad}[n];[a][n][2]concat=n=3:v=0:a=1`, "-c:a", "libmp3lame", "-b:a", "128k", join(dir, "voice.mp3")]);
const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
const nA = dur(join(tmp, "a.wav")) + pad, nN = dur(join(tmp, "n.wav")) + pad, shift = nA + nN - cutB;
const merged = { characters: [], character_start_times_seconds: [], character_end_times_seconds: [] };
const push = (c, s, e) => { merged.characters.push(c); merged.character_start_times_seconds.push(s); merged.character_end_times_seconds.push(e); };
for (let k = 0; k <= prevEnd; k++) push(al.characters[k], st[k], en[k]);
push(" ", null, null);
out.alignment.characters.forEach((c, k) => push(c, out.alignment.character_start_times_seconds[k] + nA, out.alignment.character_end_times_seconds[k] + nA));
push(" ", null, null);
for (let k = nextAt; k < al.characters.length; k++) push(al.characters[k], st[k] == null ? null : st[k] + shift, en[k] == null ? null : en[k] + shift);
writeFileSync(join(dir, "alignment.json"), JSON.stringify(merged));
rmSync(tmp, { recursive: true, force: true });
const tl = buildTimeline(ep);
console.log(`spliced ${from}..${to}: voice now ${tl.duration}s (old take kept in voice.before-splice.mp3)`);
