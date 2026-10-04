import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import { describe, expect, it } from "vitest";
import type { CashEntry } from "./cashStore";
import type { LedgerEntry } from "./ledgerStore";
import { buildEveningSummary, localDay, nextEveningTime } from "./eveningSummary";

function account(id: string, extra: Partial<StarlinkAccountSummary> = {}): StarlinkAccountSummary {
  return {
    id, customerId: id, name: id, deviceName: "Kit", kitNumber: "", serialNumber: "", standbyDate: "", rechargeDate: "",
    balanceDue: "0", currency: "USD", dishStatus: DeviceStatus.GREEN, wifiStatus: DeviceStatus.GREEN, alertReason: "",
    lastUpdated: "", lastSuccessfulScanAt: null, planName: "", ...extra,
  };
}
const e = (id: string, kind: "debit" | "credit", amount: number, currency: string, date: string) =>
  ({ id, kind, amount, currency, date, note: "", email: "", createdAt: `${date}T10:00:00Z` }) as LedgerEntry;
const c = (id: string, kind: "in" | "out", amount: number, date: string, extra: Partial<CashEntry> = {}) =>
  ({ id, kind, amount, currencyCode: "MRU", date, createdAt: "", ...extra }) as CashEntry;

const DAY = "2026-09-27";

describe("buildEveningSummary", () => {
  it("sums the day's payments and shipments per currency, expenses, the till, and who still owes", () => {
    const summary = buildEveningSummary({
      day: DAY,
      accounts: [account("a"), account("b"), account("gone", { deletedAt: "2026-09-01" })],
      ledgerStore: {
        a: [e("1", "debit", 3000, "MRU", DAY), e("2", "credit", 1000, "MRU", DAY), e("3", "credit", 500, "MRU", "2026-09-20")],
        b: [e("4", "debit", 50, "USD", "2026-09-10"), e("5", "credit", 50, "USD", DAY)],
        gone: [e("6", "credit", 999, "MRU", DAY)],
      },
      cash: [
        c("x", "in", 1000, DAY, { sourceId: "2", sourceKind: "device-payment" }),
        c("y", "out", 200, DAY, { category: "نقل" }),
        c("z", "out", 300, "2026-09-26"),
      ],
    })!;
    expect(summary.title).toContain("تحصّل");
    expect(summary.lines).toEqual([
      "💵 تحصّل اليوم: 1,000 أوقية + 50 دولار (2 دفعة)",
      "📡 شحنات اليوم: 1 (3,000 أوقية)",
      "💸 مصاريف اليوم: 200 أوقية",
      "🏦 في الكاش: 500 أوقية",
      "⏳ لم يدفع بعد: 1 جهاز - 1,500 أوقية",
    ]);
  });

  it("still reports debts on a quiet day, and nothing at all with no data", () => {
    const quiet = buildEveningSummary({ day: DAY, accounts: [account("a")], ledgerStore: { a: [e("1", "debit", 100, "MRU", "2026-09-01")] }, cash: [] })!;
    expect(quiet.title).toBe("🌙 ملخص اليوم - STAR NET");
    expect(quiet.lines).toEqual(["💵 لم تُسجَّل دفعات اليوم", "⏳ لم يدفع بعد: 1 جهاز - 100 أوقية"]);
    expect(buildEveningSummary({ day: DAY, accounts: [], ledgerStore: {}, cash: [] })).toBeNull();
  });
});

describe("nextEveningTime", () => {
  it("is today at the hour, or tomorrow once it has passed", () => {
    expect(nextEveningTime(new Date(2026, 8, 27, 18, 0), 21).getDate()).toBe(27);
    const late = nextEveningTime(new Date(2026, 8, 27, 21, 30), 21);
    expect([late.getDate(), late.getHours()]).toEqual([28, 21]);
  });
});

describe("localDay", () => {
  it("formats the phone's own date", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
