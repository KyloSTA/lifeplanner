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
const timed = (u) => fetch(u, { signal: AbortSignal.timeout?.(15_000) });
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

/** Cotes { symbole: { price, prev, pct } } (cache 5 min). */
export async function quotes(syms, force = false) {
  const c = await db.get('cache', CACHE);
  const want = syms.join(',');
  if (!force && c && c.want === want && Date.now() - c.at < TTL) return c;
  const out = {};
  for (let i = 0; i < syms.length; i += 20) { // l'API accepte 20 symboles à la fois
    const part = syms.slice(i, i + 20);
    const d = await getJSON(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(part.join(','))}&range=1d&interval=1d`);
    for (const [k, v] of Object.entries(d || {})) {
      const price = v.fulldayPrice ?? v.close?.at(-1);
      const prev = v.chartPreviousClose ?? v.previousClose;
      if (price == null) continue;
      out[k] = { price, prev, pct: v.fulldayChangePercent ?? (prev ? ((price - prev) / prev) * 100 : 0) };
    }
  }
  const res = { want, at: Date.now(), q: out };
  await db.put('cache', res, CACHE);
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

/** Panneau des cotes, dessiné dans el. */
export async function drawPanel(el, { modal, toast }, force = false) {
  const l = await list();
  const head = `<div class="card-head"><h2>📈 Valeurs suivies</h2><span class="muted" id="sk-at"></span><button type="button" class="btn sm-text" id="sk-edit">✎ Modifier</button></div>`;
  const tiles = (q = {}) => l.map((x) => {
    const v = q[x.s];
    const dir = !v ? '' : v.pct > 0 ? 'up' : v.pct < 0 ? 'down' : '';
    return `<a class="sk-tile ${dir}" href="${yLink(x.s)}" target="_blank" rel="noopener" title="${esc(x.s)}">
      <span class="sk-name">${esc(x.n)}</span>
      <b class="sk-price">${v ? fmtPrice(v.price) : '…'}</b>
      <span class="sk-pct">${v ? `${v.pct > 0 ? '▲' : v.pct < 0 ? '▼' : '■'} ${fmtPct(v.pct)}` : esc(x.s)}</span></a>`;
  }).join('');
  el.innerHTML = `${head}<div class="sk-grid">${l.length ? tiles() : '<p class="empty-sm">Aucune valeur : ajoute-en avec ✎ Modifier.</p>'}</div>`;
  el.querySelector('#sk-edit').onclick = () => editModal(modal, toast, () => drawPanel(el, { modal, toast }, true));
  if (!l.length) return;
  // Dernières cotes connues tout de suite, puis les fraîches
  const old = await db.get('cache', CACHE);
  if (old?.q) {
    el.querySelector('.sk-grid').innerHTML = tiles(old.q);
    el.querySelector('#sk-at').textContent = `Cotes de ${U.fmtTime(new Date(old.at))} · mise à jour…`;
  }
  try {
    const r = await quotes(l.map((x) => x.s), force);
    if (!el.isConnected) return;
    el.querySelector('.sk-grid').innerHTML = tiles(r.q);
    el.querySelector('#sk-at').textContent = `Mis à jour ${U.fmtTime(new Date(r.at))} · cotes différées`;
  } catch {
    if (el.isConnected) el.querySelector('#sk-at').textContent = 'Cotes indisponibles pour le moment';
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
