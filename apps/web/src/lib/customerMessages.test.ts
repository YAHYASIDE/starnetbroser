import { describe, expect, it } from "vitest";
import {
  addSentMessage,
  customerMessages,
  customerMessageText,
  DEFAULT_CUSTOMER_MESSAGES,
  editCustomerMessage,
  isBrowserCustomerMessage,
  isEdited,
  localDateOf,
  MAX_SENT_PER_DEVICE,
  messageById,
  messageEffectPlan,
  messagesForBrowser,
  messagesOfKind,
  OFF_DAYS_MS,
  sentAgo,
  type CustomerMessageLog,
} from "./customerMessages";

describe("his ready messages", () => {
  it("keeps his lists: 1 travel, 9 states, 5 activations, unique ids", () => {
    const list = customerMessages();
    expect(messagesOfKind(list, "travel")).toHaveLength(1);
    expect(messagesOfKind(list, "status")).toHaveLength(9);
    expect(messagesOfKind(list, "activation")).toHaveLength(5);
    expect(new Set(list.map((m) => m.id)).size).toBe(list.length);
  });

  it("an edit replaces only what changed; an emptied text or the default text goes back to his original", () => {
    let edits = editCustomerMessage({}, "ok", { label: "✅ تمام", body: DEFAULT_CUSTOMER_MESSAGES[1]!.body });
    expect(edits).toEqual({ ok: { label: "✅ تمام" } });
    expect(customerMessages(edits).find((m) => m.id === "ok")!.label).toBe("✅ تمام");
    expect(isEdited(edits, "ok")).toBe(true);
    edits = editCustomerMessage(edits, "ok", { label: "  ", body: "" });
    expect(edits).toEqual({});
    expect(editCustomerMessage({}, "nothing-like-this", { label: "x", body: "y" })).toEqual({});
  });

  it("cleans the body: lines trimmed, no run of blank lines", () => {
    const edits = editCustomerMessage({}, "wires", { label: "", body: "  سطر أول  \r\n\n\n\n  سطر ثانٍ " });
    expect(customerMessages(edits).find((m) => m.id === "wires")!.body).toBe("سطر أول\n\nسطر ثانٍ");
  });

  it("the whole message matches the browser's (ShotMessages.text)", () => {
    expect(customerMessageText("✅ تم توثيق جهاز Starlink الخاص بك بنجاح.", " أحمد ", "DEMO 1")).toBe(
      "مرحبًا أحمد،\n✅ تم توثيق جهاز Starlink الخاص بك بنجاح.\n📡 الجهاز: DEMO 1\n⭐ STAR NET",
    );
    expect(customerMessageText("نص", null, " ")).toBe("مرحبًا،\nنص\n⭐ STAR NET");
  });

  it("goes to the browser as one JSON with his edits", () => {
    const pack = JSON.parse(messagesForBrowser(customerMessages({ act50: { body: "📶 50 جيجا جاهزة" } })));
    expect(pack.travel.id).toBe("travelDone");
    expect(pack.status).toHaveLength(9);
    expect(pack.activation.find((m: { id: string }) => m.id === "act50").body).toBe("📶 50 جيجا جاهزة");
  });
});

describe("what was sent", () => {
  it("newest first, one entry per send, at most 30 per device", () => {
    let log: CustomerMessageLog = {};
    log = addSentMessage(log, "d1", { id: "ok", label: "✅", at: 10, via: "card" });
    log = addSentMessage(log, "d1", { id: "act100", label: "📶", at: 20, via: "browser", by: "المسؤول 2" });
    log = addSentMessage(log, "d1", { id: "act100", label: "📶", at: 20, via: "browser" });
    expect(log.d1!.map((s) => s.id)).toEqual(["act100", "ok"]);
    expect(log.d1![0]!.by).toBe("المسؤول 2");
    for (let i = 0; i < 40; i++) log = addSentMessage(log, "d1", { id: "ok", label: "✅", at: 100 + i, via: "card" });
    expect(log.d1).toHaveLength(MAX_SENT_PER_DEVICE);
    expect(log.d1![0]!.at).toBe(139);
  });

  it("says how long ago", () => {
    const now = Date.UTC(2026, 10, 7, 12);
    expect(sentAgo(now - 30_000, now)).toBe("الآن");
    expect(sentAgo(now - 2 * 60_000, now)).toBe("منذ دقيقتين");
    expect(sentAgo(now - 5 * 3600_000, now)).toBe("منذ 5 ساعات");
    expect(sentAgo(now - 2 * 86400_000, now)).toBe("منذ يومين");
    expect(sentAgo(Date.UTC(2026, 9, 1, 12), now)).toBe("2026/10/01");
  });
});

describe("the message changes the device", () => {
  const now = Date.UTC(2026, 10, 7, 9);
  const byId = (id: string) => messageById(customerMessages(), id)!;

  it("travel done marks it, burned puts it in «المعطلة» once, off 3 days sets a reminder 3 days later", () => {
    expect(messageEffectPlan(byId("travelDone"), {}, now)).toEqual({ travelDone: true });
    expect(messageEffectPlan(byId("burned"), {}, now).fault).toMatchObject({ reason: "burned", reportedAt: new Date(now).toISOString() });
    expect(messageEffectPlan(byId("burned"), { deviceFault: { reason: "moved", note: "", reportedAt: "x" } }, now)).toEqual({});
    expect(messageEffectPlan(byId("off3days"), {}, now).reminder?.at).toBe(now + OFF_DAYS_MS);
    expect(messageEffectPlan(byId("act100"), {}, now)).toEqual({});
    expect(localDateOf(new Date(2026, 10, 10, 9).getTime())).toBe("2026-11-10");
  });

  it("knows the browser's read and the message it names", () => {
    expect(isBrowserCustomerMessage({ fields: { customerMessage: { id: "ok", at: 1 } } })).toBe(true);
    expect(isBrowserCustomerMessage({ fields: { deviceShot: {} } })).toBe(false);
    expect(messageById(customerMessages(), "nope")).toBeNull();
    expect(messageById(customerMessages(), 5)).toBeNull();
  });
});
