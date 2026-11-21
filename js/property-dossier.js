// 🗂 Dossier de location (sous-page du Projet Propriété) : se préparer à louer à deux quand un des deux a un crédit plus faible.
// Trois étapes : 1. rassembler les preuves, 2. lettre de présentation, 3. caution.
// Données : d.dossier dans le réglage « propriete » (tes appareils et ta synchro Drive privée). Le code ne contient que des modèles.
import * as U from './util.js';
import * as docs from './docs.js';

const { esc } = U;
const money = (v) => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(Number(v) || 0);

// Étape 1 : les preuves, de la plus convaincante à la plus simple
export const PROOFS = [
  { id: 'hypo', title: 'Historique de paiements de l’hypothèque du condo', why: 'Ta meilleure preuve : un paiement de logement fait chaque mois, sans retard. Demande à ton prêteur un relevé des 12 derniers mois (ou le relevé annuel).' },
  { id: 'paie', title: 'Talons de paie récents (2 ou 3)', why: 'Pour vous deux. Montre un revenu stable et récent.' },
  { id: 'emploi', title: 'Lettre d’emploi', why: 'Poste, salaire, date d’embauche, permanent ou non. Signée par l’employeur, datée de moins d’un mois.' },
  { id: 'avis', title: 'Avis de cotisation de la dernière année', why: 'Revenu Québec ou l’ARC : confirme le revenu annuel. Utile surtout si une partie du revenu est variable.' },
  { id: 'epargne', title: 'Relevé d’épargne ou de placements', why: 'Un coussin de quelques mois de loyer rassure beaucoup. Tu peux cacher les numéros de compte.' },
  { id: 'bailcondo', title: 'Bail du condo (si tu le loues)', why: 'Montre un revenu de location en plus. À joindre dès que ton locataire a signé.' },
  { id: 'credit', title: 'Ton propre rapport de crédit', why: 'Gratuit chez Equifax et TransUnion. Le connaître évite les surprises et t’aide à expliquer ta situation.' },
  { id: 'refs', title: 'Références', why: 'Un employeur, et le syndicat de copropriété ou un ancien locateur qui peut confirmer que tu paies bien.' },
  { id: 'assur', title: 'Soumission d’assurance locataire', why: 'Responsabilité civile de 2 M$ : souvent exigée à la signature.' },
];

export function letterText(d, A) {
  const s = d.dossier;
  const me = s.monNom || '[Ton nom]', her = s.sonNom || A.partNom || '[Nom de ta conjointe]';
  const adr = d.bien?.adresse || '[adresse de la maison]';
  const loyer = Number(A.loyerMaison) || 0;
  const revenu = Number(s.revenu) || 0;
  const ratio = revenu ? Math.round((loyer / revenu) * 100) : null;
  const pay = Number(A.paiementCondo) || 0;
  return `Bonjour ${s.proprio || '[nom du propriétaire]'},

Nous sommes très intéressés à louer votre maison du ${adr}${s.debut ? ` à partir du ${s.debut}` : ''}. Voici notre situation, en toute transparence.

Nous serons deux locataires et signerons le bail solidairement : chacun de nous sera responsable du loyer complet${loyer ? ` de ${money(loyer)} par mois` : ''}.

${her} a un bon dossier de crédit. Pour ma part, mon pointage de crédit est plus faible ${s.raison ? `(${s.raison})` : '[explique en une phrase pourquoi, par exemple une ancienne dette maintenant réglée]'}. Je préfère vous le dire d’emblée plutôt que vous le découvriez à l’enquête.

En revanche, je suis propriétaire d’un condo depuis ${A.anneeAchatCondo || '[année]'} et je paie mon hypothèque${pay ? ` de ${money(pay)}` : ''} chaque mois, sans aucun retard. Je peux vous fournir l’historique de paiements de mon prêteur.${s.condoLoue ? ' Le condo sera loué, ce qui ajoute un revenu stable à notre budget.' : ''}

${revenu ? `Nos revenus nets combinés sont d’environ ${money(revenu)} par mois : le loyer en représenterait ${ratio} %.` : 'Nos revenus nets combinés sont d’environ [montant] par mois.'} Nous joignons nos talons de paie, nos lettres d’emploi${s.epargne ? ' et un relevé d’épargne' : ''}.

${s.cautionNom ? `Si vous le souhaitez, ${s.cautionNom}${s.cautionLien ? ` (${s.cautionLien})` : ''} est prêt·e à se porter caution du bail.` : 'Si vous le souhaitez, nous pouvons aussi ajouter une caution au bail.'}

Nous serions heureux d’en discuter et de revisiter la maison. Merci de votre considération,

${me} et ${her}${s.contact ? `\n${s.contact}` : ''}`;
}

