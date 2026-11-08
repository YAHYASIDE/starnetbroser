/**
 * 📞 The in-app voice call (his Nov 8 2026 ask «ابدأ بالاتصال الصوتي داخل التطبيق»; told before: it rings only while the
 * app is open, and on some mobile networks it may not connect). Phone to phone (WebRTC, the voice encrypted end to end);
 * the two phones meet through one Firestore document `starnet/{space}/calls/{id}` of the conversation (the team's or a
 * rep's), its offer / answer sealed with that conversation's key, its `state` plain. The caller also posts a chat
 * message «📞 مكالمة صوتية» (lib/chat.ts `call`): that is what rings the other side, shows in the history and in the
 * background notification. Pure: states, timing, words.
 */

/** Fired by the chat's listener when a call message should ring ({ conv, id, by }) - CallManager answers it. */
export const CALL_INCOMING_EVENT = "starnet:call-incoming";

export type CallState = "ringing" | "answered" | "declined" | "missed" | "ended";

/** How long it rings before «لم يرد». */
export const RING_MS = 45_000;
/** After «رد», how long the phones may take to reach each other. */
export const CONNECT_MS = 25_000;
/** Non-trickle ICE: how long the addresses are gathered before the offer / answer goes. */
export const ICE_GATHER_MS = 4_000;

/** Public STUN (finds each phone's address) and the Open Relay Project's published free relay (when the networks don't
 * let the phones reach each other directly; the voice stays encrypted - the relay can't hear it). */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turn:openrelay.metered.ca:443?transport=tcp"], username: "openrelayproject", credential: "openrelayproject" },
];

export function callDocPath(spaceId: string, callId: string): string {
  return `starnet/${spaceId}/calls/${callId}`;
}

export function isCallState(v: unknown): v is CallState {
  return v === "ringing" || v === "answered" || v === "declined" || v === "missed" || v === "ended";
}

/** A call message still worth ringing for (not mine, under 45 s old by the sender's clock - with a minute of slack for
 * clocks that differ). */
export function shouldRing(message: { call?: { id: string }; at: number }, mine: boolean, now: number): boolean {
  return Boolean(message.call) && !mine && now - message.at < RING_MS + 60_000 && now - message.at > -60_000;
}

/** «1:05» / «12:00». */
export function callClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** What the screen says when a call is over. */
export function endWords(reason: CallState | "failed" | "elsewhere" | "nomic" | "offline"): string {
  switch (reason) {
    case "declined":
      return "رفض المكالمة";
    case "missed":
      return "لم يرد";
    case "failed":
      return "تعذّر الاتصال - الشبكة لم تسمح. جرّب مرة أخرى أو اتصل من واتساب";
    case "elsewhere":
      return "رُدّ عليها من هاتف آخر";
    case "nomic":
      return "🎤 اسمح للتطبيق بالميكروفون ثم أعد المحاولة";
    case "offline":
      return "لا اتصال بالإنترنت";
    default:
      return "انتهت المكالمة";
  }
}
