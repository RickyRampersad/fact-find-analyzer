#!/usr/bin/env bash
# Narration for the enhancements film — the flow, end to end.
#
#   ./build-voice.sh
#
# Andrew at -3%, same as the launch and prospecting films. Three films that
# share a voice and a key sound like one organisation.
#
# This one is NOT a correction notice. It walks an advisor through what now
# happens between pressing submit and a client holding a signed plan, and the
# tone is a welcome, not an apology.
set -euo pipefail
cd "$(dirname "$0")"

VOICE="en-US-AndrewMultilingualNeural"
RATE="-3%"

say () { local n="$1"; shift
  printf '  line%02d  %s\n' "$n" "$1"
  edge-tts --voice "$VOICE" --rate="$RATE" --text "$1" --write-media "$(printf 'line%02d.mp3' "$n")"
}

echo "Narration — $VOICE at $RATE"; echo

say 1 "The fact find just got a great deal better. Here is what happens now, from the moment you press submit."

say 2 "You finish with your client and you submit. That is the last thing you have to do."

say 3 "Your client hears from us within seconds. Their own copy, in plain words. What you found. What you recommended. And why, in your words, not ours."

say 4 "Your manager gets the case on their phone. The figures, the reason, and anything worth a second look, already pulled out."

say 5 "They approve and sign it right there. No sign in. No form. Their signature goes straight onto the fact find."

say 6 "The moment they do, your client gets their plan."

say 7 "And here is the part that changed. That letter now says what your client actually took. Not everything you showed them. What they chose."

say 8 "What they turned down is on it too, in their own words, so nothing looks like it was never offered."

say 9 "Then look at who receives it. Your client. Copied to their direct manager, and to you."

say 10 "Sales support is off it. The branch manager is blind copied. Your client sees the people who advised them, and nobody else."

say 11 "Then they sign. I confirm the recommendations were explained to me, and the decision shown is the one I made."

say 12 "Their hand, on your file. That is the strongest thing a fact find can carry."

say 13 "One section. Three steps. Section ten, step three, is where all of this comes from."

echo
echo "Durations:"
for f in line*.mp3; do
  printf '  %-12s %6.2fs\n' "$f" "$(python3 -c "
import sys,struct
f=open('$f','rb').read()
# frame-count MP3 duration: 24kHz mono, count frames
i=0;n=0
while i<len(f)-4:
    if f[i]==0xFF and (f[i+1]&0xE0)==0xE0:
        br=[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0][(f[i+2]>>4)&0xF]
        sr=[44100,48000,32000,0][(f[i+2]>>2)&0x3]
        ver=(f[i+1]>>3)&0x3
        if ver==2: sr//=2
        elif ver==0: sr//=4
        if br==0 or sr==0: i+=1; continue
        pad=(f[i+2]>>1)&1
        fl=(144*br*1000)//sr+pad
        if fl<4: i+=1; continue
        n+=1; i+=fl
    else: i+=1
print(round(n*1152/24000,2))
")"
done
