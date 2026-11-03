---
name: telugu-explainer-video
description: Build a vertical Telugu explainer short (≤3:00) entirely from code — Three.js 3D scenes, paper-cut kit, LEMMiNO-style titles, word-anchored captions, ElevenLabs voice, sound design, ffmpeg render. Use for any "make a video / explainer / reel / short on <topic>" request in Telugu, for researched story videos (heists, infrastructure, human-interest), and for re-rendering after feedback.
---

# Telugu explainer video

Everything renders from code in `engine/`: no Blender, no GPU needed, no AI video model.
Output: `engine/out/<ep>-final.mp4` (1080×1920, 30 fps) + `<ep>.te.srt` + thumbnails.

Benchmark episode the owner called "perfect": `engine/episodes/abroad/` (paper-cut + 3D, 2:58.8,
every point of his pasted script on screen as a character or label).

## Rules

- **≤ 3:00** — YouTube Shorts limit. Cut words, not points: every point the user pasted must appear.
- **Deep research first** → `episodes/<ep>/research.md` with sources. Never invent names, numbers,
  places. When sources conflict, say the safer version (e.g. "అక్టోబర్ చివర్లో" instead of a disputed date).
  Mark unconfirmed claims on screen ("ANALYSTS SUSPECT · Not officially confirmed").
- **Natural male voice**, faster than default (owner: "users skip it instantly"). Jayesh M first.
- **Light only where it's needed.** Night scenes: dark base, neon on the one thing that matters
  (`calm()` look with low bloom in `episodes/rrr`). Too much glow was rejected.
- No fog/smoke unless the story needs it; people must be **human figures** (not capsules), and story
  characters dressed for the part (a wedding needs a bride and groom in wedding clothes).
- No channel branding, never label or tag as AI, original content only (no reposted footage).
- Don't depict violence against real minors, don't name child victims.

## Pipeline

```bash
cd engine && npm install && npx playwright install chromium
mkdir episodes/<ep>                         # research.md, script.json, scenes.js
node scripts/voice.mjs --ep=<ep>            # ElevenLabs v3 → voice.mp3 + alignment.json + timeline.json
#   listen before rendering; the owner wants to hear the voice first
cd episodes/<ep> && cp voice.mp3 voice.raw.mp3 && cp alignment.json alignment.raw.json
python3 ../../scripts/tighten.py 0.32 170 dry   # see how long it would be
python3 ../../scripts/tighten.py 0.32 170       # pauses → 0.32 s, tempo to hit 170 s
cd ../.. && node scripts/timeline.mjs --ep=<ep>
node scripts/render.mjs --ep=<ep> --stills=3,20,45,80,120   # LOOK at every still
node scripts/make.mjs --ep=<ep>             # render → mix (music + sfx + voice) → srt → thumbnail
```

- Add one line later without re-voicing everything: `node scripts/voice-splice.mjs --ep=<ep> --from=<id> --to=<id>`
  on the raw voice, then re-run tighten at the same tempo.
- A full render writes ~6 GB of frames to `out/frames/` — delete old episodes' frames first.
  `make.mjs` resumes from cached frames after a crash.
- `node scripts/serve.mjs` = live preview in a browser.

### script.json

```json
{ "title": "...", "lead": 0.5, "music": "bed-piano",
  "voice": { "model_id": "eleven_v3", "language_code": "te", "voice_id": "VFbICGvBSvKmHwlI9rzA",
             "voice_settings": { "stability": 0.0, "similarity_boost": 0.8, "use_speaker_boost": true } },
  "segments": [ { "id": "hook", "scene": "hook", "tone": "[excited]", "text": "{20,000|ఇరవై వేల} మంది..." } ] }
```

Music beds and SFX are generated/cached by `scripts/sfx.mjs` (LIBRARY: whoosh, ding, paper, stamp,
snip, alarm, glitch, bed, bed-piano, bed-heist…). Scenes request sounds with `sounds(ctx)`.

### scenes.js

```js
export const scenes = {
  hook: {
    sounds: (ctx) => [{ t: A(ctx, "BILLION"), s: "stamp", gain: 0.5 }],
    async build(stage) {               // stage = createStage(): scene, camera, sun, ground, bloom(), ao()
      const g = new THREE.Group();
      return { group: g, update(ctx) { /* ctx.t, ctx.start, ctx.end, ctx.at(word), ctx.O */ } };
    },
  },
};
const A = (ctx, w, frac = 0.3) => { try { return ctx.at(w); } catch { return ctx.start + (ctx.end - ctx.start) * frac; } };
```

- **Anchor on spoken words** (`A(ctx, "word")`) so re-voicing re-times everything. `ctx.at` throws on a
  missing word — always use the `A` wrapper.
- 2D overlay (DOM, composited into the render): `ctx.O.stat`, `ctx.O.chip(key, text, {kind:"big"|"big warn"})`,
  `ctx.O.callout`, `stepper`, `readout`, `clock`. See `web/overlay.js`.
- 3D kit (`web/engine.js`): `shoot`, `shots`, `camKeys`, `box`, `sign`, `crowd`, `scatterCity`, `trees`,
  `coach`, `serverTower`, `phone`, `bakeTexture`, `prog/ease*`, `rng`.
- Styles that worked, each in an episode you can copy:
  - **paper-cut** (cards with rough edges, stamps, snips) — `abroad`, `biryani`, `wedding`
  - **LEMMiNO** (big thin tracked titles, "3D RECONSTRUCTION" tag, cool/warm/night grades) — `wedding`
  - **night city, minimal neon** — `metro`, `rrr` (ORR/RRR maps, highway links)
  - **breaking-news / heist** (strip, giant number readout, hot vs cold wallet, blockchain blocks,
    hacker silhouette) — `binance`
  - **cost breakdown bars** — `biryani`

### Gotchas (all hit for real)

- Canvas Telugu: `await document.fonts.load('600 100px "Anek Telugu"', text)` before drawing (weights 500/600 loaded).
- popIn overriding scale → store the base scale in `userData.s0`.
- Skinned meshes vanish → `frustumCulled = false`.
- Shadows look detached → move backdrops closer to the subject.
- White clothes + bloom = glowing ghosts → turn bloom down in that scene.
- Maps off-screen → recompute camera from the bounding box.

## Assets

3D models are downloaded, not committed: `bash scripts/sketchfab-search.sh "query"` (CC-BY only,
`ANIMATED=1` for rigged), then `node scripts/sketchfab.mjs <uid> <folder>` (needs `SKETCHFAB_API_TOKEN`,
refuses non-commercial licences). **Put the credit line in the video description.** `assets/README.md`
lists what each episode used.

## Check the whole video yourself

Pull one frame from the middle of **every** scene (`ffmpeg -ss T -i out/<ep>-final.mp4 -frames:v 1`),
look at each, and transcribe the audio with whisper medium against script.json. Fix and re-render
before telling anyone it's done. Then make the upload kit (`skills/video-upload-kit`).
