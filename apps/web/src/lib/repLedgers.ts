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
 * Each account has ONE currency, fixed when it's made; its balance is derived from its entries
 * (+ = له / we owe him, − = عليه), never stored. Every entry is deletable. Pure, except load/save.
 */

export type RepLedgerKind = "trust" | "loan" | "free";

export const REP_LEDGER_KINDS: { kind: RepLedgerKind; icon: string; label: string; hint: string }[] = [
  { kind: "trust", icon: "🔒", label: "أمانة / وديعة", hint: "مال أحدكما عند الآخر للحفظ - لا علاقة له بالربح." },
  { kind: "loan", icon: "🤝", label: "سلفة / دين", hint: "تتسلف منه أو يتسلف منك - لا علاقة له بالربح." },
  { kind: "free", icon: "📒", label: "حساب حر", hint: "أي حساب باسمك (شهر 10، شحن الأجهزة…) - لا علاقة له بالربح." },
];

export function repLedgerKindMeta(kind: RepLedgerKind) {
  return REP_LEDGER_KINDS.find((k) => k.kind === kind) ?? REP_LEDGER_KINDS[2]!;
}

export interface RepLedger {
  id: string;
  repId: string;
  name: string;
  kind: RepLedgerKind;
  /** Fixed when it's made - an entry is always in it. */
  currencyCode: string;
  createdAt: string;
}

export interface RepLedgerEntry {
  id: string;
  ledgerId: string;
  /** credit = «له» (+), debit = «عليه» (−). */
  direction: "credit" | "debit";
  amount: number;
  /** yyyy-mm-dd */
  date: string;
  note?: string;
  /** The balance he brought from his old ledger app («رصيد افتتاحي»). */
  opening?: true;
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
  currencyCode: string;
  /** The balance it starts with (from his old ledger app). */
  opening?: { direction: "credit" | "debit"; amount: number; date: string };
}

export function createRepLedger(book: RepLedgerBook, input: NewRepLedgerInput, now = new Date()): RepLedgerResult {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, message: "اكتب اسم الحساب" };
  if (!input.currencyCode) return { ok: false, message: "اختر العملة" };
  if (book.ledgers.some((l) => l.repId === input.repId && sameName(l.name, name))) return { ok: false, message: `يوجد حساب بنفس الاسم «${name}»` };
  const ledger: RepLedger = { id: newId("rl"), repId: input.repId, name, kind: input.kind, currencyCode: input.currencyCode, createdAt: now.toISOString() };
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

/** The account and all its entries. */
export function deleteRepLedger(book: RepLedgerBook, id: string): RepLedgerBook {
  return { ledgers: book.ledgers.filter((l) => l.id !== id), entries: book.entries.filter((e) => e.ledgerId !== id) };
}

export type RepLedgerEntryResult = { ok: true; book: RepLedgerBook; entry: RepLedgerEntry } | { ok: false; message: string };

export function addRepLedgerEntry(
  book: RepLedgerBook,
  ledgerId: string,
  input: { direction: "credit" | "debit"; amount: number; date: string; note?: string; opening?: boolean },
  now = new Date(),
): RepLedgerEntryResult {
  if (!book.ledgers.some((l) => l.id === ledgerId)) return { ok: false, message: "الحساب غير موجود" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, message: "اكتب المبلغ" };
  if (!DATE_RE.test(input.date)) return { ok: false, message: "اختر التاريخ" };
  const entry: RepLedgerEntry = {
    id: newId("rle"),
    ledgerId,
    direction: input.direction,
    amount: Math.round(input.amount * 100) / 100,
    date: input.date,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(input.opening ? { opening: true as const } : {}),
    createdAt: now.toISOString(),
  };
  return { ok: true, book: { ...book, entries: [...book.entries, entry] }, entry };
}

export function deleteRepLedgerEntry(book: RepLedgerBook, entryId: string): RepLedgerBook {
  return { ...book, entries: book.entries.filter((e) => e.id !== entryId) };
}

const signed = (e: RepLedgerEntry) => (e.direction === "credit" ? e.amount : -e.amount);

/** + = له (we owe him), − = عليه. */
export function repLedgerBalance(book: RepLedgerBook, ledgerId: string): number {
  const total = book.entries.filter((e) => e.ledgerId === ledgerId).reduce((sum, e) => sum + signed(e), 0);
  return Math.abs(total) < EPS ? 0 : Math.round(total * 100) / 100;
}

export interface RepLedgerLine {
  entry: RepLedgerEntry;
  /** Signed: + له, − عليه. */
  amount: number;
  /** The account's balance right after it. */
  after: number;
}

/** The account's statement, newest first, each line with the balance after it (dated order). */
export function repLedgerLines(book: RepLedgerBook, ledgerId: string): RepLedgerLine[] {
  const entries = book.entries
    .filter((e) => e.ledgerId === ledgerId)
    .sort((a, b) => a.date.localeCompare(b.date) || Number(Boolean(b.opening)) - Number(Boolean(a.opening)) || a.createdAt.localeCompare(b.createdAt));
  let running = 0;
  const lines = entries.map((entry) => {
    running += signed(entry);
    return { entry, amount: signed(entry), after: Math.round(running * 100) / 100 };
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
    const balance = repLedgerBalance(book, l.id);
    if (Math.abs(balance) >= EPS) out[l.currencyCode] = Math.round(((out[l.currencyCode] ?? 0) + balance) * 100) / 100;
  }
  return out;
}

/** 🧹 The له / عليه that brings the account back to 0 (null when it already is). */
export function repLedgerZeroEntry(balance: number): { direction: "credit" | "debit"; amount: number } | null {
  if (Math.abs(balance) < EPS) return null;
  return { direction: balance < 0 ? "credit" : "debit", amount: Math.round(Math.abs(balance) * 100) / 100 };
}

// ---- storage (business data: a `starnet_` key, so the full backup carries it) ----

const KEY = "starnet_rep_ledgers_v1";

export function loadRepLedgerBook(): RepLedgerBook {
  if (typeof window === "undefined") return EMPTY_REP_LEDGER_BOOK;
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<RepLedgerBook> | null;
    if (!raw || typeof raw !== "object") return EMPTY_REP_LEDGER_BOOK;
    return { ledgers: Array.isArray(raw.ledgers) ? raw.ledgers : [], entries: Array.isArray(raw.entries) ? raw.entries : [] };
  } catch {
    return EMPTY_REP_LEDGER_BOOK;
  }
}

export function saveRepLedgerBook(book: RepLedgerBook): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(book));
}
