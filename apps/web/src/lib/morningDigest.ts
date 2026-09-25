/**
 * التنبيه الصباحي: a local notification each morning summarising what needs attention that day -
 * devices expiring today/tomorrow, already expired, and money owed. Notification content is fixed
 * when scheduled (Android shows it even with the app closed), so the next several mornings are
 * precomputed from the renewal dates and rescheduled every time the app opens.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { formatAmount } from "./formatAmount";
import { LEDGER_CURRENCY_LABELS, LedgerCurrency } from "./ledgerStore";

export const DIGEST_DAYS = 7;
/** Notification ids 7100..7106 belong to the morning digest - rescheduling cancels exactly these. */
export const DIGEST_ID_BASE = 7100;

export interface DigestNotification {
  id: number;
  at: Date;
  title: string;
  body: string;
}

function dayDiff(dateStr: string, day: Date): number | null {
  if (!dateStr.trim()) return null;
  const parsed = new Date(dateStr.replace(/\//g, "-"));
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  const base = new Date(day);
  base.setHours(0, 0, 0, 0);
  return Math.round((parsed.getTime() - base.getTime()) / 86_400_000);
}

export interface DigestInput {
  accounts: StarlinkAccountSummary[];
  /** What customers owe right now, per currency (positive amounts only). */
  owedByCurrency: Record<string, number>;
  now: Date;
  hour: number;
}

/** The next DIGEST_DAYS mornings at `hour`:00 (starting today if that time hasn't passed yet),
 * each only when there's something to say. */
export function buildMorningDigests({ accounts, owedByCurrency, now, hour }: DigestInput): DigestNotification[] {
  const active = accounts.filter((a) => !a.archivedAt && !a.deletedAt);
  const owedParts = Object.entries(owedByCurrency)
    .filter(([, v]) => v > 0.0001)
    .map(([code, v]) => `${formatAmount(v)} ${LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code}`);
  const first = new Date(now);
  first.setHours(hour, 0, 0, 0);
  if (first.getTime() <= now.getTime()) first.setDate(first.getDate() + 1);

  const result: DigestNotification[] = [];
  for (let i = 0; i < DIGEST_DAYS; i += 1) {
    const at = new Date(first);
    at.setDate(first.getDate() + i);
    let today = 0;
    let tomorrow = 0;
    let expired = 0;
    for (const account of active) {
      const d = dayDiff(account.rechargeDate || account.standbyDate || "", at);
      if (d === null) continue;
      if (d === 0) today += 1;
      else if (d === 1) tomorrow += 1;
      else if (d < 0) expired += 1;
    }
    const lines: string[] = [];
    if (today > 0) lines.push(`${today} جهاز ينتهي اليوم`);
    if (tomorrow > 0) lines.push(`${tomorrow} جهاز ينتهي غدًا`);
    if (expired > 0) lines.push(`${expired} جهاز منتهي`);
    if (owedParts.length > 0) lines.push(`ديون مستحقة: ${owedParts.join(" + ")}`);
    if (lines.length === 0) continue;
    result.push({
      id: DIGEST_ID_BASE + i,
      at,
      title: today > 0 ? `☀️ صباح الخير - ${today} تجديد اليوم` : "☀️ ملخص الصباح - STAR NET",
      body: lines.join(" · "),
    });
  }
  return result;
}
