/**
 * ☁️ Live sync of a representative's customers between the operator's app and the rep's app (his
 * Oct 2026 request: «ترابط بين تطبيقي وتطبيق المندوب… الزبائن تتحدث تلقائيًا»). Pure logic only -
 * the transport (Firebase, encrypted with the rep's code) is lib/liveSync.ts.
 *
 * Each side publishes its own "side" of one rep: his customers (name, phone) and which customer
 * each of his devices is linked to, every record stamped with when it last changed on that side.
 * Each side reads the other's and takes the news. On a conflict - both sides changed the same
 * record since they last agreed - THE REP WINS (his choice: «زبون المندوب يغلب»).
 *
 * v1 syncs adding / renaming customers and device links; deleting a customer is not synced.
 */

export interface SyncClient {
  name: string;
  phone?: string;
  /** When this value last changed on the side that publishes it (ISO). */
  at: string;
}

export interface SyncLink {
  clientId: string | null;
  at: string;
}

export interface SidePayload {
  v: 1;
  clients: Record<string, SyncClient>;
  links: Record<string, SyncLink>;
  at: string;
}

/** What one side remembers per record: its current value, when it changed here, and the time
 * of the other side's value it last took in (`seen`). */
interface Tracked<V> {
  value: V;
  at: string;
  seen?: string;
}

export interface TrackState {
  clients: Record<string, Tracked<{ name: string; phone?: string }>>;
  links: Record<string, Tracked<string | null>>;
  /** After the first tick: records found on the first tick are the starting point (time ""), not
   * changes - so switching the link on never lets an empty value wipe the other side's. */
  started?: boolean;
}

/** The time of a record as it was when the link was switched on (no change yet). */
export const BASELINE = "";

export const EMPTY_TRACK: TrackState = { clients: {}, links: {} };

export interface LocalView {
  clients: Record<string, { name: string; phone?: string }>;
  /** deviceId -> its customer (null = none). */
  links: Record<string, string | null>;
}

const sameClient = (a: { name: string; phone?: string } | undefined, b: { name: string; phone?: string } | undefined) =>
  Boolean(a && b) && a!.name === b!.name && (a!.phone || "") === (b!.phone || "");

/** Stamps what changed on this phone since the last tick (a new / renamed customer, a device linked
 * to another customer). On the very first tick everything is the starting point (BASELINE). */
export function trackLocal(state: TrackState, local: LocalView, now: string): TrackState {
  const stamp = state.started ? now : BASELINE;
  const clients: TrackState["clients"] = { ...state.clients };
  for (const [id, value] of Object.entries(local.clients)) {
    const prev = clients[id];
    if (!prev || !sameClient(prev.value, value)) clients[id] = { value: { name: value.name, ...(value.phone ? { phone: value.phone } : {}) }, at: stamp, seen: prev?.seen };
  }
  const links: TrackState["links"] = { ...state.links };
  for (const [deviceId, clientId] of Object.entries(local.links)) {
    const prev = links[deviceId];
    if (!prev || prev.value !== clientId) links[deviceId] = { value: clientId, at: stamp, seen: prev?.seen };
  }
  return { clients, links, started: true };
}

/** This side as published: every tracked record with its time. */
export function buildSide(state: TrackState, local: LocalView, now: string): SidePayload {
  const clients: Record<string, SyncClient> = {};
  for (const id of Object.keys(local.clients)) {
    const t = state.clients[id];
    if (t) clients[id] = { ...t.value, at: t.at };
  }
  const links: Record<string, SyncLink> = {};
  for (const id of Object.keys(local.links)) {
    const t = state.links[id];
    if (t) links[id] = { clientId: t.value, at: t.at };
  }
  return { v: 1, clients, links, at: now };
}

export interface MergeResult {
  /** Customers to create or update here. */
  clients: Record<string, { name: string; phone?: string }>;
  /** Devices whose customer link changes here (only devices this side has). */
  links: Record<string, string | null>;
  state: TrackState;
}

/** Whether the other side's record is news here, and whether this phone keeps its own value. */
function decide<V>(
  mine: Tracked<V> | undefined,
  theirsValue: V,
  theirsAt: string,
  same: (a: V, b: V) => boolean,
  isEmpty: (v: V) => boolean,
  incomingWins: boolean,
): "take" | "keep" | "skip" {
  if (!mine) return "take";
  const firstExchange = mine.seen === undefined;
  const news = theirsAt > (mine.seen ?? "") || firstExchange;
  if (!news) return "skip";
  if (same(mine.value, theirsValue)) return "keep";
  // Both still at their starting point (the link was just switched on): a real value beats an
  // empty one; two different real values - the rep's wins.
  if (mine.at === BASELINE && theirsAt === BASELINE) {
    if (isEmpty(theirsValue)) return "keep";
    if (isEmpty(mine.value)) return "take";
    return incomingWins ? "take" : "keep";
  }
  const changedHere = mine.at > (mine.seen ?? "");
  if (changedHere && !incomingWins) return "keep";
  if (changedHere && theirsAt === BASELINE && incomingWins) return "keep";
  return "take";
}

/**
 * Takes the other side's news. `incomingWins` = this phone is the operator's (the rep's side wins
 * a conflict); on the rep's phone a record he changed since he last took the operator's is kept.
 */
export function mergeIncoming(state: TrackState, local: LocalView, incoming: SidePayload, incomingWins: boolean): MergeResult {
  const out: MergeResult = { clients: {}, links: {}, state: { ...state, clients: { ...state.clients }, links: { ...state.links } } };
  for (const [id, theirs] of Object.entries(incoming.clients)) {
    const mine = out.state.clients[id];
    const value = { name: theirs.name, ...(theirs.phone ? { phone: theirs.phone } : {}) };
    const verdict = decide(mine, value, theirs.at, (a, b) => sameClient(a, b), (v) => !v.name, incomingWins);
    if (verdict === "skip") continue;
    if (verdict === "keep") {
      out.state.clients[id] = { ...mine!, seen: theirs.at };
      continue;
    }
    if (!sameClient(local.clients[id], value)) out.clients[id] = value;
    out.state.clients[id] = { value, at: theirs.at, seen: theirs.at };
  }
  for (const [deviceId, theirs] of Object.entries(incoming.links)) {
    if (!(deviceId in local.links)) continue;
    const mine = out.state.links[deviceId];
    const verdict = decide(mine, theirs.clientId, theirs.at, (a, b) => a === b, (v) => v === null, incomingWins);
    if (verdict === "skip") continue;
    if (verdict === "keep") {
      out.state.links[deviceId] = { ...mine!, seen: theirs.at };
      continue;
    }
    if (local.links[deviceId] !== theirs.clientId) out.links[deviceId] = theirs.clientId;
    out.state.links[deviceId] = { value: theirs.clientId, at: theirs.at, seen: theirs.at };
  }
  return out;
}

/** Same content (ignoring the publish time) - nothing to upload again. */
export function sameSide(a: SidePayload | null | undefined, b: SidePayload): boolean {
  if (!a) return false;
  return JSON.stringify({ c: a.clients, l: a.links }) === JSON.stringify({ c: b.clients, l: b.links });
}
