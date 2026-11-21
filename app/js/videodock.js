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
  if (!st.open) { d.innerHTML = ''; d.hidden = true; return; }
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
      : `<div class="vd-empty"><b>Place réservée</b><p>Glisse ici ta fenêtre « image dans l'image », ou lance une vidéo de ton Cerveau avec <b>▶</b> sur sa carte.</p></div>`}</div>`;
  d.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { st.w = b.dataset.w; save(); draw(); }));
  d.querySelector('[data-act="min"]').onclick = () => { st.min = !st.min; save(); draw(); };
  d.querySelector('[data-act="close"]').onclick = () => close();
  d.querySelector('[data-act="eject"]')?.addEventListener('click', () => { st.v = null; save(); draw(); });
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
