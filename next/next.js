/* FactFind360 "next" layout — a skin over the live fact find, never a copy of it.
 *
 * It loads only on a device switched to it (ffproject?ui=next; ?ui=classic goes
 * back). Every field, calculator, PDF and submission is the live form's own, so
 * what reaches the branch is the same record whichever layout typed it. The
 * look is next.css. This file adds one thing and changes no data:
 *   sending that survives no signal: pressed with the phone offline, the
 *      submission is held on this device and sent by itself when signal
 *      returns. It is only ever held when the request never left the phone,
 *      so it can never be sent twice.
 */
(function () {
  'use strict';
  if (window.__ffx) return; window.__ffx = 1;

  function $(s, r) { return (r || document).querySelector(s); }

  /* ---------- 4. sending with no signal ---------- */
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
    document.documentElement.classList.add('ffx');
    showQueue().then(flush);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 0); });
  else setTimeout(start, 0);
})();
