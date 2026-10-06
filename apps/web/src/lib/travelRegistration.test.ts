import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { travelWhatsAppLink, groupTravelByOwner, buildTravelCheckReport, buildTravelRegistrationMessage, isTravelPending, isTravelVerified, markTravelDone, needsTravelRegistration, setTravelPrice, travelDoneRepMessage, travelDueArabic, travelEarnings, undoTravelDone } from "./travelRegistration";

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

  it("the WhatsApp message names the device by its Starlink email (his rule), the name only without one", () => {
    const withEmail = decodeURIComponent(travelWhatsAppLink(dev("a", { name: "اسم داخلي", expectedEmail: "demo@example.com", travelRegistrationDue: "October 15" }), "+222 12345678"));
    expect(withEmail).toContain("«demo@example.com»");
    expect(withEmail).not.toContain("اسم داخلي");
    expect(decodeURIComponent(travelWhatsAppLink(dev("b", { name: "جهاز ب" }), undefined))).toContain("«جهاز ب»");
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
    expect(keyboard.inline_keyboard).toHaveLength(2);
    expect(keyboard.inline_keyboard[0][0].text).toBe("💬 واتساب جهاز a");
    expect(keyboard.inline_keyboard[0][0].url).toMatch(/^https:\/\/wa\.me\/22212345678\?text=/);
    // no number: WhatsApp opens on the message and he picks the contact
    expect(keyboard.inline_keyboard[1][0].text).toBe("💬 واتساب جهاز c (اختر الرقم)");
    expect(keyboard.inline_keyboard[1][0].url).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });

  it("nothing found says so, without buttons", () => {
    const report = buildTravelCheckReport("يوم 1", ["b"], [dev("b")], () => undefined);
    expect(report.found).toBe(0);
    expect(report.replyMarkup).toBeUndefined();
    expect(report.text).toContain("✅ لا جهاز يحتاج توثيقًا");
  });
});

describe("✅ «اكتمل التوثيق»", () => {
  const flagged = dev("a", { travelRegistrationRequired: true, travelRegistrationDue: "October 15", expectedEmail: "a@example.com" });

  it("stays in the list ⏳ until an update confirms; «لم يتم» undoes it", () => {
    expect(needsTravelRegistration(flagged)).toBe(true);
    const done = { ...flagged, ...markTravelDone(flagged, new Date("2026-10-07T10:00:00Z")) };
    expect(done).toMatchObject({ travelRegistrationDoneFor: "October 15", travelRegistrationDoneAt: "2026-10-07T10:00:00.000Z" });
    expect(needsTravelRegistration(done)).toBe(true);
    expect(isTravelPending(done)).toBe(true);
    // Starlink asks again with another date → no longer pending
    expect(isTravelPending({ ...done, travelRegistrationDue: "November 15" })).toBe(false);
    expect(isTravelPending({ ...done, ...undoTravelDone() })).toBe(false);
  });

  it("works when Starlink printed no date", () => {
    const noDate = dev("b", { travelRegistrationRequired: true });
    expect(isTravelPending({ ...noDate, ...markTravelDone(noDate) })).toBe(true);
  });

  it("«تم توثيقها»: confirmed devices, with what he charged per currency", () => {
    const verified = (id: string, price?: { amount: number; currency: string }) =>
      dev(id, { travelRegistrationRequired: false, travelRegistrationVerifiedAt: "2026-10-08T00:00:00Z", travelRegistrationPrice: price ?? null });
    const accounts = [verified("a", { amount: 500, currency: "MRU" }), verified("b", { amount: 700, currency: "MRU" }), verified("c", { amount: 10, currency: "USD" }), verified("d"), flagged];
    expect(isTravelVerified(accounts[0]!)).toBe(true);
    expect(isTravelVerified(flagged)).toBe(false);
    expect(travelEarnings(accounts)).toEqual({ count: 4, byCurrency: { MRU: 1200, USD: 10 }, unpriced: 1 });
    expect(setTravelPrice(300, "MRU")).toEqual({ travelRegistrationPrice: { amount: 300, currency: "MRU" } });
    expect(setTravelPrice(0, "MRU")).toEqual({ travelRegistrationPrice: null });
  });

  it("tells the rep which device is done", () => {
    expect(travelDoneRepMessage(flagged)).toBe("✅ تم توثيق جهاز «جهاز a»\n📧 a@example.com\nلن تتوقف خدمته خارج البلد - يمكنك إخبار الزبون.");
  });
});

describe("👥 his devices apart from each rep's", () => {
  it("mine first, then each rep under his name", () => {
    const reps = { r1: { id: "r1", name: "مندوب أ" } } as unknown as Parameters<typeof groupTravelByOwner>[1];
    const groups = groupTravelByOwner([dev("x", { representativeId: "r1" }), dev("m"), dev("y", { representativeId: "r1" }), dev("z", { representativeId: "gone" })], reps);
    expect(groups.map((g) => [g.label, g.accounts.map((a) => a.id)])).toEqual([
      ["🏠 أجهزتي", ["m"]],
      ["📱 مندوب أ", ["x", "y"]],
      ["📱 مندوب محذوف", ["z"]],
    ]);
  });
});
