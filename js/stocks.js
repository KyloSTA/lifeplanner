// 📈 Bourse : tes valeurs à suivre (indices, actions, devises, crypto, matières premières).
// Les cotes viennent de Yahoo Finance. Une page web ne peut pas les lire directement : on passe par
// allorigins.win (service gratuit) qui ne reçoit que la liste publique des symboles, rien de personnel.
// Ta liste est un réglage synchronisé (« stocks ») ; les cotes restent 5 min en cache sur l'appareil.

import { db } from './db.js';
import * as U from './util.js';

const { esc } = U;
const KEY = 'stocks', CACHE = 'stockQuotes', TTL = 5 * 60_000;
export const DEFAULT_STOCKS = [
  { s: '^GSPTSE', n: 'TSX (Toronto)' },
  { s: '^GSPC', n: 'S&P 500' },
  { s: '^IXIC', n: 'Nasdaq' },
  { s: '^DJI', n: 'Dow Jones' },
  { s: 'CADUSD=X', n: 'Dollar canadien ($ US)' },
  { s: 'CL=F', n: 'Pétrole (WTI)' },
  { s: 'GC=F', n: 'Or' },
  { s: 'BTC-CAD', n: 'Bitcoin ($ CA)' },
];
const timed = (u) => fetch(u, { signal: AbortSignal.timeout?.(25_000) });
const PROXIES = [
  (u) => timed('https://api.allorigins.win/raw?url=' + encodeURIComponent(u)).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
  (u) => timed('https://api.allorigins.win/get?url=' + encodeURIComponent(u)).then((r) => r.json()).then((d) => JSON.parse(d.contents)),
];
// Les deux accès en même temps : le premier qui répond gagne (le service est parfois lent)
async function getJSON(url) {
  for (let tryNo = 0; tryNo < 2; tryNo++) { // une 2e tentative : le service a des ratés passagers
    try { return await Promise.any(PROXIES.map((p) => p(url))); } catch { await new Promise((r) => setTimeout(r, 1500)); }
  }
  throw new Error('indisponible');
}

export async function list() { return (await db.get('settings', KEY)) || DEFAULT_STOCKS.map((x) => ({ ...x })); }
const save = (l) => db.put('settings', l.map(({ s, n }) => ({ s, n })), KEY);

// Périodes : [id, range Yahoo, intervalle, étiquette]
export const RANGES = [['1d', '1d', '15m', '24H'], ['5d', '5d', '1h', '5J'], ['1mo', '1mo', '1d', '1M'], ['6mo', '6mo', '1d', '6M'], ['ytd', 'ytd', '1d', 'YTD'], ['1y', '1y', '1wk', '1A']];
const RANGE_LS = 'lp.skRange';
const getRange = () => { try { const r = localStorage.getItem(RANGE_LS); return RANGES.some(([k]) => k === r) ? r : '1d'; } catch { return '1d'; } };
const setRange = (r) => { try { localStorage.setItem(RANGE_LS, r); } catch { /* ignore */ } };

/** Cotes sur une période : { symbole: { price, prev, pct, pts } } (cache 5 min par période). */
export async function quotes(syms, force = false, range = '1d', onPart = null) {
  const [, yr, iv] = RANGES.find(([k]) => k === range) || RANGES[0];
  const ck = `${CACHE}:${range}`;
  const c = await db.get('cache', ck);
  const want = syms.join(',');
  if (!force && c && !c.partial && c.want === want && Date.now() - c.at < TTL) return c;
  const out = {};
  // Petits lots en parallèle : le service gratuit répond plus vite à de petites demandes
  const parts = [];
  for (let i = 0; i < syms.length; i += 4) parts.push(syms.slice(i, i + 4));
  const take = (d) => {
    for (const [k, v] of Object.entries(d || {})) {
      const closes = (v.close || []).filter((x) => x != null);
      const price = (range === '1d' ? v.fulldayPrice : null) ?? closes.at(-1);
      const prev = v.chartPreviousClose ?? v.previousClose ?? closes[0];
      if (price == null) continue;
      const pct = range === '1d' && v.fulldayChangePercent != null ? v.fulldayChangePercent : prev ? ((price - prev) / prev) * 100 : 0;
      // Au plus 60 points pour la mini-courbe
      const step = Math.max(1, Math.ceil(closes.length / 60));
      const pts = closes.filter((_, j) => j % step === 0 || j === closes.length - 1);
      out[k] = { price, prev, pct, pts };
    }
  };
  // Chaque lot s'affiche dès qu'il arrive (onPart)
  const got = await Promise.allSettled(parts.map((part) => getJSON(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(part.join(','))}&range=${yr}&interval=${iv}`).then((d) => { take(d); onPart?.({ ...out }); })));
  if (!got.some((g) => g.status === 'fulfilled')) throw new Error('indisponible');
  const res = { want, at: Date.now(), q: out, partial: got.some((g) => g.status === 'rejected') };
  await db.put('cache', res, ck);
  return res;
}

/** Recherche de symboles (« shopify », « banque royale », « BTC »…) */
export async function search(q) {
  const d = await getJSON(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&lang=fr-CA&region=CA`);
  return (d.quotes || []).filter((x) => x.symbol).map((x) => ({ s: x.symbol, n: x.shortname || x.longname || x.symbol, ex: x.exchDisp || '', type: x.typeDisp || '' }));
}


const fmtPrice = (v) => (v >= 1000 ? v.toLocaleString('fr-CA', { maximumFractionDigits: 0 }) : v.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: v < 10 ? 4 : 2 }));
const fmtPct = (p) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const yLink = (s) => `https://ca.finance.yahoo.com/quote/${encodeURIComponent(s)}`;

