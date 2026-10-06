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
 *      which address (Client Email Bounced At / Client Email Bounced Address)
 *      and, on a case still with a manager, clears the draft-sent mark so a
 *      corrected address gets the draft. The dashboard flags the case until
 *      the address on it changes.
 *   3. One morning list (rrbCeMorningTask, about 7:50). The bounced clients go
 *      to support as a single task, not to each advisor as it happens, so one
 *      person calls each client once. Asked for on 6 October: "group on
 *      mornings ... send to the support staff making contact with these
 *      clients ... confirming the emails and reporting back to management as
 *      one entire task". For each client: the phone number, the address that
 *      failed, the advisor, the tries so far, and two buttons. Record the right
 *      email opens the existing fix page (action=cemail): the address is
 *      saved and the draft goes to it, or, on an approved case, the approval
 *      letter. Could not reach (action=cbounce) records a try and a note on a
 *      page with a button, so the mail scanner opening the link records
 *      nothing. Management is copied, and the same email reports back: who was
 *      fixed since the last list, by whom, and what went out. Nothing open and
 *      nothing fixed sends nothing.
 *      Advisors are not emailed one by one (RRB_CE_TELL_ADVISOR); they see the
 *      flag on the dashboard.

 * INSTALL (RR Branch FF System)
 *   1. + > Script, name it ClientEmails, paste this in, save. It must be the
 *      last file in the list; a new file goes last.
 *   2. Run rrbCeSetup once. Google asks for permission to read this account's
 *      Gmail: that is the bounce notices. It installs the hourly check and the
 *      morning list, and runs the check once. Run it again after any change to
 *      RRB_CE_TASK_AT.
 *   3. Deploy > Manage deployments > the deployment ending ...JsrAxxJ3dsQ >
 *      pencil > Version: New version > Deploy.
 *   4. Run rrbCeCheck. It says what is wired and how many emails the account
 *      can still send today. Nothing is sent.
 */

// Who the morning list goes to. Blank: MAIL_CONFIG.support, the branch sales
// support mailbox. Management is copied: the branch manager, and the unit
// manager of every advisor on the list.
var RRB_CE_TASK_TO = '';
var RRB_CE_TASK_AT = { hour: 7, minute: 50 };     // America/Port_of_Spain
// Each bounce emailed to its advisor as it happens. Off: the morning list is
// the one task, and two people calling the same client is what it replaces.
var RRB_CE_TELL_ADVISOR = false;

var RRB_CE_BOUNCE_COLS = ['Client Email Bounced At', 'Client Email Bounced Address'];
var RRB_CE_TRACK_COLS = ['Client Email Fixed At', 'Client Email Fixed By', 'Client Email Fixed From',
                         'Client Email Fixed Sent', 'Bounce Contact Attempts', 'Bounce Last Attempt At', 'Bounce Last Attempt By',
                         'Bounce Last Attempt Note'];
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
      // approved case (the fix sends the approval letter instead, see
      // rrbClientEmailFix below), nor on one sent back, whose corrected draft
      // goes when the advisor resubmits.
      if (!/approv|declin|cancel|chang/.test(st)) merged.clientDraftSentAt = '';
      ffWriteRow_(sheet, headers, merged, rowNum);
      out.cases++;

      if (/declin|cancel/.test(st) || !RRB_CE_TELL_ADVISOR) continue;   // closed, or left to the morning list
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

/* ── 3. The morning list ─────────────────────────────────────────────────── */

// The fix page (action=cemail) saves the address and sends the draft. Around
// it: who fixed it and when, for the list's report back; and, on an approved
// case, the approval letter, which the draft-only page never sends.
var RRB_CE_PREV_EMAIL_FIX_ = (typeof rrbClientEmailFix === 'function') ? rrbClientEmailFix : null;
if (RRB_CE_PREV_EMAIL_FIX_) rrbClientEmailFix = function (e) {
  var p = (e && e.parameter) || {};
  var email = _str(p.email).toLowerCase();
  var pay = null, before = null;
  // The same test the page makes before it saves; read the token now, before
  // the page spends it.
  if (email && email.indexOf('@') > 0 && !/\s/.test(email)) {
    try {
      var chk = rrbVerifyToken(p.t);
      if (chk.ok) { pay = chk.payload; before = rrbReadCase_(_str(pay.id)); }
    } catch (err) {}
  }
  var page = RRB_CE_PREV_EMAIL_FIX_(e);
  if (pay && before) {
    try { rrbCeAfterFix_(_str(pay.id), before, email, _str(pay.nm) || _str(pay.em)); }
    catch (err2) { Logger.log('After the email fix on %s: %s', _str(pay.id), err2 && err2.message); }
  }
  return page;
};

