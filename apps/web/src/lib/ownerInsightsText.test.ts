import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { DeviceStatus } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import { forecastText, goalsText, healthText, lapsedText, planText, promisesText } from "./ownerInsightsText";
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
});
