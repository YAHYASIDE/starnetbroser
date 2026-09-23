import { toWesternDigits } from "./arabicNumerals";
import { parseMoney, ParsedMoney } from "./money";

/**
 * Bilingual label keyword lists - a best-effort first pass built from the field names this
 * feature was specified against, refined against a real Starlink account page's wording where
 * the user has confirmed it. Each field's list is isolated here so tuning one is a small,
 * localized change.
 */
export const PLAN_LABELS = ["service plan", "plan", "الخطة", "باقة الخدمة", "الباقة", "خطة الخدمة"];

export const RENEWAL_DATE_LABELS = [
  "renewal date", "next billing", "renews on", "service end", "next due date", "scheduled to end",
  "تاريخ التجديد", "تجديد الاشتراك", "نهاية الخدمة", "موعد التجديد", "تاريخ الاستحقاق التالي",
  // The real Starlink app's home-page "scheduled to end" banner (a resumable pending
  // cancellation, see SCHEDULED_END_BANNER_LABELS' own doc) phrases this as a sentence, not a
  // "label: value" pair - e.g. "من المقرر أن تنتهي خدمتك في ٢٠٢٦/٩/٢٨." - so the label match only
  // needs this fragment; normalizeDateLike below pulls the date out of whatever surrounds it
  // ("في ..." / a trailing ".").
  "تنتهي خدمتك",
];

/** This banner ("من المقرر أن تنتهي خدمتك في ...", with a "استئناف"/Resume option) means the
 * service is still running RIGHT NOW - only a future renewal is being canceled, reversible up
 * until that date. Real, confirmed mistake this replaces: earlier code treated this banner as
 * "standby" (as if the service were already paused), which colored an actively-working account's
 * plan red/yellow instead of green and hid its real plan name behind a generic status word.
 * "standby" is reserved for a genuine paused-right-now badge (e.g. "وضع الاستعداد قيد التعليق" on
 * the "خطة الخدمة" card itself, see extractPlanBadgeStatus) - never this banner alone. */
export const SCHEDULED_END_BANNER_LABELS = ["scheduled to end", "تنتهي خدمتك"];

export function hasScheduledEndBanner(lines: string[]): boolean {
  return lines.some((line) => containsAny(line, SCHEDULED_END_BANNER_LABELS));
}

/** The real page's top banner once suspended for non-payment ("تم تعطيل خدمتك بسبب مشكلة في
 * الفوترة. يرجى التأكد من دفع جميع الفواتير.") - unlike SCHEDULED_END_BANNER_LABELS (which still
 * means the service is running), this one means the service is ALREADY suspended right now.
 * Checked directly against the whole page, not scoped to one card, since on the real Billing page
 * specifically there is no "خطة الخدمة" card at all for extractPlanBadgeStatus to scan - this
 * banner is the only suspended signal on that page.
 *
 * Deliberately requires "بسبب" (due to) right after "تعطيل خدمتك" - a real, confirmed false
 * positive this fixes: an earlier, shorter "تعطيل خدمتك"/"تعطيل الخدمة" match (2-3 words, no
 * reason clause) fired on an account that was never actually suspended, most likely some
 * unrelated self-service "disable the service" menu action or reassuring copy elsewhere on the
 * page - a bare "disable service" fragment reads as an action or a possibility, not a report that
 * it already happened. The full "disabled ... DUE TO a billing problem" phrasing is specific
 * enough to risk matching without being scoped to one card, the same reasoning as
 * SCHEDULED_END_BANNER_LABELS' own sentence-banner match. */
export const BILLING_SUSPENSION_BANNER_LABELS = ["service has been disabled due to", "تعطيل خدمتك بسبب"];

export function hasBillingSuspensionBanner(lines: string[]): boolean {
  return lines.some((line) => containsAny(line, BILLING_SUSPENSION_BANNER_LABELS));
}

