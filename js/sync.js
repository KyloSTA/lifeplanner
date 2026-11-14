// Synchronisation entre appareils (Surface, cellulaire…) par Google Drive.
// Les données vont dans le dossier caché « appDataFolder » de ton Drive : privé, propre à l'app,
// invisible dans Drive. Un fichier par type de données (lp-tasks.json, lp-journal.json…).
// Fusion élément par élément : la modification la plus récente gagne, les suppressions sont suivies.

import { db, syncDb, onLocalChange } from './db.js';
import * as gcal from './gcal.js';

const STORES = ['tasks', 'journal', 'pages', 'ink', 'goals', 'notes', 'xp', 'settings', 'habits', 'study', 'workouts', 'files', 'money'];
const LOCAL_ONLY = new Set(['anthropicKey', 'clientId', 'xpInit', 'ticketmasterKey']); // réglages propres à cet appareil
const MERGED = { lastLevel: 'max', lastEvo: 'max', badges: 'union' }; // réglages fusionnés plutôt que remplacés
const FILE = (s) => `lp-${s}.json`;
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const LS = 'lp.sync';

/* ---------- État (propre à cet appareil) ---------- */
function load() {
  try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; }
}
let st = load(); // { on, last, files: { name: { id, mod } }, pushed: { store: ms }, status, error }
const saveSt = () => { try { localStorage.setItem(LS, JSON.stringify(st)); } catch { /* ignore */ } emit(); };

const subs = new Set();
export const onStatus = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const emit = () => subs.forEach((fn) => fn(status()));
export const status = () => ({ on: !!st.on, last: st.last || 0, status: st.status || 'idle', error: st.error || '' });
export const isOn = () => !!st.on;

export function enable() { st.on = true; st.status = 'idle'; st.error = ''; saveSt(); }
export function disable() { st = { on: false }; saveSt(); }

/* ---------- Drive ---------- */
class AuthError extends Error {}
async function drive(url, opts = {}) {
  const t = gcal.token();
  if (!t) throw new AuthError('login');
  const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + t, ...(opts.headers || {}) } });
  if (r.status === 401) { gcal.forget(); throw new AuthError('login'); }
  if (r.status === 403) {
    let reason = '';
    try { reason = (await r.json()).error?.errors?.[0]?.reason || ''; } catch { /* ignore */ }
    if (/insufficient|scope/i.test(reason)) throw new AuthError('permission');
    if (/accessNotConfigured|disabled/i.test(reason)) throw new Error('Active « Google Drive API » dans ton projet sur console.cloud.google.com (même endroit que Google Calendar API), puis réessaie.');
    throw new Error('Google Drive refuse l’accès (' + (reason || 403) + ')');
  }
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).error.message; } catch { /* ignore */ }
    throw new Error('Google Drive : ' + msg);
  }
  return r;
}

async function listFiles() {
  // Seulement les fichiers de données (pas les documents joints « lp-blob-… », envoyés à part)
  const q = new URLSearchParams({ spaces: 'appDataFolder', q: "not name contains 'lp-blob-'", fields: 'files(id,name,modifiedTime)', pageSize: '100' });
  const d = await (await drive(`${DRIVE}/files?${q}`)).json();
  return Object.fromEntries((d.files || []).map((f) => [f.name, f]));
}

async function upload(name, id, data) {
  const body = JSON.stringify(data);
  if (id) {
    return (await drive(`${UPLOAD}/files/${id}?uploadType=media&fields=id,modifiedTime`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body,
    })).json();
  }
  const b = 'lp' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'application/json' });
  const multipart = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
  return (await drive(`${UPLOAD}/files?uploadType=multipart&fields=id,modifiedTime`, {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body: multipart,
  })).json();
}

/* ---------- Fusion d'un type de données ---------- */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function mergeSpecial(key, a, b) {
  if (MERGED[key] === 'max') return Math.max(Number(a) || 0, Number(b) || 0);
  if (MERGED[key] === 'union') return [...new Set([...(a || []), ...(b || [])])];
  return a;
}

async function syncStore(s, files, started) {
  await syncDb.stampMissing(s);
  const metas = await syncDb.metas(s);
  if (s === 'settings') for (const k of LOCAL_ONLY) metas.delete(k);
  const name = FILE(s);
  const info = files[name];
  const known = st.files?.[name];
  const pushed = st.pushed?.[s] || 0;
  const localDirty = [...metas.values()].some((m) => m.at > pushed);
  const remoteChanged = !info || !known || info.modifiedTime !== known.mod;
  if (!localDirty && !remoteChanged) return 0;

  const remote = info ? await (await drive(`${DRIVE}/files/${info.id}?alt=media`)).json().catch(() => ({})) : {};
  const recs = remote.records || {};
  if (s === 'settings') for (const k of LOCAL_ONLY) delete recs[k];
  const toApply = [];
  let remoteDirty = !info;

  for (const key of new Set([...metas.keys(), ...Object.keys(recs)])) {
    const L = metas.get(key), R = recs[key];
    if (s === 'settings' && MERGED[key] && L && R && !L.del && !R.del) {
      const local = await db.get(s, key);
      const merged = mergeSpecial(key, local, R.v);
      const at = Math.max(L.at, R.at);
      if (!same(merged, local)) toApply.push({ key, rec: { at, v: merged } });
      if (!same(merged, R.v)) { recs[key] = { at, v: merged }; remoteDirty = true; }
      continue;
    }
    if (R && (!L || R.at > L.at)) {
      toApply.push({ key, rec: R });
    } else if (L && (!R || L.at > R.at)) {
      const v = L.del ? undefined : await db.get(s, key);
      recs[key] = v === undefined ? { at: L.at, del: true } : { at: L.at, v };
      remoteDirty = true;
    }
  }

  await syncDb.apply(s, toApply);
  st.files ||= {};
  st.pushed ||= {};
  if (remoteDirty) {
    const f = await upload(name, info?.id, { app: 'lifeplanner', store: s, records: recs });
    if (!f?.id) throw new Error('Google Drive : envoi non confirmé, nouvel essai à la prochaine synchro');
    st.files[name] = { id: f.id, mod: f.modifiedTime };
  } else {
    st.files[name] = { id: info.id, mod: info.modifiedTime };
  }
  st.pushed[s] = started;
  return toApply.length;
}

