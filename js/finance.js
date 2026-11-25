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
import * as gcal from './gcal.js';
import { showUndo } from './tasks.js';
import * as livre from './livre-or.js';

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
  [/mcdonald|mcdo\b|subway|tim ?hortons|^tim$|starbucks|columbus|belle province|restaurant|resto|pizza|oeufrier|ben ?& ?florentine|ben florentine|cremerie|bar laitier|jugo|wetzel|amir|baran|marios|a&w|burger|poulet|sushi|cafe|frites|dairy queen|harvey|st-hubert bbq|boston pizza/, 'resto'],
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
const secs = (s) => String(s).split(':').reduce((x, y) => x * 60 + (Number(y) || 0), 0);
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
    if (type === 'placements') { const g = await livre.storeGambling(rows).catch(() => ({ stored: 0 })); report.push({ name: f.name, type, rows: rows.length, jeu: g }); continue; }
    if (!type) { report.push({ name: f.name, type: null }); continue; }
    const list = withIds(type === 'cheques' ? fromCheques(rows) : fromCredit(rows));
    let added = 0, updated = 0;
    const toPut = [];
    for (const t of list) {
      const old = byId.get(t.id);
      if (old?.manual) { t.cat = old.cat; t.manual = true; } // une catégorie choisie à la main reste
      if (t.cat == null) t.cat = defaultCat(t, rules);
      // Même transaction dans un autre relevé, avec un détail qui a changé (heure, libellé) : on garde la même fiche.
      // Un vrai double prélèvement apparaît deux fois dans le MÊME relevé : il n'est pas touché.
      const w1 = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9à-ÿ ]/g, ' ').trim().split(/\s+/)[0];
      const twin = !old && [...byId.values()].find((p) => p.src === t.src && p.date === t.date && p.amount === t.amount && p.account === t.account && (p.key === t.key || w1(p.rawName) === w1(t.rawName)) && !p.pending
        && !list.some((x) => x.id === p.id) && (!p.time || !t.time || Math.abs(secs(p.time) - secs(t.time)) <= 600));
      if (twin) { if (twin.manual) { t.cat = twin.cat; t.manual = true; } toPut.push({ ...twin, ...t, id: twin.id }); byId.set(twin.id, { ...twin, ...t, id: twin.id }); updated++; continue; }
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
    // Dépense entrée à la main (ajout rapide) qui arrive maintenant dans le relevé : même montant à ±4 jours -> on garde celle du relevé
    for (const t of list.filter((x) => x.kind === 'depense')) {
      const q = [...byId.values()].find((p) => p.src === 'manuel' && !stale.includes(p.id) && p.amount === t.amount && Math.abs(U.parseISO(p.date) - U.parseISO(t.date)) <= 4 * 864e5);
      if (q) { stale.push(q.id); if (q.manual && !t.manual) { t.cat = q.cat; t.manual = true; } }
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
/** Recherche globale : ouvre les transactions filtrées sur un marchand (et le mois de la transaction). */
export function showTransactions(q, date) { txFilter = { q, cat: '' }; tab = 'transactions'; if (date) month = ym(date); }

export async function renderPage(ctx, arg) {
  const { view } = ctx;
  if (arg && ['apercu', 'budget', 'transactions', 'avenir', 'abos', 'achats', 'livre'].includes(arg)) tab = arg;
  const all = (await db.all('money')).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const budget = (await db.get('settings', 'budget')) || { cats: {}, savings: 0 };
  month ||= curMonth();
  const hasData = all.length > 0;
  const months = [...new Set(all.map((t) => ym(t.date)))].sort();
  const shop = tab === 'achats' || tab === 'avenir' || tab === 'abos' || tab === 'livre';
  const weekly = (tab === 'apercu' && overView === 'semaine') || (tab === 'budget' && budgetView === 'semaine'); // la semaine a sa propre navigation // la liste d'achats et les paiements à venir ne dépendent pas des relevés
  // Sur cellulaire : icône + nom court sous l'icône (les 6 onglets tiennent sans défiler)
  const tabsHTML = `<div class="seg fi-tabs" role="tablist">${[['apercu', '📊', 'Aperçu', 'Aperçu'], ['budget', '🎯', 'Budget', 'Budget'], ['transactions', '🧾', 'Transactions', 'Dépenses'], ['avenir', '📅', 'À venir', 'À venir'], ['abos', '🔁', 'Abonnements', 'Abos'], ['achats', '🛒', 'Achats', 'À acheter'], ['livre', '📖', 'Livre d’or', 'Livre']].map(([k, e, l, s]) => `<button role="tab" data-tab="${k}" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}" aria-label="${l}"><span class="fi-tab-ico">${e}</span> <span class="fi-tab-l">${l}</span><span class="fi-tab-s">${s}</span></button>`).join('')}</div>`;

  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Argent</p><h1>Finances</h1></div>
      <div class="head-actions">
        <button class="btn" id="fi-auto" title="Import automatique depuis ton dossier Téléchargements et rappel hebdomadaire" aria-label="Import auto">⚙<span class="fi-long"> Import auto</span></button>
        <label class="btn primary" id="fi-import" title="Relevés .csv de ta banque (compte chèques, carte de crédit)"><input type="file" accept=".csv,text/csv" multiple hidden>⬆ <span class="fi-long">Importer un relevé .csv</span><span class="fi-short">Relevé</span></label>
      </div>
    </header>
    <div id="fi-autobar"></div>
    <div class="fi-bar">
      ${tabsHTML}
      ${hasData && !shop && !weekly ? `<div class="fi-month">
        <button class="btn icon" id="fi-prev" ${month <= months[0] ? 'disabled' : ''} aria-label="Mois précédent">‹</button>
        <b>${esc(monthName(month))}</b>
        <button class="btn icon" id="fi-next" ${month >= curMonth() ? 'disabled' : ''} aria-label="Mois suivant">›</button>
      </div>` : ''}
    </div>
    ${hasData || shop ? '<div id="fi-body"></div>' : emptyState()}
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
  view.querySelector('[data-fi-pick]')?.addEventListener('click', () => $('#fi-import input').click());
  $('#fi-auto').onclick = () => autoSettings(ctx, () => renderPage(ctx)).catch((err) => { console.error(err); ctx.toast('Import auto : ' + (err?.message || 'erreur'), 'err'); });
  // Dossier surveillé : nouveaux relevés importés à l'ouverture de la page
  (async () => {
    const st = await dirStatus();
    const bar = $('#fi-autobar');
    if (!bar || !st.on) return;
    if (st.perm !== 'granted') {
      bar.innerHTML = `<div class="fi-autobar warn">📁 Import auto : Edge demande de confirmer l’accès au dossier « ${esc(st.name)} ». <button class="btn sm-text" id="fi-perm">Autoriser et vérifier</button></div>`;
      bar.querySelector('#fi-perm').onclick = async (e) => {
        e.target.disabled = true; e.target.textContent = 'Vérification…';
        try { afterAuto(ctx, await autoImport({ ask: true }), () => renderPage(ctx)); }
        catch (err) { ctx.toast('Import auto : ' + (err?.message || 'erreur'), 'err'); }
        finally { if (e.target.isConnected) { e.target.disabled = false; e.target.textContent = 'Autoriser et vérifier'; } }
      };
      return;
    }
    const r = await autoImport();
    if (r?.added) afterAuto(ctx, r, () => renderPage(ctx));
    else if (bar.isConnected) bar.innerHTML = `<div class="fi-autobar">📁 Import auto actif : « ${esc(st.name)} » · aucun nouveau relevé</div>`;
  })().catch(console.error);
  // Glisser-déposer des fichiers sur la page
  const drop = $('#fi-drop');
  view.ondragover = (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); drop.hidden = false; } };
  drop.ondragleave = () => { drop.hidden = true; };
  drop.ondrop = (e) => { e.preventDefault(); drop.hidden = true; doImport(e.dataTransfer.files); };
  $$('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; renderPage(ctx); }));
  const body = $('#fi-body');
  if (tab === 'avenir') return drawUpcoming(ctx, body, all);
  if (tab === 'abos') return drawSubs(ctx, body, all);
  if (tab === 'livre') { body.addEventListener('lo-refresh', () => renderPage(ctx)); return livre.draw(ctx, body, all); }
  if (shop) return drawShopping(ctx, body);
  if (!hasData) return;
  $('#fi-prev')?.addEventListener('click', () => { month = monthsBack(month, 1); renderPage(ctx); });
  $('#fi-next')?.addEventListener('click', () => { month = monthsBack(month, -1); renderPage(ctx); });
  if (tab === 'budget') drawBudget(ctx, body, all, budget);
  else if (tab === 'transactions') drawTransactions(ctx, body, all);
  else drawOverview(ctx, body, all, budget).catch(console.error);
}

/* =========================================================
   🛒 Achats : liste de choses à acheter (réglage synchronisé « shopList », fusionné article par article)
   Article : { id, name, qty, price, cat, done, at, del } — un article retiré reste une « trace » (del)
   qui sert aux suggestions « Souvent achetés », effacée après 90 jours.
   ========================================================= */
const SHOP_KEY = 'shopList';
const SHOP_CATS = [['epicerie', '🥦 Épicerie'], ['maison', '🏠 Maison'], ['pharmacie', '💊 Pharmacie'], ['quincaillerie', '🔨 Quincaillerie'], ['vetements', '👕 Vêtements'], ['techno', '💻 Techno'], ['autre', '🛍 Autre']];
const SHOP_GUESS = [
  ['pharmacie', /tylenol|advil|vitamine|médic|medic|pansement|sirop|crème solaire|creme solaire|shampo|dentifrice|brosse à dents|déodorant|deodorant|rasoir/i],
  ['quincaillerie', /vis\b|clou|peinture|pinceau|ampoule|batterie|pile|ruban|colle|outil|perceuse|tournevis|silicone|planche|bois/i],
  ['maison', /papier|savon|lessive|détergent|detergent|éponge|eponge|sac(s)? (à|a) ordure|vaisselle|nettoy|essuie|serviette|chandelle|filtre/i],
  ['vetements', /chandail|pantalon|bas\b|chaussette|souliers?|bottes?|manteau|tuque|gants?|t-shirt|jeans?|sous-vêtement/i],
  ['techno', /câble|cable|chargeur|écouteur|ecouteur|clavier|souris|usb|hdmi|écran|ecran|disque/i],
  ['epicerie', /lait|pain|œuf|oeuf|fromage|beurre|yogourt|yaourt|viande|poulet|bœuf|boeuf|porc|poisson|pomme|banane|fruit|légume|legume|salade|tomate|patate|riz|pâtes|pates|farine|sucre|café|cafe|thé|the\b|jus|céréale|cereale|eau|bière|biere|vin\b|collation|chips|biscuit/i],
];
const guessCat = (name) => SHOP_GUESS.find(([, re]) => re.test(name))?.[0] || 'autre';
const shopCatLabel = (c) => (SHOP_CATS.find(([k]) => k === c) || SHOP_CATS[SHOP_CATS.length - 1])[1];

