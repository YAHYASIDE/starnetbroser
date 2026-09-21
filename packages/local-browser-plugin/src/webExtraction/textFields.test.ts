import { describe, expect, it } from "vitest";
import {
  BALANCE_LABELS,
  PLAN_LABELS,
  RENEWAL_DATE_LABELS,
  extractAccountEmail,
  extractBalance,
  extractDataUsageGb,
  extractLabeledValue,
  extractRenewalBadgeDate,
  extractSubscriptionId,
  hasActivePlanBadge,
  hasStandbyBanner,
  isCompleteDate,
  normalizeDateLike,
} from "./textFields";

// Fake/dummy line arrays only - none of this is real Starlink account data.

describe("extractLabeledValue - forward-lookahead robustness", () => {
  it("skips an action-button line ('Manage') to find the real value further down", () => {
    const lines = ["Plan", "Manage", "Residential"];
    expect(extractLabeledValue(lines, PLAN_LABELS)).toBe("Residential");
  });

  it("skips an Arabic action-button line ('إدارة') the same way", () => {
    const lines = ["الخطة", "إدارة", "سكني"];
    expect(extractLabeledValue(lines, PLAN_LABELS)).toBe("سكني");
  });

  it("skips a line that is actually a different field's label, not this field's value", () => {
    // Matches a real card layout: the plan's bare label, an unrelated "Manage" button, then the
    // NEXT field's own label+value on one line, and only THEN the plan's actual value.
    const lines = ["خطة الخدمة", "إدارة", "النهاية ٢٠٢٦/٩/٢٨", "التجوال - غير محدود"];
    expect(extractLabeledValue(lines, PLAN_LABELS)).toBe("التجوال - غير محدود");
    // "النهاية" is deliberately NOT a usable RENEWAL_DATE_LABELS entry (see
    // extractRenewalBadgeDate below) - only still recognized as *someone else's* label line, so
    // planName's own lookahead correctly skips over it.
    expect(extractLabeledValue(lines, RENEWAL_DATE_LABELS)).toBeUndefined();
  });

  it("never returns the Manage button or the other field's line as the plan name", () => {
    const lines = ["خطة الخدمة", "إدارة", "النهاية ٢٠٢٦/٩/٢٨", "التجوال - غير محدود"];
    const planName = extractLabeledValue(lines, PLAN_LABELS);
    expect(planName).not.toBe("إدارة");
    expect(planName).not.toContain("٢٠٢٦");
  });
});

describe("normalizeDateLike", () => {
  it("converts Arabic-Indic digits and zero-pads month/day", () => {
    expect(normalizeDateLike("٢٠٢٦/٩/٢٨")).toBe("2026/09/28");
  });

  it("leaves an already zero-padded Western date unchanged", () => {
    expect(normalizeDateLike("2026/09/28")).toBe("2026/09/28");
  });

  it("zero-pads a single-digit Western month and day", () => {
    expect(normalizeDateLike("2026/9/8")).toBe("2026/09/08");
  });

  it("passes through unrecognized shapes unchanged (after digit conversion)", () => {
    expect(normalizeDateLike("منتهي")).toBe("منتهي");
  });

  it("leaves a truncated year/month (no day) unchanged - never invents a day", () => {
    // Reproduces a real bug: if a page splits a date's year/month from its day across separate
    // text nodes, the label match can only ever capture "٢٠٢٦/٩" - this must never become a
    // silently-wrong "2026/09" that looks like a real, complete date.
    expect(normalizeDateLike("في ٢٠٢٦/٩")).toBe("في 2026/9");
  });
});

describe("isCompleteDate - the last line of defense before a renewal date is ever stored", () => {
  it("accepts a clean, fully zero-padded YYYY/MM/DD", () => {
    expect(isCompleteDate("2026/09/28")).toBe(true);
  });

  it("rejects a truncated year/month with no day - the exact shape a split date node produces", () => {
    expect(isCompleteDate("في 2026/9")).toBe(false);
    expect(isCompleteDate("2026/9")).toBe(false);
  });

  it("rejects anything that isn't a date at all", () => {
    expect(isCompleteDate("منتهي")).toBe(false);
  });

  it("rejects a non-zero-padded date - normalizeDateLike must have already run", () => {
    expect(isCompleteDate("2026/9/28")).toBe(false);
  });
});

describe("extractRenewalBadgeDate - narrow same-line match only, never a generic 'النهاية' label", () => {
  it("reads the date from the exact 'النهاية <date>' badge shape", () => {
    expect(extractRenewalBadgeDate(["النهاية ٢٠٢٦/٩/٢٨"])).toBe("2026/9/28");
  });

  it("never matches an unrelated line elsewhere on the page that merely contains the word 'النهاية'", () => {
    // Reproduces the real bug this round fixed: a real page can use "النهاية" in unrelated
    // prose/promotions with its own, completely unrelated date - that must never be picked up as
    // the account's renewal date.
    const lines = ["عرض ينتهي في النهاية بتاريخ ٢٠٢٦/٩/١٠", "الخطة", "التجوال - غير محدود"];
    // No "النهاية <date>" adjacency here (extra words in between), so nothing matches.
    expect(extractRenewalBadgeDate(lines)).toBeUndefined();
  });
});

