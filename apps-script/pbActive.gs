/**
 * pbActive.gs — the production board for the new financial year, from the
 * Access tab.
 *
 * WHAT IT CHANGES ON THE WALL'S PRODUCTION BOARD
 *
 *   · Only advisors marked Active on the Access tab of the fact-find workbook
 *     are on the board. Anyone marked Not Active comes off it, and so does
 *     every unit with nobody active left in it.
 *   · Each advisor sits under the Unit the Access tab gives them, whatever
 *     Salesforce still carries. Salesforce had Felicia under Gary on
 *     3 October; the Access tab has her under Ricky, and the board follows the
 *     Access tab.
 *   · Every active advisor is listed, at nothing if they have written nothing
 *     yet. A new year starts with the whole team on the board.
 *   · "Year" is the branch's financial year, from 1 October. The week is
 *     still Monday to today, and the month to date is untouched.
 *
 * Change a Unit or the Active column on the Access tab and the board follows
 * on its next refresh. Nobody edits code to move an advisor.
 *
 * WHAT IT DOES NOT CHANGE
 *
 *   The monthly chart and the settled columns stay on the year that ended
 *   30 September. They are paired month by month with the settlement board,
 *   which rolls over with the new year's quotas. pbSalesforce.gs is not
 *   edited at all: this file runs its sfBoardData_ as it stands and reshapes
 *   what comes back.
 *
 * HOW TO PUT IT IN
 *
 *   1. Left sidebar, + next to Files, Script. Name it pbActive.
 *   2. Select everything in the new file, paste this whole file over it,
 *      Ctrl+S.
 *   3. Function dropdown at the top: pbaCheck. Run. The log lists the active
 *      team unit by unit and says whether this file's board is the one that
 *      will answer.
 *   4. Deploy > Manage deployments > the wall's deployment (its address ends
 *      ...JsrAxxJ3dsQ) > pencil > Version: New version > Deploy.
 *
 * WHY sfBoard IS DEFINED HERE AS WELL
 *
 *   sfBoard is the door the wall knocks on. Apps Script runs the last
 *   definition of a name, and a new file sits below pbSalesforce.gs, so this
 *   one answers. From outside, ?action=prodboard says v "sf3-active" once this
 *   is live. If it still says "sf3", the older door is answering: move this
 *   file to the bottom of the list and deploy again.
 *
 *   When pbSalesforce.gs is next rewritten, fold this in and delete this file,
 *   so the name is defined once again.
 *
 * Every name here starts with pba, so nothing collides with anything already
 * in the project except sfBoard, on purpose.
 */

var PBA_FY_START_MONTH = 10;            // the branch year starts 1 October
var PBA_HIERARCHY      = '26000';       // the wall names this "Ricky Rampersad"
var PBA_HEAD           = 'Ricky Rampersad';
var PBA_ACCESS_TAB     = 'Access';

/* A00427 and U00427 are one advisor. Staff codes (KD001, AG003) are not. */
function pbaKey_(v) {
  var s = String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '');
  var m = s.match(/^[AU]0*(\d{1,6})$/);
  return m ? 'A' + ('00000' + m[1]).slice(-5) : '';
}

/* The first day of the financial year we are in, as Salesforce wants it.
   Built from the branch's own calendar rather than a Date at midnight, which
   reads as 30 September in a project whose clock is not set to Port of Spain. */
function pbaFyFrom_(now) {
  var y = Number(Utilities.formatDate(now, SF_TZ, 'yyyy'));
  var m = Number(Utilities.formatDate(now, SF_TZ, 'M'));
  if (m < PBA_FY_START_MONTH) y -= 1;
  return y + '-' + ('0' + PBA_FY_START_MONTH).slice(-2) + '-01';
}

/* FY26 ended 30 September 2026, so the year that began 1 October 2026 is FY27. */
function pbaFyLabel_(from) {
  var y = Number(String(from).slice(0, 4));
  return 'FY' + String(PBA_FY_START_MONTH === 1 ? y : y + 1).slice(-2);
}

