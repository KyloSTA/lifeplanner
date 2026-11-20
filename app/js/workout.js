// Workout : séances guidées façon carnet d'entraînement (séries à cocher, « Précédent », minuterie de repos,
// records), modèles de séances, historique, bibliothèque d'exercices et programme de la semaine.
//
// Store « workouts » :
//   modèle : { id, kind: 'tpl', name, emoji, order, exercises: [{ id, name, sets, reps, weight }] }
//   séance : { id, kind: 'log', date, tplId, name, emoji, startedAt, finishedAt, done, note, prs,
//              exercises: [{ name, target, note, sets: [{ reps, weight, done, warm }] }] }
//   (les étirements, kind: 'stretch', sont gérés par stretch.js)
// Réglages : « workoutPlan » { days: { 0..6: idModèle }, unit: 'lb' | 'kg', rest: secondes }
//            « exLib » [{ name, part, type }] : exercices ajoutés à la bibliothèque

import { db } from './db.js';
import * as U from './util.js';
import * as game from './game.js';
import { chime } from './alarms.js';

const { esc, iso } = U;
const DAYS = [[1, 'Lundi'], [2, 'Mardi'], [3, 'Mercredi'], [4, 'Jeudi'], [5, 'Vendredi'], [6, 'Samedi'], [0, 'Dimanche']];

// Exemple de départ, à remplacer par ton propre programme
const SEED = [
  { id: 'wk-haut', name: 'Haut du corps', emoji: '💪', exercises: [
    ['Développé couché', 3, '10', 95], ['Rowing haltère', 3, '10', 40], ['Développé épaules', 3, '10', 30],
    ['Tractions assistées', 3, '8', ''], ['Curl biceps', 3, '12', 25], ['Planche', 3, '45 s', ''],
  ] },
  { id: 'wk-bas', name: 'Bas du corps', emoji: '🦵', exercises: [
    ['Squat', 4, '8', 135], ['Fentes marchées', 3, '10', 25], ['Soulevé de terre roumain', 3, '10', 95],
    ['Extension mollets', 3, '15', 45], ['Gainage latéral', 3, '30 s', ''],
  ] },
  { id: 'wk-cardio', name: 'Cardio et mobilité', emoji: '🏃', exercises: [
    ['Course ou vélo', 1, '30 min', ''], ['Étirements', 1, '10 min', ''],
  ] },
];
const SEED_PLAN = { 1: 'wk-haut', 3: 'wk-bas', 5: 'wk-cardio' };

// Bibliothèque d'exercices : [nom, partie du corps, type] — type : poids, corps (poids du corps), duree, cardio
export const PARTS = ['Pectoraux', 'Dos', 'Épaules', 'Bras', 'Jambes', 'Fessiers', 'Abdos', 'Cardio', 'Corps entier'];
const LIB = [
  ['Développé couché', 'Pectoraux', 'poids'], ['Développé incliné haltères', 'Pectoraux', 'poids'], ['Développé couché haltères', 'Pectoraux', 'poids'],
  ['Écarté haltères', 'Pectoraux', 'poids'], ['Écarté à la poulie', 'Pectoraux', 'poids'], ['Pompes', 'Pectoraux', 'corps'], ['Dips', 'Pectoraux', 'corps'],
  ['Tractions', 'Dos', 'corps'], ['Tractions assistées', 'Dos', 'poids'], ['Rowing barre', 'Dos', 'poids'], ['Rowing haltère', 'Dos', 'poids'],
  ['Tirage vertical', 'Dos', 'poids'], ['Tirage horizontal assis', 'Dos', 'poids'], ['Soulevé de terre', 'Dos', 'poids'], ['Extension lombaire', 'Dos', 'corps'],
  ['Développé épaules', 'Épaules', 'poids'], ['Développé militaire', 'Épaules', 'poids'], ['Élévations latérales', 'Épaules', 'poids'],
  ['Oiseau (deltoïdes arrière)', 'Épaules', 'poids'], ['Face pull', 'Épaules', 'poids'], ['Haussements d’épaules', 'Épaules', 'poids'],
  ['Curl biceps', 'Bras', 'poids'], ['Curl marteau', 'Bras', 'poids'], ['Curl barre', 'Bras', 'poids'], ['Extension triceps poulie', 'Bras', 'poids'],
  ['Extension triceps au-dessus de la tête', 'Bras', 'poids'], ['Barre au front', 'Bras', 'poids'],
  ['Squat', 'Jambes', 'poids'], ['Squat goblet', 'Jambes', 'poids'], ['Presse à cuisses', 'Jambes', 'poids'], ['Fentes marchées', 'Jambes', 'poids'],
  ['Squat bulgare', 'Jambes', 'poids'], ['Leg extension', 'Jambes', 'poids'], ['Leg curl', 'Jambes', 'poids'], ['Extension mollets', 'Jambes', 'poids'],
  ['Soulevé de terre roumain', 'Fessiers', 'poids'], ['Hip thrust', 'Fessiers', 'poids'], ['Pont fessier', 'Fessiers', 'corps'], ['Abduction hanche', 'Fessiers', 'poids'],
  ['Planche', 'Abdos', 'duree'], ['Gainage latéral', 'Abdos', 'duree'], ['Crunch', 'Abdos', 'corps'], ['Relevé de jambes suspendu', 'Abdos', 'corps'],
  ['Russian twist', 'Abdos', 'corps'], ['Roulette abdominale', 'Abdos', 'corps'],
  ['Course ou vélo', 'Cardio', 'cardio'], ['Course', 'Cardio', 'cardio'], ['Vélo', 'Cardio', 'cardio'], ['Rameur', 'Cardio', 'cardio'],
  ['Corde à sauter', 'Cardio', 'cardio'], ['Elliptique', 'Cardio', 'cardio'], ['Marche inclinée', 'Cardio', 'cardio'],
  ['Burpees', 'Corps entier', 'corps'], ['Kettlebell swing', 'Corps entier', 'poids'], ['Épaulé-jeté', 'Corps entier', 'poids'],
  ['Farmer’s walk', 'Corps entier', 'poids'], ['Étirements', 'Corps entier', 'duree'],
];

/* ---------- Données ---------- */
export async function getPlan() {
  const p = (await db.get('settings', 'workoutPlan')) || {};
  return { days: {}, unit: 'lb', rest: 90, ...p };
}
const savePlan = (p) => db.put('settings', p, 'workoutPlan');

async function ensureSeed() {
  if (await db.get('settings', 'workoutSeeded')) return;
  if (!(await db.all('workouts')).some((x) => x.kind === 'tpl')) {
    let i = 0;
    for (const s of SEED) {
      await db.put('workouts', { id: s.id, kind: 'tpl', name: s.name, emoji: s.emoji, order: i++, example: true,
        exercises: s.exercises.map(([name, sets, reps, weight]) => ({ id: U.uid(), name, sets, reps, weight })) });
    }
    const plan = await getPlan();
    if (!Object.values(plan.days).some(Boolean)) await savePlan({ ...plan, days: { ...SEED_PLAN } });
  }
  await db.put('settings', true, 'workoutSeeded');
}

async function load() {
  const all = await db.all('workouts');
  return {
    tpls: all.filter((x) => x.kind === 'tpl').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    logs: all.filter((x) => x.kind === 'log').sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)),
  };
}

/** Bibliothèque : exercices de base + ceux que tu as ajoutés + ceux de tes modèles et séances. */
async function library(tpls = [], logs = []) {
  const map = new Map();
  const add = (name, part = 'Corps entier', type = 'poids') => { const k = key(name); if (k && !map.has(k)) map.set(k, { name: name.trim(), part, type }); };
  for (const x of (await db.get('settings', 'exLib')) || []) add(x.name, x.part, x.type);
  for (const [n, p, t] of LIB) add(n, p, t);
  for (const t of tpls) for (const e of t.exercises) add(e.name);
  for (const l of logs) for (const e of l.exercises) add(e.name);
  return [...map.values()];
}