/**
 * True only when the real, unlabeled "<holder name> • ACC-..." line (see
 * extractAccountHolderName/NAME_BEFORE_ACCOUNT_PATTERN below) is present - a marker unique to the
 * account's own Home page, already trusted for that exact purpose elsewhere in this file.
 *
 * Real, confirmed bug this fixes: a genuinely never-suspended, fully-paid account (screenshots of
 * both the real Starlink Home page and our own app, from the user) kept showing "موقوف" (suspended)
 * in the app - not a fresh false-positive match, but a STALE serviceStatus value from some earlier
 * sync that a later sync of the Home page could never correct. The Home page has no "خطة الخدمة"
 * card (extractPlanBadgeStatus finds nothing there) and no labeled status line, so
 * hasBillingSuspensionBanner being false only ever left serviceStatus undefined - and per
 * mergeSyncedFields' additive-only merge, "undefined" never overwrites an existing stored value,
 * however wrong. Two independently confirmed real accounts (one genuinely suspended, one not) both
 * showed the exact same thing: a genuinely suspended account's Home page prints the suspension
 * banner directly on it, right there, every time - so once we're confirmed to be looking at the
 * Home page and that banner is absent, the account is confirmed active right now, which is strong
 * enough evidence to actively correct a stale "suspended" tag rather than leave it as-is forever.
 */
export function isOnAccountHomePage(lines: string[]): boolean {
  return lines.some((line) => NAME_BEFORE_ACCOUNT_PATTERN.test(line));
}

/**
 * The real "خطة الخدمة" card shows a status badge right next to the plan name itself - "نشط" once
 * active, or a standby-wording badge (e.g. "وضع الاستعداد قيد التعليق") while the account is
 * scheduled to move to standby - instead of a separately-labeled "حالة الخدمة" row anywhere on the
 * page. Deliberately scoped to the few lines right after "خطة الخدمة" (never a whole-page scan,
 * the same class of risk a bare "نشط"/"النهاية" match would have anywhere else), reusing
 * normalizeServiceStatus's own word lists rather than a second, separately-maintained set.
 */
export function extractPlanBadgeStatus(lines: string[]): NormalizedServiceStatus | undefined {
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("خطة الخدمة")) continue;
    for (let j = i; j < Math.min(i + 3, lines.length); j++) {
      const status = normalizeServiceStatus(lines[j]);
      if (status) return status;
    }
    return undefined;
  }
  return undefined;
}

/**
 * The real "خطة الخدمة" card can show a "النهاية ٢٠٢٦/٩/٢٨" badge - but "النهاية" ("the end") is
 * deliberately NOT in RENEWAL_DATE_LABELS: it is too generic a bare word to safely match as a
 * substring across an entire real page (unrelated prose, promotions, or disclaimers can contain
 * it and hand back a completely unrelated date). This only matches the exact "النهاية <date>"
 * shape on one line/token, never a cross-line lookahead.
 */
export function extractRenewalBadgeDate(lines: string[]): string | undefined {
  for (const line of lines) {
    const western = toWesternDigits(line);
    const match = /النهاية\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2})/.exec(western);
    if (match) return match[1];
  }
  return undefined;
}

/** The real Billing page's cycle section - unlike every other renewal signal, this one has no
 * year at all (e.g. "تاريخ استحقاق الدفع: ٢٨ أغسطس.") since it describes a RECURRING monthly due
 * day, not a specific date. Deliberately returns only the bare day-of-month (1-31); combine with
 * nextOccurrenceOfDay to turn it into an actual date, rather than guessing a year from the text. */
export const BILLING_DUE_DAY_LABELS = ["تاريخ استحقاق الدفع", "payment due date"];

export function extractBillingDueDay(lines: string[]): number | undefined {
  const raw = extractLabeledValue(lines, BILLING_DUE_DAY_LABELS);
  if (!raw) return undefined;
  const match = /^(\d{1,2})\b/.exec(toWesternDigits(raw).trim());
  if (!match) return undefined;
  const day = parseInt(match[1], 10);
  return day >= 1 && day <= 31 ? day : undefined;
}

const INVOICE_DATE_PATTERN = /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/;

