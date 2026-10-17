/**
 * 📤 «نسخة المندوب تلقائيًا» (his Oct 17 2026 choice - it replaces «أرسلها بيدي»): when a rep's
 * devices change (a device given to him, its customer changed, one taken back), his copy goes out by
 * itself through the reps bot 10 minutes after the LAST change - one file once he's done editing,
 * not one per tap. Only to a rep linked to the bot and whose phone is linked (never the share sheet);
 * only after a first copy was sent by hand (that's what the gaps are measured against). Runs while
 * the app is open (RepCopyAutoRunner); a change made just before closing goes out at the next open.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { copyGaps, copySnapshot, loadRepCopySentDevices } from "./repCopy";

export const AUTO_COPY_QUIET_MS = 10 * 60_000;
/** After a failed send, wait before trying again (bot offline, phone unlinked…). */
export const AUTO_COPY_RETRY_MS = 30 * 60_000;

export interface AutoCopyState {
  /** What his devices look like now (they changed when this changes). */
  key: string;
  /** When they last changed. */
  since: number;
  failedAt?: number;
}

/**
 * One rep, now: `key` null = his copy is current. Returns the state to keep and whether to send.
 */
export function decideAutoCopy(prev: AutoCopyState | undefined, key: string | null, now: number): { state?: AutoCopyState; send: boolean } {
  if (key === null) return { send: false };
  if (!prev || prev.key !== key) return { state: { key, since: now }, send: false };
  if (prev.failedAt && now - prev.failedAt < AUTO_COPY_RETRY_MS) return { state: prev, send: false };
  return { state: prev, send: now - prev.since >= AUTO_COPY_QUIET_MS };
}

/** His devices' state when his last copy is out of date, else null. */
export function autoCopyKey(accounts: StarlinkAccountSummary[], repId: string, sent: Record<string, Record<string, string>> = loadRepCopySentDevices()): string | null {
  if (!copyGaps(sent[repId], accounts, repId)) return null;
  const now = copySnapshot(accounts, repId);
  return JSON.stringify(Object.keys(now).sort().map((id) => [id, now[id]]));
}

const KEY = "starnet.repCopyAuto";

export function loadAutoCopyStates(): Record<string, AutoCopyState> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, AutoCopyState>) : {};
  } catch {
    return {};
  }
}

export function saveAutoCopyStates(states: Record<string, AutoCopyState>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(states));
  } catch {
    // the next tick starts the wait again
  }
}
