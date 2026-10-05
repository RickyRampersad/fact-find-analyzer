/**
 * WhyCantSee.gs — why an advisor cannot sign in, or cannot see a fact find.
 *
 * Fill in the two lines below, pick rrbWhyCantSee in the function dropdown,
 * Run, and read the log. It writes nothing and sends nothing.
 *
 * It answers, in order:
 *   1. Can this agent number sign in? The Access tab row, the email it signs
 *      in under, whether an access code is stored for that email, and, if you
 *      type the code they use, whether it matches.
 *   2. Whose unit their fact finds go to, so you know which manager sees them.
 *   3. Every fact find and every saved draft under their agent number.
 *   4. If you name a client, every fact find and draft for that client under
 *      ANY agent number - the usual reason a case is missing is that it was
 *      saved under somebody else's number, or never submitted.
 *
 * Built 5 October 2026, when Stephanie Rajkumar (A12408) could not sign in on
 * factfind360.com and neither she nor Akaash could see one of her cases.
 *
 * rrbClearSignInLock, below it, lifts the hour-long lockout that five wrong
 * access codes put on an advisor. It removes that one counter and nothing
 * else. Run it once they have the right code, or they lock themselves out
 * again.
 */

var WCS_CODE   = 'A12408';   // the advisor's agent number
var WCS_CLIENT = '';         // part of the client's name, e.g. their first name; blank to skip
var WCS_PW     = '';         // optional: the access code they type; blank to skip that check

