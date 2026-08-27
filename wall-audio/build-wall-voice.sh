#!/usr/bin/env bash
# Narration for the branch wall — one line per panel.
#
#   ./build-wall-voice.sh
#
# Andrew at -3%, same as the launch, prospecting and enhancements films.
#
# THESE LINES CARRY FIGURES ON PURPOSE.
# The first version deliberately avoided numbers so it would stay true when
# the data moved. What that actually produced was seventeen lines that could
# have been about any branch in any month - and a wall that says nothing.
# The production figures are a snapshot, so a line naming them is true until
# the snapshot is replaced. When PROD is refreshed, rerun this.
#
# No commas anywhere. A full stop makes Andrew land the fact; a comma makes
# him run on and it is the run-on that sounds synthetic.
set -euo pipefail
cd "$(dirname "$0")"

VOICE="en-US-AndrewMultilingualNeural"
RATE="-3%"

say () { local n="$1"; shift
  printf '  line%02d  %s\n' "$n" "$1"
  edge-tts --voice "$VOICE" --rate="$RATE" --text "$1" --write-media "$(printf 'w%02d.mp3' "$n")"
}

echo "Wall narration — $VOICE at $RATE"; echo

say 1  "Start with what the branch found. Not what it sold. Cover a client needs and does not yet have."

say 2  "Fact finds finished in the last fourteen days. Every advisor on their own line. The branch runs underneath them."

say 3  "Approved this week. The manager signed. The client signed. Finished work and worth saying out loud."

say 4  "Cases waiting on a manager. Oldest at the top. Twelve days waiting is a client wondering whether anybody read it."

say 5  "How long each manager takes to answer. The branch median is three and a half days. The quickest answers in one."

say 6  "The week in one view. Days worked. API picked up. And what is still sitting in the pipeline."

say 7  "Day by day across the week. Look at the weekend column. Some of this branch works Saturday."

say 8  "API picked up against API recommended. The gap between those two is business already won and not yet counted."

say 9  "The year so far. Seven hundred and eighty five applications. Six point three million in API."

say 10 "Which days this branch actually works. The busiest day. And the longest run without a break."

say 11 "Where people stop on the booking page. And what they tell us they came for."

say 12 "Leads nobody was sent to. Scanned off a card or a stand. These wait until somebody is put against them."

say 13 "Today. This week. August. Quarter three. And the year. Forty seven applications this month for eight hundred and thirty six thousand."

say 14 "Varun Seegolam leads the year on six hundred and thirty eight thousand from twenty seven policies. Aidan Eugene wrote sixty seven policies for less than that. Case size is the whole difference."

say 15 "This is the number to look at. Ten million in API written and waiting on requirements. That is more than the entire year picked up. The average wait is one hundred and nine days."

say 16 "Above the line went out. Below the line came in and is still waiting. Net is what the branch actually moved."

say 17 "Every advisor in the branch. Apps and API. Week. Month. Quarter. Year to date. No units. Just names."

echo
echo "Built:"; ls -la w*.mp3 | awk '{printf "  %-10s %s bytes\n", $9, $5}'
