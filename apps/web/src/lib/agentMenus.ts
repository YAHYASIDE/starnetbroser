/**
 * 🗂️ «إدارة القوائم» - STAR NET's customer-service menus on WhatsApp (his Nov 21 2026 brief «قوائم خدمة العملاء
 * الذكية»). A tree of sections and items (stable ids - ready for WhatsApp's interactive lists once the official Cloud
 * API is connected; today the reader can only reply with text, so a menu goes out as numbered lines), a welcome, a
 * price list and a product list, all edited as a DRAFT and sent to customers only once he publishes (versions kept,
 * one restorable). The navigation itself (a number, «0», «رجوع», «موظف», a greeting) is decided here without Claude -
 * free and instant; the same rules run in the phone's reader (WhatsAppMenu.java, same tests' strings). Pure.
 */

export const MENUS_KEY = "starnet_agent_menus_v1";

/** What an item does when the customer picks it. */
export type MenuAction =
  | { type: "submenu" }
  /** A fixed answer he wrote. */
  | { type: "answer"; text: string }
  /** Claude answers about this topic (with the customer's facts, the lessons, the prices). */
  | { type: "ai"; topic: string }
  /** The price list (catalog.plans). */
  | { type: "prices" }
  /** The product list (catalog.products). */
  | { type: "products" }
  /** The payment ways (his payment lines). */
  | { type: "payments" }
  /** A person takes the conversation. */
  | { type: "handoff" };

export interface MenuNode {
  /** Stable, unique - never the shown text. */
  id: string;
  /** null = a main section. */
  parentId: string | null;
  title: string;
  icon: string;
  enabled: boolean;
  action: MenuAction;
  /** A picture for the app's cards (data URL, small) - WhatsApp gets text only until the Cloud API. */
  image?: string;
}

export interface CatalogPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  country: string;
  period: string;
  details: string;
  enabled: boolean;
}

export interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  currency: string;
  available: boolean;
  description: string;
  image?: string;
  enabled: boolean;
}

export interface MenuDoc {
  welcome: string;
  /** In order: a section's items are the nodes whose parentId is its id, in this array's order. */
  nodes: MenuNode[];
  plans: CatalogPlan[];
  products: CatalogProduct[];
}

export interface MenuSettings {
  /** auto: the welcome + menu on a new conversation; keyword: only when he writes one of `keywords`; off: no menus
   * (Claude still answers). */
  mode: "auto" | "keyword" | "off";
  keywords: string[];
  /** No second welcome within this many hours. */
  welcomeEveryHours: number;
  /** The staff's hours (said when a customer asks for a person outside them) - "08:00". */
  hoursFrom: string;
  hoursTo: string;
  /** A person's conversation goes back to the agent by itself after this many hours. */
  handoffHours: number;
}

export interface MenuVersion {
  at: string;
  by: string;
  doc: MenuDoc;
}

export interface MenusStore {
  draft: MenuDoc;
  published: MenuDoc | null;
  publishedAt?: string;
  publishedBy?: string;
  /** Newest first, at most MAX_VERSIONS. */
  versions: MenuVersion[];
  settings: MenuSettings;
}

export const MAX_VERSIONS = 10;

export const DEFAULT_WELCOME = "🌐 مرحبًا بك في STAR NET\n\nيسعدنا خدمتك في جميع خدمات Starlink 🛰️\n\nكيف يمكننا مساعدتك اليوم؟\n\nاختر الخدمة المطلوبة من القائمة 👇";

export const DEFAULT_SETTINGS: MenuSettings = {
  mode: "auto",
  keywords: ["القائمة", "قائمة", "menu", "منيو"],
  welcomeEveryHours: 12,
  hoursFrom: "08:00",
  hoursTo: "22:00",
  handoffHours: 24,
};

const ai = (topic: string): MenuAction => ({ type: "ai", topic });
const node = (id: string, parentId: string | null, icon: string, title: string, action: MenuAction): MenuNode => ({ id, parentId, icon, title, enabled: true, action });

