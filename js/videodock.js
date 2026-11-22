// 📺 Dock vidéo : un espace réservé dans l'app pour regarder une vidéo pendant que tu travailles.
// - PC : une colonne à droite (la page se rétrécit, rien n'est caché) ; trois largeurs.
// - Cellulaire : une bande au-dessus de la barre du bas, qu'on peut réduire.
// - Vide, il sert de place pour la fenêtre « image dans l'image » du navigateur.
// - La vidéo et l'endroit où tu étais rendu sont gardés sur cet appareil (reprise au même moment).
import * as U from './util.js';

const { esc } = U;
const LS = 'lp.vdock';
const WIDTHS = { s: 340, m: 440, l: 600 };
let st = load(); // { open, min, w: 's'|'m'|'l', v: { id, start, title, noteId } | null }
let lastSave = 0;

function load() {
  try { return { open: false, min: false, w: 'm', v: null, ...(JSON.parse(localStorage.getItem(LS)) || {}) }; } catch { return { open: false, min: false, w: 'm', v: null }; }
}
function save() { try { localStorage.setItem(LS, JSON.stringify(st)); } catch { /* ignore */ } }

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function el() {
  let d = document.getElementById('vdock');
  if (!d) {
    d = document.createElement('aside');
    d.id = 'vdock';
    d.setAttribute('aria-label', 'Dock vidéo');
    document.getElementById('view')?.after(d);
  }
  return d;
}

function draw({ autoplay = false } = {}) {
  const d = el();
  document.body.classList.toggle('vdock-on', st.open);
  document.body.classList.toggle('vdock-min', st.open && st.min);
  document.documentElement.style.setProperty('--vdock-w', WIDTHS[st.w] + 'px');
  if (!st.open) { d.innerHTML = ''; d.hidden = true; placeFloat(); return; }
  d.hidden = false;
  const v = st.v;
  d.innerHTML = `<div class="vd-head">
      <span class="vd-title" title="${esc(v?.title || 'Espace vidéo')}">📺 ${esc(v?.title || 'Espace vidéo')}</span>
      ${v?.noteId ? `<a class="vd-btn" href="#/note/${esc(v.noteId)}" title="Ouvrir la note">🧠</a>` : ''}
      <span class="vd-sizes" role="group" aria-label="Largeur">${Object.keys(WIDTHS).map((k) => `<button type="button" class="vd-btn ${st.w === k ? 'on' : ''}" data-w="${k}" title="Largeur ${k === 's' ? 'petite' : k === 'm' ? 'moyenne' : 'grande'}">${k.toUpperCase()}</button>`).join('')}</span>
      ${v ? '<button type="button" class="vd-btn" data-act="eject" title="Retirer la vidéo (garder la place réservée)" aria-label="Retirer la vidéo">⏏</button>' : ''}
      <button type="button" class="vd-btn vd-min" data-act="min" title="${st.min ? 'Agrandir' : 'Réduire'}" aria-label="${st.min ? 'Agrandir' : 'Réduire'}">${st.min ? '▴' : '▾'}</button>
      <button type="button" class="vd-btn" data-act="close" title="Fermer le dock" aria-label="Fermer le dock">✕</button>
    </div>
    <div class="vd-body">${v ? `<div class="vd-frame"><iframe id="vd-iframe" src="https://www.youtube-nocookie.com/embed/${esc(v.id)}?rel=0&modestbranding=1&enablejsapi=1&playsinline=1${v.start ? '&start=' + Math.floor(v.start) : ''}${autoplay ? '&autoplay=1' : ''}&origin=${encodeURIComponent(location.origin)}"
        title="Lecteur vidéo" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>
      <div class="vd-foot"><span class="muted" id="vd-at">${v.start ? `Reprise à ${fmt(v.start)}` : ''}</span><a href="https://www.youtube.com/watch?v=${esc(v.id)}${v.start ? '&t=' + Math.floor(v.start) + 's' : ''}" target="_blank" rel="noopener" class="vd-link">Ouvrir sur YouTube ↗</a></div>`
      : `<div class="vd-empty"><b>Place réservée</b><p>Glisse ici ta fenêtre « image dans l'image », ou lance une vidéo de ton Cerveau avec <b>▶</b> sur sa carte.</p></div>`}</div><span class="vd-grip" title="Glisser pour redimensionner" aria-hidden="true"></span>`;
  d.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { st.w = b.dataset.w; save(); draw(); }));
  d.querySelector('[data-act="min"]').onclick = () => { st.min = !st.min; save(); draw(); };
  d.querySelector('[data-act="close"]').onclick = () => close();
  d.querySelector('[data-act="eject"]')?.addEventListener('click', () => { st.v = null; save(); draw(); });
  bindFloat(d);
  placeFloat();
  // Le lecteur YouTube envoie l'heure de lecture : on la garde pour reprendre au même endroit
  const f = d.querySelector('#vd-iframe');
  if (f) f.addEventListener('load', () => { try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'vdock' }), '*'); } catch { /* ignore */ } });
}

addEventListener('message', (e) => {
  if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin || 'http://x').hostname) || !st.v) return;
  let data;
  try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
  const t = data?.info?.currentTime;
  if (typeof t !== 'number' || t < 1) return;
  st.v.start = t;
  const at = document.getElementById('vd-at');
  if (at) at.textContent = `${fmt(t)}`;
  if (Date.now() - lastSave > 4000) { lastSave = Date.now(); save(); }
});

