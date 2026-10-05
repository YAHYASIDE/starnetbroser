/**
 * 📱 The rep's phone as a full STAR NET (rep workspace): the operator's copy (lib/repCopy.ts)
 * carries the rep's slice of the business stores - his devices, their operations, his customers,
 * the rates - and the rep's app writes them into the very same `starnet_` keys the app always
 * reads, so every page and card looks and works exactly like the operator's.
 *
 * What the rep records himself (a payment, a device, a customer…) is a change against the last
 * copy ("the base"). It stays ⏳ pending - shown on its card - and is never lost: when a newer
 * copy arrives, the rep's changes are re-applied on top of it (a rebase). Values the operator
 * alone controls (rates, message templates…) are simply replaced.
 *
 * Pure functions + a small impure layer over localStorage at the bottom.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";

/** How a store's records are laid out, so they can be compared one record at a time. */
export type Shape =
  /** [{ id }] */
  | "list"
  /** { id: record } */
  | "map"
  /** { group: [{ id }] } - e.g. ledger entries per device */
  | "groups"
  /** owned by the operator: replaced whole, never edited by the rep */
  | "value";

export const ACCOUNTS_KEY = "starnet_demo_accounts_v1";
export const LEDGER_KEY = "starnet_customer_ledger_v1";
export const ALLOCATIONS_KEY = "starnet_payment_allocations_v1";
export const CLIENTS_KEY = "starnet_clients_v1";
export const ADJUSTMENTS_KEY = "starnet_party_adjustments_v1";
export const NOTES_KEY = "starnet_client_notes_v1";
export const PROMISES_KEY = "starnet_payment_promises_v1";
export const PREVIOUS_DEBTS_KEY = "starnet_previous_debts_v1";
const CURRENCIES_KEY = "starnet_currencies_v1";
const TEMPLATES_KEY = "starnet_message_templates_v1";
const PROFILE_KEY = "starnet_business_profile_v1";
const REPS_KEY = "starnet_representatives_v1";
const INVOICES_KEY = "starnet_store_invoices_v1";
const SETTLEMENTS_KEY = "starnet_rep_settlements_v1";
export const REP_BOOK_KEY = "starnet_rep_book_v1";
/** His share's operations on devices no longer his (moved, deleted): only the entries carrying
 * his share, with the device's name - so «تقاريري» matches the operator's statement of him. */
export const PAST_LEDGER_KEY = "starnet_rep_past_ledger_v1";

export const REP_STORES: { key: string; shape: Shape }[] = [
  { key: ACCOUNTS_KEY, shape: "list" },
  { key: LEDGER_KEY, shape: "groups" },
  { key: ALLOCATIONS_KEY, shape: "groups" },
  { key: CLIENTS_KEY, shape: "map" },
  { key: ADJUSTMENTS_KEY, shape: "list" },
  { key: NOTES_KEY, shape: "groups" },
  { key: PROMISES_KEY, shape: "list" },
  { key: PREVIOUS_DEBTS_KEY, shape: "list" },
  { key: CURRENCIES_KEY, shape: "value" },
  { key: TEMPLATES_KEY, shape: "value" },
  { key: PROFILE_KEY, shape: "value" },
  { key: REPS_KEY, shape: "value" },
  { key: INVOICES_KEY, shape: "value" },
  // 📊 «تقاريري»: his settlements with the operator and his customers' book - the operator's.
  { key: SETTLEMENTS_KEY, shape: "value" },
  { key: REP_BOOK_KEY, shape: "value" },
  { key: PAST_LEDGER_KEY, shape: "value" },
];

export type StoreValues = Record<string, unknown>;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const asList = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter(isRec) : []);
const asMap = (v: unknown): Record<string, unknown> => (isRec(v) ? v : {});

// ---- operator side: the rep's slice ----

/** Only what belongs to the rep: his devices and their records, their customers, and the
 * operator's shared settings (rates, templates, business name, the rep himself). */