async function shopLoad() { return (await db.get('settings', SHOP_KEY)) || []; }
async function shopSave(list) {
  const limit = Date.now() - 90 * 864e5;
  await db.put('settings', list.filter((x) => !x.del || (x.at || 0) > limit), SHOP_KEY);
}

async function drawShopping(ctx, el) {
  const list = await shopLoad();
  const items = list.filter((x) => !x.del);
  const todo = items.filter((x) => !x.done).sort((a, b) => (b.at || 0) - (a.at || 0));
  const bought = items.filter((x) => x.done).sort((a, b) => (b.at || 0) - (a.at || 0));
  const total = todo.reduce((n, x) => n + (Number(x.price) || 0) * (Number(x.qty) || 1), 0);
  const priced = todo.filter((x) => Number(x.price) > 0).length;
  // Suggestions : articles déjà achetés ou retirés, qui ne sont pas dans la liste en ce moment
  const active = new Set(items.map((x) => x.name.trim().toLowerCase()));
  const seen = new Map();
  for (const x of [...list].sort((a, b) => (b.at || 0) - (a.at || 0))) {
    const k = x.name.trim().toLowerCase();
    if ((x.del || x.done) && !active.has(k) && !seen.has(k)) seen.set(k, x);
  }
  const sugg = [...seen.values()].slice(0, 14);
  const row = (x) => `<li class="sh-item ${x.done ? 'done' : ''}" data-id="${x.id}">
    <label class="sh-check"><input type="checkbox" ${x.done ? 'checked' : ''} aria-label="${x.done ? 'Remettre à acheter' : 'Acheté'} : ${esc(x.name)}"></label>
    <span class="sh-name"><a class="sh-link" href="https://www.amazon.ca/s?k=${encodeURIComponent(x.name)}" target="_blank" rel="noopener" title="Chercher « ${esc(x.name)} » sur Amazon">${esc(x.name)}</a>${Number(x.qty) > 1 ? ` <span class="sh-qty">×${Number(x.qty)}</span>` : ''}</span>
    ${Number(x.price) > 0 ? `<span class="sh-price">${$$$((Number(x.price) || 0) * (Number(x.qty) || 1))}</span>` : ''}
    <button class="x" data-del aria-label="Retirer ${esc(x.name)}">×</button></li>`;
  const groups = SHOP_CATS.map(([k, l]) => [l, todo.filter((x) => (SHOP_CATS.some(([c]) => c === x.cat) ? x.cat : 'autre') === k)]).filter(([, g]) => g.length);

  el.innerHTML = `
    <form class="card sh-add" id="sh-add">
      <input name="n" placeholder="Ajouter une chose à acheter…" autocomplete="off" required>
      <input name="q" type="number" inputmode="numeric" min="1" max="99" placeholder="Qté" aria-label="Quantité" class="sh-q">
      <input name="p" type="number" inputmode="decimal" min="0" step="0.01" placeholder="Prix $" aria-label="Prix estimé (facultatif)" class="sh-p">
      <select name="c" aria-label="Catégorie">${SHOP_CATS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
      <button class="btn primary">Ajouter</button>
    </form>
    <div class="sh-sum">${todo.length ? `<b>${todo.length}</b> à acheter${priced ? ` · ≈ <b>${$$$(total)}</b>${priced < todo.length ? ` <small class="muted">(${priced} avec un prix)</small>` : ''}` : ''}` : '<span class="muted">Rien à acheter pour l’instant 🎉</span>'}</div>
    ${groups.map(([l, g]) => `<section class="card sh-group"><h3>${l} <span class="muted">${g.length}</span></h3><ul class="sh-list">${g.map(row).join('')}</ul></section>`).join('')}
    ${sugg.length ? `<section class="card sh-sugg"><h3>↺ Souvent achetés</h3><div class="sh-chips">${sugg.map((x) => `<button type="button" class="chip-btn" data-re="${x.id}" title="Remettre dans la liste">+ ${esc(x.name)}</button>`).join('')}</div></section>` : ''}
    ${bought.length ? `<section class="card sh-group sh-bought"><div class="card-head"><h3>✓ Dans le panier <span class="muted">${bought.length}</span></h3><button type="button" class="btn sm-text" id="sh-clear">Retirer les achetés</button></div><ul class="sh-list">${bought.map(row).join('')}</ul></section>` : ''}
    <p class="hint muted">Coche ce que tu as mis dans le panier, puis « Retirer les achetés ». La liste se synchronise avec ton cellulaire : parfait à l’épicerie.</p>`;

  const redraw = () => drawShopping(ctx, el);
  const edit = async (id, fn) => {
    const cur = await shopLoad();
    const x = cur.find((i) => i.id === id);
    if (!x) return;
    fn(x);
    x.at = Date.now();
    await shopSave(cur);
    redraw();
  };
  const form = el.querySelector('#sh-add');
  let catTouched = false;
  form.c.onchange = () => { catTouched = true; };
  form.n.oninput = () => { if (!catTouched) form.c.value = guessCat(form.n.value); };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = form.n.value.trim();
    if (!name) return;
    const cur = await shopLoad();
    cur.push({ id: U.uid(), name, qty: Math.max(1, Number(form.q.value) || 1), price: Number(form.p.value) || 0, cat: form.c.value, done: false, at: Date.now() });
    await shopSave(cur);
    await redraw();
    el.querySelector('#sh-add input[name="n"]')?.focus();
  };
  el.querySelectorAll('.sh-item').forEach((li) => {
    const id = li.dataset.id;
    li.querySelector('input[type="checkbox"]').onchange = (e) => edit(id, (x) => { x.done = e.target.checked; });
    li.querySelector('[data-del]').onclick = async () => {
      const name = li.querySelector('.sh-link')?.textContent?.trim() || 'Article';
      await edit(id, (x) => { x.del = true; });
      showUndo(`🛒 « ${name} » retiré`, () => edit(id, (x) => { x.del = false; }), 5000);
    };
  });
  el.querySelectorAll('[data-re]').forEach((b) => (b.onclick = async () => {
    const cur = await shopLoad();
    const src = cur.find((i) => i.id === b.dataset.re);
    if (!src) return;
    cur.push({ id: U.uid(), name: src.name, qty: src.qty || 1, price: src.price || 0, cat: src.cat || guessCat(src.name), done: false, at: Date.now() });
    await shopSave(cur);
    redraw();
  }));
  el.querySelector('#sh-clear')?.addEventListener('click', async () => {
    const cur = await shopLoad();
    const now = Date.now();
    const ids = [];
    for (const x of cur) if (x.done && !x.del) { x.del = true; x.at = now; ids.push(x.id); }
    await shopSave(cur);
    redraw();
    showUndo(`🛒 ${ids.length > 1 ? `${ids.length} achats retirés` : 'Achat retiré'} de la liste`, async () => {
      const back = await shopLoad();
      for (const x of back) if (ids.includes(x.id)) { x.del = false; x.at = Date.now(); }
      await shopSave(back);
      redraw();
    }, 6000);
  });
}

/* =========================================================
   📅 À venir : paiements prévus (abonnements, versements, factures)
   Réglage synchronisé « upcoming », fusionné article par article (comme la liste d'achats).
   Paiement : { id, name, amount, date: 'AAAA-MM-JJ', recur: '' | 'weekly' | 'monthly' | 'yearly', until, note, source, at, del }
   Suggestions en direct : événements de Google Agenda qui ressemblent à un paiement, et frais réguliers des relevés.
   ========================================================= */
const UP_KEY = 'upcoming';
const RECUR = [['', 'Une fois'], ['weekly', 'Chaque semaine'], ['monthly', 'Chaque mois'], ['yearly', 'Chaque année']];
const PAY_RE = /paiement|payment|facture|abonnement|loyer|hypoth|versement|renouvellement|assurance|prélèvement|prelevement/i;

async function upLoad() { return (await db.get('settings', UP_KEY)) || []; }
async function upSave(list) {
  const limit = Date.now() - 120 * 864e5;
  await db.put('settings', list.filter((x) => !x.del || (x.at || 0) > limit), UP_KEY);
}
const isoOf = (d) => U.iso(d);
function nextDate(date, recur) {
  const d = U.parseISO(date);
  if (recur === 'weekly') return isoOf(U.addDays(d, 7));
  if (recur === 'yearly') return isoOf(new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()));
  // Mensuel : même jour le mois suivant (le 31 devient le dernier jour du mois s'il est plus court)
  const day = d.getDate(), n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  n.setDate(Math.min(day, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()));
  return isoOf(n);
}
/** Dates d'échéance d'un paiement entre deux dates (récurrence et date de fin incluses). */
function occurrences(x, from, to) {
  const out = [];
  let d = x.date;
  for (let i = 0; i < 60 && d <= to; i++) {
    if (x.until && d > x.until) { if (i && (U.parseISO(d) - U.parseISO(x.until)) / 864e5 <= 7 && x.until >= from && x.until <= to) out.push(x.until); break; }
    if (d >= from) out.push(d);
    if (!x.recur) break;
    d = nextDate(d, x.recur);
  }
  return out;
}
const amountIn = (s = '') => {
  const m = String(s).match(/(\d{1,5}(?:[.,]\d{2}))\s*\$|\$\s*(\d{1,5}(?:[.,]\d{2}))/);
  return m ? Number((m[1] || m[2]).replace(',', '.')) : 0;
};
const sameName = (a, b) => { const n = (s) => String(s).toLowerCase().replace(/^paiement\s+/, '').replace(/\(.*?\)|[^a-z0-9à-ÿ ]/g, '').trim(); return n(a) && (n(a).includes(n(b)) || n(b).includes(n(a))); };

