/**
 * RR Branch — who is viewing the wall.
 *
 * The wall now asks a person to sign in, with the same agent number and access
 * code as the dashboard and the same session, so signing in on either serves
 * both. The television keeps its own way in — ?screen=<key> — because it is a
 * screen with nobody standing at it.
 *
 * This is the other half: recording the view.
 *
 * ── INSTALL ────────────────────────────────────────────────────────────────
 * Add this file, then ONE line in Code.gs, with the other doGet actions:
 *
 *     else if (action === "wall_view")   out = rrbWallView(e);
 *
 * Do NOT put it in cacheableActions. A cached view record would log one
 * person's visit and then serve it back as everybody else's.
 *
 * Then run rrbWallViewsToday() to read the log back.
 */

var RRB_VIEW_TAB = 'Wall Views';

function rrbViewSheet_() {
  var ss = SpreadsheetApp.openById(FF_SHEET_ID);
  var sh = ss.getSheetByName(RRB_VIEW_TAB);
  if (!sh) {
    sh = ss.insertSheet(RRB_VIEW_TAB);
    sh.appendRow(['When', 'Name', 'Agent', 'Role', 'Unit', 'Email']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 6).setFontWeight('bold')
      .setBackground('#0E1F4D').setFontColor('#FFFFFF');
  }
  return sh;
}

/**
 * GET ?action=wall_view&token=…
 *
 * Identity comes from the SESSION TOKEN and nothing else. The page could post
 * any name it liked; a token is the only thing that proves the person behind
 * it passed the password check. An unsigned or expired token is not an error
 * worth surfacing — the wall carries on regardless — so it returns quietly.
 */
function rrbWallView(e) {
  var me = null;
  try { me = rrbAuthorize_(e); } catch (err) {}
  if (!me) return { ok: false, logged: false };

  /* One row per person per half hour. Somebody who leaves the wall open on a
     second monitor all afternoon should be one view, not two hundred — and a
     log nobody can read is a log nobody reads. */
  var cache = CacheService.getScriptCache();
  var key = 'rrb_view_' + _str(me.code || me.name).toUpperCase();
  if (cache.get(key)) return { ok: true, logged: false, reason: 'already logged recently' };

  try {
    rrbViewSheet_().appendRow([
      new Date(),
      _str(me.name),
      _str(me.code),
      _str(me.role),
      _str(me.unit),
      _str(me.email)
    ]);
    cache.put(key, '1', 1800);
  } catch (err) {
    Logger.log('rrbWallView: could not write — %s', err && err.message);
    return { ok: false, logged: false };
  }
  return { ok: true, logged: true, name: _str(me.name) };
}

/** Who has looked at the wall today. Reads only. */
function rrbWallViewsToday() {
  var sh = rrbViewSheet_();
  if (sh.getLastRow() < 2) { Logger.log('No views recorded yet.'); return; }
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  var pad = function (v, n) {
    var t = String(v == null ? '' : v);
    return t.length >= n ? t.slice(0, n) : t + new Array(n - t.length + 1).join(' ');
  };

  var rows = vals.filter(function (r) {
    var d = r[0] instanceof Date ? r[0] : new Date(r[0]);
    return !isNaN(d.getTime()) &&
           Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd') === today;
  });

  Logger.log('=== wall views today (%s) ===', today);
  Logger.log('');
  if (!rows.length) { Logger.log('  Nobody has opened the wall today.'); return; }
  Logger.log('  ' + pad('TIME', 8) + pad('WHO', 26) + pad('AGENT', 9) + 'ROLE');
  rows.forEach(function (r) {
    var d = r[0] instanceof Date ? r[0] : new Date(r[0]);
    Logger.log('  ' + pad(Utilities.formatDate(d, Session.getScriptTimeZone(), 'h:mm a'), 8) +
               pad(r[1], 26) + pad(r[2], 9) + r[3]);
  });
  Logger.log('');
  Logger.log('  %s view(s) from %s person(s).', rows.length,
             Object.keys(rows.reduce(function (a, r) { a[r[2] || r[1]] = 1; return a; }, {})).length);
  return rows.length;
}


