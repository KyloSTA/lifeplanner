// Missions partagées entre l'app et le widget : étapes (sous-missions), notes, objectif lié et points.
// (Dans la base de données, les missions sont toujours rangées dans le magasin « tasks ».)
import { db } from './db.js';
import * as U from './util.js';
import * as game from './game.js';
import * as alarms from './alarms.js';
import * as timer from './timer.js';
import * as images from './images.js';
import * as couple from './couple.js';
import { swipeable } from './swipe.js';

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

/** Avancement d'une mission (0 à 1) : terminée = 1, sinon la part de ses étapes cochées. */
export const missionFrac = (t) => (t.done ? 1 : t.subtasks?.length ? t.subtasks.filter((s) => s.done).length / t.subtasks.length : 0);

/** La progression d'un objectif suit ses missions (s'il en a) — les étapes cochées comptent en partie. */
export async function syncGoalProgress(goalId) {
  if (!goalId) return;
  const g = await db.get('goals', goalId);
  if (!g) return;
  const list = await missionsOf(goalId);
  if (!list.length) return; // sans mission : progression manuelle
  const p = Math.round((list.reduce((n, t) => n + missionFrac(t), 0) / list.length) * 100);
  if (p !== g.progress) {
    g.progress = p;
    await db.put('goals', g);
  }
  await game.syncGoal(g);
}

export async function addTask(title, date, goalId = null, projectId = null) {
  // Nouvelle mission en haut de la liste : un rang juste avant la première
  const orders = (await db.all('tasks')).map((x) => x.order).filter((o) => typeof o === 'number');
  const order = (orders.length ? Math.min(0, ...orders) : 0) - 10;
  const t = { id: U.uid(), title, date, goalId, projectId, done: false, createdAt: Date.now(), subtasks: [], notes: '', order };
  if (nextImages?.length) { t.images = [...nextImages]; nextImages = null; clearTimeout(nextTimer); } // photo collée dans la case
  await db.put('tasks', t);
  if (goalId) await syncGoalProgress(goalId);
  return t;
}

/* ---------- Photo collée dans une case « + mission » : elle accompagne la prochaine mission créée ---------- */
let nextImages = null, nextTimer = 0;
export function setNextTaskImages(ids) {
  nextImages = [...ids];
  clearTimeout(nextTimer);
  // Formulaire envoyé sans créer de mission (titre vide…) : les photos ne restent pas en attente
  nextTimer = setTimeout(() => { const left = nextImages; nextImages = null; if (left?.length) images.removeUnused(left); }, 4000);
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
  await syncGoalProgress(t.goalId); // chaque étape fait avancer l'objectif
}

/**
 * Transforme une mission en étape d'une autre : son titre devient une étape (ses propres étapes suivent),
 * ses notes et photos sont ajoutées à l'autre mission, et ce qui lui était associé (notes du Cerveau,
 * pages manuscrites) suit. L'ancienne mission va dans « Supprimées » (on peut la restaurer).
 */
export async function makeStep(id, targetId) {
  const src = await db.get('tasks', id);
  const tgt = await db.get('tasks', targetId);
  if (!src || !tgt || id === targetId) return null;
  const steps = [{ id: U.uid(), title: src.title, done: !!src.done },
    ...(src.subtasks || []).map((s) => ({ id: U.uid(), title: s.title, done: !!s.done }))];
  tgt.subtasks = [...(tgt.subtasks || []), ...steps];
  if ((src.notes || '').trim()) tgt.notes = [(tgt.notes || '').trim(), `— ${src.title} —\n${src.notes.trim()}`].filter(Boolean).join('\n\n');
  if ((src.images || []).length) tgt.images = [...new Set([...(tgt.images || []), ...src.images])];
  await db.put('tasks', tgt);
  // Associations : les notes et pages liées à l'ancienne mission pointent vers la nouvelle
  for (const store of ['notes', 'pages']) {
    for (const x of await db.all(store)) {
      const ids = x.rel?.tasks || [];
      if (!ids.includes(id)) continue;
      x.rel.tasks = [...new Set(ids.map((t) => (t === id ? targetId : t)))];
      await db.put(store, x);
    }
  }
  await deleteTask(id);
  return tgt;
}

/** Petites marques après le titre d'une étape : sa date et ✎ si elle a des notes. */
const stepMeta = (s) => (s.date || s.notes ? ` <small class="sub-meta">${s.date ? '📅 ' + U.fmtShort(U.parseISO(s.date)) : ''}${s.notes ? ' ✎' : ''}</small>` : '');

