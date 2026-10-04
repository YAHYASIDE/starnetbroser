import { describe, expect, it } from "vitest";
import type { CashEntryList } from "./cashStore";
import type { LedgerByAccount, LedgerEntry } from "./ledgerStore";
import {
  accountBalance,
  addAccountTransfer,
  addMoneyAccount,
  deleteAccountTransfer,
  partyFlows,
  cashInHandEntries,
  correctBalance,
  DEFAULT_ACCOUNTS,
  deleteMoneyAccount,
  devicePaymentFlows,
  EMPTY_ACCOUNTS_BOOK,
  seedDefaultAccounts,
  setOpeningBalance,
} from "./moneyAccounts";

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

  it("the ready-made accounts come once, each waiting for its real balance", () => {
    const seeded = seedDefaultAccounts(EMPTY_ACCOUNTS_BOOK, "2026-10-04");
    expect(seeded.accounts.map((a) => a.name)).toEqual(DEFAULT_ACCOUNTS.map((a) => a.name));
    expect(seeded.accounts.every((a) => a.balanceSet === false && a.openingBalance === 0)).toBe(true);
    expect(seeded.accounts.find((a) => a.method === "orange")?.currencyCode).toBe("SIFA");
    // Deleted later: never re-added.
    const emptied = seeded.accounts.reduce((book, a) => deleteMoneyAccount(book, a.id), seeded);
    expect(seedDefaultAccounts(emptied, "2026-10-05").accounts).toEqual([]);
    // An account already there (same method) is not duplicated.
    const { book } = bankily();
    expect(seedDefaultAccounts(book, "2026-10-04").accounts.filter((a) => a.method === "bankily")).toHaveLength(1);
  });

  it("the first real balance becomes the opening, from that day", () => {
    const seeded = seedDefaultAccounts(EMPTY_ACCOUNTS_BOOK, "2026-10-01");
    const id = seeded.accounts[0]!.id;
    const set = setOpeningBalance(seeded, id, 5000, "2026-10-04");
    if (!set.ok) throw new Error();
    const account = set.book.accounts[0]!;
    expect(account).toMatchObject({ openingBalance: 5000, openingDate: "2026-10-04", balanceSet: true });
    expect(accountBalance(set.book, account, [])).toEqual({ MRU: 5000 });
  });

  it("الكاش in hand leaves out customers' payments that went into a linked bank", () => {
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

describe("transfers between my accounts", () => {
  function twoAccounts() {
    const a = bankily();
    const b = addMoneyAccount(a.book, { name: "سداد", icon: "🟣", currencyCode: "MRU", method: "sedad", openingBalance: 500, openingDate: "2026-10-01" });
    if (!b.ok) throw new Error();
    return { book: b.book, bankily: a.account, sedad: b.account };
  }

  it("moves the amount: minus from one, plus to the other, nothing else", () => {
    const { book, bankily: bk, sedad } = twoAccounts();
    const t = addAccountTransfer(book, { fromAccountId: sedad.id, toAccountId: bk.id, amount: 50, currencyCode: "MRU", date: "2026-10-04", note: "GIMTEL" });
    if (!t.ok) throw new Error(t.message);
    expect(accountBalance(t.book, bk, [])).toEqual({ MRU: 10050 });
    expect(accountBalance(t.book, sedad, [])).toEqual({ MRU: 450 });
    const undone = deleteAccountTransfer(t.book, t.transfer.id);
    expect(accountBalance(undone, bk, [])).toEqual({ MRU: 10000 });
  });

  it("refuses the same account twice or no amount", () => {
    const { book, bankily: bk, sedad } = twoAccounts();
    expect(addAccountTransfer(book, { fromAccountId: bk.id, toAccountId: bk.id, amount: 5, currencyCode: "MRU", date: "2026-10-04" }).ok).toBe(false);
    expect(addAccountTransfer(book, { fromAccountId: sedad.id, toAccountId: bk.id, amount: 0, currencyCode: "MRU", date: "2026-10-04" }).ok).toBe(false);
  });
});

describe("partyFlows", () => {
  it("supplier / rep payments made from an account are out, money received is in; others don't move it", () => {
    const flows = partyFlows(
      [
        { accountId: "acc", partyKind: "supplier", direction: "owesUs", amount: 4600, currencyCode: "MRU", date: "2026-10-04" },
        { accountId: "acc", partyKind: "client", direction: "weOwe", amount: 300, currencyCode: "MRU", date: "2026-10-04" },
        { partyKind: "supplier", direction: "owesUs", amount: 999, currencyCode: "MRU", date: "2026-10-04" },
      ],
      [
        { accountId: "acc", kind: "commissionPayout", amount: 100, currencyCode: "MRU", date: "2026-10-04" },
        { accountId: "acc", kind: "cashHandover", amount: 250, currencyCode: "MRU", date: "2026-10-04" },
        { kind: "cashHandover", amount: 999, currencyCode: "MRU", date: "2026-10-04" },
      ],
    );
    expect(flows.map((f) => f.amount)).toEqual([-4600, 300, -100, 250]);
  });
});
