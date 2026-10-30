import { describe, expect, it } from "vitest";
import {
  addBusinessExpense,
  businessExpenseFlows,
  deleteBusinessExpense,
  editBusinessExpense,
  myShare,
  splitShares,
  summarizeBusinessExpenses,
  syncBusinessCash,
  syncBusinessRepShares,
  type BusinessExpenseInput,
} from "./businessExpenses";
import type { RepSettlement } from "./repStore";

// Fake data only.
const input = (o: Partial<BusinessExpenseInput> = {}): BusinessExpenseInput => ({
  categoryId: "cost-ads",
  categoryName: "إعلانات",
  amount: 9000,
  currencyCode: "MRU",
  date: "2026-10-30",
  fromCash: true,
  includeMe: true,
  repIds: ["r1", "r2"],
  ...o,
});

describe("📉 خسائر ومصاريف العمل (his Oct 30 2026 ask)", () => {
  it("shares equally between me and the chosen reps; the cents stay with me", () => {
    expect(splitShares(9000, true, ["r1", "r2"])).toEqual({ me: 3000, shares: [{ repId: "r1", amount: 3000 }, { repId: "r2", amount: 3000 }] });
    expect(splitShares(100, true, ["r1", "r2"])).toEqual({ me: 33.34, shares: [{ repId: "r1", amount: 33.33 }, { repId: "r2", amount: 33.33 }] });
    expect(splitShares(100, false, ["r1", "r2", "r3"])).toEqual({ me: 0, shares: [{ repId: "r1", amount: 33.33 }, { repId: "r2", amount: 33.33 }, { repId: "r3", amount: 33.34 }] });
    expect(splitShares(5000, true, [])).toEqual({ me: 5000, shares: [] });
  });

  it("records it, refuses nobody to carry it, and edits in place", () => {
    const added = addBusinessExpense([], input());
    if (!added.ok) throw new Error(added.message);
    expect(myShare(added.expense)).toBe(3000);
    expect(addBusinessExpense([], input({ includeMe: false, repIds: [] }))).toEqual({ ok: false, message: expect.stringContaining("من يتحمّله") });
    expect(addBusinessExpense([], input({ amount: 0 })).ok).toBe(false);
    const edited = editBusinessExpense(added.list, added.expense.id, input({ amount: 6000, repIds: ["r1"] }));
    if (!edited.ok) throw new Error(edited.message);
    expect(edited.expense.id).toBe(added.expense.id);
    expect(edited.expense.shares).toEqual([{ repId: "r1", amount: 3000 }]);
    expect(deleteBusinessExpense(edited.list, added.expense.id)).toEqual([]);
  });

  it("takes the whole amount out of الكاش, or out of a bank, or nothing", () => {
    const cash = addBusinessExpense([], input());
    if (!cash.ok) throw new Error();
    const entries = syncBusinessCash([], cash.expense);
    expect(entries).toEqual([expect.objectContaining({ kind: "out", amount: 9000, sourceId: cash.expense.id, sourceKind: "business-expense", category: "إعلانات" })]);
    expect(syncBusinessCash(entries, null, cash.expense.id)).toEqual([]);
    const bank = addBusinessExpense([], input({ fromCash: true, accountId: "bank1" }));
    if (!bank.ok) throw new Error();
    expect(bank.expense.fromCash).toBe(false);
    expect(syncBusinessCash([], bank.expense)).toEqual([]);
    expect(businessExpenseFlows(bank.list)).toEqual([{ accountId: "bank1", currencyCode: "MRU", date: "2026-10-30", amount: -9000 }]);
    const none = addBusinessExpense([], input({ fromCash: false }));
    if (!none.ok) throw new Error();
    expect(syncBusinessCash([], none.expense)).toEqual([]);
  });

  it("each rep's share comes off his profit, linked to the expense and removed with it", () => {
    const added = addBusinessExpense([], input());
    if (!added.ok) throw new Error();
    const other = { id: "s0", representativeId: "r1", kind: "commissionPayout", amount: 1, currencyCode: "MRU", date: "2026-10-01", createdAt: "" } as RepSettlement;
    const made = syncBusinessRepShares([other], added.expense, { MRU: 400 });
    expect(made).toHaveLength(3);
    expect(made[1]).toMatchObject({ representativeId: "r1", kind: "profitTransfer", amount: 3000, expenseId: added.expense.id, note: "📉 نصيبك من إعلانات", rates: { MRU: 400 } });
    expect(made[1]!.toDebt).toBeUndefined();
    // edited: made again, never twice
    expect(syncBusinessRepShares(made, { ...added.expense, shares: [{ repId: "r2", amount: 4500 }] }, undefined)).toHaveLength(2);
    expect(syncBusinessRepShares(made, null, undefined, added.expense.id)).toEqual([other]);
  });

  it("sums the period: the whole, my share, each rep's", () => {
    const a = addBusinessExpense([], input());
    if (!a.ok) throw new Error();
    const b = addBusinessExpense(a.list, input({ amount: 2000, repIds: [], date: "2026-10-31" }));
    if (!b.ok) throw new Error();
    const sum = summarizeBusinessExpenses(b.list, "2026-10-01", "2026-10-31");
    expect(sum).toEqual({ count: 2, total: { MRU: 11000 }, mine: { MRU: 5000 }, byRep: { r1: { MRU: 3000 }, r2: { MRU: 3000 } } });
    expect(summarizeBusinessExpenses(b.list, "2026-11-01", "2026-11-30").count).toBe(0);
  });
});
