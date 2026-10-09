/**
 * 🛂 «كشف توثيق» (his Oct 2026 request): Starlink's Home asks to «Complete Travel Registration by
 * October 15» - after that the service stops outside the home country. The day's «كشف توثيق» reads
 * each device's Home only (nothing else on the device changes), then ONE bot message lists the
 * devices that need it - name, email, phone - with a WhatsApp button per device that opens the chat
 * with the customer message ready (his wording choice: «قوي: سيُغلق الحساب»). Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { LEDGER_CURRENCIES, type LedgerCurrency, type LedgerEntry } from "./ledgerStore";
import type { RepresentativeStore } from "./repStore";
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
  // His rule (Oct 7): the Starlink email names the device for the customer - «أهم شيء في الرسالة».
  const message = buildTravelRegistrationMessage(account.expectedEmail || account.starlinkAccountEmail || account.name, account.travelRegistrationDue);
  return buildWhatsAppLink(phone, message) ?? `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** The deadline a «اكتمل» is matched against ("" when Starlink printed none). */
function dueKey(account: Pick<StarlinkAccountSummary, "travelRegistrationDue">): string {
  return account.travelRegistrationDue?.trim() ?? "";
}

/** 🛂 Starlink still shows the banner: in «تحتاج توثيق» - even after «✅ تم التوثيق» (his rule:
 * it stays until an update confirms the banner is gone). */
export function needsTravelRegistration(account: StarlinkAccountSummary): boolean {
  return account.travelRegistrationRequired === true && !account.deletedAt && !account.archivedAt;
}

/** ⏳ He pressed «✅ تم التوثيق» for this deadline - waiting for an update to confirm. */
export function isTravelPending(account: StarlinkAccountSummary): boolean {
  return needsTravelRegistration(account) && typeof account.travelRegistrationDoneFor === "string" && account.travelRegistrationDoneFor === dueKey(account);
}

/** ✅ In «تم توثيقها»: an update read Home without the banner after it was there. */
export function isTravelVerified(account: StarlinkAccountSummary): boolean {
  return Boolean(account.travelRegistrationVerifiedAt) && account.travelRegistrationRequired !== true && !account.deletedAt && !account.archivedAt;
}

/** ✅ «تم التوثيق»: marked done (⏳ until an update confirms) - the device stays in its place. */
export function markTravelDone(account: StarlinkAccountSummary, now: Date = new Date()): Partial<StarlinkAccountSummary> {
  return { travelRegistrationDoneFor: dueKey(account), travelRegistrationDoneAt: now.toISOString() };
}

/** ↩️ «لم يتم»: the «تم التوثيق» was early / wrong. */
export function undoTravelDone(): Partial<StarlinkAccountSummary> {
  return { travelRegistrationDoneFor: null, travelRegistrationDoneAt: null };
}

/** 💰 The registration price (null clears it). */
export function setTravelPrice(amount: number | null, currency: string): Partial<StarlinkAccountSummary> {
  return { travelRegistrationPrice: amount !== null && Number.isFinite(amount) && amount > 0 ? { amount, currency } : null };
}

// ---- 🛂 The registration price is a debt on the device's owner (his Oct 9 2026 request) ----

/** The note the owner reads in his statement. */
export const TRAVEL_FEE_NOTE = "🛂 توثيق السفر";

/** Which registration a fee belongs to: the deadline it answered, else the day it was verified -
 * Starlink asking again later is a new registration with its own fee. */
export function travelFeeKey(account: Pick<StarlinkAccountSummary, "travelRegistrationVerifiedDue" | "travelRegistrationVerifiedAt">): string {
  return account.travelRegistrationVerifiedDue?.trim() || account.travelRegistrationVerifiedAt?.slice(0, 10) || "travel";
}

export interface TravelFeeResult {
  entries: LedgerEntry[];
  change: "added" | "updated" | "removed" | "none";
  /** The entry as it is now («added» / «updated»). */
  entry?: LedgerEntry;
  /** Days of the entries touched - for the closed-month check. */
  dates: string[];
}

