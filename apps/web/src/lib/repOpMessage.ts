/**
 * 🔔 One operation of a rep's account, as one message in his money bot (his Nov 1 2026 brief «رسائل بوت
 * الأموال - نسخة محسنة وواضحة ومتطابقة»). Every message has the same shape, whatever the operation:
 *
 *   🔔 STAR NET | حركة مالية جديدة          ← the header (its words follow the operation)
 *   🗓️ 01/11 — 01:48 ص                       ← when it was recorded
 *   📧 the device's email                     ← only when it is about a device
 *   🟠 حساب شخصي                              ← which of his accounts
 *   📡 تجديد عليه                             ← what it is (+ its note)
 *   ━━━━━━━━━━
 *   💵 العملية: 3,000 سيفا                    ← the amount, alone and bold
 *   📊 الرصيد قبل: 621,123 سيفا عليك
 *   💰 الرصيد بعد: 624,123 سيفا عليك
 *   📈 النتيجة: زاد ما عليك 3,000 سيفا
 *   [✅ جيد] [❌ غير جيد]
 *
 * The reader is the rep: «عليك / لك» (his choice). Numbers come from the same running balance as his
 * statement («كشفي», «📂 حساباته»): `after` is the account's balance right after the operation and
 * `amount` what the operation did to it (+ = لك), so «قبل» = after − amount - the previous line of his
 * statement. Each currency is its own block, never mixed. Telegram HTML (escaped). Pure.
 */

