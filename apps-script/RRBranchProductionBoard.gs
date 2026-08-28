/**
 * RRBranchProductionBoard.gs — the production board, end to end, from the
 * spreadsheet to the wall, with nothing in between that can be misnamed.
 *
 * INSTALL — two steps, then you are done.
 *
 *   1. Paste this whole file in as a new script file.
 *   2. In doGet's router, next to the other actions, add ONE line:
 *
 *          if (action === 'prodboard') return rrbProdBoard(e);
 *
 *      Deploy > Manage deployments > edit > Version: New version > Deploy.
 *
 * Then run rrbProdBoardCheck() once and read the log. It prints what it
 * found, what it could not find, and the totals - so if anything is wrong
 * the log says which thing, rather than the wall going quietly empty.
 *
 * WHY THIS EXISTS RATHER THAN A FIX TO action=submitted
 * That action reads two tabs by exact name and three columns by fixed letter,
 * and every one of those is a thing that can drift. It has: the new-business
 * tab is called "...ThiS YEA SF" so it is not matched at all, and the
 * increases tab IS matched and still returns zero. Two failures, both silent,
 * both invisible from the wall.
 *
 * This finds the tabs by their stem, finds the columns by their HEADINGS
 * rather than by letter, accepts a date whether the cell holds a real Date or
 * text, and computes the week itself. Rename a tab, move a column, or paste
 * dates as text, and it still reads. Nothing here needs Salesforce
 * credentials - the figures are already in the sheet.
 */

var PB_TZ = 'America/Port_of_Spain';

/* ── finding things ─────────────────────────────────────────────────────── */

function pbFlat_(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }

function pbFindTab_(stems) {
  var sheets = SpreadsheetApp.getActive().getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var f = pbFlat_(sheets[i].getName());
    for (var j = 0; j < stems.length; j++) {
      if (f.indexOf(stems[j]) === 0) return sheets[i];
    }
  }
  return null;
}

/** Column index (1-based) whose heading contains all of the given words. */
function pbCol_(headers, words, avoid) {
  for (var i = 0; i < headers.length; i++) {
    var h = pbFlat_(headers[i]);
    if (!h) continue;
    var ok = true;
    for (var w = 0; w < words.length; w++) if (h.indexOf(words[w]) === -1) ok = false;
    if (ok && avoid) for (var a = 0; a < avoid.length; a++) if (h.indexOf(avoid[a]) > -1) ok = false;
    if (ok) return i + 1;
  }
  return 0;
}

/** A date from a Date, or from text like 21/08/2026, 8/21/2026, 2026-08-21. */
function pbDate_(v) {
  if (!v && v !== 0) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? null : v;
  var s = String(v).trim();
  if (!s) return null;
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    var a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
    // A value over 12 in the first slot can only be the day.
    return (a > 12) ? new Date(y, b - 1, a) : new Date(y, a - 1, b);
  }
  var d = new Date(s);
  return isNaN(d) ? null : d;
}

function pbNum_(v) {
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

/* ── reading one source ─────────────────────────────────────────────────── */

function pbRead_(sheet, want, log) {
  var out = { rows: [], note: '' };
  if (!sheet) { out.note = 'tab not found'; return out; }
  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow < 2) { out.note = 'tab is empty'; return out; }

  var all = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var hdr = all[0];

  var cDate  = pbCol_(hdr, want.date)  || want.dateFallback  || 0;
  var cApps  = pbCol_(hdr, want.apps)  || want.appsFallback  || 0;
  var cApi   = pbCol_(hdr, want.api)   || want.apiFallback   || 0;
  var cAgent = pbCol_(hdr, ['agent'], ['email', 'number', 'count']) || 0;
  var cName  = pbCol_(hdr, ['name'],  ['plan', 'client', 'insured']) || 0;
  var cUnit  = pbCol_(hdr, ['unit']) || pbCol_(hdr, ['manager']) || 0;

  out.note = 'date=' + (cDate ? hdr[cDate-1] : 'NOT FOUND') +
             ' | apps=' + (cApps ? hdr[cApps-1] : 'NOT FOUND') +
             ' | api='  + (cApi  ? hdr[cApi-1]  : 'NOT FOUND') +
             ' | agent='+ (cAgent? hdr[cAgent-1]: '-') +
             ' | unit=' + (cUnit ? hdr[cUnit-1] : '-');
  if (!cDate || !cApi) { out.note += '  >>> cannot read without a date and an API column'; return out; }

  for (var r = 1; r < all.length; r++) {
    var d = pbDate_(all[r][cDate - 1]);
    if (!d) continue;
    out.rows.push({
      date:  d,
      apps:  cApps  ? pbNum_(all[r][cApps  - 1]) : 0,
      api:   pbNum_(all[r][cApi - 1]),
      agent: cAgent ? String(all[r][cAgent - 1] || '').trim() : '',
      name:  cName  ? String(all[r][cName  - 1] || '').trim() : '',
      unit:  cUnit  ? String(all[r][cUnit  - 1] || '').trim() : ''
    });
  }
  return out;
}

/* ── the board ──────────────────────────────────────────────────────────── */

