// Ajoute un bouton « 🎟 Activités » sur les pages d'événements Facebook (facebook.com/events/…),
// seulement dans les fenêtres ouvertes depuis le Lanceur de Life Planner (ou l'app Facebook installée).
// Un clic envoie l'événement (titre, date, lieu, image, lien) dans « Activités autour de toi ».
// Facebook ne permet plus de chercher des événements par programme : on lit la page que tu regardes.

(() => {
  const FLAG = 'lp-from-launcher';
  const SAVED = 'lp-saved-urls';

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

  const eventId = () => location.pathname.match(/\/events\/(\d{6,})/)?.[1] || '';
  const meta = (p) => document.querySelector(`meta[property="${p}"], meta[name="${p}"]`)?.getAttribute('content') || '';
  const txt = (s) => (s || '').replace(/\s+/g, ' ').trim();

  // Ligne de date affichée par Facebook (fr ou en), ex. « Samedi 22 novembre 2026 de 19:00 à 22:00 »,
  // « SAM. 22 NOV. À 19:00 », « Saturday, November 22, 2026 at 7 PM »
  const MONTHS = /(janv|févr|fevr|mars|avr|mai|juin|juil|août|aout|sept|oct|nov|déc|dec|jan|feb|mar|apr|may|jun|jul|aug|sep)/i;
  function readWhen(root) {
    const lines = (root.innerText || '').split('\n').map(txt).filter(Boolean).slice(0, 80);
    return lines.find((l) => l.length < 90 && MONTHS.test(l) && /\d/.test(l)) || '';
  }
  // Lieu : la ligne qui suit souvent la date, ou la description (og:description)
  function readPlace(root, when) {
    const lines = (root.innerText || '').split('\n').map(txt).filter(Boolean);
    const i = lines.indexOf(when);
    const cand = i >= 0 ? lines.slice(i + 1, i + 5).find((l) => l.length > 3 && l.length < 80 && !MONTHS.test(l) && !/^(Détails|Details|Discussion|Intéressé|Interested|Participer|Going|Partager|Share|Inviter|Invite|Plus|More)/i.test(l)) : '';
    return cand || '';
  }

  function read() {
    const id = eventId();
    const main = document.querySelector('[role="main"]') || document.body;
    const title = txt(meta('og:title')) || txt(document.title.replace(/\s*\|\s*Facebook\s*$/i, ''));
    const when = readWhen(main);
    return {
      id, title, when, place: readPlace(main, when),
      url: id ? `https://www.facebook.com/events/${id}/` : location.href.split('?')[0],
      img: /^https:\/\//.test(meta('og:image')) ? meta('og:image') : '',
      text: txt(meta('og:description')).slice(0, 400),
    };
  }

  const savedSet = () => { try { return new Set(JSON.parse(sessionStorage.getItem(SAVED)) || []); } catch { return new Set(); } };
  const markSaved = (u) => { const s = savedSet(); s.add(u); try { sessionStorage.setItem(SAVED, JSON.stringify([...s])); } catch { /* ignore */ } };

  function setDone(b, tip) {
    b.disabled = true; b.textContent = '✓ Dans Activités'; b.title = tip;
    b.style.background = '#e7f6ec'; b.style.color = '#1e7b34'; b.style.cursor = 'default';
  }

  async function save(b) {
    if (b.disabled) return;
    const e = read();
    if (!e.id) return;
    const clip = { id: 'fbevent:' + e.id, kind: 'fbevent', title: e.title.slice(0, 200), url: e.url, img: e.img, when: e.when.slice(0, 120), place: e.place.slice(0, 120), text: e.text, savedAt: Date.now() };
    b.disabled = true; b.textContent = '⏳';
    try {
      const res = await chrome.runtime.sendMessage({ type: 'lp-save', clip });
      markSaved(clip.url);
      setDone(b, res?.delivered ? '✓ Ajouté à Activités autour de toi' : '✓ Gardé — arrivera à l’ouverture de Life Planner');
    } catch {
      b.disabled = false; b.textContent = '⚠ Réessaie'; b.title = 'Recharge la page et réessaie';
    }
  }

  const STYLE = 'position:fixed;right:18px;bottom:18px;z-index:2147483000;display:inline-flex;align-items:center;gap:6px;padding:10px 16px;'
    + 'border:0;border-radius:999px;background:#7a1e2c;color:#fff;font:700 14px/1.2 system-ui,"Segoe UI",sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.3);';
  function place() {
    const btn = document.querySelector('.lp-fb-save');
    if (!eventId()) { btn?.remove(); return; }
    if (btn && btn.dataset.ev === eventId()) return;
    btn?.remove();
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'lp-fb-save'; b.dataset.ev = eventId();
    b.textContent = '🎟 Activités';
    b.title = 'Ajouter cet événement à « Activités autour de toi » dans Life Planner';
    b.style.cssText = STYLE;
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); save(b); }, true);
    document.body.appendChild(b);
    if (savedSet().has(`https://www.facebook.com/events/${eventId()}/`)) setDone(b, '✓ Déjà dans Activités');
  }

  fromLauncher().then((yes) => {
    if (!yes) return;
    place();
    setInterval(place, 1500); // Facebook change de page sans recharger
  });
})();
