// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { PartyStatementRow, PartyStoreTotals } from "./invoiceStore";
import { DEFAULT_CONTACT, loadBusinessProfile, saveBusinessProfile } from "./pdfDocument";
import { partyNetIn } from "./partyNet";
import {
  buildStatementData,
  buildStatementHtml,
  contactBlockHtml,
  IMAGE_STATEMENT_ROWS,
  qrSvg,
  sharpenForImage,
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

  it("lists the payment methods (the operator's own lines, or the default ones)", () => {
    const html = contactBlockHtml({ ...business, paymentInstructions: "• DEMO BANK : 11112222\n• DEMO MONEY : 33334444" });
    expect(html).toContain("طرق الدفع المتاحة");
    expect(html).toContain("DEMO BANK : 11112222");
    expect(html).toContain("DEMO MONEY : 33334444");
    expect(html).not.toContain("• DEMO");
    expect(contactBlockHtml(business)).toContain("BANKILY - NITA : 22227268");
  });

  it("draws the QR codes small", () => {
    expect(contactBlockHtml(business)).toContain('width="64"');
  });

  it("still shows the payment methods with no e-mail or WhatsApp", () => {
    const html = contactBlockHtml({ name: "X", email: "", whatsappMauritania: "", whatsappMali: "" });
    expect(html).toContain("ORANGE MONEY : 74646158");
    expect(html).not.toContain("<svg");
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

  it("the picture can leave out the device list under the name (his Oct 29 2026 ask)", () => {
    const data = buildStatementData({ name: "DEMO NAME" }, true, totals, rows, ["demo-device-a"]);
    expect(buildStatementHtml(data, business, "", { width: 720 })).toContain("demo-device-a");
    expect(buildStatementHtml(data, business, "", { width: 720, hideDevices: true })).not.toContain("demo-device-a");
  });

  it("📱 the WhatsApp picture: short (8 operations), every text bigger, grey text darker - the PDF unchanged", () => {
    expect(IMAGE_STATEMENT_ROWS).toBe(8);
    const data = buildStatementData({ name: "DEMO NAME" }, true, totals, rows);
    const html = buildStatementHtml(data, business, "2026-10-04 12:00", { width: 600, maxRows: IMAGE_STATEMENT_ROWS });
    const sharp = sharpenForImage(html);
    expect(html).toContain("font-size:12px");
    expect(sharp).not.toContain("font-size:12px");
    expect(sharp).toContain("font-size:16px"); // 12 × 1.3
    expect(sharp).not.toMatch(/#8a94a3|#5b6472/);
    expect(sharp).toContain("width:600px");
    expect(sharpenForImage('<p style="font-size:11px">', 2)).toBe('<p style="font-size:22px">');
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

describe("⚖️ a statement in 2+ currencies says the net in his currency (his Oct 19 2026 report)", () => {
  // His real case: 32,000 سيفا عليه (+32,000 رصيد عليه), 118,400 أوقية له - at 1,000 سيفا = 3,700 أوقية, settled.
  const mixed: Record<string, PartyStoreTotals> = {
    MRU: { total: 0, paid: 0, returned: 0, adjusted: -118400, remaining: -118400 },
    SIFA: { total: 0, paid: 0, returned: 0, adjusted: 32000, remaining: 32000 },
  };
  const net = partyNetIn({ MRU: -118400, SIFA: 32000 }, "MRU", (c) => ({ MRU: 444, SIFA: 120 })[c])!;

  it("settled: no «المبلغ المستحق عليك 32,000 سيفا», no «رصيد لك», no franc line - «متعادل» with the rate", () => {
    const data = buildStatementData({ name: "DEMO NAME" }, true, mixed, [row(1, 0)], [], net);
    const html = buildStatementHtml(data, business, "2026-10-19 10:49", { width: 600 });
    expect(html).not.toContain("المبلغ المستحق عليك");
    expect(html).not.toContain("رصيد لك");
    expect(html).not.toContain("فرانك");
    expect(html).toContain("الحساب متعادل");
    expect(html).toContain("32,000 سيفا عليك ≈ 118,400 أوقية · بسعر 1,000 سيفا = 3,700 أوقية");
  });

  it("still owing: the net amount in his currency is what is due", () => {
    const owing = partyNetIn({ MRU: -100000, SIFA: 32000 }, "MRU", (c) => ({ MRU: 444, SIFA: 120 })[c])!;
    const html = buildStatementHtml(buildStatementData({ name: "DEMO NAME" }, true, mixed, [row(1, 0)], [], owing), business, "x", { width: 600 });
    expect(html).toContain("المبلغ المستحق عليك");
    expect(html).toContain("18,400");
  });

  it("without a net (one currency) nothing changes", () => {
    const html = buildStatementHtml(buildStatementData({ name: "DEMO NAME" }, true, totals, [row(1, 46000)]), business, "x", { width: 600 });
    expect(html).toContain("المبلغ المستحق عليك");
    expect(html).not.toContain("الحساب بعملتك");
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
