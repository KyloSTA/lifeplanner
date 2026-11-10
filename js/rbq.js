// Cours RBQ : préparation de l'examen (modules, notes de cours, points clés, cartes de révision
// avec répétition espacée) et compte à rebours jusqu'à la date d'examen.
//
// Store « study » :
//   module : { id, kind: 'module', title, desc, order, status, notes, keys: [{ id, text }] }
//   carte  : { id, kind: 'card', moduleId, q, a, box (1-5), due 'AAAA-MM-JJ', right, wrong }
// Réglages (settings « rbq ») : { name, exam 'AAAA-MM-JJ', courseUrl }

import { db } from './db.js';
import * as U from './util.js';
import * as game from './game.js';
import { renderBody } from './brain.js';
import * as brain from './brain.js';
import * as images from './images.js';
import { openWindow } from './launcher.js';

const { esc, iso } = U;
export const STATUS = [
  ['todo', 'À commencer', '⚪'],
  ['doing', 'En cours', '🟡'],
  ['review', 'À réviser', '🟠'],
  ['done', 'Maîtrisé', '🟢'],
];
const ST = Object.fromEntries(STATUS.map(([v, l, i]) => [v, { l, i }]));
const INTERVAL = [0, 1, 3, 7, 14, 30]; // jours avant de revoir une carte, selon sa boîte (1 à 5)

// Point de départ : les grands volets des examens de licence d'entrepreneur. Tout est modifiable.
const SEED = [
  ['rbq-admin', 'Administration', 'Gestion d’entreprise, finances et comptabilité, lois et règlements (RBQ, CCQ, CNESST), contrats et assurances.'],
  ['rbq-securite', 'Gestion de la sécurité sur les chantiers', 'Loi sur la santé et la sécurité du travail, Code de sécurité pour les travaux de construction, programme de prévention.'],
  ['rbq-projets', 'Gestion de projets et de chantiers', 'Planification, estimation, soumissions, échéanciers, suivi des coûts et coordination des travaux.'],
  ['rbq-execution', 'Exécution des travaux de construction', 'Code de construction, normes et techniques propres à ta sous-catégorie de licence.'],
];

/* ---------- Données ---------- */
export const getConf = async () => ({ name: 'Examen RBQ', exam: '', courseUrl: '', ...((await db.get('settings', 'rbq')) || {}) });
const setConf = (c) => db.put('settings', c, 'rbq');

async function ensureSeed() {
  if (await db.get('settings', 'rbqSeeded')) return;
  const existing = await db.all('study');
  if (!existing.some((x) => x.kind === 'module')) {
    let i = 0;
    for (const [id, title, desc] of SEED) {
      if (!(await db.get('study', id))) await db.put('study', { id, kind: 'module', title, desc, order: i++, status: 'todo', notes: '', keys: [], createdAt: Date.now() });
    }
  }
  await db.put('settings', true, 'rbqSeeded');
}

async function load() {
  const all = await db.all('study');
  const modules = all.filter((x) => x.kind === 'module').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const cards = all.filter((x) => x.kind === 'card');
  return { modules, cards };
}
const dueCards = (cards, today = iso(new Date())) => cards.filter((c) => (c.due || '') <= today);
export async function stats() {
  const { modules, cards } = await load();
  const conf = await getConf();
  const daysLeft = conf.exam ? Math.ceil((U.parseISO(conf.exam) - U.startOfDay(new Date())) / 86_400_000) : null;
  return { modules, cards, conf, daysLeft, due: dueCards(cards).length, done: modules.filter((m) => m.status === 'done').length };
}

async function answer(card, ok) {
  const c = await db.get('study', card.id);
  if (!c) return 0;
  const today = iso(new Date());
  if (ok) { c.box = Math.min(5, (c.box || 1) + 1); c.right = (c.right || 0) + 1; }
  else { c.box = 1; c.wrong = (c.wrong || 0) + 1; }
  c.due = iso(U.addDays(new Date(), ok ? INTERVAL[c.box] : 1)); // ratée : revue une 2e fois dans la séance, puis demain
  c.lastAt = Date.now();
  await db.put('study', c);
  return game.award(`study:${c.id}:${today}`, game.XP.study, 'Révision RBQ', { showPop: false });
}

/* =========================================================
   Révision (cartes)
   ========================================================= */
