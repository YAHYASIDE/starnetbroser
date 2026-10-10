import { describe, expect, it } from "vitest";
import { balanceDifference, explainDifference } from "./balanceMatch";
import type { PlaceLedgerRow } from "./placeLedger";

let n = 0;
const row = (direction: "in" | "out", amount: number, date = "2026-10-10", kindLabel = "حوالة"): PlaceLedgerRow => ({ id: `r${++n}`, date, label: "ديمو", kindLabel, direction, amount, balance: 0 });

describe("🔍 the difference with the real balance, explained", () => {
  it("real − shown: − when the app shows too much", () => {
    expect(balanceDifference(88200, 62500)).toBe(-25700);
    expect(balanceDifference(100, 100)).toBe(0);
  });

  it("one movement equal to the difference comes first; nothing when there's no difference", () => {
    const extra = row("in", 25700);
    const rows = [row("in", 10000), extra, row("out", 500)];
    const c = explainDifference(rows, -25700);
    expect(c[0]).toMatchObject({ reason: "single", rows: [extra] });
    expect(explainDifference(rows, 0)).toEqual([]);
  });

  it("a duplicate (same amount, day and kind) that accounts for it", () => {
    const a = row("in", 10000, "2026-10-09");
    const b = row("in", 10000, "2026-10-09");
    const c = explainDifference([a, b, row("in", 3000)], -10000);
    // the pair is shown once, as a duplicate - not also as two «single» rows
    expect(c.map((x) => x.reason)).toEqual(["duplicate"]);
    expect(c.find((x) => x.reason === "duplicate")!.rows).toEqual([a, b]);
  });

  it("two movements together", () => {
    const a = row("in", 20000);
    const b = row("in", 5700);
    const c = explainDifference([a, row("out", 333), b], -25700);
    expect(c).toEqual([expect.objectContaining({ reason: "pair", rows: [a, b] })]);
  });

  it("a waiting bank notification first (the real account has it, the app not yet)", () => {
    const c = explainDifference([row("in", 5000)], 5000, [{ id: "s1", signed: 5000, label: "سداد", date: "2026-10-10" }]);
    expect(c[0]).toMatchObject({ reason: "pending", pending: { id: "s1" } });
  });

  it("أوقية: an amount 10× too small (read before the rule)", () => {
    const small = row("in", 600);
    const c = explainDifference([small, row("in", 77)], 5400, [], { mru: true });
    expect(c[0]).toMatchObject({ reason: "times10", rows: [small] });
    expect(c[0]!.hint).toContain("×10");
  });
});
