import { describe, expect, it } from "vitest";
import { keepCurrency } from "./repAccount";
import {
  addRepLedgerEntry,
  createRepLedger,
  deleteRepLedger,
  deleteRepLedgerEntry,
  EMPTY_REP_LEDGER_BOOK,
  renameRepLedger,
  repLedgerBalance,
  repLedgerLines,
  repLedgersOf,
  repLedgerTotals,
  repLedgerZeroEntry,
  hasBotEntry,
  repLedgerCashEntry,
  repLedgerFlows,
  repLedgerSummaries,
  type RepLedgerBook,
} from "./repLedgers";
import { ledgerDepositPlace } from "./repLedgerDeposit";
import { buildRepDailyStatement, computeRepCommissionOwedByCurrency, type RepSettlement } from "./repStore";
import { repWallets } from "./repWallets";

const now = new Date("2026-10-12T10:00:00.000Z");

function made(book: RepLedgerBook, name: string, extra: Partial<Parameters<typeof createRepLedger>[1]> = {}) {
  const r = createRepLedger(book, { repId: "r1", name, kind: "trust", currencyCode: "SIFA", ...extra }, now);
  if (!r.ok) throw new Error(r.message);
  return r;
}

describe("📒 a rep's named accounts (his Oct 12 2026 ask - like his old ledger app)", () => {
  it("a free name, one currency, an opening balance from the old app", () => {
    const { book, ledger } = made(EMPTY_REP_LEDGER_BOOK, "  تنزيل   دبو ", { opening: { direction: "debit", amount: 882558, date: "2026-10-01" } });
    expect(ledger).toMatchObject({ name: "تنزيل دبو", kind: "trust", currencyCode: "SIFA" });
    expect(repLedgerBalance(book, ledger.id)).toBe(-882558);
    expect(repLedgerLines(book, ledger.id)[0]!.entry).toMatchObject({ opening: true, note: "رصيد افتتاحي" });
  });

  it("no two accounts with the same name for one rep (spaces / case ignored); another rep may", () => {
    const { book } = made(EMPTY_REP_LEDGER_BOOK, "اورانج");
    const again = createRepLedger(book, { repId: "r1", name: "اورانج ", kind: "free", currencyCode: "SIFA" }, now);
    expect(again.ok).toBe(false);
    expect(createRepLedger(book, { repId: "r2", name: "اورانج", kind: "free", currencyCode: "SIFA" }, now).ok).toBe(true);
    expect(createRepLedger(book, { repId: "r1", name: "  ", kind: "free", currencyCode: "SIFA" }, now).ok).toBe(false);
  });

  it("له / عليه entries, the balance after each, newest first", () => {
    let { book, ledger } = made(EMPTY_REP_LEDGER_BOOK, "شهر 10", { currencyCode: "MRU" });
    for (const [direction, amount, date] of [["debit", 100000, "2026-10-02"], ["credit", 30000, "2026-10-05"], ["debit", 5000, "2026-10-03"]] as const) {
      const r = addRepLedgerEntry(book, ledger.id, { direction, amount, date }, now);
      if (!r.ok) throw new Error(r.message);
      book = r.book;
    }
    const lines = repLedgerLines(book, ledger.id);
    expect(lines.map((l) => [l.entry.date, l.amount, l.after])).toEqual([
      ["2026-10-05", 30000, -75000],
      ["2026-10-03", -5000, -105000],
      ["2026-10-02", -100000, -100000],
    ]);
    expect(repLedgerBalance(book, ledger.id)).toBe(-75000);
    expect(addRepLedgerEntry(book, ledger.id, { direction: "credit", amount: 0, date: "2026-10-05" }).ok).toBe(false);
    expect(addRepLedgerEntry(book, ledger.id, { direction: "credit", amount: 5, date: "bad" }).ok).toBe(false);
    // ✏️ rename keeps everything; 🗑️ an entry / the account goes with its entries
    const renamed = renameRepLedger(book, ledger.id, "شهر 10 - مكتمل");
    expect(renamed.ok && repLedgerBalance(renamed.book, ledger.id)).toBe(-75000);
    expect(repLedgerBalance(deleteRepLedgerEntry(book, lines[0]!.entry.id), ledger.id)).toBe(-105000);
    expect(deleteRepLedger(book, ledger.id)).toEqual({ ledgers: [], entries: [] });
  });

  it("🧹 zero = the له / عليه of its balance", () => {
    expect(repLedgerZeroEntry(-75000)).toEqual({ direction: "credit", amount: 75000 });
    expect(repLedgerZeroEntry(6652.456)).toEqual({ direction: "debit", amount: 6652.46 });
    expect(repLedgerZeroEntry(0)).toBeNull();
  });

  it("totals per currency for «حسابي» (+ = له) - never converted, other reps apart", () => {
    let { book } = made(EMPTY_REP_LEDGER_BOOK, "اورانج", { opening: { direction: "credit", amount: 6652, date: "2026-10-01" } });
    book = made(book, "شهر 10", { currencyCode: "MRU", opening: { direction: "debit", amount: 207025.65, date: "2026-10-01" } }).book;
    book = made(book, "تنزيل دبو", { opening: { direction: "debit", amount: 1000, date: "2026-10-01" } }).book;
    book = createRepLedger(book, { repId: "r2", name: "غيره", kind: "loan", currencyCode: "SIFA", opening: { direction: "debit", amount: 9, date: "2026-10-01" } }, now).ok
      ? (createRepLedger(book, { repId: "r2", name: "غيره", kind: "loan", currencyCode: "SIFA", opening: { direction: "debit", amount: 9, date: "2026-10-01" } }, now) as { book: RepLedgerBook }).book
      : book;
    expect(repLedgerTotals(book, "r1")).toEqual({ SIFA: 5652, MRU: -207025.65 });
    expect(repLedgersOf(book, "r1").map((l) => l.name)).toEqual(["اورانج", "شهر 10", "تنزيل دبو"]);
  });

  it("🔒 the council's test: a named account never touches his profit, his normal accounts or what he owes for devices", () => {
    // his normal account: a 50,000 سيفا renewal on his customer's device + a 20,000 handover
    const settlements: RepSettlement[] = [{ id: "h", representativeId: "r1", kind: "cashHandover", amount: 20000, currencyCode: "SIFA", date: "2026-10-10", createdAt: "2026-10-10T10:00:00.000Z", rates: { SIFA: 600 } }];
    const op = { entryId: "o1", accountId: "a1", date: "2026-10-05", at: "2026-10-05T10:00:00.000Z", amount: 50000, currency: "SIFA", byRep: false };
    const before = repWallets(buildRepDailyStatement("r1", [], [], settlements, [op]), keepCurrency);
    // a big trust account on the side
    const { book, ledger } = made(EMPTY_REP_LEDGER_BOOK, "أمانة", { opening: { direction: "credit", amount: 999999, date: "2026-10-01" } });
    expect(repLedgerBalance(book, ledger.id)).toBe(999999);
    // nothing the rep calculations read has changed: they never see the ledger store
    const after = repWallets(buildRepDailyStatement("r1", [], [], settlements, [op]), keepCurrency);
    expect(after.money.map((w) => w.balance)).toEqual(before.money.map((w) => w.balance));
    expect(after.profit.balance).toEqual(before.profit.balance);
    expect(computeRepCommissionOwedByCurrency("r1", [], settlements)).toEqual({});
  });
});

