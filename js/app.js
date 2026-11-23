import { APP } from './config.js';
import { db, STORES, onDbChange } from './db.js';
import * as U from './util.js';
import * as gcal from './gcal.js';
import { InkEditor, INK_COLORS, HL_COLORS } from './ink.js';
import * as game from './game.js';
import * as AV from './avatar.js';
import { taskHTML, prioRank, bindTaskList, addTask, loadGoals, missionsOf, setTaskGoal, setTaskProject, openTaskEditor, showUndo, scheduleTask, timeLabel, setTaskDone, setNextTaskImages, bindGoalDrops } from './tasks.js';
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
import * as stretch from './stretch.js';
import * as images from './images.js';
import * as missions from './missions.js';
import * as docs from './docs.js';
import * as linkmeta from './linkmeta.js';
import { withTeamLogos } from './teams.js';
import * as assoc from './assoc.js';
import * as news from './news.js';
import * as finance from './finance.js';
import * as shots from './shots.js';
import * as usage from './usage.js';
import * as activities from './activities.js';
import * as reminders from './reminders.js';
import * as rpg from './rpg.js';
import * as couple from './couple.js';
import * as quick from './quickadd.js';
import * as digest from './digest.js';
import { swipeable } from './swipe.js';
import * as videodock from './videodock.js';
import * as spotify from './spotify.js';
import * as noel from './noel.js';
import * as priobar from './priobar.js';
import * as property from './property.js';
import { bindCapture, brainState, captureForm, evoCard, renderBrain, renderNote } from './page-brain.js';

const { esc, iso, cap } = U;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const view = $('#view');
let cleanup = null;
export const setCleanup = (fn) => { cleanup = fn; }; // pour les pages sorties dans leur propre module

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

/* ---------- ＋ Ajout rapide (bouton flottant sur cellulaire, touche N sur PC) — voir quickadd.js ---------- */
function openQuickAdd(prefill = '', type = null) {
  if ($('#modal-root').children.length) return;
  let forced = type; // type choisi à la main (sinon deviné)
  modal(`<div class="qa-head"><h2>＋ Ajout rapide</h2><button class="tm-close" data-close aria-label="Fermer">×</button></div>
    <textarea id="qa-t" rows="2" autofocus placeholder="« Appeler le garage demain », « 12 $ Tim », « acheter lait, pain », « idée : … »" enterkeyhint="done" autocapitalize="sentences">${esc(prefill)}</textarea>
    <div class="qa-types" role="radiogroup" aria-label="Type">${quick.TYPES.map(([k, e, l]) => `<button type="button" role="radio" data-qt="${k}" class="chip">${e} ${l}</button>`).join('')}</div>
    <div class="qa-pics" hidden></div>
    <p class="qa-prev" aria-live="polite"></p>
    <div class="modal-actions"><label class="btn qa-pic-btn" title="Ajouter une photo (ou colle-la avec Ctrl + V)"><input type="file" accept="image/*" multiple hidden id="qa-file">📷</label><span class="qa-hint muted">Entrée pour ajouter · Ctrl + V : coller une photo</span><button class="btn primary" id="qa-ok">Ajouter</button></div>`, (m, close) => {
    m.classList.add('qa-modal');
    const ta = m.querySelector('#qa-t'), prev = m.querySelector('.qa-prev'), ok = m.querySelector('#qa-ok'), picsEl = m.querySelector('.qa-pics');
    const fmtDay = (iso, word) => (iso === U.iso(new Date()) ? 'aujourd’hui' : word || U.fmtShort(U.parseISO(iso)));
    // Photos collées (Ctrl + V) ou choisies (📷) : rangées tout de suite, jointes à la note ou à la mission
    let pics = [], saved = false;
    const typeNow = () => forced || (pics.length && !ta.value.trim() ? 'note' : quick.guess(ta.value));
    const parseNow = () => {
      const type = typeNow();
      if (type === 'note' && pics.length && !ta.value.trim()) return { type, ok: true, text: '' };
      return quick.parse(ta.value, type);
    };
    const addPics = async (files) => {
      if (!files.length) return;
      try {
        for (const f of files) pics.push(await images.save(f));
        drawPics();
        draw();
      } catch (err) { toast('Image illisible : ' + err.message, 'err'); }
    };
    const drawPics = async () => {
      picsEl.hidden = !pics.length;
      picsEl.innerHTML = pics.map((id) => `<figure class="qa-pic"><img data-pic="${id}" alt="Photo"><button type="button" class="x" data-rm="${id}" aria-label="Retirer la photo">×</button></figure>`).join('');
      for (const img of picsEl.querySelectorAll('[data-pic]')) img.src = (await images.url(img.dataset.pic)) || '';
      picsEl.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { const id = b.dataset.rm; pics = pics.filter((x) => x !== id); images.removeUnused([id]); drawPics(); draw(); }));
    };
    ta.addEventListener('paste', (e) => {
      const files = images.imageFiles(e.clipboardData);
      if (!files.length) return;
      e.preventDefault(); // une photo seule : on ne colle pas de texte
      addPics(files);
    });
    m.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
    m.addEventListener('drop', (e) => { const f = images.imageFiles(e.dataTransfer); if (f.length) { e.preventDefault(); addPics(f); } });
    m.querySelector('#qa-file').onchange = (e) => { addPics([...e.target.files]); e.target.value = ''; ta.focus(); };
    // Fenêtre fermée sans ajouter : les photos rangées pour rien sont retirées
    const root = $('#modal-root');
    const obs = new MutationObserver(() => { if (!root.contains(m)) { obs.disconnect(); if (!saved && pics.length) images.removeUnused(pics); } });
    obs.observe(root, { childList: true });
    const draw = () => {
      const type = typeNow();
      const p = parseNow();
      m.querySelectorAll('[data-qt]').forEach((b) => { b.classList.toggle('on', b.dataset.qt === type); b.setAttribute('aria-checked', b.dataset.qt === type); });
      ok.disabled = !p.ok;
      const picNote = pics.length ? (['task', 'note'].includes(p.type) ? ` · 📷 ${pics.length > 1 ? `${pics.length} photos` : '1 photo'}` : ' · <span class="muted">(photos seulement pour une note ou une mission)</span>') : '';
      prev.innerHTML = (!ta.value.trim() && !pics.length ? '<span class="muted">Écris, l’app devine : mission, note, dépense ou achat.</span>'
        : p.type === 'task' ? `✅ Mission <b>${esc(p.title)}</b> · ${esc(fmtDay(p.date, p.word))}`
        : p.type === 'note' ? `🧠 Note dans le Cerveau (À classer)`
        : p.type === 'shop' ? `🛒 ${p.items.length > 1 ? `${p.items.length} articles` : 'Article'} : <b>${esc(p.items.join(', '))}</b>`
        : p.ok ? `💸 Dépense <b>${finance.$$$(p.amount)}</b> · ${esc(p.name)} · ${esc(fmtDay(p.date, p.word))}` : '<span class="muted">💸 Ajoute un montant, ex. « 12 $ Tim »</span>') + (ta.value.trim() || pics.length ? picNote : '');
    };
    m.querySelectorAll('[data-qt]').forEach((b) => (b.onclick = () => { forced = b.dataset.qt; draw(); ta.focus(); }));
    ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'; draw(); };
    ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ok.click(); } };
    ok.onclick = async () => {
      const p = parseNow();
      if (!p.ok) return;
      ok.disabled = true;
      try {
        let msg, route;
        const ph = pics.length ? ` avec ${pics.length > 1 ? `${pics.length} photos` : 'sa photo'}` : '';
        if (p.type === 'task') {
          const t = await addTask(p.title, p.date);
          if (pics.length) { const mt = await db.get('tasks', t.id); if (mt) { mt.images = [...(mt.images || []), ...pics]; await db.put('tasks', mt); } }
          msg = `✅ Mission « ${p.title} » ajoutée${ph} (${fmtDay(p.date, p.word)})`; route = ['today', 'missions', 'week', 'month'];
        } else if (p.type === 'note') {
          if (pics.length) {
            // 1re ligne = titre (sinon « Photo du … »), le reste + les photos = contenu
            const [first = '', ...rest] = p.text.split('\n');
            const title = first.trim() || `Photo du ${U.fmtShort(new Date())}`;
            const body = [rest.join('\n').trim(), ...pics.map(images.refLine)].filter(Boolean).join('\n');
            await brain.createNote({ title: title.slice(0, 80), body, type: 'idee', inbox: true });
          } else await brain.capture(p.text);
          msg = `🧠 Note ajoutée au Cerveau${ph} (À classer)`; route = ['brain'];
        }
        else if (p.type === 'shop') { const n = await finance.addShopItems(p.items); msg = n ? `🛒 ${n > 1 ? `${n} articles ajoutés` : 'Article ajouté'} à la liste d’achats` : '🛒 Déjà sur ta liste d’achats'; route = ['today', 'finance']; }
        else { await finance.addExpense(p); msg = `💸 Dépense de ${finance.$$$(p.amount)} ajoutée (${p.name})`; route = ['today', 'finance']; }
        // Photos non utilisées (dépense, achat) : retirées ; sinon gardées avec la note ou la mission
        saved = ['task', 'note'].includes(p.type);
        close();
        toast(msg);
        if (route.includes(location.hash.replace(/^#\/?/, '').split('/')[0] || 'today')) router();
      } catch (err) { ok.disabled = false; toast(err.message, 'err'); }
    };
    draw();
    if (prefill) ta.setSelectionRange(ta.value.length, ta.value.length);
  });
}
/* ---------- 🔍 Recherche globale (Ctrl + K, « / », bouton loupe, ou « Plus » sur cellulaire) ---------- */
const SEARCH_PAGES = [
  ['Aujourd’hui', '#/today', '☀️'], ['Missions', '#/missions', '✅'], ['Objectifs', '#/goals', '🎯'], ['Projets', '#/projects', '🚀'],
  ['Cerveau', '#/brain', '🧠'], ['Actualités', '#/news', '📰'], ['Carnet', '#/notebook', '✏️'], ['Agenda (semaine)', '#/week', '📅'],
  ['Mois', '#/month', '🗓'], ['Année', '#/year', '🗓'], ['Journal', '#/journal', '📔'], ['Finances', '#/finance/apercu', '💰'],
  ['Budget', '#/finance/budget', '🎯'], ['Transactions', '#/finance/transactions', '🧾'], ['Paiements à venir', '#/finance/avenir', '📅'],
  ['Abonnements', '#/finance/abos', '🔁'], ['Projet Propriété', '#/propriete', '🏡'], ['Liste d’achats', '#/finance/achats', '🛒'], ['Workout', '#/workout', '🏋️'],
  ['Étirements', '#/stretch', '🧘'], ['Habitudes', '#/habits', '🔁'], ['Cours RBQ', '#/rbq', '📘'], ['Ton héros', '#/hero', '🦸'],
  ['Réglages', '#/settings', '⚙'], ['Historique des modifications', '#/changelog', '🕘'], ['Ton utilisation', '#/usage', '📊'],
];
const fold = (s = '') => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
async function openSearch() {
  if ($('#modal-root').children.length) return;
  const [tasks, notes, goals, txs] = await Promise.all(['tasks', 'notes', 'goals', 'money'].map((s) => db.all(s).catch(() => [])));
  let items = [], sel = 0;
  modal(`<div class="gs-box"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>
      <input id="gs-q" type="text" enterkeyhint="search" autofocus autocomplete="off" placeholder="Rechercher missions, notes, objectifs, dépenses, pages…" aria-label="Rechercher">
      <button class="tm-close" data-close aria-label="Fermer">×</button></div>
    <div class="gs-res" id="gs-res" role="listbox"></div>
    <p class="gs-foot muted">↑ ↓ pour choisir · Entrée pour ouvrir · Échap pour fermer</p>`, (m, close) => {
    m.classList.add('gs-modal');
    const q = m.querySelector('#gs-q'), res = m.querySelector('#gs-res');
    const go = (it) => { close(); it.run(); };
    const draw = () => {
      const words = fold(q.value).split(/\s+/).filter(Boolean);
      const hit = (...f) => { const s = fold(f.join(' ')); return words.every((w) => s.includes(w)); };
      const groups = [];
      const add = (label, list) => list.length && groups.push([label, list]);
      if (!words.length) {
        add('Missions à faire', tasks.filter((t) => !t.done).sort((a, b) => (a.date || '9').localeCompare(b.date || '9')).slice(0, 5).map((t) => ({ ico: '✅', t: t.title, s: t.date ? U.fmtShort(U.parseISO(t.date)) : '', run: () => openTaskFromSearch(t.id) })));
        add('Pages', SEARCH_PAGES.slice(0, 8).map(([l, h, e]) => ({ ico: e, t: l, s: '', run: () => (location.hash = h) })));
      } else {
        add('Pages', SEARCH_PAGES.filter(([l]) => hit(l)).slice(0, 4).map(([l, h, e]) => ({ ico: e, t: l, s: 'Aller à la page', run: () => (location.hash = h) })));
        add('Missions', tasks.filter((t) => hit(t.title, t.notes, ...(t.subtasks || []).map((s) => s.title))).sort((a, b) => a.done - b.done || (b.date || '').localeCompare(a.date || '')).slice(0, 6)
          .map((t) => ({ ico: t.done ? '☑️' : '✅', t: t.title, s: [t.done ? 'faite' : '', t.date ? U.fmtShort(U.parseISO(t.date)) : ''].filter(Boolean).join(' · '), run: () => openTaskFromSearch(t.id) })));
        add('Cerveau', notes.filter((n) => hit(n.title, n.body, ...(n.tags || []))).sort((a, b) => !!a.archived - !!b.archived || (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 6)
          .map((n) => ({ ico: n.archived ? '🗄' : '🧠', t: n.title || brain.excerpt(n.body, 60) || 'Sans titre', s: n.archived ? 'archivée' : brain.excerpt((n.body || '').replace(/!\[[^\]]*\]\([^)]*\)/g, ''), 70), run: () => (location.hash = '#/note/' + n.id) })));
        add('Objectifs', goals.filter((g) => hit(g.title, g.why)).slice(0, 4).map((g) => ({ ico: '🎯', t: g.title, s: `${g.progress || 0} %`, run: () => (location.hash = '#/goals') })));
        const seen = new Set();
        add('Dépenses', txs.filter((t) => hit(t.merchant, finance.catOf(t.cat).name)).sort((a, b) => b.date.localeCompare(a.date)).filter((t) => !seen.has(t.key) && seen.add(t.key)).slice(0, 4)
          .map((t) => ({ ico: finance.catOf(t.cat).emoji, t: t.merchant, s: `${finance.$$$(t.amount)} · ${U.fmtShort(U.parseISO(t.date))}`, run: () => { finance.showTransactions(t.merchant, t.date); location.hash = location.hash === '#/finance/transactions' ? '#/finance' : '#/finance/transactions'; } })));
      }
      items = groups.flatMap(([, l]) => l);
      sel = Math.min(sel, Math.max(0, items.length - 1));
      let i = 0;
      res.innerHTML = groups.map(([label, list]) => `<div class="gs-group">${esc(label)}</div>${list.map((it) => `<button type="button" role="option" class="gs-item ${i === sel ? 'on' : ''}" data-i="${i++}" aria-selected="${i - 1 === sel}"><span class="gs-ico">${it.ico}</span><span class="gs-txt"><b>${esc(it.t)}</b>${it.s ? `<small>${esc(it.s)}</small>` : ''}</span></button>`).join('')}`).join('')
        || `<p class="empty-sm">Rien trouvé pour « ${esc(q.value)} ». <button type="button" class="link" id="gs-add">＋ L’ajouter</button></p>`;
      res.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => go(items[Number(b.dataset.i)])));
      res.querySelector('#gs-add')?.addEventListener('click', () => { const v = q.value; close(); openQuickAdd(v); });
    };
    const move = (d) => { if (!items.length) return; sel = (sel + d + items.length) % items.length; res.querySelectorAll('[data-i]').forEach((b) => { const on = Number(b.dataset.i) === sel; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); if (on) b.scrollIntoView({ block: 'nearest' }); }); };
    q.oninput = () => { sel = 0; draw(); };
    q.onkeydown = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); go(items[sel]); }
    };
    draw();
  });
}
document.addEventListener('keydown', (e) => {
  const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
  if (((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !document.body.classList.contains('ink-mode'))) {
    e.preventDefault();
    openSearch(); // ne s'ouvre pas par-dessus une autre fenêtre
  }
});
/** Ouvre une mission depuis la recherche : la page se rafraîchit une fois la fenêtre fermée (pas pendant). */
function openTaskFromSearch(id) {
  let changed = false;
  openTaskEditor(id, () => { changed = true; });
  const root = $('#modal-root');
  const obs = new MutationObserver(() => { if (!root.children.length) { obs.disconnect(); if (changed && !document.body.classList.contains('ink-mode')) router(); } });
  obs.observe(root, { childList: true });
}
$('#gs-fab')?.addEventListener('click', () => openSearch());

/* ---------- 🟢 Pastille de synchro (à côté du logo sur PC, sur « Plus » sur cellulaire) ---------- */
function syncState() {
  const s = sync.status();
  if (!s.on) return { c: 'off', t: 'Synchro désactivée : clique pour l’activer (Réglages)' };
  const age = s.last ? ago(s.last) : 'jamais';
  if (s.status === 'login') return { c: 'bad', t: 'Connexion Google expirée : clique pour te reconnecter' };
  if (s.status === 'permission') return { c: 'bad', t: 'Accès au Drive à autoriser : clique pour autoriser' };
  if (s.status === 'error') return { c: 'bad', t: `Erreur de synchro (${s.error}) : clique pour réessayer` };
  if (s.status === 'syncing') return { c: 'busy', t: 'Synchronisation en cours…' };
  if (s.status === 'offline' || !navigator.onLine) return { c: 'warn', t: `Hors ligne : reprendra au retour d’internet · dernière synchro ${age}` };
  if (!s.last || Date.now() - s.last > 6 * 3600e3) return { c: 'warn', t: `Dernière synchro ${age} : clique pour synchroniser` };
  return { c: 'ok', t: `Synchro à jour · ${age} · clique pour synchroniser maintenant` };
}
function drawSyncDot() {
  const { c, t } = syncState();
  const dot = $('#sync-dot');
  if (dot) { dot.dataset.s = c; dot.title = t; dot.setAttribute('aria-label', t); }
  const more = $('#rail-more');
  if (more) more.dataset.sync = c; // point sur « Plus » (cellulaire) quand il faut agir
}
async function syncDotClick() {
  const s = sync.status();
  if (!s.on) { location.hash = '#/settings'; return; }
  if (s.status === 'login' || s.status === 'permission') { try { await gcal.connect(); } catch (err) { toast(err.message, 'err'); return; } }
  const n = await sync.syncNow().catch(() => 0);
  toast(sync.status().status === 'ok' ? (n ? `☁️ ${n} élément${n > 1 ? 's' : ''} reçu${n > 1 ? 's' : ''}` : '☁️ Tout est à jour') : '⚠️ ' + syncState().t);
}
sync.onStatus(drawSyncDot);
addEventListener('online', drawSyncDot);
addEventListener('offline', drawSyncDot);
setInterval(drawSyncDot, 60_000); // « il y a 5 min » reste juste
$('#sync-dot')?.addEventListener('click', syncDotClick);
drawSyncDot();

$('#qa-fab')?.addEventListener('click', () => openQuickAdd());
$('#brand-video')?.addEventListener('click', () => videodock.toggle());
videodock.start(); // remet le dock vidéo tel qu'il était
// ↑ Remonter en haut : un bouton apparaît quand on a défilé ; toucher l'onglet déjà ouvert du menu fait la même chose
{
  const toTop = () => view.scrollTo({ top: 0, behavior: 'smooth' });
  const btn = $('#to-top');
  let raf = 0;
  view.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; if (btn) btn.hidden = view.scrollTop < 500; });
  }, { passive: true });
  btn?.addEventListener('click', toTop);
  $('#rail')?.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[data-route]');
    if (a?.classList.contains('active') && a.getAttribute('href') === location.hash) { e.preventDefault(); toTop(); }
  });
  addEventListener('hashchange', () => { if (btn) btn.hidden = true; });
}
// 📷 Coller une image dans une case « + mission » (Missions, objectifs, projets, jour, semaine…) : la mission aura la photo
{
  const isMissionBox = (el) => el?.matches?.('form input[name="t"]') && /mission/i.test(el.placeholder || '');
  const drawPics = (form, inp) => {
    let chip = form.querySelector('.mi-pics');
    if (!chip) { chip = document.createElement('span'); chip.className = 'mi-pics'; inp.after(chip); }
    chip.innerHTML = `📷 ${form._pics.length > 1 ? form._pics.length + ' photos' : 'photo'}<button type="button" aria-label="Retirer les photos" title="Retirer">×</button>`;
    chip.querySelector('button').onclick = () => { images.removeUnused(form._pics); form._pics = []; chip.remove(); inp.focus(); };
  };
  document.addEventListener('paste', async (e) => {
    const inp = e.target;
    if (!isMissionBox(inp)) return;
    const files = images.imageFiles(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    const form = inp.form;
    form._pics ||= [];
    try { for (const f of files) form._pics.push(await images.save(f)); } catch (err) { toast('Image illisible : ' + err.message, 'err'); return; }
    if (!inp.value.trim()) inp.value = `Photo du ${U.fmtShort(new Date())}`; // titre modifiable avant d'ajouter
    drawPics(form, inp);
    inp.focus();
    inp.select();
    toast('📷 Photo prête : ajoute la mission (Entrée ou +) et elle aura la photo');
  }, true);
  // À l'envoi du formulaire : les photos accompagnent la mission créée
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!form._pics?.length) return;
    setNextTaskImages(form._pics);
    form._pics = [];
    form.querySelector('.mi-pics')?.remove();
  }, true);
}
// Écrans vides : un bouton data-qa ouvre l'ajout rapide déjà prérempli (data-qa-type = type imposé)
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-qa]');
  if (!b) return;
  e.preventDefault();
  openQuickAdd(b.dataset.qa || '', b.dataset.qaType || null);
});
// Touche N (ou +) : ajout rapide, sauf pendant une saisie, un dessin ou une fenêtre ouverte
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || (e.key !== 'n' && e.key !== 'N' && e.key !== '+')) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable], canvas') || document.body.classList.contains('ink-mode')) return;
  e.preventDefault();
  openQuickAdd();
});

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
  // Habitudes : onglet de la section Corps (elles restent aussi dans la page du héros)
  habits: () => habits.renderPage(pageCtx()),
  missions: () => missions.renderPage(pageCtx()),
  projects: renderProjects,
  month: renderMonth, year: renderYear, day: renderDay,
  news: () => news.renderPage(pageCtx()),
  finance: (tab) => finance.renderPage(pageCtx(), tab),
  propriete: (tab) => property.renderPage(pageCtx(), tab),
  usage: renderUsage,
  changelog: renderChangelog,
  activities: () => activities.renderPage(pageCtx(), { tabs: plannerTabs('activities'), addEvent: (day, pre) => eventModal(day, null, pre) }),
  quest: () => rpg.renderPage(pageCtx()),
  rbq: (id) => rbq.renderPage(pageCtx(), id),
  workout: (tab) => workout.renderPage(pageCtx(), tab),
  stretch: () => stretch.renderPage(pageCtx()),
};
const NAV_PARENT = {
  page: 'brain', note: 'brain', news: 'brain', notebook: 'brain', goals: 'missions', projects: 'missions', habits: 'workout', stretch: 'workout',
  setup: 'settings', usage: 'settings', changelog: 'settings', activities: 'week', quest: 'hero', day: 'week', month: 'week', year: 'week', journal: 'week',
};
// Onglets en haut des sections qui regroupent plusieurs pages (le menu n'a qu'une entrée par section)
const SECTION_TABS = {
  missions: [['missions', '✅ Missions'], ['goals', '🎯 Objectifs'], ['projects', '🚀 Projets']],
  brain: [['brain', '🧠 Notes'], ['news', '📰 Actualités'], ['notebook', '✏️ Carnet']],
  workout: [['workout', '🏋️ Workout'], ['stretch', '🧘 Étirements'], ['habits', '🔁 Habitudes']],
  settings: [['settings', '⚙ Réglages'], ['changelog', '🕘 Historique']],
};
let tabsWatch = null;
function sectionTabs(name) {
  const tabs = SECTION_TABS[NAV_PARENT[name] || name];
  if (!tabs || !tabs.some(([k]) => k === name)) return;
  // Une page qui se redessine (cocher une habitude, filtrer) efface les onglets : on les remet
  tabsWatch ||= new MutationObserver(() => {
    const cur = (location.hash.replace(/^#\/?/, '') || 'today').split('/')[0];
    if (!view.querySelector(':scope > .section-tabs')) sectionTabs(cur);
  });
  tabsWatch.observe(view, { childList: true });
  view.querySelector(':scope > .section-tabs')?.remove();
  view.insertAdjacentHTML('afterbegin', `<nav class="seg section-tabs" aria-label="Pages de la section">${tabs.map(([k, l]) =>
    `<a href="#/${k}" class="${k === name ? 'on' : ''}" ${k === name ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`);
}
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
    sectionTabs(name);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="empty">Oups : ${esc(err.message)}</div>`;
  }
}
window.addEventListener('hashchange', router);

/* =========================================================
   Événements Google
   ========================================================= */
async function getEvents(from, to, { plans = false } = {}) {
  // Les rappels créés par Life Planner (alarmes, habitudes) sont déjà dans l'app : on ne les montre pas en double.
  // Les missions planifiées envoyées à Google (« plan: ») s'affichent seulement là où l'app ne dessine pas déjà la mission (plans).
  const own = (list) => list.filter((e) => !e.lp || (plans && e.lp.startsWith('plan:')));
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
    <span class="ev-title">${withTeamLogos(esc(ev.title))}</span></li>`;
}

function bindEvents(root, events, refresh) {
  $$('[data-ev]', root).forEach((li) => {
    li.onclick = () => {
      const ev = events.find((x) => x.id === li.dataset.ev);
      if (ev) eventDetails(ev, refresh);
    };
  });
}

/** Texte échappé dont les adresses web deviennent des liens (ouverts dans un nouvel onglet). */
function linkify(text) {
  return esc(text).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"»]/g, (u) => {
    const href = u.replace(/&amp;/g, '&');
    return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${u}</a>`;
  });
}

function eventDetails(ev, refresh) {
  const when = ev.allDay
    ? cap(U.fmtLong(new Date(ev.start))) + ' · toute la journée'
    : `${cap(U.fmtLong(new Date(ev.start)))} · ${U.fmtTime(new Date(ev.start))} – ${U.fmtTime(new Date(ev.end))}`;
  modal(`<h2>${esc(ev.title)}</h2>
    <p class="muted" style="margin-top:-8px">${esc(when)}<br>${esc(ev.calName || '')}</p>
    ${ev.location ? `<p>📍 ${esc(ev.location)}</p>` : ''}
    ${ev.description ? `<p class="ev-desc" style="white-space:pre-wrap">${linkify(ev.description)}</p>` : ''}
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

function eventModal(dateStr, onDone, pre = {}) {
  modal(`<h2>Nouvel événement</h2>
    <form class="form" id="evf">
      <label>Titre<input name="title" required autofocus autocomplete="off" value="${esc(pre.title || '')}"></label>
      <div class="row">
        <label>Date<input type="date" name="date" value="${dateStr}" required></label>
        <label class="check"><input type="checkbox" name="allDay" ${pre.allDay ? 'checked' : ''}> Toute la journée</label>
      </div>
      <div class="row times" ${pre.allDay ? 'hidden' : ''}>
        <label>Début<input type="time" name="start" value="${pre.start || '09:00'}"></label>
        <label>Fin<input type="time" name="end" value="${pre.end || '10:00'}"></label>
      </div>
      <label>Notes<textarea name="description" rows="2">${esc(pre.description || '')}</textarea></label>
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
/**
 * Liste de missions d'un jour : celles à faire, puis les terminées repliées sous « ✓ Terminées »
 * (Aujourd'hui, Planificateur Jour et Semaine). L'état ouvert/fermé est retenu sur l'appareil.
 */
const doneOpen = () => { try { return localStorage.getItem('lp.doneOpen') === '1'; } catch { return false; } };
function tasksBlock(items, ref, empty = '') {
  const open = items.filter((t) => !t.done), done = items.filter((t) => t.done);
  const none = done.length ? '🎉 Tout est fait !' : empty;
  return `<ul class="tasks">${open.map((t) => taskHTML(t, ref)).join('') || (none ? `<li class="empty-sm">${none}</li>` : '')}</ul>`
    + (done.length ? `<details class="done-fold" ${doneOpen() ? 'open' : ''}><summary>✓ Terminées <small>${done.length}</small></summary>
      <ul class="tasks">${done.map((t) => taskHTML(t, ref)).join('')}</ul></details>` : '');
}
function bindDoneFold(root) {
  root.querySelectorAll('.done-fold').forEach((d) => d.addEventListener('toggle', () => { try { localStorage.setItem('lp.doneOpen', d.open ? '1' : '0'); } catch { /* ignore */ } }));
}
async function taskCard(el, date) {
  const draw = async () => {
    await loadGoals();
    const all = await db.all('tasks');
    const items = all
      .filter((t) => t.date === date || (!t.done && t.date && t.date < date))
      .sort((a, b) => a.done - b.done || prioRank(b) - prioRank(a) || a.date.localeCompare(b.date) || (a.order ?? 1e15) - (b.order ?? 1e15) || a.createdAt - b.createdAt);
    const done = items.filter((t) => t.done).length;
    const late = items.filter((t) => !t.done && t.date < date).sort((a, b) => a.date.localeCompare(b.date));
    el.innerHTML = `<div class="card-head"><h2>📋 Missions du jour</h2><span class="muted">${done}/${items.length} · <a href="#/missions">Gérer →</a></span></div>
      ${late.length ? `<div class="late-bar" role="group" aria-label="Missions en retard">
        <span>⚠ <b>${late.length}</b> mission${late.length > 1 ? 's' : ''} en retard</span>
        <div class="late-acts">
          <button type="button" class="btn sm-text" data-late="today" title="Les mettre toutes à aujourd’hui">Tout à aujourd’hui</button>
          <button type="button" class="btn sm-text" data-late="spread" title="Une par jour à partir d’aujourd’hui, les plus vieilles d’abord">Répartir sur la semaine</button>
          <button type="button" class="btn sm-text" data-late="none" title="Retirer la date (elles restent dans Missions)">Sans date</button>
        </div></div>` : ''}
      <form class="add-row"><input name="t" placeholder="Ajouter une mission…" autocomplete="off"><button class="btn icon" aria-label="Ajouter">+</button></form>
      <ul class="tasks">${items.filter((t) => !t.done).map((t) => taskHTML(t, date)).join('')
        || `<li class="empty-sm">${done ? '🎉 Tout est fait pour aujourd’hui !' : 'Rien de prévu pour l’instant. <button type="button" class="link-btn" data-qa="" data-qa-type="task">＋ Ajouter une mission</button>'}</li>`}</ul>
      ${done ? `<details class="done-fold" ${localStorage.getItem('lp.doneOpen') === '1' ? 'open' : ''}>
        <summary>✓ Terminées <small>${done}</small></summary>
        <ul class="tasks">${items.filter((t) => t.done).map((t) => taskHTML(t, date)).join('')}</ul></details>` : ''}
      <p class="hint muted">Astuce : touche une mission pour l’ouvrir (étapes, notes, date et objectif) ; la case la marque terminée.</p>`;
    // Les missions terminées restent repliées (ou ouvertes) comme tu les as laissées
    el.querySelector('.done-fold')?.addEventListener('toggle', (e) => { try { localStorage.setItem('lp.doneOpen', e.target.open ? '1' : '0'); } catch { /* ignore */ } });
    el.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const v = e.target.t.value.trim();
      if (!v) return;
      await addTask(v, date);
      await draw();
      el.querySelector('input[name=t]').focus();
    };
    bindTaskList(el, draw);
    // Revue des retards : on redonne une date aux missions en retard d'un seul coup (annulable 5 s)
    el.querySelectorAll('[data-late]').forEach((b) => (b.onclick = async () => {
      const before = late.map((t) => ({ id: t.id, date: t.date }));
      const kind = b.dataset.late;
      const days = Math.min(7, late.length);
      const moved = [];
      for (const [i, t] of late.entries()) {
        const cur = await db.get('tasks', t.id);
        if (!cur) continue;
        cur.date = kind === 'none' ? null : kind === 'spread' ? iso(U.addDays(U.parseISO(date), i % days)) : date;
        moved.push(cur);
      }
      for (const t of moved) await db.put('tasks', t);
      await draw();
      refreshToday();
      const label = kind === 'none' ? 'sans date' : kind === 'spread' ? `réparties sur ${days} jour${days > 1 ? 's' : ''}` : 'mises à aujourd’hui';
      showUndo(`${moved.length} mission${moved.length > 1 ? 's' : ''} ${label}`, async () => {
        for (const p of before) { const cur = await db.get('tasks', p.id); if (cur) { cur.date = p.date; await db.put('tasks', cur); } }
        await draw();
        refreshToday();
      }, 5000);
    }));
  };
  await draw();
}

/* =========================================================
   Vue : Aujourd'hui
   ========================================================= */
/* Cartes repliables (page Aujourd'hui) : un bouton ⌄ au bout de l'en-tête de chaque carte la réduit à son
   titre. Le choix est gardé sur cet appareil (une mise en page d'ordi et une de cellulaire peuvent différer). */
const FOLD_KEY = 'lp.folded';
const foldedSet = () => { try { return new Set(JSON.parse(localStorage.getItem(FOLD_KEY)) || []); } catch { return new Set(); } };
const FOLD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
function foldableCards(root) {
  if (!root) return;
  const keyOf = (card) => [...card.classList].find((c) => c.startsWith('t-')) || card.id;
  let removed = []; // cartes masquées (suggestion « Masquer la carte… », réversible dans Ton utilisation)
  const decorate = () => {
    const folded = foldedSet();
    for (const card of root.querySelectorAll(':scope > .today-col > .card')) {
      const key = keyOf(card);
      if (!key || key === 't-hint') continue;
      card.classList.toggle('is-removed', removed.includes(key));
      card.classList.toggle('is-folded', folded.has(key));
      const head = card.querySelector('.card-head');
      if (!head || head.querySelector(':scope > .fold-btn')) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fold-btn';
      b.innerHTML = FOLD_ICON;
      const label = () => (card.classList.contains('is-folded') ? 'Déplier la carte' : 'Réduire la carte');
      b.title = label(); b.setAttribute('aria-label', label()); b.setAttribute('aria-expanded', String(!card.classList.contains('is-folded')));
      b.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation(); // certaines cartes sont un lien en entier
        const set = foldedSet();
        const on = !card.classList.contains('is-folded');
        card.classList.toggle('is-folded', on);
        on ? set.add(key) : set.delete(key);
        try { localStorage.setItem(FOLD_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
        b.title = label(); b.setAttribute('aria-label', label()); b.setAttribute('aria-expanded', String(!on));
      });
      head.append(b);
    }
    trimPhone();
  };
  // Cellulaire : Missions, Objectifs et les 2 premières cartes de côté ; les autres derrière « Afficher plus »
  const PHONE_SIDE = 2;
  const phoneMQ = matchMedia('(max-width: 600px)');
  const trimPhone = () => {
    const cols = root; // root = .today-cols
    if (!cols) return;
    let more = cols.parentElement?.querySelector(':scope > #today-more');
    if (!more) {
      more = document.createElement('button');
      more.type = 'button'; more.id = 'today-more'; more.className = 'btn today-more';
      more.addEventListener('click', () => {
        const open = localStorage.getItem('lp.todayMore') !== '1';
        try { localStorage.setItem('lp.todayMore', open ? '1' : ''); } catch { /* ignore */ }
        trimPhone();
        if (!open) cols.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
      cols.after(more);
    }
    const side = [...root.querySelectorAll('.col-side > .card')].filter((c) => !c.hidden && !c.classList.contains('is-removed') && !c.classList.contains('t-hint') && c.innerHTML.trim());
    const open = (() => { try { return localStorage.getItem('lp.todayMore') === '1'; } catch { return false; } })();
    const extra = phoneMQ.matches ? side.slice(PHONE_SIDE) : [];
    root.querySelectorAll('.m-extra').forEach((c) => { if (!extra.includes(c)) c.classList.remove('m-extra'); });
    extra.forEach((c) => c.classList.toggle('m-extra', !open));
    more.hidden = !extra.length;
    more.textContent = open ? 'Afficher moins ▴' : `Afficher ${extra.length} autre${extra.length > 1 ? 's' : ''} carte${extra.length > 1 ? 's' : ''} ▾`;
  };
  phoneMQ.addEventListener?.('change', trimPhone);
  decorate();
  db.get('settings', 'todayHidden').then((v) => { removed = v || []; decorate(); }).catch(() => {});
  // Les cartes se remplissent (et se redessinent) après coup : on ajoute le bouton à chaque nouvel en-tête
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; decorate(); }, 30);
  }).observe(root, { childList: true, subtree: true });
}

