import { describe, expect, it } from "vitest";
import { clientChangeEvents, collapseEvents, deviceChangeEvents, ledgerChangeEvents, rateChangeEvents } from "./changeLog";
import { oldestOpenDebt } from "./deviceFault";
import type { LedgerEntry } from "./ledgerStore";

// Fake records only.
const dev = (extra: Record<string, unknown> = {}) => ({ id: "d1", name: "Dish A", expectedEmail: "demo@example.com", ...extra });

describe("🔔 change notices (his Oct 14 2026 ask: «أي تعديل على الأجهزة أو الزبائن أو حذف لمعاملة»)", () => {
  it("a device edited by a person - not what a Starlink sync writes, not a new device", () => {
    const [edit] = deviceChangeEvents([dev()], [dev({ name: "Dish B", clientId: "c1", serviceStatus: "suspended" })]);
    expect(edit!.text).toBe("✏️ تعديل الجهاز «Dish B» (كان «Dish A»)\nالاسم، الزبون");
    expect(edit!.route).toBe("/?q=demo%40example.com");
    expect(deviceChangeEvents([dev()], [dev({ serviceStatus: "suspended", lastSuccessfulScanAt: "x", balanceDue: "9" })])).toEqual([]);
    expect(deviceChangeEvents([], [dev()])).toEqual([]);
  });

  it("a device trashed, archived or gone for good", () => {
    expect(deviceChangeEvents([dev()], [dev({ deletedAt: "2026-10-14" })])[0]!.text).toBe("🗑 حُذف الجهاز «Dish A» (في سلة المحذوفات)");
    expect(deviceChangeEvents([dev()], [dev({ archivedAt: "2026-10-14" })])[0]!.text).toBe("📦 أُرشف الجهاز «Dish A»");
    expect(deviceChangeEvents([dev()], [])[0]!.text).toBe("🗑 حُذف الجهاز «Dish A» نهائيًا");
  });

  it("a customer edited or deleted", () => {
    const before = { c1: { id: "c1", name: "Client One", phone: "1", updatedAt: "a" }, c2: { id: "c2", name: "Client Two" } };
    const after = { c1: { id: "c1", name: "Client One", phone: "2", updatedAt: "b" } };
    expect(clientChangeEvents(before, after).map((e) => e.text)).toEqual(["✏️ تعديل الزبون «Client One»\nالهاتف", "🗑 حُذف الزبون «Client Two»"]);
    // only a timestamp moved: no notice
    expect(clientChangeEvents(before, { ...before, c1: { ...before.c1, updatedAt: "z" } })).toEqual([]);
  });

  it("an operation deleted or edited in what it says - a new one or a D paid is no notice", () => {
    const op = { id: "e1", kind: "debit", amount: 13500, currency: "SIFA", date: "2026-10-14", starlinkCost: { status: "pending" } };
    const name = () => "Dish A";
    expect(ledgerChangeEvents({ d1: [op] }, { d1: [] }, name)[0]!.text).toBe("🗑 حُذفت عملية من «Dish A»\nتجديد 13,500 سيفا · 2026-10-14");
    expect(ledgerChangeEvents({ d1: [op] }, { d1: [{ ...op, amount: 12000 }] }, name)[0]!.text).toBe(
      "✏️ عُدّلت عملية على «Dish A»\nتجديد 13,500 سيفا · 2026-10-14 ← تجديد 12,000 سيفا · 2026-10-14",
    );
    expect(ledgerChangeEvents({ d1: [op] }, { d1: [{ ...op, starlinkCost: { status: "settled" } }, { ...op, id: "e2" }] }, name)).toEqual([]);
  });

  it("💱 a currency's rate moved", () => {
    const before = { HNL: { code: "HNL", name: "ليمبيرا", rateFromUsd: 26.84 }, USD: { code: "USD", rateFromUsd: 1 } };
    const after = { ...before, HNL: { ...before.HNL, rateFromUsd: 26.57 } };
    expect(rateChangeEvents(before, after)).toEqual([{ text: "💱 تغيّر سعر ليمبيرا (HNL)\n1$ = 26.84 ← 26.57", route: "/currencies" }]);
    expect(rateChangeEvents(before, before)).toEqual([]);
  });

  it("one big save (a restore…) is one notice", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ text: `✏️ ${i}\nx`, route: "/" }));
    const [one] = collapseEvents(many);
    expect(one!.text.split("\n")[0]).toBe("🔔 12 تعديلات دفعة واحدة");
    expect(collapseEvents(many.slice(0, 3))).toHaveLength(3);
  });
});

describe("💳 the card's «D» opens the payment of its oldest unpaid Starlink cost", () => {
  it("oldest by date, then by when it was recorded", () => {
    const d = (id: string, date: string, createdAt: string, status = "pending") =>
      ({ id, kind: "debit", amount: 1, currency: "USD", date, createdAt, starlinkCost: { status, currencyCode: "USD", amount: 10 } }) as unknown as LedgerEntry;
    expect(oldestOpenDebt([d("b", "2026-10-07", "2"), d("a", "2026-10-07", "1"), d("c", "2026-10-01", "3", "settled")])!.id).toBe("a");
    expect(oldestOpenDebt([])).toBeNull();
  });
});
