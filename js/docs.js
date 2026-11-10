// Documents joints (PDF, Word, EPUB, Excel, PowerPoint, texte…) : dans les captures et notes du Cerveau,
// les pages manuscrites et les modules du cours RBQ.
// - Le contenu (le fichier lui-même) est gardé dans le store local « blobs ».
// - La fiche (nom, taille, type) est dans « files » (kind: 'doc'), synchronisée comme le reste.
// - Avec la synchro Google Drive, chaque document est aussi envoyé une seule fois dans ton Drive
//   (dossier privé de l'app) ; un autre appareil le télécharge quand tu l'ouvres.

import { db } from './db.js';
import { uid, esc } from './util.js';

export const ACCEPT = '.pdf,.doc,.docx,.odt,.rtf,.txt,.md,.epub,.ppt,.pptx,.xls,.xlsx,.csv,application/pdf,application/epub+zip';
export const MAX_MB = 25;
export const REF_RE = /\[📎 [^\]\n]*\]\(file:([a-z0-9]+)\)/g;
export const refsIn = (body = '') => [...new Set([...body.matchAll(REF_RE)].map((m) => m[1]))];
export const refLine = (meta) => `[📎 ${meta.name.replace(/[[\]\n]/g, '')}](file:${meta.id})`;

const ext = (name = '') => (name.split('.').pop() || '').toLowerCase();
export function icon(meta) {
  const e = ext(meta?.name);
  if (e === 'pdf') return '📕';
  if (e === 'epub') return '📗';
  if (['doc', 'docx', 'odt', 'rtf'].includes(e)) return '📘';
  if (['xls', 'xlsx', 'csv'].includes(e)) return '📊';
  if (['ppt', 'pptx'].includes(e)) return '📙';
  return '📄';
}
export function fmtSize(n = 0) {
  if (n < 1024) return n + ' o';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' Ko';
  return (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' Mo';
}

/** Fichiers acceptés d'une liste (glisser-déposer, sélection). Les images sont laissées aux images. */
export function docFiles(list) {
  return [...(list || [])].filter((f) => f && !f.type.startsWith('image/'));
}

/** Enregistre un document. Renvoie sa fiche { id, name, size, mime }. */
export async function save(file) {
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`« ${file.name} » dépasse ${MAX_MB} Mo`);
  const id = uid().replace(/[^a-z0-9]/g, '');
  await db.put('blobs', file, id);
  const meta = { id, kind: 'doc', name: file.name || 'document', size: file.size, mime: file.type || 'application/octet-stream', createdAt: Date.now(), driveId: null };
  await db.put('files', meta);
  return meta;
}

export const meta = (id) => db.get('files', id);
export async function metas(ids = []) {
  return (await Promise.all(ids.map((id) => db.get('files', id)))).filter((m) => m?.kind === 'doc');
}

let fetchRemote = null; // fourni par sync.js : télécharge un document depuis Drive
export const setRemoteFetcher = (fn) => { fetchRemote = fn; };

async function blobOf(m) {
  let b = await db.get('blobs', m.id);
  if (b) return b;
  if (m.driveId && fetchRemote) {
    b = await fetchRemote(m.driveId);
    if (b) { await db.put('blobs', b, m.id); return b; }
  }
  return null;
}

/** Ouvre un document : PDF et texte dans un nouvel onglet, les autres sont téléchargés (ouverts par Windows). */
export async function open(id) {
  const m = await meta(id);
  if (!m) throw new Error('Document introuvable');
  const b = await blobOf(m);
  if (!b) throw new Error(m.driveId ? 'Connecte Google (Réglages → Synchronisation) pour récupérer ce document' : 'Ce document est sur un autre appareil : active la synchronisation sur les deux');
  const url = URL.createObjectURL(b.type ? b : new Blob([b], { type: m.mime }));
  const e = ext(m.name);
  if (['pdf', 'txt', 'md', 'csv'].includes(e)) window.open(url, '_blank', 'noopener');
  else {
    const a = document.createElement('a');
    a.href = url;
    a.download = m.name;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Pastille d'un document (clic = ouvrir). opts.remove : affiche un × (data-doc-rm). */
export function chip(m, { remove = false } = {}) {
  if (!m) return '';
  return `<span class="doc-chip" data-doc="${m.id}"><button type="button" class="doc-open" data-doc-open="${m.id}" title="Ouvrir ${esc(m.name)}">
      <span class="doc-ico">${icon(m)}</span><span class="doc-name">${esc(m.name)}</span><small>${fmtSize(m.size)}</small></button>${remove ? `<button type="button" class="doc-rm" data-doc-rm="${m.id}" aria-label="Retirer ${esc(m.name)}">×</button>` : ''}</span>`;
}

/** Supprime les documents qui ne sont plus utilisés nulle part. */
export async function removeUnused(ids) {
  if (!ids.length) return;
  const used = new Set([
    ...(await db.all('notes')).flatMap((n) => refsIn(n.body)),
    ...(await db.all('ink')).flatMap((p) => p.docs || []),
    ...(await db.all('study')).flatMap((m) => m.docIds || []),
  ]);
  for (const id of ids) if (!used.has(id)) { await db.del('files', id); await db.del('blobs', id); }
}
