import { describe, expect, it } from "vitest";
import {
  addEntry,
  computeBalanceByCurrency,
  createLedgerEntry,
  getAccountEntries,
  isIncompletePaymentRateEntry,
  isLegacyShipmentEntry,
  lastUsedCostCurrency,
  LedgerEntry,
  removeEntry,
  sortEntriesNewestFirst,
  totalOwedAcrossAccounts,
  updateEntry,
  withAccountEntries,
} from "./ledgerStore";

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "e1",
    kind: "debit",
    amount: 10,
    currency: "USD",
    note: "",
    email: "",
    date: "2026-09-20",
    createdAt: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("computeBalanceByCurrency", () => {
  it("is empty for no entries", () => {
    expect(computeBalanceByCurrency([])).toEqual({});
  });

  it("sums debits as positive (customer owes) within one currency", () => {
    expect(
      computeBalanceByCurrency([entry({ kind: "debit", amount: 10 }), entry({ kind: "debit", amount: 5 })]),
    ).toEqual({ USD: 15 });
  });

  it("subtracts credits (payments reduce what's owed)", () => {
    expect(
      computeBalanceByCurrency([entry({ kind: "debit", amount: 20 }), entry({ kind: "credit", amount: 8 })]),
    ).toEqual({ USD: 12 });
  });

  it("goes negative once credits exceed debits (customer is in credit)", () => {
    expect(
      computeBalanceByCurrency([entry({ kind: "debit", amount: 5 }), entry({ kind: "credit", amount: 20 })]),
    ).toEqual({ USD: -15 });
  });

  it("keeps different currencies fully separate, never summed together", () => {
    const balances = computeBalanceByCurrency([
      entry({ kind: "debit", amount: 45000, currency: "MRU" }),
      entry({ kind: "credit", amount: 20, currency: "USD" }),
    ]);
    expect(balances).toEqual({ MRU: 45000, USD: -20 });
  });
});

