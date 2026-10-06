/**
 * 🆕 «ما الجديد» - after every update the app walks the operator through what changed, step by step
 * (his Oct 2026 request: «في كل تحديث… يذهب بي إلى الخانة ويظهر لي كان كذا وصار كذا وأضغط موافق»).
 * Each step opens its page, lights up the changed place (`data-tour="<target>"` on the element) and
 * shows «كان: … / الآن: …» with «موافق». It plays once by itself after an update; Settings →
 * «🆕 ما الجديد» replays any of them.
 *
 * Every update that changes something he sees ADDS A RELEASE AT THE TOP of WHATS_NEW (new id).
 */

export interface WhatsNewStep {
  /** The page to open (e.g. "/money"); absent = stay on the current page. */
  path?: string;
  /** The `data-tour` value of the element to light up; absent = the card alone, no spotlight. */
  target?: string;
  title: string;
  /** How it was before (omit for something entirely new). */
  before?: string;
  /** How it is now. */
  after: string;
}

export interface WhatsNewRelease {
  /** Unique, never reused - yyyy-mm-dd plus a short tag. */
  id: string;
  date: string;
  title: string;
  steps: WhatsNewStep[];
}

/** Newest first. */
export const WHATS_NEW: WhatsNewRelease[] = [
  {
    id: "2026-10-06-loss-detail",
    date: "2026-10-06",
    title: "شرح خسارة كل جهاز",
    steps: [
      {
        path: "/",
        target: "money-alerts",
        title: "🔻 اضغط الجهاز الخاسر لترى السبب",
        before: "قائمة الأجهزة الخاسرة كانت أرقامًا فقط.",
        after: "اضغط الجهاز: يدفع لك الزبون كذا (÷ سعر الدولار اليوم = كذا $)، وتدفع لستارلينك كذا، والخسارة كذا. وإن كانت الأرقام غير منطقية يقول لك إن السعر الشهري مكتوب خطأ. وفيه زرّان: «✏️ عدّل السعر الشهري» و«📡 افتح بطاقة الجهاز».",
      },
    ],
  },
  {
    id: "2026-10-06-day-calendar",
    date: "2026-10-06",
    title: "تقويم التجديد: 1 إلى 28 فقط",
    steps: [
      {
        path: "/",
        target: "day-specials",
        title: "📅 أيام 29 و30 و31 أُزيلت",
        before: "التقويم كان من 1 إلى 31، وستارلينك لا يجدد بعد يوم 28.",
        after: "صار من 1 إلى 28، وفي مكان 29-31 أربع دوائر: ❓ غير معروف التاريخ، ⏳ لم تُحدَّث بعد، 👤 معطّل: إيميل غير رئيسي، 🔥 معطّل: محروق. اضغط أيّها لترى أجهزتها.",
      },
    ],
  },
  {
    id: "2026-10-06-cards-devices",
    date: "2026-10-06",
    title: "البطاقات: أجهزتها وكشوفها",
    steps: [
      {
        path: "/starlink",
        target: "card-section",
        title: "📩 إشعارات KAST تُطوى",
        before: "إشعارات KAST التي تنتظر كانت طويلة وكبيرة وتملأ الصفحة.",
        after: "صارت تحت سطر واحد «📩 إشعارات KAST تنتظر (العدد)» تطويه وتفتحه بلمسة، وصارت أصغر.",
      },
      {
        path: "/starlink",
        title: "💳 كل بطاقة: أجهزتها وكشفها",
        before: "قائمة البطاقات كانت أسماء وأرقامًا فقط.",
        after: "بجانب كل بطاقة عدد أجهزتها وزر «📄 الكشف»: الأجهزة المربوطة بها (من صفحة الفوترة في ستارلينك)، وكل D دُفع بها شهرًا بشهر، وإشعاراتها التي لم تُربط بجهاز. ودفعة KAST تُربط بجهاز من نفس البطاقة إذا كان المبلغ قريبًا (100$ ← من 98 إلى 102).",
      },
      {
        path: "/starlink",
        title: "⚠️ أجهزة ببطاقة غير مسجّلة",
        after: "إذا كانت بطاقة الدفع في ستارلينك لجهاز ليست من بطاقاتك المسجّلة يظهر تنبيه في قسم البطاقات، وعلى بطاقة الجهاز «💳 •1468 غير مسجّلة».",
      },
    ],
  },
  {
    id: "2026-10-06-renewal-lock",
    date: "2026-10-06",
    title: "تثبيت يوم التجديد",
    steps: [
      {
        path: "/",
        target: "renewal-lock",
        title: "📌 يوم التجديد لا يتغيّر",
        before: "إذا أخطأت المزامنة في قراءة التاريخ، كان يتغيّر يوم التجديد على الجهاز.",
        after: "اضغط تاريخ الجهاز 📅 ← «📌 ثبّت». بعدها تغيّر المزامنة الشهر فقط (10/10 ← 11/10). إن قرأت يومًا آخر يبقى يومك وتظهر «⚠️ قرأ يوم 12 بدل 10» مع زرّين: «اقبل» (نُقل لدولة أخرى) أو «تجاهل».",
      },
      {
        path: "/settings",
        title: "📌 ثبّت كل الأجهزة مرة واحدة",
        after: "الإعدادات ← الأجهزة والتحديث ← «📌 تثبيت يوم التجديد» ← زر واحد يثبّت كل الأجهزة على أيامها الحالية.",
      },
    ],
  },
  {
    id: "2026-10-06-money-alerts",
    date: "2026-10-06",
    title: "تنبيهات المال: الأجهزة الخاسرة وبطاقة KAST",
    steps: [
      {
        path: "/",
        target: "money-alerts",
        title: "💰 تنبيهات المال في الرئيسية",
        before: "لم يكن التطبيق يخبرك إذا صار جهاز يخسر (سعر ستارلينك أو الدولار ارتفع)، ولا كم تحتاج البطاقة لتجديدات الأسبوع إلا في صفحة الأدوات.",
        after: "سطر في الرئيسية يظهر فقط عند وجود مشكلة: «🔻 أجهزة خاسرة» و«🟡 ضعيفة الربح» (أقل من 10%) محسوبة بأسعار الصرف اليوم، و«💳 تحتاج كذا $ خلال 7 أيام · رصيد KAST كذا». اضغطه لترى كل جهاز وربحه. ونفس التنبيه في ملخص الصباح على تيليغرام.",
      },
    ],
  },
  {
    id: "2026-10-05-rep-bot-phones",
    date: "2026-10-05",
    title: "أكثر من هاتف للمندوب في البوت",
    steps: [
      {
        path: "/settings",
        target: "rep-bot-phones",
        title: "📱 هاتفان أو أكثر لنفس المندوب",
        before: "بوت المندوبين يقبل هاتفًا واحدًا لكل مندوب: ربط هاتف ثانٍ كان يحلّ محلّ الأول.",
        after: "الإعدادات ← بوتات المندوبين: يكتب المندوب للبوت من حسابه الثاني، فتختار اسمه نفسه في «طلبات ربط جديدة» ← ربط. يظهر كل هاتف تحت اسمه مع «فك الربط» خاص به. الأخبار والتنبيهات تصل إلى كل هواتفه، والرد على سؤال يصل إلى الهاتف الذي سأل فقط.",
      },
    ],
  },
  {
    id: "2026-10-05-browser-camera",
    date: "2026-10-05",
    title: "الكاميرا في متصفح الجهاز",
    steps: [
      {
        title: "📷 التحقق من الهوية في Starlink",
        before: "في صفحة «تطابق الاسم الموجود في جواز السفر» كانت الكاميرا تظهر مربعًا رماديًا عليه ▶ ولا تفتح.",
        after: "الكاميرا تعمل مباشرة داخل متصفح الجهاز: تظهر الصورة الحيّة فتصوّر الجواز وتكمل التحقق. أول مرة يسألك الهاتف «السماح بالكاميرا» فاضغط سماح.",
      },
    ],
  },
  {
    id: "2026-10-05-live-sync",
    date: "2026-10-05",
    title: "الربط الحيّ مع المندوبين (Firebase)",
    steps: [
      {
        path: "/settings",
        title: "☁️ الربط الحيّ مع المندوبين",
        before: "زبائن المندوب لا يصلونك إلا حين يرسل «تسجيلاتي» وتوافق عليها.",
        after: "الإعدادات ← البوتات ← «☁️ الربط الحيّ مع المندوبين»: الصق apiKey وprojectId من Firebase واضغط «حفظ وتجربة الاتصال»، ثم أرسل لكل مندوب نسخة جديدة. بعدها كل زبون يضيفه أو يربطه بجهاز يظهر عندك خلال ثوانٍ تحت اسمه.",
      },
    ],
  },
  {
    id: "2026-10-05-rep-customers-kept",
    date: "2026-10-05",
    title: "زبائن المندوب لا تتغيّر بنسختك",
    steps: [
      {
        path: "/representatives",
        title: "🤝 نسخة المندوب تحفظ زبائنه",
        before: "إذا أرسلت للمندوب نسخة فيها جهاز غيّرته (مثل تاريخ تجديد جديد) كان يفقد ربط ذلك الجهاز بزبونه.",
        after: "الجهاز يُدمج خانةً بخانة: تصله تحديثاتك (التاريخ، الاسم…) ويبقى زبونه مربوطًا كما هو. وإن ربطتَ أنت نفس الجهاز بزبون آخر، يغلب زبون المندوب.",
      },
    ],
  },
  {
    id: "2026-10-05-client-import",
    date: "2026-10-05",
    title: "استيراد الزبائن من ملف",
    steps: [
      {
        path: "/clients",
        target: "client-import",
        title: "📥 استيراد زبائن من ملف",
        before: "كان كل زبون يُضاف واحدًا واحدًا مع رصيده بيدك.",
        after: "زر «📥 استيراد زبائن من ملف»: تختار الملف فيُضاف كل الزبائن مرة واحدة مع أرصدتهم بالأوقية. الموجودون عندك يُتخطّون، و«↩️ تراجع عن آخر استيراد» يلغيه.",
      },
    ],
  },
  {
    id: "2026-10-05-card-withdraw-fresh-start",
    date: "2026-10-05",
    title: "سحب رصيد البطاقة، بنكيلي بالأوقية فقط، والبداية من جديد",
    steps: [
      {
        path: "/starlink",
        target: "card-section",
        title: "💳 بطاقة كاش: سحب رصيد",
        before: "كان هناك زر «شحن البطاقة» فقط، والمال يخرج من الكاش فقط.",
        after: "زر جديد «💵 سحب رصيد». في الشحن والسحب تختار: الكاش، أو أي تطبيق بنكي (يتحرك رصيده)، أو «خسارة» للسحب، مع صورة إثبات دفع.",
      },
      {
        path: "/reports",
        title: "📊 الخسارة في التقارير",
        after: "السحب إلى «خسارة» يظهر مصروفًا باسم «خسارة بطاقة كاش» في صافي الشهر.",
      },
      {
        path: "/money",
        target: "money-wealth",
        title: "🏦 بنكيلي بالأوقية فقط",
        before: "بنكيلي كان يُظهر 13,500 سيفا - دفعة بالسيفا سُجّلت عليه بالخطأ.",
        after: "كل تطبيق يحمل عملته فقط. الدفعة بالسيفا تذهب إلى «💵 كاش سيفا»، و«إضافة رصيد» لا يعرض إلا التطبيقات بنفس العملة.",
      },
      {
        path: "/money",
        target: "money-fresh-start",
        title: "🔄 البداية من جديد",
        before: "زر «الأرباح والخسائر من 0» كان يختفي بعد ضغطة واحدة، ولا يصفّر البنوك.",
        after: "زر ثابت: كل ضغطة تبدأ الأرباح من اليوم وتصفّر الكاش وكل البنوك والمحافظ وبطاقة KAST. الديون تبقى. «↩️ إرجاع كل شيء كما كان» للتراجع.",
      },
      {
        title: "🆕 هذه الجولة بعد كل تحديث",
        after: "بعد كل تحديث تظهر لك هذه الجولة مرة واحدة. لمشاهدتها مرة أخرى: الإعدادات ← «🆕 ما الجديد».",
      },
    ],
  },
];

