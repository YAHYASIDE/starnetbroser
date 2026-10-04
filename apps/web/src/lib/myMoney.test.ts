import { describe, expect, it } from "vitest";
import { computeCashBalanceByCurrency, listStandaloneCashEntries } from "./cashStore";
import type { PersonalExpense } from "./personalExpenses";
import {
  addDebt,
  addDebtPayment,
  addIncome,
  addIncomeCategory,
  addRecurringRule,
  allIncomeCategories,
  debtRemaining,
  debtTotals,
  deleteDebt,
  dueRecurring,
  EMPTY_DEBT_BOOK,
  editIncome,
  firstRecurringMonth,
  monthLeft,
  buildWealth,
  personalFlows,
  skipRecurringMonth,
  syncDebtCash,
  syncDebtPaymentCash,
  syncIncomeCash,
} from "./myMoney";

const rates = { MRU: 400, XOF: 600 };
const now = new Date("2026-10-04T10:00:00Z");

describe("💵 الدخل", () => {
  it("records income in its own currency and checks the input", () => {
    const made = addIncome([], { categoryId: "salary", amount: 50000, currencyCode: "MRU", date: "2026-10-01", toCash: true }, now);
    expect(made.ok && made.income).toMatchObject({ categoryId: "salary", amount: 50000, currencyCode: "MRU" });
    expect(addIncome([], { categoryId: "salary", amount: 0, currencyCode: "MRU", date: "2026-10-01", toCash: true }).ok).toBe(false);
    expect(addIncome([], { categoryId: "", amount: 5, currencyCode: "MRU", date: "2026-10-01", toCash: true }).ok).toBe(false);
  });

  it("goes into الكاش as a linked entry the business reports leave out", () => {
    const made = addIncome([], { categoryId: "gift", amount: 3000, currencyCode: "MRU", date: "2026-10-02", toCash: true }, now);
    if (!made.ok) throw new Error();
    const cash = syncIncomeCash([], made.income, []);
    expect(computeCashBalanceByCurrency(cash)).toEqual({ MRU: 3000 });
    expect(listStandaloneCashEntries(cash)).toEqual([]);
    expect(syncIncomeCash(cash, { ...made.income, toCash: false }, [])).toEqual([]);
  });

  it("an edit keeps the id and the 🔁 link", () => {
    const made = addIncome([], { categoryId: "salary", amount: 100, currencyCode: "MRU", date: "2026-10-01", toCash: false }, now, "rule-1");
    if (!made.ok) throw new Error();
    const edited = editIncome(made.list, made.income.id, { categoryId: "salary", amount: 120, currencyCode: "MRU", date: "2026-10-01", toCash: false });
    expect(edited.ok && edited.income).toMatchObject({ id: made.income.id, amount: 120, recurringId: "rule-1" });
  });

  it("adds the operator's own income sections, never twice", () => {
    const made = addIncomeCategory([], " DEMO ", "🏷️");
    expect(made.ok && made.list.map((c) => c.name)).toEqual(["DEMO"]);
    if (!made.ok) throw new Error();
    expect(addIncomeCategory(made.list, "DEMO").ok).toBe(false);
    expect(addIncomeCategory([], "الراتب").ok).toBe(false);
    // An expense section's name is fine for income.
    expect(addIncomeCategory([], "أكل").ok).toBe(true);
  });

  it("keeps «أخرى» last after the operator's own sections", () => {
    const names = allIncomeCategories([{ id: "c1", icon: "🏷️", name: "DEMO" }]).map((c) => c.id);
    expect(names.at(-1)).toBe("other");
    expect(names.at(-2)).toBe("c1");
  });
});

