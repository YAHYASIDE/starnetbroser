/**
 * 💬 The chat's pictures, voice messages, files (PDF) and the ⏺ call recordings - in their own IndexedDB on this phone
 * (his Nov 8 2026 choice «لا تحذف شيئًا من الهاتف أبدًا»: nothing is dropped any more, so they can't live in
 * localStorage, whose few MB the business data needs). Its own database, not the payment photos': the proofs' orphan
 * cleanup and a backup's restore (which clears the proofs) never touch it. Every function resolves (never rejects).
 */

const DB_NAME = "starnet_chat_media";
const STORE = "media";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void, fallback: T): Promise<T> {
  const db = await openDb();
  if (!db) return fallback;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      let result = fallback;
      if (request) request.onsuccess = () => (result = request.result);
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        resolve(fallback);
      };
    } catch {
      db.close();
      resolve(fallback);
    }
  });
}

export function getChatMedia(key: string): Promise<string | undefined> {
  return run<string | undefined>("readonly", (store) => store.get(key) as IDBRequest<string | undefined>, undefined);
}

/** True when saved. */
export async function putChatMedia(key: string, value: string): Promise<boolean> {
  const done = await run<IDBValidKey | null>("readwrite", (store) => store.put(value, key) as IDBRequest<IDBValidKey | null>, null);
  return done !== null;
}

export function deleteChatMedia(key: string): Promise<void> {
  return run<undefined>("readwrite", (store) => store.delete(key), undefined);
}
