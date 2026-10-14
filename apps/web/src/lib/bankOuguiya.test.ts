import { describe, expect, it } from "vitest";
import { EMPTY_BANK_INBOX, ingestBankNotices, noticeDay, suggestionNote, type BankInbox, type BankSuggestion, type RawBankNotice } from "./bankNotices";
import { applyOuguiyaFix, needsOuguiyaFix, type MoneyStores } from "./bankOuguiya";
import { EMPTY_ACCOUNTS_BOOK } from "./moneyAccounts";

// Fake names and numbers only.
const OWN = ["22227268"];
const AT = new Date(2026, 9, 10, 11, 36).getTime();
const DAY = noticeDay(AT);

const raw = (id: string, app: string, title: string, text: string, at = AT): RawBankNotice => ({ id, app, title, text, at });
const bankilyOut = (id: string, amount: number, at = AT) =>
  raw(id, "bankily", "Transfert d'argent", `Montant : ${amount} MRU\nBeneficiaire : DEMO PERSON,40000001`, at);

const EMPTY_STORES: MoneyStores = {
  expenses: [],
  income: [],
  debts: { debts: [], payments: [] },
  party: [],
  reps: [],
  ledger: {},
  accounts: EMPTY_ACCOUNTS_BOOK,
  cash: [],
};

/** A suggestion as it was saved BEFORE the rule (amount in MRU, no appOuguiya). */
function oldSuggestion(id: string, amount: number, status: BankSuggestion["status"], outcome?: string): BankSuggestion {
  return {
    id,
    kind: "out",
    app: "bankily",
    at: AT,
    amount,
    currencyCode: "MRU",
    party: { name: "DEMO PERSON", number: "40000001" },
    notices: [{ id, app: "bankily", title: "Transfert d'argent", text: "…", at: AT }],
    status,
    ...(outcome ? { outcome } : {}),
  };
}

describe("«100 MRU = 1000 أوقية»: a bank notification becomes the app's أوقية", () => {
  it("Bankily 600 MRU → a 6,000 suggestion, marked as already converted", () => {
    const { inbox } = ingestBankNotices(EMPTY_BANK_INBOX, [bankilyOut("n1", 600)], OWN);
    expect(inbox.suggestions[0]).toMatchObject({ amount: 6000, currencyCode: "MRU", appOuguiya: true });
    expect(needsOuguiyaFix(inbox)).toBe(false);
  });

  it("Sedad «أوقية جديدة» too, and a GIMTEL transfer's two halves still meet (both ×10)", () => {
    const sedad = raw("s1", "sedad", "ENVOI", "أرسلتم مبلغ 50.0 أوقية جديدة لصالح 22227268 (BANKILY)", AT - 20_000);
    const bankily = raw("b1", "bankily", "Gimtel envoie de l'argent", "Vous avez reçu 50.0 MRU du bénéficiaire : +22222227268 (SEDAD). ID de transaction : 9999", AT);
    const { inbox } = ingestBankNotices(EMPTY_BANK_INBOX, [sedad, bankily], OWN);
    expect(inbox.suggestions).toHaveLength(1);
    expect(inbox.suggestions[0]).toMatchObject({ kind: "transfer", amount: 500, notices: [{ id: "s1" }, { id: "b1" }] });
  });

  it("another currency is untouched (Nita F CFA → سيفا)", () => {
    const nita = raw("t1", "nita", "Compte à Compte", "DEMO vient de transferer un montant de 5000.0 F CFA vers votre compte");
    const { inbox } = ingestBankNotices(EMPTY_BANK_INBOX, [nita], OWN);
    expect(inbox.suggestions[0]).toMatchObject({ currencyCode: "SIFA", amount: 5000 });
    expect(inbox.suggestions[0]!.appOuguiya).toBeUndefined();
  });
});

