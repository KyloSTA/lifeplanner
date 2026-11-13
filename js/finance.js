// Finances : dépenses, budget et suivi du mois, à partir des relevés .csv de la banque.
//
// Store « money » (une transaction par élément) :
//   { id, src: 'cheques' | 'credit', date: 'AAAA-MM-JJ', time, account, kind: 'depense' | 'revenu' | 'transfert',
//     merchant (nom affiché), key (marchand normalisé), amount (négatif = sortie), cat, manual (catégorie choisie à la main),
//     pending, raw (type de transaction) }
// Réglages (settings) : « budget » { cats: { id: montant/mois }, savings }, « moneyRules » { cléMarchand: catégorie },
//   « moneyDismissed » [id de transactions signalées puis ignorées].
// Les courriels des destinataires et les numéros de compte complets ne sont jamais enregistrés.

import { db } from './db.js';
import * as U from './util.js';

const { esc } = U;

/* =========================================================
   Catégories
   ========================================================= */
export const CATS = [
  ['epicerie', '🛒', 'Épicerie', '#16a34a'],
  ['resto', '🍔', 'Restaurants et cafés', '#f97316'],
  ['livraison', '🛵', 'Livraison de repas', '#ef4444'],
  ['depanneur', '🏪', 'Dépanneur', '#eab308'],
  ['transport', '⛽', 'Essence et transport', '#0ea5e9'],
  ['vape', '💨', 'Vape, cannabis et alcool', '#a855f7'],
  ['sante', '💊', 'Pharmacie et santé', '#14b8a6'],
  ['enligne', '📦', 'Achats en ligne', '#f59e0b'],
  ['magasinage', '🛍', 'Magasinage', '#ec4899'],
  ['abonnements', '🔁', 'Abonnements', '#6366f1'],
  ['telephone', '📱', 'Téléphone et internet', '#3b82f6'],
  ['sport', '🏋', 'Gym et sports', '#22c55e'],
  ['soins', '💈', 'Soins personnels', '#d946ef'],
  ['animaux', '🐾', 'Animaux', '#84cc16'],
  ['logement', '🏠', 'Logement', '#64748b'],
  ['personnes', '🤝', 'Virements à des proches', '#06b6d4'],
  ['autre', '❔', 'Autres dépenses', '#94a3b8'],
];
export const INCOME_CATS = [
  ['salaire', '💼', 'Salaire', '#16a34a'],
  ['recu', '📥', 'Reçu de proches', '#0ea5e9'],
  ['interets', '💰', 'Intérêts et remboursements', '#eab308'],
  ['revenu-autre', '➕', 'Autres revenus', '#94a3b8'],
];
const ALL = Object.fromEntries([...CATS, ...INCOME_CATS, ['transfert', '🔄', 'Transfert entre comptes', '#94a3b8']].map(([id, e, n, c]) => [id, { id, emoji: e, name: n, color: c }]));
export const catOf = (id) => ALL[id] || ALL.autre;

// Classement automatique d'après le nom du marchand (normalisé : minuscules, sans accents ni numéros)
const RULES = [
  [/dashpass|spotify|netflix|disney|crave|notion|anthropic|claude|openai|chatgpt|google \w*(services|g1|pliab|tivimate|youtube|one|storage)|tivimate|playstation|xbox|nintendo|apple\.com|icloud|prime video|patreon|twitch/, 'abonnements'],
  [/doordash|uber ?eats|ubereats|skip ?the ?dishes|skipthedishes/, 'livraison'],
  [/maxi|wal ?mart|walmart|iga\b|metro\b|super ?c\b|costco|provigo|adonis|marche|loblaws|avril/, 'epicerie'],
  [/mcdonald|subway|tim ?hortons|starbucks|columbus|belle province|restaurant|resto|pizza|oeufrier|ben ?& ?florentine|ben florentine|cremerie|bar laitier|jugo|wetzel|amir|baran|marios|a&w|burger|poulet|sushi|cafe|frites|dairy queen|harvey|st-hubert bbq|boston pizza/, 'resto'],
  [/sqdc|saq\b|saq\d|vape|vapo|vapeur|tabac|depanneur vape/, 'vape'],
  [/esso|petro|shell|ultramar|irving|impark|stationnement|parking|uber ?trip|ubertrip|uber canada\/uber\b|stm\b|rtl\b|exo\b|opus|bixi|communauto|saaq/, 'transport'],
  [/couche|couchetard|depanneur|boni ?soir|7 ?jours|7-eleven|bonisoir/, 'depanneur'],
  [/jean coutu|familiprix|pharmaprix|uniprix|proxim|brunet|shopsante|clinique|dentist|optom|physio/, 'sante'],
  [/amzn|amazon|aliexpress|temu|shein|ebay|etsy/, 'enligne'],
  [/lucky mobile|fizz|videotron|bell\b|rogers|telus|koodo|virgin|freedom|public mobile|cogeco|ebox/, 'telephone'],
  [/anytime fit|fitness|gym|energie cardio|econofitness|sportpy|dek ?h|hockey|aréna|arena|golf|ski\b|yoga|crossfit/, 'sport'],
  [/barber|barbier|coiff|salon|spa\b|esthet|tatou|tattoo/, 'soins'],
  [/animaux|animalerie|pet ?smart|petsmart|mondou|chico|veterinaire|vet\b/, 'animaux'],
  [/loyer|hypotheque|hydro|energir|assurance|desjardins assur|intact|belair|taxe/, 'logement'],
  [/dollarama|winners|foot locker|equipeur|indigo|imaginaire|electronique|best buy|canadian tire|home depot|reno|ikea|sports experts|sail|simons|h&m|old navy|gap\b|marshalls|homesense|bureau en gros|staples|jysk|structube|la vie en rose|aldo|sephora/, 'magasinage'],
];