/** Fallback for a suspended-for-billing account's recurring billing day when the "دورة الفوترة"
 * section itself has gone blank - a real, confirmed page state ("لم تتم إضافة أي اشتراكات إلى هذا
 * الحساب") once the account is suspended for non-payment, so BILLING_DUE_DAY_LABELS has nothing to
 * find. Reads the day from the "الفواتير" invoice list instead, using only a row described as
 * "اشتراك" (subscription) - never "طلب" (a hardware/equipment order, an unrelated one-off date).
 * Takes the FIRST such row (the real page lists invoices newest-first) and only a small window
 * around its own "اشتراك" cell, never a wider scan that could pick up a neighboring row's date;
 * if that window has no date, tries the next "اشتراك" row rather than giving up immediately.
 * Returns just the bare day-of-month, same contract as extractBillingDueDay - combine with
 * nextOccurrenceOfDay for an actual date. Only ever looks FORWARD from the "اشتراك" cell (the
 * real row order is status, then description, then date) - looking backward too risks grabbing
 * the PREVIOUS row's own trailing date cell instead of this row's. */
export function extractSubscriptionInvoiceDueDay(lines: string[]): number | undefined {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "اشتراك") continue;
    for (let j = i; j < Math.min(i + 3, lines.length); j++) {
      const western = toWesternDigits(lines[j]);
      const match = INVOICE_DATE_PATTERN.exec(western);
      if (match) {
        const day = parseInt(match[3], 10);
        if (day >= 1 && day <= 31) return day;
      }
    }
  }
  return undefined;
}

/** Turns a bare recurring day-of-month into a real "YYYY/MM/DD": this month if that day hasn't
 * passed yet, otherwise next month - so it always reads as the upcoming due date, regardless of
 * which month it happens to be synced in. `now` is injectable for deterministic tests; defaults
 * to the real current date. Clamps to the last real day of the target month (e.g. day 31 synced
 * in a 30-day month) rather than producing an invalid date. */
export function nextOccurrenceOfDay(day: number, now: Date = new Date()): string {
  let year = now.getFullYear();
  let month = now.getMonth();
  if (day < now.getDate()) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const clampedDay = Math.min(day, daysInMonth);
  return `${year}/${String(month + 1).padStart(2, "0")}/${String(clampedDay).padStart(2, "0")}`;
}

export const SERVICE_STATUS_LABELS = [
  "service status", "account status", "subscription status",
  "حالة الخدمة", "حالة الاشتراك", "حالة الحساب",
];

/** starlinkId is the dish's own internal identifier - deliberately never "account id"/"رقم الحساب", which is accountNumber. */
export const STARLINK_ID_LABELS = [
  "starlink id", "dish id", "unit id", "معرف ستارلينك", "معرف الطبق", "معرف الوحدة",
];

export const ACCOUNT_NUMBER_LABELS = ["account number", "account no", "account #", "رقم الحساب"];
const ACCOUNT_NUMBER_PATTERN = /\bACC-[A-Za-z0-9-]{2,}\b/i;

export const SERIAL_NUMBER_LABELS = ["serial number", "serial no", "الرقم التسلسلي"];
export const KIT_NUMBER_LABELS = ["kit number", "kit no", "رقم الطقم", "رقم kit"];

export const BALANCE_LABELS = [
  "outstanding balance", "payable balance", "balance due", "amount due",
  "الرصيد المستحق", "الرصيد الواجب دفعه", "المبلغ المستحق",
];

export const DATA_USAGE_LABELS = [
  "total usage", "total data usage", "data usage", "إجمالي استهلاك الباقة", "استهلاك الباقة",
];

/** The account's registered login email, from the Settings page. */
export const EMAIL_LABELS = ["email", "e-mail", "البريد الإلكتروني", "الإيميل"];

/** The account's registered contact phone, from the same Settings page as EMAIL_LABELS - each
 * account browses Starlink in its own isolated session (a separate login per account/customer),
 * so unlike a shared reseller login this genuinely is that customer's own number. See
 * SyncedStarlinkFields.phone's own doc for why mergeSyncedFields still only ever fills this in
 * when the operator hasn't already entered a WhatsApp number by hand. */
export const PHONE_LABELS = ["phone", "phone number", "رقم الهاتف", "الهاتف"];

