/**
 * ApprovalEmailBody.gs — what the client is told was approved.
 *
 * WHY THIS EXISTS
 * The approval email listed every recommendation on the fact find under one
 * heading — "WHAT HAS BEEN APPROVED FOR YOU" — and closed with a total:
 *
 *     Total — TT$5,421,073 of cover for TT$500 a month
 *
 * On that case the client took one thing: a pension at TT$500 a month. The
 * other five rows had no premium because she is not buying them. So a letter
 * saying her plan had been independently reviewed and approved told her she
 * had five point four million dollars of cover for five hundred dollars a
 * month. She does not.
 *
 * The form already knows the difference. Every recommendation carries the
 * client's own answer in dec{i}Go. The email was not reading it.
 *
 * So: what she is taking, on its own, at the top, with its own honest total.
 * What was discussed and not taken, clearly marked as not arranged. What a
 * future review would look at, last.
 *
 * ── INSTALLING ────────────────────────────────────────────────────────────
 * 1. Apps Script editor ▸ + ▸ Script ▸ name it ApprovalEmailBody, paste in.
 * 2. Where the approval email body is built, replace the block that lists the
 *    recommendations with:
 *
 *      var plans = approvalPlanSections_(row);
 *
 *    and drop plans.html into the message. plans.taken and plans.notTaken are
 *    there if you would rather lay it out yourself.
 * 3. Run approvalSelfTest_() and read the log. It sends nothing.
 */

/* ── reading one recommendation row ────────────────────────────────────── */

function apGet_(row, key) {
  var v = row ? row[key] : '';
  return String(v == null ? '' : v).trim();
}

function apMoney_(v) {
  var n = Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, ''));
  return isFinite(n) && n ? 'TT$' + Math.round(n).toLocaleString('en-US') : '';
}

function apNum_(v) {
  var n = Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, ''));
  return isFinite(n) ? n : 0;
}

function apEsc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Split the six recommendation rows by what the client actually decided.
 *
 * dec{i}Go is the client's own answer. A row they said yes to is a plan being
 * arranged. Anything else was discussed and is not being bought, whatever the
 * advisor recommended — and it does not belong under a heading with the word
 * "approved" on it.
 */
function approvalSplitPlans_(row) {
  var taken = [], notTaken = [];

  for (var i = 1; i <= 6; i++) {
    var plan = apGet_(row, 'rec' + i + 'Rec');
    var need = apGet_(row, 'rec' + i + 'Need');
    var amt  = apNum_(apGet_(row, 'rec' + i + 'Amt'));
    var prem = apNum_(apGet_(row, 'rec' + i + 'Prem'));
    if (!plan && !amt && !prem) continue;

    // The advisor's own words, not a product blurb. dec{i}Reason is what they
    // wrote against the decision; rec{i}Reason against the recommendation.
    // Whichever exists is the compliance artefact and is what the client
    // should read — a canned description of the product is not a reason.
    var why = apGet_(row, 'dec' + i + 'Reason') || apGet_(row, 'rec' + i + 'Reason');

    var entry = { plan: plan, need: need, amount: amt, premium: prem, why: why };

    if (/^yes$/i.test(apGet_(row, 'dec' + i + 'Go'))) taken.push(entry);
    else notTaken.push(entry);
  }
  return { taken: taken, notTaken: notTaken };
}

/* ── leading with the need that was actually answered ──────────────────── */

/**
 * Which kind of need a recommendation row is answering.
 *
 * Read off the need the advisor chose on the row, not the product name — the
 * same product can answer more than one need, and the need is what the client
 * recognises.
 */
function approvalNeedKind_(needText) {
  var s = String(needText || '').toLowerCase();
  if (/retire|pension|annuit/.test(s))              return 'retirement';
  if (/disab|income protect/.test(s))               return 'income';
  if (/critical|illness/.test(s))                   return 'illness';
  if (/health|medical/.test(s))                     return 'health';
  if (/education|university|school/.test(s))        return 'education';
  if (/debt|mortgage|loan/.test(s))                 return 'debt';
  if (/life|expense|estate|breadwinner|replace/.test(s)) return 'life';
  return 'other';
}

/**
 * The "what we found" lines, led by the one the client is actually doing
 * something about.
 *
 * Shivanna took a pension. Her letter opened by telling her that her family
 * would be short TT$919,000 if she died tomorrow — a true and serious figure,
 * and nothing to do with the plan she bought. Leading with it makes the letter
 * read as though the life shortfall is what she has just dealt with.
 *
 * So the finding matching the need she answered goes first, marked as the one
 * being addressed. The rest stay, moved down and framed as what a later review
 * would look at. Nothing is hidden; the order stops it misleading.
 */
