/**
 * 📅 The period «حسابي»'s top card is for (his Oct 10 2026 request «عدّل تواريخ الفوق لكي يكون هناك
 * اليوم، أمس وتحديد تاريخ»): «اليوم», «أمس», one day he picks, or a month. Every figure of the card
 * (business «الصافي», transfers' profit, income, spending) is taken over from..to. Pure.
 */

import { monthLabel } from "./monthClosing";

export interface MoneyPeriod {
  kind: "day" | "month";
  /** yyyy-mm-dd, both included. */
  from: string;
  to: string;
  /** «اليوم» / «أمس» / «2026-10-03» / «أكتوبر 2026». */
  label: string;
  /** Said after «يبقى لك …»: «اليوم», «أمس», «يوم 2026-10-03», «في أكتوبر 2026». */
  phrase: string;
}

function shiftDay(day: string, by: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

const lastDayOf = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

export function dayPeriod(day: string, today: string): MoneyPeriod {
  const label = day === today ? "اليوم" : day === shiftDay(today, -1) ? "أمس" : day;
  return { kind: "day", from: day, to: day, label, phrase: label === day ? `يوم ${day}` : label };
}

export function monthPeriod(month: string): MoneyPeriod {
  return { kind: "month", from: `${month}-01`, to: lastDayOf(month), label: monthLabel(month), phrase: `في ${monthLabel(month)}` };
}

/** The chips: اليوم, أمس, then this month and the 4 before it. */
export function periodChoices(today: string): MoneyPeriod[] {
  const months: string[] = [];
  const [y, m] = today.split("-").map(Number) as [number, number];
  for (let i = 0; i < 5; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 15));
    months.push(d.toISOString().slice(0, 7));
  }
  return [dayPeriod(today, today), dayPeriod(shiftDay(today, -1), today), ...months.map(monthPeriod)];
}

export const samePeriod = (a: MoneyPeriod, b: MoneyPeriod) => a.from === b.from && a.to === b.to;

export const inPeriod = (date: string, p: Pick<MoneyPeriod, "from" | "to">) => date >= p.from && date <= p.to;
