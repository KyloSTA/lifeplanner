// Étirements et mobilité (onglet de la section Corps) : routines guidées pose par pose, avec minuterie,
// côtés gauche et droit, voix facultative, suggestion selon la séance du jour et suivi des zones travaillées.
//
// Store « workouts » : { id, kind: 'stretch', date, routineId, name, emoji, startedAt, seconds, zones }

import { db } from './db.js';
import * as U from './util.js';
import * as game from './game.js';
import { chime } from './alarms.js';
import { todayFocus } from './workout.js';

const { esc, iso } = U;

export const ZONES = { hanches: '🦴 Hanches', jambes: '🦵 Jambes', dos: '🧍 Dos', epaules: '💪 Épaules', cou: '🙆 Cou', poignets: '✋ Poignets' };

// Poses : [nom, emoji, zones, consigne, deux côtés ?]
const P = {
  respiration: ['Respiration ventrale', '🌬️', [], 'Assis ou couché, une main sur le ventre. Inspire 4 secondes par le nez en gonflant le ventre, expire 6 secondes. Relâche les épaules.'],
  chatvache: ['Dos rond, dos creux', '🐈', ['dos', 'cou'], 'À quatre pattes. En inspirant, creuse le dos et lève le regard ; en expirant, arrondis le dos et rentre le menton. Bouge lentement, vertèbre par vertèbre.'],
  enfant: ['Posture de l’enfant', '🙇', ['dos', 'hanches', 'epaules'], 'À genoux, fesses vers les talons, bras allongés devant. Laisse le front se poser et respire dans le dos.'],
  chien: ['Chien tête en bas', '🔺', ['jambes', 'epaules', 'dos'], 'Mains et pieds au sol, bassin vers le plafond. Pousse le sol avec les mains, allonge le dos ; plie un peu les genoux si besoin.'],
  cobra: ['Cobra doux', '🐍', ['dos'], 'À plat ventre, mains sous les épaules. Pousse doucement pour soulever la poitrine, coudes un peu pliés, bassin au sol. Sans douleur au bas du dos.'],
  torsionCouche: ['Torsion couchée', '🔄', ['dos', 'hanches'], 'Sur le dos, ramène un genou vers la poitrine puis laisse-le tomber de l’autre côté. Bras en croix, regard à l’opposé.', true],
  genouxPoitrine: ['Genoux à la poitrine', '🤗', ['dos', 'hanches'], 'Sur le dos, serre les deux genoux contre la poitrine. Berce-toi doucement de gauche à droite.'],
  pigeon: ['Pigeon', '🕊️', ['hanches'], 'Un tibia devant toi au sol, l’autre jambe allongée derrière. Garde le bassin de face et penche-toi vers l’avant selon ton confort.', true],
  quatre: ['Figure 4 couchée', '4️⃣', ['hanches'], 'Sur le dos, cheville posée sur le genou opposé. Tire la cuisse du dessous vers toi jusqu’à sentir la fesse s’étirer.', true],
  fenteBasse: ['Fente basse (fléchisseurs de hanche)', '🧎', ['hanches', 'jambes'], 'Un genou au sol, l’autre pied devant. Avance le bassin en serrant la fesse de la jambe arrière, buste droit.', true],
  papillon: ['Papillon', '🦋', ['hanches'], 'Assis, plantes des pieds collées, genoux ouverts. Tiens tes pieds, dos long, et penche-toi un peu vers l’avant.'],
  grenouille: ['Grenouille', '🐸', ['hanches'], 'À quatre pattes, écarte les genoux le plus possible, chevilles alignées. Recule doucement le bassin vers l’arrière.'],
  squatProfond: ['Squat profond tenu', '🪑', ['hanches', 'jambes'], 'Pieds écartés, descends le plus bas possible, talons au sol. Coudes contre l’intérieur des genoux pour les ouvrir.'],
  rotHanche9090: ['Rotation de hanche 90/90', '📐', ['hanches'], 'Assis, une jambe pliée devant à 90°, l’autre de côté à 90°. Fais basculer les genoux d’un côté à l’autre, lentement, dos droit.'],
  ischioCouche: ['Ischio-jambiers couché', '🦵', ['jambes'], 'Sur le dos, une jambe tendue vers le plafond, tiens l’arrière de la cuisse (ou une serviette autour du pied). L’autre jambe reste au sol.', true],
  pinceAssise: ['Pince assise', '📏', ['jambes', 'dos'], 'Assis jambes tendues, penche-toi depuis les hanches en gardant le dos long. Va chercher les tibias ou les pieds.'],
  quadDebout: ['Quadriceps debout', '🦩', ['jambes'], 'Debout, attrape ton pied derrière toi et ramène le talon vers la fesse. Genoux côte à côte ; tiens un mur au besoin.', true],
  mollet: ['Mollet au mur', '🧱', ['jambes'], 'Mains au mur, une jambe tendue derrière, talon au sol. Penche-toi vers le mur jusqu’à sentir le mollet.', true],
  adducteurs: ['Adducteurs en fente latérale', '↔️', ['jambes', 'hanches'], 'Pieds très écartés, plie un genou et descends de ce côté, l’autre jambe tendue, pieds au sol.', true],
  ouvertureThoracique: ['Ouverture du thorax', '📖', ['dos', 'epaules'], 'Couché sur le côté, genoux pliés, bras devant. Ouvre le bras du dessus vers l’arrière comme un livre, regard qui suit la main.', true],
  filAiguille: ['Fil dans l’aiguille', '🪡', ['epaules', 'dos'], 'À quatre pattes, glisse un bras sous l’autre en posant l’épaule et la tempe au sol. Respire dans le haut du dos.', true],
  pectoMur: ['Pectoraux au mur', '🚪', ['epaules'], 'Avant-bras contre un cadre de porte, coude à hauteur d’épaule. Avance doucement jusqu’à sentir l’avant de l’épaule.', true],
  bras: ['Épaule croisée', '🤝', ['epaules'], 'Ramène un bras tendu devant toi et tiens-le avec l’autre bras, sans hausser l’épaule.', true],
  triceps: ['Triceps au-dessus de la tête', '🙋', ['epaules'], 'Main derrière la tête, l’autre main tire doucement le coude vers le centre.', true],
  cercleEpaules: ['Cercles d’épaules', '⭕', ['epaules', 'cou'], 'Fais de grands cercles lents avec les épaules, vers l’arrière puis vers l’avant.'],
  couLateral: ['Cou sur le côté', '🙆', ['cou'], 'Incline l’oreille vers l’épaule, l’autre épaule descend. Ajoute la main sur la tête pour un étirement doux.', true],
  couAvant: ['Menton à la poitrine', '🙇‍♂️', ['cou'], 'Rentre le menton et laisse la tête descendre vers la poitrine. Mains entrelacées derrière la tête, sans tirer.'],
  poignets: ['Poignets et avant-bras', '✋', ['poignets'], 'Bras tendu, paume vers le haut, tire doucement les doigts vers toi ; puis paume vers le bas.', true],
  torsionAssise: ['Torsion assise', '🌀', ['dos'], 'Assis sur une chaise ou au sol, grandis-toi en inspirant et tourne le buste en expirant, main sur le genou opposé.', true],
  flexionLaterale: ['Flexion latérale debout', '🌙', ['dos', 'epaules'], 'Debout, un bras au-dessus de la tête, penche-toi vers le côté opposé en allongeant tout le flanc.', true],
  legsWall: ['Jambes au mur', '🛌', ['jambes', 'dos'], 'Couché, fesses près du mur, jambes posées contre le mur. Relâche tout et respire lentement.'],
  bebeHeureux: ['Bébé heureux', '👶', ['hanches', 'dos'], 'Sur le dos, attrape tes pieds, genoux vers les aisselles. Berce-toi doucement.'],
  balancierJambes: ['Balancier de jambes', '🦿', ['hanches', 'jambes'], 'Debout, tiens un appui et balance une jambe d’avant en arrière, sans forcer, en augmentant l’amplitude.', true],
  rotationsBras: ['Moulinets de bras', '🌀', ['epaules'], 'Bras tendus sur les côtés, petits cercles qui grandissent, puis dans l’autre sens.'],
  cadavre: ['Relâchement complet', '😌', [], 'Couché sur le dos, bras le long du corps, paumes vers le haut. Laisse le corps devenir lourd à chaque expiration.'],
};

