/**
 * FinancialYear.gs — the wall in the new financial year.
 *
 * The branch year ended 30 September 2026. FY27 runs 1 October 2026 to
 * 30 September 2027, and from 1 October the branch is two units, Ricky
 * Rampersad's and Akaash Kalladeen's. This file moves the wall onto that year
 * and that roster, in one paste.
 *
 * THE PRODUCTION BOARD
 *   · Only advisors marked Active on the Access tab of the fact-find workbook
 *     are named on it, each under the Unit the Access tab gives them.
 *   · Every active advisor is listed, at nothing if they have written nothing
 *     yet. A new year starts with the whole team on the board.
 *   · "Year" counts from 1 October. The week is still Monday to today.
 *   · Javid and Aleema are Not Active but their production is still the
 *     branch's and still counts (FYR_STILL_COUNTED below). Their figures stay
 *     in the totals; the wall keeps their names off the rows, as it always has.
 *   · Petra Chadee is part-time corporate and Active, so she keeps her
 *     sign-in, but she is off the board (FYR_OFF_BOARD). Business she writes
 *     still counts in the totals.
 *   · The branch's broker, Nautilus Insurance Brokers, has a line of its own
 *     under the units (FYR_BROKERS). Its figures appear once the code its
 *     business is written under in Salesforce is filled in.
 *
 * THE MONTH BOARD (panel 19, "Off the mark")
 *   · The same answer carries `month`: every active advisor at zero until
 *     their first business of the year is picked up - new business or an
 *     increase - and the date that happened, which is the day they got off
 *     the mark. Beside each name, this month's apps and API.
 *   · With it, the month as a clock (working days gone and to go) and the
 *     quarter, with the branch's figures for today, the month and the quarter.
 *   · Weekends are not days on it; FYR_HOLIDAYS takes out public holidays.
 *
 * THE SETTLEMENT SIDE
 *   · Settled figures count from 1 October: the settlement board, the settled
 *     columns on the production board, and the month-by-month chart.
 *   · Months run October to September and are labelled by their own month,
 *     so October is October wherever it falls.
 *   · Quotas and the branch target are blank until the FY27 figures are put in
 *     FYR_QUOTAS and FYR_TARGET below. A quota on the wall that nobody was
 *     given is worse than none. Persistency carries over from the last report
 *     (as at 31 August) until a new one comes in.
 *
 * Change a Unit or the Active column on the Access tab and the wall follows
 * on its next refresh. Nobody edits code to move an advisor.
 *
 * HOW TO PUT IT IN
 *   1. Left sidebar, + next to Files, Script. Name it FinancialYear.
 *   2. Select everything in the new file, paste this whole file over it,
 *      Ctrl+S.
 *   3. Function dropdown at the top: fyrCheck. Run. The log lists the team
 *      unit by unit and says whether this file's doors are the ones answering.
 *   4. Deploy > Manage deployments > the wall's deployment (its address ends
 *      ...JsrAxxJ3dsQ) > pencil > Version: New version > Deploy.
 *
 * WHY sfBoard AND getSettlement ARE DEFINED HERE AS WELL
 *   They are the two doors the wall knocks on. Apps Script runs the last
 *   definition of a name, and a new file sits below pbSalesforce.gs and
 *   Code.gs, so these answer. sfBoard still runs pbSalesforce's own
 *   sfBoardData_ and reshapes what it returns; getSettlement reads the same
 *   settlement tab with the same columns as before.
 *   From outside, ?action=prodboard answers v "sf3-fy". If it still says
 *   "sf3", an older door is answering: move this file to the bottom of the
 *   list and deploy again.
 *   When pbSalesforce.gs or Code.gs is next rewritten, fold this in and delete
 *   this file, so each name is defined once again.
 *
 * Every other name here starts with fyr, so nothing else collides.
 */

var FYR_START_MONTH  = 10;                 // the branch year starts 1 October
var FYR_HIERARCHY    = '26000';            // the wall names this "Ricky Rampersad"
var FYR_HEAD         = 'Ricky Rampersad';
var FYR_ACCESS_TAB   = 'Access';

/* Not Active on the Access tab, and still counted. Javid and Aleema write
   under another branch, and Salesforce keeps their production with this one.
   Their figures go into every total; the wall keeps their names off the rows. */
var FYR_STILL_COUNTED = { A04020: 'Javid Ali', A04028: 'Aleema Mohammed-Ali' };

/* Active on the Access tab, so they keep their sign-in, and kept off the
   board. Petra is part-time corporate; taken off on 5 October 2026 ("just
   remove Petra"). Business written under these codes still counts in the
   totals, as Javid's and Aleema's does. Set someone Not Active on the Access
   tab instead and they lose their sign-in as well. */
var FYR_OFF_BOARD = { A09088: 'Petra Chadee' };

/* BROKERS ATTACHED TO THE BRANCH. A broker gets a line of its own under the
   units on the month board and a team of its own on the production board,
   never a place among the advisors or in their count.
     code    the code its business is written under in Salesforce (the AGENT
             on its policies). Until it is filled in, the wall shows the broker
             on its line, with the branch, and no figures: it cannot see the
             business, and it will not call that zero.
     counts  true puts its business in the branch's totals.
   Nautilus Insurance Brokers, asked for on 5 October 2026. It is with the
   branch, not joining it ("he's not joining, he is with us"), and the wall
   says so. On that day no agent record and no policy in the branch's
   Salesforce carried the name. */
var FYR_BROKERS = [
  { name: 'Nautilus Insurance Brokers', code: '', counts: true }
];

/* FY27 QUOTAS - one line per advisor, from the FY27 Agent Level Details report:
       A13710: [quota, 'Band'],        e.g.  A13710: [200000, 'Year 2'],
   Leave it empty until the figures are given. Empty means the wall shows no
   quota and no band, which is true; a guessed figure would not be. */
