/**
 * 📋 «قائمة المتابعة» (his Nov 10 2026 «أضف هذه الخطوات إلى قائمة التذكيرات، وأضف لها كل الأشياء التي لم
 * نكمل تطبيقها»): what is still open, in two groups - «عليك أنت» (steps he has to do himself) and «لم يكتمل
 * في التطبيق» (features agreed or asked for but not built yet). The open items ship with the app (a finished
 * feature is removed here in the update that builds it); his ticks and his own lines are his data in
 * `starnet_followups_v1` (backed up, team-linked, never in a rep's copy).
 */

export type FollowGroup = "mine" | "app";

export interface FollowItem {
  id: string;
  group: FollowGroup;
  title: string;
  /** The steps / what it is, one line each. */
  steps: string[];
  /** What it waits for, shown in small type. */
  waits?: string;
  /** An app page that does it (e.g. "/settings#claude"). */
  path?: string;
  /** His own line (deletable); built-in items only get ticked. */
  own?: boolean;
}

export interface FollowStore {
  /** id → when he ticked it. */
  done: Record<string, number>;
  /** His own lines. */
  own: FollowItem[];
}

export const FOLLOW_KEY = "starnet_followups_v1";
export const EMPTY_FOLLOW: FollowStore = { done: {}, own: [] };

export const FOLLOW_BUILT_IN: FollowItem[] = [
  {
    id: "claude-key",
    group: "mine",
    title: "🔑 تفعيل مساعد Claude (الدفع + المفتاح)",
    path: "/settings#claude",
    steps: [
      "في صفحة الدفع بـ platform.claude.com: امسح خانة الرقم الضريبي واتركها فارغة (هي اختيارية)، ثم G Pay.",
      "إن ظهر «Vos informations n'ont pas pu être enregistrées»: اختر «Carte» وأدخل البطاقة مباشرة.",
      "إن لم يقبل: «Ignorer pour le moment»، ثم لاحقًا من القائمة Billing ← Add credits (5 دولار) ببطاقة دولية مفعّل فيها الدفع الخارجي (مثل KAST).",
      "API Keys ← Create Key ← سمّه starnet-phone ← انسخه فورًا (يبدأ بـ sk-ant-).",
      "في التطبيق: الإعدادات ← البوتات ← «🤖 مساعد Claude» ← الصق المفتاح ← حفظ ← 🧪 اختبار.",
      "لا ترسل المفتاح لأحد ولا تضعه في الدردشة.",
    ],
  },
  {
    id: "support-snapshot",
    group: "mine",
    title: "🧪 لقطة تشخيص لصفحة تذكرة دعم Starlink",
    waits: "بها يُبنى الرد التلقائي على الدعم",
    steps: [
      "افتح متصفح جهاز فيه تذكرة دعم مفتوحة (مثل تذكرة الفرنسية التي أرسلتها).",
      "اضغط «🧪 لقطة تشخيص» في الشريط العلوي.",
      "تصلك في البوت ملفًا - أرسله في محادثة التطوير.",
    ],
  },
  {
    id: "support-auto-reply",
    group: "app",
    title: "💬 الرد التلقائي في صفحة دعم Starlink",
    waits: "ينتظر: لقطة التشخيص + مفتاح Claude",
    steps: [
      "زر 🤖 في متصفح الجهاز يقرأ رسائل التذكرة.",
      "Claude يكتب الرد بلغة التذكرة مع ترجمة عربية.",
      "يرسل وحده فقط إن كان الرد آمنًا (لا دفع، لا إلغاء، لا التزام جديد)، وإلا يعرضه عليك لترسله أو تعدّله.",
    ],
  },
  {
    id: "chat-statement-options",
    group: "app",
    title: "🧾 كشف المندوب: اختيار الفترة والنوع + Excel",
    steps: ["اختيار الفترة (أسبوع / شهر / من - إلى) ونوع الحركات قبل الإرسال.", "تصدير الكشف ملف Excel بجانب PDF."],
  },
  {
    id: "chat-disputes",
    group: "app",
    title: "⚖️ مركز الاعتراضات",
    steps: ["كل عملية قال عنها المندوب «غير جيد» في مكان واحد: مفتوحة / محلولة، مع السبب والرد."],
  },
  {
    id: "chat-member-to-member",
    group: "app",
    title: "👥 محادثات بين أعضاء الفريق",
    steps: ["محادثة خاصة بين عضوين (مثلًا المسؤول 2 والحاسوب)، لا في محادثة الفريق كلها."],
  },
  {
    id: "chat-files",
    group: "app",
    title: "📎 ملفات Excel و Word والفيديو في الدردشة",
    steps: ["إرسال وفتح ملفات Excel و Word ومقاطع فيديو قصيرة، بجانب الصور و PDF."],
  },
  {
    id: "chat-edit-reactions",
    group: "app",
    title: "✏️ تعديل الرسالة والتفاعلات",
    steps: ["تعديل رسالة بعد إرسالها (تظهر «مُعدّلة»).", "تفاعل سريع على الرسالة (👍 ✅ ❤️)."],
  },
  {
    id: "chat-tabs",
    group: "app",
    title: "🗂️ تبويبات داخل المحادثة",
    steps: ["داخل محادثة المندوب: المالية / الملفات / المهام / الأجهزة."],
  },
  {
    id: "chat-quick-replies",
    group: "app",
    title: "⚡ ردود سريعة",
    steps: ["جمل جاهزة تضغطها فتُرسل (مثل «استلمت، شكرًا»)."],
  },
  {
    id: "chat-scheduled-statements",
    group: "app",
    title: "⏰ كشوف مجدولة",
    steps: ["كشف كل مندوب يُرسل وحده في محادثته في يوم تختاره (أسبوعيًا / شهريًا)."],
  },
  {
    id: "rep-council-options",
    group: "app",
    title: "🤝 خيارات المندوب المؤجّلة",
    waits: "تحتاج اتفاقك مع المندوب أولًا",
    steps: ["سعر جملة لكل جهاز مربوط بالتكلفة.", "سقف دين لكل مندوب.", "«استلمت لحساب المندوب»."],
  },
];

