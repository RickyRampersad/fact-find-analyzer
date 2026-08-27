/**
 * RR BRANCH — everything outstanding, in one paste.
 *
 * Add this ONE file to the Apps Script project, then make the small edits
 * listed under EDITS below. Nothing here collides with a name your script
 * already uses; every function is new.
 *
 * WHAT IT TURNS ON
 *
 *   1. Who viewed the wall.        The wall now asks people to sign in.
 *                                  Without this, it asks and records nothing.
 *   2. The PDF on approval.        Meera got an approval email with no fact
 *                                  find attached. So has every advisor on
 *                                  every approved case since this went live.
 *   3. One 5pm digest, not two.    Two triggers fire at 17:00 every day.
 *
 * ── RUN THESE AFTER PASTING ────────────────────────────────────────────────
 *
 *   rrbStopDuplicateDigest()   removes the second 5pm digest. Run once.
 *   rrbPdfBackfill_()          lists approved cases with no PDF on file.
 *                              Reads only. Everything approved before today
 *                              will be on it and none can be recovered.
 *   rrbWallViewsToday()        who has opened the wall today.
 *
 * ── EDITS ──────────────────────────────────────────────────────────────────
 *
 * These cannot be additive — they are inside functions you already have.
 * Four of them, none longer than a line or two.
 *
 * (A) Code.gs — doGet, with the other else-ifs:
 *
 *       else if (action === "wall_view")    out = rrbWallView(e);
 *       else if (action === "wall_viewers") out = rrbWallViewers(e);
 *
 *     Do NOT add either to cacheableActions. A cached view record would log
 *     one person's visit and serve it back as everybody else's.
 *
 * (B) Code.gs — ffBuildSchema(), near the foot beside _sigFolderUrl:
 *
 *       s.push(["pdfUrl", "Fact Find PDF"]);
 *
 * (C) Code.gs — ffProcessAgentSubmit(data), after the advisor-signature block
 *     and BEFORE `var sheet = ffGetOrCreateRevisedTab_();`
 *
 *       try { rrbParkPdf_(data); } catch (err) { Logger.log('PDF park: ' + err); }
 *
 * (D) Code.gs — ffSendApprovalEmail_(d), inside `if (d.agentEmail)`. Replace
 *     the MailApp.sendEmail({...}) call with:
 *
 *       var opts = {
 *         to: d.agentEmail,
 *         cc: ccs.join(","),
 *         subject: agreed ? "Approved — " + name + ", ready for the client"
 *                : declined ? "Declined — " + name + " is not going forward"
 *                : "Sent back — " + name + " needs changes before the client sees it",
 *         htmlBody: (agreed ? rrbAgentApprovedHtml_(d)
 *                 : declined ? rrbAgentDeclinedFinalHtml_(d)
 *                 : rrbAgentDeclinedHtml_(d)) + rrbPdfBlock_(d),
 *         name: "RR Branch Fact Find"
 *       };
 *       rrbSendWithPdf_(opts, d);
 *
 * ── ONE MORE, AND IT IS FOUR LINES ─────────────────────────────────────────
 *
 * Code.gs — getFFInsights(), the fact-find counting loop reads:
 *
 *       if (s.agent_code === code || (s.agent_email && code === code)) {
 *
 * `code === code` is always true, so every advisor's insight panel shows the
 * WHOLE BRANCH's fact find count, and the "no submissions this year" warning
 * can never fire because a branch total is never zero. Above the loop add:
 *
 *       var wantEmail = '';
 *       try { wantEmail = String((ffLoadRoster_()[code] || {}).email || '').toLowerCase(); }
 *       catch (e) {}
 *
 * and make the test:
 *
 *       if (s.agent_code === code ||
 *           (wantEmail && String(s.agent_email || '').toLowerCase() === wantEmail)) {
 *
 * ── THEN ───────────────────────────────────────────────────────────────────
 *
 * Deploy ▸ Manage deployments ▸ pencil ▸ Version: New version ▸ Deploy.
 * The SAME deployment — a new URL breaks the form, the dashboard and the wall,
 * all of which have it pinned.
 */

/**************************************************************************
 *  FROM RRBranchWallViews.gs
 ***************************************************************************/

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


/**************************************************************************
 *  FROM RRBranchPdfOnApproval.gs
 ***************************************************************************/

