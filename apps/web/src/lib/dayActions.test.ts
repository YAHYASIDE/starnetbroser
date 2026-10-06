import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { accountsForDay, accountsOfOwner, dayOwnerGroups, daySummary, repDayMessages } from "./dayActions";
import type { RepresentativeStore } from "./repStore";

function device(id: string, rechargeDate: string, extra: Partial<StarlinkAccountSummary> = {}): StarlinkAccountSummary {
  return { id, name: id, rechargeDate, serviceStatus: "active", ...extra } as StarlinkAccountSummary;
}

const reps: RepresentativeStore = {
  r1: { id: "r1", name: "أحمد", phone: "22200000", commissionPercent: 5 },
  r2: { id: "r2", name: "سالم", commissionPercent: 5 },
} as unknown as RepresentativeStore;

const accounts = [
  device("a", "2026/10/04", { representativeId: "r1", expectedEmail: "a@example.com" }),
  device("b", "2026/11/04", { representativeId: "r1", starlinkAccountEmail: "b@example.com" }),
  device("c", "2026/10/04", { representativeId: "r2" }),
  device("d", "2026/10/04"),
  device("e", "2026/10/05", { representativeId: "r1" }),
];

describe("accountsForDay", () => {
  it("matches the day of the month, whatever the month", () => {
    expect(accountsForDay(accounts, 4).map((a) => a.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("repDayMessages", () => {
  it("one message per rep with each device's name and email, most devices first", () => {
    const { messages, withoutRep } = repDayMessages(accountsForDay(accounts, 4), 4, reps);
    expect(withoutRep).toBe(1);
    expect(messages.map((m) => [m.repName, m.count])).toEqual([["أحمد", 2], ["سالم", 1]]);
    expect(messages[0]!.text).toBe("📅 أجهزتك يوم 4 (2):\n• a — a@example.com\n• b — b@example.com");
    expect(messages[1]!.text).toContain("• c — بلا إيميل");
    expect(messages[0]!.phone).toBe("22200000");
  });

  it("a rep deleted meanwhile counts as no rep", () => {
    const { messages, withoutRep } = repDayMessages([device("x", "2026/10/04", { representativeId: "gone" })], 4, reps);
    expect(messages).toEqual([]);
    expect(withoutRep).toBe(1);
  });
});

describe("daySummary", () => {
  it("counts and sums the monthly prices per currency, never mixing them", () => {
    const list = [
      device("p1", "2026/10/04", { renewalPlan: { saleAmount: 1500, saleCurrency: "MRU", costAmount: 30, costCurrency: "USD" } }),
      device("p2", "2026/10/04", { serviceStatus: "suspended", renewalPlan: { saleAmount: 40, saleCurrency: "USD", costAmount: 35000, costCurrency: "ARS" } }),
      device("p3", "2026/10/04", { renewalPlan: { saleAmount: 1000, saleCurrency: "MRU", costAmount: 25, costCurrency: "USD" } }),
      device("p4", "2026/10/04", { deviceFault: { at: "2026-09-01" } as never }),
    ];
    expect(daySummary(list)).toEqual({
      count: 4,
      stopped: 1,
      faulty: 1,
      salesByCurrency: { MRU: 2500, USD: 40 },
      costByCurrency: { USD: 55, ARS: 35000 },
      withoutPrice: 1,
    });
  });
});

describe("👥 a day's run: mine or one rep's", () => {
  const reps = { r1: { id: "r1", name: "مندوب أ" }, r2: { id: "r2", name: "مندوب ب" } } as unknown as RepresentativeStore;
  const dev = (id: string, representativeId?: string) => ({ id, name: id, representativeId }) as StarlinkAccountSummary;
  const day = [dev("m1"), dev("a1", "r1"), dev("a2", "r1"), dev("b1", "r2"), dev("m2")];

  it("offers all, mine, then each rep (most first)", () => {
    expect(dayOwnerGroups(day, reps)).toEqual([
      { key: "all", label: "الكل", count: 5 },
      { key: "mine", label: "🏠 أجهزتي", count: 2 },
      { key: "r1", label: "📱 مندوب أ", count: 2 },
      { key: "r2", label: "📱 مندوب ب", count: 1 },
    ]);
  });

  it("one group only (all mine, or the rep's own app): nothing to choose", () => {
    expect(dayOwnerGroups([dev("m1")], reps)).toEqual([{ key: "mine", label: "🏠 أجهزتي", count: 1 }]);
    expect(dayOwnerGroups([dev("a1", "r1"), dev("a2", "r1")], reps)).toEqual([{ key: "r1", label: "📱 مندوب أ", count: 2 }]);
  });

  it("filters the devices of the chosen group", () => {
    expect(accountsOfOwner(day, "mine").map((a) => a.id)).toEqual(["m1", "m2"]);
    expect(accountsOfOwner(day, "r1").map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(accountsOfOwner(day, "all")).toHaveLength(5);
  });
});
