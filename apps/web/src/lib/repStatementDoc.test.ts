import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { LedgerEntry } from "./ledgerStore";
import { keepCurrency } from "./repAccount";
import { AUTO_STATEMENT_ROWS, buildRepAutoStatementPdf, newDebtRows, repCurrentStatement, repDebtRowKeys, type RepStatementSources } from "./repStatementDoc";
import type { Representative } from "./repStore";

// Fake data only.
const rep = { id: "r1", name: "DEMO REP", commissionPercent: 50, customersHidden: true } as unknown as Representative;
const device = { id: "d1", name: "DEMO DEVICE", representativeId: "r1" } as StarlinkAccountSummary;
const charge = (i: number): LedgerEntry => ({
  id: `e${i}`,
  kind: "debit",
  amount: 1000 + i,
  currency: "SIFA",
  note: "",
  email: "",
  date: `2026-10-${String(i).padStart(2, "0")}`,
  createdAt: `2026-10-${String(i).padStart(2, "0")}T10:00:00.000Z`,
  starlinkCost: { status: "pending", currencyCode: "USD", amount: 1 },
  representativeId: "r1",
  representativeCommissionPercent: 50,
});
const sources = (n: number): RepStatementSources => ({
  accounts: [device],
  ledger: { d1: Array.from({ length: n }, (_, i) => charge(i + 1)) },
  clients: {},
  repBook: [],
  invoices: [],
  settlements: [],
});

describe("📄 «كشف بعد كل عملية» (his Oct 29 2026 ask)", () => {
  it("the statement carries the last 10 operations of what he owes, newest first, and says how many there are", () => {
    const doc = buildRepAutoStatementPdf(rep, sources(14), keepCurrency, {});
    expect(doc.title).toBe("كشف حساب مندوب");
    expect(doc.rows).toHaveLength(AUTO_STATEMENT_ROWS);
    expect(doc.subtitle).toBe(`آخر ${AUTO_STATEMENT_ROWS} عمليات من أصل 14`);
    expect(doc.rows[0]![0]).toBe("2026-10-14");
    expect(doc.summary?.[0]?.label).toContain("المبلغ المتبقي عليه");
  });

  it("a new operation is told by its key; the first time nothing is sent (no whole history)", () => {
    const before = repDebtRowKeys(repCurrentStatement(rep, sources(3), keepCurrency).statement);
    const after = repDebtRowKeys(repCurrentStatement(rep, sources(4), keepCurrency).statement);
    expect(before).toHaveLength(3);
    expect(newDebtRows(after, before)).toHaveLength(1);
    expect(newDebtRows(after, after)).toEqual([]);
    expect(newDebtRows(after, undefined)).toEqual([]);
  });
});
