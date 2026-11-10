// Second cerveau : notes reliées entre elles par des liens [[Titre]] et des #étiquettes.
// Chaque note, lien, révision ou idée classée rapporte des points de Savoir,
// qui font évoluer l'avatar (voir EVO dans game.js).

import { db } from './db.js';
import * as game from './game.js';
import { uid, iso, esc } from './util.js';
import * as images from './images.js';

export const TYPES = [
  { id: 'idee', icon: '💡', name: 'Idée' },
  { id: 'note', icon: '📝', name: 'Note' },
  { id: 'savoir', icon: '🎓', name: 'Apprentissage' },
  { id: 'ressource', icon: '📚', name: 'Ressource' },
  { id: 'projet', icon: '🚀', name: 'Projet' },
  { id: 'personne', icon: '👤', name: 'Personne' },
  { id: 'citation', icon: '❝', name: 'Citation' },
];
export const typeOf = (id) => TYPES.find((t) => t.id === id) || TYPES[1];

/** Comparaison sans accents ni majuscules. */
export const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const LINK_RE = /\[\[([^[\]\n]{1,80})\]\]/g;
const TAG_RE = /(^|[\s(,;])#(\p{L}[\p{L}\p{N}_-]{1,29})/gu;
const MIN_CHARS = 30; // une note « compte » à partir de 30 caractères

export function parse(body = '') {
  const links = [...new Set([...body.matchAll(LINK_RE)].map((m) => m[1].trim()).filter(Boolean))];
  const tags = [...new Set([...body.matchAll(TAG_RE)].map((m) => m[2].toLowerCase()))];
  return { links, tags };
}

export const allNotes = () => db.all('notes');
export const findByTitle = (notes, title) => notes.find((n) => norm(n.title) === norm(title));

export function backlinks(notes, note) {
  const t = norm(note.title);
  if (!t) return [];
  return notes.filter((n) => n.id !== note.id && (n.links || []).some((l) => norm(l) === t));
}

export function excerpt(body = '', len = 140) {
  const s = body.replace(images.REF_RE, '📷 ').replace(/\[(📎 [^\]\n]*)\]\(file:[a-z0-9]+\)/g, '$1 ').replace(LINK_RE, '$1').replace(/[*>#-]+\s/g, '').replace(/\s+/g, ' ').trim();
  return s.length > len ? s.slice(0, len - 1) + '…' : s;
}

/* ---------- Création / enregistrement ---------- */
export async function createNote({ title = '', body = '', type = 'note', inbox = false } = {}) {
  const now = Date.now();
  const n = { id: uid(), title: title.trim(), body, type, inbox, captured: inbox, pinned: false, createdAt: now, updatedAt: now, reviewedAt: 0, reviews: 0 };
  await saveNote(n);
  if (n.title) await resyncLinksTo(n.title); // les [[liens]] qui attendaient ce titre comptent maintenant
  return n;
}

/** Capture rapide : 1re ligne = titre, le reste = contenu. */
export function capture(text) {
  const lines = text.trim().split('\n');
  let title = lines.shift().trim();
  let body = lines.join('\n').trim();
  if (title.length > 80) { body = (title + '\n' + body).trim(); title = title.slice(0, 60).trim() + '…'; }
  return createNote({ title, body, type: 'idee', inbox: true });
}

export async function saveNote(n, { touch = true } = {}) {
  const { links, tags } = parse(n.body);
  n.links = links;
  n.tags = tags;
  if (touch) n.updatedAt = Date.now();
  await db.put('notes', n);
  await syncNote(n);
  return n;
}

const xpKeys = async (prefix) => (await db.keys('xp')).filter((k) => k.startsWith(prefix));

/** Met les points à jour pour une note (création, liens). Idempotent. */
export async function syncNote(n, notes) {
  notes = notes || (await allNotes());
  const size = ((n.title || '') + (n.body || '')).trim().length;
  if (size >= MIN_CHARS) await game.award('note:' + n.id, game.XP.note, 'Note : ' + (n.title || 'sans titre'));
  else await game.revoke('note:' + n.id, { showPop: false });

  const wanted = new Map();
  for (const l of n.links || []) {
    const t = findByTitle(notes, l);
    if (t && t.id !== n.id) wanted.set(`link:${n.id}:${t.id}`, t);
  }
  for (const [key, t] of wanted) await game.award(key, game.XP.link, `Lien : ${n.title || '…'} → ${t.title}`);
  for (const key of await xpKeys(`link:${n.id}:`)) if (!wanted.has(key)) await game.revoke(key, { showPop: false });

  if (n.captured && !n.inbox) await game.award('triage:' + n.id, game.XP.triage, 'Idée classée : ' + (n.title || '…'));
}

/** Après la création d'une note, les liens qui pointaient déjà vers son titre comptent. */
export async function resyncLinksTo(title) {
  const notes = await allNotes();
  for (const n of notes) if ((n.links || []).some((l) => norm(l) === norm(title))) await syncNote(n, notes);
}

/** Renommer une note met à jour les [[liens]] des autres notes. */
export async function renameRefs(oldTitle, newTitle) {
  if (!oldTitle || !newTitle || norm(oldTitle) === norm(newTitle)) return 0;
  const notes = await allNotes();
  const re = new RegExp('\\[\\[\\s*' + oldTitle.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\]\\]', 'gi');
  let count = 0;
  for (const n of notes) {
    if (!re.test(n.body || '')) continue;
    re.lastIndex = 0;
    n.body = n.body.replace(re, `[[${newTitle.trim()}]]`);
    await saveNote(n, { touch: false });
    count++;
  }
  return count;
}

/* ---------- Projets : une note de type « projet » regroupe des objectifs (et donc leurs missions) ---------- */
export const projectsOf = (notes, { withArchived = false } = {}) => notes.filter((x) => x.type === 'projet' && (withArchived || !x.archived));

/* ---------- Archives : la note garde son type, mais n'apparaît plus que dans l'archive ---------- */
export async function setArchived(id, archived) {
  const n = await db.get('notes', id);
  if (!n) return;
  n.archived = archived;
  n.archivedAt = archived ? Date.now() : null;
  await db.put('notes', n);
  return n;
}

/** Avancement d'un projet : moyenne de ses objectifs, plus le total de missions. */
export function projectStats(projectId, goals, tasks) {
  const gs = goals.filter((g) => g.projectId === projectId);
  const ms = tasks.filter((t) => t.goalId && gs.some((g) => g.id === t.goalId));
  return {
    goals: gs,
    pct: gs.length ? Math.round(gs.reduce((s, g) => s + (g.progress || 0), 0) / gs.length) : 0,
    missions: ms.length,
    done: ms.filter((t) => t.done).length,
  };
}

export async function setGoalProject(goalId, projectId) {
  const g = await db.get('goals', goalId);
  if (!g) return;
  g.projectId = projectId || null;
  await db.put('goals', g);
}

export async function deleteNote(id) {
  const old = await db.get('notes', id);
  await db.del('notes', id);
  await images.removeUnused(images.refsIn(old?.body)); // ses images, si aucune autre note ne les utilise
  const docRefs = [...(old?.body || '').matchAll(/\]\(file:([a-z0-9]+)\)/g)].map((m) => m[1]);
  if (docRefs.length) await (await import('./docs.js')).removeUnused(docRefs); // et ses documents joints
  for (const g of await db.all('goals')) if (g.projectId === id) { g.projectId = null; await db.put('goals', g); }
  const keys = (await db.keys('xp')).filter((k) => k === 'note:' + id || k === 'triage:' + id || k.startsWith(`link:${id}:`) || (k.startsWith('link:') && k.endsWith(':' + id)));
  for (const k of keys) await game.revoke(k, { showPop: false });
}

