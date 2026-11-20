// Captures d'écran → Cerveau : quand tu reviens dans Life Planner, les nouvelles captures (Win + Maj + S)
// te sont proposées. Deux sources, au choix (propres à cet appareil) :
//  - le presse-papiers (Win + Maj + S y copie la capture) ;
//  - le dossier des captures (Images\Captures d'écran), comme l'import auto des relevés.
// Rien n'est ajouté sans ton accord. Windows enregistre aussi la capture copiée dans le dossier :
// quand le dossier l'a, on propose le fichier et pas la copie du presse-papiers (pas de doublon).

import { db } from './db.js';
import * as U from './util.js';
import * as brain from './brain.js';
import * as images from './images.js';

const { esc } = U;
const CLIP_KEY = 'lp.shotClip';       // presse-papiers activé sur cet appareil
const HASH_KEY = 'lp.shotClipHash';   // dernière image du presse-papiers déjà proposée
const DIR_KEY = 'shotDir';            // dossier (cache local : propre à l'appareil)
const SINCE_KEY = 'shotDirSince';     // fichiers plus récents que ce moment seulement
const IMG_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;

const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };
export const canWatchDir = () => typeof window.showDirectoryPicker === 'function';
export const canClip = () => !!navigator.clipboard?.read;
export const clipOn = () => ls.get(CLIP_KEY) === '1';

async function hashBlob(b) {
  const buf = await b.arrayBuffer();
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].slice(0, 12).map((x) => x.toString(16).padStart(2, '0')).join('');
}

/* ---------- Réglages ---------- */
/** Active le presse-papiers (après un clic : le navigateur demande la permission une fois). */
export async function enableClip() {
  const items = await navigator.clipboard.read(); // déclenche la demande de permission
  ls.set(CLIP_KEY, '1');
  // L'image déjà dans le presse-papiers n'est pas proposée : seulement les prochaines captures
  for (const it of items) {
    const t = it.types.find((x) => x.startsWith('image/'));
    if (t) ls.set(HASH_KEY, await hashBlob(await it.getType(t)));
  }
}
export function disableClip() { ls.set(CLIP_KEY, ''); }

export async function dirStatus() {
  const h = await db.get('cache', DIR_KEY).catch(() => null);
  if (!h) return { on: false };
  let perm = 'prompt';
  try { perm = await h.queryPermission({ mode: 'read' }); } catch { /* ignore */ }
  return { on: true, name: h.name, perm };
}
export async function chooseDir() {
  const h = await window.showDirectoryPicker({ id: 'lp-shots', mode: 'read', startIn: 'pictures' });
  await db.put('cache', h, DIR_KEY);
  await db.put('cache', Date.now(), SINCE_KEY); // les captures déjà là ne sont pas proposées
  return h;
}
export async function stopDir() { await db.del('cache', DIR_KEY); await db.del('cache', SINCE_KEY); }

/* ---------- Détection ---------- */
async function fromClipboard() {
  if (!clipOn() || !canClip() || !document.hasFocus()) return null;
  try {
    const st = await navigator.permissions?.query({ name: 'clipboard-read' }).catch(() => null);
    if (st && st.state !== 'granted') return null; // jamais de demande de permission sans clic
    for (const it of await navigator.clipboard.read()) {
      const t = it.types.find((x) => x.startsWith('image/'));
      if (!t) continue;
      const blob = await it.getType(t);
      const hash = await hashBlob(blob);
      if (hash === ls.get(HASH_KEY)) return null;
      return { blob, hash };
    }
  } catch { /* presse-papiers indisponible */ }
  return null;
}

async function fromFolder({ ask = false } = {}) {
  const h = await db.get('cache', DIR_KEY).catch(() => null);
  if (!h) return { files: [] };
  let perm = await h.queryPermission({ mode: 'read' }).catch(() => 'denied');
  if (perm !== 'granted' && ask) perm = await h.requestPermission({ mode: 'read' }).catch(() => 'denied');
  if (perm !== 'granted') return { files: [], needPermission: true, name: h.name };
  const since = (await db.get('cache', SINCE_KEY)) || Date.now();
  const files = [];
  for await (const entry of h.values()) {
    if (entry.kind !== 'file' || !IMG_RE.test(entry.name)) continue;
    const f = await entry.getFile();
    if (f.lastModified > since) files.push(f);
  }
  files.sort((a, b) => a.lastModified - b.lastModified);
  return { files: files.slice(-12) }; // au plus 12 à la fois
}

/* ---------- Fenêtre de proposition ---------- */
let busy = false, lastRun = 0, root = null, toastFn = () => {}, afterAdd = () => {};

async function addToBrain(blob, title) {
  const id = await images.save(blob);
  const d = new Date();
  const n = await brain.createNote({ title: title || `📷 Capture du ${U.fmtShort(d)} à ${U.fmtTime(d)}`, body: images.refLine(id), type: 'idee', inbox: true });
  n.captured = true;
  await brain.saveNote(n, { touch: false });
}

function hide() { if (root) root.innerHTML = ''; }

