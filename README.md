# AI video skills

Skills and a working render engine for making Telugu vertical shorts (Reels / YouTube Shorts)
entirely from code: Three.js 3D, paper-cut and LEMMiNO-style motion, 2D talking characters with
lip-sync, ElevenLabs voice, sound design, captions, thumbnails.

Any AI agent can use this repo: each folder in `skills/` is a standard `SKILL.md` skill
(Claude Code, Codex, Cursor, Gemini CLI…), and `engine/` is the code those skills drive.

## Start here

| You want to make | Read |
|---|---|
| a "Difference ఏంటి?" two-character video | [`skills/difference-video`](skills/difference-video/SKILL.md) |
| any explainer / story short (≤3 min) | [`skills/telugu-explainer-video`](skills/telugu-explainer-video/SKILL.md) |
| thumbnail, title, description, 5 hashtags | [`skills/video-upload-kit`](skills/video-upload-kit/SKILL.md) |

## Install the skills

```bash
git clone https://github.com/vamshireddy9424/ai-video-skills
cp -R ai-video-skills/skills/* ~/.claude/skills/        # Claude Code
cp -R ai-video-skills/skills/* ~/.agents/skills/        # Codex / other agents
# or: npx skills add vamshireddy9424/ai-video-skills
```

## Run the engine

```bash
cd engine && npm install && npx playwright install chromium   # needs node 20+, ffmpeg
echo 'ELEVENLABS_API_KEY=...' > .env.local                     # git-ignored; your own key
node scripts/make.mjs --ep=drinks                              # → out/drinks-final.mp4
```

`engine/episodes/` holds the source (script, scenes, research) of every shipped episode: abroad,
binance, biryani, drinks, rrr, wedding, metro, and more. Voice audio, renders and 3D model files
are not committed. Models are re-downloaded from Sketchfab with `scripts/sketchfab.mjs`
(CC-BY, credit in the description).

## All skills

- [animation-systems](skills/animation-systems) — Use when designing or implementing product-grade web motion like Stripe, Linear, Apple, and Vercel. Covers motion principles, easing/duratio
- [audit-reference-originality](skills/audit-reference-originality) — Audit a website or digital experience against its supplied source references for originality and plagiarism risk. Use when Codex must compar
- [audit-verify-explain-grade-5](skills/audit-verify-explain-grade-5) — Audit work, verify claims with concrete evidence, and explain the result in simple grade-5 language. Use when the user asks to review, audit
- [build-awwwards-quality-sites](skills/build-awwwards-quality-sites) — Art-direct and implement distinctive, motion-rich marketing, editorial, portfolio, and landing websites with original reference-inspired ima
- [build-threejs-scroll-worlds](skills/build-threejs-scroll-worlds) — Build rich, scroll-controlled real-time Three.js experiences as one persistent 3D world whose camera, lighting, atmosphere, materials, objec
- [daily-ui-inspiration-capture](skills/daily-ui-inspiration-capture) — Create a recurring daily UI inspiration capture. Use when the user asks to run, refresh, package, or validate dated UI inspiration bundles, 
- [design-first-ui-prompting](skills/design-first-ui-prompting) — Use when you need design-first, spec-driven, skimmable prompts for UI generation. Covers prompt structure, constraints, variations, typograp
- [difference-video](skills/difference-video) — Make a Telugu "Difference ఏంటి?" short — two look-alike things side by side (కల్లు vs సారా, Lager vs Ale…), on
- [html-to-interaction-prompts](skills/html-to-interaction-prompts) — Convert a supplied HTML page or generated HTML reference into a screenshot-backed article containing multiple reusable interaction prompts. 
- [iterate-until-verified](skills/iterate-until-verified) — Apply a prompt-agnostic execution and verification loop to any substantial task while preserving the original request. Use when the user ask
- [landing-page](skills/landing-page) — Use when designing or rewriting a high-converting landing page (single-offer page) for SaaS/apps/services. Covers structure, layout patterns
- [optimize-threejs-games](skills/optimize-threejs-games) — Profile, diagnose, and improve Three.js or WebGL game performance without regressing gameplay. Use for frame-time drops, CPU/GPU pressure, d
- [optimize-web-animations](skills/optimize-web-animations) — Profile, audit, and optimize frontend page performance with emphasis on animation work, memory-leak risks, long-session slowdowns, CSS anima
- [stitched-full-page-capture](skills/stitched-full-page-capture) — Capture or repair reliable full-page screenshots for lazy-loaded, scroll-animated, Framer, WebGL/canvas, or reveal-heavy web pages. Use when
- [telugu-explainer-video](skills/telugu-explainer-video) — Build a vertical Telugu explainer short (≤3:00) entirely from code — Three.js 3D scenes, paper-cut kit, LEMMiNO-style titles, word-ancho
- [threejs](skills/threejs) — Use when building or debugging interactive 3D scenes on the web with Three.js (scene/camera/renderer, lights/materials, GLTF loading, contro
- [video-to-superprompt](skills/video-to-superprompt) — Turn a reference video into a super detailed recreation or inspiration prompt. Use when the user provides, mentions, uploads, links, or poin
- [video-upload-kit](skills/video-upload-kit) — Make the upload package for a finished short — vertical + wide thumbnails built from a real frame, YouTube title, description, Instagram c
- [webgl-3d-object](skills/webgl-3d-object) — Create a real 3D WebGL object with geometric mesh depth, physically based material, directional and ambient lighting, perspective camera, su

Upstream skills used alongside (not copied): see [THIRD_PARTY_SKILLS.md](THIRD_PARTY_SKILLS.md).