export async function drawDossier(body, ctx, d, A, save) {
  const { toast, confirmBox } = ctx;
  d.dossier ||= {};
  const s = d.dossier;
  s.proofs ||= {};
  s.caution ||= { statut: '' };
  const done = PROOFS.filter((p) => s.proofs[p.id]?.done).length;
  const allDocs = PROOFS.flatMap((p) => s.proofs[p.id]?.docs || []);
  const metas = Object.fromEntries((await docs.metas(allDocs)).map((m) => [m.id, m]));
  const loyer = Number(A.loyerMaison) || 0, revenu = Number(s.revenu) || 0;
  const ratio = revenu ? Math.round((loyer / revenu) * 100) : null;
  const inp = (k, label, ph = '', type = 'text') => `<label class="pp-field"><span class="pp-lbl">${label}</span><span class="pp-in"><input type="${type}" data-s="${k}" value="${esc(s[k] ?? '')}" placeholder="${esc(ph)}"${type === 'number' ? ' inputmode="decimal"' : ''}></span></label>`;
  const STATUTS = [['', 'Pas encore demandé'], ['demande', 'Demandé'], ['ok', 'D’accord'], ['signe', 'A signé']];

  body.innerHTML = `
    <section class="card pp-strat"><div class="card-head"><h2>🧭 La stratégie</h2></div>
      <ol>
        <li><b>Signer tous les deux, solidairement</b> : chacun répond du loyer complet. Le bon crédit de ${esc(s.sonNom || 'ta conjointe')} couvre alors 100 % du loyer, ce qui rassure le propriétaire.</li>
        <li><b>Jouer la transparence</b> : expliquer ta situation avant l’enquête de crédit (lettre ci-dessous), jamais de fausse déclaration.</li>
        <li><b>Compenser avec des preuves</b> : surtout ton historique de paiements hypothécaires.</li>
        <li><b>Si le propriétaire hésite</b> : proposer une caution, plutôt que de laisser ton nom hors du bail.</li>
      </ol>
      <p class="muted small">À éviter : payer plus que le premier mois d’avance (il ne peut pas l’exiger), et faire signer ${esc(s.sonNom || 'ta conjointe')} seule si tu veux rester dans la maison à long terme ou l’acheter plus tard. Repères généraux au Québec, pas un avis juridique.</p>
    </section>

    <section class="card"><div class="card-head"><h2>1 · Rassembler les preuves</h2><span class="muted">${done}/${PROOFS.length}</span></div>
      <ul class="pd-proofs">${PROOFS.map((p) => {
        const st = s.proofs[p.id] || {};
        return `<li class="${st.done ? 'done' : ''}" data-p="${p.id}">
          <label class="pd-top"><input type="checkbox" ${st.done ? 'checked' : ''}><b>${esc(p.title)}</b></label>
          <p class="muted small">${esc(p.why)}</p>
          <div class="pd-files">${(st.docs || []).map((id) => (metas[id] ? docs.chip(metas[id], { remove: true }) : '')).join('')}
            <label class="btn sm-text"><input type="file" hidden multiple accept="${docs.ACCEPT},image/*" data-up="${p.id}">📎 Joindre</label></div>
        </li>`;
      }).join('')}</ul>
    </section>

    <section class="card"><div class="card-head"><h2>2 · Lettre de présentation</h2><span class="muted">à joindre à la promesse de location</span></div>
      <div class="pp-fields">
        ${inp('monNom', 'Ton nom')}
        ${inp('sonNom', 'Nom de ta conjointe')}
        ${inp('proprio', 'Nom du propriétaire', 'si tu le connais')}
        ${inp('debut', 'Date d’arrivée souhaitée', 'ex. 1er janvier 2027')}
        ${inp('revenu', 'Revenus nets combinés ($/mois)', '', 'number')}
        ${inp('raison', 'Pourquoi ton crédit est plus faible', 'en quelques mots, ex. une carte de crédit remboursée en 2025')}
        ${inp('contact', 'Téléphone et courriel')}
        <label class="pp-check"><input type="checkbox" data-s="condoLoue" ${s.condoLoue ? 'checked' : ''}> <span>Le condo sera loué (revenu en plus)</span></label>
        <label class="pp-check"><input type="checkbox" data-s="epargne" ${s.epargne ? 'checked' : ''}> <span>Joindre un relevé d’épargne</span></label>
      </div>
      ${ratio ? `<p class="pd-ratio ${ratio > 40 ? 'bad' : ratio > 33 ? 'warn' : 'ok'}">Le loyer représenterait <b>${ratio} %</b> de vos revenus nets. ${ratio > 40 ? 'Au-delà de 40 % : un propriétaire risque d’hésiter, la caution devient utile.' : ratio > 33 ? 'Entre 33 et 40 % : acceptable, tes preuves feront la différence.' : 'Sous 33 % : un bon point pour votre dossier.'}</p>` : ''}
      <textarea class="pd-letter" rows="18" aria-label="Lettre de présentation">${esc(s.lettre || letterText(d, A))}</textarea>
      <div class="pd-acts"><button class="btn" id="pd-regen" title="Refaire la lettre avec les infos ci-dessus (remplace tes modifications)">↻ Refaire à partir des infos</button><button class="btn primary" id="pd-copy">📋 Copier la lettre</button></div>
    </section>

    <section class="card"><div class="card-head"><h2>3 · Caution (si le propriétaire hésite)</h2></div>
      <div class="pp-two pd-caution">
        <div>
          <h3>Qui choisir</h3>
          <ul class="small">
            <li>Une personne de confiance avec un <b>bon crédit</b> et un <b>revenu stable</b> (souvent un parent).</li>
            <li>Elle s’engage à payer si vous ne payez pas : elle doit bien le comprendre avant de signer.</li>
            <li>Elle signe sur la ligne « Caution » du bail du TAL (section H), et parfois une annexe.</li>
            <li>Vérifie si l’engagement couvre seulement ce bail ou aussi ses renouvellements : faites-le écrire clairement.</li>
          </ul>
        </div>
        <div class="pp-fields">
          <label class="pp-field"><span class="pp-lbl">Nom de la caution</span><span class="pp-in"><input type="text" data-s="cautionNom" value="${esc(s.cautionNom || '')}"></span></label>
          <label class="pp-field"><span class="pp-lbl">Lien avec vous</span><span class="pp-in"><input type="text" data-s="cautionLien" value="${esc(s.cautionLien || '')}" placeholder="ex. ma mère"></span></label>
          <label class="pp-field"><span class="pp-lbl">Où en est-on ?</span><span class="pp-in"><select data-s="cautionStatut">${STATUTS.map(([k, l]) => `<option value="${k}" ${(s.cautionStatut || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></span></label>
        </div>
      </div>
    </section>`;

  const redraw = () => drawDossier(body, ctx, d, A, save);
  body.querySelectorAll('[data-s]').forEach((el) => (el.onchange = async () => {
    s[el.dataset.s] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value.trim();
    await save();
    if (['revenu'].includes(el.dataset.s)) redraw();
  }));
  body.querySelectorAll('[data-p]').forEach((li) => {
    const id = li.dataset.p;
    li.querySelector('.pd-top input').onchange = async (e) => { s.proofs[id] = { ...(s.proofs[id] || {}), done: e.target.checked }; await save(); redraw(); };
  });
  body.querySelectorAll('[data-up]').forEach((f) => (f.onchange = async () => {
    const id = f.dataset.up;
    const st = (s.proofs[id] ||= {});
    st.docs ||= [];
    for (const file of f.files) { try { st.docs.push((await docs.save(file)).id); } catch (err) { toast(err.message, 'err'); } }
    st.done = true;
    d.docs = [...new Set([...(d.docs || []), ...st.docs])]; // visibles aussi dans 📎 Documents du projet
    await save(); redraw();
  }));
  body.querySelectorAll('[data-doc-rm]').forEach((b) => (b.onclick = async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!(await confirmBox('Retirer ce document ?', 'Retirer'))) return;
    const rm = b.dataset.docRm;
    for (const st of Object.values(s.proofs)) if (st.docs) st.docs = st.docs.filter((x) => x !== rm);
    d.docs = (d.docs || []).filter((x) => x !== rm);
    await save();
    await docs.removeUnused([rm]);
    redraw();
  }));
  const ta = body.querySelector('.pd-letter');
  ta.onchange = async () => { s.lettre = ta.value; await save(); };
  body.querySelector('#pd-regen').onclick = async () => {
    if (s.lettre && !(await confirmBox('Refaire la lettre à partir des infos ? Tes modifications seront remplacées.', 'Refaire'))) return;
    s.lettre = '';
    await save(); redraw();
  };
  body.querySelector('#pd-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(ta.value); toast('📋 Lettre copiée'); } catch { ta.select(); toast('Sélectionnée : fais Ctrl + C'); }
  };
}
