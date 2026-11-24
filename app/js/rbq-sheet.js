// 📋 Feuille d'examen (Cours RBQ) : rassemble ce qui est surligné (<mark> ou ==…==) dans les notes rbq-*.md
// du dossier notes/, plus les points clés ⭐ des modules. On coche ce qui va sur la feuille, on change l'ordre,
// puis on imprime une page compacte. En option : chaque élément devient une carte de révision.
//
// Réglages (settings « rbqSheet ») : { off: [id], order: [id], cols: 1-3, size: pt, title }

import { db } from './db.js';
import * as U from './util.js';
import { listNotes, loadNote, titleOf, inline, renderMarkdown } from './mdnotes.js';

const { esc, iso } = U;
const KEY = 'rbqSheet';
const conf = async () => ({ off: [], order: [], cols: 2, size: 8.5, title: 'Feuille d’examen RBQ', ...((await db.get('settings', KEY)) || {}) });
const save = (c) => db.put('settings', c, KEY);

// Identifiant stable d'un élément : fichier + texte (le même passage garde son état coché d'une fois à l'autre)
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
const MARK = /<mark>|==[^=]+==/i;

/** Blocs d'une note qui contiennent un surligné : ligne de liste, paragraphe, tableau ou citation (avec leur titre de section). */
export function extract(md, file) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let section = '';
  const push = (kind, text) => { if (MARK.test(text)) out.push({ id: hash(file + '|' + text), file, section, kind, text }); };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (/^\s*```/.test(line)) { while (++i < lines.length && !/^\s*```/.test(lines[i])); continue; }
    const h = line.match(/^#{1,6}\s+(.*?)\s*#*$/);
    if (h) { section = h[1].replace(/<\/?mark>|==/gi, ''); if (MARK.test(line)) push('line', h[1]); continue; }
    if (line.includes('|') && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      const buf = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) buf.push(lines[i++]);
      i--;
      push('table', buf.join('\n'));
      continue;
    }
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      i--;
      push('line', buf.join(' '));
      continue;
    }
    const li = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)/);
    if (li) { push('line', li[1]); continue; }
    const buf = [line.trim()];
    while (i + 1 < lines.length && lines[i + 1].trim() && !/^\s*(#|>|[-*+]\s|\d+[.)]\s|```)/.test(lines[i + 1]) && !lines[i + 1].includes('|')) buf.push(lines[++i].trim());
    push('line', buf.join(' '));
  }
  return out;
}

/** Tous les éléments disponibles, dans l'ordre choisi. */
async function gather(c) {
  const files = (await listNotes()).filter((f) => /^rbq[-_]/i.test(f));
  const notes = await Promise.all(files.map((f) => loadNote(f).then((md) => ({ f, md })).catch(() => ({ f, md: '' }))));
  let items = notes.flatMap(({ f, md }) => extract(md, f));
  // Points clés ⭐ des modules du cours
  const mods = (await db.all('study')).filter((x) => x.kind === 'module').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const m of mods) for (const k of m.keys || []) items.push({ id: 'k-' + k.id, file: 'module:' + m.id, group: '⭐ ' + m.title, section: '', kind: 'key', text: k.text });
  const pos = new Map(c.order.map((id, i) => [id, i]));
  items = items.map((it, i) => ({ ...it, at: pos.has(it.id) ? pos.get(it.id) : 1e6 + i }));
  return { items: items.sort((a, b) => a.at - b.at), files };
}

const groupOf = (it) => it.group || '📄 ' + titleOf(it.file.replace(/^rbq[-_]/i, ''));
function itemHTML(it) {
  if (it.kind === 'table') return renderMarkdown(it.text);
  if (it.kind === 'key') return esc(it.text);
  return inline(it.text);
}