function review(ctx, cards, title, onEnd) {
  const { modal } = ctx;
  if (!cards.length) { ctx.toast('Aucune carte à réviser ici'); return; }
  const queue = [...cards].sort(() => Math.random() - 0.5);
  const again = new Set();
  let ok = 0, ko = 0, xp = 0, shown = false;
  modal('<div id="rv"></div>', (m, close) => {
    const host = m.querySelector('#rv');
    m.classList.add('rv-modal');
    const draw = () => {
      const c = queue[0];
      if (!c) {
        host.innerHTML = `<h2>Révision terminée 🎉</h2>
          <p class="rv-score"><span class="ok">✓ ${ok}</span> <span class="ko">✗ ${ko}</span></p>
          <p class="muted">${ko ? 'Les cartes ratées reviendront demain et ce sont elles qui comptent le plus : bravo de les affronter.' : 'Sans faute ! Les cartes reviendront de moins en moins souvent.'}</p>
          <div class="modal-actions"><button class="btn primary" data-close>Fermer</button></div>`;
        host.querySelector('[data-close]').onclick = () => { close(); onEnd(); };
        if (xp) game.pop(xp, 'Révision RBQ');
        return;
      }
      host.innerHTML = `<p class="eyebrow">${esc(title)} · ${ok + ko + 1}/${ok + ko + queue.length}</p>
        <div class="rv-card"><div class="rv-q">${esc(c.q)}</div>${shown ? `<div class="rv-a">${esc(c.a).replace(/\n/g, '<br>')}</div>` : ''}</div>
        <div class="modal-actions">${shown
          ? '<button class="btn" data-ko>✗ À revoir</button><button class="btn primary" data-ok>✓ Je savais</button>'
          : '<button class="btn" data-quit>Arrêter</button><button class="btn primary" data-show autofocus>Voir la réponse</button>'}</div>`;
      host.querySelector('[data-show]')?.addEventListener('click', () => { shown = true; draw(); });
      host.querySelector('[data-quit]')?.addEventListener('click', () => { close(); onEnd(); });
      const next = async (good) => {
        queue.shift();
        if (good) ok++; else { ko++; if (!again.has(c.id)) { again.add(c.id); queue.push(c); } }
        xp += (await answer(c, good)) || 0;
        shown = false;
        draw();
      };
      host.querySelector('[data-ok]')?.addEventListener('click', () => next(true));
      host.querySelector('[data-ko]')?.addEventListener('click', () => next(false));
    };
    draw();
  });
}

/* =========================================================
   Page principale : #/rbq
   ========================================================= */
