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
    .replace(/[\u064B-\u0652\u0640]/g, "") // diacritics and «ـ»
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, " ")
    .trim();
}

/** One word of the query in one field: inside it, or (digits only) inside its digits. */
function wordIn(word: string, field: string, fieldDigits: string): boolean {
  if (field.includes(word)) return true;
  return word.length >= 3 && /^\d+$/.test(word) && fieldDigits.includes(word);
}

/**
 * A forgiving match of `query` in any of the fields (also used by the reports search): the whole
 * query inside one field, or - his Oct 18 2026 ask, «يبحث في أي مقطع من الاسم» - every word of it
 * somewhere, in any order («سالم أحمد» finds «أحمد ولد سالم»).
 */
export function matches(query: string, ...fields: (string | undefined)[]): boolean {
  const q = normalizeSearchText(query);
  if (!q) return false;
  const texts = fields.filter((f): f is string => Boolean(f)).map((f) => ({ text: normalizeSearchText(f), digits: f.replace(/\D/g, "") }));
  const digits = q.replace(/\D/g, "");
  const whole = texts.some((t) => t.text.includes(q) || (digits.length >= 3 && digits === q.replace(/\s/g, "") && t.digits.includes(digits)));
  if (whole) return true;
  const words = q.split(" ");
  return words.length > 1 && words.every((w) => texts.some((t) => wordIn(w, t.text, t.digits)));
}

/** How far apart two words are (letters added, dropped, changed or swapped). Stops counting past `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1);
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length]!;
}

/** The typos one word may carry: none under 4 letters, 1 up to 6, 2 from 7. */
function allowedTypos(word: string): number {
  return word.length < 4 ? 0 : word.length < 7 ? 1 : 2;
}

/**
 * 🔤 «يكتشف الأخطاء» (his Oct 18 2026 ask): every word of the query close to a word of a field -
 * «مخمد» finds «محمد», «salehstarlnk» finds «salehstarlink@…» - or to its start, for a word still
 * being typed. Only used when nothing matches exactly; numbers (KIT, phone) are never guessed.
 */
export function fuzzyMatches(query: string, ...fields: (string | undefined)[]): boolean {
  const words = normalizeSearchText(query).split(" ").filter(Boolean);
  if (words.length === 0 || words.some((w) => /\d/.test(w) && !/[^\d]/.test(w))) return false;
  const fieldWords = fields
    .filter((f): f is string => Boolean(f))
    .flatMap((f) => normalizeSearchText(f).split(/[\s@._\-+,/()]+/))
    .filter(Boolean);
  // The first letter must be right: a guess from the second letter on («سلام» is «سالم», never «الأمل»).
  const close = (w: string, fw: string, max: number) =>
    fw[0] === w[0] && (editDistance(w, fw, max) <= max || (fw.length > w.length && editDistance(w, fw.slice(0, w.length), max) <= max));
  return words.every((w) => {
    const max = allowedTypos(w);
    return fieldWords.some((fw) => fw.includes(w) || (max > 0 && close(w, fw, max)));
  });
}

/**
 * ✉️ What the search really looks for (his Oct 18 2026 ask): a pasted line holding an email
 * («salehstarlink@outlook.com يحتاج كذا») searches the email alone - the rest is dropped.
 */
export function searchTermOf(raw: string): string {
  const email = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
  return email && email.length < raw.trim().length ? email.toLowerCase() : raw;
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
  fuzzy = false,
): boolean {
  const ids = [device.kitNumber, device.serialNumber, device.starlinkId, device.accountNumber, device.subscriptionId];
  const fields = [device.name, ...ids, device.expectedEmail, device.starlinkAccountEmail, client?.name, client?.phone];
  if (fuzzy) return fuzzyMatches(query, ...fields);
  if (matches(query, ...fields)) return true;
  const q = compactId(query);
  return q.length >= 4 && ids.some((id) => id !== undefined && compactId(id).includes(q));
}
