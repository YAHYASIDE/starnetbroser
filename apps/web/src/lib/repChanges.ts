/**
 * 📤 «إرسال تسجيلاتي»: what the rep recorded on his phone since the operator's last copy (a new
 * device with its Starlink session, payments, shipments, customers, notes, promises…), sent to the
 * operator as one file encrypted with the rep's code. The operator's app applies it straight away
 * (the operator chose "يُثبَّت مباشرة") - but only inside the rep's own scope: his devices, their
 * operations and their customers. Nothing a rep sends can touch another rep's or the operator's
 * own records, and a rep never deletes a device or a customer from here.
 *
 * Pure helpers (tested) - the impure send / receive layers are repChangesSend.ts / repChangesApply.ts.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { decryptBackup, encryptBackup, type EncryptedBackup } from "./backupCrypto";
import type { Client } from "./clientStore";
import { autoMoveClientToRep, currentRepOfClient } from "./repClients";
import {
  ACCOUNTS_KEY,
  ADJUSTMENTS_KEY,
  ALLOCATIONS_KEY,
  CLIENTS_KEY,
  diffStore,
  LEDGER_KEY,
  NOTES_KEY,
  PREVIOUS_DEBTS_KEY,
  PROMISES_KEY,
  rebaseStore,
  recordHash,
  REP_BOOK_KEY,
  REP_STORES,
  type Shape,
  type StoreChanges,
  type StoreValues,
} from "./repWorkspace";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** One store's changes in a form that survives JSON. */
export interface StoreChangeSet {
  set: Record<string, Rec>;
  removed: string[];
}

/** storeKey -> its changes (only stores that changed). */
export type RepChangeSet = Record<string, StoreChangeSet>;

/** The business stores a rep may change (the operator's own values - rates, templates… - never). */
const CHANGE_STORES = REP_STORES.filter((s) => s.shape !== "value");

function shapeOf(key: string): Shape | undefined {
  return CHANGE_STORES.find((s) => s.key === key)?.shape;
}

const groupOf = (path: string) => path.slice(0, path.lastIndexOf("/"));

// ---- rep side ----

/** Everything the rep changed since `base` (his last copy). Device sync reads are not changes. */
export function buildRepChangeSet(current: StoreValues, base: StoreValues | null): RepChangeSet {
  const out: RepChangeSet = {};
  if (!base) return out;
  for (const { key, shape } of CHANGE_STORES) {
    const changes = diffStore(current[key], base[key], shape, key === ACCOUNTS_KEY);
    if (changes.set.size === 0 && changes.removed.size === 0) continue;
    out[key] = { set: Object.fromEntries(changes.set), removed: [...changes.removed] };
  }
  return out;
}

export function countRepChanges(changes: RepChangeSet): number {
  return Object.values(changes).reduce((sum, c) => sum + Object.keys(c.set).length + c.removed.length, 0);
}

/** Devices the rep created himself (their Starlink sessions travel with the file). */
export function newDeviceIds(changes: RepChangeSet, base: StoreValues | null): string[] {
  const before = new Set((Array.isArray(base?.[ACCOUNTS_KEY]) ? (base![ACCOUNTS_KEY] as Rec[]) : []).map((a) => String(a.id)));
  return Object.keys(changes[ACCOUNTS_KEY]?.set ?? {}).filter((id) => !before.has(id));
}

// ---- operator side ----

export interface RepChangesSummary {
  newDevices: number;
  editedDevices: number;
  payments: number;
  shipments: number;
  editedEntries: number;
  removedEntries: number;
  newClients: number;
  editedClients: number;
  other: number;
  /** Records outside the rep's scope, left out. */
  refused: number;
}

export interface ApplyRepChangesResult {
  stores: StoreValues;
  summary: RepChangesSummary;
  /** New devices, for restoring their Starlink sessions. */
  newDeviceIds: string[];
}

function emptySummary(): RepChangesSummary {
  return { newDevices: 0, editedDevices: 0, payments: 0, shipments: 0, editedEntries: 0, removedEntries: 0, newClients: 0, editedClients: 0, other: 0, refused: 0 };
}

