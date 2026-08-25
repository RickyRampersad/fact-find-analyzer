/**
 * ClientConfirm.gs — the client confirms their summary on our own domain.
 *
 * WHY THIS EXISTS
 * The client's link used to point at the Apps Script web app. Google puts its
 * own page in front of that for anyone who is not the script's owner:
 *
 *     This application was created by another user, not by Google.
 *     Google cannot verify that this app is safe…
 *
 * That cannot be switched off, and a custom domain cannot be mapped onto
 * script.google.com. A client clicking a link from their insurance advisor
 * and landing on a Google safety warning undoes the work the fact find just
 * did, so the client is sent to factfind360.com/confirm instead and this file
 * answers it from the background. The client never sees a Google URL.
 *
 * REQUIRES DirectManagerComment.gs — the token sheet, the header-driven
 * column lookup and dmToken_() are shared. Install that one first.
 *
 * ── INSTALLING ────────────────────────────────────────────────────────────
 * 1. Apps Script editor ▸ + ▸ Script ▸ name it ClientConfirm, paste this in.
 * 2. Add to your doPost router, beside the dm_ stages:
 *
 *      if (p.stage === 'client_open')    return jsonOut_(clientOpen_(p));
 *      if (p.stage === 'client_confirm') return jsonOut_(clientConfirm_(p));
 *
 * 3. Where the client's summary email is sent, build the link with:
 *
 *      var link = clientConfirmLink_(caseId, clientEmail);
 *
 *    and remove whatever pointed at the /exec URL.
 * 4. Deploy ▸ Manage deployments ▸ Edit ▸ Deploy, same URL.
 * 5. Run clientSelfTest_() and read the log. It writes nothing permanent.
 */

var CC_CONFIRM_URL = 'https://factfind360.com/confirm';

/* The client-side columns, folded into the shared lookup so both files agree
   on how a column is found. Header names, not positions. */
DM_CONFIG.COLS.confirmed   = ['clientconfirmed', 'client confirmed'];
DM_CONFIG.COLS.confirmedAt = ['clientconfirmedat', 'client confirmed at'];
DM_CONFIG.COLS.changeNote  = ['clientchangenote', 'client change note'];

/** A confirmation link for one case. Mint it when the summary email is sent. */
function clientConfirmLink_(caseId, issuedTo) {
  if (!caseId) throw new Error('clientConfirmLink_ needs a case id.');
  var sh = dmSheet_(DM_CONFIG.TOKENS_SHEET, DM_TOKEN_HEADERS);
  var token = Utilities.getUuid().replace(/-/g, '');
  var now = new Date();
  var expires = new Date(now.getTime() + DM_CONFIG.TOKEN_TTL_HOURS * 3600 * 1000);
  sh.appendRow([token, String(caseId), String(issuedTo || ''), now, expires, '']);
  return CC_CONFIRM_URL + '?t=' + encodeURIComponent(token);
}

/**
 * The lines the client sees.
 *
 * Deliberately short. This page exists so the client can say "yes that is
 * right" or "no it is not" — it is not the fact find, and it is reached by a
 * link that could be forwarded, so it carries what they already told us and
 * nothing they did not. No recommendations, no premiums, no ID numbers, no
 * bank detail.
 */
function clientSummaryLines_(get) {
  var money = function (v) {
    var n = Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, ''));
    return isFinite(n) && n ? 'TT$' + Math.round(n).toLocaleString('en-US') : '';
  };
  var out = [];
  var push = function (label, value) { if (value) out.push({ label: label, value: value }); };

  push('Your occupation',      get('occupation'));
  push('Monthly income',       money(get('monthlyIncome')));
  push('Monthly expenses',     money(get('monthlyExpenses')));
  push('People depending on you', get('dependants'));
  return out;
}