// Routines : { id, name, emoji, desc, tags, steps: [[pose, secondes]] } — une pose à deux côtés compte pour chaque côté
const ROUTINES = [
  { id: 'reveil', name: 'Réveil en douceur', emoji: '🌅', desc: 'Pour démarrer la journée : colonne, hanches et épaules.', tags: ['matin'],
    steps: [['respiration', 40], ['chatvache', 45], ['enfant', 40], ['chien', 40], ['fenteBasse', 35], ['flexionLaterale', 30], ['cercleEpaules', 30], ['torsionAssise', 30]] },
  { id: 'hanches', name: 'Hanches libérées', emoji: '🦴', desc: 'Ouvre les hanches raides par la position assise.', tags: [],
    steps: [['rotHanche9090', 60], ['fenteBasse', 45], ['pigeon', 60], ['papillon', 50], ['grenouille', 45], ['quatre', 45], ['squatProfond', 45], ['bebeHeureux', 40]] },
  { id: 'dos', name: 'Dos soulagé', emoji: '🧍', desc: 'Bas et haut du dos, idéal après une journée assise.', tags: ['bureau'],
    steps: [['genouxPoitrine', 40], ['chatvache', 50], ['enfant', 45], ['cobra', 30], ['torsionCouche', 40], ['ouvertureThoracique', 35], ['filAiguille', 35], ['quatre', 35]] },
  { id: 'epaules', name: 'Épaules et cou', emoji: '🙆', desc: 'Contre la tension de l’écran : cou, épaules, pectoraux.', tags: ['bureau'],
    steps: [['cercleEpaules', 30], ['couLateral', 30], ['couAvant', 30], ['bras', 30], ['triceps', 30], ['pectoMur', 35], ['filAiguille', 35], ['poignets', 25]] },
  { id: 'apres-course', name: 'Après la course', emoji: '🏃', desc: 'Mollets, ischios, quadriceps et hanches.', tags: ['apres-cardio'],
    steps: [['mollet', 40], ['quadDebout', 35], ['ischioCouche', 40], ['fenteBasse', 35], ['quatre', 35], ['adducteurs', 30], ['legsWall', 60]] },
  { id: 'apres-haut', name: 'Après le haut du corps', emoji: '💪', desc: 'Pectoraux, épaules, triceps et haut du dos.', tags: ['apres-haut'],
    steps: [['pectoMur', 40], ['bras', 35], ['triceps', 35], ['filAiguille', 35], ['ouvertureThoracique', 35], ['enfant', 45], ['poignets', 25]] },
  { id: 'apres-bas', name: 'Après le bas du corps', emoji: '🦵', desc: 'Quadriceps, ischios, fessiers, adducteurs et mollets.', tags: ['apres-bas'],
    steps: [['quadDebout', 40], ['ischioCouche', 45], ['pigeon', 50], ['adducteurs', 35], ['mollet', 35], ['papillon', 40], ['genouxPoitrine', 40]] },
  { id: 'dodo', name: 'Avant de dormir', emoji: '🌙', desc: 'Lent et calme pour relâcher le corps et l’esprit.', tags: ['soir'],
    steps: [['respiration', 60], ['enfant', 60], ['torsionCouche', 50], ['quatre', 45], ['bebeHeureux', 45], ['legsWall', 90], ['cadavre', 90]] },
  { id: 'bureau', name: 'Pause bureau', emoji: '💻', desc: 'Cinq minutes debout ou sur ta chaise, sans tapis.', tags: ['bureau'],
    steps: [['cercleEpaules', 30], ['couLateral', 25], ['torsionAssise', 25], ['flexionLaterale', 25], ['poignets', 20], ['quadDebout', 25], ['mollet', 25]] },
  { id: 'ischios', name: 'Ischios et mollets', emoji: '🦿', desc: 'Pour la souplesse de l’arrière des jambes.', tags: [],
    steps: [['balancierJambes', 30], ['ischioCouche', 50], ['pinceAssise', 60], ['chien', 45], ['mollet', 40], ['legsWall', 60]] },
  { id: 'complete', name: 'Mobilité complète', emoji: '🧘', desc: 'Tout le corps, de la tête aux pieds. Ta séance du dimanche.', tags: [],
    steps: [['respiration', 40], ['cercleEpaules', 30], ['couLateral', 30], ['rotationsBras', 30], ['chatvache', 45], ['filAiguille', 35], ['ouvertureThoracique', 35], ['rotHanche9090', 60],
      ['fenteBasse', 40], ['pigeon', 50], ['papillon', 45], ['ischioCouche', 40], ['quadDebout', 35], ['mollet', 35], ['torsionCouche', 40], ['cadavre', 60]] },
];

