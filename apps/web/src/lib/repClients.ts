/**
 * A representative's own customers (زبائن المندوب) - the operator's confirmed model:
 * - a whole customer (all his devices) belongs to one representative from a point in time on
 *   (Client.repSegments); before that point, or with no segment at all, he is ours (old model);
 * - for such a customer the REPRESENTATIVE alone owes us: every renewal on his devices is the rep's
 *   debt to us, and what the rep hands us settles it (a device payment tagged heldByRepId);
 * - the rep keeps his own book (دفتر المندوب) on the customer: each renewal is written there too,
 *   automatically, at the same price; the rep adds payments and "له/عليه" entries from his bot
 *   (RepBookEntry), with no approval - the operator only reads it. A payment the customer makes
 *   to the rep never changes what the rep owes us;
 * - moving a customer to another owner asks whether his balance so far moves with him (`carry`)
 *   or stays with the previous owner.
 *
 * Derive, don't store: both balances are computed by replaying the customer's device records, his
 * book entries and his segments in time order (simulateClient) - never kept as counters.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { Client, ClientStore, RepSegment } from "./clientStore";
import type { LedgerByAccount, LedgerCurrency, LedgerEntry } from "./ledgerStore";

const EPSILON = 0.005;
/** "↩️ تراجع" in the rep's bot works this long after the entry was recorded. */
export const REP_BOOK_UNDO_MS = 24 * 60 * 60 * 1000;

/** "" = the operator himself; otherwise a representative id. */
export type Owner = string;
export const OURS: Owner = "";

export type Balances = Record<string, number>;

// ---- Segments ----

export function currentRepOfClient(client: Pick<Client, "repSegments"> | undefined): string | undefined {
  const segments = client?.repSegments;
  if (!segments || segments.length === 0) return undefined;
  return segments[segments.length - 1]!.repId || undefined;
}

/** Hands the customer to `repId` (undefined = back to us) from `at` on. No-op when he already
 * belongs to that owner. `carry` = his balance so far goes with him. */
export function moveClientToOwner(client: Client, repId: string | undefined, carry: boolean, at: string): Client {
  if ((currentRepOfClient(client) ?? OURS) === (repId ?? OURS)) return client;
  // A customer who was always ours needs no "back to us" segment.
  if (!repId && !client.repSegments?.length) return client;
  const segment: RepSegment = { repId: repId || undefined, from: at, carry };
  return { ...client, repSegments: [...(client.repSegments ?? []), segment], updatedAt: at };
}

function ownerAt(segments: RepSegment[], at: string): { owner: Owner; index: number } {
  let index = -1;
  for (let i = 0; i < segments.length; i++) if (segments[i]!.from <= at) index = i;
  return { owner: index < 0 ? OURS : segments[index]!.repId ?? OURS, index };
}

// ---- The representative's book (دفتر المندوب) ----

/** charge = عليه (the customer owes the rep more), credit = له (less), payment = he paid the rep. */
export type RepBookKind = "charge" | "credit" | "payment";

export interface RepBookEntry {
  id: string;
  repId: string;
  clientId: string;
  kind: RepBookKind;
  amount: number;
  currency: LedgerCurrency;
  note?: string;
  /** Payment only: the channel (ledgerStore PaymentMethod) and the rep's transfer photo. */
  paymentMethod?: string;
  proofFileId?: string;
  proofBot?: string;
  date: string;
  createdAt: string;
}

const BOOK_KEY = "starnet_rep_book_v1";

export function loadRepBook(): RepBookEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(BOOK_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as RepBookEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveRepBook(book: RepBookEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BOOK_KEY, JSON.stringify(book));
}

export type RepBookInput = Omit<RepBookEntry, "id" | "createdAt"> & { id?: string; createdAt?: string };

/** Adds one entry the rep sent from his bot. The bot's own id is kept, so the same message
 * applied twice is recorded once, and "↩️ تراجع" can name it. */