async function renderToday() {
  const now = new Date();
  const today = iso(now);
  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">${greeting()}</p><h1>${cap(U.fmtLong(now))}</h1></div>
      <div class="head-actions">
        <button class="btn head-ico" id="focus-toggle" aria-pressed="false" title="Mode Focus : seulement l’essentiel (3 missions, agenda, habitudes)" aria-label="Mode Focus">🎯</button>
        <button class="btn head-ico" id="as-open" title="Demander à l’assistant (ajouter, déplacer, cocher…)" aria-label="Assistant">✨</button>
        <button class="btn head-ico" id="add-ev" title="Ajouter un événement à Google Agenda" aria-label="Ajouter un événement">📅＋</button>
        <a class="journal-btn" href="#/page/day-${today}" title="Écrire à la main dans le journal du jour" aria-label="Écrire à la main dans le journal du jour">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <defs><linearGradient id="jb-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6c56e"/><stop offset="1" stop-color="#a8842f"/></linearGradient></defs>
            <path d="M6 12c5-2 11-2 17 1v26c-6-3-12-3-17-1z" fill="#7a1e2c" stroke="url(#jb-g)" stroke-width="1.6" stroke-linejoin="round"/>
            <path d="M42 12c-5-2-11-2-17 1v26c6-3 12-3 17-1z" fill="#9b2c3a" stroke="url(#jb-g)" stroke-width="1.6" stroke-linejoin="round"/>
            <path d="M10 18c3-1 6-1 9 .5M10 23c3-1 6-1 9 .5M10 28c3-1 6-1 9 .5" stroke="#f2ede6" stroke-opacity=".55" stroke-width="1.2" fill="none" stroke-linecap="round"/>
            <path d="M33 31l9-15 3 2-9 15-4 1.5z" fill="url(#jb-g)" stroke="#1a1414" stroke-width=".8" stroke-linejoin="round"/>
          </svg></a>
      </div>
    </header>
    <div class="today">
      <section class="card today-top ${foldedSet().has('today-top') ? 'collapsed' : ''}">
        <button type="button" class="top-fold" id="top-fold" aria-expanded="${!foldedSet().has('today-top')}" title="${foldedSet().has('today-top') ? 'Afficher l’agenda et l’humeur' : 'Réduire'}" aria-label="${foldedSet().has('today-top') ? 'Afficher l’agenda et l’humeur' : 'Réduire'}">${FOLD_ICON}</button>
        <div class="today-summary" id="c-hero"></div>
        <div class="top-agenda"><div id="c-agenda"><div class="skeleton"></div></div><div class="ag-journal" id="c-journal"></div></div>
      </section>
      <section class="card capture-card" id="c-brain"></section>
      <div class="today-cols">
        <div class="today-col col-main">
          <section class="card t-tasks" id="c-tasks"></section>
          <section class="card t-goals" id="c-goals"></section>
        </div>
        <div class="today-col col-side">
          <section class="card t-hint" id="c-hint" hidden></section>
          <section class="card t-habits" id="c-habits"></section>
          <section class="card t-money" id="c-money" hidden></section>
          <section class="card t-shop" id="c-shop"></section>
          <section class="card t-workout" id="c-workout"></section>
          <section class="card t-rbq" id="c-rbq" hidden></section>
          <section class="card t-news" id="c-news"></section>
          <section class="card t-ink" id="c-ink"></section>
          <section class="card quote-card t-quote" id="c-quote"></section>
        </div>
      </div>
    </div>`;
  // Carte du haut repliable : réduite, elle garde le héros et les tuiles (agenda, humeur et focus masqués)
  $('#top-fold').onclick = (e) => {
    const card = e.currentTarget.closest('.today-top');
    const on = !card.classList.contains('collapsed');
    card.classList.toggle('collapsed', on);
    const set = foldedSet();
    on ? set.add('today-top') : set.delete('today-top');
    try { localStorage.setItem(FOLD_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
    e.currentTarget.setAttribute('aria-expanded', String(!on));
    const lbl = on ? 'Afficher l’agenda et l’humeur' : 'Réduire';
    e.currentTarget.title = lbl;
    e.currentTarget.setAttribute('aria-label', lbl);
  };
  $('#add-ev').onclick = () => eventModal(today, renderToday);
  $('#as-open').onclick = openAssistant;
  // Mode Focus (gardé sur cet appareil) : la page ne montre que l'essentiel
  const focusOn = () => { try { return localStorage.getItem('lp.focus') === '1'; } catch { return false; } };
  const applyFocus = () => {
    const on = focusOn();
    $('.today', view)?.classList.toggle('focus-mode', on);
    const b = $('#focus-toggle');
    b.classList.toggle('primary', on);
    b.setAttribute('aria-pressed', String(on));
    b.textContent = '🎯'; b.title = on ? 'Focus activé : clique pour tout réafficher' : 'Mode Focus : seulement l’essentiel (3 missions, agenda, habitudes)';
  };
  $('#focus-toggle').onclick = () => { try { localStorage.setItem('lp.focus', focusOn() ? '0' : '1'); } catch { /* ignore */ } applyFocus(); };
  applyFocus();
  // Le résumé du haut suit les cases cochées (missions, habitudes…)
  const refreshSummary = U.debounce(() => heroCard(), 800);
  // clic (cocher), Entrée (ajouter une mission) ou changement : le résumé suit
  for (const ev of ['click', 'submit', 'change']) $('.today-cols', view).addEventListener(ev, () => refreshSummary(), true);
  summaryRefresher = refreshSummary; // aussi après « Annuler » (barre du bas)
  foldableCards($('.today-cols', view));

  // Agenda
  const agenda = async () => {
    const day = agendaDay; // 0 = aujourd'hui, 1 = demain
    const from = U.addDays(U.startOfDay(now), day), to = U.addDays(from, 1);
    const { events, source } = await getEvents(from, to, { plans: true });
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
    // Dans la carte Agenda : humeur et intention du jour (le journal complet est dans le Planificateur)
    el.innerHTML = `<div class="ag-j-head"><h3>🙂 Humeur et intention du jour</h3><a href="#/journal/${today}">Journal →</a></div>
      <div class="moods">${MOODS.map((m) => `<button class="mood ${e.mood === m.v ? 'on' : ''}" data-mood="${m.v}" title="${m.l}">${m.e}</button>`).join('')}</div>
      <textarea data-f="intention" class="ag-intent" aria-label="Intention du jour" placeholder="Intention du jour : qu’est-ce qui rendrait cette journée réussie ?">${esc(e.intention || '')}</textarea>`;
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
    const list = (await db.all('goals')).filter((g) => (g.horizon === 'semaine' || g.horizon === 'mois') && !isGoalDone(g))
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

  news.todayCard($('#c-news'), toast); // en parallèle (réseau) : ne retarde pas le reste de la page
  finance.todayCard($('#c-money')).catch(console.error);
  finance.shopCard($('#c-shop')).catch(console.error);
  usageState().then((st) => usage.todayHint($('#c-hint'), st)).catch(console.error);
  await Promise.all([taskCard($('#c-tasks'), today), lifeCards(), journal(), ink(), goals(), heroCard(), brainCard(), quoteCard()]);
  agenda();
}

/* =========================================================
   Citation du moment (motivation, inspiration, verset)
   ========================================================= */
let refreshToday = () => {};
let summaryRefresher = null;
addEventListener('lp-undo', () => { if ((location.hash || '#/today').startsWith('#/today') || location.hash === '') summaryRefresher?.(); });
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

/* ---------- Dates préprogrammées sous les boîtes « + Mission » (objectifs, projets) ---------- */
// Petit bouton 📅 à côté de la date : ouvre un menu de dates rapides
const QUICK_DATES = `<span class="qd-wrap">
  <button type="button" class="btn icon qd-btn" aria-haspopup="menu" aria-expanded="false" title="Dates rapides" aria-label="Dates rapides">📅</button>
  <div class="qd-menu" role="menu" hidden>
    <button type="button" role="menuitem" data-qd="today">Aujourd’hui</button>
    <button type="button" role="menuitem" data-qd="tomorrow">Demain</button>
    <button type="button" role="menuitem" data-qd="weekend" title="Samedi qui vient (aujourd’hui si on est déjà la fin de semaine)">Week-end</button>
    <button type="button" role="menuitem" data-qd="none">Sans date</button>
  </div></span>`;
const closeQuickMenus = (except) => document.querySelectorAll('.qd-menu:not([hidden])').forEach((m) => {
  if (m === except) return;
  m.hidden = true;
  m.previousElementSibling?.setAttribute('aria-expanded', 'false');
});
function quickDate(kind) {
  const d = new Date();
  if (kind === 'tomorrow') return iso(U.addDays(d, 1));
  if (kind === 'weekend') { const dow = d.getDay(); return iso(dow === 6 || dow === 0 ? d : U.addDays(d, 6 - dow)); }
  if (kind === 'none') return '';
  return iso(d);
}
const syncQuickDates = (form) => {
  const v = form.querySelector('input[type="date"]')?.value || '';
  form.querySelectorAll('[data-qd]').forEach((b) => b.classList.toggle('on', quickDate(b.dataset.qd) === v));
};
document.addEventListener('click', (e) => {
  // 📅 : ouvre ou ferme le menu
  const btn = e.target.closest('.qd-btn');
  if (btn) {
    const menu = btn.nextElementSibling;
    closeQuickMenus(menu);
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) { syncQuickDates(btn.closest('form')); (menu.querySelector('.on') || menu.querySelector('button')).focus(); }
    return;
  }
  const b = e.target.closest('[data-qd]');
  const form = b?.closest('form');
  const input = form?.querySelector('input[type="date"]');
  if (!input) { if (!e.target.closest('.qd-menu')) closeQuickMenus(); return; }
  input.value = quickDate(b.dataset.qd);
  syncQuickDates(form);
  closeQuickMenus();
  form.querySelector('input[name="t"]')?.focus();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.querySelector('.qd-menu:not([hidden])')) { e.stopPropagation(); closeQuickMenus(); } }, true);
document.addEventListener('input', (e) => { if (e.target.matches?.('.add-mission input[type="date"]')) syncQuickDates(e.target.closest('form')); });
// Le bouton qui correspond à la date déjà inscrite s'allume quand la boîte apparaît
new MutationObserver(() => document.querySelectorAll('form.add-mission:not([hidden]):not([data-qd-sync])').forEach((f) => { f.dataset.qdSync = '1'; syncQuickDates(f); }))
  .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });

/* =========================================================
   Assistant (boîte de dialogue qui modifie le planner)
   ========================================================= */
const chat = { history: [], log: [], busy: false }; // conservé tant que l'app est ouverte

/** Ouvre l'assistant dans une fenêtre (bouton ✨ Assistant de la page Aujourd'hui). */
function openAssistant() {
  modal(`<div class="as-modal">
      <div class="card-head"><h2>✨ Assistant</h2><button class="tm-close" data-close aria-label="Fermer" title="Fermer (Échap)">×</button></div>
      <section class="assist" id="c-assist"></section>
      <p class="hint muted">Ex. « ajoute appeler maman demain 18 h », « déplace la cuisine à vendredi », « coche budget ».</p>
    </div>`, async (m) => {
    await assistCard();
    m.querySelector('#c-assist textarea')?.focus();
  });
}

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
      // La confirmation prend la place de la fenêtre : on rouvre l'assistant juste après
      confirm: async (msg) => { const ok = await confirmBox(msg); openAssistant(); return ok; },
    };
    try {
      const r = await assistant.send(chat.history, text, opts);
      chat.log.push({ role: 'bot', text: r.text });
    } catch (err) {
      chat.log.push({ role: 'error', text: err.message });
    } finally {
      chat.busy = false;
      if (changed) refreshToday();
      chat.redraw?.(); // la fenêtre ouverte (elle a pu être rouverte entre-temps)
    }
  };
  $('#as-reset', el).onclick = () => { chat.history = []; chat.log = []; showAll = false; draw(); ta.focus(); };
  chat.redraw = () => { if (!document.body.contains(el)) return; draw(); ta.focus(); };
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
    </div>
    ${await focusLine()}`;
}

