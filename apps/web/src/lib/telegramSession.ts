/**
 * 📋 A Starlink session sent to a bot as text (Firefox clone → «Cookie-Editor» → Export → JSON,
 * pasted in Telegram) becomes a new device whose browser opens already signed in (his choice:
 * new device + «مزامنة»; his own bot adds it at once, a rep's needs his approval; the message
 * stays in Telegram). Telegram cuts a long text into messages of ~4096 characters - often inside
 * one long cookie value - so every piece that looks like exported cookies is buffered per chat
 * and joined, in arrival order, until it reads as a whole session (pastedSession.ts). No piece is
 * ever answered as a command. Pure; the session is never logged and lives only in memory until
 * it's in the device's browser.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { DeviceStatus } from "@starnet/shared";
import { parsePastedSession } from "./pastedSession";

/** Pieces of one session that arrive further apart than this are not joined. */
export const PART_GAP_MS = 5 * 60_000;
const MAX_PARTS = 16;
const MAX_CHARS = 120_000;

const COOKIE_KEY = /"(name|value|domain|path|secure|httpOnly|hostOnly|expirationDate|sameSite)"\s*:/i;
const NETSCAPE = /\t(TRUE|FALSE)\t/;
const ARABIC = /[؀-ۿ]/;

/**
 * One message that is (a piece of) an exported session - never a normal command. A command is a
 * few short Arabic/English words with spaces; a session piece is JSON, cookies.txt lines, a
 * "Name=value" header, or the cut-off middle of a long cookie value (a big blob with no spaces).
 * Order-independent: the first piece, a middle, or the tail all count, so a split session is
 * never mistaken for a command.
 */
export function isSessionFragment(text: string): boolean {
  const t = text.trim();
  if (t.length < 40 || ARABIC.test(t)) return false;
  if (/^[[{\]},"]/.test(t) || COOKIE_KEY.test(t) || NETSCAPE.test(t)) return true;
  // The middle/tail of a long cookie value Telegram cut: a long run with no spaces.
  if (t.length >= 120 && !/\s/.test(t)) return true;
  // "Name=value; Name2=value2" header with long values (not a short command with spaces).
  return /(^|;\s*)[A-Za-z0-9._-]+=[^\s;]{12,}/.test(t) && !/^\S+\s+\S+\s/.test(t);
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

/** Joins the pieces of the sessions being received, per chat. */
export class SessionCollector {
  private pending = new Map<string, Pending>();

  /** Feeds one message; "ignored" when it isn't (a piece of) a session. */
  add(chatKey: string, text: string, now: number): SessionStep {
    const open = this.pending.get(chatKey);
    const fresh = open && now - open.lastAt <= PART_GAP_MS ? open : undefined;
    if (!fresh) this.pending.delete(chatKey);
    if (!isSessionFragment(text)) return { status: "ignored" };

    const current: Pending = fresh ?? { parts: [], lastAt: now };
    current.parts.push(text);
    current.lastAt = now;
    this.pending.set(chatKey, current);

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

  /** Whether a session of this chat is still being received (so a reply can wait). */
  isOpen(chatKey: string, now: number): boolean {
    const open = this.pending.get(chatKey);
    return Boolean(open && now - open.lastAt <= PART_GAP_MS);
  }
}

/** The pieces as one session, or null while it's still incomplete. Telegram splits the raw text,
 * so joining with nothing rebuilds the original (a value cut in the middle included); a dropped
 * line break at the cut is the one other case tried. */
function joinParts(parts: string[]): SessionStep | null {
  const first = parts[0]!.trim();
  const json = first.startsWith("[") || first.startsWith("{");
  for (const glue of ["", "\n"]) {
    const text = parts.join(glue).trim();
    if (json) {
      // A complete JSON list: a session, or the clear reason it isn't one (wrong domain…).
      try {
        JSON.parse(text);
      } catch {
        continue; // not whole yet - wait for more
      }
      const parsed = parsePastedSession(text);
      return parsed.ok ? { status: "done", cookiesByUrl: parsed.cookiesByUrl, count: parsed.count } : { status: "failed", message: parsed.message };
    }
    // Not (yet) a JSON list - a cookies.txt / header paste, or a tail that arrived first: only
    // finish when it already reads as a session; otherwise keep waiting for more pieces.
    const parsed = parsePastedSession(text);
    if (parsed.ok) return { status: "done", cookiesByUrl: parsed.cookiesByUrl, count: parsed.count };
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
