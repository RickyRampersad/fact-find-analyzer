# Leads nobody was sent to

Somebody forwards an advisor's link. Somebody scans a code off a business card.
Both arrive carrying an advisor's code and neither was sent to the person who
filled it in — so today they look exactly like that advisor's own prospect, and
nothing anywhere says otherwise.

## Two kinds, and they are not the same

**Forwarded.** Kevon got Narissa's link, thought it was worth passing to his
wife, and she filled it in. That referral exists because of Narissa's work — her
message, her credibility, her client trusting her enough to pass it on. It goes
to **Narissa**, automatically. Taking it off her and handing it to somebody else
punishes exactly the behaviour the branch wants.

**Scanned.** A code on a business card or at a stand. No relationship produced
it. That one belongs to the **branch** until a name is put against it.

## Who assigns

The **branch manager**, and only the scans.

An unclaimed lead has no unit, so there is nothing to route it to until somebody
decides. A direct manager can only assign inside their own team, which makes it
whoever looks first — a race, not distribution.

## What the page already sends

`/meet/` classifies every booking and every arrival and posts it. Nothing needs
adding to the form.

| field | what it holds |
|---|---|
| `arrival` | `sent`, `forwarded` or `direct` |
| `addressedTo` | the first name the link was addressed to, where there was one |
| `agent`, `advisor` | whose link it was, even when forwarded |
| `token` | the link it came from |
| `name`, `phone` | who actually filled it in |
| `wants` | what they tapped — the needs they picked for themselves |
| `when`, `tod` | when they said they are free |
| `note` | anything they typed |

`arrival` is worked out on the page because that is the only place that knows
both halves: the name the link was addressed to, and the name the person
actually typed. A first name is a weak comparator, so it only ever downgrades to
`forwarded` — never upgrades anything to `sent`.

## The change

**1. Store `arrival` and `addressedTo`** with the booking, as two more columns.

**2. Auto-assign forwarded leads** to the advisor already on the record — they
sent the link that produced it. Nothing to decide.

**3. Add an `assignedTo` column**, blank for scans. Blank is what makes a lead
unclaimed; the wall reads exactly that.

**4. An `action=unclaimed` handler** returning the scans with no `assignedTo`,
and an `action=assign` taking a record id and an agent code.

## Do not add questions to the page

The instinct is to ask a cold arrival more, since nobody has spoken to them. The
booking already carries what they tapped, when they are free, and their own
note — more than most advisors get from a first phone call.

And that page's whole promise is *nothing to fill in, just tap*. It is in the
link preview, in the WhatsApp message, and it is why people finish it. Adding a
form to the one arrival with no relationship behind it is friction at the most
fragile moment there is.

What is missing is not data from them. It is the data being visible to whoever
assigns.

## What the wall already does with it

Panel 12 is built and waiting. The moment `arrival` comes back on the feed it
shows the unclaimed leads oldest first — name, how they arrived, how long they
have waited — and aggregates what they came for, because the thing that decides
who to assign is what they asked about, not who happens to be free.

Four people asking about retirement is a different call from four asking what
happens to the mortgage.
