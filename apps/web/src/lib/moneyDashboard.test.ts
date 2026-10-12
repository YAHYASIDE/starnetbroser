import { describe, expect, it } from "vitest";
import type { CashEntry } from "./cashStore";
import type { DashInput } from "./financeDashboard";
import type { LedgerEntry } from "./ledgerStore";
import { buildWealth, EMPTY_DEBT_BOOK, type WealthInput } from "./myMoney";
import {
  buildCurrencyHoldings,
  buildMoneyAlerts,
  buildMoneySearchIndex,
  buildMoneySummary,
  compareDirection,
  currencyShares,
  DEFAULT_OPEN_SECTIONS,
  earliestRecordDate,
  parseOpenSections,
  quickComparisons,
  searchMoney,
  sectionLines,
  sectionOfLine,
  toggleSection,
  type MoneySearchSources,
} from "./moneyDashboard";

// 1 USD = 400 أوقية = 600 سيفا (fake figures only).
const rates = { USD: 1, MRU: 400, SIFA: 600 };

function wealthInput(patch: Partial<WealthInput> = {}): WealthInput {
  return {
    cash: { MRU: 20000, SIFA: 6000 },
    banks: [
      { name: "🟦 بنك تجريبي", byCurrency: { MRU: 8000 }, id: "b1" },
      { name: "🟠 محفظة تجريبية", byCurrency: { SIFA: 12000 }, franc: true, id: "b2" },
    ],
    cardUsd: 10,
    customers: [{ name: "زبون تجريبي", byCurrency: { MRU: 4000 } }],
    customersOwe: [{ name: "زبون دائن", byCurrency: { MRU: 1000 } }],
    reps: [{ name: "مندوب تجريبي", byCurrency: { SIFA: 30000 } }],
    debts: EMPTY_DEBT_BOOK,
    suppliers: [{ name: "مورد تجريبي", byCurrency: { MRU: 2000 } }],
    starlink: [{ name: "جهاز تجريبي", usd: 5 }],
    rates,
    ...patch,
  };
}

describe("💰 أولًا: the four summary cards", () => {
  const summary = buildMoneySummary(buildWealth(wealthInput()));
  const card = (key: string) => summary.figures.find((f) => f.key === key)!;

  it("available = cash + apps + wallets + KAST, in أوقية ≈ and in each real currency", () => {
    // 20,000 + 6,000 سيفا (4,000) + 8,000 + 12,000 سيفا (8,000) + 10$ (4,000) = 44,000
    expect(card("available").mru).toBe(44000);
    expect(card("available").byCurrency).toEqual({ MRU: 28000, SIFA: 18000, USD: 10 });
  });

  it("obligations and receivables, each debt once", () => {
    // Starlink 5$ (2,000) + the customer's credit 1,000 + the supplier 2,000
    expect(card("obligations").mru).toBe(5000);
    expect(card("obligations").byCurrency).toEqual({ USD: 5, MRU: 3000 });
    // the customer 4,000 + the rep 30,000 سيفا (20,000) - the rep's customers are inside his line only
    expect(card("receivables").mru).toBe(24000);
    expect(card("receivables").lineKeys).toEqual(["customers", "repsOwe"]);
  });

  it("net = available + receivables − obligations, the same figure as «كل ما تملك»", () => {
    expect(card("net").mru).toBe(44000 + 24000 - 5000);
    expect(card("net").byCurrency).toEqual({ MRU: 28000 + 4000 - 3000, SIFA: 18000 + 30000, USD: 5 });
    expect(summary.inHandMru).toBe(44000 - 5000);
  });

  it("a transfer between two of my places is not income: nothing changes but where the money is", () => {
    const moved = buildMoneySummary(
      buildWealth(
        wealthInput({
          cash: { MRU: 15000, SIFA: 6000 },
          banks: [
            { name: "🟦 بنك تجريبي", byCurrency: { MRU: 13000 }, id: "b1" },
            { name: "🟠 محفظة تجريبية", byCurrency: { SIFA: 12000 }, franc: true, id: "b2" },
          ],
        }),
      ),
    );
    expect(moved.figures.map((f) => [f.key, f.mru])).toEqual(summary.figures.map((f) => [f.key, f.mru]));
  });

  it("a currency without a rate is listed apart, never guessed", () => {
    const s = buildMoneySummary(buildWealth(wealthInput({ cash: { MRU: 1000, DZD: 500 } })));
    expect(s.missing).toEqual(["DZD"]);
    expect(s.figures[0]!.byCurrency.DZD).toBe(500);
  });
});