function clientOpen_(p) {
  try {
    var t = dmToken_(p.t);
    var sh = dmSheet_(DM_CONFIG.RESPONSES_SHEET);
    var map = dmHeaderMap_(sh);
    var row = dmFindRow_(sh, map, t.caseId);
    if (row < 0) return { ok: false, error: 'We could not find your summary. Please contact your advisor.' };

    var vals = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
    var get = function (field) {
      var names = DM_CONFIG.COLS[field] || [field];
      for (var i = 0; i < names.length; i++) {
        var k = names[i].toLowerCase().replace(/[^a-z0-9]/g, '');
        if (map[k] !== undefined) return String(vals[map[k]] == null ? '' : vals[map[k]]).trim();
      }
      return '';
    };
    var asDate = function (v) {
      if (!v) return '';
      var d = new Date(v);
      return isNaN(d.getTime()) ? String(v)
        : Utilities.formatDate(d, Session.getScriptTimeZone(), 'd MMMM yyyy');
    };

    return {
      ok: true,
      clientName:       get('client'),
      advisorName:      get('advisor'),
      submitted:        asDate(get('submitted')),
      lines:            clientSummaryLines_(get),
      alreadyConfirmed: /^(yes|true|1)$/i.test(get('confirmed'))
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function clientConfirm_(p) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    var yes = /^(yes|true|1)$/i.test(String(p.confirmed || ''));
    var note = String(p.note == null ? '' : p.note).trim().slice(0, 2000);
    if (!yes && !note) return { ok: false, error: 'Please tell us what needs changing.' };

    var t = dmToken_(p.t);
    var sh = dmSheet_(DM_CONFIG.RESPONSES_SHEET);
    var map = dmHeaderMap_(sh);
    var row = dmFindRow_(sh, map, t.caseId);
    if (row < 0) return { ok: false, error: 'We could not find your summary.' };

    var set = function (field, value) {
      var c = dmCol_(map, field);
      if (c >= 0) sh.getRange(row, c + 1).setValue(value);
      return c >= 0;
    };

    var wroteFlag = set('confirmed', yes ? 'Yes' : 'No');
    set('confirmedAt', new Date());
    if (!yes) set('changeNote', note);

    // A client saying "this is wrong" that lands nowhere is worse than no
    // page at all, so a missing column is an error rather than a silent pass.
    if (!wroteFlag) {
      return { ok: false, error: 'We could not record that just now. Please contact your advisor.' };
    }

    dmRetireToken_(t.row);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/** Round trip against a real row, then puts it back. Sends nothing. */
function clientSelfTest_() {
  var sh = dmSheet_(DM_CONFIG.RESPONSES_SHEET);
  var map = dmHeaderMap_(sh);
  ['id', 'client', 'advisor', 'confirmed', 'confirmedAt', 'changeNote'].forEach(function (f) {
    var c = dmCol_(map, f);
    Logger.log('%s -> %s', f, c < 0 ? 'NOT FOUND' : 'column ' + (c + 1));
  });
  if (sh.getLastRow() < 2) { Logger.log('No rows to test against.'); return; }

  var idCol = dmCol_(map, 'id'), cCol = dmCol_(map, 'confirmed');
  if (idCol < 0 || cCol < 0) { Logger.log('Add the missing columns first.'); return; }

  var caseId = String(sh.getRange(2, idCol + 1).getValue()).trim();
  var before = sh.getRange(2, cCol + 1).getValue();

  var link = clientConfirmLink_(caseId, 'selftest@example.com');
  Logger.log('link: %s', link);
  var token = link.split('t=')[1];

  Logger.log('client_open    -> %s', JSON.stringify(clientOpen_({ t: token })));
  Logger.log('client_confirm -> %s', JSON.stringify(clientConfirm_({ t: token, confirmed: 'yes' })));
  Logger.log('reuse blocked  -> %s', JSON.stringify(clientConfirm_({ t: token, confirmed: 'yes' })));

  sh.getRange(2, cCol + 1).setValue(before);
  Logger.log('restored. Delete the self-test row from "%s".', DM_CONFIG.TOKENS_SHEET);
}
