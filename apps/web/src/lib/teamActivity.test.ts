import { describe, expect, it } from "vitest";
import { activityLine, activityNotification, dayKey, describeOp, deviceOrigin, entryOrigin, filterLog, logCategory, logSummary, nextOrigins, normalizeQuery, type TeamActivity } from "./teamActivity";

// Fake data only.
const at = "2026-10-31T10:00:00.000Z";
const SEP = "\u001f";

describe("👥 what came from the team (his Oct 31 2026 «المسؤول 2»)", () => {
  it("says what each applied op was, and which are worth a notification", () => {
    const device = describeOp({ k: "starnet_demo_accounts_v1", r: "a2", v: JSON.stringify({ id: "a2", name: "DEMO 2" }), at }, undefined, "المسؤول 2");
    expect(device).toMatchObject({ kind: "add", label: "📡 جهاز DEMO 2", notable: true });
    const pay = describeOp({ k: "starnet_customer_ledger_v1", r: `a2${SEP}e1`, v: JSON.stringify({ id: "e1", amount: 5000, currency: "MRU" }), at }, undefined, "المسؤول 2");
    expect(pay).toMatchObject({ kind: "add", label: "💵 عملية 5,000 أوقية", notable: true });
    const renamed = describeOp({ k: "starnet_clients_v1", r: "c1", v: JSON.stringify({ name: "DEMO" }), at }, "{}", "x");
    expect(renamed).toMatchObject({ kind: "edit", notable: false });
    expect(describeOp({ k: "starnet_customer_ledger_v1", r: `a2${SEP}e1`, v: null, at }, '{"amount":5000,"currency":"MRU"}', "x")).toMatchObject({ kind: "del", label: "💵 عملية 5,000 أوقية", notable: true });
    expect(describeOp({ k: "starnet_some_setting_v1", r: "*", v: "1", at }, undefined, "x")).toBeNull();
  });

  it("marks what a member added or changed, and forgets a deleted one", () => {
    const device = describeOp({ k: "starnet_demo_accounts_v1", r: "a2", v: "{}", at }, undefined, "المسؤول 2")!;
    const pay = describeOp({ k: "starnet_customer_ledger_v1", r: `a2${SEP}e1`, v: '{"amount":1}', at }, undefined, "المسؤول 2")!;
    let origins = nextOrigins({}, [device, pay]);
    expect(deviceOrigin(origins, "a2")).toEqual({ by: "المسؤول 2", at });
    expect(entryOrigin(origins, "a2", "e1")?.by).toBe("المسؤول 2");
    origins = nextOrigins(origins, [{ ...device, kind: "del" }]);
    expect(deviceOrigin(origins, "a2")).toBeUndefined();
  });

  it("one notification per round, three lines at most", () => {
    const add = (n: number) => describeOp({ k: "starnet_demo_accounts_v1", r: `a${n}`, v: JSON.stringify({ name: `DEMO ${n}` }), at }, undefined, "المسؤول 2")!;
    expect(activityNotification([add(1)])).toBe("🔗 المسؤول 2\nأضاف 📡 جهاز DEMO 1");
    expect(activityNotification([add(1), add(2), add(3), add(4), add(5)])!.split("\n")).toHaveLength(5);
    expect(activityNotification([])).toBeNull();
  });

  it("🚩 a team alert notifies (his Nov 7 2026 ask), and so does YAHYA's «✓ راجعته» on it", () => {
    const flag = { id: "f1", repId: "", deviceId: "d1", deviceName: "DEMO 1", note: "لا يتصل", at: 1, receivedAt: 1, by: "المسؤول 2", level: "urgent" };
    const added = describeOp({ k: "starnet_rep_flags_v1", r: "f1", v: JSON.stringify(flag), at: "t" }, undefined, "المسؤول 2");
    expect(added).toMatchObject({ kind: "add", notable: true, label: "🚩 🔴 عاجل - تنبيه على DEMO 1: لا يتصل" });
    const reviewed = describeOp({ k: "starnet_rep_flags_v1", r: "f1", v: JSON.stringify({ ...flag, reviewedAt: 5 }), at: "t" }, JSON.stringify(flag), "YAHYA");
    expect(reviewed).toMatchObject({ kind: "edit", notable: true, label: "✓ رُوجع التنبيه على DEMO 1" });
    // a rep's warning travels quietly (the rep path already told the owner's bot)
    expect(describeOp({ k: "starnet_rep_flags_v1", r: "f2", v: JSON.stringify({ ...flag, by: undefined, repId: "rep1" }), at: "t" }, undefined, "x")).toBeNull();
  });
});

