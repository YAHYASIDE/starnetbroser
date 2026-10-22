/**
 * 🤲 One sum a rep handed over = ONE line in his statement (his Oct 22 2026 ask «اجعل الدفعة سطرًا
 * واحدًا»): the app pays his customers' devices that still carry his debt first and puts the rest in
 * his account (repClientsSave.ts), which used to show as several lines - 50,000 فرانك (10,000 سيفا)
 * read as «2,619.63» and «7,380.37». The parts carry one `handoverId`; older ones (recorded before
 * that id existed) are recognised by being recorded together: same day, same currency, same note,
 * within a few seconds of each other. Pure.
 */
import type { RepStatementRow } from "./repStore";

/** Older parts of one sum were written within this time of each other. */
export const HANDOVER_GAP_MS = 10_000;

export type RepRowItem =
  | { kind: "row"; row: RepStatementRow }
  | {
      kind: "handover";
      key: string;
      /** Newest first, as the day shows them. */
      rows: RepStatementRow[];
      currency: string;
      total: number;
      /** What went to his customers' devices (each part) and what went into his account. */
      toDevices: { accountId: string; amount: number }[];
      toAccount: number;
      note?: string;
      /** 💱 «سعر البديل»: the sum went, at this rate, into his account of the other currency
       * (repSwap.ts - its «حُوّلت» records are parts of this line). */
      swap?: { toAmount: number; toCurrency: string; rate: number; toLedgerName?: string };
    };

/** A part of a handover: a payment he brought for a device, or the rest put in his account. */
function part(row: RepStatementRow): { id?: string; currency: string; amount: number; at: string; note: string } | null {
  if (row.type === "customer" && row.op.byRep && row.op.amount < 0) {
    return { id: row.op.handoverId, currency: row.op.currency, amount: -row.op.amount, at: row.createdAt, note: (row.op.note ?? "").trim() };
  }
  if (row.type === "settlement" && row.settlement.kind === "cashHandover") {
    return { id: row.settlement.handoverId, currency: row.settlement.currencyCode, amount: row.settlement.amount, at: row.createdAt, note: (row.settlement.note ?? "").trim() };
  }
  return null;
}

/** One day's rows (newest first) with each handed-over sum folded into one item. */
export function groupHandovers(rows: RepStatementRow[]): RepRowItem[] {
  const groupOf = new Map<RepStatementRow, string>();
  const members = new Map<string, RepStatementRow[]>();
  const add = (key: string, row: RepStatementRow) => {
    groupOf.set(row, key);
    members.set(key, [...(members.get(key) ?? []), row]);
  };
  // 1. The parts that carry their id (with a swap's «💱 حُوّلت» records, which carry it too).
  for (const row of rows) {
    const id = part(row)?.id ?? (row.type === "settlement" ? row.settlement.handoverId : undefined);
    if (id) add(`id:${id}`, row);
  }
  // 2. Older parts: chained by time (oldest first), same currency and note.
  const loose = rows
    .map((row) => ({ row, p: part(row) }))
    .filter((x): x is { row: RepStatementRow; p: NonNullable<ReturnType<typeof part>> } => x.p !== null && !x.p.id)
    .sort((a, b) => (a.p.at < b.p.at ? -1 : a.p.at > b.p.at ? 1 : 0));
  let current: { key: string; currency: string; note: string; last: number } | null = null;
  for (const { row, p } of loose) {
    const t = Date.parse(p.at);
    if (current && current.currency === p.currency && current.note === p.note && Number.isFinite(t) && t - current.last <= HANDOVER_GAP_MS) {
      add(current.key, row);
      current.last = t;
    } else {
      current = { key: `at:${p.at}:${row.id}`, currency: p.currency, note: p.note, last: Number.isFinite(t) ? t : -Infinity };
      add(current.key, row);
    }
  }
  // A "group" of one part is just that row. A group needs a device part AND/OR several parts.
  const out: RepRowItem[] = [];
  const placed = new Set<string>();
  for (const row of rows) {
    const key = groupOf.get(row);
    const group = key ? members.get(key) ?? [] : [];
    if (!key || group.length < 2) {
      out.push({ kind: "row", row });
      continue;
    }
    if (placed.has(key)) continue;
    placed.add(key);
    const ordered = rows.filter((r) => groupOf.get(r) === key);
    const parts = ordered.flatMap((r) => {
      const p = part(r);
      return p ? [{ r, p }] : [];
    });
    if (parts.length === 0) {
      for (const r of ordered) out.push({ kind: "row", row: r });
      continue;
    }
    const swap = ordered.map((r) => (r.type === "settlement" ? r.settlement.swap : undefined)).find(Boolean);
    const toDevices = parts.filter(({ r }) => r.type === "customer").map(({ r, p }) => ({ accountId: r.type === "customer" ? r.op.accountId : "", amount: p.amount }));
    const toAccount = parts.filter(({ r }) => r.type === "settlement").reduce((s, { p }) => s + p.amount, 0);
    const total = parts.reduce((s, { p }) => s + p.amount, 0);
    const note = parts.find(({ p }) => p.note)?.p.note;
    out.push({
      kind: "handover",
      key,
      rows: ordered,
      currency: parts[0].p.currency,
      total: Math.round(total * 100) / 100,
      toDevices,
      toAccount: Math.round(toAccount * 100) / 100,
      ...(note ? { note } : {}),
      ...(swap ? { swap } : {}),
    });
  }
  return out;
}