function records(value: unknown, shape: Shape): Map<string, Rec> {
  const out = new Map<string, Rec>();
  if (shape === "list" && Array.isArray(value)) {
    for (const r of value) if (isRec(r)) out.set(String(r.id), r);
  } else if (shape === "map" && isRec(value)) {
    for (const [k, r] of Object.entries(value)) if (isRec(r)) out.set(k, r);
  } else if (shape === "groups" && isRec(value)) {
    for (const [g, list] of Object.entries(value)) {
      if (Array.isArray(list)) for (const r of list) if (isRec(r)) out.set(`${g}/${String(r.id)}`, r);
    }
  }
  return out;
}

/**
 * The rep's changes applied on the operator's stores, inside his scope only:
 * - devices: new ones (always his), or edits of devices that are his on the operator's phone;
 *   the freshest Starlink read is kept. Removing a device is never accepted.
 * - operations (ledger, allocations, previous debts): of his devices only. A new payment is marked
 *   as held by the rep (the money is with him - nothing goes into الصندوق).
 * - customers: new ones, or customers of his devices; notes / adjustments / promises of those.
 */
export function applyRepChangeSet(owner: StoreValues, changes: RepChangeSet, repId: string, now: Date = new Date()): ApplyRepChangesResult {
  const summary = emptySummary();
  const stores: StoreValues = {};

  // 1. Devices first - the scope of everything else.
  const ownerAccounts = records(owner[ACCOUNTS_KEY], "list");
  const accountChanges: StoreChanges = { set: new Map(), removed: new Set() };
  const created: string[] = [];
  for (const [id, mine] of Object.entries(changes[ACCOUNTS_KEY]?.set ?? {})) {
    const theirs = ownerAccounts.get(id);
    if (!theirs) {
      // 📱 marked for good: «أضافه المندوب» on its card, and the home filter.
      accountChanges.set.set(id, { ...mine, representativeId: repId, addedByRepId: repId, addedByRepAt: now.toISOString() });
      created.push(id);
      summary.newDevices++;
    } else if (theirs.representativeId === repId && !theirs.deletedAt) {
      // He can't move a device to someone else, nor delete / archive it from here.
      const { representativeId: _r, deletedAt: _d, archivedAt: _a, addedByRepId: _b, addedByRepAt: _c, ...rest } = mine;
      accountChanges.set.set(id, {
        ...rest,
        representativeId: repId,
        ...(theirs.archivedAt ? { archivedAt: theirs.archivedAt } : {}),
        ...(theirs.addedByRepId ? { addedByRepId: theirs.addedByRepId, addedByRepAt: theirs.addedByRepAt } : {}),
      });
      summary.editedDevices++;
    } else {
      summary.refused++;
    }
  }
  summary.refused += changes[ACCOUNTS_KEY]?.removed.length ?? 0;
  if (accountChanges.set.size > 0) stores[ACCOUNTS_KEY] = rebaseStore(accountChanges, owner[ACCOUNTS_KEY], "list", true);

  const accounts = records(stores[ACCOUNTS_KEY] ?? owner[ACCOUNTS_KEY], "list");
  const myAccounts = new Set([...accounts.values()].filter((a) => a.representativeId === repId && !a.deletedAt).map((a) => String(a.id)));
  const ownerClients = records(owner[CLIENTS_KEY], "map");
  const myClients = new Set([...accounts.values()].filter((a) => myAccounts.has(String(a.id)) && a.clientId).map((a) => String(a.clientId)));
  // A customer the rep created on this round is his too (his new device may point at it).
  for (const id of Object.keys(changes[CLIENTS_KEY]?.set ?? {})) if (!ownerClients.has(id)) myClients.add(id);

  const inScope: Record<string, (path: string, r: Rec | undefined) => boolean> = {
    [LEDGER_KEY]: (path) => myAccounts.has(groupOf(path)),
    [ALLOCATIONS_KEY]: (path) => myAccounts.has(groupOf(path)),
    [PREVIOUS_DEBTS_KEY]: (_p, r) => Boolean(r && myAccounts.has(String(r.accountId))),
    [CLIENTS_KEY]: (path) => myClients.has(path),
    [NOTES_KEY]: (path) => myClients.has(groupOf(path)),
    [ADJUSTMENTS_KEY]: (_p, r) => Boolean(r && r.partyKind === "client" && myClients.has(String(r.partyId))),
    [PROMISES_KEY]: (_p, r) => Boolean(r && ((r.clientId && myClients.has(String(r.clientId))) || r.repId === repId)),
  };

  // 🤝 His new devices: their customer becomes his once all the customer's devices are his - the
  // customer then owes us nothing, the rep owes us everything (repClients.ts).
  const at = now.toISOString();
  const changedClients = changes[CLIENTS_KEY]?.set ?? {};
  const clientRecord = (id: string) => (isRec(changedClients[id]) ? changedClients[id] : ownerClients.get(id));
  const liveAccounts = [...accounts.values()] as unknown as StarlinkAccountSummary[];
  const movedClients = new Map<string, Rec>();
  for (const id of created) {
    const clientId = accounts.get(id)?.clientId;
    if (typeof clientId !== "string" || movedClients.has(clientId)) continue;
    const moved = autoMoveClientToRep(clientRecord(clientId) as unknown as Client | undefined, liveAccounts, at);
    if (moved) movedClients.set(clientId, moved as unknown as Rec);
  }
  /** The customer is the rep's own now: what he pays the rep goes into the rep's book. */
  const isRepsOwnClient = (clientId: unknown) => {
    if (typeof clientId !== "string") return false;
    const client = (movedClients.get(clientId) ?? clientRecord(clientId)) as unknown as Client | undefined;
    return currentRepOfClient(client) === repId;
  };
  const bookEntries: Rec[] = [];

  // 2. Everything else, one store at a time.
  for (const [key, change] of Object.entries(changes)) {
    if (key === ACCOUNTS_KEY) continue;
    const shape = shapeOf(key);
    const allowed = inScope[key];
    if (!shape || !allowed) {
      summary.refused += Object.keys(change.set).length + change.removed.length;
      continue;
    }
    const before = records(owner[key], shape);
    const accepted: StoreChanges = { set: new Map(), removed: new Set() };
    for (const [path, mine] of Object.entries(change.set)) {
      const theirs = before.get(path);
      if (!isRec(mine) || !allowed(path, mine) || (theirs && !allowed(path, theirs))) {
        summary.refused++;
        continue;
      }
      let record = mine;
      if (key === LEDGER_KEY && !theirs) {
        if (mine.kind === "credit" && isRepsOwnClient(accounts.get(groupOf(path))?.clientId)) {
          // His own customer paid HIM: his book (same id), never less on what he owes us.
          const clientId = String(accounts.get(groupOf(path))!.clientId);
          bookEntries.push({
            id: mine.id, repId, clientId, kind: "payment", amount: num(mine.amount), currency: str(mine.currency),
            ...(str(mine.note) ? { note: str(mine.note) } : {}), ...(str(mine.paymentMethod) ? { paymentMethod: str(mine.paymentMethod) } : {}),
            date: str(mine.date), createdAt: str(mine.createdAt) || at,
          });
          summary.payments++;
          continue;
        }
        if (mine.kind === "credit") {
          record = { ...mine, heldByRepId: mine.heldByRepId ?? repId };
          summary.payments++;
        } else {
          summary.shipments++;
        }
      } else if (key === LEDGER_KEY) {
        summary.editedEntries++;
      } else if (key === CLIENTS_KEY) {
        if (theirs) summary.editedClients++;
        else summary.newClients++;
      } else if (key === PROMISES_KEY && !theirs) {
        record = { ...mine, repId: mine.repId ?? repId };
        summary.other++;
      } else {
        summary.other++;
      }
      accepted.set.set(path, record);
    }
    for (const path of change.removed) {
      const theirs = before.get(path);
      // A customer is never deleted from here; anything else only inside his scope.
      if (!theirs) continue;
      if (key === CLIENTS_KEY || !allowed(path, theirs)) {
        summary.refused++;
        continue;
      }
      accepted.removed.add(path);
      if (key === LEDGER_KEY) summary.removedEntries++;
      else summary.other++;
    }
    if (accepted.set.size === 0 && accepted.removed.size === 0) continue;
    stores[key] = rebaseStore(accepted, owner[key], shape);
  }

  if (movedClients.size > 0) {
    const map = { ...((stores[CLIENTS_KEY] ?? owner[CLIENTS_KEY] ?? {}) as Record<string, unknown>) };
    for (const [id, client] of movedClients) map[id] = client;
    stores[CLIENTS_KEY] = map;
  }
  if (bookEntries.length > 0) {
    const book = Array.isArray(owner[REP_BOOK_KEY]) ? (owner[REP_BOOK_KEY] as Rec[]) : [];
    const ids = new Set(bookEntries.map((e) => e.id));
    stores[REP_BOOK_KEY] = [...book.filter((e) => !ids.has(e.id)), ...bookEntries];
  }

  return { stores, summary, newDeviceIds: created };
}

