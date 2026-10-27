/**
 * QuietClose.gs: a manager closes an early-stage fact find and nothing is
 * e-mailed to anyone.
 *
 * WHY (27 October 2026)
 *   Akaash Kalladeen's dashboard showed eight cases waiting more than three
 *   days. They were started early, before the process settled, and he wanted
 *   them closed with nothing going to the client or the agent. The queue had
 *   no way to do that: Approve e-mails the agent and the client, Decline and
 *   Send back e-mail the agent, and Hold e-mails nobody but leaves the case
 *   open, so the daily reminder picks it up again the next day.
 *
 * WHAT IT ADDS
 *   The dashboard's "Close quietly" button posts
 *     {stage: 'queue_close', token, id, note}.
 *   For a manager whose units cover the case, on a case that is not approved,
 *   declined or already cancelled, it:
 *     - sets Status to "cancelled", which every part of the system already
 *       reads as closed (the queue, the 3-day count, "Send to client again",
 *       the bounce follow-up, the agent's Continue);
 *     - writes who closed it, when, why and the status it had, in four columns
 *       of their own (QC_COLS), made the first time they are needed;
 *     - sends nothing. There is no MailApp or GmailApp call in this file.
 *   An agent, staff, a manager outside the case's unit, and the advisor who
 *   wrote the case are refused. A reason of at least 10 characters is needed.
 *
 *   The sheet is written by the script, so no onEdit trigger fires: a status
 *   typed into the sheet by hand could set one off; this cannot.
 *
 *   Undo: rrbQcReopen('<case id>') from the editor puts back the status the
 *   case had and records who reopened it. It sends nothing either.
 *
 * INSTALL (RR Branch FF System)
 *   1. + > Script, name it QuietClose, paste this in, save. It must be the
 *      LAST file in the list (after ClientEmails); a new file goes last.
 *   2. Deploy > Manage deployments > the deployment ending ...JsrAxxJ3dsQ >
 *      pencil > Version: New version > Deploy.
 *   3. Run rrbQcCheck. It says whether the close is wired. Nothing is changed.
 */

var RRB_QC_COLS = ['Closed Quietly At', 'Closed Quietly By', 'Closed Quietly Note', 'Closed Quietly From'];
var RRB_QC_REOPEN_COLS = ['Reopened At', 'Reopened By'];
var RRB_QC_MIN_NOTE = 10;

var RRB_QC_PREV_SUBMIT_ = (typeof ffProcessAgentSubmit === 'function') ? ffProcessAgentSubmit : null;
ffProcessAgentSubmit = function (data) {
  if (data && data.stage === 'queue_close') {
    var out;
    try { out = rrbQcClose_(data); }
    catch (err) {
      Logger.log('queue_close failed: %s', (err && err.stack) || err);
      out = { ok: false, error: 'Nothing was changed: ' + ((err && err.message) || err) };
    }
    return _ffJson(out);
  }
  if (!RRB_QC_PREV_SUBMIT_) {
    return _ffJson({ ok: false, error: 'Server set-up: QuietClose must be the last file in the project.' });
  }
  return RRB_QC_PREV_SUBMIT_(data);
};

