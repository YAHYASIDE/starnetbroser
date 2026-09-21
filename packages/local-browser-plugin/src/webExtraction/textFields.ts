import { parseMoney, ParsedMoney } from "./money";

/**
 * Bilingual label keyword lists - a best-effort first pass built from the field names this
 * feature was specified against, not verified against the real starlink.com page (nothing in
 * this development environment can load it). Each field's list is isolated here so tuning one
 * is a small, localized change.
 */
export const PLAN_LABELS = ["service plan", "plan", "الخطة", "باقة الخدمة", "الباقة"];

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

/**
 * A label on its own line uses the next non-empty line as its value (the common card/grid
 * layout, where label and value are separate elements); a label followed by ":"/"-" on the same
 * line uses whatever follows.
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
        if (next) return next;
      }
    }
  }
  return undefined;
}

/** Prefers a match on/near a balance-labeled line; falls back to a whole-text scan. */
export function extractBalance(lines: string[]): ParsedMoney | undefined {
  for (let i = 0; i < lines.length; i++) {
    if (!containsAny(lines[i], BALANCE_LABELS)) continue;
    for (let j = i; j < Math.min(i + 2, lines.length); j++) {
      const match = parseMoney(lines[j]);
      if (match) return match;
    }
  }
  for (const line of lines) {
    const match = parseMoney(line);
    if (match) return match;
  }
  return undefined;
}

/** Label-based first; falls back to the "ACC-..." pattern anywhere on the page when unlabeled. */
export function extractAccountNumber(lines: string[], fullText: string): string | undefined {
  const labeled = extractLabeledValue(lines, ACCOUNT_NUMBER_LABELS);
  if (labeled) return labeled;
  const match = ACCOUNT_NUMBER_PATTERN.exec(fullText);
  return match ? match[0] : undefined;
}
