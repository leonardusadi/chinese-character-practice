// A finger-drawing pad laid over the guide character. It only draws; nothing is graded.
(function () {
  'use strict';
  const ZL = (window.ZL = window.ZL || {});
  ZL.pad = function (canvas) {
    const ctx = canvas.getContext('2d');
    let strokes = [], current = null;
    function resize() {
      const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      if (!r.width) return;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    }
    function draw(st, w) {
      if (!st.length) return;
      ctx.beginPath();
      ctx.moveTo(st[0][0] * w, st[0][1] * w);
      if (st.length === 1) ctx.lineTo(st[0][0] * w + 0.1, st[0][1] * w);
      for (let i = 1; i < st.length - 1; i++) {
        ctx.quadraticCurveTo(st[i][0] * w, st[i][1] * w, (st[i][0] + st[i + 1][0]) / 2 * w, (st[i][1] + st[i + 1][1]) / 2 * w);
      }
      if (st.length > 1) ctx.lineTo(st[st.length - 1][0] * w, st[st.length - 1][1] * w);
      ctx.stroke();
    }
    function redraw() {
      const w = canvas.getBoundingClientRect().width;
      ctx.clearRect(0, 0, w, w);
      ctx.strokeStyle = getComputedStyle(canvas).color;
      ctx.lineWidth = Math.max(4, w / 34);
      ctx.lineCap = ctx.lineJoin = 'round';
      strokes.forEach((s) => draw(s, w));
      if (current) draw(current, w);
    }
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.width]; };
    canvas.addEventListener('pointerdown', (e) => {
      if (current) return;
      e.preventDefault();
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      current = [pos(e)];
      current.pid = e.pointerId;
      redraw();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!current || e.pointerId !== current.pid) return;
      e.preventDefault();
      current.push(pos(e));
      redraw();
    });
    const end = (e) => {
      if (!current || e.pointerId !== current.pid) return;
      strokes.push(current.slice());
      current = null;
      redraw();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    return {
      clear() { strokes = []; current = null; redraw(); },
      undo() { strokes.pop(); redraw(); },
      destroy() { ro.disconnect(); },
    };
  };
})();
