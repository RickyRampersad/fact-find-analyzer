/**
 * pbBoard.gs — the production board, read straight from the spreadsheet.
 *
 * EVERY NAME IN THIS FILE STARTS WITH pb.
 * The previous version defined rrbProdBoard, and so did the copy already in
 * this project - two definitions of the same name, and Apps Script ran the
 * old one every time. That is why the same ReferenceError kept coming back
 * from a line number that does not exist in the new code. Nothing here can
 * collide with anything already in the project.
 *
 * TO USE
 *   1. Left sidebar, + next to Files, Script. Call it pbBoard.
 *   2. Paste this whole file in, replacing the "function myFunction" stub.
 *   3. Ctrl+S to save.
 *   4. Function dropdown at the top: choose pbCheck. Press Run.
 *
 * Delete any earlier file you pasted this into. Leaving it there is what
 * caused the clash.
 *
 * ONCE THE LOG LOOKS RIGHT, and only then, add one line to doGet's router:
 *
 *       if (action === 'prodboard') return pbBoard(e);
 *
 * then Deploy > Manage deployments > edit > New version > Deploy.
 */

var PB_TZ = 'America/Port_of_Spain';

/* WHICH SPREADSHEET.
   getActive() returns the file the script is BOUND to. This project is not
   bound to the one holding the production tabs - the first run reported both
   tabs NOT FOUND while action=diag, in the same project, was reading them
   perfectly well by id. diag names that id, so this uses it, and falls back
   to getActive() only if opening it fails. */
var PB_SHEET_ID = '1K65acMFFhmHt17hRozATnYda9t_BB63absPLeLx53h0';

function pbBook_() {
  if (PB_SHEET_ID) {
    try { return SpreadsheetApp.openById(PB_SHEET_ID); } catch (err) {}
  }
  return SpreadsheetApp.getActive();
}

/* ── finding things ─────────────────────────────────────────────────────── */

function pbFlat_(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }

