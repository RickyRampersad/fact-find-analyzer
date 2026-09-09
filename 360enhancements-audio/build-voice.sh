#!/usr/bin/env bash
# Regenerate the enhancements film's narration.
#
#   ./build-voice.sh
#
# Needs edge-tts (pip install edge-tts). Free, no account, no licence — the
# same voice as the employee benefits film, so the two sound like one branch.
#
# Andrew at -3% reads slightly under natural pace, lets a full stop land, and
# does not smile. Short sentences do the rest. If a line needs to breathe more,
# split it into two sentences rather than reaching for commas.
#
# The .srt files are kept beside the MP3s: they are how every boundary in
# 360enhancements-film.html's SCENES, CUES and REVEALS tables was measured, so a later change
# can be checked rather than guessed. Never estimate a timing; read the cues.
#
# After regenerating, run  ./embed-audio.py  to fold the MP3s back into
# 360enhancements-film.html, which carries them inline so the film stays one file.
set -euo pipefail
cd "$(dirname "$0")"

VOICE="en-US-AndrewMultilingualNeural"
RATE="-3%"

say () {  # say <index> <text>
  local n="$1"; shift
  printf '  line%02d  %s\n' "$n" "$1"
  edge-tts --voice "$VOICE" --rate="$RATE" --text "$1" \
           --write-media "$(printf 'line%02d.mp3' "$n")" \
           --write-subtitles "$(printf 'line%02d.srt' "$n")"
}

echo "Narration — $VOICE at $RATE"

say 1 "This one is for the advisors. Every change in it came from something one of you said."

say 2 "You said the review was a black hole. The fact find went up, and then you waited, with nothing to tell the client."

say 3 "So the review has a clock on it now. One business day. And a fact find sent back for correction can no longer go quiet. It is chased every day until it comes home."

say 4 "You said the letter is the part a client actually keeps. So the letter got the branch letterhead. The Act, quoted in full. And your name at the top, with replies coming back to you."

say 5 "You said approvals were moving before the client had even seen the plan. So now nothing moves until the client says yes. They read it, they confirm it, they rate the advice, and they sign. Only then can a manager approve."

say 6 "You said clients always ask where the policy is, and you never had an answer. Now four taps answer for you. Signed and submitted. At the branch. Delivered and paid. Not proceeding."

say 7 "And the timers chase us, not the client. Nothing keyed after seven days. A policy sitting at the branch after ten. After fifteen, it reaches the branch manager."

say 8 "Eleven fact finds were sent back and never came back. The oldest, forty days. Nobody could see them. Now nothing can hide."

say 9 "None of this came from a system. It came from advisors saying the same thing often enough that it became impossible to ignore."

say 10 "So thank you. Genuinely. Keep telling us what is not working."

say 11 "Ricky Rampersad Branch. Built on what you told us."

echo
echo "Cues — the last subtitle end is the line's length:"
for f in line*.srt; do
  printf '  %-12s %s\n' "$f" "$(grep -o '[0-9][0-9]:[0-9][0-9]:[0-9][0-9],[0-9]*' "$f" | tail -1)"
done
