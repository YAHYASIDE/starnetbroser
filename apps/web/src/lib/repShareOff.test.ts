import { describe, expect, it } from "vitest";
import { createLedgerEntry } from "./ledgerStore";
import { shipmentRepShareUsd } from "./repStore";

// Fake data only.
const settled = { status: "settled", currencyCode: "USD", amount: 50, paidAt: "2026-11-17", settledAt: "2026-11-17T08:00:00.000Z" } as const;

describe("🤝 «لا حصة له» on one charge (his Nov 17 2026 ask)", () => {
  it("the device stays the rep's, this charge gives him nothing; «نعم» keeps his percent", () => {
    const base = { kind: "debit" as const, amount: 100, currency: "USD" as const, note: "", email: "", date: "2026-11-17", starlinkCost: { ...settled } };
    const withShare = createLedgerEntry({ ...base, representative: { id: "r1", commissionPercent: 50 } });
    const noShare = createLedgerEntry({ ...base, representative: { id: "r1", commissionPercent: 0, sharesLosses: false } });
    expect(shipmentRepShareUsd(withShare)).toBeCloseTo(25);
    expect(noShare.representativeId).toBe("r1");
    expect(shipmentRepShareUsd(noShare)).toBe(0);
  });
});
