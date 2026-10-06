/**
 * ClientEmails.gs: send a case to the client again from the dashboard, and
 * flag a client address that bounces.
 *
 * WHY (6 October 2026)
 *   On 5 October two fact finds went in and their client emails never left.
 *   The account had used Google's daily email allowance, the send failed
 *   quietly, and the case looked like any other. A client cannot say Yes to a
 *   draft they never received, so the case waits, and nothing on the
 *   dashboard said so or offered a way to send it again.
 *   An address that does not exist fails another way: the email leaves, and a
 *   "Delivery Status Notification (Failure)" comes back to this account's
 *   inbox, where nobody reads it.
 *
 * WHAT IT ADDS
 *   1. Send to client again. The dashboard's queue card posts
 *      {stage: 'client_resend', token, id}. For a manager whose units cover
 *      the case it sends, on a case not yet decided, the draft summary again
 *      with a fresh confirm link (the advice copy, for Specific Need Only); on
 *      an approved case, the approval letter. Nothing goes on a case that was
 *      sent back (the corrected draft follows when it is resubmitted), declined
 *      or cancelled, or to an address that has bounced. The day's email
 *      allowance is checked first, and a refusal says so.
 *      It does not ride on queue_decide: rrbVerdict_ reads any word it does
 *      not know as a send-back. A server without this file answers the post
 *      with "Agent code required" and does nothing else, which the dashboard
 *      reads as "not installed".
 *   2. Bounces. rrbCeScanBounces, every hour, reads the bounce notices in this
 *      account's inbox and matches each address that failed to the client
 *      email on the fact finds. On every case carrying it, it records when and
 *      which address (Client Email Bounced At / Client Email Bounced Address),
 *      clears the draft-sent mark on an undecided case so a corrected address
 *      gets the draft, and emails the advisor, copying their manager, with a
 *      link to put the right address in. The dashboard flags the case until
 *      the address on it changes.
 *
 * INSTALL (RR Branch FF System)
 *   1. + > Script, name it ClientEmails, paste this in, save. It must be the
 *      last file in the list; a new file goes last.
 *   2. Run rrbCeSetup once. Google asks for permission to read this account's
 *      Gmail: that is the bounce notices. It installs the hourly check and
 *      runs it once.
 *   3. Deploy > Manage deployments > the deployment ending ...JsrAxxJ3dsQ >
 *      pencil > Version: New version > Deploy.
 *   4. Run rrbCeCheck. It says what is wired and how many emails the account
 *      can still send today. Nothing is sent.
 */

var RRB_CE_BOUNCE_COLS = ['Client Email Bounced At', 'Client Email Bounced Address'];
var RRB_CE_LABEL = 'rrb-bounce-seen';   // no spaces: Gmail search reads label:a-b, not quoted names
var RRB_CE_NEEDS = 4;    // recipients one client email can take: client, manager, advisor, branch manager
// The fields rrbClientEmail_ reads, in its order.
var RRB_CE_EMAIL_KEYS = ['email', 'clientEmail', 'adviceClientEmail', 'clientEmailAddress'];

/* ── 1. Send to client again ─────────────────────────────────────────────── */

var RRB_CE_PREV_SUBMIT_ = (typeof ffProcessAgentSubmit === 'function') ? ffProcessAgentSubmit : null;
ffProcessAgentSubmit = function (data) {
  if (data && data.stage === 'client_resend') {
    var out;
    try { out = rrbCeResend_(data); }
    catch (err) {
      Logger.log('client_resend failed: %s', (err && err.stack) || err);
      out = { ok: false, error: 'Nothing was sent: ' + ((err && err.message) || err) };
    }
    return _ffJson(out);
  }
  if (!RRB_CE_PREV_SUBMIT_) {
    return _ffJson({ ok: false, error: 'Server set-up: ClientEmails must be the last file in the project.' });
  }
  return RRB_CE_PREV_SUBMIT_(data);
};

