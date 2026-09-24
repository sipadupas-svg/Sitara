// SITARA — IndexedDB helper (offline store): KV cache + antrean sinkronisasi
const DB_NAME = 'sitara-db';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('syncQueue')) {
        const s = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        s.createIndex('waktu', 'waktu');
      }
      if (!db.objectStoreNames.contains('draft')) db.createObjectStore('draft');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req?.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export const idb = {
  get: (store, key) => tx(store, 'readonly', (s) => s.get(key)),
  set: (store, key, val) => tx(store, 'readwrite', (s) => s.put(val, key)),
  del: (store, key) => tx(store, 'readwrite', (s) => s.delete(key)),
  add: (store, val) => tx(store, 'readwrite', (s) => s.add(val)),
  all: (store) => tx(store, 'readonly', (s) => s.getAll()),
  clear: (store) => tx(store, 'readwrite', (s) => s.clear())
};