export async function renderSheet(ctx) {
  const { view, toast, confirmBox } = ctx;
  const c = await conf();
  view.innerHTML = `<header class="page-head"><div><p class="eyebrow"><a href="#/rbq">← Cours RBQ</a></p><h1>📋 Feuille d’examen</h1></div></header>
    <p class="muted">Chargement des notes…</p>`;
  const { items, files } = await gather(c);
  const on = items.filter((it) => !c.off.includes(it.id));
  const redraw = () => renderSheet(ctx);

  // Regroupe les éléments consécutifs d'une même note / d'un même module
  const groups = (list) => list.reduce((g, it) => { const k = groupOf(it); (g.at(-1)?.k === k ? g.at(-1).items : (g.push({ k, items: [] }), g.at(-1).items)).push(it); return g; }, []);

  view.innerHTML = `<header class="page-head"><div><p class="eyebrow"><a href="#/rbq">← Cours RBQ</a></p><h1>📋 Feuille d’examen</h1></div>
      <div class="head-actions"><button class="btn primary" id="sh-print" ${on.length ? '' : 'disabled'}>🖨 Imprimer</button></div></header>
    <section class="card sh-tools">
      <label>Titre <input id="sh-title" value="${esc(c.title)}" autocomplete="off"></label>
      <label>Colonnes <select id="sh-cols">${[1, 2, 3].map((n) => `<option ${n === c.cols ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Taille <select id="sh-size">${[7, 7.5, 8, 8.5, 9, 10, 11].map((n) => `<option value="${n}" ${n === c.size ? 'selected' : ''}>${String(n).replace('.', ',')} pt</option>`).join('')}</select></label>
      <button class="btn" id="sh-cards" ${on.length ? '' : 'disabled'}>🃏 Créer les cartes</button>
      <span class="muted sh-count">${on.length}/${items.length} élément${items.length > 1 ? 's' : ''} sur la feuille · ${files.length} note${files.length > 1 ? 's' : ''} rbq</span>
    </section>
    ${items.length ? '' : `<div class="card empty-card"><p>Rien à mettre sur la feuille pour l’instant.</p>
      <p class="muted">Dans le dossier <b>notes</b> du dépôt, crée des fichiers dont le nom commence par <code>rbq-</code> (ex. <code>rbq-volet2-cours01.md</code>) et entoure de <code>&lt;mark&gt;…&lt;/mark&gt;</code> ce qui doit aller sur ta feuille. Les points clés ⭐ de tes modules apparaissent aussi ici.</p></div>`}
    <div class="sh-layout">
      <div class="sh-pick">${groups(items).map((g) => `<div class="sh-group"><h3>${esc(g.k)}</h3>${g.items.map((it) => `
        <div class="sh-item ${c.off.includes(it.id) ? 'off' : ''}" data-id="${it.id}">
          <label class="sh-chk"><input type="checkbox" ${c.off.includes(it.id) ? '' : 'checked'} aria-label="Mettre sur la feuille"></label>
          <div class="sh-txt mdn-body">${it.section ? `<small class="muted">${esc(it.section)}</small>` : ''}${itemHTML(it)}</div>
          <div class="sh-mv"><button class="btn icon" data-mv="-1" aria-label="Monter">↑</button><button class="btn icon" data-mv="1" aria-label="Descendre">↓</button></div>
        </div>`).join('')}</div>`).join('')}</div>
      <div class="sh-preview-wrap"><p class="eyebrow">Aperçu</p>
        <div class="sh-paper" id="sh-paper" style="--cols:${c.cols};--fs:${c.size}pt">
          <h2>${esc(c.title)}</h2>
          ${groups(on).map((g) => `<section><h4>${esc(g.k)}</h4>${g.items.map((it) => `<div class="sh-p-item mdn-body">${itemHTML(it)}</div>`).join('')}</section>`).join('')}
        </div>
      </div>
    </div>`;

  const set = async (patch) => { Object.assign(c, patch); await save(c); };
  view.querySelector('#sh-title').onchange = async (e) => { await set({ title: e.target.value.trim() || 'Feuille d’examen RBQ' }); redraw(); };
  view.querySelector('#sh-cols').onchange = async (e) => { await set({ cols: Number(e.target.value) }); redraw(); };
  view.querySelector('#sh-size').onchange = async (e) => { await set({ size: Number(e.target.value) }); redraw(); };
  view.querySelectorAll('.sh-item input').forEach((b) => (b.onchange = async () => {
    const id = b.closest('.sh-item').dataset.id;
    await set({ off: b.checked ? c.off.filter((x) => x !== id) : [...c.off, id] });
    redraw();
  }));
  view.querySelectorAll('[data-mv]').forEach((b) => (b.onclick = async () => {
    const ids = items.map((it) => it.id), id = b.closest('.sh-item').dataset.id;
    const i = ids.indexOf(id), j = i + Number(b.dataset.mv);
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await set({ order: ids });
    redraw();
  }));
  view.querySelector('#sh-print').onclick = () => printSheet(view.querySelector('#sh-paper'));
  view.querySelector('#sh-cards').onclick = () => makeCards(ctx, on, redraw);
}

/* ---------- Impression : seule la feuille sort, sur une page lettre ---------- */
function printSheet(paper) {
  const box = document.createElement('div');
  box.id = 'sh-print-root';
  box.append(paper.cloneNode(true));
  document.body.append(box);
  document.body.classList.add('sh-printing');
  const done = () => { document.body.classList.remove('sh-printing'); box.remove(); removeEventListener('afterprint', done); };
  addEventListener('afterprint', done);
  setTimeout(() => window.print(), 50);
}

/* ---------- Cartes de révision : « question » = le passage avec le surligné caché, « réponse » = le surligné ---------- */
const plain = (s) => s.replace(/<\/?[^>]+>/g, '').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();
export function toCard(it) {
  if (it.kind === 'table' || it.kind === 'key') return null;
  const marks = [...it.text.matchAll(/<mark>(.*?)<\/mark>|==([^=]+)==/gi)].map((m) => plain(m[1] ?? m[2]));
  if (!marks.length) return null;
  const q = plain(it.text.replace(/<mark>.*?<\/mark>|==[^=]+==/gi, ' [ … ] '));
  return { q: (it.section ? it.section + ' : ' : '') + q, a: marks.join(' · ') };
}

async function makeCards(ctx, items, redraw) {
  const { modal, toast } = ctx;
  const all = await db.all('study');
  const mods = all.filter((x) => x.kind === 'module').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const have = new Set(all.filter((x) => x.kind === 'card' && x.src).map((x) => x.src));
  const fresh = items.filter((it) => !have.has(it.id)).map((it) => ({ it, card: toCard(it) })).filter((x) => x.card);
  if (!fresh.length) { toast('Aucune nouvelle carte : elles existent déjà (les tableaux et les points clés n’en font pas)'); return; }
  const cur = mods.find((m) => m.status === 'doing') || mods[0];
  modal(`<h2>🃏 Créer ${fresh.length} carte${fresh.length > 1 ? 's' : ''}</h2>
    <p class="muted">La question reprend le passage avec le surligné caché ; la réponse, c’est le surligné. Exemple :</p>
    <div class="card sh-ex"><b>${esc(fresh[0].card.q)}</b><p class="muted">→ ${esc(fresh[0].card.a)}</p></div>
    <label class="hb-lbl" for="sh-mod">Dans le module</label>
    <select id="sh-mod">${mods.map((m) => `<option value="${m.id}" ${m === cur ? 'selected' : ''}>${esc(m.title)}</option>`).join('')}</select>
    <div class="modal-actions"><button class="btn" data-close>Annuler</button><button class="btn primary" id="sh-go">Créer</button></div>`, (m, close) => {
    m.querySelector('#sh-go').onclick = async () => {
      const moduleId = m.querySelector('#sh-mod').value;
      for (const { it, card } of fresh) await db.put('study', { id: U.uid(), kind: 'card', moduleId, q: card.q, a: card.a, src: it.id, box: 1, due: iso(new Date()), right: 0, wrong: 0, createdAt: Date.now() });
      close();
      toast(`🃏 ${fresh.length} carte${fresh.length > 1 ? 's' : ''} ajoutée${fresh.length > 1 ? 's' : ''} au module`);
      redraw();
    };
  });
}
