// Habitudes : des « missions spéciales » qui reviennent certains jours, avec rappels à l'heure,
// suivi quotidien (une ou plusieurs fois par jour) et séries 🔥.
//
// Une habitude : { id, name, emoji, days: [0..6] (0 = dimanche), times: ['08:00'], target: 1,
//                  log: { 'AAAA-MM-JJ': nombre }, createdAt, order, archived }

import { db, onDbChange } from './db.js';
import * as U from './util.js';
import * as game from './game.js';
import { chime } from './alarms.js';

const { esc, iso } = U;
const DOW = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const DOW_LONG = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // affichage lundi -> dimanche
export const SUGGESTIONS = [
  ['💧', 'Boire de l’eau', ['10:00', '14:00', '17:00'], 3],
  ['💊', 'Médicaments', ['08:00'], 1],
  ['🧘', 'Méditer 10 min', ['07:30'], 1],
  ['📚', 'Lire 20 min', ['21:00'], 1],
  ['🚶', 'Marcher 30 min', ['12:30'], 1],
  ['🛏️', 'Au lit avant 23 h', ['22:30'], 1],
];

/* ---------- Données ---------- */
export async function list({ withArchived = false } = {}) {
  const all = await db.all('habits');
  return all.filter((h) => withArchived || !h.archived).sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
}

export async function create({ name, emoji = '✅', days = [0, 1, 2, 3, 4, 5, 6], times = [], target = 1 }) {
  const now = Date.now();
  const h = { id: U.uid(), name: name.trim(), emoji, days, times, target: Math.max(1, target), log: {}, createdAt: now, order: now, archived: false };
  await db.put('habits', h);
  return h;
}

export const save = (h) => db.put('habits', h);
export async function remove(id) {
  const h = await db.get('habits', id);
  await db.del('habits', id);
  for (const k of (await db.keys('xp')).filter((k) => k.startsWith(`habit:${id}:`))) await db.del('xp', k);
  return h;
}

export const isDue = (h, d) => (h.days || []).includes(new Date(d).getDay()) && iso(d) >= iso(h.createdAt || 0);
export const countOn = (h, day) => (h.log || {})[day] || 0;
export const doneOn = (h, day) => countOn(h, day) >= (h.target || 1);

/** Change le compte d'un jour (borné entre 0 et l'objectif) et ajuste les points. */
export async function setCount(id, day, n) {
  const h = await db.get('habits', id);
  if (!h) return null;
  h.log ||= {};
  n = Math.max(0, Math.min(h.target || 1, n));
  if (n) h.log[day] = n; else delete h.log[day];
  await db.put('habits', h);
  const key = `habit:${h.id}:${day}`;
  if (doneOn(h, day)) await game.award(key, game.XP.habit, `Habitude : ${h.emoji} ${h.name}`);
  else await game.revoke(key, { showPop: false });
  if (doneOn(h, day)) closeNotification(h.id);
  return h;
}
export const bump = async (id, day = iso(new Date())) => {
  const h = await db.get('habits', id);
  if (!h) return null;
  const c = countOn(h, day), t = h.target || 1;
  return setCount(id, day, t === 1 ? (c ? 0 : 1) : c + 1);
};

/** Série en cours : jours prévus consécutifs réussis (aujourd'hui ne casse pas la série tant qu'il n'est pas fini). */
export function streak(h, from = new Date()) {
  let n = 0;
  const start = iso(h.createdAt || 0);
  let d = U.startOfDay(from);
  for (let i = 0; i < 400; i++, d = U.addDays(d, -1)) {
    const day = iso(d);
    if (day < start) break;
    if (!isDue(h, d)) continue;
    if (doneOn(h, day)) n++;
    else if (i > 0) break;
  }
  return n;
}
export function bestStreak(h) {
  let best = 0, cur = 0;
  const end = U.startOfDay(new Date());
  for (let d = U.startOfDay(h.createdAt || Date.now()); d <= end; d = U.addDays(d, 1)) {
    if (!isDue(h, d)) continue;
    const day = iso(d);
    if (doneOn(h, day)) { cur++; best = Math.max(best, cur); } else if (day !== iso(end)) cur = 0;
  }
  return best;
}
/** Taux de réussite sur les N derniers jours prévus (aujourd'hui exclu s'il n'est pas fini). */
export function rate(h, days = 30) {
  let due = 0, ok = 0;
  for (let i = 0; i < days; i++) {
    const d = U.addDays(new Date(), -i), day = iso(d);
    if (!isDue(h, d)) continue;
    if (i === 0 && !doneOn(h, day)) continue;
    due++;
    if (doneOn(h, day)) ok++;
  }
  return due ? Math.round((ok / due) * 100) : null;
}
export function scheduleText(h) {
  const d = h.days || [];
  if (d.length === 7) return 'Tous les jours';
  if (d.length === 5 && [1, 2, 3, 4, 5].every((x) => d.includes(x))) return 'En semaine';
  if (d.length === 2 && d.includes(0) && d.includes(6)) return 'La fin de semaine';
  return WEEK_ORDER.filter((x) => d.includes(x)).map((x) => DOW_LONG[x]).join(' ') || 'Aucun jour';
}