describe("🤖 a deposit from the money bot into a named account (step 2)", () => {
  const accounts = [
    { id: "orange", name: "أورانج", icon: "🟠", currencyCode: "SIFA", method: "orange" as const, openingBalance: 0, openingDate: "2026-10-01", createdAt: "" },
    { id: "bankily", name: "بنكيلي", icon: "🟢", currencyCode: "MRU", method: "bankily" as const, openingBalance: 0, openingDate: "2026-10-01", createdAt: "" },
  ];

  it("the money lands where it arrived: the method's app, or الكاش", () => {
    expect(ledgerDepositPlace("orange", "SIFA", accounts)).toBe("orange");
    expect(ledgerDepositPlace("cash", "SIFA", accounts)).toBe("cash");
    expect(ledgerDepositPlace(undefined, "MRU", accounts)).toBe("cash");
    // an app in another currency, no cash wallet: الكاش
    expect(ledgerDepositPlace("bankily", "SIFA", accounts)).toBe("cash");
  });

  it("an app deposit raises that app (a flow), a cash one is a linked الكاش entry; the bot id counts once", () => {
    let { book, ledger } = made(EMPTY_REP_LEDGER_BOOK, "تنزيل دبو");
    const app = addRepLedgerEntry(book, ledger.id, { direction: "credit", amount: 10000, date: "2026-10-12", placeId: "orange", botId: "b-1" }, now);
    if (!app.ok) throw new Error(app.message);
    const cash = addRepLedgerEntry(app.book, ledger.id, { direction: "credit", amount: 2000, date: "2026-10-12", placeId: "cash", botId: "b-2" }, now);
    if (!cash.ok) throw new Error(cash.message);
    book = cash.book;
    expect(repLedgerFlows(book)).toEqual([{ accountId: "orange", currencyCode: "SIFA", date: "2026-10-12", amount: 10000 }]);
    expect(repLedgerCashEntry(app.entry, ledger, "مندوب")).toBeNull();
    expect(repLedgerCashEntry(cash.entry, ledger, "مندوب")).toMatchObject({ kind: "in", amount: 2000, currencyCode: "SIFA", sourceId: cash.entry.id, sourceKind: "rep-ledger" });
    expect(hasBotEntry(book, "b-1")).toBe(true);
    expect(hasBotEntry(book, "b-9")).toBe(false);
    expect(hasBotEntry(book, undefined)).toBe(false);
    expect(repLedgerBalance(book, ledger.id)).toBe(12000);
    expect(repLedgerSummaries(book, "r1")).toEqual([{ id: ledger.id, name: "تنزيل دبو", icon: "🔒", currencyCode: "SIFA", balance: 12000 }]);
  });
});
