/**
 * ⏺ Call recordings (his Nov 8 2026 ask «أضف تسجيل المكالمة»): the voice of both sides, kept on THIS phone only - the
 * sound in the proofs store (`callrec:<call id>`, like the payment photos) and a small list here (`starnet.callRecordings`,
 * phone-only, never sent). The newest 30 are kept. When a recording starts, the other side is told in the conversation
 * («⏺ بدأ تسجيل المكالمة») - nobody is recorded without knowing. Pure + a small store.
 */

export interface CallRecording {
  /** The call's id - the proof key is `callrec:<id>`. */
  id: string;
  conv: string;
  peer: string;
  /** ms epoch - when it started. */
  at: number;
  seconds: number;
}

export const MAX_RECORDINGS = 30;
export const RECORDING_STARTED_TEXT = "⏺ بدأ تسجيل المكالمة";
const KEY = "starnet.callRecordings";
export const CALL_RECORDINGS_EVENT = "starnet:call-recordings";

export function recordingKey(id: string): string {
  return `callrec:${id}`;
}

/** The list with one more (newest first); also the ids dropped beyond 30 (their sound to delete). */
export function addRecording(list: CallRecording[], rec: CallRecording, max = MAX_RECORDINGS): { list: CallRecording[]; dropped: string[] } {
  const next = [rec, ...list.filter((r) => r.id !== rec.id)].sort((a, b) => b.at - a.at);
  return { list: next.slice(0, max), dropped: next.slice(max).map((r) => r.id) };
}

export function recordingsOf(list: CallRecording[], conv: string): CallRecording[] {
  return list.filter((r) => r.conv === conv);
}

export function loadRecordings(): CallRecording[] {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? (v as CallRecording[]) : [];
  } catch {
    return [];
  }
}

export function saveRecordings(list: CallRecording[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(CALL_RECORDINGS_EVENT));
  } catch {
    // storage full
  }
}
