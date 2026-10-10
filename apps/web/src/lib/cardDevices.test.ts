import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { buildCardStatementFor, groupDevicesByCard, isUnregisteredCard } from "./cardDevices";

const dev = (id: string, card?: string, extra: Partial<StarlinkAccountSummary> = {}) => ({ id, name: `جهاز ${id}`, paymentCardLast4: card, ...extra }) as StarlinkAccountSummary;
const cards = [{ last4: "7232" }, { last4: "1111" }];

describe("💳 devices by card", () => {
  it("groups each registered card's devices and flags unregistered and unknown cards", () => {
    const g = groupDevicesByCard([dev("a", "7232"), dev("b", "7232"), dev("c", "1468"), dev("d"), dev("e", "7232", { deletedAt: "x" })], cards);
    expect(g.byCard["7232"]!.map((a) => a.id)).toEqual(["a", "b"]);
    expect(g.byCard["1111"]).toEqual([]);
    expect(g.unregistered.map((a) => a.id)).toEqual(["c"]);
    expect(g.unknown).toBe(1);
    expect(isUnregisteredCard(dev("c", "1468"), cards)).toBe(true);
    expect(isUnregisteredCard(dev("a", "7232"), cards)).toBe(false);
    expect(isUnregisteredCard(dev("d"), cards)).toBe(false);
    // no cards registered yet: nothing is "unregistered"
    expect(isUnregisteredCard(dev("c", "1468"), [])).toBe(false);
  });

  it("a card's statement: D's paid for its devices by month, plus its pending KAST notices", () => {
    const accounts = [dev("a", "7232"), dev("b", "1111")];
    const st = buildCardStatementFor(
      "7232",
      accounts,
      [
        { accountId: "a", amountUsd: 100, date: "2026-09-10" },
        { accountId: "a", amountUsd: 100, date: "2026-10-10" },
        { accountId: "b", amountUsd: 50, date: "2026-10-03" },
      ],
      [
        { kind: "spent", cardLast4: "7232", amountUsd: 99.5, at: Date.UTC(2026, 9, 11), status: "pending", merchant: "Starlink" },
        { kind: "spent", cardLast4: "7232", amountUsd: 10, at: Date.UTC(2026, 9, 1), status: "recorded", merchant: "Starlink" },
        { kind: "received", amountUsd: 80, at: 1, status: "pending" },
      ],
    );
    expect(st.rows.map((r) => [r.date, r.kind, r.amountUsd])).toEqual([
      ["2026-10-11", "notice", 99.5],
      ["2026-10-10", "paid", 100],
      ["2026-09-10", "paid", 100],
    ]);
    expect(st.months).toEqual({ "2026-09": 100, "2026-10": 100 });
    expect(st.totalPaidUsd).toBe(200);
  });
});
