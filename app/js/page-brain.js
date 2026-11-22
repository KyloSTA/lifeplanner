// Vue : Cerveau (second cerveau) — liste, capture rapide, éditeur de note, sélection multiple.
// Sorti de app.js : les outils d'interface communs (toast, modal, routeur…) viennent de app.js.
import { APP } from './config.js';
import { db, STORES, onDbChange } from './db.js';
import * as U from './util.js';
import * as gcal from './gcal.js';
import { InkEditor, INK_COLORS, HL_COLORS } from './ink.js';
import * as game from './game.js';
import * as AV from './avatar.js';
import { taskHTML, bindTaskList, addTask, loadGoals, missionsOf, setTaskGoal, setTaskProject, openTaskEditor, showUndo, bindGoalDrops } from './tasks.js';
import * as brain from './brain.js';
import * as quotes from './quotes.js';
import * as assistant from './assistant.js';
import * as alarms from './alarms.js';
import * as launcher from './launcher.js';
import * as timer from './timer.js';
import * as sync from './sync.js';
import * as clips from './clips.js';
import * as habits from './habits.js';
import * as rbq from './rbq.js';
import * as workout from './workout.js';
import * as stretch from './stretch.js';
import * as images from './images.js';
import * as missions from './missions.js';
import * as docs from './docs.js';
import * as linkmeta from './linkmeta.js';
import { withTeamLogos } from './teams.js';
import * as assoc from './assoc.js';
import * as news from './news.js';
import * as finance from './finance.js';
import * as shots from './shots.js';
import * as usage from './usage.js';
import * as activities from './activities.js';
import * as reminders from './reminders.js';
import * as rpg from './rpg.js';
import * as couple from './couple.js';
import * as quick from './quickadd.js';
import * as digest from './digest.js';
import { swipeable } from './swipe.js';
import * as videodock from './videodock.js';
import { annotate } from './annotate.js';
import { $, $$, view, toast, modal, confirmBox, router, routes, setCleanup, HZ_LABEL, QUICK_DATES, concludeGoal, evoBar, evoLine, fold, getAvatar, goalClass, goalMark, goalSort, goalVerdict, hzOptions, openGoals } from './app.js';

const { esc, iso, cap } = U;

/* =========================================================
   Vue : Cerveau (second cerveau)
   ========================================================= */
const brainState = { q: '', f: 'all', tag: '', arch: false, order: [] }; // order : la liste affichée (pour ‹ › dans une note)
// Éléments du Cerveau ouverts récemment (sur cet appareil), le plus récent d'abord
const RECENT_KEY = 'lp.recentNotes';
let recentIdx = 0;
const recentNoteIds = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } };
function rememberNote(id) {
  const list = [id, ...recentNoteIds().filter((x) => x !== id)].slice(0, 20);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  recentIdx = 0;
}

async function evoCard() {
  const el = $('#c-evo');
  if (!el) return;
  const s = await game.stats();
  const av = await getAvatar(s);
  el.innerHTML = `${AV.avatarSVG(av, 88)}
    <div class="hc-main">
      <div class="hc-top"><strong>${game.EVO[s.evo].icon} ${esc(s.evoName)}</strong><span class="muted">stade ${s.evo + 1}/${game.EVO.length}</span></div>
      ${evoBar(s)}
      <div class="hc-sub muted">${evoLine(s)}</div>
      <div class="hc-sub muted">${s.notes} notes · ${s.links} liens · ${s.reviews} révisions</div>
    </div>`;
}

function captureForm(id) {
  return `<form class="capture" id="${id}">
    <textarea name="t" rows="3" placeholder="Une idée, une citation, un truc appris… (la 1re ligne devient le titre). Colle aussi une photo ou une capture d’écran (Ctrl + V)."></textarea>
    <div class="cap-imgs" hidden></div>
    <div class="capture-foot">
      <label class="btn cap-photo" title="Joindre une photo ou un document (PDF, Word, EPUB…)"><input type="file" accept="image/*,${docs.ACCEPT}" multiple hidden>📎 Joindre</label>
      <button type="button" class="btn cap-paste" title="Coller ce que tu as copié (texte, image ou capture d’écran)">📋 Coller</button>
      <span class="muted cap-hint">Ctrl + Entrée</span>
      <button class="btn primary">💡 Capturer</button>
    </div>
  </form>`;
}

/** Lien capturé : va chercher le vrai titre et la vignette de la page (si elle est publique). true si la note a changé. */
async function enrichLink(n) {
  const url = n.source?.url;
  if (!url) return false;
  let meta = await linkmeta.pageMeta(url);
  if (!meta.title && !meta.img) meta = await linkmeta.pageMetaRaw(url); // 2e essai : les balises de la page elle-même
  const fresh = await db.get('notes', n.id);
  if (!fresh) return false;
  let changed = false;
  if (!fresh.source?.logo) { fresh.source = { ...fresh.source, logo: linkmeta.siteLogo(url) }; changed = true; } // vignette de secours : logo du site
  // Le titre de la page remplace seulement le titre tiré de l'adresse (jamais un titre écrit à la main)
  if (meta.title && fresh.title === linkmeta.urlLabel(url).slice(0, 80)) { fresh.title = meta.title.length > 80 ? meta.title.slice(0, 78).trim() + '…' : meta.title; changed = true; }
  // YouTube a déjà sa propre vignette (lecteur) : pas d'image en double
  if (meta.img && !fresh.source?.img && !/youtu\.?be/i.test(url)) { fresh.source = { ...fresh.source, img: meta.img }; changed = true; }
  fresh.source = { ...fresh.source, checked: Date.now() };
  await brain.saveNote(fresh, { touch: false });
  return changed;
}

/** Notes déjà capturées dont le titre n'est qu'une adresse : on les complète (quelques-unes à la fois). */
let linkFixRunning = false;
async function fixOldLinks(all, redraw) {
  if (linkFixRunning) return;
  const todo = all.filter((n) => !n.source && /^https?:\/\/\S+$/.test((n.title || '').trim()) && !linkmeta.facebookUrl(n.title)).slice(0, 6);
  if (!todo.length) return;
  linkFixRunning = true;
  try {
    for (const n of todo) {
      const url = n.title.trim().replace(/[.,;:!?…]+$/, '');
      n.title = linkmeta.urlLabel(url).slice(0, 80);
      if (!(n.body || '').includes(url)) n.body = [url, n.body].filter(Boolean).join('\n');
      n.source = { kind: 'link', url, label: linkmeta.siteName(url) };
      await brain.saveNote(n, { touch: false });
      await enrichLink(n).catch(() => {});
    }
    redraw();
  } finally { linkFixRunning = false; }
}

