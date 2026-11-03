---
name: difference-video
description: Make a Telugu "Difference ఏంటి?" short — two look-alike things side by side (కల్లు vs సారా, Lager vs Ale…), one character asks, one explains, white set, 2D talking characters with real lip-sync. Use when asked for a "difference video", "difference episode", "X vs Y explainer" in Telugu, or a two-character Q&A short.
---

# Difference video

A vertical (1080×1920) Telugu short, 45–90 s, where **one character asks "ఇది X. ఇది Y. Difference ఏంటి?"**
and **the other explains each pair in one or two lines**. 4–6 pairs per episode, one theme
(drinks, bikes, watches, salary words…).

The working reference is `engine/episodes/drinks/` (final 71.7 s). Copy it, don't start blank.

## Hard rules (from the channel owner)

- Say **"Difference"** (English word), never "తేడా". Title card: `Difference ఏంటి?`.
- **Male voices only.** Two distinct male voices, one per character.
- **Characters must talk naturally.** 3D models without a face rig look dead — use **2D toon
  characters** (SVG, `toon.js`) with viseme mouths, blinks, gesture poses and head bob. A 3D mouth
  hack on a jawless model was rejected as "not natural". Don't spend tokens on that path again.
- **Good characters, not cute filler.** Parrots and squirrels were rejected. Avoid animals that are
  Telugu insults (buffalo/ఎద్దు, donkey/గాడిద, monkey/కోతి) or sensitive (cow, pig, owl). Tiger (asks) +
  Detective Panda (explains) is the shipped pair; new episodes may introduce new, original characters
  — never copy another channel's characters or wording.
- No channel/brand logo, no "18+" badge on the thumbnail, unbranded products (draw your own labels).
- Never label or tag the video as AI.

## Layout (top → bottom on a white set)

| Zone | y (px, 1920 tall) | What |
|---|---|---|
| Item cards | 0–850 | left item + right item (3D, slow sway), name card above each, red answer tag appears when explained |
| Caption | ~860 | dark word-by-word Telugu caption, spoken word turns black (`.caption .said`) |
| Warning strip | optional | red bar for health/legal lines |
| Cast | ~1500–1900 | asker on the left (x≈275), explainer on the right (x≈805), soft ground shadows |

## Pipeline

```bash
cd engine && npm install && npx playwright install chromium
cp -R episodes/drinks episodes/<ep>          # then rewrite script.json + the pair list in scenes.js
echo 'ELEVENLABS_API_KEY=...' > .env.local    # never commit
node scripts/voice.mjs --ep=<ep>              # two voices: each segment's voice_id overrides the default
python3 scripts/visemes.py <ep>               # mouth shapes A–G/X per character → visemes.json
node scripts/render.mjs --ep=<ep> --stills=3,15,30,45   # LOOK at the stills before a full render
node scripts/make.mjs --ep=<ep>               # render → mix → srt → out/<ep>-final.mp4
```

### script.json segment

```json
{ "id": "q1", "scene": "p1", "speaker": "puli", "voice_id": "<asker voice>", "tone": "[curious]",
  "text": "ఇది కల్లు. [pause] ఇది సారా. Difference ఏంటి?" }
```

- `speaker` = `puli` → mouth code `t` (left character), anything else → `p` (right). Change the mapping
  in `scripts/visemes.py` (`code = …`) if you rename characters.
- `tone` = ElevenLabs v3 audio tag: `[excited] [curious] [laughs] [confident] [serious] [pause]`.
- Numbers: `{display|spoken}` → caption shows display, voice reads spoken.
- Every line short: question ≤ 1 sentence, answer ≤ 2. Whole pair ≤ 12 s.

### Voices (ElevenLabs eleven_v3, `language_code: te`, stability 0.0, similarity 0.8)

| Voice | id | Use |
|---|---|---|
| Jayesh M | `VFbICGvBSvKmHwlI9rzA` | most natural male Telugu — default narrator / explainer |
| Dhruva S | `RmsECPYd2k7yLIMTl1cR` | second male voice (asker); owner found it less natural as a narrator |
| Vagmin | `ZoV3Y9cqdke2p8nzz7XP` | serious/news male |

Verify every number and name by transcribing the final audio (whisper **medium**, not small).

### 2D cast (`episodes/drinks/toon.js`)

```js
import { drawCast } from "./toon.js";
const VIS = await (await fetch("/episodes/<ep>/visemes.json")).json();
// inside update(ctx):
drawCast({ t: ctx.t, vis: VIS, tigerX: 275, pandaX: 805, tigerPose: "think", pandaPose: "point" });
```

Poses: `rest point open think wave both`. Blink is automatic; the speaker tilts and bobs. To add a
new character, write one more `function name({x,y,s,shape,pose,blink,tilt,bob,look})` that returns
SVG (thick ink outline `SW=7`, flat fills), reuse `mouth(shape)` and `eye()`.

### Scene kit (`episodes/drinks/scenes.js`)

- `pairScene({ q, a:{startWord,lWord,rWord}, left, right, lTag:[name,answer], rTag:[name,answer], warn })`
  — items pop in on the spoken word, the one being explained lifts, its red answer tag appears.
- `studio()` gives the white set: no fog, no bloom, soft sun shadow on a white floor.
- Hang every event on a **spoken word** with `A(ctx, "word", fallbackFrac)`, never on fixed seconds.
- Telugu on canvas: `await document.fonts.load('600 100px "Anek Telugu"', '<the text>')` before drawing,
  or it silently falls back (సారా drew as నారా).

## Before you ship — check yourself

1. Pull a frame from the middle of every pair; both items, both labels, caption and cast visible, nothing clipped.
2. Mouths move only for the speaker and close in pauses.
3. Transcribe the audio, compare against script.json.
4. Thumbnail + caption + 5 hashtags: see `skills/video-upload-kit`.

## Learned from the numbers

The reference channel's top difference reels: alcohol 4.2M views, bikes 3M, watches 447K, salary
terms ~180K — everyday-desire topics beat finance vocabulary. Our own difference episode got low
views, so pair this format with a strong, curiosity-first hook in the first 2 seconds.
