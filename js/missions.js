// Page « Missions » : toutes les missions au même endroit, avec filtres, recherche,
// regroupement par date ou par objectif, ajout rapide et nettoyage des missions terminées.

import { db } from './db.js';
import * as U from './util.js';
import { taskHTML, bindTaskList, addTask, loadGoals, deleteTask } from './tasks.js';

const { esc, iso } = U;
const FILTERS = [
  ['todo', 'À faire'],
  ['late', 'En retard'],
  ['today', 'Aujourd’hui'],
  ['soon', 'À venir'],
  ['nodate', 'Sans date'],
  ['done', 'Terminées'],
  ['all', 'Toutes'],
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
  };
  const doneWeek = all.filter((t) => t.done && (t.doneAt || t.updatedAt || t.createdAt || 0) >= weekAgo).length;

  const redraw = () => renderPage(ctx);
  const q = U.esc(state.q);
  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Gestion</p><h1>Missions</h1></div>
      <div class="head-actions"><a class="btn" href="#/goals">🎯 Objectifs</a></div>
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
      <select name="g" aria-label="Objectif"><option value="">Sans objectif</option>${goals.map((g) => `<option value="${g.id}">🎯 ${esc(g.title)}</option>`).join('')}</select>
      <button class="btn primary">Ajouter</button>
    </form>
    <div class="ms-tools">
      <div class="filters">${FILTERS.map(([v, l]) => `<button class="chip-btn ${state.f === v ? 'on' : ''}" data-f="${v}">${l} <small>${counts[v]}</small></button>`).join('')}</div>
      <div class="ms-right">
        <input type="search" id="ms-q" placeholder="🔍 Rechercher…" value="${q}" autocomplete="off">
        <select id="ms-by" aria-label="Regrouper par"><option value="date" ${state.by === 'date' ? 'selected' : ''}>Par date</option><option value="goal" ${state.by === 'goal' ? 'selected' : ''}>Par objectif</option></select>
      </div>
    </div>
    <div id="ms-list"></div>`;

  const drawList = () => {
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
    if (nq) list = list.filter((t) => `${t.title} ${t.notes || ''} ${(t.subtasks || []).map((s) => s.title).join(' ')}`.toLowerCase().includes(nq));
    const sortM = (a, b) => a.done - b.done || (a.date || '9999').localeCompare(b.date || '9999') || a.createdAt - b.createdAt;
    list.sort(state.f === 'done' ? (a, b) => (b.doneAt || b.createdAt) - (a.doneAt || a.createdAt) : sortM);

    const groups = new Map();
    if (state.f === 'done') groups.set('done', { label: 'Terminées', items: list });
    else if (state.by === 'goal') {
      for (const g of goals) groups.set(g.id, { label: `🎯 ${g.title}`, items: [] });
      groups.set('', { label: 'Sans objectif', items: [] });
      for (const t of list) (groups.get(t.goalId || '') || groups.get('')).items.push(t);
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
        <div class="card-head"><h2>${esc(g.label)}</h2><span class="muted">${g.items.length}</span></div>
        <ul class="tasks">${g.items.map((t) => taskHTML(t, today, { showDate: true, hideGoal: state.by === 'goal' })).join('')}</ul>
      </section>`).join('')
      + (state.f === 'done' && cleanable.length ? `<p class="ms-clean"><button class="btn danger" id="ms-clean">🧹 Supprimer ${cleanable.length} mission${cleanable.length > 1 ? 's' : ''} terminée${cleanable.length > 1 ? 's' : ''} sans objectif</button></p>` : '')
      : `<div class="card empty-card"><p>${nq ? 'Aucune mission ne correspond à ta recherche.' : state.f === 'late' ? '🎉 Aucune mission en retard.' : state.f === 'done' ? 'Aucune mission terminée pour l’instant.' : 'Rien ici. Ajoute une mission ci-dessus.'}</p></div>`;
    bindTaskList(el, redraw);
    el.querySelector('#ms-clean')?.addEventListener('click', async () => {
      if (!(await confirmBox(`Supprimer définitivement ${cleanable.length} mission(s) terminée(s) sans objectif ? Les XP déjà gagnés restent. Les missions liées à un objectif sont gardées pour sa progression.`))) return;
      for (const t of cleanable) await deleteTask(t.id);
      toast('🧹 Missions terminées supprimées');
      redraw();
    });
  };
  drawList();

  view.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { state.f = b.dataset.f; redraw(); }));
  view.querySelector('#ms-q').oninput = U.debounce((e) => { state.q = e.target.value; drawList(); }, 150);
  view.querySelector('#ms-by').onchange = (e) => { state.by = e.target.value; drawList(); };
  view.querySelector('#ms-add').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, v = f.t.value.trim();
    if (!v) return;
    await addTask(v, f.d.value || null, f.g.value || null);
    toast('✅ Mission ajoutée');
    if (state.f === 'done') state.f = 'todo';
    await redraw();
    view.querySelector('#ms-add input[name=t]')?.focus();
  };
}
