// Stockage local (IndexedDB). Chaque écriture est aussi horodatée dans « meta »,
// ce qui permet de synchroniser plusieurs appareils (voir sync.js) sans écraser les changements.

const DB_NAME = 'lifeplanner';
const VERSION = 4;
export const STORES = ['tasks', 'journal', 'pages', 'ink', 'goals', 'settings', 'cache', 'xp', 'notes'];
const KEYPATH = { tasks: 'id', journal: 'date', pages: 'id', ink: 'id', goals: 'id', xp: 'key', notes: 'id' }; // settings/cache : clé séparée
const UNTRACKED = new Set(['cache']); // jamais synchronisé

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, VERSION);
    r.onupgradeneeded = (e) => {
      const d = r.result;
      if (e.oldVersion < 1) {
        d.createObjectStore('tasks', { keyPath: 'id' });
        d.createObjectStore('journal', { keyPath: 'date' });
        d.createObjectStore('pages', { keyPath: 'id' }); // métadonnées des pages manuscrites
        d.createObjectStore('ink', { keyPath: 'id' }); // traits des pages manuscrites
        d.createObjectStore('goals', { keyPath: 'id' });
        d.createObjectStore('settings'); // clé/valeur
        d.createObjectStore('cache'); // clé/valeur (événements Google en cache)
      }
      if (e.oldVersion < 2) d.createObjectStore('xp', { keyPath: 'key' }); // journal des points gagnés
      if (e.oldVersion < 3) d.createObjectStore('notes', { keyPath: 'id' }); // second cerveau
      if (e.oldVersion < 4) d.createObjectStore('meta'); // « store|clé » -> { at, del } (synchronisation)
    };
    r.onsuccess = () => {
      const d = r.result;
      // Une autre fenêtre (ex. widget) met la base à jour : on recharge avec le nouveau code.
      d.onversionchange = () => { d.close(); location.reload(); };
      resolve(d);
    };
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

async function run(stores, mode, fn) {
  const d = await open();
  return new Promise((resolve, reject) => {
    const t = d.transaction(stores, mode);
    const req = fn(t);
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// Prévient les autres fenêtres (app principale <-> widget) quand les données changent.
const bc = 'BroadcastChannel' in self ? new BroadcastChannel('lifeplanner') : null;
const listeners = new Set();
export const onDbChange = (fn) => { listeners.add(fn); bc?.addEventListener('message', (e) => fn(e.data)); };
const notify = (store, fromSync = false) => (r) => {
  bc?.postMessage({ store, fromSync });
  if (fromSync) for (const fn of listeners) fn({ store, fromSync }); // la synchro prévient aussi cette fenêtre
  if (!fromSync && !UNTRACKED.has(store)) localChange(store);
  return r;
};

// La synchro s'abonne ici pour savoir qu'il y a quelque chose à envoyer.
let localChange = () => {};
export const onLocalChange = (fn) => { localChange = fn; };

const keyOf = (s, v, k) => (k !== undefined ? k : v[KEYPATH[s]]);
export const metaKey = (s, k) => `${s}|${k}`;

export const db = {
  get: (s, k) => run(s, 'readonly', (t) => t.objectStore(s).get(k)),
  all: (s) => run(s, 'readonly', (t) => t.objectStore(s).getAll()),
  keys: (s) => run(s, 'readonly', (t) => t.objectStore(s).getAllKeys()),
  put: (s, v, k) => run(UNTRACKED.has(s) ? [s] : [s, 'meta'], 'readwrite', (t) => {
    const req = k === undefined ? t.objectStore(s).put(v) : t.objectStore(s).put(v, k);
    if (!UNTRACKED.has(s)) t.objectStore('meta').put({ at: Date.now() }, metaKey(s, keyOf(s, v, k)));
    return req;
  }).then(notify(s)),
  del: (s, k) => run(UNTRACKED.has(s) ? [s] : [s, 'meta'], 'readwrite', (t) => {
    const req = t.objectStore(s).delete(k);
    if (!UNTRACKED.has(s)) t.objectStore('meta').put({ at: Date.now(), del: true }, metaKey(s, k));
    return req;
  }).then(notify(s)),
  async clear(s) {
    const keys = UNTRACKED.has(s) ? [] : await this.keys(s);
    await run(UNTRACKED.has(s) ? [s] : [s, 'meta'], 'readwrite', (t) => {
      const now = Date.now();
      for (const k of keys) t.objectStore('meta').put({ at: now, del: true }, metaKey(s, k));
      return t.objectStore(s).clear();
    });
    notify(s)();
  },
  async entries(s) {
    const [keys, vals] = await Promise.all([this.keys(s), this.all(s)]);
    return keys.map((k, i) => [k, vals[i]]);
  },
};

/* ---------- Accès réservé à la synchronisation ---------- */
export const syncDb = {
  /** Toutes les métadonnées d'un store : Map clé -> { at, del } */
  async metas(s) {
    const prefix = s + '|';
    const range = IDBKeyRange.bound(prefix, prefix + '￿');
    const [keys, vals] = await Promise.all([
      run('meta', 'readonly', (t) => t.objectStore('meta').getAllKeys(range)),
      run('meta', 'readonly', (t) => t.objectStore('meta').getAll(range)),
    ]);
    return new Map(keys.map((k, i) => [k.slice(prefix.length), vals[i]]));
  },
  /** Horodate les enregistrements qui n'ont pas encore de métadonnée (données d'avant la synchro). */
  async stampMissing(s) {
    const metas = await this.metas(s);
    const keys = await db.keys(s);
    const missing = keys.filter((k) => !metas.has(String(k)));
    if (!missing.length) return 0;
    await run('meta', 'readwrite', (t) => { for (const k of missing) t.objectStore('meta').put({ at: 1 }, metaKey(s, k)); });
    return missing.length;
  },
  /** Applique des changements venus d'un autre appareil (sans les marquer comme « locaux »). */
  async apply(s, changes) {
    if (!changes.length) return;
    await run([s, 'meta'], 'readwrite', (t) => {
      const st = t.objectStore(s), meta = t.objectStore('meta');
      for (const { key, rec } of changes) {
        if (rec.del) st.delete(key);
        else if (KEYPATH[s]) st.put(rec.v);
        else st.put(rec.v, key);
        meta.put({ at: rec.at, del: !!rec.del }, metaKey(s, key));
      }
    });
    notify(s, true)();
  },
};
