import { db, STORES, onDbChange } from './db.js';
import * as U from './util.js';
import * as gcal from './gcal.js';
import { InkEditor, INK_COLORS, HL_COLORS } from './ink.js';
import * as game from './game.js';
import * as AV from './avatar.js';
import { taskHTML, bindTaskList, addTask, loadGoals, missionsOf, setTaskGoal, setTaskProject, openTaskEditor } from './tasks.js';
import * as brain from './brain.js';
import * as quotes from './quotes.js';
import * as assistant from './assistant.js';
import * as alarms from './alarms.js';
import * as launcher from './launcher.js';
import * as timer from './timer.js';
import * as sync from './sync.js';
import * as clips from './clips.js';
import * as habits from './habits.js';
import * as rbq from './rbq.js';
import * as workout from './workout.js';
import * as images from './images.js';
import * as missions from './missions.js';
import * as docs from './docs.js';
import * as assoc from './assoc.js';
import * as news from './news.js';
import * as reminders from './reminders.js';

const { esc, iso, cap } = U;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const view = $('#view');
let cleanup = null;

const MOODS = [
  { v: 1, e: '😞', l: 'Difficile' }, { v: 2, e: '😕', l: 'Bof' }, { v: 3, e: '😐', l: 'Neutre' },
  { v: 4, e: '🙂', l: 'Bien' }, { v: 5, e: '😄', l: 'Super' },
];
const HORIZONS = [['semaine', 'Cette semaine'], ['mois', 'Ce mois-ci'], ['annee', 'Cette année'], ['vie', 'Long terme']];
const HZ_LABEL = { ...Object.fromEntries(HORIZONS), '': 'Sans échéance' };
const hzOptions = (current) => [...HORIZONS, ['', 'Sans échéance']]
  .map(([v, l]) => `<option value="${v}" ${v === (current ?? '') ? 'selected' : ''}>${l}</option>`).join('');
const BGS = [['lines', 'Lignes'], ['grid', 'Carreaux'], ['dots', 'Points'], ['blank', 'Vierge']];

/* =========================================================
   Outils d'interface
   ========================================================= */
let toastTimer;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), 3500);
}

function modal(html, onMount) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.querySelector('.modal-back').addEventListener('pointerdown', (e) => { if (e.target.classList.contains('modal-back')) close(); });
  $$('[data-close]', root).forEach((b) => (b.onclick = close));
  onMount?.(root.querySelector('.modal'), close);
  root.querySelector('[autofocus]')?.focus();
  return close;
}

function confirmBox(message, okLabel = 'Supprimer') {
  return new Promise((resolve) => {
    let done = false;
    const close = modal(`<h2>Confirmer</h2><p>${esc(message)}</p>
      <div class="modal-actions"><button class="btn" id="cb-no">Annuler</button><button class="btn primary" id="cb-ok">${esc(okLabel)}</button></div>`, (m) => {
      m.querySelector('#cb-no').onclick = () => { done = true; close(); resolve(false); };
      m.querySelector('#cb-ok').onclick = () => { done = true; close(); resolve(true); };
    });
    // fermeture par clic extérieur / Échap = annuler
    const obs = new MutationObserver(() => { if (!$('#modal-root').children.length) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe($('#modal-root'), { childList: true });
  });
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
}

function gError(err) {
  if (err.message === 'NO_CLIENT_ID') { toast('Configure d’abord Google Agenda dans Réglages'); location.hash = '#/settings'; }
  else if (err.message === 'NOT_CONNECTED') toast('Connexion Google expirée — clique « Connecter Google Agenda »');
  else toast('Google : ' + err.message, 'err');
}

// Bouton « Connecter Google Agenda » utilisable partout
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-gconnect]');
  if (!b) return;
  e.preventDefault();
  gcal.connect().then(() => { toast('Google Agenda connecté ✓'); router(); }).catch(gError);
});

/* =========================================================
   Routeur
   ========================================================= */
const routes = {
  today: renderToday, week: renderWeek, journal: renderJournal, notebook: renderNotebook,
  page: renderPage, goals: renderGoals, settings: renderSettings, hero: renderHero,
  brain: renderBrain, note: renderNote, launcher: renderLauncher, setup: renderSetup,
  // Les habitudes sont dans la page du héros : #/habits y mène directement
  habits: async () => { await renderHero(); $('#hero-habits')?.scrollIntoView({ block: 'start' }); },
  missions: () => missions.renderPage(pageCtx()),
  month: renderMonth, year: renderYear,
  news: () => news.renderPage(pageCtx()),
  rbq: (id) => rbq.renderPage(pageCtx(), id),
  workout: (tab) => workout.renderPage(pageCtx(), tab),
};
const NAV_PARENT = { page: 'notebook', note: 'brain', setup: 'settings', habits: 'hero', month: 'week', year: 'week', journal: 'week' };
// Outils d'interface passés aux modules des onglets Habitudes, Cours RBQ et Workout
const pageCtx = () => ({ view, modal, toast, confirmBox, setCleanup: (fn) => { cleanup = fn; } });

async function router() {
  if (cleanup) { try { await cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  const [name, arg] = (location.hash.replace(/^#\/?/, '') || 'today').split('/');
  const fn = routes[name] || renderToday;
  const navName = NAV_PARENT[name] || (routes[name] ? name : 'today');
  $$('#rail a').forEach((a) => a.classList.toggle('active', a.dataset.route === navName));
  $('#brand-launch')?.classList.toggle('active', name === 'launcher');
  $('#brand-logo')?.classList.toggle('active', navName === 'today');
  // Sur cellulaire, « Plus » s'allume quand la page ouverte est dans son menu
  $('#rail-more')?.classList.toggle('active', !!$('#rail a.active.nav-extra, #rail a.active[data-route="settings"], #rail a.active[data-route="hero"], #rail .brand-ico.active'));
  document.body.classList.toggle('ink-mode', name === 'page');
  $('#modal-root').innerHTML = '';
  view.scrollTop = 0;
  try {
    await fn(arg ? decodeURIComponent(arg) : undefined);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="empty">Oups : ${esc(err.message)}</div>`;
  }
}
window.addEventListener('hashchange', router);

/* =========================================================
   Événements Google
   ========================================================= */
async function getEvents(from, to) {
  // Les rappels créés par Life Planner (alarmes, habitudes) sont déjà dans l'app : on ne les montre pas en double
  const own = (list) => list.filter((e) => !e.lp);
  try {
    return { events: own(await gcal.listEvents(from, to)), source: 'live' };
  } catch (err) {
    const events = own(await gcal.cachedEvents(from, to));
    if (err.message !== 'NOT_CONNECTED') console.warn(err);
    return { events, source: err.message === 'NOT_CONNECTED' ? 'off' : 'cache', error: err };
  }
}

async function syncBadge(source) {
  if (source === 'live') return `<span class="sync live">Google Agenda synchronisé</span>`;
  if (source === 'cache') return `<span class="sync cache">Hors ligne — copie locale</span>`;
  const hasId = await db.get('settings', 'clientId');
  return hasId
    ? `<button class="link" data-gconnect>Connecter Google Agenda</button>`
    : `<a class="link" href="#/settings">Configurer Google Agenda</a>`;
}

function evItem(ev, compact = false) {
  const time = ev.allDay ? 'Journée' : U.fmtTime(new Date(ev.start));
  const past = !ev.allDay && ev.end < Date.now();
  return `<li class="ev ${past ? 'past' : ''}" data-ev="${esc(ev.id)}" style="--c:${esc(ev.color)}">
    <span class="ev-time">${time}${!compact && !ev.allDay ? ' – ' + U.fmtTime(new Date(ev.end)) : ''}</span>
    <span class="ev-title">${esc(ev.title)}</span></li>`;
}

function bindEvents(root, events, refresh) {
  $$('[data-ev]', root).forEach((li) => {
    li.onclick = () => {
      const ev = events.find((x) => x.id === li.dataset.ev);
      if (ev) eventDetails(ev, refresh);
    };
  });
}

function eventDetails(ev, refresh) {
  const when = ev.allDay
    ? cap(U.fmtLong(new Date(ev.start))) + ' · toute la journée'
    : `${cap(U.fmtLong(new Date(ev.start)))} · ${U.fmtTime(new Date(ev.start))} – ${U.fmtTime(new Date(ev.end))}`;
  modal(`<h2>${esc(ev.title)}</h2>
    <p class="muted" style="margin-top:-8px">${esc(when)}<br>${esc(ev.calName || '')}</p>
    ${ev.location ? `<p>📍 ${esc(ev.location)}</p>` : ''}
    ${ev.description ? `<p style="white-space:pre-wrap">${esc(ev.description)}</p>` : ''}
    <div class="modal-actions">
      <button class="btn danger" id="ev-del">Supprimer</button>
      ${ev.link ? `<a class="btn" href="${esc(ev.link)}" target="_blank" rel="noopener">Ouvrir dans Google</a>` : ''}
      <button class="btn primary" data-close>Fermer</button>
    </div>`, (m, close) => {
    m.querySelector('#ev-del').onclick = async () => {
      close();
      if (!(await confirmBox(`Supprimer « ${ev.title} » de Google Agenda ?`))) return;
      try { await gcal.deleteEvent(ev); toast('Événement supprimé'); refresh?.(); } catch (err) { gError(err); }
    };
  });
}

function eventModal(dateStr, onDone) {
  modal(`<h2>Nouvel événement</h2>
    <form class="form" id="evf">
      <label>Titre<input name="title" required autofocus autocomplete="off"></label>
      <div class="row">
        <label>Date<input type="date" name="date" value="${dateStr}" required></label>
        <label class="check"><input type="checkbox" name="allDay"> Toute la journée</label>
      </div>
      <div class="row times">
        <label>Début<input type="time" name="start" value="09:00"></label>
        <label>Fin<input type="time" name="end" value="10:00"></label>
      </div>
      <label>Notes<textarea name="description" rows="2"></textarea></label>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Annuler</button>
        <button class="btn primary">Ajouter à Google Agenda</button>
      </div>
    </form>`, (m, close) => {
    const f = m.querySelector('form');
    f.allDay.onchange = () => (m.querySelector('.times').hidden = f.allDay.checked);
    f.start.onchange = () => {
      const [h, mi] = f.start.value.split(':').map(Number);
      f.end.value = `${U.pad(Math.min(h + 1, 23))}:${U.pad(mi)}`;
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const btn = f.querySelector('.primary');
      btn.disabled = true;
      try {
        await gcal.createEvent({
          title: f.title.value.trim(), date: f.date.value, allDay: f.allDay.checked,
          start: f.start.value, end: f.end.value, description: f.description.value.trim(),
        });
        close();
        toast('Ajouté à Google Agenda ✓');
        onDone?.();
      } catch (err) { btn.disabled = false; gError(err); }
    };
  });
}

/* =========================================================
   Missions (stockées dans « tasks »)
   ========================================================= */
async function taskCard(el, date) {
  const draw = async () => {
    await loadGoals();
    const all = await db.all('tasks');
    const items = all
      .filter((t) => t.date === date || (!t.done && t.date && t.date < date))
      .sort((a, b) => a.done - b.done || a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    const done = items.filter((t) => t.done).length;
    el.innerHTML = `<div class="card-head"><h2>📋 Missions du jour</h2><span class="muted">${done}/${items.length} · <a href="#/missions">Gérer →</a></span></div>
      <form class="add-row"><input name="t" placeholder="Ajouter une mission…" autocomplete="off"><button class="btn icon" aria-label="Ajouter">+</button></form>
      <ul class="tasks">${items.map((t) => taskHTML(t, date)).join('') || '<li class="empty-sm">Rien de prévu pour l’instant.</li>'}</ul>
      <p class="hint muted">Astuce : touche › sur une mission pour l’ouvrir : étapes, notes, date et objectif.</p>`;
    el.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const v = e.target.t.value.trim();
      if (!v) return;
      await addTask(v, date);
      await draw();
      el.querySelector('input[name=t]').focus();
    };
    bindTaskList(el, draw);
  };
  await draw();
}

/* =========================================================
   Vue : Aujourd'hui
   ========================================================= */
async function renderToday() {
  const now = new Date();
  const today = iso(now);
  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">${greeting()}</p><h1>${cap(U.fmtLong(now))}</h1></div>
      <div class="head-actions">
        <button class="btn" id="add-ev">+ Événement</button>
        <a class="btn primary" href="#/page/day-${today}">✎ Écrire à la main</a>
      </div>
    </header>
    <div class="today">
      <section class="card today-summary" id="c-hero"></section>
      <section class="card capture-card" id="c-brain"></section>
      <section class="card assist" id="c-assist"></section>
      <div class="today-cols">
        <div class="today-col col-main">
          <section class="card t-tasks" id="c-tasks"></section>
          <section class="card t-agenda" id="c-agenda"><div class="skeleton"></div></section>
          <section class="card t-goals" id="c-goals"></section>
        </div>
        <div class="today-col col-side">
          <section class="card t-habits" id="c-habits"></section>
          <section class="card t-workout" id="c-workout"></section>
          <section class="card t-rbq" id="c-rbq" hidden></section>
          <section class="card t-journal" id="c-journal"></section>
          <section class="card t-news" id="c-news"></section>
          <section class="card t-ink" id="c-ink"></section>
          <section class="card quote-card t-quote" id="c-quote"></section>
        </div>
      </div>
    </div>`;
  $('#add-ev').onclick = () => eventModal(today, renderToday);
  // Le résumé du haut suit les cases cochées (missions, habitudes…)
  const refreshSummary = U.debounce(() => heroCard(), 500);
  $('.today-cols', view).addEventListener('click', () => refreshSummary());

  // Agenda
  const agenda = async () => {
    const day = agendaDay; // 0 = aujourd'hui, 1 = demain
    const from = U.addDays(U.startOfDay(now), day), to = U.addDays(from, 1);
    const { events, source } = await getEvents(from, to);
    const el = $('#c-agenda');
    if (!el || day !== agendaDay) return;
    el.innerHTML = `<div class="card-head"><h2>📅 Agenda</h2>
        <div class="seg seg-sm" role="group" aria-label="Jour affiché">
          <button class="${day ? '' : 'on'}" data-aday="0" aria-pressed="${!day}">Aujourd’hui</button>
          <button class="${day ? 'on' : ''}" data-aday="1" aria-pressed="${!!day}">Demain</button>
        </div></div>
      ${day ? `<p class="ag-day muted">${cap(U.fmtLong(from))}</p>` : ''}
      <ul class="evs">${events.map((e) => evItem(e)).join('') || `<li class="empty-sm">Aucun événement ${day ? 'demain' : 'aujourd’hui'}.</li>`}</ul>
      <div class="ag-foot">${await syncBadge(source)}<button class="btn sm-text" id="ag-add">+ Événement ${day ? 'demain' : ''}</button></div>`;
    $$('[data-aday]', el).forEach((b) => (b.onclick = () => { agendaDay = Number(b.dataset.aday); agenda(); }));
    $('#ag-add', el).onclick = () => eventModal(iso(from), agenda);
    bindEvents(el, events, agenda);
  };

  // Journal rapide
  const journal = async () => {
    const e = (await db.get('journal', today)) || { date: today };
    const el = $('#c-journal');
    el.innerHTML = `<div class="card-head"><h2>🙂 Humeur et intention</h2><a href="#/journal/${today}">Journal →</a></div>
      <div class="moods" style="margin-bottom:14px">${MOODS.map((m) => `<button class="mood ${e.mood === m.v ? 'on' : ''}" data-mood="${m.v}" title="${m.l}">${m.e}</button>`).join('')}</div>
      <div class="field"><h3>Intention du jour</h3><textarea data-f="intention" placeholder="Qu’est-ce qui rendrait cette journée réussie ?">${esc(e.intention || '')}</textarea></div>`;
    const save = U.debounce(async () => { e.updatedAt = Date.now(); await db.put('journal', e); game.checkJournal(e); }, 500);
    $$('[data-mood]', el).forEach((b) => (b.onclick = () => {
      e.mood = Number(b.dataset.mood);
      $$('[data-mood]', el).forEach((x) => x.classList.toggle('on', x === b));
      save();
    }));
    el.querySelector('textarea').oninput = (ev) => { e.intention = ev.target.value; save(); };
    cleanup = () => save.flush();
  };

  // Page manuscrite du jour
  const ink = async () => {
    const meta = await db.get('pages', 'day-' + today);
    $('#c-ink').innerHTML = `<div class="card-head"><h2>✒️ Page manuscrite</h2></div>
      <a class="ink-link" href="#/page/day-${today}">
        <div class="thumb" style="${meta?.thumb ? `background-image:url(${meta.thumb})` : ''}"></div>
        <div><strong>${meta ? 'Continuer à écrire' : 'Commencer à écrire'}</strong><br>
        <span class="muted">Prends ton Surface Pen et écris librement.</span></div>
      </a>`;
  };

  // Objectifs
  const goals = async () => {
    const list = (await db.all('goals')).filter((g) => (g.horizon === 'semaine' || g.horizon === 'mois') && g.progress < 100)
      .sort((a, b) => (a.horizon === 'semaine' ? 0 : 1) - (b.horizon === 'semaine' ? 0 : 1) || b.progress - a.progress).slice(0, 5);
    $('#c-goals').innerHTML = `<div class="card-head"><h2>🎯 Objectifs en cours</h2><a href="#/goals">Tout voir →</a></div>
      ${list.map((g) => `<div class="goal mini"><span class="title">${esc(g.title)} <small class="muted">· ${esc(HZ_LABEL[g.horizon])}</small></span><span class="pct">${g.progress}%</span><div class="bar"><i style="width:${g.progress}%"></i></div></div>`).join('')
      || '<p class="empty-sm">Aucun objectif en cours pour la semaine ou le mois. <a href="#/goals">En ajouter</a></p>'}`;
  };

  // Second cerveau : capture rapide
  const brainCard = async () => {
    const el = $('#c-brain');
    if (!el) return;
    const all = (await brain.allNotes()).filter((n) => !n.archived);
    const inbox = all.filter((n) => n.inbox).length;
    const stats = `${all.length} note${all.length > 1 ? 's' : ''}${inbox ? ` · <a href="#/brain" id="to-inbox">📥 ${inbox} à classer</a>` : ''} · <a href="#/brain">Ouvrir le Cerveau →</a>`;
    // Déjà affichée : on ne met à jour que les chiffres (pour ne pas effacer un texte ou une image en cours)
    if ($('#cap-today', el)) { $('.cap-stats', el).innerHTML = stats; }
    else {
      el.innerHTML = `<div class="card-head"><h2>💡 Capture rapide</h2><span class="muted cap-stats">${stats}</span></div>${captureForm('cap-today')}`;
      bindCapture($('#cap-today'), brainCard);
    }
    $('#to-inbox')?.addEventListener('click', () => { brainState.f = 'inbox'; });
  };

  // Après une action de l'assistant : on rafraîchit les cartes concernées (sans toucher à la conversation)
  const lifeCards = () => Promise.all([habits.todayCard($('#c-habits')), workout.todayCard($('#c-workout')), rbq.todayCard($('#c-rbq'))]);
  refreshToday = () => Promise.all([taskCard($('#c-tasks'), today), lifeCards(), journal(), goals(), heroCard(), brainCard()]);

  news.todayCard($('#c-news')); // en parallèle (réseau) : ne retarde pas le reste de la page
  await Promise.all([taskCard($('#c-tasks'), today), lifeCards(), journal(), ink(), goals(), heroCard(), brainCard(), quoteCard(), assistCard()]);
  agenda();
}

/* =========================================================
   Citation du moment (motivation, inspiration, verset)
   ========================================================= */
let refreshToday = () => {};
let agendaDay = 0; // carte Agenda de la page Aujourd'hui : 0 = aujourd'hui, 1 = demain
let quoteTimer = null;
const QUOTE_EVERY = [[1, 'Toutes les minutes'], [2, 'Toutes les 2 minutes'], [5, 'Toutes les 5 minutes'], [15, 'Toutes les 15 minutes'], [0, 'Seulement avec « Suivante »']];

async function quoteCard() {
  const el = $('#c-quote');
  if (!el) return;
  const mode = (await db.get('settings', 'quoteMode')) || 'random';
  const every = (await db.get('settings', 'quoteEvery')) ?? 2;
  let current = null;
  // Une citation déjà sauvegardée = une note « citation » du Cerveau qui contient son texte
  const savedNote = async (q) => (await brain.allNotes()).find((x) => x.type === 'citation' && (x.body || '').includes(q.text));
  const drawSave = async () => {
    const b = $('#q-save', el);
    if (!b || !current) return;
    const n = await savedNote(current);
    b.dataset.note = n?.id || '';
    b.textContent = n ? '✓' : '💾';
    b.title = n ? 'Déjà dans le Cerveau — ouvrir la note' : 'Sauvegarder dans le Cerveau (type Citation)';
    b.setAttribute('aria-label', b.title);
    b.classList.toggle('saved', !!n);
  };
  // Historique des citations vues : ‹ revient en arrière, › avance (ou en tire une nouvelle)
  const hist = [];
  let idx = -1;
  const show = (anim = true, dir = 1) => {
    if (dir < 0 && idx > 0) idx--;
    else if (dir > 0 && idx < hist.length - 1) idx++;
    else if (dir > 0) {
      hist.push(quotes.pick(mode));
      if (hist.length > 50) hist.shift();
      idx = hist.length - 1;
    }
    const q = hist[idx];
    current = q;
    const prev = $('#q-prev', el);
    if (prev) prev.disabled = idx <= 0;
    const c = quotes.CATS[q.cat];
    const body = $('#q-body', el);
    const html = `<span class="q-cat">${c.icon} ${c.name}</span>
      <blockquote lang="en">“${esc(q.text)}”</blockquote><cite lang="en">— ${esc(q.src)}</cite>`;
    drawSave();
    if (!anim || !body) { if (body) body.innerHTML = html; return; }
    body.classList.add('fade');
    setTimeout(() => { body.innerHTML = html; body.classList.remove('fade'); }, 250);
  };
  el.innerHTML = `<div id="q-body" class="q-body"></div>
    <div class="q-actions">
      <button class="q-arrow" id="q-prev" aria-label="Citation précédente" title="Précédente" disabled>‹</button>
      <button class="q-arrow" id="q-next" aria-label="Citation suivante" title="Suivante">›</button>
      <button class="q-opt q-save" id="q-save" aria-label="Sauvegarder dans le Cerveau" title="Sauvegarder dans le Cerveau (type Citation)">💾</button>
      <button class="q-opt" id="q-opt" aria-label="Options des citations" title="Options des citations" aria-expanded="false">⋯</button>
    </div>
    <div class="q-menu" id="q-menu" hidden>
      <b>Type de citation</b>
      ${[['random', '🎲 Au hasard (les 3)'], ...Object.entries(quotes.CATS).map(([k, c]) => [k, `${c.icon} ${c.name} seulement`])]
        .map(([v, l]) => `<label><input type="radio" name="qmode" value="${v}" ${v === mode ? 'checked' : ''}> ${l}</label>`).join('')}
      <b>Changer de citation</b>
      <select id="q-every">${QUOTE_EVERY.map(([v, l]) => `<option value="${v}" ${v === every ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>`;
  show(false);
  $('#q-next', el).onclick = () => { show(true, 1); restart(); };
  $('#q-prev', el).onclick = () => { show(true, -1); restart(); };
  $('#q-save', el).onclick = async (e) => {
    const b = e.currentTarget;
    if (b.dataset.note) { location.hash = '#/note/' + b.dataset.note; return; }
    const q = current;
    if (!q || (await savedNote(q))) return drawSave();
    const short = q.text.length > 70 ? q.text.slice(0, 68).replace(/\s+\S*$/, '') + '…' : q.text;
    await brain.createNote({
      type: 'citation',
      title: q.cat === 'bible' ? `${q.src} — ${short}` : short,
      body: `> “${q.text}”\n\n— ${q.src}\n\n#${q.cat === 'bible' ? 'bible' : q.cat}`,
    });
    toast('💾 Citation sauvegardée dans ton Cerveau');
    await drawSave();
    restart(); // laisse le temps de la relire
  };
  $('#q-opt', el).onclick = (e) => {
    const menu = $('#q-menu', el);
    menu.hidden = !menu.hidden;
    e.currentTarget.setAttribute('aria-expanded', String(!menu.hidden));
  };
  $$('input[name=qmode]', el).forEach((r) => (r.onchange = async () => { await db.put('settings', r.value, 'quoteMode'); quoteCard(); }));
  $('#q-every', el).onchange = async (e) => { await db.put('settings', Number(e.target.value), 'quoteEvery'); quoteCard(); };
  const restart = () => {
    clearInterval(quoteTimer);
    if (!every) return;
    quoteTimer = setInterval(() => {
      if (!document.body.contains(el)) return clearInterval(quoteTimer); // on a quitté la page
      if (!document.hidden) show();
    }, every * 60_000);
  };
  restart();
}

/* =========================================================
   Assistant (boîte de dialogue qui modifie le planner)
   ========================================================= */
const chat = { history: [], log: [], busy: false }; // conservé tant que l'app est ouverte

async function assistCard() {
  const el = $('#c-assist');
  if (!el) return;
  const key = await assistant.hasKey();
  // Version discrète : une seule ligne ; seul le dernier échange s'affiche (historique sur demande)
  el.innerHTML = `<form class="as-form" id="as-form">
      <span class="as-ico" title="${key ? 'Assistant Claude ✨' : 'Assistant en mode simple — ajoute une clé Claude dans Réglages pour tout demander librement'}">${key ? '✨' : '💬'}</span>
      <textarea name="m" rows="1" placeholder="Demande à l’assistant…" title="${key ? 'Ex. « déplace la cuisine à demain »' : 'Ex. « ajoute appeler maman demain », « coche cuisine » — tape « aide » pour la liste'}"></textarea>
      <button class="as-send" aria-label="Envoyer" title="Envoyer (Entrée)">↑</button>
    </form>
    <div class="as-log" id="as-log" aria-live="polite"></div>
    <div class="as-tools" id="as-tools" hidden>
      <button type="button" class="as-link" id="as-hist"></button>
      <button type="button" class="as-link" id="as-reset">Effacer</button>
    </div>`;
  const log = $('#as-log', el);
  const form = $('#as-form', el);
  const ta = form.m;
  let showAll = false;
  const msgHTML = (m) => (m.role === 'action'
    ? `<div class="as-act">${m.icon} ${esc(m.text)}</div>`
    : `<div class="as-msg ${m.role}">${esc(m.text).replace(/\n/g, '<br>')}</div>`);
  const draw = () => {
    // Par défaut : seulement le dernier échange (ta dernière demande et sa réponse)
    let from = 0;
    if (!showAll) for (let i = chat.log.length - 1; i >= 0; i--) if (chat.log[i].role === 'user') { from = i; break; }
    const shown = chat.log.slice(from);
    log.innerHTML = shown.map(msgHTML).join('') + (chat.busy ? '<div class="as-msg bot typing"><i></i><i></i><i></i></div>' : '');
    log.hidden = !log.innerHTML;
    log.classList.toggle('all', showAll);
    log.scrollTop = log.scrollHeight;
    const older = chat.log.filter((m) => m.role === 'user').length - 1;
    $('#as-tools', el).hidden = !chat.log.length || chat.busy;
    const hist = $('#as-hist', el);
    hist.hidden = older < 1;
    hist.textContent = showAll ? 'Masquer l’historique' : `Historique (${older})`;
  };
  $('#as-hist', el).onclick = () => { showAll = !showAll; draw(); };
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; };
  ta.oninput = grow;
  ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text || chat.busy) return;
    ta.value = '';
    grow();
    chat.log.push({ role: 'user', text });
    chat.busy = true;
    draw();
    let changed = false;
    const opts = {
      action: (icon, t) => { chat.log.push({ role: 'action', icon, text: t }); changed = true; draw(); },
      confirm: (msg) => confirmBox(msg),
    };
    try {
      const r = await assistant.send(chat.history, text, opts);
      chat.log.push({ role: 'bot', text: r.text });
    } catch (err) {
      chat.log.push({ role: 'error', text: err.message });
    } finally {
      chat.busy = false;
      if (!document.body.contains(el)) return;
      draw();
      if (changed) refreshToday();
      ta.focus();
    }
  };
  $('#as-reset', el).onclick = () => { chat.history = []; chat.log = []; showAll = false; draw(); ta.focus(); };
  draw();
}

