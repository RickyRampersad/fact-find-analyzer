/**
 * pbSalesforce.gs — the production board, queried from Salesforce.
 *
 * Every name starts with sf so nothing here can collide with anything already
 * in the project.
 *
 * ─── SETUP, ONCE ──────────────────────────────────────────────────────────
 *
 * 1. In Salesforce: Setup > App Manager > New Connected App
 *      Connected App Name:  Branch Wall
 *      Contact Email:       your address
 *      Tick "Enable OAuth Settings"
 *      Callback URL:        https://login.salesforce.com/services/oauth2/success
 *      Selected OAuth Scopes: "Manage user data via APIs (api)"
 *      Untick "Require Proof Key for Code Exchange (PKCE)"
 *      Save, then Continue. Wait ten minutes for it to propagate.
 *      Open it again > Manage Consumer Details to see the Key and Secret.
 *
 * 2. In Apps Script: Project Settings (the cog) > Script Properties > Add:
 *
 *      SF_CLIENT_ID       the Consumer Key
 *      SF_CLIENT_SECRET   the Consumer Secret
 *      SF_USERNAME        ricky.rampersad@myguardiangroup.com
 *      SF_PASSWORD        your Salesforce password
 *      SF_TOKEN           your security token
 *      SF_LOGIN_URL       https://login.salesforce.com     (optional)
 *
 *    Reset the security token from Salesforce > Settings > Reset My Security
 *    Token if you do not have it; it arrives by email.
 *
 *    THE CREDENTIALS LIVE ONLY IN SCRIPT PROPERTIES. Nothing here writes them
 *    to a sheet, a log or a response, and nothing is stored in this file.
 *
 * 3. Run sfCheck. Read the log.
 *
 * 4. Only when that looks right, in doGet's router:
 *
 *        if (action === 'prodboard') return sfBoard(e);
 *
 *    Deploy > Manage deployments > edit > New version > Deploy.
 *
 * WHY THIS RATHER THAN THE SHEET
 * The "Branch Production Pick Up Date ThiS YEA SF" tab holds 401 rows where
 * Salesforce holds 708 for the same period: 390 apps and $3.44m against 688
 * and $6.28m, and nothing at all for the current week. The circulated report
 * agrees with Salesforce. A board built on that tab would have been
 * understated by nearly half.
 */

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
  var id = sfProp_('SF_CLIENT_ID'), secret = sfProp_('SF_CLIENT_SECRET');
  var user = sfProp_('SF_USERNAME'), pw = sfProp_('SF_PASSWORD'), tok = sfProp_('SF_TOKEN');
  var host = sfProp_('SF_LOGIN_URL') || 'https://login.salesforce.com';
  var missing = [];
  if (!id) missing.push('SF_CLIENT_ID');
  if (!secret) missing.push('SF_CLIENT_SECRET');
  if (!user) missing.push('SF_USERNAME');
  if (!pw) missing.push('SF_PASSWORD');
  if (missing.length) throw new Error('Script Properties missing: ' + missing.join(', '));

  var res = UrlFetchApp.fetch(host + '/services/oauth2/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'password', client_id: id, client_secret: secret,
               username: user, password: pw + tok }
  });
  var body = res.getContentText();
  if (res.getResponseCode() !== 200) {
    /* Salesforce says why, and it is usually one of three things. Passed
       through as-is rather than summarised: the real message names which. */
    throw new Error('Salesforce login refused (' + res.getResponseCode() + '): ' + body);
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

/** RUN THIS ONE. Read the log. */
function sfCheck() {
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
