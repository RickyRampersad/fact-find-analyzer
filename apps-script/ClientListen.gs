/**
 * ClientListen.gs — Andrew reads the client their plan.
 *
 * WHY (9 November 2026)
 *   "Did we activate the voice, Andrew's voice, so a person can play while
 *   they're driving home from work?" The narrated plan was built on
 *   3 November on the practice copy and never reached a client. The branch
 *   manager: "Yes … this is a first ever and should be the highlight …
 *   Andrew now reads to your client your recommendation."
 *
 * WHAT IT DOES
 *   1. A few minutes after a client's draft goes out, the client gets one more
 *      e-mail from support@, signed by their advisor: "Andrew will read you
 *      your plan". It is a separate e-mail on purpose: the draft e-mail, the
 *      fact find and the Guardian form are not touched in any way.
 *   2. The button opens factfind360.com/listen with a private link. If the
 *      client's date of birth is on the fact find, the page asks for it first.
 *   3. The page shows the plan scene by scene from the client's own fact find
 *      (what they told us, what we noticed, what the family would need, what
 *      the advisor recommends and why) and Andrew reads it: one recording,
 *      so it keeps playing with the phone locked in the car.
 *   4. When the client has listened to the end, the advisor and the branch
 *      manager get an internal e-mail: the client has heard the plan, call now.
 *
 *   It never writes a recommendation: every plan, amount and reason is the
 *   advisor's own, read off their rows. Andrew adds only facts from the fact
 *   find (the "what we noticed" lines), as on the practice copy.
 *
 * THE VOICE
 *   Andrew is made by Microsoft Azure Speech (en-US-AndrewNeural, -4%), with
 *   the AZURE_SPEECH_KEY and AZURE_SPEECH_REGION Script properties that
 *   AiPartner.gs already reads. Without them the page reads in the phone's own
 *   voice. Each plan's recording is made once and kept in Drive ("Client
 *   Listen audio"), so playing it again costs nothing.
 *
 * MODES (Script property CL_MODE)
 *   unset / 'test'  nothing goes to any client. clTest() sends the branch
 *                   manager the e-mail for the newest case, marked TEST.
 *   'live'          the e-mail goes to each client after their draft.
 *   'off'           nothing at all.
 *
 * PUT IT IN
 *   + next to Files > Script, name it ClientListen, paste this file, LAST in
 *   the list. Save. Deploy > Manage deployments > pencil > New version >
 *   Deploy. Run clTest, then clGoLive when the branch manager says go.
 *
 * Every name here starts with cl.
 */

var CL = {
  PAGE: 'https://factfind360.com/listen',
  DAYS: 60,                 // how long a listen link works
  FROM: '2026-11-10',       // drafts sent before this day are never written to by the tick
  WAIT_MIN: 3,              // minutes after the draft before this e-mail goes
  LOOK_DAYS: 3,             // the tick looks at drafts sent in the last three days
  TRIES: 6,                 // date-of-birth tries a link gets in an hour
  MAX_CHARS: 6000,          // the longest script Andrew will read
  VOICE: 'en-US-AndrewNeural', RATE: '-4%',
  TAB: 'Client Listen',
  COLS: ['Id', 'Client', 'Advisor', 'Agent Code', 'Email', 'Sent At', 'Mode', 'Opened At', 'Opens', 'Finished At', 'Told Advisor At',
         'Plays', 'Heard %', 'Stopped At', 'WhatsApp Taps', 'Call Taps', 'Ask Taps', 'Device', 'Last Seen'],
  FOLDER: 'Client Listen audio',
  BRANCH: 'Ricky Rampersad Branch',
  WA: '18686785921'
};

/* ── the doors ─────────────────────────────────────────────────────────── */

var CL_PREV_DOGET_ = (typeof doGet === 'function') ? doGet : null;
if (CL_PREV_DOGET_) doGet = function (e) {
  var a = (e && e.parameter && e.parameter.action) || '';
  if (a === 'listen_stats') {
    var st;
    try { st = clStats_(e.parameter); } catch (err) { Logger.log('listen_stats failed: %s', (err && err.stack) || err); st = { ok: false, error: String((err && err.message) || err) }; }
    return _ffJson(st);
  }
  if (a === 'listen') {
    var out;
    try { out = clOpen_(e.parameter); } catch (err) { Logger.log('listen failed: %s', (err && err.stack) || err); out = { ok: false, error: 'The plan could not be opened just now. Please try again in a minute.' }; }
    return _ffJson(out);
  }
  return CL_PREV_DOGET_(e);
};

