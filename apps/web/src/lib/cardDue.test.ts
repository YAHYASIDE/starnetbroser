import { describe, expect, it } from "vitest";
import { cardDueByCurrency } from "./cardDue";
import type { LedgerEntry } from "./ledgerStore";

const e = (id: string, kind: "debit" | "credit", amount: number, date: string, currency: LedgerEntry["currency"] = "SIFA"): LedgerEntry => ({
  id, kind, amount, currency, note: "", email: "", date, createdAt: `${date}T10:00:00.000Z`,
});

describe("🧾 the card shows only the last charge (his Oct 25 2026 ask)", () => {
  it("13,000 then a renewal of 6,000 → 6,000", () => {
    expect(cardDueByCurrency([e("a", "debit", 13000, "2026-09-20"), e("b", "debit", 6000, "2026-10-20")])).toEqual({ SIFA: 6000 });
  });

  it("never more than what is still owed: a partly paid last charge shows what's left", () => {
    expect(cardDueByCurrency([e("a", "debit", 6000, "2026-10-20"), e("p", "credit", 4000, "2026-10-21")])).toEqual({ SIFA: 2000 });
    expect(cardDueByCurrency([e("a", "debit", 6000, "2026-10-20"), e("p", "credit", 6000, "2026-10-21")])).toEqual({});
  });

  it("a credit (للزبون) and each currency stay as they were", () => {
    expect(cardDueByCurrency([e("a", "debit", 1000, "2026-10-01"), e("p", "credit", 1500, "2026-10-02")])).toEqual({ SIFA: -500 });
    expect(cardDueByCurrency([e("a", "debit", 13000, "2026-09-01"), e("m", "debit", 2000, "2026-09-05", "MRU"), e("b", "debit", 6000, "2026-10-01")])).toEqual({ SIFA: 6000, MRU: 2000 });
  });
});