function rrbCeResend_(data) {
  var me = rrbAuthorize_({ parameter: { token: _str(data.token) } });
  if (!me) return RRB_EXPIRED;
  var kind = (me.scope && me.scope.kind) || 'agent';
  if (kind === 'agent' || kind === 'staff') {
    return { ok: false, error: 'Only a manager can send a case to the client again.' };
  }
  var id = _str(data.id);
  if (!id) return { ok: false, error: 'No case id given.' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) {
    return { ok: false, error: 'The sheet is busy. Try again in a moment.' };
  }
  try {
    var sheet = ffGetOrCreateRevisedTab_();
    var headers = ffEnsureHeaders_(sheet);
    var row = ffFindRowBySubmissionId_(sheet, headers, id);
    if (!row || row < 0) return { ok: false, error: 'That fact find is not on the sheet.' };
    var d = ffReadRow_(sheet, headers, row);
    if (!rrbScopeHasUnit_(me.scope, ffLookupDirectManager_(_str(d.agentCode).toUpperCase()))) {
      return { ok: false, error: 'That case is not in your unit.' };
    }

    var st = _str(d.status).toLowerCase();
    if (/declin|cancel/.test(st)) {
      return { ok: false, error: 'This case is closed, so nothing goes to the client.' };
    }
    if (st.indexOf('chang') > -1) {
      return { ok: false, error: 'This case is back with the advisor to fix. The client gets the ' +
                                 'corrected draft when it is resubmitted.' };
    }
    var to = rrbClientEmail_(d);
    if (!to) {
      return { ok: false, noEmail: true, error: 'There is no email address for the client on this ' +
                                                'fact find. The advisor has to add one.' };
    }
    if (rrbCeBouncedAddress_(d)) {
      return { ok: false, bounced: true, error: to + ' bounced, so sending again would bounce again. ' +
                                                'The advisor has been asked to check it with the client.' };
    }
    var left = MailApp.getRemainingDailyQuota();
    if (left < RRB_CE_NEEDS) {
      return { ok: false, quota: true, left: left,
               error: 'Google’s email allowance for this account is used up for today (' + left +
                      ' left), so nothing was sent. Try again tomorrow morning.' };
    }

    var sent;
    if (st.indexOf('approv') > -1) {
      // The client half of ffSendApprovalEmail_ only. The advisor already has
      // their "Approved" email and needs no second one.
      rrbClientMail_(d, 'Your plan has been reviewed and approved', rrbClientApprovedHtml_(d));
      rrbExtraCols_(sheet, headers, RRB_APPROVAL_COLS);
      var cur = ffReadRow_(sheet, headers, row);
      cur['Approval Mailed At'] = new Date().toISOString();
      cur['Approval Mailed Verdict'] = rrbVerdictOf_(cur.mgrAgree, cur.status);
      ffWriteRow_(sheet, headers, cur, row);
      sent = 'approval';
    } else {
      // rrbSendClientDraftNow_ is the one function that sends the draft, and it
      // will not send a round twice. Clear the mark so it sends; it stamps the
      // case again once the email has gone. If the send fails the mark stays
      // clear, which is the truth.
      var merged = {};
      Object.keys(d).forEach(function (k) { merged[k] = d[k]; });
      merged.clientDraftSentAt = '';
      ffWriteRow_(sheet, headers, merged, row);
      rrbSendClientDraftNow_(merged);
      sent = rrbIsAdviceOnly_(d) ? 'advice' : 'draft';
    }
    Logger.log('Sent to the client again: %s (%s), by %s', id, sent, _str(me.name));
    return { ok: true, id: id, sent: sent, to: rrbMaskEmail_(to), at: new Date().toISOString() };
  } finally { try { lock.releaseLock(); } catch (e2) {} }
}

// The address that bounced, if it is still the one on the case.
function rrbCeBouncedAddress_(d) {
  var b = _str(d['Client Email Bounced Address']).toLowerCase();
  return (b && b === _str(rrbClientEmail_(d)).toLowerCase()) ? b : '';
}

/* ── 2. Bounces ──────────────────────────────────────────────────────────── */