describe("addEntry / removeEntry", () => {
  it("addEntry appends without mutating the input array", () => {
    const original = [entry({ id: "a" })];
    const result = addEntry(original, entry({ id: "b" }));
    expect(original).toHaveLength(1);
    expect(result.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("removeEntry removes only the matching id, without mutating the input", () => {
    const original = [entry({ id: "a" }), entry({ id: "b" }), entry({ id: "c" })];
    const result = removeEntry(original, "b");
    expect(original).toHaveLength(3);
    expect(result.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("removeEntry on an unknown id is a safe no-op", () => {
    const original = [entry({ id: "a" })];
    expect(removeEntry(original, "does-not-exist")).toEqual(original);
  });
});

describe("updateEntry", () => {
  it("merges the patch into the matching entry only, without mutating the input", () => {
    const original = [entry({ id: "a" }), entry({ id: "b" })];
    const result = updateEntry(original, "b", { starlinkCost: { status: "settled", currencyCode: "USD", amount: 5 } });
    expect(original[1].starlinkCost).toBeUndefined();
    expect(result[0]).toEqual(original[0]);
    expect(result[1].starlinkCost).toEqual({ status: "settled", currencyCode: "USD", amount: 5 });
  });

  it("is a safe no-op for an unknown id", () => {
    const original = [entry({ id: "a" })];
    expect(updateEntry(original, "does-not-exist", { note: "x" })).toEqual(original);
  });
});

describe("sortEntriesNewestFirst", () => {
  it("orders by date descending", () => {
    const entries = [
      entry({ id: "old", date: "2026-09-01" }),
      entry({ id: "new", date: "2026-09-20" }),
      entry({ id: "mid", date: "2026-09-10" }),
    ];
    expect(sortEntriesNewestFirst(entries).map((e) => e.id)).toEqual(["new", "mid", "old"]);
  });

  it("breaks same-day ties by createdAt descending", () => {
    const entries = [
      entry({ id: "first", date: "2026-09-20", createdAt: "2026-09-20T08:00:00.000Z" }),
      entry({ id: "second", date: "2026-09-20", createdAt: "2026-09-20T14:00:00.000Z" }),
    ];
    expect(sortEntriesNewestFirst(entries).map((e) => e.id)).toEqual(["second", "first"]);
  });

  it("does not mutate the input array", () => {
    const entries = [entry({ id: "a", date: "2026-09-01" }), entry({ id: "b", date: "2026-09-20" })];
    sortEntriesNewestFirst(entries);
    expect(entries.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("getAccountEntries / withAccountEntries", () => {
  it("returns an empty array for an account with no entries yet", () => {
    expect(getAccountEntries({}, "acc-1")).toEqual([]);
  });

  it("withAccountEntries sets that account's entries without touching other accounts", () => {
    const store = { "acc-1": [entry({ id: "a" })] };
    const updated = withAccountEntries(store, "acc-2", [entry({ id: "b" })]);
    expect(getAccountEntries(updated, "acc-1")).toEqual(store["acc-1"]);
    expect(getAccountEntries(updated, "acc-2").map((e) => e.id)).toEqual(["b"]);
  });
});

describe("createLedgerEntry", () => {
  it("trims the note/email and stores a positive amount as given", () => {
    const created = createLedgerEntry({
      kind: "credit",
      amount: 25,
      currency: "MRU",
      note: "  دفعة نقدية  ",
      email: "  customer@example.com  ",
      paymentMethod: "bankily",
      date: "2026-09-21",
    });
    expect(created.kind).toBe("credit");
    expect(created.amount).toBe(25);
    expect(created.currency).toBe("MRU");
    expect(created.note).toBe("دفعة نقدية");
    expect(created.email).toBe("customer@example.com");
    expect(created.paymentMethod).toBe("bankily");
    expect(created.date).toBe("2026-09-21");
    expect(created.id).toBeTruthy();
  });

  it("drops paymentMethod for a debit entry even if one was passed", () => {
    const created = createLedgerEntry({
      kind: "debit",
      amount: 10,
      currency: "USD",
      note: "",
      email: "",
      paymentMethod: "nita",
      date: "2026-09-21",
    });
    expect(created.paymentMethod).toBeUndefined();
  });

  it("gives two calls distinct ids", () => {
    const base = { kind: "debit" as const, amount: 1, currency: "USD" as const, note: "", email: "", date: "2026-09-21" };
    const a = createLedgerEntry(base);
    const b = createLedgerEntry(base);
    expect(a.id).not.toBe(b.id);
  });
});

describe("totalOwedAcrossAccounts", () => {
  it("sums only the positive balances per currency, ignoring accounts in credit", () => {
    const store = {
      "acc-1": [entry({ kind: "debit", amount: 30, currency: "USD" })],
      "acc-2": [entry({ kind: "credit", amount: 50, currency: "USD" })],
      "acc-3": [
        entry({ kind: "debit", amount: 10, currency: "USD" }),
        entry({ kind: "debit", amount: 5, currency: "USD" }),
      ],
    };
    expect(totalOwedAcrossAccounts(store)).toEqual({ USD: 45 });
  });

  it("keeps totals for different currencies separate", () => {
    const store = {
      "acc-1": [entry({ kind: "debit", amount: 45000, currency: "MRU" })],
      "acc-2": [entry({ kind: "debit", amount: 20, currency: "SIFA" })],
    };
    expect(totalOwedAcrossAccounts(store)).toEqual({ MRU: 45000, SIFA: 20 });
  });

  it("is empty when every account is settled or in credit", () => {
    const store = { "acc-1": [entry({ kind: "credit", amount: 5 })] };
    expect(totalOwedAcrossAccounts(store)).toEqual({});
  });

  it("is empty for an empty store", () => {
    expect(totalOwedAcrossAccounts({})).toEqual({});
  });
});

describe("createLedgerEntry - saleRate / starlinkCost (D mark)", () => {
  it("stores a given saleRate snapshot on a debit entry", () => {
    const created = createLedgerEntry({
      kind: "debit",
      amount: 45000,
      currency: "MRU",
      note: "",
      email: "",
      date: "2026-09-21",
      saleRate: { rateFromUsd: 400, usdValue: 112.5 },
    });
    expect(created.saleRate).toEqual({ rateFromUsd: 400, usdValue: 112.5 });
  });

  it("drops saleRate for a credit entry even if one was passed", () => {
    const created = createLedgerEntry({
      kind: "credit",
      amount: 10,
      currency: "USD",
      note: "",
      email: "",
      date: "2026-09-21",
      saleRate: { rateFromUsd: 400, usdValue: 0.025 },
    });
    expect(created.saleRate).toBeUndefined();
  });

  it("stores a pending starlinkCost (D marked) with its amount/currency/rate already captured", () => {
    const created = createLedgerEntry({
      kind: "debit",
      amount: 45000,
      currency: "MRU",
      note: "",
      email: "",
      date: "2026-09-21",
      starlinkCost: { status: "pending", currencyCode: "ARS", amount: 92971.87, rate: { rateFromUsd: 1100, usdValue: 84.52 } },
    });
    expect(created.starlinkCost).toEqual({
      status: "pending",
      currencyCode: "ARS",
      amount: 92971.87,
      rate: { rateFromUsd: 1100, usdValue: 84.52 },
    });
  });

  it("leaves starlinkCost unset when none was passed", () => {
    const created = createLedgerEntry({
      kind: "debit",
      amount: 45000,
      currency: "MRU",
      note: "",
      email: "",
      date: "2026-09-21",
    });
    expect(created.starlinkCost).toBeUndefined();
  });

  it("ignores starlinkCost for a credit entry", () => {
    const created = createLedgerEntry({
      kind: "credit",
      amount: 10,
      currency: "USD",
      note: "",
      email: "",
      date: "2026-09-21",
      starlinkCost: { status: "pending" },
    });
    expect(created.starlinkCost).toBeUndefined();
  });

  it("stores profitCurrencyRates only when starlinkCost is already settled", () => {
    const settled = createLedgerEntry({
      kind: "debit",
      amount: 45000,
      currency: "MRU",
      note: "",
      email: "",
      date: "2026-09-21",
      starlinkCost: { status: "settled", currencyCode: "USD", amount: 100, paidAt: "2026-09-21" },
      profitCurrencyRates: { MRU: 400, SIFA: 560 },
    });
    expect(settled.profitCurrencyRates).toEqual({ MRU: 400, SIFA: 560 });

    const pending = createLedgerEntry({
      kind: "debit",
      amount: 45000,
      currency: "MRU",
      note: "",
      email: "",
      date: "2026-09-21",
      starlinkCost: { status: "pending", currencyCode: "USD", amount: 100 },
      profitCurrencyRates: { MRU: 400, SIFA: 560 },
    });
    expect(pending.profitCurrencyRates).toBeUndefined();
  });

  it("stores a given paymentRate snapshot on a credit entry", () => {
    const created = createLedgerEntry({
      kind: "credit",
      amount: 20000,
      currency: "MRU",
      note: "",
      email: "",
      date: "2026-09-21",
      paymentRate: { rateFromUsd: 400, usdValue: 50 },
    });
    expect(created.paymentRate).toEqual({ rateFromUsd: 400, usdValue: 50 });
  });

  it("drops paymentRate for a debit entry even if one was passed", () => {
    const created = createLedgerEntry({
      kind: "debit",
      amount: 45000,
      currency: "MRU",
      note: "",
      email: "",
      date: "2026-09-21",
      paymentRate: { rateFromUsd: 400, usdValue: 112.5 },
    });
    expect(created.paymentRate).toBeUndefined();
  });
});

describe("isLegacyShipmentEntry", () => {
  it("is true for a debit entry with no starlinkCost info at all", () => {
    expect(isLegacyShipmentEntry(entry({ kind: "debit" }))).toBe(true);
  });

  it("is false for a debit entry marked D (pending)", () => {
    expect(isLegacyShipmentEntry(entry({ kind: "debit", starlinkCost: { status: "pending" } }))).toBe(false);
  });

  it("is false for a debit entry with a settled starlinkCost", () => {
    expect(
      isLegacyShipmentEntry(
        entry({
          kind: "debit",
          starlinkCost: { status: "settled", currencyCode: "USD", amount: 100, paidAt: "2026-09-21" },
        }),
      ),
    ).toBe(false);
  });

  it("is false for a credit entry regardless of starlinkCost", () => {
    expect(isLegacyShipmentEntry(entry({ kind: "credit" }))).toBe(false);
  });
});

describe("isIncompletePaymentRateEntry", () => {
  it("is true for a non-USD credit entry with no paymentRate", () => {
    expect(isIncompletePaymentRateEntry(entry({ kind: "credit", currency: "MRU" }))).toBe(true);
  });

  it("is false once the entry has a paymentRate", () => {
    expect(
      isIncompletePaymentRateEntry(
        entry({ kind: "credit", currency: "MRU", paymentRate: { rateFromUsd: 400, usdValue: 50 } }),
      ),
    ).toBe(false);
  });

  it("is false for a USD credit entry - it never needs a rate", () => {
    expect(isIncompletePaymentRateEntry(entry({ kind: "credit", currency: "USD" }))).toBe(false);
  });

  it("is false for a debit entry regardless of currency/paymentRate", () => {
    expect(isIncompletePaymentRateEntry(entry({ kind: "debit", currency: "MRU" }))).toBe(false);
  });
});

describe("lastUsedCostCurrency", () => {
  it("is undefined with no entries", () => {
    expect(lastUsedCostCurrency([])).toBeUndefined();
  });

  it("is undefined when no debit entry has a settled starlinkCost", () => {
    const entries = [
      entry({ kind: "debit", starlinkCost: { status: "pending" } }),
      entry({ id: "e2", kind: "credit" }),
    ];
    expect(lastUsedCostCurrency(entries)).toBeUndefined();
  });

  it("returns the currency of a single settled cost", () => {
    const entries = [
      entry({ kind: "debit", starlinkCost: { status: "settled", currencyCode: "USD", amount: 100, paidAt: "2026-09-01" } }),
    ];
    expect(lastUsedCostCurrency(entries)).toBe("USD");
  });

  it("picks the currency of the MOST RECENT settlement by paidAt, not entry order", () => {
    const entries = [
      entry({
        id: "e1",
        kind: "debit",
        starlinkCost: { status: "settled", currencyCode: "USD", amount: 100, paidAt: "2026-09-01" },
      }),
      entry({
        id: "e2",
        kind: "debit",
        starlinkCost: { status: "settled", currencyCode: "MRU", amount: 40000, paidAt: "2026-09-20" },
      }),
    ];
    expect(lastUsedCostCurrency(entries)).toBe("MRU");
    // Order reversed - result must still follow paidAt, not array position.
    expect(lastUsedCostCurrency([...entries].reverse())).toBe("MRU");
  });

  it("ignores a settled cost with no currencyCode (defensive - shouldn't normally happen)", () => {
    const entries = [entry({ kind: "debit", starlinkCost: { status: "settled", amount: 100, paidAt: "2026-09-01" } })];
    expect(lastUsedCostCurrency(entries)).toBeUndefined();
  });

  it("on a same-day tie (paidAt has no time component), the later entry in the array wins", () => {
    const entries = [
      entry({
        id: "e1",
        kind: "debit",
        starlinkCost: { status: "settled", currencyCode: "USD", amount: 100, paidAt: "2026-09-22" },
      }),
      entry({
        id: "e2",
        kind: "debit",
        starlinkCost: { status: "settled", currencyCode: "MRU", amount: 8000, paidAt: "2026-09-22" },
      }),
    ];
    expect(lastUsedCostCurrency(entries)).toBe("MRU");
  });
});

describe("balance/sort logic is unaffected by the new optional saleRate/starlinkCost fields", () => {
  it("computeBalanceByCurrency ignores saleRate/starlinkCost entirely", () => {
    const withExtras = entry({
      kind: "debit",
      amount: 45000,
      currency: "MRU",
      saleRate: { rateFromUsd: 400, usdValue: 112.5 },
      starlinkCost: { status: "pending" },
    });
    expect(computeBalanceByCurrency([withExtras])).toEqual({ MRU: 45000 });
  });

  it("a legacy entry object with neither field (as if parsed from old localStorage JSON) still works", () => {
    const legacy = entry({ kind: "debit", amount: 10, currency: "USD" });
    // Simulate what JSON.parse of a pre-existing record would produce - no saleRate/starlinkCost keys at all.
    delete (legacy as Partial<LedgerEntry>).saleRate;
    delete (legacy as Partial<LedgerEntry>).starlinkCost;
    expect(computeBalanceByCurrency([legacy])).toEqual({ USD: 10 });
    expect(sortEntriesNewestFirst([legacy])).toEqual([legacy]);
    expect(isLegacyShipmentEntry(legacy)).toBe(true);
  });
});
