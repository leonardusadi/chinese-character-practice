// Screens: the text, the parts, a character taken apart, and the bench where parts are combined.
(function () {
  'use strict';
  const ZL = window.ZL;
  const view = document.getElementById('view');
  const tabs = document.getElementById('tabs');

  // ---------------------------------------------------------------- helpers
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(3)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const mount = (...kids) => view.replaceChildren(...kids.flat(3).filter((k) => k != null && k !== false));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rich = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').split(/\n{2,}/).map((p) => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window */ } },
  };
  const go = (name) => { if (location.hash === '#' + name) render(); else location.hash = name; };
  const charLink = (c) => 'c-' + ZL.hex(c);
  const partLink = (id) => 'p-' + ZL.hex(id);
  const HAN = /[㐀-鿿]/;

  let toastTimer;
  function toast(msg) {
    document.querySelector('.toast')?.remove();
    const t = h('div', { class: 'toast', role: 'status' }, msg);
    document.body.append(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 2400);
  }

  // Plays the recorded syllables for a character, a word or a line.
  function hearBtn(syllables, text, label) {
    return h('button', { class: 'ghost hear', type: 'button', 'aria-label': 'Hear ' + text, onclick: (e) => {
      const b = e.currentTarget;
      b.classList.add('playing');
      ZL.say(syllables, text, (ok) => { b.classList.remove('playing'); if (!ok) toast('The sound could not be played.'); });
    } }, label || 'Hear it');
  }

  // A character as a small tile: glyph, reading, meaning.
  function tile(c, opts) {
    opts = opts || {};
    const inf = ZL.info(c);
    return h('button', { class: 'tile' + (inf.page ? ' in-text' : '') + (inf.level === 2 ? ' rare' : ''), type: 'button', onclick: () => go(charLink(c)), title: inf.long },
      h('span', { class: 'zh' }, c),
      h('span', { class: 'py' }, inf.py),
      h('span', { class: 'en' }, opts.sub || inf.en));
  }
  // A long list of tiles that opens up on request.
  function tileList(chars, limit, sub) {
    const wrap = h('div', { class: 'tiles' });
    const fill = (n) => {
      wrap.replaceChildren(...chars.slice(0, n).map((c) => tile(c, { sub: sub ? sub(c) : null })));
      if (chars.length > n) {
        wrap.append(h('button', { class: 'more', type: 'button', onclick: () => fill(chars.length) }, 'Show all ' + chars.length));
      }
    };
    fill(limit);
    return wrap;
  }
  // Text in which every Chinese character opens its card.
  function tappable(text) {
    const out = [];
    for (const ch of Array.from(text)) {
      out.push(HAN.test(ch) && ZL.has(ch)
        ? h('button', { class: 'zc', type: 'button', onclick: () => go(charLink(ch)) }, ch)
        : ch);
    }
    return out;
  }
  const section = (title, ...kids) => h('section', { class: 'sec' }, title ? h('h2', {}, title) : null, kids);
  const backBar = (label) => h('div', { class: 'backbar' },
    h('button', { class: 'ghost', type: 'button', onclick: () => (history.length > 1 ? history.back() : go('text')) }, '‹ Back'),
    h('span', { class: 'crumb' }, label));

  // ---------------------------------------------------------------- asking Claude
  function askBox({ noteKey, facts, presets, placeholder }) {
    const out = h('div', { class: 'answer', hidden: true });
    const status = h('p', { class: 'hint', hidden: true });
    const input = h('input', { type: 'text', id: 'ask-' + noteKey, placeholder: placeholder || 'Ask about this character', 'aria-label': 'Your question', maxlength: 300 });
    const askBtn = h('button', { class: 'primary', type: 'submit' }, 'Ask Claude');
    const stopBtn = h('button', { class: 'ghost', type: 'button', hidden: true }, 'Stop');
    const saveBtn = h('button', { class: 'ghost', type: 'button', hidden: true }, 'Keep this note');
    const copyBtn = h('button', { class: 'ghost', type: 'button' }, 'Copy the question');
    const notes = h('div', { class: 'notes' });
    let ctl = null, lastQ = '', lastA = '', canAsk = false;

    function drawNotes() {
      const list = ZL.notes.get(noteKey);
      notes.replaceChildren(...(list.length ? [h('h3', {}, 'Your notes')] : []), ...list.map((n) =>
        h('div', { class: 'note' },
          h('p', { class: 'q' }, n.q),
          h('div', { html: rich(n.a) }),
          h('button', { class: 'link', type: 'button', onclick: () => { ZL.notes.remove(noteKey, n.t); drawNotes(); } }, 'Remove'))));
    }
    async function copy(text) {
      try { await navigator.clipboard.writeText(text); toast('Copied. Paste it into a Claude chat.'); }
      catch (e) {
        out.hidden = false;
        out.replaceChildren(h('textarea', { readonly: true, rows: 8, 'aria-label': 'Question to copy' }, text));
        out.firstChild.select();
        toast('Select the text and copy it.');
      }
    }
    async function run(q) {
      q = q.trim();
      if (!q) { input.focus(); return; }
      const prompt = ZL.prompt(facts(), q);
      if (!canAsk) { copy(prompt); return; }
      lastQ = q; lastA = '';
      ctl = new AbortController();
      out.hidden = false; out.textContent = 'Thinking…';
      status.hidden = true; saveBtn.hidden = true;
      askBtn.disabled = true; stopBtn.hidden = false;
      try {
        const res = await ZL.ask(prompt, (text) => { out.innerHTML = rich(text); }, ctl.signal);
        lastA = res.text;
        out.innerHTML = rich(res.text);
        saveBtn.hidden = false;
        if (res.truncated) { status.hidden = false; status.textContent = 'The answer was cut short. Ask for less at a time.'; }
      } catch (e) {
        if (e && e.text) { lastA = e.text; out.innerHTML = rich(e.text); saveBtn.hidden = false; } else { out.hidden = true; }
        const msg = ZL.askMessage(e && e.code);
        if (msg) { status.hidden = false; status.textContent = msg; }
        if (e && ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'unavailable'].includes(e.code)) setMode(false);
      } finally {
        askBtn.disabled = false; stopBtn.hidden = true; ctl = null;
      }
    }
    function setMode(ok) {
      canAsk = ok;
      askBtn.textContent = ok ? 'Ask Claude' : 'Copy for Claude';
      copyBtn.hidden = !ok;
      mode.textContent = ok
        ? 'Claude answers here, using your own Claude account. It sees only the facts on this card and your question.'
        : 'This copy of the page has no connection to Claude. The button copies the question with the facts from this card, ready to paste into a Claude chat.';
    }
    const mode = h('p', { class: 'hint' });
    setMode(false);
    ZL.askReady().then(setMode);
    stopBtn.addEventListener('click', () => ctl && ctl.abort());
    saveBtn.addEventListener('click', () => {
      if (ZL.notes.add(noteKey, lastQ, lastA)) { saveBtn.hidden = true; drawNotes(); toast('Kept on this device.'); }
      else toast('This browser would not save the note.');
    });
    copyBtn.addEventListener('click', () => copy(ZL.prompt(facts(), input.value.trim() || (presets[0] && presets[0][1]) || '')));
    drawNotes();
    return h('div', { class: 'ask' },
      h('div', { class: 'chips' }, presets.map(([label, q]) => h('button', { class: 'chip', type: 'button', onclick: () => { input.value = q; run(q); } }, label))),
      h('form', { class: 'askrow', onsubmit: (e) => { e.preventDefault(); run(input.value); } }, input, askBtn, stopBtn),
      mode, out, status, h('div', { class: 'row' }, saveBtn, copyBtn), notes);
  }

  // ---------------------------------------------------------------- the text
  function textView(pageArg) {
    const core = ZL.core;
    const page = Math.min(core.pages.length, Math.max(1, pageArg || store.get('zl-page', 1)));
    store.set('zl-page', page);
    const p = core.pages[page - 1];
    const results = h('div', { class: 'tiles', hidden: true });
    const search = h('input', {
      type: 'search', id: 'search', placeholder: 'Find a character: 恩, en, grace', 'aria-label': 'Find a character', autocomplete: 'off',
      oninput: () => {
        const found = ZL.search(search.value, 40);
        results.hidden = !search.value.trim();
        results.replaceChildren(...(found.length ? found.map((c) => tile(c)) : [h('p', { class: 'hint' }, 'Nothing found. Try a single character, pinyin without tones, or one English word.')]));
      },
    });
    const newChars = Object.keys(core.chars).filter((c) => core.chars[c].page === page);
    const words = core.words.filter((w) => w.page === page);
    const theo = core.words.filter((w) => w.theme === 'Theosophy');

    mount(
      h('header', { class: 'mast' },
        h('div', { class: 'mast-zh', 'aria-hidden': 'true' }, '煉字'),
        h('div', {}, h('h1', {}, 'Character Alchemy'),
          h('p', { class: 'lede' }, 'Take the characters of ', h('span', { class: 'zh-inline' }, core.title), ' apart, see what each part brings, and put the parts together again.'))),
      h('div', { class: 'searchbar' }, search), results,
      section('The text, page by page',
        h('div', { class: 'chips', role: 'tablist', 'aria-label': 'Pages' }, core.pages.map((x) =>
          h('button', { class: 'chip' + (x.n === page ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': x.n === page ? 'true' : 'false', onclick: () => go('t-' + x.n) }, 'Page ' + x.n))),
        h('p', { class: 'hint' }, p.subtitle + '. Tap any character to take it apart.'),
        h('div', { class: 'lines' }, p.lines.map((ln) => h('div', { class: 'line' },
          h('div', { class: 'line-zh' }, tappable(ln.zh)),
          h('div', { class: 'line-py' }, ln.py, ' ', hearBtn(ln.py.split(' '), ln.zh, 'Hear')),
          ln.tr.map((t) => h('div', { class: 'line-en' }, t)))))),
      section('First met on page ' + page,
        h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', onclick: () => { practice = { list: newChars, label: 'Page ' + page }; go('w-' + ZL.hex(newChars[0])); } }, 'Practise writing these ' + newChars.length)),
        tileList(newChars, 60)),
      words.length ? section('Words from this page', h('div', { class: 'words' }, words.map(wordRow))) : null,
      section('Beyond the text',
        h('p', { class: 'hint' }, 'Characters the text does not use, chosen because they show the same parts at work and matter to a Theosophical reader.'),
        core.themes.map((t) => h('div', { class: 'theme' }, h('h3', {}, t.title), h('p', { class: 'hint' }, t.note), tileList(Array.from(t.chars), 40)))),
      section('Theosophical vocabulary', wordList(theo, 6)),
      about());
  }
  function wordList(list, limit) {
    const wrap = h('div', { class: 'words' });
    const fill = (n) => {
      wrap.replaceChildren(...list.slice(0, n).map(wordRow));
      if (list.length > n) wrap.append(h('button', { class: 'more', type: 'button', onclick: () => fill(list.length) }, 'Show all ' + list.length));
    };
    fill(limit);
    return wrap;
  }
  function wordRow(w) {
    return h('div', { class: 'word' },
      h('div', { class: 'word-zh' }, tappable(w.w)),
      h('div', { class: 'word-meta' }, h('span', { class: 'py' }, w.py), ' ', h('span', {}, w.en), ' ', w.syl ? hearBtn(w.syl, w.w, 'Hear') : null),
      w.note ? h('div', { class: 'word-note' }, tappable(w.note)) : null);
  }
  function about() {
    return h('details', { class: 'about' },
      h('summary', {}, 'About this page'),
      h('p', {}, 'Readings and meanings for the text follow your study book, pages 1 to 8. The notes headed “A way to read it” and “Theosophical lens” are aids to memory and contemplation. They are kept apart from “How it was formed”, because most characters join a part that gives the meaning with a part that only gives the sound.'),
      h('p', {}, 'Parts, formation notes for characters without a hand-written reading, and stroke outlines come from the Make Me a Hanzi project (Unihan, cjklib and the Arphic fonts). Its formation notes are brief and sometimes traditional rather than scholarly. Stroke order follows the mainland standard; where Taiwan’s differs, follow your teacher.'),
      h('p', {}, 'Notes you keep are saved in this browser only. “Ask Claude” works when the page is open inside Claude and uses your own account; it sends the facts shown on the card and your question, nothing else.'));
  }

  // ---------------------------------------------------------------- the parts
  function partsView() {
    const groups = new Map();
    for (const e of ZL.core.elements) {
      if (!groups.has(e.group)) groups.set(e.group, []);
      groups.get(e.group).push(e);
    }
    const inText = (id) => ZL.family(id).filter((f) => ZL.core.chars[f.c] && f.place !== 'deeper').length;
    mount(
      h('header', { class: 'mast small' }, h('div', {}, h('h1', {}, 'The parts'),
        h('p', { class: 'lede' }, 'The basic shapes that characters are built from. Each one keeps its meaning wherever it goes; where it sits changes what the whole character says.'))),
      Array.from(groups, ([name, list]) => section(name,
        h('div', { class: 'tiles parts' }, list.map((e) => {
          const n = inText(e.id);
          return h('button', { class: 'tile part', type: 'button', onclick: () => go(partLink(e.id)) },
            h('span', { class: 'zh' }, e.forms.slice(0, 2).join(' ')),
            h('span', { class: 'py' }, e.py),
            h('span', { class: 'en' }, e.en),
            n ? h('span', { class: 'count' }, n + ' in the text') : null);
        })))));
  }

  const PLACE_ORDER = ['top', 'bottom', 'left', 'right', 'middle', 'around', 'inside', 'woven in', 'within', 'deeper'];
  function partView(id) {
    const e = ZL.element(id);
    const fam = ZL.family(id);
    let showRare = false;
    const body = h('div', { class: 'stack' });
    const draw = () => {
      const groups = new Map();
      for (const f of fam) {
        if (!showRare && ZL.info(f.c).level !== 1) continue;
        if (!groups.has(f.place)) groups.set(f.place, []);
        groups.get(f.place).push(f);
      }
      const secs = PLACE_ORDER.filter((p) => groups.has(p)).map((p) => {
        const list = groups.get(p);
        const forms = Array.from(new Set(list.map((f) => f.form)));
        const title = p === 'within' ? 'Inside a larger part'
          : p === 'deeper' ? 'Hidden one level down'
            : forms.join(' ') + ' ' + ZL.placeWord(p);
        const note = p === 'deeper' ? 'These are built with a character that itself contains ' + e.forms[0] + '.' : null;
        return section(title + ' · ' + list.length, note ? h('p', { class: 'hint' }, note) : null,
          tileList(list.map((f) => f.c), 24, (c) => {
            if (p === 'deeper' || p === 'within') return null;
            const others = ZL.parts(c).filter((x) => x.id !== id).map((x) => x.form);
            return others.length ? 'with ' + others.join(' ') : null;
          }));
      });
      body.replaceChildren(...(secs.length ? secs : [h('p', { class: 'hint' }, 'No common character is built with this shape as a separate part.')]));
    };
    draw();
    const inTextN = fam.filter((f) => ZL.core.chars[f.c]).length;
    const forms = e.forms.filter((f, i) => e.forms.indexOf(f) === i);
    mount(
      backBar('Part'),
      h('header', { class: 'hero part-hero' },
        h('div', { class: 'forms' }, forms.map((f) => ZL.glyph(f, { colour: false, cls: 'sm' }).el)),
        h('div', { class: 'meta' },
          h('h1', {}, h('span', { class: 'zh-inline' }, forms.join(' ')), ' ', h('span', { class: 'py' }, e.py)),
          h('p', { class: 'gloss' }, e.en),
          e.pic ? h('p', {}, tappable(e.pic)) : null,
          h('p', { class: 'hint' }, fam.length + ' characters use it, ' + inTextN + ' of them in the text.'),
          h('div', { class: 'row' },
            h('button', { class: 'primary', type: 'button', onclick: () => go('a-' + ZL.hex(id)) }, 'Combine it with another part'),
            e.py ? hearBtn([e.py], forms[0]) : null,
            ZL.has(id) && ZL.parts(id).length ? h('button', { class: 'ghost', type: 'button', onclick: () => go(charLink(id)) }, 'Take ' + id + ' apart') : null))),
      body,
      h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'rare', onchange: (ev) => { showRare = ev.target.checked; draw(); } }), ' Include rarer characters'));
  }

  // ---------------------------------------------------------------- one character
  function originText(inf) {
    const r = inf.reading;
    if (r && r.origin) return { text: r.origin, own: true };
    const o = inf.origin.split('\t');
    const name = (f) => { const x = ZL.info(f); return f + ' ' + x.py; };
    if (o[0] === 'p') {
      const sem = o[2] ? o[2] + (o[3] ? ' (' + o[3] + ')' : '') + ' gives the meaning' : '';
      const ph = o[1] ? name(o[1]) + ' gives the sound' : '';
      const s = [sem, ph].filter(Boolean).join('; ');
      return s ? { text: 'A meaning part joined to a sound part: ' + s + '.', own: false } : null;
    }
    if (o[0] === 'i' && o[1]) return { text: 'Two meanings joined into one. ' + o[1] + '.', own: false };
    if (o[0] === 'g' && o[1]) return { text: 'A picture. ' + o[1] + '.', own: false };
    return null;
  }
  function roles(inf) {
    const o = inf.origin.split('\t');
    return o[0] === 'p' ? { sound: o[1], meaning: o[2] } : {};
  }

  function charView(c) {
    const inf = ZL.info(c);
    const { parts, colourOf } = ZL.partColours(c);
    const g = ZL.glyph(c, { cls: 'lg' });
    const role = roles(inf);
    const how = ZL.describe(c);
    const r = inf.reading;
    const origin = originText(inf);
    let focused = null;

    // --- made of
    const rows = parts.map((p) => {
      const pi = ZL.info(p.form), el = ZL.element(p.id);
      const isSound = role.sound === p.form, isMeaning = role.meaning === p.form;
      const row = h('div', { class: 'part-row' },
        h('button', { class: 'swatch p' + colourOf(p), type: 'button', 'aria-label': 'Show ' + p.form + ' in the character', onclick: () => {
          focused = focused === p.id ? null : p.id;
          g.focus(focused);
          rowsEl.querySelectorAll('.part-row').forEach((x) => x.classList.toggle('on', x === row && !!focused));
        } }, p.form),
        h('div', { class: 'part-info' },
          h('div', {}, h('strong', { class: 'zh-inline' }, p.form === p.id ? p.form : p.form + ' = ' + el.forms[0]), ' ',
            h('span', { class: 'py' }, el.py || pi.py), ' ', h('span', {}, el.en || pi.en)),
          h('div', { class: 'tags' },
            h('span', { class: 'tag' }, p.places.map(ZL.placeWord).join(', then ')),
            isMeaning ? h('span', { class: 'tag meaning' }, 'gives the meaning') : null,
            isSound ? h('span', { class: 'tag sound' }, 'gives the sound: ' + pi.py + ' → ' + inf.py) : null)),
        h('button', { class: 'link', type: 'button', onclick: () => go(partLink(p.id)) }, 'Family ›'));
      return row;
    });
    const rowsEl = h('div', { class: 'part-rows' }, rows);

    // --- the same parts, arranged another way
    const same = parts.length >= 2 ? ZL.combine(parts.map((p) => p.id)).filter((x) => x.c !== c && ZL.info(x.c).level === 1) : [];

    // --- change one part
    const swaps = [];
    const seenIds = new Set();
    for (const p of parts) {
      if (seenIds.has(p.id) || p.depth !== 1) continue;
      seenIds.add(p.id);
      const sibs = ZL.family(p.id).filter((f) => f.c !== c && f.place === p.place && ZL.info(f.c).level === 1).map((f) => f.c);
      if (!sibs.length) continue;
      swaps.push(h('div', { class: 'swap' },
        h('h3', {}, 'Keep ', h('span', { class: 'zh-inline' }, p.form), ' ', ZL.placeWord(p.place), ', change the rest'),
        tileList(sibs, 12, (x) => {
          const others = ZL.parts(x).filter((y) => y.id !== p.id).map((y) => y.form);
          return others.length ? 'with ' + others.join(' ') : null;
        }),
        h('button', { class: 'link', type: 'button', onclick: () => go(partLink(p.id)) }, 'The whole family of ' + p.form + ' ›')));
    }

    const words = ZL.wordsWith(c);
    const shapes = ZL.core.shapes[c] || [];

    const facts = () => [
      'Character: ' + c + ' ' + inf.py + ' — ' + inf.long,
      inf.page ? 'It appears in the learner\'s text (瑤池金母消愆解罪報恩功德懺), first on page ' + inf.page + ', glossed there as "' + inf.en + '".' : 'It is not in the learner\'s text.',
      how ? 'Arrangement: ' + how : 'It is a basic shape, not built from smaller parts.',
      ...parts.map((p) => { const pi = ZL.info(p.form), el = ZL.element(p.id); return 'Part: ' + p.form + (p.form !== p.id ? ' (a form of ' + p.id + ')' : '') + ' ' + (el.py || pi.py) + ' "' + (el.en || pi.en) + '", ' + p.places.map(ZL.placeWord).join(', then '); }),
      origin ? 'Formation note: ' + origin.text : '',
      same.length ? 'Other characters from the same parts: ' + same.map((x) => x.c + ' ' + ZL.info(x.c).py + ' "' + ZL.info(x.c).en + '" (' + x.how + ')').join('; ') : '',
    ].filter(Boolean).join('\n');

    mount(
      backBar(inf.page ? 'From page ' + inf.page + ' of the text' : 'Beyond the text'),
      h('header', { class: 'hero' },
        g.el,
        h('div', { class: 'meta' },
          h('h1', {}, h('span', { class: 'zh-inline big' }, c), ' ', h('span', { class: 'py' }, inf.py),
            inf.also.length ? h('span', { class: 'also' }, ' also ' + inf.also.join(', ')) : null),
          h('p', { class: 'gloss' }, inf.en),
          inf.long && inf.long.toLowerCase() !== inf.en.toLowerCase() ? h('p', { class: 'hint' }, inf.long) : null,
          how ? h('p', { class: 'how' }, tappable(how)) : h('p', { class: 'how' }, 'A basic shape'),
          h('div', { class: 'row' },
            h('button', { class: 'primary', type: 'button', onclick: () => go('w-' + ZL.hex(c)) }, 'Practise writing'),
            hearBtn([inf.py], c),
            h('button', { class: 'ghost', type: 'button', onclick: () => g.play() }, 'Play the strokes'),
            ZL.family(c).length ? h('button', { class: 'ghost', type: 'button', onclick: () => go(partLink(ZL.canon(c))) }, 'Where ' + c + ' is a part') : null))),
      parts.length ? section('Made of', rowsEl, h('p', { class: 'hint' }, 'Tap a coloured square to see that part alone in the character.')) : null,
      origin ? section('How it was formed', h('p', {}, tappable(origin.text)), origin.own ? null : h('p', { class: 'hint' }, 'From the Make Me a Hanzi dictionary.')) : null,
      r && r.see ? section('A way to read it', h('p', { class: 'see' }, tappable(r.see))) : null,
      r && r.lens ? section('Theosophical lens', h('p', { class: 'lens' }, tappable(r.lens))) : null,
      shapes.length ? section('From your study book', shapes.map((s) => h('p', { class: 'booknote' }, tappable(s.note), h('span', { class: 'hint' }, ' Page ' + s.page)))) : null,
      same.length ? section('The same parts, arranged another way', tileList(same.map((x) => x.c), 12, (x) => same.find((y) => y.c === x).how)) : null,
      swaps.length ? section('Change one part', swaps) : null,
      words.length ? section('In words', h('div', { class: 'words' }, words.map(wordRow))) : null,
      section('Ask Claude', askBox({
        noteKey: 'c-' + c, facts,
        presets: [
          [r && r.see ? 'Go deeper' : 'Read it for me', r && r.see ? 'Go deeper into how the parts of ' + c + ' work together, beyond the note already on the card. What does the arrangement add?' : 'How do the parts of ' + c + ' work together? Give the formation, then a way to read the picture.'],
          ['What if the parts moved?', 'What if the parts of ' + c + ' were arranged differently, for example side by side instead of stacked, or with a different part in the same place? Which real characters result, and how does the meaning shift?'],
          ['Theosophical reading', 'Give a short Theosophical reading of ' + c + ', tied closely to its parts and to how it is used in Daoist or Buddhist texts.'],
          ['Look-alikes', 'Which characters are easily confused with ' + c + ' when writing by hand, and what tells them apart?'],
        ],
      })));
  }

  // ---------------------------------------------------------------- writing practice
  // Each stroke is checked as it is drawn: right place, right direction, right order.
  let practice = { list: [], label: '' };
  const tally = {
    all: () => store.get('zl-written', {}),
    add(c, mode, slips) {
      const all = tally.all(), t = all[c] || { outline: 0, memory: 0, clean: 0 };
      t[mode] = (t[mode] || 0) + 1;
      if (!slips && mode === 'memory') t.clean = (t.clean || 0) + 1;
      all[c] = t;
      store.set('zl-written', all);
      return t;
    },
  };
  function practiceList(c) {
    if (practice.list.includes(c)) return practice;
    const inf = ZL.info(c);
    if (inf.page) return { list: Object.keys(ZL.core.chars).filter((x) => ZL.core.chars[x].page === inf.page), label: 'Page ' + inf.page };
    const theme = ZL.core.themes.find((t) => t.chars.includes(c));
    if (theme) return { list: Array.from(theme.chars), label: theme.title };
    return { list: [c], label: '' };
  }
  function writeView(c) {
    practice = practiceList(c);
    const inf = ZL.info(c);
    const list = practice.list, at = list.indexOf(c);
    let mode = store.get('zl-mode', 'outline');
    const stage = h('div', { class: 'stage' });
    const status = h('p', { class: 'status', role: 'status' });
    const record = h('p', { class: 'hint' });
    const shown = h('span', { class: 'zh-inline big' }, c);
    const actions = h('div', { class: 'row' });
    let writer = null, pad = null, timer = null;
    const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const showRecord = () => {
      const t = tally.all()[c];
      const n = t ? (t.outline || 0) + (t.memory || 0) : 0;
      record.textContent = n ? 'Completed here ' + (n === 1 ? 'once' : n + ' times') + ', ' + (t.clean || 0) + ' from memory without a slip.' : '';
    };
    function clear() {
      clearTimeout(timer);
      if (writer) { try { writer.cancelQuiz(); } catch (e) { /* not started */ } writer = null; }
      if (pad) { pad.destroy(); pad = null; }
      stage.replaceChildren(h('div', { class: 'grid', html: '<svg viewBox="0 0 1024 1024" aria-hidden="true"><rect class="g-b" x="8" y="8" width="1008" height="1008" rx="28"/><g class="g-l"><line x1="8" y1="8" x2="1016" y2="1016"/><line x1="1016" y1="8" x2="8" y2="1016"/><line x1="512" y1="8" x2="512" y2="1016"/><line x1="8" y1="512" x2="1016" y2="512"/></g></svg>' }));
    }
    async function start() {
      clear();
      shown.hidden = mode === 'memory';
      const rec = await ZL.strokes(c);
      if (mode === 'free' || !rec || !rec[2]) {
        const guide = ZL.glyph(c, { cls: 'guide', grid: false });
        const canvas = h('canvas', { class: 'pad', 'aria-label': 'Writing pad for ' + c });
        stage.append(guide.el, canvas);
        pad = ZL.pad(canvas);
        status.textContent = rec && rec[2] ? 'Free hand: trace over the grey character. Nothing is checked.' : 'There are no stroke outlines for this character, so it cannot be checked. Write it free hand.';
        actions.replaceChildren(
          h('button', { class: 'ghost', type: 'button', onclick: () => guide.play() }, 'Play the strokes'),
          h('button', { class: 'ghost', type: 'button', onclick: () => pad.undo() }, 'Undo'),
          h('button', { class: 'ghost', type: 'button', onclick: () => pad.clear() }, 'Clear'));
        return;
      }
      const total = rec[0].length;
      const target = h('div', { class: 'writer' });
      stage.append(target);
      const size = Math.round(stage.getBoundingClientRect().width);
      writer = HanziWriter.create(target, c, {
        width: size, height: size, padding: Math.round(size * 0.06),
        showCharacter: false, showOutline: mode === 'outline',
        strokeColor: css('--stroke'), outlineColor: css('--guide'), drawingColor: css('--jade'), highlightColor: css('--gold'),
        drawingWidth: Math.max(14, Math.round(size / 16)), strokeAnimationSpeed: 1.2, delayBetweenStrokes: 220,
        showHintAfterMisses: mode === 'outline' ? 2 : 3, highlightOnComplete: false,
        charDataLoader: (ch, done) => done({ strokes: rec[0], medians: rec[2] }),
      });
      const mine = writer;
      const begin = () => {
        status.className = 'status';
        status.textContent = (mode === 'memory' ? 'Write ' + inf.py + ', “' + inf.en + '”, from memory. ' : 'Write over the grey outline. ') + 'Stroke 1 of ' + total + '.';
        mine.quiz({
          leniency: 1.15,
          onCorrectStroke: (d) => {
            status.className = 'status';
            status.textContent = d.strokesRemaining ? 'Stroke ' + (d.strokeNum + 2) + ' of ' + total + '.' : '';
          },
          onMistake: (d) => {
            status.className = 'status miss';
            status.textContent = 'Not that one. Stroke ' + (d.strokeNum + 1) + ' of ' + total + ': check where it starts and which way it runs.'
              + (d.mistakesOnStroke >= (mode === 'outline' ? 2 : 3) ? ' The gold stroke shows it.' : '');
          },
          onComplete: (d) => {
            if (writer !== mine) return;
            const slips = d.totalMistakes;
            tally.add(c, mode, slips);
            showRecord();
            status.className = 'status ' + (slips ? 'near' : 'good');
            status.textContent = slips
              ? 'Finished: all ' + total + ' strokes, with ' + slips + (slips === 1 ? ' slip' : ' slips') + ' on the way. Try it again for a clean run.'
              : 'Correct. All ' + total + ' strokes, in order, without a slip.';
            shown.hidden = false;
            timer = setTimeout(() => {              // show what was just written, part by part
              if (writer !== mine) return;
              const g = ZL.glyph(c, { cls: 'done', grid: false });
              stage.append(g.el);
            }, 700);
          },
        });
      };
      actions.replaceChildren(
        h('button', { class: 'ghost', type: 'button', onclick: start }, 'Start again'),
        h('button', { class: 'ghost', type: 'button', onclick: () => {
          if (writer !== mine) return;
          stage.querySelector('.glyph.done')?.remove();
          clearTimeout(timer);
          mine.cancelQuiz();
          mine.hideCharacter({ duration: 0 });
          status.className = 'status';
          status.textContent = 'Watch the strokes, then write them.';
          mine.animateCharacter({ onComplete: () => { if (writer === mine) timer = setTimeout(() => { mine.hideCharacter({ duration: 200 }); begin(); }, 500); } });
        } }, 'Show me first'));
      begin();
    }
    const chip = (key, label) => h('button', { class: 'chip' + (mode === key ? ' on' : ''), type: 'button', 'aria-pressed': mode === key ? 'true' : 'false', onclick: (e) => {
      mode = key;
      store.set('zl-mode', key);
      e.currentTarget.parentNode.querySelectorAll('.chip').forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      start();
    } }, label);
    cleanup = clear;
    showRecord();
    mount(
      backBar('Writing practice' + (practice.label ? ' · ' + practice.label : '')),
      h('header', { class: 'write-head' },
        h('h1', {}, shown, ' ', h('span', { class: 'py' }, inf.py), ' ', h('span', { class: 'gloss' }, inf.en)),
        h('div', { class: 'row' }, hearBtn([inf.py], c), h('button', { class: 'ghost', type: 'button', onclick: () => go(charLink(c)) }, 'Its parts'))),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'How to practise' }, chip('outline', 'With the outline'), chip('memory', 'From memory'), chip('free', 'Free hand')),
      stage, status, actions,
      list.length > 1 ? h('div', { class: 'row pager' },
        h('button', { class: 'ghost', type: 'button', disabled: at <= 0, onclick: () => go('w-' + ZL.hex(list[at - 1])) }, '‹ Previous'),
        h('span', { class: 'hint' }, (at + 1) + ' of ' + list.length),
        h('button', { class: 'primary', type: 'button', disabled: at >= list.length - 1, onclick: () => go('w-' + ZL.hex(list[at + 1])) }, 'Next ›')) : null,
      record,
      h('p', { class: 'hint' }, 'The check follows the mainland stroke order used by the stroke data. A few characters are ordered differently in Taiwan; where your teacher differs, follow your teacher.'));
    requestAnimationFrame(start);
  }

  // ---------------------------------------------------------------- the bench
  let bench = store.get('zl-bench', []);
  function benchView(idsArg) {
    if (idsArg) bench = idsArg.slice(0, 3);
    store.set('zl-bench', bench);
    const set = (ids) => go(ids.length ? 'a-' + ids.map(ZL.hex).join('-') : 'combine');
    const slot = (id, i) => {
      const e = ZL.element(id);
      return h('div', { class: 'slot filled' },
        h('button', { class: 'slot-main', type: 'button', onclick: () => go(partLink(id)) },
          h('span', { class: 'zh' }, e.forms.slice(0, 2).join(' ')), h('span', { class: 'py' }, e.py), h('span', { class: 'en' }, e.en)),
        h('button', { class: 'x', type: 'button', 'aria-label': 'Remove ' + id, onclick: () => set(bench.filter((_, j) => j !== i)) }, '×'));
    };
    const picker = h('div', { class: 'picker' });
    const pickInput = h('input', {
      type: 'search', id: 'pick', placeholder: 'Type a part: 心, heart, xin', 'aria-label': 'Find a part', autocomplete: 'off',
      oninput: () => drawPicker(),
    });
    function add(id) { if (bench.length < 3) set(bench.concat(id)); }
    function drawPicker() {
      const q = pickInput.value.trim();
      const found = q ? ZL.search(q, 24).map((c) => ZL.canon(c)).filter((x, i, a) => a.indexOf(x) === i) : ZL.elementIds();
      picker.replaceChildren(...found.map((id) => {
        const e = ZL.element(id);
        return h('button', { class: 'pick', type: 'button', onclick: () => add(id), title: e.en }, h('span', { class: 'zh' }, e.forms[0]), h('span', { class: 'en' }, e.en));
      }));
      if (!found.length) picker.append(h('p', { class: 'hint' }, 'No part found.'));
    }
    const out = h('div', { class: 'stack' });
    const head = [
      h('header', { class: 'mast small' }, h('div', {}, h('h1', {}, 'Combine'),
        h('p', { class: 'lede' }, 'Choose two or three parts and see every character they make, arrangement by arrangement.'))),
      h('div', { class: 'slots' }, bench.map(slot),
        bench.length < 3 ? h('div', { class: 'slot empty' }, bench.length ? 'Add another part' : 'Choose a part below') : null,
        bench.length ? h('button', { class: 'ghost', type: 'button', onclick: () => set([]) }, 'Start again') : null),
    ];

    if (bench.length === 0) {
      out.append(section('Try one of these',
        h('div', { class: 'recipes' }, ZL.core.recipes.map((rc) => {
          const hits = ZL.combine(rc.parts.map((p) => ZL.canon(p))).filter((x) => ZL.info(x.c).level === 1).slice(0, 4);
          return h('button', { class: 'recipe', type: 'button', onclick: () => set(rc.parts.map((p) => ZL.canon(p))) },
            h('span', { class: 'r-parts' }, rc.parts.join(' + ')),
            h('span', { class: 'r-arrow', 'aria-hidden': 'true' }, '→'),
            h('span', { class: 'r-out' }, hits.map((x) => x.c).join(' ')),
            h('span', { class: 'r-title' }, rc.title));
        }))));
    } else if (bench.length === 1) {
      const id = bench[0], e = ZL.element(id);
      const ps = ZL.partners(id).filter((p) => p.chars.some((c) => ZL.info(c).level === 1)).slice(0, 60);
      out.append(section('What ' + e.forms[0] + ' joins with',
        h('p', { class: 'hint' }, 'Each of these parts makes at least one character with ' + e.forms[0] + '. Tap one to see every arrangement.'),
        h('div', { class: 'partners' }, ps.map((p) => {
          const pe = ZL.element(p.id);
          return h('button', { class: 'partner', type: 'button', onclick: () => add(p.id) },
            h('span', { class: 'zh' }, pe.forms[0]), h('span', { class: 'en' }, pe.en),
            h('span', { class: 'makes' }, '→ ' + p.chars.filter((c) => ZL.info(c).level === 1).slice(0, 3).join(' ')));
        }))));
    } else {
      const hits = ZL.combine(bench);
      const names = bench.map((id) => ZL.element(id).forms[0]);
      const recipe = ZL.core.recipes.find((rc) => rc.parts.length === bench.length && rc.parts.map((p) => ZL.canon(p)).sort().join() === bench.slice().sort().join());
      const resultRow = (label, list, emptyText) => h('div', { class: 'arr' + (list.length ? '' : ' none') },
        h('div', { class: 'arr-label' }, label),
        list.length ? h('div', { class: 'tiles' }, list.map((x) => tile(x.c))) : h('div', { class: 'arr-empty' }, emptyText || 'No character in common use'));
      if (bench.length === 2) {
        const [a, b] = bench, [A, B] = names;
        const by = {};
        for (const x of hits) { const k = x.opened ? 'other' : ZL.arrangement(x, a); (by[k] = by[k] || []).push(x); }
        const rowsDef = a === b
          ? [['a-over-b', A + ' over ' + B], ['a-left', A + ' beside ' + B]]
          : [['a-over-b', A + ' over ' + B], ['b-over-a', B + ' over ' + A], ['a-left', A + ' at the left, ' + B + ' at the right'], ['b-left', B + ' at the left, ' + A + ' at the right']];
        const extra = [['a-around', A + ' around ' + B], ['b-around', B + ' around ' + A], ['woven', 'woven through each other']];
        if (a === b) { by['a-over-b'] = (by['a-over-b'] || []).concat(by['b-over-a'] || []); by['a-left'] = (by['a-left'] || []).concat(by['b-left'] || []); by['a-around'] = (by['a-around'] || []).concat(by['b-around'] || []); }
        out.append(section('Every arrangement of ' + A + ' and ' + B,
          recipe ? h('p', { class: 'see' }, tappable(recipe.note)) : null,
          rowsDef.map(([k, label]) => resultRow(label, by[k] || [])),
          extra.filter(([k]) => (by[k] || []).length).map(([k, label]) => resultRow(label, by[k])),
          (by.other || []).length ? h('div', { class: 'arr' }, h('div', { class: 'arr-label' }, 'With one of them opened into its own parts'),
            h('div', { class: 'tiles' }, by.other.map((x) => tile(x.c, { sub: x.how })))) : null));
      } else {
        out.append(section('Characters made of ' + names.join(', '),
          hits.length ? h('div', { class: 'tiles' }, hits.map((x) => tile(x.c, { sub: x.how }))) : h('p', { class: 'hint' }, 'No character in common use is made of exactly these three.')));
      }
      // characters that hold all of them, with something more
      const exact = new Set(hits.map((x) => x.c));
      const sets = bench.map((id) => new Set(ZL.family(id).map((f) => f.c)));
      const both = Array.from(sets[0]).filter((c) => sets.every((s) => s.has(c)) && !exact.has(c) && ZL.info(c).level === 1).sort((x, y) => ZL.rank(x) - ZL.rank(y));
      if (both.length) out.append(section('With something more added', h('p', { class: 'hint' }, 'These contain ' + names.join(' and ') + ' together with other parts.'), tileList(both, 12)));
      const facts = () => [
        'Parts chosen: ' + bench.map((id) => { const e = ZL.element(id); return e.forms.join('/') + ' ' + e.py + ' "' + e.en + '"'; }).join('; '),
        hits.length ? 'Characters in the learner\'s dictionary made of exactly these parts: ' + hits.map((x) => x.c + ' ' + ZL.info(x.c).py + ' "' + ZL.info(x.c).en + '" (' + x.how + ')' + (ZL.info(x.c).level === 2 ? ' [rare]' : '')).join('; ')
          : 'The learner\'s dictionary (about 7,000 Traditional characters) has no character made of exactly these parts.',
        bench.length === 2 ? 'Arrangements the dictionary does not have: ' + (['a-over-b', 'b-over-a', 'a-left', 'b-left'].filter((k) => !hits.some((x) => !x.opened && ZL.arrangement(x, bench[0]) === k)).map((k) => ({ 'a-over-b': names[0] + ' over ' + names[1], 'b-over-a': names[1] + ' over ' + names[0], 'a-left': names[0] + ' left of ' + names[1], 'b-left': names[1] + ' left of ' + names[0] }[k])).join('; ') || 'none') : '',
      ].filter(Boolean).join('\n');
      out.append(section('Ask Claude', askBox({
        noteKey: 'a-' + bench.slice().sort().join(''), facts, placeholder: 'Ask about this combination',
        presets: [
          ['Explain these', 'Explain how ' + names.join(' and ') + ' work together in each character that exists, and why the arrangement changes the meaning.'],
          ['The missing ones', 'For the arrangements of ' + names.join(' and ') + ' that have no common character: does a rare or variant character exist? If not, what would such a picture suggest?'],
          ['Theosophical reading', 'Read the family of characters made from ' + names.join(' and ') + ' as a Theosophical student might, staying close to the parts.'],
        ],
      })));
    }
    drawPicker();
    mount(...head, out,
      bench.length < 3 ? section(bench.length ? 'Add a part' : 'Or choose your own parts', h('div', { class: 'searchbar' }, pickInput), picker) : null);
  }

  // ---------------------------------------------------------------- routing
  let cleanup = null;
  const scrolls = new Map();
  let lastHash = null;
  function render() {
    if (cleanup) { cleanup(); cleanup = null; }
    ZL.hush();
    if (lastHash != null) scrolls.set(lastHash, window.scrollY);
    const name = (location.hash || '#text').slice(1);
    lastHash = name;
    let tab = 'text';
    const m = /^([a-z]+)(?:-(.+))?$/.exec(name) || [];
    const arg = m[2];
    if (m[1] === 'c' && arg && ZL.has(ZL.fromHex(arg))) { charView(ZL.fromHex(arg)); tab = store.get('zl-tab', 'text'); }
    else if (m[1] === 'w' && arg && ZL.has(ZL.fromHex(arg))) { writeView(ZL.fromHex(arg)); tab = store.get('zl-tab', 'text'); }
    else if (m[1] === 'p' && arg) { partView(ZL.fromHex(arg)); tab = 'parts'; }
    else if (m[1] === 'parts') { partsView(); tab = 'parts'; }
    else if (m[1] === 'combine') { benchView(null); tab = 'combine'; }
    else if (m[1] === 'a' && arg) { benchView(arg.split('-').map(ZL.fromHex).filter(Boolean)); tab = 'combine'; }
    else if (m[1] === 't' && arg) textView(parseInt(arg, 10));
    else textView(null);
    store.set('zl-tab', tab);
    tabs.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    const keep = /^(text|parts|combine|t-\d+)$/.test(name) && scrolls.has(name);
    window.scrollTo(0, keep ? scrolls.get(name) : 0);
  }
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) go(b.dataset.tab === 'text' ? 'text' : b.dataset.tab);
  });
  window.addEventListener('hashchange', render);

  ZL.load().then(render).catch((err) => {
    mount(h('p', { class: 'hint pad-top' }, 'The character data could not be loaded. Check the connection and reload the page.'));
    console.error(err);
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.claude) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
