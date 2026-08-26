/**
 * RR Branch — what the client is told they bought, and who is copied on it.
 *
 * Two faults, both in the one email a client actually keeps.
 *
 * ── 1. THE LETTER PRINTS THE RECOMMENDATION, NOT THE DECISION ───────────────
 *
 * rrbClientApprovedHtml_ builds its table with rrbRecTable_(d, true), and
 * rrbRecTable_ reads rec1Rec…rec6Rec — every plan the advisor RECOMMENDED,
 * with every sum assured and every premium, totalled at the foot.
 *
 * The client took one of them.
 *
 * So a client who bought a deferred annuity at $500 a month receives a letter
 * on branch letterhead reading "Total — TT$5.4m of cover for TT$500 a month",
 * approved by a manager, over the advisor's name. It is not a rounding error
 * or a display quirk: it is a written statement of cover the client does not
 * have, sent at the exact moment they are most likely to file it and believe
 * it. The person who finds out it was wrong is whoever calls to claim.
 *
 * The decision is already on the row. dec1Go…dec6Go hold what the client
 * actually said yes to, with dec{i}Amt and dec{i}Prem beside them. Nothing
 * was ever read from them.
 *
 * ── 2. THE BRANCH MANAGER IS CC'D, THE ADVISOR IS NOT ───────────────────────
 *
 * The client's approval email goes out as:
 *
 *     to:  the client
 *     cc:  ricky.rampersad@myguardiangroup.com
 *
 * Which means the client can see the branch manager's address on their own
 * letter, the advisor who wrote the case is not copied at all, and neither is
 * the manager who approved it. Exactly inverted: the one person who should be
 * invisible is the only one showing.
 *
 * ── INSTALL ────────────────────────────────────────────────────────────────
 *
 * Add this file, then make TWO one-line edits. Nothing else changes, and no
 * function here has the same name as anything already in the project.
 *
 *  (a) RRB_Additions.gs — function rrbClientApprovedHtml_(d)
 *      Find:     var rt = rrbRecTable_(d, true);
 *      Replace:  var rt = rrbTookTable_(d);
 *
 *      And directly BELOW the block that prints rt.html — the one guarded by
 *      `if (rt.count) { … }` — add one line:
 *
 *          h += rrbLeftTable_(d);
 *
 *  (b) Code.gs — function ffSendApprovalEmail_(d)
 *      Find the client MailApp.sendEmail block and replace its `to:` and
 *      `cc:` lines with the three from rrbApprovalRecipients_. In full:
 *
 *          var rcp = rrbApprovalRecipients_(d);
 *          if (agreed && rcp.to) {
 *            MailApp.sendEmail({
 *              to:  rcp.to,
 *              cc:  rcp.cc,
 *              bcc: rcp.bcc,
 *              subject: "Your plan has been reviewed and approved",
 *              htmlBody: rrbClientApprovedHtml_(d) + rrbClientRateBlock_(d),
 *              name: d.advisorName || "RR Branch"
 *            });
 *          }
 *
 * Then run rrbLetterCheck() — it reads the sheet, sends nothing, and prints
 * what every approved case WOULD say under the old letter and the new one,
 * side by side, so the difference can be seen before a client sees it.
 */


// ═══════════════════════════════════════════════════════════════════════════
// WHAT THE CLIENT ACTUALLY TOOK
// ═══════════════════════════════════════════════════════════════════════════

/** True where the client said yes to this line. */
function rrbTook_(d, i) {
  return /^y/i.test(_str(d['dec' + i + 'Go']));
}

/** Has anybody recorded a decision on this case at all? */
function rrbHasDecisions_(d) {
  for (var i = 1; i <= 6; i++) if (_str(d['dec' + i + 'Go'])) return true;
  return false;
}

/**
 * The table for the client's approval letter: what they took, and nothing else.
 *
 * Same shape as rrbRecTable_ so it drops straight in — { html, cover, prem,
 * count } — but it reads the DECISION columns. The reason still comes from
 * rec{i}Reason, because the reason the product suits the need does not change
 * when the client accepts it, and that reason is the compliance artefact.
 *
 * Where a case carries no decisions at all — an older row, or one where the
 * advisor never filled that section — it does NOT silently fall back to the
 * full recommendation. It prints the recommendation under an honest heading
 * and withholds the total, because a total is the part that becomes a claim.
 */
