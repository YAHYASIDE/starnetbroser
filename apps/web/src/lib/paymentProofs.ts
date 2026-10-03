/**
 * صورة إثبات الدفع: a photo (bank transfer screenshot) attached to a device payment. Photos are far
 * too big for localStorage (~5M characters for the whole app), so they live in IndexedDB
 * (paymentProofStore.ts), keyed by the payment's ledger entry id. For backups they travel inside
 * the snapshot under PROOFS_BACKUP_KEY - a key that never exists in localStorage itself, so
 * restoreAppData skips it and the caller writes it back to IndexedDB instead.
 */

import type { LedgerByAccount } from "./ledgerStore";

/** entry id -> JPEG data URL. */
export type ProofMap = Record<string, string>;

export const PROOFS_BACKUP_KEY = "starnet_payment_proofs_v1";

export function serializeProofs(proofs: ProofMap): string {
  return JSON.stringify(proofs);
}

/** Never throws - a damaged value restores as no photos rather than failing the whole restore. */
export function parseProofs(raw: string | undefined): ProofMap {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: ProofMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.startsWith("data:image/")) result[id] = value;
    }
    return result;
  } catch {
    return {};
  }
}

/** Photo ids whose payment no longer exists anywhere in the ledger. Returns nothing when the
 * ledger is empty - an empty ledger far more likely means it failed to load than that every
 * payment was deleted, and photos are not worth that risk. */
export function orphanProofIds(proofIds: string[], ledgerStore: LedgerByAccount): string[] {
  const entryIds = new Set<string>();
  for (const entries of Object.values(ledgerStore)) for (const entry of entries) entryIds.add(entry.id);
  if (entryIds.size === 0) return [];
  return proofIds.filter((id) => !entryIds.has(id));
}
