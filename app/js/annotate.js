// ✏️ Annoter une image : stylo (pression du stylet), surligneur, flèche, cadre, texte, gomme, annuler/rétablir.
// annotate(blob) ouvre l'éditeur plein écran et renvoie la nouvelle image (Blob) ou null si on annule.
// Les annotations sont gardées en coordonnées de l'image : l'export se fait en pleine résolution.

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#111827', '#ffffff'];
const SIZES = [3, 6, 12]; // en pixels écran ; convertis selon l'échelle de l'image
const MAX_OUT = 2400; // plus grand côté de l'image exportée
const TOOLS = [
  ['pen', '✏️', 'Stylo'], ['hl', '🖍', 'Surligneur'], ['arrow', '➜', 'Flèche'], ['rect', '▭', 'Cadre'], ['text', 'T', 'Texte'], ['eraser', '🧽', 'Gomme'],
];

function loadImage(blob) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Image illisible'));
    img.src = URL.createObjectURL(blob);
  });
}

export async function annotate(blob) {
  const img = await loadImage(blob);
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'an-root';
    root.innerHTML = `<div class="an-bar">
        <div class="an-group">${TOOLS.map(([k, e, l], i) => `<button type="button" class="an-tool ${i ? '' : 'on'}" data-tool="${k}" title="${l}" aria-label="${l}">${e}</button>`).join('')}</div>
        <div class="an-group">${COLORS.map((c, i) => `<button type="button" class="an-color ${i ? '' : 'on'}" data-color="${c}" style="--c:${c}" aria-label="Couleur ${c}"></button>`).join('')}</div>
        <div class="an-group">${SIZES.map((s, i) => `<button type="button" class="an-size ${i === 1 ? 'on' : ''}" data-size="${i}" aria-label="Épaisseur ${i + 1}"><i style="width:${s + 2}px;height:${s + 2}px"></i></button>`).join('')}</div>
        <div class="an-group"><button type="button" data-act="undo" title="Annuler (Ctrl + Z)" aria-label="Annuler">↶</button><button type="button" data-act="redo" title="Rétablir (Ctrl + Y)" aria-label="Rétablir">↷</button></div>
        <span class="an-grow"></span>
        <button type="button" class="an-cancel" data-act="cancel">Annuler</button>
        <button type="button" class="an-save" data-act="save">✓ Enregistrer</button>
      </div>
      <div class="an-stage"><canvas></canvas></div>`;
    document.body.append(root);
    document.body.classList.add('an-open');
    const stage = root.querySelector('.an-stage'), cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
    let tool = 'pen', color = COLORS[0], sizeIdx = 1, scale = 1, dpr = 1;
    const ops = [], redo = [];
    let cur = null;

    // Taille : l'image tient dans la zone, en gardant ses proportions
    const fit = () => {
      const r = stage.getBoundingClientRect();
      scale = Math.min((r.width - 24) / img.naturalWidth, (r.height - 24) / img.naturalHeight, 1.5);
      dpr = window.devicePixelRatio || 1;
      cv.style.width = Math.round(img.naturalWidth * scale) + 'px';
      cv.style.height = Math.round(img.naturalHeight * scale) + 'px';
      cv.width = Math.round(img.naturalWidth * scale * dpr);
      cv.height = Math.round(img.naturalHeight * scale * dpr);
      draw();
    };
    // Dessin d'une opération dans un contexte à l'échelle k (k = pixels par pixel d'image)
    const paint = (c, op, k) => {
      c.save();
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = op.color; c.fillStyle = op.color;
      if (op.t === 'pen' || op.t === 'hl') {
        c.globalAlpha = op.t === 'hl' ? 0.35 : 1;
        if (op.t === 'hl') c.globalCompositeOperation = 'multiply';
        const p = op.pts;
        for (let i = 1; i < p.length; i++) {
          c.lineWidth = op.w * (op.t === 'pen' ? 0.6 + p[i][2] * 0.8 : 1) * k;
          c.beginPath(); c.moveTo(p[i - 1][0] * k, p[i - 1][1] * k); c.lineTo(p[i][0] * k, p[i][1] * k); c.stroke();
        }
        if (p.length === 1) { c.beginPath(); c.arc(p[0][0] * k, p[0][1] * k, (op.w * k) / 2, 0, Math.PI * 2); c.fill(); }
      } else if (op.t === 'arrow') {
        const { x1, y1, x2, y2 } = op, w = op.w * k;
        c.lineWidth = w;
        c.beginPath(); c.moveTo(x1 * k, y1 * k); c.lineTo(x2 * k, y2 * k); c.stroke();
        const a = Math.atan2(y2 - y1, x2 - x1), h = Math.max(12, op.w * 3.2) * k;
        c.beginPath(); c.moveTo(x2 * k, y2 * k);
        c.lineTo(x2 * k - h * Math.cos(a - 0.45), y2 * k - h * Math.sin(a - 0.45));
        c.lineTo(x2 * k - h * Math.cos(a + 0.45), y2 * k - h * Math.sin(a + 0.45));
        c.closePath(); c.fill();
      } else if (op.t === 'rect') {
        c.lineWidth = op.w * k;
        c.strokeRect(Math.min(op.x1, op.x2) * k, Math.min(op.y1, op.y2) * k, Math.abs(op.x2 - op.x1) * k, Math.abs(op.y2 - op.y1) * k);
      } else if (op.t === 'text') {
        c.font = `700 ${op.size * k}px "Segoe UI", system-ui, sans-serif`;
        c.textBaseline = 'top';
        // Contour contrasté : le texte reste lisible sur n'importe quelle photo
        c.lineWidth = Math.max(2, op.size * 0.18) * k;
        c.strokeStyle = op.color === '#ffffff' ? '#111827' : '#ffffff';
        op.text.split('\n').forEach((line, i) => { c.strokeText(line, op.x * k, (op.y + i * op.size * 1.2) * k); c.fillText(line, op.x * k, (op.y + i * op.size * 1.2) * k); });
      }
      c.restore();
    };
    const draw = () => {
      const k = scale * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      for (const op of ops) paint(ctx, op, k);
      if (cur) paint(ctx, cur, k);
    };
    // Coordonnées dans l'image
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale]; };
    const width = () => SIZES[sizeIdx] / scale;
    // Gomme : retire l'annotation la plus récente touchée
    const hit = (op, x, y, R) => {
      const near = (px, py) => Math.hypot(px - x, py - y) <= R + op.w;
      if (op.pts) return op.pts.some(([px, py]) => near(px, py));
      if (op.t === 'arrow') { for (let s = 0; s <= 1; s += 0.05) if (near(op.x1 + (op.x2 - op.x1) * s, op.y1 + (op.y2 - op.y1) * s)) return true; return false; }
      if (op.t === 'rect') { const x1 = Math.min(op.x1, op.x2), x2 = Math.max(op.x1, op.x2), y1 = Math.min(op.y1, op.y2), y2 = Math.max(op.y1, op.y2); return x >= x1 - R && x <= x2 + R && y >= y1 - R && y <= y2 + R && !(x > x1 + R && x < x2 - R && y > y1 + R && y < y2 - R); }
      if (op.t === 'text') { const lines = op.text.split('\n'); const w = Math.max(...lines.map((l) => l.length)) * op.size * 0.6; return x >= op.x - R && x <= op.x + w + R && y >= op.y - R && y <= op.y + lines.length * op.size * 1.2 + R; }
      return false;
    };
    const erase = (x, y) => {
      for (let i = ops.length - 1; i >= 0; i--) if (hit(ops[i], x, y, 10 / scale)) { redo.length = 0; redo.push({ undoErase: ops[i], at: i }); ops.splice(i, 1); draw(); return; }
    };

    cv.addEventListener('pointerdown', (e) => {
      if (e.button > 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      const [x, y] = pos(e);
      const isEraser = tool === 'eraser' || (e.pointerType === 'pen' && (e.button === 5 || e.buttons & 32));
      if (isEraser) { cur = { t: 'erase' }; erase(x, y); cv.setPointerCapture(e.pointerId); return; }
      if (tool === 'text') return placeText(e, x, y);
      cv.setPointerCapture(e.pointerId);
      const pr = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5;
      cur = tool === 'pen' || tool === 'hl' ? { t: tool, color, w: tool === 'hl' ? width() * 3 : width(), pts: [[x, y, pr]] }
        : { t: tool, color, w: width(), x1: x, y1: y, x2: x, y2: y };
      draw();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!cur) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs.length ? evs : [e]) {
        const [x, y] = pos(ev);
        if (cur.t === 'erase') erase(x, y);
        else if (cur.pts) cur.pts.push([x, y, ev.pointerType === 'pen' ? ev.pressure || 0.5 : 0.5]);
        else { cur.x2 = x; cur.y2 = y; }
      }
      if (cur.t !== 'erase') draw();
    });
    const up = () => {
      if (!cur) return;
      if (cur.t !== 'erase') {
        const tiny = cur.pts ? false : Math.hypot(cur.x2 - cur.x1, cur.y2 - cur.y1) < 4 / scale;
        if (!tiny) { ops.push(cur); redo.length = 0; }
      }
      cur = null;
      draw();
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);

    // Texte : un champ apparaît là où on touche ; Entrée valide, Maj + Entrée = nouvelle ligne
    function placeText(e, x, y) {
      const r = stage.getBoundingClientRect();
      const ta = document.createElement('textarea');
      ta.className = 'an-text';
      ta.style.left = (e.clientX - r.left) + 'px';
      ta.style.top = (e.clientY - r.top) + 'px';
      ta.style.color = color;
      const size = [18, 28, 44][sizeIdx];
      ta.style.fontSize = size + 'px';
      ta.rows = 1;
      ta.placeholder = 'Écris…';
      stage.append(ta);
      setTimeout(() => ta.focus(), 0);
      const commit = () => {
        const v = ta.value.trim();
        ta.remove();
        if (v) { ops.push({ t: 'text', color, size: size / scale, x, y, text: v, w: 0 }); redo.length = 0; draw(); }
      };
      ta.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commit(); }
        if (ev.key === 'Escape') { ev.stopPropagation(); ta.remove(); }
      });
      ta.addEventListener('blur', commit, { once: true });
      ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; });
    }

    const undo = () => {
      const last = redo[redo.length - 1];
      if (last?.undoErase && !ops.includes(last.undoErase)) { redo.pop(); ops.splice(last.at, 0, last.undoErase); draw(); return; }
      if (!ops.length) return;
      redo.push(ops.pop()); draw();
    };
    const redoOp = () => { const r = redo.pop(); if (!r) return; if (r.undoErase) { const i = ops.indexOf(r.undoErase); if (i >= 0) ops.splice(i, 1); } else ops.push(r); draw(); };

    const close = (result) => {
      removeEventListener('resize', fit);
      removeEventListener('keydown', onKey, true);
      document.body.classList.remove('an-open');
      root.remove();
      URL.revokeObjectURL(img.src);
      resolve(result);
    };
    const save = () => {
      if (!ops.length) return close(null); // rien d'annoté : l'image ne change pas
      const k = Math.min(1, MAX_OUT / Math.max(img.naturalWidth, img.naturalHeight));
      const out = document.createElement('canvas');
      out.width = Math.round(img.naturalWidth * k);
      out.height = Math.round(img.naturalHeight * k);
      const c = out.getContext('2d');
      c.drawImage(img, 0, 0, out.width, out.height);
      for (const op of ops) paint(c, op, k);
      out.toBlob((b) => close(b), 'image/jpeg', 0.9);
    };
    const onKey = (e) => {
      if (e.target.closest?.('.an-text')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); e.stopPropagation(); redoOp(); }
      else if (e.key === 'Escape') { e.stopPropagation(); close(null); }
    };
    addEventListener('keydown', onKey, true);
    addEventListener('resize', fit);

    root.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => { tool = b.dataset.tool; root.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x === b)); cv.style.cursor = tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair'; }));
    root.querySelectorAll('[data-color]').forEach((b) => (b.onclick = () => { color = b.dataset.color; root.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b)); }));
    root.querySelectorAll('[data-size]').forEach((b) => (b.onclick = () => { sizeIdx = Number(b.dataset.size); root.querySelectorAll('[data-size]').forEach((x) => x.classList.toggle('on', x === b)); }));
    root.querySelector('[data-act="undo"]').onclick = undo;
    root.querySelector('[data-act="redo"]').onclick = redoOp;
    root.querySelector('[data-act="cancel"]').onclick = () => close(null);
    root.querySelector('[data-act="save"]').onclick = save;
    requestAnimationFrame(fit);
  });
}