function bindCapture(form, after) {
  let files = []; // en attente : images { blob, url } et documents { blob, doc: true }
  const box = form.querySelector('.cap-imgs');
  const drawImgs = () => {
    box.hidden = !files.length;
    box.innerHTML = files.map((f, i) => f.doc
      ? `<span class="doc-chip"><span class="doc-open"><span class="doc-ico">${docs.icon({ name: f.blob.name })}</span><span class="doc-name">${esc(f.blob.name)}</span><small>${docs.fmtSize(f.blob.size)}</small></span><button type="button" class="doc-rm" data-rm="${i}" aria-label="Retirer le document">×</button></span>`
      : `<span class="cap-img"><img src="${f.url}" alt="Image ${i + 1}" data-annot="${i}" title="Cliquer pour annoter (dessiner, écrire)"><i class="cap-annot" aria-hidden="true">✏️</i><button type="button" data-rm="${i}" aria-label="Retirer l’image">×</button></span>`).join('');
    $$('[data-rm]', box).forEach((b) => (b.onclick = () => { const f = files[b.dataset.rm]; if (f.url) URL.revokeObjectURL(f.url); files.splice(Number(b.dataset.rm), 1); drawImgs(); }));
    // ✏️ Cliquer l'image : l'ouvrir pour l'annoter (stylo, surligneur, flèche, cadre, texte)
    $$('[data-annot]', box).forEach((im) => (im.onclick = async () => {
      const f = files[Number(im.dataset.annot)];
      const out = await annotate(f.blob).catch((err) => { toast(err.message, 'err'); return null; });
      if (!out) return;
      URL.revokeObjectURL(f.url);
      f.blob = out;
      f.url = URL.createObjectURL(out);
      drawImgs();
      toast('✏️ Annotations ajoutées à l’image');
    }));
  };
  const add = (list) => {
    for (const blob of list) files.push({ blob, url: URL.createObjectURL(blob) });
    if (list.length) drawImgs(); // pas de focus sur la zone de texte : le clavier ne s'ouvre pas pour une simple photo
  };
  const addDocs = (list) => {
    for (const blob of list) {
      if (blob.size > docs.MAX_MB * 1024 * 1024) { toast(`« ${blob.name} » dépasse ${docs.MAX_MB} Mo`, 'err'); continue; }
      files.push({ blob, doc: true });
    }
    if (list.length) drawImgs();
  };
  form._addImages = add; // utilisé par le « coller » global de la page
  // Échap : retire les images et documents en attente et sort de la zone de texte (le texte tapé reste)
  const onEsc = (e) => {
    if (!form.isConnected) { removeEventListener('keydown', onEsc); return; }
    if (e.key !== 'Escape' || document.querySelector('#modal-root > *, .an-root, .img-zoom')) return;
    const inForm = form.contains(document.activeElement);
    if (!files.length && !inForm) return;
    files.forEach((f) => f.url && URL.revokeObjectURL(f.url));
    files = [];
    drawImgs();
    if (inForm) document.activeElement.blur();
  };
  addEventListener('keydown', onEsc);
  let busy = false;
  const submit = async () => {
    const v = form.t.value.trim();
    if ((!v && !files.length) || busy) return;
    busy = true;
    const btn = form.querySelector('button.primary');
    btn.disabled = true;
    try {
      const ids = [], dms = [];
      for (const f of files) {
        if (f.doc) dms.push(await docs.save(f.blob));
        else ids.push(await images.save(f.blob));
      }
      const lines = v.split('\n');
      let title = v ? lines.shift().trim()
        : ids.length ? `📷 Image du ${U.fmtShort(new Date())} à ${U.fmtTime(new Date())}` : `📎 ${dms[0].name.replace(/\.[^.]+$/, '')}`;
      let body = lines.join('\n').trim();
      if (title.length > 80) { body = (title + '\n' + body).trim(); title = title.slice(0, 60).trim() + '…'; }
      // Lien Facebook : son titre et sa vignette (titre tiré de l'adresse si la page n'est pas publique)
      const fb = linkmeta.facebookUrl(v);
      let fbSource = null;
      if (fb) {
        const meta = await linkmeta.facebookMeta(fb);
        if (title.replace(fb, '').trim() === '') { // la 1re ligne n'était que le lien : il passe dans le contenu
          title = meta.title || linkmeta.facebookLabel(fb);
          if (title.length > 80) title = title.slice(0, 78).trim() + '…';
          body = [fb, body].filter(Boolean).join('\n');
        }
        fbSource = { kind: 'facebook', url: fb, label: linkmeta.facebookLabel(fb), ...(meta.img ? { img: meta.img } : {}) };
      }
      // Autre lien seul sur la 1re ligne : un titre compris à partir de l'adresse tout de suite, puis le vrai titre et la vignette de la page
      const link = !fb && linkmeta.anyUrl(v);
      const isLink = link && title.replace(link, '').trim() === '';
      if (isLink) {
        title = linkmeta.urlLabel(link).slice(0, 80);
        body = [link, body].filter(Boolean).join('\n');
      }
      body = [body, ...ids.map(images.refLine), ...dms.map(docs.refLine)].filter(Boolean).join('\n');
      const n = await brain.createNote({ title, body, type: 'idee', inbox: true });
      n.captured = true;
      if (fbSource) n.source = fbSource;
      if (isLink) n.source = { kind: 'link', url: link, label: linkmeta.siteName(link) };
      await brain.saveNote(n, { touch: false });
      if (isLink) enrichLink(n).then((ok) => ok && after?.(n)).catch(() => {});
      files.forEach((f) => URL.revokeObjectURL(f.url));
      files = [];
      form.t.value = '';
      drawImgs();
      const att = [ids.length && `${ids.length} image${ids.length > 1 ? 's' : ''}`, dms.length && `${dms.length} document${dms.length > 1 ? 's' : ''}`].filter(Boolean).join(' et ');
      toast(att ? `💡 Capturé avec ${att} — dans « À classer »` : '💡 Idée capturée — elle t’attend dans « À classer »');
      after?.(n);
    } catch (err) {
      console.error(err);
      toast('Impossible d’enregistrer l’image : ' + err.message, 'err');
    } finally { busy = false; btn.disabled = false; }
  };
  form.onsubmit = (e) => { e.preventDefault(); submit(); };
  form.t.onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } };
  form.addEventListener('paste', (e) => {
    const ds = docs.docFiles(e.clipboardData?.files);
    // Texte et photos ensemble : le texte dans la zone, les photos en pièces jointes
    if (richPaste(e, (txt) => insertAtCursor(form.t, txt), add)) { if (ds.length) addDocs(ds); return; }
    if (ds.length) { e.preventDefault(); addDocs(ds); }
  });
  form.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); form.classList.add('drop'); } });
  form.addEventListener('dragleave', () => form.classList.remove('drop'));
  form.addEventListener('drop', (e) => {
    form.classList.remove('drop');
    const imgs = images.imageFiles(e.dataTransfer), ds = docs.docFiles(e.dataTransfer?.files);
    if (imgs.length || ds.length) { e.preventDefault(); add(imgs); addDocs(ds); }
  });
  // 📎 Joindre : un seul bouton ; les photos et les documents sont triés automatiquement
  const pick = form.querySelector('.cap-photo input');
  pick.onchange = () => {
    const fs = [...pick.files];
    add(fs.filter((f) => f.type.startsWith('image/')));
    addDocs(docs.docFiles(fs));
    pick.value = '';
  };
  // 📋 Coller : lit le presse-papiers (images, captures d'écran et texte)
  form.querySelector('.cap-paste').onclick = async () => {
    const insertText = (txt) => {
      const ta = form.t, at = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, at) + txt + ta.value.slice(ta.selectionEnd ?? at);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = at + txt.length;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    };
    try {
      let got = false;
      if (navigator.clipboard?.read) {
        const imgs = [];
        let text = '';
        for (const item of await navigator.clipboard.read()) {
          const it = item.types.find((t) => t.startsWith('image/'));
          if (it) imgs.push(await item.getType(it));
          else if (!text && item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
        }
        if (imgs.length) { add(imgs); got = true; }
        if (text.trim()) { insertText(text); got = true; }
      } else if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text.trim()) { insertText(text); got = true; }
      } else throw new Error('unsupported');
      if (!got) toast('Le presse-papiers est vide : copie d’abord un texte ou une image');
    } catch (err) {
      toast(err.message === 'unsupported' ? 'Ton navigateur ne permet pas de lire le presse-papiers : utilise Ctrl + V' : 'Accès au presse-papiers refusé : autorise-le quand le navigateur le demande, ou utilise Ctrl + V', 'err');
    }
  };
}

/**
 * Collage mixte : texte ET images (copiés ensemble d'une page web, d'un courriel…). Le texte va au curseur,
 * puis les images. Les images d'une page web sont récupérées quand le site le permet.
 * Renvoie false s'il n'y a pas d'image (collage normal du navigateur).
 */
