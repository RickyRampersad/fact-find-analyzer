/**
 * MonthClose.gs — the month, closed: every advisor's own close-out e-mail,
 * the form they answer, the branch manager's summary, and the wall's
 * "month in review".
 *
 * WHAT WAS ASKED
 *   7 November 2026: "the month has ended and can the staff now get the email
 *   to close out Oct driving the insights on what they did and settled as well
 *   submitted and fill out? They did fill their goal plan and a month has
 *   gone, can this be done now and every month?" The goals' API rolls up into
 *   the branch's goal, so the close-out reads each advisor's own flight plan.
 *
 * WHAT EACH ADVISOR GETS (one e-mail, the second working day of a month)
 *   Last month against their own plan: submitted API and apps (Salesforce,
 *   on the production picked-up date, new business and increases, as the wall
 *   counts it), settled (the settlement tab), fact finds filed, the activity
 *   they checked in against what their plan asks, their place in the branch,
 *   the year so far against where their plan says they should be, and what
 *   each remaining month of the quarter now needs. Then a few sentences of
 *   insight worked out from those numbers (facts, never advice), the branch's
 *   honours for the month, and one button: "Close out <month>". The button
 *   opens factfind360.com/close, where they rate the month, name the win and
 *   what got in the way, and commit to next month's API, apps and fact finds.
 *
 * WHAT IT KEEPS
 *   One tab in the fact-find workbook, "FY27 Month Close": one row per advisor
 *   per month, written when the e-mail goes (the figures as sent) and filled
 *   when they close out. A month already sent is never sent twice by the
 *   timer; mclSendNow can send it again on purpose.
 *
 * THE TIMER (mclSetup installs it)
 *   Every day at 7:30. On the 2nd working day of a month it sends last month's
 *   close-out; on the 5th it reminds whoever has not closed out, and sends the
 *   branch manager the list. Nothing else.
 *
 * PUT IT IN
 *   1. + next to Files > Script, name it MonthClose, paste this file. It must
 *      be the LAST file in the list (it wraps GoalPlans' doors).
 *   2. Run mclCheck: it reads October and says what each part found. Nothing
 *      is sent.
 *   3. Run mclPreview: the branch manager gets three advisors' e-mails and the
 *      summary, marked PREVIEW. Nothing is recorded.
 *   4. Deploy > Manage deployments > the deployment ending ...JsrAxxJ3dsQ >
 *      pencil > Version: New version > Deploy. (The close-out page needs it.)
 *   5. Run mclSendOctober: every advisor gets October's close-out now.
 *   6. Run mclSetup: every month after this one goes by itself.
 *
 * Every name here starts with mcl.
 */

var MCL_TAB  = 'FY27 Month Close';
var MCL_TZ   = 'America/Port_of_Spain';
var MCL_PAGE = 'https://factfind360.com/close';
var MCL_SEND_ON_WORKDAY   = 2;   // the 2nd working day of the month
var MCL_REMIND_ON_WORKDAY = 5;   // the 5th
var MCL_FROM_NAME = 'Ricky Rampersad Branch';
var MCL_HELP = ['Joint field work', 'Leads', 'Sales coaching', 'Product help', 'Admin help', 'Weekly accountability'];

var MCL_COLS = ['Month', 'Code', 'Name', 'Unit', 'Email', 'Sent At', 'Reminded At', 'Closed At',
  'Month Goal', 'Submitted API', 'Submitted Apps', 'Settled API', 'Settled Apps', 'Fact Finds', 'Of Goal %',
  'Rating', 'Win', 'In The Way', 'Differently', 'Next API', 'Next Apps', 'Next Fact Finds', 'Next Appts / wk',
  'Help', 'Figures JSON', 'Answers JSON'];

/* ── the doors ─────────────────────────────────────────────────────────── */

var MCL_PREV_SUBMIT_ = (typeof ffProcessAgentSubmit === 'function') ? ffProcessAgentSubmit : null;
ffProcessAgentSubmit = function (data) {
  if (data && data.stage === 'goal_close') {
    var out;
    try { out = mclSave_(data); }
    catch (err) { Logger.log('goal_close failed: %s', (err && err.stack) || err); out = { ok: false, error: 'Nothing was saved: ' + ((err && err.message) || err) }; }
    return _ffJson(out);
  }
  if (!MCL_PREV_SUBMIT_) return _ffJson({ ok: false, error: 'Server set-up: MonthClose must be the last file in the project.' });
  return MCL_PREV_SUBMIT_(data);
};

var MCL_PREV_DOGET_ = (typeof doGet === 'function') ? doGet : null;
if (MCL_PREV_DOGET_) doGet = function (e) {
  var a = (e && e.parameter && e.parameter.action) || '';
  if (a === 'goal_close_me') {
    var out;
    try { out = mclMe_(e); } catch (err) { Logger.log('goal_close_me failed: %s', (err && err.stack) || err); out = { ok: false, error: String((err && err.message) || err) }; }
    return _ffJson(out);
  }
  /* The wall's goal answer carries the last closed month too: the production
     board's "month in review" scene reads it. Added after the race is built,
     so GoalPlans' own cache is untouched. */
  if (a === 'goal_wall') {
    var res = MCL_PREV_DOGET_(e);
    try {
      var j = JSON.parse(res.getContent());
      if (j && j.ok) { j.close = mclWall_(); return _ffJson(j); }
    } catch (err) { Logger.log('goal_wall close: %s', err && err.message); }
    return res;
  }
  return MCL_PREV_DOGET_(e);
};

/* ── dates ─────────────────────────────────────────────────────────────── */

var MCL_MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function mclPad_(n) { return ('0' + n).slice(-2); }
function mclToday_() { return Utilities.formatDate(new Date(), MCL_TZ, 'yyyy-MM-dd'); }
function mclHolidays_() { return (typeof FYR_HOLIDAYS !== 'undefined' && FYR_HOLIDAYS) || []; }

