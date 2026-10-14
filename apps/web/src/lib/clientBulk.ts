/**
 * 👥 Bulk actions on clients («الزبائن» → «☑️ تحديد»): zeroing their accounts and starting their
 * profit from zero - both confirmed by the operator to keep history:
 *  - «تصفير الحساب»: one balance entry per currency (partyBalanceStore.ts, no cash moved) that
 *    brings the client's combined balance (store + devices) to 0. Deleting the entry undoes it.
 *  - «بدء الأرباح من 0»: a start point per client - the reports count only the profit of their
 *    devices that became real after it (like the global «بداية جديدة للأرباح», which still applies:
 *    the later of the two wins). Nothing is deleted; clearing the point brings the old profit back.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { RecordPartyAdjustmentInput } from "./partyBalanceStore";
import { makeRepResetPoint } from "./repAccount";
import type { RepResetPoint } from "./repStore";

const EPSILON = 0.005;
export const ZERO_NOTE = "تصفير الحساب";

/** The entries that bring each currency's remaining balance to 0 (none for an already-zero one). */
export function zeroingAdjustments(
  clientId: string,
  remainingByCurrency: Record<string, number>,
  date: string,
): RecordPartyAdjustmentInput[] {
  const out: RecordPartyAdjustmentInput[] = [];
  for (const [currencyCode, remaining] of Object.entries(remainingByCurrency)) {
    if (!Number.isFinite(remaining) || Math.abs(remaining) < EPSILON) continue;
    out.push({
      partyKind: "client",
      partyId: clientId,
      // He owes us → an entry in his favour («له»); we owe him → «عليه».
      direction: remaining > 0 ? "weOwe" : "owesUs",
      amount: Math.round(Math.abs(remaining) * 100) / 100,
      currencyCode,
      date,
      note: ZERO_NOTE,
    });
  }
  return out;
}

// ---- profit start points per client ----

export type ClientProfitResets = Record<string, RepResetPoint>;

const RESETS_KEY = "starnet_client_profit_resets_v1";

export function loadClientProfitResets(): ClientProfitResets {
  if (typeof window === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RESETS_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as ClientProfitResets) : {};
  } catch {
    return {};
  }
}

export function saveClientProfitResets(resets: ClientProfitResets): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RESETS_KEY, JSON.stringify(resets));
}

function localDate(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** These clients' profit starts from zero now. */
export function startClientsProfitFresh(resets: ClientProfitResets, clientIds: string[], now: Date = new Date()): ClientProfitResets {
  const point = makeRepResetPoint(localDate(now), now);
  const next = { ...resets };
  for (const id of clientIds) next[id] = point;
  return next;
}

/** Their old profit counts again. */
export function clearClientsProfitFresh(resets: ClientProfitResets, clientIds: string[]): ClientProfitResets {
  const next = { ...resets };
  for (const id of clientIds) delete next[id];
  return next;
}

/** The later of two start points (null = none). */
export function laterReset(a: RepResetPoint | null | undefined, b: RepResetPoint | null | undefined): RepResetPoint | null {
  if (!a) return b ?? null;
  if (!b) return a;
  if (a.date !== b.date) return a.date > b.date ? a : b;
  return a.at >= b.at ? a : b;
}

/** Each device's start point: the global one and its client's, whichever is later. */
export function profitResetByAccount(
  accounts: Pick<StarlinkAccountSummary, "id" | "clientId">[],
  clientResets: ClientProfitResets,
  global: RepResetPoint | null,
): Record<string, RepResetPoint | null> {
  const out: Record<string, RepResetPoint | null> = {};
  for (const a of accounts) out[a.id] = laterReset(global, a.clientId ? clientResets[a.clientId] : undefined);
  return out;
}
