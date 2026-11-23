// 🎄 Thème Noël : décorations qui s'ajoutent quand le thème « Noël » est choisi dans Réglages → Apparence.
// - Guirlande lumineuse animée en haut de l'écran
// - Neige qui tombe (désactivable ; coupée si « réduire les animations » est demandé par Windows)
// - Bandeau « Joyeux temps des Fêtes » avec le compte à rebours jusqu'à Noël (page Aujourd'hui)
// - Tuque de Noël sur le logo, emojis de Noël dans le menu (CSS), boutons et barres aux couleurs des Fêtes
// Tout est dessiné par l'app (aucune image externe).

const SNOW_KEY = 'lp.snow';
let snowRaf = 0, observer = null;

export const isOn = () => document.documentElement.dataset.theme === 'noel';
export const snowOn = () => { try { return localStorage.getItem(SNOW_KEY) !== '0'; } catch { return true; } };
export function setSnow(on) { try { localStorage.setItem(SNOW_KEY, on ? '1' : '0'); } catch { /* ignore */ } apply(); }

/** Jours avant Noël (0 le 25 décembre). */
function daysToXmas(now = new Date()) {
  const y = now.getMonth() === 11 && now.getDate() > 25 ? now.getFullYear() + 1 : now.getFullYear();
  const x = new Date(y, 11, 25);
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((x - d0) / 864e5);
}
function bannerText() {
  const now = new Date(), m = now.getMonth(), d = now.getDate();
  if (m === 11 && d === 24) return '🎄 C’est la veille de Noël ! Joyeux réveillon 🎅✨';
  if (m === 11 && d === 25) return '🎁 Joyeux Noël ! 🎄🎅❄️';
  if ((m === 11 && d >= 26 && d <= 30)) return '✨ Joyeux temps des Fêtes ! Bonne fin d’année 🥂';
  if (m === 11 && d === 31) return '🥂 Bonne veille du jour de l’An ! 🎉';
  if (m === 0 && d <= 6) return '🎉 Bonne année ! Que la nouvelle année te ressemble ✨';
  const n = daysToXmas(now);
  return `🎄 Joyeux temps des Fêtes ! · 🎅 Noël dans <b>${n}</b> jour${n > 1 ? 's' : ''} · 🎁`;
}

/* ---------- Guirlande : ampoules colorées sur un fil, qui scintillent ---------- */
function garland() {
  if (document.getElementById('noel-garland')) return;
  const colors = ['#ff3b3b', '#ffd23f', '#3bd16f', '#3fa7ff', '#ff7ad9'];
  const n = 40;
  let path = '', bulbs = '';
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * 1000, y = 6 + Math.sin(i * 0.9) * 2;
    path += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    if (i % 2 === 0 && i < n) {
      const c = colors[(i / 2) % colors.length];
      bulbs += `<g class="ng-b" style="--c:${c};animation-delay:${((i * 0.37) % 2).toFixed(2)}s"><rect x="${x - 2.2}" y="${y + 1}" width="4.4" height="3" rx="1" fill="#3b3b3b"/><ellipse cx="${x}" cy="${y + 8}" rx="3.6" ry="5.2" fill="${c}"/></g>`;
    }
  }
  const el = document.createElement('div');
  el.id = 'noel-garland';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<svg viewBox="0 0 1000 20" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="#1e3a2b" stroke-width="1.4"/>${bulbs}</svg>`;
  document.body.appendChild(el);
}

/* ---------- Neige ---------- */
function snow() {
  if (document.getElementById('noel-snow')) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.id = 'noel-snow';
  c.setAttribute('aria-hidden', 'true');
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  let W = 0, H = 0;
  const resize = () => { W = c.width = innerWidth; H = c.height = innerHeight; };
  resize();
  addEventListener('resize', resize);
  const flakes = Array.from({ length: Math.min(90, Math.round(innerWidth / 18)) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 0.8 + Math.random() * 2.4, s: 0.3 + Math.random() * 0.9, w: Math.random() * Math.PI * 2 }));
  const tick = () => {
    if (!document.hidden) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      for (const f of flakes) {
        f.y += f.s; f.w += 0.01; f.x += Math.sin(f.w) * 0.4;
        if (f.y > H + 5) { f.y = -5; f.x = Math.random() * W; }
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    snowRaf = requestAnimationFrame(tick);
  };
  tick();
}
function stopSnow() { cancelAnimationFrame(snowRaf); document.querySelectorAll('canvas#noel-snow').forEach((e) => e.remove()); }

/* ---------- Bandeau sur la page Aujourd'hui ---------- */
function banner() {
  const head = document.querySelector('#view .page-head');
  if (!head || !location.hash.match(/^#\/(today)?$|^$/) || document.getElementById('noel-banner')) return;
  const b = document.createElement('div');
  b.id = 'noel-banner';
  b.className = 'noel-banner';
  b.innerHTML = `<span class="nb-tree" aria-hidden="true"><svg viewBox="0 0 40 48"><path d="M20 2l7 11h-4l8 11h-5l9 13H5l9-13H9l8-11h-4z" fill="#1f8a4c"/><rect x="17" y="37" width="6" height="8" rx="1" fill="#7a4a1e"/><circle class="nb-l" cx="16" cy="16" r="1.8" fill="#ffd23f"/><circle class="nb-l" cx="24" cy="23" r="1.8" fill="#ff3b3b" style="animation-delay:.4s"/><circle class="nb-l" cx="14" cy="29" r="1.8" fill="#3fa7ff" style="animation-delay:.8s"/><circle class="nb-l" cx="27" cy="32" r="1.8" fill="#ffd23f" style="animation-delay:1.2s"/><path d="M20 0l1.6 3.4 3.6.4-2.7 2.4.8 3.6L20 8l-3.3 1.8.8-3.6-2.7-2.4 3.6-.4z" fill="#ffd23f" class="nb-star"/></svg></span><span class="nb-txt">${bannerText()}</span>`;
  head.before(b);
}

/** Active ou retire les décorations selon le thème choisi. */
export function apply() {
  if (isOn()) {
    garland();
    if (snowOn()) snow(); else stopSnow();
    banner();
    if (!observer) {
      observer = new MutationObserver(() => banner());
      const v = document.getElementById('view');
      if (v) observer.observe(v, { childList: true });
    }
  } else {
    document.getElementById('noel-garland')?.remove();
    document.getElementById('noel-banner')?.remove();
    stopSnow();
    observer?.disconnect(); observer = null;
  }
}
