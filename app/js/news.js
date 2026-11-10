// Actualités : les grands titres de tes sources (fils RSS), en un seul endroit.
// - Radio-Canada se lit directement.
// - Les autres sites ne permettent pas à une page web de lire leur fil : on passe alors par
//   rss2json.com (service gratuit) qui ne reçoit que l'adresse publique du fil, rien de personnel.
// Les titres sont gardés 20 min en cache sur l'appareil (store « cache », jamais synchronisé).

import { db } from './db.js';
import * as U from './util.js';
import * as brain from './brain.js';

const { esc } = U;
export const DEFAULT_FEEDS = [
  { id: 'rc', name: 'Radio-Canada', url: 'https://ici.radio-canada.ca/info/rss/info/a-la-une', color: '#e11d48', on: true },
  { id: 'devoir', name: 'Le Devoir', url: 'https://www.ledevoir.com/rss/manchettes.xml', color: '#94a3b8', on: true },
  { id: 'presse', name: 'La Presse', url: 'https://www.lapresse.ca/actualites/rss', color: '#0c4a6e', on: true },
  { id: 'tva', name: 'TVA Nouvelles', url: 'https://www.tvanouvelles.ca/rss.xml', color: '#2563eb', on: true },
  { id: 'gnews', name: 'Google Actualités', url: 'https://news.google.com/rss?hl=fr-CA&gl=CA&ceid=CA:fr', color: '#16a34a', on: false },
];
const TTL = 20 * 60_000;
const CONVERTER = 'https://api.rss2json.com/v1/api.json?rss_url=';

export async function feeds() {
  const saved = (await db.get('settings', 'newsFeeds')) || [];
  const byId = Object.fromEntries(saved.map((f) => [f.id, f]));
  // Sources par défaut (avec ton choix activé/désactivé) puis tes sources ajoutées
  return [...DEFAULT_FEEDS.map((f) => ({ ...f, ...(byId[f.id] || {}) })), ...saved.filter((f) => f.custom)];
}
const saveFeeds = (list) => db.put('settings', list.map(({ id, name, url, color, on, custom }) => ({ id, name, url, color, on, custom })), 'newsFeeds');

const strip = (html = '') => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
};
const firstImg = (html = '') => html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || '';

function parseXML(text, feed) {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  const items = [...doc.querySelectorAll('item, entry')];
  return items.map((it) => {
    const get = (sel) => it.querySelector(sel)?.textContent?.trim() || '';
    const link = get('link') || it.querySelector('link')?.getAttribute('href') || '';
    const desc = get('description') || get('summary') || get('content');
    const img = it.querySelector('enclosure[type^="image"]')?.getAttribute('url')
      || [...it.getElementsByTagNameNS('*', 'content')].find((m) => m.getAttribute('url'))?.getAttribute('url')
      || [...it.getElementsByTagNameNS('*', 'thumbnail')][0]?.getAttribute('url') || firstImg(desc);
    return { title: strip(get('title')), link, date: Date.parse(get('pubDate') || get('published') || get('updated')) || 0, text: strip(desc).slice(0, 260), img, src: feed.id };
  });
}

// Sources qui refusent la lecture directe : on va directement au convertisseur (pas d'erreur inutile)
const NEEDS_PROXY = new Set(['devoir', 'presse', 'tva', 'gnews']);
const blocked = new Set(); // sources ajoutées qui ont refusé (pour la session)
async function fetchFeed(feed) {
  // 1) Lecture directe (si le site le permet)
  if (!NEEDS_PROXY.has(feed.id) && !blocked.has(feed.url)) {
    try {
      const r = await fetch(feed.url, { cache: 'no-store' });
      if (r.ok) {
        const items = parseXML(await r.text(), feed);
        if (items.length) return items;
      }
    } catch { blocked.add(feed.url); /* le site bloque la lecture directe : convertisseur */ }
  }
  // 2) Convertisseur RSS -> JSON
  const r = await fetch(CONVERTER + encodeURIComponent(feed.url));
  const d = await r.json();
  if (d.status !== 'ok') throw new Error(d.message || 'fil illisible');
  return (d.items || []).map((x) => ({
    title: strip(x.title), link: x.link, date: Date.parse((x.pubDate || '').replace(' ', 'T')) || 0,
    text: strip(x.description).slice(0, 260), img: x.thumbnail || x.enclosure?.link || firstImg(x.description), src: feed.id,
  }));
}