/* The Access tab: Email | Name | Agent Number | Password | Role | Unit | Active.
   Read by heading, so a column added or moved later does not break it. Only
   the name, the unit and the Active flag leave this function. */
function pbaAccess_() {
  var sh = SpreadsheetApp.openById(FF_SHEET_ID).getSheetByName(PBA_ACCESS_TAB);
  if (!sh) throw new Error('No "' + PBA_ACCESS_TAB + '" tab in the fact-find workbook.');
  var v = sh.getDataRange().getValues();
  var h = v[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var cCode = h.indexOf('agent number'), cName = h.indexOf('name'),
      cUnit = h.indexOf('unit'), cAct = h.indexOf('active');
  if (cCode < 0 || cUnit < 0 || cAct < 0) {
    throw new Error('The Access tab needs Agent Number, Unit and Active columns.');
  }
  var out = {};
  for (var r = 1; r < v.length; r++) {
    var code = pbaKey_(v[r][cCode]);
    if (!code) continue;                       // staff carry no agent number
    var name = String(cName >= 0 ? v[r][cName] : '')
                 .replace(/^\s*[AU]\d+\s*[-–]\s*/i, '').trim();
    out[code] = {
      code: code,
      name: name || code,
      unit: String(v[r][cUnit] || '').trim() || 'Unassigned',
      active: /^\s*active\s*$/i.test(String(v[r][cAct] || ''))
    };
  }
  return out;
}

/* Production since the year began, per advisor: new business and increases,
   the same two sources and the same columns sfBoardData_ reads. */
function pbaFyFigures_(from) {
  var sess = sfLogin_();
  var nb = sfQuery_(sess,
    "SELECT AGENT__r.Agent__c code, SUM(App_Count__c) apps, SUM(Total_API__c) api " +
    "FROM CLIENT_PORTFOLIO__c WHERE Production_Picked_up_Date__c >= " + from +
    " GROUP BY AGENT__r.Agent__c");
  var inc = sfQuery_(sess,
    "SELECT Policy_Increases__r.AGENT__r.Agent__c code, " +
    "SUM(App_Count_Inc__c) apps, SUM(Increase_API__c) api " +
    "FROM Policy_Increases__c WHERE Increase_Production_Picked_Up_Date__c >= " + from +
    " GROUP BY Policy_Increases__r.AGENT__r.Agent__c");
  var y = {}, i = {};
  function put(map, r) {
    var c = pbaKey_(r.code);
    if (!c) return;
    var t = map[c] || (map[c] = [0, 0]);
    t[0] += Number(r.apps) || 0;
    t[1] += Number(r.api) || 0;
  }
  (nb || []).forEach(function (r) { put(y, r); });
  (inc || []).forEach(function (r) { put(y, r); put(i, r); });
  return { y: y, inc: i };
}

function pbaInto_(t, s) { if (s) { t[0] += Number(s[0]) || 0; t[1] += Number(s[1]) || 0; } }
function pbaNz_(t) { return (t && (t[0] || t[1])) ? [t[0], t[1]] : null; }

/* The board sfBoardData_ built, reshaped: the Access tab's active advisors,
   under the Access tab's units, with the year counted from 1 October. */
function pbaActiveBoard_(d) {
  var from = pbaFyFrom_(new Date());
  var acc = pbaAccess_();
  var fy = pbaFyFigures_(from);
  var S = (d && d.submitted) || {};

  /* The week and the month to date, per advisor, from the board as built. The
     code is in each advisor's label, and both prefixes fold to one advisor. */
  var wk = {}, mo = {};
  (S.rows || []).forEach(function (r) {
    if (r.lvl !== 2) return;
    var c = pbaKey_((String(r.label || '').match(/[AU]\s*\d{3,6}/i) || [''])[0]);
    if (!c) return;
    if (r.w) pbaInto_(wk[c] || (wk[c] = [0, 0]), r.w);
    if (r.m) pbaInto_(mo[c] || (mo[c] = [0, 0]), r.m);
  });
  /* The month columns appear only when the feed carries them. Adding zeros
     where it does not would put a month on the wall in which nobody wrote. */
  var hadM = !!((S.total && S.total.m) || (S.rows || []).some(function (r) { return r.m; }));

  var teams = {}, order = [], activeCount = 0;
  Object.keys(acc).forEach(function (c) {
    var a = acc[c];
    if (!a.active) return;
    activeCount++;
    if (!teams[a.unit]) { teams[a.unit] = []; order.push(a.unit); }
    teams[a.unit].push(a);
  });
  /* The head's team first, the rest by name. The wall ranks them by what they
     have written once it is drawing. */
  order.sort(function (x, y) {
    if (x === PBA_HEAD) return -1;
    if (y === PBA_HEAD) return 1;
    return x < y ? -1 : x > y ? 1 : 0;
  });

  var top = { lvl: 0, label: PBA_HIERARCHY, w: [0, 0], m: [0, 0], y: [0, 0] };
  var rows = [top];
  order.forEach(function (u) {
    var team = { lvl: 1, label: u, w: [0, 0], m: [0, 0], y: [0, 0] };
    var kids = teams[u].map(function (a) {
      var w = wk[a.code] || null, m = mo[a.code] || null, y = fy.y[a.code] || null;
      pbaInto_(team.w, w); pbaInto_(team.m, m); pbaInto_(team.y, y);
      var row = { lvl: 2, label: a.code + ' - ' + a.name, w: pbaNz_(w), y: pbaNz_(y) };
      if (hadM) row.m = pbaNz_(m);
      return row;
    });
    pbaInto_(top.w, team.w); pbaInto_(top.m, team.m); pbaInto_(top.y, team.y);
    if (!hadM) delete team.m;
    rows.push(team);
    kids.forEach(function (k) { rows.push(k); });
  });
  if (!hadM) delete top.m;

  /* Whoever is not active and still has production is left off the board and
     out of its totals. It is counted here, so the difference is visible in
     the diagnostics rather than silently gone. */
  var gone = { w: [0, 0], y: [0, 0], advisors: [] };
  function off(c) { return !acc[c] || !acc[c].active; }
  Object.keys(wk).forEach(function (c) {
    if (off(c)) { pbaInto_(gone.w, wk[c]); if (gone.advisors.indexOf(c) < 0) gone.advisors.push(c); }
  });
  Object.keys(fy.y).forEach(function (c) {
    if (off(c)) { pbaInto_(gone.y, fy.y[c]); if (gone.advisors.indexOf(c) < 0) gone.advisors.push(c); }
  });

  var sub = {};
  Object.keys(S).forEach(function (k) { sub[k] = S[k]; });
  var total = {};
  Object.keys(S.total || {}).forEach(function (k) { total[k] = S.total[k]; });
  total.w = top.w; total.y = top.y;
  if (hadM) total.m = top.m;
  sub.rows = rows;
  sub.total = total;
  sub.yearFrom = from;
  sub.yearLabel = pbaFyLabel_(from);

  /* The advisor list beside the board: active advisors only, named and placed
     as the Access tab has them, with the year counted the same way. */
  var agents = [];
  (d && d.agents || []).forEach(function (x) {
    var c = pbaKey_(x.code), a = acc[c];
    if (!a || !a.active) return;
    x.name = a.name;
    x.unit = a.unit;
    x.y = fy.y[c] || [0, 0];
    x.inc = fy.inc[c] || [0, 0];
    agents.push(x);
  });

  var diag = {};
  Object.keys((d && d.diag) || {}).forEach(function (k) { diag[k] = d.diag[k]; });
  diag.roster = 'Access tab';
  diag.yearFrom = from;
  diag.active = activeCount;
  diag.units = order;
  diag.offBoard = gone;
  return { submitted: sub, agents: agents, diag: diag };
}

function sfBoard(e) {
  /* Pressed Run rather than called: do what pbSalesforce.gs always did here,
     because sfCheck is also what stores the Salesforce credentials. The
     Access-tab check is pbaCheck, run on its own. */
  if (!e || !e.parameter) return sfCheck();

  /* EVERY ANSWER CARRIES v, so it can be seen from outside which door is
     answering. "sf3-active" is this one. */
  var V = 'sf3-active';

  var tok = e.parameter.token || '';
  var who = (typeof rrbAuthorize_ === 'function') ? rrbAuthorize_(e) : null;
  if (!who) {
    return sfJson_({ ok: false, v: V,
      error: tok ? 'A token arrived but did not resolve to anybody. Sign in again.'
                 : 'No session token reached the server.' });
  }
  var scope = who.scope ||
              ((typeof rrbScopeForRole_ === 'function')
                 ? rrbScopeForRole_(who.role, who.unitKey, who.code) : null);
  /* Branch, guest and staff passes all see the board, as the wall itself
     allows. Any other scope is refused. */
  var kind = (scope && scope.kind) || '';
  if (kind !== 'branch' && kind !== 'guest' && kind !== 'staff') {
    return sfJson_({ ok: true, v: V, submitted: null,
      note: 'The board needs a branch, staff or guest pass. Signed in as ' +
            (who.name || '?') + ', role ' + (who.role || '?') +
            ', scope ' + (kind || 'none') + '.' });
  }

  var d;
  try { d = sfBoardData_(); }
  catch (err) { return sfJson_({ ok: false, v: V, error: String(err && err.message || err) }); }

  /* Everything sfBoardData_ returned goes back, so nothing it carries is lost.
     If reshaping fails, the board as built goes out with a note saying why,
     rather than the wall going dark. */
  var out = { ok: true, v: V };
  Object.keys(d).forEach(function (k) { out[k] = d[k]; });
  try {
    var a = pbaActiveBoard_(d);
    out.submitted = a.submitted;
    out.agents = a.agents;
    out.diag = a.diag;
  } catch (err2) {
    out.note = 'The Access tab could not be applied, so this is the board as Salesforce has it: ' +
               String(err2 && err2.message || err2);
  }
  return sfJson_(out);
}

/**
 * Run this from the editor. It writes nothing. It lists the active team unit
 * by unit, says where the year starts, and says whether this file's board is
 * the one that answers.
 */
function pbaCheck() {
  var lines = [];
  function say(s) { lines.push(s); console.log(s); }
  var from = pbaFyFrom_(new Date());
  say('Financial year ' + pbaFyLabel_(from) + ', counted from ' + from + '.');
  say('');
  var acc = pbaAccess_(), units = {}, off = [];
  Object.keys(acc).forEach(function (c) {
    var a = acc[c];
    if (!a.active) { off.push(a.name); return; }
    (units[a.unit] = units[a.unit] || []).push(a.name);
  });
  Object.keys(units).sort().forEach(function (u) {
    say(u + ' (' + units[u].length + '): ' + units[u].join(', '));
  });
  say('Not active, off the board (' + off.length + '): ' + off.join(', '));
  say('');
  var mine = String(sfBoard).indexOf('pbaActiveBoard_') > -1;
  say(mine ? 'OK  this file\'s board is the one that answers. Deploy a New version on the wall\'s deployment.'
           : 'NOT YET  an older sfBoard is answering. Move pbActive to the bottom of the file list.');
  try {
    var fy = pbaFyFigures_(from);
    say('Salesforce: ' + Object.keys(fy.y).length + ' advisor(s) with production since ' + from + '.');
  } catch (err) {
    say('Salesforce did not answer: ' + (err && err.message || err));
  }
  return lines.join('\n');
}
