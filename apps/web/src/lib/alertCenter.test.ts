import { describe, expect, it } from "vitest";
import { acknowledgeAlert, buildCenterAlerts, DEFAULT_ALERT_RULES, markAlertReviewed, reconcileAlertStates, type AlertInput } from "./alertCenter";
import type { DebtorRow } from "./financeDebts";
import type { RenewalRow } from "./financeStarlink";
import type { LedgerEntry } from "./ledgerStore";

const T = "2026-10-09";
const base = (o: Partial<AlertInput> = {}): AlertInput => ({
  today: T,
  monthNetMru: 10000,
  lastMonthNetMru: 10000,
  monthExpensesMru: 1000,
  lastMonthExpensesMru: 1000,
  monthNewDebtMru: 0,
  monthCollectedMru: 0,
  salesLast30Mru: 50000,
  goals: [],
  renewals: [],
  debtors: [],
  totalDebtsMru: 0,
  credits: [],
  starlinkOwed: [],
  upcomingStarlinkUsd: 0,
  upcomingCount: 0,
  ledger: {},
  allocations: [],
  rates: { USD: 1, MRU: 40 },
  usedCurrencies: ["MRU", "USD"],
  deviceName: () => "جهاز",
  ...o,
});
const renewal = (o: Partial<RenewalRow>): RenewalRow => ({ entryId: "r", accountId: "a1", device: "جهاز 1", date: T, currency: "MRU", sale: 4000, saleMru: 4000, paid: 0, unpaid: 4000, costState: "settled", costMru: 2400, marginMru: 1600, marginPct: 40, complete: true, approx: false, renewal: true, ...o });
const debtor = (o: Partial<DebtorRow>): DebtorRow => ({ key: "client-c1-MRU", kind: "client", id: "c1", name: "زبون أ", currency: "MRU", total: 5000, mru: 5000, buckets: { d0_7: 5000, d8_30: 0, d31_60: 0, d60p: 0 }, oldestDays: 3, overdue: 0, upcoming: 0, ...o });

describe("buildCenterAlerts - every alert from the numbers, nothing fixed", () => {
  it("quiet books → no alert", () => {
    expect(buildCenterAlerts(base())).toEqual([]);
  });

  it("profit: a drop vs the same days of last month, a losing renewal (critical), a thin margin", () => {
    const alerts = buildCenterAlerts(base({ monthNetMru: 7000, renewals: [renewal({ entryId: "x", marginMru: -200, marginPct: -5 }), renewal({ entryId: "y", marginMru: 200, marginPct: 5 })] }));
    expect(alerts.map((a) => [a.type, a.severity])).toEqual([
      ["negative-margin", "critical"],
      ["profit-drop", "warn"],
      ["low-margin", "warn"],
    ]);
  });

  it("collection: over his limit, long without paying (age, not «late»), a broken promise", () => {
    const alerts = buildCenterAlerts(base({ debtors: [debtor({ total: 40000, mru: 40000, daysSincePayment: 45, oldestDays: 50, overdue: 3000 })] }));
    expect(alerts.map((a) => a.type).sort()).toEqual(["client-debt-limit", "no-collection", "promise-overdue"]);
    expect(alerts.find((a) => a.type === "no-collection")!.reason).toContain("وليس تأخرًا");
  });

  it("a disabled type never shows; a severity he chose wins", () => {
    const input = base({ debtors: [debtor({ total: 40000, mru: 40000 })] });
    expect(buildCenterAlerts(input, { ...DEFAULT_ALERT_RULES, disabled: ["client-debt-limit"] })).toEqual([]);
    expect(buildCenterAlerts(input, { ...DEFAULT_ALERT_RULES, severity: { "client-debt-limit": "critical" } })[0]!.severity).toBe("critical");
  });

  it("Starlink: unpaid costs, old ones, and the card not covering the next 7 days", () => {
    const owed = [1, 2, 3].map((i) => ({ entryId: `s${i}`, accountId: "a1", device: "جهاز", date: "2026-08-01", ageDays: 69, usd: 60 }));
    const alerts = buildCenterAlerts(base({ starlinkOwed: owed, upcomingCount: 2, upcomingStarlinkUsd: 120, cardBalanceUsd: 50 }));
    expect(alerts.map((a) => [a.type, a.severity])).toEqual([
      ["starlink-old-d", "critical"],
      ["starlink-owed", "warn"],
      ["starlink-due-soon", "warn"],
    ]);
  });

  it("data: a possible duplicate (same op saved twice within minutes), a currency with no rate", () => {
    const op = (id: string, createdAt: string): LedgerEntry => ({ id, kind: "credit", amount: 2000, currency: "SIFA", note: "", email: "", date: T, createdAt, paymentMethod: "orange" });
    const alerts = buildCenterAlerts(base({ ledger: { a1: [op("p1", `${T}T10:00:00Z`), op("p2", `${T}T10:00:40Z`)] }, usedCurrencies: ["MRU", "SIFA"] }));
    expect(alerts.map((a) => a.type).sort()).toEqual(["duplicate-op", "missing-rate"]);
    expect(alerts.find((a) => a.type === "duplicate-op")!.key).toBe("duplicate-op:p1:p2");
  });
});