function richPaste(e, insertText, addImages) {
  const cd = e.clipboardData;
  if (!cd) return false;
  const files = images.imageFiles(cd);
  const html = cd.getData('text/html') || '';
  const srcs = html.includes('<img') ? [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('img')].map((i) => i.getAttribute('src')).filter(Boolean) : [];
  if (!files.length && !srcs.length) return false;
  e.preventDefault();
  const text = cd.getData('text/plain') || '';
  if (text.trim()) insertText(text);
  (async () => {
    const blobs = [...files];
    if (!blobs.length) {
      for (const src of srcs.slice(0, 12)) {
        try {
          const r = await fetch(src, { referrerPolicy: 'no-referrer' });
          const b = r.ok ? await r.blob() : null;
          if (b?.type.startsWith('image/')) blobs.push(b);
        } catch { /* image protégée par le site : seul le texte est collé */ }
      }
    }
    if (blobs.length) addImages(blobs);
    else if (srcs.length && !text.trim()) toast('Ce site ne permet pas de copier ses images : enregistre l’image, puis colle-la', 'err');
  })();
  return true;
}
/** Insère du texte au curseur d'une zone de texte (et prévient la page qu'elle a changé). */
function insertAtCursor(ta, txt) {
  const at = ta.selectionStart ?? ta.value.length, end = ta.selectionEnd ?? at;
  ta.value = ta.value.slice(0, at) + txt + ta.value.slice(end);
  ta.selectionStart = ta.selectionEnd = at + txt.length;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

// Coller une image n'importe où sur la page (hors champ de texte) : elle va dans la capture rapide visible
document.addEventListener('paste', (e) => {
  if (e.defaultPrevented || e.target.closest?.('input, textarea, [contenteditable]')) return;
  const imgs = images.imageFiles(e.clipboardData);
  const form = $('#view form.capture');
  if (!imgs.length || !form?._addImages) return;
  e.preventDefault();
  form._addImages(imgs);
  form.scrollIntoView({ block: 'center', behavior: 'smooth' });
});

// Les images des notes se chargent à la demande, et un clic les agrandit
new MutationObserver(() => { if (document.querySelector('img[data-img]:not([src])')) images.hydrate(); })
  .observe(document.body, { childList: true, subtree: true });
document.addEventListener('click', (e) => {
  const img = e.target.closest?.('.n-img img');
  if (img?.src) {
    // Dans une note : « ✏️ Annoter » remplace l'image de la note par sa version annotée
    const old = img.dataset.img, nid = (location.hash.match(/^#\/note\/([^/?]+)/) || [])[1];
    images.zoom(img.src, old && nid ? {
      onAnnotate: async (blob) => {
        await images.replaceWith(old, blob, async (newId) => {
          const n = await db.get('notes', nid);
          if (!n) return;
          n.body = n.body.split(`(img:${old})`).join(`(img:${newId})`);
          await brain.saveNote(n);
        });
        toast('✏️ Image annotée');
        router();
      },
    } : {});
  }
  // Documents joints : un clic ouvre le PDF (ou télécharge le fichier Word, EPUB…)
  const d = e.target.closest?.('[data-doc-open]');
  if (d) { e.preventDefault(); e.stopPropagation(); docs.open(d.dataset.docOpen).catch((err) => toast(err.message, 'err')); }
});
docs.setRemoteFetcher(sync.fetchDoc);

/** Texte d'une carte du Cerveau : sans les longs liens (un lien YouTube disparaît, les autres deviennent
 *  « 🔗 site.com ») ni les #étiquettes, déjà affichées en bas de la carte. */
function cardText(body = '') {
  return body
    .replace(/^⏱[^\n]*$/gm, '') // « ⏱ Rendu à 12:59 : lien » : le moment est sur la miniature
    .replace(/(?:🔗\s*)?https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/\S+/g, '')
    .replace(/(?:(🔗|↗[^:\n]*:)\s*)?https?:\/\/(?:www\.)?([^/\s]+)\S*/g, (m, pre, host) => `🔗 ${host}`)
    .replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, '$1')
    .replace(/^\s*🔗\s*$/gm, '');
}

/** Prix d'un article Amazon gardé dans le Cerveau (enregistré avec l'article, sinon lu dans la note : « 💲 49,99 $ »). */
function amazonPrice(n) {
  if (n.source?.kind !== 'amazon') return '';
  return n.source.price || (n.body || '').match(/^💲\s*([^·\n]+?)\s*(?:·|$)/m)?.[1] || '';
}

function noteCard(n, proj) {
  const t = brain.typeOf(n.type);
  const media = n.source?.kind === 'news' || n.source?.kind === 'facebook' || n.source?.kind === 'link' || !!n.source?.img || youtubeVideos(n.body).length > 0; // titre complet sur 2 lignes
  return `<a class="note-card ${n.pinned ? 'pinned' : ''} ${media ? 'has-media' : ''}" href="#/note/${n.id}">
    <div class="nc-head"><span class="nc-type" title="${t.name}">${t.icon}</span><b>${esc((n.source?.kind === 'news' && n.source.title) || n.title || 'Sans titre')}</b>${n.pinned ? '<span title="Épinglée">📌</span>' : ''}</div>
    ${n.inbox ? '<span class="chip warn">📥 À classer</span>' : ''}
    ${proj?.goals.length ? `<div class="nc-proj"><span class="muted">🎯 ${proj.goals.length} objectif${proj.goals.length > 1 ? 's' : ''}${proj.missions ? ` · ${proj.done}/${proj.missions} missions` : ''}</span><b>${proj.pct} %</b>
      <div class="bar"><i style="width:${proj.pct}%"></i></div></div>` : ''}
    ${(() => {
      const im = images.refsIn(n.body);
      if (im.length) return `<div class="nc-img"><img data-img="${im[0]}" alt="" loading="lazy">${im.length > 1 ? `<span>+${im.length - 1}</span>` : ''}</div>`;
      // Lien Facebook : son image sur une vignette Facebook (qui reste si l'image manque ou expire)
      if (n.source?.kind === 'facebook') return `<div class="nc-img nc-fb"><span class="nc-fb-logo">f</span><small>${esc(n.source.label || 'Facebook')}</small>${n.source.img ? `<img src="${esc(n.source.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</div>`;
      // Article d'actualité : son image
      if (n.source?.img) return `<div class="nc-img nc-news"><img src="${esc(n.source.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></div>`
        + (amazonPrice(n) ? `<div class="nc-price">${esc(amazonPrice(n))}</div>` : ''); // article Amazon : son prix sous l'image
      // Lien sans image de page : le logo du site et son nom (ex. Centris)
      if (n.source?.kind === 'link' && n.source.logo && !youtubeVideos(n.body).length) return `<div class="nc-img nc-site"><img src="${esc(n.source.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"><small>${esc(n.source.label || '')}</small></div>`;
      // Vidéo YouTube : sa miniature plutôt que le lien
      const v = youtubeVideos(n.body);
      if (!v.length) return '';
      const at = v[0].start ? `${Math.floor(v[0].start / 60)}:${String(v[0].start % 60).padStart(2, '0')}` : '';
      return `<div class="nc-img nc-yt ${v[0].short ? 'is-short' : ''}"><img src="https://i.ytimg.com/vi/${v[0].id}/hqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer">
        <button type="button" class="nc-play" data-dock-note="${n.id}" title="Regarder dans le dock vidéo (la page reste visible)" aria-label="Regarder dans le dock vidéo">▶</button>${at ? `<span title="Où tu étais rendu">⏱ ${at}</span>` : v.length > 1 ? `<span>+${v.length - 1}</span>` : ''}</div>`;
    })()}
    <p>${esc(brain.excerpt(cardText(n.body))) || (n.title ? '' : '<span class="muted">Vide</span>')}</p>
    <div class="nc-foot">${(n.tags || []).slice(0, 3).map((tg) => `<span class="tag">#${esc(tg)}</span>`).join('')}
      <span class="grow"></span>${(n.links || []).length ? `<span class="muted" title="Liens">🔗 ${n.links.length}</span>` : ''}<span class="muted">${U.fmtShort(new Date(n.updatedAt))}</span></div>
  </a>`;
}

/* ---------- Tri rapide : les éléments « À classer », un à la fois ---------- */
async function quickTriage(onDone = () => {}) {
  const all = await brain.allNotes();
  const queue = all.filter((n) => n.inbox && !n.archived).sort((a, b) => a.createdAt - b.createdAt).map((n) => n.id);
  const projects = brain.projectsOf(all).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  let i = 0, sorted = 0;
  modal('<div class="qt" id="qt"></div>', (m, close) => {
    const root = m.querySelector('#qt');
    const finish = () => { close(); onDone(); };
    const show = async () => {
      while (i < queue.length && !(await db.get('notes', queue[i]))?.inbox) i++; // déjà classé ou supprimé entre-temps
      if (i >= queue.length) {
        root.innerHTML = `<div class="qt-done"><div class="qt-big">🎉</div><h2>${sorted ? 'Tout est classé !' : 'Rien à classer'}</h2>
          <p class="muted">${sorted ? `${sorted} élément${sorted > 1 ? 's' : ''} rangé${sorted > 1 ? 's' : ''}.` : 'Ta boîte « À classer » est vide.'}</p>
          <div class="modal-actions"><button class="btn primary" id="qt-close">Fermer</button></div></div>`;
        root.querySelector('#qt-close').onclick = finish;
        return;
      }
      const n = await db.get('notes', queue[i]);
      let type = n.type || 'idee';
      const tags = new Set(n.tags || []);
      const yt = youtubeVideos(n.body)[0];
      const img = images.refsIn(n.body)[0];
      const media = n.source?.img ? `<img src="${esc(n.source.img)}" alt="" referrerpolicy="no-referrer">`
        : yt ? `<img src="https://i.ytimg.com/vi/${yt.id}/mqdefault.jpg" alt="" referrerpolicy="no-referrer">`
        : img ? `<img data-img="${img}" alt="">` : '';
      root.innerHTML = `
        <div class="card-head"><h2>⚡ Tri rapide</h2><span class="muted">${i + 1} / ${queue.length}</span>
          <button class="tm-close" data-x aria-label="Fermer" title="Fermer (Échap)">×</button></div>
        <div class="qt-bar"><i style="width:${(i / queue.length) * 100}%"></i></div>
        ${media ? `<div class="qt-media">${media}</div>` : ''}
        <input class="qt-title" value="${esc((n.source?.kind === 'news' && n.source.title) || n.title || '')}" placeholder="Titre" aria-label="Titre" maxlength="80">
        <p class="qt-text muted">${esc(brain.excerpt(cardText(n.body), 220)) || 'Note vide'}</p>
        <div class="qt-row"><span class="qt-lbl">Type</span><div class="qt-types">${brain.TYPES.map((t) => `<button type="button" class="chip-btn ${t.id === type ? 'on' : ''}" data-type="${t.id}">${t.icon} ${t.name}</button>`).join('')}</div></div>
        <div class="qt-row"><span class="qt-lbl">Étiquettes</span><div class="qt-tags" id="qt-tags"></div></div>
        ${projects.length ? `<div class="qt-row"><span class="qt-lbl">Projet</span><select class="qt-proj" aria-label="Projet"><option value="">Aucun</option>${projects.map((p) => `<option value="${p.id}" ${(n.rel?.projects || []).includes(p.id) ? 'selected' : ''}>🚀 ${esc(p.title || 'Projet')}</option>`).join('')}</select></div>` : ''}
        <div class="qt-actions">
          <button class="btn danger" data-act="del">🗑 Supprimer</button>
          <button class="btn" data-act="arch" title="Ranger dans les Archives">🗄 Archiver</button>
          <span class="grow"></span>
          <button class="btn" data-act="skip" title="Passer (→)">Passer →</button>
          <button class="btn primary" data-act="ok" title="Classer (Ctrl + Entrée)">✓ Classer</button>
        </div>`;
      images.hydrate(root);
      const drawTags = () => {
        root.querySelector('#qt-tags').innerHTML = [...tags].map((t) => `<button type="button" class="chip-btn on" data-rmtag="${esc(t)}" title="Retirer">#${esc(t)} ×</button>`).join('')
          + '<input class="qt-tag-in" placeholder="+ étiquette" aria-label="Ajouter une étiquette" autocomplete="off">';
        root.querySelectorAll('[data-rmtag]').forEach((b) => (b.onclick = () => { tags.delete(b.dataset.rmtag); drawTags(); }));
        const inp = root.querySelector('.qt-tag-in');
        inp.onkeydown = (e) => {
          if (e.key !== 'Enter' && e.key !== ',' && e.key !== ' ') return;
          e.preventDefault();
          const v = inp.value.replace(/^#/, '').trim().toLowerCase().replace(/\s+/g, '-');
          if (v) { tags.add(v); drawTags(); root.querySelector('.qt-tag-in').focus(); }
        };
      };
      drawTags();
      root.querySelectorAll('[data-type]').forEach((b) => (b.onclick = () => { type = b.dataset.type; root.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('on', x === b)); }));
      root.querySelector('[data-x]').onclick = finish;
      const next = () => { i++; show(); };
      const act = async (a) => {
        const cur = await db.get('notes', n.id);
        if (!cur) return next();
        if (a === 'skip') return next();
        if (a === 'del') {
          const b = root.querySelector('[data-act="del"]');
          if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Confirmer la suppression'; return; }
          await brain.deleteNote(cur.id);
          sorted++;
          return next();
        }
        // Classer ou archiver : on garde le titre, le type, les étiquettes et le projet choisis
        const title = root.querySelector('.qt-title').value.trim();
        if (title) cur.title = title.slice(0, 80);
        cur.type = type;
        const missing = [...tags].filter((t) => !(cur.tags || []).includes(t));
        if (missing.length) cur.body = (cur.body || '').trimEnd() + '\n\n' + missing.map((t) => '#' + t).join(' ');
        for (const t of (cur.tags || []).filter((t) => !tags.has(t))) cur.body = cur.body.replace(new RegExp(`(^|\\s)#${t.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}(?=\\s|$)`, 'g'), '$1');
        const proj = root.querySelector('.qt-proj')?.value;
        if (proj !== undefined) { cur.rel ||= {}; cur.rel.projects = proj ? [proj] : (cur.rel.projects || []).filter((x) => projects.some((p) => p.id === x) ? false : true); }
        cur.inbox = false;
        await brain.saveNote(cur); // donne aussi les points « Idée classée »
        if (a === 'arch') await brain.setArchived(cur.id, true);
        sorted++;
        next();
      };
      root.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => act(b.dataset.act)));
      root.onkeydown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); act('ok'); }
        else if (e.key === 'ArrowRight' && !e.target.closest('input, select, textarea')) { e.preventDefault(); act('skip'); }
      };
    };
    show();
  });
}

// Affichage du Cerveau (gardé sur cet appareil) : 'list', 'grid' ou 'cards'
let brainKeepSel = null; // après une action groupée : rester en mode sélection avec ces éléments
const brainView = () => { try { return ['list', 'grid', 'cards'].includes(localStorage.getItem('lp.brainView')) ? localStorage.getItem('lp.brainView') : 'cards'; } catch { return 'cards'; } };