const key = (n) => String(n || '').trim().toLowerCase();
const fmtDur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };
const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600); return (h ? h + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') : Math.floor(s / 60)) + ':' + String(s % 60).padStart(2, '0'); };
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const round = (n) => Math.round(n * 10) / 10;
/** 1RM estimé (formule d'Epley) ; null si les reps ne sont pas un nombre (ex. « 45 s »). */
const oneRM = (w, reps) => { const r = /^\d+$/.test(String(reps).trim()) ? Number(reps) : null; return w && r ? round(r === 1 ? w : w * (1 + r / 30)) : null; };
const workSets = (e) => e.sets.filter((s) => s.done && !s.warm);
const volumeOf = (log) => log.exercises.reduce((v, e) => v + workSets(e).reduce((a, s) => a + (num(s.weight) || 0) * (num(s.reps) || 0), 0), 0);
const setsDone = (log) => log.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
const ago = (t) => { const d = Math.round((U.parseISO(iso(new Date())) - U.parseISO(iso(t))) / 86_400_000); return d <= 0 ? 'aujourd’hui' : d === 1 ? 'hier' : `il y a ${d} j`; };

/** Séries de la dernière séance terminée où l'exercice apparaît. */
function lastFor(logs, name) {
  const k = key(name);
  for (const l of logs) {
    if (!l.done) continue;
    const ex = l.exercises.find((e) => key(e.name) === k);
    const sets = ex?.sets.filter((s) => s.done) || [];
    if (sets.length) return { date: l.date, sets };
  }
  return null;
}

/** Records d'un exercice dans les séances terminées (hors échauffement). */
function recordsFor(logs, name, exceptId = null) {
  const k = key(name);
  const r = { weight: 0, orm: 0, setVol: 0, reps: 0, sessions: 0, hist: [] };
  for (const l of [...logs].reverse()) {
    if (!l.done || l.id === exceptId) continue;
    const ex = l.exercises.find((e) => key(e.name) === k);
    if (!ex) continue;
    const sets = workSets(ex);
    if (!sets.length) continue;
    r.sessions++;
    let best = 0, bestOrm = 0;
    for (const s of sets) {
      const w = num(s.weight) || 0, reps = num(s.reps) || 0;
      best = Math.max(best, w); bestOrm = Math.max(bestOrm, oneRM(w, s.reps) || 0);
      r.weight = Math.max(r.weight, w); r.orm = Math.max(r.orm, oneRM(w, s.reps) || 0);
      r.setVol = Math.max(r.setVol, w * reps); r.reps = Math.max(r.reps, /^\d+$/.test(String(s.reps).trim()) ? reps : 0);
    }
    r.hist.push({ date: l.date, w: best, orm: bestOrm, sets: sets.length, top: sets.reduce((a, s) => ((num(s.weight) || 0) >= (num(a.weight) || 0) ? s : a), sets[0]) });
  }
  return r;
}

/** Records battus par une séance qu'on termine. */
function findPRs(log, logs) {
  const out = [];
  for (const e of log.exercises) {
    const sets = workSets(e);
    if (!sets.length) continue;
    const before = recordsFor(logs, e.name, log.id);
    if (!before.sessions) continue; // première fois : pas de record à battre
    const w = Math.max(...sets.map((s) => num(s.weight) || 0));
    const orm = Math.max(...sets.map((s) => oneRM(num(s.weight), s.reps) || 0));
    const vol = Math.max(...sets.map((s) => (num(s.weight) || 0) * (num(s.reps) || 0)));
    if (w > before.weight) out.push({ ex: e.name, kind: 'Poids max', v: w });
    else if (orm > before.orm) out.push({ ex: e.name, kind: '1RM estimé', v: orm });
    else if (vol > before.setVol && vol > 0) out.push({ ex: e.name, kind: 'Volume d’une série', v: vol });
  }
  return out;
}

function newExercise(name, logs, target = '') {
  const last = lastFor(logs, name);
  const sets = last ? last.sets.map((s) => ({ reps: s.reps, weight: s.weight, done: false, warm: !!s.warm }))
    : [0, 1, 2].map(() => ({ reps: '', weight: '', done: false }));
  return { name, target, note: '', sets };
}

async function startLog(tpl) {
  const { logs } = await load();
  const log = {
    id: U.uid(), kind: 'log', date: iso(new Date()), tplId: tpl?.id || null, name: tpl?.name || 'Séance libre', emoji: tpl?.emoji || '🏋️',
    startedAt: Date.now(), finishedAt: null, done: false, note: '',
    exercises: (tpl?.exercises || []).map((e) => {
      const last = lastFor(logs, e.name);
      const lastW = last ? Math.max(...last.sets.map((s) => num(s.weight) ?? 0)) : null;
      const weight = lastW || e.weight || '';
      return { name: e.name, target: `${e.sets}×${e.reps}`, note: '', sets: Array.from({ length: Math.max(1, e.sets) }, () => ({ reps: e.reps, weight, done: false })) };
    }),
  };
  await db.put('workouts', log);
  return log;
}

/* =========================================================
   Page : #/workout, #/workout/historique, #/workout/exercices, #/workout/plan
   ========================================================= */
let tick = null, restEnd = 0, restLen = 0;

export async function renderPage(ctx, tab = '') {
  await ensureSeed();
  clearInterval(tick);
  ctx.setCleanup(() => clearInterval(tick));
  if (tab === 'progres') tab = 'historique';
  const { view } = ctx;
  const { logs } = await load();
  const active = logs.find((l) => !l.done);
  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Entraînement</p><h1>Workout</h1></div>
    </header>
    <nav class="seg wo-tabs" aria-label="Workout">
      <a href="#/workout" class="${!tab ? 'on' : ''}">${active ? '⏱ Séance' : '▶ Séance'}</a>
      <a href="#/workout/historique" class="${tab === 'historique' ? 'on' : ''}">Historique</a>
      <a href="#/workout/exercices" class="${tab === 'exercices' ? 'on' : ''}">Exercices</a>
      <a href="#/workout/plan" class="${tab === 'plan' ? 'on' : ''}">Programme</a>
    </nav>
    <div id="wk-body"></div>`;
  const body = view.querySelector('#wk-body');
  if (tab === 'plan') return renderPlan(ctx, body);
  if (tab === 'historique') return renderHistory(ctx, body);
  if (tab === 'exercices') return renderExercises(ctx, body);
  return renderStart(ctx, body);
}

/* ---------- Démarrer ---------- */
async function renderStart(ctx, body) {
  const { modal, toast } = ctx;
  const { tpls, logs } = await load();
  const plan = await getPlan();
  const redraw = () => renderStart(ctx, body);
  const active = logs.find((l) => !l.done);
  if (active) return renderSession(ctx, body, active, logs, plan, redraw);

  const today = iso(new Date());
  const doneToday = logs.filter((l) => l.done && l.date === today);
  const planned = tpls.find((t) => t.id === plan.days[new Date().getDay()]);
  const lastOf = (t) => logs.find((l) => l.done && l.tplId === t.id);
  const wk0 = U.startOfWeek(new Date());
  const week = Array.from({ length: 7 }, (_, i) => U.addDays(wk0, i));
  const doneDays = new Set(logs.filter((l) => l.done).map((l) => l.date));

  const card = (t) => {
    const last = lastOf(t);
    return `<button class="wo-tpl ${t.id === planned?.id ? 'planned' : ''}" data-tpl="${t.id}">
      <span class="wo-tpl-head"><b>${esc(t.emoji)} ${esc(t.name)}</b>${t.id === planned?.id ? '<span class="chip ok">Aujourd’hui</span>' : ''}</span>
      <span class="wo-tpl-list">${t.exercises.slice(0, 6).map((e) => `<span>${e.sets} × ${esc(e.name)}</span>`).join('')}${t.exercises.length > 6 ? `<span class="muted">+ ${t.exercises.length - 6} autres</span>` : ''}</span>
      <small class="muted">${last ? `Dernière fois : ${ago(last.startedAt)}` : 'Jamais faite'}</small>
    </button>`;
  };

  body.innerHTML = `
    <section class="card wo-start">
      <div class="wo-week" aria-label="Cette semaine">${week.map((d) => `<span class="${doneDays.has(iso(d)) ? 'on' : ''} ${iso(d) === today ? 'today' : ''}" title="${U.cap(U.fmtShort(d))}"><small>${d.toLocaleDateString('fr-CA', { weekday: 'narrow' }).toUpperCase()}</small><i>${doneDays.has(iso(d)) ? '✓' : d.getDate()}</i></span>`).join('')}</div>
      ${doneToday.length ? doneToday.map((l) => `<p class="wo-done">✅ <b>${esc(l.emoji)} ${esc(l.name)}</b> terminée${l.finishedAt ? ` en ${fmtDur(l.finishedAt - l.startedAt)}` : ''} · ${setsDone(l)} série${setsDone(l) > 1 ? "s" : ""}${l.prs?.length ? ` · 🏆 ${l.prs.length} record${l.prs.length > 1 ? 's' : ''}` : ''}</p>`).join('')
        : planned ? `<p class="muted wo-today">Au programme aujourd’hui : <b>${esc(planned.emoji)} ${esc(planned.name)}</b></p>` : '<p class="muted wo-today">😌 Jour de repos au programme. Une petite séance quand même ?</p>'}
      <div class="wo-start-btns">
        ${planned ? `<button class="btn primary" data-go="${planned.id}">▶ ${esc(planned.name)}</button>` : ''}
        <button class="btn ${planned ? '' : 'primary'}" id="wo-empty">＋ Séance libre</button>
      </div>
    </section>
    <div class="card-head wo-sec-head"><h2>Mes modèles</h2><button class="btn" id="wo-newtpl">＋ Modèle</button></div>
    <div class="wo-tpls">${tpls.map(card).join('') || '<p class="empty-sm">Aucun modèle : crée ta première séance type.</p>'}</div>
    ${tpls.some((t) => t.example) ? '<p class="hint muted">Les modèles « Haut du corps », « Bas du corps » et « Cardio » sont des exemples : modifie-les ou remplace-les par ton programme.</p>' : ''}`;

  const go = async (t) => { await startLog(t); toast(`${t?.emoji || '🏋️'} C’est parti !`); redraw(); };
  body.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(tpls.find((x) => x.id === b.dataset.go))));
  body.querySelector('#wo-empty').onclick = () => go(null);
  body.querySelector('#wo-newtpl').onclick = () => tplEditor(ctx, null, redraw);
  body.querySelectorAll('[data-tpl]').forEach((b) => (b.onclick = () => {
    const t = tpls.find((x) => x.id === b.dataset.tpl);
    const last = lastOf(t);
    modal(`<h2>${esc(t.emoji)} ${esc(t.name)}</h2>
      <p class="muted" style="margin-top:0">${last ? `Dernière fois : ${ago(last.startedAt)}${last.finishedAt ? ` · ${fmtDur(last.finishedAt - last.startedAt)}` : ''}` : 'Pas encore faite'}</p>
      <ul class="wo-prev">${t.exercises.map((e) => { const lf = lastFor(logs, e.name); return `<li><span><b>${e.sets} ×</b> ${esc(e.name)}</span><span class="muted">${lf ? bestSetText(lf.sets, plan.unit) : esc(e.reps)}</span></li>`; }).join('') || '<li class="muted">Aucun exercice</li>'}</ul>
      <div class="modal-actions"><button class="btn" id="wo-edit">✎ Modifier</button><button class="btn primary" id="wo-go">▶ Commencer</button></div>`, (m, close) => {
      m.querySelector('#wo-go').onclick = () => { close(); go(t); };
      m.querySelector('#wo-edit').onclick = () => { close(); tplEditor(ctx, t.id, redraw); };
    });
  }));
}

const setText = (s, unit) => (num(s.weight) ? `${num(s.weight)} ${unit} × ${esc(s.reps)}` : `${esc(s.reps || '—')}`);
function bestSetText(sets, unit) {
  const work = sets.filter((s) => !s.warm);
  const best = (work.length ? work : sets).reduce((a, s) => ((num(s.weight) || 0) * 1000 + (num(s.reps) || 0) > (num(a.weight) || 0) * 1000 + (num(a.reps) || 0) ? s : a));
  return setText(best, unit);
}

/* ---------- Séance en cours ---------- */
async function renderSession(ctx, body, log, logs, plan, redraw) {
  const { toast, confirmBox, modal } = ctx;
  const unit = plan.unit;
  const save = U.debounce(() => db.put('workouts', log), 400);
  ctx.setCleanup(async () => { clearInterval(tick); await save.flush(); });
  const lib = await library([], logs);
  const typeOf = (n) => lib.find((x) => key(x.name) === key(n))?.type || 'poids';

  const draw = () => {
    body.innerHTML = `
      <section class="wo-live">
        <div class="wo-live-head">
          <div class="wo-live-title"><input id="wo-name" value="${esc(log.name)}" aria-label="Nom de la séance"><small class="muted">${U.cap(U.fmtShort(new Date(log.startedAt)))} · <span id="wo-elapsed">${clock(Date.now() - log.startedAt)}</span></small></div>
          <button class="btn primary wo-finish" id="wo-finish">Terminer</button>
        </div>
        <div class="wo-live-bar"><i id="wo-bar" style="width:${pct()}%"></i></div>
      </section>
      ${log.exercises.map((e, ei) => {
        const prev = lastFor(logs, e.name);
        const t = typeOf(e.name);
        return `<section class="card wo-ex" data-ei="${ei}">
          <div class="wo-ex-head"><h3>${esc(e.name)}</h3>${e.target ? `<span class="muted">${esc(e.target)}</span>` : ''}<button class="btn icon wo-ex-menu" data-menu aria-label="Options de l’exercice">⋯</button></div>
          ${e.note ? `<p class="wo-ex-note">📝 ${esc(e.note)}</p>` : ''}
          <div class="wo-grid ${t === 'poids' ? '' : 'no-w'}">
            <div class="wo-head"><span>Série</span><span>Précédent</span>${t === 'poids' ? `<span>${unit}</span>` : ''}<span>${t === 'duree' || t === 'cardio' ? 'Durée' : 'Reps'}</span><span>✓</span></div>
            ${(() => { let n = 0; return e.sets.map((s, si) => {
              const p = prev?.sets[si];
              const label = s.warm ? 'É' : String(++n);
              return `<div class="wo-row ${s.done ? 'done' : ''}" data-si="${si}">
                <button class="wo-n ${s.warm ? 'warm' : ''}" data-warm title="${s.warm ? 'Échauffement (touche pour une série normale)' : 'Touche pour marquer comme échauffement'}">${label}</button>
                <button class="wo-prevset" data-copy ${p ? '' : 'disabled'} title="${p ? 'Reprendre cette série' : ''}">${p ? setText(p, unit) : '—'}</button>
                ${t === 'poids' ? `<input value="${esc(s.weight)}" data-f="weight" inputmode="decimal" placeholder="${esc(p?.weight ?? '')}" aria-label="Charge, série ${si + 1}">` : ''}
                <input value="${esc(s.reps)}" data-f="reps" inputmode="${t === 'poids' || t === 'corps' ? 'numeric' : 'text'}" placeholder="${esc(p?.reps ?? '')}" aria-label="${t === 'duree' || t === 'cardio' ? 'Durée' : 'Répétitions'}, série ${si + 1}">
                <button class="wo-check" data-check aria-pressed="${s.done}" aria-label="Série ${si + 1} faite">✓</button>
              </div>`;
            }).join(''); })()}
          </div>
          <button class="btn wo-addset" data-addset>＋ Ajouter une série</button>
        </section>`;
      }).join('')}
      <div class="wo-live-foot">
        <button class="btn primary" id="wo-addex">＋ Ajouter des exercices</button>
        <textarea id="wo-note" placeholder="Note sur la séance (énergie, douleur, sommeil…)" rows="2">${esc(log.note || '')}</textarea>
        <button class="btn danger" id="wo-cancel">Annuler la séance</button>
      </div>
      <div class="wo-rest" id="wo-rest" hidden></div>`;

    body.querySelectorAll('.wo-ex').forEach((sec) => {
      const ei = Number(sec.dataset.ei), e = log.exercises[ei];
      sec.querySelectorAll('.wo-row').forEach((row) => {
        const s = e.sets[Number(row.dataset.si)];
        row.querySelectorAll('input[data-f]').forEach((inp) => (inp.oninput = () => { s[inp.dataset.f] = inp.value; save(); }));
        row.querySelector('[data-check]').onclick = () => {
          s.done = !s.done;
          if (s.done) { // case vide : on reprend la valeur proposée (précédente)
            row.querySelectorAll('input[data-f]').forEach((inp) => { if (!inp.value && inp.placeholder) { inp.value = inp.placeholder; s[inp.dataset.f] = inp.placeholder; } });
            if (!s.warm) startRest();
          }
          row.classList.toggle('done', s.done);
          row.querySelector('[data-check]').setAttribute('aria-pressed', s.done);
          save(); updateHead();
        };
        row.querySelector('[data-warm]').onclick = () => { s.warm = !s.warm; save(); draw(); };
        row.querySelector('[data-copy]').onclick = () => {
          const p = lastFor(logs, e.name)?.sets[Number(row.dataset.si)];
          if (!p) return;
          s.weight = p.weight; s.reps = p.reps; save(); draw();
        };
      });
      sec.querySelector('[data-addset]').onclick = () => { const p = e.sets[e.sets.length - 1] || { reps: '', weight: '' }; e.sets.push({ reps: p.reps, weight: p.weight, done: false }); save(); draw(); };
      sec.querySelector('[data-menu]').onclick = () => exMenu(ei);
    });
    body.querySelector('#wo-name').oninput = (ev) => { log.name = ev.target.value; save(); };
    body.querySelector('#wo-note').oninput = (ev) => { log.note = ev.target.value; save(); };
    body.querySelector('#wo-addex').onclick = () => pickExercises(ctx, logs, (names) => {
      for (const n of names) log.exercises.push(newExercise(n, logs));
      save(); draw();
      body.querySelector('.wo-ex:last-of-type')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    body.querySelector('#wo-cancel').onclick = async () => {
      if (!(await confirmBox('Annuler cette séance ? Les séries notées seront perdues.', 'Annuler la séance'))) return;
      save.cancel?.();
      await db.del('workouts', log.id);
      restEnd = 0;
      redraw();
    };
    body.querySelector('#wo-finish').onclick = finish;
    drawRest();
  };

  const exMenu = (ei) => {
    const e = log.exercises[ei];
    modal(`<h2>${esc(e.name)}</h2>
      <div class="wo-menu">
        <button class="btn" data-a="note">📝 ${e.note ? 'Modifier la note' : 'Ajouter une note'}</button>
        <button class="btn" data-a="up" ${ei ? '' : 'disabled'}>↑ Monter</button>
        <button class="btn" data-a="down" ${ei < log.exercises.length - 1 ? '' : 'disabled'}>↓ Descendre</button>
        <button class="btn" data-a="rmset" ${e.sets.length > 1 ? '' : 'disabled'}>− Retirer la dernière série</button>
        <button class="btn" data-a="replace">⇄ Remplacer l’exercice</button>
        <button class="btn danger" data-a="del">🗑 Retirer l’exercice</button>
      </div>`, (m, close) => {
      m.querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => {
        const a = b.dataset.a;
        close();
        if (a === 'note') {
          modal(`<h2>Note · ${esc(e.name)}</h2><form class="form" id="wo-nf"><textarea name="n" rows="3" placeholder="Réglage du banc, prise, sensation…">${esc(e.note || '')}</textarea>
            <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`, (m2, close2) => {
            m2.querySelector('#wo-nf').onsubmit = (ev) => { ev.preventDefault(); e.note = ev.target.n.value.trim(); save(); close2(); draw(); };
          });
          return;
        }
        if (a === 'up' || a === 'down') { const j = a === 'up' ? ei - 1 : ei + 1; [log.exercises[ei], log.exercises[j]] = [log.exercises[j], log.exercises[ei]]; }
        if (a === 'rmset') e.sets.pop();
        if (a === 'del') { if (e.sets.some((s) => s.done) && !(await confirmBox(`Retirer « ${e.name} » et ses séries ?`, 'Retirer'))) return; log.exercises.splice(ei, 1); }
        if (a === 'replace') return pickExercises(ctx, logs, ([n]) => { if (n) { log.exercises[ei] = { ...newExercise(n, logs, e.target), note: e.note }; save(); draw(); } }, { single: true });
        save(); draw(); updateHead();
      }));
    });
  };

  const pct = () => { const t = log.exercises.reduce((n, e) => n + e.sets.length, 0); return Math.round((setsDone(log) / Math.max(1, t)) * 100); };
  const updateHead = () => { const b = body.querySelector('#wo-bar'); if (b) b.style.width = pct() + '%'; };

  // Minuterie de repos : barre flottante en bas, −15 s / +15 s / Passer
  const startRest = () => { restLen = (plan.rest || 90) * 1000; restEnd = Date.now() + restLen; rang = false; drawRest(); };
  const drawRest = () => {
    const el = body.querySelector('#wo-rest');
    if (!el) return;
    const left = restEnd - Date.now();
    if (!restEnd || left <= -4000) { el.hidden = true; return; }
    el.hidden = false;
    el.classList.toggle('over', left <= 0);
    el.innerHTML = left > 0
      ? `<div class="wo-rest-bar"><i style="width:${Math.max(0, Math.min(100, (left / restLen) * 100))}%"></i></div>
         <button class="btn" data-r="-15">−15</button><b>⏱ ${clock(left)}</b><button class="btn" data-r="15">+15</button><button class="btn sm-text" data-r="skip">Passer</button>`
      : '<b>💥 Repos terminé : série suivante !</b>';
    el.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => {
      if (b.dataset.r === 'skip') restEnd = 0;
      else { const d = Number(b.dataset.r) * 1000; restEnd += d; restLen = Math.max(restLen + d, 1000); }
      drawRest();
    }));
  };

  const finish = async () => {
    const n = setsDone(log);
    if (!n && !(await confirmBox('Aucune série cochée. Terminer quand même ?', 'Terminer'))) return;
    // Séries non cochées : retirées de la séance terminée (elles n'ont pas été faites)
    const unchecked = log.exercises.reduce((k, e) => k + e.sets.filter((s) => !s.done).length, 0);
    if (n && unchecked) log.exercises = log.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })).filter((e) => e.sets.length);
    log.done = true;
    log.finishedAt = Date.now();
    log.prs = findPRs(log, logs);
    save.cancel?.();
    await db.put('workouts', log);
    await game.award('workout:' + log.id, game.XP.workout, `Entraînement : ${log.name}`);
    restEnd = 0;
    clearInterval(tick);
    await summary(ctx, log, plan);
    redraw();
  };

  let rang = false;
  draw();
  tick = setInterval(() => {
    const el = body.querySelector('#wo-elapsed');
    if (!el) { clearInterval(tick); return; }
    el.textContent = clock(Date.now() - log.startedAt);
    if (restEnd && Date.now() >= restEnd && !rang) { rang = true; chime(); navigator.vibrate?.([200, 100, 200]); }
    drawRest();
  }, 1000);
}

/** Résumé de fin de séance (records, volume) et mise à jour du modèle. */
async function summary(ctx, log, plan) {
  const { modal } = ctx;
  const tpl = log.tplId ? await db.get('workouts', log.tplId) : null;
  // Exercices ou nombre de séries différents du modèle : on propose de le mettre à jour
  const shapeTpl = tpl ? tpl.exercises.map((e) => `${key(e.name)}:${e.sets}`).join('|') : '';
  const shapeLog = log.exercises.map((e) => `${key(e.name)}:${workSets(e).length}`).join('|');
  const changed = !!tpl && shapeTpl !== shapeLog;
  const vol = Math.round(volumeOf(log));
  return new Promise((resolve) => {
    modal(`<div class="wo-sum">
      <div class="wo-sum-big">🏁</div>
      <h2>Bravo !</h2>
      <p class="muted">${esc(log.emoji)} ${esc(log.name)} · ${U.cap(U.fmtShort(new Date(log.startedAt)))}</p>
      <div class="wo-sum-kpis"><span><b>${fmtDur(log.finishedAt - log.startedAt)}</b><small>durée</small></span><span><b>${setsDone(log)}</b><small>séries</small></span><span><b>${vol ? vol.toLocaleString('fr-CA') : '—'}</b><small>volume (${plan.unit})</small></span><span><b>${log.prs.length}</b><small>record${log.prs.length > 1 ? 's' : ''}</small></span></div>
      ${log.prs.length ? `<ul class="wo-prs">${log.prs.map((p) => `<li>🏆 <b>${esc(p.ex)}</b> · ${esc(p.kind)} : ${p.v.toLocaleString('fr-CA')} ${plan.unit}</li>`).join('')}</ul>` : ''}
      <ul class="wo-prev">${log.exercises.map((e) => `<li><span><b>${workSets(e).length || e.sets.length} ×</b> ${esc(e.name)}</span><span class="muted">${bestSetText(e.sets, plan.unit)}</span></li>`).join('')}</ul>
      ${changed ? `<p class="hint muted">Tu as changé les exercices ou le nombre de séries par rapport au modèle « ${esc(tpl.name)} ».</p>` : ''}
      <div class="modal-actions">${changed ? '<button class="btn" id="wo-upd">Mettre à jour le modèle</button>' : ''}<button class="btn primary" data-close>Fermer</button></div></div>`, (m, close) => {
      const obs = new MutationObserver(() => { if (!m.isConnected) { obs.disconnect(); resolve(); } });
      obs.observe(document.body, { childList: true, subtree: true });
      m.querySelector('#wo-upd')?.addEventListener('click', async () => {
        tpl.exercises = log.exercises.map((e) => {
          const work = workSets(e);
          const old = tpl.exercises.find((x) => key(x.name) === key(e.name));
          return { id: old?.id || U.uid(), name: e.name, sets: Math.max(1, work.length), reps: old?.reps || work[0]?.reps || '10', weight: num(work[work.length - 1]?.weight) ?? old?.weight ?? '' };
        });
        tpl.example = false;
        await db.put('workouts', tpl);
        ctx.toast('Modèle mis à jour');
        close();
      });
    });
  });
}

/** Choisir des exercices dans la bibliothèque (recherche, parties du corps, création). */
async function pickExercises(ctx, logs, onPick, opts = {}) {
  const { single = false, onCancel = null } = opts;
  const { modal } = ctx;
  const { tpls } = await load();
  const lib = await library(tpls, logs);
  const count = new Map();
  for (const l of logs) for (const e of l.exercises) count.set(key(e.name), (count.get(key(e.name)) || 0) + 1);
  let q = opts.q || '', part = opts.part || '';
  const picked = [...(opts.picked || [])];
  let handled = false; // fermé par un choix (pas une annulation)
  modal(`<h2>${single ? 'Remplacer par…' : 'Ajouter des exercices'}</h2>
    <input class="pick-search" id="px-q" value="${esc(q)}" placeholder="🔍 Chercher ou créer un exercice…" autocomplete="off">
    <div class="wo-parts" id="px-parts"></div>
    <div class="pick-list wo-lib" id="px-list"></div>
    <div class="modal-actions"><button class="btn" data-close>Annuler</button>${single ? '' : '<button class="btn primary" id="px-ok" disabled>Ajouter</button>'}</div>`, (m, close) => {
    m.classList.add('pick-modal');
    if (onCancel) {
      const obs = new MutationObserver(() => { if (!m.isConnected) { obs.disconnect(); if (!handled) onCancel(); } });
      obs.observe(document.body, { childList: true, subtree: true });
    }
    const draw = () => {
      m.querySelector('#px-parts').innerHTML = ['', ...PARTS].map((p) => `<button class="chip-btn ${p === part ? 'on' : ''}" data-p="${p}">${p || 'Tout'}</button>`).join('');
      m.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { part = b.dataset.p; draw(); }));
      const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const rows = lib.filter((x) => (!part || x.part === part) && (!q || norm(x.name).includes(norm(q))))
        .sort((a, b) => (count.get(key(b.name)) || 0) - (count.get(key(a.name)) || 0) || a.name.localeCompare(b.name, 'fr'));
      const exact = lib.some((x) => key(x.name) === key(q));
      m.querySelector('#px-list').innerHTML = (q.trim() && !exact ? `<button class="pick-row wo-create" data-new>＋ Créer « ${esc(q.trim())} »</button>` : '')
        + rows.map((x) => `<button class="pick-row ${picked.includes(x.name) ? 'on' : ''}" data-n="${esc(x.name)}"><span class="pick-txt"><b>${esc(x.name)}</b><small class="muted">${esc(x.part)}${count.get(key(x.name)) ? ` · ${count.get(key(x.name))} fois` : ''}</small></span>${picked.includes(x.name) ? '<span class="wo-tick">✓</span>' : ''}</button>`).join('')
        || '<p class="empty-sm">Aucun exercice.</p>';
      m.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => {
        const n = b.dataset.n;
        if (single) { handled = true; close(); onPick([n]); return; }
        const i = picked.indexOf(n);
        i >= 0 ? picked.splice(i, 1) : picked.push(n);
        draw();
      }));
      // Créer : la fenêtre de création remplace le sélecteur, qu'on rouvre ensuite avec le même état
      m.querySelector('[data-new]')?.addEventListener('click', async () => {
        handled = true;
        const n = await createExercise(ctx, q.trim(), part);
        if (n && single) { onPick([n]); return; }
        pickExercises(ctx, logs, onPick, { ...opts, picked: n ? [...picked, n] : picked, q: n ? '' : q, part });
      });
      const ok = m.querySelector('#px-ok');
      if (ok) { ok.disabled = !picked.length; ok.textContent = picked.length ? `Ajouter (${picked.length})` : 'Ajouter'; }
    };
    m.querySelector('#px-q').oninput = (e) => { q = e.target.value; draw(); };
    m.querySelector('#px-ok')?.addEventListener('click', () => { handled = true; close(); onPick(picked); });
    draw();
    m.querySelector('#px-q').focus();
  });
}

/** Ajoute un exercice à ta bibliothèque. Renvoie son nom (ou null si annulé). */
function createExercise(ctx, name = '', part = '') {
  return new Promise((resolve) => {
    let done = false;
    ctx.modal(`<h2>Nouvel exercice</h2>
      <form class="form" id="cx-form">
        <label>Nom<input name="n" value="${esc(name)}" required autocomplete="off"></label>
        <label>Partie du corps<select name="p">${PARTS.map((p) => `<option ${p === (part || 'Corps entier') ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
        <label>Type<select name="t"><option value="poids">Avec charge (poids × reps)</option><option value="corps">Poids du corps (reps)</option><option value="duree">Durée</option><option value="cardio">Cardio (durée, distance…)</option></select></label>
        <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Créer</button></div>
      </form>`, (m, close) => {
      const obs = new MutationObserver(() => { if (!m.isConnected) { obs.disconnect(); if (!done) resolve(null); } });
      obs.observe(document.body, { childList: true, subtree: true });
      m.querySelector('#cx-form').onsubmit = async (ev) => {
        ev.preventDefault();
        const f = ev.target, n = f.n.value.trim();
        if (!n) return;
        const lib = (await db.get('settings', 'exLib')) || [];
        if (!lib.some((x) => key(x.name) === key(n))) lib.push({ name: n, part: f.p.value, type: f.t.value });
        await db.put('settings', lib, 'exLib');
        done = true;
        close();
        resolve(n);
      };
    });
  });
}

