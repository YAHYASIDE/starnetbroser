import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { agentModel, buildAgentPack, agentNumberKeys, agentSeenLines, agentSkipReason, agentUserText, cleanAgentSettings, customerFacts, handoffNotice, MAX_TURNS, withTurns } from "./whatsappAgent";

// Fake data only.
describe("🤖 WhatsApp agent (his Nov 15 2026 ask)", () => {
  it("his test numbers in any form → the last 8 digits, once", () => {
    expect(agentNumberKeys(["+222 2000 0001\n0022220000001, 3000-0003", "12"])).toEqual(["20000001", "30000003"]);
    expect(cleanAgentSettings({ on: true, numbers: ["1", 2] })).toEqual({ on: true, everyone: false, numbers: ["1"] });
    expect(cleanAgentSettings(null).on).toBe(false);
  });

  it("the customer's facts: each device, its usual price, what he owes - per currency", () => {
    const d = { id: "a1", name: "جهاز تجريبي", serviceStatus: "active", rechargeDate: "" } as StarlinkAccountSummary;
    const text = customerFacts({ name: "زبون تجريبي" }, [d], { SIFA: 8000, MRU: 0 }, () => ({ amount: 15000, currency: "SIFA" }));
    expect(text).toContain("Known customer: زبون تجريبي");
    expect(text).toContain("«جهاز تجريبي»: ✅ يعمل");
    expect(text).toContain("سعر تجديده المعتاد: 15,000 سيفا");
    expect(text).toContain("He owes: 8,000 سيفا");
    expect(customerFacts({ name: "x" }, [{ ...d, kitNumber: "KIT000000001", serialNumber: "SN0001" }], {}, () => null)).toContain("KIT: KIT000000001 · الرقم التسلسلي: SN0001");
    expect(customerFacts({ name: "x" }, [], {}, () => null)).toContain("He owes: لا شيء");
  });

  it("what Claude reads: payment lines, facts or «unknown», the last turns, the new message", () => {
    const chat = withTurns([], { from: "customer", text: "السلام", at: 1 }, { from: "agent", text: "مرحبا", at: 2 });
    const text = agentUserText({ business: "STAR NET", paymentLines: "• BANKILY : 0000", facts: null, senderName: "أحمد", chat, message: "كم سعر التجديد؟" });
    expect(text).toContain("Unknown sender");
    expect(text).toContain("Customer: السلام\nSTAR NET: مرحبا");
    expect(text).toContain("كم سعر التجديد؟");
    expect(text).not.toContain("Owner's lessons");
    expect(agentUserText({ business: "STAR NET", paymentLines: "", facts: null, senderName: "", chat: [], message: "كم؟", lessons: "- Q: كم\n  A: 20,000" })).toContain("Owner's lessons:\n- Q: كم\n  A: 20,000");
    const long = withTurns([], ...Array.from({ length: 20 }, (_, i) => ({ from: "customer" as const, text: String(i), at: i })));
    expect(long).toHaveLength(MAX_TURNS);
    expect(long[0]!.text).toBe("8");
    expect(handoffNotice("أحمد", "22230000002", "دفعت", "يقول إنه دفع")).toContain("السبب: يقول إنه دفع");
  });
});

describe("🔍 why the agent left a message (Nov 21 2026)", () => {
  it("says it in his words", () => {
    expect(agentSkipReason({ on: false, hasKey: true, ageMs: 0, freshMs: 900_000 })).toBe("الوكيل متوقف");
    expect(agentSkipReason({ on: true, hasKey: false, ageMs: 0, freshMs: 900_000 })).toBe("لا مفتاح Claude");
    expect(agentSkipReason({ on: true, hasKey: true, ageMs: 20 * 60_000, freshMs: 900_000 })).toBe("قُرئت بعد 20 دقيقة (أكثر من 15) - تُركت لك");
    expect(agentSkipReason({ on: true, hasKey: true, ageMs: 60_000, freshMs: 900_000 })).toBeNull();
  });

  it("shows the reader's last message", () => {
    expect(agentSeenLines({ at: 1, title: "+223 70 00 00 01", phone: "22370000001", from: "العنوان", hiddenId: true, test: true, reason: "✓ دخلت للوكيل" })).toEqual({
      phone: "+22370000001",
      note: "من العنوان · المحادثة بمعرّف مخفي (@lid)",
      match: "✓ من أرقام التجربة",
      reason: "✓ دخلت للوكيل",
    });
    expect(agentSeenLines({ at: 1, title: "زبون", hiddenId: false, test: false, reason: "محفوظ باسم - لم يُقرأ رقمه" })).toEqual({
      phone: null,
      note: "لا رقم",
      match: "-",
      reason: "محفوظ باسم - لم يُقرأ رقمه",
    });
  });
});

describe("🤖 answering while the app is closed (Nov 21 2026)", () => {
  it("🧠 Sonnet only when he turned it on", () => {
    expect(agentModel({})).toBe("claude-haiku-5-5");
    expect(agentModel({ smart: true })).toBe("claude-sonnet-5-5");
    expect(cleanAgentSettings({ on: true, smart: true }).smart).toBe(true);
    expect(cleanAgentSettings({ on: true, smart: "yes" }).smart).toBeUndefined();
  });

  it("the reader's pack: the same words, the last day's chats only", () => {
    const now = 10 * 24 * 3600_000;
    const pack = JSON.parse(
      buildAgentPack({
        apiKey: "sk-ant-fake",
        model: "claude-haiku-5-5",
        business: "STAR NET",
        payment: "• BANKILY : 0000",
        lessons: "- x",
        facts: { "70000001": "Known customer: زبون" },
        chats: { "70000001": [{ from: "customer", text: "سلام", at: now - 1000 }], "70000002": [{ from: "customer", text: "قديم", at: now - 2 * 24 * 3600_000 }] },
        open: { "70000001": 1 },
        now,
      }),
    );
    expect(pack.system).toContain("STAR NET");
    expect(pack.schema.required).toEqual(["reply", "handoff", "reason"]);
    expect(Object.keys(pack.chats)).toEqual(["70000001"]);
    expect(pack.open).toEqual({ "70000001": 1 });
    expect(pack.facts["70000001"]).toBe("Known customer: زبون");
  });
});
