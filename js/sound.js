// Sound: one recorded clip per syllable, stored with the app. Nothing is sent anywhere
// and no speech service is called. The device's own voice is only a last resort.
(function () {
  'use strict';
  const ZL = (window.ZL = window.ZL || {});
  const BASE = window.ZL_BASE || '';
  const SILENT = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//NwwAAAAAAAAAAAAEluZm8AAAAPAAAABQAAAsAAaGhoaGhoaGhoaGhoaGhoaGhoaI6Ojo6Ojo6Ojo6Ojo6Ojo6Ojo6OtLS0tLS0tLS0tLS0tLS0tLS0tLTa2tra2tra2tra2tra2tra2tra2v//////////////////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQD1QAAAAAAAALAWir0xAAAAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NCxKMAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NAxKQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';
  const TONES = { '̄': 1, '́': 2, '̌': 3, '̀': 4 };
  const shards = new Map();
  let player = null, token = 0;

  // ēn -> en1, nǚ -> nv3, de -> de5
  ZL.numbered = function (py) {
    let tone = 5, out = '';
    for (const ch of py.toLowerCase().trim().normalize('NFD')) {
      if (TONES[ch]) tone = TONES[ch];
      else if (ch === '̈') out = out.slice(0, -1) + 'v';
      else if (/[a-z]/.test(ch)) out += ch;
    }
    return out ? out + tone : '';
  };
  function shardOf(key) {
    let n = 0;
    for (let i = 0; i < key.length; i++) n += key.charCodeAt(i);
    return (n % ZL.core.audioShards).toString(16).padStart(2, '0');
  }
  function clip(key) {
    const s = shardOf(key);
    if (!shards.has(s)) {
      shards.set(s, fetch(BASE + 'data/audio/' + s + '.json').then((r) => (r.ok ? r.json() : {})).catch(() => { shards.delete(s); return {}; }));
    }
    return shards.get(s).then((all) => (all[key] ? 'data:audio/mpeg;base64,' + all[key] : null));
  }
  function deviceVoice(text) {
    const synth = window.speechSynthesis;
    if (!synth || !text) return false;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW';
    u.rate = 0.8;
    synth.speak(u);
    return true;
  }

  // Play syllables one after another. Call it straight from a tap: phones only let a page
  // start sound from a tap, so the player is woken with a silent clip while the real one loads.
  ZL.say = function (syllables, text, onDone) {
    const keys = (Array.isArray(syllables) ? syllables : [syllables]).map(ZL.numbered).filter(Boolean);
    const mine = ++token;
    if (!player) player = new Audio();
    const el = player;
    el.pause();
    el.onended = el.onerror = null;
    el.src = SILENT;
    const woke = el.play();
    if (woke && woke.catch) woke.catch(() => {});
    Promise.all(keys.map(clip)).then((srcs) => {
      if (mine !== token) return;
      srcs = srcs.filter(Boolean);
      if (!srcs.length) { if (!deviceVoice(text) && onDone) onDone(false); else if (onDone) onDone(true); return; }
      let i = 0;
      const next = () => {
        if (mine !== token) return;
        if (i >= srcs.length) { if (onDone) onDone(true); return; }
        el.src = srcs[i++];
        const p = el.play();
        if (p && p.catch) p.catch(() => { if (onDone) onDone(false); });
      };
      el.onended = next;
      el.onerror = () => { if (onDone) onDone(false); };
      next();
    });
  };
  ZL.hush = function () { token++; if (player) { player.pause(); player.onended = null; } };
})();
