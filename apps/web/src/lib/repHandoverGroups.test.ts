import { describe, expect, it } from "vitest";
import { groupHandovers } from "./repHandoverGroups";
import type { RepStatementRow, RepSettlement } from "./repStore";

const customer = (id: string, at: string, amount: number, extra: Partial<{ handoverId: string; note: string; byRep: boolean; currency: string }> = {}): RepStatementRow => ({
  type: "customer",
  id,
  date: "2026-10-21",
  createdAt: at,
  op: { entryId: id, accountId: `dev-${id}`, date: "2026-10-21", at, amount, currency: extra.currency ?? "SIFA", byRep: extra.byRep ?? true, ...(extra.note ? { note: extra.note } : {}), ...(extra.handoverId ? { handoverId: extra.handoverId } : {}) },
});
const settlement = (id: string, at: string, amount: number, extra: Partial<RepSettlement> = {}): RepStatementRow => ({
  type: "settlement",
  id,
  date: "2026-10-21",
  createdAt: at,
  settlement: { id, representativeId: "r", kind: "cashHandover", amount, currencyCode: "SIFA", date: "2026-10-21", createdAt: at, ...extra },
});

describe("groupHandovers", () => {
  it("folds the parts that share an id into one line, total first", () => {
    const rows = [settlement("s1", "2026-10-21T20:30:01.000Z", 7380.37, { handoverId: "h1" }), customer("c1", "2026-10-21T20:30:00.500Z", -2619.63, { handoverId: "h1" })];
    const items = groupHandovers(rows);
    expect(items).toHaveLength(1);
    const g = items[0];
    expect(g.kind).toBe("handover");
    if (g.kind !== "handover") return;
    expect(g.total).toBe(10000);
    expect(g.toAccount).toBe(7380.37);
    expect(g.toDevices).toEqual([{ accountId: "dev-c1", amount: 2619.63 }]);
  });

  it("recognises an older sum by its parts recorded together (same note, a moment apart)", () => {
    const note = "سلّمها المندوب (بوت المال)";
    const rows = [
      customer("renewal", "2026-10-21T21:00:00.000Z", 3000, { byRep: false }),
      settlement("s1", "2026-10-21T20:30:02.000Z", 7380.37, { note }),
      customer("c1", "2026-10-21T20:30:01.000Z", -2619.63, { note }),
      customer("c0", "2026-10-21T20:10:00.000Z", -380.37),
    ];
    const items = groupHandovers(rows);
    expect(items.map((i) => (i.kind === "row" ? i.row.id : `group:${i.total}`))).toEqual(["renewal", "group:10000", "c0"]);
  });

  it("never joins sums of different notes, currencies or minutes", () => {
    const rows = [
      settlement("s2", "2026-10-21T20:40:00.000Z", 500, { note: "أ" }),
      settlement("s1", "2026-10-21T20:30:02.000Z", 1000, { note: "ب" }),
      customer("c1", "2026-10-21T20:30:01.000Z", -200, { note: "ب", currency: "MRU" }),
    ];
    expect(groupHandovers(rows).every((i) => i.kind === "row")).toBe(true);
  });
});
