#!/usr/bin/env python3
"""Fold the narration MP3s into film.html as data URIs.

The film has to stay a single file: the wall plays it in an iframe and the
hosted copy runs under a policy that will not fetch a sibling asset, so an
<audio src="line01.mp3"> would be silent in exactly the two places it matters.

Run ./build-voice.sh first, then this. Re-running is safe — it replaces
whatever is between the markers. It also prints the measured line lengths, so
the SCENES and CUES tables in film.html can be checked against the audio that
is actually in it.
"""
import base64, pathlib, re, sys

here = pathlib.Path(__file__).parent
film = here.parent / 'film.html'
html = film.read_text(encoding='utf-8')

mp3s = sorted(here.glob('line*.mp3'))
if not mp3s:
    sys.exit('No line*.mp3 here — run ./build-voice.sh first.')

parts, total = [], 0
for f in mp3s:
    raw = f.read_bytes(); total += len(raw)
    b64 = base64.b64encode(raw).decode('ascii')
    parts.append(f"  '{f.stem[4:]}': '{b64}'")   # quoted — 01 unquoted becomes 1
block = '\n' + ',\n'.join(parts) + '\n'

start, end = '/*__VO_START__*/', '/*__VO_END__*/'
if start not in html or end not in html:
    sys.exit('Markers missing in film.html — nothing was changed.')
html = re.sub(re.escape(start) + r'.*?' + re.escape(end),
              start + block + end, html, flags=re.S)
film.write_text(html, encoding='utf-8')

print(f'{len(mp3s)} lines embedded, {total/1024:.0f} KB of audio '
      f'({len(block)/1024:.0f} KB as base64)')
print(f'film.html is now {len(html)/1024:.0f} KB')

# The lengths the scene table has to agree with.
print('\nLine lengths, from the subtitle cues:')
run = 0.0
for f in sorted(here.glob('line*.srt')):
    stamps = re.findall(r'(\d\d):(\d\d):(\d\d),(\d\d\d)', f.read_text(encoding='utf-8'))
    h, m, s, ms = map(int, stamps[-1])
    d = h*3600 + m*60 + s + ms/1000
    run += d
    print(f'  {f.stem}  {d:6.3f}s')
print(f'  spoken total {run:.3f}s')
