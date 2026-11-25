// Fait le lien entre Reddit et Life Planner.
// 1) Retient les onglets Reddit ouverts par le Lanceur (leur « ouvreur » est un onglet Life Planner).
// 2) Reçoit les posts à sauvegarder, les met en file d'attente et les livre à un onglet Life Planner
//    ouvert (par relay.js). Si aucun n'est ouvert, ils attendent sa prochaine ouverture.

const LP_URLS = ['http://localhost:5173/*', 'https://kylosta.github.io/lifeplanner/*'];
const isLP = (url = '') => /^(http:\/\/localhost:5173\/|https:\/\/kylosta\.github\.io\/lifeplanner\/)/.test(url);

/* ---------- Onglets ouverts depuis le Lanceur ---------- */
async function launcherTabs() {
  return (await chrome.storage.session.get('launcherTabs')).launcherTabs || [];
}
async function markLauncherTab(id) {
  const ids = await launcherTabs();
  if (!ids.includes(id)) await chrome.storage.session.set({ launcherTabs: [...ids, id] });
}
chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.openerTabId == null) return;
  try {
    const opener = await chrome.tabs.get(tab.openerTabId);
    if (isLP(opener.url)) await markLauncherTab(tab.id);
  } catch { /* onglet ouvreur déjà fermé */ }
});
chrome.tabs.onRemoved.addListener(async (id) => {
  const ids = await launcherTabs();
  if (ids.includes(id)) await chrome.storage.session.set({ launcherTabs: ids.filter((x) => x !== id) });
  const info = await launcherInfo();
  if (info[id]) { delete info[id]; await chrome.storage.session.set({ launcherInfo: info }); }
});

/* ---------- Sites que le Lanceur vient d'ouvrir (reconnus pendant 2 minutes) ---------- */
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^(www|m|old|new)\./, ''); } catch { return ''; } };
async function expected() {
  const list = (await chrome.storage.session.get('launcherExpect')).launcherExpect || [];
  return list.filter((x) => Date.now() - x.at < 120000);
}

/* ---------- Pages du Lanceur encore ouvertes (pour l'icône à côté de la loupe dans l'app) ---------- */
// Chaque page du Lanceur se signale elle-même (back.js) avec son adresse, son titre et son icône :
// l'extension n'a pas besoin de la permission « onglets ».
async function launcherInfo() { return (await chrome.storage.session.get('launcherInfo')).launcherInfo || {}; }
async function launcherList() {
  const info = await launcherInfo();
  const out = [];
  for (const [id, it] of Object.entries(info)) {
    try { await chrome.tabs.get(Number(id)); out.push({ tabId: Number(id), ...it }); }
    catch { delete info[id]; } // onglet fermé entre-temps
  }
  await chrome.storage.session.set({ launcherInfo: info });
  return out.sort((a, b) => a.at - b.at);
}
async function focusTab(tabId) {
  try {
    const t = await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(t.windowId, { focused: true, state: 'fullscreen' });
    return true;
  } catch { return false; }
}

/* ---------- File d'attente et livraison ---------- */
const getQueue = async () => (await chrome.storage.local.get('queue')).queue || [];
const setQueue = (queue) => chrome.storage.local.set({ queue });

async function deliverTo(tabId) {
  const queue = await getQueue();
  if (!queue.length) return 0;
  let res;
  try { res = await chrome.tabs.sendMessage(tabId, { type: 'lp-deliver', clips: queue }); } catch { return 0; }
  const acked = new Set(res?.acked || []);
  if (!acked.size) return 0;
  await setQueue((await getQueue()).filter((c) => !acked.has(c.id)));
  return acked.size;
}

