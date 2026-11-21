/**
 * 🔄 The WhatsApp agent reads a customer's device again from Starlink before answering (his Nov 21 2026 choice: «يمكنه
 * أن يشغّل مزامنة الجهاز»). Only when the customer asks about his device, only that customer's own devices, only when
 * what the app holds is older than REFRESH_STALE_MS, and once per device per REFRESH_GAP_MS - a customer can't keep
 * the phone busy. The read goes through the background sync (BackgroundSyncService); the agent waits for its result at
 * most REFRESH_WAIT_MS and answers from it - the home screen still merges and keeps it as usual. Pure parts here,
 * tested in agentRefresh.test.ts; lib/whatsappAgentLink.ts runs it.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { PendingSyncLike } from "./starlinkSync";

export const REFRESH_STALE_MS = 6 * 60 * 60 * 1000;
export const REFRESH_GAP_MS = 6 * 60 * 60 * 1000;
export const REFRESH_WAIT_MS = 75_000;
/** At most this many devices read for one message. */
export const REFRESH_MAX_DEVICES = 2;

const DEVICE_WORDS = [
  "جهاز", "جهازي", "اشتراك", "ينتهي", "متى", "تجديد", "جدد", "حالة", "يعمل", "مقطوع", "معطل", "انترنت", "الانترنت", "ستارلينك",
  "starlink", "abonnement", "internet", "kit", "appareil", "expire", "marche", "coupé",
];

function fold(s: string): string {
  return s.toLowerCase().replace(/[إأآ]/g, "ا").replace(/ى/g, "ي");
}

/** A message about the customer's device (its state, renewal, internet) - worth a fresh read. */
export function asksAboutDevice(text: string): boolean {
  const t = fold(text);
  return DEVICE_WORDS.some((w) => t.includes(fold(w)));
}

/** The customer's devices to read again now: the oldest reads first, never one read or asked for recently. */
export function devicesToRefresh(devices: StarlinkAccountSummary[], askedAt: Record<string, number>, now: number): StarlinkAccountSummary[] {
  const readAt = (d: StarlinkAccountSummary) => (d.lastSuccessfulScanAt ? Date.parse(d.lastSuccessfulScanAt) || 0 : 0);
  return devices
    .filter((d) => now - readAt(d) >= REFRESH_STALE_MS && now - (askedAt[d.id] ?? 0) >= REFRESH_GAP_MS)
    .sort((a, b) => readAt(a) - readAt(b))
    .slice(0, REFRESH_MAX_DEVICES);
}

/** The results of this read: those devices' pending syncs that weren't there before it started. */
export function newResults<T extends PendingSyncLike>(pending: T[], ids: string[], before: ReadonlySet<string>): T[] {
  return pending.filter((s) => ids.includes(s.accountId) && !before.has(s.syncId));
}

/** Every device asked for got a result. */
export function allRead(results: PendingSyncLike[], ids: string[]): boolean {
  return ids.every((id) => results.some((s) => s.accountId === id));
}

// ---- 💰 «استهلاك تقديري» (his Nov 21 2026 ask «كيف أعرف الرصيد الذي ينقص») ----

/** $ per million tokens (Anthropic's price list, Nov 2026) - the estimate only; the real balance is in platform.claude.com. */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

export function costOf(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model];
  return p ? (inputTokens * p.input + outputTokens * p.output) / 1_000_000 : 0;
}

export interface AgentSpend {
  day: string;
  dayCost: number;
  month: string;
  monthCost: number;
  /** Answers counted this month. */
  monthCalls: number;
}

export const NO_SPEND: AgentSpend = { day: "", dayCost: 0, month: "", monthCost: 0, monthCalls: 0 };

/** One more call on `date` (yyyy-mm-dd, local). A new day / month starts from zero. */
export function addSpend(prev: AgentSpend, date: string, cost: number): AgentSpend {
  const month = date.slice(0, 7);
  const sameDay = prev.day === date;
  const sameMonth = prev.month === month;
  return {
    day: date,
    dayCost: (sameDay ? prev.dayCost : 0) + cost,
    month,
    monthCost: (sameMonth ? prev.monthCost : 0) + cost,
    monthCalls: (sameMonth ? prev.monthCalls : 0) + 1,
  };
}

/** «$0.003» / «أقل من سنت». */
export function spendWords(cost: number): string {
  if (cost <= 0) return "$0";
  if (cost < 0.01) return "أقل من سنت";
  return `$${cost.toFixed(cost < 1 ? 3 : 2)}`;
}

/** What the agent section shows (today / this month), for `date`. */
export function spendLine(spend: AgentSpend, date: string): string {
  const today = spend.day === date ? spend.dayCost : 0;
  const month = spend.month === date.slice(0, 7) ? spend.monthCost : 0;
  const calls = spend.month === date.slice(0, 7) ? spend.monthCalls : 0;
  return `💰 استهلاك تقديري: اليوم ${spendWords(today)} · هذا الشهر ${spendWords(month)} (${calls} رد)`;
}
