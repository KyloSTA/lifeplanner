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
  { id: 'spotify', name: 'Spotify', icon: '♫', color: '#1db954', mode: 'app', app: 'spotify:', url: 'https://open.spotify.com' },
];

export async function list() {
  return (await db.get('settings', 'launcher')) || DEFAULTS;
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
  if (item.mode === 'tab') return !!window.open(item.url, '_blank', 'noopener');
  return openWindow(item);
}

export function openWindow(item) {
  const w = Math.min(1280, screen.availWidth - 80), h = Math.min(900, screen.availHeight - 80);
  const left = Math.round((screen.availWidth - w) / 2), top = Math.round((screen.availHeight - h) / 2);
  // Un nom de fenêtre par élément : un 2e clic ramène la même fenêtre au lieu d'en ouvrir une autre
  const win = window.open(item.url, 'lp-' + item.id, `popup,width=${w},height=${h},left=${left},top=${top}`);
  win?.focus?.();
  return !!win;
}
