"""Cartoon mouth shapes from ElevenLabs letter timings (Telugu + English).
Shapes (Hanna-Barbera / Rhubarb set): A closed, B slightly open, C open, D wide, E round, F pucker, G f/v, X rest.
Writes episodes/<ep>/visemes.json: [[t, shape, who], ...] with who = speaker code per segment."""
import json, sys, re
ep = sys.argv[1]; d = f"episodes/{ep}"
al = json.load(open(f"{d}/alignment.json")); tl = json.load(open(f"{d}/timeline.json")); sc = json.load(open(f"{d}/script.json"))
code = {s["id"]: ("t" if s.get("speaker") in ("puli", "tiger") else "p") for s in sc["segments"]}
lead = tl["lead"]
LAB = set("మపబభmpbMPB"); FV = set("ఫవfvFVwW")
VA = set("అఆాaA"); VE = set("ఇఈఎఏఐిీెేైeiEIyY"); VO = set("ఒఓఔొోౌoO"); VU = set("ఉఊుూuU")
VIRAMA = "్"; MARKS = set("ంఃఁ")
chars, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
out = []
inside_tag = False
def who_at(t):
    for s in tl["segments"]:
        if s["start"] - 0.05 <= t <= s["end"] + 0.1: return code[s["id"]]
    return ""
for i, c in enumerate(chars):
    if c == "[": inside_tag = True
    if inside_tag:
        if c == "]": inside_tag = False
        continue
    if st[i] is None: continue
    t0, t1 = st[i] + lead, (en[i] or st[i]) + lead
    nxt = chars[i + 1] if i + 1 < len(chars) else " "
    if c in " ,.!?…-—:;\n\"'": shape = "X"
    elif c in LAB: shape = "A"
    elif c in FV: shape = "G"
    elif c in VA: shape = "D"
    elif c in VE: shape = "C"
    elif c in VO: shape = "E"
    elif c in VU: shape = "F"
    elif c == VIRAMA or c in MARKS: continue
    elif re.match(r"[క-హA-Za-z]", c):
        # a consonant: its own shape briefly, then the inherent 'a' unless a vowel sign / virama follows
        shape = "B"
        if nxt not in "ాిీుూెేైొోౌ్" and not re.match(r"[A-Za-z]", c):
            out.append([round(t0, 3), "B", who_at(t0)]); out.append([round((t0 + t1) / 2, 3), "C", who_at(t0)]); continue
    else: shape = "B"
    out.append([round(t0, 3), shape, who_at(t0)])
# drop shapes shorter than 1.5 frames (jitter), rest the mouth in gaps > 0.15 s
clean = []
for k, (t, s, w) in enumerate(out):
    if clean and t - clean[-1][0] < 0.05: clean[-1] = [clean[-1][0], s, w]; continue
    clean.append([t, s, w])
json.dump(clean, open(f"{d}/visemes.json", "w"))
from collections import Counter
print(len(clean), "keys", Counter(s for _, s, _ in clean))