/** "جهازان جديدان · 3 دفعات · …" - for the bot replies. */
export function describeRepChanges(s: RepChangesSummary): string {
  const parts: string[] = [];
  if (s.newDevices) parts.push(`📡 ${s.newDevices} جهاز جديد`);
  if (s.editedDevices) parts.push(`✏️ ${s.editedDevices} تعديل جهاز`);
  if (s.payments) parts.push(`💵 ${s.payments} دفعة`);
  if (s.shipments) parts.push(`📦 ${s.shipments} شحنة`);
  if (s.editedEntries) parts.push(`✏️ ${s.editedEntries} تعديل عملية`);
  if (s.removedEntries) parts.push(`🗑️ ${s.removedEntries} عملية محذوفة`);
  if (s.newClients) parts.push(`👤 ${s.newClients} زبون جديد`);
  if (s.editedClients) parts.push(`✏️ ${s.editedClients} تعديل زبون`);
  if (s.other) parts.push(`📝 ${s.other} أخرى`);
  return parts.length ? parts.join(" · ") : "لا شيء جديد";
}

export function totalApplied(s: RepChangesSummary): number {
  return s.newDevices + s.editedDevices + s.payments + s.shipments + s.editedEntries + s.removedEntries + s.newClients + s.editedClients + s.other;
}

