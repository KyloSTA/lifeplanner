// ⚔️ Aventure : un petit RPG nourri par ta vraie vie.
// - Statistiques : calculées à partir de tes XP réels (missions, habitudes, entraînements, études…).
// - Énergie ⚡ : 1 par tranche de 10 XP gagnés depuis le début de l'aventure (+10 pour commencer).
// - Combats : chaque rencontre de l'histoire teste une statistique ; victoire = or 🪙 et parfois de l'équipement.
// - Coffres : gagnés par tes accomplissements réels (niveaux, objectifs atteints, séries d'habitudes, badges…).
// État sauvegardé dans les réglages (« rpg ») : synchronisé entre tes appareils.

import { db } from './db.js';
import * as U from './util.js';
import * as game from './game.js';
import * as AV from './avatar.js';
import * as habits from './habits.js';
import { STATS, SLOTS, RARITY, ITEMS, ITEM, CHAPTERS, ARENA } from './rpg-data.js';

const { esc } = U;
const XP_PER_ENERGY = 10;
const START_ENERGY = 10;

/* ---------- État ---------- */
async function load() {
  let s = await db.get('settings', 'rpg');
  if (!s) {
    const xp = (await db.all('xp')).reduce((n, e) => n + e.amount, 0);
    s = { baseXp: xp, spent: 0, gold: 25, chapter: 0, step: 0, arena: 0, inv: [{ uid: U.uid(), id: 'baton' }, { uid: U.uid(), id: 'tunique' }], equip: {}, claimed: [], log: [], wins: 0, losses: 0, createdAt: Date.now() };
    s.equip = { arme: s.inv[0].uid, armure: s.inv[1].uid };
    await save(s);
  }
  return s;
}
const save = (s) => db.put('settings', s, 'rpg');
const addLog = (s, text) => { s.log = [{ at: Date.now(), text }, ...(s.log || [])].slice(0, 30); };

/* ---------- Statistiques à partir des XP réels ---------- */
const SPORT = /march|cour|jog|sport|gym|muscu|vélo|velo|nage|natation|yoga|étir|etir|workout|pompes|squat|entraîn/i;
export async function computeStats(s) {
  const xp = await db.all('xp');
  const hab = Object.fromEntries((await db.all('habits')).map((h) => [h.id, h]));
  const pts = { force: 0, endu: 0, disc: 0, intel: 0, sage: 0 };
  for (const e of xp) {
    const k = e.key, a = e.amount || 0;
    if (k.startsWith('workout:')) pts.force += a;
    else if (k.startsWith('habit:')) { const h = hab[k.split(':')[1]]; if (h && SPORT.test(h.name)) { pts.force += a; pts.endu += a; } else pts.endu += a * 2; }
    else if (k.startsWith('streak:')) pts.endu += a;
    else if (/^(task|sub|pomo|goal|goaldone):/.test(k)) pts.disc += a;
    else if (/^(study|note|link|triage|ink):/.test(k)) pts.intel += a * (k.startsWith('study:') ? 4 : 1);
    else if (/^(journal|mood|review):/.test(k)) pts.sage += a;
  }
  const base = Object.fromEntries(Object.entries(pts).map(([k, v]) => [k, 1 + Math.floor(Math.sqrt(v / 3))]));
  const bonus = { force: 0, endu: 0, disc: 0, intel: 0, sage: 0 };
  for (const uid of Object.values(s.equip || {})) {
    const it = ITEM[(s.inv.find((x) => x.uid === uid) || {}).id];
    if (it) for (const [k, v] of Object.entries(it.bonus)) bonus[k] += v;
  }
  const total = Object.fromEntries(Object.keys(base).map((k) => [k, base[k] + bonus[k]]));
  const xpTotal = xp.reduce((n, e) => n + e.amount, 0);
  return { pts, base, bonus, total, sum: Object.values(total).reduce((a, b) => a + b, 0), xpTotal };
}
export const energyOf = (s, xpTotal) => Math.max(0, START_ENERGY + Math.floor((xpTotal - s.baseXp) / XP_PER_ENERGY) - s.spent);

