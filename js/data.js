// Data: loads the dictionary, takes characters apart, and answers
// "which characters are built from these parts, and how are they arranged?"
(function () {
  'use strict';
  const ZL = (window.ZL = window.ZL || {});
  const OPS = '⿰⿱⿲⿳⿴⿵⿶⿷⿸⿹⿺⿻';
  const BASE = (window.ZL_BASE || '');

  let core = null, dict = null;
  const formToId = {};        // 忄 -> 心
  const elementById = {};     // hand-written notes on the common parts
  const treeCache = new Map();
  const strokeCache = new Map();
  let families = null, cuts = null, rank = null;

  const getJSON = (path) => fetch(BASE + path).then((r) => { if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); });

  ZL.load = async function () {
    [core, dict] = await Promise.all([getJSON('data/core.json'), getJSON('data/dict.json')]);
    for (const e of core.elements) {
      elementById[e.id] = e;
      for (const f of e.forms) if (f !== '阝') formToId[f] = e.id;
    }
    rank = new Map();
    let i = 0;
    for (const c of Object.keys(core.chars)) rank.set(c, i++);                  // the text first, in reading order
    for (const c of Object.keys(core.readings)) if (!rank.has(c)) rank.set(c, 1000 + i++);
    for (const c of Object.keys(dict)) if (!rank.has(c)) rank.set(c, (dict[c][4] === 1 ? 10000 : 100000) + i++);
    ZL.core = core;
    return core;
  };

  // ---- one character's record
  ZL.has = (c) => !!dict[c];
  ZL.info = function (c) {
    const d = dict[c] || ['', '', '', '', 0];
    const t = core.chars[c], r = core.readings[c] || {}, e = elementById[formToId[c] || c];
    const isForm = e && e.forms.includes(c) && c !== '阝';
    return {
      c,
      py: (t && t.py) || r.py || (isForm && e.py) || d[0].split(',')[0] || '',
      also: (t && t.also) || [],
      en: (t && t.gloss) || r.en || (isForm && e.en) || firstMeaning(d[1]),
      long: (t && t.long) || d[1],
      dictEn: d[1],
      ids: d[2],
      origin: d[3],
      level: d[4],
      page: t ? t.page : 0,
      reading: core.readings[c] || null,
    };
  };
  function firstMeaning(s) { return (s || '').split(/[;,]/)[0].replace(/^to /, '').trim(); }

  // ---- taking a character apart
  function parse(ids) {
    const s = Array.from(ids);
    let i = 0;
    const rec = () => {
      const ch = s[i++];
      if (ch === undefined) return '？';
      if (OPS.includes(ch)) {
        const n = ch === '⿲' || ch === '⿳' ? 3 : 2;
        const kids = [];
        for (let k = 0; k < n; k++) kids.push(rec());
        return { op: ch, kids };
      }
      return ch;
    };
    return rec();
  }
  ZL.tree = function (c) {
    if (!treeCache.has(c)) {
      const ids = dict[c] && dict[c][2];
      treeCache.set(c, ids ? parse(ids) : null);
    }
    return treeCache.get(c);
  };

  // The name a written form goes by. 阝 is a hillside at the left and a town at the right;
  // 王 at the left of a character is jade.
  ZL.canon = function (form, op, idx) {
    if (form === '阝') return op === '⿰' && idx === 1 ? '邑' : '阜';
    if (form === '王' && op === '⿰' && idx === 0) return '玉';
    return formToId[form] || form;
  };
  ZL.element = function (id) {
    const e = elementById[id];
    if (e) return e;
    const inf = ZL.info(id);
    return { id, forms: [id], py: inf.py, en: inf.en, pic: '' };
  };
  ZL.elementIds = () => core.elements.map((e) => e.id);

  const PLACE = {
    '⿰': ['left', 'right'], '⿱': ['top', 'bottom'], '⿲': ['left', 'middle', 'right'], '⿳': ['top', 'middle', 'bottom'],
    '⿴': ['around', 'inside'], '⿵': ['around', 'inside'], '⿶': ['around', 'inside'], '⿷': ['around', 'inside'],
    '⿸': ['around', 'inside'], '⿹': ['around', 'inside'], '⿺': ['around', 'inside'], '⿻': ['woven in', 'woven in'],
  };
  const PLACE_WORD = {
    left: 'at the left', right: 'at the right', top: 'on top', bottom: 'underneath', middle: 'in the middle',
    around: 'wrapped around', inside: 'inside', 'woven in': 'woven through',
  };
  ZL.placeWord = (p) => PLACE_WORD[p] || p;

  // The parts of a character as it is written: each with where it sits.
  ZL.parts = function (c) {
    const t = ZL.tree(c), out = [];
    if (!t || typeof t === 'string') return out;
    const walk = (node, path, places, op, idx) => {
      if (typeof node === 'string') {
        if (node === '？') return;
        out.push({ form: node, id: ZL.canon(node, op, idx), path: path.join(''), places, place: places[0], depth: places.length });
        return;
      }
      node.kids.forEach((k, i) => walk(k, path.concat(i), places.concat(PLACE[node.op][i]), node.op, i));
    };
    walk(t, [], [], null, 0);
    return out;
  };

  // How the parts are arranged, in words: "因 over 心".
  function describe(node, top) {
    if (typeof node === 'string') return node;
    const k = node.kids.map((x) => describe(x, false));
    let s;
    switch (node.op) {
      case '⿱': s = k[0] + ' over ' + k[1]; break;
      case '⿰': s = k[0] + ' beside ' + k[1]; break;
      case '⿲': s = k.join(', ') + ' side by side'; break;
      case '⿳': s = k.join(' over '); break;
      case '⿻': s = k[0] + ' woven through ' + k[1]; break;
      default: s = k[0] + ' around ' + k[1];
    }
    return top ? s : '(' + s + ')';
  }
  ZL.describe = (c) => { const t = ZL.tree(c); return t && typeof t !== 'string' ? describe(t, true) : ''; };

  // ---- families: every character a part appears in, grouped by where it sits
  function buildFamilies() {
    families = new Map();
    const deep = new Map();   // id -> Set of characters that contain it somewhere inside
    const direct = new Map(); // c -> Set of ids written in it
    for (const c of Object.keys(dict)) {
      if (!dict[c][4]) continue;
      const ps = ZL.parts(c);
      direct.set(c, new Set(ps.map((p) => p.id)));
      for (const p of ps) {
        if (!families.has(p.id)) families.set(p.id, []);
        families.get(p.id).push({ c, form: p.form, place: p.depth === 1 ? p.place : 'within', places: p.places });
      }
    }
    // characters that hold the part one level further in (唸 holds 念, which holds 心)
    const closure = new Map();
    const all = (c, guard) => {
      if (closure.has(c)) return closure.get(c);
      const set = new Set();
      closure.set(c, set);
      if (guard > 6) return set;
      for (const p of ZL.parts(c)) { set.add(p.id); if (p.id !== c) for (const x of all(p.form, guard + 1)) set.add(x); }
      return set;
    };
    for (const c of direct.keys()) {
      for (const id of all(c, 0)) {
        if (direct.get(c).has(id)) continue;
        if (!deep.has(id)) deep.set(id, []);
        deep.get(id).push(c);
      }
    }
    for (const [id, list] of deep) {
      if (!families.has(id)) families.set(id, []);
      for (const c of list) families.get(id).push({ c, form: id, place: 'deeper', places: [] });
    }
    for (const list of families.values()) list.sort((a, b) => rank.get(a.c) - rank.get(b.c));
  }
  ZL.family = function (id) {
    if (!families) buildFamilies();
    return families.get(id) || [];
  };
  ZL.rank = (c) => rank.get(c) ?? 1e9;

  // ---- combining: which characters are made of exactly these parts?
  function leaves(node, op, idx, out) {
    if (typeof node === 'string') { out.push(ZL.canon(node, op, idx)); return out; }
    node.kids.forEach((k, i) => leaves(k, node.op, i, out));
    return out;
  }
  // The tree with some of its leaves opened up one more level (相 -> 木 目).
  function expansions(c) {
    const t = ZL.tree(c);
    if (!t || typeof t === 'string') return [];
    const spots = [];
    const find = (node, parent, i) => {
      if (typeof node === 'string') {
        const sub = node !== c && !formToId[node] && ZL.tree(node);
        if (sub && typeof sub !== 'string') spots.push({ parent, i, sub });
      } else node.kids.forEach((k, j) => find(k, node, j));
    };
    find(t, null, 0);
    const out = [{ tree: t, opened: 0 }];
    const n = Math.min(spots.length, 3);
    for (let mask = 1; mask < (1 << n); mask++) {
      const copy = JSON.parse(JSON.stringify(t));
      const cs = [];
      const find2 = (node, parent, i) => {
        if (typeof node === 'string') { const sub = node !== c && !formToId[node] && ZL.tree(node); if (sub && typeof sub !== 'string') cs.push({ parent, i, sub }); }
        else node.kids.forEach((k, j) => find2(k, node, j));
      };
      find2(copy, null, 0);
      let opened = 0;
      for (let b = 0; b < n; b++) if (mask & (1 << b) && cs[b] && cs[b].parent) { cs[b].parent.kids[cs[b].i] = cs[b].sub; opened++; }
      if (opened) out.push({ tree: copy, opened });
    }
    return out;
  }
  function buildCuts() {
    cuts = new Map();
    for (const c of Object.keys(dict)) {
      if (!dict[c][4]) continue;
      const seen = new Set();
      for (const x of expansions(c)) {
        const ls = leaves(x.tree, null, 0, []);
        if (ls.length < 2 || ls.length > 4 || ls.includes('？')) continue;
        const key = ls.slice().sort().join('');
        if (seen.has(key)) continue;
        seen.add(key);
        if (!cuts.has(key)) cuts.set(key, []);
        cuts.get(key).push({ c, opened: x.opened, tree: x.tree, how: describe(x.tree, true) });
      }
    }
    for (const list of cuts.values()) list.sort((a, b) => a.opened - b.opened || rank.get(a.c) - rank.get(b.c));
  }
  ZL.combine = function (ids) {
    if (!cuts) buildCuts();
    return cuts.get(ids.slice().sort().join('')) || [];
  };
  // For two parts: which arrangement a result uses, from the first part's point of view.
  ZL.arrangement = function (hit, a) {
    const t = hit.tree;
    if (typeof t === 'string' || t.kids.length !== 2 || t.kids.some((k) => typeof k !== 'string')) return 'other';
    const first = ZL.canon(t.kids[0], t.op, 0) === a;
    if (t.op === '⿱') return first ? 'a-over-b' : 'b-over-a';
    if (t.op === '⿰') return first ? 'a-left' : 'b-left';
    if (t.op === '⿻') return 'woven';
    return first ? 'a-around' : 'b-around';
  };
  // Partners: the parts that make a character together with this one.
  ZL.partners = function (id) {
    if (!cuts) buildCuts();
    const out = new Map();
    for (const f of ZL.family(id)) {
      if (f.place === 'deeper' || f.place === 'within') continue;
      const ps = ZL.parts(f.c);
      if (ps.length !== 2) continue;
      const other = ps.find((p) => p.id !== id) || ps[1];
      if (!out.has(other.id)) out.set(other.id, { id: other.id, form: other.form, chars: [] });
      out.get(other.id).chars.push(f.c);
    }
    return Array.from(out.values()).sort((x, y) => y.chars.length - x.chars.length || ZL.rank(x.chars[0]) - ZL.rank(y.chars[0]));
  };

  // ---- search by character, pinyin (tones optional) or English
  const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ü/g, 'u').toLowerCase();
  ZL.search = function (q, limit) {
    q = q.trim();
    if (!q) return [];
    const out = [];
    const han = Array.from(q).filter((ch) => dict[ch] || formToId[ch]);
    for (const ch of han) if (!out.includes(ch)) out.push(ch);
    if (han.length) return out.slice(0, limit);
    const p = plain(q);
    const scored = [];
    for (const c of Object.keys(dict)) {
      if (!dict[c][4] && !core.chars[c]) continue;
      const inf = ZL.info(c);
      const py = plain(inf.py);
      let s = 0;
      if (py === p) s = 100;
      else if (inf.en.toLowerCase() === p) s = 95;
      else if (new RegExp('\\b' + p.replace(/[^a-z0-9 ]/g, '') + '\\b').test(inf.en.toLowerCase())) s = 80;
      else if (new RegExp('\\b' + p.replace(/[^a-z0-9 ]/g, '') + '\\b').test(inf.dictEn.toLowerCase())) s = 60;
      else if (p.length > 3 && inf.dictEn.toLowerCase().includes(p)) s = 40;
      if (s) scored.push([s - Math.min(30, ZL.rank(c) / 400), c]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    return scored.slice(0, limit).map((x) => x[1]);
  };

  // ---- stroke outlines
  ZL.strokes = function (c) {
    if (strokeCache.has(c)) return Promise.resolve(strokeCache.get(c));
    const shard = (c.codePointAt(0) % core.shards).toString(16).padStart(2, '0');
    return getJSON('data/strokes/' + shard + '.json').then((all) => {
      for (const k of Object.keys(all)) strokeCache.set(k, all[k]);
      if (!strokeCache.has(c)) strokeCache.set(c, null);
      return strokeCache.get(c);
    }).catch(() => null);
  };

  // ---- words that use a character
  ZL.wordsWith = (c) => core.words.filter((w) => w.w.includes(c));

  ZL.hex = (c) => c.codePointAt(0).toString(16);
  ZL.fromHex = (h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return ''; } };
})();
