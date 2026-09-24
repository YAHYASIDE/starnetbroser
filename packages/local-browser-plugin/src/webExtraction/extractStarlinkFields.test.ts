// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extractStarlinkFields } from "./extractStarlinkFields";
import { nextOccurrenceOfDay } from "./textFields";

// Every fixture below is fake/dummy data made up for this test - none of it is a real Starlink
// account, matching this project's "no real account data anywhere" rule.

const ENGLISH_PAGE = `
  <div class="devices-section">
    <div class="row"><div>Starlink Dish</div><div aria-label="Online" class="dot"></div></div>
    <div class="row"><div>Wi-Fi</div><div aria-label="Offline" class="dot"></div></div>
  </div>
  <div class="subscriptions-section">
    <div>Service Status: Active</div>
    <div>Plan: Residential</div>
    <div class="row"><div>Next Due Date</div><div>2026/09/28</div></div>
  </div>
  <div class="billing-section">
    <div class="row"><div>Outstanding Balance</div><div>$0.00</div></div>
  </div>
  <div class="identifiers-section">
    <div class="row"><div>Account Number</div><div>ACC-99887766</div></div>
    <div class="row"><div>Starlink ID</div><div>UNIT-55443322</div></div>
    <div class="row"><div>Serial Number</div><div>SN123456789</div></div>
    <div class="row"><div>KIT Number</div><div>KIT-000111</div></div>
  </div>
`;

const ARABIC_PAGE = `
  <div dir="rtl" class="devices-section">
    <div class="row"><div>الطبق</div><div aria-label="متصل" class="dot"></div></div>
    <div class="row"><div>واي فاي</div><div aria-label="غير متصل" class="dot"></div></div>
  </div>
  <div class="subscriptions-section">
    <div>حالة الخدمة: نشط</div>
    <div>الخطة: سكني</div>
    <div class="row"><div>تاريخ الاستحقاق التالي</div><div>2026/09/28</div></div>
  </div>
  <div class="billing-section">
    <div class="row"><div>الرصيد المستحق</div><div>٠,٠٠ USD</div></div>
  </div>
  <div class="identifiers-section">
    <div class="row"><div>رقم الحساب</div><div>ACC-11223344</div></div>
    <div class="row"><div>معرف ستارلينك</div><div>UNIT-99988877</div></div>
    <div class="row"><div>الرقم التسلسلي</div><div>SN000111222</div></div>
    <div class="row"><div>رقم KIT</div><div>KIT-333444</div></div>
  </div>
`;

function extractFrom(html: string) {
  document.body.innerHTML = html;
  return extractStarlinkFields(document);
}

describe("extractStarlinkFields - English page", () => {
  const fields = extractFrom(ENGLISH_PAGE);

  it("reads device status from colored, aria-labeled dots", () => {
    expect(fields.dishStatus).toBe("online");
    expect(fields.wifiStatus).toBe("offline");
  });

  it("normalizes the subscription status to a fixed value", () => {
    expect(fields.serviceStatus).toBe("active");
  });

  it("reads the plan name and renewal date", () => {
    expect(fields.planName).toBe("Residential");
    expect(fields.renewalDate).toBe("2026/09/28");
  });

  it("treats a $0.00 balance as a real, confirmed zero - not absent", () => {
    expect(fields.balanceDue).toBe("0.00");
    expect(fields.currency).toBe("USD");
  });

  it("keeps accountNumber and starlinkId as separate, unconfused fields", () => {
    expect(fields.accountNumber).toBe("ACC-99887766");
    expect(fields.starlinkId).toBe("UNIT-55443322");
    expect(fields.accountNumber).not.toBe(fields.starlinkId);
  });

  it("reads serial and KIT numbers independently", () => {
    expect(fields.serialNumber).toBe("SN123456789");
    expect(fields.kitNumber).toBe("KIT-000111");
  });

  it("never fabricates an account holder name when the page has none", () => {
    expect(fields).not.toHaveProperty("accountHolderName");
  });
});

