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

  it("builds a safe file name", () => {
    expect(pdfFileName("كشف حساب زبون", "2026-09-25-1338")).toBe("starnet-statement-2026-09-25-1338.pdf");
    expect(pdfFileName("فاتورة بيع", "2026-09-25-1338")).toBe("starnet-invoice-2026-09-25-1338.pdf");
    expect(pdfFileName("كشف حساب مندوب", "2026-09-25")).toBe("starnet-rep-statement-2026-09-25.pdf");
    expect(pdfFileName("سند قبض", "2026-09-25")).toBe("starnet-receipt-2026-09-25.pdf");
  });
});
