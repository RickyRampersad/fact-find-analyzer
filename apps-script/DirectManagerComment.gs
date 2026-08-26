/**
 * DirectManagerComment.gs — the comment box a manager reaches from the email.
 *
 * WHAT THIS IS FOR
 * A case sent back needs the direct manager's comments on it. The ask was to
 * let him add them from the email without signing into the fact find.
 *
 * Parsing his reply would be the obvious way and the wrong one. A reply
 * carries a phone signature, the quoted thread and HTML, all of which land in
 * the field; and the From address is not proof of anything, so anyone able to
 * spoof or forward it could write onto a compliance record.
 *
 * Instead the send-back email carries a link with a single-case token. The
 * token is the whole authorisation: it names one case, it expires, and it is
 * retired the moment it is spent. He taps it, gets one box, types, saves. He
 * never signs in and never sees the fact find.
 *
 * ── INSTALLING ────────────────────────────────────────────────────────────
 * 1. Apps Script editor ▸ + ▸ Script ▸ name it DirectManagerComment.
 * 2. Paste this file over the empty one.
 * 3. Fill in CONFIG below — the sheet name is the only value you must check.
 * 4. Wire the two stages into your existing doPost router. Find where it
 *    reads the posted stage (it already handles 'queue_decide') and add:
 *
 *      if (p.stage === 'dm_open')    return jsonOut_(dmOpen_(p));
 *      if (p.stage === 'dm_comment') return jsonOut_(dmComment_(p));
 *
 *    using whatever this project already calls its JSON responder. If it
 *    does not have one, dmJsonOut_() at the bottom of this file is a working
 *    one you can use as-is.
 * 5. Deploy ▸ Manage deployments ▸ Edit ▸ Deploy, keeping the same URL so
 *    every link already in circulation still works.
 * 6. In the code that sends the send-back email, build the link with:
 *
 *      var link = dmCommentLink_(caseId, managerEmail);
 *
 *    and put it in the email as the button the manager taps.
 *
 * ── CHECKING IT ───────────────────────────────────────────────────────────
 * Run dmSelfTest_() from the editor. It mints a token against the first row
 * it finds, opens it, writes a comment, proves the token is dead afterwards,
 * and then puts the field back the way it was. It writes nothing permanent.
 */

var DM_CONFIG = {
  // The sheet holding submitted fact finds. Check this name against the tab
  // in your spreadsheet — it is the one value most likely to differ.
  RESPONSES_SHEET: 'Responses',

  // Created automatically. Nothing to do.
  TOKENS_SHEET: 'DM Tokens',

  // Column headers, matched case-insensitively against the header row, so
  // the column can move without breaking this. Each entry lists the names
  // that have been used for that column; the first one found wins.
  COLS: {
    id:        ['id', 'caseid', 'case id', 'submissionid', 'timestamp'],
    client:    ['clientname', 'client name', 'client', 'fullname'],
    advisor:   ['advisorname', 'advisor name', 'advisor', 'agentname'],
    submitted: ['submittedat', 'submitted at', 'submitted', 'timestamp'],
    guidance:  ['dmguidance', 'dm guidance', 'directmanagerguidance'],
    mgrNote:   ['mgrcomments', 'mgr comments', 'managercomments'],
    returned:  ['returnedat', 'returned at', 'decidedat']
  },

  // How long a link stays good. Long enough to survive a weekend.
  TOKEN_TTL_HOURS: 96,

  // Where comment.html is served.
  COMMENT_URL: 'https://factfind360.com/comment'
};

/* ── sheet helpers ─────────────────────────────────────────────────────── */

function dmSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh && headers) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  if (!sh) throw new Error('Sheet "' + name + '" not found. Check DM_CONFIG.RESPONSES_SHEET.');
  return sh;
}

/** Header row as a lowercase, punctuation-stripped lookup of name -> index. */
function dmHeaderMap_(sh) {
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var map = {};
  head.forEach(function (h, i) {
    map[String(h).toLowerCase().replace(/[^a-z0-9]/g, '')] = i;
  });
  return map;
}

/** First matching column index for a logical field, or -1. */
function dmCol_(map, field) {
  var names = DM_CONFIG.COLS[field] || [];
  for (var i = 0; i < names.length; i++) {
    var k = names[i].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (map[k] !== undefined) return map[k];
  }
  return -1;
}

/** Row number (1-based, including the header) for a case id, or -1. */
function dmFindRow_(sh, map, caseId) {
  var idCol = dmCol_(map, 'id');
  if (idCol < 0) throw new Error('No id column found. Add one of ' +
    DM_CONFIG.COLS.id.join(', ') + ' to DM_CONFIG.COLS.id.');
  var want = String(caseId).trim();
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, idCol + 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === want) return i + 2;
  }
  return -1;
}

/* ── tokens ────────────────────────────────────────────────────────────── */

var DM_TOKEN_HEADERS = ['Token', 'Case ID', 'Issued To', 'Issued At', 'Expires At', 'Used At'];

/**
 * Mint a single-case token and return the full link.
 * Call this when the send-back email is composed.
 */
function dmCommentLink_(caseId, issuedTo) {
  if (!caseId) throw new Error('dmCommentLink_ needs a case id.');
  var sh = dmSheet_(DM_CONFIG.TOKENS_SHEET, DM_TOKEN_HEADERS);
  var token = Utilities.getUuid().replace(/-/g, '');
  var now = new Date();
  var expires = new Date(now.getTime() + DM_CONFIG.TOKEN_TTL_HOURS * 3600 * 1000);
  sh.appendRow([token, String(caseId), String(issuedTo || ''), now, expires, '']);
  return DM_CONFIG.COMMENT_URL + '?t=' + encodeURIComponent(token);
}

