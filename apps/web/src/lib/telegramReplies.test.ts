import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import { describe, expect, it } from "vitest";
import type { Representative } from "./repStore";
import { buildReplySnapshot, snapshotTime } from "./telegramReplies";

function account(id: string, repId: string, rechargeDate: string): StarlinkAccountSummary {
  return {
    id, customerId: id, name: id, deviceName: "Kit", kitNumber: "", serialNumber: "", standbyDate: "", rechargeDate,
    balanceDue: "0", currency: "USD", dishStatus: DeviceStatus.GREEN, wifiStatus: DeviceStatus.GREEN, alertReason: "",
    lastUpdated: "", lastSuccessfulScanAt: null, planName: "", representativeId: repId,
  };
}

const rep = (id: string, name: string) => ({ id, name, commissionPercent: 50, createdAt: "", updatedAt: "" }) as Representative;

describe("buildReplySnapshot", () => {
  const snapshot = buildReplySnapshot({
    now: new Date(2026, 8, 27, 16, 5),
    today: "2026-09-27",
    accounts: [account("جهاز-سالم", "r1", "2026/09/28"), account("جهاز-علي", "r2", "2026/09/29")],
    clients: {},
    cash: [],
    ledgerStore: {},
    representatives: { r1: rep("r1", "سالم"), r2: rep("r2", "علي") },
    linkedRepIds: ["r1", "gone"],
    invoices: [],
    settlements: [],
    rates: { MRU: 40 },
  });

  it("prepares answers only for linked reps, each with his own devices only", () => {
    expect(Object.keys(snapshot.reps)).toEqual(["r1"]);
    const mine = Object.values(snapshot.reps.r1!).join("\n");
    expect(mine).toContain("جهاز-سالم");
    expect(mine).not.toContain("جهاز-علي");
    expect(snapshot.reps.r1!.statement).toContain("سالم");
    expect(snapshot.reps.r1!.stopped).toContain("لا أجهزة موقوفة");
    expect(snapshot.repSearch.r1!.map((e) => e.t.split("\n")[0])).toEqual(["📡 جهاز-سالم"]);
    expect(snapshot.repSearch.r2).toBeUndefined();
    expect(JSON.parse(snapshot.repKeyboard).keyboard).toHaveLength(5);
    expect(snapshot.plans).toEqual(["ROM", "Sis", "100G"]);
    expect(snapshot.repSearch.r1![0]!.i).toBe("جهاز-سالم");
    expect(snapshot.reps.r1!.name).toBe("سالم");
    expect(snapshot.repWords["دفعه"]).toBe("payment");
    expect(snapshot.requestNotice).toContain("{rep}");
    expect(snapshot.reps.r1!.days).toContain("غداً");
    expect(snapshot.repSearch.r1![0]!.d).toBe("2026-09-28");
    expect(snapshot.repWords["بحث"]).toBe("search");
  });

  it("owner answers, command words and templates", () => {
    expect(snapshot.owner.expiring).toContain("جهاز-علي");
    expect(snapshot.ownerWords["كشف"]).toBe("statement");
    expect(snapshot.ownerWords["المتوقفة"]).toBe("stopped");
    expect(snapshot.repWords["اجهزتي"]).toBe("devices"); // folded, as the service looks it up
    expect(snapshot.repWords["الصندوق"]).toBeUndefined();
    expect(snapshot.linkReply).toContain("{name}");
    expect(snapshot.at).toBe("27/09 16:05");
  });

  it("time label", () => {
    expect(snapshotTime(new Date(2026, 0, 3, 9, 7))).toBe("03/01 09:07");
  });
});
