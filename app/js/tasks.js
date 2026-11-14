// Missions partagées entre l'app et le widget : étapes (sous-missions), notes, objectif lié et points.
// (Dans la base de données, les missions sont toujours rangées dans le magasin « tasks ».)
import { db } from './db.js';
import * as U from './util.js';
import * as game from './game.js';
import * as alarms from './alarms.js';
import * as timer from './timer.js';
import * as images from './images.js';
import * as couple from './couple.js';

const { esc } = U;

/* ---------- Objectifs liés ---------- */
let goalsCache = [];
let projectsCache = []; // notes « 🚀 Projet » du Cerveau (une mission peut y être rattachée directement)
/** À appeler avant d'afficher des missions (pour le choix de l'objectif et du projet). */
export async function loadGoals() {
  goalsCache = (await db.all('goals')).sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
  projectsCache = (await db.all('notes')).filter((n) => n.type === 'projet').sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  if (couple.ON) await couple.people(); // prénoms pour les pastilles « pour qui »
  return goalsCache;
}

/** Rattache une mission à un projet (null = aucun). */
export async function setTaskProject(id, projectId) {
  await editTask(id, (t) => { t.projectId = projectId || null; });
}

function projectOptions(current) {
  return `<option value="">Aucun projet</option>` + projectsCache.filter((p) => !p.archived || p.id === current)
    .map((p) => `<option value="${p.id}" ${p.id === current ? 'selected' : ''}>🚀 ${esc(p.title || 'Projet sans titre')}</option>`).join('');
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

export async function addTask(title, date, goalId = null, projectId = null) {
  const t = { id: U.uid(), title, date, goalId, projectId, done: false, createdAt: Date.now(), subtasks: [], notes: '' };
  await db.put('tasks', t);
  if (goalId) await syncGoalProgress(goalId);
  return t;
}

/* ---------- Supprimées : une mission supprimée va dans la corbeille (réglage synchronisé « taskTrash ») ---------- */
// Chaque entrée garde la mission entière ; une mission restaurée ou supprimée pour de bon devient une
// « pierre tombale » { id, gone, trashAt } (pour que la synchro ne la fasse pas réapparaître), effacée après 90 jours.
const TRASH = 'taskTrash';
const TOMB_DAYS = 90;
const rawTrash = async () => (await db.get('settings', TRASH)) || [];
async function saveTrash(list) {
  const limit = Date.now() - TOMB_DAYS * 864e5;
  await db.put('settings', list.filter((x) => !x.gone || (x.trashAt || 0) > limit), TRASH);
}
export const trashList = async () => (await rawTrash()).filter((x) => !x.gone).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));

/** Supprime une mission : elle est gardée dans l'onglet « Supprimées » (on peut la restaurer). */
export async function deleteTask(id) {
  const t = await db.get('tasks', id);
  if (!t) return;
  const now = Date.now();
  await saveTrash([{ ...t, deletedAt: now, trashAt: now }, ...(await rawTrash()).filter((x) => x.id !== id)]);
  await db.del('tasks', id);
  if (t.goalId) await syncGoalProgress(t.goalId);
}

/** Remet une mission supprimée dans les missions. */
export async function restoreTask(id) {
  const raw = await rawTrash();
  const t = raw.find((x) => x.id === id && !x.gone);
  if (!t) return null;
  const { deletedAt, trashAt, ...task } = t;
  if (task.goalId && !(await db.get('goals', task.goalId))) task.goalId = null; // objectif supprimé entre-temps
  task.updatedAt = Date.now();
  await db.put('tasks', task);
  await saveTrash(raw.map((x) => (x.id === id ? { id, gone: 'restored', trashAt: Date.now() } : x)));
  if (task.goalId) await syncGoalProgress(task.goalId);
  return task;
}

