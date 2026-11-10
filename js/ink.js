// Moteur d'écriture manuscrite pour le Surface Pen.
// - Pression du stylet -> épaisseur du trait
// - Bouton gomme (bout du stylet) et bouton latéral -> gomme automatique
// - Rejet de la paume : le doigt fait défiler la page (option), et les touches
//   reçues pendant que le stylet est proche de l'écran sont ignorées.
// Les coordonnées sont stockées dans un repère fixe (page de 1000 unités de large),
// donc l'écriture reste nette quelle que soit la taille de la fenêtre.

const PAGE_W = 1000;
const MAX_H = 8000;
export const INK_COLORS = ['#1d1d1f', '#2b59c3', '#c0392b', '#1e8449', '#8e44ad', '#d35400'];
export const HL_COLORS = ['#ffd84d', '#8ee59a', '#ff9ec0', '#8fd0ff'];
const PEN_SIZES = [1.6, 2.8, 5];
const HL_SIZES = [16, 26, 38];
const ERASER_R = [8, 16, 32];
const PAPER = '#fffdf8';

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

function segDist(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  let t = l ? ((px - a[0]) * dx + (py - a[1]) * dy) / l : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

export class InkEditor {
  /** opts.imageUrl(id) -> Promise<data URL> : charge une image collée (store « files »). */
  constructor(scroller, data, onChange, opts = {}) {
    this.sc = scroller;
    this.strokes = data.strokes || [];
    // Images collées (comme OneNote) : { id, x, y, w, h } en unités de page, dessinées sous l'encre
    this.imgs = (data.images || []).map((o) => ({ ...o }));
    this.imgEls = new Map();
    this.imageUrl = opts.imageUrl || (async () => null);
    this.sel = null; // image sélectionnée (outil « Sélection »)
    this.drag = null;
    this.H = data.height || 1414;
    this.bg = data.bg || 'lines';
    this.onChange = onChange || (() => {});

    this.tool = 'pen';
    this.color = INK_COLORS[0];
    this.hlColor = HL_COLORS[0];
    this.sizeIdx = 1;
    this.fingerDraws = false;
    this.undoStack = [];
    this.redoStack = [];
    this.active = null;
    this.erasing = null;
    this.pan = null;
    this.lastPenHover = 0; // stylet détecté au-dessus de l'écran (sans contact)
    this.lastPenUp = 0; // fin du dernier contact du stylet
    this.momentum = 0; // animation d'élan du défilement au doigt

    this.page = document.createElement('div');
    this.page.className = 'ink-page';
    this.canvas = document.createElement('canvas');
    this.page.appendChild(this.canvas);
    this.sc.appendChild(this.page);
    this.ctx = this.canvas.getContext('2d');
    this.base = document.createElement('canvas'); // couche des traits validés
    this.bctx = this.base.getContext('2d');

    const c = this.canvas;
    this._h = {
      pointerdown: (e) => this.down(e),
      pointermove: (e) => this.move(e),
      pointerup: (e) => this.up(e),
      pointercancel: (e) => this.up(e),
      pointerleave: (e) => { if (e.pointerType === 'pen') this.lastPenHover = performance.now(); },
      contextmenu: (e) => e.preventDefault(),
    };
    for (const [k, fn] of Object.entries(this._h)) c.addEventListener(k, fn);
    // Filet de sécurité : si le doigt se lève hors de la page, le défilement ne reste pas « coincé »
    this._endPan = (e) => { if (this.pan && e.pointerId === this.pan.id) this.endPan(); };
    window.addEventListener('pointerup', this._endPan);
    window.addEventListener('pointercancel', this._endPan);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.sc);

    // Cadre de sélection d'une image : glisser pour déplacer, coin pour redimensionner, × pour retirer
    this.box = document.createElement('div');
    this.box.className = 'ink-sel';
    this.box.hidden = true;
    this.box.innerHTML = '<button type="button" class="ink-sel-del" aria-label="Retirer l’image" title="Retirer l’image (Suppr)">×</button><span class="ink-sel-h" aria-hidden="true"></span>';
    this.page.appendChild(this.box);
    this.box.addEventListener('pointerdown', (e) => this.boxDown(e));
    this.box.addEventListener('pointermove', (e) => this.boxMove(e));
    this.box.addEventListener('pointerup', (e) => this.boxUp(e));
    this.box.addEventListener('pointercancel', (e) => this.boxUp(e));
    this.box.querySelector('.ink-sel-del').addEventListener('click', (e) => { e.stopPropagation(); this.deleteSelected(); });

    this.resize();
    this.loadImages();
  }

  /* ---------- Images ---------- */
  async loadImages() {
    for (const im of this.imgs) {
      if (this.imgEls.has(im.id)) continue;
      const el = new Image();
      this.imgEls.set(im.id, el);
      const src = await this.imageUrl(im.id);
      if (!src) continue;
      el.onload = () => this.rebuild();
      el.src = src;
    }
  }

  setTool(t) {
    this.tool = t;
    if (t !== 'select') this.select(null);
    this.page.classList.toggle('selecting', t === 'select');
  }

  /** Ajoute une image (dimensions en pixels) au centre de la zone visible, ou à l'endroit at = [x, y] (clic droit). */
  addImage(id, pw, ph, at = null) {
    const w = Math.min(PAGE_W - 160, pw || 600);
    const h = Math.round((w * (ph || 400)) / (pw || 600));
    const cy = at ? at[1] + h / 2 : (this.sc.scrollTop + this.sc.clientHeight / 2) / this.scale;
    const y = Math.max(20, Math.round(cy - h / 2));
    const x = at ? Math.round(Math.max(0, Math.min(PAGE_W - w, at[0]))) : Math.round((PAGE_W - w) / 2);
    const img = { id, x, y, w: Math.round(w), h };
    if (y + h + 60 > this.H) { this.H = Math.min(MAX_H, y + h + 120); this.resize(true); }
    this.imgs.push(img);
    this.loadImages();
    this.rebuild();
    this.push({ type: 'img-add', img });
    this.select(img);
    return img;
  }

  imageAt(x, y) {
    for (let i = this.imgs.length - 1; i >= 0; i--) {
      const m = this.imgs[i];
      if (x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h) return m;
    }
    return null;
  }

  select(img) {
    this.sel = img;
    this.drawSel();
  }

  drawSel() {
    const m = this.sel;
    this.box.hidden = !m;
    if (!m) return;
    const k = this.scale;
    Object.assign(this.box.style, { left: m.x * k + 'px', top: m.y * k + 'px', width: m.w * k + 'px', height: m.h * k + 'px' });
  }

  deleteSelected() {
    const m = this.sel;
    if (!m) return false;
    const i = this.imgs.indexOf(m);
    if (i < 0) return false;
    this.imgs.splice(i, 1);
    this.select(null);
    this.rebuild();
    this.push({ type: 'img-del', img: m, i });
    return true;
  }

  boxDown(e) {
    if (!this.sel || e.target.closest('.ink-sel-del')) return;
    e.preventDefault();
    e.stopPropagation();
    try { this.box.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this.startDrag(e, !!e.target.closest('.ink-sel-h'));
  }

  startDrag(e, resize) {
    const m = this.sel;
    this.drag = { id: e.pointerId, resize, x: e.clientX, y: e.clientY, from: { x: m.x, y: m.y, w: m.w, h: m.h } };
  }

  boxMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const m = this.sel, k = this.scale;
    const dx = (e.clientX - d.x) / k, dy = (e.clientY - d.y) / k;
    if (d.resize) {
      const ratio = d.from.h / d.from.w;
      m.w = Math.round(Math.max(60, Math.min(PAGE_W - m.x, d.from.w + dx)));
      m.h = Math.round(m.w * ratio);
    } else {
      m.x = Math.round(Math.max(-m.w + 40, Math.min(PAGE_W - 40, d.from.x + dx)));
      m.y = Math.round(Math.max(0, Math.min(this.H - 40, d.from.y + dy)));
    }
    this.drawSel();
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.rebuild(); });
  }

  boxUp(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    const m = this.sel, f = d.from;
    if (m.x !== f.x || m.y !== f.y || m.w !== f.w || m.h !== f.h) {
      if (m.y + m.h + 60 > this.H && this.H < MAX_H) { this.H = Math.min(MAX_H, m.y + m.h + 120); this.resize(true); }
      this.push({ type: 'img-edit', img: m, from: f, to: { x: m.x, y: m.y, w: m.w, h: m.h } });
    }
  }

  destroy() {
    this.ro.disconnect();
    for (const [k, fn] of Object.entries(this._h)) this.canvas.removeEventListener(k, fn);
    window.removeEventListener('pointerup', this._endPan);
    window.removeEventListener('pointercancel', this._endPan);
    cancelAnimationFrame(this.momentum);
  }

  /* ---------- Défilement au doigt (avec élan) ---------- */
  startPan(e) {
    cancelAnimationFrame(this.momentum);
    this.pan = { id: e.pointerId, x: e.clientX, y: e.clientY, top: this.sc.scrollTop, left: this.sc.scrollLeft, samples: [[performance.now(), e.clientX, e.clientY]] };
    this.capture(e);
  }

  movePan(e) {
    const p = this.pan;
    this.sc.scrollTop = p.top - (e.clientY - p.y);
    this.sc.scrollLeft = p.left - (e.clientX - p.x);
    const now = performance.now();
    p.samples.push([now, e.clientX, e.clientY]);
    while (p.samples.length > 2 && now - p.samples[0][0] > 100) p.samples.shift();
  }

  endPan() {
    const p = this.pan;
    this.pan = null;
    if (!p) return;
    const [t0, x0, y0] = p.samples[0];
    const [t1, x1, y1] = p.samples[p.samples.length - 1];
    const dt = t1 - t0;
    if (dt <= 0 || performance.now() - t1 > 80) return; // doigt immobile avant de se lever : pas d'élan
    let vx = (x1 - x0) / dt, vy = (y1 - y0) / dt; // px/ms
    let last = performance.now();
    const step = (now) => {
      const d = Math.min(now - last, 40);
      last = now;
      this.sc.scrollTop -= vy * d;
      this.sc.scrollLeft -= vx * d;
      const f = Math.pow(0.95, d / 16);
      vx *= f; vy *= f;
      if (Math.abs(vx) + Math.abs(vy) > 0.02) this.momentum = requestAnimationFrame(step);
    };
    this.momentum = requestAnimationFrame(step);
  }

  /* ---------- Taille & rendu ---------- */
  resize(force = false) {
    const avail = this.sc.clientWidth - 24;
    const w = Math.round(Math.max(300, Math.min(avail, 1200)));
    const h = Math.round((this.H * w) / PAGE_W);
    if (!force && w === this.cssW && h === this.cssH) return;
    this.cssW = w;
    this.cssH = h;
    this.scale = w / PAGE_W;
    let dpr = window.devicePixelRatio || 1;
    while (w * dpr * h * dpr > 60e6 && dpr > 1) dpr -= 0.25; // limite mémoire du canvas
    this.dpr = dpr;
    for (const cv of [this.canvas, this.base]) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.rebuild();
    this.drawSel?.();
  }

  get k() { return this.scale * this.dpr; }

  renderTo(cv, k) {
    const c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = PAPER;
    c.fillRect(0, 0, cv.width, cv.height);
    c.setTransform(k, 0, 0, k, 0, 0);
    this.drawBg(c);
    for (const m of this.imgs || []) {
      const el = this.imgEls?.get(m.id);
      if (el?.complete && el.naturalWidth) c.drawImage(el, m.x, m.y, m.w, m.h);
      else { c.fillStyle = '#eef0f4'; c.fillRect(m.x, m.y, m.w, m.h); }
    }
    for (const s of this.strokes) this.drawStroke(c, s);
  }

  rebuild() {
    this.renderTo(this.base, this.k);
    this.blit();
  }

  blit() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.drawImage(this.base, 0, 0);
  }

  drawBg(c) {
    const H = this.H, step = 40;
    c.save();
    c.lineWidth = 1;
    if (this.bg === 'lines') {
      c.strokeStyle = '#cfd8e6';
      c.beginPath();
      for (let y = 120; y < H; y += step) { c.moveTo(0, y); c.lineTo(PAGE_W, y); }
      c.stroke();
      c.strokeStyle = '#f2b8b8';
      c.beginPath(); c.moveTo(90, 0); c.lineTo(90, H); c.stroke();
    } else if (this.bg === 'grid') {
      c.strokeStyle = '#dbe2ee';
      c.beginPath();
      for (let y = step; y < H; y += step) { c.moveTo(0, y); c.lineTo(PAGE_W, y); }
      for (let x = step; x < PAGE_W; x += step) { c.moveTo(x, 0); c.lineTo(x, H); }
      c.stroke();
    } else if (this.bg === 'dots') {
      c.fillStyle = '#aab4c6';
      for (let y = step; y < H; y += step) for (let x = step; x < PAGE_W; x += step) c.fillRect(x - 1.3, y - 1.3, 2.6, 2.6);
    }
    c.restore();
  }

  width(s, pr) { return s.size * (0.3 + 1.4 * pr); }

  /** Dessine le morceau de trait qui se termine au milieu de (i-1, i) — courbes lissées */
  seg(c, s, i) {
    const p = s.points, a = p[i - 1], b = p[i];
    const m1 = i >= 2 ? mid(p[i - 2], a) : a;
    const m2 = mid(a, b);
    c.strokeStyle = s.color;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = this.width(s, (a[2] + b[2]) / 2);
    c.beginPath();
    c.moveTo(m1[0], m1[1]);
    c.quadraticCurveTo(a[0], a[1], m2[0], m2[1]);
    c.stroke();
  }

  drawStroke(c, s) {
    const p = s.points;
    if (!p.length) return;
    c.save();
    if (s.tool === 'hl') {
      c.globalAlpha = 0.45;
      c.globalCompositeOperation = 'multiply';
      c.strokeStyle = s.color;
      c.lineWidth = s.size;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) {
        const m = mid(p[i - 1], p[i]);
        c.quadraticCurveTo(p[i - 1][0], p[i - 1][1], m[0], m[1]);
      }
      const l = p[p.length - 1];
      c.lineTo(l[0] + (p.length === 1 ? 0.1 : 0), l[1]);
      c.stroke();
    } else if (p.length === 1) {
      c.fillStyle = s.color;
      c.beginPath();
      c.arc(p[0][0], p[0][1], this.width(s, p[0][2]) / 2, 0, Math.PI * 2);
      c.fill();
    } else {
      for (let i = 1; i < p.length; i++) this.seg(c, s, i);
      const a = p[p.length - 2], b = p[p.length - 1], m = mid(a, b);
      c.lineWidth = this.width(s, b[2]);
      c.beginPath(); c.moveTo(m[0], m[1]); c.lineTo(b[0], b[1]); c.stroke();
    }
    c.restore();
  }

  /** Surligneur : on redessine la couche de base + le trait en cours (pas de superposition) */
  drawLive() {
    if (!this.active) return;
    const s = this.active.s;
    if (s.tool === 'hl') {
      this.blit();
      this.ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
      this.drawStroke(this.ctx, s);
    } else if (s.points.length === 1) {
      this.ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
      this.drawStroke(this.ctx, s);
    }
  }

  /* ---------- Entrées stylet / doigt / souris ---------- */
  pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / this.scale, (e.clientY - r.top) / this.scale];
  }

  capture(e) {
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
  }

  pressure(e) {
    if (e.pointerType !== 'pen') return 0.5;
    return e.pressure > 0 ? e.pressure : 0.05;
  }

  isEraser(e) {
    if (this.tool === 'eraser') return true;
    // Bout gomme du Surface Pen (button 5 / buttons 32) ou bouton latéral (button 2 / buttons 2)
    return e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) || e.button === 2 || (e.buttons & 2));
  }

  down(e) {
    const now = performance.now();
    this.lastPointer = e.pointerType; // pour savoir si un clic droit vient de la souris (menu) ou du stylet (gomme)
    if (e.pointerType === 'pen') {
      // Le stylet touche l'écran : on arrête tout défilement en cours (la paume a pu le lancer)
      this.pan = null;
      cancelAnimationFrame(this.momentum);
    }
    if (e.pointerType === 'touch') {
      // Rejet de la paume :
      // - pendant un trait (ou juste après), tout toucher est ignoré ;
      // - quand le stylet survole l'écran, seule une grande surface de contact (une paume) est ignorée :
      //   tu peux donc garder le stylet en main et faire défiler avec un doigt.
      const penBusy = this.active || this.erasing || now - this.lastPenUp < 350;
      const hovering = now - this.lastPenHover < 600;
      const palm = Math.max(e.width || 0, e.height || 0) > 40;
      if (penBusy || (hovering && palm)) { e.preventDefault(); return; }
      const onImage = this.tool === 'select' && this.imageAt(...this.pos(e));
      if (!this.fingerDraws && !onImage) {
        e.preventDefault();
        this.startPan(e); // un nouveau doigt reprend le défilement (jamais bloqué par un ancien)
        return;
      }
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.active || this.erasing) return;
    if (this.tool === 'select') {
      // Outil Sélection : toucher une image la sélectionne et la déplace ; ailleurs, on désélectionne
      const hit = this.imageAt(...this.pos(e));
      this.select(hit);
      if (hit) { e.preventDefault(); this.capture(e); this.startDrag(e, false); }
      return;
    }
    e.preventDefault();
    this.capture(e);
    const [x, y] = this.pos(e);
    if (this.isEraser(e)) {
      this.erasing = { id: e.pointerId, removed: [] };
      this.eraseAt(x, y);
      return;
    }
    const hl = this.tool === 'hl';
    this.active = {
      id: e.pointerId,
      s: {
        tool: hl ? 'hl' : 'pen',
        color: hl ? this.hlColor : this.color,
        size: hl ? HL_SIZES[this.sizeIdx] : PEN_SIZES[this.sizeIdx],
        points: [[r1(x), r1(y), r2(this.pressure(e))]],
      },
    };
    this.drawLive();
  }

  move(e) {
    if (e.pointerType === 'pen' && !this.active && !this.erasing) this.lastPenHover = performance.now();
    if (this.pan && e.pointerId === this.pan.id) {
      this.movePan(e);
      return;
    }
    if (this.drag && e.pointerId === this.drag.id) { this.boxMove(e); return; }
    const co = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const evs = co.length ? co : [e];
    if (this.erasing && e.pointerId === this.erasing.id) {
      for (const ev of evs) this.eraseAt(...this.pos(ev));
      return;
    }
    if (!this.active || e.pointerId !== this.active.id) return;
    const s = this.active.s, pts = s.points;
    if (s.tool === 'pen') this.ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    for (const ev of evs) {
      const [x, y] = this.pos(ev);
      const last = pts[pts.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) < 0.7) continue;
      const pr = last[2] * 0.55 + this.pressure(ev) * 0.45; // lissage de la pression
      pts.push([r1(x), r1(y), r2(pr)]);
      if (s.tool === 'pen') this.seg(this.ctx, s, pts.length - 1);
    }
    if (s.tool === 'hl') this.drawLive();
  }

  up(e) {
    if (e.pointerType === 'pen') this.lastPenUp = performance.now();
    if (this.pan && e.pointerId === this.pan.id) { this.endPan(); return; }
    if (this.drag && e.pointerId === this.drag.id) { this.boxUp(e); return; }
    if (this.erasing && e.pointerId === this.erasing.id) {
      const removed = this.erasing.removed;
      this.erasing = null;
      if (removed.length) this.push({ type: 'erase', items: removed });
      return;
    }
    if (this.active && e.pointerId === this.active.id) {
      const s = this.active.s;
      this.active = null;
      this.strokes.push(s);
      this.bctx.setTransform(this.k, 0, 0, this.k, 0, 0);
      this.drawStroke(this.bctx, s);
      this.blit();
      this.push({ type: 'add', stroke: s });
    }
  }

  eraseAt(x, y) {
    const r = ERASER_R[this.sizeIdx];
    let hit = false;
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const s = this.strokes[i];
      const rr = r + (s.tool === 'hl' ? s.size / 2 : s.size);
      const p = s.points;
      let touched = p.length === 1 && Math.hypot(p[0][0] - x, p[0][1] - y) <= rr;
      for (let j = 1; !touched && j < p.length; j++) touched = segDist(x, y, p[j - 1], p[j]) <= rr;
      if (touched) {
        this.erasing.removed.push({ s, i });
        this.strokes.splice(i, 1);
        hit = true;
      }
    }
    if (hit) this.rebuild();
  }

  /* ---------- Historique ---------- */
  push(op) {
    this.undoStack.push(op);
    if (this.undoStack.length > 300) this.undoStack.shift();
    this.redoStack = [];
    this.onChange();
  }

  undo() {
    const op = this.undoStack.pop();
    if (!op) return;
    if (op.type === 'add') {
      const i = this.strokes.lastIndexOf(op.stroke);
      if (i > -1) this.strokes.splice(i, 1);
    } else if (op.type === 'erase') {
      for (const it of [...op.items].reverse()) this.strokes.splice(it.i, 0, it.s);
    } else if (op.type === 'clear') {
      this.strokes = op.prev;
      if (op.prevImgs) this.imgs = op.prevImgs;
    } else if (op.type === 'img-add') {
      const i = this.imgs.indexOf(op.img);
      if (i > -1) this.imgs.splice(i, 1);
      if (this.sel === op.img) this.select(null);
    } else if (op.type === 'img-del') {
      this.imgs.splice(op.i, 0, op.img);
    } else if (op.type === 'img-edit') {
      Object.assign(op.img, op.from);
      this.drawSel();
    }
    this.redoStack.push(op);
    this.rebuild();
    this.onChange();
  }

  redo() {
    const op = this.redoStack.pop();
    if (!op) return;
    if (op.type === 'add') this.strokes.push(op.stroke);
    else if (op.type === 'erase') {
      for (const it of op.items) {
        const i = this.strokes.indexOf(it.s);
        if (i > -1) this.strokes.splice(i, 1);
      }
    } else if (op.type === 'clear') { this.strokes = []; if (op.prevImgs) { this.imgs = []; this.select(null); } }
    else if (op.type === 'img-add') this.imgs.push(op.img);
    else if (op.type === 'img-del') {
      const i = this.imgs.indexOf(op.img);
      if (i > -1) this.imgs.splice(i, 1);
      if (this.sel === op.img) this.select(null);
    } else if (op.type === 'img-edit') {
      Object.assign(op.img, op.to);
      this.drawSel();
    }
    this.undoStack.push(op);
    this.rebuild();
    this.onChange();
  }

  clear() {
    if (!this.strokes.length && !this.imgs.length) return;
    const prev = this.strokes, prevImgs = this.imgs;
    this.strokes = [];
    this.imgs = [];
    this.select(null);
    this.rebuild();
    this.push({ type: 'clear', prev, prevImgs });
  }

  /* ---------- Page ---------- */
  setBg(bg) { this.bg = bg; this.rebuild(); this.onChange(); }

  extend() {
    if (this.H >= MAX_H) return false;
    this.H = Math.min(MAX_H, this.H + 700);
    this.resize(true);
    this.onChange();
    return true;
  }

  thumbnail() {
    const t = document.createElement('canvas');
    t.width = 240;
    t.height = Math.round(240 * 1.414);
    const c = t.getContext('2d');
    c.fillStyle = PAPER;
    c.fillRect(0, 0, t.width, t.height);
    const sh = Math.min(this.base.height, this.base.width * 1.414);
    c.drawImage(this.base, 0, 0, this.base.width, sh, 0, 0, 240, (240 * sh) / this.base.width);
    return t.toDataURL('image/jpeg', 0.75);
  }

  exportPNG(name) {
    const cv = document.createElement('canvas');
    const k = 2; // 2000 px de large
    cv.width = PAGE_W * k;
    cv.height = Math.min(this.H * k, 16000);
    this.renderTo(cv, k);
    cv.toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = (name || 'page').replace(/[\\/:*?"<>|]/g, '-') + '.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }, 'image/png');
  }
}
