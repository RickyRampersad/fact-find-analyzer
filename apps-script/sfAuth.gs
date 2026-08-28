/**
 * sfAuth.gs — get a refresh token, once, by hand.
 *
 * WHY THIS EXISTS
 * The username-password flow cannot work on this account. Salesforce's own
 * login history says so in as many words - every attempt came back
 * "Username-Password Flow Disabled", on both external client apps, with the
 * org toggle On and the per-app box ticked. The reason is in the same log:
 * every browser sign-in records "Multi-factor required" before it succeeds.
 * MFA is enforced, and the username-password flow has no way to answer an MFA
 * challenge, so Salesforce refuses it outright. No checkbox changes that.
 *
 * A refresh token carries no password, so nothing needs to answer for MFA
 * after the one browser sign-in that issues it. It is also what the two
 * integrations already logging in successfully from a server use.
 *
 * ─── DO THIS ONCE ─────────────────────────────────────────────────────────
 *
 * 1. In Salesforce: Setup > External Client App Manager >
 *    RRB Dashboard Integration > Settings > OAuth Settings > Edit, and add
 *    this to Callback URL (on its own line if there are others already):
 *
 *        http://localhost:1717/OauthRedirect
 *
 *    Nothing listens on that address. That is deliberate - the browser fails
 *    to load it and leaves the code sitting in the address bar where you can
 *    read it. It is the same address the Salesforce CLI uses.
 *
 *    Save, and give it a minute.
 *
 * 2. Run sfAuth. It logs a long link. Open it, sign in, approve.
 *
 * 3. The browser lands on a page that will not load - "can't connect",
 *    "site can't be reached". Expected. Look at the ADDRESS BAR:
 *
 *        http://localhost:1717/OauthRedirect?code=aPrxsm...%3D%3D
 *
 *    Copy everything after code= to the end of the line.
 *
 * 4. Paste it into CODE below, save, and run sfExchange.
 *
 * 5. It stores the refresh token and deletes the stored password and security
 *    token, which are no longer used for anything. Then run sfCheck.
 *
 * The code is single-use and expires in minutes. If sfExchange says it is
 * invalid, run sfAuth again for a fresh one - nothing else needs redoing.
 */

var SF_REDIRECT = 'http://localhost:1717/OauthRedirect';

/* Paste the code from the address bar here, then run sfExchange. */
var CODE = '';

function sfHost_() {
  return PropertiesService.getScriptProperties().getProperty('SF_LOGIN_URL') ||
         'https://login.salesforce.com';
}

/** STEP 2. Run this, open the link it logs. */
function sfAuth() {
  var p = PropertiesService.getScriptProperties();
  var id = p.getProperty('SF_CLIENT_ID');
  if (!id) return 'SF_CLIENT_ID is not stored. Run sfCheck once first.';

  var url = sfHost_() + '/services/oauth2/authorize' +
    '?response_type=code' +
    '&client_id='    + encodeURIComponent(id) +
    '&redirect_uri=' + encodeURIComponent(SF_REDIRECT) +
    '&scope='        + encodeURIComponent('api refresh_token');

  console.log('Open this, sign in, approve:');
  console.log('');
  console.log(url);
  console.log('');
  console.log('The page it lands on will not load. That is fine. Copy what');
  console.log('follows code= in the address bar into CODE, then run sfExchange.');
  return 'Link is in the log above.';
}

/** STEP 4. Paste the code into CODE above, then run this. */
function sfExchange() {
  var p = PropertiesService.getScriptProperties();
  var id = p.getProperty('SF_CLIENT_ID'), secret = p.getProperty('SF_CLIENT_SECRET');
  if (!id || !secret) return 'SF_CLIENT_ID / SF_CLIENT_SECRET are not stored.';

  /* Pasting out of an address bar brings percent-encoding with it, and often a
     trailing &state= or a stray space. Take only the code and decode it. */
  var code = String(CODE || '').trim();
  code = code.replace(/^.*?[?&]code=/, '').split('&')[0];
  if (code.indexOf('%') > -1) { try { code = decodeURIComponent(code); } catch (e) {} }
  if (!code) return 'CODE is empty. Run sfAuth, then paste the code from the address bar.';

  var res = UrlFetchApp.fetch(sfHost_() + '/services/oauth2/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'authorization_code', code: code, client_id: id,
               client_secret: secret, redirect_uri: SF_REDIRECT }
  });
  var body = res.getContentText();
  if (res.getResponseCode() !== 200) {
    console.log('Exchange refused (' + res.getResponseCode() + '): ' + body);
    if (body.indexOf('invalid_grant') > -1) {
      console.log('');
      console.log('That code is spent or expired - they last a few minutes and');
      console.log('work once. Run sfAuth for a fresh one.');
    } else if (body.indexOf('redirect_uri_mismatch') > -1) {
      console.log('');
      console.log('The callback URL is not registered on the app. Add exactly');
      console.log('  ' + SF_REDIRECT);
      console.log('to RRB Dashboard Integration > Settings > OAuth Settings.');
    }
    return 'FAILED: ' + body;
  }

  var j = JSON.parse(body);
  if (!j.refresh_token) {
    return 'Salesforce returned a token but no refresh token. The app needs ' +
           'the refresh_token scope enabled.';
  }
  p.setProperty('SF_REFRESH_TOKEN', j.refresh_token);

  /* The password and security token are dead weight now, and dead weight that
     happens to be a password. sfLogin_ prefers the refresh token anyway. */
  p.deleteProperty('SF_PASSWORD');
  p.deleteProperty('SF_TOKEN');

  console.log('Refresh token stored.');
  console.log('SF_PASSWORD and SF_TOKEN deleted - nothing uses them now.');
  console.log('');
  console.log('Blank the SEED block in pbSalesforce.gs, then run sfCheck.');
  return 'Done. Run sfCheck.';
}

/** Which credentials are stored. Names only - never prints a value. */
function sfWhat() {
  var p = PropertiesService.getScriptProperties();
  ['SF_CLIENT_ID', 'SF_CLIENT_SECRET', 'SF_LOGIN_URL',
   'SF_REFRESH_TOKEN', 'SF_USERNAME', 'SF_PASSWORD', 'SF_TOKEN'].forEach(function (k) {
    console.log((p.getProperty(k) ? 'stored  ' : '  -     ') + k);
  });
  return p.getProperty('SF_REFRESH_TOKEN') ? 'Refresh token present.'
                                           : 'No refresh token yet.';
}