/* ---------- Mission placée à l'horaire (vue Jour) : t.time « HH:MM » et t.dur (minutes) ---------- */
export const DURS = [15, 30, 45, 60, 90, 120, 180, 240];
const hm = (min) => { const h = Math.floor(min / 60), m = min % 60; return `${h} h${m ? ' ' + String(m).padStart(2, '0') : ''}`; };
const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
/** « 9 h – 10 h 30 » */
export function timeLabel(t) {
  if (!t.time) return '';
  const s = toMin(t.time), e = Math.min(s + (t.dur || 60), 24 * 60);
  return `${hm(s)} – ${hm(e)}`;
}
/** Place la mission à une heure (time = null : la retire de l'horaire). */
export async function scheduleTask(id, day, time, dur) {
  return editTask(id, (t) => {
    if (day) t.date = day;
    t.time = time || null;
    if (time) t.dur = dur || t.dur || 60;
  });
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
  // Les objectifs sans échéance (ou avec une échéance inconnue) ont leur propre groupe ;
  // un objectif terminé n'est plus proposé, sauf celui déjà choisi
  const groups = {};
  for (const g of goalsCache) {
    if (g.done && g.id !== current) continue;
    const h = HORIZON_NAMES[g.horizon] ? g.horizon : '';
    (groups[h] ||= []).push(g);
  }
  const names = [...Object.entries(HORIZON_NAMES).filter(([h]) => h), ['', 'Sans échéance']];
  return `<option value="">Aucun objectif</option>` + names.filter(([h]) => groups[h])
    .map(([h, name]) => `<optgroup label="${name}">${groups[h].map((g) => `<option value="${g.id}" ${g.id === current ? 'selected' : ''}>${esc(g.title)}${g.done ? ' (terminé)' : ''}</option>`).join('')}</optgroup>`).join('');
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
  const timeChip = t.time ? `<span class="chip time-chip" title="Placée à l’horaire">🕒 ${esc(timeLabel(t))}</span>` : '';
  const chips = [
    couple.whoChip(t), // app couple : pour qui
    focusChip,
    timeChip,
    alarmChip,
    // Pastilles cliquables : le projet ouvre sa page ; l'objectif ouvre son projet (sinon la page Objectifs)
    goal && !opts.hideGoal ? `<a class="chip goal-chip chip-link" href="${goal.projectId ? `#/note/${goal.projectId}` : '#/goals'}" title="Objectif : ${esc(goal.title)}${goal.projectId ? ' (ouvrir son projet)' : ''}">🎯 ${esc(goal.title)}</a>` : '',
    (() => { const p = t.projectId && !opts.hideProject && projectsCache.find((x) => x.id === t.projectId); return p ? `<a class="chip goal-chip chip-link" href="#/note/${p.id}" title="Ouvrir le projet ${esc(p.title)}">🚀 ${esc(p.title || 'Projet')}</a>` : ''; })(),
    dateChip,
    // Étapes : la pastille déplie la liste des étapes sous la mission (à cocher sur place)
    subs.length ? `<button type="button" class="chip chip-link t-subs-toggle ${sd === subs.length ? 'ok' : ''}" aria-expanded="${subsOpen.has(t.id)}" title="Voir les étapes">✓ ${sd}/${subs.length} <span class="t-caret" aria-hidden="true">▾</span></button>` : '',
    t.notes ? '<span class="chip" title="Contient des notes">✎</span>' : '',
    t.images?.length ? `<button type="button" class="chip chip-link t-photos" title="Voir ${t.images.length > 1 ? `les ${t.images.length} photos` : 'la photo'}" aria-label="Voir les photos de la mission">📷${t.images.length > 1 ? ' ' + t.images.length : ''}</button>` : '',
  ].join('');
  return `<li class="task ${t.done ? 'done' : ''} ${subs.length && subsOpen.has(t.id) ? 'subs-open' : ''}" data-id="${t.id}">
    <div class="task-row">
      <div class="t-main">
        <label><input type="checkbox" class="t-cb" ${t.done ? 'checked' : ''}><span class="t-title">${esc(t.title)}</span></label>
        ${chips ? `<div class="t-chips">${chips}</div>` : ''}
      </div>
      <button class="x t-del" aria-label="Supprimer">×</button>
      <button type="button" class="t-drag" aria-label="Déplacer « ${esc(t.title)} » (glisser, ou flèches ↑ ↓)" title="Glisser pour déplacer"><svg viewBox="0 0 10 16" aria-hidden="true"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg></button>
    </div>
    ${subs.length ? `<ul class="t-subs">${subs.map((s) => `<li class="${s.done ? 'done' : ''}"><label class="sub-cb"><input type="checkbox" data-sub="${s.id}" ${s.done ? 'checked' : ''} aria-label="Étape faite : ${esc(s.title)}"></label><button type="button" class="sub-open" data-open-sub="${s.id}" title="Ouvrir l’étape">${esc(s.title)}${stepMeta(s)}</button></li>`).join('')}</ul>` : ''}
  </li>`;
}

