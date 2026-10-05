/**
 * SafeButtons.gs (d44): a button in a branch e-mail counts only when a person
 * presses Confirm, and the 9:30 chase runs only once that is live.
 *
 * WHY (4 October 2026)
 *   Guardian's mail security (Avanan) opens every link in incoming mail to
 *   check it, 20 to 70 seconds after the mail arrives, and it checks the copies
 *   sent to managers as well. The outcome buttons (action=outcome) recorded the
 *   answer on that first open and e-mailed the client, so the scanner was
 *   answering for the advisors: 40 of the 47 outcomes on the sheet were stamped
 *   between 9:30 and 9:34, the minutes after the chase went out. Clients were
 *   told "not going ahead" when nobody had said so, two were told it twice,
 *   and one was told "your application is in" and "not going ahead" two seconds
 *   apart. Ratings, surveys and reviews already took two taps (rrbClientRate,
 *   rrbjSurvey); outcomes did not.
 *
 * WHAT CHANGES
 *   1. An outcome link opens a page naming the client and the answer. The
 *      answer is recorded only when that page's button is pressed (c=1). This
 *      covers every e-mail that carries the buttons: the chase, "Approved,
 *      ready for the client", and the two journey stall notes.
 *   2. A confirmed answer is recorded under the script lock, so two presses at
 *      once cannot both get past the one-use check. An answer the case already
 *      has is not recorded again, and a client who has had a closing note is
 *      not sent a second one.
 *   3. action=safecheck answers {safeButtons: "d44"}. The chase asks the
 *      address the e-mails use (rrbAppUrl_) before it sends anything, so it
 *      cannot go out while the deployed version still records on the first open.
 *   4. The chase leaves out cases the branch has closed (Closed At) or
 *      declined, and names a client once where the same person was entered
 *      more than once.
 *   5. In RR Branch FF System, the links point at this project's own web app.
 *      RRB_EXEC_URL named a deployment (...XMoczA) that is not in this
 *      project's list: it answers from an older copy of the code, without the
 *      dead-link page (d40) or this file, so nothing deployed here reached the
 *      buttons. The wall's deployment is this project's and public, so the
 *      e-mails now use it. Another project pasting this file keeps its own.
 *
 * INSTALL (FixToday.gs comes out at the same time)
 *   1. Add a script file named SafeButtons and paste this in.
 *   2. Delete the file FixToday, then save.
 *   3. Deploy > Manage deployments > the deployment safeButtonsCheck names
 *      (in RR Branch FF System, the wall's: ...PJsrAxxJ3dsQ) > pencil >
 *      Version: New version > Deploy.
 *   4. Run safeButtonsCheck. It says whether that deployment has the confirm
 *      step and who the chase would write to, and sends nothing.
 *   5. Run safeButtonsOn to put the 9:30 chase back.
 */

var RRB_D44 = 'd44';

/* 5. Where the e-mailed links go, in RR Branch FF System. */
var RRB_D44_HOME = {
  script: '1mlqf-zacKAgWmv6gn0azt6Px_b3DOiMWnsZyY8ZoS5e6rHGsOLfG7rg2',
  exec: 'https://script.google.com/macros/s/AKfycbx776ORwmwhm2u4vx2YGQPC6bRR9gTQ-Y-Yc1up0FNGkCKGaQdet-APT1PJsrAxxJ3dsQ/exec'
};
try {
  if (typeof RRB_EXEC_URL !== 'undefined' && ScriptApp.getScriptId() === RRB_D44_HOME.script) {
    RRB_EXEC_URL = RRB_D44_HOME.exec;
  }
} catch (err) {}

// What each button means, and what happens when it is confirmed.
var RRB_D44_SAYS = {
  submitted: ['Signed and submitted',
              'The client is e-mailed that the application is in, unless they have already been told.'],
  received:  ['At the branch',
              'The client is e-mailed that the policy has arrived and that you will call, unless they have already been told.'],
  pickedup:  ['Delivered and paid',
              'The client is e-mailed that the cover is in place, and the delivery survey follows in two days. It counts as API.'],
  pending:   ['Still working',
              'Nothing goes to the client. It stays in the pipeline and the branch asks again in a week.'],
  lost:      ['Not proceeding',
              'The client is sent one short closing note, unless they have had one already, and the premium comes out of the pipeline.']
};

