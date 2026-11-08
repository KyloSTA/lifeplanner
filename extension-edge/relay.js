// S'exécute dans les pages Life Planner : transmet à l'app les posts Reddit sauvegardés,
// et confirme à l'extension ceux que l'app a bien enregistrés.

let appReady = false;
const acks = new Map(); // id -> resolve

window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data || typeof e.data !== 'object') return;
  if (e.data.type === 'lp-hello') {
    // L'app principale est chargée et écoute (le widget, lui, ne dit pas bonjour)
    if (!appReady) {
      appReady = true;
      chrome.runtime.sendMessage({ type: 'lp-ready' }).catch(() => {});
    }
  } else if (e.data.type === 'lp-clip-ack') {
    acks.get(e.data.id)?.(true);
  }
});

function sendClip(clip) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { acks.delete(clip.id); resolve(false); }, 4000);
    acks.set(clip.id, (ok) => { clearTimeout(t); acks.delete(clip.id); resolve(ok); });
    window.postMessage({ type: 'lp-clip', clip }, location.origin);
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== 'lp-deliver') return false;
  if (!appReady) { reply({ acked: [] }); return false; }
  (async () => {
    const acked = [];
    for (const clip of msg.clips || []) if (await sendClip(clip)) acked.push(clip.id);
    reply({ acked });
  })();
  return true;
});