import { formatAmount } from "./formatAmount";
import { LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "./ledgerStore";
import type { BotAccount, BotLine } from "./repBotStatement";
import { FRANC_CODE } from "./repLedgers";

const EPS = 0.005;
const round2 = (n: number) => Math.round(n * 100) / 100;

function label(code: string): string {
  if (code === FRANC_CODE) return "فرنك";
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

/** Telegram HTML: only these three must be escaped in text. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** «3,000» / «9,862.24» - whole سيفا / فرنك, cents kept for أوقية and dollars. */
export function opAmount(value: number, code: string): string {
  const v = Math.abs(value);
  return formatAmount(code === "SIFA" || code === FRANC_CODE ? Math.round(v) : round2(v));
}

/** «2,600 سيفا» (no sign). */
export function moneyWords(value: number, code: string): string {
  return `${opAmount(value, code)} ${label(code)}`;
}

/** «<b>624,123</b> سيفا عليك» / «<b>0</b> سيفا ✓» (+ = لك). */
export function balanceWords(value: number, code: string): string {
  const side = value > EPS ? " لك" : value < -EPS ? " عليك" : " ✓";
  return `<b>${opAmount(value, code)}</b> ${label(code)}${side}`;
}

/** What the operation did, in words (+ = لك): «زاد ما عليك 3,000 سيفا», «سُدّد ما عليك وصار لك 2,000 سيفا»… */
export function resultWords(before: number, amount: number, code: string, isProfit: boolean): string {
  const after = round2(before + amount);
  const sum = (v: number) => `<b>${opAmount(v, code)} ${label(code)}</b>`;
  const up = amount > 0;
  if (before > EPS && after < -EPS) return `⚠️ النتيجة: انتهى ما لك وصار عليك ${sum(after)}`;
  if (before < -EPS && after > EPS) return `✅ النتيجة: سُدّد ما عليك وصار لك ${sum(after)}`;
  if (before < -EPS || (Math.abs(before) <= EPS && after < -EPS)) {
    // the «عليك» side
    if (Math.abs(after) <= EPS) return `✅ النتيجة: سُدّد ما عليك كله (${sum(amount)})`;
    return up ? `📉 النتيجة: نقص ما عليك ${sum(amount)}` : `📈 النتيجة: زاد ما عليك ${sum(amount)}`;
  }
  // the «لك» side (or 0 → 0)
  const what = isProfit ? "ربحك" : "ما لك";
  if (Math.abs(after) <= EPS && before > EPS) return `↩️ النتيجة: صار ${what} 0 (نقص ${sum(amount)})`;
  return up ? `📈 النتيجة: ${isProfit ? "زادت أرباحك" : "زاد ما لك"} ${sum(amount)}` : `📉 النتيجة: ${isProfit ? "نقصت أرباحك" : "نقص ما لك"} ${sum(amount)}`;
}

/** «01/11 — 01:48 ص» in the phone's time; the operation's own day when its recording time is unknown. */
export function opWhen(line: Pick<BotLine, "date" | "at">): { day: string; time?: string } {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(line.date);
  const day = m ? `${m[2]}/${m[1]}` : line.date;
  const at = line.at ? new Date(line.at) : null;
  if (!at || Number.isNaN(at.getTime())) return { day };
  const h = at.getHours();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { day, time: `${String(hour12).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")} ${h < 12 ? "ص" : "م"}` };
}

export function opHeadline(account: BotAccount, line: BotLine): string {
  const up = Object.values(line.amount).some((v) => v > EPS);
  if (account.isProfit) return up ? "ربح جديد" : "خصم من الربح";
  if (up && /💵|🤖|استلمت/.test(line.kind ?? line.text)) return "دفعة مستلمة";
  return "حركة مالية جديدة";
}

/** A short stable token for an operation (FNV-1a, 8 hex) - what its buttons carry (Telegram allows 64 bytes). */
export function opToken(repId: string, opId: string): string {
  let h = 0x811c9dc5;
  const text = `${repId}|${opId}`;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** «✅ جيد» / «❌ غير جيد» under every operation message. */
export function ratingKeyboard(token: string): string {
  return JSON.stringify({
    inline_keyboard: [
      [
        { text: "✅ جيد", callback_data: `rt:g:${token}` },
        { text: "❌ غير جيد", callback_data: `rt:b:${token}` },
      ],
    ],
  });
}

export interface OpDevice {
  email?: string;
  name?: string;
}

export interface OpMessage {
  html: string;
  /** The same, without tags - for the app's own record of what was sent. */
  plain: string;
  keyboard: string;
  token: string;
  /** Per currency: before / amount / after, as shown - for tests and the record. */
  figures: { code: string; before: number; amount: number; after: number }[];
}

/** The message for one operation of one of his accounts. */
export function repOpMessage(repId: string, account: BotAccount, line: BotLine, device?: OpDevice, serial?: number): OpMessage {
  const { day, time } = opWhen(line);
  const lines = [`🔔 <b>STAR NET | ${opHeadline(account, line)}</b>`, `🗓️ <b>${day}</b>${time ? ` — ${time}` : ""}`];
  // 📜 its number in «سجل العمليات» (his Nov 5 2026 ask) - each rep counts his own
  if (serial) lines.push(`🔢 رقم العملية: <b>#${serial}</b>`);
  lines.push("");
  const email = device?.email?.trim();
  const name = device?.name?.trim();
  if (email) lines.push(`📧 <code>${escapeHtml(email)}</code>`);
  if (name && name !== email) lines.push(`📡 ${escapeHtml(name)}`);
  lines.push(escapeHtml(account.title));
  const kind = line.kind ?? line.text;
  lines.push(`${escapeHtml(kind)}${line.note && line.kind ? ` · ${escapeHtml(line.note)}` : ""}`);
  lines.push("", "━━━━━━━━━━");
  const figures: OpMessage["figures"] = [];
  for (const [code, raw] of Object.entries(line.amount)) {
    if (Math.abs(raw) <= EPS) continue;
    const amount = round2(raw);
    const after = round2(line.after[code] ?? 0);
    const before = round2(after - amount);
    figures.push({ code, before, amount, after });
    lines.push(
      "",
      `<b>💵 العملية: ${opAmount(amount, code)} ${label(code)}</b>`,
      "",
      `📊 الرصيد قبل: ${balanceWords(before, code)}`,
      `💰 الرصيد بعد: ${balanceWords(after, code)}`,
      "",
      resultWords(before, amount, code, account.isProfit),
    );
  }
  const html = lines.join("\n");
  const token = opToken(repId, line.id);
  const plain = html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return { html, plain, keyboard: ratingKeyboard(token), token, figures };
}

/** Newest operations first → the ones to send now, oldest first (so the chat reads in order), at most `max`. */
export function opsToSend<T extends { line: BotLine }>(found: T[], max: number): { send: T[]; more: number } {
  const ordered = [...found].sort((a, b) => (a.line.at ?? a.line.date).localeCompare(b.line.at ?? b.line.date));
  const send = ordered.slice(Math.max(0, ordered.length - max));
  return { send, more: ordered.length - send.length };
}

/**
 * 🤲 One sum he handed over = ONE message (his Nov 5 2026 report: a 3,200 handover came as «2,600» and a
 * «600» he never typed - the app pays his customers' devices first and puts the rest in his account,
 * repClientsSave.ts). The parts of a group in the same account become one line: their amounts added,
 * the balance before the first and after the last, and a note of where each part went. `ids` = every
 * part's id (all marked sent). Lines with no group, or alone in theirs, pass unchanged.
 */
export function mergeHandoverOps<T extends { account: BotAccount; line: BotLine }>(
  found: T[],
  partNote: (line: BotLine, code: string, amount: number) => string,
): (T & { ids: string[] })[] {
  const groups = new Map<string, T[]>();
  for (const f of found) if (f.line.group) groups.set(`${f.account.key}|${f.line.group}`, [...(groups.get(`${f.account.key}|${f.line.group}`) ?? []), f]);
  const out: (T & { ids: string[] })[] = [];
  const done = new Set<string>();
  for (const f of found) {
    const key = f.line.group ? `${f.account.key}|${f.line.group}` : "";
    const parts = key ? groups.get(key)! : [f];
    if (parts.length < 2) {
      out.push({ ...f, ids: [f.line.id] });
      continue;
    }
    if (done.has(key)) continue;
    done.add(key);
    const amount: Record<string, number> = {};
    for (const p of parts) for (const [c, v] of Object.entries(p.line.amount)) amount[c] = round2((amount[c] ?? 0) + v);
    // the last part: the one whose «after» isn't another part's «before»
    const before = (p: T, c: string) => round2((p.line.after[c] ?? 0) - (p.line.amount[c] ?? 0));
    const codes = Object.keys(amount);
    const last = parts.find((p) => codes.every((c) => !parts.some((q) => q !== p && Math.abs(before(q, c) - (p.line.after[c] ?? 0)) < EPS))) ?? parts[0]!;
    // the line that names it: the rest put in his account (no device), else the first
    const main = parts.find((p) => !p.line.accountId) ?? parts[0]!;
    const where = parts
      .slice()
      .sort((a, b) => (a.line.at ?? "") < (b.line.at ?? "") ? -1 : 1)
      .map((p) => {
        const [code, v] = Object.entries(p.line.amount)[0] ?? ["", 0];
        return partNote(p.line, code, Math.abs(v));
      })
      .join(" + ");
    out.push({
      ...main,
      line: {
        ...main.line,
        amount,
        after: last.line.after,
        at: last.line.at ?? main.line.at,
        note: `🤲 مبلغ واحد سلّمته: ${where}`,
      },
      ids: parts.map((p) => p.line.id),
    } as T & { ids: string[] });
  }
  return out;
}
