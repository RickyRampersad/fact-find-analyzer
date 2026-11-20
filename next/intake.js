/* A request for advice on one need, made on WhatsApp (HELP 868), opened in the fact find.
 *
 * The link comes in the branch's e-mail about the request:
 *   ffproject?ui=next&intake=ADV-yymmdd-nnn&s=<signature>
 * Only then does this file load. It reads that one request from the Service Questionnaire
 * project (Quotes.gs route q.adviceget, AdviceIntake.gs), and fills the fact find's own
 * "Specific Need Only" fields: the client's choice, name, number, e-mail and the need.
 * The advice itself (section 10) stays the advisor's. Nothing is submitted from here.
 *
 * If the device already holds another client, it asks before it clears anything, the same
 * guard as "+ New Client", so no client's details carry into another's fact find.
 */
(function () {
  'use strict';
  var SQ = 'https://script.google.com/macros/s/AKfycbxdW5mVcK6DZbq4qnCj1l1cJvjsTYWZ9UMH91H6yC_NrElNYpGd1vRyJH1W_1mcu61woQ/exec';
  var KEEP = 'ffx-intake';
  var q = new URLSearchParams(location.search), ref = q.get('intake') || '', sig = q.get('s') || '';

  function note(html, kind) {
    var n = document.createElement('div');
    n.className = 'ffx-intake-note ' + (kind || '');
    n.setAttribute('role', 'status');
    n.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:120px;z-index:96;width:min(92vw,560px);box-sizing:border-box;' +
      'background:#fff;border:1.5px solid ' + (kind === 'bad' ? '#C0262D' : '#1F5FD6') + ';border-radius:14px;padding:12px 40px 12px 14px;' +
      'font:500 14.5px/1.5 Inter,system-ui,sans-serif;color:#0E2240;box-shadow:0 16px 40px rgba(14,34,64,.16)';
    n.innerHTML = html + '<button type="button" aria-label="Close" style="position:absolute;top:6px;right:6px;width:32px;height:32px;border:0;background:none;font-size:20px;cursor:pointer;color:#566377">&times;</button>';
    n.querySelector('button').onclick = function () { n.remove(); };
    document.body.appendChild(n);
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function tidyUrl() {
    try { q.delete('intake'); q.delete('s'); var s = q.toString(); history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash); } catch (e) {}
  }
  function ready(fn) {
    var tries = 0;
    (function wait() {
      var ok = typeof state === 'object' && document.querySelector('input[name="appType"][value="advice"]') && typeof saveState === 'function';
      if (ok || ++tries > 60) return setTimeout(fn, 400);
      setTimeout(wait, 150);
    })();
  }
  function onScreen() {
    try { return String(state.adviceClientName || state.fullName || state.clientName || '').trim(); } catch (e) { return ''; }
  }
  function setField(f, v) {
    var el = document.querySelector('[data-field="' + f + '"]');
    if (!el || v == null || v === '') return;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    try { state[f] = v; } catch (e) {}
  }
  function apply(d) {
    var r = document.querySelector('input[name="appType"][value="advice"]');
    if (r && !r.checked) r.click();
    try { state.appType = 'advice'; } catch (e) {}
    setTimeout(function () {
      setField('adviceClientName', d.name);
      setField('adviceClientPhone', d.phone);
      setField('adviceClientEmail', d.email);
      setField('adviceClientNeed', [d.need, d.cover ? 'cover in mind ' + d.cover : '', d.time ? 'best time to call: ' + d.time.toLowerCase() : '', 'WhatsApp request ' + d.ref].filter(Boolean).join(' · '));
      try { saveState(); } catch (e) {}
      note('<b>Filled in from WhatsApp request ' + esc(d.ref) + '.</b> ' + esc(d.name) + ' asked for advice on one need: ' + esc(d.need || 'not stated') +
        '. They read the Insurance Act notice and chose this on ' + esc(String(d.notice || '').replace(/^Yes,\s*/, '')) +
        '. Check every detail with them before you advise.');
    }, 350);
  }

  // Second load, after the device was cleared for this client.
  var kept = null;
  try { kept = JSON.parse(sessionStorage.getItem(KEEP) || 'null'); } catch (e) {}
  if (kept && kept.ref) {
    try { sessionStorage.removeItem(KEEP); } catch (e) {}
    tidyUrl();
    return ready(function () { apply(kept); });
  }
  if (!/^ADV-\d{6}-\d{3}$/.test(ref) || !sig) return;

  fetch(SQ + '?action=q.adviceget&ref=' + encodeURIComponent(ref) + '&s=' + encodeURIComponent(sig) + '&_=' + Date.now(), { cache: 'no-store', redirect: 'follow' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      ready(function () {
        if (!d || !d.ok) { tidyUrl(); return note('<b>This WhatsApp request could not be opened.</b> ' + esc((d && d.error) || 'No answer from the branch server.'), 'bad'); }
        if (/^full/i.test(d.choice)) {
          tidyUrl();
          return note('<b>' + esc(d.ref) + ': ' + esc(d.name) + ' asked for a full review.</b> That is done with them in person: arrange the meeting, then start the fact find as usual.');
        }
        var here = onScreen();
        if (here && here.toLowerCase() !== String(d.name).toLowerCase()) {
          if (!confirm('This device holds the fact find for ' + here + '.\n\nStart a new advice-only fact find for ' + d.name + ' from their WhatsApp request?\n\nThe one on screen is cleared from this device. If you need it, press Cancel and save it first.')) { tidyUrl(); return; }
          // The same clearing as "+ New Client": nothing of the last client carries over.
          try { for (var k in state) if (Object.prototype.hasOwnProperty.call(state, k)) delete state[k]; } catch (e) {}
          try { if (typeof signatures === 'object') for (var s in signatures) if (Object.prototype.hasOwnProperty.call(signatures, s)) delete signatures[s]; } catch (e) {}
          try { localStorage.removeItem(storageKey()); } catch (e) {}
          try { localStorage.removeItem('rrbranch_draft_id'); } catch (e) {}
          try { sessionStorage.setItem(KEEP, JSON.stringify(d)); } catch (e) {}
          tidyUrl();
          return location.reload();
        }
        tidyUrl();
        apply(d);
      });
    })
    .catch(function () { ready(function () { note('<b>This WhatsApp request could not be opened.</b> Check your signal and open the link again.', 'bad'); }); });
})();