async function drawUpcoming(ctx, el, all) {
  const today = U.iso(new Date());
  const in30 = U.iso(U.addDays(new Date(), 30)), in90 = U.iso(U.addDays(new Date(), 90));
  const list = (await upLoad()).filter((x) => !x.del).sort((a, b) => a.date.localeCompare(b.date));
  const total30 = list.reduce((n, x) => n + occurrences(x, today, in30).length * (Number(x.amount) || 0), 0);
  const late = list.filter((x) => x.date < today);
  const weekEnd = U.iso(U.addDays(new Date(), 7));
  const groups = [
    ['⚠ En retard', late],
    ['Cette semaine', list.filter((x) => x.date >= today && x.date <= weekEnd)],
    ['Dans les 30 jours', list.filter((x) => x.date > weekEnd && x.date <= in30)],
    ['Plus tard', list.filter((x) => x.date > in30)],
  ].filter(([, g]) => g.length);
  const rl = (r) => RECUR.find(([k]) => k === r)?.[1] || '';
  const when = (d) => { const n = Math.round((U.parseISO(d) - U.parseISO(today)) / 864e5); return n === 0 ? 'Aujourd’hui' : n === 1 ? 'Demain' : n < 0 ? `il y a ${-n} j` : `dans ${n} j`; };
  const row = (x) => `<li class="up-item ${x.date < today ? 'late' : ''}" data-id="${x.id}">
    <span class="up-date"><b>${U.parseISO(x.date).getDate()}</b><small>${U.parseISO(x.date).toLocaleDateString('fr-CA', { month: 'short' }).replace('.', '')}</small></span>
    <span class="up-main"><b>${esc(x.name)}</b><small class="muted">${when(x.date)}${x.recur ? ` · ${rl(x.recur)}` : ''}${x.until ? ` jusqu’au ${U.fmtShort(U.parseISO(x.until))}` : ''}${x.note ? ` · ${esc(x.note)}` : ''}</small></span>
    <span class="up-amt">${Number(x.amount) ? $$$(Number(x.amount)) : '—'}</span>
    <span class="up-acts"><button class="btn sm" data-paid title="Payé${x.recur ? ' : passe à la prochaine échéance' : ''}">✓</button><button class="btn sm" data-edit aria-label="Modifier">✎</button><button class="btn sm" data-del aria-label="Retirer">×</button></span>
  </li>`;

  el.innerHTML = `
    <div class="up-sum card"><div><b>${$$$(total30)}</b><small class="muted">à payer dans les 30 prochains jours</small></div>
      <div><b>${list.length}</b><small class="muted">paiement${list.length > 1 ? 's' : ''} suivi${list.length > 1 ? 's' : ''}</small></div>
      ${late.length ? `<div class="warn"><b>${late.length}</b><small>en retard</small></div>` : ''}
      <span class="grow"></span>
      <label class="btn" title="Importer une liste de paiements (.json)"><input type="file" id="up-imp" accept=".json,application/json" hidden>⬆ Importer</label>
    </div>
    <form class="card up-add" id="up-add">
      <input name="n" placeholder="Nouveau paiement (ex. Loyer, Hydro, Netflix)…" required autocomplete="off">
      <input name="a" type="number" inputmode="decimal" min="0" step="0.01" placeholder="Montant $" aria-label="Montant">
      <input name="d" type="date" value="${today}" aria-label="Date d’échéance">
      <select name="r" aria-label="Récurrence">${RECUR.map(([k, l]) => `<option value="${k}" ${k === 'monthly' ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="btn primary">Ajouter</button>
    </form>
    ${groups.map(([l, g]) => `<section class="card up-group"><h3>${l} <span class="muted">${g.length}</span></h3><ul class="up-list">${g.map(row).join('')}</ul></section>`).join('')
      || '<p class="empty-sm">Aucun paiement à venir. Ajoute-en un ci-dessus, ou accepte les suggestions ci-dessous.</p>'}
    <div id="up-sugg"></div>
    <p class="hint muted">✓ marque un paiement comme payé : un paiement récurrent passe à sa prochaine échéance. Les suggestions viennent de ton Google Agenda (événements « Paiement… ») et des frais qui reviennent chaque mois dans tes relevés.</p>`;

  const redraw = () => drawUpcoming(ctx, el, all);
  const edit = async (id, fn) => { const cur = await upLoad(); const x = cur.find((i) => i.id === id); if (!x) return; fn(x); x.at = Date.now(); await upSave(cur); redraw(); };
  const form = el.querySelector('#up-add');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const cur = await upLoad();
    cur.push({ id: U.uid(), name: form.n.value.trim(), amount: Number(form.a.value) || 0, date: form.d.value || today, recur: form.r.value, until: '', note: '', source: 'manuel', at: Date.now() });
    await upSave(cur);
    ctx.toast('📅 Paiement ajouté');
    redraw();
  };
  el.querySelectorAll('.up-item').forEach((li) => {
    const id = li.dataset.id;
    li.querySelector('[data-paid]').onclick = () => edit(id, (x) => {
      const nx = x.recur ? nextDate(x.date, x.recur) : null;
      if (nx && (!x.until || nx <= x.until)) x.date = nx;
      // Dernier versement tombé quelques jours avant la date calculée (ex. le 1er au lieu du 2) : c'est lui
      else if (nx && x.until && x.until > x.date && (U.parseISO(nx) - U.parseISO(x.until)) / 864e5 <= 7) x.date = x.until;
      else x.del = true; // dernier versement payé : retiré
    });
    li.querySelector('[data-del]').onclick = async () => { if (await ctx.confirmBox('Retirer ce paiement de la liste ?', 'Retirer')) edit(id, (x) => { x.del = true; }); };
    li.querySelector('[data-edit]').onclick = async () => {
      const x = (await upLoad()).find((i) => i.id === id);
      ctx.modal(`<h2>Modifier le paiement</h2><form class="form" id="up-ed">
        <label>Nom<input name="n" value="${esc(x.name)}" required></label>
        <label>Montant ($)<input name="a" type="number" inputmode="decimal" min="0" step="0.01" value="${Number(x.amount) || ''}"></label>
        <label>Prochaine échéance<input name="d" type="date" value="${x.date}" required></label>
        <label>Récurrence<select name="r">${RECUR.map(([k, l]) => `<option value="${k}" ${k === (x.recur || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Dernier paiement (facultatif)<input name="u" type="date" value="${x.until || ''}"></label>
        <label>Note<input name="o" value="${esc(x.note || '')}" autocomplete="off"></label>
        <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`, (m, close) => {
        m.querySelector('#up-ed').onsubmit = async (e) => {
          e.preventDefault();
          const f = e.target;
          close();
          edit(id, (y) => { y.name = f.n.value.trim(); y.amount = Number(f.a.value) || 0; y.date = f.d.value; y.recur = f.r.value; y.until = f.u.value; y.note = f.o.value.trim(); });
        };
      });
    };
  });
  // Importer une liste (.json) : { items: [...] } — les doublons (même nom et même date) sont ignorés
  el.querySelector('#up-imp').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const items = Array.isArray(data) ? data : data.items || [];
      const cur = await upLoad();
      let added = 0;
      for (const it of items) {
        if (!it?.name || !/^\d{4}-\d{2}-\d{2}$/.test(it.date || '')) continue;
        if (cur.some((x) => !x.del && sameName(x.name, it.name))) continue;
        cur.push({ id: U.uid(), name: String(it.name).slice(0, 80), amount: Number(it.amount) || 0, date: it.date, recur: ['weekly', 'monthly', 'yearly'].includes(it.recur) ? it.recur : '', until: /^\d{4}-\d{2}-\d{2}$/.test(it.until || '') ? it.until : '', note: String(it.note || '').slice(0, 140), source: String(it.source || 'import'), at: Date.now() });
        added++;
      }
      await upSave(cur);
      ctx.toast(`📅 ${added} paiement${added > 1 ? 's' : ''} importé${added > 1 ? 's' : ''}${items.length - added ? ` · ${items.length - added} déjà suivi${items.length - added > 1 ? 's' : ''}` : ''}`);
      redraw();
    } catch { ctx.toast('Fichier illisible : choisis le fichier .json des paiements', 'err'); }
  };

  // Suggestions : Google Agenda (90 jours) et frais réguliers des relevés, pas encore suivis
  (async () => {
    const box = el.querySelector('#up-sugg');
    const sugg = [];
    try {
      const from = new Date(), to = U.addDays(new Date(), 90);
      let evs = [];
      try { evs = await gcal.listEvents(from, to); } catch { evs = (await gcal.cachedEvents(from, to).catch(() => null)) || []; }
      // Un même paiement qui revient plusieurs fois dans les 90 jours est mensuel
      const byName = new Map();
      for (const e of (Array.isArray(evs) ? evs : evs?.events || [])) {
        const t = e.title || '';
        if (!PAY_RE.test(t) || /^\s*\[?fait\]?/i.test(t)) continue;
        const name = t.replace(/^paiement\s+/i, '').replace(/\s*\(\$?\s*[\d.,]+\s*\$?\)\s*$/, '').trim();
        if (!name || list.some((x) => sameName(x.name, name))) continue;
        const k = name.toLowerCase();
        if (byName.has(k)) { byName.get(k).count++; continue; }
        byName.set(k, { name, amount: amountIn(t) || amountIn(e.description), date: U.iso(new Date(e.start)), count: 1 });
      }
      for (const s of byName.values()) sugg.push({ name: s.name, amount: s.amount, date: s.date, recur: s.count > 1 ? 'monthly' : '', src: '📅 Agenda' });
    } catch { /* agenda non connecté */ }
    for (const r of recurring(all, curMonth())) {
      if (list.some((x) => sameName(x.name, r.name)) || sugg.some((s) => sameName(s.name, r.name))) continue;
      const last = all.filter((t) => t.key === r.key).map((t) => t.date).sort().pop();
      if (!last) continue;
      let d = nextDate(last, 'monthly');
      while (d < today) d = nextDate(d, 'monthly');
      sugg.push({ name: r.name, amount: Math.round(r.monthly * 100) / 100, date: d, recur: 'monthly', src: '🧾 Relevés' });
    }
    if (!sugg.length || !box.isConnected) return;
    box.innerHTML = `<section class="card up-group up-sugg"><h3>💡 Suggestions <span class="muted">${sugg.length}</span></h3><ul class="up-list">${sugg.slice(0, 12).map((s, i) => `<li class="up-item">
      <span class="up-date"><b>${U.parseISO(s.date).getDate()}</b><small>${U.parseISO(s.date).toLocaleDateString('fr-CA', { month: 'short' }).replace('.', '')}</small></span>
      <span class="up-main"><b>${esc(s.name)}</b><small class="muted">${s.src}${s.recur ? ' · chaque mois' : ''}</small></span>
      <span class="up-amt">${s.amount ? $$$(s.amount) : '—'}</span>
      <span class="up-acts"><button class="btn sm primary" data-follow="${i}">+ Suivre</button></span></li>`).join('')}</ul></section>`;
    box.querySelectorAll('[data-follow]').forEach((b) => (b.onclick = async () => {
      const s = sugg[Number(b.dataset.follow)];
      const cur = await upLoad();
      cur.push({ id: U.uid(), name: s.name, amount: s.amount || 0, date: s.date, recur: s.recur, until: '', note: '', source: s.src, at: Date.now() });
      await upSave(cur);
      ctx.toast(`📅 « ${s.name} » suivi`);
      redraw();
    }));
  })();
}

