// Gamification : points d'expérience (XP), niveaux, séries de jours et badges.
// Chaque gain est une ligne du registre « xp » avec une clé unique (ex. "task:<id>") :
// impossible de gagner deux fois pour la même chose, et décocher une mission retire ses points.

import { db } from './db.js';
import { iso, addDays, parseISO } from './util.js';

export const XP = { task: 10, sub: 3, journal: 15, mood: 5, ink: 10, goal: 10, goalDone: 50, note: 5, link: 2, review: 3, triage: 2, pomo: 5, habit: 3, study: 1, workout: 25 };

/* ---------- Évolution de l'avatar (second cerveau) ---------- */
// Les points gagnés dans le Cerveau forment ton « Savoir », qui fait évoluer l'avatar.
const BRAIN_KEYS = ['note:', 'link:', 'review:', 'triage:'];
export const isBrain = (key) => BRAIN_KEYS.some((p) => key.startsWith(p));
export const EVO = [
  { k: 0, icon: '🌑', name: 'Esprit en éveil', desc: 'Ton second cerveau attend ses premières idées.' },
  { k: 20, icon: '✨', name: 'Étincelle', desc: 'Des étincelles d’idées flottent autour de toi.' },
  { k: 60, icon: '🦉', name: 'Compagnon hibou', desc: 'Un petit hibou du savoir se pose sur ton épaule.' },
  { k: 150, icon: '🔮', name: 'Érudit·e', desc: 'Une aura de savoir t’entoure et ton hibou grandit.' },
  { k: 300, icon: '📜', name: 'Sage', desc: 'Un anneau de runes tourne autour de toi ; ton hibou porte des lunettes.' },
  { k: 600, icon: '🌟', name: 'Archisage', desc: 'Ton troisième œil s’ouvre, ton aura devient cosmique et ton hibou, doré.' },
];
export function evoInfo(kxp) {
  let stage = 0;
  while (EVO[stage + 1] && kxp >= EVO[stage + 1].k) stage++;
  const next = EVO[stage + 1];
  const a = EVO[stage].k;
  return { kxp, evo: stage, evoName: EVO[stage].name, nextEvo: next || null, evoPct: next ? Math.round(((kxp - a) / (next.k - a)) * 100) : 100 };
}

export const RULES = [
  ['✅', 'Accomplir une mission', XP.task],
  ['🔹', 'Terminer une étape (sous-mission)', XP.sub],
  ['📖', 'Écrire dans le journal (une fois par jour)', XP.journal],
  ['🙂', 'Noter ton humeur (une fois par jour)', XP.mood],
  ['✒️', 'Remplir une page manuscrite (5 traits ou plus)', XP.ink],
  ['🎯', 'Chaque palier de 25 % sur un objectif', XP.goal],
  ['🏁', 'Atteindre un objectif à 100 %', XP.goalDone],
  ['💡', 'Créer une note dans le Cerveau (30 caractères ou plus)', XP.note],
  ['🔗', 'Relier deux notes avec [[…]]', XP.link],
  ['🔁', 'Revoir une ancienne note (Redécouvrir)', XP.review],
  ['🗂️', 'Classer une idée capturée', XP.triage],
  ['🍅', 'Terminer une session de focus (minuteur d’une mission)', XP.pomo],
  ['🔁', 'Compléter une habitude du jour', XP.habit],
  ['📘', 'Réviser une carte du cours RBQ (par carte, par jour)', XP.study],
  ['💪', 'Terminer un entraînement', XP.workout],
  ['🔥', 'Bonus de série : 2 XP par jour consécutif (max. 20)', '2–20'],
];

/* ---------- Niveaux ---------- */
// Niveau L atteint à 50·L·(L−1) XP : 0, 100, 300, 600, 1000, 1500…
export const levelStart = (L) => 50 * L * (L - 1);
const TITLES = [[1, 'Apprenti·e'], [3, 'Explorateur·rice'], [5, 'Artisan·e du quotidien'], [7, 'Stratège'], [10, 'Maître du temps'], [15, 'Légende']];
export const titleFor = (L) => TITLES.filter(([l]) => L >= l).pop()[1];

export function levelInfo(xp) {
  let level = 1;
  while (levelStart(level + 1) <= xp) level++;
  const a = levelStart(level), b = levelStart(level + 1);
  return { xp, level, into: xp - a, need: b - a, pct: Math.round(((xp - a) / (b - a)) * 100), title: titleFor(level) };
}

