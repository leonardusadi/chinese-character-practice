// Draws a character from its stroke outlines, each part in its own pigment.
(function () {
  'use strict';
  const ZL = (window.ZL = window.ZL || {});
  const NS = 'http://www.w3.org/2000/svg';
  const GRID = '<rect class="g-b" x="8" y="8" width="1008" height="1008" rx="28"/>' +
    '<g class="g-l"><line x1="8" y1="8" x2="1016" y2="1016"/><line x1="1016" y1="8" x2="8" y2="1016"/>' +
    '<line x1="512" y1="8" x2="512" y2="1016"/><line x1="8" y1="512" x2="1016" y2="512"/></g>';

  // Which pigment each part gets: parts that are the same shape share one.
  ZL.partColours = function (c) {
    const parts = ZL.parts(c), map = new Map();
    for (const p of parts) if (!map.has(p.id)) map.set(p.id, map.size % 6);
    return { parts, colourOf: (p) => map.get(p.id) };
  };

  ZL.glyph = function (c, opts) {
    opts = opts || {};
    const box = document.createElement('div');
    box.className = 'glyph' + (opts.cls ? ' ' + opts.cls : '');
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 1024 1024');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', c);
    svg.innerHTML = (opts.grid === false ? '' : GRID) + '<text class="g-t" x="512" y="560" text-anchor="middle" dominant-baseline="middle" font-size="760">' + c + '</text>';
    box.append(svg);
    const { parts, colourOf } = ZL.partColours(c);
    let paths = [], timer = null;
    const api = {
      el: box, ready: null, count: 0,
      // dim every part but one (id), or show them all (null)
      focus(id) { paths.forEach((p) => p.classList.toggle('dim', !!id && p.dataset.part !== id)); },
      show(n) { paths.forEach((p, i) => { p.style.display = i < n ? '' : 'none'; }); },
      stop() { clearInterval(timer); timer = null; api.show(paths.length); },
      play(onDone) {
        api.stop();
        if (!paths.length) return;
        let n = 0;
        api.show(0);
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        timer = setInterval(() => {
          n++;
          api.show(n);
          if (n >= paths.length) { clearInterval(timer); timer = null; if (onDone) onDone(); }
        }, reduce ? 120 : 420);
      },
    };
    api.ready = ZL.strokes(c).then((rec) => {
      if (!rec) return api;
      const tags = rec[1] ? rec[1].split(' ') : [];
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('transform', 'scale(1,-1) translate(0,-900)');
      rec[0].forEach((d, i) => {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', d);
        const tag = tags[i];
        const part = tag && tag !== '-' ? (parts.find((x) => x.path === tag) || parts.find((x) => x.path.startsWith(tag)) || parts.find((x) => tag.startsWith(x.path))) : null;
        p.setAttribute('class', 's' + (part && opts.colour !== false ? ' p' + colourOf(part) : ''));
        if (part) p.dataset.part = part.id;
        g.append(p);
        paths.push(p);
      });
      svg.querySelector('.g-t').remove();
      svg.append(g);
      api.count = paths.length;
      return api;
    });
    return api;
  };
})();