/* =========================================================
   🔁 Abonnements : tableau de tous les paiements récurrents
   — ceux suivis dans « À venir » (chaque semaine / mois / année) et ceux détectés dans les relevés.
   Un frais détecté peut être suivi (+ Suivre) ou masqué (lp.subsHidden, propre à l'appareil).
   ========================================================= */
const SUBS_HIDE = 'lp.subsHidden';
const subsHidden = () => { try { return JSON.parse(localStorage.getItem(SUBS_HIDE) || '[]'); } catch { return []; } };
const PER_MONTH = { weekly: 52 / 12, monthly: 1, yearly: 1 / 12 };
let subsSort = 'month';

async function drawSubs(ctx, el, all) {
  const redraw = () => drawSubs(ctx, el, all);
  const today = U.iso(new Date());
  const tracked = (await upLoad()).filter((x) => !x.del && x.recur && !(x.until && x.until < today));
  const spend = all.filter((t) => t.kind === 'depense');
  const lastFor = (name, key) => spend.filter((t) => (key ? t.key === key : sameName(t.merchant, name))).map((t) => t.date).sort().pop() || '';
  const hidden = new Set(subsHidden());
  const rows = tracked.map((x) => {
    const tx = spend.find((t) => sameName(t.merchant, x.name));
    return { id: x.id, name: x.name, cat: tx?.cat || 'abonnements', recur: x.recur, amount: Number(x.amount) || 0,
      monthly: (Number(x.amount) || 0) * PER_MONTH[x.recur], next: x.date, last: lastFor(x.name), until: x.until, src: 'suivi' };
  });
  for (const r of recurring(all, curMonth())) {
    if (hidden.has(r.key) || rows.some((x) => sameName(x.name, r.name))) continue;
    const last = lastFor(r.name, r.key);
    let next = last ? nextDate(last, 'monthly') : '';
    while (next && next < today) next = nextDate(next, 'monthly');
    rows.push({ key: r.key, name: r.name, cat: r.cat, recur: 'monthly', amount: Math.round(r.monthly * 100) / 100, monthly: r.monthly, next, last, src: 'detecte' });
  }
  const sorts = { month: (a, b) => b.monthly - a.monthly, name: (a, b) => a.name.localeCompare(b.name, 'fr'), next: (a, b) => (a.next || '9').localeCompare(b.next || '9') };
  rows.sort(sorts[subsSort]);
  const perMonth = rows.reduce((n, x) => n + x.monthly, 0);
  const rl = (r) => ({ weekly: 'Semaine', monthly: 'Mois', yearly: 'Année' })[r] || '';
  const d = (s) => (s ? U.fmtShort(U.parseISO(s)) : '—');
  const th = (k, l) => `<th${k ? ` data-sort="${k}" class="sortable ${subsSort === k ? 'on' : ''}"` : ''}>${l}${subsSort === k ? ' ▾' : ''}</th>`;

  el.innerHTML = `
    <div class="up-sum card"><div><b>${$$$(perMonth)}</b><small class="muted">par mois</small></div>
      <div><b>${$$$(perMonth * 12, true)}</b><small class="muted">par année</small></div>
      <div><b>${rows.length}</b><small class="muted">abonnement${rows.length > 1 ? 's' : ''}</small></div>
    </div>
    ${rows.length ? `<div class="card subs-wrap"><table class="subs-table">
      <thead><tr>${th('name', 'Abonnement')}<th>Fréquence</th><th class="num">Montant</th>${th('month', 'Par mois')}<th class="num">Par année</th>${th('next', 'Prochain')}<th>Dernier débit</th><th></th></tr></thead>
      <tbody>${rows.map((x, i) => `<tr class="${x.src === 'detecte' ? 'detected' : ''}">
        <td><span class="subs-name">${catOf(x.cat).emoji} <b>${esc(x.name)}</b></span>${x.src === 'detecte' ? '<small class="subs-tag">🧾 détecté</small>' : ''}${x.until ? `<small class="muted"> jusqu’au ${d(x.until)}</small>` : ''}</td>
        <td>${rl(x.recur)}</td>
        <td class="num">${x.amount ? $$$(x.amount) : '—'}</td>
        <td class="num"><b>${$$$(x.monthly)}</b></td>
        <td class="num">${$$$(x.monthly * 12, true)}</td>
        <td>${d(x.next)}</td>
        <td class="muted">${d(x.last)}</td>
        <td class="subs-act-cell"><span class="subs-acts">${x.src === 'detecte'
          ? `<button class="btn sm primary" data-follow="${i}" title="Suivre dans À venir">+</button><button class="btn sm" data-hide="${i}" title="Ce n’est pas un abonnement" aria-label="Masquer">×</button>`
          : '<a class="btn sm" href="#/finance/avenir" title="Modifier dans À venir" aria-label="Modifier">✎</a>'}</span></td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td></td><td></td><td class="num"><b>${$$$(perMonth)}</b></td><td class="num"><b>${$$$(perMonth * 12, true)}</b></td><td></td><td></td><td></td></tr></tfoot>
    </table></div>` : '<p class="empty-sm">Aucun abonnement pour l’instant. Ajoute un paiement récurrent dans 📅 À venir, ou importe tes relevés : les frais qui reviennent chaque mois apparaîtront ici.</p>'}
    <p class="hint muted">Les abonnements suivis viennent de 📅 À venir (paiements chaque semaine, mois ou année). Ceux marqués « détecté » reviennent au moins deux mois dans tes relevés : suis-les ou masque-les.</p>`;

  el.querySelectorAll('[data-sort]').forEach((h) => (h.onclick = () => { subsSort = h.dataset.sort; redraw(); }));
  el.querySelectorAll('[data-follow]').forEach((b) => (b.onclick = async () => {
    const x = rows[Number(b.dataset.follow)];
    const cur = await upLoad();
    cur.push({ id: U.uid(), name: x.name, amount: x.amount, date: x.next || today, recur: 'monthly', until: '', note: '', source: '🧾 Relevés', at: Date.now() });
    await upSave(cur);
    ctx.toast(`🔁 « ${x.name} » suivi dans À venir`);
    redraw();
  }));
  el.querySelectorAll('[data-hide]').forEach((b) => (b.onclick = () => {
    const x = rows[Number(b.dataset.hide)];
    try { localStorage.setItem(SUBS_HIDE, JSON.stringify([...hidden, x.key])); } catch { /* stockage indisponible */ }
    ctx.toast(`« ${x.name} » masqué des abonnements`);
    redraw();
  }));
}

/* ---------- Ajout rapide (bouton ＋ / touche N) ---------- */
/** Dépense entrée à la main (ex. comptant). Remplacée par la vraie transaction quand le relevé est importé. */
export async function addExpense({ name, amount, date = U.iso(new Date()) }) {
  const rules = await db.get('settings', 'moneyRules');
  const t = { id: 'q' + U.uid(), src: 'manuel', account: 'Ajout rapide', date, time: '', kind: 'depense', merchant: name.slice(0, 40), key: merchantKey(name), amount: -Math.abs(amount), pending: false, raw: 'Ajout rapide' };
  t.cat = defaultCat(t, rules);
  await db.put('money', t);
  return t;
}
/** Ajoute des articles à la liste d'achats (ceux déjà sur la liste ne sont pas doublés). */
export async function addShopItems(names) {
  const cur = await shopLoad();
  const open = new Set(cur.filter((x) => !x.del && !x.done).map((x) => x.name.toLowerCase()));
  const add = names.map((n) => n.trim()).filter((n) => n && !open.has(n.toLowerCase()));
  for (const name of add) cur.push({ id: U.uid(), name, qty: 1, price: 0, cat: guessCat(name), done: false, at: Date.now() });
  if (add.length) await shopSave(cur);
  return add.length;
}

/** Carte « 🛒 Achats » de la page Aujourd'hui : prochains articles à cocher et ajout rapide. */
export async function shopCard(el) {
  if (!el) return;
  const todo = (await shopLoad()).filter((x) => !x.del && !x.done).sort((a, b) => (b.at || 0) - (a.at || 0));
  const shown = todo.slice(0, 6);
  el.innerHTML = `<div class="card-head"><h2>🛒 Achats</h2><a href="#/finance/achats">${todo.length ? `${todo.length} à acheter →` : 'Ouvrir →'}</a></div>
    ${shown.length ? `<ul class="sh-list sh-mini">${shown.map((x) => `<li class="sh-item" data-id="${x.id}">
      <label class="sh-check"><input type="checkbox" aria-label="Acheté : ${esc(x.name)}"></label>
      <span class="sh-name"><a class="sh-link" href="https://www.amazon.ca/s?k=${encodeURIComponent(x.name)}" target="_blank" rel="noopener" title="Chercher « ${esc(x.name)} » sur Amazon">${esc(x.name)}</a>${Number(x.qty) > 1 ? ` <span class="sh-qty">×${Number(x.qty)}</span>` : ''}</span></li>`).join('')}</ul>
      ${todo.length > shown.length ? `<p class="muted sh-more"><a href="#/finance/achats">+ ${todo.length - shown.length} autre${todo.length - shown.length > 1 ? 's' : ''}</a></p>` : ''}`
      : '<p class="empty-sm">Rien à acheter pour l’instant. <button type="button" class="link-btn" data-qa="acheter " data-qa-type="shop">＋ Ajouter un article</button></p>'}
    <form class="sh-quick"><input name="n" placeholder="+ Ajouter à la liste…" autocomplete="off" aria-label="Ajouter une chose à acheter"><button class="btn icon" aria-label="Ajouter">+</button></form>`;
  el.querySelectorAll('.sh-item input[type="checkbox"]').forEach((cb) => (cb.onchange = async () => {
    const id = cb.closest('.sh-item').dataset.id;
    const cur = await shopLoad();
    const x = cur.find((i) => i.id === id);
    if (x) { x.done = cb.checked; x.at = Date.now(); await shopSave(cur); }
    cb.closest('.sh-item').classList.toggle('done', cb.checked);
    setTimeout(() => shopCard(el), 700); // laisse voir la case cochée un instant
  }));
  el.querySelector('.sh-quick').onsubmit = async (e) => {
    e.preventDefault();
    const name = e.target.n.value.trim();
    if (!name) return;
    const cur = await shopLoad();
    cur.push({ id: U.uid(), name, qty: 1, price: 0, cat: guessCat(name), done: false, at: Date.now() });
    await shopSave(cur);
    await shopCard(el);
    el.querySelector('.sh-quick input')?.focus();
  };
}

function emptyState() {
  return `<section class="card fi-empty">
    <h2>Suis tes dépenses et garde le cap 💰</h2>
    <div class="empty-acts">
      <button class="btn primary" data-fi-pick>⬆ Importer mon premier relevé</button>
      <button class="btn" data-qa="" data-qa-type="expense">＋ Entrer une dépense à la main</button>
    </div>
    <ol>
      <li>Dans ton application bancaire, exporte l’historique de ton <b>compte chèques</b> (et de ta <b>carte de crédit</b>) en fichier <b>.csv</b>.</li>
      <li>Touche <b>⬆ Importer un relevé .csv</b> (ou glisse les fichiers sur cette page).</li>
      <li>Les dépenses sont classées toutes seules (épicerie, restos, essence…) ; tu peux corriger une catégorie en un clic.</li>
      <li>Dans <b>🎯 Budget</b>, l’app te propose un budget d’après tes 3 derniers mois. Ajuste-le, puis suis ton mois ici.</li>
    </ol>
    <p class="muted">Réimporter un relevé plus récent ajoute seulement les nouvelles transactions (pas de doublons). Tout reste sur tes appareils et dans ta synchronisation Google Drive privée ; les courriels des destinataires et les numéros de compte ne sont pas enregistrés.</p>
  </section>`;
}

/* =========================================================
   Import automatique (dossier Téléchargements) et rappel hebdomadaire
   ========================================================= */
// Le dossier choisi est gardé sur cet appareil (store « cache », jamais synchronisé).
// On ne lit que les relevés Wealthsimple : chequing-activities-….csv et credit-card-activities-….csv.
const DIR_KEY = 'financeDir', SEEN_KEY = 'financeDirSeen';
const STATEMENT_RE = /^(chequing|credit-card)-activities.*\.csv$/i;
export const canWatch = () => typeof window.showDirectoryPicker === 'function';
export async function dirStatus() {
  const h = await db.get('cache', DIR_KEY).catch(() => null);
  if (!h) return { on: false };
  let perm = 'prompt';
  // Edge peut tarder à répondre pour un dossier enregistré : on n'attend pas plus de 2 s
  try { perm = await Promise.race([h.queryPermission({ mode: 'read' }), new Promise((r) => setTimeout(() => r('prompt'), 2000))]); } catch { /* ignore */ }
  return { on: true, name: h.name, perm, last: (await db.get('cache', 'financeDirLast')) || 0 };
}
async function chooseDir() {
  const h = await window.showDirectoryPicker({ id: 'lp-finance', mode: 'read', startIn: 'downloads' });
  await db.put('cache', h, DIR_KEY);
  // Les relevés déjà importés à la main ne seront pas relus : on mémorise ceux qui sont là
  return h;
}
/** Importe les nouveaux relevés du dossier surveillé. ask : peut demander la permission (après un clic). */
export async function autoImport({ ask = false } = {}) {
  const h = await db.get('cache', DIR_KEY).catch(() => null);
  if (!h) return null;
  // Edge reste parfois sans répondre pour un dossier enregistré : on n'attend jamais indéfiniment
  const wait = (p, ms, v) => Promise.race([p.catch(() => 'denied'), new Promise((r) => setTimeout(() => r(v), ms))]);
  let perm = ask ? await wait(h.requestPermission({ mode: 'read' }), 15000, 'stuck') : await wait(h.queryPermission({ mode: 'read' }), 2000, 'prompt');
  if (perm === 'stuck' || (ask && perm !== 'granted')) return { needPick: true, name: h.name };
  if (perm !== 'granted') return { needPermission: true };
  const seen = (await db.get('cache', SEEN_KEY)) || {};
  const files = [];
  for await (const entry of h.values()) {
    if (entry.kind !== 'file' || !STATEMENT_RE.test(entry.name)) continue;
    const f = await entry.getFile();
    const sig = `${f.size}|${f.lastModified}`;
    if (seen[entry.name] === sig) continue;
    files.push(f);
    seen[entry.name] = sig;
  }
  await db.put('cache', Date.now(), 'financeDirLast');
  if (!files.length) return { files: 0, added: 0 };
  const rep = await importFiles(files);
  await db.put('cache', seen, SEEN_KEY);
  await completeReminder(); // le relevé de la semaine est rentré : la mission de rappel se coche toute seule
  return { files: files.length, added: rep.reduce((a, r) => a + (r.added || 0), 0), rep };
}
function afterAuto(ctx, r, redraw) {
  if (!r) return;
  if (r.needPick) { // l'autorisation n'a pas marché : rechoisir le dossier redonne l'accès à coup sûr
    const bar = document.querySelector('#fi-autobar');
    if (bar) {
      bar.innerHTML = `<div class="fi-autobar warn">📁 Edge n’a pas donné l’accès au dossier « ${esc(r.name || '')} ». Choisis-le à nouveau pour réactiver l’import auto. <button class="btn sm-text" id="fi-repick">📁 Choisir le dossier</button></div>`;
      bar.querySelector('#fi-repick').onclick = async () => {
        try { await chooseDir(); afterAuto(ctx, await autoImport({ ask: true }), redraw); } catch (err) { if (err?.name !== 'AbortError') ctx.toast(err.message || 'Impossible', 'err'); }
      };
    }
    ctx.toast('Accès au dossier non accordé : rechoisis le dossier', 'err');
    return;
  }
  if (r.needPermission) { ctx.toast('Accès au dossier refusé : l’import auto attendra ton autorisation', 'err'); return; }
  ctx.toast(r.files ? `📁 ${r.files} relevé${r.files > 1 ? 's' : ''} importé${r.files > 1 ? 's' : ''} automatiquement · ${r.added} nouvelle${r.added > 1 ? 's' : ''} transaction${r.added > 1 ? 's' : ''}` : '📁 Aucun nouveau relevé dans le dossier');
  redraw();
}

// Rappel : une mission « Exporter tes relevés Wealthsimple » chaque semaine (réglage synchronisé, une seule fois par semaine)
const REM_KEY = 'financeReminder', REM_LAST = 'financeReminderLast';
const WS_URL = 'https://my.wealthsimple.com/app/activity';
export async function reminderCfg() { return { on: true, day: 0, time: '10:00', ...((await db.get('settings', REM_KEY)) || {}) }; }
/** Crée la mission de rappel de la semaine si son jour est arrivé (appelé au démarrage de l'app). */
export async function checkReminder() {
  const cfg = await reminderCfg();
  if (!cfg.on) return;
  const today = new Date();
  const back = (today.getDay() - cfg.day + 7) % 7;
  const due = U.addDays(U.startOfDay(today), -back); // dernier jour de rappel (aujourd'hui compris)
  const week = U.iso(due);
  const last = await db.get('settings', REM_LAST);
  if (!last) { // premier démarrage : le premier rappel sera au prochain jour choisi (sauf si c'est aujourd'hui)
    if (back !== 0) { await db.put('settings', week, REM_LAST); return; }
  } else if (last >= week) return;
  await db.put('settings', week, REM_LAST);
  const { addTask } = await import('./tasks.js');
  const t = await addTask('📥 Exporter tes relevés Wealthsimple', U.iso(today));
  const cur = await db.get('tasks', t.id);
  cur.kind = 'finance-export';
  cur.notes = `Dans Wealthsimple : Activité → choisis le compte chèques (et la carte de crédit) → Exporter en .csv.\n${WS_URL}\nSi l’import auto est actif, la mission se coche toute seule quand le fichier arrive dans ton dossier Téléchargements.`;
  const [h, m] = cfg.time.split(':').map(Number);
  const at = new Date(today); at.setHours(h, m, 0, 0);
  if (at > today) cur.alarmAt = at.getTime(); // alarme à l'heure choisie (si elle n'est pas passée)
  await db.put('tasks', cur);
}
async function completeReminder() {
  const open = (await db.all('tasks')).filter((t) => t.kind === 'finance-export' && !t.done);
  if (!open.length) return;
  const { setTaskDone } = await import('./tasks.js');
  for (const t of open) await setTaskDone(t.id, true);
}

async function autoSettings(ctx, onDone) {
  const st = await dirStatus();
  const rem = await reminderCfg();
  const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  ctx.modal(`<h2>Import automatique</h2>
    <section class="fi-auto-sec">
      <h3>📁 Dossier surveillé</h3>
      ${!canWatch() ? '<p class="muted">Disponible sur ordinateur, dans Edge ou Chrome. Sur cellulaire, continue avec « Importer un relevé » : la synchro apporte les imports faits sur ton ordi.</p>'
        : st.on ? `<p>Actif : <b>${esc(st.name)}</b>${st.last ? ` · vérifié ${esc(U.fmtShort(new Date(st.last)))} ${esc(U.fmtTime(new Date(st.last)))}` : ''}.</p>
          <p class="muted">À chaque ouverture de Finances, les nouveaux fichiers <code>chequing-activities-….csv</code> et <code>credit-card-activities-….csv</code> sont importés tout seuls (sans doublons).</p>
          <div class="modal-actions" style="justify-content:flex-start"><button class="btn" id="fa-check">Vérifier maintenant</button><button class="btn" id="fa-change">Changer de dossier</button><button class="btn danger" id="fa-stop">Arrêter</button></div>`
        : `<p class="muted">Choisis ton dossier <b>Téléchargements</b> : les relevés que tu exportes de Wealthsimple y arrivent, et l’app les importera toute seule à l’ouverture de Finances. Elle ne lit que ces relevés.</p>
          <div class="modal-actions" style="justify-content:flex-start"><button class="btn primary" id="fa-choose">Choisir le dossier Téléchargements</button></div>`}
    </section>
    <section class="fi-auto-sec">
      <h3>⏰ Rappel hebdomadaire</h3>
      <label class="check"><input type="checkbox" id="fa-rem" ${rem.on ? 'checked' : ''}> Me rappeler d’exporter mes relevés</label>
      <div class="row"><label>Jour<select id="fa-day">${DAYS.map((d, i) => `<option value="${i}" ${rem.day === i ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <label>Heure<input type="time" id="fa-time" value="${esc(rem.time)}"></label></div>
      <p class="muted">Ce jour-là, la mission « 📥 Exporter tes relevés Wealthsimple » apparaît dans Aujourd’hui avec une alarme et le lien vers Wealthsimple. Elle se coche toute seule quand le relevé est importé.</p>
    </section>
    <div class="modal-actions"><button class="btn" data-close>Fermer</button><button class="btn primary" id="fa-save">Enregistrer</button></div>`, (m, close) => {
    const run = async (fn) => { try { await fn(); } catch (err) { if (err?.name !== 'AbortError') ctx.toast(err.message || 'Impossible', 'err'); } };
    m.querySelector('#fa-choose')?.addEventListener('click', () => run(async () => { await chooseDir(); close(); afterAuto(ctx, await autoImport({ ask: true }), onDone); }));
    m.querySelector('#fa-change')?.addEventListener('click', () => run(async () => { await chooseDir(); close(); afterAuto(ctx, await autoImport({ ask: true }), onDone); }));
    m.querySelector('#fa-check')?.addEventListener('click', () => run(async () => { close(); afterAuto(ctx, await autoImport({ ask: true }), onDone); }));
    m.querySelector('#fa-stop')?.addEventListener('click', () => run(async () => { await db.del('cache', DIR_KEY); close(); ctx.toast('Import auto arrêté'); onDone(); }));
    m.querySelector('#fa-save').onclick = async () => {
      await db.put('settings', { on: m.querySelector('#fa-rem').checked, day: Number(m.querySelector('#fa-day').value), time: m.querySelector('#fa-time').value || '10:00' }, REM_KEY);
      close();
      ctx.toast('⏰ Rappel enregistré');
      checkReminder().catch(console.error);
    };
  });
}

function importReport(ctx, rep) {
  const lines = rep.map((r) => {
    if (r.type === 'placements' && r.jeu?.total) return `<li>📖 <b>${esc(r.name)}</b> : relevé de placements lu pour ton livre d’or. ${r.jeu.stored} nouveau${r.jeu.stored > 1 ? 'x' : ''} mouvement${r.jeu.stored > 1 ? 's' : ''} d’argent sur ${r.jeu.total}.</li>`;
    if (r.type === 'placements') return `<li>📈 <b>${esc(r.name)}</b> : relevé de placements reconnu. Rien à ajouter au budget : l’argent que tu y envoies est déjà compté dans ton compte chèques (« Vers tes placements »).</li>`;
    if (!r.type) return `<li>⚠ <b>${esc(r.name)}</b> : format non reconnu (il faut un relevé de compte chèques ou de carte de crédit).</li>`;
    if (!r.rows) return `<li>${r.type === 'credit' ? '💳' : '🏦'} <b>${esc(r.name)}</b> : aucune transaction dans ce fichier.</li>`;
    return `<li>${r.type === 'credit' ? '💳' : '🏦'} <b>${esc(r.name)}</b> : ${r.rows} transactions du ${esc(U.fmtShort(U.parseISO(r.from)))} au ${esc(U.fmtShort(U.parseISO(r.to)))} — <b>${r.added} nouvelle${r.added > 1 ? 's' : ''}</b>${r.updated ? `, ${r.updated} mise${r.updated > 1 ? 's' : ''} à jour` : ''}.</li>`;
  }).join('');
  ctx.modal(`<h2>Import terminé</h2><ul class="fi-report">${lines}</ul><div class="modal-actions"><button class="btn primary" data-close>OK</button></div>`);
}

/* ---------- Aperçu du mois ---------- */
async function drawOverview(ctx, el, all, budget) {
  if (overView === 'semaine') return drawOverviewWeek(ctx, el, all, budget);
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
  const dismissed = new Set((await db.get('settings', 'moneyDismissed')) || []);
  const rec = recurring(all, month);

  const cats = CATS.map(([id]) => ({ ...catOf(id), spent: s.byCat[id] || 0, budget: Number(budget.cats?.[id]) || 0, avg: avg.cats[id] || 0 }))
    .filter((c) => c.spent || c.budget).sort((a, b) => b.spent - a.spent);
  const over = cats.filter((c) => c.budget && c.spent > c.budget);
  const top = topMerchants(s.list, all);

  el.innerHTML = `${overSwitch()}
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
      ${doubles(s.list, dismissed).map((t) => `<li class="fi-dbl"><span><b>Prélèvement en double possible</b> : ${esc(t.merchant)} ${$$$(-t.amount)} deux fois le ${esc(U.fmtShort(U.parseISO(t.date)))} à ${esc(t.time.slice(0, 5))}. Vérifie dans Wealthsimple.</span>
        <span class="fi-dbl-acts"><button type="button" class="btn sm-text" data-dbl-del="${esc(t.id)}" title="Wealthsimple ne montre qu’un seul achat : la copie est retirée de l’app">Une seule dans Wealthsimple : retirer la copie</button><button type="button" class="btn sm-text" data-dbl-ok="${esc(t.id)}" title="C’est bien deux achats : ne plus avertir">Ce sont 2 achats</button></span></li>`).join('')}
    </ul></section>` : ''}

    <div class="fi-grid">
      <section class="card fi-cats">
        <div class="card-head"><h2>Dépenses par catégorie</h2>${avg.months.length ? `<span class="muted" title="Moyenne de ${avg.months.map(monthName).join(', ')}">vs moyenne</span>` : ''}</div>
        ${cats.length ? cats.map((c) => catRow(c)).join('') : '<p class="empty-sm">Aucune dépense ce mois-ci. <button type="button" class="link-btn" data-qa="" data-qa-type="expense">＋ Entrer une dépense</button></p>'}
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
  bindOverSwitch(ctx, el);
  el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { tab = b.dataset.go; renderPage(ctx); }));
  // Double possible : retirer la copie (Wealthsimple n'en montre qu'un) ou garder les deux sans plus avertir
  el.querySelectorAll('[data-dbl-del]').forEach((b) => (b.onclick = async () => {
    const t = await db.get('money', b.dataset.dblDel);
    await db.del('money', b.dataset.dblDel);
    renderPage(ctx);
    if (t) showUndo('🧾 Copie retirée', async () => { await db.put('money', t); renderPage(ctx); }, 5000);
  }));
  el.querySelectorAll('[data-dbl-ok]').forEach((b) => (b.onclick = async () => {
    const list = (await db.get('settings', 'moneyDismissed')) || [];
    await db.put('settings', [...new Set([...list, b.dataset.dblOk])], 'moneyDismissed');
    renderPage(ctx);
  }));
  el.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { txFilter = { q: '', cat: b.dataset.cat }; tab = 'transactions'; renderPage(ctx); }));
}