/* =========================================================
   Gamification : avatar, XP, niveaux
   ========================================================= */
// L'avatar affiché inclut son stade d'évolution (calculé depuis le Savoir du Cerveau).
const getAvatar = async (s) => ({ ...AV.DEFAULT_AVATAR, ...((await db.get('settings', 'avatar')) || {}), evo: (s || (await game.stats())).evo });

function evoBar(s) {
  return `<div class="xp-bar evo-bar" title="${s.kxp} points de Savoir"><i style="width:${s.evoPct}%"></i></div>`;
}
const evoLine = (s) => s.nextEvo
  ? `${s.kxp} / ${s.nextEvo.k} Savoir · prochaine évolution : ${s.nextEvo.icon} ${s.nextEvo.name}`
  : `${s.kxp} Savoir · évolution maximale atteinte`;

// Les célébrations (niveau, évolution) s'affichent l'une après l'autre.
const celebrations = [];
function celebrate(fn) {
  celebrations.push(fn);
  if (celebrations.length === 1) nextCelebration();
}
function nextCelebration() {
  const fn = celebrations[0];
  if (!fn) return;
  const root = $('#modal-root');
  const show = () => {
    Promise.resolve(fn()).then(() => {
      const obs = new MutationObserver(() => {
        if (!root.children.length) { obs.disconnect(); celebrations.shift(); nextCelebration(); }
      });
      obs.observe(root, { childList: true });
    });
  };
  if (!root.children.length) return show();
  const wait = new MutationObserver(() => { if (!root.children.length) { wait.disconnect(); show(); } });
  wait.observe(root, { childList: true });
}

async function evolveModal(stage, s) {
  const av = await getAvatar(s);
  const st = game.EVO[stage];
  const before = AV.avatarSVG({ ...av, evo: stage - 1 }, 84);
  modal(`<div class="levelup">
      <div class="evo-pair">${before}<span class="evo-arrow">➜</span><div class="burst evo">${AV.avatarSVG(av, 120)}</div></div>
      <p class="eyebrow">Ton avatar évolue !</p>
      <h2>${st.icon} ${esc(st.name)}</h2>
      <p class="muted">${esc(st.desc)}</p>
      <div class="modal-actions" style="justify-content:center">
        <a class="btn" href="#/hero" data-close>Voir mon héros</a>
        <button class="btn primary" data-close>Continuer</button>
      </div></div>`);
}

function xpBar(s) {
  return `<div class="xp-bar" title="${s.into} / ${s.need} XP"><i style="width:${s.pct}%"></i></div>`;
}

/** Résumé du jour (haut de la page Aujourd'hui) : héros, missions, habitudes, workout, série. */
async function heroCard() {
  const el = $('#c-hero');
  if (!el) return;
  const s = await game.stats();
  const av = await getAvatar(s);
  const day = iso(new Date());
  const tasks = (await db.all('tasks')).filter((t) => t.date === day || (!t.done && t.date && t.date < day));
  const tDone = tasks.filter((t) => t.done).length;
  const hs = (await habits.list()).filter((h) => habits.isDue(h, new Date()));
  const hDone = hs.filter((h) => habits.doneOn(h, day)).length;
  const wk = await workout.todayStatus();
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const tile = (href, label, value, sub, p, cls = '') => `<a class="sum-tile ${cls}" href="${href}">
      <span class="sum-label">${label}</span><b>${value}</b><small>${sub}</small>
      ${p !== null ? `<i class="sum-bar"><i style="width:${p}%"></i></i>` : ''}</a>`;
  el.innerHTML = `
    <a class="sum-hero" href="#/hero" title="${esc(s.title)} — ${s.xp} XP au total">
      ${AV.avatarSVG(av, 52)}
      <span class="sum-hero-txt"><span><strong>${esc(av.name || 'Ton héros')}</strong> <span class="lvl">Niv. ${s.level}</span></span>
        ${xpBar(s)}<small class="muted">${s.into} / ${s.need} XP · ${game.EVO[s.evo].icon} ${esc(s.evoName)}</small></span>
    </a>
    <div class="sum-tiles">
      ${tile('#/missions', 'Missions', `${tDone}/${tasks.length}`, tasks.length ? (tDone === tasks.length ? 'tout est fait ✓' : `${tasks.length - tDone} à faire`) : 'rien de prévu', tasks.length ? pct(tDone, tasks.length) : null, tasks.length && tDone === tasks.length ? 'ok' : '')}
      ${tile('#/habits', 'Habitudes', `${hDone}/${hs.length}`, hs.length ? (hDone === hs.length ? 'toutes faites ✓' : `${hs.length - hDone} restante${hs.length - hDone > 1 ? 's' : ''}`) : 'aucune aujourd’hui', hs.length ? pct(hDone, hs.length) : null, hs.length && hDone === hs.length ? 'ok' : '')}
      ${tile('#/workout', 'Workout', wk.icon, esc(wk.label), null, wk.done ? 'ok' : '')}
      ${tile('#/hero', 'Série', s.streak ? `🔥 ${s.streak}` : '–', `+${s.todayXp} XP aujourd’hui`, null)}
    </div>`;
}