function rrbTookTable_(d) {
  var decided = rrbHasDecisions_(d);
  var rows = '', cover = 0, prem = 0, n = 0;

  for (var i = 1; i <= 6; i++) {
    if (decided && !rrbTook_(d, i)) continue;
    var plan = _str(d['dec' + i + 'Plan']) || _str(d['rec' + i + 'Rec']);
    if (!plan) continue;
    n++;

    var amt  = rrbNum_(d['dec' + i + 'Amt'])  || rrbNum_(d['rec' + i + 'Amt']);
    var pr   = rrbNum_(d['dec' + i + 'Prem']) || rrbNum_(d['rec' + i + 'Prem']);
    var need = _str(d['dec' + i + 'Need'])    || _str(d['rec' + i + 'Need']);
    var why  = _str(d['rec' + i + 'Reason'])  || _str(d['dec' + i + 'Reason']);
    cover += amt; prem += pr;

    rows += '<tr><td style="padding:11px 13px;border:1px solid #E2E8F0;background:#fff">' +
      '<div style="font-weight:700;color:#0F766E;font-size:14px">' + rrbEsc_(plan) + '</div>' +
      (need ? '<div style="font-size:12.5px;color:#64748b;margin-top:3px">' + rrbEsc_(need) + '</div>' : '') +
      '<table style="border-collapse:collapse;margin-top:7px"><tr>' +
        (amt ? '<td style="padding-right:22px">' +
          '<div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;' +
            'color:#94A3B8;font-weight:700">Cover</div>' +
          '<div style="font-size:15px;font-weight:800;color:#0F172A">' + rrbMoney_(amt) + '</div></td>' : '') +
        (pr ? '<td><div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;' +
            'color:#94A3B8;font-weight:700">Premium</div>' +
          '<div style="font-size:15px;font-weight:800;color:#0F172A">' + rrbMoney_(pr) + '/mo</div></td>' : '') +
      '</tr></table>' +
      (why ? '<div style="font-size:12.5px;color:#475569;margin-top:8px;padding-top:8px;' +
             'border-top:1px dashed #E2E8F0;line-height:1.55">' +
             '<strong style="color:#0F766E">Why:</strong> ' + rrbEsc_(why) + '</div>' : '') +
      '</td></tr>';
  }

  if (!n) return { html: '', cover: 0, prem: 0, count: 0, decided: decided };

  var html = '<table style="border-collapse:collapse;width:100%;margin-bottom:6px">' + rows + '</table>';

  if (!decided) {
    // No decision on file. Say what this is rather than adding it up.
    html += '<div style="font-size:12.5px;color:#64748b;margin:8px 0 16px;line-height:1.6">' +
      'This is what was recommended to you. Your advisor will confirm which parts you are ' +
      'taking when you meet to sign.</div>';
    return { html: html, cover: 0, prem: 0, count: n, decided: false };
  }

  if (n > 1) {
    html += '<div style="font-size:13px;color:#334155;margin:8px 0 16px">Together &mdash; <strong>' +
      rrbMoney_(cover) + '</strong> of cover' +
      (prem ? ' for <strong>' + rrbMoney_(prem) + ' a month</strong>' : '') + '</div>';
  } else {
    html += '<div style="height:12px"></div>';
  }
  return { html: html, cover: cover, prem: prem, count: n, decided: true };
}

/**
 * What the client chose NOT to take, in their own words.
 *
 * A client who said "not the critical illness, not this year" should see that
 * written down and see that we heard the reason. It is also the record: a
 * declined recommendation with the client's own reason beside it is the
 * evidence that it was offered and refused, rather than never raised — which
 * is the question asked when a family later finds there was no CI cover.
 *
 * Silent when nothing was declined, and silent on a case with no decisions.
 */
