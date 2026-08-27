# Fixing the client letter — step by step

For someone who does not write code. Nothing here needs you to understand
JavaScript. You are pasting one file in and changing two small blocks of text.

**Steps 1 to 4 change nothing.** Not for a client, not for an advisor, not for
you. You can stop after any of them and everything works exactly as it does
today. The first change that anybody sees is step 5.

Set aside twenty minutes and do not rush the two edits.

---

## Before you start — take a copy

In the Apps Script editor, top left: **File ▸ Make a copy**.

Name it `RR Branch FF System — backup 26 Aug`.

That copy is not connected to anything. It sends no email, it runs no trigger,
it just sits there. If any of this goes wrong you have the original, exactly as
it is right now.

Do this even though the steps below are safe. It costs you thirty seconds and
it is the difference between a bad afternoon and a bad week.

---

## Step 1 — Open the script

script.google.com → **RR Branch FF System**.

Down the left you will see **Files**, with `Code.gs`, `RRB_Additions.gs`,
`RRBranchOS.gs`, `RRBranchEmails.gs`, `RRBranchWall.gs` and a couple of others.

Those are the files you already have. You are about to add one more.

---

## Step 2 — Add the new file

1. Hover over **Files**. A **+** appears to its right. Click it.
2. Choose **Script**.
3. It creates `Untitled.gs` and asks for a name. Type:

   ```
   RRBranchClientLetter
   ```

   Do **not** type the `.gs` — it adds that itself.

4. The new file opens with a few lines already in it:

   ```js
   function myFunction() {

   }
   ```

   Select all of that and delete it, so the file is empty.

5. Open `RRBranchClientLetter.gs` from this folder, select the whole thing,
   copy it, and paste it into the empty file.

6. Press **Ctrl+S** (or **Cmd+S** on a Mac) to save.

**What just changed: nothing.** You have added some new functions to the
project, and not one thing in the script calls them yet. Every email still goes
out exactly as it did this morning.

---

## Step 3 — See what the letters have been saying

This is the part worth doing slowly.

1. At the top of the editor there is a dropdown showing a function name. Click
   it and choose **`rrbLetterCheck`**.
2. Click **▶ Run**.
3. The first time, Google asks for permission — *Review permissions*, choose
   your account, *Advanced*, *Go to RR Branch FF System (unsafe)*, *Allow*.
   That warning is Google saying "this script was written by a person, not by
   us". It is your own script.
4. The **Execution log** opens along the bottom.

You will see a line for every approved case. Something like:

```
  *  Anisa Ramkissoon          WAS  TT$5,400,000  TT$2,410/mo  4 plans
                             NOW  TT$480,000    TT$500/mo    1 taken
     Kevon Ramkissoon        took everything — letter unchanged
  ~  Kavita Singh            no decision recorded — new letter shows no total
```

Then a summary:

```
12 approved case(s) checked.
  4 already correct — the client took everything recommended.
  6 change, of which 6 were OVERSTATED.
  2 carry no decision — the new letter shows no total on those.
```

**Read that overstated number.** Each one is a letter already sitting in
somebody's inbox, on your letterhead, approved in a manager's name, telling a
client they hold cover they do not hold.

That number is how you decide whether the rest of this is a job for tonight or
a job for Monday.

**Nothing has changed yet.** This function only reads.

---

## Step 4 — See who is copied on a client's letter

1. Function dropdown → **`rrbRecipientCheck`**.
2. **▶ Run**.

```
Newest approved case: Anisa Ramkissoon

  WAS   to:  anisa.ramkissoon@example.com
        cc:  branch.manager@myguardiangroup.com   <- the client can read this

  NOW   to:  anisa.ramkissoon@example.com
        cc:  their.manager@myguardiangroup.com,narissa.mohammed@example.com
        bcc: branch.manager@myguardiangroup.com
```

Today your address is on the client's own letter where they can see it, and the
advisor who wrote the case is not copied at all.

**Still nothing changed.** This one only reads too.

---

## Step 5 — The first edit

This is the one that fixes the figures.

Click **`RRB_Additions.gs`** in the file list. Press **Ctrl+F** and search for:

```
function rrbClientApprovedHtml_
```

You will land on this:

```js
function rrbClientApprovedHtml_(d) {
  var first = (_str(d.clientName) || 'there').split(' ')[0];
  var adv = _str(d.advisorName) || 'your adviser';
  var mgr = _str(d.mgrName) || _str(d.reviewerName) || 'their direct manager';
  var rt = rrbRecTable_(d, true);
```

### 5a — change one line

That last line:

```js
  var rt = rrbRecTable_(d, true);
```

becomes:

```js
  var rt = rrbTookTable_(d);
```

