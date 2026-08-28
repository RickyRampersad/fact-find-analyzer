/**
 * pbSalesforce.gs — the production board, queried from Salesforce.
 *
 * Every name starts with sf so nothing here can collide with anything already
 * in the project.
 *
 * ─── HOW TO SET IT UP ─────────────────────────────────────────────────────
 *
 * 1. Fill in the four blanks in SF_SEED just below. The Consumer Key and
 *    Secret come from Setup > External Client App Manager >
 *    RRB Dashboard Integration > Settings > OAuth Settings. Then your own
 *    Salesforce password and security token. Nothing new needs creating.
 *
 *    USE RRB DASHBOARD INTEGRATION, NOT CLAUDE INTEGRATION. Checked against
 *    the org: Claude Integration carries REFRESH_TOKEN and nothing else -
 *    OauthScopesAPI and OauthScopesFULL are both false, so it cannot read a
 *    record however good the password is. It fails as invalid_grant,
 *    "authentication failure", which reads exactly like a wrong password and
 *    sends you resetting credentials that were right all along.
 *    RRB Dashboard Integration has API and REFRESH_TOKEN, which is what this
 *    needs.
 *
 * 2. Ctrl+S, then press Run. It does not matter which function the dropdown
 *    is showing - sfCheck stores the credentials itself before it does
 *    anything else, and sfCheck is what the dropdown defaults to.
 *
 * 3. When the branch figures come back, blank those four values back to ''
 *    and save again. They are in Script Properties by then and this block is
 *    never read for anything else.
 *
 * 4. Only then, add to doGet in the main project:
 *
 *        if (action === 'prodboard') return sfBoard(e);
 *
 *    and Deploy > Manage deployments > edit > New version > Deploy.
 *
 * Nothing below logs a credential or returns one in a response.
 *
 * WHY THIS RATHER THAN THE SHEET
 * The "Branch Production Pick Up Date ThiS YEA SF" tab holds 401 rows where
 * Salesforce holds 708 for the same period: 390 apps and $3.44m against 688
 * and $6.28m, and nothing at all for the current week. The circulated report
 * agrees with Salesforce. A board built on that tab would have been
 * understated by nearly half.
 */

/* ── FILL THESE IN, RUN ONCE, THEN BLANK THEM AGAIN ─────────────────────── */

var SF_SEED = {
  SF_CLIENT_ID     : '',
  SF_CLIENT_SECRET : '',
  SF_LOGIN_URL     : 'https://rickyrampersadbranch.my.salesforce.com',
  SF_USERNAME      : 'ricky.rampersad@myguardiangroup.com',
  SF_PASSWORD      : '',
  SF_TOKEN         : ''
};

/* Anything non-blank in SF_SEED is written to Script Properties. Values are
   trimmed on the way in - a space pasted onto the front of a security token
   is invisible in the editor and looks exactly like a wrong password. */
function sfSeed_() {
  var p = PropertiesService.getScriptProperties(), n = 0;
  Object.keys(SF_SEED).forEach(function (k) {
    var v = String(SF_SEED[k] == null ? '' : SF_SEED[k]).trim();
    if (v) { p.setProperty(k, v); n++; }
  });
  return n;
}

/** Which credentials are actually stored. Names only, never values. */
function sfMissing_() {
  var p = PropertiesService.getScriptProperties();
  var miss = [];
  ['SF_CLIENT_ID', 'SF_CLIENT_SECRET', 'SF_LOGIN_URL'].forEach(function (k) {
    if (!p.getProperty(k)) miss.push(k);
  });
  if (p.getProperty('SF_REFRESH_TOKEN')) return miss;      /* refresh flow */
  ['SF_USERNAME', 'SF_PASSWORD', 'SF_TOKEN'].forEach(function (k) {
    if (!p.getProperty(k)) miss.push(k);
  });
  return miss;
}

var SF_API = 'v64.0';
var SF_TZ  = 'America/Port_of_Spain';

/* The report nests the four Salesforce units into two. Verified against the
   circulated sheet member for member: Gary eight, Kerwyn five, Ricky twelve,
   Akaash seven. Change this if the branch reorganises. */
