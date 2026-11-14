// Activités autour de toi (onglet du Planificateur) : ce qui est à venir ou en cours, à ajouter à ton agenda en un clic.
// Sources :
//  - Ville de Montréal (données ouvertes, sans clé) : bibliothèques, parcs, ateliers, activités d'arrondissement ;
//  - Ticketmaster (clé API gratuite, gardée sur cet appareil) : concerts, spectacles, sports, humour ;
//  - Canadiens de Montréal : matchs au Centre Bell (même source que l'onglet LNH).
// Réglages (settings « activitiesCfg ») : point de départ (Rive-Sud par défaut, ou ta position), rayon en km.

import { db } from './db.js';
import * as U from './util.js';
import * as habs from './habs.js';

const { esc, iso } = U;
const MTL = 'https://donnees.montreal.ca/api/3/action/datastore_search?resource_id=6decf611-6f11-4f34-bb36-324d804c9bad&limit=5000&fields=_id,titre,url_fiche,date_debut,date_fin,type_evenement,public_cible,cout,arrondissement,titre_adresse,emplacement,lat,long';
const TM = 'https://app.ticketmaster.com/discovery/v2/events.json';
const DEFAULT = { lat: 45.535, lon: -73.42, label: 'Rive-Sud (Longueuil – Sainte-Julie)', radius: 40 };
const TTL = 6 * 3600_000;
const CENTRE_BELL = { lat: 45.4961, lon: -73.5693, name: 'Centre Bell, Montréal' };

export const CATS = [
  ['all', 'Tout'], ['sport', '⚽ Sports et plein air'], ['show', '🎤 Spectacles et concerts'], ['family', '👨‍👩‍👧 Famille et gratuit'], ['learn', '🧠 Ateliers et conférences'],
];
const PERIODS = [['week', 'Cette semaine'], ['weekend', 'Ce week-end'], ['month', '30 jours']];

export async function config() { return { ...DEFAULT, ...((await db.get('settings', 'activitiesCfg')) || {}) }; }