/** «💰 سعر التوثيق» saved or removed → the device's ledger gets / changes / loses its «عليه 🛂
 * توثيق السفر» entry, so the owner's balance and statement carry it (the device's customer, or
 * its rep's book for a rep's device - the same as every operation on the device). The entry is
 * linked to the registration (`travelFeeFor`), never a renewal: no Starlink cost, no profit, no
 * rep commission. `account` carries the price as it is AFTER the change. Pure. */
export function applyTravelFee(
  entries: LedgerEntry[],
  account: Pick<StarlinkAccountSummary, "travelRegistrationPrice" | "travelRegistrationVerifiedDue" | "travelRegistrationVerifiedAt">,
  today: string,
  now: Date = new Date(),
  newId: () => string = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ledger-${now.getTime()}-${Math.random()}`),
): TravelFeeResult {
  const key = travelFeeKey(account);
  const index = entries.findIndex((e) => e.travelFeeFor === key);
  const existing = index >= 0 ? entries[index] : undefined;
  const price = account.travelRegistrationPrice;
  const currency = price && (LEDGER_CURRENCIES as string[]).includes(price.currency) ? (price.currency as LedgerCurrency) : undefined;

  if (!price || !(price.amount > 0) || !currency) {
    if (!existing) return { entries, change: "none", dates: [] };
    return { entries: entries.filter((_, i) => i !== index), change: "removed", dates: [existing.date] };
  }
  if (existing) {
    if (existing.amount === price.amount && existing.currency === currency) return { entries, change: "none", entry: existing, dates: [] };
    const entry: LedgerEntry = { ...existing, amount: price.amount, currency };
    return { entries: entries.map((e, i) => (i === index ? entry : e)), change: "updated", entry, dates: [existing.date] };
  }
  const entry: LedgerEntry = {
    id: newId(),
    kind: "debit",
    amount: price.amount,
    currency,
    note: TRAVEL_FEE_NOTE,
    email: "",
    date: today,
    createdAt: now.toISOString(),
    travelFeeFor: key,
  };
  return { entries: [...entries, entry], change: "added", entry, dates: [today] };
}

export interface TravelEarnings {
  count: number;
  /** What he charged, per currency - never mixed. */
  byCurrency: Record<string, number>;
  /** Verified devices still without a price. */
  unpriced: number;
}

/** «وُثّق N جهاز · حصلنا …» over the verified devices. */
export function travelEarnings(accounts: StarlinkAccountSummary[]): TravelEarnings {
  const out: TravelEarnings = { count: 0, byCurrency: {}, unpriced: 0 };
  for (const account of accounts) {
    if (!isTravelVerified(account)) continue;
    out.count += 1;
    const price = account.travelRegistrationPrice;
    if (price && price.amount > 0) out.byCurrency[price.currency] = (out.byCurrency[price.currency] ?? 0) + price.amount;
    else out.unpriced += 1;
  }
  return out;
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

// ---- 👥 his devices apart from each rep's (his Oct 2026 request: «اجعل هناك فارق») ----

export interface TravelGroup {
  /** "mine" or the rep's id. */
  key: string;
  label: string;
  accounts: StarlinkAccountSummary[];
}

/** «🏠 أجهزتي» first, then each rep's devices under his name (most first). */
export function groupTravelByOwner(accounts: StarlinkAccountSummary[], reps: RepresentativeStore): TravelGroup[] {
  const mine = accounts.filter((a) => !a.representativeId);
  const byRep = new Map<string, StarlinkAccountSummary[]>();
  for (const account of accounts) {
    if (account.representativeId) byRep.set(account.representativeId, [...(byRep.get(account.representativeId) ?? []), account]);
  }
  const repGroups = [...byRep]
    .map(([repId, list]) => ({ key: repId, label: `📱 ${reps[repId]?.name ?? "مندوب محذوف"}`, accounts: list }))
    .sort((a, b) => b.accounts.length - a.accounts.length || a.label.localeCompare(b.label, "ar"));
  return [...(mine.length ? [{ key: "mine", label: "🏠 أجهزتي", accounts: mine }] : []), ...repGroups];
}
