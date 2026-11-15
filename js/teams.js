// Matchs de hockey dans l'agenda (« Canadiens vs Colorado ») : les noms d'équipes LNH sont remplacés
// par leur logo (mêmes images ESPN que l'onglet LNH). Seulement dans les titres qui ressemblent à un match.

const logo = (abbr) => `https://a.espncdn.com/i/teamlogos/nhl/500/${abbr}.png`;

// Abréviation ESPN → noms possibles (français et anglais : ville, surnom ou les deux)
const TEAMS = {
  mtl: ['Canadiens de Montréal', 'Montreal Canadiens', 'Montréal Canadiens', 'Le Canadien', 'Canadiens', 'Canadien', 'Habs', 'Montréal', 'Montreal', 'CH'],
  tor: ['Maple Leafs de Toronto', 'Toronto Maple Leafs', 'Maple Leafs', 'Leafs', 'Toronto'],
  ott: ['Sénateurs d’Ottawa', "Sénateurs d'Ottawa", 'Ottawa Senators', 'Sénateurs', 'Senators', 'Sens', 'Ottawa'],
  bos: ['Bruins de Boston', 'Boston Bruins', 'Bruins', 'Boston'],
  buf: ['Sabres de Buffalo', 'Buffalo Sabres', 'Sabres', 'Buffalo'],
  det: ['Red Wings de Détroit', 'Detroit Red Wings', 'Red Wings', 'Détroit', 'Detroit'],
  fla: ['Panthers de la Floride', 'Florida Panthers', 'Panthers', 'Floride', 'Florida'],
  tb: ['Lightning de Tampa Bay', 'Tampa Bay Lightning', 'Lightning', 'Tampa Bay', 'Tampa'],
  car: ['Hurricanes de la Caroline', 'Carolina Hurricanes', 'Hurricanes', 'Caroline', 'Carolina'],
  cbj: ['Blue Jackets de Columbus', 'Columbus Blue Jackets', 'Blue Jackets', 'Columbus'],
  nj: ['Devils du New Jersey', 'New Jersey Devils', 'Devils', 'New Jersey'],
  nyi: ['Islanders de New York', 'New York Islanders', 'Islanders'],
  nyr: ['Rangers de New York', 'New York Rangers', 'Rangers'],
  phi: ['Flyers de Philadelphie', 'Philadelphia Flyers', 'Flyers', 'Philadelphie', 'Philadelphia'],
  pit: ['Penguins de Pittsburgh', 'Pittsburgh Penguins', 'Penguins', 'Pingouins', 'Pittsburgh'],
  wsh: ['Capitals de Washington', 'Washington Capitals', 'Capitals', 'Washington'],
  chi: ['Blackhawks de Chicago', 'Chicago Blackhawks', 'Blackhawks', 'Chicago'],
  col: ['Avalanche du Colorado', 'Colorado Avalanche', 'Avalanche', 'Colorado'],
  dal: ['Stars de Dallas', 'Dallas Stars', 'Stars', 'Dallas'],
  min: ['Wild du Minnesota', 'Minnesota Wild', 'Wild', 'Minnesota'],
  nsh: ['Predators de Nashville', 'Nashville Predators', 'Predators', 'Nashville'],
  stl: ['Blues de St. Louis', 'St. Louis Blues', 'Blues', 'St. Louis', 'St-Louis', 'Saint-Louis'],
  wpg: ['Jets de Winnipeg', 'Winnipeg Jets', 'Jets', 'Winnipeg'],
  utah: ['Mammoth de l’Utah', "Mammoth de l'Utah", 'Utah Mammoth', 'Utah Hockey Club', 'Mammoth', 'Utah'],
  ana: ['Ducks d’Anaheim', "Ducks d'Anaheim", 'Anaheim Ducks', 'Ducks', 'Anaheim'],
  cgy: ['Flames de Calgary', 'Calgary Flames', 'Flames', 'Calgary'],
  edm: ['Oilers d’Edmonton', "Oilers d'Edmonton", 'Edmonton Oilers', 'Oilers', 'Edmonton'],
  la: ['Kings de Los Angeles', 'Los Angeles Kings', 'Kings', 'Los Angeles', 'LA'],
  sj: ['Sharks de San Jose', 'San Jose Sharks', 'Sharks', 'San Jose'],
  sea: ['Kraken de Seattle', 'Seattle Kraken', 'Kraken', 'Seattle'],
  van: ['Canucks de Vancouver', 'Vancouver Canucks', 'Canucks', 'Vancouver'],
  vgk: ['Golden Knights de Vegas', 'Vegas Golden Knights', 'Golden Knights', 'Vegas', 'Las Vegas'],
};

const BY_NAME = new Map();
for (const [abbr, names] of Object.entries(TEAMS)) for (const n of names) BY_NAME.set(n.toLowerCase(), { abbr, name: names[0] });
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "(?:'|’|&#39;)");
// Noms les plus longs d'abord : « Canadiens de Montréal » passe avant « Canadiens » et « Montréal »
const NAMES = [...BY_NAME.keys()].sort((a, b) => b.length - a.length);
const RE = new RegExp(`(?<![\\p{L}\\p{N}])(${NAMES.map(reEsc).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
// Un match : « A vs B », « A @ B », « A contre B », « A – B »…
// Avec « vs », « @ » ou « contre », une équipe reconnue suffit ; avec un tiret ou « at », il en faut deux
// (« Souper - Montréal » reste du texte)
const GAME = /\s(vs\.?|versus|contre|@)\s/i;
const MAYBE = /\s(at|[-–—])\s/i;
const MATCH_CASE = new Set(['ch', 'la']); // sigles : seulement en majuscules

/**
 * Titre d'événement (déjà échappé en HTML) où les équipes LNH d'un match sont remplacées par leur logo.
 * Renvoie le texte inchangé si ce n'est pas un match ou si moins d'une équipe est reconnue.
 */
export function withTeamLogos(html) {
  const sure = GAME.test(html);
  if (!sure && !MAYBE.test(html)) return html;
  let found = 0;
  const out = html.replace(RE, (m) => {
    const key = m.replace(/&#39;/g, "'").toLowerCase();
    const t = BY_NAME.get(key) || BY_NAME.get(key.replace(/'/g, '’'));
    if (!t || (MATCH_CASE.has(key) && m !== m.toUpperCase())) return m;
    found++;
    return `<img class="team-logo" src="${logo(t.abbr)}" alt="${t.name}" title="${t.name}" referrerpolicy="no-referrer">`;
  });
  return found >= (sure ? 1 : 2) ? out : html;
}