/* ---------- Rappels ---------- */
const LS = 'lp.habitRem'; // rappels déjà donnés sur cet appareil : { "id|jour|heure": 1 }, et snoozes
const loadRem = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };
const saveRem = (r) => { try { localStorage.setItem(LS, JSON.stringify(r)); } catch { /* ignore */ } };
const atTime = (day, hm) => { const d = U.parseISO(day); const [h, m] = hm.split(':').map(Number); d.setHours(h, m, 0, 0); return d.getTime(); };

const pending = new Map(); // habitudes qui attendent une réponse dans cette fenêtre : id -> heure du rappel

async function notify(h) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.ready;
    const opts = {
      body: `${h.emoji} ${h.name}`, tag: 'habit-' + h.id, renotify: true, requireInteraction: true,
      icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { id: h.id, kind: 'habit' },
      actions: [{ action: 'done', title: '✓ Fait' }, { action: 'snooze', title: '⏰ Dans 10 min' }],
    };
    if (reg?.showNotification) await reg.showNotification('🔁 C’est l’heure de ton habitude', opts);
    else new Notification('🔁 C’est l’heure de ton habitude', opts);
  } catch { /* notifications indisponibles */ }
}
async function closeNotification(id) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    for (const n of (await reg?.getNotifications({ tag: 'habit-' + id })) || []) n.close();
  } catch { /* ignore */ }
}

export function snooze(id, minutes = 10) {
  const r = loadRem();
  r['snooze|' + id] = Date.now() + minutes * 60_000;
  saveRem(r);
  pending.delete(id);
  closeNotification(id);
  drawBanner();
}
function dismiss(id) { pending.delete(id); closeNotification(id); drawBanner(); }

async function check() {
  const run = async () => {
    const now = Date.now(), today = iso(new Date());
    const r = loadRem();
    let fired = false;
    for (const h of await list()) {
      if (!isDue(h, new Date()) || doneOn(h, today)) { pending.delete(h.id); continue; }
      const sz = r['snooze|' + h.id];
      let ring = false;
      if (sz && sz <= now) { delete r['snooze|' + h.id]; ring = true; }
      for (const t of h.times || []) {
        const key = `${h.id}|${today}|${t}`;
        if (!r[key] && atTime(today, t) <= now) { r[key] = 1; ring = true; }
      }
      if (ring) { pending.set(h.id, now); notify(h); fired = true; }
    }
    // On oublie les rappels des jours passés
    for (const k of Object.keys(r)) if (!k.startsWith('snooze|') && !k.includes(`|${today}|`)) delete r[k];
    saveRem(r);
    if (fired) chime();
  };
  // Une seule fenêtre donne les rappels (pas de double notification avec le widget)
  if (navigator.locks) await navigator.locks.request('lp-habits', { ifAvailable: true }, (lock) => (lock ? run() : null));
  else await run();
  drawBanner();
}

let bannerEl = null, onChanged = () => {};
async function drawBanner() {
  if (!pending.size) { if (bannerEl) bannerEl.innerHTML = ''; return; }
  if (!bannerEl) { bannerEl = document.createElement('div'); bannerEl.id = 'habit-root'; document.body.appendChild(bannerEl); }
  const hs = (await Promise.all([...pending.keys()].map((id) => db.get('habits', id)))).filter(Boolean);
  const today = iso(new Date());
  bannerEl.innerHTML = hs.map((h) => `<div class="hb-rem" role="alert" data-id="${h.id}">
      <span class="hb-rem-emo">${esc(h.emoji)}</span>
      <div class="hb-rem-txt"><small>🔔 C’est l’heure</small><strong>${esc(h.name)}</strong>${(h.target || 1) > 1 ? `<small>${countOn(h, today)}/${h.target} aujourd’hui</small>` : ''}</div>
      <button class="btn primary" data-act="done">✓ Fait</button>
      <button class="btn" data-act="snooze" title="Me le rappeler dans 10 minutes">+10 min</button>
      <button class="btn sm" data-act="close" aria-label="Fermer">×</button>
    </div>`).join('');
  bannerEl.querySelectorAll('.hb-rem').forEach((el) => el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = async () => {
    const id = el.dataset.id, act = b.dataset.act;
    if (act === 'done') {
      const h = await db.get('habits', id);
      await setCount(id, today, countOn(h, today) + 1);
      dismiss(id);
      onChanged();
    } else if (act === 'snooze') snooze(id, 10);
    else dismiss(id);
  })));
}

