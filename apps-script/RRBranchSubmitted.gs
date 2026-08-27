/**
 * RRBranchSubmitted.gs — the SUBMITTED production report, for the wall.
 *
 * WHY THIS IS A SCRIPT FUNCTION AND NOT DATA IN THE PAGE
 * wall.html is served by Netlify from the repository root, so anything baked
 * into it can be read by anyone who opens the page source. The sign-in gate
 * hides the panel from the screen and from nobody else. This report names
 * every agent in the branch with their code and what they wrote, and it is
 * marked confidential — branch management only. So it is served from here,
 * behind rrbAuthorize_, and only to branch scope. The bytes never reach a
 * browser that should not have them.
 *
 * INSTALL — two steps.
 *
 * 1. Paste this whole file in as a new script file.
 *
 * 2. In doGet's router, next to the other actions, add this line:
 *
 *        if (action === 'submitted') return rrbSubmitted(e);
 *
 * Then Deploy > Manage deployments > edit > Version: New version > Deploy.
 *
 * WHERE THE NUMBERS COME FROM
 * Sasha circulates the report as a sheet. Point SUBMITTED_SHEET at the tab
 * holding it. The tab is read exactly as laid out — one Hierarchy column and
 * six number columns — so when the report is refreshed the wall follows with
 * no code change. Indentation in column A is what says which level a row is:
 * a unit code at the margin, a manager indented once, an agent indented
 * again. That is how the report is already written, so nothing has to be
 * added to it.
 */

var SUBMITTED_SHEET = 'SUBMITTED';   // the tab name holding the report

function rrbSubmitted(e) {
  var who = rrbAuthorize_(e);
  if (!who || !who.ok) return rrbJson_({ ok: false, error: 'not signed in' });

  var scope = rrbScopeForRole_(who);
  if (!scope || scope.kind !== 'branch') {
    // Not an error, and deliberately not a message that confirms the report
    // exists. An advisor asking for it simply gets nothing back.
    return rrbJson_({ ok: true, submitted: null });
  }

  var sh = SpreadsheetApp.getActive().getSheetByName(SUBMITTED_SHEET);
  if (!sh) return rrbJson_({ ok: false, error: 'no sheet named ' + SUBMITTED_SHEET });

  var values = sh.getDataRange().getValues();
  var rows = [], total = null, started = false;

  for (var i = 0; i < values.length; i++) {
    var raw = String(values[i][0] == null ? '' : values[i][0]);
    var label = raw.replace(/\s+$/, '');
    var bare  = label.replace(/^\s+/, '');
    if (!bare) continue;

    // Skip down to the header, then read what follows.
    if (!started) {
      if (/^hier/i.test(bare)) started = true;
      continue;
    }

    var nums = [];
    for (var c = 1; c <= 6; c++) {
      var v = values[i][c];
      nums.push((v === '' || v === null || v === undefined) ? null : Number(v));
    }
    var per = { w: [nums[0], nums[1]], m: [nums[2], nums[3]], y: [nums[4], nums[5]] };

    if (/^total$/i.test(bare)) { total = per; continue; }

    // Leading whitespace decides the level, which is how the report already
    // reads. A tab counts the same as a run of spaces.
    var lead = label.length - bare.length;
    var lvl  = lead >= 6 ? 2 : lead >= 1 ? 1 : 0;

    rows.push({ lvl: lvl, label: bare, w: per.w, m: per.m, y: per.y });
  }

  return rrbJson_({
    ok: true,
    submitted: {
      asAt: Utilities.formatDate(new Date(), 'America/Port_of_Spain', 'd MMM yyyy'),
      rows: rows,
      total: total
    }
  });
}

/**
 * Read-only check. Run this and look at the log: it prints the level, the
 * label and the year-to-date figures, and then whether the rows add up to
 * the report's own Total. If the totals do not reconcile, the tab is not
 * laid out the way this expects and the wall should not be shown it.
 */
function rrbSubmittedCheck() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SUBMITTED_SHEET);
  if (!sh) { Logger.log('No sheet named ' + SUBMITTED_SHEET); return; }

  var fake = { parameter: {} };
  var out;
  try {
    out = JSON.parse(rrbSubmitted(fake).getContent());
  } catch (err) {
    Logger.log('rrbSubmitted threw: ' + err);
    return;
  }
  if (!out.submitted) { Logger.log('No rows returned (not branch scope, or empty tab).'); return; }

  var r = out.submitted.rows, t = out.submitted.total || {};
  var pad = function (s, n) { s = String(s); while (s.length < n) s += ' '; return s; };

  Logger.log(pad('LVL', 5) + pad('LABEL', 34) + pad('APPS-Y', 9) + 'API-Y');
  for (var i = 0; i < r.length; i++) {
    Logger.log(pad(r[i].lvl, 5) + pad(r[i].label, 34) +
               pad(r[i].y[0] == null ? '' : r[i].y[0], 9) +
               (r[i].y[1] == null ? '' : r[i].y[1]));
  }

  var sums = { w: [0, 0], m: [0, 0], y: [0, 0] };
  for (var j = 0; j < r.length; j++) {
    if (r[j].lvl !== 0) continue;
    ['w', 'm', 'y'].forEach(function (k) {
      sums[k][0] += r[j][k][0] || 0;
      sums[k][1] += r[j][k][1] || 0;
    });
  }
  Logger.log('');
  ['w', 'm', 'y'].forEach(function (k) {
    var got = sums[k], want = t[k] || [0, 0];
    Logger.log(k + '  units add to ' + got[0] + ' / ' + got[1].toFixed(2) +
               '   report total ' + want[0] + ' / ' + Number(want[1]).toFixed(2) +
               '   ' + ((Math.abs(got[0] - want[0]) < 0.01 &&
                         Math.abs(got[1] - want[1]) < 0.01) ? 'reconciles' : 'DOES NOT RECONCILE'));
  });
}
