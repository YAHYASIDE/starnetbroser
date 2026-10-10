import { describe, expect, it } from "vitest";
import type { LedgerByAccount, LedgerEntry } from "./ledgerStore";
import { createLedgerEntry } from "./ledgerStore";
import { repCostFactor, repProfitUsd, repRatesFor, stampRepRates } from "./repRates";
import { listRepDeviceCommissions, shipmentRepShareUsd } from "./repStore";

// His example (Oct 10 2026): sold 30,000 أوقية at the real 430, Starlink cost 50 $, rep 50%.
// Real profit 8,500 أوقية; at the rep's 450 the cost is 22,500 → his profit 7,500, his half 3,750.
function shipment(o: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "s1",
    kind: "debit",
    amount: 30000,
    currency: "MRU",
    date: "2026-10-12",
    createdAt: "2026-10-12T09:00:00Z",
    note: "",
    email: "",
    saleRate: { rateFromUsd: 430, usdValue: 30000 / 430 },
    starlinkCost: { status: "settled", currencyCode: "USD", amount: 50, paidAt: "2026-10-12" },
    profitCurrencyRates: { MRU: 430 },
    representativeId: "r1",
    representativeCommissionPercent: 50,
    ...o,
  } as LedgerEntry;
}
const mru = (usd: number) => Math.round(usd * 430 * 100) / 100;

describe("💱 سعر المندوب", () => {
  it("his profit counts the cost at his rate; ours stays real", () => {
    const e = shipment({ representativeRates: { MRU: 450 } });
    expect(repCostFactor(e)).toBeCloseTo(450 / 430);
    expect(mru(repProfitUsd(e, 30000 / 430 - 50))).toBeCloseTo(7500, 0);
    expect(mru(shipmentRepShareUsd(e)!)).toBeCloseTo(3750, 0);
    const [row] = listRepDeviceCommissions("r1", { d1: [e] });
    expect(mru(row!.profit.profitUsd!)).toBeCloseTo(7500, 0);
    expect(mru(row!.profit.starlinkCostUsd!)).toBeCloseTo(22500, 0);
    // ours = the real 8,500 − his 3,750
    expect(mru(row!.ourShareUsd!)).toBeCloseTo(4750, 0);
  });

  it("no rate of his for the sale's currency, a dollar sale, or none at all → unchanged", () => {
    expect(mru(shipmentRepShareUsd(shipment())!)).toBeCloseTo(4250, 0);
    expect(repCostFactor(shipment({ representativeRates: { SIFA: 620 } }))).toBe(1);
    expect(repCostFactor(shipment({ currency: "USD", saleRate: undefined, representativeRates: { MRU: 450 } }))).toBe(1);
  });

  it("سيفا sale uses his سيفا rate", () => {
    const e = shipment({ currency: "SIFA", amount: 40000, saleRate: { rateFromUsd: 600, usdValue: 40000 / 600 }, representativeRates: { SIFA: 650 } });
    // real profit 40000/600 − 50 = 16.67 $ ; his: cost 50 × 650/600 = 54.17 → 12.5 $
    expect(repProfitUsd(e, 40000 / 600 - 50)).toBeCloseTo(12.5, 2);
  });

  it("a still-D shipment's expected share uses his rate too", () => {
    const e = shipment({ starlinkCost: { status: "pending", currencyCode: "USD", amount: 50 }, profitCurrencyRates: undefined, representativeRates: { MRU: 450 } });
    const [row] = listRepDeviceCommissions("r1", { d1: [e] });
    expect(mru(row!.expectedRepShareUsd!)).toBeCloseTo(3750, 0);
  });

  it("«من تاريخ»: stamps his shipments from that day on only; null removes; new ones get it when recorded", () => {
    const ledger: LedgerByAccount = {
      d1: [shipment({ id: "old", date: "2026-10-01" }), shipment({ id: "new", date: "2026-10-12" }), shipment({ id: "other", date: "2026-10-12", representativeId: "r2" })],
    };
    const { ledger: stamped, count } = stampRepRates(ledger, "r1", { MRU: 450, SIFA: 0 }, "2026-10-05");
    expect(count).toBe(1);
    expect(stamped.d1!.map((e) => e.representativeRates)).toEqual([undefined, { MRU: 450 }, undefined]);
    expect(stampRepRates(stamped, "r1", { MRU: 450 }, "2026-10-05").count).toBe(0);
    expect(stampRepRates(stamped, "r1", null, "2026-10-05").ledger.d1![1]!.representativeRates).toBeUndefined();

    const plan = { since: "2026-10-05", MRU: 450 };
    expect(repRatesFor(plan, "2026-10-04")).toBeUndefined();
    expect(repRatesFor(plan, "2026-10-05")).toEqual({ MRU: 450 });
    const created = createLedgerEntry({ kind: "debit", amount: 30000, currency: "MRU", note: "", email: "", date: "2026-10-12", representative: { id: "r1", commissionPercent: 50, ratePlan: plan } });
    expect(created.representativeRates).toEqual({ MRU: 450 });
    const before = createLedgerEntry({ kind: "debit", amount: 30000, currency: "MRU", note: "", email: "", date: "2026-10-01", representative: { id: "r1", commissionPercent: 50, ratePlan: plan } });
    expect(before.representativeRates).toBeUndefined();
  });
});
