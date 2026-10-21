/**
 * 🖥️ The Windows app's home (his Oct 21 2026 brief): a few main figures, «المتابعة» - what has stopped, what
 * stops tonight or tomorrow, what needs him - and a real month calendar of renewal days. Pure.
 */
import type { StarlinkAccountSummary } from "@starnet/shared";
import { daysRemainingNumber } from "./date";
import { isFaulty } from "./deviceFault";
import { needsTravelRegistration } from "./travelRegistration";
import { renewalOf } from "./deskTable";

/** The week as it is read here: Saturday first. */
export const WEEKDAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

/** JS getDay() (0 = Sunday) → the column in WEEKDAYS. */
export function weekdayColumn(jsDay: number): number {
  return (jsDay + 1) % 7;
}

/** The month as weeks of 7 cells (null = a day of the month before/after). */
export function monthWeeks(year: number, month0: number): (number | null)[][] {
  const first = weekdayColumn(new Date(year, month0, 1).getDay());
  const days = new Date(year, month0 + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export type ActionReason = "signedOut" | "travel" | "renewalMismatch" | "restricted";

export const ACTION_LABELS: Record<ActionReason, string> = {
  signedOut: "خرج من حساب Starlink",
  travel: "يحتاج توثيق السفر",
  renewalMismatch: "يوم تجديد مختلف للمراجعة",
  restricted: "الخدمة مقيّدة",
};

export interface FollowUp<T> {
  /** Stopped (the renewal date has come) - the most recent first. */
  expired: T[];
  /** Tonight is the last night. */
  tonight: T[];
  /** Stops tomorrow night. */
  tomorrow: T[];
  /** Something for him to do, whatever the date. */
  action: { account: T; reasons: ActionReason[] }[];
}

/** Faulty devices (burned, secondary email) are left out, as on the phone's «تحتاج إلى متابعة». */
export function followUp<T extends StarlinkAccountSummary>(accounts: T[], signedOut: Set<string> = new Set()): FollowUp<T> {
  const out: FollowUp<T> = { expired: [], tonight: [], tomorrow: [], action: [] };
  const expired: { a: T; days: number }[] = [];
  for (const a of accounts) {
    if (isFaulty(a)) continue;
    const date = renewalOf(a);
    const days = date ? daysRemainingNumber(date) : null;
    if (days !== null && days <= 0) expired.push({ a, days });
    else if (days === 1) out.tonight.push(a);
    else if (days === 2) out.tomorrow.push(a);
    const reasons: ActionReason[] = [];
    if (signedOut.has(a.id)) reasons.push("signedOut");
    if (needsTravelRegistration(a)) reasons.push("travel");
    if (a.renewalDayMismatch) reasons.push("renewalMismatch");
    if (a.isRestricted) reasons.push("restricted");
    if (reasons.length) out.action.push({ account: a, reasons });
  }
  out.expired = expired.sort((x, y) => y.days - x.days).map((e) => e.a);
  return out;
}