var CL_PREV_SUBMIT_ = (typeof ffProcessAgentSubmit === 'function') ? ffProcessAgentSubmit : null;
ffProcessAgentSubmit = function (data) {
  if (data && (data.stage === 'listen_audio' || data.stage === 'listen_done' || data.stage === 'listen_ping')) {
    var out;
    try { out = data.stage === 'listen_audio' ? clAudio_(data) : data.stage === 'listen_ping' ? clPing_(data) : clDone_(data); }
    catch (err) { Logger.log('%s failed: %s', data.stage, (err && err.stack) || err); out = { ok: false, error: String((err && err.message) || err) }; }
    return _ffJson(out);
  }
  if (!CL_PREV_SUBMIT_) return _ffJson({ ok: false, error: 'Server set-up: ClientListen must be the last file in the project.' });
  return CL_PREV_SUBMIT_(data);
};

/* ── small things ──────────────────────────────────────────────────────── */

function clStr_(v) { return v == null ? '' : String(v).trim(); }
function clNum_(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }
function clFirst_(n) { return clStr_(n).split(/\s+/)[0] || ''; }
function clLast_(n) { var p = clStr_(n).split(/\s+/); return p.length > 1 ? p[p.length - 1] : ''; }
function clEsc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function clTT_(n) { return 'TT$' + Math.round(n).toLocaleString('en-US'); }
function clProps_() { return PropertiesService.getScriptProperties(); }
function clMode_() { var m = clStr_(clProps_().getProperty('CL_MODE')).toLowerCase(); return m === 'live' || m === 'off' ? m : 'test'; }
function clDate_(v) { if (!v) return null; var d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? null : d; }
function clTitle_(s) { return clStr_(s).toLowerCase().replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }); }
function clName_(s) { s = clStr_(s); return s && s === s.toUpperCase() ? clTitle_(s) : s; }   // "PENELOPE" reads as "Penelope"

/* The secret the links are signed with, made once and kept in the Script properties. */
function clSecret_() {
  var p = clProps_(), s = p.getProperty('CL_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('CL_SECRET', s); }
  return s;
}
function clSig_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(text), clSecret_())).replace(/=+$/, '').slice(0, 24);
}
function clToken_(id) {
  var exp = Math.floor(Date.now() / 864e5) + CL.DAYS;
  var b = Utilities.base64EncodeWebSafe(String(id)).replace(/=+$/, '');
  return b + '.' + exp + '.' + clSig_(b + '.' + exp);
}
/* The case id a link is for, or '' when the link is altered or past its day. */
function clVerify_(t) {
  var p = clStr_(t).split('.');
  if (p.length !== 3) return '';
  if (clSig_(p[0] + '.' + p[1]) !== p[2]) return '';
  if (+p[1] < Math.floor(Date.now() / 864e5)) return 'expired';
  try { return Utilities.newBlob(Utilities.base64DecodeWebSafe(p[0] + '==='.slice((p[0].length + 3) % 4))).getDataAsString(); } catch (e) { return ''; }
}
/* What the page proves it unlocked the plan with: the voice and "done" doors need it. */
function clKey_(id) { return clSig_('say|' + id); }

/* ── reading a case ────────────────────────────────────────────────────── */

function clId_(d) { return clStr_(d.submissionId) || clStr_(d.id) || clStr_(d.Id) || clStr_(d['Submission ID']); }
function clCase_(id) {
  var sheet = ffGetOrCreateRevisedTab_();
  var headers = ffEnsureHeaders_(sheet);
  var row = ffFindRowBySubmissionId_(sheet, headers, id);
  if (!row || row < 0) return null;
  return ffReadRow_(sheet, headers, row);
}
function clEmailOf_(d) {
  if (typeof rrbClientEmail_ === 'function') { try { return clStr_(rrbClientEmail_(d)); } catch (e) {} }
  var e = clStr_(d.email) || clStr_(d.adviceClientEmail);
  return e.indexOf('@') > 0 ? e : '';
}
function clDobOf_(d) {
  var v = d.dob || d.clientDob || d.dateOfBirth;
  var x = clDate_(v);
  return x ? Utilities.formatDate(x, 'America/Port_of_Spain', 'yyyy-MM-dd') : '';
}
function clAge_(v) {
  var d = clDate_(v); if (!d) return '';
  var n = new Date(), a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return a >= 0 && a < 120 ? a : '';
}
function clFig_(v) { var n = clNum_(v); return n > 0 ? clTT_(n) : ''; }

