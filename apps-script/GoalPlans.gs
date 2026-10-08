/**
 * GoalPlans.gs — FY27 flight plans: every advisor's goals for the year, and
 * a weekly check-in against them.
 *
 * WHAT WAS ASKED
 *   8 October 2026, the day before the branch's FY27 blastoff: managers and
 *   agents submit their goal plans for the year that began 1 October 2026,
 *   "starting with their budget, income and expenses, how they intend to work",
 *   tracked weekly, shown back to them when they sign in, so the branch
 *   manager knows each week what the API and FYC projections are.
 *
 * WHAT IT KEEPS
 *   Three tabs in the fact-find workbook, made on first use:
 *     FY27 Goal Plans   one row per advisor: the plan's headline numbers in
 *                       columns anyone can read, and the whole plan as JSON
 *     FY27 Check-ins    one row per advisor per week
 *     FY27 Projections  one row per week, written by the Monday e-mail: what
 *                       the plans commit the branch to, and the pace
 *   An advisor sees their own plan. A unit manager sees their units' plans,
 *   the branch manager every plan. goals.html says so before anyone starts.
 *   The branch wall shows every advisor's API goal and their progress against
 *   it - the race to finish first, asked for on 8 October 2026 - and nothing
 *   else from a plan: no budget, no income, no written answer.
 *
 * WHERE THE OTHER NUMBERS COME FROM
 *   FY27 to date: fyrFigures_ (FinancialYear.gs) - production picked up,
 *   new business and increases, as the wall counts it. FY26: the same two
 *   Salesforce objects over 1 Oct 2025 - 30 Sep 2026, with first-year
 *   commission from FYC_Annual__c. The branch's FYC-to-API ratio, an
 *   advisor's own ratio and average case size are read from FY26 and offered
 *   as starting points; the advisor can change every one.
 *
 * PUT IT IN
 *   1. + next to Files > Script, name it GoalPlans, paste this file. It must
 *      sit below ClientEmails and SafeButtons in the list (last is safest).
 *   2. Run goalCheck: it says whether the doors are wired and reads FY26.
 *   3. Deploy > Manage deployments > the deployment ending ...JsrAxxJ3dsQ >
 *      pencil > Version: New version > Deploy.
 *   4. Run goalSetup for the Monday morning projections e-mail.
 *
 * Every name here starts with goal, so nothing collides with the project.
 */

var GOAL_TAB_PLANS  = 'FY27 Goal Plans';
var GOAL_TAB_CHECKS = 'FY27 Check-ins';
var GOAL_TAB_HISTORY = 'FY27 Projections';
var GOAL_FY_FROM    = '2026-10-01';          // used only if FinancialYear.gs is missing
var GOAL_FY_LABEL   = 'FY27';
var GOAL_TZ         = 'America/Port_of_Spain';
var GOAL_DIGEST_TO  = '';                    // blank: the branch manager in MAIL_CONFIG
var GOAL_DIGEST_AT  = { day: 'MONDAY', hour: 7 };

var GOAL_PLAN_COLS = ['Code', 'Name', 'Unit', 'Submitted At', 'Updated At', 'API Goal', 'FYC Goal',
  'Income Goal', 'Apps Goal', 'Contacts / wk', 'Appointments / wk', 'Fact finds / wk', 'Apps / wk',
  'Q1 API', 'Q2 API', 'Q3 API', 'Q4 API', 'Title Goal', 'Plan JSON'];
var GOAL_CHECK_COLS = ['Code', 'Name', 'Week', 'Week Of', 'Saved At', 'Contacts', 'Appointments',
  'Fact finds', 'Apps', 'API Submitted', 'Referrals', 'Reviews', 'Booked Next Week', 'Confidence',
  'Win', 'In The Way', 'Help', 'Check-in JSON'];
var GOAL_HISTORY_COLS = ['Week', 'Taken At', 'Advisors', 'Plans', 'Committed API', 'Committed FYC',
  'Picked Up', 'Plans By Today', 'Pace API', 'Pace FYC', 'Checked In Last Week'];

/* ── the doors ─────────────────────────────────────────────────────────── */

var GOAL_PREV_SUBMIT_ = (typeof ffProcessAgentSubmit === 'function') ? ffProcessAgentSubmit : null;
ffProcessAgentSubmit = function (data) {
  var st = data && data.stage;
  if (st === 'goal_save' || st === 'goal_checkin') {
    var out;
    try { out = st === 'goal_save' ? goalSave_(data) : goalCheckin_(data); }
    catch (err) {
      Logger.log('%s failed: %s', st, (err && err.stack) || err);
      out = { ok: false, error: 'Nothing was saved: ' + ((err && err.message) || err) };
    }
    return _ffJson(out);
  }
  if (!GOAL_PREV_SUBMIT_) return _ffJson({ ok: false, error: 'Server set-up: GoalPlans must be the last file in the project.' });
  return GOAL_PREV_SUBMIT_(data);
};

var GOAL_PREV_DOGET_ = (typeof doGet === 'function') ? doGet : null;
if (GOAL_PREV_DOGET_) doGet = function (e) {
  var a = (e && e.parameter && e.parameter.action) || '';
  if (a === 'goal_me' || a === 'goal_team' || a === 'goal_view' || a === 'goal_board' || a === 'goal_wall') {
    var out;
    try {
      out = a === 'goal_me' ? goalMe_(e) : a === 'goal_team' ? goalTeam_(e)
          : a === 'goal_view' ? goalView_(e) : a === 'goal_wall' ? goalWall_(e) : goalBoard_(e);
    } catch (err) {
      Logger.log('%s failed: %s', a, (err && err.stack) || err);
      out = { ok: false, error: String((err && err.message) || err) };
    }
    /* A copy: RRB_EXPIRED is shared, and must not carry this file's mark. */
    var res = { v: 'goal1' };
    Object.keys(out || {}).forEach(function (k) { res[k] = out[k]; });
    return _ffJson(res);
  }
  return GOAL_PREV_DOGET_(e);
};

