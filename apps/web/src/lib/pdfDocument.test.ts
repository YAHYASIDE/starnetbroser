import { describe, expect, it } from "vitest";
import { buildPrintableHtml, escapeHtml, pdfFileName } from "./pdfDocument";

describe("pdfDocument", () => {
  it("escapes every piece of user text", () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe("&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;");
    const html = buildPrintableHtml(
      { title: "كشف", partyName: "<script>alert(1)</script>", summary: [], columns: ["التاريخ"], rows: [["<img>"]] },
      { name: "STAR NET" },
      "2026-09-25",
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders branding, summary, rows and tones", () => {
    const html = buildPrintableHtml(
      {
        title: "كشف حساب زبون",
        partyName: "محمد",
        partyPhone: "+222 1",
        summary: [{ label: "المتبقي", value: "900 أوقية", tone: "due" }],
        columns: ["التاريخ", "البيان", "الرصيد"],
        rows: [["2026-09-25", "دفعة", "900"]],
        rowTones: ["due"],
      },
      { name: "متجري", phone: "22200000" },
      "2026-09-25 10:00",
    );
    expect(html).toContain("متجري");
    expect(html).toContain("22200000");
    expect(html).toContain("المتبقي");
    expect(html).toContain("#d0332f");
    expect(html).toContain("<td");
  });

  it("renders extra titled sections after the main table, escaped", () => {
    const html = buildPrintableHtml(
      {
        title: "كشف حساب مندوب",
        partyName: "سالم",
        summary: [],
        columns: ["التاريخ"],
        rows: [],
        sections: [
          { title: "📈 أرباح أجهزته - مؤكد", columns: ["الجهاز", "الربح"], rows: [["<b>جهاز 1</b>", "40"]], note: "المجموع 40" },
          { title: "⏳ متوقع (D)", columns: ["الجهاز"], rows: [] },
        ],
      },
      { name: "STAR NET" },
      "2026-10-07",
    );
    expect(html).toContain("📈 أرباح أجهزته - مؤكد");
    expect(html).toContain("&lt;b&gt;جهاز 1");
    expect(html).toContain("المجموع 40");
    expect(html).toContain("⏳ متوقع (D)");
    expect(html.indexOf("لا توجد حركات")).toBeLessThan(html.indexOf("📈"));
  });

  it("builds a safe file name", () => {
    expect(pdfFileName("كشف حساب زبون", "2026-09-25-1338")).toBe("starnet-statement-2026-09-25-1338.pdf");
    expect(pdfFileName("فاتورة بيع", "2026-09-25-1338")).toBe("starnet-invoice-2026-09-25-1338.pdf");
    expect(pdfFileName("إقفال الشهر", "2026-09-25-1338")).toBe("starnet-month-closing-2026-09-25-1338.pdf");
    expect(pdfFileName("كشف حساب مندوب", "2026-09-25")).toBe("starnet-rep-statement-2026-09-25.pdf");
    expect(pdfFileName("سند قبض", "2026-09-25")).toBe("starnet-receipt-2026-09-25.pdf");
  });
});
