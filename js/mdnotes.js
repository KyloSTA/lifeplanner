// 📄 Notes : fichiers Markdown du dossier notes/ du site (app/notes dans le dépôt).
// Lus à l'ouverture de la page (sans cache) : ajouter ou modifier un .md, puis publier, suffit.
// Liste des fichiers : en local, le petit serveur la donne (notes/) ; en ligne, l'API publique de GitHub
// (dossier notes de la branche gh-pages, celle que GitHub Pages sert). Dernière liste gardée pour le hors-ligne.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LIST_KEY = 'lp-mdnotes-list';
const fresh = (u) => u + (u.includes('?') ? '&' : '?') + 't=' + Date.now();

/** Titre lisible d'un fichier : « protection-incendie.md » -> « Protection incendie » */
export const titleOf = (f) => { const t = f.replace(/\.md$/i, '').replace(/[-_]+/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

function ghSource() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  if (!m) return null;
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return repo ? `https://api.github.com/repos/${m[1]}/${repo}/contents/notes?ref=gh-pages` : null;
}

/** Noms des fichiers .md, triés. */
export async function listNotes() {
  let files = null;
  try {
    const gh = ghSource();
    if (gh) {
      const r = await fetch(gh, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
      if (r.ok) files = (await r.json()).filter((x) => x.type === 'file').map((x) => x.name);
    } else {
      const r = await fetch(fresh('notes/'), { cache: 'no-store' });
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) files = await r.json();
    }
  } catch { /* hors ligne ou API limitée : dernière liste connue */ }
  if (files) {
    files = files.filter((f) => /\.md$/i.test(f)).sort((a, b) => a.localeCompare(b, 'fr'));
    try { localStorage.setItem(LIST_KEY, JSON.stringify(files)); } catch {}
    return files;
  }
  try { return JSON.parse(localStorage.getItem(LIST_KEY) || 'null') || []; } catch { return []; }
}

/** Contenu brut d'un fichier (toujours la version la plus récente du site). */
export async function loadNote(file) {
  if (!/^[\w.\- ]+\.md$/i.test(file)) throw new Error('Nom de note invalide');
  const r = await fetch(fresh('notes/' + encodeURIComponent(file)), { cache: 'no-store' });
  if (!r.ok) throw new Error(r.status === 404 ? 'Note introuvable' : 'Note illisible (' + r.status + ')');
  return r.text();
}

/* ---------- Rendu Markdown (titres, listes, gras, tableaux, citations, code, <mark>) ---------- */
export function inline(s) {
  const codes = [];
  let t = esc(s).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  t = t
    .replace(/&lt;(\/?)mark&gt;/gi, '<$1mark>')                // <mark> du fichier : surligné
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a, u) => /^(https?:|\.?\/?[\w-])/.test(u) && !/^javascript:/i.test(u) ? `<img src="${u.startsWith('http') ? u : 'notes/' + u.replace(/^\.\//, '')}" alt="${a}" loading="lazy">` : a)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, l, u) => {
      if (/^https?:/i.test(u)) return `<a href="${u}" target="_blank" rel="noopener">${l}</a>`;
      if (/^[\w.\- ]+\.md$/i.test(u)) return `<a href="#/notes/${encodeURIComponent(u)}">${l}</a>`; // lien vers une autre note
      return l;
    })
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a || b}</strong>`)
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

const cells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export function renderMarkdown(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { flush(); continue; }
    // Bloc de code
    const fence = line.match(/^\s*```/);
    if (fence) {
      flush();
      const buf = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i]);
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*$/);
    if (h) { flush(); const n = Math.min(h[1].length + 1, 6); out.push(`<h${n}>${inline(h[2])}</h${n}>`); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); continue; }
    // Tableau : ligne d'en-tête puis |---|---|
    if (line.includes('|') && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1] || '')) {
      flush();
      const align = cells(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : ''));
      const th = cells(line).map((c, k) => `<th${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(c)}</th>`).join('');
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push('<tr>' + cells(lines[i]).map((c, k) => `<td${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(c)}</td>`).join('') + '</tr>');
        i++;
      }
      i--;
      out.push(`<div class="mdn-table"><table><thead><tr>${th}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`);
      continue;
    }
    // Citation
    if (/^\s*>/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      i--;
      out.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`);
      continue;
    }
    // Listes (imbriquées selon l'indentation), cases à cocher
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      flush();
      const stack = [];
      while (i < lines.length && (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && stack.length))) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)/);
        if (!m) { out.push(' ' + inline(lines[i].trim())); i++; continue; } // suite d'un élément
        const ind = m[1].replace(/\t/g, '    ').length, tag = /\d/.test(m[2]) ? 'ol' : 'ul';
        while (stack.length && ind < stack[stack.length - 1].ind) out.push(`</li></${stack.pop().tag}>`);
        if (stack.length && ind === stack[stack.length - 1].ind && tag !== stack[stack.length - 1].tag) out.push(`</li></${stack.pop().tag}>`); // puces -> numéros : nouvelle liste
        if (!stack.length || ind > stack[stack.length - 1].ind) { out.push(`<${tag}>`); stack.push({ ind, tag }); }
        else out.push('</li>');
        const task = m[3].match(/^\[([ xX])\]\s+(.*)/);
        out.push(task ? `<li class="mdn-task"><input type="checkbox" disabled${task[1] !== ' ' ? ' checked' : ''}> ${inline(task[2])}` : `<li>${inline(m[3])}`);
        i++;
      }
      while (stack.length) out.push(`</li></${stack.pop().tag}>`);
      i--;
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return out.join('\n');
}

/* ---------- Page #/notes et #/notes/<fichier> ---------- */
export async function renderPage({ view }, file) {
  view.innerHTML = `<div class="page-head"><div><div class="eyebrow">Notes du dépôt</div><h1>📄 Notes</h1></div></div>
    <div class="mdn-layout"><nav class="card mdn-list" aria-label="Notes"><p class="muted">Chargement…</p></nav><article class="card mdn-doc"></article></div>`;
  const nav = view.querySelector('.mdn-list'), doc = view.querySelector('.mdn-doc');
  const files = await listNotes();
  nav.innerHTML = files.length
    ? files.map((f) => `<a href="#/notes/${encodeURIComponent(f)}" class="${f === file ? 'on' : ''}">📄 <span>${esc(titleOf(f))}</span></a>`).join('')
    : '<p class="muted">Aucune note pour l’instant. Ajoute un fichier .md dans le dossier notes du dépôt, puis publie.</p>';
  const cur = file || files[0];
  view.querySelector('.mdn-layout').classList.toggle('has-doc', !!file);
  if (!cur) { doc.innerHTML = '<p class="muted">Rien à afficher.</p>'; return; }
  if (file || matchMedia('(min-width: 761px)').matches) nav.querySelector(`a[href="#/notes/${CSS.escape(encodeURIComponent(cur))}"]`)?.classList.add('on');
  doc.innerHTML = '<p class="muted">Chargement…</p>';
  try {
    const md = await loadNote(cur);
    doc.innerHTML = `<a class="mdn-back" href="#/notes">← Toutes les notes</a>`
      + (md.trim() ? `<div class="mdn-body">${/^#\s/m.test(md) ? '' : `<h2>${esc(titleOf(cur))}</h2>`}${renderMarkdown(md)}</div>`
        : `<div class="mdn-body"><h2>${esc(titleOf(cur))}</h2><p class="muted">Cette note est vide pour l’instant.</p></div>`);
  } catch (e) {
    doc.innerHTML = `<p class="muted">${esc(e.message)}</p>`;
  }
}