/** Étapes réelles d'une routine (les poses à deux côtés deviennent gauche puis droite). */
function expand(r) {
  const out = [];
  for (const [id, sec] of r.steps) {
    const p = P[id];
    if (!p) continue;
    if (p[4]) { out.push({ id, sec, side: 'Côté gauche' }); out.push({ id, sec, side: 'Côté droit' }); } else out.push({ id, sec, side: '' });
  }
  return out;
}
const totalSec = (r) => expand(r).reduce((n, s) => n + s.sec, 0);
const minutes = (s) => Math.max(1, Math.round(s / 60));
const zonesOf = (r) => [...new Set(r.steps.flatMap(([id]) => P[id]?.[2] || []))];

async function logs() {
  return (await db.all('workouts')).filter((x) => x.kind === 'stretch').sort((a, b) => b.startedAt - a.startedAt);
}

/** Routine suggérée : selon la séance du jour, sinon selon l'heure. */
async function suggestion() {
  const f = await todayFocus().catch(() => null);
  const txt = f ? (f.name + ' ' + (f.exercises || []).map((e) => e.name).join(' ')).toLowerCase() : '';
  const h = new Date().getHours();
  if (/course|vélo|velo|cardio|rameur|corde/.test(txt)) return ['apres-course', `Après ta séance « ${f.name} »`];
  if (/bas du corps|jambe|squat|fente|soulevé|hip thrust|mollet/.test(txt)) return ['apres-bas', `Après ta séance « ${f.name} »`];
  if (/haut du corps|développé|developpe|traction|rowing|curl|épaule|pector|push|pull/.test(txt)) return ['apres-haut', `Après ta séance « ${f.name} »`];
  if (h < 11) return ['reveil', 'Pour bien commencer la journée'];
  if (h >= 20) return ['dodo', 'Pour bien dormir'];
  return ['bureau', 'Une petite pause pour le corps'];
}

