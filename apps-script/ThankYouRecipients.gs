/**
 * ThankYouRecipients.gs — who gets the client's thank-you email.
 *
 * THE RULE
 *   To    the client
 *   Cc    the advisor who did the fact find        (visible on purpose)
 *   Bcc   that advisor's direct manager
 *   Bcc   the branch manager                       (temporary — see below)
 *
 * The advisor is visible because the client should see their own advisor is
 * on it. The manager is not, because a manager showing in Cc on a client
 * email reads as escalation, and a reply-all would put the client's answer —
 * income, health, family — in front of everyone at once.
 *
 * TY_CONFIG.ALWAYS_BCC is the branch manager's own "copy me for now" while
 * the flow is being watched. It is one line and it is meant to be deleted
 * once the copies stop being useful; nothing else depends on it.
 *
 * ── INSTALLING ────────────────────────────────────────────────────────────
 * 1. Apps Script editor ▸ + ▸ Script ▸ name it ThankYouRecipients.
 * 2. Paste this file over the empty one.
 * 3. Fill in the three blank manager addresses in TY_CONFIG.MANAGER_EMAILS.
 *    Ricky's is filled in already; the rest are blank on purpose rather than
 *    guessed, because a guessed address either bounces or reaches a stranger
 *    holding a client's summary.
 * 4. Find where the thank-you email is sent — it is the send that carries the
 *    body built in ffproject.html, opening "Thank you for taking the time to
 *    complete your Confidential Fact Find with me today" — and replace the
 *    recipient arguments with:
 *
 *      var r = tyRecipients_(row);
 *      if (!r.ok) { Logger.log(r.problems.join(' | ')); return; }
 *      MailApp.sendEmail({
 *        to: r.to, cc: r.cc, bcc: r.bcc,
 *        subject: subject, htmlBody: body, name: 'Ricky Rampersad Branch'
 *      });
 *
 *    `row` is whatever object already holds the submitted fact find — it
 *    needs email / adviceClientEmail, agentEmail and dmName on it, which the
 *    form already sends.
 * 5. Deploy ▸ Manage deployments ▸ Edit ▸ Deploy, keeping the same URL.
 *
 * ── CHECKING IT ───────────────────────────────────────────────────────────
 * Run tySelfTest_() and read the log. It sends nothing.
 */

var TY_CONFIG = {

  // The four names the fact find offers in its Direct Manager dropdown.
  // A name that is not in here, or is in here with a blank address, stops
  // the send and says so — it never silently drops the manager's copy.
  MANAGER_EMAILS: {
    'Ricky Rampersad':  'Ricky.Rampersad@myguardiangroup.com',
    'Kerwyn Ramroach':  '',   // TO CONFIRM
    'Akaash Kalladeen': '',   // TO CONFIRM
    'Gary Sookdeo':     ''    // TO CONFIRM
  },

  // Temporary. Delete the address to stop the branch manager's blind copies.
  ALWAYS_BCC: ['Ricky.Rampersad@myguardiangroup.com'],

  // The advisor who did the fact find, in Cc beside their direct manager.
  // Both of them get it; the branch manager is blind-copied and nowhere else.
  CC_ADVISOR: true
};

/* ── helpers ───────────────────────────────────────────────────────────── */

function tyClean_(v) { return String(v == null ? '' : v).trim(); }

function tyIsEmail_(v) { return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(tyClean_(v)); }

/** Case-insensitive de-duplication, first spelling wins. */
function tyDedupe_(list) {
  var seen = {}, out = [];
  (list || []).forEach(function (e) {
    var k = tyClean_(e).toLowerCase();
    if (!k || seen[k]) return;
    seen[k] = true;
    out.push(tyClean_(e));
  });
  return out;
}