/** Tous les titres des sources activées (cache 20 min, ou force = true). */
export async function load(force = false) {
  const list = (await feeds()).filter((f) => f.on);
  const cache = (await db.get('cache', 'news')) || { at: 0, items: [], errors: [], key: '' };
  const key = list.map((f) => f.id + f.url).join('|');
  if (!force && cache.key === key && Date.now() - cache.at < TTL && cache.items.length) return cache;
  const errors = [];
  const results = await Promise.all(list.map((f) => fetchFeed(f).catch((e) => { errors.push(`${f.name} : ${e.message}`); return []; })));
  const seen = new Set();
  const items = results.flat().filter((x) => x.title && x.link && !seen.has(x.title) && seen.add(x.title)).sort((a, b) => b.date - a.date).slice(0, 120);
  const out = { at: Date.now(), items, errors, key };
  if (items.length) await db.put('cache', out, 'news');
  else if (cache.items.length) return { ...cache, errors }; // hors ligne : on garde les derniers titres
  return out;
}

const ago = (t) => {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'à l’instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return U.fmtShort(new Date(t));
};

/** Garde un article dans le Cerveau (note « Ressource » à classer). */
async function saveToBrain(it, feed) {
  const notes = await brain.allNotes();
  if (notes.some((n) => (n.body || '').includes(it.link))) return false;
  await brain.createNote({ title: it.title.slice(0, 80), body: `🔗 ${it.link}\n${feed?.name || ''}${it.date ? ' · ' + U.fmtShort(new Date(it.date)) : ''}\n\n${it.text ? '> ' + it.text : ''}\n\n#actualite`, type: 'ressource', inbox: true });
  return true;
}

/** Liens d'articles déjà gardés dans le Cerveau. */
async function savedLinks() {
  const out = new Set();
  for (const n of await brain.allNotes()) for (const m of (n.body || '').matchAll(/https?:\/\/\S+/g)) out.add(m[0]);
  return out;
}
const saveBtn = (x, saved, mini = false) => saved.has(x.link)
  ? `<button class="nw-save done" disabled title="Déjà dans ton Cerveau">✓${mini ? '' : ' Dans le Cerveau'}</button>`
  : `<button class="nw-save" data-save="${esc(x.link)}" title="Ajouter cet article au Cerveau (note Ressource, à classer)">🧠${mini ? '' : ' Au Cerveau'}</button>`;
function bindSave(root, items, byId, toast) {
  root.querySelectorAll('[data-save]').forEach((b) => (b.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const it = items.find((x) => x.link === b.dataset.save);
    if (!it) return;
    b.disabled = true;
    const ok = await saveToBrain(it, byId[it.src]);
    b.classList.add('done');
    b.textContent = b.textContent.includes('Cerveau') ? '✓ Dans le Cerveau' : '✓';
    toast(ok ? '🧠 Article ajouté au Cerveau (dans « À classer »)' : 'Déjà dans ton Cerveau');
  }));
}

