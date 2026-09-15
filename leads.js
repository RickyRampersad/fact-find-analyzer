/* THE LEAD DESK — the working half.

   Everything here hangs off one idea: the prospect already told us what is on
   their mind, and a call that repeats their own words back is a different call
   from one that opens with a product. So the script is generated from their
   answers, not chosen from a folder.

   What it deliberately does NOT do: price anything, recommend anything, or put
   a product in the advisor's mouth. Insurance Act 2018 s.132 and Schedule 11
   B2 put suitability behind a fact find, and nothing has been fact-found at
   the point of this call. The only job of the call is the appointment. */

(function(){
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbx776ORwmwhm2u4vx2YGQPC6bRR9gTQ-Y-Yc1up0FNGkCKGaQdet-APT1PJsrAxxJ3dsQ/exec';
  var $  = function(id){ return document.getElementById(id); };
  var esc = function(s){ return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };

  /* What each thing they ticked means for the call: their words back, and the
     one question worth asking about it. The question never advises - it asks. */
  var WANTS = {
    'My family, if something happens to me': {
      back:'your family, if something happened to you',
      ask :'Who depends on your income right now, and for how long would they need it?' },
    'The house and the mortgage': {
      back:'the house and the mortgage',
      ask :'How many years are left on it, and is it in one name or two?' },
    "My children's education": {
      back:"your children's education",
      ask :'How old are they now, and how far do you want to see them through?' },
    'Retiring properly': {
      back:'retiring properly',
      ask :'What age are you aiming at, and what are you putting aside today?' },
    'If I got seriously ill': {
      back:'what happens if you got seriously ill',
      ask :"If you couldn't work for six months, how long would the household hold?" },
    'My business or my partner': {
      back:'the business, and your partner in it',
      ask :"If one of you wasn't there next month, what happens to the other's share?" },
    'Check what I already have': {
      back:'checking what you already have',
      ask :'Do you know roughly what your current policies cover? Bring them and we will read them together.' },
    'Not sure — start from scratch': {
      back:'that you are not sure where to start',
      ask :'That is the most common answer there is. We start from what you would want protected first.' }
  };

  function hrs(iso){
    var t = new Date(iso).getTime();
    if(!t) return null;
    return Math.max(0, (Date.now()-t)/3600000);
  }
  function waitText(h){
    if(h==null) return ['—',''];
    if(h < 1)  return [Math.round(h*60)+'m',''];
    if(h < 48) return [Math.round(h)+'h', h>=24?'warn':''];
    return [Math.round(h/24)+'d','bad'];
  }
  function greeting(){
    var h=new Date().getHours();
    return h<12?'Good morning':h<17?'Good afternoon':'Good evening';
  }
  function firstName(n){ return String(n||'').trim().split(/\s+/)[0] || 'there'; }
  function telHref(p){ return 'tel:'+String(p||'').replace(/[^\d+]/g,''); }
  function waHref(p, msg){
    var d = String(p||'').replace(/\D/g,'');
    if(d.length === 7) d = '1868'+d;              /* a local number, dialled properly */
    else if(d.length === 10 && d.indexOf('868')===0) d = '1'+d;
    return 'https://wa.me/'+d+'?text='+encodeURIComponent(msg);
  }

  /* ── THE SCRIPT ──────────────────────────────────────────────────────── */
  function buildScript(L){
    var f = firstName(L.name);
    var picks = String(L.wants||'').split('|').map(function(s){ return s.trim(); }).filter(Boolean);
    var backs = picks.map(function(p){ return WANTS[p] && WANTS[p].back; }).filter(Boolean);
    var asks  = picks.map(function(p){ return WANTS[p] && WANTS[p].ask;  }).filter(Boolean);
    var applying = String(L.intent||'').toLowerCase().indexOf('apply') > -1;
    var adv = L.advisor || 'your advisor';

    var backLine = backs.length === 0 ? 'you wanted to talk something through'
                 : backs.length === 1 ? backs[0]
                 : backs.slice(0,-1).join(', ') + ' and ' + backs[backs.length-1];

    var open = greeting() + ', is that ' + f + '? ' + adv + ' here, from Guardian Life — '
             + "Ricky Rampersad's branch. You put your number in on our page "
             + (hrs(L.at) != null && hrs(L.at) < 24 ? 'earlier today' : 'the other day')
             + ' and asked me to call. Is now alright, or have I caught you at a bad time?';

    var reflect = 'You told me what was on your mind was ' + backLine + '. '
                + (applying
                    ? 'You also said you wanted to get an application started.'
                    : 'You said you wanted to meet first and work through it.');

    var close = 'What I would do is sit with you for about forty minutes and put the '
              + 'numbers on paper — what you would want protected, and what that '
              + 'actually costs. Nothing to sign on the day and nothing to buy. '
              + 'You said ' + (L.when||'this week').toLowerCase()
              + (L.tod ? ', ' + String(L.tod).toLowerCase() : '') + '. Does that still work?';

    var objections = [
      ['“I am busy right now.”',
       'That is exactly why I would rather fix a time than keep calling you. '
       + 'Fifteen minutes on the phone or forty in person — whichever is easier.'],
      ['“Just send me some information.”',
       'I can, but it would be the same information everybody gets. The version '
       + 'worth reading has your numbers in it, and I cannot write that without '
       + 'asking you a few things first.'],
      ['“How much is it going to cost?”',
       'I genuinely cannot tell you yet, and I would rather not guess at it. '
       + 'What it costs depends on what you are protecting. That is the meeting.'],
      ['“I already have something through work.”',
       'Good — bring it. Half of what I do is reading what somebody already has '
       + 'and telling them where it stops.']
    ];

    return { open:open, reflect:reflect, asks:asks, close:close, objections:objections,
             applying:applying };
  }

  function qualifyBlock(L){
    var known = [], missing = [];
    (L.income ? known : missing).push('income');
    (L.household ? known : missing).push('who depends on them');
    (L.mortgage !== undefined && L.mortgage !== '' ? known : missing).push('mortgage');
    (L.wants ? known : missing).push('what is on their mind');
    (L.intent ? known : missing).push('apply or meet first');
    return {known:known, missing:missing};
  }

  /* ── RENDER ──────────────────────────────────────────────────────────── */
  function leadCard(L, i){
    var h = hrs(L.at), w = waitText(h);
    var s = buildScript(L), q = qualifyBlock(L);
    var called = (L.calls||[]).length;
    var cls = called ? '' : (h!=null && h>=48 ? 'cold' : h!=null && h>=24 ? 'old' : '');
    var waMsg = firstName(L.name) + ', ' + (L.advisor||'') + ' here from Guardian Life — '
              + 'you asked me to call about ' + (String(L.wants||'').split('|')[0]||'').trim().toLowerCase()
              + '. When suits you?';

    var facts = [];
    if(L.income)    facts.push('income ' + esc(L.income));
    if(L.household) facts.push(esc(L.household) + ' depending on them');
    if(L.mortgage)  facts.push('mortgage ' + esc(L.mortgage));
    if(L.need)      facts.push('gap ' + esc(L.need));
    if(L.source)    facts.push(esc(L.source).replace(/_/g,' '));

    return '<div class="lead ' + cls + '" data-i="' + i + '">'
      + '<div class="lhead" data-toggle="' + i + '">'
      +   '<div><h3>' + esc(L.name || 'No name given') + '</h3>'
      +     '<div class="meta">' + esc(L.phone||'') + (L.intent ? ' &middot; ' + esc(L.intent) : '')
      +     (called ? ' &middot; ' + called + ' call' + (called>1?'s':'') + ' logged' : '')
      +     '</div></div>'
      +   '<div class="wait ' + w[1] + '"><b>' + w[0] + '</b><span>'
      +     (called ? 'since last' : 'waiting') + '</span></div>'
      + '</div>'
      + '<div class="body" hidden>'
      +   '<div class="acts">'
      +     '<a class="call" href="' + esc(telHref(L.phone)) + '">Call ' + esc(firstName(L.name)) + '</a>'
      +     '<a class="wa" href="' + esc(waHref(L.phone, waMsg)) + '" target="_blank" rel="noopener">WhatsApp</a>'
      +   '</div>'
      +   '<div class="said"><div class="k">What they told us</div><ul>'
      +     String(L.wants||'').split('|').map(function(x){ return x.trim(); })
              .filter(Boolean).map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('')
      +     (L.note ? '<li><em>&ldquo;' + esc(L.note) + '&rdquo;</em></li>' : '')
      +   '</ul>'
      +   (facts.length ? '<div class="facts"><span>' + facts.join('</span><span>') + '</span></div>' : '')
      +   '</div>'

      +   '<h4>Qualified on</h4>'
      +   '<div style="font-size:14px;color:var(--ink-2)">'
      +     (q.known.length ? 'We already know: <b style="color:var(--ink)">' + q.known.join(', ') + '</b>. ' : '')
      +     (q.missing.length ? 'Confirm on the call: <b style="color:var(--amber)">' + q.missing.join(', ') + '</b>.' : 'Nothing missing.')
      +   '</div>'

      +   '<h4>Open</h4><div class="script"><p>' + esc(s.open) + '</p></div>'
      +   '<h4>Say their words back</h4><div class="script"><p>' + esc(s.reflect) + '</p></div>'
      +   (s.asks.length ? '<h4>Ask — and then stop talking</h4><div class="script">'
            + s.asks.map(function(a){ return '<p>' + esc(a) + '</p>'; }).join('') + '</div>' : '')
      +   '<h4>Set the appointment</h4><div class="script"><p>' + esc(s.close) + '</p></div>'
      +   '<h4>If they push back</h4><div class="script">'
      +     s.objections.map(function(o){
              return '<p><em>' + esc(o[0]) + '</em><br>' + esc(o[1]) + '</p>'; }).join('')
      +   '</div>'

      +   '<div class="guard"><div class="k">Not on this call</div>'
      +     'No premium, no product, no recommendation — a recommendation needs a fact '
      +     'find behind it (Insurance Act 2018 s.132, Schedule 11 B2). Nothing is '
      +     '&ldquo;guaranteed&rdquo; that is not. If they press for a number, the honest '
      +     'answer is that the number comes out of the meeting.</div>'

      +   '<h4>Log the call</h4>'
      +   '<div class="log" data-log="' + i + '">'
      +     ['No answer','Left a message','Spoke — meeting booked','Spoke — call back',
       'Wrong number','Not interested']
            .map(function(o){ return '<button type="button" data-out="' + esc(o) + '">' + esc(o) + '</button>'; }).join('')
      +   '</div>'
      +   '<textarea placeholder="What came out of it (optional)" data-note="' + i + '"></textarea>'
      +   '<button class="save" data-save="' + i + '" disabled>Save the call</button>'
      +   (called ? '<div class="hist">' + (L.calls||[]).map(function(c){
              return '<div>' + esc(new Date(c.at).toLocaleString()) + ' — <b>' + esc(c.outcome) + '</b>'
                   + (c.note ? ' · ' + esc(c.note) : '') + '</div>'; }).join('') + '</div>' : '')
      + '</div></div>';
  }

  window.__renderLeads = function(leads, who){
    var uncalled = leads.filter(function(L){ return !(L.calls||[]).length; });
    var oldest = 0;
    uncalled.forEach(function(L){ var h=hrs(L.at); if(h!=null && h>oldest) oldest=h; });
    var overdue = uncalled.filter(function(L){ var h=hrs(L.at); return h!=null && h>=24; }).length;
    var w = waitText(uncalled.length ? oldest : null);

    $('wrap').innerHTML =
        '<div class="tally">'
      +   '<div class="t"><b>' + uncalled.length + '</b><span>to call</span></div>'
      +   '<div class="t ' + (overdue?'warn':'') + '"><b>' + overdue + '</b><span>over a day</span></div>'
      +   '<div class="t ' + w[1] + '"><b>' + w[0] + '</b><span>longest wait</span></div>'
      + '</div>'
      + (leads.length ? leads.map(leadCard).join('')
          : '<div class="note">No leads yet. They land here the moment somebody '
            + 'books from your prospect link.</div>');

    $('wrap').addEventListener('click', function(e){
      var t = e.target.closest('[data-toggle]');
      if(t){ var b = $('wrap').querySelectorAll('.body')[+t.dataset.toggle];
             if(b) b.hidden = !b.hidden; return; }
      var o = e.target.closest('[data-out]');
      if(o){
        var row = o.parentNode;
        [].forEach.call(row.querySelectorAll('button'), function(x){ x.classList.remove('on'); });
        o.classList.add('on');
        var i = row.dataset.log;
        $('wrap').querySelector('[data-save="'+i+'"]').disabled = false;
        return;
      }
      var s = e.target.closest('[data-save]');
      if(s) saveCall(+s.dataset.save, leads, who, s);
    });
  };

  function saveCall(i, leads, who, btn){
    var L = leads[i];
    var row = $('wrap').querySelector('[data-log="'+i+'"]');
    var sel = row && row.querySelector('button.on');
    if(!sel) return;
    var note = ($('wrap').querySelector('[data-note="'+i+'"]')||{}).value || '';
    btn.disabled = true; btn.textContent = 'Saving…';

    var url = ENDPOINT + '?action=logcall'
            + '&token=' + encodeURIComponent((who&&who.token)||'')
            + '&id='    + encodeURIComponent(L.id || L.at || '')
            + '&outcome=' + encodeURIComponent(sel.dataset.out)
            + '&note='  + encodeURIComponent(note)
            + '&_=' + Date.now();

    /* This one DOES read the reply. The prospect page posts blind and cannot
       tell a lost booking from a saved one; a call log that silently failed
       would put the branch right back in that position. */
    fetch(url, {cache:'no-store', redirect:'follow'})
      .then(function(r){ return r.json(); })
      .then(function(j){
        if(j && j.ok){
          btn.textContent = 'Saved';
          L.calls = (L.calls||[]).concat([{at:new Date().toISOString(),
                                           outcome:sel.dataset.out, note:note}]);
          setTimeout(load, 700);
        } else {
          btn.disabled = false; btn.textContent = 'Save the call';
          alert((j && j.error) || 'The branch server would not save that. Nothing was recorded.');
        }
      })
      .catch(function(){
        btn.disabled = false; btn.textContent = 'Save the call';
        alert('Could not reach the branch server. Nothing was recorded — try again.');
      });
  }

  /* ── LOAD ────────────────────────────────────────────────────────────── */
  function session(){
    try{ var o = JSON.parse(localStorage.getItem('rrbSession')||'null');
         return (o && o.token) ? o : null; }catch(e){ return null; }
  }

  function signInForm(msg){
    $('wrap').innerHTML =
        '<div class="note"><b>Sign in</b><br>'
      + 'Your agent number and the access code you use for the wall.'
      + '<input type="text" id="c" placeholder="Agent number" autocomplete="username">'
      + '<input type="password" id="p" placeholder="Access code" autocomplete="current-password">'
      + '<button class="save" id="si">Sign in</button>'
      + '<div class="err" id="e">' + esc(msg||'') + '</div></div>';
    $('si').addEventListener('click', function(){
      var c=$('c').value.trim(), p=$('p').value;
      if(!c||!p){ $('e').textContent='Both, please.'; return; }
      $('si').disabled=true; $('si').textContent='Checking…';
      fetch(ENDPOINT+'?action=login&code='+encodeURIComponent(c)+'&pw='+encodeURIComponent(p),
            {redirect:'follow'})
        .then(function(r){ return r.json(); })
        .then(function(j){
          if(j && j.ok){ try{ localStorage.setItem('rrbSession', JSON.stringify(j)); }catch(e){}
                         load(); }
          else { $('si').disabled=false; $('si').textContent='Sign in';
                 $('e').textContent=(j&&j.error)||'Incorrect number or access code.'; }
        })
        .catch(function(){ $('si').disabled=false; $('si').textContent='Sign in';
                           $('e').textContent='Could not reach the branch server.'; });
    });
  }

  function load(){
    var who = session();
    if(!who){ signInForm(); return; }
    $('who').textContent = who.name || who.code || '';
    fetch(ENDPOINT + '?action=leads&token=' + encodeURIComponent(who.token) + '&_=' + Date.now(),
          {cache:'no-store', redirect:'follow'})
      .then(function(r){ return r.json(); })
      .then(function(j){
        if(j && j.ok && j.leads){ window.__renderLeads(j.leads, who); return; }
        if(j && /sign in|token/i.test(String(j.error||''))){
          try{ localStorage.removeItem('rrbSession'); }catch(e){}
          signInForm('That session has expired.'); return;
        }
        /* The action is not on the branch server yet. Say so plainly, and show
           what the desk does with a worked example rather than an empty page -
           the point is to be able to judge it before it is switched on. */
        notYet(j && j.error);
      })
      .catch(function(){ notYet('Could not reach the branch server.'); });
  }

  function notYet(why){
    $('wrap').innerHTML =
        '<div class="note"><b>The lead list is not switched on at the branch server yet.</b><br>'
      + esc(why||'') + '<br><br>The desk itself is ready — here is exactly what it does, '
      + 'with one worked example.</div><div id="demo"></div>';
    var demo = [{
      id:'demo1', at:new Date(Date.now()-27*3600000).toISOString(),
      name:'Devon Ramkissoon', phone:'868 355 0199', advisor:'Varun',
      intent:'Meet first', when:'This week', tod:'Evening',
      wants:"The house and the mortgage | My children's education",
      income:'TT$138,000', household:'3', mortgage:'TT$900,000', need:'TT$1.4M',
      note:'Wife just went back to work, want to sort this out before year end.',
      source:'prospect_page', calls:[]
    }];
    /* __renderLeads rewrites #wrap, so the explanation above is replaced by the
       worked example. Put the explanation back on top of it afterwards. */
    var why_ = $('wrap').innerHTML;
    window.__renderLeads(demo, session());
    $('wrap').insertAdjacentHTML('afterbegin',
      '<div class="note" style="margin-bottom:16px"><b>Not switched on at the branch '
      + 'server yet.</b><br>The desk is ready. Below is a worked example of what an '
      + 'advisor sees when a lead lands.</div>');
  }

  load();
})();
