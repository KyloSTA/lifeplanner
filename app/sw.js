// Service worker : permet à l'app installée de fonctionner hors ligne
// (même quand le petit serveur local n'est pas lancé).
const CACHE = 'lifeplanner-v67';
const ASSETS = [
  './', 'index.html', 'widget.html', 'css/styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/db.js', 'js/util.js', 'js/gcal.js', 'js/ink.js', 'js/widget.js', 'js/game.js', 'js/avatar.js', 'js/tasks.js', 'js/brain.js', 'js/quotes.js', 'js/assistant.js', 'js/alarms.js', 'js/launcher.js', 'js/timer.js', 'js/sync.js', 'js/clips.js', 'js/habits.js', 'js/rbq.js', 'js/workout.js', 'js/images.js', 'js/missions.js', 'js/docs.js', 'js/assoc.js', 'js/news.js', 'js/reminders.js', 'js/rpg.js', 'js/rpg-data.js', 'js/habs.js', 'js/finance.js', 'js/usage.js',
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

// Boutons des notifications d'alarme : on transmet l'action à une fenêtre ouverte (app ou widget).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const id = e.notification.data?.id;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = wins.find((w) => !w.url.includes('widget')) || wins[0];
    if (e.action && id && app) app.postMessage({ type: e.notification.data?.kind === 'habit' ? 'habit-action' : 'alarm-action', action: e.action, id });
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
