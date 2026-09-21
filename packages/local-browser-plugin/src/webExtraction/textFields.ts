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
  "تاريخ التجديد", "تجديد الاشتراك", "نهاية الخدمة", "موعد التجديد", "تاريخ الاستحقاق التالي", "النهاية",
  // The real Starlink app's home-page banner for a standby account ("From the confirmed pause to
  // resume by") phrases this as a sentence, not a "label: value" pair - e.g. "من المقرر أن تنتهي
  // خدمتك في ٢٠٢٦/٩/٢٨." - so the label match only needs this fragment; normalizeDateLike below
  // pulls the date out of whatever surrounds it ("في ..." / a trailing ".").
  "تنتهي خدمتك",
];

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

/** The account's registered login email, from the Settings page - deliberately never the phone
 * number on that same page (a separate, unrelated contact number - never the operator's WhatsApp
 * number, and never read at all). */
export const EMAIL_LABELS = ["email", "e-mail", "البريد الإلكتروني", "الإيميل"];

/** Every recognized label, across every field - used to recognize "this line is a DIFFERENT
 * field's label, not this field's value" during the forward-lookahead in extractLabeledValue. */
const ALL_LABELS = [
  ...PLAN_LABELS,
  ...RENEWAL_DATE_LABELS,
  ...SERVICE_STATUS_LABELS,
  ...STARLINK_ID_LABELS,
  ...ACCOUNT_NUMBER_LABELS,
  ...SERIAL_NUMBER_LABELS,
  ...KIT_NUMBER_LABELS,
  ...BALANCE_LABELS,
  ...DATA_USAGE_LABELS,
  ...EMAIL_LABELS,
];

/** Action-button words a card commonly places right under/beside a label (e.g. "إدارة"/"Manage",
 * "ادفع"/"Pay" next to a balance) - never a field's actual value, so the forward-lookahead must
 * skip over them. */
const ACTION_WORDS = [
  "manage", "edit", "change", "view", "details", "pay",
  "إدارة", "تعديل", "تغيير", "عرض", "التفاصيل", "ادفع",
];

const ACTIVE_WORDS = ["active", "نشط"];
const STANDBY_WORDS = ["standby", "في الانتظار", "وضع الانتظار"];
const CANCELED_WORDS = ["canceled", "cancelled", "ملغى", "ملغي"];
const SUSPENDED_WORDS = ["suspended", "موقوف", "معلق"];

export type NormalizedServiceStatus = "active" | "standby" | "canceled" | "suspended";

/** Raw page text ("Active"/"نشط"/...) normalized to one fixed value - never left as free text. */
export function normalizeServiceStatus(raw: string | undefined): NormalizedServiceStatus | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
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
