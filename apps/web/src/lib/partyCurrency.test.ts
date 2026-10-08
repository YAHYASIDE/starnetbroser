import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import type { LedgerCurrency, LedgerEntry } from "./ledgerStore";
import type { RepresentativeStore } from "./repStore";
import {
  autoCurrencyOf,
  currencyMismatches,
  currencyWarning,
  dominantCurrency,
  expectedCurrencyFor,
  isCurrencyMismatch,
  mismatchedEntryIds,
  mismatchLine,
  partyOf,
  type PartyCurrencyContext,
} from "./partyCurrency";

const T = "2026-10-01T00:00:00.000Z";

function device(id: string, extra: Partial<StarlinkAccountSummary> = {}): StarlinkAccountSummary {
  return { id, name: `جهاز ${id}`, ...extra } as StarlinkAccountSummary;
}

function entry(id: string, currency: LedgerCurrency, amount: number, extra: Partial<LedgerEntry> = {}): LedgerEntry {
  return { id, kind: "debit", amount, currency, note: "", email: "", date: "2026-10-01", createdAt: T, ...extra };
}

const reps: RepresentativeStore = {
  r1: { id: "r1", name: "مندوب أ", commissionPercent: 10, createdAt: T, updatedAt: T },
};
const clients: ClientStore = {
  c1: { id: "c1", name: "زبون أ", createdAt: T, updatedAt: T },
  c2: { id: "c2", name: "زبون ب", createdAt: T, updatedAt: T, repSegments: [{ repId: "r1", from: T, carry: false }] },
};

function ctx(over: Partial<PartyCurrencyContext> = {}): PartyCurrencyContext {
  return {
    accounts: [device("a1", { representativeId: "r1" }), device("a2", { representativeId: "r1" }), device("a3", { clientId: "c1" })],
    clients,
    reps,
    ledger: {
      a1: [entry("e1", "SIFA", 10000), entry("e2", "SIFA", 10000), entry("e3", "MRU", 6000, { date: "2026-10-05" })],
      a2: [entry("e4", "SIFA", 8000)],
      a3: [entry("e5", "MRU", 3000), entry("e6", "USD", 30, { kind: "credit" })],
    },
    ...over,
  };
}

describe("partyOf", () => {
  it("is the device's rep, then the customer's current rep, then the customer", () => {
    expect(partyOf({ representativeId: "r1", clientId: "c1" }, clients, reps)?.kind).toBe("rep");
    expect(partyOf({ clientId: "c2" }, clients, reps)).toMatchObject({ kind: "rep", id: "r1" });
    expect(partyOf({ clientId: "c1" }, clients, reps)).toMatchObject({ kind: "client", id: "c1" });
    expect(partyOf({}, clients, reps)).toBeUndefined();
  });

  it("on the rep's own phone is always the customer", () => {
    expect(partyOf({ representativeId: "r1", clientId: "c1" }, clients, reps, true)).toMatchObject({ kind: "client", id: "c1" });
  });
});

describe("dominantCurrency", () => {
  it("is the currency with the most votes, none on a tie", () => {
    expect(dominantCurrency(["SIFA", "SIFA", "MRU"])).toBe("SIFA");
    expect(dominantCurrency(["SIFA", "MRU"])).toBeUndefined();
    expect(dominantCurrency([])).toBeUndefined();
  });
});

describe("expectedCurrencyFor", () => {
  it("is automatic from most of the party's shipments across his devices", () => {
    expect(expectedCurrencyFor({ representativeId: "r1" }, ctx())).toMatchObject({ currency: "SIFA", auto: true, name: "مندوب أ" });
    expect(autoCurrencyOf("rep", "r1", ctx())).toBe("SIFA");
  });

  it("the chosen currency wins over the automatic one", () => {
    const c = ctx({ reps: { r1: { ...reps.r1!, defaultCurrency: "MRU" } } });
    expect(expectedCurrencyFor({ representativeId: "r1" }, c)).toMatchObject({ currency: "MRU", auto: false });
  });

  it("monthly prices vote too", () => {
    const c = ctx({ accounts: [device("a9", { clientId: "c1", renewalPlan: { saleAmount: 5, saleCurrency: "USD", costAmount: 1, costCurrency: "USD" } })], ledger: {} });
    expect(expectedCurrencyFor({ clientId: "c1" }, c)?.currency).toBe("USD");
  });
});

describe("warnings", () => {
  it("flags a different ledger currency only", () => {
    const expected = expectedCurrencyFor({ representativeId: "r1" }, ctx());
    expect(isCurrencyMismatch(expected, "MRU")).toBe(true);
    expect(isCurrencyMismatch(expected, "SIFA")).toBe(false);
    expect(isCurrencyMismatch(undefined, "MRU")).toBe(false);
    expect(currencyWarning(expected!, "MRU", 6000)).toBe("⚠️ المندوب «مندوب أ» يتعامل بالسيفا، وأنت تسجّل 6,000 أوقية");
    expect(currencyWarning(expected!, "USD")).toBe("⚠️ المندوب «مندوب أ» يتعامل بالسيفا، وأنت تسجّل بالدولار");
  });

  it("lists past operations in another currency, newest first, minus the confirmed ones", () => {
    const list = currencyMismatches(ctx());
    expect(list.map((m) => m.entry?.id)).toEqual(["e3", "e6"]);
    expect(mismatchLine(list[0]!)).toEqual({ label: "جهاز a1", detail: "شحنة 6,000 أوقية · 2026-10-05 - المندوب «مندوب أ» يتعامل بالسيفا" });
    expect(mismatchLine(list[1]!).detail).toContain("دفعة 30 دولار");
    const confirmed = ctx();
    confirmed.ledger.a1![2] = { ...confirmed.ledger.a1![2]!, currencyConfirmed: true };
    expect([...mismatchedEntryIds(confirmed)]).toEqual(["e6"]);
  });

  it("flags a monthly price in another currency, unless confirmed", () => {
    const plan = { saleAmount: 6000, saleCurrency: "MRU", costAmount: 1, costCurrency: "USD" };
    const c = ctx({ accounts: [...ctx().accounts, device("a4", { representativeId: "r1", renewalPlan: plan })] });
    expect(currencyMismatches(c).some((m) => m.accountId === "a4" && !m.entry)).toBe(true);
    const ok = ctx({ accounts: [...ctx().accounts, device("a4", { representativeId: "r1", renewalPlan: { ...plan, currencyConfirmed: true } })] });
    expect(currencyMismatches(ok).some((m) => m.accountId === "a4")).toBe(false);
  });

  it("skips archived and deleted devices", () => {
    const c = ctx({ accounts: [device("a1", { representativeId: "r1", archivedAt: T }), device("a2", { representativeId: "r1" })] });
    expect(currencyMismatches(c).some((m) => m.accountId === "a1")).toBe(false);
  });
});
