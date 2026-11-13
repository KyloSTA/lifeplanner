// Ajoute des boutons « 🧠 Cerveau » sur YouTube, seulement dans les fenêtres ouvertes depuis le
// Lanceur de Life Planner (ou l'app YouTube installée) :
//  - sous une vidéo, à côté de J'aime / Partager ;
//  - sur chaque vignette (accueil, suggestions, recherche), à côté du menu ⋮ ;
//  - sur un Short, au-dessus du bouton J'aime.
// Un clic enregistre la vidéo comme note « Ressource » dans le Cerveau.

(() => {
  const FLAG = 'lp-from-launcher';
  const SAVED = 'lp-saved-urls';

  /* ---------- Ouvert depuis le Lanceur ? (mêmes règles que pour Reddit) ---------- */
  async function fromLauncher() {
    try { if (sessionStorage.getItem(FLAG)) return true; } catch { /* ignore */ }
    let yes = /^lp-/.test(window.name || '');
    if (!yes) yes = ['standalone', 'minimal-ui', 'window-controls-overlay', 'fullscreen'].some((m) => matchMedia(`(display-mode: ${m})`).matches);
    if (!yes) {
      try { yes = !!(await chrome.runtime.sendMessage({ type: 'lp-is-launcher' }))?.yes; } catch { /* ignore */ }
    }
    if (yes) { try { sessionStorage.setItem(FLAG, '1'); } catch { /* ignore */ } }
    return yes;
  }

  /* ---------- Lecture des vidéos ---------- */
  const clean = (s) => (s || '').replace(/\n{3,}/g, '\n\n').trim();
  const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
  const idFromHref = (href = '') => href.match(/[?&]v=([\w-]{6,20})/)?.[1] || href.match(/\/shorts\/([\w-]{6,20})/)?.[1] || '';

  // Vidéo ouverte (page /watch)
  function readWatch() {
    const id = new URLSearchParams(location.search).get('v') || '';
    const meta = document.querySelector('ytd-watch-metadata');
    const title = meta?.querySelector('#title h1')?.textContent || document.title.replace(/\s*-\s*YouTube\s*$/, '');
    const channel = meta?.querySelector('ytd-channel-name a, #owner #channel-name a')?.textContent || '';
    const desc = document.querySelector('#description-inline-expander #attributed-snippet-text, #description-inline-expander yt-attributed-string, #description-inline-expander')?.innerText || '';
    const video = document.querySelector('#movie_player video, video.html5-main-video');
    const at = video && video.currentTime > 5 ? Math.floor(video.currentTime) : 0;
    return { id, title, channel, at, text: clean(desc).replace(/\s*(…|\.\.\.)\s*(more|plus|afficher plus)?\s*$/i, '') };
  }

  // Short affiché (page /shorts/ID)
  function activeReel() {
    return document.querySelector('ytd-reel-video-renderer[is-active]') || document.querySelector('ytd-shorts') || document;
  }
  function readShort() {
    const id = location.pathname.match(/\/shorts\/([\w-]{6,20})/)?.[1] || '';
    const reel = activeReel();
    const title = reel.querySelector('yt-shorts-video-title-view-model, h2.title, .ytShortsVideoTitleViewModelShortsVideoTitle, #shorts-title')?.textContent
      || document.title.replace(/\s*-\s*YouTube\s*$/, '');
    const channel = reel.querySelector('yt-reel-channel-bar-view-model a, ytd-channel-name a, [class*="ChannelBarViewModelChannelName"] a, a[href^="/@"]')?.textContent || '';
    return { id, title, channel, at: 0, text: '', short: true };
  }

  // Vignette (accueil, colonne de suggestions, recherche)
  function readTile(tile) {
    const a = tile.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
    const href = a?.getAttribute('href') || '';
    const title = tile.querySelector('h3, #video-title, [class*="LockupMetadataViewModelTitle"]')?.textContent || a?.getAttribute('title') || '';
    const channel = tile.querySelector('a[href^="/@"], ytd-channel-name a, [class*="ContentMetadataViewModelMetadataRow"] span')?.textContent || '';
    return { id: idFromHref(href), title, channel, at: 0, text: '', short: href.includes('/shorts/') };
  }

  /* ---------- Sauvegarde ---------- */
  const savedSet = () => { try { return new Set(JSON.parse(sessionStorage.getItem(SAVED)) || []); } catch { return new Set(); } };
  const markSaved = (url) => { const s = savedSet(); s.add(url); try { sessionStorage.setItem(SAVED, JSON.stringify([...s])); } catch { /* ignore */ } };

  async function save(btn, read) {
    if (btn.disabled) return;
    const v = read();
    if (!v.id) { setState(btn, 'error', 'Vidéo introuvable'); return; }
    const clip = {
      id: 'youtube:' + v.id,
      kind: 'youtube',
      title: clean(v.title).slice(0, 300) || (v.short ? 'Short YouTube' : 'Vidéo YouTube'),
      url: watchUrl(v.id),
      sub: clean(v.channel).replace(/^@/, '').slice(0, 80),
      at: v.at || 0,
      text: (v.text || '').slice(0, 3000),
      short: !!v.short,
      savedAt: Date.now(),
    };
    setState(btn, 'busy');
    try {
      const res = await chrome.runtime.sendMessage({ type: 'lp-save', clip });
      markSaved(clip.url);
      setState(btn, 'done', res?.delivered ? '✓ Dans ton Cerveau' : '✓ Gardé — arrivera à l’ouverture de Life Planner');
    } catch {
      setState(btn, 'error', 'Recharge la page et réessaie');
    }
  }

  /* ---------- Boutons ---------- */
  // Couleurs de YouTube selon son thème (attribut « dark » sur <html>)
  const dark = () => document.documentElement.hasAttribute('dark');
  const fg = () => (dark() ? '#f1f1f1' : '#0f0f0f');
  const bg = (hover) => (dark() ? (hover ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.1)') : (hover ? 'rgba(0,0,0,.1)' : 'rgba(0,0,0,.05)'));

  const STYLES = {
    // Pastille comme J'aime / Partager
    pill: 'display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 16px;margin-left:8px;border:0;border-radius:18px;'
      + 'font:500 14px/36px Roboto, Arial, sans-serif;white-space:nowrap;flex:none;',
    // Petit rond comme le menu ⋮ d'une vignette
    round: 'display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;margin:2px 26px 0 12px;border:0;border-radius:50%;'
      + 'font:16px/1 Roboto, Arial, sans-serif;flex:none;align-self:flex-start;',
    // Grand rond comme les boutons d'un Short (J'aime, commentaires…)
    short: 'display:flex;align-items:center;justify-content:center;width:48px;height:48px;padding:0;border:0;border-radius:50%;'
      + 'font:22px/1 Roboto, Arial, sans-serif;',
  };
  const LABELS = { pill: ['🧠 Cerveau', '✓ Cerveau'], round: ['🧠', '✓'], short: ['🧠', '✓'] };

  function setState(btn, state, tip = '') {
    const [idle, done] = LABELS[btn.dataset.kind];
    btn.disabled = state === 'busy' || state === 'done';
    btn.textContent = state === 'busy' ? '⏳' : state === 'done' ? done : state === 'error' ? '⚠' : idle;
    btn.style.color = state === 'done' ? '#4ade80' : fg();
    btn.style.cursor = btn.disabled ? 'default' : 'pointer';
    btn.title = tip || (btn.dataset.kind === 'pill' ? 'Enregistrer cette vidéo dans le Cerveau de Life Planner' : 'Enregistrer dans le Cerveau de Life Planner');
    btn.setAttribute('aria-label', btn.title);
  }

  function makeButton(kind, read) {
    const b = document.createElement('button');
    b.className = 'lp-yt-save';
    b.dataset.kind = kind;
    b.style.cssText = STYLES[kind];
    b.style.background = bg(false);
    b.addEventListener('mouseenter', () => { if (!b.disabled) b.style.background = bg(true); });
    b.addEventListener('mouseleave', () => { b.style.background = bg(false); });
    // Sur une vignette, tout est un lien : on garde le clic pour nous
    for (const ev of ['click', 'mousedown', 'pointerdown', 'touchstart']) {
      b.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === 'click') { e.preventDefault(); save(b, read); } }, true);
    }
    b.lpRead = read;
    refresh(b);
    return b;
  }
  // État d'un bouton pour la vidéo qu'il désigne (YouTube réutilise ses éléments en changeant de vidéo)
  function refresh(b) {
    const id = b.lpRead().id;
    if (id && savedSet().has(watchUrl(id))) setState(b, 'done', '✓ Dans ton Cerveau');
    else setState(b, 'idle');
  }

  /* ---------- Placement ---------- */
  let watchBtn = null, shortBtn = null;

  function placeWatch() {
    if (location.pathname !== '/watch') return;
    const row = document.querySelector('ytd-watch-metadata #top-level-buttons-computed');
    if (!row || (watchBtn?.isConnected && watchBtn.parentElement === row)) return;
    watchBtn ||= makeButton('pill', readWatch);
    row.append(watchBtn);
    refresh(watchBtn);
  }

  // Short : en haut de la colonne J'aime / commentaires / partager du Short affiché
  function placeShort() {
    if (!location.pathname.startsWith('/shorts/')) return;
    const reel = activeReel();
    const like = reel.querySelector('like-button-view-model, #like-button, segmented-like-dislike-button-view-model');
    const bar = reel.querySelector('reel-action-bar-view-model, #actions.ytd-reel-player-overlay-renderer, ytd-reel-player-overlay-renderer #actions')
      || like?.closest('#actions, [class*="ActionBar"]');
    if (!bar) return;
    if (shortBtn?.isConnected && shortBtn.parentElement?.parentElement === bar) return;
    if (!shortBtn) {
      shortBtn = makeButton('short', readShort);
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;margin-bottom:16px;';
      const label = document.createElement('span');
      label.textContent = 'Cerveau';
      label.style.cssText = 'font:400 12px/1.2 Roboto, Arial, sans-serif;color:var(--yt-spec-text-primary, #f1f1f1);';
      wrap.append(shortBtn, label);
    }
    bar.prepend(shortBtn.parentElement);
    refresh(shortBtn);
  }

  // Vignettes : à gauche du menu ⋮
  function placeTiles() {
    // Nouveau format (accueil, suggestions)
    for (const tile of document.querySelectorAll('yt-lockup-view-model:not([data-lp])')) {
      const menu = tile.querySelector('.ytLockupMetadataViewModelMenuButton, [class*="LockupMetadataViewModelMenuButton"]');
      if (!menu) continue;
      tile.setAttribute('data-lp', '1');
      if (tile.querySelector('a[href*="googleadservices"]') || !tile.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]')) continue; // publicités
      menu.before(makeButton('round', () => readTile(tile)));
    }
    // Ancien format (résultats de recherche, certaines grilles)
    for (const tile of document.querySelectorAll('ytd-video-renderer:not([data-lp]), ytd-rich-grid-media:not([data-lp]), ytd-compact-video-renderer:not([data-lp])')) {
      const menu = tile.querySelector('#menu');
      if (!menu || !tile.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]')) continue;
      tile.setAttribute('data-lp', '1');
      menu.before(makeButton('round', () => readTile(tile)));
    }
  }

  function placeAll() {
    placeWatch();
    placeShort();
    placeTiles();
  }

  fromLauncher().then((yes) => {
    if (!yes) return;
    placeAll();
    // Changement de vidéo (navigation interne de YouTube) : les boutons existants changent de vidéo
    const update = () => { placeAll(); document.querySelectorAll('.lp-yt-save').forEach((b) => b.lpRead && refresh(b)); };
    document.addEventListener('yt-navigate-finish', update);
    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; placeAll(); });
    }).observe(document.documentElement, { childList: true, subtree: true });
    // Shorts : défiler d'un Short à l'autre ne recharge rien
    setInterval(() => { if (location.pathname.startsWith('/shorts/')) update(); }, 1500);
  });
})();