function approvalFindings_(row, takenKinds) {
  var f = [];
  var add = function (kind, text) { if (text) f.push({ kind: kind, text: text }); };

  var lifeGap  = apNum_(apGet_(row, 'insuranceNeed_calc')) || apNum_(apGet_(row, 'totalNeed_calc'));
  var debts    = apNum_(apGet_(row, 'totalDebts_calc'));
  var retire   = apNum_(apGet_(row, 'retirementGap'));

  if (retire)  add('retirement', 'To retire on the income you described, you would need about ' +
                    apMoney_(retire) + ' put aside by then.');
  if (lifeGap) add('life', 'If something happened to you tomorrow, your family would be short by about ' +
                    apMoney_(lifeGap) + ' of what they would need.');
  if (debts)   add('debt', 'You have ' + apMoney_(debts) +
                    ' of borrowing that would not simply disappear.');

  var answered = [], later = [];
  f.forEach(function (item) {
    if (takenKinds.indexOf(item.kind) > -1) answered.push(item);
    else later.push(item);
  });
  return { answered: answered, later: later };
}

/* ── the html ──────────────────────────────────────────────────────────── */

function approvalPlanSections_(row) {
  var split = approvalSplitPlans_(row);
  var taken = split.taken, notTaken = split.notTaken;
  var h = [];

  // What the client is actually doing something about decides what this
  // letter opens with.
  var kinds = [];
  taken.forEach(function (p) {
    var k = approvalNeedKind_(p.need || p.plan);
    if (kinds.indexOf(k) < 0) kinds.push(k);
  });
  var found = approvalFindings_(row, kinds);

  if (found.answered.length) {
    h.push('<h3 style="font:700 13px/1.4 Arial,sans-serif;letter-spacing:.08em;' +
           'text-transform:uppercase;color:#0F766E;margin:22px 0 8px">' +
           'What this is for</h3>');
    found.answered.forEach(function (item) {
      h.push('<p style="font:400 15px/1.6 Arial,sans-serif;color:#0F172A;margin:0 0 8px">' +
             apEsc_(item.text) + '</p>');
    });
  }

  /* ---- what is actually being arranged ---- */
  if (taken.length) {
    h.push('<h3 style="font:700 13px/1.4 Arial,sans-serif;letter-spacing:.08em;' +
           'text-transform:uppercase;color:#0F766E;margin:26px 0 10px">' +
           (taken.length === 1 ? 'The plan you are taking' : 'The plans you are taking') +
           '</h3>');

    taken.forEach(function (p) {
      h.push('<div style="border:1px solid #DDE3EC;border-left:4px solid #0D9488;' +
             'border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:10px">' +
             '<div style="font:700 16px Arial,sans-serif;color:#0F766E">' + apEsc_(p.plan) + '</div>' +
             (p.need ? '<div style="font:400 13px Arial,sans-serif;color:#697489;margin-top:2px">' +
                       apEsc_(p.need) + '</div>' : '') +
             '<div style="font:400 14px Arial,sans-serif;color:#0F172A;margin-top:9px">' +
             '<b>Cover</b> ' + (apMoney_(p.amount) || '—') +
             ' &nbsp;·&nbsp; <b>Premium</b> ' + (apMoney_(p.premium) ? apMoney_(p.premium) + ' a month' : '—') +
             '</div>' +
             (p.why ? '<div style="font:400 14px/1.55 Arial,sans-serif;color:#3F4A5C;margin-top:9px">' +
                      apEsc_(p.why) + '</div>' : '') +
             '</div>');
    });

    // The total covers only what is being arranged. Adding cover the client is
    // not buying to a premium they are paying is how "TT$5.4m for TT$500 a
    // month" ends up in a letter that says it was independently approved.
    var totalCover = 0, totalPrem = 0;
    taken.forEach(function (p) { totalCover += p.amount; totalPrem += p.premium; });
    if (totalCover || totalPrem) {
      h.push('<div style="font:700 15px Arial,sans-serif;color:#0F172A;margin:4px 0 6px">' +
             (totalCover ? apMoney_(totalCover) + ' of cover' : '') +
             (totalCover && totalPrem ? ' for ' : '') +
             (totalPrem ? apMoney_(totalPrem) + ' a month' : '') +
             '</div>');
    }
  } else {
    h.push('<h3 style="font:700 13px/1.4 Arial,sans-serif;letter-spacing:.08em;' +
           'text-transform:uppercase;color:#0F766E;margin:26px 0 10px">Where this stands</h3>' +
           '<p style="font:400 15px/1.6 Arial,sans-serif;color:#3F4A5C;margin:0 0 10px">' +
           'Nothing has been arranged yet. Your advisor will go through the options with ' +
           'you and nothing goes ahead until you decide.</p>');
  }

  /* ---- discussed, not taken ---- */
  if (notTaken.length) {
    h.push('<h3 style="font:700 13px/1.4 Arial,sans-serif;letter-spacing:.08em;' +
           'text-transform:uppercase;color:#697489;margin:26px 0 8px">' +
           'Also discussed &mdash; not part of this</h3>' +
           '<p style="font:400 14px/1.6 Arial,sans-serif;color:#697489;margin:0 0 12px">' +
           'These came up in your conversation. You have not taken them and nothing ' +
           'has been arranged. They are here so you have the whole picture.</p>');

    notTaken.forEach(function (p) {
      h.push('<div style="border:1px solid #DDE3EC;border-radius:8px;padding:12px 14px;' +
             'margin-bottom:8px;background:#F8FAFC">' +
             '<div style="font:700 15px Arial,sans-serif;color:#3F4A5C">' + apEsc_(p.plan) + '</div>' +
             (p.need ? '<div style="font:400 13px Arial,sans-serif;color:#697489;margin-top:2px">' +
                       apEsc_(p.need) + '</div>' : '') +
             (p.amount ? '<div style="font:400 13.5px Arial,sans-serif;color:#697489;margin-top:6px">' +
                         'Would have covered ' + apMoney_(p.amount) + '</div>' : '') +
             '</div>');
    });
  }

  /* ---- the findings this plan does not answer ---- */
  if (found.later.length) {
    h.push('<h3 style="font:700 13px/1.4 Arial,sans-serif;letter-spacing:.08em;' +
           'text-transform:uppercase;color:#697489;margin:26px 0 8px">' +
           'Worth looking at another time</h3>' +
           '<p style="font:400 14px/1.6 Arial,sans-serif;color:#697489;margin:0 0 10px">' +
           'These are not part of what has been arranged. They are things a full ' +
           'review would normally come back to.</p>');
    found.later.forEach(function (item) {
      h.push('<p style="font:400 14px/1.6 Arial,sans-serif;color:#697489;margin:0 0 7px">' +
             apEsc_(item.text) + '</p>');
    });
  }

  return { html: h.join('\n'), taken: taken, notTaken: notTaken, findings: found };
}

