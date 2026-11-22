import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, defaultMenuDoc, menuSelect, menuStep, NAV_LINE, NO_STATE } from "./agentMenus";
import { cut, menuList, navWord, productCarousel, productOf, waMessages, waPayload, withoutNav } from "./waInteractive";

const NOW = Date.parse("2026-11-22T12:00:00Z");
const PAY = "• BANKILY : 0000";
const img = (id: string) => `https://wa.example/img/${id}`;

describe("📲 the menus as WhatsApp's official messages (Nov 22 2026)", () => {
  const doc = defaultMenuDoc();

  it("a greeting → the welcome as an interactive list of the six sections", () => {
    const step = menuStep(doc, DEFAULT_SETTINGS, NO_STATE, "السلام عليكم", NOW, 720, PAY);
    const [out] = waMessages(doc, step, img);
    expect(out).toMatchObject({ type: "list", button: "اختر الخدمة", body: doc.welcome });
    expect(out!.type === "list" && out.rows.map((r) => r.id)).toEqual(["accounts", "prices", "devices", "pay", "support", "staff"]);
    expect(out!.type === "list" && out.rows[0]!.title).toBe("📡 حساباتي وأجهزتي");
  });

  it("a section → its items then 🏠 ↩️ 👨‍💼 while there is room; long titles cut to 24 with the full one below", () => {
    const pay = menuList(doc, "pay", false);
    expect(pay.type === "list" && pay.rows.map((r) => r.id)).toEqual(["py_ways", "py_proof", "py_invoice", "py_state", "py_history", "nav_home", "nav_back", "nav_staff"]);
    const acc = menuList(doc, "accounts", false);
    expect(acc.type === "list" && acc.rows.length).toBe(9); // 6 items + 3
    const long = { ...doc, nodes: doc.nodes.map((n) => (n.id === "dv_other" ? { ...n, title: "شراء أجهزة Starlink الأخرى المتوفرة" } : n)) };
    const row = menuList(long, "devices", false).type === "list" ? (menuList(long, "devices", false) as { rows: { id: string; title: string; description?: string }[] }).rows.find((r) => r.id === "dv_other") : null;
    expect(Array.from(row!.title).length).toBe(24);
    expect(row!.description).toBe("شراء أجهزة Starlink الأخرى المتوفرة");
  });

  it("a tapped row = typing its number; nav ids = «0» / «رجوع» / «موظف»", () => {
    const step = menuSelect(doc, DEFAULT_SETTINGS, NO_STATE, "py_ways", 720, PAY)!;
    expect(step).toMatchObject({ kind: "reply", node: "py_ways" });
    const out = waMessages(doc, step, img);
    expect(out).toEqual([{ type: "buttons", body: `💳 طرق الدفع المتاحة\n\n${PAY}`, buttons: [{ id: "nav_home", title: "🏠 القائمة" }, { id: "nav_staff", title: "👨‍💼 موظف" }] }]);
    expect(menuSelect(doc, DEFAULT_SETTINGS, NO_STATE, "nope", 720, PAY)).toBeNull();
    expect([navWord("nav_home"), navWord("nav_back"), navWord("nav_staff"), navWord("pay")]).toEqual(["0", "رجوع", "موظف", null]);
    expect(withoutNav(`نص\n\n${NAV_LINE}`)).toBe("نص");
  });

  it("products with pictures → a carousel (2-10 cards, same buttons); fewer → text with buttons", () => {
    const p = (id: string, image?: string) => ({ id, name: `جهاز ${id}`, price: 12000, currency: "أوقية", available: id !== "b", description: "", enabled: true, ...(image ? { image } : {}) });
    const withImgs = { ...doc, products: [p("a", "data:x"), p("b", "data:y")] };
    const step = menuSelect(withImgs, DEFAULT_SETTINGS, NO_STATE, "dv_list", 720, PAY)!;
    const out = waMessages(withImgs, step, img);
    expect(out[0]).toMatchObject({ type: "carousel" });
    expect(out[0]!.type === "carousel" && out[0]!.cards.map((c) => [c.image, c.buttons[0]!.id, c.buttons[0]!.title])).toEqual([
      ["https://wa.example/img/a", "prod_a", "🛒 اطلب الآن"],
      ["https://wa.example/img/b", "prod_b", "❓ استفسر"],
    ]);
    expect(productCarousel({ ...doc, products: [p("a", "data:x")] }, img)).toBeNull();
    expect(productOf(withImgs, "prod_b")?.name).toBe("جهاز b");
  });

  it("the Cloud API bodies stay inside Meta's limits", () => {
    const list = waPayload("22270000001", menuList(doc, null, true));
    expect(list).toMatchObject({ messaging_product: "whatsapp", to: "22270000001", type: "interactive", interactive: { type: "list", action: { button: "اختر الخدمة" } } });
    const btn = waPayload("1", { type: "buttons", body: "x", buttons: [1, 2, 3, 4].map((i) => ({ id: `b${i}`, title: "زر طويل جدًا جدًا جدًا جدًا" })) }) as { interactive: { action: { buttons: { reply: { title: string } }[] } } };
    expect(btn.interactive.action.buttons).toHaveLength(3);
    expect(Array.from(btn.interactive.action.buttons[0]!.reply.title).length).toBe(20);
    expect(cut("abc", 2)).toBe("a…");
    const ai = menuStep(doc, DEFAULT_SETTINGS, { at: "pay", lastWelcomeAt: NOW }, "دفعت أمس", NOW, 720, PAY);
    expect(waMessages(doc, ai, img, "سيتحقق موظف من الدفع")).toEqual([{ type: "buttons", body: "سيتحقق موظف من الدفع", buttons: [{ id: "nav_home", title: "🏠 القائمة" }, { id: "nav_staff", title: "👨‍💼 موظف" }] }]);
  });
});