var FYR_QUOTAS = {
};

/* The branch's FY27 target, once it is set. 0 shows "target not set". */
var FYR_TARGET = 0;

/* Working days the month board leaves out besides Saturdays and Sundays, as
   'yyyy-MM-dd'. Public holidays go here as each month comes up; October 2026
   has none. */
var FYR_HOLIDAYS = [];

/* ── the year ─────────────────────────────────────────────────────────── */

/* A00427 and U00427 are one advisor. Staff codes (KD001, AG003) are not. */
function fyrKey_(v) {
  var s = String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '');
  var m = s.match(/^[AU]0*(\d{1,6})$/);
  return m ? 'A' + ('00000' + m[1]).slice(-5) : '';
}

/* Letters and digits, upper case: how a broker's code is compared. */
function fyrNorm_(v) { return String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, ''); }

/* BROKERn when a code is the one set for broker n, whatever shape it has. */
function fyrBrokerKey_(v) {
  var n = fyrNorm_(v), k = fyrKey_(v);
  if (!n) return '';
  for (var i = 0; i < FYR_BROKERS.length; i++) {
    var b = FYR_BROKERS[i], bc = fyrNorm_(b && b.code);
    if (bc && (n === bc || (k && k === fyrKey_(b.code)))) return 'BROKER' + i;
  }
  return '';
}
/* The key any code is counted under: a broker's, or an advisor's. */
function fyrId_(v) { return fyrBrokerKey_(v) || fyrKey_(v); }
function fyrBroker_(c) { var m = /^BROKER(\d+)$/.exec(String(c || '')); return m ? FYR_BROKERS[Number(m[1])] || null : null; }

/* The first day of the year we are in, as Salesforce wants it. Built from the
   branch's own calendar rather than a Date at midnight, which reads as the
   day before in a project whose clock is not set to Port of Spain. */
function fyrFrom_(now) {
  var y = Number(Utilities.formatDate(now, SF_TZ, 'yyyy'));
  var m = Number(Utilities.formatDate(now, SF_TZ, 'M'));
  if (m < FYR_START_MONTH) y -= 1;
  return y + '-' + ('0' + FYR_START_MONTH).slice(-2) + '-01';
}

/* FY26 ended 30 September 2026, so the year that began 1 October 2026 is FY27. */
function fyrLabel_(from) {
  var y = Number(String(from).slice(0, 4));
  return 'FY' + String(FYR_START_MONTH === 1 ? y : y + 1).slice(-2);
}

/* The last day of the year that starts on `from`. */
function fyrEnds_(from) {
  var y = Number(String(from).slice(0, 4)) + (FYR_START_MONTH === 1 ? 0 : 1);
  var m = FYR_START_MONTH === 1 ? 12 : FYR_START_MONTH - 1;
  var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + last).slice(-2);
}

/* Calendar month (1-12) of position i (0-11) in the year: October first. */
function fyrMonthAt_(i) { return ((FYR_START_MONTH - 1 + i) % 12) + 1; }

/* Position in the year of a calendar year and month, or -1 if outside it. */
function fyrIndex_(from, y, m) {
  var y0 = Number(String(from).slice(0, 4));
  if (y === y0 && m >= FYR_START_MONTH) return m - FYR_START_MONTH;
  if (y === y0 + 1 && m < FYR_START_MONTH) return m + 12 - FYR_START_MONTH;
  return -1;
}

/* The working day of the financial year: Mondays to Fridays from 1 October,
   less FYR_HOLIDAYS. On a weekend or a holiday it is the count so far. On
   Monday 5 October 2026 it is 3: Thursday 1, Friday 2, Monday 5. */
function fyrWorkDay_(from, today) {
  var p = function (s) { s = String(s); return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); };
  var n = 0, isDay = false;
  for (var t = p(from), end = p(today); t <= end; t += 864e5) {
    var d = new Date(t), wd = d.getUTCDay(), iso = d.toISOString().slice(0, 10);
    if (wd === 0 || wd === 6 || FYR_HOLIDAYS.indexOf(iso) > -1) { isDay = false; continue; }
    n++; isDay = true;
  }
  return { day: n, working: isDay };
}

/* ── who is on the wall ────────────────────────────────────────────────── */

/* The Access tab: Email | Name | Agent Number | Password | Role | Unit | Active.
   Read by heading, so a column added or moved later does not break it. Only
   the name, the unit and the Active flag leave this function. */
