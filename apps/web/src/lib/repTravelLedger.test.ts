import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { LedgerEntry } from "./ledgerStore";
import { createRepLedger, EMPTY_REP_LEDGER_BOOK, normalizeRepLedgerBook, repLedgerBalance, repTravelLedgerOf, type RepLedgerBook } from "./repLedgers";
import { syncRepTravelLedgers, travelLedgerKeys } from "./repTravelLedger";
import { applyTravelFee } from "./travelRegistration";

const now = new Date("2026-10-19T10:00:00.000Z");
let n = 0;
const id = () => `id-${++n}`;
const VERIFIED = { travelRegistrationVerifiedAt: "2026-10-10T08:00:00.000Z", travelRegistrationVerifiedDue: "2026-10-12" };
const dev = (devId: string, extra: Partial<StarlinkAccountSummary> = {}) => ({ id: devId, name: `جهاز ${devId}`, representativeId: "r1", ...VERIFIED, ...extra }) as StarlinkAccountSummary;

function travelBook(): RepLedgerBook {
  const made = createRepLedger(EMPTY_REP_LEDGER_BOOK, { repId: "r1", name: "توثيق الأجهزة", kind: "travel", currencies: ["SIFA"], opening: { direction: "credit", amount: 89000, date: "2026-10-01" } }, now);
  if (!made.ok) throw new Error(made.message);
  return made.book;
}

/** The device's debt as handleTravelPrice posts it. */
function priced(account: StarlinkAccountSummary, entries: LedgerEntry[] = []) {
  return applyTravelFee(entries, account, "2026-10-15", now, id).entries;
}

describe("🛂 a rep's «توثيق الأجهزة» account", () => {
  it("a priced device's debt moves from the device into the account, named by the device", () => {
    const a = dev("a", { travelRegistrationPrice: { amount: 5000, currency: "SIFA", repId: "r1" } });
    const book = travelBook();
    const ledgerId = repTravelLedgerOf(book, "r1")!.id;
    const out = syncRepTravelLedgers([a], { a: priced(a) }, book, [], "2026-10-19", now, id);
    expect(out.changed).toBe(true);
    expect(out.ledger.a).toEqual([]);
    const line = out.book.entries.find((e) => e.travelFor)!;
    expect(line).toMatchObject({ ledgerId, direction: "debit", amount: 5000, currencyCode: "SIFA", date: "2026-10-15", note: "جهاز a", travelFor: "a|2026-10-12" });
    expect(repLedgerBalance(out.book, ledgerId, "SIFA")).toBe(84000);
    expect(travelLedgerKeys(out.book).has("a|2026-10-12")).toBe(true);
    // Run again: nothing more to do.
    expect(syncRepTravelLedgers([a], out.ledger, out.book, [], "2026-10-19", now, id).changed).toBe(false);
  });

  it("follows the price: changed, then removed", () => {
    const a = dev("a", { travelRegistrationPrice: { amount: 5000, currency: "SIFA", repId: "r1" } });
    const first = syncRepTravelLedgers([a], { a: priced(a) }, travelBook(), [], "2026-10-19", now, id);
    const ledgerId = repTravelLedgerOf(first.book, "r1")!.id;
    const changed = dev("a", { travelRegistrationPrice: { amount: 7000, currency: "MRU", repId: "r1" } });
    const second = syncRepTravelLedgers([changed], first.ledger, first.book, [], "2026-10-19", now, id);
    expect(second.book.entries.filter((e) => e.travelFor)).toHaveLength(1);
    expect(repLedgerBalance(second.book, ledgerId, "MRU")).toBe(-7000);
    expect(second.book.ledgers[0]!.currencies).toEqual(["SIFA", "MRU"]);
    const removed = syncRepTravelLedgers([dev("a", { travelRegistrationPrice: null })], second.ledger, second.book, [], "2026-10-19", now, id);
    expect(removed.book.entries.filter((e) => e.travelFor)).toEqual([]);
  });

  it("leaves my own devices, other reps without such an account, and a debt already paid", () => {
    const mine = dev("m", { representativeId: undefined, travelRegistrationPrice: { amount: 3000, currency: "SIFA" } });
    const other = dev("o", { representativeId: "r2", travelRegistrationPrice: { amount: 3000, currency: "SIFA", repId: "r2" } });
    const paid = dev("p", { travelRegistrationPrice: { amount: 4000, currency: "SIFA", repId: "r1" } });
    const paidEntries = priced(paid);
    const ledger = { m: priced(mine), o: priced(other), p: paidEntries };
    const allocations = [{ id: "al", paymentEntryId: "pay", shipmentEntryId: paidEntries[0]!.id, amount: 4000, currency: "SIFA" as const, createdAt: "x" }];
    const out = syncRepTravelLedgers([mine, other, paid], ledger, travelBook(), allocations, "2026-10-19", now, id);
    expect(out.changed).toBe(false);
    expect(out.ledger).toBe(ledger);
    expect(out.book.entries.filter((e) => e.travelFor)).toEqual([]);
  });

  it("the account he already named «توثيق الأجهزه» becomes the rep's travel account (one per rep)", () => {
    const book = normalizeRepLedgerBook({
      ledgers: [
        { id: "l1", repId: "r1", name: "توثيق الأجهزه", kind: "free", currencies: ["SIFA"], createdAt: "1" },
        { id: "l2", repId: "r1", name: "توثيق 2", kind: "free", currencies: ["SIFA"], createdAt: "2" },
        { id: "l3", repId: "r1", name: "MRO", kind: "free", currencies: ["MRU"], createdAt: "3" },
      ],
      entries: [],
    });
    expect(book.ledgers.map((l) => l.kind)).toEqual(["travel", "free", "free"]);
    expect(createRepLedger(book, { repId: "r1", name: "آخر", kind: "travel", currencies: ["SIFA"] }).ok).toBe(false);
  });
});
