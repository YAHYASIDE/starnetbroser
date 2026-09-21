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