/* The plan as the page shows it: the same facts the practice copy reads off the form (client-plan.js). */
function clPlan_(d) {
  var v = function (k) { return clStr_(d[k]); };
  var advice = v('appType') === 'advice' || (typeof rrbIsAdviceOnly_ === 'function' && (function () { try { return rrbIsAdviceOnly_(d); } catch (e) { return false; } })());
  var client = clName_(v('fullName') || v('clientName') || v('adviceClientName'));
  var kids = [];
  for (var i = 1; i <= 3; i++) if (v('child' + i + 'Name')) kids.push({ name: clName_(clFirst_(v('child' + i + 'Name'))), age: clAge_(d['child' + i + 'Dob']) });
  var goals = [];
  for (var g = 1; g <= 4; g++) if (v('goal' + g + 'Need')) goals.push({ need: v('goal' + g + 'Need'), desc: v('goal' + g + 'Desc'), val: clNum_(v('goal' + g + 'Val')) });
  var recs = [];
  for (var r = 1; r <= 6; r++) {
    if (!v('rec' + r + 'Rec')) continue;
    recs.push({ need: v('rec' + r + 'Need'), who: v('rec' + r + 'Who') || 'Client', plan: v('rec' + r + 'Rec'), amt: clNum_(v('rec' + r + 'Amt')), reason: v('rec' + r + 'Reason') });
  }
  var spouse = clName_(v('spouseName'));
  var D = {
    advice: advice, first: clFirst_(client), surname: clLast_(client) || client,
    spouse: spouse, spouseFirst: clFirst_(spouse), kids: kids, need: v('adviceClientNeed'),
    income: clNum_(v('monthlyIncome')), spouseIncome: clNum_(v('spouseMonthlyIncome')), spend: clNum_(v('monthlyExpenses')),
    mortgage: clNum_(v('mortgageBal')), goals: goals, recs: recs,
    totalNeed: clFig_(d.totalNeed_calc || d.totalNeed), cover: clFig_(d.totalCoverage_calc || d.totalCoverage), gap: clFig_(d.insuranceNeed_calc || d.insuranceNeed),
    advisor: clName_(v('advisorName')) || 'your advisor', advisorFirst: clName_(clFirst_(v('advisorName'))) || 'your advisor',
    advisorEmail: v('agentEmail'), branch: CL.BRANCH
  };
  D.insights = advice ? [] : clInsights_(d, D);
  return D;
}

/* What Andrew noticed: facts from the fact find only, never a product or an amount of cover. */
function clInsights_(d, D) {
  var out = [], v = function (k) { return clStr_(d[k]); };
  function add(k, title, text, say) { out.push({ k: k, title: title, text: text, say: say || text }); }
  if (D.spend && D.income && D.spouseIncome && D.spend > D.income && D.spend > D.spouseIncome) {
    add('both', 'You depend on each other', 'Your family spends ' + clTT_(D.spend) + ' a month. Neither salary covers that alone.',
        'Your family spends ' + Math.round(D.spend).toLocaleString('en-US') + ' dollars a month. Neither salary covers that alone. You depend on each other.');
  }
  var pols = [];
  for (var i = 1; i <= 4; i++) if (v('ins' + i + 'Co') && !/^none$/i.test(v('ins' + i + 'Co'))) pols.push({ owner: v('ins' + i + 'Owner'), type: v('ins' + i + 'Type'), sum: clNum_(v('ins' + i + 'Sum')), status: v('ins' + i + 'Status') });
  var live = pols.filter(function (p) { return !/lapsed|surrender/i.test(p.status); });
  if (live.length && live.every(function (p) { return /group/i.test(p.type); })) {
    var gs = live.reduce(function (a, p) { return a + p.sum; }, 0);
    add('group', 'Your cover is only through work', (gs ? clTT_(gs) + ' of group life. ' : '') + 'It usually ends if the job ends.',
        'Your only cover today is group life through work' + (gs ? ', ' + Math.round(gs).toLocaleString('en-US') + ' dollars' : '') + '. It usually ends if the job ends.');
  }
  if (D.spouse && !live.some(function (p) { return /spouse|joint/i.test(p.owner); })) {
    var pr = /^f/i.test(v('spouseGender')) ? 'her' : /^m/i.test(v('spouseGender')) ? 'his' : 'their';
    add('spouse', D.spouseFirst + ' has no cover of ' + pr + ' own', 'Nothing on file protects the family if ' + D.spouseFirst + ' could not be there.',
        D.spouseFirst + ' has no life cover of ' + pr + ' own. Nothing on file protects the family if ' + D.spouseFirst + ' could not be there.');
  }
  var ages = D.kids.map(function (k) { return k.age; }).filter(function (a) { return a !== ''; });
  var edu = D.goals.filter(function (g) { return /educat|univers|school|college/i.test(g.need + ' ' + g.desc) && g.val; })[0];
  if (edu && ages.length) {
    var eldest = Math.max.apply(null, ages), yrs = Math.max(1, 18 - eldest), fv = edu.val * Math.pow(1.03, yrs);
    add('edu', 'University will cost more', clTT_(edu.val) + ' today is about ' + clTT_(Math.round(fv / 1000) * 1000) + ' in ' + yrs + ' years, at 3% inflation.',
        'The ' + Math.round(edu.val).toLocaleString('en-US') + ' dollars you set aside for university becomes about ' + Math.round(fv / 1000).toLocaleString('en-US') + ' thousand in ' + yrs + ' years, at three percent inflation.');
  }
  return out.slice(0, 4);
}

/* ── the page asks for the plan ────────────────────────────────────────── */

