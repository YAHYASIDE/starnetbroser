/**
 * 📄 «كشف حساب مندوب» - what the rep owes, as a printable document: built on the reps page («📄 إرسال
 * الكشف») and by «📄 كشف بعد كل عملية» (RepAutoStatementRunner, his Oct 29 2026 ask «كل عملية تُضاف للمندوب أن
 * يُرسل له هذا الكشف بآخر 10 عمليات»). Pure: stores in, document out.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import { formatAmount } from "./formatAmount";
import type { InvoiceList } from "./invoiceStore";
import { LEDGER_CURRENCY_LABELS, type LedgerByAccount, type LedgerCurrency, type LedgerEntry } from "./ledgerStore";
import type { PrintableDocument } from "./pdfDocument";
import {
  bookAfterRepReset,
  buildRepPeriodStatement,
  keepCurrency,
  ledgerAfterRepReset,
  repRowAccount,
  repRowDelta,
  repRowKey,
  repRowSplit,
  splitRepRecords,
  type RepConvert,
  type RepPeriodStatement,
} from "./repAccount";
import { replayRepClients, repOperations, type RepBookEntry } from "./repClients";
import { customerOpLabel, SETTLEMENT_LABELS } from "./repRowText";
import { buildRepDailyStatement, listRepDeviceCommissions, type Representative, type RepSettlementList, type RepStatementRow } from "./repStore";
import { getStoreItem, type StoreItemRegistry } from "./storeStore";

const EPSILON = 0.0001;

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

export function nonZero(values: Record<string, number>): [string, number][] {
  return Object.entries(values).filter(([, v]) => Math.abs(v) > EPSILON);
}

/** His running balance in words: "له" = we owe him, "عليه" = he owes us. */
export function balanceParts(values: Record<string, number>): { text: string; tone: "due" | "clear" | "zero" }[] {
  const parts = nonZero(values).map(([code, v]) => ({
    text: `${v > 0 ? "له" : "عليه"} ${formatAmount(Math.abs(v))} ${currencyLabel(code)}`,
    tone: (v > 0 ? "due" : "clear") as "due" | "clear",
  }));
  return parts.length > 0 ? parts : [{ text: "صفر - الحساب متوازن", tone: "zero" }];
}

export function balanceText(values: Record<string, number>): string {
  return balanceParts(values)
    .map((p) => p.text)
    .join(" · ");
}

/** 📒 The balance a statement row shows: the one of his two accounts it moves (repRowSplit). */
export function rowBalance(statement: RepPeriodStatement, row: RepStatementRow, native?: RepPeriodStatement): { label: string; values: Record<string, number> } {
  const account = repRowAccount(row);
  // «ما عليه» in each record's own currency when given (his Oct 22 2026 choice «كل عملة وحدها»).
  const source = account === "debt" && native ? native : statement;
  return { label: account === "debt" ? "ما عليه" : "ربحه", values: source[account].after[repRowKey(row)] ?? {} };
}

export interface Fx {
  convert: RepConvert;
  /** A USD figure (profit/share) in the display currencies, at the shipment's locked rates. */
  usd: (usd: number, entry?: LedgerEntry) => string;
  /** Converted values joined, e.g. "1,000 أوقية · 15,000 سيفا". */
  list: (values: Record<string, number>) => string;
  /** One amount in its own currency, converted. */
  amount: (amount: number, code: string, locked?: Record<string, number>) => string;
}

export function makeFx(convert: RepConvert): Fx {
  const list = (values: Record<string, number>) => {
    const parts = Object.entries(values).map(([c, v]) => `${v < -EPSILON ? "-" : ""}${formatAmount(Math.abs(v))} ${currencyLabel(c)}`);
    return parts.length > 0 ? parts.join(" · ") : "0";
  };
  return {
    convert,
    usd: (usd, entry) => list(convert(usd, "USD", entry?.profitCurrencyRates)),
    list,
    amount: (amount, code, locked) => list(convert(amount, code, locked)),
  };
}

