/**
 * 👤 «بدون زبون» (his Oct 2026 request): devices with no customer on them - a device with no
 * client, or whose client no longer exists. Split by who holds them: «أجهزتي» (no representative)
 * and each representative's own. Pure; nothing is stored.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import type { RepresentativeStore } from "./repStore";

/** "all", "mine" (no representative), or a representative's id. */
export type NoClientGroup = "all" | "mine" | string;

export interface NoClientRepCount {
  repId: string;
  name: string;
  count: number;
}

export interface NoClientCounts {
  total: number;
  mine: number;
  /** Representatives holding at least one, most first (a deleted rep shows as «مندوب محذوف»). */
  reps: NoClientRepCount[];
}

export function hasNoClient(account: Pick<StarlinkAccountSummary, "clientId">, clients: ClientStore): boolean {
  return !account.clientId || !clients[account.clientId];
}

export function matchesNoClientGroup(account: StarlinkAccountSummary, clients: ClientStore, group: NoClientGroup): boolean {
  if (!hasNoClient(account, clients)) return false;
  if (group === "all") return true;
  if (group === "mine") return !account.representativeId;
  return account.representativeId === group;
}

export function countNoClient(accounts: StarlinkAccountSummary[], clients: ClientStore, reps: RepresentativeStore): NoClientCounts {
  let total = 0;
  let mine = 0;
  const byRep = new Map<string, number>();
  for (const account of accounts) {
    if (!hasNoClient(account, clients)) continue;
    total += 1;
    if (!account.representativeId) mine += 1;
    else byRep.set(account.representativeId, (byRep.get(account.representativeId) ?? 0) + 1);
  }
  const repList = [...byRep].map(([repId, count]) => ({ repId, name: reps[repId]?.name ?? "مندوب محذوف", count }));
  repList.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ar"));
  return { total, mine, reps: repList };
}
