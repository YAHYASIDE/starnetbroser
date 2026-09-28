import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { DeviceStatus } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import { cardText, forecastText, goalsText, healthText, lapsedText, nextWeeklyTime, planText, promisesText, weeklyText } from "./ownerInsightsText";
import { parseTelegramCommand } from "./telegramMessages";

const acc = (o: Partial<StarlinkAccountSummary>): StarlinkAccountSummary => ({
  id: "",
  customerId: "x",
  name: "",
  deviceName: "",
  kitNumber: "",
  serialNumber: "",
  standbyDate: "",
  rechargeDate: "",
  balanceDue: "0",
  currency: "$",
  dishStatus: DeviceStatus.GREEN,
  wifiStatus: DeviceStatus.GREEN,
  alertReason: "",
  lastUpdated: "",
  lastSuccessfulScanAt: "2026-09-27T10:00:00Z",
  planName: "",
  ...o,
});
const now = "2026-01-01T00:00:00Z";
const clients: ClientStore = { c1: { id: "c1", name: "محمد", phone: "22212345678", createdAt: now, updatedAt: now } };
const today = new Date(2026, 8, 28);

describe("owner bot insight commands", () => {
  it("are recognised", () => {
    expect(parseTelegramCommand("توقعات")).toEqual({ kind: "forecast" });
    expect(parseTelegramCommand("وعود")).toEqual({ kind: "promises" });
    expect(parseTelegramCommand("/lapsed")).toEqual({ kind: "lapsed" });
    expect(parseTelegramCommand("فحص")).toEqual({ kind: "health" });
    expect(parseTelegramCommand("أهداف")).toEqual({ kind: "goals" });
    expect(parseTelegramCommand("خطة")).toEqual({ kind: "plan" });
  });

  it("forecast and lapsed lists", () => {
    const accounts = [
      acc({ id: "a", name: "منزل", clientId: "c1", rechargeDate: "2026/09/30", renewalPlan: { saleAmount: 4000, saleCurrency: "MRU", costAmount: 50, costCurrency: "USD" } }),
      acc({ id: "b", name: "مقهى", clientId: "c1", rechargeDate: "2026/09/20" }),
    ];
    const f = forecastText(accounts, today);
    expect(f).toContain("📈 توقعات 30 يوماً: 1 جهاز");
    expect(f).toContain("4,000 أوقية");
    expect(f).toContain("• 28/09-04/10: 1 جهاز");
    expect(forecastText([], today)).toContain("لا تجديدات");
    expect(forecastText(accounts, today, 20)).toContain("⚠️ البطاقة: تحتاج 50$ خلال 7 أيام ورصيدها 20$ - اشحنها بـ30$");
    expect(forecastText(accounts, today, 100)).toContain("✓ البطاقة تكفي");
    expect(lapsedText(accounts, clients, today)).toContain("• مقهى - محمد · منذ 8 يوماً · 22212345678");
  });

  it("promises, health and goals", () => {
    const p = promisesText(
      [{ id: "1", name: "محمد", amount: 5000, currency: "MRU", dueDate: "2026-09-25", status: "open", createdAt: now }],
      "2026-09-28",
    );
    expect(p).toContain("⏰ متأخرة (1):");
    expect(p).toContain("• محمد: 5,000 أوقية (25/09)");
    expect(promisesText([], "2026-09-28")).toContain("لا توجد");
    expect(healthText([acc({ id: "a", name: "A" })], clients, new Date("2026-09-28T00:00:00Z"))).toContain("🔴 بدون موعد تجديد: 1");
    expect(goalsText({}, "2026-09-28", {}, clients)).toContain("لم تحدد");
    const g = goalsText({ newClients: 2, collection: { amount: 1000, currency: "MRU" } }, "2026-09-28", {}, clients);
    expect(g).toContain("زبائن جدد: 0 / 2");
    expect(g).toContain("التحصيل: 0 / 1,000 أوقية");
    expect(g).toContain("░░░░░░░░░░ 0% ⚠️ متأخر");
  });

  it("today's plan", () => {
    const text = planText({
      accounts: [acc({ id: "a", name: "منزل", clientId: "c1", rechargeDate: "2026/09/28", lastSuccessfulScanAt: "2026-09-27T00:00:00Z" })],
      clients,
      promises: [],
      ledger: {},
      invoices: [],
      adjustments: [],
      today: "2026-09-28",
      now: new Date("2026-09-28T08:00:00Z"),
    });
    expect(text).toContain("✅ خطة اليوم (1 مهمة)");
    expect(text).toContain("• 📅 منزل - محمد · ينتهي اليوم · 22212345678");
    expect(planText({ accounts: [], clients, promises: [], ledger: {}, invoices: [], adjustments: [], today: "2026-09-28", now: new Date() })).toContain("لا مهام");
  });

  it("weekly summary", () => {
    // Saturday 26 Sep 2026 -> the week 20/09 - 26/09
    expect(nextWeeklyTime(new Date(2026, 8, 28, 10), 21)).toEqual(new Date(2026, 9, 3, 21));
    expect(nextWeeklyTime(new Date(2026, 9, 3, 20), 21)).toEqual(new Date(2026, 9, 3, 21));
    expect(nextWeeklyTime(new Date(2026, 9, 3, 22), 21)).toEqual(new Date(2026, 9, 10, 21));
    const e = (o: object) => ({ id: "x", kind: "debit", amount: 1, currency: "MRU", note: "", email: "", date: "2026-09-22", createdAt: "x", ...o });
    const text = weeklyText({
      accounts: [acc({ id: "a", name: "A", representativeId: "r1", rechargeDate: "2026/09/20" })],
      clients: { c1: { id: "c1", name: "م", createdAt: "2026-09-21T10:00:00Z", updatedAt: now } },
      ledger: { a: [e({}), e({ date: "2026-09-10" }), e({ kind: "credit", amount: 3000 })] } as never,
      promises: [
        { id: "1", name: "x", amount: 1, currency: "MRU", dueDate: "2026-09-22", status: "kept", createdAt: now, resolvedAt: "2026-09-23T10:00:00Z" },
        { id: "2", name: "y", amount: 1, currency: "MRU", dueDate: "2026-09-22", status: "broken", createdAt: now, resolvedAt: "2026-09-24T10:00:00Z" },
      ],
      repNames: { r1: "سالم" },
      weekEnd: "2026-09-26",
      now: new Date(2026, 8, 26),
    });
    expect(text).toContain("📊 ملخص الأسبوع 20/09 - 26/09");
    expect(text).toContain("📦 شحنات وتجديدات: 1");
    expect(text).toContain("💵 التحصيل: 3,000 أوقية");
    expect(text).toContain("👤 زبائن جدد: 1");
    expect(text).toContain("🤝 وعود: 1 وُفي بها · 1 لم يُوفَ بها");
    expect(text).toContain("🔁 أجهزة متوقفة عن التجديد: 1");
    expect(text).toContain("🏆 أنشط مندوب: سالم (1 شحنة)");
  });

  it("card", () => {
    const accounts = [acc({ id: "a", name: "A", rechargeDate: "2026/09/30", renewalPlan: { saleAmount: 4000, saleCurrency: "MRU", costAmount: 50, costCurrency: "USD" } })];
    const text = cardText(accounts, 60, [30], today);
    expect(text).toContain("💳 رصيد بطاقة Starlink: 60$");
    expect(text).toContain("📅 تجديدات 7 أيام: 1 جهاز تحتاج 50$");
    expect(text).toContain("🔴 D غير مدفوعة لستارلينك: 1 بمبلغ 30$");
    expect(text).toContain("⚠️ اشحن البطاقة بـ 20$ لتغطي الكل");
    expect(cardText([], 100, [], today)).toContain("✓ الرصيد يكفي");
    expect(parseTelegramCommand("البطاقة")).toEqual({ kind: "card" });
  });
});
