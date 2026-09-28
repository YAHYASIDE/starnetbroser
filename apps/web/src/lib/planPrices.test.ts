import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { applyPlanChange, groupPlans, planKey, validatePlanChange } from "./planPrices";

const plan = { saleAmount: 4000, saleCurrency: "MRU", costAmount: 50, costCurrency: "USD" };
const acc = (id: string, o: Partial<StarlinkAccountSummary> = {}) => ({ id, name: id, renewalPlan: plan, ...o }) as StarlinkAccountSummary;

describe("monthly price groups", () => {
  const accounts = [acc("a"), acc("b"), acc("c", { renewalPlan: { ...plan, saleAmount: 4500 } }), acc("d", { renewalPlan: undefined }), acc("e", { archivedAt: "x" })];

  it("groups active devices by identical price, biggest group first", () => {
    const groups = groupPlans(accounts);
    expect(groups.map((g) => [g.plan.saleAmount, g.accountIds])).toEqual([
      [4000, ["a", "b"]],
      [4500, ["c"]],
    ]);
  });

  it("changes one group only, keeping currencies", () => {
    const { accounts: next, changed } = applyPlanChange(accounts, planKey(plan), { costAmount: 55 });
    expect(changed).toBe(2);
    expect(next.find((a) => a.id === "a")!.renewalPlan).toEqual({ ...plan, costAmount: 55 });
    expect(next.find((a) => a.id === "c")!.renewalPlan!.costAmount).toBe(50);
    expect(next.find((a) => a.id === "e")!.renewalPlan).toEqual(plan);
    expect(validatePlanChange({ saleAmount: 0 })).toBeTruthy();
    expect(validatePlanChange({ costAmount: 0 })).toBeNull();
  });
});
