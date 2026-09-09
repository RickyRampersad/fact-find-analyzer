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
# film.html's SCENES, CUES and REVEALS tables was measured, so a later change
# can be checked rather than guessed. Never estimate a timing; read the cues.
#
# After regenerating, run  ./embed-audio.py  to fold the MP3s back into
# film.html, which carries them inline so the film stays one file.
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

say 3 "So here is the whole schedule. Every date, every letter, and who it goes to."

say 4 "Day three, and day eight, if the client has not answered. On day eight, you are asked to call. One business day for the review, from the client's yes to a decision. Day seven if nothing has been keyed. Day ten if the policy is sitting at the branch. Day fifteen, it reaches the branch manager. Two days after delivery, the survey. And thirty days before their birthday, every year, for as long as they are a client."

say 5 "Twenty four letters carry it. Fourteen a client can receive. Ten that only we see. Every one written to be read on a phone."

say 6 "You said the letter is the part a client actually keeps. So it got the branch letterhead. The Act, quoted in full. And your name at the top."

say 7 "And none of this is a preference. Schedule eleven of the Act asks that the consumer certifies the accuracy of what we recorded. That is the client's yes. It asks for advice in writing, in plain language. That is the letter. It asks for post-sale communication and periodic reviews. That is every milestone, and the one that comes every year."

say 8 "One thing to be clear about. Section two six eight gives the insurer twenty business days to issue a policy once the risk is accepted. Delivering it within twenty days of it reaching the branch is not the Act. That standard is ours."

say 9 "You said approvals were moving before the client had even seen the plan. So now nothing moves until the client says yes. They read it, they confirm it, they rate the advice, and they sign. Only then can a manager approve."

say 10 "You said clients always ask where the policy is, and you never had an answer. Now four taps answer for you. Signed and submitted. At the branch. Delivered and paid. Not proceeding."

say 11 "And every one of them goes out the same way. To the client, in your name. Your direct manager copied. The branch manager blind. Sales support never. Replies come back to you."

say 12 "The timers chase us, not the client. Nothing keyed after seven days. A policy sitting at the branch after ten. After fifteen, the branch manager."

say 13 "A client used to hear from us once. The plan, and then silence until the policy turned up. There are fourteen moments now where they hear something, and not one of them is you chasing a form."

say 14 "Eleven fact finds were sent back and never came back. The oldest, forty days. Nobody could see them. Now nothing can hide."

say 15 "None of it went out untested. It was rehearsed against the branch's real book first. The first run would have written to thirty one clients. Five faults later, it wrote to seven. That is what a rehearsal is for."

say 16 "None of this came from a system. It came from advisors saying the same thing often enough that it became impossible to ignore. So thank you. Genuinely. Keep telling us what is not working."

say 17 "Ricky Rampersad Branch. Built on what you told us."

echo
echo "Cues — the last subtitle end is the line's length:"
for f in line*.srt; do
  printf '  %-12s %s\n' "$f" "$(grep -o '[0-9][0-9]:[0-9][0-9]:[0-9][0-9],[0-9]*' "$f" | tail -1)"
done