/* ---------- Révision (Redécouvrir) ---------- */
const DAY = 86400000;
export const reviewedToday = (n) => n.reviewedAt && iso(new Date(n.reviewedAt)) === iso(new Date());

export function rediscover(notes, skip = []) {
  const now = Date.now();
  const pool = notes
    .filter((n) => !n.inbox && !n.archived && !skip.includes(n.id) && !reviewedToday(n) && now - Math.max(n.reviewedAt || 0, n.createdAt) > 2 * DAY)
    .sort((a, b) => Math.max(a.reviewedAt || 0, a.updatedAt) - Math.max(b.reviewedAt || 0, b.updatedAt))
    .slice(0, 6);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

export async function review(n) {
  n.reviewedAt = Date.now();
  n.reviews = (n.reviews || 0) + 1;
  await db.put('notes', n);
  await game.award(`review:${n.id}:${iso(new Date())}`, game.XP.review, 'Révision : ' + (n.title || '…'));
}

/* ---------- Affichage ---------- */
function inline(s, notes) {
  return s
    .replace(/\[\[([^[\]\n]{1,80})\]\]/g, (_, t) => {
      const target = findByTitle(notes, t.trim());
      return `<a class="wl ${target ? '' : 'missing'}" data-link="${t.trim()}" href="${target ? '#/note/' + target.id : '#'}">${t.trim()}</a>`;
    })
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(,;])#(\p{L}[\p{L}\p{N}_-]{1,29})/gu, '$1<span class="tag" data-tag="$2">#$2</span>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

/** Rendu lisible d'une note : titres, listes, citations, liens cliquables. */
export function renderBody(body, notes) {
  const out = [];
  let list = false;
  for (const raw of esc(body || '').split('\n')) {
    const line = raw.trimEnd();
    const li = line.match(/^\s*[-*]\s+(.*)/);
    if (li) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(li[1], notes)}</li>`); continue; }
    if (list) { out.push('</ul>'); list = false; }
    if (!line.trim()) continue;
    const im = line.trim().match(/^!\[([^\]]*)\]\(img:([a-z0-9]+)\)$/);
    if (im) { out.push(`<figure class="n-img"><img data-img="${im[2]}" alt="${im[1]}" loading="lazy"></figure>`); continue; }
    const doc = line.trim().match(/^\[📎 ([^\]]*)\]\(file:([a-z0-9]+)\)$/);
    if (doc) { out.push(`<p class="n-doc"><button type="button" class="doc-open" data-doc-open="${doc[2]}" title="Ouvrir"><span class="doc-ico">📎</span><span class="doc-name">${doc[1]}</span></button></p>`); continue; }
    const h = line.match(/^#{1,3}\s+(.*)/);
    if (h) out.push(`<h3>${inline(h[1], notes)}</h3>`);
    else if (line.startsWith('&gt; ')) out.push(`<blockquote>${inline(line.slice(5), notes)}</blockquote>`);
    else out.push(`<p>${inline(line, notes)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('') || '<p class="muted">Cette note est vide.</p>';
}