/* ---------- Logo personnel (menu + onglet du navigateur) ---------- */
const LOGO_COLORS = ['#4f46e5', '#0ea5e9', '#0c8484', '#16a34a', '#ca8a04', '#f97316', '#e11d48', '#a855f7', '#1d1d1f'];
async function getLogo() {
  return { mode: 'avatar', text: '', color: '#4f46e5', emoji: '🦁', title: 'Life Planner', ...((await db.get('settings', 'logo')) || {}) };
}
const initialsOf = (name) => (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'LP';
function shade(hex, k) { // assombrit une couleur #rrggbb (k < 0) ou l'éclaircit (k > 0)
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (k < 0 ? c * k : (255 - c) * k))));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((c) => c.toString(16).padStart(2, '0')).join('');
}
function logoSVG(cfg, av, size = 34) {
  const uidg = 'lg' + Math.random().toString(36).slice(2, 7);
  const c = /^#[0-9a-f]{6}$/i.test(cfg.color) ? cfg.color : '#4f46e5';
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">`;
  if (cfg.mode === 'mono') {
    const t = esc((cfg.text || initialsOf(av?.name)).slice(0, 3).toUpperCase());
    return `${head}<defs><linearGradient id="${uidg}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(c, 0.25)}"/><stop offset="1" stop-color="${shade(c, -0.35)}"/></linearGradient></defs>
      <path d="M32 2 58 11v21c0 15-11 25-26 30C17 57 6 47 6 32V11z" fill="url(#${uidg})"/>
      <path d="M32 7 53 14.5V32c0 12-9 20.5-21 25C20 52.5 11 44 11 32V14.5z" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>
      <text x="32" y="${t.length > 2 ? 38 : 40}" text-anchor="middle" font-family="Segoe UI, system-ui, sans-serif" font-weight="800" font-size="${t.length > 2 ? 17 : 22}" fill="#fff" letter-spacing="1">${t}</text></svg>`;
  }
  if (cfg.mode === 'emoji') {
    return `${head}<defs><linearGradient id="${uidg}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(c, 0.3)}"/><stop offset="1" stop-color="${shade(c, -0.25)}"/></linearGradient></defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#${uidg})"/><text x="32" y="44" text-anchor="middle" font-size="34">${esc(cfg.emoji || '🦁')}</text></svg>`;
  }
  if (cfg.mode === 'app') return `<img src="icons/icon.svg" alt="" width="${size}" height="${size}">`;
  // Avatar (par défaut) : ton héros, dans un cadre à ta couleur
  const inner = AV.avatarSVG(av, size - 4).replace('<svg ', '<svg x="2" y="2" ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><rect x=".75" y=".75" width="${size - 1.5}" height="${size - 1.5}" rx="${size * 0.28}" fill="none" stroke="${c}" stroke-width="1.5"/>${inner}</svg>`;
}
async function applyLogo(s) {
  const cfg = await getLogo();
  const av = await getAvatar(s);
  const el = $('#brand-logo');
  if (el) el.innerHTML = logoSVG(cfg, av, 34);
  const name = $('.brand-main > span');
  if (name) name.textContent = cfg.title || 'Life Planner';
  document.title = cfg.title || 'Life Planner';
  // Icône de l'onglet du navigateur
  if (cfg.mode !== 'app') {
    const svg = logoSVG(cfg, av, 64);
    let link = document.querySelector('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.type = 'image/svg+xml';
    link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
}

async function refreshRail() {
  const s = await game.stats();
  const av = await getAvatar(s);
  $('#hero-mini').innerHTML = `${AV.avatarSVG(av, 40)}
    <div class="hm-text"><span><b>Niv. ${s.level}</b>${s.streak ? ` · 🔥${s.streak}` : ''}</span>${xpBar(s)}</div>`;
  $('#hero-mini').title = `${s.title} — ${s.xp} XP au total`;
  applyLogo(s); // le logo suit ton avatar (s'il est en mode avatar)
}

function xpPop(amount, reason) {
  if (!amount) return;
  const box = $('#xp-pops');
  const el = document.createElement('div');
  el.className = 'xp-pop' + (amount < 0 ? ' neg' : '');
  el.innerHTML = `<b>${amount > 0 ? '+' : '−'}${Math.abs(amount)} XP</b><small>${esc(reason || '')}</small>`;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2200);
  setTimeout(() => el.remove(), 2700);
}

async function levelUpModal(level, s) {
  const av = await getAvatar(s);
  const unlocked = AV.unlocksAt(level);
  modal(`<div class="levelup">
      <div class="burst">${AV.avatarSVG(av, 120)}</div>
      <p class="eyebrow">Niveau supérieur !</p>
      <h2>Niveau ${level}</h2>
      <p class="muted">${esc(s.title)}</p>
      ${unlocked.length ? `<div class="unlocks"><b>Débloqué :</b> ${unlocked.map((u) => `${esc(u.cat)} — ${esc(u.name || 'nouvelle couleur')}`).join(', ')}</div>` : ''}
      <div class="modal-actions" style="justify-content:center">
        ${unlocked.length ? '<a class="btn" href="#/hero" data-close>Personnaliser</a>' : ''}
        <button class="btn primary" data-close>Continuer</button>
      </div></div>`);
}

game.setUI({
  pop: xpPop,
  levelUp: (level, s) => celebrate(() => levelUpModal(level, s)),
  evolve: (stage, s) => celebrate(() => evolveModal(stage, s)),
  badge: (b) => toast(`${b.icon} Badge débloqué : ${b.name}`),
  changed: () => { refreshRail(); heroCard(); evoCard(); },
});

async function renderHero() {
  const s = await game.stats();
  const av = await getAvatar(s);
  const owned = new Set((await db.get('settings', 'badges')) || []);
  const next = AV.nextUnlock(s.level);
  view.innerHTML = `
    <header class="page-head"><div><p class="eyebrow">Progression</p><h1>Ton héros</h1></div></header>
    <div class="hero-layout">
      <section class="card hero-id">
        <div id="hero-big">${AV.avatarSVG(av, 168)}</div>
        <input id="hero-name" class="hero-name" value="${esc(av.name)}" placeholder="Nom de ton héros" maxlength="24">
        <p class="muted" style="margin:0">${esc(s.title)}</p>
        <div class="lvl-big">Niveau ${s.level}</div>
        <div style="width:100%">${xpBar(s)}<div class="muted hc-sub" style="text-align:center">${s.into} / ${s.need} XP · ${s.xp} XP au total</div></div>
        ${next ? `<p class="muted hc-sub">🔓 Niveau ${next.lvl} : ${esc(next.cat)}${next.name ? ' — ' + esc(next.name) : ''}</p>` : ''}
        <div class="stat-grid">
          <div><b>🔥 ${s.streak}</b><small>série actuelle</small></div>
          <div><b>${s.best}</b><small>meilleure série</small></div>
          <div><b>${s.tasks}</b><small>missions</small></div>
          <div><b>${s.subs}</b><small>étapes</small></div>
          <div><b>${s.journal}</b><small>jours de journal</small></div>
          <div><b>${s.ink}</b><small>pages manuscrites</small></div>
          <div><b>${s.notes}</b><small>notes</small></div>
          <div><b>${s.links}</b><small>liens</small></div>
          <div><b>${s.reviews}</b><small>révisions</small></div>
        </div>
      </section>
      <div class="hero-right">
        <section class="hero-habits" id="hero-habits"></section>
        <section class="card">
          <div class="card-head"><h2>Évolution du savoir</h2><a href="#/brain">Ouvrir le Cerveau →</a></div>
          <p class="muted" style="margin-top:0">Chaque note, lien et révision dans ton second cerveau donne des points de <b>Savoir</b> qui font évoluer ton avatar.</p>
          ${evoBar(s)}<p class="muted hc-sub" style="margin:6px 0 14px">${evoLine(s)}</p>
          <div class="evo-steps">${game.EVO.map((st, i) => `<div class="evo-step ${i <= s.evo ? 'on' : ''} ${i === s.evo ? 'cur' : ''}">
            ${AV.avatarSVG({ ...av, evoFx: true, evo: i }, 64)}<b>${st.icon} ${esc(st.name)}</b><small>${i <= s.evo ? esc(st.desc) : `${st.k} Savoir`}</small></div>`).join('')}</div>
          <label class="check-line"><input type="checkbox" id="evo-fx" ${av.evoFx === false ? '' : 'checked'}> Afficher les effets d’évolution sur mon avatar</label>
        </section>
        <section class="card">
          <div class="card-head"><h2>Personnalisation</h2><span class="muted">Monte de niveau pour débloquer plus d’options</span></div>
          <div id="custom"></div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Badges</h2><span class="muted">${owned.size}/${game.BADGES.length}</span></div>
          <div class="badges">${game.BADGES.map((b) => `<div class="badge ${owned.has(b.id) ? 'on' : ''}" title="${esc(b.desc)}">
            <span class="bi">${b.icon}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`).join('')}</div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Comment gagner des XP</h2></div>
          <ul class="rules">${game.RULES.map(([i, l, x]) => `<li><span>${i}</span><span>${esc(l)}</span><b>+${x}</b></li>`).join('')}</ul>
        </section>
        <section class="card">
          <div class="card-head"><h2>Derniers gains</h2></div>
          <ul class="rules">${s.recent.map((e) => `<li><span class="muted">${U.fmtShort(new Date(e.at))}</span><span>${esc(e.reason)}</span><b>+${e.amount}</b></li>`).join('') || '<li class="empty-sm">Accomplis une mission pour gagner tes premiers XP !</li>'}</ul>
        </section>
      </div>
    </div>`;

  // Habitudes : suivi et rappels, directement dans la page du héros
  await habits.renderPage({ ...pageCtx(), view: $('#hero-habits'), embedded: true });

  const cfg = { ...av };
  const save = async () => {
    const { evo, ...stored } = cfg; // le stade d'évolution est calculé, pas enregistré
    await db.put('settings', stored, 'avatar');
    $('#hero-big').innerHTML = AV.avatarSVG(cfg, 168);
    refreshRail();
  };
  const drawCustom = () => {
    $('#custom').innerHTML = AV.CATEGORIES.map((cat) => `
      <div class="opt-group"><h3>${cat.name}</h3><div class="opts">${cat.items.map((it, i) => {
        const val = cat.type === 'color' ? i : it.id;
        const locked = it.lvl && it.lvl > s.level;
        const on = cfg[cat.key] === val;
        let inner;
        if (cat.type === 'color') inner = `<span class="swatch" style="--sw:${it.c}"></span>`;
        else if (cat.type === 'bg') inner = `<span class="swatch" style="--sw:${it.g ? `linear-gradient(135deg,${it.g[0]},${it.g[1]})` : it.fill}"></span>`;
        else inner = AV.avatarSVG({ ...cfg, [cat.key]: val }, 52);
        return `<button class="opt ${cat.type} ${on ? 'on' : ''}" data-k="${cat.key}" data-v="${val}" ${locked ? 'disabled' : ''}
          title="${locked ? `Débloqué au niveau ${it.lvl}` : esc(it.name || '')}">${inner}${locked ? `<span class="lock">🔒${it.lvl}</span>` : ''}</button>`;
      }).join('')}</div></div>`).join('');
    $$('#custom .opt').forEach((b) => (b.onclick = () => {
      const cat = AV.CATEGORIES.find((c) => c.key === b.dataset.k);
      cfg[cat.key] = cat.type === 'color' ? Number(b.dataset.v) : b.dataset.v;
      save();
      drawCustom();
    }));
  };
  drawCustom();
  $('#evo-fx').onchange = (e) => { cfg.evoFx = e.target.checked; save(); drawCustom(); };
  const saveName = U.debounce(save, 400);
  $('#hero-name').oninput = (e) => { cfg.name = e.target.value.trim(); saveName(); };
  cleanup = () => saveName.flush();
}

/* =========================================================
   Vue : Cerveau (second cerveau)
   ========================================================= */
const brainState = { q: '', f: 'all', tag: '', arch: false };
const skipRediscover = [];

async function evoCard() {
  const el = $('#c-evo');
  if (!el) return;
  const s = await game.stats();
  const av = await getAvatar(s);
  el.innerHTML = `${AV.avatarSVG(av, 88)}
    <div class="hc-main">
      <div class="hc-top"><strong>${game.EVO[s.evo].icon} ${esc(s.evoName)}</strong><span class="muted">stade ${s.evo + 1}/${game.EVO.length}</span></div>
      ${evoBar(s)}
      <div class="hc-sub muted">${evoLine(s)}</div>
      <div class="hc-sub muted">${s.notes} notes · ${s.links} liens · ${s.reviews} révisions</div>
    </div>`;
}

function captureForm(id) {
  return `<form class="capture" id="${id}">
    <textarea name="t" rows="3" placeholder="Une idée, une citation, un truc appris… (la 1re ligne devient le titre). Colle aussi une photo ou une capture d’écran (Ctrl + V)."></textarea>
    <div class="cap-imgs" hidden></div>
    <div class="capture-foot">
      <label class="btn cap-photo" title="Ajouter une photo ou une capture"><input type="file" accept="image/*" multiple hidden>📷 Photo</label>
      <label class="btn cap-photo cap-doc" title="Joindre un document (PDF, Word, EPUB…)"><input type="file" accept="${docs.ACCEPT}" multiple hidden>📎 Fichier</label>
      <span class="muted cap-hint">Ctrl + Entrée</span>
      <button class="btn primary">💡 Capturer</button>
    </div>
  </form>`;
}

function bindCapture(form, after) {
  let files = []; // en attente : images { blob, url } et documents { blob, doc: true }
  const box = form.querySelector('.cap-imgs');
  const drawImgs = () => {
    box.hidden = !files.length;
    box.innerHTML = files.map((f, i) => f.doc
      ? `<span class="doc-chip"><span class="doc-open"><span class="doc-ico">${docs.icon({ name: f.blob.name })}</span><span class="doc-name">${esc(f.blob.name)}</span><small>${docs.fmtSize(f.blob.size)}</small></span><button type="button" class="doc-rm" data-rm="${i}" aria-label="Retirer le document">×</button></span>`
      : `<span class="cap-img"><img src="${f.url}" alt="Image ${i + 1}"><button type="button" data-rm="${i}" aria-label="Retirer l’image">×</button></span>`).join('');
    $$('[data-rm]', box).forEach((b) => (b.onclick = () => { const f = files[b.dataset.rm]; if (f.url) URL.revokeObjectURL(f.url); files.splice(Number(b.dataset.rm), 1); drawImgs(); }));
  };
  const add = (list) => {
    for (const blob of list) files.push({ blob, url: URL.createObjectURL(blob) });
    if (list.length) { drawImgs(); form.t.focus(); }
  };
  const addDocs = (list) => {
    for (const blob of list) {
      if (blob.size > docs.MAX_MB * 1024 * 1024) { toast(`« ${blob.name} » dépasse ${docs.MAX_MB} Mo`, 'err'); continue; }
      files.push({ blob, doc: true });
    }
    if (list.length) { drawImgs(); form.t.focus(); }
  };
  form._addImages = add; // utilisé par le « coller » global de la page
  let busy = false;
  const submit = async () => {
    const v = form.t.value.trim();
    if ((!v && !files.length) || busy) return;
    busy = true;
    const btn = form.querySelector('button.primary');
    btn.disabled = true;
    try {
      const ids = [], dms = [];
      for (const f of files) {
        if (f.doc) dms.push(await docs.save(f.blob));
        else ids.push(await images.save(f.blob));
      }
      const lines = v.split('\n');
      let title = v ? lines.shift().trim()
        : ids.length ? `📷 Image du ${U.fmtShort(new Date())} à ${U.fmtTime(new Date())}` : `📎 ${dms[0].name.replace(/\.[^.]+$/, '')}`;
      let body = lines.join('\n').trim();
      if (title.length > 80) { body = (title + '\n' + body).trim(); title = title.slice(0, 60).trim() + '…'; }
      body = [body, ...ids.map(images.refLine), ...dms.map(docs.refLine)].filter(Boolean).join('\n');
      const n = await brain.createNote({ title, body, type: 'idee', inbox: true });
      n.captured = true;
      await brain.saveNote(n, { touch: false });
      files.forEach((f) => URL.revokeObjectURL(f.url));
      files = [];
      form.t.value = '';
      drawImgs();
      const att = [ids.length && `${ids.length} image${ids.length > 1 ? 's' : ''}`, dms.length && `${dms.length} document${dms.length > 1 ? 's' : ''}`].filter(Boolean).join(' et ');
      toast(att ? `💡 Capturé avec ${att} — dans « À classer »` : '💡 Idée capturée — elle t’attend dans « À classer »');
      after?.(n);
    } catch (err) {
      console.error(err);
      toast('Impossible d’enregistrer l’image : ' + err.message, 'err');
    } finally { busy = false; btn.disabled = false; }
  };
  form.onsubmit = (e) => { e.preventDefault(); submit(); };
  form.t.onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } };
  form.addEventListener('paste', (e) => {
    const imgs = images.imageFiles(e.clipboardData), ds = docs.docFiles(e.clipboardData?.files);
    if (imgs.length || ds.length) { e.preventDefault(); add(imgs); addDocs(ds); }
  });
  form.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); form.classList.add('drop'); } });
  form.addEventListener('dragleave', () => form.classList.remove('drop'));
  form.addEventListener('drop', (e) => {
    form.classList.remove('drop');
    const imgs = images.imageFiles(e.dataTransfer), ds = docs.docFiles(e.dataTransfer?.files);
    if (imgs.length || ds.length) { e.preventDefault(); add(imgs); addDocs(ds); }
  });
  const pick = form.querySelector('.cap-photo:not(.cap-doc) input');
  pick.onchange = () => { add([...pick.files]); pick.value = ''; };
  const pickD = form.querySelector('.cap-doc input');
  pickD.onchange = () => { addDocs([...pickD.files]); pickD.value = ''; };
}

// Coller une image n'importe où sur la page (hors champ de texte) : elle va dans la capture rapide visible
document.addEventListener('paste', (e) => {
  if (e.defaultPrevented || e.target.closest?.('input, textarea, [contenteditable]')) return;
  const imgs = images.imageFiles(e.clipboardData);
  const form = $('#view form.capture');
  if (!imgs.length || !form?._addImages) return;
  e.preventDefault();
  form._addImages(imgs);
  form.scrollIntoView({ block: 'center', behavior: 'smooth' });
});

// Les images des notes se chargent à la demande, et un clic les agrandit
new MutationObserver(() => { if (document.querySelector('img[data-img]:not([src])')) images.hydrate(); })
  .observe(document.body, { childList: true, subtree: true });
document.addEventListener('click', (e) => {
  const img = e.target.closest?.('.n-img img');
  if (img?.src) images.zoom(img.src);
  // Documents joints : un clic ouvre le PDF (ou télécharge le fichier Word, EPUB…)
  const d = e.target.closest?.('[data-doc-open]');
  if (d) { e.preventDefault(); e.stopPropagation(); docs.open(d.dataset.docOpen).catch((err) => toast(err.message, 'err')); }
});
docs.setRemoteFetcher(sync.fetchDoc);

