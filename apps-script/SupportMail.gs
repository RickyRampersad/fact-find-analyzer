/**
 * SupportMail.gs — every FactFind360 e-mail goes out from
 * support@rickyrampersadbranch.com, through the branch's Mail Relay.
 *
 * WHY (8 November 2026)
 *   "all need to get the mail from support@rickyrampersadbranch". This
 *   project runs under the personal Gmail, which sends as that Gmail and may
 *   reach about 100 recipients a day. The Mail Relay (MailRelay.gs in the
 *   branch repository) runs under the support@ Workspace account, about 1,500
 *   a day, and the KPI tracker already sends through it. This file hands the
 *   project's e-mail to the same relay, signed with the relay's key.
 *
 * HOW
 *   It puts a stand-in in front of MailApp, so the 18 places in this project
 *   that send mail need no change: each e-mail goes to the relay and out from
 *   support@; if the relay is not set up, refuses, or does not answer, the
 *   e-mail goes from Gmail exactly as before and the reason is kept
 *   (smCheck shows it). Nothing is ever lost.
 *
 * PUT IT IN
 *   1. + next to Files > Script, name it SupportMail, paste this file. LAST
 *      in the list (below MonthClose).
 *   2. Fill SM_RELAY_URL and SM_RELAY_KEY below with the SAME two values the
 *      KPI tracker has as MAIL_RELAY_URL and MAIL_RELAY_KEY (its Project
 *      Settings > Script properties). Run smSetRelay. It stores them as
 *      Script properties, so they work even though the properties page is
 *      read-only. Then put the two values back to '' and save, so the key
 *      is not left in the code.
 *   3. Run smCheck: it sends you one test e-mail and says which way it went.
 *   4. Deploy > Manage deployments > pencil > New version > Deploy.
 *
 * Every name here starts with sm.
 */

var SM_RELAY_URL = '';   // paste, run smSetRelay, then blank again
var SM_RELAY_KEY = '';   // paste, run smSetRelay, then blank again
var SM_NAME = 'Ricky Rampersad Branch';
var SM_DOWN_SEC = 900;   // after a failure, Gmail for fifteen minutes before the relay is tried again

function smProp_(k) { try { return PropertiesService.getScriptProperties().getProperty(k) || ''; } catch (e) { return ''; } }
function smReady_() { return !!(smProp_('MAIL_RELAY_URL') && smProp_('MAIL_RELAY_KEY')); }
function smSign_(text, key) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(text), String(key))).replace(/=+$/, '');
}

/* MailApp.sendEmail takes either one object or (to, subject, body, options). */
function smMessage_(a) {
  if (a.length === 1 && a[0] && typeof a[0] === 'object') return a[0];
  var o = { to: a[0], subject: a[1], body: a[2] };
  var x = a[3] || {};
  Object.keys(x).forEach(function (k) { o[k] = x[k]; });
  return o;
}

/* One e-mail through the relay. True when it went; false (and the reason
   kept) when it should go from Gmail instead. Inline images and noReply cannot
   travel through the relay, so those e-mails go from Gmail.
   Attachments travel since 11 November 2026: the fact find's review e-mail and
   the advisor's copy carry the PDF, and from Gmail they hit its 100-a-day limit
   and stopped the submission ("Failed to fetch"). A relay older than that
   answers without sending them, so it is checked (j.att) and Gmail used then. */
function smAtt_(list) {
  return [].concat(list || []).map(function (a) {
    var b = (a && a.getBlob) ? a.getBlob() : a;
    return { name: b.getName() || 'attachment', type: b.getContentType() || 'application/octet-stream', b64: Utilities.base64Encode(b.getBytes()) };
  });
}
/* Whether the relay carries attachments: asked once (its address answers att: true from 11 November), kept 6 hours. */
function smRelayTakesAtt_() {
  var c = null; try { c = CacheService.getScriptCache(); var k = c.get('sm_att'); if (k) return k === 'y'; } catch (e) {}
  var yes = false;
  try { var r = UrlFetchApp.fetch(smProp_('MAIL_RELAY_URL'), { muteHttpExceptions: true, followRedirects: true }); yes = !!JSON.parse(r.getContentText() || '{}').att; } catch (e2) {}
  try { if (c) c.put('sm_att', yes ? 'y' : 'n', yes ? 21600 : 900); } catch (e3) {}
  return yes;
}
function smViaRelay_(o) {
  if (!smReady_() || o.inlineImages || o.noReply) return false;
  var cache = null;
  try { cache = CacheService.getScriptCache(); if (cache.get('sm_down')) return false; } catch (e) {}
  var why = '';
  try {
    var m = {};
    ['to', 'cc', 'bcc', 'subject', 'htmlBody', 'body', 'name', 'replyTo'].forEach(function (k) {
      if (o[k] != null && o[k] !== '') m[k] = String(o[k]);
    });
    if (!m.name) m.name = SM_NAME;
    if (o.attachments) { if (!smRelayTakesAtt_()) return false; m.att = smAtt_(o.attachments); }
    var body = JSON.stringify(m), t = String(Date.now());
    var res = UrlFetchApp.fetch(smProp_('MAIL_RELAY_URL'), {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: true,
      payload: JSON.stringify({ m: body, t: t, s: smSign_(body + '|' + t, smProp_('MAIL_RELAY_KEY')) }) });
    var j = {};
    try { j = JSON.parse(res.getContentText() || '{}'); } catch (e2) { why = 'answer ' + res.getResponseCode() + ', not the relay'; }
    if (j.ok) { if (cache && j.left != null) cache.put('sm_left', String(j.left), 21600); return true; }
    why = why || String(j.error || ('answer ' + res.getResponseCode()));
  } catch (e) { why = String((e && e.message) || e).slice(0, 160); }
  try {
    PropertiesService.getScriptProperties().setProperty('SM_LAST', Utilities.formatDate(new Date(), 'America/Port_of_Spain', 'd MMM h:mm a') + ': ' + why);
    if (cache) cache.put('sm_down', why.slice(0, 200), SM_DOWN_SEC);
  } catch (e) {}
  return false;
}

