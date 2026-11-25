// Page « Missions » : toutes les missions au même endroit, avec filtres, recherche,
// regroupement par date, par objectif ou par projet, ajout rapide et nettoyage des missions terminées.

import { db } from './db.js';
import * as U from './util.js';
import { taskHTML, prioRank, bindTaskList, addTask, loadGoals, deleteTask, trashList, restoreTask, purgeTasks } from './tasks.js';
import * as couple from './couple.js';
import * as brain from './brain.js';

const { esc, iso } = U;
const FILTERS = [
  ['todo', 'À faire'],
  ['late', 'En retard'],
  ['today', 'Aujourd’hui'],
  ['soon', 'À venir'],
  ['nodate', 'Sans date'],
  ['done', 'Terminées'],
  ['all', 'Toutes'],
  ['trash', '🗑 Supprimées'],
];
const state = { f: 'todo', q: '', by: 'date' }; // gardé pendant la session

function bucket(t, today, tomorrow, weekEnd) {
  if (!t.date) return ['nodate', 'Sans date'];
  if (t.date < today) return ['late', 'En retard'];
  if (t.date === today) return ['today', 'Aujourd’hui'];
  if (t.date === tomorrow) return ['tomorrow', 'Demain'];
  if (t.date <= weekEnd) return ['week', 'Cette semaine'];
  return ['later', 'Plus tard'];
}
const ORDER = ['late', 'today', 'tomorrow', 'week', 'later', 'nodate'];