/* ---------- Page ---------- */
let filter = '';
export async function renderPage(ctx) {
  const { view, modal } = ctx;
  const all = await logs();
  const today = iso(new Date());
  const days = new Set(all.map((l) => l.date));
  let streak = 0;
  for (let d = days.has(today) ? new Date() : U.addDays(new Date(), -1); days.has(iso(d)); d = U.addDays(d, -1)) streak++;
  const wk0 = U.startOfWeek(new Date()).getTime();
  const week = all.filter((l) => l.startedAt >= wk0);
  const weekMin = Math.round(week.reduce((n, l) => n + l.seconds, 0) / 60);
  const zoneMin = Object.fromEntries(Object.keys(ZONES).map((z) => [z, 0]));
  for (const l of week) for (const z of l.zones || []) if (z in zoneMin) zoneMin[z] += l.seconds / 60 / Math.max(1, (l.zones || []).length);
  const zMax = Math.max(1, ...Object.values(zoneMin));
  const [sugId, sugWhy] = await suggestion();
  const sug = ROUTINES.find((r) => r.id === sugId);
  const doneIds = new Set(all.filter((l) => l.date === today).map((l) => l.routineId));

  const card = (r) => `<button class="sx-card" data-r="${r.id}">
    <span class="sx-emo">${r.emoji}</span>
    <span class="sx-txt"><b>${esc(r.name)}</b><small class="muted">${minutes(totalSec(r))} min · ${expand(r).length} poses</small>
      <span class="sx-zones">${zonesOf(r).slice(0, 3).map((z) => `<i>${ZONES[z].split(' ').slice(1).join(' ')}</i>`).join('')}</span></span>
    ${doneIds.has(r.id) ? '<span class="sx-done" title="Faite aujourd’hui">✓</span>' : ''}
  </button>`;
  const list = ROUTINES.filter((r) => !filter || zonesOf(r).includes(filter));

  view.innerHTML = `
    <header class="page-head"><div><p class="eyebrow">Mobilité</p><h1>Étirements</h1></div></header>
    <section class="card sx-hero" data-r="${sug.id}" role="button" tabindex="0">
      <div><p class="eyebrow">${esc(sugWhy)}</p><h2>${sug.emoji} ${esc(sug.name)}</h2><p class="muted">${esc(sug.desc)}</p></div>
      <button class="btn primary sx-play" data-play="${sug.id}">▶ ${minutes(totalSec(sug))} min</button>
    </section>
    <div class="wk-kpis sx-kpis">
      <div class="card wk-kpi"><b>${streak}</b><span>jour${streak > 1 ? 's' : ''} d’affilée 🔥</span></div>
      <div class="card wk-kpi"><b>${weekMin}</b><span>minutes cette semaine</span></div>
      <div class="card wk-kpi"><b>${all.length}</b><span>séance${all.length > 1 ? 's' : ''} au total</span></div>
    </div>
    <section class="card">
      <div class="card-head"><h2>Zones travaillées cette semaine</h2></div>
      <div class="sx-zbars">${Object.entries(ZONES).map(([z, l]) => `<div class="sx-zbar"><span>${l}</span><i><b style="width:${(zoneMin[z] / zMax) * 100}%"></b></i><small class="muted">${Math.round(zoneMin[z])} min</small></div>`).join('')}</div>
    </section>
    <div class="wo-parts sx-filters">${['', ...Object.keys(ZONES)].map((z) => `<button class="chip-btn ${z === filter ? 'on' : ''}" data-z="${z}">${z ? ZONES[z] : 'Toutes'}</button>`).join('')}</div>
    <div class="sx-grid">${list.map(card).join('')}</div>
    <p class="hint muted">Étire-toi sans douleur : une sensation d’étirement, jamais de pincement. En cas de blessure, demande conseil à un professionnel de la santé.</p>`;

  view.querySelectorAll('[data-z]').forEach((b) => (b.onclick = () => { filter = b.dataset.z; renderPage(ctx); }));
  view.querySelector('[data-play]').onclick = (e) => { e.stopPropagation(); play(ctx, sug); };
  view.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => {
    const r = ROUTINES.find((x) => x.id === b.dataset.r);
    const steps = expand(r);
    modal(`<h2>${r.emoji} ${esc(r.name)}</h2>
      <p class="muted" style="margin-top:0">${esc(r.desc)} · ${minutes(totalSec(r))} min</p>
      <ol class="sx-steps">${steps.map((s) => `<li><span>${P[s.id][1]}</span><span><b>${esc(P[s.id][0])}</b>${s.side ? `<small class="muted"> · ${s.side}</small>` : ''}</span><small class="muted">${s.sec} s</small></li>`).join('')}</ol>
      <div class="modal-actions"><button class="btn" data-close>Fermer</button><button class="btn primary" id="sx-go">▶ Commencer</button></div>`, (m, close) => {
      m.querySelector('#sx-go').onclick = () => { close(); play(ctx, r); };
    });
  }));
}

