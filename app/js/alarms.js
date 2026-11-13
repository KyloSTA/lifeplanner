// Alarmes des missions : sonnerie, notification Windows, snooze et report.
// Une app web ne peut sonner que si l'app ou le widget est ouvert ; une alarme manquée
// pendant que tout était fermé sonne à la prochaine ouverture.
//
// Champs d'une mission : alarmAt (horodatage ms ou null), alarmState ('ringing' ou null).

import { db, onDbChange } from './db.js';
import * as U from './util.js';
import { setTaskDone } from './tasks.js';
import * as sync from './sync.js';

const { esc } = U;
export const SNOOZES = [5, 10, 30, 60];

/** Identifiant de cet appareil (pour savoir où une alarme a déjà été vue). */
export const DEVICE = (() => {
  try {
    let d = localStorage.getItem('lp.deviceId');
    if (!d) { d = U.uid(); localStorage.setItem('lp.deviceId', d); }
    return d;
  } catch { return 'local'; }
})();
/** Vue à l'écran sur un autre appareil : on ne la refait pas sonner ici. */
const seenElsewhere = (t) => !!(t.alarmSeen && t.alarmSeen.by !== DEVICE);

/* ---------- Conversion pour <input type="datetime-local"> ---------- */
export const toInput = (ms) => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${U.iso(d)}T${U.pad(d.getHours())}:${U.pad(d.getMinutes())}`;
};
export const fromInput = (s) => (s ? new Date(s).getTime() : null);
export function label(ms) {
  const d = new Date(ms);
  const today = U.iso(new Date()), day = U.iso(d);
  const hm = U.fmtTime(d);
  if (day === today) return hm;
  if (day === U.iso(U.addDays(new Date(), 1))) return 'demain ' + hm;
  return `${U.fmtShort(d)} ${hm}`;
}

/* ---------- Actions ---------- */
async function edit(id, fn) {
  const t = await db.get('tasks', id);
  if (!t) return null;
  fn(t);
  await db.put('tasks', t);
  closeNotification(id);
  return t;
}

export const setAlarm = (id, at) => edit(id, (t) => { t.alarmAt = at || null; t.alarmState = null; t.alarmSeen = null; });
export const dismiss = (id) => edit(id, (t) => { t.alarmAt = null; t.alarmState = null; t.alarmSeen = null; });
export const snooze = (id, minutes) => edit(id, (t) => { t.alarmAt = Date.now() + minutes * 60_000; t.alarmState = null; t.alarmSeen = null; });

/** Reporter : la mission passe à une autre date ; l'alarme garde la même heure ce jour-là. */
export const postpone = (id, dateISO) => edit(id, (t) => {
  const old = t.alarmAt ? new Date(t.alarmAt) : null;
  t.date = dateISO;
  if (old) {
    const d = U.parseISO(dateISO);
    d.setHours(old.getHours(), old.getMinutes(), 0, 0);
    t.alarmAt = d.getTime();
  }
  t.alarmState = null;
  t.alarmSeen = null;
});

export async function complete(id) {
  await dismiss(id);
  await setTaskDone(id, true);
}

/* ---------- Notification Windows ---------- */
export async function askPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  } catch { /* ignore */ }
}

async function notify(t) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.ready;
    const opts = {
      body: t.title, tag: 'alarm-' + t.id, requireInteraction: true, renotify: true,
      icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { id: t.id },
      actions: [{ action: 'snooze', title: '😴 Snooze 10 min' }, { action: 'done', title: '✓ Accomplie' }],
    };
    if (reg?.showNotification) await reg.showNotification('⏰ Mission', opts);
    else new Notification('⏰ Mission', opts);
  } catch { /* notifications indisponibles */ }
}

async function closeNotification(id) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    for (const n of (await reg?.getNotifications({ tag: 'alarm-' + id })) || []) n.close();
  } catch { /* ignore */ }
}

/* ---------- Sonnerie ---------- */
let audio = null, ringTimer = null, ringStop = null;
function startSound() {
  if (ringTimer) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume?.();
  } catch { return; }
  const beep = () => {
    const now = audio.currentTime;
    for (const [i, f] of [[0, 880], [0.18, 1175], [0.36, 880]]) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i);
      g.gain.exponentialRampToValueAtTime(0.25, now + i + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i + 0.16);
      o.connect(g).connect(audio.destination);
      o.start(now + i); o.stop(now + i + 0.18);
    }
  };
  beep();
  ringTimer = setInterval(beep, 1500);
  ringStop = setTimeout(stopSound, 60_000); // la sonnerie s'arrête seule après 1 minute
}
function stopSound() {
  clearInterval(ringTimer); clearTimeout(ringStop);
  ringTimer = ringStop = null;
}
// Le navigateur n'autorise le son qu'après une interaction : on « réveille » l'audio au premier toucher.
addEventListener('pointerdown', () => { try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch { /* ignore */ } }, { once: true });

/** Court carillon (fin d'un minuteur). */
export function chime() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume?.();
    const now = audio.currentTime;
    for (const [i, f] of [[0, 784], [0.22, 988], [0.44, 1175], [0.9, 784], [1.12, 988], [1.34, 1175]]) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i);
      g.gain.exponentialRampToValueAtTime(0.22, now + i + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i + 0.3);
      o.connect(g).connect(audio.destination);
      o.start(now + i); o.stop(now + i + 0.32);
    }
  } catch { /* son indisponible */ }
}

/** Notification Windows simple (si autorisée). */
export async function notifyText(title, body, tag = 'lp-timer') {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.ready;
    const opts = { body, tag, renotify: true, icon: 'icons/icon-192.png' };
    if (reg?.showNotification) await reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch { /* ignore */ }
}

/* ---------- Vérification périodique ---------- */
const firedHere = new Set(); // alarmes déclenchées par cette fenêtre (c'est elle qui sonne)

async function check() {
  const run = async () => {
    const now = Date.now();
    for (const t of await db.all('tasks')) {
      if (t.done && (t.alarmAt || t.alarmState)) { t.alarmState = null; t.alarmAt = null; await db.put('tasks', t); continue; }
      if (t.alarmAt && t.alarmAt <= now && t.alarmState !== 'ringing') {
        t.alarmState = 'ringing';
        await db.put('tasks', t);
        firedHere.add(t.id);
        notify(t);
      }
    }
  };
  // Une seule fenêtre (app ou widget) fait la vérification à la fois : pas de double sonnerie.
  if (navigator.locks) await navigator.locks.request('lp-alarms', { ifAvailable: true }, (lock) => (lock ? run() : null));
  else await run();
  await drawRinging();
}

/* ---------- Fenêtre qui sonne ---------- */
let hostEl = null, onChanged = () => {};
async function drawRinging() {
  // Une alarme déjà vue sur un autre appareil ne s'affiche pas ici
  const all = await db.all('tasks');
  // Vue ailleurs pendant qu'elle sonnait ici : on arrête la sonnerie et la notification de cet appareil
  for (const x of all) if (x.alarmState === 'ringing' && seenElsewhere(x) && firedHere.has(x.id)) { firedHere.delete(x.id); closeNotification(x.id); }
  const ringing = all.filter((t) => t.alarmState === 'ringing' && !t.done && !seenElsewhere(t)).sort((a, b) => a.alarmAt - b.alarmAt);
  if (!ringing.length) {
    if (hostEl) { hostEl.innerHTML = ''; hostEl.dataset.sig = ''; }
    stopSound();
    return;
  }
  if (!hostEl) { hostEl = document.createElement('div'); hostEl.id = 'alarm-root'; document.body.appendChild(hostEl); }
  if (ringing.some((t) => firedHere.has(t.id))) startSound(); else stopSound();
  const t = ringing[0];
  // Affichée à l'écran ici : elle est « vue » par cet appareil (les autres ne la montreront pas)
  if (document.visibilityState === 'visible' && t.alarmSeen?.by !== DEVICE) {
    const cur = await db.get('tasks', t.id);
    if (cur && cur.alarmState === 'ringing' && !cur.alarmSeen) { cur.alarmSeen = { by: DEVICE, at: Date.now() }; await db.put('tasks', cur); }
  }
  const late = Date.now() - t.alarmAt > 5 * 60_000;
  const tomorrow = U.iso(U.addDays(new Date(), 1));
  // Ne pas reconstruire si rien n'a changé (évite que la fenêtre clignote) ou si on choisit une date de report
  const sig = `${t.id}|${t.alarmAt}|${ringing.length}|${late}`;
  if (hostEl.firstElementChild && hostEl.dataset.sig === sig) return;
  if (hostEl.querySelector(`.alarm[data-id="${t.id}"] .al-pick:not([hidden])`)) return;
  hostEl.dataset.sig = sig;
  hostEl.innerHTML = `<div class="alarm-back"><div class="alarm" role="alertdialog" aria-modal="true" aria-label="Alarme" data-id="${t.id}">
      <div class="al-bell">⏰</div>
      <p class="eyebrow">${late ? `Alarme manquée · ${esc(label(t.alarmAt))}` : `Alarme · ${esc(U.fmtTime(new Date(t.alarmAt)))}`}</p>
      <h2>${esc(t.title)}</h2>
      ${(t.subtasks || []).length ? `<p class="muted">${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length} étapes faites</p>` : ''}
      <div class="al-row"><span class="muted">😴 Snooze</span>${SNOOZES.map((m) => `<button class="btn" data-snooze="${m}">${m < 60 ? m + ' min' : '1 h'}</button>`).join('')}</div>
      <div class="al-row"><span class="muted">📅 Reporter</span><button class="btn" data-post="${tomorrow}">Demain</button><button class="btn" data-pick>Autre date…</button></div>
      <div class="al-pick" hidden><input type="date" value="${tomorrow}" min="${U.iso(new Date())}"><button class="btn primary" data-postpick>Reporter</button></div>
      <div class="al-actions"><button class="btn" data-dismiss>Arrêter l’alarme</button><button class="btn primary" data-done>✓ Mission accomplie</button></div>
      ${ringing.length > 1 ? `<p class="muted al-more">+ ${ringing.length - 1} autre${ringing.length > 2 ? 's' : ''} alarme${ringing.length > 2 ? 's' : ''}</p>` : ''}
    </div></div>`;
  const box = hostEl.querySelector('.alarm');
  const act = async (fn) => { stopSound(); firedHere.delete(t.id); await fn(); onChanged(); drawRinging(); };
  box.querySelectorAll('[data-snooze]').forEach((b) => (b.onclick = () => act(() => snooze(t.id, Number(b.dataset.snooze)))));
  box.querySelector('[data-post]').onclick = (e) => act(() => postpone(t.id, e.currentTarget.dataset.post));
  box.querySelector('[data-pick]').onclick = () => { box.querySelector('.al-pick').hidden = false; box.querySelector('.al-pick input').focus(); };
  box.querySelector('[data-postpick]').onclick = () => { const v = box.querySelector('.al-pick input').value; if (v) act(() => postpone(t.id, v)); };
  box.querySelector('[data-dismiss]').onclick = () => act(() => dismiss(t.id));
  box.querySelector('[data-done]').onclick = () => act(() => complete(t.id));
}

/** Démarre la surveillance des alarmes (app et widget). onChange() : rafraîchir l'affichage. */
export function start(onChange = () => {}) {
  onChanged = onChange;
  // On attend le premier échange avec les autres appareils : une alarme déjà vue ou réglée ailleurs ne sonne pas ici
  sync.firstSync().then(() => {
    check();
    setInterval(check, 15_000);
    addEventListener('focus', check);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) drawRinging(); });
  });
  onDbChange(({ store }) => { if (store === 'tasks') drawRinging(); });
  // Boutons de la notification Windows (relayés par le service worker)
  navigator.serviceWorker?.addEventListener('message', async (e) => {
    const { type, action, id } = e.data || {};
    if (type !== 'alarm-action' || !id) return;
    stopSound();
    if (action === 'snooze') await snooze(id, 10);
    else if (action === 'done') await complete(id);
    onChanged();
    drawRinging();
  });
}