export function repRowCells(
  row: RepStatementRow,
  after: { label: string; values: Record<string, number> } | undefined,
  accountName: (accountId: string) => string,
  clientNameFor: (accountId: string) => string | undefined,
  storeItems: StoreItemRegistry,
  fx: Fx,
): string[] {
  const delta = nonZero(repRowDelta(row, fx.convert))
    .map(([code, v]) => `${v > 0 ? "+" : "-"}${formatAmount(Math.abs(v))} ${currencyLabel(code)}`)
    .join(" / ");
  const balance = after ? `${after.label}: ${balanceText(after.values)}` : "";
  if (row.type === "device") {
    const { entry, profit, percent, repShareUsd, accountId } = row.row;
    const client = clientNameFor(accountId);
    const title = `📡 ${accountName(accountId)}${client ? ` · ${client}` : ""} (${formatAmount(entry.amount)} ${currencyLabel(entry.currency)})`;
    if (profit.status !== "computed") {
      const expected = row.row.expectedRepShareUsd;
      return [row.date, title, `⏳ D - حصته المتوقعة ${expected !== undefined ? fx.usd(expected) : ""} (${percent}%)`, delta, balance];
    }
    return [row.date, title, `ربح ${fx.usd(profit.profitUsd ?? 0, entry)} · حصته ${fx.usd(repShareUsd ?? 0, entry)} (${percent}%)`, delta, balance];
  }
  if (row.type === "customer") {
    const { op } = row;
    const client = clientNameFor(op.accountId);
    return [row.date, `${customerOpLabel(op)} · ${accountName(op.accountId)}${client ? ` · ${client}` : ""}`, `${formatAmount(Math.abs(op.amount))} ${currencyLabel(op.currency)}${op.note ? ` · ${op.note}` : ""}`, delta, balance];
  }
  if (row.type === "invoice") {
    const { invoice, commissionAmount } = row.row;
    const names = invoice.lines.map((l) => getStoreItem(storeItems, l.itemId)?.name).filter(Boolean).join("، ");
    const paid = invoice.paidAmount > 0 ? ` · قبض ${formatAmount(invoice.paidAmount)}` : "";
    return [row.date, `🧾 فاتورة متجر${names ? ` · ${names}` : ""}`, `عمولته ${formatAmount(commissionAmount)} ${currencyLabel(invoice.currencyCode)}${paid}`, delta, balance];
  }
  const s = row.settlement;
  return [row.date, s.expenseId ? "📉 نصيبه من مصروف" : SETTLEMENT_LABELS[s.kind], s.note ?? "", delta, balance];
}

/** «20,500 سيفا» - an amount (or several currencies) without its sign. */
function plainList(values: Record<string, number>): string {
  const parts = nonZero(values).map(([code, v]) => `${formatAmount(Math.abs(v))} ${currencyLabel(code)}`);
  return parts.length ? parts.join(" / ") : "0";
}

/** «عليه» red / «له» green, from the first currency that isn't zero. */
function toneOf(values: Record<string, number>): "due" | "clear" | undefined {
  const v = nonZero(values)[0]?.[1];
  return v === undefined ? undefined : v < 0 ? "due" : "clear";
}

/** The note an operation carries, for «التفاصيل». */
function rowNote(row: RepStatementRow): string {
  if (row.type === "customer") return row.op.note ?? "";
  if (row.type === "settlement") return row.settlement.note ?? "";
  return "";
}

/** «2026-10-29 15:53» - the day, and the time it was recorded when that's the same day. */
function dateTime(row: RepStatementRow): string {
  const at = new Date(row.createdAt);
  if (Number.isNaN(at.getTime())) return row.date;
  const local = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  return local === row.date ? `${row.date} ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}` : row.date;
}

/**
 * 📡 «كشف حساب مندوب» = what he owes only (his Oct 19 2026 ask: «كشف الحساب يضيف فقط الذي على المندوب»), newest first.
 * Since his Oct 29 2026 reference (a ledger app's «شحن الأجهزة»): التاريخ · المبلغ · التفاصيل · الرصيد, each amount in
 * its own currency, the amount and the balance cells filled red («عليه») / green («له») - no profit figures at all
 * (his profit is its own statement, buildRepProfitPdf).
 */
