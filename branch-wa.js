/* branch-wa.js — the branch's WhatsApp on every film page we share.
 *
 * Asked for on 8 November 2026: "improve the link video we share and add the
 * branch what's app button". One line on a page, <script src="branch-wa.js"
 * defer></script>, gives it:
 *   - a bar under the film: "Chat with the branch" (opens WhatsApp to the
 *     branch's number with a first line written for them) and "Share this
 *     film" (WhatsApp with the page's own link);
 *   - a round WhatsApp button that stays in the corner once the bar has
 *     scrolled away.
 * The number is the branch's own, the one rickyrampersadbranch.com carries.
 * A page can set data-wa-text on the script tag for its own first line.
 */
(function () {
  'use strict';
  var NUM = '18686785921';
  var me = document.currentScript;
  var og = document.querySelector('meta[property="og:title"]');
  var name = (og && og.content) || document.title || 'your film';
  var hello = window.RRB_WA_TEXT || (me && me.getAttribute('data-wa-text')) ||
    'Hi Ricky Rampersad Branch, I just watched your film "' + name.replace(/\s+$/, '') + '" and would like to talk to someone.';
  var share = name + ' ' + location.origin + location.pathname;
  var chatUrl = 'https://wa.me/' + NUM + '?text=' + encodeURIComponent(hello);
  var shareUrl = 'https://wa.me/?text=' + encodeURIComponent(share);
  var ICON = '<svg viewBox="0 0 32 32" aria-hidden="true" width="22" height="22"><path fill="currentColor" d="M16 3C9 3 3.3 8.6 3.3 15.6c0 2.3.6 4.5 1.8 6.4L3 29l7.2-2c1.8 1 3.8 1.5 5.8 1.5 7 0 12.7-5.6 12.7-12.6S23 3 16 3zm0 23.1c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-4.3 1.1 1.2-4.1-.3-.4a10.4 10.4 0 0 1-1.6-5.5c0-5.8 4.8-10.5 10.7-10.5s10.7 4.7 10.7 10.5S21.9 26.1 16 26.1zm5.9-7.8c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1a8.7 8.7 0 0 1-4.3-3.7c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4s-1.2 1.1-1.2 2.7 1.2 3.1 1.3 3.3 2.3 3.6 5.6 5c2.1.9 2.9 1 4 .8.6-.1 1.9-.8 2.2-1.5s.3-1.4.2-1.5-.3-.2-.6-.4z"/></svg>';
  var css = '.bwa{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0 4px}' +
    '.bwa a{display:inline-flex;align-items:center;gap:9px;min-height:48px;padding:0 18px;border-radius:14px;font:700 16px/1 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-decoration:none}' +
    '.bwa .c{background:#128C4A;color:#fff}.bwa .c:hover{background:#0f7a40}' +
    '.bwa .s{background:#fff;color:#0f5132;border:1.5px solid #128C4A}.bwa .s:hover{background:#eefaf2}' +
    '.bwa small{flex-basis:100%;color:#5b6670;font:14px/1.4 Inter,system-ui,sans-serif}' +
    '.bwaf{position:fixed;right:16px;bottom:16px;z-index:50;width:58px;height:58px;border-radius:50%;background:#128C4A;color:#fff;display:grid;place-items:center;' +
    'box-shadow:0 10px 26px rgba(4,30,16,.35);opacity:0;transform:translateY(12px) scale(.9);pointer-events:none;transition:opacity .25s,transform .25s}' +
    '.bwaf.on{opacity:1;transform:none;pointer-events:auto}.bwaf svg{width:30px;height:30px}' +
    '@media (prefers-reduced-motion:no-preference){.bwaf.on{animation:bwaP 2.6s 1s ease-in-out 2}}' +
    '@keyframes bwaP{50%{box-shadow:0 0 0 12px rgba(18,140,74,.18),0 10px 26px rgba(4,30,16,.35)}}' +
    '@media print{.bwa,.bwaf{display:none}}';
  function build() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var bar = document.createElement('div'); bar.className = 'bwa';
    bar.innerHTML = '<a class="c" href="' + chatUrl + '" target="_blank" rel="noopener">' + ICON + 'Chat with the branch</a>' +
      '<a class="s" href="' + shareUrl + '" target="_blank" rel="noopener">' + ICON + 'Share this film</a>' +
      '<small>WhatsApp (868) 678-5921 &middot; Ricky Rampersad Branch, Guardian Life of the Caribbean</small>';
    var fabOnly = me && me.hasAttribute('data-wa-fab-only');
    if (fabOnly) bar.style.display = 'none';
    var spot = document.getElementById('bwa-here');
    if (spot) { spot.appendChild(bar); bar = null; }
    var v = document.querySelector('video'), at = v && (v.closest('.vwrap,.player,figure') || v);
    var after = at && at.nextElementSibling && /full hd|download/i.test(at.nextElementSibling.textContent || '') ? at.nextElementSibling : at;
    if (bar && after && after.parentNode) after.parentNode.insertBefore(bar, after.nextSibling);
    else if (bar) (document.querySelector('main') || document.body).appendChild(bar);
    bar = spot ? spot.firstChild : bar;
    var fab = document.createElement('a'); fab.className = 'bwaf'; fab.href = chatUrl; fab.target = '_blank'; fab.rel = 'noopener';
    fab.setAttribute('aria-label', 'Chat with the branch on WhatsApp'); fab.innerHTML = ICON;
    document.body.appendChild(fab);
    if (fabOnly) fab.classList.add('on');
    else if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { fab.classList.toggle('on', !e[0].isIntersecting); }).observe(bar);
    else fab.classList.add('on');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