/* ---------- Aperçu : vue Mois / Semaine ---------- */
let overView = (() => { try { return localStorage.getItem('lp.overView') === 'semaine' ? 'semaine' : 'mois'; } catch { return 'mois'; } })();
const overSwitch = () => `<div class="seg fi-bview" role="tablist" aria-label="Période de l’aperçu">
  <button role="tab" data-ov="mois" class="${overView === 'mois' ? 'on' : ''}" aria-selected="${overView === 'mois'}">📆 Mois</button>
  <button role="tab" data-ov="semaine" class="${overView === 'semaine' ? 'on' : ''}" aria-selected="${overView === 'semaine'}">🗓 Semaine</button></div>`;
const bindOverSwitch = (ctx, el) => el.querySelectorAll('[data-ov]').forEach((b) => (b.onclick = () => {
  overView = b.dataset.ov;
  try { localStorage.setItem('lp.overView', overView); } catch { /* ignore */ }
  renderPage(ctx);
}));

/** Totaux d'une période [from, to[ : dépenses, revenus, par jour et par catégorie. */
function periodStats(all, from, to) {
  const list = all.filter((t) => t.date >= from && t.date < to);
  let spent = 0, income = 0;
  const byCat = {}, perDay = {};
  for (const t of list) {
    if (t.kind === 'revenu') income += t.amount;
    const s = spendOf(t);
    if (!s) continue;
    spent += s;
    const c = spendCat(t, all);
    byCat[c] = (byCat[c] || 0) + s;
    perDay[t.date] = (perDay[t.date] || 0) + s;
  }
  return { list, spent, income, byCat, perDay };
}

