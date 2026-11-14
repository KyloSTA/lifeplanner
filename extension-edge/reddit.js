// Ajoute un bouton « 🧠 Cerveau » sous chaque post Reddit, seulement dans les fenêtres
// ouvertes depuis le Lanceur de Life Planner. Un clic enregistre le post comme note
// « Ressource » dans le Cerveau (titre, lien, subreddit, auteur, texte).

(() => {
  const FLAG = 'lp-from-launcher';
  const SAVED = 'lp-saved-urls';
  const ORIGIN = 'https://www.reddit.com';

  /* ---------- Ouvert depuis le Lanceur ? ---------- */
  async function fromLauncher() {
    try { if (sessionStorage.getItem(FLAG)) return true; } catch { /* ignore */ }
    // Le Lanceur nomme ses fenêtres « lp-reddit » ; l'extension retient aussi les onglets
    // dont l'ouvreur est Life Planner (si Reddit efface le nom de la fenêtre).
    let yes = /^lp-/.test(window.name || '');
    // Reddit installé comme application dans Edge (mode « App installée » du Lanceur) : la fenêtre
    // de l'app n'a ni nom ni ouvreur, mais elle s'affiche sans barre d'adresse (mode « standalone »).
    if (!yes) yes = ['standalone', 'minimal-ui', 'window-controls-overlay', 'fullscreen'].some((m) => matchMedia(`(display-mode: ${m})`).matches);
    if (!yes) {
      try { yes = !!(await chrome.runtime.sendMessage({ type: 'lp-is-launcher' }))?.yes; } catch { /* ignore */ }
    }
    if (yes) { try { sessionStorage.setItem(FLAG, '1'); } catch { /* ignore */ } }
    return yes;
  }

  /* ---------- Lecture d'un post ---------- */
  const abs = (u) => { try { return new URL(u, ORIGIN).href; } catch { return ''; } };
  const clean = (s) => (s || '').replace(/\n{3,}/g, '\n\n').trim();
  const isReddit = (u) => /^https?:\/\/([a-z0-9-]+\.)?(reddit\.com|redd\.it)\//i.test(u);

  // Image d'un post (pour la miniature dans le Cerveau) : l'image elle-même, l'aperçu d'une vidéo ou d'un lien.
  // On évite avatars, icônes et récompenses.
  const IMG_EXT = /\.(jpe?g|png|webp|gif)(\?|$)/i;
  const isPostImg = (s) => s && /(redd\.it|redditmedia\.com)/i.test(s) && !/avatar|icon|emoji|award|snoo|communityIcon|styles\//i.test(s);
  function imageOf(p, href) {
    if (href && (IMG_EXT.test(href) || /\/\/i\.redd\.it\//i.test(href))) return href;
    for (const r of [p, p.shadowRoot].filter(Boolean)) {
      const v = r.querySelector('shreddit-player, shreddit-player-2, [poster]');
      const poster = v?.getAttribute('poster') || v?.getAttribute('preview');
      if (poster && !/^data:/.test(poster)) return abs(poster);
      const src = [...r.querySelectorAll('img, faceplate-img')].map((e) => e.getAttribute('src') || e.currentSrc).find(isPostImg);
      if (src) return abs(src);
    }
    return '';
  }

  function fromShreddit(p) {
    const permalink = abs(p.getAttribute('permalink') || '');
    const href = abs(p.getAttribute('content-href') || '');
    const body = p.querySelector('[slot="text-body"]') || document.querySelector(`#${CSS.escape(p.id || 'x')}-post-rtjson-content`);
    return {
      postId: p.getAttribute('id') || permalink,
      title: p.getAttribute('post-title') || p.querySelector('[slot="title"]')?.textContent || document.title,
      url: permalink || location.href,
      link: href && !isReddit(href) ? href : '',
      sub: p.getAttribute('subreddit-prefixed-name') || '',
      author: p.getAttribute('author') || '',
      created: p.getAttribute('created-timestamp') || '',
      text: body?.innerText || '',
      img: imageOf(p, href),
    };
  }

  function fromOld(t) {
    const permalink = abs(t.dataset.permalink || '');
    const href = abs(t.dataset.url || '');
    return {
      postId: t.dataset.fullname || permalink,
      title: t.querySelector('a.title')?.textContent || document.title,
      url: permalink || location.href,
      link: href && !isReddit(href) ? href : '',
      sub: t.dataset.subreddit ? 'r/' + t.dataset.subreddit : '',
      author: t.dataset.author || '',
      created: t.dataset.timestamp ? new Date(Number(t.dataset.timestamp)).toISOString() : '',
      text: t.querySelector('.expando .usertext-body .md')?.innerText || '',
      img: IMG_EXT.test(href) ? href : abs(t.querySelector('a.thumbnail img')?.getAttribute('src') || ''),
    };
  }

  /* ---------- Sauvegarde ---------- */
  const savedSet = () => { try { return new Set(JSON.parse(sessionStorage.getItem(SAVED)) || []); } catch { return new Set(); } };
  const markSaved = (url) => { const s = savedSet(); s.add(url); try { sessionStorage.setItem(SAVED, JSON.stringify([...s])); } catch { /* ignore */ } };

  async function save(btn, read) {
    if (btn.disabled) return;
    const post = read();
    const clip = {
      id: 'reddit:' + post.postId,
      kind: 'reddit',
      title: clean(post.title).slice(0, 300),
      url: post.url,
      link: post.link,
      sub: post.sub,
      author: post.author,
      created: post.created,
      text: clean(post.text).slice(0, 4000),
      img: /^https:\/\//.test(post.img || '') ? post.img : '',
      savedAt: Date.now(),
    };
    btn.disabled = true;
    btn.textContent = '⏳ …';
    try {
      const res = await chrome.runtime.sendMessage({ type: 'lp-save', clip });
      markSaved(clip.url);
      setDone(btn, res?.delivered ? '✓ Dans ton Cerveau' : '✓ Gardé — arrivera à l’ouverture de Life Planner');
    } catch {
      btn.disabled = false;
      btn.textContent = '⚠ Recharge la page et réessaie';
    }
  }

  function setDone(btn, text) {
    btn.disabled = true;
    btn.classList.add('lp-done');
    btn.textContent = btn.dataset.inline ? '✓ Cerveau' : text;
    if (btn.dataset.inline) { btn.title = text; btn.style.color = '#4ade80'; btn.style.cursor = 'default'; }
  }

  // Style d'un bouton de la rangée Reddit (↑↓, 💬, partager). Cette rangée est dans le « shadow DOM »
  // du post, où la feuille de style de l'extension ne s'applique pas : style en ligne, couleurs de Reddit.
  const INLINE = 'display:inline-flex;align-items:center;gap:4px;height:32px;padding:0 12px;border:0;border-radius:999px;'
    + 'font:600 12px/1 var(--font-sans, system-ui, "Segoe UI", sans-serif);cursor:pointer;white-space:nowrap;'
    + 'color:var(--color-secondary-plain, var(--color-neutral-content, inherit));background:var(--color-button-secondary-background, rgba(127,127,127,.18));';

  function makeButton(read, tag = 'button', inline = false) {
    const btn = document.createElement(tag);
    btn.className = 'lp-save';
    if (inline) {
      btn.dataset.inline = '1';
      btn.style.cssText = INLINE;
      btn.addEventListener('mouseenter', () => { if (!btn.disabled) btn.style.background = 'var(--color-button-secondary-background-hover, rgba(127,127,127,.3))'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'var(--color-button-secondary-background, rgba(127,127,127,.18))'; });
    }
    btn.textContent = '🧠 Cerveau';
    btn.title = 'Enregistrer ce post dans le Cerveau de Life Planner';
    if (tag === 'a') btn.href = '#';
    btn.addEventListener('click', (e) => {
      // Sur Reddit, tout le post est un lien : on garde le clic pour nous
      e.preventDefault();
      e.stopPropagation();
      save(btn, read);
    }, true);
    if (savedSet().has(read().url)) setDone(btn, '✓ Dans ton Cerveau');
    return btn;
  }

  /* ---------- Ajout des boutons ---------- */
  // Rangée d'actions d'un post (nouveau Reddit) : on se repère sur le bouton Partager, sinon Commentaires
  const ANCHORS = ['shreddit-post-share-button', '[data-post-click-location="share"]', 'button[aria-label*="hare" i]',
    'button[name="comments-action-button"]', 'a[name="comments-action-button"]', '[data-post-click-location="comments-button"]'];
  function actionAnchor(p) {
    for (const root of [p.shadowRoot, p]) {
      if (!root) continue;
      for (const sel of ANCHORS) {
        const el = root.querySelector(sel);
        if (el?.parentElement) return el;
      }
    }
    return null;
  }

  function decorate() {
    // Nouveau Reddit : <shreddit-post>
    for (const p of document.querySelectorAll('shreddit-post:not([data-lp])')) {
      const anchor = actionAnchor(p);
      if (anchor) {
        // En ligne avec ↑↓, 💬, 🔁 et Partager
        p.setAttribute('data-lp', '1');
        anchor.after(makeButton(() => fromShreddit(p), 'button', true));
        continue;
      }
      // La rangée n'est pas encore dessinée : on réessaie ; après ~10 s, bouton sous le post
      const tries = Number(p.dataset.lpTry || 0) + 1;
      p.dataset.lpTry = String(tries);
      if (tries < 8) continue;
      p.setAttribute('data-lp', '1');
      const bar = document.createElement('div');
      bar.className = 'lp-bar';
      bar.append(makeButton(() => fromShreddit(p)));
      p.after(bar);
    }
    // Ancien Reddit (old.reddit.com)
    for (const t of document.querySelectorAll('.thing.link:not([data-lp])')) {
      t.setAttribute('data-lp', '1');
      const ul = t.querySelector('ul.flat-list.buttons');
      if (!ul) continue;
      const li = document.createElement('li');
      li.append(makeButton(() => fromOld(t), 'a'));
      ul.append(li);
    }
  }

  fromLauncher().then((yes) => {
    if (!yes) return;
    decorate();
    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; decorate(); });
    }).observe(document.documentElement, { childList: true, subtree: true });
    // Les rangées d'actions se dessinent dans le shadow DOM, que l'observateur ne voit pas
    setInterval(decorate, 1500);
  });
})();