function fyrAccess_() {
  var sh = SpreadsheetApp.openById(FF_SHEET_ID).getSheetByName(FYR_ACCESS_TAB);
  if (!sh) throw new Error('No "' + FYR_ACCESS_TAB + '" tab in the fact-find workbook.');
  var v = sh.getDataRange().getValues();
  var h = v[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var cCode = h.indexOf('agent number'), cName = h.indexOf('name'),
      cUnit = h.indexOf('unit'), cAct = h.indexOf('active');
  if (cCode < 0 || cUnit < 0 || cAct < 0) {
    throw new Error('The Access tab needs Agent Number, Unit and Active columns.');
  }
  var out = {};
  for (var r = 1; r < v.length; r++) {
    var code = fyrKey_(v[r][cCode]);
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

/* Named on the wall: active and not kept off the board. Counted in its
   totals: active (named or not), still counted, or a broker that counts. */
function fyrNamed_(acc, c) { return !!(acc[c] && acc[c].active) && !FYR_OFF_BOARD[c]; }
function fyrCounted_(acc, c) {
  var b = fyrBroker_(c);
  if (b) return b.counts !== false;
  return !!(acc[c] && acc[c].active) || !!FYR_STILL_COUNTED[c];
}

function fyrInto_(t, s) { if (s) { t[0] += Number(s[0]) || 0; t[1] += Number(s[1]) || 0; } }
function fyrNz_(t) { return (t && (t[0] || t[1])) ? [t[0], t[1]] : null; }

/* ── the production board ──────────────────────────────────────────────── */

/* Production since the year began: per advisor, and month by month. New
   business and increases, the same sources and columns sfBoardData_ reads. */
function fyrFigures_(from) {
  var sess = sfLogin_();
  /* MIN(date) is the day each advisor got off the mark this year. */
  var nb = sfQuery_(sess,
    "SELECT AGENT__r.Agent__c code, SUM(App_Count__c) apps, SUM(Total_API__c) api, " +
    "MIN(Production_Picked_up_Date__c) d " +
    "FROM CLIENT_PORTFOLIO__c WHERE Production_Picked_up_Date__c >= " + from +
    " GROUP BY AGENT__r.Agent__c");
  var inc = sfQuery_(sess,
    "SELECT Policy_Increases__r.AGENT__r.Agent__c code, " +
    "SUM(App_Count_Inc__c) apps, SUM(Increase_API__c) api, " +
    "MIN(Increase_Production_Picked_Up_Date__c) d " +
    "FROM Policy_Increases__c WHERE Increase_Production_Picked_Up_Date__c >= " + from +
    " GROUP BY Policy_Increases__r.AGENT__r.Agent__c");
  var monNb = sfQuery_(sess,
    "SELECT AGENT__r.Agent__c code, CALENDAR_MONTH(Production_Picked_up_Date__c) m, " +
    "SUM(App_Count__c) apps, SUM(Total_API__c) api " +
    "FROM CLIENT_PORTFOLIO__c WHERE Production_Picked_up_Date__c >= " + from +
    " GROUP BY AGENT__r.Agent__c, CALENDAR_MONTH(Production_Picked_up_Date__c)");
  var monInc = sfQuery_(sess,
    "SELECT Policy_Increases__r.AGENT__r.Agent__c code, " +
    "CALENDAR_MONTH(Increase_Production_Picked_Up_Date__c) m, " +
    "SUM(App_Count_Inc__c) apps, SUM(Increase_API__c) api " +
    "FROM Policy_Increases__c WHERE Increase_Production_Picked_Up_Date__c >= " + from +
    " GROUP BY Policy_Increases__r.AGENT__r.Agent__c, " +
    "CALENDAR_MONTH(Increase_Production_Picked_Up_Date__c)");
  var y = {}, i = {}, first = {};
  function put(map, r) {
    var c = fyrId_(r.code);
    if (!c) return;
    fyrInto_(map[c] || (map[c] = [0, 0]), [r.apps, r.api]);
    var d = String(r.d || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && (Number(r.apps) > 0 || Number(r.api) > 0) &&
        (!first[c] || d < first[c])) first[c] = d;
  }
  (nb || []).forEach(function (r) { put(y, r); });
  (inc || []).forEach(function (r) { put(y, r); put(i, r); });
  return { y: y, inc: i, first: first, monNb: monNb || [], monInc: monInc || [] };
}

/* The month board, as the wall shows it: every advisor on the wall starting
   the year at zero, with this month's apps and API, the year's, and the day
   each got off the mark - their first business picked up this financial year.
   New business and increases, the same sources and columns as the rest of
   the board. Beside it, the month and the quarter as clocks. */
function fyrMonth_(acc, fy) {
  var MN = ['January','February','March','April','May','June','July','August',
            'September','October','November','December'];
  var pad = function (n) { return ('0' + n).slice(-2); };
  var dayOf = function (yy, mm, dd) { return Date.UTC(yy, mm - 1, dd) / 864e5; };
  var today = Utilities.formatDate(new Date(), SF_TZ, 'yyyy-MM-dd');
  var y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)), d0 = Number(today.slice(8, 10));
  var ym = today.slice(0, 8), lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  var first = ym + '01', last = ym + pad(lastDay);
  var days = [];
  for (var dd = 1; dd <= lastDay; dd++) {
    var iso = ym + pad(dd);
    var wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
    if (wd === 0 || wd === 6 || FYR_HOLIDAYS.indexOf(iso) > -1) continue;
    days.push(iso);
  }
  var from = fyrFrom_(new Date());
  fy = fy || fyrFigures_(from);

  var sess = sfLogin_();
  var nb = sfQuery_(sess,
    "SELECT AGENT__r.Agent__c code, Production_Picked_up_Date__c d, " +
    "SUM(App_Count__c) apps, SUM(Total_API__c) api " +
    "FROM CLIENT_PORTFOLIO__c WHERE Production_Picked_up_Date__c >= " + first +
    " AND Production_Picked_up_Date__c <= " + last +
    " GROUP BY AGENT__r.Agent__c, Production_Picked_up_Date__c");
  var inc = sfQuery_(sess,
    "SELECT Policy_Increases__r.AGENT__r.Agent__c code, Increase_Production_Picked_Up_Date__c d, " +
    "SUM(App_Count_Inc__c) apps, SUM(Increase_API__c) api " +
    "FROM Policy_Increases__c WHERE Increase_Production_Picked_Up_Date__c >= " + first +
    " AND Increase_Production_Picked_Up_Date__c <= " + last +
    " GROUP BY Policy_Increases__r.AGENT__r.Agent__c, Increase_Production_Picked_Up_Date__c");

  /* By day. Business dated on a weekend or a holiday counts on the working
     day before it (the first working day, at the start of a month). */
  function workday(iso) {
    if (days.indexOf(iso) > -1) return iso;
    var before = days.filter(function (x) { return x < iso; });
    return before.length ? before[before.length - 1] : days[0];
  }
  /* Still-counted and off-the-board advisors go into the totals and not onto
     a row; former advisors go into neither, as on the rest of the board. A
     broker has its own line, and is in the totals when it counts. */
  var per = {}, total = [0, 0], todayAll = [0, 0];
  function add(r) {
    var c = fyrId_(r.code), iso = String(r.d || '').slice(0, 10);
    if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    var cell = [Number(r.apps) || 0, Number(r.api) || 0], wd2 = workday(iso);
    if (fyrCounted_(acc, c)) {
      fyrInto_(total, cell);
      if (wd2 === today) fyrInto_(todayAll, cell);
    }
    if (!fyrNamed_(acc, c) && !fyrBroker_(c)) return;
    var p = per[c] || (per[c] = {});
    fyrInto_(p[wd2] || (p[wd2] = [0, 0]), cell);
  }
  (nb || []).forEach(add);
  (inc || []).forEach(add);

  /* The quarter of the financial year we are in: its months, its calendar
     days, and the production in it, from the year's month-by-month figures. */
  var qi = Math.floor(((m - FYR_START_MONTH + 12) % 12) / 3);
  var qM = [0, 1, 2].map(function (k) { return ((FYR_START_MONTH - 1 + qi * 3 + k) % 12) + 1; });
  var qY0 = qM[0] > m ? y - 1 : y, qY2 = qY0 + (qM[2] < qM[0] ? 1 : 0);
  var qTo = qY2 + '-' + pad(qM[2]) + '-' + pad(new Date(Date.UTC(qY2, qM[2], 0)).getUTCDate());
  var qStart = dayOf(qY0, qM[0], 1);
  var quarter = [0, 0];
  function addQ(r) {
    var c = fyrId_(r.code), mm = Number(r.m);
    if (c && fyrCounted_(acc, c) && qM.indexOf(mm) > -1) fyrInto_(quarter, [r.apps, r.api]);
  }
  (fy.monNb || []).forEach(addQ);
  (fy.monInc || []).forEach(addQ);

  /* Everyone on the Access tab's units, the head's unit first. Within a unit
     the advisors with the most API this month lead; at zero, by name. */
  var units = {}, order = [], people = 0, onMonth = 0, off = 0, firstDay = '', todayNames = [];
  Object.keys(acc).forEach(function (c) {
    var a = acc[c];
    if (!fyrNamed_(acc, c)) return;
    if (!units[a.unit]) { units[a.unit] = []; order.push(a.unit); }
    var cells = per[c] || {}, on = 0, sum = [0, 0];
    Object.keys(cells).forEach(function (k) {
      fyrInto_(sum, cells[k]);
      if (cells[k][0] > 0 || cells[k][1] > 0) on++;
    });
    var yr = (fy.y && fy.y[c]) || [0, 0];
    var firstOn = (fy.first && fy.first[c]) || '';
    if (!firstOn && (yr[0] > 0 || yr[1] > 0)) firstOn = from;     // on the board, date unknown
    var t = cells[today] || [0, 0];
    people++;
    if (on) onMonth++;
    if (firstOn) {
      off++;
      if (!firstDay || firstOn < firstDay) firstDay = firstOn;
    }
    if (t[0] > 0 || t[1] > 0) todayNames.push(a.name);
    units[a.unit].push({ code: c, name: a.name, apps: sum[0], api: sum[1], on: on, days: cells,
                         fy: [yr[0], yr[1]], first: firstOn, today: [t[0], t[1]] });
  });
  order.sort(function (a, b) {
    if (a === FYR_HEAD) return -1;
    if (b === FYR_HEAD) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  var rank = function (a, b) {
    return (b.api - a.api) || (b.apps - a.apps) || (b.fy[1] - a.fy[1]) ||
           (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  };
  var firstNames = [];
  order.forEach(function (u) {
    units[u].sort(rank);
    units[u].forEach(function (p) { if (firstDay && p.first === firstDay) firstNames.push(p.name); });
  });

  /* The branch's brokers, on a line of their own after the units, outside the
     advisors' count and the race to be first. One with no code yet goes out
     unlinked and carries no figures. */
  var brokers = [];
  FYR_BROKERS.forEach(function (b, i) {
    if (!b || !b.name) return;
    var c = 'BROKER' + i, linked = !!fyrNorm_(b.code), counts = b.counts !== false;
    var cells = linked ? (per[c] || {}) : {}, on = 0, sum = [0, 0];
    Object.keys(cells).forEach(function (k) {
      fyrInto_(sum, cells[k]);
      if (cells[k][0] > 0 || cells[k][1] > 0) on++;
    });
    var yr = (linked && fy.y && fy.y[c]) || [0, 0];
    var firstOn = (linked && fy.first && fy.first[c]) || '';
    if (linked && !firstOn && (yr[0] > 0 || yr[1] > 0)) firstOn = from;
    var t = cells[today] || [0, 0];
    if (counts && (t[0] > 0 || t[1] > 0)) todayNames.push(b.name);
    brokers.push({ code: linked ? fyrNorm_(b.code) : '', name: b.name, broker: true, linked: linked, counts: counts,
                   apps: sum[0], api: sum[1], on: on, days: cells, fy: [yr[0], yr[1]], first: firstOn,
                   today: [t[0], t[1]] });
  });

  return {
    y: y, m: m, label: MN[m - 1], today: today, days: days,
    gone: days.filter(function (x) { return x < today; }).length,
    workday: days.indexOf(today) > -1,
    firstOfYear: m === FYR_START_MONTH,
    fyLabel: fyrLabel_(from), fyFrom: from,
    q: { n: qi + 1, months: qM.map(function (k) { return MN[k - 1].slice(0, 3); }),
         from: qY0 + '-' + pad(qM[0]) + '-01', to: qTo,
         day: dayOf(y, m, d0) - qStart + 1,
         days: dayOf(qY2, qM[2], new Date(Date.UTC(qY2, qM[2], 0)).getUTCDate()) - qStart + 1,
         apps: quarter[0], api: quarter[1] },
    units: order.map(function (u) { return { unit: u, people: units[u] }; })
                .concat(brokers.length ? [{ unit: 'Broker', broker: true, people: brokers }] : []),
    total: { apps: total[0], api: total[1], people: people, on: onMonth, off: off,
             today: todayAll, todayNames: todayNames },
    first: firstDay ? { day: firstDay, names: firstNames } : null
  };
}

/* The board sfBoardData_ built, reshaped: the Access tab's active advisors,
   under the Access tab's units, the year counted from 1 October. */
function fyrBoard_(d) {
  var from = fyrFrom_(new Date());
  var acc = fyrAccess_();
  var fy = fyrFigures_(from);
  var S = (d && d.submitted) || {};

  /* The week and the month to date, per advisor, from the board as built. The
     code is in each advisor's label, and both prefixes fold to one advisor. */
  var wk = {}, mo = {};
  (S.rows || []).forEach(function (r) {
    if (r.lvl !== 2) return;
    var c = fyrBrokerKey_(String(r.label || '').split(' - ')[0]) ||
            fyrKey_((String(r.label || '').match(/[AU]\s*\d{3,6}/i) || [''])[0]);
    if (!c) return;
    if (r.w) fyrInto_(wk[c] || (wk[c] = [0, 0]), r.w);
    if (r.m) fyrInto_(mo[c] || (mo[c] = [0, 0]), r.m);
  });
  /* The month columns appear only when the feed carries them. Adding zeros
     where it does not would put a month on the wall in which nobody wrote. */
  var hadM = !!((S.total && S.total.m) || (S.rows || []).some(function (r) { return r.m; }));

  /* Teams in the Access tab's own words: the active advisors, then anyone
     still counted, under the unit the Access tab gives them. */
  var teams = {}, order = [], named = 0;
  function seat(a) {
    if (!teams[a.unit]) { teams[a.unit] = []; order.push(a.unit); }
    teams[a.unit].push(a);
  }
  Object.keys(acc).forEach(function (c) { if (fyrNamed_(acc, c)) { named++; seat(acc[c]); } });
  Object.keys(FYR_STILL_COUNTED).forEach(function (c) {
    if (fyrNamed_(acc, c)) return;                        // active again: already seated
    seat(acc[c] || { code: c, name: FYR_STILL_COUNTED[c], unit: FYR_HEAD });
  });
  /* Off the board: no row, but their figures stay in their team's totals. */
  var extras = {};
  Object.keys(FYR_OFF_BOARD).forEach(function (c) {
    if (!(acc[c] && acc[c].active)) return;               // not active: a former advisor
    var u = teams[acc[c].unit] ? acc[c].unit : FYR_HEAD;
    (extras[u] = extras[u] || []).push(c);
  });
  /* The head's team first, the rest by name. The wall ranks them by what they
     have written once it is drawing. */
  order.sort(function (x, y) {
    if (x === FYR_HEAD) return -1;
    if (y === FYR_HEAD) return 1;
    return x < y ? -1 : x > y ? 1 : 0;
  });

  var top = { lvl: 0, label: FYR_HIERARCHY, w: [0, 0], m: [0, 0], y: [0, 0] };
  var rows = [top];
  order.forEach(function (u) {
    var team = { lvl: 1, label: u, w: [0, 0], m: [0, 0], y: [0, 0] };
    var kids = teams[u].map(function (a) {
      var w = wk[a.code] || null, m = mo[a.code] || null, y = fy.y[a.code] || null;
      fyrInto_(team.w, w); fyrInto_(team.m, m); fyrInto_(team.y, y);
      var row = { lvl: 2, label: a.code + ' - ' + a.name, w: fyrNz_(w), y: fyrNz_(y) };
      if (hadM) row.m = fyrNz_(m);
      return row;
    });
    (extras[u] || []).forEach(function (c) {
      fyrInto_(team.w, wk[c]); fyrInto_(team.m, mo[c]); fyrInto_(team.y, fy.y[c]);
    });
    fyrInto_(top.w, team.w); fyrInto_(top.m, team.m); fyrInto_(top.y, team.y);
    if (!hadM) delete team.m;
    rows.push(team);
    kids.forEach(function (k) { rows.push(k); });
  });
  /* Brokers with a code, as a team of their own after the units. Their
     business is in the branch's total when they count. */
  var bTeam = { lvl: 1, label: 'Brokers', w: [0, 0], m: [0, 0], y: [0, 0] }, bKids = [];
  FYR_BROKERS.forEach(function (b, i) {
    if (!b || !b.name || !fyrNorm_(b.code)) return;
    var k = 'BROKER' + i, w = wk[k] || null, m = mo[k] || null, y = fy.y[k] || null;
    if (b.counts !== false) { fyrInto_(bTeam.w, w); fyrInto_(bTeam.m, m); fyrInto_(bTeam.y, y); }
    var row = { lvl: 2, label: fyrNorm_(b.code) + ' - ' + b.name, w: fyrNz_(w), y: fyrNz_(y), broker: true };
    if (hadM) row.m = fyrNz_(m);
    bKids.push(row);
  });
  if (bKids.length) {
    fyrInto_(top.w, bTeam.w); fyrInto_(top.m, bTeam.m); fyrInto_(top.y, bTeam.y);
    if (!hadM) delete bTeam.m;
    rows.push(bTeam);
    bKids.forEach(function (k) { rows.push(k); });
  }
  if (!hadM) delete top.m;

  /* New business against increases, month by month from 1 October, for the
     chart. Months with nothing in them are left out, as sfBoardData_ does. */
  var MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var byM = {};
  function addM(r, isInc) {
    var c = fyrId_(r.code), m = Number(r.m);
    if (!c || !fyrCounted_(acc, c) || !(m >= 1 && m <= 12)) return;
    var b = byM[m] || (byM[m] = { nb: 0, inc: 0, apps: 0 });
    if (isInc) b.inc += Number(r.api) || 0; else b.nb += Number(r.api) || 0;
    b.apps += Number(r.apps) || 0;
  }
  fy.monNb.forEach(function (r) { addM(r, false); });
  fy.monInc.forEach(function (r) { addM(r, true); });
  var series = [];
  for (var i = 0; i < 12; i++) {
    var mm = fyrMonthAt_(i), b = byM[mm];
    if (b && (b.nb || b.inc)) series.push({ m: MN[mm - 1], nb: b.nb, inc: b.inc, apps: b.apps });
  }

  /* Former advisors' production is left off the board and out of its totals.
     It is counted here, so the difference shows in the diagnostics. */
  var gone = { w: [0, 0], y: [0, 0], advisors: [] };
  function off(c) {
    if (fyrCounted_(acc, c)) return;
    if (gone.advisors.indexOf(c) < 0) gone.advisors.push(c);
    return true;
  }
  Object.keys(wk).forEach(function (c) { if (off(c)) fyrInto_(gone.w, wk[c]); });
  Object.keys(fy.y).forEach(function (c) { if (off(c)) fyrInto_(gone.y, fy.y[c]); });

  var sub = {};
  Object.keys(S).forEach(function (k) { sub[k] = S[k]; });
  var total = {};
  Object.keys(S.total || {}).forEach(function (k) { total[k] = S.total[k]; });
  total.w = top.w; total.y = top.y;
  if (hadM) total.m = top.m;
  sub.rows = rows;
  sub.total = total;
  sub.series = series;
  sub.yearFrom = from;
  sub.yearLabel = fyrLabel_(from);
  /* The day of the year, in working days, for the headline: "FY27, day 3". */
  var wdy = fyrWorkDay_(from, Utilities.formatDate(new Date(), SF_TZ, 'yyyy-MM-dd'));
  sub.fyDay = wdy.day;
  sub.fyWorkday = wdy.working;

  /* The advisor list beside the board: everyone counted, placed as the Access
     tab has them, with the year counted the same way. */
  var agents = [];
  (d && d.agents || []).forEach(function (x) {
    var c = fyrId_(x.code), b = fyrBroker_(c);
    if (!fyrCounted_(acc, c) || FYR_OFF_BOARD[c]) return;
    var a = acc[c] || {};
    x.name = (b && b.name) || a.name || x.name;
    x.unit = b ? 'Brokers' : (a.unit || FYR_HEAD);
    x.y = fy.y[c] || [0, 0];
    x.inc = fy.inc[c] || [0, 0];
    agents.push(x);
  });

  var diag = {};
  Object.keys((d && d.diag) || {}).forEach(function (k) { diag[k] = d.diag[k]; });
  diag.roster = 'Access tab';
  diag.yearFrom = from;
  diag.active = named;
  diag.stillCounted = Object.keys(FYR_STILL_COUNTED);
  diag.offTheBoard = Object.keys(FYR_OFF_BOARD);
  diag.brokers = FYR_BROKERS.filter(function (b) { return b && b.name; })
                            .map(function (b) { return { name: b.name, linked: !!fyrNorm_(b.code), counts: b.counts !== false }; });
  diag.units = order;
  diag.offBoard = gone;

  /* The month board travels with the board. If Salesforce will not give the
     days, the rest of the board still goes out and the wall skips that slide. */
  var month = null;
  try { month = fyrMonth_(acc, fy); }
  catch (errM) { diag.month = String(errM && errM.message || errM); }
  return { submitted: sub, agents: agents, diag: diag, month: month };
}

function sfBoard(e) {
  /* Pressed Run rather than called: do what pbSalesforce.gs always did here,
     because sfCheck is also what stores the Salesforce credentials. The
     new-year check is fyrCheck, run on its own. */
  if (!e || !e.parameter) return sfCheck();

  /* EVERY ANSWER CARRIES v, so it can be seen from outside which door is
     answering. "sf3-fy" is this one. */
  var V = 'sf3-fy';

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
    var a = fyrBoard_(d);
    out.submitted = a.submitted;
    out.agents = a.agents;
    out.diag = a.diag;
    out.month = a.month;
  } catch (err2) {
    out.note = 'The Access tab could not be applied, so this is the board as Salesforce has it: ' +
               String(err2 && err2.message || err2);
  }
  return sfJson_(out);
}

/* ── the settlement side ───────────────────────────────────────────────── */

/* The latest persistency per advisor, from the last quota report, until the
   FY27 report replaces it. */
function fyrPersistency_() {
  var out = {};
  if (typeof RRB_QUOTA_FY2026 === 'undefined') return out;
  RRB_QUOTA_FY2026.forEach(function (q) {
    var c = fyrKey_(q.code);
    if (c) out[c] = { p2: q.p2, p3: q.p3, p5: q.p5 };
  });
  return out;
}

/**
 * The settlement board for the year we are in. Same tab, same columns, same
 * rules as before - C agent, G plan, H cover, K count (a flag: 1 base, 0
 * rider, -1 reversal, so it is netted), L API, M year, N month, rows without
 * an agent number skipped - with the year running from 1 October, months in
 * the year's own order, and the roster from the Access tab.
 */
function getSettlement(e) {
  var p = (e && e.parameter) || {};
  var who = (typeof rrbAuthorize_ === 'function') ? rrbAuthorize_(e) : null;
  if (!who) return { success: false, error: 'Sign in to see settlement.' };
  var kind = (who.scope && who.scope.kind) || '';
  if (kind !== 'branch' && kind !== 'unit' && kind !== 'guest' && kind !== 'staff') {
    return { success: false, error: 'Settlement is a branch view.' };
  }

  var sh = rrbSettleSheet_();
  if (!sh) return { success: false, error: 'Could not find the "' + RRB_SETTLE_TAB + '" tab.' };
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return { success: false, error: 'That tab is empty.' };

  var from = fyrFrom_(new Date());
  var acc = fyrAccess_();
  var C = 2, G = 6, H = 7, K = 10, L = 11, M = 12, N = 13;   // zero-based

  /* Column G names the plan; the shape sniffer is only for an export that
     changes shape, as before. */
  var prodCol = null, gFilled = 0;
  for (var gr = 1; gr < values.length && gr < 400; gr++) if (String(values[gr][G] || '').trim()) gFilled++;
  if (gFilled) prodCol = { col: G, name: String(values[0][G] || 'plan').trim(), source: 'column G' };
  else if (typeof rrbSettleProductCol_ === 'function') {
    prodCol = rrbSettleProductCol_(values, values[0]);
    if (prodCol) prodCol.source = 'found by shape';
  }
  var planName = (typeof rrbPlanName_ === 'function') ? rrbPlanName_ : function (x) { return String(x || ''); };

  /* Tapping a month on the wall re-ranks the league for that month alone. It
     arrives as a calendar month and becomes a place in the year here. */
  var only = parseInt(String(p.month || ''), 10) || 0;
  var onlyAt = only ? (only - FYR_START_MONTH + 12) % 12 : -1;

  var months = [], byAgent = {}, byProduct = {};
  for (var i = 0; i < 12; i++) months.push({ m: fyrMonthAt_(i), apps: 0, api: 0, cover: 0 });
  var ytd = { apps: 0, api: 0, cover: 0 }, rowsUsed = 0, skipped = 0;
  var gone = { apps: 0, api: 0, advisors: [] };

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var raw = String(row[C] == null ? '' : row[C]).trim();
    if (!/^[AU]\s*\d/i.test(raw) && !fyrBrokerKey_(raw)) { skipped++; continue; }   // totals row, blanks
    var at = fyrIndex_(from, parseInt(row[M], 10), parseInt(row[N], 10));
    if (at < 0) continue;

    var code = fyrId_(raw);
    var cnt = Number(row[K]) || 0;                               // the FLAG, netted
    var api = Number(String(row[L]).replace(/[^0-9.\-]/g, '')) || 0;
    var cov = Number(String(row[H]).replace(/[^0-9.\-]/g, '')) || 0;
    if (!fyrCounted_(acc, code)) {
      gone.apps += cnt; gone.api += api;
      if (gone.advisors.indexOf(code) < 0) gone.advisors.push(code);
      continue;
    }
    rowsUsed++;
    ytd.apps += cnt; ytd.api += api; ytd.cover += cov;
    months[at].apps += cnt; months[at].api += api; months[at].cover += cov;

    if (prodCol) {
      var pn = planName(row[prodCol.col]);
      var pr = byProduct[pn] || (byProduct[pn] = { name: pn, apps: 0, api: 0, cover: 0 });
      pr.apps += cnt; pr.api += api; pr.cover += cov;
    }

    var a = byAgent[code];
    if (!a) {
      a = byAgent[code] = { code: code, name: (acc[code] && acc[code].name) || FYR_STILL_COUNTED[code] ||
                                             (fyrBroker_(code) && fyrBroker_(code).name) || code,
                            apps: 0, api: 0, cover: 0, m: [] };
      for (var z = 0; z < 12; z++) a.m.push({ apps: 0, api: 0, cover: 0 });
    }
    a.apps += cnt; a.api += api; a.cover += cov;
    a.m[at].apps += cnt; a.m[at].api += api; a.m[at].cover += cov;
  }

  /* Named on the wall: active advisors. Javid and Aleema count in every total
     above and are left off the lists, as on the production board. */
  var all = Object.keys(byAgent).map(function (k) { return byAgent[k]; })
                  .filter(function (a) { return fyrNamed_(acc, a.code) && (a.apps !== 0 || a.api !== 0); });
  var matrix = all.map(function (a) {
    return { code: a.code, name: a.name, apps: a.apps, api: a.api, cover: a.cover, m: a.m };
  }).sort(function (x, y) { return y.api - x.api; });
  var agents = all.map(function (a) {
    if (onlyAt < 0) return { code: a.code, name: a.name, apps: a.apps, api: a.api, cover: a.cover };
    var c2 = a.m[onlyAt];
    return { code: a.code, name: a.name, apps: c2.apps, api: c2.api, cover: c2.cover };
  }).filter(function (a) { return a.apps !== 0 || a.api !== 0; })
    .sort(function (x, y) { return y.api - x.api; });

  /* Quotas: every active advisor, with this year's quota and band where they
     have been given and nothing where they have not. Settled is this year's.
     Persistency is the latest the branch has. */
  var pers = fyrPersistency_(), quotas = {}, qb = { quota: 0, settled: 0, agents: 0 };
  Object.keys(acc).forEach(function (c) {
    if (!fyrNamed_(acc, c)) return;
    var q = FYR_QUOTAS[c] || [], ps = pers[c] || {};
    var settled = byAgent[c] ? byAgent[c].api : 0;
    quotas[c] = { name: acc[c].name, type: q[1] || '', quota: Number(q[0]) || 0, settled: settled,
                  p2: ps.p2, p3: ps.p3, p5: ps.p5 };
    qb.quota += Number(q[0]) || 0; qb.settled += settled; qb.agents++;
  });

  /* The target: set, or plainly not set. The goal is the same share of it the
     branch has always worked to. */
  var gp = 0;
  try { gp = parseFloat(PropertiesService.getScriptProperties().getProperty('RRB_SETTLE_GOAL_PCT')); } catch (e2) {}
  if (!(gp > 0 && gp <= 100)) gp = (typeof RRB_SETTLE_GOAL_PCT !== 'undefined') ? RRB_SETTLE_GOAL_PCT : 80;
  var target = Number(FYR_TARGET) || 0, goal = target * gp / 100;
  var nowAt = fyrIndex_(from, Number(Utilities.formatDate(new Date(), SF_TZ, 'yyyy')),
                              Number(Utilities.formatDate(new Date(), SF_TZ, 'M')));
  var left = Math.max(1, 12 - Math.max(0, nowAt));
  var toGo = Math.max(0, goal - ytd.api);
  var doneM = months.filter(function (x) { return x.api !== 0; }).length || 1;
  var avg = ytd.api / doneM;

  return {
    success: true, v: 'settle-fy', year: Number(from.slice(0, 4)), month: only,
    fyStartsOn: from, fyEndsOn: fyrEnds_(from), fyLabel: fyrLabel_(from),
    ytd: ytd, months: months, agents: agents, matrix: matrix,
    quotas: quotas, quotaBranch: qb,
    products: Object.keys(byProduct).map(function (k) { return byProduct[k]; })
                    .filter(function (x) { return x.apps !== 0 || x.api !== 0; })
                    .sort(function (a, b) { return b.api - a.api; }),
    productCol: prodCol ? { name: prodCol.name, source: prodCol.source } : null,
    target: { value: target, source: target ? 'set' : 'not set', mix: null,
              heads: qb.agents, short: 0,
              cap: (typeof RRB_SETTLE_CAP !== 'undefined') ? RRB_SETTLE_CAP : 40,
              deficit: (typeof RRB_SETTLE_DEFICIT !== 'undefined') ? RRB_SETTLE_DEFICIT : 0, quota: {} },
    goal: { pct: gp, value: goal, toGo: toGo,
            pctOfGoal: goal ? (ytd.api / goal * 100) : 0,
            monthsLeft: left, perMonth: goal ? toGo / left : 0,
            fyEnd: FYR_START_MONTH === 1 ? 12 : FYR_START_MONTH - 1,
            avgMonth: avg, times: (goal && avg) ? (toGo / left) / avg : 0 },
    diag: { tab: sh.getName(), rows: values.length - 1, used: rowsUsed, skipped: skipped,
            yearFrom: from, roster: 'Access tab', offBoard: gone }
  };
}

/**
 * Run this from the editor. It writes nothing. It lists the team unit by
 * unit, the year and its quotas, and says whether this file's doors are the
 * ones that answer.
 */
function fyrCheck() {
  var lines = [];
  function say(s) { lines.push(s); console.log(s); }
  var from = fyrFrom_(new Date());
  say('Financial year ' + fyrLabel_(from) + ': ' + from + ' to ' + fyrEnds_(from) + '.');
  say('');
  var acc = fyrAccess_(), units = {}, off = [], kept = [];
  Object.keys(acc).forEach(function (c) {
    var a = acc[c];
    if (!a.active) { off.push(a.name + (FYR_STILL_COUNTED[c] ? ' (still counted)' : '')); return; }
    if (FYR_OFF_BOARD[c]) { kept.push(a.name); return; }
    (units[a.unit] = units[a.unit] || []).push(a.name);
  });
  Object.keys(units).sort().forEach(function (u) {
    say(u + ' (' + units[u].length + '): ' + units[u].join(', '));
  });
  if (kept.length) say('Active, kept off the board, still counted (' + kept.length + '): ' + kept.join(', '));
  say('Not active (' + off.length + '): ' + off.join(', '));
  FYR_BROKERS.forEach(function (b) {
    if (!b || !b.name) return;
    say('Broker: ' + b.name + (fyrNorm_(b.code) ? ', code ' + fyrNorm_(b.code) + (b.counts !== false ? ', in the totals.' : ', not in the totals.')
                                              : ', no code yet: on the wall with the branch, no figures until the code is set.'));
  });
  say('');
  var nq = Object.keys(FYR_QUOTAS).length;
  say(nq ? nq + ' FY27 quota(s) entered.' : 'No FY27 quotas entered yet: the wall shows none.');
  say(FYR_TARGET ? 'Branch target ' + Number(FYR_TARGET).toLocaleString('en-US') + '.'
                 : 'Branch target not set: the settlement board says so.');
  say('');
  say(String(sfBoard).indexOf('fyrBoard_') > -1
      ? 'OK  the production board answers from this file.'
      : 'NOT YET  an older production board is answering. Move FinancialYear to the bottom of the file list.');
  say(String(getSettlement).indexOf('fyrIndex_') > -1
      ? 'OK  the settlement board answers from this file.'
      : 'NOT YET  an older settlement board is answering. Move FinancialYear to the bottom of the file list.');
  try {
    var fy = fyrFigures_(from);
    say('Salesforce: ' + Object.keys(fy.y).length + ' advisor(s) with production since ' + from + '.');
    var mb = fyrMonth_(acc, fy);
    say('The ' + mb.label + ' board: ' + mb.days.length + ' working days, ' + mb.gone + ' gone; ' +
        mb.total.off + ' of ' + mb.total.people + ' advisors off the mark in ' + mb.fyLabel +
        '. Q' + mb.q.n + ' is ' + mb.q.months.join('-') + ', day ' + mb.q.day + ' of ' + mb.q.days + '.');
  } catch (err) {
    say('Salesforce did not answer: ' + (err && err.message || err));
  }
  say('');
  say('When both say OK: Deploy > Manage deployments > the wall\'s deployment > New version.');
  return lines.join('\n');
}
