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
