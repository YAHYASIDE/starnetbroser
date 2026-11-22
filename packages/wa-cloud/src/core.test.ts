import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, defaultMenuDoc } from "../../../apps/web/src/lib/agentMenus";
import { handleIncoming, incomingFrom, key8, parseClaude, release, staffReply, userText, type Deps, type Pack, type Store } from "./core";
import { open, seal, validMetaSignature } from "./seal";

// Fake numbers, names and keys only.
const NOW = Date.parse("2026-11-22T12:00:00Z");

function memory(): Store & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    put: async (k, v) => void data.set(k, v),
    del: async (k) => void data.delete(k),
    list: async (p) => [...data.keys()].filter((k) => k.startsWith(p)),
  };
}

function pack(over: Partial<Pack> = {}): Pack {
  return {
    apiKey: "sk-ant-fake",
    model: "claude-haiku-5-5",
    system: "SYSTEM",
    schema: { type: "object" },
    business: "STAR NET",
    payment: "• BANKILY : 0000",
    lessons: "",
    catalog: "",
    menu: "",
    facts: { "70000001": "Known customer: زبون" },
    chats: {},
    open: {},
    menus: defaultMenuDoc(),
    menuSettings: DEFAULT_SETTINGS,
    paused: {},
    cloud: { token: "t", phoneNumberId: "123", appSecret: "secret", verifyToken: "v" },
    ...over,
  };
}

function fakes(claudeReply = '{"reply":"سعر التجديد 20,000 أوقية","handoff":false,"reason":""}') {
  const sent: Record<string, unknown>[] = [];
  const asked: Record<string, unknown>[] = [];
  const store = memory();
  const deps: Deps = {
    store,
    now: () => NOW,
    sendWa: async (p) => (sent.push(p), { ok: true }),
    claude: async (b) => (asked.push(b), { status: 200, text: JSON.stringify({ stop_reason: "end_turn", usage: { input_tokens: 3000, output_tokens: 80 }, content: [{ type: "text", text: claudeReply }] }) }),
    imageUrl: () => null,
  };
  return { deps, sent, asked, store };
}

const msg = (id: string, text: string, extra: Record<string, unknown> = {}) => ({ id, from: "22270000001", name: "زبون", at: NOW - 1000, text, ...extra });
const events = (store: Store & { data: Map<string, string> }) => [...store.data.entries()].filter(([k]) => k.startsWith("ev:")).map(([, v]) => JSON.parse(v));
const nonRead = (sent: Record<string, unknown>[]) => sent.filter((p) => p.status !== "read");

