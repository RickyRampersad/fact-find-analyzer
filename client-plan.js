/* ─────────────────────────────────────────────────────────────────────────────
   THE CLIENT'S PERSONAL PLAN: the e-mail and the narrated presentation
   (3 November 2026, practice copy only).

   Ricky Rampersad: "the email to the client now with a personalized
   recommendations that has the advisor's name that will make the client want
   to take action", and "a video presentation … so while he is driving back
   from work him and his wife can … click the link … the household by their
   advisor … in the old way they have to review and sign the draft, we are now
   including a presentation."

   On the practice copy (ffproject?guest=1&ai=1) this builds, from the fact
   find as it stands:
   - the client e-mail, as it would arrive: the household by name, from their
     advisor by name, what they told us, what the family needs, the advisor's
     own recommendations with the advisor's reasons, "Watch your family's plan"
     and "Confirm my fact find";
   - the presentation itself (plan.html), narrated, scene by scene, from the
     same facts.
   Nothing is sent: the practice copy sends nothing to anyone. The live e-mail
   is built by the fact find's Apps Script and changes only when the branch
   approves this and the script is pasted.

   It never writes a recommendation: every plan, amount, premium and reason
   comes from the advisor's own rows.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.RRB_CLIENT_PLAN || !window.RRB_GUEST) return;

  function S() { try { return (typeof state !== 'undefined' && state) ? state : {}; } catch (e) { return {}; } }
  function v(k) { var x = S()[k]; return x == null ? '' : String(x).trim(); }
  function num(x) { var n = parseFloat(String(x || '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
  function tt(n) { return 'TT$' + Math.round(n).toLocaleString('en-US'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function first(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function last(n) { var p = String(n || '').trim().split(/\s+/); return p.length > 1 ? p[p.length - 1] : ''; }
  function age(dob) {
    var d = new Date(dob); if (isNaN(d)) return '';
    var n = new Date(), a = n.getFullYear() - d.getFullYear();
    if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
    return a >= 0 && a < 120 ? a : '';
  }
  function fig(id) { var el = document.getElementById(id); var t = el ? String(el.textContent || '').trim() : ''; return /\d/.test(t) && !/^TT\$\s*0(\.00)?$/.test(t) ? t : ''; }

  /** Everything the e-mail and the presentation say, read off the fact find. */
  function data() {
    var advice = v('appType') === 'advice';
    var client = v('fullName') || v('clientName') || v('adviceClientName');
    var kids = [];
    for (var i = 1; i <= 3; i++) if (v('child' + i + 'Name')) kids.push({ name: first(v('child' + i + 'Name')), age: age(v('child' + i + 'Dob')) });
    var goals = [];
    for (var g = 1; g <= 4; g++) if (v('goal' + g + 'Need')) goals.push({ need: v('goal' + g + 'Need'), desc: v('goal' + g + 'Desc'), val: num(v('goal' + g + 'Val')) });
    var recs = [];
    for (var r = 1; r <= 6; r++) {
      if (!v('rec' + r + 'Rec')) continue;
      recs.push({ need: v('rec' + r + 'Need'), who: v('rec' + r + 'Who') || 'Client', plan: v('rec' + r + 'Rec'), amt: num(v('rec' + r + 'Amt')),
                  prem: num(v('rec' + r + 'Prem')), mode: v('rec' + r + 'Mode') || 'Monthly', reason: v('rec' + r + 'Reason') });
    }
    var d0 = {
      advice: advice, client: client, first: first(client), surname: last(client) || client,
      spouse: v('spouseName'), spouseFirst: first(v('spouseName')), kids: kids,
      email: v('email') || v('adviceClientEmail'), need: v('adviceClientNeed'),
      income: num(v('monthlyIncome')), spouseIncome: num(v('spouseMonthlyIncome')), spend: num(v('monthlyExpenses')),
      mortgage: num(v('mortgageBal')), goals: goals, recs: recs,
      totalNeed: fig('totalNeed'), cover: fig('totalCoverage'), gap: fig('insuranceNeed'),
      advisor: v('advisorName') || 'your advisor', advisorFirst: first(v('advisorName')) || 'your advisor', advisorEmail: v('agentEmail'),
      branch: 'Ricky Rampersad Branch'
    };
    d0.insights = advice ? [] : insights(d0);
    return d0;
  }

  /* What Andrew noticed, for the client (3 November 2026: "I did ask you to build in those insights"). Facts from the
     fact find only, each with the sentence Andrew says. Never a product or an amount of cover: that is the advisor's. */
  function insights(d) {
    var out = [], st = S();
    function add(k, title, text, say) { out.push({ k: k, title: title, text: text, say: say || text }); }
    var spend = d.spend, inc = d.income, inc2 = d.spouseIncome;
    if (spend && inc && inc2 && spend > inc && spend > inc2) {
      add('both', 'You depend on each other', 'Your family spends ' + tt(spend) + ' a month. Neither salary covers that alone.',
          'Your family spends ' + Math.round(spend).toLocaleString('en-US') + ' dollars a month. Neither salary covers that alone. You depend on each other.');
    }
    var pols = [];
    for (var i = 1; i <= 4; i++) if (v('ins' + i + 'Co') && !/^none$/i.test(v('ins' + i + 'Co'))) pols.push({ owner: v('ins' + i + 'Owner'), type: v('ins' + i + 'Type'), sum: num(v('ins' + i + 'Sum')), status: v('ins' + i + 'Status') });
    var live = pols.filter(function (p) { return !/lapsed|surrender/i.test(p.status); });
    if (live.length && live.every(function (p) { return /group/i.test(p.type); })) {
      var gs = live.reduce(function (a, p) { return a + p.sum; }, 0);
      add('group', 'Your cover is only through work', (gs ? tt(gs) + ' of group life. ' : '') + 'It usually ends if the job ends.',
          'Your only cover today is group life through work' + (gs ? ', ' + Math.round(gs).toLocaleString('en-US') + ' dollars' : '') + '. It usually ends if the job ends.');
    }
    if (d.spouse && !live.some(function (p) { return /spouse|joint/i.test(p.owner); })) {
      var pr = /^f/i.test(v('spouseGender')) ? 'her' : /^m/i.test(v('spouseGender')) ? 'his' : 'their';
      add('spouse', d.spouseFirst + ' has no cover of ' + pr + ' own', 'Nothing on file protects the family if ' + d.spouseFirst + ' could not be there.',
          d.spouseFirst + ' has no life cover of ' + pr + ' own. Nothing on file protects the family if ' + d.spouseFirst + ' could not be there.');
    }
    var ages = d.kids.map(function (k) { return k.age; }).filter(function (a) { return a !== ''; });
    var edu = d.goals.filter(function (g) { return /educat|univers|school|college/i.test(g.need + ' ' + g.desc) && g.val; })[0];
    if (edu && ages.length) {
      var eldest = Math.max.apply(null, ages), yrs = Math.max(1, 18 - eldest), fv = edu.val * Math.pow(1.03, yrs);
      add('edu', 'University will cost more', tt(edu.val) + ' today is about ' + tt(Math.round(fv / 1000) * 1000) + ' in ' + yrs + ' years, at 3% inflation.',
          'The ' + Math.round(edu.val).toLocaleString('en-US') + ' dollars you set aside for university becomes about ' + Math.round(fv / 1000).toLocaleString('en-US') + ' thousand in ' + yrs + ' years, at three percent inflation.');
    }
    if (inc || d.goals.some(function (g) { return /retire/i.test(g.need); })) {
      add('nis', 'NIS: the full pension age is rising', 'From January 2028 it moves from 60 to 65, a year every two years (National Insurance Board).',
          'And the full NIS pension age rises from sixty to sixty-five, starting in January twenty twenty-eight. Worth knowing as you plan for retirement.');
    }
    return out.slice(0, 5);
  }
  function who(d, w) {
    if (/spouse/i.test(w) && d.spouseFirst) return d.spouseFirst;
    if (/client/i.test(w) || !w) return d.first || 'you';
    return w;
  }
  function planLink(d) {
    var j = JSON.stringify(d), b = btoa(unescape(encodeURIComponent(j))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return 'plan.html#p=' + b;
  }

  /* ── The e-mail ─────────────────────────────────────────────────────────── */
  function emailHtml(d) {
    var hh = d.surname ? 'the ' + esc(d.surname) + ' household' : 'your family';
    var names = d.spouseFirst ? esc(d.first) + ' and ' + esc(d.spouseFirst) : esc(d.first || 'there');
    var td = 'padding:10px 12px;border-top:1px solid #E2E8F0;font-size:14px;vertical-align:top';
    var h = '<div style="max-width:620px;margin:0 auto;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:#0F172A;background:#fff">';
    h += '<div style="background:#0F172A;color:#fff;padding:22px 26px;border-radius:14px 14px 0 0">' +
      '<div style="font-size:12px;letter-spacing:.14em;color:#5EEAD4;font-weight:800">YOUR FAMILY PLAN · FROM YOUR ADVISOR</div>' +
      '<div style="font-size:26px;font-weight:800;margin-top:6px;line-height:1.2">' + names + ', your plan is ready.</div>' +
      '<div style="color:#CBD5E1;margin-top:6px">Prepared for ' + hh + ' by ' + esc(d.advisor) + ', ' + esc(d.branch) + '</div></div>';
    h += '<div style="padding:22px 26px;border:1px solid #E2E8F0;border-top:0;border-radius:0 0 14px 14px">';
    h += '<p style="margin:0 0 14px;font-size:15.5px;line-height:1.55">Thank you for your time. ' +
      (d.advice ? 'Here is my recommendation for ' + esc(d.need || 'what you asked about') + ', in plain words.' :
       'Here is everything we talked about: your family, what matters to you, what your family would need, and what I recommend.') +
      ' Watch the short presentation together, then confirm with one tap.</p>';
    h += '<a href="' + planLink(d) + '" target="_blank" style="display:block;text-align:center;background:linear-gradient(135deg,#0D9488,#0F766E);color:#fff;text-decoration:none;font-weight:800;font-size:17px;padding:16px;border-radius:12px;margin:6px 0 4px">&#9654; Watch your family\'s plan &middot; about 3 minutes</a>';
    h += '<div style="text-align:center;font-size:12.5px;color:#64748B;margin-bottom:18px">Made for you from your own fact find. If you are driving, just listen.</div>';
    if (!d.advice) {
      var told = [];
      if (d.spouse) told.push('Married to ' + esc(d.spouse));
      if (d.kids.length) told.push(d.kids.length + (d.kids.length === 1 ? ' child' : ' children') + ': ' + d.kids.map(function (k) { return esc(k.name) + (k.age !== '' ? ' (' + k.age + ')' : ''); }).join(', '));
      if (d.income) told.push(esc(d.first) + ' earns ' + tt(d.income) + ' a month' + (d.spouseIncome ? ', ' + esc(d.spouseFirst || 'your spouse') + ' ' + tt(d.spouseIncome) : ''));
      if (d.mortgage) told.push('Mortgage owed: ' + tt(d.mortgage));
      if (d.goals.length) told.push('What matters most: ' + d.goals.map(function (g) { return esc(g.desc || g.need); }).join('; '));
      if (told.length) h += '<div style="font-weight:800;font-size:13px;letter-spacing:.1em;color:#0F766E;margin-top:4px">WHAT YOU TOLD US</div><ul style="margin:6px 0 16px;padding-left:20px;font-size:14.5px;line-height:1.6">' + told.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>';
      if (d.insights && d.insights.length) h += '<div style="font-weight:800;font-size:13px;letter-spacing:.1em;color:#92400E;margin-top:4px">WHAT WE NOTICED</div>' +
        d.insights.map(function (x) { return '<div style="background:#FFF8E6;border-left:4px solid #F5B324;border-radius:8px;padding:9px 12px;margin:6px 0;font-size:14px"><b>' + esc(x.title) + '.</b> ' + esc(x.text) + '</div>'; }).join('') + '<div style="height:10px"></div>';
      if (d.totalNeed || d.gap) h += '<div style="background:#F0FDFA;border:1px solid #99F6E4;border-radius:12px;padding:14px 16px;margin-bottom:16px">' +
        '<div style="font-weight:800;font-size:13px;letter-spacing:.1em;color:#0F766E">WHAT YOUR FAMILY WOULD NEED</div>' +
        (d.totalNeed ? '<div style="font-size:14.5px;margin-top:6px">Total need: <b>' + esc(d.totalNeed) + '</b>' + (d.cover ? ' &middot; cover today: <b>' + esc(d.cover) + '</b>' : '') + '</div>' : '') +
        (d.gap ? '<div style="font-size:20px;font-weight:800;margin-top:6px">The gap: ' + esc(d.gap) + '</div>' : '') + '</div>';
    }
    h += '<div style="font-weight:800;font-size:13px;letter-spacing:.1em;color:#0F766E">WHAT ' + esc(d.advisorFirst).toUpperCase() + ' RECOMMENDS</div>';
    if (d.recs.length) {
      h += '<table style="width:100%;border-collapse:collapse;margin:6px 0 4px"><tr style="background:#F8FAFC;font-size:12.5px;color:#475569;text-align:left"><th style="padding:8px 12px">Plan</th><th style="padding:8px 12px">For</th><th style="padding:8px 12px">Cover</th></tr>';
      d.recs.forEach(function (r) {
        h += '<tr><td style="' + td + '"><b>' + esc(r.plan) + '</b>' + (r.need ? '<div style="color:#64748B;font-size:12.5px">' + esc(r.need) + '</div>' : '') + '</td><td style="' + td + '">' + esc(who(d, r.who)) + '</td><td style="' + td + '">' + (r.amt ? tt(r.amt) : '—') + '</td></tr>';
        if (r.reason) h += '<tr><td colspan="4" style="padding:0 12px 10px;font-size:13.5px;color:#334155;font-style:italic">Why: ' + esc(r.reason) + '</td></tr>';
      });
      h += '</table>';
    } else {
      h += '<p style="font-size:14px;color:#B45309;margin:6px 0">No recommendation recorded yet. In Andrew\'s panel, press "Record my recommendation" and say it.</p>';
    }
    h += '<a href="#" onclick="return false" style="display:block;text-align:center;background:#F5B324;color:#1F2937;text-decoration:none;font-weight:800;font-size:17px;padding:15px;border-radius:12px;margin:16px 0 6px">Confirm my fact find</a>';
    h += '<div style="text-align:center;font-size:13.5px;color:#475569">Questions first? ' + (d.advisorEmail ? 'Reply to this e-mail, or write to <b>' + esc(d.advisorEmail) + '</b>.' : 'Reply to this e-mail.') + '</div>';
    h += '<p style="margin:18px 0 0;font-size:14.5px">' + esc(d.advisor) + '<br><span style="color:#64748B">Your advisor, Ricky Rampersad Branch, Guardian Life of the Caribbean</span></p>';
    h += '<p style="margin:16px 0 0;font-size:11.5px;color:#94A3B8;line-height:1.5">This plan is based on what you told your advisor and is not a contract. Cover starts only when a policy is issued. Your information is private and is used only to look after your insurance.</p>';
    h += '</div></div>';
    return h;
  }

  function preview() {
    var d = data();
    var old = document.getElementById('rrbcp'); if (old) old.remove();
    var m = document.createElement('div'); m.id = 'rrbcp';
    m.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.6);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px';
    m.innerHTML = '<div style="background:#F1F5F9;border-radius:16px;max-width:680px;width:100%;padding:14px;box-shadow:0 20px 60px rgba(0,0,0,.4)">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;font:600 14px Inter,system-ui,sans-serif">' +
      '<span style="background:#F5B324;color:#1F2937;font-weight:800;font-size:11px;letter-spacing:.1em;padding:4px 9px;border-radius:999px">PREVIEW</span>' +
      '<span style="flex:1;color:#334155">To: ' + esc(d.email || 'the client\'s e-mail') + ' &middot; Subject: <b>' + esc(d.first || 'Your') + (d.first ? ', your' : '') + ' family plan from ' + esc(d.advisor) + '</b></span>' +
      '<button type="button" id="rrbcpX" style="font:inherit;font-weight:700;border:0;background:#0F172A;color:#fff;border-radius:9px;padding:8px 14px;cursor:pointer;min-height:40px">Close</button></div>' +
      emailHtml(d) +
      '<div style="font:13px Inter,system-ui,sans-serif;color:#64748B;margin-top:10px;text-align:center">Practice copy: nothing is sent. "Watch your family\'s plan" opens the presentation made from this fact find.</div></div>';
    document.body.appendChild(m);
    m.querySelector('#rrbcpX').onclick = function () { m.remove(); };
    m.addEventListener('click', function (e) { if (e.target === m) m.remove(); });
  }

  window.RRB_CLIENT_PLAN = { preview: preview, data: data, emailHtml: emailHtml, planLink: function () { return planLink(data()); } };
})();
