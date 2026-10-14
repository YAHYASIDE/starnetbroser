/**
 * 🔗 «الدليل» behind a duplicate warning (his Oct 2026 ask «يظهر … الذي قلت عنه مكرر مع ظهور الاجهزة
 * الاثنين مع دليل تكرار»): the devices (or customers) that share one email / KIT / phone, side by
 * side, with what they share and what tells them apart (customer, when added, last sync, how many
 * operations). Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import type { HealthIssue, HealthIssueKind } from "./dataHealth";
import type { LedgerByAccount } from "./ledgerStore";

export const DUPLICATE_KINDS: HealthIssueKind[] = ["duplicate-email", "duplicate-kit", "duplicate-client-phone"];

export function isDuplicateKind(kind: HealthIssueKind): boolean {
  return DUPLICATE_KINDS.includes(kind);
}

const SHARED_LABEL: Partial<Record<HealthIssueKind, string>> = {
  "duplicate-email": "نفس الإيميل",
  "duplicate-kit": "نفس رقم KIT",
  "duplicate-client-phone": "نفس رقم الهاتف",
};

export interface DuplicateMember {
  accountId?: string;
  clientId?: string;
  name: string;
  clientName?: string;
  /** yyyy-mm-dd when it was added. */
  addedAt?: string;
  /** yyyy-mm-dd of its last Starlink sync, or undefined when never synced. */
  lastSync?: string;
  /** Device operations (or a customer's devices). */
  count: number;
  countLabel: string;
}

export interface DuplicateGroup {
  /** «نفس الإيميل» … */
  shared: string;
  /** The shared email / KIT / phone - the proof. */
  value: string;
  members: DuplicateMember[];
}

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : undefined);

/** One group per shared value, the oldest member first (usually the one to keep). */
export function duplicateGroups(issue: HealthIssue, accounts: StarlinkAccountSummary[], clients: ClientStore, ledger: LedgerByAccount): DuplicateGroup[] {
  const shared = SHARED_LABEL[issue.kind];
  if (!shared) return [];
  const byValue = new Map<string, DuplicateMember[]>();
  for (const item of issue.items) {
    const value = (item.detail ?? "").trim();
    if (!value) continue;
    let member: DuplicateMember;
    if (issue.kind === "duplicate-client-phone") {
      const client = item.clientId ? clients[item.clientId] : undefined;
      const devices = accounts.filter((a) => a.clientId === item.clientId && !a.deletedAt);
      member = { clientId: item.clientId, name: item.label, addedAt: day(client?.createdAt), count: devices.length, countLabel: "جهاز" };
    } else {
      const account = accounts.find((a) => a.id === item.accountId);
      const clientName = account?.clientId ? clients[account.clientId]?.name : undefined;
      member = {
        accountId: item.accountId,
        name: item.label,
        ...(clientName ? { clientName } : {}),
        addedAt: day(account?.addedAt ?? account?.addedByRepAt),
        lastSync: day(account?.lastSuccessfulScanAt),
        count: item.accountId ? (ledger[item.accountId] ?? []).length : 0,
        countLabel: "عملية",
      };
    }
    byValue.set(value, [...(byValue.get(value) ?? []), member]);
  }
  return [...byValue.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([value, members]) => ({ shared, value, members: [...members].sort((a, b) => (a.addedAt ?? "9").localeCompare(b.addedAt ?? "9")) }));
}

/** What to search on the home screen to see one device alone: its KIT, else its email, else its name. */
export function deviceSearchKey(account: Pick<StarlinkAccountSummary, "name" | "kitNumber" | "starlinkAccountEmail" | "expectedEmail">): string {
  return account.kitNumber?.trim() || account.starlinkAccountEmail?.trim() || account.expectedEmail?.trim() || account.name;
}
