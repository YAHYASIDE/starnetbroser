/**
 * 📲 STAR NET's menus as WhatsApp's OFFICIAL interactive messages (the Cloud API, his Nov 22 2026 choice «احترافي مثل
 * Alibaba»): a menu → an interactive list (one button «اختر الخدمة», up to 10 rows); an answer → its text with reply
 * buttons «🏠 القائمة» / «👨‍💼 موظف»; the products → a media carousel (2-10 cards: picture, name, price, «اطلب الآن»).
 * Meta's limits (developers.facebook.com, read Nov 22 2026): list button 20 chars, row title 24, row description 72,
 * header 60, body 4096; reply buttons ≤ 3, title 20, body 1024; carousel 2-10 cards, card body 160, same buttons on
 * every card. Every row / button carries a stable id (a menu node's id, nav_*, prod_*). Pure - waInteractive.test.ts.
 */

import { childrenOf, MENU_HINT, NAV_LINE, type MenuDoc, type MenuStep } from "./agentMenus";

export type WaOut =
  | { type: "text"; text: string }
  | { type: "list"; header?: string; body: string; footer?: string; button: string; rows: { id: string; title: string; description?: string }[] }
  | { type: "buttons"; body: string; buttons: { id: string; title: string }[] }
  | { type: "carousel"; body: string; cards: { image: string; body: string; buttons: { id: string; title: string }[] }[] };

export const NAV_HOME = "nav_home";
export const NAV_BACK = "nav_back";
export const NAV_STAFF = "nav_staff";
export const PRODUCT_PREFIX = "prod_";

/** A tapped id → the words the navigation understands («0» / «رجوع» / «موظف»), else null (a menu node's id). */
export function navWord(id: string): string | null {
  if (id === NAV_HOME) return "0";
  if (id === NAV_BACK) return "رجوع";
  if (id === NAV_STAFF) return "موظف";
  return null;
}

/** At most `max` characters (code points), «…» when cut. */
export function cut(s: string, max: number): string {
  const chars = Array.from(s.trim());
  return chars.length <= max ? chars.join("") : chars.slice(0, max - 1).join("") + "…";
}

/** The text without the navigation lines the plain-text version ends with (the buttons do it now). */
export function withoutNav(text: string): string {
  let t = text;
  for (const line of [NAV_LINE, MENU_HINT, "اكتب رقم الخدمة 👆"]) if (t.endsWith(line)) t = t.slice(0, -line.length);
  return t.trim();
}

const NAV_BUTTONS = [
  { id: NAV_HOME, title: "🏠 القائمة" },
  { id: NAV_STAFF, title: "👨‍💼 موظف" },
];

/** A text with the two navigation buttons (split in two messages when it is longer than a button message allows). */
function textWithButtons(text: string): WaOut[] {
  const body = withoutNav(text);
  if (Array.from(body).length <= 1024) return [{ type: "buttons", body: body || "…", buttons: NAV_BUTTONS }];
  return [{ type: "text", text: body }, { type: "buttons", body: "هل تحتاج شيئًا آخر؟", buttons: NAV_BUTTONS }];
}

/** One menu as an interactive list: its items, then 🏠 / ↩️ / 👨‍💼 while there is room (10 rows in all). */
export function menuList(doc: MenuDoc, parent: string | null, welcome: boolean): WaOut {
  const items = childrenOf(doc, parent, true);
  const nav = parent === null ? [] : [
    { id: NAV_HOME, title: "🏠 الرئيسية" },
    { id: NAV_BACK, title: "↩️ رجوع" },
    { id: NAV_STAFF, title: "👨‍💼 موظف" },
  ];
  const room = Math.max(0, 10 - items.length);
  const rows = [
    ...items.slice(0, 10).map((n) => {
      const full = `${n.icon} ${n.title}`;
      const title = cut(full, 24);
      return { id: n.id, title, ...(title !== full.trim() ? { description: cut(n.title, 72) } : {}) };
    }),
    ...nav.slice(0, room),
  ];
  const node = parent ? doc.nodes.find((n) => n.id === parent) : undefined;
  const body = welcome ? doc.welcome : node ? `${node.icon} ${node.title}\n\nاختر من القائمة 👇` : "كيف يمكننا مساعدتك؟ اختر الخدمة من القائمة 👇";
  return { type: "list", body: cut(body, 4096), button: "اختر الخدمة", rows, footer: "STAR NET" };
}

