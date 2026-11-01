import { describe, expect, it } from "vitest";
import { repRowText, settlementText } from "./repRowText";
import type { RepSettlement, RepStatementRow } from "./repStore";

const st = (over: Partial<RepSettlement>): RepSettlement => ({ id: "s", representativeId: "r", kind: "profitTransfer", amount: 140000, currencyCode: "MRU", date: "2026-11-01", createdAt: "2026-11-01T10:00:00Z", ...over }) as RepSettlement;
const row = (s: RepSettlement): RepStatementRow => ({ type: "settlement", id: s.id, date: s.date, createdAt: "2026-11-01T10:00:00Z", settlement: s });

describe("📂 how a profit operation reads (his Nov 1 2026 report)", () => {
  it("a «➖ عليه» from his profit is not called «تصفير الربح»", () => {
    expect(settlementText(st({ note: "تلفون" }))).toBe("➖ عليه في ربحه");
    expect(repRowText(row(st({ note: "تلفون" })), () => "")).toBe("➖ عليه في ربحه · تلفون");
  });
  it("the real «🧹 تصفير الربح» keeps its name, once", () => {
    expect(settlementText(st({ note: "🧹 تصفير الربح" }))).toBe("🧹 تصفير الربح");
    expect(repRowText(row(st({ note: "🧹 تصفير الربح" })), () => "")).toBe("🧹 تصفير الربح");
    expect(repRowText(row(st({ kind: "profitCredit", note: "🧹 تصفير الربح" })), () => "")).toBe("🧹 تصفير الربح");
  });
  it("into his account stays «↪️ من ربحه إلى حساب …»", () => {
    expect(settlementText(st({ toDebt: true } as Partial<RepSettlement>))).toBe("↪️ من ربحه إلى حساب أوقية");
  });
});
