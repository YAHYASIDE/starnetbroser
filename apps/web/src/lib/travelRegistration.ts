/**
 * 🛂 «كشف توثيق» (his Oct 2026 request): Starlink's Home asks to «Complete Travel Registration by
 * October 15» - after that the service stops outside the home country. The day's «كشف توثيق» reads
 * each device's Home only (nothing else on the device changes), then ONE bot message lists the
 * devices that need it - name, email, phone - with a WhatsApp button per device that opens the chat
 * with the customer message ready (his wording choice: «قوي: سيُغلق الحساب»). Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { buildWhatsAppLink } from "./whatsapp";

const MONTHS: Record<string, string> = {
  jan: "يناير", feb: "فبراير", mar: "مارس", apr: "أبريل", may: "مايو", jun: "يونيو",
  jul: "يوليو", aug: "أغسطس", sep: "سبتمبر", oct: "أكتوبر", nov: "نوفمبر", dec: "ديسمبر",
};

/** French month names as Starlink prints them (a rep's devices are in French). */
const FRENCH_MONTHS: Record<string, string> = {
  janvier: "يناير", "février": "فبراير", fevrier: "فبراير", mars: "مارس", avril: "أبريل", mai: "مايو", juin: "يونيو",
  juillet: "يوليو", "août": "أغسطس", aout: "أغسطس", septembre: "سبتمبر", octobre: "أكتوبر", novembre: "نوفمبر",
  "décembre": "ديسمبر", decembre: "ديسمبر",
};

/** "October 15" / "15 octobre" → "15 أكتوبر"; anything else as printed; no date → "الموعد المحدد". */
export function travelDueArabic(due: string | undefined): string {
  const text = due?.trim() ?? "";
  if (!text) return "الموعد المحدد";
  const english = /^([A-Za-z]+)\.?\s+(\d{1,2})$/.exec(text);
  const englishMonth = english ? MONTHS[english[1]!.slice(0, 3).toLowerCase()] : undefined;
  if (english && englishMonth) return `${english[2]} ${englishMonth}`;
  const french = /^(\d{1,2})\s+(\S+)$/.exec(text);
  const frenchMonth = french ? FRENCH_MONTHS[french[2]!.toLowerCase()] : undefined;
  return french && frenchMonth ? `${french[1]} ${frenchMonth}` : text;
}

/** The customer's WhatsApp message. */
export function buildTravelRegistrationMessage(deviceName: string, due: string | undefined): string {
  return (
    `السلام عليكم ورحمة الله وبركاته\n\n` +
    `جهاز Starlink الخاص بكم «${deviceName}» يجب توثيقه (Travel Registration) قبل ${travelDueArabic(due)}.\n\n` +
    `⚠️ إن لم يتم التوثيق قبل هذا الموعد سيُغلق الحساب وتتوقف الخدمة.\n\n` +
    `تواصلوا معنا فورًا لإكمال التوثيق.\n\n` +
    `- STAR NET`
  );
}

/** The customer's WhatsApp with the message ready; with no number, WhatsApp opens on the message
 * and he picks the contact himself (his request: a WhatsApp button even without a number). */
export function travelWhatsAppLink(account: StarlinkAccountSummary, phone: string | undefined): string {
  const message = buildTravelRegistrationMessage(account.name, account.travelRegistrationDue);
  return buildWhatsAppLink(phone, message) ?? `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** The deadline a «اكتمل» is matched against ("" when Starlink printed none). */
function dueKey(account: Pick<StarlinkAccountSummary, "travelRegistrationDue">): string {
  return account.travelRegistrationDue?.trim() ?? "";
}

export function needsTravelRegistration(account: StarlinkAccountSummary): boolean {
  if (account.travelRegistrationRequired !== true || account.deletedAt || account.archivedAt) return false;
  // ✅ He marked it done for this same deadline - a new deadline from Starlink brings it back.
  return !(typeof account.travelRegistrationDoneFor === "string" && account.travelRegistrationDoneFor === dueKey(account));
}

/** ✅ «اكتمل التوثيق»: the device leaves the list (a copy - the device itself stays in its place). */
export function markTravelDone(account: StarlinkAccountSummary, now: Date = new Date()): Partial<StarlinkAccountSummary> {
  return { travelRegistrationDoneFor: dueKey(account), travelRegistrationDoneAt: now.toISOString() };
}

/** The rep's bot message when the owner registered one of his devices. */
export function travelDoneRepMessage(account: StarlinkAccountSummary): string {
  const email = account.expectedEmail || account.starlinkAccountEmail;
  return `✅ تم توثيق جهاز «${account.name}»${email ? `\n📧 ${email}` : ""}\nلن تتوقف خدمته خارج البلد - يمكنك إخبار الزبون.`;
}

export interface TravelCheckReport {
  text: string;
  /** Telegram inline keyboard: one «💬 واتساب <name>» button per device with a phone. */
  replyMarkup?: string;
  found: number;
}

/** The one bot message after a «كشف توثيق» over `ids` (in their order). */
export function buildTravelCheckReport(
  label: string,
  ids: string[],
  accounts: StarlinkAccountSummary[],
  phoneFor: (account: StarlinkAccountSummary) => string | undefined,
  skipped = 0,
): TravelCheckReport {
  const found = ids
    .map((id) => accounts.find((a) => a.id === id))
    .filter((a): a is StarlinkAccountSummary => Boolean(a) && needsTravelRegistration(a!));
  const head = `🛂 كشف توثيق${label ? ` - ${label}` : ""}\nفُحص ${ids.length} جهاز · يحتاج توثيق: ${found.length}${skipped ? ` · لم يُفحص ${skipped} (غير مسجّل/تعلّق)` : ""}`;
  if (found.length === 0) return { text: `${head}\n\n✅ لا جهاز يحتاج توثيقًا.`, found: 0 };
  const rows: { text: string; url: string }[][] = [];
  const lines = found.map((account, i) => {
    const email = account.expectedEmail || account.starlinkAccountEmail;
    const phone = phoneFor(account);
    rows.push([{ text: phone ? `💬 واتساب ${account.name}` : `💬 واتساب ${account.name} (اختر الرقم)`, url: travelWhatsAppLink(account, phone) }]);
    return [
      `${i + 1}) ${account.name}`,
      `📧 ${email || "بلا بريد"}`,
      `📱 ${phone || "بلا رقم"}`,
      `⏰ قبل ${travelDueArabic(account.travelRegistrationDue)}`,
    ].join("\n");
  });
  return {
    text: `${head}\n\n${lines.join("\n\n")}\n\nاضغط زر الواتساب: الرسالة جاهزة للزبون.`,
    replyMarkup: JSON.stringify({ inline_keyboard: rows }),
    found: found.length,
  };
}

// ---- ✓ «أُرسل»: which customers he already messaged (phone-only, `starnet.travelSent`) ----

const SENT_KEY = "starnet.travelSent";

export function loadTravelSent(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SENT_KEY) ?? "{}") as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function markTravelSent(accountId: string, at: Date = new Date()): Record<string, string> {
  const next = { ...loadTravelSent(), [accountId]: at.toISOString() };
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable - only the ✓ is lost
  }
  return next;
}
