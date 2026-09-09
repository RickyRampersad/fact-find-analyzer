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

say 1 "The fact find has not changed. What happens after it, has."

say 2 "A client used to sign, and then hear nothing until their policy arrived. Nobody forgot. Nobody owned the silence."

say 3 "Now the client answers first. They read the plan, confirm it is right, rate the advice, and sign online. No manager can approve until that yes is in."

say 4 "Every email a client gets goes out in their advisor's name. Replies come back to the advisor. The direct manager is copied. The branch manager, blind. Sales support, never."

say 5 "Four taps carry the rest. Signed and submitted. At the branch. Delivered and paid. Not proceeding. The client hears within the minute."

say 6 "And the timers chase us, not the client. Nothing keyed seven days after approval. A policy sitting at the branch after ten. After fifteen, the branch manager."

say 7 "Two days after delivery, the client is asked how it went. A score of three or under comes to the branch manager alone. Thirty days before their birthday, every year, they are asked whether anything has changed."

say 8 "Then we asked Salesforce what it already knew. Twenty seven policies matched. Thirteen were already delivered. A dispatch date was filled in on none of them."

say 9 "A step with no date is a step the client is never told about. Not sent late. Never sent."

say 10 "Eleven fact finds were sent back for correction and never came back. The oldest, forty days. Nothing was chasing them. Now something is."

say 11 "Fact find three sixty. Built at the branch. Running from today."

echo
echo "Cues — the last subtitle end is the line's length:"
for f in line*.srt; do
  printf '  %-12s %s\n' "$f" "$(grep -o '[0-9][0-9]:[0-9][0-9]:[0-9][0-9],[0-9]*' "$f" | tail -1)"
done
