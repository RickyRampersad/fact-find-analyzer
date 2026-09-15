/* The delivery survey. Served from the branch's own domain so the client sees
   the branch, not a Google warning banner. Answers still go to Apps Script. */
(function () {
  var ENDPOINT = 'https://script.google.com/macros/s/' +
    'AKfycbx776ORwmwhm2u4vx2YGQPC6bRR9gTQ-Y-Yc1up0FNGkCKGaQdet-APT1PJsrAxxJ3dsQ/exec';
  var QKEY = 'rrbUnsentSurveys';
  var $ = function (id) { return document.getElementById(id); };
  var qs = new URLSearchParams(location.search);
  var esc = function (s) { return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

  var client  = (qs.get('c') || '').trim();
  var advisor = (qs.get('a') || '').trim();

  /* Their own name on it, and the advisor's, exactly as the emailed version
     did. Both optional - the survey still reads correctly without either. */
  $('head').innerHTML = client
    ? 'How did the delivery go, ' + esc(client) + '?'
    : 'How did the delivery go?';
  $('sub').innerHTML = advisor
    ? 'About ' + esc(advisor) + '&rsquo;s delivery of your policy. Two minutes.'
    : 'About the delivery of your policy. Two minutes.';
  if (advisor) $('overallQ').textContent = 'Overall, how was the delivery?';

  /* Arriving from a star tapped in the email: that answer is already given, so
     show it chosen rather than asking again. The whole point of the inline
     star is that one tap is all it takes. */
  var pre = (qs.get('r') || '').trim();
  if (/^[1-5]$/.test(pre)) {
    var el = document.querySelector('input[name="rating"][value="' + pre + '"]');
    if (el) el.checked = true;

    /* And bank it now, before they answer anything else. They have already
       given that answer - they gave it in the email. If they close the page
       here, the branch still has the score, which is the number that matters
       most and the one most likely to be lost. The full survey posts
       separately; the server keeps that one when it arrives. */
    try {
      var early = new URLSearchParams({
        action: 'deliveryrating', rating: pre,
        policy: qs.get('p') || '', token: qs.get('t') || '',
        client: client, advisor: advisor,
        at: new Date().toISOString(), source: 'email_star'
      });
      fetch(ENDPOINT, { method: 'POST', body: early, keepalive: true }).catch(function () {});
    } catch (e) {}
  }

  function answers() {
    var pick = function (n) {
      var el = document.querySelector('input[name="' + n + '"]:checked');
      return el ? el.value : '';
    };
    return {
      action: 'deliverysurvey',
      ref: 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      policy: qs.get('p') || '', token: qs.get('t') || '',
      client: client, advisor: advisor,
      clear: pick('clear'), premium: pick('premium'), docs: pick('docs'),
      rating: pick('rating'), note: ($('note').value || '').trim(),
      at: new Date().toISOString(), source: 'delivery_survey'
    };
  }

  function queue() { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); }
                     catch (e) { return []; } }
  function queueSet(a) { try { localStorage.setItem(QKEY, JSON.stringify(a.slice(-10))); }
                         catch (e) {} }
  function queueAdd(f) { var q = queue();
    for (var i = 0; i < q.length; i++) if (q[i].ref === f.ref) return;
    q.push(f); queueSet(q); }
  function queueDrop(ref) { queueSet(queue().filter(function (x) { return x.ref !== ref; })); }

  /* Same lesson as the booking form: thank them first, deliver behind them.
     A client who answered five questions should not then watch a spinner
     while a sleeping server wakes up. */
  function send(f) {
    queueAdd(f);
    var done = false;
    var settle = function (ok) { if (done) return; done = true; if (ok) queueDrop(f.ref); };
    var t = setTimeout(function () { settle(false); }, 12000);
    try {
      fetch(ENDPOINT, { method: 'POST', body: new URLSearchParams(f), keepalive: true })
        .then(function (r) { clearTimeout(t); settle(!!(r && (r.ok || r.type === 'opaque'))); })
        .catch(function () { clearTimeout(t); settle(false); });
    } catch (e) { clearTimeout(t); settle(false); }
  }

  function thanks() {
    $('in').innerHTML =
      '<div class="done"><div class="tick">&#10003;</div>' +
      '<h2>Thank you' + (client ? ', ' + esc(client) : '') + '.</h2>' +
      '<p>That goes straight to the branch manager. If anything was unclear, ' +
      (advisor ? esc(advisor) + ' will' : 'somebody will') + ' be in touch.</p></div>';
  }

  $('f').addEventListener('submit', function (e) {
    e.preventDefault();
    $('go').disabled = true;
    var f = answers();
    thanks();
    send(f);
  });

  /* Anything an earlier visit could not land. */
  try {
    var pending = queue();
    if (pending.length) setTimeout(function () {
      pending.forEach(function (f) { send(f); });
    }, 2000);
  } catch (e) {}
})();