describe("goal ceilings", () => {
  it("a ceiling passed is an alert; a goal reached is not (it shows in the goals)", () => {
    const goals = [
      { key: "expensesMaxMru", label: "حد مصروفات الشهر", period: "month", ceiling: true, count: false, currency: "MRU", target: 10000, done: 12000, remaining: -2000, ratio: 1.2, status: "over", daysLeft: 23, expected: 2903, pace: "behind" },
      { key: "profitMonthMru", label: "ربح الشهر", period: "month", ceiling: false, count: false, currency: "MRU", target: 1000, done: 2000, remaining: -1000, ratio: 2, status: "done", daysLeft: 23, expected: 290, pace: "ahead" },
    ] as AlertInput["goals"];
    expect(buildCenterAlerts(base({ goals })).map((a) => a.key)).toEqual(["goal-ceiling:expensesMaxMru:2026-10"]);
  });
});

describe("alert states", () => {
  const one = buildCenterAlerts(base({ debtors: [debtor({ total: 40000, mru: 40000 })] }));

  it("10: recomputing (a page refresh) never makes a second alert", () => {
    const s1 = reconcileAlertStates({}, one, "2026-10-09T10:00:00Z");
    const s2 = reconcileAlertStates(s1, buildCenterAlerts(base({ debtors: [debtor({ total: 40000, mru: 40000 })] })), "2026-10-09T10:05:00Z");
    expect(Object.keys(s2)).toEqual(Object.keys(s1));
    expect(s2[one[0]!.key]).toMatchObject({ status: "new", firstSeen: "2026-10-09T10:00:00Z", lastSeen: "2026-10-09T10:05:00Z" });
  });

  it("opening it = reviewed, not resolved; it's resolved only when its cause is gone, with the time", () => {
    let s = reconcileAlertStates({}, one, "t1");
    s = markAlertReviewed(s, one[0]!.key, "t2");
    s = reconcileAlertStates(s, one, "t3");
    expect(s[one[0]!.key]!.status).toBe("reviewed");
    s = reconcileAlertStates(s, [], "2026-10-10T08:00:00Z");
    expect(s[one[0]!.key]).toMatchObject({ status: "resolved", resolvedAt: "2026-10-10T08:00:00Z" });
    // The cause again later → a new alert.
    s = reconcileAlertStates(s, one, "2026-10-12T08:00:00Z");
    expect(s[one[0]!.key]).toMatchObject({ status: "new", firstSeen: "2026-10-12T08:00:00Z" });
  });

  it("«تمت المعالجة» keeps it quiet until its numbers change", () => {
    let s = reconcileAlertStates({}, one, "t1");
    s = acknowledgeAlert(s, one[0]!, "t2");
    expect(s[one[0]!.key]!.status).toBe("acknowledged");
    s = reconcileAlertStates(s, one, "t3");
    expect(s[one[0]!.key]!.status).toBe("acknowledged");
    const bigger = buildCenterAlerts(base({ debtors: [debtor({ total: 52000, mru: 52000 })] }));
    s = reconcileAlertStates(s, bigger, "t4");
    expect(s[one[0]!.key]!.status).toBe("new");
  });

  it("an alert that can't be legitimate can't be «handled» - only fixed", () => {
    const late = buildCenterAlerts(base({ debtors: [debtor({ overdue: 1000 })] }));
    const s = reconcileAlertStates({}, late, "t1");
    expect(acknowledgeAlert(s, late[0]!, "t2")).toBe(s);
  });
});