var RRB_PDF_FOLDER = 'RR Branch FF Signatures';   // same root ffSaveSigs_ uses
var RRB_PDF_MAX_MB = 22;                          // Gmail's practical ceiling

/**
 * The case's own Drive folder — the same one the signatures go in, found the
 * same way, so a case has ONE folder and not two.
 */
function rrbCaseFolder_(d) {
  var root = ffGetOrCreateFolder_(RRB_PDF_FOLDER);
  var safe = String(d.clientName || d.adviceClientName || 'unknown')
    .replace(/[^a-z0-9]/gi, '_').slice(0, 30) || 'unknown';
  return ffGetOrCreateSubfolder_(root, String(d.submissionId).slice(0, 8) + '_' + safe);
}

/**
 * Writes the submitted PDF into that folder and puts its URL on the payload,
 * so ffWriteRow_ stores it with everything else.
 *
 * Called at SUBMIT, because that is the only moment the PDF exists. Silent
 * and harmless when the form did not send one — an older client, or a
 * download-time log rather than a submission.
 */
function rrbParkPdf_(d) {
  var blob = ffBuildPdfAttachment_(d);
  if (!blob) { Logger.log('rrbParkPdf_: no pdfBase64 on %s', d.submissionId); return ''; }

  var folder = rrbCaseFolder_(d);
  var nm = blob.getName();
  // Replace rather than pile up — a resubmitted case should have one current
  // PDF, not five and no way to tell which the manager signed.
  var old = folder.getFilesByName(nm);
  while (old.hasNext()) old.next().setTrashed(true);

  var f = folder.createFile(blob);
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  d.pdfUrl = f.getUrl();
  Logger.log('rrbParkPdf_: filed %s (%s KB)', nm, Math.round(blob.getBytes().length / 1024));
  return d.pdfUrl;
}

/** The parked PDF as a Gmail attachment, or null. Never throws. */
function rrbPdfFromDrive_(d) {
  var url = _str(d.pdfUrl);
  if (!url) return null;
  var m = url.match(/[-\w]{25,}/);
  if (!m) return null;
  try {
    var f = DriveApp.getFileById(m[0]);
    var blob = f.getBlob();
    if (blob.getBytes().length > RRB_PDF_MAX_MB * 1024 * 1024) {
      Logger.log('rrbPdfFromDrive_: %s is over %s MB — link only', f.getName(), RRB_PDF_MAX_MB);
      return null;
    }
    return blob;
  } catch (e) {
    Logger.log('rrbPdfFromDrive_: could not read %s — %s', url, e && e.message);
    return null;
  }
}

/**
 * Sends with the PDF attached, and falls back to sending without rather than
 * losing the message. An approval that does not arrive is worse than one that
 * arrives without its attachment — the link in the body still reaches it.
 */
function rrbSendWithPdf_(opts, d) {
  var blob = rrbPdfFromDrive_(d);
  if (blob) {
    try { opts.attachments = [blob]; MailApp.sendEmail(opts); return true; }
    catch (e) {
      Logger.log('approval email with attachment failed, retrying without: %s', e);
      delete opts.attachments;
    }
  }
  MailApp.sendEmail(opts);
  return false;
}

/**
 * The block that goes at the foot of the agent's approval email.
 *
 * Says where the signed fact find is whether or not it attached, because a
 * 22MB attachment and a phone on branch wifi do not always agree, and the
 * advisor still has to take it to the client.
 */
function rrbPdfBlock_(d) {
  var url = _str(d.pdfUrl);
  if (url) {
    return '<div style="background:#F0FDFA;border:1.5px solid #0D9488;border-radius:10px;' +
      'padding:13px 16px;margin-top:16px">' +
      '<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;' +
      'color:#0F766E">The signed fact find</div>' +
      '<div style="font-size:13.5px;color:#134E4A;margin-top:4px;line-height:1.55">' +
      'Attached to this email, and filed against the case.</div>' +
      '<div style="margin-top:10px"><a href="' + rrbEsc_(url) + '" ' +
      'style="display:inline-block;background:#0D9488;color:#fff;padding:11px 20px;' +
      'border-radius:8px;text-decoration:none;font-weight:800;font-size:13.5px">' +
      'Open the PDF &rarr;</a></div></div>';
  }
  // No PDF on file — say so plainly rather than leave the advisor hunting.
  return '<div style="background:#FFFBEB;border:1px solid #F59E0B;border-radius:10px;' +
    'padding:13px 16px;margin-top:16px;font-size:13.5px;color:#78350F;line-height:1.6">' +
    '<strong>No PDF is filed against this case.</strong> Open it from your dashboard and use ' +
    '<strong>Print / PDF</strong> to produce the signed copy for your client. Cases submitted ' +
    'from now on carry theirs automatically.</div>';
}

