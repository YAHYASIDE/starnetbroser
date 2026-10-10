import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { buildXlsx, columnName, safeSheetName } from "./xlsxWriter";

describe("xlsxWriter", () => {
  it("names columns like Excel", () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });

  it("keeps sheet names valid and unique", () => {
    const taken = new Set<string>();
    expect(safeSheetName("الأرباح/شهر", taken)).toBe("الأرباح شهر");
    expect(safeSheetName("الأرباح/شهر", taken)).toBe("الأرباح شهر 2");
    expect(safeSheetName("x".repeat(40), taken)).toHaveLength(31);
  });

  it("writes a right-to-left workbook with text, numbers and an escaped header", () => {
    const bytes = buildXlsx([
      { name: "الأجهزة", rows: [["الاسم", "الربح"], ["منزل <الحي> & الشرق", 1600.5], ["فارغ", null]] },
      { name: "ملخص", rows: [["البند", "القيمة"]] },
    ]);
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(
      [
        "[Content_Types].xml",
        "_rels/.rels",
        "xl/_rels/workbook.xml.rels",
        "xl/styles.xml",
        "xl/workbook.xml",
        "xl/worksheets/sheet1.xml",
        "xl/worksheets/sheet2.xml",
      ].sort(),
    );
    const workbook = strFromU8(files["xl/workbook.xml"]!);
    expect(workbook).toContain('<sheet name="الأجهزة" sheetId="1" r:id="rId1"/>');
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]!);
    expect(sheet).toContain('rightToLeft="1"');
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">الاسم</t></is></c>');
    expect(sheet).toContain("منزل &lt;الحي&gt; &amp; الشرق");
    expect(sheet).toContain('<c r="B2"><v>1600.5</v></c>');
    expect(sheet).not.toContain('r="B3"');
  });
});
