# Andrew, and how to change what he says

`build-voice.sh` renders the thirteen narration lines with **edge-tts** —
`en-US-AndrewMultilingualNeural` at `-3%`, the same voice and rate as the
launch and prospecting films. Free, no account, no licence.

## To change a line

1. Edit the `say` line in `build-voice.sh`.
2. Run `./build-voice.sh` — it re-renders all thirteen and prints durations.
3. Paste the durations into `DUR` at the top of `enhancements.html`.

**Step 3 is not optional.** The film is cut to the audio, so a line that got
longer and a `DUR` that did not pushes every scene after it out of sync. The
durations printed are measured off the rendered MP3s, not estimated.

## Why the MP3s are inside the HTML

The wall plays this in an iframe, and a hosted copy will not fetch a sibling
file. A linked MP3 is silent in exactly the two places that matter. So the
thirteen clips are base64 in the page — 513 KB of audio, 712 KB of page.

They are re-embedded by re-running the assembly, not by hand.

## Sync

Voice, bed and pictures all ride `AudioContext.currentTime`, never
`performance.now()`. One clock means they cannot drift apart no matter what
the browser does with the tab. If Web Audio is unavailable the film falls back
to the wall clock and the captions carry it.

## The bed

Branch theme — D major, 108 BPM, D–A–Bm–G, four bars a chord. Played in Web
Audio, so there is nothing to licence and nothing to ship.

Three layers that enter in turn, which is what makes this one a welcome rather
than a warning:

| | enters | what it is |
|---|---|---|
| pads | throughout | two detuned saws through a soft low-pass, a triangle an octave up, a sine underneath |
| pluck | line 3 | arpeggiated chord tones on eighths, short decay — the film starts to move when the flow does |
| hat | line 7 | a filtered noise tick on the offbeat, from the reveal onward |

Each entry is a lift the listener feels and does not notice, which is the only
way a bed should ever be noticed.