describe("extractStarlinkFields - Arabic page", () => {
  const fields = extractFrom(ARABIC_PAGE);

  it("reads device status from Arabic aria-labeled dots", () => {
    expect(fields.dishStatus).toBe("online");
    expect(fields.wifiStatus).toBe("offline");
  });

  it("normalizes an Arabic subscription status to the same fixed value", () => {
    expect(fields.serviceStatus).toBe("active");
  });

  it("reads the Arabic plan name and renewal date", () => {
    expect(fields.planName).toBe("سكني");
    expect(fields.renewalDate).toBe("2026/09/28");
  });

  it("parses an Arabic-Indic-digit balance correctly", () => {
    expect(fields.balanceDue).toBe("0.00");
    expect(fields.currency).toBe("USD");
  });

  it("keeps Arabic-labeled accountNumber and starlinkId separate", () => {
    expect(fields.accountNumber).toBe("ACC-11223344");
    expect(fields.starlinkId).toBe("UNIT-99988877");
  });

  it("reads Arabic-labeled serial and KIT numbers", () => {
    expect(fields.serialNumber).toBe("SN000111222");
    expect(fields.kitNumber).toBe("KIT-333444");
  });
});

describe("extractStarlinkFields - real Starlink card layout (round 6 regression)", () => {
  it("reads the plan name and normalized renewal date, skipping the Manage button and the other field's label line", () => {
    const fields = extractFrom(`
      <div class="subscriptions-section">
        <div>خطة الخدمة</div>
        <div>إدارة</div>
        <div>النهاية ٢٠٢٦/٩/٢٨</div>
        <div>التجوال - غير محدود</div>
      </div>
    `);

    expect(fields.planName).toBe("التجوال - غير محدود");
    expect(fields.renewalDate).toBe("2026/09/28");
    expect(fields.planName).not.toBe("إدارة");
    expect(fields.planName).not.toContain("٢٠٢٦");
  });
});

describe("extractStarlinkFields - real Starlink home-page banner (round 7 regression)", () => {
  // Fixture shape (multi-segment account number, "<name> • ACC-..." line, "$US"-prefixed
  // balance, and the sentence-style standby countdown) matches a real Starlink home page the
  // user shared - but every value below is a made-up placeholder, never the real one.
  it("reads the service-end date out of a sentence, not just a bare label:value pair", () => {
    const fields = extractFrom(`
      <div class="home-banner">
        <div>من المقرر أن تنتهي خدمتك في ٢٠٢٦/٩/٢٨.</div>
        <div>استئناف</div>
      </div>
      <div class="account-header">
        <div>test holder • ACC-XX-11112222-33334-44</div>
      </div>
      <div class="balance-card">
        <div>ادفع</div>
        <div>الرصيد المستحق</div>
        <div>$US ٠,٠٠</div>
      </div>
    `);

    expect(fields.renewalDate).toBe("2026/09/28");
    expect(fields.accountNumber).toBe("ACC-XX-11112222-33334-44");
    expect(fields.balanceDue).toBe("0.00");
    expect(fields.currency).toBe("USD");
    // The account holder's name IS now read, but kept as its own separate field - never
    // confused with, or used to overwrite, the operator's own locally-entered customer name.
    expect(fields.accountHolderName).toBe("test holder");
  });
});