/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MAKING IT A LOCK RATHER THAN A LABEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * What is live today attributes viewing. It does not restrict it, and I would
 * rather say so than let it read as more than it is.
 *
 * The reason is WALL_KEY. It sits in wall.html's source, so anyone who opens
 * the page source can read it and call the feed directly:
 *
 *     …/exec?action=wall&k=<key>
 *
 * The sign-in card is in front of the page, not in front of the data.
 *
 * TO CLOSE IT, in rrbWall(e) — replace the key check with a token check, and
 * keep the key working ONLY for the television:
 *
 *     var me = null;
 *     try { me = rrbAuthorize_(e); } catch (err) {}
 *     if (!me) {
 *       // no session — allow the screen key, and nothing else
 *       var given = _str(e && e.parameter && e.parameter.k);
 *       var key = PropertiesService.getScriptProperties()
 *                   .getProperty(RRB_WALL_KEY_PROP);
 *       if (!key || given !== key) {
 *         return { ok: false, error: 'Sign in to view the branch wall.' };
 *       }
 *     }
 *
 * Then in wall.html, send the session token alongside the key on the feed
 * call, and rotate WALL_KEY with rrbWallRotateKey() so the old one in anybody's
 * browser history stops working.
 *
 * The wall shows aggregates and advisor names — no client is identifiable in
 * it, which is why it has survived being open this long. But "who is viewing"
 * is not a question a page can answer honestly while the data behind it
 * answers to a key printed in that same page.
 */


/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SEEING WHO IS VIEWING, WITHOUT OPENING THE SCRIPT EDITOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GET ?action=wall_viewers&token=…
 *
 * Returns the recent views for the wall's own "Who is looking" panel.
 *
 * BRANCH SCOPE ONLY. This is a record of where staff have been, and an agent
 * has no business reading it — nor does a unit manager, whose people would be
 * in it. rrbScopeForRole_ already draws that line for case data; the same line
 * applies here, and more sharply, because this is about people rather than
 * cases.
 *
 * Add one line in Code.gs beside the other actions:
 *
 *     else if (action === "wall_viewers") out = rrbWallViewers(e);
 *
 * Not cacheable. A cached answer would show a stale list and, worse, could
 * serve one manager's view of the branch to somebody else.
 */
function rrbWallViewers(e) {
  var me = null;
  try { me = rrbAuthorize_(e); } catch (err) {}
  if (!me) return RRB_EXPIRED;
  if (!me.scope || me.scope.kind !== 'branch') {
    return { ok: false, error: 'Only the Branch Manager can see who has been viewing.' };
  }

  var sh = rrbViewSheet_();
  if (sh.getLastRow() < 2) return { ok: true, views: [], today: 0, people: 0 };

  var take = Math.min(300, sh.getLastRow() - 1);
  var vals = sh.getRange(sh.getLastRow() - take + 1, 1, take, 6).getValues();
  var tz = Session.getScriptTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  var views = [], seenToday = {}, nToday = 0;
  for (var i = vals.length - 1; i >= 0; i--) {
    var r = vals[i];
    var d = r[0] instanceof Date ? r[0] : new Date(r[0]);
    if (isNaN(d.getTime())) continue;
    var day = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    if (day === today) { nToday++; seenToday[_str(r[2]) || _str(r[1])] = 1; }
    if (views.length < 40) {
      views.push({
        at:   d.toISOString(),
        when: Utilities.formatDate(d, tz, 'h:mm a'),
        day:  day === today ? 'today' : Utilities.formatDate(d, tz, 'EEE d MMM'),
        name: _str(r[1]), code: _str(r[2]), role: _str(r[3]), unit: _str(r[4])
      });
    }
  }
  return { ok: true, views: views, today: nToday,
           people: Object.keys(seenToday).length };
}
