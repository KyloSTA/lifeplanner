// ↩ Bouton « Life Planner » en haut des pages ouvertes depuis le Lanceur : ramène la fenêtre de Life Planner à l'avant.
(async () => {
  if (window.top !== window || document.getElementById('lp-back-btn')) return;
  let yes = false;
  try { yes = (await chrome.runtime.sendMessage({ type: 'lp-is-launcher' }))?.yes; } catch { return; }
  if (!yes) return;
  const b = document.createElement('button');
  b.id = 'lp-back-btn';
  b.type = 'button';
  b.title = 'Revenir à Life Planner';
  b.textContent = '↩ Life Planner';
  Object.assign(b.style, {
    position: 'fixed', top: '6px', left: '50%', transform: 'translateX(-50%)', zIndex: '2147483647',
    padding: '5px 14px', border: '1px solid #b8913d', borderRadius: '999px', background: 'rgba(13,11,11,.88)', color: '#f2ede6',
    font: '600 13px/1.2 "Segoe UI", system-ui, sans-serif', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,.35)', opacity: '.85',
  });
  b.onmouseenter = () => { b.style.opacity = '1'; };
  b.onmouseleave = () => { b.style.opacity = '.85'; };
  b.onclick = async () => {
    const r = await chrome.runtime.sendMessage({ type: 'lp-focus' }).catch(() => null);
    if (!r?.ok) { b.textContent = 'Life Planner n’est pas ouvert'; setTimeout(() => { b.textContent = '↩ Life Planner'; }, 2500); }
  };
  document.documentElement.appendChild(b);
})();