export async function renderPage(ctx, moduleId) {
  await ensureSeed();
  if (moduleId) return renderModule(ctx, moduleId);
  const { view, modal, toast } = ctx;
  const { modules, cards, conf, daysLeft, due, done } = await stats();
  const redraw = () => renderPage(ctx);
  const total = cards.reduce((n, c) => n + (c.right || 0) + (c.wrong || 0), 0);
  const right = cards.reduce((n, c) => n + (c.right || 0), 0);
  const pct = modules.length ? Math.round((done / modules.length) * 100) : 0;
  const left = modules.filter((m) => m.status !== 'done').length;
  const pace = daysLeft > 0 && left ? Math.max(1, Math.floor(daysLeft / left)) : null;

  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Préparation d’examen</p><h1>${esc(conf.name || 'Cours RBQ')}</h1></div>
      <div class="head-actions">
        ${conf.courseUrl ? '<button class="btn" id="rbq-course">📖 Ouvrir le cours</button>' : ''}
        <button class="btn" id="rbq-conf">⚙ Examen et cours</button>
      </div>
    </header>
    <section class="card rbq-top">
      <div class="rbq-count">${daysLeft === null
        ? '<strong>📅</strong><span>Ajoute la date de ton examen<br><button class="btn sm-text" id="rbq-setdate">Choisir la date</button></span>'
        : daysLeft > 0 ? `<strong>${daysLeft}</strong><span>jour${daysLeft > 1 ? 's' : ''} avant l’examen<br><small class="muted">${U.cap(U.fmtLong(U.parseISO(conf.exam)))}</small></span>`
          : daysLeft === 0 ? '<strong>🎯</strong><span>C’est aujourd’hui ! Bonne chance.</span>'
            : `<strong>✔</strong><span>Examen passé le ${U.fmtShort(U.parseISO(conf.exam))}</span>`}</div>
      <div class="rbq-prog">
        <div class="rbq-prog-row"><span>Modules maîtrisés</span><b>${done}/${modules.length}</b></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <p class="muted">${cards.length} carte${cards.length > 1 ? 's' : ''} · ${total ? `${Math.round((right / total) * 100)} % de bonnes réponses` : 'aucune révision encore'}${pace ? ` · rythme suggéré : 1 module tous les ${pace} jour${pace > 1 ? 's' : ''}` : ''}</p>
      </div>
      <div class="rbq-due"><button class="btn primary" id="rbq-review" ${due ? '' : 'disabled'}>🃏 Réviser ${due ? `(${due})` : ''}</button>
        <small class="muted">${due ? 'cartes à revoir aujourd’hui' : cards.length ? 'Rien à revoir aujourd’hui 👍' : 'Ajoute des cartes dans un module'}</small></div>
    </section>
    <div class="rbq-mods">${modules.map((m) => {
      const mc = cards.filter((c) => c.moduleId === m.id);
      const md = dueCards(mc).length;
      return `<a class="card rbq-mod st-${m.status}" href="#/rbq/${m.id}">
        <div class="rbq-mod-head"><h3>${esc(m.title)}</h3><span class="chip">${ST[m.status]?.i || ''} ${ST[m.status]?.l || ''}</span></div>
        ${m.desc ? `<p class="muted rbq-desc">${esc(m.desc)}</p>` : ''}
        <p class="rbq-meta"><span>📝 ${(m.notes || '').trim() ? 'notes' : 'pas de notes'}</span><span>⭐ ${(m.keys || []).length} point${(m.keys || []).length > 1 ? 's' : ''} clé${(m.keys || []).length > 1 ? 's' : ''}</span><span>🃏 ${mc.length} carte${mc.length > 1 ? 's' : ''}${md ? ` · <b>${md} à revoir</b>` : ''}</span>${(m.noteIds || []).length ? `<span>🧠 ${m.noteIds.length} du Cerveau</span>` : ''}</p>
      </a>`;
    }).join('')}
      <button class="card rbq-add" id="rbq-addmod">+ Ajouter un module</button>
    </div>
    <p class="hint muted">Les modules de départ suivent les grands volets des examens de licence RBQ : renomme-les, supprime-les ou ajoute ceux de ton cours. Les cartes ratées reviennent le lendemain, les cartes connues de plus en plus tard (1, 3, 7, 14 puis 30 jours).</p>`;

  const confModal = () => modal(`<h2>Examen et cours</h2>
    <form id="rbq-cf" class="hb-form">
      <label class="hb-lbl" for="cf-name">Nom de l’examen</label><input id="cf-name" name="name" value="${esc(conf.name)}" autocomplete="off">
      <label class="hb-lbl" for="cf-date">Date de l’examen</label><input id="cf-date" type="date" name="exam" value="${esc(conf.exam)}">
      <label class="hb-lbl" for="cf-url">Adresse du cours en ligne</label><input id="cf-url" name="courseUrl" value="${esc(conf.courseUrl)}" placeholder="https://…" autocomplete="off" spellcheck="false">
      <p class="hint muted">Le bouton « Ouvrir le cours » l’ouvrira dans sa propre fenêtre, comme le Lanceur.</p>
      <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div>
    </form>`, (m, close) => {
    m.querySelector('#rbq-cf').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      let url = f.courseUrl.value.trim();
      if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
      await setConf({ ...conf, name: f.name.value.trim() || 'Examen RBQ', exam: f.exam.value, courseUrl: url });
      close();
      toast('Enregistré');
      redraw();
    };
  });
  view.querySelector('#rbq-conf').onclick = confModal;
  view.querySelector('#rbq-setdate')?.addEventListener('click', confModal);
  view.querySelector('#rbq-course')?.addEventListener('click', () => {
    if (!openWindow({ id: 'rbq-course', url: conf.courseUrl })) toast('La fenêtre a été bloquée : autorise les pop-ups pour Life Planner', 'err');
  });
  view.querySelector('#rbq-review').onclick = () => review(ctx, dueCards(cards), 'Révision du jour', redraw);
  view.querySelector('#rbq-addmod').onclick = () => modal(`<h2>Nouveau module</h2>
    <form id="rbq-nm" class="hb-form"><input name="title" placeholder="Ex. Code de construction — chapitre 9" required autocomplete="off" autofocus>
    <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Ajouter</button></div></form>`, (m, close) => {
    m.querySelector('#rbq-nm').onsubmit = async (e) => {
      e.preventDefault();
      const id = U.uid();
      await db.put('study', { id, kind: 'module', title: e.target.title.value.trim(), desc: '', order: modules.length ? Math.max(...modules.map((x) => x.order ?? 0)) + 1 : 0, status: 'todo', notes: '', keys: [], createdAt: Date.now() });
      close();
      location.hash = '#/rbq/' + id;
    };
  });
}

/** Choisir des notes du Cerveau (recherche, plusieurs à la fois). onPick(ids). */
async function pickNotes(ctx, already, onPick) {
  const all = (await brain.allNotes()).filter((n) => !n.archived && !already.includes(n.id))
    .sort((a, b) => (b.inbox - a.inbox) || (b.updatedAt || 0) - (a.updatedAt || 0));
  const chosen = new Set();
  ctx.modal(`<h2>Ajouter depuis le Cerveau</h2>
    <input class="pick-search" placeholder="🔍 Chercher une note…" autocomplete="off" autofocus>
    <div class="pick-list"></div>
    <div class="modal-actions"><button class="btn" data-close>Annuler</button><button class="btn primary" id="pk-ok" disabled>Ajouter</button></div>`, (m, close) => {
    m.classList.add('pick-modal');
    const list = m.querySelector('.pick-list'), ok = m.querySelector('#pk-ok');
    const draw = () => {
      const q = brain.norm(m.querySelector('.pick-search').value);
      const rows = all.filter((n) => !q || brain.norm(`${n.title} ${n.body}`).includes(q)).slice(0, 60);
      list.innerHTML = rows.map((n) => {
        const im = images.refsIn(n.body);
        return `<label class="pick-row ${chosen.has(n.id) ? 'on' : ''}">
          <input type="checkbox" value="${n.id}" ${chosen.has(n.id) ? 'checked' : ''}>
          ${im.length ? `<img data-img="${im[0]}" alt="">` : `<span class="pick-ico">${brain.typeOf(n.type).icon}</span>`}
          <span class="pick-txt"><b>${esc(n.title || 'Sans titre')}</b><small class="muted">${n.inbox ? '📥 À classer · ' : ''}${esc(brain.excerpt(n.body, 80))}</small></span>
        </label>`;
      }).join('') || `<p class="empty-sm">${all.length ? 'Aucune note ne correspond.' : 'Toutes tes notes sont déjà dans ce module (ou ton Cerveau est vide).'}</p>`;
      list.querySelectorAll('input').forEach((cb) => (cb.onchange = () => {
        cb.checked ? chosen.add(cb.value) : chosen.delete(cb.value);
        cb.closest('.pick-row').classList.toggle('on', cb.checked);
        ok.disabled = !chosen.size;
        ok.textContent = chosen.size ? `Ajouter (${chosen.size})` : 'Ajouter';
      }));
    };
    m.querySelector('.pick-search').oninput = draw;
    ok.onclick = () => { close(); onPick([...chosen]); };
    draw();
  });
}

/* =========================================================
   Page d'un module : #/rbq/<id>
   ========================================================= */
async function renderModule(ctx, id) {
  const { view, toast, confirmBox, setCleanup } = ctx;
  const m = await db.get('study', id);
  if (!m) { location.replace('#/rbq'); return; }
  const cards = (await db.all('study')).filter((c) => c.kind === 'card' && c.moduleId === id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const redraw = () => renderModule(ctx, id);
  const edit = async (fn) => { const cur = await db.get('study', id); fn(cur); await db.put('study', cur); return cur; };
  let reading = !!(m.notes || '').trim();

  view.innerHTML = `
    <header class="page-head note-head">
      <div class="grow"><a class="eyebrow" href="#/rbq">← Cours RBQ</a>
        <input class="note-title" id="md-title" value="${esc(m.title)}" aria-label="Titre du module" autocomplete="off"></div>
      <div class="head-actions"><button class="btn" id="md-practice" ${cards.length ? '' : 'disabled'}>🃏 Réviser tout le module</button></div>
    </header>
    <div class="filters rbq-status">${STATUS.map(([v, l, i]) => `<button class="chip-btn ${m.status === v ? 'on' : ''}" data-st="${v}">${i} ${l}</button>`).join('')}</div>
    <div class="rbq-cols">
      <div class="rbq-main">
      <section class="card">
        <div class="card-head"><h2>📝 Notes de cours</h2>
          <div class="seg"><button class="${reading ? '' : 'on'}" data-mode="write">✎ Écrire</button><button class="${reading ? 'on' : ''}" data-mode="read">👁 Lire</button></div></div>
        <div id="md-notes"></div>
        <p class="hint muted">Astuce : « # Titre », « - liste », « > citation », **gras**. Les liens web sont cliquables en mode Lire.</p>
      </section>
      <section class="card rbq-brain" id="md-brain"></section>
      </div>
      <div class="rbq-side">
        <section class="card">
          <div class="card-head"><h2>⭐ Points clés</h2><span class="muted">${(m.keys || []).length}</span></div>
          <form class="add-row" id="md-kform"><input name="k" placeholder="Ex. Licence obligatoire dès 25 000 $ ?" autocomplete="off"><button class="btn icon" aria-label="Ajouter">+</button></form>
          <ul class="rbq-keys">${(m.keys || []).map((k) => `<li><span>⭐ ${esc(k.text)}</span><button class="btn sm" data-kdel="${k.id}" aria-label="Retirer">×</button></li>`).join('') || '<li class="empty-sm">Les notions à retenir absolument pour l’examen.</li>'}</ul>
        </section>
        <section class="card">
          <div class="card-head"><h2>🃏 Cartes de révision</h2><span class="muted">${cards.length}</span></div>
          <form class="rbq-cform" id="md-cform">
            <textarea name="q" placeholder="Question" rows="2" required></textarea>
            <textarea name="a" placeholder="Réponse" rows="2" required></textarea>
            <button class="btn primary">Ajouter la carte</button>
          </form>
          <ul class="rbq-cards">${cards.map((c) => `<li>
            <details><summary><span class="rbq-box" title="Boîte ${c.box || 1} sur 5">${'●'.repeat(c.box || 1)}${'○'.repeat(5 - (c.box || 1))}</span> ${esc(c.q)}</summary><p>${esc(c.a).replace(/\n/g, '<br>')}</p></details>
            <button class="btn sm" data-cdel="${c.id}" aria-label="Supprimer la carte">×</button></li>`).join('') || '<li class="empty-sm">Transforme tes notes en questions : c’est la meilleure façon de les retenir.</li>'}</ul>
        </section>
      </div>
    </div>
    <p class="rbq-del"><button class="btn danger" id="md-del">Supprimer ce module</button></p>`;

  // Titre
  const saveTitle = U.debounce(async (v) => { await edit((x) => { x.title = v.trim() || 'Module'; }); }, 400);
  view.querySelector('#md-title').oninput = (e) => saveTitle(e.target.value);
  // Statut
  view.querySelectorAll('[data-st]').forEach((b) => (b.onclick = async () => {
    await edit((x) => { x.status = b.dataset.st; });
    if (b.dataset.st === 'done') toast('🟢 Module maîtrisé, bravo !');
    redraw();
  }));
  // Notes
  const saveNotes = U.debounce(async (v) => { await edit((x) => { x.notes = v; }); }, 500);
  setCleanup(async () => { await saveTitle.flush(); await saveNotes.flush(); });
  const drawNotes = async () => {
    const el = view.querySelector('#md-notes');
    const cur = await db.get('study', id);
    view.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', (b.dataset.mode === 'read') === reading));
    if (reading) {
      el.innerHTML = `<div class="note-read">${renderBody(cur.notes, [])}</div>`;
    } else {
      el.innerHTML = `<textarea class="rbq-notes" placeholder="Écris ici tes notes de cours importantes…">${esc(cur.notes || '')}</textarea>`;
      el.querySelector('textarea').oninput = (e) => saveNotes(e.target.value);
    }
  };
  view.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = async () => { await saveNotes.flush(); reading = b.dataset.mode === 'read'; drawNotes(); }));
  await drawNotes();
  // Points clés
  view.querySelector('#md-kform').onsubmit = async (e) => {
    e.preventDefault();
    const v = e.target.k.value.trim();
    if (!v) return;
    await saveNotes.flush();
    await edit((x) => { x.keys = [...(x.keys || []), { id: U.uid(), text: v }]; });
    await redraw();
    view.querySelector('#md-kform input')?.focus();
  };
  view.querySelectorAll('[data-kdel]').forEach((b) => (b.onclick = async () => {
    await saveNotes.flush();
    await edit((x) => { x.keys = (x.keys || []).filter((k) => k.id !== b.dataset.kdel); });
    redraw();
  }));
  // Cartes
  view.querySelector('#md-cform').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, q = f.q.value.trim(), a = f.a.value.trim();
    if (!q || !a) return;
    await saveNotes.flush();
    await db.put('study', { id: U.uid(), kind: 'card', moduleId: id, q, a, box: 1, due: iso(new Date()), right: 0, wrong: 0, createdAt: Date.now() });
    toast('🃏 Carte ajoutée');
    await redraw();
    view.querySelector('#md-cform textarea')?.focus();
  };
  view.querySelectorAll('[data-cdel]').forEach((b) => (b.onclick = async () => { await saveNotes.flush(); await db.del('study', b.dataset.cdel); redraw(); }));
  view.querySelector('#md-practice').onclick = async () => { await saveNotes.flush(); review(ctx, cards, m.title, redraw); };

  // Éléments du Cerveau (idées, photos, captures…) rattachés au module
  const drawBrain = async () => {
    const el = view.querySelector('#md-brain');
    if (!el) return;
    const cur = await db.get('study', id);
    const all = await brain.allNotes();
    const linked = (cur.noteIds || []).map((nid) => all.find((n) => n.id === nid)).filter(Boolean);
    el.innerHTML = `<div class="card-head"><h2>🧠 Du Cerveau</h2><button class="btn" id="md-addnote">+ Ajouter depuis le Cerveau</button></div>
      ${linked.length ? `<div class="rbq-notes-grid">${linked.map((n) => {
        const im = images.refsIn(n.body);
        return `<div class="rbq-note">
          <a href="#/note/${n.id}" class="rbq-note-link">
            ${im.length ? `<img data-img="${im[0]}" alt="" loading="lazy">` : ''}
            <b>${brain.typeOf(n.type).icon} ${esc(n.title || 'Sans titre')}</b>
            <small class="muted">${esc(brain.excerpt(n.body, 110))}</small>
          </a>
          <button class="btn sm" data-unlink="${n.id}" aria-label="Retirer du module" title="Retirer du module (la note reste dans le Cerveau)">×</button>
        </div>`;
      }).join('')}</div>`
        : '<p class="empty-sm">Rattache ici ce que tu as capturé dans le Cerveau pour ce module : idées, photos du cours, captures d’écran, ressources.</p>'}`;
    el.querySelector('#md-addnote').onclick = () => pickNotes(ctx, cur.noteIds || [], async (ids) => {
      await edit((x) => { x.noteIds = [...new Set([...(x.noteIds || []), ...ids])]; });
      toast(`🧠 ${ids.length} élément${ids.length > 1 ? 's' : ''} ajouté${ids.length > 1 ? 's' : ''} au module`);
      drawBrain();
    });
    el.querySelectorAll('[data-unlink]').forEach((b) => (b.onclick = async () => {
      await edit((x) => { x.noteIds = (x.noteIds || []).filter((nid) => nid !== b.dataset.unlink); });
      drawBrain();
    }));
  };
  await drawBrain();
  view.querySelector('#md-del').onclick = async () => {
    if (!(await confirmBox(`Supprimer le module « ${m.title} », ses notes et ses ${cards.length} carte(s) ?`))) return;
    for (const c of cards) await db.del('study', c.id);
    await db.del('study', id);
    location.hash = '#/rbq';
  };
}

/** Petite carte pour la page Aujourd'hui (seulement s'il y a quelque chose à faire). */
export async function todayCard(el) {
  if (!el) return;
  const { daysLeft, due, conf, modules, done } = await stats();
  el.hidden = false;
  el.innerHTML = `<div class="card-head"><h2>📘 ${esc(conf.name || 'Cours RBQ')}</h2><a href="#/rbq">Ouvrir →</a></div>
    <p>${daysLeft > 0 ? `<b>${daysLeft}</b> jour${daysLeft > 1 ? 's' : ''} avant l’examen · ` : daysLeft === null ? '📅 <a href="#/rbq">Ajoute la date de ton examen</a> · ' : ''}${done}/${modules.length} modules maîtrisés</p>
    ${due ? `<a class="btn primary" href="#/rbq">🃏 ${due} carte${due > 1 ? 's' : ''} à réviser</a>` : '<p class="muted">Aucune carte à revoir aujourd’hui 👍</p>'}`;
}