function rrbProdBoardData_() {
  var now = new Date();
  var year = now.getFullYear();
  var jan1 = new Date(year, 0, 1);

  // Monday of this week, in branch time.
  var dow = Number(Utilities.formatDate(now, PB_TZ, 'u'));   // 1 = Monday
  var monday = new Date(now.getTime() - (dow - 1) * 86400000);
  monday.setHours(0, 0, 0, 0);

  var nbTab  = pbFindTab_(['branchproductionpickupdate', 'productionpickupdate']);
  var incTab = pbFindTab_(['increasespickedup', 'increases']);

  var nb  = pbRead_(nbTab,  { date: ['pick', 'up', 'date'], apps: ['app', 'count'], api: ['total', 'api'],
                              dateFallback: 1, appsFallback: 7, apiFallback: 8 });
  var inc = pbRead_(incTab, { date: ['pick', 'up', 'date'], apps: ['app', 'count'], api: ['api'],
                              dateFallback: 9, appsFallback: 10, apiFallback: 11 });

  var agents = {};
  function add(r, isInc) {
    var key = r.agent || r.name || '(unattributed)';
    var a = agents[key] || (agents[key] = { code: r.agent, name: r.name, unit: r.unit,
                                            w: [0, 0], y: [0, 0], inc: [0, 0] });
    if (!a.unit && r.unit) a.unit = r.unit;
    if (!a.name && r.name) a.name = r.name;
    if (r.date >= jan1) { a.y[0] += r.apps; a.y[1] += r.api;
                          if (isInc) { a.inc[0] += r.apps; a.inc[1] += r.api; } }
    if (r.date >= monday) { a.w[0] += r.apps; a.w[1] += r.api; }
  }
  nb.rows.forEach(function (r) { add(r, false); });
  inc.rows.forEach(function (r) { add(r, true); });

  // unit -> agents, in the shape the wall draws
  var byUnit = {};
  Object.keys(agents).forEach(function (k) {
    var a = agents[k];
    var u = a.unit || 'Unassigned';
    (byUnit[u] = byUnit[u] || []).push(a);
  });

  var rows = [], TW = [0, 0], TY = [0, 0];
  Object.keys(byUnit).sort().forEach(function (u) {
    var list = byUnit[u], uw = [0, 0], uy = [0, 0];
    list.forEach(function (a) { uw[0]+=a.w[0]; uw[1]+=a.w[1]; uy[0]+=a.y[0]; uy[1]+=a.y[1]; });
    rows.push({ lvl: 0, label: u, w: uw, y: uy });
    TW[0]+=uw[0]; TW[1]+=uw[1]; TY[0]+=uy[0]; TY[1]+=uy[1];
    list.sort(function (x, y) { return y.y[1] - x.y[1]; }).forEach(function (a) {
      var label = a.code ? (a.code + (a.name ? ' - ' + a.name : '')) : (a.name || '(unattributed)');
      rows.push({ lvl: 2, label: label,
                  w: (a.w[0] || a.w[1]) ? a.w : null,
                  y: (a.y[0] || a.y[1]) ? a.y : null });
    });
  });

  // new business against increases, by month, for the trend
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var series = [];
  for (var m = 0; m < 12; m++) {
    var nbv = 0, iv = 0;
    nb.rows.forEach(function (r) { if (r.date >= jan1 && r.date.getMonth() === m) nbv += r.api; });
    inc.rows.forEach(function (r) { if (r.date >= jan1 && r.date.getMonth() === m) iv  += r.api; });
    if (nbv || iv) series.push({ m: months[m], nb: nbv, inc: iv });
  }

  return {
    submitted: {
      asAt: Utilities.formatDate(now, PB_TZ, 'd MMM yyyy'),
      week: Number(Utilities.formatDate(now, PB_TZ, 'w')),
      rows: rows,
      total: { w: TW, y: TY },
      series: series
    },
    _diag: {
      newBusinessTab: nbTab ? nbTab.getName() : null,  newBusinessCols: nb.note,  newBusinessRows: nb.rows.length,
      increasesTab:   incTab ? incTab.getName() : null, increasesCols:  inc.note, increasesRows:  inc.rows.length,
      weekFrom: Utilities.formatDate(monday, PB_TZ, 'yyyy-MM-dd'),
      agents: Object.keys(agents).length
    }
  };
}

function rrbProdBoard(e) {
  var who = (typeof rrbAuthorize_ === 'function') ? rrbAuthorize_(e) : null;
  if (!who || !who.ok) return rrbJson_({ ok: false, error: 'Your session has expired. Please sign in again.' });
  var scope = (typeof rrbScopeForRole_ === 'function') ? rrbScopeForRole_(who) : null;
  if (!scope || scope.kind !== 'branch') return rrbJson_({ ok: true, submitted: null });

  var d = rrbProdBoardData_();
  return rrbJson_({ ok: true, submitted: d.submitted, diag: d._diag });
}

/** Run this once and read the log. It answers every question at once. */
function rrbProdBoardCheck() {
  var d = rrbProdBoardData_(), g = d._diag, s = d.submitted;
  Logger.log('NEW BUSINESS tab : ' + (g.newBusinessTab || 'NOT FOUND'));
  Logger.log('   columns       : ' + g.newBusinessCols);
  Logger.log('   dated rows    : ' + g.newBusinessRows);
  Logger.log('');
  Logger.log('INCREASES tab    : ' + (g.increasesTab || 'NOT FOUND'));
  Logger.log('   columns       : ' + g.increasesCols);
  Logger.log('   dated rows    : ' + g.increasesRows);
  Logger.log('');
  Logger.log('Week starts      : ' + g.weekFrom);
  Logger.log('Advisors found   : ' + g.agents);
  Logger.log('Board rows       : ' + s.rows.length);
  Logger.log('TOTAL week       : ' + s.total.w[0] + ' apps  $' + s.total.w[1].toFixed(2));
  Logger.log('TOTAL year       : ' + s.total.y[0] + ' apps  $' + s.total.y[1].toFixed(2));
  Logger.log('');
  s.rows.slice(0, 14).forEach(function (r) {
    Logger.log('  ' + (r.lvl ? '    ' : '') + r.label +
               '   y=' + (r.y ? r.y[0] + '/' + r.y[1].toFixed(2) : '-'));
  });
}
