// Avatar personnalisable (SVG) — style RPG « Bâtisseur-Entrepreneur » : contours, ombres, chantier et affaires.
// Certains éléments se débloquent en montant de niveau (lvl). Même interface qu'avant :
// avatarSVG (buste rond), heroSVG (corps entier + équipement de l'Aventure), itemArt (illustration d'un objet).

let n = 0;
const OL = '#1b1b22'; // couleur des contours

/** Éclaircit (p > 0) ou fonce (p < 0) une couleur #rrggbb. */
function shade(c, p) {
  if (!/^#[0-9a-f]{6}$/i.test(c)) return c;
  const v = parseInt(c.slice(1), 16);
  const t = p < 0 ? 0 : 255, f = Math.abs(p);
  const ch = (x) => Math.round((t - x) * f + x);
  return '#' + ((1 << 24) + (ch(v >> 16) << 16) + (ch((v >> 8) & 255) << 8) + ch(v & 255)).toString(16).slice(1);
}
const isLight = (c) => { const v = parseInt((c || '#000000').slice(1), 16); return ((v >> 16) * 299 + ((v >> 8) & 255) * 587 + (v & 255) * 114) / 1000 > 160; };

/* =========================================================
   Choix
   ========================================================= */
export const SKINS = ['#ffdbc4', '#f1c7a5', '#e0a97e', '#c68863', '#9a6440', '#6b4329'].map((c) => ({ c }));
export const HAIR_COLORS = [
  { c: '#2b2220' }, { c: '#5a3825' }, { c: '#a0522d' }, { c: '#e3b765' },
  { c: '#d9534f', lvl: 3 }, { c: '#f28dc0', lvl: 4 }, { c: '#5aa9ff', lvl: 6 }, { c: '#c9ccd6', lvl: 8 },
];
export const OUTFITS = [
  { c: '#4f46e5' }, { c: '#0ea5e9' }, { c: '#16a34a' }, { c: '#f97316' },
  { c: '#e11d48', lvl: 2 }, { c: '#1f2937', lvl: 4 }, { c: '#a855f7', lvl: 6 }, { c: '#eab308', lvl: 9 },
  { c: '#b91c1c', name: 'Rouge chantier' }, { c: '#1e3a5f', name: 'Marine' }, { c: '#f5f5f4', name: 'Blanc' }, { c: '#334155', name: 'Anthracite' },
  { c: '#3f6212', name: 'Kaki' }, { c: '#7f1d1d', name: 'Bordeaux', lvl: 3 },
];
export const HAIRS = [
  { id: 'fade', name: 'Dégradé' }, { id: 'slick', name: 'Peigné vers l’arrière' }, { id: 'short', name: 'Court' },
  { id: 'undercut', name: 'Undercut' }, { id: 'buzz', name: 'Ras' }, { id: 'curly', name: 'Bouclé' },
  { id: 'long', name: 'Long' }, { id: 'bun', name: 'Chignon' }, { id: 'none', name: 'Sans' },
  { id: 'ponytail', name: 'Queue de cheval', lvl: 2 }, { id: 'spiky', name: 'En pics', lvl: 3 },
];
export const BEARDS = [
  { id: 'none', name: 'Rasé' }, { id: 'stubble', name: 'Barbe de 3 jours' }, { id: 'short', name: 'Barbe courte' },
  { id: 'goatee', name: 'Bouc' }, { id: 'mustache', name: 'Moustache' }, { id: 'full', name: 'Barbe de bûcheron', lvl: 2 },
];
export const EYES = [
  { id: 'focus', name: 'Déterminé' }, { id: 'dots', name: 'Ronds' }, { id: 'happy', name: 'Joyeux' },
  { id: 'wink', name: 'Clin d’œil', lvl: 2 }, { id: 'star', name: 'Étoiles', lvl: 8 },
];
export const ACCS = [
  { id: 'none', name: 'Aucun' }, { id: 'pencil', name: 'Crayon sur l’oreille' }, { id: 'hardhat', name: 'Casque blanc' },
  { id: 'safety', name: 'Lunettes de sécurité' }, { id: 'cap', name: 'Casquette', lvl: 2 }, { id: 'headphones', name: 'Coquilles antibruit', lvl: 3 },
  { id: 'glasses', name: 'Lunettes', lvl: 4 }, { id: 'aviators', name: 'Verres fumés', lvl: 5 }, { id: 'flower', name: 'Fleur', lvl: 5 },
  { id: 'wizard', name: 'Chapeau de mage', lvl: 7 }, { id: 'crown', name: 'Couronne', lvl: 10 },
];
export const BACKS = [
  { id: 'chantier', name: 'Chantier', g: ['#fcd34d', '#ea580c'], scene: 'crane' },
  { id: 'ville', name: 'Centre-ville', g: ['#1e293b', '#475569'], scene: 'city' },
  { id: 'bureau', name: 'Bureau', g: ['#e2e8f0', '#94a3b8'], scene: 'office' },
  { id: 'lilac', fill: '#e0e7ff' }, { id: 'mint', fill: '#d1fae5' }, { id: 'peach', fill: '#ffe4d6' }, { id: 'sky', fill: '#dbeafe' },
  { id: 'sunset', g: ['#ffb37a', '#ff5e8a'], lvl: 5 }, { id: 'ocean', g: ['#4facfe', '#00c6fb'], lvl: 6 },
  { id: 'forest', g: ['#43e97b', '#2bb38f'], lvl: 8 }, { id: 'galaxy', g: ['#1e1145', '#6b3fd4'], stars: true, lvl: 12 },
];

// Corps entier (Aventure et page du héros)
export const TOPS = [
  { id: 'flannel', name: 'Chemise à carreaux' }, { id: 'suit', name: 'Complet' }, { id: 'shirt', name: 'Chemise et cravate' },
  { id: 'polo', name: 'Polo' }, { id: 'tshirt', name: 'T-shirt' }, { id: 'hoodie', name: 'Chandail à capuchon' },
  { id: 'jacket', name: 'Veste ouverte', lvl: 2 }, { id: 'vest', name: 'Gilet de complet', lvl: 3 }, { id: 'dress', name: 'Robe', lvl: 4 },
];
export const PANTS = [
  { c: '#334155', name: 'Gris' }, { c: '#1e3a8a', name: 'Jeans' }, { c: '#6b4f2a', name: 'Brun travail' }, { c: '#111827', name: 'Noir' },
  { c: '#9ca3af', lvl: 3 }, { c: '#166534', lvl: 5 }, { c: '#7c2d12', lvl: 7 },
  { c: '#a8865a', name: 'Canevas beige' }, { c: '#273142', name: 'Complet anthracite' },
];
export const SHOES = [
  { c: '#1f2937', kind: 'dress', name: 'Souliers chics' }, { c: '#f8fafc', kind: 'sneaker', name: 'Espadrilles' },
  { c: '#7c4a2d', kind: 'boot', name: 'Bottes de travail' }, { c: '#dc2626', kind: 'sneaker', lvl: 3 }, { c: '#2563eb', kind: 'sneaker', lvl: 5 },
  { c: '#d79a2b', kind: 'boot', name: 'Bottes jaunes', lvl: 8 }, { c: '#4a2e1a', kind: 'boot', name: 'Bottes foncées' }, { c: '#5b1f1f', kind: 'dress', name: 'Richelieu bordeaux', lvl: 4 },
];

export const DEFAULT_AVATAR = { skin: 1, hair: 'fade', hairColor: 1, beard: 'short', eyes: 'focus', outfit: 8, bg: 'chantier', acc: 'pencil', name: '', top: 'flannel', pants: 2, shoes: 2 };

/** Looks complets en un clic (les éléments encore verrouillés sont ignorés). */
export const PRESETS = [
  { id: 'worker', name: '👷 Travailleur', cfg: { hair: 'fade', beard: 'short', eyes: 'focus', top: 'flannel', outfit: 8, pants: 2, shoes: 2, acc: 'pencil', bg: 'chantier' } },
  { id: 'business', name: '💼 Homme d’affaires', cfg: { hair: 'slick', beard: 'stubble', eyes: 'focus', top: 'suit', outfit: 9, pants: 8, shoes: 0, acc: 'none', bg: 'ville' } },
  { id: 'foreman', name: '🦺 Contremaître', cfg: { hair: 'undercut', beard: 'goatee', eyes: 'focus', top: 'shirt', outfit: 10, pants: 7, shoes: 6, acc: 'safety', bg: 'bureau' } },
];

// type "color" -> la valeur est l'index ; sinon la valeur est l'id
export const CATEGORIES = [
  { key: 'skin', name: 'Peau', items: SKINS, type: 'color' },
  { key: 'hair', name: 'Coiffure', items: HAIRS, type: 'style' },
  { key: 'hairColor', name: 'Couleur des cheveux et de la barbe', items: HAIR_COLORS, type: 'color' },
  { key: 'beard', name: 'Barbe', items: BEARDS, type: 'style' },
  { key: 'eyes', name: 'Regard', items: EYES, type: 'style' },
  { key: 'top', name: 'Haut', items: TOPS, type: 'style', body: true },
  { key: 'outfit', name: 'Couleur du haut', items: OUTFITS, type: 'color' },
  { key: 'pants', name: 'Pantalon', items: PANTS, type: 'color' },
  { key: 'shoes', name: 'Chaussures', items: SHOES, type: 'color' },
  { key: 'acc', name: 'Accessoire', items: ACCS, type: 'style' },
  { key: 'bg', name: 'Décor', items: BACKS, type: 'bg' },
];

/** Vrai si ce choix est encore verrouillé au niveau donné. */
export function isLocked(key, val, level) {
  const cat = CATEGORIES.find((c) => c.key === key);
  const it = cat && (cat.type === 'color' ? cat.items[val] : cat.items.find((x) => x.id === val));
  return !!(it?.lvl && it.lvl > level);
}

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
const spark = (x, y, r, c = '#fde047') =>
  `<path d="M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z" fill="${c}"/>`;

/* =========================================================
   Tête (repère 0-120, visage centré en 60,56)
   ========================================================= */
const hs = (d, h, extra = '') => `<path d="${d}" fill="${h}" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>${extra}`;
const shine = (d) => `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2.4" stroke-linecap="round"/>`;
const HAIR_TOP = {
  short: (h) => hs('M37 54C34 33 46 24 60 24C74 24 86 33 83 54C80 44 72 38 60 38C48 38 40 44 37 54Z', h, shine('M47 30Q55 26 64 27')),
  fade: (h) => `<path d="M38.5 46C38.5 50 38.5 55 39.5 59L42 58C41 54 41 50 42 46Z" fill="${h}" opacity=".45"/><path d="M81.5 46C81.5 50 81.5 55 80.5 59L78 58C79 54 79 50 78 46Z" fill="${h}" opacity=".45"/>`
    + hs('M39 47C38 30 48 23 60 23C72 23 82 30 81 47C77 39 70 35 60 35C50 35 43 39 39 47Z', h, shine('M48 29Q56 25 66 27')),
  slick: (h) => hs('M37 52C34 30 48 21 62 22C76 23 86 31 83 52C80 42 76 36 70 34C64 32 56 33 50 36C44 39 39 45 37 52Z', h,
    `<path d="M47 33Q58 26 74 30" fill="none" stroke="${shade(h, -0.35)}" stroke-width="1.4"/>` + shine('M52 27Q62 24 72 27')),
  undercut: (h) => `<path d="M38.5 44V58L41 57V44Z M81.5 44V58L79 57V44Z" fill="${h}" opacity=".35"/>`
    + hs('M40 45C38 28 52 20 66 22C78 24 86 33 82 46C78 38 70 33 58 35C50 36 44 40 40 45Z', h, shine('M54 26Q64 23 74 28')),
  buzz: (h) => `<path d="M37 51C38 35 48 30 60 30C72 30 82 35 83 51C76 43 68 39 60 39C52 39 44 43 37 51Z" fill="${h}" opacity=".85" stroke="${OL}" stroke-width="1.4"/>`,
  curly: (h) => [[38, 50], [42, 38], [51, 30], [61, 28], [71, 31], [79, 39], [83, 50]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8.5" fill="${h}" stroke="${OL}" stroke-width="1.6"/>`).join('')
    + `<path d="M37 54C34 33 46 26 60 26C74 26 86 33 83 54C80 44 72 39 60 39C48 39 40 44 37 54Z" fill="${h}"/>`,
  long: (h) => hs('M37 54C34 33 46 24 60 24C74 24 86 33 83 54C80 44 72 38 60 38C48 38 40 44 37 54Z', h),
  ponytail: (h) => hs('M37 54C34 33 46 24 60 24C74 24 86 33 83 54C80 44 72 38 60 38C48 38 40 44 37 54Z', h)
    + `<rect x="74" y="36" width="6" height="7" rx="2" fill="#e11d48" transform="rotate(30 77 39)"/>`,
  bun: (h) => `<circle cx="60" cy="21" r="10" fill="${h}" stroke="${OL}" stroke-width="2"/>` + hs('M37 54C34 33 46 24 60 24C74 24 86 33 83 54C80 44 72 38 60 38C48 38 40 44 37 54Z', h),
  spiky: (h) => hs('M35 57L31 40L42 42L39 27L52 34L56 18L65 32L75 20L77 36L89 33L84 46L85 57C80 46 72 41 60 41C48 41 40 46 35 57Z', h),
  none: () => '',
};
const BACK_HAIR = {
  long: (h) => `<path d="M33 54C32 28 88 28 87 54L90 98C78 104 42 104 30 98Z" fill="${h}" stroke="${OL}" stroke-width="2"/>`,
  ponytail: (h) => `<path d="M77 38C100 44 98 78 86 92C88 72 84 56 73 46Z" fill="${h}" stroke="${OL}" stroke-width="2"/>`,
};

const eyeDot = (x) => `<ellipse cx="${x}" cy="57.5" rx="3" ry="3.4" fill="#1d1d1f"/><circle cx="${x + 1}" cy="56.3" r="1" fill="#fff"/>`;
const arc = (x) => `<path d="M${x - 4} 59Q${x} 54 ${x + 4} 59" fill="none" stroke="#1d1d1f" stroke-width="2.4" stroke-linecap="round"/>`;
const EYE = {
  focus: () => [51, 69].map((x) => eyeDot(x) + `<path d="M${x - 4.5} 54.6Q${x} 53 ${x + 4.5} 54.6" fill="none" stroke="${OL}" stroke-width="1.7" stroke-linecap="round"/>`).join(''),
  dots: () => eyeDot(51) + eyeDot(69),
  happy: () => arc(51) + arc(69),
  wink: () => eyeDot(51) + arc(69),
  star: () => [51, 69].map((x) => `<path d="${starPath(x, 57.5, 5, 2.2)}" fill="#f5b301" stroke="#1d1d1f" stroke-width=".8"/>`).join(''),
};

const MUSTACHE = (h) => `<path d="M51.5 70.5Q55 66.5 60 68.8Q65 66.5 68.5 70.5Q64.5 72.5 60 70.8Q55.5 72.5 51.5 70.5Z" fill="${h}" stroke="${OL}" stroke-width="1.2" stroke-linejoin="round"/>`;
const BEARD = {
  none: () => '',
  stubble: (h) => `<path d="M39 62C39 76 49 85 60 85C71 85 81 76 81 62C78 70 72 75 66 73Q60 71 54 73C48 75 42 70 39 62Z" fill="${h}" opacity=".3"/>`
    + `<path d="M52 70.5Q60 67.5 68 70.5" fill="none" stroke="${h}" stroke-opacity=".4" stroke-width="3" stroke-linecap="round"/>`,
  short: (h) => `<path d="M38.5 60C38 77 48 86.5 60 86.5C72 86.5 82 77 81.5 60C79 69 73 74.5 66 73Q60 71.5 54 73C47 74.5 41 69 38.5 60Z" fill="${h}" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>` + MUSTACHE(h),
  full: (h) => `<path d="M37.5 56C36 82 48 94 60 94C72 94 84 82 82.5 56C80 67 74 74 66 73Q60 71.5 54 73C46 74 40 67 37.5 56Z" fill="${h}" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>`
    + `<path d="M50 84Q60 90 70 84" fill="none" stroke="${shade(h, -0.3)}" stroke-width="1.3"/>` + MUSTACHE(h),
  goatee: (h) => `<path d="M54 75.5Q60 73.5 66 75.5L65 83Q60 88 55 83Z" fill="${h}" stroke="${OL}" stroke-width="1.6" stroke-linejoin="round"/>` + MUSTACHE(h),
  mustache: (h) => MUSTACHE(h),
};

const hardHat = (c, extra = '') => `<path d="M34 46C34 24 46 15 60 15C74 15 86 24 86 46Z" fill="${c}" stroke="${OL}" stroke-width="2.2"/>
  <path d="M55.5 16V45.5H64.5V16Q60 15 55.5 16Z" fill="${shade(c, -0.12)}" stroke="${OL}" stroke-width="1.4"/>
  <path d="M42 33Q45 23 53 19" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>
  <path d="M27 45.5Q60 40.5 93 45.5Q94.5 50.5 88 51Q60 47.5 32 51Q25.5 50.5 27 45.5Z" fill="${shade(c, -0.1)}" stroke="${OL}" stroke-width="2"/>${extra}`;

const ACC = {
  none: () => '',
  pencil: () => `<g transform="rotate(-38 84 50)"><rect x="81" y="38" width="5" height="22" fill="#facc15" stroke="${OL}" stroke-width="1.2"/><path d="M81 60L83.5 65.5L86 60Z" fill="#f1c27d" stroke="${OL}" stroke-width="1"/><rect x="81" y="36" width="5" height="3.5" fill="#f472b6" stroke="${OL}" stroke-width="1"/></g>`,
  hardhat: () => hardHat('#f8fafc'),
  safety: () => `<path d="M38 53H82" stroke="${OL}" stroke-width="2.4"/><path d="M41 52.5H79Q80 61.5 72 62Q66 62 62 58.5H58Q54 62 48 62Q40 61.5 41 52.5Z" fill="#7dd3fc" fill-opacity=".45" stroke="${OL}" stroke-width="1.8" stroke-linejoin="round"/><path d="M45 55L49 55" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>`,
  glasses: () => `<g fill="rgba(255,255,255,.18)" stroke="#222" stroke-width="2"><circle cx="51" cy="57.5" r="7"/><circle cx="69" cy="57.5" r="7"/></g>
    <path d="M58 57.5H62M44 56.5L37 54.5M76 56.5L83 54.5" stroke="#222" stroke-width="2" stroke-linecap="round"/>`,
  aviators: () => `<path d="M43 53.5H57Q58 63 51 63Q44 63 43 53.5ZM63 53.5H77Q76 63 69 63Q62 63 63 53.5Z" fill="#1e293b" stroke="#c9a227" stroke-width="1.6"/><path d="M57 54.5H63M43 54L37 53M77 54L83 53" stroke="#c9a227" stroke-width="1.6"/><path d="M46 56L49 55.5M66 56L69 55.5" stroke="#fff" stroke-opacity=".6" stroke-width="1.2" stroke-linecap="round"/>`,
  cap: () => `<path d="M35 47C35 26 85 26 85 47Z" fill="#e5484d" stroke="${OL}" stroke-width="2"/><path d="M58 45C72 43 92 45 98 50C88 51 70 51 58 49Z" fill="#c2383c" stroke="${OL}" stroke-width="1.6"/><circle cx="60" cy="28" r="2.5" fill="#c2383c"/>`,
  headphones: () => `<path d="M34 58C30 25 90 25 86 58" fill="none" stroke="${OL}" stroke-width="6" stroke-linecap="round"/><path d="M34 58C30 25 90 25 86 58" fill="none" stroke="#f59e0b" stroke-width="3.5" stroke-linecap="round"/>
    <rect x="27" y="49" width="12" height="18" rx="5" fill="#f59e0b" stroke="${OL}" stroke-width="2"/><rect x="81" y="49" width="12" height="18" rx="5" fill="#f59e0b" stroke="${OL}" stroke-width="2"/>`,
  flower: () => [0, 72, 144, 216, 288].map((a) => {
    const r = (a * Math.PI) / 180;
    return `<circle cx="${(81 + 5 * Math.cos(r)).toFixed(1)}" cy="${(38 + 5 * Math.sin(r)).toFixed(1)}" r="4" fill="#f472b6"/>`;
  }).join('') + `<circle cx="81" cy="38" r="3" fill="#fde047"/>`,
  wizard: () => `<path d="M38 42L66 3L84 42Z" fill="#5b3cc4" stroke="${OL}" stroke-width="2"/><ellipse cx="60" cy="42" rx="31" ry="6" fill="#4c2fb0" stroke="${OL}" stroke-width="2"/><path d="${starPath(64, 25, 5, 2.2)}" fill="#fde047"/>`,
  crown: () => `<path d="M40 36L43 18L52 28L60 13L68 28L77 18L80 36Z" fill="#f5b301" stroke="${OL}" stroke-width="1.8" stroke-linejoin="round"/>
    <circle cx="60" cy="29" r="2.6" fill="#e11d48"/><circle cx="49" cy="32" r="2" fill="#3b82f6"/><circle cx="71" cy="32" r="2" fill="#16a34a"/>`,
};

// Couvre-chefs de l'Aventure (même repère que la tête)
const HEADGEAR = {
  bandeau: () => `<path d="M37.5 43C46 38.5 74 38.5 82.5 43V50C74 45.5 46 45.5 37.5 50Z" fill="#ef4444" stroke="${OL}" stroke-width="2"/><path d="M38 46.5C46 42 74 42 82 46.5" stroke="#fff" stroke-width="1.6" fill="none"/>`,
  chapeau: () => `<path d="M41 41C39 25 46 17 60 17C74 17 81 25 79 41Q60 45 41 41Z" fill="#374151" stroke="${OL}" stroke-width="2"/><path d="M52 19Q60 25 68 19" fill="none" stroke="${OL}" stroke-width="1.4"/>
    <path d="M41 35.5Q60 40 79 35.5V41Q60 45 41 41Z" fill="#b45309" stroke="${OL}" stroke-width="1.4"/>
    <path d="M28 40Q60 48 92 40Q94 45 87 47Q60 53 33 47Q26 45 28 40Z" fill="#1f2937" stroke="${OL}" stroke-width="2"/>`,
  casque: () => hardHat('#facc15', `<rect x="68" y="27" width="9" height="7" rx="1.5" fill="#16a34a" stroke="${OL}" stroke-width="1"/><path d="M70 30.5H75" stroke="#fff" stroke-width="1.2"/>`),
  heaume: () => `<path d="M33 52C31 24 89 24 87 52Z" fill="#334155" stroke="${OL}" stroke-width="2.2"/>
    <path d="M37 44Q60 38 83 44" fill="none" stroke="#475569" stroke-width="3"/>
    <rect x="41" y="17" width="38" height="17" rx="4" fill="#1e293b" stroke="${OL}" stroke-width="2"/><rect x="45" y="20" width="30" height="10" rx="2.5" fill="#0f766e"/><path d="M48 22L54 22" stroke="#99f6e4" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="35" cy="48" r="3" fill="#94a3b8" stroke="${OL}" stroke-width="1.2"/><circle cx="85" cy="48" r="3" fill="#94a3b8" stroke="${OL}" stroke-width="1.2"/>`,
  couronne: () => hardHat('#f5b301', `<path d="M60 20L62.5 25.5L60 31L57.5 25.5Z" fill="#e11d48" stroke="${OL}" stroke-width="1"/><circle cx="47" cy="38" r="2.2" fill="#3b82f6" stroke="${OL}" stroke-width=".8"/><circle cx="73" cy="38" r="2.2" fill="#16a34a" stroke="${OL}" stroke-width=".8"/>${spark(80, 20, 4, '#fff')}`),
};
const COVERS_HAIR = new Set(['casque', 'heaume', 'chapeau', 'couronne']);
const ACC_COVERS_HAIR = new Set(['hardhat', 'cap', 'wizard']);

/** Tête complète (repère 0-120). gear = couvre-chef de l'Aventure (remplace l'accessoire). */
function headLayer(a, skin, hair, gear) {
  const covered = COVERS_HAIR.has(gear?.id) || (!gear && ACC_COVERS_HAIR.has(a.acc));
  const skd = shade(skin, -0.2), brow = shade(hair, -0.2);
  const back = covered ? '' : (BACK_HAIR[a.hair] || (() => ''))(hair);
  const top = covered ? (a.hair === 'none' ? '' : `<path d="M38.5 46V56L41 55V46ZM81.5 46V56L79 55V46Z" fill="${hair}" opacity=".6"/>`) : (HAIR_TOP[a.hair] || HAIR_TOP.short)(hair);
  return `${back}
    <ellipse cx="37" cy="60" rx="5" ry="6.5" fill="${skin}" stroke="${OL}" stroke-width="2"/><ellipse cx="83" cy="60" rx="5" ry="6.5" fill="${skin}" stroke="${OL}" stroke-width="2"/>
    <path d="M36.5 57.5Q38.5 60 36.5 63M83.5 57.5Q81.5 60 83.5 63" fill="none" stroke="${skd}" stroke-width="1.4"/>
    <path d="M38 50C38 33 50 27 60 27C70 27 82 33 82 50V62C82 76 72 85 60 85C48 85 38 76 38 62Z" fill="${skin}" stroke="${OL}" stroke-width="2.2"/>
    <path d="M74 80C79 75 82 69 82 62V52C80 64 76 73 68 83Z" fill="#000" opacity=".08"/>
    ${(BEARD[a.beard] || BEARD.none)(hair)}
    <path d="M44.5 50Q50 46.8 55.5 49.3M64.5 49.3Q70 46.8 75.5 50" fill="none" stroke="${brow}" stroke-width="2.8" stroke-linecap="round"/>
    ${(EYE[a.eyes] || EYE.focus)()}
    <path d="M60 57.5Q57.3 64.5 59.4 65.8Q61.4 66.6 63 65.2" fill="none" stroke="${skd}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    ${a.beard === 'full' || a.beard === 'short' ? '' : `<ellipse cx="46" cy="66" rx="4" ry="2.3" fill="#ff7b7b" opacity=".25"/><ellipse cx="74" cy="66" rx="4" ry="2.3" fill="#ff7b7b" opacity=".25"/>`}
    <path d="M55 73Q60 76.5 65 73" fill="none" stroke="#6b2d22" stroke-width="2.2" stroke-linecap="round"/>
    ${top}${gear ? (HEADGEAR[gear.id] || (() => ''))() : (ACC[a.acc] || ACC.none)()}`;
}

/* =========================================================
   Évolution (second cerveau) : aura, anneau, hibou
   ========================================================= */
function owl(stage) {
  const s = stage >= 4 ? 1 : stage >= 3 ? 0.86 : 0.7;
  const gold = stage >= 5;
  const body = gold ? '#e0a526' : '#8b5e3c';
  const belly = gold ? '#fff1c2' : '#e9c99b';
  const glasses = stage >= 4 ? `<g fill="none" stroke="#222" stroke-width="1"><circle cx="-4.5" cy="-4" r="4.8"/><circle cx="4.5" cy="-4" r="4.8"/></g>` : '';
  return `<g transform="translate(91 ${(93 - 13 * s).toFixed(1)}) scale(${s})">
    <path d="M-10 -8L-8 -18L-3 -11ZM10 -8L8 -18L3 -11Z" fill="${body}"/>
    <ellipse cx="0" cy="0" rx="11" ry="13" fill="${body}" stroke="${OL}" stroke-width="1.2"/>
    <ellipse cx="0" cy="5" rx="7" ry="7.5" fill="${belly}"/>
    <circle cx="-4.5" cy="-4" r="4.3" fill="#fff"/><circle cx="4.5" cy="-4" r="4.3" fill="#fff"/>
    <circle cx="-4" cy="-3.6" r="2.1" fill="#1d1d1f"/><circle cx="4" cy="-3.6" r="2.1" fill="#1d1d1f"/>
    <path d="M-1.8 0L1.8 0L0 3.2Z" fill="#f59e0b"/>${glasses}
    ${gold ? spark(-11, -15, 3, '#fff') : ''}</g>`;
}
function evoBack(stage, id) {
  if (stage < 3) return '';
  const [c1, c2] = stage >= 5 ? ['#fde68a', '#a855f7'] : ['#c4b5fd', '#818cf8'];
  return `<radialGradient id="aura${id}"><stop offset=".35" stop-color="${c1}" stop-opacity=".95"/><stop offset=".7" stop-color="${c2}" stop-opacity=".45"/><stop offset="1" stop-color="${c2}" stop-opacity="0"/></radialGradient>`;
}
function evoBehind(stage, id) {
  let out = '';
  if (stage >= 3) out += `<circle cx="60" cy="58" r="50" fill="url(#aura${id})"/>`;
  if (stage >= 4) out += `<ellipse cx="60" cy="40" rx="52" ry="15" fill="none" stroke="#f5b301" stroke-width="1.6" stroke-dasharray="5 4" opacity=".8" transform="rotate(-10 60 40)"/>`;
  return out;
}
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

/* =========================================================
   Décors
   ========================================================= */
function bgDefs(bg, gid) {
  return bg.g ? `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg.g[0]}"/><stop offset="1" stop-color="${bg.g[1]}"/></linearGradient>` : '';
}
/** Silhouette du décor (repère w × h). */
function scene(bg, w, h) {
  const k = w / 160;
  const g = (s) => `<g transform="scale(${k.toFixed(3)})" opacity=".9">${s}</g>`;
  if (bg.scene === 'crane') return g(`<circle cx="36" cy="54" r="18" fill="#fff7d6" opacity=".55"/>
    <path d="M118 ${h / k}V52H124V${h / k}Z" fill="#7c2d12" opacity=".35"/><path d="M70 50H160V56H70Z" fill="#7c2d12" opacity=".35"/>
    <path d="M121 52L104 40H138Z" fill="#7c2d12" opacity=".35"/><path d="M86 56V86" stroke="#7c2d12" stroke-opacity=".4" stroke-width="1.5"/><rect x="80" y="86" width="12" height="9" fill="#7c2d12" opacity=".35"/>
    <path d="M0 ${h / k - 34}H48V${h / k - 70}H70V${h / k - 50}H96V${h / k}H0Z" fill="#9a3412" opacity=".25"/>`);
  if (bg.scene === 'city') return g(`${[[12, 30], [44, 18], [96, 24], [130, 38], [148, 12]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1" fill="#fff" opacity=".7"/>`).join('')}
    <path d="M0 ${h / k}V120H22V96H40V130H56V84H76V140H92V104H112V76H134V118H160V${h / k}Z" fill="#0f172a" opacity=".6"/>
    ${[[26, 104], [30, 112], [62, 92], [66, 100], [62, 116], [98, 112], [116, 84], [122, 92], [116, 100], [140, 124]].map(([x, y]) => `<rect x="${x}" y="${y}" width="3" height="4" fill="#fde68a" opacity=".75"/>`).join('')}`);
  if (bg.scene === 'office') return g(`<rect x="14" y="20" width="132" height="110" rx="3" fill="#fff" opacity=".35"/><path d="M80 20V130M14 75H146" stroke="#64748b" stroke-opacity=".35" stroke-width="3"/>
    <path d="M14 130H146" stroke="#64748b" stroke-opacity=".4" stroke-width="4"/><path d="M30 125V100H44V125M100 125V90H112V125" fill="#94a3b8" opacity=".35"/>`);
  return '';
}

/* =========================================================
   Haut du corps : motif et cravate
   ========================================================= */
function plaid(id, c) {
  const d = shade(c, -0.35), l = shade(c, 0.35);
  return `<pattern id="pl${id}" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="${c}"/>
    <rect x="0" y="5" width="14" height="4" fill="${d}" opacity=".55"/><rect x="5" y="0" width="4" height="14" fill="${d}" opacity=".55"/>
    <path d="M0 2H14M2 0V14" stroke="${l}" stroke-opacity=".5" stroke-width=".8"/></pattern>`;
}
const tieFor = (shirt) => (isLight(shirt) ? '#991b1b' : '#c9a227');

/* =========================================================
   Buste rond (menu, petites vignettes)
   ========================================================= */
export function avatarSVG(cfg = {}, size = 48) {
  const a = { ...DEFAULT_AVATAR, ...cfg };
  const id = ++n;
  const skin = (SKINS[a.skin] || SKINS[0]).c;
  const hair = (HAIR_COLORS[a.hairColor] || HAIR_COLORS[0]).c;
  const shirt = (OUTFITS[a.outfit] || OUTFITS[0]).c;
  const bg = BACKS.find((b) => b.id === a.bg) || BACKS[0];
  let defs = `<clipPath id="avc${id}"><circle cx="60" cy="60" r="60"/></clipPath>` + bgDefs(bg, `avg${id}`) + plaid(id, shirt);
  const bgFill = bg.g ? `url(#avg${id})` : bg.fill;
  const stage = a.evoFx === false ? 0 : Number(a.evo) || 0;
  defs += evoBack(stage, id);
  const stars = bg.stars ? [[20, 25], [95, 18], [102, 70], [14, 78], [28, 52], [92, 44]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#fff" opacity=".85"/>`).join('') : '';
  const fill = a.top === 'flannel' ? `url(#pl${id})` : shirt;
  const shoulders = 'M16 126C16 96 36 84 60 84C84 84 104 96 104 126Z';
  let body = `<path d="${shoulders}" fill="${a.top === 'suit' || a.top === 'vest' ? shirt : fill}" stroke="${OL}" stroke-width="2.2"/>`;
  if (a.top === 'suit') body += `<path d="M51 85L60 108L69 85Z" fill="#f8fafc" stroke="${OL}" stroke-width="1.4"/><path d="M57.5 89H62.5L61.5 92L63.5 112L60 116L56.5 112L58.5 92Z" fill="${tieFor('#fff')}" stroke="${OL}" stroke-width="1"/>
    <path d="M50 85L60 108L52 112L44 92Z" fill="${shade(shirt, -0.2)}" stroke="${OL}" stroke-width="1.4"/><path d="M70 85L60 108L68 112L76 92Z" fill="${shade(shirt, -0.2)}" stroke="${OL}" stroke-width="1.4"/>`;
  else if (a.top === 'vest') body += `<path d="M48 86L60 106L72 86Z" fill="#f8fafc"/><path d="M57.5 88H62.5L61.5 91L63.5 110L60 114L56.5 110L58.5 91Z" fill="#991b1b" stroke="${OL}" stroke-width="1"/>`;
  else if (a.top === 'shirt') body += `<path d="M57.5 89H62.5L61.5 92L63.5 112L60 116L56.5 112L58.5 92Z" fill="${tieFor(shirt)}" stroke="${OL}" stroke-width="1"/><path d="M52 85L60 92L56 96L49 89ZM68 85L60 92L64 96L71 89Z" fill="${shade(shirt, 0.15)}" stroke="${OL}" stroke-width="1.3"/>`;
  else if (a.top === 'flannel' || a.top === 'polo') body += `<path d="M52 85L60 93L56 97L48 89ZM68 85L60 93L64 97L72 89Z" fill="${a.top === 'polo' ? shade(shirt, 0.1) : fill}" stroke="${OL}" stroke-width="1.3"/><path d="M60 93V126" stroke="${OL}" stroke-width="1" stroke-opacity=".6"/>`;
  else if (a.top === 'hoodie') body += `<path d="M44 90Q60 104 76 90" fill="none" stroke="${shade(shirt, -0.3)}" stroke-width="3"/><path d="M55 96V108M65 96V108" stroke="#fff" stroke-opacity=".8" stroke-width="1.6" stroke-linecap="round"/>`;
  else body += `<path d="M51 86Q60 95 69 86" fill="none" stroke="${shade(shirt, -0.3)}" stroke-width="2.4"/>`;
  return `<svg class="avatar" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true"><defs>${defs}</defs>
  <g clip-path="url(#avc${id})"><rect width="120" height="120" fill="${bgFill}"/>${scene(bg, 120, 120)}${stars}${evoBehind(stage, id)}
  ${body}
  <path d="M53 70H67V88Q60 92 53 88Z" fill="${skin}" stroke="${OL}" stroke-width="2"/><path d="M53 76Q60 80 67 76V71H53Z" fill="#000" opacity=".1"/>
  ${headLayer(a, skin, hair, null)}${evoFront(stage)}</g>
  <circle cx="60" cy="60" r="59" fill="none" stroke="${OL}" stroke-opacity=".25" stroke-width="2"/></svg>`;
}

/* =========================================================
   Objets de l'Aventure : dessins réutilisés sur le héros et dans l'inventaire
   ========================================================= */
// Outils tenus en main : repère local, poignée en (0, 0), l'outil monte vers le haut (y négatif)
const TOOL = {
  baton: () => `<rect x="-3.5" y="-46" width="7" height="50" rx="1.5" fill="#facc15" stroke="${OL}" stroke-width="2"/>${[-40, -34, -28, -22, -16, -10, -4].map((y) => `<path d="M-3.5 ${y}H0" stroke="${OL}" stroke-width="1"/>`).join('')}<circle cx="0" cy="-30" r="1.6" fill="${OL}"/><circle cx="0" cy="-12" r="1.6" fill="${OL}"/>`,
  dague: () => `<path d="M-4 -8H4V12Q4 15 0 15Q-4 15 -4 12Z" fill="#f97316" stroke="${OL}" stroke-width="2"/><path d="M-3 -8L-3 -26L5 -18L4 -8Z" fill="#e2e8f0" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/><path d="M-1 -23L2 -20" stroke="#fff" stroke-width="1.2"/>`,
  plume: () => `<rect x="-3" y="-38" width="6" height="40" rx="3" fill="#111827" stroke="${OL}" stroke-width="1.6"/><rect x="1.5" y="-34" width="2" height="14" rx="1" fill="#d4a017"/><rect x="-3" y="-6" width="6" height="3" fill="#d4a017"/><path d="M-2.5 -38L0 -46L2.5 -38Z" fill="#d4a017" stroke="${OL}" stroke-width="1.2"/>`,
  arc: () => `<g transform="rotate(70)"><rect x="-28" y="-6" width="56" height="12" rx="2" fill="#fbbf24" stroke="${OL}" stroke-width="2"/><rect x="-7" y="-3.5" width="14" height="7" rx="3.5" fill="#86efac" stroke="${OL}" stroke-width="1.4"/><circle cx="1" cy="0" r="2" fill="#fff" opacity=".9"/><path d="M-24 -6V6M24 -6V6" stroke="${OL}" stroke-width="1" opacity=".5"/></g>`,
  marteau: () => `<rect x="-3.2" y="-40" width="6.4" height="48" rx="2.5" fill="#b7791f" stroke="${OL}" stroke-width="2"/><path d="M-1 -36V2" stroke="#fde68a" stroke-opacity=".5" stroke-width="1.4"/>
    <path d="M-15 -50H8V-38H-15Z" fill="#94a3b8" stroke="${OL}" stroke-width="2"/><path d="M8 -49Q17 -50 20 -42Q14 -45 8 -40Z" fill="#94a3b8" stroke="${OL}" stroke-width="1.8"/><path d="M-13 -47H5" stroke="#fff" stroke-opacity=".6" stroke-width="1.4"/>`,
  baguette: () => `<rect x="-17" y="-48" width="34" height="44" rx="4" fill="#1f2937" stroke="${OL}" stroke-width="2"/><rect x="-14" y="-45" width="28" height="36" rx="2" fill="#1d4ed8"/>
    <path d="M-10 -39H4V-27H-10ZM4 -33H10M-6 -27V-17H8V-21" fill="none" stroke="#bfdbfe" stroke-width="1.2"/><path d="M-12 -14H-2" stroke="#93c5fd" stroke-width="1"/>`,
  lame: () => `<rect x="-3.5" y="-30" width="7" height="38" rx="3" fill="#9ca3af" stroke="${OL}" stroke-width="2"/><path d="M-9 -44Q-10 -30 0 -30Q10 -30 9 -44L4 -44V-36H-4V-44Z" fill="#cbd5e1" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/><circle cx="0" cy="-14" r="2" fill="#475569"/>`,
  aurore: () => `<circle cx="-3" cy="-44" r="18" fill="#fde68a" opacity=".35"/><rect x="-3.2" y="-40" width="6.4" height="48" rx="2.5" fill="#7c2d12" stroke="${OL}" stroke-width="2"/><path d="M-3.2 -6H3.2M-3.2 -2H3.2" stroke="#fbbf24" stroke-width="1.4"/>
    <path d="M-16 -51H9V-37H-16Z" fill="#fbbf24" stroke="${OL}" stroke-width="2"/><path d="M9 -50Q19 -51 22 -42Q15 -45 9 -39Z" fill="#fbbf24" stroke="${OL}" stroke-width="1.8"/><path d="M-13 -47H6" stroke="#fff" stroke-width="1.6"/>${spark(-20, -56, 4, '#fff')}${spark(14, -58, 3, '#fff')}`,
};

// Bijoux (repère du héros 160 × 240)
const JEWEL = {
  anneau: () => `<rect x="39" y="139" width="13" height="9" rx="2.5" fill="#111827" stroke="${OL}" stroke-width="1.6"/><circle cx="45.5" cy="143.5" r="3" fill="#e5e7eb"/><path d="M45.5 143.5V141.5" stroke="${OL}" stroke-width=".8"/>`,
  pendentif: () => `<path d="M71 90Q80 114 89 90" fill="none" stroke="#2563eb" stroke-width="2.4"/><rect x="73.5" y="110" width="13" height="17" rx="2" fill="#f8fafc" stroke="${OL}" stroke-width="1.6"/><rect x="76" y="113" width="8" height="6" rx="1" fill="#93c5fd"/><path d="M76 122H84M76 124.5H82" stroke="#64748b" stroke-width="1"/>`,
  amulette: () => `<circle cx="93" cy="104" r="4.6" fill="#1d4ed8" stroke="${OL}" stroke-width="1.4"/><circle cx="93" cy="104" r="2.8" fill="#fff"/><circle cx="93" cy="104" r="1.5" fill="#0ea5e9"/><circle cx="93" cy="104" r=".7" fill="#111"/>`,
  sablier: () => `<path d="M72 90Q80 108 88 90" fill="none" stroke="#dc2626" stroke-width="2"/><circle cx="80" cy="117" r="8" fill="#f8fafc" stroke="#dc2626" stroke-width="2.4"/><rect x="78" y="106" width="4" height="3" fill="#dc2626"/><path d="M80 117V112M80 117L83.5 119" stroke="${OL}" stroke-width="1.4" stroke-linecap="round"/>`,
  etoile: () => `<circle cx="115" cy="153" r="3.4" fill="none" stroke="#fbbf24" stroke-width="2"/>${spark(119, 148, 4.5, '#fde68a')}`,
};

// Armures (repère du héros) : sleeve = couleur des manches imposée
const ARMOR = {
  tunique: { draw: () => `<path d="M88 92L99 100M72 92L61 100" stroke="#5b3a1e" stroke-width="2.4"/><path d="M62 104H98L101 172Q80 178 59 172Z" fill="#8b5a2b" stroke="${OL}" stroke-width="2"/><rect x="70" y="128" width="20" height="14" rx="2" fill="#6f4520" stroke="${OL}" stroke-width="1.4"/><path d="M76 128V122" stroke="#facc15" stroke-width="2"/>` },
  cuir: { sleeve: '#a16207', draw: () => `<path d="M57 90Q66 87 73 94L71 152H53Z" fill="#a16207" stroke="${OL}" stroke-width="2"/><path d="M103 90Q94 87 87 94L89 152H107Z" fill="#a16207" stroke="${OL}" stroke-width="2"/>
    <path d="M60 89L71 95L67 104L58 96ZM100 89L89 95L93 104L102 96Z" fill="#5b3a1e" stroke="${OL}" stroke-width="1.4"/><rect x="58" y="118" width="10" height="9" rx="1.5" fill="#92400e" stroke="${OL}" stroke-width="1.2"/><rect x="92" y="118" width="10" height="9" rx="1.5" fill="#92400e" stroke="${OL}" stroke-width="1.2"/>` },
  cotte: { draw: () => `<path d="M58 90L73 93V150H54Z" fill="#c6f432" stroke="${OL}" stroke-width="2"/><path d="M102 90L87 93V150H106Z" fill="#c6f432" stroke="${OL}" stroke-width="2"/>
    <path d="M55 120H73M87 120H105M54 134H73M87 134H106" stroke="#e5e7eb" stroke-width="4"/><path d="M55 120H73M87 120H105M54 134H73M87 134H106" stroke="#94a3b8" stroke-width="1" stroke-dasharray="2 2"/>
    <path d="M64 91V120M96 91V120" stroke="#e5e7eb" stroke-width="3.4"/>` },
  bouclier: { draw: () => `<rect x="52" y="140" width="56" height="10" rx="2" fill="#78350f" stroke="${OL}" stroke-width="2"/><rect x="76" y="141" width="8" height="8" rx="1" fill="none" stroke="#d4a017" stroke-width="2"/>
    <path d="M52 144H64V164Q58 167 52 164Z" fill="#92400e" stroke="${OL}" stroke-width="1.6"/><path d="M96 144H108V162Q102 165 96 162Z" fill="#92400e" stroke="${OL}" stroke-width="1.6"/>
    <rect x="89" y="146" width="9" height="9" rx="2" fill="#facc15" stroke="${OL}" stroke-width="1.4"/><circle cx="93.5" cy="150.5" r="2" fill="${OL}"/><path d="M58 144V132" stroke="#b7791f" stroke-width="3"/><path d="M53 130H63V134H53Z" fill="#94a3b8" stroke="${OL}" stroke-width="1"/>` },
  cape: { sleeve: '#1e293b', draw: () => `<path d="M56 90Q80 84 104 90L108 158L52 158Z" fill="#1e293b" stroke="${OL}" stroke-width="2.2"/><path d="M70 89L80 114L90 89Z" fill="#f8fafc" stroke="${OL}" stroke-width="1.4"/>
    <path d="M77.5 93H82.5L81.5 96L83.5 122L80 126L76.5 122L78.5 96Z" fill="#991b1b" stroke="${OL}" stroke-width="1"/><path d="M69 89L80 114L71 119L62 96ZM91 89L80 114L89 119L98 96Z" fill="#0f172a" stroke="${OL}" stroke-width="1.4"/>
    <circle cx="80" cy="132" r="1.8" fill="#cbd5e1"/><circle cx="80" cy="142" r="1.8" fill="#cbd5e1"/><path d="M92 106H100L98 110H93Z" fill="#f8fafc" stroke="${OL}" stroke-width="1"/>` },
  'armure-lune': { sleeve: '#111827', draw: () => `<path d="M56 90Q80 84 104 90L108 158L52 158Z" fill="#111827" stroke="${OL}" stroke-width="2.2"/><path d="M70 89L80 114L90 89Z" fill="#f8fafc" stroke="${OL}" stroke-width="1.4"/>
    <path d="M69 89L80 114L71 119L62 96ZM91 89L80 114L89 119L98 96Z" fill="#1f2937" stroke="#fbbf24" stroke-width="1.6"/><path d="M55 124H106M54 138H107" stroke="#fbbf24" stroke-width="3"/>
    <path d="M77.5 93H82.5L81.5 96L83.5 122L80 126L76.5 122L78.5 96Z" fill="#fbbf24" stroke="${OL}" stroke-width="1"/><circle cx="94" cy="108" r="5" fill="#fbbf24" stroke="${OL}" stroke-width="1.2"/><path d="M94 104.5L95.2 107.3L98 107.6L95.9 109.4L96.5 112.2L94 110.7L91.5 112.2L92.1 109.4L90 107.6L92.8 107.3Z" fill="#fff"/>` },
};

/* =========================================================
   Corps entier (Aventure, page du héros) + équipement porté
   equip : liste d'objets { slot, id, icon, rarity } (voir rpg-data.js)
   ========================================================= */
const RARE_GLOW = { rare: '#3b82f6', epique: '#a855f7', legendaire: '#f59e0b' };

function shoe(cx, dir, kind, c) {
  const t = `transform="translate(${cx} 0) scale(${dir} 1)"`;
  if (kind === 'boot') return `<g ${t}><path d="M10 194V213H-16Q-21 213 -20 208Q-19 203 -11 202V194Z" fill="${c}" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M10 212H-20.5V217.5H10Z" fill="#2a2a2a" stroke="${OL}" stroke-width="1.6"/><path d="M-4 198H6M-4 202H6M-6 206H5" stroke="${shade(c, 0.45)}" stroke-width="1.3"/><path d="M-17 207Q-14 205 -11 205" stroke="#fff" stroke-opacity=".3" stroke-width="1.5" fill="none"/></g>`;
  if (kind === 'dress') return `<g ${t}><path d="M10 203V213H-18Q-23 212 -17 208Q-11 204 -3 204Z" fill="${c}" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/><path d="M-14 208Q-9 206 -4 206" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" fill="none"/></g>`;
  return `<g ${t}><path d="M10 201V213H-17Q-21 211 -17 206Q-12 202 -3 202Z" fill="${c}" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/><path d="M10 210H-19" stroke="${isLight(c) ? '#94a3b8' : '#f8fafc'}" stroke-width="2.4"/><path d="M-6 204L2 209" stroke="${isLight(c) ? '#2563eb' : '#fff'}" stroke-width="2"/></g>`;
}

export function heroSVG(cfg = {}, equip = [], height = 240) {
  const a = { ...DEFAULT_AVATAR, ...cfg };
  const id = ++n;
  const skin = (SKINS[a.skin] || SKINS[0]).c;
  const hair = (HAIR_COLORS[a.hairColor] || HAIR_COLORS[0]).c;
  const shirt = (OUTFITS[a.outfit] || OUTFITS[0]).c;
  const pants = (PANTS[a.pants] || PANTS[0]).c;
  const sh = SHOES[a.shoes] || SHOES[0];
  const bg = BACKS.find((b) => b.id === a.bg) || BACKS[0];
  const eq = Object.fromEntries(equip.filter(Boolean).map((e) => [e.slot, e]));
  const stage = a.evoFx === false ? 0 : Number(a.evo) || 0;
  const top = a.top;
  let defs = bgDefs(bg, `hbg${id}`) + plaid(id, shirt) + evoBack(stage, id);
  const armor = ARMOR[eq.armure?.id];
  const shirtFill = top === 'flannel' ? `url(#pl${id})` : shirt;
  // Couleur des manches : l'armure (veste, complet) passe devant ; sinon le haut
  const sleeves = armor?.sleeve || (top === 'suit' ? shirt : top === 'vest' ? '#f8fafc' : top === 'shirt' ? shirt : shirtFill);
  const longSleeves = !!armor?.sleeve || ['hoodie', 'jacket', 'suit', 'shirt', 'vest'].includes(top);
  const rolled = !armor?.sleeve && top === 'flannel';

  // Décor, ombre au sol
  let s = `<rect width="160" height="240" rx="18" fill="${bg.g ? `url(#hbg${id})` : bg.fill}"/>${scene(bg, 160, 240)}`;
  if (bg.stars) s += [[20, 25], [140, 18], [132, 90], [14, 120], [36, 60], [128, 160]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#fff" opacity=".85"/>`).join('');
  s += `<ellipse cx="80" cy="220" rx="48" ry="7" fill="#000" opacity=".22"/>`;
  if (eq.armure && RARE_GLOW[eq.armure.rarity]) s += `<ellipse cx="80" cy="122" rx="46" ry="54" fill="${RARE_GLOW[eq.armure.rarity]}" opacity=".14"/>`;
  if (top === 'hoodie') s += `<path d="M62 92Q80 72 98 92Q80 100 62 92Z" fill="${shirt}" stroke="${OL}" stroke-width="2"/>`;

  // Jambes et chaussures
  s += `<path d="M57 146H79L78 204H59Z" fill="${pants}" stroke="${OL}" stroke-width="2.2" stroke-linejoin="round"/><path d="M81 146H103L101 204H82Z" fill="${pants}" stroke="${OL}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M64 152V200M96 152V200" stroke="#000" stroke-opacity=".12" stroke-width="2"/><path d="M60 196H77M83 196H100" stroke="${shade(pants, 0.25)}" stroke-width="1.6" stroke-dasharray="2 2"/>`;
  s += shoe(68, 1, sh.kind || 'sneaker', sh.c) + shoe(92, -1, sh.kind || 'sneaker', sh.c);

  // Bras (contour puis couleur), manches et mains
  const limb = (x1, y1, x2, y2, col, w) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${OL}" stroke-width="${w + 4}" stroke-linecap="round"/><path d="M${x1} ${y1}L${x2} ${y2}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
  const L = [60, 97, 46, 145], R = [100, 97, 114, 145];
  const part = ([x1, y1, x2, y2], t) => [x1, y1, +(x1 + (x2 - x1) * t).toFixed(1), +(y1 + (y2 - y1) * t).toFixed(1)];
  if (longSleeves) s += limb(...L, sleeves, 13) + limb(...R, sleeves, 13);
  else {
    s += limb(...L, skin, 10) + limb(...R, skin, 10);
    const t = rolled ? 0.55 : 0.32;
    s += limb(...part(L, t), sleeves, 14) + limb(...part(R, t), sleeves, 14);
    if (rolled) s += [part(L, 0.55), part(R, 0.55)].map(([, , x, y]) => `<circle cx="${x}" cy="${y}" r="7.5" fill="${shade(shirt, -0.15)}" stroke="${OL}" stroke-width="1.8"/>`).join('');
  }
  if (longSleeves && (top === 'suit' || top === 'shirt' || top === 'vest') && !armor?.sleeve) s += `<path d="M41 141L51 143M109 143L119 141" stroke="#f8fafc" stroke-width="4" stroke-linecap="round"/>`;
  s += `<circle cx="46" cy="149" r="6.5" fill="${skin}" stroke="${OL}" stroke-width="2"/><circle cx="114" cy="149" r="6.5" fill="${skin}" stroke="${OL}" stroke-width="2"/>`;

  // Cou + torse
  s += `<path d="M73 74H87V92Q80 96 73 92Z" fill="${skin}" stroke="${OL}" stroke-width="2"/><path d="M73 79Q80 84 87 79V75H73Z" fill="#000" opacity=".1"/>`;
  const torso = 'M57 90Q80 84 103 90L106 150H54Z';
  if (top === 'dress') s += `<path d="M57 90Q80 84 103 90L118 188Q80 198 42 188Z" fill="${shirt}" stroke="${OL}" stroke-width="2.2"/><path d="M58 128H102" stroke="#fff" stroke-opacity=".4" stroke-width="3"/>`;
  else s += `<path d="${torso}" fill="${top === 'suit' ? shirt : top === 'vest' || top === 'jacket' ? (top === 'vest' ? '#f8fafc' : '#e5e7eb') : shirtFill}" stroke="${OL}" stroke-width="2.2" stroke-linejoin="round"/>`;
  s += `<path d="M94 88Q101 89 103 90L106 150H95Z" fill="#000" opacity=".08"/>`;
  const tie = (c) => `<path d="M77.5 93H82.5L81.5 96L83.5 122L80 126L76.5 122L78.5 96Z" fill="${c}" stroke="${OL}" stroke-width="1.2"/>`;
  const collar = (c) => `<path d="M71 88L80 96L76 101L67 92ZM89 88L80 96L84 101L93 92Z" fill="${c}" stroke="${OL}" stroke-width="1.5" stroke-linejoin="round"/>`;
  if (top === 'tshirt') s += `<path d="M71 89Q80 98 89 89" fill="none" stroke="${shade(shirt, -0.3)}" stroke-width="2.4"/>`;
  if (top === 'polo') s += collar(shade(shirt, 0.12)) + `<path d="M80 96V112" stroke="${OL}" stroke-width="1.2"/><circle cx="80" cy="102" r="1.3" fill="#fff"/><circle cx="80" cy="108" r="1.3" fill="#fff"/>`;
  if (top === 'flannel') s += collar(`url(#pl${id})`) + `<path d="M80 96V146" stroke="${OL}" stroke-width="1.1" stroke-opacity=".7"/>${[104, 116, 128, 140].map((y) => `<circle cx="80" cy="${y}" r="1.4" fill="#f8fafc" stroke="${OL}" stroke-width=".6"/>`).join('')}<rect x="85" y="104" width="12" height="11" rx="1.5" fill="none" stroke="${OL}" stroke-width="1.2" stroke-opacity=".6"/>`;
  if (top === 'shirt') s += tie(tieFor(shirt)) + collar(shade(shirt, 0.12));
  if (top === 'suit') s += `<path d="M70 89L80 114L90 89Z" fill="#f8fafc" stroke="${OL}" stroke-width="1.4"/>${tie(tieFor('#fff'))}<path d="M69 89L80 114L71 119L62 96ZM91 89L80 114L89 119L98 96Z" fill="${shade(shirt, -0.2)}" stroke="${OL}" stroke-width="1.4"/><circle cx="80" cy="132" r="1.8" fill="${shade(shirt, 0.4)}"/><circle cx="80" cy="142" r="1.8" fill="${shade(shirt, 0.4)}"/><path d="M92 106H100L98 110H93Z" fill="#f8fafc" stroke="${OL}" stroke-width="1"/>`;
  if (top === 'vest') s += `<path d="M58 92Q66 90 72 92L80 112L88 92Q94 90 102 92L105 150H55Z" fill="${shirt}" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>${tie('#991b1b')}${[118, 128, 138].map((y) => `<circle cx="80" cy="${y}" r="1.6" fill="${shade(shirt, 0.45)}"/>`).join('')}`;
  if (top === 'jacket') s += `<path d="M71 89Q80 98 89 89" fill="none" stroke="#9ca3af" stroke-width="2.4"/><path d="M57 90Q66 88 72 96L70 150H54Z" fill="${shirt}" stroke="${OL}" stroke-width="2"/><path d="M103 90Q94 88 88 96L90 150H106Z" fill="${shirt}" stroke="${OL}" stroke-width="2"/>`;
  if (top === 'hoodie') s += `<path d="M66 126H94L92 142H68Z" fill="#000" opacity=".12"/><path d="M74 92V108M86 92V108" stroke="#fff" stroke-opacity=".8" stroke-width="1.6" stroke-linecap="round"/>`;
  if (top !== 'dress') s += `<rect x="54" y="144" width="52" height="7" rx="2" fill="#2a2118" stroke="${OL}" stroke-width="1.6"/><rect x="76.5" y="144.8" width="7" height="5.4" rx="1" fill="none" stroke="#d4a017" stroke-width="1.5"/>`;

  // Armure portée, bijou
  if (armor) s += armor.draw();
  if (eq.bijou && JEWEL[eq.bijou.id]) s += JEWEL[eq.bijou.id]();

  // Tête (repère 0-120 décalé) avec couvre-chef et effets d'évolution
  s += `<g transform="translate(20 4)">${evoBehind(stage, id)}${headLayer(a, skin, hair, eq.tete)}${evoFront(stage)}</g>`;

  // Outil dans la main droite, compagnon aux pieds
  if (eq.arme && TOOL[eq.arme.id]) {
    const glow = RARE_GLOW[eq.arme.rarity];
    s += `<g transform="translate(116 150) rotate(16)">${glow ? `<circle cx="0" cy="-26" r="22" fill="${glow}" opacity=".16"/>` : ''}${TOOL[eq.arme.id]()}</g>`;
    s += `<circle cx="114" cy="149" r="6.5" fill="${skin}" stroke="${OL}" stroke-width="2"/>`; // la main passe devant le manche
  }
  if (eq.compagnon) s += eq.compagnon.id === 'phenix'
    ? `<text x="28" y="78" font-size="30" text-anchor="middle">${eq.compagnon.icon}</text>`
    : `<ellipse cx="28" cy="218" rx="14" ry="3.5" fill="#000" opacity=".2"/><text x="28" y="216" font-size="30" text-anchor="middle">${eq.compagnon.icon}</text>`;
  if (Object.values(eq).some((e) => e.rarity === 'legendaire')) s += [[18, 40], [142, 30], [146, 120], [14, 150]].map(([x, y]) => spark(x, y, 4, '#fde68a')).join('');

  const w = Math.round((height * 160) / 240);
  return `<svg class="hero-body" viewBox="0 0 160 240" width="${w}" height="${height}" aria-hidden="true"><defs>${defs}</defs>${s}</svg>`;
}

/* =========================================================
   Illustration d'un objet (inventaire, marchand, coffres)
   ========================================================= */
export function itemArt(it, size = 40) {
  if (!it) return '';
  const svg = (vb, body) => `<svg class="item-art" viewBox="${vb}" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
  if (it.slot === 'arme' && TOOL[it.id]) {
    const vb = { baton: '-20 -46 40 46', dague: '-17 -40 36 38', plume: '-19 -44 38 40', lame: '-20 -48 40 44', arc: '-30 -40 60 40' }[it.id] || '-30 -60 60 70';
    return svg(vb, `<g transform="rotate(${it.id === 'arc' ? -70 : 28} 0 -22)">${TOOL[it.id]()}</g>`);
  }
  if (it.slot === 'tete' && HEADGEAR[it.id]) return svg('24 8 72 50', HEADGEAR[it.id]());
  if (it.slot === 'armure' && ARMOR[it.id]) return svg('38 80 84 96', `<path d="M57 90Q80 84 103 90L106 150H54Z" fill="#d4d4d8" stroke="${OL}" stroke-width="2"/><path d="M73 78H87V92Q80 96 73 92Z" fill="#a1a1aa" stroke="${OL}" stroke-width="2"/>${ARMOR[it.id].draw()}`);
  if (it.slot === 'bijou' && JEWEL[it.id]) {
    const vb = { anneau: '34 132 24 24', pendentif: '64 86 32 44', amulette: '84 95 18 18', sablier: '66 86 28 42', etoile: '104 140 22 22' }[it.id];
    return svg(vb, JEWEL[it.id]());
  }
  return svg('0 0 48 48', `<ellipse cx="24" cy="42" rx="13" ry="3.5" fill="#000" opacity=".18"/><text x="24" y="38" font-size="32" text-anchor="middle">${it.icon}</text>`);
}