export function addRepBookEntry(book: RepBookEntry[], input: RepBookInput): { ok: true; book: RepBookEntry[]; entry: RepBookEntry } | { ok: false; message: string } {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, message: "المبلغ يجب أن يكون أكبر من صفر" };
  if (input.id) {
    const existing = book.find((e) => e.id === input.id);
    if (existing) return { ok: true, book, entry: existing };
  }
  const entry: RepBookEntry = {
    ...input,
    id: input.id || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `rep-book-${Date.now()}-${Math.random()}`),
    note: input.note?.trim() || undefined,
    createdAt: input.createdAt || new Date().toISOString(),
  };
  return { ok: true, book: [...book, entry], entry };
}

/** "↩️ تراجع" from the rep's bot: removes his own entry, only within REP_BOOK_UNDO_MS. */
export function undoRepBookEntry(book: RepBookEntry[], id: string, repId: string, now: Date = new Date()): { ok: true; book: RepBookEntry[]; entry: RepBookEntry } | { ok: false; message: string } {
  const entry = book.find((e) => e.id === id);
  if (!entry) return { ok: false, message: "العملية غير موجودة أو أُلغيت من قبل" };
  if (entry.repId !== repId) return { ok: false, message: "هذه العملية ليست لك" };
  if (now.getTime() - Date.parse(entry.createdAt) > REP_BOOK_UNDO_MS) return { ok: false, message: "مضى أكثر من 24 ساعة - لا يمكن التراجع" };
  return { ok: true, book: book.filter((e) => e.id !== id), entry };
}

// ---- Replaying one customer ----

/** paidUs: the customer paid the operator directly - less on the rep's debt AND in his book. */
export type BookLineKind = "opening" | "renewal" | RepBookKind | "movedOut" | "paidUs";

/** One line of a rep's book on one customer, as the operator reads it. */
export interface BookLine {
  repId: string;
  kind: BookLineKind;
  /** Signed per currency: + the customer owes the rep more. */
  amounts: Balances;
  date: string;
  at: string;
  note?: string;
  bookEntryId?: string;
  accountId?: string;
}

export interface ClientReplay {
  /** What each owner (OURS or a rep) is owed by... for us: + = owed to us. Per currency. */
  owedToUs: Record<Owner, Balances>;
  /** The customer's balance in each rep's book: + = he owes the rep. */
  book: Record<string, Balances>;
  bookLines: BookLine[];
  /** Final owner of each device entry (the dated views: debt aging, statements). */
  entryOwner: Map<string, Owner>;
}

type Event =
  | { at: string; order: number; type: "segment"; index: number }
  | { at: string; order: number; type: "ledger"; entry: LedgerEntry; accountId: string }
  | { at: string; order: number; type: "book"; entry: RepBookEntry };

function add(target: Record<string, Balances>, owner: string, currency: string, amount: number): void {
  const row = (target[owner] ??= {});
  row[currency] = (row[currency] ?? 0) + amount;
}

function signedLedger(entry: LedgerEntry): number {
  return entry.kind === "debit" ? entry.amount : -entry.amount;
}

function signedBook(entry: RepBookEntry): number {
  return entry.kind === "charge" ? entry.amount : -entry.amount;
}