/** At most this many unseen updates are walked through at once (the newest ones). */
export const MAX_RELEASES_PER_TOUR = 3;

/**
 * The updates to walk through now, oldest first. `seen` = the ids already shown on this phone, or
 * null on the very first run of this feature - then only the newest day's updates play (not the
 * whole past).
 */
export function pendingReleases(releases: WhatsNewRelease[], seen: string[] | null): WhatsNewRelease[] {
  if (releases.length === 0) return [];
  if (seen === null) return releases.filter((r) => r.date === releases[0]!.date).slice(0, MAX_RELEASES_PER_TOUR).reverse();
  const seenSet = new Set(seen);
  return releases
    .filter((r) => !seenSet.has(r.id))
    .slice(0, MAX_RELEASES_PER_TOUR)
    .reverse();
}

/** One tour from several updates: their steps in order, each knowing its update. */
export function tourSteps(releases: WhatsNewRelease[]): Array<WhatsNewStep & { releaseId: string }> {
  return releases.flatMap((r) => r.steps.map((s) => ({ ...s, releaseId: r.id })));
}

export function markSeen(seen: string[] | null, ids: string[]): string[] {
  return Array.from(new Set([...(seen ?? []), ...ids]));
}

/** "/money/" → "/money" so a page compares equal whatever the trailing slash. */
export function samePath(a: string, b: string): boolean {
  const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p) || "/";
  return norm(a) === norm(b);
}

// ---- per-phone memory (a setting, not business data: not in the backup) ----

const SEEN_KEY = "starnet.whatsNewSeen";

export function loadSeenReleases(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function saveSeenReleases(ids: string[]): void {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    // a convenience only
  }
}

/** Settings' «▶️ شاهد» asks the tour (mounted once in the layout) to play one update. */
export const WHATS_NEW_EVENT = "starnet:whats-new";
