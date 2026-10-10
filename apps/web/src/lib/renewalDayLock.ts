/**
 * 📌 A device's renewal day never moves (his Oct 2026 rule: «ينتهي يوم 10 … شهر 11 يوم 10 ولا يتحرك
 * عن 10 إلا عندما ينقل الجهاز من دولة إلى دولة»). Once he locks the day, a sync may still move the
 * month (10/10 → 11/10) but a read on another day is never written: it is kept aside as a warning
 * with «اقبل اليوم الجديد» (the device moved country) / «تجاهل». Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";

/** The day of a "2026/10/10" / "2026-10-10" date (1-28 only - Starlink never bills later), or null. */
export function renewalDayOf(date: string | undefined | null): number | null {
  const match = /^\d{4}[/-]\d{1,2}[/-](\d{1,2})/.exec(date?.trim() ?? "");
  const day = match ? Number(match[1]) : NaN;
  return Number.isInteger(day) && day >= 1 && day <= 28 ? day : null;
}

export type RenewalReadDecision =
  /** No lock, or the read day is the locked one: take the date (clears an old warning). */
  | { kind: "accept" }
  /** Locked and the read is on another day: keep the saved date, warn. */
  | { kind: "mismatch"; day: number }
  /** The same other-day read he already chose to ignore: keep the date, no warning. */
  | { kind: "ignored" };

export function decideRenewalRead(account: Pick<StarlinkAccountSummary, "lockedRenewalDay" | "renewalDayIgnored">, readDate: string): RenewalReadDecision {
  const locked = account.lockedRenewalDay;
  const day = renewalDayOf(readDate);
  if (!locked || day === null || day === locked) return { kind: "accept" };
  if (account.renewalDayIgnored === readDate.trim()) return { kind: "ignored" };
  return { kind: "mismatch", day };
}

/** Locks `day` (default: the day of its current date). Null when there is no valid day to lock. */
export function lockRenewalDay(account: StarlinkAccountSummary, day?: number): Partial<StarlinkAccountSummary> | null {
  const value = day ?? renewalDayOf(account.rechargeDate);
  if (!value || value < 1 || value > 28) return null;
  const patch: Partial<StarlinkAccountSummary> = { lockedRenewalDay: value, renewalDayMismatch: null, renewalDayIgnored: null };
  // Another day (or a 29-31 misread / old placeholder) moves the saved date onto the locked day -
  // the nearest such date (2026/10/30 locked on 3 → 2026/11/03, never back to 10/03).
  const current = renewalDayOf(account.rechargeDate);
  if (current !== value) {
    const moved = nearestWithDay(account.rechargeDate, value);
    if (moved) patch.rechargeDate = moved;
  }
  return patch;
}

export function unlockRenewalDay(): Partial<StarlinkAccountSummary> {
  return { lockedRenewalDay: null, renewalDayMismatch: null, renewalDayIgnored: null };
}

/** «اقبل اليوم الجديد»: the device moved country - the read date and its day become the lock. */
export function acceptRenewalMismatch(account: StarlinkAccountSummary): Partial<StarlinkAccountSummary> | null {
  const m = account.renewalDayMismatch;
  if (!m) return null;
  return { rechargeDate: m.date, lockedRenewalDay: m.day, renewalDayMismatch: null, renewalDayIgnored: null };
}

/** «تجاهل»: keep the locked date; this same read won't warn again. */
export function ignoreRenewalMismatch(account: StarlinkAccountSummary): Partial<StarlinkAccountSummary> | null {
  const m = account.renewalDayMismatch;
  if (!m) return null;
  return { renewalDayMismatch: null, renewalDayIgnored: m.date };
}

/** «ثبّت كل الأجهزة»: every live device with a valid date and no lock yet, at its current day. */
export function lockAllRenewalDays(accounts: StarlinkAccountSummary[]): { accounts: StarlinkAccountSummary[]; locked: number } {
  let locked = 0;
  const next = accounts.map((account) => {
    if (account.deletedAt || account.archivedAt || account.lockedRenewalDay) return account;
    const patch = lockRenewalDay(account);
    if (!patch) return account;
    locked += 1;
    return { ...account, ...patch };
  });
  return { accounts: next, locked };
}

/** The date with day `day` nearest to `date` (this month, the one before or after), same format. */
function nearestWithDay(date: string, day: number): string | null {
  const match = /^(\d{4})([/-])(\d{1,2})\2(\d{1,2})/.exec(date.trim());
  if (!match) return null;
  const sep = match[2]!;
  const year = Number(match[1]);
  const month = Number(match[3]) - 1;
  const from = Date.UTC(year, month, Number(match[4]));
  let best: Date | null = null;
  for (const offset of [-1, 0, 1]) {
    const candidate = new Date(Date.UTC(year, month + offset, day));
    if (!best || Math.abs(candidate.getTime() - from) < Math.abs(best.getTime() - from)) best = candidate;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${best!.getUTCFullYear()}${sep}${pad(best!.getUTCMonth() + 1)}${sep}${pad(best!.getUTCDate())}`;
}
