// Service worker : permet à l'app installée de fonctionner hors ligne
// (même quand le petit serveur local n'est pas lancé).
const CACHE = 'lifeplanner-v94';
const ASSETS = [
  './', 'index.html', 'widget.html', 'css/styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/db.js', 'js/util.js', 'js/gcal.js', 'js/ink.js', 'js/widget.js', 'js/game.js', 'js/avatar.js', 'js/tasks.js', 'js/brain.js', 'js/quotes.js', 'js/assistant.js', 'js/alarms.js', 'js/launcher.js', 'js/timer.js', 'js/sync.js', 'js/clips.js', 'js/habits.js', 'js/rbq.js', 'js/workout.js', 'js/images.js', 'js/missions.js', 'js/docs.js', 'js/assoc.js', 'js/news.js', 'js/reminders.js', 'js/rpg.js', 'js/rpg-data.js', 'js/habs.js', 'js/finance.js', 'js/usage.js', 'js/activities.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// « ✓ Fait » d'une habitude quand l'app est fermée : on l'inscrit directement dans la base de l'app.
// Les points et la synchro suivent à la prochaine ouverture (file « habitQueue » lue par habits.js).
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function markHabitDone(id) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('lifeplanner');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const day = localDay();
      const t = db.transaction(['habits', 'meta', 'cache'], 'readwrite');
      const hs = t.objectStore('habits');
      const g = hs.get(id);
      g.onsuccess = () => {
        const h = g.result;
        if (!h) return;
        h.log ||= {};
        h.log[day] = Math.min((h.log[day] || 0) + 1, h.target || 1);
        hs.put(h);
        t.objectStore('meta').put({ at: Date.now() }, 'habits|' + id);
        const c = t.objectStore('cache');
        const q = c.get('habitQueue');
        q.onsuccess = () => c.put([...(q.result || []), { id, day }], 'habitQueue');
      };
      t.oncomplete = () => { db.close(); resolve(); };
      t.onerror = () => { db.close(); reject(t.error); };
    };
  });
}

// Boutons des notifications : on transmet l'action à une fenêtre ouverte (app ou widget).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const id = e.notification.data?.id;
  const habit = e.notification.data?.kind === 'habit';
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = wins.find((w) => !w.url.includes('widget')) || wins[0];
    // Habitude : « ✓ Fait » et « Dans 10 min » agissent sans mettre l'app au premier plan
    if (habit && id && (e.action === 'done' || e.action === 'snooze')) {
      if (app) { app.postMessage({ type: 'habit-action', action: e.action, id }); return; }
      if (e.action === 'done') { try { await markHabitDone(id); return; } catch { /* base indisponible : on ouvre l'app */ } }
      await self.clients.openWindow('./#/today');
      return;
    }
    if (e.action && id && app) app.postMessage({ type: habit ? 'habit-action' : 'alarm-action', action: e.action, id });
    if (app) { try { await app.focus(); } catch { /* ignore */ } } else await self.clients.openWindow('./#/today');
  })());
});

// Réseau d'abord (pour recevoir les mises à jour), cache en secours.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined)),
      ),
  );
});