/* ── the year ──────────────────────────────────────────────────────────── */

function goalDay_(d) { return Utilities.formatDate(d || new Date(), GOAL_TZ, 'yyyy-MM-dd'); }
function goalUtc_(iso) { var p = String(iso).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
function goalIso_(t) { return new Date(t).toISOString().slice(0, 10); }

/* The year we are in, its week and how much of it has gone. Week 1 is the
   week of the first Monday on or after the year began: 5 October 2026. */
function goalFy_(now) {
  var from = (typeof fyrFrom_ === 'function') ? fyrFrom_(now || new Date()) : GOAL_FY_FROM;
  var label = (typeof fyrLabel_ === 'function') ? fyrLabel_(from) : GOAL_FY_LABEL;
  var f = goalUtc_(from), to = Date.UTC(new Date(f).getUTCFullYear() + 1, new Date(f).getUTCMonth(), 1) - 864e5;
  var today = goalUtc_(goalDay_(now)), fwd = new Date(f).getUTCDay() || 7;
  var mon1 = f + ((8 - fwd) % 7) * 864e5;
  var tw = new Date(today).getUTCDay() || 7, monT = today - (tw - 1) * 864e5;
  var week = Math.max(1, Math.floor((monT - mon1) / (7 * 864e5)) + 1);
  var days = (to - f) / 864e5 + 1, gone = Math.max(0, Math.min(days, (today - f) / 864e5 + 1));
  /* The quarters, and how far into each the day is. */
  var qs = [];
  for (var i = 0; i < 4; i++) {
    var qf = Date.UTC(new Date(f).getUTCFullYear(), new Date(f).getUTCMonth() + i * 3, 1);
    var qt = Date.UTC(new Date(f).getUTCFullYear(), new Date(f).getUTCMonth() + i * 3 + 3, 1) - 864e5;
    var qd = (qt - qf) / 864e5 + 1;
    qs.push({ from: goalIso_(qf), to: goalIso_(qt), days: qd,
              gone: Math.max(0, Math.min(qd, (today - qf) / 864e5 + 1)) });
  }
  return { label: label, from: from, to: goalIso_(to), today: goalIso_(today), week: week,
           weekKey: label + '-W' + ('0' + week).slice(-2),
           weekOf: goalIso_(Math.max(monT, f)), days: days, gone: gone, quarters: qs };
}

/* ── the plan's arithmetic, the same as goals.html's ───────────────────── */

function goalNum_(v) { var n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }

function goalDerive_(p) {
  p = p || {};
  var b = p.budget || {}, inc = p.income || {}, pr = p.production || {}, r = p.ratios || {};
  var keys = ['housing', 'utilities', 'groceries', 'transport', 'children', 'insurance', 'debt', 'savings', 'leisure', 'other'];
  var monthly = 0;
  keys.forEach(function (k) { monthly += Math.max(0, goalNum_(b[k])); });
  var netMonthly = Math.max(0, monthly + Math.max(0, goalNum_(b.businessCosts)) - Math.max(0, goalNum_(b.otherIncome)));
  var tax = Math.min(50, Math.max(0, goalNum_(b.taxPct)));
  var annual = netMonthly * 12 + Math.max(0, goalNum_(b.stretch));
  var income = tax ? annual / (1 - tax / 100) : annual;
  var other = Math.max(0, goalNum_(inc.renewals)) + Math.max(0, goalNum_(inc.bonuses));
  var fycNeed = Math.max(0, income - other);
  var rate = Math.min(90, Math.max(5, goalNum_(pr.fycRate) || 48));
  var apiBudget = Math.ceil(fycNeed / (rate / 100) / 1000) * 1000;
  var choice = pr.apiChoice || 'budget', api;
  if (choice === 'growth') api = Math.round(Math.max(0, goalNum_(pr.lastApi)) * (1 + goalNum_(pr.growthPct) / 100) / 1000) * 1000;
  else if (choice === 'custom') api = Math.round(Math.max(0, goalNum_(pr.customApi)));
  else api = apiBudget;
  var avgCase = Math.max(500, goalNum_(pr.avgCase) || 10000);
  var weeks = Math.min(52, Math.max(20, goalNum_(pr.weeks) || 46));
  var appsYear = Math.ceil(api / avgCase);
  var appsWeek = appsYear / weeks;
  var ffPerApp = Math.max(1, goalNum_(r.ffPerApp) || 2);
  var apptPerFf = Math.max(1, goalNum_(r.apptPerFf) || 2);
  var contactsPerAppt = Math.max(1, goalNum_(r.contactsPerAppt) || 4);
  var ffWeek = appsWeek * ffPerApp, apptWeek = ffWeek * apptPerFf, contactsWeek = apptWeek * contactsPerAppt;
  var qp = (p.quarters && p.quarters.length === 4) ? p.quarters.map(goalNum_) : [25, 25, 25, 25];
  var qs = qp.reduce(function (a, x) { return a + Math.max(0, x); }, 0) || 100;
  var q = qp.map(function (x) { return Math.round(api * Math.max(0, x) / qs); });
  var fyc = Math.round(api * rate / 100);
  return {
    monthly: Math.round(monthly), netMonthly: Math.round(netMonthly), income: Math.round(income),
    fycNeed: Math.round(fycNeed), apiBudget: apiBudget, api: api, fyc: fyc,
    incomeProjected: Math.round(fyc + other), shortfall: Math.max(0, apiBudget - api),
    appsYear: appsYear, appsMonth: Math.round(appsYear / 12 * 10) / 10,
    appsWeek: Math.round(appsWeek * 10) / 10, ffWeek: Math.round(ffWeek * 10) / 10,
    apptWeek: Math.round(apptWeek * 10) / 10, contactsWeek: Math.ceil(contactsWeek),
    q: q, rate: rate, avgCase: avgCase, weeks: weeks
  };
}

/* Where an advisor should be by today, by their own quarters. */
function goalExpected_(derived, fy) {
  var q = (derived && derived.q) || [0, 0, 0, 0], e = 0;
  fy.quarters.forEach(function (Q, i) { e += (q[i] || 0) * (Q.gone / Q.days); });
  return Math.round(e);
}

/* ── the sheet ─────────────────────────────────────────────────────────── */

function goalTab_(name, cols) {
  var ss = SpreadsheetApp.openById(FF_SHEET_ID);
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function goalRows_(sh, cols) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var v = sh.getRange(2, 1, last - 1, cols.length).getValues();
  return v.map(function (r, i) {
    var o = { _row: i + 2 };
    cols.forEach(function (c, j) { o[c] = r[j]; });
    return o;
  });
}

function goalPlans_() {
  var out = {};
  goalRows_(goalTab_(GOAL_TAB_PLANS, GOAL_PLAN_COLS), GOAL_PLAN_COLS).forEach(function (r) {
    var c = goalKey_(r.Code);
    if (!c) return;
    var plan = null;
    try { plan = JSON.parse(String(r['Plan JSON'] || '')); } catch (e) {}
    out[c] = { row: r._row, code: c, name: r.Name, unit: r.Unit, submittedAt: goalStamp_(r['Submitted At']),
               updatedAt: goalStamp_(r['Updated At']), plan: plan };
  });
  return out;
}

function goalChecks_(code) {
  var want = code ? goalKey_(code) : '';
  return goalRows_(goalTab_(GOAL_TAB_CHECKS, GOAL_CHECK_COLS), GOAL_CHECK_COLS)
    .filter(function (r) { return !want || goalKey_(r.Code) === want; })
    .map(function (r) {
      var d = {};
      try { d = JSON.parse(String(r['Check-in JSON'] || '{}')); } catch (e) {}
      d.code = goalKey_(r.Code); d.week = String(r.Week); d.weekOf = goalStamp_(r['Week Of']).slice(0, 10);
      d.savedAt = goalStamp_(r['Saved At']); d._row = r._row;
      return d;
    });
}

function goalStamp_(v) {
  if (v instanceof Date) return v.toISOString();
  return String(v == null ? '' : v);
}

function goalKey_(v) {
  if (typeof fyrKey_ === 'function') return fyrKey_(v);
  var s = String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '');
  var m = s.match(/^[AU]0*(\d{1,6})$/);
  return m ? 'A' + ('00000' + m[1]).slice(-5) : '';
}

