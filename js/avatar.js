// Avatar personnalisable (SVG). Certains éléments se débloquent en montant de niveau (lvl).

let n = 0;

export const SKINS = ['#ffdbc4', '#f1c7a5', '#e0a97e', '#c68863', '#9a6440', '#6b4329'].map((c) => ({ c }));
export const HAIR_COLORS = [
  { c: '#2b2220' }, { c: '#5a3825' }, { c: '#a0522d' }, { c: '#e3b765' },
  { c: '#d9534f', lvl: 3 }, { c: '#f28dc0', lvl: 4 }, { c: '#5aa9ff', lvl: 6 }, { c: '#c9ccd6', lvl: 8 },
];
export const OUTFITS = [
  { c: '#4f46e5' }, { c: '#0ea5e9' }, { c: '#16a34a' }, { c: '#f97316' },
  { c: '#e11d48', lvl: 2 }, { c: '#1f2937', lvl: 4 }, { c: '#a855f7', lvl: 6 }, { c: '#eab308', lvl: 9 },
];
export const HAIRS = [
  { id: 'short', name: 'Court' }, { id: 'long', name: 'Long' }, { id: 'bun', name: 'Chignon' },
  { id: 'curly', name: 'Bouclé' }, { id: 'buzz', name: 'Ras' }, { id: 'none', name: 'Sans' },
  { id: 'ponytail', name: 'Queue de cheval', lvl: 2 }, { id: 'spiky', name: 'En pics', lvl: 3 },
];
export const EYES = [
  { id: 'dots', name: 'Ronds' }, { id: 'happy', name: 'Joyeux' },
  { id: 'wink', name: 'Clin d’œil', lvl: 2 }, { id: 'star', name: 'Étoiles', lvl: 8 },
];
export const ACCS = [
  { id: 'none', name: 'Aucun' }, { id: 'cap', name: 'Casquette', lvl: 2 }, { id: 'headphones', name: 'Casque audio', lvl: 3 },
  { id: 'glasses', name: 'Lunettes', lvl: 4 }, { id: 'flower', name: 'Fleur', lvl: 5 }, { id: 'wizard', name: 'Chapeau de mage', lvl: 7 },
  { id: 'crown', name: 'Couronne', lvl: 10 },
];
export const BACKS = [
  { id: 'lilac', fill: '#e0e7ff' }, { id: 'mint', fill: '#d1fae5' }, { id: 'peach', fill: '#ffe4d6' }, { id: 'sky', fill: '#dbeafe' },
  { id: 'sunset', g: ['#ffb37a', '#ff5e8a'], lvl: 5 }, { id: 'ocean', g: ['#4facfe', '#00c6fb'], lvl: 6 },
  { id: 'forest', g: ['#43e97b', '#2bb38f'], lvl: 8 }, { id: 'galaxy', g: ['#1e1145', '#6b3fd4'], stars: true, lvl: 12 },
];

// Corps entier (Aventure et page du héros)
export const TOPS = [
  { id: 'tshirt', name: 'T-shirt' }, { id: 'hoodie', name: 'Chandail à capuchon' },
  { id: 'dress', name: 'Robe', lvl: 2 }, { id: 'jacket', name: 'Veste ouverte', lvl: 4 },
];
export const PANTS = [
  { c: '#334155' }, { c: '#1e3a8a' }, { c: '#6b4f2a' }, { c: '#111827' },
  { c: '#9ca3af', lvl: 3 }, { c: '#166534', lvl: 5 }, { c: '#7c2d12', lvl: 7 },
];
export const SHOES = [
  { c: '#1f2937' }, { c: '#f8fafc' }, { c: '#7c4a2d' }, { c: '#dc2626', lvl: 3 }, { c: '#2563eb', lvl: 5 }, { c: '#f59e0b', lvl: 8 },
];

export const DEFAULT_AVATAR = { skin: 1, hair: 'short', hairColor: 1, eyes: 'dots', outfit: 0, bg: 'lilac', acc: 'none', name: '', top: 'tshirt', pants: 0, shoes: 0 };