/* The month as a thing: 'YYYY-MM' in, its days, working days and place in the year out. */
function mclMonth_(ym) {
  var y = +ym.slice(0, 4), m = +ym.slice(5, 7), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  var work = [];
  for (var d = 1; d <= last; d++) {
    var iso = ym + '-' + mclPad_(d), wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (wd !== 0 && wd !== 6 && mclHolidays_().indexOf(iso) < 0) work.push(iso);
  }
  var from = (typeof fyrFrom_ === 'function') ? fyrFrom_(new Date(Date.UTC(y, m - 1, 15))) : GOAL_FY_FROM;
  var fy0 = +from.slice(0, 4), fm0 = +from.slice(5, 7);
  var idx = (y - fy0) * 12 + (m - fm0);              // 0 = the year's first month
  var nx = m === 12 ? (y + 1) + '-01' : y + '-' + mclPad_(m + 1);
  return { ym: ym, y: y, m: m, name: MCL_MN[m - 1], short: MCL_MN[m - 1].slice(0, 3), first: ym + '-01', last: ym + '-' + mclPad_(last),
           days: last, work: work, weeks: work.length / 5, idx: idx, q: Math.floor(idx / 3), inQ: idx % 3,
           fyFrom: from, next: nx, nextName: MCL_MN[(m % 12)] };
}

function mclLastMonth_() {
  var t = mclToday_(), y = +t.slice(0, 4), m = +t.slice(5, 7);
  return m === 1 ? (y - 1) + '-12' : y + '-' + mclPad_(m - 1);
}

/* The nth working day of the month the day is in, or 0 if the day is not one. */
function mclWorkdayNo_(iso) {
  var M = mclMonth_(iso.slice(0, 7));
  return M.work.indexOf(iso) + 1;
}

/* ── the numbers ───────────────────────────────────────────────────────── */