/* 1 and 2. The outcome buttons. */
/* Each wrapper checks the original is there first. If this file ever sits
   above the files it wraps, it changes nothing, and safeButtonsCheck says so. */
var rrbD44_prevCaseOutcome = (typeof rrbCaseOutcome === 'function') ? rrbCaseOutcome : null;
if (rrbD44_prevCaseOutcome) rrbCaseOutcome = function (e) {      // d44
  var p = (e && e.parameter) || {};
  var v = _str(p.v).toLowerCase();
  // The policy-number form on the "Picked up" page is already a button press.
  if (v === 'policy') return rrbD44_prevCaseOutcome(e);
  if (!RRB_D44_SAYS[v]) v = 'pending';             // the old handler reads anything else as Still working
  var pressed = _str(p.c) === '1' || !!(e && e.postData);
  if (!pressed) return rrbD44Confirm_(e, p, v);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return rrbPage_('Not recorded',
      '<div style="font-size:19px;font-weight:800;margin-bottom:8px">Nothing was recorded</div>' +
      '<p style="color:#475569;margin:0">The branch system was busy. Go back and press the button again.</p>', 'err');
  }
  try {
    return rrbD44Record_(e, p, v);
  } finally {
    try { SpreadsheetApp.flush(); } catch (err) {}
    lock.releaseLock();
  }
};
if (rrbD44_prevCaseOutcome) rrbCaseOutcome.d44 = true;

// The page a link opens. It reads the case and writes nothing.
function rrbD44Confirm_(e, p, v) {
  var c = rrbD44Case_(p);
  if (!c) return rrbD44_prevCaseOutcome(e);        // its own "already used" or "not found" page; it writes nothing
  if (rrbD44Same_(c.d, v)) return rrbD44AlreadyPage_(c.d, v);
  var says = RRB_D44_SAYS[v];
  var body = '<div style="font-size:13px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#0F766E">' +
               'Check before it counts</div>' +
             '<div style="font-size:21px;font-weight:800;margin:6px 0 4px">' + rrbEsc_(_str(c.d.clientName) || 'This client') + '</div>' +
             rrbD44NowLine_(c.d);
  body += '<p style="color:#334155;margin:0 0 6px;font-size:15px">You pressed <strong>' + rrbEsc_(says[0]) + '</strong>.</p>' +
          '<p style="color:#475569;margin:0 0 16px;font-size:14px">' + rrbEsc_(says[1]) + '</p>' +
          // A POST, like the client signing page: a scanner opens links but sends no forms.
          '<form action="' + rrbAppUrl_() + '" method="post" style="margin:0">' +
            '<input type="hidden" name="action" value="outcome">' +
            '<input type="hidden" name="t" value="' + rrbEsc_(_str(p.t)) + '">' +
            '<input type="hidden" name="v" value="' + rrbEsc_(v) + '">' +
            '<input type="hidden" name="c" value="1">' +
            '<button type="submit" style="width:100%;background:' + (v === 'lost' ? '#B45309' : '#0D9488') +
              ';color:#fff;border:0;border-radius:9px;padding:13px;font-size:15px;font-weight:800;cursor:pointer">' +
              'Yes, record ' + rrbEsc_(says[0]) + '</button>' +
          '</form>' +
          '<p style="color:#94A3B8;font-size:12.5px;margin:12px 0 0;line-height:1.5">Wrong button? Close this page and ' +
            'press the right one in the e-mail. Nothing has been recorded. Guardian&rsquo;s mail security opens links ' +
            'to check them, which is why a button only counts once you confirm it here.</p>';
  return rrbPage_('Confirm: ' + says[0], body, v === 'lost' ? 'bad' : 'ok');
}

// A confirmed press, under the lock.
function rrbD44Record_(e, p, v) {
  var c = rrbD44Case_(p);
  if (!c) return rrbD44_prevCaseOutcome(e);        // used, expired or not found: it says so and writes nothing
  if (rrbD44Same_(c.d, v)) return rrbD44AlreadyPage_(c.d, v);

  var id = _str(c.id);
  var hold = v === 'lost' && rrbD44HadClosing_(c.d, id);
  var keep = (typeof RRBJ_CLOSING_NOTE === 'undefined') ? true : RRBJ_CLOSING_NOTE;
  var out;
  try {
    if (hold) RRBJ_CLOSING_NOTE = false;
    out = rrbD44_prevCaseOutcome(e);
  } finally {
    if (hold) RRBJ_CLOSING_NOTE = keep;
  }
  if (v === 'lost') {
    if (hold) {
      try {
        out.setContent(out.getContent().replace('and the client has been sent a short closing note.',
          'and the client already had a closing note, so nothing was sent again.'));
      } catch (err) {}
    } else {
      try { PropertiesService.getScriptProperties().setProperty('RRB_D44_CLOSING_' + id.slice(0, 40), new Date().toISOString()); }
      catch (err) {}
    }
  }
  return out;
}

