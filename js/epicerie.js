// Épicerie : inventaire (frigo, congélateur, garde-manger), liste d'épicerie par rayon,
// et menus de la semaine (soupers) avec une banque de recettes familiales pour 4 à 6 personnes.
//
// Réglage « epicerie » : { portions, inv: [item], list: [ligne], plan: { lundiISO: { 0..6: idRecette | '_restes' | '_resto' } }, custom: [recette] }
//   item  = { id, name, zone: 'frigo'|'congel'|'garde', qty, unit, exp: 'AAAA-MM-JJ'|'', keep }
//   ligne = { id, name, qty, unit, rayon, done, src: 'menu'|'essentiel'|'' }

import { db } from './db.js';
import * as U from './util.js';

const { esc, iso, uid } = U;
const KEY = 'epicerie';
const BASE_PORTIONS = 5; // les quantités des recettes sont pour 5 portions

export const ZONES = { frigo: ['🧊', 'Frigo'], congel: ['❄️', 'Congélateur'], garde: ['🥫', 'Garde-manger'] };
const RAYONS = {
  legumes: '🥬 Fruits et légumes', viande: '🥩 Viandes et poissons', laitier: '🧀 Produits laitiers et œufs',
  boul: '🍞 Boulangerie', sec: '🥫 Épicerie sèche', surgele: '🧊 Surgelés', autre: '🧴 Autres',
};
const RAYON_ZONE = { legumes: 'frigo', viande: 'frigo', laitier: 'frigo', boul: 'garde', sec: 'garde', surgele: 'congel', autre: 'garde' };
const PROTS = { boeuf: 'Bœuf', poulet: 'Poulet', porc: 'Porc', poisson: 'Poisson', oeufs: 'Œufs', vege: 'Végé' };
const DOW = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const SPECIAL = { _restes: ['🍱', 'Restes'], _resto: ['🥡', 'Resto / livraison'] };

