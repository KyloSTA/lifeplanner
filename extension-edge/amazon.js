// Ajoute un petit bouton « 🧠 » à côté du titre d'un produit Amazon, seulement dans les fenêtres
// ouvertes depuis le Lanceur de Life Planner (ou l'app Amazon installée). Un clic enregistre
// l'article dans le Cerveau : titre, prix, image (miniature de la carte) et lien propre /dp/ASIN.

(() => {
  const FLAG = 'lp-from-launcher';
  const SAVED = 'lp-saved-urls';

  /* ---------- Ouvert depuis le Lanceur ? (mêmes règles que Reddit et YouTube) ---------- */
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

  /* ---------- Lecture du produit ---------- */
  const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  function asin() {
    return location.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i)?.[1]
      || document.querySelector('#ASIN, input[name="ASIN"]')?.value || '';
  }
  function readProduct() {
    const id = asin();
    const url = id ? `${location.origin}/dp/${id}` : location.href.split('?')[0]; // lien propre, sans pistage
    const title = txt(document.querySelector('#productTitle')) || document.title.replace(/\s*:\s*Amazon\..*$/i, '');
    const img = document.querySelector('#landingImage, #imgTagWrapperId img, #main-image, #imgBlkFront');
    let src = img?.getAttribute('data-old-hires') || '';
    if (!src) {
      // data-a-dynamic-image : { "url": [largeur, hauteur], … } -> la plus grande
      try { src = Object.entries(JSON.parse(img?.getAttribute('data-a-dynamic-image') || '{}')).sort((a, b) => b[1][0] - a[1][0])[0]?.[0] || ''; } catch { /* ignore */ }
    }
    if (!src) src = img?.currentSrc || img?.src || '';
    const price = txt(document.querySelector('#corePrice_feature_div .a-offscreen, #corePriceDisplay_desktop_feature_div .a-offscreen, #apex_desktop .a-offscreen, .a-price .a-offscreen'));
    const rating = txt(document.querySelector('#acrPopover .a-icon-alt')).replace(/ out of 5 stars| sur 5 étoiles/i, '/5');
    const brand = txt(document.querySelector('#bylineInfo')).replace(/^(Visit the |Visiter la boutique |Marque\s*:\s*|Brand:\s*)/i, '').replace(/ Store$/i, '');
    return { id, url, title, img: /^https:\/\//.test(src) ? src : '', price, rating, brand };
  }

  /* ---------- Sauvegarde ---------- */
  const savedSet = () => { try { return new Set(JSON.parse(sessionStorage.getItem(SAVED)) || []); } catch { return new Set(); } };
  const markSaved = (url) => { const s = savedSet(); s.add(url); try { sessionStorage.setItem(SAVED, JSON.stringify([...s])); } catch { /* ignore */ } };

  function setDone(btn, tip) {
    btn.disabled = true;
    btn.textContent = '✓ 🧠';
    btn.title = tip;
    btn.style.background = '#e7f6ec';
    btn.style.color = '#1e7b34';
    btn.style.borderColor = '#a6dcb6';
    btn.style.cursor = 'default';
  }

  async function save(btn) {
    if (btn.disabled) return;
    const p = readProduct();
    const clip = {
      id: 'amazon:' + (p.id || p.url),
      kind: 'amazon',
      title: p.title.slice(0, 300),
      url: p.url,
      img: p.img,
      price: p.price.slice(0, 40),
      rating: p.rating.slice(0, 20),
      sub: p.brand.slice(0, 80),
      savedAt: Date.now(),
    };
    btn.disabled = true;
    btn.textContent = '⏳';
    try {
      const res = await chrome.runtime.sendMessage({ type: 'lp-save', clip });
      markSaved(clip.url);
      setDone(btn, res?.delivered ? '✓ Dans ton Cerveau' : '✓ Gardé — arrivera à l’ouverture de Life Planner');
    } catch {
      btn.disabled = false;
      btn.textContent = '⚠ 🧠';
      btn.title = 'Recharge la page et réessaie';
    }
  }

  /* ---------- Bouton ---------- */
  const STYLE = 'display:inline-flex;align-items:center;gap:4px;margin:0 0 0 10px;padding:3px 10px;vertical-align:middle;'
    + 'border:1px solid #d5d9d9;border-radius:999px;background:#fff;color:#0f1111;cursor:pointer;'
    + 'font:600 13px/1.4 "Amazon Ember", Arial, sans-serif;box-shadow:0 1px 2px rgba(15,17,17,.15);white-space:nowrap;';
  function place() {
    if (!asin() || document.querySelector('.lp-amz-save')) return;
    const title = document.querySelector('#productTitle');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lp-amz-save';
    b.textContent = '🧠';
    b.title = 'Enregistrer cet article dans le Cerveau de Life Planner';
    b.setAttribute('aria-label', b.title);
    if (title) {
      b.style.cssText = STYLE;
      title.after(b);
    } else {
      // Pas de titre trouvé (mise en page mobile, etc.) : petit bouton flottant en bas à droite
      b.style.cssText = STYLE + 'position:fixed;right:16px;bottom:16px;z-index:99999;padding:8px 12px;font-size:16px;';
      document.body.appendChild(b);
    }
    b.addEventListener('mouseenter', () => { if (!b.disabled) b.style.background = '#f7fafa'; });
    b.addEventListener('mouseleave', () => { if (!b.disabled) b.style.background = '#fff'; });
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); save(b); }, true);
    if (savedSet().has(readProduct().url)) setDone(b, '✓ Dans ton Cerveau');
  }

  fromLauncher().then((yes) => {
    if (!yes) return;
    place();
    // Amazon change parfois de produit sans recharger la page (variantes de taille, couleur)
    let last = location.pathname;
    setInterval(() => {
      if (location.pathname !== last) { last = location.pathname; document.querySelector('.lp-amz-save')?.remove(); }
      place();
    }, 1500);
  });
})();