function noteCard(n, proj) {
  const t = brain.typeOf(n.type);
  return `<a class="note-card ${n.pinned ? 'pinned' : ''}" href="#/note/${n.id}">
    <div class="nc-head"><span class="nc-type" title="${t.name}">${t.icon}</span><b>${esc(n.title || 'Sans titre')}</b>${n.pinned ? '<span title="Épinglée">📌</span>' : ''}</div>
    ${n.inbox ? '<span class="chip warn">📥 À classer</span>' : ''}
    ${proj?.goals.length ? `<div class="nc-proj"><span class="muted">🎯 ${proj.goals.length} objectif${proj.goals.length > 1 ? 's' : ''}${proj.missions ? ` · ${proj.done}/${proj.missions} missions` : ''}</span><b>${proj.pct} %</b>
      <div class="bar"><i style="width:${proj.pct}%"></i></div></div>` : ''}
    ${(() => { const im = images.refsIn(n.body); return im.length ? `<div class="nc-img"><img data-img="${im[0]}" alt="" loading="lazy">${im.length > 1 ? `<span>+${im.length - 1}</span>` : ''}</div>` : ''; })()}
    <p>${esc(brain.excerpt(n.body)) || (n.title ? '' : '<span class="muted">Vide</span>')}</p>
    <div class="nc-foot">${(n.tags || []).slice(0, 3).map((tg) => `<span class="tag">#${esc(tg)}</span>`).join('')}
      <span class="grow"></span>${(n.links || []).length ? `<span class="muted" title="Liens">🔗 ${n.links.length}</span>` : ''}<span class="muted">${U.fmtShort(new Date(n.updatedAt))}</span></div>
  </a>`;
}

async function renderBrain() {
  const everything = await brain.allNotes();
  const archivedCount = everything.filter((n) => n.archived).length;
  if (!archivedCount) brainState.arch = false;
  // Mode normal : notes actives seulement. Mode Archives : notes archivées seulement (filtres identiques).
  const notes = everything.filter((n) => !!n.archived === !!brainState.arch);
  const [allGoals, allTasks] = await Promise.all([db.all('goals'), db.all('tasks')]);
  const projStats = (n) => (n.type === 'projet' ? brain.projectStats(n.id, allGoals, allTasks) : null);
  const projects = notes.filter((n) => n.type === 'projet').sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
  const inbox = notes.filter((n) => n.inbox).length;
  const tagCount = {};
  notes.forEach((n) => (n.tags || []).forEach((t) => (tagCount[t] = (tagCount[t] || 0) + 1)));
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 14);
  if (brainState.tag && !tagCount[brainState.tag]) brainState.tag = '';
  const filters = [['all', 'Tout', notes.length], ['inbox', '📥 À classer', inbox], ['pinned', '📌 Épinglées', notes.filter((n) => n.pinned).length]]
    .concat(brain.TYPES.filter((t) => t.id !== 'projet').map((t) => [t.id, `${t.icon} ${t.name}`, notes.filter((n) => n.type === t.id).length])) // les projets ont leur propre rangée en haut
    .filter(([id, , c]) => id === 'all' || c);
  if (!filters.some(([id]) => id === brainState.f)) brainState.f = 'all';

  view.innerHTML = `
    <header class="page-head"><div><p class="eyebrow">Second cerveau</p><h1>Cerveau</h1></div>
      <div class="head-actions"><button class="btn primary" id="new-note">+ Nouvelle note</button></div></header>
    <div class="brain-top">
      <section class="card capture-card brain-cap"><div class="card-head"><h2>💡 Capture rapide</h2><span class="muted cap-stats">${inbox ? `📥 ${inbox} à classer` : ''}</span></div>${captureForm('cap')}</section>
      <div class="brain-aside">
        <a class="card hero-card evo-card" id="c-evo" href="#/hero"></a>
        <section class="card" id="c-redisc"></section>
      </div>
    </div>
    ${!brainState.arch && projects.length ? `<section class="brain-projects">
      <div class="bp-head"><h2>🚀 Projets</h2><span class="muted">${projects.length} actif${projects.length > 1 ? 's' : ''}</span></div>
      <div class="bp-grid">${projects.map((p) => {
        const st = projStats(p);
        const rel = notes.filter((x) => (x.rel?.projects || []).includes(p.id)).length;
        return `<a class="card bp-card" href="#/note/${p.id}">
          <div class="bp-top"><b>${esc(p.title || 'Projet sans titre')}</b><span class="bp-pct">${st.pct}%</span></div>
          <div class="bar"><i style="width:${st.pct}%"></i></div>
          <small class="muted">🎯 ${st.goals.length} objectif${st.goals.length > 1 ? 's' : ''} · ✅ ${st.done}/${st.missions} missions${rel ? ` · 🧠 ${rel} élément${rel > 1 ? 's' : ''}` : ''}</small>
        </a>`;
      }).join('')}</div>
    </section>` : ''}
    <div class="brain-bar">
      <label class="brain-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input type="search" id="bq" placeholder="Rechercher dans tes notes…" value="${esc(brainState.q)}" autocomplete="off" aria-label="Rechercher dans tes notes"></label>
      ${brainState.arch ? `<div class="arch-banner">🗄 <b>Archives</b> · ${archivedCount} note${archivedCount > 1 ? 's' : ''} archivée${archivedCount > 1 ? 's' : ''}, rangée${archivedCount > 1 ? 's' : ''} par catégorie d’origine. <button class="btn" id="arch-exit">← Retour aux notes</button></div>` : ''}
      <div class="brain-filters">${filters.map(([id, l, c]) => `<button class="chip-btn ${brainState.f === id ? 'on' : ''}" data-f="${id}">${l} <small>${c}</small></button>`).join('')}
        ${archivedCount && !brainState.arch ? `<button class="chip-btn arch-chip" id="arch-open" title="Notes archivées">🗄 Archives <small>${archivedCount}</small></button>` : ''}</div>
      ${topTags.length ? `<div class="brain-tags"><span>Étiquettes</span>${topTags.map(([t, c]) => `<button class="chip-btn tagf ${brainState.tag === t ? 'on' : ''}" data-tag="${esc(t)}">#${esc(t)} <small>${c}</small></button>`).join('')}</div>` : ''}
    </div>
    <div class="note-grid" id="ng"></div>`;

  const drawList = () => {
    const words = brain.norm(brainState.q).split(/\s+/).filter(Boolean);
    const list = notes.filter((n) => {
      if (brainState.f === 'inbox' && !n.inbox) return false;
      if (brainState.f === 'pinned' && !n.pinned) return false;
      if (!['all', 'inbox', 'pinned'].includes(brainState.f) && n.type !== brainState.f) return false;
      if (brainState.tag && !(n.tags || []).includes(brainState.tag)) return false;
      const hay = brain.norm(`${n.title} ${n.body} ${(n.tags || []).join(' ')}`);
      return words.every((w) => hay.includes(w));
    }).sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
    $('#ng').innerHTML = list.map((x) => noteCard(x, projStats(x))).join('') || (notes.length || brainState.arch
      ? `<p class="empty">${brainState.arch ? 'Aucune note archivée ne correspond.' : 'Aucune note ne correspond.'}</p>`
      : `<div class="card brain-empty"><h2>Bienvenue dans ton second cerveau 🧠</h2>
          <p>Un endroit pour tout ce que tu ne veux pas oublier : idées, choses apprises, livres, citations, personnes, projets.</p>
          <ol><li><b>Capture</b> une idée en deux secondes, sans réfléchir où la ranger.</li>
          <li><b>Classe-la</b> plus tard : choisis son type et ajoute des <code>#étiquettes</code>.</li>
          <li><b>Relie</b> tes notes en écrivant <code>[[Titre d’une autre note]]</code>.</li>
          <li><b>Redécouvre</b> tes anciennes notes pour qu’elles restent en mémoire.</li></ol>
          <p class="muted">Chaque action donne des points de Savoir : ton avatar gagne des étincelles, un compagnon hibou, une aura… jusqu’au stade Archisage.</p></div>`);
  };
  drawList();

  $('#bq').oninput = (e) => { brainState.q = e.target.value; drawList(); };
  $('#arch-open')?.addEventListener('click', () => { brainState.arch = true; brainState.f = 'all'; brainState.tag = ''; renderBrain(); });
  $('#arch-exit')?.addEventListener('click', () => { brainState.arch = false; brainState.f = 'all'; brainState.tag = ''; renderBrain(); });
  $$('[data-f]').forEach((b) => (b.onclick = () => {
    brainState.f = b.dataset.f;
    $$('[data-f]').forEach((x) => x.classList.toggle('on', x === b));
    drawList();
  }));
  $$('[data-tag]').forEach((b) => (b.onclick = () => {
    brainState.tag = brainState.tag === b.dataset.tag ? '' : b.dataset.tag;
    $$('[data-tag]').forEach((x) => x.classList.toggle('on', x.dataset.tag === brainState.tag));
    drawList();
  }));
  $('#new-note').onclick = async () => {
    const n = await brain.createNote({ type: 'note' });
    location.hash = '#/note/' + n.id;
  };
  bindCapture($('#cap'), () => renderBrain());

  const redisc = async () => {
    const el = $('#c-redisc');
    if (!el) return;
    const n = brain.rediscover(await brain.allNotes(), skipRediscover);
    el.innerHTML = `<div class="card-head"><h2>🔁 Redécouvrir</h2>${n ? '<button class="btn sm" id="rd-next" title="Une autre note" aria-label="Une autre note">↻</button>' : ''}</div>
      ${n ? `<a class="redisc" href="#/note/${n.id}"><b>${brain.typeOf(n.type).icon} ${esc(n.title || 'Sans titre')}</b>
          <p>${esc(brain.excerpt(n.body, 160)) || '<span class="muted">Note vide</span>'}</p></a>
        <div class="rd-actions"><button class="btn primary" id="rd-ok">✓ Je l’ai relue (+${game.XP.review} XP)</button></div>`
      : '<p class="empty-sm">Tes notes de plus de 2 jours reviendront ici, une à la fois. Relire régulièrement, c’est ce qui transforme l’information en savoir.</p>'}`;
    if (!n) return;
    $('#rd-next').onclick = () => { skipRediscover.push(n.id); redisc(); };
    $('#rd-ok').onclick = async () => { await brain.review(n); redisc(); };
  };
  await Promise.all([evoCard(), redisc()]);
}

async function renderNote(id) {
  const n = await db.get('notes', id);
  if (!n) { view.innerHTML = '<div class="empty">Note introuvable. <a href="#/brain">Retour au Cerveau</a></div>'; return; }
  let origTitle = n.title;
  let deleted = false;
  let pending = Promise.resolve();
  const today = iso(new Date());

  view.innerHTML = `
    <header class="page-head note-head">
      <div class="grow"><a href="#/brain" class="eyebrow">← Cerveau</a>
        <input id="n-title" class="note-title" value="${esc(n.title)}" placeholder="Titre de la note" maxlength="80" autocomplete="off"></div>
      <div class="head-actions">
        <select id="n-type" style="width:auto" aria-label="Type">${brain.TYPES.map((t) => `<option value="${t.id}" ${t.id === n.type ? 'selected' : ''}>${t.icon} ${t.name}</option>`).join('')}</select>
        <button class="btn" id="n-pin">${n.pinned ? '📌 Épinglée' : '📌 Épingler'}</button>
        <button class="btn" id="n-task" title="Crée une mission pour aujourd’hui et range cette note dans les Archives">✅ En faire une mission</button>
        <button class="btn" id="n-arch" title="${n.archived ? 'Remettre la note avec les autres' : 'Ranger la note dans les archives (elle garde son type)'}">${n.archived ? '↩ Désarchiver' : '🗄 Archiver'}</button>
        <button class="btn danger" id="n-del">Supprimer</button>
      </div>
    </header>
    ${n.archived ? `<div class="arch-banner">🗄 Cette note est archivée${n.archivedAt ? ` depuis le ${U.fmtShort(new Date(n.archivedAt))}` : ''} : elle n’apparaît plus que dans les Archives du Cerveau. Elle reste de type ${brain.typeOf(n.type).icon} ${brain.typeOf(n.type).name}.</div>` : ''}
    <div id="n-inbox"></div>
    <div class="note-layout">
      <div class="note-left">
      <section class="card project-panel" id="n-proj" hidden></section>
      <section class="card note-main">
        <div class="note-tools"><div class="seg"><button data-mode="write">✎ Écrire</button><button data-mode="read">👁 Lire</button></div>
          <span class="note-add"><label class="btn" id="n-photo" title="Ajouter une photo ou une capture (tu peux aussi la coller avec Ctrl + V)"><input type="file" accept="image/*" multiple hidden>📷 Photo</label>
          <label class="btn" id="n-doc" title="Joindre un document (PDF, Word, EPUB…)"><input type="file" accept="${docs.ACCEPT}" multiple hidden>📎 Fichier</label></span></div>
        <div id="n-write">
          <textarea id="n-body" placeholder="Écris librement…&#10;&#10;[[Titre]] relie une autre note · #étiquette classe la note · « - » fait une liste · « # » fait un titre">${esc(n.body)}</textarea>
          <div class="suggest" id="n-sug" hidden></div>
        </div>
        <div id="n-read" class="note-read" hidden></div>
      </section>
      </div>
      <aside class="note-side" id="n-side"></aside>
    </div>`;

  const ta = $('#n-body');
  const save = U.debounce(() => (pending = brain.saveNote(n).then(drawSide)), 600);
  const flush = async () => { save.flush(); await pending; };

  // Bandeau « à classer »
  const drawInbox = () => {
    $('#n-inbox').innerHTML = n.inbox ? `<div class="inbox-banner">📥 <span>Cette idée attend d’être classée : choisis son type, ajoute des <b>#étiquettes</b> ou des <b>[[liens]]</b>, puis</span>
      <button class="btn primary" id="n-triage">Classer (+${game.XP.triage} XP)</button></div>` : '';
    $('#n-triage')?.addEventListener('click', async () => {
      n.inbox = false;
      await flush();
      await (pending = brain.saveNote(n));
      drawInbox();
      drawSide();
    });
  };

  // Panneau latéral : liens, rétroliens, étiquettes, suggestions
  async function drawSide() {
    const el = $('#n-side');
    if (!el || deleted) return;
    const all = await brain.allNotes();
    const me = all.find((x) => x.id === n.id) || n;
    const out = (me.links || []).map((l) => ({ l, t: brain.findByTitle(all, l) }));
    const back = brain.backlinks(all, me);
    const linked = new Set([...out.filter((o) => o.t).map((o) => o.t.id), ...back.map((b) => b.id)]);
    const related = (me.tags || []).length
      ? all.filter((x) => x.id !== me.id && !x.archived && !linked.has(x.id) && x.title && (x.tags || []).some((t) => me.tags.includes(t))).slice(0, 5) : [];
    const links = await assoc.linksOf(n);
    const relNotes = me.type === 'projet' ? await assoc.notesFor('projects', me.id) : [];
    el.innerHTML = `
      <section class="card assoc-card"><div class="card-head"><h3>🧷 Associé à</h3><button class="btn sm-text" id="n-assoc">+ Associer</button></div>
        ${links.length ? `<div class="assoc-list">${links.map((l) => `<span class="assoc-chip"><a href="${l.href}" ${l.task ? `data-open-task="${l.task}"` : ''}>${esc(l.label)}</a><button data-unassoc="${l.kind}|${l.id}" aria-label="Retirer l’association">×</button></span>`).join('')}</div>`
          : '<p class="empty-sm">Relie cette note à un projet, un module du cours RBQ, un objectif ou une mission.</p>'}</section>
      ${me.type === 'projet' ? `<section class="card"><h3>🧠 Éléments associés (${relNotes.length})</h3>
        ${relNotes.length ? `<div class="assoc-list">${assoc.noteChips(relNotes)}</div>` : '<p class="empty-sm">Depuis n’importe quelle note : « 🧷 Associé à » → 🚀 Projet.</p>'}</section>` : ''}
      <section class="card"><h3>🔗 Liens (${out.length})</h3>
        ${out.map(({ l, t }) => t
          ? `<a class="side-link" href="#/note/${t.id}">${brain.typeOf(t.type).icon} ${esc(t.title)}</a>`
          : `<button class="side-link missing" data-create="${esc(l)}" title="Cette note n’existe pas encore : clique pour la créer">＋ ${esc(l)}</button>`).join('')
        || '<p class="empty-sm">Écris <code>[[</code> pour relier une autre note.</p>'}</section>
      <section class="card"><h3>↩︎ Rétroliens (${back.length})</h3>
        ${back.map((b) => `<a class="side-link" href="#/note/${b.id}">${brain.typeOf(b.type).icon} ${esc(b.title || 'Sans titre')}<small>${esc(brain.excerpt(b.body, 70))}</small></a>`).join('')
        || '<p class="empty-sm">Aucune note ne pointe encore ici.</p>'}</section>
      ${(me.tags || []).length ? `<section class="card"><h3># Étiquettes</h3><div class="filters">${me.tags.map((t) => `<button class="chip-btn" data-gotag="${esc(t)}">#${esc(t)}</button>`).join('')}</div></section>` : ''}
      ${related.length ? `<section class="card"><h3>✨ À relier ?</h3><p class="empty-sm" style="padding-top:0">Ces notes partagent une étiquette.</p>
        ${related.map((r) => `<div class="side-rel"><a href="#/note/${r.id}">${brain.typeOf(r.type).icon} ${esc(r.title)}</a><button class="btn" data-relate="${esc(r.title)}">Relier +${game.XP.link}</button></div>`).join('')}</section>` : ''}
      <section class="card note-info muted">
        Créée le ${U.fmtShort(new Date(me.createdAt))} · modifiée le ${U.fmtShort(new Date(me.updatedAt))}<br>
        ${me.reviews ? `Relue ${me.reviews} fois` : 'Jamais relue'}${brain.reviewedToday(me) ? ' · relue aujourd’hui ✓' : ''}
      </section>`;
  }

  // Projet : objectifs associés (et leurs missions)
  async function drawProject() {
    const el = $('#n-proj');
    if (!el || deleted) return;
    el.hidden = n.type !== 'projet';
    if (el.hidden) return;
    const [goals, tasks] = await Promise.all([loadGoals(), db.all('tasks')]);
    const st = brain.projectStats(n.id, goals, tasks);
    const others = goals.filter((g) => g.projectId !== n.id);
    const sortM = (a, b) => a.done - b.done || (a.date || '9999').localeCompare(b.date || '9999') || a.createdAt - b.createdAt;
    el.innerHTML = `<div class="card-head"><h2>🎯 Objectifs et missions du projet</h2>
        <span class="muted">${st.goals.length || st.direct.length ? `${st.pct} %${st.missions ? ` · ${st.done}/${st.missions} missions` : ''}` : ''}</span></div>
      ${st.goals.length || st.direct.length ? `<div class="xp-bar proj-bar"><i style="width:${st.pct}%"></i></div>` : '<p class="empty-sm">Ajoute des objectifs ou des missions à ce projet : son avancement les suivra.</p>'}
      ${st.goals.map((g) => {
        const ms = tasks.filter((t) => t.goalId === g.id).sort(sortM);
        return `<div class="pgoal" data-gid="${g.id}">
          <div class="pg-head"><a href="#/goals" data-opengoal="${g.id}" title="Ouvrir dans Objectifs">${esc(g.title)}</a>
            <select class="pg-hz" data-hz="${g.id}" aria-label="Échéance" title="Échéance">${hzOptions(g.horizon || '')}</select><span class="pct">${g.progress}%</span>
            <button class="btn icon sm pg-plus" type="button" aria-label="Ajouter une mission à cet objectif" title="Ajouter une mission">+</button>
            <button class="x pg-unlink" data-unlink="${g.id}" title="Retirer du projet" aria-label="Retirer l’objectif du projet">×</button></div>
          <div class="bar"><i style="width:${g.progress}%"></i></div>
          ${ms.length ? `<ul class="tasks">${ms.map((t) => taskHTML(t, today, { hideGoal: true, showDate: true })).join('')}</ul>` : ''}
          <form class="add-mission pg-add" hidden><input name="t" placeholder="Mission pour cet objectif…" autocomplete="off">
            <input name="d" type="date" value="${today}" aria-label="Date prévue (facultatif)"><button class="btn icon" aria-label="Ajouter la mission">+</button></form>
        </div>`;
      }).join('')}
      <div class="pgoal pdirect">
        <div class="pg-head"><b>📋 Missions du projet</b><span class="muted">${st.direct.length ? `${st.direct.filter((t) => t.done).length}/${st.direct.length}` : ''}</span>
          <button class="btn icon sm pd-toggle" type="button" aria-label="Ajouter une mission au projet" title="Ajouter une mission">+</button></div>
        ${st.direct.length ? `<ul class="tasks">${st.direct.sort(sortM).map((t) => taskHTML(t, today, { showDate: true, hideProject: true })).join('')}</ul>`
          : '<p class="empty-sm">Des missions directement liées au projet, sans objectif. Touche + pour en ajouter.</p>'}
        <form class="add-mission pd-add" hidden><input name="t" placeholder="Nouvelle mission du projet…" autocomplete="off">
          <input name="d" type="date" value="${today}" aria-label="Date prévue (facultatif)"><button class="btn icon" aria-label="Ajouter la mission">+</button></form>
        ${(() => { const free = tasks.filter((t) => !t.done && !t.projectId && !t.goalId); return free.length ? `<select class="pd-link" aria-label="Lier une mission existante"><option value="">🔗 Lier une mission existante…</option>${free.map((t) => `<option value="${t.id}">${esc(t.title)}</option>`).join('')}</select>` : ''; })()}
      </div>
      <form class="proj-new">
        <input name="title" placeholder="Nouvel objectif pour ce projet…" autocomplete="off">
        <select name="horizon" aria-label="Échéance">${hzOptions('')}</select>
        <button class="btn primary">Ajouter</button>
      </form>
      ${others.length ? `<select class="proj-link" aria-label="Associer un objectif existant"><option value="">🔗 Associer un objectif existant…</option>
        ${others.map((g) => `<option value="${g.id}">${esc(g.title)}${g.projectId ? ' (déjà dans un autre projet)' : ''}</option>`).join('')}</select>` : ''}`;

    bindTaskList(el, drawProject);
    $$('.pg-add', el).forEach((f) => (f.onsubmit = async (e) => {
      e.preventDefault();
      const v = f.t.value.trim();
      if (!v) return;
      const gid = f.closest('.pgoal').dataset.gid;
      await addTask(v, f.d.value || null, gid);
      await drawProject();
      // La boîte reste ouverte pour enchaîner plusieurs missions
      const nf = $(`.pgoal[data-gid="${gid}"] .pg-add`);
      if (nf) { nf.hidden = false; nf.t.focus(); }
    }));
    // « + » d'un objectif : affiche (ou cache) la boîte d'ajout de mission
    $$('.pg-plus', el).forEach((b) => (b.onclick = () => {
      const f = b.closest('.pgoal').querySelector('.pg-add');
      f.hidden = !f.hidden;
      b.textContent = f.hidden ? '+' : '−';
      if (!f.hidden) f.t.focus();
    }));
    // Missions directes du projet
    $('.pd-toggle', el).onclick = () => { const f = $('.pd-add', el); f.hidden = !f.hidden; if (!f.hidden) f.t.focus(); };
    $('.pd-add', el).onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, v = f.t.value.trim();
      if (!v) return;
      await addTask(v, f.d.value || null, null, n.id);
      await drawProject();
      const nf = $('.pd-add', el); nf.hidden = false; nf.t.focus();
    };
    $('.pd-link', el)?.addEventListener('change', async (e) => { if (e.target.value) { await setTaskProject(e.target.value, n.id); drawProject(); } });
    $('.proj-new', el).onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const title = f.title.value.trim();
      if (!title) return;
      const id = U.uid();
      await db.put('goals', { id, title, horizon: f.horizon.value, projectId: n.id, progress: 0, createdAt: Date.now() });
      toast(`🎯 Objectif « ${title} » ajouté au projet`);
      await drawProject();
      $(`.pgoal[data-gid="${id}"] .pg-plus`)?.click(); // nouvel objectif : la boîte « mission » s'ouvre tout de suite
    };
    const link = $('.proj-link', el);
    if (link) link.onchange = async () => { if (link.value) { await brain.setGoalProject(link.value, n.id); drawProject(); } };
    $$('.pg-hz', el).forEach((s) => (s.onchange = async () => {
      const g = await db.get('goals', s.dataset.hz);
      g.horizon = s.value;
      await db.put('goals', g);
      toast(`📅 Échéance : ${HZ_LABEL[g.horizon]}`);
    }));
  }

  // Écrire / Lire
  const setMode = async (m) => {
    $$('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    $('#n-write').hidden = m !== 'write';
    $('#n-read').hidden = m !== 'read';
    if (m === 'read') { await flush(); $('#n-read').innerHTML = brain.renderBody(n.body, await brain.allNotes()); }
    else ta.focus();
  };
  $$('.seg button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

  // Suggestions quand on tape [[
  const sug = $('#n-sug');
  const suggest = async () => {
    const m = ta.value.slice(0, ta.selectionStart).match(/\[\[([^[\]\n]{0,40})$/);
    if (!m) { sug.hidden = true; return; }
    const q = brain.norm(m[1]);
    const hits = (await brain.allNotes()).filter((x) => x.id !== n.id && !x.archived && x.title && brain.norm(x.title).includes(q)).slice(0, 6);
    const typed = m[1].trim();
    const exact = hits.some((h) => brain.norm(h.title) === q);
    sug.innerHTML = '<span class="muted">Relier à :</span>'
      + hits.map((x) => `<button type="button" data-t="${esc(x.title)}">${brain.typeOf(x.type).icon} ${esc(x.title)}</button>`).join('')
      + (typed && !exact ? `<button type="button" data-t="${esc(typed)}">＋ « ${esc(typed)} » (nouvelle)</button>` : '')
      + (!hits.length && !typed ? '<span class="muted">tape le titre d’une note…</span>' : '');
    sug.hidden = false;
    $$('button', sug).forEach((b) => (b.onpointerdown = (e) => {
      e.preventDefault();
      const pos = ta.selectionStart;
      const after = ta.value.slice(pos);
      const start = pos - m[1].length;
      ta.value = ta.value.slice(0, start) + b.dataset.t + (after.startsWith(']]') ? '' : ']]') + after;
      const np = start + b.dataset.t.length + 2;
      ta.setSelectionRange(np, np);
      n.body = ta.value;
      save();
      sug.hidden = true;
      ta.focus();
    }));
  };

  ta.oninput = () => { n.body = ta.value; save(); suggest(); };
  ta.onclick = suggest;
  // Images : coller, glisser ou 📷 -> une ligne « ![](img:…) » à l'endroit du curseur
  const insertImages = async (list) => {
    if (!list.length) return;
    toast(`📷 Ajout de ${list.length > 1 ? list.length + ' images' : 'l’image'}…`);
    try {
      const ids = [];
      for (const f of list) ids.push(await images.save(f));
      const at = ta.selectionStart ?? ta.value.length;
      const before = ta.value.slice(0, at), after = ta.value.slice(at);
      const ins = (before && !before.endsWith('\n') ? '\n' : '') + ids.map(images.refLine).join('\n') + '\n';
      ta.value = before + ins + after;
      ta.selectionStart = ta.selectionEnd = (before + ins).length;
      n.body = ta.value;
      save();
      toast(`📷 Image${ids.length > 1 ? 's' : ''} ajoutée${ids.length > 1 ? 's' : ''} — passe en mode Lire pour la voir`);
    } catch (err) { toast('Impossible d’ajouter l’image : ' + err.message, 'err'); }
  };
  ta.addEventListener('paste', (e) => { const f = images.imageFiles(e.clipboardData); if (f.length) { e.preventDefault(); insertImages(f); } });
  ta.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  ta.addEventListener('drop', (e) => {
    const f = images.imageFiles(e.dataTransfer), d = docs.docFiles(e.dataTransfer?.files);
    if (f.length || d.length) { e.preventDefault(); insertImages(f); insertDocs(d); }
  });
  const pickN = $('#n-photo input');
  pickN.onchange = () => { insertImages([...pickN.files]); pickN.value = ''; };
  // Documents : une ligne « [📎 nom](file:…) », cliquable en mode Lire
  const insertDocs = async (list) => {
    if (!list.length) return;
    try {
      const ms = [];
      for (const f of list) ms.push(await docs.save(f));
      const at = ta.selectionStart ?? ta.value.length;
      const before = ta.value.slice(0, at), after = ta.value.slice(at);
      const ins = (before && !before.endsWith('\n') ? '\n' : '') + ms.map(docs.refLine).join('\n') + '\n';
      ta.value = before + ins + after;
      n.body = ta.value;
      save();
      toast(`📎 ${ms.length > 1 ? ms.length + ' documents joints' : 'Document joint'} — clique-le en mode Lire pour l’ouvrir`);
    } catch (err) { toast(err.message, 'err'); }
  };
  const pickD = $('#n-doc input');
  pickD.onchange = () => { insertDocs([...pickD.files]); pickD.value = ''; };
  ta.onblur = () => setTimeout(() => (sug.hidden = true), 150);
  $('#n-title').oninput = (e) => { n.title = e.target.value; save(); };
  $('#n-title').onchange = async () => {
    await flush();
    const count = await brain.renameRefs(origTitle, n.title);
    if (n.title.trim()) await brain.resyncLinksTo(n.title);
    origTitle = n.title;
    if (count) toast(`🔗 ${count} note${count > 1 ? 's mises' : ' mise'} à jour avec le nouveau titre`);
  };
  $('#n-title').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ta.focus(); } };
  $('#n-type').onchange = (e) => { n.type = e.target.value; save(); drawProject(); };
  $('#n-pin').onclick = (e) => { n.pinned = !n.pinned; e.target.textContent = n.pinned ? '📌 Épinglée' : '📌 Épingler'; save(); };
  // Devient une mission : la mission est créée (liée à la note), puis la note est archivée
  $('#n-task').onclick = async () => {
    await flush();
    const t = await addTask(n.title.trim() || brain.excerpt(n.body, 60) || 'Note', today);
    await assoc.toggle(n, 'tasks', t.id, true); // la mission garde un lien vers la note (fenêtre de la mission)
    Object.assign(n, await brain.setArchived(n.id, true));
    brainState.arch = false;
    toast(`✅ Mission « ${t.title} » ajoutée pour aujourd’hui — la note est rangée dans les Archives`);
    location.hash = '#/brain';
  };
  $('#n-arch').onclick = async () => {
    await flush();
    const to = !n.archived;
    Object.assign(n, await brain.setArchived(n.id, to)); // garde la copie en mémoire à jour
    if (to) {
      brainState.arch = false;
      toast(`🗄 « ${n.title || 'Sans titre'} » archivée — retrouve-la dans Cerveau → Archives`);
      location.hash = '#/brain';
    } else {
      toast(`↩ « ${n.title || 'Sans titre'} » est de retour dans le Cerveau`);
      renderNote(n.id);
    }
  };
  $('#n-del').onclick = async () => {
    if (!(await confirmBox(`Supprimer la note « ${n.title || 'Sans titre'} » ? Ses points seront retirés.`))) return;
    deleted = true;
    await pending;
    await brain.deleteNote(n.id);
    location.hash = '#/brain';
  };

  // Liens cliquables (lecture et panneau)
  const openLink = async (title) => {
    await flush();
    let t = brain.findByTitle(await brain.allNotes(), title);
    if (!t) { t = await brain.createNote({ title }); toast(`Note « ${title} » créée`); }
    location.hash = '#/note/' + t.id;
  };
  view.onclick = async (e) => {
    // Associations (projet, cours RBQ, objectif, mission)
    if (e.target.closest('#n-assoc')) { await flush(); assoc.picker(modal, n, () => drawSide()); return; }
    const ua = e.target.closest('[data-unassoc]');
    if (ua) { const [k, tid] = ua.dataset.unassoc.split('|'); await flush(); await assoc.toggle(n, k, tid, false); drawSide(); return; }
    const ot = e.target.closest('[data-open-task]');
    if (ot) { e.preventDefault(); openTaskEditor(ot.dataset.openTask, () => drawSide()); return; }
    const og = e.target.closest('[data-opengoal]');
    if (og) { openGoals.add(og.dataset.opengoal); return; } // le lien mène à #/goals, objectif déplié
    const ul = e.target.closest('[data-unlink]');
    if (ul) { await brain.setGoalProject(ul.dataset.unlink, null); toast('Objectif retiré du projet (il est gardé dans Objectifs)'); drawProject(); return; }
    const wl = e.target.closest('.wl, [data-create]');
    if (wl) { e.preventDefault(); return openLink(wl.dataset.link || wl.dataset.create); }
    const tag = e.target.closest('[data-gotag], .note-read .tag');
    if (tag) { brainState.tag = tag.dataset.gotag || tag.dataset.tag; brainState.f = 'all'; brainState.q = ''; location.hash = '#/brain'; return; }
    const rel = e.target.closest('[data-relate]');
    if (rel) {
      n.body = (n.body.trimEnd() + `\n- [[${rel.dataset.relate}]]`).trimStart();
      ta.value = n.body;
      save();
      await flush();
      toast('🔗 Notes reliées');
    }
  };

  cleanup = async () => {
    view.onclick = null;
    if (deleted) return;
    await flush();
    if (!n.title.trim() && !n.body.trim()) await brain.deleteNote(n.id); // note vide abandonnée
  };

  drawInbox();
  await Promise.all([drawSide(), drawProject()]);
  setMode(n.body.trim() ? 'read' : 'write');
  if (!n.title) $('#n-title').focus();
}

/* =========================================================
   Vue : Lanceur (raccourcis vers des sites et applications)
   ========================================================= */
let launcherEdit = false;

async function renderLauncher() {
  const items = await launcher.list();
  view.innerHTML = `
    <header class="page-head"><div><p class="eyebrow">Raccourcis</p><h1>Lanceur</h1></div>
      <div class="head-actions"><button class="btn ${launcherEdit ? 'primary' : ''}" id="ln-edit">${launcherEdit ? '✓ Terminé' : '✎ Modifier'}</button></div></header>
    <div class="launch-grid ${launcherEdit ? 'editing' : ''}">${items.map((it, i) => `
      <div class="lt-wrap" data-i="${i}">
        <button class="lt" data-open="${i}" title="${esc(it.mode === 'app' ? `Ouvrir l’application ${it.name}` : `Ouvrir ${it.name} dans une nouvelle fenêtre`)}">
          <span class="lt-ico" style="--c:${esc(it.color || '#4f46e5')}">${esc(it.icon || it.name[0])}</span>
          <span class="lt-name">${esc(it.name)}</span>
          <small class="muted">${it.mode === 'app' ? 'Application' : it.mode === 'tab' ? 'Onglet' : 'Fenêtre'}</small>
        </button>
        ${it.mode === 'app' && it.url && !launcherEdit ? `<button class="lt-web" data-web="${i}" title="Ouvrir la version web" aria-label="Version web de ${esc(it.name)}">🌐</button>` : ''}
        ${launcherEdit ? `<div class="lt-tools">
          <button data-mv="-1" ${i === 0 ? 'disabled' : ''} aria-label="Déplacer vers la gauche">‹</button>
          <button data-mv="1" ${i === items.length - 1 ? 'disabled' : ''} aria-label="Déplacer vers la droite">›</button>
          <button data-del aria-label="Retirer ${esc(it.name)}">×</button></div>` : ''}
      </div>`).join('')}
    </div>
    ${launcherEdit ? `<section class="card launch-add">
      <h2>Ajouter un raccourci</h2>
      <form id="ln-form" class="ln-form">
        <input name="name" placeholder="Nom (ex. Gmail)" required autocomplete="off">
        <input name="url" placeholder="Adresse (ex. mail.google.com)" required autocomplete="off" spellcheck="false">
        <input name="icon" placeholder="Icône (emoji, facultatif)" maxlength="2" autocomplete="off" style="max-width:150px">
        <select name="mode" aria-label="Ouverture"><option value="window">Nouvelle fenêtre</option><option value="tab">Onglet du navigateur</option></select>
        <button class="btn primary">Ajouter</button>
      </form>
      <button class="btn" id="ln-reset" type="button">Rétablir les raccourcis par défaut</button>
    </section>` : `<p class="hint muted">Les sites s’ouvrent chacun dans leur propre fenêtre (un 2e clic ramène la même). Edge et Spotify s’ouvrent comme applications Windows ; 🌐 ouvre la version web. Si rien ne s’ouvre, autorise les fenêtres pop-up pour Life Planner dans Edge.</p>
    <p class="hint muted">🧠 Pour enregistrer des posts Reddit dans ton Cerveau, installe l’extension du dossier <b>extension-edge</b> (voir le README).</p>`}`;

  $('#ln-edit').onclick = () => { launcherEdit = !launcherEdit; renderLauncher(); };
  $$('[data-open]').forEach((b) => (b.onclick = () => {
    if (launcherEdit) return;
    const it = items[Number(b.dataset.open)];
    if (!launcher.open(it)) toast('La fenêtre a été bloquée : autorise les pop-ups pour Life Planner dans Edge', 'err');
  }));
  $$('[data-web]').forEach((b) => (b.onclick = () => launcher.openWindow(items[Number(b.dataset.web)])));
  $$('.lt-tools [data-mv]').forEach((b) => (b.onclick = async () => {
    const i = Number(b.closest('.lt-wrap').dataset.i), j = i + Number(b.dataset.mv);
    [items[i], items[j]] = [items[j], items[i]];
    await launcher.save(items);
    renderLauncher();
  }));
  $$('.lt-tools [data-del]').forEach((b) => (b.onclick = async () => {
    items.splice(Number(b.closest('.lt-wrap').dataset.i), 1);
    await launcher.save(items);
    renderLauncher();
  }));
  $('#ln-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const it = launcher.makeItem({ name: f.name.value, url: f.url.value, icon: f.icon.value });
    it.mode = f.mode.value;
    items.push(it);
    await launcher.save(items);
    toast(`➕ ${it.name} ajouté au Lanceur`);
    renderLauncher();
  });
  $('#ln-reset')?.addEventListener('click', async () => {
    if (!(await confirmBox('Remettre les raccourcis par défaut (Edge, YouTube, Reddit, Facebook, Messenger, Spotify) ? Tes raccourcis ajoutés seront retirés.', 'Rétablir'))) return;
    await launcher.reset();
    renderLauncher();
  });
}

/* =========================================================
   Vue : Semaine
   ========================================================= */
/* ---------- Planificateur : onglets Semaine / Mois / Année / Journal ---------- */
function plannerTabs(active, d = new Date()) {
  const day = iso(d);
  const tabs = [['week', 'Semaine', `#/week/${day}`], ['month', 'Mois', `#/month/${day.slice(0, 7)}`], ['year', 'Année', `#/year/${d.getFullYear()}`], ['journal', '📖 Journal', `#/journal/${day}`]];
  return `<nav class="seg planner-tabs" aria-label="Vues du planificateur">${tabs.map(([k, l, h]) => `<a href="${h}" class="${k === active ? 'on' : ''}">${l}</a>`).join('')}</nav>`;
}
const moodOf = (j) => MOODS.find((m) => m.v === j?.mood);
const journalHas = (j) => !!(j && (j.mood || j.text || j.grat || j.lesson || j.intention));
const MONTH_FMT = new Intl.DateTimeFormat('fr-CA', { month: 'long', year: 'numeric' });
const MONTH_SHORT = new Intl.DateTimeFormat('fr-CA', { month: 'long' });

/** Vision : objectifs d'un horizon (mois, année…), avec progression. */
async function visionCard(title, horizons, empty) {
  const goals = (await db.all('goals')).filter((g) => horizons.includes(g.horizon)).sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
  return `<section class="card vision-card"><div class="card-head"><h2>${title}</h2><a href="#/goals">Objectifs →</a></div>
    ${goals.map((g) => `<div class="goal mini"><span class="title">${g.progress >= 100 ? '🏁 ' : ''}${esc(g.title)}</span><span class="pct">${g.progress}%</span><div class="bar"><i style="width:${g.progress}%"></i></div></div>`).join('')
    || `<p class="empty-sm">${empty} <a href="#/goals">En ajouter</a></p>`}</section>`;
}

/* =========================================================
   Vue : Mois
   ========================================================= */
async function renderMonth(arg) {
  const base = arg && /^\d{4}-\d{2}$/.test(arg) ? U.parseISO(arg + '-01') : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  const prev = new Date(base.getFullYear(), base.getMonth() - 1, 1);
  const gridStart = U.startOfWeek(first);
  const weeks = Math.ceil(((next - gridStart) / 86_400_000) / 7);
  const days = [...Array(weeks * 7)].map((_, i) => U.addDays(gridStart, i));
  const today = iso(new Date());
  const ym = (d) => iso(d).slice(0, 7);
  const [tasks, journal] = await Promise.all([db.all('tasks'), db.all('journal')]);
  const jBy = Object.fromEntries(journal.map((j) => [j.date, j]));

  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Planificateur</p><h1>${cap(MONTH_FMT.format(first))}</h1></div>
      <div class="head-actions">
        ${plannerTabs('month', first)}
        <span id="sync"></span>
        <a class="btn icon" href="#/month/${ym(prev)}" aria-label="Mois précédent">‹</a>
        <a class="btn" href="#/month">Ce mois-ci</a>
        <a class="btn icon" href="#/month/${ym(next)}" aria-label="Mois suivant">›</a>
      </div>
    </header>
    <div class="month-layout">
      <div class="card month-cal">
        <div class="mc-dows">${['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="mc-grid">${days.map((d) => {
          const k = iso(d), j = jBy[k], m = moodOf(j);
          const ts = tasks.filter((t) => t.date === k), td = ts.filter((t) => t.done).length;
          return `<div class="mc-day ${d.getMonth() !== first.getMonth() ? 'out' : ''} ${k === today ? 'is-today' : ''}" data-day="${k}">
            <div class="mc-top"><a class="mc-num" href="#/week/${k}" title="Voir la semaine">${d.getDate()}</a>
              <a class="mc-j ${journalHas(j) ? 'has' : ''}" href="#/journal/${k}" title="${journalHas(j) ? 'Ouvrir le journal de ce jour' : 'Écrire dans le journal'}">${m ? m.e : journalHas(j) ? '📝' : '✎'}</a></div>
            <ul class="mc-evs"></ul>
            ${ts.length ? `<a class="mc-tasks ${td === ts.length ? 'ok' : ''}" href="#/week/${k}" title="Missions">✓ ${td}/${ts.length}</a>` : ''}
          </div>`;
        }).join('')}</div>
      </div>
      <aside class="month-side">
        ${await visionCard(`🎯 Vision du mois`, ['mois'], 'Aucun objectif pour ce mois.')}
        ${await visionCard('📅 Cette semaine', ['semaine'], 'Aucun objectif pour la semaine.')}
        <section class="card"><div class="card-head"><h2>📖 Journal du mois</h2></div>
          ${(() => {
            const js = journal.filter((j) => j.date.startsWith(ym(first)) && journalHas(j));
            const moods = js.filter((j) => j.mood);
            const avg = moods.length ? moods.reduce((s, j) => s + j.mood, 0) / moods.length : 0;
            return `<p class="month-jstats"><b>${js.length}</b> jour${js.length > 1 ? 's' : ''} écrit${js.length > 1 ? 's' : ''}${moods.length ? ` · humeur moyenne ${MOODS[Math.round(avg) - 1].e}` : ''}</p>
              <div class="mood-strip">${days.filter((d) => d.getMonth() === first.getMonth()).map((d) => { const mm = moodOf(jBy[iso(d)]); return `<a href="#/journal/${iso(d)}" class="ms-cell m${mm?.v || 0}" title="${U.fmtShort(d)}${mm ? ' : ' + mm.l : ''}"></a>`; }).join('')}</div>`;
          })()}</section>
      </aside>
    </div>`;

  // Événements Google du mois (3 par jour au maximum)
  const { events, source } = await getEvents(gridStart, U.addDays(gridStart, weeks * 7));
  if (!$('#sync')) return;
  $('#sync').innerHTML = await syncBadge(source);
  $$('.mc-day').forEach((cell) => {
    const ds = +U.parseISO(cell.dataset.day), de = +U.addDays(ds, 1);
    const list = events.filter((e) => e.start < de && e.end > ds);
    cell.querySelector('.mc-evs').innerHTML = list.slice(0, 3).map((e) => `<li title="${esc(e.title)}">${e.allDay ? '' : `<small>${U.fmtTime(new Date(e.start))}</small> `}${esc(e.title)}</li>`).join('')
      + (list.length > 3 ? `<li class="more">+ ${list.length - 3}</li>` : '');
  });
}

/* =========================================================
   Vue : Année
   ========================================================= */
async function renderYear(arg) {
  const y = /^\d{4}$/.test(arg || '') ? Number(arg) : new Date().getFullYear();
  const today = iso(new Date());
  const [tasks, journal] = await Promise.all([db.all('tasks'), db.all('journal')]);
  const jBy = Object.fromEntries(journal.map((j) => [j.date, j]));
  const doneBy = {};
  for (const t of tasks) if (t.done && t.date?.startsWith(String(y))) doneBy[t.date] = (doneBy[t.date] || 0) + 1;
  const months = [...Array(12)].map((_, m) => new Date(y, m, 1));
  const written = journal.filter((j) => j.date.startsWith(String(y)) && journalHas(j)).length;
  const doneYear = Object.values(doneBy).reduce((s, n) => s + n, 0);

  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Planificateur</p><h1>${y}</h1></div>
      <div class="head-actions">
        ${plannerTabs('year', y === new Date().getFullYear() ? new Date() : new Date(y, 0, 1))}
        <a class="btn icon" href="#/year/${y - 1}" aria-label="Année précédente">‹</a>
        <a class="btn" href="#/year">Cette année</a>
        <a class="btn icon" href="#/year/${y + 1}" aria-label="Année suivante">›</a>
      </div>
    </header>
    <div class="year-layout">
      <div class="year-grid">${months.map((first) => {
        const gs = U.startOfWeek(first);
        const cells = [...Array(42)].map((_, i) => U.addDays(gs, i));
        return `<section class="card ym">
          <a class="ym-title" href="#/month/${iso(first).slice(0, 7)}">${cap(MONTH_SHORT.format(first))}</a>
          <div class="ym-grid">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<span class="ym-dow">${d}</span>`).join('')}
            ${cells.map((d) => {
              if (d.getMonth() !== first.getMonth()) return '<span></span>';
              const k = iso(d), m = moodOf(jBy[k]), n = doneBy[k] || 0;
              return `<a href="#/journal/${k}" class="ym-d m${m?.v || 0} ${n ? 'did' : ''} ${k === today ? 'is-today' : ''}" title="${U.fmtShort(d)}${m ? ' · ' + m.l : ''}${n ? ` · ${n} mission${n > 1 ? 's' : ''} accomplie${n > 1 ? 's' : ''}` : ''}">${d.getDate()}</a>`;
            }).join('')}</div>
        </section>`;
      }).join('')}</div>
      <aside class="month-side">
        ${await visionCard(`🌟 Vision ${y}`, ['annee'], 'Aucun objectif pour l’année.')}
        ${await visionCard('🧭 Long terme', ['vie'], 'Aucun objectif à long terme.')}
        <section class="card"><div class="card-head"><h2>📊 Bilan ${y}</h2></div>
          <p class="month-jstats"><b>${doneYear}</b> missions accomplies · <b>${written}</b> jours de journal</p>
          <div class="ym-legend"><span><i class="m5"></i>Super</span><span><i class="m4"></i>Bien</span><span><i class="m3"></i>Neutre</span><span><i class="m2"></i>Bof</span><span><i class="m1"></i>Difficile</span><span><i class="did-dot"></i>Mission faite</span></div>
        </section>
      </aside>
    </div>`;
}

async function renderWeek(arg) {
  const start = U.startOfWeek(arg ? U.parseISO(arg) : new Date());
  const days = [...Array(7)].map((_, i) => U.addDays(start, i));
  const today = iso(new Date());
  const end = U.addDays(start, 7);
  const sameMonth = start.getMonth() === U.addDays(end, -1).getMonth();
  const title = sameMonth
    ? `${start.getDate()} – ${U.addDays(end, -1).getDate()} ${new Intl.DateTimeFormat('fr-CA', { month: 'long', year: 'numeric' }).format(start)}`
    : `${U.fmtShort(start)} – ${U.fmtShort(U.addDays(end, -1))}`;
  const jBy = Object.fromEntries((await db.all('journal')).map((j) => [j.date, j]));

  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Planificateur</p><h1>${esc(title)}</h1></div>
      <div class="head-actions">
        ${plannerTabs('week', start)}
        <span id="sync"></span>
        <a class="btn icon" href="#/week/${iso(U.addDays(start, -7))}" aria-label="Semaine précédente">‹</a>
        <a class="btn" href="#/week">Cette semaine</a>
        <a class="btn icon" href="#/week/${iso(end)}" aria-label="Semaine suivante">›</a>
      </div>
    </header>
    <div class="week">${days.map((d) => {
      const k = iso(d);
      const j = jBy[k], m = moodOf(j);
      return `<section class="day ${k === today ? 'is-today' : ''}" data-day="${k}">
        <header><span class="dow">${U.fmtDow(d)}</span><span class="dnum">${d.getDate()}</span>
          <a class="day-j ${journalHas(j) ? 'has' : ''}" href="#/journal/${k}" title="${journalHas(j) ? 'Journal de ce jour' : 'Écrire dans le journal'}">${m ? m.e : '📖'}</a>
          <button class="btn icon sm" data-addev title="Ajouter un événement">+</button></header>
        <ul class="evs"></ul>
        <ul class="tasks"></ul>
        <form class="add-mini"><input name="t" placeholder="+ Mission" autocomplete="off"></form>
      </section>`;
    }).join('')}</div>`;

  await loadGoals();
  const drawTasks = async (dayEl) => {
    const k = dayEl.dataset.day;
    const items = (await db.all('tasks')).filter((t) => t.date === k).sort((a, b) => a.done - b.done || a.createdAt - b.createdAt);
    const ul = dayEl.querySelector('.tasks');
    ul.innerHTML = items.map((t) => taskHTML(t)).join('');
    bindTaskList(ul, () => drawTasks(dayEl));
  };

  const drawEvents = async () => {
    const { events, source } = await getEvents(start, end);
    if (!$('#sync')) return;
    $('#sync').innerHTML = await syncBadge(source);
    $$('.day').forEach((dayEl) => {
      const ds = +U.parseISO(dayEl.dataset.day), de = +U.addDays(ds, 1);
      const list = events.filter((e) => e.start < de && e.end > ds);
      dayEl.querySelector('.evs').innerHTML = list.map((e) => evItem(e, true)).join('');
      bindEvents(dayEl, list, drawEvents);
    });
  };

  $$('.day').forEach((dayEl) => {
    drawTasks(dayEl);
    dayEl.querySelector('[data-addev]').onclick = () => eventModal(dayEl.dataset.day, drawEvents);
    dayEl.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const v = e.target.t.value.trim();
      if (!v) return;
      await addTask(v, dayEl.dataset.day);
      e.target.t.value = '';
      drawTasks(dayEl);
    };
  });
  drawEvents();
}