/* ---------- Outils ---------- */
const rad = (d) => (d * Math.PI) / 180;
function km(a, b) {
  if (!a?.lat || !b?.lat) return null;
  const R = 6371, dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
const clean = (s) => (s && s !== 'nan' ? String(s).trim() : '');

/* ---------- Sources ---------- */
async function fromMontreal(today, until) {
  const r = await fetch(MTL);
  if (!r.ok) throw new Error('Ville de Montréal ' + r.status);
  const rows = (await r.json()).result?.records || [];
  return rows
    .filter((x) => x.date_fin >= today && x.date_debut <= until)
    .filter((x) => !/conseil|comité|consultation|collecte|séance/i.test(`${x.type_evenement} ${x.titre}`)) // réunions municipales : pas des activités
    .map((x) => {
      const type = clean(x.type_evenement), pub = clean(x.public_cible), cost = clean(x.cout);
      const cats = [];
      if (/sport|plein air|physique|vélo|patin|ski|course|yoga|danse|natation|marche/i.test(`${type} ${x.titre}`)) cats.push('sport');
      if (/spectacle|concert|musique|théâtre|cinéma|film|humour|festival|danse/i.test(`${type} ${x.titre}`)) cats.push('show');
      if (/famille|enfant|jeune|tout-petit|parent/i.test(`${pub} ${type}`) || /gratuit/i.test(cost)) cats.push('family');
      if (/atelier|conférence|exposition|formation|lecture|club|conte|cours|initiation|visite/i.test(`${type} ${x.titre}`)) cats.push('learn');
      return {
        id: 'mtl-' + x._id, src: 'mtl', title: clean(x.titre), url: clean(x.url_fiche),
        start: x.date_debut, end: x.date_fin, time: '', type, cats,
        place: [clean(x.titre_adresse), clean(x.arrondissement)].filter(Boolean).join(' · ') || clean(x.emplacement),
        cost: cost || '', geo: x.lat && x.lat !== 'nan' ? { lat: Number(x.lat), lon: Number(x.long) } : null,
      };
    });
}

async function fromTicketmaster(key, cfg, today) {
  const q = new URLSearchParams({ apikey: key, latlong: `${cfg.lat},${cfg.lon}`, radius: String(cfg.radius), unit: 'km', locale: '*', size: '150', sort: 'date,asc', startDateTime: `${today}T00:00:00Z` });
  const r = await fetch(`${TM}?${q}`);
  if (r.status === 401) throw new Error('Clé Ticketmaster refusée : vérifie-la dans ⚙ Réglages des activités.');
  if (!r.ok) throw new Error('Ticketmaster ' + r.status);
  const list = (await r.json())._embedded?.events || [];
  return list.map((e) => {
    const seg = e.classifications?.[0]?.segment?.name || '';
    const genre = e.classifications?.[0]?.genre?.name || '';
    const v = e._embedded?.venues?.[0];
    const cats = seg === 'Sports' ? ['sport'] : /Music|Arts/.test(seg) ? ['show'] : seg === 'Family' ? ['family'] : [];
    if (/comedy|humour|theatre/i.test(genre) && !cats.includes('show')) cats.push('show');
    const img = (e.images || []).filter((i) => i.ratio === '16_9').sort((a, b) => a.width - b.width).find((i) => i.width >= 300) || e.images?.[0];
    const price = e.priceRanges?.[0];
    return {
      id: 'tm-' + e.id, src: 'tm', title: e.name, url: e.url,
      start: e.dates?.start?.localDate, end: e.dates?.start?.localDate, time: (e.dates?.start?.localTime || '').slice(0, 5),
      type: [seg, genre].filter((x) => x && x !== 'Undefined').join(' · '), cats,
      place: [v?.name, v?.city?.name].filter(Boolean).join(', '), img: img?.url || '',
      cost: price ? `${Math.round(price.min)} $ et +` : '',
      geo: v?.location ? { lat: Number(v.location.latitude), lon: Number(v.location.longitude) } : null,
    };
  }).filter((x) => x.start);
}

async function fromCanadiens(until) {
  const d = await habs.load().catch(() => null);
  return (d?.upcoming || d?.next || []).filter((g) => g.home).map((g) => {
    const dt = new Date(g.date);
    return {
      id: 'habs-' + g.date, src: 'habs', title: `Canadiens vs ${g.op.name}`, url: g.link || 'https://www.nhl.com/fr/canadiens/schedule',
      start: iso(dt), end: iso(dt), time: `${U.pad(dt.getHours())}:${U.pad(dt.getMinutes())}`, type: 'Hockey LNH', cats: ['sport'],
      place: CENTRE_BELL.name, geo: CENTRE_BELL, cost: '', img: `https://a.espncdn.com/i/teamlogos/nhl/500/${g.op.abbr.toLowerCase()}.png`, logo: true,
    };
  }).filter((x) => x.start <= until);
}

/** Toutes les activités des 30 prochains jours (cache 6 h). */
export async function load(force = false) {
  const cfg = await config();
  const key = await db.get('settings', 'ticketmasterKey');
  const sig = `${cfg.lat},${cfg.lon},${cfg.radius},${key ? 'k' : ''}`;
  const cache = await db.get('cache', 'activities');
  if (!force && cache && cache.sig === sig && Date.now() - cache.at < TTL) return { ...cache, cfg, hasKey: !!key };
  const today = iso(new Date()), until = iso(U.addDays(new Date(), 30));
  const errors = [];
  const results = await Promise.all([
    fromMontreal(today, until).catch((e) => { errors.push('Ville de Montréal : ' + e.message); return []; }),
    key ? fromTicketmaster(key, cfg, today).catch((e) => { errors.push(e.message); return []; }) : [],
    fromCanadiens(until).catch(() => []),
  ]);
  const items = results.flat()
    .map((x) => ({ ...x, km: km(cfg, x.geo) }))
    .filter((x) => x.km === null || x.km <= cfg.radius || x.src === 'habs')
    .sort((a, b) => (a.start + (a.time || '99')).localeCompare(b.start + (b.time || '99')));
  const out = { at: Date.now(), sig, items, errors };
  if (items.length) await db.put('cache', out, 'activities');
  return { ...out, cfg, hasKey: !!key };
}

/* =========================================================
   Page
   ========================================================= */
let state = { cat: 'all', period: 'week', q: '', zone: 'rs' };
let gpsPos = null; // position GPS (mode « Près de moi »), demandée seulement quand tu choisis ce mode
const ZONES = [['rs', 'Rive-Sud d’abord'], ['mtl', 'Montréal'], ['gps', '📍 Près de moi']];
/** Rive-Sud (à l'est ou au sud du fleuve), île de Montréal, ou ailleurs. */
function zoneOf(x) {
  if (x.src === 'mtl' || x.src === 'habs') return 'mtl'; // données de la Ville de Montréal et Centre Bell : toujours Montréal
  const g = x.geo;
  if (!g?.lat) return 'other';
  if (g.lon > -73.515 || g.lat < 45.405) return 'rs';
  if (g.lat > 45.705) return 'other'; // Laval, Rive-Nord
  return 'mtl';
}
const SRC = { mtl: ['🏛', 'Ville de Montréal'], tm: ['🎫', 'Ticketmaster'], habs: ['🏒', 'Canadiens'] };

function inPeriod(x, period) {
  const t = new Date(), today = iso(t);
  let from = today, to;
  if (period === 'weekend') {
    const dow = t.getDay();
    const sat = dow === 0 ? U.addDays(t, -1) : U.addDays(t, (6 - dow + 7) % 7);
    from = dow === 0 ? today : iso(sat); to = iso(U.addDays(sat, 1));
  } else if (period === 'week') to = iso(U.addDays(t, 6));
  else to = iso(U.addDays(t, 30));
  return x.start <= to && x.end >= from;
}

export async function renderPage(ctx, hooks) {
  const { view } = ctx;
  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Planificateur</p><h1>Activités autour de toi</h1></div>
      <div class="head-actions">${hooks.tabs}
        <button class="btn" id="act-cfg" title="Lieu, rayon et Ticketmaster">⚙ Réglages</button>
        <button class="btn" id="act-ref" title="Actualiser">↻</button>
      </div>
    </header>
    <div class="act-bar">
      <div class="act-segs">
        <div class="seg" role="group" aria-label="Où">${ZONES.map(([k, l]) => `<button data-zone="${k}" class="${state.zone === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="seg" role="group" aria-label="Période">${PERIODS.map(([k, l]) => `<button data-period="${k}" class="${state.period === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      </div>
      <div class="filters">${CATS.map(([k, l]) => `<button class="chip-btn ${state.cat === k ? 'on' : ''}" data-cat="${k}">${l}</button>`).join('')}</div>
      <div class="act-search"><input type="search" id="act-q" placeholder="Rechercher (ex. hockey, marché, enfants)…" value="${esc(state.q)}" autocomplete="off"><span class="muted act-where" id="act-where"></span></div>
    </div>
    <div id="act-list"><div class="card empty-card"><p>Recherche des activités autour de toi…</p></div></div>`;
  const $ = (s) => view.querySelector(s), $$ = (s) => [...view.querySelectorAll(s)];
  let data = null;
  const PER_DAY = 10;
  const expanded = new Set();
  // Distance affichée et tri : depuis ta position en mode « Près de moi », sinon depuis la Rive-Sud
  const dist = (x) => (state.zone === 'gps' && gpsPos ? km(gpsPos, x.geo) : x.km);
  const near = (a, b) => (dist(a) ?? 999) - (dist(b) ?? 999) || (a.time || '99').localeCompare(b.time || '99');
  // Rive-Sud en priorité, puis spectacles et matchs, puis les plus proches
  const rank = (a, b) => (state.zone === 'rs' ? (zoneOf(a) !== 'rs') - (zoneOf(b) !== 'rs') : 0) || (a.src === 'mtl') - (b.src === 'mtl') || near(a, b);

  const draw = () => {
    if (!data) return;
    $('#act-where').textContent = state.zone === 'gps' ? (gpsPos ? `📍 Autour de ta position · ${data.cfg.radius} km` : '📍 Position en cours…') : `📍 ${data.cfg.label} · ${data.cfg.radius} km`;
    const q = state.q.toLowerCase().trim();
    const today = iso(new Date());
    const list = data.items.filter((x) => inPeriod(x, state.period) && (state.cat === 'all' || x.cats.includes(state.cat))
      && (!q || `${x.title} ${x.type} ${x.place}`.toLowerCase().includes(q))
      && (state.zone !== 'mtl' || zoneOf(x) === 'mtl')
      && (state.zone !== 'gps' || !gpsPos || (dist(x) ?? 0) <= data.cfg.radius));
    const ongoing = list.filter((x) => x.start < today && x.end >= today);
    const byDay = {};
    for (const x of list.filter((y) => !ongoing.includes(y))) (byDay[x.start] ||= []).push(x);
    const dayLabel = (d) => (d === today ? 'Aujourd’hui' : d === iso(U.addDays(new Date(), 1)) ? 'Demain' : U.parseISO(d).toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' }));
    const card = (x) => {
      const [ico, src] = SRC[x.src];
      const when = x.start === x.end || !x.end ? '' : `jusqu’au ${U.fmtShort(U.parseISO(x.end))}`;
      return `<article class="act ${x.src}">
        <div class="act-media">${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" class="${x.logo ? 'logo' : ''}">` : `<span>${ico}</span>`}</div>
        <div class="act-body">
          <small class="act-when">${x.time ? `🕒 ${esc(x.time.replace(':', ' h '))}` : 'Toute la journée'}${when ? ' · ' + esc(when) : ''}</small>
          <b>${esc(x.title)}</b>
          <small class="muted">${zoneOf(x) === 'rs' ? '<span class="act-zone rs">Rive-Sud</span> ' : zoneOf(x) === 'mtl' ? '<span class="act-zone">Montréal</span> ' : ''}${x.place ? '📍 ' + esc(x.place) : ''}${dist(x) !== null && dist(x) !== undefined ? ` · ${dist(x)} km` : ''}${x.cost ? ' · ' + esc(x.cost) : ''}</small>
          <small class="act-src">${ico} ${esc(src)}${x.type ? ' · ' + esc(x.type) : ''}</small>
        </div>
        <div class="act-acts">
          <button class="btn primary act-btn" data-add="${esc(x.id)}" title="Ajouter à ton agenda">+ Agenda</button>
          ${x.url ? `<a class="btn act-btn" href="${esc(x.url)}" target="_blank" rel="noopener">Voir ↗</a>` : ''}
        </div></article>`;
    };
    $('#act-list').innerHTML = (data.errors.length ? `<p class="hint muted">⚠ ${data.errors.map(esc).join(' · ')}</p>` : '')
      + (!data.hasKey ? `<div class="card act-tm-tip"><b>🎫 Concerts, spectacles et sports</b><p class="muted">Ajoute ta clé Ticketmaster gratuite pour voir aussi les spectacles et matchs autour de toi.</p><button class="btn" id="act-tm">Ajouter ma clé</button></div>` : '')
      // Expositions et activités de plusieurs jours : repliées, les plus proches d'abord
      + (ongoing.length ? `<details class="act-day act-ongoing"><summary><h3>En cours</h3><small class="muted">${ongoing.length} exposition${ongoing.length > 1 ? 's' : ''} et activité${ongoing.length > 1 ? 's' : ''} sur plusieurs jours</small></summary>
          ${[...ongoing].sort(rank).slice(0, 40).map(card).join('')}</details>` : '')
      + Object.entries(byDay).map(([d, xs]) => {
        const sorted = [...xs].sort(rank);
        const open = expanded.has(d);
        const shown = open ? sorted : sorted.slice(0, PER_DAY);
        return `<section class="act-day"><h3>${esc(dayLabel(d))} <small class="muted">${xs.length}</small></h3>${shown.map(card).join('')}
          ${sorted.length > PER_DAY ? `<button class="btn sm-text act-more" data-more="${d}">${open ? 'Voir moins' : `Voir les ${sorted.length - PER_DAY} autres`}</button>` : ''}</section>`;
      }).join('')
      || '<div class="card empty-card"><p>Aucune activité pour ces filtres. Essaie « 30 jours » ou une autre catégorie.</p></div>';
    $$('[data-add]').forEach((b) => (b.onclick = () => {
      const x = data.items.find((y) => y.id === b.dataset.add);
      if (!x) return;
      const [h, m] = (x.time || '09:00').split(':').map(Number);
      const end = `${U.pad(Math.min(h + 2, 23))}:${U.pad(m)}`;
      const day = x.start < today ? today : x.start;
      hooks.addEvent(day, { title: x.title, allDay: !x.time, start: x.time || '09:00', end, description: [x.place && '📍 ' + x.place, x.cost, x.url].filter(Boolean).join('\n') });
    }));
    $('#act-tm')?.addEventListener('click', () => settings(ctx, () => refresh(true)));
    $$('[data-more]').forEach((b) => (b.onclick = () => { expanded.has(b.dataset.more) ? expanded.delete(b.dataset.more) : expanded.add(b.dataset.more); draw(); }));
  };
  const refresh = async (force) => {
    $('#act-list').innerHTML = '<div class="card empty-card"><p>Recherche des activités autour de toi…</p></div>';
    data = await load(force);
    draw();
  };
  $$('[data-zone]').forEach((b) => (b.onclick = async () => {
    state.zone = b.dataset.zone;
    $$('[data-zone]').forEach((x) => x.classList.toggle('on', x === b));
    if (state.zone === 'gps' && !gpsPos) {
      draw();
      try {
        const p = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000, maximumAge: 600000 }));
        gpsPos = { lat: p.coords.latitude, lon: p.coords.longitude };
      } catch {
        ctx.toast('Position non disponible : autorise la localisation pour Life Planner', 'err');
        state.zone = 'rs';
        $$('[data-zone]').forEach((x) => x.classList.toggle('on', x.dataset.zone === 'rs'));
      }
    }
    draw();
  }));
  $$('[data-period]').forEach((b) => (b.onclick = () => { state.period = b.dataset.period; $$('[data-period]').forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
  $$('[data-cat]').forEach((b) => (b.onclick = () => { state.cat = b.dataset.cat; $$('[data-cat]').forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
  $('#act-q').oninput = (e) => { state.q = e.target.value; draw(); };
  $('#act-ref').onclick = () => refresh(true);
  $('#act-cfg').onclick = () => settings(ctx, () => refresh(true));
  refresh(false);
}

/* ---------- Réglages : lieu, rayon, clé Ticketmaster ---------- */
async function settings(ctx, onDone) {
  const cfg = await config();
  const key = (await db.get('settings', 'ticketmasterKey')) || '';
  ctx.modal(`<h2>Réglages des activités</h2>
    <form class="form" id="actf">
      <label>Autour de
        <select name="where"><option value="default">${esc(DEFAULT.label)}</option><option value="gps" ${cfg.label.startsWith('Ma position') ? 'selected' : ''}>📍 Ma position actuelle</option></select></label>
      <label>Rayon<select name="radius">${[10, 25, 40, 60, 100].map((r) => `<option value="${r}" ${cfg.radius === r ? 'selected' : ''}>${r} km</option>`).join('')}</select></label>
      <label>Clé API Ticketmaster (facultatif)<input name="key" value="${esc(key)}" placeholder="Ta « Consumer Key »" autocomplete="off" spellcheck="false"></label>
      <p class="hint muted">Pour l’obtenir (gratuit) : crée un compte sur <a href="https://developer.ticketmaster.com" target="_blank" rel="noopener">developer.ticketmaster.com</a>, puis dans « My Apps », copie la <b>Consumer Key</b>. Elle reste sur cet appareil.</p>
      <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div>
    </form>`, (m, close) => {
    const f = m.querySelector('form');
    f.onsubmit = async (e) => {
      e.preventDefault();
      let next = { ...DEFAULT, radius: Number(f.radius.value) };
      if (f.where.value === 'gps') {
        try {
          const p = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000, maximumAge: 600000 }));
          next = { ...next, lat: Math.round(p.coords.latitude * 1000) / 1000, lon: Math.round(p.coords.longitude * 1000) / 1000, label: 'Ma position' };
        } catch { ctx.toast('Position non disponible : je garde la Rive-Sud', 'err'); }
      }
      await db.put('settings', next, 'activitiesCfg');
      const k = f.key.value.trim();
      if (k) await db.put('settings', k, 'ticketmasterKey'); else await db.del('settings', 'ticketmasterKey');
      close();
      onDone();
    };
  });
}
