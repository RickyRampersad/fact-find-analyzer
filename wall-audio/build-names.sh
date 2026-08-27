#!/usr/bin/env bash
# One clip per advisor first name, plus the carrier phrases they sit inside.
#
# WHY THIS EXISTS
# The narration is a single rendered file, so it could name a leader only by
# baking that leader's name into it - which is wrong the moment somebody else
# leads. The board said "Narissa" and the voice said "leading this week" and
# stopped, which is the one thing a recognition panel must not do.
#
# So the line is assembled at play time: a carrier, a name, a carrier. Web
# Audio schedules buffers to the sample, so three clips play as one sentence
# with no seam. Same voice, same rate, same day - they have to match the rest
# of the narration or the join is audible.
set -euo pipefail
cd "$(dirname "$0")/names"

VOICE="en-US-AndrewMultilingualNeural"
RATE="-3%"

say () {
  local f="$1"; shift
  [ -s "$f.mp3" ] && { echo "  have $f"; return 0; }
  printf '  %-14s %s\n' "$f" "$1"
  edge-tts --voice "$VOICE" --rate="$RATE" --text "$1" --write-media "$f.mp3"
}

# The names. Spoken alone, so no trailing full stop - a full stop makes Andrew
# drop the pitch as if the sentence ended, and it has not.
for n in Aidan Akaash Aleema Alyssa Anthony Chris Crystal Daniel Darryl \
         Dhalina Faizal Fawwaz Felicia Gary Jamil Javid Jesus John Joy \
         Kerwyn Lizara Malcolm Meera Naila Narissa Neil Premchand Rajiv \
         Randolph Ricky Stephanie Tricia Varun; do
  say "n_$n" "$n"
done

echo "done"
