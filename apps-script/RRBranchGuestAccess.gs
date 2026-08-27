/**
 * RRBranchGuestAccess.gs — a visitor asks for a code, gets it by email, and
 * that code buys them a limited, expiring look at the wall.
 *
 * INSTALL — two steps.
 *
 * 1. Paste this whole file in as a new script file.
 * 2. In doGet's router, next to the other actions, add these two lines:
 *
 *        if (action === 'guest_request') return rrbGuestRequest(e);
 *        if (action === 'guest_verify')  return rrbGuestVerify(e);
 *
 * Then Deploy > Manage deployments > edit > Version: New version > Deploy.
 *
 * WHAT A GUEST CAN SEE IS DECIDED HERE, NOT IN THE PAGE.
 * The token this hands back carries {kind:'guest'}. The wall hides the
 * production panels, the spreadsheet and Who is looking from it, but a page
 * can be edited by whoever is looking at it - so ?action=data, ?action=roster
 * and ?action=submitted must all refuse a guest scope on the SERVER too.
 * rrbScopeForRole_ is where that belongs. Until it does, a guest token is a
 * staff token with a politer name.
 *
 * WHY A CODE AND NOT JUST AN EMAIL BOX.
 * An email box alone lets anybody type anybody's address and walk in. The
 * code goes to the address, so the person holding it has to actually own it.
 */

var GUEST_TTL_MIN      = 15;    // how long a code is good for
var GUEST_SESSION_HRS  = 2;     // how long the look lasts once they are in
var GUEST_MAX_PER_HOUR = 3;     // codes per address per hour
var GUEST_MAX_PER_DAY  = 40;    // codes in total per day, all addresses

/**
 * WHO MAY ASK FOR A CODE. This is the control that matters.
 *
 * A guest sees the whole board, production included - that is the point of
 * the pass and it is what makes it worth having. So the boundary is not what
 * a guest can see once they are in; it is who can get in at all. Keep this
 * list to addresses the branch would show its production to.
 *
 * Emptying it lets ANY address on earth request a code and read the branch's
 * production by advisor. Do that only if that is genuinely what you want.
 */
var GUEST_DOMAINS = ['myguardiangroup.com', 'guardiangroup.com'];

function rrbGuestSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Guest Access');
  if (!sh) {
    sh = ss.insertSheet('Guest Access');
    sh.appendRow(['email', 'code', 'issued', 'expires', 'used', 'ip_note']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function rrbGuestNorm_(s) {
  return String(s == null ? '' : s).trim().toLowerCase();
}

function rrbGuestLooksLikeEmail_(e) {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(e);
}

function rrbGuestRequest(e) {
  var email = rrbGuestNorm_((e && e.parameter && e.parameter.email) || '');

  if (!rrbGuestLooksLikeEmail_(email)) {
    return rrbJson_({ ok: false, error: 'That does not look like an email address.' });
  }
  if (GUEST_DOMAINS.length) {
    var dom = email.split('@')[1];
    if (GUEST_DOMAINS.indexOf(dom) === -1) {
      // Deliberately the same shape as success. Telling a stranger which
      // domains are allowed is telling them what to try next.
      return rrbJson_({ ok: true, sent: true });
    }
  }

  var sh = rrbGuestSheet_();
  var rows = sh.getDataRange().getValues();
  var now = new Date(), hourAgo = new Date(now.getTime() - 3600e3);
  var dayAgo = new Date(now.getTime() - 86400e3);
  var mine = 0, today = 0;
  for (var i = 1; i < rows.length; i++) {
    var issued = rows[i][2] ? new Date(rows[i][2]) : null;
    if (!issued) continue;
    if (issued > dayAgo) today++;
    if (issued > hourAgo && rrbGuestNorm_(rows[i][0]) === email) mine++;
  }
  if (mine >= GUEST_MAX_PER_HOUR || today >= GUEST_MAX_PER_DAY) {
    return rrbJson_({ ok: false, error: 'Too many requests. Try again later.' });
  }

  var code = String(Math.floor(100000 + Math.random() * 900000));
  var expires = new Date(now.getTime() + GUEST_TTL_MIN * 60000);
  sh.appendRow([email, code, now, expires, '', '']);

  MailApp.sendEmail({
    to: email,
    subject: 'Your code for the Ricky Rampersad branch wall',
    htmlBody:
      '<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#0f172a">' +
      '<p>Your access code is</p>' +
      '<p style="font-size:30px;font-weight:800;letter-spacing:.18em;margin:14px 0">' +
      code + '</p>' +
      '<p>It works once, and for the next ' + GUEST_TTL_MIN + ' minutes.</p>' +
      '<p style="color:#64748b;font-size:13px">If you did not ask for this, ignore it — ' +
      'nobody can use it without this email.</p></div>'
  });

  return rrbJson_({ ok: true, sent: true, ttl: GUEST_TTL_MIN });
}

function rrbGuestVerify(e) {
  var email = rrbGuestNorm_((e && e.parameter && e.parameter.email) || '');
  var code  = String(((e && e.parameter && e.parameter.code) || '')).trim();
  if (!email || !code) return rrbJson_({ ok: false, error: 'Enter your email and the code.' });

  var sh = rrbGuestSheet_();
  var rows = sh.getDataRange().getValues();
  var now = new Date();

  // Newest first: a second code supersedes the first rather than both working.
  for (var i = rows.length - 1; i >= 1; i--) {
    if (rrbGuestNorm_(rows[i][0]) !== email) continue;
    if (String(rows[i][1]).trim() !== code)  continue;
    if (rows[i][4])                          return rrbJson_({ ok: false, error: 'That code has been used.' });
    var exp = rows[i][3] ? new Date(rows[i][3]) : null;
    if (!exp || exp < now)                   return rrbJson_({ ok: false, error: 'That code has expired.' });

    sh.getRange(i + 1, 5).setValue(now);   // used, once

    var who = {
      ok: true,
      name: email.split('@')[0],
      email: email,
      role: 'guest',
      code: '',
      scope: { kind: 'guest' },
      token: rrbGuestToken_(email, now),
      expiresAt: new Date(now.getTime() + GUEST_SESSION_HRS * 3600e3).toISOString()
    };
    return rrbJson_(who);
  }
  return rrbJson_({ ok: false, error: 'That code is not right.' });
}

/**
 * Signed the same way the staff tokens are, with 'guest' in the payload so
 * the server can tell them apart. Uses the project's existing secret; if
 * rrbSecret_() is named differently in your build, point this at it.
 */
function rrbGuestToken_(email, issued) {
  var payload = 'guest|' + email + '|' + issued.getTime();
  var sig = Utilities.computeHmacSha256Signature(payload, rrbSecret_());
  return Utilities.base64EncodeWebSafe(payload) + '.' +
         Utilities.base64EncodeWebSafe(sig);
}

/** Read-only. Run it and read the log before trusting any of the above. */
function rrbGuestCheck() {
  var sh = rrbGuestSheet_();
  var rows = sh.getDataRange().getValues();
  Logger.log('Guest Access rows: ' + (rows.length - 1));
  Logger.log('Domains allowed: ' + (GUEST_DOMAINS.length ? GUEST_DOMAINS.join(', ')
             : 'ANY — a stranger who finds the URL can request a code'));
  var quota = MailApp.getRemainingDailyQuota();
  Logger.log('Email quota left today: ' + quota);
  for (var i = Math.max(1, rows.length - 10); i < rows.length; i++) {
    Logger.log('  ' + rows[i][0] + '  issued ' + rows[i][2] +
               '  used ' + (rows[i][4] || 'no'));
  }
}
