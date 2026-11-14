// Service worker de Couple Life Organiser : le même que Life Planner (../sw.js), avec son propre cache,
// sa propre base de données et ses propres fichiers (page, manifeste, icônes).
self.LP_SW = {
  cache: 'couplelife',
  db: 'couplelife',
  base: '../',
  own: ['./', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
};
importScripts('../sw.js');