/* ---------- Recettes (quantités pour 5 portions) : [nom, quantité, unité, rayon] ---------- */
const R = (id, n, e, min, prot, ing, steps, base = 'sel, poivre, huile') => ({ id, n, e, min, prot, ing, steps, base });
const RECETTES = [
  R('spag', 'Spaghetti sauce à la viande', '🍝', 45, 'boeuf', [['bœuf haché', 900, 'g', 'viande'], ['spaghetti', 900, 'g', 'sec'], ['tomates en dés', 2, 'boîte', 'sec'], ['pâte de tomate', 1, 'boîte', 'sec'], ['oignon', 1, '', 'legumes'], ['ail', 3, 'gousse', 'legumes'], ['carottes', 2, '', 'legumes'], ['céleri', 2, 'branche', 'legumes'], ['parmesan', 100, 'g', 'laitier']],
    ['Faire revenir l’oignon, l’ail, les carottes et le céleri hachés finement.', 'Ajouter le bœuf et le défaire jusqu’à ce qu’il soit cuit.', 'Ajouter les tomates et la pâte de tomate, assaisonner et mijoter 30 min.', 'Cuire les pâtes et servir avec le parmesan. Le reste de sauce se congèle très bien.'], 'sel, poivre, huile, origan, basilic'),
  R('chinois', 'Pâté chinois', '🥧', 50, 'boeuf', [['bœuf haché', 900, 'g', 'viande'], ['pommes de terre', 2000, 'g', 'legumes'], ['maïs en crème', 1, 'boîte', 'sec'], ['maïs en grains', 1, 'boîte', 'sec'], ['oignon', 1, '', 'legumes'], ['lait', 125, 'ml', 'laitier'], ['beurre', 60, 'g', 'laitier']],
    ['Cuire les pommes de terre et les réduire en purée avec le lait et le beurre.', 'Faire revenir l’oignon et le bœuf, assaisonner.', 'Dans un grand plat : le bœuf, le maïs en grains mêlé au maïs en crème, puis la purée.', 'Four à 190 °C (375 °F) pendant 25 à 30 min.']),
  R('tacos', 'Tacos au poulet', '🌮', 35, 'poulet', [['poitrines de poulet', 1000, 'g', 'viande'], ['tortillas', 2, 'paquet', 'boul'], ['poivrons', 2, '', 'legumes'], ['oignon', 1, '', 'legumes'], ['laitue', 1, '', 'legumes'], ['tomates', 3, '', 'legumes'], ['fromage râpé', 300, 'g', 'laitier'], ['crème sure', 250, 'ml', 'laitier'], ['salsa', 1, 'pot', 'sec'], ['assaisonnement à tacos', 1, 'sachet', 'sec']],
    ['Couper le poulet en lanières et le saisir avec l’assaisonnement.', 'Ajouter les poivrons et l’oignon émincés, cuire 5 min.', 'Mettre laitue, tomates, fromage, crème sure et salsa sur la table : chacun garnit ses tacos.']),
  R('roti', 'Cuisses de poulet et légumes rôtis', '🍗', 60, 'poulet', [['cuisses de poulet', 2000, 'g', 'viande'], ['pommes de terre', 1500, 'g', 'legumes'], ['carottes', 6, '', 'legumes'], ['oignons', 2, '', 'legumes'], ['brocoli', 1, '', 'legumes']],
    ['Four à 200 °C (400 °F).', 'Couper pommes de terre, carottes et oignons ; les mélanger avec l’huile et les épices sur une grande plaque.', 'Déposer les cuisses assaisonnées par-dessus et cuire 45 à 50 min.', 'Ajouter le brocoli pour les 15 dernières minutes.'], 'sel, poivre, huile, paprika, herbes'),
  R('chili', 'Chili con carne et riz', '🌶️', 45, 'boeuf', [['bœuf haché', 900, 'g', 'viande'], ['haricots rouges', 2, 'boîte', 'sec'], ['tomates en dés', 2, 'boîte', 'sec'], ['poivrons', 2, '', 'legumes'], ['oignon', 1, '', 'legumes'], ['maïs en grains', 1, 'boîte', 'sec'], ['riz', 500, 'g', 'sec'], ['fromage râpé', 200, 'g', 'laitier']],
    ['Faire revenir l’oignon et les poivrons, puis le bœuf.', 'Ajouter les tomates, les haricots rincés, le maïs et les épices ; mijoter 25 min.', 'Servir sur le riz avec du fromage râpé.'], 'sel, huile, poudre de chili, cumin'),
  R('pizza', 'Pizza maison', '🍕', 30, 'porc', [['pâte à pizza', 2, '', 'boul'], ['sauce à pizza', 1, 'pot', 'sec'], ['mozzarella', 450, 'g', 'laitier'], ['pepperoni', 200, 'g', 'viande'], ['poivron', 1, '', 'legumes'], ['champignons', 227, 'g', 'legumes']],
    ['Four à 230 °C (450 °F).', 'Étendre la pâte, ajouter la sauce, les garnitures et le fromage.', 'Cuire 12 à 15 min. Les enfants peuvent garnir leur coin.'], 'huile, origan'),
  R('macaroni', 'Macaroni au fromage, jambon et brocoli', '🧀', 40, 'porc', [['macaronis', 900, 'g', 'sec'], ['cheddar', 500, 'g', 'laitier'], ['lait', 1000, 'ml', 'laitier'], ['beurre', 60, 'g', 'laitier'], ['jambon', 300, 'g', 'viande'], ['brocoli', 1, '', 'legumes']],
    ['Cuire les pâtes et le brocoli en morceaux.', 'Faire fondre le beurre, ajouter 60 ml de farine puis le lait en fouettant jusqu’à épaississement.', 'Ajouter le cheddar râpé hors du feu, puis les pâtes, le jambon en dés et le brocoli.', 'Gratiner 10 min au four si désiré.'], 'sel, poivre, farine'),
  R('saumon', 'Saumon, riz et brocoli', '🐟', 30, 'poisson', [['filets de saumon', 1000, 'g', 'viande'], ['riz', 500, 'g', 'sec'], ['brocoli', 2, '', 'legumes'], ['citron', 1, '', 'legumes']],
    ['Four à 200 °C (400 °F). Cuire le riz.', 'Badigeonner le saumon de sauce soya et de miel, cuire 12 à 15 min.', 'Cuire le brocoli à la vapeur et servir avec des quartiers de citron.'], 'sel, poivre, sauce soya, miel'),
  R('saute', 'Sauté de bœuf et légumes', '🥢', 25, 'boeuf', [['lanières de bœuf', 800, 'g', 'viande'], ['nouilles chinoises', 500, 'g', 'sec'], ['poivrons', 2, '', 'legumes'], ['brocoli', 1, '', 'legumes'], ['carottes', 2, '', 'legumes'], ['sauce à sauté', 1, 'bouteille', 'sec'], ['ail', 2, 'gousse', 'legumes']],
    ['Cuire les nouilles.', 'Saisir le bœuf à feu vif par petites quantités, réserver.', 'Sauter les légumes et l’ail 4 à 5 min, remettre le bœuf, ajouter la sauce et les nouilles.'], 'huile'),
  R('soupe', 'Soupe-repas poulet et nouilles', '🍜', 45, 'poulet', [['poitrines de poulet', 700, 'g', 'viande'], ['bouillon de poulet', 2000, 'ml', 'sec'], ['nouilles aux œufs', 375, 'g', 'sec'], ['carottes', 3, '', 'legumes'], ['céleri', 3, 'branche', 'legumes'], ['oignon', 1, '', 'legumes'], ['pain croûté', 1, '', 'boul']],
    ['Faire revenir l’oignon, les carottes et le céleri.', 'Ajouter le bouillon et le poulet entier, mijoter 20 min puis effilocher le poulet.', 'Ajouter les nouilles 8 min avant de servir. Avec du pain croûté.'], 'sel, poivre, huile, thym'),
  R('burgers', 'Burgers maison et frites', '🍔', 30, 'boeuf', [['bœuf haché', 1000, 'g', 'viande'], ['pains à hamburger', 10, '', 'boul'], ['cheddar en tranches', 1, 'paquet', 'laitier'], ['laitue', 1, '', 'legumes'], ['tomates', 2, '', 'legumes'], ['oignon', 1, '', 'legumes'], ['frites surgelées', 1000, 'g', 'surgele']],
    ['Façonner 10 boulettes assaisonnées.', 'Mettre les frites au four selon l’emballage.', 'Griller les boulettes 4 à 5 min par côté, ajouter le fromage à la fin.', 'Monter les burgers à table.'], 'sel, poivre, ketchup, moutarde, mayonnaise'),
  R('pilons', 'Pilons BBQ et salade de chou', '🍗', 50, 'poulet', [['pilons de poulet', 2000, 'g', 'viande'], ['sauce BBQ', 1, 'bouteille', 'sec'], ['pommes de terre', 1500, 'g', 'legumes'], ['chou', 1, '', 'legumes'], ['carottes', 2, '', 'legumes']],
    ['Four à 200 °C (400 °F). Cuire les pilons 35 min, badigeonner de sauce BBQ et cuire 10 min de plus.', 'Rôtir les pommes de terre en quartiers sur une autre plaque.', 'Râper le chou et les carottes, mélanger avec mayonnaise, vinaigre, sel et sucre.'], 'sel, poivre, huile, mayonnaise, vinaigre'),
  R('lasagne', 'Lasagne à la viande', '🍝', 90, 'boeuf', [['pâtes à lasagne', 1, 'boîte', 'sec'], ['bœuf haché', 900, 'g', 'viande'], ['sauce tomate', 2, 'pot', 'sec'], ['ricotta', 475, 'g', 'laitier'], ['mozzarella', 450, 'g', 'laitier'], ['épinards', 1, 'sac', 'legumes'], ['oignon', 1, '', 'legumes']],
    ['Cuire le bœuf et l’oignon, ajouter la sauce tomate.', 'Monter en couches : sauce, pâtes, ricotta mêlée aux épinards, mozzarella.', 'Couvrir et cuire 45 min à 180 °C (350 °F), découvrir 15 min. Se prépare la veille ou se congèle.'], 'sel, poivre, huile, basilic'),
  R('cremeuses', 'Pâtes crémeuses poulet et brocoli', '🍝', 30, 'poulet', [['pennes', 900, 'g', 'sec'], ['poitrines de poulet', 800, 'g', 'viande'], ['brocoli', 1, '', 'legumes'], ['crème 15 % à cuisson', 500, 'ml', 'laitier'], ['parmesan', 100, 'g', 'laitier'], ['ail', 3, 'gousse', 'legumes']],
    ['Cuire les pâtes avec le brocoli les 3 dernières minutes.', 'Saisir le poulet en cubes, ajouter l’ail.', 'Ajouter la crème et le parmesan, laisser épaissir, puis mélanger avec les pâtes.']),
  R('porc', 'Côtelettes de porc, purée et haricots', '🥩', 45, 'porc', [['côtelettes de porc', 1500, 'g', 'viande'], ['pommes de terre', 2000, 'g', 'legumes'], ['haricots verts', 500, 'g', 'legumes'], ['lait', 125, 'ml', 'laitier'], ['beurre', 60, 'g', 'laitier']],
    ['Cuire les pommes de terre et faire une purée avec le lait et le beurre.', 'Assaisonner les côtelettes et les cuire 4 à 5 min par côté.', 'Cuire les haricots verts à la vapeur.'], 'sel, poivre, huile, épices à steak'),
  R('hotdogs', 'Soirée hot-dogs et salade de chou', '🌭', 20, 'porc', [['saucisses à hot-dog', 2, 'paquet', 'viande'], ['pains à hot-dog', 2, 'paquet', 'boul'], ['chou', 1, '', 'legumes'], ['carottes', 2, '', 'legumes']],
    ['Râper le chou et les carottes, mélanger avec mayonnaise, vinaigre, sel et sucre.', 'Cuire les saucisses (eau bouillante ou BBQ) et réchauffer les pains.'], 'mayonnaise, vinaigre, moutarde, relish'),
  R('rizfrit', 'Riz frit au jambon et aux œufs', '🍳', 25, 'oeufs', [['riz', 600, 'g', 'sec'], ['jambon', 400, 'g', 'viande'], ['œufs', 6, '', 'laitier'], ['petits pois surgelés', 500, 'g', 'surgele'], ['oignons verts', 1, 'botte', 'legumes']],
    ['Cuire le riz (idéalement la veille : il frit mieux froid).', 'Brouiller les œufs dans un grand poêlon, réserver.', 'Sauter le jambon, les pois et le riz, ajouter la sauce soya, les œufs et les oignons verts.'], 'huile, sauce soya'),
  R('thon', 'Pâtes au thon gratinées', '🐟', 35, 'poisson', [['thon', 3, 'boîte', 'sec'], ['rotinis', 900, 'g', 'sec'], ['crème de champignons', 2, 'boîte', 'sec'], ['petits pois surgelés', 500, 'g', 'surgele'], ['fromage râpé', 200, 'g', 'laitier']],
    ['Cuire les pâtes avec les petits pois les 2 dernières minutes.', 'Mélanger avec le thon égoutté et la crème de champignons allongée d’un peu de lait.', 'Couvrir de fromage et gratiner 10 min au four.'], 'sel, poivre, lait'),
  R('boulettes', 'Boulettes sauce brune et purée', '🥔', 50, 'boeuf', [['bœuf haché', 1000, 'g', 'viande'], ['œufs', 2, '', 'laitier'], ['sauce brune', 2, 'sachet', 'sec'], ['pommes de terre', 2000, 'g', 'legumes'], ['carottes', 6, '', 'legumes']],
    ['Mélanger le bœuf, les œufs, 125 ml de chapelure et les épices ; former des boulettes.', 'Les dorer puis les mijoter 20 min dans la sauce brune.', 'Servir avec la purée et les carottes cuites.'], 'sel, poivre, chapelure, huile'),
  R('painviande', 'Pain de viande', '🍞', 70, 'boeuf', [['bœuf haché', 1000, 'g', 'viande'], ['œufs', 2, '', 'laitier'], ['oignon', 1, '', 'legumes'], ['pommes de terre', 1500, 'g', 'legumes'], ['haricots verts', 500, 'g', 'legumes']],
    ['Mélanger le bœuf, les œufs, l’oignon haché, 125 ml de chapelure et les épices.', 'Mouler dans un plat, couvrir de ketchup, cuire 60 min à 180 °C (350 °F).', 'Rôtir les pommes de terre en même temps ; haricots verts à la vapeur.'], 'sel, poivre, chapelure, ketchup'),
  R('quiche', 'Quiche jambon-fromage et salade', '🥚', 60, 'oeufs', [['croûtes à tarte', 2, '', 'surgele'], ['œufs', 8, '', 'laitier'], ['lait', 250, 'ml', 'laitier'], ['jambon', 300, 'g', 'viande'], ['fromage suisse', 300, 'g', 'laitier'], ['laitue', 1, '', 'legumes'], ['tomates', 2, '', 'legumes'], ['concombre', 1, '', 'legumes']],
    ['Four à 190 °C (375 °F).', 'Répartir le jambon et le fromage dans les croûtes, verser les œufs battus avec le lait.', 'Cuire 35 à 40 min. Servir avec une salade.'], 'sel, poivre, vinaigrette'),
  R('crepes', 'Déjeuner pour souper (crêpes et bacon)', '🥞', 40, 'oeufs', [['œufs', 6, '', 'laitier'], ['lait', 1000, 'ml', 'laitier'], ['bacon', 500, 'g', 'viande'], ['petits fruits', 2, 'casseau', 'legumes']],
    ['Fouetter 500 ml de farine, les œufs, le lait, une pincée de sel et un peu de sucre.', 'Cuire les crêpes dans un poêlon beurré ; le bacon au four 15 min à 200 °C (400 °F).', 'Servir avec les fruits et le sirop d’érable.'], 'farine, sucre, beurre, sirop d’érable'),
  R('beurre', 'Poulet au beurre, riz et naans', '🍛', 40, 'poulet', [['hauts de cuisse de poulet désossés', 1200, 'g', 'viande'], ['sauce poulet au beurre', 2, 'pot', 'sec'], ['riz basmati', 600, 'g', 'sec'], ['pains naan', 2, 'paquet', 'boul']],
    ['Cuire le riz.', 'Dorer le poulet en cubes, ajouter la sauce et mijoter 15 min.', 'Réchauffer les naans au four quelques minutes.'], 'huile'),
  R('plaque', 'Saucisses, grelots et légumes sur une plaque', '🌭', 45, 'porc', [['saucisses italiennes', 1000, 'g', 'viande'], ['pommes de terre grelots', 1500, 'g', 'legumes'], ['poivrons', 3, '', 'legumes'], ['oignons', 2, '', 'legumes'], ['courgettes', 2, '', 'legumes']],
    ['Four à 200 °C (400 °F).', 'Couper les grelots en deux, les légumes en morceaux et les saucisses en tronçons.', 'Tout étaler sur deux plaques avec huile et épices, cuire 35 à 40 min en brassant à mi-cuisson.'], 'sel, poivre, huile, herbes italiennes'),
  R('burritos', 'Burritos aux haricots noirs', '🌯', 30, 'vege', [['haricots noirs', 2, 'boîte', 'sec'], ['riz', 400, 'g', 'sec'], ['tortillas', 1, 'paquet', 'boul'], ['maïs en grains', 1, 'boîte', 'sec'], ['poivrons', 2, '', 'legumes'], ['fromage râpé', 300, 'g', 'laitier'], ['salsa', 1, 'pot', 'sec']],
    ['Cuire le riz.', 'Faire revenir les poivrons, ajouter les haricots rincés, le maïs, la moitié de la salsa et les épices.', 'Garnir les tortillas de riz, de garniture et de fromage ; rouler et dorer 2 min par côté.'], 'sel, huile, cumin, poudre de chili'),
];

