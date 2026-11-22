// 🏡 Projet Propriété — moteur de calcul (aucune donnée personnelle ici : tout vient des hypothèses enregistrées).
//
// Trois options comparées mois par mois sur l'horizon choisi :
//   achat    : vendre le condo, acheter la maison
//   bail     : garder le condo loué à un seul locataire, louer la maison
//   chambres : garder le condo loué à la chambre, louer la maison
// Pour être juste, l'option qui coûte le moins chaque mois place la différence (rendement réglable) :
// le patrimoine compare donc des situations où le même argent sort de tes poches.
// Estimations seulement : à valider avec un courtier hypothécaire, un notaire et un comptable.

export const OPTIONS = [
  { id: 'achat', icon: '🔑', name: 'Acheter la maison', short: 'Achat', color: '#c2410c' },
  { id: 'bail', icon: '🏠', name: 'Louer la maison · condo en bail', short: 'Location · bail', color: '#2563eb' },
  { id: 'chambres', icon: '🛏', name: 'Louer la maison · condo à la chambre', short: 'Location · chambres', color: '#16a34a' },
];

const TPS_TVQ = 0.14975; // taxes sur la commission du courtier
const SCHL_TVQ = 0.09; // taxe provinciale sur la prime SCHL (payée comptant chez le notaire)
// Droits de mutation (« taxe de bienvenue ») — barème général du Québec 2025, à vérifier (indexé chaque année ; certaines villes ont une tranche de plus)
const MUTATION = [[61500, 0.005], [307800, 0.01], [Infinity, 0.015]];

/** Taux mensuel effectif d'un taux annuel composé semestriellement (règle canadienne). */
export const monthlyRate = (annualPct) => Math.pow(1 + annualPct / 200, 1 / 6) - 1;
/** Paiement mensuel d'un prêt. */
export function payment(principal, annualPct, months) {
  if (principal <= 0 || months <= 0) return 0;
  const i = monthlyRate(annualPct);
  return i ? (principal * i) / (1 - Math.pow(1 + i, -months)) : principal / months;
}
/** Mois restants d'amortissement d'après le solde, le taux et le paiement actuels. */
export function remainingMonths(balance, annualPct, pay) {
  const i = monthlyRate(annualPct);
  if (balance <= 0) return 0;
  if (!i) return balance / pay;
  const x = 1 - (i * balance) / pay;
  return x > 0 ? -Math.log(x) / Math.log(1 + i) : 600;
}
export function welcomeTax(price) {
  let tax = 0, prev = 0;
  for (const [cap, rate] of MUTATION) {
    if (price > prev) tax += (Math.min(price, cap) - prev) * rate;
    prev = cap;
  }
  return tax;
}
/** Mise de fonds minimale au Canada : 5 % des premiers 500 000 $, 10 % du reste (20 % au-delà de 1,5 M$). */
export const minDown = (price) => (price >= 1_500_000 ? price * 0.2 : Math.min(price, 500000) * 0.05 + Math.max(0, price - 500000) * 0.1);
/** Prime SCHL selon la mise de fonds (en % du prêt). */
export function schlRate(downPct) {
  if (downPct >= 20) return 0;
  if (downPct >= 15) return 0.028;
  if (downPct >= 10) return 0.031;
  return 0.04;
}

const n = (v, d = 0) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);

/** Hypothèses par défaut : seulement des estimations générales du marché. Les chiffres du projet (maison visée,
 *  condo) ne sont jamais dans le code : ils s'entrent dans la page ou s'importent d'un fichier .json privé. */
