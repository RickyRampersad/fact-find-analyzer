#!/usr/bin/env bash
# Narration for the fact find update film — what changed, and the one thing
# it needs from an advisor.
#
#   ./build-voice.sh
#
# Needs edge-tts (pip install edge-tts). Free, no account, no licence, so
# nothing here needs clearing before it goes on WhatsApp or a wall screen.
#
# Same voice and rate as the launch and prospecting films. Three films that
# share a voice and a key sound like one organisation; three that do not sound
# like three suppliers. Andrew at -3% reads slightly under natural pace, lets a
# full stop land, and does not smile — which matters here, because this film
# tells thirty-four people that nine client letters went out wrong.
#
# Written to be spoken. Short declarative sentences, one idea each. The numbers
# carry the weight, so they are said plainly and not sold.
#
# When it has run, send the durations it prints. The film is cut to the
# rendered audio — TIMINGS at the top of enhancements.html is currently
# ESTIMATES and says so. Estimates are how the last film shipped out of sync.
set -euo pipefail
cd "$(dirname "$0")"

VOICE="en-US-AndrewMultilingualNeural"
RATE="-3%"

say () {  # say <index> <text>
  local n="$1"; shift
  printf '  line%02d  %s\n' "$n" "$1"
  edge-tts --voice "$VOICE" --rate="$RATE" --text "$1" --write-media "$(printf 'line%02d.mp3' "$n")"
}

echo "Narration — $VOICE at $RATE"
echo

say 1 "Something changed on the fact find this week. One minute, and it affects every case you write."

say 2 "When your manager approves a case, your client gets a letter. Until this week that letter listed everything you recommended, added it up, and called it approved."

say 3 "So a client who took one plan was told they hold all of them. Nine clients were. One was told he holds three million dollars of cover. He holds a hundred and fifty thousand."

say 4 "That was not something any advisor did. The letter was reading the wrong column."

say 5 "It now reads what the client actually decided. Section ten. Step three."

say 6 "Eleven cases came through with step three empty. Empty means the letter has nothing to report, so it reports nothing."

say 7 "Fill it in and three things follow. The letter is right. What they turned down is written down, with their own reason beside it. And the client signs to say the decision was theirs."

say 8 "It is also where your production comes from. A case with no decision recorded is a case the branch cannot count."

say 9 "The wall now shows how many cases are missing it. It sits under the month, in amber, and it counts down as you fill them in."

say 10 "One section. Three steps. The third one is the one that matters."

echo
echo "Durations — paste these into TIMINGS in enhancements.html:"
for f in line*.mp3; do
  printf '  %-12s %6.2fs\n' "$f" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")"
done
