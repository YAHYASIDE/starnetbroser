/**
 * ⏳ The background checks of charges waiting for their invoice (lib/awaitingBill.ts): each waiting
 * charge schedules its device's checks once (30 min, 1 h, 2 h, 6 h, 12 h after it was recorded); a device whose
 * charges are all filled has its remaining checks dropped. Which charges were scheduled is kept on
 * this phone only (`starnet.billChecks2`), like the other native schedules.
 */

import { LocalBrowser } from "@starnet/local-browser-plugin";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { awaitingEntries, billCheckDelays } from "./awaitingBill";
import type { LedgerByAccount } from "./ledgerStore";
import { isRunningInAndroidApp } from "./localBrowser";

// v2 (Oct 20 2026, the new times): charges still waiting get the checks still ahead of them again.
const KEY = "starnet.billChecks2";

/** entryId → its device. */
type Scheduled = Record<string, string>;

/** What to (re)schedule and what to drop - pure. */
export function planBillChecks(
  ledger: LedgerByAccount,
  scheduled: Scheduled,
  now: Date = new Date(),
): { schedule: { accountId: string; delaysMs: number[] }[]; cancel: string[]; next: Scheduled } {
  const next: Scheduled = {};
  const waitingDevices = new Set<string>();
  const schedule: { accountId: string; delaysMs: number[] }[] = [];
  for (const [accountId, entries] of Object.entries(ledger)) {
    for (const e of awaitingEntries(entries ?? [])) {
      waitingDevices.add(accountId);
      next[e.id] = accountId;
      if (scheduled[e.id]) continue;
      const delaysMs = billCheckDelays(e.starlinkCost!.awaitingBill!.since, now);
      if (delaysMs.length) schedule.push({ accountId, delaysMs });
    }
  }
  const cancel = [...new Set(Object.values(scheduled))].filter((id) => !waitingDevices.has(id));
  return { schedule, cancel, next };
}

function load(): Scheduled {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Scheduled) : {};
  } catch {
    return {};
  }
}

export async function syncBillChecks(ledger: LedgerByAccount, accounts: StarlinkAccountSummary[]): Promise<void> {
  if (!isRunningInAndroidApp()) return;
  const plan = planBillChecks(ledger, load());
  try {
    for (const s of plan.schedule) {
      const name = accounts.find((a) => a.id === s.accountId)?.name ?? "";
      await LocalBrowser.scheduleBillCheck({ accountId: s.accountId, accountName: name, delaysMs: s.delaysMs });
    }
    for (const id of plan.cancel) await LocalBrowser.cancelBillCheck({ accountId: id });
    window.localStorage.setItem(KEY, JSON.stringify(plan.next));
  } catch {
    // an older APK without the checks: the charge still fills from any sync
  }
}
