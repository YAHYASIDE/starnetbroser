/**
 * 📥 «استيراد زبائن»: many customers at once, each with an opening balance in أوقية (his Oct 2026
 * request - a list exported from «مدونة الحسابات»). The file is JSON prepared for him
 * ({ kind: "starnet-clients-import", rows }) or plain lines «2026-09-30 له 1,234,500 الاسم»
 * (the same lines that app's PDF export holds).
 *
 * His choices: a name that looks like an existing customer is SKIPPED automatically; each balance
 * is an opening balance (money didn't move) dated with the file's own date; every amount is أوقية.
 * The last import is remembered so «↩️ تراجع عن الاستيراد» can take it back.
 */

import type { Client, ClientStore } from "./clientStore";
import { createClient } from "./clientStore";
import type { InvoiceList } from "./invoiceStore";
import type { PartyAdjustmentDirection, PartyAdjustmentList } from "./partyBalanceStore";
import { recordPartyAdjustment } from "./partyBalanceStore";

export const IMPORT_FILE_KIND = "starnet-clients-import";
export const IMPORT_CURRENCY = "MRU";
export const IMPORT_NOTE = "رصيد افتتاحي (استيراد)";

export interface ImportRow {
  name: string;
  /** «عليه» = he owes us (owesUs); «له» = we owe him (weOwe). */
  direction: PartyAdjustmentDirection;
  amount: number;
  /** yyyy-mm-dd */
  date: string;
}

export type ParseResult = { ok: true; rows: ImportRow[] } | { ok: false; message: string };

const LINE = /^(\d{4}-\d{2}-\d{2})\s+(له|عليه)\s+([\d,٬.]+)\s+(.+)$/;

function directionOf(word: string): PartyAdjustmentDirection | null {
  if (word === "عليه" || word === "owesUs") return "owesUs";
  if (word === "له" || word === "weOwe") return "weOwe";
  return null;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  return Number(value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[,٬\s]/g, ""));
}

function validRow(name: unknown, dir: unknown, amount: unknown, date: unknown): ImportRow | null {
  const n = typeof name === "string" ? name.normalize("NFKC").replace(/\s+/g, " ").trim() : "";
  const d = typeof dir === "string" ? directionOf(dir.normalize("NFKC").trim()) : null;
  const a = toNumber(amount);
  const day = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) ? date.trim() : null;
  if (!n || !d || !Number.isFinite(a) || a <= 0 || !day) return null;
  return { name: n, direction: d, amount: Math.round(a * 100) / 100, date: day };
}

/** Reads the prepared JSON file or plain «date له/عليه amount name» lines. */
export function parseClientImport(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, message: "الملف فارغ" };
  if (trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed) as { kind?: unknown; rows?: unknown };
      if (data.kind !== IMPORT_FILE_KIND || !Array.isArray(data.rows)) return { ok: false, message: "هذا ليس ملف استيراد زبائن" };
      const rows: ImportRow[] = [];
      for (const r of data.rows as Record<string, unknown>[]) {
        const row = validRow(r?.name, r?.direction, r?.amount, r?.date);
        if (row) rows.push(row);
      }
      return rows.length ? { ok: true, rows } : { ok: false, message: "لا يوجد زبائن صالحون في الملف" };
    } catch {
      return { ok: false, message: "تعذرت قراءة الملف" };
    }
  }
  const rows: ImportRow[] = [];
  for (const raw of trimmed.normalize("NFKC").split(/\r?\n/)) {
    const m = LINE.exec(raw.trim());
    if (!m) continue;
    const row = validRow(m[4], m[2], m[3], m[1]);
    if (row) rows.push(row);
  }
  return rows.length ? { ok: true, rows } : { ok: false, message: "لا يوجد زبائن في الملف (السطر: التاريخ ثم له/عليه ثم المبلغ ثم الاسم)" };
}

// ---- matching an existing customer ----

/** Letters folded (أ/إ/آ→ا، ى→ي، ة→ه) and the joining words («ولد»، «بن»، «بنت») dropped. */
export function nameTokens(name: string): string[] {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t && !["ولد", "بن", "بنت", "ول"].includes(t));
}

/** The existing customer a name refers to: the same name once folded, or - for names of two words
 * or more - one name's words all inside the other's («سالم ولد الأمين» = «سالم الأمين»). */