// Missions dont les étapes sont dépliées (gardé sur cet appareil)
const SUBS_KEY = 'lp.subsOpen';
const subsOpen = (() => { try { return new Set(JSON.parse(localStorage.getItem(SUBS_KEY)) || []); } catch { return new Set(); } })();
const saveSubsOpen = () => { try { localStorage.setItem(SUBS_KEY, JSON.stringify([...subsOpen].slice(-100))); } catch { /* ignore */ } };

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
  let zone = null; // zone de dépôt survolée (ex. l'horaire de la vue Jour : data-drop-day)
  const title = li.querySelector('.t-title')?.textContent || 'Mission';
  li.classList.add('dragging');
  ul.classList.add('drag-on');
  const onMove = (ev) => {
    if (ev.pointerId !== pid) return;
    ev.preventDefault();
    if (!moved && Math.abs(ev.clientY - startY) < 4) return;
    moved = true;
    // Au-dessus d'une zone de dépôt (horaire) : on ne réordonne pas la liste, la zone montre l'heure visée
    const z = document.elementsFromPoint(ev.clientX, ev.clientY).find((el) => el.dataset?.dropDay);
    if (z !== zone) { zone?.dispatchEvent(new CustomEvent('lp-drag-leave')); zone = z || null; li.classList.toggle('drag-out', !!zone); }
    if (zone) {
      zone.dispatchEvent(new CustomEvent('lp-drag-over', { detail: { y: ev.clientY, title } }));
      { const sc = document.getElementById('view') || window; if (ev.clientY < 60) sc.scrollBy(0, -12); else if (ev.clientY > innerHeight - 60) sc.scrollBy(0, 12); }
      return;
    }
    // On place la mission avant la première voisine dont le milieu est sous le doigt
    const others = [...ul.children].filter((x) => x !== li && x.classList.contains('task'));
    const before = others.find((x) => { const r = x.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
    if (before) { if (li.nextElementSibling !== before) ul.insertBefore(li, before); } else if (ul.lastElementChild !== li) ul.appendChild(li);
    // Défilement automatique près des bords de l'écran
    { const sc = document.getElementById('view') || window; if (ev.clientY < 60) sc.scrollBy(0, -12); else if (ev.clientY > innerHeight - 60) sc.scrollBy(0, 12); }
  };
  const onUp = async (ev) => {
    if (ev && ev.pointerId !== pid) return;
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onUp);
    li.classList.remove('dragging', 'drag-out');
    ul.classList.remove('drag-on');
    if (!moved) return;
    if (zone) { // déposée sur l'horaire : la zone donne l'heure à la mission
      zone.dispatchEvent(new CustomEvent('lp-drop', { detail: { id: li.dataset.id, y: ev?.clientY ?? startY } }));
      return;
    }
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
    // ✓ n/m ▾ : déplie ou replie les étapes sous la mission ; une étape se coche sur place
    li.querySelector('.t-subs-toggle')?.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const open = !li.classList.contains('subs-open');
      li.classList.toggle('subs-open', open);
      e.currentTarget.setAttribute('aria-expanded', String(open));
      open ? subsOpen.add(id) : subsOpen.delete(id);
      saveSubsOpen();
    });
    // Toucher le titre d'une étape l'ouvre (comme une mission) ; la case la coche sur place
    li.querySelectorAll('[data-open-sub]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openTaskEditor(id, redraw, { step: b.dataset.openSub }); }));
    li.querySelectorAll('[data-sub]').forEach((cb) => (cb.onchange = async (e) => {
      e.stopPropagation();
      await setSubDone(id, cb.dataset.sub, cb.checked);
      redraw();
    }));
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
    // Au doigt : balayer → pour accomplir, ← pour reporter à demain (avec « Annuler »)
    const ttl = () => li.querySelector('.t-title')?.textContent || 'Mission';
    swipeable(li, {
      right: li.classList.contains('done') ? null : { label: '✓ Fait', run: async () => {
        await setTaskDone(id, true);
        redraw();
        showUndo(`✅ « ${ttl()} » accomplie`, async () => { await setTaskDone(id, false); redraw(); });
      } },
      left: { label: '→ Demain', run: async () => {
        const before = (await db.get('tasks', id))?.date || null;
        const tomorrow = U.iso(U.addDays(new Date(), 1));
        await editTask(id, (x) => { x.date = tomorrow; });
        redraw();
        showUndo(`📅 « ${ttl()} » reportée à demain`, async () => { await editTask(id, (x) => { x.date = before; }); redraw(); }, 5000);
      } },
    });
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
export async function openTaskEditor(id, onChange = () => {}, opts = {}) {
  await loadGoals();
  let host = document.getElementById('modal-root');
  if (!host) { host = document.createElement('div'); host.id = 'modal-root'; document.body.appendChild(host); }
  host.innerHTML = '<div class="modal-back"><div class="modal task-modal" role="dialog" aria-modal="true" aria-label="Modifier la mission"></div></div>';
  const back = host.firstElementChild;
  const box = back.firstElementChild;
  let closed = false;
  let moreOpen = (() => { try { return !!localStorage.getItem('lp.tmMore'); } catch { return false; } })(); // « Plus d'options » ouvert la dernière fois

  const changed = () => { try { onChange(); } catch { /* la liste a pu disparaître */ } };
  const saveTitle = U.debounce(async (v) => { await editTask(id, (t) => { t.title = v; }); changed(); }, 400);
  const saveNotes = U.debounce(async (v) => { await editTask(id, (t) => { t.notes = v; }); changed(); }, 500);
  let stepFlush = async () => {}; // étape ouverte : ses changements en attente
  const flush = async () => { await saveTitle.flush(); await saveNotes.flush(); await stepFlush(); };

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
    const linkedPages = (await db.all('pages')).filter((p) => (p.rel?.tasks || []).includes(t.id)); // pages manuscrites associées
    const remOn = !!(await db.get('settings', 'gcalReminders')); // rappels copiés dans Google Agenda
    // Fenêtre allégée : l'essentiel (date, étapes, notes, photos) toujours visible ; le reste sous « Plus d'options »,
    // sauf ce qui est déjà rempli (objectif, projet, alarme, minuteur en cours) qui reste visible.
    const goalSel = `<label><span>🎯 Objectif</span><select class="tm-goal">${goalOptions(t.goalId)}</select></label>`;
    const projSel = `<label><span>🚀 Projet</span><select class="tm-proj">${projectOptions(t.projectId)}</select></label>`;
    const focusOn = timer.current()?.taskId === t.id;
    const hasPics = (t.images || []).length > 0;
    const photoAdd = `<div class="tm-img-add">
          <label class="btn"><input type="file" accept="image/*" multiple hidden class="tm-img-file">📷 Ajouter une photo</label>
          <button type="button" class="btn tm-img-paste" title="Coller une image copiée">📋 Coller</button>
          <small class="muted">ou Ctrl + V n’importe où dans cette fenêtre</small>
        </div>`;
    box.innerHTML = `
      <div class="tm-head">
        <input type="checkbox" class="tm-cb" ${t.done ? 'checked' : ''} aria-label="Mission accomplie" title="Mission accomplie">
        <textarea class="tm-title" rows="1" aria-label="Titre de la mission">${esc(t.title)}</textarea>
        <button class="tm-close" aria-label="Fermer" title="Fermer (Échap)">×</button>
      </div>
      <div class="tm-meta">
        <label><span>📅 Date</span><input type="date" class="tm-date" value="${t.date || ''}"></label>
        <label><span>🕒 Heure</span><input type="time" class="tm-time" step="900" value="${t.time || ''}" title="Place la mission dans l’horaire de la journée (vue Jour)"></label>
        ${t.time ? `<label><span>⏳ Durée</span><select class="tm-dur">${DURS.map((m) => `<option value="${m}" ${m === (t.dur || 60) ? 'selected' : ''}>${m < 60 ? m + ' min' : hm(m).replace(' h', ' h').trim()}</option>`).join('')}</select></label>` : ''}
        ${t.goalId ? goalSel : ''}
        ${t.projectId ? projSel : ''}
        ${couple.ON ? `<label><span>👤 Pour</span><select class="tm-who">${couple.whoOptions(t.who || '')}</select></label>` : ''}
      </div>
      <section class="tm-sec">
        <h3>Étapes ${subs.length ? `<span class="muted">${sd}/${subs.length}</span>` : ''}</h3>
        ${subs.length ? `<div class="sub-bar"><i style="width:${Math.round((sd / subs.length) * 100)}%"></i></div>` : ''}
        <ul class="subs">${subs.map((s) => `<li class="sub ${s.done ? 'done' : ''}" data-sid="${s.id}">
          <label class="sub-cb"><input type="checkbox" ${s.done ? 'checked' : ''} aria-label="Étape faite : ${esc(s.title)}"></label>
          <button type="button" class="sub-open" title="Ouvrir l’étape (notes, date…)">${esc(s.title)}${stepMeta(s)}</button>
          <button class="x" aria-label="Supprimer l’étape">×</button></li>`).join('')}</ul>
        <form class="add-sub"><input name="s" placeholder="+ Ajouter une étape…" autocomplete="off"></form>
      </section>
      <section class="tm-sec">
        <h3>Notes</h3>
        <textarea class="notes" placeholder="Notes, détails, liens…">${esc(t.notes || '')}</textarea>
      </section>
      ${hasPics ? `<section class="tm-sec tm-photos">
        <h3>📷 Photos <span class="muted">${t.images.length}</span></h3>
        <div class="tm-imgs">${t.images.map((im) => `<figure class="tm-img"><img data-img="${im}" alt="Photo de la mission" title="Agrandir"><button class="x" data-rmimg="${im}" aria-label="Retirer la photo">×</button></figure>`).join('')}</div>
        ${photoAdd}
      </section>` : ''}
      ${linked.length ? `<section class="tm-sec"><h3>🧠 Notes du Cerveau <span class="muted">${linked.length}</span></h3>
        <div class="assoc-list">${linked.map((x) => `<a class="assoc-chip" href="#/note/${x.id}" data-go="${x.id}">${esc(x.title || 'Sans titre')}</a>`).join('')}</div></section>` : ''}
      ${linkedPages.length ? `<section class="tm-sec"><h3>✍️ Pages manuscrites <span class="muted">${linkedPages.length}</span></h3>
        <div class="assoc-list">${linkedPages.map((p) => `<a class="assoc-chip" href="#/page/${encodeURIComponent(p.id)}" data-go-page="${esc(p.id)}">✍️ ${esc(p.title || 'Sans titre')}</a>`).join('')}</div></section>` : ''}
      <details class="tm-more" ${moreOpen || t.alarmAt || focusOn ? 'open' : ''}>
        <summary>⚙ Plus d’options <small class="muted">${[!t.goalId && 'objectif', !t.projectId && 'projet', !focusOn && 'minuteur', !t.alarmAt && 'alarme', !hasPics && 'photo', 'étape, événement'].filter(Boolean).join(', ')}</small></summary>
        ${!t.goalId || !t.projectId ? `<div class="tm-meta">${t.goalId ? '' : goalSel}${t.projectId ? '' : projSel}</div>` : ''}
      <section class="tm-sec tm-focus">
        <h3>⏱ Minuteur de focus ${t.focusMin ? `<span class="muted">${t.pomodoros ? `🍅 ${t.pomodoros} · ` : ''}${t.focusMin} min de focus</span>` : ''}</h3>
        ${timer.current()?.taskId === t.id
          ? '<p class="muted" style="margin:0">⏱ Le minuteur tourne sur cette mission (en bas de l’écran).</p>'
          : `<div class="tm-focus-row">
          ${timer.PRESETS.map(([w, b], i) => `<button type="button" class="btn ${i ? '' : 'primary'}" data-pomo="${w}|${b}" title="${w} min de focus, puis ${b} min de pause">${i ? '' : '🍅 '}${w} min</button>`).join('')}
          <span class="tm-focus-custom"><input type="number" inputmode="numeric" min="1" max="180" placeholder="min" aria-label="Durée personnalisée en minutes" class="tm-pomo-min"><button type="button" class="btn" data-pomo-custom aria-label="Démarrer la durée personnalisée">▶</button></span>
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
      ${hasPics ? '' : `<section class="tm-sec tm-photos"><h3>📷 Photos</h3>${photoAdd}</section>`}
      <div class="tm-more-acts">
        <button class="btn tm-tostep" title="Faire de cette mission une étape d’une autre mission">↳ Devenir une étape</button>
        <button class="btn tm-toevent" title="Créer un événement Google Agenda à partir de cette mission">📅 En événement</button>
      </div>
      </details>
      <div class="modal-actions tm-actions">
        <button class="btn danger tm-del">🗑 Supprimer</button>
        <button class="btn primary tm-ok">Terminé</button>
      </div>`;
    const more = box.querySelector('.tm-more');
    more.ontoggle = () => { moreOpen = more.open; try { localStorage.setItem('lp.tmMore', moreOpen ? '1' : ''); } catch { /* stockage indisponible */ } };

    box.querySelectorAll('[data-go-page]').forEach((a) => (a.onclick = async (e) => { e.preventDefault(); await close(); location.hash = '#/page/' + encodeURIComponent(a.dataset.goPage); }));
    box.querySelectorAll('[data-go]').forEach((a) => (a.onclick = async (e) => { e.preventDefault(); await close(); location.hash = '#/note/' + a.dataset.go; }));
    const title = box.querySelector('.tm-title');
    const grow = () => { title.style.height = 'auto'; title.style.height = title.scrollHeight + 'px'; };
    grow();
    title.oninput = () => { grow(); const v = title.value.replace(/\n/g, ' ').trim(); if (v) saveTitle(v); };
    title.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); box.querySelector('.add-sub input').focus(); } };

    box.querySelector('.tm-cb').onchange = async (e) => { await flush(); await setTaskDone(id, e.target.checked); changed(); draw(); };
    box.querySelector('.tm-date').onchange = async (e) => { await editTask(id, (x) => { x.date = e.target.value || null; }); changed(); };
    box.querySelector('.tm-time').onchange = async (e) => {
      const v = e.target.value;
      await editTask(id, (x) => { x.time = v || null; if (v) { x.dur ||= 60; x.date ||= U.iso(new Date()); } });
      changed(); draw();
    };
    box.querySelector('.tm-dur')?.addEventListener('change', async (e) => { await editTask(id, (x) => { x.dur = Number(e.target.value) || 60; }); changed(); });
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
      sl.querySelector('.sub-open').onclick = async () => { await flush(); editStep(sl.dataset.sid); };
      sl.querySelector('.x').onclick = async () => {
        await flush();
        await editTask(id, (x) => { x.subtasks = x.subtasks.filter((s) => s.id !== sl.dataset.sid); });
        await syncGoalProgress((await db.get('tasks', id))?.goalId);
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
      await syncGoalProgress((await db.get('tasks', id))?.goalId);
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
    box.querySelector('.tm-tostep').onclick = async () => { await flush(); pickParent(); };
    box.querySelector('.tm-toevent').onclick = async () => { await flush(); toEvent(); };
    box.querySelector('.tm-ok').onclick = close;
    box.querySelector('.tm-close').onclick = close;
    if (focus) box.querySelector(focus)?.focus();
  };

  // ↳ Une étape ouverte comme une mission : titre, fait, date, notes ; ‹ › pour passer d'une étape à l'autre
  const editStep = async (sid) => {
    const me = await db.get('tasks', id);
    const subs = me?.subtasks || [];
    const i = subs.findIndex((s) => s.id === sid);
    if (!me || i < 0) return draw();
    const s = subs[i];
    // Les enregistrements passent un à la fois (sinon deux écritures de la mission s'écrasent : date + notes)
    let chain = Promise.resolve();
    const patch = (fn) => (chain = chain.then(async () => { await editTask(id, (x) => { const y = (x.subtasks || []).find((z) => z.id === sid); if (y) fn(y); }); changed(); }).catch(console.error));
    const saveT = U.debounce((v) => patch((y) => { y.title = v; }), 400);
    const saveN = U.debounce((v) => patch((y) => { y.notes = v; }), 500);
    stepFlush = async () => { await saveT.flush(); await saveN.flush(); await chain; };
    box.innerHTML = `
      <div class="tm-head">
        <input type="checkbox" class="tm-cb st-cb" ${s.done ? 'checked' : ''} aria-label="Étape faite" title="Étape faite">
        <textarea class="tm-title st-title" rows="1" aria-label="Titre de l’étape">${esc(s.title)}</textarea>
        <button class="tm-close st-x" aria-label="Retour à la mission" title="Retour à la mission">×</button>
      </div>
      <p class="st-parent">↳ Étape ${i + 1}/${subs.length} de <button type="button" class="link-btn st-back">« ${esc(me.title)} »</button></p>
      <div class="tm-meta">
        <label><span>📅 Date</span><input type="date" class="st-date" value="${s.date || ''}" title="Date prévue pour cette étape (facultatif)"></label>
      </div>
      <section class="tm-sec">
        <h3>Notes</h3>
        <textarea class="notes st-notes" placeholder="Détails, liens, quoi apporter…">${esc(s.notes || '')}</textarea>
      </section>
      <div class="st-nav">
        <button type="button" class="btn st-prev" ${i ? '' : 'disabled'}>‹ Étape précédente</button>
        <button type="button" class="btn st-next" ${i < subs.length - 1 ? '' : 'disabled'}>Étape suivante ›</button>
      </div>
      <div class="modal-actions tm-actions">
        <button class="btn danger st-del">🗑 Supprimer l’étape</button>
        <button class="btn st-promote" title="Sortir cette étape de la mission et en faire une mission à part">⬆ En faire une mission</button>
        <button class="btn primary st-ok">‹ Retour à la mission</button>
      </div>`;
    const title = box.querySelector('.st-title');
    const grow = () => { title.style.height = 'auto'; title.style.height = title.scrollHeight + 'px'; };
    grow();
    title.oninput = () => { grow(); const v = title.value.replace(/\n/g, ' ').trim(); if (v) saveT(v); };
    title.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); box.querySelector('.st-notes').focus(); } };
    const notes = box.querySelector('.st-notes');
    notes.oninput = () => saveN(notes.value);
    notes.onblur = () => saveN.flush();
    box.querySelector('.st-cb').onchange = async (e) => { await stepFlush(); await setSubDone(id, sid, e.target.checked); changed(); };
    box.querySelector('.st-date').onchange = (e) => patch((y) => { y.date = e.target.value || null; });
    const back = async () => { await stepFlush(); stepFlush = async () => {}; draw(); };
    box.querySelector('.st-x').onclick = back;
    box.querySelector('.st-back').onclick = back;
    box.querySelector('.st-ok').onclick = back;
    box.querySelector('.st-prev').onclick = async () => { await stepFlush(); editStep(subs[i - 1].id); };
    box.querySelector('.st-next').onclick = async () => { await stepFlush(); editStep(subs[i + 1].id); };
    const del = box.querySelector('.st-del');
    del.onclick = async () => {
      if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Confirmer la suppression'; return; }
      stepFlush = async () => {};
      await editTask(id, (x) => { x.subtasks = (x.subtasks || []).filter((z) => z.id !== sid); });
      await syncGoalProgress(me.goalId);
      changed();
      draw();
    };
    // ⬆ L'étape devient une mission à part (même date, mêmes notes, même objectif et projet) ; « Annuler » la remet
    box.querySelector('.st-promote').onclick = async () => {
      await stepFlush(); stepFlush = async () => {};
      const cur = (await db.get('tasks', id))?.subtasks?.find((z) => z.id === sid) || s;
      const nt = await addTask(cur.title, cur.date || me.date || null, me.goalId || null, me.projectId || null);
      if (cur.notes || cur.done) await editTask(nt.id, (x) => { x.notes = cur.notes || ''; });
      if (cur.done) await setTaskDone(nt.id, true);
      await editTask(id, (x) => { x.subtasks = (x.subtasks || []).filter((z) => z.id !== sid); });
      await syncGoalProgress(me.goalId);
      changed();
      showUndo(`⬆ « ${cur.title} » est maintenant une mission`, async () => {
        await deleteTask(nt.id);
        await editTask(id, (x) => { x.subtasks = [...(x.subtasks || [])]; x.subtasks.splice(i, 0, cur); });
        await syncGoalProgress(me.goalId);
        changed();
      }, 6000);
      draw();
    };
    title.focus();
    title.setSelectionRange(title.value.length, title.value.length);
  };

  // 📅 En événement : crée un événement Google Agenda (titre, date, heure, notes et étapes en description)
  const toEvent = async () => {
    const me = await db.get('tasks', id);
    if (!me) return close();
    const subs = me.subtasks || [];
    const desc = [(me.notes || '').trim(), subs.length ? 'Étapes :\n' + subs.map((s) => `${s.done ? '☑' : '☐'} ${s.title}`).join('\n') : ''].filter(Boolean).join('\n\n');
    const day = me.date || U.iso(new Date());
    // Plage horaire : celle de la mission placée dans le planificateur (heure + durée), sinon l'alarme, sinon 9 h ; 1 h par défaut
    const hm = me.alarmAt ? new Date(me.alarmAt) : null;
    const start = me.time || (hm ? `${String(hm.getHours()).padStart(2, '0')}:${String(hm.getMinutes()).padStart(2, '0')}` : '09:00');
    const endMin = Math.min(toMin(start) + (me.time ? me.dur || 60 : 60), 23 * 60 + 59);
    const end = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
    box.innerHTML = `
      <div class="tm-head"><h2 class="tm-pick-title">📅 Transformer en événement</h2><button class="tm-close" aria-label="Retour">×</button></div>
      <form class="form tm-ev" id="tm-ev">
        <label>Titre<input name="t" value="${esc(me.title)}" required></label>
        <div class="tm-ev-row"><label>Date<input name="d" type="date" value="${day}" required></label>
          <label class="tm-ev-all"><input type="checkbox" name="all"> Toute la journée</label></div>
        <div class="tm-ev-row tm-ev-times"><label>Début<input name="s" type="time" value="${start}"></label><label>Fin<input name="e" type="time" value="${end}"></label></div>
        <label>Description<textarea name="desc" rows="3">${esc(desc)}</textarea></label>
        <label class="tm-ev-keep"><input type="checkbox" name="rm" checked> Retirer la mission ensuite (elle va dans Supprimées)</label>
        <p class="warn-text tm-ev-err" hidden></p>
        <div class="modal-actions"><button type="button" class="btn tm-ev-back">Retour</button><button class="btn primary">📅 Créer l’événement</button></div>
      </form>`;
    const f = box.querySelector('#tm-ev');
    const times = box.querySelector('.tm-ev-times');
    f.all.onchange = () => { times.hidden = f.all.checked; };
    box.querySelector('.tm-ev-back').onclick = () => draw();
    box.querySelector('.tm-close').onclick = () => draw();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const btn = f.querySelector('button.primary');
      btn.disabled = true;
      const err = box.querySelector('.tm-ev-err');
      try {
        const gcal = await import('./gcal.js');
        await gcal.createEvent({ title: f.t.value.trim() || me.title, date: f.d.value, allDay: f.all.checked, start: f.s.value || '09:00', end: f.e.value || '10:00', description: f.desc.value.trim() });
        const remove = f.rm.checked;
        closed = true;
        document.removeEventListener('keydown', onKey);
        if (remove) await deleteTask(id);
        host.innerHTML = '';
        changed();
        showUndo(remove ? `📅 Événement créé · « ${me.title} » retirée des missions` : '📅 Événement créé dans Google Agenda',
          async () => { if (remove) { await restoreTask(id); changed(); } }, remove ? 5000 : 2500);
      } catch (ex) {
        btn.disabled = false;
        err.hidden = false;
        err.textContent = ex.message === 'NOT_CONNECTED' || ex.message === 'NO_CLIENT_ID'
          ? 'Google Agenda n’est pas connecté : connecte-le dans Réglages, puis réessaie.' : 'Impossible de créer l’événement : ' + ex.message;
      }
    };
  };

  // ↳ Devenir une étape : choisir la mission qui la recevra (recherche ; à faire d'abord, par date)
  const pickParent = async () => {
    const me = await db.get('tasks', id);
    if (!me) return close();
    const all = (await db.all('tasks')).filter((x) => x.id !== id)
      .sort((a, b) => a.done - b.done || (a.date || '9999').localeCompare(b.date || '9999') || (a.order ?? 1e15) - (b.order ?? 1e15));
    const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    box.innerHTML = `
      <div class="tm-head"><h2 class="tm-pick-title">↳ « ${esc(me.title)} » devient une étape de…</h2><button class="tm-close" aria-label="Retour">×</button></div>
      <input class="pick-search tm-pick-q" placeholder="🔍 Chercher une mission…" autocomplete="off">
      <div class="pick-list tm-pick-list"></div>
      ${(me.subtasks || []).length || (me.notes || '').trim() || (me.images || []).length ? '<p class="hint muted">Ses étapes, notes et photos vont aussi dans la mission choisie.</p>' : ''}
      <div class="modal-actions"><button class="btn tm-pick-back">Retour</button></div>`;
    const list = box.querySelector('.tm-pick-list');
    const drawList = (q = '') => {
      const rows = all.filter((x) => !q || norm(x.title).includes(norm(q))).slice(0, 60);
      list.innerHTML = rows.map((x) => `<button type="button" class="pick-row tm-pick-row" data-to="${x.id}"><span class="pick-txt"><b>${esc(x.title)}</b>
        <small class="muted">${x.done ? '✓ faite' : x.date ? U.fmtShort(U.parseISO(x.date)) : 'sans date'}${(x.subtasks || []).length ? ` · ${(x.subtasks || []).length} étape${x.subtasks.length > 1 ? 's' : ''}` : ''}</small></span></button>`).join('')
        || '<p class="empty-sm">Aucune autre mission.</p>';
      list.querySelectorAll('[data-to]').forEach((b) => (b.onclick = async () => {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey);
        await makeStep(id, b.dataset.to);
        host.innerHTML = '';
        changed();
        openTaskEditor(b.dataset.to, onChange); // on ouvre la mission qui a reçu l'étape
      }));
    };
    drawList();
    const q = box.querySelector('.tm-pick-q');
    q.oninput = () => drawList(q.value);
    q.focus();
    box.querySelector('.tm-pick-back').onclick = () => draw();
    box.querySelector('.tm-close').onclick = () => draw();
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
  if (opts.step) await editStep(opts.step); else await draw();
}
