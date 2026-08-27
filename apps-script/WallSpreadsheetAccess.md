# Who can download the production spreadsheet

The export is **every advisor's production, by name**. It should reach admins
and the branch manager, and nobody else.

## What the wall can and cannot do

The wall has **no sign-in**. `?k=<WALL_KEY>` authenticates a *screen*, not a
person — that key is baked into the page so it can run unattended on a
television. There is no identity for the page to check a role against.

So the button is no longer on the wall. It renders only when the page is
opened with:

```
https://factfind360.com/wall.html?admin=<code>
```

`ADMIN_CODE` is set near the download handler in `wall.html`. **Change it from
the default before sharing the link.**

### Be clear about what that is

It keeps the export **off a public display**, which is the actual risk: the
screen in the branch does not carry the parameter, so nobody walking past can
click a button that is not rendered.

It is **not a password.** Anyone who learns the admin URL can use it. A page
served as static HTML cannot verify a person — there is nothing to verify
against.

## Where it belongs properly

The **dashboard** already does this correctly. `rrbAuthorize_` resolves a
signed session token to a real person, and `rrbScopeForRole_` already
distinguishes:

| scope | who |
|---|---|
| `{kind:'branch'}` | the Branch Manager — sees everything |
| `{kind:'units', unitKeys:[…]}` | a manager and the units beneath them |
| `{kind:'agent', code:'A…'}` | an advisor — their own cases only |

A download served from there can refuse anyone whose scope is not `branch`,
server-side, and no URL gets round it.

**The move:** add an `action=production_xlsx` handler that checks
`rrbAuthorize_(e)` and returns `{ok:false}` unless `scope.kind === 'branch'`,
then put the button on the dashboard behind the same check. The wall keeps its
`?admin=` link as a convenience for the branch manager's own phone.

Until that exists, the `?admin=` link is the honest half-measure: it solves
the public-display problem completely and the identity problem not at all.
