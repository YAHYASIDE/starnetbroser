/**
 * 📋 A Starlink session sent to a bot as text (Firefox clone → «Cookie-Editor» → Export → JSON,
 * pasted in Telegram) becomes a new device whose browser opens already signed in (his choice:
 * new device + «مزامنة»; his own bot adds it at once, a rep's needs his approval; the message
 * stays in Telegram). Telegram cuts a long text into several messages of ~4096 characters, so the
 * parts of one chat are joined until they read as a whole session (pastedSession.ts). Pure; the
 * session is never logged and lives only in memory until it's in the device's browser.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { DeviceStatus } from "@starnet/shared";
import { parsePastedSession } from "./pastedSession";

/** Parts of one session that arrive further apart than this are not joined. */
export const PART_GAP_MS = 3 * 60_000;
const MAX_PARTS = 12;
const MAX_CHARS = 60_000;

const SESSION_WORDS = /starlink/i;
const COOKIE_SHAPE = /"(name|value|domain)"\s*:|\tTRUE\t|\tFALSE\t|Starlink\.Com\./i;

/** The first part of a session: an exported cookie list (its first cookie's value can fill the
 * whole first message, before its "starlink.com" shows), or cookies that name Starlink. */
export function looksLikeSessionStart(text: string): boolean {
  const t = text.trim();
  if (/^[[{]/.test(t)) return /"name"\s*:/.test(t) && /"value"\s*:/.test(t);
  // cookies.txt lines, or "Name=value; Name2=value2" - never a piece from inside a JSON list.
  if (/"(name|value|domain)"\s*:/.test(t)) return false;
  return SESSION_WORDS.test(t) && (/\t(TRUE|FALSE)\t/.test(t) || /(^|;\s*)[A-Za-z0-9._-]+=[^\s;]{8,}/.test(t));
}

/** A following part (the cut-off rest of a long cookie, or more cookies) of a session that's
 * still being received - never an ordinary command (short words with spaces). */
export function looksLikeSessionContinuation(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (COOKIE_SHAPE.test(t) || /^[\]},]/.test(t)) return true;
  return t.length >= 200 && !/\s/.test(t);
}

export type SessionStep =
  | { status: "ignored" }
  | { status: "waiting"; parts: number }
  | { status: "done"; cookiesByUrl: Record<string, string>; count: number }
  | { status: "failed"; message: string };

interface Pending {
  parts: string[];
  lastAt: number;
}

/** Joins the parts of the sessions being received, per chat. */
export class SessionCollector {
  private pending = new Map<string, Pending>();

  /** Feeds one message; "ignored" when it isn't (part of) a session. */
  add(chatKey: string, text: string, now: number): SessionStep {
    const open = this.pending.get(chatKey);
    const fresh = open && now - open.lastAt <= PART_GAP_MS ? open : undefined;
    if (!fresh) this.pending.delete(chatKey);
    if (fresh && looksLikeSessionContinuation(text)) {
      fresh.parts.push(text);
      fresh.lastAt = now;
    } else if (looksLikeSessionStart(text)) {
      this.pending.set(chatKey, { parts: [text], lastAt: now });
    } else {
      return { status: "ignored" };
    }
    const current = this.pending.get(chatKey)!;
    const whole = joinParts(current.parts);
    if (whole) {
      this.pending.delete(chatKey);
      return whole;
    }
    const size = current.parts.reduce((n, p) => n + p.length, 0);
    if (current.parts.length >= MAX_PARTS || size > MAX_CHARS) {
      this.pending.delete(chatKey);
      return { status: "failed", message: "لم تكتمل الجلسة - انسخها من جديد (Cookie-Editor ← Export ← JSON) وأرسلها" };
    }
    return { status: "waiting", parts: current.parts.length };
  }

  /** Whether a session of this chat is still being received. */
  isOpen(chatKey: string, now: number): boolean {
    const open = this.pending.get(chatKey);
    return Boolean(open && now - open.lastAt <= PART_GAP_MS);
  }
}

/** The parts as one session, or null while it's still incomplete. Telegram may drop the line
 * break at a cut, or cut inside a value - both ways are tried. */
function joinParts(parts: string[]): SessionStep | null {
  const first = parts[0]!.trim();
  const json = first.startsWith("[") || first.startsWith("{");
  for (const glue of ["", "\n"]) {
    const text = parts.join(glue).trim();
    if (json) {
      try {
        JSON.parse(text);
      } catch {
        continue;
      }
    }
    // Whole (it parsed, or it isn't JSON): a session, or the reason it isn't one.
    const parsed = parsePastedSession(text);
    if (parsed.ok) return { status: "done", cookiesByUrl: parsed.cookiesByUrl, count: parsed.count };
    return { status: "failed", message: parsed.message };
  }
  return null;
}

/** The new device a session becomes - named until «مزامنة» reads it (like a new device added by hand). */
export function sessionDevice(id: string, now: Date, extra: Partial<StarlinkAccountSummary> = {}): StarlinkAccountSummary {
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return {
    id,
    customerId: `customer-${id}`,
    addedAt: now.toISOString(),
    name: `📋 جهاز جديد ${hhmm}`,
    phone: "",
    expectedEmail: "",
    deviceName: "Standard Kit",
    kitNumber: "",
    serialNumber: "",
    standbyDate: "",
    rechargeDate: "",
    balanceDue: "0",
    currency: "$",
    dishStatus: DeviceStatus.GRAY,
    wifiStatus: DeviceStatus.GRAY,
    alertReason: "",
    lastUpdated: "الآن",
    lastSuccessfulScanAt: null,
    planName: "Residential",
    ...extra,
  };
}
