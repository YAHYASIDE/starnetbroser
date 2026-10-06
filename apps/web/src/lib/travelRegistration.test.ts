import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { buildTravelCheckReport, buildTravelRegistrationMessage, travelDueArabic } from "./travelRegistration";

const dev = (id: string, extra: Partial<StarlinkAccountSummary> = {}) => ({ id, name: `جهاز ${id}`, ...extra }) as StarlinkAccountSummary;

describe("🛂 travel registration", () => {
  it("writes Starlink's date in Arabic", () => {
    expect(travelDueArabic("October 15")).toBe("15 أكتوبر");
    expect(travelDueArabic("Nov. 3")).toBe("3 نوفمبر");
    expect(travelDueArabic("15 octobre")).toBe("15 أكتوبر");
    expect(travelDueArabic("1 février")).toBe("1 فبراير");
    expect(travelDueArabic("")).toBe("الموعد المحدد");
    expect(travelDueArabic("15 أكتوبر")).toBe("15 أكتوبر");
  });

  it("the customer message names the device, the date and the account closing", () => {
    const text = buildTravelRegistrationMessage("جهاز أ", "October 15");
    expect(text).toContain("«جهاز أ»");
    expect(text).toContain("قبل 15 أكتوبر");
    expect(text).toContain("سيُغلق الحساب");
  });

  it("one report: only the devices that need it, with a WhatsApp button each", () => {
    const accounts = [
      dev("a", { travelRegistrationRequired: true, travelRegistrationDue: "October 15", expectedEmail: "a@example.com" }),
      dev("b", { travelRegistrationRequired: false }),
      dev("c", { travelRegistrationRequired: true }),
    ];
    const report = buildTravelCheckReport("يوم 1", ["a", "b", "c"], accounts, (a) => (a.id === "a" ? "+222 12345678" : undefined), 1);
    expect(report.found).toBe(2);
    expect(report.text).toContain("فُحص 3 جهاز · يحتاج توثيق: 2 · لم يُفحص 1");
    expect(report.text).toContain("1) جهاز a\n📧 a@example.com\n📱 +222 12345678\n⏰ قبل 15 أكتوبر");
    expect(report.text).toContain("2) جهاز c\n📧 بلا بريد\n📱 بلا رقم");
    const keyboard = JSON.parse(report.replyMarkup!);
    expect(keyboard.inline_keyboard).toHaveLength(1);
    expect(keyboard.inline_keyboard[0][0].text).toBe("💬 واتساب جهاز a");
    expect(keyboard.inline_keyboard[0][0].url).toMatch(/^https:\/\/wa\.me\/22212345678\?text=/);
  });

  it("nothing found says so, without buttons", () => {
    const report = buildTravelCheckReport("يوم 1", ["b"], [dev("b")], () => undefined);
    expect(report.found).toBe(0);
    expect(report.replyMarkup).toBeUndefined();
    expect(report.text).toContain("✅ لا جهاز يحتاج توثيقًا");
  });
});
