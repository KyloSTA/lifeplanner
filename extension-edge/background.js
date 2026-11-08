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
});

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
      reply({ yes: (await launcherTabs()).includes(sender.tab?.id) });
    } else if (msg?.type === 'lp-save' && msg.clip) {
      const queue = (await getQueue()).filter((c) => c.url !== msg.clip.url);
      await setQueue([...queue, msg.clip]);
      reply({ delivered: await deliver() });
    } else if (msg?.type === 'lp-ready' && sender.tab) {
      // Un onglet Life Planner vient de s'ouvrir : on lui livre ce qui attendait
      await deliverTo(sender.tab.id);
      reply({ ok: true });
    } else {
      reply({});
    }
  })();
  return true; // réponse asynchrone
});
