// Workout Planner : séance du jour, horaire de la semaine, modèles de séances et suivi des progrès.
//
// Store « workouts » :
//   modèle : { id, kind: 'tpl', name, emoji, order, exercises: [{ id, name, sets, reps, weight }] }
//   séance faite : { id, kind: 'log', date, tplId, name, emoji, startedAt, finishedAt, done, note,
//                    exercises: [{ name, target, sets: [{ reps, weight, done }] }] }
// Réglages (settings « workoutPlan ») : { days: { 0..6: idModèle }, unit: 'lb' | 'kg', rest: secondes }

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
const fmtDur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };
const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };

/** Dernière performance enregistrée pour un exercice (séances terminées). */
function lastFor(logs, name) {
  const key = name.trim().toLowerCase();
  for (const l of logs) {
    if (!l.done) continue;
    const ex = l.exercises.find((e) => e.name.trim().toLowerCase() === key);
    const sets = ex?.sets.filter((s) => s.done) || [];
    if (sets.length) return { date: l.date, sets };
  }
  return null;
}
const setsText = (sets, unit) => {
  const w = sets.map((s) => num(s.weight)).filter((x) => x !== null);
  const reps = [...new Set(sets.map((s) => s.reps))];
  return `${sets.length}×${reps.length === 1 ? reps[0] : reps.join('/')}${w.length ? ` @ ${Math.max(...w)} ${unit}` : ''}`;
};

async function startLog(tpl) {
  const { logs } = await load();
  const log = {
    id: U.uid(), kind: 'log', date: iso(new Date()), tplId: tpl.id, name: tpl.name, emoji: tpl.emoji,
    startedAt: Date.now(), finishedAt: null, done: false, note: '',
    exercises: tpl.exercises.map((e) => {
      const last = lastFor(logs, e.name);
      const lastW = last ? Math.max(...last.sets.map((s) => num(s.weight) ?? 0)) : null;
      const weight = lastW || e.weight || '';
      return { name: e.name, target: `${e.sets}×${e.reps}`, sets: Array.from({ length: Math.max(1, e.sets) }, () => ({ reps: e.reps, weight, done: false })) };
    }),
  };
  await db.put('workouts', log);
  return log;
}

/* =========================================================
   Page : #/workout, #/workout/plan, #/workout/progres
   ========================================================= */
let tick = null, restEnd = 0;

