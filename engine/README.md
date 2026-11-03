# Telugu 3D explainers

Vertical (1080×1920) explainer reels in the style of the reference reels:
low-poly 3D scenes, callouts with leader lines, word-by-word Telugu captions,
a step tracker, big stats with source chips. Everything renders from code:
no Blender, no GPU required.

```
web/engine.js        3D kit: stage, lighting, coaches, server towers, crowds, phones, particles, camera keys
web/overlay.js       2D kit: captions, callouts, stepper, stats, chips, clock, readouts
web/player.js        loads an episode, exposes window.__seek(t)
episodes/<ep>/script.json   Telugu script, voice settings, sources
episodes/<ep>/scenes.js     the episode's scenes, each timed off spoken words
scripts/voice.mjs    ElevenLabs voiceover + per-character timing
scripts/timeline.mjs script (+ voice timing) → timeline.json
scripts/render.mjs   headless Chromium → ffmpeg → out/<ep>.mp4
```

## On your Mac (fast: uses the Apple GPU)

```bash
brew install node ffmpeg                       # once
git pull                                       # get the latest episode
cd explainer
npm install
npm i -D playwright && npx playwright install chromium   # once
node scripts/make.mjs --ep=floaters            # → out/floaters-final.mp4 + out/floaters.te.srt
```

The first line it prints is the GPU. It should name your Apple chip; if it says SwiftShader,
the render is running in software and will be slow. Voice, sounds and models are all in the
repo except 3D models (fetch them with scripts/sketchfab.mjs) and voice audio (scripts/voice.mjs).

## Make a video

```bash
cd explainer
npm install
npm i -D playwright && npx playwright install chromium   # once, on your Mac

echo 'ELEVENLABS_API_KEY=sk_...' > .env.local            # git-ignored, never commit it
node scripts/voice.mjs voices                            # list Telugu voices
node scripts/voice.mjs --ep=tatkal                       # voice.mp3 + caption timing (male narrator auto-picked)
node scripts/voice.mjs --ep=tatkal --voice=<voice_id>    # or choose one

node scripts/render.mjs --ep=tatkal --stills=5,20,40     # check a few frames first
node scripts/render.mjs --ep=tatkal                      # full MP4 → out/tatkal.mp4
node scripts/serve.mjs                                   # live preview in the browser, click to play
```

Render options: `--from=10 --to=20` for a slice, `--ao=0` turns off ambient occlusion
(faster), `--pr=1.5` supersamples (sharper, slower), `--fps=30`.

Without a voice, timings are estimated from the text so scenes can be built
and previewed first; voicing the script re-times every caption and every
scene event automatically, because scenes hang their events on spoken words
(`ctx.at("గంటలు")`), not on fixed seconds.

## Language style

Tinglish, always: everyday spoken Telugu with English words wherever people actually use them
(cyclone, coast, speed, pressure, temperature, landfall, storm surge, eye, winds). Numbers and
technical terms in English. No literary or textbook Telugu: if a viewer would say it in English,
the script says it in English.

## Voice

- Model: `eleven_v3` is the ElevenLabs model that lists Telugu, and it reads
  emotion tags. Each line in `script.json` has a `tone` such as `[curious]`,
  `[serious]`, `[excited]` or `[thoughtful]`.
- Stability 0.5 ("natural") on v3; 0 is more expressive, 1 more even.
- A full 2–2½ minute episode is roughly 2,500–4,000 characters, so the same in credits.

## New episode

Copy `episodes/tatkal/`, rewrite `script.json` (one `scene` id per line group),
and write `scenes.js` using the kit. Facts on screen carry a source chip; simplified
visuals carry an `illustrative` chip.