describe("the one-time fix of what was read before the rule", () => {
  it("waiting suggestions ×10; a confirmed one's record (found by amount, day and note) ×10; once only", () => {
    const waiting = oldSuggestion("p1", 10, "pending");
    const done = { ...oldSuggestion("d1", 600, "done", "🧾 مصروف: أكل"), at: AT };
    const inbox: BankInbox = { suggestions: [waiting, done], seen: [], txIds: [] };
    const note = suggestionNote(done);
    const stores: MoneyStores = {
      ...EMPTY_STORES,
      expenses: [
        { id: "e1", categoryId: "food", amount: 600, currencyCode: "MRU", date: DAY, note, accountId: "bankily", createdAt: "" } as MoneyStores["expenses"][number],
        // Same amount and day, typed by hand - another note: never touched.
        { id: "e2", categoryId: "food", amount: 600, currencyCode: "MRU", date: DAY, note: "غداء", createdAt: "" } as MoneyStores["expenses"][number],
      ],
    };
    const { inbox: next, stores: fixed, fix } = applyOuguiyaFix(inbox, stores, new Date("2026-10-10T14:00:00Z"));
    expect(next.suggestions.map((s) => s.amount)).toEqual([100, 6000]);
    expect(fixed.expenses.map((e) => e.amount)).toEqual([6000, 600]);
    expect(fix).toMatchObject({ pending: 1, fixed: [{ suggestionId: "d1", store: "expense", recordId: "e1", from: 600, to: 6000 }], unmatched: [] });
    expect(needsOuguiyaFix(next)).toBe(false);
  });

  it("a record he changed (another amount) or two equal candidates: left as they are and counted", () => {
    const done = oldSuggestion("d1", 600, "done", "💵 دخل");
    const twin = oldSuggestion("d2", 300, "done", "💵 دخل");
    const note = suggestionNote(done);
    const income = (id: string, amount: number, n: string) => ({ id, categoryId: "c", amount, currencyCode: "MRU", date: DAY, note: n, createdAt: "" }) as MoneyStores["income"][number];
    const stores: MoneyStores = {
      ...EMPTY_STORES,
      // d1: he typed 6000 himself when confirming → no 600 record → untouched.
      // d2: two identical records → can't tell which → untouched.
      income: [income("i1", 6000, note), income("i2", 300, suggestionNote(twin)), income("i3", 300, suggestionNote(twin))],
    };
    const { stores: fixed, fix } = applyOuguiyaFix({ suggestions: [done, twin], seen: [], txIds: [] }, stores);
    expect(fixed.income.map((e) => e.amount)).toEqual([6000, 300, 300]);
    expect(fix.unmatched).toEqual(["d1", "d2"]);
  });

  it("a customer payment: the entry and its locked dollar value ×10", () => {
    const done = oldSuggestion("d1", 500, "done", "👤 دفعة زبون: جهاز");
    const stores: MoneyStores = {
      ...EMPTY_STORES,
      ledger: {
        dev1: [
          { id: "l1", kind: "credit", amount: 500, currency: "MRU", note: suggestionNote(done), email: "", date: DAY, createdAt: "", paymentRate: { rateFromUsd: 430, usdValue: 500 / 430 } },
        ],
      },
    };
    const { stores: fixed } = applyOuguiyaFix({ suggestions: [done], seen: [], txIds: [] }, stores);
    expect(fixed.ledger.dev1![0]).toMatchObject({ amount: 5000, paymentRate: { rateFromUsd: 430 } });
    expect(fixed.ledger.dev1![0]!.paymentRate!.usdValue).toBeCloseTo(5000 / 430, 5);
  });

  it("a cash deposit (transfer from الكاش): the transfer and its cash entry ×10", () => {
    const done = { ...oldSuggestion("d1", 1180, "done", "💵 إيداع من الكاش في بنكيلي"), kind: "in" as const, cashDeposit: true };
    const note = suggestionNote(done);
    const stores: MoneyStores = {
      ...EMPTY_STORES,
      accounts: { ...EMPTY_ACCOUNTS_BOOK, transfers: [{ id: "t1", fromAccountId: "cash", toAccountId: "bankily", amount: 1180, currencyCode: "MRU", date: DAY, note, createdAt: "" }] },
      cash: [{ id: "c1", kind: "out", amount: 1180, currencyCode: "MRU", date: DAY, note: "", createdAt: "", sourceId: "t1", sourceKind: "account-transfer" } as MoneyStores["cash"][number]],
    };
    const { stores: fixed } = applyOuguiyaFix({ suggestions: [done], seen: [], txIds: [] }, stores);
    expect(fixed.accounts.transfers![0]!.amount).toBe(11800);
    expect(fixed.cash[0]!.amount).toBe(11800);
  });

  it("a debt repayment (no note on it): matched by amount and day, only for a suggestion that became one", () => {
    const done = oldSuggestion("d1", 200, "done", "🤝 سدّدت لـ ديمو");
    const stores: MoneyStores = {
      ...EMPTY_STORES,
      debts: {
        debts: [{ id: "debt1", kind: "borrowed", person: "ديمو", amount: 5000, currencyCode: "MRU", date: "2026-09-01", createdAt: "" } as MoneyStores["debts"]["debts"][number]],
        payments: [{ id: "pay1", debtId: "debt1", amount: 200, date: DAY, createdAt: "" } as MoneyStores["debts"]["payments"][number]],
      },
    };
    const { stores: fixed, fix } = applyOuguiyaFix({ suggestions: [done], seen: [], txIds: [] }, stores);
    expect(fixed.debts.payments[0]!.amount).toBe(2000);
    expect(fixed.debts.debts[0]!.amount).toBe(5000);
    expect(fix.fixed[0]).toMatchObject({ store: "debt-payment", recordId: "pay1" });
  });

  it("nothing from before the rule → nothing to do", () => {
    expect(needsOuguiyaFix(EMPTY_BANK_INBOX)).toBe(false);
    const { inbox } = ingestBankNotices(EMPTY_BANK_INBOX, [bankilyOut("n1", 50)], OWN);
    expect(needsOuguiyaFix(inbox)).toBe(false);
  });
});