function rrbCeAfterFix_(id, before, email, by) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = ffGetOrCreateRevisedTab_();
    var headers = ffEnsureHeaders_(sheet);
    var row = ffFindRowBySubmissionId_(sheet, headers, id);
    if (!row || row < 0) return;
    var d = ffReadRow_(sheet, headers, row);
    if (_str(rrbClientEmail_(d)).toLowerCase() !== email) return;        // the page did not save it
    var was = _str(rrbClientEmail_(before)).toLowerCase();
    if (was === email) return;                                            // nothing changed

    rrbExtraCols_(sheet, headers, RRB_CE_TRACK_COLS);
    var m = {};
    Object.keys(d).forEach(function (k) { m[k] = d[k]; });
    m['Client Email Fixed At'] = new Date().toISOString();
    m['Client Email Fixed By'] = by || 'the fix link';
    m['Client Email Fixed From'] = was;
    var sent = 'nothing';
    var draftAt = rrbCeDate_(d.clientDraftSentAt);
    if (/approv/i.test(_str(d.status))) {
      if (MailApp.getRemainingDailyQuota() >= RRB_CE_NEEDS) {
        rrbClientMail_(m, 'Your plan has been reviewed and approved', rrbClientApprovedHtml_(m));
        rrbExtraCols_(sheet, headers, RRB_APPROVAL_COLS);
        m['Approval Mailed At'] = new Date().toISOString();
        m['Approval Mailed Verdict'] = rrbVerdictOf_(m.mgrAgree, m.status);
        sent = 'approval';
      }
    } else if (draftAt && Date.now() - draftAt.getTime() < 10 * 60000) {
      sent = rrbIsAdviceOnly_(d) ? 'advice' : 'draft';                   // the page sent it just now
    }
    m['Client Email Fixed Sent'] = sent;
    ffWriteRow_(sheet, headers, m, row);
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

// "Could not reach": a page with a button. Guardian's mail scanner opens every
// link in an email but presses nothing (SafeButtons.gs, 4 October), so the
// link alone records nothing.
var RRB_CE_PREV_DOGET_ = (typeof doGet === 'function') ? doGet : null;
if (RRB_CE_PREV_DOGET_) doGet = function (e) {
  var a = (e && e.parameter && e.parameter.action) || '';
  if (a === 'cbounce') {
    try { return rrbCeNotReached_(e); }
    catch (err) {
      Logger.log('cbounce failed: %s', (err && err.stack) || err);
      return rrbPage_('Not recorded', '<p style="color:#475569;margin:0">That did not go through, and ' +
                      'nothing was recorded. Press the button again.</p>', 'err');
    }
  }
  return RRB_CE_PREV_DOGET_(e);
};

