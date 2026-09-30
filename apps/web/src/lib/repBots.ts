/**
 * The reps get up to three bots: 📡 the devices bot (the original reps bot - devices, search,
 * edits, notes, ⚡ تفعيل), 💰 the money bot (payments, promises, customers' debts, his share /
 * profit / balance, handing money over, ⚡ تفعيل with its price and the month's total) and 🔔 the
 * alerts bot (one-way alerts with buttons). The money and alerts bots are optional: until the
 * operator connects them, everything stays in the devices bot exactly as before. A rep is linked
 * once (in the devices bot) - a private chat's id is his Telegram id, the same in every bot.
 * Pure (texts, keyboards, which bot a message belongs to).
 */

import { REP_HELP, REP_KEYBOARD } from "./telegramRepMessages";

export type RepBot = "reps" | "money" | "alerts";

/** The connected bots' @names (absent = not connected). */
export interface RepBotNames {
  devices?: string;
  money?: string;
  alerts?: string;
}

/** Commands that belong to the money bot once it's connected. */
export const MONEY_KINDS = ["payment", "promise", "mypromises", "debts", "statement", "handover"] as const;

export function isMoneyKind(kind: string): boolean {
  return (MONEY_KINDS as readonly string[]).includes(kind);
}

/** 📡 The devices bot's buttons once the money bot takes the money ones. */
export const REP_DEVICES_KEYBOARD = JSON.stringify({
  keyboard: [
    [{ text: "📡 أجهزتي" }, { text: "📅 تنتهي" }],
    [{ text: "⛔ الموقوفة" }, { text: "📆 الأيام" }],
    [{ text: "⚡ تفعيل" }, { text: "🔎 بحث" }],
    [{ text: "❓ مساعدة" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "اسم زبون أو جهاز أو رقم للبحث",
});

/** 💰 The money bot's buttons. */
export const REP_MONEY_KEYBOARD = JSON.stringify({
  keyboard: [
    [{ text: "💵 دفعة" }, { text: "🤝 وعد دفع" }],
    [{ text: "💰 ديون زبائني" }, { text: "📋 وعودي" }],
    [{ text: "📊 كشفي" }, { text: "🤲 سلّمت المسؤول" }],
    [{ text: "🔎 بحث" }, { text: "❓ مساعدة" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "اسم زبون أو جهاز لديونه وكشفه",
});

export function devicesKeyboard(names: RepBotNames): string {
  return names.money ? REP_DEVICES_KEYBOARD : REP_KEYBOARD;
}

export const REP_DEVICES_HELP = [
  "📡 بوت الأجهزة - استعمل الأزرار أسفل المحادثة، أو اكتب مباشرةً:",
  "📡 أجهزتي · 📅 تنتهي · ⛔ الموقوفة · 📆 الأيام (اضغط يوماً لأجهزته)",
  "🔎 بحث - أو اكتب جزءاً من اسم زبون أو جهاز أو إيميل، أو رقم هاتف أو KIT",
  "   تحت الجهاز: 📶 الشبكة · 📅 التجديد · 🛰️ الاشتراك · 🔢 KIT/SN · 👤 المعلومات · ✏️ تعديل · 📝 ملاحظة · 💰 المال",
  "⚡ تفعيل - اطلب تفعيل جهاز (ROM / Sis / 100G) بالسعر الذي يدفعه الزبون: تفعيل محمد",
  "➕ لإضافة زبون جديد: من تطبيق STAR NET ← الزبائن (لم يعد من البوت)",
  "💰 للدفعات والديون والأرباح: بوت المال",
  "❓ مساعدة - تُظهر هذه القائمة في أي وقت",
].join("\n");

export const REP_MONEY_HELP = [
  "💰 بوت المال - كل ما يخص المبالغ. استعمل الأزرار أو اكتب مباشرةً:",
  "💵 دفعة - دفعة استلمتها من زبون. اكتب المبلغ وعملته ثم الاسم:",
  "   دفعة 5000 محمد (أوقية) · دفعة 5000 سيفا محمد · دفعة 50 دولار محمد",
  "🤝 وعد دفع - موعد وعدك فيه الزبون: وعد 5000 محمد الخميس",
  "💰 ديون زبائني - ديون زبائن أجهزتك · 📋 وعودي - وعود الدفع المفتوحة",
  "📊 كشفي - حصتك وأرباحك هذا الشهر ورصيدك مع المسؤول",
  "🤲 سلّمت المسؤول - مبلغ سلّمته للمسؤول: سلمت 50000 · بالدولار: سلمت 100 دولار",
  "⚡ تفعيل - يظهر هنا مبلغه بعد موافقة المسؤول مع مجموع الشهر",
  "🔎 اكتب اسم زبون أو جهاز لترى دينه وكشفه",
  "❓ مساعدة - تُظهر هذه القائمة في أي وقت",
].join("\n");

export const REP_ALERTS_INFO = "🔔 هذا بوت التنبيهات - تصلك هنا تنبيهات أجهزتك فقط (توقف، تجديدات...) مع أزرارها.";

export const REP_HANDOVER_HINT = [
  "🤲 لتسجيل مبلغ سلّمته للمسؤول اكتب:",
  "سلمت المبلغ",
  "مثال: سلمت 50000 · بالدولار: سلمت 100 دولار",
].join("\n");

export function repHandoverReceivedText(amountLabel: string): string {
  return `✅ وصل تسليمك ${amountLabel} - يُسجَّل في حسابك بعد تأكيد المسؤول وتصلك رسالة بذلك.`;
}

/** A money command typed in the devices bot once the money bot is connected. */
export function moneyRedirectText(moneyBot: string): string {
  return `💰 الدفعات والديون والأرباح أصبحت في بوت المال: @${moneyBot}\nافتحه واضغط «ابدأ» مرة واحدة.`;
}

/** The devices bot's help: the split one once the money bot exists. */
export function devicesHelp(names: RepBotNames): string {
  return names.money ? REP_DEVICES_HELP : REP_HELP;
}

/** Tells a newly linked rep about the other bots (empty when there are none). */
export function otherBotsLines(names: RepBotNames): string[] {
  const lines: string[] = [];
  if (names.money) lines.push(`💰 بوت المال (الدفعات والأرباح): @${names.money}`);
  if (names.alerts) lines.push(`🔔 بوت التنبيهات: @${names.alerts}`);
  return lines.length > 0 ? ["", "افتح هذه البوتات واضغط «ابدأ» في كل واحد:", ...lines] : [];
}

/** The "💰 المال" button of a device: opens the money bot on that device (t.me deep link). */
export function moneyDeepLink(moneyBot: string | undefined, accountId: string): string | undefined {
  if (!moneyBot || !/^[A-Za-z0-9_-]{1,62}$/.test(accountId)) return undefined;
  return `https://t.me/${moneyBot}?start=d_${accountId}`;
}

/** Which bot a confirmation to the rep goes back through. */
export function botForRequest(kind: string): RepBot {
  return kind === "payment" || kind === "handover" || kind === "promise" ? "money" : "reps";
}
