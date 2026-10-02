import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { LedgerEntry } from "./ledgerStore";
import type { CurrencyStore } from "./currencyStore";
import {
  addPaymentCard,
  cardLabel,
  depositLabel,
  expectedStarlinkUsd,
  kastDevicesSnapshot,
  mergeCardDeposits,
  pendingCardDeposits,
  removePaymentCard,
  setDepositStatus,
} from "./kastCards";

// Fake cards and amounts only.
const store = { ARS: { code: "ARS", rateFromUsd: 1458.33 } } as unknown as CurrencyStore;

describe("payment cards", () => {
  it("keeps 4 digits, one entry per card, and a default name", () => {
    const first = addPaymentCard([], { last4: "12 34", name: "" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.list[0]).toMatchObject({ last4: "1234", name: "بطاقة 1234" });
    expect(addPaymentCard(first.list, { last4: "1234", name: "x" })).toEqual({ ok: false, message: "هذه البطاقة مسجلة" });
    expect(addPaymentCard([], { last4: "12", name: "x" }).ok).toBe(false);
    expect(removePaymentCard(first.list, first.list[0]!.id)).toEqual([]);
    expect(cardLabel({ name: "Silver", last4: "1234" })).toBe("Silver •1234");
  });
});

describe("expectedStarlinkUsd", () => {
  it("uses the amount due, converted at the registered rate", () => {
    expect(expectedStarlinkUsd({ balanceDue: "9.99", currency: "USD" }, [], store)).toBe(9.99);
    expect(expectedStarlinkUsd({ balanceDue: "63000.01", currency: "ARS" }, [], store)).toBeCloseTo(43.2, 1);
  });

  it("falls back to the last recorded Starlink cost, and is undefined when nothing is known", () => {
    const entries = [
      { id: "a", date: "2026-08-01", createdAt: "1", starlinkCost: { amount: 40, currencyCode: "USD" } },
      { id: "b", date: "2026-09-01", createdAt: "2", starlinkCost: { amount: 45.74, currencyCode: "USD" } },
    ] as unknown as LedgerEntry[];
    expect(expectedStarlinkUsd({ balanceDue: "0", currency: "USD" }, entries, store)).toBeCloseTo(45.74, 2);
    expect(expectedStarlinkUsd({ balanceDue: "500", currency: "XYZ" }, [], store)).toBeUndefined();
  });

  it("sends the phone only name, expected dollars and card", () => {
    const accounts = [
      { id: "d1", name: "Demo A", balanceDue: "9.99", currency: "USD", paymentCardLast4: "1234" },
      { id: "d2", name: "Demo B", balanceDue: "", currency: "" },
    ] as unknown as StarlinkAccountSummary[];
    expect(kastDevicesSnapshot(accounts, {}, store)).toEqual([{ name: "Demo A", expectedUsd: 9.99, cardLast4: "1234" }]);
  });
});

describe("dollars received", () => {
  it("adds each mail once, lists the pending ones, and records or dismisses them", () => {
    const list = mergeCardDeposits([], [{ id: "m1", amountUsd: 18.3, sender: "demo-sender", at: 2 }, { id: "m0", amountUsd: 5, sender: "", at: 1 }]);
    expect(mergeCardDeposits(list, [{ id: "m1", amountUsd: 18.3, sender: "demo-sender", at: 2 }])).toBe(list);
    expect(pendingCardDeposits(list).map((d) => d.id)).toEqual(["m0", "m1"]);
    expect(pendingCardDeposits(setDepositStatus(list, "m1", "recorded")).map((d) => d.id)).toEqual(["m0"]);
    expect(depositLabel(list[0]!)).toBe("وصل 18.30$ من demo-sender");
    expect(mergeCardDeposits([], [{ id: "m2", amountUsd: 0, sender: "", at: 0 }])).toEqual([]);
  });
});