var SF_ROLLUP = {
  '26001': ['Gary_Sookdeo', 'Kerwyn_Ramroach'],
  '26000': ['Ricky_Rampersad', 'Akaash_Kalladeen']
};

/* ── talking to Salesforce ──────────────────────────────────────────────── */

function sfProp_(k) {
  return PropertiesService.getScriptProperties().getProperty(k) || '';
}

function sfLogin_() {
  var id     = sfProp_('SF_CLIENT_ID'),
      secret = sfProp_('SF_CLIENT_SECRET'),
      refresh= sfProp_('SF_REFRESH_TOKEN'),
      user   = sfProp_('SF_USERNAME'),
      pw     = sfProp_('SF_PASSWORD'),
      tok    = sfProp_('SF_TOKEN'),
      host   = sfProp_('SF_LOGIN_URL') || 'https://login.salesforce.com';

  if (!id || !secret) {
    throw new Error('SF_CLIENT_ID and/or SF_CLIENT_SECRET are not stored yet. ' +
      'Fill them into SF_SEED at the top of this file, save, and press Run again. ' +
      'They come from RRB Dashboard Integration, not Claude Integration - see ' +
      'the note at the top.');
  }

  /* A refresh token is the flow to prefer: it does not carry a password, and
     it is not the one Salesforce has been switching off. Falls back to
     username-password only if no refresh token has been stored. */
  var payload;
  if (refresh) {
    payload = { grant_type: 'refresh_token', client_id: id, client_secret: secret,
                refresh_token: refresh };
  } else {
    if (!user || !pw) {
      throw new Error('Store SF_REFRESH_TOKEN, or else SF_USERNAME, SF_PASSWORD and ' +
        'SF_TOKEN, via SF_SEED at the top of this file.');
    }
    payload = { grant_type: 'password', client_id: id, client_secret: secret,
                username: user, password: pw + tok };
  }

  var res = UrlFetchApp.fetch(host + '/services/oauth2/token', {
    method: 'post', muteHttpExceptions: true, payload: payload
  });
  var body = res.getContentText();
  if (res.getResponseCode() !== 200) {
    var hint = '';
    /* Name the setting rather than the error code. "unsupported_grant_type"
       on a correctly built request means one thing in this org and there is
       no reason to make anybody look it up. */
    if (body.indexOf('unsupported_grant_type') > -1 ||
        body.indexOf('inactive') > -1) {
      hint = '  >>> The username-password flow is switched off in this org. ' +
             'Either tick Setup > Identity > OAuth and OpenID Connect Settings > ' +
             '"Allow OAuth Username-Password Flows", or store a refresh token ' +
             'in SF_REFRESH_TOKEN instead.';
    } else if (body.indexOf('invalid_grant') > -1) {
      /* Salesforce returns this same generic "authentication failure" when the
         username-password flow is switched off at org level as it does for a
         wrong password. It will not tell you which, so check the setting
         first - it is one look, where chasing the password is guesswork. */
      hint = '  >>> Three things give this identical message, in order of ' +
             'likelihood: (1) the username-password flow is off - Setup > ' +
             'Identity > OAuth and OpenID Connect Settings > "Allow OAuth ' +
             'Username-Password Flows"; (2) the password is wrong, or was ' +
             'changed since, which silently resets the security token too; ' +
             '(3) the security token is stale - Settings > Reset My Security ' +
             'Token, and use the new one.';
    } else if (body.indexOf('invalid_client') > -1) {
      hint = '  >>> Consumer Key or Secret wrong, or the app has not finished ' +
             'propagating - that takes about ten minutes after saving.';
    }
    throw new Error('Salesforce login refused (' + res.getResponseCode() + '): ' + body + hint);
  }
  var j = JSON.parse(body);
  return { token: j.access_token, url: j.instance_url };
}