function clOpen_(p) {
  var id = clVerify_(p.t);
  if (id === 'expired') return { ok: false, expired: true, error: 'This link has expired. Please ask your advisor to send it again.' };
  if (!id) return { ok: false, error: 'This link is not complete. Please open it again from the e-mail.' };
  var d = clCase_(id);
  if (!d) return { ok: false, error: 'We could not find this plan. Please ask your advisor.' };
  if (/declin|cancel/i.test(clStr_(d.status))) return { ok: false, error: 'This plan is no longer open. Please speak to your advisor.' };
  var dob = clDobOf_(d);
  if (dob) {
    var given = clStr_(p.dob);
    if (!given) return { ok: false, needDob: true, first: clName_(clFirst_(clStr_(d.fullName) || clStr_(d.clientName) || clStr_(d.adviceClientName))) };
    var c = CacheService.getScriptCache(), ck = 'cl_try_' + clSig_(p.t), n = +(c.get(ck) || 0);
    if (n >= CL.TRIES) return { ok: false, needDob: true, locked: true, error: 'Too many tries. Please wait an hour, or ask your advisor.' };
    if (given !== dob) { c.put(ck, String(n + 1), 3600); return { ok: false, needDob: true, wrong: true, error: 'That date of birth does not match our records.' }; }
  }
  clLog_(id, function (r) { r['Opened At'] = r['Opened At'] || new Date().toISOString(); r['Opens'] = (+r['Opens'] || 0) + 1; });
  return { ok: true, v: 'cl1', plan: clPlan_(d), k: clKey_(id), voice: clVoiceReady_() };
}

/* ── Andrew's voice ────────────────────────────────────────────────────── */

function clVoiceReady_() { var p = clProps_(); return !!(p.getProperty('AZURE_SPEECH_KEY') && p.getProperty('AZURE_SPEECH_REGION')); }
function clXml_(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]; }); }
function clFolder_() {
  var it = DriveApp.getFoldersByName(CL.FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CL.FOLDER);
}

/* One recording of the whole script: each line made by Azure (all at once), the MP3s joined end to end, and where
   each line starts, so the page moves the scenes with the voice and keeps playing with the phone locked. */
function clAudio_(data) {
  var id = clVerify_(data.t);
  if (!id || id === 'expired' || clStr_(data.k) !== clKey_(id)) return { ok: false, error: 'This link is not complete.' };
  var lines = (data.lines || []).map(function (s) { return clStr_(s).slice(0, 700); }).filter(Boolean);
  var total = lines.join(' ').length;
  if (!lines.length || total > CL.MAX_CHARS) return { ok: false, error: 'Nothing to read.' };
  if (!clVoiceReady_()) return { ok: false, noVoice: true };
  var p = clProps_(), voice = clStr_(p.getProperty('AZURE_VOICE')) || CL.VOICE;
  var name = 'cl-' + clSig_('audio|' + voice + '|' + CL.RATE + '|' + lines.join('\n')) + '.json';
  var folder = clFolder_(), have = folder.getFilesByName(name);
  if (have.hasNext()) { var kept = JSON.parse(have.next().getBlob().getDataAsString()); kept.ok = true; kept.kept = true; return kept; }

  var url = 'https://' + clStr_(p.getProperty('AZURE_SPEECH_REGION')).toLowerCase() + '.tts.speech.microsoft.com/cognitiveservices/v1';
  var reqs = lines.map(function (t) {
    return { url: url, method: 'post', muteHttpExceptions: true, contentType: 'application/ssml+xml',
      headers: { 'Ocp-Apim-Subscription-Key': clStr_(p.getProperty('AZURE_SPEECH_KEY')), 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'FactFind360' },
      payload: '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="' + clXml_(voice) + '"><prosody rate="' + CL.RATE + '">' +
        clXml_(t) + '</prosody></voice><break time="450ms"/></speak>' };
  });
  var res = UrlFetchApp.fetchAll(reqs), bytes = [], marks = [], at = 0;
  for (var i = 0; i < res.length; i++) {
    if (res[i].getResponseCode() !== 200) throw new Error('Azure Speech answered ' + res[i].getResponseCode());
    var b = res[i].getBlob().getBytes();
    marks.push(Math.round(at * 100) / 100);
    at += b.length * 8 / 48000;              // 48 kbit/s, constant
    bytes = bytes.concat(b);
  }
  var out = { audio: Utilities.base64Encode(bytes), marks: marks, secs: Math.round(at * 10) / 10, chars: total };
  folder.createFile(Utilities.newBlob(JSON.stringify(out), 'application/json', name));
  out.ok = true;
  return out;
}

/* ── the client heard it to the end ────────────────────────────────────── */