/** Replays one customer: his devices' records, his book entries and his segments, in time order. */
export function simulateClient(
  client: Pick<Client, "id" | "repSegments">,
  deviceEntries: { accountId: string; entry: LedgerEntry }[],
  bookEntries: RepBookEntry[],
): ClientReplay {
  const segments = client.repSegments ?? [];
  const events: Event[] = [];
  // At the same instant: the segment first, then the records made from it on.
  segments.forEach((segment, index) => events.push({ at: segment.from, order: 0, type: "segment", index }));
  for (const { accountId, entry } of deviceEntries) events.push({ at: entry.createdAt, order: 1, type: "ledger", entry, accountId });
  for (const entry of bookEntries) if (entry.clientId === client.id) events.push({ at: entry.createdAt, order: 2, type: "book", entry });
  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.order - b.order));

  const owedToUs: Record<Owner, Balances> = {};
  const book: Record<string, Balances> = {};
  const bookLines: BookLine[] = [];
  const held: Record<Owner, string[]> = {};
  const entryOwner = new Map<string, Owner>();
  let current: Owner = OURS;

  for (const event of events) {
    if (event.type === "segment") {
      const segment = segments[event.index]!;
      const previous = current;
      const next = segment.repId ?? OURS;
      current = next;
      if (!segment.carry || previous === next) continue;
      // His balance so far moves with him: on our side, and in the reps' books.
      const moved = owedToUs[previous] ?? {};
      for (const [currency, amount] of Object.entries(moved)) add(owedToUs, next, currency, amount);
      owedToUs[previous] = {};
      for (const id of held[previous] ?? []) entryOwner.set(id, next);
      held[next] = [...(held[next] ?? []), ...(held[previous] ?? [])];
      held[previous] = [];
      const date = segment.from.slice(0, 10);
      // What the customer really owes moves on: the previous rep's book, or - when he was ours -
      // what he owed us.
      const carried = previous === OURS ? { ...moved } : { ...(book[previous] ?? {}) };
      if (previous !== OURS) {
        const out = negate(book[previous] ?? {});
        if (nonZero(out)) bookLines.push({ repId: previous, kind: "movedOut", amounts: out, date, at: segment.from });
        book[previous] = {};
      }
      if (next !== OURS && nonZero(carried)) {
        for (const [currency, amount] of Object.entries(carried)) add(book, next, currency, amount);
        bookLines.push({ repId: next, kind: "opening", amounts: carried, date, at: segment.from });
      }
      continue;
    }
    if (event.type === "ledger") {
      const { entry, accountId } = event;
      const owner = entry.heldByRepId ?? ownerAt(segments, entry.createdAt).owner;
      add(owedToUs, owner, entry.currency, signedLedger(entry));
      (held[owner] ??= []).push(entry.id);
      entryOwner.set(entry.id, owner);
      // A renewal on his customer's device is written in the rep's book too, at the same price.
      if (owner !== OURS && entry.kind === "debit" && !entry.heldByRepId) {
        add(book, owner, entry.currency, entry.amount);
        bookLines.push({ repId: owner, kind: "renewal", amounts: { [entry.currency]: entry.amount }, date: entry.date, at: entry.createdAt, note: entry.note || undefined, accountId });
      }
      // His customer paid the operator directly: the rep owes us that much less (above), and the
      // customer owes the rep that much less too.
      if (owner !== OURS && entry.kind === "credit" && !entry.heldByRepId) {
        add(book, owner, entry.currency, -entry.amount);
        bookLines.push({ repId: owner, kind: "paidUs", amounts: { [entry.currency]: -entry.amount }, date: entry.date, at: entry.createdAt, note: entry.note || undefined, accountId });
      }
      continue;
    }
    const { entry } = event;
    add(book, entry.repId, entry.currency, signedBook(entry));
    bookLines.push({ repId: entry.repId, kind: entry.kind, amounts: { [entry.currency]: signedBook(entry) }, date: entry.date, at: entry.createdAt, note: entry.note, bookEntryId: entry.id });
  }
  return { owedToUs, book, bookLines, entryOwner };
}

function negate(balances: Balances): Balances {
  const result: Balances = {};
  for (const [currency, amount] of Object.entries(balances)) result[currency] = -amount;
  return result;
}

export function nonZero(balances: Balances | undefined): boolean {
  return Object.values(balances ?? {}).some((v) => Math.abs(v) > EPSILON);
}

export function cleanBalances(balances: Balances | undefined): Balances {
  const result: Balances = {};
  for (const [currency, amount] of Object.entries(balances ?? {})) if (Math.abs(amount) > EPSILON) result[currency] = amount;
  return result;
}

// ---- Across every customer ----

function liveDevicesOf(clientId: string, accounts: StarlinkAccountSummary[]): StarlinkAccountSummary[] {
  return accounts.filter((a) => a.clientId === clientId && !a.deletedAt);
}

function deviceEntriesOf(devices: StarlinkAccountSummary[], ledgerStore: LedgerByAccount): { accountId: string; entry: LedgerEntry }[] {
  return devices.flatMap((d) => (ledgerStore[d.id] ?? []).map((entry) => ({ accountId: d.id, entry })));
}