/** Every recognized label, across every field - used to recognize "this line is a DIFFERENT
 * field's label, not this field's value" during the forward-lookahead in extractLabeledValue.
 * Includes "النهاية" even though it is deliberately NOT in RENEWAL_DATE_LABELS itself (see
 * extractRenewalBadgeDate) - another field's lookahead (e.g. planName) still needs to recognize
 * a "النهاية <date>" badge line as belonging to a different field, not accidentally grab it as
 * its own value. */
const ALL_LABELS = [
  ...PLAN_LABELS,
  ...RENEWAL_DATE_LABELS,
  "النهاية",
  ...SERVICE_STATUS_LABELS,
  ...STARLINK_ID_LABELS,
  ...ACCOUNT_NUMBER_LABELS,
  ...SERIAL_NUMBER_LABELS,
  ...KIT_NUMBER_LABELS,
  ...BALANCE_LABELS,
  ...DATA_USAGE_LABELS,
  ...EMAIL_LABELS,
  ...PHONE_LABELS,
];

/** Action-button words a card commonly places right under/beside a label (e.g. "إدارة"/"Manage",
 * "ادفع"/"Pay" next to a balance) - never a field's actual value, so the forward-lookahead must
 * skip over them. */
const ACTION_WORDS = [
  "manage", "edit", "change", "view", "details", "pay",
  "إدارة", "تعديل", "تغيير", "عرض", "التفاصيل", "ادفع",
];

const ACTIVE_WORDS = ["active", "نشط"];
const STANDBY_WORDS = ["standby", "في الانتظار", "وضع الانتظار", "وضع الاستعداد"];
const CANCELED_WORDS = ["canceled", "cancelled", "ملغى", "ملغي"];
const SUSPENDED_WORDS = ["suspended", "موقوف", "معلق"];

export type NormalizedServiceStatus = "active" | "standby" | "canceled" | "suspended";

// Arabic combining diacritics (tashkeel: fatha/damma/kasra/shadda/sukun/tanwin) plus the
// superscript alef - the real Starlink page renders a suspended badge as "مُعلَّق" (with these
// marks), which has the same base letters as SUSPENDED_WORDS' plain "معلق" but never matches it
// via a raw .includes() - the marks are their own Unicode codepoints sitting between the letters.
// Stripped before any word-list match so a diacritic-laden badge is recognized the same as a bare
// one, rather than silently falling through to "not a known status" (and, in extractPlanName's
// case, being mistaken for the plan's actual name instead of a badge to skip).
const ARABIC_DIACRITICS_PATTERN = /[ً-ٰٟ]/g;

function stripArabicDiacritics(text: string): string {
  return text.replace(ARABIC_DIACRITICS_PATTERN, "");
}

/** Raw page text ("Active"/"نشط"/...) normalized to one fixed value - never left as free text. */
export function normalizeServiceStatus(raw: string | undefined): NormalizedServiceStatus | undefined {
  if (!raw) return undefined;
  const lower = stripArabicDiacritics(raw).toLowerCase();
  if (CANCELED_WORDS.some((word) => lower.includes(word))) return "canceled";
  if (SUSPENDED_WORDS.some((word) => lower.includes(word))) return "suspended";
  if (STANDBY_WORDS.some((word) => lower.includes(word))) return "standby";
  if (ACTIVE_WORDS.some((word) => lower.includes(word))) return "active";
  return undefined;
}

function containsAny(line: string, needles: string[]): boolean {
  const lower = line.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
}

function stripLeadingSeparator(value: string): string {
  return value.replace(/^[\s:\u2014-]+/, "");
}

function isActionWord(line: string): boolean {
  const normalized = line.trim().toLowerCase();
  return ACTION_WORDS.some((word) => normalized === word.toLowerCase());
}

/** True when `line` is itself (the start of) some OTHER recognized field's label - a real
 * Starlink card can put a "النهاية ٢٠٢٦/٩/٢٨" line right after an unrelated field's bare label,
 * and that must never be mistaken for the first field's value. */
