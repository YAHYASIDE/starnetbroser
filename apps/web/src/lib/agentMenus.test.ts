import { describe, expect, it } from "vitest";
import {
  addNode,
  childrenOf,
  cleanMenus,
  DEFAULT_SETTINGS,
  defaultMenuDoc,
  defaultMenus,
  docProblems,
  handoffText,
  inHours,
  isGreeting,
  MENU_HINT,
  menuStep,
  moveNode,
  NAV_LINE,
  NO_STATE,
  publishMenus,
  removeNode,
  renderMenu,
  restoreVersion,
  unpublishMenus,
  updateNode,
} from "./agentMenus";

const NOW = Date.parse("2026-11-21T12:00:00Z");
const NOON = 12 * 60;
const PAY = "• BANKILY : 0000";

describe("🗂️ his six sections (Nov 21 2026 brief)", () => {
  it("the main menu and a section, as WhatsApp text", () => {
    const doc = defaultMenuDoc();
    expect(childrenOf(doc, null).map((n) => n.id)).toEqual(["accounts", "prices", "devices", "pay", "support", "staff"]);
    expect(renderMenu(doc, null)).toBe(
      "1️⃣ 📡 حساباتي وأجهزتي\n2️⃣ 💰 الأسعار والاشتراكات\n3️⃣ 🛰️ الأجهزة والإكسسوارات\n4️⃣ 💳 الدفع والفواتير\n5️⃣ 🛠️ الدعم الفني\n6️⃣ 👨‍💼 التحدث مع موظف\n\nاكتب رقم الخدمة 👆",
    );
    expect(renderMenu(doc, "pay")).toBe(
      `💳 الدفع والفواتير\n\n1️⃣ 🏦 طرق الدفع المتاحة\n2️⃣ 🧾 إرسال إثبات الدفع\n3️⃣ 📄 طلب فاتورة\n4️⃣ ⏳ حالة عملية الدفع\n5️⃣ 📊 سجل المدفوعات\n\n${NAV_LINE}`,
    );
    expect(docProblems(doc)).toEqual([]);
  });
});