/** Rappel de l'objectif en focus (page Aujourd'hui) : titre, progression et prochaine mission. */
async function focusLine() {
  const goals = await db.all('goals');
  const tasks = await db.all('tasks');
  const fg = goals.find((g) => g.focus && !isGoalDone(g));
  let html = '';
  if (fg) {
    const next = tasks.filter((t) => t.goalId === fg.id && !t.done)
      .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.order ?? 1e15) - (b.order ?? 1e15) || a.createdAt - b.createdAt)[0];
    html += `<a class="sum-focus" href="#/goals" title="Objectif en focus">
      <span class="gc-ring sm" style="--p:${fg.progress || 0}%"><span>${fg.progress || 0}</span></span>
      <span class="sum-focus-txt"><small>⭐ Focus</small><b>${esc(fg.title)}</b>${next ? `<small class="muted">Prochaine : ${esc(next.title)}</small>` : ''}</span></a>`;
  }
  // Projets épinglés : aussi en focus (au plus deux)
  for (const p of brain.projectsOf(await brain.allNotes()).filter((x) => x.pinned).slice(0, 2)) {
    const st = brain.projectStats(p.id, goals, tasks);
    const next = projectMissions(p.id, goals, tasks).find((t) => !t.done);
    html += `<a class="sum-focus" href="#/projects" title="Projet en focus">
      <span class="gc-ring sm" style="--p:${st.pct}%"><span>${st.pct}</span></span>
      <span class="sum-focus-txt"><small>📌 Projet</small><b>${esc(p.title || 'Projet')}</b><small class="muted">${next ? `Prochaine : ${esc(next.title)}` : st.missions ? `${st.done}/${st.missions} missions faites` : 'Aucune mission : ajoute la prochaine'}</small></span></a>`;
  }
  // Bande pleine largeur sous le héros et les tuiles (et non dans la colonne du héros)
  return html ? `<div class="sum-focus-row">${html}</div>` : '';
}