describe("extractStarlinkFields - real Starlink Devices + Subscription pages (round 8 regression)", () => {
  // Fixture shape matches the real Devices and Subscription sections the user shared - every
  // value below is still a made-up placeholder, never a real one.
  it("finds the dish's real status dot despite 'starlink' also appearing in the nav logo and the Starlink-ID line (neither has a status dot nearby)", () => {
    const fields = extractFrom(`
      <header><div>STARLINK</div></header>
      <div class="identifiers">
        <div>معرف Starlink</div>
        <div>test-unit-id-0001</div>
      </div>
      <div class="devices-section">
        <div class="row"><div>STARLINK</div><div aria-label="Online" class="dot"></div></div>
        <div class="row"><div>WIFI TEST01</div><div aria-label="Online" class="dot"></div></div>
        <div>رقم الطقم</div>
        <div>KIT-TEST-0001</div>
        <div>الرقم التسلسلي</div>
        <div>SN-TEST-0001</div>
      </div>
      <div class="subscription-section">
        <div>الاشتراك</div>
        <div>SL-XX-11112222-33334-44</div>
      </div>
      <div class="usage-section">
        <div>إجمالي استهلاك الباقة</div>
        <div>261 جيجابايت</div>
      </div>
    `);

    expect(fields.dishStatus).toBe("online");
    expect(fields.wifiStatus).toBe("online");
    expect(fields.kitNumber).toBe("KIT-TEST-0001");
    expect(fields.serialNumber).toBe("SN-TEST-0001");
    expect(fields.subscriptionId).toBe("SL-XX-11112222-33334-44");
    expect(fields.dataUsageGb).toBe("261");
  });
});

describe("extractStarlinkFields - real Starlink Settings page (round 9 regression)", () => {
  // Fixture shape matches the real Settings page the user shared - every value below is a
  // made-up placeholder, never the real one.
  it("reads both the registered email and the phone number shown on the same page", () => {
    const fields = extractFrom(`
      <div class="profile-form">
        <div>الاسم</div>
        <div>test holder</div>
        <div>البريد الإلكتروني</div>
        <div>test.holder@example.com</div>
        <div>رقم الهاتف</div>
        <div>+22212345678</div>
      </div>
    `);

    expect(fields.accountEmail).toBe("test.holder@example.com");
    expect(fields.phone).toBe("+22212345678");
  });
});

describe("extractStarlinkFields - real Starlink Billing page (round 10 regression)", () => {
  // Fixture shape matches the real Billing page the user shared: a "ادفع" (Pay) button sits
  // between the balance label and its amount - the bug this round fixed. Deliberately excludes
  // the page's payment-method section (cardholder name, card last 4 digits, expiry) - that is
  // sensitive payment data this extractor must never read, and nothing in this module does.
  it("finds the balance despite the Pay button between the label and the amount", () => {
    const fields = extractFrom(`
      <div class="billing-section">
        <div>فوترة</div>
        <div>إدارة فواتيرك ومدفوعاتك.</div>
        <div class="balance-card">
          <div>الرصيد المستحق</div>
          <div>ادفع</div>
          <div>$US 25.00</div>
        </div>
      </div>
    `);

    expect(fields.balanceDue).toBe("25.00");
    expect(fields.currency).toBe("USD");
  });
});

