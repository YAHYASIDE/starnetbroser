/**
 * 📅 The reports page's one period bar (his Oct 22 2026 ask): «يوم / أسبوع / شهر», ‹ › to step back
 * and forward, 📅 to jump to a day - fixed on top and shared by every tab. His choice «آخر 7 / 30 يومًا»:
 * a week is the 7 days ending on the chosen day, a month the 30 days ending on it; ‹ moves the whole
 * window back by its own length (يوم → أمس، أسبوع → the 7 days before). Never after today. Pure.
 */

import { addDays } from "./financeDashboard";
import type { SeriesPoint } from "./reportsView";

export type RangeSpan = "day" | "week" | "month";

export const RANGE_SPANS: { span: RangeSpan; label: string }[] = [
  { span: "day", label: "يوم" },
  { span: "week", label: "أسبوع" },
  { span: "month", label: "شهر" },
];

export const SPAN_DAYS: Record<RangeSpan, number> = { day: 1, week: 7, month: 30 };

/** What the bar holds: the window's length and its last day (yyyy-mm-dd). */
export interface ReportRange {
  span: RangeSpan;
  end: string;
}

export interface DayWindow {
  from: string;
  to: string;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function rangeWindow(range: ReportRange): DayWindow {
  return { from: addDays(range.end, 1 - SPAN_DAYS[range.span]), to: range.end };
}

/** The same length just before it (for «مقارنة بالفترة السابقة»). */
export function previousWindow(range: ReportRange): DayWindow {
  return rangeWindow({ ...range, end: addDays(range.end, -SPAN_DAYS[range.span]) });
}

/** ‹ (-1) / › (+1): the whole window back or forward, never past today. */
export function shiftRange(range: ReportRange, direction: -1 | 1, today: string): ReportRange {
  const end = addDays(range.end, direction * SPAN_DAYS[range.span]);
  return { ...range, end: end > today ? today : end };
}

export function canGoForward(range: ReportRange, today: string): boolean {
  return range.end < today;
}

/** 📅 A chosen day: that day alone (a later one is today). */
export function rangeForDay(day: string, today: string): ReportRange {
  if (!DAY_RE.test(day)) return { span: "day", end: today };
  return { span: "day", end: day > today ? today : day };
}

export function inWindow(date: string | undefined, window: DayWindow): boolean {
  const day = (date ?? "").slice(0, 10).replace(/\//g, "-");
  return DAY_RE.test(day) && day >= window.from && day <= window.to;
}

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function dayParts(day: string): { y: number; m: number; d: number } {
  return { y: Number(day.slice(0, 4)), m: Number(day.slice(5, 7)), d: Number(day.slice(8, 10)) };
}

function dayName(day: string, withYear: boolean): string {
  const { y, m, d } = dayParts(day);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`;
}

/** «اليوم» · «أمس» · «الأربعاء 15 أكتوبر» · «16 - 22 أكتوبر» · «23 سبتمبر - 22 أكتوبر» (+ the year when not this one). */
export function rangeLabel(range: ReportRange, today: string): string {
  const { from, to } = rangeWindow(range);
  const thisYear = today.slice(0, 4);
  if (range.span === "day") {
    if (to === today) return "اليوم";
    if (to === addDays(today, -1)) return "أمس";
    const { y, m, d } = dayParts(to);
    return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${dayName(to, to.slice(0, 4) !== thisYear)}`;
  }
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const showYear = !sameYear || to.slice(0, 4) !== thisYear;
  const end = dayName(to, showYear);
  const start = from.slice(0, 7) === to.slice(0, 7) ? String(dayParts(from).d) : dayName(from, !sameYear);
  return `${start} - ${end}`;
}

/** Dated values summed day by day over the window (oldest first, empty days included). */
export function windowSeries(items: { date: string; value: number }[], window: DayWindow): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  const index = new Map<string, SeriesPoint>();
  for (let day = window.from, guard = 0; day <= window.to && guard < 400; day = addDays(day, 1), guard++) {
    const point = { key: day, label: String(dayParts(day).d), value: 0 };
    points.push(point);
    index.set(day, point);
  }
  for (const item of items) {
    const point = index.get(item.date.slice(0, 10));
    if (point) point.value += item.value;
  }
  return points;
}
