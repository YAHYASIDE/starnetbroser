/**
 * IndexedDB storage for payment proof photos (see paymentProofs.ts for why they aren't in
 * localStorage). Browser-only and deliberately thin - every function resolves (never rejects) so a
 * photo problem can never break recording the payment itself.
 */

import { orphanProofIds, parseProofs, PROOFS_BACKUP_KEY, ProofMap, serializeProofs } from "./paymentProofs";
import type { LedgerByAccount } from "./ledgerStore";

const DB_NAME = "starnet_payment_proofs";
const STORE = "proofs";

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

export function getProof(entryId: string): Promise<string | undefined> {
  return run<string | undefined>("readonly", (store) => store.get(entryId) as IDBRequest<string | undefined>, undefined);
}

/** True when saved. */
export async function putProof(entryId: string, dataUrl: string): Promise<boolean> {
  const done = await run<IDBValidKey | null>("readwrite", (store) => store.put(dataUrl, entryId) as IDBRequest<IDBValidKey | null>, null);
  return done !== null;
}

export function deleteProof(entryId: string): Promise<void> {
  return run<undefined>("readwrite", (store) => store.delete(entryId), undefined);
}

export async function listProofIds(): Promise<string[]> {
  const keys = await run<IDBValidKey[]>("readonly", (store) => store.getAllKeys(), []);
  return keys.map(String);
}

export async function getAllProofs(): Promise<ProofMap> {
  const ids = await listProofIds();
  const result: ProofMap = {};
  for (const id of ids) {
    const value = await getProof(id);
    if (value) result[id] = value;
  }
  return result;
}

/** Makes the stored photos exactly `proofs` (a restored backup's). */
export async function replaceAllProofs(proofs: ProofMap): Promise<void> {
  await run<undefined>("readwrite", (store) => {
    store.clear();
    for (const [id, value] of Object.entries(proofs)) store.put(value, id);
  }, undefined);
}

/** Removes photos whose payment was deleted. */
export async function pruneOrphanProofs(ledgerStore: LedgerByAccount): Promise<void> {
  for (const id of orphanProofIds(await listProofIds(), ledgerStore)) await deleteProof(id);
}

/** A backup snapshot plus the payment photos (only when there are any). */
export async function withProofs<T extends Record<string, string>>(data: T): Promise<T> {
  const proofs = await getAllProofs();
  return Object.keys(proofs).length === 0 ? data : { ...data, [PROOFS_BACKUP_KEY]: serializeProofs(proofs) };
}

/** After a successful restore: the backup's photos replace the phone's. A backup made before
 * photos existed carries none, and then the phone's photos are left as they are. */
export async function restoreProofsFromBackup(data: Record<string, string> | undefined): Promise<void> {
  if (!data || !(PROOFS_BACKUP_KEY in data)) return;
  await replaceAllProofs(parseProofs(data[PROOFS_BACKUP_KEY]));
}
