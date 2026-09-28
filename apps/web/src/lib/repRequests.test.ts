import { describe, expect, it } from "vitest";
import { addRepRequest, parseRepClient, parseRepPayment, pendingRepRequests, resolveRepRequest } from "./repRequests";

describe("parseRepPayment", () => {
  it("reads amount, currency (أوقية by default) and the device/customer words", () => {
    expect(parseRepPayment("5000 من محمد")).toEqual({ amount: 5000, currency: "MRU", query: "محمد" });
    expect(parseRepPayment("50 دولار مقهى النخيل")).toEqual({ amount: 50, currency: "USD", query: "مقهى النخيل" });
    expect(parseRepPayment("٥٬٠٠٠ أوقية عن منزل")).toEqual({ amount: 5000, currency: "MRU", query: "منزل" });
    expect(parseRepPayment("20$ abdlkrim")).toEqual({ amount: 20, currency: "USD", query: "abdlkrim" });
    expect(parseRepPayment("3000 سيفا")).toEqual({ amount: 3000, currency: "SIFA", query: "" });
  });

  it("no amount -> null", () => {
    expect(parseRepPayment("")).toBeNull();
    expect(parseRepPayment("من محمد")).toBeNull();
    expect(parseRepPayment("0 محمد")).toBeNull();
  });
});

describe("parseRepClient", () => {
  it("picks name, phone, email and kit in any order", () => {
    expect(parseRepClient("محمد أحمد 22212345 x@Gmail.com KIT304511")).toEqual({
      name: "محمد أحمد",
      phone: "22212345",
      email: "x@gmail.com",
      kit: "KIT304511",
    });
    expect(parseRepClient("الاسم: سالم الهاتف: +222 4180 4013")).toEqual({ name: "سالم", phone: "22241804013" });
  });

  it("needs a name or a phone", () => {
    expect(parseRepClient("x@gmail.com")).toBeNull();
    expect(parseRepClient("")).toBeNull();
    expect(parseRepClient("٢٢٢٤١٨٠٤٠١٣")).toEqual({ phone: "22241804013" });
  });
});

describe("request list", () => {
  it("adds pending, resolves", () => {
    const list = addRepRequest([], { repId: "r1", kind: "payment", text: "  دفعة 5000 محمد ", amount: 5000, currency: "MRU" }, new Date("2026-09-28T10:00:00Z"));
    expect(list[0]).toMatchObject({ repId: "r1", status: "pending", text: "دفعة 5000 محمد", createdAt: "2026-09-28T10:00:00.000Z" });
    const done = resolveRepRequest(list, list[0]!.id, "approved");
    expect(pendingRepRequests(done)).toHaveLength(0);
    expect(done[0]!.status).toBe("approved");
  });

  it("drops a device's encrypted file once resolved", () => {
    const list = addRepRequest([], { repId: "r1", kind: "device", text: "جهاز", name: "محمد", file: "{...}" });
    expect(list[0]!.file).toBe("{...}");
    const done = resolveRepRequest(list, list[0]!.id, "rejected");
    expect(done[0]!.file).toBeUndefined();
    expect(done[0]).toMatchObject({ name: "محمد", status: "rejected" });
  });
});
