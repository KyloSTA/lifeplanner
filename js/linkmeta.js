// Liens Facebook collés dans la capture rapide du Cerveau : on va chercher leur titre et leur image
// (service public Microlink, qui lit les balises de partage de la page). Facebook cache beaucoup de pages
// derrière sa connexion : dans ce cas on garde un titre tiré de l'adresse et une vignette Facebook.

const FB_RE = /https?:\/\/(?:[\w-]+\.)?(?:facebook\.com|fb\.watch|fb\.me)\/[^\s<>()[\]"]*/i;

/** Première adresse Facebook trouvée dans le texte (sans la ponctuation finale). */
export const facebookUrl = (text = '') => (text.match(FB_RE)?.[0] || '').replace(/[.,;:!?]+$/, '');

/** Genre de lien d'après l'adresse : sert de titre quand la page est privée. */
export function facebookLabel(url) {
  let u;
  try { u = new URL(url); } catch { return 'Lien Facebook'; }
  const p = u.pathname.toLowerCase();
  if (/fb\.watch$/.test(u.hostname) || /^\/(watch|[^/]+\/videos)\b/.test(p)) return 'Vidéo Facebook';
  if (/^\/(reel|share\/r)\b/.test(p)) return 'Reel Facebook';
  if (/^\/events\b/.test(p)) return 'Événement Facebook';
  if (/^\/marketplace\b/.test(p)) return 'Article Marketplace';
  if (/^\/groups\b/.test(p)) return /\/(posts|permalink)\//.test(p) ? 'Publication de groupe Facebook' : 'Groupe Facebook';
  if (/^\/(photo|[^/]+\/photos)\b/.test(p)) return 'Photo Facebook';
  if (/^\/(share\/[pv]|permalink|story)|\/posts\//.test(p)) return 'Publication Facebook';
  const page = u.pathname.split('/').filter(Boolean)[0];
  if (page && !/^(share|profile\.php|people|pages)$/i.test(page)) return 'Page Facebook · ' + decodeURIComponent(page);
  return 'Lien Facebook';
}

// Titres renvoyés quand Facebook affiche sa page de connexion au lieu du contenu
const GENERIC = /^(facebook|log in|log into facebook|connexion|se connecter|facebook\s*[-–|]\s*(log in|connexion).*)$/i;

/** Titre et image d'un lien Facebook ; { title: '', img: '' } si la page n'est pas publique. */
export async function facebookMeta(url, ms = 6000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch('https://api.microlink.io/?url=' + encodeURIComponent(url), { signal: ctl.signal });
    const j = await r.json();
    if (j.status !== 'success') return { title: '', img: '' };
    let title = (j.data?.title || '').replace(/(\s*\|\s*Facebook)+\s*$/i, '').trim();
    if (GENERIC.test(title) || /log in or sign up|connectez-vous/i.test(title)) title = '';
    const img = j.data?.image?.url || '';
    return { title: title.slice(0, 200), img: /^https:\/\/[^\s]+$/.test(img) ? img : '' };
  } catch {
    return { title: '', img: '' };
  } finally { clearTimeout(timer); }
}

/* ---------- Tous les liens : titre et vignette de la page, ou un titre compris à partir de l'adresse ---------- */
const URL_RE = /https?:\/\/[^\s<>()[\]"]+/i;
/** Première adresse web du texte (sans la ponctuation finale). */
export const anyUrl = (text = '') => (text.match(URL_RE)?.[0] || '').replace(/[.,;:!?]+$/, '');

const SITES = { 'centris.ca': 'Centris', 'kijiji.ca': 'Kijiji', 'duproprio.com': 'DuProprio', 'realtor.ca': 'Realtor.ca', 'amazon.ca': 'Amazon', 'amazon.com': 'Amazon',
  'youtube.com': 'YouTube', 'reddit.com': 'Reddit', 'lapresse.ca': 'La Presse', 'ledevoir.com': 'Le Devoir', 'ici.radio-canada.ca': 'Radio-Canada', 'github.com': 'GitHub', 'wikipedia.org': 'Wikipédia' };
const WORDS = { a: 'à', vendre: 'vendre', louer: 'louer', 'a-vendre': 'à vendre', 'a-louer': 'à louer', condo: 'condo', maison: 'maison', appartement: 'appartement', plex: 'plex', duplex: 'duplex', triplex: 'triplex', terrain: 'terrain', chalet: 'chalet' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const slugWords = (s) => decodeURIComponent(s).replace(/\.(html?|php|aspx?)$/i, '').split(/[-_+]+/).filter(Boolean).map((w) => WORDS[w.toLowerCase()] || w).join(' ');
const placeName = (s) => decodeURIComponent(s).split('-').map((w, i) => (i && /^(le|la|les|de|du|des|sur|en|aux)$/i.test(w) ? w.toLowerCase() : cap(w.toLowerCase()))).join('-');

/** Nom du site, d'après l'adresse. */
export function siteName(url) {
  try {
    const h = new URL(url).hostname.replace(/^(www|m|fr|en|ca)\./, '');
    const k = Object.keys(SITES).find((d) => h === d || h.endsWith('.' + d));
    return k ? SITES[k] : h;
  } catch { return 'Lien'; }
}

/** Titre compréhensible tiré de l'adresse (quand la page ne donne pas le sien). */
export function urlLabel(url) {
  let u;
  try { u = new URL(url); } catch { return 'Lien'; }
  const site = siteName(url);
  const parts = u.pathname.split('/').filter(Boolean).filter((p) => !/^(fr|en|fr-ca|en-ca)$/i.test(p));
  // Centris : /fr/maison~a-vendre~saint-basile-le-grand/21142335
  const tilde = parts.find((p) => p.includes('~'));
  if (tilde) {
    const [kind, deal, ...place] = tilde.split('~');
    const id = parts.find((p) => /^\d{5,}$/.test(p));
    return `${cap(slugWords(kind))} ${slugWords(deal)}${place.length ? ` · ${place.map(placeName).join(' · ')}` : ''}${id ? ` (${site} n° ${id})` : ` (${site})`}`;
  }
  // Sinon : le morceau d'adresse le plus parlant (le plus long avec des lettres)
  const best = parts.filter((p) => /[a-z]{3,}/i.test(p) && !/^\d+$/.test(p)).sort((x, y) => y.length - x.length)[0];
  return best ? `${cap(slugWords(best))} · ${site}` : `Page ${site}`;
}

/** Titre et image de n'importe quelle page publique (service Microlink, qui lit ses balises de partage). */
export async function pageMeta(url, ms = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch('https://api.microlink.io/?url=' + encodeURIComponent(url), { signal: ctl.signal });
    const j = await r.json();
    if (j.status !== 'success') return { title: '', img: '' };
    let title = (j.data?.title || '').trim();
    if (/^(access denied|just a moment|attention required|403|404|page not found|un instant)/i.test(title)) title = '';
    const img = j.data?.image?.url || j.data?.logo?.url || '';
    return { title: title.slice(0, 200), img: /^https:\/\/[^\s]+$/.test(img) ? img : '' };
  } catch {
    return { title: '', img: '' };
  } finally { clearTimeout(timer); }
}

/** Deuxième essai : lire les balises de partage de la page elle-même (par allorigins.win). */
export async function pageMetaRaw(url, ms = 10000) {
  try {
    const r = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(url), { signal: AbortSignal.timeout?.(ms) });
    if (!r.ok) return { title: '', img: '' };
    const h = (await r.text()).slice(0, 300000);
    const meta = (p) => (h.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']+)`, 'i')) || h.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${p}["']`, 'i')) || [])[1] || '';
    const dec = (s) => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value.trim(); };
    const title = dec(meta('og:title') || meta('twitter:title') || (h.match(/<title[^>]*>([^<]+)/i) || [])[1] || '');
    let img = dec(meta('og:image') || meta('twitter:image'));
    if (img && !/^https?:/.test(img)) try { img = new URL(img, url).href; } catch { img = ''; }
    return { title: /^(access denied|just a moment|attention required)/i.test(title) ? '' : title.slice(0, 200), img: /^https:\/\/[^\s]+$/.test(img) ? img : '' };
  } catch { return { title: '', img: '' }; }
}

/** Logo du site (vignette de secours quand la page ne donne pas d'image). */
export const siteLogo = (url) => { try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=128`; } catch { return ''; } };
