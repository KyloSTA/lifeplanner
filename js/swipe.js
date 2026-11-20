// Gestes de balayage au doigt (cellulaire, tablette) sur une ligne : → droite / ← gauche.
// Seulement au toucher (pas à la souris ni au stylet) ; le défilement vertical reste normal.
// Exemple : swipeable(li, { right: { label: '✓ Fait', run }, left: { label: '→ Demain', run } })

const THRESHOLD = 80; // px à parcourir pour déclencher l'action
const IGNORE = '.t-drag, .t-cb, input, select, textarea, button, a, [data-no-swipe]';

export function swipeable(el, { right, left } = {}) {
  if (!right && !left) return;
  let x0 = 0, y0 = 0, dx = 0, pid = null, mode = null; // mode : null (indécis), 'h' (balayage), 'v' (défilement)
  const reset = () => {
    el.style.transition = 'transform .2s ease';
    el.style.transform = '';
    el.classList.remove('swiping', 'swipe-r', 'swipe-l', 'swipe-go');
    el.removeAttribute('data-swipe-label');
    setTimeout(() => { el.style.transition = ''; }, 220);
    pid = null; mode = null; dx = 0;
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || pid !== null) return;
    const hit = e.target.closest(IGNORE);
    if (hit && hit !== el && el.contains(hit)) return; // un bouton, une case… dans la ligne (la ligne elle-même peut être un lien)
    pid = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0; mode = null;
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!mode) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { pid = null; return; } // défilement : on laisse faire
      if (Math.abs(mx) < 12 || Math.abs(mx) < Math.abs(my) * 1.4) return;
      mode = 'h';
      try { el.setPointerCapture(pid); } catch { /* ignore */ }
      el.classList.add('swiping');
    }
    const act = mx > 0 ? right : left;
    dx = act ? mx : mx / 5; // pas d'action de ce côté : petite résistance
    el.style.transform = `translateX(${dx}px)`;
    el.classList.toggle('swipe-r', dx > 0 && !!right);
    el.classList.toggle('swipe-l', dx < 0 && !!left);
    el.classList.toggle('swipe-go', Math.abs(dx) >= THRESHOLD && !!act);
    if (act) el.dataset.swipeLabel = act.label;
  });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    const act = dx >= THRESHOLD ? right : dx <= -THRESHOLD ? left : null;
    const wasSwipe = mode === 'h';
    reset();
    if (wasSwipe) {
      // Le « clic » qui suit le geste n'ouvre pas la mission
      const block = (c) => { c.stopPropagation(); c.preventDefault(); };
      el.addEventListener('click', block, { capture: true, once: true });
      setTimeout(() => el.removeEventListener('click', block, { capture: true }), 400); // pas de clic : on n'en bloque pas un autre plus tard
      if (act) { try { navigator.vibrate?.(12); } catch { /* ignore */ } act.run(); }
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', (e) => { if (e.pointerId === pid) reset(); });
}
