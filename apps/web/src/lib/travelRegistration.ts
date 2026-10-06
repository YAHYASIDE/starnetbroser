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

/** "October 15" → "15 أكتوبر"; anything else as printed; no date → "الموعد المحدد". */
export function travelDueArabic(due: string | undefined): string {
  const text = due?.trim() ?? "";
  if (!text) return "الموعد المحدد";
  const match = /^([A-Za-z]+)\.?\s+(\d{1,2})$/.exec(text);
  const month = match ? MONTHS[match[1]!.slice(0, 3).toLowerCase()] : undefined;
  return match && month ? `${match[2]} ${month}` : text;
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

export function needsTravelRegistration(account: StarlinkAccountSummary): boolean {
  return account.travelRegistrationRequired === true && !account.deletedAt && !account.archivedAt;
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
    const wa = buildWhatsAppLink(phone, buildTravelRegistrationMessage(account.name, account.travelRegistrationDue));
    if (wa) rows.push([{ text: `💬 واتساب ${account.name}`, url: wa }]);
    return [
      `${i + 1}) ${account.name}`,
      `📧 ${email || "بلا بريد"}`,
      `📱 ${phone || "بلا رقم"}`,
      `⏰ قبل ${travelDueArabic(account.travelRegistrationDue)}`,
    ].join("\n");
  });
  return {
    text: `${head}\n\n${lines.join("\n\n")}${rows.length ? "\n\nاضغط زر الواتساب: الرسالة جاهزة للزبون." : ""}`,
    replyMarkup: rows.length ? JSON.stringify({ inline_keyboard: rows }) : undefined,
    found: found.length,
  };
}
