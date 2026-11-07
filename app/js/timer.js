// Minuteur de focus (style Pomodoro) lié à une mission.
// Focus → pause courte (une pause longue toutes les 4 sessions) → focus… Le minuteur est partagé
// entre l'app et le widget (état dans les réglages) et continue si tu changes de page.

import { db, onDbChange } from './db.js';
import * as U from './util.js';
import * as game from './game.js';
import { chime, notifyText, askPermission } from './alarms.js';

const { esc } = U;
export const PRESETS = [[25, 5], [50, 10], [15, 3]];
const LONG_BREAK = 15;

let state = null; // { taskId, title, phase: 'work'|'break', workMin, breakMin, count, endsAt, left, paused, startedAt }
const save = async (s) => { state = s; await db.put('settings', s, 'timer'); render(); };
const load = async () => { state = (await db.get('settings', 'timer')) || null; render(); };

export const current = () => state;

export async function start(task, workMin = 25, breakMin = 5) {
  await askPermission();
  const now = Date.now();
  await save({ taskId: task.id, title: task.title, phase: 'work', workMin, breakMin, count: 0, endsAt: now + workMin * 60_000, left: 0, paused: false, startedAt: now });
}

export async function pause() {
  if (!state || state.paused) return;
  await save({ ...state, paused: true, left: Math.max(0, state.endsAt - Date.now()), endsAt: null });
}

export async function resume() {
  if (!state || !state.paused) return;
  const left = state.left || (state.phase === 'work' ? state.workMin : state.breakMin) * 60_000;
  await save({ ...state, paused: false, endsAt: Date.now() + left, left: 0, startedAt: state.phase === 'work' && !state.left ? Date.now() : state.startedAt });
}

export async function stop() {
  state = null;
  await db.del('settings', 'timer');
  render();
}

/** Passe à l'étape suivante (fin anticipée du focus ou de la pause). */
export const skip = () => finishPhase(true);

async function finishPhase(skipped = false) {
  const s = state;
  if (!s) return;
  if (s.phase === 'work') {
    const minutes = skipped ? Math.round((s.workMin * 60_000 - Math.max(0, (s.endsAt || Date.now() + s.left) - Date.now())) / 60_000) : s.workMin;
    const count = s.count + (skipped ? 0 : 1);
    // Temps de focus enregistré sur la mission ; un pomodoro complet rapporte des XP
    const t = await db.get('tasks', s.taskId);
    if (t && minutes > 0) {
      t.focusMin = (t.focusMin || 0) + minutes;
      if (!skipped) t.pomodoros = (t.pomodoros || 0) + 1;
      await db.put('tasks', t);
    }
    if (!skipped) await game.award(`pomo:${s.taskId}:${s.startedAt}`, game.XP.pomo, `Focus : ${s.title}`);
    const brk = count && count % 4 === 0 ? LONG_BREAK : s.breakMin;
    await save({ ...s, phase: 'break', count, breakLen: brk, paused: false, endsAt: Date.now() + brk * 60_000, left: 0 });
    if (!skipped) { chime(); notifyText('🍅 Focus terminé !', `${s.title} — pause de ${brk} min.`); }
  } else {
    // Fin de la pause : le prochain focus attend que tu cliques ▶
    await save({ ...s, phase: 'work', paused: true, endsAt: null, left: 0 });
    if (!skipped) { chime(); notifyText('⏱ Pause terminée', `Prêt·e pour un nouveau focus sur « ${s.title} » ?`); }
  }
}

async function tick() {
  if (!state || state.paused || !state.endsAt || state.endsAt > Date.now()) return;
  // Une seule fenêtre (app ou widget) traite la fin d'étape
  const run = async () => {
    const fresh = await db.get('settings', 'timer');
    if (!fresh || fresh.paused || !fresh.endsAt || fresh.endsAt > Date.now()) { state = fresh || null; return; }
    state = fresh;
    await finishPhase(false);
  };
  if (navigator.locks) await navigator.locks.request('lp-timer', { ifAvailable: true }, (lock) => (lock ? run() : null));
  else await run();
}

/* ---------- Affichage flottant ---------- */
let el = null;
const fmt = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${U.pad(s % 60)}`;
};

function render() {
  if (!el) return;
  document.body.classList.toggle('has-timer', !!state);
  if (!state) { el.innerHTML = ''; el.hidden = true; return; }
  el.hidden = false;
  const s = state;
  const total = (s.phase === 'work' ? s.workMin : s.breakLen || s.breakMin) * 60_000;
  const left = s.paused ? (s.left || total) : s.endsAt - Date.now();
  const pct = Math.min(100, Math.max(0, 100 - (left / total) * 100));
  const waiting = s.paused && s.phase === 'work' && !s.left; // pause finie, focus pas encore relancé
  const label = s.phase === 'work' ? (waiting ? 'Prêt pour un focus' : `Focus · session ${s.count + 1}`) : (s.breakLen === LONG_BREAK ? 'Grande pause' : 'Pause');
  el.className = `focus-timer ${s.phase}`;
  el.innerHTML = `
    <div class="ft-ring" style="--p:${pct}"><span>${waiting ? '▶' : fmt(left)}</span></div>
    <div class="ft-main">
      <small>${s.phase === 'work' ? '🍅' : '☕'} ${esc(label)}${s.count ? ` · ${s.count} 🍅` : ''}</small>
      <b title="${esc(s.title)}">${esc(s.title)}</b>
    </div>
    <div class="ft-btns">
      ${s.paused ? '<button data-t="resume" aria-label="Démarrer" title="Démarrer">▶</button>' : '<button data-t="pause" aria-label="Pause" title="Pause">⏸</button>'}
      <button data-t="skip" aria-label="${s.phase === 'work' ? 'Terminer le focus maintenant' : 'Passer la pause'}" title="${s.phase === 'work' ? 'Terminer le focus maintenant' : 'Passer la pause'}">⏭</button>
      <button data-t="stop" aria-label="Arrêter le minuteur" title="Arrêter">■</button>
    </div>`;
  el.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => ({ pause, resume, skip, stop })[b.dataset.t]()));
}

/** Installe le minuteur flottant (app et widget). */
export function mount() {
  if (el) return;
  el = document.createElement('div');
  el.id = 'focus-timer';
  el.setAttribute('role', 'timer');
  el.hidden = true;
  document.body.appendChild(el);
  load();
  setInterval(() => { tick(); if (state && !state.paused) { const r = el.querySelector('.ft-ring span'); if (r) render(); } }, 1000);
  onDbChange(({ store }) => { if (store === 'settings') load(); });
}
