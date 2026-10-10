import { describe, expect, it } from "vitest";
import { repPaymentConfirmationText } from "./repPaymentConfirm";
import { claimRepRequest, hasBotRequest, releaseRepRequest, type RepRequest } from "./repRequests";

// Fake data only.
const request = (id: string, extra: Partial<RepRequest> = {}): RepRequest => ({ id, repId: "r1", kind: "payment", text: "💵 دفعة", createdAt: "2026-10-08T10:00:00.000Z", status: "pending", ...extra });

describe("🔒 a rep's payment counts once (his Oct 2026 double payment)", () => {
  it("the same bot message arriving twice is recognised", () => {
    const list = [request("a", { botId: "pay-1" })];
    expect(hasBotRequest(list, "pay-1")).toBe(true);
    expect(hasBotRequest(list, "pay-2")).toBe(false);
    expect(hasBotRequest(list, undefined)).toBe(false);
  });

  it("a request is taken once: the second tap gets nothing; a failed recording puts it back", () => {
    const list = [request("a")];
    const claimed = claimRepRequest(list, "a")!;
    expect(claimed[0]!.status).toBe("approved");
    expect(claimRepRequest(claimed, "a")).toBeNull();
    const back = releaseRepRequest(claimed, "a");
    expect(back[0]).toMatchObject({ status: "pending" });
    expect(back[0]!.resolvedAt).toBeUndefined();
    expect(claimRepRequest(back, "a")).not.toBeNull();
  });
});

describe("✅ the confirmation the rep reads", () => {
  it("«زبائنه عنده فقط»: what HE still owes for his devices", () => {
    const text = repPaymentConfirmationText({ value: 2000, currency: "SIFA", deviceName: "جهاز 1", balanceAfter: 0, repOwes: { SIFA: 44000 } });
    expect(text).toContain("✅ سُجّلت دفعتك 2,000 سيفا عن جهاز 1");
    expect(text).toContain("الباقي عليك عن أجهزتك: 44,000 سيفا");
    expect(text).not.toContain("الزبون");
  });

  it("other reps keep the customer's remaining balance", () => {
    expect(repPaymentConfirmationText({ value: 500, currency: "MRU", deviceName: "جهاز 1", clientName: "زبون", balanceAfter: 0 })).toContain("لم يبقَ على الزبون شيء");
  });
});