/** Démarre les rappels (app). onChange() : rafraîchir l'affichage après une action. */
export function start(onChange = () => {}) {
  onChanged = onChange;
  setTimeout(check, 2000);
  setInterval(check, 30_000);
  addEventListener('focus', check);
  onDbChange(({ store }) => { if (store === 'habits') drawBanner(); });
  navigator.serviceWorker?.addEventListener('message', async (e) => {
    const { type, action, id } = e.data || {};
    if (type !== 'habit-action' || !id) return;
    if (action === 'snooze') snooze(id, 10);
    else if (action === 'done') {
      const h = await db.get('habits', id);
      if (h) await setCount(id, iso(new Date()), countOn(h, iso(new Date())) + 1);
      dismiss(id);
      onChanged();
    }
  });
}

/* =========================================================
   Affichage
   ========================================================= */
function chip(h, day) {
  const c = countOn(h, day), t = h.target || 1, done = c >= t, s = streak(h);
  return `<div class="hb-chip ${done ? 'done' : ''}" data-id="${h.id}">
    <button class="hb-tap" data-bump aria-label="${esc(h.name)} : ${done ? 'fait' : 'marquer comme fait'}">
      <span class="hb-emo">${esc(h.emoji)}</span>
      <span class="hb-name">${esc(h.name)}</span>
      <span class="hb-meta">${t > 1 ? `${c}/${t}` : done ? '✓' : ''}${s ? ` · 🔥${s}` : ''}${(h.times || []).length ? ` · ${h.times.join(', ')}` : ''}</span>
    </button>
    ${t > 1 && c ? '<button class="btn sm hb-minus" data-minus aria-label="Retirer 1">−</button>' : ''}
  </div>`;
}

/** Carte « Habitudes du jour » de la page Aujourd'hui. */
export async function todayCard(el) {
  if (!el) return;
  const day = iso(new Date());
  const items = (await list()).filter((h) => isDue(h, new Date()));
  const done = items.filter((h) => doneOn(h, day)).length;
  el.innerHTML = `<div class="card-head"><h2>🔁 Habitudes du jour</h2><span class="muted">${items.length ? `${done}/${items.length}` : ''} <a href="#/habits">Gérer →</a></span></div>
    ${items.length ? `<div class="hb-list">${items.map((h) => chip(h, day)).join('')}</div>`
      : '<p class="empty-sm">Aucune habitude prévue aujourd’hui. <a href="#/habits">En créer une</a></p>'}`;
  bindChips(el, day, () => todayCard(el));
}

function bindChips(el, day, redraw) {
  el.querySelectorAll('.hb-chip').forEach((c) => {
    c.querySelector('[data-bump]').onclick = async () => { await bump(c.dataset.id, day); redraw(); };
    const m = c.querySelector('[data-minus]');
    if (m) m.onclick = async () => { const h = await db.get('habits', c.dataset.id); await setCount(h.id, day, countOn(h, day) - 1); redraw(); };
  });
}