describe("extractStarlinkFields - real suspended Billing page, no 'خطة الخدمة' card at all (round 16 regression)", () => {
  // Fixture shape matches the real suspended-for-billing Billing page the user shared: the
  // top-of-page disabled banner, an empty billing-cycle section ("لم تتم إضافة أي اشتراكات إلى هذا
  // الحساب"), and an invoice list whose "اشتراك" rows are the only date signal left at all.
  it("reads suspended from the billing-suspension banner alone, with no plan card anywhere on this page", () => {
    const fields = extractFrom(`
      <div class="top-banner">
        <div>تم تعطيل خدمتك بسبب مشكلة في الفوترة.</div>
        <div>يرجى التأكد من دفع جميع الفواتير.</div>
      </div>
      <div class="billing-section">
        <div>فوترة</div>
        <div>إدارة فواتيرك ومدفوعاتك.</div>
        <div class="balance-card">
          <div>الرصيد المستحق</div>
          <div>ادفع</div>
          <div>€ 52.03</div>
        </div>
        <div class="cycle-card">
          <div>دورة الفوترة</div>
          <div>لم تتم إضافة أي اشتراكات إلى هذا الحساب.</div>
        </div>
      </div>
    `);

    expect(fields.serviceStatus).toBe("suspended");
    expect(fields.balanceDue).toBe("52.03");
    expect(fields.currency).toBe("EUR");
  });

  it("falls back to the invoice list's own 'اشتراك' row for the renewal date once the billing-cycle section is blank", () => {
    const fields = extractFrom(`
      <div class="top-banner">
        <div>تم تعطيل خدمتك بسبب مشكلة في الفوترة.</div>
      </div>
      <div class="cycle-card">
        <div>دورة الفوترة</div>
        <div>لم تتم إضافة أي اشتراكات إلى هذا الحساب.</div>
      </div>
      <div class="invoice-table">
        <div>الحالة</div>
        <div>الوصف</div>
        <div>تاريخ الاستحقاق</div>
        <div>متأخر</div>
        <div>طلب</div>
        <div>2026/8/29</div>
        <div>متأخر</div>
        <div>اشتراك</div>
        <div>2026/8/28</div>
      </div>
    `);

    expect(fields.serviceStatus).toBe("suspended");
    expect(fields.renewalDate).toBe(nextOccurrenceOfDay(28));
  });

  it("never reports suspended for a real, never-suspended home page (round 17 regression: real false positive)", () => {
    // Reproduces the user's real bug report: a fully-paid, never-suspended account (a green
    // checkmark next to a $0.00 balance) came back "suspended" - the actual page text was never
    // seen, but a bare "تعطيل خدمتك"/"تعطيل الخدمة" fragment somewhere unrelated (e.g. a
    // self-service "disable the service" menu action) is the most likely real cause; this fixture
    // includes exactly that alongside an otherwise completely normal, paid-up home page.
    const fields = extractFrom(`
      <div class="referral-banner">
        <div>شهر لصديقك، وشهر لك</div>
        <div>شارك رابطك للبدء</div>
      </div>
      <div>الصفحة الرئيسية</div>
      <div>bella ag d • ACC-DF-15875975-23289-67</div>
      <div class="balance-card">
        <div>ادفع</div>
        <div>الرصيد المستحق</div>
        <div>$US 0.00</div>
      </div>
      <div class="subscription-card">
        <div>اشتراك</div>
        <div>إدارة خدمة Starlink</div>
        <div>تعطيل الخدمة</div>
      </div>
      <div class="orders-card">
        <div>الطلبات</div>
        <div>عرض سجل الطلبات</div>
      </div>
    `);

    // isOnAccountHomePage (round 18) now actively resolves this to "active" rather than leaving
    // it undefined - see that function's own doc for why "not wrong" alone isn't enough here.
    expect(fields.serviceStatus).toBe("active");
  });

  it("actively corrects a STALE 'suspended' status left over from before this fix, on the very same never-suspended home page (round 18 regression: real false positive, still visible after re-syncing)", () => {
    // Reproduces the user's follow-up real bug report: even after round 17's fix landed and the
    // operator pressed "تحديث من Starlink" again on this exact page, the app kept showing
    // "موقوف". Root cause: this page has neither a "خطة الخدمة" card (extractPlanBadgeStatus finds
    // nothing) nor a labeled status line, so every sync of it left fields.serviceStatus undefined
    // - and mergeSyncedFields' additive-only merge never overwrites a stored value with "not
    // found", however wrong. isOnAccountHomePage gives this exact page a real, actively-set
    // "active" result instead, which does overwrite the stale value on the next sync.
    const fields = extractFrom(`
      <div>الصفحة الرئيسية</div>
      <div>bella ag d • ACC-DF-15875975-23289-67</div>
      <div class="balance-card">
        <div>ادفع</div>
        <div>الرصيد المستحق</div>
        <div>$US 0.00</div>
      </div>
      <div class="menu">
        <div>اشتراك</div>
        <div>الطلبات</div>
        <div>فوترة</div>
        <div>الإحالات</div>
        <div>الرسائل</div>
        <div>الإعدادات</div>
      </div>
    `);

    expect(fields.serviceStatus).toBe("active");
  });
});