function rrbCeNotReached_(e) {
  var p = (e && e.parameter) || {};
  var chk = rrbVerifyToken(p.t);
  if (!chk.ok) {
    return rrbPage_('Link expired', '<p style="color:#475569;margin:0">This link has expired. Use the one ' +
                    'in this morning’s list.</p>', 'err');
  }
  var id = _str(chk.payload.id);
  var sheet = ffGetOrCreateRevisedTab_();
  var headers = ffEnsureHeaders_(sheet);
  var row = ffFindRowBySubmissionId_(sheet, headers, id);
  if (!row || row < 0) return rrbPage_('Not found', '<p>That case is no longer on the sheet.</p>', 'err');
  var d = ffReadRow_(sheet, headers, row);
  var client = rrbCeClient_(d);
  var tries = parseInt(_str(d['Bounce Contact Attempts']), 10) || 0;

  if (_str(p.c) !== '1') {
    return rrbPage_('Could not reach ' + client,
      '<div style="font-size:19px;font-weight:800;margin-bottom:6px">Could not reach ' + rrbEsc_(client) + '?</div>' +
      '<p style="color:#475569;margin:0 0 14px;font-size:14px">' +
        (tries ? 'Tried ' + tries + ' time' + (tries === 1 ? '' : 's') + ' so far. ' : '') +
        'This records the try. They stay on tomorrow’s list, and management sees it there.</p>' +
      '<form action="' + rrbAppUrl_() + '" method="get" style="margin:0">' +
        '<input type="hidden" name="action" value="cbounce">' +
        '<input type="hidden" name="t" value="' + rrbEsc_(_str(p.t)) + '">' +
        '<input type="hidden" name="c" value="1">' +
        '<textarea name="note" rows="3" maxlength="300" placeholder="What happened? No answer, number not in service..." ' +
          'style="width:100%;box-sizing:border-box;border:1px solid #CBD5E1;border-radius:9px;padding:11px;font:15px inherit"></textarea>' +
        '<button type="submit" style="width:100%;margin-top:10px;background:#B45309;color:#fff;border:0;border-radius:9px;' +
          'padding:13px;font-size:15px;font-weight:800;cursor:pointer">Record it</button>' +
      '</form>', 'bad');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    d = ffReadRow_(sheet, headers, row);                    // again, under the lock
    rrbExtraCols_(sheet, headers, RRB_CE_TRACK_COLS);
    var m = {};
    Object.keys(d).forEach(function (k) { m[k] = d[k]; });
    tries = (parseInt(_str(d['Bounce Contact Attempts']), 10) || 0) + 1;
    m['Bounce Contact Attempts'] = tries;
    m['Bounce Last Attempt At'] = new Date().toISOString();
    m['Bounce Last Attempt By'] = _str(chk.payload.nm) || _str(chk.payload.em) || 'support';
    m['Bounce Last Attempt Note'] = _str(p.note).slice(0, 300);
    ffWriteRow_(sheet, headers, m, row);
  } finally { try { lock.releaseLock(); } catch (e2) {} }
  return rrbPage_('Recorded',
    '<div style="font-size:20px;font-weight:800;margin-bottom:6px">Recorded</div>' +
    '<p style="color:#475569;margin:0;font-size:14.5px">' + rrbEsc_(client) + ': ' + tries + ' tr' +
    (tries === 1 ? 'y' : 'ies') + ' so far. They stay on tomorrow’s list.</p>', 'ok');
}

// Every case with a bounce on record. Open: the address that bounced is still
// the one on the case, and the case is not closed.
function rrbCeBounceCases_() {
  var sheet = ffGetOrCreateRevisedTab_();
  var headers = ffEnsureHeaders_(sheet);
  var last = sheet.getLastRow();
  if (last < 2 || headers.indexOf('Client Email Bounced Address') < 0) return [];
  var maps = _ffSchemaMaps();
  var keys = headers.map(function (h) { return maps.l2k[h] || h; });
  var out = [];
  sheet.getRange(2, 1, last - 1, headers.length).getValues().forEach(function (v) {
    var d = {};
    keys.forEach(function (k, i) { if (v[i] !== '' && v[i] !== null) d[k] = v[i]; });
    var b = _str(d['Client Email Bounced Address']).toLowerCase();
    if (!b || !_str(d.submissionId)) return;
    var cur = _str(rrbClientEmail_(d)).toLowerCase();
    out.push({ d: d, bounced: b, current: cur,
               open: b === cur && !/declin|cancel/i.test(_str(d.status)) });
  });
  return out;
}

function rrbCeMorningTask() { return rrbCeMorning_(false); }
// The same list, to the branch manager only, marked PREVIEW. Support gets
// nothing and the next real list still reports from the same point.
function rrbCeMorningPreview() { return rrbCeMorning_(true); }

