// ↩ Bouton rond « Life Planner » (comme le ＋ de l'app) sur les pages ouvertes depuis le Lanceur :
// un clic ramène la fenêtre de Life Planner à l'avant. Placé en bas à droite (comme le ＋ de l'app) ;
// on peut le glisser ailleurs, et sa place est gardée pour chaque site.
(async () => {
  if (window.top !== window || document.getElementById('lp-back-fab')) return;
  // Ouvert depuis le Lanceur ? Même détection que le bouton « Cerveau » de Reddit
  const FLAG = 'lp-from-launcher';
  let yes = false;
  try { yes = !!sessionStorage.getItem(FLAG); } catch { /* ignore */ }
  if (!yes) yes = /^lp-/.test(window.name || '');
  if (!yes) yes = ['standalone', 'minimal-ui', 'window-controls-overlay'].some((m) => matchMedia(`(display-mode: ${m})`).matches);
  if (!yes) { try { yes = !!(await chrome.runtime.sendMessage({ type: 'lp-is-launcher' }))?.yes; } catch { /* ignore */ } }
  if (!yes) return;
  try { sessionStorage.setItem(FLAG, '1'); } catch { /* ignore */ }

  // Se signale à l'extension : Life Planner affiche une icône à côté de sa loupe pour revenir ici
  const iconUrl = () => { const l = document.querySelector('link[rel~="icon"][href], link[rel="apple-touch-icon"][href]'); return l ? new URL(l.getAttribute('href'), location.href).href : location.origin + '/favicon.ico'; };
  const report = () => chrome.runtime.sendMessage({ type: 'lp-launcher-here', url: location.href, title: document.title, icon: iconUrl() }).catch(() => {});
  report();
  setInterval(report, 15000); // titre et adresse à jour (sites qui changent de page sans recharger)
  document.addEventListener('visibilitychange', report);

  const KEY = 'lpFab:' + location.hostname;
  const saved = (await chrome.storage.local.get(KEY))[KEY]; // { x, y } en % de la fenêtre
  const SIZE = 52;

  const b = document.createElement('button');
  b.id = 'lp-back-fab';
  b.type = 'button';
  b.title = 'Revenir à Life Planner (Alt+L) · glisser pour déplacer';
  b.setAttribute('aria-label', 'Revenir à Life Planner');
  const img = document.createElement('img');
  img.src = chrome.runtime.getURL('icon128.png');
  img.alt = '';
  Object.assign(img.style, { width: '100%', height: '100%', borderRadius: '50%', display: 'block', pointerEvents: 'none' });
  b.appendChild(img);
  Object.assign(b.style, {
    position: 'fixed', zIndex: '2147483647', width: SIZE + 'px', height: SIZE + 'px', padding: '0', margin: '0',
    border: '3px solid #b8913d', borderRadius: '50%', background: '#0d0b0b', cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(0,0,0,.45)', transition: 'transform .15s, opacity .2s', opacity: '.92', touchAction: 'none',
  });
  const place = (x, y) => { // x, y : coin haut-gauche en px, gardé dans la fenêtre
    const mx = innerWidth - SIZE - 8, my = innerHeight - SIZE - 8;
    b.style.left = Math.max(8, Math.min(mx, x)) + 'px';
    b.style.top = Math.max(8, Math.min(my, y)) + 'px';
  };
  const restore = () => (saved ? place(saved.x * innerWidth, saved.y * innerHeight) : place(innerWidth - SIZE - 24, innerHeight - SIZE - 24)); // par défaut : en bas à droite, comme le ＋ de l'app
  restore();
  addEventListener('resize', restore);
  b.onmouseenter = () => { b.style.opacity = '1'; b.style.transform = 'scale(1.08)'; };
  b.onmouseleave = () => { b.style.opacity = '.92'; b.style.transform = ''; };

  // Glisser pour déplacer ; un simple clic revient à Life Planner
  let drag = null;
  b.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, l: b.offsetLeft, t: b.offsetTop, moved: false };
    try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });
  b.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    place(drag.l + dx, drag.t + dy);
  });
  b.addEventListener('pointerup', async () => {
    const d = drag; drag = null;
    if (!d) return;
    if (d.moved) {
      await chrome.storage.local.set({ [KEY]: { x: b.offsetLeft / innerWidth, y: b.offsetTop / innerHeight } });
      return;
    }
    const r = await chrome.runtime.sendMessage({ type: 'lp-focus' }).catch(() => null);
    if (!r?.ok) { b.title = 'Life Planner n’est pas ouvert'; b.style.borderColor = '#d92d20'; setTimeout(() => { b.style.borderColor = '#b8913d'; b.title = 'Revenir à Life Planner (Alt+L) · glisser pour déplacer'; }, 2500); }
  });
  document.documentElement.appendChild(b);
})();
