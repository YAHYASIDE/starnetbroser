import { describe, expect, it } from "vitest";
import { buildMorningDigests, DIGEST_ID_BASE } from "./morningDigest";
import type { StarlinkAccountSummary } from "@starnet/shared";

const acc = (id: string, rechargeDate: string, extra: Partial<StarlinkAccountSummary> = {}) =>
  ({ id, name: id, rechargeDate, standbyDate: "", ...extra }) as StarlinkAccountSummary;

describe("buildMorningDigests", () => {
  const now = new Date(2026, 8, 25, 10, 0); // 25 Sep, 10:00 - today's 8:00 already passed

  it("starts tomorrow morning when today's time has passed and describes each day", () => {
    const list = buildMorningDigests({
      accounts: [acc("a", "2026/09/26"), acc("b", "2026/09/27"), acc("c", "2026/09/20"), acc("gone", "2026/09/26", { deletedAt: "x" })],
      owedByCurrency: { MRU: 1500, USD: 0 },
      now,
      hour: 8,
    });
    expect(list[0]!.id).toBe(DIGEST_ID_BASE);
    expect(list[0]!.at).toEqual(new Date(2026, 8, 26, 8, 0));
    expect(list[0]!.title).toContain("1 تجديد اليوم");
    expect(list[0]!.body).toBe("1 جهاز ينتهي اليوم · 1 جهاز ينتهي غدًا · 1 جهاز منتهي · ديون مستحقة: 1,500 أوقية");
    expect(list[1]!.body).toBe("1 جهاز ينتهي اليوم · 2 جهاز منتهي · ديون مستحقة: 1,500 أوقية");
    expect(list).toHaveLength(7);
  });

  it("starts today when the morning time is still ahead; an expired device keeps showing", () => {
    const early = new Date(2026, 8, 25, 6, 0);
    const list = buildMorningDigests({ accounts: [acc("a", "2026/09/25")], owedByCurrency: {}, now: early, hour: 8 });
    expect(list[0]!.at).toEqual(new Date(2026, 8, 25, 8, 0));
    expect(list[1]!.body).toBe("1 جهاز منتهي");
  });

  it("schedules nothing on days with nothing to report", () => {
    const list = buildMorningDigests({ accounts: [acc("a", "2026/12/30")], owedByCurrency: {}, now, hour: 8 });
    expect(list).toEqual([]);
  });
});