describe("💱 a rate changed on another phone (Nov 21 2026)", () => {
  it("says who changed which rate, and a pin moving", () => {
    const k = "starnet_currencies_v1";
    const before = JSON.stringify({ code: "EUR", rateFromUsd: 0.86, pinnedAt: "x" });
    const a = describeOp({ k, r: "EUR", v: JSON.stringify({ code: "EUR", rateFromUsd: 0.2675 }), at: "t" }, before, "المسؤول 2");
    expect(a).toMatchObject({ by: "المسؤول 2", label: "💱 EUR = 0.2675 🔓 أزال التثبيت", notable: true });
    expect(describeOp({ k, r: "EUR", v: JSON.stringify({ code: "EUR", rateFromUsd: 0.86, pinnedAt: "x", name: "y" }), at: "t" }, before, "x")).toBeNull();
  });
});

describe("📜 سجل العمليات (his Nov 26 2026): D, deletions, day / kind / type / words", () => {
  const ledgerKey = "starnet_customer_ledger_v1";
  const op = (k: string, r: string, v: object | null, at = "2026-11-26T10:00:00.000Z") => ({ k, r, v: v === null ? null : JSON.stringify(v), at });

  it("a deletion is always notable, the line and the notification say 🗑️ and lead", () => {
    const del = describeOp(op("starnet_clients_v1", "c1", null), JSON.stringify({ id: "c1", name: "زبون" }), "المسؤول 2")!;
    expect(del).toMatchObject({ kind: "del", notable: true, label: "👤 زبون زبون" });
    expect(activityLine(del)).toBe("🗑️ حذف 👤 زبون زبون");
    const add = describeOp(op("starnet_cash_entries_v1", "k1", { id: "k1", amount: 500, currency: "MRU" }), undefined, "المسؤول 2")!;
    const text = activityNotification([add, del])!;
    expect(text.startsWith("🗑️ حذف من الفريق (1) - المسؤول 2")).toBe(true);
    expect(text.indexOf("🗑️ حذف 👤 زبون زبون")).toBeLessThan(text.indexOf("أضاف"));
  });

  it("a device's debit operation is its D (and a deleted one says so)", () => {
    const rec = { id: "e1", kind: "debit", amount: 54876, currency: "ARS" };
    const del = describeOp(op(ledgerKey, `a1\u001fe1`, null), JSON.stringify(rec), "المسؤول 2")!;
    expect(del.d).toBe(true);
    expect(del.label).toContain("🅳 D");
    expect(activityLine(del)).toContain("🗑️ حذف 🅳 D");
    const pay = describeOp(op(ledgerKey, `a1\u001fe2`, { id: "e2", kind: "credit", amount: 100, currency: "MRU" }), undefined, "x")!;
    expect(pay.d).toBeUndefined();
    expect(logCategory(del)).toBe("d");
    expect(logCategory(pay)).toBe("money");
  });

  const at = (day: string, h = "10") => `${day}T${h}:00:00`;
  const log: TeamActivity[] = [
    { at: at("2026-11-26", "12"), by: "المسؤول 2", kind: "del", k: ledgerKey, r: "a|e1", label: "🅳 D 54,876 بيزو", notable: true, d: true },
    { at: at("2026-11-26", "11"), by: "YOUBE", kind: "add", k: "starnet_cash_entries_v1", r: "c1", label: "💵 الكاش 500 أوقية", notable: true },
    { at: at("2026-11-26", "09"), by: "المسؤول 2", kind: "edit", k: "starnet_currencies_v1", r: "EUR", label: "💱 EUR = 0.92", notable: true },
    { at: at("2026-11-25", "15"), by: "YOUBE", kind: "del", k: "starnet_clients_v1", r: "x", label: "👤 أحمد", notable: true },
  ];

  it("by day, kind, type and words", () => {
    expect(dayKey(at("2026-11-26"))).toBe("2026-11-26");
    expect(filterLog(log, { day: "2026-11-26" })).toHaveLength(3);
    expect(filterLog(log, { day: "2026-11-25" }).map((a) => a.label)).toEqual(["👤 أحمد"]);
    expect(filterLog(log, { kind: "del" })).toHaveLength(2);
    expect(filterLog(log, { cat: "d" }).map((a) => a.by)).toEqual(["المسؤول 2"]);
    expect(filterLog(log, { cat: "rate" })).toHaveLength(1);
    expect(filterLog(log, { q: "yoube" })).toHaveLength(2);
    expect(filterLog(log, { q: "أحمد" })).toHaveLength(1);
    // digits any way, thousand separators ignored
    expect(filterLog(log, { q: "٥٤٨٧٦" })).toHaveLength(1);
    expect(filterLog(log, { q: "54,876" })).toHaveLength(1);
    // all together
    expect(filterLog(log, { day: "2026-11-26", kind: "del", cat: "d", q: "بيزو" })).toHaveLength(1);
    expect(filterLog(log, { day: "2026-11-25", cat: "d" })).toHaveLength(0);
  });

  it("the day's summary", () => {
    expect(logSummary(filterLog(log, { day: "2026-11-26" }))).toBe("3 عملية: 1 إضافة · 1 تعديل · 1 حذف");
    expect(normalizeQuery("  ٥٠٠ أوقية ")).toBe("500 اوقية");
  });
});