export function buildRepStatementPdf(
  rep: Representative,
  statement: RepPeriodStatement,
  periodLabel: string,
  accountName: (accountId: string) => string,
  clientNameFor: (accountId: string) => string | undefined,
  storeItems: StoreItemRegistry,
  fx: Fx,
  native?: RepPeriodStatement,
): PrintableDocument {
  const lines = repStatementTable(statement, native ?? statement, "debt", fx.convert);
  const rows: string[][] = [];
  const cellTones: ("due" | "clear" | undefined)[][] = [];
  for (const line of lines) {
    const title = repRowCells(line.row, undefined, accountName, clientNameFor, storeItems, fx)[1] ?? "";
    const note = rowNote(line.row);
    rows.push([dateTime(line.row), plainList(line.delta), note ? `${title} · ${note}` : title, plainList(line.after)]);
    cellTones.push([undefined, toneOf(line.delta), undefined, toneOf(line.after)]);
  }
  return {
    title: "كشف حساب مندوب",
    partyName: rep.name,
    partyPhone: rep.phone,
    subtitle: periodLabel,
    summary: [{ label: "📡 المبلغ المتبقي عليه", value: balanceText((native ?? statement).debt.closing) || "لا شيء ✓", tone: "due" as const }],
    columns: ["التاريخ", "المبلغ", "التفاصيل", "الرصيد"],
    rows,
    cellTones,
    footerNote: "الأحدث أولًا. 🟥 أحمر = عليه · 🟩 أخضر = له. أرباحه في «كشف الأرباح» وحده - لا تُخصم من هذا الكشف.",
  };
}

/** Everything a rep's statement is made from. */
export interface RepStatementSources {
  accounts: StarlinkAccountSummary[];
  ledger: LedgerByAccount;
  clients: ClientStore;
  repBook: RepBookEntry[];
  invoices: InvoiceList;
  settlements: RepSettlementList;
}

/** His whole current account (after his reset) - the reps page's «الكل» statement - in `convert` and in each
 * record's own currency. */
export function repCurrentStatement(rep: Representative, src: RepStatementSources, convert: RepConvert): { statement: RepPeriodStatement; native: RepPeriodStatement } {
  const deviceRows = listRepDeviceCommissions(rep.id, src.ledger);
  const active = splitRepRecords(rep, { deviceRows, invoices: src.invoices, settlements: src.settlements }, "active");
  const ledgerNow = ledgerAfterRepReset(rep.resetFrom, src.ledger);
  const replays = replayRepClients(src.clients, src.accounts, ledgerNow, rep.resetFrom ? bookAfterRepReset(rep.resetFrom, src.repBook) : src.repBook);
  const operations = repOperations(rep.id, replays, src.accounts, ledgerNow, { allHisDevices: Boolean(rep.customersHidden) });
  const days = buildRepDailyStatement(rep.id, active.deviceRows, active.invoices, active.settlements, operations);
  return { statement: buildRepPeriodStatement(days, {}, convert), native: buildRepPeriodStatement(days, {}, keepCurrency) };
}

/** The rows of «ما عليه», newest first - their keys tell a new operation. */
export function repDebtRowKeys(statement: RepPeriodStatement): string[] {
  return statement.days.flatMap((day) => day.rows.filter((row) => repRowAccount(row) === "debt").map((row) => repRowKey(row)));
}

/** 📄 How many operations the automatic statement carries (his number). */
export const AUTO_STATEMENT_ROWS = 10;

