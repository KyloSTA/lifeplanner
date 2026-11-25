// 📖 Livre d'or (onglet de Finances) : règles non négociables, objectifs à cocher, paie de la semaine en enveloppes,
// compteur de jours sans jeu et bilan du jeu mois par mois.
//
// Rien de personnel dans ce fichier : le contenu (guide, règles, objectifs, enveloppes, comptes à surveiller)
// vient d'un fichier .json privé que l'utilisateur importe. Il est gardé dans les réglages (IndexedDB) :
//   « livreOr »       { titre, depart, guide (markdown), regles [], objectifs { jour, semaine, mois, trimestre, semestre, annee },
//                       echeances { trimestre, semestre, annee }, paie { motif, enveloppes [{ e, nom, montant }] },
//                       jeu { comptes [noms de comptes du relevé de placements], interac (motif), marchands (motif) } }
//   « livreOrChecks » { clé: true }  (cases cochées ; la clé contient la période pour les objectifs du jour, de la semaine, du mois)
//   « livreOrRechutes » [dates AAAA-MM-JJ]  (« J'ai rejoué », noté à la main)
//   « jeuLog »        [{ id, d, v, acc }] mouvements d'argent tirés du relevé de placements (v > 0 = argent mis, v < 0 = retiré)
import { db } from './db.js';
import * as U from './util.js';
import { renderMarkdown } from './mdnotes.js';

const { esc } = U;
const KEY = 'livreOr', CHECKS = 'livreOrChecks', RELAPSE = 'livreOrRechutes', LOG = 'jeuLog';
const fmt0 = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
const $0 = (v) => fmt0.format(v);
const HORIZONS = [['jour', 'Aujourd’hui'], ['semaine', 'Cette semaine'], ['mois', 'Ce mois-ci'], ['trimestre', '3 mois'], ['semestre', '6 mois'], ['annee', '1 an']];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const dayMs = 864e5;
const daysBetween = (a, b) => Math.round((U.parseISO(b) - U.parseISO(a)) / dayMs);
const weekStart = (d = new Date()) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return U.iso(x); };
let horizon = 'jour';

/* ---------- Relevé de placements -> journal du jeu ---------- */
/** Garde les dépôts et retraits des comptes à surveiller, sans les allers-retours entre ces comptes eux-mêmes. */
export async function storeGambling(rows) {
  const cfg = await db.get('settings', KEY);
  const watch = (cfg?.jeu?.comptes || []).map((s) => s.toLowerCase());
  if (!watch.length) return { stored: 0, reason: 'nocfg' };
  const mv = rows.filter((r) => /moneymovement/i.test(r.activity_type) && watch.includes(String(r.account_name || '').toLowerCase()))
    .map((r) => ({ d: r.effective_date, t: r.effective_time || '', acc: r.account_name, v: Math.round(Number(r.net_cash_amount) * 100) / 100 }))
    .filter((x) => x.d && x.v);
  // Transfert entre deux comptes surveillés : même montant, signes opposés, à 3 jours ou moins -> ce n'est pas de l'argent mis ou retiré
  const used = new Set();
  for (let i = 0; i < mv.length; i++) {
    if (used.has(i)) continue;
    const j = mv.findIndex((y, k) => k !== i && !used.has(k) && y.acc !== mv[i].acc && Math.abs(y.v + mv[i].v) < 0.01 && Math.abs(daysBetween(mv[i].d, y.d)) <= 3);
    if (j >= 0) { used.add(i); used.add(j); }
  }
  const seen = {};
  const fresh = mv.filter((_, i) => !used.has(i)).map((x) => {
    const base = [x.d, x.t, x.acc, x.v].join('|');
    seen[base] = (seen[base] || 0) + 1;
    return { id: base + '|' + seen[base], d: x.d, v: x.v, acc: x.acc };
  });
  const old = (await db.get('settings', LOG)) || [];
  const byId = new Map(old.map((x) => [x.id, x]));
  let added = 0;
  for (const x of fresh) if (!byId.has(x.id)) { byId.set(x.id, x); added++; }
  await db.put('settings', [...byId.values()].sort((a, b) => a.d.localeCompare(b.d)), LOG);
  return { stored: added, total: fresh.length };
}