async function renderBrain() {
  let everything = await brain.allNotes();
  if (await news.recoverImages(everything).catch(() => 0)) everything = await brain.allNotes(); // images des articles déjà gardés
  fixOldLinks(everything, () => { if (location.hash.startsWith('#/brain')) renderBrain(); }).catch(() => {}); // liens capturés avant : titre et vignette
  const archivedCount = everything.filter((n) => n.archived).length;
  if (!archivedCount) brainState.arch = false;
  // Mode normal : notes actives seulement. Mode Archives : notes archivées seulement (filtres identiques).
  const notes = everything.filter((n) => !!n.archived === !!brainState.arch);
  const [allGoals, allTasks] = await Promise.all([db.all('goals'), db.all('tasks')]);
  const projStats = (n) => (n.type === 'projet' ? brain.projectStats(n.id, allGoals, allTasks) : null);
  const projects = notes.filter((n) => n.type === 'projet').sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
  const inbox = notes.filter((n) => n.inbox).length;
  const tagCount = {};
  notes.forEach((n) => (n.tags || []).forEach((t) => (tagCount[t] = (tagCount[t] || 0) + 1)));
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 14);
  if (brainState.tag && !tagCount[brainState.tag]) brainState.tag = '';
  const filters = [['all', 'Tout', notes.length], ['inbox', '📥 À classer', inbox], ['pinned', '📌 Épinglées', notes.filter((n) => n.pinned).length]]
    .concat(brain.TYPES.filter((t) => t.id !== 'projet').map((t) => [t.id, `${t.icon} ${t.name}`, notes.filter((n) => n.type === t.id).length])) // les projets ont leur propre rangée en haut
    .filter(([id, , c]) => id === 'all' || c);
  if (!filters.some(([id]) => id === brainState.f)) brainState.f = 'all';

  view.innerHTML = `
    <header class="page-head"><div><p class="eyebrow">Second cerveau</p><h1>Cerveau</h1></div>
      <div class="head-actions">${inbox && !brainState.arch ? `<button class="btn" id="qt-open" title="Classer les éléments « À classer » un par un">⚡ Tri rapide <small>${inbox}</small></button>` : ''}<button class="btn primary" id="new-note">+ Nouvelle note</button></div></header>
    <div class="brain-top">
      <section class="card capture-card brain-cap"><div class="card-head"><h2>💡 Capture rapide</h2><span class="muted cap-stats">${inbox ? `📥 ${inbox} à classer` : ''}</span></div>${captureForm('cap')}</section>
      <div class="brain-aside">
        <section class="card" id="c-redisc"></section>
      </div>
    </div>
    ${!brainState.arch && projects.length ? `<section class="brain-projects">
      <div class="bp-head"><h2>🚀 Projets</h2><span class="muted">${projects.length} actif${projects.length > 1 ? 's' : ''}</span></div>
      <div class="bp-grid">${projects.map((p) => {
        const st = projStats(p);
        const rel = notes.filter((x) => (x.rel?.projects || []).includes(p.id)).length;
        return `<a class="card bp-card" href="#/note/${p.id}">
          <div class="bp-top"><b>${esc(p.title || 'Projet sans titre')}</b><span class="bp-pct">${st.pct}%</span></div>
          <div class="bar"><i style="width:${st.pct}%"></i></div>
          <small class="muted">🎯 ${st.goals.length} objectif${st.goals.length > 1 ? 's' : ''} · ✅ ${st.done}/${st.missions} missions${rel ? ` · 🧠 ${rel} élément${rel > 1 ? 's' : ''}` : ''}</small>
        </a>`;
      }).join('')}</div>
    </section>` : ''}
    <div class="brain-bar">
      <div class="brain-search-row">
        <label class="brain-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <input type="search" id="bq" placeholder="Rechercher dans tes notes…" value="${esc(brainState.q)}" autocomplete="off" aria-label="Rechercher dans tes notes"></label>
        <div class="seg brain-views" role="group" aria-label="Affichage">${[
          ['list', 'Liste', '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>'],
          ['grid', 'Grille', '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'],
          ['cards', 'Cartes', '<rect x="3" y="3" width="8" height="18" rx="2"/><rect x="13" y="3" width="8" height="18" rx="2"/>'],
        ].map(([k, l, svg]) => `<button type="button" data-bview="${k}" class="${brainView() === k ? 'on' : ''}" aria-pressed="${brainView() === k}" title="${l}" aria-label="Affichage ${l}"><svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg></button>`).join('')}</div>
        <button type="button" class="btn brain-select" id="bsel" aria-pressed="false" title="Sélectionner plusieurs éléments pour les classer d’un coup">☑ Sélectionner</button>
      </div>
      ${brainState.arch ? `<div class="arch-banner">🗄 <b>Archives</b> · ${archivedCount} note${archivedCount > 1 ? 's' : ''} archivée${archivedCount > 1 ? 's' : ''}, rangée${archivedCount > 1 ? 's' : ''} par catégorie d’origine. <button class="btn" id="arch-exit">← Retour aux notes</button></div>` : ''}
      <div class="brain-filters">${filters.map(([id, l, c]) => `<button class="chip-btn ${brainState.f === id ? 'on' : ''}" data-f="${id}">${l} <small>${c}</small></button>`).join('')}
        ${archivedCount && !brainState.arch ? `<button class="chip-btn arch-chip" id="arch-open" title="Notes archivées">🗄 Archives <small>${archivedCount}</small></button>` : ''}</div>
      ${topTags.length ? `<div class="brain-tags"><span>Étiquettes</span>${topTags.map(([t, c]) => `<button class="chip-btn tagf ${brainState.tag === t ? 'on' : ''}" data-tag="${esc(t)}">#${esc(t)} <small>${c}</small></button>`).join('')}</div>` : ''}
    </div>
    <div class="note-grid view-${brainView()}" id="ng"></div>
    <div class="bulk-bar" id="bulk" hidden></div>`;
  $$('[data-bview]').forEach((b) => (b.onclick = () => {
    try { localStorage.setItem('lp.brainView', b.dataset.bview); } catch { /* ignore */ }
    $$('[data-bview]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    $('#ng').className = 'note-grid view-' + b.dataset.bview;
  }));

  const drawList = () => {
    const words = brain.norm(brainState.q).split(/\s+/).filter(Boolean);
    const list = notes.filter((n) => {
      if (brainState.f === 'inbox' && !n.inbox) return false;
      if (brainState.f === 'pinned' && !n.pinned) return false;
      if (!['all', 'inbox', 'pinned'].includes(brainState.f) && n.type !== brainState.f) return false;
      if (brainState.tag && !(n.tags || []).includes(brainState.tag)) return false;
      const hay = brain.norm(`${n.title} ${n.body} ${(n.tags || []).join(' ')}`);
      return words.every((w) => hay.includes(w));
    }).sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
    brainState.order = list.map((x) => x.id);
    $('#ng').innerHTML = list.map((x) => noteCard(x, projStats(x))).join('') || (notes.length || brainState.arch
      ? `<p class="empty">${brainState.arch ? 'Aucune note archivée ne correspond.' : 'Aucune note ne correspond.'}</p>${brainState.arch ? '' : '<p class="empty-acts"><button type="button" class="btn" data-qa="" data-qa-type="note">＋ Nouvelle note</button></p>'}`
      : `<div class="card brain-empty"><h2>Bienvenue dans ton second cerveau 🧠</h2>
          <p>Un endroit pour tout ce que tu ne veux pas oublier : idées, choses apprises, livres, citations, personnes, projets.</p>
          <ol><li><b>Capture</b> une idée en deux secondes, sans réfléchir où la ranger.</li>
          <li><b>Classe-la</b> plus tard : choisis son type et ajoute des <code>#étiquettes</code>.</li>
          <li><b>Relie</b> tes notes en écrivant <code>[[Titre d’une autre note]]</code>.</li>
          <li><b>Redécouvre</b> tes anciennes notes pour qu’elles restent en mémoire.</li></ol>
          <p class="muted">Chaque action donne des points de Savoir : ton avatar gagne des étincelles, un compagnon hibou, une aura… jusqu’au stade Archisage.</p></div>`);
    markSel();
    // Au doigt : balayer → pour archiver (ou ressortir des archives), ← pour épingler / désépingler
    $$('#ng .note-card').forEach((card) => {
      const nid = idOf(card);
      const name = card.querySelector('.nc-head b')?.textContent || 'Note';
      swipeable(card, {
        right: { label: brainState.arch ? '↩ Ressortir' : '🗄 Archiver', run: async () => {
          const to = !brainState.arch;
          await brain.setArchived(nid, to);
          await renderBrainKeep([]);
          showUndo(`${to ? '🗄 Archivée' : '↩ Ressortie'} : « ${name} »`, async () => { await brain.setArchived(nid, !to); router(); }, 5000);
        } },
        left: { label: card.classList.contains('pinned') ? '📌 Détacher' : '📌 Épingler', run: async () => {
          const n = await db.get('notes', nid);
          if (!n) return;
          n.pinned = !n.pinned;
          await brain.saveNote(n, { touch: false });
          await renderBrainKeep([]);
          toast(n.pinned ? `📌 « ${name} » épinglée` : `« ${name} » détachée`);
        } },
      });
    });
  };

  /* ---------- Sélection multiple : classer plusieurs éléments d'un coup ---------- */
  let selecting = false;
  const sel = new Set();
  const idOf = (card) => card.getAttribute('href')?.replace('#/note/', '');
  const markSel = () => $$('#ng .note-card').forEach((c) => c.classList.toggle('sel', sel.has(idOf(c))));
  const allProjects = brain.projectsOf(everything).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  const rbqModules = (await db.all('study')).filter((x) => x.kind === 'module').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const drawBulk = () => {
    const bar = $('#bulk');
    bar.hidden = !selecting;
    $('#ng').classList.toggle('selecting', selecting);
    $('#bsel').classList.toggle('on', selecting);
    $('#bsel').setAttribute('aria-pressed', String(selecting));
    $('#bsel').textContent = selecting ? '✕ Terminer' : '☑ Sélectionner';
    if (!selecting) return;
    const n = sel.size, dis = n ? '' : 'disabled';
    bar.innerHTML = `
      <div class="bulk-top"><b>${n ? `${n} sélectionné${n > 1 ? 's' : ''}` : 'Touche des éléments pour les sélectionner'}</b>
        <button type="button" class="btn sm-text" data-b="all">Tout sélectionner (${brainState.order.length})</button>
        ${n ? '<button type="button" class="btn sm-text" data-b="none">Aucun</button>' : ''}
        <button type="button" class="btn icon bulk-x" data-b="close" aria-label="Fermer la sélection" title="Fermer">×</button></div>
      <div class="bulk-acts">
        <select data-b="type" ${dis} aria-label="Changer le type"><option value="">Type…</option>${brain.TYPES.map((t) => `<option value="${t.id}">${t.icon} ${t.name}</option>`).join('')}</select>
        ${allProjects.length ? `<select data-b="proj" ${dis} aria-label="Associer à un projet"><option value="">Projet…</option>${allProjects.map((p) => `<option value="${p.id}">🚀 ${esc(p.title || 'Projet')}</option>`).join('')}</select>` : ''}
        ${rbqModules.length ? `<select data-b="rbq" ${dis} aria-label="Associer à un module du cours RBQ"><option value="">Cours RBQ…</option>${rbqModules.map((m) => `<option value="${m.id}">📘 ${esc(m.title || 'Module')}</option>`).join('')}</select>` : ''}
        <input data-b="tag" ${dis} placeholder="+ étiquette" aria-label="Ajouter une étiquette (Entrée)" autocomplete="off">
        <button type="button" class="btn" data-b="ok" ${dis} title="Retirer de « À classer »">✓ Classé</button>
        <button type="button" class="btn" data-b="pin" ${dis}>📌 Épingler</button>
        <button type="button" class="btn" data-b="arch" ${dis}>${brainState.arch ? '↩ Désarchiver' : '🗄 Archiver'}</button>
        <button type="button" class="btn danger" data-b="del" ${dis}>🗑 Supprimer</button>
      </div>`;
    // Applique un changement à chaque élément sélectionné, puis redessine
    const each = async (fn, msg) => {
      const ids = [...sel];
      for (const id of ids) { const cur = await db.get('notes', id); if (cur) await fn(cur); }
      toast(`${msg} · ${ids.length} élément${ids.length > 1 ? 's' : ''}`);
      await renderBrainKeep(ids);
    };
    const classify = (fn) => async (cur) => { fn(cur); cur.inbox = false; await brain.saveNote(cur); }; // classer = sortir de « À classer »
    bar.querySelector('[data-b="all"]').onclick = () => { brainState.order.forEach((id) => sel.add(id)); markSel(); drawBulk(); };
    bar.querySelector('[data-b="none"]')?.addEventListener('click', () => { sel.clear(); markSel(); drawBulk(); });
    bar.querySelector('[data-b="close"]').onclick = () => { selecting = false; sel.clear(); markSel(); drawBulk(); };
    bar.querySelector('[data-b="type"]').onchange = (e) => { const t = e.target.value; if (t) each(classify((c) => { c.type = t; }), `${brain.typeOf(t).icon} ${brain.typeOf(t).name}`); };
    bar.querySelector('[data-b="proj"]')?.addEventListener('change', (e) => { const p = e.target.value; if (p) each(classify((c) => { c.rel ||= {}; c.rel.projects = [...new Set([...(c.rel.projects || []), p])]; }), '🚀 Associés au projet'); });
    // Cours RBQ : les éléments vont dans la cellule « 🧠 Du Cerveau » du module (comme « 🧷 Associé à »)
    bar.querySelector('[data-b="rbq"]')?.addEventListener('change', (e) => {
      const mid = e.target.value;
      if (!mid) return;
      const mod = rbqModules.find((m) => m.id === mid);
      each(async (c) => { await assoc.toggle(c, 'rbq', mid, true); await classify(() => {})(c); }, `📘 Associés à « ${mod?.title || 'module'} »`);
    });
    bar.querySelector('[data-b="tag"]').onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const t = e.target.value.replace(/^#/, '').trim().toLowerCase().replace(/\s+/g, '-');
      if (t) each(classify((c) => { if (!(c.tags || []).includes(t)) c.body = (c.body || '').trimEnd() + '\n\n#' + t; }), `#${t} ajoutée`);
    };
    bar.querySelector('[data-b="ok"]').onclick = () => each(classify(() => {}), '✓ Classés');
    bar.querySelector('[data-b="pin"]').onclick = () => each(async (c) => { c.pinned = true; await brain.saveNote(c, { touch: false }); }, '📌 Épinglés');
    bar.querySelector('[data-b="arch"]').onclick = async () => {
      const ids = [...sel], to = !brainState.arch;
      for (const id of ids) await brain.setArchived(id, to);
      await renderBrainKeep(ids);
      showUndo(`${to ? '🗄 Archivés' : '↩ Désarchivés'} · ${ids.length} élément${ids.length > 1 ? 's' : ''}`, async () => {
        for (const id of ids) await brain.setArchived(id, !to);
        router();
      }, 6000);
    };
    const del = bar.querySelector('[data-b="del"]');
    del.onclick = async () => {
      if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = `Confirmer (${sel.size})`; return; }
      const ids = [...sel];
      for (const id of ids) await brain.deleteNote(id);
      sel.clear();
      toast(`🗑 ${ids.length} élément${ids.length > 1 ? 's' : ''} supprimé${ids.length > 1 ? 's' : ''}`);
      await renderBrainKeep([]);
    };
  };
  // Redessine le Cerveau en restant en mode sélection (les éléments encore visibles restent sélectionnés)
  const renderBrainKeep = async (ids) => { brainKeepSel = ids; await renderBrain(); };
  if (brainKeepSel) {
    selecting = true;
    for (const id of brainKeepSel) if (notes.some((x) => x.id === id)) sel.add(id);
    brainKeepSel = null;
  }
  $('#bsel').onclick = () => { selecting = !selecting; if (!selecting) sel.clear(); markSel(); drawBulk(); };
  // En mode sélection, toucher une carte la sélectionne au lieu de l'ouvrir
  $('#ng').addEventListener('click', (e) => {
    if (!selecting) return;
    const card = e.target.closest('.note-card');
    if (!card) return;
    e.preventDefault();
    const id = idOf(card);
    sel.has(id) ? sel.delete(id) : sel.add(id);
    card.classList.toggle('sel', sel.has(id));
    drawBulk();
  });
  drawList();
  drawBulk();

  $('#bq').oninput = (e) => { brainState.q = e.target.value; drawList(); };
  $('#arch-open')?.addEventListener('click', () => { brainState.arch = true; brainState.f = 'all'; brainState.tag = ''; renderBrain(); });
  $('#arch-exit')?.addEventListener('click', () => { brainState.arch = false; brainState.f = 'all'; brainState.tag = ''; renderBrain(); });
  $$('[data-f]').forEach((b) => (b.onclick = () => {
    brainState.f = b.dataset.f;
    $$('[data-f]').forEach((x) => x.classList.toggle('on', x === b));
    drawList();
  }));
  $$('[data-tag]').forEach((b) => (b.onclick = () => {
    brainState.tag = brainState.tag === b.dataset.tag ? '' : b.dataset.tag;
    $$('[data-tag]').forEach((x) => x.classList.toggle('on', x.dataset.tag === brainState.tag));
    drawList();
  }));
  $('#qt-open')?.addEventListener('click', () => quickTriage(() => renderBrain()));
  $('#new-note').onclick = async () => {
    const n = await brain.createNote({ type: 'note' });
    location.hash = '#/note/' + n.id;
  };
  bindCapture($('#cap'), () => renderBrain());

  // Consultés récemment : les dernières notes ouvertes, une à la fois, avec ‹ › de chaque côté
  const recentAll = await brain.allNotes();
  const recent = recentNoteIds().map((id) => recentAll.find((x) => x.id === id)).filter(Boolean);
  const redisc = async () => {
    const el = $('#c-redisc');
    if (!el) return;
    if (!recent.length) {
      el.innerHTML = '<div class="card-head"><h2>🕘 Consultés récemment</h2></div><p class="empty-sm">Les éléments du Cerveau que tu ouvres apparaîtront ici, pour y revenir en un clic.</p>';
      return;
    }
    recentIdx = Math.min(Math.max(recentIdx, 0), recent.length - 1);
    const n = recent[recentIdx];
    const v = youtubeVideos(n.body)[0];
    const pic = images.refsIn(n.body)[0];
    // Miniature : image de l'élément (Amazon, actualité, Reddit, Facebook), photo de la note ou vidéo YouTube
    const thumb = n.source?.img ? `<img class="rc-thumb ${n.source.kind === 'amazon' ? 'contain' : ''}" src="${esc(n.source.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
      : pic ? `<img class="rc-thumb" data-img="${pic}" alt="">`
      : v ? `<img class="rc-thumb" src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
    el.innerHTML = `<div class="card-head"><h2>🕘 Consultés récemment</h2><span class="muted">${recentIdx + 1}/${recent.length}</span></div>
      <div class="rc-row">
        <button class="rc-arrow" id="rc-prev" ${recentIdx === 0 ? 'disabled' : ''} aria-label="Élément plus récent" title="Plus récent">‹</button>
        <a class="redisc" href="#/note/${n.id}">
          ${thumb}
          <b>${brain.typeOf(n.type).icon} ${esc(n.title || 'Sans titre')}</b>
          <p>${esc(brain.excerpt(cardText(n.body), 140)) || '<span class="muted">Note vide</span>'}</p></a>
        <button class="rc-arrow" id="rc-next" ${recentIdx === recent.length - 1 ? 'disabled' : ''} aria-label="Élément consulté avant" title="Consulté avant">›</button>
      </div>`;
    $('#rc-prev').onclick = () => { recentIdx--; redisc(); };
    $('#rc-next').onclick = () => { recentIdx++; redisc(); };
  };
  await Promise.all([evoCard(), redisc()]);
}