function pbFindTab_(stems) {
  var book = pbBook_();
  if (!book) return null;
  var sheets = book.getSheets();
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
  /* The code column first, by any of the names it is actually given. My
     first cut excluded any heading containing "number", which would have
     thrown away "Agent Number" - the most likely name for the column I
     want. Then a name column, and the unit if the tab carries one. */
  var cAgent = pbCol_(hdr, ['agent', 'code'])
            || pbCol_(hdr, ['agent', 'number'])
            || pbCol_(hdr, ['agent', 'no'])
            || pbCol_(hdr, ['agent'], ['email', 'name'])
            || 0;
  var cName  = pbCol_(hdr, ['agent', 'name'])
            || pbCol_(hdr, ['name'], ['plan', 'client', 'insured', 'product'])
            || 0;
  if (cName && cName === cAgent) cAgent = 0;   /* one column cannot be both */
  var cUnit  = pbCol_(hdr, ['unit']) || pbCol_(hdr, ['manager']) || pbCol_(hdr, ['hierarch']) || 0;

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

function pbData_() {
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
  if (!nb.rows.length && nbTab) {   /* "API" on its own, if "Total API" is not there */
    nb = pbRead_(nbTab, { date: ['pick', 'up', 'date'], apps: ['app', 'count'], api: ['api'],
                          dateFallback: 1, appsFallback: 7, apiFallback: 8 });
  }
  var inc = pbRead_(incTab, { date: ['pick', 'up', 'date'], apps: ['app', 'count'], api: ['api', 'increase'],
                              dateFallback: 9, appsFallback: 10, apiFallback: 11 });
  if (!inc.rows.length && incTab) {   /* or any date column the tab does have */
    inc = pbRead_(incTab, { date: ['date'], apps: ['app', 'count'], api: ['api'],
                            dateFallback: 9, appsFallback: 10, apiFallback: 11 });
  }

  /* ONE ADVISOR, ONE ROW.
     The check found fifty five advisors where the branch has thirty two,
     because the two tabs name people differently: new business carries
     "A12397 - Fawwaz Mohamed" in one cell, and increases carries just
     "Fawwaz" in an Agent column. Keyed on the raw text those are two people,
     and the board splits somebody's own increases away from their new
     business. So: pull the code out of a combined cell, remember which first
     name belongs to which code, and use the code as the key wherever one can
     be found. */
  var codeOfFirstName = {};
  function pbSplit_(raw) {
    var t = String(raw == null ? '' : raw).trim();
    var m = t.match(/^([A-Za-z]\d{4,6})\s*[-–]\s*(.+)$/);
    if (m) return { code: m[1].toUpperCase(), name: m[2].trim() };
    if (/^[A-Za-z]\d{4,6}$/.test(t)) return { code: t.toUpperCase(), name: '' };
    return { code: '', name: t };
  }
  function pbIndex_(rows) {
    rows.forEach(function (r) {
      var a = pbSplit_(r.agent), b = pbSplit_(r.name);
      var code = a.code || b.code, nm = a.name || b.name;
      if (!code || !nm) return;
      var first = nm.split(/\s+/)[0].toLowerCase();
      if (first && !codeOfFirstName[first]) codeOfFirstName[first] = { code: code, name: nm };
    });
  }
  pbIndex_(nb.rows); pbIndex_(inc.rows);

  var agents = {};
  function add(r, isInc) {
    var a1 = pbSplit_(r.agent), a2 = pbSplit_(r.name);
    var code = a1.code || a2.code;
    var name = a1.name || a2.name;
    if (!code && name) {                    /* a bare first name from increases */
      var hit = codeOfFirstName[name.split(/\s+/)[0].toLowerCase()];
      if (hit) { code = hit.code; if (!name || name.indexOf(' ') === -1) name = hit.name; }
    }
    var key = code || name || '(unattributed)';
    var a = agents[key] || (agents[key] = { code: code, name: name, unit: r.unit,
                                            w: [0, 0], y: [0, 0], inc: [0, 0] });
    if (!a.unit && r.unit) a.unit = r.unit;
    if (!a.name && name) a.name = name;
    if (!a.code && code) a.code = code;
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

/* Its own JSON output, under its own name. This file assumed the project
   had a shared JSON helper and it does not - pbBoard threw a
   ReferenceError on the first run. Nothing here depends on a helper existing
   elsewhere now, and the pb_ prefix cannot collide with anything already in
   the project. */
function pbJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function pbBoard(e) {
  /* Pressed Run rather than called by the server. There is no request object
     and so no session, and every earlier attempt at this ended in "expired"
     or worse. Behave like the check instead, so it does not matter which of
     the two is selected in the dropdown. */
  if (!e || !e.parameter) return pbCheck();

  var who = (typeof rrbAuthorize_ === 'function') ? rrbAuthorize_(e) : null;
  if (!who || !who.ok) return pbJson_({ ok: false, error: 'Your session has expired. Please sign in again.' });
  var scope = (typeof rrbScopeForRole_ === 'function') ? rrbScopeForRole_(who) : null;
  if (!scope || scope.kind !== 'branch') return pbJson_({ ok: true, submitted: null });

  var d = pbData_();
  return pbJson_({ ok: true, submitted: d.submitted, diag: d._diag });
}

/**
 * RUN THIS ONE, not pbBoard.
 * pbBoard is the web-app handler: it expects the request object the
 * server hands it, so pressing Run on it directly means there is no session
 * and it answers "expired" at best. This reads the sheet exactly the same way
 * and prints what it found.
 */
function pbCheck() {
  /* Name the spreadsheet and list every tab first. "NOT FOUND" on its own
     sent me looking at column names when the script was reading the wrong
     file entirely; this makes that impossible to mistake again. */
  var book = pbBook_();
  console.log('SPREADSHEET      : ' + (book ? book.getName() : 'NONE OPENED'));
  console.log('   id            : ' + (book ? book.getId() : '-'));
  if (book) {
    console.log('   tabs          :');
    book.getSheets().forEach(function (sh) {
      console.log('      "' + sh.getName() + '"  rows=' + sh.getLastRow());
    });
  }
  console.log('');

  var d = pbData_(), g = d._diag, s = d.submitted;
  console.log('NEW BUSINESS tab : ' + (g.newBusinessTab || 'NOT FOUND'));
  console.log('   columns       : ' + g.newBusinessCols);
  console.log('   dated rows    : ' + g.newBusinessRows);
  console.log('');
  console.log('INCREASES tab    : ' + (g.increasesTab || 'NOT FOUND'));
  console.log('   columns       : ' + g.increasesCols);
  console.log('   dated rows    : ' + g.increasesRows);
  console.log('');
  console.log('Week starts      : ' + g.weekFrom);
  console.log('Advisors found   : ' + g.agents);
  console.log('Board rows       : ' + s.rows.length);
  console.log('TOTAL week       : ' + s.total.w[0] + ' apps  $' + s.total.w[1].toFixed(2));
  console.log('TOTAL year       : ' + s.total.y[0] + ' apps  $' + s.total.y[1].toFixed(2));
  console.log('');
  s.rows.slice(0, 14).forEach(function (r) {
    console.log('  ' + (r.lvl ? '    ' : '') + r.label +
               '   y=' + (r.y ? r.y[0] + '/' + r.y[1].toFixed(2) : '-'));
  });

  /* Returned as well as logged. Logger.log wrote nothing visible on the last
     run - ten seconds of work and an empty log - so the headline figures come
     back as the function's result too, where the editor always shows them. */
  return 'TABS ' + (book ? book.getSheets().length : 0) +
         ' | NB tab: ' + (g.newBusinessTab || 'NOT FOUND') +
         ' (' + g.newBusinessRows + ' rows)' +
         ' | INC tab: ' + (g.increasesTab || 'NOT FOUND') +
         ' (' + g.increasesRows + ' rows)' +
         ' | advisors ' + g.agents +
         ' | week ' + s.total.w[0] + '/' + s.total.w[1].toFixed(2) +
         ' | year ' + s.total.y[0] + '/' + s.total.y[1].toFixed(2);
}
