/**
 * RR Branch — the fact find PDF, at approval.
 *
 * WHAT HAPPENED
 *
 * Meera signed off a case and got the approval email with no PDF. So did
 * every other advisor on every other approved case, since the day this went
 * live. It is not a one-off and it is not something she did.
 *
 * ffBuildPdfAttachment_ reads d.pdfBase64, and pdfBase64 arrives in exactly
 * one place: the form's submit POST. Two emails are sent from inside that
 * POST — the manager's review and the agent's own copy — and both attach it
 * correctly.
 *
 * The approval email is not sent from there. ffProcessManagerReview,
 * rrbDecide and rrbQueueDecide all read the case back off the SHEET before
 * calling ffSendApprovalEmail_, and ffBuildSchema() has no pdfBase64 column.
 * The PDF was never stored. By the time a manager signs, it is gone — and
 * ffSendApprovalEmail_ has no attachments key at all, so it would have
 * nothing to attach even if it were still in hand.
 *
 * WHY NOT JUST ADD A COLUMN
 *
 * A Sheets cell holds 50,000 characters. A base64 fact find is several times
 * that. rrbDraftSave already learned this and strips pdfBase64 before
 * writing, with a comment saying so. Storing it in the sheet does not work.
 *
 * So it goes to Drive — into the folder the case already has, the one
 * ffSaveSigs_ creates under "RR Branch FF Signatures" for the signatures.
 * One file beside them, and a URL on the row.
 *
 * ── INSTALL ────────────────────────────────────────────────────────────────
 *
 * Add this file, then THREE small edits.
 *
 *  (a) Code.gs — function ffBuildSchema(), with the other file fields near
 *      the foot, beside _sigFolderUrl:
 *
 *          s.push(["pdfUrl", "Fact Find PDF"]);
 *
 *  (b) Code.gs — function ffProcessAgentSubmit(data), immediately AFTER the
 *      advisor-signature block and BEFORE `var sheet = ffGetOrCreateRevisedTab_();`
 *
 *          // Park the PDF in Drive while we still have it — it is not on the
 *          // sheet and the approval email cannot rebuild it.
 *          try { rrbParkPdf_(data); } catch (err) { Logger.log('PDF park failed: ' + err); }
 *
 *  (c) Code.gs — function ffSendApprovalEmail_(d), inside the `if (d.agentEmail)`
 *      block. Replace the MailApp.sendEmail({...}) call with:
 *
 *          var opts = {
 *            to: d.agentEmail,
 *            cc: ccs.join(","),
 *            subject: agreed
 *              ? "Approved — " + name + ", ready for the client"
 *              : declined
 *              ? "Declined — " + name + " is not going forward"
 *              : "Sent back — " + name + " needs changes before the client sees it",
 *            htmlBody: (agreed ? rrbAgentApprovedHtml_(d)
 *                    : declined ? rrbAgentDeclinedFinalHtml_(d)
 *                    : rrbAgentDeclinedHtml_(d)) + rrbPdfBlock_(d),
 *            name: "RR Branch Fact Find"
 *          };
 *          rrbSendWithPdf_(opts, d);
 *
 * Then run rrbPdfBackfill_() — it finds every approved case with no PDF on
 * file and tells you which ones need the advisor to reprint. It sends nothing.
 */

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