function rrbCeMorning_(preview) {
  try { rrbCeScanBounces(); }
  catch (err) { Logger.log('The bounce check before the list failed: %s', err && err.message); }
  var props = PropertiesService.getScriptProperties();
  var since = Number(props.getProperty('rrb_ce_task_last') || 0) || (Date.now() - 86400000);
  var now = new Date();
  var cases = rrbCeBounceCases_();
  var open = cases.filter(function (c) { return c.open; });
  var done = cases.filter(function (c) {
    var f = rrbCeDate_(c.d['Client Email Fixed At']);
    return !c.open && f && f.getTime() > since;
  });
  if (!open.length && !done.length) {
    Logger.log('Morning list: nothing bounced and open, nothing fixed. Nothing sent.');
    if (!preview) props.setProperty('rrb_ce_task_last', String(now.getTime()));
    return { open: 0, done: 0, sent: false };
  }

  var taskTo = _str(RRB_CE_TASK_TO) || _str(MAIL_CONFIG.support);
  var to = preview ? _str(MAIL_CONFIG.branchManager) : taskTo;
  var cc = preview ? [] : rrbCeManagement_(open.concat(done), to);
  if (MailApp.getRemainingDailyQuota() < 1 + cc.length) {
    Logger.log('No email allowance for the morning list. It goes on the next run.');
    return { open: open.length, done: done.length, sent: false };
  }
  var subject = (preview ? 'PREVIEW — ' : '') + (open.length
    ? 'Bounced client emails: ' + open.length + ' to call today'
    : 'Bounced client emails: ' + done.length + ' fixed, none left');
  var html = rrbCeTaskHtml_(open, done, now, taskTo);
  if (preview) {
    html = '<div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:10px;padding:12px 14px;' +
           'margin:0 0 14px;font:13.5px/1.5 Arial,sans-serif;color:#92400E"><strong>PREVIEW.</strong> Only you have ' +
           'this. The real list goes to ' + rrbEsc_(taskTo) + ', copying management, at about ' +
           RRB_CE_TASK_AT.hour + ':' + ('0' + RRB_CE_TASK_AT.minute).slice(-2) + ' each morning. Its buttons work.</div>' + html;
  }
  rrbMail_(to, subject, html, cc.join(','));
  if (!preview) props.setProperty('rrb_ce_task_last', String(now.getTime()));
  Logger.log('Morning list %sto %s%s: %s to call, %s fixed since the last list.', preview ? '(PREVIEW) ' : '',
             to, cc.length ? ' (copying ' + cc.join(', ') + ')' : '', open.length, done.length);
  return { open: open.length, done: done.length, sent: true };
}

// Management: the branch manager, and the unit manager of every advisor named.
function rrbCeManagement_(list, to) {
  var seen = {}, out = [];
  function add(a) {
    a = _str(a);
    var k = a.toLowerCase();
    if (!a || k === _str(to).toLowerCase() || seen[k]) return;
    seen[k] = 1; out.push(a);
  }
  add(MAIL_CONFIG.branchManager);
  list.forEach(function (c) {
    var key = _str(c.d.directManagerKey) || _str(c.d.reviewerKey) ||
              ffLookupDirectManager_(_str(c.d.agentCode).toUpperCase());
    add((MAIL_CONFIG.managers[key] || {}).email);
  });
  return out;
}