/* The stand-in. The real MailApp is kept, so a Gmail send is exactly what it
   always was. */
var SM_MAILAPP_ = MailApp;
var SM_STANDIN_ = {
  sendEmail: function () {
    var o = smMessage_(arguments);
    if (smViaRelay_(o)) return;
    try { return SM_MAILAPP_.sendEmail.apply(SM_MAILAPP_, arguments); }
    catch (err) {
      /* Gmail's own daily limit is spent: one more try through the relay, so the e-mail still goes and the fact
         find that asked for it does not stop with "Failed to fetch". Inline images are left out; noReply ignored. */
      if (!/too many times|quota|limit/i.test(String(err && err.message))) throw err;
      try { CacheService.getScriptCache().remove('sm_down'); } catch (e2) {}
      var o2 = {}; Object.keys(o).forEach(function (k) { if (k !== 'inlineImages' && k !== 'noReply') o2[k] = o[k]; });
      if (o2.attachments && !smRelayTakesAtt_()) {
        /* A relay older than 11 November cannot carry the PDF: the e-mail goes without it rather than not at all. */
        delete o2.attachments;
        if (o2.htmlBody) o2.htmlBody += '<p style="font:13px Arial;color:#B45309">The PDF could not be attached to this e-mail today. Open the case on the FactFind360 dashboard to download it.</p>';
      }
      if (smViaRelay_(o2)) return;
      throw err;
    }
  },
  /* The relay allows about 1,400 a day; with it ready, the Gmail allowance is
     not the limit, so the senders' own quota checks stop holding mail back. */
  getRemainingDailyQuota: function () {
    if (smReady_()) { try { if (!CacheService.getScriptCache().get('sm_down')) return 1000; } catch (e) {} }
    return SM_MAILAPP_.getRemainingDailyQuota();
  }
};
try { MailApp = SM_STANDIN_; } catch (e) {}

/* ── the editor's buttons ──────────────────────────────────────────────── */

function smSetRelay() {
  if (!SM_RELAY_URL || !SM_RELAY_KEY) { Logger.log('Paste both values between the quotes first, then run this again.'); return; }
  PropertiesService.getScriptProperties().setProperties({ MAIL_RELAY_URL: SM_RELAY_URL.trim(), MAIL_RELAY_KEY: SM_RELAY_KEY.trim() }, false);
  try { CacheService.getScriptCache().remove('sm_down'); } catch (e) {}
  Logger.log('Stored. Now put both values back to \'\' at the top of the file, save, and run smCheck.');
}

/* The editor's button: Gmail's own allowance left today, and whether the relay carries PDFs. */
function smQuota() {
  Logger.log('Gmail allowance left today (this account): %s', SM_MAILAPP_.getRemainingDailyQuota());
  Logger.log('Relay ready: %s · carries attachments: %s', smReady_() ? 'yes' : 'no', smReady_() && smRelayTakesAtt_() ? 'yes' : 'NO: paste the new MailRelay.gs in the relay project');
}

function smCheck() {
  var say = function (ok, s) { Logger.log((ok ? 'OK    ' : 'NOT OK') + '  ' + s); };
  var standin = MailApp === SM_STANDIN_;
  say(standin, standin ? 'every e-mail in this project now passes through SupportMail first'
                       : 'Google did not let this file stand in front of MailApp. Tell Claude: the senders will be changed one by one instead');
  say(smReady_(), smReady_() ? 'the relay\'s address and key are stored' : 'the relay is not set up: fill the two values at the top and run smSetRelay');
  if (!smReady_()) return;
  try { CacheService.getScriptCache().remove('sm_down'); } catch (e) {}
  var to = Session.getEffectiveUser().getEmail();
  try { to = (MAIL_CONFIG && MAIL_CONFIG.branchManager) || to; } catch (e) {}
  var went = smViaRelay_({ to: to, subject: 'FactFind360 mail test · from support@',
    htmlBody: '<p style="font:15px Arial">If this came from <b>support@rickyrampersadbranch.com</b>, every FactFind360 e-mail now goes from there.</p>' });
  say(went, went ? 'test e-mail sent to ' + to + ' through the relay, from support@' : 'the relay refused: ' + smProp_('SM_LAST'));
  if (!went) Logger.log('Until that is fixed, e-mails keep going from Gmail as before. Nothing is lost.');
}