describe("💱 the currencies", () => {
  const holdings = buildCurrencyHoldings(buildWealth(wealthInput()), rates);

  it("each currency: what I have, what's owed, what I owe - converted only for the ≈ أوقية", () => {
    const sifa = holdings.find((h) => h.code === "SIFA")!;
    expect(sifa).toMatchObject({ label: "سيفا", have: 18000, owed: 30000, owe: 0, net: 48000, haveMru: 12000, netMru: 32000, rate: 600 });
    const usd = holdings.find((h) => h.code === "USD")!;
    expect(usd).toMatchObject({ have: 10, owe: 5, net: 5, haveMru: 4000 });
    // the biggest holding first
    expect(holdings.map((h) => h.code)).toEqual(["MRU", "SIFA", "USD"]);
  });

  it("the distribution bar adds up to 100%", () => {
    const shares = currencyShares(holdings);
    expect(shares.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100);
    expect(shares.find((s) => s.code === "MRU")!.pct).toBeCloseTo((28000 / 44000) * 100);
  });

  it("a currency with no rate goes last, without an أوقية figure", () => {
    const list = buildCurrencyHoldings(buildWealth(wealthInput({ cash: { MRU: 1000, DZD: 500 } })), rates);
    expect(list.at(-1)).toMatchObject({ code: "DZD", have: 500 });
    expect(list.at(-1)!.haveMru).toBeUndefined();
  });
});

describe("📂 ثانيًا: the sections", () => {
  const wealth = buildWealth(wealthInput());

  it("each section lists its own lines", () => {
    expect(sectionLines(wealth, "wallets").every((l) => l.kind === "have")).toBe(true);
    expect(sectionLines(wealth, "customers").map((l) => l.key)).toEqual(["customers", "customersOwe"]);
    expect(sectionLines(wealth, "reps").map((l) => l.key)).toEqual(["repsOwe", "repsOwed"]);
    expect(sectionLines(wealth, "receivables").map((l) => l.key)).toEqual(["customers", "repsOwe"]);
    expect(sectionOfLine("starlink")).toBe("starlink");
    expect(sectionOfLine("bank:0:x")).toBe("wallets");
  });

  it("the alerts and «يبقى لك» open by default; his choice is kept; junk ignored", () => {
    expect(parseOpenSections(null)).toEqual(DEFAULT_OPEN_SECTIONS);
    expect(parseOpenSections("not json")).toEqual(DEFAULT_OPEN_SECTIONS);
    expect(parseOpenSections('["wallets","nope"]')).toEqual(["wallets"]);
    expect(parseOpenSections("[]")).toEqual([]);
    expect(toggleSection(["alerts"], "wallets")).toEqual(["alerts", "wallets"]);
    expect(toggleSection(["alerts", "wallets"], "alerts")).toEqual(["wallets"]);
  });
});

