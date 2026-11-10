// Missions partagées entre l'app et le widget : étapes (sous-missions), notes, objectif lié et points.
// (Dans la base de données, les missions sont toujours rangées dans le magasin « tasks ».)
import { db } from './db.js';
import * as U from './util.js';
import * as game from './game.js';
import * as alarms from './alarms.js';
import * as timer from './timer.js';

const { esc } = U;

/* ---------- Objectifs liés ---------- */
let goalsCache = [];
/** À appeler avant d'afficher des missions (pour le choix de l'objectif). */
export async function loadGoals() {
  goalsCache = (await db.all('goals')).sort((a, b) => a.createdAt - b.createdAt);
  return goalsCache;
}
const HORIZON_NAMES = { semaine: 'Cette semaine', mois: 'Ce mois-ci', annee: 'Cette année', vie: 'Long terme' };

/** Missions d'un objectif. */
export async function missionsOf(goalId) {
  return (await db.all('tasks')).filter((t) => t.goalId === goalId);
}

/** La progression d'un objectif suit ses missions terminées (s'il en a). */
export async function syncGoalProgress(goalId) {
  if (!goalId) return;
  const g = await db.get('goals', goalId);
  if (!g) return;
  const list = await missionsOf(goalId);
  if (!list.length) return; // sans mission : progression manuelle
  const p = Math.round((list.filter((t) => t.done).length / list.length) * 100);
  if (p !== g.progress) {
    g.progress = p;
    await db.put('goals', g);
  }
  await game.syncGoal(g);
}

export async function addTask(title, date, goalId = null) {
  const t = { id: U.uid(), title, date, goalId, done: false, createdAt: Date.now(), subtasks: [], notes: '' };
  await db.put('tasks', t);
  if (goalId) await syncGoalProgress(goalId);
  return t;
}

export async function deleteTask(id) {
  const t = await db.get('tasks', id);
  await db.del('tasks', id);
  if (t?.goalId) await syncGoalProgress(t.goalId);
}

export async function setTaskDone(id, done) {
  const t = await db.get('tasks', id);
  if (!t) return;
  t.done = done;
  t.doneAt = done ? Date.now() : null;
  let steps = 0;
  if (done) {
    for (const s of t.subtasks || []) {
      if (!s.done) {
        s.done = true;
        await game.award(`sub:${t.id}:${s.id}`, game.XP.sub, 'Étape : ' + s.title, { showPop: false });
        steps++;
      }
    }
  }
  await db.put('tasks', t);
  if (done) {
    await game.award('task:' + id, game.XP.task, 'Mission : ' + t.title, { showPop: false });
    game.pop(game.XP.task + steps * game.XP.sub, steps ? `Mission + ${steps} étape${steps > 1 ? 's' : ''}` : 'Mission accomplie');
  } else {
    await game.revoke('task:' + id);
  }
  await syncGoalProgress(t.goalId);
}

export async function setSubDone(taskId, subId, done) {
  const t = await db.get('tasks', taskId);
  const s = t?.subtasks?.find((x) => x.id === subId);
  if (!s) return;
  s.done = done;
  const allDone = t.subtasks.every((x) => x.done);
  const finish = done && allDone && !t.done;
  const reopen = !done && t.done;
  if (finish) { t.done = true; t.doneAt = Date.now(); }
  if (reopen) { t.done = false; t.doneAt = null; }
  await db.put('tasks', t);
  if (done) await game.award(`sub:${taskId}:${subId}`, game.XP.sub, 'Étape : ' + s.title);
  else await game.revoke(`sub:${taskId}:${subId}`);
  if (finish) await game.award('task:' + taskId, game.XP.task, 'Toutes les étapes faites : ' + t.title);
  if (reopen) await game.revoke('task:' + taskId);
  if (finish || reopen) await syncGoalProgress(t.goalId);
}

async function editTask(id, fn) {
  const t = await db.get('tasks', id);
  if (!t) return;
  fn(t);
  await db.put('tasks', t);
  return t;
}

/** Change l'objectif d'une mission (null = aucun). */
export async function setTaskGoal(id, goalId) {
  let before = null;
  await editTask(id, (t) => { before = t.goalId || null; t.goalId = goalId || null; });
  await syncGoalProgress(before);
  await syncGoalProgress(goalId);
}