function rrbCeTaskHtml_(open, done, now, taskTo) {
  var tz = 'America/Port_of_Spain';
  var day = function (dt) { return dt ? Utilities.formatDate(dt, tz, 'd MMM') : ''; };
  var h = rrbHead_(open.length
      ? open.length + ' client' + (open.length === 1 ? '' : 's') + ' to call about their email'
      : 'Bounced emails: all done',
    Utilities.formatDate(now, tz, 'EEEE d MMMM'));

  if (open.length) {
    h += '<p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.65">These emails came back ' +
         'undelivered, so the clients have not received their documents. <strong>Call each one, confirm ' +
         'their email address, and record it with the button.</strong> Their documents go to the new address ' +
         'straight away, and this list reports back to management every morning.</p>';
    open.slice().sort(function (a, b) {
      return (rrbCeDate_(a.d['Client Email Bounced At']) || now) - (rrbCeDate_(b.d['Client Email Bounced At']) || now);
    }).forEach(function (c) { h += rrbCeTaskCard_(c, now, taskTo, day); });
  }

  if (done.length) {
    h += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94A3B8;font-weight:700;' +
         'margin:20px 0 8px">Done since the last list</div>';
    done.forEach(function (c) {
      var d = c.d, what = _str(d['Client Email Fixed Sent']);
      h += '<div style="border-left:3px solid #0D9488;padding:6px 0 6px 12px;margin-bottom:8px;font-size:13.5px;color:#334155">' +
           '<strong>' + rrbEsc_(rrbCeClient_(d)) + '</strong> &middot; ' + rrbEsc_(c.current) +
           '<div style="font-size:12.5px;color:#64748B">Fixed ' + day(rrbCeDate_(d['Client Email Fixed At'])) +
           (_str(d['Client Email Fixed By']) ? ' by ' + rrbEsc_(_str(d['Client Email Fixed By'])) : '') + ' &middot; ' +
           (what === 'approval' ? 'approval letter sent to the new address'
            : what === 'draft' ? 'draft sent to the new address'
            : what === 'advice' ? 'their copy sent to the new address'
            : /approv/i.test(_str(d.status)) ? 'approval letter not sent yet: use Resend letter on the dashboard'
            : 'nothing sent yet') +
           '</div></div>';
    });
  }

  var tried = open.filter(function (c) { return (parseInt(_str(c.d['Bounce Contact Attempts']), 10) || 0) > 0; }).length;
  h += '<p style="margin:18px 0 0;font-size:12.5px;color:#64748B">' + open.length + ' to call' +
       (tried ? ' (' + tried + ' already tried)' : '') + ' &middot; ' + done.length + ' fixed since the last list. ' +
       'Management is copied on this email every morning.</p>';
  return h + rrbFoot_('');
}

function rrbCeTaskCard_(c, now, taskTo, day) {
  var d = c.d, id = _str(d.submissionId);
  var phone = _str(d.phone) || _str(d.adviceClientPhone);
  var bAt = rrbCeDate_(d['Client Email Bounced At']);
  var ago = bAt ? Math.max(0, Math.floor((now.getTime() - bAt.getTime()) / 86400000)) : null;
  var tries = parseInt(_str(d['Bounce Contact Attempts']), 10) || 0;
  var lastAt = rrbCeDate_(d['Bounce Last Attempt At']);
  var st = _str(d.status);
  var why = /approv/i.test(st) ? 'Approved: their approval letter did not arrive.'
          : /chang/i.test(st) ? 'Sent back to the advisor: confirm the address before the corrected draft goes.'
          : rrbIsAdviceOnly_(d) ? 'Specific Need Only: their copy did not arrive.'
          : 'With a manager: their draft did not arrive, so they cannot confirm it.';
  var who = { name: 'Branch support', email: taskTo };
  var fix = rrbAppUrl_() + '?action=cemail&t=' + encodeURIComponent(rrbMintToken(id, 'support', who));
  var miss = rrbAppUrl_() + '?action=cbounce&t=' + encodeURIComponent(rrbMintToken(id, 'support', who));
  var btn = function (href, label, bg) {
    return '<a href="' + href + '" style="display:inline-block;background:' + bg + ';color:#fff;border-radius:8px;' +
           'padding:9px 14px;text-decoration:none;font-weight:800;font-size:13px;margin:0 6px 6px 0">' + label + '</a>';
  };
  return '<div style="background:#fff;border:1px solid #E2E8F0;border-radius:11px;padding:13px 15px;margin-bottom:10px">' +
    '<div style="font-size:15px;font-weight:800;color:#0F172A">' + rrbEsc_(rrbCeClient_(d)) + '</div>' +
    '<div style="font-size:13.5px;margin-top:3px">' + (phone
      ? '<a href="tel:' + rrbEsc_(phone.replace(/[^\d+]/g, '')) + '" style="color:#0D9488;font-weight:700;text-decoration:none">' +
        rrbEsc_(phone) + '</a>'
      : '<span style="color:#B45309;font-weight:700">No phone number on the fact find: ask ' +
        rrbEsc_(_str(d.advisorName) || 'the advisor') + '</span>') + '</div>' +
    '<div style="font-size:12.5px;color:#64748B;margin-top:4px;line-height:1.55">' +
      '<span style="color:#B91C1C;font-weight:700">' + rrbEsc_(c.bounced) + '</span> bounced' +
      (ago === null ? '' : ago === 0 ? ' today' : ago === 1 ? ' yesterday' : ' ' + ago + ' days ago') +
      ' &middot; advisor ' + rrbEsc_(_str(d.advisorName) || '?') + '<br>' + rrbEsc_(why) +
      (tries ? '<br><strong>Tried ' + tries + ' time' + (tries === 1 ? '' : 's') + '</strong>' +
               (lastAt ? ', last ' + day(lastAt) : '') +
               (_str(d['Bounce Last Attempt Note']) ? ': &ldquo;' + rrbEsc_(_str(d['Bounce Last Attempt Note'])) + '&rdquo;' : '')
             : '') +
    '</div>' +
    '<div style="margin-top:10px">' + btn(fix, 'Record the right email', '#0D9488') + btn(miss, 'Could not reach', '#B45309') + '</div>' +
  '</div>';
}

