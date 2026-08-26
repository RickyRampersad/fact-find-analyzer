# Three more, found reading the live script

All three are one-line or one-block edits inside functions that already exist.
None needs a new file.

---

## 1. Every advisor's insight panel shows the whole branch

`getFFInsights()` in **Code.gs**, the fact-find counting loop:

```js
if (s.agent_code === code || (s.agent_email && code === code)) {
```

`code === code` is always true. So the `||` short-circuits to true on every
row that has an agent email — which is every row — and the loop counts the
**entire branch's** fact finds as this one agent's.

An advisor who has written two cases opens the panel and sees fifty-five. So
does every other advisor. `ff_year` and `ff_30d` are branch totals wearing an
agent's name, `last_submission` is the branch's last submission, and the
`compliance_flag` — which fires on `ffYear === 0` — can never fire for anybody,
because the branch total is never zero. The one number the panel exists to
surface is the one it can no longer show.

**The fix.** The intent was clearly "match on code, or on email where the code
is missing". Resolve the email once, above the loop, and compare it:

```js
var wantEmail = '';
try { wantEmail = String((ffLoadRoster_()[code] || {}).email || '').toLowerCase(); }
catch (e) {}

// …inside the loop:
if (s.agent_code === code || (wantEmail && String(s.agent_email || '').toLowerCase() === wantEmail)) {
```

The roster lookup lower down already builds `agentEmail` the same way — this
just needs it before the loop rather than after it.

---

## 2. Two digests, both at five o'clock

Two separate functions each install a daily 17:00 trigger:

| function | installed by | what it sends |
|---|---|---|
| `sendDailyFactFindDigest` | `setupDailyDigest()` | today / week / MTD, by unit, coaching block, tap-to-sign |
| `rrbSendManagerDigest` | `rrbSetup()` | on-your-desk, recommend-ratio, quiet agents, week-vs-last |

Both are wired, both are good, and both land in the same inbox within a minute
of each other every evening. Whichever arrives second is the one that gets
skimmed, and after a fortnight of two-a-day both get skimmed.

**The fix — pick one.** They overlap on the counts and diverge on the
interesting part: the first carries the coaching read and the sign-from-email
buttons, the second carries recommend-ratio and quiet agents. Neither is
redundant, so the answer is to keep `sendDailyFactFindDigest` (it is the one
that can be acted on from the phone) and move the two measures worth having
from the other into it — rather than deleting either outright.

Until that is done, stop the duplicate:

```js
function rrbStopDuplicateDigest() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'rrbSendManagerDigest') { ScriptApp.deleteTrigger(t); n++; }
  });
  Logger.log('%s duplicate 5pm digest trigger(s) removed. sendDailyFactFindDigest still runs.', n);
}
```

And in `rrbSetup()`, delete the four lines under `// 4. Digest trigger` so a
future run does not reinstall it. `rrbSendManagerDigest()` stays callable by
hand — `rrbMdPreview()` is genuinely useful.

---

## 3. `prospectToken` — one column, two lines

Not in `ffBuildSchema()`, so a fact find cannot say which link it came from,
and the funnel on the wall stops at *booked*. Full spec in `ProspectToken.md`;
the schema half is one line, next to the other routing fields:

```js
s.push(["prospectToken", "Prospect Token"]);
```

`ffWriteRow_` and `ffReadRow_` are header-driven, so nothing else in the script
changes. The form sends it, the column stores it, and sent → booked → fact find
→ cover written becomes one join instead of a guess.

---

## What I checked and did NOT find

Worth recording, so nobody re-opens these.

**The reasons DO reach the client.** `rrbRecTable_(d, true)` prints
`rec{i}Reason` under a "Why:" heading in the client's copy, and it has all
along. I said earlier that they did not. That was wrong.

**All three manager addresses are filled in.** `MAIL_CONFIG.managers` carries
kerwyn, gary and akaash with real addresses. The blanks I mentioned were in my
own draft file, not in the live script.

**The review links resolve.** `APP_URL` points at
`factfinds.netlify.app/FFPROJECT.html` in mixed case while the file on disk is
lowercase — I expected a 404. Checked all four spellings against the live host
and every one returns 200. Netlify is serving it. Not a fault.

**A client signature page already exists.** `rrbClientSignPage_` collects the
attestation, the drawn signature, the limited-scope tick and the rating, and
files it into `clientSigUrl`. It is more thorough than the page I had drafted.
Mine is redundant.

**Managers can already decide from email without signing in.**
`rrbDecideSign` → `rrbDecide` handles approve, decline, send-back, the RAI
answers and the signature, all on a single-use token. Also more complete than
what I had drafted.

So of the five files I said were waiting to be installed, **two were already
built better in the live script** and one — the recipients — is now folded into
`RRBranchClientLetter.gs` with the letter fix it belongs beside.