describe("extractStarlinkFields - never stores a truncated renewal date (round 11 regression)", () => {
  it("finds nothing rather than a corrupted date when the page splits year/month from the day", () => {
    // Reproduces the user's real bug report: the account ended up bucketed under day "9" in the
    // calendar - because "٢٠٢٦/٩" (missing the day) got accepted as a renewal date, and
    // expiryDay()'s fallback then misread the bare month digit "9" as if it were the day.
    const fields = extractFrom(`
      <div class="home-banner">
        <div>من المقرر أن تنتهي خدمتك في ٢٠٢٦/٩</div>
        <div>٢٨.</div>
      </div>
    `);

    expect(fields.renewalDate).toBeUndefined();
  });

  it("still accepts a complete date when the page keeps year/month/day together", () => {
    const fields = extractFrom(`
      <div>من المقرر أن تنتهي خدمتك في ٢٠٢٦/٩/٢٨.</div>
    `);

    expect(fields.renewalDate).toBe("2026/09/28");
  });
});

describe("extractStarlinkFields - scheduled-end banner + immune to an unrelated 'النهاية' elsewhere on the page (round 12 regression, corrected round 15)", () => {
  it("reads active (never standby) from a scheduled-end banner alone, plus the pending-cancellation date, and never lets an unrelated 'النهاية' line elsewhere override the real renewal date", () => {
    // Real, confirmed mistake this replaces: the banner alone used to set serviceStatus
    // "standby", as if the service were already paused - but "استئناف"/Resume only makes sense
    // for a service that's still running right now, just scheduled to stop later.
    const fields = extractFrom(`
      <div class="home-banner">
        <div>من المقرر أن تنتهي خدمتك في ٢٠٢٦/٩/٢٨.</div>
        <div>استئناف</div>
      </div>
      <div class="unrelated-promo">
        <div>عرض ينتهي قريبًا - في النهاية بتاريخ ٢٠٢٦/٩/١٠</div>
      </div>
    `);

    expect(fields.serviceStatus).toBe("active");
    expect(fields.renewalDate).toBe("2026/09/28");
    expect(fields.pendingCancellationDate).toBe("2026/09/28");
  });

  it("still reads the 'خطة الخدمة' badge date when the sentence banner isn't on the page at all", () => {
    const fields = extractFrom(`
      <div class="subscriptions-section">
        <div>خطة الخدمة</div>
        <div>إدارة</div>
        <div>النهاية ٢٠٢٦/٩/٢٨</div>
        <div>التجوال - غير محدود</div>
      </div>
    `);

    expect(fields.renewalDate).toBe("2026/09/28");
    expect(fields.serviceStatus).toBeUndefined();
    expect(fields.pendingCancellationDate).toBeUndefined();
  });
});

