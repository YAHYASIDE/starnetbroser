import { describe, expect, it } from "vitest";
import { applyLedgerPaymentsToCash, computeCashBalanceByCurrency, postPartyAdjustmentToCash, postRepSettlementToCash, recordCashEntry, type CashEntryList } from "./cashStore";
import type { LedgerEntry } from "./ledgerStore";
import { accountBalance, addAccountTransfer, cashInHandEntries, CASH_ACCOUNT_ID, devicePaymentFlows, partyFlows, transferCashEntry, type AccountsBook, type MoneyAccount } from "./moneyAccounts";
import { personalFlows, EMPTY_DEBT_BOOK } from "./myMoney";
import type { PartyAdjustment } from "./partyBalanceStore";
import type { RepSettlement } from "./repStore";
import { cardMovementFlows, type CardTopUp } from "./starlinkDebt";
import {
  buildMovements,
  buildPlaceStatement,
  CARD_PLACE,
  CASH_PLACE,
  collectedPart,
  collectionSeries,
  moneyPlaces,
  NO_PLACE,
  placeBalance,
  summarizeByKind,
  type MovementInput,
} from "./moneyMovements";

const T = "2026-10-09";
const rates = { USD: 1, MRU: 40, SIFA: 600 };

const debit = (o: Partial<LedgerEntry>): LedgerEntry => ({ id: "d", kind: "debit", amount: 4000, currency: "MRU", note: "", email: "", date: T, createdAt: `${T}T08:00:00Z`, ...o });
const credit = (o: Partial<LedgerEntry>): LedgerEntry => ({ id: "c", kind: "credit", amount: 1000, currency: "MRU", note: "", email: "", date: T, createdAt: `${T}T09:00:00Z`, ...o });

const bankily: MoneyAccount = { id: "acc-b", name: "بنكيلي", icon: "🟢", currencyCode: "MRU", method: "bankily", openingBalance: 5000, openingDate: "2026-10-01", createdAt: "" };
const sedad: MoneyAccount = { id: "acc-s", name: "سداد", icon: "🟣", currencyCode: "MRU", method: "sedad", openingBalance: 0, openingDate: "2026-10-01", createdAt: "", balanceSet: false };

function base(o: Partial<MovementInput> = {}): MovementInput {
  return {
    ledger: {},
    invoices: [],
    adjustments: [],
    settlements: [],
    cash: [],
    book: { accounts: [bankily, sedad], adjustments: [] },
    cardTopUps: [],
    incomes: [],
    expenses: [],
    debts: EMPTY_DEBT_BOOK,
    ...o,
  };
}

/** Same posting the app does when a device payment is saved (applyLedgerPaymentsToCash). */
function withCashPosting(ledger: Record<string, LedgerEntry[]>, cash: CashEntryList = []): CashEntryList {
  let out = cash;
  for (const entries of Object.values(ledger)) out = applyLedgerPaymentsToCash(out, [], entries, "جهاز");
  return out;
}

describe("collectedPart - a payment pays a debt first, the rest is an advance", () => {
  it("splits on the customer's whole account, in date order", () => {
    const ledger = {
      a1: [debit({ id: "r1", amount: 4000, date: "2026-10-01" }), credit({ id: "p1", amount: 3000, date: "2026-10-02" }), credit({ id: "p2", amount: 2500, date: "2026-10-03" })],
      a2: [debit({ id: "r2", amount: 1000, date: "2026-10-04" })],
    };
    const parts = collectedPart({ ledger, invoices: [], adjustments: [], clientOf: () => "c1" });
    expect(parts.get("p1")).toBe(3000);
    expect(parts.get("p2")).toBe(1000); // 1,000 still owed, 1,500 is an advance
  });
  it("a payment with nothing owed is all advance; another currency is its own balance", () => {
    const ledger = { a1: [debit({ id: "r1", amount: 100, currency: "USD" }), credit({ id: "p1", amount: 2000, currency: "MRU" })] };
    expect(collectedPart({ ledger, invoices: [], adjustments: [] }).get("p1")).toBe(0);
  });
});