/** His six sections and their items (his brief), each item a stable id. */
export function defaultMenuDoc(): MenuDoc {
  return {
    welcome: DEFAULT_WELCOME,
    nodes: [
      node("accounts", null, "📡", "حساباتي وأجهزتي", { type: "submenu" }),
      node("acc_new", "accounts", "🆕", "إنشاء حساب جديد", ai("إنشاء حساب Starlink جديد: اشرح ما نحتاجه منه خطوة خطوة (الاسم، البريد، البلد، رقم KIT إن وجد) ولا تنشئ شيئًا - موظف يكمل")),
      node("acc_add", "accounts", "➕", "إضافة حساب موجود", ai("ربط حساب Starlink موجود: اطلب البريد ورقم KIT فقط، أبدًا كلمة السر، وموظف يكمل الربط")),
      node("acc_find", "accounts", "🔎", "البحث عن أجهزتي", ai("قائمة أجهزة هذا الزبون المسجّلة باسمه")),
      node("acc_info", "accounts", "ℹ️", "معلومات الجهاز", ai("معلومات أجهزة هذا الزبون: الحالة، KIT، الرقم التسلسلي")),
      node("acc_status", "accounts", "📶", "حالة الاشتراك", ai("حالة اشتراك أجهزة هذا الزبون")),
      node("acc_renew", "accounts", "📅", "موعد التجديد", ai("موعد تجديد أجهزة هذا الزبون")),
      node("prices", null, "💰", "الأسعار والاشتراكات", { type: "submenu" }),
      node("pr_renew", "prices", "🔄", "أسعار تجديد الاشتراك", { type: "prices" }),
      node("pr_roam100", "prices", "🌍", "تجوال 100GB", ai("باقة تجوال 100GB من قائمة الأسعار")),
      node("pr_roamunl", "prices", "♾️", "تجوال غير محدود", ai("باقة التجوال غير المحدود من قائمة الأسعار")),
      node("pr_priority", "prices", "⚡", "باقات Priority", ai("باقات Priority من قائمة الأسعار")),
      node("pr_offers", "prices", "🎁", "العروض الحالية", ai("العروض الحالية من قائمة الأسعار والدروس فقط")),
      node("pr_compare", "prices", "⚖️", "مقارنة الباقات", ai("مقارنة الباقات من قائمة الأسعار")),
      node("devices", null, "🛰️", "الأجهزة والإكسسوارات", { type: "submenu" }),
      node("dv_mini", "devices", "📦", "شراء Starlink Mini", ai("شراء Starlink Mini من قائمة المنتجات: السعر والتوفر")),
      node("dv_other", "devices", "🛰️", "شراء أجهزة Starlink الأخرى", ai("أجهزة Starlink الأخرى من قائمة المنتجات")),
      node("dv_list", "devices", "🛒", "مشاهدة الأجهزة المتوفرة", { type: "products" }),
      node("dv_acc", "devices", "🔌", "الإكسسوارات", ai("الإكسسوارات من قائمة المنتجات")),
      node("dv_ship", "devices", "🚚", "تكلفة الشحن", ai("تكلفة الشحن من الدروس فقط - إن لم تُذكر فحوّل لموظف")),
      node("dv_track", "devices", "📍", "متابعة طلب شراء", { type: "handoff" }),
      node("pay", null, "💳", "الدفع والفواتير", { type: "submenu" }),
      node("py_ways", "pay", "🏦", "طرق الدفع المتاحة", { type: "payments" }),
      node("py_proof", "pay", "🧾", "إرسال إثبات الدفع", { type: "answer", text: "أرسل صورة إثبات التحويل هنا مع اسمك ورقم KIT أو البريد، وسيتحقق موظف من وصول المبلغ ويؤكد لك. 🙏" }),
      node("py_invoice", "pay", "📄", "طلب فاتورة", { type: "handoff" }),
      node("py_state", "pay", "⏳", "حالة عملية الدفع", { type: "handoff" }),
      node("py_history", "pay", "📊", "سجل المدفوعات", ai("ما على هذا الزبون الآن حسب المعلومات فقط - لا تذكر تفاصيل غيرها")),
      node("support", null, "🛠️", "الدعم الفني", { type: "submenu" }),
      node("sp_down", "support", "🔴", "الإنترنت مقطوع", ai("تشخيص انقطاع الإنترنت خطوة خطوة: الكهرباء، الأسلاك، حالة الطبق في تطبيق Starlink، حالة الاشتراك - واطلب صورة الشاشة إن لزم")),
      node("sp_slow", "support", "🐢", "الإنترنت ضعيف", ai("تشخيص بطء الإنترنت: العوائق فوق الطبق، إعادة التشغيل، عدد المتصلين، حالة الاشتراك")),
      node("sp_limited", "support", "⛔", "الجهاز مقيد", ai("جهاز مقيد: خارج بلد الحساب أو اشتراك منتهٍ - من المعلومات فقط، وإلا حوّل لموظف")),
      node("sp_activate", "support", "⚙️", "مشكلة في التفعيل", ai("مشكلة تفعيل: اطلب رقم KIT وصورة الشاشة، ثم حوّل لموظف")),
      node("sp_account", "support", "👤", "مشكلة في الحساب", ai("مشكلة في حساب Starlink: اطلب البريد وصورة الخطأ، أبدًا كلمة السر، ثم حوّل لموظف")),
      node("sp_mail", "support", "📧", "مشكلة في البريد الإلكتروني", ai("مشكلة البريد المرتبط بالحساب: اطلب البريد وصورة الخطأ ثم حوّل لموظف")),
      node("sp_pay", "support", "💳", "مشكلة في الدفع", ai("مشكلة في الدفع: اطلب صورة الإثبات والمبلغ، ولا تؤكد الاستلام أبدًا - حوّل لموظف")),
      node("staff", null, "👨‍💼", "التحدث مع موظف", { type: "handoff" }),
    ],
    plans: [],
    products: [],
  };
}