/* ---------- Rencontre actuelle ---------- */
function current(s) {
  const ch = CHAPTERS[s.chapter];
  if (ch) return { ch, step: ch.steps[s.step], idx: s.step, arena: false };
  // Histoire terminée : l'Arène, de plus en plus difficile
  const e = ARENA[s.arena % ARENA.length];
  const stat = STATS[s.arena % STATS.length].id;
  return { ch: null, idx: s.arena, arena: true, step: { ...e, stat, power: 30 + s.arena * 3, boss: s.arena % 5 === 4, text: `Combat n° ${s.arena + 1} de l’Arène d’Ordrelune. Les ennemis deviennent plus forts à chaque victoire.` } };
}
const costOf = (step) => (step.boss ? 3 : 1);
function powerFor(st, step) { return st.total[step.stat] + Math.floor(st.sum / 6); }
const chanceFor = (power, enemy) => Math.max(0.1, Math.min(0.95, 0.55 + 0.08 * (power - enemy)));

/* ---------- Butin ---------- */
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function rollRarity(weights) {
  let r = Math.random() * Object.values(weights).reduce((a, b) => a + b, 0);
  for (const [k, w] of Object.entries(weights)) { if ((r -= w) <= 0) return k; }
  return 'commun';
}
function giveItem(s, rarity) {
  const owned = new Set(s.inv.map((x) => x.id));
  const pool = ITEMS.filter((i) => i.rarity === rarity);
  const fresh = pool.filter((i) => !owned.has(i.id));
  const it = pick(fresh.length ? fresh : pool);
  s.inv.push({ uid: U.uid(), id: it.id });
  return it;
}
const CH_WEIGHTS = [
  { commun: 70, rare: 28, epique: 2, legendaire: 0 },
  { commun: 55, rare: 38, epique: 7, legendaire: 0 },
  { commun: 35, rare: 45, epique: 18, legendaire: 2 },
  { commun: 20, rare: 45, epique: 30, legendaire: 5 },
  { commun: 10, rare: 40, epique: 40, legendaire: 10 },
];
const BOSS_RARITY = ['rare', 'rare', 'epique', 'epique', 'legendaire'];

/** Combat. Renvoie le récit du résultat. */
async function fight() {
  const s = await load();
  const st = await computeStats(s);
  const cur = current(s);
  const cost = costOf(cur.step);
  if (energyOf(s, st.xpTotal) < cost) return { error: 'Pas assez d’énergie' };
  s.spent += cost;
  const power = powerFor(st, cur.step);
  const chance = chanceFor(power, cur.step.power);
  const win = Math.random() < chance;
  const tier = cur.arena ? 4 : cur.ch.id - 1;
  const res = { win, enemy: cur.step, power, chance, gold: 0, item: null, chapterDone: null };
  if (win) {
    s.wins = (s.wins || 0) + 1;
    res.gold = (8 + Math.floor(Math.random() * 8)) * (tier + 1) * (cur.step.boss ? 3 : 1);
    s.gold += res.gold;
    if (cur.step.boss) res.item = giveItem(s, cur.arena ? rollRarity({ rare: 40, epique: 45, legendaire: 15 }) : BOSS_RARITY[tier]);
    else if (Math.random() < 0.35) res.item = giveItem(s, rollRarity(CH_WEIGHTS[tier]));
    addLog(s, `⚔️ Victoire contre ${cur.step.enemy} (+${res.gold} 🪙${res.item ? `, ${res.item.icon} ${res.item.name}` : ''})`);
    if (cur.arena) s.arena += 1;
    else if (s.step + 1 >= cur.ch.steps.length) { res.chapterDone = cur.ch; s.chapter += 1; s.step = 0; addLog(s, `🏁 Chapitre terminé : ${cur.ch.name}`); }
    else s.step += 1;
  } else {
    s.losses = (s.losses || 0) + 1;
    res.gold = 3;
    s.gold += 3;
    addLog(s, `💥 Défaite contre ${cur.step.enemy} (+3 🪙 de consolation)`);
  }
  await save(s);
  return res;
}