function clDone_(data) {
  var id = clVerify_(data.t);
  if (!id || id === 'expired' || clStr_(data.k) !== clKey_(id)) return { ok: false };
  var told = false, rowSeen = null;
  clLog_(id, function (r) {
    rowSeen = r;
    r['Finished At'] = r['Finished At'] || new Date().toISOString();
    r['Heard %'] = 100; r['Last Seen'] = new Date().toISOString();
    if (!r['Told Advisor At'] && r['Mode'] !== 'test') { r['Told Advisor At'] = new Date().toISOString(); told = true; }
  });
  if (told) { try { clTellAdvisor_(id); } catch (e) { Logger.log('cl tell advisor: %s', e && e.message); } }
  return { ok: true };
}
function clTellAdvisor_(id) {
  var d = clCase_(id); if (!d) return;
  var D = clPlan_(d), to = clStr_(d.agentEmail);
  var bm = (typeof MAIL_CONFIG !== 'undefined' && MAIL_CONFIG.branchManager) || '';
  if (!to) to = bm;
  if (!to) return;
  var who = D.first + (D.surname && D.surname !== D.first ? ' ' + D.surname : '');
  MailApp.sendEmail({
    to: to, cc: bm && bm !== to ? bm : '', name: 'FactFind360',
    subject: who + ' just listened to the whole plan. Call now.',
    htmlBody: '<div style="font:15px/1.55 Arial,sans-serif;color:#0F172A;max-width:560px">' +
      '<p style="font-size:20px;font-weight:800;margin:0 0 8px">' + clEsc_(who) + ' has just heard your plan, read by Andrew, all the way to the end.</p>' +
      '<p>This is the best moment to call: it is fresh in their mind. Ask what they thought, answer any question, and ask them to tap <b>Yes, that\'s correct</b> in the draft e-mail.</p>' +
      '<p style="color:#64748B;font-size:13px">Internal · FactFind360 · Ricky Rampersad Branch. Do not forward outside the branch.</p></div>'
  });
}

/* ── what the client did on the page ───────────────────────────────────── */

/* ev: play (pressed Play), at (how far: pct of the plan, and the scene), pause, wa / call / ask (a button). */
function clPing_(data) {
  var id = clVerify_(data.t);
  if (!id || id === 'expired' || clStr_(data.k) !== clKey_(id)) return { ok: false };
  var ev = clStr_(data.ev), pct = Math.max(0, Math.min(100, Math.round(clNum_(data.pct)))), scene = clStr_(data.scene).slice(0, 40);
  clLog_(id, function (r) {
    if (ev === 'play') r['Plays'] = (+r['Plays'] || 0) + 1;
    if (pct > (+r['Heard %'] || 0)) r['Heard %'] = pct;
    if (scene && !r['Finished At']) r['Stopped At'] = scene;
    if (ev === 'wa') r['WhatsApp Taps'] = (+r['WhatsApp Taps'] || 0) + 1;
    if (ev === 'call') r['Call Taps'] = (+r['Call Taps'] || 0) + 1;
    if (ev === 'ask') r['Ask Taps'] = (+r['Ask Taps'] || 0) + 1;
    if (!r['Device'] && data.dev) r['Device'] = clStr_(data.dev).slice(0, 20);
    r['Last Seen'] = new Date().toISOString();
  });
  return { ok: true };
}

/* For the dashboard: every listen e-mail the signed-in person may see, with whether the client then confirmed. */
function clStats_(p) {
  var me = (typeof rrbAuthorize_ === 'function') ? rrbAuthorize_({ parameter: { token: clStr_(p.token) } }) : null;
  if (!me) return (typeof RRB_EXPIRED !== 'undefined') ? RRB_EXPIRED : { ok: false, expired: true };
  var kind = (me.scope && me.scope.kind) || 'agent', myCode = clStr_(me.code).toUpperCase();
  var seen = function (code) {
    code = clStr_(code).toUpperCase();
    if (kind === 'branch') return true;
    if (kind === 'unit' || kind === 'units') { try { return rrbScopeHasUnit_(me.scope, ffLookupDirectManager_(code)); } catch (e) { return false; } }
    return code && code === myCode;
  };
  /* Whether each client confirmed, off the fact find sheet in one read. */
  var sheet = ffGetOrCreateRevisedTab_(), headers = ffEnsureHeaders_(sheet), last = sheet.getLastRow(), conf = {};
  if (last >= 2) {
    var maps = _ffSchemaMaps(), at = {};
    headers.forEach(function (h, i) { at[maps.l2k[h] || h] = i; });
    var cId = at.submissionId !== undefined ? at.submissionId : at.id, cC = at.clientConfirmed, cCA = at.clientConfirmedAt, cS = at.status;
    if (cId !== undefined) sheet.getRange(2, 1, last - 1, headers.length).getValues().forEach(function (r) {
      conf[clStr_(r[cId])] = { yes: cC !== undefined && /^(yes|true|ok|confirmed)/i.test(clStr_(r[cC])), at: cCA !== undefined ? r[cCA] : '', status: cS !== undefined ? clStr_(r[cS]) : '' };
    });
  }
  var rows = clRows_(), out = [];
  Object.keys(rows).forEach(function (id) {
    var r = rows[id]; if (r.Mode !== 'live' || !seen(r['Agent Code'])) return;
    var c = conf[id] || {}, ca = clDate_(c.at), op = clDate_(r['Opened At']);
    out.push({ id: id, client: clStr_(r.Client), advisor: clStr_(r.Advisor), code: clStr_(r['Agent Code']),
      sent: clStr_(r['Sent At']), opened: clStr_(r['Opened At']), opens: +r.Opens || 0, plays: +r.Plays || 0,
      heard: +r['Heard %'] || 0, finished: clStr_(r['Finished At']), stopped: clStr_(r['Stopped At']),
      wa: +r['WhatsApp Taps'] || 0, call: +r['Call Taps'] || 0, ask: +r['Ask Taps'] || 0, device: clStr_(r.Device),
      confirmed: !!c.yes, confirmedAfter: !!(c.yes && op && (!ca || ca.getTime() >= op.getTime())), status: c.status || '' });
  });
  out.sort(function (a, b) { return a.sent < b.sent ? 1 : -1; });
  var n = out.length, cnt = function (f) { return out.filter(f).length; };
  var opened = out.filter(function (x) { return x.opened; });
  return { ok: true, v: 'cl1', mode: clMode_(), voice: clVoiceReady_(), rows: out.slice(0, 200), total: {
    sent: n, opened: opened.length, finished: cnt(function (x) { return x.finished; }),
    avgHeard: opened.length ? Math.round(opened.reduce(function (a, x) { return a + x.heard; }, 0) / opened.length) : 0,
    confirmed: cnt(function (x) { return x.confirmed; }), confirmedAfter: cnt(function (x) { return x.confirmedAfter; }),
    taps: out.reduce(function (a, x) { return a + x.wa + x.call + x.ask; }, 0) } };
}

