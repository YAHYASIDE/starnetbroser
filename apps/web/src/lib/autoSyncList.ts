/**
 * What the app tells the native background sync about each device (localBrowser.ts →
 * SyncPriority.java): its renewal date and status, from which the phone decides how often to
 * check it - 7/3/1 days before the date, just after it, and stopped devices; everything else only
 * by hand. A device marked broken (متعطل) is never checked automatically - it isn't renewed.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { AutoSyncAccountRef } from "./localBrowser";

export function buildAutoSyncList(accounts: StarlinkAccountSummary[]): AutoSyncAccountRef[] {
  return accounts
    .filter((account) => !account.archivedAt && !account.deletedAt)
    .map((account) => ({
      id: account.id,
      name: account.name,
      renewalDate: account.deviceFault ? undefined : account.rechargeDate?.trim() || undefined,
      serviceStatus: account.serviceStatus || undefined,
      representativeId: account.representativeId || undefined,
    }));
}
