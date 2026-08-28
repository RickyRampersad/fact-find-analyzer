/**
 * RRBranchFixTab.gs — renames the one tab that is stopping the production
 * board from populating, and tells you whether it worked.
 *
 * HOW TO USE
 *   1. Paste this file into the Apps Script project.
 *   2. Select rrbFixProductionTab from the function list and press Run.
 *   3. Read the log.
 *
 * Nothing is deployed and nothing else is touched. It renames a sheet tab.
 *
 * WHY
 * action=submitted reads two tabs by name:
 *     "Branch Production Pick Up Date This Year"   <- new business
 *     "Increases Picked Up This Year"              <- increases
 * The first one is actually called "Branch Production Pick Up Date ThiS YEA
 * SF", so it does not match, gets classified as a roster tab, and the
 * new-business half of the report reads nothing. Every figure comes back
 * zero and the agents list comes back empty.
 */

var WANTED = 'Branch Production Pick Up Date This Year';

function rrbFixProductionTab() {
  var ss = SpreadsheetApp.getActive();
  var tabs = ss.getSheets();

  Logger.log('Spreadsheet: ' + ss.getName());
  Logger.log('Tabs before:');
  tabs.forEach(function (s) { Logger.log('   "' + s.getName() + '"'); });
  Logger.log('');

  var exact = null, candidate = null;
  tabs.forEach(function (s) {
    var n = s.getName();
    if (n === WANTED) exact = s;
    // Same tab whatever the capitals and spacing: "Branch Production Pick Up
    // Date ThiS YEA SF" and the wanted name share this stem.
    var flat = n.toLowerCase().replace(/[^a-z]/g, '');
    if (!exact && flat.indexOf('branchproductionpickupdate') === 0) candidate = s;
  });

  if (exact) {
    Logger.log('Already correct — a tab named "' + WANTED + '" exists.');
    Logger.log('So the zeros are NOT the tab name. Check the date column on');
    Logger.log('that tab: the report reads column A (Production Picked up Date).');
    return;
  }
  if (!candidate) {
    Logger.log('No tab looks like the production pick-up tab at all.');
    Logger.log('Nothing renamed. The tab may live in a different spreadsheet.');
    return;
  }

  var was = candidate.getName();
  candidate.setName(WANTED);
  Logger.log('Renamed:');
  Logger.log('   from "' + was + '"');
  Logger.log('     to "' + WANTED + '"');
  Logger.log('');
  Logger.log('Rows on that tab: ' + candidate.getLastRow());
  Logger.log('Columns:          ' + candidate.getLastColumn());
  var hdr = candidate.getRange(1, 1, 1, Math.min(12, candidate.getLastColumn()))
                     .getValues()[0];
  Logger.log('Header row:       ' + hdr.join(' | '));
  Logger.log('');
  Logger.log('Now open the wall and go to the production slide. If it is still');
  Logger.log('empty, run rrbSubmittedCheck() next — that reads the tab and');
  Logger.log('reports whether the figures reconcile.');
}