// The case behind a link, or null when the link is no good.
function rrbD44Case_(p) {
  var chk = rrbVerifyToken(p.t);
  if (!chk || !chk.ok) return null;
  var sheet = ffGetOrCreateRevisedTab_();
  var headers = ffEnsureHeaders_(sheet);
  var row = ffFindRowBySubmissionId_(sheet, headers, chk.payload.id);
  if (!(row > 0)) return null;
  return { id: chk.payload.id, d: ffReadRow_(sheet, headers, row) };
}

// True when the case already carries this answer.
function rrbD44Same_(d, v) {
  var now = _str(d.caseOutcome);
  if (v === 'lost')      return /^not proceeding$/i.test(now);
  if (v === 'pickedup')  return /^picked up$/i.test(now);
  if (v === 'submitted') return /^submitted$/i.test(now);
  if (v === 'pending')   return /^still working$/i.test(now);
  if (v === 'received')  return !!_str(d['Journey Received At']);
  return false;
}

function rrbD44AlreadyPage_(d, v) {
  return rrbPage_('Already recorded',
    '<div style="font-size:13px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#0F766E">Already recorded</div>' +
    '<div style="font-size:21px;font-weight:800;margin:6px 0 4px">' + rrbEsc_(_str(d.clientName) || 'This client') + '</div>' +
    '<p style="color:#475569;margin:0;font-size:14.5px">This case is already recorded as <strong>' +
      rrbEsc_(RRB_D44_SAYS[v][0]) + '</strong>. There is nothing to do, and nothing was sent again.</p>', 'ok');
}

function rrbD44NowLine_(d) {
  var now = _str(d.caseOutcome);
  if (!now) {
    var st = _str(d['Journey Stage']).toLowerCase();
    now = { keyed: 'application in', received: 'at the branch', delivered: 'delivered', closed: 'closed' }[st] || '';
  }
  return now ? '<p style="color:#64748B;margin:0 0 12px;font-size:13.5px">On the case now: ' + rrbEsc_(now) + '</p>' : '';
}

// Has this client already had a closing note? The journey logs "closed - Not
// proceeding" when one goes, and this file stamps the ones it lets through.
function rrbD44HadClosing_(d, id) {
  try {
    if (PropertiesService.getScriptProperties().getProperty('RRB_D44_CLOSING_' + _str(id).slice(0, 40))) return true;
  } catch (err) {}
  return /closed\s*\S\s*not proceeding/i.test(_str(d['Journey Log']));
}

