/* FactFind360 — the redesigned fact find. A new shell over the live form.
 *
 * On only for a device switched to it (ffproject?ui=next; ?ui=classic goes back;
 * ?theme=plum|sapphire|ember|reef picks the colours). It never copies a field:
 * every input, calculator, gate, PDF and submission is the live form's own, so
 * the record that reaches the branch is the same whichever layout typed it.
 *
 * What the shell changes, all of it presentation:
 *   - the 292px header becomes a 56px bar with the shield in the theme's own
 *     colours, the client's name, the save state and one menu for the actions;
 *   - one section per screen instead of eleven stacked accordions;
 *   - the stage list opens as a sheet on a phone and sits beside the form on a
 *     laptop, ticks and all, and goes through the form's own buttons and gates;
 *   - the three things that floated over the foot of the page (totals, RAI,
 *     voice) and the Next buttons become one bar: Back, totals, Voice, RAI, Next;
 *   - Sign off opens on a checklist of anything still missing, each one a tap
 *     away, before the agent reaches Submit;
 *   - a submission pressed with no signal is held on the phone and sent once
 *     signal returns (only when the request never left the phone, so never twice).
 */
(function () {
  'use strict';
  if (window.__ffx) return; window.__ffx = 1;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function safe(fn, d) { try { return fn(); } catch (e) { return d; } }
  function isAgent() { return safe(function () { return MODE === 'agent'; }, true); }

  var STAGES = [
    { name: 'Get started', secs: [1, 2] },
    { name: 'Family',      secs: [3] },
    { name: 'Finances',    secs: [4, 5, 6] },
    { name: 'Needs',       secs: [7, 8, 9] },
    { name: 'Advice',      secs: [10] },
    { name: 'Sign off',    secs: [11] }
  ];
  function sec(n) { return $('section.section[data-section="' + n + '"]'); }
  function visible(n) { var s = sec(n); return !!s && s.style.display !== 'none'; }
  function order() { var o = []; for (var n = 1; n <= 11; n++) if (visible(n)) o.push(n); return o; }
  function current() { var s = $('section.section.open'); return s ? +s.getAttribute('data-section') : order()[0]; }
  function stageOf(n) { for (var i = 0; i < STAGES.length; i++) if (STAGES[i].secs.indexOf(n) > -1) return i; return 0; }
  function titleOf(n) { var h = $('section.section[data-section="' + n + '"] .section-title h2'); return h ? h.textContent.trim() : ''; }
  function clientName() {
    var v = safe(function () { return state.clientName || state.fullName || state.adviceClientName; }, '');
    if (!v) { var i = $('[data-field="fullName"]') || $('[data-field="adviceClientName"]'); v = i && i.value; }
    return (v || '').trim();
  }

  var MARK = '<svg class="fx-mark" viewBox="0 0 88 88" aria-hidden="true"><defs><linearGradient id="fxg" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" style="stop-color:var(--x-mark1)"/><stop offset=".55" style="stop-color:var(--x-act)"/><stop offset="1" style="stop-color:var(--x-ink)"/></linearGradient></defs>' +
    '<path d="M44 9L73 21.5V41C73 60.5 60.5 72 44 78.5C27.5 72 15 60.5 15 41V21.5Z" fill="url(#fxg)"/>' +
    '<path d="M30 44L39.5 53.5L58 32.5" style="stroke:var(--x-ink)" stroke-width="6.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M30 44L39.5 53.5L58 32.5" stroke="#fff" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON = {
    menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    mic:  '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    spark:'<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    x:    '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    tick: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>'
  };

  var bar, prog, dock, sheet, menu, scrim;

  /* ---------- top bar ---------- */
  function buildBar() {
    bar = el('header', 'fx-bar');
    bar.innerHTML =
      '<div class="fx-brand">' + MARK + '<div class="fx-brand-t"><b>Fact find</b><span class="fx-client"></span></div></div>' +
      '<span class="fx-save" aria-live="polite"></span>' +
      '<button type="button" class="fx-icon fx-menu-btn" aria-label="Menu">' + ICON.menu + '</button>';
    prog = el('button', 'fx-prog');
    prog.type = 'button';
    prog.setAttribute('aria-label', 'Show all stages');
    prog.innerHTML = '<span class="fx-prog-t"><span class="fx-stage"></span><span class="fx-sec"></span></span>' +
      '<span class="fx-prog-p"><b></b> done ' + ICON.list + '</span><span class="fx-meter"><i></i></span>';
    var hdr = $('.app-header');
    document.body.insertBefore(prog, document.body.firstChild);
    document.body.insertBefore(bar, document.body.firstChild);
    $('.fx-menu-btn', bar).onclick = openMenu;
    prog.onclick = function () { if (window.innerWidth < 1024) openSheet(); };
    // The live form keeps writing its own save note; mirror it.
    var ss = document.getElementById('saveStatus');
    if (ss) { var mirror = function () { $('.fx-save', bar).textContent = ss.textContent.replace(/\s+/g, ' ').trim(); }; mirror(); new MutationObserver(mirror).observe(ss, { childList: true, characterData: true, subtree: true }); }
  }

  /* ---------- menu: the header's own buttons, one tap away ---------- */
  function openMenu() {
    if (!menu) {
      menu = el('div', 'fx-menu');
      menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', 'Menu');
      var items = $$('.app-header .header-actions > a, .app-header .header-actions > button').filter(function (b) { return getComputedStyle(b).display !== 'none'; });
      menu.innerHTML = '<div class="fx-sheet-h"><b>Menu</b><button type="button" class="fx-icon" data-close aria-label="Close">' + ICON.x + '</button></div>';
      var list = el('div', 'fx-menu-list');
      items.forEach(function (b) {
        var m = el('button', 'fx-menu-item'); m.type = 'button';
        m.textContent = b.textContent.replace(/[←+]/g, '').trim();
        m.onclick = function () { closeAll(); b.click(); };
        list.appendChild(m);
      });
      var classic = el('button', 'fx-menu-item fx-menu-quiet'); classic.type = 'button';
      classic.textContent = 'Switch back to the classic layout';
      classic.onclick = function () { localStorage.setItem('ff-ui', 'classic'); location.reload(); };
      list.appendChild(classic);
      menu.appendChild(list);
      document.body.appendChild(menu);
      menu.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeAll(); });
    }
    showScrim(); menu.classList.add('on');
  }

  /* ---------- stage sheet / rail: the form's own nav, restyled ---------- */
  function buildSheet() {
    sheet = el('aside', 'fx-sheet');
    sheet.setAttribute('aria-label', 'Stages');
    sheet.innerHTML = '<div class="fx-sheet-h"><b>Your fact find</b><button type="button" class="fx-icon" data-close aria-label="Close">' + ICON.x + '</button></div>';
    var nav = document.getElementById('sectionNav');
    if (nav) sheet.appendChild(nav);
    var c = document.getElementById('appContainer');
    (c || document.body).insertBefore(sheet, c ? c.firstChild : null);
    sheet.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) return closeAll();
      if (e.target.closest('#sectionNav button')) setTimeout(function () { if (window.innerWidth < 1024) closeAll(); paint(); }, 60);
    });
  }
  function openSheet() { showScrim(); sheet.classList.add('on'); }
  function showScrim() {
    if (!scrim) { scrim = el('div', 'fx-scrim'); scrim.onclick = closeAll; document.body.appendChild(scrim); }
    scrim.classList.add('on'); document.documentElement.classList.add('fx-lock');
  }
  function closeAll() {
    [sheet, menu, scrim].forEach(function (x) { if (x) x.classList.remove('on'); });
    document.documentElement.classList.remove('fx-lock');
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });

  /* ---------- one section per screen ---------- */
  function openOnly(n) {
    $$('section.section.open').forEach(function (s) { if (+s.getAttribute('data-section') !== n) s.classList.remove('open'); });
    var s = sec(n); if (s && !s.classList.contains('open')) s.classList.add('open');
    safe(function () { refreshSigPadsInOpenSections(); });
    safe(function () { calc(); });
  }
  // A tap on a section's title would close the only section on screen.
  document.addEventListener('click', function (e) {
    var h = e.target.closest('section.section .section-header');
    if (h && document.documentElement.classList.contains('fx')) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  /* ---------- the dock ---------- */
  function buildDock() {
    dock = el('nav', 'fx-dock');
    dock.setAttribute('aria-label', 'Form navigation');
    dock.innerHTML =
      '<button type="button" class="fx-back" aria-label="Back">' + ICON.back + '<span>Back</span></button>' +
      '<button type="button" class="fx-totals" aria-label="Show the live totals"><span class="fx-tl">Cover gap</span><b class="fx-tv">TT$ 0</b></button>' +
      '<button type="button" class="fx-icon fx-voice" aria-label="Voice interview">' + ICON.mic + '</button>' +
      '<button type="button" class="fx-icon fx-rai" aria-label="RAI coach">' + ICON.spark + '<i class="fx-badge" hidden></i></button>' +
      '<button type="button" class="fx-next"><span>Next</span>' + ICON.next + '</button>';
    document.body.appendChild(dock);
    document.body.classList.add('fx-docked');
    $('.fx-back', dock).onclick = function () {
      var o = order(), i = o.indexOf(current());
      if (i > 0) { openOnly(o[i - 1]); safe(function () { updateProgress(); }); top(); paint(); }
    };
    $('.fx-next', dock).onclick = function () {
      var n = current(), o = order();
      if (o.indexOf(n) === o.length - 1) { var sb = $('#submitBtn') || $('section.section[data-section="11"] .btn-primary'); if (sb) sb.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      if (typeof goNext === 'function') goNext(n); else openOnly(o[o.indexOf(n) + 1]);
      setTimeout(function () { var m = current(); if (m !== n) top(); else { var g = $('section.section.open .section-actions'); if (g) g.scrollIntoView({ behavior: 'smooth', block: 'center' }); } paint(); }, 80);
    };
    $('.fx-totals', dock).onclick = function () { document.body.classList.toggle('fx-show-totals'); };
    $('.fx-voice', dock).onclick = function () { var f = $('.rrbv-fab'); if (f) f.click(); };
    $('.fx-rai', dock).onclick = function () { var f = document.getElementById('coachFab'); if (f) f.click(); };
    var gap = document.getElementById('lbGap'), badge = document.getElementById('coachBadge');
    var mirror = function () {
      if (gap) $('.fx-tv', dock).textContent = gap.textContent.trim();
      if (badge) { var n = parseInt(badge.textContent, 10) || 0, b = $('.fx-badge', dock); b.hidden = !n; b.textContent = n; }
    };
    mirror();
    [gap, badge].forEach(function (x) { if (x) new MutationObserver(mirror).observe(x, { childList: true, characterData: true, subtree: true }); });
  }
  function top() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

  /* ---------- Sign off: what is still missing ---------- */
  function review() {
    var s11 = sec(11); if (!s11) return;
    var box = $('.fx-review', s11);
    if (!box) { box = el('div', 'fx-review'); var body = $('.section-body', s11); if (body) body.insertBefore(box, body.firstChild); }
    var rows = [];
    order().forEach(function (n) {
      if (n === 11) return;
      var miss = safe(function () { return sectionGateMissing(n) || []; }, []);
      if (miss.length) rows.push({ n: n, miss: miss });
    });
    if (!rows.length) { box.className = 'fx-review ok'; box.innerHTML = '<b>' + ICON.tick + 'Everything required is filled in.</b><span>Read the acknowledgement with your client, take both signatures, then submit.</span>'; return; }
    box.className = 'fx-review';
    box.innerHTML = '<b>Before you submit: ' + rows.length + ' section' + (rows.length > 1 ? 's need' : ' needs') + ' something</b>' +
      rows.map(function (r) {
        var labels = r.miss.map(function (m) { return typeof m === 'string' ? m : (m && (m.label || m.l)) || ''; }).filter(Boolean);
        return '<div class="fx-rv-row"><div><strong>' + esc(titleOf(r.n)) + '</strong><span>' + esc(labels.slice(0, 3).join(' · ')) + (labels.length > 3 ? ' and ' + (labels.length - 3) + ' more' : '') + '</span></div>' +
          '<button type="button" data-go="' + r.n + '">Fix</button></div>';
      }).join('');
    $$('button[data-go]', box).forEach(function (b) { b.onclick = function () { openOnly(+b.getAttribute('data-go')); top(); paint(); }; });
  }

  /* ---------- keep the shell in step with the form ---------- */
  function paint() {
    var n = current(), o = order(), i = o.indexOf(n), g = stageOf(n);
    var vs = STAGES.filter(function (s) { return s.secs.some(visible); });
    var gi = vs.indexOf(STAGES[g]);
    $('.fx-stage', prog).textContent = 'Stage ' + (gi + 1) + ' of ' + vs.length + ' · ' + STAGES[g].name;
    $('.fx-sec', prog).textContent = titleOf(n);
    var fill = document.getElementById('progressFill'), p = fill ? parseInt(fill.style.width, 10) || 0 : 0;
    $('.fx-prog-p b', prog).textContent = p + '%';
    $('.fx-meter i', prog).style.width = p + '%';
    var cn = clientName();
    $('.fx-client', bar).textContent = cn || 'New client';
    if (dock) {
      $('.fx-back', dock).disabled = i <= 0;
      var last = i === o.length - 1;
      $('.fx-next span', dock).textContent = last ? 'Submit' : 'Next';
      dock.classList.toggle('fx-last', last);
    }
    // Advice-only hides sections 2-9: their stage names go with them.
    $$('#sectionNav [data-nav-sec]').forEach(function (b) { b.hidden = !visible(+b.getAttribute('data-nav-sec')); });
    $$('#sectionNav .nav-stage').forEach(function (h) { var g = h.nextElementSibling; h.hidden = !!g && !$$('[data-nav-sec]', g).some(function (b) { return !b.hidden; }); });
    document.documentElement.setAttribute('data-fx-sec', n);
    if (n === 11) review();
  }

  var queueEl;
  var DB = 'ffx-outbox', STORE = 'q';
  function idb(fn) {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
      r.onerror = function () { rej(r.error); };
      r.onsuccess = function () {
        var tx = r.result.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE), out;
        out = fn(st);
        tx.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
        tx.onerror = function () { rej(tx.error); };
      };
    });
  }
  function qAdd(item) { return idb(function (st) { return st.put(item); }); }
  function qAll() { return idb(function (st) { return st.getAll(); }); }
  function qDel(id) { return idb(function (st) { return st.delete(id); }); }

  var realFetch = window.fetch.bind(window);
  function isSubmission(url, opt) {
    if (!opt || String(opt.method || '').toUpperCase() !== 'POST' || typeof opt.body !== 'string') return false;
    if (!/script\.google(usercontent)?\.com\/macros/.test(String(url))) return false;
    try { var j = JSON.parse(opt.body); return j && (j.stage === 'agent_submit' || j.stage === 'manager_review') && j.submissionId; } catch (e) { return false; }
  }
  window.fetch = function (url, opt) {
    if (navigator.onLine === false && isSubmission(url, opt)) {
      var j = JSON.parse(opt.body);
      var item = { id: j.submissionId + ':' + j.stage, url: String(url), body: opt.body, client: j.clientName || j.fullName || '', stage: j.stage, at: Date.now() };
      return qAdd(item).then(function () {
        showQueue();
        return new Response(JSON.stringify({ ok: false,
          error: 'No signal on this phone. The fact find is saved here and will send by itself as soon as signal returns. You do not need to press Submit again.' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } });
      });
    }
    return realFetch(url, opt);
  };
  function showQueue() {
    return qAll().then(function (items) {
      if (!queueEl) {
        queueEl = document.createElement('div');
        queueEl.className = 'ffx-queue';
        queueEl.setAttribute('role', 'status');
        document.body.appendChild(queueEl);
      }
      if (!items.length) { queueEl.hidden = true; return; }
      queueEl.hidden = false;
      queueEl.innerHTML = '<b>' + items.length + ' waiting to send</b> · held on this phone, sends by itself when signal returns' +
        (navigator.onLine ? ' <button type="button">Send now</button>' : '');
      var b = $('button', queueEl); if (b) b.onclick = flush;
    }).catch(function () {});
  }
  var flushing = false;
  function flush() {
    if (flushing || navigator.onLine === false) return;
    flushing = true;
    qAll().then(function (items) {
      return items.reduce(function (p, it) {
        return p.then(function () {
          return realFetch(it.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: it.body, redirect: 'follow' })
            .then(function (r) { return r.json(); })
            .then(function (out) {
              if (out && out.ok) {
                return qDel(it.id).then(function () {
                  note('Sent: ' + (it.client || 'the fact find') + (out.nextReviewerName ? ' · routed to ' + out.nextReviewerName : '') + (out.submissionId ? ' · ID ' + out.submissionId : ''), true);
                });
              }
              note('Could not send ' + (it.client || 'the fact find') + ': ' + ((out && out.error) || 'the server said no') + '. It is still held here.', false);
            })
            .catch(function () { /* still no real connection; keep it */ });
        });
      }, Promise.resolve());
    }).finally(function () { flushing = false; showQueue(); });
  }
  function note(msg, ok) {
    var n = document.createElement('div');
    n.className = 'ffx-note' + (ok ? ' ok' : '');
    n.setAttribute('role', 'status');
    n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(function () { n.classList.add('go'); }, 9000);
    setTimeout(function () { n.remove(); }, 9600);
  }
  window.addEventListener('online', function () { showQueue(); flush(); });
  window.addEventListener('offline', showQueue);


  /* ---------- start ---------- */
  function start() {
    document.documentElement.classList.add('fx');
    buildBar(); buildSheet();
    if (isAgent()) { document.documentElement.classList.add('fx-agent'); buildDock(); }
    if (!$('section.section.open')) {
      var o = order(), first = o[0];
      for (var k = 0; k < o.length; k++) { if (!safe(function () { return isSectionComplete(o[k]); }, false)) { first = o[k]; break; } }
      openOnly(first);
    } else openOnly(current());
    paint();
    var t; var later = function () { clearTimeout(t); t = setTimeout(paint, 150); };
    new MutationObserver(later).observe(document.getElementById('appContainer') || document.body, { attributes: true, attributeFilter: ['class', 'style'], subtree: true });
    document.addEventListener('input', later, true);
    window.addEventListener('resize', function () { if (window.innerWidth >= 1024) closeAll(); });
    showQueue().then(flush);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 0); });
  else setTimeout(start, 0);
})();
