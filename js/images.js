// Images des notes (photos, captures d'écran) : collées, glissées ou choisies avec 📷.
// Chaque image est réduite (1600 px max) et compressée, puis rangée dans le store « files »
// (synchronisé comme le reste). Une note y fait référence par une ligne « ![](img:<id>) ».

import { db } from './db.js';
import { uid } from './util.js';

const MAX = 1600;
export const REF_RE = /!\[[^\]\n]*\]\(img:([a-z0-9]+)\)/g;
export const refsIn = (body = '') => [...new Set([...body.matchAll(REF_RE)].map((m) => m[1]))];
export const refLine = (id) => `![](img:${id})`;

/** Images d'un presse-papiers ou d'un glisser-déposer. */
export function imageFiles(dt) {
  if (!dt) return [];
  const files = [...(dt.files || [])].filter((f) => f.type.startsWith('image/'));
  if (files.length) return files;
  return [...(dt.items || [])].filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean);
}

async function decode(blob) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(blob); } catch { /* format non géré : on essaie avec <img> */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

/** Réduit et compresse une image. Renvoie { data (data URL), w, h }. */
export async function compress(blob) {
  const src = await decode(blob);
  const sw = src.width, sh = src.height;
  const k = Math.min(1, MAX / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; // les PNG transparents restent lisibles en mode sombre
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  src.close?.();
  let data = c.toDataURL('image/webp', 0.82);
  if (!data.startsWith('data:image/webp')) data = c.toDataURL('image/jpeg', 0.85);
  return { data, w, h };
}

/** Enregistre une image et renvoie son identifiant. */
export async function save(blob) {
  const { data, w, h } = await compress(blob);
  const id = uid().replace(/[^a-z0-9]/g, '');
  await db.put('files', { id, kind: 'image', data, w, h, createdAt: Date.now() });
  cache.set(id, data);
  return id;
}

const cache = new Map();
export async function url(id) {
  if (cache.has(id)) return cache.get(id);
  const f = await db.get('files', id);
  if (f?.data) cache.set(id, f.data);
  return f?.data || null;
}

/** Affiche les <img data-img="…"> d'un bloc (images chargées à la demande). */
export async function hydrate(root = document) {
  for (const img of root.querySelectorAll('img[data-img]:not([src])')) {
    const d = await url(img.dataset.img);
    if (d) img.src = d;
    else { img.alt = 'Image introuvable (pas encore synchronisée ?)'; img.classList.add('missing'); img.setAttribute('src', ''); }
  }
}

/** Supprime les images qui ne sont plus utilisées par aucune note. */
export async function removeUnused(ids) {
  if (!ids.length) return;
  const used = new Set([
    ...(await db.all('notes')).flatMap((n) => refsIn(n.body)),
    ...(await db.all('ink')).flatMap((p) => (p.images || []).map((m) => m.id)), // images des pages du Carnet
    ...(await db.all('tasks')).flatMap((t) => t.images || []), // photos des missions
  ]);
  for (const id of ids) if (!used.has(id)) { await db.del('files', id); cache.delete(id); }
}

/** Photos d'une mission en plein écran : ‹ › (ou flèches du clavier) pour passer de l'une à l'autre, clic à côté ou Échap pour fermer. */
export async function gallery(ids, start = 0) {
  const srcs = (await Promise.all(ids.map(url))).filter(Boolean);
  if (!srcs.length) return false;
  if (srcs.length === 1) { zoom(srcs[0]); return true; }
  let i = Math.min(start, srcs.length - 1);
  const d = document.createElement('div');
  d.className = 'img-zoom img-gallery';
  d.innerHTML = `<img alt=""><button type="button" class="ig-nav ig-prev" aria-label="Photo précédente">‹</button>
    <button type="button" class="ig-nav ig-next" aria-label="Photo suivante">›</button><span class="ig-count"></span>`;
  const show = () => { d.querySelector('img').src = srcs[i]; d.querySelector('.ig-count').textContent = `${i + 1} / ${srcs.length}`; };
  const go = (k) => { i = (i + k + srcs.length) % srcs.length; show(); };
  const close = () => { d.remove(); removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); };
  d.onclick = (e) => { if (e.target.closest('.ig-prev')) go(-1); else if (e.target.closest('.ig-next')) go(1); else if (e.target.tagName !== 'IMG') close(); };
  addEventListener('keydown', onKey);
  show();
  document.body.appendChild(d);
  return true;
}

/** Agrandit une image en plein écran (clic pour fermer). */
export function zoom(src) {
  const d = document.createElement('div');
  d.className = 'img-zoom';
  d.innerHTML = `<img src="${src}" alt="">`;
  d.onclick = () => d.remove();
  const onKey = (e) => { if (e.key === 'Escape') { d.remove(); removeEventListener('keydown', onKey); } };
  addEventListener('keydown', onKey);
  document.body.appendChild(d);
}