function rrbCeScanBounces() {
  var out = { notices: 0, addresses: [], cases: 0, told: 0 };
  var label = GmailApp.getUserLabelByName(RRB_CE_LABEL) || GmailApp.createLabel(RRB_CE_LABEL);
  var threads = GmailApp.search('from:mailer-daemon newer_than:14d -label:' + RRB_CE_LABEL, 0, 40);
  if (!threads.length) { Logger.log('Bounce check: no new notices.'); return out; }

  var failed = {};   // address -> the latest notice for it
  threads.forEach(function (th) {
    th.getMessages().forEach(function (m) {
      if (!/mailer-daemon|postmaster/i.test(m.getFrom())) return;
      out.notices++;
      rrbCeFailedAddresses_(m).forEach(function (a) {
        var when = m.getDate();
        if (!failed[a] || failed[a] < when) failed[a] = when;
      });
    });
  });
  out.addresses = Object.keys(failed);
  if (out.addresses.length) rrbCeFlag_(failed, out);

  // Only once the cases are written: a run that failed part-way reads the
  // same notices again next hour.
  threads.forEach(function (th) { th.addLabel(label); });
  Logger.log('Bounce check: %s notice(s), %s address(es), %s case(s) flagged, %s advisor(s) told.',
             out.notices, out.addresses.length, out.cases, out.told);
  return out;
}

function rrbCeFailedAddresses_(m) {
  var found = {};
  try {
    _str(m.getHeader('X-Failed-Recipients')).split(/[,\s]+/).forEach(function (a) {
      a = rrbCeAddr_(a); if (a) found[a] = 1;
    });
  } catch (e) {}
  if (!Object.keys(found).length) {
    // Gmail's own wording: "Your message wasn't delivered to x@y because ..."
    // Greedy to the next space; rrbCeAddr_ trims the full stop of a sentence.
    var body = m.getPlainBody() || '', re = /delivered to\s*<?([^\s<>"']+@[^\s<>"']+)/gi, x;
    while ((x = re.exec(body))) { var a = rrbCeAddr_(x[1]); if (a) found[a] = 1; }
  }
  return Object.keys(found);
}

function rrbCeAddr_(s) {
  s = _str(s).toLowerCase().replace(/^mailto:/, '').replace(/^</, '').replace(/[>.,;:]+$/, '');
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
}

function rrbCeFlag_(failed, out) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = ffGetOrCreateRevisedTab_();
    var headers = ffEnsureHeaders_(sheet);
    rrbExtraCols_(sheet, headers, RRB_CE_BOUNCE_COLS);
    var last = sheet.getLastRow();
    if (last < 2) return out;

    // One read for the whole sheet to find the cases; a row is read in full
    // only when its address is one that failed.
    var maps = _ffSchemaMaps(), at = {};
    headers.forEach(function (h, i) { at[maps.l2k[h] || h] = i; });
    var vals = sheet.getRange(2, 1, last - 1, headers.length).getValues();
    var canMail = MailApp.getRemainingDailyQuota() >= 3;

    for (var r = 0; r < vals.length; r++) {
      var addr = '';
      for (var k = 0; k < RRB_CE_EMAIL_KEYS.length && !addr; k++) {
        var i = at[RRB_CE_EMAIL_KEYS[k]];
        var s = (i === undefined) ? '' : _str(vals[r][i]);
        if (s.indexOf('@') > 0) addr = s.toLowerCase();
      }
      if (!addr || !failed[addr]) continue;

      var rowNum = r + 2, when = failed[addr];
      var d = ffReadRow_(sheet, headers, rowNum);
      var prev = _str(d['Client Email Bounced At']);
      if (_str(d['Client Email Bounced Address']).toLowerCase() === addr && prev &&
          new Date(prev).getTime() >= when.getTime()) continue;           // already recorded

      var merged = {};
      Object.keys(d).forEach(function (k2) { merged[k2] = d[k2]; });
      merged['Client Email Bounced At'] = when.toISOString();
      merged['Client Email Bounced Address'] = addr;
      var st = _str(d.status).toLowerCase();
      // Undelivered is unsent: a corrected address gets the draft. Not on an
      // approved case, where the fix page's draft would be the wrong letter;
      // the manager sends the approval again from the dashboard instead.
      if (!/approv|declin|cancel/.test(st)) merged.clientDraftSentAt = '';
      ffWriteRow_(sheet, headers, merged, rowNum);
      out.cases++;

      if (/declin|cancel/.test(st)) continue;                            // closed: nobody to chase
      if (!canMail) { Logger.log('No email allowance left: advisor not told about %s.', d.submissionId); continue; }
      try { if (rrbCeTellAdvisor_(merged, addr)) out.told++; }
      catch (err) { Logger.log('Bounce notice for %s failed: %s', d.submissionId, err && err.message); }
    }
  } finally { try { lock.releaseLock(); } catch (e) {} }
  return out;
}

