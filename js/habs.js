// Canadiens de Montréal : dernier résultat, prochain match, classement, statistiques et nouvelles.
// Données : API publique d'ESPN (sans clé, accessible depuis le navigateur). Mises en cache 15 min.

import { db } from './db.js';
import * as U from './util.js';

const { esc } = U;
const TEAM = 'mtl', TEAM_ID = '10';
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl';
const TTL = 15 * 60_000;
const logo = (abbr) => `https://a.espncdn.com/i/teamlogos/nhl/500/${String(abbr).toLowerCase()}.png`;
const getJSON = async (u) => {
  const r = await fetch(u.replace(/^http:/, 'https:'));
  if (!r.ok) throw new Error('ESPN ' + r.status);
  return r.json();
};

// Noms d'équipes en français quand ils diffèrent
const FR = { MTL: 'Canadiens', TOR: 'Maple Leafs', BOS: 'Bruins', OTT: 'Sénateurs', TB: 'Lightning', FLA: 'Panthers', DET: 'Red Wings', BUF: 'Sabres', NYR: 'Rangers', NYI: 'Islanders', NJ: 'Devils', PHI: 'Flyers', PIT: 'Penguins', WSH: 'Capitals', CAR: 'Hurricanes', CBJ: 'Blue Jackets', COL: 'Avalanche', DAL: 'Stars', MIN: 'Wild', WPG: 'Jets', NSH: 'Predators', STL: 'Blues', CHI: 'Blackhawks', UTA: 'Mammoth', VGK: 'Golden Knights', EDM: 'Oilers', CGY: 'Flames', VAN: 'Canucks', SEA: 'Kraken', LA: 'Kings', ANA: 'Ducks', SJ: 'Sharks' };
const nameOf = (t) => FR[t.abbreviation] || t.shortDisplayName || t.abbreviation;
const DIV = { 'Atlantic Division': 'Atlantique', 'Metropolitan Division': 'Métropolitaine', 'Central Division': 'Centrale', 'Pacific Division': 'Pacifique' };
const ord = (n) => (n === 1 ? '1er' : `${n}e`);
const fmtDay = (d) => d.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtHour = (d) => d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');

