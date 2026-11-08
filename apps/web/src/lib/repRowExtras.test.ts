import { describe, expect, it } from "vitest";
import { rowDeviceEmail, rowHasPhoto, rowOp, rowProofPlan } from "./repRowExtras";
import type { OpLogStore } from "./repOpLog";
import type { RepStatementRow } from "./repStore";

const customer = { type: "customer", id: "e1", date: "2026-11-08", createdAt: "x", op: { entryId: "e1", accountId: "d1" } } as unknown as RepStatementRow;
const settlement = { type: "settlement", id: "s1", date: "2026-11-07", createdAt: "x", settlement: { id: "s1" } } as unknown as RepStatementRow;
const log: OpLogStore = {
  r1: { next: 3, ops: [{ serial: 2, repId: "r1", ids: ["s1"], token: "t", at: "", sentAt: "", account: "", kind: "", figures: [], text: "", source: "", proofFileId: "tg-file", proofBot: "money" }] },
} as OpLogStore;

describe("🧾 rep statement rows: email and photo", () => {
  it("the device's email under its name; none for a row without a device", () => {
    const accounts = [{ id: "d1", starlinkAccountEmail: "", expectedEmail: "demo@example.com" }];
    expect(rowDeviceEmail(customer, accounts)).toBe("demo@example.com");
    expect(rowDeviceEmail(settlement, accounts)).toBeUndefined();
    expect(rowDeviceEmail(customer, [])).toBeUndefined();
  });

  it("the photo: kept under the record or its logged operation, else the Telegram file", () => {
    expect(rowOp(settlement, log, "r1")?.serial).toBe(2);
    expect(rowProofPlan(settlement, log, "r1", new Set(["oplog:r1:2"]))).toEqual({ keys: ["oplog:r1:2"], fileId: "tg-file", bot: "money" });
    expect(rowProofPlan(settlement, log, "r1", new Set(["s1", "oplog:r1:2"])).keys).toEqual(["s1", "oplog:r1:2"]);
    expect(rowHasPhoto(settlement, log, "r1", new Set())).toBe(true);
    expect(rowHasPhoto(customer, log, "r1", new Set())).toBe(false);
    expect(rowHasPhoto(customer, log, "r1", new Set(["e1"]))).toBe(true);
  });
});