/* ---------- Coffres (accomplissements réels) ---------- */
async function chests(s) {
  const st = await game.stats();
  const xp = await db.all('xp');
  const list = [];
  for (let L = 2; L <= st.level; L++) list.push({ key: 'lvl:' + L, icon: '🎁', name: `Coffre du niveau ${L}`, rarity: L % 5 === 0 ? 'epique' : 'rare' });
  for (const e of xp.filter((x) => x.key.startsWith('goaldone:'))) list.push({ key: 'goal:' + e.key.slice(9), icon: '🏆', name: `Coffre d’objectif : ${e.reason.replace(/^Objectif atteint : /, '')}`, rarity: 'epique' });
  for (const e of xp.filter((x) => x.key.startsWith('workout:'))) list.push({ key: 'wo:' + e.key.slice(8), icon: '💪', name: 'Coffre d’entraînement', rarity: 'commun' });
  const badges = (await db.get('settings', 'badges')) || [];
  for (const b of badges) { const bd = game.BADGES.find((x) => x.id === b); if (bd) list.push({ key: 'badge:' + b, icon: bd.icon, name: `Coffre du badge ${bd.name}`, rarity: 'rare' }); }
  for (const h of await habits.list()) {
    const n = Math.floor(habits.bestStreak(h) / 7);
    for (let i = 1; i <= n; i++) list.push({ key: `streak:${h.id}:${i}`, icon: '🔥', name: `Série de ${i * 7} jours : ${h.emoji} ${h.name}`, rarity: i >= 4 ? 'epique' : 'rare' });
  }
  const done = new Set(s.claimed || []);
  return list.filter((c) => !done.has(c.key));
}
async function openChest(key) {
  const s = await load();
  const c = (await chests(s)).find((x) => x.key === key);
  if (!c) return null;
  // Petite chance d'améliorer la rareté
  const up = { commun: 'rare', rare: 'epique', epique: 'legendaire', legendaire: 'legendaire' };
  const rarity = Math.random() < 0.15 ? up[c.rarity] : c.rarity;
  const item = giveItem(s, rarity);
  const gold = { commun: 15, rare: 40, epique: 90, legendaire: 200 }[rarity];
  s.gold += gold;
  s.claimed = [...(s.claimed || []), key];
  addLog(s, `${c.icon} ${c.name} : ${item.icon} ${item.name} et ${gold} 🪙`);
  await save(s);
  return { chest: c, item, gold, upgraded: rarity !== c.rarity };
}

/* ---------- Marchand (4 objets, renouvelés chaque jour) ---------- */
function shopFor(day) {
  let h = 0;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pool = ITEMS.filter((i) => i.rarity !== 'legendaire');
  const out = [];
  while (out.length < 4) { h = (h * 1103515245 + 12345) >>> 0; const it = pool[h % pool.length]; if (!out.includes(it)) out.push(it); }
  return out;
}

/* =========================================================
   Page « ⚔️ Aventure »
   ========================================================= */
const bonusText = (b) => Object.entries(b).map(([k, v]) => `+${v} ${STATS.find((x) => x.id === k).icon}`).join(' ');
const itemCard = (it, extra = '') => `<div class="rpg-item" style="--rc:${RARITY[it.rarity].color}">
  <span class="rpg-item-ico">${it.icon}</span><span class="rpg-item-txt"><b>${esc(it.name)}</b><small>${RARITY[it.rarity].name} · ${SLOTS.find((x) => x.id === it.slot).name} · ${bonusText(it.bonus)}</small></span>${extra}</div>`;