/* =========================================================
   Vue : Journal de bord
   ========================================================= */
async function renderJournal(date) {
  date = date || iso(new Date());
  const d = U.parseISO(date);
  const entries = (await db.all('journal'))
    .filter((j) => j.mood || j.text || j.grat || j.lesson || j.intention)
    .sort((a, b) => b.date.localeCompare(a.date));
  const e = (await db.get('journal', date)) || { date };
  const meta = await db.get('pages', 'day-' + date);

  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Planificateur · Journal de bord</p><h1>${cap(U.fmtLong(d))}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}</h1></div>
      <div class="head-actions">
        ${plannerTabs('journal', d)}
        <a class="btn icon" href="#/journal/${iso(U.addDays(d, -1))}" aria-label="Jour précédent">‹</a>
        <input type="date" id="pick" value="${date}" style="width:auto">
        <a class="btn icon" href="#/journal/${iso(U.addDays(d, 1))}" aria-label="Jour suivant">›</a>
      </div>
    </header>
    <div class="journal-layout">
      <aside class="card entries">
        <h2>Entrées</h2>
        ${entries.map((j) => {
          const m = MOODS.find((x) => x.v === j.mood);
          const ex = (j.text || j.intention || j.grat || '').slice(0, 60);
          return `<a href="#/journal/${j.date}" class="${j.date === date ? 'on' : ''}"><span class="m">${m ? m.e : '📝'}</span>
            <span>${cap(U.fmtShort(U.parseISO(j.date)))}</span><small>${esc(ex) || '&nbsp;'}</small></a>`;
        }).join('') || '<p class="empty-sm" style="padding:0 8px">Tes entrées apparaîtront ici.</p>'}
      </aside>
      <section class="card editor">
        <div class="field"><h3>Humeur</h3>
          <div class="moods">${MOODS.map((m) => `<button class="mood ${e.mood === m.v ? 'on' : ''}" data-mood="${m.v}" title="${m.l}">${m.e}</button>`).join('')}</div>
        </div>
        <div class="field"><h3>Intention du jour</h3><textarea data-f="intention" placeholder="Qu’est-ce qui rendrait cette journée réussie ?">${esc(e.intention || '')}</textarea></div>
        <div class="field"><h3>Ce qui s’est passé</h3><textarea data-f="text" style="min-height:160px" placeholder="Raconte ta journée…">${esc(e.text || '')}</textarea></div>
        <div class="field"><h3>Gratitude</h3><textarea data-f="grat" placeholder="3 choses pour lesquelles tu es reconnaissant·e…">${esc(e.grat || '')}</textarea></div>
        <div class="field"><h3>Leçons &amp; idées</h3><textarea data-f="lesson" placeholder="Ce que j’ai appris, ce que je ferais autrement…">${esc(e.lesson || '')}</textarea></div>
        <a class="ink-link" href="#/page/day-${date}">
          <div class="thumb" style="${meta?.thumb ? `background-image:url(${meta.thumb})` : ''}"></div>
          <div><strong>Page manuscrite de ce jour</strong><br><span class="muted">${meta ? 'Ouvrir et continuer avec le stylet' : 'Écrire avec le Surface Pen'}</span></div>
        </a>
        <p class="saved muted" id="saved"></p>
      </section>
    </div>`;

  $('#pick').onchange = (ev) => { if (ev.target.value) location.hash = '#/journal/' + ev.target.value; };
  const save = U.debounce(async () => {
    e.updatedAt = Date.now();
    await db.put('journal', e);
    const s = $('#saved');
    if (s) s.textContent = 'Enregistré ✓';
    game.checkJournal(e);
  }, 500);
  const dirty = () => { $('#saved').textContent = 'Enregistrement…'; save(); };
  $$('[data-f]').forEach((t) => (t.oninput = () => { e[t.dataset.f] = t.value; dirty(); }));
  $$('[data-mood]').forEach((b) => (b.onclick = () => {
    e.mood = e.mood === Number(b.dataset.mood) ? 0 : Number(b.dataset.mood);
    $$('[data-mood]').forEach((x) => x.classList.toggle('on', Number(x.dataset.mood) === e.mood));
    dirty();
  }));
  cleanup = () => save.flush();
}

/* =========================================================
   Vue : Carnet (pages manuscrites)
   ========================================================= */
function pageCard(p) {
  return `<a class="pg" href="#/page/${encodeURIComponent(p.id)}">
    <div class="thumb" style="${p.thumb ? `background-image:url(${p.thumb})` : ''}"></div>
    <span class="t">${esc(p.title)}</span>
    <small>Modifiée le ${U.fmtShort(new Date(p.updatedAt))}</small>
    <button class="x" data-del="${esc(p.id)}" aria-label="Supprimer">×</button></a>`;
}

async function renderNotebook() {
  const pages = (await db.all('pages')).sort((a, b) => b.updatedAt - a.updatedAt);
  const notes = pages.filter((p) => !p.day);
  const days = pages.filter((p) => p.day);
  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Écriture manuscrite</p><h1>Carnet</h1></div>
      <div class="head-actions"><button class="btn primary" id="new-page">+ Nouvelle page</button></div>
    </header>
    <h3 class="section-title">Notes</h3>
    <div class="pages">
      <a class="pg new" href="#" id="new-page-2"><div class="thumb">+</div><span class="t">Nouvelle page</span></a>
      ${notes.map(pageCard).join('')}
    </div>
    ${days.length ? `<h3 class="section-title">Pages de journal</h3><div class="pages">${days.map(pageCard).join('')}</div>` : ''}`;

  const create = (e) => { e?.preventDefault(); newPageModal(); };
  $('#new-page').onclick = create;
  $('#new-page-2').onclick = create;
  $$('[data-del]').forEach((b) => (b.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const p = pages.find((x) => x.id === b.dataset.del);
    if (!(await confirmBox(`Supprimer la page « ${p.title} » ? Cette action est définitive.`))) return;
    await db.del('pages', p.id);
    await db.del('ink', p.id);
    renderNotebook();
  }));
}