export const DEFAULTS = {
  // Général
  horizon: 5, apprMaison: 3, apprCondo: 2.5, rendement: 5, hausseLoyer: 3, inflation: 2.5, tauxMarginal: 37,
  partPct: 50, partNom: 'Conjoint·e', monNom: 'Moi', partMode: 'pct', partMontant: '', liquidation: true,
  condoProprio: 'part', // à qui appartient le condo : 'moi' ou 'part' (l'autre personne)
  // Maison visée (à remplir)
  prix: '', taxesMaison: '', assurMaison: 150, entretienMaison: 1, energie: 230,
  notaire: 2000, inspection: 800, demenagement: 2500, taxeBienvenue: '', epargne: 0, taux: 4.29, amort: 25,
  // Vente du condo
  prixVente: '', commissionPct: 5, fraisVente: 1500, penalite: '', transfert: false,
  // Condo (à remplir : fiche du condo)
  prixAchatCondo: '', anneeAchatCondo: 2025, solde: '', tauxCondo: '', moisTerme: 24, paiementCondo: '', tauxRenouv: 4.5,
  fraisCondo: '', taxesCondo: '', assurCondo: '', assurBailleurPlus: 20, entretienCondo: 0.5, art452: true,
  // Location de la maison
  loyerMaison: '', assurLocataire: 25,
  // Condo en bail complet (estimation à ajuster)
  loyerBail: 2150, vacanceBail: 2, gestionBailPct: 0,
  // Condo à la chambre (estimation à ajuster)
  nbChambres: 3, loyerChambre: 825, vacanceChambres: 8, servicesChambres: 220, meubles: 4500, gestionChambres: 60,
};

