/**
 * 🔗 The phone ↔ laptop link (his Oct 24 2026 choice «اتجاهان مباشرة»): every business store
 * (`starnet_*`, exactly what a backup carries) is cut into records - an array's items by `id`, an
 * object's entries by key, an object of arrays (the ledger: device → entries) by key + item id - so two
 * changes to different records never collide. Each side sends what changed since the last round
 * (`diff`) and applies the other side's (`merge`); the same record changed on both sides → the later
 * change wins and the other is kept in a «تعارضات» list. Pure: storage text in, storage text out.
 */

export type Shape = "array" | "map" | "map2" | "single";

/** One storage key, as records: record id → the record's JSON. */
export interface FlatKey {
  shape: Shape;
  records: Record<string, string>;
  /** The record ids in their stored order (arrays keep it on the way back). */
  order: string[];
}

export type FlatData = Record<string, FlatKey>;

/** What both sides agreed on after the last round: per key, record id → hash. */
export type Baseline = Record<string, { shape: Shape; hashes: Record<string, string> }>;

/** One change: a record set (`v` = its JSON) or removed (`v` = null). */
export interface SyncOp {
  k: string;
  s: Shape;
  r: string;
  v: string | null;
  /** When it was first seen changed (ISO) - the later of two changes to one record wins. */
  at: string;
}

export interface SyncConflict {
  k: string;
  r: string;
  /** Which side's version stayed. */
  kept: "local" | "remote";
  /** The version that lost (null = it was a deletion). */
  lost: string | null;
  at: string;
}

const SEP = "\u001f";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function idOf(item: unknown): string | null {
  if (!isPlainObject(item)) return null;
  const id = item.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

function hasUniqueIds(items: unknown[]): boolean {
  const seen = new Set<string>();
  for (const item of items) {
    const id = idOf(item);
    if (id === null || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

/** How a stored value is cut into records. `prefer` (the shape it had) wins when the value fits it -
 * an emptied ledger stays «map2», not «map». */
export function detectShape(value: unknown, prefer?: Shape): Shape {
  const fits = (shape: Shape): boolean => {
    if (shape === "single") return true;
    if (shape === "array") return Array.isArray(value) && hasUniqueIds(value);
    if (!isPlainObject(value)) return false;
    const values = Object.values(value);
    if (shape === "map") return values.every(isPlainObject);
    return values.every((v) => Array.isArray(v) && hasUniqueIds(v));
  };
  if (prefer && fits(prefer)) return prefer;
  if (Array.isArray(value)) return fits("array") ? "array" : "single";
  if (isPlainObject(value)) {
    if (Object.keys(value).length === 0) return "map";
    if (fits("map2")) return "map2";
    if (fits("map")) return "map";
  }
  return "single";
}

/** JSON with every object's keys sorted: the same record saved by two screens in another key order
 * is the same record (no change sent back and forth). */
export function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (isPlainObject(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]));
    return v;
  };
  return JSON.stringify(sort(value));
}

/** A stored text → its records (canonical JSON). Text that isn't JSON is one record. */
export function flattenKey(raw: string, prefer?: Shape): FlatKey {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { shape: "single", records: { "*": raw }, order: ["*"] };
  }
  const shape = detectShape(value, prefer);
  const records: Record<string, string> = {};
  const order: string[] = [];
  const put = (rid: string, v: unknown) => {
    records[rid] = canonical(v);
    order.push(rid);
  };
  if (shape === "array") for (const item of value as unknown[]) put(idOf(item)!, item);
  else if (shape === "map") for (const [k, v] of Object.entries(value as Record<string, unknown>)) put(k, v);
  else if (shape === "map2") {
    for (const [k, list] of Object.entries(value as Record<string, unknown[]>)) {
      // An empty list still exists (a device with no operations yet).
      if ((list as unknown[]).length === 0) put(`${k}${SEP}`, null);
      for (const item of list as unknown[]) put(`${k}${SEP}${idOf(item)!}`, item);
    }
  } else {
    records["*"] = canonical(value);
    order.push("*");
  }
  return { shape, records, order };
}

/** Records → the stored text (null = the key holds nothing any more). Kept order first, new ones after. */
export function unflattenKey(flat: FlatKey): string | null {
  const rids = [...flat.order.filter((r) => r in flat.records), ...Object.keys(flat.records).filter((r) => !flat.order.includes(r))];
  if (rids.length === 0) return flat.shape === "single" ? null : flat.shape === "array" ? "[]" : "{}";
  if (flat.shape === "single") return flat.records["*"] ?? null;
  if (flat.shape === "array") return JSON.stringify(rids.map((r) => JSON.parse(flat.records[r]!)));
  if (flat.shape === "map") return JSON.stringify(Object.fromEntries(rids.map((r) => [r, JSON.parse(flat.records[r]!)])));
  const out: Record<string, unknown[]> = {};
  for (const rid of rids) {
    const cut = rid.indexOf(SEP);
    const group = rid.slice(0, cut);
    out[group] = out[group] ?? [];
    if (rid.slice(cut + 1) !== "") out[group]!.push(JSON.parse(flat.records[rid]!));
  }
  return JSON.stringify(out);
}