/* ---------- Données ---------- */
async function fetchAll() {
  const [sched, stand, team, leaders] = await Promise.all([
    getJSON(`${SITE}/teams/${TEAM}/schedule`),
    getJSON('https://site.api.espn.com/apis/v2/sports/hockey/nhl/standings?level=3'),
    getJSON(`${SITE}/teams/${TEAM}/statistics`).catch(() => null),
    getJSON(`https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl/seasons/${new Date().getMonth() >= 7 ? new Date().getFullYear() + 1 : new Date().getFullYear()}/types/2/teams/${TEAM_ID}/leaders`).catch(() => null),
  ]);

  // Matchs : dernier résultat, 5 derniers, prochain
  const games = (sched.events || []).map((e) => {
    const c = e.competitions[0];
    const me = c.competitors.find((x) => x.team.abbreviation === 'MTL');
    const op = c.competitors.find((x) => x !== me);
    return {
      date: e.date, done: !!c.status.type.completed, detail: c.status.type.detail || '',
      home: me.homeAway === 'home', win: !!me.winner,
      us: me.score?.value ?? null, them: op.score?.value ?? null,
      op: { abbr: op.team.abbreviation, name: nameOf(op.team) },
      link: (e.links || []).find((l) => l.rel.includes('summary') && l.rel.includes('desktop'))?.href || '',
      tv: (c.broadcasts || []).map((b) => b.media?.shortName).filter(Boolean),
    };
  });
  const past = games.filter((g) => g.done);
  const next = games.filter((g) => !g.done).slice(0, 3);

  // Classement : division Atlantique (et rang dans l'Est)
  const stat = (e, n) => e.stats.find((s) => s.name === n);
  const row = (e) => ({ abbr: e.team.abbreviation, name: nameOf(e.team), gp: stat(e, 'gamesPlayed')?.value || 0, w: stat(e, 'wins')?.value || 0, l: stat(e, 'losses')?.value || 0, otl: stat(e, 'otLosses')?.value || 0, pts: stat(e, 'points')?.value || 0, diff: stat(e, 'pointDifferential')?.displayValue || '', streak: stat(e, 'streak')?.displayValue || '', l10: ((stat(e, 'Last Ten Games') || e.stats.find((s) => s.abbreviation === 'L10'))?.displayValue || '').replace(/,.*/, ''), home: e.stats.find((s) => s.abbreviation === 'HOME')?.displayValue || '', road: e.stats.find((s) => s.abbreviation === 'AWAY')?.displayValue || '', gf: stat(e, 'pointsFor')?.value || 0, ga: stat(e, 'pointsAgainst')?.value || 0 });
  const byPts = (a, b) => b.pts - a.pts || a.gp - b.gp || b.w - a.w;
  let division = null, confRank = 0, confName = '';
  for (const conf of stand.children || []) {
    const all = (conf.children || []).flatMap((d) => d.standings.entries.map(row)).sort(byPts);
    for (const d of conf.children || []) {
      if (d.standings.entries.some((e) => e.team.abbreviation === 'MTL')) {
        division = { name: DIV[d.name] || d.name, rows: d.standings.entries.map(row).sort(byPts) };
        confRank = all.findIndex((r) => r.abbr === 'MTL') + 1;
        confName = /east/i.test(conf.name) ? 'l’Est' : 'l’Ouest';
      }
    }
  }

  // Statistiques d'équipe
  const tstat = {};
  for (const c of team?.results?.stats?.categories || []) for (const s of c.stats) tstat[s.name] = s.displayValue;

  // Meneurs : points (patineurs) et gardiens. Les noms viennent d'une 2e requête (gardés en cache longtemps).
  const players = {};
  const idOf = (ref) => ref?.match(/athletes\/(\d+)/)?.[1];
  for (const cat of leaders?.categories || []) {
    for (const l of cat.leaders || []) {
      const id = idOf(l.athlete?.$ref);
      if (!id) continue;
      (players[id] ||= { id, ref: l.athlete.$ref })[cat.name] = l.displayValue;
    }
  }
  const skaters = Object.values(players).filter((p) => p.points != null).sort((a, b) => Number(b.points) - Number(a.points) || Number(b.goals || 0) - Number(a.goals || 0)).slice(0, 10);
  const goalies = Object.values(players).filter((p) => p.wins != null || p.savePct != null).sort((a, b) => Number(b.wins || 0) - Number(a.wins || 0)).slice(0, 3);
  const names = (await db.get('cache', 'habs-names'))?.map || {};
  await Promise.all([...skaters, ...goalies].filter((p) => !names[p.id]).map(async (p) => {
    try { const a = await getJSON(p.ref); names[p.id] = { name: a.displayName, pos: a.position?.abbreviation || '', num: a.jersey || '' }; } catch { /* nom manquant : affiché « Joueur » */ }
  }));
  await db.put('cache', { map: names }, 'habs-names');
  const withName = (p) => ({ ...p, ...(names[p.id] || { name: 'Joueur', pos: '', num: '' }), ref: undefined });

  return {
    at: Date.now(),
    record: sched.team?.recordSummary || '',
    season: sched.requestedSeason?.displayName || '',
    past: past.slice(-5).reverse(), next, division, confRank, confName,
    tstat, skaters: skaters.map(withName), goalies: goalies.map(withName),
  };
}

export async function load(force = false) {
  const cache = await db.get('cache', 'habs');
  if (!force && cache && Date.now() - cache.at < TTL) return cache;
  try {
    const d = await fetchAll();
    await db.put('cache', d, 'habs');
    return d;
  } catch (err) {
    if (cache) return { ...cache, stale: true };
    throw err;
  }
}

/* ---------- Affichage ---------- */
const scoreLine = (g) => {
  const ot = /SO/.test(g.detail) ? ' (t.b.)' : /OT/.test(g.detail) ? ' (prol.)' : '';
  return `${g.win ? 'Victoire' : 'Défaite'} ${g.us}-${g.them}${ot}`;
};