describe("extractStarlinkFields - real 'نشط' plan badge once the account is actually active (round 13 regression)", () => {
  it("reads serviceStatus active from the badge, with no separate labeled status line anywhere", () => {
    const fields = extractFrom(`
      <div class="subscriptions-section">
        <div>اللقب</div>
        <div>تعديل</div>
        <div>التجوال - غير محدود</div>
        <div>خطة الخدمة</div>
        <div>إدارة</div>
        <div>نشط</div>
        <div>التجوال - غير محدود</div>
      </div>
    `);

    expect(fields.serviceStatus).toBe("active");
  });

  it("still reads active (a real scheduled-end banner never demotes an explicit 'نشط' badge)", () => {
    const fields = extractFrom(`
      <div>من المقرر أن تنتهي خدمتك في ٢٠٢٦/٩/٢٨.</div>
      <div class="subscriptions-section">
        <div>خطة الخدمة</div>
        <div>إدارة</div>
        <div>نشط</div>
        <div>التجوال - غير محدود</div>
      </div>
    `);

    expect(fields.serviceStatus).toBe("active");
    expect(fields.pendingCancellationDate).toBe("2026/09/28");
  });

  it("still reports genuine standby from an explicit paused-now badge, with no pending-cancellation date at all", () => {
    // The two states are genuinely different real Starlink pages, never conflated: this one has
    // no scheduled-end banner anywhere, just the plan card's own paused badge.
    const fields = extractFrom(`
      <div class="subscriptions-section">
        <div>خطة الخدمة</div>
        <div>إدارة</div>
        <div>وضع الاستعداد قيد التعليق</div>
        <div>التجوال - غير محدود</div>
      </div>
    `);

    expect(fields.serviceStatus).toBe("standby");
    expect(fields.pendingCancellationDate).toBeUndefined();
  });

  it("reads active (never standby), plus the pending-cancellation date, from the second real banner wording ('ستتحول خدمتك...') - even when the 'خطة الخدمة' badge itself reads standby", () => {
    // Real, confirmed mistake this replaces: a prepaid 100GB roaming account, activated the SAME
    // day it was synced and not due to move to standby for another month, showed up in the app as
    // "close to expiring today" - because the "خطة الخدمة" card's own "وضع الاستعداد قيد التعليق"
    // badge was trusted alone as "already standby", exactly like the OTHER, genuinely-already-
    // paused account the previous test above is about. The disambiguator is this banner: it is a
    // dated, resumable, still-running-right-now signal ("الإبقاء على الخدمة الحالية" / "أحل الآن"
    // on the real page) that must win over a bare "standby" badge reading.
    const fields = extractFrom(`
      <div class="home-banner">
        <div>ستتحول خدمتك الحالية إلى وضع الاستعداد في ٢٠٢٦/١٠/٢٤.</div>
        <div>الإبقاء على الخدمة الحالية</div>
      </div>
      <div class="subscriptions-section">
        <div>خطة الخدمة</div>
        <div>إدارة</div>
        <div>وضع الاستعداد قيد التعليق</div>
        <div>التجوال - 100 غيغابايت</div>
      </div>
    `);

    expect(fields.serviceStatus).toBe("active");
    expect(fields.planName).toBe("التجوال - 100 غيغابايت");
    expect(fields.renewalDate).toBe("2026/10/24");
    expect(fields.pendingCancellationDate).toBe("2026/10/24");
  });
});

describe("extractStarlinkFields - real Billing-cycle due day, no year on the page at all (round 14 regression)", () => {
  it("computes a real renewal date from the bare recurring due day when nothing else on the page has one", () => {
    const fields = extractFrom(`
      <div class="billing-section">
        <div>دورة الفوترة</div>
        <div>فترة الفوترة هي ٢٨ أغسطس - ٢٧ سبتمبر.</div>
        <div>تاريخ استحقاق الدفع: ٢٨ أغسطس.</div>
      </div>
    `);

    // Not asserting the exact date (it depends on today's date at test-run time) - just that a
    // real, complete date was computed, and that it lands on day 28 as the real page said.
    expect(fields.renewalDate).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
    expect(fields.renewalDate?.endsWith("/28")).toBe(true);
  });

  it("prefers a real dated signal over the computed billing-cycle day when both are present", () => {
    const fields = extractFrom(`
      <div>من المقرر أن تنتهي خدمتك في ٢٠٢٦/٩/٢٨.</div>
      <div class="billing-section">
        <div>تاريخ استحقاق الدفع: ١٠ يناير.</div>
      </div>
    `);

    expect(fields.renewalDate).toBe("2026/09/28");
  });
});

describe("extractStarlinkFields - progressive, section-by-section reading", () => {
  it("returns only device fields when only the Devices section is on the page", () => {
    document.body.innerHTML = `
      <div class="row"><div>Starlink Dish</div><div aria-label="Online" class="dot"></div></div>
    `;
    const fields = extractStarlinkFields(document);

    expect(fields.dishStatus).toBe("online");
    expect(fields).not.toHaveProperty("wifiStatus");
    expect(fields).not.toHaveProperty("planName");
    expect(fields).not.toHaveProperty("balanceDue");
    expect(fields).not.toHaveProperty("accountNumber");
  });

  it("returns an empty object for a page with nothing recognizable on it", () => {
    document.body.innerHTML = `<div>Welcome to your account</div>`;
    expect(extractStarlinkFields(document)).toEqual({});
  });

  it("falls back to the ACC- pattern for accountNumber when there is no clear label", () => {
    document.body.innerHTML = `<div>Reference: ACC-77665544 (keep for your records)</div>`;
    expect(extractStarlinkFields(document).accountNumber).toBe("ACC-77665544");
  });
});