// Objectifs d'un projet dont les missions sont dépliées (sur cet appareil)
const pgOpen = () => { try { return new Set(JSON.parse(localStorage.getItem('lp.pgOpen')) || []); } catch { return new Set(); } };
function togglePgOpen(id, force) {
  const s = pgOpen();
  const open = force ?? !s.has(id);
  open ? s.add(id) : s.delete(id);
  try { localStorage.setItem('lp.pgOpen', JSON.stringify([...s])); } catch { /* ignore */ }
  return open;
}

// ▶ sur une carte (ou « 📺 Dans le dock » dans une note) : la vidéo joue dans le dock, la page reste visible
document.addEventListener('click', async (e) => {
  const b = e.target.closest?.('[data-dock-note]');
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();
  const n = await db.get('notes', b.dataset.dockNote);
  const v = youtubeVideos(n?.body)[Number(b.dataset.dockIdx) || 0];
  if (!v) return;
  const title = (n.source?.kind === 'news' && n.source.title) || n.title || 'Vidéo';
  videodock.open({ id: v.id, start: v.start, title, noteId: n.id });
  // Dans la note : on arrête le lecteur de la page (la vidéo continue dans le dock)
  const inline = document.querySelector('#n-video iframe');
  if (inline && b.closest('#n-video')) inline.src = 'about:blank';
}, true);

