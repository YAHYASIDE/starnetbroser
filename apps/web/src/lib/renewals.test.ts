import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "./ledgerStore";
import { isRenewalEntry, openDsBefore, openDsNow, renewalIds } from "./renewals";

const d = (id: string, date: string, cost: LedgerEntry["starlinkCost"], o: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id,
  kind: "debit",
  amount: 4000,
  currency: "MRU",
  note: "",
  email: "",
  date,
  createdAt: `${date}T10:00:00Z`,
  starlinkCost: cost,
  ...o,
});
const pending = { status: "pending" as const, currencyCode: "USD", amount: 60 };
const paid = (on: string, at?: string) => ({ status: "settled" as const, currencyCode: "USD", amount: 60, paidAt: on, ...(at ? { settledAt: at } : {}) });

describe("isRenewalEntry - a new D after the previous one was paid", () => {
  it("the device's first D, then a new D after paying it: two renewals", () => {
    const first = d("r1", "2026-09-01", paid("2026-09-30", "2026-09-30T08:00:00Z"));
    const second = d("r2", "2026-09-30", pending);
    const entries = [first, second];
    expect(isRenewalEntry(first, entries)).toBe(true);
    expect(isRenewalEntry(second, entries)).toBe(true);
  });

  it("a D added while the previous D is still unpaid is more on the same month - not a renewal", () => {
    const open = d("r1", "2026-09-01", pending);
    const extra = d("r2", "2026-09-10", pending);
    expect(isRenewalEntry(extra, [open, extra])).toBe(false);
    expect(openDsBefore(extra, [open, extra]).map((e) => e.id)).toEqual(["r1"]);
  });

  it("the previous D paid only AFTER the new one was added: the new one wasn't a renewal then", () => {
    const old = d("r1", "2026-09-01", paid("2026-09-20", "2026-09-20T09:00:00Z"));
    const next = d("r2", "2026-09-10", pending);
    expect(isRenewalEntry(next, [old, next])).toBe(false);
  });

  it("paid the same day without a time: paying came first (his usual: pay the D, add the new one)", () => {
    const old = d("r1", "2026-09-01", paid("2026-09-30"));
    const next = d("r2", "2026-09-30", pending);
    expect(isRenewalEntry(next, [old, next])).toBe(true);
  });

  it("his answer when saving wins over the rule", () => {
    const open = d("r1", "2026-09-01", pending);
    const said = d("r2", "2026-09-10", pending, { renewal: true });
    const notIt = d("r3", "2026-10-01", pending, { renewal: false });
    expect(isRenewalEntry(said, [open, said])).toBe(true);
    expect(isRenewalEntry(notIt, [notIt])).toBe(false);
  });

  it("a travel fee, an earlier owner's debt or a payment is never a renewal; an old record without cost counts as before", () => {
    const travel = d("t", "2026-09-01", undefined, { travelFeeFor: "Oct 15" });
    const previous = d("p", "2026-09-01", paid("2026-09-01"), { previousDebtId: "pd" });
    const payment = d("c", "2026-09-01", undefined, { kind: "credit" });
    const legacy = d("l", "2026-09-01", undefined);
    expect([travel, previous, payment].map((e) => isRenewalEntry(e, [e]))).toEqual([false, false, false]);
    expect(isRenewalEntry(legacy, [legacy])).toBe(true);
  });

  it("renewalIds over the whole ledger; openDsNow lists what is unpaid today", () => {
    const ledger = { a: [d("r1", "2026-09-01", pending), d("r2", "2026-09-10", pending)], b: [d("r3", "2026-09-05", pending)] };
    expect([...renewalIds(ledger)].sort()).toEqual(["r1", "r3"]);
    expect(openDsNow(ledger.a).map((e) => e.id)).toEqual(["r1", "r2"]);
  });
});