// ---- operator side: reviewing, one item at a time ----

export { recordHash };

export type RepItemKind = "newDevice" | "deviceEdit" | "payment" | "shipment" | "entryEdit" | "entryRemove" | "newClient" | "clientEdit" | "other";

export interface RepItemPart {
  store: string;
  path: string;
  /** recordHash of the rep's version ("removed" for a removal). */
  hash: string;
}

/** One thing the operator approves or rejects: a new device (with everything recorded on it), a
 * payment, a shipment, a customer… */
export interface RepChangeItem {
  key: string;
  kind: RepItemKind;
  title: string;
  detail?: string;
  amount?: { value: number; currency: string };
  /** The device it belongs to, when there is one. */
  accountId?: string;
  parts: RepItemPart[];
}

const OTHER_TITLES: Record<string, string> = {
  [NOTES_KEY]: "📝 ملاحظة",
  [PROMISES_KEY]: "🤝 وعد دفع",
  [ADJUSTMENTS_KEY]: "⚖️ تعديل رصيد",
  [PREVIOUS_DEBTS_KEY]: "📒 دين سابق",
  [ALLOCATIONS_KEY]: "🔗 توزيع دفعة",
};

const partKey = (store: string, path: string) => `${store}|${path}`;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Everything in a rep's file, as items to review. Removing a device or a customer is never
 * offered (never accepted anyway). */
