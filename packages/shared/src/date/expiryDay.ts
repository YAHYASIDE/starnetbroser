/**
 * Extracts the day-of-month (1..31) an account expires/renews on, from any
 * of the formats Starlink or an operator might enter:
 *  - a bare day number: "28"
 *  - an ISO-ish date: "2026/10/13" (year-month-day)
 *  - a Starlink-style date: "10/13/2026" (month-day-year)
 *  - a written date: "October 13, 2026" or "13 أكتوبر 2026"
 *
 * Pure function, zero dependencies - used identically by the API (to sort/
 * group accounts server-side) and the web app (to re-derive the group for
 * an optimistic UI update before the API round-trip completes).
 */

const ENGLISH_MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "ابريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "اغسطس", "سبتمبر", "أكتوبر", "اكتوبر", "نوفمبر", "ديسمبر",
];

export function expiryDay(value: string): number | null {
  const text = value.trim();
  if (!text) return null;

  // 2026/10/13 or 2026-10-13 (year first) - day is the 3rd group.
  let m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (m) {
    const day = parseInt(m[3], 10);
    if (day >= 1 && day <= 31) return day;
  }

  // 10/13/2026 (Starlink's usual month/day/year) or day/month/year -
  // whichever of the first two groups can't be a valid month (>12) is the day.
  m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/);
  if (m) {
    const first = parseInt(m[1], 10);
    const second = parseInt(m[2], 10);
    let day: number;
    if (first > 12) day = first;
    else if (second > 12) day = second;
    else day = second; // MM/DD/YYYY, Starlink's usual format
    if (day >= 1 && day <= 31) return day;
  }

  // "October 13, 2026" / "Oct 13 2026"
  m = text.match(new RegExp(`\\b(${ENGLISH_MONTHS.join("|")})[a-z]*\\.?\\s+(\\d{1,2})\\b`, "i"));
  if (m) {
    const day = parseInt(m[2], 10);
    if (day >= 1 && day <= 31) return day;
  }

  // "13 أكتوبر 2026"
  m = text.match(new RegExp(`(\\d{1,2})\\s+(${ARABIC_MONTHS.join("|")})`));
  if (m) {
    const day = parseInt(m[1], 10);
    if (day >= 1 && day <= 31) return day;
  }

  // Bare day number, or last resort: last 1-31 number found anywhere in the text.
  m = text.match(/^(\d{1,2})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    if (day >= 1 && day <= 31) return day;
  }

  const all = [...text.matchAll(/\b([12]?\d|3[01])\b/g)]
    .map((x) => parseInt(x[1], 10))
    .filter((d) => d >= 1 && d <= 31);
  if (all.length) return all[all.length - 1];

  return null;
}