/* ── who ───────────────────────────────────────────────────────────────── */

function goalWho_(token) {
  var me = rrbAuthorize_({ parameter: { token: String(token || '') } });
  if (!me) return null;
  me.key = goalKey_(me.code);
  me.kind = (me.scope && me.scope.kind) || 'agent';
  return me;
}

/* The advisors the plans are asked of: the Access tab's active people on
   the board, as the wall has them. */
function goalRoster_() {
  var acc = (typeof fyrAccess_ === 'function') ? fyrAccess_() : {};
  var out = [];
  Object.keys(acc).forEach(function (c) {
    var a = acc[c];
    var named = (typeof fyrNamed_ === 'function') ? fyrNamed_(acc, c) : a.active;
    if (named) out.push({ code: c, name: a.name, unit: a.unit });
  });
  out.sort(function (x, y) { return x.unit === y.unit ? (x.name < y.name ? -1 : 1) : (x.unit < y.unit ? -1 : 1); });
  return out;
}

function goalInScope_(me, code) {
  if (me.kind === 'branch') return true;
  if (me.kind === 'unit' || me.kind === 'units') {
    var u = '';
    try { u = ffLookupDirectManager_(code); } catch (e) {}
    return rrbScopeHasUnit_(me.scope, u);
  }
  return goalKey_(code) === me.key;
}

/* ── Salesforce: last year, and this year so far ───────────────────────── */

