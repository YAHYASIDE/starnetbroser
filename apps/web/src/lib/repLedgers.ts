/**
 * 📒 A rep's named accounts - his Oct 12 2026 ask, like the ledger app he and the rep used («مدونة
 * حسابات»): besides his normal account (the devices, the one his profit comes from - lib/repWallets.ts,
 * unchanged), the rep has accounts with free names («<rep> اورانج», «شهر 10», «تنزيل دبو»…), each
 * standing alone: a trust / deposit, a loan between them, or just a free account. They have nothing to
 * do with his profit.
 *
 * They live in their OWN store (`starnet_rep_ledgers_v1`), not among the rep's settlements, so no
 * existing calculation can pick them up by mistake: his profit, his normal accounts, paying his
 * customers' devices, the bot and the rep's app copy never read them (the council's main warning).
 * «حسابي» adds their balances to what the rep owes / is owed (his choice: «داخل له/عليه كالباقي»).
 *
 * Each account has its own currencies (his Oct 12 2026 ask: «اورانج» holds سيفا + أوقية, «MRO» only
 * أوقية) - chosen when it's made, one can be added later, and one with no entries removed. Every entry
 * is in one of them; the balance is derived per currency from the entries (+ = له / we owe him,
 * − = عليه), never stored and never converted. Every entry is deletable. Pure, except load/save.
 */

import { FRANC_PER_SIFA } from "./moneyAccounts";

export type RepLedgerKind = "trust" | "loan" | "free" | "travel";

export const REP_LEDGER_KINDS: { kind: RepLedgerKind; icon: string; label: string; hint: string }[] = [
  { kind: "trust", icon: "🔒", label: "أمانة / وديعة", hint: "مال أحدكما عند الآخر للحفظ - لا علاقة له بالربح." },
  { kind: "loan", icon: "🤝", label: "سلفة / دين", hint: "تتسلف منه أو يتسلف منك - لا علاقة له بالربح." },
  { kind: "free", icon: "📒", label: "حساب حر", hint: "أي حساب باسمك (شهر 10، شحن الأجهزة…) - لا علاقة له بالربح." },
  { kind: "travel", icon: "🛂", label: "توثيق الأجهزة", hint: "يمتلئ وحده: كل جهاز له تضع له «💰 سعر التوثيق» يدخل هنا «عليه» بدل حسابه العادي." },
];

export function repLedgerKindMeta(kind: RepLedgerKind) {
  return REP_LEDGER_KINDS.find((k) => k.kind === kind) ?? REP_LEDGER_KINDS[2]!;
}

export interface RepLedger {
  id: string;
  repId: string;
  name: string;
  kind: RepLedgerKind;
  /** Its currencies (at least one), in the order he chose - an entry is always in one of them. */
  currencies: string[];
  /** 🟠 Its سيفا is shown and typed in فرنك FCFA (أورانج موني / نيتا, 5 فرنك = 1 سيفا) - still stored
   * in سيفا like every أورانج amount (lib/payCurrency.ts). Undefined = never chosen. */
  franc?: boolean;
  createdAt: string;
}

export interface RepLedgerEntry {
  id: string;
  ledgerId: string;
  /** credit = «له» (+), debit = «عليه» (−). */
  direction: "credit" | "debit";
  amount: number;
  /** One of the account's currencies. */
  currencyCode: string;
  /** yyyy-mm-dd */
  date: string;
  note?: string;
  /** The balance he brought from his old ledger app («رصيد افتتاحي»). */
  opening?: true;
  /** 💵 Real money moved with it (a deposit the rep sent through the money bot): where it went in
   * «حسابي» - "cash" (a linked الكاش entry carries this entry's id) or a bank / wallet id. Absent =
   * bookkeeping only (له / عليه typed on the page, no money moves). */
  placeId?: string;
  /** 🔒 The bot's id for the deposit: the same message twice never makes two entries. */
  botId?: string;
  /** 🛂 A «توثيق الأجهزة» line: the device's registration it comes from (`<deviceId>|<travelFeeKey>`),
   * kept in step with its «💰 سعر التوثيق» (lib/repTravelLedger.ts). */
  travelFor?: string;
  createdAt: string;
}

export interface RepLedgerBook {
  ledgers: RepLedger[];
  entries: RepLedgerEntry[];
}

