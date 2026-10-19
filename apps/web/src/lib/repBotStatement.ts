/**
 * 📊 «كشفي» in the reps' money bot (his Oct 19 2026 choices): a short summary - each account and
 * what is left «بعد خصم ربحك فقط» and «بعد خصم كل شيء» - with one button per account like the
 * squares of «📂 حساباته»; a button opens that account's operations, 10 at a time (⬅️ أقدم / أحدث
 * ➡️), with «📄 PDF» (made by the app when it's open) and «↩️ كل الحسابات». No device list.
 *
 * 🔎 «بحث» searches his money operations (all his accounts): a typed amount, date or word, or the
 * last ones له / عليه. 🔔 Every new operation in his accounts is sent to him once.
 *
 * Everything is prepared here as texts + buttons under keys the money bot's service reads while the
 * app is closed (`ks:<key>` pages, `ops` for the search - TelegramReplies.java). Pure.
 */

import { formatAmount } from "./formatAmount";
import { LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "./ledgerStore";
import type { PrintableDocument, PrintableTone } from "./pdfDocument";
import { FRANC_CODE, repLedgerBalances, repLedgerKindMeta, repLedgerLines, repLedgersOf, repLedgerShown, type RepLedgerBook } from "./repLedgers";
import type { RepStatementRow } from "./repStore";
import { repWalletTitle, type RepWallet } from "./repWallets";

const EPS = 0.005;
export const BOT_PAGE_SIZE = 10;
const MAX_PAGES = 10;
const TYPE_SHOWN = 15;
const MAX_OPS = 400;

export interface BotLine {
  /** Stable: the same operation keeps it (for «🔔 عملية جديدة»). */
  id: string;
  date: string;
  text: string;
  /** As shown (+ = له), and the account's balance right after it. */
  amount: Record<string, number>;
  after: Record<string, number>;
}

export interface BotAccount {
  /** `a0`, `a1`… in the order of «📂 حساباته». */
  key: string;
  title: string;
  /** As shown (a فرنك account's سيفا ×5 under FRANC). */
  balance: Record<string, number>;
  /** As stored (سيفا) - what is added up across accounts. */
  stored: Record<string, number>;
  isProfit: boolean;
  isNamed: boolean;
  /** Newest first. */
  lines: BotLine[];
}

function label(code: string): string {
  if (code === FRANC_CODE) return "فرنك FCFA";
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

const nonZero = (values: Record<string, number>) => Object.entries(values).filter(([, v]) => Math.abs(v) > EPS);

/** «عليك 5,000 سيفا · لك 2,000 أوقية» / «متوازن ✓» - each currency its own side (+ = لك). */
export function botBalanceWords(values: Record<string, number>): string {
  const parts = nonZero(values);
  if (!parts.length) return "متوازن ✓";
  return parts.map(([c, v]) => `${v > 0 ? "لك" : "عليك"} ${formatAmount(Math.abs(v))} ${label(c)}`).join(" · ");
}

function signedWords(values: Record<string, number>): string {
  const parts = nonZero(values);
  if (!parts.length) return "0";
  return parts.map(([c, v]) => `${v > 0 ? "+" : "-"}${formatAmount(Math.abs(v))} ${label(c)}`).join(" · ");
}

function addTo(out: Record<string, number>, values: Record<string, number>) {
  for (const [c, v] of Object.entries(values)) out[c] = Math.round(((out[c] ?? 0) + v) * 100) / 100;
}

/** "17/10" from "2026-10-17". */
export function shortDay(date: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${m[2]}/${m[1]}` : date;
}

/** His accounts in the order of «📂 حساباته»: شخصي, الربح, الأوقية (and another currency with
 * records), then his named accounts. */
export function repBotAccounts(wallets: RepWallet[], book: RepLedgerBook, repId: string, describe: (row: RepStatementRow) => string): BotAccount[] {
  const ordered = [...wallets.filter((w) => w.id === "SIFA"), ...wallets.filter((w) => w.id === "profit"), ...wallets.filter((w) => w.id !== "SIFA" && w.id !== "profit")];
  const out: BotAccount[] = [];
  for (const w of ordered) {
    if (w.id !== "SIFA" && w.id !== "profit" && w.id !== "MRU" && !w.lines.length && !nonZero(w.balance).length) continue;
    out.push({
      key: `a${out.length}`,
      title: repWalletTitle(w.id),
      balance: w.balance,
      stored: w.balance,
      isProfit: w.id === "profit",
      isNamed: false,
      lines: w.lines.map((l) => ({ id: `${w.id}:${l.key}`, date: l.date, text: describe(l.row), amount: l.amount, after: l.after })),
    });
  }
  for (const ledger of repLedgersOf(book, repId)) {
    const stored = repLedgerBalances(book, ledger.id);
    const lines = repLedgerLines(book, ledger.id).map(({ entry, amount, after }) => {
      const what = entry.travelFor
        ? `🛂 توثيق${entry.note ? ` · ${entry.note}` : ""}`
        : entry.opening
          ? "📥 رصيد افتتاحي"
          : `${entry.botId ? "🤖 إيداع" : amount > 0 ? "➕ له" : "➖ عليه"}${entry.note ? ` · ${entry.note}` : ""}`;
      return { id: `l:${entry.id}`, date: entry.date, text: what, amount: repLedgerShown(ledger, { [entry.currencyCode]: amount }), after: repLedgerShown(ledger, { [entry.currencyCode]: after }) };
    });
    out.push({
      key: `a${out.length}`,
      title: `${repLedgerKindMeta(ledger.kind).icon} ${ledger.name}`,
      balance: repLedgerShown(ledger, stored),
      stored,
      isProfit: false,
      isNamed: true,
      lines,
    });
  }
  return out;
}

/** ⚖️ What is left: his money accounts with his profit taken off them, then with everything (his
 * named accounts too) - per currency, never converted (+ = لك). */
export function repBotRemaining(accounts: BotAccount[]): { afterProfit: Record<string, number>; afterAll: Record<string, number> } {
  const afterProfit: Record<string, number> = {};
  for (const a of accounts) if (!a.isNamed) addTo(afterProfit, a.stored);
  const afterAll = { ...afterProfit };
  for (const a of accounts) if (a.isNamed) addTo(afterAll, a.stored);
  return { afterProfit, afterAll };
}

type Button = { text: string; callback_data: string };

function keyboard(rows: Button[][]): string {
  return JSON.stringify({ inline_keyboard: rows.filter((r) => r.length) });
}

function lineText(l: BotLine): string {
  return `• ${shortDay(l.date)} ${l.text}: ${signedWords(l.amount)} ← ${botBalanceWords(l.after)}`;
}

export interface RepBotPages {
  /** The summary (also «📊 كشفي»'s answer) and its buttons. */
  summary: string;
  summaryKb: string;
  /** `ks:<key>` → text / `ks:<key>#kb` → buttons, for the reply snapshot. */
  pages: Record<string, string>;
  /** «searchKey\tline» per operation, newest first. */
  ops: string;
}

export function repBotPages(repName: string, accounts: BotAccount[], since?: string): RepBotPages {
  const { afterProfit, afterAll } = repBotRemaining(accounts);
  const summaryLines = [`📊 كشف حسابك يا ${repName}`];
  if (since) summaryLines.push(`🔄 منذ ${since}`);
  summaryLines.push("", ...accounts.map((a) => `${a.title}: ${botBalanceWords(a.balance)}`));
  summaryLines.push("", `⚖️ الباقي بعد خصم ربحك فقط: ${botBalanceWords(afterProfit)}`, `⚖️ الباقي بعد خصم كل شيء: ${botBalanceWords(afterAll)}`, "", "👇 اضغط حسابًا لترى عملياته");
  const summary = summaryLines.join("\n");
  const summaryKb = keyboard([...accounts.map((a) => [{ text: `${a.title} · ${botBalanceWords(a.balance)}`.slice(0, 60), callback_data: `ks:${a.key}:0` }]), [{ text: "🔎 بحث في عملياتي", callback_data: "ks:s" }]]);
  const pages: Record<string, string> = { "ks:l": summary, "ks:l#kb": summaryKb };

  for (const a of accounts) {
    const count = Math.max(1, Math.min(MAX_PAGES, Math.ceil(a.lines.length / BOT_PAGE_SIZE)));
    for (let p = 0; p < count; p++) {
      const chunk = a.lines.slice(p * BOT_PAGE_SIZE, (p + 1) * BOT_PAGE_SIZE);
      const head = [`${a.title}`, `الرصيد: ${botBalanceWords(a.balance)}`, ""];
      const body = chunk.length ? chunk.map(lineText) : ["لا عمليات في هذا الحساب بعد."];
      const from = p * BOT_PAGE_SIZE + 1;
      const foot = a.lines.length > BOT_PAGE_SIZE ? ["", `العمليات ${from}-${from + chunk.length - 1} من ${a.lines.length}`] : [];
      pages[`ks:${a.key}:${p}`] = [...head, ...body, ...foot].join("\n");
      const nav: Button[] = [];
      if (p + 1 < count) nav.push({ text: "⬅️ أقدم", callback_data: `ks:${a.key}:${p + 1}` });
      if (p > 0) nav.push({ text: "أحدث ➡️", callback_data: `ks:${a.key}:${p - 1}` });
      pages[`ks:${a.key}:${p}#kb`] = keyboard([nav, [{ text: "📄 كشف PDF", callback_data: `kp:${a.key}` }, { text: "↩️ كل الحسابات", callback_data: "ks:l" }]]);
    }
  }

  // 🔎 Search: every operation of every account, newest first.
  const all = accounts
    .flatMap((a) => a.lines.map((l) => ({ a, l })))
    .sort((x, y) => y.l.date.localeCompare(x.l.date))
    .slice(0, MAX_OPS);
  const shown = (x: { a: BotAccount; l: BotLine }) => `• ${shortDay(x.l.date)} · ${x.a.title} · ${x.l.text}: ${signedWords(x.l.amount)}`;
  const ops = all
    .map((x) => {
      const credit = Object.values(x.l.amount).some((v) => v > EPS);
      const amounts = Object.values(x.l.amount).map((v) => `${Math.round(Math.abs(v) * 100) / 100}`).join(" ");
      const key = opSearchKey(`${x.l.date} ${shortDay(x.l.date)} ${x.a.title} ${x.l.text} ${amounts} ${Object.keys(x.l.amount).map(label).join(" ")} ${credit ? "له لك دفعه دفع" : "عليه عليك دين"}`);
      return `${key}\t${shown(x).replace(/[\t\n]/g, " ")}`;
    })
    .join("\n");
  pages["ks:s"] = ["🔎 ابحث في عملياتك المالية (كل حساباتك):", "اكتب مبلغًا (5000)، أو تاريخًا (17/10)، أو كلمة (دفعة، دين، سلفة، توثيق، اسم حساب).", "أو اختر:"].join("\n");
  const searchKb = keyboard([
    [
      { text: "➕ ما لك", callback_data: "ks:t:c" },
      { text: "➖ ما عليك", callback_data: "ks:t:d" },
    ],
    [{ text: "📋 آخر العمليات", callback_data: "ks:t:a" }, { text: "↩️ كل الحسابات", callback_data: "ks:l" }],
  ]);
  pages["ks:s#kb"] = searchKb;
  const typePage = (title: string, pick: (x: { l: BotLine }) => boolean) => {
    const found = all.filter(pick).slice(0, TYPE_SHOWN);
    return [title, "", ...(found.length ? found.map(shown) : ["لا عمليات."])].join("\n");
  };
  pages["ks:t:c"] = typePage(`➕ آخر ما لك (حتى ${TYPE_SHOWN}):`, (x) => Object.values(x.l.amount).some((v) => v > EPS));
  pages["ks:t:d"] = typePage(`➖ آخر ما عليك (حتى ${TYPE_SHOWN}):`, (x) => Object.values(x.l.amount).some((v) => v < -EPS));
  pages["ks:t:a"] = typePage(`📋 آخر عملياتك (حتى ${TYPE_SHOWN}):`, () => true);
  for (const t of ["c", "d", "a"]) pages[`ks:t:${t}#kb`] = searchKb;
  return { summary, summaryKb, pages, ops };
}

/** The same folding as TelegramReplies.normalize (Java) + no thousands commas, so a typed «5,000»,
 * «٥٠٠٠» or «أوقية» finds what «5000» / «اوقيه» was stored as. */
export function opSearchKey(text: string): string {
  let out = "";
  for (let ch of text.toLowerCase()) {
    const c = ch.charCodeAt(0);
    if ((c >= 0x064b && c <= 0x0652) || c === 0x0640) continue;
    if (ch === "أ" || ch === "إ" || ch === "آ") ch = "ا";
    else if (ch === "ة") ch = "ه";
    else if (ch === "ى") ch = "ي";
    else if (c >= 0x0660 && c <= 0x0669) ch = String.fromCharCode(48 + c - 0x0660);
    else if (c >= 0x06f0 && c <= 0x06f9) ch = String.fromCharCode(48 + c - 0x06f0);
    out += ch;
  }
  return out.replace(/[,،]/g, "").replace(/\s+/g, " ").trim();
}

// ---- 🔔 a new operation in his accounts ----

/** The operations not seen before (newest first). `seen` null = the first time: nothing is new
 * (everything already there is just remembered). */
export function newBotOperations(accounts: BotAccount[], seen: string[] | null): { account: BotAccount; line: BotLine }[] {
  if (!seen) return [];
  const known = new Set(seen);
  return accounts.flatMap((account) => account.lines.filter((l) => !known.has(l.id)).map((line) => ({ account, line })));
}

export function botOperationIds(accounts: BotAccount[]): string[] {
  return accounts.flatMap((a) => a.lines.map((l) => l.id));
}

export const MAX_NEW_SHOWN = 5;

export function newOperationsText(found: { account: BotAccount; line: BotLine }[]): string {
  const lines = [found.length === 1 ? "🔔 عملية جديدة في حسابك" : `🔔 ${found.length} عمليات جديدة في حسابك`];
  for (const { account, line } of found.slice(0, MAX_NEW_SHOWN)) {
    lines.push("", `${account.title}`, `${shortDay(line.date)} ${line.text}: ${signedWords(line.amount)}`, `رصيده بعدها: ${botBalanceWords(line.after)}`);
  }
  if (found.length > MAX_NEW_SHOWN) lines.push("", `… و${found.length - MAX_NEW_SHOWN} أخرى - اضغط «📊 كشفي»`);
  return lines.join("\n");
}

// ---- 📄 one account as a PDF ----

export function repBotAccountPdf(repName: string, account: BotAccount, since?: string): PrintableDocument {
  const tone = (v: Record<string, number>): PrintableTone => {
    const s = Object.values(v).reduce((t, x) => t + x, 0);
    return s > EPS ? "clear" : s < -EPS ? "due" : "neutral";
  };
  return {
    title: `كشف ${account.title}`,
    partyName: repName,
    ...(since ? { subtitle: `منذ ${since}` } : {}),
    summary: [{ label: "الرصيد", value: botBalanceWords(account.balance), tone: tone(account.balance) }],
    columns: ["التاريخ", "العملية", "المبلغ", "الرصيد بعدها"],
    rows: account.lines.map((l) => [l.date, l.text, signedWords(l.amount), botBalanceWords(l.after)]),
    rowTones: account.lines.map((l) => tone(l.after)),
    footerNote: "«+» = لك، «-» = عليك. كل عملة وحدها - لا تُحوَّل ولا تُخلط.",
  };
}

