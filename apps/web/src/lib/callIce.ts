/**
 * 📞 Where a call's voice goes when the two phones can't reach each other directly (mobile data, most of the time): a
 * TURN relay. His Nov 8 2026 report «الاتصال غير مستقر أبدًا» (no connection, drops, choppy voice, one side not heard)
 * - the free public relay (Open Relay) is weak or gone. His choice: a free private relay (metered.ca), its link pasted
 * once in Settings (`starnet.callTurn`): shared with the team (the link's shared settings) and with each rep (in his
 * copy). It is the relay's own key, kept in the phones' settings, never in the code.
 */

export const CALL_TURN_KEY = "starnet.callTurn";

const GOOGLE_STUN: RTCIceServer = { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] };
/** The free public relay - used only when no private one is set. */
const OPEN_RELAY: RTCIceServer = {
  urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turn:openrelay.metered.ca:443?transport=tcp"],
  username: "openrelayproject",
  credential: "openrelayproject",
};

export type TurnSetting = { kind: "url"; url: string } | { kind: "servers"; servers: RTCIceServer[] };

/** Only stun: / turn: / turns: addresses, with their user and password when a relay has them. */
export function cleanIceServers(value: unknown): RTCIceServer[] {
  if (!Array.isArray(value)) return [];
  const out: RTCIceServer[] = [];
  for (const s of value as { urls?: unknown; username?: unknown; credential?: unknown }[]) {
    const urls = (Array.isArray(s?.urls) ? s.urls : [s?.urls]).filter((u): u is string => typeof u === "string" && /^(stun|turns?):[^\s]+$/i.test(u.trim())).map((u) => u.trim());
    if (urls.length === 0) continue;
    out.push({ urls, ...(typeof s.username === "string" ? { username: s.username } : {}), ...(typeof s.credential === "string" ? { credential: s.credential } : {}) });
  }
  return out;
}

/**
 * What he pasted: metered's «API» link (`https://<app>.metered.live/api/v1/turn/credentials?apiKey=…` - the relay's
 * passwords are fetched from it before each call), or the relay list itself (JSON `[{ urls, username, credential }]`,
 * as the dashboard shows it). Null = not one of these.
 */
export function parseTurnSetting(text: string | null | undefined): TurnSetting | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (/^https:\/\/[a-z0-9-]+\.metered\.live\/api\/v1\/turn\/credentials\?apiKey=[A-Za-z0-9_-]+$/i.test(t)) return { kind: "url", url: t };
  try {
    const servers = cleanIceServers(JSON.parse(t.replace(/^[^[]*/, "").replace(/;?\s*$/, "")));
    return servers.some((s) => [s.urls].flat().some((u) => /^turns?:/i.test(u))) ? { kind: "servers", servers } : null;
  } catch {
    return null;
  }
}

/** The relays for a call: Google's STUN + the private relay first, the public one behind it (when the private one's free
 * 500 MB of the month run out, a call still has a way). */
export function iceServersFor(privateServers: RTCIceServer[] | null): RTCIceServer[] {
  const turn = (privateServers ?? []).filter((s) => [s.urls].flat().some((u) => /^turns?:/i.test(u)));
  return turn.length ? [GOOGLE_STUN, ...privateServers!, OPEN_RELAY] : [GOOGLE_STUN, OPEN_RELAY];
}

/** «📶 جيد · مباشر» - the line under the call while it talks (round trip in ms, lost packets in %, relayed or not). */
export function callQualityText(q: { rttMs: number | null; lossPct: number | null; relayed: boolean }): string {
  const bad = (q.rttMs ?? 0) > 600 || (q.lossPct ?? 0) > 8;
  const mid = (q.rttMs ?? 0) > 300 || (q.lossPct ?? 0) > 3;
  const level = bad ? "📶 ضعيف" : mid ? "📶 متوسط" : "📶 جيد";
  return `${level} · ${q.relayed ? "عبر خادم الوصل" : "مباشر"}${q.rttMs != null ? ` · ${Math.round(q.rttMs)}ms` : ""}`;
}