function newPageModal() {
  modal(`<h2>Nouvelle page</h2>
    <form class="form">
      <label>Titre<input name="title" value="Note du ${esc(U.fmtShort(new Date()))}" autofocus autocomplete="off"></label>
      <div class="bg-pick">${BGS.map(([v, l], i) => `<label><input type="radio" name="bg" value="${v}" ${i === 0 ? 'checked' : ''}><span class="sw ${v}"></span>${l}</label>`).join('')}</div>
      <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Créer</button></div>
    </form>`, (m, close) => {
    const f = m.querySelector('form');
    f.title.select();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const id = U.uid();
      const now = Date.now();
      await db.put('pages', { id, title: f.title.value.trim() || 'Sans titre', bg: f.bg.value, createdAt: now, updatedAt: now, thumb: null });
      await db.put('ink', { id, strokes: [], height: 1414 });
      close();
      location.hash = '#/page/' + id;
    };
  });
}

/* =========================================================
   Vue : Éditeur manuscrit
   ========================================================= */
const ICONS = {
  pen: '<svg viewBox="0 0 24 24"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  hl: '<svg viewBox="0 0 24 24"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>',
  eraser: '<svg viewBox="0 0 24 24"><path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21z"/><path d="M22 21H7M5 11l9 9"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>',
  hand: '<svg viewBox="0 0 24 24"><path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.9-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/></svg>',
};

async function renderPage(id) {
  let meta = await db.get('pages', id);
  if (!meta) {
    if (!id.startsWith('day-')) { location.hash = '#/notebook'; return; }
    const day = id.slice(4);
    meta = { id, day, title: 'Journal — ' + U.fmtLong(U.parseISO(day)), bg: 'lines', createdAt: Date.now(), updatedAt: Date.now(), thumb: null };
  }
  const ink = (await db.get('ink', id)) || { id, strokes: [], height: 1414 };
  let pageDocs = [...(ink.docs || [])];
  const back = meta.day ? `#/journal/${meta.day}` : '#/notebook';

  view.innerHTML = `
    <div class="ink-shell">
      <div class="ink-bar">
        <a class="btn icon" href="${back}" aria-label="Retour">‹</a>
        <input class="ink-title" id="title" value="${esc(meta.title)}" aria-label="Titre de la page">
        <div class="seg" id="tools">
          <button data-tool="pen" class="on" title="Stylo">${ICONS.pen}</button>
          <button data-tool="hl" title="Surligneur">${ICONS.hl}</button>
          <button data-tool="eraser" title="Gomme (ou retourne ton stylet)">${ICONS.eraser}</button>
          <button data-tool="select" title="Sélection : déplacer, agrandir ou retirer une image"><svg viewBox="0 0 24 24"><path d="M5 3l14 7-6 2-2 6z"/></svg></button>
        </div>
        <label class="btn" id="ink-img" title="Ajouter une image (tu peux aussi la coller avec Ctrl + V ou la glisser sur la page)"><input type="file" accept="image/*" multiple hidden>🖼 Image</label>
        <label class="btn" id="ink-doc" title="Joindre un document à cette page (PDF, Word, EPUB…)"><input type="file" accept="${docs.ACCEPT}" multiple hidden>📎</label>
        <div class="seg" id="colors"></div>
        <div class="seg" id="sizes">${[6, 9, 13].map((s, i) => `<button data-size="${i}" class="${i === 1 ? 'on' : ''}" title="Épaisseur"><span class="dot" style="width:${s}px;height:${s}px"></span></button>`).join('')}</div>
        <div class="seg">
          <button id="undo" title="Annuler (Ctrl+Z)">${ICONS.undo}</button>
          <button id="redo" title="Rétablir (Ctrl+Y)">${ICONS.redo}</button>
        </div>
        <div class="seg"><button id="finger" title="Doigt : défiler (désactivé = le doigt dessine)" class="on">${ICONS.hand}</button></div>
        <span class="spacer"></span>
        <select id="bg" aria-label="Fond de page">${BGS.map(([v, l]) => `<option value="${v}" ${meta.bg === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn" id="more">+ Espace</button>
        <button class="btn" id="png">Exporter</button>
        <button class="btn danger" id="clear">Effacer</button>
        <span class="saved muted" id="saved"></span>
      </div>
      <div class="ink-docs" id="ink-docs" hidden></div>
      <div class="ink-scroll" id="ink-scroll"></div>
    </div>`;

  let saving = Promise.resolve();
  const save = U.debounce(() => {
    saving = (async () => {
      meta.updatedAt = Date.now();
      meta.thumb = ed.thumbnail();
      meta.bg = ed.bg;
      await db.put('ink', { id, strokes: ed.strokes, height: ed.H, images: ed.imgs, docs: pageDocs });
      await db.put('pages', meta);
      const s = $('#saved');
      if (s) s.textContent = 'Enregistré ✓';
      if (ed.strokes.length >= 5) game.award('ink:' + id, game.XP.ink, 'Page manuscrite');
    })();
    return saving;
  }, 800);

  const ed = new InkEditor($('#ink-scroll'), { ...ink, bg: meta.bg }, () => {
    $('#saved').textContent = '…';
    syncUndo();
    save();
  }, { imageUrl: images.url });

  // Images sur la page (comme OneNote) : coller, glisser ou 🖼 ; elles restent sous l'encre
  const seenImgs = new Set((ink.images || []).map((m) => m.id)); // pour effacer en sortant les images retirées

  // Documents joints à la page (bandeau au-dessus de la feuille)
  const drawDocs = async () => {
    const el = $('#ink-docs');
    if (!el) return;
    const ms = await docs.metas(pageDocs);
    el.hidden = !ms.length;
    el.innerHTML = `<span class="muted">📎 Joints :</span>${ms.map((m) => docs.chip(m, { remove: true })).join('')}`;
    $$('[data-doc-rm]', el).forEach((b) => (b.onclick = async () => {
      pageDocs = pageDocs.filter((x) => x !== b.dataset.docRm);
      $('#saved').textContent = '…';
      await save();
      await docs.removeUnused([b.dataset.docRm]);
      drawDocs();
    }));
  };
  const addDocsToPage = async (list) => {
    try {
      for (const f of list) pageDocs.push((await docs.save(f)).id);
      $('#saved').textContent = '…';
      save();
      drawDocs();
      toast(`📎 ${list.length > 1 ? list.length + ' documents joints' : 'Document joint'} à la page`);
    } catch (err) { toast(err.message, 'err'); }
  };
  const pickDoc = $('#ink-doc input');
  pickDoc.onchange = () => { addDocsToPage([...pickDoc.files]); pickDoc.value = ''; };
  drawDocs();
  const setTool = (t) => {
    ed.setTool(t);
    $$('[data-tool]').forEach((x) => x.classList.toggle('on', x.dataset.tool === t));
    drawColors();
  };
  const addImages = async (list, at = null) => {
    if (!list.length) return;
    try {
      for (const f of list) {
        const fid = await images.save(f);
        seenImgs.add(fid);
        const rec = await db.get('files', fid);
        ed.addImage(fid, rec?.w, rec?.h, at);
        if (at) at = [at[0] + 30, at[1] + 30]; // plusieurs images : légèrement décalées
      }
      setTool('select');
      toast('🖼 Image ajoutée : glisse-la pour la placer, tire le coin pour la redimensionner, puis reprends le stylo');
    } catch (err) { toast('Impossible d’ajouter l’image : ' + err.message, 'err'); }
  };
  const onPaste = (e) => {
    if (e.target.closest?.('input, textarea')) return;
    const list = images.imageFiles(e.clipboardData), ds = docs.docFiles(e.clipboardData?.files);
    if (list.length || ds.length) e.preventDefault();
    if (list.length) addImages(list);
    if (ds.length) addDocsToPage(ds);
  };
  document.addEventListener('paste', onPaste);
  const sc = $('#ink-scroll');
  sc.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  sc.addEventListener('drop', (e) => {
    const list = images.imageFiles(e.dataTransfer), ds = docs.docFiles(e.dataTransfer?.files);
    if (list.length || ds.length) e.preventDefault();
    if (list.length) addImages(list, ed.pos(e));
    if (ds.length) addDocsToPage(ds);
  });
  const pickImg = $('#ink-img input');
  let pickAt = null; // « Ajouter une image… » du clic droit : l'image va à l'endroit cliqué
  pickImg.onchange = () => { addImages([...pickImg.files], pickAt); pickAt = null; pickImg.value = ''; };

  // Clic droit (souris) : menu Coller / Ajouter une image / Retirer. Le bouton du stylet garde la gomme.
  const closeCtx = () => { $('#ink-ctx')?.remove(); removeEventListener('pointerdown', ctxOutside, true); removeEventListener('keydown', ctxKey); };
  const ctxOutside = (ev) => { if (!ev.target.closest('#ink-ctx')) closeCtx(); };
  const ctxKey = (ev) => { if (ev.key === 'Escape') closeCtx(); };
  const pasteFromClipboard = async (at) => {
    try {
      if (!navigator.clipboard?.read) throw new Error('unsupported');
      const blobs = [];
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) blobs.push(await item.getType(type));
      }
      if (!blobs.length) { toast('Le presse-papiers ne contient pas d’image (copie une image ou fais une capture avec Win + Maj + S)'); return; }
      await addImages(blobs, at);
    } catch (err) {
      toast(err.message === 'unsupported' ? 'Ton navigateur ne permet pas de lire le presse-papiers : utilise Ctrl + V' : 'Accès au presse-papiers refusé : autorise-le quand Edge le demande, ou utilise Ctrl + V', 'err');
    }
  };
  ed.page.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if ((e.pointerType || ed.lastPointer) !== 'mouse') return;
    closeCtx();
    const at = ed.pos(e);
    const hit = ed.imageAt(...at);
    const menu = document.createElement('div');
    menu.id = 'ink-ctx';
    menu.className = 'ctx-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <button role="menuitem" data-act="paste">📋 Coller <kbd>Ctrl+V</kbd></button>
      <button role="menuitem" data-act="pick">🖼 Ajouter une image…</button>
      ${hit ? '<hr><button role="menuitem" data-act="select">↔ Déplacer / redimensionner</button><button role="menuitem" data-act="del" class="danger">🗑 Retirer l’image</button>' : ''}
      <hr><button role="menuitem" data-act="undo" ${ed.undoStack.length ? '' : 'disabled'}>↶ Annuler <kbd>Ctrl+Z</kbd></button>`;
    document.body.appendChild(menu);
    menu.style.left = Math.min(e.clientX, innerWidth - menu.offsetWidth - 8) + 'px';
    menu.style.top = Math.min(e.clientY, innerHeight - menu.offsetHeight - 8) + 'px';
    menu.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
      closeCtx();
      const act = b.dataset.act;
      if (act === 'paste') pasteFromClipboard(at);
      else if (act === 'pick') { pickAt = at; pickImg.click(); }
      else if (act === 'select') { setTool('select'); ed.select(hit); }
      else if (act === 'del') { ed.select(hit); ed.deleteSelected(); }
      else if (act === 'undo') ed.undo();
    }));
    menu.querySelector('button')?.focus();
    addEventListener('pointerdown', ctxOutside, true);
    addEventListener('keydown', ctxKey);
  });

  const syncUndo = () => {
    $('#undo').disabled = !ed.undoStack.length;
    $('#redo').disabled = !ed.redoStack.length;
  };
  syncUndo();

  const drawColors = () => {
    const list = ed.tool === 'hl' ? HL_COLORS : INK_COLORS;
    const cur = ed.tool === 'hl' ? ed.hlColor : ed.color;
    $('#colors').innerHTML = list.map((c) => `<button data-color="${c}" class="${c === cur ? 'on' : ''}" title="Couleur"><span class="swatch" style="--sw:${c}"></span></button>`).join('');
    $('#colors').hidden = ed.tool === 'eraser' || ed.tool === 'select';
    $$('[data-color]').forEach((b) => (b.onclick = () => {
      if (ed.tool === 'hl') ed.hlColor = b.dataset.color; else ed.color = b.dataset.color;
      drawColors();
    }));
  };
  drawColors();

  $$('[data-tool]').forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  $$('[data-size]').forEach((b) => (b.onclick = () => {
    ed.sizeIdx = Number(b.dataset.size);
    $$('[data-size]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('#undo').onclick = () => ed.undo();
  $('#redo').onclick = () => ed.redo();
  $('#finger').onclick = (e) => {
    ed.fingerDraws = !ed.fingerDraws;
    e.currentTarget.classList.toggle('on', !ed.fingerDraws);
    toast(ed.fingerDraws ? 'Le doigt dessine' : 'Le doigt fait défiler la page');
  };
  $('#bg').onchange = (e) => ed.setBg(e.target.value);
  $('#more').onclick = () => { if (!ed.extend()) toast('Taille maximale de page atteinte'); else $('#ink-scroll').scrollBy({ top: 400, behavior: 'smooth' }); };
  $('#png').onclick = () => ed.exportPNG(meta.title);
  $('#clear').onclick = async () => { if (await confirmBox('Effacer tout le contenu de la page ? (Ctrl+Z pour annuler ensuite)', 'Effacer')) ed.clear(); };
  $('#title').oninput = (e) => { meta.title = e.target.value || 'Sans titre'; $('#saved').textContent = '…'; save(); };

  const onKey = (e) => {
    if (e.target.matches('input, textarea')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? ed.redo() : ed.undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); ed.redo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && ed.sel) { e.preventDefault(); ed.deleteSelected(); }
    else if (e.key === 'Escape' && ed.sel) ed.select(null);
  };
  const onHide = () => save.flush();
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);

  cleanup = async () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('paste', onPaste);
    closeCtx();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onHide);
    save.flush();
    await saving;
    images.removeUnused([...seenImgs].filter((fid) => !ed.imgs.some((m) => m.id === fid))).catch(() => {});
    ed.destroy();
  };
}

/* =========================================================
   Vue : Objectifs
   ========================================================= */
const openGoals = new Set(); // objectifs dont la liste de missions est dépliée
let goalsView = 'hz'; // page Objectifs : 'hz' (par échéance) ou 'proj' (par projet)