/* ── the record ────────────────────────────────────────────────────────── */

function clTab_() {
  var ss = ffGetOrCreateRevisedTab_().getParent(), sh = ss.getSheetByName(CL.TAB);
  if (!sh) { sh = ss.insertSheet(CL.TAB); sh.setFrozenRows(1); }
  var head = sh.getLastRow() ? sh.getRange(1, 1, 1, CL.COLS.length).getValues()[0] : [];
  if (head.join('|') !== CL.COLS.join('|')) sh.getRange(1, 1, 1, CL.COLS.length).setValues([CL.COLS]).setFontWeight('bold');
  return sh;
}
function clRows_() {
  var sh = clTab_(), last = sh.getLastRow(), out = {};
  if (last < 2) return out;
  var v = sh.getRange(2, 1, last - 1, CL.COLS.length).getValues();
  v.forEach(function (row, i) { var o = { _row: i + 2 }; CL.COLS.forEach(function (c, j) { o[c] = row[j]; }); if (o.Id) out[String(o.Id)] = o; });
  return out;
}
function clLog_(id, change) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(8000); } catch (e) { return; }
  try {
    var sh = clTab_(), rows = clRows_(), r = rows[String(id)];
    if (!r) return;
    change(r);
    sh.getRange(r._row, 1, 1, CL.COLS.length).setValues([CL.COLS.map(function (c) { return r[c] == null ? '' : r[c]; })]);
  } finally { try { lock.releaseLock(); } catch (e2) {} }
}
function clAdd_(rec) {
  var sh = clTab_();
  sh.appendRow(CL.COLS.map(function (c) { return rec[c] == null ? '' : rec[c]; }));
}

/* ── the e-mail ────────────────────────────────────────────────────────── */