export async function renderPage(ctx, tab = '') {
  await ensureSeed();
  clearInterval(tick);
  ctx.setCleanup(() => clearInterval(tick));
  const { view } = ctx;
  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Entraînement</p><h1>Workout</h1></div>
      <div class="seg wk-tabs">
        <a href="#/workout" class="${!tab ? 'on' : ''}">Aujourd’hui</a>
        <a href="#/workout/plan" class="${tab === 'plan' ? 'on' : ''}">Programme</a>
        <a href="#/workout/progres" class="${tab === 'progres' ? 'on' : ''}">Progrès</a>
      </div>
    </header>
    <div id="wk-body"></div>`;
  const body = view.querySelector('#wk-body');
  if (tab === 'plan') return renderPlan(ctx, body);
  if (tab === 'progres') return renderProgress(ctx, body);
  return renderToday(ctx, body);
}

/* ---------- Aujourd'hui ---------- */
async function renderToday(ctx, body) {
  const { toast, confirmBox } = ctx;
  const { tpls, logs } = await load();
  const plan = await getPlan();
  const today = iso(new Date());
  const redraw = () => renderToday(ctx, body);
  const active = logs.find((l) => !l.done);
  const doneToday = logs.filter((l) => l.done && l.date === today);
  const planned = tpls.find((t) => t.id === plan.days[new Date().getDay()]);

  if (active) return renderSession(ctx, body, active, logs, plan, redraw);

  const preview = (t) => `<ul class="wk-prev">${t.exercises.map((e) => {
    const last = lastFor(logs, e.name);
    return `<li><span>${esc(e.name)}</span><span class="muted">${e.sets}×${esc(e.reps)}${e.weight ? ` @ ${e.weight} ${plan.unit}` : ''}${last ? ` · dernière fois ${setsText(last.sets, plan.unit)}` : ''}</span></li>`;
  }).join('')}</ul>`;
  const others = tpls.filter((t) => t.id !== planned?.id);

  body.innerHTML = `
    ${doneToday.length ? `<section class="card wk-done">${doneToday.map((l) => `<p>✅ <b>${esc(l.emoji)} ${esc(l.name)}</b> terminé${l.finishedAt ? ` en ${fmtDur(l.finishedAt - l.startedAt)}` : ''} · ${l.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)} séries. Bravo !</p>`).join('')}</section>` : ''}
    ${planned ? `<section class="card wk-planned">
        <div class="card-head"><h2>${esc(planned.emoji)} ${esc(planned.name)}</h2><span class="muted">${U.cap(U.fmtLong(new Date()))}</span></div>
        ${preview(planned)}
        <button class="btn primary wk-start" data-start="${planned.id}">▶ ${doneToday.some((l) => l.tplId === planned.id) ? 'Refaire cette séance' : 'Commencer la séance'}</button>
      </section>`
      : `<section class="card wk-rest"><h2>😌 Jour de repos</h2><p class="muted">Rien de prévu aujourd’hui dans ton programme. Récupère bien, ou choisis une séance ci-dessous.</p></section>`}
    ${others.length ? `<section class="card"><div class="card-head"><h2>Une autre séance ?</h2></div>
      <div class="wk-others">${others.map((t) => `<button class="chip-btn" data-start="${t.id}">${esc(t.emoji)} ${esc(t.name)}</button>`).join('')}</div></section>` : ''}
    ${tpls.some((t) => t.example) ? '<p class="hint muted">Les séances « Haut du corps », « Bas du corps » et « Cardio » sont un exemple : remplace-les par ton programme dans l’onglet Programme.</p>' : ''}`;

  body.querySelectorAll('[data-start]').forEach((b) => (b.onclick = async () => {
    const t = tpls.find((x) => x.id === b.dataset.start);
    if (!t) return;
    await startLog(t);
    toast(`${t.emoji} C’est parti !`);
    redraw();
  }));
  void confirmBox;
}

/* ---------- Séance en cours ---------- */
async function renderSession(ctx, body, log, logs, plan, redraw) {
  const { toast, confirmBox } = ctx;
  const save = U.debounce(() => db.put('workouts', log), 400);
  ctx.setCleanup(async () => { clearInterval(tick); await save.flush(); });
  const totalSets = () => log.exercises.reduce((n, e) => n + e.sets.length, 0);
  const doneSets = () => log.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);

  const draw = () => {
    body.innerHTML = `
      <section class="card wk-live">
        <div class="wk-live-head">
          <div><p class="eyebrow">Séance en cours</p><h2>${esc(log.emoji)} ${esc(log.name)}</h2></div>
          <div class="wk-clock"><b id="wk-elapsed">${clock(Date.now() - log.startedAt)}</b><small class="muted"><span id="wk-count">${doneSets()}/${totalSets()}</span> séries</small></div>
        </div>
        <div class="bar"><i id="wk-bar" style="width:${Math.round((doneSets() / Math.max(1, totalSets())) * 100)}%"></i></div>
        <div class="wk-rest-timer" id="wk-rest" hidden></div>
      </section>
      ${log.exercises.map((e, ei) => {
        const last = lastFor(logs, e.name);
        return `<section class="card wk-ex" data-ei="${ei}">
          <div class="card-head"><h3>${esc(e.name)}</h3><span class="muted">${esc(e.target)}</span></div>
          ${last ? `<p class="wk-last muted">Dernière fois (${U.fmtShort(U.parseISO(last.date))}) : ${setsText(last.sets, plan.unit)}</p>` : ''}
          <div class="wk-sets">
            <div class="wk-set wk-set-h muted"><span>Série</span><span>Reps</span><span>${plan.unit}</span><span>Fait</span></div>
            ${e.sets.map((s, si) => `<div class="wk-set ${s.done ? 'done' : ''}" data-si="${si}">
              <span class="wk-n">${si + 1}</span>
              <input value="${esc(s.reps)}" data-f="reps" inputmode="text" aria-label="Répétitions, série ${si + 1}">
              <input value="${esc(s.weight)}" data-f="weight" inputmode="decimal" aria-label="Charge, série ${si + 1}" placeholder="—">
              <label class="wk-check"><input type="checkbox" ${s.done ? 'checked' : ''} aria-label="Série ${si + 1} faite"></label>
            </div>`).join('')}
          </div>
          <div class="wk-ex-actions"><button class="btn" data-addset>+ Série</button>${e.sets.length > 1 ? '<button class="btn" data-rmset>− Série</button>' : ''}</div>
        </section>`;
      }).join('')}
      <section class="card">
        <form class="add-row" id="wk-addex"><input name="n" placeholder="Ajouter un exercice à cette séance…" autocomplete="off"><button class="btn icon" aria-label="Ajouter">+</button></form>
        <textarea id="wk-note" placeholder="Note sur la séance (énergie, douleur, record…)" rows="2">${esc(log.note || '')}</textarea>
        <div class="modal-actions"><button class="btn danger" id="wk-cancel">Annuler la séance</button><button class="btn primary" id="wk-finish">🏁 Terminer la séance</button></div>
      </section>`;

    body.querySelectorAll('.wk-ex').forEach((sec) => {
      const e = log.exercises[Number(sec.dataset.ei)];
      sec.querySelectorAll('.wk-set[data-si]').forEach((row) => {
        const s = e.sets[Number(row.dataset.si)];
        row.querySelectorAll('input[data-f]').forEach((inp) => (inp.oninput = () => { s[inp.dataset.f] = inp.value; save(); }));
        row.querySelector('input[type=checkbox]').onchange = (ev) => {
          s.done = ev.target.checked;
          row.classList.toggle('done', s.done);
          save();
          updateHead();
          if (s.done) startRest();
        };
      });
      sec.querySelector('[data-addset]').onclick = () => { const p = e.sets[e.sets.length - 1] || { reps: '10', weight: '' }; e.sets.push({ reps: p.reps, weight: p.weight, done: false }); save(); draw(); };
      sec.querySelector('[data-rmset]')?.addEventListener('click', () => { e.sets.pop(); save(); draw(); });
    });
    body.querySelector('#wk-addex').onsubmit = (ev) => {
      ev.preventDefault();
      const n = ev.target.n.value.trim();
      if (!n) return;
      log.exercises.push({ name: n, target: '3×10', sets: [0, 1, 2].map(() => ({ reps: '10', weight: '', done: false })) });
      save();
      draw();
    };
    body.querySelector('#wk-note').oninput = (ev) => { log.note = ev.target.value; save(); };
    body.querySelector('#wk-cancel').onclick = async () => {
      if (!(await confirmBox('Annuler cette séance ? Les séries notées seront perdues.', 'Annuler la séance'))) return;
      save.flush();
      await db.del('workouts', log.id);
      redraw();
    };
    body.querySelector('#wk-finish').onclick = async () => {
      if (!doneSets() && !(await confirmBox('Aucune série cochée. Terminer quand même ?', 'Terminer'))) return;
      log.done = true;
      log.finishedAt = Date.now();
      await save.flush();
      await db.put('workouts', log);
      await game.award('workout:' + log.id, game.XP.workout, `Entraînement : ${log.name}`);
      restEnd = 0;
      toast(`🏁 Séance terminée en ${fmtDur(log.finishedAt - log.startedAt)} !`);
      redraw();
    };
  };

  const updateHead = () => {
    const c = body.querySelector('#wk-count'), b = body.querySelector('#wk-bar');
    if (c) c.textContent = `${doneSets()}/${totalSets()}`;
    if (b) b.style.width = Math.round((doneSets() / Math.max(1, totalSets())) * 100) + '%';
  };
  const startRest = () => { restEnd = Date.now() + (plan.rest || 90) * 1000; drawRest(); };
  const drawRest = () => {
    const el = body.querySelector('#wk-rest');
    if (!el) return;
    const left = restEnd - Date.now();
    if (!restEnd || left <= -3000) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = left > 0 ? `⏱ Repos <b>${clock(left)}</b> <button class="btn sm-text" data-skip>Passer</button>` : '💥 Repos terminé : série suivante !';
    el.querySelector('[data-skip]')?.addEventListener('click', () => { restEnd = 0; drawRest(); });
  };
  let rang = false;
  draw();
  tick = setInterval(() => {
    const el = body.querySelector('#wk-elapsed');
    if (!el) { clearInterval(tick); return; }
    el.textContent = clock(Date.now() - log.startedAt);
    if (restEnd && Date.now() >= restEnd && !rang) { rang = true; chime(); }
    if (restEnd && Date.now() < restEnd) rang = false;
    drawRest();
  }, 1000);
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
          <label>Repos entre les séries <select id="wk-restsel">${[45, 60, 90, 120, 180].map((s) => `<option value="${s}" ${plan.rest === s ? 'selected' : ''}>${s < 60 ? s + ' s' : s / 60 + ' min'}</option>`).join('')}</select></label>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>🏋️ Mes séances</h2><button class="btn" id="wk-newtpl">+ Nouvelle séance</button></div>
        <div class="wk-tpls">${tpls.map((t) => `<button class="wk-tpl" data-tpl="${t.id}">
          <b>${esc(t.emoji)} ${esc(t.name)}</b>${t.example ? ' <span class="chip">exemple</span>' : ''}
          <span class="muted">${t.exercises.map((e) => esc(e.name)).join(' · ') || 'Aucun exercice'}</span></button>`).join('') || '<p class="empty-sm">Aucune séance.</p>'}</div>
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
}

async function tplEditor(ctx, id, onDone) {
  const { modal, toast, confirmBox } = ctx;
  const plan = await getPlan();
  const t = id ? await db.get('workouts', id) : { name: '', emoji: '💪', exercises: [] };
  const exs = t.exercises.map((e) => ({ ...e }));
  if (!exs.length) exs.push({ id: U.uid(), name: '', sets: 3, reps: '10', weight: '' });
  modal(`<h2>${id ? 'Modifier la séance' : 'Nouvelle séance'}</h2>
    <form id="tp-form" class="hb-form">
      <div class="hb-row"><input name="emoji" value="${esc(t.emoji)}" maxlength="4" class="hb-emo-in" aria-label="Emoji">
        <input name="name" value="${esc(t.name)}" placeholder="Ex. Push, Jambes, HIIT…" required autocomplete="off"></div>
      <div class="tp-head muted"><span>Exercice</span><span>Séries</span><span>Reps</span><span>${plan.unit}</span><span></span></div>
      <div id="tp-exs"></div>
      <button type="button" class="btn" id="tp-add">+ Exercice</button>
      <div class="modal-actions">${id ? '<button type="button" class="btn danger" id="tp-del">Supprimer</button>' : ''}
        <button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div>
    </form>`, (m, close) => {
    m.classList.add('tp-modal');
    const drawEx = () => {
      m.querySelector('#tp-exs').innerHTML = exs.map((e, i) => `<div class="tp-row" data-i="${i}">
        <input data-f="name" value="${esc(e.name)}" placeholder="Ex. Squat" aria-label="Exercice ${i + 1}">
        <input data-f="sets" type="number" min="1" max="20" value="${e.sets}" aria-label="Séries">
        <input data-f="reps" value="${esc(e.reps)}" aria-label="Répétitions" placeholder="10">
        <input data-f="weight" value="${esc(e.weight)}" inputmode="decimal" aria-label="Charge" placeholder="—">
        <span class="tp-tools"><button type="button" class="btn sm" data-up ${i ? '' : 'disabled'} aria-label="Monter">↑</button><button type="button" class="btn sm" data-rm aria-label="Retirer">×</button></span>
      </div>`).join('');
      m.querySelectorAll('.tp-row').forEach((row) => {
        const e = exs[Number(row.dataset.i)];
        row.querySelectorAll('input').forEach((inp) => (inp.oninput = () => { e[inp.dataset.f] = inp.dataset.f === 'sets' ? Math.max(1, Number(inp.value) || 1) : inp.value; }));
        row.querySelector('[data-rm]').onclick = () => { exs.splice(Number(row.dataset.i), 1); drawEx(); };
        row.querySelector('[data-up]').onclick = () => { const i = Number(row.dataset.i); [exs[i - 1], exs[i]] = [exs[i], exs[i - 1]]; drawEx(); };
      });
    };
    drawEx();
    m.querySelector('#tp-add').onclick = () => { exs.push({ id: U.uid(), name: '', sets: 3, reps: '10', weight: '' }); drawEx(); m.querySelector('.tp-row:last-child input')?.focus(); };
    m.querySelector('#tp-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const all = (await load()).tpls;
      const rec = {
        ...(id ? t : { id: U.uid(), kind: 'tpl', order: all.length ? Math.max(...all.map((x) => x.order ?? 0)) + 1 : 0 }),
        name: f.name.value.trim(), emoji: f.emoji.value.trim() || '💪', example: false,
        exercises: exs.filter((e) => e.name.trim()).map((e) => ({ ...e, name: e.name.trim(), weight: num(e.weight) ?? '' })),
      };
      await db.put('workouts', rec);
      close();
      toast(id ? 'Séance modifiée' : `${rec.emoji} Séance créée : ajoute-la à un jour de ta semaine`);
      onDone();
    };
    m.querySelector('#tp-del')?.addEventListener('click', async () => {
      close();
      if (!(await confirmBox(`Supprimer la séance « ${t.name} » ? Tes entraînements déjà faits sont gardés.`))) return;
      await db.del('workouts', id);
      const p = await getPlan();
      for (const k of Object.keys(p.days)) if (p.days[k] === id) p.days[k] = '';
      await savePlan(p);
      onDone();
    });
  });
}

/* ---------- Progrès ---------- */
async function renderProgress(ctx, body) {
  const { tpls, logs } = await load();
  const plan = await getPlan();
  const done = logs.filter((l) => l.done);
  const wk0 = U.startOfWeek(new Date());
  const plannedPerWeek = Object.values(plan.days).filter((id) => id && tpls.some((t) => t.id === id)).length;
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const from = U.addDays(wk0, -7 * (7 - i)), to = U.addDays(from, 7);
    const n = done.filter((l) => l.startedAt >= from.getTime() && l.startedAt < to.getTime()).length;
    return { from, n };
  });
  const thisWeek = weeks[7].n;
  const maxN = Math.max(plannedPerWeek, ...weeks.map((w) => w.n), 1);
  let wkStreak = 0;
  for (let i = 6; i >= 0; i--) { if (weeks[i].n >= Math.max(1, plannedPerWeek)) wkStreak++; else break; }
  if (thisWeek >= Math.max(1, plannedPerWeek)) wkStreak++;
  const month = done.filter((l) => U.iso(l.startedAt).slice(0, 7) === U.iso(new Date()).slice(0, 7));
  const monthMin = month.reduce((n, l) => n + (l.finishedAt ? Math.round((l.finishedAt - l.startedAt) / 60000) : 0), 0);

  // Progression par exercice : charge max de chaque séance (de la plus ancienne à la plus récente)
  const byEx = new Map();
  for (const l of [...done].reverse()) {
    for (const e of l.exercises) {
      const sets = e.sets.filter((s) => s.done);
      if (!sets.length) continue;
      const w = Math.max(...sets.map((s) => num(s.weight) ?? 0));
      const k = e.name.trim();
      if (!byEx.has(k)) byEx.set(k, []);
      byEx.get(k).push({ date: l.date, w, sets: sets.length });
    }
  }
  const spark = (pts) => {
    if (pts.length < 2) return '';
    const ws = pts.map((p) => p.w), lo = Math.min(...ws), hi = Math.max(...ws), span = hi - lo || 1;
    const xy = pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${28 - ((p.w - lo) / span) * 24}`).join(' ');
    return `<svg class="wk-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${xy}"/></svg>`;
  };
  const rows = [...byEx.entries()].sort((a, b) => b[1].length - a[1].length);

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
    <section class="card">
      <div class="card-head"><h2>📈 Progression par exercice</h2></div>
      ${rows.length ? `<div class="wk-table">${rows.map(([name, pts]) => {
        const first = pts[0].w, last = pts[pts.length - 1].w, best = Math.max(...pts.map((p) => p.w)), diff = last - first;
        return `<div class="wk-row"><div><b>${esc(name)}</b><small class="muted">${pts.length} séance${pts.length > 1 ? 's' : ''}</small></div>
          ${spark(pts)}
          <div class="wk-nums">${best ? `<span>Record <b>${best} ${plan.unit}</b></span><span>Dernière <b>${last} ${plan.unit}</b></span>${pts.length > 1 && diff ? `<span class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)} ${plan.unit}</span>` : ''}` : '<span class="muted">sans charge</span>'}</div></div>`;
      }).join('')}</div>` : '<p class="empty-sm">Termine une première séance pour voir ta progression.</p>'}
    </section>
    <section class="card">
      <div class="card-head"><h2>🗓 Historique</h2></div>
      <ul class="wk-hist">${done.slice(0, 20).map((l) => `<li><span>${esc(l.emoji)} <b>${esc(l.name)}</b></span>
        <span class="muted">${U.cap(U.fmtShort(U.parseISO(l.date)))}${l.finishedAt ? ` · ${fmtDur(l.finishedAt - l.startedAt)}` : ''} · ${l.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)} séries</span>
        ${l.note ? `<small class="muted wk-hnote">${esc(l.note)}</small>` : ''}</li>`).join('') || '<li class="empty-sm">Aucune séance terminée pour l’instant.</li>'}</ul>
    </section>`;
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