/* ---------- Texte : comparaison d'ingrédients et rayon deviné ---------- */
const fold = (s = '') => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae').toLowerCase();
const STOP = new Set(['de', 'du', 'des', 'd', 'l', 'la', 'le', 'les', 'en', 'au', 'aux', 'a', 'et', 'ou', 'un', 'une', 'pour']);
const SYN = { patate: ['pomme', 'terre'], patates: ['pomme', 'terre'], hamburger: ['hamburger'] };
const tokens = (s) => fold(s).split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w))
  .flatMap((w) => SYN[w] || [w]).map((w) => (w.length > 3 ? w.replace(/[sx]$/, '') : w));
// Mots qui changent la nature de l'ingrédient : « sauce tomate » n'est pas « tomates »
const HEADS = new Set(['sauce', 'creme', 'soupe', 'bouillon', 'pate', 'jus', 'mai', 'nouille', 'poudre', 'pain']);
/** Vrai si l'article d'inventaire « a » correspond à l'ingrédient « b » (ou l'inverse). */
export function same(a, b) {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  const [s, l] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (!s.every((w) => l.includes(w))) return false;
  return !(HEADS.has(l[0]) && !s.includes(l[0]));
}
const GUESS = [
  [/beurre d.arachide|creme de champignon|mais en creme|tomates en des|pate de tomate|\bsauce|bouillon|conserve|en boite/, 'sec'],
  [/surgel|congel|\bfrites|creme glacee|croute/, 'surgele'],
  [/boeuf|poulet|\bporc|jambon|bacon|saucisse|dinde|saumon|poisson|crevette|cotelette|pilon|steak|\bveau|agneau|pepperoni|lanieres|charcuterie|salami/, 'viande'],
  [/\blait\b|fromage|cheddar|mozzarella|parmesan|ricotta|yogourt|yaourt|beurre|\bcreme|oeuf|suisse/, 'laitier'],
  [/\bpains?\b|tortilla|naan|bagel|baguette|muffin|pate a pizza|brioche|croissant/, 'boul'],
  [/pomme|banane|orange|citron|fraise|bleuet|raisin|fruit|laitue|salade|tomate|concombre|carotte|celeri|oignon|\bail\b|poivron|brocoli|chou|courgette|champignon|epinard|patate|haricots verts|avocat|\blime|persil|coriandre|melon|poire|legume|grelot|ananas|mangue|kiwi|navet|radis|asperge|chou-fleur|patate douce/, 'legumes'],
  [/pates|spaghetti|macaroni|penne|lasagne|rotini|\briz\b|farine|sucre|cereale|haricots|pois chiche|lentille|\bthon|huile|vinaigre|epice|assaisonnement|ketchup|moutarde|mayonnaise|salsa|chapelure|nouille|biscuit|craquelin|\bcafe|\bthe\b|sirop|confiture|soupe|\bmais\b|croustille|collation|gruau|miel|noix|beurre/, 'sec'],
  [/savon|detergent|papier|essuie|sac|pellicule|dentifrice|shampo|couche|lingette|aluminium/, 'autre'],
];
export const rayonOf = (name) => { const f = fold(name); return (GUESS.find(([re]) => re.test(f)) || [, 'autre'])[1]; };

