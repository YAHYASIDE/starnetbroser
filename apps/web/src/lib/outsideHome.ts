/**
 * 🌍 Devices outside their home country (his Oct 21 2026 ask): Starlink's subscription page says
 * «Your Starlink is outside its home country … Days remaining: 9. Travel allowance: 30» - when the days
 * run out the service is restricted, unless he moves the device to global roaming first. This lists
 * them day by day, the soonest first, so he switches each one in time. The day it runs out is derived
 * from the read (`readAt` + the days left), never stored.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";

const DAY = 86_400_000;

function localDateOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / DAY);
}

function dateOfDay(n: number): string {
  return new Date(n * DAY).toISOString().slice(0, 10);
}

/** The day (yyyy-mm-dd) its travel allowance runs out, or null when it isn't outside. */
export function outsideHomeEnd(account: StarlinkAccountSummary): string | null {
  const o = account.outsideHome;
  if (!o || !Number.isFinite(o.daysRemaining)) return null;
  return dateOfDay(dayNumber(localDateOf(o.readAt)) + o.daysRemaining);
}

/** Days left from `today` (0 = runs out today, negative = already over), or null. */
export function outsideHomeDaysLeft(account: StarlinkAccountSummary, today: string): number | null {
  const end = outsideHomeEnd(account);
  return end ? dayNumber(end) - dayNumber(today) : null;
}

export function isOutsideHome(account: StarlinkAccountSummary): boolean {
  return !account.deletedAt && !account.archivedAt && outsideHomeEnd(account) !== null;
}

export interface OutsideHomeDay {
  /** yyyy-mm-dd; the first group of an already-over device is the oldest such day. */
  date: string;
  daysLeft: number;
  accounts: StarlinkAccountSummary[];
}

/**
 * Every day from today to the last one a device runs out, in order - each with the devices whose days
 * end that day (an empty day stays, so the days read one after another, his wording «الأيام
 * متتالية»). Devices already over come first, in one group.
 */
export function outsideHomeSchedule(accounts: StarlinkAccountSummary[], today: string): OutsideHomeDay[] {
  const outside = accounts.filter(isOutsideHome);
  if (outside.length === 0) return [];
  const todayN = dayNumber(today);
  const byDay = new Map<number, StarlinkAccountSummary[]>();
  for (const a of outside) {
    const n = Math.max(dayNumber(outsideHomeEnd(a)!), todayN - 1);
    byDay.set(n, [...(byDay.get(n) ?? []), a]);
  }
  const last = Math.max(...byDay.keys());
  const days: OutsideHomeDay[] = [];
  const over = byDay.get(todayN - 1);
  if (over) days.push({ date: dateOfDay(todayN - 1), daysLeft: -1, accounts: over });
  for (let n = todayN; n <= last; n++) days.push({ date: dateOfDay(n), daysLeft: n - todayN, accounts: byDay.get(n) ?? [] });
  return days;
}

/** «اليوم» / «غدًا» / «بعد 9 أيام» / «انتهت أيامه». */
export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft < 0) return "انتهت أيامه - يُقيَّد الآن";
  if (daysLeft === 0) return "يتوقف اليوم";
  if (daysLeft === 1) return "يتوقف غدًا";
  if (daysLeft === 2) return "بعد يومين";
  if (daysLeft <= 10) return `بعد ${daysLeft} أيام`;
  return `بعد ${daysLeft} يومًا`;
}