function drawOverviewWeek(ctx, el, all, budget) {
  bwStart ||= U.startOfWeek(new Date());
  const ws = U.iso(bwStart), we = U.iso(U.addDays(bwStart, 7));
  const today = U.iso(new Date());
  const thisWeek = ws === U.iso(U.startOfWeek(new Date()));
  const cur = periodStats(all, ws, we), prev = periodStats(all, U.iso(U.addDays(bwStart, -7)), ws);
  const W = 12 / 52;
  const wb = Object.fromEntries(Object.entries(budget.cats || {}).map(([k, v]) => [k, (Number(v) || 0) * W]));
  const totalBudget = Object.values(wb).reduce((a, b) => a + b, 0);
  const left = totalBudget - cur.spent;
  const net = cur.income - cur.spent;
  const diff = prev.spent ? Math.round(((cur.spent - prev.spent) / prev.spent) * 100) : null;
  const days = [...Array(7)].map((_, i) => U.iso(U.addDays(bwStart, i)));
  const perDay = days.map((d) => cur.perDay[d] || 0);
  const maxDay = Math.max(1, ...perDay, totalBudget / 7);
  const dayNames = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  const cats = [...new Set([...Object.keys(cur.byCat), ...Object.keys(prev.byCat), ...Object.keys(wb).filter((k) => wb[k] > 0)])]
    .map((id) => ({ ...catOf(id), id, s: cur.byCat[id] || 0, p: prev.byCat[id] || 0, b: wb[id] || 0 }))
    .filter((c) => c.s > 0.5 || c.p > 0.5).sort((a, b) => b.s - a.s);
  const top = topMerchants(cur.list, all);
  const recent = [...cur.list].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 10);
  const last = all.map((t) => t.date).sort().pop();
  const delta = (s, p) => { if (!p) return s ? '<span class="muted">nouveau</span>' : '—'; const d = Math.round(((s - p) / p) * 100); return `<span class="${d > 10 ? 'fi-up' : d < -10 ? 'fi-down' : 'muted'}">${d > 0 ? '+' : ''}${d} %</span>`; };

  el.innerHTML = `${overSwitch()}
    <section class="card fi-week">
      <div class="card-head"><h2>🗓 Semaine du ${U.fmtShort(bwStart)} au ${U.fmtShort(U.addDays(bwStart, 6))}</h2>
        <span class="fi-month"><button class="btn icon" id="ow-prev" aria-label="Semaine précédente">‹</button>
        ${thisWeek ? '' : '<button class="btn" id="ow-now">Cette semaine</button>'}
        <button class="btn icon" id="ow-next" ${thisWeek ? 'disabled' : ''} aria-label="Semaine suivante">›</button></span></div>
      <div class="kpis fi-kpis">
        <div class="kpi ok"><b>${$$$(cur.income, true)}</b><span>revenus</span></div>
        <div class="kpi"><b>${$$$(cur.spent, true)}</b><span>dépenses${diff === null ? '' : ` · ${diff > 0 ? '+' : ''}${diff} % vs sem. préc.`}</span></div>
        <div class="kpi ${net < 0 ? 'bad' : 'ok'}"><b>${net < 0 ? '−' : '+'}${$$$(Math.abs(net), true)}</b><span>${net < 0 ? 'dépensé de plus que gagné' : 'gardé cette semaine'}</span></div>
        ${totalBudget ? `<div class="kpi ${left < 0 ? 'bad' : 'ok'}"><b>${left < 0 ? '−' : ''}${$$$(Math.abs(left), true)}</b><span>${left < 0 ? 'au-dessus du budget' : `reste du budget (${$$$(totalBudget, true)})`}</span></div>` : ''}
      </div>
      ${totalBudget ? `<div class="fi-meter fi-week-meter"><i style="width:${Math.min(100, (cur.spent / totalBudget) * 100)}%" class="${cur.spent > totalBudget ? 'over' : ''}"></i></div>` : ''}
      <div class="fi-days">${perDay.map((v, i) => `<div class="fi-day ${days[i] === today ? 'today' : ''} ${days[i] > today ? 'future' : ''}" title="${dayNames[i]} : ${$$$(v)}">
        <span class="fi-day-v">${v ? $$$(v, true) : ''}</span><span class="fi-day-bar"><i class="${totalBudget && v > totalBudget / 7 ? 'over' : ''}" style="height:${(v / maxDay) * 100}%"></i></span><small>${dayNames[i]}</small></div>`).join('')}</div>
    </section>
    <div class="fi-grid">
      <section class="card fi-tbl-card">
        <div class="card-head fi-tbl-head"><h2>Par catégorie</h2><span class="muted">cette semaine · vs précédente</span></div>
        ${cats.length ? `<table class="fi-table fi-cat-table"><thead><tr><th>Catégorie</th><th class="num">Semaine</th><th class="num">Sem. préc.</th><th class="num">Écart</th>${totalBudget ? '<th class="num">Budget</th>' : ''}</tr></thead><tbody>
          ${cats.map((c) => `<tr class="fi-row" data-cat="${c.id}" title="Voir les transactions ${esc(c.name)}"><td><div class="fi-who-in"><span class="fi-tx-ico" style="--c:${c.color}">${c.emoji}</span><b>${esc(c.name)}</b></div></td>
            <td class="num"><b class="${c.b && c.s > c.b ? 'fi-up' : ''}">${$$$(c.s, true)}</b></td><td class="num muted">${c.p ? $$$(c.p, true) : '—'}</td><td class="num">${delta(c.s, c.p)}</td>${totalBudget ? `<td class="num muted">${c.b ? $$$(c.b, true) : '—'}</td>` : ''}</tr>`).join('')}
          </tbody><tfoot><tr><td>Total</td><td class="num"><b>${$$$(cur.spent, true)}</b></td><td class="num muted">${$$$(prev.spent, true)}</td><td class="num">${delta(cur.spent, prev.spent)}</td>${totalBudget ? `<td class="num muted">${$$$(totalBudget, true)}</td>` : ''}</tr></tfoot></table>`
          : '<p class="empty-sm" style="padding:0 16px 16px">Aucune dépense cette semaine. <button type="button" class="link-btn" data-qa="" data-qa-type="expense">＋ Entrer une dépense</button></p>'}
      </section>
      <div class="fi-side">
        <section class="card">
          <div class="card-head"><h2>Où va ton argent</h2></div>
          ${top.length ? `<ol class="fi-top">${top.map((x) => `<li><span>${catOf(x.cat).emoji} ${esc(x.name)} <small class="muted">× ${x.n}</small></span><b>${$$$(x.total, true)}</b></li>`).join('')}</ol>` : '<p class="empty-sm">Rien à afficher.</p>'}
        </section>
      </div>
    </div>
    ${recent.length ? `<section class="card fi-tbl-card">
      <div class="card-head fi-tbl-head"><h2>Transactions de la semaine</h2><button class="btn sm-text" id="ow-all">Tout voir →</button></div>
      <table class="fi-table fi-tx-table"><tbody>${recent.map((t) => `<tr class="fi-row ${t.kind}">
        <td class="fi-c-time muted">${esc(U.parseISO(t.date).toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric' }))}</td>
        <td class="fi-c-who"><div class="fi-who-in"><span class="fi-tx-ico" style="--c:${catOf(t.cat).color}">${catOf(t.cat).emoji}</span><span class="fi-who"><b>${esc(t.merchant)}</b><small class="muted">${esc(catOf(t.cat).name)}</small></span></div></td>
        <td class="num fi-amt ${t.amount > 0 ? 'pos' : t.kind === 'transfert' ? 'muted' : ''}">${t.amount > 0 ? '+' : '−'}${$$$(Math.abs(t.amount))}</td></tr>`).join('')}</tbody></table>
    </section>` : ''}
    ${last && last < we && thisWeek ? `<p class="hint muted">Dépenses connues jusqu’au ${U.fmtShort(U.parseISO(last))} (dernier relevé importé).</p>` : ''}`;

  bindOverSwitch(ctx, el);
  el.querySelector('#ow-prev').onclick = () => { bwStart = U.addDays(bwStart, -7); drawOverviewWeek(ctx, el, all, budget); };
  el.querySelector('#ow-next').onclick = () => { bwStart = U.addDays(bwStart, 7); drawOverviewWeek(ctx, el, all, budget); };
  el.querySelector('#ow-now')?.addEventListener('click', () => { bwStart = U.startOfWeek(new Date()); drawOverviewWeek(ctx, el, all, budget); });
  el.querySelector('#ow-all')?.addEventListener('click', () => { txFilter = { q: '', cat: '' }; month = ym(ws); tab = 'transactions'; renderPage(ctx); });
  el.querySelectorAll('[data-cat]').forEach((r) => (r.onclick = () => { txFilter = { q: '', cat: r.dataset.cat }; month = ym(ws); tab = 'transactions'; renderPage(ctx); }));
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
/* ---------- Budget : vue Semaine (budget mensuel ramené à la semaine : × 12 ÷ 52) ---------- */
let budgetView = (() => { try { return localStorage.getItem('lp.budgetView') === 'semaine' ? 'semaine' : 'mois'; } catch { return 'mois'; } })();
let bwStart = null; // lundi de la semaine affichée
const budgetSwitch = () => `<div class="seg fi-bview" role="tablist" aria-label="Vue du budget">
  <button role="tab" data-bv="mois" class="${budgetView === 'mois' ? 'on' : ''}" aria-selected="${budgetView === 'mois'}">📆 Mois</button>
  <button role="tab" data-bv="semaine" class="${budgetView === 'semaine' ? 'on' : ''}" aria-selected="${budgetView === 'semaine'}">🗓 Semaine</button></div>`;

