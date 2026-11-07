import { describe, expect, it } from "vitest";
import { isLinkedWrite, otherHeadsChanged } from "./linkPulse";

describe("⚡ the live link (his Nov 7 2026 ask «سريعة جدًا»)", () => {
  it("only another member's head starts a round - never mine, never what was already there", () => {
    expect(otherHeadsChanged([{ id: "phone", type: "added" }, { id: "m1", type: "added" }], "phone", true)).toBe(false);
    expect(otherHeadsChanged([{ id: "m1", type: "modified" }], "phone", false)).toBe(true);
    expect(otherHeadsChanged([{ id: "phone", type: "modified" }], "phone", false)).toBe(false);
    expect(otherHeadsChanged([{ id: "m1", type: "removed" }], "phone", false)).toBe(false);
  });

  it("a save of business data or a shared setting goes out; the phone's own settings don't", () => {
    const shared = ["starnet.repDeviceCodes"];
    expect(isLinkedWrite("starnet_customer_ledger_v1", shared)).toBe(true);
    expect(isLinkedWrite("starnet.repDeviceCodes", shared)).toBe(true);
    expect(isLinkedWrite("starnet.deviceLinkState", shared)).toBe(false);
    expect(isLinkedWrite("starnet.telegramToken", shared)).toBe(false);
  });
});