function goalOptions(current) {
  const groups = {};
  for (const g of goalsCache) (groups[g.horizon] ||= []).push(g);
  return `<option value="">Aucun objectif</option>` + Object.entries(HORIZON_NAMES).filter(([h]) => groups[h])
    .map(([h, name]) => `<optgroup label="${name}">${groups[h].map((g) => `<option value="${g.id}" ${g.id === current ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}</optgroup>`).join('');
}

/**
 * HTML d'une mission. ref = date de référence (pour « en retard »).
 * opts.hideGoal : ne pas afficher la pastille d'objectif (déjà dans l'objectif).
 * opts.showDate : afficher la date prévue.
 */
export function taskHTML(t, ref, opts = {}) {
  const subs = t.subtasks || [];
  const sd = subs.filter((s) => s.done).length;
  const late = t.date && ref && t.date < ref && !t.done;
  const goal = t.goalId && goalsCache.find((g) => g.id === t.goalId);
  const dateChip = late ? `<span class="chip warn">${U.fmtShort(U.parseISO(t.date))}</span>`
    : opts.showDate ? `<span class="chip">${t.date ? U.fmtShort(U.parseISO(t.date)) : 'sans date'}</span>` : '';
  // Les pastilles vont sous le titre : le titre garde toute la largeur, même dans une colonne étroite.
  const focusChip = timer.current()?.taskId === t.id ? '<span class="chip focus-chip" title="Minuteur en cours">⏱ focus</span>' : '';
  const alarmChip = t.alarmAt && !t.done
    ? `<span class="chip alarm-chip ${t.alarmState === 'ringing' ? 'ringing' : ''}" title="Alarme">⏰ ${esc(alarms.label(t.alarmAt))}</span>` : '';
  const chips = [
    focusChip,
    alarmChip,
    goal && !opts.hideGoal ? `<span class="chip goal-chip" title="Objectif : ${esc(goal.title)}">🎯 ${esc(goal.title)}</span>` : '',
    dateChip,
    subs.length ? `<span class="chip ${sd === subs.length ? 'ok' : ''}" title="Étapes faites">✓ ${sd}/${subs.length}</span>` : '',
    t.notes ? '<span class="chip" title="Contient des notes">✎</span>' : '',
  ].join('');
  return `<li class="task ${t.done ? 'done' : ''}" data-id="${t.id}">
    <div class="task-row">
      <div class="t-main">
        <label><input type="checkbox" class="t-cb" ${t.done ? 'checked' : ''}><span class="t-title">${esc(t.title)}</span></label>
        ${chips ? `<div class="t-chips">${chips}</div>` : ''}
      </div>
      <button class="exp" aria-label="Modifier la mission" title="Modifier : étapes, notes, date, objectif">›</button>
      <button class="x t-del" aria-label="Supprimer">×</button>
    </div>
  </li>`;
}

/** Branche les interactions sur une liste de missions. redraw() doit re-générer la liste. */
export function bindTaskList(root, redraw) {
  root.querySelectorAll('.task').forEach((li) => {
    const id = li.dataset.id;
    li.querySelector('.t-cb').onchange = async (e) => { await setTaskDone(id, e.target.checked); redraw(); };
    li.querySelector('.t-del').onclick = async () => { await deleteTask(id); redraw(); };
    li.querySelector('.exp').onclick = () => openTaskEditor(id, redraw);
  });
}

/* ---------- Fenêtre d'édition d'une mission ---------- */
/**
 * Ouvre la mission dans une fenêtre (pop-up). Chaque changement est enregistré tout de suite ;
 * onChange() est appelé après chaque changement pour rafraîchir la liste derrière.
 */
export async function openTaskEditor(id, onChange = () => {}) {
  await loadGoals();
  let host = document.getElementById('modal-root');
  if (!host) { host = document.createElement('div'); host.id = 'modal-root'; document.body.appendChild(host); }
  host.innerHTML = '<div class="modal-back"><div class="modal task-modal" role="dialog" aria-modal="true" aria-label="Modifier la mission"></div></div>';
  const back = host.firstElementChild;
  const box = back.firstElementChild;
  let closed = false;

  const changed = () => { try { onChange(); } catch { /* la liste a pu disparaître */ } };
  const saveTitle = U.debounce(async (v) => { await editTask(id, (t) => { t.title = v; }); changed(); }, 400);
  const saveNotes = U.debounce(async (v) => { await editTask(id, (t) => { t.notes = v; }); changed(); }, 500);
  const flush = async () => { await saveTitle.flush(); await saveNotes.flush(); };

  const close = async () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    await flush();
    if (host.firstElementChild === back) host.innerHTML = '';
    changed();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });

  const draw = async (focus) => {
    if (closed) return;
    const t = await db.get('tasks', id);
    if (!t) return close();
    const subs = t.subtasks || [];
    const sd = subs.filter((s) => s.done).length;
    // Notes du Cerveau associées à cette mission (« 🧷 Associé à » dans une note)
    const linked = (await db.all('notes')).filter((x) => !x.archived && (x.rel?.tasks || []).includes(t.id));
    box.innerHTML = `
      <div class="tm-head">
        <input type="checkbox" class="tm-cb" ${t.done ? 'checked' : ''} aria-label="Mission accomplie" title="Mission accomplie">
        <textarea class="tm-title" rows="1" aria-label="Titre de la mission">${esc(t.title)}</textarea>
        <button class="tm-close" aria-label="Fermer" title="Fermer (Échap)">×</button>
      </div>
      <div class="tm-meta">
        <label><span>📅 Date</span><input type="date" class="tm-date" value="${t.date || ''}"></label>
        <label><span>🎯 Objectif</span><select class="tm-goal">${goalOptions(t.goalId)}</select></label>
      </div>
      <section class="tm-sec tm-focus">
        <h3>⏱ Minuteur de focus ${t.focusMin ? `<span class="muted">${t.pomodoros ? `🍅 ${t.pomodoros} · ` : ''}${t.focusMin} min de focus</span>` : ''}</h3>
        ${timer.current()?.taskId === t.id
          ? '<p class="muted" style="margin:0">⏱ Le minuteur tourne sur cette mission (en bas de l’écran).</p>'
          : `<div class="tm-focus-row">
          ${timer.PRESETS.map(([w, b], i) => `<button type="button" class="btn ${i ? '' : 'primary'}" data-pomo="${w}|${b}" title="${w} min de focus, puis ${b} min de pause">${i ? '' : '🍅 '}${w} min</button>`).join('')}
          <span class="tm-focus-custom"><input type="number" min="1" max="180" placeholder="min" aria-label="Durée personnalisée en minutes" class="tm-pomo-min"><button type="button" class="btn" data-pomo-custom aria-label="Démarrer la durée personnalisée">▶</button></span>
        </div>`}
      </section>
      <section class="tm-sec tm-alarm">
        <h3>⏰ Alarme ${t.alarmAt ? `<span class="muted">${esc(alarms.label(t.alarmAt))}</span>` : ''}</h3>
        <div class="tm-alarm-row">
          <input type="datetime-local" class="tm-alarm-at" value="${alarms.toInput(t.alarmAt)}" aria-label="Date et heure de l’alarme">
          ${t.alarmAt ? '<button class="btn tm-alarm-off" type="button">Retirer</button>' : ''}
        </div>
        <div class="tm-alarm-quick">
          <button type="button" class="chip-btn" data-in="30">Dans 30 min</button>
          <button type="button" class="chip-btn" data-in="60">Dans 1 h</button>
          <button type="button" class="chip-btn" data-at="${t.date || ''}|09:00">${t.date && t.date > U.iso(new Date()) ? 'Ce jour-là' : 'Demain'} 9 h</button>
          <button type="button" class="chip-btn" data-at="${U.iso(new Date())}|19:00">Ce soir 19 h</button>
        </div>
      </section>
      <section class="tm-sec">
        <h3>Étapes ${subs.length ? `<span class="muted">${sd}/${subs.length}</span>` : ''}</h3>
        ${subs.length ? `<div class="sub-bar"><i style="width:${Math.round((sd / subs.length) * 100)}%"></i></div>` : ''}
        <ul class="subs">${subs.map((s) => `<li class="sub ${s.done ? 'done' : ''}" data-sid="${s.id}">
          <label><input type="checkbox" ${s.done ? 'checked' : ''}><span>${esc(s.title)}</span></label>
          <button class="x" aria-label="Supprimer l’étape">×</button></li>`).join('')}</ul>
        <form class="add-sub"><input name="s" placeholder="+ Ajouter une étape…" autocomplete="off"></form>
      </section>
      <section class="tm-sec">
        <h3>Notes</h3>
        <textarea class="notes" placeholder="Notes, détails, liens…">${esc(t.notes || '')}</textarea>
      </section>
      ${linked.length ? `<section class="tm-sec"><h3>🧠 Notes du Cerveau <span class="muted">${linked.length}</span></h3>
        <div class="assoc-list">${linked.map((x) => `<a class="assoc-chip" href="#/note/${x.id}" data-go="${x.id}">${esc(x.title || 'Sans titre')}</a>`).join('')}</div></section>` : ''}
      <div class="modal-actions tm-actions">
        <button class="btn danger tm-del">🗑 Supprimer</button>
        <button class="btn primary tm-ok">Terminé</button>
      </div>`;

    box.querySelectorAll('[data-go]').forEach((a) => (a.onclick = async (e) => { e.preventDefault(); await close(); location.hash = '#/note/' + a.dataset.go; }));
    const title = box.querySelector('.tm-title');
    const grow = () => { title.style.height = 'auto'; title.style.height = title.scrollHeight + 'px'; };
    grow();
    title.oninput = () => { grow(); const v = title.value.replace(/\n/g, ' ').trim(); if (v) saveTitle(v); };
    title.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); box.querySelector('.add-sub input').focus(); } };

    box.querySelector('.tm-cb').onchange = async (e) => { await flush(); await setTaskDone(id, e.target.checked); changed(); draw(); };
    box.querySelector('.tm-date').onchange = async (e) => { await editTask(id, (x) => { x.date = e.target.value || null; }); changed(); };
    box.querySelector('.tm-goal').onchange = async (e) => { await setTaskGoal(id, e.target.value || null); changed(); };

    // Minuteur de focus : démarre et ferme la fenêtre
    const startFocus = async (w, b) => {
      await flush();
      const cur = await db.get('tasks', id);
      await timer.start(cur, w, b);
      close();
    };
    box.querySelectorAll('[data-pomo]').forEach((b) => (b.onclick = () => { const [w, br] = b.dataset.pomo.split('|').map(Number); startFocus(w, br); }));
    box.querySelector('[data-pomo-custom]')?.addEventListener('click', () => {
      const m = Math.round(Number(box.querySelector('.tm-pomo-min').value));
      if (m >= 1 && m <= 180) startFocus(m, Math.max(1, Math.round(m / 5)));
      else box.querySelector('.tm-pomo-min').focus();
    });

    // Alarme
    const setAt = async (ms) => {
      if (ms && ms <= Date.now()) ms = Date.now() + 60_000; // une heure passée : sonne dans une minute
      await alarms.askPermission();
      await alarms.setAlarm(id, ms);
      changed();
      draw();
    };
    box.querySelector('.tm-alarm-at').onchange = (e) => setAt(alarms.fromInput(e.target.value));
    box.querySelector('.tm-alarm-off')?.addEventListener('click', async () => { await alarms.dismiss(id); changed(); draw(); });
    box.querySelectorAll('[data-in]').forEach((b) => (b.onclick = () => setAt(Date.now() + Number(b.dataset.in) * 60_000)));
    box.querySelectorAll('[data-at]').forEach((b) => (b.onclick = () => {
      let [day, hm] = b.dataset.at.split('|');
      if (!day || (hm === '09:00' && day <= U.iso(new Date()))) day = U.iso(U.addDays(new Date(), 1));
      setAt(new Date(`${day}T${hm}`).getTime());
    }));

    box.querySelectorAll('.sub').forEach((sl) => {
      sl.querySelector('input').onchange = async (e) => { await flush(); await setSubDone(id, sl.dataset.sid, e.target.checked); changed(); draw(); };
      sl.querySelector('.x').onclick = async () => {
        await flush();
        await editTask(id, (x) => { x.subtasks = x.subtasks.filter((s) => s.id !== sl.dataset.sid); });
        changed();
        draw();
      };
    });
    box.querySelector('.add-sub').onsubmit = async (e) => {
      e.preventDefault();
      const v = e.target.s.value.trim();
      if (!v) return;
      await flush();
      await editTask(id, (x) => { x.subtasks = [...(x.subtasks || []), { id: U.uid(), title: v, done: false }]; });
      changed();
      draw('.add-sub input');
    };
    const notes = box.querySelector('.notes');
    notes.oninput = () => saveNotes(notes.value);
    notes.onblur = () => saveNotes.flush();

    const del = box.querySelector('.tm-del');
    del.onclick = async () => {
      if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Confirmer la suppression'; return; }
      saveTitle.flush = saveNotes.flush = () => {}; // rien à enregistrer pour une mission supprimée
      closed = true;
      document.removeEventListener('keydown', onKey);
      await deleteTask(id);
      host.innerHTML = '';
      changed();
    };
    box.querySelector('.tm-ok').onclick = close;
    box.querySelector('.tm-close').onclick = close;
    if (focus) box.querySelector(focus)?.focus();
  };
  await draw();
}
