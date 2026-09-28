/**
 * 📈 توقعات التجديد - what the coming weeks should bring in: every active device whose renewal
 * date falls in the window, with its monthly price (renewalPlan), summed per currency (never
 * converted) and split by week. Devices without a monthly price are counted separately so the
 * forecast never silently under-reports. Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";

export interface ForecastDevice {
  id: string;
  name: string;
  clientId?: string;
  /** yyyy-mm-dd */
  date: string;
  /** Days from today (0 = today). */
  days: number;
  sale?: { amount: number; currency: string };
  cost?: { amount: number; currency: string };
}

export interface ForecastWeek {
  /** 0 = the next 7 days. */
  index: number;
  from: string;
  to: string;
  count: number;
  sale: Record<string, number>;
}

export interface RenewalForecast {
  devices: ForecastDevice[];
  weeks: ForecastWeek[];
  sale: Record<string, number>;
  cost: Record<string, number>;
  /** Devices in the window with no monthly price. */
  missingPrice: number;
}

function dayStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "2026/09/20", "2026-09-20" -> local midnight, or null. */
export function parseRenewalDate(value: string | undefined): Date | null {
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(value?.trim() ?? "");
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function add(target: Record<string, number>, code: string, amount: number) {
  target[code] = (target[code] ?? 0) + amount;
}

export function computeRenewalForecast(accounts: StarlinkAccountSummary[], today: Date, horizonDays = 30): RenewalForecast {
  const start = dayStart(today);
  const weeksCount = Math.ceil(horizonDays / 7);
  const weeks: ForecastWeek[] = Array.from({ length: weeksCount }, (_, index) => {
    const from = new Date(start);
    from.setDate(from.getDate() + index * 7);
    const to = new Date(start);
    to.setDate(to.getDate() + Math.min(index * 7 + 6, horizonDays - 1));
    return { index, from: isoDay(from), to: isoDay(to), count: 0, sale: {} };
  });
  const forecast: RenewalForecast = { devices: [], weeks, sale: {}, cost: {}, missingPrice: 0 };
  for (const account of accounts) {
    if (account.deletedAt || account.archivedAt || account.deviceFault) continue;
    const date = parseRenewalDate(account.rechargeDate || account.standbyDate);
    if (!date) continue;
    const days = Math.round((date.getTime() - start.getTime()) / 86_400_000);
    if (days < 0 || days >= horizonDays) continue;
    const plan = account.renewalPlan;
    const device: ForecastDevice = { id: account.id, name: account.name, clientId: account.clientId, date: isoDay(date), days };
    const week = weeks[Math.floor(days / 7)]!;
    week.count += 1;
    if (plan && plan.saleAmount > 0) {
      device.sale = { amount: plan.saleAmount, currency: plan.saleCurrency };
      add(forecast.sale, plan.saleCurrency, plan.saleAmount);
      add(week.sale, plan.saleCurrency, plan.saleAmount);
      if (plan.costAmount > 0) {
        device.cost = { amount: plan.costAmount, currency: plan.costCurrency };
        add(forecast.cost, plan.costCurrency, plan.costAmount);
      }
    } else {
      forecast.missingPrice += 1;
    }
    forecast.devices.push(device);
  }
  forecast.devices.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
  return forecast;
}