/* ---------- Badges ---------- */
export const BADGES = [
  { id: 'first', icon: '🌱', name: 'Premier pas', desc: 'Accomplir ta première mission', test: (s) => s.tasks >= 1 },
  { id: 't10', icon: '✅', name: 'Efficace', desc: '10 missions accomplies', test: (s) => s.tasks >= 10 },
  { id: 't50', icon: '🏅', name: 'Machine', desc: '50 missions accomplies', test: (s) => s.tasks >= 50 },
  { id: 't200', icon: '🏆', name: 'Inarrêtable', desc: '200 missions accomplies', test: (s) => s.tasks >= 200 },
  { id: 'micro', icon: '🔬', name: 'Micro-planificateur·rice', desc: '25 étapes terminées', test: (s) => s.subs >= 25 },
  { id: 'j7', icon: '📖', name: 'Plume régulière', desc: '7 entrées de journal', test: (s) => s.journal >= 7 },
  { id: 'ink5', icon: '✒️', name: 'Artiste du stylet', desc: '5 pages manuscrites', test: (s) => s.ink >= 5 },
  { id: 'goal', icon: '🎯', name: 'Dans le mille', desc: 'Atteindre un objectif à 100 %', test: (s) => s.goals >= 1 },
  { id: 's3', icon: '🔥', name: 'En feu', desc: 'Série de 3 jours', test: (s) => s.best >= 3 },
  { id: 's7', icon: '☄️', name: 'Semaine parfaite', desc: 'Série de 7 jours', test: (s) => s.best >= 7 },
  { id: 's30', icon: '🌋', name: 'Volcan', desc: 'Série de 30 jours', test: (s) => s.best >= 30 },
  { id: 'l5', icon: '⭐', name: 'Étoile montante', desc: 'Atteindre le niveau 5', test: (s) => s.level >= 5 },
  { id: 'l10', icon: '👑', name: 'Royauté', desc: 'Atteindre le niveau 10', test: (s) => s.level >= 10 },
  { id: 'n1', icon: '💡', name: 'Première idée', desc: 'Créer ta première note', test: (s) => s.notes >= 1 },
  { id: 'n25', icon: '🗂️', name: 'Archiviste', desc: '25 notes dans ton Cerveau', test: (s) => s.notes >= 25 },
  { id: 'n100', icon: '🏛️', name: 'Bibliothèque vivante', desc: '100 notes dans ton Cerveau', test: (s) => s.notes >= 100 },
  { id: 'lk10', icon: '🕸️', name: 'Tisseur·se de liens', desc: '10 liens entre tes notes', test: (s) => s.links >= 10 },
  { id: 'rv10', icon: '🔁', name: 'Mémoire vive', desc: 'Revoir 10 notes', test: (s) => s.reviews >= 10 },
  { id: 'owl', icon: '🦉', name: 'Ami des hiboux', desc: 'Obtenir ton compagnon hibou', test: (s) => s.evo >= 2 },
  { id: 'sage', icon: '📜', name: 'Sagesse', desc: 'Atteindre le stade Sage', test: (s) => s.evo >= 4 },
];

/* ---------- Interface (branchée par l'app ou le widget) ---------- */
let ui = { pop() {}, levelUp() {}, badge() {}, changed() {}, evolve() {} };
export const setUI = (u) => { ui = { ...ui, ...u }; };
export const pop = (amount, reason) => ui.pop(amount, reason);

// Les gains sont traités un par un (évite les doubles calculs de niveau).
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));

const isActivity = (e) => !e.key.startsWith('streak:');

function streakFrom(days, end) {
  let n = 0;
  let d = new Date(end);
  while (days.has(iso(d))) { n++; d = addDays(d, -1); }
  return n;
}