/* 3. The check the chase makes before it sends. */
var rrbD44_prevDoGet = (typeof doGet === 'function') ? doGet : null;
if (rrbD44_prevDoGet) doGet = function (e) {                     // d44
  var a = (e && e.parameter && e.parameter.action) || '';
  if (a === 'safecheck') {
    return ContentService.createTextOutput(JSON.stringify({ ok: true, safeButtons: RRB_D44, links: rrbAppUrl_() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return rrbD44_prevDoGet(e);
};

// Does the deployed version the e-mailed links open have the confirm step, and
// do its own pages send the button back to it?
function rrbD44Live_() {
  var url = rrbAppUrl_();
  if (!url) return { ok: false, why: 'there is no web app address', dep: '' };
  var dep = rrbD44Short_(url);
  try {
    var res = UrlFetchApp.fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 'action=safecheck',
                                { muteHttpExceptions: true, followRedirects: true });
    var j = null;
    try { j = JSON.parse(res.getContentText()); } catch (err) {}
    if (j && j.safeButtons === RRB_D44 && j.links === url) return { ok: true, why: url, dep: dep };
    return { ok: false, dep: dep, why: (j && j.safeButtons === RRB_D44)
      ? 'deployment ' + dep + ' has an earlier copy of SafeButtons'
      : 'deployment ' + dep + ' does not have the confirm step yet' };
  } catch (err) {
    return { ok: false, dep: dep, why: 'deployment ' + dep + ' did not answer (' + (err && err.message || err) + ')' };
  }
}

// The last characters of a deployment address, as Manage deployments shows the ID.
function rrbD44Short_(url) {
  var m = String(url).match(/\/s\/([\w-]+)\/exec/);
  return m ? '...' + m[1].slice(-12) : String(url);
}

/* 4. The 9:30 chase. The same e-mail as before, sent only when the check
   passes, leaving out closed cases and second entries of the same client. */
var rrbD44_hasChase = (typeof rrbChaseOpenCases === 'function');
if (rrbD44_hasChase) rrbChaseOpenCases = function () {           // d44
  var live = rrbD44Live_();
  if (!live.ok) {
    Logger.log('Chase held: %s. Deploy a new version of the web app, then run safeButtonsCheck.', live.why);
    return;
  }
  var list = rrbD44ChaseList_();
  Object.keys(list.byAgent).forEach(function (to) {
    var a = list.byAgent[to];
    try {
      MailApp.sendEmail({
        to: to,
        cc: [_str(a.rows[0].d.reviewerEmail), RRB_ALWAYS_CC].filter(String).join(','),
        subject: a.rows.length === 1
          ? 'Did this close? ' + (_str(a.rows[0].d.clientName) || 'one case') + ' — ' + a.rows[0].age + ' days'
          : a.rows.length + ' cases waiting on an answer — did they close?',
        htmlBody: rrbChaseHtml_(a),
        name: 'RR Branch Fact Find'
      });
      // Stamp them so nobody is asked again for a week.
      a.rows.forEach(function (x) {
        var m = {};
        Object.keys(x.d).forEach(function (k) { m[k] = x.d[k]; });
        m.caseChasedAt = new Date().toISOString();
        m.caseChaseCount = String((parseInt(_str(x.d.caseChaseCount), 10) || 0) + 1);
        ffWriteRow_(list.sheet, list.headers, m, x.row);
      });
    } catch (err) { Logger.log('chase to %s failed: %s', to, err && err.message); }
  });
  Logger.log('Chased %s case(s) across %s advisor(s); left out %s closed and %s entered twice.',
             list.cases, Object.keys(list.byAgent).length, list.closed, list.doubles);
};
if (rrbD44_hasChase) rrbChaseOpenCases.d44 = true;

// Who the chase would write to, and about what. Reads the sheet; writes nothing.
function rrbD44ChaseList_() {
  var sheet = ffGetOrCreateRevisedTab_();
  var headers = ffEnsureHeaders_(sheet);
  var out = { sheet: sheet, headers: headers, byAgent: {}, cases: 0, closed: 0, doubles: 0 };
  var last = sheet.getLastRow();
  if (last < 2) return out;

  var now = new Date(), pick = {}, order = [];
  for (var r = 2; r <= last; r++) {
    var d = ffReadRow_(sheet, headers, r);
    if (!d || !d.submissionId) continue;

    // Only cases the client actually said yes to.
    var apps = 0, api = 0;
    for (var i = 1; i <= 6; i++) {
      if (!/^yes$/i.test(_str(d['dec' + i + 'Go']))) continue;
      apps++;
      var pr = rrbNum_(d['dec' + i + 'Prem']) || rrbNum_(d['rec' + i + 'Prem']);
      api += pr * rrbApiMultiplier_(d['rec' + i + 'Mode']);
    }
    if (!apps) continue;

    var outcome = _str(d.caseOutcome);
    if (/^picked up$/i.test(outcome) || /^not proceeding$/i.test(outcome)) continue;

    var sub = d.submittedAt ? new Date(d.submittedAt) : null;
    if (!sub || isNaN(sub.getTime())) continue;
    var age = Math.floor((now.getTime() - sub.getTime()) / 86400000);
    if (age < RRB_CHASE_AFTER_DAYS) continue;

    var lastChased = d.caseChasedAt ? new Date(d.caseChasedAt) : null;
    if (lastChased && !isNaN(lastChased.getTime())) {
      var since = Math.floor((now.getTime() - lastChased.getTime()) / 86400000);
      if (since < RRB_CHASE_EVERY_DAYS) continue;
    }

    var to = _str(d.agentEmail);
    if (!to) continue;

    // d44: a case the branch closed, or a manager declined, is finished.
    if (_str(d['Closed At']) || /^declined$/i.test(_str(d.status))) { out.closed++; continue; }

    // d44: one line per client. The same person entered twice shares an
    // e-mail and a first name; a household sharing an e-mail does not.
    var em = rrbClientEmail_(d).toLowerCase();
    var nm = _str(d.clientName).toLowerCase().replace(/[^a-z ]/g, ' ').trim().split(/\s+/);
    var key = to.toLowerCase() + '|' + (em ? em + '|' + nm[0] : (nm.join('') || _str(d.submissionId)));
    var item = { row: r, d: d, age: age, api: api, apps: apps, sub: sub.getTime() };
    if (pick[key]) {
      out.doubles++;
      if (item.sub > pick[key].sub) pick[key] = item;      // keep the newest entry
    } else {
      pick[key] = item;
      order.push(key);
    }
  }

  order.forEach(function (k) {
    var x = pick[k], to = _str(x.d.agentEmail);
    if (!out.byAgent[to]) out.byAgent[to] = { name: _str(x.d.advisorName), rows: [] };
    out.byAgent[to].rows.push(x);
    out.cases++;
  });
  Object.keys(out.byAgent).forEach(function (to) {
    out.byAgent[to].rows.sort(function (a, b) { return a.row - b.row; });
  });
  return out;
}

// Are the three wrappers in place (and not undone by FixToday)?
function rrbD44Mine_() {
  return !!(rrbD44_prevDoGet && typeof rrbChaseOpenCases === 'function' && rrbChaseOpenCases.d44 &&
            typeof rrbCaseOutcome === 'function' && rrbCaseOutcome.d44);
}

/* Run these from the editor. */

// Says where things stand. Sends nothing.
function safeButtonsCheck() {
  var lines = [], say = function (s) { lines.push(s); console.log(s); };
  var live = rrbD44Live_();
  say('1. The web app the e-mails open (' + live.dep + '): ' + (live.ok ? 'has the confirm step.'
      : 'NOT yet: ' + live.why + '. Deploy > Manage deployments > the deployment whose ID ends ' + live.dep.slice(3) +
        ' > pencil > Version: New version > Deploy.'));
  var mine = rrbD44Mine_();
  say('2. This project: ' + (mine ? 'running SafeButtons.'
      : 'NOT running SafeButtons. If FixToday is still here, delete it and save. If not, drag SafeButtons to the bottom of the file list.'));
  var n = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'rrbChaseOpenCases'; }).length;
  say('3. The 9:30 chase is ' + (n ? 'ON' : 'off') + (n > 1 ? ', with ' + n + ' triggers, so it would send twice' : '') + '.');
  var list = rrbD44ChaseList_();
  say('4. If it ran now it would write to ' + Object.keys(list.byAgent).length + ' advisor(s) about ' + list.cases + ' case(s):');
  Object.keys(list.byAgent).sort().forEach(function (to) {
    var a = list.byAgent[to];
    say('   ' + (a.name || to) + ': ' + a.rows.map(function (x) { return _str(x.d.clientName) || 'unnamed'; }).join(', '));
  });
  say('   Left out: ' + list.closed + ' closed or declined, ' + list.doubles + ' entered more than once.');
  say('Nothing was sent.');
  return lines.join('\n');
}

// Puts the 9:30 chase back, only when the confirm step is live.
function safeButtonsOn() {
  var say = function (s) { console.log(s); return s; };
  if (!rrbD44Mine_()) {
    return say('Not switched on: this project is not running SafeButtons. If FixToday is still here, delete it, save, and run this again. ' +
               'If not, drag SafeButtons to the bottom of the file list.');
  }
  var live = rrbD44Live_();
  if (!live.ok) {
    return say('Not switched on: ' + live.why + '. Deploy > Manage deployments > the deployment whose ID ends ' +
               live.dep.slice(3) + ' > pencil > Version: New version > Deploy, then run this again.');
  }
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'rrbChaseOpenCases') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('rrbChaseOpenCases').timeBased().atHour(9).everyDays(1).create();
  return say('On. The chase runs every morning between 9 and 10. Its buttons ask the advisor to confirm before anything is recorded or sent.');
}

// Stops the 9:30 chase again.
function safeButtonsOff() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'rrbChaseOpenCases') { ScriptApp.deleteTrigger(t); n++; }
  });
  console.log(n ? 'Off. The 9:30 chase will not run.' : 'It was already off.');
}
