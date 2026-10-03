import { describe, expect, it } from "vitest";
import { buildClientDevicePayment } from "./clientDevicePayment";
import type { CurrencyStore } from "./currencyStore";
import type { LedgerEntry } from "./ledgerStore";

const now = "2026-09-25T00:00:00.000Z";
const store: CurrencyStore = {
  USD: { code: "USD", name: "دولار", symbol: "$", rateFromUsd: 1, updatedAt: now, enabled: true },
  MRU: { code: "MRU", name: "أوقية", symbol: "MRU", rateFromUsd: 40, updatedAt: now, enabled: true },
};
const shipment = (id: string, amount: number, date: string): LedgerEntry => ({
  id, kind: "debit", amount, currency: "MRU", note: "", email: "", date, createdAt: `${date}T00:00:00Z`,
});

describe("buildClientDevicePayment", () => {
  it("records a credit with its channel and locked rate, allocated FIFO to the oldest shipments", () => {
    const entries = [shipment("new", 2000, "2026-09-10"), shipment("old", 3000, "2026-08-10")];
    const r = buildClientDevicePayment(entries, [], store, { amount: 4000, currency: "MRU", date: "2026-09-25", paymentMethod: "masrvi" });
    if (!r.ok) throw new Error(r.message);
    expect(r.entry).toMatchObject({ kind: "credit", amount: 4000, currency: "MRU", paymentMethod: "masrvi", paymentRate: { rateFromUsd: 40, usdValue: 100 } });
    expect(r.allocations.map((a) => [a.shipmentEntryId, a.amount])).toEqual([["old", 3000], ["new", 1000]]);
    expect(r.unallocated).toBe(0);
  });

  it("keeps an overpayment unallocated, and refuses without a rate", () => {
    const r = buildClientDevicePayment([shipment("s", 100, "2026-09-01")], [], store, { amount: 150, currency: "MRU", date: "2026-09-25", paymentMethod: "bankily" });
    expect(r.ok && r.unallocated).toBe(50);
    const bad = buildClientDevicePayment([], [], { USD: store.USD! }, { amount: 10, currency: "SIFA", date: "2026-09-25", paymentMethod: "cash" });
    expect(bad.ok).toBe(false);
  });
});