/** One SOQL query, following nextRecordsUrl to the end. */
function sfQuery_(sess, soql) {
  var out = [];
  var url = sess.url + '/services/data/' + SF_API + '/query?q=' + encodeURIComponent(soql);
  for (var guard = 0; guard < 40 && url; guard++) {
    var res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + sess.token }
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('SOQL failed (' + res.getResponseCode() + '): ' + res.getContentText());
    }
    var j = JSON.parse(res.getContentText());
    out = out.concat(j.records || []);
    url = j.done ? null : (sess.url + j.nextRecordsUrl);
  }
  return out;
}

function sfDay_(d) { return Utilities.formatDate(d, SF_TZ, 'yyyy-MM-dd'); }

/* ── the board ──────────────────────────────────────────────────────────── */

function sfBoardData_() {
  var sess = sfLogin_();
  var now = new Date();
  var jan1 = new Date(now.getFullYear(), 0, 1);
  var dow = Number(Utilities.formatDate(now, SF_TZ, 'u'));      // 1 = Monday
  var monday = new Date(now.getTime() - (dow - 1) * 86400000);
  var from = sfDay_(jan1), wkFrom = sfDay_(monday);

  /* New business: apps from the App Count column, not a row count. Counting
     rows gave 786 against the circulated 686; App_Count__c gives 685 and
     matches advisor for advisor. */
  var nbY = sfQuery_(sess,
    "SELECT AGENT__r.Agent__c code, AGENT__r.Name agent, AGENT__r.Units__c unit, " +
    "SUM(App_Count__c) apps, SUM(Total_API__c) api " +
    "FROM CLIENT_PORTFOLIO__c WHERE Production_Picked_up_Date__c >= " + from +
    " GROUP BY AGENT__r.Agent__c, AGENT__r.Name, AGENT__r.Units__c");

  var nbW = sfQuery_(sess,
    "SELECT AGENT__r.Agent__c code, SUM(App_Count__c) apps, SUM(Total_API__c) api " +
    "FROM CLIENT_PORTFOLIO__c WHERE Production_Picked_up_Date__c >= " + wkFrom +
    " GROUP BY AGENT__r.Agent__c");

  /* Increases reach an advisor through the parent portfolio record, so they
     land on the right person rather than in a lump at the bottom. */
  var incY = sfQuery_(sess,
    "SELECT Policy_Increases__r.AGENT__r.Agent__c code, " +
    "SUM(App_Count_Inc__c) apps, SUM(Increase_API__c) api " +
    "FROM Policy_Increases__c WHERE Increase_Production_Picked_Up_Date__c >= " + from +
    " GROUP BY Policy_Increases__r.AGENT__r.Agent__c");

  var incW = sfQuery_(sess,
    "SELECT Policy_Increases__r.AGENT__r.Agent__c code, " +
    "SUM(App_Count_Inc__c) apps, SUM(Increase_API__c) api " +
    "FROM Policy_Increases__c WHERE Increase_Production_Picked_Up_Date__c >= " + wkFrom +
    " GROUP BY Policy_Increases__r.AGENT__r.Agent__c");

  var mix = sfQuery_(sess,
    "SELECT AGENT__r.Agent__c code, RecordType.Name rt, " +
    "SUM(App_Count__c) apps, SUM(Total_API__c) api " +
    "FROM CLIENT_PORTFOLIO__c WHERE Production_Picked_up_Date__c >= " + from +
    " GROUP BY AGENT__r.Agent__c, RecordType.Name");

  var qtr = sfQuery_(sess,
    "SELECT AGENT__r.Agent__c code, CALENDAR_QUARTER(Production_Picked_up_Date__c) q, " +
    "SUM(App_Count__c) apps, SUM(Total_API__c) api " +
    "FROM CLIENT_PORTFOLIO__c WHERE Production_Picked_up_Date__c >= " + from +
    " GROUP BY AGENT__r.Agent__c, CALENDAR_QUARTER(Production_Picked_up_Date__c)");

  var monNb = sfQuery_(sess,
    "SELECT CALENDAR_MONTH(Production_Picked_up_Date__c) m, SUM(Total_API__c) api " +
    "FROM CLIENT_PORTFOLIO__c WHERE Production_Picked_up_Date__c >= " + from +
    " GROUP BY CALENDAR_MONTH(Production_Picked_up_Date__c)");

  var monInc = sfQuery_(sess,
    "SELECT CALENDAR_MONTH(Increase_Production_Picked_Up_Date__c) m, SUM(Increase_API__c) api " +
    "FROM Policy_Increases__c WHERE Increase_Production_Picked_Up_Date__c >= " + from +
    " GROUP BY CALENDAR_MONTH(Increase_Production_Picked_Up_Date__c)");

  /* ── assemble ── */
  var A = {};
  function get(code) {
    if (!code) return null;
    return A[code] || (A[code] = { code: code, name: '', unit: '',
                                   w: [0, 0], y: [0, 0], inc: [0, 0], mix: [], q: {} });
  }
  nbY.forEach(function (r) {
    var a = get(r.code); if (!a) return;
    a.name = r.agent || a.name; a.unit = r.unit || a.unit;
    a.y[0] += (r.apps || 0); a.y[1] += (r.api || 0);
  });
  nbW.forEach(function (r) { var a = get(r.code); if (a) { a.w[0] += (r.apps||0); a.w[1] += (r.api||0); } });
  incY.forEach(function (r) { var a = get(r.code); if (a) { a.y[0] += (r.apps||0); a.y[1] += (r.api||0);
                                                            a.inc[0] += (r.apps||0); a.inc[1] += (r.api||0); } });
  incW.forEach(function (r) { var a = get(r.code); if (a) { a.w[0] += (r.apps||0); a.w[1] += (r.api||0); } });
  mix.forEach(function (r) { var a = get(r.code); if (a && r.rt)
                              a.mix.push({ k: r.rt, apps: r.apps || 0, api: r.api || 0 }); });
  qtr.forEach(function (r) { var a = get(r.code); if (a && r.q)
                              a.q['q' + r.q] = [r.apps || 0, r.api || 0]; });

  /* unit -> the two reported groups */
  var unitOf = {};
  Object.keys(SF_ROLLUP).forEach(function (u) {
    SF_ROLLUP[u].forEach(function (m) { unitOf[m] = u; });
  });

  var groups = {};
  Object.keys(A).forEach(function (code) {
    var a = A[code];
    var top = unitOf[a.unit] || a.unit || 'Unassigned';
    var g = groups[top] || (groups[top] = {});
    (g[a.unit || 'Unassigned'] = g[a.unit || 'Unassigned'] || []).push(a);
  });

  var rows = [], TW = [0, 0], TY = [0, 0];
  Object.keys(groups).sort().forEach(function (top) {
    var mgrs = groups[top], uw = [0, 0], uy = [0, 0];
    Object.keys(mgrs).forEach(function (m) {
      mgrs[m].forEach(function (a) {
        uw[0]+=a.w[0]; uw[1]+=a.w[1]; uy[0]+=a.y[0]; uy[1]+=a.y[1];
      });
    });
    rows.push({ lvl: 0, label: top, w: uw, y: uy });
    TW[0]+=uw[0]; TW[1]+=uw[1]; TY[0]+=uy[0]; TY[1]+=uy[1];
    Object.keys(mgrs).sort().forEach(function (m) {
      var mw = [0, 0], my = [0, 0];
      mgrs[m].forEach(function (a) { mw[0]+=a.w[0]; mw[1]+=a.w[1]; my[0]+=a.y[0]; my[1]+=a.y[1]; });
      rows.push({ lvl: 1, label: String(m).replace(/_/g, ' '), w: mw, y: my });
      mgrs[m].sort(function (x, y) { return y.y[1] - x.y[1]; }).forEach(function (a) {
        rows.push({ lvl: 2, label: a.code + (a.name ? ' - ' + a.name : ''),
                    w: (a.w[0] || a.w[1]) ? a.w : null,
                    y: (a.y[0] || a.y[1]) ? a.y : null });
      });
    });
  });

  var MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var byM = {};
  monNb.forEach(function (r) { (byM[r.m] = byM[r.m] || { nb: 0, inc: 0 }).nb = r.api || 0; });
  monInc.forEach(function (r) { (byM[r.m] = byM[r.m] || { nb: 0, inc: 0 }).inc = r.api || 0; });
  var series = Object.keys(byM).sort(function (a, b) { return a - b; }).map(function (m) {
    return { m: MN[m - 1], nb: byM[m].nb, inc: byM[m].inc };
  });

  var agents = Object.keys(A).map(function (c) { return A[c]; })
    .sort(function (x, y) { return y.y[1] - x.y[1]; })
    .map(function (a) {
      return { code: a.code, name: a.name || a.code,
               unit: String(a.unit || '').replace(/_/g, ' '),
               mix: a.mix, q: a.q,
               w: (a.w[0] || a.w[1]) ? a.w : null,
               y: a.y, inc: a.inc };
    });

  return {
    submitted: {
      asAt: Utilities.formatDate(now, SF_TZ, 'd MMM yyyy'),
      week: Number(Utilities.formatDate(now, SF_TZ, 'w')),
      rows: rows, total: { w: TW, y: TY }, series: series
    },
    agents: agents,
    diag: { advisors: agents.length, weekFrom: wkFrom, source: 'Salesforce' }
  };
}