/** Every customer that ever belonged to a rep, replayed once. */
export function replayRepClients(
  clients: ClientStore,
  accounts: StarlinkAccountSummary[],
  ledgerStore: LedgerByAccount,
  book: RepBookEntry[],
): Map<string, ClientReplay> {
  const result = new Map<string, ClientReplay>();
  for (const client of Object.values(clients)) {
    if (!client.repSegments?.length && !book.some((e) => e.clientId === client.id)) continue;
    const devices = liveDevicesOf(client.id, accounts);
    result.set(client.id, simulateClient(client, deviceEntriesOf(devices, ledgerStore), book));
  }
  return result;
}

/** The device ledger as a debt to US: a rep customer's records that are the rep's debt are left
 * out (debt aging, reminders, "ديون الزبائن", totals). Everything else passes through untouched -
 * profit and cash never read this view. */
export function ourDebtLedger(
  ledgerStore: LedgerByAccount,
  accounts: StarlinkAccountSummary[],
  replays: Map<string, ClientReplay>,
): LedgerByAccount {
  if (replays.size === 0) return ledgerStore;
  const clientOf = new Map(accounts.map((a) => [a.id, a.clientId]));
  const result: LedgerByAccount = {};
  for (const [accountId, entries] of Object.entries(ledgerStore)) {
    const replay = replays.get(clientOf.get(accountId) ?? "");
    result[accountId] = replay ? entries.filter((e) => (replay.entryOwner.get(e.id) ?? OURS) === OURS) : entries;
  }
  return result;
}

/** ourDebtLedger for callers holding only the customers (their segments decide - the rep's book
 * plays no part in who owes us what). */
export function ourDebtLedgerForClients(
  ledgerStore: LedgerByAccount,
  accounts: StarlinkAccountSummary[],
  clients: Iterable<Pick<Client, "id" | "repSegments">>,
): LedgerByAccount {
  const replays = new Map<string, ClientReplay>();
  for (const client of clients) {
    if (!client.repSegments?.length) continue;
    replays.set(client.id, simulateClient(client, deviceEntriesOf(liveDevicesOf(client.id, accounts), ledgerStore), []));
  }
  return ourDebtLedger(ledgerStore, accounts, replays);
}

export interface RepClientRow {
  clientId: string;
  name: string;
  /** Still his customer now (false = a former one whose balance stayed with him). */
  current: boolean;
  /** + = the customer owes the rep (his book). */
  book: Balances;
  /** + = the rep owes us for this customer. */
  owedToUs: Balances;
  deviceCount: number;
}

/** "قائمة زبائن المندوب": his customers now, then former ones he still has a balance with. */
export function listRepClients(
  repId: string,
  clients: ClientStore,
  accounts: StarlinkAccountSummary[],
  replays: Map<string, ClientReplay>,
): RepClientRow[] {
  const rows: RepClientRow[] = [];
  for (const [clientId, replay] of replays) {
    const client = clients[clientId];
    if (!client) continue;
    const current = currentRepOfClient(client) === repId;
    const book = cleanBalances(replay.book[repId]);
    const owedToUs = cleanBalances(replay.owedToUs[repId]);
    if (!current && !nonZero(book) && !nonZero(owedToUs)) continue;
    rows.push({ clientId, name: client.name, current, book, owedToUs, deviceCount: liveDevicesOf(clientId, accounts).length });
  }
  return rows.sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name, "ar"));
}

/** One operation of a rep's customers that is the rep's debt to us (+) or settles it (−). */
export interface RepOperation {
  entryId: string;
  accountId: string;
  clientId: string;
  date: string;
  at: string;
  /** + renewal (he owes us more), − payment / handover (less). */
  amount: number;
  currency: string;
  /** He handed it to us himself (heldByRepId), rather than his customer paying us directly. */
  byRep: boolean;
  note?: string;
  /** What he owes us in that currency once this operation is counted. */
  balanceAfter: number;
}

/** 📒 «كل عمليات زبائنه»: every record on his customers' devices that is his debt to us (moved
 * onto him included), oldest first with the running balance - shown newest first. */