/* ── self test ─────────────────────────────────────────────────────────── */

/** Shivanna's case, as the email actually sent it. Sends nothing. */
function approvalSelfTest_() {
  var row = {
    rec1Rec: 'Liberator — Life Evolution w/ Investor (Saver)',
    rec1Need: 'Income Replacement (Breadwinner) — Life',
    rec1Amt: 919000, rec1Prem: '', dec1Go: 'no',
    rec2Rec: 'Praesidia (Personal Accident)',
    rec2Need: 'Income Protection / Disability',
    rec2Amt: 153000, rec2Prem: '', dec2Go: 'no',
    rec3Rec: 'Rejuvenator Plus (Critical Illness)',
    rec3Need: 'Critical Illness',
    rec3Amt: 919000, rec3Prem: '', dec3Go: 'no',
    rec4Rec: 'Life Secure (Registered Annuity / Pension)',
    rec4Need: 'Retirement / Pension (registered)',
    rec4Amt: 2980073, rec4Prem: 500, dec4Go: 'yes',
    dec4Reason: 'Shivanna wants a guaranteed income in retirement and can commit ' +
                'TT$500 a month now. Starting at her age is what makes the target reachable.',
    rec5Rec: 'Provisor', rec5Need: 'Health / Medical Expenses',
    rec5Amt: 250000, rec5Prem: '', dec5Go: 'no',
    rec6Rec: 'Econolife 65 (Whole Life)',
    rec6Need: 'Final Expenses / Estate Creation — Life',
    rec6Amt: 200000, rec6Prem: '', dec6Go: 'no'
  };

  var r = approvalPlanSections_(row);
  Logger.log('taken: %s   not taken: %s', r.taken.length, r.notTaken.length);
  r.taken.forEach(function (p) {
    Logger.log('  TAKING   %s — cover %s, premium %s', p.plan, apMoney_(p.amount), apMoney_(p.premium));
  });
  r.notTaken.forEach(function (p) {
    Logger.log('  not taken  %s', p.plan);
  });

  var tc = 0, tp = 0;
  r.taken.forEach(function (p) { tc += p.amount; tp += p.premium; });
  Logger.log('total shown to the client: %s of cover for %s a month',
    apMoney_(tc), apMoney_(tp));
  Logger.log('the old email said: TT$5,421,073 of cover for TT$500 a month');
}
