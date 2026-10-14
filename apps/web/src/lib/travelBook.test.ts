import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { LedgerEntry } from "./ledgerStore";
import type { RepresentativeStore } from "./repStore";
import { setRepTravelPercent } from "./repStore";
import {
  buildRepTravelMessage,
  buildTravelBook,
  byCurrencyText,
  lockRepTravelPercent,
  lockTravelPrice,
  matchesTravelGroup,
  repShareOf,
  travelStateOf,
} from "./travelBook";

const VERIFIED = { travelRegistrationVerifiedAt: "2026-10-08T09:00:00.000Z", travelRegistrationVerifiedDue: "October 15" };
const dev = (id: string, extra: Partial<StarlinkAccountSummary> = {}) => ({ id, name: `جهاز ${id}`, ...VERIFIED, ...extra }) as StarlinkAccountSummary;
const reps = {
  r1: { id: "r1", name: "مندوب أ", commissionPercent: 10, travelPercent: 30, createdAt: "x", updatedAt: "x" },
  r2: { id: "r2", name: "مندوب ب", commissionPercent: 10, createdAt: "x", updatedAt: "x" },
} as RepresentativeStore;
const fee = (amount: number, currency = "MRU"): LedgerEntry =>
  ({ id: `t-${amount}`, kind: "debit", amount, currency, note: "", email: "", date: "2026-10-09", createdAt: "x", travelFeeFor: "October 15" }) as LedgerEntry;

describe("🛂 the price locks the rep and his travel percent", () => {
  it("a new price on a rep's device takes his CURRENT travel percent; mine takes none", () => {
    expect(lockTravelPrice(dev("a", { representativeId: "r1" }), { amount: 15000, currency: "MRU" }, reps)).toEqual({ amount: 15000, currency: "MRU", repId: "r1", repPercent: 30 });
    expect(lockTravelPrice(dev("b", { representativeId: "r2" }), { amount: 15000, currency: "MRU" }, reps)).toEqual({ amount: 15000, currency: "MRU", repId: "r2" });
    expect(lockTravelPrice(dev("c"), { amount: 15000, currency: "MRU" }, reps)).toEqual({ amount: 15000, currency: "MRU" });
    expect(lockTravelPrice(dev("c"), null, reps)).toBeNull();
  });

  it("editing a price keeps the lock - even after his percent or the device's rep changed", () => {
    const locked = dev("a", { representativeId: "r2", travelRegistrationPrice: { amount: 15000, currency: "MRU", repId: "r1", repPercent: 30 } });
    expect(lockTravelPrice(locked, { amount: 20000, currency: "MRU" }, setRepTravelPercent(reps, "r1", 50))).toEqual({ amount: 20000, currency: "MRU", repId: "r1", repPercent: 30 });
  });

  it("setting a rep's percent locks it on his priced devices that have none, only those", () => {
    const accounts = [
      dev("a", { representativeId: "r2", travelRegistrationPrice: { amount: 15000, currency: "MRU", repId: "r2" } }),
      dev("b", { representativeId: "r2", travelRegistrationPrice: { amount: 9000, currency: "MRU", repId: "r2", repPercent: 10 } }),
      dev("c", { representativeId: "r2" }),
      dev("d", { travelRegistrationPrice: { amount: 1000, currency: "MRU" } }),
    ];
    expect(lockRepTravelPercent(accounts, "r2", 25)).toEqual([{ id: "a", patch: { travelRegistrationPrice: { amount: 15000, currency: "MRU", repId: "r2", repPercent: 25 } } }]);
    expect(repShareOf({ amount: 15000, currency: "MRU", repId: "r2", repPercent: 25 })).toBe(3750);
    expect(repShareOf({ amount: 15000, currency: "MRU", repId: "r2" })).toBeUndefined();
  });
});

describe("🛂 the six circles", () => {
  const accounts = [
    dev("m1", { travelRegistrationPrice: { amount: 12000, currency: "MRU" } }),
    dev("m2"),
    dev("a1", { representativeId: "r1", travelRegistrationPrice: { amount: 10000, currency: "MRU", repId: "r1", repPercent: 30 } }),
    dev("a2", { representativeId: "r1", travelRegistrationPrice: { amount: 5000, currency: "SIFA", repId: "r1", repPercent: 20 } }),
    dev("b1", { representativeId: "r2", travelRegistrationPrice: { amount: 8000, currency: "MRU", repId: "r2" } }),
    dev("x", { travelRegistrationVerifiedAt: null }),
  ];
  const ledger = { m1: [fee(12000)], a1: [fee(10000)] };
  const allocations = [{ id: "al", paymentEntryId: "p", shipmentEntryId: "t-12000", amount: 12000, currency: "MRU", createdAt: "x" }] as never[];

  it("counts mine, the reps', the unpriced, the unpaid and the ones priced before the debt existed", () => {
    const book = buildTravelBook(accounts, reps, ledger, allocations);
    expect({ all: book.all, mine: book.mine, reps: book.reps, unpriced: book.unpriced, unpaid: book.unpaid, noDebt: book.noDebt }).toEqual({ all: 5, mine: 2, reps: 3, unpriced: 1, unpaid: 1, noDebt: 2 });
  });

  it("splits the money per currency: his share at his locked percent, the rest is mine", () => {
    const book = buildTravelBook(accounts, reps, ledger, allocations);
    expect(book.collected).toEqual({ MRU: 30000, SIFA: 5000 });
    expect(book.repShares).toEqual({ MRU: 3000, SIFA: 1000 });
    // 12,000 mine + 7,000 of a1; b1 has no percent yet → in neither share.
    expect(book.myProfit).toEqual({ MRU: 19000, SIFA: 4000 });
    expect(book.noPercent).toBe(1);
    expect(book.byRep.map((r) => [r.name, r.count, r.percent, r.noPercent])).toEqual([["مندوب أ", 2, 30, 0], ["مندوب ب", 1, undefined, 1]]);
  });

  it("each circle filters its devices", () => {
    const state = (id: string) => travelStateOf(accounts.find((a) => a.id === id)!, ledger, allocations);
    expect(matchesTravelGroup(state("m1"), "mine")).toBe(true);
    expect(matchesTravelGroup(state("a1"), "reps")).toBe(true);
    expect(matchesTravelGroup(state("a1"), "rep:r1")).toBe(true);
    expect(matchesTravelGroup(state("b1"), "rep:r1")).toBe(false);
    expect(matchesTravelGroup(state("m2"), "unpriced")).toBe(true);
    expect(matchesTravelGroup(state("a1"), "unpaid")).toBe(true);
    expect(matchesTravelGroup(state("m1"), "unpaid")).toBe(false);
  });

  it("the rep's statement lists his devices by email, the total and his share", () => {
    const book = buildTravelBook(accounts, reps, ledger, allocations);
    const text = buildRepTravelMessage(book.byRep[0]!, [...accounts, dev("a3", { representativeId: "r1", expectedEmail: "demo@example.com" })]);
    expect(text).toContain("🛂 كشف توثيق السفر - مندوب أ");
    expect(text).toContain("1) جهاز a1 - 10,000 أوقية · نصيبك 3,000 أوقية (30%)");
    expect(text).toContain("3) demo@example.com - بلا سعر بعد");
    expect(text).toContain("المجموع: 10,000 أوقية + 5,000 سيفا");
    expect(text).toContain("نصيبك: 3,000 أوقية + 1,000 سيفا");
    expect(byCurrencyText({})).toBe("0");
  });
});