function clMailHtml_(D, link, test) {
  var names = D.spouseFirst ? clEsc_(D.first) + ' and ' + clEsc_(D.spouseFirst) : clEsc_(D.first || 'there');
  var wa = 'https://wa.me/' + CL.WA + '?text=' + encodeURIComponent('Hi Ricky Rampersad Branch, this is ' + (D.first || 'a client') + '. I listened to the plan ' + D.advisorFirst + ' prepared for us.');
  return '<div style="background:#EEF2F5;padding:16px">' +
    (test ? '<div style="max-width:600px;margin:0 auto 10px;background:#FFF7E0;border:1px solid #F2D38A;color:#7A4B00;border-radius:10px;padding:10px 14px;font:13px Arial,sans-serif"><b>TEST</b> · In live mode this goes to the client. The link below opens their real plan.</div>' : '') +
    '<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;font:15px/1.6 -apple-system,\'Segoe UI\',Roboto,Arial,sans-serif;color:#13222F">' +
    '<div style="background:#0B2A40;background:linear-gradient(135deg,#0B2A40,#0E4A5E 60%,#0D7D86);padding:26px 24px 28px;color:#fff">' +
      '<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#9FE3E6;font-weight:800">A first from the Ricky Rampersad Branch</div>' +
      '<div style="font-size:27px;font-weight:800;line-height:1.2;margin-top:12px">' + names + ', Andrew will read you your plan.</div>' +
      '<div style="font-size:15px;color:#CFE9EE;margin-top:8px">About three minutes. Listen on the way home: no need to look at the screen.</div>' +
    '</div>' +
    '<div style="padding:24px">' +
      '<p style="margin:0 0 16px">Hi ' + clEsc_(D.first || 'there') + ',</p>' +
      '<p style="margin:0 0 16px">You have the written summary of the plan we worked out together. Now you can <b>hear it</b>: what you told us, what we noticed, what your family would need, and what I recommend and why, read to you by Andrew.</p>' +
      '<a href="' + link + '" style="display:block;text-align:center;background:#0D7D86;color:#fff;text-decoration:none;font-weight:800;font-size:17px;padding:17px;border-radius:13px">&#9654;&nbsp; Listen to your plan</a>' +
      '<p style="text-align:center;font-size:13px;color:#5B6670;margin:8px 0 20px">Private to you. We may ask for your date of birth before it plays.</p>' +
      '<p style="margin:0 0 16px">When you have heard it, if it is right, tap <b>Yes, that\'s correct</b> in the summary I sent you. If anything is off, or you have a question, just reply, or message the branch.</p>' +
      '<a href="' + wa + '" style="display:inline-block;background:#128C4A;color:#fff;text-decoration:none;font-weight:800;font-size:14px;padding:11px 16px;border-radius:11px">WhatsApp the branch</a>' +
      '<p style="margin:22px 0 0">' + clEsc_(D.advisor) + '<br><span style="color:#5B6670;font-size:13.5px">Ricky Rampersad Branch · Guardian Life of the Caribbean</span></p>' +
    '</div>' +
    '<div style="padding:14px 24px 18px;background:#F6FAFB;border-top:1px solid #E3ECEF;font-size:11.5px;color:#7A8791;line-height:1.5">This plan is based on what you told your advisor and is not a contract; cover starts only when a policy is issued. Sent by support@rickyrampersadbranch.com. Confidential, for the named recipient only. If it reached you in error, please tell us and delete it.</div>' +
    '</div></div>';
}

/* Send the listen e-mail for one case. how: 'live' (to the client) or 'test' (to the branch manager, marked TEST). */
function clSendFor_(d, how) {
  var id = clId_(d); if (!id) return { ok: false, why: 'no id' };
  var D = clPlan_(d);
  if (!D.recs.length) return { ok: false, why: 'no recommendation on the case' };
  var to = how === 'live' ? clEmailOf_(d) : clStr_((typeof MAIL_CONFIG !== 'undefined' && MAIL_CONFIG.branchManager) || Session.getEffectiveUser().getEmail());
  if (!to) return { ok: false, why: 'no e-mail address' };
  if (how === 'live' && typeof rrbCeBouncedAddress_ === 'function') { try { if (rrbCeBouncedAddress_(d)) return { ok: false, why: 'the client address bounced' }; } catch (e) {} }
  var link = CL.PAGE + '/?t=' + clToken_(id);
  var opts = {
    to: to, name: D.advisor + ' · Ricky Rampersad Branch',
    subject: (how === 'test' ? '[TEST] ' : '') + (D.first ? D.first + ', ' : '') + 'Andrew will read you your plan (3 min)',
    htmlBody: clMailHtml_(D, link, how === 'test')
  };
  if (D.advisorEmail && D.advisorEmail.indexOf('@') > 0) opts.replyTo = D.advisorEmail;
  MailApp.sendEmail(opts);
  if (how === 'live') clAdd_({ Id: id, Client: D.first + ' ' + D.surname, Advisor: D.advisor, 'Agent Code': clStr_(d.agentCode), Email: to, 'Sent At': new Date().toISOString(), Mode: 'live', Opens: 0 });
  else { var rows = clRows_(); if (!rows[id]) clAdd_({ Id: id, Client: D.first + ' ' + D.surname, Advisor: D.advisor, 'Agent Code': clStr_(d.agentCode), Email: to, 'Sent At': new Date().toISOString(), Mode: 'test', Opens: 0 }); }
  return { ok: true, to: to, link: link, client: D.first };
}

/* ── the tick: after each draft, the listen e-mail ─────────────────────── */

