// Asking Claude. Inside Claude the page asks on the viewer's own account, with their
// permission. Anywhere else there is no key and no network call: the page offers the
// question as text to copy instead.
(function () {
  'use strict';
  const ZL = (window.ZL = window.ZL || {});
  let sample = null;
  const waiters = [];
  let settled = false;

  const RULES = [
    'You are helping a careful adult learner of Mandarin who writes Traditional characters (Taiwan usage) and studies how each character is built from parts. The learner reads characters contemplatively and has a Theosophical interest, with Daoist and Buddhist texts in view.',
    '',
    'How to answer:',
    '- Plain text, under 190 words. You may put a few key terms in **bold**. No headings, tables or long lists.',
    '- Use Traditional characters. Give pinyin with tone marks and a short English meaning for every character you mention.',
    '- Keep two things apart and say which is which: how scholars think the character was formed (most characters join a meaning part with a sound part), and a reading of the picture as an aid to memory or contemplation. Never present the second as history.',
    '- If the question is whether a character with a certain arrangement exists, answer only from what you are sure of. Name a rare or variant character only if you are confident it exists; otherwise say that none is in common use, and then say what the picture would suggest.',
    '- The facts below come from the learner\'s dictionary. Build on them; if one is wrong, say so briefly.',
  ].join('\n');

  ZL.askReady = function () {
    if (settled) return Promise.resolve(!!sample);
    return new Promise((res) => waiters.push(res));
  };
  (async function init() {
    try {
      if (window.claude && typeof window.claude.use === 'function') sample = await window.claude.use('sample');
    } catch (e) { sample = null; }
    settled = true;
    waiters.forEach((w) => w(!!sample));
  })();

  ZL.prompt = (facts, question) => RULES + '\n\nFacts:\n' + facts + '\n\nQuestion: ' + question;

  ZL.ask = function (prompt, onText, signal) {
    if (!sample) return Promise.reject({ code: 'unavailable' });
    return sample(prompt, { onText: ({ text }) => onText(text), signal });
  };

  ZL.askMessage = function (code) {
    switch (code) {
      case 'cancelled': return '';
      case 'not_granted': case 'sampling_disabled': case 'not_declared': case 'capability_disabled': case 'capability_removed': case 'unavailable':
        return 'Claude is not available in this view. Copy the question and paste it into a Claude chat instead.';
      case 'rate_limited': return 'Claude is busy or your usage limit is reached. Try again in a while.';
      case 'session_expired': return 'Sign in to Claude again, then ask once more.';
      case 'refused': return 'Claude declined this question. Try wording it differently.';
      default: return 'The answer was interrupted. Ask again.';
    }
  };

  // ---- notes kept on this device
  const KEY = 'zl-notes-v1';
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch (e) { return false; } }
  ZL.notes = {
    get: (k) => read()[k] || [],
    add(k, q, a) { const all = read(); (all[k] = all[k] || []).unshift({ q, a, t: Date.now() }); return write(all); },
    remove(k, t) { const all = read(); all[k] = (all[k] || []).filter((n) => n.t !== t); if (!all[k].length) delete all[k]; write(all); },
    all: read,
  };
})();