function startsWithAnyLabel(line: string): boolean {
  const lower = line.trim().toLowerCase();
  return ALL_LABELS.some((label) => lower.startsWith(label.toLowerCase()));
}

/**
 * A label on its own line uses the next non-empty line as its value (the common card/grid
 * layout, where label and value are separate elements); a label followed by ":"/"-" on the same
 * line uses whatever follows. When looking ahead, skips over action-button words (e.g.
 * "إدارة"/"Manage") and lines that are actually a different field's label, instead of blindly
 * grabbing the very next non-empty line.
 */
export function extractLabeledValue(lines: string[], labels: string[]): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    for (const label of labels) {
      const idx = lower.indexOf(label.toLowerCase());
      if (idx < 0) continue;
      const afterLabel = stripLeadingSeparator(line.slice(idx + label.length)).trim();
      if (afterLabel) return afterLabel;
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next) continue;
        if (isActionWord(next) || startsWithAnyLabel(next)) continue;
        return next;
      }
    }
  }
  return undefined;
}

/**
 * Same lookahead as extractLabeledValue, but for PLAN_LABELS specifically: the real "خطة الخدمة"
 * card places its "نشط"/standby status badge BEFORE the actual plan name text (see
 * extractPlanBadgeStatus above) - a real, confirmed miss where the plan name came back as the
 * bare word "نشط" instead of e.g. "التجوال - غير محدود". Skips over that badge line too, the same
 * way an action-button word is skipped, so it keeps looking for the real name instead of
 * returning the status word as if it were the plan.
 */
export function extractPlanName(lines: string[]): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    for (const label of PLAN_LABELS) {
      const idx = lower.indexOf(label.toLowerCase());
      if (idx < 0) continue;
      const afterLabel = stripLeadingSeparator(line.slice(idx + label.length)).trim();
      if (afterLabel && !normalizeServiceStatus(afterLabel)) return afterLabel;
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next) continue;
        if (isActionWord(next) || startsWithAnyLabel(next) || normalizeServiceStatus(next)) continue;
        return next;
      }
    }
  }
  return undefined;
}

/** Only ever looks near a balance-labeled line ("Outstanding Balance"/"الرصيد المستحق"/...) -
 * deliberately never scans the whole page, or an unrelated amount (e.g. the plan's price) could
 * be mistaken for the account's balance. Skips over a "ادفع"/"Pay" button that a real card can
 * place between the label and the amount (e.g. the Billing page), the same way
 * extractLabeledValue skips action words - but stops at the first non-money, non-action-word line
 * rather than scanning further, so an unrelated later amount is never picked up by mistake. */
export function extractBalance(lines: string[]): ParsedMoney | undefined {
  for (let i = 0; i < lines.length; i++) {
    if (!containsAny(lines[i], BALANCE_LABELS)) continue;
    const onLabelLine = parseMoney(lines[i]);
    if (onLabelLine) return onLabelLine;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim();
      if (!next) continue;
      if (isActionWord(next)) continue;
      return parseMoney(next) ?? undefined;
    }
  }
  return undefined;
}

/**
 * Normalizes a date-like value to "YYYY/MM/DD": converts Arabic-Indic digits to Western digits,
 * zero-pads the month/day (a real card can show "٢٠٢٦/٩/٢٨", which must become "2026/09/28", not
 * be left as "2026/9/28" or the raw Arabic digits), and pulls the date out of any surrounding
 * sentence text (the real Starlink app phrases some of these as "في ٢٠٢٦/٩/٢٨.", not a bare date -
 * the leading "في" and trailing "." must never end up stored as part of the date). Returns the
 * (digit-converted) input unchanged when no Y/M/D-shaped date is found anywhere in it.
 */
export function normalizeDateLike(raw: string): string {
  const western = toWesternDigits(raw).trim();
  const match = /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(western);
  if (!match) return western;
  const [, year, month, day] = match;
  return `${year}/${month.padStart(2, "0")}/${day.padStart(2, "0")}`;
}

const COMPLETE_DATE_PATTERN = /^\d{4}\/\d{2}\/\d{2}$/;