/** Mini-courbe de la période (ligne pointillée : le niveau de départ). */
function spark(pts, prev) {
  if (!pts || pts.length < 2) return '';
  const W = 120, H = 30;
  const all = prev != null ? [...pts, prev] : pts;
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const y = (v) => (H - 2 - ((v - lo) / span) * (H - 4)).toFixed(1);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * W).toFixed(1)} ${y(v)}`).join('');
  return `<svg class="sk-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${prev != null ? `<line x1="0" x2="${W}" y1="${y(prev)}" y2="${y(prev)}" class="sk-base"/>` : ''}<path d="${d}"/></svg>`;
}

/** Panneau des cotes, dessiné dans el. */
export async function drawPanel(el, { modal, toast }, force = false) {
  const l = await list();
  const range = getRange();
  const label = RANGES.find(([k]) => k === range)[3];
  const head = `<div class="card-head sk-head"><h2>📈 Valeurs suivies</h2>
      <div class="seg seg-sm sk-ranges" role="group" aria-label="Période">${RANGES.map(([k, , , lb]) => `<button type="button" data-rg="${k}" class="${k === range ? 'on' : ''}" aria-pressed="${k === range}">${lb}</button>`).join('')}</div>
      <span class="muted" id="sk-at"></span><button type="button" class="btn sm-text" id="sk-edit">✎ Modifier</button></div>`;
  const tiles = (q = {}) => l.map((x) => {
    const v = q[x.s];
    const dir = !v ? '' : v.pct > 0 ? 'up' : v.pct < 0 ? 'down' : '';
    return `<a class="sk-tile ${dir}" href="${yLink(x.s)}" target="_blank" rel="noopener" title="${esc(x.s)} · variation sur ${label}">
      <span class="sk-name">${esc(x.n)}</span>
      <b class="sk-price">${v ? fmtPrice(v.price) : '…'}</b>
      <span class="sk-pct">${v ? `${v.pct > 0 ? '▲' : v.pct < 0 ? '▼' : '■'} ${fmtPct(v.pct)}` : esc(x.s)}</span>
      ${v ? spark(v.pts, v.prev) : ''}</a>`;
  }).join('');
  el.innerHTML = `${head}<div class="sk-grid">${l.length ? tiles() : '<p class="empty-sm">Aucune valeur : ajoute-en avec ✎ Modifier.</p>'}</div>`;
  el.querySelector('#sk-edit').onclick = () => editModal(modal, toast, () => drawPanel(el, { modal, toast }, true));
  el.querySelectorAll('[data-rg]').forEach((b) => (b.onclick = () => { if (b.dataset.rg === range) return; setRange(b.dataset.rg); drawPanel(el, { modal, toast }); }));
  if (!l.length) return;
  // Dernières cotes connues tout de suite, puis les fraîches
  const old = await db.get('cache', `${CACHE}:${range}`);
  if (old?.q) {
    el.querySelector('.sk-grid').innerHTML = tiles(old.q);
    el.querySelector('#sk-at').textContent = `Cotes de ${U.fmtTime(new Date(old.at))} · mise à jour…`;
  } else el.querySelector('#sk-at').textContent = 'Chargement…';
  try {
    const r = await quotes(l.map((x) => x.s), force, range, (part) => { if (el.isConnected && getRange() === range) el.querySelector('.sk-grid').innerHTML = tiles({ ...(old?.q || {}), ...part }); });
    if (!el.isConnected || getRange() !== range) return;
    el.querySelector('.sk-grid').innerHTML = tiles(r.q);
    el.querySelector('#sk-at').textContent = `Mis à jour ${U.fmtTime(new Date(r.at))} · cotes différées`;
  } catch {
    if (el.isConnected && getRange() === range) el.querySelector('#sk-at').textContent = 'Cotes indisponibles pour le moment';
  }
}