/** Supprime définitivement des missions de la corbeille (et leurs photos, si rien d'autre ne les utilise). */
export async function purgeTasks(ids) {
  const drop = new Set(ids);
  const raw = await rawTrash();
  const imgs = raw.filter((x) => drop.has(x.id) && !x.gone).flatMap((t) => t.images || []);
  await saveTrash(raw.map((x) => (drop.has(x.id) ? { id: x.id, gone: 'purged', trashAt: Date.now() } : x)));
  if (imgs.length) await images.removeUnused(imgs);
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
  const dateChip = late ? `<span class="chip warn" title="Prévue le ${U.fmtShort(U.parseISO(t.date))}">⚠ En retard · ${U.fmtShort(U.parseISO(t.date))}</span>`
    : opts.showDate ? `<span class="chip">${t.date ? U.fmtShort(U.parseISO(t.date)) : 'sans date'}</span>` : '';
  // Les pastilles vont sous le titre : le titre garde toute la largeur, même dans une colonne étroite.
  const focusChip = timer.current()?.taskId === t.id ? '<span class="chip focus-chip" title="Minuteur en cours">⏱ focus</span>' : '';
  const alarmChip = t.alarmAt && !t.done
    ? `<span class="chip alarm-chip ${t.alarmState === 'ringing' ? 'ringing' : ''}" title="Alarme">⏰ ${esc(alarms.label(t.alarmAt))}</span>` : '';
  const chips = [
    couple.whoChip(t), // app couple : pour qui
    focusChip,
    alarmChip,
    // Pastilles cliquables : le projet ouvre sa page ; l'objectif ouvre son projet (sinon la page Objectifs)
    goal && !opts.hideGoal ? `<a class="chip goal-chip chip-link" href="${goal.projectId ? `#/note/${goal.projectId}` : '#/goals'}" title="Objectif : ${esc(goal.title)}${goal.projectId ? ' (ouvrir son projet)' : ''}">🎯 ${esc(goal.title)}</a>` : '',
    (() => { const p = t.projectId && !opts.hideProject && projectsCache.find((x) => x.id === t.projectId); return p ? `<a class="chip goal-chip chip-link" href="#/note/${p.id}" title="Ouvrir le projet ${esc(p.title)}">🚀 ${esc(p.title || 'Projet')}</a>` : ''; })(),
    dateChip,
    subs.length ? `<span class="chip ${sd === subs.length ? 'ok' : ''}" title="Étapes faites">✓ ${sd}/${subs.length}</span>` : '',
    t.notes ? '<span class="chip" title="Contient des notes">✎</span>' : '',
    t.images?.length ? `<button type="button" class="chip chip-link t-photos" title="Voir ${t.images.length > 1 ? `les ${t.images.length} photos` : 'la photo'}" aria-label="Voir les photos de la mission">📷${t.images.length > 1 ? ' ' + t.images.length : ''}</button>` : '',
  ].join('');
  return `<li class="task ${t.done ? 'done' : ''}" data-id="${t.id}">
    <div class="task-row">
      <div class="t-main">
        <label><input type="checkbox" class="t-cb" ${t.done ? 'checked' : ''}><span class="t-title">${esc(t.title)}</span></label>
        ${chips ? `<div class="t-chips">${chips}</div>` : ''}
      </div>
      <button class="x t-del" aria-label="Supprimer">×</button>
      <button type="button" class="t-drag" aria-label="Déplacer « ${esc(t.title)} » (glisser, ou flèches ↑ ↓)" title="Glisser pour déplacer"><svg viewBox="0 0 10 16" aria-hidden="true"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg></button>
    </div>
  </li>`;
}

