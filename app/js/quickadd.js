// Ajout rapide (bouton ＋ sur cellulaire, touche N sur PC) : une ligne de texte, l'app devine quoi créer.
//   « Appeler le garage demain »   -> ✅ Mission (pour demain)
//   « 12 $ Tim » / « Tim 12,50$ »   -> 💸 Dépense (Finances)
//   « acheter lait, pain »          -> 🛒 Achats (un article par virgule)
//   « idée : app de recettes »      -> 🧠 Note du Cerveau (À classer)
// Le type deviné peut toujours être changé d'un clic avant d'ajouter.
import * as U from './util.js';

export const TYPES = [
  ['task', '✅', 'Mission'],
  ['note', '🧠', 'Note'],
  ['expense', '💸', 'Dépense'],
  ['shop', '🛒', 'Achat'],
];

const AMOUNT_RE = /(?:^|\s)(\d{1,5}(?:[.,]\d{1,2})?)\s*\$|\$\s*(\d{1,5}(?:[.,]\d{1,2})?)(?=\s|$)/;
const SHOP_RE = /^(?:🛒\s*|(?:à\s+acheter|acheter|achète|achat|courses?|épicerie)\s*:?\s+)/i;
const NOTE_RE = /^(?:🧠\s*|(?:idée|idee|note|noter|penser à)\s*:\s*|(?:idée|idee)\s+)/i;
const TASK_RE = /^(?:✅\s*|(?:mission|tâche|tache|todo|à faire)\s*:\s*)/i;
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** Date dite dans le texte (« demain », « hier », « lundi »…) : renvoie { date, rest } (rest = texte sans le mot). */
export function dateIn(text, now = new Date()) {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const strip = (re) => text.replace(re, ' ').replace(/\s{2,}/g, ' ').trim();
  let m;
  if ((m = text.match(/\b(après-demain|apres-demain|après demain)\b/i))) return { date: U.iso(U.addDays(base, 2)), rest: strip(m[0]), word: 'après-demain' };
  if ((m = text.match(/\bdemain\b/i))) return { date: U.iso(U.addDays(base, 1)), rest: strip(/\bdemain\b/i), word: 'demain' };
  if ((m = text.match(/\bhier\b/i))) return { date: U.iso(U.addDays(base, -1)), rest: strip(/\bhier\b/i), word: 'hier' };
  if ((m = text.match(/\baujourd[’']hui\b/i))) return { date: U.iso(base), rest: strip(/\baujourd[’']hui\b/i), word: 'aujourd’hui' };
  const re = new RegExp(`\\b(?:ce\\s+|le\\s+)?(${DAYS.join('|')})(?:\\s+prochain)?\\b`, 'i');
  if ((m = text.match(re))) {
    const want = DAYS.indexOf(m[1].toLowerCase());
    let add = (want - base.getDay() + 7) % 7 || 7; // le prochain (jamais aujourd'hui)
    return { date: U.iso(U.addDays(base, add)), rest: strip(re), word: m[1].toLowerCase() };
  }
  return { date: U.iso(base), rest: text.trim(), word: '' };
}

const clean = (s) => s.replace(/^\s*(?:pour|chez|à|au|de|du)\s+/i, '').replace(/^[\s:–—-]+|[\s:–—,-]+$/g, '').replace(/\s{2,}/g, ' ').trim();

/** Devine le type. Renvoie { type, guessed } (guessed = type deviné sans forcer). */
export function guess(text) {
  const t = text.trim();
  if (TASK_RE.test(t)) return 'task';
  if (SHOP_RE.test(t)) return 'shop';
  if (NOTE_RE.test(t)) return 'note';
  if (AMOUNT_RE.test(t)) return 'expense';
  if (t.includes('\n') || t.length > 140) return 'note';
  return 'task';
}

/** Ce qui sera créé pour un texte et un type donnés. */
export function parse(text, type = guess(text)) {
  const raw = text.trim();
  if (!raw) return { type, ok: false };
  if (type === 'note') {
    return { type, ok: true, text: raw.replace(NOTE_RE, '').trim() || raw };
  }
  if (type === 'shop') {
    const items = raw.replace(SHOP_RE, '').split(/\s*(?:,|;|\n|\bet\b)\s*/i).map(clean).filter(Boolean);
    return { type, ok: items.length > 0, items };
  }
  if (type === 'expense') {
    const m = raw.match(AMOUNT_RE);
    const amount = m ? Number((m[1] || m[2]).replace(',', '.')) : 0;
    const { date, rest, word } = dateIn(m ? raw.replace(m[0], ' ') : raw);
    const name = clean(rest) || 'Dépense';
    return { type, ok: amount > 0, amount, name: name.charAt(0).toUpperCase() + name.slice(1), date, word };
  }
  // Mission
  const { date, rest, word } = dateIn(raw.replace(TASK_RE, ''));
  const title = clean(rest) || raw;
  return { type: 'task', ok: true, title: title.charAt(0).toUpperCase() + title.slice(1), date, word };
}