export async function stats() {
  const all = await db.all('xp');
  const xp = all.reduce((s, e) => s + e.amount, 0);
  const days = new Set(all.filter(isActivity).map((e) => e.day));
  const today = iso(new Date());
  const streak = days.has(today) ? streakFrom(days, new Date()) : streakFrom(days, addDays(new Date(), -1));
  let best = 0, run = 0, prev = null;
  for (const d of [...days].sort()) {
    run = prev && iso(addDays(parseISO(prev), 1)) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const count = (p) => all.filter((e) => e.key.startsWith(p)).length;
  const kxp = all.filter((e) => isBrain(e.key)).reduce((s, e) => s + e.amount, 0);
  return {
    ...levelInfo(xp),
    ...evoInfo(kxp),
    notes: count('note:'), links: count('link:'), reviews: count('review:'),
    streak, best, activeToday: days.has(today),
    todayXp: all.filter((e) => e.day === today).reduce((s, e) => s + e.amount, 0),
    tasks: count('task:'), subs: count('sub:'), journal: count('journal:'), ink: count('ink:'), goals: count('goaldone:'),
    recent: all.sort((a, b) => b.at - a.at).slice(0, 12),
  };
}

async function checkProgress() {
  const s = await stats();
  const last = (await db.get('settings', 'lastLevel')) || 1;
  if (s.level > last) {
    await db.put('settings', s.level, 'lastLevel');
    ui.levelUp(s.level, s);
  }
  const lastEvo = (await db.get('settings', 'lastEvo')) || 0;
  if (s.evo > lastEvo) {
    await db.put('settings', s.evo, 'lastEvo');
    ui.evolve(s.evo, s);
  }
  const known = new Set((await db.get('settings', 'badges')) || []);
  const fresh = BADGES.filter((b) => b.test(s) && !known.has(b.id));
  if (fresh.length) {
    fresh.forEach((b) => known.add(b.id));
    await db.put('settings', [...known], 'badges');
    fresh.forEach((b) => ui.badge(b));
  }
}

/** Gagner des points (une seule fois par clé). */
export const award = (key, amount, reason, { showPop = true } = {}) => serial(async () => {
  if (await db.get('xp', key)) return 0;
  const now = Date.now();
  const today = iso(new Date());
  await db.put('xp', { key, amount, reason, at: now, day: today });
  if (showPop) ui.pop(amount, reason);
  let gained = amount;

  // Bonus de série : première activité du jour alors que la veille était active aussi
  if (!(await db.get('xp', 'streak:' + today))) {
    const days = new Set((await db.all('xp')).filter(isActivity).map((e) => e.day));
    const n = streakFrom(days, new Date());
    if (n >= 2) {
      const amt = Math.min(n, 10) * 2;
      const why = `Série de ${n} jours 🔥`;
      await db.put('xp', { key: 'streak:' + today, amount: amt, reason: why, at: now + 1, day: today });
      ui.pop(amt, why);
      gained += amt;
    }
  }
  await checkProgress();
  ui.changed();
  return gained;
});

/** Retirer des points (ex. mission décochée). */
export const revoke = (key, { showPop = true } = {}) => serial(async () => {
  const e = await db.get('xp', key);
  if (!e) return 0;
  await db.del('xp', key);
  if (showPop) ui.pop(-e.amount, 'Annulé');
  ui.changed();
  return e.amount;
});

/* ---------- Règles métier ---------- */
export async function checkJournal(e) {
  if (!e?.date || e.date > iso(new Date())) return;
  if (e.mood) await award('mood:' + e.date, XP.mood, 'Humeur notée');
  const len = ['intention', 'text', 'grat', 'lesson'].reduce((n, k) => n + (e[k] || '').trim().length, 0);
  if (len >= 40) await award('journal:' + e.date, XP.journal, 'Entrée de journal');
}

export async function syncGoal(g) {
  for (const m of [25, 50, 75]) {
    const k = `goal:${g.id}:${m}`;
    if (g.progress >= m) await award(k, XP.goal, `« ${g.title} » à ${m} %`);
    else await revoke(k, { showPop: false });
  }
  if (g.progress >= 100 || g.done) await award('goaldone:' + g.id, XP.goalDone, `Objectif atteint : ${g.title}`); // atteint, ou terminé à la main
  else await revoke('goaldone:' + g.id, { showPop: false });
}

/** Au premier lancement : crédite le travail déjà fait, sans célébration. */
export async function init() {
  if (await db.get('settings', 'xpInit')) return;
  const put = (key, amount, reason, at) => db.put('xp', { key, amount, reason, at, day: iso(new Date(at)) });
  for (const t of await db.all('tasks')) {
    if (t.done) await put('task:' + t.id, XP.task, 'Mission : ' + t.title, t.doneAt || t.createdAt);
    for (const s of t.subtasks || []) if (s.done) await put(`sub:${t.id}:${s.id}`, XP.sub, 'Étape : ' + s.title, t.createdAt);
  }
  for (const j of await db.all('journal')) {
    const at = j.updatedAt || +parseISO(j.date);
    if (j.mood) await put('mood:' + j.date, XP.mood, 'Humeur notée', at);
    const len = ['intention', 'text', 'grat', 'lesson'].reduce((n, k) => n + (j[k] || '').trim().length, 0);
    if (len >= 40) await put('journal:' + j.date, XP.journal, 'Entrée de journal', at);
  }
  for (const g of await db.all('goals')) {
    for (const m of [25, 50, 75]) if (g.progress >= m) await put(`goal:${g.id}:${m}`, XP.goal, `« ${g.title} » à ${m} %`, g.createdAt);
    if (g.progress >= 100) await put('goaldone:' + g.id, XP.goalDone, 'Objectif atteint : ' + g.title, g.createdAt);
  }
  const s = await stats();
  await db.put('settings', s.level, 'lastLevel');
  await db.put('settings', BADGES.filter((b) => b.test(s)).map((b) => b.id), 'badges');
  await db.put('settings', true, 'xpInit');
}