describe("🔁 شهري", () => {
  const rule = () => {
    const made = addRecurringRule([], { kind: "income", categoryId: "salary", amount: 50000, currencyCode: "MRU", day: 5, viaCash: true }, "2026-08-03", now);
    if (!made.ok) throw new Error();
    return made.rule;
  };

  it("records each month once its day has come, never twice", () => {
    const r = rule();
    const due = dueRecurring([r], [], [], "2026-10-04", now);
    // Made on Aug 3 for the 5th: Aug and Sep are due, Oct 5 not yet.
    expect(due.incomes.map((i) => i.date)).toEqual(["2026-08-05", "2026-09-05"]);
    expect(due.incomes.every((i) => i.recurringId === r.id && i.toCash)).toBe(true);
    expect(dueRecurring([r], due.incomes, [], "2026-10-04", now).incomes).toEqual([]);
    expect(dueRecurring([r], due.incomes, [], "2026-10-05", now).incomes.map((i) => i.date)).toEqual(["2026-10-05"]);
  });

  it("a month whose record was deleted stays deleted", () => {
    const r = rule();
    const skipped = skipRecurringMonth([r], r.id, "2026-08");
    expect(dueRecurring(skipped, [], [], "2026-09-30", now).incomes.map((i) => i.date)).toEqual(["2026-09-05"]);
  });

  it("an expense rule (the rent) records personal expenses", () => {
    const made = addRecurringRule([], { kind: "expense", categoryId: "home", amount: 20000, currencyCode: "MRU", day: 1, viaCash: false }, "2026-10-01", now);
    if (!made.ok) throw new Error();
    const due = dueRecurring(made.list, [], [], "2026-10-01", now);
    expect(due.expenses).toHaveLength(1);
    expect(due.expenses[0]).toMatchObject({ categoryId: "home", date: "2026-10-01", fromCash: false, recurringId: made.rule.id });
  });

  it("starts on its first day on/after the day it was made", () => {
    expect(firstRecurringMonth("2026-10-04", 5)).toBe("2026-10");
    expect(firstRecurringMonth("2026-10-06", 5)).toBe("2026-11");
    expect(firstRecurringMonth("2026-12-20", 1)).toBe("2027-01");
  });

  it("only days 1-28 (every month has them)", () => {
    expect(addRecurringRule([], { kind: "income", categoryId: "salary", amount: 1, currencyCode: "MRU", day: 31, viaCash: false }, "2026-10-01").ok).toBe(false);
  });
});

describe("🤝 الديون", () => {
  it("what's left after repayments, and the cash both ways", () => {
    const lent = addDebt(EMPTY_DEBT_BOOK, { kind: "lent", person: "DEMO NAME", amount: 10000, currencyCode: "MRU", date: "2026-10-01", viaCash: true }, now);
    if (!lent.ok) throw new Error();
    let cash = syncDebtCash([], lent.debt);
    expect(computeCashBalanceByCurrency(cash)).toEqual({ MRU: -10000 });

    const paid = addDebtPayment(lent.book, { debtId: lent.debt.id, amount: 4000, date: "2026-10-03", viaCash: true }, now);
    if (!paid.ok) throw new Error();
    cash = syncDebtPaymentCash(cash, paid.payment, lent.debt);
    expect(computeCashBalanceByCurrency(cash)).toEqual({ MRU: -6000 });
    expect(debtRemaining(paid.book, lent.debt.id)).toBe(6000);
    expect(addDebtPayment(paid.book, { debtId: lent.debt.id, amount: 7000, date: "2026-10-03", viaCash: false }).ok).toBe(false);
    expect(listStandaloneCashEntries(cash)).toEqual([]);

    const removed = deleteDebt(paid.book, lent.debt.id);
    expect(removed.book).toEqual(EMPTY_DEBT_BOOK);
    expect(removed.removedIds).toEqual([lent.debt.id, paid.payment.id]);
  });

  it("totals what people owe me and what I owe, per currency", () => {
    const a = addDebt(EMPTY_DEBT_BOOK, { kind: "lent", person: "A", amount: 100, currencyCode: "MRU", date: "2026-10-01", viaCash: false });
    if (!a.ok) throw new Error();
    const b = addDebt(a.book, { kind: "borrowed", person: "B", amount: 50, currencyCode: "USD", date: "2026-10-01", viaCash: false });
    if (!b.ok) throw new Error();
    expect(debtTotals(b.book)).toEqual({ lent: { MRU: 100 }, borrowed: { USD: 50 } });
  });
});

