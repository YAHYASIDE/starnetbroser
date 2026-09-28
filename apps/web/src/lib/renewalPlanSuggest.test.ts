import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { DeviceStatus } from "@starnet/shared";
import type { LedgerByAccount, LedgerEntry } from "./ledgerStore";
import { applyPlanSuggestions, suggestRenewalPlans } from "./renewalPlanSuggest";

const acc = (o: Partial<StarlinkAccountSummary>): StarlinkAccountSummary =>
  ({ id: "", customerId: "x", name: "", deviceName: "", kitNumber: "", serialNumber: "", standbyDate: "", rechargeDate: "", balanceDue: "0", currency: "$", dishStatus: DeviceStatus.GREEN, wifiStatus: DeviceStatus.GREEN, alertReason: "", lastUpdated: "", lastSuccessfulScanAt: null, planName: "", ...o }) as StarlinkAccountSummary;
const e = (o: Partial<LedgerEntry>): LedgerEntry => ({ id: "x", kind: "debit", amount: 1, currency: "MRU", note: "", email: "", date: "2026-09-10", createdAt: "2026-09-10T00:00:00Z", ...o }) as LedgerEntry;

describe("monthly price from the last shipment", () => {
  const plan = { saleAmount: 1, saleCurrency: "USD", costAmount: 1, costCurrency: "USD" };
  const accounts = [acc({ id: "a", name: "A" }), acc({ id: "b", name: "B", renewalPlan: plan }), acc({ id: "c", name: "C" }), acc({ id: "d", name: "D" })];
  const ledger: LedgerByAccount = {
    a: [
      e({ amount: 3500, date: "2026-08-10", starlinkCost: { status: "settled", currencyCode: "USD", amount: 45 } }),
      e({ amount: 4000, date: "2026-09-10", starlinkCost: { status: "pending", currencyCode: "USD", amount: 50 } }),
      e({ kind: "credit", amount: 9000, date: "2026-09-20" }),
      e({ amount: 100, date: "2026-09-25", previousDebtId: "p" }),
    ],
    b: [e({ amount: 4000 })],
    c: [e({ amount: 20, currency: "USD" })],
  };

  it("suggests the latest real shipment for devices without a price", () => {
    expect(suggestRenewalPlans(accounts, ledger)).toEqual([
      { accountId: "a", name: "A", from: "2026-09-10", plan: { saleAmount: 4000, saleCurrency: "MRU", costAmount: 50, costCurrency: "USD" } },
      { accountId: "c", name: "C", from: "2026-09-10", plan: { saleAmount: 20, saleCurrency: "USD", costAmount: 0, costCurrency: "USD" } },
    ]);
  });

  it("applies only to devices still without one", () => {
    const next = applyPlanSuggestions(accounts, suggestRenewalPlans(accounts, ledger));
    expect(next.find((a) => a.id === "a")!.renewalPlan!.saleAmount).toBe(4000);
    expect(next.find((a) => a.id === "b")!.renewalPlan).toBe(plan);
    expect(next.find((a) => a.id === "d")!.renewalPlan).toBeUndefined();
  });
});