describe("hasStandbyBanner", () => {
  it("detects the real 'service will end' banner", () => {
    expect(hasStandbyBanner(["من المقرر أن تنتهي خدمتك في ٢٠٢٦/٩/٢٨."])).toBe(true);
  });

  it("returns false when the banner isn't present", () => {
    expect(hasStandbyBanner(["الرصيد المستحق", "$US 0.00"])).toBe(false);
  });
});

describe("hasActivePlanBadge - scoped near 'خطة الخدمة', never a bare 'نشط' anywhere on the page", () => {
  it("detects the 'نشط' badge right after the plan section label", () => {
    const lines = ["خطة الخدمة", "إدارة", "نشط", "التجوال - غير محدود"];
    expect(hasActivePlanBadge(lines)).toBe(true);
  });

  it("returns false when 'خطة الخدمة' isn't on the page at all", () => {
    expect(hasActivePlanBadge(["نشط", "شيء آخر تمامًا"])).toBe(false);
  });

  it("never matches 'نشط' embedded in an unrelated sentence far from the plan section", () => {
    const lines = ["خطة الخدمة", "إدارة", "النهاية ٢٠٢٦/٩/٢٨", "التجوال - غير محدود", "الجهاز نشط ومتصل الآن"];
    expect(hasActivePlanBadge(lines)).toBe(false);
  });
});

describe("extractBalance - never scans the whole page", () => {
  it("finds the amount near a balance label", () => {
    const lines = ["Outstanding Balance", "$0.00"];
    expect(extractBalance(lines)).toEqual({ amount: "0.00", currency: "USD" });
  });

  it("returns undefined when there is no balance label at all, even if some other amount is on the page", () => {
    // e.g. the plan's price - must never be mistaken for the account balance.
    const lines = ["Plan", "Residential", "$49.99 / month"];
    expect(extractBalance(lines)).toBeUndefined();
  });

  it("does not fall back to an unrelated amount elsewhere on the page when the label's own lines have none", () => {
    const lines = [...BALANCE_LABELS.slice(0, 1), "see below for details", "$49.99 / month (plan price)"];
    expect(extractBalance(lines)).toBeUndefined();
  });

  it("skips a 'ادفع'/Pay button sitting between the label and the amount (real Billing-page layout)", () => {
    const lines = ["الرصيد المستحق", "ادفع", "$US 25.00"];
    expect(extractBalance(lines)).toEqual({ amount: "25.00", currency: "USD" });
  });

  it("skips an English 'Pay' button the same way", () => {
    const lines = ["Outstanding Balance", "Pay", "$25.00"];
    expect(extractBalance(lines)).toEqual({ amount: "25.00", currency: "USD" });
  });

  it("still refuses to scan past the first non-money, non-button line after the label", () => {
    const lines = ["الرصيد المستحق", "ادفع", "see your invoice for details", "$49.99 / month (unrelated plan price)"];
    expect(extractBalance(lines)).toBeUndefined();
  });
});

describe("extractSubscriptionId - unlabeled 'SL-...' shape", () => {
  it("finds an SL- id anywhere on the page, like accountNumber's ACC- fallback", () => {
    expect(extractSubscriptionId("الاشتراك\nSL-XX-11112222-33334-44")).toBe("SL-XX-11112222-33334-44");
  });

  it("returns undefined when there is no SL- shaped id on the page at all", () => {
    expect(extractSubscriptionId("Welcome to your account")).toBeUndefined();
  });

  it("never confuses an ACC- account number with an SL- subscription id", () => {
    expect(extractSubscriptionId("ACC-11223344")).toBeUndefined();
  });
});

describe("extractDataUsageGb", () => {
  it("pulls just the number out of a Western-digit 'N GB' value", () => {
    expect(extractDataUsageGb(["Total Usage", "261 GB"])).toBe("261");
  });

  it("pulls the number out of an Arabic-Indic-digit 'جيجابايت' value", () => {
    expect(extractDataUsageGb(["إجمالي استهلاك الباقة", "٢٦١ جيجابايت"])).toBe("261");
  });

  it("returns undefined when there is no usage label on the page at all", () => {
    expect(extractDataUsageGb(["Welcome to your account"])).toBeUndefined();
  });
});

describe("extractAccountEmail - Settings page, never the phone number on the same page", () => {
  it("reads the email from its own Arabic-labeled line", () => {
    const lines = ["البريد الإلكتروني", "test.holder@example.com"];
    expect(extractAccountEmail(lines)).toBe("test.holder@example.com");
  });

  it("reads the email from its own English-labeled line", () => {
    const lines = ["Email", "test.holder@example.com"];
    expect(extractAccountEmail(lines)).toBe("test.holder@example.com");
  });

  it("never mistakes the phone number on the same Settings page for an email", () => {
    const lines = ["البريد الإلكتروني", "test.holder@example.com", "رقم الهاتف", "+22212345678"];
    expect(extractAccountEmail(lines)).toBe("test.holder@example.com");
  });

  it("discards a value that doesn't actually look like an email, rather than fabricating one", () => {
    const lines = ["البريد الإلكتروني", "+22212345678"];
    expect(extractAccountEmail(lines)).toBeUndefined();
  });

  it("returns undefined when there is no email label on the page at all", () => {
    expect(extractAccountEmail(["Welcome to your account"])).toBeUndefined();
  });
});