/* ---------- Lecteur guidé ---------- */
const VOICE_KEY = 'lp.stretchVoice';
function speak(text) {
  try {
    if (localStorage.getItem(VOICE_KEY) !== '1' || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-CA';
    speechSynthesis.speak(u);
  } catch { /* voix indisponible */ }
}

function play(ctx, r) {
  const steps = expand(r);
  const PREP = 5;
  let i = -1, left = PREP, paused = false, elapsed = 0, lock = null;
  const started = Date.now();
  document.querySelector('#sx-player')?.remove();
  const el = document.createElement('div');
  el.id = 'sx-player';
  el.className = 'sx-player';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', r.name);
  document.body.appendChild(el);
  navigator.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});

  const R = 92, C = 2 * Math.PI * R;
  const draw = () => {
    const prep = i < 0;
    const s = prep ? steps[0] : steps[i];
    const p = P[s.id];
    const dur = prep ? PREP : s.sec;
    const next = steps[i + 1];
    const voiceOn = (() => { try { return localStorage.getItem(VOICE_KEY) === '1'; } catch { return false; } })();
    el.innerHTML = `
      <div class="sx-top"><button class="btn icon" data-x aria-label="Arrêter">✕</button><span>${prep ? 'Prépare-toi' : `${i + 1} / ${steps.length}`}</span>
        <button class="btn icon" data-voice aria-pressed="${voiceOn}" title="Voix ${voiceOn ? 'activée' : 'désactivée'}">${voiceOn ? '🔊' : '🔈'}</button></div>
      <div class="sx-prog"><i style="width:${((Math.max(0, i) + (prep ? 0 : 1 - left / dur)) / steps.length) * 100}%"></i></div>
      <div class="sx-stage">
        <div class="sx-ring"><svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="${R}" class="bg"/><circle cx="100" cy="100" r="${R}" class="fg" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - left / dur)}"/></svg>
          <div class="sx-ring-in"><span class="sx-big">${p[1]}</span><b>${Math.ceil(left)}</b></div></div>
        <h2>${esc(p[0])}</h2>
        ${s.side ? `<p class="sx-side">${s.side}</p>` : ''}
        <p class="sx-how">${esc(p[3])}</p>
      </div>
      <div class="sx-ctrl">
        <button class="btn icon" data-prev aria-label="Pose précédente" ${i <= 0 ? 'disabled' : ''}>⏮</button>
        <button class="btn primary sx-pp" data-pp aria-label="${paused ? 'Reprendre' : 'Pause'}">${paused ? '▶' : '⏸'}</button>
        <button class="btn icon" data-next aria-label="Pose suivante">⏭</button>
      </div>
      <p class="sx-next muted">${next ? `Ensuite : ${P[next.id][1]} ${esc(P[next.id][0])}${next.side ? ` · ${next.side}` : ''}` : 'Dernière pose'}</p>`;
    el.querySelector('[data-x]').onclick = stop;
    el.querySelector('[data-pp]').onclick = () => { paused = !paused; draw(); };
    el.querySelector('[data-next]').onclick = () => go(i + 1);
    el.querySelector('[data-prev]').onclick = () => go(Math.max(0, i - 1));
    el.querySelector('[data-voice]').onclick = () => { try { localStorage.setItem(VOICE_KEY, voiceOn ? '0' : '1'); } catch { /* ignore */ } draw(); if (!voiceOn) speak(p[0]); };
  };
  const go = (n) => {
    if (n >= steps.length) return finish();
    i = n; left = steps[i].sec;
    const s = steps[i];
    chime();
    navigator.vibrate?.(120);
    speak(`${P[s.id][0]}${s.side ? '. ' + s.side : ''}`);
    draw();
  };
  const t = setInterval(() => {
    if (paused) return;
    left -= 0.25;
    if (i >= 0) elapsed += 0.25;
    if (left <= 0) { go(i + 1); return; }
    // Mise à jour légère : anneau et chiffres seulement
    const ring = el.querySelector('.fg'), num = el.querySelector('.sx-ring-in b'), bar = el.querySelector('.sx-prog i');
    const dur = i < 0 ? PREP : steps[i].sec;
    if (ring) ring.style.strokeDashoffset = C * (1 - left / dur);
    if (num) num.textContent = Math.ceil(left);
    if (bar) bar.style.width = ((Math.max(0, i) + (i < 0 ? 0 : 1 - left / dur)) / steps.length) * 100 + '%';
    if (i >= 0 && Math.ceil(left) === 3 && left % 1 === 0) navigator.vibrate?.(40);
  }, 250);
  const onKey = (e) => {
    if (e.key === 'Escape') stop();
    if (e.key === ' ') { e.preventDefault(); paused = !paused; draw(); }
    if (e.key === 'ArrowRight') go(i + 1);
    if (e.key === 'ArrowLeft') go(Math.max(0, i - 1));
  };
  document.addEventListener('keydown', onKey);
  const end = () => { clearInterval(t); document.removeEventListener('keydown', onKey); lock?.release?.().catch(() => {}); try { speechSynthesis?.cancel(); } catch { /* ignore */ } };
  const record = async (seconds) => {
    const done = steps.slice(0, Math.max(0, i + (i >= 0 ? 1 : 0)));
    const zones = [...new Set(done.flatMap((s) => P[s.id][2]))];
    const id = U.uid();
    await db.put('workouts', { id, kind: 'stretch', date: iso(new Date()), routineId: r.id, name: r.name, emoji: r.emoji, startedAt: started, seconds: Math.round(seconds), zones });
    await game.award('stretch:' + id, game.XP.stretch || 10, `Étirements : ${r.name}`);
  };
  async function stop() {
    end();
    // Au moins une minute faite : on la compte quand même
    if (elapsed >= 60) { await record(elapsed); ctx.toast(`🧘 ${minutes(elapsed)} min d’étirements enregistrées`); }
    el.remove();
    renderPage(ctx);
  }
  async function finish() {
    end();
    i = steps.length - 1;
    if (elapsed >= 20) await record(elapsed); // temps réellement passé (poses sautées non comptées)
    el.innerHTML = `<div class="sx-end"><div class="sx-big">🧘</div><h2>Bien joué !</h2><p class="muted">${esc(r.name)} · ${minutes(elapsed)} min</p>
      <p>Ton corps te remercie. Bois un peu d’eau.</p><button class="btn primary" data-x>Terminer</button></div>`;
    chime();
    speak('Bien joué !');
    el.querySelector('[data-x]').onclick = () => { el.remove(); renderPage(ctx); };
  }
  draw();
}

/** Minutes d'étirements aujourd'hui (pour d'autres résumés). */
export async function todayMinutes() {
  const today = iso(new Date());
  return Math.round((await logs()).filter((l) => l.date === today).reduce((n, l) => n + l.seconds, 0) / 60);
}