/** The direct manager's address for a name off the dropdown. */
function tyManagerEmail_(dmName) {
  var want = tyClean_(dmName).toLowerCase();
  if (!want) return { ok: false, why: 'No direct manager is recorded on this fact find.' };

  var keys = Object.keys(TY_CONFIG.MANAGER_EMAILS);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === want) {
      var addr = tyClean_(TY_CONFIG.MANAGER_EMAILS[keys[i]]);
      if (!addr) {
        return { ok: false, why: 'No address on file for ' + keys[i] +
          '. Fill it into TY_CONFIG.MANAGER_EMAILS.' };
      }
      if (!tyIsEmail_(addr)) {
        return { ok: false, why: 'The address on file for ' + keys[i] +
          ' does not look like an email: ' + addr };
      }
      return { ok: true, email: addr };
    }
  }
  return { ok: false, why: tyClean_(dmName) +
    ' is not in TY_CONFIG.MANAGER_EMAILS. Add them, or correct the name on the fact find.' };
}

/* ── the recipient list ────────────────────────────────────────────────── */

/**
 * Build To / Cc / Bcc for one submitted fact find.
 *
 * Returns { ok, to, cc, bcc, problems }. `ok` is false only when the client
 * has no usable address — there is nothing to send. Anything else that is
 * wrong is reported in `problems` and the send still goes, because a client
 * waiting on their summary should not be held up by a missing internal copy.
 * Log `problems` either way; that is how a blank manager address gets noticed
 * instead of quietly never being copied.
 */
function tyRecipients_(row) {
  row = row || {};
  var problems = [];

  var client = tyClean_(row.email) || tyClean_(row.adviceClientEmail);
  if (!tyIsEmail_(client)) {
    return { ok: false, to: '', cc: '', bcc: '',
      problems: ['No client email on this fact find — nothing was sent.'] };
  }

  var cc = [];
  var mgr = tyManagerEmail_(row.dmName);
  if (mgr.ok) cc.push(mgr.email);
  else problems.push(mgr.why + ' The manager was not copied.');

  if (TY_CONFIG.CC_ADVISOR) {
    var agent = tyClean_(row.agentEmail);
    if (tyIsEmail_(agent)) cc.push(agent);
    else problems.push('No advisor email on this fact find, so the advisor was not copied.');
  }

  var bcc = [];

  TY_CONFIG.ALWAYS_BCC.forEach(function (e) { if (tyIsEmail_(e)) bcc.push(e); });

  // The direct manager can be the branch manager — Ricky runs a unit as well
  // as the branch — and would otherwise be blind-copied twice on his own
  // team's cases. Also drop anyone who is already the client or in Cc.
  bcc = tyDedupe_(bcc).filter(function (e) {
    var k = e.toLowerCase();
    return k !== client.toLowerCase() &&
           cc.map(function (c) { return c.toLowerCase(); }).indexOf(k) < 0;
  });

  return {
    ok: true,
    to: client,
    cc: tyDedupe_(cc).join(','),
    bcc: bcc.join(','),
    problems: problems
  };
}

/* ── self test ─────────────────────────────────────────────────────────── */

/** Prints the list for a range of cases. Sends nothing. */
function tySelfTest_() {
  var cases = [
    ['normal — advisor under Akaash', {
      email: 'client@example.com', agentEmail: 'neil@myguardiangroup.com',
      dmName: 'Akaash Kalladeen' }],
    ['advisor under Ricky — must not double-bcc', {
      email: 'client@example.com', agentEmail: 'neil@myguardiangroup.com',
      dmName: 'Ricky Rampersad' }],
    ['advice-only client address', {
      adviceClientEmail: 'client2@example.com', agentEmail: 'neil@myguardiangroup.com',
      dmName: 'Ricky Rampersad' }],
    ['manager name not on file', {
      email: 'client@example.com', agentEmail: 'neil@myguardiangroup.com',
      dmName: 'Someone Else' }],
    ['no advisor email', {
      email: 'client@example.com', agentEmail: '', dmName: 'Ricky Rampersad' }],
    ['no client email — must not send', {
      email: '', agentEmail: 'neil@myguardiangroup.com', dmName: 'Ricky Rampersad' }]
  ];

  cases.forEach(function (c) {
    var r = tyRecipients_(c[1]);
    Logger.log('%s\n  send: %s\n  to:   %s\n  cc:   %s\n  bcc:  %s\n  note: %s\n',
      c[0], r.ok ? 'yes' : 'NO', r.to || '—', r.cc || '—', r.bcc || '—',
      r.problems.length ? r.problems.join(' | ') : 'none');
  });
}
