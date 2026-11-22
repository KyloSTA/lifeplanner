// 🏡 Projet Propriété : acheter la maison (et vendre le condo) ou la louer (et garder le condo en location).
// Données : réglage synchronisé « propriete » (sur tes appareils et ta synchro Drive privée seulement).
// Le code ne contient aucun chiffre personnel : seulement l'annonce publique et des estimations du marché.
import { db } from './db.js';
import * as U from './util.js';
import * as docs from './docs.js';
import { addTask } from './tasks.js';
import { OPTIONS, DEFAULTS, compute } from './property-calc.js';
import { drawDossier } from './property-dossier.js';

const { esc } = U;
const KEY = 'propriete';
let tab = 'comparatif';
const TABS = [['comparatif', '📊', 'Comparatif'], ['achat', '🔑', 'Achat'], ['location', '🏠', 'Location'], ['hypotheses', '⚙', 'Hypothèses'], ['etapes', '✅', 'Étapes'], ['documents', '📎', 'Documents'], ['notes', '📝', 'Notes']];

const money = (v, dec = 0) => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: dec, minimumFractionDigits: dec }).format(Number(v) || 0);
const signed = (v) => `${v < 0 ? '−' : '+'}${money(Math.abs(v))}`;
const pct = (v, d = 1) => `${(Math.round(v * 10 ** d) / 10 ** d).toLocaleString('fr-CA')} %`;

const STEPS = [
  ['achat', 'Obtenir une pré-approbation hypothécaire (taux, amortissement, montant maximal)'],
  ['achat', 'Demander au prêteur la pénalité exacte pour rembourser l’hypothèque du condo (ou la transférer)'],
  ['achat', 'Faire évaluer le prix de vente du condo par un courtier'],
  ['achat', 'Visiter la maison (et poser les questions de la liste)'],
  ['achat', 'Promesse d’achat conditionnelle (financement, inspection, vente du condo)'],
  ['achat', 'Inspection préachat de la maison'],
  ['achat', 'Mettre le condo en vente'],
  ['achat', 'Rendez-vous chez le notaire (achat et vente)'],
  ['location', 'Négocier le bail de la maison avec le vendeur (durée, hausse, option d’achat ?)'],
  ['location', 'Lire la déclaration de copropriété : location permise ? à la chambre ?'],
  ['location', 'Aviser le syndicat de copropriété de la location'],
  ['location', 'Passer l’assurance du condo en assurance de propriétaire bailleur'],
  ['location', 'Estimer les loyers avec des annonces comparables (bail et chambres)'],
  ['location', 'Annonce, visites et enquête de prélocation des locataires'],
  ['location', 'Signer le bail (formulaire du TAL) et faire l’état des lieux'],
  ['location', 'Meubler les chambres (si location à la chambre)'],
  ['location', 'Prévoir la déclaration des revenus de location (T776 / TP-128)'],
  ['commun', 'Valider les chiffres avec un courtier hypothécaire et un comptable'],
  ['commun', 'Planifier le déménagement et le changement d’adresse'],
];

async function load() {
  const d = (await db.get('settings', KEY)) || {};
  if (!d.scenarios || !Object.keys(d.scenarios).length) d.scenarios = { reel: { name: 'Réaliste', a: {} } };
  if (!d.cur || !d.scenarios[d.cur]) d.cur = Object.keys(d.scenarios)[0];
  d.steps ||= STEPS.map(([path, title], i) => ({ id: 's' + i, path, title, done: false }));
  d.docs ||= [];
  d.links ||= [];
  d.bien ||= {}; // adresse et annonce de la maison visée (importées, jamais dans le code)
  d.pros ||= { achat: [], location: [] };
  d.cons ||= { achat: [], location: [] };
  d.questions ||= [];
  d.journal ||= [];
  d.decision ||= '';
  return d;
}
const store = (d) => db.put('settings', d, KEY);

/* =========================================================
   Page
   ========================================================= */
