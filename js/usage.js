// Suivi d'utilisation : quelles pages tu ouvres, combien de temps, quels boutons tu touches.
// Sert seulement à te proposer des améliorations de l'app (ordre du menu, pages inutilisées, cartes
// d'Aujourd'hui jamais touchées, page d'ouverture…), appliquées en un clic.
//
// Vie privée : tout reste sur tes appareils et dans ta synchro Google Drive privée (réglage « usage:<appareil> »).
// On ne garde que des noms de pages et de boutons, jamais le texte de tes notes, missions ou transactions.
// L'analyse par Claude (facultative) n'envoie que ces totaux.

import { db } from './db.js';
import * as U from './util.js';
import { DEVICE } from './alarms.js';

const { esc } = U;
const KEY = 'usage:' + DEVICE;
const KEEP_DAYS = 60;
const MAX_ACTIONS = 300; // boutons différents retenus par jour

export const PAGES = {
  today: 'Aujourd’hui', missions: 'Missions', brain: 'Cerveau', note: 'Note du Cerveau', goals: 'Objectifs', finance: 'Finances',
  quest: 'Aventure', workout: 'Workout', rbq: 'Cours RBQ', news: 'Actualités', week: 'Planificateur (semaine)', month: 'Planificateur (mois)',
  year: 'Planificateur (année)', journal: 'Journal', notebook: 'Carnet', page: 'Page manuscrite', hero: 'Héros et habitudes', habits: 'Habitudes',
  settings: 'Réglages', launcher: 'Lanceur', usage: 'Utilisation', setup: 'Configuration',
};
const NAV = ['today', 'missions', 'brain', 'goals', 'finance', 'quest', 'workout', 'rbq']; // onglets du menu (voir app.js)
export const TODAY_CARDS = { 't-tasks': 'Missions du jour', 't-agenda': 'Agenda', 't-goals': 'Objectifs en cours', 't-habits': 'Habitudes du jour', 't-money': 'Budget du mois', 't-workout': 'Workout du jour', 't-rbq': 'Examen RBQ', 't-news': 'À la une', 't-ink': 'Page manuscrite', 't-quote': 'Citation' };

/* =========================================================
   Collecte
   ========================================================= */
