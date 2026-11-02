/**
 * RemoveLeavers.gs: delete the stored passwords of agents who have left.
 *
 * WHY (2 November 2026)
 *   The Script properties page lists an RRB_PW_<e-mail> entry for every person
 *   who ever set a fact find password, departed agents included, and Google
 *   makes the page read-only past 50 properties, so they cannot be deleted
 *   there. Ricky Rampersad: "the agents who have left … can't I remove their
 *   names?"
 *
 * FIRST: set each departed agent to Not Active on the Access tab of the
 * Confidential Fact Find workbook (or delete their row). That is what decides
 * who may sign in. This file only removes their stored password.
 *
 * HOW
 *   1. Type the departed agents' e-mail addresses between the brackets in
 *      rrbRemoveLeavers, in quotes, separated by commas.
 *   2. Choose rrbRemoveLeaversPreview and press Run: it lists what would be
 *      deleted and deletes nothing.
 *   3. Choose rrbRemoveLeavers and press Run: it deletes them.
 *   4. Empty the brackets again and save. No names are left in the code
 *      (the .gs files are published with the website).
 *   Only RRB_PW_ entries for the addresses you type are touched. Nothing is
 *   e-mailed. A deleted entry cannot be brought back; the person would set a
 *   new password only if the Access tab still lets them in.
 */
function rrbLeaverEmails_() {
  return [
    // 'someone@myguardiangroup.com',
  ];
}

function rrbRemoveLeaversPreview() { return rrbRemoveLeavers_(false); }
function rrbRemoveLeavers() { return rrbRemoveLeavers_(true); }

function rrbRemoveLeavers_(doIt) {
  var p = PropertiesService.getScriptProperties();
  var all = p.getKeys();
  var wanted = rrbLeaverEmails_().map(function (e) { return String(e || '').trim().toLowerCase(); }).filter(Boolean);
  if (!wanted.length) { Logger.log('No e-mail addresses typed in rrbLeaverEmails_. Nothing to do.'); return []; }
  var found = [], missing = [];
  wanted.forEach(function (e) {
    var key = all.filter(function (k) { return k.toLowerCase() === ('rrb_pw_' + e); })[0];
    if (key) found.push(key); else missing.push(e);
  });
  if (doIt) found.forEach(function (k) { p.deleteProperty(k); });
  Logger.log('%s %s stored password(s): %s', doIt ? 'Deleted' : 'Would delete', found.length,
             found.map(function (k) { return k.replace(/^RRB_PW_/i, ''); }).join(', ') || 'none');
  if (missing.length) Logger.log('No stored password for: %s (check the spelling).', missing.join(', '));
  Logger.log('Properties in the project now: %s.', p.getKeys().length);
  if (doIt) Logger.log('Now empty the list in rrbLeaverEmails_ and save.');
  return found;
}
