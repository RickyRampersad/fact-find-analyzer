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

say 2 "You finish with your client, and you submit. That is the last thing you have to do."

say 3 "Everything you asked her lands on the Guardian form. The real one. Word for word, where it belongs."

say 4 "And look at what sits at the top of page one. The Insurance Act. Schedule eleven. Understand the need before you recommend anything."

say 5 "That is not a rule the branch invented. It is printed on the form, and your client signs directly underneath it."

say 6 "Your client hears from us within seconds. Their own copy. In plain words. Your reason sits beside every plan."

say 7 "Your manager gets the case on their phone. The figures. The reason. Anything worth a second look. All of it pulled out already."

say 8 "They approve and sign it right there. No sign in. No form. Their signature goes straight onto the fact find."

say 9 "The moment they do, your client gets their plan."

say 10 "And here is what changed. That letter now says what your client actually took. Not everything you showed them. What they chose."

say 11 "What they turned down is on it too. In their own words. Critical illness. Revisit in March. When the car loan finishes."

say 12 "Then look at who receives it. Your client. Copied to their direct manager, and to you."

say 13 "Sales support is off it. The branch manager is blind copied. Your client sees the people who advised them, and nobody else."

say 14 "Then they sign. I confirm the recommendations were explained to me, and the decision shown is the one I made."

say 15 "That is what keeps business on the books. A client who understood what they bought. And chose it themselves. That client does not walk away in month nine."

say 16 "Proper needs assessment. Real client engagement. Every step of it on Guardian's own paper."

say 17 "One section. Three steps. Section ten. Step three. That is where all of this comes from."

echo
echo "Durations:"
python3 - <<'PYEOF'
from mutagen.mp3 import MP3
import glob
d=[round(MP3(f).info.length,2) for f in sorted(glob.glob('line*.mp3'))]
for f,x in zip(sorted(glob.glob('line*.mp3')),d): print('  %-12s %6.2fs' % (f,x))
print()
print('  DUR = [%s];' % ', '.join(str(x) for x in d))
print('  total %.1fs' % sum(d))
PYEOF