export function repOperations(
  repId: string,
  replays: Map<string, ClientReplay>,
  accounts: StarlinkAccountSummary[],
  ledgerStore: LedgerByAccount,
): RepOperation[] {
  const clientOf = new Map(accounts.map((a) => [a.id, a.clientId]));
  const rows: Omit<RepOperation, "balanceAfter">[] = [];
  for (const [accountId, entries] of Object.entries(ledgerStore)) {
    const clientId = clientOf.get(accountId);
    const replay = clientId ? replays.get(clientId) : undefined;
    if (!replay) continue;
    for (const entry of entries) {
      if (replay.entryOwner.get(entry.id) !== repId) continue;
      rows.push({
        entryId: entry.id, accountId, clientId: clientId!, date: entry.date, at: entry.createdAt,
        amount: signedLedger(entry), currency: entry.currency, byRep: entry.heldByRepId === repId,
        ...(entry.note ? { note: entry.note } : {}),
      });
    }
  }
  rows.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const running: Balances = {};
  const withBalance = rows.map((row) => {
    running[row.currency] = (running[row.currency] ?? 0) + row.amount;
    return { ...row, balanceAfter: running[row.currency]! };
  });
  return withBalance.reverse();
}

export function sumBalances(rows: Balances[]): Balances {
  const result: Balances = {};
  for (const row of rows) for (const [currency, amount] of Object.entries(row)) result[currency] = (result[currency] ?? 0) + amount;
  return cleanBalances(result);
}

// ---- "نقل ديون زبائنه عليه" ----

export interface RepTransferCandidate {
  clientId: string;
  name: string;
  /** What he owes us now (+) - becomes the rep's debt, and his opening in the rep's book. */
  balance: Balances;
  deviceCount: number;
}

/** Customers not yet in the new model whose live devices are ALL this rep's - what the button
 * moves onto him. A customer with devices of his own or of another rep too is «مختلط» (planRepUntangle). */