describe("buildMovements - each record classified once, in its real place", () => {
  it("1+2: a renewal paid in full by cash = one collection in الكاش; a partial payment lowers the debt by its part only", () => {
    const ledger = { a1: [debit({ id: "r1", amount: 4000 }), credit({ id: "p1", amount: 4000, paymentMethod: "cash" })], a2: [debit({ id: "r2", amount: 4000 }), credit({ id: "p2", amount: 1500, paymentMethod: "cash" })] };
    const cash = withCashPosting(ledger);
    const moves = buildMovements(base({ ledger, cash }));
    const cashMoves = moves.filter((m) => m.place === CASH_PLACE);
    expect(cashMoves).toHaveLength(2);
    expect(cashMoves.every((m) => m.kind === "collection")).toBe(true);
    expect(cashMoves.map((m) => m.amount).sort()).toEqual([1500, 4000]);
    // Recorded twice? Rebuilding (a page refresh) gives the same ids - nothing new is created.
    expect(buildMovements(base({ ledger, cash })).map((m) => m.id)).toEqual(moves.map((m) => m.id));
  });

  it("a payment by بنكيلي lands in بنكيلي (not الكاش) - same as «حسابي»", () => {
    const ledger = { a1: [debit({ id: "r1", amount: 4000 }), credit({ id: "p1", amount: 4000, paymentMethod: "bankily" })] };
    const cash = withCashPosting(ledger);
    const moves = buildMovements(base({ ledger, cash }));
    expect(moves.filter((m) => m.place === CASH_PLACE)).toHaveLength(0);
    expect(moves.find((m) => m.place === bankily.id)).toMatchObject({ kind: "collection", amount: 4000, method: "bankily" });
  });

  it("5: collecting an old debt is a collection - never revenue (no sale-paid)", () => {
    const ledger = { a1: [debit({ id: "r1", amount: 6000, date: "2026-08-01" }), credit({ id: "p1", amount: 6000, date: T, paymentMethod: "cash" })] };
    const moves = buildMovements(base({ ledger, cash: withCashPosting(ledger) }));
    expect(moves.map((m) => m.kind)).toEqual(["collection"]);
    const summary = summarizeByKind(moves, { from: T, to: T }, rates);
    expect(summary.rows.find((r) => r.kind === "sale-paid")).toBeUndefined();
  });

  it("6: cash → بنكيلي is one transfer: الكاش down, بنكيلي up, money in of the business unchanged", () => {
    const made = addAccountTransfer({ accounts: [bankily], adjustments: [] }, { fromAccountId: CASH_ACCOUNT_ID, toAccountId: bankily.id, amount: 2000, currencyCode: "MRU", date: T });
    if (!made.ok) throw new Error(made.message);
    const posted = recordCashEntry([], transferCashEntry(made.transfer, bankily.name)!);
    if (!posted.ok) throw new Error(posted.message);
    const moves = buildMovements(base({ cash: posted.entries, book: made.book }));
    expect(moves.map((m) => [m.place, m.kind, m.direction])).toEqual(expect.arrayContaining([[CASH_PLACE, "transfer", "out"], [bankily.id, "transfer", "in"]]));
    const summary = summarizeByKind(moves, { from: T, to: T }, rates);
    expect(summary.collectedMru).toBe(0);
    expect(summary.rows).toEqual([expect.objectContaining({ kind: "transfer", count: 1, inMru: 0, outMru: 2000 })]);
  });

  it("7: a personal expense is a personal withdrawal, not an operating expense", () => {
    const posted = recordCashEntry([], { kind: "out", amount: 700, currencyCode: "MRU", date: T, category: "مصروف شخصي", sourceId: "pe1", sourceKind: "personal-expense" });
    const manual = recordCashEntry(posted.ok ? posted.entries : [], { kind: "out", amount: 300, currencyCode: "MRU", date: T, category: "نقل" });
    const moves = buildMovements(base({ cash: manual.ok ? manual.entries : [] }));
    expect(moves.map((m) => m.kind).sort()).toEqual(["expense", "owner-out"]);
  });

  it("supplier, rep and client balance entries keep their meaning", () => {
    const adjustments: PartyAdjustment[] = [
      { id: "sp", partyKind: "supplier", partyId: "s1", direction: "owesUs", amount: 900, currencyCode: "MRU", date: T, cashMoved: true, createdAt: "" },
      { id: "cl", partyKind: "client", partyId: "c1", direction: "weOwe", amount: 700, currencyCode: "MRU", date: T, accountId: bankily.id, paymentMethod: "bankily", createdAt: "" },
    ];
    const settlements: RepSettlement[] = [
      { id: "h", representativeId: "r1", kind: "cashHandover", amount: 250, currencyCode: "MRU", date: T, createdAt: "" },
      { id: "o", representativeId: "r1", kind: "commissionPayout", amount: 100, currencyCode: "MRU", date: T, createdAt: "" },
    ];
    let cash: CashEntryList = postPartyAdjustmentToCash([], adjustments[0]!, "مورد");
    for (const s of settlements) cash = postRepSettlementToCash(cash, s, "مندوب");
    const moves = buildMovements(base({ adjustments, settlements, cash }));
    const kinds = Object.fromEntries(moves.map((m) => [m.ref.id, m.kind]));
    expect(kinds).toEqual({ sp: "supplier-pay", cl: "advance", h: "collection", o: "rep-payout" });
  });

  it("a payment recorded before الكاش existed is counted in collections but in no place", () => {
    const ledger = { a1: [debit({ id: "r1" }), credit({ id: "p1", amount: 4000 })] };
    const moves = buildMovements(base({ ledger }));
    expect(moves).toEqual([expect.objectContaining({ place: NO_PLACE, kind: "collection" })]);
  });

  it("the card: top-up from الكاش is a transfer, Starlink's cost from the card is a supplier payment", () => {
    const topUp: CardTopUp = { id: "t1", amountUsd: 100, paidAmount: 4000, paidCurrency: "MRU", date: T, createdAt: "" };
    const cash = recordCashEntry([], { kind: "out", amount: 4000, currencyCode: "MRU", date: T, sourceId: "t1", sourceKind: "card-topup" });
    const ledger = { a1: [debit({ id: "r1", amount: 120, currency: "USD", starlinkCost: { status: "settled", currencyCode: "USD", amount: 60, paidAt: T, paidVia: "card" } })] };
    const moves = buildMovements(base({ ledger, cash: cash.ok ? cash.entries : [], cardTopUps: [topUp] }));
    const card = moves.filter((m) => m.place === CARD_PLACE);
    expect(card.map((m) => [m.kind, m.direction, m.amount]).sort()).toEqual([["supplier-pay", "out", 60], ["transfer", "in", 100]]);
    expect(placeBalance(moneyPlaces({ accounts: [], adjustments: [] }).find((p) => p.id === CARD_PLACE)!, moves, T)).toEqual({ USD: 40 });
  });
});