export function cleanFollowStore(raw: unknown): FollowStore {
  if (!raw || typeof raw !== "object") return { done: {}, own: [] };
  const r = raw as Partial<FollowStore>;
  const done: Record<string, number> = {};
  if (r.done && typeof r.done === "object") {
    for (const [id, at] of Object.entries(r.done)) if (typeof at === "number" && Number.isFinite(at)) done[id] = at;
  }
  const own = Array.isArray(r.own)
    ? r.own.flatMap((i): FollowItem[] => {
        if (!i || typeof i !== "object" || typeof i.id !== "string" || typeof i.title !== "string" || !i.title.trim()) return [];
        const steps = Array.isArray(i.steps) ? i.steps.filter((s): s is string => typeof s === "string" && !!s.trim()) : [];
        return [{ id: i.id, group: i.group === "app" ? "app" : "mine", title: i.title.trim(), steps, own: true }];
      })
    : [];
  return { done, own };
}

/** Every item (built-in first, then his own), open ones before done ones, each group kept apart. */
export function followItems(store: FollowStore, builtIn: FollowItem[] = FOLLOW_BUILT_IN): { open: FollowItem[]; done: FollowItem[] } {
  const all = [...builtIn, ...store.own];
  return { open: all.filter((i) => !store.done[i.id]), done: all.filter((i) => store.done[i.id]) };
}

export function toggleFollow(store: FollowStore, id: string, now: number): FollowStore {
  const done = { ...store.done };
  if (done[id]) delete done[id];
  else done[id] = now;
  return { ...store, done };
}

/** His own line: the first line is the title, the rest are its steps. */
export function addOwnFollow(store: FollowStore, text: string, group: FollowGroup, now: number): FollowStore {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return store;
  const item: FollowItem = { id: `own-${now.toString(36)}`, group, title: lines[0]!, steps: lines.slice(1), own: true };
  return { ...store, own: [...store.own, item] };
}

export function removeOwnFollow(store: FollowStore, id: string): FollowStore {
  const done = { ...store.done };
  delete done[id];
  return { done, own: store.own.filter((i) => i.id !== id) };
}

export function loadFollowStore(storage: Pick<Storage, "getItem"> | undefined = typeof window === "undefined" ? undefined : window.localStorage): FollowStore {
  try {
    const raw = storage?.getItem(FOLLOW_KEY);
    return cleanFollowStore(raw ? JSON.parse(raw) : null);
  } catch {
    return { done: {}, own: [] };
  }
}

export function saveFollowStore(store: FollowStore, storage: Pick<Storage, "setItem"> | undefined = typeof window === "undefined" ? undefined : window.localStorage): void {
  try {
    storage?.setItem(FOLLOW_KEY, JSON.stringify(store));
  } catch {
    // full storage: the ticks stay on screen until the next load
  }
}