let data = null; // { device, kind, days: { 'AAAA-MM-JJ': { r: { page: [vues, ms] }, a: { bouton: n }, s: sessions, h: { heure: ms } } } }
let dirty = false;
let current = null, since = 0, hiddenAt = 0;
const today = () => U.iso(new Date());
const routeOf = () => (location.hash.replace(/^#\/?/, '') || 'today').split('/')[0] || 'today';
const dayRec = () => ((data.days[today()] ||= { r: {}, a: {}, s: 0, h: {} }));

function addTime() {
  if (!current || !since || document.hidden) { since = Date.now(); return; }
  const ms = Math.min(Date.now() - since, 5 * 60_000); // au-delà de 5 min sans bouger, on ne compte pas
  since = Date.now();
  if (ms < 500) return;
  const d = dayRec();
  (d.r[current] ||= [0, 0])[1] += ms;
  const h = new Date().getHours();
  d.h[h] = (d.h[h] || 0) + ms;
  dirty = true;
}
function view(route) {
  addTime();
  current = route;
  since = Date.now();
  (dayRec().r[route] ||= [0, 0])[0]++;
  dirty = true;
}

// Nom d'un bouton, sans contenu personnel : identifiant, attribut data-*, ou libellé court d'un bouton fixe
function labelOf(el) {
  if (el.id && !/\d{3,}|^m[a-z0-9]{6,}$/.test(el.id)) return '#' + el.id;
  for (const [k, v] of Object.entries(el.dataset || {})) {
    if (/^(id|img|i|swap|save|gdone|opengoal|hz|unlink|open)$/.test(k)) return k; // valeur = un identifiant : on garde le nom seulement
    return /^[\w-]{1,20}$/.test(v) ? `${k}=${v}` : k;
  }
  if (el.closest('.note-card, .tasks li, .nw-item, .habs-art, .fi-tx, .evs li, .pgoal, .goal, .redisc, .hb-chip, .lt')) {
    return (el.closest('.note-card, .tasks li, .nw-item, .habs-art, .fi-tx, .evs li, .pgoal, .goal, .redisc, .hb-chip, .lt').className.split(' ')[0]) + (el.className ? '>' + String(el.className).split(' ')[0] : '');
  }
  const aria = (el.getAttribute('aria-label') || '').replace(/«[^»]*»|"[^"]*"/g, '').trim();
  if (aria && aria.length <= 40) return aria;
  const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (el.tagName !== 'A' && txt && txt.length <= 28 && !/\d{2,}/.test(txt)) return txt;
  if (el.tagName === 'A' && /^#\//.test(el.getAttribute('href') || '')) return 'lien→' + el.getAttribute('href').slice(2).split('/')[0];
  return el.className ? String(el.className).split(' ')[0] : el.tagName.toLowerCase();
}
function onClick(e) {
  const el = e.target.closest('button, a, summary, label.btn, input[type="checkbox"], select, [role="button"]');
  if (!el) return;
  const route = routeOf();
  const d = dayRec();
  const card = route === 'today' && el.closest('.today-col > .card');
  const cardKey = card && [...card.classList].find((c) => c.startsWith('t-'));
  if (cardKey) d.a[`today:card:${cardKey}`] = (d.a[`today:card:${cardKey}`] || 0) + 1;
  const key = `${route}:${labelOf(el)}`.slice(0, 70);
  if (!(key in d.a) && Object.keys(d.a).length >= MAX_ACTIONS) return;
  d.a[key] = (d.a[key] || 0) + 1;
  dirty = true;
}

async function flush() {
  addTime();
  if (!dirty) return;
  dirty = false;
  const cut = U.iso(U.addDays(new Date(), -KEEP_DAYS));
  for (const k of Object.keys(data.days)) if (k < cut) delete data.days[k];
  data.updatedAt = Date.now();
  await db.put('settings', data, KEY).catch(() => { dirty = true; });
}

/** Démarre la collecte (une fois, au lancement). */
export async function start() {
  data = (await db.get('settings', KEY)) || {};
  data.days ||= {};
  data.device = DEVICE;
  data.kind = matchMedia('(pointer: coarse)').matches ? 'Cellulaire ou tablette' : 'Ordinateur';
  data.firstAt ||= Date.now();
  dayRec().s++;
  view(routeOf());
  addEventListener('hashchange', () => { const r = routeOf(); if (r !== current) view(r); });
  document.addEventListener('click', onClick, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { addTime(); hiddenAt = Date.now(); flush(); }
    else { if (hiddenAt && Date.now() - hiddenAt > 30 * 60_000) { dayRec().s++; dirty = true; } since = Date.now(); }
  });
  addEventListener('pagehide', () => flush());
  setInterval(flush, 5 * 60_000); // pas plus souvent : chaque écriture part dans la synchro
}

/* =========================================================
   Analyse (tous tes appareils réunis)
   ========================================================= */
export async function summary(nDays = 30) {
  if (data) await flush();
  const entries = await db.entries('settings');
  const devices = entries.filter(([k]) => typeof k === 'string' && k.startsWith('usage:')).map(([, v]) => v).filter(Boolean);
  const cut = U.iso(U.addDays(new Date(), -nDays));
  const pages = {}, actions = {}, hours = {};
  const days = new Set();
  let sessions = 0;
  const startDay = {};
  for (const dv of devices) {
    for (const [day, rec] of Object.entries(dv.days || {})) {
      if (day < cut) continue;
      days.add(day);
      sessions += rec.s || 0;
      for (const [p, [v, ms]] of Object.entries(rec.r || {})) { (pages[p] ||= { views: 0, ms: 0, days: 0 }); pages[p].views += v; pages[p].ms += ms; pages[p].days++; }
      for (const [a, n] of Object.entries(rec.a || {})) actions[a] = (actions[a] || 0) + n;
      for (const [h, ms] of Object.entries(rec.h || {})) hours[h] = (hours[h] || 0) + ms;
    }
    const first = Object.keys(dv.days || {}).sort()[0];
    if (first) startDay[dv.device] = first;
  }
  const since = Object.values(startDay).sort()[0] || today();
  const span = Math.max(1, Math.round((Date.now() - U.parseISO(since)) / 864e5) + 1);
  return { devices: devices.map((d) => ({ device: d.device, kind: d.kind, updatedAt: d.updatedAt })), pages, actions, hours, activeDays: days.size, sessions, since, span: Math.min(span, nDays) };
}

/**
 * Suggestions d'amélioration, chacune avec une action à appliquer en un clic.
 * ctx : { navOrder: [...], navHidden: [...], folded: Set, todayHidden: [...], startPage }
 */
export function suggest(s, ctx) {
  const out = [];
  if (s.activeDays < 3) return out; // pas assez de recul
  const use = (p) => (s.pages[p]?.views || 0) * 30_000 + (s.pages[p]?.ms || 0); // une visite ≈ 30 s
  const visible = ctx.navOrder.filter((k) => !ctx.navHidden.includes(k));

  // 1. Menu dans l'ordre de ce que tu utilises vraiment (Aujourd'hui reste en haut)
  const ideal = ['today', ...visible.filter((k) => k !== 'today').sort((a, b) => use(b) - use(a))];
  const moved = ideal.findIndex((k, i) => k !== visible[i]);
  if (moved > -1 && moved < 5 && use(ideal[moved]) > use(visible[moved]) * 1.5 && use(ideal[moved]) > 60_000) {
    out.push({ id: 'nav-order:' + ideal.slice(0, 5).join(','), icon: '↕️', title: `Mettre ${PAGES[ideal[moved]]} plus haut dans le menu`,
      why: `Tu l’utilises plus que ${PAGES[visible[moved]]}. Nouvel ordre : ${ideal.map((k) => PAGES[k]).join(' · ')}. Sur cellulaire, les 4 premiers sont dans la barre du bas.`,
      apply: { type: 'navOrder', order: [...ideal, ...ctx.navOrder.filter((k) => !ideal.includes(k))] } });
  }

  // 2. Pages du menu jamais ouvertes
  if (s.span >= 14) {
    for (const k of visible) {
      if (k === 'today' || (s.pages[k]?.views || 0) > 0) continue;
      out.push({ id: 'nav-hide:' + k, icon: '🙈', title: `Retirer ${PAGES[k]} du menu`,
        why: `Tu ne l’as pas ouvert depuis ${s.span} jours. Le menu sera plus court ; tu pourras le remettre dans Réglages → Menu ou sur cette page.`,
        apply: { type: 'navHide', key: k } });
    }
  }

  // 3. Cartes d'Aujourd'hui : repliées depuis longtemps → les masquer ; jamais touchées → les replier
  const todayViews = s.pages.today?.views || 0;
  if (todayViews >= 10) {
    let cards = 0; // pas plus de 2 suggestions de cartes à la fois
    for (const [card, name] of Object.entries(TODAY_CARDS)) {
      if (cards >= 2) break;
      if (ctx.todayHidden.includes(card)) continue;
      const clicks = s.actions[`today:card:${card}`] || 0;
      if (ctx.folded.has(card) && clicks === 0) {
        out.push({ id: 'card-hide:' + card, icon: '🧹', title: `Masquer la carte « ${name} » d’Aujourd’hui`,
          why: 'Elle est repliée et tu ne l’as pas ouverte. La page sera plus courte (tu peux la remettre ici).', apply: { type: 'cardHide', key: card } });
        cards++;
      } else if (!ctx.folded.has(card) && clicks === 0 && !['t-quote', 't-money'].includes(card)) {
        out.push({ id: 'card-fold:' + card, icon: '⤵️', title: `Replier la carte « ${name} »`,
          why: `Tu as ouvert Aujourd’hui ${todayViews} fois sans jamais toucher cette carte. Repliée, elle prend une seule ligne.`, apply: { type: 'cardFold', key: card } });
        cards++;
      }
    }
  }

  // 4. Page d'ouverture : si tu vas presque toujours ailleurs en premier
  const first = Object.entries(s.actions).filter(([k]) => k.startsWith('today:lien→')).sort((a, b) => b[1] - a[1])[0];
  if (first && s.sessions >= 8 && first[1] >= s.sessions * 0.5) {
    const target = first[0].split('→')[1];
    if (PAGES[target] && target !== ctx.startPage) {
      out.push({ id: 'start:' + target, icon: '🚪', title: `Ouvrir l’app directement sur ${PAGES[target]}`,
        why: `Depuis Aujourd’hui, tu vas souvent tout de suite dans ${PAGES[target]} (${first[1]} fois pour ${s.sessions} ouvertures de l’app). Aujourd’hui reste à un clic (logo).`, apply: { type: 'startPage', key: target } });
    }
  }
  return out;
}

/* =========================================================
   Page « Ton utilisation » (#/usage)
   ========================================================= */
const fmtMs = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };

export async function renderPage(ctx, hooks) {
  const { view: root, toast } = ctx;
  const s = await summary(30);
  const st = await hooks.state();
  const dismissed = new Set((await db.get('settings', 'usageDismissed')) || []);
  const sugg = suggest(s, st).filter((x) => !dismissed.has(x.id));
  const pages = Object.entries(s.pages).sort((a, b) => b[1].ms - a[1].ms);
  const maxMs = Math.max(1, ...pages.map(([, p]) => p.ms));
  const total = pages.reduce((a, [, p]) => a + p.ms, 0);
  const acts = Object.entries(s.actions).filter(([k]) => !k.includes(':card:')).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const hours = Array.from({ length: 24 }, (_, h) => s.hours[h] || 0);
  const maxH = Math.max(1, ...hours);
  const peak = hours.indexOf(Math.max(...hours));

  root.innerHTML = `
    <header class="page-head"><div><a href="#/settings" class="eyebrow">← Réglages</a><h1>Ton utilisation</h1></div></header>
    <div class="kpis us-kpis">
      <div class="kpi"><b>${s.activeDays}</b><span>jour${s.activeDays > 1 ? 's' : ''} d’utilisation (30 derniers)</span></div>
      <div class="kpi"><b>${fmtMs(total)}</b><span>dans l’app</span></div>
      <div class="kpi"><b>${s.sessions}</b><span>ouverture${s.sessions > 1 ? 's' : ''}</span></div>
      <div class="kpi"><b>${total ? `${peak} h` : '–'}</b><span>heure où tu l’utilises le plus</span></div>
    </div>

    <section class="card us-sugg">
      <div class="card-head"><h2>💡 Suggestions pour simplifier l’app</h2>${dismissed.size ? `<button class="btn sm-text" id="us-undismiss">Revoir les ${dismissed.size} ignorée${dismissed.size > 1 ? 's' : ''}</button>` : ''}</div>
      ${s.activeDays < 3 ? `<p class="empty-sm">Encore ${3 - s.activeDays} jour${3 - s.activeDays > 1 ? 's' : ''} d’utilisation et les premières suggestions apparaîtront ici. L’app apprend comment tu l’utilises, sur tous tes appareils.</p>`
        : sugg.length ? sugg.map((x) => `<div class="us-item" data-sid="${esc(x.id)}">
            <span class="us-ico">${x.icon}</span>
            <div class="us-txt"><b>${esc(x.title)}</b><small class="muted">${esc(x.why)}</small></div>
            <div class="us-act"><button class="btn primary" data-apply="${esc(x.id)}">Appliquer</button><button class="btn" data-dismiss="${esc(x.id)}">Ignorer</button></div>
          </div>`).join('') : '<p class="empty-sm">Rien à changer pour l’instant : ton menu et ta page Aujourd’hui suivent déjà ta façon de faire. 👌</p>'}
      ${hooks.hasKey ? `<div class="us-ai"><button class="btn" id="us-ai">✨ Analyse approfondie avec Claude</button><small class="muted">Envoie seulement ces totaux (pages, boutons, heures), jamais le contenu de tes notes ou de tes finances.</small></div><div id="us-ai-out"></div>`
        : '<p class="hint muted">Avec une clé API dans Réglages → Assistant, Claude peut aussi analyser ton utilisation et proposer des idées d’interface plus poussées.</p>'}
    </section>

    ${st.navHidden.length || st.todayHidden.length ? `<section class="card"><div class="card-head"><h2>🙈 Masqué</h2></div>
      <div class="filters">${st.navHidden.map((k) => `<button class="chip-btn" data-unhide-nav="${k}">${esc(PAGES[k])} (menu) ↩</button>`).join('')}
      ${st.todayHidden.map((k) => `<button class="chip-btn" data-unhide-card="${k}">${esc(TODAY_CARDS[k] || k)} (Aujourd’hui) ↩</button>`).join('')}</div></section>` : ''}

    <div class="us-grid">
      <section class="card"><div class="card-head"><h2>Temps par page</h2><span class="muted">30 derniers jours</span></div>
        ${pages.length ? pages.slice(0, 14).map(([k, p]) => `<div class="us-row"><span>${esc(PAGES[k] || k)}</span><span class="us-bar"><i style="width:${(p.ms / maxMs) * 100}%"></i></span><small class="muted">${fmtMs(p.ms)} · ${p.views} visite${p.views > 1 ? 's' : ''}</small></div>`).join('') : '<p class="empty-sm">Pas encore de données.</p>'}
      </section>
      <div class="us-side">
        <section class="card"><div class="card-head"><h2>Tes gestes les plus fréquents</h2></div>
          ${acts.length ? `<ol class="us-acts">${acts.map(([k, n]) => { const [p, ...rest] = k.split(':'); return `<li><span><small class="muted">${esc(PAGES[p] || p)}</small> ${esc(rest.join(':').replace(/^#/, '').replace(/^lien→(\w+)/, (m, r) => '→ ' + (PAGES[r] || r)).replace(/[-=]/g, ' '))}</span><b>${n}</b></li>`; }).join('')}</ol>` : '<p class="empty-sm">Pas encore de données.</p>'}
        </section>
        <section class="card"><div class="card-head"><h2>Quand tu l’utilises</h2></div>
          <div class="us-hours" role="img" aria-label="Temps passé selon l’heure de la journée">${hours.map((ms, h) => `<i style="height:${Math.max(3, (ms / maxH) * 100)}%" title="${h} h : ${fmtMs(ms)}"></i>`).join('')}</div>
          <div class="us-hours-x"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>23 h</span></div>
        </section>
        <section class="card"><div class="card-head"><h2>Appareils</h2></div>
          <ul class="us-dev">${s.devices.map((d) => `<li>${d.device === hooks.device ? '<b>Cet appareil</b>' : esc(d.kind || 'Appareil')} <small class="muted">${esc(d.kind || '')}${d.updatedAt ? ' · vu ' + esc(U.fmtShort(new Date(d.updatedAt))) : ''}</small></li>`).join('')}</ul>
          <p class="hint muted">Le suivi reste privé : il est enregistré sur tes appareils et dans ta synchro Google Drive. Seuls des noms de pages et de boutons sont gardés, jamais le contenu de tes notes, missions ou finances.</p>
          <button class="btn sm-text" id="us-reset">Effacer l’historique de cet appareil</button>
        </section>
      </div>
    </div>`;

  const $$ = (q) => [...root.querySelectorAll(q)];
  const again = () => renderPage(ctx, hooks);
  const dismiss = async (id) => { dismissed.add(id); await db.put('settings', [...dismissed], 'usageDismissed'); };
  $$('[data-apply]').forEach((b) => (b.onclick = async () => {
    const x = sugg.find((y) => y.id === b.dataset.apply);
    if (!x) return;
    await hooks.apply(x.apply);
    await dismiss(x.id); // appliquée : ne revient pas
    toast('✅ ' + x.title);
    again();
  }));
  $$('[data-dismiss]').forEach((b) => (b.onclick = async () => { await dismiss(b.dataset.dismiss); again(); }));
  root.querySelector('#us-undismiss')?.addEventListener('click', async () => { await db.del('settings', 'usageDismissed'); again(); });
  $$('[data-unhide-nav]').forEach((b) => (b.onclick = async () => { await hooks.apply({ type: 'navShow', key: b.dataset.unhideNav }); again(); }));
  $$('[data-unhide-card]').forEach((b) => (b.onclick = async () => { await hooks.apply({ type: 'cardShow', key: b.dataset.unhideCard }); again(); }));
  root.querySelector('#us-reset').onclick = async () => {
    if (!(await ctx.confirmBox('Effacer l’historique d’utilisation de cet appareil ? Les suggestions repartiront de zéro.', 'Effacer'))) return;
    data = { days: {}, device: DEVICE, kind: data?.kind, firstAt: Date.now() };
    dirty = true; await flush(); again();
  };
  root.querySelector('#us-ai')?.addEventListener('click', async (e) => {
    const out = root.querySelector('#us-ai-out');
    e.target.disabled = true;
    out.innerHTML = '<p class="muted">Claude analyse ton utilisation…</p>';
    try {
      const text = await hooks.ask(aiPrompt(s, st));
      out.innerHTML = `<div class="us-ai-res">${text.split('\n').filter((l) => l.trim()).map((l) => {
        const m = l.match(/^\s*(?:[-*•]|\d+[.)])\s*(.+)$/);
        if (!m) return `<p>${esc(l)}</p>`;
        const t = m[1].replace(/\*\*/g, '');
        return `<div class="us-ai-item"><span>${esc(t)}</span><button class="btn sm-text" data-mission="${esc(t.split(/[:—–.]/)[0].slice(0, 90))}" title="Ajouter comme mission pour t’en souvenir">+ Mission</button></div>`;
      }).join('')}</div>`;
      out.querySelectorAll('[data-mission]').forEach((b) => (b.onclick = async () => { await hooks.addMission('App : ' + b.dataset.mission); b.disabled = true; b.textContent = '✓ Ajoutée'; toast('Mission ajoutée'); }));
    } catch (err) {
      out.innerHTML = `<p class="muted">⚠ ${esc(err.message)}</p>`;
    }
    e.target.disabled = false;
  });
}

function aiPrompt(s, st) {
  const pages = Object.entries(s.pages).sort((a, b) => b[1].ms - a[1].ms).map(([k, p]) => `${PAGES[k] || k}: ${p.views} visites, ${Math.round(p.ms / 60000)} min, ${p.days} jours`).join('\n');
  const acts = Object.entries(s.actions).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, n]) => `${k} ×${n}`).join('\n');
  const hours = Object.entries(s.hours).map(([h, ms]) => `${h}h:${Math.round(ms / 60000)}min`).join(', ');
  return `Voici comment j'utilise mon app personnelle « Life Planner » (PWA en français : missions, Cerveau = notes, objectifs, finances, aventure RPG, workout, cours RBQ, actualités, planificateur, carnet manuscrit) depuis ${s.span} jours (${s.activeDays} jours actifs, ${s.sessions} ouvertures, appareils : ${s.devices.map((d) => d.kind).join(', ')}).

Menu actuel (ordre) : ${st.navOrder.filter((k) => !st.navHidden.includes(k)).map((k) => PAGES[k]).join(', ')}
Pages retirées du menu : ${st.navHidden.map((k) => PAGES[k]).join(', ') || 'aucune'}
Cartes repliées sur Aujourd'hui : ${[...st.folded].map((k) => TODAY_CARDS[k] || k).join(', ') || 'aucune'}

Temps par page :
${pages}

Boutons les plus touchés (page:bouton ×nombre) :
${acts}

Répartition par heure : ${hours}

Propose 4 à 6 améliorations concrètes de l'app ou de son interface pour simplifier mon usage (raccourcis, regroupements, éléments à retirer ou mettre en avant, gestes répétitifs à automatiser). Une par ligne, sous forme de liste « - Titre court : explication en une phrase ». Base-toi seulement sur ces données.`;
}

/* ---------- Carte d'Aujourd'hui : une suggestion à la fois ---------- */
export async function todayHint(el, st) {
  if (!el) return;
  const last = Number(localStorage.getItem('lp.usageHint') || 0);
  if (Date.now() - last < 3 * 864e5) { el.hidden = true; return; } // au plus une fois tous les 3 jours
  const s = await summary(30);
  const dismissed = new Set((await db.get('settings', 'usageDismissed')) || []);
  const x = suggest(s, st).find((y) => !dismissed.has(y.id));
  if (!x) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<div class="card-head"><h2>💡 Suggestion</h2><button class="btn sm-text" id="uh-later">Plus tard</button></div>
    <p><b>${esc(x.title)}</b></p><p class="muted" style="margin:4px 0 10px">${esc(x.why)}</p>
    <a class="btn" href="#/usage">Voir les suggestions</a>`;
  el.querySelector('#uh-later').onclick = () => { try { localStorage.setItem('lp.usageHint', String(Date.now())); } catch { /* ignore */ } el.hidden = true; };
}