/**
 * Which approved cases have no PDF on file. Reads only, sends nothing.
 *
 * Everything approved before this shipped will be on the list, because the
 * PDF for those was never kept anywhere. Those advisors reprint from the
 * form — the case is complete, so the reprint carries the signatures.
 */
function rrbPdfBackfill_() {
  var sheet = ffGetOrCreateRevisedTab_();
  var headers = ffEnsureHeaders_(sheet);
  var last = sheet.getLastRow();
  if (last < 2) { Logger.log('No cases.'); return; }

  var pad = function (v, n) {
    var t = String(v == null ? '' : v);
    return t.length >= n ? t.slice(0, n) : t + new Array(n - t.length + 1).join(' ');
  };
  var missing = [], have = 0;

  for (var r = 2; r <= last; r++) {
    var d = ffReadRow_(sheet, headers, r);
    if (!d || !d.submissionId) continue;
    if (_str(d.status).toLowerCase().indexOf('approv') < 0) continue;
    if (_str(d.pdfUrl)) { have++; continue; }
    missing.push({ client: _str(d.clientName) || '(no name)',
                   advisor: _str(d.advisorName) || '(advisor)',
                   at: _str(d.approvedAt).slice(0, 10) });
  }

  Logger.log('=== approved cases and their PDFs ===');
  Logger.log('');
  Logger.log('  %s have a PDF filed', have);
  Logger.log('  %s do not', missing.length);
  if (missing.length) {
    Logger.log('');
    Logger.log('  ' + pad('CLIENT', 26) + pad('ADVISOR', 24) + 'APPROVED');
    missing.forEach(function (m) {
      Logger.log('  ' + pad(m.client, 26) + pad(m.advisor, 24) + m.at);
    });
    Logger.log('');
    Logger.log('  Those were approved before the PDF was being kept, so there is nothing');
    Logger.log('  to recover — it only ever existed in the submission POST. Each advisor');
    Logger.log('  opens the case and uses Print / PDF; the case is complete, so the');
    Logger.log('  reprint carries the signatures. Cases from here on file their own.');
  }
  return { have: have, missing: missing.length };
}

/******************************************************************************
 *  ONE 5PM DIGEST, NOT TWO
 ******************************************************************************/

/**
 * Two functions each install a daily 17:00 trigger:
 *
 *   sendDailyFactFindDigest   via setupDailyDigest()   — today/week/MTD by
 *                             unit, the coaching read, and buttons that let a
 *                             manager approve and sign from the email
 *   rrbSendManagerDigest      via rrbSetup()           — on-your-desk,
 *                             recommend-ratio, quiet agents, week vs last
 *
 * Both are wired, both are good, and both land within a minute of each other
 * every evening. Whichever arrives second gets skimmed, and after a fortnight
 * of two a day both do.
 *
 * This removes the second. sendDailyFactFindDigest survives because it is the
 * one that can be acted on from a phone. rrbSendManagerDigest stays callable
 * by hand, and rrbMdPreview() with it — the recommend-ratio read is worth
 * having, it just should not arrive twice.
 *
 * Also delete the four lines under "// 4. Digest trigger" in rrbSetup(), or
 * the next run of rrbSetup() puts it straight back.
 */
function rrbStopDuplicateDigest() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'rrbSendManagerDigest') {
      ScriptApp.deleteTrigger(t); n++;
    }
  });
  Logger.log('%s duplicate 5pm trigger(s) removed.', n);

  var left = ScriptApp.getProjectTriggers().filter(function (t) {
    return /digest/i.test(t.getHandlerFunction());
  }).map(function (t) { return t.getHandlerFunction(); });
  Logger.log('Digest triggers still installed: %s', left.length ? left.join(', ') : 'none');
  if (left.length > 1) {
    Logger.log('More than one remains — run this again, or check setupDailyDigest().');
  }
  Logger.log('');
  Logger.log('Now delete the four lines under "// 4. Digest trigger" in rrbSetup(),');
  Logger.log('or the next rrbSetup() will reinstall it.');
  return { removed: n, remaining: left };
}
