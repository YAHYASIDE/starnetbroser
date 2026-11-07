/**
 * 🔴🟡🆕 Three big colored icons on top of the home circles (his Nov 7 2026 ask «أضف أيقونات: مستعجل، غير مستعجل،
 * آخر المضافة… كبيرة وملوّنة وواضحة»; his choice «الأجهزة ذات التنبيه المفتوح»):
 *  - 🔴 مستعجل: devices with an open (not «✓ راجعته») alert marked 🔴 - from a rep's 🚩 or a team member's;
 *  - 🟡 غير مستعجل: devices whose open alerts are all 🟡 (a rep's older app sends no level = 🟡);
 *  - 🆕 آخر المضافة: the last 10 devices added by a rep (`addedByRepId`) or by another member of the team link (the
 *    link's log on this phone: «📡 جهاز» added), newest first.
 * Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { OwnerFlagStore } from "./repFlags";
import type { TeamActivity } from "./teamActivity";

const DEVICES_KEY = "starnet_demo_accounts_v1";
export const LAST_ADDED_LIMIT = 10;

/** Device ids by their open alerts: a device with one 🔴 open alert is «مستعجل», otherwise «غير مستعجل». */
export function flaggedDevices(store: OwnerFlagStore): { urgent: Set<string>; normal: Set<string> } {
  const urgent = new Set<string>();
  const open = new Set<string>();
  for (const f of Object.values(store)) {
    if (f.reviewedAt || !f.deviceId) continue;
    open.add(f.deviceId);
    if (f.level === "urgent") urgent.add(f.deviceId);
  }
  const normal = new Set([...open].filter((id) => !urgent.has(id)));
  return { urgent, normal };
}

export interface AddedByOther {
  id: string;
  /** The rep's name / the member's name. */
  by: string;
  at: string;
}

/** The last devices (at most 10) a rep or another member added - only devices still here (not deleted/archived). */
export function lastAddedByOthers(
  accounts: Pick<StarlinkAccountSummary, "id" | "addedByRepId" | "addedByRepAt" | "addedAt" | "deletedAt" | "archivedAt">[],
  activity: Pick<TeamActivity, "k" | "r" | "kind" | "by" | "at">[],
  repName: (repId: string) => string,
  limit = LAST_ADDED_LIMIT,
): AddedByOther[] {
  const live = new Map(accounts.filter((a) => !a.deletedAt && !a.archivedAt).map((a) => [a.id, a]));
  const found = new Map<string, AddedByOther>();
  for (const a of live.values()) {
    if (!a.addedByRepId) continue;
    const at = a.addedByRepAt || a.addedAt;
    if (at) found.set(a.id, { id: a.id, by: repName(a.addedByRepId), at });
  }
  for (const op of activity) {
    if (op.k !== DEVICES_KEY || op.kind !== "add" || !live.has(op.r)) continue;
    // a rep's device approved on another phone reached this one by the link - it stays the rep's
    if (found.get(op.r)?.by && live.get(op.r)?.addedByRepId) continue;
    const seen = found.get(op.r);
    if (!seen || seen.at < op.at) found.set(op.r, { id: op.r, by: op.by, at: op.at });
  }
  return [...found.values()].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0)).slice(0, limit);
}