async function renderGoals() {
  const goals = await loadGoals();
  const tasks = await db.all('tasks');
  const today = iso(new Date());
  const sortM = (a, b) => a.done - b.done || (a.date || '9999').localeCompare(b.date || '9999') || a.createdAt - b.createdAt;
  const free = tasks.filter((t) => !t.goalId && !t.done).sort(sortM);
  const everyNote = await brain.allNotes();
  const relNotes = everyNote.filter((x) => !x.archived && (x.rel?.goals || []).length); // notes associées à des objectifs
  const allProjects = brain.projectsOf(everyNote, { withArchived: true }).sort((a, b) => a.title.localeCompare(b.title));
  const projects = allProjects.filter((p) => !p.archived);
  // Un projet archivé n'est plus proposé, sauf pour l'objectif qui y est déjà lié
  const projOptions = (current) => `<option value="">Aucun projet</option>`
    + allProjects.filter((p) => !p.archived || p.id === current).map((p) => `<option value="${p.id}" ${p.id === current ? 'selected' : ''}>🚀 ${esc(p.title || 'Projet sans titre')}</option>`).join('');
  // Les objectifs d'un projet sont rangés à part ; les autres par échéance
  const projGroups = allProjects.map((p) => ({ p, list: goals.filter((g) => g.projectId === p.id) })).filter((x) => x.list.length);
  const inGroup = new Set(projGroups.flatMap((x) => x.list.map((g) => g.id)));
  const dated = goals.filter((g) => !inGroup.has(g.id));

  const goalHTML = (g, inProjectGroup = false, prev = null, next = null) => {
    const ms = tasks.filter((t) => t.goalId === g.id).sort(sortM);
    const md = ms.filter((t) => t.done).length;
    const open = openGoals.has(g.id);
    const proj = g.projectId && allProjects.find((p) => p.id === g.projectId);
    return `<div class="goal ${open ? 'open' : ''}" data-id="${g.id}">
      <span class="title">${esc(g.title)}</span>
      <span class="g-tools"><span class="pct">${g.progress}%</span>
        <button class="g-mv" data-swap="${prev || ''}" ${prev ? '' : 'disabled'} aria-label="Monter l’objectif" title="Monter">↑</button><button class="g-mv" data-swap="${next || ''}" ${next ? '' : 'disabled'} aria-label="Descendre l’objectif" title="Descendre">↓</button>
        <button class="x g-del" aria-label="Supprimer l’objectif">×</button></span>
      ${proj && !inProjectGroup ? `<a class="chip proj-chip" href="#/note/${proj.id}" title="Projet du Cerveau${proj.archived ? ' (archivé)' : ''}">${proj.archived ? '🗄' : '🚀'} ${esc(proj.title || 'Projet')}</a>` : ''}
      ${ms.length
        ? `<div class="bar"><i style="width:${g.progress}%"></i></div>`
        : `<input type="range" min="0" max="100" step="5" value="${g.progress}" style="--v:${g.progress}%" aria-label="Progression">`}
      <button class="goal-toggle" aria-expanded="${open}">🎯 ${ms.length ? `${md}/${ms.length} mission${ms.length > 1 ? 's accomplies' : ' accomplie'}` : 'Ajouter des missions'}<span class="exp">›</span></button>
      ${g.projectId && g.horizon ? `<span class="chip hz-chip">📅 ${esc(HZ_LABEL[g.horizon])}</span>` : ''}
      ${open ? `<div class="goal-missions">
        <div class="goal-settings">
          <label class="goal-proj" title="Échéance">📅 <select class="g-hz" aria-label="Échéance">${hzOptions(g.horizon || '')}</select></label>
          <label class="goal-proj" title="Projet">🚀 <select class="g-proj" aria-label="Projet du Cerveau">${projOptions(g.projectId)}</select></label>
        </div>
        ${allProjects.length ? '' : '<p class="empty-sm" style="padding:0">Pour regrouper des objectifs, crée une note de type 🚀 Projet dans le Cerveau.</p>'}
        ${(() => { const ln = relNotes.filter((x) => (x.rel?.goals || []).includes(g.id)); return ln.length ? `<div class="assoc-list"><span class="muted">🧠 Notes :</span>${assoc.noteChips(ln)}</div>` : ''; })()}
        ${ms.length ? `<ul class="tasks">${ms.map((t) => taskHTML(t, today, { hideGoal: true, showDate: true })).join('')}</ul>`
          : '<p class="empty-sm">Découpe cet objectif en missions : sa progression avancera toute seule à chaque mission accomplie.</p>'}
        <button type="button" class="btn sm-text g-addm">+ Mission</button>
        <form class="add-mission" hidden>
          <input name="t" placeholder="Nouvelle mission…" autocomplete="off">
          <input name="d" type="date" value="${today}" aria-label="Date prévue (facultatif)" title="Date prévue (laisse vide pour « sans date »)">
          <button class="btn icon" aria-label="Ajouter la mission">+</button>
        </form>
        ${free.length ? `<select class="link-mission" aria-label="Lier une mission existante"><option value="">🔗 Lier une mission existante…</option>
          ${free.map((t) => `<option value="${t.id}">${esc(t.title)}${t.date ? ' · ' + U.fmtShort(U.parseISO(t.date)) : ''}</option>`).join('')}</select>` : ''}
      </div>` : ''}
    </div>`;
  };

  // Chiffres clés
  const active = goals.filter((g) => g.progress < 100);
  const reached = goals.filter((g) => g.progress >= 100);
  const linked = tasks.filter((t) => t.goalId && goals.some((g) => g.id === t.goalId));
  const avg = active.length ? Math.round(active.reduce((n, g) => n + (g.progress || 0), 0) / active.length) : 0;
  // Ordre choisi avec ↑ ↓ (sinon ordre de création)
  const byOrder = (a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0);
  const column = (title, list, extra = '') => {
    const open = list.filter((g) => g.progress < 100);
    const cAvg = open.length ? Math.round(open.reduce((n, g) => n + g.progress, 0) / open.length) : (list.length ? 100 : 0);
    return `<section class="card goal-col">
      <div class="card-head"><h2>${title}</h2><span class="muted">${list.length ? `${list.length - open.length}/${list.length} atteint${list.length - open.length > 1 ? 's' : ''}` : ''}</span></div>
      ${extra}${list.length ? `<div class="bar goal-col-bar" title="Progression moyenne"><i style="width:${cAvg}%"></i></div>` : ''}
      ${(() => { const s = [...list].sort(byOrder); return s.map((g, i) => goalHTML(g, !!extra, s[i - 1]?.id, s[i + 1]?.id)).join(''); })() || '<p class="empty-sm">Aucun objectif.</p>'}</section>`;
  };

  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Vision</p><h1>Objectifs</h1></div>
      <div class="seg wk-tabs" role="group" aria-label="Affichage">
        <button class="${goalsView === 'hz' ? 'on' : ''}" data-gv="hz">📅 Par échéance</button>
        <button class="${goalsView === 'proj' ? 'on' : ''}" data-gv="proj">🚀 Par projet${projGroups.length ? ` (${projGroups.length})` : ''}</button>
      </div>
    </header>
    <div class="kpis">
      <div class="kpi"><b>${active.length}</b><span>objectif${active.length > 1 ? 's' : ''} en cours</span></div>
      <div class="kpi"><b>${avg} %</b><span>progression moyenne</span></div>
      <div class="kpi ok"><b>${reached.length}</b><span>objectif${reached.length > 1 ? 's' : ''} atteint${reached.length > 1 ? 's' : ''} 🏁</span></div>
      <a class="kpi" href="#/missions"><b>${linked.filter((t) => t.done).length}/${linked.length}</b><span>missions liées accomplies</span></a>
    </div>
    <form class="card ms-add" id="add-goal">
      <input name="title" placeholder="Nouvel objectif…" autocomplete="off" required style="flex:3 1 240px">
      <select name="horizon" aria-label="Échéance">${hzOptions('mois')}</select>
      ${projects.length ? `<select name="project" aria-label="Projet">${projOptions('')}</select>` : ''}
      <button class="btn primary">Ajouter</button>
    </form>
    ${goalsView === 'hz'
      ? `<div class="goal-groups">${[...HORIZONS, ...(dated.some((g) => !g.horizon) ? [['', 'Sans échéance']] : [])]
        .map(([v, l]) => column(l, dated.filter((g) => (g.horizon || '') === v))).join('')}</div>`
      : projGroups.length
        ? `<div class="goal-groups">${projGroups.map(({ p, list }) => {
          const st = brain.projectStats(p.id, goals, tasks);
          return column(`<a href="#/note/${p.id}">${p.archived ? '🗄' : '🚀'} ${esc(p.title || 'Projet')}</a>`, list,
            `<p class="muted goal-proj-meta">${st.pct} % · ${st.missions ? `${st.done}/${st.missions} missions` : 'aucune mission'}</p>`);
        }).join('')}</div>`
        : '<div class="card empty-card"><p>Aucun objectif rattaché à un projet. Crée une note 🚀 Projet dans le Cerveau, puis choisis-la quand tu déplies un objectif.</p></div>'}
    <p class="hint muted">Ajoute des missions à un objectif : sa progression se calcule toute seule. Sans mission, règle-la avec le curseur. Déplie un objectif pour changer son échéance ou son projet.</p>`;
  $$('[data-gv]').forEach((b) => (b.onclick = () => { goalsView = b.dataset.gv; renderGoals(); }));

  $('#add-goal').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const title = f.title.value.trim();
    if (!title) return;
    const id = U.uid();
    await db.put('goals', { id, title, horizon: f.horizon.value, projectId: f.project?.value || null, progress: 0, createdAt: Date.now() });
    openGoals.add(id);
    await renderGoals();
    $(`.goal[data-id="${id}"] .g-addm`)?.click(); // nouvel objectif : la boîte « mission » s'ouvre tout de suite
  };
  $$('.goal').forEach((el) => {
    const id = el.dataset.id;
    const range = el.querySelector('input[type=range]');
    if (range) {
      range.oninput = () => { el.querySelector('.pct').textContent = range.value + '%'; range.style.setProperty('--v', range.value + '%'); };
      range.onchange = async () => {
        const g = await db.get('goals', id);
        g.progress = Number(range.value);
        await db.put('goals', g);
        await game.syncGoal(g);
      };
    }
    el.querySelector('.goal-toggle').onclick = () => { openGoals.has(id) ? openGoals.delete(id) : openGoals.add(id); renderGoals(); };
    // ↑ ↓ : échange la place avec l'objectif voisin de la même colonne
    el.querySelectorAll('.g-mv').forEach((b) => (b.onclick = async () => {
      const other = b.dataset.swap;
      if (!other) return;
      const [a, c] = await Promise.all([db.get('goals', id), db.get('goals', other)]);
      let oa = a.order ?? a.createdAt ?? 0, oc = c.order ?? c.createdAt ?? 0;
      if (oa === oc) oc += b.textContent === '↑' ? -1 : 1;
      a.order = oc; c.order = oa;
      await db.put('goals', a);
      await db.put('goals', c);
      renderGoals();
    }));
    el.querySelector('.g-del').onclick = async () => {
      const ms = await missionsOf(id);
      const g = goals.find((x) => x.id === id);
      if (!(await confirmBox(`Supprimer l’objectif « ${g.title} » ?${ms.length ? ` Ses ${ms.length} mission(s) seront gardées, sans objectif.` : ''}`))) return;
      for (const t of ms) { t.goalId = null; await db.put('tasks', t); }
      await db.del('goals', id);
      renderGoals();
    };
    const box = el.querySelector('.goal-missions');
    if (!box) return;
    box.querySelector('.g-proj').onchange = async (e) => { await brain.setGoalProject(id, e.target.value); renderGoals(); };
    box.querySelector('.g-hz').onchange = async (e) => {
      const g = await db.get('goals', id);
      g.horizon = e.target.value;
      await db.put('goals', g);
      toast(`📅 Échéance : ${HZ_LABEL[g.horizon]}`);
      renderGoals();
    };
    bindTaskList(box, renderGoals);
    box.querySelector('.g-addm').onclick = (e) => {
      const f = box.querySelector('.add-mission');
      f.hidden = !f.hidden;
      e.currentTarget.textContent = f.hidden ? '+ Mission' : '− Fermer';
      if (!f.hidden) f.t.focus();
    };
    box.querySelector('.add-mission').onsubmit = async (e) => {
      e.preventDefault();
      const v = e.target.t.value.trim();
      if (!v) return;
      await addTask(v, e.target.d.value || null, id);
      await renderGoals();
      // On garde la boîte ouverte pour enchaîner plusieurs missions
      const box2 = $(`.goal[data-id="${id}"] .goal-missions`);
      if (box2) { box2.querySelector('.add-mission').hidden = false; box2.querySelector('.g-addm').textContent = '− Fermer'; box2.querySelector('.add-mission input').focus(); }
    };
    const link = box.querySelector('.link-mission');
    if (link) link.onchange = async () => {
      if (!link.value) return;
      await setTaskGoal(link.value, id);
      renderGoals();
    };
  });
}

/* =========================================================
   Vue : Réglages
   ========================================================= */
async function renderSettings() {
  const clientId = (await db.get('settings', 'clientId')) || '';
  const connected = gcal.isConnected();
  const aKey = await db.get('settings', 'anthropicKey');
  const aModel = (await db.get('settings', 'assistantModel')) || assistant.DEFAULT_MODEL;
  view.innerHTML = `
    <header class="page-head"><div><p class="eyebrow">Configuration</p><h1>Réglages</h1></div></header>
    <div class="settings">
      <section class="card">
        <div class="card-head"><h2>Google Agenda</h2>${connected ? '<span class="sync live">Connecté</span>' : ''}</div>
        <p class="muted" style="margin-top:0">Une seule fois : crée ton propre identifiant Google (gratuit, ~5 minutes).</p>
        <ol class="steps">
          <li>Va sur <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">console.cloud.google.com</a> et crée un projet (ex. « Life Planner »).</li>
          <li>Active les API : <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noopener">Google Calendar API</a> et <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener">Google Drive API</a> (pour la synchro) → <em>Activer</em>.</li>
          <li><a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noopener">Écran de consentement OAuth</a> : type <em>Externe</em>, puis dans <em>Audience</em> ajoute ton adresse Gmail comme <em>utilisateur test</em>.</li>
          <li><a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener">Clients</a> → <em>Créer un client</em> → type <em>Application Web</em>. Dans <em>Origines JavaScript autorisées</em>, ajoute <code>${esc(location.origin)}</code>.</li>
          <li>Copie l’<em>ID client</em> (se termine par <code>.apps.googleusercontent.com</code>) et colle-le ci-dessous.</li>
        </ol>
        <form class="form" id="cid-form">
          <label>ID client OAuth<input name="cid" value="${esc(clientId)}" placeholder="123456789-abc….apps.googleusercontent.com" autocomplete="off" spellcheck="false"></label>
          <div><button class="btn">Enregistrer l’ID</button></div>
        </form>
        <div class="status-line">
          ${connected
            ? '<button class="btn" id="g-off">Déconnecter</button>'
            : `<button class="btn primary" data-gconnect ${clientId ? '' : 'disabled'}>Connecter Google Agenda</button>`}
        </div>
        <div id="cals"></div>
      </section>

      <section class="card" id="sync-card"></section>

      <section class="card">
        <div class="card-head"><h2>Assistant (Claude)</h2>${aKey ? '<span class="sync live">Activé</span>' : ''}</div>
        <p class="muted" style="margin-top:0">Sans clé, l’assistant de la page Aujourd’hui comprend des commandes simples. Avec une clé API Claude, tu peux lui demander n’importe quoi en langage libre.</p>
        <ol class="steps">
          <li>Crée un compte sur <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a> et ajoute un peu de crédit (facturé à l’usage : une demande coûte en général moins d’un cent avec Opus).</li>
          <li>Dans <em>API Keys</em>, crée une clé et colle-la ci-dessous.</li>
        </ol>
        <form class="form" id="ak-form">
          <label>Clé API<input name="key" type="password" value="" placeholder="${aKey ? '•••••••• (clé enregistrée)' : 'sk-ant-…'}" autocomplete="off" spellcheck="false"></label>
          <label>Modèle<select name="model">${assistant.MODELS.map(([v, l]) => `<option value="${v}" ${v === aModel ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <div class="head-actions"><button class="btn">Enregistrer</button>${aKey ? '<button class="btn danger" type="button" id="ak-del">Retirer la clé</button>' : ''}</div>
        </form>
        <p class="muted hint">La clé reste sur cet appareil : elle n’est envoyée qu’à api.anthropic.com et n’est jamais incluse dans les sauvegardes exportées.</p>
      </section>

      <section class="card">
        <div class="card-head"><h2>Sauvegarde</h2></div>
        <p class="muted" style="margin-top:0">Tes données (journal, missions, pages manuscrites) sont stockées sur cet appareil. Exporte régulièrement une sauvegarde — par exemple dans ton OneDrive.</p>
        <div class="head-actions">
          <button class="btn" id="exp">Exporter une sauvegarde</button>
          <label class="btn">Importer…<input type="file" id="imp" accept="application/json,.json" hidden></label>
        </div>
      </section>

      <section class="card rem-card" id="rem-card"></section>

      <section class="card logo-card" id="logo-card"></section>

      <section class="card">
        <div class="card-head"><h2>Menu</h2><button class="btn as-reset" id="nav-reset" type="button">Ordre par défaut</button></div>
        <p class="muted" style="margin-top:0">Change l’ordre des onglets avec les flèches. Réglages reste toujours en bas.</p>
        <ol class="nav-order" id="nav-order"></ol>
      </section>

      <section class="card">
        <div class="card-head"><h2>Apparence</h2></div>
        <select id="theme" style="width:auto">
          <option value="">Selon Windows</option><option value="light">Clair</option><option value="dark">Sombre</option>
        </select>
      </section>
    </div>`;

  $('#cid-form').onsubmit = async (e) => {
    e.preventDefault();
    const v = e.target.cid.value.trim();
    if (v && !v.endsWith('.apps.googleusercontent.com')) { toast('Cet ID ne ressemble pas à un ID client Google', 'err'); return; }
    await db.put('settings', v, 'clientId');
    if (v !== clientId) await gcal.disconnect();
    toast('ID enregistré');
    gcal.preload();
    renderSettings();
  };
  $('#ak-form').onsubmit = async (e) => {
    e.preventDefault();
    const k = e.target.key.value.trim();
    if (k && !k.startsWith('sk-ant-')) { toast('Cette clé ne ressemble pas à une clé API Anthropic (sk-ant-…)', 'err'); return; }
    if (k) await db.put('settings', k, 'anthropicKey');
    await db.put('settings', e.target.model.value, 'assistantModel');
    toast(k ? 'Clé enregistrée — l’assistant utilise maintenant Claude ✨' : 'Modèle enregistré');
    renderSettings();
  };
  syncCard(clientId);

  // Ordre des onglets
  const drawNav = async (focusKey, dir) => {
    const order = await navOrder();
    $('#nav-order').innerHTML = order.map((k, i) => {
      const a = $(`#rail a[data-route="${k}"]`);
      return `<li data-k="${k}"><span class="nav-ico">${a.querySelector('svg').outerHTML}</span><span class="nav-name">${esc(a.querySelector('span').textContent)}</span>
        <button class="nav-mv" data-dir="-1" aria-label="Monter ${esc(a.querySelector('span').textContent)}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="nav-mv" data-dir="1" aria-label="Descendre ${esc(a.querySelector('span').textContent)}" ${i === order.length - 1 ? 'disabled' : ''}>↓</button></li>`;
    }).join('');
    $$('#nav-order .nav-mv').forEach((b) => (b.onclick = async () => {
      const k = b.closest('li').dataset.k, d = Number(b.dataset.dir);
      const o = await navOrder();
      const i = o.indexOf(k);
      [o[i], o[i + d]] = [o[i + d], o[i]];
      await db.put('settings', o, 'navOrder');
      await applyNavOrder();
      drawNav(k, d);
    }));
    if (focusKey) {
      const btn = $(`#nav-order li[data-k="${focusKey}"] .nav-mv[data-dir="${dir}"]`);
      (btn && !btn.disabled ? btn : $(`#nav-order li[data-k="${focusKey}"] .nav-mv:not(:disabled)`))?.focus();
    }
  };
  drawNav();
  $('#nav-reset').onclick = async () => { await db.del('settings', 'navOrder'); await applyNavOrder(); drawNav(); toast('Ordre du menu rétabli'); };

  // Rappels fiables (Google Agenda)
  const drawRem = async () => {
    const el = $('#rem-card');
    if (!el) return;
    const on = await reminders.isOn();
    const connected = gcal.isConnected();
    const hasClient = !!(await db.get('settings', 'clientId'));
    const st = reminders.getStatus();
    const map = (await db.get('settings', 'remMap')) || {};
    const n = Object.keys(map).length;
    el.innerHTML = `<div class="card-head"><h2>🔔 Rappels fiables</h2><span class="chip ${on ? 'ok' : ''}">${on ? 'Activés' : 'Désactivés'}</span></div>
      <p class="muted" style="margin-top:0">Une page web ne peut sonner que si elle est ouverte. Avec cette option, chaque <b>alarme de mission</b> et chaque <b>rappel d’habitude</b> est aussi créé dans ton <b>Google Agenda</b>, avec une notification à l’heure : ton cellulaire et ta montre sonnent même quand Life Planner est fermé.</p>
      ${on ? `<p class="rem-state">${n} rappel${n > 1 ? 's' : ''} dans Google Agenda${st.last ? ` · vérifié ${U.fmtTime(new Date(st.last))}` : ''}${st.error ? ` · <span class="warn-text">⚠ ${esc(st.error)}</span>` : ''}</p>` : ''}
      <div class="rem-actions">
        ${!hasClient ? '<a class="btn" href="#/settings" id="rem-setup">Configure d’abord Google Agenda (plus bas)</a>'
          : !connected ? '<button class="btn" data-gconnect>Connecter Google</button>' : ''}
        ${on ? '<button class="btn" id="rem-now">↻ Vérifier maintenant</button><button class="btn danger" id="rem-off">Désactiver et retirer les rappels</button>'
          : `<button class="btn primary" id="rem-on" ${connected ? '' : 'disabled'}>Activer les rappels fiables</button>`}
      </div>
      <p class="hint muted">Sur ton cellulaire, installe l’app <b>Google Agenda</b> et autorise ses notifications. Les rappels apparaissent dans ton agenda avec ⏰ (missions) ou 🔁 (habitudes) ; Life Planner les cache de son propre agenda pour éviter les doublons. Une alarme retirée ou une mission faite est retirée de Google Agenda.</p>`;
    $('#rem-on', el)?.addEventListener('click', async (e) => {
      e.target.disabled = true; e.target.textContent = 'Création des rappels…';
      await reminders.setOn(true);
      const s2 = reminders.getStatus();
      toast(s2.error ? '⚠ ' + s2.error : `🔔 ${s2.count} rappel${s2.count > 1 ? 's' : ''} ajouté${s2.count > 1 ? 's' : ''} à Google Agenda`, s2.error ? 'err' : '');
      drawRem();
    });
    $('#rem-now', el)?.addEventListener('click', async () => { await reminders.reconcile(true); drawRem(); toast('Rappels vérifiés'); });
    $('#rem-off', el)?.addEventListener('click', async () => {
      if (!(await confirmBox('Retirer de Google Agenda tous les rappels créés par Life Planner ? (Tes alarmes et habitudes restent dans l’app.)', 'Désactiver'))) return;
      await reminders.setOn(false);
      toast('Rappels retirés de Google Agenda');
      drawRem();
    });
  };
  drawRem();
  addEventListener('lp-google', drawRem, { once: true });

  // Logo et nom de l'app : ce qui te représente
  const drawLogo = async () => {
    const el = $('#logo-card');
    if (!el) return;
    const cfg = await getLogo();
    const av = await getAvatar();
    const modes = [['avatar', 'Mon avatar'], ['mono', 'Mes initiales'], ['emoji', 'Un emoji'], ['app', 'Logo d’origine']];
    el.innerHTML = `<div class="card-head"><h2>🎨 Mon logo</h2><span class="muted">Menu et onglet du navigateur · un clic sur le logo ouvre Aujourd’hui</span></div>
      <div class="logo-modes">${modes.map(([m, l]) => `<button type="button" class="logo-opt ${cfg.mode === m ? 'on' : ''}" data-lmode="${m}">${logoSVG({ ...cfg, mode: m }, av, 52)}<span>${l}</span></button>`).join('')}</div>
      <div class="logo-fields">
        <label>Nom affiché<input id="lg-title" value="${esc(cfg.title)}" maxlength="24" placeholder="Life Planner" autocomplete="off"></label>
        ${cfg.mode === 'mono' ? `<label>Initiales<input id="lg-text" value="${esc(cfg.text || initialsOf(av.name))}" maxlength="3" autocomplete="off" style="text-transform:uppercase"></label>` : ''}
        ${cfg.mode === 'emoji' ? `<label>Emoji<input id="lg-emoji" value="${esc(cfg.emoji)}" maxlength="4" autocomplete="off"></label>` : ''}
      </div>
      ${cfg.mode !== 'app' ? `<div class="logo-colors"><span class="muted">Couleur</span>${LOGO_COLORS.map((c) => `<button type="button" class="logo-col ${cfg.color === c ? 'on' : ''}" data-lcol="${c}" style="--sw:${c}" aria-label="Couleur ${c}"></button>`).join('')}
        <input type="color" id="lg-color" value="${esc(cfg.color)}" aria-label="Autre couleur"></div>` : ''}
      ${cfg.mode === 'avatar' ? '<p class="hint muted">Ton logo suit ton héros : change son apparence dans la page Ton héros, il évolue avec toi.</p>' : ''}`;
    const set = async (patch, redraw = true) => {
      await db.put('settings', { ...(await getLogo()), ...patch }, 'logo');
      await applyLogo();
      if (redraw) drawLogo();
    };
    $$('[data-lmode]', el).forEach((b) => (b.onclick = () => set({ mode: b.dataset.lmode })));
    $$('[data-lcol]', el).forEach((b) => (b.onclick = () => set({ color: b.dataset.lcol })));
    $('#lg-color', el)?.addEventListener('change', (e) => set({ color: e.target.value }));
    const deb = U.debounce((patch) => set(patch, false), 400);
    $('#lg-title', el).oninput = (e) => deb({ title: e.target.value.trim() || 'Life Planner' });
    $('#lg-text', el)?.addEventListener('input', (e) => deb({ text: e.target.value.trim().toUpperCase() }));
    $('#lg-emoji', el)?.addEventListener('input', (e) => { if (e.target.value.trim()) deb({ emoji: e.target.value.trim() }); });
  };
  drawLogo();

  $('#ak-del')?.addEventListener('click', async () => { await db.del('settings', 'anthropicKey'); toast('Clé retirée'); renderSettings(); });
  $('#g-off')?.addEventListener('click', async () => { await gcal.disconnect(); toast('Déconnecté'); renderSettings(); });

  // Choix des agendas
  if (connected) {
    try {
      const all = await gcal.listCalendars();
      const sel = (await gcal.selectedCalendars()).map((c) => c.id);
      const primaryId = all.find((c) => c.primary)?.id;
      const isSel = (c) => sel.includes(c.id) || (c.primary && sel.includes('primary'));
      const def = (await db.get('settings', 'defaultCal')) || 'primary';
      $('#cals').innerHTML = `<h3 style="margin:18px 0 4px;font-size:14px">Agendas affichés</h3>
        <div class="cal-list">${all.map((c) => `<label><input type="checkbox" value="${esc(c.id)}" ${isSel(c) ? 'checked' : ''}><span class="c" style="background:${esc(c.color)}"></span>${esc(c.name)}</label>`).join('')}</div>
        <label class="form" style="margin-top:12px"><span style="font-size:13px;font-weight:600;color:var(--muted)">Agenda pour les nouveaux événements</span>
          <select id="defcal" style="width:auto">${all.filter((c) => c.writable).map((c) => `<option value="${esc(c.id)}" ${(c.id === def || (def === 'primary' && c.primary)) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>`;
      $$('#cals input[type=checkbox]').forEach((cb) => (cb.onchange = async () => {
        const chosen = $$('#cals input[type=checkbox]:checked').map((x) => all.find((c) => c.id === x.value));
        await db.put('settings', chosen.map((c) => ({ id: c.id, name: c.name, color: c.color, writable: c.writable })), 'calendars');
        await db.put('cache', [], 'events');
        toast('Agendas mis à jour');
      }));
      $('#defcal').onchange = (e) => db.put('settings', e.target.value === primaryId ? 'primary' : e.target.value, 'defaultCal');
    } catch (err) { gError(err); }
  }

  // Sauvegarde
  $('#exp').onclick = async () => {
    const data = { app: 'lifeplanner', version: 1, exportedAt: new Date().toISOString(), stores: {} };
    for (const s of STORES) if (s !== 'cache') data.stores[s] = await db.entries(s);
    data.stores.settings = data.stores.settings.filter(([k]) => k !== 'anthropicKey'); // la clé API ne sort jamais de l'appareil
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lifeplanner-sauvegarde-${iso(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };
  $('#imp').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'lifeplanner') throw new Error('Fichier non reconnu');
      if (!(await confirmBox('Remplacer toutes les données actuelles par cette sauvegarde ?', 'Restaurer'))) return;
      const keepKey = await db.get('settings', 'anthropicKey');
      for (const [s, rows] of Object.entries(data.stores)) {
        if (!STORES.includes(s)) continue;
        await db.clear(s);
        if (s === 'settings' && keepKey) await db.put('settings', keepKey, 'anthropicKey');
        const inline = s !== 'settings';
        for (const [k, v] of rows) await (inline ? db.put(s, v) : db.put(s, v, k));
      }
      toast('Sauvegarde restaurée ✓');
      renderSettings();
    } catch (err) { toast('Import impossible : ' + err.message, 'err'); }
  };

  // Thème
  const theme = localStorage.getItem('lp.theme') || '';
  $('#theme').value = theme;
  $('#theme').onchange = (e) => {
    try { localStorage.setItem('lp.theme', e.target.value); } catch { /* ignore */ }
    applyTheme();
  };
}

/* ---------- Synchronisation entre appareils (Réglages) ---------- */
const isLocalHost = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const setupLink = (cid) => `${location.origin}${location.pathname}#/setup/${encodeURIComponent(cid)}`;

function ago(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return U.fmtShort(new Date(ms));
}

let syncUnsub = null;
function syncCard(clientId) {
  const el = $('#sync-card');
  if (!el) return;
  const draw = () => {
    if (!document.body.contains(el)) { syncUnsub?.(); return; }
    const s = sync.status();
    const msg = {
      idle: 'En attente…', syncing: '🔄 Synchronisation en cours…', ok: `✅ À jour · ${s.last ? ago(s.last) : ''}`,
      login: '🔑 Connexion Google expirée : touche n’importe où sur l’écran pour te reconnecter (ou clique ci-dessous).',
      permission: '⚠️ Google n’a pas encore autorisé l’accès au Drive : clique « Autoriser ».',
      offline: '📴 Hors ligne : la synchro reprendra au retour d’internet.',
      error: '❌ ' + s.error,
    }[s.status] || '';
    el.innerHTML = `<div class="card-head"><h2>Synchronisation (cellulaire)</h2>${s.on ? '<span class="sync live">Activée</span>' : ''}</div>
      <p class="muted" style="margin-top:0">Retrouve tes missions, ton journal, tes pages, ton Cerveau et tes XP sur tous tes appareils. Les données passent par un dossier caché et privé de ton Google Drive (propre à l’app, invisible dans Drive).</p>
      ${!clientId ? '<p class="empty-sm">Configure d’abord l’ID client Google ci-dessus (section Google Agenda).</p>'
        : s.on ? `<p class="sync-state">${esc(msg)}</p>
          <div class="head-actions">
            ${s.status === 'permission' || s.status === 'login' ? '<button class="btn primary" id="sy-auth">Autoriser / reconnecter</button>' : ''}
            <button class="btn" id="sy-now">Synchroniser maintenant</button>
            <button class="btn danger" id="sy-off">Désactiver sur cet appareil</button>
          </div>`
        : '<div class="head-actions"><button class="btn primary" id="sy-on">☁️ Activer la synchronisation</button></div>'}
      ${clientId ? `<div class="sync-phone">
        <h3>📱 Sur ton cellulaire</h3>
        ${isLocalHost()
          ? '<p class="muted">Une fois l’app en ligne (GitHub Pages), un code QR ici permettra de configurer ton cellulaire en un geste. Pour l’instant, active la synchro sur cette Surface : tes données seront prêtes dans ton Drive.</p>'
          : `<p class="muted">Scanne ce code avec l’appareil photo du cellulaire (ou ouvre le lien) : l’ID client Google s’y configure tout seul. Ensuite, sur le cellulaire : Réglages → Activer la synchronisation.</p>
             <div class="qr" id="sy-qr"></div>
             <div class="head-actions"><button class="btn" id="sy-copy">Copier le lien</button></div>`}
      </div>` : ''}`;
    $('#sy-on', el)?.addEventListener('click', async () => {
      try {
        await gcal.connect(); // inclut l'accès au dossier privé du Drive
        sync.enable();
        const n = await sync.syncNow();
        toast(n ? `☁️ Synchro activée · ${n} élément(s) reçu(s)` : '☁️ Synchro activée : tes données sont dans ton Drive');
      } catch (err) { gError(err); }
      draw();
    });
    $('#sy-auth', el)?.addEventListener('click', () => gcal.connect().then(() => sync.syncNow()).catch(gError));
    $('#sy-now', el)?.addEventListener('click', async () => {
      const n = await sync.syncNow();
      toast(sync.status().status === 'ok' ? (n ? `☁️ ${n} élément(s) reçu(s)` : '☁️ Tout est à jour') : 'Synchro impossible pour l’instant');
    });
    $('#sy-off', el)?.addEventListener('click', async () => {
      if (!(await confirmBox('Arrêter la synchronisation sur cet appareil ? Tes données restent ici et dans ton Drive.', 'Désactiver'))) return;
      sync.disable();
    });
    $('#sy-copy', el)?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(setupLink(clientId)); toast('Lien copié'); } catch { prompt('Copie ce lien :', setupLink(clientId)); }
    });
    const qr = $('#sy-qr', el);
    if (qr) drawQR(qr, setupLink(clientId));
  };
  syncUnsub?.();
  syncUnsub = sync.onStatus(draw);
  draw();
}

let qrLib = null;
function drawQR(el, text) {
  qrLib ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = res; s.onerror = () => { qrLib = null; rej(); };
    document.head.appendChild(s);
  });
  qrLib.then(() => {
    el.innerHTML = '';
    new window.QRCode(el, { text, width: 180, height: 180, colorDark: '#111', colorLight: '#fff' });
  }).catch(() => { el.innerHTML = '<p class="empty-sm">Code QR indisponible hors ligne : utilise « Copier le lien ».</p>'; });
}

/** #/setup/<clientId> : configure un nouvel appareil d'un geste (lien ou code QR). */
async function renderSetup(cid) {
  if (cid && /\.apps\.googleusercontent\.com$/.test(cid)) {
    await db.put('settings', cid, 'clientId');
    gcal.preload();
    toast('✅ Google configuré : active maintenant la synchronisation');
  }
  location.replace('#/settings');
}

/* ---------- Ordre des onglets du menu ---------- */
const NAV_KEYS = ['today', 'missions', 'brain', 'goals', 'workout', 'rbq', 'news']; // Journal : dans le Planificateur (icône 📅 à côté du logo) // Habitudes : dans la page du héros // Semaine, Carnet et Lanceur : icônes à côté du logo
async function navOrder() {
  const saved = ((await db.get('settings', 'navOrder')) || []).filter((k) => NAV_KEYS.includes(k));
  return [...saved, ...NAV_KEYS.filter((k) => !saved.includes(k))];
}
const PHONE_TABS = 4; // sur cellulaire : les 4 premiers onglets dans la barre du bas, le reste dans « Plus »
async function applyNavOrder() {
  const rail = $('#rail');
  const end = rail.querySelector('#rail-more'); // « Plus » puis Réglages restent en bas
  (await navOrder()).forEach((k, i) => {
    const a = rail.querySelector(`a[data-route="${k}"]`);
    if (!a) return;
    rail.insertBefore(a, end);
    a.classList.toggle('nav-extra', i >= PHONE_TABS);
  });
}

// Menu « Plus » (cellulaire)
$('#rail-more').onclick = () => {
  const links = [$('#hero-mini'), ...$$('#rail a.nav-extra'), $('#rail a[data-route="settings"]')];
  // Sur cellulaire le logo est caché : Semaine, Carnet et Lanceur sont dans « Plus »
  const launch = [...$$('#rail .brand-tools a'), $('#brand-launch')].map((b) => {
    const href = b.getAttribute('href') || '#/launcher';
    const on = b.classList.contains('active');
    return `<a href="${href}" data-close class="${on ? 'active' : ''}">${b.querySelector('svg').outerHTML}<span>${esc(b.getAttribute('aria-label'))}</span></a>`;
  }).join('');
  modal(`<h2>Plus</h2><nav class="more-sheet">${launch}${links.map((a) => {
    const route = a.dataset.route;
    const label = route === 'hero' ? 'Ton héros' : a.querySelector('span')?.textContent || '';
    const icon = route === 'hero' ? (a.querySelector('svg.avatar')?.outerHTML || '') : a.querySelector('svg')?.outerHTML || '';
    return `<a href="${a.getAttribute('href')}" data-close class="${a.classList.contains('active') ? 'active' : ''}">${icon}<span>${esc(label)}</span></a>`;
  }).join('')}</nav>`, (m, close) => $$('a', m).forEach((a) => a.addEventListener('click', close)));
};

// Lanceur rapide : petite icône à droite du logo -> menu de tes applications
$('#brand-launch').onclick = async (e) => {
  e.stopPropagation();
  const btn = e.currentTarget;
  const old = $('#launch-pop');
  if (old) { old.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
  const items = await launcher.list();
  const pop = document.createElement('div');
  pop.id = 'launch-pop';
  pop.className = 'launch-pop';
  pop.setAttribute('role', 'menu');
  pop.innerHTML = `<div class="lp-grid">${items.map((it, i) => `<button class="lp-item" role="menuitem" data-i="${i}" title="${esc(it.name)}">
      <span class="lp-ico" style="--c:${esc(it.color)}">${esc(it.icon)}</span><span class="lp-name">${esc(it.name)}</span></button>`).join('')}</div>
    <a class="lp-manage" href="#/launcher">✎ Gérer le Lanceur</a>`;
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  pop.style.top = `${r.bottom + 8}px`;
  pop.style.left = `${Math.min(r.left, innerWidth - pop.offsetWidth - 12)}px`;
  btn.setAttribute('aria-expanded', 'true');
  const close = () => { pop.remove(); btn.setAttribute('aria-expanded', 'false'); removeEventListener('pointerdown', outside, true); removeEventListener('keydown', onKey); removeEventListener('hashchange', close); };
  const outside = (ev) => { if (!pop.contains(ev.target) && !btn.contains(ev.target)) close(); };
  const onKey = (ev) => { if (ev.key === 'Escape') { close(); btn.focus(); } };
  addEventListener('pointerdown', outside, true);
  addEventListener('keydown', onKey);
  addEventListener('hashchange', close);
  $$('.lp-item', pop).forEach((b) => (b.onclick = () => {
    const it = items[Number(b.dataset.i)];
    close();
    if (!launcher.open(it)) toast('La fenêtre a été bloquée : autorise les pop-ups pour Life Planner dans Edge', 'err');
  }));
  pop.querySelector('.lp-item')?.focus();
};

function applyTheme() {
  let t = '';
  try { t = localStorage.getItem('lp.theme') || ''; } catch { /* ignore */ }
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

/* =========================================================
   Démarrage
   ========================================================= */
applyTheme();
applyNavOrder();
// Une mission cochée/ajoutée dans le widget -> on rafraîchit la vue si elle affiche des missions
onDbChange(({ store }) => {
  const route = location.hash.replace(/^#\/?/, '').split('/')[0] || 'today';
  if (store === 'xp') refreshRail();
  if (store === 'tasks' && (route === 'today' || route === 'week') && !document.hasFocus()) router();
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
gcal.preload();
game.init().catch(console.error).finally(() => {
  refreshRail();
  router();
  timer.mount();
  // Synchro : des changements arrivent d'un autre appareil -> on rafraîchit la vue (sauf pendant une saisie)
  sync.start((stores, n) => {
    refreshRail();
    if (stores.includes('settings')) { applyNavOrder(); applyTheme(); }
    const busy = $('#modal-root').children.length || document.activeElement?.matches?.('input, textarea, select, [contenteditable]');
    const route = location.hash.replace(/^#\/?/, '').split('/')[0] || 'today';
    if (!busy && route !== 'page') router();
    toast(`☁️ ${n} changement${n > 1 ? 's' : ''} reçu${n > 1 ? 's' : ''} d’un autre appareil`);
  });
  // Alarmes : après une action (snooze, report, accomplie), on rafraîchit la vue si elle montre des missions
  alarms.start(() => {
    const route = location.hash.replace(/^#\/?/, '').split('/')[0] || 'today';
    if (route === 'today') refreshToday();
    else if (['week', 'goals', 'note'].includes(route) && !$('#modal-root').children.length) router();
  });
  // Rappels fiables : copie des alarmes et des habitudes dans Google Agenda (si activé dans Réglages)
  reminders.start();
  // Rappels d'habitudes : après « Fait » depuis un rappel, on rafraîchit la vue concernée
  habits.start(() => {
    const route = location.hash.replace(/^#\/?/, '').split('/')[0] || 'today';
    if (route === 'today') refreshToday();
    else if ((route === 'habits' || route === 'hero') && !$('#modal-root').children.length) router();
  });
  // Posts Reddit sauvegardés avec le bouton « 🧠 Cerveau » (extension extension-edge)
  clips.start((note, updated) => {
    refreshRail();
    const route = location.hash.replace(/^#\/?/, '').split('/')[0] || 'today';
    if (route === 'brain' && !$('#modal-root').children.length) router();
    toast(updated ? `🧠 Post Reddit mis à jour : « ${note.title} »` : `🧠 Post Reddit ajouté au Cerveau : « ${note.title} »`);
  });
});