/* ---------- Historique ---------- */
async function renderHistory(ctx, body) {
  const { modal, confirmBox, toast } = ctx;
  const { tpls, logs } = await load();
  const plan = await getPlan();
  const redraw = () => renderHistory(ctx, body);
  const done = logs.filter((l) => l.done);
  const wk0 = U.startOfWeek(new Date());
  const plannedPerWeek = Object.values(plan.days).filter((id) => id && tpls.some((t) => t.id === id)).length;
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const from = U.addDays(wk0, -7 * (7 - i)), to = U.addDays(from, 7);
    return { from, n: done.filter((l) => l.startedAt >= from.getTime() && l.startedAt < to.getTime()).length };
  });
  const thisWeek = weeks[7].n;
  const maxN = Math.max(plannedPerWeek, ...weeks.map((w) => w.n), 1);
  let wkStreak = 0;
  for (let i = 6; i >= 0; i--) { if (weeks[i].n >= Math.max(1, plannedPerWeek)) wkStreak++; else break; }
  if (thisWeek >= Math.max(1, plannedPerWeek)) wkStreak++;
  const month = done.filter((l) => iso(l.startedAt).slice(0, 7) === iso(new Date()).slice(0, 7));
  const monthMin = month.reduce((n, l) => n + (l.finishedAt ? Math.round((l.finishedAt - l.startedAt) / 60000) : 0), 0);

  // Séances groupées par mois
  const groups = [];
  for (const l of done) {
    const k = iso(l.startedAt).slice(0, 7);
    if (groups[groups.length - 1]?.k !== k) groups.push({ k, list: [] });
    groups[groups.length - 1].list.push(l);
  }
  const monthName = (k) => U.cap(new Date(Number(k.slice(0, 4)), Number(k.slice(5)) - 1, 1).toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' }));

  body.innerHTML = `
    <div class="wk-kpis">
      <div class="card wk-kpi"><b>${thisWeek}${plannedPerWeek ? `<small>/${plannedPerWeek}</small>` : ''}</b><span>séances cette semaine</span></div>
      <div class="card wk-kpi"><b>${wkStreak}</b><span>semaine${wkStreak > 1 ? 's' : ''} d’affilée au programme 🔥</span></div>
      <div class="card wk-kpi"><b>${month.length}</b><span>séances ce mois-ci · ${fmtDur(monthMin * 60000)}</span></div>
      <div class="card wk-kpi"><b>${done.length}</b><span>séances au total</span></div>
    </div>
    <section class="card">
      <div class="card-head"><h2>8 dernières semaines</h2>${plannedPerWeek ? `<span class="muted">ligne = ${plannedPerWeek} prévue${plannedPerWeek > 1 ? 's' : ''}</span>` : ''}</div>
      <div class="wk-bars" style="--goal-n:${plannedPerWeek / maxN}">${weeks.map((w, i) => `<div class="wk-barcol" title="Semaine du ${U.fmtShort(w.from)} : ${w.n} séance${w.n > 1 ? 's' : ''}">
        <span class="wk-barval">${w.n || ''}</span><i class="${plannedPerWeek && w.n >= plannedPerWeek ? 'ok' : ''} ${i === 7 ? 'now' : ''}" style="height:${(w.n / maxN) * 100}%"></i><small>${U.fmtShort(w.from).replace('.', '')}</small></div>`).join('')}
        ${plannedPerWeek ? '<div class="wk-goal-line"></div>' : ''}</div>
    </section>
    ${groups.map((g) => `<h3 class="section-title">${monthName(g.k)}</h3>
      <div class="wo-hist">${g.list.map((l) => `<button class="card wo-hcard" data-log="${l.id}">
        <span class="wo-h-top"><b>${esc(l.emoji)} ${esc(l.name)}</b>${l.prs?.length ? `<span class="chip warn">🏆 ${l.prs.length}</span>` : ''}</span>
        <small class="muted">${U.cap(U.fmtLong(U.parseISO(l.date)))}</small>
        <span class="wo-h-stats"><span>⏱ ${l.finishedAt ? fmtDur(l.finishedAt - l.startedAt) : '—'}</span><span>🏋️ ${Math.round(volumeOf(l)).toLocaleString('fr-CA')} ${plan.unit}</span><span>✓ ${setsDone(l)} série${setsDone(l) > 1 ? "s" : ""}</span></span>
        <span class="wo-h-ex">${l.exercises.slice(0, 5).map((e) => `<span><span>${e.sets.length} × ${esc(e.name)}</span><span class="muted">${bestSetText(e.sets, plan.unit)}</span></span>`).join('')}${l.exercises.length > 5 ? `<span class="muted">+ ${l.exercises.length - 5} exercices</span>` : ''}</span>
      </button>`).join('')}</div>`).join('') || '<p class="empty-sm">Aucune séance terminée pour l’instant.</p>'}`;

  body.querySelectorAll('[data-log]').forEach((b) => (b.onclick = () => {
    const l = done.find((x) => x.id === b.dataset.log);
    modal(`<h2>${esc(l.emoji)} ${esc(l.name)}</h2>
      <p class="muted" style="margin-top:0">${U.cap(U.fmtLong(U.parseISO(l.date)))} · ${U.fmtTime(new Date(l.startedAt))}${l.finishedAt ? ` · ${fmtDur(l.finishedAt - l.startedAt)}` : ''}</p>
      ${l.prs?.length ? `<ul class="wo-prs">${l.prs.map((p) => `<li>🏆 <b>${esc(p.ex)}</b> · ${esc(p.kind)} : ${p.v} ${plan.unit}</li>`).join('')}</ul>` : ''}
      ${l.exercises.map((e) => `<div class="wo-detail"><b>${esc(e.name)}</b>${e.note ? `<small class="muted"> · ${esc(e.note)}</small>` : ''}
        <ol>${e.sets.map((s) => `<li class="${s.warm ? 'warm' : ''}">${s.warm ? 'É · ' : ''}${setText(s, plan.unit)}${oneRM(num(s.weight), s.reps) && !s.warm ? ` <small class="muted">· 1RM ≈ ${oneRM(num(s.weight), s.reps)}</small>` : ''}</li>`).join('')}</ol></div>`).join('')}
      ${l.note ? `<p class="wo-ex-note">📝 ${esc(l.note)}</p>` : ''}
      <div class="modal-actions"><button class="btn danger" id="wh-del">Supprimer</button><button class="btn" id="wh-tpl">Enregistrer comme modèle</button><button class="btn primary" data-close>Fermer</button></div>`, (m, close) => {
      m.querySelector('#wh-del').onclick = async () => {
        close();
        if (!(await confirmBox(`Supprimer la séance « ${l.name} » du ${U.fmtShort(U.parseISO(l.date))} ?`))) return;
        await db.del('workouts', l.id);
        redraw();
      };
      m.querySelector('#wh-tpl').onclick = async () => {
        const all = (await load()).tpls;
        await db.put('workouts', { id: U.uid(), kind: 'tpl', name: l.name, emoji: l.emoji, order: all.length ? Math.max(...all.map((x) => x.order ?? 0)) + 1 : 0,
          exercises: l.exercises.map((e) => { const w = workSets(e); return { id: U.uid(), name: e.name, sets: Math.max(1, w.length), reps: w[0]?.reps || '10', weight: num(w[w.length - 1]?.weight) ?? '' }; }) });
        close();
        toast('Modèle créé : il est dans l’onglet Séance');
      };
    });
  }));
}