/** Toutes les mises et tous les retraits : relevé de placements + virements Interac et marchands désignés. */
function gambleEvents(cfg, log, all) {
  const ev = log.map((x) => ({ d: x.d, v: x.v, src: x.acc }));
  const iRe = cfg.jeu?.interac ? new RegExp(cfg.jeu.interac, 'i') : null;
  const mRe = cfg.jeu?.marchands ? new RegExp(cfg.jeu.marchands, 'i') : null;
  for (const t of all) {
    const name = `${t.key || ''} ${t.merchant || ''} ${t.rawName || ''}`;
    if ((iRe && t.etr !== undefined && iRe.test(name)) || (iRe && /virement|e ?transfer/i.test(t.raw || '') && iRe.test(name)) || (mRe && t.kind === 'depense' && mRe.test(name))) {
      ev.push({ d: t.date, v: -t.amount, src: t.merchant });
    }
  }
  return ev.sort((a, b) => a.d.localeCompare(b.d));
}

/* ---------- Page ---------- */
export async function draw(ctx, el, all) {
  const [cfg, checks, relapses, log] = await Promise.all([db.get('settings', KEY), db.get('settings', CHECKS), db.get('settings', RELAPSE), db.get('settings', LOG)]);
  if (!cfg) return drawEmpty(ctx, el);
  const ck = checks || {};
  const today = U.iso(new Date());
  const ev = gambleEvents(cfg, log || [], all);
  // Jours sans jeu : depuis la dernière mise (relevés), la dernière rechute notée ou le départ, le plus récent des trois
  const lastBet = ev.filter((x) => x.v > 0).map((x) => x.d).pop() || '';
  const lastRelapse = (relapses || []).slice().sort().pop() || '';
  const from = [cfg.depart || '', lastBet, lastRelapse].filter(Boolean).sort().pop() || today;
  const streak = Math.max(0, daysBetween(from, today)); // une mise hier = 1 jour sans jeu aujourd'hui
  const nextGoal = [1, 7, 30, 90, 180, 365, 730].find((n) => n > streak) || streak + 365;

  // Bilan du jeu : 12 derniers mois
  const months = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  const byM = Object.fromEntries(months.map((m) => [m, { put: 0, back: 0, days: new Set() }]));
  for (const x of ev) { const m = byM[x.d.slice(0, 7)]; if (!m) continue; if (x.v > 0) { m.put += x.v; m.days.add(x.d); } else m.back -= x.v; }
  const tot = Object.values(byM).reduce((a, m) => ({ put: a.put + m.put, back: a.back + m.back, days: a.days + m.days.size }), { put: 0, back: 0, days: 0 });

  // Paie de la semaine : le dernier dépôt de salaire qui correspond au motif
  const pRe = cfg.paie?.motif ? new RegExp(cfg.paie.motif, 'i') : null;
  const pays = all.filter((t) => t.kind === 'revenu' && t.amount > 0 && (pRe ? pRe.test(`${t.key} ${t.merchant} ${t.rawName}`) : t.cat === 'salaire')).sort((a, b) => b.date.localeCompare(a.date));
  const pay = pays[0];
  const env = cfg.paie?.enveloppes || [];
  const envSum = env.reduce((a, x) => a + (Number(x.montant) || 0), 0);
  const avgPay = pays.length ? pays.slice(0, 8).reduce((a, t) => a + t.amount, 0) / Math.min(8, pays.length) : 0;
  const payKey = pay ? `paie|${pay.id}` : '';

  const periodKey = (h) => (h === 'jour' ? today : h === 'semaine' ? weekStart() : h === 'mois' ? today.slice(0, 7) : 'fixe');
  const goals = cfg.objectifs || {};
  const due = cfg.echeances || {};
  const goalList = (goals[horizon] || []).map((g, i) => ({ g, k: `obj|${horizon}|${periodKey(horizon)}|${i}` }));
  const doneN = goalList.filter((x) => ck[x.k]).length;

  el.innerHTML = `
    <div class="kpis fi-kpis lo-kpis">
      <div class="kpi ${streak >= 7 ? 'ok' : ''}"><b>${streak} jour${streak > 1 ? 's' : ''}</b><span>sans jeu · prochain cap : ${nextGoal} j</span></div>
      <div class="kpi"><b>${pay ? $0(pay.amount) : '—'}</b><span>${pay ? `paie du ${esc(U.fmtShort(U.parseISO(pay.date)))}` : 'aucune paie trouvée'}${avgPay ? ` · moy. ${$0(avgPay)}` : ''}</span></div>
      <div class="kpi ${tot.back - tot.put < 0 ? 'bad' : ''}"><b>${$0(tot.put)}</b><span>misé en 12 mois · ${tot.days} jour${tot.days > 1 ? 's' : ''} de jeu</span></div>
      <div class="kpi ${tot.back - tot.put < 0 ? 'bad' : 'ok'}"><b>${tot.back - tot.put < 0 ? '−' : '+'}${$0(Math.abs(tot.back - tot.put))}</b><span>résultat net du jeu (12 mois)</span></div>
    </div>

    <div class="lo-grid">
      <section class="card lo-streak">
        <div class="card-head"><h2>🛡 Jours sans jeu</h2><span class="muted">depuis le ${esc(U.fmtShort(U.parseISO(from)))}</span></div>
        <div class="fi-meter"><i style="width:${Math.min(100, (streak / nextGoal) * 100)}%"></i></div>
        <p class="hint">${streak === 0 ? 'Aujourd’hui est le jour 1. Une journée à la fois.' : streak < 7 ? 'Les premiers jours sont les plus durs. Tiens bon.' : streak < 30 ? 'Une semaine et plus : l’habitude change.' : 'Tu reprends le contrôle. Continue.'}
          ${lastBet ? ` Dernière mise vue dans tes relevés : ${esc(U.fmtShort(U.parseISO(lastBet)).replace(/\.$/, ''))}.` : ''}</p>
        <div class="lo-acts"><button class="btn" id="lo-relapse" title="Note une rechute honnêtement et recommence le compteur">↺ J’ai rejoué</button>
          <a class="btn" href="tel:18004610140" title="Jeu : aide et référence, gratuit et confidentiel, 24 h sur 24">📞 Ligne d’aide</a></div>
      </section>

      <section class="card lo-pay">
        <div class="card-head"><h2>💼 Paie de la semaine</h2>${pay ? `<span class="muted">${$0(pay.amount)} · ${esc(U.fmtShort(U.parseISO(pay.date)))}</span>` : ''}</div>
        ${env.length ? `<table class="lo-table lo-env"><tbody>
          ${env.map((x, i) => `<tr class="${ck[`${payKey}|${i}`] ? 'done' : ''}"><td><label class="check"><input type="checkbox" data-ck="${esc(`${payKey}|${i}`)}" ${ck[`${payKey}|${i}`] ? 'checked' : ''} ${pay ? '' : 'disabled'}> <span>${esc(x.e || '')} ${esc(x.nom)}</span></label></td><td class="num">${$0(x.montant)}</td></tr>`).join('')}
          </tbody><tfoot><tr><td>${pay ? 'Reste libre' : 'Total des enveloppes'}</td><td class="num"><b class="${pay && pay.amount - envSum < 0 ? 'lo-neg' : ''}">${pay ? $0(pay.amount - envSum) : $0(envSum)}</b></td></tr></tfoot></table>
          <p class="hint muted">Coche chaque enveloppe une fois l’argent placé. ${pay && pay.amount < envSum ? 'Petite paie cette semaine : coupe d’abord dans Restos et Achats, jamais dans l’épargne.' : ''}</p>`
        : '<p class="empty-sm">Aucune enveloppe dans ton livre d’or.</p>'}
      </section>
    </div>

    <section class="card lo-goals">
      <div class="card-head"><h2>🎯 Objectifs</h2><span class="muted">${doneN}/${goalList.length}${['trimestre', 'semestre', 'annee'].includes(horizon) && due[horizon] ? ` · d’ici le ${esc(U.fmtShort(U.parseISO(due[horizon])))}` : ''}</span></div>
      <div class="seg lo-hz" role="tablist">${HORIZONS.map(([k, l]) => `<button role="tab" data-hz="${k}" class="${horizon === k ? 'on' : ''}" aria-selected="${horizon === k}">${l}</button>`).join('')}</div>
      ${goalList.length ? `<ul class="lo-list">${goalList.map((x) => `<li class="${ck[x.k] ? 'done' : ''}"><label class="check"><input type="checkbox" data-ck="${esc(x.k)}" ${ck[x.k] ? 'checked' : ''}> <span>${esc(x.g)}</span></label></li>`).join('')}</ul>` : '<p class="empty-sm">Aucun objectif pour cette période.</p>'}
    </section>

    <section class="card lo-rules">
      <div class="card-head"><h2>📜 Règles non négociables</h2></div>
      <ol class="lo-rules-list">${(cfg.regles || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
    </section>

    <section class="card lo-gamble">
      <div class="card-head"><h2>🎲 Le jeu, mois par mois</h2><span class="muted">${(log || []).length ? '' : 'importe ton relevé de placements pour le détail'}</span></div>
      <table class="lo-table lo-gt"><thead><tr><th>Mois</th><th class="num">Misé</th><th class="num">Retiré</th><th class="num">Net</th><th class="num">Jours</th></tr></thead><tbody>
        ${months.slice().reverse().map((m) => { const x = byM[m]; const net = x.back - x.put; return `<tr class="${x.put ? '' : 'lo-zero'}"><td>${MOIS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}</td><td class="num">${x.put ? $0(x.put) : '—'}</td><td class="num">${x.back ? $0(x.back) : '—'}</td><td class="num ${net < 0 ? 'lo-neg' : net > 0 ? 'lo-pos' : ''}">${x.put || x.back ? `${net < 0 ? '−' : '+'}${$0(Math.abs(net))}` : '✓ 0 $'}</td><td class="num">${x.days.size || ''}</td></tr>`; }).join('')}
      </tbody></table>
      <p class="hint muted">Un mois à « ✓ 0 $ » est une victoire. Le but n’est pas de finir gagnant : c’est de ne plus jouer.</p>
    </section>

    ${cfg.guide ? `<details class="card lo-guide"><summary><h2>📖 ${esc(cfg.titre || 'Mon livre d’or')} : l’étude complète</h2></summary><div class="mdn-body">${renderMarkdown(cfg.guide)}</div></details>` : ''}

    <div class="lo-foot"><label class="btn" title="Remplacer par un nouveau fichier .json"><input type="file" accept=".json,application/json" hidden id="lo-file">📥 Importer un livre d’or</label>
      <button class="btn" id="lo-export">💾 Exporter</button></div>`;

  bindImport(ctx, el);
  el.querySelectorAll('[data-hz]').forEach((b) => (b.onclick = () => { horizon = b.dataset.hz; draw(ctx, el, all); }));
  el.querySelectorAll('[data-ck]').forEach((b) => (b.onchange = async () => {
    const cur = (await db.get('settings', CHECKS)) || {};
    if (b.checked) cur[b.dataset.ck] = true; else delete cur[b.dataset.ck];
    // Les cases des jours et semaines passés ne servent plus : on ne garde que les 60 derniers jours
    const limit = U.iso(new Date(Date.now() - 60 * dayMs));
    for (const k of Object.keys(cur)) { const p = k.split('|'); if (p[0] === 'obj' && /^\d{4}-\d{2}-\d{2}$/.test(p[2]) && p[2] < limit) delete cur[k]; }
    await db.put('settings', cur, CHECKS);
    b.closest('li, tr')?.classList.toggle('done', b.checked);
  }));
  el.querySelector('#lo-relapse').onclick = () => {
    ctx.modal(`<h2>↺ Noter une rechute</h2><p>Merci d’être honnête avec toi-même. Le compteur repart à zéro, mais tout ce que tu as appris reste.</p>
      <p class="hint">Ne cherche pas à te refaire. Si l’envie est forte, appelle Jeu : aide et référence au <b>1 800 461-0140</b> (gratuit, 24 h sur 24).</p>
      <div class="modal-actions"><button class="btn" data-close>Annuler</button><button class="btn primary" id="lo-rel-ok">Noter aujourd’hui</button></div>`, (m, close) => {
      m.querySelector('#lo-rel-ok').onclick = async () => {
        const list = (await db.get('settings', RELAPSE)) || [];
        await db.put('settings', [...new Set([...list, today])], RELAPSE);
        close();
        draw(ctx, el, all);
      };
    });
  };
  el.querySelector('#lo-export').onclick = async () => {
    const data = await db.get('settings', KEY);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'livre-dor.json' });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
}

function drawEmpty(ctx, el) {
  el.innerHTML = `<section class="card fi-setup lo-empty"><h2>📖 Ton livre d’or</h2>
    <p>Un seul endroit pour tes règles d’argent non négociables, tes objectifs du jour à l’année, ta paie de la semaine divisée en enveloppes et ton compteur de jours sans jeu.</p>
    <p class="hint muted">Le contenu vient d’un fichier <code>livre-dor.json</code> privé. Il reste dans ton Life Planner et n’est jamais publié.</p>
    <label class="btn primary"><input type="file" accept=".json,application/json" hidden id="lo-file">📥 Importer mon livre d’or</label></section>`;
  bindImport(ctx, el);
}

function bindImport(ctx, el) {
  const input = el.querySelector('#lo-file');
  if (!input) return;
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data?.type !== 'lifeplanner-livre-or') throw new Error('ce fichier n’est pas un livre d’or');
      delete data.type;
      await db.put('settings', data, KEY);
      ctx.toast('📖 Livre d’or importé');
      el.dispatchEvent(new CustomEvent('lo-refresh', { bubbles: true }));
    } catch (err) { ctx.toast('Import impossible : ' + err.message, 'err'); }
  };
}
