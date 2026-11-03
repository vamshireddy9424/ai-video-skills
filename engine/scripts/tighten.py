"""Tighten a voiceover for Shorts: shorten every pause to KEEP seconds, then speed up to TARGET seconds.
Remaps the ElevenLabs character timings so captions, visemes and scene anchors stay in sync.
  cd episodes/<ep> && python3 ../../scripts/tighten.py 0.32 150        # keep 0.32 s pauses, aim for 150 s
  python3 ../../scripts/tighten.py 0.32 150 dry                         # just print the numbers
Needs voice.raw.mp3 + alignment.raw.json (written by voice.mjs). Writes voice.mp3 + alignment.json.
Afterwards rebuild timing: node scripts/timeline.mjs --ep=<ep>"""
import json, subprocess, sys
KEEP = float(sys.argv[1]); target = float(sys.argv[2])
log = subprocess.run(['ffmpeg', '-nostdin', '-i', 'voice.raw.mp3', '-af', 'silencedetect=noise=-35dB:d=0.12', '-f', 'null', '-'],
                     capture_output=True, text=True).stderr.split('\n')
st = [float(x.split('silence_start: ')[1].split()[0]) for x in log if 'silence_start' in x]
en = [float(x.split('silence_end: ')[1].split()[0]) for x in log if 'silence_end' in x]
dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 'voice.raw.mp3']))
cuts = []
for a, b in zip(st, en):
    if b - a > KEEP: m = (a + b) / 2; cuts.append((m - (b - a - KEEP) / 2, m + (b - a - KEEP) / 2))
newdur = dur - sum(b - a for a, b in cuts); f = max(1.0, newdur / target)
print('removed', round(dur - newdur, 1), 'new', round(newdur, 1), 'tempo', round(f, 3))
if len(sys.argv) > 3: sys.exit()
def mp(t):
    if t is None: return None
    s = 0
    for a, b in cuts:
        if t >= b: s += b - a
        elif t > a: s += t - a
    return (t - s) / f
al = json.load(open('alignment.raw.json'))
for k in ['character_start_times_seconds', 'character_end_times_seconds']: al[k] = [mp(x) for x in al[k]]
json.dump(al, open('alignment.json', 'w'))
keep = []; p = 0
for a, b in cuts: keep.append((p, a)); p = b
keep.append((p, dur))
fl = ''.join(f'[0:a]atrim={a:.4f}:{b:.4f},asetpts=PTS-STARTPTS[k{i}];' for i, (a, b) in enumerate(keep))
fl += ''.join(f'[k{i}]' for i in range(len(keep))) + f'concat=n={len(keep)}:v=0:a=1,atempo={f:.4f}[o]'
subprocess.check_call(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', 'voice.raw.mp3', '-filter_complex', fl, '-map', '[o]', '-b:a', '192k', 'voice.mp3'])