/** FNV-1a (32 bit): enough to tell a changed record. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + text.length.toString(36);
}

export function flattenAll(storage: Record<string, string>, baseline: Baseline = {}): FlatData {
  const out: FlatData = {};
  for (const [key, raw] of Object.entries(storage)) out[key] = flattenKey(raw, baseline[key]?.shape);
  return out;
}

export function baselineOf(data: FlatData): Baseline {
  const out: Baseline = {};
  for (const [key, flat] of Object.entries(data)) {
    out[key] = { shape: flat.shape, hashes: Object.fromEntries(Object.entries(flat.records).map(([r, v]) => [r, hashText(v)])) };
  }
  return out;
}

/** Many records gone from one store at once - held until he confirms (a stale screen writing an old
 * list must never wipe the other device). */
export interface HeldDeletion {
  k: string;
  count: number;
  total: number;
}

export const MASS_DELETE_MIN = 20;
export const MASS_DELETE_SHARE = 0.3;

/** What changed here since the last round. `confirmed` keys may delete as much as they like. */
export function diff(baseline: Baseline, current: FlatData, at: string, confirmed: ReadonlySet<string> = new Set()): { ops: SyncOp[]; held: HeldDeletion[] } {
  const ops: SyncOp[] = [];
  const held: HeldDeletion[] = [];
  const keys = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  for (const k of keys) {
    const base = baseline[k];
    const flat = current[k];
    const shape = flat?.shape ?? base?.shape ?? "single";
    for (const [r, v] of Object.entries(flat?.records ?? {})) {
      if (base?.hashes[r] !== hashText(v)) ops.push({ k, s: shape, r, v, at });
    }
    const gone = Object.keys(base?.hashes ?? {}).filter((r) => !(flat && r in flat.records));
    const total = Object.keys(base?.hashes ?? {}).length;
    if (gone.length >= MASS_DELETE_MIN && gone.length > total * MASS_DELETE_SHARE && !confirmed.has(k)) {
      held.push({ k, count: gone.length, total });
      continue;
    }
    for (const r of gone) ops.push({ k, s: shape, r, v: null, at });
  }
  return { ops, held };
}

export interface MergeResult {
  data: FlatData;
  /** Local changes still to send (a local change that lost to a later remote one is dropped). */
  outgoing: SyncOp[];
  conflicts: SyncConflict[];
  /** Keys whose stored text must be rewritten. */
  changedKeys: string[];
}

/** The other side's changes onto this side. Same record changed on both → the later wins. */
export function merge(current: FlatData, localOps: SyncOp[], remoteOps: SyncOp[]): MergeResult {
  const data: FlatData = Object.fromEntries(Object.entries(current).map(([k, f]) => [k, { shape: f.shape, records: { ...f.records }, order: [...f.order] }]));
  const local = new Map(localOps.map((op) => [`${op.k}\u0000${op.r}`, op]));
  const dropped = new Set<string>();
  const conflicts: SyncConflict[] = [];
  const changed = new Set<string>();
  for (const op of remoteOps) {
    const id = `${op.k}\u0000${op.r}`;
    const mine = local.get(id);
    if (mine && !dropped.has(id)) {
      if (mine.v === op.v) {
        dropped.add(id); // the same change on both sides - nothing to send or keep
        continue;
      }
      if (mine.at > op.at) {
        conflicts.push({ k: op.k, r: op.r, kept: "local", lost: op.v, at: op.at });
        continue;
      }
      conflicts.push({ k: op.k, r: op.r, kept: "remote", lost: mine.v, at: mine.at });
      dropped.add(id);
    }
    const flat = data[op.k] ?? (data[op.k] = { shape: op.s, records: {}, order: [] });
    if (op.v === null) {
      if (!(op.r in flat.records)) continue;
      delete flat.records[op.r];
    } else {
      if (flat.records[op.r] === op.v) continue;
      flat.records[op.r] = op.v;
    }
    changed.add(op.k);
  }
  return { data, outgoing: localOps.filter((op) => !dropped.has(`${op.k}\u0000${op.r}`)), conflicts, changedKeys: [...changed] };
}

/** The baseline after a round: everything as it now stands, except deletions still held. */
export function nextBaseline(data: FlatData, previous: Baseline, held: HeldDeletion[]): Baseline {
  const out = baselineOf(data);
  for (const { k } of held) {
    const base = previous[k];
    if (!base) continue;
    const entry = out[k] ?? (out[k] = { shape: base.shape, hashes: {} });
    for (const [r, h] of Object.entries(base.hashes)) if (!(r in entry.hashes)) entry.hashes[r] = h;
  }
  return out;
}