export function defaultMenus(): MenusStore {
  return { draft: defaultMenuDoc(), published: null, versions: [], settings: { ...DEFAULT_SETTINGS } };
}

export function cleanMenus(raw: unknown): MenusStore {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<MenusStore>;
  const base = defaultMenus();
  const doc = (d: unknown): MenuDoc | null => {
    const x = d as Partial<MenuDoc> | null;
    if (!x || !Array.isArray(x.nodes)) return null;
    return { welcome: typeof x.welcome === "string" ? x.welcome : DEFAULT_WELCOME, nodes: x.nodes, plans: Array.isArray(x.plans) ? x.plans : [], products: Array.isArray(x.products) ? x.products : [] };
  };
  return {
    draft: doc(r.draft) ?? base.draft,
    published: doc(r.published),
    ...(r.publishedAt ? { publishedAt: r.publishedAt, publishedBy: r.publishedBy ?? "" } : {}),
    versions: Array.isArray(r.versions) ? r.versions.filter((v) => v && doc(v.doc)).slice(0, MAX_VERSIONS) : [],
    settings: { ...DEFAULT_SETTINGS, ...(r.settings ?? {}) },
  };
}

// ---- editing the draft ----

export function childrenOf(doc: MenuDoc, parentId: string | null, onlyEnabled = false): MenuNode[] {
  return doc.nodes.filter((n) => n.parentId === parentId && (!onlyEnabled || n.enabled));
}

export function newNodeId(doc: MenuDoc, rand: () => string = () => Math.random().toString(36).slice(2, 7)): string {
  let id = "";
  do id = `n_${rand()}`;
  while (doc.nodes.some((n) => n.id === id));
  return id;
}

export function addNode(doc: MenuDoc, n: MenuNode): MenuDoc {
  return { ...doc, nodes: [...doc.nodes, n] };
}