function rrbLeftTable_(d) {
  if (!rrbHasDecisions_(d)) return '';
  var items = [];
  for (var i = 1; i <= 6; i++) {
    var go = _str(d['dec' + i + 'Go']);
    if (!go || /^y/i.test(go)) continue;
    var plan = _str(d['dec' + i + 'Plan']) || _str(d['rec' + i + 'Rec']);
    if (!plan) continue;
    items.push({
      plan: plan,
      later: /later/i.test(go),
      need: _str(d['dec' + i + 'Need']) || _str(d['rec' + i + 'Need']),
      why:  _str(d['dec' + i + 'Reason'])
    });
  }
  if (!items.length) return '';

  var h = '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94A3B8;' +
    'font-weight:700;margin:6px 0 7px">What you decided to leave for now</div>' +
    '<div style="border:1px solid #E2E8F0;border-radius:11px;overflow:hidden;background:#fff;' +
    'margin-bottom:16px">';
  items.forEach(function (x, i) {
    h += '<div style="padding:11px 14px;border-top:' + (i ? '1px solid #F1F5F9' : '0') + '">' +
      '<div style="font-size:13.5px;font-weight:700;color:#475569">' + rrbEsc_(x.plan) +
      '<span style="font-weight:600;color:#94A3B8"> &middot; ' +
      (x.later ? 'revisit later' : 'not taking') + '</span></div>' +
      (x.need ? '<div style="font-size:12.5px;color:#94A3B8;margin-top:2px">' +
                rrbEsc_(x.need) + '</div>' : '') +
      (x.why ? '<div style="font-size:12.5px;color:#475569;margin-top:5px;line-height:1.55">' +
               '<strong style="color:#64748B">You said:</strong> ' + rrbEsc_(x.why) + '</div>' : '') +
      '</div>';
  });
  return h + '</div>' +
    '<div style="font-size:12.5px;color:#64748b;line-height:1.6;margin:0 0 16px">' +
    'Nothing here is closed off. If your circumstances change, tell your advisor and they ' +
    'will look at it again with you.</div>';
}


// ═══════════════════════════════════════════════════════════════════════════
// WHO IS COPIED ON THE CLIENT'S LETTER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * To the client. Cc the direct manager and the advisor. Bcc the branch.
 *
 * The advisor is copied because they are the person the client will ring, and
 * they need to know what the client is holding when the phone goes. The direct
 * manager is copied because they approved it and the client seeing their name
 * is the point — the letter says an independent manager checked this, so the
 * manager should be visible on it.
 *
 * The branch manager is BCC. Copying a client's letter to a third address the
 * client did not expect, in a field they can read, is the sort of thing that
 * gets asked about — and the answer, "our branch manager sees everything", is
 * true but is not the client's business on their own correspondence.
 *
 * Sales Support is deliberately not here. They are copied on the advisor's
 * message and on the review, which is where their work is.
 */
function rrbApprovalRecipients_(d) {
  var client = _str(rrbClientEmail_(d));
  var low = function (x) { return _str(x).toLowerCase(); };
  var clientLow = low(client);

  var dmKey = _str(d.directManagerKey) || _str(d.reviewerKey);
  if (!dmKey) {
    try { dmKey = ffLookupDirectManager_(_str(d.agentCode).toUpperCase()); } catch (e) {}
  }
  var dm = _str((MAIL_CONFIG.managers[dmKey] || {}).email) ||
           _str(d.reviewerEmail) || _str(d.mgrEmail);
  var advisor = _str(d.agentEmail);
  var branch  = _str(MAIL_CONFIG.branchManager);

  var seen = {}, cc = [];
  [dm, advisor].forEach(function (a) {
    var k = low(a);
    if (!k || k === clientLow || seen[k]) return;
    seen[k] = 1; cc.push(_str(a));
  });

  // Where the branch manager is already the direct manager — his own directs —
  // he is in the cc and must not also be bcc'd, or he gets it twice.
  var bcc = (branch && low(branch) !== clientLow && !seen[low(branch)]) ? branch : '';

  return { to: client, cc: cc.join(','), bcc: bcc };
}


// ═══════════════════════════════════════════════════════════════════════════
// SEE IT BEFORE A CLIENT DOES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Every approved case on the sheet, with what the old letter says and what the
 * new one says. Reads only. Sends nothing.
 *
 * The lines that differ are the letters already sent that overstate somebody's
 * cover. That count is the reason to do this today rather than Monday.
 */
