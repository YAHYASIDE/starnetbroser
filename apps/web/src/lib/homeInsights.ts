/**
 * Home page "اليوم" dashboard and global search - pure functions over the local stores, so the
 * home screen can answer "what happened today" and "where is X" without opening each page.
 */

import type { CashEntryList } from "./cashStore";
import type { LedgerByAccount } from "./ledgerStore";

export interface TodaySummary {
  /** Device payments received today ("credit" entries dated today), per currency. */
  collected: Record<string, number>;
  /** New device charges today ("debit" entries dated today), per currency. */
  charged: Record<string, number>;
  cashIn: Record<string, number>;
  cashOut: Record<string, number>;
  /** How many ledger operations were recorded today, across every device. */
  operations: number;
}

function add(target: Record<string, number>, code: string, amount: number) {
  target[code] = (target[code] ?? 0) + amount;
}

export function computeTodaySummary(ledgerStore: LedgerByAccount, cash: CashEntryList, today: string): TodaySummary {
  const summary: TodaySummary = { collected: {}, charged: {}, cashIn: {}, cashOut: {}, operations: 0 };
  for (const entries of Object.values(ledgerStore)) {
    for (const entry of entries) {
      if (entry.date !== today) continue;
      summary.operations += 1;
      add(entry.kind === "credit" ? summary.collected : summary.charged, entry.currency, entry.amount);
    }
  }
  for (const entry of cash) {
    if (entry.date !== today) continue;
    add(entry.kind === "in" ? summary.cashIn : summary.cashOut, entry.currencyCode, entry.amount);
  }
  return summary;
}

/** One line behind a "📅 اليوم" tile: what each tile's total is made of. */
export interface TodayLine {
  id: string;
  /** The device for a ledger line; absent for a cash line. */
  accountId?: string;
  amount: number;
  currency: string;
  /** Cash: category or note. Ledger: the entry's note. */
  label: string;
  /** Shipments only: its Starlink cost is still unpaid (D). */
  pendingD?: boolean;
  kind: "in" | "out";
}

export interface TodayLines {
  collected: TodayLine[];
  charged: TodayLine[];
  cash: TodayLine[];
}

/** The operations behind computeTodaySummary's totals, biggest first. */
export function listTodayLines(ledgerStore: LedgerByAccount, cash: CashEntryList, today: string): TodayLines {
  const lines: TodayLines = { collected: [], charged: [], cash: [] };
  for (const [accountId, entries] of Object.entries(ledgerStore)) {
    for (const entry of entries) {
      if (entry.date !== today) continue;
      const line: TodayLine = { id: entry.id, accountId, amount: entry.amount, currency: entry.currency, label: entry.note ?? "", kind: entry.kind === "credit" ? "in" : "out" };
      if (entry.kind === "credit") lines.collected.push(line);
      else lines.charged.push({ ...line, pendingD: entry.starlinkCost?.status === "pending" && (entry.starlinkCost.amount ?? 0) > 0 });
    }
  }
  for (const entry of cash) {
    if (entry.date !== today) continue;
    lines.cash.push({ id: entry.id, amount: entry.amount, currency: entry.currencyCode, label: entry.category?.trim() || entry.note?.trim() || "", kind: entry.kind === "in" ? "in" : "out" });
  }
  const bigFirst = (a: TodayLine, b: TodayLine) => b.amount - a.amount;
  lines.collected.sort(bigFirst);
  lines.charged.sort(bigFirst);
  lines.cash.sort((a, b) => (a.kind === b.kind ? b.amount - a.amount : a.kind === "in" ? -1 : 1));
  return lines;
}

export type SearchResultKind = "client" | "supplier" | "representative" | "item";

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  title: string;
  subtitle?: string;
}

export interface SearchSources {
  clients: { id: string; name: string; phone?: string }[];
  suppliers: { id: string; name: string; phone?: string }[];
  representatives: { id: string; name: string; phone?: string }[];
  items: { id: string; name: string; code?: string }[];
}

/** Normalises for a forgiving match: lower-case, Arabic alef/ya/ta-marbuta variants folded,
 * digits-only phone comparison (so "222 12" finds "22212..."). */
export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

/** A forgiving match of `query` in any of the fields (also used by the reports search). */
export function matches(query: string, ...fields: (string | undefined)[]): boolean {
  const q = normalizeSearchText(query);
  if (!q) return false;
  const digits = q.replace(/\D/g, "");
  return fields.some((field) => {
    if (!field) return false;
    if (normalizeSearchText(field).includes(q)) return true;
    return digits.length >= 3 && digits === q.replace(/\s/g, "") && field.replace(/\D/g, "").includes(digits);
  });
}

/** Everything other than devices that matches the query - devices are already filtered in place
 * on the home list. At most `limit` results per kind. */
export function searchEverything(query: string, sources: SearchSources, limit = 5): SearchResult[] {
  if (!normalizeSearchText(query)) return [];
  const results: SearchResult[] = [];
  const push = (kind: SearchResultKind, list: SearchResult[]) => results.push(...list.slice(0, limit).map((r) => ({ ...r, kind })));
  push(
    "client",
    sources.clients.filter((c) => matches(query, c.name, c.phone)).map((c) => ({ kind: "client", id: c.id, title: c.name, subtitle: c.phone })),
  );
  push(
    "supplier",
    sources.suppliers.filter((s) => matches(query, s.name, s.phone)).map((s) => ({ kind: "supplier", id: s.id, title: s.name, subtitle: s.phone })),
  );
  push(
    "representative",
    sources.representatives
      .filter((r) => matches(query, r.name, r.phone))
      .map((r) => ({ kind: "representative", id: r.id, title: r.name, subtitle: r.phone })),
  );
  push(
    "item",
    sources.items.filter((i) => matches(query, i.name, i.code)).map((i) => ({ kind: "item", id: i.id, title: i.name, subtitle: i.code })),
  );
  return results;
}

/** Letters and digits only, lower-case - "KIT-3040 12" and "kit304012" compare equal. */
function compactId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Whether a device matches the home search - by its own name, email, or any of its Starlink
 * identifiers (KIT, serial, subscription SL-..., account ACC-...; spaces and dashes ignored), or
 * by the name or phone of the client it's linked to. */
export function deviceMatchesQuery(
  query: string,
  device: {
    name: string;
    kitNumber: string;
    serialNumber: string;
    expectedEmail?: string;
    starlinkAccountEmail?: string;
    starlinkId?: string;
    accountNumber?: string;
    subscriptionId?: string;
  },
  client?: { name: string; phone?: string },
): boolean {
  const ids = [device.kitNumber, device.serialNumber, device.starlinkId, device.accountNumber, device.subscriptionId];
  if (matches(query, device.name, ...ids, device.expectedEmail, device.starlinkAccountEmail, client?.name, client?.phone)) return true;
  const q = compactId(query);
  return q.length >= 4 && ids.some((id) => id !== undefined && compactId(id).includes(q));
}