function rrbCeClient_(d) {
  return _str(d.clientName) || _str(d.fullName) || _str(d.adviceClientName) || 'the client';
}
function rrbCeDate_(v) {
  if (!v) return null;
  var x = (v instanceof Date) ? v : new Date(v);
  return isNaN(x.getTime()) ? null : x;
}

/* ── Set-up and check ────────────────────────────────────────────────────── */

function rrbCeSetup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'rrbCeScanBounces' || f === 'rrbCeMorningTask') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('rrbCeScanBounces').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('rrbCeMorningTask').timeBased().atHour(RRB_CE_TASK_AT.hour)
    .nearMinute(RRB_CE_TASK_AT.minute).everyDays(1).inTimezone('America/Port_of_Spain').create();
  Logger.log('ON   the bounce check, every hour (rrbCeScanBounces)');
  Logger.log('ON   the morning list, about %s:%s (rrbCeMorningTask)', RRB_CE_TASK_AT.hour,
             ('0' + RRB_CE_TASK_AT.minute).slice(-2));
  rrbCeScanBounces();
  rrbCeCheck();
}

function rrbCeCheck() {
  function say(ok, s) { Logger.log((ok ? 'YES  ' : 'NO   ') + s); }
  say(String(ffProcessAgentSubmit).indexOf('rrbCeResend_') > -1,
      'the dashboard’s "Send to client again" is wired (ClientEmails is the last file)');
  say(!!RRB_CE_PREV_SUBMIT_, 'submissions still go through the original ffProcessAgentSubmit');
  var n = 0, m = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'rrbCeScanBounces') n++;
    if (t.getHandlerFunction() === 'rrbCeMorningTask') m++;
  });
  say(n === 1, 'the hourly bounce check is on' + (n > 1 ? ' (' + n + ' copies: run rrbCeSetup again)' : ''));
  say(m === 1, 'the morning list is on, to ' + (_str(RRB_CE_TASK_TO) || _str(MAIL_CONFIG.support)) +
               ' copying management' + (m > 1 ? ' (' + m + ' copies: run rrbCeSetup again)' : ''));
  say(String(doGet).indexOf('rrbCeNotReached_') > -1, 'the list\u2019s Could not reach button is wired');
  say(String(rrbClientEmailFix).indexOf('rrbCeAfterFix_') > -1, 'a fixed address is recorded for the report back');
  try { GmailApp.getUserLabelByName(RRB_CE_LABEL); say(true, 'this project can read the bounce notices'); }
  catch (e) { say(false, 'this project cannot read Gmail yet: run rrbCeSetup and allow it'); }
  Logger.log('Emails this account can still send today: ' + MailApp.getRemainingDailyQuota());
  Logger.log('The dashboard reaches this only after Deploy > Manage deployments > ...JsrAxxJ3dsQ > ' +
             'New version.');
}