function rrbWhyCantSee() {
  var out = [];
  function say(s) { out.push(s === undefined ? '' : String(s)); }
  var code = String(WCS_CODE || '').trim().toUpperCase();
  var want = String(WCS_CLIENT || '').trim().toLowerCase();
  say('Checking ' + code + (want ? ', and client "' + WCS_CLIENT + '"' : '') + '. Nothing is written or sent.');
  say('');

  /* 1. Sign-in. The same rules rrbLogin uses: an Active row with this agent
     number and an email, and an access code stored for that email. */
  var people = [];
  try { people = rrbAccessSheet_(); } catch (err) { say('Could not read the Access tab: ' + err.message); }
  var rows = people.filter(function (p) { return p.code === code; });
  say('1. SIGN-IN');
  if (!rows.length) {
    say('   NO ROW on the Access tab with agent number ' + code + ' and an email.');
    say('   Fix: put the number in Agent Number and the email in Email on their row.');
  }
  rows.forEach(function (p) {
    say('   Access tab: ' + p.name + ' <' + p.email + '>, role "' + p.role + '", unit "' + p.unit +
        '", ' + (p.active ? 'Active' : 'NOT ACTIVE - they cannot sign in'));
  });
  var me = rows.filter(function (p) { return p.active; })[0];
  if (me) {
    var stored = PropertiesService.getScriptProperties().getProperty(RRB_PROP_PW + me.email);
    say('   Access code stored for ' + me.email + ': ' + (stored ? 'yes' :
        'NO - run rrbSyncAccessPasswords, or they are refused whatever they type'));
    if (!String(me.pw == null ? '' : me.pw).trim()) say('   Access code column is EMPTY on their row - nothing to sign in with.');
    if (stored && String(me.pw == null ? '' : me.pw).trim()) {
      /* The stored copy is a hash. Compare it with the sheet's code without
         printing either, so the log shows only whether they agree. */
      var sheetOk = rrbCheckPassword_(me.email, String(me.pw).trim());
      say('   The stored code matches the code on the sheet: ' + (sheetOk ? 'yes' :
          'NO - the sheet was changed after the last sync. Run rrbSyncAccessPasswords.'));
      if (sheetOk) {
        say('   So sign-in accepts exactly the code in the Access code column of their row.');
        say('   If they are refused, they are typing something else: give them that code.');
      }
    }
    if (WCS_PW) {
      var typed = rrbCheckPassword_(me.email, String(WCS_PW));
      say('   The code you typed above matches: ' + (typed ? 'yes' : 'NO - that is not their code'));
      if (typed) {
        var res = rrbLogin({ parameter: { code: code, pw: String(WCS_PW) } });
        say('   This version of the system signs them in: ' + (res.ok ? 'YES, as ' + res.role +
            ', seeing ' + (res.scope && res.scope.kind) : 'NO - ' + res.error));
      }
    }
    var tries = parseInt(CacheService.getScriptCache().get('rrb_pwtry_' + me.email) || '0', 10);
    if (tries) say('   Wrong tries in the last hour: ' + tries + (tries >= 5
        ? ' - LOCKED OUT for up to an hour. Once they have the right code, run rrbClearSignInLock.'
        : ' (five locks them out for an hour)'));
  }
  say('');

  /* 2. Whose unit. The dashboard shows a fact find to a manager when the
     fact find's agent number belongs to that manager's unit. */
  var unitOf = function (c) { try { return ffLookupDirectManager_(c) || ''; } catch (e) { return ''; } };
  var mgrName = function (k) { return ((MAIL_CONFIG.managers || {})[k] || {}).name || (k || 'nobody'); };
  var myUnit = unitOf(code);
  say('2. WHO SEES THEIR FACT FINDS');
  say('   Fact finds under ' + code + ' go to ' + mgrName(myUnit) + '\'s unit, so ' + mgrName(myUnit) +
      ' and the Branch Manager see them. A fact find with a blank or unknown agent number goes to' +
      ' the Branch Manager\'s own unit.');
  say('');

  /* 3 and 4. The submitted tab and the drafts tab, read as they stand. */
  var ss = SpreadsheetApp.openById(FF_SHEET_ID);
  function grid(tabName) {
    var sh = tabName ? ss.getSheetByName(tabName) : null;
    return (!sh || sh.getLastRow() < 2) ? [] : sh.getDataRange().getValues();
  }
  /* Submitted fact finds, read by heading the way ffReadRow_ reads them. */
  function table(tabName) {
    var v = grid(tabName), maps = _ffSchemaMaps();
    if (!v.length) return [];
    var head = v[0].map(function (h) { return maps.l2k[String(h)] || String(h); });
    return v.slice(1).map(function (r) {
      var o = {};
      head.forEach(function (k, i) { o[k] = r[i]; });
      return o;
    });
  }
  function day(x) {
    if (!x) return '';
    var d = (x instanceof Date) ? x : new Date(x);
    return isNaN(d) ? String(x) : Utilities.formatDate(d, Session.getScriptTimeZone(), 'd MMM yyyy');
  }
  var subs = table(FF_REVISED_TAB);
  /* Drafts, by position, as rrbDraftSave_ appends them: Draft ID, Agent Code,
     Agent Email, Client Name, Progress, Created At, Updated At, Payload. The
     payload holds the whole fact find and is never printed. */
  var drafts = grid(typeof RRB_DRAFT_TAB !== 'undefined' ? RRB_DRAFT_TAB : '').slice(1);
  function subLine(d) {
    var c = String(d.agentCode || '').trim().toUpperCase();
    var u = unitOf(c);
    return '   ' + (d.clientName || '(no client name)') + ' - ' + (d.status || 'no status') +
           ', submitted ' + (day(d.submittedAt) || '?') + ', agent number ' + (c || 'BLANK') +
           ' (' + (d.advisorName || 'no advisor name') + '), goes to ' + mgrName(u) + '\'s unit' +
           (c === code ? '' : '  <-- NOT under ' + code + ', so ' + code + ' cannot see it') +
           (u === myUnit ? '' : '  <-- and not in ' + mgrName(myUnit) + '\'s unit, so ' + mgrName(myUnit) + ' cannot either');
  }
  function draftLine(r) {
    var c = String(r[1] || '').trim().toUpperCase(), pr = r[4];
    if (typeof pr === 'number' && pr <= 1) pr = Math.round(pr * 100) + '%';
    return '   ' + (r[3] || '(no client name)') + ' - DRAFT, not submitted' + (pr !== '' && pr != null ? ', ' + pr + ' done' : '') +
           ', last saved ' + (day(r[6]) || '?') + ', agent number ' + (c || 'BLANK') +
           (c === code ? '' : '  <-- NOT under ' + code);
  }

  var mine = subs.filter(function (d) { return String(d.agentCode || '').trim().toUpperCase() === code; });
  var myDrafts = drafts.filter(function (r) { return String(r[1] || '').trim().toUpperCase() === code; });
  say('3. UNDER ' + code + ': ' + mine.length + ' submitted, ' + myDrafts.length + ' draft(s)');
  mine.slice(-15).forEach(function (d) { say(subLine(d)); });
  if (mine.length > 15) say('   (the last 15 shown)');
  myDrafts.forEach(function (r) { say(draftLine(r)); });
  say('');

  if (want) {
    var hitS = subs.filter(function (d) { return String(d.clientName || '').toLowerCase().indexOf(want) > -1; });
    var hitD = drafts.filter(function (r) { return String(r[3] || '').toLowerCase().indexOf(want) > -1; });
    say('4. CLIENT "' + WCS_CLIENT + '", ANY AGENT NUMBER: ' + hitS.length + ' submitted, ' + hitD.length + ' draft(s)');
    hitS.forEach(function (d) { say(subLine(d)); });
    hitD.forEach(function (r) { say(draftLine(r)); });
    if (!hitS.length && !hitD.length) {
      say('   Nothing for that name. It was never submitted or saved as a draft on the server,');
      say('   or the client name is spelled differently on the form.');
    }
    say('');
  }

  say('The home page and Insights use the deployment ending ...JsrAxxJ3dsQ, which runs this');
  say('version. If this log says they can sign in and see the case but the page does not,');
  say('sign out on the page and sign in again.');
  Logger.log(out.join('\n'));
  return out.join('\n');
}

/* Lifts the lockout on WCS_CODE: the count of wrong access codes rrbLogin
   keeps for an hour against the email on their Access tab row. Removes that
   one counter and nothing else. */
function rrbClearSignInLock() {
  var code = String(WCS_CODE || '').trim().toUpperCase();
  var me = null;
  try { me = rrbFindByCode_(code, ''); } catch (err) {}
  if (!me) {
    Logger.log('No active row on the Access tab with agent number %s and an email. Nothing changed.', code);
    return;
  }
  var cache = CacheService.getScriptCache(), key = 'rrb_pwtry_' + me.email;
  var before = parseInt(cache.get(key) || '0', 10);
  cache.remove(key);
  Logger.log('%s <%s>: %s wrong tries on record; cleared. They can sign in again now, with the code on their row.',
             me.name, me.email, before);
}
