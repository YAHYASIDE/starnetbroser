import { describe, expect, it } from "vitest";
import {
  buildBalanceReminderMessage,
  buildExpiryReminderMessage,
  buildWhatsAppLink,
  normalizePhoneForWhatsApp,
} from "./whatsapp";

describe("normalizePhoneForWhatsApp", () => {
  it("strips spaces, dashes and a leading + from a full international number", () => {
    expect(normalizePhoneForWhatsApp("+222 12 34 56 78")).toBe("22212345678");
  });

  it("strips a leading 00 international-dialing prefix", () => {
    expect(normalizePhoneForWhatsApp("0022212345678")).toBe("22212345678");
  });

  it("returns null for an empty or missing phone", () => {
    expect(normalizePhoneForWhatsApp("")).toBeNull();
    expect(normalizePhoneForWhatsApp(undefined)).toBeNull();
  });

  it("returns null for a string too short to plausibly be a real number", () => {
    expect(normalizePhoneForWhatsApp("123")).toBeNull();
  });
});

describe("buildWhatsAppLink", () => {
  it("returns a plain wa.me link with no message", () => {
    expect(buildWhatsAppLink("22212345678")).toBe("https://wa.me/22212345678");
  });

  it("url-encodes a pre-filled message", () => {
    const link = buildWhatsAppLink("22212345678", "مرحبًا");
    expect(link).toBe(`https://wa.me/22212345678?text=${encodeURIComponent("مرحبًا")}`);
  });

  it("returns null when the phone doesn't normalize to a usable number", () => {
    expect(buildWhatsAppLink(undefined, "hello")).toBeNull();
    expect(buildWhatsAppLink("", "hello")).toBeNull();
  });
});

describe("reminder message builders", () => {
  it("mentions the account name and 'tonight' in the expiry reminder", () => {
    const message = buildExpiryReminderMessage("مقهى النخيل");
    expect(message).toContain("مقهى النخيل");
    expect(message).toContain("الليلة");
  });

  it("mentions the account name, the exact balance/currency and the payment numbers in the balance reminder", () => {
    const message = buildBalanceReminderMessage("مقهى النخيل", "12.50", "$");
    expect(message).toContain("مقهى النخيل");
    expect(message).toContain("$12.50");
    expect(message).toContain("22227268");
    expect(message).toContain("74646158");
  });
});