function clTick() {
  if (clMode_() !== 'live') return;
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (e) { return; }
  try {
    var sheet = ffGetOrCreateRevisedTab_(), headers = ffEnsureHeaders_(sheet), last = sheet.getLastRow();
    if (last < 2) return;
    var maps = _ffSchemaMaps(), at = {};
    headers.forEach(function (h, i) { at[maps.l2k[h] || h] = i; });
    var cSent = at.clientDraftSentAt, cSt = at.status, cConf = at.clientConfirmed;
    if (cSent === undefined) { Logger.log('clTick: no clientDraftSentAt column'); return; }
    var vals = sheet.getRange(2, 1, last - 1, headers.length).getValues();
    var done = clRows_(), now = Date.now(), from = new Date(CL.FROM + 'T00:00:00-04:00').getTime(), sent = 0;
    for (var r = 0; r < vals.length && sent < 20; r++) {
      var when = clDate_(vals[r][cSent]); if (!when) continue;
      var t = when.getTime();
      if (t < from || now - t < CL.WAIT_MIN * 60000 || now - t > CL.LOOK_DAYS * 864e5) continue;
      var st = cSt === undefined ? '' : clStr_(vals[r][cSt]);
      if (/approv|declin|cancel|chang/i.test(st)) continue;
      if (cConf !== undefined && /^(yes|true|ok|confirmed)/i.test(clStr_(vals[r][cConf]))) continue;
      var d = ffReadRow_(sheet, headers, r + 2), id = clId_(d);
      if (!id || done[id]) continue;
      var res = clSendFor_(d, 'live');
      Logger.log('clTick %s: %s', id, res.ok ? 'sent to ' + res.to : res.why);
      if (res.ok) sent++;
      else clAdd_({ Id: id, Client: clStr_(d.fullName), Mode: 'skipped: ' + res.why, 'Sent At': new Date().toISOString() });
    }
  } finally { try { lock.releaseLock(); } catch (e2) {} }
}

/* ── the editor's buttons ──────────────────────────────────────────────── */

/* The newest case with a recommendation, sent to the branch manager as it would reach the client. */
function clTest(id) {
  var sheet = ffGetOrCreateRevisedTab_(), headers = ffEnsureHeaders_(sheet), last = sheet.getLastRow(), d = null;
  if (id) d = clCase_(id);
  for (var r = last; !d && r >= 2 && r > last - 60; r--) {
    var x = ffReadRow_(sheet, headers, r);
    if (clId_(x) && clStr_(x.rec1Rec) && !/declin|cancel/i.test(clStr_(x.status))) d = x;
  }
  if (!d) { Logger.log('No case with a recommendation found.'); return; }
  var res = clSendFor_(d, 'test');
  Logger.log(res.ok ? 'TEST sent to %s for %s. Link: %s' : 'Not sent: %s', res.ok ? res.to : res.why, res.client, res.link);
  Logger.log('Andrew\'s voice: %s', clVoiceReady_() ? 'on (Azure Speech)' : 'NOT SET: the page will use the phone\'s own voice. Run clSetVoice with the key and region.');
}

/* Paste the Azure key and region between the quotes, run, then blank them again (the properties page is read-only). */
function clSetVoice() {
  var KEY = '', REGION = '';
  if (!KEY || !REGION) { Logger.log('Paste the key and the region (for example eastus) between the quotes in clSetVoice, run it, then put them back to \'\'.'); return; }
  clProps_().setProperties({ AZURE_SPEECH_KEY: KEY.trim(), AZURE_SPEECH_REGION: REGION.trim().toLowerCase() }, false);
  Logger.log('Stored. Now put both back to \'\' and save. Then run clVoiceTest.');
}
function clVoiceTest() {
  if (!clVoiceReady_()) { Logger.log('No voice yet: run clSetVoice first.'); return; }
  var id = 'voice-test', k = clKey_(id), tok = clToken_(id);
  var out = clAudio_({ t: tok, k: k, lines: ['Hello. This is Andrew, from the Ricky Rampersad Branch. Your family plan is ready to hear.'] });
  Logger.log(out.ok ? 'Andrew answered: %s seconds of sound.' : 'Not OK: %s', out.ok ? out.secs : (out.error || 'no voice'));
}

function clGoLive() {
  clProps_().setProperty('CL_MODE', 'live');
  ScriptApp.getProjectTriggers().forEach(function (tr) { if (tr.getHandlerFunction() === 'clTick') ScriptApp.deleteTrigger(tr); });
  ScriptApp.newTrigger('clTick').timeBased().everyMinutes(15).create();
  Logger.log('Live. From now on every client gets "Andrew will read you your plan" a few minutes after their draft. Voice: %s', clVoiceReady_() ? 'Andrew' : 'NOT SET (phone voice)');
}
function clStop() {
  clProps_().setProperty('CL_MODE', 'off');
  ScriptApp.getProjectTriggers().forEach(function (tr) { if (tr.getHandlerFunction() === 'clTick') ScriptApp.deleteTrigger(tr); });
  Logger.log('Stopped. No listen e-mails go.');
}
function clCheck() {
  Logger.log('Mode: %s · voice: %s · trigger: %s', clMode_(), clVoiceReady_() ? 'Andrew (Azure)' : 'phone voice (no Azure key)',
    ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'clTick'; }) ? 'every 15 minutes' : 'none');
  var rows = clRows_(), ids = Object.keys(rows);
  Logger.log('%s cases on the Client Listen tab · %s opened · %s heard to the end', ids.length,
    ids.filter(function (i) { return rows[i]['Opened At']; }).length, ids.filter(function (i) { return rows[i]['Finished At']; }).length);
}