export function render(d, newsItems = []) {
  const last = d.past[0];
  const me = d.division?.rows.find((r) => r.abbr === 'MTL');
  const divRank = d.division ? d.division.rows.findIndex((r) => r.abbr === 'MTL') + 1 : 0;
  const n = d.next[0];
  const ld = (r) => `<img src="${logo(r)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  const t = d.tstat;
  const gp = me?.gp || Number(t.games) || 0;
  const per = (v) => (gp ? (v / gp).toFixed(2).replace('.', ',') : '–');

  return `
  <section class="card habs-hero">
    <img class="habs-logo" src="${logo('mtl')}" alt="Canadiens de Montréal" referrerpolicy="no-referrer">
    <div class="habs-id">
      <p class="eyebrow">Saison ${esc(d.season)}${d.stale ? ' · hors ligne' : ''}</p>
      <h2>Canadiens de Montréal</h2>
      <p class="habs-rec"><b>${esc(d.record)}</b>${me ? ` · ${me.pts} pts` : ''}</p>
      <p class="muted">${divRank ? `${ord(divRank)} dans la division ${esc(d.division.name)}` : ''}${d.confRank ? ` · ${ord(d.confRank)} dans ${d.confName}` : ''}</p>
    </div>
    ${me ? `<div class="habs-chips"><span class="chip">Série : ${esc(me.streak.replace('W', 'V').replace('L', 'D'))}</span><span class="chip">10 derniers : ${esc(me.l10)}</span></div>` : ''}
  </section>

  <div class="habs-grid">
    ${last ? `<section class="card habs-last ${last.win ? 'win' : 'loss'}">
      <div class="card-head"><h2>Dernier résultat</h2><span class="muted">${esc(fmtDay(new Date(last.date)))}</span></div>
      <div class="habs-score">
        <div class="hs-team">${ld(last.home ? last.op.abbr : 'mtl')}<span>${esc(last.home ? last.op.name : 'Canadiens')}</span><b>${last.home ? last.them : last.us}</b></div>
        <span class="hs-at">@</span>
        <div class="hs-team">${ld(last.home ? 'mtl' : last.op.abbr)}<span>${esc(last.home ? 'Canadiens' : last.op.name)}</span><b>${last.home ? last.us : last.them}</b></div>
      </div>
      <p class="habs-verdict">${last.win ? '✅' : '❌'} ${esc(scoreLine(last))}</p>
      <div class="habs-form">${d.past.map((g) => `<span class="hf ${g.win ? 'w' : /OT|SO/.test(g.detail) ? 'o' : 'l'}" title="${esc(`${U.fmtShort(new Date(g.date))} · ${g.home ? 'vs' : '@'} ${g.op.name} · ${scoreLine(g)}`)}">${g.win ? 'V' : /OT|SO/.test(g.detail) ? 'DP' : 'D'}</span>`).join('')}<small class="muted">5 derniers matchs</small></div>
      ${last.link ? `<a class="btn sm-text" href="${esc(last.link)}" target="_blank" rel="noopener">Sommaire du match ↗</a>` : ''}
    </section>` : ''}

    ${n ? `<section class="card habs-next">
      <div class="card-head"><h2>Prochain match</h2></div>
      <div class="habs-nextline">${ld(n.op.abbr)}<div><b>${n.home ? 'vs' : '@'} ${esc(n.op.name)}</b>
        <p class="muted">${esc(fmtDay(new Date(n.date)))} · ${esc(fmtHour(new Date(n.date)))}${n.tv.length ? ` · 📺 ${esc(n.tv.slice(0, 2).join(', '))}` : ''}</p></div></div>
      ${d.next.slice(1).map((g) => `<p class="habs-later">${g.home ? 'vs' : '@'} ${esc(g.op.name)} <span class="muted">· ${esc(U.fmtShort(new Date(g.date)))} · ${esc(fmtHour(new Date(g.date)))}</span></p>`).join('')}
    </section>` : ''}
  </div>

  ${d.division ? `<section class="card habs-stand">
    <div class="card-head"><h2>Classement · division ${esc(d.division.name)}</h2></div>
    <div class="habs-table-wrap"><table class="habs-table">
      <thead><tr><th></th><th class="l">Équipe</th><th>PJ</th><th>V</th><th>D</th><th title="Défaites en prolongation ou en tirs de barrage">DP</th><th>PTS</th><th class="hide-s">DIFF</th><th class="hide-s">10 D.</th></tr></thead>
      <tbody>${d.division.rows.map((r, i) => `<tr class="${r.abbr === 'MTL' ? 'me' : ''} ${i === 2 ? 'cut' : ''}"><td>${i + 1}</td><td class="l">${ld(r.abbr)}${esc(r.name)}</td><td>${r.gp}</td><td>${r.w}</td><td>${r.l}</td><td>${r.otl}</td><td><b>${r.pts}</b></td><td class="hide-s">${esc(r.diff)}</td><td class="hide-s">${esc(r.l10)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="hint muted">Les 3 premiers de la division vont en séries, plus 2 meilleurs deuxièmes de ${esc(d.confName)} (« quatrièmes de division »).</p>
  </section>` : ''}

  <section class="card habs-stats">
    <div class="card-head"><h2>Statistiques</h2></div>
    <div class="kpis habs-kpis">
      <div class="kpi"><b>${me ? me.gf : esc(t.goals || '–')}</b><span>buts pour · ${me ? per(me.gf) : '–'}/match</span></div>
      <div class="kpi"><b>${me ? me.ga : esc(t.goalsAgainst || '–')}</b><span>buts contre · ${me ? per(me.ga) : '–'}/match</span></div>
      ${t.savePct ? `<div class="kpi"><b>${esc(t.savePct)}</b><span>% d’arrêts</span></div>` : ''}
      ${me ? `<div class="kpi"><b>${esc(me.home)}</b><span>à domicile · ${esc(me.road)} à l’étranger</span></div>` : ''}
    </div>
    ${d.skaters.length ? `<h3 class="habs-sub">Meneurs · patineurs</h3>
    <div class="habs-table-wrap"><table class="habs-table">
      <thead><tr><th class="l">Joueur</th><th>B</th><th>A</th><th>PTS</th><th class="hide-s">+/-</th></tr></thead>
      <tbody>${d.skaters.map((p) => `<tr><td class="l"><span class="habs-num">${esc(p.num)}</span>${esc(p.name)} <small class="muted">${esc(p.pos)}</small></td><td>${esc(p.goals ?? '0')}</td><td>${esc(p.assists ?? '0')}</td><td><b>${esc(p.points)}</b></td><td class="hide-s">${esc(p.plusMinus ?? '–')}</td></tr>`).join('')}</tbody>
    </table></div>` : ''}
    ${d.goalies.length ? `<h3 class="habs-sub">Gardiens</h3>
    <div class="habs-table-wrap"><table class="habs-table">
      <thead><tr><th class="l">Gardien</th><th>V</th><th>MOY</th><th>% ARR</th><th class="hide-s">BL</th></tr></thead>
      <tbody>${d.goalies.map((p) => `<tr><td class="l"><span class="habs-num">${esc(p.num)}</span>${esc(p.name)}</td><td>${esc(p.wins ?? '–')}</td><td>${esc(p.avgGoalsAgainst ?? '–')}</td><td>${esc(p.savePct ?? '–')}</td><td class="hide-s">${esc(p.shutouts ?? '0')}</td></tr>`).join('')}</tbody>
    </table></div>` : ''}
  </section>

  <section class="card habs-news">
    <div class="card-head"><h2>Nouvelles du Canadien</h2><span class="muted">tirées de tes sources LNH</span></div>
    <div id="habs-news">${newsItems.length ? '' : '<p class="empty-sm">Aucun article sur le Canadien dans tes sources LNH en ce moment.</p>'}</div>
  </section>
  <p class="hint muted">Résultats, classement et statistiques : ESPN · mis à jour ${esc(U.fmtShort(new Date(d.at)))} à ${esc(fmtHour(new Date(d.at)))}.</p>`;
}

/** Articles des sources LNH qui parlent du Canadien. */
// « Canadien » avec majuscule (l'équipe), pas « canadien » (l'adjectif)
export const isHabs = (x) => {
  const s = `${x.title} ${x.text || ''}`;
  return /\bCanadiens?\b|\bCH\b|\bTricolore\b|\bBleu-blanc-rouge\b/.test(s) || /\bhabs\b|\bmartin st-louis\b|\bkent hughes\b|\bsuzuki\b|\bcaufield\b|\bhutson\b|\bdemidov\b|\bslafkovsk/i.test(s);
};