/* ---------- Logo personnel (menu + onglet du navigateur) ---------- */
const LOGO_COLORS = ['#7a1e2c', '#0a0909', '#c9a24a', '#0f3d2e', '#4f46e5', '#0ea5e9', '#0c8484', '#16a34a', '#ca8a04', '#f97316', '#e11d48', '#a855f7', '#1d1d1f'];
async function getLogo() {
  // Logo The Planner : adopté une fois sur chaque compte (après, ton choix dans Réglages › Mon logo est gardé)
  if (!APP.couple && !(await db.get('settings', 'logoPlanner'))) {
    const cur = await db.get('settings', 'logo');
    if (cur && cur.mode !== 'app') await db.put('settings', { ...cur, mode: 'app' }, 'logo');
    await db.put('settings', true, 'logoPlanner');
  }
  return { mode: 'app', text: '', color: '#7a1e2c', emoji: '🦁', title: APP.name, ...((await db.get('settings', 'logo')) || {}) };
}
const initialsOf = (name) => (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'LP';
function shade(hex, k) { // assombrit une couleur #rrggbb (k < 0) ou l'éclaircit (k > 0)
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (k < 0 ? c * k : (255 - c) * k))));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((c) => c.toString(16).padStart(2, '0')).join('');
}
function logoSVG(cfg, av, size = 34) {
  const uidg = 'lg' + Math.random().toString(36).slice(2, 7);
  const c = /^#[0-9a-f]{6}$/i.test(cfg.color) ? cfg.color : '#7a1e2c';
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
  if (cfg.mode === 'app') return `<img class="logo-img round" src="icons/${APP.couple ? 'icon.svg' : 'logo.png'}" alt="" width="${size}" height="${size}">`;
  // Mon image : logo importé (déjà carré et réduit à l'import)
  if (cfg.mode === 'image') return cfg.img ? `<img class="logo-img" src="${esc(cfg.img)}" alt="" width="${size}" height="${size}">` : `<img src="icons/${APP.couple ? 'icon.svg' : 'logo.png'}" alt="" width="${size}" height="${size}">`;
  // Avatar (par défaut) : ton héros, dans un cadre à ta couleur
  const inner = AV.avatarSVG(av, size - 4).replace('<svg ', '<svg x="2" y="2" ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><rect x=".75" y=".75" width="${size - 1.5}" height="${size - 1.5}" rx="${size * 0.28}" fill="none" stroke="${c}" stroke-width="1.5"/>${inner}</svg>`;
}
/** Logo importé : recadré en carré (centré, sans déformation), 256 px, en PNG (WebP s'il est trop lourd). */
function squareLogo(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('Choisis un fichier image')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const S = 256, w = img.naturalWidth || S, h = img.naturalHeight || S, side = Math.min(w, h);
      const c = document.createElement('canvas');
      c.width = c.height = S;
      c.getContext('2d').drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, S, S);
      URL.revokeObjectURL(url);
      let data = c.toDataURL('image/png');
      if (data.length > 180_000) data = c.toDataURL('image/webp', 0.9); // photo : plus léger pour la synchro
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

async function applyLogo(s) {
  const cfg = await getLogo();
  const av = await getAvatar(s);
  const el = $('#brand-logo');
  if (el) el.innerHTML = logoSVG(cfg, av, 34);
  const name = $('.brand-main > span');
  if (name) name.textContent = cfg.title || APP.name;
  document.title = cfg.title || APP.name;
  // Icône de l'onglet du navigateur
  if (cfg.mode !== 'app' && !(cfg.mode === 'image' && !cfg.img)) {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    if (cfg.mode === 'image') {
      link.type = cfg.img.slice(5, cfg.img.indexOf(';')) || 'image/png';
      link.href = cfg.img;
    } else {
      link.type = 'image/svg+xml';
      link.href = 'data:image/svg+xml,' + encodeURIComponent(logoSVG(cfg, av, 64));
    }
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
    <header class="page-head"><div><p class="eyebrow">Progression</p><h1>Ton héros</h1></div>
      <div class="head-actions"><a class="btn primary" href="#/quest">⚔️ Aventure</a></div></header>
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
        <details class="card hero-fold evo-fold">
          <summary><h2>🧠 Évolution du savoir</h2><span class="muted">${evoLine(s)}</span></summary>
          ${evoBar(s)}
          <p class="muted" style="margin:10px 0 14px">Chaque note, lien et révision dans ton second cerveau donne des points de <b>Savoir</b> qui font évoluer ton avatar. <a href="#/brain">Ouvrir le Cerveau →</a></p>
          <div class="evo-steps">${game.EVO.map((st, i) => `<div class="evo-step ${i <= s.evo ? 'on' : ''} ${i === s.evo ? 'cur' : ''}">
            ${AV.avatarSVG({ ...av, evoFx: true, evo: i }, 64)}<b>${st.icon} ${esc(st.name)}</b><small>${i <= s.evo ? esc(st.desc) : `${st.k} Savoir`}</small></div>`).join('')}</div>
          <label class="check-line"><input type="checkbox" id="evo-fx" ${av.evoFx === false ? '' : 'checked'}> Afficher les effets d’évolution sur mon avatar</label>
        </details>
        <details class="card hero-fold">
          <summary><h2>🎨 Personnalisation</h2><span class="muted">Monte de niveau pour débloquer plus d’options</span></summary>
          <div id="custom"></div>
        </details>
        <details class="card hero-fold">
          <summary><h2>🏅 Badges</h2><span class="muted">${owned.size}/${game.BADGES.length}</span></summary>
          <div class="badges">${game.BADGES.map((b) => `<div class="badge ${owned.has(b.id) ? 'on' : ''}" title="${esc(b.desc)}">
            <span class="bi">${b.icon}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`).join('')}</div>
        </details>
        <details class="card hero-fold">
          <summary><h2>📜 Comment gagner des XP</h2></summary>
          <ul class="rules">${game.RULES.map(([i, l, x]) => `<li><span>${i}</span><span>${esc(l)}</span><b>+${x}</b></li>`).join('')}</ul>
        </details>
        <details class="card hero-fold">
          <summary><h2>⚡ Derniers gains</h2><span class="muted">${s.recent[0] ? `+${s.recent[0].amount} · ${esc(s.recent[0].reason)}` : ''}</span></summary>
          <ul class="rules">${s.recent.map((e) => `<li><span class="muted">${U.fmtShort(new Date(e.at))}</span><span>${esc(e.reason)}</span><b>+${e.amount}</b></li>`).join('') || '<li class="empty-sm">Accomplis une mission pour gagner tes premiers XP !</li>'}</ul>
        </details>
      </div>
    </div>`;

  // Habitudes : suivi et rappels, directement dans la page du héros
  await habits.renderPage({ ...pageCtx(), view: $('#hero-habits'), embedded: true });

  const cfg = { ...av };
  // Héros en entier, avec l'équipement de l'Aventure
  const gear = await rpg.equippedItems();
  const drawBig = () => { $('#hero-big').innerHTML = AV.heroSVG(cfg, gear, 250); };
  drawBig();
  const save = async () => {
    const { evo, ...stored } = cfg; // le stade d'évolution est calculé, pas enregistré
    await db.put('settings', stored, 'avatar');
    drawBig();
    refreshRail();
  };
  const drawCustom = () => {
    $('#custom').innerHTML = `<div class="opt-group"><h3>Style en un clic</h3><div class="av-presets">${AV.PRESETS.map((p) => `<button type="button" class="btn" data-preset="${p.id}">${esc(p.name)}</button>`).join('')}</div></div>`
      + AV.CATEGORIES.map((cat) => `
      <div class="opt-group"><h3>${cat.name}</h3><div class="opts">${cat.items.map((it, i) => {
        const val = cat.type === 'color' ? i : it.id;
        const locked = it.lvl && it.lvl > s.level;
        const on = cfg[cat.key] === val;
        let inner;
        if (cat.type === 'color') inner = `<span class="swatch" style="--sw:${it.c}"></span>`;
        else if (cat.type === 'bg') inner = `<span class="swatch" style="--sw:${it.g ? `linear-gradient(135deg,${it.g[0]},${it.g[1]})` : it.fill}"></span>`;
        else if (cat.body) inner = AV.heroSVG({ ...cfg, [cat.key]: val }, [], 70); // option du corps : aperçu en entier
        else inner = AV.avatarSVG({ ...cfg, [cat.key]: val }, 52);
        return `<button class="opt ${cat.type} ${on ? 'on' : ''}" data-k="${cat.key}" data-v="${val}" ${locked ? 'disabled' : ''}
          title="${locked ? `Débloqué au niveau ${it.lvl}` : esc(it.name || '')}">${inner}${locked ? `<span class="lock">🔒${it.lvl}</span>` : ''}</button>`;
      }).join('')}</div></div>`).join('');
    // Préréglage : on applique tout ce qui est déjà débloqué à ton niveau
    $$('#custom [data-preset]').forEach((b) => (b.onclick = () => {
      const p = AV.PRESETS.find((x) => x.id === b.dataset.preset);
      const skipped = [];
      for (const [k, v] of Object.entries(p.cfg)) { if (AV.isLocked(k, v, s.level)) skipped.push(k); else cfg[k] = v; }
      save();
      drawCustom();
      toast(`${p.name} appliqué${skipped.length ? ' (quelques éléments se débloquent plus tard)' : ''}`);
    }));
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
   Vue : Lanceur (raccourcis vers des sites et applications)
   ========================================================= */
let launcherEdit = false;

/** « App Windows » qui ne s'est pas ouverte : le lien lpapp: n'est pas installé sur ce PC, ou le nom ne correspond à aucune app. */
function pcMissing(it) {
  toast(`${it.name} ne s’est pas ouvert : lance une fois « Installer apps Windows.bat » (dossier Life Planner), et vérifie que la tuile porte le même nom que l’app dans le menu Démarrer. 🌐 ouvre le site.`, 'err');
}

async function renderLauncher() {
  const items = await launcher.list();
  view.innerHTML = `
    <header class="page-head"><div><p class="eyebrow">Raccourcis</p><h1>Lanceur</h1></div>
      <div class="head-actions"><button class="btn ${launcherEdit ? 'primary' : ''}" id="ln-edit">${launcherEdit ? '✓ Terminé' : '✎ Modifier'}</button></div></header>
    <div class="launch-grid ${launcherEdit ? 'editing' : ''}">${items.map((it, i) => `
      <div class="lt-wrap" data-i="${i}">
        <button class="lt" data-open="${i}" title="${esc(it.mode === 'app' || it.mode === 'pc' ? `Ouvrir l’application ${it.name}` : it.mode === 'installed' ? `Ouvrir ${it.name} dans son application installée` : `Ouvrir ${it.name} dans une nouvelle fenêtre`)}">
          <span class="lt-ico" style="--c:${esc(launcher.colorOf(it))}">${launcher.iconHTML(it)}</span>
          <span class="lt-name">${esc(it.name)}</span>
          <small class="muted">${it.mode === 'app' ? 'Application' : launcher.MODES[it.mode] || 'Fenêtre'}</small>
        </button>
        ${launcherEdit && it.mode !== 'app' ? `<select class="lt-mode" data-mode="${i}" aria-label="Ouverture de ${esc(it.name)}">${Object.entries(launcher.MODES).map(([k, l]) => `<option value="${k}" ${k === (it.mode || 'window') ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
        ${(it.mode === 'app' || it.mode === 'pc') && it.url && !launcherEdit ? `<button class="lt-web" data-web="${i}" title="Ouvrir la version web" aria-label="Version web de ${esc(it.name)}">🌐</button>` : ''}
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
        <select name="mode" aria-label="Ouverture"><option value="window">Nouvelle fenêtre</option><option value="pc">App Windows (sans page web)</option><option value="installed">App installée dans Edge</option><option value="tab">Onglet du navigateur</option></select>
        <button class="btn primary">Ajouter</button>
      </form>
      <p class="hint muted"><b>App Windows</b> : ouvre directement l’app du menu Démarrer qui porte le même nom que la tuile (ex. NHL installée depuis Edge, ou une app du Microsoft Store), sans passer par une page web. À faire une seule fois sur ce PC : double-clique <code>Installer apps Windows.bat</code> dans le dossier Life Planner. Sur cellulaire, la tuile ouvre le site.</p>
      <p class="hint muted"><b>App installée</b> : ouvre le site sans barre d’adresse. Installe-le d’abord dans Edge (sur le site : ⋯ → Applications → Installer ce site en tant qu’application), puis dans <code>edge://apps</code>, ouvre les détails de l’app et autorise-la à ouvrir les liens pris en charge.</p>
      <button class="btn" id="ln-reset" type="button">Rétablir les raccourcis par défaut</button>
    </section>` : `<p class="hint muted">Les sites s’ouvrent chacun dans leur propre fenêtre (un 2e clic ramène la même). Edge et Spotify s’ouvrent comme applications Windows ; 🌐 ouvre la version web. Si rien ne s’ouvre, autorise les fenêtres pop-up pour Life Planner dans Edge.</p>
    <p class="hint muted">🧠 Pour enregistrer des posts Reddit et des vidéos YouTube dans ton Cerveau, installe l’extension du dossier <b>extension-edge</b> (voir le README).</p>`}`;

  $('#ln-edit').onclick = () => { launcherEdit = !launcherEdit; renderLauncher(); };
  $$('[data-open]').forEach((b) => (b.onclick = () => {
    if (launcherEdit) return;
    const it = items[Number(b.dataset.open)];
    if (!launcher.open(it, pcMissing)) toast('La fenêtre a été bloquée : autorise les pop-ups pour Life Planner dans Edge', 'err');
  }));
  $$('[data-web]').forEach((b) => (b.onclick = () => launcher.openWindow(items[Number(b.dataset.web)])));
  $$('.lt-tools [data-mv]').forEach((b) => (b.onclick = async () => {
    const i = Number(b.closest('.lt-wrap').dataset.i), j = i + Number(b.dataset.mv);
    [items[i], items[j]] = [items[j], items[i]];
    await launcher.save(items);
    renderLauncher();
  }));
  $$('[data-mode]').forEach((s) => (s.onchange = async () => {
    items[Number(s.dataset.mode)].mode = s.value;
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
  // Jour : aujourd'hui si la période affichée le contient (semaine, mois, année en cours), sinon son premier jour
  const now = new Date(), t = iso(now);
  const hasToday = active === 'week' ? t >= day && t < iso(U.addDays(d, 7))
    : active === 'month' ? t.slice(0, 7) === day.slice(0, 7)
    : active === 'year' ? now.getFullYear() === d.getFullYear()
    : active === 'activities';
  const dayLink = hasToday ? t : day;
  const tabs = [['day', 'Jour', `#/day/${dayLink}`], ['week', 'Semaine', `#/week/${day}`], ['month', 'Mois', `#/month/${day.slice(0, 7)}`], ['year', 'Année', `#/year/${d.getFullYear()}`], ['journal', '📖 Journal', `#/journal/${dayLink}`] /* s'ouvre sur la date affichée */, ['activities', '🎟 Activités', '#/activities']];
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
    ${goals.map((g) => `<div class="goal mini"><span class="title">${isGoalDone(g) ? '🏁 ' : ''}${esc(g.title)}</span><span class="pct">${g.progress}%</span><div class="bar"><i style="width:${g.progress}%"></i></div></div>`).join('')
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
        <span class="pl-nav"><a class="btn icon" href="#/month/${ym(prev)}" aria-label="Mois précédent">‹</a>
        <a class="btn" href="#/month">Ce mois-ci</a>
        <a class="btn icon" href="#/month/${ym(next)}" aria-label="Mois suivant">›</a></span>
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
  const { events, source } = await getEvents(gridStart, U.addDays(gridStart, weeks * 7), { plans: true });
  if (!$('#sync')) return;
  $('#sync').innerHTML = await syncBadge(source);
  $$('.mc-day').forEach((cell) => {
    const ds = +U.parseISO(cell.dataset.day), de = +U.addDays(ds, 1);
    const list = events.filter((e) => e.start < de && e.end > ds);
    cell.querySelector('.mc-evs').innerHTML = list.slice(0, 3).map((e) => `<li title="${esc(e.title)}">${e.allDay ? '' : `<small>${U.fmtTime(new Date(e.start))}</small> `}${withTeamLogos(esc(e.title))}</li>`).join('')
      + (list.length > 3 ? `<li class="more">+ ${list.length - 3}</li>` : '');
  });

  // Survol d'un jour (stylet Surface ou souris) : petite fenêtre avec le détail de la journée
  document.getElementById('mc-tip')?.remove();
  let tipT = null;
  const hideTip = () => { clearTimeout(tipT); document.getElementById('mc-tip')?.remove(); };
  const showTip = (cell) => {
    const k = cell.dataset.day;
    if (!cell.isConnected || location.hash.split('/')[1] !== 'month') return;
    const ds = +U.parseISO(k), de = +U.addDays(ds, 1);
    const evs = events.filter((e) => e.start < de && e.end > ds).sort((a, b) => a.start - b.start);
    const ts = tasks.filter((t) => t.date === k).sort((a, b) => a.done - b.done || prioRank(b) - prioRank(a) || (a.order ?? 1e15) - (b.order ?? 1e15));
    const j = jBy[k], m = moodOf(j);
    const note = j && (j.intention || j.text || '').trim();
    const d = U.parseISO(k);
    hideTip();
    const tip = document.createElement('div');
    tip.id = 'mc-tip';
    tip.className = 'mc-tip';
    tip.setAttribute('role', 'tooltip');
    tip.innerHTML = `
      <div class="mct-head"><b>${cap(U.fmtLong(d))}</b>${k === today ? '<span class="chip">Aujourd’hui</span>' : ''}${m ? `<span class="mct-mood" title="${esc(m.l)}">${m.e}</span>` : ''}</div>
      ${note ? `<p class="mct-note">${j.intention ? '🎯 ' : '📝 '}${esc(note.length > 140 ? note.slice(0, 139) + '…' : note)}</p>` : ''}
      ${evs.length ? `<ul class="mct-evs">${evs.map((e) => `<li style="--c:${esc(e.color || 'var(--accent)')}"><span class="mct-time">${e.allDay ? 'Journée' : `${U.fmtTime(new Date(e.start))}–${U.fmtTime(new Date(e.end))}`}</span><span>${withTeamLogos(esc(e.title))}</span></li>`).join('')}</ul>` : ''}
      ${ts.length ? `<p class="mct-lbl">Missions ${ts.filter((t) => t.done).length}/${ts.length}</p><ul class="mct-tasks">${ts.slice(0, 8).map((t) => `<li class="${t.done ? 'done' : ''}">${t.done ? '☑' : '☐'} ${esc(t.title)}</li>`).join('')}${ts.length > 8 ? `<li class="muted">+ ${ts.length - 8} autres</li>` : ''}</ul>` : ''}
      ${!evs.length && !ts.length && !note ? '<p class="muted mct-empty">Journée libre</p>' : ''}`;
    document.body.appendChild(tip);
    // À droite du jour s'il y a de la place, sinon à gauche ; toujours dans l'écran
    const r = cell.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, gap = 10;
    let x = r.right + gap;
    if (x + w > innerWidth - 8) x = r.left - w - gap;
    if (x < 8) x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    let y = Math.max(8, Math.min(innerHeight - h - 8, r.top));
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  };
  $$('.mc-day').forEach((cell) => {
    cell.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return; // au doigt : le toucher ouvre le jour comme avant
      clearTimeout(tipT);
      tipT = setTimeout(() => showTip(cell), e.pointerType === 'pen' ? 150 : 450);
    });
    cell.addEventListener('pointerleave', hideTip);
    cell.addEventListener('pointerdown', hideTip);
  });
  addEventListener('hashchange', hideTip, { once: true });
  view.addEventListener('scroll', hideTip, { once: true, passive: true });
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
        <span class="pl-nav"><a class="btn icon" href="#/year/${y - 1}" aria-label="Année précédente">‹</a>
        <a class="btn" href="#/year">Cette année</a>
        <a class="btn icon" href="#/year/${y + 1}" aria-label="Année suivante">›</a></span>
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

const weekFolds = () => { try { return JSON.parse(localStorage.getItem('lp.weekFolds')) || {}; } catch { return {}; } };
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
        <span class="pl-nav"><a class="btn icon" href="#/week/${iso(U.addDays(start, -7))}" aria-label="Semaine précédente">‹</a>
        <a class="btn" href="#/week">Cette semaine</a>
        <a class="btn icon" href="#/week/${iso(end)}" aria-label="Semaine suivante">›</a></span>
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
        <div class="day-tasks"></div>
        <form class="add-mini"><input name="t" placeholder="+ Mission" autocomplete="off"></form>
      </section>`;
    }).join('')}</div>`;

  await loadGoals();
  const drawTasks = async (dayEl) => {
    const k = dayEl.dataset.day;
    const items = (await db.all('tasks')).filter((t) => t.date === k).sort((a, b) => a.done - b.done || prioRank(b) - prioRank(a) || (a.order ?? 1e15) - (b.order ?? 1e15) || a.createdAt - b.createdAt);
    const box = dayEl.querySelector('.day-tasks');
    // Missions du jour dans une cellule repliable : aujourd'hui ouvert par défaut, les autres jours repliés
    // (ton choix pour chaque jour est gardé sur cet appareil)
    const folds = weekFolds();
    const open = folds[k] ?? (k === today);
    const nd = items.filter((t) => t.done).length;
    box.innerHTML = items.length ? `<button type="button" class="day-fold" aria-expanded="${open}"><span class="df-caret" aria-hidden="true">›</span> ✅ ${items.length} mission${items.length > 1 ? 's' : ''}<span class="muted">${nd ? ` · ${nd} faite${nd > 1 ? 's' : ''}` : ''}</span></button>
      <div class="day-fold-body" ${open ? '' : 'hidden'}>${tasksBlock(items)}</div>` : '';
    box.querySelector('.day-fold')?.addEventListener('click', (e) => {
      const b = e.currentTarget, on = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(on));
      b.nextElementSibling.hidden = !on;
      const f = weekFolds();
      f[k] = on;
      for (const d of Object.keys(f)) if (d < iso(U.addDays(new Date(), -21))) delete f[d]; // on oublie les vieux jours
      try { localStorage.setItem('lp.weekFolds', JSON.stringify(f)); } catch { /* ignore */ }
    });
    bindDoneFold(box);
    bindTaskList(box, () => drawTasks(dayEl));
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
  // Semaine en cours : la journée d'aujourd'hui est centrée à l'écran à l'ouverture
  setTimeout(() => $('.day.is-today')?.scrollIntoView({ block: 'center', inline: 'center' }), 350);
}

/* =========================================================
   Vue : Jour (horaire heure par heure + missions du jour)
   ========================================================= */
const DAY_H = 48; // hauteur d'une heure (px)
async function renderDay(arg) {
  const d = arg ? U.parseISO(arg) : new Date();
  d.setHours(0, 0, 0, 0);
  const k = iso(d), today = iso(new Date());
  const isToday = k === today;
  const j = await db.get('journal', k), m = moodOf(j);

  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Planificateur${isToday ? ' · Aujourd’hui' : ''}</p><h1>${cap(U.fmtLong(d))}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}</h1></div>
      <div class="head-actions">
        ${plannerTabs('day', d)}
        <span id="sync"></span>
        <span class="pl-nav"><a class="btn icon" href="#/day/${iso(U.addDays(d, -1))}" aria-label="Jour précédent">‹</a>
        <a class="btn" href="#/day">Aujourd’hui</a>
        <a class="btn icon" href="#/day/${iso(U.addDays(d, 1))}" aria-label="Jour suivant">›</a></span>
      </div>
    </header>
    <div class="dayv">
      <section class="card dayv-cal">
        <div class="card-head"><h2>🕒 Horaire</h2><button class="btn primary dv-add-btn" id="dv-add" type="button"><span aria-hidden="true">＋</span> Événement</button></div>
        <ul class="evs dayv-allday" hidden></ul>
        <div class="dayv-grid" id="dv-grid"></div>
      </section>
      <div class="dayv-side">
        <section class="card">
          <div class="card-head"><h2>✅ Missions</h2><span class="muted" id="dv-count"></span></div>
          <div id="dv-tasks"></div>
          <form class="add-mini" id="dv-addt"><input name="t" placeholder="+ Mission pour ce jour" autocomplete="off"></form>
        </section>
        <a class="card dayv-j" href="#/journal/${k}">
          <span class="dayv-j-ico">${m ? m.e : '📖'}</span>
          <span><b>Journal</b><br><small class="muted">${journalHas(j) ? esc((j.intention || j.text || 'Entrée écrite').slice(0, 90)) : 'Écrire dans le journal de ce jour'}</small></span>
        </a>
      </div>
    </div>`;

  await loadGoals();
  let alarmTasks = [], schedTasks = [];
  let gridFrom = 7; // première heure affichée dans l'horaire
  const minToHM = (min) => { const r = Math.round(min / 15) * 15; return `${U.pad(Math.floor(r / 60))}:${U.pad(r % 60)}`; };
  const redrawDay = async () => { await drawTasks(); await drawEvents(); };
  const drawTasks = async () => {
    const all = await db.all('tasks');
    const items = all.filter((t) => t.date === k).sort((a, b) => a.done - b.done || prioRank(b) - prioRank(a) || (a.order ?? 1e15) - (b.order ?? 1e15) || a.createdAt - b.createdAt);
    alarmTasks = all.filter((t) => !t.done && t.alarmAt && iso(new Date(t.alarmAt)) === k);
    schedTasks = items.filter((t) => t.time); // missions placées à l'horaire (glissées sur la grille ou heure choisie)
    const box = $('#dv-tasks');
    if (!box) return;
    box.innerHTML = tasksBlock(items, today, 'Aucune mission prévue ce jour-là.');
    bindDoneFold(box);
    $('#dv-count').textContent = items.length ? `${items.filter((t) => t.done).length}/${items.length}` : '';
    bindTaskList(box, redrawDay);
  };

  // Horaire : une ligne par heure ; les événements qui se chevauchent se partagent la largeur
  const drawEvents = async () => {
    const ds = +d, de = +U.addDays(d, 1);
    const { events, source } = await getEvents(d, U.addDays(d, 1));
    if (!$('#dv-grid')) return;
    $('#sync').innerHTML = await syncBadge(source);
    const list = events.filter((e) => e.start < de && e.end > ds);
    const allDay = list.filter((e) => e.allDay);
    const timed = list.filter((e) => !e.allDay).map((e) => ({ ...e, s: Math.max(e.start, ds), e2: Math.min(e.end, de) }));
    // Missions placées à l'horaire : des blocs comme les événements (ils partagent la largeur en cas de chevauchement)
    const blocks = schedTasks.map((t) => { const [h, mi] = t.time.split(':').map(Number); const s = ds + (h * 60 + mi) * 60_000; return { task: t, s, e2: Math.min(s + (t.dur || 60) * 60_000, de) }; });
    const marks = alarmTasks.map((t) => ({ t, s: t.alarmAt }));
    const hr = (ms) => (ms - ds) / 3_600_000;
    const from = Math.min(7, ...timed.map((e) => Math.floor(hr(e.s))), ...blocks.map((e) => Math.floor(hr(e.s))), ...marks.map((x) => Math.floor(hr(x.s))));
    const to = Math.max(22, ...timed.map((e) => Math.ceil(hr(e.e2))), ...blocks.map((e) => Math.ceil(hr(e.e2))), ...marks.map((x) => Math.ceil(hr(x.s)) + 1));
    gridFrom = from;
    // Colonnes pour les chevauchements
    const laid = [...timed, ...blocks].sort((a, b) => a.s - b.s || b.e2 - a.e2);
    let group = [], groupEnd = 0;
    const flush = () => { const n = Math.max(...group.map((e) => e.col)) + 1; group.forEach((e) => (e.cols = n)); group = []; };
    for (const e of laid) {
      if (group.length && e.s >= groupEnd) flush();
      const used = new Set(group.filter((x) => x.e2 > e.s).map((x) => x.col));
      e.col = 0; while (used.has(e.col)) e.col++;
      group.push(e); groupEnd = Math.max(groupEnd, e.e2);
    }
    if (group.length) flush();
    const top = (ms) => (hr(ms) - from) * DAY_H;
    const hours = [];
    for (let h = from; h < to; h++) hours.push(`<button type="button" class="dayv-slot" data-h="${h}" style="top:${(h - from) * DAY_H}px" aria-label="Ajouter un événement à ${h} h"><span>${U.pad(h)}:00</span></button>`);
    const now = Date.now();
    $('#dv-grid').style.height = `${(to - from) * DAY_H}px`;
    $('#dv-grid').innerHTML = hours.join('')
      + timed.map((e) => {
        const h = Math.max(top(e.e2) - top(e.s), 22);
        return `<div class="ev dayv-ev ${e.end < now ? 'past' : ''} ${h < 40 ? 'short' : ''}" data-ev="${esc(e.id)}" style="--c:${esc(e.color)};top:${top(e.s)}px;height:${h - 2}px;left:calc(56px + (100% - 60px) * ${e.col} / ${e.cols});width:calc((100% - 60px) / ${e.cols} - 4px)">
          <span class="ev-title">${withTeamLogos(esc(e.title))}</span><span class="ev-time">${U.fmtTime(new Date(e.start))} – ${U.fmtTime(new Date(e.end))}</span></div>`;
      }).join('')
      + blocks.map((b) => {
        const h = Math.max(top(b.e2) - top(b.s), 14), t = b.task; // missions courtes (ex. 3 dans une heure) : petits blocs qui ne se chevauchent pas
        return `<div class="dayv-task ${t.done ? 'done' : ''} ${h < 40 ? 'short' : ''} ${h < 24 ? 'tiny' : ''}" data-tid="${t.id}" style="top:${top(b.s)}px;height:${h - 2}px;left:calc(56px + (100% - 60px) * ${b.col} / ${b.cols});width:calc((100% - 60px) / ${b.cols} - 4px)" title="Glisser pour changer l’heure · clic pour ouvrir">
          <input type="checkbox" class="dvt-cb" ${t.done ? 'checked' : ''} aria-label="Mission accomplie : ${esc(t.title)}"><span class="ev-title">✅ ${esc(t.title)}</span><span class="ev-time">${esc(timeLabel(t))}</span><button type="button" class="dvt-x" aria-label="Retirer « ${esc(t.title)} » de l’horaire" title="Retirer de l’horaire (la mission reste dans la liste)">×</button></div>`;
      }).join('')
      + marks.map(({ t, s }) => `<a class="dayv-alarm" href="#/missions" style="top:${top(s) - 11}px" title="Alarme de mission">⏰ ${U.fmtTime(new Date(s))} · ${esc(t.title)}</a>`).join('')
      + (isToday && hr(now) >= from && hr(now) <= to ? `<div class="dayv-now" style="top:${top(now)}px"></div>` : '');
    const ad = $('.dayv-allday');
    ad.hidden = !allDay.length;
    ad.innerHTML = allDay.map((e) => evItem(e, true)).join('');
    bindEvents($('.dayv-cal'), list, drawEvents);
    $$('.dayv-slot').forEach((b) => (b.onclick = () => hourMenu(+b.dataset.h)));
    // Blocs de mission : case = accomplie ; glisser = changer l'heure (par quart d'heure) ; clic = ouvrir la mission
    $$('.dayv-task').forEach((el) => {
      const id = el.dataset.tid;
      el.querySelector('.dvt-cb').onchange = async (e) => { await setTaskDone(id, e.target.checked); redrawDay(); };
      // × : retire la mission de l'horaire (elle reste dans la liste du jour, sans heure) ; « Annuler » la remet
      el.querySelector('.dvt-x').onclick = async (e) => {
        e.stopPropagation();
        const before = await db.get('tasks', id);
        await scheduleTask(id, null, null);
        redrawDay();
        showUndo(`🕒 « ${before?.title || 'Mission'} » retirée de l’horaire`, async () => { await scheduleTask(id, before?.date, before?.time, before?.dur); redrawDay(); }, 5000);
      };
      el.onpointerdown = (e) => {
        if (e.button > 0 || e.target.closest(".dvt-cb, .dvt-x")) return;
        const y0 = e.clientY, top0 = el.offsetTop, pid = e.pointerId;
        let moved = false;
        try { el.setPointerCapture(pid); } catch { /* ignore */ }
        el.onpointermove = (ev) => {
          if (ev.pointerId !== pid) return;
          if (!moved && Math.abs(ev.clientY - y0) < 5) return;
          moved = true;
          el.classList.add('moving');
          const snap = DAY_H / 4;
          el.style.top = `${Math.max(0, Math.round((top0 + ev.clientY - y0) / snap) * snap)}px`;
          el.querySelector('.ev-time').textContent = `${minToHM(gridFrom * 60 + (el.offsetTop / DAY_H) * 60).replace(':', ' h ')}`;
        };
        el.onpointerup = el.onpointercancel = async (ev) => {
          el.onpointermove = el.onpointerup = el.onpointercancel = null;
          if (!moved) { openTaskEditor(id, redrawDay); return; }
          await scheduleTask(id, k, minToHM(gridFrom * 60 + (el.offsetTop / DAY_H) * 60));
          redrawDay();
        };
      };
    });
    // Aujourd'hui : on fait défiler jusqu'à l'heure actuelle (une heure avant)
    if (isToday && !drawEvents.scrolled) { drawEvents.scrolled = true; $('.dayv-now')?.scrollIntoView({ block: 'center' }); }
  };

  // Clic sur une heure : y regrouper plusieurs missions (réparties dans l'heure, à la suite) ou ajouter un événement
  const hourMenu = async (h) => {
    const all = (await db.all('tasks')).filter((t) => !t.done);
    const dayList = all.filter((t) => t.date === k).sort((a, b) => !!a.time - !!b.time || (a.order ?? 1e15) - (b.order ?? 1e15));
    const others = all.filter((t) => t.date !== k && (!t.date || t.date < k)).sort((a, b) => (a.date || '9') < (b.date || '9') ? -1 : 1).slice(0, 40);
    const row = (t) => `<label class="hm-row"><input type="checkbox" value="${t.id}"><span>${esc(t.title)}</span><small class="muted">${t.time ? `🕒 ${esc(timeLabel(t))}` : t.date && t.date !== k ? `📅 ${esc(U.fmtShort(U.parseISO(t.date)))}` : !t.date ? 'sans date' : ''}</small></label>`;
    const H = `${h} h`;
    modal(`<h2>🕒 ${H} – ${h + 1} h</h2>
      <p class="muted" style="margin-top:0">Coche les missions à faire dans cette heure : elles sont placées à la suite et se partagent l’heure.</p>
      <div class="hm-list">${dayList.length ? `<p class="hm-grp">Missions de ce jour</p>${dayList.map(row).join('')}` : ''}
        ${others.length ? `<p class="hm-grp">Autres missions (sans date ou en retard)</p>${others.map(row).join('')}` : ''}
        ${!dayList.length && !others.length ? '<p class="empty-sm">Aucune mission à faire.</p>' : ''}</div>
      <div class="hm-dur"><label>Durée totale<select id="hm-total"><option value="30">30 min</option><option value="60" selected>1 h</option><option value="90">1 h 30</option><option value="120">2 h</option></select></label><span class="muted" id="hm-each"></span></div>
      <div class="modal-actions"><button type="button" class="btn" id="hm-ev">📅＋ Événement à ${H}</button><button type="button" class="btn primary" id="hm-ok" disabled>Placer à ${H}</button></div>`, (m, close) => {
      const picked = () => [...m.querySelectorAll('.hm-list input:checked')].map((x) => x.value);
      const each = () => { const n = picked().length; return n ? Math.max(5, Math.floor(+m.querySelector('#hm-total').value / n / 5) * 5) : 0; };
      const upd = () => {
        const n = picked().length;
        m.querySelector('#hm-ok').disabled = !n;
        m.querySelector('#hm-ok').textContent = n > 1 ? `Placer ${n} missions à ${H}` : `Placer à ${H}`;
        m.querySelector('#hm-each').textContent = n ? `${n} mission${n > 1 ? 's' : ''} · ${each()} min chacune` : '';
      };
      m.querySelectorAll('.hm-list input').forEach((x) => (x.onchange = upd));
      m.querySelector('#hm-total').onchange = upd;
      m.querySelector('#hm-ev').onclick = () => { close(); eventModal(k, drawEvents, { start: `${U.pad(h)}:00`, end: `${U.pad(Math.min(h + 1, 23))}:00` }); };
      m.querySelector('#hm-ok').onclick = async () => {
        const ids = picked(), dur = each();
        const before = await Promise.all(ids.map((id) => db.get('tasks', id)));
        for (const [i, id] of ids.entries()) { const mn = h * 60 + i * dur; await scheduleTask(id, k, `${U.pad(Math.floor(mn / 60))}:${U.pad(mn % 60)}`, dur); }
        close();
        redrawDay();
        showUndo(`🕒 ${ids.length} mission${ids.length > 1 ? 's' : ''} placée${ids.length > 1 ? 's' : ''} à ${H}`, async () => {
          for (const t of before) if (t) await db.put('tasks', t); // remet date, heure et durée d'avant
          redrawDay();
        }, 6000);
      };
      upd();
    });
  };

  // Glisser une mission (poignée ⋮⋮ de la liste) sur l'horaire : elle prend l'heure visée (par quart d'heure)
  const grid = $('#dv-grid');
  grid.dataset.dropDay = k;
  const timeAt = (y) => {
    const min = gridFrom * 60 + ((y - grid.getBoundingClientRect().top) / DAY_H) * 60;
    return Math.max(0, Math.min(23 * 60 + 45, Math.round(min / 15) * 15));
  };
  let ghost = null;
  grid.addEventListener('lp-drag-over', (e) => {
    const min = timeAt(e.detail.y);
    if (!ghost) { ghost = document.createElement('div'); ghost.className = 'dayv-drop'; grid.append(ghost); }
    ghost.style.top = `${((min / 60) - gridFrom) * DAY_H}px`;
    ghost.style.height = `${DAY_H - 2}px`;
    ghost.innerHTML = `<b>${esc(e.detail.title)}</b><span>${minToHM(min).replace(':', ' h ')}</span>`;
  });
  grid.addEventListener('lp-drag-leave', () => { ghost?.remove(); ghost = null; });
  grid.addEventListener('lp-drop', async (e) => {
    ghost?.remove(); ghost = null;
    const time = minToHM(timeAt(e.detail.y));
    const before = await db.get('tasks', e.detail.id);
    await scheduleTask(e.detail.id, k, time);
    redrawDay();
    showUndo(`🕒 « ${before?.title || 'Mission'} » placée à ${time.replace(':', ' h ')}`, async () => {
      await scheduleTask(e.detail.id, before?.date || k, before?.time || null, before?.dur);
      redrawDay();
    }, 5000);
  });

  $('#dv-add').onclick = () => eventModal(k, drawEvents);
  $('#dv-addt').onsubmit = async (e) => {
    e.preventDefault();
    const v = e.target.t.value.trim();
    if (!v) return;
    await addTask(v, k);
    e.target.t.value = '';
    drawTasks();
  };
  await drawTasks();
  drawEvents();
}

/* =========================================================
   Vue : Journal de bord
   ========================================================= */
async function renderJournal(date) {
  // Sans date (onglet Journal) : on reprend la dernière date ouverte dans le journal, sinon aujourd'hui
  try { date = date || localStorage.getItem('lp.journalDate'); } catch { /* ignore */ }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) date = iso(new Date());
  try { localStorage.setItem('lp.journalDate', date); } catch { /* ignore */ }
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
        <span class="pl-nav"><a class="btn icon" href="#/journal/${iso(U.addDays(d, -1))}" aria-label="Jour précédent">‹</a>
        <input type="date" id="pick" value="${date}" style="width:auto">
        <a class="btn icon" href="#/journal/${iso(U.addDays(d, 1))}" aria-label="Jour suivant">›</a></span>
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
        <label class="btn ink-extra" id="ink-doc" title="Joindre un document à cette page (PDF, Word, EPUB…)"><input type="file" accept="${docs.ACCEPT}" multiple hidden>📎</label>
        <button class="btn ink-extra" id="ink-assoc" type="button" title="Associer cette page à une mission, un objectif ou un projet">🧷 Associer</button>
        <div class="seg" id="colors"></div>
        <div class="seg ink-extra" id="sizes">${[6, 9, 13].map((s, i) => `<button data-size="${i}" class="${i === 1 ? 'on' : ''}" title="Épaisseur"><span class="dot" style="width:${s}px;height:${s}px"></span></button>`).join('')}</div>
        <div class="seg">
          <button id="undo" title="Annuler (Ctrl+Z)">${ICONS.undo}</button>
          <button id="redo" title="Rétablir (Ctrl+Y)">${ICONS.redo}</button>
        </div>
        <div class="seg"><button id="finger" title="Doigt : défiler (désactivé = le doigt dessine)" class="on">${ICONS.hand}</button><button id="ink-fs" type="button" title="Plein écran (Échap pour sortir)" aria-label="Plein écran" aria-pressed="false"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button></div>
        <span class="spacer"></span>
        <button class="btn ink-more-btn" id="ink-more" type="button" aria-label="Plus d’outils" aria-expanded="false" title="Plus d’outils">⋯</button>
        <select id="bg" class="ink-extra" aria-label="Fond de page">${BGS.map(([v, l]) => `<option value="${v}" ${meta.bg === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn ink-extra" id="more">+ Espace</button>
        <button class="btn ink-extra" id="png">Exporter</button>
        <button class="btn danger ink-extra" id="clear">Effacer</button>
        <span class="saved muted" id="saved"></span>
        <button class="btn icon ink-hide-bar" id="ink-bar-hide" type="button" title="Replier les outils (voir toute la page)" aria-label="Replier les outils">︽</button>
      </div>
      <button class="ink-bar-show" id="ink-bar-show" type="button" title="Afficher les outils" aria-label="Afficher les outils">︾ Outils</button>
      <div class="ink-docs" id="ink-rel" hidden></div>
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

  // Associations de la page : missions, objectifs, projets (bandeau au-dessus de la feuille)
  const drawRel = async () => {
    const el = $('#ink-rel');
    if (!el) return;
    const links = (await assoc.linksOf(meta)).filter((l) => l.kind !== 'rbq');
    el.hidden = !links.length;
    el.innerHTML = `<span class="muted">🧷 Associée à :</span>${links.map((l) => `<span class="assoc-chip"><a href="${l.href}" ${l.task ? `data-open-task="${l.task}"` : ''} ${l.kind === 'goals' ? `data-goal="${esc(l.id)}"` : ''}>${esc(l.label)}</a><button data-unassoc="${l.kind}|${l.id}" aria-label="Retirer l’association">×</button></span>`).join('')}`;
    $$('[data-unassoc]', el).forEach((b) => (b.onclick = async () => {
      const [k, tid] = b.dataset.unassoc.split('|');
      await assoc.toggle(meta, k, tid, false, assoc.savePage);
      drawRel();
    }));
    $$('[data-open-task]', el).forEach((a) => (a.onclick = (e) => { e.preventDefault(); openTaskEditor(a.dataset.openTask, drawRel); }));
    $$('[data-goal]', el).forEach((a) => (a.onclick = () => openGoals.add(a.dataset.goal))); // l'objectif s'ouvre déplié
  };
  $('#ink-assoc').onclick = () => {
    meta.title = $('#title').value.trim() || meta.title;
    assoc.picker(modal, meta, drawRel, { kinds: assoc.PAGE_KINDS, save: assoc.savePage });
  };
  drawRel();
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
  // Menu du clic droit : souris (clic droit), stylet (bouton latéral touché sans effacer) ou doigt (appui long)
  ed.page.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if ((e.pointerType || ed.lastPointer) === 'mouse') openCtx(e);
  });
  ed.page.addEventListener('ink-menu', (e) => openCtx(e.detail));
  function openCtx(e) {
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
  }

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
  // Cellulaire : les outils moins utilisés sont derrière « ⋯ »
  // ︽ Replier les outils : la feuille prend toute la hauteur ; « ︾ Outils » les ramène (choix gardé sur cet appareil)
  {
    const shell = $('.ink-shell');
    const setBar = (hidden) => {
      shell.classList.toggle('bar-hidden', hidden);
      try { localStorage.setItem('lp.inkBarHidden', hidden ? '1' : ''); } catch { /* ignore */ }
    };
    setBar((() => { try { return !!localStorage.getItem('lp.inkBarHidden'); } catch { return false; } })());
    $('#ink-bar-hide').onclick = () => setBar(true);
    $('#ink-bar-show').onclick = () => setBar(false);
  }
  // ⛶ Plein écran : la feuille et ses outils occupent tout l'écran (vrai plein écran si possible, sinon la page couvre l'app)
  {
    const shell = $('.ink-shell'), fsBtn = $('#ink-fs');
    const ICON_IN = '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
    const ICON_OUT = '<svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
    const isOn = () => document.fullscreenElement === shell || shell.classList.contains('ink-full');
    const sync = () => {
      if (!shell.isConnected) return;
      const on = isOn();
      fsBtn.innerHTML = on ? ICON_OUT : ICON_IN;
      fsBtn.classList.toggle('on', on);
      fsBtn.setAttribute('aria-pressed', String(on));
      fsBtn.title = on ? 'Quitter le plein écran (Échap)' : 'Plein écran (Échap pour sortir)';
      document.body.classList.toggle('ink-fullscreen', on);
    };
    const exit = async () => {
      shell.classList.remove('ink-full');
      if (document.fullscreenElement === shell) await document.exitFullscreen().catch(() => {});
      sync();
    };
    fsBtn.onclick = async () => {
      if (isOn()) return exit();
      try {
        if (!shell.requestFullscreen) throw new Error('indisponible');
        // Certains navigateurs (ou une app intégrée) ne répondent jamais : après 1 s, on passe au plan B
        await Promise.race([shell.requestFullscreen({ navigationUI: 'hide' }), new Promise((_, no) => setTimeout(() => no(new Error('délai')), 1000))]);
      } catch { if (document.fullscreenElement !== shell) shell.classList.add('ink-full'); } // plan B : la page couvre toute l'app
      sync();
    };
    const onFs = () => { if (!shell.isConnected) { document.removeEventListener('fullscreenchange', onFs); return; } sync(); };
    document.addEventListener('fullscreenchange', onFs);
    const onKey = (e) => { if (!shell.isConnected) { removeEventListener('keydown', onKey); return; } if (e.key === 'Escape' && shell.classList.contains('ink-full')) exit(); };
    addEventListener('keydown', onKey);
    // En quittant la page : on sort du plein écran
    const onLeave = () => { removeEventListener('hashchange', onLeave); if (document.fullscreenElement === shell) document.exitFullscreen().catch(() => {}); document.body.classList.remove('ink-fullscreen'); };
    addEventListener('hashchange', onLeave);
  }
  $('#ink-more').onclick = (e) => { const bar = $('.ink-bar'); bar.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', bar.classList.contains('open')); };
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
const isGoalDone = (g) => !!g.done || (g.progress || 0) >= 100; // conclu à la main, ou atteint à 100 %
const isGoalDropped = (g) => !!g.done && g.outcome === 'dropped'; // conclu sans être atteint (abandonné)
// Rang dans une liste : en cours, puis atteints (en vert), puis abandonnés (en gris)
const goalRank = (g) => (isGoalDropped(g) ? 2 : isGoalDone(g) ? 1 : 0);
const goalSort = (a, b) => goalRank(a) - goalRank(b) || (goalRank(a) ? (b.doneAt || 0) - (a.doneAt || 0) : 0) || (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0);
const goalClass = (g) => (isGoalDropped(g) ? 'is-done is-dropped' : isGoalDone(g) ? 'is-done' : '');
const goalMark = (g) => (isGoalDropped(g) ? '⛔ ' : isGoalDone(g) ? '✅ ' : '');
const goalVerdict = (g) => (g.done && (g.verdict || g.doneAt) ? `<p class="g-verdict">${isGoalDropped(g) ? '⛔ Abandonné' : '🏁 Atteint'}${g.doneAt ? ` le ${esc(U.fmtShort(new Date(g.doneAt)))}` : ''}${g.verdict ? ` · ${esc(g.verdict)}` : ''}</p>` : '');

/** ✓ Conclure un objectif (atteint ou abandonné, avec un bilan), ou ↺ le rouvrir s'il est déjà conclu. */
async function concludeGoal(id, after) {
  const g = await db.get('goals', id);
  if (!g) return;
  if (g.done) {
    Object.assign(g, { done: false, doneAt: null, outcome: null, verdict: '' });
    await db.put('goals', g);
    await game.syncGoal(g);
    toast(`↺ « ${g.title} » est rouvert`);
    return after(g);
  }
  modal(`<h2>Conclure l’objectif</h2>
    <p class="muted">« ${esc(g.title)} » · ${g.progress || 0} %</p>
    <div class="conclude-opts" role="radiogroup" aria-label="Résultat">
      <label class="conclude-opt ok"><input type="radio" name="out" value="reached" checked><b>🏁 Atteint</b><small>Il passe en vert, au bas de sa liste (+ XP)</small></label>
      <label class="conclude-opt drop"><input type="radio" name="out" value="dropped"><b>⛔ Abandonné</b><small>Il passe en gris, sous les objectifs atteints</small></label>
    </div>
    <label class="conclude-note">Bilan (facultatif)<textarea id="cg-note" rows="3" maxlength="300" placeholder="Ce que j’ai appris, pourquoi je l’arrête…"></textarea></label>
    <div class="modal-actions"><button class="btn" data-close>Annuler</button><button class="btn primary" id="cg-ok">Conclure</button></div>`, (m, close) => {
    $('#cg-ok', m).onclick = async () => {
      const outcome = $('input[name=out]:checked', m).value;
      Object.assign(g, { done: true, doneAt: Date.now(), outcome, verdict: $('#cg-note', m).value.trim() });
      await db.put('goals', g);
      await game.syncGoal(g);
      close();
      toast(outcome === 'dropped' ? `⛔ Objectif abandonné : « ${g.title} »` : `🏁 Objectif atteint : « ${g.title} »`);
      after(g);
    };
  });
}
/* =========================================================
   Vue : Projets (onglet de Missions) — les notes 🚀 Projet du Cerveau ; un projet épinglé est en focus
   ========================================================= */
/* Cartes en focus (objectif, projet épinglé) : « Afficher toutes les missions » ou seulement les 4 prochaines.
   Choix gardé sur cet appareil, carte par carte. */
const FOCUS_ALL_KEY = 'lp.focusAll';
const focusAll = () => { try { return new Set(JSON.parse(localStorage.getItem(FOCUS_ALL_KEY)) || []); } catch { return new Set(); } };
function toggleFocusAll(id) {
  const s = focusAll();
  s.has(id) ? s.delete(id) : s.add(id);
  try { localStorage.setItem(FOCUS_ALL_KEY, JSON.stringify([...s].slice(-50))); } catch { /* ignore */ }
}
const focusAllBtn = (id, all, n, needed) => (needed || all
  ? `<button type="button" class="gf-all" data-fall="${esc(id)}" aria-expanded="${all}">${all ? '▴ Afficher seulement les prochaines' : `▾ Afficher toutes les missions (${n})`}</button>` : '');
// Un seul gestionnaire pour toutes les pages (Objectifs, Projets) : on redessine la page ouverte
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-fall]');
  if (!b) return;
  toggleFocusAll(b.dataset.fall);
  router();
});

/** Missions d'un projet (directes ou par ses objectifs), à faire d'abord, par date. */
function projectMissions(pid, goals, tasks) {
  const gids = new Set(goals.filter((g) => g.projectId === pid).map((g) => g.id));
  return tasks.filter((t) => t.projectId === pid || (t.goalId && gids.has(t.goalId)))
    .sort((a, b) => a.done - b.done || prioRank(b) - prioRank(a) || (a.date || '9999').localeCompare(b.date || '9999') || (a.order ?? 1e15) - (b.order ?? 1e15) || a.createdAt - b.createdAt);
}

async function setProjectPin(id, on) {
  const n = await db.get('notes', id);
  if (!n) return;
  n.pinned = on;
  await brain.saveNote(n, { touch: false });
  toast(on ? `📌 Focus : « ${n.title || 'projet'} »` : 'Projet désépinglé');
}

async function renderProjects() {
  const goals = await loadGoals();
  const tasks = await db.all('tasks');
  const today = iso(new Date());
  const all = brain.projectsOf(await brain.allNotes(), { withArchived: true });
  const active = all.filter((p) => !p.archived).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const pinned = active.filter((p) => p.pinned);
  const others = active.filter((p) => !p.pinned);
  const archived = all.filter((p) => p.archived);

  const ring = (pct, cls = '') => `<span class="gc-ring ${cls}" style="--p:${pct}%"><span>${pct}%</span></span>`;
  // Projet épinglé : grande carte en haut, avec ses prochaines missions et l'ajout rapide
  const focusCard = (p) => {
    const st = brain.projectStats(p.id, goals, tasks);
    const ms = projectMissions(p.id, goals, tasks);
    const all = focusAll().has(p.id);
    const openMs = ms.filter((t) => !t.done), doneMs = ms.filter((t) => t.done);
    const next = all ? [...openMs, ...doneMs] : openMs.slice(0, 4);
    const meta = [st.goals.length ? `${st.goals.length} objectif${st.goals.length > 1 ? 's' : ''}` : '', st.missions ? `${st.done}/${st.missions} missions` : 'aucune mission'].filter(Boolean).join(' · ');
    return `<section class="card gfocus pj-focus" data-pid="${p.id}">
      <div class="gf-head">
        <div class="gc-ring big" style="--p:${st.pct}%"><span>${st.pct}%</span></div>
        <div class="gf-txt"><p class="eyebrow">📌 Projet en focus</p><h2><a href="#/note/${p.id}">${esc(p.title || 'Projet sans titre')}</a></h2><p class="muted">${esc(meta)}</p></div>
        <button type="button" class="btn pj-unpin" title="Retirer le focus">☆ Désépingler</button>
      </div>
      ${next.length ? `<p class="gf-label">${all ? 'Toutes les missions' : 'Prochaines missions'}</p><ul class="tasks pj-tasks">${next.map((t) => taskHTML(t, today, { showDate: true, hideProject: true })).join('')}</ul>`
        : `<p class="empty-sm">${st.missions ? 'Toutes les missions sont faites : ajoute la suite.' : 'Découpe ce projet en missions : la première étape commence ici.'}</p>`}
      ${focusAllBtn(p.id, all, ms.length, openMs.length > 4 || doneMs.length > 0)}
      <form class="add-mission pj-add"><input name="t" placeholder="Prochaine mission pour ce projet…" autocomplete="off"><input name="d" type="date" value="${today}" aria-label="Date prévue (facultatif)"><button class="btn icon" aria-label="Ajouter la mission">+</button></form>
    </section>`;
  };
  const card = (p) => {
    const st = brain.projectStats(p.id, goals, tasks);
    const ms = projectMissions(p.id, goals, tasks);
    const late = ms.filter((t) => !t.done && t.date && t.date < today).length;
    const next = ms.find((t) => !t.done);
    return `<article class="card pj-card ${p.archived ? 'archived' : ''}">
      <a class="pj-main" href="#/note/${p.id}">
        ${ring(st.pct)}
        <span class="pj-txt"><b>${p.archived ? '🗄' : '🚀'} ${esc(p.title || 'Projet sans titre')}</b>
          <small class="muted">${st.missions ? `${st.done}/${st.missions} missions` : 'aucune mission'}${st.goals.length ? ` · ${st.goals.length} objectif${st.goals.length > 1 ? 's' : ''}` : ''}${late ? ` · <span class="gc-late">⚠ ${late} en retard</span>` : ''}</small>
          ${next ? `<small class="pj-next">Prochaine : ${esc(next.title)}</small>` : ''}</span>
      </a>
      ${p.archived ? '' : `<button type="button" class="btn icon pj-pin" data-pin="${p.id}" title="Épingler : mettre ce projet en focus" aria-label="Épingler « ${esc(p.title || 'projet')} »">📌</button>`}
    </article>`;
  };

  view.innerHTML = `
    <header class="page-head"><div><p class="eyebrow">Gestion</p><h1>Projets</h1></div></header>
    <form class="card ms-add" id="add-proj">
      <input name="title" placeholder="Nouveau projet…" autocomplete="off" required style="flex:3 1 240px">
      <button class="btn primary">Créer le projet</button>
    </form>
    ${pinned.map(focusCard).join('')}
    ${others.length ? `<div class="pj-grid">${others.map(card).join('')}</div>`
      : active.length ? '' : '<div class="card empty-card"><p>Aucun projet pour l’instant : crée le premier ci-dessus. Un projet regroupe des objectifs et des missions.</p></div>'}
    ${archived.length ? `<details class="goal-old pj-old"><summary>🗄 Projets archivés <small class="muted">${archived.length}</small></summary><div class="pj-grid">${archived.map(card).join('')}</div></details>` : ''}
    <p class="hint muted">📌 Épingle un projet pour le mettre en focus : il passe en haut avec ses prochaines missions et apparaît dans Aujourd’hui. Touche un projet pour ouvrir sa page (objectifs, missions, notes).</p>`;

  $('#add-proj').onsubmit = async (e) => {
    e.preventDefault();
    const title = e.target.title.value.trim();
    if (!title) return;
    await brain.createNote({ title, body: '', type: 'projet' });
    toast(`🚀 Projet créé : « ${title} »`);
    renderProjects();
  };
  $$('[data-pin]').forEach((b) => (b.onclick = async () => { await setProjectPin(b.dataset.pin, true); await renderProjects(); view.scrollTo?.({ top: 0, behavior: 'smooth' }); }));
  $$('.pj-focus').forEach((sec) => {
    const pid = sec.dataset.pid;
    sec.querySelector('.pj-unpin').onclick = async () => { await setProjectPin(pid, false); renderProjects(); };
    const list = sec.querySelector('.pj-tasks');
    if (list) bindTaskList(list, renderProjects);
    sec.querySelector('.pj-add').onsubmit = async (e) => {
      e.preventDefault();
      const v = e.target.t.value.trim();
      if (!v) return;
      await addTask(v, e.target.d.value || null, null, pid);
      await renderProjects();
      $(`.pj-focus[data-pid="${pid}"] .pj-add input`)?.focus();
    };
  });
}

let goalsView = 'hz'; // page Objectifs : 'hz' (par échéance) ou 'proj' (par projet)

async function renderGoals() {
  const goals = await loadGoals();
  const tasks = await db.all('tasks');
  const today = iso(new Date());
  const sortM = (a, b) => a.done - b.done || prioRank(b) - prioRank(a) || (a.date || '9999').localeCompare(b.date || '9999') || (a.order ?? 1e15) - (b.order ?? 1e15) || a.createdAt - b.createdAt;
  const free = tasks.filter((t) => !t.goalId && !t.done).sort(sortM);
  const everyNote = await brain.allNotes();
  const relNotes = everyNote.filter((x) => !x.archived && (x.rel?.goals || []).length); // notes associées à des objectifs
  const relPages = (await db.all('pages')).filter((p) => (p.rel?.goals || []).length); // pages manuscrites associées
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
    const done = isGoalDone(g), dropped = isGoalDropped(g);
    const late = ms.filter((t) => !t.done && t.date && t.date < today).length;
    const p = done && !dropped ? 100 : g.progress || 0;
    const focus = g.focus && !done;
    const sub = ms.length ? `${md}/${ms.length} mission${ms.length > 1 ? 's' : ''}${late ? ` · <span class="gc-late">⚠ ${late} en retard</span>` : ''}`
      : done ? 'Détails' : 'Aucune mission — en ajouter';
    const chips = [
      proj && !inProjectGroup ? `<a class="chip proj-chip" href="#/note/${proj.id}" title="Projet du Cerveau${proj.archived ? ' (archivé)' : ''}">${proj.archived ? '🗄' : '🚀'} ${esc(proj.title || 'Projet')}</a>` : '',
      g.projectId && g.horizon && inProjectGroup ? `<span class="chip hz-chip">📅 ${esc(HZ_LABEL[g.horizon])}</span>` : '',
    ].join('');
    // Carte d'objectif : anneau de progression (déplie), titre, une ligne de résumé ; les actions sont dans le menu ⋯
    return `<article class="gcard ${open ? 'open' : ''} ${goalClass(g)} ${focus ? 'is-focus' : ''}" data-id="${g.id}" ${done ? "" : `data-drop-goal="${g.id}"`}>
      <div class="gc-row">
        <button type="button" class="gc-ring goal-toggle" style="--p:${p}%" aria-expanded="${open}" aria-label="${open ? 'Replier' : 'Déplier'} « ${esc(g.title)} » (${p} %)"><span>${dropped ? '⛔' : done ? '✓' : p + '%'}</span></button>
        <div class="gc-body">
          <div class="gc-title"><span class="g-name" tabindex="0" role="button" title="Clique pour renommer" aria-label="Renommer « ${esc(g.title)} »">${esc(g.title)}</span>${focus ? '<span class="gc-badge">⭐ Focus</span>' : ''}</div>
          <button type="button" class="gc-sub goal-toggle" aria-expanded="${open}">${sub}<span class="exp" aria-hidden="true">›</span></button>
          ${chips ? `<div class="gc-chips">${chips}</div>` : ''}
          ${goalVerdict(g)}
        </div>
        <div class="gc-more">
          <button type="button" class="gc-menu-btn" aria-haspopup="true" aria-expanded="false" aria-label="Options de « ${esc(g.title)} »" title="Options">⋯</button>
          <div class="gc-menu" role="menu" hidden>
            ${done ? '' : `<button type="button" role="menuitem" data-act="focus">${g.focus ? '☆ Retirer le focus' : '⭐ Mettre en focus'}</button>`}
            <button type="button" role="menuitem" class="g-done">${g.done ? '↺ Rouvrir l’objectif' : '✓ Conclure l’objectif'}</button>
            <button type="button" role="menuitem" data-act="rename">✎ Renommer</button>
            <button type="button" role="menuitem" class="g-mv" data-swap="${prev || ''}" ${prev ? '' : 'disabled'}>↑ Monter</button>
            <button type="button" role="menuitem" class="g-mv" data-swap="${next || ''}" data-dir="down" ${next ? '' : 'disabled'}>↓ Descendre</button>
            <button type="button" role="menuitem" class="g-del gc-danger">🗑 Supprimer</button>
          </div>
        </div>
      </div>
      ${open ? `<div class="goal-missions">
        ${!ms.length && !done ? `<label class="gc-manual"><span>Progression manuelle</span><input type="range" min="0" max="100" step="5" value="${g.progress}" style="--v:${g.progress}%" aria-label="Progression de l’objectif"></label>` : ''}
        <div class="goal-settings">
          <label class="goal-proj" title="Échéance">📅 <select class="g-hz" aria-label="Échéance">${hzOptions(g.horizon || '')}</select></label>
          <label class="goal-proj" title="Projet">🚀 <select class="g-proj" aria-label="Projet du Cerveau">${projOptions(g.projectId)}</select></label>
        </div>
        ${allProjects.length ? '' : '<p class="empty-sm" style="padding:0">Pour regrouper des objectifs, crée une note de type 🚀 Projet dans le Cerveau.</p>'}
        ${(() => { const ln = relNotes.filter((x) => (x.rel?.goals || []).includes(g.id)), lp = relPages.filter((p) => p.rel.goals.includes(g.id)); return ln.length || lp.length ? `<div class="assoc-list"><span class="muted">🧠 Notes :</span>${assoc.noteChips(ln)}${assoc.pageChips(lp)}</div>` : ''; })()}
        ${ms.length ? `<ul class="tasks">${ms.map((t) => taskHTML(t, today, { hideGoal: true, showDate: true })).join('')}</ul>`
          : '<p class="empty-sm">Découpe cet objectif en missions : sa progression avancera toute seule à chaque mission accomplie.</p>'}
        <button type="button" class="btn sm-text g-addm">+ Mission</button>
        <form class="add-mission" hidden>
          <input name="t" placeholder="Nouvelle mission…" autocomplete="off">
          <input name="d" type="date" value="${today}" aria-label="Date prévue (facultatif)" title="Date prévue (laisse vide pour « sans date »)">
          <button class="btn icon" aria-label="Ajouter la mission">+</button>${QUICK_DATES}
        </form>
        ${free.length ? `<select class="link-mission" aria-label="Lier une mission existante"><option value="">🔗 Lier une mission existante…</option>
          ${free.map((t) => `<option value="${t.id}">${esc(t.title)}${t.date ? ' · ' + U.fmtShort(U.parseISO(t.date)) : ''}</option>`).join('')}</select>` : ''}
      </div>` : ''}
    </article>`;
  };

  // Objectif en focus : grande carte en haut de la page avec ses prochaines missions
  const fg = goals.find((g) => g.focus && !isGoalDone(g));
  const focusHTML = (() => {
    if (!fg) return '';
    const ms = tasks.filter((t) => t.goalId === fg.id);
    const all = focusAll().has(fg.id);
    const openMs = ms.filter((t) => !t.done).sort(sortM), doneMs = ms.filter((t) => t.done).sort(sortM);
    const nextMs = all ? [...openMs, ...doneMs] : openMs.slice(0, 4);
    const proj = fg.projectId && allProjects.find((p) => p.id === fg.projectId);
    const meta = [ms.length ? `${ms.filter((t) => t.done).length}/${ms.length} missions` : 'aucune mission', fg.horizon ? HZ_LABEL[fg.horizon] : '', proj ? '🚀 ' + (proj.title || 'Projet') : ''].filter(Boolean);
    return `<section class="card gfocus" data-id="${fg.id}">
      <div class="gf-head">
        <div class="gc-ring big" style="--p:${fg.progress || 0}%"><span>${fg.progress || 0}%</span></div>
        <div class="gf-txt"><p class="eyebrow">⭐ Objectif en focus</p><h2>${esc(fg.title)}</h2><p class="muted">${esc(meta.join(' · '))}</p></div>
        <button type="button" class="btn gf-off" title="Retirer le focus">☆ Retirer</button>
      </div>
      ${nextMs.length ? `<p class="gf-label">${all ? 'Toutes les missions' : 'Prochaines missions'}</p><ul class="tasks" id="gf-tasks">${nextMs.map((t) => taskHTML(t, today, { hideGoal: true, showDate: true })).join('')}</ul>`
        : `<p class="empty-sm">${ms.length ? 'Toutes les missions sont faites : conclus l’objectif ou ajoute la suite.' : 'Découpe cet objectif en missions : la première étape commence ici.'}</p>`}
      ${focusAllBtn(fg.id, all, ms.length, openMs.length > 4 || doneMs.length > 0)}
      <form class="add-mission gf-add"><input name="t" placeholder="Prochaine mission pour cet objectif…" autocomplete="off"><input name="d" type="date" value="${today}" aria-label="Date prévue (facultatif)"><button class="btn icon" aria-label="Ajouter la mission">+</button></form>
    </section>`;
  })();

  // Chiffres clés
  const active = goals.filter((g) => !isGoalDone(g));
  const reached = goals.filter((g) => isGoalDone(g) && !isGoalDropped(g));
  const dropped = goals.filter(isGoalDropped);
  const linked = tasks.filter((t) => t.goalId && goals.some((g) => g.id === t.goalId));
  const avg = active.length ? Math.round(active.reduce((n, g) => n + (g.progress || 0), 0) / active.length) : 0;
  // En cours (ordre choisi avec ↑ ↓), puis atteints en vert, puis abandonnés en gris (les plus récents d'abord)
  const byOrder = goalSort;
  const column = (title, list, extra = '') => {
    const open = list.filter((g) => !isGoalDone(g));
    const ok = list.filter((g) => isGoalDone(g) && !isGoalDropped(g)).length;
    const counted = list.length - list.filter(isGoalDropped).length; // les abandonnés ne comptent pas
    const cAvg = open.length ? Math.round(open.reduce((n, g) => n + g.progress, 0) / open.length) : (counted ? 100 : 0);
    return `<section class="card goal-col">
      <div class="card-head"><h2>${title}</h2><span class="muted">${counted ? `${ok}/${counted} atteint${ok > 1 ? 's' : ''}` : ''}</span></div>
      ${extra}${list.length ? `<div class="bar goal-col-bar" title="Progression moyenne"><i style="width:${cAvg}%"></i></div>` : ''}
      ${(() => {
        // Les objectifs conclus depuis plus de 7 jours se rangent dans une section repliée au bas de la colonne
        const old = (g) => isGoalDone(g) && Date.now() - (g.doneAt || g.updatedAt || g.createdAt || 0) > 7 * 864e5;
        const s = [...list].sort(byOrder);
        const cur = s.filter((g) => !old(g)), past = s.filter(old);
        const html = cur.map((g, i) => goalHTML(g, !!extra, cur[i - 1]?.id, cur[i + 1]?.id)).join('');
        const pastHtml = past.length ? `<details class="goal-old" ${past.some((g) => openGoals.has(g.id)) ? 'open' : ''}><summary>🏁 Atteints et conclus <small class="muted">${past.length}</small></summary>
          ${past.map((g, i) => goalHTML(g, !!extra, past[i - 1]?.id, past[i + 1]?.id)).join('')}</details>` : '';
        return html + pastHtml;
      })() || '<p class="empty-sm">Aucun objectif.</p>'}</section>`;
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
      <div class="kpi ok"><b>${reached.length}</b><span>objectif${reached.length > 1 ? 's' : ''} atteint${reached.length > 1 ? 's' : ''} 🏁${dropped.length ? ` · ${dropped.length} abandonné${dropped.length > 1 ? 's' : ''}` : ''}</span></div>
      <a class="kpi" href="#/missions"><b>${linked.filter((t) => t.done).length}/${linked.length}</b><span>missions liées accomplies</span></a>
    </div>
    <form class="card ms-add" id="add-goal">
      <input name="title" placeholder="Nouvel objectif…" autocomplete="off" required style="flex:3 1 240px">
      <select name="horizon" aria-label="Échéance">${hzOptions('mois')}</select>
      ${projects.length ? `<select name="project" aria-label="Projet">${projOptions('')}</select>` : ''}
      <button class="btn primary">Ajouter</button>
    </form>
    ${focusHTML}
    ${goalsView === 'hz'
      ? (() => {
        // Seulement les échéances qui ont des objectifs (les colonnes vides encombraient la page)
        const cols = [...HORIZONS, ['', 'Sans échéance']].map(([v, l]) => [l, dated.filter((g) => (g.horizon || '') === v)]).filter(([, list]) => list.length);
        return cols.length ? `<div class="goal-groups">${cols.map(([l, list]) => column(l, list)).join('')}</div>`
          : '<div class="card empty-card"><p>Aucun objectif pour l’instant : écris le premier ci-dessus.</p></div>';
      })()
      : projGroups.length
        ? `<div class="goal-groups">${projGroups.map(({ p, list }) => {
          const st = brain.projectStats(p.id, goals, tasks);
          return column(`<a href="#/note/${p.id}">${p.archived ? '🗄' : '🚀'} ${esc(p.title || 'Projet')}</a>`, list,
            `<p class="muted goal-proj-meta">${st.pct} % · ${st.missions ? `${st.done}/${st.missions} missions` : 'aucune mission'}</p>`);
        }).join('')}</div>`
        : '<div class="card empty-card"><p>Aucun objectif rattaché à un projet. Crée une note 🚀 Projet dans le Cerveau, puis choisis-la quand tu déplies un objectif.</p></div>'}
    <p class="hint muted">Touche l’anneau ou la ligne des missions pour déplier un objectif (missions, échéance, projet). Le menu ⋯ permet de le mettre en focus, le conclure, le renommer ou le déplacer.</p>`;
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
    $(`.gcard[data-id="${id}"] .g-addm`)?.click(); // nouvel objectif : la boîte « mission » s'ouvre tout de suite
  };

  // Objectif en focus : missions, ajout rapide, retirer le focus
  const gf = $('.gfocus');
  if (gf) {
    const gid = gf.dataset.id;
    if ($('#gf-tasks')) bindTaskList($('#gf-tasks'), renderGoals);
    $('.gf-off', gf).onclick = () => setGoalFocus(gid, false);
    $('.gf-add', gf).onsubmit = async (e) => {
      e.preventDefault();
      const v = e.target.t.value.trim();
      if (!v) return;
      await addTask(v, e.target.d.value || null, gid);
      await renderGoals();
      $('.gf-add input')?.focus();
    };
  }
  async function setGoalFocus(id, on) {
    // Un seul objectif en focus à la fois
    for (const g of await db.all('goals')) {
      const want = on && g.id === id;
      if (!!g.focus !== want) { g.focus = want; await db.put('goals', g); }
    }
    const g = goals.find((x) => x.id === id);
    toast(on ? `⭐ Focus : « ${g?.title || 'objectif'} »` : 'Focus retiré');
    renderGoals();
    if (on) view.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  // Menu ⋯ : un seul ouvert à la fois ; clic ailleurs ou Échap pour fermer
  const closeGcMenus = (keep) => $$('.gc-menu').forEach((m) => { if (m !== keep) { m.hidden = true; m.previousElementSibling.setAttribute('aria-expanded', 'false'); m.closest('.gcard')?.classList.remove('menu-open'); } });
  if (!view.dataset.gcMenuBound) {
    view.dataset.gcMenuBound = '1';
    document.addEventListener('click', (e) => { if (!e.target.closest('.gc-more')) closeGcMenus(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeGcMenus(); });
  }

  $$('.gcard').forEach((el) => {
    const id = el.dataset.id;
    const range = el.querySelector('input[type=range]');
    if (range) {
      const ring = el.querySelector('.gc-ring');
      range.oninput = () => { ring.style.setProperty('--p', range.value + '%'); ring.querySelector('span').textContent = range.value + '%'; range.style.setProperty('--v', range.value + '%'); };
      range.onchange = async () => {
        const g = await db.get('goals', id);
        g.progress = Number(range.value);
        await db.put('goals', g);
        await game.syncGoal(g);
        if (g.progress >= 100) renderGoals();
      };
    }
    el.querySelectorAll('.goal-toggle').forEach((b) => (b.onclick = () => { openGoals.has(id) ? openGoals.delete(id) : openGoals.add(id); renderGoals(); }));
    const menuBtn = el.querySelector('.gc-menu-btn'), menu = el.querySelector('.gc-menu');
    menuBtn.onclick = () => {
      closeGcMenus(menu);
      menu.hidden = !menu.hidden;
      menuBtn.setAttribute('aria-expanded', String(!menu.hidden));
      el.classList.toggle('menu-open', !menu.hidden);
    };
    menu.querySelector('[data-act="focus"]')?.addEventListener('click', () => setGoalFocus(id, !goals.find((x) => x.id === id)?.focus));
    menu.querySelector('[data-act="rename"]').onclick = () => { closeGcMenus(); startRename(); };
    // Renommer : clic sur le nom -> champ de texte (Entrée ou clic ailleurs = enregistrer, Échap = annuler)
    const nameEl = el.querySelector('.g-name');
    const startRename = () => {
      const old = nameEl.textContent;
      const inp = document.createElement('input');
      inp.className = 'g-rename';
      inp.value = old;
      inp.setAttribute('aria-label', 'Nouveau nom de l’objectif');
      nameEl.replaceWith(inp);
      inp.focus();
      inp.select();
      let finished = false;
      const finish = async (save) => {
        if (finished) return;
        finished = true;
        const v = inp.value.trim();
        if (save && v && v !== old) {
          const g = await db.get('goals', id);
          g.title = v;
          await db.put('goals', g);
          toast(`✎ Objectif renommé : « ${v} »`);
        }
        renderGoals();
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') finish(false); };
      inp.onblur = () => finish(true);
    };
    nameEl.onclick = startRename;
    nameEl.onkeydown = (e) => { if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startRename(); } };
    // ✓ Conclure (atteint ou abandonné) ou ↺ Rouvrir : l'objectif se range au bas de sa colonne
    el.querySelector('.g-done').onclick = () => concludeGoal(id, (g) => { if (g.done) openGoals.delete(id); renderGoals(); });
    // ↑ ↓ : échange la place avec l'objectif voisin de la même colonne
    el.querySelectorAll('.g-mv').forEach((b) => (b.onclick = async () => {
      const other = b.dataset.swap;
      if (!other) return;
      const [a, c] = await Promise.all([db.get('goals', id), db.get('goals', other)]);
      let oa = a.order ?? a.createdAt ?? 0, oc = c.order ?? c.createdAt ?? 0;
      if (oa === oc) oc += b.dataset.dir === 'down' ? 1 : -1;
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
    bindGoalDrops(view, renderGoals); // glisser une mission (⋮⋮) sur un objectif : elle s'y rattache
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
      const box2 = $(`.gcard[data-id="${id}"] .goal-missions`);
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
  const cSecret = await db.get('settings', 'clientSecret');
  const aKey = await db.get('settings', 'anthropicKey');
  const aModel = (await db.get('settings', 'assistantModel')) || assistant.DEFAULT_MODEL;
  if (couple.ON) await couple.people();
  view.innerHTML = `
    <header class="page-head"><div><p class="eyebrow">Configuration</p><h1>Réglages</h1></div></header>
    <div class="settings">
      <section class="card">
        <div class="card-head"><h2>Apparence</h2></div>
        <select id="theme" style="width:auto">
          <option value="">Selon Windows</option><option value="light">Clair</option><option value="dark">Sombre</option><option value="noel">🎄 Noël</option>
        </select>
        <label class="check noel-snow-opt" ${(localStorage.getItem('lp.theme') || '') === 'noel' ? '' : 'hidden'}><input type="checkbox" id="noel-snow-cb" ${noel.snowOn() ? 'checked' : ''}> ❄ Neige qui tombe</label>
      </section>

      ${couple.ON ? `<section class="card" id="cp-card"><div class="card-head"><h2>👫 Vous deux</h2><button class="btn" id="cp-edit" type="button">Modifier</button></div>
        <p class="muted" style="margin:0">${esc(couple.nameOf('a'))} et ${esc(couple.nameOf('b'))} · sur cet appareil : <b>${couple.me() ? esc(couple.nameOf(couple.me())) : 'à choisir'}</b>. Les deux utilisez le même compte Google : connectez-vous avec lui dans Synchronisation et Google Agenda.</p></section>` : ''}
      <section class="card">
        <div class="card-head"><h2>Google Agenda</h2>${connected ? `<span class="sync live">${gcal.staysConnected() ? 'Connecté · reste connecté' : 'Connecté'}</span>` : ''}</div>
        ${cSecret && gcal.codeError() ? `<p class="warn-text" style="margin-top:0">⚠ Connexion durable impossible : ${esc(gcal.codeError())}. L’app utilise la connexion simple en attendant ; corrige le code secret puis « Enregistrer » pour réessayer.</p>`
          : connected && cSecret && !gcal.staysConnected() ? '<p class="warn-text" style="margin-top:0">Pour ne plus avoir à te reconnecter : clique « Déconnecter », puis reconnecte-toi une fois.</p>' : ''}
        <details class="cfg-fold" ${clientId && connected ? '' : 'open'}><summary>${clientId && connected ? '✓ Configuré · identifiant Google et code secret' : 'Configuration'}</summary>
        <p class="muted" style="margin-top:0">Une seule fois : crée ton propre identifiant Google (gratuit, ~5 minutes).</p>
        <ol class="steps">
          <li>Va sur <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">console.cloud.google.com</a> et crée un projet (ex. « Life Planner »).</li>
          <li>Active les API : <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noopener">Google Calendar API</a> et <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener">Google Drive API</a> (pour la synchro) → <em>Activer</em>.</li>
          <li><a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noopener">Écran de consentement OAuth</a> : type <em>Externe</em>, puis dans <em>Audience</em> ajoute ton adresse Gmail comme <em>utilisateur test</em>.</li>
          <li><a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener">Clients</a> → <em>Créer un client</em> → type <em>Application Web</em>. Dans <em>Origines JavaScript autorisées</em>, ajoute <code>${esc(location.origin)}</code>.</li>
          <li>Copie l’<em>ID client</em> (se termine par <code>.apps.googleusercontent.com</code>) et colle-le ci-dessous.</li>
          <li><b>Pour rester connecté</b> (plus de fenêtre Google à chaque ouverture) : sur la page du même client, copie aussi le <em>Code secret du client</em> (commence par <code>GOCSPX-</code>) et colle-le ci-dessous. Puis dans <a href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noopener">Audience</a>, clique <em>Publier l’application</em> : en mode « Test », Google redemande la connexion tous les 7 jours.</li>
        </ol>
        <form class="form" id="cid-form">
          <label>ID client OAuth<input name="cid" value="${esc(clientId)}" placeholder="123456789-abc….apps.googleusercontent.com" autocomplete="off" spellcheck="false"></label>
          <label>Code secret du client <small class="muted">(facultatif : pour rester connecté)</small><input name="secret" type="password" value="" placeholder="${cSecret ? '•••••••• (code enregistré)' : 'GOCSPX-…'}" autocomplete="off" spellcheck="false"></label>
          <div class="head-actions"><button class="btn">Enregistrer</button>${cSecret ? '<button class="btn danger" type="button" id="cs-del">Retirer le code secret</button>' : ''}</div>
          <p class="muted hint" style="margin:0">Le code secret reste sur cet appareil : il n’est envoyé qu’à Google et n’est jamais synchronisé ni inclus dans les sauvegardes exportées.</p>
        </form>
        </details>
        <div class="status-line">
          ${connected
            ? '<button class="btn" id="g-off">Déconnecter</button>'
            : `<button class="btn primary" data-gconnect ${clientId ? '' : 'disabled'}>Connecter Google Agenda</button>`}
          ${clientId && cSecret && !APP.couple ? '<button class="btn" id="g-watch" title="Crée une autorisation pour l’app Life Planner de ta Galaxy Watch (dossier de synchro seulement)">⌚ Lier ma montre</button>' : ''}
        </div>
        <div id="cals"></div>
      </section>

      <section class="card" id="sync-card"></section>

      <section class="card">
        <div class="card-head"><h2>Assistant (Claude)</h2>${aKey ? '<span class="sync live">Activé</span>' : ''}</div>
        <details class="cfg-fold" ${aKey ? '' : 'open'}><summary>${aKey ? '✓ Configuré · clé API et modèle' : 'Configuration'}</summary>
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
        </details>
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

      <section class="card" id="sp-card"></section>

      <section class="card logo-card" id="logo-card"></section>

      <section class="card shot-set" id="shot-card"></section>

      <section class="card us-link">
        <div class="card-head"><h2>📊 Ton utilisation</h2></div>
        <p class="muted" style="margin-top:0">L’app note quelles pages et quels boutons tu utilises (jamais le contenu de tes notes) et te propose des façons de la simplifier : ordre du menu, pages ou cartes à retirer, page d’ouverture…</p>
        <a class="btn primary" href="#/usage">Voir mon utilisation et les suggestions</a>
      </section>

      <section class="card">
        <div class="card-head"><h2>Menu</h2><button class="btn as-reset" id="nav-reset" type="button">Ordre par défaut</button></div>
        <p class="muted" style="margin-top:0">Change l’ordre des onglets avec les flèches ; 👁 retire un onglet du menu ou le remet. Réglages reste toujours en bas.</p>
        <ol class="nav-order" id="nav-order"></ol>
      </section>

      <p class="muted legal-links"><a href="${APP.couple ? '../' : ''}privacy.html" target="_blank" rel="noopener">Règles de confidentialité</a> · <a href="${APP.couple ? '../' : ''}terms.html" target="_blank" rel="noopener">Conditions d’utilisation</a></p>
    </div>`;

  $('#cid-form').onsubmit = async (e) => {
    e.preventDefault();
    const v = e.target.cid.value.trim();
    if (v && !v.endsWith('.apps.googleusercontent.com')) { toast('Cet ID ne ressemble pas à un ID client Google', 'err'); return; }
    const sec = e.target.secret.value.trim();
    if (sec && !/^GOCSPX-[\w-]{10,}$/.test(sec)) { toast('Ce code ne ressemble pas à un code secret de client Google (GOCSPX-…)', 'err'); return; }
    await db.put('settings', v, 'clientId');
    if (sec) { await db.put('settings', sec, 'clientSecret'); gcal.setCodeError(''); } // nouveau code : on réessaie la connexion durable
    if (v !== clientId || sec) await gcal.disconnect(); // nouvelle connexion avec le jeton de renouvellement
    toast(sec ? 'Enregistré — reconnecte-toi une fois et tu resteras connecté' : 'ID enregistré');
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
    const hidden = (await db.get('settings', 'navHidden')) || [];
    $('#nav-order').innerHTML = order.map((k, i) => {
      const a = $(`#rail a[data-route="${k}"]`);
      const off = hidden.includes(k);
      return `<li data-k="${k}" class="${off ? 'off' : ''}"><span class="nav-ico">${a.querySelector('svg').outerHTML}</span><span class="nav-name">${esc(a.querySelector('span').textContent)}${off ? ' <small class="muted">(retiré)</small>' : ''}</span>
        ${k === 'today' ? '' : `<button class="nav-mv nav-eye" data-eye="${k}" aria-pressed="${!off}" title="${off ? 'Remettre dans le menu' : 'Retirer du menu'}" aria-label="${off ? 'Remettre' : 'Retirer'} ${esc(a.querySelector('span').textContent)}">${off ? '🙈' : '👁'}</button>`}
        <button class="nav-mv" data-dir="-1" aria-label="Monter ${esc(a.querySelector('span').textContent)}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="nav-mv" data-dir="1" aria-label="Descendre ${esc(a.querySelector('span').textContent)}" ${i === order.length - 1 ? 'disabled' : ''}>↓</button></li>`;
    }).join('');
    $$('#nav-order [data-eye]').forEach((b) => (b.onclick = async () => {
      await usageApply({ type: hidden.includes(b.dataset.eye) ? 'navShow' : 'navHide', key: b.dataset.eye });
      drawNav();
    }));
    $$('#nav-order .nav-mv[data-dir]').forEach((b) => (b.onclick = async () => {
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
      <label class="check rem-plan"><input type="checkbox" id="rem-plan" ${(await reminders.planOn()) ? 'checked' : ''}> <span><b>Missions planifiées → Google Agenda</b> : une mission placée à une heure dans le planificateur devient un événement « ✅ … » dans ton agenda (déplacée, renommée ou retirée de l’horaire, l’événement suit).</span></label>
      <p class="hint muted">Sur ton cellulaire, installe l’app <b>Google Agenda</b> et autorise ses notifications. Les rappels apparaissent dans ton agenda avec ⏰ (missions) ou 🔁 (habitudes) ; Life Planner les cache de son propre agenda pour éviter les doublons. Une alarme retirée ou une mission faite est retirée de Google Agenda.</p>`;
    $('#rem-on', el)?.addEventListener('click', async (e) => {
      e.target.disabled = true; e.target.textContent = 'Création des rappels…';
      await reminders.setOn(true);
      const s2 = reminders.getStatus();
      toast(s2.error ? '⚠ ' + s2.error : `🔔 ${s2.count} rappel${s2.count > 1 ? 's' : ''} ajouté${s2.count > 1 ? 's' : ''} à Google Agenda`, s2.error ? 'err' : '');
      drawRem();
    });
    $('#rem-plan', el)?.addEventListener('change', async (e) => {
      await reminders.setPlanOn(e.target.checked);
      toast(e.target.checked ? '📅 Tes missions planifiées vont dans Google Agenda' : 'Missions planifiées retirées de Google Agenda');
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
  const spCard = $("#sp-card");
  if (spCard) spotify.settingsCard(spCard, toast);
  addEventListener('lp-google', drawRem, { once: true });

  // Logo et nom de l'app : ce qui te représente
  const drawLogo = async () => {
    const el = $('#logo-card');
    if (!el) return;
    const cfg = await getLogo();
    const av = await getAvatar();
    const modes = [['avatar', 'Mon avatar'], ['mono', 'Mes initiales'], ['emoji', 'Un emoji'], ['image', 'Mon image'], ['app', APP.couple ? 'Logo d’origine' : 'The Planner']];
    el.innerHTML = `<div class="card-head"><h2>🎨 Mon logo</h2><span class="muted">Menu et onglet du navigateur · un clic sur le logo ouvre Aujourd’hui</span></div>
      <div class="logo-modes">${modes.map(([m, l]) => `<button type="button" class="logo-opt ${cfg.mode === m ? 'on' : ''}" data-lmode="${m}">${logoSVG({ ...cfg, mode: m }, av, 52)}<span>${l}</span></button>`).join('')}</div>
      <div class="logo-fields">
        <label>Nom affiché<input id="lg-title" value="${esc(cfg.title)}" maxlength="24" placeholder="${esc(APP.name)}" autocomplete="off"></label>
        ${cfg.mode === 'mono' ? `<label>Initiales<input id="lg-text" value="${esc(cfg.text || initialsOf(av.name))}" maxlength="3" autocomplete="off" style="text-transform:uppercase"></label>` : ''}
        ${cfg.mode === 'emoji' ? `<label>Emoji<input id="lg-emoji" value="${esc(cfg.emoji)}" maxlength="4" autocomplete="off"></label>` : ''}
      </div>
      ${cfg.mode === 'image' ? `<div class="logo-upload">
          <label class="btn primary"><input type="file" id="lg-file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden>📁 ${cfg.img ? 'Changer d’image' : 'Importer mon logo'}</label>
          ${cfg.img ? '<button type="button" class="btn" id="lg-img-del">Retirer</button>' : ''}
          <p class="hint muted">PNG, JPG, SVG ou WebP. L’image est recadrée en carré et réduite (256 px) ; elle suit sur tes autres appareils. Une image carrée avec un fond transparent rend le mieux.</p>
        </div>` : ''}
      ${cfg.mode !== 'app' && cfg.mode !== 'image' ? `<div class="logo-colors"><span class="muted">Couleur</span>${LOGO_COLORS.map((c) => `<button type="button" class="logo-col ${cfg.color === c ? 'on' : ''}" data-lcol="${c}" style="--sw:${c}" aria-label="Couleur ${c}"></button>`).join('')}
        <input type="color" id="lg-color" value="${esc(cfg.color)}" aria-label="Autre couleur"></div>` : ''}
      ${cfg.mode === 'avatar' ? '<p class="hint muted">Ton logo suit ton héros : change son apparence dans la page Ton héros, il évolue avec toi.</p>' : ''}`;
    const set = async (patch, redraw = true) => {
      await db.put('settings', { ...(await getLogo()), ...patch }, 'logo');
      await applyLogo();
      if (redraw) await drawLogo();
    };
    $$('[data-lmode]', el).forEach((b) => (b.onclick = async () => {
      await set({ mode: b.dataset.lmode });
      if (b.dataset.lmode === 'image' && !cfg.img) $('#lg-file', el)?.click(); // pas encore d'image : on en choisit une tout de suite
    }));
    $('#lg-file', el)?.addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { await set({ mode: 'image', img: await squareLogo(f) }); toast('🎨 Logo importé'); } catch (err) { toast(err.message, 'err'); }
    });
    $('#lg-img-del', el)?.addEventListener('click', () => set({ mode: 'avatar', img: '' }));
    $$('[data-lcol]', el).forEach((b) => (b.onclick = () => set({ color: b.dataset.lcol })));
    $('#lg-color', el)?.addEventListener('change', (e) => set({ color: e.target.value }));
    const deb = U.debounce((patch) => set(patch, false), 400);
    $('#lg-title', el).oninput = (e) => deb({ title: e.target.value.trim() || APP.name });
    $('#lg-text', el)?.addEventListener('input', (e) => deb({ text: e.target.value.trim().toUpperCase() }));
    $('#lg-emoji', el)?.addEventListener('input', (e) => { if (e.target.value.trim()) deb({ emoji: e.target.value.trim() }); });
  };
  drawLogo();

  // 📸 Captures d'écran → Cerveau (réglages propres à cet appareil)
  const drawShots = async () => {
    const el = $('#shot-card');
    if (!el) return;
    const st = await shots.dirStatus();
    el.innerHTML = `<div class="card-head"><h2>📸 Captures → Cerveau</h2><span class="muted">Sur cet appareil</span></div>
      <p class="muted" style="margin-top:0">Quand tu reviens dans Life Planner après une capture d’écran (Win + Maj + S), elle t’est proposée : un toucher l’ajoute au Cerveau, dans « À classer ». Rien n’est ajouté sans ton accord.</p>
      <div class="shot-opts">
        <div class="shot-opt"><div><b>📋 Presse-papiers</b><small class="muted">La capture que Win + Maj + S vient de copier.</small></div>
          ${!shots.canClip() ? '<span class="muted">Non disponible dans ce navigateur</span>'
            : shots.clipOn() ? '<span class="chip ok">Activé</span><button class="btn" id="sh-clip-off">Désactiver</button>' : '<button class="btn primary" id="sh-clip-on">Activer</button>'}</div>
        <div class="shot-opt"><div><b>📁 Dossier des captures</b><small class="muted">${st.on ? `« ${esc(st.name)} »${st.perm !== 'granted' ? ' · accès à confirmer' : ''}` : 'Ex. Images › Captures d’écran (aussi la touche Impr. écran).'}</small></div>
          ${!shots.canWatchDir() ? '<span class="muted">Non disponible dans ce navigateur</span>'
            : st.on ? `${st.perm !== 'granted' ? '<button class="btn primary" id="sh-dir-perm">Autoriser</button>' : '<span class="chip ok">Activé</span>'}<button class="btn" id="sh-dir-off">Arrêter</button>` : '<button class="btn primary" id="sh-dir-on">Choisir le dossier</button>'}</div>
      </div>
      <p class="hint muted">Windows enregistre aussi dans le dossier la capture qu’il copie : avec les deux options, chaque capture n’est proposée qu’une fois.</p>`;
    $('#sh-clip-on', el)?.addEventListener('click', async () => {
      try { await shots.enableClip(); toast('📋 Captures du presse-papiers activées'); } catch { toast('Edge n’a pas permis de lire le presse-papiers : autorise-le quand il le demande', 'err'); }
      drawShots();
    });
    $('#sh-clip-off', el)?.addEventListener('click', () => { shots.disableClip(); drawShots(); });
    $('#sh-dir-on', el)?.addEventListener('click', async () => {
      try { await shots.chooseDir(); toast('📁 Dossier des captures surveillé : les prochaines captures te seront proposées'); } catch (err) { if (err.name !== 'AbortError') toast(err.message, 'err'); }
      drawShots();
    });
    $('#sh-dir-perm', el)?.addEventListener('click', async () => { await shots.check({ ask: true, force: true }); drawShots(); });
    $('#sh-dir-off', el)?.addEventListener('click', async () => { await shots.stopDir(); drawShots(); });
  };
  drawShots();

  $('#ak-del')?.addEventListener('click', async () => { await db.del('settings', 'anthropicKey'); toast('Clé retirée'); renderSettings(); });
  $('#cs-del')?.addEventListener('click', async () => { await db.del('settings', 'clientSecret'); gcal.setCodeError(''); await gcal.disconnect(); toast('Code secret retiré'); renderSettings(); });
  // ⌚ Lier ma montre : autorisation propre à la montre, enregistrée dans un fichier que l'outil d'installation copie sur la montre
  $('#g-watch')?.addEventListener('click', async () => {
    try {
      const data = await gcal.linkWatch();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      a.download = 'lifeplanner-montre.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('⌚ Fichier « lifeplanner-montre.json » enregistré dans Téléchargements : il sert une seule fois à lier ta montre. Garde-le privé.');
    } catch (err) { toast(err.message, 'err'); }
  });
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
    const data = { app: APP.id, version: 1, exportedAt: new Date().toISOString(), stores: {} };
    for (const s of STORES) if (s !== 'cache') data.stores[s] = await db.entries(s);
    data.stores.settings = data.stores.settings.filter(([k]) => k !== 'anthropicKey' && k !== 'clientSecret'); // la clé API et le code secret Google ne sortent jamais de l'appareil
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${APP.id}-sauvegarde-${iso(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };
  $('#imp').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (![APP.id, 'lifeplanner'].includes(data.app)) throw new Error('Fichier non reconnu');
      if (!(await confirmBox('Remplacer toutes les données actuelles par cette sauvegarde ?', 'Restaurer'))) return;
      const keepKey = await db.get('settings', 'anthropicKey');
      const keepSecret = await db.get('settings', 'clientSecret');
      for (const [s, rows] of Object.entries(data.stores)) {
        if (!STORES.includes(s)) continue;
        await db.clear(s);
        if (s === 'settings' && keepKey) await db.put('settings', keepKey, 'anthropicKey');
        if (s === 'settings' && keepSecret) await db.put('settings', keepSecret, 'clientSecret');
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
  $("#noel-snow-cb").onchange = (e) => noel.setSnow(e.target.checked);
  $('#theme').addEventListener('change', (e) => { $('.noel-snow-opt').hidden = e.target.value !== 'noel'; });
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
const NAV_KEYS = ['today', 'week', 'missions', 'brain', 'finance', 'propriete', 'workout', 'rbq']; // Objectifs : onglet de Missions · Actualités et Carnet : onglets du Cerveau · Habitudes : onglet de Corps // Aventure : dans la page du héros (Progression) // Actualités : icône à côté du calendrier // Journal : dans le Planificateur (icône 📅 à côté du logo) // Habitudes : dans la page du héros // Semaine, Carnet et Lanceur : icônes à côté du logo
async function navOrder() {
  const saved = ((await db.get('settings', 'navOrder')) || []).filter((k) => NAV_KEYS.includes(k));
  return [...saved, ...NAV_KEYS.filter((k) => !saved.includes(k))];
}
const PHONE_TABS = 4; // sur cellulaire : les 4 premiers onglets dans la barre du bas, le reste dans « Plus »
async function applyNavOrder() {
  const rail = $('#rail');
  const end = rail.querySelector('#rail-more'); // « Plus » puis Réglages restent en bas
  const hidden = (await db.get('settings', 'navHidden')) || []; // pages retirées du menu (toujours accessibles dans Réglages → Menu)
  // Barre du bas choisie à la main (cellulaire seulement, n'a aucun effet sur le menu du PC)
  const phone = ((await db.get('settings', 'phoneTabs')) || []).filter((k) => rail.querySelector(`a[data-route="${k}"]`)).slice(0, PHONE_TABS);
  let i = 0;
  (await navOrder()).forEach((k) => {
    const a = rail.querySelector(`a[data-route="${k}"]`);
    if (!a) return;
    rail.insertBefore(a, end);
    a.classList.toggle('nav-hidden', hidden.includes(k) && !phone.includes(k));
    a.style.removeProperty('--ph-order');
    if (phone.length) {
      a.classList.toggle('nav-extra', !phone.includes(k));
      if (phone.includes(k)) a.style.setProperty('--ph-order', phone.indexOf(k));
      return;
    }
    if (hidden.includes(k)) return;
    a.classList.toggle('nav-extra', i >= PHONE_TABS);
    i++;
  });
}
/** « Plus » → Personnaliser : choisir les 4 onglets de la barre du bas du cellulaire, dans l'ordre touché. */
async function editPhoneTabs() {
  const order = await navOrder();
  const all = order.map((k) => $(`#rail a[data-route="${k}"]`)).filter(Boolean)
    .map((a) => ({ k: a.dataset.route, l: a.querySelector('span')?.textContent || a.dataset.route, ico: a.querySelector('svg')?.outerHTML || '' }));
  let pick = ((await db.get('settings', 'phoneTabs')) || []).filter((k) => all.some((x) => x.k === k));
  if (!pick.length) pick = $$('#rail > a[data-route]:not(.nav-extra):not(.nav-hidden)').map((a) => a.dataset.route).filter((k) => all.some((x) => x.k === k)).slice(0, PHONE_TABS);
  modal(`<h2>Barre du bas</h2><p class="muted" style="margin-top:0">Touche jusqu’à ${PHONE_TABS} pages, dans l’ordre voulu. Les autres restent dans « Plus ».</p>
    <div class="pt-list"></div>
    <div class="modal-actions"><button class="btn" id="pt-reset">Par défaut</button><button class="btn primary" id="pt-ok">Enregistrer</button></div>`, (m, close) => {
    const draw = () => {
      m.querySelector('.pt-list').innerHTML = all.map((x) => { const n = pick.indexOf(x.k); return `<button type="button" class="pt-item ${n >= 0 ? 'on' : ''}" data-k="${x.k}" ${n < 0 && pick.length >= PHONE_TABS ? 'disabled' : ''}>${x.ico}<span>${esc(x.l)}</span><b>${n >= 0 ? n + 1 : ''}</b></button>`; }).join('');
      m.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { const k = b.dataset.k; pick = pick.includes(k) ? pick.filter((x) => x !== k) : [...pick, k]; draw(); }));
    };
    draw();
    m.querySelector('#pt-reset').onclick = async () => { await db.del('settings', 'phoneTabs'); await applyNavOrder(); close(); toast('Barre du bas par défaut'); };
    m.querySelector('#pt-ok').onclick = async () => {
      if (!pick.length) { toast('Choisis au moins une page', 'err'); return; }
      await db.put('settings', pick, 'phoneTabs');
      await applyNavOrder();
      close();
      toast('📱 Barre du bas enregistrée');
    };
  });
}