export async function renderPage(ctx) {
  const { view, toast, modal } = ctx;
  const s = await load();
  const st = await computeStats(s);
  const energy = energyOf(s, st.xpTotal);
  const cur = current(s);
  const avCfg = { ...AV.DEFAULT_AVATAR, ...((await db.get('settings', 'avatar')) || {}), evo: (await game.stats()).evo };
  const level = game.levelInfo(st.xpTotal);
  const chs = await chests(s);
  const cost = costOf(cur.step);
  const power = powerFor(st, cur.step);
  const chance = chanceFor(power, cur.step.power);
  const eqItems = Object.fromEntries(SLOTS.map((sl) => [sl.id, ITEM[(s.inv.find((x) => x.uid === s.equip?.[sl.id]) || {}).id]]));
  const maxStat = Math.max(20, ...Object.values(st.total));
  const redraw = () => renderPage(ctx);
  const nextEnergyXp = XP_PER_ENERGY - ((st.xpTotal - s.baseXp) % XP_PER_ENERGY + XP_PER_ENERGY) % XP_PER_ENERGY;

  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Ordrelune · ${cur.arena ? 'Arène' : `Chapitre ${cur.ch.id} sur ${CHAPTERS.length}`}</p><h1>⚔️ Aventure</h1></div>
      <div class="rpg-res"><span class="rpg-pill" title="Énergie : +1 par tranche de 10 XP gagnés dans la vraie vie">⚡ <b>${energy}</b></span><span class="rpg-pill" title="Or">🪙 <b>${s.gold}</b></span></div>
    </header>
    <div class="rpg-layout">
      <div class="rpg-col">
        <section class="card rpg-hero">
          <div class="rpg-hero-av">${AV.avatarSVG(avCfg, 132)}
            ${SLOTS.map((sl, i) => `<span class="rpg-eq rpg-eq-${i}" title="${sl.name}${eqItems[sl.id] ? ' : ' + esc(eqItems[sl.id].name) : ''}" style="--rc:${eqItems[sl.id] ? RARITY[eqItems[sl.id].rarity].color : 'var(--border)'}">${eqItems[sl.id] ? eqItems[sl.id].icon : `<i>${sl.icon}</i>`}</span>`).join('')}</div>
          <h2>${esc(avCfg.name || 'Ton héros')}</h2>
          <p class="muted">Niveau ${level.level} · ${esc(game.titleFor(level.level))} · ${s.wins || 0} victoire${(s.wins || 0) > 1 ? 's' : ''}</p>
          <p class="rpg-energy-hint">⚡ Prochaine énergie dans <b>${nextEnergyXp} XP</b> : accomplis une mission, une habitude ou un entraînement.</p>
        </section>
        <section class="card rpg-stats"><div class="card-head"><h2>📊 Statistiques</h2><span class="muted">Puissance ${st.sum}</span></div>
          ${STATS.map((x) => `<div class="rpg-stat" title="Vient de : ${x.from}">
            <span class="rpg-stat-name">${x.icon} ${x.name}</span>
            <span class="rpg-stat-val"><b>${st.total[x.id]}</b>${st.bonus[x.id] ? `<small> (${st.base[x.id]} + ${st.bonus[x.id]})</small>` : ''}</span>
            <div class="rpg-bar"><i style="width:${(st.base[x.id] / maxStat) * 100}%"></i><i class="b" style="width:${(st.bonus[x.id] / maxStat) * 100}%"></i></div>
            <small class="muted rpg-from">${x.from}</small></div>`).join('')}
        </section>
      </div>
      <div class="rpg-col">
        <section class="card rpg-story">
          ${cur.arena ? '<div class="card-head"><h2>🏟️ Arène d’Ordrelune</h2><span class="muted">Histoire terminée 🎉</span></div>'
            : `<div class="card-head"><h2>${cur.ch.icon} ${esc(cur.ch.name)}</h2><span class="muted">${cur.idx}/${cur.ch.steps.length}</span></div>
          <div class="rpg-map">${cur.ch.steps.map((x, i) => `<span class="rpg-node ${i < cur.idx ? 'done' : i === cur.idx ? 'cur' : ''} ${x.boss ? 'boss' : ''}" title="${esc(x.enemy)}">${i < cur.idx ? '✓' : x.boss ? '💀' : i + 1}</span>`).join('<i class="rpg-path"></i>')}</div>
          ${cur.idx === 0 ? `<p class="rpg-tale">${esc(cur.ch.intro)}</p>` : ''}`}
          <div class="rpg-enemy">
            <span class="rpg-enemy-ico">${cur.step.icon}</span>
            <div><p class="eyebrow">${cur.step.boss ? '💀 Boss' : 'Rencontre'} · teste ta ${STATS.find((x) => x.id === cur.step.stat).icon} ${STATS.find((x) => x.id === cur.step.stat).name}</p>
              <h3>${esc(cur.step.enemy)}</h3><p class="muted">${esc(cur.step.text)}</p></div>
          </div>
          <div class="rpg-odds"><span>Ta puissance <b>${power}</b></span><span>Ennemi <b>${cur.step.power}</b></span><span>Chances <b class="${chance >= 0.6 ? 'ok' : chance < 0.35 ? 'ko' : ''}">${Math.round(chance * 100)} %</b></span></div>
          <button class="btn primary rpg-fight" id="rpg-fight" ${energy < cost ? 'disabled' : ''}>⚔️ Affronter (⚡${cost})</button>
          ${energy < cost ? `<p class="hint muted">Pas assez d’énergie : gagne ${cost - energy > 1 ? `${(cost - energy) * XP_PER_ENERGY}` : nextEnergyXp} XP en accomplissant tes missions et habitudes. Ou améliore ton équipement pour augmenter tes chances.</p>` : ''}
        </section>
        ${chs.length ? `<section class="card rpg-chests"><div class="card-head"><h2>🎁 Coffres à ouvrir</h2><span class="muted">${chs.length}</span></div>
          ${chs.slice(0, 6).map((c) => `<div class="rpg-chest" style="--rc:${RARITY[c.rarity].color}"><span>${c.icon}</span><span class="rpg-item-txt"><b>${esc(c.name)}</b><small>${RARITY[c.rarity].name}</small></span><button class="btn primary" data-chest="${esc(c.key)}">Ouvrir</button></div>`).join('')}
          ${chs.length > 6 ? `<p class="hint muted">+ ${chs.length - 6} autres coffres</p>` : ''}</section>` : ''}
        <section class="card rpg-inv"><div class="card-head"><h2>🎒 Équipement</h2><span class="muted">${s.inv.length} objet${s.inv.length > 1 ? 's' : ''}</span></div>
          <div class="rpg-slots">${SLOTS.map((sl) => `<div class="rpg-slot ${eqItems[sl.id] ? 'full' : ''}" style="--rc:${eqItems[sl.id] ? RARITY[eqItems[sl.id].rarity].color : 'var(--border)'}" title="${sl.name}"><span>${eqItems[sl.id] ? eqItems[sl.id].icon : sl.icon}</span><small>${sl.name}</small></div>`).join('')}</div>
          <div class="rpg-items">${[...s.inv].sort((a, b) => Object.keys(RARITY).indexOf(ITEM[b.id].rarity) - Object.keys(RARITY).indexOf(ITEM[a.id].rarity)).map((x) => {
            const it = ITEM[x.id], on = s.equip?.[it.slot] === x.uid;
            return itemCard(it, `<span class="rpg-item-act">${on ? '<button class="btn sm-text on" data-unequip="' + it.slot + '">Équipé ✓</button>' : `<button class="btn sm-text" data-equip="${x.uid}">Équiper</button><button class="btn sm-text" data-sell="${x.uid}" title="Vendre">${Math.floor(RARITY[it.rarity].price / 3)} 🪙</button>`}</span>`);
          }).join('')}</div>
        </section>
        <section class="card rpg-shop"><div class="card-head"><h2>🛒 Marchand</h2><span class="muted">Nouveaux objets chaque jour</span></div>
          ${shopFor(U.iso(new Date())).map((it) => itemCard(it, `<button class="btn sm-text" data-buy="${it.id}" ${s.gold < RARITY[it.rarity].price ? 'disabled' : ''}>${RARITY[it.rarity].price} 🪙</button>`)).join('')}
        </section>
        <section class="card rpg-log"><div class="card-head"><h2>📜 Journal d’aventure</h2></div>
          ${(s.log || []).slice(0, 8).map((l) => `<p><small class="muted">${U.fmtShort(new Date(l.at))}</small> ${esc(l.text)}</p>`).join('') || '<p class="empty-sm">Ton aventure commence. Affronte ton premier ennemi !</p>'}</section>
      </div>
    </div>`;

  const $ = (sel) => view.querySelector(sel), $$ = (sel) => [...view.querySelectorAll(sel)];
  $('#rpg-fight').onclick = async () => {
    $('#rpg-fight').disabled = true;
    const res = await fight();
    if (res.error) { toast(res.error, 'err'); return redraw(); }
    modal(`<div class="rpg-result ${res.win ? 'win' : 'lose'}">
        <div class="rpg-clash"><span>${AV.avatarSVG(avCfg, 64)}</span><span class="rpg-vs">⚔️</span><span class="rpg-enemy-ico">${res.enemy.icon}</span></div>
        <h2>${res.win ? '🎉 Victoire !' : '💥 Défaite…'}</h2>
        <p>${res.win ? `Tu as vaincu <b>${esc(res.enemy.enemy)}</b>.` : `<b>${esc(res.enemy.enemy)}</b> a été plus fort cette fois. Reviens avec plus de ${STATS.find((x) => x.id === res.enemy.stat).name.toLowerCase()} ou un meilleur équipement.`}</p>
        <p class="rpg-rewards">+${res.gold} 🪙${res.item ? ` · ${itemCard(res.item)}` : ''}</p>
        ${res.chapterDone ? `<div class="rpg-tale"><b>${res.chapterDone.icon} ${esc(res.chapterDone.name)} : terminé !</b><br>${esc(res.chapterDone.outro)}</div>` : ''}
        <div class="modal-actions"><button class="btn primary" data-close>Continuer</button></div></div>`, (m, close) => {
      m.classList.add('rpg-modal');
      m.querySelector('[data-close]').onclick = () => { close(); redraw(); };
    });
  };
  $$('[data-chest]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const r = await openChest(b.dataset.chest);
    if (!r) return redraw();
    modal(`<div class="rpg-result win"><div class="rpg-chest-open">${r.chest.icon}</div><h2>${esc(r.chest.name)}</h2>
      ${r.upgraded ? '<p class="rpg-up">✨ Le coffre était meilleur que prévu !</p>' : ''}
      ${itemCard(r.item)}<p class="rpg-rewards">+${r.gold} 🪙</p>
      <div class="modal-actions"><button class="btn primary" data-close>Super !</button></div></div>`, (m, close) => {
      m.classList.add('rpg-modal');
      m.querySelector('[data-close]').onclick = () => { close(); redraw(); };
    });
  }));
  const mutate = async (fn) => { const st2 = await load(); fn(st2); await save(st2); redraw(); };
  $$('[data-equip]').forEach((b) => (b.onclick = () => mutate((x) => { const it = ITEM[x.inv.find((i) => i.uid === b.dataset.equip).id]; x.equip = { ...x.equip, [it.slot]: b.dataset.equip }; toast(`${it.icon} ${it.name} équipé`); })));
  $$('[data-unequip]').forEach((b) => (b.onclick = () => mutate((x) => { delete x.equip[b.dataset.unequip]; })));
  $$('[data-sell]').forEach((b) => (b.onclick = () => mutate((x) => {
    const i = x.inv.findIndex((v) => v.uid === b.dataset.sell);
    const it = ITEM[x.inv[i].id], p = Math.floor(RARITY[it.rarity].price / 3);
    x.inv.splice(i, 1); x.gold += p; addLog(x, `🪙 Vendu : ${it.icon} ${it.name} (+${p} 🪙)`); toast(`Vendu pour ${p} 🪙`);
  })));
  $$('[data-buy]').forEach((b) => (b.onclick = () => mutate((x) => {
    const it = ITEM[b.dataset.buy], p = RARITY[it.rarity].price;
    if (x.gold < p) return;
    x.gold -= p; x.inv.push({ uid: U.uid(), id: it.id }); addLog(x, `🛒 Acheté : ${it.icon} ${it.name} (−${p} 🪙)`); toast(`${it.icon} ${it.name} acheté`);
  })));
}

/** Pour le résumé ailleurs (page du héros) : énergie, or, coffres, chapitre. */
export async function summary() {
  const s = await load();
  const st = await computeStats(s);
  const cur = current(s);
  return { energy: energyOf(s, st.xpTotal), gold: s.gold, chests: (await chests(s)).length, where: cur.arena ? 'Arène' : `${cur.ch.icon} ${cur.ch.name}` };
}
