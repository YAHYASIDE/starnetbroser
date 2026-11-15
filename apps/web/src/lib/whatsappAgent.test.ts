import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { agentNumberKeys, agentUserText, cleanAgentSettings, customerFacts, handoffNotice, MAX_TURNS, withTurns } from "./whatsappAgent";

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
    expect(customerFacts({ name: "x" }, [], {}, () => null)).toContain("He owes: لا شيء");
  });

  it("what Claude reads: payment lines, facts or «unknown», the last turns, the new message", () => {
    const chat = withTurns([], { from: "customer", text: "السلام", at: 1 }, { from: "agent", text: "مرحبا", at: 2 });
    const text = agentUserText({ business: "STAR NET", paymentLines: "• BANKILY : 0000", facts: null, senderName: "أحمد", chat, message: "كم سعر التجديد؟" });
    expect(text).toContain("Unknown sender");
    expect(text).toContain("Customer: السلام\nSTAR NET: مرحبا");
    expect(text).toContain("كم سعر التجديد؟");
    const long = withTurns([], ...Array.from({ length: 20 }, (_, i) => ({ from: "customer" as const, text: String(i), at: i })));
    expect(long).toHaveLength(MAX_TURNS);
    expect(long[0]!.text).toBe("8");
    expect(handoffNotice("أحمد", "22230000002", "دفعت", "يقول إنه دفع")).toContain("السبب: يقول إنه دفع");
  });
});