export function listRepChangeItems(changes: RepChangeSet, owner: StoreValues): RepChangeItem[] {
  const items: RepChangeItem[] = [];
  const used = new Set<string>();
  const take = (store: string, path: string, record: Rec | undefined): RepItemPart => {
    used.add(partKey(store, path));
    return { store, path, hash: recordHash(record) };
  };
  const ownerAccounts = records(owner[ACCOUNTS_KEY], "list");
  const ownerClients = records(owner[CLIENTS_KEY], "map");
  const ownerLedger = records(owner[LEDGER_KEY], "groups");
  const newAccounts = changes[ACCOUNTS_KEY]?.set ?? {};
  const newClients = changes[CLIENTS_KEY]?.set ?? {};
  const deviceName = (id: string) => str(newAccounts[id]?.name) || str(ownerAccounts.get(id)?.name) || "جهاز";
  const clientName = (id: unknown) => (typeof id === "string" ? str(newClients[id]?.name) || str(ownerClients.get(id)?.name) : "");
  const ledgerSet = changes[LEDGER_KEY]?.set ?? {};
  const allocations = changes[ALLOCATIONS_KEY]?.set ?? {};
  /** Allocations recorded with an entry travel with it. */
  const allocationsOf = (accountId: string, entryId: string) =>
    Object.entries(allocations)
      .filter(([path, a]) => groupOf(path) === accountId && (a.paymentEntryId === entryId || a.shipmentEntryId === entryId))
      .map(([path, a]) => take(ALLOCATIONS_KEY, path, a));

  // 1. Devices: a new one carries its customer (when new too) and every operation on it.
  for (const [id, account] of Object.entries(newAccounts)) {
    const theirs = ownerAccounts.get(id);
    if (theirs) {
      items.push({ key: `edit:${id}`, kind: "deviceEdit", title: `✏️ تعديل الجهاز ${deviceName(id)}`, accountId: id, parts: [take(ACCOUNTS_KEY, id, account)] });
      continue;
    }
    const parts = [take(ACCOUNTS_KEY, id, account)];
    const client = typeof account.clientId === "string" ? account.clientId : undefined;
    if (client && newClients[client] && !ownerClients.has(client)) parts.push(take(CLIENTS_KEY, client, newClients[client]));
    let ops = 0;
    for (const [path, entry] of Object.entries(ledgerSet)) {
      if (groupOf(path) !== id) continue;
      parts.push(take(LEDGER_KEY, path, entry), ...allocationsOf(id, String(entry.id)));
      ops++;
    }
    for (const [path, debt] of Object.entries(changes[PREVIOUS_DEBTS_KEY]?.set ?? {})) {
      if (String(debt.accountId) === id) parts.push(take(PREVIOUS_DEBTS_KEY, path, debt));
    }
    const name = clientName(account.clientId);
    items.push({
      key: `dev:${id}`,
      kind: "newDevice",
      title: `📡 جهاز جديد: ${deviceName(id)}`,
      detail: [name ? `👤 ${name}` : "", str(account.expectedEmail), ops ? `${ops} عملية معه` : ""].filter(Boolean).join(" · "),
      accountId: id,
      parts,
    });
  }

  // 2. Operations on devices already in the operator's list.
  for (const [path, entry] of Object.entries(ledgerSet)) {
    if (used.has(partKey(LEDGER_KEY, path))) continue;
    const accountId = groupOf(path);
    const edit = ownerLedger.has(path);
    const credit = entry.kind === "credit";
    const kind: RepItemKind = edit ? "entryEdit" : credit ? "payment" : "shipment";
    const label = edit ? "✏️ تعديل عملية" : credit ? "💵 دفعة" : "📦 شحنة";
    items.push({
      key: `led:${path}`,
      kind,
      title: `${label} · ${deviceName(accountId)}`,
      detail: [str(entry.date), str(entry.note)].filter(Boolean).join(" · "),
      amount: { value: num(entry.amount), currency: str(entry.currency) },
      accountId,
      parts: [take(LEDGER_KEY, path, entry), ...allocationsOf(accountId, String(entry.id))],
    });
  }
  for (const path of changes[LEDGER_KEY]?.removed ?? []) {
    const accountId = groupOf(path);
    const before = ownerLedger.get(path);
    if (!before) continue;
    const entryId = path.slice(path.lastIndexOf("/") + 1);
    const allocParts = (changes[ALLOCATIONS_KEY]?.removed ?? [])
      .filter((p) => groupOf(p) === accountId)
      .filter((p) => {
        const a = records(owner[ALLOCATIONS_KEY], "groups").get(p);
        return a && (a.paymentEntryId === entryId || a.shipmentEntryId === entryId);
      })
      .map((p) => take(ALLOCATIONS_KEY, p, undefined));
    items.push({
      key: `del:${path}`,
      kind: "entryRemove",
      title: `🗑️ حذف ${before.kind === "credit" ? "دفعة" : "شحنة"} · ${deviceName(accountId)}`,
      detail: str(before.date),
      amount: { value: num(before.amount), currency: str(before.currency) },
      accountId,
      parts: [take(LEDGER_KEY, path, undefined), ...allocParts],
    });
  }

  // 3. Customers.
  for (const [id, client] of Object.entries(newClients)) {
    if (used.has(partKey(CLIENTS_KEY, id))) continue;
    const edit = ownerClients.has(id);
    items.push({
      key: `cli:${id}`,
      kind: edit ? "clientEdit" : "newClient",
      title: `${edit ? "✏️ تعديل الزبون" : "👤 زبون جديد"}: ${str(client.name) || "زبون"}`,
      detail: str(client.phone),
      parts: [take(CLIENTS_KEY, id, client)],
    });
  }

  // 4. Anything else (notes, promises, adjustments, previous debts, lone allocations).
  for (const [store, change] of Object.entries(changes)) {
    if (store === ACCOUNTS_KEY || store === LEDGER_KEY || store === CLIENTS_KEY) continue;
    const title = OTHER_TITLES[store] ?? "📝 تسجيل";
    for (const [path, record] of Object.entries(change.set)) {
      if (used.has(partKey(store, path))) continue;
      items.push({
        key: `oth:${store}:${path}`,
        kind: "other",
        title,
        detail: [clientName(record.clientId ?? record.partyId), str(record.text ?? record.note), str(record.dueDate ?? record.date)].filter(Boolean).join(" · "),
        ...(record.amount !== undefined ? { amount: { value: num(record.amount), currency: str(record.currency ?? record.currencyCode) } } : {}),
        parts: [take(store, path, record)],
      });
    }
    for (const path of change.removed) {
      if (used.has(partKey(store, path))) continue;
      items.push({ key: `oth-del:${store}:${path}`, kind: "other", title: `🗑️ حذف ${title}`, parts: [take(store, path, undefined)] });
    }
  }
  return items;
}