/* ── the two entry points ───────────────────────────────────────────────── */

function sfJson_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
                       .setMimeType(ContentService.MimeType.JSON);
}

function sfBoard(e) {
  if (!e || !e.parameter) return sfCheck();       /* pressed Run, not called */
  var who = (typeof rrbAuthorize_ === 'function') ? rrbAuthorize_(e) : null;
  if (!who || !who.ok) return sfJson_({ ok: false, error: 'Your session has expired. Please sign in again.' });
  var scope = (typeof rrbScopeForRole_ === 'function') ? rrbScopeForRole_(who) : null;
  if (!scope || scope.kind !== 'branch') return sfJson_({ ok: true, submitted: null });
  try {
    var d = sfBoardData_();
    return sfJson_({ ok: true, submitted: d.submitted, agents: d.agents, diag: d.diag });
  } catch (err) {
    return sfJson_({ ok: false, error: String(err && err.message || err) });
  }
}

/**
 * Press Run with this selected - it is what the dropdown defaults to.
 * Stores whatever is in SF_SEED first, so there is no second function to
 * remember and no order to get wrong.
 */
function sfCheck() {
  var seeded = sfSeed_();
  var miss = sfMissing_();
  console.log('Seeded this run : ' + seeded + ' value(s) from SF_SEED');
  if (miss.length) {
    console.log('STILL MISSING   : ' + miss.join(', '));
    console.log('');
    console.log('Fill those into SF_SEED at the top of this file, Ctrl+S, press Run again.');
    return 'STILL MISSING: ' + miss.join(', ');
  }
  console.log('Credentials     : all stored');
  console.log('');
  try {
    var d = sfBoardData_(), s = d.submitted;
    console.log('SOURCE      : Salesforce');
    console.log('As at       : ' + s.asAt + '   week ' + s.week + ' from ' + d.diag.weekFrom);
    console.log('Advisors    : ' + d.diag.advisors);
    console.log('Board rows  : ' + s.rows.length);
    console.log('TOTAL week  : ' + s.total.w[0] + ' apps  $' + s.total.w[1].toFixed(2));
    console.log('TOTAL year  : ' + s.total.y[0] + ' apps  $' + s.total.y[1].toFixed(2));
    console.log('');
    s.rows.slice(0, 16).forEach(function (r) {
      console.log('  ' + ['', '  ', '    '][r.lvl] + r.label +
                  '   y=' + (r.y ? r.y[0] + '/' + r.y[1].toFixed(2) : '-'));
    });
    return 'Salesforce | advisors ' + d.diag.advisors +
           ' | week ' + s.total.w[0] + '/' + s.total.w[1].toFixed(2) +
           ' | year ' + s.total.y[0] + '/' + s.total.y[1].toFixed(2);
  } catch (err) {
    console.log('FAILED: ' + (err && err.message || err));
    return 'FAILED: ' + (err && err.message || err);
  }
}
