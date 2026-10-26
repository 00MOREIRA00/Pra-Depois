// Armazenamento local em IndexedDB. Tudo fica no aparelho/navegador.
// Se o IndexedDB não estiver disponível (ex.: navegação privada em alguns navegadores),
// cai para memória e avisa a interface via `store.persistent === false`.

const DB_NAME = "pra-depois";
const DB_VERSION = 1;
const STORE = "items";

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) return reject(new Error("IndexedDB indisponível"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("status", "status");
        os.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Banco bloqueado por outra aba"));
  });
}

class IdbStore {
  constructor(db) { this.db = db; this.persistent = true; }
  tx(mode) { return this.db.transaction(STORE, mode).objectStore(STORE); }
  all() { return promisify(this.tx("readonly").getAll()); }
  put(item) { return promisify(this.tx("readwrite").put(item)); }
  remove(id) { return promisify(this.tx("readwrite").delete(id)); }
  putMany(items) {
    return new Promise((resolve, reject) => {
      const t = this.db.transaction(STORE, "readwrite");
      const os = t.objectStore(STORE);
      items.forEach((i) => os.put(i));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
}

class MemoryStore {
  constructor() { this.map = new Map(); this.persistent = false; }
  async all() { return [...this.map.values()].map((i) => ({ ...i })); }
  async put(item) { this.map.set(item.id, { ...item }); }
  async remove(id) { this.map.delete(id); }
  async putMany(items) { items.forEach((i) => this.map.set(i.id, { ...i })); }
}

export async function openStore() {
  try {
    return new IdbStore(await openDb());
  } catch (err) {
    console.warn("[Pra Depois] usando memória:", err);
    return new MemoryStore();
  }
}

// Avisa outras abas abertas que os dados mudaram.
const channel = "BroadcastChannel" in globalThis ? new BroadcastChannel("pra-depois") : null;
export function notifyChange() { channel?.postMessage("changed"); }
export function onExternalChange(fn) { channel?.addEventListener("message", fn); }

/** Pede ao navegador para não apagar os dados quando faltar espaço. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch { /* opcional */ }
}