export function repStoreSlice(stores: StoreValues, repId: string): StoreValues {
  const accounts = asList(stores[ACCOUNTS_KEY]).filter(
    (a) => a.representativeId === repId && !a.deletedAt && !a.archivedAt,
  ) as unknown as StarlinkAccountSummary[];
  const accountIds = new Set(accounts.map((a) => a.id));
  const clientIds = new Set(accounts.map((a) => a.clientId).filter((id): id is string => Boolean(id)));
  const pick = (v: unknown, keep: Set<string>) => Object.fromEntries(Object.entries(asMap(v)).filter(([k]) => keep.has(k)));
  const reps = asMap(stores[REPS_KEY]);
  return {
    [ACCOUNTS_KEY]: accounts,
    [LEDGER_KEY]: pick(stores[LEDGER_KEY], accountIds),
    [ALLOCATIONS_KEY]: pick(stores[ALLOCATIONS_KEY], accountIds),
    [CLIENTS_KEY]: pick(stores[CLIENTS_KEY], clientIds),
    [ADJUSTMENTS_KEY]: asList(stores[ADJUSTMENTS_KEY]).filter((a) => a.partyKind === "client" && clientIds.has(String(a.partyId))),
    [NOTES_KEY]: pick(stores[NOTES_KEY], clientIds),
    [PROMISES_KEY]: asList(stores[PROMISES_KEY]).filter((p) => (p.clientId && clientIds.has(String(p.clientId))) || p.repId === repId),
    [PREVIOUS_DEBTS_KEY]: asList(stores[PREVIOUS_DEBTS_KEY]).filter((d) => accountIds.has(String(d.accountId))),
    [CURRENCIES_KEY]: stores[CURRENCIES_KEY] ?? {},
    [TEMPLATES_KEY]: stores[TEMPLATES_KEY] ?? null,
    [PROFILE_KEY]: stores[PROFILE_KEY] ?? null,
    [REPS_KEY]: reps[repId] ? { [repId]: reps[repId] } : {},
    [INVOICES_KEY]: asList(stores[INVOICES_KEY]).filter((i) => i.representativeId === repId || (i.clientId && clientIds.has(String(i.clientId)))),
    [SETTLEMENTS_KEY]: asList(stores[SETTLEMENTS_KEY]).filter((x) => x.representativeId === repId),
    [REP_BOOK_KEY]: asList(stores[REP_BOOK_KEY]).filter((x) => x.repId === repId),
    [PAST_LEDGER_KEY]: pastLedger(stores, accountIds, repId),
  };
}

export interface PastLedger {
  ledger: Record<string, Rec[]>;
  names: Record<string, string>;
}

function pastLedger(stores: StoreValues, current: Set<string>, repId: string): PastLedger {
  const names = new Map(asList(stores[ACCOUNTS_KEY]).map((a) => [String(a.id), String(a.name ?? "")]));
  const out: PastLedger = { ledger: {}, names: {} };
  for (const [accountId, list] of Object.entries(asMap(stores[LEDGER_KEY]))) {
    if (current.has(accountId)) continue;
    const mine = asList(list).filter((e) => e.representativeId === repId);
    if (mine.length === 0) continue;
    out.ledger[accountId] = mine;
    out.names[accountId] = names.get(accountId) || "جهاز سابق";
  }
  return out;
}

/** A short fingerprint of a record (or "removed") - an operator's decision on a rep's change holds
 * only for that exact version (lib/repChanges.ts). */
