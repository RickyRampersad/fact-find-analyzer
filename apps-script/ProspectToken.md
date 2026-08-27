# Carrying the prospect token onto the fact find

One column and two lines. It is the difference between *"the branch did 12 fact
finds"* and *"Narissa sent 4 links, 3 booked, 2 became fact finds and one is
written."*

## What is already true

An advisor sends `…/meet/a/A08413/?t=C7PKTTD&c=Kevon`.

- `C7PKTTD` is written to the **prospecting** sheet when the link is sent —
  `logSend()` posts `action=link` with `agent`, `advisor`, `token`, `name`,
  `phone` and `at`.
- Kevon taps it. The token stays on the address the whole way through
  `/meet/`.
- He books. The advisor opens the fact find.
- **The token stops there.** Nothing carries it across, so the fact find has no
  idea which link the client arrived from.

The two sheets have never had a column in common. That is the only reason the
funnel on the wall stops at *booked*.

## The change

### 1. On the fact find sheet

Add one column. Header exactly:

```
prospectToken
```

### 2. In the fact find

Read it off the address and keep it in state, the same way the advisor's own
code already is. Near where `AGENT` and `ADVISOR` are read:

```js
var PROSPECT_TOKEN = new URLSearchParams(location.search).get('t') || '';
```

and include it in the submission, in `gatherSubmission()`:

```js
payload.prospectToken = PROSPECT_TOKEN;
```

If the advisor opened the form cold rather than from a booking, it is blank.
Blank is correct and must stay blank — a fact find with no token is one that
did not come from a link, and guessing at that is how a walk-in gets counted
as prospecting.

### 3. In the Apps Script

Write it to the new column with the rest of the row. Nothing else changes.

## What it unlocks

Once every fact find carries the token of the link it came from, the join is
exact rather than inferred, and all of this becomes reportable per advisor:

- links sent → opened → watched → booked → **fact find done → signed off →
  cover written**
- conversion at every step, by advisor and by week
- most opened and most **converted**, which are rarely the same person
- aging on links that booked but never became a fact find — the ones actually
  worth chasing
- cover written that can be traced to a link, which is the number that decides
  whether any of this was worth building

## Why it is not name matching

The obvious shortcut is to match the prospect's name against the client's name.
Do not. Names are typed twice by two different people, they are shared inside
households, and they are spelled differently in the two systems — the branch
already found three of those in one month on the group census. A join that is
right most of the time credits somebody else's sale to the wrong advisor the
rest of the time, and nobody finds out until it matters.

A token is exact or it is absent. There is no wrong answer in the middle.
