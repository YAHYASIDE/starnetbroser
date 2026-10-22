import { describe, expect, it } from "vitest";
import { activationDateLabel, buildActivationMessage, missingActivationFields } from "./activationMessage";

const base = {
  name: "demo-device",
  expectedEmail: "demo.user@example.com",
  expectedEmailPassword: "MailPass1",
  wifiPassword: "WifiPass1",
  kitNumber: "KIT000111",
  serialNumber: "",
  subscriptionId: "SL-000-111",
  accountNumber: "ACC-000-111",
};

describe("buildActivationMessage", () => {
  it("fills his message word for word", () => {
    const text = buildActivationMessage(base, "زبون تجريبي", new Date(2026, 8, 18));
    expect(text).toBe(
      [
        "*⭐ STAR NET*",
        "*تم تفعيل جهاز Starlink بنجاح بتاريخ: 18 / 9 / 2026*",
        "",
        "*بيانات الحساب*",
        "- *اسم العميل*: زبون تجريبي",
        "- *البريد الإلكتروني*: demo.user@example.com",
        "- *كلمة مرور البريد الإلكتروني*: MailPass1",
        "- *كلمة مرور شبكة Wi-Fi*: WifiPass1",
        "- *الرقم التسلسلي KIT*: KIT000111",
        "- *رقم الاشتراك*: SL-000-111",
        "- *رقم الحساب ACC*: ACC-000-111",
        "",
        "*في حال وجود خطأ في المعلومات تواصل مع فريق الدعم*",
        "*واتساب الدعم:* https://wa.me/22374646158",
        "*البريد الإلكتروني للدعم:*",
        "starnet.om@gmail.com",
      ].join("\n"),
    );
  });

  it("keeps his placeholders for what Starlink hasn't given yet and drops lines he never entered", () => {
    const text = buildActivationMessage(
      { ...base, kitNumber: "", subscriptionId: "", accountNumber: "", wifiPassword: "", expectedEmailPassword: undefined },
      undefined,
      new Date(2026, 9, 2),
    );
    expect(text).toContain("بتاريخ: 2 / 10 / 2026");
    expect(text).toContain("- *اسم العميل*: demo-device");
    expect(text).toContain("- *الرقم التسلسلي KIT*: [ارسل صورة الـ KIT]");
    expect(text).toContain("- *رقم الاشتراك*: [ارسل صورة الاشتراك]");
    expect(text).toContain("- *رقم الحساب ACC*: [ارسل صورة الحساب]");
    expect(text).not.toContain("Wi-Fi");
    expect(text).not.toContain("كلمة مرور البريد");
  });

  it("uses the serial when there is no KIT", () => {
    expect(buildActivationMessage({ ...base, kitNumber: "", serialNumber: "SN123" }, "x", new Date())).toContain("KIT*: SN123");
  });
});

describe("missingActivationFields", () => {
  it("lists only the values a sync reads", () => {
    expect(missingActivationFields(base)).toEqual([]);
    expect(missingActivationFields({ ...base, subscriptionId: "", accountNumber: " " })).toEqual(["subscription", "account"]);
  });

  it("formats his date style", () => {
    expect(activationDateLabel(new Date(2026, 0, 5))).toBe("5 / 1 / 2026");
  });
});
