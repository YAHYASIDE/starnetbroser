import { describe, expect, it } from "vitest";
import { activityNotification, describeOp, deviceOrigin, entryOrigin, nextOrigins } from "./teamActivity";

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
    expect(describeOp({ k: "starnet_customer_ledger_v1", r: `a2${SEP}e1`, v: null, at }, '{"amount":5000,"currency":"MRU"}', "x")).toMatchObject({ kind: "del", label: "💵 عملية 5,000 أوقية", notable: false });
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

