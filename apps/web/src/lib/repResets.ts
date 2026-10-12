import { isAfterRepReset } from "./repAccount";
import type { ProfitReset } from "./profitReset";
import type { Representative, RepresentativeStore, RepResetPoint } from "./repStore";

/**
 * 🗄 A rep's resets as saved versions (his Oct 12 2026 ask: «استرجاع تصفير الحساب يرد فقط ما كان قبل
 * التصفير … كل تصفير يُحفظ من تصفير إلى تصفير سابقه، وأن تبقى هناك كنسخ»). Every reset point is kept:
 * the current one is `resetFrom`, the earlier ones `resetHistory`. Undoing a reset goes back to the
 * one before it - never to «no reset» while an older one exists - and every period between two resets
 * stays viewable as its own version. Nothing here deletes a record.
 */

const key = (p: RepResetPoint) => `${p.date}|${p.at}`;

/** Oldest first; `at` "" (a chosen day) sorts before any moment of the same day. */
function sorted(points: RepResetPoint[]): RepResetPoint[] {
  const seen = new Map<string, RepResetPoint>();
  for (const p of points) if (p?.date) seen.set(key(p), p);
  return [...seen.values()].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** Every saved reset of his, oldest first (the current one included). */
export function repResetPoints(rep: Pick<Representative, "resetFrom" | "resetHistory">): RepResetPoint[] {
  return sorted([...(rep.resetHistory ?? []), ...(rep.resetFrom ? [rep.resetFrom] : [])]);
}

type ResetFields = Pick<Representative, "resetFrom" | "resetHistory">;

function fields(current: RepResetPoint | undefined, all: RepResetPoint[]): ResetFields {
  const history = sorted(all).filter((p) => !current || key(p) !== key(current));
  return { resetFrom: current, resetHistory: history.length ? history : undefined };
}

/** 🔄 A new reset: the current one is kept as a version, the new one becomes current. */
export function applyRepReset(rep: ResetFields, point: RepResetPoint): ResetFields {
  return fields(point, [...repResetPoints(rep), point]);
}

/** ↩️ Back to the reset before the current one (or to no reset when it was the first). The undone
 * reset is not lost: it stays a saved point he can come back to. */
export function undoRepReset(rep: ResetFields): ResetFields {
  const points = repResetPoints(rep);
  const index = rep.resetFrom ? points.findIndex((p) => key(p) === key(rep.resetFrom!)) : -1;
  return fields(index > 0 ? points[index - 1] : undefined, points);
}

/** 📂 Make one saved reset the current one again (the others stay saved). */
export function pickRepReset(rep: ResetFields, point: RepResetPoint | undefined): ResetFields {
  return fields(point, repResetPoints(rep));
}

export interface RepVersion {
  /** Records from here on (undefined = from the very start). */
  from?: RepResetPoint;
  /** Records before here (undefined = up to now - the current account). */
  to?: RepResetPoint;
}

/** His account's versions, newest first: the current one, then each period between two earlier
 * resets, back to the very start. */
export function repVersions(rep: ResetFields): RepVersion[] {
  if (!rep.resetFrom) return [{}];
  const points = repResetPoints(rep);
  const index = points.findIndex((p) => key(p) === key(rep.resetFrom!));
  const versions: RepVersion[] = [{ from: points[index] }];
  for (let i = index - 1; i >= 0; i--) versions.push({ from: points[i], to: points[i + 1] });
  versions.push({ to: points[0] });
  return versions;
}

/** Is this record inside that version? */
export function inRepVersion(version: RepVersion, record: { date: string; createdAt: string }): boolean {
  return (!version.from || isAfterRepReset(version.from, record)) && (!version.to || !isAfterRepReset(version.to, record));
}

/**
 * Applied to the past (once a store is loaded): the resets older app versions overwrote are found
 * again where they were remembered - the profit fresh start kept each rep's reset before it, and
 * the fresh start itself was a reset of his. Adds them as saved versions; never changes the current
 * reset. The same store when there is nothing to add.
 */
export function seedRepResetHistory(store: RepresentativeStore, profitReset: Pick<ProfitReset, "date" | "at" | "previousRepResets"> | null): RepresentativeStore {
  if (!profitReset) return store;
  let next = store;
  for (const [repId, previous] of Object.entries(profitReset.previousRepResets ?? {})) {
    const rep = next[repId];
    if (!rep) continue;
    const known = repResetPoints(rep);
    const found = [...(previous ? [previous] : []), { date: profitReset.date, at: profitReset.at }];
    const missing = found.filter((p) => !known.some((k) => key(k) === key(p)));
    if (!missing.length) continue;
    const merged = fields(rep.resetFrom, [...known, ...missing]);
    next = { ...next, [repId]: { ...rep, ...merged } };
  }
  return next;
}
