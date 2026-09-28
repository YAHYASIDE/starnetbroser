/**
 * 🤝 وعد دفع from a rep through the bot: "وعد 5000 محمد الخميس" - who promised, how much and
 * when. Promises are follow-up records (never money), so the app records them straight away and
 * tells the operator. The day can be a date (03/10, 3-10), "يوم 30", اليوم / غداً / بعد غد,
 * "بعد 3 أيام", or a weekday (the next one); without one, a week from today. Pure.
 */

import { parseRepPayment } from "./repRequests";

const WEEKDAYS: Record<string, number> = {
  "الاحد": 0,
  "احد": 0,
  "الاثنين": 1,
  "الإثنين": 1,
  "اثنين": 1,
  "الثلاثاء": 2,
  "ثلاثاء": 2,
  "الاربعاء": 3,
  "الأربعاء": 3,
  "اربعاء": 3,
  "الخميس": 4,
  "خميس": 4,
  "الجمعة": 5,
  "الجمعه": 5,
  "جمعة": 5,
  "السبت": 6,
  "سبت": 6,
};

const DEFAULT_DAYS = 7;

function fold(word: string): string {
  return word.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[ًٌٍَُِّْ]/g, "");
}

const FOLDED_WEEKDAYS: Record<string, number> = Object.fromEntries(Object.entries(WEEKDAYS).map(([k, v]) => [fold(k), v]));

function iso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function plusDays(today: Date, days: number): Date {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

/** A day of month (and month): this year, or next year if that date has passed. */
function dayMonth(today: Date, day: number, month?: number): Date | null {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (month === undefined) {
    if (day < 1 || day > 31) return null;
    const d = new Date(base.getFullYear(), base.getMonth(), day);
    if (d.getDate() !== day) return null;
    if (d < base) d.setMonth(d.getMonth() + 1);
    return d;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(base.getFullYear(), month - 1, day);
  if (d.getDate() !== day) return null;
  if (d < base) d.setFullYear(d.getFullYear() + 1);
  return d;
}

export interface ParsedPromise {
  amount: number;
  currency: string;
  /** Words naming the customer / device. */
  query: string;
  /** yyyy-mm-dd */
  dueDate: string;
  /** No day was given - a week from today was assumed. */
  defaulted: boolean;
}

export function parseRepPromise(rest: string, today: Date): ParsedPromise | null {
  const payment = parseRepPayment(rest);
  if (!payment) return null;
  const words = payment.query.split(/\s+/).filter(Boolean);
  const keep: string[] = [];
  let due: Date | null = null;
  for (let i = 0; i < words.length; i++) {
    const raw = words[i]!;
    const w = fold(raw);
    const next = words[i + 1];
    if (due) {
      keep.push(raw);
      continue;
    }
    const dm = /^(\d{1,2})[/\-.](\d{1,2})$/.exec(raw);
    if (dm) {
      due = dayMonth(today, Number(dm[1]), Number(dm[2]));
      if (due) continue;
    }
    if ((w === "يوم" || w === "في") && next && /^\d{1,2}$/.test(next)) {
      due = dayMonth(today, Number(next));
      if (due) {
        i += 1;
        continue;
      }
    }
    if (w === "اليوم") {
      due = plusDays(today, 0);
      continue;
    }
    if (w === "غدا" || w === "غد" || w === "بكره" || w === "بكرا") {
      due = plusDays(today, 1);
      continue;
    }
    if (w === "بعد" && next && fold(next) === "غد") {
      due = plusDays(today, 2);
      i += 1;
      continue;
    }
    if (w === "بعد" && next && /^\d{1,2}$/.test(next)) {
      due = plusDays(today, Number(next));
      i += 1;
      if (words[i + 1] && /^(ايام|يوم|يومين)$/.test(fold(words[i + 1]!))) i += 1;
      continue;
    }
    if (w === "بعد" && next && fold(next) === "يومين") {
      due = plusDays(today, 2);
      i += 1;
      continue;
    }
    if (w === "بعد" && next && /^(اسبوع|اسبوعين)$/.test(fold(next))) {
      due = plusDays(today, fold(next) === "اسبوع" ? 7 : 14);
      i += 1;
      continue;
    }
    const weekday = FOLDED_WEEKDAYS[w];
    if (weekday !== undefined) {
      const ahead = ((weekday - today.getDay() + 7) % 7) || 7;
      due = plusDays(today, ahead);
      continue;
    }
    if (w === "يوم" && next && FOLDED_WEEKDAYS[fold(next)] !== undefined) continue; // "يوم الخميس"
    keep.push(raw);
  }
  return {
    amount: payment.amount,
    currency: payment.currency,
    query: keep.join(" "),
    dueDate: iso(due ?? plusDays(today, DEFAULT_DAYS)),
    defaulted: !due,
  };
}

export const REP_PROMISE_HINT = [
  "🤝 لتسجيل وعد زبون بالدفع اكتب:",
  "وعد المبلغ اسم الزبون واليوم",
  "مثال: وعد 5000 محمد الخميس",
  "أو: وعد 20 دولار سالم 05/10 - أو غداً / بعد 3 أيام",
].join("\n");

export const REP_PROMISE_RECEIVED = "✅ وصل الوعد - يُسجَّل عند المسؤول ويُذكَّر به يوم موعده.";
