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

/** Photo ids whose owner no longer exists. A proof is keyed by its owner's id: a ledger entry
 * (device payment), a party adjustment (a client/supplier balance payment) or a card movement
 * («حسابي»'s card charge/withdraw). `otherOwnerIds` carries those non-ledger owners so their photos
 * are never pruned as orphans. Returns nothing when there are no owners at all - that far more
 * likely means storage failed to load than that every record was deleted, and photos are not worth
 * that risk. */
export function orphanProofIds(proofIds: string[], ledgerStore: LedgerByAccount, otherOwnerIds: Iterable<string> = []): string[] {
  const ownerIds = new Set<string>(otherOwnerIds);
  for (const entries of Object.values(ledgerStore)) for (const entry of entries) ownerIds.add(entry.id);
  if (ownerIds.size === 0) return [];
  return proofIds.filter((id) => !ownerIds.has(id));
}