export const EMPTY_REP_LEDGER_BOOK: RepLedgerBook = { ledgers: [], entries: [] };

const EPS = 0.005;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random()}`;
}

const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

export type RepLedgerResult = { ok: true; book: RepLedgerBook; ledger: RepLedger } | { ok: false; message: string };

export interface NewRepLedgerInput {
  repId: string;
  name: string;
  kind: RepLedgerKind;
  currencies: string[];
  /** The balance it starts with (from his old ledger app) - in its first currency unless named. */
  opening?: { direction: "credit" | "debit"; amount: number; date: string; currencyCode?: string };
}

/** Distinct, non-empty, in order. */
function cleanCurrencies(codes: readonly string[]): string[] {
  return [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
}

export function createRepLedger(book: RepLedgerBook, input: NewRepLedgerInput, now = new Date()): RepLedgerResult {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, message: "اكتب اسم الحساب" };
  const currencies = cleanCurrencies(input.currencies);
  if (!currencies.length) return { ok: false, message: "اختر عملة واحدة على الأقل" };
  if (book.ledgers.some((l) => l.repId === input.repId && sameName(l.name, name))) return { ok: false, message: `يوجد حساب بنفس الاسم «${name}»` };
  if (input.kind === "travel" && repTravelLedgerOf(book, input.repId)) return { ok: false, message: "له حساب «🛂 توثيق الأجهزة» من قبل - حساب واحد يكفي" };
  const franc = currencies.includes("SIFA") && FRANC_NAME_RE.test(name);
  const ledger: RepLedger = { id: newId("rl"), repId: input.repId, name, kind: input.kind, currencies, ...(franc ? { franc: true } : {}), createdAt: now.toISOString() };
  let next: RepLedgerBook = { ...book, ledgers: [...book.ledgers, ledger] };
  if (input.opening && input.opening.amount > 0) {
    const added = addRepLedgerEntry(next, ledger.id, { ...input.opening, note: "رصيد افتتاحي", opening: true }, now);
    if (!added.ok) return added;
    next = added.book;
  }
  return { ok: true, book: next, ledger };
}

export function renameRepLedger(book: RepLedgerBook, id: string, name: string): RepLedgerResult {
  const ledger = book.ledgers.find((l) => l.id === id);
  if (!ledger) return { ok: false, message: "الحساب غير موجود" };
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return { ok: false, message: "اكتب اسم الحساب" };
  if (book.ledgers.some((l) => l.id !== id && l.repId === ledger.repId && sameName(l.name, clean))) return { ok: false, message: `يوجد حساب بنفس الاسم «${clean}»` };
  const renamed = { ...ledger, name: clean };
  return { ok: true, book: { ...book, ledgers: book.ledgers.map((l) => (l.id === id ? renamed : l)) }, ledger: renamed };
}

/** 🟠 A name that says أورانج موني / نيتا - such an account starts in فرنك. */
export const FRANC_NAME_RE = /orange|oranj|اورانج|أورانج|أورنج|اورنج|نيتا|nita/i;

/** 🟠 فرنك on / off. `typedInFranc`: the amounts already typed in its سيفا were really فرنك (his
 * «ORANJ MONEY» - 6,652 typed from the Orange app) → they become سيفا ÷5; otherwise they stay as
 * they are (only how they show changes). Deposits from the bot are real سيفا and never change. */
export function setRepLedgerFranc(book: RepLedgerBook, id: string, on: boolean, typedInFranc = false): RepLedgerBook {
  const ledger = book.ledgers.find((l) => l.id === id);
  if (!ledger) return book;
  const convert = on && typedInFranc && !ledger.franc;
  return {
    ledgers: book.ledgers.map((l) => (l.id === id ? { ...l, franc: on } : l)),
    entries: convert
      ? book.entries.map((e) => (e.ledgerId === id && e.currencyCode === "SIFA" && !e.botId && !e.placeId && !e.travelFor ? { ...e, amount: Math.round((e.amount / FRANC_PER_SIFA) * 100) / 100 } : e))
      : book.entries,
  };
}

/** The key an amount shows under: «FRANC» for سيفا in a فرنك account, else its own currency. */
export const FRANC_CODE = "FRANC";

export function repLedgerShownCode(ledger: Pick<RepLedger, "franc">, code: string): string {
  return ledger.franc && code === "SIFA" ? FRANC_CODE : code;
}

/** Stored amounts as they show: a فرنك account's سيفا ×5 under «FRANC». */
export function repLedgerShown(ledger: Pick<RepLedger, "franc">, values: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [code, v] of Object.entries(values)) out[repLedgerShownCode(ledger, code)] = ledger.franc && code === "SIFA" ? Math.round(v * FRANC_PER_SIFA * 100) / 100 : v;
  return out;
}

/** What is stored for an amount typed in the account: فرنك → سيفا ÷5. */
export function repLedgerTyped(ledger: Pick<RepLedger, "franc">, code: string, typed: number): number {
  return ledger.franc && code === "SIFA" ? Math.round((typed / FRANC_PER_SIFA) * 100) / 100 : typed;
}

/** 🛂 His «توثيق الأجهزة» account (one per rep), if he has one. */
export function repTravelLedgerOf(book: RepLedgerBook, repId: string): RepLedger | undefined {
  return book.ledgers.find((l) => l.repId === repId && l.kind === "travel");
}

/** 💱 One more currency in the account (its balance in it starts at 0). */
export function addRepLedgerCurrency(book: RepLedgerBook, id: string, code: string): RepLedgerResult {
  const ledger = book.ledgers.find((l) => l.id === id);
  if (!ledger) return { ok: false, message: "الحساب غير موجود" };
  if (!code.trim()) return { ok: false, message: "اختر العملة" };
  if (ledger.currencies.includes(code)) return { ok: false, message: "هذه العملة موجودة في الحساب" };
  const next = { ...ledger, currencies: [...ledger.currencies, code] };
  return { ok: true, book: { ...book, ledgers: book.ledgers.map((l) => (l.id === id ? next : l)) }, ledger: next };
}

/** 💱 A currency out of the account - only one with no entries, and never its last one. */
export function removeRepLedgerCurrency(book: RepLedgerBook, id: string, code: string): RepLedgerResult {
  const ledger = book.ledgers.find((l) => l.id === id);
  if (!ledger) return { ok: false, message: "الحساب غير موجود" };
  if (!ledger.currencies.includes(code)) return { ok: false, message: "هذه العملة ليست في الحساب" };
  if (ledger.currencies.length === 1) return { ok: false, message: "يبقى للحساب عملة واحدة على الأقل - أضف العملة الأخرى أولاً" };
  if (book.entries.some((e) => e.ledgerId === id && e.currencyCode === code)) return { ok: false, message: "فيها عمليات - احذف عملياتها أولاً" };
  const next = { ...ledger, currencies: ledger.currencies.filter((c) => c !== code) };
  return { ok: true, book: { ...book, ledgers: book.ledgers.map((l) => (l.id === id ? next : l)) }, ledger: next };
}

/** The account and all its entries. */
export function deleteRepLedger(book: RepLedgerBook, id: string): RepLedgerBook {
  return { ledgers: book.ledgers.filter((l) => l.id !== id), entries: book.entries.filter((e) => e.ledgerId !== id) };
}

export type RepLedgerEntryResult = { ok: true; book: RepLedgerBook; entry: RepLedgerEntry } | { ok: false; message: string };

export function addRepLedgerEntry(
  book: RepLedgerBook,
  ledgerId: string,
  input: { direction: "credit" | "debit"; amount: number; currencyCode?: string; date: string; note?: string; opening?: boolean; placeId?: string; botId?: string },
  now = new Date(),
): RepLedgerEntryResult {
  const ledger = book.ledgers.find((l) => l.id === ledgerId);
  if (!ledger) return { ok: false, message: "الحساب غير موجود" };
  // One currency: it's that one; several: he names it.
  const currencyCode = input.currencyCode ?? (ledger.currencies.length === 1 ? ledger.currencies[0]! : "");
  if (!currencyCode) return { ok: false, message: "اختر العملة" };
  if (!ledger.currencies.includes(currencyCode)) return { ok: false, message: `حساب «${ledger.name}» ليس فيه هذه العملة` };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, message: "اكتب المبلغ" };
  if (!DATE_RE.test(input.date)) return { ok: false, message: "اختر التاريخ" };
  const entry: RepLedgerEntry = {
    id: newId("rle"),
    ledgerId,
    direction: input.direction,
    amount: Math.round(input.amount * 100) / 100,
    currencyCode,
    date: input.date,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(input.opening ? { opening: true as const } : {}),
    ...(input.placeId ? { placeId: input.placeId } : {}),
    ...(input.botId ? { botId: input.botId } : {}),
    createdAt: now.toISOString(),
  };
  return { ok: true, book: { ...book, entries: [...book.entries, entry] }, entry };
}

export function deleteRepLedgerEntry(book: RepLedgerBook, entryId: string): RepLedgerBook {
  return { ...book, entries: book.entries.filter((e) => e.id !== entryId) };
}

const signed = (e: RepLedgerEntry) => (e.direction === "credit" ? e.amount : -e.amount);

/** + = له (we owe him), − = عليه - in one currency. */
export function repLedgerBalance(book: RepLedgerBook, ledgerId: string, currencyCode: string): number {
  const total = book.entries.filter((e) => e.ledgerId === ledgerId && e.currencyCode === currencyCode).reduce((sum, e) => sum + signed(e), 0);
  return Math.abs(total) < EPS ? 0 : Math.round(total * 100) / 100;
}

/** Its balance in each of its currencies (0 ones left out) - never added together. */
export function repLedgerBalances(book: RepLedgerBook, ledgerId: string): Record<string, number> {
  const ledger = book.ledgers.find((l) => l.id === ledgerId);
  const out: Record<string, number> = {};
  for (const code of ledger?.currencies ?? []) {
    const balance = repLedgerBalance(book, ledgerId, code);
    if (balance !== 0) out[code] = balance;
  }
  return out;
}

export interface RepLedgerLine {
  entry: RepLedgerEntry;
  /** Signed: + له, − عليه. */
  amount: number;
  /** The account's balance in the line's currency right after it. */
  after: number;
}

/** The account's statement, newest first, each line with its currency's balance after it (dated order). */
export function repLedgerLines(book: RepLedgerBook, ledgerId: string): RepLedgerLine[] {
  const entries = book.entries
    .filter((e) => e.ledgerId === ledgerId)
    .sort((a, b) => a.date.localeCompare(b.date) || Number(Boolean(b.opening)) - Number(Boolean(a.opening)) || a.createdAt.localeCompare(b.createdAt));
  const running: Record<string, number> = {};
  const lines = entries.map((entry) => {
    const after = (running[entry.currencyCode] ?? 0) + signed(entry);
    running[entry.currencyCode] = after;
    return { entry, amount: signed(entry), after: Math.round(after * 100) / 100 };
  });
  return lines.reverse();
}

export function repLedgersOf(book: RepLedgerBook, repId: string): RepLedger[] {
  return book.ledgers.filter((l) => l.repId === repId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** All his named accounts together, per currency (+ = له) - what «حسابي» adds to the rep. */
export function repLedgerTotals(book: RepLedgerBook, repId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of repLedgersOf(book, repId)) {
    for (const [code, balance] of Object.entries(repLedgerBalances(book, l.id))) out[code] = Math.round(((out[code] ?? 0) + balance) * 100) / 100;
  }
  for (const code of Object.keys(out)) if (Math.abs(out[code]!) < EPS) delete out[code];
  return out;
}

/** 🧹 The له / عليه that brings the account back to 0 (null when it already is). */
export function repLedgerZeroEntry(balance: number): { direction: "credit" | "debit"; amount: number } | null {
  if (Math.abs(balance) < EPS) return null;
  return { direction: balance < 0 ? "credit" : "debit", amount: Math.round(Math.abs(balance) * 100) / 100 };
}

// ---- 💵 the money that moved with an entry (a deposit from the money bot) ----

export const REP_LEDGER_CASH = "cash";

/** The banks / wallets of «حسابي» an entry's money went into (+ in for له, − out for عليه) - added to
 * their balances like every other flow (myMoneyData.loadAccountFlows). الكاش is a linked cash entry. */
export function repLedgerFlows(book: RepLedgerBook): { accountId: string; currencyCode: string; date: string; amount: number }[] {
  const ids = new Set(book.ledgers.map((l) => l.id));
  return book.entries
    .filter((e) => e.placeId && e.placeId !== REP_LEDGER_CASH && ids.has(e.ledgerId))
    .map((e) => ({ accountId: e.placeId!, currencyCode: e.currencyCode, date: e.date, amount: e.direction === "credit" ? e.amount : -e.amount }));
}

/** The الكاش entry of an entry whose money went into الكاش (null otherwise). */
export function repLedgerCashEntry(entry: RepLedgerEntry, ledger: RepLedger, repName: string) {
  if (entry.placeId !== REP_LEDGER_CASH) return null;
  return {
    kind: entry.direction === "credit" ? ("in" as const) : ("out" as const),
    amount: entry.amount,
    currencyCode: entry.currencyCode,
    date: entry.date,
    category: entry.direction === "credit" ? "إيداع مندوب" : "دفع لمندوب",
    note: `${repName} · ${ledger.name}${entry.note ? ` - ${entry.note}` : ""}`,
    sourceId: entry.id,
    sourceKind: "rep-ledger" as const,
  };
}

export function hasBotEntry(book: RepLedgerBook, botId: string | undefined): boolean {
  return Boolean(botId) && book.entries.some((e) => e.botId === botId);
}

// ---- 🤖 the money bot: his named accounts after his normal one ----

/** One line per account AND currency (an account in سيفا + أوقية is two lines with the same id). */
export interface RepLedgerSummary {
  id: string;
  name: string;
  icon: string;
  currencyCode: string;
  /** + = له (we owe him). */
  balance: number;
}

export function repLedgerSummaries(book: RepLedgerBook, repId: string): RepLedgerSummary[] {
  return repLedgersOf(book, repId).flatMap((l) =>
    l.currencies.map((code) => ({ id: l.id, name: l.name, icon: repLedgerKindMeta(l.kind).icon, currencyCode: code, balance: repLedgerBalance(book, l.id, code) })),
  );
}

// ---- storage (business data: a `starnet_` key, so the full backup carries it) ----

const KEY = "starnet_rep_ledgers_v1";

type StoredLedger = Omit<RepLedger, "currencies"> & { currencies?: unknown; currencyCode?: string };
type StoredEntry = Omit<RepLedgerEntry, "currencyCode"> & { currencyCode?: string };

/** Accounts saved before they had several currencies (one `currencyCode`) keep it as their only one,
 * and their entries are in it. */
export function normalizeRepLedgerBook(raw: { ledgers?: unknown; entries?: unknown } | null | undefined): RepLedgerBook {
  if (!raw || typeof raw !== "object") return EMPTY_REP_LEDGER_BOOK;
  const ledgers = (Array.isArray(raw.ledgers) ? (raw.ledgers as StoredLedger[]) : []).map(({ currencyCode, currencies, ...rest }) => {
    const list = Array.isArray(currencies) ? cleanCurrencies(currencies.filter((c): c is string => typeof c === "string")) : [];
    return { ...rest, currencies: list.length ? list : [currencyCode || "SIFA"] };
  });
  // 🛂 His Oct 19 2026 ask: the account he named «توثيق الأجهزه» belongs to the rep's verified
  // devices - an account named توثيق becomes the rep's «توثيق الأجهزة» (one per rep).
  const travelReps = new Set(ledgers.filter((l) => l.kind === "travel").map((l) => l.repId));
  for (const l of ledgers) {
    if (l.kind === "travel" || travelReps.has(l.repId) || !/توثيق/.test(l.name)) continue;
    l.kind = "travel";
    travelReps.add(l.repId);
  }
  const first = new Map(ledgers.map((l) => [l.id, l.currencies[0]!]));
  const entries = (Array.isArray(raw.entries) ? (raw.entries as StoredEntry[]) : []).map((e) => ({ ...e, currencyCode: e.currencyCode || first.get(e.ledgerId) || "SIFA" }));
  return { ledgers, entries };
}

export function loadRepLedgerBook(): RepLedgerBook {
  if (typeof window === "undefined") return EMPTY_REP_LEDGER_BOOK;
  try {
    return normalizeRepLedgerBook(JSON.parse(window.localStorage.getItem(KEY) ?? "null"));
  } catch {
    return EMPTY_REP_LEDGER_BOOK;
  }
}

export function saveRepLedgerBook(book: RepLedgerBook): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(book));
}
