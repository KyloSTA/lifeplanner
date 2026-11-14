// Réception des posts Reddit et des vidéos YouTube sauvegardés par l'extension Life Planner
// (dossier extension-edge). Chacun devient une note « Ressource » du Cerveau ;
// sauvegarder deux fois le même élément met la note à jour au lieu d'en créer une autre.

import * as brain from './brain.js';

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const httpUrl = (v) => { const s = str(v, 2000); return /^https:\/\/[^\s]+$/i.test(s) ? s : ''; };

const hms = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + ':' + String(x).padStart(2, '0'); };
const tagOf = (s) => { const t = (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase(); return /^\p{L}[\p{L}\p{N}]{1,29}$/u.test(t) ? t : ''; };

// Vidéo YouTube : lien, chaîne, moment où tu étais rendu, description
function youtubeNote(c) {
  const lines = [`🔗 ${c.url}`];
  if (c.sub) lines.push(`▶ ${c.sub}`);
  if (c.at > 0) lines.push(`⏱ Rendu à ${hms(c.at)} : ${c.url}&t=${c.at}s`);
  if (c.text) lines.push('', ...c.text.split('\n').map((l) => (l.trim() ? '> ' + l : '')));
  const tag = tagOf(c.sub);
  lines.push('', '#youtube ' + (c.short ? '#short' : '#video') + (tag ? ' #' + tag : ''));
  return lines.join('\n');
}

function noteFrom(c) {
  if (c.kind === 'youtube') return youtubeNote(c);
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
  const kind = raw.kind === 'youtube' ? 'youtube' : 'reddit';
  const c = {
    kind,
    title: str(raw.title, 300) || (kind === 'youtube' ? 'Vidéo YouTube' : 'Post Reddit'),
    url: httpUrl(raw.url),
    link: httpUrl(raw.link),
    sub: str(raw.sub, kind === 'youtube' ? 80 : 60),
    author: str(raw.author, 60),
    created: str(raw.created, 40),
    text: str(raw.text, 4000),
    at: Math.max(0, Math.min(86_400, Math.floor(Number(raw.at) || 0))),
    short: raw.short === true,
    img: kind === 'reddit' ? httpUrl(raw.img) : '', // image du post (miniature de la carte)
  };
  if (!c.url) throw new Error('Adresse invalide');
  if (kind === 'youtube' && !/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{6,20}$/.test(c.url)) throw new Error('Adresse YouTube invalide');
  const body = noteFrom(c);
  const title = c.title.length > 80 ? c.title.slice(0, 78).trim() + '…' : c.title;
  const existing = (await brain.allNotes()).find((n) => n.source?.url === c.url);
  if (existing) {
    existing.body = body;
    if (existing.archived) existing.archived = false;
    if (c.img) existing.source = { ...existing.source, img: c.img }; // réenregistrer un post ajoute son image
    await brain.saveNote(existing);
    return { note: existing, updated: true, kind };
  }
  const n = await brain.createNote({ title, body, type: 'ressource' });
  n.source = { kind, url: c.url, ...(c.img ? { img: c.img } : {}) };
  await brain.saveNote(n, { touch: false });
  return { note: n, updated: false, kind };
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
        const { note, updated, kind } = await saveClip(d.clip);
        onSaved(note, updated, kind);
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
