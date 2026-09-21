// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extractStarlinkFields } from "./extractStarlinkFields";

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

  it("never reads a person's name, email or phone - deferred", () => {
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
  it("reads the registered email but never the phone number shown on the same page", () => {
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
    // The Settings page's phone number is a different, unrelated number - deliberately never
    // read at all, so it must never end up on any field this extractor returns.
    expect(fields).not.toHaveProperty("phone");
    expect(Object.values(fields)).not.toContain("+22212345678");
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

describe("extractStarlinkFields - standby status + immune to an unrelated 'النهاية' elsewhere on the page (round 12 regression)", () => {
  it("infers standby from the banner alone, and never lets an unrelated 'النهاية' line elsewhere override the real renewal date", () => {
    const fields = extractFrom(`
      <div class="home-banner">
        <div>من المقرر أن تنتهي خدمتك في ٢٠٢٦/٩/٢٨.</div>
        <div>استئناف</div>
      </div>
      <div class="unrelated-promo">
        <div>عرض ينتهي قريبًا - في النهاية بتاريخ ٢٠٢٦/٩/١٠</div>
      </div>
    `);

    expect(fields.serviceStatus).toBe("standby");
    expect(fields.renewalDate).toBe("2026/09/28");
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