/* ---------- Suivi d'utilisation : état et actions des suggestions (voir usage.js) ---------- */
async function usageState() {
  return {
    navOrder: await navOrder(),
    navHidden: (await db.get('settings', 'navHidden')) || [],
    todayHidden: (await db.get('settings', 'todayHidden')) || [],
    folded: foldedSet(),
    startPage: (await db.get('settings', 'startPage')) || 'today',
  };
}
async function usageApply(a) {
  const list = async (key, add, k) => {
    const cur = new Set((await db.get('settings', key)) || []);
    add ? cur.add(k) : cur.delete(k);
    await db.put('settings', [...cur], key);
  };
  if (a.type === 'navOrder') await db.put('settings', a.order, 'navOrder');
  else if (a.type === 'navHide') await list('navHidden', true, a.key);
  else if (a.type === 'navShow') await list('navHidden', false, a.key);
  else if (a.type === 'cardHide') await list('todayHidden', true, a.key);
  else if (a.type === 'cardShow') await list('todayHidden', false, a.key);
  else if (a.type === 'cardFold') { const s = foldedSet(); s.add(a.key); try { localStorage.setItem(FOLD_KEY, JSON.stringify([...s])); } catch { /* ignore */ } }
  else if (a.type === 'startPage') await db.put('settings', a.key, 'startPage');
  await applyNavOrder();
}
/* =========================================================
   Vue : Historique des modifications (onglet de Réglages)
   Lu directement dans l'historique du projet sur GitHub (dépôt public), gardé en cache une heure.
   ========================================================= */
