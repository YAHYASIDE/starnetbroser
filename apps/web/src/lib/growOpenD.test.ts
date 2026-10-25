import { describe, expect, it } from "vitest";
import { computeExpectedShipmentProfit, summarizeDeviceProfit } from "./accountingStore";
import { computeBalanceByCurrency, type LedgerEntry } from "./ledgerStore";
import { growableD, growOpenD, planGrowOpenD } from "./growOpenD";

const AT = "2026-10-25T10:00:00.000Z";

function shipment(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "d1",
    kind: "debit",
    amount: 27000,
    currency: "SIFA",
    note: "",
    email: "",
    date: "2026-10-12",
    createdAt: "2026-10-12T09:00:00.000Z",
    saleRate: { rateFromUsd: 540, usdValue: 50 },
    starlinkCost: { status: "pending", currencyCode: "USD", amount: 45.03 },
    ...over,
  };
}

describe("🔗 «أضفه إلى D المفتوح» (his Oct 25 2026 ask)", () => {
  it("his card: D 45.03 $ sold 27,000 سيفا, Starlink asks 65.95 $ → D 65.95 $, the customer ≈ 39,544 سيفا", () => {
    const plan = planGrowOpenD([shipment()], 20.92)!;
    expect(plan.costUsdAfter).toBe(65.95);
    expect(plan.amountAfter).toBe(39544);
    const grown = growOpenD(plan, AT);
    expect(grown.id).toBe("d1");
    expect(grown.starlinkCost).toMatchObject({ status: "pending", currencyCode: "USD", amount: 65.95 });
    expect(grown.amount).toBe(39544);
    expect(grown.grownBy).toEqual([{ at: AT, usd: 20.92, cost: 20.92, amount: 12544 }]);
    // the customer owes the new total, once (no second operation)
    expect(computeBalanceByCurrency([grown]).SIFA).toBe(39544);
  });

  it("the expected profit is still computed, in the same proportion as before", () => {
    const before = computeExpectedShipmentProfit(shipment());
    const grown = growOpenD(planGrowOpenD([shipment()], 20.92)!, AT);
    const after = computeExpectedShipmentProfit(grown);
    expect(before.status).toBe("expected");
    expect(after.status).toBe("expected");
    const pb = (before as { profitUsd: number }).profitUsd;
    const pa = (after as { profitUsd: number }).profitUsd;
    expect(pa / pb).toBeCloseTo(65.95 / 45.03, 1);
    expect(summarizeDeviceProfit([grown]).expectedCount).toBe(1);
  });

  it("a D in another currency grows at ITS OWN locked rate, not today's", () => {
    const d = shipment({ starlinkCost: { status: "pending", currencyCode: "ARS", amount: 54876, rate: { rateFromUsd: 1424.24, usdValue: 38.53 } } });
    const grown = growOpenD(planGrowOpenD([d], 10)!, AT);
    expect(grown.starlinkCost).toMatchObject({ currencyCode: "ARS", rate: { rateFromUsd: 1424.24, usdValue: 48.53 } });
    expect(grown.starlinkCost!.amount).toBeCloseTo(54876 + 14242.4, 1);
  });

  it("grows the newest open D; never a settled, waiting-for-bill or legacy one", () => {
    const old = shipment({ id: "old", date: "2026-09-12" });
    const settled = shipment({ id: "s", date: "2026-10-20", starlinkCost: { status: "settled", currencyCode: "USD", amount: 40, paidAt: "2026-10-21" } });
    const waiting = shipment({ id: "w", date: "2026-10-22", starlinkCost: { status: "pending", awaitingBill: { since: AT } } });
    const legacy = shipment({ id: "l", date: "2026-10-23", starlinkCost: undefined });
    expect(growableD([old, settled, waiting, legacy, shipment({ id: "new" })])?.id).toBe("new");
    expect(planGrowOpenD([settled, waiting, legacy], 5)).toBeNull();
    expect(planGrowOpenD([shipment()], 0)).toBeNull();
  });

  it("a dollar sale is rounded to the cent", () => {
    const plan = planGrowOpenD([shipment({ amount: 60, currency: "USD", saleRate: undefined })], 20.92)!;
    expect(plan.amountAfter).toBe(87.87);
  });
});