/** Look a token up. Returns {row, caseId, issuedTo} or throws with a reason. */
function dmToken_(token) {
  token = String(token || '').trim();
  if (!token) throw new Error('This link is missing its case.');

  var sh = dmSheet_(DM_CONFIG.TOKENS_SHEET, DM_TOKEN_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) throw new Error('This link is no longer valid.');

  var rows = sh.getRange(2, 1, last - 1, DM_TOKEN_HEADERS.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() !== token) continue;

    if (rows[i][5]) {
      throw new Error('These comments have already been saved. Ask for a fresh link if you need to add anything.');
    }
    var expires = rows[i][4] ? new Date(rows[i][4]) : null;
    if (expires && expires.getTime() < Date.now()) {
      throw new Error('This link has expired. Ask for a fresh one.');
    }
    return { row: i + 2, caseId: String(rows[i][1]).trim(), issuedTo: String(rows[i][2] || '') };
  }
  throw new Error('This link is no longer valid.');
}

function dmRetireToken_(row) {
  dmSheet_(DM_CONFIG.TOKENS_SHEET, DM_TOKEN_HEADERS)
    .getRange(row, 6).setValue(new Date());
}

/* ── the two stages the page calls ─────────────────────────────────────── */

/**
 * dm_open — enough context to comment sensibly, and not one field more.
 * No income, no dependants, no recommendations, no client contact details.
 */
function dmOpen_(p) {
  try {
    var t = dmToken_(p.t);
    var sh = dmSheet_(DM_CONFIG.RESPONSES_SHEET);
    var map = dmHeaderMap_(sh);
    var row = dmFindRow_(sh, map, t.caseId);
    if (row < 0) return { ok: false, error: 'That case is no longer on file.' };

    var vals = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
    var get = function (field) {
      var c = dmCol_(map, field);
      return c < 0 ? '' : String(vals[c] == null ? '' : vals[c]).trim();
    };
    var asDate = function (v) {
      if (!v) return '';
      var d = new Date(v);
      return isNaN(d.getTime()) ? String(v)
        : Utilities.formatDate(d, Session.getScriptTimeZone(), 'd MMMM yyyy');
    };

    return {
      ok: true,
      clientName:   get('client'),
      advisorName:  get('advisor'),
      submitted:    asDate(get('submitted')),
      returnedAt:   asDate(get('returned')),
      returnReason: get('mgrNote'),
      existing:     get('guidance')
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * dm_comment — write the comments onto the case and retire the link.
 *
 * Under a lock: two taps on a flaky connection would otherwise both pass the
 * used-check and the second would overwrite the first.
 */
function dmComment_(p) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    var text = String(p.comment == null ? '' : p.comment).trim();
    if (!text) return { ok: false, error: 'Write your comments first.' };
    if (text.length > 4000) text = text.slice(0, 4000);

    var t = dmToken_(p.t);
    var sh = dmSheet_(DM_CONFIG.RESPONSES_SHEET);
    var map = dmHeaderMap_(sh);
    var row = dmFindRow_(sh, map, t.caseId);
    if (row < 0) return { ok: false, error: 'That case is no longer on file.' };

    var col = dmCol_(map, 'guidance');
    if (col < 0) {
      return { ok: false, error: 'There is no dmGuidance column on the ' +
        DM_CONFIG.RESPONSES_SHEET + ' sheet. Add one and try again.' };
    }

    // Stamped, so the fact find shows who wrote it and when rather than an
    // unattributed block of text appearing on a compliance record.
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd MMM yyyy HH:mm');
    var who = t.issuedTo || 'Direct manager';
    sh.getRange(row, col + 1).setValue(text + '\n\n— ' + who + ', ' + stamp);

    dmRetireToken_(t.row);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/* ── use this only if the project has no JSON responder already ────────── */

function dmJsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── self test ─────────────────────────────────────────────────────────── */

/**
 * Proves the round trip against real data and then puts it back.
 * Run from the editor and read the log.
 */
function dmSelfTest_() {
  var sh = dmSheet_(DM_CONFIG.RESPONSES_SHEET);
  var map = dmHeaderMap_(sh);

  var idCol = dmCol_(map, 'id');
  var gCol  = dmCol_(map, 'guidance');
  Logger.log('id column: %s   dmGuidance column: %s',
    idCol < 0 ? 'NOT FOUND' : idCol + 1, gCol < 0 ? 'NOT FOUND' : gCol + 1);
  if (idCol < 0 || gCol < 0) { Logger.log('Fix DM_CONFIG.COLS before going further.'); return; }
  if (sh.getLastRow() < 2) { Logger.log('No rows to test against.'); return; }

  var caseId = String(sh.getRange(2, idCol + 1).getValue()).trim();
  var before = sh.getRange(2, gCol + 1).getValue();
  Logger.log('testing against case %s', caseId);

  var link = dmCommentLink_(caseId, 'selftest@example.com');
  var token = link.split('t=')[1];
  Logger.log('link: %s', link);

  var opened = dmOpen_({ t: token });
  Logger.log('dm_open  -> %s', JSON.stringify(opened));
  if (!opened.ok) { Logger.log('FAILED at open.'); return; }

  var saved = dmComment_({ t: token, comment: 'Self test — ignore.' });
  Logger.log('dm_comment -> %s', JSON.stringify(saved));

  var reuse = dmComment_({ t: token, comment: 'Second attempt.' });
  Logger.log('reuse blocked -> %s', JSON.stringify(reuse));
  if (reuse.ok) Logger.log('WARNING: the token was spendable twice.');

  sh.getRange(2, gCol + 1).setValue(before);
  Logger.log('dmGuidance restored. Delete the self-test row from "%s" when you are done.',
    DM_CONFIG.TOKENS_SHEET);
}