function mclNum_(v) { var n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }
function mclMoney_(n) { n = Math.round(Number(n) || 0); return (n < 0 ? '−' : '') + 'TT$' + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function mclK_(n) { n = Math.round(Number(n) || 0); return Math.abs(n) >= 1e6 ? 'TT$' + (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'm' : Math.abs(n) >= 1e4 ? 'TT$' + Math.round(n / 1000) + 'k' : mclMoney_(n); }
function mclEsc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function mclFirst_(name) { return String(name || '').trim().split(/\s+/)[0] || 'there'; }

/* Submitted in the month: production picked up between its first and last
   day, new business and increases, per advisor. [apps, api] */
function mclSubmitted_(M) {
  var sess = sfLogin_(), out = {};
  var nb = sfQuery_(sess, "SELECT AGENT__r.Agent__c code, SUM(App_Count__c) apps, SUM(Total_API__c) api FROM CLIENT_PORTFOLIO__c " +
    "WHERE Production_Picked_up_Date__c >= " + M.first + " AND Production_Picked_up_Date__c <= " + M.last + " GROUP BY AGENT__r.Agent__c");
  var inc = sfQuery_(sess, "SELECT Policy_Increases__r.AGENT__r.Agent__c code, SUM(App_Count_Inc__c) apps, SUM(Increase_API__c) api " +
    "FROM Policy_Increases__c WHERE Increase_Production_Picked_Up_Date__c >= " + M.first + " AND Increase_Production_Picked_Up_Date__c <= " + M.last +
    " GROUP BY Policy_Increases__r.AGENT__r.Agent__c");
  [].concat(nb || [], inc || []).forEach(function (r) {
    var c = goalKey_(r.code); if (!c) return;
    var t = out[c] || (out[c] = [0, 0]); t[0] += Number(r.apps) || 0; t[1] += Number(r.api) || 0;
  });
  return out;
}

/* Settled in the month: the settlement tab, the same columns getSettlement
   reads (C agent, K the count flag, netted, L API, M year, N month). */
function mclSettled_(M) {
  var out = {}, sh = (typeof rrbSettleSheet_ === 'function') ? rrbSettleSheet_() : null;
  if (!sh) return { by: out, ok: false };
  var v = sh.getDataRange().getValues();
  for (var r = 1; r < v.length; r++) {
    var raw = String(v[r][2] == null ? '' : v[r][2]).trim();
    if (!/^[AU]\s*\d/i.test(raw)) continue;
    if (parseInt(v[r][12], 10) !== M.y || parseInt(v[r][13], 10) !== M.m) continue;
    var c = goalKey_(raw); if (!c) continue;
    var t = out[c] || (out[c] = [0, 0]);
    t[0] += Number(v[r][10]) || 0; t[1] += mclNum_(v[r][11]);
  }
  return { by: out, ok: true };
}

/* Fact finds filed in the month, per advisor, read off the submitted tab by
   heading as the rest of the system reads it. Approved counted apart. */
function mclFactFinds_(M) {
  var out = {};
  try {
    var sh = (typeof ffGetOrCreateRevisedTab_ === 'function') ? ffGetOrCreateRevisedTab_()
           : SpreadsheetApp.openById(FF_SHEET_ID).getSheetByName(FF_REVISED_TAB);
    if (!sh || sh.getLastRow() < 2) return out;
    var v = sh.getDataRange().getValues(), maps = _ffSchemaMaps();
    var head = v[0].map(function (h) { return maps.l2k[String(h)] || String(h); });
    var cA = head.indexOf('agentCode'), cS = head.indexOf('submittedAt'), cT = head.indexOf('status');
    if (cA < 0 || cS < 0) return out;
    for (var r = 1; r < v.length; r++) {
      var at = v[r][cS], d = at instanceof Date ? at : new Date(at);
      if (isNaN(d)) continue;
      var iso = Utilities.formatDate(d, MCL_TZ, 'yyyy-MM-dd');
      if (iso < M.first || iso > M.last) continue;
      var c = goalKey_(v[r][cA]); if (!c) continue;
      var t = out[c] || (out[c] = { filed: 0, approved: 0 });
      t.filed++;
      if (cT >= 0 && /approv/i.test(String(v[r][cT]))) t.approved++;
    }
  } catch (err) { Logger.log('mclFactFinds_: %s', err && err.message); }
  return out;
}

/* The weekly check-ins whose week began in the month. */
function mclChecks_(M) {
  var out = {};
  goalChecks_().forEach(function (c) {
    if (!c.weekOf || c.weekOf < M.first || c.weekOf > M.last) return;
    var t = out[c.code] || (out[c.code] = { n: 0, contacts: 0, appts: 0, ffs: 0, apps: 0, referrals: 0, reviews: 0, conf: 0 });
    t.n++;
    ['contacts', 'appts', 'ffs', 'apps', 'referrals', 'reviews'].forEach(function (k) { t[k] += Math.max(0, Math.round(mclNum_(c[k]))); });
    t.conf += mclNum_(c.confidence) || 0;
  });
  return out;
}

/* What the plan asked of the month: a third of its quarter's API, a twelfth
   of its apps, and the weekly activity times the working weeks. */
function mclGoals_(d, M) {
  var qApi = (d.q && d.q[M.q]) || 0;
  return { api: Math.round(qApi / 3), apps: Math.round(d.appsYear / 12 * 10) / 10,
           ffs: Math.round(d.ffWeek * M.weeks * 10) / 10, appts: Math.round(d.apptWeek * M.weeks * 10) / 10,
           contacts: Math.round(d.contactsWeek * M.weeks), qApi: qApi };
}

/* Everyone, for the month. Cached ten minutes: the e-mails, the page and the
   wall all read the same answer. */
function mclData_(ym, fresh) {
  var cache = CacheService.getScriptCache(), ck = 'mcl_' + ym;
  if (!fresh) { var hit = cache.get(ck); if (hit) { try { return JSON.parse(hit); } catch (e) {} } }
  var M = mclMonth_(ym), monthEnd = new Date(Date.UTC(M.y, M.m - 1, M.days, 16));
  var fyEnd = goalFy_(monthEnd), plans = goalPlans_();
  var sub = {}, subOk = true;
  try { sub = mclSubmitted_(M); } catch (err) { subOk = false; Logger.log('mclSubmitted_: %s', err && err.message); }
  var set = mclSettled_(M), ffs = mclFactFinds_(M), chk = mclChecks_(M);
  var ytd = {};
  try { ytd = (fyrFigures_(M.fyFrom) || {}).y || {}; } catch (err) { Logger.log('mclData_ ytd: %s', err && err.message); }
  var mail = {};
  try { (rrbAccessSheet_() || []).forEach(function (p) { var c = goalKey_(p.code); if (c && p.email && p.active) mail[c] = p.email; }); } catch (err) {}
  var hide = (typeof FYR_STILL_COUNTED !== 'undefined') ? FYR_STILL_COUNTED : {};

  var people = [], B = { goal: 0, sub: 0, subApps: 0, set: 0, setApps: 0, ffs: 0, plans: 0, people: 0, checked: 0, onGoal: 0, qGoal: 0, ytd: 0, ytdExp: 0 };
  goalRoster_().forEach(function (r) {
    var P = plans[r.code], d = P && P.plan ? goalDerive_(P.plan) : null;
    var s = sub[r.code] || [0, 0], st = set.by[r.code] || [0, 0], f = ffs[r.code] || { filed: 0, approved: 0 };
    var c = chk[r.code] || { n: 0, contacts: 0, appts: 0, ffs: 0, apps: 0, referrals: 0, reviews: 0, conf: 0 };
    var g = d ? mclGoals_(d, M) : null, y = ytd[r.code] || [0, 0];
    var p = { code: r.code, name: r.name, unit: r.unit, email: mail[r.code] || '', plan: !!d,
              goal: g, sub: { apps: Math.round(s[0] * 10) / 10, api: Math.round(s[1]) }, set: { apps: st[0], api: Math.round(st[1]) },
              ffs: f, checks: c, ytd: { apps: y[0] || 0, api: Math.round(y[1] || 0) },
              ytdExp: d ? goalExpected_(d, fyEnd) : 0, yearGoal: d ? d.api : 0,
              ratios: d ? { ffPerApp: (P.plan.ratios && mclNum_(P.plan.ratios.ffPerApp)) || 2, avgCase: d.avgCase } : null,
              pct: g && g.api ? Math.round(s[1] / g.api * 100) : null, hidden: !!hide[r.code] };
    people.push(p);
    B.people++; if (d) { B.plans++; B.goal += g.api; B.qGoal += g.qApi; B.ytdExp += p.ytdExp; }
    B.sub += p.sub.api; B.subApps += p.sub.apps; B.set += p.set.api; B.setApps += p.set.apps; B.ffs += f.filed; B.ytd += p.ytd.api;
    if (c.n) B.checked++;
    if (p.pct !== null && p.pct >= 100) B.onGoal++;
  });
  /* Places, by submitted API, among those who submitted anything. */
  var ranked = people.filter(function (p) { return p.sub.api > 0; }).sort(function (a, b) { return b.sub.api - a.sub.api; });
  ranked.forEach(function (p, i) { p.rank = i + 1; });
  people.forEach(function (p) { p.of = ranked.length; });
  var out = { ok: true, M: M, people: people, branch: B, honours: mclHonours_(people, M), subOk: subOk, setOk: set.ok,
              at: new Date().toISOString() };
  try { cache.put(ck, JSON.stringify(out), 600); } catch (err) {}
  return out;
}

/* The month's honours. Named advisors only: Javid and Aleema count in the
   totals and are not named, as everywhere on the wall. */
function mclHonours_(people, M) {
  var seen = people.filter(function (p) { return !p.hidden; });
  function top(score, min, fmt, title, why) {
    var best = seen.filter(function (p) { return score(p) > min; }).sort(function (a, b) { return score(b) - score(a); });
    if (!best.length) return null;
    var lead = score(best[0]);
    var tied = best.filter(function (p) { return score(p) === lead; }).map(function (p) { return p.name; });
    return { title: title, names: tied.slice(0, 3), value: fmt(lead), why: why, codes: best.filter(function (p) { return score(p) === lead; }).map(function (p) { return p.code; }) };
  }
  var weeks = Math.max(1, Math.round(M.weeks));
  var h = [
    top(function (p) { return p.sub.api; }, 0, mclMoney_, 'Top producer', 'most API submitted in ' + M.name),
    top(function (p) { return p.set.api; }, 0, mclMoney_, 'Top settled', 'most API settled in ' + M.name),
    top(function (p) { return p.pct || 0; }, 0, function (x) { return x + '%'; }, 'Beat the plan', 'highest share of their own ' + M.name + ' goal'),
    top(function (p) { return p.sub.apps; }, 0, function (x) { return x + ' apps'; }, 'Most applications', 'most apps submitted'),
    top(function (p) { return p.ffs.filed; }, 0, function (x) { return x + ' fact finds'; }, 'Fact-find leader', 'most fact finds filed')
  ].filter(Boolean);
  var steady = seen.filter(function (p) { return p.checks.n >= weeks; });
  if (steady.length) h.push({ title: 'Every week checked in', names: steady.map(function (p) { return p.name; }), codes: steady.map(function (p) { return p.code; }),
                              value: steady.length + ' advisor' + (steady.length === 1 ? '' : 's'), why: 'a check-in every week of ' + M.name });
  return h;
}

/* The sentences. Facts from the numbers, in the advisor's own terms; never advice. */
function mclInsights_(p, D) {
  var M = D.M, g = p.goal, out = [];
  if (g && g.api) {
    if (p.sub.api >= g.api) out.push('You submitted <b>' + mclMoney_(p.sub.api) + '</b>, ' + (p.pct) + '% of your ' + M.name + ' goal of ' + mclMoney_(g.api) + ': <b>' + mclMoney_(p.sub.api - g.api) + ' ahead</b> of your own plan.');
    else out.push('You submitted <b>' + mclMoney_(p.sub.api) + '</b> against your ' + M.name + ' goal of ' + mclMoney_(g.api) + ' (' + (p.pct || 0) + '%), <b>' + mclMoney_(g.api - p.sub.api) + ' short</b>.');
    var left = 2 - M.inQ, qDone = mclQuarterDone_(p, D);
    if (left > 0) {
      var need = Math.max(0, g.qApi - qDone) / left;
      out.push('Your Q' + (M.q + 1) + ' plan is ' + mclMoney_(g.qApi) + '. With ' + mclMoney_(qDone) + ' in, ' + (need > 0 ? '<b>each of the next ' + (left === 1 ? 'month' : left + ' months') + ' needs ' + mclMoney_(need) + '</b>.' : 'the quarter is already made.'));
    }
  } else out.push('You have no filed flight plan, so this month has no goal to measure against. File it at factfind360.com/goals.');
  if (p.set.api) out.push('<b>' + mclMoney_(p.set.api) + '</b> settled in ' + M.name + ' across ' + p.set.apps + ' polic' + (p.set.apps === 1 ? 'y' : 'ies') + '.');
  else out.push('Nothing settled under your number in ' + M.name + '.');
  if (p.ffs.filed) {
    var r = p.sub.apps ? Math.round(p.sub.apps / p.ffs.filed * 100) : 0;
    out.push(p.ffs.filed + ' fact find' + (p.ffs.filed === 1 ? '' : 's') + ' filed' + (g ? ' (your plan asks about ' + Math.round(g.ffs) + ')' : '') + (p.sub.apps ? '; ' + r + ' apps for every 100 fact finds' : '') + '.');
  } else out.push('No fact finds filed in ' + M.name + (g && g.ffs ? '; your plan asks about ' + Math.round(g.ffs) + '.' : '.'));
  if (p.sub.apps && p.ratios) {
    var avg = Math.round(p.sub.api / p.sub.apps);
    out.push('Average case ' + mclMoney_(avg) + ' against the ' + mclMoney_(p.ratios.avgCase) + ' your plan is built on' + (avg >= p.ratios.avgCase ? '.' : ', so the plan needs more apps at this size.'));
  }
  var weeks = Math.max(1, Math.round(M.weeks));
  out.push(p.checks.n ? 'You checked in ' + p.checks.n + ' of ' + weeks + ' weeks: ' + p.checks.contacts + ' contacts and ' + p.checks.appts + ' appointments logged' + (g ? ' against the ' + g.contacts + ' and ' + Math.round(g.appts) + ' your plan asks.' : '.')
                      : 'No weekly check-ins in ' + M.name + ', so your plan cannot see your activity.');
  if (p.yearGoal) out.push('Year to date <b>' + mclMoney_(p.ytd.api) + '</b>, ' + Math.round(p.ytd.api / p.yearGoal * 100) + '% of your ' + mclK_(p.yearGoal) + ' FY27 goal; your plan has you at ' + mclMoney_(p.ytdExp) + ' by now.');
  if (p.rank) out.push('<b>' + mclOrd_(p.rank) + ' of ' + p.of + '</b> in the branch on API submitted in ' + M.name + '.');
  return out;
}

function mclOrd_(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

/* The quarter so far for one advisor: this month plus the earlier months of
   the quarter, read from the close-out tab where those months were recorded. */
function mclQuarterDone_(p, D) {
  var M = D.M, done = p.sub.api;
  if (M.inQ === 0) return done;
  try {
    var rows = goalRows_(mclTab_(), MCL_COLS);
    for (var i = 1; i <= M.inQ; i++) {
      var y = M.m - i > 0 ? M.y : M.y - 1, m = ((M.m - i - 1 + 12) % 12) + 1, ym = y + '-' + mclPad_(m);
      var row = rows.filter(function (r) { return String(r.Month) === ym && goalKey_(r.Code) === p.code; })[0];
      if (row) done += mclNum_(row['Submitted API']);
    }
  } catch (err) {}
  return done;
}

/* ── the tab ───────────────────────────────────────────────────────────── */

function mclTab_() {
  var sh = goalTab_(MCL_TAB, MCL_COLS);
  /* The month is text: Sheets would otherwise turn 2026-10 into a date. */
  if (sh.getRange(2, 1).getNumberFormat() !== '@') sh.getRange('A:A').setNumberFormat('@');
  return sh;
}
function mclRowsFor_(ym) {
  return goalRows_(mclTab_(), MCL_COLS).filter(function (r) { return String(r.Month instanceof Date ? Utilities.formatDate(r.Month, MCL_TZ, 'yyyy-MM') : r.Month) === ym; });
}

/* ── the e-mails ───────────────────────────────────────────────────────── */

function mclTile_(label, big, sub, color) {
  return '<td style="padding:4px" valign="top"><div style="background:#F6F8FB;border:1px solid #E2E8F0;border-radius:12px;padding:12px 14px">' +
    '<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#64748B">' + label + '</div>' +
    '<div style="font-size:22px;font-weight:800;color:' + (color || '#0F172A') + ';margin-top:2px">' + big + '</div>' +
    (sub ? '<div style="font-size:12.5px;color:#64748B;margin-top:2px">' + sub + '</div>' : '') + '</div></td>';
}

function mclBar_(label, done, want) {
  var pct = want ? Math.min(100, Math.round(done / want * 100)) : 0, ok = want && done >= want;
  return '<tr><td style="padding:5px 0;font-size:13.5px;width:28%">' + label + '</td>' +
    '<td style="padding:5px 8px;width:46%"><div style="background:#E2E8F0;border-radius:6px;height:10px"><div style="width:' + pct + '%;height:10px;border-radius:6px;background:' + (ok ? '#059669' : '#0E7490') + '"></div></div></td>' +
    '<td style="padding:5px 0;font-size:13.5px;text-align:right;white-space:nowrap"><b>' + done + '</b>' + (want ? ' of ' + want : '') + '</td></tr>';
}

function mclBarPct_(label, pct, text) {
  return '<tr><td style="padding:5px 0;font-size:13.5px;width:28%">' + label + '</td>' +
    '<td style="padding:5px 8px;width:46%"><div style="background:#E2E8F0;border-radius:6px;height:10px"><div style="width:' + Math.min(100, pct) + '%;height:10px;border-radius:6px;background:' + (pct >= 100 ? '#059669' : '#0E7490') + '"></div></div></td>' +
    '<td style="padding:5px 0;font-size:13.5px;text-align:right;white-space:nowrap"><b>' + text + '</b></td></tr>';
}

function mclShell_(inner, preview) {
  return '<div style="background:#EEF2F7;padding:18px 8px;font:15px/1.55 -apple-system,Segoe UI,Arial,sans-serif;color:#0F172A">' +
    '<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0">' +
    (preview ? '<div style="background:#FEF3C7;color:#92400E;padding:8px 18px;font-size:13px"><b>PREVIEW</b> &middot; sent to you only. Nothing is recorded.</div>' : '') +
    inner +
    '<div style="padding:14px 22px;color:#94A3B8;font-size:11.5px;border-top:1px solid #E2E8F0">Ricky Rampersad Branch &middot; Guardian Life of the Caribbean Limited. ' +
    'Submitted is production picked up in Salesforce (new business and increases), settled is the settlement tab, goals are your own FY27 flight plan. Confidential, for the named recipient.</div></div></div>';
}

function mclHonoursHtml_(H, p) {
  if (!H.length) return '';
  return '<div style="padding:4px 22px 6px"><div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#B45309;margin:10px 0 6px">The branch&rsquo;s honours</div>' +
    H.map(function (h) {
      var mine = p && h.codes && h.codes.indexOf(p.code) > -1;
      return '<div style="padding:7px 10px;border-radius:10px;margin:0 0 5px;background:' + (mine ? '#FEF3C7' : '#F8FAFC') + ';border:1px solid ' + (mine ? '#F59E0B' : '#E2E8F0') + '">' +
        '<b>' + mclEsc_(h.title) + '</b> &middot; ' + mclEsc_(h.names.join(', ')) + ' <span style="color:#64748B">&middot; ' + mclEsc_(h.value) + '</span>' + (mine ? ' &nbsp;<b style="color:#B45309">That&rsquo;s you.</b>' : '') + '</div>';
    }).join('') + '</div>';
}

function mclAdvisorHtml_(p, D, opts) {
  var M = D.M, g = p.goal, first = mclFirst_(p.name), link = MCL_PAGE + '?m=' + M.ym;
  var mine = D.honours.filter(function (h) { return h.codes && h.codes.indexOf(p.code) > -1; });
  var head = mine.length ? 'Congratulations, ' + mclEsc_(first) + ': ' + mclEsc_(mine[0].title.toLowerCase()) + ' for ' + M.name + '.'
           : p.pct !== null && p.pct >= 100 ? mclEsc_(first) + ', you beat your ' + M.name + ' plan.'
           : mclEsc_(first) + ', ' + M.name + ' is closed. Here is your month.';
  var reminder = opts && opts.remind;
  var tiles = '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    mclTile_('Submitted', mclK_(p.sub.api), p.sub.apps + ' apps' + (g && g.api ? ' &middot; ' + (p.pct || 0) + '% of goal' : ''), p.pct >= 100 ? '#059669' : '#0F172A') +
    mclTile_('Settled', mclK_(p.set.api), p.set.apps + ' polic' + (p.set.apps === 1 ? 'y' : 'ies')) + '</tr><tr>' +
    mclTile_(M.short + ' goal', g ? mclK_(g.api) : '&mdash;', g ? 'from your flight plan' : 'no plan filed') +
    mclTile_('Year to date', mclK_(p.ytd.api), p.yearGoal ? Math.round(p.ytd.api / p.yearGoal * 100) + '% of ' + mclK_(p.yearGoal) : '') + '</tr></table>';
  var bars = g ? '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px">' +
      mclBarPct_('API submitted', p.pct || 0, mclK_(p.sub.api) + ' of ' + mclK_(g.api)) +
      mclBar_('Applications', p.sub.apps, Math.ceil(g.apps)) +
      mclBar_('Fact finds', p.ffs.filed, Math.ceil(g.ffs)) +
      mclBar_('Appointments', p.checks.appts, Math.ceil(g.appts)) +
      mclBar_('Contacts', p.checks.contacts, g.contacts) + '</table>' : '';
  var ins = mclInsights_(p, D).map(function (s) { return '<li style="margin:0 0 6px">' + s + '</li>'; }).join('');
  var inner =
    '<div style="background:linear-gradient(135deg,#0B2545,#13315C);color:#fff;padding:22px">' +
      '<div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#93C5FD">' + (reminder ? 'Reminder &middot; ' : '') + M.name + ' ' + M.y + ' &middot; month close-out</div>' +
      '<div style="font-size:23px;font-weight:800;margin-top:6px;line-height:1.25">' + head + '</div></div>' +
    (reminder ? '<div style="padding:12px 22px 0;color:#B45309"><b>Your ' + M.name + ' close-out is still open.</b> It takes three minutes and sets your ' + M.nextName + ' commitment.</div>' : '') +
    '<div style="padding:14px 18px 2px">' + tiles + '</div>' +
    (bars ? '<div style="padding:4px 22px"><div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#64748B;margin:8px 0 2px">Against your plan</div>' + bars + '</div>' : '') +
    '<div style="padding:4px 22px"><div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#64748B;margin:12px 0 6px">What the numbers say</div><ul style="margin:0;padding-left:18px">' + ins + '</ul></div>' +
    mclHonoursHtml_(D.honours, p) +
    '<div style="padding:16px 22px 22px;text-align:center">' +
      '<a href="' + link + '" style="display:inline-block;background:#0E7490;color:#fff;text-decoration:none;font-weight:800;padding:13px 26px;border-radius:12px;font-size:16px">Close out ' + M.name + ' &rarr;</a>' +
      '<div style="color:#64748B;font-size:13px;margin-top:8px">Rate the month, name your win and what got in the way, and commit to ' + M.nextName + '. About three minutes.</div></div>';
  return mclShell_(inner, opts && opts.preview);
}

function mclManagerHtml_(D, opts) {
  var M = D.M, B = D.branch, rows = mclRowsFor_(M.ym), closed = {};
  rows.forEach(function (r) { if (r['Closed At']) closed[goalKey_(r.Code)] = r; });
  var cell = 'padding:6px 8px;border-bottom:1px solid #E2E8F0;font-size:13px;';
  var list = D.people.slice().sort(function (a, b) { return b.sub.api - a.sub.api; }).map(function (p) {
    var c = closed[p.code];
    return '<tr><td style="' + cell + '">' + mclEsc_(p.name) + '</td><td style="' + cell + 'text-align:right">' + (p.goal ? mclK_(p.goal.api) : '<span style="color:#B45309">no plan</span>') + '</td>' +
      '<td style="' + cell + 'text-align:right"><b>' + mclK_(p.sub.api) + '</b></td><td style="' + cell + 'text-align:right;color:' + (p.pct >= 100 ? '#059669' : '#0F172A') + '">' + (p.pct === null ? '' : p.pct + '%') + '</td>' +
      '<td style="' + cell + 'text-align:right">' + mclK_(p.set.api) + '</td><td style="' + cell + 'text-align:right">' + p.sub.apps + '</td><td style="' + cell + 'text-align:right">' + p.ffs.filed + '</td>' +
      '<td style="' + cell + 'text-align:center">' + p.checks.n + '</td><td style="' + cell + 'text-align:center">' + (c ? (c.Rating ? c.Rating + '&#9733; ' : '&#10003; ') + (c['Next API'] ? mclK_(c['Next API']) : '') : (p.email ? '<span style="color:#B45309">open</span>' : '<span style="color:#94A3B8">no e-mail</span>')) + '</td></tr>';
  }).join('');
  var commit = rows.reduce(function (a, r) { return a + mclNum_(r['Next API']); }, 0);
  var nClosed = Object.keys(closed).length;
  var pct = B.goal ? Math.round(B.sub / B.goal * 100) : 0;
  var inner = '<div style="background:linear-gradient(135deg,#0B2545,#13315C);color:#fff;padding:22px">' +
      '<div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#93C5FD">' + M.name + ' ' + M.y + ' &middot; the branch, closed</div>' +
      '<div style="font-size:23px;font-weight:800;margin-top:6px">' + mclMoney_(B.sub) + ' submitted, ' + pct + '% of the ' + mclMoney_(B.goal) + ' the plans asked</div></div>' +
    '<div style="padding:14px 18px 2px"><table width="100%" cellpadding="0" cellspacing="0"><tr>' +
      mclTile_('Submitted', mclK_(B.sub), Math.round(B.subApps) + ' apps') + mclTile_('Settled', mclK_(B.set), B.setApps + ' policies') + '</tr><tr>' +
      mclTile_('Beat their plan', B.onGoal + ' of ' + B.plans, 'advisors with a filed plan') + mclTile_('Fact finds', B.ffs, B.checked + ' advisors checked in') + '</tr><tr>' +
      mclTile_('Closed out', nClosed + ' of ' + rows.length, 'e-mails sent') + mclTile_(M.nextName + ' committed', mclK_(commit), 'so far, from the close-outs') + '</tr></table></div>' +
    mclHonoursHtml_(D.honours, null) +
    '<div style="padding:8px 14px 18px"><table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">' +
      '<tr style="background:#0F172A;color:#fff;font-size:12px"><th style="padding:6px 8px;text-align:left">Advisor</th><th style="padding:6px 8px;text-align:right">' + M.short + ' goal</th><th style="padding:6px 8px;text-align:right">Submitted</th><th style="padding:6px 8px;text-align:right">Of goal</th><th style="padding:6px 8px;text-align:right">Settled</th><th style="padding:6px 8px;text-align:right">Apps</th><th style="padding:6px 8px;text-align:right">FFs</th><th style="padding:6px 8px">Check-ins</th><th style="padding:6px 8px">Close-out</th></tr>' + list + '</table></div>' +
    (!D.subOk ? '<div style="padding:0 22px 14px;color:#B91C1C">Salesforce did not answer, so submitted shows zero. Run mclCheck.</div>' : '') +
    (!D.setOk ? '<div style="padding:0 22px 14px;color:#B91C1C">The settlement tab could not be read, so settled shows zero.</div>' : '');
  return mclShell_(inner, opts && opts.preview);
}

function mclBranchTo_() {
  try { return String((MAIL_CONFIG && MAIL_CONFIG.branchManager) || '').trim() || Session.getEffectiveUser().getEmail(); }
  catch (e) { return Session.getEffectiveUser().getEmail(); }
}

/* The advisor's unit manager, copied on their close-out. */
function mclUnitManagers_() {
  var out = {};
  try {
    (rrbAccessSheet_() || []).forEach(function (p) {
      if (p.active && p.email && /unit manager/i.test(String(p.role || ''))) out[String(p.unit || '').trim().toLowerCase()] = p.email;
    });
  } catch (e) {}
  return out;
}

/* ── sending ───────────────────────────────────────────────────────────── */

/* how: 'timer' sends only advisors not yet sent this month; 'now' sends
   everyone with an e-mail again on purpose; 'remind' only the open ones;
   'preview' three advisors and the summary to whoever runs it, recording
   nothing. */
function mclSend_(ym, how) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('Another send is running.'); return; }
  try {
    var D = mclData_(ym, how !== 'remind'), M = D.M, preview = how === 'preview';
    var me = Session.getEffectiveUser().getEmail(), bm = mclBranchTo_(), ums = mclUnitManagers_();
    var sh = mclTab_(), rows = mclRowsFor_(ym), byCode = {};
    rows.forEach(function (r) { byCode[goalKey_(r.Code)] = r; });
    var sent = 0, skipped = [], list = D.people.slice();
    if (preview) list = list.filter(function (p) { return p.plan; }).sort(function (a, b) { return b.sub.api - a.sub.api; }).slice(0, 3);
    list.forEach(function (p) {
      var had = byCode[p.code];
      if (!p.email) { skipped.push(p.name + ' (no e-mail on the Access tab)'); return; }
      if (how === 'timer' && had && had['Sent At']) return;
      if (how === 'remind' && (!had || had['Closed At'] || had['Reminded At'])) return;
      if (MailApp.getRemainingDailyQuota() < 3) { skipped.push(p.name + ' (daily e-mail allowance used up)'); return; }
      var remind = how === 'remind';
      var msg = { to: preview ? me : p.email, name: MCL_FROM_NAME, replyTo: bm,
        subject: (preview ? '[PREVIEW] ' : remind ? 'Reminder: ' : '') + M.name + ' closed: ' + mclMoney_(p.sub.api) + ' submitted' +
                 (p.goal && p.goal.api ? ', ' + (p.pct || 0) + '% of your goal' : '') + ' — close out your month',
        htmlBody: mclAdvisorHtml_(p, D, { preview: preview, remind: remind }) };
      var um = ums[String(p.unit || '').trim().toLowerCase()];
      if (!preview && um && um !== p.email) msg.cc = um;
      MailApp.sendEmail(msg); sent++;
      if (preview) return;
      var now = new Date();
      if (remind) { sh.getRange(had._row, MCL_COLS.indexOf('Reminded At') + 1).setValue(now); return; }
      var fig = { goal: p.goal, sub: p.sub, set: p.set, ffs: p.ffs, checks: p.checks, ytd: p.ytd, ytdExp: p.ytdExp, rank: p.rank, of: p.of };
      var row = [M.ym, p.code, p.name, p.unit, p.email, now, '', had ? had['Closed At'] : '',
        p.goal ? p.goal.api : '', p.sub.api, p.sub.apps, p.set.api, p.set.apps, p.ffs.filed, p.pct === null ? '' : p.pct];
      if (had) { sh.getRange(had._row, 1, 1, row.length).setValues([row]); sh.getRange(had._row, MCL_COLS.indexOf('Figures JSON') + 1).setValue(JSON.stringify(fig)); }
      else { var full = row.concat(['', '', '', '', '', '', '', '', '', JSON.stringify(fig), '']); sh.appendRow(full); }
    });
    /* The branch manager's summary goes with the first send and with the reminder. */
    if (how !== 'timer' || sent) {
      MailApp.sendEmail({ to: preview ? me : bm, name: MCL_FROM_NAME,
        subject: (preview ? '[PREVIEW] ' : '') + M.name + ' closed — branch ' + mclMoney_(D.branch.sub) + ' submitted, ' + mclMoney_(D.branch.set) + ' settled' + (how === 'remind' ? ' (close-outs still open)' : ''),
        htmlBody: mclManagerHtml_(D, { preview: preview }) });
    }
    try { CacheService.getScriptCache().remove('mcl_wall'); } catch (e) {}
    Logger.log('%s %s: %s e-mail(s) to advisors.%s', how, ym, String(sent), skipped.length ? ' Not sent: ' + skipped.join('; ') : '');
  } finally { lock.releaseLock(); }
}

/* ── the editor's buttons ──────────────────────────────────────────────── */

function mclCheck() {
  var ym = mclLastMonth_(), D = mclData_(ym, true), B = D.branch;
  Logger.log('%s: %s advisors on the roster, %s with a flight plan, %s with an e-mail.', D.M.name, String(B.people), String(B.plans),
    String(D.people.filter(function (p) { return p.email; }).length));
  Logger.log('Submitted (Salesforce): %s, %s apps%s', mclMoney_(B.sub), String(B.subApps), D.subOk ? '' : '  <-- Salesforce did not answer');
  Logger.log('Settled (settlement tab): %s, %s policies%s', mclMoney_(B.set), String(B.setApps), D.setOk ? '' : '  <-- tab not found');
  Logger.log('Plans asked for %s: %s. Beat their plan: %s. Fact finds filed: %s.', D.M.name, mclMoney_(B.goal), String(B.onGoal), String(B.ffs));
  D.honours.forEach(function (h) { Logger.log('Honour: %s - %s (%s)', h.title, h.names.join(', '), h.value); });
  var none = D.people.filter(function (p) { return !p.email; }).map(function (p) { return p.name; });
  if (none.length) Logger.log('No e-mail on the Access tab, so no close-out: %s', none.join(', '));
  Logger.log('Close-out page reads this file: %s', String(doGet).indexOf('mclMe_') > -1 ? 'yes' : 'NO - MonthClose is not the last file');
}
function mclPreview()     { mclSend_(mclLastMonth_(), 'preview'); }
function mclSendOctober() { mclSend_('2026-10', 'now'); }
function mclSendNow()     { mclSend_(mclLastMonth_(), 'now'); }
function mclRemindNow()   { mclSend_(mclLastMonth_(), 'remind'); }

function mclSetup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'mclTick') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('mclTick').timeBased().everyDays(1).atHour(7).nearMinute(30).inTimezone(MCL_TZ).create();
  mclTab_();
  Logger.log('Month close: every day about 7:30 it checks the date. Working day %s sends last month\'s close-out; working day %s reminds and sends you the list.',
    String(MCL_SEND_ON_WORKDAY), String(MCL_REMIND_ON_WORKDAY));
}

