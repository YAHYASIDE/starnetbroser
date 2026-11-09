/**
 * 💳 Money operations inside the rep's chat conversation (his Nov 9 2026 brief «SADAGHA CONNECT», his choices: the
 * operator's phone is the reference, Telegram stays alongside). Every new operation of a rep's accounts - the same ones
 * the money bot announces (repBotStatement `newBotOperations`, repOpMessage) - becomes a CARD in his conversation:
 * what it is, the date, its number, then per currency «قبل · العملية · بعد» on one row; the rep answers «✅ جيد» or
 * «❌ غير جيد» (+ why), recorded in the SAME ratings as the bot's buttons (repOpRatings.ts, `token`). A card never
 * changes a balance; it points to its operation by `token` (repId + operation id), and its message id comes from that
 * token - sent again, it is the same message (no double). Pure.
 */

import { opHeadline, opToken, opWhen, repOpMessage, type OpDevice } from "./repOpMessage";
import type { BotAccount, BotLine } from "./repBotStatement";

export interface ChatOpFigure {
  code: string;
  before: number;
  amount: number;
  after: number;
}

export interface ChatOp {
  /** The operation's token (repOpMessage `opToken`) - the same as the money bot's buttons. */
  token: string;
  /** «🔢 #12» in «سجل العمليات», when it has one. */
  serial?: number;
  headline: string;
  account: string;
  kind: string;
  note?: string;
  device?: { name?: string; email?: string };
  day: string;
  time?: string;
  figures: ChatOpFigure[];
}

export interface ChatOpRate {
  token: string;
  verdict: "good" | "bad";
  /** «❌ غير جيد»: why (and the amount he expected, in his words). */
  note?: string;
}

export const OP_NOTE_MAX = 400;

/** The card of one operation (built the way the money bot builds its message). */
export function chatOpFrom(repId: string, account: BotAccount, line: BotLine, device?: OpDevice, serial?: number): ChatOp {
  const message = repOpMessage(repId, account, line, device, serial);
  const { day, time } = opWhen(line);
  const name = device?.name?.trim();
  const email = device?.email?.trim();
  return {
    token: opToken(repId, line.id),
    ...(serial ? { serial } : {}),
    headline: opHeadline(account, line),
    account: account.title,
    kind: line.kind ?? line.text,
    ...(line.note && line.kind ? { note: line.note } : {}),
    ...(name || email ? { device: { ...(name ? { name } : {}), ...(email ? { email } : {}) } } : {}),
    day,
    ...(time ? { time } : {}),
    figures: message.figures,
  };
}

/** The card's message id: from its token, so the same operation is always the same message. */
export function chatOpMessageId(token: string): string {
  return `${token}00c4`;
}

/** The line under the conversation / in a notification. */
export function chatOpText(op: Pick<ChatOp, "headline" | "kind" | "figures">): string {
  const main = op.figures[0];
  const amount = main ? `${main.amount > 0 ? "+" : ""}${main.amount.toLocaleString("en-US")} ${main.code}` : "";
  return `💳 ${op.headline}: ${op.kind}${amount ? ` (${amount})` : ""}`;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A card from a document: sane fields only, or undefined. */
export function cleanChatOp(value: unknown): ChatOp | undefined {
  const o = value as Record<string, unknown> | null | undefined;
  if (!o || typeof o.token !== "string" || !/^[0-9a-f]{8}$/.test(o.token)) return undefined;
  const figures: ChatOpFigure[] = [];
  for (const f of Array.isArray(o.figures) ? (o.figures as Record<string, unknown>[]).slice(0, 4) : []) {
    const code = str(f?.code, 12);
    const before = num(f?.before);
    const amount = num(f?.amount);
    const after = num(f?.after);
    if (code && before !== null && amount !== null && after !== null) figures.push({ code, before, amount, after });
  }
  const headline = str(o.headline, 60);
  const kind = str(o.kind, 200);
  const day = str(o.day, 40);
  if (!headline || !kind || !day || figures.length === 0) return undefined;
  const d = o.device as Record<string, unknown> | undefined;
  const name = str(d?.name, 120);
  const email = str(d?.email, 160);
  const serial = num(o.serial);
  const note = str(o.note, 300);
  const time = str(o.time, 20);
  return {
    token: o.token,
    ...(serial && serial > 0 ? { serial: Math.floor(serial) } : {}),
    headline,
    account: str(o.account, 120) ?? "",
    kind,
    ...(note ? { note } : {}),
    ...(name || email ? { device: { ...(name ? { name } : {}), ...(email ? { email } : {}) } } : {}),
    day,
    ...(time ? { time } : {}),
    figures,
  };
}

export function cleanChatOpRate(value: unknown): ChatOpRate | undefined {
  const o = value as Record<string, unknown> | null | undefined;
  if (!o || typeof o.token !== "string" || !/^[0-9a-f]{8}$/.test(o.token) || (o.verdict !== "good" && o.verdict !== "bad")) return undefined;
  const note = typeof o.note === "string" ? o.note.trim().slice(0, OP_NOTE_MAX) : "";
  return { token: o.token, verdict: o.verdict, ...(note && o.verdict === "bad" ? { note } : {}) };
}

export type OpStatus = { state: "waiting" } | { state: "good"; at: number } | { state: "bad"; at: number; note?: string };

/** The card's state: the rep's last answer to it in the conversation (his own messages only). */
export function opStatusOf(messages: { from: "owner" | "rep"; opRate?: ChatOpRate; at: number }[], token: string): OpStatus {
  let last: { rate: ChatOpRate; at: number } | null = null;
  for (const m of messages) if (m.from === "rep" && m.opRate?.token === token && (!last || m.at >= last.at)) last = { rate: m.opRate, at: m.at };
  if (!last) return { state: "waiting" };
  return last.rate.verdict === "good" ? { state: "good", at: last.at } : { state: "bad", at: last.at, ...(last.rate.note ? { note: last.rate.note } : {}) };
}