> **Careful — that same line appears twice in the file.** The other one is
> inside `rrbClientDraftHtml_` and has this comment directly above it:
>
> ```js
>   // The draft, client-safe (no internal figures) — the same table the
>   // approval letter uses, in client mode.
> ```
>
> **Leave that one alone.** The draft email is meant to show the full
> recommendation — that is its job. It is only the *approval* letter that must
> show what the client actually took.
>
> The one you want is the one about four lines below
> `function rrbClientApprovedHtml_(d) {`, with no comment above it.

### 5b — change one small block

Still inside `rrbClientApprovedHtml_`, scroll down about fifteen lines to:

```js
  if (rt.count) {
    h += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94A3B8;font-weight:700;margin-bottom:7px">What has been approved for you</div>' + rt.html;
  }
```

Select all three lines and replace them with these five:

```js
  if (rt.count) {
    h += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94A3B8;font-weight:700;margin-bottom:7px">' +
         (rt.decided ? 'What you are taking' : 'What was recommended to you') + '</div>' + rt.html;
  }
  h += rrbLeftTable_(d);
```

Two things happen there. The heading now tells the truth on a case where
nobody recorded a decision. And `rrbLeftTable_` adds a short section showing
what the client turned down, with their own reason beside it — which is a
courtesy to them and, if anybody ever asks, the evidence that it was offered
and refused rather than never raised.

**Ctrl+S** to save.

---

## Step 6 — The second edit

Click **`Code.gs`**. **Ctrl+F** for:

```
function ffSendApprovalEmail_
```

Scroll down inside it to this block:

```js
  var clientEmail = rrbClientEmail_(d);
  if (agreed && clientEmail) {
    MailApp.sendEmail({
      to: clientEmail,
      cc: RRB_ALWAYS_CC,
```

Replace those five lines with these seven:

```js
  var clientEmail = rrbClientEmail_(d);
  var rcp = rrbApprovalRecipients_(d);
  if (agreed && clientEmail) {
    MailApp.sendEmail({
      to: rcp.to,
      cc: rcp.cc,
      bcc: rcp.bcc,
```

Leave everything below it — `subject:`, `htmlBody:`, `name:` — exactly as it is.

**Ctrl+S**.

---

## Step 7 — Send yourself the new letter

Before a single client sees this.

1. Function dropdown → **`rrbPreviewAllEmails`**.
2. **▶ Run**.

Four emails arrive in your own inbox, marked `[PREVIEW]`. The fourth is
**`4 of 4 — CLIENT: approved`**.

Open it on your phone, the way a client would.

Check:

- the cover figure matches what that client actually took
- the premium matches
- anything they turned down appears under **"What you decided to leave for now"**
- the reason against each plan still reads properly

If any of that looks wrong, **stop here and tell me what you see.** Nothing has
gone to a client yet — the previews only go to you.

---

## Step 8 — Make it live

Everything so far has been saved but not published. Client emails are sent when
the fact find posts to the script, and that uses the *deployed* version, not
the version in the editor.

1. Top right: **Deploy ▸ Manage deployments**.
2. On the existing deployment, click the **pencil** (Edit).
3. **Version**: change from the number shown to **New version**.
4. **Deploy**.

> **The URL must not change.** You are editing the deployment that already
> exists, not creating a new one. If you ever see a *different* `/exec` address
> afterwards, stop — the form, the dashboard and the wall all point at the old
> one and would all go dead.

---

## Step 9 — Check it took

Function dropdown → **`rrbLetterCheck`** → **▶ Run**, one more time.

The output is the same as step 3 — it is showing you the same comparison. What
matters is that it still runs cleanly and the numbers under **NOW** are the ones
you want going out.

Then the next case a manager approves will carry the corrected letter.

---

## If something goes wrong

**A red error when you run something.** Copy the whole message out of the
execution log and send it to me. Do not guess at a fix.

**"rrbTookTable_ is not defined".** The new file did not save, or it saved
under a different name. Check the file list on the left for
`RRBranchClientLetter.gs` and press Ctrl+S in it.

**The preview email looks broken or half-empty.** Most likely 5b went in wrong
— the block replacement has to keep the braces matched. Send me a screenshot of
what you have between `if (rt.count) {` and `h += rrbLeftTable_(d);`.

**You want out of the whole thing.** Deploy ▸ Manage deployments ▸ pencil ▸
Version ▸ pick the version number from *before* today ▸ Deploy. That puts the
live behaviour back within a minute. Your backup copy is the belt to that
braces.

---

## What this does not fix

Three things I found reading the script, written up in
`RRBranchThreeFixes.md`. None is urgent the way the letter is, and none should
be attempted in the same sitting:

- **`getFFInsights`** compares `code === code`, which is always true, so every
  advisor's insight panel shows branch-wide numbers
- **two 5pm digests** are both installed and both fire
- **`prospectToken`** is still missing from the schema, so the prospecting
  funnel stops at *booked*

Do the letter first. Come back for those when it is done and quiet.
