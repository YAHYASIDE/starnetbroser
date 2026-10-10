/**
 * 🔍 «مطابقة الرصيد» (his Oct 10 2026 choice): he types the balance his app really shows, and the
 * difference with the app's balance is explained before anything is corrected - the movements that
 * would account for it on their own (or two together), a likely duplicate, an amount read before the
 * «MRU = 10 أوقية» rule, or a bank notification still waiting for his confirmation. Nothing changes
 * here; the remainder is recorded as a correction only when he confirms. Pure.
 */

import type { PlaceLedgerRow } from "./placeLedger";

export type MatchReason = "single" | "pair" | "duplicate" | "times10" | "pending";

export interface PendingNotice {
  id: string;
  /** + money in, − money out (in the place's currency). */
  signed: number;
  label: string;
  date: string;
}

export interface MatchCandidate {
  reason: MatchReason;
  /** The movements (or the waiting notification) behind it. */
  rows: PlaceLedgerRow[];
  pending?: PendingNotice;
  /** What to do, in his words. */
  hint: string;
}

const round = (n: number) => Math.round(n * 100) / 100;
/** Close enough: within 1 unit or 0.2 %. */
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.002);
const signed = (r: PlaceLedgerRow) => (r.direction === "in" ? r.amount : -r.amount);

/** + the app shows less than the real balance (something is missing), − it shows more. */
export function balanceDifference(shown: number, actual: number): number {
  return round(actual - shown);
}

/**
 * Candidates for `diff` (= real − shown) among the place's movements in one currency (newest last)
 * and its waiting bank notifications. At most `limit`, the surest first.
 */
export function explainDifference(rows: PlaceLedgerRow[], diff: number, pending: PendingNotice[] = [], options: { mru?: boolean; limit?: number } = {}): MatchCandidate[] {
  if (Math.abs(diff) < 0.005) return [];
  const recent = rows.slice(-200);
  const out: MatchCandidate[] = [];
  const seen = new Set<string>();
  const add = (c: MatchCandidate) => {
    const key = `${c.reason}:${c.pending?.id ?? c.rows.map((r) => r.id).sort().join("+")}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };

  // A waiting notification: the real account has it, the app doesn't yet.
  for (const p of pending) if (near(p.signed, diff)) add({ reason: "pending", rows: [], pending: p, hint: "عملية بنك لم تؤكّدها بعد - أكّدها من «عمليات البنوك»" });

  // Removing a movement of `s` changes the app's balance by −s: s = −diff fixes it.
  const target = -diff;
  for (const r of recent) if (near(signed(r), target)) add({ reason: "single", rows: [r], hint: "هذه الحركة وحدها تساوي الفرق - هل هي خطأ أو مكرّرة؟" });

  // Two the same (amount, day, kind): one may be a repeat.
  const groups = new Map<string, PlaceLedgerRow[]>();
  for (const r of recent) {
    const key = `${r.date}|${r.kindLabel}|${signed(r)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const g of groups.values()) if (g.length > 1 && near(signed(g[0]!) * (g.length - 1), target)) add({ reason: "duplicate", rows: g, hint: "حركات متطابقة في نفس اليوم - واحدة منها قد تكون مكرّرة" });

  // Two together.
  for (let i = 0; i < recent.length; i++)
    for (let j = i + 1; j < recent.length; j++) {
      if (out.filter((c) => c.reason === "pair").length >= 3) break;
      if (near(signed(recent[i]!) + signed(recent[j]!), target)) add({ reason: "pair", rows: [recent[i]!, recent[j]!], hint: "هاتان الحركتان معاً تساويان الفرق" });
    }

  // أوقية read 10× too small (before the rule) or 10× too big.
  if (options.mru)
    for (const r of recent) {
      const s = signed(r);
      if (near(s * 9, diff) || near(-s * 0.9, diff)) add({ reason: "times10", rows: [r], hint: near(s * 9, diff) ? "مبلغها أصغر 10 مرات (أوقية جديدة) - صحّحها ×10" : "مبلغها أكبر 10 مرات - صحّحها ÷10" });
    }

  // A movement already shown as part of a duplicate isn't listed again on its own.
  const inDuplicate = new Set(out.filter((c) => c.reason === "duplicate").flatMap((c) => c.rows.map((r) => r.id)));
  const kept = out.filter((c) => c.reason !== "single" || !inDuplicate.has(c.rows[0]!.id));
  const order: MatchReason[] = ["pending", "duplicate", "single", "times10", "pair"];
  return kept.sort((a, b) => order.indexOf(a.reason) - order.indexOf(b.reason)).slice(0, options.limit ?? 8);
}
