import { describe, expect, it } from "vitest";
import { lastChargePrice } from "./chargeDefault";
import type { LedgerEntry } from "./ledgerStore";

// Fake data only.
const e = (id: string, extra: Partial<LedgerEntry>): LedgerEntry => ({ id, kind: "debit", amount: 8000, currency: "SIFA", note: "", email: "", date: "2026-10-01", createdAt: "2026-10-01T10:00:00Z", ...extra });

describe("⏳ the charge window fills in the customer's usual price (his Nov 12 2026 ask)", () => {
  it("the device's last charge: its price and currency", () => {
    expect(lastChargePrice([e("a", { amount: 7000, date: "2026-09-01" }), e("b", { amount: 8000, date: "2026-10-01" }), e("p", { kind: "credit", amount: 8000, date: "2026-10-02" })])).toEqual({ amount: 8000, currency: "SIFA" });
    expect(lastChargePrice([e("a", { currency: "MRU", amount: 3000, createdAt: "2026-10-01T09:00:00Z" }), e("b", { currency: "SIFA", createdAt: "2026-10-01T08:00:00Z" })])).toEqual({ amount: 3000, currency: "MRU" });
  });

  it("a previous owner's debt, another currency or nothing → nothing to fill", () => {
    expect(lastChargePrice([e("a", { previousDebtId: "x" })])).toBeNull();
    expect(lastChargePrice([e("a", { currency: "EUR" as LedgerEntry["currency"] })])).toBeNull();
    expect(lastChargePrice([])).toBeNull();
  });
});
