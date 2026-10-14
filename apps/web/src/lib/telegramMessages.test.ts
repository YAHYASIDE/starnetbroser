import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import { describe, expect, it } from "vitest";
import {
  answerCash,
  answerExpiring,
  answerStopped,
  buildEveningTelegram,
  buildMorningTelegram,
  buildPaymentTelegram,
  cleanBotToken,
  daysUntilRenewal,
  matchParties,
  parseTelegramCommand,
  renewalGroups,
} from "./telegramMessages";

function account(id: string, rechargeDate: string, extra: Partial<StarlinkAccountSummary> = {}): StarlinkAccountSummary {
  return {
    id, customerId: id, name: id, deviceName: "Kit", kitNumber: "", serialNumber: "", standbyDate: "", rechargeDate,
    balanceDue: "0", currency: "USD", dishStatus: DeviceStatus.GREEN, wifiStatus: DeviceStatus.GREEN, alertReason: "",
    lastUpdated: "", lastSuccessfulScanAt: null, planName: "", ...extra,
  };
}

const TODAY = "2026-09-27";
const clients = { c1: { id: "c1", name: "محمد", createdAt: "", updatedAt: "" } };

describe("renewal groups", () => {
  it("reads both date formats", () => {
    expect(daysUntilRenewal(account("a", "2026/09/30"), TODAY)).toBe(3);
    expect(daysUntilRenewal(account("a", "2026-09-26"), TODAY)).toBe(-1);
    expect(daysUntilRenewal(account("a", ""), TODAY)).toBeNull();
  });

  it("sorts devices into the 7/3/1-day windows (date = stop instant) and skips broken or archived ones", () => {
    // TODAY is 2026-09-27. The renewal date is the stop instant, so a device is live one day less
    // than the raw count: date today = already stopped, date tomorrow = ends tonight.
    const g = renewalGroups(
      [
        account("old", "2026/09/23"), // stopped 4 days ago - beyond the "last 3 days" window
        account("exp", "2026/09/27"), // date today -> stopped today
        account("today", "2026/09/28"), // date tomorrow -> ends tonight
        account("tom", "2026/09/29"), // ends tomorrow night
        account("d3", "2026/09/30"), // 2 days left
        account("d7", "2026/10/02"), // within the week
        account("far", "2026/10/10"),
        account("broken", "2026/09/28", { deviceFault: { reason: "other", note: "", reportedAt: "" } }),
        account("arch", "2026/09/28", { archivedAt: "x" }),
      ],
      TODAY,
    );
    expect(g.expired.map((a) => a.id)).toEqual(["exp"]);
    expect(g.today.map((a) => a.id)).toEqual(["today"]);
    expect(g.tomorrow.map((a) => a.id)).toEqual(["tom"]);
    expect(g.in3.map((a) => a.id)).toEqual(["d3"]);
    expect(g.in7.map((a) => a.id)).toEqual(["d7"]);
  });
});

describe("messages", () => {
  it("morning lists the devices by window with the client name, plus debts", () => {
    const text = buildMorningTelegram({
      accounts: [account("مقهى", "2026/09/28", { clientId: "c1" }), account("منزل", "2026/09/29")],
      clients,
      owedByCurrency: { MRU: 3000 },
      today: TODAY,
    });
    expect(text).toContain("🔴 تنتهي اليوم (1):\n• مقهى (محمد)");
    expect(text).toContain("🟠 تنتهي غداً (1):\n• منزل");
    expect(text).toContain("💰 ديون على الزبائن: 3,000 أوقية");
  });

  it("morning adds due payment promises, the card top-up and the plan hint", () => {
    const text = buildMorningTelegram({
      accounts: [],
      clients: {},
      owedByCurrency: {},
      today: TODAY,
      promisesDue: [{ name: "سالم", amount: 5000, currency: "MRU" }],
      cardShortUsd: 29.5,
      marginsLine: "🔻 1 جهاز خاسر (تدفع لستارلينك أكثر مما تأخذ)",
    });
    expect(text).toContain("🔻 1 جهاز خاسر");
    expect(text).toContain("🤝 وعود دفع مستحقة (1):\n• سالم: 5,000 أوقية");
    expect(text).toContain("⚠️ اشحن بطاقة Starlink بـ30$");
    expect(text).toContain("✅ لقائمة مهام اليوم اكتب: خطة");
  });

  it("morning says so when nothing is due", () => {
    expect(buildMorningTelegram({ accounts: [], clients: {}, owedByCurrency: {}, today: TODAY })).toContain("✓ لا أجهزة تنتهي خلال 7 أيام");
  });

  it("payment and evening texts", () => {
    const text = buildPaymentTelegram({ deviceName: "مقهى", clientName: "محمد", amount: 1000, currency: "MRU", method: "بنكيلي", balanceAfter: 2000, date: TODAY });
    expect(text).toContain("المبلغ: 1,000 أوقية (بنكيلي)");
    expect(text).toContain("المتبقي عليه: 2,000 أوقية");
    expect(buildPaymentTelegram({ deviceName: "x", amount: 5, currency: "USD", balanceAfter: 0, date: TODAY })).toContain("✓ لم يبقَ عليه شيء");
    expect(buildEveningTelegram({ title: "🌙 ملخص", lines: ["a", "b"] })).toBe("🌙 ملخص\n\na\nb");
  });
});