describe("place statements equal «حسابي»'s balances", () => {
  const ledger = {
    a1: [debit({ id: "r1", amount: 4000, date: "2026-10-02" }), credit({ id: "p1", amount: 3000, paymentMethod: "bankily", date: "2026-10-03" }), credit({ id: "p2", amount: 500, paymentMethod: "cash", date: "2026-10-05" })],
    a2: [debit({ id: "r2", amount: 2000, date: "2026-09-20" }), credit({ id: "p3", amount: 2000, paymentMethod: "sedad", date: "2026-10-06" })],
  };
  const adjustments: PartyAdjustment[] = [{ id: "sp", partyKind: "supplier", partyId: "s1", direction: "owesUs", amount: 800, currencyCode: "MRU", date: "2026-10-07", accountId: bankily.id, createdAt: "" }];
  const made = addAccountTransfer({ accounts: [bankily, sedad], adjustments: [{ id: "fix", accountId: bankily.id, amount: -100, date: "2026-10-08", createdAt: "" }] }, { fromAccountId: bankily.id, toAccountId: CASH_ACCOUNT_ID, amount: 1000, currencyCode: "MRU", date: "2026-10-08" });
  if (!made.ok) throw new Error("transfer");
  const book: AccountsBook = made.book;
  let cash = withCashPosting(ledger);
  const posted = recordCashEntry(cash, transferCashEntry(made.transfer, bankily.name)!);
  cash = posted.ok ? posted.entries : cash;
  const expense = recordCashEntry(cash, { kind: "out", amount: 200, currencyCode: "MRU", date: "2026-10-08", category: "نقل" });
  cash = expense.ok ? expense.entries : cash;
  const topUps: CardTopUp[] = [{ id: "t1", amountUsd: 50, paidAmount: 2000, paidCurrency: "MRU", date: "2026-10-04", createdAt: "", via: "account", accountId: bankily.id }];
  const input = base({ ledger, adjustments, cash, book, cardTopUps: topUps });
  const moves = buildMovements(input);
  const places = moneyPlaces(book);

  it("بنكيلي: opening 5,000 + 3,000 − 800 − 1,000 − 2,000 − 100 = 4,100 (= accountBalance)", () => {
    const flows = [...devicePaymentFlows(ledger, bankily, book.accounts), ...personalFlows([], [], EMPTY_DEBT_BOOK), ...partyFlows(adjustments, []), ...cardMovementFlows(topUps)];
    const expected = accountBalance(book, bankily, flows);
    expect(expected).toEqual({ MRU: 4100 });
    expect(placeBalance(places.find((p) => p.id === bankily.id)!, moves, "2026-12-31")).toEqual(expected);
    const st = buildPlaceStatement(places.find((p) => p.id === bankily.id)!, moves, { from: "2026-10-01", to: T }, { from: "2026-09-01", to: "2026-09-09" });
    expect(st.byCurrency.MRU).toMatchObject({ opening: 5000, received: 3000, paid: 800, transfersIn: 0, transfersOut: 3000, corrections: -100, closing: 4100 });
  });

  it("الكاش: same as the till in hand (cashInHandEntries)", () => {
    const expected = computeCashBalanceByCurrency(cashInHandEntries(cash, ledger, book));
    expect(placeBalance(places.find((p) => p.id === CASH_PLACE)!, moves, "2026-12-31")).toEqual(expected);
    expect(expected).toEqual({ MRU: 1300 }); // 500 + 1,000 − 200
  });

  it("an account whose balance was never typed shows the period's movement only, no invented opening", () => {
    const st = buildPlaceStatement(places.find((p) => p.id === sedad.id)!, moves, { from: "2026-10-01", to: T }, { from: "2026-09-01", to: "2026-09-09" });
    expect(st.byCurrency.MRU).toMatchObject({ opening: undefined, closing: undefined, received: 2000, net: 2000 });
    expect(st.note).toContain("لم يُكتب");
  });

  it("an opening typed after the period started is not claimed for the period's start", () => {
    const st = buildPlaceStatement(places.find((p) => p.id === bankily.id)!, moves, { from: "2026-09-25", to: T }, { from: "2026-09-01", to: "2026-09-09" });
    expect(st.byCurrency.MRU!.opening).toBeUndefined();
    expect(st.note).toContain("2026-10-01");
  });

  it("collections by day leave transfers out", () => {
    const series = collectionSeries(moves, { from: "2026-10-01", to: T }, rates);
    expect(series.unit).toBe("day");
    expect(series.buckets).toHaveLength(9);
    expect(series.buckets.reduce((s, b) => s + b.mru, 0)).toBe(5500); // 3,000 + 500 + 2,000
  });
});
