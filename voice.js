/* ─────────────────────────────────────────────────────────────────────────────
   VOICE INTERVIEW for the fact find (2 November 2026).

   Asked for by Ricky Rampersad after a fact-finding interview: "how I talk to
   Claude … ask me the questions and I repeat the answers", for agents to use.

   The page asks each question aloud, listens for the answer, puts it in the
   field the way typing would (the field's own input and change events, so
   calc(), the progress bar and the auto-save all run), says back what it
   filled, and moves on. It opens each section and scrolls to the field, so
   the agent sees every answer land.

   - Only blank fields are asked, unless "Ask everything" is ticked.
   - Commands at any time: "repeat", "skip" or "next", "back", "pause",
     "stop". "I don't know" or "not sure" skips the question.
   - An answer it cannot read (a date, an amount, a choice) is asked once
     more, then left blank and listed under "Left for you".
   - Spouse, children, existing policies, goals and medical history are asked
     only when they apply.
   - Recommendations and the client's decision are never filled by voice:
     they are the advisor's judgement and the client's signature.

   Nothing is recorded or kept by the branch. The browser's own speech
   service turns speech into text (Google in Chrome, Apple on an iPhone),
   which the panel says. Where the browser has no speech recognition, the
   panel still asks aloud and the agent types, or uses the keyboard's own
   microphone.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.RRB_VOICE) return;
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var TTS = window.speechSynthesis;

  /* ── State shared with the page ─────────────────────────────────────────── */
  function S() { try { return (typeof state !== 'undefined' && state) ? state : {}; } catch (e) { return {}; } }
  function mode() { try { return (typeof MODE !== 'undefined') ? MODE : 'agent'; } catch (e) { return 'agent'; } }
  function val(k) { var v = S()[k]; return v == null ? '' : String(v).trim(); }

  function fieldEl(k) {
    return document.querySelector('[data-field="' + k + '"]') ||
           document.querySelector('input[type="radio"][name="' + k + '"]');
  }
  function radios(k, el) {
    var name = (el && el.name) || k;
    return Array.prototype.slice.call(document.querySelectorAll('input[type="radio"][name="' + name + '"]'));
  }
  function optsOf(k) {
    var el = fieldEl(k); if (!el) return [];
    if (el.tagName === 'SELECT') {
      return Array.prototype.slice.call(el.options)
        .filter(function (o) { return o.value && !/^__/.test(o.value); })
        .map(function (o) { return { v: o.value, t: (o.textContent || o.value).trim() }; });
    }
    if (el.type === 'radio') {
      return radios(k, el).map(function (r) {
        var w = r.closest('label,.radio,.check,.radio-block');
        return { v: r.value, t: ((w && w.textContent) || r.value).replace(/\s+/g, ' ').trim() };
      });
    }
    return [];
  }
  function setVal(k, v) {
    var el = fieldEl(k); if (!el) return false;
    openFor(el);
    if (el.type === 'radio') {
      var r = radios(k, el).filter(function (x) { return x.value === v; })[0];
      if (!r) return false;
      r.checked = true;
      r.dispatchEvent(new Event('input', { bubbles: true }));
      r.dispatchEvent(new Event('change', { bubbles: true }));
      try { r.click(); } catch (e) {}
    } else {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    flash(el);
    return true;
  }
  function openFor(el) {
    var sec = el.closest('[data-section]');
    if (sec && !sec.classList.contains('open')) {
      sec.classList.add('open');
      var h = sec.querySelector('.section-header'); if (h) h.setAttribute('aria-expanded', 'true');
    }
  }
  function flash(el) {
    var t = (el.type === 'radio' ? (el.closest('.radio-group,.radio,.field') || el) : el);
    try { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    t.classList.add('rrbv-flash');
    setTimeout(function () { t.classList.remove('rrbv-flash'); }, 1600);
  }

  /* ── Reading what was said ──────────────────────────────────────────────── */
  var UNITS = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
    eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
    eighty: 80, ninety: 90, a: 1, an: 1 };
  function wordsToNumber(t) {
    var total = 0, cur = 0, seen = false;
    t.split(/[\s-]+/).forEach(function (w) {
      if (UNITS.hasOwnProperty(w)) { cur += UNITS[w]; seen = true; }
      else if (w === 'hundred') { cur = (cur || 1) * 100; seen = true; }
      else if (w === 'thousand' || w === 'k') { total += (cur || 1) * 1000; cur = 0; seen = true; }
      else if (w === 'million') { total += (cur || 1) * 1e6; cur = 0; seen = true; }
    });
    return seen ? total + cur : null;
  }
  function parseNumber(text) {
    var t = String(text).toLowerCase()
      .replace(/\bhalf (a )?million\b/g, '500000').replace(/\bquarter (of a )?million\b/g, '250000')
      .replace(/\bhalf (a )?thousand\b/g, '500')
      .replace(/tt\$|us\$|\$|dollars?|per month|a month|monthly|a year|per year/g, ' ')
      .replace(/(\d),(?=\d{3})/g, '$1').replace(/\band\b/g, ' ').trim();
    var m = t.match(/(-?\d+(?:\.\d+)?)\s*(k|thousand|m|million|mil)?\b/);
    if (m) {
      var n = parseFloat(m[1]), u = m[2] || '';
      if (u === 'k' || u === 'thousand') n *= 1000;
      if (u === 'm' || u === 'million' || u === 'mil') n *= 1e6;
      return Math.round(n * 100) / 100;
    }
    return wordsToNumber(t);
  }
  var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
                'november', 'december'];
  function monthOf(w) {
    w = String(w || '').toLowerCase().slice(0, 3);
    for (var i = 0; i < 12; i++) if (MONTHS[i].slice(0, 3) === w) return i + 1;
    return 0;
  }
  function ymd(y, m, d) {
    y = +y; m = +m; d = +d;
    if (y < 100) y += (y > 30 ? 1900 : 2000);
    var dt = new Date(y, m - 1, d);
    if (!y || !m || !d || dt.getMonth() !== m - 1 || dt.getDate() !== d) return '';
    return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
  }
  function parseDate(text) {
    var t = String(text).toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/,/g, ' ').replace(/\s+/g, ' ');
    var m;
    if ((m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) return ymd(m[1], m[2], m[3]);
    if ((m = t.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/))) return ymd(m[3], m[2], m[1]);   // D/M/Y, as in T&T
    if ((m = t.match(/(\d{1,2}) (?:of )?([a-z]+) (\d{2,4})/)) && monthOf(m[2])) return ymd(m[3], monthOf(m[2]), m[1]);
    if ((m = t.match(/([a-z]+) (\d{1,2}) (\d{2,4})/)) && monthOf(m[1])) return ymd(m[3], monthOf(m[1]), m[2]);
    return '';
  }
  function parseEmail(text) {
    var t = String(text).toLowerCase().replace(/\s+at\s+/g, '@').replace(/\s+dot\s+/g, '.')
      .replace(/\s+underscore\s+/g, '_').replace(/\s+(dash|hyphen)\s+/g, '-').replace(/\s+/g, '');
    return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(t) ? t : '';
  }
  function parsePhone(text) {
    var d = String(text).replace(/\D/g, '');
    if (d.length < 7) return '';
    if (d.length === 7) return d.slice(0, 3) + '-' + d.slice(3);
    if (d.length === 10 && d.slice(0, 3) === '868') return '(868) ' + d.slice(3, 6) + '-' + d.slice(6);
    return d;
  }
  function titleCase(t) {
    return String(t).trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s'\-])([a-z])/g, function (a, p, c) { return p + c.toUpperCase(); });
  }
  function sentence(t) { t = String(t).trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
  var YES = /^(yes|yeah|yep|yup|correct|sure|right|true|affirmative|he does|she does|they do|has|have|uh huh)\b/;
  var NO = /^(no|nope|nah|none|not really|negative|he doesn'?t|she doesn'?t|they don'?t|doesn'?t|don'?t|never)\b/;
  function parseYesNo(text) {
    var t = String(text).toLowerCase().trim();
    if (YES.test(t)) return 'Yes';
    if (NO.test(t)) return 'No';
    return '';
  }
  var SYN = {
    'married': ['married', 'wife', 'husband'], 'common-law': ['common law', 'living together', 'partner'],
    'single': ['single', 'not married'], 'divorced': ['divorced'], 'widowed': ['widow', 'widower', 'widowed'],
    'separated': ['separated'], 'f': ['female', 'girl', 'woman', 'daughter', 'she'], 'm': ['male', 'boy', 'man', 'son', 'he'],
    'full-time': ['full time', 'full-time', 'permanent'], 'part-time': ['part time', 'part-time'],
    'self-employed': ['self employed', 'self-employed', 'own business', 'works for himself', 'works for herself'],
    'not employed': ['not employed', 'unemployed', 'not working', 'home'],
    'y': ['yes', 'insured', 'covered'], 'n': ['no', 'not insured', 'not covered'],
    'k': ['keep', 'keeping'], 's': ['sell', 'selling'],
    'monthly': ['month', 'monthly'], 'quarterly': ['quarter', 'quarterly'], 'semi-annual': ['half year', 'semi', 'twice a year'],
    'annual': ['year', 'annual', 'yearly'], 'at soonest': ['soonest', 'now', 'right away', 'immediately', 'asap'],
    '0–3 yrs': ['one year', 'two years', 'three years', '0 to 3', 'zero to three', 'next few years'],
    '3–5 yrs': ['four years', 'five years', '3 to 5', 'three to five'], '6+ yrs': ['six', 'ten years', 'long term', 'more than five'],
    'guardian life': ['guardian'], 'pan-american (palig)': ['pan american', 'palig'], 'colonial fire (clico)': ['clico', 'colonial'],
    'tatil life': ['tatil'], 'none': ['none', 'nothing']
  };
  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9+ ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function matchChoice(text, opts) {
    var t = norm(text); if (!t || !opts.length) return null;
    var best = null, bestScore = 0;
    opts.forEach(function (o) {
      var nv = norm(o.v), nt = norm(o.t), score = 0;
      if (t === nv || t === nt) score = 100;
      else if (nt && (t.indexOf(nt) > -1)) score = 80 + nt.length / 100;
      else if (nt.length > 3 && nt.indexOf(t) > -1 && t.length > 3) score = 70;
      (SYN[o.v.toLowerCase()] || SYN[nt] || []).forEach(function (w) { if ((' ' + t + ' ').indexOf(' ' + w + ' ') > -1) score = Math.max(score, 75 + w.length / 100); });
      if (!score) {
        var tw = t.split(' ').filter(function (w) { return w.length > 3; });
        var hit = tw.filter(function (w) { return nt.indexOf(w) > -1; }).length;
        if (hit) score = 40 + hit * 5;
      }
      if (score > bestScore) { bestScore = score; best = o; }
    });
    return bestScore >= 45 ? best : null;
  }
  function money(n) { return 'TT$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function sayDate(iso) {
    var p = iso.split('-'); return (+p[2]) + ' ' + MONTHS[+p[1] - 1].replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' + p[0];
  }

  /* ── The interview ──────────────────────────────────────────────────────── */
  var MEM = { kids: null, moreIns: {}, moreGoal: {}, hasIns: null };
  /* On the practice copy every line is said in fixed words (no names, no figures read back), so each one is a
     recording of Andrew (andrew.js, voice/andrew/). The figures still show on the panel as they are filled. */
  function plain() { return !!(window.RRB_SPEECH && window.RRB_SPEECH.plain); }
  function first() { var n = val('fullName') || val('clientName'); return (n && !plain()) ? n.split(' ')[0] : 'the client'; }
  function partnered() { return /married|common/i.test(val('maritalStatus')); }
  function kidsKnown() { var n = 0; for (var i = 1; i <= 3; i++) if (val('child' + i + 'Name')) n = i; return n; }

  function Q(sec, k, t, q, more) { var o = { sec: sec, k: k, t: t, q: q }; for (var x in more) o[x] = more[x]; return o; }
  function steps() {
    var L = [];
    var f = first;
    L.push(Q('About the client', 'fullName', 'name', function () { return 'What is the client’s full name?'; }));
    L.push(Q('About the client', 'dob', 'date', function () { return 'What is ' + f() + '’s date of birth?'; }));
    L.push(Q('About the client', 'maritalStatus', 'choice', function () { return 'Is ' + f() + ' single, married, common-law, divorced, separated or widowed?'; }));
    L.push(Q('About the client', 'phone', 'phone', function () { return 'What is the best phone number?'; }));
    L.push(Q('About the client', 'email', 'email', function () { return 'And the email address? Say it like "john dot smith at gmail dot com".'; }));
    // One question: the form's town box adds the town onto the address line itself.
    L.push(Q('About the client', 'address', 'text', function () { return 'What is the home address, with the town?'; }));
    L.push(Q('Work and income', 'empStatus', 'choice', function () { return 'Is ' + f() + ' full-time, part-time, self-employed, or other?'; }));
    L.push(Q('Work and income', 'occupation', 'text', function () { return 'What does ' + f() + ' do for a living?'; }));
    L.push(Q('Work and income', 'employer', 'name', function () { return 'Who is the employer?'; }, { when: function () { return !/self/i.test(val('empStatus')); } }));
    L.push(Q('Work and income', 'tenure', 'text', function () { return 'How long has ' + f() + ' been there?'; }));
    L.push(Q('Work and income', 'monthlyIncome', 'money', function () { return 'What is ' + f() + '’s gross monthly income?'; }));
    L.push(Q('Work and income', 'ownsBusiness', 'yesno', function () { return 'Does ' + f() + ' own a business?'; }));
    L.push(Q('Work and income', 'bizOwnPct', 'number', function () { return 'What percentage of the business does ' + f() + ' own?'; }, { when: function () { return val('ownsBusiness') === 'Yes'; } }));
    L.push(Q('Work and income', 'bizRevenue', 'money', function () { return 'Roughly what does the business turn over in a year?'; }, { when: function () { return val('ownsBusiness') === 'Yes'; } }));

    var sp = function () { return partnered(); };
    L.push(Q('Spouse or partner', 'spouseName', 'name', function () { return 'What is the spouse’s full name?'; }, { when: sp }));
    L.push(Q('Spouse or partner', 'spouseDob', 'date', function () { return 'And the spouse’s date of birth?'; }, { when: sp }));
    L.push(Q('Spouse or partner', 'spouseGender', 'choice', function () { return 'Is the spouse male or female?'; }, { when: sp }));
    L.push(Q('Spouse or partner', 'spouseEmpStatus', 'choice', function () { return 'Is the spouse full-time, part-time, self-employed, or not employed?'; }, { when: sp }));
    L.push(Q('Spouse or partner', 'spouseOccupation', 'text', function () { return 'What does the spouse do?'; }, { when: function () { return sp() && !/not/i.test(val('spouseEmpStatus')); } }));
    L.push(Q('Spouse or partner', 'spouseMonthlyIncome', 'money', function () { return 'And the spouse’s monthly income?'; }, { when: function () { return sp() && !/not/i.test(val('spouseEmpStatus')); } }));

    L.push(Q('Children', '#kids', 'count', function () { return 'How many children does ' + f() + ' have? Say none if there are none.'; },
      { when: function () { return MEM.kids === null && !kidsKnown(); }, set: function (n) { MEM.kids = Math.min(3, n); } }));
    [1, 2, 3].forEach(function (i) {
      var on = function () { return (MEM.kids || kidsKnown()) >= i; };
      var ord = ['', 'first', 'second', 'third'][i];
      L.push(Q('Children', 'child' + i + 'Name', 'name', function () { return 'What is the ' + ord + ' child’s name?'; }, { when: on }));
      L.push(Q('Children', 'child' + i + 'Dob', 'date', function () { return 'And ' + ((!plain() && val('child' + i + 'Name').split(' ')[0]) || 'the child') + '’s date of birth?'; }, { when: on }));
      L.push(Q('Children', 'child' + i + 'Gender', 'choice', function () { return 'Boy or girl?'; }, { when: on }));
    });

    L.push(Q('Existing cover', '#hasIns', 'yesno', function () { return 'Does ' + f() + ' have any life or critical illness insurance today, with any company, including group cover at work?'; },
      { when: function () { return MEM.hasIns === null && !val('ins1Co'); }, set: function (v) { MEM.hasIns = v === 'Yes'; } }));
    [1, 2, 3, 4].forEach(function (i) {
      var on = function () { return !!val('ins' + i + 'Co') || (i === 1 ? MEM.hasIns === true : MEM.moreIns[i - 1] === true); };
      L.push(Q('Existing cover', 'ins' + i + 'Co', 'choice', function () { return (i === 1 ? 'Which company is the policy with?' : 'Which company is the next policy with?'); }, { when: on }));
      L.push(Q('Existing cover', 'ins' + i + 'Owner', 'choice', function () { return 'Whose life is it on: the client, the spouse, joint, or a child?'; }, { when: on }));
      L.push(Q('Existing cover', 'ins' + i + 'Type', 'text', function () { return 'What kind of policy is it? For example term, whole life, group life or critical illness.'; }, { when: on }));
      L.push(Q('Existing cover', 'ins' + i + 'Sum', 'money', function () { return 'How much is the cover?'; }, { when: on }));
      L.push(Q('Existing cover', 'ins' + i + 'Prem', 'money', function () { return 'What is the premium? Say zero if the employer pays.'; }, { when: on }));
      L.push(Q('Existing cover', 'ins' + i + 'Mode', 'choice', function () { return 'Is that paid monthly, quarterly, half-yearly or yearly?'; }, { when: function () { return on() && stripNum(val('ins' + i + 'Prem')) > 0; } }));
      L.push(Q('Existing cover', 'ins' + i + 'Status', 'choice', function () { return 'Is it active, lapsed, paid-up or surrendered?'; }, { when: on }));
      if (i < 4) L.push(Q('Existing cover', '#moreIns' + i, 'yesno', function () { return 'Is there another policy?'; },
        { when: function () { return on() && MEM.moreIns[i] === undefined && !val('ins' + (i + 1) + 'Co'); }, set: function (v) { MEM.moreIns[i] = v === 'Yes'; } }));
    });

    L.push(Q('Budget', 'monthlyExpenses', 'money', function () { return 'What are the household’s total monthly expenses?'; }));
    L.push(Q('Budget', 'futureFactors', 'yesno', function () { return 'Is anything in the next twelve months likely to change the income or expenses a lot?'; }));
    L.push(Q('Budget', 'futureFactorsRemarks', 'text', function () { return 'What is it?'; }, { when: function () { return val('futureFactors') === 'Yes'; } }));
    L.push(Q('Budget', 'budgetAnnual', 'money', function () { return 'How much can ' + f() + ' put aside each year for protection and savings?'; }));

    L.push(Q('Assets and debts', 'houseVal', 'money', function () { return 'What is the house worth? Say none if there is no house.'; }, { none: '0' }));
    L.push(Q('Assets and debts', 'cashBankVal', 'money', function () { return 'How much is in cash and in the bank?'; }, { none: '0' }));
    L.push(Q('Assets and debts', 'investmentsVal', 'money', function () { return 'Any investments or mutual funds? How much?'; }, { none: '0' }));
    L.push(Q('Assets and debts', 'mortgageBal', 'money', function () { return 'What is still owed on a mortgage? Say none if there is none.'; }, { none: '0' }));
    L.push(Q('Assets and debts', 'mortgageMo', 'money', function () { return 'And the monthly mortgage payment?'; }, { when: function () { return stripNum(val('mortgageBal')) > 0; } }));
    L.push(Q('Assets and debts', 'bankLoanBal', 'money', function () { return 'Any bank or credit union loans? How much is owed?'; }, { none: '0' }));
    L.push(Q('Assets and debts', 'bankLoanMo', 'money', function () { return 'And the monthly loan payment?'; }, { when: function () { return stripNum(val('bankLoanBal')) > 0; } }));
    L.push(Q('Assets and debts', 'creditCardBal', 'money', function () { return 'Any credit card balance?'; }, { none: '0' }));

    [1, 2, 3, 4].forEach(function (i) {
      var on = function () { return i === 1 || !!val('goal' + i + 'Need') || MEM.moreGoal[i - 1] === true; };
      L.push(Q('Goals', 'goal' + i + 'Need', 'choice', function () {
        return (i === 1 ? 'What is ' + f() + '’s main goal? For example family protection, education, mortgage protection, retirement, critical illness or health.'
                        : 'What is the next goal?'); }, { when: on }));
      L.push(Q('Goals', 'goal' + i + 'Desc', 'text', function () { return 'Tell me about it in a few words.'; }, { when: function () { return on() && !!val('goal' + i + 'Need'); } }));
      L.push(Q('Goals', 'goal' + i + 'Val', 'money', function () { return 'How much is needed for it?'; }, { when: function () { return on() && !!val('goal' + i + 'Need'); } }));
      L.push(Q('Goals', 'goal' + i + 'Tf', 'choice', function () { return 'When: as soon as possible, in the next three years, three to five years, or six years and more?'; }, { when: function () { return on() && !!val('goal' + i + 'Need'); } }));
      if (i < 4) L.push(Q('Goals', '#moreGoal' + i, 'yesno', function () { return 'Is there another goal?'; },
        { when: function () { return on() && !!val('goal' + i + 'Need') && MEM.moreGoal[i] === undefined && !val('goal' + (i + 1) + 'Need'); }, set: function (v) { MEM.moreGoal[i] = v === 'Yes'; } }));
    });

    L.push(Q('Retirement', 'retPctIncome', 'number', function () { return 'In retirement, what percentage of today’s income would ' + f() + ' want to live on? Seventy is common.'; }));
    L.push(Q('Retirement', 'retYears', 'number', function () { return 'For how many years should that income last?'; }));

    L.push(Q('Health', 'medical', 'yesno', function () { return 'Does anyone in the family have a medical condition we should note?'; }));
    [1, 2, 3].forEach(function (i) {
      var on = function () { return val('medical') === 'Yes' && (i === 1 || !!val('med' + (i - 1) + 'Condition')); };
      L.push(Q('Health', 'med' + i + 'Person', 'name', function () { return i === 1 ? 'Who is it?' : 'Anyone else? Say none if not.'; }, { when: on, stopOnNone: true }));
      L.push(Q('Health', 'med' + i + 'Condition', 'text', function () { return 'What is the condition?'; }, { when: function () { return on() && !!val('med' + i + 'Person'); } }));
      L.push(Q('Health', 'med' + i + 'Treatment', 'text', function () { return 'And the treatment?'; }, { when: function () { return on() && !!val('med' + i + 'Person'); } }));
    });

    // RAI's own questions about the case (missing disability cover and the
    // like). They exist only once recommendations are entered, so a second run
    // after the recommendations asks them. Each answer prints in the notes.
    try {
      (typeof RATIONALE_QS !== 'undefined' ? RATIONALE_QS : []).forEach(function (r) {
        var plain = String(r.q || '').replace(/<[^>]+>/g, '').replace(/&rsquo;/g, '\u2019').replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ');
        L.push(Q('Your reasons', r.id, 'text', function () { return plain; }));
      });
    } catch (e) {}
    // The printed notes are put together by composeNotes() from those answers
    // and the "Anything else" box, so dictation goes into that box.
    L.push(Q('Your notes', 'notesExtra', 'dictate', function () {
      return 'Last, anything else for the notes: how the meeting went, the client\u2019s comfort with the premium, anything to follow up. Speak as long as you like, and say done when you have finished.'; }));
    L.forEach(function (s, i) { s.id = s.k + '@' + i; });
    return L;
  }
  function stripNum(v) { var n = parseFloat(String(v || '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }

  /* ── Engine ─────────────────────────────────────────────────────────────── */
  var V = { on: false, paused: false, cur: null, tries: 0, history: [], left: [], filled: [], all: false,
            listening: false, rec: null, tok: 0, trail: [], voice: null, dictating: false, speakBack: true };
  function eligible(s) {
    if (s.when && !s.when()) return false;
    if (s.k.charAt(0) === '#') return true;
    if (!fieldEl(s.k)) return false;
    if (s.t === 'dictate') return true;
    return V.all || !val(s.k);
  }
  function nextStep(afterId) {
    var L = steps(), i = 0;
    if (afterId) { for (; i < L.length; i++) if (L[i].id === afterId) { i++; break; } }
    for (; i < L.length; i++) if (eligible(L[i])) return L[i];
    return null;
  }
  function stepById(id) { return steps().filter(function (s) { return s.id === id; })[0]; }
  function countLeft() {
    var L = steps(), at = false, n = 0, done = 0;
    L.forEach(function (s) { if (!eligible(s)) return; if (V.cur && s.id === V.cur.id) at = true; if (at) n++; else done++; });
    return { left: n, done: done };
  }

  function pickVoice() {
    if (!TTS) return null;
    var vs = TTS.getVoices().filter(function (v) { return /^en/i.test(v.lang); });
    var pref = [/Andrew.*Natural/i, /Natural/i, /Google UK English Male/i, /Daniel/i, /Google US English/i, /Samantha/i, /en-GB/i];
    for (var p = 0; p < pref.length; p++) {
      for (var j = 0; j < vs.length; j++) if (pref[p].test(vs[j].name) || pref[p].test(vs[j].lang)) return vs[j];
    }
    return vs[0] || null;
  }
  function speak(text) {
    if (window.RRB_SPEECH && !V.muted) { say(text); return window.RRB_SPEECH.speak(text); }   // Andrew, on the practice copy (andrew.js)
    return new Promise(function (res) {
      say(text);
      if (!TTS || V.muted) return res();
      try {
        TTS.cancel();
        var u = new SpeechSynthesisUtterance(text);
        V.voice = V.voice || pickVoice(); if (V.voice) u.voice = V.voice;
        u.rate = 1.0; u.pitch = 1.0;
        var done = false, fin = function () { if (!done) { done = true; res(); } };
        u.onend = fin; u.onerror = fin;
        setTimeout(fin, 1500 + text.length * 90);      // some phones never fire onend
        TTS.speak(u);
      } catch (e) { res(); }
    });
  }
  /* Every turn has a number. Whatever was waiting on the last turn's speech
     (the readback's "move on", a re-listen) is dropped once a new turn starts:
     an answer typed or spoken over the readback must not move the interview
     twice. */
  function then(text, fn) {
    var tok = ++V.tok; V.busy = true;
    return speak(text).then(function () { if (tok !== V.tok) return; V.busy = false; fn(); });
  }
  function listen() {
    if (!SR || !V.on || V.paused) { showTyping(); return; }
    stopListening();
    var r = new SR();
    r.lang = (navigator.language && /^en/i.test(navigator.language)) ? navigator.language : 'en-US';
    r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    var heard = '', gotFinal = false;
    r.onresult = function (e) {
      var t = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        t += e.results[i][0].transcript;
        if (e.results[i].isFinal) gotFinal = true;
      }
      if (V.asking && echo(t)) { heard = ''; gotFinal = false; return; }   // the question, heard from the speaker
      if (V.asking && t.trim().length > 1) interrupt();
      heard = t; hear(t, !gotFinal);
    };
    r.onerror = function (e) {
      if (e.error === 'no-speech' || e.error === 'aborted') return;      // silence: onend listens again
      V.noMic = true;
      note(e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'The microphone is blocked for this page. Allow it in the browser, or type the answers below.'
        : 'The speech service is not answering (' + e.error + '). Type the answers below, or use your keyboard’s microphone.');
      showTyping();
    };
    r.onend = function () {
      V.listening = false; mic(false);
      if (!V.on || V.paused || V.noMic) return;
      if (gotFinal && heard.trim() && !(V.asking && echo(heard))) { V.asking = ''; handle(heard.trim()); }
      else setTimeout(function () { if (V.on && !V.paused && (!V.busy || V.asking) && !V.listening) listen(); }, 250);   // silence: keep listening
    };
    try { r.start(); V.rec = r; V.listening = true; mic(true); } catch (e) { showTyping(); }
  }
  function stopListening() { if (V.rec) { try { V.rec.onend = null; V.rec.abort(); } catch (e) {} V.rec = null; } V.listening = false; mic(false); }

  function ask(s) {
    V.cur = s; V.tries = 0; V.dictating = s.t === 'dictate';
    if (V.trail[V.trail.length - 1] !== s.id) V.trail.push(s.id);
    paintQuestion();
    if (barge()) { var q = s.q(); V.asking = q; then(q, function () { V.asking = ''; if (!V.listening) listen(); }); listen(); return; }
    then(s.q(), listen);
  }
  /* Answering before the question is finished (2 November 2026: "if the agent gives the answer and knows it the
     dictation should recognize this and not continue with the question"). On the practice copy the microphone is
     open while the question is asked; the moment the agent speaks, the question stops and the answer is taken.
     What the microphone hears of the question itself (from the speaker) is not taken for an answer. */
  function barge() { return !!(window.RRB_SPEECH && SR && !V.noMic); }
  function echo(heard) {
    var q = String(V.asking || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
    var h = String(heard || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
    if (!q.length || !h.length) return false;
    var hit = h.filter(function (w) { return q.indexOf(w) > -1; }).length;
    return h.length >= 2 && hit / h.length >= 0.7;
  }
  function interrupt() {
    if (!V.asking) return;
    V.asking = ''; V.tok++; V.busy = false;
    try { if (TTS) TTS.cancel(); else if (window.RRB_SPEECH) window.RRB_SPEECH.cancel(); } catch (e) {}
  }
  function advance(fromId) {
    var n = nextStep(fromId);
    if (!n) return finish();
    if (V.cur && V.cur.sec !== n.sec) then(n.sec + '.', function () { ask(n); });
    else ask(n);
  }
  function finish() {
    stopListening(); V.cur = null; paintQuestion();
    var msg = plain()
      ? (V.left.length ? 'That is the interview. A few answers are left for you; they are listed on the panel. Check the form, then add your recommendations.'
                       : 'That is the interview. Check the form, then add your recommendations.')
      : 'That is the interview. I filled ' + V.filled.length + ' answer' + (V.filled.length === 1 ? '' : 's') + '.' +
      (V.left.length ? ' ' + V.left.length + ' are left for you to fill in. They are listed on the panel.' : '') +
      ' Check the form, then add your recommendations.';
    speak(msg); V.on = false; paintButtons();
  }

  var CMD = {
    repeat: /^(repeat|say (that|it) again|again|pardon|what)\b/, skip: /^(skip|next|pass|move on|leave it)\b/,
    unsure: /^(i don'?t know|not sure|unknown|no idea)\b/, back: /^(back|go back|previous)\b/,
    pause: /^(pause|hold on|wait)\b/, stop: /^(stop|end|finish|quit|cancel)( (the )?interview)?$/
  };
  function handle(text) {
    var s = V.cur; if (!s) return;
    var t = text.toLowerCase().replace(/[.!?]+$/, '').trim();
    if (!V.dictating) {
      if (CMD.stop.test(t)) return stop();
      if (CMD.pause.test(t)) return pause();
      if (CMD.repeat.test(t)) return ask(s);
      if (CMD.back.test(t)) return back();
      if (CMD.skip.test(t) || CMD.unsure.test(t)) { leave(s, 'skipped'); return advance(s.id); }
    } else if (/^(done|finished|that'?s it|that is all|end of notes)$/.test(t)) {
      return then('Thank you, your notes are in.', function () { advance(s.id); });
    }
    var r = read(s, text);
    if (r.ok) {
      V.history.push({ id: s.id, k: s.k, before: s.k.charAt(0) === '#' ? null : val(s.k) });
      if (s.set) s.set(r.v);
      if (s.k.charAt(0) !== '#') {
        if (!setVal(s.k, r.v)) { leave(s, 'could not be set'); return advance(s.id); }
        V.filled.push({ k: s.k, label: s.sec, v: r.say || r.v });
        paintFilled();
      }
      if (V.dictating) { listen(); return; }        // keep taking notes until "done"
      var back2 = V.speakBack && r.say && !plain() ? 'Got it. ' + r.say + '.' : 'Got it.';
      return then(back2, function () { advance(s.id); });
    }
    V.tries++;
    if (V.tries >= 2) {
      leave(s, 'heard "' + text + '"');
      return then('I will leave that one for you.', function () { advance(s.id); });
    }
    then(r.hint || 'Sorry, I did not catch that. Say it again, or say skip.', listen);
  }
  function read(s, text) {
    var t = String(text).trim();
    if (s.none && /^(none|no|nothing|zero|nil)$/i.test(t)) return { ok: true, v: s.none, say: 'none' };
    if (s.stopOnNone && /^(none|no|nobody|no one|that'?s all)$/i.test(t)) { leave(s, 'none'); return { ok: false, hint: '' }; }
    switch (s.t) {
      case 'name': return t.length > 1 ? { ok: true, v: titleCase(t), say: titleCase(t) } : { ok: false };
      case 'text': return { ok: true, v: sentence(t), say: '' };
      case 'dictate': {
        var prev = val(s.k);
        var add = sentence(t) + (/[.!?]$/.test(t) ? '' : '.');
        return { ok: true, v: prev ? prev + ' ' + add : add, say: '' };
      }
      case 'date': {
        var d = parseDate(t);
        return d ? { ok: true, v: d, say: sayDate(d) } : { ok: false, hint: 'Say the date like "12 April 1988".' };
      }
      case 'money': case 'number': {
        var n = parseNumber(t);
        if (n === null || isNaN(n)) return { ok: false, hint: 'I need a number. Say it like "fifteen thousand", or say skip.' };
        return { ok: true, v: String(n), say: s.t === 'money' ? money(n) : String(n) };
      }
      case 'count': {
        if (/^(none|no|zero|nil|no children|no kids)\b/i.test(t)) return { ok: true, v: 0, say: 'none' };
        var c = parseNumber(t);
        return (c !== null && c >= 0 && c < 20) ? { ok: true, v: c, say: String(c) } : { ok: false, hint: 'How many? Say a number, or none.' };
      }
      case 'yesno': {
        var y = parseYesNo(t);
        return y ? { ok: true, v: y, say: y } : { ok: false, hint: 'Please say yes or no.' };
      }
      case 'email': {
        var e = parseEmail(t);
        return e ? { ok: true, v: e, say: e.replace('@', ' at ').replace(/\./g, ' dot ') } : { ok: false, hint: 'Say it like "john dot smith at gmail dot com".' };
      }
      case 'phone': {
        var p = parsePhone(t);
        return p ? { ok: true, v: p, say: p.replace(/\D/g, '').split('').join(' ') } : { ok: false, hint: 'Say the number digit by digit.' };
      }
      case 'choice': {
        var o = matchChoice(t, optsOf(s.k));
        if (o) return { ok: true, v: o.v, say: o.t };
        var opts = optsOf(s.k).slice(0, 6).map(function (x) { return x.t; });
        return { ok: false, hint: 'I did not match that. The choices are: ' + opts.join(', ') + '.' };
      }
    }
    return { ok: false };
  }
  function leave(s, why) {
    if (s.k.charAt(0) === '#') return;
    if (!V.left.some(function (x) { return x.k === s.k; })) V.left.push({ k: s.k, sec: s.sec, why: why, q: s.q() });
    paintFilled();
  }
  // Back to the question asked before this one, answered or not. Its answer,
  // if any, stays until a new one is given.
  function back() {
    if (V.trail.length < 2) return ask(V.cur);
    V.trail.pop();
    var s = stepById(V.trail.pop());
    if (!s) return ask(V.cur);
    if (s.k === '#kids') MEM.kids = null;
    if (s.k === '#hasIns') MEM.hasIns = null;
    V.left = V.left.filter(function (x) { return x.k !== s.k; }); paintFilled();
    ask(s);
  }
  function pause() { V.tok++; V.paused = true; stopListening(); if (TTS) TTS.cancel(); say('Paused. Press Resume, or say nothing.'); paintButtons(); }
  function resume() { V.paused = false; paintButtons(); if (V.cur) ask(V.cur); }
  function stop() {
    V.tok++; V.on = false; V.paused = false; stopListening(); if (TTS) TTS.cancel();
    say('Stopped. Everything you answered is saved on the form.'); paintButtons(); paintQuestion();
  }
  function start() {
    if (mode() !== 'agent') return;
    V.on = true; V.paused = false; V.noMic = false; V.left = []; V.filled = []; V.trail = [];
    V.all = !!(panel && panel.querySelector('#rrbvAll') && panel.querySelector('#rrbvAll').checked);
    MEM.kids = null; MEM.hasIns = null; MEM.moreIns = {}; MEM.moreGoal = {};
    paintButtons(); paintFilled();
    V.cur = null;
    var n = nextStep(null);
    if (!n) return speak('Every question already has an answer. Tick "Ask everything" to go through them again.');
    then('Let’s go through the fact find. Answer each question, or say skip, back, repeat or stop at any time.',
      function () { ask(n); });
  }

  /* ── Panel ──────────────────────────────────────────────────────────────── */
  var panel, fab;
  function css() {
    var st = document.createElement('style');
    st.textContent =
      '.rrbv-fab{position:fixed;right:16px;bottom:16px;z-index:9998;display:flex;align-items:center;gap:8px;' +
      'background:#0F766E;color:#fff;border:0;border-radius:999px;padding:12px 18px;font:700 15px/1 Inter,system-ui,sans-serif;' +
      'box-shadow:0 8px 24px rgba(15,118,110,.35);cursor:pointer;min-height:48px}' +
      '.rrbv-fab svg,.rrbv-hd svg{width:20px;height:20px;flex:none}' +
      '.rrbv{position:fixed;right:16px;bottom:16px;z-index:9999;width:min(420px,calc(100vw - 32px));max-height:min(78vh,640px);' +
      'display:flex;flex-direction:column;background:#fff;border:1px solid #CBD5E1;border-radius:16px;' +
      'box-shadow:0 18px 50px rgba(15,23,42,.25);font:15px/1.45 Inter,system-ui,sans-serif;color:#0F172A;overflow:hidden}' +
      '.rrbv[hidden]{display:none}.rrbv-hd{display:flex;align-items:center;gap:10px;padding:12px 14px;background:#0F766E;color:#fff}' +
      '.rrbv-hd b{flex:1;font-size:15px}.rrbv-x{background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;min-width:44px;min-height:44px}' +
      '.rrbv-bd{padding:12px 14px;overflow:auto}' +
      '.rrbv-sec{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#0F766E}' +
      '.rrbv-q{font-size:18px;font-weight:700;margin:4px 0 8px}' +
      '.rrbv-heard{min-height:24px;color:#475569;font-style:italic}' +
      '.rrbv-mic{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:#64748B}' +
      '.rrbv-mic i{width:10px;height:10px;border-radius:50%;background:#CBD5E1;display:inline-block}' +
      '.rrbv-mic.on i{background:#DC2626;animation:rrbvp 1.1s infinite}' +
      '@keyframes rrbvp{50%{opacity:.35}}' +
      '@media (prefers-reduced-motion:reduce){.rrbv-mic.on i{animation:none}}' +
      '.rrbv-row{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}' +
      '.rrbv-row button{flex:1 1 auto;min-height:44px;border-radius:10px;border:1px solid #CBD5E1;background:#F8FAFC;' +
      'font:700 14px Inter,system-ui,sans-serif;color:#0F172A;cursor:pointer;padding:0 10px}' +
      '.rrbv-row button.go{background:#0F766E;color:#fff;border-color:#0F766E}' +
      '.rrbv-type{display:flex;gap:6px}.rrbv-type input{flex:1;min-height:44px;font-size:max(16px,1rem);border:1px solid #7D8890;' +
      'border-radius:10px;padding:0 10px}.rrbv-type button{min-height:44px;border-radius:10px;border:0;background:#0F766E;color:#fff;' +
      'font-weight:700;padding:0 14px}' +
      '.rrbv-opt{display:flex;gap:6px;align-items:center;font-size:13.5px;color:#334155;margin-top:8px}' +
      '.rrbv-opt input{width:20px;height:20px}' +
      '.rrbv h4{margin:12px 0 4px;font-size:13px;color:#334155}' +
      '.rrbv ul{margin:0;padding-left:18px;font-size:13.5px}.rrbv li{margin:2px 0}' +
      '.rrbv li a{color:#0F766E;cursor:pointer;text-decoration:underline}' +
      '.rrbv-note{font-size:12px;color:#64748B;margin-top:10px}' +
      '.rrbv-msg{font-size:13px;color:#B45309;margin-top:6px}' +
      '.rrbv-flash{outline:3px solid #14B8A6 !important;outline-offset:2px;transition:outline-color 1.4s}' +
      '.rrbv details{margin-top:8px;font-size:13.5px}.rrbv summary{cursor:pointer;color:#0F766E;font-weight:700;min-height:32px}' +
      /* On a phone: a short sheet along the bottom, so the field being filled stays in view above it. */
      '@media (max-width:600px){.rrbv{left:8px;right:8px;bottom:8px;width:auto;max-height:52vh}' +
      '.rrbv-hd{padding:6px 10px}.rrbv-q{font-size:16.5px}.rrbv-row button{padding:0 6px;font-size:13.5px}' +
      '.rrbv-fab{right:12px;bottom:12px}}';
    document.head.appendChild(st);
  }
  var MIC_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/><path d="M12 18v4"/></svg>';
  function build() {
    css();
    fab = document.createElement('button');
    fab.type = 'button'; fab.className = 'rrbv-fab no-print';
    fab.innerHTML = MIC_SVG + '<span>Voice interview</span>';
    fab.onclick = function () { panel.hidden = false; fab.hidden = true; };
    panel = document.createElement('div');
    panel.className = 'rrbv no-print'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Voice interview');
    panel.innerHTML =
      '<div class="rrbv-hd">' + MIC_SVG + '<b>Voice interview</b><button type="button" class="rrbv-x" aria-label="Close">&times;</button></div>' +
      '<div class="rrbv-bd">' +
        '<div class="rrbv-sec" id="rrbvSec">Ready</div>' +
        '<div class="rrbv-q" id="rrbvQ">I ask each question aloud. You answer, I fill the form and tell you what I put in.</div>' +
        '<div class="rrbv-mic" id="rrbvMic"><i></i><span>' + (SR ? 'Microphone off' : 'This browser cannot listen: type the answers, or use your keyboard’s microphone') + '</span></div>' +
        '<div class="rrbv-heard" id="rrbvHeard" aria-live="polite"></div>' +
        '<div class="rrbv-msg" id="rrbvMsg"></div>' +
        '<div class="rrbv-row" id="rrbvBtns"></div>' +
        '<form class="rrbv-type" id="rrbvType"><input type="text" placeholder="Or type the answer" aria-label="Type the answer" autocomplete="off"><button type="submit">Send</button></form>' +
        '<div id="rrbvFilled"></div>' +
        '<details><summary>Options and how it works</summary>' +
          '<label class="rrbv-opt"><input type="checkbox" id="rrbvAll"> Ask everything, not only the blank fields</label>' +
          '<label class="rrbv-opt"><input type="checkbox" id="rrbvMute"> Don’t speak aloud (show the questions only)</label>' +
          '<div class="rrbv-note">Say <b>skip</b>, <b>back</b>, <b>repeat</b>, <b>pause</b> or <b>stop</b> at any time. ' +
          '“I don’t know” skips the question. Recommendations and the client’s decision are yours to fill in. ' +
          'Nothing is recorded or kept by the branch: your browser’s speech service (Google in Chrome, Apple on an iPhone) ' +
          'turns what you say into text.</div>' +
        '</details>' +
      '</div>';
    document.body.appendChild(fab); document.body.appendChild(panel);
    panel.querySelector('.rrbv-x').onclick = function () { stop(); panel.hidden = true; fab.hidden = false; };
    panel.querySelector('#rrbvType').onsubmit = function (e) {
      e.preventDefault(); var i = this.querySelector('input'); var v = i.value.trim(); if (!v) return;
      i.value = ''; stopListening(); if (TTS) TTS.cancel(); V.busy = false; V.tok++;
      if (!V.on) { start(); return; }
      hear(v, false); handle(v);
    };
    panel.querySelector('#rrbvMute').onchange = function () { V.muted = this.checked; if (V.muted && TTS) TTS.cancel(); };
    paintButtons();
    if (TTS && TTS.onvoiceschanged !== undefined) TTS.onvoiceschanged = function () { V.voice = pickVoice(); };
  }
  function btn(label, fn, go) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (go) b.className = 'go';
    b.onclick = fn; return b;
  }
  function paintButtons() {
    if (!panel) return;
    var row = panel.querySelector('#rrbvBtns'); row.innerHTML = '';
    if (!V.on) { row.appendChild(btn(V.cur ? 'Start again' : 'Start the interview', start, true)); return; }
    row.appendChild(V.paused ? btn('Resume', resume, true) : btn('Pause', pause));
    row.appendChild(btn('Repeat', function () { stopListening(); ask(V.cur); }));
    row.appendChild(btn('Back', function () { stopListening(); back(); }));
    row.appendChild(btn('Skip', function () { stopListening(); if (V.cur) { leave(V.cur, 'skipped'); advance(V.cur.id); } }));
    row.appendChild(btn('Stop', stop));
  }
  function paintQuestion() {
    if (!panel) return;
    var s = V.cur, c = s ? countLeft() : null;
    panel.querySelector('#rrbvSec').textContent = s ? s.sec + (c ? ' · ' + c.left + ' to go' : '') : (V.on ? '' : 'Ready');
    panel.querySelector('#rrbvQ').textContent = s ? s.q() : (V.filled.length ? 'Finished. Check the form, then add your recommendations.' : panel.querySelector('#rrbvQ').textContent);
    panel.querySelector('#rrbvHeard').textContent = '';
  }
  function paintFilled() {
    if (!panel) return;
    var h = '';
    if (V.filled.length) h += '<h4>Filled (' + V.filled.length + ')</h4><ul>' + V.filled.slice(-8).reverse().map(function (f) {
      return '<li><a data-k="' + f.k + '">' + esc(labelOf(f.k)) + '</a>: ' + esc(String(f.v).slice(0, 60)) + '</li>'; }).join('') + '</ul>';
    if (V.left.length) h += '<h4>Left for you (' + V.left.length + ')</h4><ul>' + V.left.map(function (f) {
      return '<li><a data-k="' + f.k + '">' + esc(labelOf(f.k)) + '</a> <span style="color:#64748B">(' + esc(f.why) + ')</span></li>'; }).join('') + '</ul>';
    var box = panel.querySelector('#rrbvFilled'); box.innerHTML = h;
    Array.prototype.forEach.call(box.querySelectorAll('a[data-k]'), function (a) {
      a.onclick = function () { var el = fieldEl(a.dataset.k); if (el) { openFor(el); flash(el); try { el.focus({ preventScroll: true }); } catch (e) {} } };
    });
  }
  function labelOf(k) {
    var L = steps().filter(function (s) { return s.k === k; })[0];
    var nice = { fullName: 'Full name', dob: 'Date of birth', maritalStatus: 'Marital status', monthlyIncome: 'Monthly income',
      monthlyExpenses: 'Monthly expenses', empStatus: 'Employment', notesExtra: 'Your notes' };
    return nice[k] || (L ? L.sec + ' · ' + k.replace(/([A-Z])/g, ' $1').replace(/(\d)/, ' $1').toLowerCase() : k);
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function say(t) { if (panel && V.cur) panel.querySelector('#rrbvQ').textContent = V.cur.q(); }
  function hear(t, interim) { if (panel) panel.querySelector('#rrbvHeard').textContent = (interim ? 'Hearing: ' : 'You said: ') + t; }
  function note(t) { if (panel) panel.querySelector('#rrbvMsg').textContent = t; }
  function mic(on) {
    if (!panel) return;
    var m = panel.querySelector('#rrbvMic'); m.classList.toggle('on', !!on);
    m.querySelector('span').textContent = on ? 'Listening…' : (SR ? 'Microphone off' : 'This browser cannot listen: type the answers');
  }
  function showTyping() { if (panel) { var i = panel.querySelector('#rrbvType input'); if (i && document.activeElement !== i) i.placeholder = 'Type the answer and press Send'; } }

  /* ── Start ──────────────────────────────────────────────────────────────── */
  function boot() {
    if (mode() !== 'agent') return;              // never on a manager's review or the client's view
    build();
  }
  /** Every line Dictation can say in plain words (for the recordings in voice/andrew/). */
  function allLines() {
    var out = [], add = function (t) { t = String(t || '').trim(); if (t && out.indexOf(t) < 0) out.push(t); };
    var saved = { kids: MEM.kids, hasIns: MEM.hasIns };
    steps().forEach(function (s) {
      add(s.q()); add(s.sec + '.');
      if (s.t === 'choice') add('I did not match that. The choices are: ' + optsOf(s.k).slice(0, 6).map(function (x) { return x.t; }).join(', ') + '.');
    });
    MEM.kids = saved.kids; MEM.hasIns = saved.hasIns;
    ['Let’s go through the fact find. Answer each question, or say skip, back, repeat or stop at any time.',
     'Got it.', 'I will leave that one for you.', 'Sorry, I did not catch that. Say it again, or say skip.',
     'Say the date like "12 April 1988".', 'I need a number. Say it like "fifteen thousand", or say skip.',
     'How many? Say a number, or none.', 'Please say yes or no.', 'Say it like "john dot smith at gmail dot com".',
     'Say the number digit by digit.', 'Thank you, your notes are in.',
     'Every question already has an answer. Tick "Ask everything" to go through them again.',
     'That is the interview. A few answers are left for you; they are listed on the panel. Check the form, then add your recommendations.',
     'That is the interview. Check the form, then add your recommendations.'].forEach(add);
    return out;
  }
  window.RRB_VOICE = { start: start, stop: stop, _lines: allLines, _parse: { number: parseNumber, date: parseDate, email: parseEmail,
                       phone: parsePhone, yesno: parseYesNo, choice: matchChoice, words: wordsToNumber } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 600); });
  else setTimeout(boot, 600);
})();
