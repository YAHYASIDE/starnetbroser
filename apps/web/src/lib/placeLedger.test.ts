import { describe, expect, it } from "vitest";
import type { Movement, PlaceInfo } from "./moneyMovements";
import { buildPlaceLedger } from "./placeLedger";

const ORANGE: PlaceInfo = { id: "orange", name: "أورانج", icon: "🟠", currency: "SIFA", from: "2026-10-01", openingBalance: 52500, balanceKnown: true };
const mv = (id: string, date: string, direction: "in" | "out", amount: number, o: Partial<Movement> = {}): Movement => ({
  id,
  kind: "remittance",
  place: "orange",
  direction,
  amount,
  currency: "SIFA",
  date,
  createdAt: `${date}T10:00:00Z`,
  ref: { kind: "remittance", id },
  label: `حركة ${id}`,
  ...o,
});

describe("📄 كشف حساب محفظة", () => {
  it("each movement with the balance after it, from the typed opening balance", () => {
    const l = buildPlaceLedger(ORANGE, [mv("a", "2026-10-10", "in", 10000), mv("b", "2026-10-11", "out", 2500), mv("x", "2026-10-10", "in", 1, { place: "bankily" })]);
    expect(l.currencies).toHaveLength(1);
    const c = l.currencies[0]!;
    expect(c.opening).toBe(52500);
    expect(c.rows.map((r) => [r.id, r.balance])).toEqual([
      ["a", 62500],
      ["b", 60000],
    ]);
    expect(c).toMatchObject({ received: 10000, paid: 2500, closing: 60000 });
  });

  it("movements before the opening day are not in the balance (counted apart); another currency gets its own list", () => {
    const l = buildPlaceLedger(ORANGE, [mv("old", "2026-09-20", "in", 999), mv("a", "2026-10-10", "in", 100), mv("usd", "2026-10-10", "in", 5, { currency: "USD" })]);
    expect(l.before).toBe(1);
    expect(l.currencies.map((c) => [c.currency, c.closing])).toEqual([
      ["SIFA", 52600],
      ["USD", 5],
    ]);
  });
});