/* ---------- Quantités ---------- */
const UNITS = { g: 'g', kg: 'kg', ml: 'ml', l: 'l', lb: 'lb', boite: 'boîte', boites: 'boîte', paquet: 'paquet', paquets: 'paquet', pot: 'pot', pots: 'pot', sac: 'sac', sacs: 'sac', bouteille: 'bouteille', bouteilles: 'bouteille', douzaine: 'douzaine', douzaines: 'douzaine', sachet: 'sachet', sachets: 'sachet', botte: 'botte', bottes: 'botte', casseau: 'casseau', casseaux: 'casseau', x: '' };
const PLURAL = new Set(['boîte', 'paquet', 'pot', 'sac', 'bouteille', 'douzaine', 'sachet', 'botte', 'gousse', 'branche']);
const num = (q) => (Math.round(q * 10) / 10).toLocaleString('fr-CA');
export function fmtQty(q, u = '') {
  if (!q) return '';
  if (u === 'g' && q >= 1000) return `${num(q / 1000)} kg`;
  if (u === 'ml' && q >= 1000) return `${num(q / 1000)} l`;
  if (u === 'casseau') return `${num(q)} ${q > 1 ? 'casseaux' : 'casseau'}`;
  return `${num(q)}${u ? ` ${u}${q > 1 && PLURAL.has(u) ? 's' : ''}` : ''}`;
}
/** « 2 l lait », « lait 2l », « 500 g bœuf haché », « 3 x pommes » → { name, qty, unit } */
export function parseItem(txt) {
  const t = String(txt).trim().replace(/\s+/g, ' ');
  const U_RE = '(kg|g|ml|l|lb|bo[iî]tes?|paquets?|pots?|sacs?|bouteilles?|douzaines?|sachets?|bottes?|casseaux?|x)';
  let m = t.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*${U_RE}?\\.?\\s+(?:(?:de|d’|d')\\s*)?(.+)$`, 'i'));
  if (m) return { qty: +m[1].replace(',', '.'), unit: UNITS[fold(m[2] || 'x')] ?? '', name: cleanName(m[3]) };
  m = t.match(new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*${U_RE}?$`, 'i'));
  if (m) return { qty: +m[2].replace(',', '.'), unit: UNITS[fold(m[3] || 'x')] ?? '', name: cleanName(m[1]) };
  return { qty: 0, unit: '', name: cleanName(t) };
}
const cleanName = (s) => { const x = s.trim().replace(/^[-•*]\s*/, ''); return x.charAt(0).toUpperCase() + x.slice(1); };
/** Quantité ramenée en g ou ml pour comparer (null si inconnue ou en unités comptées). */
function toBase(q, u = '') {
  if (!q) return null;
  const m = { g: [1, 'g'], kg: [1000, 'g'], lb: [454, 'g'], ml: [1, 'ml'], l: [1000, 'ml'] }[u];
  return m ? { q: q * m[0], u: m[1] } : null;
}
function scale(q, u, f) {
  if (!q) return 0;
  const v = q * f;
  if (u === 'g' || u === 'ml') return Math.max(50, Math.ceil(v / 50) * 50);
  if (u === 'kg' || u === 'l' || u === 'lb') return Math.ceil(v * 4) / 4;
  return Math.max(1, Math.ceil(v - 0.2));
}

/* ---------- Données ---------- */
let S = null;
async function load() {
  const v = (await db.get('settings', KEY)) || {};
  S = { portions: 5, inv: [], list: [], plan: {}, custom: [], ...v };
  return S;
}
const save = () => db.put('settings', S, KEY);
const recipes = () => [...RECETTES, ...(S.custom || [])];
const recipe = (id) => recipes().find((r) => r.id === id);
const daysLeft = (exp) => (exp ? Math.round((U.parseISO(exp) - U.startOfDay(new Date())) / 864e5) : null);
const soon = (it) => { const d = daysLeft(it.exp); return d !== null && d <= 3; };
const inStock = (name) => S.inv.find((i) => same(i.name, name));
const wkKey = (off = 0) => iso(U.addDays(U.startOfWeek(new Date()), off * 7));
const stockRatio = (r) => [r.ing.filter(([n]) => inStock(n)).length, r.ing.length];

function addToList(name, qty = 0, unit = '', src = '', rayon) {
  const ex = S.list.find((l) => !l.done && same(l.name, name) && (l.unit || '') === (unit || ''));
  if (ex) { if (qty) ex.qty = (ex.qty || 0) + qty; return false; }
  S.list.push({ id: uid(), name: cleanName(name), qty, unit, rayon: rayon || rayonOf(name), done: false, src });
  return true;
}

/* ---------- Suggestions de menus ---------- */
function pickRecipe(plan, day, wk) {
  const taken = new Set(Object.values(plan));
  const prots = {};
  const claimed = new Set();
  for (const id of Object.values(plan)) {
    const r = recipe(id);
    if (!r) continue;
    prots[r.prot] = (prots[r.prot] || 0) + 1;
    for (const [n] of r.ing) { const it = inStock(n); if (it) claimed.add(it.id); }
  }
  // Recettes des 2 semaines précédentes : on évite de les refaire tout de suite
  const recent = new Set([-1, -2].flatMap((o) => Object.values(S.plan[iso(U.addDays(U.parseISO(wk), o * 7))] || {})));
  const scored = recipes().filter((r) => !taken.has(r.id)).map((r) => {
    let s = Math.random() * 2.5;
    // Un article en stock déjà utilisé par un autre souper de la semaine ne compte presque plus
    for (const [n] of r.ing) { const it = inStock(n); if (it) s += claimed.has(it.id) ? 0.3 : soon(it) ? 4 : 1.5; }
    if (recent.has(r.id)) s -= 4;
    s -= (prots[r.prot] || 0) * 4;
    if (day < 4 && r.min > 50) s -= 2; // soirs de semaine : plus rapide
    return [s, r.id];
  }).sort((a, b) => b[0] - a[0]);
  return scored[0]?.[1];
}

/* ---------- Page ---------- */
let tab = 'menus', wkOff = 0, protF = '';

export async function renderPage(ctx, t) {
  if (t && ['inventaire', 'liste', 'menus'].includes(t)) tab = t;
  await load();
  // Les gestionnaires posés sur la vue ne doivent pas survivre au changement de page
  ctx.setCleanup(() => { ctx.view.onclick = ctx.view.onchange = ctx.view.onsubmit = null; });
  draw(ctx);
}

function draw(ctx) {
  const { view } = ctx;
  const toBuy = S.list.filter((l) => !l.done).length;
  if (location.hash.startsWith('#/epicerie') && location.hash !== `#/epicerie/${tab}`) history.replaceState(null, '', `#/epicerie/${tab}`);
  view.innerHTML = `
    <header class="page-head"><div><p class="eyebrow">Maison</p><h1>Épicerie</h1></div>
      <div class="seg ep-portions" role="radiogroup" aria-label="Portions par repas" title="Portions par repas">${[4, 5, 6].map((p) =>
        `<button data-portions="${p}" class="${S.portions === p ? 'on' : ''}" aria-checked="${S.portions === p}" role="radio">${p} 🍽️</button>`).join('')}</div>
    </header>
    <div class="seg ep-tabs" role="tablist">${[['menus', '🍽️', 'Menus'], ['liste', '🛒', `Liste${toBuy ? ` <small>${toBuy}</small>` : ''}`], ['inventaire', '🧊', `Inventaire <small>${S.inv.length || ''}</small>`]]
      .map(([k, e, l]) => `<button role="tab" data-tab="${k}" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}">${e} ${l}</button>`).join('')}</div>
    <div id="ep-body"></div>`;
  const body = view.querySelector('#ep-body');
  if (tab === 'inventaire') drawInv(body);
  else if (tab === 'liste') drawList(body);
  else drawMenus(body);
  bind(ctx);
}

const expBadge = (it) => {
  const d = daysLeft(it.exp);
  if (d === null) return '';
  const l = d < 0 ? 'expiré' : d === 0 ? 'aujourd’hui' : d === 1 ? 'demain' : `${d} j`;
  return `<span class="ep-exp ${d <= 1 ? 'bad' : d <= 3 ? 'warn' : ''}" title="À consommer avant le ${esc(it.exp)}">⏰ ${l}</span>`;
};

function drawInv(body) {
  const urgent = S.inv.filter(soon).sort((a, b) => a.exp.localeCompare(b.exp));
  const ideas = urgent.length ? recipes().map((r) => [r.ing.filter(([n]) => urgent.some((i) => same(i.name, n))).length, r]).filter(([n]) => n).sort((a, b) => b[0] - a[0]).slice(0, 3) : [];
  body.innerHTML = `
    ${urgent.length ? `<section class="card ep-urgent">
      <div class="card-head"><h2>⏰ À utiliser bientôt</h2></div>
      <div class="ep-chips">${urgent.map((i) => `<span class="ep-chip">${esc(i.name)} ${expBadge(i)}</span>`).join('')}</div>
      ${ideas.length ? `<p class="muted ep-ideas">Idées : ${ideas.map(([, r]) => `<button class="link-btn" data-recipe="${r.id}">${r.e} ${esc(r.n)}</button>`).join(' · ')}</p>` : ''}
    </section>` : ''}
    <div class="ep-zones">${Object.entries(ZONES).map(([z, [e, l]]) => {
      const items = S.inv.filter((i) => i.zone === z).sort((a, b) => (a.exp || '9').localeCompare(b.exp || '9') || a.name.localeCompare(b.name, 'fr'));
      return `<section class="card ep-zone">
        <div class="card-head"><h2>${e} ${l}</h2><small class="muted">${items.length || ''}</small></div>
        <form class="ep-add" data-add="${z}"><input name="t" placeholder="Ex. 2 l lait, beurre, bœuf haché" autocomplete="off" aria-label="Ajouter au ${esc(l)}"><input type="date" name="exp" title="À consommer avant (facultatif)" aria-label="Date limite"><button class="btn primary" aria-label="Ajouter">＋</button></form>
        ${items.length ? `<ul class="ep-items">${items.map((i) => `<li>
          <button class="ep-name" data-edit="${i.id}" title="Modifier">${i.keep ? '⭐ ' : ''}${esc(i.name)}${i.qty ? ` <small class="muted">${fmtQty(i.qty, i.unit)}</small>` : ''}</button>
          ${expBadge(i)}
          <span class="ep-acts">${i.qty > 1 && !/^(g|kg|ml|l|lb)$/.test(i.unit || '') ? `<button data-minus="${i.id}" title="En enlever un" aria-label="En enlever un">−</button>` : ''}<button data-buy="${i.id}" title="Ajouter à la liste" aria-label="Ajouter à la liste">🛒</button><button data-done="${i.id}" title="Fini (retirer)" aria-label="Fini">✓</button></span>
        </li>`).join('')}</ul>` : '<p class="muted ep-empty">Vide pour l’instant.</p>'}
      </section>`;
    }).join('')}</div>
    <p class="muted ep-hint">⭐ Essentiel : quand tu le marques fini, il s’ajoute tout seul à la liste. Touche un article pour le modifier.</p>`;
}

function drawList(body) {
  const groups = Object.keys(RAYONS).map((k) => [k, S.list.filter((l) => l.rayon === k)]).filter(([, a]) => a.length);
  const done = S.list.filter((l) => l.done).length;
  body.innerHTML = `<section class="card">
    <form class="ep-add" data-add="list"><input name="t" placeholder="Ex. 2 l lait, pain, bananes" autocomplete="off" aria-label="Ajouter à la liste"><button class="btn primary">Ajouter</button></form>
    <div class="ep-row-btns">
      <button class="btn" data-act="gen">🍽️ Ajouter les ingrédients des menus</button>
      ${S.list.length ? '<button class="btn" data-act="copy">📋 Copier la liste</button>' : ''}
    </div>
    ${groups.length ? groups.map(([k, a]) => `<div class="ep-rayon"><h3>${RAYONS[k]}</h3><ul class="ep-list">${a.sort((x, y) => x.done - y.done || x.name.localeCompare(y.name, 'fr')).map((l) => `<li class="${l.done ? 'done' : ''}">
      <label><input type="checkbox" data-check="${l.id}" ${l.done ? 'checked' : ''}> <span>${esc(l.name)}${l.qty ? ` <small class="muted">${fmtQty(l.qty, l.unit)}</small>` : ''}</span>${l.src === 'menu' ? '<small class="ep-src" title="Ajouté depuis les menus">🍽️</small>' : l.src === 'essentiel' ? '<small class="ep-src" title="Essentiel terminé">⭐</small>' : ''}</label>
      <button class="ep-x" data-del="${l.id}" aria-label="Retirer">✕</button></li>`).join('')}</ul></div>`).join('')
      : '<p class="muted ep-empty">Ta liste est vide. Planifie tes soupers dans Menus, puis ajoute leurs ingrédients ici d’un clic.</p>'}
    ${done ? `<div class="ep-row-btns ep-foot"><button class="btn primary" data-act="ranger">📦 Ranger ${done} achat${done > 1 ? 's' : ''} dans l’inventaire</button><button class="btn" data-act="clear">Retirer les cochés</button></div>` : ''}
  </section>`;
}

function drawMenus(body) {
  const wk = wkKey(wkOff);
  const plan = S.plan[wk] || {};
  const mon = U.parseISO(wk);
  const today = iso(new Date());
  const filled = Object.values(plan).filter((v) => recipe(v)).length;
  const opts = (cur) => `<option value="">Choisir…</option>${Object.entries(SPECIAL).map(([k, [e, l]]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${e} ${l}</option>`).join('')}<optgroup label="Recettes">${recipes().slice().sort((a, b) => a.n.localeCompare(b.n, 'fr')).map((r) => `<option value="${r.id}" ${cur === r.id ? 'selected' : ''}>${r.e} ${esc(r.n)}</option>`).join('')}</optgroup>`;
  const lib = recipes().filter((r) => !protF || r.prot === protF).map((r) => [stockRatio(r), r]).sort((a, b) => b[0][0] / b[0][1] - a[0][0] / a[0][1] || a[1].n.localeCompare(b[1].n, 'fr'));
  body.innerHTML = `
    <section class="card">
      <div class="card-head ep-wk">
        <button class="btn" data-wk="-1" aria-label="Semaine précédente">‹</button>
        <h2>🍽️ Semaine du ${U.fmtShort(mon).replace(/\.$/, '')}</h2>
        <button class="btn" data-wk="1" aria-label="Semaine suivante">›</button>
      </div>
      <ul class="ep-week">${DOW.map((d, i) => {
        const day = iso(U.addDays(mon, i)), v = plan[i], r = recipe(v), sp = SPECIAL[v];
        const [have, tot] = r ? stockRatio(r) : [0, 0];
        return `<li class="${day === today ? 'today' : ''}">
          <span class="ep-dow">${d.slice(0, 3)}<small>${U.parseISO(day).getDate()}</small></span>
          ${r ? `<button class="ep-meal" data-recipe="${r.id}"><span class="ep-emo">${r.e}</span><span><b>${esc(r.n)}</b><small class="muted">⏱ ${r.min} min · ${have}/${tot} en stock</small></span></button>
            <span class="ep-acts"><button data-reroll="${i}" title="Autre suggestion" aria-label="Autre suggestion">🔄</button><button data-clear="${i}" title="Retirer" aria-label="Retirer">✕</button></span>`
          : sp ? `<span class="ep-meal ep-special"><span class="ep-emo">${sp[0]}</span><b>${sp[1]}</b></span><span class="ep-acts"><button data-clear="${i}" aria-label="Retirer">✕</button></span>`
          : `<select data-pick="${i}" aria-label="Souper du ${d}">${opts('')}</select><span class="ep-acts"><button data-reroll="${i}" title="Suggérer" aria-label="Suggérer">✨</button></span>`}
        </li>`;
      }).join('')}</ul>
      <div class="ep-row-btns">
        <button class="btn primary" data-act="suggest">✨ ${filled ? 'Compléter la semaine' : 'Suggérer mes soupers'}</button>
        ${filled ? '<button class="btn" data-act="redo">🔄 Tout refaire</button><button class="btn" data-act="gen">🛒 Générer la liste d’épicerie</button>' : ''}
      </div>
      <p class="muted ep-hint">Pour ${S.portions} portions. Les suggestions favorisent ce que tu as déjà (surtout ce qui expire bientôt), varient les protéines et gardent les recettes longues pour la fin de semaine.</p>
    </section>
    <section class="card">
      <div class="card-head"><h2>📖 Recettes</h2><button class="btn" data-act="newrecipe">＋ Ma recette</button></div>
      <div class="wo-parts ep-filters">${[['', 'Toutes'], ...Object.entries(PROTS)].map(([k, l]) => `<button class="chip-btn ${protF === k ? 'on' : ''}" data-prot="${k}">${l}</button>`).join('')}</div>
      <div class="ep-lib">${lib.map(([[h, t], r]) => `<button class="ep-rcard" data-recipe="${r.id}"><span class="ep-emo">${r.e}</span><span><b>${esc(r.n)}</b><small class="muted">⏱ ${r.min} min · ${h}/${t} en stock${r.custom ? ' · ✍️ à moi' : ''}</small></span></button>`).join('')}</div>
    </section>`;
}

/* ---------- Fenêtres ---------- */
function recipeModal(ctx, id) {
  const r = recipe(id);
  if (!r) return;
  const f = S.portions / BASE_PORTIONS;
  const mon = U.parseISO(wkKey(wkOff));
  ctx.modal(`<h2>${r.e} ${esc(r.n)}</h2>
    <p class="muted">⏱ ${r.min} min · ${S.portions} portions · ${PROTS[r.prot] || ''}</p>
    <h3>Ingrédients</h3>
    <ul class="ep-ing">${r.ing.map(([n, q, u]) => { const it = inStock(n); return `<li class="${it ? 'have' : ''}">${it ? '✅' : '▫️'} ${esc(cleanName(n))} <small class="muted">${fmtQty(scale(q, u, f), u)}</small>${it ? ` <small class="muted">(en stock : ${esc(it.name)})</small>` : ''}</li>`; }).join('')}</ul>
    ${r.base ? `<p class="muted">De base à la maison : ${esc(r.base)}</p>` : ''}
    ${r.steps?.length ? `<h3>Étapes</h3><ol class="ep-steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
    <div class="modal-actions ep-plan-row">
      ${r.custom ? '<button class="btn" id="ep-rdel">Supprimer</button>' : ''}
      <select id="ep-rday" aria-label="Jour">${DOW.map((d, i) => `<option value="${i}">${d} ${U.addDays(mon, i).getDate()}</option>`).join('')}</select>
      <button class="btn primary" id="ep-rplan">Planifier</button>
    </div>`, (m, close) => {
    const free = DOW.findIndex((_, i) => !(S.plan[wkKey(wkOff)] || {})[i]);
    if (free >= 0) m.querySelector('#ep-rday').value = free;
    m.querySelector('#ep-rplan').onclick = async () => {
      const wk = wkKey(wkOff);
      (S.plan[wk] ||= {})[m.querySelector('#ep-rday').value] = r.id;
      await save(); close(); tab = 'menus'; draw(ctx);
      ctx.toast(`🍽️ ${r.n} planifié ${DOW[m.querySelector('#ep-rday').value].toLowerCase()}`);
    };
    const del = m.querySelector('#ep-rdel');
    if (del) del.onclick = async () => {
      if (!(await ctx.confirmBox(`Supprimer la recette « ${r.n} » ?`))) return;
      S.custom = S.custom.filter((x) => x.id !== r.id);
      for (const p of Object.values(S.plan)) for (const k of Object.keys(p)) if (p[k] === r.id) delete p[k];
      await save(); draw(ctx);
    };
  });
}

function newRecipeModal(ctx) {
  ctx.modal(`<h2>＋ Ma recette</h2>
    <form id="ep-rform" class="ep-rform">
      <div class="ep-r2"><label>Emoji<input name="e" value="🍲" maxlength="4"></label><label class="grow">Nom<input name="n" required autofocus></label></div>
      <div class="ep-r2"><label>Minutes<input name="min" type="number" min="5" step="5" value="30"></label>
        <label class="grow">Protéine<select name="prot">${Object.entries(PROTS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label></div>
      <label>Ingrédients pour ${S.portions} portions (un par ligne)<textarea name="ing" rows="6" placeholder="900 g bœuf haché&#10;2 boîtes tomates en dés&#10;1 oignon"></textarea></label>
      <label>Étapes (une par ligne, facultatif)<textarea name="steps" rows="4"></textarea></label>
      <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div>
    </form>`, (m, close) => {
    m.querySelector('#ep-rform').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const k = BASE_PORTIONS / S.portions; // on garde les quantités en base 5 portions
      const ing = String(fd.get('ing')).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const p = parseItem(l);
        return [p.name, p.qty ? Math.round(p.qty * k * 10) / 10 : 0, p.unit, rayonOf(p.name)];
      });
      if (!ing.length) { ctx.toast('Ajoute au moins un ingrédient'); return; }
      const r = { id: 'c' + uid(), n: String(fd.get('n')).trim(), e: String(fd.get('e')).trim() || '🍲', min: +fd.get('min') || 30, prot: fd.get('prot'), ing,
        steps: String(fd.get('steps')).split('\n').map((l) => l.trim()).filter(Boolean), base: '', custom: true };
      (S.custom ||= []).push(r);
      await save(); close(); tab = 'menus'; draw(ctx);
      ctx.toast(`📖 « ${r.n} » ajoutée à tes recettes`);
    };
  });
}

function editItemModal(ctx, id) {
  const it = S.inv.find((i) => i.id === id);
  if (!it) return;
  ctx.modal(`<h2>Modifier</h2>
    <form id="ep-iform" class="ep-rform">
      <label>Nom<input name="name" value="${esc(it.name)}" required></label>
      <div class="ep-r2"><label>Quantité<input name="qty" type="number" min="0" step="any" value="${it.qty || ''}"></label><label>Unité<input name="unit" value="${esc(it.unit || '')}" placeholder="g, l, boîte…"></label></div>
      <div class="ep-r2"><label class="grow">Endroit<select name="zone">${Object.entries(ZONES).map(([z, [e, l]]) => `<option value="${z}" ${it.zone === z ? 'selected' : ''}>${e} ${l}</option>`).join('')}</select></label>
        <label>À consommer avant<input name="exp" type="date" value="${esc(it.exp || '')}"></label></div>
      <label class="ep-check"><input type="checkbox" name="keep" ${it.keep ? 'checked' : ''}> ⭐ Essentiel : le remettre sur la liste quand il est fini</label>
      <div class="modal-actions"><button type="button" class="btn" id="ep-idel">Retirer</button><button class="btn primary">Enregistrer</button></div>
    </form>`, (m, close) => {
    m.querySelector('#ep-idel').onclick = async () => { await finish(ctx, it.id); close(); };
    m.querySelector('#ep-iform').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      Object.assign(it, { name: cleanName(String(fd.get('name'))), qty: +fd.get('qty') || 0, unit: String(fd.get('unit')).trim(), zone: fd.get('zone'), exp: fd.get('exp') || '', keep: !!fd.get('keep') });
      await save(); close(); draw(ctx);
    };
  });
}

async function finish(ctx, id) {
  const it = S.inv.find((i) => i.id === id);
  if (!it) return;
  S.inv = S.inv.filter((i) => i !== it);
  if (it.keep) addToList(it.name, 0, '', 'essentiel');
  await save(); draw(ctx);
  ctx.toast(it.keep ? `⭐ ${it.name} est fini : ajouté à la liste` : `✓ ${it.name} retiré`);
}

/** Ajoute les ingrédients des soupers planifiés qui ne sont pas en stock. */
async function generateList(ctx) {
  const wk = wkKey(wkOff);
  const plan = S.plan[wk] || {};
  const f = S.portions / BASE_PORTIONS;
  const need = new Map();
  // Ce qui reste en stock (g ou ml) : 900 g de bœuf ne couvrent pas trois recettes de bœuf
  const left = new Map(S.inv.map((i) => [i.id, toBase(i.qty, i.unit)]));
  for (const v of Object.values(plan)) {
    const r = recipe(v);
    if (!r) continue;
    for (const [n, q, u, ray] of r.ing) {
      let want = q * f;
      const it = inStock(n);
      if (it) {
        const have = left.get(it.id), w = toBase(want, u);
        if (!have || !w || have.u !== w.u) continue; // quantité inconnue ou pas comparable : on suppose que ça suffit
        if (have.q >= w.q) { have.q -= w.q; continue; }
        want *= (w.q - have.q) / w.q; have.q = 0;
      }
      const k = tokens(n).join(' ') + '|' + u;
      const cur = need.get(k);
      if (cur) cur.qty += want; else need.set(k, { name: n, qty: want, unit: u, rayon: ray });
    }
  }
  if (!need.size) { ctx.toast(Object.keys(plan).length ? '✅ Tout est déjà en stock !' : 'Planifie d’abord quelques soupers'); return; }
  // On remplace ce qui venait des menus (pas encore acheté) pour éviter les doublons
  S.list = S.list.filter((l) => l.src !== 'menu' || l.done);
  let n = 0;
  for (const x of need.values()) if (addToList(x.name, scale(x.qty, x.unit, 1), x.unit, 'menu', x.rayon)) n++;
  await save();
  tab = 'liste'; draw(ctx);
  ctx.toast(`🛒 ${n} ingrédient${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} à la liste`);
}

function listText() {
  return Object.entries(RAYONS).map(([k, l]) => {
    const a = S.list.filter((x) => x.rayon === k && !x.done);
    return a.length ? `${l}\n${a.map((x) => `- ${x.name}${x.qty ? ` (${fmtQty(x.qty, x.unit)})` : ''}`).join('\n')}` : '';
  }).filter(Boolean).join('\n\n');
}

/* ---------- Événements ---------- */
function bind(ctx) {
  const { view } = ctx;
  const redraw = async () => { await save(); draw(ctx); };
  view.onclick = async (e) => {
    const b = e.target.closest('button, [data-recipe]');
    if (!b || !view.contains(b)) return;
    const d = b.dataset;
    if (d.tab) { tab = d.tab; draw(ctx); return; }
    if (d.portions) { S.portions = +d.portions; return redraw(); }
    if (d.wk) { wkOff += +d.wk; draw(ctx); return; }
    if (d.prot !== undefined) { protF = d.prot; draw(ctx); return; }
    if (d.recipe) return recipeModal(ctx, d.recipe);
    if (d.edit) return editItemModal(ctx, d.edit);
    if (d.done) return finish(ctx, d.done);
    if (d.minus) { const it = S.inv.find((i) => i.id === d.minus); if (it) it.qty = Math.max(0, it.qty - 1); return redraw(); }
    if (d.buy) { const it = S.inv.find((i) => i.id === d.buy); if (it) { addToList(it.name, 0, '', it.keep ? 'essentiel' : ''); await save(); ctx.toast(`🛒 ${it.name} ajouté à la liste`); draw(ctx); } return; }
    if (d.del) { S.list = S.list.filter((l) => l.id !== d.del); return redraw(); }
    if (d.clear !== undefined) { const p = S.plan[wkKey(wkOff)]; if (p) delete p[d.clear]; return redraw(); }
    if (d.reroll !== undefined) {
      const wk = wkKey(wkOff), p = (S.plan[wk] ||= {});
      delete p[d.reroll];
      const id = pickRecipe(p, +d.reroll, wk);
      if (id) p[d.reroll] = id;
      return redraw();
    }
    if (d.act === 'suggest' || d.act === 'redo') {
      const wk = wkKey(wkOff);
      const p = (S.plan[wk] ||= {});
      if (d.act === 'redo') for (const k of Object.keys(p)) if (!SPECIAL[p[k]]) delete p[k];
      for (let i = 0; i < 7; i++) if (!p[i]) { const id = pickRecipe(p, i, wk); if (id) p[i] = id; }
      return redraw();
    }
    if (d.act === 'gen') return generateList(ctx);
    if (d.act === 'newrecipe') return newRecipeModal(ctx);
    if (d.act === 'copy') {
      try { await navigator.clipboard.writeText(listText()); ctx.toast('📋 Liste copiée : colle-la dans un texto'); } catch { ctx.toast('Copie impossible'); }
      return;
    }
    if (d.act === 'clear') { S.list = S.list.filter((l) => !l.done); return redraw(); }
    if (d.act === 'ranger') {
      const bought = S.list.filter((l) => l.done);
      for (const l of bought) {
        const ex = S.inv.find((i) => same(i.name, l.name) && (i.unit || '') === (l.unit || ''));
        if (ex) { if (l.qty) ex.qty = (ex.qty || 0) + l.qty; }
        else S.inv.push({ id: uid(), name: l.name, zone: /oignon(?! vert)|\bail\b|pomme de terre|patate|grelot|banane/.test(fold(l.name)) ? 'garde' : RAYON_ZONE[l.rayon] || 'garde', qty: l.qty || 0, unit: l.unit || '', exp: '', keep: l.src === 'essentiel' });
      }
      S.list = S.list.filter((l) => !l.done);
      await save(); tab = 'inventaire'; draw(ctx);
      ctx.toast(`📦 ${bought.length} article${bought.length > 1 ? 's' : ''} rangé${bought.length > 1 ? 's' : ''}`);
    }
  };
  view.onchange = async (e) => {
    const t = e.target;
    if (t.dataset.check) { const l = S.list.find((x) => x.id === t.dataset.check); if (l) l.done = t.checked; return redraw(); }
    if (t.dataset.pick !== undefined && t.value) { (S.plan[wkKey(wkOff)] ||= {})[t.dataset.pick] = t.value; return redraw(); }
  };
  view.onsubmit = async (e) => {
    const f = e.target.closest('form.ep-add');
    if (!f) return;
    e.preventDefault();
    const z = f.dataset.add;
    const parts = String(f.t.value).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    for (const p of parts) {
      const it = parseItem(p);
      if (z === 'list') addToList(it.name, it.qty, it.unit);
      else {
        const ex = S.inv.find((i) => i.zone === z && fold(i.name) === fold(it.name) && (i.unit || '') === (it.unit || ''));
        if (ex && it.qty) ex.qty = (ex.qty || 0) + it.qty;
        else S.inv.push({ id: uid(), name: it.name, zone: z, qty: it.qty, unit: it.unit, exp: f.exp?.value || '', keep: false });
      }
    }
    await save(); draw(ctx);
    ctx.view.querySelector(`form[data-add="${z}"] input[name="t"]`)?.focus();
  };
}

/** Pour la page Aujourd’hui : le souper prévu ce soir (ou null). */
export async function tonight() {
  const v = (await db.get('settings', KEY)) || {};
  const d = (new Date().getDay() + 6) % 7;
  const id = (v.plan || {})[iso(U.startOfWeek(new Date()))]?.[d];
  if (!id) return null;
  if (SPECIAL[id]) return { e: SPECIAL[id][0], n: SPECIAL[id][1] };
  const r = [...RECETTES, ...(v.custom || [])].find((x) => x.id === id);
  return r ? { e: r.e, n: r.n, id: r.id } : null;
}
