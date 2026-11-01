/**
 * ✅ / ❌ under every operation message of the money bot (his Nov 1 2026 brief; his choices: the rep rates
 * in his bot, «❌ غير جيد» also reaches his own bot at once). Each message carries its operation's
 * token (repOpMessage.ts `opToken`); the phone's service takes the tap (TelegramReplyService, `rt:`),
 * and the app records it here:
 *  - «✅ جيد» → a quiet line in the 🔔 list, nothing else;
 *  - «❌ غير جيد» → an open flag: the red «🚨 للمراجعة» badge stays on every page until he taps «✓ راجعتها».
 * Pressing the same choice again changes nothing; changing it is kept in the operation's history
 * (who, when). Business records → `starnet_` (in the backup). Pure + a small store.
 */

export type OpVerdict = "good" | "bad";

export interface SentOp {
  token: string;
  repId: string;
  /** The operation's id in «كشفي» (`SIFA:customer-…`, `l:…`). */
  opId: string;
  account: string;
  /** The message as sent, without tags. */
  text: string;
  at: number;
}

export interface OpRatingEvent {
  verdict: OpVerdict;
  by: string;
  at: number;
}

export interface OpRating {
  token: string;
  repId: string;
  verdict: OpVerdict;
  by: string;
  at: number;
  /** What the rep saw (the message's text from Telegram) - when it isn't in `sent`. */
  text?: string;
  history: OpRatingEvent[];
  /** «✓ راجعتها» on a «غير جيد». */
  reviewedAt?: number;
}

export interface OpRatingsStore {
  sent: Record<string, SentOp>;
  ratings: Record<string, OpRating>;
}

export const EMPTY_OP_RATINGS: OpRatingsStore = { sent: {}, ratings: {} };
const KEY = "starnet_rep_op_ratings_v1";
export const OP_RATINGS_CHANGED = "starnet:op-ratings";
/** The operations sent kept to link a rating back to its operation. */
export const MAX_SENT = 600;

export function recordSentOp(store: OpRatingsStore, op: SentOp): OpRatingsStore {
  const sent = { ...store.sent, [op.token]: op };
  const tokens = Object.keys(sent);
  if (tokens.length > MAX_SENT) {
    const keep = new Set(Object.values(sent).sort((a, b) => b.at - a.at).slice(0, MAX_SENT).map((s) => s.token));
    for (const t of tokens) if (!keep.has(t)) delete sent[t];
  }
  return { ...store, sent };
}

export interface RatingInput {
  token: string;
  repId: string;
  verdict: OpVerdict;
  by: string;
  at: number;
  text?: string;
}

/** «same» = this choice is already the operation's (a second tap) - nothing is written. */
export function applyRating(store: OpRatingsStore, input: RatingInput): { store: OpRatingsStore; change: "new" | "changed" | "same" } {
  if (!/^[0-9a-f]{8}$/.test(input.token) || (input.verdict !== "good" && input.verdict !== "bad")) return { store, change: "same" };
  const before = store.ratings[input.token];
  if (before && before.verdict === input.verdict) return { store, change: "same" };
  const event: OpRatingEvent = { verdict: input.verdict, by: input.by, at: input.at };
  const next: OpRating = {
    token: input.token,
    repId: input.repId,
    verdict: input.verdict,
    by: input.by,
    at: input.at,
    ...(input.text || before?.text ? { text: input.text || before?.text } : {}),
    history: [...(before?.history ?? []), event],
    // a new «غير جيد» is open again, even if an earlier one was reviewed
  };
  return { store: { ...store, ratings: { ...store.ratings, [input.token]: next } }, change: before ? "changed" : "new" };
}

export interface OpenFlag {
  rating: OpRating;
  op?: SentOp;
  /** What to show: the message as sent, else what Telegram gave back. */
  text: string;
}

/** «❌ غير جيد» not reviewed yet, newest first - the red badge's list. */
export function openFlags(store: OpRatingsStore): OpenFlag[] {
  return Object.values(store.ratings)
    .filter((r) => r.verdict === "bad" && !r.reviewedAt)
    .sort((a, b) => b.at - a.at)
    .map((rating) => {
      const op = store.sent[rating.token];
      return { rating, ...(op ? { op } : {}), text: op?.text ?? rating.text ?? "" };
    });
}

export function markReviewed(store: OpRatingsStore, token: string, at: number): OpRatingsStore {
  const r = store.ratings[token];
  if (!r || r.verdict !== "bad" || r.reviewedAt) return store;
  return { ...store, ratings: { ...store.ratings, [token]: { ...r, reviewedAt: at } } };
}

/** The inbox record from the service: `{"repId","token","verdict":"g"|"b","by","at","text"}`. */
export function parseRatingRecord(data: string | undefined): RatingInput | null {
  try {
    const p = JSON.parse(data ?? "") as Record<string, unknown>;
    const verdict = p.verdict === "g" ? "good" : p.verdict === "b" ? "bad" : null;
    if (typeof p.repId !== "string" || typeof p.token !== "string" || !verdict) return null;
    return {
      repId: p.repId,
      token: p.token,
      verdict,
      by: typeof p.by === "string" && p.by.trim() ? p.by.trim().slice(0, 80) : "المندوب",
      at: typeof p.at === "number" && Number.isFinite(p.at) ? p.at : Date.now(),
      ...(typeof p.text === "string" && p.text ? { text: p.text.slice(0, 3000) } : {}),
    };
  } catch {
    return null;
  }
}

export function loadOpRatings(): OpRatingsStore {
  try {
    const p = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as OpRatingsStore | null;
    return p && typeof p === "object" && p.sent && p.ratings ? p : EMPTY_OP_RATINGS;
  } catch {
    return EMPTY_OP_RATINGS;
  }
}

export function saveOpRatings(store: OpRatingsStore): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
    window.dispatchEvent(new Event(OP_RATINGS_CHANGED));
  } catch {
    // storage full - the banner (StorageFullBanner) says so
  }
}
