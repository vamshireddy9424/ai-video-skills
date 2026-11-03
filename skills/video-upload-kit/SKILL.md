---
name: video-upload-kit
description: Make the upload package for a finished short — vertical + wide thumbnails built from a real frame, YouTube title, description, Instagram caption and exactly 5 hashtags, in Telugu. Use after any video render, or when asked for "thumbnail", "description", "tags", "headline", "caption", "hashtags".
---

# Video upload kit

## Thumbnails (from a real frame, never a generated image)

1. Pick the strongest frame: the payoff moment, faces/characters large, one clear subject.
   `ffmpeg -ss 108 -i out/<ep>-final.mp4 -frames:v 1 out/<ep>-thumbframe.png`
   Pull 5 candidates into a strip and look at them before choosing.
2. Copy `engine/scripts/_thumb-wedding.mjs` (vertical 1080×1920 + wide 1280×720) or
   `_thumb-drinks.mjs` (white band style) and change the text. Fonts are embedded as base64 so the
   Telugu renders correctly in headless Chromium: `node scripts/_thumb-<ep>.mjs "$PWD"`.
3. Text: **max ~4 words of Telugu + one huge number or word**. Yellow `#ffd23f` number, white Telugu,
   one red chip `#d62828` for the setup line. Dark gradient behind text only, never over the subject.
4. Look at the result; fix overlaps (big digits' comma tails hit the next line → add margin).
5. No "18+", no logos, no "AI".

## Copy

- **Title**: Telugu hook + a number or twist + one emoji. ≤ 70 chars.
  e.g. `ఒక్క వీడియో… పెళ్లికి 20,000 మంది అపరిచితులు వచ్చారు! 😳`
- **Description**: 4 short paragraphs — emotional setup, the event, the payoff, one line of meaning —
  then a question to drive comments (`మీరైతే ఏం చేస్తారు? కామెంట్ చేయండి 👇`). Add asset credit lines
  (CC-BY) at the end for YouTube.
- **Exactly 5 hashtags** when asked for 5 — the owner said "only five powerful hash tags":
  2 broad Telugu (`#telugu…`), 2 topic, 1 emotion/format. Never `#ai`/`#aigenerated`.