describe("commands", () => {
  it("understands Arabic and slash commands", () => {
    expect(parseTelegramCommand("/start")).toEqual({ kind: "help" });
    expect(parseTelegramCommand("المتوقفة")).toEqual({ kind: "stopped" });
    expect(parseTelegramCommand("/stopped@StarNetBot")).toEqual({ kind: "stopped" });
    expect(parseTelegramCommand("تنتهي")).toEqual({ kind: "expiring" });
    expect(parseTelegramCommand("الكاش")).toEqual({ kind: "cash" });
    expect(parseTelegramCommand("ملخص")).toEqual({ kind: "summary" });
    expect(parseTelegramCommand("كشف أحمد سالم")).toEqual({ kind: "statement", query: "أحمد سالم" });
    expect(parseTelegramCommand("كشف")).toEqual({ kind: "help" });
    expect(parseTelegramCommand("مرحبا")).toEqual({ kind: "unknown" });
  });

  it("answers from the data", () => {
    const accounts = [account("a", "2026/09/29", { serviceStatus: "suspended", clientId: "c1" }), account("b", "2026/09/29")];
    expect(answerStopped(accounts, clients)).toContain("• a (محمد)");
    expect(answerStopped([account("b", "")], {})).toContain("لا أجهزة موقوفة");
    expect(answerExpiring(accounts, clients, TODAY)).toContain("🟠 تنتهي غداً (2)");
    expect(answerCash([{ id: "1", kind: "in", amount: 500, currencyCode: "MRU", date: TODAY, createdAt: "" }])).toBe("🏦 في الكاش الآن: 500 أوقية");
  });

  it("finds a client or supplier by part of the name, ignoring hamza/ta marbuta differences", () => {
    const c = [{ id: "c1", name: "أحمد سالم" }, { id: "c2", name: "أحمدو" }];
    const s = [{ id: "s1", name: "مؤسسة النور" }];
    expect(matchParties("احمد سالم", c, s)).toEqual([{ kind: "client", id: "c1", name: "أحمد سالم" }]);
    expect(matchParties("احمد", c, s).map((m) => m.id)).toEqual(["c1", "c2"]);
    expect(matchParties("النور", c, s)).toEqual([{ kind: "supplier", id: "s1", name: "مؤسسة النور" }]);
    expect(matchParties("مؤسسه النور", c, s).map((m) => m.id)).toEqual(["s1"]);
    expect(matchParties("  ", c, s)).toEqual([]);
  });
});

describe("cleanBotToken", () => {
  const token = "123456789:AAFakeTokenForTestsOnly_abcdefghijk";
  it("takes the token out of whatever was pasted", () => {
    expect(cleanBotToken(token)).toBe(token);
    expect(cleanBotToken(`  \u200f${token}\u200e\n`)).toBe(token);
    expect(cleanBotToken(`Done! ...\nUse this token to access the HTTP API:\n${token}\nKeep your token secure`)).toBe(token);
    expect(cleanBotToken("١٢٣٤٥٦٧٨٩:AAFakeTokenForTestsOnly_abcdefghijk")).toBe(token);
  });
  it("rejects text without a token", () => {
    expect(cleanBotToken("")).toBeNull();
    expect(cleanBotToken("starnet_reps_bot")).toBeNull();
    expect(cleanBotToken("123:abc")).toBeNull();
  });
});