function drawBudgetWeek(ctx, el, all, budget) {
  bwStart ||= U.startOfWeek(new Date());
  const ws = U.iso(bwStart), we = U.iso(U.addDays(bwStart, 7));
  const today = U.iso(new Date());
  const thisWeek = ws === U.iso(U.startOfWeek(new Date()));
  const W = 12 / 52;
  const cats = budget.cats || {};
  const weekBudget = Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, (Number(v) || 0) * W]));
  const totalBudget = Object.values(weekBudget).reduce((a, b) => a + b, 0);
  // Dépenses de la semaine, par catégorie et par jour
  const spent = {}, perDay = Array(7).fill(0);
  let total = 0;
  for (const t of all) {
    if (t.date < ws || t.date >= we) continue;
    const s = spendOf(t);
    if (!s) continue;
    const c = spendCat(t, all);
    spent[c] = (spent[c] || 0) + s;
    total += s;
    perDay[Math.round((U.parseISO(t.date) - U.parseISO(ws)) / 864e5)] += s;
  }
  const left = totalBudget - total;
  const daysLeft = thisWeek ? Math.max(1, 7 - Math.round((U.parseISO(today) - U.parseISO(ws)) / 864e5)) : 0;
  const maxDay = Math.max(1, ...perDay, totalBudget / 7);
  const ids = [...new Set([...Object.keys(weekBudget), ...Object.keys(spent)])]
    .map((id) => ({ ...catOf(id), id, b: weekBudget[id] || 0, s: spent[id] || 0 }))
    .filter((r) => r.b || r.s > 0.5)
    .sort((a, b) => (b.s / (b.b || 1)) - (a.s / (a.b || 1)));
  const last = all.map((t) => t.date).sort().pop();
  const dayNames = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

  el.innerHTML = `${budgetSwitch()}
    <section class="card fi-week">
      <div class="card-head"><h2>🗓 Semaine du ${U.fmtShort(bwStart)}</h2>
        <span class="fi-month"><button class="btn icon" id="bw-prev" aria-label="Semaine précédente">‹</button>
        ${thisWeek ? '' : '<button class="btn" id="bw-now">Cette semaine</button>'}
        <button class="btn icon" id="bw-next" ${thisWeek ? 'disabled' : ''} aria-label="Semaine suivante">›</button></span></div>
      ${totalBudget ? `<div class="fi-plan-top">
        <div class="kpi"><b>${$$$(total, true)}</b><span>dépensé cette semaine</span></div>
        <div class="kpi"><b>${$$$(totalBudget, true)}</b><span>budget de la semaine</span></div>
        <div class="kpi ${left < 0 ? 'bad' : 'ok'}"><b>${left < 0 ? '−' : ''}${$$$(Math.abs(left), true)}</b><span>${left < 0 ? 'de dépassement' : 'qui reste'}</span></div>
        ${thisWeek && left > 0 ? `<div class="kpi"><b>${$$$(left / daysLeft, true)}</b><span>par jour jusqu’à dimanche</span></div>` : ''}
      </div>
      <div class="fi-meter fi-week-meter"><i style="width:${Math.min(100, (total / totalBudget) * 100)}%" class="${total > totalBudget ? 'over' : ''}"></i></div>`
        : '<p class="empty-sm">Aucun budget encore : crée ton budget mensuel dans la vue 📆 Mois. La semaine en découle (× 12 ÷ 52).</p>'}
      <div class="fi-days">${perDay.map((v, i) => { const d = U.iso(U.addDays(bwStart, i)); return `<div class="fi-day ${d === today ? 'today' : ''} ${d > today ? 'future' : ''}" title="${dayNames[i]} : ${$$$(v)}">
        <span class="fi-day-v">${v ? $$$(v, true) : ''}</span><span class="fi-day-bar"><i class="${totalBudget && v > totalBudget / 7 ? 'over' : ''}" style="height:${(v / maxDay) * 100}%"></i></span><small>${dayNames[i]}</small></div>`; }).join('')}</div>
      ${totalBudget ? `<p class="hint muted" style="margin:6px 0 0">Budget moyen par jour : ${$$$(totalBudget / 7, true)} · en rouge, les jours au-dessus.</p>` : ''}
    </section>
    ${ids.length ? `<section class="card"><div class="card-head"><h2>Par catégorie</h2><span class="muted">dépensé / budget de la semaine</span></div>
      <div class="fi-wk-rows">${ids.map((r) => { const p = r.b ? (r.s / r.b) * 100 : 100; return `<div class="fi-wk-row">
        <span class="fi-wk-name">${r.emoji} ${esc(r.name)}</span>
        <span class="fi-wk-nums"><b class="${r.b && r.s > r.b ? 'over' : ''}">${$$$(r.s, true)}</b><small class="muted"> / ${r.b ? $$$(r.b, true) : 'hors budget'}</small></span>
        <div class="fi-wk-bar"><i class="${r.b && r.s > r.b ? 'over' : p > 85 ? 'warn' : ''}" style="width:${Math.min(100, p)}%"></i></div></div>`; }).join('')}</div></section>` : ''}
    ${last && last < we && thisWeek ? `<p class="hint muted">Dépenses connues jusqu’au ${U.fmtShort(U.parseISO(last))} (dernier relevé importé) : importe le plus récent pour une semaine complète.</p>` : ''}`;

  el.querySelectorAll('[data-bv]').forEach((b) => (b.onclick = () => { budgetView = b.dataset.bv; try { localStorage.setItem('lp.budgetView', budgetView); } catch { /* ignore */ } renderPage(ctx); }));
  el.querySelector('#bw-prev').onclick = () => { bwStart = U.addDays(bwStart, -7); drawBudgetWeek(ctx, el, all, budget); };
  el.querySelector('#bw-next').onclick = () => { bwStart = U.addDays(bwStart, 7); drawBudgetWeek(ctx, el, all, budget); };
  el.querySelector('#bw-now')?.addEventListener('click', () => { bwStart = U.startOfWeek(new Date()); drawBudgetWeek(ctx, el, all, budget); });
}