export function updateNode(doc: MenuDoc, id: string, patch: Partial<Omit<MenuNode, "id">>): MenuDoc {
  return { ...doc, nodes: doc.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
}

/** A node and everything under it. */
export function removeNode(doc: MenuDoc, id: string): MenuDoc {
  const gone = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of doc.nodes) if (n.parentId && gone.has(n.parentId) && !gone.has(n.id)) (gone.add(n.id), (grew = true));
  }
  return { ...doc, nodes: doc.nodes.filter((n) => !gone.has(n.id)) };
}

/** Up (-1) / down (+1) among its siblings. */
export function moveNode(doc: MenuDoc, id: string, dir: -1 | 1): MenuDoc {
  const n = doc.nodes.find((x) => x.id === id);
  if (!n) return doc;
  const siblings = childrenOf(doc, n.parentId);
  const i = siblings.findIndex((x) => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= siblings.length) return doc;
  const other = siblings[j]!;
  const nodes = [...doc.nodes];
  const a = nodes.findIndex((x) => x.id === id);
  const b = nodes.findIndex((x) => x.id === other.id);
  [nodes[a], nodes[b]] = [nodes[b]!, nodes[a]!];
  return { ...doc, nodes };
}

/** Problems that stop a publish (in his words) - [] = ready. */
export function docProblems(doc: MenuDoc): string[] {
  const out: string[] = [];
  if (!doc.welcome.trim()) out.push("رسالة الترحيب فارغة");
  const main = childrenOf(doc, null, true);
  if (main.length === 0) out.push("لا قسم رئيسي مفعّل");
  if (main.length > 9) out.push("أكثر من 9 أقسام رئيسية - الزبون يختار برقم واحد");
  for (const n of doc.nodes) {
    if (!n.title.trim()) out.push("عنصر بلا اسم");
    if (n.action.type === "submenu" && n.enabled && childrenOf(doc, n.id, true).length === 0) out.push(`«${n.title}» قائمة فارغة`);
    if (n.action.type === "submenu" && childrenOf(doc, n.id, true).length > 9) out.push(`«${n.title}» فيها أكثر من 9 خيارات`);
    if (n.action.type === "answer" && !n.action.text.trim()) out.push(`«${n.title}» بلا جواب`);
  }
  return out;
}

/** Publish the draft: customers get it; the previous published one is kept as a version. */
export function publishMenus(store: MenusStore, at: string, by: string): MenusStore {
  const versions = store.published ? [{ at: store.publishedAt ?? at, by: store.publishedBy ?? "", doc: store.published }, ...store.versions].slice(0, MAX_VERSIONS) : store.versions;
  return { ...store, published: store.draft, publishedAt: at, publishedBy: by, versions };
}

/** A version back into the draft (to check, then publish). */
export function restoreVersion(store: MenusStore, index: number): MenusStore {
  const v = store.versions[index];
  return v ? { ...store, draft: v.doc } : store;
}

/** Stop sending menus to customers (the draft stays). */
export function unpublishMenus(store: MenusStore): MenusStore {
  const { publishedAt: _a, publishedBy: _b, ...rest } = store;
  return { ...rest, published: null, versions: store.published ? [{ at: store.publishedAt ?? "", by: store.publishedBy ?? "", doc: store.published }, ...store.versions].slice(0, MAX_VERSIONS) : store.versions };
}

// ---- what the customer reads (the same strings as WhatsAppMenu.java) ----

export const NAV_LINE = "0️⃣ 🏠 الرئيسية · «رجوع» ↩️ · «موظف» 👨‍💼";
const DIGITS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

/** A menu as numbered lines (WhatsApp text), with the navigation line under a section. */
export function renderMenu(doc: MenuDoc, parentId: string | null): string {
  const items = childrenOf(doc, parentId, true).slice(0, 9);
  const head = parentId === null ? "" : `${doc.nodes.find((n) => n.id === parentId)?.icon ?? ""} ${doc.nodes.find((n) => n.id === parentId)?.title ?? ""}\n\n`.trimStart();
  const lines = items.map((n, i) => `${DIGITS[i]} ${n.icon} ${n.title}`).join("\n");
  return `${head}${lines}\n\n${parentId === null ? "اكتب رقم الخدمة 👆" : NAV_LINE}`;
}

