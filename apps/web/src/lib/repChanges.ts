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

import { decryptBackup, encryptBackup, type EncryptedBackup } from "./backupCrypto";
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
export function applyRepChangeSet(owner: StoreValues, changes: RepChangeSet, repId: string): ApplyRepChangesResult {
  const summary = emptySummary();
  const stores: StoreValues = {};

  // 1. Devices first - the scope of everything else.
  const ownerAccounts = records(owner[ACCOUNTS_KEY], "list");
  const accountChanges: StoreChanges = { set: new Map(), removed: new Set() };
  const created: string[] = [];
  for (const [id, mine] of Object.entries(changes[ACCOUNTS_KEY]?.set ?? {})) {
    const theirs = ownerAccounts.get(id);
    if (!theirs) {
      accountChanges.set.set(id, { ...mine, representativeId: repId });
      created.push(id);
      summary.newDevices++;
    } else if (theirs.representativeId === repId && !theirs.deletedAt) {
      // He can't move a device to someone else, nor delete / archive it from here.
      const { representativeId: _r, deletedAt: _d, archivedAt: _a, ...rest } = mine;
      accountChanges.set.set(id, { ...rest, representativeId: repId, ...(theirs.archivedAt ? { archivedAt: theirs.archivedAt } : {}) });
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

// ---- the file ----

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