/** The product cards (2-10, each with a picture); null when there are fewer than two pictured products. */
export function productCarousel(doc: MenuDoc, imageUrl: (productId: string) => string | null): WaOut | null {
  const cards = doc.products
    .filter((p) => p.enabled && p.image)
    .slice(0, 10)
    .map((p) => {
      const image = imageUrl(p.id);
      if (!image) return null;
      const price = `${p.price.toLocaleString("en-US")} ${p.currency}`;
      return {
        image,
        body: cut(`*${p.name}*\n${price} · ${p.available ? "✅ متوفر" : "⏳ غير متوفر الآن"}${p.description ? `\n${p.description}` : ""}`, 160),
        buttons: [{ id: `${PRODUCT_PREFIX}${p.id}`, title: p.available ? "🛒 اطلب الآن" : "❓ استفسر" }],
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
  return cards.length >= 2 ? { type: "carousel", body: "🛰️ الأجهزة المتوفرة لدى STAR NET 👇", cards } : null;
}

/**
 * What to send for one step of the navigation (agentMenus.ts menuStep / menuSelect). `ai` steps are answered by
 * Claude first - pass its reply as `aiReply`.
 */
export function waMessages(doc: MenuDoc, step: MenuStep, imageUrl: (productId: string) => string | null, aiReply?: string): WaOut[] {
  if (step.kind === "handoff") return [{ type: "text", text: step.text }];
  if (step.kind === "ai") {
    const reply = (aiReply ?? "").trim();
    if (!reply) return [];
    return step.suffix ? textWithButtons(reply) : [{ type: "text", text: reply }];
  }
  const view = step.view ?? { type: "text" as const };
  if (view.type === "menu") {
    return [menuList(doc, view.parent, view.welcome)];
  }
  if (view.type === "products") {
    const carousel = productCarousel(doc, imageUrl);
    if (carousel) return [carousel, { type: "buttons", body: "اختر جهازًا أعلاه، أو:", buttons: NAV_BUTTONS }];
  }
  return textWithButtons(step.text);
}

/** A product's order button → what the staff gets («أريد طلب …»). */
export function productOf(doc: MenuDoc, id: string) {
  return id.startsWith(PRODUCT_PREFIX) ? doc.products.find((p) => p.id === id.slice(PRODUCT_PREFIX.length)) ?? null : null;
}

/** The Cloud API request body for one message to `to` (international digits). */
export function waPayload(to: string, out: WaOut): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  switch (out.type) {
    case "text":
      return { ...base, type: "text", text: { body: cut(out.text, 4096), preview_url: false } };
    case "list":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "list",
          ...(out.header ? { header: { type: "text", text: cut(out.header, 60) } } : {}),
          body: { text: out.body },
          ...(out.footer ? { footer: { text: cut(out.footer, 60) } } : {}),
          action: { button: cut(out.button, 20), sections: [{ title: cut("STAR NET", 24), rows: out.rows }] },
        },
      };
    case "buttons":
      return {
        ...base,
        type: "interactive",
        interactive: { type: "button", body: { text: cut(out.body, 1024) }, action: { buttons: out.buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: cut(b.title, 20) } })) } },
      };
    case "carousel":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "carousel",
          body: { text: cut(out.body, 1024) },
          action: {
            cards: out.cards.map((c, i) => ({
              card_index: i,
              // Meta's own example sets "cta_url" on every card, quick-reply buttons included
              type: "cta_url",
              header: { type: "image", image: { link: c.image } },
              body: { text: c.body },
              action: { buttons: c.buttons.map((b) => ({ type: "quick_reply", quick_reply: { id: b.id, title: cut(b.title, 20) } })) },
            })),
          },
        },
      };
  }
}
