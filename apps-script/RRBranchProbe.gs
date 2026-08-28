/**
 * RRBranchProbe.gs — READ ONLY. Changes nothing. Tells me exactly why the
 * production board is empty, in one run.
 *
 *   1. Paste this file into the Apps Script project.
 *   2. Choose rrbProbe from the function list and press Run.
 *   3. Copy the whole log back to me.
 *
 * WHY THIS RATHER THAN ANOTHER GUESS
 * Renaming the tab was my answer and it is not the whole answer. The
 * increases tab IS named correctly, IS detected correctly, and still returns
 * zero - so something else is wrong as well, and it is in the columns rather
 * than the names. I cannot see the columns from here: Drive lets me read the
 * first tab of this spreadsheet and no further.
 *
 * This prints, for both production tabs: the real name, the row count, the
 * header row, and three sample rows with the columns the report claims to
 * read (A/G/H for new business, I/J/K for increases). That is everything I
 * need to write a reader that works, and it is one Run rather than four more
 * rounds of me asking you to check things.
 */

function rrbProbe() {
  var ss = SpreadsheetApp.getActive();
  Logger.log('SPREADSHEET: ' + ss.getName());
  Logger.log('');

  var sheets = ss.getSheets();
  Logger.log('ALL TABS (' + sheets.length + '):');
  sheets.forEach(function (s, i) {
    Logger.log('  [' + i + '] "' + s.getName() + '"  rows=' + s.getLastRow() +
               '  cols=' + s.getLastColumn());
  });
  Logger.log('');

  // The two the report claims to read, matched on stem so capitals and
  // stray words do not hide them.
  var want = [
    { label: 'NEW BUSINESS', stem: 'branchproductionpickupdate', cols: [1, 7, 8] },
    { label: 'INCREASES',    stem: 'increasespickedup',          cols: [9, 10, 11] }
  ];

  want.forEach(function (w) {
    var found = null;
    sheets.forEach(function (s) {
      var flat = s.getName().toLowerCase().replace(/[^a-z]/g, '');
      if (!found && flat.indexOf(w.stem) === 0) found = s;
    });
    Logger.log('──────── ' + w.label + ' ────────');
    if (!found) { Logger.log('  NOT FOUND in this spreadsheet.'); Logger.log(''); return; }

    Logger.log('  tab      "' + found.getName() + '"');
    var lastRow = found.getLastRow(), lastCol = found.getLastColumn();
    Logger.log('  rows     ' + lastRow + '    cols ' + lastCol);
    if (lastRow < 1) { Logger.log('  EMPTY TAB.'); Logger.log(''); return; }

    var hdr = found.getRange(1, 1, 1, lastCol).getValues()[0];
    var letters = [];
    for (var i = 0; i < hdr.length; i++) {
      letters.push(String.fromCharCode(65 + i) + '=' + hdr[i]);
    }
    Logger.log('  header   ' + letters.join(' | '));

    // What is actually in the three columns the report reads
    var n = Math.min(3, lastRow - 1);
    for (var r = 2; r < 2 + n; r++) {
      var out = [];
      w.cols.forEach(function (c) {
        if (c > lastCol) { out.push('col' + c + '=<beyond last column>'); return; }
        var v = found.getRange(r, c).getValue();
        var t = Object.prototype.toString.call(v);
        out.push(String.fromCharCode(64 + c) + '=' + v + ' (' + t.slice(8, -1) + ')');
      });
      Logger.log('  row ' + r + '   ' + out.join('   '));
    }

    // How many rows fall inside this year on the date column the report uses
    var dateCol = w.cols[0];
    if (dateCol <= lastCol && lastRow > 1) {
      var vals = found.getRange(2, dateCol, lastRow - 1, 1).getValues();
      var inYear = 0, isDate = 0, blank = 0;
      var y0 = new Date('2026-01-01'), y1 = new Date('2026-12-31');
      vals.forEach(function (row) {
        var v = row[0];
        if (v === '' || v === null) { blank++; return; }
        if (Object.prototype.toString.call(v) === '[object Date]') {
          isDate++;
          if (v >= y0 && v <= y1) inYear++;
        }
      });
      Logger.log('  date col ' + String.fromCharCode(64 + dateCol) +
                 ': ' + isDate + ' real dates, ' + blank + ' blank, ' +
                 inYear + ' inside 2026');
      if (isDate === 0) {
        Logger.log('  >>> nothing in that column is a DATE. That alone returns zero.');
      }
    }
    Logger.log('');
  });

  Logger.log('Done. Nothing was changed. Copy this whole log back.');
}