export function findExistingClient(name: string, clients: Client[]): Client | undefined {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return undefined;
  const key = tokens.join(" ");
  const exact = clients.find((c) => nameTokens(c.name).join(" ") === key);
  if (exact) return exact;
  if (tokens.length < 2) return undefined;
  return clients.find((c) => {
    const other = nameTokens(c.name);
    if (other.length < 2) return false;
    const [small, big] = other.length <= tokens.length ? [other, new Set(tokens)] : [tokens, new Set(other)];
    return small.every((t) => big.has(t));
  });
}

export interface ImportPlan {
  toAdd: ImportRow[];
  skipped: Array<{ row: ImportRow; existing: Client }>;
}

/** Which rows become new customers and which are skipped as already there. */
export function planClientImport(rows: ImportRow[], clients: Client[]): ImportPlan {
  const plan: ImportPlan = { toAdd: [], skipped: [] };
  for (const row of rows) {
    const existing = findExistingClient(row.name, clients);
    if (existing) plan.skipped.push({ row, existing });
    else plan.toAdd.push(row);
  }
  return plan;
}

export function planTotals(rows: ImportRow[]): { owesUs: number; weOwe: number } {
  let owesUs = 0;
  let weOwe = 0;
  for (const r of rows) {
    if (r.direction === "owesUs") owesUs += r.amount;
    else weOwe += r.amount;
  }
  return { owesUs, weOwe };
}

/** The last import, for «↩️ تراجع». */
export interface ImportBatch {
  at: string;
  clientIds: string[];
  adjustmentIds: string[];
}

export function applyClientImport(
  store: ClientStore,
  adjustments: PartyAdjustmentList,
  rows: ImportRow[],
  now = new Date(),
): { store: ClientStore; adjustments: PartyAdjustmentList; batch: ImportBatch } {
  let nextStore = store;
  let nextAdjustments = adjustments;
  const batch: ImportBatch = { at: now.toISOString(), clientIds: [], adjustmentIds: [] };
  for (const row of rows) {
    const made = createClient(nextStore, { name: row.name });
    nextStore = made.store;
    batch.clientIds.push(made.client.id);
    const recorded = recordPartyAdjustment(nextAdjustments, {
      partyKind: "client",
      partyId: made.client.id,
      direction: row.direction,
      amount: row.amount,
      currencyCode: IMPORT_CURRENCY,
      date: row.date,
      note: IMPORT_NOTE,
    });
    if (recorded.ok) {
      nextAdjustments = recorded.list;
      batch.adjustmentIds.push(recorded.adjustment.id);
    }
  }
  return { store: nextStore, adjustments: nextAdjustments, batch };
}

/** Takes the import back: its opening balances, and each imported customer that has nothing else
 * since (no other balance entry, no device, no invoice) - one used meanwhile stays. */
export function undoClientImport(
  store: ClientStore,
  adjustments: PartyAdjustmentList,
  batch: ImportBatch,
  devices: { clientId?: string }[],
  invoices: InvoiceList,
): { store: ClientStore; adjustments: PartyAdjustmentList; kept: number } {
  const batchAdj = new Set(batch.adjustmentIds);
  const nextAdjustments = adjustments.filter((a) => !batchAdj.has(a.id));
  const nextStore: ClientStore = { ...store };
  let kept = 0;
  for (const id of batch.clientIds) {
    if (!nextStore[id]) continue;
    const used =
      nextAdjustments.some((a) => a.partyKind === "client" && a.partyId === id) ||
      devices.some((d) => d.clientId === id) ||
      invoices.some((inv) => inv.clientId === id);
    if (used) kept += 1;
    else delete nextStore[id];
  }
  return { store: nextStore, adjustments: nextAdjustments, kept };
}

const BATCH_KEY = "starnet_client_import_v1";

export function loadImportBatch(): ImportBatch | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BATCH_KEY);
    const parsed = raw ? (JSON.parse(raw) as ImportBatch) : null;
    return parsed && Array.isArray(parsed.clientIds) && Array.isArray(parsed.adjustmentIds) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveImportBatch(batch: ImportBatch | null): void {
  if (typeof window === "undefined") return;
  if (batch) window.localStorage.setItem(BATCH_KEY, JSON.stringify(batch));
  else window.localStorage.removeItem(BATCH_KEY);
}