export function repTransferCandidates(
  repId: string,
  clients: ClientStore,
  accounts: StarlinkAccountSummary[],
  ledgerStore: LedgerByAccount,
): RepTransferCandidate[] {
  const rows: RepTransferCandidate[] = [];
  for (const client of Object.values(clients)) {
    if (client.repSegments?.length) continue;
    const devices = liveDevicesOf(client.id, accounts);
    if (devices.length === 0 || devices.some((d) => d.representativeId !== repId)) continue;
    const balance: Balances = {};
    for (const { entry } of deviceEntriesOf(devices, ledgerStore)) balance[entry.currency] = (balance[entry.currency] ?? 0) + signedLedger(entry);
    rows.push({ clientId: client.id, name: client.name, balance: cleanBalances(balance), deviceCount: devices.length });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/** A customer with devices of this rep AND devices that aren't (his own, or another rep's). */
export interface RepMixedClient {
  clientId: string;
  name: string;
  repDevices: { id: string; name: string }[];
  otherDevices: { id: string; name: string; repId?: string }[];
  balance: Balances;
}

/** A device of this rep with no customer: nobody to put its debt on yet. */
export interface RepLooseDevice {
  accountId: string;
  name: string;
  balance: Balances;
}

export interface RepUntanglePlan {
  /** All his - moved onto him in one go. */
  clean: RepTransferCandidate[];
  /** To review: «كله للمندوب» or leave him ours. */
  mixed: RepMixedClient[];
  /** To review: «👤 زبون باسم الجهاز» first. */
  loose: RepLooseDevice[];
}

function deviceBalance(entries: LedgerEntry[] | undefined): Balances {
  const balance: Balances = {};
  for (const entry of entries ?? []) balance[entry.currency] = (balance[entry.currency] ?? 0) + signedLedger(entry);
  return cleanBalances(balance);
}

/** 🔁 «كل زبائنه عليه»: everything still owed to us through this rep's devices, sorted into what
 * moves at once, and what the operator decides first. */
export function planRepUntangle(repId: string, clients: ClientStore, accounts: StarlinkAccountSummary[], ledgerStore: LedgerByAccount): RepUntanglePlan {
  const clean = repTransferCandidates(repId, clients, accounts, ledgerStore);
  const mixed: RepMixedClient[] = [];
  for (const client of Object.values(clients)) {
    if (client.repSegments?.length) continue;
    const devices = liveDevicesOf(client.id, accounts);
    const mine = devices.filter((d) => d.representativeId === repId);
    if (mine.length === 0 || mine.length === devices.length) continue;
    const balance: Balances = {};
    for (const { entry } of deviceEntriesOf(devices, ledgerStore)) balance[entry.currency] = (balance[entry.currency] ?? 0) + signedLedger(entry);
    mixed.push({
      clientId: client.id,
      name: client.name,
      repDevices: mine.map((d) => ({ id: d.id, name: d.name })),
      otherDevices: devices.filter((d) => d.representativeId !== repId).map((d) => ({ id: d.id, name: d.name, ...(d.representativeId ? { repId: d.representativeId } : {}) })),
      balance: cleanBalances(balance),
    });
  }
  const loose = accounts
    .filter((a) => a.representativeId === repId && !a.deletedAt && !a.archivedAt && (!a.clientId || !clients[a.clientId]))
    .map((a) => ({ accountId: a.id, name: a.name, balance: deviceBalance(ledgerStore[a.id]) }));
  return { clean, mixed: mixed.sort((a, b) => a.name.localeCompare(b.name, "ar")), loose };
}

/** When a device is given to a rep: our customer becomes the rep's (his balance with him) as soon
 * as all his live devices are that rep's. Null = nothing to do (mixed, already a rep's, or ours). */
export function autoMoveClientToRep(client: Client | undefined, accounts: StarlinkAccountSummary[], at: string): Client | null {
  if (!client) return null;
  const devices = liveDevicesOf(client.id, accounts);
  const reps = new Set(devices.map((d) => d.representativeId ?? OURS));
  if (devices.length === 0 || reps.size !== 1) return null;
  const repId = [...reps][0]!;
  // Only a customer who is ours now - from one rep to another, the client card asks about his balance.
  if (repId === OURS || currentRepOfClient(client) !== undefined) return null;
  return moveClientToOwner(client, repId, true, at);
}

/** The button itself: each customer now belongs to the rep, his balance moving with him. */
export function transferClientsToRep(clients: ClientStore, repId: string, clientIds: string[], at: string): ClientStore {
  const next = { ...clients };
  for (const id of clientIds) {
    const client = next[id];
    if (client) next[id] = moveClientToOwner(client, repId, true, at);
  }
  return next;
}

// ---- The rep hands us money ----

export interface HandoverAllocation {
  accountId: string;
  amount: number;
}

/** Money the rep hands us, spread over his customers' devices that still carry his debt (in that
 * currency), largest debt first. Anything beyond his debt is returned as `remainder` (recorded the
 * old way, a cash handover). */
export function planRepHandover(
  repId: string,
  amount: number,
  currency: string,
  accounts: StarlinkAccountSummary[],
  ledgerStore: LedgerByAccount,
  replays: Map<string, ClientReplay>,
): { allocations: HandoverAllocation[]; remainder: number } {
  const owedByDevice: { accountId: string; owed: number }[] = [];
  for (const account of accounts) {
    if (account.deletedAt || !account.clientId) continue;
    const replay = replays.get(account.clientId);
    if (!replay) continue;
    let owed = 0;
    for (const entry of ledgerStore[account.id] ?? []) {
      if (entry.currency !== currency || replay.entryOwner.get(entry.id) !== repId) continue;
      owed += signedLedger(entry);
    }
    if (owed > EPSILON) owedByDevice.push({ accountId: account.id, owed });
  }
  owedByDevice.sort((a, b) => b.owed - a.owed);
  const allocations: HandoverAllocation[] = [];
  let left = amount;
  for (const { accountId, owed } of owedByDevice) {
    if (left <= EPSILON) break;
    const take = Math.min(owed, left);
    allocations.push({ accountId, amount: Math.round(take * 100) / 100 });
    left -= take;
  }
  return { allocations, remainder: left > EPSILON ? Math.round(left * 100) / 100 : 0 };
}

/** A rep's CURRENT customers and their balance in his book (his bot shows these). */
export function repOwnClientBooks(
  repId: string,
  clients: ClientStore,
  accounts: StarlinkAccountSummary[],
  ledgerStore: LedgerByAccount,
  book: RepBookEntry[],
): { rows: RepClientRow[]; byClient: Map<string, Balances> } {
  const rows = listRepClients(repId, clients, accounts, replayRepClients(clients, accounts, ledgerStore, book)).filter((r) => r.current);
  return { rows, byClient: new Map(rows.map((r) => [r.clientId, r.book])) };
}