/** Branche les interactions sur une liste de missions. redraw() doit re-générer la liste. */
/* ---------- « Annuler » pendant 3 secondes après une mission accomplie ---------- */
let undoTimer = null;
export function showUndo(text, onUndo, ms = 3000) {
  let bar = document.getElementById('undo-bar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'undo-bar'; bar.setAttribute('role', 'status'); document.body.appendChild(bar); }
  clearTimeout(undoTimer);
  bar.innerHTML = `<span>${esc(text)}</span><button type="button">↶ Annuler</button><i style="animation-duration:${ms}ms"></i>`;
  bar.className = 'show';
  const hide = () => { bar.className = ''; };
  bar.querySelector('button').onclick = async () => { clearTimeout(undoTimer); hide(); await onUndo(); dispatchEvent(new Event('lp-undo')); };
  undoTimer = setTimeout(hide, ms);
}

/** Enregistre l'ordre affiché d'une liste de missions (champ « order », synchronisé). */
async function saveOrder(ul) {
  const ids = [...ul.children].filter((x) => x.classList.contains('task')).map((x) => x.dataset.id);
  for (let i = 0; i < ids.length; i++) {
    const t = await db.get('tasks', ids[i]);
    if (t && t.order !== i * 10) { t.order = i * 10; t.updatedAt = Date.now(); await db.put('tasks', t); }
  }
}

// Glisser-déposer d'une mission dans sa liste (pointer events : souris, doigt et stylet)
function startDrag(e, li, redraw) {
  if (e.button > 0) return;
  e.preventDefault();
  const ul = li.parentElement;
  const pid = e.pointerId;
  // On écoute toute la fenêtre : déplacer la ligne dans la liste fait perdre la « capture » du pointeur
  // à la poignée, ce qui arrêtait le glisser après une seule place.
  const startY = e.clientY;
  let moved = false;
  li.classList.add('dragging');
  ul.classList.add('drag-on');
  const onMove = (ev) => {
    if (ev.pointerId !== pid) return;
    ev.preventDefault();
    if (!moved && Math.abs(ev.clientY - startY) < 4) return;
    moved = true;
    // On place la mission avant la première voisine dont le milieu est sous le doigt
    const others = [...ul.children].filter((x) => x !== li && x.classList.contains('task'));
    const before = others.find((x) => { const r = x.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
    if (before) { if (li.nextElementSibling !== before) ul.insertBefore(li, before); } else if (ul.lastElementChild !== li) ul.appendChild(li);
    // Défilement automatique près des bords de l'écran
    if (ev.clientY < 60) scrollBy(0, -12); else if (ev.clientY > innerHeight - 60) scrollBy(0, 12);
  };
  const onUp = async (ev) => {
    if (ev && ev.pointerId !== pid) return;
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onUp);
    li.classList.remove('dragging');
    ul.classList.remove('drag-on');
    if (!moved) return;
    await saveOrder(ul);
    redraw();
  };
  addEventListener('pointermove', onMove, { passive: false });
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
}

export function bindTaskList(root, redraw) {
  root.querySelectorAll('.task').forEach((li) => {
    const id = li.dataset.id;
    li.querySelector('.t-cb').onchange = async (e) => {
      const done = e.target.checked;
      await setTaskDone(id, done);
      redraw();
      if (done) {
        const title = li.querySelector('.t-title')?.textContent || 'Mission';
        showUndo(`✅ « ${title} » accomplie`, async () => { await setTaskDone(id, false); redraw(); });
      }
    };
    li.querySelector('.t-del').onclick = async () => {
      const title = li.querySelector('.t-title')?.textContent || 'Mission';
      await deleteTask(id);
      redraw();
      showUndo(`🗑 « ${title} » déplacée dans Supprimées`, async () => { await restoreTask(id); redraw(); }, 5000);
    };
    li.querySelector('.exp')?.addEventListener('click', () => openTaskEditor(id, redraw));
    // Toucher le titre ouvre la mission ; seule la case la marque accomplie
    const title = li.querySelector('.t-title');
    if (title) {
      title.setAttribute('role', 'button');
      title.tabIndex = 0; // au clavier : Tab puis Entrée ouvre la mission (remplace l'ancienne flèche ›)
      title.title = 'Ouvrir la mission : étapes, notes, date, objectif';
      title.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTaskEditor(id, redraw); } };
      title.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openTaskEditor(id, redraw); };
    }
    // L'espace vide de la ligne (après le titre, autour des pastilles) ouvre aussi la mission, sans la cocher
    const main = li.querySelector('.t-main');
    if (main) main.onclick = (e) => {
      if (e.target.closest('.t-cb, a, button, input, select')) return;
      e.preventDefault();
      openTaskEditor(id, redraw);
    };
    // ⋮⋮ : glisser pour changer la place de la mission dans sa liste (souris ou doigt), ou flèches ↑ ↓ au clavier
    const handle = li.querySelector('.t-drag');
    if (handle) {
      handle.onpointerdown = (e) => startDrag(e, li, redraw);
      handle.onkeydown = async (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const sib = e.key === 'ArrowUp' ? li.previousElementSibling : li.nextElementSibling;
        if (!sib?.classList.contains('task')) return;
        e.key === 'ArrowUp' ? sib.before(li) : sib.after(li);
        await saveOrder(li.parentElement);
        await redraw();
        document.querySelector(`.task[data-id="${id}"] .t-drag`)?.focus();
      };
    }
    // 📷 : ouvre les photos de la mission en plein écran
    const ph = li.querySelector('.t-photos');
    if (ph) ph.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const t = await db.get('tasks', id);
      if (!(await images.gallery(t?.images || []))) openTaskEditor(id, redraw); // photo pas encore synchronisée : on ouvre la mission
    };
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
    const linked = (await db.all('notes')).filter((x) => (x.rel?.tasks || []).includes(t.id)); // y compris la note archivée devenue mission
    const remOn = !!(await db.get('settings', 'gcalReminders')); // rappels copiés dans Google Agenda
    box.innerHTML = `
      <div class="tm-head">
        <input type="checkbox" class="tm-cb" ${t.done ? 'checked' : ''} aria-label="Mission accomplie" title="Mission accomplie">
        <textarea class="tm-title" rows="1" aria-label="Titre de la mission">${esc(t.title)}</textarea>
        <button class="tm-close" aria-label="Fermer" title="Fermer (Échap)">×</button>
      </div>
      <div class="tm-meta">
        <label><span>📅 Date</span><input type="date" class="tm-date" value="${t.date || ''}"></label>
        <label><span>🎯 Objectif</span><select class="tm-goal">${goalOptions(t.goalId)}</select></label>
        <label><span>🚀 Projet</span><select class="tm-proj">${projectOptions(t.projectId)}</select></label>
        ${couple.ON ? `<label><span>👤 Pour</span><select class="tm-who">${couple.whoOptions(t.who || '')}</select></label>` : ''}
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
        ${remOn ? (t.alarmAt ? '<p class="tm-rem muted">📱 Aussi dans ton Google Agenda : ton cellulaire sonnera même si l’app est fermée.</p>' : '')
          : '<p class="tm-rem muted">💡 Pour que l’alarme sonne même app fermée : Réglages → 🔔 Rappels fiables.</p>'}
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
      <section class="tm-sec tm-photos">
        <h3>📷 Photos ${(t.images || []).length ? `<span class="muted">${t.images.length}</span>` : ''}</h3>
        ${(t.images || []).length ? `<div class="tm-imgs">${t.images.map((im) => `<figure class="tm-img"><img data-img="${im}" alt="Photo de la mission" title="Agrandir"><button class="x" data-rmimg="${im}" aria-label="Retirer la photo">×</button></figure>`).join('')}</div>` : ''}
        <div class="tm-img-add">
          <label class="btn"><input type="file" accept="image/*" multiple hidden class="tm-img-file">📷 Ajouter une photo</label>
          <button type="button" class="btn tm-img-paste" title="Coller une image copiée">📋 Coller</button>
          <small class="muted">ou Ctrl + V n’importe où dans cette fenêtre</small>
        </div>
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
    box.querySelector('.tm-proj').onchange = async (e) => { await setTaskProject(id, e.target.value || null); changed(); };
    box.querySelector('.tm-who')?.addEventListener('change', async (e) => { await editTask(id, (x) => { x.who = e.target.value || null; }); changed(); });

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

    // Photos : bouton, Coller, Ctrl + V (géré une fois pour la fenêtre, plus bas) ; clic = agrandir
    images.hydrate(box);
    box.querySelectorAll('.tm-img img').forEach((img) => (img.onclick = () => img.src && images.zoom(img.src)));
    box.querySelectorAll('[data-rmimg]').forEach((b) => (b.onclick = async () => {
      await flush();
      await editTask(id, (x) => { x.images = (x.images || []).filter((m) => m !== b.dataset.rmimg); });
      await images.removeUnused([b.dataset.rmimg]);
      changed();
      draw();
    }));
    box.querySelector('.tm-img-file').onchange = (e) => addImages([...e.target.files]);
    box.querySelector('.tm-img-paste').onclick = async () => {
      try {
        const files = [];
        for (const item of await navigator.clipboard.read()) {
          const type = item.types.find((ty) => ty.startsWith('image/'));
          if (type) files.push(await item.getType(type));
        }
        if (files.length) addImages(files);
        else alertBox('Aucune image dans le presse-papiers. Copie une image ou une capture d’écran, puis réessaie.');
      } catch {
        alertBox('Le navigateur n’a pas permis de lire le presse-papiers : utilise Ctrl + V dans cette fenêtre.');
      }
    };

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

  // Ajoute des images (réduites et compressées) à la mission
  let adding = false;
  const addImages = async (files) => {
    const list = files.filter((f) => f && f.type?.startsWith('image/'));
    if (!list.length || adding) return;
    adding = true;
    try {
      await flush();
      const ids = [];
      for (const f of list) ids.push(await images.save(f));
      await editTask(id, (x) => { x.images = [...(x.images || []), ...ids]; });
      changed();
      await draw();
      box.querySelector('.tm-photos')?.scrollIntoView({ block: 'nearest' });
    } catch {
      alertBox('Cette image n’a pas pu être ajoutée (format non pris en charge ?).');
    } finally { adding = false; }
  };
  const alertBox = (msg) => { const p = box.querySelector('.tm-img-add small'); if (p) { p.textContent = msg; p.classList.add('warn-text'); } };
  // Ctrl + V : une image collée (le texte collé dans un champ reste du texte)
  box.addEventListener('paste', (e) => {
    const files = images.imageFiles(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    addImages(files);
  });
  // Glisser-déposer une image sur la fenêtre
  box.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  box.addEventListener('drop', (e) => { const files = images.imageFiles(e.dataTransfer); if (files.length) { e.preventDefault(); addImages(files); } });
  await draw();
}