/* ---------- Exercices ---------- */
async function renderExercises(ctx, body) {
  const { modal } = ctx;
  const { tpls, logs } = await load();
  const plan = await getPlan();
  const lib = await library(tpls, logs);
  let q = '', part = '';
  const stats = new Map(lib.map((x) => [key(x.name), recordsFor(logs, x.name)]));
  const draw = () => {
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const rows = lib.filter((x) => (!part || x.part === part) && (!q || norm(x.name).includes(norm(q))))
      .sort((a, b) => stats.get(key(b.name)).sessions - stats.get(key(a.name)).sessions || a.name.localeCompare(b.name, 'fr'));
    body.querySelector('#ex-list').innerHTML = rows.map((x) => {
      const r = stats.get(key(x.name));
      return `<button class="wo-exrow" data-ex="${esc(x.name)}"><span><b>${esc(x.name)}</b><small class="muted">${esc(x.part)}${r.sessions ? ` · ${r.sessions} séance${r.sessions > 1 ? 's' : ''}` : ''}</small></span>
        <span class="wo-exbest">${r.weight ? `${r.weight} ${plan.unit}` : r.sessions ? '✓' : ''}</span></button>`;
    }).join('') || '<p class="empty-sm">Aucun exercice.</p>';
    body.querySelector('#ex-parts').innerHTML = ['', ...PARTS].map((p) => `<button class="chip-btn ${p === part ? 'on' : ''}" data-p="${p}">${p || 'Tout'}</button>`).join('');
    body.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { part = b.dataset.p; draw(); }));
    body.querySelectorAll('[data-ex]').forEach((b) => (b.onclick = () => exDetail(b.dataset.ex)));
  };
  const exDetail = (name) => {
    const r = stats.get(key(name)) || recordsFor(logs, name);
    const x = lib.find((e) => key(e.name) === key(name));
    const pts = r.hist.filter((h) => h.orm || h.w);
    const chart = (() => {
      if (pts.length < 2) return '';
      const vs = pts.map((p) => p.orm || p.w), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
      const xy = pts.map((p, i) => [(i / (pts.length - 1)) * 300, 90 - (((p.orm || p.w) - lo) / span) * 76]);
      return `<figure class="wo-chart"><svg viewBox="-6 0 312 100" preserveAspectRatio="none" aria-label="Progression du 1RM estimé">
        <polyline points="${xy.map((p) => p.join(',')).join(' ')}"/>${xy.map(([a, b]) => `<circle cx="${a}" cy="${b}" r="3"/>`).join('')}</svg>
        <figcaption class="muted"><span>${U.fmtShort(U.parseISO(pts[0].date))}</span><span>${pts[0].orm ? '1RM estimé' : 'Charge max'} : ${lo} → ${vs[vs.length - 1]} ${plan.unit}</span><span>${U.fmtShort(U.parseISO(pts[pts.length - 1].date))}</span></figcaption></figure>`;
    })();
    modal(`<h2>${esc(name)}</h2>
      <p class="muted" style="margin-top:0">${esc(x?.part || '')}${r.sessions ? ` · ${r.sessions} séance${r.sessions > 1 ? 's' : ''}` : ''}</p>
      ${r.sessions ? `<div class="wo-recs">
        <span><b>${r.weight ? r.weight + ' ' + plan.unit : '—'}</b><small>Poids max</small></span>
        <span><b>${r.orm ? r.orm + ' ' + plan.unit : '—'}</b><small>1RM estimé</small></span>
        <span><b>${r.setVol ? Math.round(r.setVol).toLocaleString('fr-CA') : '—'}</b><small>Meilleur volume (série)</small></span>
        <span><b>${r.reps || '—'}</b><small>Reps max</small></span></div>
        ${chart}
        <h3 class="section-title">Historique</h3>
        <ul class="wo-prev">${[...r.hist].reverse().slice(0, 12).map((h) => `<li><span>${U.cap(U.fmtShort(U.parseISO(h.date)))}</span><span class="muted">${h.sets} × · meilleure ${setText(h.top, plan.unit)}</span></li>`).join('')}</ul>`
        : '<p class="empty-sm">Pas encore fait. Ajoute-le à une séance pour suivre tes records.</p>'}
      <div class="modal-actions"><button class="btn primary" data-close>Fermer</button></div>`);
  };
  body.innerHTML = `
    <div class="wo-ex-tools"><input class="pick-search" id="ex-q" placeholder="🔍 Chercher un exercice…" autocomplete="off"><button class="btn" id="ex-new">＋ Exercice</button></div>
    <div class="wo-parts" id="ex-parts"></div>
    <div class="card wo-exlist" id="ex-list"></div>`;
  body.querySelector('#ex-q').oninput = (e) => { q = e.target.value; draw(); };
  body.querySelector('#ex-new').onclick = async () => { if (await createExercise(ctx, q, part)) renderExercises(ctx, body); };
  draw();
}