/** Page « Habitudes ». ctx : { view, modal, toast, confirmBox } */
export async function renderPage(ctx) {
  const { view, toast } = ctx;
  const all = await list({ withArchived: true });
  const active = all.filter((h) => !h.archived), archived = all.filter((h) => h.archived);
  const today = new Date(), day = iso(today);
  const due = active.filter((h) => isDue(h, today));
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const strip = (h) => {
    const cells = [];
    for (let i = 13; i >= 0; i--) {
      const d = U.addDays(today, -i), k = iso(d), isD = isDue(h, d);
      const c = countOn(h, k), t = h.target || 1;
      cells.push(`<button class="hb-day ${!isD ? 'off' : c >= t ? 'ok' : c ? 'part' : ''} ${i === 0 ? 'today' : ''}" data-day="${k}" ${k < iso(h.createdAt) ? 'disabled' : ''}
        title="${U.fmtShort(d)} : ${isD ? `${c}/${t}` : 'non prévu'}" aria-label="${U.fmtShort(d)} ${c}/${t}"><small>${DOW[d.getDay()]}</small><i></i></button>`);
    }
    return cells.join('');
  };
  const card = (h) => {
    const r = rate(h);
    return `<section class="card hb-card ${h.archived ? 'is-arch' : ''}" data-id="${h.id}">
      <div class="hb-head">
        <span class="hb-big">${esc(h.emoji)}</span>
        <div class="hb-title"><h3>${esc(h.name)}</h3>
          <p class="muted">${scheduleText(h)}${(h.target || 1) > 1 ? ` · ${h.target} fois par jour` : ''}${(h.times || []).length ? ` · 🔔 ${h.times.join(', ')}` : ' · sans rappel'}</p></div>
        <button class="btn sm" data-edit aria-label="Modifier ${esc(h.name)}">✎</button>
      </div>
      <div class="hb-stats"><span>🔥 <b>${streak(h)}</b> série</span><span>🏆 <b>${bestStreak(h)}</b> record</span><span>📈 <b>${r === null ? '—' : r + ' %'}</b> sur 30 jours</span></div>
      <div class="hb-strip">${strip(h)}</div>
    </section>`;
  };
  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Suivi quotidien</p><h1>Habitudes</h1></div>
      <div class="head-actions"><button class="btn primary" id="hb-new">+ Nouvelle habitude</button></div>
    </header>
    ${perm === 'default' ? `<div class="card hb-perm"><span>🔔 Autorise les notifications pour recevoir tes rappels d’habitudes, même quand Life Planner est en arrière-plan.</span><button class="btn primary" id="hb-perm">Autoriser</button></div>` : ''}
    ${perm === 'denied' ? `<p class="hint muted">🔕 Les notifications sont bloquées : les rappels s’affichent seulement dans l’app. Pour les activer, clique le cadenas à côté de l’adresse → Notifications → Autoriser.</p>` : ''}
    <section class="card hb-todaycard" id="hb-today"></section>
    <div class="hb-grid">${active.map(card).join('')}</div>
    ${!active.length ? `<section class="card"><h2>Commence par une habitude</h2><p class="muted">Choisis une suggestion (tu pourras la modifier) ou crée la tienne.</p>
      <div class="filters">${SUGGESTIONS.map(([e, n], i) => `<button class="chip-btn" data-sugg="${i}">${e} ${esc(n)}</button>`).join('')}</div></section>` : ''}
    ${archived.length ? `<details class="hb-arch"><summary>🗄 Habitudes en pause (${archived.length})</summary><div class="hb-grid">${archived.map(card).join('')}</div></details>` : ''}
    <p class="hint muted">Touche une habitude pour la cocher. Les cases des 14 derniers jours se cochent aussi (pour rattraper un oubli). Les rappels sonnent quand Life Planner ou le widget est ouvert.</p>`;

  const redraw = () => renderPage(ctx);
  const todayEl = view.querySelector('#hb-today');
  todayEl.innerHTML = `<div class="card-head"><h2>Aujourd’hui</h2><span class="muted">${due.filter((h) => doneOn(h, day)).length}/${due.length}</span></div>
    ${due.length ? `<div class="hb-list">${due.map((h) => chip(h, day)).join('')}</div>` : '<p class="empty-sm">Rien de prévu aujourd’hui.</p>'}`;
  bindChips(todayEl, day, redraw);

  view.querySelector('#hb-new').onclick = () => editor(ctx, null, redraw);
  view.querySelector('#hb-perm')?.addEventListener('click', async () => { try { await Notification.requestPermission(); } catch { /* ignore */ } redraw(); });
  view.querySelectorAll('[data-sugg]').forEach((b) => (b.onclick = async () => {
    const [emoji, name, times, target] = SUGGESTIONS[Number(b.dataset.sugg)];
    await create({ name, emoji, times, target });
    toast(`${emoji} « ${name} » ajoutée — modifie l’heure du rappel avec ✎`);
    redraw();
  }));
  view.querySelectorAll('.hb-card').forEach((c) => {
    const id = c.dataset.id;
    c.querySelector('[data-edit]').onclick = () => editor(ctx, id, redraw);
    c.querySelectorAll('.hb-day').forEach((b) => (b.onclick = async () => {
      const h = await db.get('habits', id);
      const k = b.dataset.day, cur = countOn(h, k), t = h.target || 1;
      await setCount(id, k, cur >= t ? 0 : t === 1 ? 1 : cur + 1);
      redraw();
    }));
  });
}

/** Fenêtre de création / modification d'une habitude. */
async function editor(ctx, id, onDone) {
  const { modal, toast, confirmBox } = ctx;
  const h = id ? await db.get('habits', id) : { name: '', emoji: '✅', days: [0, 1, 2, 3, 4, 5, 6], times: ['08:00'], target: 1 };
  let times = [...(h.times || [])];
  let days = [...(h.days || [])];
  modal(`<h2>${id ? 'Modifier l’habitude' : 'Nouvelle habitude'}</h2>
    <form class="hb-form" id="hb-form">
      <div class="hb-row"><input name="emoji" value="${esc(h.emoji)}" maxlength="4" aria-label="Emoji" class="hb-emo-in">
        <input name="name" value="${esc(h.name)}" placeholder="Ex. Boire de l’eau" required autocomplete="off" autofocus></div>
      <label class="hb-lbl">Jours</label>
      <div class="filters" id="hb-days">${WEEK_ORDER.map((d) => `<button type="button" class="chip-btn ${days.includes(d) ? 'on' : ''}" data-d="${d}" aria-pressed="${days.includes(d)}">${DOW_LONG[d]}</button>`).join('')}</div>
      <label class="hb-lbl" for="hb-target">Combien de fois par jour</label>
      <input type="number" id="hb-target" name="target" min="1" max="20" value="${h.target || 1}" style="max-width:110px">
      <label class="hb-lbl">Rappels 🔔</label>
      <div id="hb-times"></div>
      <button type="button" class="btn" id="hb-addtime">+ Ajouter une heure</button>
      <div class="modal-actions">
        ${id ? `<button type="button" class="btn danger" id="hb-del">Supprimer</button><button type="button" class="btn" id="hb-arch">${h.archived ? '▶ Reprendre' : '⏸ Mettre en pause'}</button>` : ''}
        <button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button>
      </div>
    </form>`, (m, close) => {
    const drawTimes = () => {
      m.querySelector('#hb-times').innerHTML = times.map((t, i) => `<div class="hb-time"><input type="time" value="${t}" data-i="${i}" aria-label="Heure du rappel"><button type="button" class="btn sm" data-rm="${i}" aria-label="Retirer">×</button></div>`).join('')
        || '<p class="empty-sm">Aucun rappel.</p>';
      m.querySelectorAll('.hb-time input').forEach((inp) => (inp.onchange = () => { times[Number(inp.dataset.i)] = inp.value; }));
      m.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { times.splice(Number(b.dataset.rm), 1); drawTimes(); }));
    };
    drawTimes();
    m.querySelector('#hb-addtime').onclick = () => { times.push(times.length ? times[times.length - 1] : '09:00'); drawTimes(); };
    m.querySelectorAll('#hb-days [data-d]').forEach((b) => (b.onclick = () => {
      const d = Number(b.dataset.d);
      days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
      b.classList.toggle('on', days.includes(d));
      b.setAttribute('aria-pressed', days.includes(d));
    }));
    m.querySelector('#hb-form').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const name = f.name.value.trim();
      if (!name) return;
      if (!days.length) { toast('Choisis au moins un jour', 'err'); return; }
      const data = { name, emoji: f.emoji.value.trim() || '✅', days: days.sort(), times: [...new Set(times.filter(Boolean))].sort(), target: Math.max(1, Math.min(20, Number(f.target.value) || 1)) };
      if (id) { const cur = await db.get('habits', id); await save({ ...cur, ...data }); }
      else await create(data);
      if (data.times.length && 'Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch { /* ignore */ } }
      close();
      toast(id ? 'Habitude modifiée' : `${data.emoji} Habitude ajoutée`);
      onDone();
    };
    m.querySelector('#hb-arch')?.addEventListener('click', async () => {
      const cur = await db.get('habits', id);
      cur.archived = !cur.archived;
      await save(cur);
      close();
      toast(cur.archived ? '⏸ Habitude en pause (plus de rappels)' : '▶ Habitude reprise');
      onDone();
    });
    m.querySelector('#hb-del')?.addEventListener('click', async () => {
      close();
      if (!(await confirmBox(`Supprimer « ${h.name} » et tout son historique ? Pour arrêter sans perdre l’historique, utilise plutôt « Mettre en pause ».`))) return;
      await remove(id);
      toast('Habitude supprimée');
      onDone();
    });
  });
}
