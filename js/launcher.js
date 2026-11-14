// Lanceur : ouvre des sites dans leur propre fenêtre, ou des applications Windows par leur lien
// (microsoft-edge:, spotify:). Liste modifiable, enregistrée dans les réglages.

import { db } from './db.js';
import { uid } from './util.js';

// mode : 'window' = fenêtre séparée, 'tab' = onglet du navigateur, 'app' = application Windows (avec site de secours)
export const DEFAULTS = [
  { id: 'edge', name: 'Edge', icon: 'e', color: '#0c8484', mode: 'app', app: 'microsoft-edge:https://www.bing.com', url: 'https://www.bing.com' },
  { id: 'youtube', name: 'YouTube', icon: '▶', color: '#e62117', mode: 'window', url: 'https://www.youtube.com' },
  { id: 'reddit', name: 'Reddit', icon: 'r', color: '#ff4500', mode: 'window', url: 'https://www.reddit.com' },
  { id: 'facebook', name: 'Facebook', icon: 'f', color: '#1877f2', mode: 'window', url: 'https://www.facebook.com' },
  { id: 'messenger', name: 'Messenger', icon: '💬', color: '#7b5cff', mode: 'window', url: 'https://www.messenger.com' },
  { id: 'gmail', name: 'Gmail', icon: 'M', color: '#ffffff', mode: 'window', url: 'https://mail.google.com/mail/u/0/' },
  { id: 'spotify', name: 'Spotify', icon: '♫', color: '#1db954', mode: 'app', app: 'spotify:', url: 'https://open.spotify.com' },
];

// Icônes dessinées (SVG intégré : nettes, hors ligne, aucune requête externe), par identifiant d'app
const svg = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
const ICONS = {
  youtube: svg('<path d="M9.2 7.2v9.6l8-4.8z" fill="#fff"/>'),
  reddit: svg('<circle cx="18.6" cy="4.6" r="1.6" fill="#fff"/><path d="M12 9.2l1.4-5.4 5 1" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<circle cx="4.8" cy="11.6" r="2" fill="#fff"/><circle cx="19.2" cy="11.6" r="2" fill="#fff"/><ellipse cx="12" cy="14.6" rx="8" ry="5.6" fill="#fff"/>'
    + '<circle cx="9" cy="13.8" r="1.3" fill="#ff4500"/><circle cx="15" cy="13.8" r="1.3" fill="#ff4500"/><path d="M9.2 17c1.7 1.1 3.9 1.1 5.6 0" fill="none" stroke="#ff4500" stroke-width="1.1" stroke-linecap="round"/>'),
  facebook: svg('<path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H8v3h2.6V21z" fill="#fff"/>'),
  messenger: svg('<path d="M12 3C7 3 3 6.7 3 11.3c0 2.6 1.3 4.9 3.3 6.4V21l3-1.7c.8.2 1.7.3 2.7.3 5 0 9-3.7 9-8.3S17 3 12 3z" fill="#fff"/><path d="M6.6 13.9l3.7-3.9 2 1.9 3.9-1.9-3.7 3.9-2-1.9z" fill="#7b5cff"/>'),
  gmail: svg('<path d="M3.5 8v10.4c0 .9.7 1.6 1.6 1.6H7.6V11z" fill="#4285f4"/><path d="M16.4 11v9h2.5c.9 0 1.6-.7 1.6-1.6V8z" fill="#34a853"/>'
    + '<path d="M20.5 8l-4.1 3V5.9l1.6-1.2c1-.7 2.5 0 2.5 1.3z" fill="#fbbc04"/><path d="M3.5 8l4.1 3V5.9L6 4.7c-1-.7-2.5 0-2.5 1.3z" fill="#c5221f"/>'
    + '<path d="M7.6 11V5.9L12 9.2l4.4-3.3V11L12 14.3z" fill="#ea4335"/>'),
  spotify: svg('<g fill="none" stroke="#191414" stroke-width="2" stroke-linecap="round"><path d="M5.8 9.4c4.1-1.3 8.8-1 12.4 1"/><path d="M6.8 12.8c3.4-1 7.2-.7 10 .9"/><path d="M7.8 16c2.6-.7 5.4-.5 7.6.8"/></g>'),
  edge: svg('<path d="M20.4 15.6c-1.6 3-4.8 4.9-8.3 4.9-4.9 0-8.6-3.7-8.6-8.3 0-4.9 4-8.7 8.8-8.7 4.6 0 8.2 3.1 8.2 7 0 2.6-2 4.3-4.6 4.3-1.6 0-2.7-.6-2.7-1.4 0-.4.4-.8.4-1.6 0-1.8-1.6-3.2-3.8-3.2-2.6 0-4.3 2.2-4.3 4.7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>'),
};

