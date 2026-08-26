# Why "taken" looks thinner than it is

One number, added to the wall feed.

## The problem it names

A case where nobody filled in **Section 10, Step 3** carries no decision. So
the branch has no record of what the client took.

That case still counts as a fact find. It still counts toward need. And then it
contributes **nothing** to taken, nothing to picked up, nothing to API — not
because the client took nothing, but because nobody said.

On the board that reads as a **closing** problem. It is a **recording** one.
Coach the wrong one and you spend a month on objection handling for a branch
whose advisors are closing fine and skipping a form field.

Eleven cases were in that state when the client-letter fault was found.

## The change

In **RRBranchWall.gs**, function `rrbWall`.

`dec1Go`…`dec6Go` are already on `WALL_FIELDS`, so nothing new is read — the
row is already in hand.

**1.** Beside the other counters near the top, add one:

```js
  var noDecision = 0;
```

**2.** Inside the row loop, just after the `for (var i = 1; i <= 6; i++)` block
that computes `apps`, add:

```js
    // Nobody recorded what the client decided. Not the same as deciding no.
    var anyDecision = false;
    for (var q = 1; q <= 6; q++) if (_str(get(row, 'dec' + q + 'Go'))) { anyDecision = true; break; }
    if (!anyDecision && sub && sub >= startOfMonth) noDecision++;
```

**3.** In the returned object, on the `month` block:

```js
    month: { submitted: month.submitted, approved: month.approved,
             premium: Math.round(month.premium), need: Math.round(month.need),
             cover: Math.round(month.cover), api: Math.round(month.api),
             apiAssumed: month.apiAssumed,
             noDecision: noDecision,                    // <- add this line
             label: Utilities.formatDate(now, tz, 'MMMM') },
```

That is the whole change. Three lines.

## What the wall does with it

An amber line under the month headline, beside *Cover recommended*:

> ⚠ **11 cases** carry no client decision, so nothing they took is counted here.

It is **silent when the count is zero**, and silent when the feed does not
carry the field at all — so the wall never guesses a number it was not given.
Publish the wall before the script change and nothing appears; publish the
script change and it lights up on the next refresh.

## Why it belongs on the wall and not in a report

The wall is read by advisors walking past. A report is read by nobody.

The number is also self-clearing: it exists to make people fill in Step 3, and
the moment they do it counts down to zero and disappears. A permanent metric
would be a nag. This is a prompt with an end.
