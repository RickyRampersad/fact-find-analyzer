/* ─────────────────────────────────────────────────────────────────────────────
   ANDREW'S VOICE for the practice copy (2 November 2026).

   Ricky Rampersad, on hearing the practice copy: "the practice voice has to
   be Andrew. It's sounding very, very, very robotic", then "I want this to
   sound more natural and not robotic".

   The Voice interview and the AI partner used the device's own voice, which
   is robotic everywhere except Microsoft Edge on a computer. This file gives
   them both one way to speak:

   1. Andrew (en-US-AndrewNeural, Microsoft's natural voice), made by the fact
      find's Apps Script (stage ai_tts in apps-script/AiPartner.gs) through
      Azure Speech, when the AZURE_SPEECH_KEY Script property is set. Every
      phone and browser then hears the same Andrew. A line already heard in
      this session plays again at once.
   2. Otherwise, the best natural voice the device has (Edge's own Andrew, a
      "Natural", "Enhanced" or "Premium" voice, then Google's), never the
      first voice on the list.

   Practice copy only: on any other address this file does nothing and the
   two tools speak as before.

   window.RRB_SPEECH.speak(text) returns a promise that settles when the line
   has been spoken. speechSynthesis.cancel() also stops Andrew, so the
   tools' own Stop, Pause and Mute keep working unchanged.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.RRB_SPEECH || !window.RRB_GUEST) return;
  var TTS = window.speechSynthesis;
  var SP = { andrew: null, voice: null, audio: null, unlocked: false, cache: {}, tok: 0, played: null };

  function endpoint() {
    try { if (typeof getEndpoint === 'function') return getEndpoint(); } catch (e) {}
    try { return CURRENT_ENDPOINT; } catch (e2) { return ''; }
  }

  /* iPhones only let a page play sound it started from a tap. The first tap
     anywhere plays a silent sound on the one audio element every later line
     uses, which unlocks it for the rest of the session. */
  function audioEl() {
    if (!SP.audio) { SP.audio = new Audio(); SP.audio.preload = 'auto'; }
    return SP.audio;
  }
  function unlock() {
    if (SP.unlocked) return;
    SP.unlocked = true;
    var a = audioEl();
    try {
      a.src = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//OEwAAAAAAAAAAAAEluZm8AAAAPAAAACQAABCAARUVFRUVFRUVFRUVdXV1dXV1dXV1dXXR0dHR0dHR0dHR0i4uLi4uLi4uLi4uioqKioqKioqKiorq6urq6urq6urq60dHR0dHR0dHR0dHo6Ojo6Ojo6Ojo6P//////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQD8AAAAAAAAAQgDeb0IwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//NExAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExFMAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExKYAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExKwAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExKwAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExKwAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExKwAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NExKwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NExKwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
      var p = a.play(); if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);

  /* The best voice the device has, when Andrew is not set up. */
  function bestVoice() {
    if (!TTS) return null;
    var vs = TTS.getVoices().filter(function (v) { return /^en/i.test(v.lang); });
    var pref = [/Andrew.*(Natural|Online)/i, /Brian.*(Natural|Online)/i, /(Natural|Neural)/i, /(Premium|Enhanced)/i,
                /Google UK English Male/i, /Google US English/i, /^(Daniel|Aaron|Alex|Samantha)\b/i];
    for (var p = 0; p < pref.length; p++) {
      for (var j = 0; j < vs.length; j++) if (pref[p].test(vs[j].name)) return vs[j];
    }
    return vs[0] || null;
  }
  if (TTS) {
    try { TTS.addEventListener('voiceschanged', function () { SP.voice = null; }); } catch (e) {}
  }
  function deviceSay(text) {
    return new Promise(function (res) {
      if (!TTS || !text) return res();
      try {
        cancelNative();
        var u = new SpeechSynthesisUtterance(text);
        SP.voice = SP.voice || bestVoice(); if (SP.voice) u.voice = SP.voice;
        u.rate = /Natural|Online|Neural/i.test((SP.voice && SP.voice.name) || '') ? 1.0 : 0.95;
        var done = false, fin = function () { if (!done) { done = true; res(); } };
        u.onend = fin; u.onerror = fin; setTimeout(fin, 1500 + text.length * 90);
        TTS.speak(u);
      } catch (e) { res(); }
    });
  }

  /* Andrew, from the fact find's Apps Script. */
  function fetchAndrew(text) {
    if (SP.cache[text]) return Promise.resolve(SP.cache[text]);
    return fetch(endpoint(), { method: 'POST', cache: 'no-store', rrbAiPartner: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ stage: 'ai_tts', guest: true, text: text, sid: sid() }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok || !j.audio) { if (j && j.noVoice) SP.andrew = false; throw new Error((j && j.error) || 'no audio'); }
        SP.andrew = true;
        SP.cache[text] = j.audio;
        return j.audio;
      });
  }
  function playB64(b64, tok) {
    return new Promise(function (res) {
      if (tok !== SP.tok) return res();
      var a = audioEl(), done = false;
      var fin = function () { if (!done) { done = true; a.onended = a.onerror = null; res(); } };
      a.onended = fin; a.onerror = fin;
      a.src = 'data:audio/mpeg;base64,' + b64;
      SP.played = a;
      var p = a.play();
      if (p && p.catch) p.catch(function () { fin(); });
    });
  }
  function sid() {
    if (!SP.sid) SP.sid = 's' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    return SP.sid;
  }

  /* Speak a line: Andrew when the server has him, the device's best voice
     otherwise. `audio` (base64 MP3) is used as is when a caller already has it. */
  function speak(text, audio) {
    text = String(text || '').trim();
    if (!text) return Promise.resolve();
    var tok = ++SP.tok;
    stopAudio();
    if (audio) { SP.cache[text] = audio; SP.andrew = true; return playB64(audio, tok); }
    if (SP.andrew === false) return deviceSay(text);
    return fetchAndrew(text).then(function (b64) { return playB64(b64, tok); },
      function () { return tok === SP.tok ? deviceSay(text) : null; });
  }
  function stopAudio() {
    var a = SP.audio; if (!a) return;
    try { a.pause(); a.onended && a.onended(); } catch (e) {}
  }
  var cancelNative = TTS ? TTS.cancel.bind(TTS) : function () {};
  if (TTS) {
    /* The tools stop speech with speechSynthesis.cancel(): make that stop Andrew too. */
    TTS.cancel = function () { SP.tok++; stopAudio(); cancelNative(); };
  }

  window.RRB_SPEECH = {
    speak: speak,
    cancel: function () { if (TTS) TTS.cancel(); else { SP.tok++; stopAudio(); } },
    prefetch: function (t) { t = String(t || '').trim(); if (t && SP.andrew !== false) fetchAndrew(t).catch(function () {}); },
    who: function () { return SP.andrew ? 'Andrew' : ((SP.voice || bestVoice() || {}).name || 'the device voice'); },
    _state: SP
  };
})();