/** «📄 كشف بعد كل عملية»: the statement with its last 10 operations only. */
export function buildRepAutoStatementPdf(
  rep: Representative,
  src: RepStatementSources,
  convert: RepConvert,
  storeItems: StoreItemRegistry,
): PrintableDocument {
  const { statement, native } = repCurrentStatement(rep, src, convert);
  const accountName = (id: string) => src.accounts.find((a) => a.id === id)?.name ?? "جهاز محذوف";
  // 🔒 «زبائنه عنده فقط»: his customers' names stay out of his statement.
  const clientNameFor = (id: string) => (rep.customersHidden ? undefined : src.clients[src.accounts.find((a) => a.id === id)?.clientId ?? ""]?.name);
  const doc = buildRepStatementPdf(rep, statement, "", accountName, clientNameFor, storeItems, makeFx(convert), native);
  const total = doc.rows.length;
  return {
    ...doc,
    subtitle: total > AUTO_STATEMENT_ROWS ? `آخر ${AUTO_STATEMENT_ROWS} عمليات من أصل ${total}` : `كل العمليات (${total})`,
    rows: doc.rows.slice(0, AUTO_STATEMENT_ROWS),
    cellTones: doc.cellTones?.slice(0, AUTO_STATEMENT_ROWS),
  };
}

/** The rows of «ما عليه» with the time each was recorded. */
export function repDebtRows(statement: RepPeriodStatement): { key: string; at: string }[] {
  return statement.days.flatMap((day) => day.rows.filter((row) => repRowAccount(row) === "debt").map((row) => ({ key: repRowKey(row), at: row.createdAt })));
}

/** The operations he hasn't been sent yet: recorded since the option was turned on (`since`) and not in the last
 * statement sent (`sent`). Without `since` (turned on before it was kept) and nothing sent yet: none - it never
 * sends his whole history. */
export function newDebtRows(current: string[] | { key: string; at: string }[], sent: string[] | undefined, since?: string): string[] {
  const rows = current.map((r) => (typeof r === "string" ? { key: r, at: "" } : r));
  if (!sent && !since) return [];
  const seen = new Set(sent ?? []);
  return rows.filter((r) => !seen.has(r.key) && (!since || !r.at || r.at >= since)).map((r) => r.key);
}

/** One «ما عليه» row as it was sent: its key and a stamp of what it says (date, amount in its own currency,
 * device, note) - a change to any of them is an edit (his Oct 30 2026 ask: «أي تعديل على أي عملية أو حذفها أو
 * إضافتها تُرسل للمندوب»). Kept as "key\tdate\tamount\tdetails" so a deleted row can still be described. */
export interface RepSentRow {
  key: string;
  at: string;
  stamp: string;
}

function rowStampDetails(row: RepStatementRow): string {
  if (row.type === "customer") return `${row.op.accountId} ${row.op.note ?? ""} ${row.op.byRep ? "byRep" : ""}`.trim();
  if (row.type === "settlement") return `${row.settlement.kind} ${row.settlement.note ?? ""}`.trim();
  if (row.type === "invoice") return row.row.invoice.id;
  return "";
}

/** The «ما عليه» rows of `native` (each record in its own currency - a rate change is never an edit), stamped. */
export function repSentRows(native: RepPeriodStatement): RepSentRow[] {
  return native.days.flatMap((day) =>
    day.rows
      .filter((row) => repRowAccount(row) === "debt")
      .map((row) => {
        const amount = Object.entries(repRowSplit(row, keepCurrency).debt)
          .filter(([, v]) => Math.abs(v) > 0.000001)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([code, v]) => `${Math.round(v * 100) / 100} ${code}`)
          .join(" + ");
        const key = repRowKey(row);
        return { key, at: row.createdAt, stamp: [key, row.date, amount, rowStampDetails(row).replace(/[\t\n]/g, " ")].join("\t") };
      }),
  );
}

export interface RepStatementChange {
  kind: "added" | "edited" | "removed";
  key: string;
  /** The row's date and amount (for «removed»: as it was sent). */
  date: string;
  amount: string;
}

/** What changed in «ما عليه» since the last statement sent (`sent`: stamps, or bare keys from before stamps were
 * kept - those only tell new rows). Nothing sent yet and no `since`: none, it never sends his whole history. */