/** Ouvre le dock avec une vidéo YouTube (ou vide : place réservée). */
export function open(video = null, { autoplay = true } = {}) {
  st.open = true;
  st.min = false;
  // Même vidéo qu'avant : on reprend où tu étais rendu
  if (video) st.v = st.v?.id === video.id ? { ...video, start: st.v.start || video.start || 0 } : { ...video };
  save();
  draw({ autoplay: !!video && autoplay });
}
export function close() { st.open = false; save(); draw(); }
/** Bouton « 📺 Espace vidéo » : ouvre ou ferme le dock. */
export function toggle() { if (st.open) close(); else open(); }
export const isOpen = () => st.open;

/** Au démarrage : remet le dock tel qu'il était (vidéo en pause, au même moment). */
export function start() {
  if (st.open) draw();
  addEventListener('beforeunload', save);
}

/* ---------- Carte flottante (fenêtre verticale) : on la déplace par son titre et on la redimensionne par le coin ---------- */
const FLOAT_MQ = matchMedia('(orientation: portrait) and (min-width: 601px)');
const isFloat = () => FLOAT_MQ.matches;
const MIN_W = 240;

/** Applique la position/taille gardées (st.f = { x, y, w }), en restant dans l'écran. */
function placeFloat() {
  const d = document.getElementById('vdock');
  if (!d) return;
  const free = st.open && isFloat() && st.f;
  document.body.classList.toggle('vdock-free', !!free);
  if (!free) { d.style.left = d.style.top = d.style.width = d.style.right = d.style.bottom = ''; wrapAround(null); return; }
  const w = Math.max(MIN_W, Math.min(st.f.w || 400, innerWidth - 16));
  d.style.width = st.min ? '' : w + 'px';
  d.style.right = d.style.bottom = 'auto';
  const r = d.getBoundingClientRect();
  const x = Math.max(8, Math.min(st.f.x, innerWidth - r.width - 8));
  const y = Math.max(8, Math.min(st.f.y, innerHeight - Math.min(r.height, innerHeight - 16) - 8));
  d.style.left = x + 'px';
  d.style.top = y + 'px';
  if (!d.classList.contains('vd-moving')) wrapAround(d);
}

/** La page se replace autour de la carte : on lui retire la bande (haut, bas, gauche ou droite) qui coûte le moins de place. */
function wrapAround(d) {
  const s = document.body.style;
  const SIDES = ['t', 'r', 'b', 'l'];
  SIDES.forEach((k) => s.removeProperty(`--vd-m${k}`));
  const main = document.querySelector('main');
  if (!d || !main) return;
  const m = main.getBoundingClientRect(), r = d.getBoundingClientRect();
  if (r.right <= m.left || r.left >= m.right || r.bottom <= m.top || r.top >= m.bottom) return; // ne cache rien
  const gap = 10;
  const opts = [
    { k: 't', v: r.bottom - m.top + gap, lost: (r.bottom - m.top + gap) * m.width },
    { k: 'b', v: m.bottom - r.top + gap, lost: (m.bottom - r.top + gap) * m.width },
    { k: 'l', v: r.right - m.left + gap, lost: (r.right - m.left + gap) * m.height, w: true },
    { k: 'r', v: m.right - r.left + gap, lost: (m.right - r.left + gap) * m.height, w: true },
  ].filter((o) => (o.w ? m.width - o.v >= 360 : m.height - o.v >= 200));
  if (!opts.length) return;
  const best = opts.sort((a, b) => a.lost - b.lost)[0];
  s.setProperty(`--vd-m${best.k}`, Math.round(best.v) + 'px');
}

function bindFloat(d) {
  const head = d.querySelector('.vd-head');
  const grip = d.querySelector('.vd-grip');
  const drag = (e, onMove) => {
    if (!isFloat() || e.button > 0) return;
    e.preventDefault();
    const r = d.getBoundingClientRect();
    st.f = { w: st.f?.w || (st.min ? 400 : r.width), x: r.left, y: r.top };
    const sx = e.clientX, sy = e.clientY, start = { ...st.f };
    d.classList.add('vd-moving');
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const move = (ev) => { onMove(ev.clientX - sx, ev.clientY - sy, start); placeFloat(); };
    const up = () => {
      d.classList.remove('vd-moving');
      placeFloat();
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      save();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  };
  head?.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, a')) return;
    drag(e, (dx, dy, s) => { st.f.x = s.x + dx; st.f.y = s.y + dy; });
  });
  // Double-clic sur le titre : remettre la carte à sa place (coin en bas à droite)
  head?.addEventListener('dblclick', (e) => {
    if (e.target.closest('button, a') || !isFloat()) return;
    st.f = null; save(); placeFloat();
  });
  grip?.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    drag(e, (dx, dy, s) => { st.f.w = Math.max(MIN_W, Math.min(s.w + Math.max(dx, dy * 16 / 9), innerWidth - s.x - 8)); });
  });
}
FLOAT_MQ.addEventListener?.('change', placeFloat);
addEventListener('resize', () => { if (st.open && st.f) placeFloat(); });