function rrbQcClose_(data) {
  var me = rrbAuthorize_({ parameter: { token: _str(data.token) } });
  if (!me) return RRB_EXPIRED;
  var kind = (me.scope && me.scope.kind) || 'agent';
  if (kind === 'agent' || kind === 'staff') {
    return { ok: false, error: 'Only a manager can close a case.' };
  }
  var id = _str(data.id);
  if (!id) return { ok: false, error: 'No case id given.' };
  var note = _str(data.note);
  if (note.length < RRB_QC_MIN_NOTE) {
    return { ok: false, error: 'Say why it is being closed. The reason stays on the file.' };
  }

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
    var agent = _str(d.agentCode).toUpperCase();
    if (!rrbScopeHasUnit_(me.scope, ffLookupDirectManager_(agent))) {
      return { ok: false, error: 'That case is not in your unit.' };
    }
    var mine = _str(me.code || me.agentCode).toUpperCase();
    if (mine && mine === agent) {
      return { ok: false, error: 'This is your own case. Another manager has to close it.' };
    }

    var st = _str(d.status).toLowerCase();
    if (/cancel/.test(st)) return { ok: false, already: true, error: 'This case is already closed.' };
    if (/declin/.test(st)) return { ok: false, already: true, error: 'This case was declined, so it is already closed.' };
    if (/approv|complet|signed/.test(st)) {
      return { ok: false, error: 'This case is approved. An approved case is not closed from here.' };
    }

    rrbExtraCols_(sheet, headers, RRB_QC_COLS);
    var cur = ffReadRow_(sheet, headers, row);
    var at = new Date().toISOString();
    cur['Closed Quietly At'] = at;
    cur['Closed Quietly By'] = _str(me.name) || 'Manager';
    cur['Closed Quietly Note'] = note.slice(0, 1000);
    cur['Closed Quietly From'] = _str(d.status);
    cur.status = 'cancelled';
    ffWriteRow_(sheet, headers, cur, row);

    Logger.log('Closed quietly: %s (was %s), by %s. Nothing sent.', id, _str(d.status), _str(me.name));
    return { ok: true, id: id, status: 'cancelled', was: _str(d.status), at: at, sent: false };
  } finally { try { lock.releaseLock(); } catch (e2) {} }
}

/** Editor only: put a quietly closed case back as it was. Sends nothing. */
function rrbQcReopen(id) {
  id = _str(id);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = ffGetOrCreateRevisedTab_();
    var headers = ffEnsureHeaders_(sheet);
    var row = ffFindRowBySubmissionId_(sheet, headers, id);
    if (!row || row < 0) { Logger.log('Not on the sheet: %s', id); return false; }
    var d = ffReadRow_(sheet, headers, row);
    var was = _str(d['Closed Quietly From']);
    if (!/cancel/i.test(_str(d.status)) || !was) {
      Logger.log('%s was not closed quietly (status %s). Nothing changed.', id, _str(d.status));
      return false;
    }
    rrbExtraCols_(sheet, headers, RRB_QC_REOPEN_COLS);
    var cur = ffReadRow_(sheet, headers, row);
    cur.status = was;
    cur['Reopened At'] = new Date().toISOString();
    cur['Reopened By'] = Session.getActiveUser().getEmail() || 'the editor';
    ffWriteRow_(sheet, headers, cur, row);
    Logger.log('Reopened %s as %s. Nothing sent.', id, was);
    return true;
  } finally { try { lock.releaseLock(); } catch (e2) {} }
}

/** Editor only: is the close wired? Changes nothing. */
function rrbQcCheck() {
  var need = ['rrbAuthorize_', 'ffGetOrCreateRevisedTab_', 'ffEnsureHeaders_', 'ffFindRowBySubmissionId_',
              'ffReadRow_', 'ffWriteRow_', 'rrbScopeHasUnit_', 'ffLookupDirectManager_', 'rrbExtraCols_',
              '_str', '_ffJson'];
  var g = this, missing = need.filter(function (n) { return typeof g[n] !== 'function'; });
  var wired = typeof ffProcessAgentSubmit === 'function' &&
              String(ffProcessAgentSubmit).indexOf('queue_close') > -1;
  Logger.log('Quiet close: %s.', wired ? 'wired (QuietClose is the last file)' :
             'NOT wired: a later file replaces ffProcessAgentSubmit. Move QuietClose to the end.');
  Logger.log('Helpers missing: %s.', missing.length ? missing.join(', ') : 'none');
  Logger.log('Remember: Deploy > Manage deployments > pencil > New version, or the dashboard still gets the old answer.');
  return { wired: wired, missing: missing };
}
