import { describe, expect, it } from "vitest";
import type { ClientStore } from "./clientStore";
import { computeGoalProgress } from "./goals";
import type { LedgerByAccount, LedgerEntry } from "./ledgerStore";

const now = "2026-01-01T00:00:00Z";
const clients: ClientStore = {
  c1: { id: "c1", name: "محمد", phone: "22212345678", createdAt: "2026-09-02T10:00:00Z", updatedAt: now },
  c2: { id: "c2", name: "سالم", createdAt: now, updatedAt: now },
};

describe("goals", () => {
  const e = (o: Partial<LedgerEntry>): LedgerEntry => ({ id: "x", kind: "debit", amount: 1, currency: "MRU", note: "", email: "", date: "2026-09-10", createdAt: now, ...o }) as LedgerEntry;
  const ledger: LedgerByAccount = {
    a: [e({}), e({ date: "2026-08-30" }), e({ kind: "credit", amount: 3000 }), e({ kind: "credit", amount: 20, currency: "USD" }), e({ previousDebtId: "p" })],
    b: [e({ date: "2026-09-20" })],
  };
  it("measures the month against the targets and the pace", () => {
    const p = computeGoalProgress({ renewals: 4, newClients: 2, collection: { amount: 6000, currency: "MRU" } }, "2026-09", "2026-09-15", ledger, clients);
    expect(p.map((g) => [g.key, g.done, g.onPace])).toEqual([
      ["renewals", 2, true],
      ["newClients", 1, true],
      ["collection", 3000, true],
    ]);
    const late = computeGoalProgress({ renewals: 10 }, "2026-09", "2026-09-30", ledger, clients);
    expect(late[0]).toMatchObject({ done: 2, ratio: 0.2, onPace: false });
    expect(computeGoalProgress({}, "2026-09", "2026-09-30", ledger, clients)).toEqual([]);
  });
});
