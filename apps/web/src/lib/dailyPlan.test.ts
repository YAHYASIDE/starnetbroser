import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { DeviceStatus } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import { buildDailyPlan } from "./dailyPlan";

const acc = (o: Partial<StarlinkAccountSummary>): StarlinkAccountSummary =>
  ({ id: "", customerId: "x", name: "", deviceName: "", kitNumber: "", serialNumber: "", standbyDate: "", rechargeDate: "", balanceDue: "0", currency: "$", dishStatus: DeviceStatus.GREEN, wifiStatus: DeviceStatus.GREEN, alertReason: "", lastUpdated: "", lastSuccessfulScanAt: null, planName: "", ...o }) as StarlinkAccountSummary;
const now = "2026-01-01T00:00:00Z";
const clients: ClientStore = { c1: { id: "c1", name: "محمد", phone: "22212345678", createdAt: now, updatedAt: now } };

describe("daily plan", () => {
  it("collects today's work, most urgent first", () => {
    const plan = buildDailyPlan({
      accounts: [
        // Dates are the stop instant: date tomorrow (09/29) = ends tonight, 09/30 = ends tomorrow.
        acc({ id: "a", name: "اليوم", clientId: "c1", rechargeDate: "2026/09/29" }),
        acc({ id: "b", name: "غداً", rechargeDate: "2026/09/30" }),
        acc({ id: "c", name: "أمس", rechargeDate: "2026/09/27" }),
        acc({ id: "d", name: "بعيد", rechargeDate: "2026/10/10" }),
        acc({ id: "e", name: "متوقف", clientId: "c1", rechargeDate: "2026/09/20" }),
      ],
      clients,
      promises: [
        { id: "p1", name: "سالم", amount: 5000, currency: "MRU", dueDate: "2026-09-26", status: "open", createdAt: now },
        { id: "p2", name: "علي", amount: 10, currency: "USD", dueDate: "2026-10-01", status: "open", createdAt: now },
      ],
      debtors: [
        { kind: "client", id: "c1", name: "محمد", currencyCode: "MRU", total: 9000, oldestDays: 45 } as never,
        { kind: "client", id: "c2", name: "جديد", currencyCode: "MRU", total: 100, oldestDays: 3 } as never,
      ],
      issues: [
        { kind: "duplicate-email", severity: "high", title: "إيميل مكرر", hint: "h", items: [{ label: "x" }, { label: "y" }] },
        { kind: "stale-sync", severity: "low", title: "قديمة", hint: "h", items: [{ label: "x" }] },
      ],
      today: "2026-09-28",
      currencyLabel: (c) => (c === "MRU" ? "أوقية" : c),
    });
    expect(plan.map((t) => t.id)).toEqual([
      "renewal:c",
      "promise:p1",
      "renewal:a",
      "renewal:b",
      "debt:c1:MRU",
      "winback:e",
      "data:duplicate-email",
    ]);
    const today = plan.find((t) => t.id === "renewal:a")!;
    expect(today).toMatchObject({ detail: "محمد · ينتهي اليوم", phone: "22212345678" });
    expect(plan.find((t) => t.id === "promise:p1")!.detail).toBe("وعد بدفع 5,000 أوقية (متأخر)");
    expect(plan.find((t) => t.id === "debt:c1:MRU")!.message).toContain("9,000");
  });
});

describe("⏰ pins in the plan", () => {
  it("adds a task for each due pin, opening its device", () => {
    const tasks = buildDailyPlan({
      accounts: [],
      clients: {},
      promises: [],
      debtors: [],
      issues: [],
      today: "2026-10-08",
      currencyLabel: (c) => c,
      pins: [
        { accountId: "a", name: "جهاز أ", text: "اتصل بالفني", pinUntil: "2026-10-08" },
        { accountId: "b", name: "جهاز ب", pinUntil: "2026-10-05" },
      ],
    });
    expect(tasks.filter((t) => t.kind === "pin").map((t) => [t.title, t.detail, t.accountId])).toEqual([
      ["📌 جهاز أ", "اتصل بالفني · موعده اليوم", "a"],
      ["📌 جهاز ب", "موعده كان 2026-10-05", "b"],
    ]);
  });
});