export function renderPrices(doc: MenuDoc): string {
  const plans = doc.plans.filter((p) => p.enabled);
  if (!plans.length) return "";
  return plans.map((p) => `• ${p.name}: ${fmt(p.price)} ${p.currency}${p.period ? ` / ${p.period}` : ""}${p.country ? ` (${p.country})` : ""}${p.details ? `\n  ${p.details}` : ""}`).join("\n");
}

export function renderProducts(doc: MenuDoc): string {
  const items = doc.products.filter((p) => p.enabled);
  if (!items.length) return "";
  return items.map((p) => `• ${p.name}: ${fmt(p.price)} ${p.currency} - ${p.available ? "✅ متوفر" : "⏳ غير متوفر الآن"}${p.description ? `\n  ${p.description}` : ""}`).join("\n");
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// ---- the navigation (no Claude) ----

/** One customer's place in the menus. */
export interface MenuState {
  /** The open section (null = the main menu). */
  at: string | null;
  lastWelcomeAt: number;
}

export const NO_STATE: MenuState = { at: null, lastWelcomeAt: 0 };

export type MenuStep =
  /** Send this text. */
  | { kind: "reply"; text: string; node?: string; state: MenuState }
  /** Claude answers (with `topic` when an item asked it); `suffix` goes under its answer. */
  | { kind: "ai"; topic?: string; node?: string; suffix?: string; state: MenuState }
  /** A person takes the conversation; `text` tells the customer. */
  | { kind: "handoff"; text: string; node?: string; state: MenuState };

const GREETINGS = ["سلام", "السلام", "مرحبا", "مرحبًا", "اهلا", "أهلا", "هلا", "صباح", "مساء", "bonjour", "salut", "salam", "hello", "hi", "bonsoir", "slm"];

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[ً-ْ]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[!؟?.،,]+$/g, "")
    .trim();
}

/** A message that is only a greeting (no question in it). */
export function isGreeting(text: string): boolean {
  const t = norm(text);
  if (!t || t.length > 40) return false;
  return GREETINGS.some((g) => t === norm(g) || t.startsWith(norm(g) + " ") || t.startsWith(norm(g) + "م")) && !/[؟?]/.test(text);
}

/** Inside / outside the staff's hours ("HH:MM", minutes of the day). */
export function inHours(settings: Pick<MenuSettings, "hoursFrom" | "hoursTo">, minutes: number): boolean {
  const m = (s: string) => {
    const [h, mm] = s.split(":").map(Number);
    return (h ?? 0) * 60 + (mm ?? 0);
  };
  const a = m(settings.hoursFrom);
  const b = m(settings.hoursTo);
  return a <= b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
}

export function handoffText(settings: MenuSettings, minutes: number): string {
  return inHours(settings, minutes)
    ? "👨‍💼 تم تحويل محادثتك إلى فريق STAR NET، وسيرد عليك موظف في أقرب وقت. اكتب سؤالك هنا 🙏"
    : `👨‍💼 تم تحويل محادثتك إلى فريق STAR NET. أوقات عمل الموظفين من ${settings.hoursFrom} إلى ${settings.hoursTo}، وسيرد عليك موظف في أقرب وقت 🙏`;
}

/**
 * One message → what to do. `paymentText`: his payment lines. `minutes`: minutes of the day now (staff's hours).
 * Order: «موظف» → «0» / a menu keyword → «رجوع» → a number in the open section → a welcome due (greeting, or `auto` and
 * none within welcomeEveryHours) → Claude (in the open section's context).
 */
