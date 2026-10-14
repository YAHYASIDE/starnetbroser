/**
 * 🔗 Saving without overwriting (his Oct 2026 report: «نربط الجهاز بزبون… أخرج وأرجع لا أجده
 * مربوطًا»). A screen keeps its own copy of the devices / customers in memory; saving that whole
 * copy back wrote over whatever changed in storage since it was loaded - a customer link made a
 * moment before was lost the next time anything else saved its (older) list.
 *
 * Now a save applies only what THIS screen changed (field by field, from the copy it started with
 * to the copy it wants) onto the latest stored version. Pure functions; lib/demoAccountStore.ts and
 * lib/clientStore.ts do the storage part.
 */

type Rec = Record<string, unknown>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** `fresh` with the fields that changed from `base` to `next` (a field removed in `next` is removed). */
export function mergeRecord<T extends object>(fresh: T, base: T | undefined, next: T): T {
  const out: Rec = { ...(fresh as Rec) };
  const b = (base ?? {}) as Rec;
  const n = next as Rec;
  for (const key of new Set([...Object.keys(b), ...Object.keys(n)])) {
    if (same(b[key], n[key])) continue;
    if (key in n && n[key] !== undefined) out[key] = n[key];
    else delete out[key];
  }
  return out as T;
}

/**
 * A list of `{ id }` records: what changed from `base` to `next` applied onto `fresh` (the stored
 * list now). Records only `fresh` has (added elsewhere meanwhile) stay; records removed from
 * `next` are removed; new ones are added at the front when the screen put them first.
 */
export function mergeList<T extends { id: string }>(fresh: T[], base: T[], next: T[]): T[] {
  const baseById = new Map(base.map((r) => [r.id, r]));
  const nextById = new Map(next.map((r) => [r.id, r]));
  const freshIds = new Set(fresh.map((r) => r.id));
  const out: T[] = [];
  for (const record of fresh) {
    const before = baseById.get(record.id);
    const after = nextById.get(record.id);
    if (!after) {
      // removed here - unless this screen never had it (added elsewhere meanwhile)
      if (!before) out.push(record);
      continue;
    }
    out.push(before && same(before, after) ? record : mergeRecord(record, before, after));
  }
  const added = next.filter((r) => !freshIds.has(r.id) && !baseById.has(r.id));
  if (added.length === 0) return out;
  return next[0] && added[0] === next[0] ? [...added, ...out] : [...out, ...added];
}

/** The same for a map `{ id: record }` (the customers). */
export function mergeMap<T extends object>(fresh: Record<string, T>, base: Record<string, T>, next: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, record] of Object.entries(fresh)) {
    const before = base[id];
    const after = next[id];
    if (!after) {
      if (!before) out[id] = record;
      continue;
    }
    out[id] = before && same(before, after) ? record : mergeRecord(record, before, after);
  }
  for (const [id, record] of Object.entries(next)) if (!(id in fresh) && !(id in base)) out[id] = record;
  return out;
}

/** Devices whose customer link this save takes off (for the 🔔 check). */
export function removedLinks<T extends { id: string; name?: string; clientId?: string }>(before: T[], after: T[]): { id: string; name: string; clientId: string }[] {
  const now = new Map(after.map((a) => [a.id, a]));
  const out: { id: string; name: string; clientId: string }[] = [];
  for (const a of before) {
    if (!a.clientId) continue;
    const later = now.get(a.id);
    if (later && !later.clientId) out.push({ id: a.id, name: a.name ?? "", clientId: a.clientId });
  }
  return out;
}