export function recordHash(record: unknown): string {
  if (record === undefined) return "removed";
  const text = JSON.stringify(record);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(36)}.${text.length}`;
}

// ---- record-level compare / rebase ----

/** Fields the device's own Starlink sync writes - never a "change" the rep made: the newest read
 * (by lastSuccessfulScanAt) wins on a rebase instead. */
const SYNC_FIELDS = [
  "accountNumber", "balanceDue", "currency", "dataUsageGb", "dishAlerts", "dishStatus", "dotTrace", "isRestricted",
  "lastSuccessfulScanAt", "lastUpdated", "limitedAccess", "movingRestricted", "noSubscription", "oceanMode",
  "pendingCancellationDate", "planName", "priorityDataExhausted", "rechargeDate", "serialNumber", "serviceCountry",
  "serviceStatus", "starlinkAccountEmail", "starlinkAccountHolderName", "starlinkId", "subscriptionId", "subscriptions",
  "wifiStatus", "alertReason",
];

function withoutSync(record: Rec): Rec {
  const copy: Rec = { ...record };
  for (const f of SYNC_FIELDS) delete copy[f];
  return copy;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** "path" -> record, so two versions of a store can be compared record by record. */
export function flatten(value: unknown, shape: Shape): Map<string, Rec> {
  const out = new Map<string, Rec>();
  if (shape === "list") {
    for (const r of asList(value)) out.set(String(r.id), r);
  } else if (shape === "map") {
    for (const [k, r] of Object.entries(asMap(value))) {
      if (isRec(r)) out.set(k, r);
    }
  } else if (shape === "groups") {
    for (const [group, list] of Object.entries(asMap(value))) {
      for (const r of asList(list)) out.set(`${group}/${String(r.id)}`, r);
    }
  }
  return out;
}

function unflatten(records: Map<string, Rec>, shape: Shape, keepGroups: string[] = []): unknown {
  if (shape === "list") return Array.from(records.values());
  if (shape === "map") return Object.fromEntries(records);
  const groups: Record<string, Rec[]> = Object.fromEntries(keepGroups.map((g) => [g, []]));
  for (const [path, r] of records) {
    const group = path.slice(0, path.lastIndexOf("/"));
    (groups[group] ??= []).push(r);
  }
  return groups;
}

export interface StoreChanges {
  /** path -> the rep's version (added or edited). */
  set: Map<string, Rec>;
  /** paths the rep deleted. */
  removed: Set<string>;
}

/** What the rep changed in one store since `base`. Device sync fields are not changes. */
export function diffStore(current: unknown, base: unknown, shape: Shape, ignoreSync = false): StoreChanges {
  const now = flatten(current, shape);
  const before = flatten(base, shape);
  const changes: StoreChanges = { set: new Map(), removed: new Set() };
  const strip = (r: Rec) => (ignoreSync ? withoutSync(r) : r);
  for (const [path, r] of now) {
    const old = before.get(path);
    if (!old || !same(strip(old), strip(r))) changes.set.set(path, r);
  }
  for (const path of before.keys()) if (!now.has(path)) changes.removed.add(path);
  return changes;
}

/**
 * A device both sides changed since the last copy, merged field by field: the operator's news
 * (renewal date, name, plan…) is taken, and what the rep changed that the operator didn't stays.
 * His customer link always stays (his Oct 2026 rule: «زبون المندوب يغلب») - a new copy never takes
 * the rep's customers off his devices. Starlink-read fields are left to keepFreshestReads.
 */
export function mergeDevice(mine: Rec, before: Rec, theirs: Rec): Rec {
  const merged: Rec = { ...theirs };
  for (const k of new Set([...Object.keys(mine), ...Object.keys(before)])) {
    if (SYNC_FIELDS.includes(k) || same(mine[k], before[k])) continue;
    if (k === "clientId" || same(theirs[k], before[k])) {
      if (k in mine) merged[k] = mine[k];
      else delete merged[k];
    }
  }
  return merged;
}

/** The rep's changes re-applied on top of a newer base. For devices, the freshest Starlink read
 * (sync fields) is kept, whichever side it came from. */
export function rebaseStore(changes: StoreChanges, nextBase: unknown, shape: Shape, ignoreSync = false): unknown {
  const records = flatten(nextBase, shape);
  for (const path of changes.removed) records.delete(path);
  for (const [path, mine] of changes.set) {
    const theirs = records.get(path);
    if (ignoreSync && theirs && String(theirs.lastSuccessfulScanAt ?? "") > String(mine.lastSuccessfulScanAt ?? "")) {
      const merged: Rec = { ...mine };
      for (const f of SYNC_FIELDS) {
        if (f in theirs) merged[f] = theirs[f];
        else delete merged[f];
      }
      records.set(path, merged);
    } else {
      records.set(path, mine);
    }
  }
  const groups = shape === "groups" ? Object.keys(asMap(nextBase)) : [];
  return unflatten(records, shape, groups);
}

/** A device this phone read from Starlink more recently than the copy keeps its own read. */
function keepFreshestReads(merged: unknown, current: unknown): unknown {
  const mine = flatten(current, "list");
  return asList(merged).map((r) => {
    const local = mine.get(String(r.id));
    if (!local || String(local.lastSuccessfulScanAt ?? "") <= String(r.lastSuccessfulScanAt ?? "")) return r;
    const fresh: Rec = { ...r };
    for (const f of SYNC_FIELDS) {
      if (f in local) fresh[f] = local[f];
      else delete fresh[f];
    }
    return fresh;
  });
}

/** Every store after a new copy: the operator's newer data with the rep's pending changes kept. */
export function rebaseWorkspace(
  current: StoreValues,
  oldBase: StoreValues | null,
  nextBase: StoreValues,
  /** store|path -> the version the operator rejected: dropped here unless changed again since. */
  rejected: Record<string, string> = {},
  /** The rep edited his own business profile (name, numbers, payment methods): it stays. */
  keepOwnProfile = false,
): StoreValues {
  const result: StoreValues = {};
  for (const { key, shape } of REP_STORES) {
    if (!(key in nextBase)) continue;
    if (key === PROFILE_KEY && keepOwnProfile && current[PROFILE_KEY] != null) {
      result[key] = current[PROFILE_KEY];
      continue;
    }
    if (shape === "value" || !oldBase) {
      result[key] = nextBase[key];
      continue;
    }
    const ignoreSync = key === ACCOUNTS_KEY;
    const changes = diffStore(current[key], oldBase[key], shape, ignoreSync);
    // A record the operator now has differently from the old copy was taken in by him (or changed
    // after): his version wins and it's no longer pending - e.g. a payment he recorded from the
    // rep's «تسجيلاتي» (with heldByRepId added).
    const theirsBefore = flatten(oldBase[key], shape);
    const theirsNow = flatten(nextBase[key], shape);
    const strip = (r: Rec | undefined) => (r && ignoreSync ? withoutSync(r) : r);
    for (const path of [...changes.set.keys()]) {
      const now = theirsNow.get(path);
      const before = theirsBefore.get(path);
      if (!now || same(strip(now), strip(before))) continue;
      // A device both sides changed: merged field by field, the rep's customer link kept.
      if (key === ACCOUNTS_KEY && before) {
        const merged = mergeDevice(changes.set.get(path)!, before, now);
        if (same(strip(merged), strip(now))) changes.set.delete(path);
        else changes.set.set(path, merged);
      } else {
        changes.set.delete(path);
      }
    }
    // A payment of his own customer the operator approved lives in his book now (same id).
    if (key === LEDGER_KEY) {
      const booked = new Set(asList(nextBase[REP_BOOK_KEY]).map((e) => String(e.id)));
      for (const path of [...changes.set.keys()]) if (booked.has(path.slice(path.lastIndexOf("/") + 1))) changes.set.delete(path);
    }
    // ❌ What the operator rejected leaves the rep's phone (the exact version he sent).
    for (const [path, mine] of [...changes.set]) if (rejected[`${key}|${path}`] === recordHash(mine)) changes.set.delete(path);
    for (const path of [...changes.removed]) if (rejected[`${key}|${path}`] === "removed") changes.removed.delete(path);
    if (key === ACCOUNTS_KEY) {
      // A device the operator took away (moved to another rep) leaves - even if the rep edited it;
      // a device the rep created himself stays.
      const keep = flatten(nextBase[key], shape);
      const before = flatten(oldBase[key], shape);
      for (const path of [...changes.set.keys()]) if (!keep.has(path) && before.has(path)) changes.set.delete(path);
    }
    result[key] = rebaseStore(changes, nextBase[key], shape, ignoreSync);
    if (key === ACCOUNTS_KEY) result[key] = keepFreshestReads(result[key], current[key]);
  }
  // Operations of devices no longer on the phone go with them.
  if (oldBase && Array.isArray(result[ACCOUNTS_KEY])) {
    const ids = new Set(asList(result[ACCOUNTS_KEY]).map((a) => String(a.id)));
    for (const key of [LEDGER_KEY, ALLOCATIONS_KEY]) {
      if (isRec(result[key])) result[key] = Object.fromEntries(Object.entries(result[key] as Rec).filter(([id]) => ids.has(id)));
    }
  }
  return result;
}

/** ⏳ What the rep recorded that the operator hasn't confirmed yet. */
export interface RepPending {
  /** Devices added/edited by the rep, or with an operation he recorded. */
  accountIds: Set<string>;
  clientIds: Set<string>;
  /** Ledger entries he added/edited (accountId/entryId). */
  entryPaths: Set<string>;
  count: number;
}

export function repPending(current: StoreValues, base: StoreValues | null): RepPending {
  const pending: RepPending = { accountIds: new Set(), clientIds: new Set(), entryPaths: new Set(), count: 0 };
  if (!base) return pending;
  const accounts = diffStore(current[ACCOUNTS_KEY], base[ACCOUNTS_KEY], "list", true);
  for (const id of accounts.set.keys()) pending.accountIds.add(id);
  const ledger = diffStore(current[LEDGER_KEY], base[LEDGER_KEY], "groups");
  for (const path of [...ledger.set.keys(), ...ledger.removed]) {
    pending.entryPaths.add(path);
    pending.accountIds.add(path.slice(0, path.lastIndexOf("/")));
  }
  const clients = diffStore(current[CLIENTS_KEY], base[CLIENTS_KEY], "map");
  for (const id of clients.set.keys()) pending.clientIds.add(id);
  pending.count = accounts.set.size + accounts.removed.size + ledger.set.size + ledger.removed.size + clients.set.size + clients.removed.size;
  return pending;
}

// ---- the rep's phone: localStorage ----

/** The last copy as it arrived - internal, never backed up (not a `starnet_` key). */
const BASE_KEY = "starnet.repBase";

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

export function readStores(): StoreValues {
  const values: StoreValues = {};
  for (const { key } of REP_STORES) {
    const v = readJson(key);
    if (v !== undefined) values[key] = v;
  }
  return values;
}

export function loadRepBase(): StoreValues | null {
  const base = readJson(BASE_KEY);
  return isRec(base) ? base : null;
}

/** True once a copy with stores has been applied: the full app runs on the rep's data. */
export function hasRepWorkspace(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(BASE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Applies a new copy's stores, keeping the rep's pending changes. False when storage is full. */
export function applyRepWorkspace(nextBase: StoreValues, rejected: Record<string, string> = {}): boolean {
  const merged = rebaseWorkspace(readStores(), loadRepBase(), nextBase, rejected, hasOwnRepProfile());
  try {
    for (const [key, value] of Object.entries(merged)) {
      if (value === null || value === undefined) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify(value));
    }
    window.localStorage.setItem(BASE_KEY, JSON.stringify(nextBase));
    return true;
  } catch {
    return false;
  }
}

const OWN_PROFILE_KEY = "starnet.repOwnProfile";

/** The rep saved his own «بيانات النشاط»: a new copy from the operator no longer replaces it. */
export function hasOwnRepProfile(): boolean {
  try {
    return window.localStorage.getItem(OWN_PROFILE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setOwnRepProfile(own: boolean): void {
  try {
    if (own) window.localStorage.setItem(OWN_PROFILE_KEY, "1");
    else window.localStorage.removeItem(OWN_PROFILE_KEY);
  } catch {
    // storage unavailable - the operator's profile simply applies
  }
}

/** Leaving rep mode clears the workspace (the operator's data must not stay on the phone). */
export function clearRepWorkspace(): void {
  try {
    for (const { key } of REP_STORES) window.localStorage.removeItem(key);
    window.localStorage.removeItem(BASE_KEY);
    window.localStorage.removeItem(OWN_PROFILE_KEY);
  } catch {
    // nothing stored
  }
}

export function currentRepPending(): RepPending {
  return repPending(readStores(), loadRepBase());
}

/** 📊 «تقاريري»: his share's operations on devices no longer his (null when none). */
export function loadPastLedger(): PastLedger | null {
  const value = readJson(PAST_LEDGER_KEY);
  return isRec(value) && isRec(value.ledger) && isRec(value.names) ? (value as unknown as PastLedger) : null;
}
