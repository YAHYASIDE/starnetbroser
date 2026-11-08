/**
 * 🧾 The rep statement's rows, two more things (his Nov 8 2026 ask): the device's EMAIL under its name, and the
 * payment's PHOTO when the operation came with one (tap the row → the operation with its photo at once). Pure.
 *
 * Where a photo lives (lib/paymentProofStore.ts): under the record's own id (an approved payment / ledger entry), or
 * under its «📜 السجل» operation (`oplog:<repId>:<serial>`); the Telegram file id is the last resort (to fetch again).
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { opProofKey, type LoggedOp, type OpLogStore } from "./repOpLog";
import type { RepStatementRow } from "./repStore";

/** The device a row is about, when it is about one. */
export function rowDeviceId(row: RepStatementRow): string | undefined {
  if (row.type === "customer") return row.op.accountId;
  if (row.type === "device") return row.row.accountId;
  return undefined;
}

/** «email» of the row's device (its Starlink email, else the email it was added with). */
export function rowDeviceEmail(row: RepStatementRow, accounts: Pick<StarlinkAccountSummary, "id" | "starlinkAccountEmail" | "expectedEmail">[]): string | undefined {
  const id = rowDeviceId(row);
  if (!id) return undefined;
  const a = accounts.find((x) => x.id === id);
  const email = (a?.starlinkAccountEmail || a?.expectedEmail || "").trim();
  return email || undefined;
}

/** The «📜 السجل» operation of a row (its ids hold the row's record id). */
export function rowOp(row: Pick<RepStatementRow, "id">, store: OpLogStore, repId: string): LoggedOp | undefined {
  return (store[repId]?.ops ?? []).find((o) => o.ids.includes(row.id) || o.recordId === row.id);
}

/** Where to look for the row's photo, in order; and the Telegram file to fetch when none is kept. */
export function rowProofPlan(row: Pick<RepStatementRow, "id">, store: OpLogStore, repId: string, keptIds: Set<string>): { keys: string[]; fileId?: string; bot?: "reps" | "money" } {
  const op = rowOp(row, store, repId);
  const keys = [row.id, ...(op ? [opProofKey(op)] : [])].filter((k) => keptIds.has(k));
  return { keys, ...(op?.proofFileId ? { fileId: op.proofFileId, bot: op.proofBot ?? "reps" } : {}) };
}

/** 📸 on the row: a photo is kept, or can be fetched. */
export function rowHasPhoto(row: Pick<RepStatementRow, "id">, store: OpLogStore, repId: string, keptIds: Set<string>): boolean {
  const plan = rowProofPlan(row, store, repId, keptIds);
  return plan.keys.length > 0 || Boolean(plan.fileId);
}
