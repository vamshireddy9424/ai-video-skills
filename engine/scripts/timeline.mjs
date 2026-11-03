// script.json (+ alignment.json from the voice) → timeline.json the player reads.
// With no voice yet, word times are estimated from text length, so scenes can
// be built and previewed before a single ElevenLabs credit is spent.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, arg } from "./lib.mjs";

/** Caption words of a line: inline delivery tags like [whispers] are spoken around, never shown. */
// `{2025|రెండు వేల ఇరవై ఐదు}` shows the left side and says the right side.
export const spoken = (text) => text.replace(/\{([^|}]*)\|([^}]*)\}/g, "$2");
/** Caption words of a line, each with the text the voice actually says for it. */
const captionItems = (text) =>
  text
    .replace(/\[[^\]]*\]/g, " ")
    .split(/(\{[^}]*\})|\s+/)
    .filter(Boolean)
    .map((tok) => {
      const m = tok.match(/^\{([^|}]*)\|([^}]*)\}$/);
      return m ? { w: m[1], say: m[2] } : { w: tok, say: tok };
    });
const captionWords = (text) => captionItems(text).map((x) => x.w);

export function buildTimeline(ep) {
  const dir = join(ROOT, "episodes", ep);
  const script = JSON.parse(readFileSync(join(dir, "script.json"), "utf8"));
  const alignPath = join(dir, "alignment.json");
  const hasVoice = existsSync(alignPath) && existsSync(join(dir, "voice.mp3"));

  const words = [];
  if (hasVoice) {
    const al = JSON.parse(readFileSync(alignPath, "utf8"));
    const text = al.characters.join("");
    let cursor = 0;
    for (const seg of script.segments) {
      for (const { w, say } of captionItems(seg.text)) {
        const at = text.indexOf(say, cursor);
        if (at < 0) throw new Error(`word "${say}" (${seg.id}) not found in the voice alignment`);
        const last = at + say.length - 1;
        words.push({ w, seg: seg.id, start: al.character_start_times_seconds[at], end: al.character_end_times_seconds[last] });
        cursor = last + 1;
      }
    }
  } else {
    // ~13 Telugu code points a second, plus a breath between sentences.
    let t = 0.4;
    for (const seg of script.segments) {
      for (const w of captionWords(seg.text)) {
        const d = 0.08 + w.length * 0.075;
        words.push({ w, seg: seg.id, start: t, end: t + d });
        t += d + (/[.?!]$/.test(w) ? 0.45 : /,$/.test(w) ? 0.2 : 0.04);
      }
      t += 0.25;
    }
  }

  // `lead`: seconds of picture (and sound effects) before the first word.
  const lead = script.lead || 0;
  for (const w of words) {
    w.start += lead;
    w.end += lead;
  }

  const segments = script.segments.map((s) => {
    const ws = words.filter((w) => w.seg === s.id);
    return { id: s.id, scene: s.scene, text: captionWords(s.text).join(" "), start: ws[0].start, end: ws[ws.length - 1].end };
  });
  const duration = Math.ceil((words[words.length - 1].end + 1.6) * 10) / 10;
  const scenes = [];
  for (const s of segments) {
    if (scenes.length && scenes[scenes.length - 1].id === s.scene) continue;
    scenes.push({ id: s.scene, start: scenes.length ? Math.max(0, s.start - 0.2) : 0 });
  }
  scenes.forEach((s, i) => (s.end = i + 1 < scenes.length ? scenes[i + 1].start : duration));

  const timeline = { episode: ep, title: script.title, lead, estimated: !hasVoice, audio: hasVoice ? "voice.mp3" : null, duration, scenes, segments, words };
  writeFileSync(join(dir, "timeline.json"), JSON.stringify(timeline, null, 1));
  return timeline;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tl = buildTimeline(arg("ep", "tatkal"));
  console.log(`${tl.episode}: ${tl.duration}s, ${tl.scenes.length} scenes, ${tl.words.length} words${tl.estimated ? " (timing ESTIMATED — no voice yet)" : ""}`);
  for (const s of tl.scenes) console.log(`  ${s.id.padEnd(8)} ${s.start.toFixed(2)} → ${s.end.toFixed(2)}`);
}