/**
 * True only for a complete, already-normalized "YYYY/MM/DD" - guards against a real page
 * splitting a date's year/month from its day across separate text nodes (e.g. the label match
 * captures "٢٠٢٦/٩" with the day on a following, unreached line): normalizeDateLike can't
 * complete a truncated value like that, so it comes back unchanged (e.g. "في 2026/9") instead of
 * a real date - and that must never be accepted as a renewal date. Downstream day-of-month
 * parsing (expiryDay) falls back to scanning for *any* short number in unrecognized text, which
 * would otherwise misread the bare "9" (the month) as if it were the day.
 */
export function isCompleteDate(value: string): boolean {
  return COMPLETE_DATE_PATTERN.test(value);
}

/** Label-based first; falls back to the "ACC-..." pattern anywhere on the page when unlabeled. */
export function extractAccountNumber(lines: string[], fullText: string): string | undefined {
  const labeled = extractLabeledValue(lines, ACCOUNT_NUMBER_LABELS);
  if (labeled) return labeled;
  const match = ACCOUNT_NUMBER_PATTERN.exec(fullText);
  return match ? match[0] : undefined;
}

/** The real Starlink subscription page shows this right under the "الاشتراك" section heading,
 * with no separate label at all - so, like accountNumber's ACC- fallback, this looks for the
 * distinctive "SL-..." shape anywhere on the page rather than a label:value pair. */
const SUBSCRIPTION_ID_PATTERN = /\bSL-[A-Za-z0-9-]{2,}\b/i;

export function extractSubscriptionId(fullText: string): string | undefined {
  const match = SUBSCRIPTION_ID_PATTERN.exec(fullText);
  return match ? match[0] : undefined;
}

/** Pulls just the number back out (e.g. "261" from "261 جيجابايت"/"261 GB") - the unit is always
 * gigabytes on the real page, so callers append it themselves rather than storing free text. */
export function extractDataUsageGb(lines: string[]): string | undefined {
  const raw = extractLabeledValue(lines, DATA_USAGE_LABELS);
  if (!raw) return undefined;
  const western = toWesternDigits(raw);
  const match = /([0-9]+(?:[.,][0-9]+)?)/.exec(western);
  return match ? match[1].replace(",", ".") : undefined;
}

/** The real Starlink home page shows "<holder name> • ACC-..." as one unlabeled line - only
 * matches when the text is immediately followed by a recognized account-number shape, so
 * arbitrary page text is never mistaken for a person's name. */
const NAME_BEFORE_ACCOUNT_PATTERN = /^(.+?)\s*[•·]\s*ACC-[A-Za-z0-9-]{2,}\b/;

export function extractAccountHolderName(lines: string[]): string | undefined {
  for (const line of lines) {
    const match = NAME_BEFORE_ACCOUNT_PATTERN.exec(line);
    if (match) {
      const name = match[1].trim();
      if (name) return name;
    }
  }
  return undefined;
}

const EMAIL_SHAPE_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only ever returns something that actually looks like an email - a mislabeled or misaligned
 * value (e.g. the phone number on the same Settings page, if a page layout ever put it right
 * after an email-looking label) is discarded rather than stored as a fabricated email. */
export function extractAccountEmail(lines: string[]): string | undefined {
  const raw = extractLabeledValue(lines, EMAIL_LABELS)?.trim();
  if (!raw) return undefined;
  return EMAIL_SHAPE_PATTERN.test(raw) ? raw : undefined;
}

const PHONE_SHAPE_PATTERN = /^\+?[\d\s-]+$/;

/** Only ever returns something that actually looks like a phone number - a mislabeled or
 * misaligned value (e.g. the email on the same Settings page) is discarded rather than stored as
 * a fabricated number. Requires at least 6 digits so a stray short value never passes. */
export function extractPhoneNumber(lines: string[]): string | undefined {
  const raw = extractLabeledValue(lines, PHONE_LABELS)?.trim();
  if (!raw) return undefined;
  if (!PHONE_SHAPE_PATTERN.test(raw)) return undefined;
  const digitCount = (raw.match(/\d/g) ?? []).length;
  return digitCount >= 6 ? raw : undefined;
}
