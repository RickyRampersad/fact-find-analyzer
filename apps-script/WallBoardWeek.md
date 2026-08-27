# Who started this week

The board on panel 13 is a **running total**. It rewards whoever has been at
it longest, which is right for a board and useless on a Monday morning.

The other question a week asks is: **who has opened their account since it
turned.** That is now a section under the board — ranked, with apps and API.

## What the feed has to return

`PROD.week` already carries the branch totals:

```js
week: { n: 4, api: 28172 }
```

It needs one more key:

```js
week: {
  n: 4,
  api: 28172,
  board: [
    { a: 'Varun Seegolam',    n: 2, api: 14820 },
    { a: 'Meera Persad Khan', n: 1, api:  8640 },
    { a: 'Neil Ramnanan',     n: 1, api:  4712 }
  ]
}
```

- `a` — advisor name, as it appears everywhere else on the wall
- `n` — applications picked up this week
- `api` — **annualised**, the same basis as the running board, so the two
  columns can be read against each other

Sorted by `api` descending. The panel ranks them as given and does not re-sort,
so the order the feed chooses is the order the branch sees.

## What it does until then

Nothing invented.

| feed says | panel shows |
|---|---|
| `week.board` has rows | the ranked list, apps and API |
| `week.n > 0`, no board | ⚠ *"4 picked up this week for TT$28k, but the feed does not say who yet."* |
| `week.n` is 0 | *"Nobody on the board yet this week."* |

The middle case is the one that matters. The branch total is real and the
names are not, so it prints the real number and says the names are missing.
Four plausible names would have filled the panel and been quoted back as fact
by Friday.

## Where it comes from

`PROD_ENDPOINT` is still `''`, so everything on these panels is a baked-in
snapshot. When `WallBoard.gs` starts serving, `week.board` needs to come with
it — the same query that produces `week.n` and `week.api`, grouped by advisor
instead of summed.