export function repStatementChanges(current: RepSentRow[], sent: string[] | undefined, since?: string): RepStatementChange[] {
  if (!sent && !since) return [];
  const parts = (stamp: string) => stamp.split("\t");
  const before = new Map<string, string | undefined>();
  for (const item of sent ?? []) {
    const [key] = parts(item);
    before.set(key!, item.includes("\t") ? item : undefined);
  }
  const changes: RepStatementChange[] = [];
  const now = new Set<string>();
  for (const row of current) {
    now.add(row.key);
    const [, date = "", amount = ""] = parts(row.stamp);
    if (!before.has(row.key)) {
      if (!since || !row.at || row.at >= since) changes.push({ kind: "added", key: row.key, date, amount });
    } else {
      const old = before.get(row.key);
      if (old !== undefined && old !== row.stamp) changes.push({ kind: "edited", key: row.key, date, amount });
    }
  }
  for (const [key, old] of before) {
    if (now.has(key) || old === undefined) continue;
    const [, date = "", amount = ""] = parts(old);
    changes.push({ kind: "removed", key, date, amount });
  }
  return changes;
}

/** "5000 MRU + 10 SIFA" → "5,000 أوقية + 10 سيفا". */
function readableAmount(amount: string): string {
  return amount
    .split(" + ")
    .map((part) => {
      const [value, code = ""] = part.split(" ");
      return `${formatAmount(Math.abs(Number(value)))} ${LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code}`;
    })
    .join(" + ");
}

/** The bot message's caption for those changes. */
export function repChangesCaption(changes: RepStatementChange[]): string {
  const count = (kind: RepStatementChange["kind"]) => changes.filter((c) => c.kind === kind).length;
  const words: string[] = [];
  const added = count("added");
  const edited = count("edited");
  const removed = count("removed");
  if (added) words.push(added === 1 ? "➕ عملية جديدة" : `➕ ${added} عمليات جديدة`);
  if (edited) words.push(edited === 1 ? "✏️ عُدّلت عملية" : `✏️ عُدّلت ${edited} عمليات`);
  if (removed) words.push(removed === 1 ? "🗑️ حُذفت عملية" : `🗑️ حُذفت ${removed} عمليات`);
  const lines = changes
    .filter((c) => c.kind !== "added")
    .slice(0, 5)
    .map((c) => `${c.kind === "edited" ? "✏️" : "🗑️"} ${c.date}${c.amount ? ` · ${readableAmount(c.amount)}` : ""}`);
  return [`📄 كشف حسابك - ${words.join(" · ")}`, ...lines].join("\n");
}

/** 🧾 One line of the in-app statement (his Oct 29 2026 ask: «مثل كشف حسابه PDF… رصيد قبل العملية، الآن، رصيد بعد»). */
export interface RepTableLine {
  key: string;
  row: RepStatementRow;
  before: Record<string, number>;
  delta: Record<string, number>;
  after: Record<string, number>;
}

/** The rows that move one of his two accounts, newest first, each with the balance before and after it -
 * «ما عليه» in each record's own currency (`native`), «ربحه» in the display currency. `since` (ISO): only
 * operations recorded from then on (his «عمليات 24 ساعة الماضية»). */
export function repStatementTable(
  statement: RepPeriodStatement,
  native: RepPeriodStatement,
  account: "debt" | "profit",
  convert: RepConvert,
  since?: string,
): RepTableLine[] {
  const source = account === "debt" ? native : statement;
  const lines: RepTableLine[] = [];
  for (const day of statement.days) {
    for (const row of day.rows) {
      if (since && row.createdAt < since) continue;
      const delta = Object.fromEntries(
        Object.entries(repRowSplit(row, account === "debt" ? keepCurrency : convert)[account]).filter(([, v]) => Math.abs(v) > EPSILON),
      );
      if (Object.keys(delta).length === 0) continue;
      const key = repRowKey(row);
      const after = source[account].after[key] ?? {};
      const before: Record<string, number> = { ...after };
      for (const [code, v] of Object.entries(delta)) before[code] = (before[code] ?? 0) - v;
      lines.push({ key, row, before, delta, after });
    }
  }
  return lines;
}

/** 24 hours before `now`, as ISO. */
export function last24h(now: Date = new Date()): string {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
}
