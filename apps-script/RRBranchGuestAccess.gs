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
 * WHO MAY ASK FOR A CODE.
 *
 * OPEN TO ANY ADDRESS, on the branch manager's instruction, 29 Aug 2026.
 *
 * An empty list means exactly that: anybody who reaches the wall can type any
 * email, receive a code and read the branch's production by advisor - names,
 * agent codes, apps and API. That is a deliberate decision, not an oversight,
 * and it is recorded here so nobody quietly "fixes" it later.
 *
 * With the domain gate open, what remains are the rate limits below. They cap
 * volume, not who: GUEST_MAX_PER_DAY is now the only thing standing between
 * the board and however many strangers find the address.
 *
 * To close it again, put domains back in the list - one entry is enough:
 *     var GUEST_DOMAINS = ['myguardiangroup.com'];
 * An address outside the list gets the same reply as one inside, so the page
 * never reveals who is on it.
 */
var GUEST_DOMAINS = [];

/* ITS OWN JSON HELPER, UNDER ITS OWN NAME.
   This file called rrbJson_ on the assumption the project had a shared one.
   It does not, so every guest_request died with "rrbJson_ is not defined"
   before it reached the mail - which the page reported as "could not send the
   code just now", pointing at email when the fault was here. Exactly the
   mistake pbSalesforce.gs made, and made again before it was learned from.
   Nothing in this file now depends on a helper existing elsewhere. */
function rrbGuestJson_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
                       .setMimeType(ContentService.MimeType.JSON);
}

/* WHICH WORKBOOK THE GUEST LOG LIVES IN.
   getActive() returns the spreadsheet the script is BOUND to. This project is
   standalone, so it returned null and every guest_request threw on the next
   line - before the mail, before the allowlist, before anything. The page
   reported that as "could not send the code just now", which pointed at email
   for the third time in this one file.

   pbBoard.gs made this exact mistake earlier in the week and it was fixed
   there by opening the book explicitly. Same fix, and no getActive() left as
   anything but a last resort.

   The drafts tab and the medical panel already live in FF_SHEET_ID, so the
   guest log belongs beside them rather than in a workbook of its own. */
function rrbGuestBook_() {
  if (typeof FF_SHEET_ID === 'string' && FF_SHEET_ID) {
    try { return SpreadsheetApp.openById(FF_SHEET_ID); } catch (e) {}
  }
  var id = PropertiesService.getScriptProperties().getProperty('RRB_GUEST_SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  var active = SpreadsheetApp.getActive();
  if (active) return active;
  throw new Error('No workbook to keep the guest log in. FF_SHEET_ID is not ' +
    'reachable and no RRB_GUEST_SHEET_ID is set in Script Properties.');
}

function rrbGuestSheet_() {
  var ss = rrbGuestBook_();
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

function rrbGuestRequestBody_(e) {
  var email = rrbGuestNorm_((e && e.parameter && e.parameter.email) || '');

  if (!rrbGuestLooksLikeEmail_(email)) {
    return rrbGuestJson_({ ok: false, error: 'That does not look like an email address.' });
  }
  if (GUEST_DOMAINS.length) {
    var dom = email.split('@')[1];
    if (GUEST_DOMAINS.indexOf(dom) === -1) {
      // Deliberately the same shape as success. Telling a stranger which
      // domains are allowed is telling them what to try next.
      return rrbGuestJson_({ ok: true, sent: true });
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
    return rrbGuestJson_({ ok: false, error: 'Too many requests. Try again later.' });
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

  return rrbGuestJson_({ ok: true, sent: true, ttl: GUEST_TTL_MIN });
}

function rrbGuestVerifyBody_(e) {
  var email = rrbGuestNorm_((e && e.parameter && e.parameter.email) || '');
  var code  = String(((e && e.parameter && e.parameter.code) || '')).trim();
  if (!email || !code) return rrbGuestJson_({ ok: false, error: 'Enter your email and the code.' });

  var sh = rrbGuestSheet_();
  var rows = sh.getDataRange().getValues();
  var now = new Date();

  // Newest first: a second code supersedes the first rather than both working.
  for (var i = rows.length - 1; i >= 1; i--) {
    if (rrbGuestNorm_(rows[i][0]) !== email) continue;
    if (String(rows[i][1]).trim() !== code)  continue;
    if (rows[i][4])                          return rrbGuestJson_({ ok: false, error: 'That code has been used.' });
    var exp = rows[i][3] ? new Date(rows[i][3]) : null;
    if (!exp || exp < now)                   return rrbGuestJson_({ ok: false, error: 'That code has expired.' });

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
    return rrbGuestJson_(who);
  }
  return rrbGuestJson_({ ok: false, error: 'That code is not right.' });
}

/**
 * Signed the same way the staff tokens are, with 'guest' in the payload so
 * the server can tell them apart. Uses the project's existing secret; if
 * rrbSecret_() is named differently in your build, point this at it.
 */
/* The signing key. rrbSecret_ is the project's own, and using it keeps a guest
   token verifiable by the same code that verifies everything else - so this
   asks for it first. But this file assumed a helper existed once already, and
   that assumption is what made every guest_request fail with a message about
   email. Not making it twice: if rrbSecret_ is not there, fall back to the
   property it reads, and only mint a new one if that is empty too.

   A generated key is stored, not returned to a caller, and never logged. */
function rrbGuestSecret_() {
  if (typeof rrbSecret_ === 'function') {
    try { var k = rrbSecret_(); if (k) return k; } catch (e) {}
  }
  var props = PropertiesService.getScriptProperties();
  var k2 = props.getProperty('RRB_PROP_SECRET');
  if (k2) return k2;
  /* Nothing to share a key with yet. Mint one and keep it, so guest tokens
     issued today still verify tomorrow. */
  var made = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(Utilities.getUuid(), Utilities.getUuid()));
  props.setProperty('RRB_PROP_SECRET', made);
  return made;
}

function rrbGuestToken_(email, issued) {
  var payload = 'guest|' + email + '|' + issued.getTime();
  var sig = Utilities.computeHmacSha256Signature(payload, rrbGuestSecret_());
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

/* WHATEVER HAPPENS IN THERE, ANSWER JSON.
   An uncaught throw in a web-app handler makes Apps Script return an HTML
   error page. The wall calls JSON.parse on it, that fails too, and the page
   falls back to its generic sentence - which is how a null spreadsheet came to
   read as "could not send the code just now" and cost three round trips
   pointing at email.

   These two doors now always return JSON, and a server-side failure says so
   in words the diagnostic panel can print. */
function rrbGuestRequest(e) {
  try { return rrbGuestRequestBody_(e); }
  catch (err) {
    return rrbGuestJson_({ ok: false,
      error: 'Guest access failed on the server: ' + (err && err.message || err) });
  }
}

function rrbGuestVerify(e) {
  try { return rrbGuestVerifyBody_(e); }
  catch (err) {
    return rrbGuestJson_({ ok: false,
      error: 'Guest access failed on the server: ' + (err && err.message || err) });
  }
}