describe("🧭 the navigation (no Claude)", () => {
  const doc = defaultMenuDoc();
  const s = DEFAULT_SETTINGS;

  it("a greeting opens a new conversation with the welcome and the menu, not twice in 12 hours", () => {
    const a = menuStep(doc, s, NO_STATE, "السلام عليكم", NOW, NOON, PAY);
    expect(a.kind).toBe("reply");
    expect(a.kind === "reply" && a.text.startsWith("🌐 مرحبًا بك في STAR NET")).toBe(true);
    expect(a.state.lastWelcomeAt).toBe(NOW);
    const b = menuStep(doc, s, a.state, "سلام", NOW + 3600_000, NOON, PAY);
    expect(b.kind === "reply" && b.text).toBe(renderMenu(doc, null));
  });

  it("a question first is answered by Claude, with the hint to the menu", () => {
    const a = menuStep(doc, s, NO_STATE, "كم سعر التجديد؟", NOW, NOON, PAY);
    expect(a).toMatchObject({ kind: "ai", suffix: MENU_HINT });
    expect(a.state.lastWelcomeAt).toBe(NOW);
  });

  it("numbers open sections and items; «رجوع», «0», «موظف»", () => {
    const st = { at: null, lastWelcomeAt: NOW };
    const open = menuStep(doc, s, st, "٤", NOW, NOON, PAY);
    expect(open).toMatchObject({ kind: "reply", node: "pay", state: { at: "pay" } });
    const ways = menuStep(doc, s, open.state, "1", NOW, NOON, PAY);
    expect(ways.kind === "reply" && ways.text).toBe(`💳 طرق الدفع المتاحة\n\n${PAY}\n\n${NAV_LINE}`);
    const proof = menuStep(doc, s, open.state, "2", NOW, NOON, PAY);
    expect(proof.kind === "reply" && proof.text.startsWith("أرسل صورة إثبات التحويل")).toBe(true);
    expect(menuStep(doc, s, open.state, "3", NOW, NOON, PAY)).toMatchObject({ kind: "handoff", node: "py_invoice" });
    expect(menuStep(doc, s, open.state, "5", NOW, NOON, PAY)).toMatchObject({ kind: "ai", node: "py_history" });
    expect(menuStep(doc, s, open.state, "رجوع", NOW, NOON, PAY)).toMatchObject({ kind: "reply", state: { at: null } });
    expect(menuStep(doc, s, open.state, "0", NOW, NOON, PAY)).toMatchObject({ kind: "reply", text: renderMenu(doc, null), state: { at: null } });
    expect(menuStep(doc, s, open.state, "القائمة", NOW, NOON, PAY)).toMatchObject({ kind: "reply", state: { at: null } });
    expect(menuStep(doc, s, open.state, "موظف", NOW, NOON, PAY)).toMatchObject({ kind: "handoff", node: "staff" });
    // a number past the list, or words, inside a section → Claude in its context
    expect(menuStep(doc, s, open.state, "9", NOW, NOON, PAY)).toMatchObject({ kind: "ai", topic: "الدفع والفواتير", suffix: NAV_LINE });
    expect(menuStep(doc, s, open.state, "دفعت أمس", NOW, NOON, PAY)).toMatchObject({ kind: "ai", topic: "الدفع والفواتير" });
  });

  it("prices / products from his lists, else Claude; a disabled item is skipped", () => {
    const withPlans = {
      ...doc,
      plans: [{ id: "p1", name: "قياسي", price: 20000, currency: "أوقية", country: "موريتانيا", period: "شهر", details: "", enabled: true }],
    };
    const st = { at: "prices", lastWelcomeAt: NOW };
    expect(menuStep(withPlans, s, st, "1", NOW, NOON, PAY)).toMatchObject({ kind: "reply", text: `💰 أسعار تجديد الاشتراك\n\n• قياسي: 20,000 أوقية / شهر (موريتانيا)\n\n${NAV_LINE}` });
    expect(menuStep(doc, s, st, "1", NOW, NOON, PAY)).toMatchObject({ kind: "ai", topic: "أسعار تجديد الاشتراك" });
    const off = updateNode(doc, "pr_renew", { enabled: false });
    expect(menuStep(off, s, st, "1", NOW, NOON, PAY)).toMatchObject({ kind: "ai", node: "pr_roam100" });
  });

  it("menus off: Claude only; keyword mode: no welcome on a greeting", () => {
    expect(menuStep(doc, { ...s, mode: "off" }, NO_STATE, "1", NOW, NOON, PAY)).toMatchObject({ kind: "ai" });
    expect(menuStep(doc, { ...s, mode: "keyword" }, NO_STATE, "سلام", NOW, NOON, PAY)).toMatchObject({ kind: "ai" });
    expect(menuStep(doc, { ...s, mode: "keyword" }, NO_STATE, "menu", NOW, NOON, PAY)).toMatchObject({ kind: "reply", text: renderMenu(doc, null) });
  });

  it("greetings, staff hours", () => {
    expect(isGreeting("السلام عليكم")).toBe(true);
    expect(isGreeting("Bonjour")).toBe(true);
    expect(isGreeting("سلام، كم سعر التجديد؟")).toBe(false);
    expect(inHours(s, 9 * 60)).toBe(true);
    expect(inHours(s, 23 * 60)).toBe(false);
    expect(inHours({ hoursFrom: "20:00", hoursTo: "02:00" }, 60)).toBe(true);
    expect(handoffText(s, 23 * 60)).toContain("من 08:00 إلى 22:00");
    expect(handoffText(s, NOON)).not.toContain("أوقات");
  });
});

describe("✏️ draft, publish, versions", () => {
  it("edits only the draft until he publishes; versions come back", () => {
    let store = defaultMenus();
    expect(store.published).toBeNull();
    store = { ...store, draft: updateNode(store.draft, "staff", { title: "موظف" }) };
    store = publishMenus(store, "t1", "هاتفي");
    expect(store.published?.nodes.find((n) => n.id === "staff")?.title).toBe("موظف");
    store = { ...store, draft: removeNode(store.draft, "pay") };
    expect(store.draft.nodes.some((n) => n.parentId === "pay")).toBe(false);
    expect(store.published?.nodes.some((n) => n.id === "pay")).toBe(true);
    store = publishMenus(store, "t2", "هاتفي");
    expect(store.versions).toHaveLength(1);
    store = restoreVersion(store, 0);
    expect(store.draft.nodes.some((n) => n.id === "pay")).toBe(true);
    store = unpublishMenus(store);
    expect(store.published).toBeNull();
    expect(store.versions).toHaveLength(2);
  });

  it("order, a new item, the problems that stop a publish", () => {
    let doc = defaultMenuDoc();
    doc = moveNode(doc, "prices", -1);
    expect(childrenOf(doc, null).map((n) => n.id).slice(0, 2)).toEqual(["prices", "accounts"]);
    expect(moveNode(doc, "prices", -1)).toBe(doc);
    doc = addNode(doc, { id: "x", parentId: "staff", title: "", icon: "•", enabled: true, action: { type: "answer", text: "" } });
    expect(docProblems(doc)).toEqual(["عنصر بلا اسم", "«» بلا جواب"]);
    expect(cleanMenus({ draft: { nodes: [] } }).draft.nodes).toEqual([]);
    expect(cleanMenus(null).settings).toEqual(DEFAULT_SETTINGS);
  });
});