// type "color" -> la valeur est l'index ; sinon la valeur est l'id
export const CATEGORIES = [
  { key: 'skin', name: 'Peau', items: SKINS, type: 'color' },
  { key: 'hair', name: 'Coiffure', items: HAIRS, type: 'style' },
  { key: 'hairColor', name: 'Couleur des cheveux', items: HAIR_COLORS, type: 'color' },
  { key: 'eyes', name: 'Yeux', items: EYES, type: 'style' },
  { key: 'outfit', name: 'Couleur du haut', items: OUTFITS, type: 'color' },
  { key: 'top', name: 'Style du haut', items: TOPS, type: 'style', body: true },
  { key: 'pants', name: 'Pantalon', items: PANTS, type: 'color' },
  { key: 'shoes', name: 'Souliers', items: SHOES, type: 'color' },
  { key: 'acc', name: 'Accessoire', items: ACCS, type: 'style' },
  { key: 'bg', name: 'Fond', items: BACKS, type: 'bg' },
];

/** Éléments débloqués exactement à ce niveau (pour la célébration). */
export function unlocksAt(level) {
  const out = [];
  for (const cat of CATEGORIES) for (const it of cat.items) if (it.lvl === level) out.push({ cat: cat.name, name: it.name || '' });
  return out;
}

/** Prochain élément à débloquer (motivation). */
export function nextUnlock(level) {
  let best = null;
  for (const cat of CATEGORIES) for (const it of cat.items) if (it.lvl > level && (!best || it.lvl < best.lvl)) best = { lvl: it.lvl, cat: cat.name, name: it.name || '' };
  return best;
}

function starPath(cx, cy, R, r) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2, rad = i % 2 ? r : R;
    d += (i ? 'L' : 'M') + (cx + rad * Math.cos(a)).toFixed(1) + ' ' + (cy + rad * Math.sin(a)).toFixed(1);
  }
  return d + 'Z';
}

