import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "./ledgerStore";
import { settledButStillDue } from "./settledStillDue";

// Fake device - shaped like his Oct 10 2026 case: a month's D of ALL 17,714 settled by «تجديد» on
// Oct 8 while Starlink, read on Oct 10, still asks ALL 17,714.
const now = new Date("2026-10-10T10:00:00Z");
function shipment(id: string, o: { amount?: number; currencyCode?: string; settledAt?: string; status?: "settled" | "pending"; waived?: boolean; previousDebtId?: string; usd?: number } = {}): LedgerEntry {
  return {
    id,
    kind: "debit",
    amount: 94000,
    currency: "MRU",
    date: "2026-10-07",
    createdAt: "2026-10-07T09:00:00Z",
    note: "",
    email: "",
    ...(o.previousDebtId ? { previousDebtId: o.previousDebtId } : {}),
    starlinkCost: {
      status: o.status ?? "settled",
      currencyCode: o.currencyCode ?? "ALL",
      amount: o.amount ?? 17714,
      rate: { rateFromUsd: 78.68, usdValue: o.usd ?? 225.14 },
      ...(o.status === "pending" ? {} : { paidAt: "2026-10-08", settledAt: o.settledAt ?? "2026-10-08T12:00:00Z" }),
      ...(o.waived ? { waived: true } : {}),
    },
  } as LedgerEntry;
}
const base = { billCurrency: "ALL", billRateFromUsd: 78.68, lastScanAt: "2026-10-10T08:00:00Z", now };

describe("↩️ a D settled while Starlink still asks for it", () => {
  it("the gap equal to a D settled before the last read → offered back", () => {
    const found = settledButStillDue([shipment("old", { settledAt: "2026-09-08T12:00:00Z" }), shipment("s1")], { ...base, gapUsd: 225.14 });
    expect(found.map((e) => e.id)).toEqual(["s1"]);
    // two settled together
    const two = settledButStillDue([shipment("a", { settledAt: "2026-10-01T12:00:00Z" }), shipment("b")], { ...base, gapUsd: 450.28 });
    expect(two.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("nothing when: paid after the last read, no read, another amount, waived (fault), a previous debt, still pending, too old", () => {
    const gap = { ...base, gapUsd: 225.14 };
    expect(settledButStillDue([shipment("s", { settledAt: "2026-10-10T09:00:00Z" })], gap)).toEqual([]);
    expect(settledButStillDue([shipment("s")], { ...gap, lastScanAt: null })).toEqual([]);
    expect(settledButStillDue([shipment("s")], { ...gap, gapUsd: 100 })).toEqual([]);
    expect(settledButStillDue([shipment("s", { waived: true })], gap)).toEqual([]);
    expect(settledButStillDue([shipment("s", { previousDebtId: "p" })], gap)).toEqual([]);
    expect(settledButStillDue([shipment("s", { status: "pending" })], gap)).toEqual([]);
    expect(settledButStillDue([shipment("s", { settledAt: "2026-07-01T12:00:00Z" })], gap)).toEqual([]);
  });

  it("a D in another currency counts at its locked dollars; the bill's currency at today's rate", () => {
    expect(settledButStillDue([shipment("u", { currencyCode: "USD", amount: 60, usd: 60 })], { ...base, gapUsd: 61 }).map((e) => e.id)).toEqual(["u"]);
    expect(settledButStillDue([shipment("s")], { ...base, billRateFromUsd: 80, gapUsd: 17714 / 80 }).map((e) => e.id)).toEqual(["s"]);
  });
});