function rrbLetterCheck() {
  var sheet = ffGetOrCreateRevisedTab_();
  var headers = ffEnsureHeaders_(sheet);
  var last = sheet.getLastRow();
  if (last < 2) { Logger.log('No cases on the sheet.'); return; }

  // Logger.log ignores %-26s padding and prints the format string verbatim —
  // the same trap rrbShowHierarchy hit. Pad before formatting, never in it.
  var pad = function (v, n) {
    var t = String(v == null ? '' : v);
    if (t.length >= n) return t.slice(0, n);
    return t + new Array(n - t.length + 1).join(' ');
  };

  var wrong = 0, right = 0, undecided = 0, checked = 0, overstated = 0;
  Logger.log('=== approved cases: what the client was told they hold ===');
  Logger.log('');

  for (var r = 2; r <= last; r++) {
    var d = ffReadRow_(sheet, headers, r);
    if (!d || !d.submissionId) continue;
    if (_str(d.status).toLowerCase().indexOf('approv') < 0) continue;
    checked++;

    var oldCover = 0, oldPrem = 0, lines = 0;
    for (var i = 1; i <= 6; i++) {
      if (!_str(d['rec' + i + 'Rec'])) continue;
      lines++;
      oldCover += rrbNum_(d['rec' + i + 'Amt']);
      oldPrem  += rrbNum_(d['rec' + i + 'Prem']);
    }
    var t = rrbTookTable_(d);
    var name = pad(_str(d.clientName) || _str(d.adviceClientName) || '(no name)', 24);

    if (!t.decided) {
      undecided++;
      Logger.log('  ~  ' + name + '  no decision recorded — new letter shows no total');
      continue;
    }
    if (Math.round(oldCover) === Math.round(t.cover) &&
        Math.round(oldPrem) === Math.round(t.prem)) {
      right++;
      Logger.log('     ' + name + '  took everything — letter unchanged');
      continue;
    }
    wrong++;
    if (oldCover > t.cover) overstated++;
    Logger.log('  *  ' + name + '  WAS  ' + pad(rrbMoney_(oldCover) || 'no cover', 14) +
               pad((rrbMoney_(oldPrem) || '—') + '/mo', 12) + lines + ' plans');
    Logger.log('     ' + pad('', 24) + '  NOW  ' + pad(rrbMoney_(t.cover) || 'no cover', 14) +
               pad((rrbMoney_(t.prem) || '—') + '/mo', 12) + t.count + ' taken');
  }

  Logger.log('');
  Logger.log(checked + ' approved case(s) checked.');
  Logger.log('  ' + right + ' already correct — the client took everything recommended.');
  Logger.log('  ' + wrong + ' change, of which ' + overstated + ' were OVERSTATED.');
  Logger.log('  ' + undecided + ' carry no decision — the new letter shows no total on those.');
  if (overstated) {
    Logger.log('');
    Logger.log('Those ' + overstated + ' are letters already sitting in somebody\'s inbox, on');
    Logger.log('branch letterhead, naming cover they do not have. Worth a call before');
    Logger.log('anybody else finds out.');
  }
  return { checked: checked, wrong: wrong, overstated: overstated,
           right: right, undecided: undecided };
}

/** Who would be copied on the newest approved case. Reads only, sends nothing. */
function rrbRecipientCheck() {
  var sheet = ffGetOrCreateRevisedTab_();
  var headers = ffEnsureHeaders_(sheet);
  for (var r = sheet.getLastRow(); r >= 2; r--) {
    var d = ffReadRow_(sheet, headers, r);
    if (!d || !d.submissionId) continue;
    if (_str(d.status).toLowerCase().indexOf('approv') < 0) continue;
    var rcp = rrbApprovalRecipients_(d);
    Logger.log('Newest approved case: %s', _str(d.clientName) || '(no name)');
    Logger.log('');
    Logger.log('  WAS   to:  ' + (rcp.to || '(none captured)'));
    Logger.log('        cc:  ' + MAIL_CONFIG.branchManager + '   <- the client can read this');
    Logger.log('');
    Logger.log('  NOW   to:  ' + (rcp.to || '(none captured)'));
    Logger.log('        cc:  ' + (rcp.cc || '(none)'));
    Logger.log('        bcc: ' + (rcp.bcc || '(none — already in the cc)'));
    if (!rcp.to) {
      Logger.log('');
      Logger.log('  No client address on this case. Nothing has ever been sent to them.');
    }
    return rcp;
  }
  Logger.log('No approved cases yet.');
}