/** Calcule les trois options. Renvoie le détail au départ, le mois 1 et la projection année par année. */
export function compute(input) {
  const a = { ...DEFAULTS, ...input };
  const N = Math.max(1, Math.min(25, Math.round(n(a.horizon, 5))));
  const months = N * 12;
  const infl = n(a.inflation) / 100, ret = Math.pow(1 + n(a.rendement) / 100, 1 / 12) - 1; // rendement mensuel des placements (supposés à l'abri de l'impôt : CELI, REER)
  const mt = n(a.tauxMarginal) / 100;
  const warnings = [];

  /* ---------- Vente du condo (option achat) ---------- */
  const solde = n(a.solde), tauxCondo = n(a.tauxCondo);
  const commission = n(a.prixVente) * n(a.commissionPct) / 100;
  const commissionTTC = commission * (1 + TPS_TVQ);
  const penalAuto = a.transfert ? 0 : solde * tauxCondo / 100 / 4; // 3 mois d'intérêt (souvent le minimum ; le DTI peut être plus élevé)
  const penalite = a.transfert ? 0 : (a.penalite === '' || a.penalite == null ? penalAuto : n(a.penalite));
  const netCondo = n(a.prixVente) - commissionTTC - n(a.fraisVente) - solde - penalite;
  const perteVsAchat = n(a.prixVente) - commissionTTC - n(a.fraisVente) - penalite - n(a.prixAchatCondo);

  /* ---------- Achat de la maison ---------- */
  const prix = n(a.prix);
  const tb = a.taxeBienvenue === '' || a.taxeBienvenue == null ? welcomeTax(prix) : n(a.taxeBienvenue);
  const closing = tb + n(a.notaire) + n(a.inspection) + n(a.demenagement);
  const cash0 = netCondo + n(a.epargne);
  let down = Math.max(0, cash0 - closing), premium = 0, premiumTax = 0;
  for (let k = 0; k < 3; k++) { // la taxe sur la prime SCHL se paie comptant : petite boucle pour l'équilibre
    const dp = Math.min(down, prix);
    const r = schlRate((dp / prix) * 100);
    premium = (prix - dp) * r;
    premiumTax = premium * SCHL_TVQ;
    down = Math.max(0, cash0 - closing - premiumTax);
  }
  const dp = Math.min(down, prix);
  const leftoverAchat = Math.max(0, down - prix);
  const loan = Math.max(0, prix - dp + premium);
  const amortM = Math.round(n(a.amort, 25) * 12);
  const payMaison = payment(loan, n(a.taux), amortM);
  const downPct = prix ? (dp / prix) * 100 : 0;
  if (dp < minDown(prix)) warnings.push(`Mise de fonds de ${Math.round(downPct * 10) / 10} % : sous le minimum requis (${fmt(minDown(prix))}). Ajoute de l'épargne ou vise un prix plus bas.`);
  if (premium && n(a.amort) > 25) warnings.push('Avec l’assurance SCHL (mise de fonds sous 20 %), l’amortissement maximal est de 25 ans (30 ans seulement pour un premier achat ou une construction neuve).');
  if (!prix || !n(a.loyerMaison)) warnings.push('Infos de la maison incomplètes : entre son prix (onglet 🔑 Achat) et le loyer demandé (onglet 🏠 Location), ou importe ton fichier (⋯ › Importer).');
  if (!solde || !n(a.paiementCondo)) warnings.push('Infos du condo incomplètes : remplis le solde, le taux et le paiement hypothécaire (onglet 🏠 Location) ou importe ton fichier.');

  /* ---------- Condo gardé (options location) ---------- */
  const payCondo0 = n(a.paiementCondo);
  const remain0 = payCondo0 ? remainingMonths(solde, tauxCondo, payCondo0) : 0;

  // Simulation mois par mois
  const st = {
    achat: { bal: loan, inv: leftoverAchat, cum: 0 },
    bail: { bal: solde, inv: n(a.epargne), cum: 0, pay: payCondo0, rate: tauxCondo, profit: 0, cash: 0, capital: 0 },
    chambres: { bal: solde, inv: n(a.epargne) - n(a.meubles), cum: 0, pay: payCondo0, rate: tauxCondo, profit: 0, cash: 0, capital: 0 },
  };
  // Départ des options location : déménagement payé aussi
  st.bail.inv -= n(a.demenagement); st.chambres.inv -= n(a.demenagement);
  const years = [];
  let month1 = null;
  const houseV = (m) => prix * Math.pow(1 + n(a.apprMaison) / 100, m / 12);
  const condoV = (m) => n(a.prixVente) * Math.pow(1 + n(a.apprCondo) / 100, m / 12);

  for (let m = 1; m <= months; m++) {
    const y = Math.floor((m - 1) / 12); // année 0, 1, 2…
    const g = Math.pow(1 + infl, y), gl = Math.pow(1 + n(a.hausseLoyer) / 100, y);
    const out = {}, det = {}, loc = {};

    // Achat
    {
      const s = st.achat, i = monthlyRate(n(a.taux));
      const interest = s.bal * i, princ = Math.min(s.bal, Math.max(0, payMaison - interest));
      s.bal -= princ;
      const d = { hypotheque: s.bal + princ > 0 ? payMaison : 0, taxes: n(a.taxesMaison) / 12 * g, assurance: n(a.assurMaison) * g, entretien: houseV(m) * n(a.entretienMaison) / 100 / 12, energie: n(a.energie) * g };
      det.achat = d; out.achat = sum(d);
    }
    // Location (bail et chambres) : la maison louée + le condo loué
    for (const id of ['bail', 'chambres']) {
      const s = st[id];
      if (m === n(a.moisTerme) + 1 && s.bal > 0 && payCondo0) { // renouvellement du terme du condo
        const rem = Math.max(12, remain0 - n(a.moisTerme));
        s.rate = n(a.tauxRenouv, tauxCondo);
        s.pay = payment(s.bal, s.rate, rem);
      }
      const i = monthlyRate(s.rate);
      const interest = s.bal * i, princ = s.bal > 0 ? Math.min(s.bal, Math.max(0, s.pay - interest)) : 0;
      s.bal -= princ;
      const chambres = id === 'chambres';
      const revenu = chambres
        ? n(a.nbChambres) * n(a.loyerChambre) * gl * (1 - n(a.vacanceChambres) / 100)
        : n(a.loyerBail) * gl * (1 - n(a.vacanceBail) / 100);
      const frais = n(a.fraisCondo) * g, taxes = n(a.taxesCondo) / 12 * g;
      const assur = n(a.assurCondo) * (1 + n(a.assurBailleurPlus) / 100) * g;
      const entretien = condoV(m) * n(a.entretienCondo) / 100 / 12;
      const services = chambres ? n(a.servicesChambres) * g : 0;
      const gestion = chambres ? n(a.gestionChambres) * g : revenu * n(a.gestionBailPct) / 100;
      const netLoc = revenu - interest - frais - taxes - assur - entretien - services - gestion;
      const impot = netLoc * mt; // négatif = économie d'impôt (perte locative)
      const d = {
        loyer: n(a.loyerMaison) * gl, assurLocataire: n(a.assurLocataire) * g, energie: n(a.energie) * g,
        hypothequeCondo: s.bal + princ > 0 ? s.pay : 0, fraisCondo: frais, taxesCondo: taxes, assurCondo: assur, entretienCondo: entretien,
        services, gestion, revenu: -revenu, impot,
      };
      // Profits du condo loué (pour sa propriétaire) : revenu imposable, impôt, liquidités après le paiement complet
      const depenses = frais + taxes + assur + entretien + services + gestion;
      loc[id] = { revenu, interet: interest, capital: princ, depenses, netLoc, impot, apresImpot: netLoc - impot, cash: revenu - depenses - (s.bal + princ > 0 ? s.pay : 0) - impot };
      s.profit += netLoc - impot; s.cash += loc[id].cash; s.capital += princ;
      det[id] = d; out[id] = sum(d);
    }
    if (m === 1) month1 = { out: { ...out }, det: JSON.parse(JSON.stringify(det)), loc: JSON.parse(JSON.stringify(loc)) };

    // Le même argent sort de tes poches : la différence est placée dans l'option la moins chère
    const max = Math.max(...Object.values(out));
    for (const id of Object.keys(st)) {
      const s = st[id];
      s.inv = s.inv * (1 + ret) + (max - out[id]);
      s.cum += out[id];
    }

    if (m % 12 === 0) years.push(snapshot(m, y + 1));
  }

  function snapshot(m, yr) {
    const res = { year: yr };
    const saleCost = (v) => (a.liquidation ? v * n(a.commissionPct) / 100 * (1 + TPS_TVQ) + n(a.fraisVente) : 0);
    // Achat : maison (résidence principale : pas d'impôt sur le gain)
    const hv = houseV(m);
    res.achat = { valeur: hv, solde: st.achat.bal, equite: hv - st.achat.bal - saleCost(hv), placements: st.achat.inv, cumul: st.achat.cum };
    res.achat.patrimoine = res.achat.equite + res.achat.placements;
    // Location : condo (gain en capital imposable, sauf la part couverte par la résidence principale)
    const cv = condoV(m);
    const yearsOwned = Math.max(1, (new Date().getFullYear() - n(a.anneeAchatCondo, new Date().getFullYear())) + yr);
    const designated = (new Date().getFullYear() - n(a.anneeAchatCondo, new Date().getFullYear())) + (a.art452 ? Math.min(yr, 4) : 0);
    const exempt = Math.min(1, (1 + designated) / yearsOwned);
    const gain = Math.max(0, cv - saleCost(cv) - n(a.prixAchatCondo, n(a.prixVente)));
    const impotGain = a.liquidation ? gain * (1 - exempt) * 0.5 * mt : 0;
    for (const id of ['bail', 'chambres']) {
      const s = st[id];
      res[id] = { valeur: cv, solde: s.bal, impotGain, equite: cv - s.bal - saleCost(cv) - impotGain, placements: s.inv, cumul: s.cum, profit: s.profit, cash: s.cash, capital: s.capital };
      res[id].patrimoine = res[id].equite + res[id].placements;
    }
    return res;
  }

  // Patrimoine de départ (mois 0) pour le graphique
  const condoEq0 = n(a.prixVente) - solde - (a.liquidation ? commissionTTC + n(a.fraisVente) : 0);
  const start = {
    achat: prix - loan - (a.liquidation ? prix * n(a.commissionPct) / 100 * (1 + TPS_TVQ) + n(a.fraisVente) : 0) + leftoverAchat,
    bail: condoEq0 + n(a.epargne) - n(a.demenagement),
    chambres: condoEq0 + n(a.epargne) - n(a.demenagement) - n(a.meubles),
  };

  const last = years[years.length - 1];
  const best = OPTIONS.map((o) => o.id).sort((x, y) => last[y].patrimoine - last[x].patrimoine)[0];
  // Point de bascule : première année où l'option gagnante à l'horizon passe devant pour de bon
  let bascule = null;
  for (let k = years.length - 1; k >= 0; k--) {
    const yr = years[k];
    const isBest = OPTIONS.every((o) => yr[best].patrimoine >= yr[o.id].patrimoine);
    if (!isBest) break;
    bascule = yr.year;
  }

  return {
    a, N, warnings, best, bascule, years, start, month1,
    vente: { prixVente: n(a.prixVente), commission, commissionTTC, frais: n(a.fraisVente), solde, penalite, penalAuto, net: netCondo, perteVsAchat },
    achat: { prix, taxeBienvenue: tb, closing, cash0, down: dp, downPct, premium, premiumTax, loan, payment: payMaison, leftover: leftoverAchat, minDown: minDown(prix) },
    condo: { payment: payCondo0, remainMonths: remain0 },
  };
}

const sum = (d) => Object.values(d).reduce((s, v) => s + v, 0);
const fmt = (v) => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v);