/** store|path -> the operator's decision on that exact version. */
export type RepDecisions = Record<string, { hash: string; decision: "approved" | "rejected"; at: string }>;

export function isItemDecided(item: RepChangeItem, decisions: RepDecisions): boolean {
  return item.parts.every((p) => decisions[partKey(p.store, p.path)]?.hash === p.hash);
}

export function withDecision(decisions: RepDecisions, items: RepChangeItem[], decision: "approved" | "rejected", now: Date = new Date()): RepDecisions {
  const next = { ...decisions };
  for (const item of items) for (const p of item.parts) next[partKey(p.store, p.path)] = { hash: p.hash, decision, at: now.toISOString() };
  return next;
}

/** Only the chosen items' records, as a change set to apply. */
export function changeSetOf(changes: RepChangeSet, items: RepChangeItem[]): RepChangeSet {
  const out: RepChangeSet = {};
  for (const item of items) {
    for (const p of item.parts) {
      const target = (out[p.store] ??= { set: {}, removed: [] });
      const record = changes[p.store]?.set[p.path];
      if (p.hash === "removed") target.removed.push(p.path);
      else if (record) target.set[p.path] = record;
    }
  }
  return out;
}

/** What the rep is told: "📡 1 جهاز جديد · 💵 2 دفعة". */
export function describeItems(items: RepChangeItem[]): string {
  const labels: Record<RepItemKind, string> = {
    newDevice: "📡 جهاز جديد", deviceEdit: "✏️ تعديل جهاز", payment: "💵 دفعة", shipment: "📦 شحنة", entryEdit: "✏️ تعديل عملية",
    entryRemove: "🗑️ حذف عملية", newClient: "👤 زبون جديد", clientEdit: "✏️ تعديل زبون", other: "📝 أخرى",
  };
  const counts = new Map<RepItemKind, number>();
  for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  return [...counts].map(([kind, n]) => `${labels[kind]} ${n}`).join(" · ") || "لا شيء";
}

