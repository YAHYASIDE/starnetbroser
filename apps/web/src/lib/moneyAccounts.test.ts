import { describe, expect, it } from "vitest";
import type { CashEntryList } from "./cashStore";
import type { LedgerByAccount, LedgerEntry } from "./ledgerStore";
import { accountBalance, addMoneyAccount, cashInHandEntries, correctBalance, deleteMoneyAccount, devicePaymentFlows, EMPTY_ACCOUNTS_BOOK } from "./moneyAccounts";

const bankily = () => {
  const made = addMoneyAccount(EMPTY_ACCOUNTS_BOOK, { name: "بنكيلي", icon: "🏦", currencyCode: "MRU", method: "bankily", openingBalance: 10000, openingDate: "2026-10-01" });
  if (!made.ok) throw new Error();
  return made;
};

const payment = (id: string, amount: number, date: string, method: LedgerEntry["paymentMethod"]) =>
  ({ id, kind: "credit", amount, currency: "MRU", date, paymentMethod: method, note: "", email: "", createdAt: "" }) as unknown as LedgerEntry;

describe("🏦 bank / wallet accounts", () => {
  it("one account per name and per payment method", () => {
    const { book } = bankily();
    expect(addMoneyAccount(book, { name: "بنكيلي", icon: "", currencyCode: "MRU", openingBalance: 0, openingDate: "2026-10-01" }).ok).toBe(false);
    expect(addMoneyAccount(book, { name: "B2", icon: "", currencyCode: "MRU", method: "bankily", openingBalance: 0, openingDate: "2026-10-01" }).ok).toBe(false);
    expect(addMoneyAccount(book, { name: " ", icon: "", currencyCode: "MRU", openingBalance: 0, openingDate: "2026-10-01" }).ok).toBe(false);
  });

  it("balance = opening + customers' payments by its method since then + my records on it", () => {
    const { book, account } = bankily();
    const ledger: LedgerByAccount = {
      a1: [payment("p-old", 999, "2026-09-30", "bankily"), payment("p1", 3000, "2026-10-02", "bankily"), payment("p2", 700, "2026-10-02", "cash")],
    };
    const flows = [...devicePaymentFlows(ledger, account), { accountId: account.id, currencyCode: "MRU", date: "2026-10-03", amount: -500 }];
    expect(accountBalance(book, account, flows)).toEqual({ MRU: 12500 });
  });

  it("«تصحيح الرصيد» records the difference, so the balance matches the real app", () => {
    const { book, account } = bankily();
    const fixed = correctBalance(book, account, [], 9200, "2026-10-04");
    if (!fixed.ok) throw new Error();
    expect(fixed.book.adjustments[0]).toMatchObject({ amount: -800, accountId: account.id });
    expect(accountBalance(fixed.book, account, [])).toEqual({ MRU: 9200 });
    expect(deleteMoneyAccount(fixed.book, account.id)).toEqual(EMPTY_ACCOUNTS_BOOK);
  });

  it("الصندوق in hand leaves out customers' payments that went into a linked bank", () => {
    const { book } = bankily();
    const ledger: LedgerByAccount = { a1: [payment("p1", 3000, "2026-10-02", "bankily"), payment("p2", 700, "2026-10-02", "cash")] };
    const cash = [
      { id: "c1", kind: "in", amount: 3000, currencyCode: "MRU", date: "2026-10-02", sourceId: "p1", sourceKind: "device-payment", createdAt: "" },
      { id: "c2", kind: "in", amount: 700, currencyCode: "MRU", date: "2026-10-02", sourceId: "p2", sourceKind: "device-payment", createdAt: "" },
      { id: "c3", kind: "out", amount: 100, currencyCode: "MRU", date: "2026-10-02", createdAt: "" },
    ] as CashEntryList;
    expect(cashInHandEntries(cash, ledger, book).map((c) => c.id)).toEqual(["c2", "c3"]);
    expect(cashInHandEntries(cash, ledger, EMPTY_ACCOUNTS_BOOK)).toHaveLength(3);
  });
});
