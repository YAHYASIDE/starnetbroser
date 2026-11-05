/**
 * 🔀 A device moved from one customer to another keeps each one's operations with him (his Nov 5 2026
 * ask: «عندما ننقل جهاز من زبون الى زبون آخر ان لا تنتقل معه عملياته السابقة - لكل زبون معاملاته مع
 * الجهاز»). His choices: always (no question at the move), the device card keeps showing all its
 * operations, and only moves from now on (an earlier move isn't guessed).
 *
 * Derived, never rewritten: every save of the devices that changes a device's customer adds one record
 * «this device was A's until T» (`starnet_client_moves_v1`, backed up). An operation recorded before T
 * belongs to A; after it, to whoever has the device next. The operations themselves are untouched.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";

export interface ClientMove {
  accountId: string;
  /** The customer the device had until `at`. */
  from: string;
  /** Whom it went to (absent = taken off any customer). */
  to?: string;
  /** ISO time of the move. */
  at: string;
}

type Device = Pick<StarlinkAccountSummary, "id"> & { clientId?: string | null };

/** The moves a save makes: a device that had a customer and now has another (or none). */
export function detectClientMoves(before: unknown, after: Device[], at: string): ClientMove[] {
  if (!Array.isArray(before)) return [];
  const prev = new Map<string, string>();
  for (const d of before) {
    if (d && typeof d === "object" && typeof (d as Device).id === "string" && typeof (d as Device).clientId === "string" && (d as Device).clientId) {
      prev.set((d as Device).id, (d as Device).clientId as string);
    }
  }
  const moves: ClientMove[] = [];
  const seen = new Set<string>();
  for (const d of after) {
    seen.add(d.id);
    const from = prev.get(d.id);
    const to = d.clientId || undefined;
    if (from && from !== to) moves.push({ accountId: d.id, from, ...(to ? { to } : {}), at });
  }
  return moves;
}

/** Whose this operation is: the customer before the first move after it was recorded, else the device's own. */
export function entryOwner(entry: { createdAt: string }, device: Device, moves: ClientMove[]): string | undefined {
  let owner: string | undefined;
  let ownerAt = "";
  for (const m of moves) {
    if (m.accountId !== device.id || m.at <= entry.createdAt) continue;
    if (!ownerAt || m.at < ownerAt) {
      owner = m.from;
      ownerAt = m.at;
    }
  }
  return ownerAt ? owner : device.clientId || undefined;
}

/** The customer's operations among a device's. */
export function entriesOfClient<E extends { createdAt: string }>(entries: E[], device: Device, clientId: string, moves: ClientMove[]): E[] {
  if (!moves.some((m) => m.accountId === device.id)) return device.clientId === clientId ? entries : [];
  return entries.filter((e) => entryOwner(e, device, moves) === clientId);
}

/** His devices now + the ones that were his before a move (their earlier operations are still his). */
export function clientDevicesWithHistory<D extends Device>(accounts: D[], clientId: string, moves: ClientMove[]): D[] {
  const before = new Set(moves.filter((m) => m.from === clientId).map((m) => m.accountId));
  return accounts.filter((a) => a.clientId === clientId || before.has(a.id));
}

// ---- storage ----

const KEY = "starnet_client_moves_v1";

export function loadClientMoves(): ClientMove[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as ClientMove[]) : [];
  } catch {
    return [];
  }
}

/** Adds what a devices' save changed. Never throws - a save must not fail for it. */
export function recordClientMoves(before: unknown, after: Device[], at = new Date().toISOString()): void {
  try {
    const moves = detectClientMoves(before, after, at);
    if (moves.length) window.localStorage.setItem(KEY, JSON.stringify([...loadClientMoves(), ...moves]));
  } catch {
    // storage full - the banner (StorageFullBanner) says so
  }
}
