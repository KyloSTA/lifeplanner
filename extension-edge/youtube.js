// Ajoute un bouton « 🧠 Cerveau » à côté de J'aime / Partager sous les vidéos YouTube, seulement
// dans les fenêtres ouvertes depuis le Lanceur de Life Planner (ou l'app YouTube installée).
// Un clic enregistre la vidéo comme note « Ressource » dans le Cerveau (titre, chaîne, lien,
// moment où tu étais rendu, description).

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

  /* ---------- Lecture de la vidéo affichée ---------- */
  const clean = (s) => (s || '').replace(/\n{3,}/g, '\n\n').trim();
  const videoId = () => new URLSearchParams(location.search).get('v') || '';
  function readVideo() {
    const id = videoId();
    const meta = document.querySelector('ytd-watch-metadata');
    const title = meta?.querySelector('#title h1')?.textContent || document.title.replace(/\s*-\s*YouTube\s*$/, '');
    const channel = meta?.querySelector('ytd-channel-name a, #owner #channel-name a')?.textContent
      || document.querySelector('#upload-info ytd-channel-name a')?.textContent || '';
    const desc = document.querySelector('#description-inline-expander #attributed-snippet-text, #description-inline-expander yt-attributed-string, #description-inline-expander')?.innerText || '';
    const video = document.querySelector('#movie_player video, video.html5-main-video');
    const at = video && video.currentTime > 5 ? Math.floor(video.currentTime) : 0;
    return {
      postId: id,
      title: clean(title),
      url: `https://www.youtube.com/watch?v=${id}`,
      channel: clean(channel),
      at,
      text: clean(desc).replace(/\n*(…|\.\.\.)\s*(more|plus|afficher plus)?\s*$/i, ''),
    };
  }

  /* ---------- Sauvegarde ---------- */
  const savedSet = () => { try { return new Set(JSON.parse(sessionStorage.getItem(SAVED)) || []); } catch { return new Set(); } };
  const markSaved = (url) => { const s = savedSet(); s.add(url); try { sessionStorage.setItem(SAVED, JSON.stringify([...s])); } catch { /* ignore */ } };

  const LABEL = '🧠 Cerveau';
  function setState(btn, state, tip = '') {
    btn.disabled = state === 'busy' || state === 'done';
    btn.textContent = state === 'busy' ? '⏳ …' : state === 'done' ? '✓ Cerveau' : state === 'error' ? '⚠ Réessaie' : LABEL;
    btn.style.color = state === 'done' ? '#4ade80' : '';
    btn.style.cursor = btn.disabled ? 'default' : 'pointer';
    btn.title = tip || 'Enregistrer cette vidéo dans le Cerveau de Life Planner';
  }

  async function save(btn) {
    if (btn.disabled) return;
    const v = readVideo();
    if (!v.postId) return;
    const clip = {
      id: 'youtube:' + v.postId,
      kind: 'youtube',
      title: v.title.slice(0, 300),
      url: v.url,
      sub: v.channel.slice(0, 80),
      at: v.at,
      text: v.text.slice(0, 3000),
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

  /* ---------- Bouton dans la rangée J'aime / Partager ---------- */
  // Style des boutons de YouTube (pastilles grises), avec leurs couleurs du thème clair ou sombre
  const STYLE = 'display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 16px;margin-left:8px;border:0;border-radius:18px;'
    + 'font:500 14px/36px Roboto, Arial, sans-serif;white-space:nowrap;cursor:pointer;flex:none;'
    + 'color:var(--yt-spec-text-primary, #f1f1f1);background:var(--yt-spec-badge-chip-background, rgba(255,255,255,.1));';

  let btn = null;
  function makeButton() {
    const b = document.createElement('button');
    b.className = 'lp-yt-save';
    b.style.cssText = STYLE;
    b.addEventListener('mouseenter', () => { if (!b.disabled) b.style.background = 'var(--yt-spec-button-chip-background-hover, rgba(255,255,255,.2))'; });
    b.addEventListener('mouseleave', () => { b.style.background = 'var(--yt-spec-badge-chip-background, rgba(255,255,255,.1))'; });
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); save(b); }, true);
    return b;
  }
  // État du bouton pour la vidéo affichée (YouTube change de vidéo sans recharger la page)
  function refresh() {
    if (!btn) return;
    const url = `https://www.youtube.com/watch?v=${videoId()}`;
    if (savedSet().has(url)) setState(btn, 'done', '✓ Dans ton Cerveau');
    else setState(btn, 'idle');
  }

  function place() {
    if (location.pathname !== '/watch') return;
    const row = document.querySelector('ytd-watch-metadata #top-level-buttons-computed')
      || document.querySelector('ytd-watch-metadata #actions-inner #menu ytd-menu-renderer');
    if (!row) return;
    if (btn && btn.isConnected && btn.parentElement === row) return;
    btn ||= makeButton();
    row.append(btn);
    refresh();
  }

  fromLauncher().then((yes) => {
    if (!yes) return;
    place();
    // Changement de vidéo (navigation interne de YouTube) et rangée redessinée
    document.addEventListener('yt-navigate-finish', () => { place(); refresh(); });
    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; place(); });
    }).observe(document.documentElement, { childList: true, subtree: true });
  });
})();