function goalLastYear_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('goal_fy26');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var sess = sfLogin_();
  var w = function (f) { return f + ' >= 2025-10-01 AND ' + f + ' <= 2026-09-30'; };
  var nb = sfQuery_(sess, 'SELECT AGENT__r.Agent__c code, SUM(App_Count__c) apps, SUM(Total_API__c) api, ' +
    'SUM(FYC_Annual__c) fyc FROM CLIENT_PORTFOLIO__c WHERE ' + w('Production_Picked_up_Date__c') +
    ' GROUP BY AGENT__r.Agent__c');
  var inc = sfQuery_(sess, 'SELECT Policy_Increases__r.AGENT__r.Agent__c code, SUM(App_Count_Inc__c) apps, ' +
    'SUM(Increase_API__c) api FROM Policy_Increases__c WHERE ' + w('Increase_Production_Picked_Up_Date__c') +
    ' GROUP BY Policy_Increases__r.AGENT__r.Agent__c');
  var withFyc = sfQuery_(sess, 'SELECT SUM(Total_API__c) api, SUM(FYC_Annual__c) fyc, SUM(App_Count__c) apps ' +
    'FROM CLIENT_PORTFOLIO__c WHERE ' + w('Production_Picked_up_Date__c') + ' AND FYC_Annual__c > 0')[0] || {};
  var people = {}, nbApi = 0, nbApps = 0;
  function at(c) { return people[c] || (people[c] = { api: 0, apps: 0, nbApi: 0, nbApps: 0, fyc: 0 }); }
  (nb || []).forEach(function (r) {
    var c = goalKey_(r.code); if (!c) return;
    var p = at(c);
    p.api += r.api || 0; p.apps += r.apps || 0; p.nbApi += r.api || 0; p.nbApps += r.apps || 0; p.fyc += r.fyc || 0;
    nbApi += r.api || 0; nbApps += r.apps || 0;
  });
  (inc || []).forEach(function (r) {
    var c = goalKey_(r.code); if (!c) return;
    var p = at(c); p.api += r.api || 0; p.apps += r.apps || 0;
  });
  Object.keys(people).forEach(function (c) {
    var p = people[c], ratio = p.nbApi ? p.fyc / p.nbApi : 0;
    p.rate = (ratio >= 0.15 && ratio <= 0.75) ? Math.round(ratio * 1000) / 10 : null;
    p.avgCase = p.nbApps >= 5 ? Math.round(p.nbApi / p.nbApps) : null;
    p.api = Math.round(p.api); p.fyc = Math.round(p.fyc);
  });
  var out = {
    people: people,
    branch: { rate: withFyc.api ? Math.round(withFyc.fyc / withFyc.api * 1000) / 10 : 48,
              avgCase: nbApps ? Math.round(nbApi / nbApps) : 10000 }
  };
  try { cache.put('goal_fy26', JSON.stringify(out), 21600); } catch (e) {}
  return out;
}

/* Production picked up so far this year, per advisor: [apps, api]. */
function goalActual_(fy) {
  var cache = CacheService.getScriptCache(), hit = cache.get('goal_fy_actual');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var y = {};
  try { y = (fyrFigures_(fy.from) || {}).y || {}; } catch (e) { Logger.log('goalActual_: %s', e && e.message); }
  try { CacheService.getScriptCache().put('goal_fy_actual', JSON.stringify(y), 600); } catch (e) {}
  return y;
}

/* ── the race ──────────────────────────────────────────────────────────── */

/* Weeks in a row checked in, ending this week or last. */
function goalStreak_(checks, fy) {
  var have = {};
  (checks || []).forEach(function (c) { var m = String(c.week || '').match(/-W(\d+)$/); if (m) have[+m[1]] = true; });
  var w = have[fy.week] ? fy.week : fy.week - 1, n = 0;
  while (w >= 1 && have[w]) { n++; w--; }
  return n;
}

/* When each advisor first reached a milestone, as the wall first saw it. Kept
   in script properties: a few dates for each of eighteen people. */
function goalMilestones_(fy) {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('goal_ms_' + fy.label) || '{}'); }
  catch (e) { return {}; }
}
function goalMilestonesSave_(fy, ms) {
  try { PropertiesService.getScriptProperties().setProperty('goal_ms_' + fy.label, JSON.stringify(ms)); }
  catch (e) { Logger.log('goalMilestonesSave_: %s', e && e.message); }
}

/* Everyone with a plan, in race order: those who have finished, earliest
   first; then the furthest along their own goal; then whoever filed first. */
function goalRace_(fy, plans, act, checks, ms) {
  var people = goalRoster_().map(function (r) {
    var P = plans[r.code], d = P && P.plan ? goalDerive_(P.plan) : null, a = act[r.code] || [0, 0];
    var picked = Math.round(a[1] || 0), apps = a[0] || 0, m = (ms && ms[r.code]) || {};
    var exp = d ? goalExpected_(d, fy) : 0;
    return {
      code: r.code, name: r.name, unit: r.unit, go: !!d, filedAt: P ? P.submittedAt : '',
      goal: d ? d.api : 0, picked: picked, apps: apps,
      pct: d && d.api ? Math.round(picked / d.api * 1000) / 10 : 0,
      expPct: d && d.api ? Math.round(exp / d.api * 1000) / 10 : 0,
      onPlan: !!d && fy.week > 2 && exp >= 1000 && picked >= exp,
      firstApp: apps >= 1, q1: !!d && d.q[0] > 0 && picked >= d.q[0],
      half: !!d && d.api > 0 && picked >= d.api / 2, done: !!d && d.api > 0 && picked >= d.api,
      streak: goalStreak_(checks.filter(function (c) { return c.code === r.code; }), fy),
      reachedAt: m.goal || ''
    };
  });
  var lanes = people.filter(function (p) { return p.go; }).sort(function (a, b) {
    if (a.done !== b.done) return a.done ? -1 : 1;
    if (a.done && a.reachedAt !== b.reachedAt) return String(a.reachedAt || '9') < String(b.reachedAt || '9') ? -1 : 1;
    if (b.pct !== a.pct) return b.pct - a.pct;
    return String(a.filedAt) < String(b.filedAt) ? -1 : 1;
  });
  lanes.forEach(function (p, i) { p.rank = i + 1; });
  return { lanes: lanes, standby: people.filter(function (p) { return !p.go; })
    .map(function (p) { return { code: p.code, name: p.name, unit: p.unit }; })
    .sort(function (a, b) { return a.name < b.name ? -1 : 1; }) };
}

/* The branch wall. Opened by the screens the production board opens for -
   the branch, a visitor pass, staff - and by managers; an advisor's own
   sign-in sees their place in the race on their own page instead. */
