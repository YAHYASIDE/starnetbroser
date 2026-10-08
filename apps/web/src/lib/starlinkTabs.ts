/**
 * 🛰️ «ستارلينك والبطاقة» in four icons instead of one long page (his Oct 2026 ask «بدل تقليب تحت…
 * اجعلهم ايقونات الفوق»): 📋 his own devices with a D · 🤝 the reps' devices, each rep on his own ·
 * 💳 the cards · 🔔 KAST notices (money in and out). Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { OpenShipmentDebt } from "./starlinkDebt";

export type StarlinkTab = "devices" | "reps" | "cards" | "notices";

export const STARLINK_TABS: { id: StarlinkTab; icon: string; label: string }[] = [
  { id: "devices", icon: "📋", label: "أجهزتي" },
  { id: "reps", icon: "🤝", label: "المناديب" },
  { id: "cards", icon: "💳", label: "البطاقات" },
  { id: "notices", icon: "🔔", label: "إشعارات كاست" },
];

export function isStarlinkTab(value: unknown): value is StarlinkTab {
  return STARLINK_TABS.some((t) => t.id === value);
}

/** The rep a D belongs to: the device's CURRENT rep (a device taken off a rep is his own again,
 * whatever rep its older shipment locked); the shipment's rep only when the device is gone. */
export function debtRepId(debt: OpenShipmentDebt, account: Pick<StarlinkAccountSummary, "representativeId"> | undefined): string | undefined {
  if (account) return account.representativeId || undefined;
  return debt.entry.representativeId || undefined;
}

export interface RepDebtGroup {
  repId: string;
  debts: OpenShipmentDebt[];
  totalUsd: number;
}

/** His own D's (no rep) and each rep's D's, reps by name; within a rep oldest first as given. */
export function splitDebtsByRep(
  debts: OpenShipmentDebt[],
  accountOf: (id: string) => Pick<StarlinkAccountSummary, "representativeId"> | undefined,
  repName: (id: string) => string,
): { mine: OpenShipmentDebt[]; reps: RepDebtGroup[] } {
  const mine: OpenShipmentDebt[] = [];
  const byRep = new Map<string, OpenShipmentDebt[]>();
  for (const d of debts) {
    const repId = debtRepId(d, accountOf(d.accountId));
    if (!repId) mine.push(d);
    else byRep.set(repId, [...(byRep.get(repId) ?? []), d]);
  }
  const reps = [...byRep.entries()]
    .map(([repId, list]) => ({ repId, debts: list, totalUsd: list.reduce((sum, d) => sum + d.costUsd, 0) }))
    .sort((a, b) => repName(a.repId).localeCompare(repName(b.repId)));
  return { mine, reps };
}
