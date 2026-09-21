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
  "renewal date", "next billing", "renews on", "service end", "next due date",
  "تاريخ التجديد", "تجديد الاشتراك", "نهاية الخدمة", "موعد التجديد", "تاريخ الاستحقاق التالي", "النهاية",
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
];

/** Action-button words a card commonly places right under a label (e.g. "إدارة"/"Manage") -
 * never a field's actual value, so the forward-lookahead must skip over them. */
const ACTION_WORDS = [
  "manage", "edit", "change", "view", "details",
  "إدارة", "تعديل", "تغيير", "عرض", "التفاصيل",
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
 * be mistaken for the account's balance. */
export function extractBalance(lines: string[]): ParsedMoney | undefined {
  for (let i = 0; i < lines.length; i++) {
    if (!containsAny(lines[i], BALANCE_LABELS)) continue;
    for (let j = i; j < Math.min(i + 2, lines.length); j++) {
      const match = parseMoney(lines[j]);
      if (match) return match;
    }
  }
  return undefined;
}

/**
 * Normalizes a date-like value to "YYYY/MM/DD": converts Arabic-Indic digits to Western digits
 * and zero-pads the month/day (a real card can show "٢٠٢٦/٩/٢٨", which must become "2026/09/28",
 * not be left as "2026/9/28" or the raw Arabic digits). Returns the (digit-converted) input
 * unchanged when it doesn't match the expected Y/M/D shape.
 */
export function normalizeDateLike(raw: string): string {
  const western = toWesternDigits(raw).trim();
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(western);
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