const REPO = 'KyloSTA/lifeplanner';
const LOG_KEY = 'changelog';
async function loadChangelog(force = false) {
  const cached = await db.get('cache', LOG_KEY).catch(() => null);
  if (!force && cached && Date.now() - cached.at < 3600_000) return { list: cached.list, at: cached.at };
  try {
    const list = [];
    for (let page = 1; page <= 5; page++) {
      const r = await fetch(`https://api.github.com/repos/${REPO}/commits?sha=main&per_page=100&page=${page}`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw new Error(r.status === 403 ? 'GitHub limite les demandes : réessaie dans une heure' : 'GitHub : erreur ' + r.status);
      const arr = await r.json();
      for (const c of arr) {
        // Seulement le message et la date (pas d'adresse courriel)
        const msg = (c.commit?.message || '').replace(/\r/g, '').split('\n').filter((l) => !/^Co-Authored-By:/i.test(l.trim())).join('\n').trim();
        if (!msg || /^Mise a jour de Life Planner$/i.test(msg)) continue; // envois sans description (Publier.bat)
        list.push({ sha: c.sha, date: c.commit?.author?.date || c.commit?.committer?.date, msg, url: c.html_url });
      }
      if (arr.length < 100) break;
    }
    await db.put('cache', { at: Date.now(), list }, LOG_KEY);
    return { list, at: Date.now() };
  } catch (err) {
    if (cached) return { list: cached.list, at: cached.at, error: err.message };
    throw err;
  }
}

/** Corps d'un message : listes « - » en puces, le reste en paragraphes (lignes suivantes recollées). */
function changeBody(body) {
  const out = [];
  let list = null, para = null;
  for (const raw of body.split('\n')) {
    const l = raw.trim();
    if (!l) { list = null; para = null; continue; }
    const m = l.match(/^[-•*]\s+(.*)$/);
    if (m) { para = null; if (!list) { list = []; out.push({ ul: list }); } list.push(m[1]); continue; }
    if (list && raw.startsWith('  ')) { list[list.length - 1] += ' ' + l; continue; } // suite d'une puce
    list = null;
    if (para) para.p += ' ' + l; else { para = { p: l }; out.push(para); }
  }
  return out.map((b) => (b.ul ? `<ul>${b.ul.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p>${esc(b.p)}</p>`)).join('');
}

let changelogQ = '';
async function renderChangelog() {
  view.innerHTML = `
    <header class="page-head"><div><p class="eyebrow">Réglages</p><h1>Historique</h1></div>
      <div class="head-actions"><button class="btn" id="cl-refresh">↻ Actualiser</button></div></header>
    <p class="muted cl-intro">Toutes les modifications apportées à Life Planner, des plus récentes aux plus anciennes.</p>
    <input class="pick-search cl-search" id="cl-q" placeholder="🔍 Chercher une modification (ex. Workout, montre, Cerveau)…" autocomplete="off" value="${esc(changelogQ)}">
    <div id="cl-body"><p class="empty-sm">Chargement…</p></div>`;
  const body = $('#cl-body');
  let data;
  try { data = await loadChangelog(); } catch (err) {
    body.innerHTML = `<div class="card empty-card"><p>Impossible de lire l’historique : ${esc(err.message)}. Vérifie ta connexion.</p></div>`;
    return;
  }
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const draw = () => {
    const q = norm(changelogQ.trim());
    const list = data.list.filter((c) => !q || norm(c.msg).includes(q));
    const today = iso(new Date()), yest = iso(U.addDays(new Date(), -1));
    const groups = [];
    for (const c of list) {
      const d = iso(new Date(c.date));
      if (groups[groups.length - 1]?.d !== d) groups.push({ d, items: [] });
      groups[groups.length - 1].items.push(c);
    }
    body.innerHTML = (data.error ? `<p class="warn-text">⚠ ${esc(data.error)} — affichage de la dernière copie.</p>` : '')
      + (groups.map((g) => `<section class="cl-day"><h3 class="section-title">${g.d === today ? 'Aujourd’hui' : g.d === yest ? 'Hier' : U.cap(U.fmtLong(U.parseISO(g.d)))} <small class="muted">${g.items.length}</small></h3>
        <div class="card cl-list">${g.items.map((c) => {
          const [subject, ...rest] = c.msg.split('\n');
          const more = rest.join('\n').trim();
          const [area, ...title] = subject.split(/\s:\s/);
          const head = title.length ? `<span class="cl-area">${esc(area)}</span><b>${esc(title.join(' : '))}</b>` : `<b>${esc(subject)}</b>`;
          return more ? `<details class="cl-item"><summary><span class="cl-time">${U.fmtTime(new Date(c.date))}</span><span class="cl-head">${head}</span></summary><div class="cl-more">${changeBody(more)}<a href="${esc(c.url)}" target="_blank" rel="noopener" class="cl-link">Voir sur GitHub ↗</a></div></details>`
            : `<div class="cl-item"><span class="cl-time">${U.fmtTime(new Date(c.date))}</span><span class="cl-head">${head}</span></div>`;
        }).join('')}</div></section>`).join('') || '<p class="empty-sm">Aucune modification ne correspond.</p>')
      + `<p class="hint muted">${data.list.length} modifications · mis à jour ${U.fmtTime(new Date(data.at))}</p>`;
  };
  if (!body.isConnected) return; // page quittée pendant le chargement
  draw();
  $('#cl-q').oninput = (e) => { changelogQ = e.target.value; draw(); };
  $('#cl-refresh').onclick = async (e) => {
    e.target.disabled = true;
    try { data = await loadChangelog(true); draw(); toast('Historique à jour'); } catch (err) { toast(err.message, 'err'); }
    e.target.disabled = false;
  };
}

const USAGE_SYSTEM = 'Tu es un expert UX qui aide une personne à simplifier son application personnelle de planification. Réponds en français québécois, de façon concrète et brève.';
async function renderUsage() {
  await usage.renderPage(pageCtx(), {
    state: usageState, apply: usageApply, hasKey: await assistant.hasKey(), device: alarms.DEVICE,
    ask: (text) => assistant.askPlain(USAGE_SYSTEM, text),
    addMission: (title) => addTask(title, null),
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
  const search = `<a href="#" data-gs>${$('#gs-fab svg').outerHTML}<span>Rechercher</span></a><a href="#" data-vd>${$("#brand-video svg").outerHTML}<span>${videodock.isOpen() ? "Fermer l’espace vidéo" : "Espace vidéo"}</span></a>`;
  const ss = syncState();
  modal(`<h2>Plus</h2><button type="button" class="more-sync" data-s="${ss.c}" data-sync><i></i><span>${esc(ss.t)}</span></button><nav class="more-sheet">${search}${launch}${links.map((a) => {
    const route = a.dataset.route;
    const label = route === 'hero' ? 'Ton héros' : a.querySelector('span')?.textContent || '';
    const icon = route === 'hero' ? (a.querySelector('svg.avatar')?.outerHTML || '') : a.querySelector('svg')?.outerHTML || '';
    return `<a href="${a.getAttribute('href')}" data-close class="${a.classList.contains('active') ? 'active' : ''}">${icon}<span>${esc(label)}</span></a>`;
  }).join('')}</nav><button type="button" class="btn more-custom" data-pt>✏️ Personnaliser la barre du bas</button>`, (m, close) => {
    m.querySelector('[data-pt]').addEventListener('click', () => { close(); editPhoneTabs(); });
    $$('a', m).forEach((a) => a.addEventListener('click', close));
    m.querySelector('[data-gs]').addEventListener('click', (e) => { e.preventDefault(); close(); openSearch(); }); 
    m.querySelector('[data-vd]').addEventListener('click', (e) => { e.preventDefault(); close(); videodock.toggle(); });
    m.querySelector('[data-sync]').addEventListener('click', () => { close(); syncDotClick(); });
  });
};

// Plein écran : toute l'app, sans barres de Windows ni du navigateur (Échap ou le bouton pour sortir)
{
  const fsBtn = $('#brand-fs');
  const ICON_IN = '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  const ICON_OUT = '<svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
  const sync = () => {
    const on = !!document.fullscreenElement;
    fsBtn.innerHTML = on ? ICON_OUT : ICON_IN;
    fsBtn.title = on ? 'Quitter le plein écran (Échap)' : 'Plein écran (F11)';
    fsBtn.setAttribute('aria-label', on ? 'Quitter le plein écran' : 'Plein écran');
    fsBtn.classList.toggle('active', on);
  };
  if (fsBtn && document.fullscreenEnabled) {
    fsBtn.hidden = false;
    fsBtn.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen({ navigationUI: 'hide' }))
      .catch(() => toast('Le plein écran n’est pas permis ici (essaie F11)', 'err'));
    document.addEventListener('fullscreenchange', sync);
    sync();
  }
}

// Lanceur rapide : petite icône à droite du logo -> menu de tes applications
$('#brand-launch').onclick = (e) => { e.stopPropagation(); toggleLaunchPop(e.currentTarget); };
// Barre de titre (fenêtre installée, mode « barre de titre masquée ») : l'icône de l'app ouvre aussi le Lanceur
$('#tb-launch')?.addEventListener('click', (e) => { e.stopPropagation(); toggleLaunchPop(e.currentTarget); });
async function toggleLaunchPop(btn) {
  const old = $('#launch-pop');
  if (old) { old.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
  const items = await launcher.list();
  const pop = document.createElement('div');
  pop.id = 'launch-pop';
  pop.className = 'launch-pop';
  pop.setAttribute('role', 'menu');
  pop.innerHTML = `<div class="lp-grid">${items.map((it, i) => `<button class="lp-item" role="menuitem" data-i="${i}" title="${esc(it.name)}">
      <span class="lp-ico" style="--c:${esc(launcher.colorOf(it))}">${launcher.iconHTML(it)}</span><span class="lp-name">${esc(it.name)}</span></button>`).join('')}</div>
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
    if (!launcher.open(it, pcMissing)) toast('La fenêtre a été bloquée : autorise les pop-ups pour Life Planner dans Edge', 'err');
  }));
  pop.querySelector('.lp-item')?.focus();
};

function applyTheme() {
  let t = '';
  try { t = localStorage.getItem('lp.theme') || ''; } catch { /* ignore */ }
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  noel.apply(); // décorations du thème Noël
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
game.init().catch(console.error).finally(async () => {
  refreshRail();
  // Page d'ouverture choisie (suggestion « Ouvrir l'app directement sur… »)
  if (!location.hash || location.hash === '#' || location.hash === '#/') {
    const sp = await db.get('settings', 'startPage').catch(() => null);
    if (sp && sp !== 'today' && routes[sp]) history.replaceState(null, '', '#/' + sp);
  }
  // Une seule fois : cartes Page manuscrite et Examen RBQ cachées d'Aujourd'hui (réaffichables dans Ton utilisation)
  if (!(await db.get('settings', 'todayDefaultsV1').catch(() => true))) {
    const cur = new Set((await db.get('settings', 'todayHidden')) || []);
    ['t-ink', 't-rbq'].forEach((k) => cur.add(k));
    await db.put('settings', [...cur], 'todayHidden');
    await db.put('settings', true, 'todayDefaultsV1');
  }
  router();
  usage.start().catch(console.error);
  // Finances : rappel hebdomadaire (après la synchro, pour ne le créer qu'une fois) et import auto du dossier surveillé
  sync.firstSync().then(() => { finance.checkReminder(); digest.start(); }).catch(console.error);
  // App couple : prénoms des deux et « qui utilise cet appareil » au premier lancement
  if (couple.ON) couple.setup(modal, { onDone: () => router() }).catch(console.error);
  if (couple.ON) document.addEventListener('click', (e) => { if (e.target.closest('#cp-edit')) couple.setup(modal, { force: true, onDone: () => router() }); });
  finance.autoImport().then((r) => { if (r?.added) toast(`📁 ${r.files} relevé${r.files > 1 ? 's' : ''} importé${r.files > 1 ? 's' : ''} · ${r.added} nouvelle${r.added > 1 ? 's' : ''} transaction${r.added > 1 ? 's' : ''}`); }).catch(() => {});
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
  addEventListener('lp-toast', (e) => toast(e.detail));
  spotify.start().catch(console.error);
  priobar.start();
  // Rappels d'habitudes : après « Fait » depuis un rappel, on rafraîchit la vue concernée
  habits.start(() => {
    const route = location.hash.replace(/^#\/?/, '').split('/')[0] || 'today';
    if (route === 'today') refreshToday();
    else if ((route === 'habits' || route === 'hero') && !$('#modal-root').children.length) router();
  });
  // Captures d'écran → Cerveau : proposées quand tu reviens dans l'app (presse-papiers et dossier des captures)
  shots.start({
    toast,
    onAdded: () => {
      const route = location.hash.replace(/^#\/?/, '').split('/')[0] || 'today';
      if ((route === 'brain' || route === 'today') && !$('#modal-root').children.length) router();
    },
  });
  // Posts Reddit et vidéos YouTube sauvegardés avec le bouton « 🧠 Cerveau » (extension extension-edge).
  // L'app couple ne les reçoit pas : ils vont dans le Cerveau de Life Planner (ou attendent son ouverture).
  if (!APP.couple) clips.start((note, updated, kind) => {
    if (kind === 'fbevent') {
      const r = location.hash.replace(/^#\/?/, '').split('/')[0];
      if (r === 'activities' && !$('#modal-root').children.length) router();
      toast(`🎟 Événement Facebook ${updated ? 'mis à jour' : 'ajouté à Activités'} : « ${note.title} »${note.start ? '' : ' (date à vérifier)'}`);
      return;
    }
    refreshRail();
    const route = location.hash.replace(/^#\/?/, '').split('/')[0] || 'today';
    if (route === 'brain' && !$('#modal-root').children.length) router();
    const what = kind === 'youtube' ? 'Vidéo YouTube' : kind === 'amazon' ? 'Article Amazon' : 'Post Reddit';
    toast(updated ? `🧠 ${what} mis à jour : « ${note.title} »` : `🧠 ${what} ajouté au Cerveau : « ${note.title} »`);
  });
});

// Outils communs pour les pages sorties dans leur propre module (page-brain.js…)
export { $, $$, view, toast, modal, confirmBox, router, routes, HZ_LABEL, QUICK_DATES, concludeGoal, evoBar, evoLine, fold, getAvatar, goalClass, goalMark, goalSort, goalVerdict, hzOptions, openGoals };