/* ---------- Documents joints (PDF, Word, EPUB…) : un fichier Drive par document ---------- */
async function syncDocs() {
  for (const m of await db.all('files')) {
    if (m.kind !== 'doc' || m.driveId) continue;
    const blob = await db.get('blobs', m.id);
    if (!blob) continue; // document ajouté sur un autre appareil, pas encore envoyé
    const b = 'lp' + Math.random().toString(36).slice(2);
    const meta = JSON.stringify({ name: 'lp-blob-' + m.id, parents: ['appDataFolder'] });
    const body = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: ${m.mime || 'application/octet-stream'}\r\n\r\n`, blob, `\r\n--${b}--`]);
    const f = await (await drive(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body,
    })).json();
    if (!f?.id) continue;
    const cur = await db.get('files', m.id);
    if (cur) { cur.driveId = f.id; await db.put('files', cur); } // la fiche (synchronisée) dit où le trouver
  }
}

/** Télécharge un document depuis Drive (pour docs.js). */
export async function fetchDoc(driveId) {
  if (!gcal.token()) return null;
  return (await drive(`${DRIVE}/files/${driveId}?alt=media`)).blob();
}

/* ---------- Synchronisation complète ---------- */
let running = null;
let onApplied = () => {};

// Première synchro à l'ouverture : les alarmes et rappels l'attendent, pour ne pas sonner pour
// une alarme déjà vue ou réglée sur un autre appareil (au plus 10 s d'attente).
let firstResolve = null;
const firstPromise = new Promise((r) => { firstResolve = r; });
export function firstSync(maxMs = 10_000) {
  if (!st.on || !navigator.onLine) return Promise.resolve();
  return Promise.race([firstPromise, new Promise((r) => setTimeout(r, maxMs))]);
}

export function syncNow() {
  if (!st.on) return Promise.resolve(0);
  if (running) return running;
  const go = async () => {
    if (!gcal.token()) { st.status = 'login'; saveSt(); armRelogin(); return 0; }
    if (!gcal.hasScope(gcal.DRIVE_SCOPE)) { st.status = 'permission'; saveSt(); return 0; }
    if (!navigator.onLine) { st.status = 'offline'; saveSt(); return 0; }
    st.status = 'syncing'; emit();
    const started = Date.now();
    let applied = 0;
    const changed = [];
    try {
      const files = await listFiles();
      for (const s of STORES) {
        const n = await syncStore(s, files, started);
        if (n) { applied += n; changed.push(s); }
      }
      await syncDocs();
      st.last = Date.now();
      st.status = 'ok';
      st.error = '';
    } catch (err) {
      if (err instanceof AuthError) { st.status = err.message; if (err.message === 'login') armRelogin(); }
      else { st.status = 'error'; st.error = err.message; }
    }
    saveSt();
    if (applied) onApplied(changed, applied);
    return applied;
  };
  // Une seule synchro à la fois, même si plusieurs fenêtres sont ouvertes
  const p = navigator.locks ? navigator.locks.request('lp-sync', go) : go();
  running = p.finally(() => { running = null; firstResolve(); });
  return running;
}

// Jeton Google expiré (1 h) : on se reconnecte discrètement au prochain toucher de l'écran.
let armed = false;
function armRelogin() {
  if (armed || !st.on) return;
  armed = true;
  addEventListener('pointerdown', () => {
    armed = false;
    gcal.connect({ silent: true }).then(() => syncNow()).catch(() => {});
  }, { once: true, capture: true });
}

let debounceT = null;
/** Démarre la synchro automatique. cb(stores, n) est appelé quand des changements arrivent d'un autre appareil. */
export function start(cb = () => {}) {
  onApplied = cb;
  onLocalChange(() => { if (!st.on) return; clearTimeout(debounceT); debounceT = setTimeout(syncNow, 4000); });
  setTimeout(syncNow, 300); // ne fait rien tant que la synchro n'est pas activée (les alarmes attendent ce premier échange)
  setInterval(syncNow, 2 * 60_000);
  addEventListener('online', () => syncNow());
  addEventListener('lp-google', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
}