describe("☁️ the Cloud API agent (Nov 22 2026)", () => {
  it("reads Meta's webhook: text, a tapped row / button, a voice note", () => {
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: "22270000001", profile: { name: "زبون" } }],
                messages: [
                  { from: "22270000001", id: "m1", timestamp: "1795000000", type: "text", text: { body: "السلام عليكم" } },
                  { from: "22270000001", id: "m2", timestamp: "1795000001", type: "interactive", interactive: { type: "list_reply", list_reply: { id: "pay", title: "💳 الدفع والفواتير" } } },
                  { from: "22270000001", id: "m3", timestamp: "1795000002", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "nav_home", title: "🏠 القائمة" } } },
                  { from: "22270000001", id: "m4", timestamp: "1795000003", type: "audio", audio: { id: "a" } },
                ],
              },
            },
          ],
        },
      ],
    };
    const got = incomingFrom(body);
    expect(got.map((m) => [m.id, m.text, m.tapId ?? null, m.name])).toEqual([
      ["m1", "السلام عليكم", null, "زبون"],
      ["m2", "💳 الدفع والفواتير", "pay", "زبون"],
      ["m3", "🏠 القائمة", "nav_home", "زبون"],
      ["m4", "[رسالة صوتية]", null, "زبون"],
    ]);
    expect(incomingFrom({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] })).toEqual([]);
    expect(key8("+222 7000-0001")).toBe("70000001");
  });

  it("a greeting → the welcome list; a tapped section → its list; never twice for the same message", async () => {
    const { deps, sent, store } = fakes();
    await handleIncoming(pack(), msg("m1", "السلام عليكم"), deps);
    await handleIncoming(pack(), msg("m1", "السلام عليكم"), deps);
    expect(nonRead(sent)).toHaveLength(1);
    expect(nonRead(sent)[0]).toMatchObject({ to: "22270000001", type: "interactive", interactive: { type: "list" } });
    await handleIncoming(pack(), msg("m2", "💳", { tapId: "pay" }), deps);
    expect(nonRead(sent)[1]).toMatchObject({ interactive: { type: "list", action: { sections: [{ rows: expect.arrayContaining([expect.objectContaining({ id: "py_ways" })]) }] } } });
    expect(events(store).map((e) => [e.type, e.node ?? null])).toEqual([["menu", null], ["menu", "pay"]]);
  });

  it("a typed question → Claude with the facts and the section; the answer with the two buttons", async () => {
    const { deps, sent, asked, store } = fakes();
    await handleIncoming(pack(), msg("m1", "كم سعر التجديد؟"), deps);
    expect(asked).toHaveLength(1);
    const user = (asked[0]!.messages as { content: string }[])[0]!.content;
    expect(user).toContain("Known customer: زبون");
    expect(asked[0]).toMatchObject({ model: "claude-haiku-5-5", system: "SYSTEM", output_config: { effort: "low" } });
    expect(nonRead(sent)[0]).toMatchObject({ type: "interactive", interactive: { type: "button", body: { text: "سعر التجديد 20,000 أوقية" } } });
    expect(events(store)[0]).toMatchObject({ type: "ai_answer", input: 3000, output: 80, model: "claude-haiku-5-5" });
  });

  it("«موظف» pauses the agent until he releases the customer; a staff reply goes out and is logged", async () => {
    const { deps, sent, store } = fakes();
    await handleIncoming(pack(), msg("m1", "موظف"), deps);
    expect(events(store)[0]).toMatchObject({ type: "handoff", node: "staff" });
    await handleIncoming(pack(), msg("m2", "متى يرد أحد؟"), deps);
    expect(nonRead(sent)).toHaveLength(1);
    expect(events(store).map((e) => e.type)).toEqual(["handoff", "staff_msg"]);
    await staffReply(deps, "22270000001", "مرحبًا، أنا يحيى", "هاتفي");
    expect(nonRead(sent)[1]).toMatchObject({ type: "text", text: { body: "مرحبًا، أنا يحيى" } });
    await release(store, "22270000001");
    await handleIncoming(pack(), msg("m3", "0"), deps);
    expect(nonRead(sent)[2]).toMatchObject({ interactive: { type: "list" } });
  });

  it("an order from a product card goes to a person; two unknown answers make the agent silent", async () => {
    const withProducts = pack({ menus: { ...defaultMenuDoc(), products: [{ id: "mini", name: "Starlink Mini", price: 12000, currency: "أوقية", available: true, description: "", enabled: true }] } });
    const a = fakes();
    await handleIncoming(withProducts, msg("m1", "🛒", { tapId: "prod_mini" }), a.deps);
    expect(events(a.store)[0]).toMatchObject({ type: "handoff", text: "أريد طلب Starlink Mini" });
    const b = fakes('{"reply":"لحظة من فضلك","handoff":true,"reason":"لا أعرف"}');
    await handleIncoming(pack(), msg("q1", "تخفيض؟"), b.deps);
    await handleIncoming(pack(), msg("q2", "وشحن؟"), b.deps);
    await handleIncoming(pack(), msg("q3", "؟"), b.deps);
    expect(b.asked).toHaveLength(2);
    expect(events(b.store).map((e) => e.type)).toEqual(["ai_handoff", "ai_handoff", "ai_silent"]);
  });

  it("Claude's errors in his words; the same user text as the app", () => {
    expect(parseClaude(401, "{}").error).toBe("مفتاح Claude غير صحيح");
    expect(parseClaude(400, '{"error":{"message":"credit balance too low"}}').error).toBe("رصيد حساب Claude انتهى");
    expect(parseClaude(200, "x").error).toBe("جواب غير مفهوم من Claude");
    const t = userText(pack({ lessons: "- x", catalog: "Price list:\n• a" }), "70000001", "", [{ from: "customer", text: "سلام", at: 1 }], "كم؟", "2026-11-22", "الأسعار");
    expect(t).toBe(
      "Business: STAR NET\n\nHow to pay:\n• BANKILY : 0000\n\nKnown customer: زبون\n\nOwner's lessons:\n- x\n\nPrice list:\n• a\n\nToday: 2026-11-22\n\nConversation so far:\nCustomer: سلام\n\nCustomer chose in the menu: الأسعار\n\nCustomer's newest message:\nكم؟",
    );
  });
});

describe("🔐 sealed with the shared key; Meta's signature", () => {
  it("opens only with the same key", async () => {
    const k = "a".repeat(64);
    const s = await seal("سر", k);
    expect(await open(s, k)).toBe("سر");
    await expect(open(s, "b".repeat(64))).rejects.toThrow();
  });

  it("checks X-Hub-Signature-256", async () => {
    const body = '{"x":1}';
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const hex = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))), (b) => b.toString(16).padStart(2, "0")).join("");
    expect(await validMetaSignature(body, `sha256=${hex}`, "secret")).toBe(true);
    expect(await validMetaSignature(body + " ", `sha256=${hex}`, "secret")).toBe(false);
    expect(await validMetaSignature(body, null, "secret")).toBe(false);
  });
});