function drawBudget(ctx, el, all, budget) {
  if (budgetView === 'semaine') return drawBudgetWeek(ctx, el, all, budget);
  const avg = averages(all, curMonth());
  const cur = budget.cats || {};
  const round5 = (v) => Math.ceil(v / 5) * 5;
  const rows = CATS.map(([id]) => ({ ...catOf(id), avg: avg.cats[id] || 0, value: cur[id] ?? '' }))
    .sort((a, b) => b.avg - a.avg);
  el.innerHTML = `${budgetSwitch()}
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
          <span class="fi-input"><input type="number" inputmode="decimal" min="0" step="5" inputmode="numeric" data-b="${r.id}" data-avg="${round5(r.avg)}" value="${esc(String(r.value))}" placeholder="0"> $</span>
        </label>`).join('')}</div>
      <label class="fi-plan-row fi-savings"><span>🐷 Épargne visée par mois</span><small class="muted">mise de côté</small><span class="fi-input"><input type="number" inputmode="decimal" min="0" step="10" id="fi-sav" value="${esc(String(budget.savings || ''))}" placeholder="0"> $</span></label>
      <div class="modal-actions"><button class="btn primary" id="fi-save">Enregistrer le budget</button></div>
      <p class="hint muted">Conseils : commence par les catégories où tu dépenses le plus. Viser 10 à 20 % de moins que ta moyenne est réaliste ; plus serré, c’est souvent abandonné au bout de deux semaines. Mets l’épargne en premier : traite-la comme une dépense fixe.</p>
    </section>`;
  el.querySelectorAll('[data-bv]').forEach((b) => (b.onclick = () => { budgetView = b.dataset.bv; try { localStorage.setItem('lp.budgetView', budgetView); } catch { /* ignore */ } renderPage(ctx); }));
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
    const inc = list.filter((t) => t.kind === 'revenu').reduce((a, t) => a + t.amount, 0);
    // Tableau : une ligne par transaction, groupées par jour (sous-total des dépenses du jour)
    const amt = (t) => `${t.amount > 0 ? '+' : '−'}${$$$(Math.abs(t.amount))}`;
    el.querySelector('#fi-tx').innerHTML = list.length ? `
      <div class="fi-tx-sum"><span><b>${list.length}</b> transaction${list.length > 1 ? 's' : ''}</span>${sum ? `<span>Dépenses <b class="neg">${$$$(sum)}</b></span>` : ''}${inc ? `<span>Revenus <b class="pos">+${$$$(inc)}</b></span>` : ''}</div>
      <div class="card fi-tbl-card"><table class="fi-table fi-tx-table">
        <thead><tr><th class="fi-c-time">Heure</th><th>Marchand</th><th class="fi-c-cat">Catégorie</th><th class="num">Montant</th></tr></thead>
        ${Object.entries(days).map(([d, ts]) => {
          const ds = ts.reduce((a, t) => a + (spendOf(t) || 0), 0);
          return `<tbody>
          <tr class="fi-day-row"><th colspan="4"><span>${esc(U.cap(U.parseISO(d).toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' })))}</span>${ds ? `<span class="muted">${$$$(ds)}</span>` : ''}</th></tr>
          ${ts.map((t) => `<tr class="fi-row ${t.kind} ${t.pending ? 'pending' : ''}" data-id="${t.id}">
            <td class="fi-c-time muted">${esc(t.time.slice(0, 5))}</td>
            <td class="fi-c-who"><div class="fi-who-in"><span class="fi-tx-ico" style="--c:${catOf(t.cat).color}">${catOf(t.cat).emoji}</span><span class="fi-who"><b>${esc(t.merchant)}</b><small class="muted">${esc([t.account, t.pending ? "⏳ en attente" : ""].filter(Boolean).join(" · "))}</small></span></div></td>
            <td class="fi-c-cat"><select class="fi-tx-cat" aria-label="Catégorie de ${esc(t.merchant)}">${opts(t.cat, t.kind)}</select></td>
            <td class="num fi-amt ${t.amount > 0 ? 'pos' : t.kind === 'transfert' ? 'muted' : ''}">${amt(t)}</td>
          </tr>`).join('')}</tbody>`;
        }).join('')}
      </table></div>` : '<div class="card empty-card"><p>Aucune transaction pour ce filtre.</p></div>';
    el.querySelectorAll('.fi-tx-cat').forEach((s) => (s.onchange = async () => {
      const t = all.find((x) => x.id === s.closest('[data-id]').dataset.id);
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
