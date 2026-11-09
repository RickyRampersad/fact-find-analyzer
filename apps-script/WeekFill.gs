/**
 * WeekFill.gs — the Friday check-in fills in what the records already know.
 *
 * WHY (9 November 2026)
 *   "how much close, how much open … revise our flows". An advisor typing
 *   the week's fact finds, apps and API by hand is asked for numbers the
 *   branch already holds, and what they type drifts from what the wall shows.
 *   So the check-in opens with three of its numbers filled in from the
 *   records; the advisor can change any of them.
 *
 * WHAT IT READS (the same sources as the month close-out, for one week)
 *   - Fact finds: the submitted tab, by agent code and submittedAt
 *     (mclFactFinds_).
 *   - Apps and API: Salesforce, new business and increases on their
 *     production picked-up dates (mclSubmitted_).
 *   The Salesforce answer is the whole branch for the week, kept ten minutes,
 *   so twenty advisors opening the check-in make one query, not twenty.
 *
 * THE DOOR
 *   GET ?action=goal_week_auto&token=…&from=YYYY-MM-DD&to=YYYY-MM-DD[&code=A…]
 *   → { ok, from, to, ffs, approved, apps, api, sf }
 *   An advisor sees their own; a unit manager their team's; the branch anyone.
 *
 * PUT IT IN
 *   + next to Files > Script, name it WeekFill, paste this file, LAST in the
 *   list (below SupportMail). Save. Deploy > Manage deployments > pencil >
 *   New version > Deploy. Run wfCheck to see this week's figures in the log.
 *
 * Every name here starts with wf.
 */

var WF_CACHE_SEC = 600;

var WF_PREV_DOGET_ = (typeof doGet === 'function') ? doGet : null;
if (WF_PREV_DOGET_) doGet = function (e) {
  var a = (e && e.parameter && e.parameter.action) || '';
  if (a === 'goal_week_auto') {
    var out;
    try { out = wfWeek_(e); } catch (err) { Logger.log('goal_week_auto failed: %s', (err && err.stack) || err); out = { ok: false, error: String((err && err.message) || err) }; }
    return _ffJson(out);
  }
  return WF_PREV_DOGET_(e);
};

function wfIso_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : ''; }

/* The whole branch for the week, from both sources, kept ten minutes. */
function wfBranchWeek_(from, to) {
  var key = 'wf_' + from + '_' + to, cache = null;
  try { cache = CacheService.getScriptCache(); var hit = cache.get(key); if (hit) return JSON.parse(hit); } catch (e) {}
  var M = { first: from, last: to }, out = { ffs: {}, sub: {}, sf: false };
  out.ffs = mclFactFinds_(M);
  try { out.sub = mclSubmitted_(M); out.sf = true; } catch (err) { Logger.log('wf salesforce: %s', err && err.message); }
  try { var s = JSON.stringify(out); if (cache && s.length < 90000) cache.put(key, s, WF_CACHE_SEC); } catch (e) {}
  return out;
}

function wfWeek_(e) {
  var me = goalWho_(e.parameter.token);
  if (!me) return RRB_EXPIRED;
  var from = wfIso_(e.parameter.from), to = wfIso_(e.parameter.to);
  if (!from || !to || to < from) return { ok: false, error: 'A week needs a from and a to date.' };
  var span = (Date.parse(to) - Date.parse(from)) / 864e5;
  if (span > 7) return { ok: false, error: 'One week at a time.' };
  var code = me.key;
  if (e.parameter.code && goalInScope_(me, goalKey_(e.parameter.code))) code = goalKey_(e.parameter.code);
  if (!code) return { ok: false, error: 'No agent code on this sign-in.' };
  var W = wfBranchWeek_(from, to), f = W.ffs[code] || { filed: 0, approved: 0 }, s = W.sub[code] || [0, 0];
  return { ok: true, v: 'wf1', code: code, from: from, to: to, ffs: f.filed, approved: f.approved,
           apps: Math.round(s[0]), api: Math.round(s[1]), sf: W.sf };
}

/* The editor's button: this week so far, for every advisor with something. */
function wfCheck() {
  var t = Utilities.formatDate(new Date(), 'America/Port_of_Spain', 'yyyy-MM-dd');
  var d = new Date(Date.parse(t)), wd = d.getUTCDay() || 7;
  var from = new Date(d.getTime() - (wd - 1) * 864e5).toISOString().slice(0, 10);
  var W = wfBranchWeek_(from, t);
  Logger.log('Week %s to %s · Salesforce %s', from, t, W.sf ? 'read' : 'NOT read');
  var codes = {};
  Object.keys(W.ffs).forEach(function (c) { codes[c] = 1; });
  Object.keys(W.sub).forEach(function (c) { codes[c] = 1; });
  Object.keys(codes).sort().forEach(function (c) {
    var f = W.ffs[c] || { filed: 0 }, s = W.sub[c] || [0, 0];
    Logger.log('%s  fact finds %s · apps %s · API %s', c, f.filed, s[0], Math.round(s[1]));
  });
  if (!Object.keys(codes).length) Logger.log('Nothing yet this week.');
}