function rrbCeTellAdvisor_(d, addr) {
  var to = _str(d.agentEmail);
  if (!to) return false;
  var client = _str(d.clientName) || _str(d.fullName) || _str(d.adviceClientName) || 'your client';
  var approved = /approv/i.test(_str(d.status));
  var link = '';
  try {
    link = rrbAppUrl_() + '?action=cemail&t=' + encodeURIComponent(
      rrbMintToken(d.submissionId, 'agent', { name: _str(d.advisorName), email: to }));
  } catch (err) {}

  var h = rrbHead_('Email bounced: ' + rrbEsc_(client), 'The address on the fact find does not work');
  h += '<p style="margin:0 0 14px">Hi ' + rrbEsc_(_str(d.advisorName).split(' ')[0] || 'there') + ',</p>';
  h += '<p style="margin:0 0 14px;font-size:14px;color:#334155;line-height:1.65">The email to <strong>' +
       rrbEsc_(client) + '</strong> at <strong>' + rrbEsc_(addr) + '</strong> came back undelivered. ' +
       (approved ? 'They have not received their approved plan.'
                 : 'They have not received their draft, so they cannot confirm it, and the case cannot ' +
                   'be approved until they do.') + '</p>';
  h += '<p style="margin:0 0 14px;font-size:14px;color:#334155;line-height:1.65"><strong>Call ' +
       rrbEsc_(client.split(' ')[0]) + ' and check the address</strong>, then put the right one in.</p>';
  if (link) {
    h += '<div style="margin:4px 0 16px"><a href="' + link + '" style="display:inline-block;background:#0D9488;' +
         'color:#fff;border-radius:9px;padding:11px 18px;text-decoration:none;font-weight:800;font-size:14px">' +
         'Put in the right email</a></div>';
  }
  h += '<p style="margin:0;font-size:13px;color:#64748B">' +
       (approved ? 'Once it is right, ask your manager to send the approved plan again from the dashboard.'
                 : 'Their draft goes to the new address the moment you save it.') + '</p>';

  var dmKey = _str(d.directManagerKey) || _str(d.reviewerKey) ||
              ffLookupDirectManager_(_str(d.agentCode).toUpperCase());
  var cc = _str((MAIL_CONFIG.managers[dmKey] || {}).email);
  if (cc.toLowerCase() === to.toLowerCase()) cc = '';
  rrbMail_(to, 'Email bounced — ' + client + ': check the address', h + rrbFoot_(_str(d.submissionId)),
           cc, _str(MAIL_CONFIG.branchManager));
  return true;
}

/* ── Set-up and check ────────────────────────────────────────────────────── */

function rrbCeSetup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'rrbCeScanBounces') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('rrbCeScanBounces').timeBased().everyHours(1).create();
  Logger.log('ON   the bounce check, every hour (rrbCeScanBounces)');
  rrbCeScanBounces();
  rrbCeCheck();
}

function rrbCeCheck() {
  function say(ok, s) { Logger.log((ok ? 'YES  ' : 'NO   ') + s); }
  say(String(ffProcessAgentSubmit).indexOf('rrbCeResend_') > -1,
      'the dashboard’s "Send to client again" is wired (ClientEmails is the last file)');
  say(!!RRB_CE_PREV_SUBMIT_, 'submissions still go through the original ffProcessAgentSubmit');
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'rrbCeScanBounces') n++; });
  say(n === 1, 'the hourly bounce check is on' + (n > 1 ? ' (' + n + ' copies: run rrbCeSetup again)' : ''));
  try { GmailApp.getUserLabelByName(RRB_CE_LABEL); say(true, 'this project can read the bounce notices'); }
  catch (e) { say(false, 'this project cannot read Gmail yet: run rrbCeSetup and allow it'); }
  Logger.log('Emails this account can still send today: ' + MailApp.getRemainingDailyQuota());
  Logger.log('The dashboard reaches this only after Deploy > Manage deployments > ...JsrAxxJ3dsQ > ' +
             'New version.');
}
