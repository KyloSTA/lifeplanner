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
    btn.textContent = text;
  }

  function makeButton(read, tag = 'button') {
    const btn = document.createElement(tag);
    btn.className = 'lp-save';
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
  function decorate() {
    // Nouveau Reddit : <shreddit-post>
    for (const p of document.querySelectorAll('shreddit-post:not([data-lp])')) {
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
  });
})();
