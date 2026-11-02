/* ─────────────────────────────────────────────────────────────────────────────
   AI FACT-FIND PARTNER, practice copy only (2 November 2026).

   Asked for by Ricky Rampersad: after the interview, the agent talks the fact
   find through with an AI partner that "will guide and populate the fact find
   … the data is going onto the form and they're doing the calculation, and it
   talks to the agent". He chose to test it on the practice copy before any
   agent's real fact find is touched.

   It appears only on /ffproject?guest=1&ai=1: the guest practice copy, with
   ai=1 so only people given that link see it. On any other address this file
   does nothing.

   Each thing the agent says (spoken or typed) goes to the fact find's Apps
   Script (stage ai_turn, apps-script/AiPartner.gs), which asks Claude. The
   answer comes back as values for fields and a few spoken sentences. Each
   value is put in its field the way typing would (the field's own input and
   change events), so the page's calculations, the progress bar and the
   practice auto-save all run. The panel keeps a running count of the turns
   and what they cost, so a test measures the real cost per fact find.

   Never filled: recommendations, the client's decision, signatures, the
   manager's sections. The practice copy sends nothing else to the branch.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.RRB_AI_PARTNER) return;
  var q = {};
  try { q = Object.fromEntries(new URLSearchParams(location.search)); } catch (e) {}
  if (!window.RRB_GUEST || q.ai !== '1') return;

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var TTS = window.speechSynthesis;
  var NEVER = /^(rec\d|dec\d|bm|mgr|dm|finalDecide|replaceCover|repDecl|ackRead|advisor|agent|clientSig|clientSign|notes$|appType)/;
  var A = { open: false, busy: false, muted: false, listening: false, history: [], turns: 0, cost: 0,
            tokens: { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 }, cat: null, voice: null, rec: null,
            sid: 'g' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36) };

  function S() { try { return (typeof state !== 'undefined' && state) ? state : {}; } catch (e) { return {}; } }
  function mode() { try { return (typeof MODE !== 'undefined') ? MODE : 'agent'; } catch (e) { return 'agent'; } }
  function endpoint() {
    try { if (typeof getEndpoint === 'function') return getEndpoint(); } catch (e) {}
    try { return CURRENT_ENDPOINT; } catch (e2) { return ''; }
  }
  function txt(el) { return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }

  /* ── The catalogue: every field the partner may fill, read off the page ─── */
  function labelFor(el) {
    var td = el.closest('td');
    if (td) {
      var tr = td.parentElement, table = td.closest('table'), idx = Array.prototype.indexOf.call(tr.children, td);
      var th = table && table.querySelector('thead tr') ? table.querySelector('thead tr').children[idx] : null;
      var row = (el.getAttribute('data-field').match(/\d+/) || [''])[0];
      return (txt(th) || el.getAttribute('data-field')) + (row ? ' (' + row + ')' : '');
    }
    var box = el.closest('.radio-group') ? el.closest('.radio-group').parentElement : el.parentElement;
    for (var i = 0; i < 3 && box; i++, box = box.parentElement) {
      var l = box.querySelector(':scope > label');
      if (l && !l.classList.contains('radio')) return txt(l);
    }
    return el.getAttribute('placeholder') || el.getAttribute('data-field');
  }
  function sectionOf(el) {
    var s = el.closest('[data-section]'); if (!s) return '';
    var h = s.querySelector('.section-header h2, .section-header h3, .section-title, .section-header');
    return txt(h).slice(0, 40);
  }
  function catalogue() {
    var seen = {}, out = [];
    document.querySelectorAll('[data-field]').forEach(function (el) {
      var k = el.getAttribute('data-field');
      if (!k || seen[k] || !/^[A-Za-z][A-Za-z0-9]*$/.test(k) || NEVER.test(k)) return;
      if (el.readOnly || el.disabled || el.type === 'hidden' || el.type === 'checkbox' || el.type === 'file') return;
      if (el.closest('[data-mode-only="manager"], .mgr-only')) return;
      seen[k] = 1;
      var f = { k: k, l: labelFor(el).replace(/\s*\*\s*$/, '').slice(0, 70), s: sectionOf(el) };
      if (el.tagName === 'SELECT') {
        f.t = 'choice';
        f.o = Array.prototype.slice.call(el.options).filter(function (o) { return o.value && !/^__/.test(o.value); })
          .map(function (o) { return o.value; }).slice(0, 40);
      } else if (el.type === 'radio') {
        f.t = 'choice';
        f.o = Array.prototype.slice.call(document.querySelectorAll('input[type="radio"][name="' + el.name + '"]'))
          .map(function (r) { return r.value; });
      } else if (el.tagName === 'TEXTAREA') f.t = 'text';
      else f.t = ({ number: 'number', date: 'date', email: 'email', tel: 'phone' })[el.type] || 'text';
      out.push(f);
    });
    return out;
  }
  function formNow() {
    var st = S(), o = {};
    (A.cat || []).forEach(function (f) { var v = st[f.k]; if (v != null && String(v).trim() !== '') o[f.k] = String(v).slice(0, 300); });
    return o;
  }
  function figures() {
    var o = {};
    document.querySelectorAll('.calc-value[id], .live-val[id]').forEach(function (el) {
      var v = txt(el); if (!v || /^TT\$\s*0(\.00)?$/.test(v)) return;
      var p = el.parentElement, l = p && p.querySelector('.calc-label, .live-label, label');
      var name = txt(l) || el.id;
      if (!o[name]) o[name] = v;
    });
    var n = document.getElementById('needNarrative'); if (n && txt(n)) o['Need, in words'] = txt(n).slice(0, 400);
    return o;
  }

  /* ── Putting a value in a field ─────────────────────────────────────────── */
  function fieldEl(k) {
    return document.querySelector('[data-field="' + k + '"]') ||
           document.querySelector('input[type="radio"][name="' + k + '"]');
  }
  function openFor(el) {
    var sec = el.closest('[data-section]');
    if (sec && !sec.classList.contains('open')) {
      sec.classList.add('open');
      var h = sec.querySelector('.section-header'); if (h) h.setAttribute('aria-expanded', 'true');
    }
  }
  function flash(el) {
    var t = el.type === 'radio' ? (el.closest('.radio-group') || el) : el;
    try { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    t.classList.add('rrba-flash'); setTimeout(function () { t.classList.remove('rrba-flash'); }, 1800);
  }
  function put(k, v) {
    var el = fieldEl(k); if (!el) return false;
    v = String(v == null ? '' : v).trim();
    openFor(el);
    if (el.type === 'radio') {
      var rs = Array.prototype.slice.call(document.querySelectorAll('input[type="radio"][name="' + el.name + '"]'));
      var r = rs.filter(function (x) { return x.value === v; })[0] ||
              rs.filter(function (x) { return x.value.toLowerCase() === v.toLowerCase(); })[0];
      if (!r) return false;
      r.checked = true;
      r.dispatchEvent(new Event('input', { bubbles: true }));
      r.dispatchEvent(new Event('change', { bubbles: true }));
      flash(r); return true;
    }
    if (el.tagName === 'SELECT') {
      var opt = Array.prototype.slice.call(el.options).filter(function (o) { return o.value === v; })[0] ||
                Array.prototype.slice.call(el.options).filter(function (o) {
                  return o.value.toLowerCase() === v.toLowerCase() || txt(o).toLowerCase() === v.toLowerCase(); })[0];
      if (!opt) return false;
      v = opt.value;
    }
    if (el.type === 'number') { v = v.replace(/[^0-9.\-]/g, ''); if (v === '' || isNaN(+v)) return false; }
    if (el.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    flash(el); return true;
  }

  /* ── Speaking and listening ─────────────────────────────────────────────── */
  function pickVoice() {
    if (!TTS) return null;
    var vs = TTS.getVoices().filter(function (v) { return /^en/i.test(v.lang); });
    var pref = [/Andrew.*Natural/i, /Natural/i, /Google UK English Male/i, /Daniel/i, /Google US English/i, /Samantha/i];
    for (var p = 0; p < pref.length; p++) for (var j = 0; j < vs.length; j++) if (pref[p].test(vs[j].name)) return vs[j];
    return vs[0] || null;
  }
  function speak(t, audio) {
    if (window.RRB_SPEECH && !A.muted && t) return window.RRB_SPEECH.speak(t, audio);   // Andrew (andrew.js)
    return new Promise(function (res) {
      if (!TTS || A.muted || !t) return res();
      try {
        TTS.cancel();
        var u = new SpeechSynthesisUtterance(t);
        A.voice = A.voice || pickVoice(); if (A.voice) u.voice = A.voice;
        var done = false, fin = function () { if (!done) { done = true; res(); } };
        u.onend = fin; u.onerror = fin; setTimeout(fin, 1500 + t.length * 90);
        TTS.speak(u);
      } catch (e) { res(); }
    });
  }
  function listen() {
    if (!SR || A.busy) return;
    if (A.listening) { try { A.rec.stop(); } catch (e) {} return; }
    try { if (TTS) TTS.cancel(); } catch (e) {}
    var r = new SR(); A.rec = r;
    r.lang = 'en-US'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    var final = '';
    r.onresult = function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
      }
      $('in').value = (final + ' ' + interim).trim();
    };
    r.onend = function () { A.listening = false; ui(); if (final.trim()) send(final.trim()); };
    r.onerror = function (e) { A.listening = false; ui(); if (e.error === 'not-allowed') note('The microphone is blocked. Allow it in the browser, or type instead.'); };
    A.listening = true; ui();
    try { r.start(); } catch (e) { A.listening = false; ui(); }
  }

  /* ── A turn ─────────────────────────────────────────────────────────────── */
  function money(n) { return 'US$' + n.toFixed(n < 1 ? 3 : 2); }
  function send(said) {
    said = String(said || '').trim(); if (!said || A.busy) return;
    $('in').value = '';
    bubble('you', said);
    A.busy = true; ui();
    if (!A.cat) A.cat = catalogue();
    var payload = { stage: 'ai_turn', guest: true, sid: A.sid, said: said, catalogue: A.cat,
                    form: formNow(), figures: figures(), history: A.history.slice(-32) };
    fetch(endpoint(), { method: 'POST', cache: 'no-store', rrbAiPartner: true,
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        A.busy = false;
        if (!j || !j.ok) {
          var e = (j && j.error) || 'No answer.';
          if (/agent code required|unknown stage/i.test(e)) e = 'The AI partner is not switched on yet: AiPartner.gs has to be added to the fact find\'s Apps Script and a new version deployed.';
          note(e); ui(); return;
        }
        A.history.push({ r: 'agent', t: said }, { r: 'partner', t: j.say || '' });
        var placed = [], missed = [];
        (j.fill || []).forEach(function (f) { (put(f.field, f.value) ? placed : missed).push(f); });
        try { if (typeof calc === 'function') calc(); } catch (e) {}
        A.turns++; A.cost += +j.cost || 0;
        if (j.usage) Object.keys(A.tokens).forEach(function (k) { A.tokens[k] += +j.usage[k] || 0; });
        bubble('ai', j.say || '', placed, missed);
        A.missing = j.missing || [];
        if (j.focus) { var el = fieldEl(j.focus); if (el && !placed.length) { openFor(el); flash(el); } }
        ui();
        speak(j.say, j.audio);
      })
      .catch(function (err) { A.busy = false; note('Could not reach the AI partner (' + ((err && err.message) || err) + ').'); ui(); });
  }

  /* ── The panel ──────────────────────────────────────────────────────────── */
  function $(id) { return document.getElementById('rrba-' + id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function bubble(who, t, placed, missed) {
    var d = document.createElement('div'); d.className = 'rrba-b ' + who;
    var h = '<div class="t">' + esc(t) + '</div>';
    if (placed && placed.length) {
      h += '<div class="f">Filled: ' + placed.map(function (f) {
        var c = (A.cat || []).filter(function (x) { return x.k === f.field; })[0];
        return '<span>' + esc((c && c.l) || f.field) + ': <b>' + esc(f.value) + '</b></span>';
      }).join('') + '</div>';
    }
    if (missed && missed.length) h += '<div class="f miss">Could not place: ' + missed.map(function (f) { return esc(f.field + ' = ' + f.value); }).join(', ') + '</div>';
    d.innerHTML = h;
    $('log').appendChild(d); $('log').scrollTop = $('log').scrollHeight;
  }
  function note(t) { var d = document.createElement('div'); d.className = 'rrba-b note'; d.textContent = t; $('log').appendChild(d); $('log').scrollTop = $('log').scrollHeight; }
  function ui() {
    if (!$('panel')) return;
    $('mic').textContent = A.listening ? 'Listening… tap to stop' : (SR ? 'Speak' : 'No microphone here: type');
    $('mic').disabled = !SR || (A.busy && !A.listening);
    $('mic').classList.toggle('on', A.listening);
    $('send').disabled = A.busy;
    $('busy').style.display = A.busy ? 'block' : 'none';
    $('mute').textContent = A.muted ? 'Voice off' : 'Voice on';
    var tk = A.tokens.input + A.tokens.cacheWrite + A.tokens.cacheRead + A.tokens.output;
    $('cost').textContent = A.turns ? (A.turns + (A.turns === 1 ? ' turn' : ' turns') + ' · ' + tk.toLocaleString('en-US') +
      ' tokens · ' + money(A.cost) + ' so far (about TT$' + (A.cost * 6.8).toFixed(2) + ')') : 'Cost so far: nothing yet';
    $('left').innerHTML = (A.missing && A.missing.length) ? 'Still blank: ' + A.missing.map(esc).join(', ') : '';
  }
  function build() {
    var css = document.createElement('style');
    css.textContent =
      /* Two buttons that look and read differently (2 November 2026: "there must be a differentiation so persons
         can understand"): Dictation (teal, the Voice interview) asks the form's questions one by one; the AI partner
         (navy and gold) listens to you talk freely, fills, checks and works out the need. */
      '.rrba-fab,.rrbv-fab.rrba-dict{position:fixed;right:16px;z-index:9998;display:flex;align-items:center;gap:10px;border:0;cursor:pointer;' +
      'text-align:left;padding:10px 16px 10px 12px;border-radius:16px;width:min(300px,calc(100vw - 32px));min-height:56px}' +
      '.rrba-fab{bottom:84px;background:linear-gradient(135deg,#0F172A,#1E3A5F);color:#fff;box-shadow:0 10px 26px rgba(15,23,42,.35);' +
      'border:1.5px solid #F5B324}.rrba-fab svg{width:26px;height:26px;color:#F5B324;flex:none}' +
      '.rrbv-fab.rrba-dict{bottom:16px;background:#fff;color:#0F766E;border:1.5px solid #0F766E;box-shadow:0 8px 20px rgba(15,118,110,.2)}' +
      '.rrbv-fab.rrba-dict svg{width:24px;height:24px;flex:none}' +
      '.rrba-l{display:flex;flex-direction:column;gap:3px;font:700 15px/1.15 Inter,system-ui,sans-serif}' +
      '.rrba-l small{font:500 12.5px/1.3 Inter,system-ui,sans-serif;opacity:.9}' +
      '.rrba-fab .rrba-l small{color:#E2E8F0}' +
      '.rrba{position:fixed;right:16px;bottom:16px;z-index:10000;width:min(440px,calc(100vw - 32px));height:min(82vh,680px);' +
      'display:none;flex-direction:column;background:#fff;color:#0F172A;border-radius:18px;box-shadow:0 18px 50px rgba(15,23,42,.28);' +
      'font:15px/1.45 Inter,system-ui,sans-serif;overflow:hidden}.rrba.open{display:flex}' +
      '.rrba-h{background:#0F172A;color:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px}' +
      '.rrba-h b{flex:1;font-size:16px}.rrba-h button{background:transparent;border:1px solid rgba(255,255,255,.35);color:#fff;border-radius:8px;padding:5px 9px;font:inherit;font-size:13px;cursor:pointer}' +
      '.rrba-tag{background:#F5B324;color:#1F2937;font-size:11px;font-weight:800;letter-spacing:.08em;padding:3px 8px;border-radius:999px}' +
      '#rrba-log{flex:1;overflow:auto;padding:12px;background:#F8FAFC;display:flex;flex-direction:column;gap:8px}' +
      '.rrba-b{max-width:88%;padding:9px 12px;border-radius:14px}.rrba-b.you{align-self:flex-end;background:#0F766E;color:#fff;border-bottom-right-radius:4px}' +
      '.rrba-b.ai{align-self:flex-start;background:#fff;border:1px solid #E2E8F0;border-bottom-left-radius:4px}' +
      '.rrba-b.note{align-self:center;background:#FEF3C7;color:#78350F;font-size:13.5px;max-width:100%}' +
      '.rrba-b .f{margin-top:6px;font-size:13px;color:#0F766E;display:flex;flex-wrap:wrap;gap:4px 10px}.rrba-b .f.miss{color:#B45309}' +
      '#rrba-busy{display:none;font-size:13px;color:#475569;padding:4px 14px}' +
      '#rrba-left{font-size:12.5px;color:#475569;padding:0 14px}' +
      '.rrba-in{display:flex;gap:8px;padding:10px 12px 6px;border-top:1px solid #E2E8F0}' +
      '#rrba-in{flex:1;font:inherit;font-size:max(16px,1rem);padding:10px 12px;border:1px solid #94A3B8;border-radius:10px;resize:none;min-height:44px;max-height:120px}' +
      '.rrba-in button,.rrba-row button{font:inherit;font-weight:600;border-radius:10px;border:0;cursor:pointer;min-height:44px;padding:0 14px}' +
      '#rrba-send{background:#0F766E;color:#fff}#rrba-send:disabled{opacity:.5}' +
      '.rrba-row{display:flex;gap:8px;padding:0 12px 8px;align-items:center}#rrba-mic{flex:1;background:#E6FFFA;color:#0F766E;border:1px solid #99F6E4}' +
      '#rrba-mic.on{background:#DC2626;color:#fff;border-color:#DC2626}#rrba-mic:disabled{opacity:.55}' +
      '#rrba-mute{background:#F1F5F9;color:#0F172A}' +
      '#rrba-cost{font-size:12.5px;color:#334155;padding:6px 14px 10px;border-top:1px dashed #E2E8F0}' +
      '.rrba-flash{outline:3px solid #14B8A6 !important;outline-offset:2px;transition:outline .2s}' +
      '@media (max-width:600px){.rrba{left:8px;right:8px;bottom:8px;width:auto;height:70vh}.rrba-fab{right:12px;bottom:78px}' +
      '.rrbv-fab.rrba-dict{right:12px;bottom:12px}}';
    document.head.appendChild(css);

    var fab = document.createElement('button');
    fab.type = 'button'; fab.className = 'rrba-fab'; fab.id = 'rrba-fab';
    fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>' +
      '<span class="rrba-l">AI partner<small>Talk freely. It fills the form, checks the gaps and works out the need.</small></span>';
    document.body.appendChild(fab);

    var p = document.createElement('section');
    p.className = 'rrba'; p.id = 'rrba-panel'; p.setAttribute('aria-label', 'AI fact-find partner');
    p.innerHTML =
      '<div class="rrba-h"><b>AI fact-find partner</b><span class="rrba-tag">PRACTICE</span><button type="button" id="rrba-x">Close</button></div>' +
      '<div id="rrba-log" aria-live="polite"></div>' +
      '<div id="rrba-busy">Thinking…</div><div id="rrba-left"></div>' +
      '<div class="rrba-in"><textarea id="rrba-in" rows="1" placeholder="Tell it about the client, or answer its question"></textarea>' +
      '<button type="button" id="rrba-send">Send</button></div>' +
      '<div class="rrba-row"><button type="button" id="rrba-mic">Speak</button><button type="button" id="rrba-mute">Voice on</button></div>' +
      '<div id="rrba-cost"></div>';
    document.body.appendChild(p);

    fab.onclick = function () {
      A.open = true; p.classList.add('open'); fab.style.display = 'none';
      var vf = document.querySelector('.rrbv-fab'); if (vf) vf.style.visibility = 'hidden';
      if (!A.cat) A.cat = catalogue();
      if (!$('log').children.length) {
        var hi = 'Hi, I\'m your fact-find partner. Tell me about the client in your own words, as much or as little as you like. I\'ll fill the fact find as you go, read it back to you, work out the need and tell you what\'s still missing.';
        bubble('ai', hi); speak(hi);
      }
      ui(); setTimeout(function () { $('in').focus(); }, 50);
    };
    $('x').onclick = function () {
      A.open = false; p.classList.remove('open'); fab.style.display = '';
      var vf = document.querySelector('.rrbv-fab'); if (vf) vf.style.visibility = '';
      try { if (TTS) TTS.cancel(); if (A.rec) A.rec.stop(); } catch (e) {}
    };
    $('send').onclick = function () { send($('in').value); };
    $('in').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send($('in').value); } });
    $('mic').onclick = listen;
    $('mute').onclick = function () { A.muted = !A.muted; try { if (A.muted && TTS) TTS.cancel(); } catch (e) {} ui(); };
    if (TTS && TTS.onvoiceschanged !== undefined) TTS.onvoiceschanged = function () { A.voice = null; };
    labelDictation(0);
    ui();
  }
  function labelDictation(n) {
    var vf = document.querySelector('.rrbv-fab');
    if (!vf) { if (n < 20) setTimeout(function () { labelDictation(n + 1); }, 300); return; }
    var svg = vf.querySelector('svg'), span = vf.querySelector('span');
    if (span) span.outerHTML = '<span class="rrba-l">Dictation<small>It asks each question in turn. You answer.</small></span>';
    vf.classList.add('rrba-dict');
    var hd = document.querySelector('.rrbv-hd b'); if (hd) hd.textContent = 'Dictation';
    var stack = function () {
      var f = $('fab') || document.getElementById('rrba-fab'), r = vf.getBoundingClientRect();
      if (f && r.height) f.style.bottom = Math.round(innerHeight - r.top + 10) + 'px';
    };
    stack(); setTimeout(stack, 300); window.addEventListener('resize', stack);
  }

  function boot() { if (mode() !== 'agent') return; build(); }
  window.RRB_AI_PARTNER = { send: send, _catalogue: catalogue, _figures: figures, _put: put, _state: A };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 700); });
  else setTimeout(boot, 700);
})();
