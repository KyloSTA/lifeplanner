// Réception des posts Reddit sauvegardés par l'extension « Life Planner — Reddit → Cerveau »
// (dossier extension-edge). Chaque post devient une note « Ressource » du Cerveau ;
// sauvegarder deux fois le même post met la note à jour au lieu d'en créer une autre.

import * as brain from './brain.js';

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const httpUrl = (v) => { const s = str(v, 2000); return /^https:\/\/[^\s]+$/i.test(s) ? s : ''; };

function noteFrom(c) {
  const sub = str(c.sub, 60);
  const author = str(c.author, 60);
  const date = c.created && !isNaN(new Date(c.created)) ? new Date(c.created).toLocaleDateString('fr-CA') : '';
  const lines = [`🔗 ${c.url}`];
  if (c.link) lines.push(`↗ Lien du post : ${c.link}`);
  const meta = [sub, author && 'u/' + author, date].filter(Boolean).join(' · ');
  if (meta) lines.push(meta);
  if (c.text) lines.push('', ...c.text.split('\n').map((l) => (l.trim() ? '> ' + l : '')));
  const tag = sub.replace(/^r\//, '');
  lines.push('', '#reddit' + (/^\p{L}[\p{L}\p{N}_-]{1,29}$/u.test(tag) ? ' #' + tag.toLowerCase() : ''));
  return lines.join('\n');
}

/** Enregistre un post. Renvoie la note et si elle existait déjà. */
export async function saveClip(raw) {
  const c = {
    title: str(raw.title, 300) || 'Post Reddit',
    url: httpUrl(raw.url),
    link: httpUrl(raw.link),
    sub: str(raw.sub, 60),
    author: str(raw.author, 60),
    created: str(raw.created, 40),
    text: str(raw.text, 4000),
  };
  if (!c.url) throw new Error('Adresse du post invalide');
  const body = noteFrom(c);
  const title = c.title.length > 80 ? c.title.slice(0, 78).trim() + '…' : c.title;
  const existing = (await brain.allNotes()).find((n) => n.source?.url === c.url);
  if (existing) {
    existing.body = body;
    if (existing.archived) existing.archived = false;
    await brain.saveNote(existing);
    return { note: existing, updated: true };
  }
  const n = await brain.createNote({ title, body, type: 'ressource' });
  n.source = { kind: 'reddit', url: c.url };
  await brain.saveNote(n, { touch: false });
  return { note: n, updated: false };
}

/** Écoute les posts relayés par l'extension. onSaved(note, updated) est appelé après chaque enregistrement. */
export function start(onSaved = () => {}) {
  const seen = new Set();
  addEventListener('message', async (e) => {
    // Seulement les messages venant de cette page (le relais de l'extension), jamais d'une autre fenêtre
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.type !== 'lp-clip' || !d.clip || typeof d.clip.id !== 'string') return;
    const id = d.clip.id;
    const once = id + '|' + d.clip.savedAt; // la même sauvegarde peut être livrée deux fois
    try {
      if (!seen.has(once)) {
        seen.add(once);
        const { note, updated } = await saveClip(d.clip);
        onSaved(note, updated);
      }
      postMessage({ type: 'lp-clip-ack', id }, location.origin);
    } catch (err) {
      seen.delete(once);
      console.warn('Post Reddit non enregistré', err);
    }
  });
  // Signale à l'extension que l'app est prête : elle livre alors les posts en attente
  postMessage({ type: 'lp-hello' }, location.origin);
}
