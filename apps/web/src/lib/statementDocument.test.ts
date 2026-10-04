// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { PartyStatementRow, PartyStoreTotals } from "./invoiceStore";
import { DEFAULT_CONTACT, loadBusinessProfile, saveBusinessProfile } from "./pdfDocument";
import {
  buildStatementData,
  buildStatementHtml,
  contactBlockHtml,
  IMAGE_STATEMENT_ROWS,
  qrSvg,
  whatsappContacts,
} from "./statementDocument";

const business = { name: "STAR NET", email: "demo@example.com", whatsappMauritania: "1234 5678", whatsappMali: "87654321" };

function row(index: number, balanceAfter: number): PartyStatementRow {
  return {
    id: `r${index}`,
    type: "device-charge",
    date: `2026-09-${String(index).padStart(2, "0")}`,
    createdAt: "",
    currencyCode: "MRU",
    deviceName: "demo-a",
    amount: 1000,
    paid: 0,
    delta: 1000,
    balanceAfter,
  };
}

const totals: Record<string, PartyStoreTotals> = {
  MRU: { total: 46000, paid: 15000, returned: 0, adjusted: 15000, remaining: 46000 },
  SIFA: { total: 12800, paid: 12800, returned: 0, adjusted: 0, remaining: 0 },
};

describe("whatsappContacts", () => {
  it("gives each number its country code and a wa.me link, skipping empty ones", () => {
    expect(whatsappContacts(business)).toEqual([
      { country: "موريتانيا", flag: "🇲🇷", dial: "222", number: "12345678", link: "https://wa.me/22212345678" },
      { country: "مالي", flag: "🇲🇱", dial: "223", number: "87654321", link: "https://wa.me/22387654321" },
    ]);
    expect(whatsappContacts({ ...business, whatsappMali: "" }).map((c) => c.dial)).toEqual(["222"]);
  });
});

describe("qrSvg", () => {
  it("draws an SVG at the asked size", () => {
    const svg = qrSvg("https://wa.me/22212345678", 100);
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).toContain('width="100"');
    expect(svg).toContain("<path");
  });
});

describe("contactBlockHtml", () => {
  it("shows the e-mail, one QR per number and the numbers with their country codes", () => {
    const html = contactBlockHtml(business);
    expect(html).toContain("demo@example.com");
    expect(html).toContain("+222 12345678");
    expect(html).toContain("+223 87654321");
    expect(html.match(/<svg /g)).toHaveLength(2);
  });

  it("is empty when nothing is set", () => {
    expect(contactBlockHtml({ name: "X", email: "", whatsappMauritania: "", whatsappMali: "" })).toBe("");
  });
});

describe("buildStatementData", () => {
  it("formats each row with its sign, currency and running balance", () => {
    const data = buildStatementData({ name: "DEMO NAME", phone: " " }, true, totals, [row(1, 46000), row(2, 0)], ["demo-a"]);
    expect(data.partyPhone).toBeUndefined();
    expect(data.devices).toEqual(["demo-a"]);
    expect(data.rows[0]).toMatchObject({ date: "2026-09-01", amount: "+1,000 أوقية", balance: "46,000 أوقية", due: true });
    expect(data.rows[1]?.due).toBe(false);
    expect(data.totals.map((t) => t.currency)).toEqual(["أوقية", "سيفا"]);
  });
});

describe("buildStatementHtml", () => {
  const rows = Array.from({ length: 20 }, (_, i) => row(i + 1, 46000));

  it("the image shows only the last operations and says how many there are", () => {
    const data = buildStatementData({ name: "DEMO NAME" }, true, totals, rows);
    const html = buildStatementHtml(data, business, "2026-10-04 12:00", { width: 600, maxRows: IMAGE_STATEMENT_ROWS });
    expect(html).toContain(`آخر ${IMAGE_STATEMENT_ROWS} عملية من أصل 20`);
    expect(html.match(/<tr style="background:#f/g)).toHaveLength(IMAGE_STATEMENT_ROWS);
    expect(html).toContain("المبلغ المستحق عليك");
    expect(html).toContain("46,000");
    expect(html).toContain("demo@example.com");
    expect(html).toContain('width:600px');
  });

  it("the PDF shows every operation", () => {
    const data = buildStatementData({ name: "DEMO NAME" }, true, totals, rows);
    const html = buildStatementHtml(data, business, "2026-10-04 12:00", { width: 794 });
    expect(html).toContain("العمليات (20)");
    expect(html.match(/<tr style="background:#f/g)).toHaveLength(20);
  });

  it("says nothing is due when every balance is settled", () => {
    const settled = { SIFA: totals.SIFA! };
    const html = buildStatementHtml(buildStatementData({ name: "DEMO NAME" }, true, settled, []), business, "", { width: 600 });
    expect(html).toContain("لا يوجد مبلغ مستحق");
    expect(html).not.toContain("المبلغ المستحق عليك");
  });

  it("escapes the client's name", () => {
    const html = buildStatementHtml(buildStatementData({ name: "<img src=x>" }, true, totals, []), business, "", { width: 600 });
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;img src=x&gt;");
  });
});

describe("business contact settings", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults to the operator's own contact details", () => {
    expect(loadBusinessProfile()).toMatchObject(DEFAULT_CONTACT);
    saveBusinessProfile({ name: "STAR NET" });
    expect(loadBusinessProfile()).toMatchObject(DEFAULT_CONTACT);
  });

  it("keeps a cleared field cleared instead of restoring the default", () => {
    saveBusinessProfile({ name: "STAR NET", email: "", whatsappMauritania: "11112222", whatsappMali: "" });
    expect(loadBusinessProfile()).toMatchObject({ email: "", whatsappMauritania: "11112222", whatsappMali: "" });
  });
});