function mclTick() {
  var n = mclWorkdayNo_(mclToday_()), ym = mclLastMonth_();
  if (n === MCL_SEND_ON_WORKDAY) mclSend_(ym, 'timer');
  else if (n === MCL_REMIND_ON_WORKDAY) mclSend_(ym, 'remind');
}

/* ── the close-out page ────────────────────────────────────────────────── */

function mclMe_(e) {
  var me = goalWho_(e.parameter.token);
  if (!me) return RRB_EXPIRED;
  var ym = /^\d{4}-\d{2}$/.test(String(e.parameter.m || '')) ? String(e.parameter.m) : mclLastMonth_();
  var D = mclData_(ym), code = me.key;
  if (e.parameter.code && goalInScope_(me, goalKey_(e.parameter.code))) code = goalKey_(e.parameter.code);
  var p = D.people.filter(function (x) { return x.code === code; })[0];
  if (!p) return { ok: false, error: 'You are not on the branch roster for ' + D.M.name + '.' };
  var row = mclRowsFor_(ym).filter(function (r) { return goalKey_(r.Code) === code; })[0], answers = null;
  if (row && row['Answers JSON']) { try { answers = JSON.parse(String(row['Answers JSON'])); } catch (err) {} }
  return { ok: true, v: 'mcl1', month: { ym: ym, name: D.M.name, y: D.M.y, next: D.M.nextName }, me: { name: p.name, code: p.code },
    p: { goal: p.goal, sub: p.sub, set: p.set, ffs: p.ffs, checks: p.checks, ytd: p.ytd, ytdExp: p.ytdExp, yearGoal: p.yearGoal, pct: p.pct, rank: p.rank, of: p.of },
    insights: mclInsights_(p, D).map(function (s) { return s.replace(/<\/?b>/g, ''); }),
    honours: D.honours.map(function (h) { return { title: h.title, names: h.names, value: h.value, mine: !!(h.codes && h.codes.indexOf(p.code) > -1) }; }),
    branch: { sub: D.branch.sub, goal: D.branch.goal, set: D.branch.set },
    nextGoal: mclNextGoal_(p, D), help: MCL_HELP, answers: answers, closedAt: row && row['Closed At'] ? goalStamp_(row['Closed At']) : '' };
}

