/**
 * 🔑 «الأكواد» (his Oct 22 2026 ask «أين تُحفظ أكواد التحقق؟ أريدها في التطبيق»): the codes the app read
 * from mailboxes (the phone keeps them 30 days - CodeLog.java), shown with their device, what they were
 * for and how long ago, searchable. Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { normalizeSearchText } from "./homeInsights";
import { deviceEmail } from "./mailboxes";

export interface StoredCode {
  at: number;
  accountId: string;
  kind: "starlink" | "mail" | "card";
  code: string;
}

export interface CodeRow {
  key: string;
  code: string;
  at: number;
  kindLabel: string;
  deviceName: string;
  email: string;
  /** «الآن» · «قبل 5 دقائق» · «قبل 3 ساعات» · «قبل يومين» … */
  ago: string;
  /** A Starlink / mail code stops working after a few minutes. */
  fresh: boolean;
}

export const CODE_KIND_LABELS: Record<StoredCode["kind"], string> = {
  starlink: "🛰️ دخول Starlink",
  mail: "📧 دخول البريد",
  card: "💳 دفع البطاقة",
};

/** Codes are usually valid ~10 minutes. */
export const FRESH_MS = 10 * 60 * 1000;

export function agoLabel(at: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return minutes === 1 ? "قبل دقيقة" : minutes === 2 ? "قبل دقيقتين" : `قبل ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "قبل ساعة" : hours === 2 ? "قبل ساعتين" : `قبل ${hours} ساعات`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "قبل يوم" : days === 2 ? "قبل يومين" : `قبل ${days} أيام`;
}

export function buildCodeRows(codes: StoredCode[], accounts: StarlinkAccountSummary[], query: string, now: number): CodeRow[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const q = normalizeSearchText(query);
  return [...codes]
    .sort((a, b) => b.at - a.at)
    .map((c, i) => {
      const account = c.accountId ? byId.get(c.accountId) : undefined;
      return {
        key: `${c.at}-${c.accountId}-${c.code}-${i}`,
        code: c.code,
        at: c.at,
        kindLabel: CODE_KIND_LABELS[c.kind] ?? c.kind,
        deviceName: account?.name || (c.kind === "card" ? "البطاقة" : c.accountId ? "جهاز محذوف" : "—"),
        email: account ? deviceEmail(account) : "",
        ago: agoLabel(c.at, now),
        fresh: now - c.at < FRESH_MS,
      };
    })
    .filter((row) => !q || normalizeSearchText(`${row.deviceName} ${row.email} ${row.code} ${row.kindLabel}`).includes(q));
}
