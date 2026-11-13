import { describe, expect, it } from "vitest";
import { doubleShareGroups, secondShareIds } from "./repDoubleShares";
import type { RepDeviceCommissionRow } from "./repStore";

// Fake data only.
const row = (id: string, accountId: string, paidAt: string, share: number | undefined, createdAt = `${paidAt}T10:00:00Z`): RepDeviceCommissionRow =>
  ({
    accountId,
    entry: { id, kind: "debit", amount: 15000, currency: "SIFA", note: "", email: "", date: paidAt, createdAt, starlinkCost: { status: "settled", currencyCode: "USD", amount: 25, paidAt } },
    repShareUsd: share,
  }) as unknown as RepDeviceCommissionRow;

describe("⚠️ two shares for one device in a month (his Nov 13 2026 report)", () => {
  it("groups by device and the month the share landed; one share or an expected (D) one is not a double", () => {
    const rows = [
      row("a", "d1", "2026-11-13", 5.9, "2026-11-13T09:00:00Z"),
      row("b", "d1", "2026-11-13", 0.6, "2026-11-13T11:00:00Z"),
      row("c", "d1", "2026-10-13", 5.9),
      row("d", "d2", "2026-11-02", 4),
      row("e", "d2", "2026-11-20", undefined),
    ];
    const groups = doubleShareGroups(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ accountId: "d1", month: "2026-11" });
    expect(groups[0]!.rows.map((r) => r.entry.id)).toEqual(["a", "b"]);
    expect([...secondShareIds(rows)]).toEqual(["b"]);
  });
});