/* ---------- Programme ---------- */
async function renderPlan(ctx, body) {
  const { toast } = ctx;
  const { tpls } = await load();
  const plan = await getPlan();
  const redraw = () => renderPlan(ctx, body);
  const todayDow = new Date().getDay();
  body.innerHTML = `
    <div class="wk-plan-cols">
      <section class="card">
        <div class="card-head"><h2>📅 Ma semaine</h2></div>
        <div class="wk-week">${DAYS.map(([d, l]) => `<label class="wk-day ${d === todayDow ? 'today' : ''}"><span>${l}</span>
          <select data-day="${d}"><option value="">😌 Repos</option>${tpls.map((t) => `<option value="${t.id}" ${plan.days[d] === t.id ? 'selected' : ''}>${esc(t.emoji)} ${esc(t.name)}</option>`).join('')}</select></label>`).join('')}</div>
        <div class="wk-prefs">
          <label>Unité <select id="wk-unit"><option ${plan.unit === 'lb' ? 'selected' : ''}>lb</option><option ${plan.unit === 'kg' ? 'selected' : ''}>kg</option></select></label>
          <label>Repos entre les séries <select id="wk-restsel">${[30, 45, 60, 90, 120, 150, 180, 240].map((s) => `<option value="${s}" ${plan.rest === s ? 'selected' : ''}>${s < 60 ? s + ' s' : (s % 60 ? `${Math.floor(s / 60)} min ${s % 60}` : s / 60 + ' min')}</option>`).join('')}</select></label>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>🏋️ Mes modèles</h2><button class="btn" id="wk-newtpl">＋ Modèle</button></div>
        <div class="wk-tpls">${tpls.map((t, i) => `<div class="wk-tpl-row"><button class="wk-tpl" data-tpl="${t.id}">
          <b>${esc(t.emoji)} ${esc(t.name)}</b>${t.example ? ' <span class="chip">exemple</span>' : ''}
          <span class="muted">${t.exercises.map((e) => esc(e.name)).join(' · ') || 'Aucun exercice'}</span></button>
          <span class="wk-tpl-mv"><button class="btn sm" data-mv="${i}|-1" ${i ? '' : 'disabled'} aria-label="Monter">↑</button><button class="btn sm" data-mv="${i}|1" ${i < tpls.length - 1 ? '' : 'disabled'} aria-label="Descendre">↓</button></span></div>`).join('') || '<p class="empty-sm">Aucun modèle.</p>'}</div>
      </section>
    </div>`;
  body.querySelectorAll('[data-day]').forEach((s) => (s.onchange = async () => {
    const p = await getPlan();
    p.days = { ...p.days, [s.dataset.day]: s.value };
    await savePlan(p);
    toast('Programme enregistré');
  }));
  body.querySelector('#wk-unit').onchange = async (e) => { await savePlan({ ...(await getPlan()), unit: e.target.value }); toast('Unité : ' + e.target.value); };
  body.querySelector('#wk-restsel').onchange = async (e) => { await savePlan({ ...(await getPlan()), rest: Number(e.target.value) }); };
  body.querySelector('#wk-newtpl').onclick = () => tplEditor(ctx, null, redraw);
  body.querySelectorAll('[data-tpl]').forEach((b) => (b.onclick = () => tplEditor(ctx, b.dataset.tpl, redraw)));
  body.querySelectorAll('[data-mv]').forEach((b) => (b.onclick = async () => {
    const [i, d] = b.dataset.mv.split('|').map(Number);
    const list = [...tpls];
    [list[i], list[i + d]] = [list[i + d], list[i]];
    for (let k = 0; k < list.length; k++) { list[k].order = k; await db.put('workouts', list[k]); }
    redraw();
  }));
}