async function deliver() {
  const tabs = await chrome.tabs.query({ url: LP_URLS });
  // L'onglet actif d'abord, puis les autres
  tabs.sort((a, b) => Number(b.active) - Number(a.active));
  for (const t of tabs) {
    if (await deliverTo(t.id)) return true;
  }
  return false;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg?.type === 'lp-is-launcher') {
      let yes = (await launcherTabs()).includes(sender.tab?.id);
      // Le Lanceur vient d'ouvrir ce site (app installée, plein écran, onglet…) : c'est une page du Lanceur
      if (!yes && sender.tab) {
        const h = hostOf(sender.tab.url || sender.url || '');
        yes = !!h && (await expected()).some((x) => x.host === h);
        if (yes) await markLauncherTab(sender.tab.id);
      }
      reply({ yes });
    } else if (msg?.type === 'lp-launcher-expect' && isLP(sender.tab?.url || sender.url)) {
      const h = hostOf(msg.url);
      if (h) await chrome.storage.session.set({ launcherExpect: [...(await expected()).filter((x) => x.host !== h), { host: h, at: Date.now() }] });
      reply({ ok: true });
    } else if (msg?.type === 'lp-launcher-here' && sender.tab) {
      const info = await launcherInfo();
      const prev = info[sender.tab.id];
      info[sender.tab.id] = { url: String(msg.url || '').slice(0, 500), title: String(msg.title || '').slice(0, 160), icon: String(msg.icon || '').slice(0, 500), at: prev?.at || Date.now() };
      await chrome.storage.session.set({ launcherInfo: info });
      await markLauncherTab(sender.tab.id);
      // Option « plein écran » du Lanceur (réglée dans Life Planner, désactivée par défaut) : une seule fois par page
      const { launcherFullscreen = false } = await chrome.storage.local.get('launcherFullscreen');
      if (!prev && launcherFullscreen) await chrome.windows.update(sender.tab.windowId, { state: 'fullscreen' }).catch(() => {});
      reply({ ok: true });
    } else if (msg?.type === 'lp-window-state' && sender.tab && isLP(sender.tab.url || sender.url) && ['fullscreen', 'maximized', 'normal'].includes(msg.state)) {
      await chrome.windows.update(sender.tab.windowId, { state: msg.state }).catch(() => {});
      reply({ ok: true });
    } else if (msg?.type === 'lp-set-pref' && isLP(sender.tab?.url || sender.url)) {
      await chrome.storage.local.set({ launcherFullscreen: !!msg.launcherFullscreen });
      reply({ ok: true });
    } else if (msg?.type === 'lp-launcher-list') {
      reply({ tabs: await launcherList() });
    } else if (msg?.type === 'lp-launcher-focus') {
      reply({ ok: await focusTab(Number(msg.tabId)) });
    } else if (msg?.type === 'lp-focus') {
      reply({ ok: await focusLifePlanner() });
    } else if (msg?.type === 'lp-save' && msg.clip) {
      const queue = (await getQueue()).filter((c) => c.url !== msg.clip.url);
      await setQueue([...queue, msg.clip]);
      reply({ delivered: await deliver() });
    } else if (msg?.type === 'lp-ready' && sender.tab) {
      // Un onglet Life Planner vient de s'ouvrir : on lui livre ce qui attendait
      await deliverTo(sender.tab.id);
      // Life Planner s'ouvre aussi en plein écran (à chaque ouverture ; F11 ou Échap en sort)
      await chrome.windows.update(sender.tab.windowId, { state: 'fullscreen' }).catch(() => {});
      reply({ ok: true });
    } else {
      reply({});
    }
  })();
  return true; // réponse asynchrone
});

/* ---------- ↩ Revenir à Life Planner (pastille dans la page, ou icône de l'extension dans la barre du haut) ---------- */
async function focusLifePlanner() {
  const tabs = await chrome.tabs.query({ url: LP_URLS });
  const t = tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
  if (!t) return false;
  await chrome.tabs.update(t.id, { active: true });
  await chrome.windows.update(t.windowId, { focused: true });
  return true;
}
chrome.action.onClicked.addListener(() => { focusLifePlanner().catch(() => {}); });
// Raccourci clavier (Alt+L par défaut, modifiable dans edge://extensions/shortcuts) : marche aussi dans les
// fenêtres ouvertes par le Lanceur, qui n'affichent pas les icônes d'extensions
chrome.commands.onCommand.addListener((cmd, tab) => {
  if (cmd === 'lp-back') focusLifePlanner().catch(() => {});
  else if (cmd === 'lp-fullscreen') toggleFullscreen(tab).catch(() => {});
});
// Plein écran de la fenêtre active (Alt+Maj+F par défaut) : Life Planner, pages du Lanceur ou toute autre fenêtre
async function toggleFullscreen(tab) {
  const w = tab?.windowId != null ? await chrome.windows.get(tab.windowId) : await chrome.windows.getLastFocused();
  await chrome.windows.update(w.id, { state: w.state === 'fullscreen' ? 'maximized' : 'fullscreen' });
}