export async function renderPage(ctx) {
  const { view, toast, confirmBox } = ctx;
  const goals = await loadGoals();
  const all = await db.all('tasks');
  const projects = brain.projectsOf(await brain.allNotes()).sort((a, b) => (b.pinned - a.pinned) || (a.title || '').localeCompare(b.title || ''));
  const now = new Date();
  const today = iso(now), tomorrow = iso(U.addDays(now, 1));
  const weekEnd = iso(U.addDays(U.startOfWeek(now), 6));
  const open = all.filter((t) => !t.done);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const counts = {
    todo: open.length,
    late: open.filter((t) => t.date && t.date < today).length,
    today: open.filter((t) => t.date === today).length,
    soon: open.filter((t) => t.date && t.date > today).length,
    nodate: open.filter((t) => !t.date).length,
    done: all.filter((t) => t.done).length,
    all: all.length,
    trash: (await trashList()).length,
  };
  const doneWeek = all.filter((t) => t.done && (t.doneAt || t.updatedAt || t.createdAt || 0) >= weekAgo).length;

  const redraw = () => renderPage(ctx);
  const q = U.esc(state.q);
  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Gestion</p><h1>Missions</h1></div>
    </header>
    <div class="kpis">
      <button class="kpi ${state.f === 'todo' ? 'on' : ''}" data-f="todo"><b>${counts.todo}</b><span>à faire</span></button>
      <button class="kpi ${state.f === 'today' ? 'on' : ''}" data-f="today"><b>${counts.today}</b><span>aujourd’hui</span></button>
      <button class="kpi ${counts.late ? 'warn' : ''} ${state.f === 'late' ? 'on' : ''}" data-f="late"><b>${counts.late}</b><span>en retard</span></button>
      <button class="kpi ok ${state.f === 'done' ? 'on' : ''}" data-f="done"><b>${doneWeek}</b><span>terminées en 7 jours</span></button>
    </div>
    <form class="card ms-add" id="ms-add">
      <input name="t" placeholder="Nouvelle mission…" autocomplete="off" required>
      <input name="d" type="date" value="${today}" aria-label="Date prévue" title="Date prévue (vide = sans date)">
      ${couple.ON ? `<select name="w" aria-label="Pour qui">${couple.whoOptions('')}</select>` : ''}
      <select name="g" aria-label="Objectif"><option value="">Sans objectif</option>${goals.filter((g) => !g.done).map((g) => `<option value="${g.id}">🎯 ${esc(g.title)}</option>`).join('')}</select>
      <button class="btn primary">Ajouter</button>
    </form>
    <div class="ms-tools">
      <div class="filters">${FILTERS.map(([v, l]) => `<button class="chip-btn ${state.f === v ? 'on' : ''}" data-f="${v}">${l} <small>${counts[v]}</small></button>`).join('')}</div>
      <div class="ms-right">
        <input type="search" id="ms-q" placeholder="🔍 Rechercher…" value="${q}" autocomplete="off">
        ${couple.ON ? `<select id="ms-who" aria-label="Missions de qui"><option value="">👫 Tout le monde</option><option value="me" ${state.who === 'me' ? 'selected' : ''}>🙋 Mes missions</option>${['a', 'b'].map((k) => `<option value="${k}" ${state.who === k ? 'selected' : ''}>👤 ${esc(couple.nameOf(k))}</option>`).join('')}<option value="both" ${state.who === 'both' ? 'selected' : ''}>👫 Communes</option></select>` : ''}
        <select id="ms-by" aria-label="Regrouper par"><option value="date" ${state.by === 'date' ? 'selected' : ''}>Par date</option><option value="goal" ${state.by === 'goal' ? 'selected' : ''}>Par objectif</option><option value="project" ${state.by === 'project' ? 'selected' : ''}>Par projet</option></select>
      </div>
    </div>
    <div id="ms-list"></div>`;

  // Onglet « Supprimées » : restaurer une mission, ou la supprimer définitivement
  const drawTrash = async () => {
    const el = view.querySelector('#ms-list');
    const nq = state.q.trim().toLowerCase();
    const list = (await trashList()).filter((t) => !nq || `${t.title} ${t.notes || ''}`.toLowerCase().includes(nq));
    const gTitle = (id) => goals.find((g) => g.id === id)?.title;
    el.innerHTML = list.length ? `<section class="card ms-group ms-trash">
        <div class="card-head"><h2>🗑 Supprimées</h2><button class="btn danger sm-text" id="tr-empty" type="button">Vider (${list.length})</button></div>
        <p class="muted tr-hint">Une mission supprimée reste ici jusqu’à ce que tu la supprimes définitivement.</p>
        <ul class="tr-list">${list.map((t) => `<li class="tr-item" data-id="${t.id}">
          <div class="tr-main"><span class="tr-title">${esc(t.title)}</span>
            <small class="muted">Supprimée ${esc(U.fmtShort(new Date(t.deletedAt || Date.now())))}${t.date ? ` · prévue ${esc(U.fmtShort(U.parseISO(t.date)))}` : ''}${t.done ? ' · terminée' : ''}${gTitle(t.goalId) ? ` · 🎯 ${esc(gTitle(t.goalId))}` : ''}</small></div>
          <button class="btn sm-text tr-restore" type="button">↺ Restaurer</button>
          <button class="btn danger sm-text tr-purge" type="button" title="Supprimer définitivement">Supprimer définitivement</button>
        </li>`).join('')}</ul></section>`
      : `<div class="card empty-card"><p>${nq ? 'Aucune mission supprimée ne correspond à ta recherche.' : 'Aucune mission supprimée.'}</p></div>`;
    el.querySelectorAll('.tr-restore').forEach((b) => (b.onclick = async () => {
      const t = await restoreTask(b.closest('.tr-item').dataset.id);
      toast(`↺ « ${t?.title || 'Mission'} » restaurée`);
      redraw();
    }));
    el.querySelectorAll('.tr-purge').forEach((b) => (b.onclick = async () => {
      const li = b.closest('.tr-item');
      if (!(await confirmBox(`Supprimer définitivement « ${li.querySelector('.tr-title').textContent} » ? Cette action ne peut pas être annulée.`))) return;
      await purgeTasks([li.dataset.id]);
      toast('Mission supprimée définitivement');
      redraw();
    }));
    el.querySelector('#tr-empty')?.addEventListener('click', async () => {
      if (!(await confirmBox(`Supprimer définitivement les ${list.length} mission(s) de Supprimées ? Cette action ne peut pas être annulée.`))) return;
      await purgeTasks(list.map((t) => t.id));
      toast('🗑 Supprimées vidé');
      redraw();
    });
  };

  const drawList = () => {
    if (state.f === 'trash') return drawTrash();
    const nq = state.q.trim().toLowerCase();
    let list = all.filter((t) => {
      switch (state.f) {
        case 'todo': return !t.done;
        case 'late': return !t.done && t.date && t.date < today;
        case 'today': return !t.done && t.date === today;
        case 'soon': return !t.done && t.date && t.date > today;
        case 'nodate': return !t.done && !t.date;
        case 'done': return t.done;
        default: return true;
      }
    });
    // App couple : missions de qui
    if (couple.ON && state.who) list = list.filter((t) => (state.who === 'me' ? couple.isMine(t) : state.who === 'both' ? !t.who : t.who === state.who));
    if (nq) list = list.filter((t) => `${t.title} ${t.notes || ''} ${(t.subtasks || []).map((s) => s.title).join(' ')}`.toLowerCase().includes(nq));
    const sortM = (a, b) => a.done - b.done || prioRank(b) - prioRank(a) || (a.date || '9999').localeCompare(b.date || '9999') || (a.order ?? 1e15) - (b.order ?? 1e15) || a.createdAt - b.createdAt;
    list.sort(state.f === 'done' ? (a, b) => (b.doneAt || b.createdAt) - (a.doneAt || a.createdAt) : sortM);

    const groups = new Map();
    if (state.f === 'done') groups.set('done', { label: 'Terminées', items: list });
    else if (state.by === 'goal') {
      for (const g of goals) groups.set(g.id, { label: `🎯 ${g.title}`, items: [] });
      groups.set('', { label: 'Sans objectif', items: [] });
      for (const t of list) (groups.get(t.goalId || '') || groups.get('')).items.push(t);
    } else if (state.by === 'project') {
      // Projet d'une mission : rattachée directement, ou par son objectif
      const projOf = (t) => t.projectId || goals.find((g) => g.id === t.goalId)?.projectId || '';
      for (const p of projects) groups.set(p.id, { label: `🚀 ${p.title || 'Projet sans titre'}`, href: `#/note/${p.id}`, items: [] });
      groups.set('', { label: 'Sans projet', items: [] });
      for (const t of list) (groups.get(projOf(t)) || groups.get('')).items.push(t);
    } else {
      for (const k of ORDER) groups.set(k, { label: '', items: [] });
      for (const t of list) {
        const [k, label] = t.done ? ['done', 'Terminées'] : bucket(t, today, tomorrow, weekEnd);
        if (!groups.has(k)) groups.set(k, { label, items: [] });
        const gr = groups.get(k);
        gr.label = label;
        gr.items.push(t);
      }
    }
    const el = view.querySelector('#ms-list');
    // Les missions d'un objectif restent : elles comptent dans sa progression
    const cleanable = list.filter((t) => t.done && !t.goalId);
    const filled = [...groups.entries()].filter(([, g]) => g.items.length);
    el.innerHTML = filled.length ? filled.map(([k, g]) => `<section class="card ms-group ${k === 'late' ? 'is-late' : ''}">
        <div class="card-head"><h2>${g.href ? `<a href="${g.href}" class="ms-proj-link" title="Ouvrir le projet">${esc(g.label)}</a>` : esc(g.label)}</h2><span class="muted">${g.items.length}</span></div>
        <ul class="tasks">${g.items.map((t) => taskHTML(t, today, { showDate: true, hideGoal: state.by === 'goal', hideProject: state.by === 'project' })).join('')}</ul>
      </section>`).join('')
      + (state.f === 'done' && cleanable.length ? `<p class="ms-clean"><button class="btn danger" id="ms-clean">🧹 Supprimer ${cleanable.length} mission${cleanable.length > 1 ? 's' : ''} terminée${cleanable.length > 1 ? 's' : ''} sans objectif</button></p>` : '')
      : `<div class="card empty-card"><p>${nq ? 'Aucune mission ne correspond à ta recherche.' : state.f === 'late' ? '🎉 Aucune mission en retard.' : state.f === 'done' ? 'Aucune mission terminée pour l’instant.' : 'Rien ici. Ajoute une mission ci-dessus.'}</p></div>`;
    bindTaskList(el, redraw);
    el.querySelector('#ms-clean')?.addEventListener('click', async () => {
      if (!(await confirmBox(`Déplacer ${cleanable.length} mission(s) terminée(s) sans objectif dans Supprimées ? Les XP déjà gagnés restent. Les missions liées à un objectif sont gardées pour sa progression.`))) return;
      for (const t of cleanable) await deleteTask(t.id);
      toast('🧹 Missions terminées déplacées dans Supprimées');
      redraw();
    });
  };
  drawList();

  view.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { state.f = b.dataset.f; redraw(); }));
  view.querySelector('#ms-q').oninput = U.debounce((e) => { state.q = e.target.value; drawList(); }, 150);
  view.querySelector('#ms-by').onchange = (e) => { state.by = e.target.value; drawList(); };
  view.querySelector('#ms-who')?.addEventListener('change', (e) => { state.who = e.target.value; drawList(); });
  view.querySelector('#ms-add').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, v = f.t.value.trim();
    if (!v) return;
    const nt = await addTask(v, f.d.value || null, f.g.value || null);
    if (f.w?.value) { nt.who = f.w.value; await db.put('tasks', nt); }
    toast('✅ Mission ajoutée');
    if (state.f === 'done') state.f = 'todo';
    await redraw();
    view.querySelector('#ms-add input[name=t]')?.focus();
  };
}