/** Éditeur de modèle. st : état en cours (après le sélecteur d'exercices, qui remplace la fenêtre). */
async function tplEditor(ctx, id, onDone, st = null) {
  const { modal, toast, confirmBox } = ctx;
  const plan = await getPlan();
  const { logs } = await load();
  const saved = id ? await db.get('workouts', id) : null;
  const t = { name: '', emoji: '💪', exercises: [], ...(saved || {}), ...(st ? { name: st.name, emoji: st.emoji } : {}) };
  const exs = st ? st.exs : t.exercises.map((e) => ({ ...e }));
  modal(`<h2>${id ? 'Modifier le modèle' : 'Nouveau modèle'}</h2>
    <form id="tp-form" class="hb-form">
      <div class="hb-row"><input name="emoji" value="${esc(t.emoji)}" maxlength="4" class="hb-emo-in" aria-label="Emoji">
        <input name="name" value="${esc(t.name)}" placeholder="Ex. Push, Jambes, HIIT…" required autocomplete="off"></div>
      <div class="tp-head muted"><span>Exercice</span><span>Séries</span><span>Reps</span><span>${plan.unit}</span><span></span></div>
      <div id="tp-exs"></div>
      <button type="button" class="btn" id="tp-add">＋ Ajouter des exercices</button>
      <div class="modal-actions">${id ? '<button type="button" class="btn danger" id="tp-del">Supprimer</button>' : ''}
        <button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div>
    </form>`, (m, close) => {
    m.classList.add('tp-modal');
    const drawEx = () => {
      m.querySelector('#tp-exs').innerHTML = exs.map((e, i) => `<div class="tp-row" data-i="${i}">
        <input data-f="name" value="${esc(e.name)}" placeholder="Ex. Squat" aria-label="Exercice ${i + 1}">
        <input data-f="sets" type="number" inputmode="numeric" min="1" max="20" value="${e.sets}" aria-label="Séries">
        <input data-f="reps" value="${esc(e.reps)}" aria-label="Répétitions" placeholder="10">
        <input data-f="weight" value="${esc(e.weight)}" inputmode="decimal" aria-label="Charge" placeholder="—">
        <span class="tp-tools"><button type="button" class="btn sm" data-up ${i ? '' : 'disabled'} aria-label="Monter">↑</button><button type="button" class="btn sm" data-rm aria-label="Retirer">×</button></span>
      </div>`).join('') || '<p class="empty-sm">Aucun exercice : ajoute-en depuis la bibliothèque.</p>';
      m.querySelectorAll('.tp-row').forEach((row) => {
        const e = exs[Number(row.dataset.i)];
        row.querySelectorAll('input').forEach((inp) => (inp.oninput = () => { e[inp.dataset.f] = inp.dataset.f === 'sets' ? Math.max(1, Number(inp.value) || 1) : inp.value; }));
        row.querySelector('[data-rm]').onclick = () => { exs.splice(Number(row.dataset.i), 1); drawEx(); };
        row.querySelector('[data-up]').onclick = () => { const i = Number(row.dataset.i); [exs[i - 1], exs[i]] = [exs[i], exs[i - 1]]; drawEx(); };
      });
    };
    drawEx();
    // Le sélecteur s'ouvre par-dessus : on garde ce qui est déjà saisi dans le formulaire
    const form = m.querySelector('#tp-form');
    m.querySelector('#tp-add').onclick = () => {
      const state = { exs, name: form.name.value, emoji: form.emoji.value };
      pickExercises(ctx, logs, (names) => {
        for (const n of names) {
          const last = lastFor(logs, n);
          exs.push({ id: U.uid(), name: n, sets: last ? last.sets.filter((s) => !s.warm).length || 3 : 3, reps: last?.sets[0]?.reps || '10', weight: last ? Math.max(...last.sets.map((s) => num(s.weight) ?? 0)) || '' : '' });
        }
        tplEditor(ctx, id, onDone, state);
      }, { onCancel: () => tplEditor(ctx, id, onDone, state) });
    };
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const all = (await load()).tpls;
      const rec = {
        ...(saved || { id: U.uid(), kind: 'tpl', order: all.length ? Math.max(...all.map((x) => x.order ?? 0)) + 1 : 0 }),
        name: f.name.value.trim(), emoji: f.emoji.value.trim() || '💪', example: false,
        exercises: exs.filter((e) => String(e.name).trim()).map((e) => ({ ...e, name: String(e.name).trim(), weight: num(e.weight) ?? '' })),
      };
      await db.put('workouts', rec);
      close();
      toast(id ? 'Modèle modifié' : `${rec.emoji} Modèle créé`);
      onDone();
    };
    m.querySelector('#tp-del')?.addEventListener('click', async () => {
      close();
      if (!(await confirmBox(`Supprimer le modèle « ${t.name} » ? Tes séances déjà faites sont gardées.`))) return;
      await db.del('workouts', id);
      const p = await getPlan();
      for (const k of Object.keys(p.days)) if (p.days[k] === id) p.days[k] = '';
      await savePlan(p);
      onDone();
    });
  });
}