/** Nom de marchand normalisé, pour reconnaître le même marchand d'une transaction à l'autre. */
export function merchantKey(s = '') {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\*(?=[a-z]*\d)[a-z0-9]{6,}/g, ' ') // AMAZON.CA*1X7592V53 (code de commande, pas « *Services »)
    .replace(/\b(qps|store|inc|ltd|ltee|enr|cnd|ca|on|qc)\b/g, ' ')
    .replace(/[#*]/g, ' ').replace(/\d+/g, ' ').replace(/[^a-z&'.\/ -]/g, ' ')
    .replace(/\s*-\s*$/, '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'inconnu';
}
const ACRONYMS = { sqdc: 'SQDC', saq: 'SAQ', iga: 'IGA', vip: 'VIP', stm: 'STM', rtl: 'RTL', saaq: 'SAAQ', h: 'H' };
const title = (s) => s.toLowerCase().replace(/(^|[\s(\/.-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
  .replace(/\b[\p{L}]+\b/gu, (w) => ACRONYMS[w.toLowerCase()] || w);
/** Nom affiché : « MCDONALD'S # 41257 » -> « Mcdonald's », « SQDC77061 ST-HUBERT PROM » -> « SQDC St-Hubert Prom » */
function displayName(s = '') {
  let x = s.replace(/^\*+/, '').trim();
  // « PREFIXE*Nom » : on garde la partie lisible (« Abc*52014-Anytime Fitn » -> « Anytime Fitn »)
  const star = x.match(/^([^*]{1,12})\*\s*(.+)$/);
  if (star) {
    const right = star[2].replace(/^\d+-?/, '').trim();
    if (/^google/i.test(star[1])) x = right.replace(/\d{3,}\w*/g, '').trim() ? 'Google · ' + right : 'Google';
    else x = /[a-z]{3}/i.test(right) && !/\d{3}/.test(right) ? right : star[1];
  }
  const dd = x.match(/^doordash\s*(.*)$/i);
  if (dd) x = /dashpass/i.test(dd[1]) ? 'DoorDash DashPass' : dd[1] ? `DoorDash · ${dd[1]}` : 'DoorDash';
  x = x.replace(/\s*#\s*\d+.*$/, '') // « #4 », « # 41257 »
    .replace(/([a-z])\d{3,}\w*/gi, '$1') // « SQDC77061 » -> « SQDC », « Impark00070835u » -> « Impark »
    .replace(/\s+\w*\d{3,}\w*/g, '') // jetons avec numéros (« C81308 », « 41257 »)
    .replace(/\s{2,}.*$/, '') // « AMZN Mktp CA           TORONTO ON »
    .replace(/\s+[A-Z]$/, '').replace(/\s*\([^)]*$/, '').replace(/[\s\-–·,]+$/, '').trim();
  return title(x || s).replace(/(\p{L})'(\p{L})/gu, (m, a, b) => a + "'" + b.toLowerCase()).slice(0, 40);
}
const autoCat = (key) => { const k = key.replace(/-/g, ' '); return RULES.find(([re]) => re.test(k) || re.test(key))?.[1] || 'autre'; };
/** Catégorie par défaut d'une dépense : ta règle pour ce marchand, sinon le classement automatique. */
function defaultCat(t, rules) {
  if (rules?.[t.key]) return rules[t.key];
  const c = autoCat(t.key);
  return t.etr && c === 'autre' ? 'personnes' : c; // virement Interac à quelqu'un : « Virements à des proches »
}

/* =========================================================
   Lecture des fichiers .csv
   ========================================================= */
export function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  if (!rows.length) return Object.assign([], { head: [] });
  const head = rows[0].map((h) => h.trim().replace(/^﻿/, '').toLowerCase());
  const out = rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
  out.head = head; // colonnes, même si le fichier n'a aucune ligne
  return out;
}

// Identifiant stable : le même relevé importé deux fois (ou deux relevés qui se chevauchent) ne crée pas de doublon.
// Deux achats identiques à la même seconde (ex. double prélèvement) restent deux transactions (n° d'occurrence).
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
function withIds(list) {
  const seen = {};
  for (const t of list) {
    const base = [t.src, t.account, t.date, t.time, t.amount, t.rawName].join('|');
    seen[base] = (seen[base] || 0) + 1;
    t.id = 'm' + hash(base + '|' + seen[base]);
  }
  return list;
}
const money = (v) => Math.round(Number(String(v).replace(/[^\d.-]/g, '')) * 100) / 100;
const shortAcct = (n = '') => (n ? '••' + String(n).slice(-3) : '');

/** Relevé du compte chèques (et carte prépayée). */
function fromCheques(rows) {
  const out = [];
  for (const r of rows) {
    if (/cancel|annul|fail|refus/i.test(r.status)) continue;
    const amount = money(r.amount);
    if (!amount || !r.transaction_date) continue;
    const type = r.transaction_type || '', sub = r.transaction_sub_type || '';
    const t = { src: 'cheques', rawName: r.payee || type, date: r.transaction_date, time: r.transaction_time || '', account: `${r.account_type || 'Compte'} ${shortAcct(r.account_number)}`.trim(), amount, pending: /pending|attente/i.test(r.status), raw: [type, sub].filter(Boolean).join(' · ') };
    if (/internal transfer|transfert interne/i.test(type)) {
      Object.assign(t, { kind: 'transfert', merchant: amount < 0 ? 'Vers un autre compte' : 'D’un autre compte', cat: 'transfert' });
    } else if (/^deposit|dépôt|depot/i.test(type)) {
      const who = r.payee || 'Dépôt';
      const pay = /aft|direct|paie|payroll/i.test(sub);
      Object.assign(t, { kind: 'revenu', merchant: title(who), cat: pay ? 'salaire' : /e ?transfer|virement/i.test(sub) ? 'recu' : 'revenu-autre' });
    } else if (/interest|intérêt|interet|reimburse|rembours|cashback|refund/i.test(type)) {
      Object.assign(t, { kind: 'revenu', merchant: /interest|int/i.test(type) ? 'Intérêts' : 'Remboursement', cat: 'interets' });
    } else if (/withdrawal|retrait/i.test(type) && /e ?transfer|virement/i.test(sub)) {
      Object.assign(t, { kind: 'depense', merchant: title(r.payee || 'Virement Interac'), cat: null, etr: true });
    } else {
      // Achats (carte), retraits, frais ; un montant positif est un remboursement du marchand
      const name = r.payee || type || 'Achat';
      Object.assign(t, { kind: amount < 0 ? 'depense' : 'revenu', merchant: displayName(name), cat: amount < 0 ? null : 'interets' });
      t.key = merchantKey(name);
      if (amount > 0) t.refundOf = t.key; // remboursement : compte en moins dans la catégorie du marchand
    }
    t.key ||= merchantKey(t.merchant);
    out.push(t);
  }
  return out;
}

/** Relevé de la carte de crédit. Un paiement de la carte est un transfert (déjà compté dans les chèques). */
function fromCredit(rows) {
  const out = [];
  for (const r of rows) {
    if (/cancel|annul|declin|refus/i.test(r.status)) continue;
    const v = money(r.amount);
    if (!v || !r.transaction_date) continue;
    const type = r.transaction_type || '';
    const name = r.merchant || type || 'Achat';
    const t = { src: 'credit', rawName: name, date: r.transaction_date, time: '', account: 'Carte de crédit', pending: /pending|attente/i.test(r.status), raw: type, merchant: displayName(name), key: merchantKey(name) };
    if (/payment|paiement/i.test(type)) Object.assign(t, { kind: 'transfert', amount: Math.abs(v), cat: 'transfert', merchant: 'Paiement de la carte' });
    else if (/refund|return|credit|rembours|cashback|remise/i.test(type)) Object.assign(t, { kind: 'revenu', amount: Math.abs(v), cat: 'interets', refundOf: t.key });
    else Object.assign(t, { kind: 'depense', amount: -Math.abs(v), cat: null });
    out.push(t);
  }
  return out;
}

/** Reconnaît le relevé d'après ses colonnes. */
export function detect(rows) {
  const h = rows.head || Object.keys(rows[0] || {});
  if (h.includes('transaction_date') && h.includes('payee')) return 'cheques';
  if (h.includes('transaction_date') && h.includes('merchant')) return 'credit';
  if (h.includes('activity_type') || h.includes('net_cash_amount')) return 'placements';
  return null;
}

/** Importe un ou plusieurs fichiers. Renvoie un résumé par fichier. */
export async function importFiles(files) {
  const [existing, rules] = await Promise.all([db.all('money'), db.get('settings', 'moneyRules')]);
  const byId = new Map(existing.map((t) => [t.id, t]));
  const report = [];
  for (const f of files) {
    const rows = parseCSV(await f.text());
    const type = detect(rows);
    if (type === 'placements') { report.push({ name: f.name, type, rows: rows.length }); continue; }
    if (!type) { report.push({ name: f.name, type: null }); continue; }
    const list = withIds(type === 'cheques' ? fromCheques(rows) : fromCredit(rows));
    let added = 0, updated = 0;
    const toPut = [];
    for (const t of list) {
      const old = byId.get(t.id);
      if (old?.manual) { t.cat = old.cat; t.manual = true; } // une catégorie choisie à la main reste
      if (t.cat == null) t.cat = defaultCat(t, rules);
      if (old) { if (JSON.stringify({ ...old }) !== JSON.stringify({ ...old, ...t })) { toPut.push({ ...old, ...t }); updated++; } }
      else { toPut.push(t); added++; }
      byId.set(t.id, { ...old, ...t });
    }
    // Une transaction « en attente » devenue définitive (heure parfois différente) : on retire l'ancienne
    const stale = [];
    for (const t of list.filter((x) => !x.pending)) {
      for (const p of byId.values()) {
        if (p.pending && p.id !== t.id && p.src === t.src && p.key === t.key && p.amount === t.amount && Math.abs(U.parseISO(p.date) - U.parseISO(t.date)) <= 4 * 864e5 && !list.some((x) => x.id === p.id)) stale.push(p.id);
      }
    }
    if (toPut.length) await db.putMany('money', toPut);
    for (const id of new Set(stale)) { await db.del('money', id); byId.delete(id); }
    // Classement automatique amélioré depuis le dernier import : on reclasse ce qui n'a pas été choisi à la main
    const recat = [];
    for (const t of byId.values()) {
      if (t.manual || t.kind !== 'depense' || t.src !== type) continue;
      const c = defaultCat(t, rules);
      if (c !== t.cat) recat.push({ ...t, cat: c });
    }
    if (recat.length) await db.putMany('money', recat);
    const dates = list.map((t) => t.date).sort();
    report.push({ name: f.name, type, rows: list.length, added, updated, from: dates[0], to: dates[dates.length - 1] });
  }
  return report;
}

/* =========================================================
   Calculs
   ========================================================= */
const ym = (d) => d.slice(0, 7);
const monthsBack = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 - n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const daysIn = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };
export const curMonth = () => ym(U.iso(new Date()));
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const monthName = (m) => { const [y, mo] = m.split('-').map(Number); return `${MONTHS[mo - 1]} ${y}`; };
const fmt = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' });
const fmt0 = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
export const $$$ = (v, round = false) => (round ? fmt0 : fmt).format(v);

/** Dépense nette d'une transaction pour le budget (un remboursement compte en moins dans sa catégorie). */
function spendOf(t) {
  if (t.kind === 'depense') return -t.amount;
  if (t.refundOf && t.amount > 0) return -t.amount;
  return 0;
}
const spendCat = (t, list) => (t.kind === 'depense' ? t.cat : (list.find((x) => x.kind === 'depense' && x.key === t.refundOf)?.cat || 'autre'));

/** Totaux d'un mois. */
export function summarize(all, m) {
  const list = all.filter((t) => ym(t.date) === m);
  const byCat = {};
  let spent = 0, income = 0, transfers = 0;
  for (const t of list) {
    const s = spendOf(t);
    if (s) { const c = spendCat(t, all); byCat[c] = (byCat[c] || 0) + s; spent += s; }
    else if (t.kind === 'revenu') income += t.amount;
    else if (t.kind === 'transfert' && t.src === 'cheques') transfers += t.amount;
  }
  return { m, list, byCat, spent, income, net: income - spent, toInvest: -transfers };
}

/** Moyenne mensuelle des n mois complets avant m (seulement les mois où il y a des données). */
export function averages(all, m, n = 3) {
  const months = [];
  for (let i = 1; i <= 12 && months.length < n; i++) {
    const mm = monthsBack(m, i);
    if (all.some((t) => ym(t.date) === mm)) months.push(mm);
  }
  // Un mois commencé en plein milieu (premier relevé) fausserait la moyenne : on l'écarte s'il reste assez de mois
  const first = all.map((t) => t.date).sort()[0];
  const full = months.filter((mm) => !(first && ym(first) === mm && Number(first.slice(8)) > 5));
  const use = full.length ? full : months;
  const sums = use.map((mm) => summarize(all, mm));
  const avg = (f) => (use.length ? sums.reduce((s, x) => s + f(x), 0) / use.length : 0);
  const cats = {};
  for (const [id] of CATS) cats[id] = avg((x) => x.byCat[id] || 0);
  return { months: use, cats, spent: avg((x) => x.spent), income: avg((x) => x.income), toInvest: avg((x) => x.toInvest) };
}

/** Prélèvements en double possibles : même marchand, même montant, même jour, à moins de 2 minutes. */
function doubles(list, dismissed) {
  const out = [];
  const sorted = list.filter((t) => t.kind === 'depense' && !t.pending).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (a.key === b.key && a.amount === b.amount && a.date === b.date && a.time && b.time) {
      const sec = (s) => s.split(':').reduce((x, y) => x * 60 + Number(y), 0);
      if (Math.abs(sec(b.time) - sec(a.time)) <= 120 && !dismissed.has(b.id)) out.push(b);
    }
  }
  return out;
}

/** Paiements qui reviennent chaque mois (abonnements, forfaits) : coût mensuel estimé. */
function recurring(all, m) {
  const months = [m, monthsBack(m, 1), monthsBack(m, 2), monthsBack(m, 3)];
  const by = {};
  for (const t of all) {
    if (t.kind !== 'depense' || !months.includes(ym(t.date)) || ['epicerie', 'resto', 'depanneur', 'transport', 'livraison', 'personnes', 'enligne', 'magasinage', 'vape', 'sante'].includes(t.cat)) continue;
    (by[t.key] ||= { key: t.key, name: t.merchant, cat: t.cat, months: new Set(), amounts: [] });
    by[t.key].months.add(ym(t.date));
    by[t.key].amounts.push(-t.amount);
  }
  return Object.values(by).filter((x) => x.months.size >= 2)
    .map((x) => ({ ...x, monthly: x.amounts.reduce((a, b) => a + b, 0) / x.months.size }))
    .sort((a, b) => b.monthly - a.monthly);
}

/* =========================================================
   Page
   ========================================================= */
let month = null;
let tab = 'apercu';
let txFilter = { q: '', cat: '' };

export async function renderPage(ctx, arg) {
  const { view } = ctx;
  if (arg && ['apercu', 'budget', 'transactions'].includes(arg)) tab = arg;
  const all = (await db.all('money')).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const budget = (await db.get('settings', 'budget')) || { cats: {}, savings: 0 };
  month ||= curMonth();
  const hasData = all.length > 0;
  const months = [...new Set(all.map((t) => ym(t.date)))].sort();

  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Argent</p><h1>Finances</h1></div>
      <div class="head-actions">
        <label class="btn primary" id="fi-import" title="Relevés .csv de ta banque (compte chèques, carte de crédit)"><input type="file" accept=".csv,text/csv" multiple hidden>⬆ Importer un relevé .csv</label>
      </div>
    </header>
    ${hasData ? `<div class="fi-bar">
      <div class="seg" role="tablist">${[['apercu', '📊 Aperçu'], ['budget', '🎯 Budget'], ['transactions', '🧾 Transactions']].map(([k, l]) => `<button role="tab" data-tab="${k}" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}">${l}</button>`).join('')}</div>
      <div class="fi-month">
        <button class="btn icon" id="fi-prev" ${month <= months[0] ? 'disabled' : ''} aria-label="Mois précédent">‹</button>
        <b>${esc(monthName(month))}</b>
        <button class="btn icon" id="fi-next" ${month >= curMonth() ? 'disabled' : ''} aria-label="Mois suivant">›</button>
      </div>
    </div>
    <div id="fi-body"></div>` : emptyState()}
    <div class="fi-drop" id="fi-drop" hidden><b>Dépose tes relevés .csv ici</b></div>`;

  const $ = (s) => view.querySelector(s), $$ = (s) => [...view.querySelectorAll(s)];
  const doImport = async (files) => {
    const list = [...files].filter((f) => /\.csv$/i.test(f.name) || f.type.includes('csv'));
    if (!list.length) { ctx.toast('Choisis un fichier .csv', 'err'); return; }
    const rep = await importFiles(list);
    importReport(ctx, rep);
    month = curMonth();
    renderPage(ctx);
  };
  $('#fi-import input').onchange = (e) => doImport(e.target.files);
  // Glisser-déposer des fichiers sur la page
  const drop = $('#fi-drop');
  view.ondragover = (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); drop.hidden = false; } };
  drop.ondragleave = () => { drop.hidden = true; };
  drop.ondrop = (e) => { e.preventDefault(); drop.hidden = true; doImport(e.dataTransfer.files); };
  if (!hasData) return;

  $$('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; renderPage(ctx); }));
  $('#fi-prev').onclick = () => { month = monthsBack(month, 1); renderPage(ctx); };
  $('#fi-next').onclick = () => { month = monthsBack(month, -1); renderPage(ctx); };
  const body = $('#fi-body');
  if (tab === 'budget') drawBudget(ctx, body, all, budget);
  else if (tab === 'transactions') drawTransactions(ctx, body, all);
  else drawOverview(ctx, body, all, budget);
}

function emptyState() {
  return `<section class="card fi-empty">
    <h2>Suis tes dépenses et garde le cap 💰</h2>
    <ol>
      <li>Dans ton application bancaire, exporte l’historique de ton <b>compte chèques</b> (et de ta <b>carte de crédit</b>) en fichier <b>.csv</b>.</li>
      <li>Touche <b>⬆ Importer un relevé .csv</b> (ou glisse les fichiers sur cette page).</li>
      <li>Les dépenses sont classées toutes seules (épicerie, restos, essence…) ; tu peux corriger une catégorie en un clic.</li>
      <li>Dans <b>🎯 Budget</b>, l’app te propose un budget d’après tes 3 derniers mois. Ajuste-le, puis suis ton mois ici.</li>
    </ol>
    <p class="muted">Réimporter un relevé plus récent ajoute seulement les nouvelles transactions (pas de doublons). Tout reste sur tes appareils et dans ta synchronisation Google Drive privée ; les courriels des destinataires et les numéros de compte ne sont pas enregistrés.</p>
  </section>`;
}

function importReport(ctx, rep) {
  const lines = rep.map((r) => {
    if (r.type === 'placements') return `<li>📈 <b>${esc(r.name)}</b> : relevé de placements reconnu. Rien à ajouter au budget : l’argent que tu y envoies est déjà compté dans ton compte chèques (« Vers tes placements »).</li>`;
    if (!r.type) return `<li>⚠ <b>${esc(r.name)}</b> : format non reconnu (il faut un relevé de compte chèques ou de carte de crédit).</li>`;
    if (!r.rows) return `<li>${r.type === 'credit' ? '💳' : '🏦'} <b>${esc(r.name)}</b> : aucune transaction dans ce fichier.</li>`;
    return `<li>${r.type === 'credit' ? '💳' : '🏦'} <b>${esc(r.name)}</b> : ${r.rows} transactions du ${esc(U.fmtShort(U.parseISO(r.from)))} au ${esc(U.fmtShort(U.parseISO(r.to)))} — <b>${r.added} nouvelle${r.added > 1 ? 's' : ''}</b>${r.updated ? `, ${r.updated} mise${r.updated > 1 ? 's' : ''} à jour` : ''}.</li>`;
  }).join('');
  ctx.modal(`<h2>Import terminé</h2><ul class="fi-report">${lines}</ul><div class="modal-actions"><button class="btn primary" data-close>OK</button></div>`);
}

/* ---------- Aperçu du mois ---------- */
function drawOverview(ctx, el, all, budget) {
  const s = summarize(all, month);
  const avg = averages(all, month);
  const isNow = month === curMonth();
  const dim = daysIn(month);
  const day = isNow ? new Date().getDate() : dim;
  const total = Object.values(budget.cats || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const left = total - s.spent;
  const pace = isNow && day > 2 ? (s.spent / day) * dim : s.spent;
  const perDay = isNow && dim - day + 1 > 0 ? left / (dim - day + 1) : 0;
  const pct = total ? Math.round((s.spent / total) * 100) : 0;
  const dismissed = new Set([]);
  const rec = recurring(all, month);

  const cats = CATS.map(([id]) => ({ ...catOf(id), spent: s.byCat[id] || 0, budget: Number(budget.cats?.[id]) || 0, avg: avg.cats[id] || 0 }))
    .filter((c) => c.spent || c.budget).sort((a, b) => b.spent - a.spent);
  const over = cats.filter((c) => c.budget && c.spent > c.budget);
  const top = topMerchants(s.list, all);

  el.innerHTML = `
    <div class="kpis fi-kpis">
      <div class="kpi ok"><b>${$$$(s.income, true)}</b><span>revenus</span></div>
      <div class="kpi"><b>${$$$(s.spent, true)}</b><span>dépenses${avg.spent ? ` · moy. ${$$$(avg.spent, true)}` : ''}</span></div>
      <div class="kpi ${s.net < 0 ? 'bad' : 'ok'}"><b>${s.net < 0 ? '−' : '+'}${$$$(Math.abs(s.net), true)}</b><span>${s.net < 0 ? 'dépensé de plus que gagné' : 'gardé ce mois-ci'}</span></div>
      <div class="kpi"><b>${s.toInvest < 0 ? '−' : ''}${$$$(Math.abs(s.toInvest), true)}</b><span>${s.toInvest < 0 ? 'retiré de tes placements' : 'vers tes placements (net)'}</span></div>
    </div>

    ${total ? `<section class="card fi-budget-card ${left < 0 ? 'over' : pace > total ? 'warn' : 'good'}">
      <div class="card-head"><h2>🎯 Budget de ${esc(monthName(month).split(' ')[0])}</h2><span class="muted">${pct} % utilisé</span></div>
      <div class="fi-meter"><i style="width:${Math.min(100, pct)}%"></i>${isNow ? `<span class="fi-today" style="left:${(day / dim) * 100}%" title="Aujourd’hui"></span>` : ''}</div>
      <p class="fi-verdict">${verdict({ isNow, left, pace, total, perDay, day, dim })}</p>
      ${chartSVG(all, month, total, isNow ? day : dim)}
    </section>` : `<section class="card fi-setup"><h2>🎯 Pas encore de budget</h2><p>Laisse l’app te proposer un budget d’après tes dépenses des derniers mois, puis ajuste-le.</p><button class="btn primary" data-go="budget">Créer mon budget</button></section>`}

    ${over.length || doubles(s.list, dismissed).length ? `<section class="card fi-alerts"><h2>⚠ À surveiller</h2><ul>
      ${over.map((c) => `<li><b>${c.emoji} ${esc(c.name)}</b> : ${$$$(c.spent, true)} sur ${$$$(c.budget, true)} (dépassé de ${$$$(c.spent - c.budget, true)}).</li>`).join('')}
      ${doubles(s.list, dismissed).map((t) => `<li><b>Prélèvement en double possible</b> : ${esc(t.merchant)} ${$$$(-t.amount)} deux fois le ${esc(U.fmtShort(U.parseISO(t.date)))} à ${esc(t.time.slice(0, 5))}. Vérifie auprès du marchand.</li>`).join('')}
    </ul></section>` : ''}

    <div class="fi-grid">
      <section class="card fi-cats">
        <div class="card-head"><h2>Dépenses par catégorie</h2>${avg.months.length ? `<span class="muted" title="Moyenne de ${avg.months.map(monthName).join(', ')}">vs moyenne</span>` : ''}</div>
        ${cats.length ? cats.map((c) => catRow(c)).join('') : '<p class="empty-sm">Aucune dépense ce mois-ci.</p>'}
      </section>
      <div class="fi-side">
        <section class="card">
          <div class="card-head"><h2>Où va ton argent</h2></div>
          ${top.length ? `<ol class="fi-top">${top.map((x) => `<li><span>${catOf(x.cat).emoji} ${esc(x.name)} <small class="muted">× ${x.n}</small></span><b>${$$$(x.total, true)}</b></li>`).join('')}</ol>` : '<p class="empty-sm">Rien à afficher.</p>'}
        </section>
        ${rec.length ? `<section class="card">
          <div class="card-head"><h2>🔁 Paiements récurrents</h2><span class="muted">${$$$(rec.reduce((a, x) => a + x.monthly, 0), true)}/mois</span></div>
          <ul class="fi-rec">${rec.slice(0, 10).map((x) => `<li><span>${catOf(x.cat).emoji} ${esc(x.name)}</span><b>${$$$(x.monthly)}</b></li>`).join('')}</ul>
          <p class="hint muted">Vus au moins 2 mois sur les 4 derniers. Un abonnement que tu n’utilises plus ? C’est de l’argent facile à récupérer.</p>
        </section>` : ''}
      </div>
    </div>`;
  el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { tab = b.dataset.go; renderPage(ctx); }));
  el.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { txFilter = { q: '', cat: b.dataset.cat }; tab = 'transactions'; renderPage(ctx); }));
}

function verdict({ isNow, left, pace, total, perDay, day, dim }) {
  if (!isNow) return left >= 0 ? `✅ Mois terminé sous le budget : <b>${$$$(left, true)}</b> de marge.` : `❌ Mois terminé au-dessus du budget de <b>${$$$(-left, true)}</b>.`;
  if (left < 0) return `❌ Budget dépassé de <b>${$$$(-left, true)}</b>. Pour le reste du mois, vise seulement l’essentiel.`;
  const rest = dim - day + 1;
  if (pace > total * 1.03) return `⚠ À ce rythme, tu finirais le mois à <b>${$$$(pace, true)}</b> (${$$$(pace - total, true)} de trop). Il te reste <b>${$$$(left, true)}</b>, soit <b>${$$$(perDay, true)} par jour</b> pendant ${rest} jour${rest > 1 ? 's' : ''}.`;
  return `✅ Sur la bonne voie. Il te reste <b>${$$$(left, true)}</b>, soit <b>${$$$(perDay, true)} par jour</b> pendant ${rest} jour${rest > 1 ? 's' : ''}.`;
}

function catRow(c) {
  const pct = c.budget ? Math.min(100, (c.spent / c.budget) * 100) : 0;
  const diff = c.avg ? c.spent - c.avg : 0;
  return `<button class="fi-cat" data-cat="${c.id}" title="Voir les transactions">
    <span class="fi-cat-name">${c.emoji} ${esc(c.name)}</span>
    <span class="fi-cat-amt"><b>${$$$(c.spent, true)}</b>${c.budget ? ` <small class="muted">/ ${$$$(c.budget, true)}</small>` : ''}</span>
    <span class="fi-cat-bar ${c.budget && c.spent > c.budget ? 'over' : ''}"><i style="width:${c.budget ? pct : 0}%;--c:${c.color}"></i></span>
    ${c.avg >= 5 ? `<small class="fi-cat-trend ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${$$$(Math.abs(diff), true)}</small>` : '<small></small>'}
  </button>`;
}

function topMerchants(list, all) {
  const by = {};
  for (const t of list) {
    const s = spendOf(t);
    if (!s) continue;
    const k = t.kind === 'depense' ? t.key : t.refundOf;
    (by[k] ||= { name: t.kind === 'depense' ? t.merchant : (all.find((x) => x.key === k && x.kind === 'depense')?.merchant || t.merchant), cat: spendCat(t, all), total: 0, n: 0 });
    by[k].total += s;
    if (t.kind === 'depense') by[k].n++;
  }
  return Object.values(by).filter((x) => x.total > 0).sort((a, b) => b.total - a.total).slice(0, 8);
}

/** Courbe des dépenses cumulées du mois, avec la ligne du budget. */
function chartSVG(all, m, total, upto) {
  const dim = daysIn(m);
  const daily = Array(dim + 1).fill(0);
  for (const t of all) if (ym(t.date) === m) { const s = spendOf(t); if (s) daily[Number(t.date.slice(8))] += s; }
  const cum = [];
  let acc = 0;
  for (let d = 1; d <= upto; d++) { acc += daily[d]; cum.push(acc); }
  const W = 600, H = 150, P = 6;
  const max = Math.max(total, acc, 1) * 1.08;
  const x = (d) => P + ((d - 1) / (dim - 1)) * (W - 2 * P), y = (v) => H - P - (v / max) * (H - 2 * P);
  const pts = cum.map((v, i) => `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = cum.length ? `${x(1)},${y(0)} ${pts} ${x(cum.length)},${y(0)}` : '';
  return `<svg class="fi-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Dépenses cumulées du mois comparées au budget">
    <line x1="${x(1)}" y1="${y(0)}" x2="${x(dim)}" y2="${y(total)}" class="fi-ch-budget" vector-effect="non-scaling-stroke"/>
    <line x1="${x(1)}" y1="${y(total)}" x2="${x(dim)}" y2="${y(total)}" class="fi-ch-limit" vector-effect="non-scaling-stroke"/>
    ${area ? `<polygon points="${area}" class="fi-ch-area"/><polyline points="${pts}" class="fi-ch-line" vector-effect="non-scaling-stroke"/>` : ''}
  </svg>
  <p class="fi-ch-legend"><span><i class="l1"></i>Tes dépenses cumulées</span><span><i class="l2"></i>Rythme du budget</span></p>`;
}

/* ---------- Budget : proposition et réglage ---------- */
function drawBudget(ctx, el, all, budget) {
  const avg = averages(all, curMonth());
  const cur = budget.cats || {};
  const round5 = (v) => Math.ceil(v / 5) * 5;
  const rows = CATS.map(([id]) => ({ ...catOf(id), avg: avg.cats[id] || 0, value: cur[id] ?? '' }))
    .sort((a, b) => b.avg - a.avg);
  el.innerHTML = `
    <section class="card fi-plan">
      <div class="card-head"><h2>🎯 Ton budget mensuel</h2><span class="muted">${avg.months.length ? `Moyennes : ${avg.months.map((m) => monthName(m).split(' ')[0]).join(', ')}` : ''}</span></div>
      <div class="fi-plan-top">
        <div class="kpi ok"><b>${$$$(avg.income, true)}</b><span>revenus moyens / mois</span></div>
        <div class="kpi"><b>${$$$(avg.spent, true)}</b><span>dépenses moyennes / mois</span></div>
        <div class="kpi"><b id="fi-total">–</b><span>budget total</span></div>
        <div class="kpi" id="fi-left-k"><b id="fi-left">–</b><span>reste après budget et épargne</span></div>
      </div>
      <div class="fi-suggest">
        <span class="muted">Proposition d’après tes dépenses réelles :</span>
        <button class="btn" data-sug="1">= Moyenne</button>
        <button class="btn" data-sug="0.9">Moyenne − 10 %</button>
        <button class="btn" data-sug="0.8">Moyenne − 20 %</button>
      </div>
      <div class="fi-plan-rows">${rows.map((r) => `
        <label class="fi-plan-row">
          <span>${r.emoji} ${esc(r.name)}</span>
          <small class="muted" title="Moyenne mensuelle">${r.avg ? 'moy. ' + $$$(r.avg, true) : '—'}</small>
          <span class="fi-input"><input type="number" min="0" step="5" inputmode="numeric" data-b="${r.id}" data-avg="${round5(r.avg)}" value="${esc(String(r.value))}" placeholder="0"> $</span>
        </label>`).join('')}</div>
      <label class="fi-plan-row fi-savings"><span>🐷 Épargne visée par mois</span><small class="muted">mise de côté</small><span class="fi-input"><input type="number" min="0" step="10" id="fi-sav" value="${esc(String(budget.savings || ''))}" placeholder="0"> $</span></label>
      <div class="modal-actions"><button class="btn primary" id="fi-save">Enregistrer le budget</button></div>
      <p class="hint muted">Conseils : commence par les catégories où tu dépenses le plus. Viser 10 à 20 % de moins que ta moyenne est réaliste ; plus serré, c’est souvent abandonné au bout de deux semaines. Mets l’épargne en premier : traite-la comme une dépense fixe.</p>
    </section>`;
  const inputs = [...el.querySelectorAll('[data-b]')];
  const sav = el.querySelector('#fi-sav');
  const totals = () => {
    const t = inputs.reduce((a, i) => a + (Number(i.value) || 0), 0);
    const left = avg.income - t - (Number(sav.value) || 0);
    el.querySelector('#fi-total').textContent = $$$(t, true);
    el.querySelector('#fi-left').textContent = (left < 0 ? '−' : '') + $$$(Math.abs(left), true);
    el.querySelector('#fi-left-k').className = 'kpi ' + (left < 0 ? 'bad' : 'ok');
  };
  inputs.forEach((i) => (i.oninput = totals));
  sav.oninput = totals;
  totals();
  el.querySelectorAll('[data-sug]').forEach((b) => (b.onclick = () => {
    const f = Number(b.dataset.sug);
    inputs.forEach((i) => { const a = Number(i.dataset.avg) || 0; i.value = a ? round5(a * f) : ''; });
    totals();
  }));
  el.querySelector('#fi-save').onclick = async () => {
    const cats = {};
    inputs.forEach((i) => { const v = Number(i.value); if (v > 0) cats[i.dataset.b] = v; });
    await db.put('settings', { cats, savings: Number(sav.value) || 0, updatedAt: Date.now() }, 'budget');
    ctx.toast('🎯 Budget enregistré');
    tab = 'apercu';
    month = curMonth();
    renderPage(ctx);
  };
}

/* ---------- Transactions ---------- */
function drawTransactions(ctx, el, all) {
  const opts = (sel, kind) => (kind === 'revenu' ? INCOME_CATS : kind === 'transfert' ? [['transfert', '🔄', 'Transfert entre comptes']] : CATS)
    .map(([id, e, n]) => `<option value="${id}" ${id === sel ? 'selected' : ''}>${e} ${n}</option>`).join('');
  el.innerHTML = `
    <div class="fi-tx-tools">
      <input type="search" id="fi-q" placeholder="Rechercher un marchand…" value="${esc(txFilter.q)}" autocomplete="off">
      <select id="fi-cat"><option value="">Toutes les catégories</option>${[...CATS, ...INCOME_CATS, ['transfert', '🔄', 'Transferts']].map(([id, e, n]) => `<option value="${id}" ${txFilter.cat === id ? 'selected' : ''}>${e} ${n}</option>`).join('')}</select>
    </div>
    <div id="fi-tx"></div>`;
  const draw = () => {
    const q = U.norm ? U.norm(txFilter.q) : txFilter.q.toLowerCase();
    const list = all.filter((t) => ym(t.date) === month && (!txFilter.cat || t.cat === txFilter.cat || (txFilter.cat && t.refundOf && spendCat(t, all) === txFilter.cat)) && (!q || t.key.includes(q) || t.merchant.toLowerCase().includes(q)));
    const days = {};
    list.forEach((t) => (days[t.date] ||= []).push(t));
    const sum = list.reduce((a, t) => a + (spendOf(t) || 0), 0);
    el.querySelector('#fi-tx').innerHTML = list.length ? `<p class="muted fi-tx-sum">${list.length} transaction${list.length > 1 ? 's' : ''}${sum ? ` · ${$$$(sum)} de dépenses` : ''}</p>` + Object.entries(days).map(([d, ts]) => `
      <section class="card fi-day"><h3>${esc(U.parseISO(d).toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' }))}</h3>
        ${ts.map((t) => `<div class="fi-tx ${t.kind}" data-id="${t.id}">
          <span class="fi-tx-ico" style="--c:${catOf(t.cat).color}">${catOf(t.cat).emoji}</span>
          <span class="fi-tx-main"><b>${esc(t.merchant)}</b><small class="muted">${esc([t.time.slice(0, 5), t.account, t.pending ? '⏳ en attente' : ''].filter(Boolean).join(' · '))}</small></span>
          <select class="fi-tx-cat" aria-label="Catégorie">${opts(t.cat, t.kind)}</select>
          <b class="fi-tx-amt ${t.amount > 0 ? 'pos' : ''}">${t.amount > 0 ? '+' : '−'}${$$$(Math.abs(t.amount))}</b>
        </div>`).join('')}</section>`).join('') : '<div class="card empty-card"><p>Aucune transaction pour ce filtre.</p></div>';
    el.querySelectorAll('.fi-tx-cat').forEach((s) => (s.onchange = async () => {
      const t = all.find((x) => x.id === s.closest('.fi-tx').dataset.id);
      if (!t) return;
      t.cat = s.value; t.manual = true;
      await db.put('money', t);
      const same = all.filter((x) => x.id !== t.id && x.key === t.key && x.kind === t.kind && x.cat !== t.cat);
      const label = catOf(t.cat);
      if (await ctx.confirmBox(`Classer aussi ${same.length ? `les ${same.length} autres achats` : 'les prochains achats'} chez « ${t.merchant} » dans ${label.emoji} ${label.name} ?`, 'Oui, toujours')) {
        const rules = (await db.get('settings', 'moneyRules')) || {};
        rules[t.key] = t.cat;
        await db.put('settings', rules, 'moneyRules');
        for (const x of same) { x.cat = t.cat; x.manual = true; }
        if (same.length) await db.putMany('money', same);
      }
      ctx.toast(`${label.emoji} Classé dans ${label.name}`);
      draw();
    }));
  };
  el.querySelector('#fi-q').oninput = (e) => { txFilter.q = e.target.value; draw(); };
  el.querySelector('#fi-cat').onchange = (e) => { txFilter.cat = e.target.value; draw(); };
  draw();
}

/* =========================================================
   Carte de la page Aujourd'hui
   ========================================================= */
export async function todayCard(el) {
  if (!el) return;
  const [all, budget] = await Promise.all([db.all('money'), db.get('settings', 'budget')]);
  const total = Object.values(budget?.cats || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  if (!all.length || !total) { el.hidden = true; return; }
  const m = curMonth();
  const s = summarize(all, m);
  const dim = daysIn(m), day = new Date().getDate();
  const left = total - s.spent;
  const pct = Math.round((s.spent / total) * 100);
  const pace = day > 2 ? (s.spent / day) * dim : s.spent;
  const last = all.map((t) => t.date).sort().pop();
  el.hidden = false;
  el.innerHTML = `<a class="fi-today-card ${left < 0 ? 'over' : pace > total * 1.03 ? 'warn' : 'good'}" href="#/finance">
    <div class="card-head"><h2>💰 Budget du mois</h2><span class="muted">${pct} %</span></div>
    <div class="fi-meter"><i style="width:${Math.min(100, pct)}%"></i><span class="fi-today" style="left:${(day / dim) * 100}%"></span></div>
    <p>${left < 0 ? `Dépassé de <b>${$$$(-left, true)}</b>` : `Reste <b>${$$$(left, true)}</b> · ${$$$(left / (dim - day + 1), true)}/jour`}</p>
    ${last && (Date.now() - U.parseISO(last)) / 864e5 > 7 ? `<small class="muted">Dernier relevé : ${esc(U.fmtShort(U.parseISO(last)))} — importe le plus récent</small>` : ''}
  </a>`;
}
