#!/usr/bin/env bash
# The halves a name sits between, one pair per panel that has somebody to name.
#
# Written so the join lands where a speaker would pause anyway. The "a" half
# ends on a phrase that leans forward, the name answers it, and the "b" half
# closes. No commas: a comma makes Andrew run on into the gap where the name
# goes, and the seam becomes audible.
set -euo pipefail
cd "$(dirname "$0")/names"

VOICE="en-US-AndrewMultilingualNeural"
RATE="-3%"

say () {
  local f="$1"; shift
  [ -s "$f.mp3" ] && { echo "  have $f"; return 0; }
  printf '  %-10s %s\n' "$f" "$1"
  edge-tts --voice "$VOICE" --rate="$RATE" --text "$1" --write-media "$f.mp3"
}

# p0 · the money
say c0a "Most need found this month."
say c0b "That is cover a family does not have yet."

# p1 · momentum
say c1a "Most fact finds in the last fortnight."
say c1b "One conversation at a time."

# p2 · recognition
say c2a "Leading this week."
say c2b "The biggest need identified. Worth saying out loud."

# p3 · the queue
say c3a "The oldest case waiting on a manager is"
say c3b "A client is waiting on that one."

# p4 · the managers
say c4a "Answering fastest."
say c4b "The branch median is on the board beside it."

echo "done"
