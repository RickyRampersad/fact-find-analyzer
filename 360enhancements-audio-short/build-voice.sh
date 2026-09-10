#!/usr/bin/env bash
# The short cut's narration — the WhatsApp-length version of the film.
# Same voice and rate as the full cut, so the two are the same branch.
# Seven lines against seven scenes; the long film keeps the detail.
set -euo pipefail
cd "$(dirname "$0")"
VOICE="en-US-AndrewMultilingualNeural"
RATE="-3%"
say () { local n="$1"; shift; printf '  line%02d  %s\n' "$n" "$1"
  edge-tts --voice "$VOICE" --rate="$RATE" --text "$1" \
    --write-media "$(printf 'line%02d.mp3' "$n")" --write-subtitles "$(printf 'line%02d.srt' "$n")"; }

echo "Narration — $VOICE at $RATE"

say 1 "This one is for the advisors. Every change in it came from something one of you said."

say 2 "Here is the whole schedule. Day three and day eight if the client goes quiet. One business day for the review. Day seven if nothing has been keyed. Day ten at the branch. Day fifteen it reaches the branch manager. The survey two days after delivery. And every year, thirty days before their birthday."

say 3 "Nothing moves until the client says yes. They read the plan, confirm it, rate the advice, and sign on their phone. Only then can a manager approve."

say 4 "And four taps answer the question you could never answer. Signed and submitted. At the branch. Delivered and paid. Not proceeding. The client hears within the minute, in your name."

say 5 "None of it is a preference. It is what the Act asks of us, answered the same way every time."

say 6 "None of this came from a system. It came from you. So thank you. Keep telling us what is not working."

say 7 "Ricky Rampersad Branch. Built on what you told us."

echo
echo "Cues — the last subtitle end is the line's length:"
for f in line*.srt; do printf '  %-12s %s\n' "$f" "$(grep -o '[0-9][0-9]:[0-9][0-9]:[0-9][0-9],[0-9]*' "$f" | tail -1)"; done