describe("the final figures", () => {
  it("«يبقى لك هذا الشهر» = business net + income − expenses (that month only)", () => {
    const income = addIncome([], { categoryId: "salary", amount: 50000, currencyCode: "MRU", date: "2026-10-01", toCash: false }, now);
    if (!income.ok) throw new Error();
    const expenses = [
      { id: "e1", categoryId: "food", amount: 6000, currencyCode: "MRU", date: "2026-10-02", fromCash: true, createdAt: "" },
      { id: "e2", categoryId: "food", amount: 9999, currencyCode: "MRU", date: "2026-09-30", fromCash: true, createdAt: "" },
    ] as PersonalExpense[];
    const left = monthLeft({ month: "2026-10", businessNetMru: 120000, incomes: income.list, expenses, rates });
    expect(left).toMatchObject({ businessMru: 120000, incomeMru: 50000, expenseMru: 6000, leftMru: 164000, missing: [] });
  });

  it("«في يدك الآن» and «كل ما تملك»: have − owe, then + what's owed to me", () => {
    const a = addDebt(EMPTY_DEBT_BOOK, { kind: "lent", person: "A", amount: 1000, currencyCode: "MRU", date: "2026-10-01", viaCash: false });
    if (!a.ok) throw new Error();
    const b = addDebt(a.book, { kind: "borrowed", person: "B", amount: 10, currencyCode: "USD", date: "2026-10-01", viaCash: false });
    if (!b.ok) throw new Error();
    const wealth = buildWealth({
      cash: { MRU: 20000, XOF: 6000 },
      banks: [{ name: "DEMO BANK", byCurrency: { MRU: 8000 } }],
      cardUsd: 100,
      customers: [{ name: "DEMO NAME", byCurrency: { MRU: 46000 } }],
      repsMru: [{ name: "REP A", mru: 3000 }, { name: "REP B", mru: -2000 }],
      debts: b.book,
      suppliers: [{ name: "SUPPLIER", byCurrency: { MRU: 5000 } }],
      starlink: [{ name: "demo-a", usd: 50 }],
      rates,
    });
    const by = Object.fromEntries(wealth.lines.map((l) => [l.key, l.mru]));
    // XOF 6000 at 600/USD = 10 USD = 4000 MRU.
    expect(by).toMatchObject({ cash: 24000, banks: 8000, card: 40000, customers: 46000, repsOwe: 3000, lent: 1000, starlink: 20000, suppliers: 5000, repsOwed: 2000, borrowed: 4000 });
    // have 72,000 − owe 31,000
    expect(wealth.inHandMru).toBe(41000);
    // + owed to me 50,000
    expect(wealth.totalMru).toBe(91000);
    expect(wealth.lines.find((l) => l.key === "customers")?.items[0]).toMatchObject({ name: "DEMO NAME", mru: 46000 });
    expect(wealth.missing).toEqual([]);
  });

  it("says which currency had no rate instead of guessing", () => {
    const wealth = buildWealth({ cash: { EUR: 10 }, banks: [], cardUsd: 0, customers: [], repsMru: [], debts: EMPTY_DEBT_BOOK, suppliers: [], starlink: [], rates });
    expect(wealth.missing).toEqual(["EUR"]);
    expect(wealth.totalMru).toBe(0);
  });

  it("records through a bank / wallet become its flows (+ in, − out), not الكاش", () => {
    const inc = addIncome([], { categoryId: "salary", amount: 500, currencyCode: "MRU", date: "2026-10-01", toCash: true, accountId: "bank" }, now);
    if (!inc.ok) throw new Error();
    expect(inc.income.toCash).toBe(false);
    const lent = addDebt(EMPTY_DEBT_BOOK, { kind: "lent", person: "A", amount: 200, currencyCode: "MRU", date: "2026-10-02", viaCash: true, accountId: "bank" });
    if (!lent.ok) throw new Error();
    const paid = addDebtPayment(lent.book, { debtId: lent.debt.id, amount: 50, date: "2026-10-03", viaCash: false, accountId: "bank" });
    if (!paid.ok) throw new Error();
    const expenses = [{ id: "e", categoryId: "food", amount: 30, currencyCode: "MRU", date: "2026-10-02", fromCash: false, accountId: "bank", createdAt: "" }] as PersonalExpense[];
    expect(personalFlows(inc.list, expenses, paid.book).map((f) => f.amount)).toEqual([500, -30, -200, 50]);
  });
});