const shortHair = (h) => `<path d="M36 57C33 34 46 25 60 25C74 25 87 34 84 57C80 46 72 40 60 40C48 40 40 46 36 57Z" fill="${h}"/>`;
const HAIR_TOP = {
  short: shortHair,
  long: shortHair,
  ponytail: (h) => shortHair(h) + `<rect x="74" y="36" width="6" height="7" rx="2" fill="#e11d48" transform="rotate(30 77 39)"/>`,
  bun: (h) => `<circle cx="60" cy="22" r="10" fill="${h}"/>` + shortHair(h),
  curly: (h) => [[38, 50], [42, 38], [51, 30], [61, 28], [71, 31], [79, 39], [83, 50]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8.5" fill="${h}"/>`).join('') + shortHair(h),
  spiky: (h) => `<path d="M35 57L31 40L42 42L39 27L52 34L56 18L65 32L75 20L77 36L89 33L84 46L85 57C80 46 72 41 60 41C48 41 40 46 35 57Z" fill="${h}"/>`,
  buzz: (h) => `<path d="M37 51C38 35 48 31 60 31C72 31 82 35 83 51C76 43 68 40 60 40C52 40 44 43 37 51Z" fill="${h}" opacity=".85"/>`,
  none: () => '',
};

const dot = (x) => `<circle cx="${x}" cy="58" r="3.3" fill="#1d1d1f"/><circle cx="${x + 1.2}" cy="56.8" r="1" fill="#fff"/>`;
const arc = (x) => `<path d="M${x - 4} 59.5Q${x} 54 ${x + 4} 59.5" fill="none" stroke="#1d1d1f" stroke-width="2.4" stroke-linecap="round"/>`;
const star = (x) => `<path d="${starPath(x, 58, 5, 2.2)}" fill="#f5b301" stroke="#1d1d1f" stroke-width=".8"/>`;
const EYE = {
  dots: () => dot(51) + dot(69),
  happy: () => arc(51) + arc(69),
  wink: () => dot(51) + arc(69),
  star: () => star(51) + star(69),
};

const ACC = {
  none: () => '',
  glasses: () => `<g fill="rgba(255,255,255,.18)" stroke="#222" stroke-width="2"><circle cx="51" cy="58" r="7"/><circle cx="69" cy="58" r="7"/></g>
    <path d="M58 58H62M44 57L37 55M76 57L83 55" stroke="#222" stroke-width="2" stroke-linecap="round"/>`,
  cap: () => `<path d="M35 47C35 26 85 26 85 47Z" fill="#e5484d"/><path d="M58 45C72 43 92 45 98 50C88 51 70 51 58 49Z" fill="#c2383c"/><circle cx="60" cy="28" r="2.5" fill="#c2383c"/>`,
  headphones: () => `<path d="M34 58C30 25 90 25 86 58" fill="none" stroke="#2d2d35" stroke-width="5" stroke-linecap="round"/>
    <rect x="28" y="50" width="11" height="17" rx="4" fill="#6366f1"/><rect x="81" y="50" width="11" height="17" rx="4" fill="#6366f1"/>`,
  flower: () => [0, 72, 144, 216, 288].map((a) => {
      const r = (a * Math.PI) / 180;
      return `<circle cx="${(81 + 5 * Math.cos(r)).toFixed(1)}" cy="${(38 + 5 * Math.sin(r)).toFixed(1)}" r="4" fill="#f472b6"/>`;
    }).join('') + `<circle cx="81" cy="38" r="3" fill="#fde047"/>`,
  wizard: () => `<path d="M38 42L66 3L84 42Z" fill="#5b3cc4"/><ellipse cx="60" cy="42" rx="31" ry="6" fill="#4c2fb0"/>
    <path d="${starPath(64, 25, 5, 2.2)}" fill="#fde047"/>`,
  crown: () => `<path d="M40 36L43 18L52 28L60 13L68 28L77 18L80 36Z" fill="#f5b301" stroke="#c98a00" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="60" cy="29" r="2.6" fill="#e11d48"/><circle cx="49" cy="32" r="2" fill="#3b82f6"/><circle cx="71" cy="32" r="2" fill="#16a34a"/>`,
};

/* ---------- Évolution (second cerveau) ---------- */
const spark = (x, y, r, c = '#fde047') =>
  `<path d="M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z" fill="${c}"/>`;

function owl(stage) {
  const s = stage >= 4 ? 1 : stage >= 3 ? 0.86 : 0.7;
  const gold = stage >= 5;
  const body = gold ? '#e0a526' : '#8b5e3c';
  const belly = gold ? '#fff1c2' : '#e9c99b';
  const glasses = stage >= 4
    ? `<g fill="none" stroke="#222" stroke-width="1"><circle cx="-4.5" cy="-4" r="4.8"/><circle cx="4.5" cy="-4" r="4.8"/></g>` : '';
  return `<g transform="translate(91 ${(93 - 13 * s).toFixed(1)}) scale(${s})">
    <path d="M-10 -8L-8 -18L-3 -11ZM10 -8L8 -18L3 -11Z" fill="${body}"/>
    <ellipse cx="0" cy="0" rx="11" ry="13" fill="${body}" stroke="rgba(0,0,0,.18)" stroke-width=".8"/>
    <ellipse cx="0" cy="5" rx="7" ry="7.5" fill="${belly}"/>
    <path d="M-11 0Q-15 7 -9 11ZM11 0Q15 7 9 11Z" fill="${body}" opacity=".85"/>
    <circle cx="-4.5" cy="-4" r="4.3" fill="#fff"/><circle cx="4.5" cy="-4" r="4.3" fill="#fff"/>
    <circle cx="-4" cy="-3.6" r="2.1" fill="#1d1d1f"/><circle cx="4" cy="-3.6" r="2.1" fill="#1d1d1f"/>
    <path d="M-1.8 0L1.8 0L0 3.2Z" fill="#f59e0b"/>${glasses}
    <path d="M-4 13V15M-2.5 13V15M2.5 13V15M4 13V15" stroke="#f59e0b" stroke-width="1.2" stroke-linecap="round"/>
    ${gold ? spark(-11, -15, 3, '#fff') : ''}</g>`;
}

/** Calques derrière le personnage (aura, anneau). */
function evoBack(stage, id) {
  let out = '';
  if (stage >= 3) {
    const [c1, c2] = stage >= 5 ? ['#fde68a', '#a855f7'] : ['#c4b5fd', '#818cf8'];
    out += `<radialGradient id="aura${id}"><stop offset=".35" stop-color="${c1}" stop-opacity=".95"/><stop offset=".7" stop-color="${c2}" stop-opacity=".45"/><stop offset="1" stop-color="${c2}" stop-opacity="0"/></radialGradient>`;
  }
  return out;
}

function evoBehind(stage, id) {
  let out = '';
  if (stage >= 3) out += `<circle cx="60" cy="58" r="50" fill="url(#aura${id})"/>`;
  if (stage >= 4) {
    out += `<ellipse cx="60" cy="40" rx="52" ry="15" fill="none" stroke="#f5b301" stroke-width="1.6" stroke-dasharray="5 4" opacity=".8" transform="rotate(-10 60 40)"/>`;
    out += [[11, 49], [108, 31]].map(([x, y]) => `<g transform="translate(${x} ${y})"><rect x="-4.5" y="-5.5" width="9" height="11" rx="1.5" fill="#fef3c7" stroke="#b45309" stroke-width=".8"/><path d="M-2.5 -2H2.5M-2.5 0.5H2.5M-2.5 3H1" stroke="#b45309" stroke-width=".7"/></g>`).join('');
  }
  return out;
}

/** Calques devant le personnage (étincelles, troisième œil, hibou). */
function evoFront(stage) {
  let out = '';
  if (stage >= 1) {
    const pts = [[21, 30, 6], [99, 21, 4.8], [15, 66, 4.2]];
    if (stage >= 3) pts.push([105, 57, 5], [32, 13, 3.6]);
    out += pts.map(([x, y, r]) => spark(x, y, r)).join('');
  }
  if (stage >= 5) out += `<path d="M60 43L62.6 46.5L60 50L57.4 46.5Z" fill="#a855f7" stroke="#fde68a" stroke-width=".8"/>`;
  if (stage >= 2) out += owl(stage);
  return out;
}

export function avatarSVG(cfg = {}, size = 48) {
  const a = { ...DEFAULT_AVATAR, ...cfg };
  const id = ++n;
  const skin = (SKINS[a.skin] || SKINS[0]).c;
  const hair = (HAIR_COLORS[a.hairColor] || HAIR_COLORS[0]).c;
  const outfit = (OUTFITS[a.outfit] || OUTFITS[0]).c;
  const bg = BACKS.find((b) => b.id === a.bg) || BACKS[0];
  let defs = `<clipPath id="avc${id}"><circle cx="60" cy="60" r="60"/></clipPath>`;
  let bgFill = bg.fill;
  if (bg.g) {
    defs += `<linearGradient id="avg${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg.g[0]}"/><stop offset="1" stop-color="${bg.g[1]}"/></linearGradient>`;
    bgFill = `url(#avg${id})`;
  }
  const stage = a.evoFx === false ? 0 : Number(a.evo) || 0;
  defs += evoBack(stage, id);
  const stars = bg.stars ? [[20, 25], [95, 18], [102, 70], [14, 78], [28, 52], [92, 44]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#fff" opacity=".85"/>`).join('') : '';
  const backHair = a.hair === 'long'
    ? `<path d="M33 54C32 28 88 28 87 54L90 100C78 106 42 106 30 100Z" fill="${hair}"/>`
    : a.hair === 'ponytail' ? `<path d="M77 38C100 44 98 78 86 92C88 72 84 56 73 46Z" fill="${hair}"/>` : '';
  return `<svg class="avatar" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true"><defs>${defs}</defs>
  <g clip-path="url(#avc${id})"><rect width="120" height="120" fill="${bgFill}"/>${stars}${evoBehind(stage, id)}${backHair}
  <path d="M18 126C18 97 36 85 60 85C84 85 102 97 102 126Z" fill="${outfit}"/>
  <path d="M50 86L60 97L70 86" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.5" stroke-linejoin="round"/>
  <rect x="53" y="70" width="14" height="17" rx="5" fill="${skin}"/><rect x="53" y="70" width="14" height="17" rx="5" fill="#000" opacity=".08"/>
  <circle cx="37" cy="58" r="4.5" fill="${skin}"/><circle cx="83" cy="58" r="4.5" fill="${skin}"/>
  <ellipse cx="60" cy="56" rx="23" ry="25" fill="${skin}"/>
  ${(EYE[a.eyes] || EYE.dots)()}
  <ellipse cx="46" cy="66" rx="4" ry="2.4" fill="#ff7b7b" opacity=".35"/><ellipse cx="74" cy="66" rx="4" ry="2.4" fill="#ff7b7b" opacity=".35"/>
  <path d="M54 68Q60 73.5 66 68" fill="none" stroke="#7a3b2e" stroke-width="2.2" stroke-linecap="round"/>
  ${(HAIR_TOP[a.hair] || HAIR_TOP.short)(hair)}${(ACC[a.acc] || ACC.none)()}${evoFront(stage)}</g></svg>`;
}

/* =========================================================
   Corps entier (Aventure, page du héros) + équipement porté
   equip : liste d'objets { slot, id, icon, rarity } (voir rpg-data.js)
   ========================================================= */
const RARE_GLOW = { rare: '#3b82f6', epique: '#a855f7', legendaire: '#f59e0b' };

// Couvre-chefs (dessinés dans le repère de la tête, 0-120)
const HEADGEAR = {
  bandeau: () => `<rect x="36" y="38" width="48" height="7" rx="3.5" fill="#e11d48"/><path d="M84 41L95 36L93 46Z" fill="#be123c"/>`,
  chapeau: () => `<rect x="44" y="6" width="32" height="30" rx="3" fill="#1f2937"/><rect x="44" y="27" width="32" height="5" fill="#a855f7"/><ellipse cx="60" cy="36" rx="30" ry="5" fill="#111827"/>`,
  casque: () => `<path d="M33 46C33 18 87 18 87 46Z" fill="#facc15" stroke="#ca8a04" stroke-width="1.5"/><rect x="28" y="43" width="64" height="6" rx="3" fill="#eab308"/><rect x="56" y="20" width="8" height="24" rx="3" fill="#fde047"/>`,
  heaume: () => `<path d="M33 64C30 24 90 24 87 64L87 76Q60 84 33 76Z" fill="#cbd5e1" stroke="#64748b" stroke-width="1.6"/>
    <rect x="40" y="53" width="40" height="6" rx="2" fill="#1e293b"/><path d="M60 28V50" stroke="#94a3b8" stroke-width="3"/>
    <path d="M60 24C70 10 84 14 86 22C78 18 68 20 62 30Z" fill="#dc2626"/>`,
  couronne: () => ACC.crown(),
};
const COVERS_HAIR = new Set(['casque', 'heaume', 'chapeau']);

/** Tête seule, dans le repère 0-120 (réutilise le dessin de l'avatar). */
function headLayer(a, skin, hair, gear) {
  const backHair = a.hair === 'long' && !COVERS_HAIR.has(gear?.id)
    ? `<path d="M33 54C32 28 88 28 87 54L90 96C78 102 42 102 30 96Z" fill="${hair}"/>`
    : a.hair === 'ponytail' && !COVERS_HAIR.has(gear?.id) ? `<path d="M77 38C100 44 98 78 86 92C88 72 84 56 73 46Z" fill="${hair}"/>` : '';
  const top = COVERS_HAIR.has(gear?.id) ? '' : (HAIR_TOP[a.hair] || HAIR_TOP.short)(hair);
  return `${backHair}
    <circle cx="37" cy="58" r="4.5" fill="${skin}"/><circle cx="83" cy="58" r="4.5" fill="${skin}"/>
    <ellipse cx="60" cy="56" rx="23" ry="25" fill="${skin}"/>
    ${(EYE[a.eyes] || EYE.dots)()}
    <ellipse cx="46" cy="66" rx="4" ry="2.4" fill="#ff7b7b" opacity=".35"/><ellipse cx="74" cy="66" rx="4" ry="2.4" fill="#ff7b7b" opacity=".35"/>
    <path d="M54 68Q60 73.5 66 68" fill="none" stroke="#7a3b2e" stroke-width="2.2" stroke-linecap="round"/>
    ${top}${gear ? (HEADGEAR[gear.id] || (() => ''))() : (ACC[a.acc] || ACC.none)()}`;
}

export function heroSVG(cfg = {}, equip = [], height = 240) {
  const a = { ...DEFAULT_AVATAR, ...cfg };
  const id = ++n;
  const skin = (SKINS[a.skin] || SKINS[0]).c;
  const hair = (HAIR_COLORS[a.hairColor] || HAIR_COLORS[0]).c;
  const shirt = (OUTFITS[a.outfit] || OUTFITS[0]).c;
  const pants = (PANTS[a.pants] || PANTS[0]).c;
  const shoes = (SHOES[a.shoes] || SHOES[0]).c;
  const bg = BACKS.find((b) => b.id === a.bg) || BACKS[0];
  const eq = Object.fromEntries(equip.filter(Boolean).map((e) => [e.slot, e]));
  const stage = a.evoFx === false ? 0 : Number(a.evo) || 0;
  let defs = `<linearGradient id="hbg${id}" x1="0" y1="0" x2="0" y2="1">${bg.g ? `<stop offset="0" stop-color="${bg.g[0]}"/><stop offset="1" stop-color="${bg.g[1]}"/>` : `<stop offset="0" stop-color="${bg.fill}"/><stop offset="1" stop-color="${bg.fill}"/>`}</linearGradient>
    <pattern id="mail${id}" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#9ca3af"/><circle cx="2.5" cy="2.5" r="1.7" fill="none" stroke="#6b7280" stroke-width=".8"/></pattern>
    <linearGradient id="plate${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1f5f9"/><stop offset="1" stop-color="#94a3b8"/></linearGradient>`;
  defs += evoBack(stage, id);
  const torso = 'M56 90Q80 84 104 90L108 150L52 150Z';
  const top = a.top;
  const longSleeves = top === 'hoodie' || top === 'jacket';
  const armor = eq.armure?.id;
  const sleeveCol = armor === 'cotte' ? `url(#mail${id})` : armor === 'armure-lune' ? `url(#plate${id})` : shirt;

  // Arrière-plan, ombre au sol, cape
  let s = `<rect width="160" height="240" rx="18" fill="url(#hbg${id})"/>`;
  if (bg.stars) s += [[20, 25], [140, 18], [132, 90], [14, 120], [36, 60], [128, 160]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#fff" opacity=".85"/>`).join('');
  s += `<ellipse cx="80" cy="222" rx="46" ry="7" fill="#000" opacity=".15"/>`;
  if (eq.armure && RARE_GLOW[eq.armure.rarity] && armor !== 'cape') s += `<ellipse cx="80" cy="120" rx="44" ry="50" fill="${RARE_GLOW[eq.armure.rarity]}" opacity=".12"/>`;
  if (armor === 'cape') s += `<path d="M57 90L38 204Q80 214 122 204L103 90Z" fill="#4c1d95"/><path d="M57 90L46 204Q60 208 66 206L70 92Z" fill="#5b21b6"/>`;
  if (top === 'hoodie') s += `<path d="M62 92Q80 74 98 92Q80 100 62 92Z" fill="${shirt}" opacity=".9"/>`;

  // Jambes et souliers
  s += `<rect x="58" y="146" width="20" height="62" rx="6" fill="${pants}"/><rect x="82" y="146" width="20" height="62" rx="6" fill="${pants}"/>
    <path d="M78 150V200" stroke="#000" stroke-opacity=".12" stroke-width="2"/>
    <ellipse cx="66" cy="210" rx="13" ry="7" fill="${shoes}"/><ellipse cx="94" cy="210" rx="13" ry="7" fill="${shoes}"/>
    <path d="M56 208H76M84 208H104" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>`;

  // Bras (derrière le torse)
  const arm = (x1, x2, col, w) => `<path d="M${x1} 96L${x2} 146" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
  if (longSleeves || armor === 'cotte' || armor === 'armure-lune') s += arm(58, 45, sleeveCol, 13) + arm(102, 115, sleeveCol, 13);
  else s += arm(58, 45, skin, 10) + arm(102, 115, skin, 10) + `<path d="M56 90L46 112L57 116L62 98Z" fill="${shirt}"/><path d="M104 90L114 112L103 116L98 98Z" fill="${shirt}"/>`;
  s += `<circle cx="45" cy="150" r="6.5" fill="${skin}"/><circle cx="115" cy="150" r="6.5" fill="${skin}"/>`;

  // Cou + torse (selon le style du haut)
  s += `<rect x="73" y="74" width="14" height="18" rx="5" fill="${skin}"/><rect x="73" y="74" width="14" height="18" rx="5" fill="#000" opacity=".08"/>`;
  if (top === 'dress') s += `<path d="M56 90Q80 84 104 90L118 188Q80 198 42 188Z" fill="${shirt}"/><path d="M58 128H102" stroke="#fff" stroke-opacity=".4" stroke-width="3"/>`;
  else s += `<path d="${torso}" fill="${shirt}"/>`;
  if (top === 'jacket') s += `<path d="M56 90Q66 88 72 96L70 150L52 150Z" fill="#1f2937" opacity=".85"/><path d="M104 90Q94 88 88 96L90 150L108 150Z" fill="#1f2937" opacity=".85"/>`;
  if (top === 'hoodie') s += `<path d="M66 126H94V142H66Z" fill="#000" opacity=".12" rx="3"/><path d="M74 92V108M86 92V108" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/>`;
  if (top === 'tshirt') s += `<path d="M70 89L80 99L90 89" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.4" stroke-linejoin="round"/>`;
  s += `<rect x="56" y="144" width="48" height="6" rx="2" fill="#000" opacity=".25"/>`;

  // Armure portée sur le torse
  if (armor === 'tunique') s += `<path d="M56 92Q80 86 104 92L108 162L52 162Z" fill="#d6c19a"/><rect x="52" y="140" width="56" height="5" fill="#8b6b3d"/>`;
  if (armor === 'cuir') s += `<path d="M56 91L71 93L68 150L52 150Z" fill="#7c4a2d"/><path d="M104 91L89 93L92 150L108 150Z" fill="#7c4a2d"/><circle cx="68" cy="112" r="1.6" fill="#facc15"/><circle cx="92" cy="112" r="1.6" fill="#facc15"/>`;
  if (armor === 'cotte') s += `<path d="M55 91Q80 85 105 91L109 156L51 156Z" fill="url(#mail${id})" stroke="#4b5563" stroke-width="1"/>`;
  if (armor === 'armure-lune') s += `<path d="M55 91Q80 85 105 91L108 152L52 152Z" fill="url(#plate${id})" stroke="#64748b" stroke-width="1.4"/>
    <ellipse cx="55" cy="94" rx="10" ry="7" fill="url(#plate${id})" stroke="#64748b"/><ellipse cx="105" cy="94" rx="10" ry="7" fill="url(#plate${id})" stroke="#64748b"/>
    <path d="M84 104A10 10 0 1 0 84 124A7.5 7.5 0 1 1 84 104Z" fill="#fbbf24"/>`;
  if (armor === 'cape') s += `<circle cx="66" cy="93" r="3.5" fill="#fbbf24"/><circle cx="94" cy="93" r="3.5" fill="#fbbf24"/><path d="M66 93Q80 99 94 93" stroke="#fbbf24" stroke-width="1.5" fill="none"/>`;

  // Bijou : pendentif (ou anneau à la main)
  if (eq.bijou) {
    if (eq.bijou.id === 'anneau') s += `<circle cx="113" cy="153" r="2.6" fill="none" stroke="#fbbf24" stroke-width="1.6"/>`;
    else s += `<path d="M71 90Q80 104 89 90" fill="none" stroke="#fbbf24" stroke-width="1.2"/><text x="80" y="112" font-size="11" text-anchor="middle">${eq.bijou.icon}</text>`;
  }
  // Bouclier au bras gauche
  if (armor === 'bouclier') s += `<path d="M27 120H55V140Q55 156 41 162Q27 156 27 140Z" fill="#2563eb" stroke="#1e3a8a" stroke-width="2"/><path d="M41 126V154M31 138H51" stroke="#fde047" stroke-width="2.4"/>`;

  // Tête (repère 0-120 décalé), couvre-chef, effets d'évolution
  s += `<g transform="translate(20 4)">${evoBehind(stage, id)}${headLayer(a, skin, hair, eq.tete)}${evoFront(stage)}</g>`;

  // Arme dans la main droite, compagnon aux pieds
  if (eq.arme) {
    const glow = RARE_GLOW[eq.arme.rarity];
    s += `<g transform="rotate(-28 118 146)">${glow ? `<circle cx="122" cy="132" r="16" fill="${glow}" opacity=".2"/>` : ''}<text x="122" y="146" font-size="34" text-anchor="middle">${eq.arme.icon}</text></g>`;
  }
  if (eq.compagnon) s += eq.compagnon.id === 'phenix'
    ? `<text x="28" y="78" font-size="30" text-anchor="middle">${eq.compagnon.icon}</text>`
    : `<text x="28" y="216" font-size="30" text-anchor="middle">${eq.compagnon.icon}</text>`;
  if (Object.values(eq).some((e) => e.rarity === 'legendaire')) s += [[18, 40], [142, 30], [146, 120], [14, 150]].map(([x, y]) => spark(x, y, 4, '#fde68a')).join('');

  const w = Math.round((height * 160) / 240);
  return `<svg class="hero-body" viewBox="0 0 160 240" width="${w}" height="${height}" aria-hidden="true"><defs>${defs}</defs>${s}</svg>`;
}