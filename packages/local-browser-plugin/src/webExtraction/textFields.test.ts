import { describe, expect, it } from "vitest";
import {
  BALANCE_LABELS,
  PLAN_LABELS,
  RENEWAL_DATE_LABELS,
  extractAccountEmail,
  extractBalance,
  extractBillingDueDay,
  extractDataUsageGb,
  extractLabeledValue,
  extractPhoneNumber,
  extractPlanBadgeStatus,
  extractPlanName,
  extractRenewalBadgeDate,
  extractSubscriptionId,
  extractSubscriptionInvoiceDueDay,
  hasBillingSuspensionBanner,
  hasScheduledEndBanner,
  isCompleteDate,
  isOnAccountHomePage,
  nextOccurrenceOfDay,
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

describe("hasScheduledEndBanner", () => {
  it("detects the real 'service will end' banner", () => {
    expect(hasScheduledEndBanner(["من المقرر أن تنتهي خدمتك في ٢٠٢٦/٩/٢٨."])).toBe(true);
  });

  it("returns false when the banner isn't present", () => {
    expect(hasScheduledEndBanner(["الرصيد المستحق", "$US 0.00"])).toBe(false);
  });
});

describe("hasBillingSuspensionBanner", () => {
  it("detects the real billing-suspension banner", () => {
    const lines = ["تم تعطيل خدمتك بسبب مشكلة في الفوترة.", "يرجى التأكد من دفع جميع الفواتير."];
    expect(hasBillingSuspensionBanner(lines)).toBe(true);
  });

  it("returns false when the banner isn't present", () => {
    expect(hasBillingSuspensionBanner(["الرصيد المستحق", "$US 0.00"])).toBe(false);
  });

  it("never confuses this with the different scheduled-end banner (mutually exclusive real page states)", () => {
    expect(hasBillingSuspensionBanner(["من المقرر أن تنتهي خدمتك في ٢٠٢٦/٩/٢٨."])).toBe(false);
  });

  it("never matches a bare 'تعطيل خدمتك' with no reason clause (real, confirmed false positive)", () => {
    // A never-suspended account came back "suspended" from this shorter fragment alone - most
    // likely a self-service "disable the service" menu action or reassuring copy elsewhere on the
    // page, not a report that the service is already off. Requiring "بسبب" right after fixes it.
    expect(hasBillingSuspensionBanner(["تعطيل خدمتك", "تعطيل الخدمة", "يمكنك تعطيل خدمتك مؤقتًا من هنا"])).toBe(false);
  });
});

describe("isOnAccountHomePage", () => {
  it("recognizes the real, unlabeled '<name> • ACC-...' line", () => {
    expect(isOnAccountHomePage(["bella ag d • ACC-DF-15875975-23289-67", "الرصيد المستحق"])).toBe(true);
  });

  it("returns false for a page with no such line (e.g. the Billing page)", () => {
    expect(isOnAccountHomePage(["فوترة", "الرصيد المستحق", "$US 25.00"])).toBe(false);
  });

  it("returns false for a labeled account-number line, which has a different shape", () => {
    expect(isOnAccountHomePage(["رقم الحساب", "ACC-11223344"])).toBe(false);
  });
});

describe("extractSubscriptionInvoiceDueDay - real Billing-page invoice list, once the billing cycle itself has gone blank", () => {
  it("reads the day from the first 'اشتراك'-described invoice row, never a 'طلب' row", () => {
    const lines = [
      "الحالة", "الوصف", "تاريخ الاستحقاق",
      "متأخر", "طلب", "2026/8/29",
      "متأخر", "اشتراك", "2026/8/28",
      "مدفوع", "اشتراك", "2026/7/28",
    ];
    expect(extractSubscriptionInvoiceDueDay(lines)).toBe(28);
  });

  it("returns undefined when there is no 'اشتراك' row at all", () => {
    const lines = ["الحالة", "الوصف", "تاريخ الاستحقاق", "متأخر", "طلب", "2026/8/29"];
    expect(extractSubscriptionInvoiceDueDay(lines)).toBeUndefined();
  });

  it("tries the next 'اشتراك' row when the nearest one has no parseable date nearby", () => {
    const lines = ["اشتراك", "بلا تاريخ", "اشتراك", "2026/7/28"];
    expect(extractSubscriptionInvoiceDueDay(lines)).toBe(28);
  });
});

describe("extractPlanBadgeStatus - scoped near 'خطة الخدمة', never a bare status word anywhere on the page", () => {
  it("detects the 'نشط' badge right after the plan section label", () => {
    const lines = ["خطة الخدمة", "إدارة", "نشط", "التجوال - غير محدود"];
    expect(extractPlanBadgeStatus(lines)).toBe("active");
  });

  it("detects the real standby badge wording ('وضع الاستعداد قيد التعليق') - a real, confirmed miss", () => {
    const lines = ["خطة الخدمة", "إدارة", "وضع الاستعداد قيد التعليق", "التجوال - غير محدود"];
    expect(extractPlanBadgeStatus(lines)).toBe("standby");
  });

  it("returns undefined when 'خطة الخدمة' isn't on the page at all", () => {
    expect(extractPlanBadgeStatus(["نشط", "شيء آخر تمامًا"])).toBeUndefined();
  });

  it("never matches 'نشط' embedded in an unrelated sentence far from the plan section", () => {
    const lines = ["خطة الخدمة", "إدارة", "النهاية ٢٠٢٦/٩/٢٨", "التجوال - غير محدود", "الجهاز نشط ومتصل الآن"];
    expect(extractPlanBadgeStatus(lines)).toBeUndefined();
  });

  it("detects the diacritic-marked 'مُعلَّق' (suspended-for-billing) badge - real, confirmed miss", () => {
    // The real page renders this badge WITH Arabic tashkeel marks - same base letters as
    // SUSPENDED_WORDS' plain "معلق" but a bare .includes() never matches through the marks.
    const lines = ["خطة الخدمة", "إدارة", "مُعلَّق", "التجوال - غير محدود"];
    expect(extractPlanBadgeStatus(lines)).toBe("suspended");
  });
});

describe("extractPlanName - never returns the status badge word as if it were the plan name", () => {
  it("skips the 'نشط' badge and returns the real plan name after it (real, confirmed bug)", () => {
    const lines = ["خطة الخدمة", "إدارة", "نشط", "التجوال - غير محدود"];
    expect(extractPlanName(lines)).toBe("التجوال - غير محدود");
  });

  it("skips the standby badge wording too and still finds the real plan name", () => {
    const lines = ["خطة الخدمة", "إدارة", "وضع الاستعداد قيد التعليق", "التجوال - غير محدود"];
    expect(extractPlanName(lines)).toBe("التجوال - غير محدود");
  });

  it("returns the plan name directly when there is no status badge at all", () => {
    const lines = ["Plan", "Residential"];
    expect(extractPlanName(lines)).toBe("Residential");
  });

  it("skips the diacritic-marked 'مُعلَّق' badge too, rather than storing it as the plan name (real bug)", () => {
    const lines = ["خطة الخدمة", "إدارة", "مُعلَّق", "التجوال - غير محدود"];
    expect(extractPlanName(lines)).toBe("التجوال - غير محدود");
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

  it("finds a non-USD, comma-grouped balance (real bug: an ARS-billed account came back 'not found')", () => {
    const lines = ["الرصيد المستحق", "ARS 137,861.11"];
    expect(extractBalance(lines)).toEqual({ amount: "137861.11", currency: "ARS" });
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

describe("extractPhoneNumber - Settings page contact number", () => {
  it("reads the phone from its own Arabic-labeled line", () => {
    const lines = ["رقم الهاتف", "+22212345678"];
    expect(extractPhoneNumber(lines)).toBe("+22212345678");
  });

  it("reads the phone from its own English-labeled line", () => {
    const lines = ["Phone", "+22212345678"];
    expect(extractPhoneNumber(lines)).toBe("+22212345678");
  });

  it("never mistakes the email on the same Settings page for a phone number", () => {
    const lines = ["البريد الإلكتروني", "test.holder@example.com", "رقم الهاتف", "+22212345678"];
    expect(extractPhoneNumber(lines)).toBe("+22212345678");
  });

  it("discards a value that doesn't actually look like a phone number, rather than fabricating one", () => {
    const lines = ["رقم الهاتف", "test.holder@example.com"];
    expect(extractPhoneNumber(lines)).toBeUndefined();
  });

  it("returns undefined when there is no phone label on the page at all", () => {
    expect(extractPhoneNumber(["Welcome to your account"])).toBeUndefined();
  });
});

describe("extractBillingDueDay - bare recurring day, deliberately no year", () => {
  it("reads just the day number from the real Billing-cycle line", () => {
    const lines = ["دورة الفوترة", "فترة الفوترة هي ٢٨ أغسطس - ٢٧ سبتمبر.", "تاريخ استحقاق الدفع: ٢٨ أغسطس."];
    expect(extractBillingDueDay(lines)).toBe(28);
  });

  it("returns undefined when the label isn't on the page at all", () => {
    expect(extractBillingDueDay(["Welcome to your account"])).toBeUndefined();
  });
});

describe("nextOccurrenceOfDay - always the upcoming due date, whatever month it's synced in", () => {
  it("stays in the current month when the day hasn't passed yet", () => {
    expect(nextOccurrenceOfDay(28, new Date(2026, 8, 21))).toBe("2026/09/28"); // Sept 21 -> Sept 28
  });

  it("rolls over to next month when the day already passed", () => {
    expect(nextOccurrenceOfDay(10, new Date(2026, 8, 21))).toBe("2026/10/10"); // Sept 21 -> Oct 10
  });

  it("rolls over the year at December", () => {
    expect(nextOccurrenceOfDay(5, new Date(2026, 11, 21))).toBe("2027/01/05"); // Dec 21 -> Jan 5, 2027
  });

  it("clamps to the last real day of a target month that doesn't have that many days", () => {
    // April only has 30 days - day 31 must never produce an invalid "2026/04/31".
    expect(nextOccurrenceOfDay(31, new Date(2026, 3, 1))).toBe("2026/04/30");
  });
});