/* What next month asks, from the plan, so the commitment starts there. */
function mclNextGoal_(p, D) {
  var N = mclMonth_(D.M.next), plans = goalPlans_(), P = plans[p.code];
  if (!P || !P.plan) return null;
  var d = goalDerive_(P.plan), g = mclGoals_(d, N);
  var left = 2 - D.M.inQ;
  var need = left > 0 ? Math.max(0, g.qApi - mclQuarterDone_(p, D)) / left : g.api;
  return { api: Math.round(Math.max(g.api, need) / 1000) * 1000, plan: g.api, apps: Math.ceil(g.apps), ffs: Math.ceil(g.ffs), apptWeek: Math.ceil(d.apptWeek) };
}

function mclSave_(data) {
  var me = goalWho_(data.token);
  if (!me) return RRB_EXPIRED;
  if (!me.key) return { ok: false, error: 'Your sign-in has no agent number.' };
  var ym = String(data.m || '');
  if (!/^\d{4}-\d{2}$/.test(ym)) return { ok: false, error: 'Which month?' };
  if (ym > mclToday_().slice(0, 7) || ym < '2026-10') return { ok: false, error: 'That month cannot be closed out.' };
  var a = data.answers;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { a = null; } }
  if (!a || typeof a !== 'object') return { ok: false, error: 'No answers arrived.' };
  var s = JSON.stringify(a);
  if (s.length > 12000) return { ok: false, error: 'That is too long. Shorten the written answers.' };
  var rating = Math.min(5, Math.max(1, Math.round(mclNum_(a.rating)) || 0));
  if (!mclNum_(a.rating)) return { ok: false, error: 'Rate the month first.' };
  if (!String(a.win || '').trim()) return { ok: false, error: 'Name one win from the month.' };
  if (!(mclNum_(a.nextApi) > 0)) return { ok: false, error: 'Set your API commitment for next month.' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return { ok: false, error: 'The sheet is busy. Try again in a moment.' }; }
  try {
    var sh = mclTab_(), had = mclRowsFor_(ym).filter(function (r) { return goalKey_(r.Code) === me.key; })[0], now = new Date();
    var tail = [rating, String(a.win || '').slice(0, 1000), String(a.obstacle || '').slice(0, 1000), String(a.differently || '').slice(0, 1000),
      Math.round(mclNum_(a.nextApi)), Math.round(mclNum_(a.nextApps)), Math.round(mclNum_(a.nextFfs)), Math.round(mclNum_(a.nextAppts)),
      [].concat(a.help || []).join(', ').slice(0, 300) + (a.helpText ? ' — ' + String(a.helpText).slice(0, 500) : '')];
    var at = MCL_COLS.indexOf('Rating') + 1;
    if (had) {
      sh.getRange(had._row, MCL_COLS.indexOf('Closed At') + 1).setValue(now);
      sh.getRange(had._row, at, 1, tail.length).setValues([tail]);
      sh.getRange(had._row, MCL_COLS.indexOf('Answers JSON') + 1).setValue(s);
    } else {
      sh.appendRow([ym, me.key, me.name || '', me.unit || '', '', '', '', now, '', '', '', '', '', '', ''].concat(tail, ['', s]));
    }
    try { CacheService.getScriptCache().remove('mcl_wall'); } catch (e) {}
    return { ok: true, closedAt: now.toISOString(), updated: !!(had && had['Closed At']) };
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

/* ── the wall's month in review ────────────────────────────────────────── */

/* Counts and names, no money from a person's plan beyond what the wall
   already shows (each advisor's API goal and progress). Cached half an hour. */
function mclWall_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('mcl_wall');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var ym = mclLastMonth_(), M = mclMonth_(ym);
  if (M.idx < 0) return null;
  var D = mclData_(ym), rows = mclRowsFor_(ym), commit = 0, closed = 0, ratings = [];
  rows.forEach(function (r) { if (r['Closed At']) { closed++; commit += mclNum_(r['Next API']); if (r.Rating) ratings.push(mclNum_(r.Rating)); } });
  var named = D.people.filter(function (p) { return !p.hidden; });
  var out = { ym: ym, name: M.name, next: M.nextName,
    branch: { sub: D.branch.sub, subApps: Math.round(D.branch.subApps), set: D.branch.set, setApps: D.branch.setApps, goal: D.branch.goal,
              ffs: D.branch.ffs, onGoal: D.branch.onGoal, plans: D.branch.plans, people: D.branch.people },
    honours: D.honours.map(function (h) { return { title: h.title, names: h.names, value: h.value, why: h.why }; }),
    beat: named.filter(function (p) { return p.pct !== null && p.pct >= 100; }).sort(function (a, b) { return b.pct - a.pct; })
               .map(function (p) { return { name: p.name, pct: p.pct }; }),
    closed: closed, sent: rows.filter(function (r) { return r['Sent At']; }).length, commit: commit,
    rating: ratings.length ? Math.round(ratings.reduce(function (a, b) { return a + b; }, 0) / ratings.length * 10) / 10 : null };
  try { cache.put('mcl_wall', JSON.stringify(out), 1800); } catch (e) {}
  return out;
}