function editModal(modal, toast, onDone) {
  modal(`<h2>✎ Valeurs suivies</h2>
    <form class="sk-find" id="sk-find"><input name="q" placeholder="Chercher : Shopify, Banque Royale, XEQT, BTC…" autocomplete="off" required><button class="btn">Chercher</button></form>
    <div class="sk-results" id="sk-res"></div>
    <ul class="sk-edit" id="sk-list"></ul>
    <div class="modal-actions"><button type="button" class="btn" id="sk-def">Valeurs par défaut</button><button class="btn primary" data-close>Terminé</button></div>`, (m, close) => {
    let l = [];
    const drawList = async () => {
      l = await list();
      m.querySelector('#sk-list').innerHTML = l.map((x, i) => `<li><input value="${esc(x.n)}" data-ren="${i}" aria-label="Nom affiché pour ${esc(x.s)}"><small class="muted">${esc(x.s)}</small>
        <button type="button" class="btn sm-text" data-up="${i}" ${i ? '' : 'disabled'} aria-label="Monter">↑</button><button type="button" class="btn sm-text" data-down="${i}" ${i < l.length - 1 ? '' : 'disabled'} aria-label="Descendre">↓</button><button type="button" class="btn sm-text" data-del="${i}" aria-label="Retirer ${esc(x.n)}">✕</button></li>`).join('') || '<li class="muted">Aucune valeur.</li>';
      m.querySelectorAll('[data-ren]').forEach((inp) => (inp.onchange = async () => { l[+inp.dataset.ren].n = inp.value.trim() || l[+inp.dataset.ren].s; await save(l); }));
      m.querySelectorAll('[data-up]').forEach((b) => (b.onclick = async () => { const i = +b.dataset.up; [l[i - 1], l[i]] = [l[i], l[i - 1]]; await save(l); drawList(); }));
      m.querySelectorAll('[data-down]').forEach((b) => (b.onclick = async () => { const i = +b.dataset.down; [l[i + 1], l[i]] = [l[i], l[i + 1]]; await save(l); drawList(); }));
      m.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { l.splice(+b.dataset.del, 1); await save(l); drawList(); }));
    };
    drawList();
    m.querySelector('#sk-find').onsubmit = async (e) => {
      e.preventDefault();
      const res = m.querySelector('#sk-res');
      res.innerHTML = '<p class="muted">Recherche…</p>';
      const q = e.target.q.value.trim();
      // Un symbole tapé tel quel (RY.TO, AAPL, XEQT.TO, BTC-CAD…) peut toujours être ajouté, même si la recherche ne répond pas
      const asSym = /^[\^]?[A-Za-z0-9.=-]{1,15}$/.test(q) ? [{ s: q.toUpperCase(), n: q.toUpperCase(), ex: 'symbole tapé', type: '' }] : [];
      try {
        const found = await search(q).catch(() => null);
        const r = [...(found || []), ...asSym.filter((a) => !(found || []).some((x) => x.s === a.s))];
        res.innerHTML = (r.length ? r.map((x, i) => `<button type="button" class="sk-hit" data-add="${i}"><b>${esc(x.n)}</b><small class="muted">${esc(x.s)}${x.ex ? ' · ' + esc(x.ex) : ''}${x.type ? ' · ' + esc(x.type) : ''}</small><span>＋</span></button>`).join('') : '<p class="muted">Aucun résultat.</p>')
          + (found ? '' : '<p class="hint muted">La recherche ne répond pas pour le moment. Tu peux taper le symbole directement : <b>RY.TO</b> (Bourse de Toronto : ajoute .TO), <b>AAPL</b>, <b>XEQT.TO</b>, <b>BTC-CAD</b>.</p>');
        res.querySelectorAll('[data-add]').forEach((b) => (b.onclick = async () => {
          const x = r[+b.dataset.add];
          if (l.some((y) => y.s === x.s)) { toast('Déjà dans ta liste'); return; }
          l.push({ s: x.s, n: x.n });
          await save(l);
          toast(`📈 ${x.n} ajouté`);
          drawList();
        }));
      } catch { res.innerHTML = '<p class="warn-text">Recherche indisponible pour le moment. Réessaie dans un instant.</p>'; }
    };
    m.querySelector('#sk-def').onclick = async () => { await save(DEFAULT_STOCKS); drawList(); };
    m.querySelector('[data-close]').addEventListener('click', () => setTimeout(onDone, 0));
  });
}