export async function renderPage(ctx, arg) {
  const { view, toast, modal, confirmBox } = ctx;
  if (arg && TABS.some(([k]) => k === arg)) tab = arg;
  let d = await load();
  const sc = () => d.scenarios[d.cur];
  const A = () => ({ ...DEFAULTS, ...sc().a });
  const save = async () => { await store(d); };

  // 🗂 Sous-page « Dossier de location » (#/propriete/dossier)
  if (arg === 'dossier') {
    view.innerHTML = `<header class="page-head"><div><a class="pp-back" href="#/propriete">← Projet Propriété</a><h1>🗂 Dossier de location</h1>
      <p class="muted pp-sub">Louer à deux quand un des deux a un crédit plus faible : préparer un dossier qui rassure le propriétaire.</p></div></header>
      <div id="pp-body"></div>`;
    await drawDossier(view.querySelector('#pp-body'), ctx, d, A(), save);
    return;
  }

  view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Projet</p><h1>🏡 Projet Propriété</h1><p class="muted pp-sub">${d.bien.adresse ? `Acheter la maison du ${esc(d.bien.adresse)}, ou la louer et garder le condo en location ?` : 'Acheter la maison visée (et vendre le condo), ou la louer et garder le condo en location ?'}</p><a class="pp-mini" href="#/propriete/dossier" title="Préparer le dossier pour louer à deux (preuves, lettre, caution)">🗂 Dossier de location</a></div>
      <div class="head-actions pp-scen">
        <label class="pp-scen-pick">Scénario <select id="pp-scen" aria-label="Scénario">${Object.entries(d.scenarios).map(([k, s]) => `<option value="${k}" ${k === d.cur ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <button class="btn" id="pp-scen-new" title="Nouveau scénario (copie, prudent ou optimiste)">＋</button>
        <button class="btn icon" id="pp-scen-more" title="Renommer, supprimer, importer, exporter" aria-label="Options du scénario">⋯</button>
      </div>
    </header>
    <div class="seg pp-tabs" role="tablist">${TABS.map(([k, e, l]) => `<button role="tab" data-tab="${k}" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}"><span>${e}</span> <span class="pp-tab-l">${l}</span></button>`).join('')}</div>
    <div id="pp-body"></div>`;

  const $ = (s) => view.querySelector(s);
  view.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; renderPage(ctx); }));
  $('#pp-scen').onchange = async (e) => { d.cur = e.target.value; await save(); renderPage(ctx); };
  $('#pp-scen-new').onclick = () => newScenario();
  $('#pp-scen-more').onclick = () => scenarioMenu();

  const body = $('#pp-body');
  const draw = () => {
    const r = compute(A());
    if (tab === 'comparatif') drawCompare(r);
    else if (tab === 'achat') drawAchat(r);
    else if (tab === 'location') drawLocation(r);
    else if (tab === 'hypotheses') drawHyp(r);
    else if (tab === 'etapes') drawSteps();
    else if (tab === 'documents') drawDocs();
    else drawNotes();
  };

  /* ---------- Champs d'hypothèses (enregistrés dans le scénario courant) ---------- */
  const field = (k, label, { suf = '$', step = 'any', hint = '', ph = '' } = {}) => {
    const v = sc().a[k] ?? DEFAULTS[k];
    return `<label class="pp-field"><span class="pp-lbl">${label}${hint ? ` <i class="pp-hint" title="${esc(hint)}">ⓘ</i>` : ''}</span>
      <span class="pp-in"><input type="number" inputmode="decimal" step="${step}" data-k="${k}" value="${v === '' || v == null ? '' : esc(String(v))}" placeholder="${esc(ph)}"><b>${suf}</b></span></label>`;
  };
  const check = (k, label, hint = '') => `<label class="pp-check"><input type="checkbox" data-k="${k}" ${(sc().a[k] ?? DEFAULTS[k]) ? 'checked' : ''}> <span>${label}</span>${hint ? ` <i class="pp-hint" title="${esc(hint)}">ⓘ</i>` : ''}</label>`;
  const bindFields = (root) => {
    root.querySelectorAll('input[data-k]').forEach((inp) => (inp.onchange = async () => {
      const k = inp.dataset.k;
      sc().a[k] = inp.type === 'checkbox' ? inp.checked : inp.value === '' ? '' : Number(inp.value);
      await save();
      const y = window.scrollY, vy = view.scrollTop;
      draw();
      view.scrollTop = vy; window.scrollTo(0, y);
    }));
  };
  const rows = (list) => `<table class="pp-table"><tbody>${list.filter(Boolean).map(([l, v, cls = '']) => `<tr class="${cls}"><td>${l}</td><td class="num">${v}</td></tr>`).join('')}</tbody></table>`;
  const warnBox = (r) => (r.warnings.length ? `<div class="pp-warn">${r.warnings.map((w) => `<p>⚠ ${esc(w)}</p>`).join('')}</div>` : '');

  /* ---------- 📊 Comparatif ---------- */
  function drawCompare(r) {
    const last = r.years[r.years.length - 1];
    const sorted = [...OPTIONS].sort((x, y) => last[y.id].patrimoine - last[x.id].patrimoine);
    const best = sorted[0], second = sorted[1];
    const share = (id, v) => {
      // Coûts de la maison partagés selon les parts ; le condo (et ses revenus) reste à toi
      const det = r.month1.det[id];
      const houseCost = id === 'achat' ? det.hypotheque + det.taxes + det.assurance + det.entretien + det.energie : det.loyer + det.assurLocataire + det.energie;
      const p = (Number(r.a.partPct) || 0) / 100;
      return { moi: v - houseCost * (1 - p), autre: houseCost * (1 - p) };
    };
    body.innerHTML = `${warnBox(r)}
      <section class="card pp-horizon">
        <div class="pp-hz-row"><label for="pp-hz"><b>Horizon</b> <span class="muted">— comparer sur</span></label>
          <input type="range" id="pp-hz" min="1" max="25" step="1" value="${r.N}" aria-label="Horizon en années"><b class="pp-hz-v">${r.N} an${r.N > 1 ? 's' : ''}</b></div>
        <p class="pp-verdict">🏆 Sur <b>${r.N} an${r.N > 1 ? 's' : ''}</b>, <b>${best.icon} ${esc(best.name)}</b> te laisse ${sorted.slice(1).map((o) => `<b>${money(last[best.id].patrimoine - last[o.id].patrimoine)}</b> de plus que ${o.icon} ${esc(o.short.toLowerCase())}`).join(' et ')}.
          ${r.bascule && r.bascule > 1 ? `Elle passe en tête à partir de l’<b>année ${r.bascule}</b>.` : r.bascule === 1 ? 'Elle est en tête dès la première année.' : ''}</p>
        ${(() => {
          // Sur 25 ans : à partir de quand acheter devient-il plus payant que la meilleure location ?
          const long = compute({ ...A(), horizon: 25 }).years;
          let from = null;
          for (let k = long.length - 1; k >= 0; k--) {
            const y = long[k];
            if (y.achat.patrimoine >= Math.max(y.bail.patrimoine, y.chambres.patrimoine)) from = y.year; else break;
          }
          return `<p class="pp-cross">${from ? `🔑 Selon ces hypothèses, <b>acheter devient plus payant que louer à partir de l’année ${from}</b>${from <= r.N ? '' : ' — au-delà de l’horizon choisi'}.` : '🏠 Selon ces hypothèses, <b>louer reste plus payant qu’acheter pendant 25 ans</b>.'}</p>`;
        })()}
      </section>
      <div class="pp-cards">${OPTIONS.map((o) => {
        const y1 = r.month1.out[o.id], s = share(o.id, y1), L = last[o.id];
        const isBest = o.id === best.id;
        return `<section class="card pp-card ${isBest ? 'best' : ''}" style="--oc:${o.color}">
          <div class="pp-card-head"><span class="pp-ico">${o.icon}</span><h3>${esc(o.name)}</h3>${isBest ? '<span class="pp-badge">🏆 Meilleur</span>' : ''}</div>
          <div class="pp-big"><small>Coût net par mois (an 1)</small><b>${money(y1)}</b></div>
          <p class="pp-share muted">Ta part ≈ <b>${money(s.moi)}</b> · ${esc(r.a.partNom || 'Conjoint·e')} ≈ <b>${money(s.autre)}</b></p>
          <div class="pp-big"><small>Patrimoine dans ${r.N} an${r.N > 1 ? 's' : ''}</small><b>${money(L.patrimoine)}</b></div>
          <p class="muted pp-share">${isBest ? 'Option la plus avantageuse' : `${signed(L.patrimoine - last[best.id].patrimoine)} vs la meilleure`}</p>
        </section>`;
      }).join('')}</div>
      <section class="card"><div class="card-head"><h2>Patrimoine net au fil des ans</h2><span class="muted">${r.a.liquidation ? 'si tout était vendu (frais et impôt déduits)' : 'avant frais de vente'}</span></div>
        ${chart(r)}
        <div class="pp-legend">${OPTIONS.map((o) => `<span><i style="background:${o.color}"></i>${esc(o.short)}</span>`).join('')}</div>
      </section>
      <section class="card fi-tbl-card"><div class="card-head fi-tbl-head"><h2>Année par année</h2><span class="muted">coût net de l’année · patrimoine en fin d’année</span></div>
        <div class="pp-scroll"><table class="pp-table pp-years"><thead><tr><th>Année</th>${OPTIONS.map((o) => `<th class="num">${o.icon} Coût</th>`).join('')}${OPTIONS.map((o) => `<th class="num">${o.icon} Patrimoine</th>`).join('')}</tr></thead>
        <tbody>${r.years.map((y, i) => {
          const prev = r.years[i - 1];
          const top = OPTIONS.map((o) => o.id).sort((x, z) => y[z].patrimoine - y[x].patrimoine)[0];
          return `<tr><td>${y.year}</td>${OPTIONS.map((o) => `<td class="num">${money(y[o.id].cumul - (prev ? prev[o.id].cumul : 0))}</td>`).join('')}${OPTIONS.map((o) => `<td class="num ${o.id === top ? 'pp-top' : ''}">${money(y[o.id].patrimoine)}</td>`).join('')}</tr>`;
        }).join('')}</tbody></table></div>
      </section>
      <section class="card"><div class="card-head"><h2>Au départ</h2><span class="muted">l’argent qui bouge le jour du changement</span></div>
        <div class="pp-two">
          <div><h3>🔑 Achat</h3>${rows([
            ['Vente du condo, après frais, pénalité et hypothèque', money(r.vente.net)],
            ['+ Épargne ajoutée', money(r.a.epargne || 0)],
            ['− Taxe de bienvenue, notaire, inspection, déménagement', '−' + money(r.achat.closing)],
            r.achat.premiumTax ? ['− Taxe sur la prime SCHL (comptant)', '−' + money(r.achat.premiumTax)] : null,
            ['= Mise de fonds sur la maison', `<b>${money(r.achat.down)}</b> (${pct(r.achat.downPct)})`, 'pp-total'],
          ])}</div>
          <div><h3>🏠 Location</h3>${rows([
            ['Condo conservé : équité actuelle', money(r.vente.prixVente - r.vente.solde)],
            ['− Déménagement', '−' + money(r.a.demenagement || 0)],
            ['− Meubles des chambres (option chambres)', '−' + money(r.a.meubles || 0)],
            ['Épargne qui reste placée', money(r.a.epargne || 0), 'pp-total'],
          ])}</div>
        </div>
      </section>
      <p class="hint muted">Estimations pour t’aider à décider : à valider avec un courtier hypothécaire, un notaire et un comptable. Les placements supposent un compte à l’abri de l’impôt (CELI/REER). L’option la moins chère chaque mois place la différence, pour comparer à argent égal.</p>`;
    const hz = body.querySelector('#pp-hz');
    hz.oninput = () => { body.querySelector('.pp-hz-v').textContent = `${hz.value} an${hz.value > 1 ? 's' : ''}`; };
    hz.onchange = async () => { sc().a.horizon = Number(hz.value); await save(); draw(); };
  }

  function chart(r) {
    const W = 720, H = 260, P = { l: 70, r: 14, t: 14, b: 30 };
    const pts = [{ year: 0, ...Object.fromEntries(OPTIONS.map((o) => [o.id, { patrimoine: r.start[o.id] }])) }, ...r.years];
    const vals = pts.flatMap((p) => OPTIONS.map((o) => p[o.id].patrimoine));
    let lo = Math.min(0, ...vals), hi = Math.max(...vals);
    if (hi === lo) hi = lo + 1;
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const x = (i) => P.l + (i / Math.max(1, pts.length - 1)) * (W - P.l - P.r);
    const y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
    const ticks = 4, grid = [...Array(ticks + 1)].map((_, i) => lo + ((hi - lo) * i) / ticks);
    const k = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)} M$` : `${Math.round(v / 1000)} k$`);
    const step = Math.ceil(pts.length / 10);
    return `<svg class="pp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Patrimoine net par année">
      ${grid.map((g) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(g)}" y2="${y(g)}" class="pp-grid"/><text x="${P.l - 8}" y="${y(g) + 4}" text-anchor="end" class="pp-ax">${k(g)}</text>`).join('')}
      ${lo < 0 && hi > 0 ? `<line x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}" class="pp-zero"/>` : ''}
      ${pts.map((p, i) => (i % step === 0 || i === pts.length - 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="pp-ax">${p.year === 0 ? 'Auj.' : 'An ' + p.year}</text>` : '')).join('')}
      ${OPTIONS.map((o) => `<polyline fill="none" stroke="${o.color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((p, i) => `${x(i).toFixed(1)},${y(p[o.id].patrimoine).toFixed(1)}`).join(' ')}"/>
        <circle cx="${x(pts.length - 1)}" cy="${y(pts[pts.length - 1][o.id].patrimoine)}" r="4.5" fill="${o.color}"><title>${esc(o.short)} : ${money(pts[pts.length - 1][o.id].patrimoine)}</title></circle>`).join('')}
    </svg>`;
  }

  /* ---------- 🔑 Achat ---------- */
  function drawAchat(r) {
    const m = r.month1.det.achat;
    body.innerHTML = `${warnBox(r)}
      <div class="pp-two">
        <section class="card"><div class="card-head"><h2>💸 Vente du condo</h2></div>
          <div class="pp-fields">
            ${field('prixVente', 'Prix de vente visé', { hint: 'Ta fourchette réaliste, selon ton courtier' })}
            ${field('commissionPct', 'Commission du courtier', { suf: '%', hint: 'Taxes (TPS + TVQ) ajoutées automatiquement' })}
            ${field('fraisVente', 'Frais de vente', { hint: 'Certificat de localisation, quittance chez le notaire…' })}
            ${field('penalite', 'Pénalité hypothécaire', { ph: `auto ≈ ${Math.round(r.vente.penalAuto)}`, hint: 'Vide = 3 mois d’intérêt (souvent le minimum). Demande le montant exact à ton prêteur : le différentiel de taux peut être plus élevé.' })}
            ${check('transfert', 'Transférer l’hypothèque du condo vers la maison (pas de pénalité)', 'Si ton prêteur permet la transférabilité')}
          </div>
          ${rows([
            ['Prix de vente', money(r.vente.prixVente)],
            ['− Commission (taxes incluses)', '−' + money(r.vente.commissionTTC)],
            ['− Frais de vente', '−' + money(r.vente.frais)],
            ['− Pénalité', '−' + money(r.vente.penalite)],
            ['− Solde de l’hypothèque', '−' + money(r.vente.solde)],
            ['= Argent net de la vente', `<b>${money(r.vente.net)}</b>`, 'pp-total'],
            r.a.prixAchatCondo ? [`Résultat vs le prix payé (${money(r.a.prixAchatCondo)})`, `<b class="${r.vente.perteVsAchat < 0 ? 'pp-neg' : 'pp-pos'}">${signed(r.vente.perteVsAchat)}</b>`] : null,
          ])}
        </section>
        <section class="card"><div class="card-head"><h2>🏡 Achat de la maison</h2>${d.bien.lien ? `<a class="btn sm-text" href="${esc(d.bien.lien)}" target="_blank" rel="noopener">Annonce ↗</a>` : ''}</div>
          <div class="pp-fields">
            ${field('prix', 'Prix d’achat', { hint: 'Prix demandé dans l’annonce, ou ton offre' })}
            ${field('epargne', 'Épargne ajoutée à la mise de fonds')}
            ${field('taux', 'Taux hypothécaire', { suf: '%', hint: 'Taux de ta pré-approbation (terme fixe 5 ans, par exemple)' })}
            ${field('amort', 'Amortissement', { suf: 'ans' })}
            ${field('taxeBienvenue', 'Taxe de bienvenue', { ph: `auto ≈ ${Math.round(r.achat.taxeBienvenue)}`, hint: 'Vide = barème général du Québec. Vérifie le taux de la ville (certaines ont une tranche de plus).' })}
            ${field('notaire', 'Notaire')}
            ${field('inspection', 'Inspection')}
            ${field('demenagement', 'Déménagement')}
          </div>
          ${rows([
            ['Mise de fonds', `${money(r.achat.down)} (${pct(r.achat.downPct)})`],
            ['Minimum requis', money(r.achat.minDown)],
            r.achat.premium ? ['Prime SCHL (ajoutée au prêt)', money(r.achat.premium)] : ['Prime SCHL', 'aucune (20 % et plus)'],
            ['Taxe de bienvenue', money(r.achat.taxeBienvenue)],
            ['Prêt hypothécaire', `<b>${money(r.achat.loan)}</b>`],
            ['Paiement hypothécaire', `<b>${money(r.achat.payment, 2)}</b> / mois`, 'pp-total'],
          ])}
        </section>
      </div>
      <section class="card"><div class="card-head"><h2>Coût par mois (an 1)</h2><span class="muted">propriétaire de la maison</span></div>
        <div class="pp-fields pp-fields-inline">
          ${field('taxesMaison', 'Taxes municipales + scolaires', { suf: '$/an', hint: 'Voir l’annonce (taxes municipales et scolaires)' })}
          ${field('assurMaison', 'Assurance habitation', { suf: '$/mois' })}
          ${field('entretienMaison', 'Entretien et réparations', { suf: '%/an', hint: 'Règle courante : 1 % de la valeur par année' })}
          ${field('energie', 'Électricité et gaz', { suf: '$/mois', hint: 'Même montant dans les deux options (tu habites la maison)' })}
        </div>
        ${rows([
          ['Hypothèque', money(m.hypotheque)], ['Taxes', money(m.taxes)], ['Assurance', money(m.assurance)],
          ['Entretien', money(m.entretien)], ['Énergie', money(m.energie)],
          ['= Coût net par mois', `<b>${money(r.month1.out.achat)}</b>`, 'pp-total'],
        ])}
      </section>`;
    bindFields(body);
  }

  /* ---------- 🏠 Location ---------- */
  function drawLocation(r) {
    const col = (id) => {
      const m = r.month1.det[id];
      return rows([
        ['Loyer de la maison', money(m.loyer)], ['Assurance locataire', money(m.assurLocataire)], ['Énergie (maison)', money(m.energie)],
        ['Hypothèque du condo', money(m.hypothequeCondo)], ['Frais de condo', money(m.fraisCondo)], ['Taxes du condo', money(m.taxesCondo)],
        ['Assurance propriétaire bailleur', money(m.assurCondo)], ['Entretien du condo', money(m.entretienCondo)],
        id === 'chambres' ? ['Services inclus (électricité, Internet…)', money(m.services)] : null,
        m.gestion ? ['Gestion / ménage', money(m.gestion)] : null,
        ['− Revenus de location (après inoccupation)', `<span class="pp-pos">−${money(-m.revenu)}</span>`],
        [m.impot >= 0 ? 'Impôt sur le revenu de location' : 'Économie d’impôt (perte locative)', m.impot >= 0 ? money(m.impot) : `<span class="pp-pos">−${money(-m.impot)}</span>`],
        ['= Coût net par mois', `<b>${money(r.month1.out[id])}</b>`, 'pp-total'],
      ]);
    };
    body.innerHTML = `${warnBox(r)}
      <div class="pp-two">
        <section class="card"><div class="card-head"><h2>🏡 Louer la maison</h2></div>
          <div class="pp-fields">
            ${field('loyerMaison', 'Loyer demandé', { suf: '$/mois' })}
            ${field('assurLocataire', 'Assurance locataire', { suf: '$/mois' })}
            ${field('hausseLoyer', 'Hausse des loyers', { suf: '%/an', hint: 'S’applique au loyer de la maison et aux loyers que tu reçois' })}
          </div>
        </section>
        <section class="card"><div class="card-head"><h2>🏢 Le condo (gardé)</h2></div>
          <div class="pp-fields">
            ${field('prixAchatCondo', 'Prix payé', { hint: 'Sert au calcul du gain ou de la perte' })}
            ${field('anneeAchatCondo', 'Année d’achat', { suf: '' })}
            ${field('solde', 'Solde de l’hypothèque')}
            ${field('tauxCondo', 'Taux actuel', { suf: '%' })}
            ${field('moisTerme', 'Mois restants au terme', { suf: 'mois' })}
            ${field('paiementCondo', 'Paiement hypothécaire', { suf: '$/mois' })}
            ${field('tauxRenouv', 'Taux au renouvellement', { suf: '%' })}
            ${field('fraisCondo', 'Frais de condo', { suf: '$/mois' })}
            ${field('taxesCondo', 'Taxes municipales + scolaires', { suf: '$/an' })}
            ${field('assurCondo', 'Assurance actuelle', { suf: '$/mois' })}
            ${field('assurBailleurPlus', 'Hausse en assurance bailleur', { suf: '%', hint: 'Assurer un logement loué coûte souvent un peu plus' })}
            ${field('entretienCondo', 'Entretien', { suf: '%/an' })}
          </div>
        </section>
      </div>
      <div class="pp-two">
        <section class="card" style="--oc:#2563eb"><div class="card-head"><h2>🏠 Option bail complet</h2></div>
          <div class="pp-fields">
            ${field('loyerBail', 'Loyer du condo (5 ½)', { suf: '$/mois', hint: 'Estimation de départ à ajuster avec des annonces comparables' })}
            ${field('vacanceBail', 'Inoccupation', { suf: '%', hint: '2 % ≈ une semaine par année entre deux locataires' })}
            ${field('gestionBailPct', 'Gestion', { suf: '%', hint: '0 si tu gères toi-même' })}
          </div>
          ${col('bail')}
        </section>
        <section class="card" style="--oc:#16a34a"><div class="card-head"><h2>🛏 Option à la chambre</h2></div>
          <div class="pp-fields">
            ${field('nbChambres', 'Chambres louées', { suf: '' })}
            ${field('loyerChambre', 'Loyer par chambre', { suf: '$/mois', hint: 'Meublée, services inclus' })}
            ${field('vacanceChambres', 'Inoccupation', { suf: '%', hint: 'Plus de roulement qu’un bail complet' })}
            ${field('servicesChambres', 'Services inclus', { suf: '$/mois', hint: 'Électricité, Internet, produits communs' })}
            ${field('gestionChambres', 'Ménage / gestion', { suf: '$/mois' })}
            ${field('meubles', 'Meubles (au départ)')}
          </div>
          ${col('chambres')}
        </section>
      </div>
      <p class="hint muted">La location à la chambre doit être permise par la déclaration de copropriété : vérifie-la avant tout. L’impôt est calculé sur le revenu de location moins les intérêts et les dépenses (estimation).</p>`;
    bindFields(body);
  }

  /* ---------- ⚙ Hypothèses ---------- */
  function drawHyp() {
    body.innerHTML = `<div class="pp-two">
      <section class="card"><div class="card-head"><h2>📈 Marché et placements</h2></div>
        <div class="pp-fields">
          ${field('horizon', 'Horizon de comparaison', { suf: 'ans' })}
          ${field('apprMaison', 'Plus-value de la maison', { suf: '%/an' })}
          ${field('apprCondo', 'Plus-value du condo', { suf: '%/an' })}
          ${field('rendement', 'Rendement des placements', { suf: '%/an', hint: 'L’argent non dépensé est placé (CELI/REER)' })}
          ${field('inflation', 'Inflation des dépenses', { suf: '%/an', hint: 'Taxes, assurances, frais de condo, énergie' })}
        </div>
      </section>
      <section class="card"><div class="card-head"><h2>👥 Ménage et impôts</h2></div>
        <div class="pp-fields">
          ${field('tauxMarginal', 'Ton taux d’imposition marginal', { suf: '%', hint: 'Québec + fédéral, environ 37 % à 48 % selon ton revenu' })}
          ${field('partPct', 'Ta part des coûts de la maison', { suf: '%', hint: 'Le reste est payé par l’autre personne. Le condo et ses revenus restent à toi.' })}
          <label class="pp-field"><span class="pp-lbl">Nom de l’autre personne</span><span class="pp-in"><input type="text" id="pp-partnom" value="${esc(sc().a.partNom ?? DEFAULTS.partNom)}"></span></label>
          ${check('liquidation', 'Patrimoine « si tout était vendu » (frais de vente et impôt déduits)')}
          ${check('art452', 'Condo loué : garder le statut de résidence principale jusqu’à 4 ans (choix 45(2))', 'Possible quand tu n’as pas d’autre résidence principale — le cas si tu loues la maison. À confirmer avec un comptable.')}
        </div>
      </section></div>
      <p class="hint muted">Chaque scénario garde ses propres hypothèses. Crée « Prudent » et « Optimiste » avec ＋ pour voir l’écart.</p>`;
    bindFields(body);
    body.querySelector('#pp-partnom').onchange = async (e) => { sc().a.partNom = e.target.value.trim(); await save(); };
  }

  /* ---------- ✅ Étapes ---------- */
  function drawSteps() {
    const group = (path, label) => {
      const list = d.steps.filter((s) => s.path === path);
      const done = list.filter((s) => s.done).length;
      return `<section class="card"><div class="card-head"><h2>${label}</h2><span class="muted">${done}/${list.length}</span></div>
        <ul class="pp-steps">${list.map((s) => `<li class="${s.done ? 'done' : ''}" data-sid="${s.id}">
          <label><input type="checkbox" ${s.done ? 'checked' : ''}><span>${esc(s.title)}</span></label>
          ${s.taskId ? '<a class="chip ok" href="#/missions" title="Mission créée">✅ Mission</a>' : '<button type="button" class="btn sm-text" data-mission>➜ Mission</button>'}
          <button type="button" class="x" data-rm aria-label="Retirer l’étape">×</button></li>`).join('')}</ul>
        <form class="pp-add" data-path="${path}"><input name="t" placeholder="+ Ajouter une étape…" autocomplete="off"></form></section>`;
    };
    body.innerHTML = `<div class="pp-two">${group('achat', '🔑 Si j’achète')}${group('location', '🏠 Si je loue')}</div>${group('commun', '🧭 Dans les deux cas')}`;
    body.querySelectorAll('[data-sid]').forEach((li) => {
      const s = d.steps.find((x) => x.id === li.dataset.sid);
      li.querySelector('input').onchange = async (e) => { s.done = e.target.checked; await save(); drawSteps(); };
      li.querySelector('[data-rm]').onclick = async () => { d.steps = d.steps.filter((x) => x !== s); await save(); drawSteps(); };
      li.querySelector('[data-mission]')?.addEventListener('click', async () => {
        const t = await addTask(s.title, null);
        s.taskId = t.id;
        await save();
        toast(`✅ Mission ajoutée : « ${s.title} »`);
        drawSteps();
      });
    });
    body.querySelectorAll('.pp-add').forEach((f) => (f.onsubmit = async (e) => {
      e.preventDefault();
      const v = f.t.value.trim();
      if (!v) return;
      d.steps.push({ id: U.uid(), path: f.dataset.path, title: v, done: false });
      await save();
      drawSteps();
      body.querySelector(`.pp-add[data-path="${f.dataset.path}"] input`)?.focus();
    }));
  }

  /* ---------- 📎 Documents ---------- */
  async function drawDocs() {
    const metas = await docs.metas(d.docs);
    body.innerHTML = `<div class="pp-two">
      <section class="card"><div class="card-head"><h2>📎 Documents</h2><label class="btn primary"><input type="file" id="pp-file" accept="${docs.ACCEPT},image/*" multiple hidden>＋ Joindre</label></div>
        ${metas.length ? `<div class="pp-docs">${metas.map((m) => docs.chip(m, { remove: true })).join('')}</div>` : '<p class="empty-sm">Fiche du condo, offre d’achat, rapport d’inspection, bail, pré-approbation… Glisse-les ici.</p>'}
      </section>
      <section class="card"><div class="card-head"><h2>🔗 Liens</h2></div>
        <ul class="pp-links">${d.links.map((l, i) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.url)} ↗</a><button type="button" class="x" data-lrm="${i}" aria-label="Retirer le lien">×</button></li>`).join('')}</ul>
        <form class="pp-link-add"><input name="l" placeholder="Nom du lien" autocomplete="off"><input name="u" type="url" placeholder="https://…" required><button class="btn">Ajouter</button></form>
      </section></div>`;
    const add = async (files) => {
      for (const f of files) { try { const m = await docs.save(f); d.docs.push(m.id); } catch (err) { toast(err.message, 'err'); } }
      await save(); drawDocs();
    };
    body.querySelector('#pp-file').onchange = (e) => add([...e.target.files]);
    body.ondragover = (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); };
    body.ondrop = (e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); add([...e.dataTransfer.files]); } };
    body.querySelectorAll('[data-doc-rm]').forEach((b) => (b.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!(await confirmBox('Retirer ce document du projet ?', 'Retirer'))) return;
      d.docs = d.docs.filter((x) => x !== b.dataset.docRm);
      await save();
      await docs.removeUnused([b.dataset.docRm]);
      drawDocs();
    }));
    body.querySelectorAll('[data-lrm]').forEach((b) => (b.onclick = async () => { d.links.splice(Number(b.dataset.lrm), 1); await save(); drawDocs(); }));
    body.querySelector('.pp-link-add').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      d.links.push({ label: f.l.value.trim() || f.u.value, url: f.u.value.trim() });
      await save(); drawDocs();
    };
  }

  /* ---------- 📝 Notes et décision ---------- */
  function drawNotes() {
    const list = (arr, key, sub, placeholder) => `<ul class="pp-list">${arr.map((t, i) => `<li><span>${esc(t)}</span><button type="button" class="x" data-del="${key}|${sub}|${i}" aria-label="Retirer">×</button></li>`).join('')}</ul>
      <form class="pp-list-add" data-add="${key}|${sub}"><input name="t" placeholder="${placeholder}" autocomplete="off"></form>`;
    body.innerHTML = `<section class="card pp-decision"><div class="card-head"><h2>🧭 Décision</h2></div>
        <div class="seg pp-dec">${[['', 'Pas encore décidé'], ['achat', '🔑 Acheter'], ['bail', '🏠 Louer · bail'], ['chambres', '🛏 Louer · chambres']].map(([k, l]) => `<button type="button" data-dec="${k}" class="${d.decision === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${d.decision ? `<p class="muted">Décidé le ${esc(U.fmtShort(new Date(d.decidedAt || Date.now())))}</p>` : ''}</section>
      <div class="pp-two">
        <section class="card"><div class="card-head"><h2>🔑 Acheter</h2></div><h3 class="pp-h3 pos">👍 Pour</h3>${list(d.pros.achat, 'pros', 'achat', '+ Un avantage…')}<h3 class="pp-h3 neg">👎 Contre</h3>${list(d.cons.achat, 'cons', 'achat', '+ Un inconvénient…')}</section>
        <section class="card"><div class="card-head"><h2>🏠 Louer</h2></div><h3 class="pp-h3 pos">👍 Pour</h3>${list(d.pros.location, 'pros', 'location', '+ Un avantage…')}<h3 class="pp-h3 neg">👎 Contre</h3>${list(d.cons.location, 'cons', 'location', '+ Un inconvénient…')}</section>
      </div>
      <div class="pp-two">
        <section class="card"><div class="card-head"><h2>❓ Questions</h2><span class="muted">courtier, prêteur, notaire, vendeur</span></div>${list(d.questions, 'questions', '', '+ Une question à poser…')}</section>
        <section class="card"><div class="card-head"><h2>📓 Journal</h2></div>
          <form class="pp-journal-add"><textarea name="t" rows="2" placeholder="Ce qui a changé, une visite, un appel, une réflexion…"></textarea><button class="btn">Ajouter</button></form>
          <ul class="pp-journal">${[...d.journal].reverse().map((j) => `<li><small class="muted">${esc(U.fmtShort(new Date(j.at)))}</small><p>${esc(j.text)}</p></li>`).join('') || '<li class="empty-sm">Aucune entrée.</li>'}</ul></section>
      </div>`;
    const target = (key, sub) => (sub ? d[key][sub] : d[key]);
    body.querySelectorAll('[data-dec]').forEach((b) => (b.onclick = async () => {
      d.decision = b.dataset.dec; d.decidedAt = Date.now();
      if (d.decision) d.journal.push({ at: Date.now(), text: `Décision : ${b.textContent.trim()}` });
      await save(); drawNotes();
    }));
    body.querySelectorAll('[data-add]').forEach((f) => (f.onsubmit = async (e) => {
      e.preventDefault();
      const v = f.t.value.trim();
      if (!v) return;
      const [key, sub] = f.dataset.add.split('|');
      target(key, sub).push(v);
      await save(); drawNotes();
      body.querySelector(`[data-add="${f.dataset.add}"] input`)?.focus();
    }));
    body.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      const [key, sub, i] = b.dataset.del.split('|');
      target(key, sub).splice(Number(i), 1);
      await save(); drawNotes();
    }));
    body.querySelector('.pp-journal-add').onsubmit = async (e) => {
      e.preventDefault();
      const v = e.target.t.value.trim();
      if (!v) return;
      d.journal.push({ at: Date.now(), text: v });
      await save(); drawNotes();
    };
  }

  /* ---------- Scénarios ---------- */
  function newScenario() {
    modal(`<h2>Nouveau scénario</h2>
      <label class="pp-field"><span class="pp-lbl">Nom</span><span class="pp-in"><input id="pp-sn" value="Prudent" autofocus></span></label>
      <div class="pp-presets">${[['copy', '📋 Copie du scénario actuel', 'Mêmes chiffres, à modifier'], ['prudent', '🛡 Prudent', 'Taux +1 %, plus-value 1,5 %, loyers reçus −10 %, rendement 4 %'], ['optimiste', '🚀 Optimiste', 'Taux −0,5 %, plus-value 4 %, loyers reçus +5 %, rendement 6 %']]
        .map(([k, l, h], i) => `<label class="pp-preset"><input type="radio" name="pp-base" value="${k}" ${i === 1 ? 'checked' : ''}><span><b>${l}</b><small>${h}</small></span></label>`).join('')}</div>
      <div class="modal-actions"><button class="btn" data-close>Annuler</button><button class="btn primary" id="pp-sok">Créer</button></div>`, (m, close) => {
      m.querySelectorAll('[name="pp-base"]').forEach((r) => (r.onchange = () => { m.querySelector('#pp-sn').value = { copy: `${sc().name} (copie)`, prudent: 'Prudent', optimiste: 'Optimiste' }[r.value]; }));
      m.querySelector('#pp-sok').onclick = async () => {
        const base = m.querySelector('[name="pp-base"]:checked').value;
        const a = { ...sc().a }, cur = A();
        if (base === 'prudent') Object.assign(a, { taux: cur.taux + 1, tauxRenouv: cur.tauxRenouv + 1, apprMaison: 1.5, apprCondo: 1.5, rendement: 4, loyerBail: Math.round(cur.loyerBail * 0.9), loyerChambre: Math.round(cur.loyerChambre * 0.9), vacanceChambres: 12 });
        if (base === 'optimiste') Object.assign(a, { taux: cur.taux - 0.5, tauxRenouv: cur.tauxRenouv - 0.5, apprMaison: 4, apprCondo: 3.5, rendement: 6, loyerBail: Math.round(cur.loyerBail * 1.05), loyerChambre: Math.round(cur.loyerChambre * 1.05) });
        const id = U.uid();
        d.scenarios[id] = { name: m.querySelector('#pp-sn').value.trim() || 'Scénario', a };
        d.cur = id;
        await save(); close(); renderPage(ctx);
        toast('📊 Scénario créé');
      };
    });
  }

  function scenarioMenu() {
    modal(`<h2>Scénario « ${esc(sc().name)} »</h2>
      <div class="pp-menu">
        <button class="btn" id="pp-ren">✎ Renommer</button>
        <label class="btn"><input type="file" id="pp-imp" accept=".json,application/json" hidden>⬆ Importer des chiffres (.json)</label>
        <button class="btn" id="pp-exp">⬇ Exporter ce scénario (.json)</button>
        <button class="btn danger" id="pp-del" ${Object.keys(d.scenarios).length < 2 ? 'disabled title="Il faut garder au moins un scénario"' : ''}>🗑 Supprimer</button>
      </div>
      <div class="modal-actions"><button class="btn" data-close>Fermer</button></div>`, (m, close) => {
      m.querySelector('#pp-ren').onclick = async () => {
        const v = prompt('Nom du scénario', sc().name);
        if (v && v.trim()) { sc().name = v.trim(); await save(); close(); renderPage(ctx); }
      };
      m.querySelector('#pp-del').onclick = async () => {
        if (!(await confirmBox(`Supprimer le scénario « ${sc().name} » ?`, 'Supprimer'))) return;
        delete d.scenarios[d.cur];
        d.cur = Object.keys(d.scenarios)[0];
        await save(); renderPage(ctx);
      };
      m.querySelector('#pp-exp').onclick = () => {
        const blob = new Blob([JSON.stringify({ app: 'Life Planner', propriete: sc().a }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = Object.assign(document.createElement('a'), { href: url, download: `projet-propriete-${sc().name.toLowerCase().replace(/\s+/g, '-')}.json` });
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      };
      m.querySelector('#pp-imp').onchange = async (e) => {
        try {
          const j = JSON.parse(await e.target.files[0].text());
          const src = j.propriete || j;
          let k = 0;
          for (const key of Object.keys(DEFAULTS)) if (key in src) { sc().a[key] = src[key]; k++; }
          // Adresse et annonce de la maison visée : gardées dans tes données, jamais dans le code
          if (src.adresse || src.lien) {
            d.bien = { ...d.bien, ...(src.adresse ? { adresse: src.adresse } : {}), ...(src.lien ? { lien: src.lien } : {}) };
            if (src.lien && !d.links.some((l) => l.url === src.lien)) d.links.unshift({ label: `Annonce de la maison${src.adresse ? ` (${src.adresse})` : ''}`, url: src.lien });
            k++;
          }
          if (!k) throw new Error('Aucun chiffre reconnu dans ce fichier');
          await save(); close(); renderPage(ctx);
          toast(`⬆ ${k} chiffre${k > 1 ? 's' : ''} importé${k > 1 ? 's' : ''} dans « ${sc().name} »`);
        } catch (err) { toast('Import impossible : ' + err.message, 'err'); }
      };
    });
  }

  draw();
}