let filter = 'all';
export async function renderPage(ctx, force = false) {
  const { view, toast, modal } = ctx;
  const fl = await feeds();
  const byId = Object.fromEntries(fl.map((f) => [f.id, f]));
  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Ce qui se passe</p><h1>Actualités</h1></div>
      <div class="head-actions"><button class="btn" id="nw-src">⚙ Sources</button><button class="btn" id="nw-ref">↻ Actualiser</button></div>
    </header>
    <div class="nw-filters filters" id="nw-filters"></div>
    <div id="nw-list"><div class="card empty-card"><p>Chargement des titres…</p></div></div>`;
  const draw = async (f) => {
    const data = await load(f);
    const counts = {};
    data.items.forEach((x) => (counts[x.src] = (counts[x.src] || 0) + 1));
    if (filter !== 'all' && !counts[filter]) filter = 'all';
    $('#nw-filters').innerHTML = `<button class="chip-btn ${filter === 'all' ? 'on' : ''}" data-nf="all">Toutes <small>${data.items.length}</small></button>`
      + fl.filter((x) => x.on && counts[x.id]).map((x) => `<button class="chip-btn ${filter === x.id ? 'on' : ''}" data-nf="${x.id}"><i class="nw-dot" style="--c:${esc(x.color)}"></i>${esc(x.name)} <small>${counts[x.id]}</small></button>`).join('')
      + `<span class="muted nw-at">Mis à jour ${ago(data.at)}</span>`;
    const items = data.items.filter((x) => filter === 'all' || x.src === filter);
    const saved = await savedLinks();
    const [top, ...rest] = items;
    const card = (x, big = false) => `<article class="card nw-item ${big ? 'nw-top' : ''}">
        ${x.img ? `<a class="nw-img" href="${esc(x.link)}" target="_blank" rel="noopener"><img src="${esc(x.img)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>` : ''}
        <div class="nw-body">
          <p class="nw-meta"><i class="nw-dot" style="--c:${esc(byId[x.src]?.color || '#888')}"></i>${esc(byId[x.src]?.name || '')} · ${ago(x.date)}</p>
          <a class="nw-title" href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.title)}</a>
          ${x.text && big ? `<p class="nw-text">${esc(x.text)}</p>` : ''}
          ${saveBtn(x, saved)}
        </div>
      </article>`;
    $('#nw-list').innerHTML = items.length
      ? `${card(top, true)}<div class="nw-grid">${rest.map((x) => card(x)).join('')}</div>`
      : `<div class="card empty-card"><p>${data.errors.length ? 'Impossible de charger les actualités (connexion ?).' : 'Aucune source activée : choisis-en dans ⚙ Sources.'}</p></div>`;
    if (data.errors.length && items.length) $('#nw-list').insertAdjacentHTML('beforeend', `<p class="hint muted">Non chargé : ${data.errors.map(esc).join(' · ')}</p>`);
    $$('[data-nf]').forEach((b) => (b.onclick = () => { filter = b.dataset.nf; draw(false); }));
    bindSave(view, data.items, byId, toast);
  };
  const $ = (s) => view.querySelector(s), $$ = (s) => [...view.querySelectorAll(s)];
  $('#nw-ref').onclick = () => { $('#nw-list').innerHTML = '<div class="card empty-card"><p>Actualisation…</p></div>'; draw(true); };
  $('#nw-src').onclick = () => sourcesModal(modal, toast, () => renderPage(ctx, true));
  draw(force);
}

function sourcesModal(modal, toast, onDone) {
  modal('<h2>Sources d’actualités</h2><div id="nw-srcs"></div>', async (m, close) => {
    let list = await feeds();
    const draw = () => {
      m.querySelector('#nw-srcs').innerHTML = `<div class="nw-src-list">${list.map((f, i) => `<label class="check-line nw-src"><input type="checkbox" data-i="${i}" ${f.on ? 'checked' : ''}><i class="nw-dot" style="--c:${esc(f.color)}"></i><span>${esc(f.name)}</span>${f.custom ? `<button type="button" class="btn sm" data-rm="${i}" aria-label="Retirer">×</button>` : ''}</label>`).join('')}</div>
        <form class="nw-add" id="nw-add"><input name="name" placeholder="Nom (ex. Le Soleil)" required autocomplete="off"><input name="url" placeholder="Adresse du fil RSS (https://…)" required autocomplete="off" spellcheck="false"><button class="btn">Ajouter</button></form>
        <p class="hint muted">Astuce : la plupart des journaux ont un fil RSS (cherche « RSS » au bas de leur site).</p>
        <div class="modal-actions"><button class="btn primary" id="nw-ok">Enregistrer</button></div>`;
      m.querySelectorAll('[data-i]').forEach((c) => (c.onchange = () => { list[c.dataset.i].on = c.checked; }));
      m.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); list.splice(Number(b.dataset.rm), 1); draw(); }));
      m.querySelector('#nw-add').onsubmit = (e) => {
        e.preventDefault();
        let url = e.target.url.value.trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        list.push({ id: U.uid(), name: e.target.name.value.trim(), url, color: '#a855f7', on: true, custom: true });
        draw();
      };
      m.querySelector('#nw-ok').onclick = async () => { await saveFeeds(list); close(); toast('Sources enregistrées'); onDone(); };
    };
    draw();
  });
}

/** Petite carte « À la une » pour la page Aujourd'hui (3 titres). */
export async function todayCard(el, toast = () => {}) {
  if (!el) return;
  try {
    const data = await load();
    const fl = Object.fromEntries((await feeds()).map((f) => [f.id, f]));
    const saved = await savedLinks();
    el.innerHTML = `<div class="card-head"><h2>📰 À la une</h2><a href="#/news">Tout voir →</a></div>
      ${data.items.slice(0, 4).map((x) => `<div class="nw-mini-row"><a class="nw-mini" href="${esc(x.link)}" target="_blank" rel="noopener"><b>${esc(x.title)}</b><small class="muted">${esc(fl[x.src]?.name || '')} · ${ago(x.date)}</small></a>${saveBtn(x, saved, true)}</div>`).join('')
      || '<p class="empty-sm">Actualités indisponibles pour l’instant.</p>'}`;
    bindSave(el, data.items, fl, toast);
  } catch { el.innerHTML = '<div class="card-head"><h2>📰 À la une</h2><a href="#/news">Ouvrir →</a></div><p class="empty-sm">Actualités indisponibles hors ligne.</p>'; }
}