/** Vidéos YouTube d'un texte : [{ id, start (s), short }], sans doublon, dans l'ordre. */
function youtubeVideos(text = '') {
  const out = new Map();
  const re = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?[^\s)]*?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})([^\s)]*)/g;
  for (const m of text.matchAll(re)) {
    const id = m[1];
    const t = (m[2].match(/[?&]t=(?:(\d+)h)?(?:(\d+)m)?(\d+)s?/) || []);
    const start = t.length ? (Number(t[1] || 0) * 3600 + Number(t[2] || 0) * 60 + Number(t[3] || 0)) : 0;
    const cur = out.get(id);
    if (!cur) out.set(id, { id, start, short: /\/shorts\//.test(m[0]) || /#short\b/.test(text) });
    else if (!cur.start && start) cur.start = start; // le lien « ⏱ Rendu à … » donne où reprendre
  }
  return [...out.values()];
}

async function renderNote(id) {
  const n = await db.get('notes', id);
  if (!n) { view.innerHTML = '<div class="empty">Note introuvable. <a href="#/brain">Retour au Cerveau</a></div>'; return; }
  rememberNote(n.id);
  let origTitle = n.title;
  let deleted = false;
  let pending = Promise.resolve();
  const today = iso(new Date());
  // Élément précédent / suivant : dans l'ordre de la liste du Cerveau telle qu'elle était affichée
  // (filtre, étiquette, recherche) ; sinon toutes les notes du même groupe (actives ou archivées).
  if (!brainState.order.includes(id)) {
    brainState.order = (await brain.allNotes()).filter((x) => !!x.archived === !!n.archived)
      .sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt)).map((x) => x.id);
  }
  const pos = brainState.order.indexOf(id);
  const prevId = brainState.order[pos - 1], nextId = brainState.order[pos + 1];

  view.innerHTML = `
    <header class="page-head note-head">
      <div class="grow"><a href="#/brain" class="eyebrow">← Cerveau</a>
        <div class="note-title-row">
          <input id="n-title" class="note-title" value="${esc(n.title)}" placeholder="Titre de la note" maxlength="80" autocomplete="off">
          ${brainState.order.length > 1 ? `<nav class="note-nav" aria-label="Autres éléments du Cerveau">
            <button class="btn" id="n-prev" ${prevId ? '' : 'disabled'} title="Élément précédent (Alt + ←)" aria-label="Élément précédent">‹</button>
            <small class="muted">${pos + 1}/${brainState.order.length}</small>
            <button class="btn" id="n-next" ${nextId ? '' : 'disabled'} title="Élément suivant (Alt + →)" aria-label="Élément suivant">›</button>
          </nav>` : ''}
        </div></div>
      <div class="head-actions">
        <select id="n-type" style="width:auto" aria-label="Type">${brain.TYPES.map((t) => `<option value="${t.id}" ${t.id === n.type ? 'selected' : ''}>${t.icon} ${t.name}</option>`).join('')}</select>
        <button class="btn" id="n-pin">${n.pinned ? '📌 Épinglée' : '📌 Épingler'}</button>
        <button class="btn" id="n-task" title="Crée une mission pour aujourd’hui et range cette note dans les Archives">✅ Créer Mission</button>
        <button class="btn" id="n-arch" title="${n.archived ? 'Remettre la note avec les autres' : 'Ranger la note dans les archives (elle garde son type)'}">${n.archived ? '↩ Désarchiver' : '🗄 Archiver'}</button>
        <button class="btn danger" id="n-del">Supprimer</button>
      </div>
    </header>
    ${n.archived ? `<div class="arch-banner">🗄 Cette note est archivée${n.archivedAt ? ` depuis le ${U.fmtShort(new Date(n.archivedAt))}` : ''} : elle n’apparaît plus que dans les Archives du Cerveau. Elle reste de type ${brain.typeOf(n.type).icon} ${brain.typeOf(n.type).name}.</div>` : ''}
    <div id="n-inbox"></div>
    <div class="note-layout">
      <div class="note-left">
      <section class="card project-panel" id="n-proj" hidden></section>
      <section class="card note-video" id="n-video" hidden></section>
      ${['news', 'reddit', 'amazon', 'facebook', 'link'].includes(n.source?.kind) && n.source.img ? (() => {
        let host = ''; try { host = new URL(n.source.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
        const reddit = n.source.kind === 'reddit', amz = n.source.kind === 'amazon';
        return `<section class="card note-article"><a href="${esc(n.source.url)}" target="_blank" rel="noopener" class="na-img"><img src="${esc(n.source.img)}" alt="" referrerpolicy="no-referrer" onerror="this.closest('.note-article').remove()"></a>
          <div class="na-bar"><span class="muted">${reddit ? '👽 Reddit' : amz ? '🛒 Amazon' : '📰 ' + esc(host)}</span>${amz && amazonPrice(n) ? `<b class="na-price">${esc(amazonPrice(n))}</b>` : ''}<a class="btn sm-text" href="${esc(n.source.url)}" target="_blank" rel="noopener">${reddit ? 'Voir le post ↗' : amz ? 'Voir l’article ↗' : 'Lire l’article ↗'}</a></div></section>`;
      })() : ''}
      <section class="card note-main">
        <div class="note-tools"><div class="seg"><button data-mode="write">✎ Écrire</button><button data-mode="read">👁 Lire</button></div>
          <span class="note-add"><label class="btn" id="n-photo" title="Joindre une photo ou un document (PDF, Word, EPUB…) — tu peux aussi coller une image avec Ctrl + V"><input type="file" accept="image/*,${docs.ACCEPT}" multiple hidden>📎 Joindre</label></span></div>
        <div id="n-write">
          <textarea id="n-body" placeholder="Écris librement…&#10;&#10;[[Titre]] relie une autre note · #étiquette classe la note · « - » fait une liste · « # » fait un titre">${esc(n.body)}</textarea>
          <div class="suggest" id="n-sug" hidden></div>
        </div>
        <div id="n-read" class="note-read" hidden></div>
      </section>
      </div>
      <aside class="note-side" id="n-side"></aside>
    </div>`;

  const ta = $('#n-body');

  // Lecteur YouTube : si la note contient des liens YouTube, la vidéo se regarde directement ici
  let videoSig = '', videoIdx = 0;
  const drawVideo = () => {
    const el = $('#n-video');
    if (!el) return;
    const vids = youtubeVideos(n.body);
    const sig = vids.map((v) => v.id + ':' + v.start).join('|');
    if (sig === videoSig) return; // même(s) vidéo(s) : on ne recharge pas le lecteur
    videoSig = sig;
    if (videoIdx >= vids.length) videoIdx = 0;
    el.hidden = !vids.length;
    if (!vids.length) { el.innerHTML = ''; return; }
    const v = vids[videoIdx];
    el.innerHTML = `<div class="yt-frame ${v.short ? 'is-short' : ''}">
        <iframe src="https://www.youtube-nocookie.com/embed/${v.id}?rel=0&modestbranding=1${v.start ? '&start=' + v.start : ''}" title="Lecteur YouTube"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>
      <div class="yt-bar">
        ${vids.length > 1 ? `<div class="yt-pick">${vids.map((x, i) => `<button class="chip-btn ${i === videoIdx ? 'on' : ''}" data-yt="${i}">▶ Vidéo ${i + 1}</button>`).join('')}</div>` : '<span></span>'}
        <span class="yt-acts"><button type="button" class="btn sm-text" data-dock-note="${n.id}" data-dock-idx="${videoIdx}" title="La vidéo continue dans le dock pendant que tu changes de page">📺 Dans le dock</button>
          <a class="btn sm-text" href="https://www.youtube.com/watch?v=${v.id}${v.start ? '&t=' + v.start + 's' : ''}" target="_blank" rel="noopener" title="Si la vidéo refuse de jouer ici, ouvre-la sur YouTube">Ouvrir sur YouTube ↗</a></span>
      </div>`;
    $$('[data-yt]', el).forEach((b) => (b.onclick = () => { videoIdx = Number(b.dataset.yt); videoSig = ''; drawVideo(); }));
  };
  drawVideo();
  const save = U.debounce(() => (pending = brain.saveNote(n).then(drawSide).then(drawVideo)), 600);
  const flush = async () => { save.flush(); await pending; };

  // Bandeau « à classer »
  const drawInbox = () => {
    $('#n-inbox').innerHTML = n.inbox ? `<div class="inbox-banner">📥 <span>Cette idée attend d’être classée : choisis son type, ajoute des <b>#étiquettes</b> ou des <b>[[liens]]</b>, puis</span>
      <button class="btn primary" id="n-triage" title="Range la note : elle quitte « À classer » (et te donne quelques points d’XP)">Classer</button></div>` : '';
    $('#n-triage')?.addEventListener('click', async () => {
      n.inbox = false;
      await flush();
      await (pending = brain.saveNote(n));
      drawInbox();
      drawSide();
    });
  };

  // Panneau latéral : liens, rétroliens, étiquettes, suggestions
  async function drawSide() {
    const el = $('#n-side');
    if (!el || deleted) return;
    const all = await brain.allNotes();
    const me = all.find((x) => x.id === n.id) || n;
    const out = (me.links || []).map((l) => ({ l, t: brain.findByTitle(all, l) }));
    const back = brain.backlinks(all, me);
    const linked = new Set([...out.filter((o) => o.t).map((o) => o.t.id), ...back.map((b) => b.id)]);
    const related = (me.tags || []).length
      ? all.filter((x) => x.id !== me.id && !x.archived && !linked.has(x.id) && x.title && (x.tags || []).some((t) => me.tags.includes(t))).slice(0, 5) : [];
    const links = await assoc.linksOf(n);
    const relNotes = me.type === 'projet' ? await assoc.notesFor('projects', me.id) : [];
    const relPages = me.type === 'projet' ? await assoc.pagesFor('projects', me.id) : [];
    el.innerHTML = `
      <section class="card assoc-card"><div class="card-head"><h3>🧷 Associé à</h3><button class="btn sm-text" id="n-assoc">+ Associer</button></div>
        ${links.length ? `<div class="assoc-list">${links.map((l) => `<span class="assoc-chip"><a href="${l.href}" ${l.task ? `data-open-task="${l.task}"` : ''}>${esc(l.label)}</a><button data-unassoc="${l.kind}|${l.id}" aria-label="Retirer l’association">×</button></span>`).join('')}</div>`
          : '<p class="empty-sm">Relie cette note à un projet, un module du cours RBQ, un objectif ou une mission.</p>'}</section>
      ${me.type === 'projet' ? `<section class="card"><h3>🧠 Éléments associés (${relNotes.length + relPages.length})</h3>
        ${relNotes.length + relPages.length ? `<div class="assoc-list">${assoc.noteChips(relNotes)}${assoc.pageChips(relPages)}</div>` : '<p class="empty-sm">Depuis n’importe quelle note ou page manuscrite : « 🧷 Associer » → 🚀 Projet.</p>'}</section>` : ''}
      <section class="card"><h3>🔗 Liens (${out.length})</h3>
        ${out.map(({ l, t }) => t
          ? `<a class="side-link" href="#/note/${t.id}">${brain.typeOf(t.type).icon} ${esc(t.title)}</a>`
          : `<button class="side-link missing" data-create="${esc(l)}" title="Cette note n’existe pas encore : clique pour la créer">＋ ${esc(l)}</button>`).join('')
        || '<p class="empty-sm">Écris <code>[[</code> pour relier une autre note.</p>'}</section>
      <section class="card"><h3>↩︎ Rétroliens (${back.length})</h3>
        ${back.map((b) => `<a class="side-link" href="#/note/${b.id}">${brain.typeOf(b.type).icon} ${esc(b.title || 'Sans titre')}<small>${esc(brain.excerpt(b.body, 70))}</small></a>`).join('')
        || '<p class="empty-sm">Aucune note ne pointe encore ici.</p>'}</section>
      ${(me.tags || []).length ? `<section class="card"><h3># Étiquettes</h3><div class="filters">${me.tags.map((t) => `<button class="chip-btn" data-gotag="${esc(t)}">#${esc(t)}</button>`).join('')}</div></section>` : ''}
      ${related.length ? `<section class="card"><h3>✨ À relier ?</h3><p class="empty-sm" style="padding-top:0">Ces notes partagent une étiquette.</p>
        ${related.map((r) => `<div class="side-rel"><a href="#/note/${r.id}">${brain.typeOf(r.type).icon} ${esc(r.title)}</a><button class="btn" data-relate="${esc(r.title)}">Relier +${game.XP.link}</button></div>`).join('')}</section>` : ''}
      <section class="card note-info muted">
        Créée le ${U.fmtShort(new Date(me.createdAt))} · modifiée le ${U.fmtShort(new Date(me.updatedAt))}<br>
        ${me.reviews ? `Relue ${me.reviews} fois` : 'Jamais relue'}${brain.reviewedToday(me) ? ' · relue aujourd’hui ✓' : ''}
      </section>`;
  }

  // Projet : objectifs associés (et leurs missions)
  async function drawProject() {
    const el = $('#n-proj');
    if (!el || deleted) return;
    el.hidden = n.type !== 'projet';
    if (el.hidden) return;
    const [goals, tasks] = await Promise.all([loadGoals(), db.all('tasks')]);
    const st = brain.projectStats(n.id, goals, tasks);
    const others = goals.filter((g) => g.projectId !== n.id && !g.done); // un objectif terminé n'est plus proposé
    const sortM = (a, b) => a.done - b.done || (a.date || '9999').localeCompare(b.date || '9999') || (a.order ?? 1e15) - (b.order ?? 1e15) || a.createdAt - b.createdAt;
    el.innerHTML = `<div class="card-head"><h2>🎯 Objectifs et missions du projet</h2>
        <span class="muted">${st.goals.length || st.direct.length ? `${st.pct} %${st.missions ? ` · ${st.done}/${st.missions} missions` : ''}` : ''}</span></div>
      ${st.goals.length || st.direct.length ? `<div class="xp-bar proj-bar"><i style="width:${st.pct}%"></i></div>` : '<p class="empty-sm">Ajoute des objectifs ou des missions à ce projet : son avancement les suivra.</p>'}
      ${(() => {
        // Objectifs en cours en haut ; ceux atteints (ou abandonnés) dans une section repliable
        const sorted = [...st.goals].sort(goalSort);
        const closed = sorted.filter((g) => g.done);
        const active = sorted.filter((g) => !g.done);
        const doneKey = 'done:' + n.id;
        return active.map(goalBlock).join('')
          + (closed.length ? `<details class="pg-done-fold" data-pgdone="${doneKey}" ${pgOpen().has(doneKey) ? 'open' : ''}>
              <summary><span class="exp">›</span> 🏁 ${closed.length} objectif${closed.length > 1 ? 's' : ''} terminé${closed.length > 1 ? 's' : ''}</summary>
              ${closed.map(goalBlock).join('')}
            </details>` : '');
      })()}
      ${''}`;
    function goalBlock(g) {
        const ms = tasks.filter((t) => t.goalId === g.id).sort(sortM);
        return `<div class="pgoal ${goalClass(g)}" data-gid="${g.id}" ${g.done ? "" : `data-drop-goal="${g.id}"`}>
          <div class="pg-head"><a href="#/goals" data-opengoal="${g.id}" title="Ouvrir dans Objectifs">${goalMark(g)}${esc(g.title)}</a>
            <span class="pct">${g.progress}%</span>
            <button class="btn icon sm pg-gear" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Options de l’objectif" title="Options">⚙</button>
            <div class="pg-menu" role="menu" hidden>
              <label class="pg-menu-row">Échéance <select class="pg-hz" data-hz="${g.id}" aria-label="Échéance">${hzOptions(g.horizon || '')}</select></label>
              <button class="pg-plus" type="button" role="menuitem">＋ Ajouter une mission</button>
              <button class="g-done ${g.done ? 'on' : ''}" type="button" role="menuitem" data-gdone="${g.id}">${g.done ? '↺ Rouvrir l’objectif' : '✓ Conclure l’objectif'}</button>
              <button class="pg-unlink" type="button" role="menuitem" data-unlink="${g.id}">× Retirer du projet</button>
            </div></div>
          <div class="bar"><i style="width:${g.progress}%"></i></div>
          ${goalVerdict(g)}
          ${ms.length ? (() => {
            // Missions de l'objectif : repliées par défaut, avec un résumé (le choix est gardé sur cet appareil)
            const open = pgOpen().has(g.id);
            const md = ms.filter((t) => t.done).length;
            const late = ms.filter((t) => !t.done && t.date && t.date < today).length;
            return `<button type="button" class="pg-fold" data-pgfold="${g.id}" aria-expanded="${open}">
                <span class="exp">›</span> ${md}/${ms.length} mission${ms.length > 1 ? 's' : ''} accomplie${ms.length > 1 ? 's' : ''}${late ? ` · <span class="pg-late">⚠ ${late} en retard</span>` : ''}</button>
              <ul class="tasks" ${open ? '' : 'hidden'}>${ms.map((t) => taskHTML(t, today, { hideGoal: true, showDate: true })).join('')}</ul>`;
          })() : ''}
          <form class="add-mission pg-add" hidden><input name="t" placeholder="Mission pour cet objectif…" autocomplete="off">
            <input name="d" type="date" value="${today}" aria-label="Date prévue (facultatif)"><button class="btn icon" aria-label="Ajouter la mission">+</button>${QUICK_DATES}</form>
        </div>`;
    }
    el.innerHTML += `
      <div class="pgoal pdirect">
        <div class="pg-head"><b>📋 Missions du projet</b><span class="muted">${st.direct.length ? `${st.direct.filter((t) => t.done).length}/${st.direct.length}` : ''}</span>
          <button class="btn icon sm pd-toggle" type="button" aria-label="Ajouter une mission au projet" title="Ajouter une mission">+</button></div>
        ${st.direct.length ? `<ul class="tasks">${st.direct.sort(sortM).map((t) => taskHTML(t, today, { showDate: true, hideProject: true })).join('')}</ul>`
          : '<p class="empty-sm">Des missions directement liées au projet, sans objectif. Touche + pour en ajouter.</p>'}
        <form class="add-mission pd-add" hidden><input name="t" placeholder="Nouvelle mission du projet…" autocomplete="off">
          <input name="d" type="date" value="${today}" aria-label="Date prévue (facultatif)"><button class="btn icon" aria-label="Ajouter la mission">+</button>${QUICK_DATES}</form>
        ${(() => { const free = tasks.filter((t) => !t.done && !t.projectId && !t.goalId); return free.length ? `<select class="pd-link" aria-label="Lier une mission existante"><option value="">🔗 Lier une mission existante…</option>${free.map((t) => `<option value="${t.id}">${esc(t.title)}</option>`).join('')}</select>` : ''; })()}
      </div>
      <form class="proj-new">
        <input name="title" placeholder="Nouvel objectif pour ce projet…" autocomplete="off">
        <select name="horizon" aria-label="Échéance">${hzOptions('')}</select>
        <button class="btn primary">Ajouter</button>
      </form>
      ${others.length ? `<select class="proj-link" aria-label="Associer un objectif existant"><option value="">🔗 Associer un objectif existant…</option>
        ${others.filter((g) => !g.done).map((g) => `<option value="${g.id}">${esc(g.title)}${g.projectId ? ' (déjà dans un autre projet)' : ''}</option>`).join('')}</select>` : ''}`;

    bindTaskList(el, drawProject);
    bindGoalDrops(el, drawProject); // glisser une mission (⋮⋮) sur un objectif : elle s'y rattache
    // Section « objectifs terminés » : ouverte ou fermée, le choix est gardé (comme les missions d'un objectif)
    $$('[data-pgdone]', el).forEach((d) => (d.ontoggle = () => { if (pgOpen().has(d.dataset.pgdone) !== d.open) togglePgOpen(d.dataset.pgdone); }));
    $$('.pg-add', el).forEach((f) => (f.onsubmit = async (e) => {
      e.preventDefault();
      const v = f.t.value.trim();
      if (!v) return;
      const gid = f.closest('.pgoal').dataset.gid;
      await addTask(v, f.d.value || null, gid);
      await drawProject();
      // La boîte reste ouverte pour enchaîner plusieurs missions
      const nf = $(`.pgoal[data-gid="${gid}"] .pg-add`);
      if (nf) { nf.hidden = false; nf.t.focus(); }
    }));
    // ✓ Terminer / ↺ Rouvrir un objectif du projet (vert, en bas de la liste)
    $$('[data-gdone]', el).forEach((b) => (b.onclick = () => concludeGoal(b.dataset.gdone, () => drawProject())));
    // « + » d'un objectif : affiche (ou cache) la boîte d'ajout de mission
    $$('[data-pgfold]', el).forEach((b) => (b.onclick = () => {
      const open = togglePgOpen(b.dataset.pgfold);
      b.setAttribute('aria-expanded', String(open));
      b.nextElementSibling.hidden = !open;
    }));
    $$('.pg-plus', el).forEach((b) => (b.onclick = () => {
      const f = b.closest('.pgoal').querySelector('.pg-add');
      f.hidden = !f.hidden;
      closePgMenus();
      if (!f.hidden) f.t.focus();
    }));
    // ⚙ d'un objectif : petit menu (échéance, ajouter, conclure, retirer)
    function closePgMenus(keep) {
      $$('.pg-menu', el).forEach((m) => { if (m !== keep) { m.hidden = true; m.previousElementSibling.setAttribute('aria-expanded', 'false'); } });
    }
    $$('.pg-gear', el).forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      const m = b.nextElementSibling;
      closePgMenus(m);
      m.hidden = !m.hidden;
      b.setAttribute('aria-expanded', String(!m.hidden));
    }));
    if (!el.dataset.pgMenuBound) {
      el.dataset.pgMenuBound = '1';
      document.addEventListener('click', (e) => { if (!e.target.closest('.pg-menu, .pg-gear')) closePgMenus(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePgMenus(); });
    }
    // Missions directes du projet
    $('.pd-toggle', el).onclick = () => { const f = $('.pd-add', el); f.hidden = !f.hidden; if (!f.hidden) f.t.focus(); };
    $('.pd-add', el).onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, v = f.t.value.trim();
      if (!v) return;
      await addTask(v, f.d.value || null, null, n.id);
      await drawProject();
      const nf = $('.pd-add', el); nf.hidden = false; nf.t.focus();
    };
    $('.pd-link', el)?.addEventListener('change', async (e) => { if (e.target.value) { await setTaskProject(e.target.value, n.id); drawProject(); } });
    $('.proj-new', el).onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const title = f.title.value.trim();
      if (!title) return;
      const id = U.uid();
      await db.put('goals', { id, title, horizon: f.horizon.value, projectId: n.id, progress: 0, createdAt: Date.now() });
      toast(`🎯 Objectif « ${title} » ajouté au projet`);
      await drawProject();
      $(`.pgoal[data-gid="${id}"] .pg-plus`)?.click(); // nouvel objectif : la boîte « mission » s'ouvre tout de suite
    };
    const link = $('.proj-link', el);
    if (link) link.onchange = async () => { if (link.value) { await brain.setGoalProject(link.value, n.id); drawProject(); } };
    $$('.pg-hz', el).forEach((s) => (s.onchange = async () => {
      const g = await db.get('goals', s.dataset.hz);
      g.horizon = s.value;
      await db.put('goals', g);
      toast(`📅 Échéance : ${HZ_LABEL[g.horizon]}`);
    }));
  }

  // Écrire / Lire
  const setMode = async (m) => {
    $$('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    $('#n-write').hidden = m !== 'write';
    $('#n-read').hidden = m !== 'read';
    if (m === 'read') { await flush(); $('#n-read').innerHTML = brain.renderBody(n.body, await brain.allNotes()); }
    else ta.focus();
  };
  $$('.seg button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

  // Suggestions quand on tape [[
  const sug = $('#n-sug');
  const suggest = async () => {
    const m = ta.value.slice(0, ta.selectionStart).match(/\[\[([^[\]\n]{0,40})$/);
    if (!m) { sug.hidden = true; return; }
    const q = brain.norm(m[1]);
    const hits = (await brain.allNotes()).filter((x) => x.id !== n.id && !x.archived && x.title && brain.norm(x.title).includes(q)).slice(0, 6);
    const typed = m[1].trim();
    const exact = hits.some((h) => brain.norm(h.title) === q);
    sug.innerHTML = '<span class="muted">Relier à :</span>'
      + hits.map((x) => `<button type="button" data-t="${esc(x.title)}">${brain.typeOf(x.type).icon} ${esc(x.title)}</button>`).join('')
      + (typed && !exact ? `<button type="button" data-t="${esc(typed)}">＋ « ${esc(typed)} » (nouvelle)</button>` : '')
      + (!hits.length && !typed ? '<span class="muted">tape le titre d’une note…</span>' : '');
    sug.hidden = false;
    $$('button', sug).forEach((b) => (b.onpointerdown = (e) => {
      e.preventDefault();
      const pos = ta.selectionStart;
      const after = ta.value.slice(pos);
      const start = pos - m[1].length;
      ta.value = ta.value.slice(0, start) + b.dataset.t + (after.startsWith(']]') ? '' : ']]') + after;
      const np = start + b.dataset.t.length + 2;
      ta.setSelectionRange(np, np);
      n.body = ta.value;
      save();
      sug.hidden = true;
      ta.focus();
    }));
  };

  ta.oninput = () => { n.body = ta.value; save(); suggest(); };
  ta.onclick = suggest;
  // Images : coller, glisser ou 📷 -> une ligne « ![](img:…) » à l'endroit du curseur
  const insertImages = async (list) => {
    if (!list.length) return;
    toast(`📷 Ajout de ${list.length > 1 ? list.length + ' images' : 'l’image'}…`);
    try {
      const ids = [];
      for (const f of list) ids.push(await images.save(f));
      const at = ta.selectionStart ?? ta.value.length;
      const before = ta.value.slice(0, at), after = ta.value.slice(at);
      const ins = (before && !before.endsWith('\n') ? '\n' : '') + ids.map(images.refLine).join('\n') + '\n';
      ta.value = before + ins + after;
      ta.selectionStart = ta.selectionEnd = (before + ins).length;
      n.body = ta.value;
      save();
      toast(`📷 Image${ids.length > 1 ? 's' : ''} ajoutée${ids.length > 1 ? 's' : ''} — passe en mode Lire pour la voir`);
    } catch (err) { toast('Impossible d’ajouter l’image : ' + err.message, 'err'); }
  };
  // Coller : texte et photos ensemble (le texte au curseur, puis les photos)
  ta.addEventListener('paste', (e) => {
    const d = docs.docFiles(e.clipboardData?.files);
    if (richPaste(e, (txt) => insertAtCursor(ta, txt), insertImages)) return;
    if (d.length) { e.preventDefault(); insertDocs(d); }
  });
  ta.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  ta.addEventListener('drop', (e) => {
    const f = images.imageFiles(e.dataTransfer), d = docs.docFiles(e.dataTransfer?.files);
    if (f.length || d.length) { e.preventDefault(); insertImages(f); insertDocs(d); }
  });
  // 📎 Joindre : photos et documents par le même bouton (triés automatiquement)
  const pickN = $('#n-photo input');
  pickN.onchange = () => {
    const fs = [...pickN.files];
    insertImages(fs.filter((f) => f.type.startsWith('image/')));
    insertDocs(docs.docFiles(fs));
    pickN.value = '';
  };
  // Documents : une ligne « [📎 nom](file:…) », cliquable en mode Lire
  const insertDocs = async (list) => {
    if (!list.length) return;
    try {
      const ms = [];
      for (const f of list) ms.push(await docs.save(f));
      const at = ta.selectionStart ?? ta.value.length;
      const before = ta.value.slice(0, at), after = ta.value.slice(at);
      const ins = (before && !before.endsWith('\n') ? '\n' : '') + ms.map(docs.refLine).join('\n') + '\n';
      ta.value = before + ins + after;
      n.body = ta.value;
      save();
      toast(`📎 ${ms.length > 1 ? ms.length + ' documents joints' : 'Document joint'} — clique-le en mode Lire pour l’ouvrir`);
    } catch (err) { toast(err.message, 'err'); }
  };
  ta.onblur = () => setTimeout(() => (sug.hidden = true), 150);
  $('#n-title').oninput = (e) => { n.title = e.target.value; save(); };
  $('#n-title').onchange = async () => {
    await flush();
    const count = await brain.renameRefs(origTitle, n.title);
    if (n.title.trim()) await brain.resyncLinksTo(n.title);
    origTitle = n.title;
    if (count) toast(`🔗 ${count} note${count > 1 ? 's mises' : ' mise'} à jour avec le nouveau titre`);
  };
  $('#n-title').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ta.focus(); } };
  $('#n-type').onchange = (e) => { n.type = e.target.value; save(); drawProject(); };
  $('#n-pin').onclick = (e) => { n.pinned = !n.pinned; e.target.textContent = n.pinned ? '📌 Épinglée' : '📌 Épingler'; save(); };
  // Devient une mission : la mission est créée (liée à la note), puis la note est archivée
  $('#n-task').onclick = async () => {
    await flush();
    const t = await addTask(n.title.trim() || brain.excerpt(n.body, 60) || 'Note', today);
    await assoc.toggle(n, 'tasks', t.id, true); // la mission garde un lien vers la note (fenêtre de la mission)
    // Les photos de la note suivent dans les détails de la mission
    const pics = images.refsIn(n.body);
    if (pics.length) {
      const mt = await db.get('tasks', t.id);
      if (mt) { mt.images = [...new Set([...(mt.images || []), ...pics])]; await db.put('tasks', mt); }
    }
    Object.assign(n, await brain.setArchived(n.id, true));
    brainState.arch = false;
    toast(`✅ Mission « ${t.title} » ajoutée pour aujourd’hui — la note est rangée dans les Archives`);
    // On va à la page Missions et on ouvre la nouvelle mission
    history.pushState(null, '', '#/missions');
    await router();
    openTaskEditor(t.id, () => { if (location.hash === '#/missions') routes.missions(); });
  };
  $('#n-arch').onclick = async () => {
    await flush();
    const to = !n.archived;
    Object.assign(n, await brain.setArchived(n.id, to)); // garde la copie en mémoire à jour
    if (to) {
      brainState.arch = false;
      const nid = n.id;
      location.hash = '#/brain';
      showUndo(`🗄 « ${n.title || 'Sans titre'} » archivée`, async () => { await brain.setArchived(nid, false); location.hash = '#/note/' + nid; }, 6000);
    } else {
      toast(`↩ « ${n.title || 'Sans titre'} » est de retour dans le Cerveau`);
      renderNote(n.id);
    }
  };
  // ‹ › : enregistre puis passe à l'élément voisin
  const goTo = async (to) => { if (!to) return; await flush(); location.hash = '#/note/' + to; };
  $('#n-prev')?.addEventListener('click', () => goTo(prevId));
  $('#n-next')?.addEventListener('click', () => goTo(nextId));
  const here = location.hash;
  const onKey = (e) => {
    if (location.hash !== here) { document.removeEventListener('keydown', onKey); return; }
    if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault(); // Alt + ← est aussi « page précédente » du navigateur
    goTo(e.key === 'ArrowLeft' ? prevId : nextId);
  };
  document.addEventListener('keydown', onKey);

  $('#n-del').onclick = async () => {
    if (!(await confirmBox(`Supprimer la note « ${n.title || 'Sans titre'} » ? Ses points seront retirés.`))) return;
    deleted = true;
    await pending;
    await brain.deleteNote(n.id);
    location.hash = '#/brain';
  };

  // Liens cliquables (lecture et panneau)
  const openLink = async (title) => {
    await flush();
    let t = brain.findByTitle(await brain.allNotes(), title);
    if (!t) { t = await brain.createNote({ title }); toast(`Note « ${title} » créée`); }
    location.hash = '#/note/' + t.id;
  };
  view.onclick = async (e) => {
    // Associations (projet, cours RBQ, objectif, mission)
    if (e.target.closest('#n-assoc')) { await flush(); assoc.picker(modal, n, () => drawSide()); return; }
    const ua = e.target.closest('[data-unassoc]');
    if (ua) { const [k, tid] = ua.dataset.unassoc.split('|'); await flush(); await assoc.toggle(n, k, tid, false); drawSide(); return; }
    const ot = e.target.closest('[data-open-task]');
    if (ot) { e.preventDefault(); openTaskEditor(ot.dataset.openTask, () => drawSide()); return; }
    const og = e.target.closest('[data-opengoal]');
    if (og) { openGoals.add(og.dataset.opengoal); return; } // le lien mène à #/goals, objectif déplié
    const ul = e.target.closest('[data-unlink]');
    if (ul) { await brain.setGoalProject(ul.dataset.unlink, null); toast('Objectif retiré du projet (il est gardé dans Objectifs)'); drawProject(); return; }
    const wl = e.target.closest('.wl, [data-create]');
    if (wl) { e.preventDefault(); return openLink(wl.dataset.link || wl.dataset.create); }
    const tag = e.target.closest('[data-gotag], .note-read .tag');
    if (tag) { brainState.tag = tag.dataset.gotag || tag.dataset.tag; brainState.f = 'all'; brainState.q = ''; location.hash = '#/brain'; return; }
    const rel = e.target.closest('[data-relate]');
    if (rel) {
      n.body = (n.body.trimEnd() + `\n- [[${rel.dataset.relate}]]`).trimStart();
      ta.value = n.body;
      save();
      await flush();
      toast('🔗 Notes reliées');
    }
  };

  setCleanup(async () => {
    view.onclick = null;
    if (deleted) return;
    await flush();
    if (!n.title.trim() && !n.body.trim()) await brain.deleteNote(n.id); // note vide abandonnée
  });

  drawInbox();
  await Promise.all([drawSide(), drawProject()]);
  setMode(n.body.trim() ? 'read' : 'write');
  if (!n.title) $('#n-title').focus();
}


export { bindCapture, brainState, captureForm, evoCard, renderBrain, renderNote };