describe("🔎 رابعًا: the search", () => {
  const wealth = buildWealth(wealthInput());
  const sources: MoneySearchSources = {
    wealth,
    holdings: buildCurrencyHoldings(wealth, rates),
    accounts: [{ id: "b1", name: "بنك تجريبي", icon: "🟦", currencyCode: "MRU", number: "00000001" }],
    incomes: [{ id: "i1", amount: 15000, currencyCode: "MRU", date: "2026-10-01", category: "الراتب" }],
    expenses: [{ id: "e1", amount: 2500, currencyCode: "MRU", date: "2026-10-03", category: "إيجار", note: "مكتب" }],
    transfers: [{ id: "t1", amount: 3000, currencyCode: "MRU", date: "2026-10-04", from: "الكاش", to: "بنك تجريبي" }],
    cash: [{ id: "k1", kind: "out", amount: 1200, currencyCode: "MRU", date: "2026-10-02", category: "كهرباء", note: "فاتورة" }],
    exchanges: [{ id: "x1", paid: 10, fromCurrency: "USD", received: 6000, toCurrency: "SIFA", date: "2026-10-05" }],
    remittances: [{ id: "r1", client: "زبون التحويل", amount: 50000, currency: "SIFA", date: "2026-10-06" }],
    clients: [{ id: "c1", name: "زبون تجريبي" }, { id: "c2", name: "زبونة جديدة", phone: "00001111" }],
    suppliers: [{ id: "s1", name: "مورد آخر" }],
    reps: [{ id: "p1", name: "مندوب تجريبي" }],
    homeHref: (text) => `/?q=${encodeURIComponent(text)}`,
  };
  const index = buildMoneySearchIndex(sources);

  it("finds a customer's debt and opens his line (not a second hit for the same person)", () => {
    const hits = searchMoney(index, "زبون تجريبي");
    expect(hits[0]).toMatchObject({ title: "زبون تجريبي", target: { kind: "line", key: "customers" } });
    expect(hits.filter((h) => h.title === "زبون تجريبي")).toHaveLength(1);
  });

  it("Arabic spellings are forgiving (ة/ه, أ/ا)", () => {
    expect(searchMoney(index, "زبونه").map((h) => h.title)).toContain("زبونة جديدة");
    expect(searchMoney(index, "ايجار")[0]).toMatchObject({ kindLabel: "مصروف", target: { kind: "tab", tab: "expense" } });
  });

  it("the business's own الكاش entries are found and open الكاش's statement", () => {
    expect(searchMoney(index, "كهرباء")[0]).toMatchObject({ kindLabel: "خرج من الكاش", target: { kind: "place", id: "cash" } });
    expect(searchMoney(index, "1200").some((h) => h.title.includes("كهرباء"))).toBe(true);
  });

  it("an empty line is not a result", () => {
    // no rep is owed anything here: «عليك للمندوبين» has nobody in it
    expect(searchMoney(index, "عليك للمندوبين")).toEqual([]);
  });

  it("an amount, with or without commas, finds the record", () => {
    expect(searchMoney(index, "15,000")[0]).toMatchObject({ kindLabel: "دخل" });
    expect(searchMoney(index, "50000")[0]).toMatchObject({ kindLabel: "تحويل أموال", target: { kind: "section", id: "transfers" } });
  });

  it("a wallet, a currency, an account number, a person without a balance", () => {
    expect(searchMoney(index, "سيفا").some((h) => h.target.kind === "section" && h.target.id === "currencies")).toBe(true);
    expect(searchMoney(index, "00000001")[0]).toMatchObject({ target: { kind: "place", id: "b1" } });
    expect(searchMoney(index, "مورد آخر")[0]).toMatchObject({ target: { kind: "href", href: "/clients" } });
    expect(searchMoney(index, "   ")).toEqual([]);
  });
});

describe("🔔 خامسًا: the money alerts", () => {
  const wealth = buildWealth(wealthInput());
  const alerts = buildMoneyAlerts({
    wealth,
    lowLines: ["cash"],
    placeBalances: { b1: { MRU: -3000 }, cash: { MRU: 20000 } },
    placeName: (id) => (id === "b1" ? "بنك تجريبي" : id),
    unsetPlaces: [{ id: "b2", name: "محفظة تجريبية" }],
    pendingNotices: 2,
    missingRates: [],
    dueSoon: [{ name: "زبون تجريبي", amount: 4000, currency: "MRU", date: "2026-10-12" }],
    today: "2026-10-12",
  });

  it("a negative balance is a discrepancy, shown first, and opens the place's statement", () => {
    expect(alerts[0]).toMatchObject({ severity: "critical", target: { kind: "place", id: "b1" } });
    expect(alerts[0]!.title).toContain("بنك تجريبي");
  });

  it("low balances, bank notices waiting, a payment due today, an unset balance", () => {
    expect(alerts.map((a) => a.key)).toEqual(expect.arrayContaining(["low:cash", "bank-inbox", "due:زبون تجريبي:MRU:2026-10-12", "unset-places"]));
    expect(alerts.find((a) => a.key === "bank-inbox")!.target).toEqual({ kind: "inbox" });
    expect(alerts.find((a) => a.key.startsWith("due:"))!.title).toContain("اليوم");
  });
});