function show(list, { onDone, needPermission, dirName }) {
  if (!root) { root = document.createElement('div'); root.id = 'shot-root'; document.body.appendChild(root); }
  if (!list.length && needPermission) {
    root.innerHTML = `<div class="shot-card shot-perm" role="dialog" aria-label="Captures d’écran">
      <span>📁 Captures : Edge demande de confirmer l’accès au dossier « ${esc(dirName)} ».</span>
      <button class="btn primary" data-s="perm">Autoriser</button><button class="btn sm" data-s="close" aria-label="Fermer">×</button></div>`;
    root.querySelector('[data-s="perm"]').onclick = async () => { hide(); await check({ ask: true, force: true }); };
    root.querySelector('[data-s="close"]').onclick = hide;
    return;
  }
  const urls = list.map((x) => URL.createObjectURL(x.blob));
  const one = list.length === 1;
  root.innerHTML = `<div class="shot-card" role="dialog" aria-label="Nouvelles captures d’écran">
    <div class="shot-head"><b>📸 ${one ? 'Nouvelle capture' : `${list.length} nouvelles captures`}</b><button class="btn sm" data-s="close" aria-label="Fermer">×</button></div>
    <div class="shot-thumbs">${list.map((x, i) => `<label class="shot-thumb"><img src="${urls[i]}" alt="Capture ${i + 1}">${one ? '' : `<input type="checkbox" checked data-i="${i}" aria-label="Ajouter la capture ${i + 1}">`}</label>`).join('')}</div>
    ${one ? '<input class="shot-title" placeholder="Titre (facultatif)" maxlength="80" autocomplete="off">' : ''}
    <div class="shot-acts"><button class="btn" data-s="skip">Ignorer</button><button class="btn primary" data-s="add">💡 Ajouter au Cerveau</button></div>
  </div>`;
  const done = () => { urls.forEach((u) => URL.revokeObjectURL(u)); hide(); onDone(); };
  root.querySelector('[data-s="close"]').onclick = done;
  root.querySelector('[data-s="skip"]').onclick = done;
  root.querySelector('[data-s="add"]').onclick = async (e) => {
    e.target.disabled = true;
    const pick = one ? [0] : [...root.querySelectorAll('[data-i]')].filter((c) => c.checked).map((c) => Number(c.dataset.i));
    const title = root.querySelector('.shot-title')?.value.trim() || '';
    try {
      for (const i of pick) await addToBrain(list[i].blob, one ? title : '');
      toastFn(pick.length ? `📸 ${pick.length > 1 ? `${pick.length} captures ajoutées` : 'Capture ajoutée'} au Cerveau (À classer)` : 'Rien d’ajouté');
      afterAdd();
    } catch (err) { toastFn('Impossible d’ajouter : ' + err.message, 'err'); }
    done();
  };
}

/** Cherche de nouvelles captures et les propose. ask : peut demander la permission du dossier (après un clic). */
export async function check({ ask = false, force = false } = {}) {
  if (busy || (!force && Date.now() - lastRun < 1500)) return;
  if (document.querySelector('#shot-root .shot-card')) return; // une proposition est déjà affichée
  busy = true; lastRun = Date.now();
  try {
    const [clip, dir] = await Promise.all([fromClipboard(), fromFolder({ ask })]);
    const list = dir.files.map((f) => ({ blob: f }));
    // La capture copiée est aussi dans le dossier : on garde le fichier (pas de doublon)
    if (clip && !list.length) list.push({ blob: clip.blob });
    const stamp = Date.now();
    const onDone = async () => {
      if (clip) ls.set(HASH_KEY, clip.hash);
      if (dir.files.length || clip) await db.put('cache', Math.max(stamp, ...dir.files.map((f) => f.lastModified)), SINCE_KEY).catch(() => {});
    };
    if (list.length) show(list, { onDone });
    else if (dir.needPermission && ask === false && force) show([], { onDone, needPermission: true, dirName: dir.name });
  } catch (err) { console.warn('Captures', err); }
  busy = false;
}

/** Démarre la surveillance : à l'ouverture et chaque fois que tu reviens dans l'app. */
export function start({ toast = () => {}, onAdded = () => {} } = {}) {
  toastFn = toast; afterAdd = onAdded;
  const go = () => { if (document.visibilityState === 'visible') check(); };
  setTimeout(go, 500);
  addEventListener('focus', go);
  addEventListener('pointerdown', go, { passive: true }); // premier clic après la capture : proposé tout de suite
  // Capture prise pendant que l'app est ouverte (outil Capture, stylet) : vérifie aux 3 s, sans jamais rien demander
  setInterval(() => { if (document.visibilityState === 'visible' && document.hasFocus()) check(); }, 3000);
  document.addEventListener('visibilitychange', go);
  // Le dossier attend la confirmation d'Edge : on le signale une fois par session
  dirStatus().then((s) => { if (s.on && s.perm !== 'granted') setTimeout(() => check({ force: true }), 2500); }).catch(() => {});
}
