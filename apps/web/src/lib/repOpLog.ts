/**
 * 📜 «سجل العمليات» (his Nov 5 2026 ask: «أريد لكل عملية رقمًا تسلسليًا، وأن تكون العمليات محفوظة مع صورة
 * في التطبيق، كل عملية محفوظة مع كل تفاصيلها»; his choices: a number per rep, the app's receipt image AND the
 * rep's proof photo, a «📜 السجل» on the rep's card).
 *
 * Every operation message the money bot sends a rep (repOpMessage.ts, with ✅ / ❌) is kept here for good,
 * with its number - «🔢 رقم العملية: #57», shown in the message too - its figures, the message as sent, and
 * where it came from (his request in the bot and its words, an amount handed over in parts, or typed by the
 * operator in the app). The rating is read from repOpRatings by the message's token; the receipt image is
 * drawn from these details; the rep's photo is kept in the proofs store under `oplog:<repId>:<serial>`.
 * Business data (`starnet_rep_op_log_v1`, in the backup). Pure + a small store.
 */

import { formatAmount } from "./formatAmount";
import { LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "./ledgerStore";
import type { PrintableDocument } from "./pdfDocument";
import type { SentOp } from "./repOpRatings";

export interface OpFigure {
  code: string;
  before: number;
  amount: number;
  after: number;
}

export interface LoggedOp {
  serial: number;
  repId: string;
  /** The operation's id(s) in his statement (a handover in parts has several). */
  ids: string[];
  /** The ✅ / ❌ token of its message (repOpRatings). */
  token: string;
  /** When the operation was recorded / when its message went (ISO). */
  at: string;
  sentAt: string;
  account: string;
  kind: string;
  note?: string;
  device?: { name?: string; email?: string };
  figures: OpFigure[];
  /** The message as he got it (no tags). */
  text: string;
  /** Where it came from, in words. */
  source: string;
  /** The record behind it (a ledger entry / settlement) - an approved payment's photo is kept under it. */
  recordId?: string;
  /** The bot message it came from, and his words in it. */
  botId?: string;
  requestText?: string;
  /** 📸 His photo with it: the Telegram file (to fetch again) - and whether it is kept on this phone. */
  proofFileId?: string;
  proofBot?: "reps" | "money";
  proofKept?: boolean;
  /** 🔖 The transfer's reference read from his receipt (receiptCheck.ts) - his Nov 7 2026 ask. */
  receiptRef?: string;
  /** An operation sent before the log existed (fewer details). */
  imported?: boolean;
}

export interface RepOpLog {
  next: number;
  ops: LoggedOp[];
}

export type OpLogStore = Record<string, RepOpLog>;

/** The number the next operation of this rep gets. */
export function nextSerial(store: OpLogStore, repId: string): number {
  return store[repId]?.next ?? 1;
}

/** Adds one operation with the next number (the same token twice is kept once). */
export function logOp(store: OpLogStore, op: Omit<LoggedOp, "serial">): { store: OpLogStore; serial: number } {
  const log = store[op.repId] ?? { next: 1, ops: [] };
  const same = log.ops.find((o) => o.token === op.token);
  if (same) return { store, serial: same.serial };
  const serial = log.next;
  return { store: { ...store, [op.repId]: { next: serial + 1, ops: [...log.ops, { ...op, serial }] } }, serial };
}

/** 📥 The first time: what the bot already sent (repOpRatings' kept messages) gets its numbers, oldest first. */
export function importSent(store: OpLogStore, repId: string, sent: SentOp[]): OpLogStore {
  if (store[repId]?.ops.length) return store;
  let next = store;
  for (const s of sent.filter((x) => x.repId === repId).sort((a, b) => a.at - b.at)) {
    const at = new Date(s.at).toISOString();
    next = logOp(next, { repId, ids: [s.opId], token: s.token, at, sentAt: at, account: s.account, kind: "", figures: [], text: s.text, source: "أُرسلت قبل بدء السجل", imported: true }).store;
  }
  return next;
}

export function markProofKept(store: OpLogStore, repId: string, serial: number): OpLogStore {
  const log = store[repId];
  if (!log) return store;
  return { ...store, [repId]: { ...log, ops: log.ops.map((o) => (o.serial === serial ? { ...o, proofKept: true } : o)) } };
}

/** His operations, newest first; `query` = a number («57» / «#57»), an amount or a word. */
export function findOps(store: OpLogStore, repId: string, query = ""): LoggedOp[] {
  const all = [...(store[repId]?.ops ?? [])].sort((a, b) => b.serial - a.serial);
  const q = query.trim().replace(/^#/, "");
  if (!q) return all;
  if (/^\d+$/.test(q)) {
    const exact = all.filter((o) => String(o.serial) === q);
    const digits = (s: string) => s.replace(/[^\d]/g, "");
    return [...exact, ...all.filter((o) => String(o.serial) !== q && (digits(o.text).includes(q) || (o.receiptRef ?? "").includes(q)))];
  }
  return all.filter((o) => o.text.includes(q) || o.source.includes(q) || (o.requestText ?? "").includes(q));
}

/** The proofs store's key for its photo. */
export function opProofKey(op: Pick<LoggedOp, "repId" | "serial">): string {
  return `oplog:${op.repId}:${op.serial}`;
}

function money(v: number, code: string): string {
  return `${formatAmount(Math.abs(v))} ${LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code}`;
}

/** «🤖 من رسالته في البوت: «سلّمت 3200» · 05/11 06:07» / «✍️ سجّلتها أنت في التطبيق». */
export function opSourceText(input: { requestText?: string; requestAt?: string; handoverNote?: string; byBot: boolean }): string {
  const parts: string[] = [];
  if (input.requestText) {
    const d = input.requestAt ? new Date(input.requestAt) : null;
    const when = d && !Number.isNaN(d.getTime()) ? ` · ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "";
    parts.push(`🤖 من رسالته في البوت: «${input.requestText}»${when} - ثم وافقت عليها`);
  } else if (input.byBot) {
    parts.push("🤖 من بوت الأموال");
  } else {
    parts.push("✍️ سجّلتها أنت في التطبيق");
  }
  if (input.handoverNote) parts.push(input.handoverNote);
  return parts.join("\n");
}

/** 🖼️ The receipt: number, date, account, what it is, the figures, where it came from. */
export function opReceiptDoc(op: LoggedOp, repName: string): PrintableDocument {
  const d = new Date(op.at);
  const when = Number.isNaN(d.getTime()) ? op.at : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const rows: string[][] = [
    ["رقم العملية", `#${op.serial}`],
    ["التاريخ", when],
    ["الحساب", op.account],
  ];
  if (op.kind) rows.push(["العملية", op.note ? `${op.kind} · ${op.note}` : op.kind]);
  if (op.device?.email || op.device?.name) rows.push(["الجهاز", [op.device.name, op.device.email].filter(Boolean).join(" · ")]);
  for (const f of op.figures) {
    rows.push(["المبلغ", `${f.amount > 0 ? "+" : "-"}${money(f.amount, f.code)}`]);
    rows.push(["الرصيد قبل", `${money(f.before, f.code)} ${f.before < 0 ? "عليه" : f.before > 0 ? "له" : ""}`.trim()]);
    rows.push(["الرصيد بعد", `${money(f.after, f.code)} ${f.after < 0 ? "عليه" : f.after > 0 ? "له" : ""}`.trim()]);
  }
  if (op.receiptRef) rows.push(["مرجع التحويل", op.receiptRef]);
  rows.push(["المصدر", op.source.replace(/\n/g, " · ")]);
  return {
    title: `إيصال عملية #${op.serial}`,
    partyName: repName,
    subtitle: when,
    summary: [],
    columns: ["", ""],
    rows: op.figures.length || op.kind ? rows : [...rows, ["الرسالة", op.text.replace(/\n+/g, " · ")]],
    footerNote: "STAR NET · سجل العمليات",
  };
}

// ---- storage ----

const KEY = "starnet_rep_op_log_v1";
export const OP_LOG_CHANGED = "starnet:op-log";

export function loadOpLog(): OpLogStore {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as OpLogStore) : {};
  } catch {
    return {};
  }
}

export function saveOpLog(store: OpLogStore): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
    window.dispatchEvent(new Event(OP_LOG_CHANGED));
  } catch {
    // storage full - the banner (StorageFullBanner) says so
  }
}