/** The rejected versions, for the rep's next copy: his phone then drops them (rep side, see
 * repWorkspace.rebaseWorkspace) - unless he changed them again since. */
export function rejectedVersions(decisions: RepDecisions): Record<string, string> {
  return Object.fromEntries(Object.entries(decisions).filter(([, d]) => d.decision === "rejected").map(([k, d]) => [k, d.hash]));
}

// ---- the file ----

/** «🔗 ربط هاتفي» before his first copy: the rep doesn't know his own id yet - the operator
 * takes it from the bot chat the file came from. */
export const PAIRING_REP = "pairing";

export interface RepChangesPayload {
  /** Unique per send - the operator's app applies each file once. */
  id: string;
  repId: string;
  sentAt: string;
  /** The copy the changes were made on. */
  baseSentAt?: string;
  changes: RepChangeSet;
  /** accountId (or "mail:<accountId>") -> its session, for the devices he created. */
  sessions: Record<string, Record<string, string>>;
  /** 🔗 His phone's own key: the operator binds his copies to it (repDeviceTransfer.ts). */
  phoneKey?: string;
}

interface RepChangesFile {
  kind: "starnet-rep-changes";
  v: 1;
  /** In clear so the operator's app knows whose code opens it (not a secret). */
  repId: string;
  enc: EncryptedBackup;
}

/** "starnet-changes-…" - the bot service recognises the prefix. */
export function repChangesFileName(repId: string, at: Date = new Date()): string {
  const slug = repId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "x";
  return `starnet-changes-${slug}-${at.getTime()}.json`;
}

export function isRepChangesFileName(fileName: string | undefined): boolean {
  return Boolean(fileName && fileName.toLowerCase().startsWith("starnet-changes-"));
}

export async function buildRepChangesFile(payload: RepChangesPayload, code: string): Promise<string> {
  const file: RepChangesFile = { kind: "starnet-rep-changes", v: 1, repId: payload.repId, enc: await encryptBackup(payload, code) };
  return JSON.stringify(file);
}

/** The rep the file says it's from, or null when it isn't a changes file. */
export function repChangesFileRep(text: string): string | null {
  try {
    const file = JSON.parse(text) as Partial<RepChangesFile>;
    return file?.kind === "starnet-rep-changes" && file.enc?.ciphertext && typeof file.repId === "string" ? file.repId : null;
  } catch {
    return null;
  }
}

export class NotAChangesFileError extends Error {
  constructor() {
    super("هذا ليس ملف تسجيلات من تطبيق المندوب");
    this.name = "NotAChangesFileError";
  }
}

/** Throws NotAChangesFileError for anything else, WrongPasswordError for another rep's code. */
export async function readRepChangesFile(text: string, code: string): Promise<RepChangesPayload> {
  const repId = repChangesFileRep(text);
  if (!repId) throw new NotAChangesFileError();
  const file = JSON.parse(text) as RepChangesFile;
  const payload = (await decryptBackup(file.enc, code)) as Partial<RepChangesPayload>;
  if (!payload?.id || payload.repId !== repId || !isRec(payload.changes)) throw new NotAChangesFileError();
  return { ...payload, sessions: payload.sessions ?? {} } as RepChangesPayload;
}
