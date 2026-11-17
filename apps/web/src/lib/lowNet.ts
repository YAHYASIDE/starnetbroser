/**
 * 📶 «وضع الإنترنت الضعيف» (his Nov 17 2026 ask: «التطبيق لا يعمل إلا بالإنترنت القوي، وعندما يكون ضعيفًا يعمل ببطء
 * شديد… ابنه بسرعة… زر ظاهر يمكن تفعيله وإطفاؤه»). His data never needs the internet (it is on the phone); what fought
 * for a weak connection were the background jobs. With the button on: the team link every minute instead of every 8 s,
 * no Starlink-session rounds, no hourly Google Drive upload, no automatic rep copies / statements, the chat retries
 * every minute, and no scheduled background syncs - what HE asks for (a sync, a send, a backup) still runs. Every network
 * call also gets a time limit (`timedFetch`), on or off, so a stalled request ends instead of hanging for minutes.
 * Phone-only setting (`starnet.lowNet`).
 */

export const LOW_NET_KEY = "starnet.lowNet";
export const LOW_NET_EVENT = "starnet:low-net";

/** The team link's pace with the button on. */
export const LOW_NET_LINK_EVERY_MS = 60_000;
/** The chat's retry pace with the button on. */
export const LOW_NET_CHAT_RETRY_MS = 60_000;

export function lowNetOn(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(LOW_NET_KEY) === "1";
  } catch {
    return false;
  }
}

export function setLowNet(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(LOW_NET_KEY, "1");
    else window.localStorage.removeItem(LOW_NET_KEY);
  } catch {
    // stays as it was
  }
  window.dispatchEvent(new Event(LOW_NET_EVENT));
}

/** What the phone says about its connection (Chrome's Network Information) - a hint only, never acted on alone. */
export function looksWeak(conn: { effectiveType?: string; downlink?: number; rtt?: number } | undefined | null): boolean {
  if (!conn) return false;
  if (conn.effectiveType === "slow-2g" || conn.effectiveType === "2g") return true;
  if (typeof conn.rtt === "number" && conn.rtt >= 900) return true;
  return typeof conn.downlink === "number" && conn.downlink > 0 && conn.downlink < 0.4;
}

/** A request's time limit: 60 s (90 s with the button on - a weak line is slow, not dead). */
export function requestLimitMs(on: boolean): number {
  return on ? 90_000 : 60_000;
}

/** fetch with a time limit: a stalled request fails (and is tried again later) instead of hanging. */
export const timedFetch: typeof fetch = (input, init) => {
  const limit = requestLimitMs(lowNetOn());
  const own = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(limit) : undefined;
  const signal = own && init?.signal && "any" in AbortSignal ? AbortSignal.any([own, init.signal]) : (init?.signal ?? own);
  return fetch(input, { ...init, ...(signal ? { signal } : {}) });
};