function goalWall_(e) {
  var me = goalWho_(e.parameter.token);
  if (!me) return RRB_EXPIRED;
  if (me.kind === 'agent') return { ok: false, error: 'The race is on the branch wall.' };
  var cache = CacheService.getScriptCache(), hit = cache.get('goal_wall');
  if (hit) { try { return JSON.parse(hit); } catch (err) {} }
  var fy = goalFy_(new Date()), plans = goalPlans_(), act = goalActual_(fy), checks = goalChecks_();
  var ms = goalMilestones_(fy), R = goalRace_(fy, plans, act, checks, ms), now = new Date().toISOString(), changed = false;
  R.lanes.forEach(function (p) {
    var m = ms[p.code] || (ms[p.code] = {});
    [['firstApp', p.firstApp], ['q1', p.q1], ['half', p.half], ['goal', p.done]].forEach(function (x) {
      if (x[1] && !m[x[0]]) { m[x[0]] = now; changed = true; if (x[0] === 'goal') p.reachedAt = now; }
    });
  });
  if (changed) goalMilestonesSave_(fy, ms);
  var api = 0, fyc = 0;
  R.lanes.forEach(function (p) { var P = plans[p.code]; if (P && P.plan) { var d = goalDerive_(P.plan); api += d.api; fyc += d.fyc; } });
  var firstOff = R.lanes.slice().sort(function (a, b) { return String(a.filedAt) < String(b.filedAt) ? -1 : 1; })
    .slice(0, 3).map(function (p) { return { name: p.name, at: p.filedAt }; });
  var finishers = R.lanes.filter(function (p) { return p.done; }).map(function (p) { return { name: p.name, at: p.reachedAt }; });
  var out = { ok: true, fy: { label: fy.label, week: fy.week, today: fy.today, days: fy.days, gone: fy.gone },
              lanes: R.lanes, standby: R.standby, firstOff: firstOff, finishers: finishers,
              totals: { people: R.lanes.length + R.standby.length, go: R.lanes.length, api: api, fyc: fyc } };
  try { cache.put('goal_wall', JSON.stringify(out), 60); } catch (err) {}
  return out;
}

/* ── the actions ───────────────────────────────────────────────────────── */

function goalMe_(e) {
  var me = goalWho_(e.parameter.token);
  if (!me) return RRB_EXPIRED;
  var fy = goalFy_(new Date());
  var mine = goalPlans_()[me.key] || null;
  var last = {}, branch = { rate: 48, avgCase: 10000 };
  try { var ly = goalLastYear_(); last = ly.people[me.key] || {}; branch = ly.branch; } catch (err) {
    Logger.log('goalMe_ FY26: %s', err && err.message);
  }
  var act = goalActual_(fy)[me.key] || [0, 0];
  var checks = goalChecks_(me.key).sort(function (a, b) { return a.week < b.week ? 1 : -1; }).slice(0, 12);
  var plan = mine && mine.plan, race = null;
  if (plan) {
    try {
      var R = goalRace_(fy, goalPlans_(), goalActual_(fy), goalChecks_(), goalMilestones_(fy));
      var at = R.lanes.filter(function (p) { return p.code === me.key; })[0];
      if (at) race = { rank: at.rank, of: R.lanes.length, streak: at.streak };
    } catch (err) { Logger.log('goalMe_ race: %s', err && err.message); }
  }
  return {
    ok: true, race: race,
    me: { name: me.name, code: me.key, role: me.role, unit: me.unit, kind: me.kind },
    fy: fy, last: last, branch: branch,
    actual: { apps: act[0] || 0, api: Math.round(act[1] || 0) },
    plan: plan, submittedAt: mine ? mine.submittedAt : '', updatedAt: mine ? mine.updatedAt : '',
    expected: plan ? goalExpected_(goalDerive_(plan), fy) : 0,
    checkins: checks
  };
}

