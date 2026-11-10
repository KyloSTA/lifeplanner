// Associer un élément du Cerveau (idée, capture, ressource…) à un projet, un module du cours RBQ,
// un objectif ou une mission.
// - Projets, objectifs, missions : rangés dans la note (note.rel = { projects, goals, tasks }).
// - Modules RBQ : dans le module (module.noteIds), comme la cellule « 🧠 Du Cerveau ».

import { db } from './db.js';
import * as brain from './brain.js';
import { esc } from './util.js';

export const KINDS = [
  ['projects', '🚀 Projet'],
  ['rbq', '📘 Cours RBQ'],
  ['goals', '🎯 Objectif'],
  ['tasks', '📋 Mission'],
];

/** Tout ce à quoi la note est associée : [{ kind, id, label, href }]. */
export async function linksOf(note) {
  const rel = note.rel || {};
  const [notes, study, goals, tasks] = await Promise.all([brain.allNotes(), db.all('study'), db.all('goals'), db.all('tasks')]);
  const out = [];
  for (const id of rel.projects || []) { const p = notes.find((x) => x.id === id); if (p) out.push({ kind: 'projects', id, label: `🚀 ${p.title || 'Projet'}`, href: `#/note/${id}` }); }
  for (const m of study.filter((x) => x.kind === 'module' && (x.noteIds || []).includes(note.id))) out.push({ kind: 'rbq', id: m.id, label: `📘 ${m.title}`, href: `#/rbq/${m.id}` });
  for (const id of rel.goals || []) { const g = goals.find((x) => x.id === id); if (g) out.push({ kind: 'goals', id, label: `🎯 ${g.title}`, href: '#/goals' }); }
  for (const id of rel.tasks || []) { const t = tasks.find((x) => x.id === id); if (t) out.push({ kind: 'tasks', id, label: `${t.done ? '✅' : '📋'} ${t.title}`, href: '#/missions', task: id }); }
  return out;
}

/** Ajoute ou retire une association. note : l'objet note en mémoire (il est enregistré). */
export async function toggle(note, kind, targetId, on) {
  if (kind === 'rbq') {
    const m = await db.get('study', targetId);
    if (!m) return;
    const ids = new Set(m.noteIds || []);
    on ? ids.add(note.id) : ids.delete(note.id);
    m.noteIds = [...ids];
    await db.put('study', m);
    return;
  }
  note.rel ||= {};
  const ids = new Set(note.rel[kind] || []);
  on ? ids.add(targetId) : ids.delete(targetId);
  note.rel[kind] = [...ids];
  await brain.saveNote(note, { touch: false });
}

/** Notes associées à un projet, un objectif ou une mission. */
export async function notesFor(kind, targetId) {
  return (await brain.allNotes()).filter((n) => !n.archived && (n.rel?.[kind] || []).includes(targetId));
}

/** Pastilles de notes (pour un objectif, une mission, un projet). */
export function noteChips(list) {
  return list.map((n) => `<a class="assoc-chip" href="#/note/${n.id}">${brain.typeOf(n.type).icon} ${esc(n.title || 'Sans titre')}</a>`).join('');
}

/** Fenêtre « Associer à… » (onglets Projet / Cours RBQ / Objectif / Mission). */
export async function picker(modal, note, onChange) {
  let tab = 'projects', q = '';
  modal(`<h2>Associer « ${esc(note.title || 'Sans titre')} » à…</h2>
    <div class="seg assoc-tabs" role="tablist">${KINDS.map(([k, l]) => `<button role="tab" data-k="${k}">${l}</button>`).join('')}</div>
    <input class="pick-search" placeholder="🔍 Chercher…" autocomplete="off">
    <div class="pick-list" id="as-list"></div>
    <div class="modal-actions"><button class="btn primary" data-close>Terminé</button></div>`, (m) => {
    m.classList.add('pick-modal');
    const draw = async () => {
      m.querySelectorAll('[data-k]').forEach((b) => b.classList.toggle('on', b.dataset.k === tab));
      const nq = brain.norm(q);
      const [notes, study, goals, tasks] = await Promise.all([brain.allNotes(), db.all('study'), db.all('goals'), db.all('tasks')]);
      let rows = [];
      if (tab === 'projects') rows = notes.filter((x) => x.type === 'projet' && !x.archived && x.id !== note.id).map((p) => ({ id: p.id, label: p.title || 'Projet sans titre', sub: '', on: (note.rel?.projects || []).includes(p.id) }));
      if (tab === 'rbq') rows = study.filter((x) => x.kind === 'module').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((x) => ({ id: x.id, label: x.title, sub: '', on: (x.noteIds || []).includes(note.id) }));
      if (tab === 'goals') rows = goals.map((g) => ({ id: g.id, label: g.title, sub: `${g.progress || 0} %`, on: (note.rel?.goals || []).includes(g.id) }));
      if (tab === 'tasks') rows = tasks.filter((t) => !t.done || (note.rel?.tasks || []).includes(t.id)).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))
        .map((t) => ({ id: t.id, label: t.title, sub: t.date || 'sans date', on: (note.rel?.tasks || []).includes(t.id) }));
      rows = rows.filter((r) => !nq || brain.norm(r.label).includes(nq)).sort((a, b) => b.on - a.on);
      const list = m.querySelector('#as-list');
      list.innerHTML = rows.map((r) => `<label class="pick-row ${r.on ? 'on' : ''}"><input type="checkbox" value="${r.id}" ${r.on ? 'checked' : ''}>
          <span class="pick-txt"><b>${esc(r.label)}</b>${r.sub ? `<small class="muted">${esc(r.sub)}</small>` : ''}</span></label>`).join('')
        || `<p class="empty-sm">${tab === 'projects' ? 'Aucun projet : crée une note de type 🚀 Projet dans le Cerveau.' : 'Rien à afficher.'}</p>`;
      list.querySelectorAll('input').forEach((cb) => (cb.onchange = async () => {
        await toggle(note, tab, cb.value, cb.checked);
        cb.closest('.pick-row').classList.toggle('on', cb.checked);
        onChange();
      }));
    };
    m.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { tab = b.dataset.k; draw(); }));
    m.querySelector('.pick-search').oninput = (e) => { q = e.target.value; draw(); };
    draw();
  });
}