export function menuStep(doc: MenuDoc, settings: MenuSettings, state: MenuState, text: string, now: number, minutes: number, paymentText: string): MenuStep {
  const t = norm(text);
  const at = state.at && doc.nodes.some((n) => n.id === state.at && n.enabled) ? state.at : null;
  const keep = { ...state, at };
  const main = (s: MenuState): MenuStep => ({ kind: "reply", text: renderMenu(doc, null), state: { ...s, at: null } });
  if (settings.mode === "off") return { kind: "ai", state: keep };
  if (t === "موظف" || t === "employe" || t === "agent") return { kind: "handoff", text: handoffText(settings, minutes), node: "staff", state: keep };
  if (t === "0" || settings.keywords.some((k) => norm(k) === t)) return main(keep);
  if (t === "رجوع" || t === "retour") {
    const parent = at ? doc.nodes.find((n) => n.id === at)?.parentId ?? null : null;
    return { kind: "reply", text: renderMenu(doc, parent), node: parent ?? undefined, state: { ...keep, at: parent } };
  }
  const num = /^[1-9]$/.test(t) ? Number(t) : 0;
  if (num) {
    const items = childrenOf(doc, at, true).slice(0, 9);
    const n = items[num - 1];
    if (n) return pick(doc, settings, keep, n, minutes, paymentText);
  }
  const topic = at ? doc.nodes.find((n) => n.id === at)?.title : undefined;
  if (settings.mode === "auto") {
    const due = now - state.lastWelcomeAt >= settings.welcomeEveryHours * 3600_000;
    // a new conversation: a greeting gets the welcome and the menu; a question is answered first (no forced menu)
    if (due && isGreeting(text)) return { kind: "reply", text: `${doc.welcome}\n\n${renderMenu(doc, null)}`, state: { at: null, lastWelcomeAt: now } };
    if (due) return { kind: "ai", ...(topic ? { topic } : {}), suffix: MENU_HINT, state: { ...keep, lastWelcomeAt: now } };
    if (isGreeting(text)) return main(keep);
  }
  return { kind: "ai", ...(topic ? { topic } : {}), ...(at ? { suffix: NAV_LINE } : {}), state: keep };
}

/** Under the first answer of a conversation that began with a question. */
export const MENU_HINT = "اكتب 0 لعرض قائمة خدمات STAR NET 👇";

function pick(doc: MenuDoc, settings: MenuSettings, state: MenuState, n: MenuNode, minutes: number, paymentText: string): MenuStep {
  const back = `\n\n${NAV_LINE}`;
  switch (n.action.type) {
    case "submenu":
      return { kind: "reply", text: renderMenu(doc, n.id), node: n.id, state: { ...state, at: n.id } };
    case "answer":
      return { kind: "reply", text: n.action.text + back, node: n.id, state };
    case "prices": {
      const p = renderPrices(doc);
      return p ? { kind: "reply", text: `💰 ${n.title}\n\n${p}${back}`, node: n.id, state } : { kind: "ai", topic: n.title, node: n.id, state };
    }
    case "products": {
      const p = renderProducts(doc);
      return p ? { kind: "reply", text: `🛰️ ${n.title}\n\n${p}${back}`, node: n.id, state } : { kind: "ai", topic: n.title, node: n.id, state };
    }
    case "payments":
      return paymentText.trim() ? { kind: "reply", text: `💳 ${n.title}\n\n${paymentText.trim()}${back}`, node: n.id, state } : { kind: "ai", topic: n.title, node: n.id, state };
    case "handoff":
      return { kind: "handoff", text: handoffText(settings, minutes), node: n.id, state };
    case "ai":
      return { kind: "ai", topic: n.action.topic || n.title, node: n.id, state };
  }
}

/** What Claude reads besides the facts: the price and product lists (so a typed question gets the right price). */
export function catalogText(doc: MenuDoc): string {
  const p = renderPrices(doc);
  const d = renderProducts(doc);
  return [p ? `Price list:\n${p}` : "", d ? `Products:\n${d}` : ""].filter(Boolean).join("\n\n");
}

// ---- the store ----

export const MENUS_EVENT = "starnet:agent-menus";

export function loadMenus(): MenusStore {
  try {
    const raw = window.localStorage.getItem(MENUS_KEY);
    return cleanMenus(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultMenus();
  }
}

export function saveMenus(store: MenusStore): void {
  window.localStorage.setItem(MENUS_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(MENUS_EVENT));
}