function goalSave_(data) {
  var me = goalWho_(data.token);
  if (!me) return RRB_EXPIRED;
  if (!me.key) return { ok: false, error: 'Your sign-in has no agent number, so there is nowhere to file a plan.' };
  var plan = data.plan;
  if (typeof plan === 'string') { try { plan = JSON.parse(plan); } catch (e) { plan = null; } }
  if (!plan || typeof plan !== 'object') return { ok: false, error: 'No plan arrived.' };
  var s = JSON.stringify(plan);
  if (s.length > 40000) return { ok: false, error: 'That plan is too long to file. Shorten the written answers.' };
  if (!plan.signed || !String(plan.signed.name || '').trim()) return { ok: false, error: 'Sign the plan with your name first.' };
  var d = goalDerive_(plan);
  plan.derived = d;
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return { ok: false, error: 'The sheet is busy. Try again in a moment.' }; }
  try {
    var sh = goalTab_(GOAL_TAB_PLANS, GOAL_PLAN_COLS);
    var had = goalPlans_()[me.key];
    var now = new Date();
    var row = [me.key, me.name || '', me.unit || '', had && had.submittedAt ? new Date(had.submittedAt) : now, now,
      d.api, d.fyc, d.income, d.appsYear, d.contactsWeek, d.apptWeek, d.ffWeek, d.appsWeek,
      d.q[0], d.q[1], d.q[2], d.q[3], String((plan.why && plan.why.title) || ''), JSON.stringify(plan)];
    if (had) sh.getRange(had.row, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
    try { CacheService.getScriptCache().removeAll(['goal_board', 'goal_wall']); } catch (e) {}
    return { ok: true, plan: plan, first: !had, submittedAt: (had && had.submittedAt) || now.toISOString(),
             updatedAt: now.toISOString() };
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

function goalCheckin_(data) {
  var me = goalWho_(data.token);
  if (!me) return RRB_EXPIRED;
  if (!me.key) return { ok: false, error: 'Your sign-in has no agent number.' };
  var c = data.checkin;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { c = null; } }
  if (!c || typeof c !== 'object') return { ok: false, error: 'No check-in arrived.' };
  var fy = goalFy_(new Date());
  /* This week, or last week until Tuesday: a Friday check-in done on Monday
     belongs to the week it describes. */
  var week = String(c.week || fy.weekKey);
  var wn = Number((week.match(/-W(\d+)$/) || [])[1] || 0);
  if (!(wn >= 1 && wn <= fy.week && wn >= fy.week - 1)) return { ok: false, error: 'Check in for this week or last week only.' };
  var weekOf = goalIso_(goalUtc_(fy.weekOf) - (fy.week - wn) * 7 * 864e5);
  var n = function (k) { return Math.max(0, Math.round(goalNum_(c[k]))); };
  var s = JSON.stringify(c);
  if (s.length > 12000) return { ok: false, error: 'That check-in is too long. Shorten the written answers.' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return { ok: false, error: 'The sheet is busy. Try again in a moment.' }; }
  try {
    var sh = goalTab_(GOAL_TAB_CHECKS, GOAL_CHECK_COLS);
    var had = goalChecks_(me.key).filter(function (x) { return x.week === week; })[0];
    var row = [me.key, me.name || '', week, weekOf, new Date(), n('contacts'), n('appts'), n('ffs'), n('apps'),
      n('api'), n('referrals'), n('reviews'), n('booked'), Math.min(5, Math.max(1, n('confidence') || 3)),
      String(c.win || '').slice(0, 1000), String(c.obstacle || '').slice(0, 1000),
      [].concat(c.help || []).join(', ').slice(0, 300) + (c.helpText ? ' — ' + String(c.helpText).slice(0, 500) : ''), s];
    if (had) sh.getRange(had._row, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
    try { CacheService.getScriptCache().remove('goal_wall'); } catch (e) {}
    return { ok: true, week: week, weekOf: weekOf, updated: !!had };
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

/* The whole plan, for the advisor's own manager and the branch manager. */
function goalView_(e) {
  var me = goalWho_(e.parameter.token);
  if (!me) return RRB_EXPIRED;
  var code = goalKey_(e.parameter.code);
  if (!code || !goalInScope_(me, code)) return { ok: false, error: 'That plan is not yours to open.' };
  var p = goalPlans_()[code];
  return { ok: true, code: code, plan: p ? p.plan : null, name: p ? p.name : '',
           checkins: goalChecks_(code).sort(function (a, b) { return a.week < b.week ? 1 : -1; }).slice(0, 12) };
}

/* Every plan in the caller's scope, and the branch's projections. */
function goalTeam_(e) {
  var me = goalWho_(e.parameter.token);
  if (!me) return RRB_EXPIRED;
  if (me.kind === 'agent' || me.kind === 'staff' || me.kind === 'guest') return { ok: false, error: 'The flight deck is for managers.' };
  var out = goalProjection_(me, new Date());
  /* The weekly history is the branch's; a unit's own scope has none. */
  if (me.kind === 'branch') { try { out.history = goalHistory_(); } catch (err) { out.history = []; } }
  return out;
}

/* One row a week: the branch's projection as the Monday e-mail saw it. A
   second run in the same week replaces that week's row. */
function goalSnapshot_(P) {
  var T = P.totals, fy = P.fy, sh = goalTab_(GOAL_TAB_HISTORY, GOAL_HISTORY_COLS);
  var row = [fy.weekKey, new Date(), T.people, T.plans, T.api, T.fyc, T.actual, T.expected,
             T.pace === null ? '' : T.pace, T.paceFyc === null ? '' : T.paceFyc, T.checkedLast];
  var had = goalRows_(sh, GOAL_HISTORY_COLS).filter(function (r) { return String(r.Week) === fy.weekKey; })[0];
  if (had) sh.getRange(had._row, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}

function goalHistory_() {
  var sh = SpreadsheetApp.openById(FF_SHEET_ID).getSheetByName(GOAL_TAB_HISTORY);
  if (!sh) return [];
  return goalRows_(sh, GOAL_HISTORY_COLS).map(function (r) {
    var n = function (k) { return r[k] === '' || r[k] == null ? null : goalNum_(r[k]); };
    return { week: String(r.Week), plans: n('Plans'), people: n('Advisors'), api: n('Committed API'), fyc: n('Committed FYC'),
             actual: n('Picked Up'), expected: n('Plans By Today'), pace: n('Pace API'), paceFyc: n('Pace FYC') };
  }).filter(function (h) { return /-W\d+$/.test(h.week); })
    .sort(function (a, b) { return a.week < b.week ? -1 : 1; }).slice(-26);
}

function goalProjection_(me, now) {
  var fy = goalFy_(now), plans = goalPlans_(), act = goalActual_(fy), checks = goalChecks_();
  var ly = { people: {}, branch: { rate: 48, avgCase: 10000 } };
  try { ly = goalLastYear_(); } catch (err) {}
  var lastWeek = fy.label + '-W' + ('0' + Math.max(1, fy.week - 1)).slice(-2);
  var people = [], T = { people: 0, plans: 0, api: 0, fyc: 0, actual: 0, actualApps: 0, expected: 0,
    lastYear: 0, checkedThis: 0, checkedLast: 0, week: { contacts: 0, appts: 0, ffs: 0, apps: 0, api: 0 },
    target: { contacts: 0, appts: 0, ffs: 0, apps: 0 } };
  goalRoster_().forEach(function (r) {
    if (me && !goalInScope_(me, r.code)) return;
    var P = plans[r.code], d = P && P.plan ? goalDerive_(P.plan) : null;
    var a = act[r.code] || [0, 0], mine = checks.filter(function (c) { return c.code === r.code; });
    var cThis = mine.filter(function (c) { return c.week === fy.weekKey; })[0] || null;
    var cLast = mine.filter(function (c) { return c.week === lastWeek; })[0] || null;
    var latest = cThis || cLast;
    var exp = d ? goalExpected_(d, fy) : 0;
    T.people++; T.actual += a[1] || 0; T.actualApps += a[0] || 0; T.lastYear += (ly.people[r.code] || {}).api || 0;
    if (d) {
      T.plans++; T.api += d.api; T.fyc += d.fyc; T.expected += exp;
      T.target.contacts += d.contactsWeek; T.target.appts += d.apptWeek; T.target.ffs += d.ffWeek; T.target.apps += d.appsWeek;
    }
    if (cThis) T.checkedThis++;
    if (cLast) T.checkedLast++;
    if (latest) ['contacts', 'appts', 'ffs', 'apps', 'api'].forEach(function (k) { T.week[k] += goalNum_(latest[k]); });
    people.push({
      code: r.code, name: r.name, unit: r.unit, go: !!d, submittedAt: P ? P.submittedAt : '',
      title: d && P.plan.why ? (P.plan.why.title || '') : '',
      api: d ? d.api : 0, fyc: d ? d.fyc : 0, income: d ? d.income : 0, rate: d ? d.rate : 0,
      weekly: d ? { contacts: d.contactsWeek, appts: d.apptWeek, ffs: d.ffWeek, apps: d.appsWeek } : null,
      actual: { apps: a[0] || 0, api: Math.round(a[1] || 0) }, expected: exp,
      lastYear: (ly.people[r.code] || {}).api || 0,
      checkin: latest ? { week: latest.week, contacts: goalNum_(latest.contacts), appts: goalNum_(latest.appts),
                          ffs: goalNum_(latest.ffs), apps: goalNum_(latest.apps), api: goalNum_(latest.api),
                          confidence: goalNum_(latest.confidence), help: latest.help || [], helpText: latest.helpText || '' } : null,
      checkedThis: !!cThis, checkedLast: !!cLast
    });
  });
  /* Two projections. On plan: what the plans add up to. On pace: this year's
     production carried at its present rate, said only once a twentieth of
     the year has gone - a week in, a pace is noise. */
  var frac = fy.gone / fy.days, rate = T.api ? T.fyc / T.api : (ly.branch.rate || 48) / 100;
  T.pace = frac >= 0.05 ? Math.round(T.actual / frac) : null;
  T.paceFyc = T.pace === null ? null : Math.round(T.pace * rate);
  T.actual = Math.round(T.actual); T.lastYear = Math.round(T.lastYear);
  return { ok: true, fy: fy, people: people, totals: T, branchRate: ly.branch.rate, lastWeek: lastWeek };
}

/* Launch control at the blastoff: who is GO, and the year the branch has
   committed to. No advisor's own goal goes on the big screen. */
function goalBoard_(e) {
  var me = goalWho_(e.parameter.token);
  if (!me) return RRB_EXPIRED;
  if (me.kind !== 'branch') return { ok: false, error: 'Launch control needs a branch sign-in.' };
  var cache = CacheService.getScriptCache(), hit = cache.get('goal_board');
  if (hit) { try { return JSON.parse(hit); } catch (err) {} }
  var plans = goalPlans_(), fy = goalFy_(new Date()), api = 0, fyc = 0, go = 0, last = 0;
  var ly = { people: {} };
  try { ly = goalLastYear_(); } catch (err) { Logger.log('goalBoard_ FY26: %s', err && err.message); }
  var people = goalRoster_().map(function (r) {
    var P = plans[r.code], d = P && P.plan ? goalDerive_(P.plan) : null;
    if (d) { go++; api += d.api; fyc += d.fyc; }
    last += (ly.people[r.code] || {}).api || 0;
    return { code: r.code, name: r.name, unit: r.unit, go: !!d, at: P ? P.submittedAt : '' };
  });
  var out = { ok: true, fy: { label: fy.label, from: fy.from, week: fy.week }, people: people,
              totals: { people: people.length, go: go, api: api, fyc: fyc, lastYear: Math.round(last) } };
  try { cache.put('goal_board', JSON.stringify(out), 20); } catch (err) {}
  return out;
}

/* ── Monday morning: the projections, by e-mail ────────────────────────── */

function goalMoney_(x) {
  var n = Math.round(Number(x) || 0);
  return 'TT$' + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function goalDigest() {
  var P = goalProjection_(null, new Date()), T = P.totals, fy = P.fy;
  var prev = null;
  try {
    prev = goalHistory_().filter(function (h) { return h.week < fy.weekKey; }).slice(-1)[0] || null;
    goalSnapshot_(P);
  } catch (err) { Logger.log('goalDigest history: %s', err && err.message); }
  var moved = prev && prev.api !== null ? T.api - prev.api : null;
  var to = GOAL_DIGEST_TO || ((typeof MAIL_CONFIG !== 'undefined' && MAIL_CONFIG.branchManager) || Session.getEffectiveUser().getEmail());
  var missing = P.people.filter(function (p) { return !p.go; }).map(function (p) { return p.name; });
  var noCheck = P.people.filter(function (p) { return p.go && !p.checkedLast; }).map(function (p) { return p.name; });
  var cell = 'padding:7px 10px;border-bottom:1px solid #E2E8F0;';
  var rows = P.people.slice().sort(function (a, b) { return b.api - a.api; }).map(function (p) {
    var pct = p.expected ? Math.round(p.actual.api / p.expected * 100) : null;
    return '<tr><td style="' + cell + '">' + p.name + '</td>' +
      '<td style="' + cell + 'text-align:right">' + (p.go ? goalMoney_(p.api) : '<span style="color:#B45309">no plan</span>') + '</td>' +
      '<td style="' + cell + 'text-align:right">' + (p.go ? goalMoney_(p.fyc) : '') + '</td>' +
      '<td style="' + cell + 'text-align:right">' + goalMoney_(p.actual.api) + '</td>' +
      '<td style="' + cell + 'text-align:right">' + (pct === null ? '' : pct + '%') + '</td>' +
      '<td style="' + cell + 'text-align:center">' + (p.checkedLast ? '&#10003;' : p.go ? '<span style="color:#B45309">&mdash;</span>' : '') + '</td></tr>';
  }).join('');
  var html = '<div style="font:15px/1.55 -apple-system,Segoe UI,Arial,sans-serif;color:#0F172A;max-width:720px">' +
    '<p style="margin:0 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#64748B">' + fy.label + ' &middot; week ' + fy.week + '</p>' +
    '<h2 style="margin:0 0 ' + (moved === null ? '14' : '4') + 'px;font-size:22px">Committed: ' + goalMoney_(T.api) + ' API &middot; ' + goalMoney_(T.fyc) + ' FYC</h2>' +
    (moved === null ? '' : '<p style="margin:0 0 14px;color:#475569">' + (moved > 0 ? 'Up ' + goalMoney_(moved) : moved < 0 ? 'Down ' + goalMoney_(-moved) : 'No change') +
      ' since ' + prev.week.replace(/^.*-W0?/, 'week ') + (prev.plans !== null ? ', when ' + prev.plans + ' plans were in' : '') + '.</p>') +
    '<p style="margin:0 0 6px"><b>' + T.plans + ' of ' + T.people + '</b> advisors have filed a plan.' +
      (missing.length ? ' Still to file: ' + missing.join(', ') + '.' : '') + '</p>' +
    '<p style="margin:0 0 6px">Picked up so far: <b>' + goalMoney_(T.actual) + '</b> against <b>' + goalMoney_(T.expected) +
      '</b> the plans call for by today.' + (T.pace !== null ? ' On the present pace the year ends near <b>' + goalMoney_(T.pace) +
      '</b> API, about <b>' + goalMoney_(T.paceFyc) + '</b> FYC.' : ' A pace is called once a twentieth of the year has gone.') + '</p>' +
    '<p style="margin:0 0 16px">Last week: <b>' + T.checkedLast + '</b> checked in &middot; ' + T.week.contacts + ' contacts, ' +
      T.week.appts + ' appointments, ' + T.week.ffs + ' fact finds, ' + T.week.apps + ' apps' +
      (noCheck.length ? '. No check-in from ' + noCheck.join(', ') + '.' : '.') + '</p>' +
    '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13.5px;width:100%">' +
    '<tr style="background:#0F172A;color:#fff"><th style="padding:7px 10px;text-align:left">Advisor</th><th style="padding:7px 10px;text-align:right">API goal</th>' +
    '<th style="padding:7px 10px;text-align:right">FYC goal</th><th style="padding:7px 10px;text-align:right">Picked up</th>' +
    '<th style="padding:7px 10px;text-align:right">Of plan to date</th><th style="padding:7px 10px">Checked in</th></tr>' + rows + '</table>' +
    '<p style="margin:16px 0 0;color:#64748B;font-size:12.5px">FYC is each plan&rsquo;s own commission rate on its API goal. Picked up is production in Salesforce, new business and increases. ' +
    'The full flight deck: https://factfind360.com/goals</p></div>';
  MailApp.sendEmail({ to: to, subject: fy.label + ' week ' + fy.week + ' — committed ' + goalMoney_(T.api) + ' API, ' +
                      goalMoney_(T.fyc) + ' FYC; ' + T.plans + ' of ' + T.people + ' plans in', htmlBody: html, name: 'RR Branch Flight Deck' });
  Logger.log('Sent to %s: %s plans, committed %s API', to, T.plans, goalMoney_(T.api));
}

function goalSetup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'goalDigest') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('goalDigest').timeBased().onWeekDay(ScriptApp.WeekDay[GOAL_DIGEST_AT.day])
    .atHour(GOAL_DIGEST_AT.hour).nearMinute(30).inTimezone(GOAL_TZ).create();
  goalTab_(GOAL_TAB_PLANS, GOAL_PLAN_COLS); goalTab_(GOAL_TAB_CHECKS, GOAL_CHECK_COLS); goalTab_(GOAL_TAB_HISTORY, GOAL_HISTORY_COLS);
  Logger.log('Flight plans: tabs ready; projections e-mail every %s about %s:30.', GOAL_DIGEST_AT.day, GOAL_DIGEST_AT.hour);
}

function goalCheck() {
  var say = function (ok, s) { Logger.log((ok ? 'OK    ' : 'NOT OK') + '  ' + s); };
  say(String(ffProcessAgentSubmit).indexOf('goalSave_') > -1, 'saving a plan reaches this file');
  say(String(doGet).indexOf('goalMe_') > -1, 'opening a plan reaches this file');
  say(typeof fyrFigures_ === 'function', 'FinancialYear.gs is in, so this year is counted as the wall counts it');
  try {
    var ly = goalLastYear_();
    say(true, 'FY26 read from Salesforce: ' + Object.keys(ly.people).length + ' advisors, FYC ' + ly.branch.rate +
        '% of API, average case ' + goalMoney_(ly.branch.avgCase));
  } catch (e) { say(false, 'FY26 could not be read: ' + (e && e.message)); }
  var fy = goalFy_(new Date());
  say(true, fy.label + ' week ' + fy.week + ', ' + goalRoster_().length + ' advisors asked for a plan');
  say(String(doGet).indexOf('goalWall_') > -1, 'the branch wall can read the race');
}
