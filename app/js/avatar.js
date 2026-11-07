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

export const DEFAULT_AVATAR = { skin: 1, hair: 'short', hairColor: 1, eyes: 'dots', outfit: 0, bg: 'lilac', acc: 'none', name: '' };

// type "color" -> la valeur est l'index ; sinon la valeur est l'id
export const CATEGORIES = [
  { key: 'skin', name: 'Peau', items: SKINS, type: 'color' },
  { key: 'hair', name: 'Coiffure', items: HAIRS, type: 'style' },
  { key: 'hairColor', name: 'Couleur des cheveux', items: HAIR_COLORS, type: 'color' },
  { key: 'eyes', name: 'Yeux', items: EYES, type: 'style' },
  { key: 'outfit', name: 'Tenue', items: OUTFITS, type: 'color' },
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