describe("⚖️ ثالثًا: the quick comparisons", () => {
  const entry = (o: Partial<LedgerEntry>): LedgerEntry => ({ id: "s", kind: "debit", amount: 100, currency: "USD", note: "", email: "", date: "2026-10-09", createdAt: "2026-10-09T10:00:00.000Z", ...o });
  const settled = (paidAt: string, amount = 60) => ({ status: "settled" as const, currencyCode: "USD", amount, paidAt });
  const input: DashInput = {
    ledgerStore: {
      d1: [
        entry({ id: "a", starlinkCost: settled("2026-10-12"), date: "2026-10-12", profitCurrencyRates: { MRU: 40 } }),
        entry({ id: "b", date: "2026-09-12", starlinkCost: settled("2026-09-12", 80), profitCurrencyRates: { MRU: 40 } }),
        entry({ id: "c", date: "2026-09-25", starlinkCost: settled("2026-09-25"), profitCurrencyRates: { MRU: 40 } }),
      ],
    },
    invoices: [],
    transactions: [],
    cash: [{ id: "x", kind: "out", amount: 100, currencyCode: "MRU", date: "2026-09-01", createdAt: "" } as CashEntry],
    rates: { USD: 1, MRU: 40 },
  };

  it("today vs the same day last month: value, difference and %", () => {
    const [day] = quickComparisons(input, "2026-10-12", "same");
    expect(day!.previous).toEqual({ from: "2026-09-12", to: "2026-09-12" });
    const net = day!.rows.find((r) => r.key === "net")!;
    // profit 1,600 now vs 800 then → +100%
    expect(net).toMatchObject({ current: 1600, previous: 800, diff: 800, pct: 100 });
    expect(compareDirection(net, day!.status)).toEqual({ text: "▲ +100%", tone: "good" });
  });

  it("this month vs the same days of last month (fair) - the whole last month is flagged incomplete", () => {
    const [, same] = quickComparisons(input, "2026-10-12", "same");
    expect(same!.previous).toEqual({ from: "2026-09-01", to: "2026-09-12" });
    expect(same!.status).toBe("ok");
    const [, full] = quickComparisons(input, "2026-10-12", "full");
    expect(full!.previous).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(full!.status).toBe("incomplete");
    expect(full!.note).toContain("12 من 31");
    expect(compareDirection(full!.rows[0]!, full!.status).tone).toBe("none");
    // on the month's last day the whole month is a fair comparison
    expect(quickComparisons(input, "2026-10-31", "full")[1]!.status).toBe("ok");
  });

  it("no comparison before the first record; records starting mid-period = incomplete", () => {
    expect(earliestRecordDate(input)).toBe("2026-09-01");
    const [day, month] = quickComparisons(input, "2026-09-20", "same");
    expect(day!.status).toBe("noData");
    expect(month!.status).toBe("noData");
    expect(day!.note).toContain("2026-09-01");
    expect(compareDirection(day!.rows[0]!, "noData").text).toBe("لا توجد قاعدة");
    // the first record on 2 Sep: October's month-to-date vs 1-12 Sep is shown, without a direction
    const [, partial] = quickComparisons(input, "2026-10-12", "same", "2026-09-02");
    expect(partial!.status).toBe("incomplete");
    expect(partial!.note).toContain("2026-09-02");
  });

  it("a fall in expenses is good news, a 0 base has no %", () => {
    expect(compareDirection({ key: "expenses", label: "", current: 50, previous: 100, diff: -50, pct: -50, upIsGood: false }, "ok")).toEqual({ text: "▼ -50%", tone: "good" });
    expect(compareDirection({ key: "net", label: "", current: 50, previous: 0, diff: 50, pct: null, upIsGood: true }, "ok").tone).toBe("none");
  });
});