/** Contenu de la pastille d'une app : icône dessinée, sinon l'icône du site (favicon), avec la lettre en secours. */
export function iconHTML(it) {
  if (ICONS[it.id]) return ICONS[it.id];
  const letter = String(it.icon || it.name?.[0] || '★').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  let fav = '';
  try { const u = new URL(it.url); if (u.protocol === 'https:') fav = `<img class="ico-fav" src="${u.origin}/favicon.ico" alt="" loading="lazy" onerror="this.remove()" onload="if(this.naturalWidth<16)this.remove()">`; } catch { /* lien d'application */ }
  return `<span class="ico-letter">${letter}</span>${fav}`;
}

export async function list() {
  const saved = await db.get('settings', 'launcher');
  if (!saved) return DEFAULTS;
  // Une seule fois : ajoute Gmail à une liste déjà personnalisée (avant Spotify)
  if (!(await db.get('settings', 'launcherGmail'))) {
    if (!saved.some((x) => x.id === 'gmail' || /mail\.google\.com/.test(x.url || ''))) {
      const at = saved.findIndex((x) => x.id === 'spotify');
      saved.splice(at < 0 ? saved.length : at, 0, { ...DEFAULTS.find((x) => x.id === 'gmail') });
      await save(saved);
    }
    await db.put('settings', true, 'launcherGmail');
  }
  return saved;
}
export const save = (items) => db.put('settings', items, 'launcher');
export const reset = () => db.del('settings', 'launcher');

export function normalizeUrl(u) {
  u = (u || '').trim();
  if (!u) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u; // https:, spotify:, mailto:…
  return 'https://' + u;
}

export function makeItem({ name, url, icon }) {
  const colors = ['#4f46e5', '#0ea5e9', '#16a34a', '#f97316', '#e11d48', '#a855f7', '#0c8484'];
  return { id: uid(), name: name.trim(), url: normalizeUrl(url), icon: (icon || name.trim()[0] || '★').slice(0, 2), color: colors[Math.floor(Math.random() * colors.length)], mode: 'window', custom: true };
}

/** Ouvre un élément. Renvoie false si le navigateur a bloqué la fenêtre. */
export function open(item) {
  if (item.mode === 'app' && item.app) {
    // Application Windows (Edge peut demander « Ouvrir … ? » la première fois). La version web
    // reste accessible par le petit bouton 🌐 de la tuile.
    location.href = item.app;
    return true;
  }
  // 'installed' : simple lien. Si le site est installé comme application dans Edge (avec « ouvrir les liens
  // pris en charge »), Edge l'ouvre dans cette application, sans barre d'adresse ; sinon, dans un onglet.
  if (item.mode === 'tab' || item.mode === 'installed') { followLink(item.url); return true; }
  return openWindow(item);
}

// Un vrai clic sur un lien (window.open avec noopener renvoie toujours null, et les liens cliqués
// sont ceux qu'Edge redirige vers une application installée)
function followLink(url) {
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}

export const MODES = { window: 'Fenêtre', installed: 'App installée', tab: 'Onglet' };

export function openWindow(item) {
  const w = Math.min(1280, screen.availWidth - 80), h = Math.min(900, screen.availHeight - 80);
  const left = Math.round((screen.availWidth - w) / 2), top = Math.round((screen.availHeight - h) / 2);
  // Un nom de fenêtre par élément : un 2e clic ramène la même fenêtre au lieu d'en ouvrir une autre
  const win = window.open(item.url, 'lp-' + item.id, `popup,width=${w},height=${h},left=${left},top=${top}`);
  win?.focus?.();
  return !!win;
}
