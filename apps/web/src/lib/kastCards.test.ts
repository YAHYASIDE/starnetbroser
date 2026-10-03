import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { LedgerEntry } from "./ledgerStore";
import type { CurrencyStore } from "./currencyStore";
import {
  addPaymentCard,
  cardLabel,
  depositLabel,
  expectedStarlinkUsd,
  pendingCardSpends,
  debtUsdToday,
  spendCandidates,
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

describe("Starlink payments from the KAST notification", () => {
  it("are kept apart from dollars received and suggest the open D with the closest cost", () => {
    const list = mergeCardDeposits([], [
      { id: "n1", kind: "spent", amountUsd: 116.56, sender: "", merchant: "Starlink", cardLast4: "1234", at: 5 },
      { id: "m1", amountUsd: 18.3, sender: "demo-sender", at: 2 },
    ]);
    expect(pendingCardSpends(list).map((d) => d.id)).toEqual(["n1"]);
    expect(pendingCardDeposits(list).map((d) => d.id)).toEqual(["m1"]);
    expect(depositLabel(list[0]!)).toBe("دُفع 116.56$ لـ Starlink بالبطاقة 1234");
    const usdD = (id: string, costUsd: number) => ({ id, costUsd, entry: { starlinkCost: { currencyCode: "USD", amount: costUsd } } });
    const debts = [usdD("a", 50), usdD("b", 116.56), usdD("c", 115), usdD("d", 130)];
    expect(spendCandidates(116.56, debts).map((c) => [c.debt.id, c.exact])).toEqual([["b", true], ["c", true]]);
    expect(spendCandidates(9.99, debts)).toEqual([]);
  });

  it("matches a peso D at today's rate, and offers the nearest when none is close", () => {
    // 112,000 ARS recorded at 1300 (86.15$); today 1465 → 76.45$ - KAST paid 76.46$.
    const ars = { id: "ar", costUsd: 86.15, entry: { starlinkCost: { currencyCode: "ARS", amount: 112000 } } };
    const usd = { id: "us", costUsd: 60, entry: { starlinkCost: { currencyCode: "USD", amount: 60 } } };
    const store = { ARS: { code: "ARS", name: "ARS", symbol: "ARS", rateFromUsd: 1465, updatedAt: "", enabled: true } };
    const [first] = spendCandidates(76.46, [usd, ars], store);
    expect(first).toMatchObject({ debt: { id: "ar" }, exact: true });
    expect(first!.usd).toBeCloseTo(76.45, 2);
    expect(debtUsdToday(ars, store)).toBeCloseTo(76.45, 2);
    expect(debtUsdToday(usd, store)).toBeUndefined();
    // Without today's rate it isn't close enough - offered only as the nearest (60$ is too far).
    expect(spendCandidates(76.46, [usd, ars]).map((c) => [c.debt.id, c.exact])).toEqual([["ar", false]]);
  });

  it("looks at the paying card's devices first, never at a device on another card", () => {
    const d = (id: string, costUsd: number, card?: string) => ({ id, card, costUsd, entry: { starlinkCost: { currencyCode: "USD", amount: costUsd } } });
    const debts = [d("same", 50, "1234"), d("other", 45.74, "5678"), d("unknown", 45.74)];
    const of = (x: { card?: string }) => x.card;
    // Card 1234's only D is far from 45.74 → its devices offer nothing, the unknown-card one is tried.
    expect(spendCandidates(45.74, debts, {}, { last4: "1234", of }).map((c) => c.debt.id)).toEqual(["unknown"]);
    // Card 5678 → its own device, exactly; the unknown-card twin isn't offered.
    expect(spendCandidates(45.74, debts, {}, { last4: "5678", of }).map((c) => [c.debt.id, c.exact])).toEqual([["other", true]]);
    // Card 1234 paying 50 → only its device, even though the others are close too.
    expect(spendCandidates(49.5, debts, {}, { last4: "1234", of }).map((c) => c.debt.id)).toEqual(["same"]);
  });
});