/** État du jour pour le résumé : { icon, label, done }. */
export async function todayStatus() {
  await ensureSeed();
  const { tpls, logs } = await load();
  const plan = await getPlan();
  const today = iso(new Date());
  const active = logs.find((l) => !l.done);
  const doneToday = logs.find((l) => l.done && l.date === today);
  const planned = tpls.find((t) => t.id === plan.days[new Date().getDay()]);
  if (active) return { icon: '⏱', label: `${active.name} en cours`, done: false };
  if (doneToday) return { icon: '✅', label: `${doneToday.name} fait`, done: true };
  if (planned) return { icon: planned.emoji || '💪', label: planned.name, done: false };
  return { icon: '😌', label: 'Jour de repos', done: false };
}

/** Séance du jour (prévue ou faite), pour suggérer des étirements. */
export async function todayFocus() {
  const { tpls, logs } = await load();
  const plan = await getPlan();
  const today = iso(new Date());
  const doneToday = logs.find((l) => l.done && l.date === today);
  const planned = tpls.find((t) => t.id === plan.days[new Date().getDay()]);
  return doneToday || planned || null;
}

/** Carte « Workout du jour » pour la page Aujourd'hui. */
export async function todayCard(el) {
  if (!el) return;
  await ensureSeed();
  const { tpls, logs } = await load();
  const plan = await getPlan();
  const today = iso(new Date());
  const active = logs.find((l) => !l.done);
  const doneToday = logs.find((l) => l.done && l.date === today);
  const planned = tpls.find((t) => t.id === plan.days[new Date().getDay()]);
  el.innerHTML = `<div class="card-head"><h2>💪 Workout du jour</h2><a href="#/workout">Ouvrir →</a></div>
    ${active ? `<p>⏱ <b>${esc(active.emoji)} ${esc(active.name)}</b> en cours</p><a class="btn primary" href="#/workout">Reprendre la séance</a>`
      : doneToday ? `<p>✅ <b>${esc(doneToday.emoji)} ${esc(doneToday.name)}</b> fait aujourd’hui. Bravo !</p>`
        : planned ? `<p><b>${esc(planned.emoji)} ${esc(planned.name)}</b> · ${planned.exercises.length} exercice${planned.exercises.length > 1 ? 's' : ''}</p><a class="btn primary" href="#/workout">▶ Commencer</a>`
          : '<p class="muted">😌 Jour de repos.</p>'}`;
}
