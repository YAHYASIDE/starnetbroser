"use client";

import type { RepDecisions } from "./repChanges";

// ---- 📝 the inbox: a rep's «تسجيلاتي» waiting for the operator ----

export interface RepInboxFile {
  /** The file's own id (one per send). */
  id: string;
  repId: string;
  sentAt: string;
  receivedAt: string;
  /** Still encrypted with the rep's code (Starlink sessions inside) - opened only to review. */
  file: string;
  /** Items still waiting, counted when it arrived / after each decision (for the home banner). */
  pendingCount: number;
}

export interface RepInbox {
  /** The newest file of each rep (a newer one carries everything still waiting). */
  files: RepInboxFile[];
  /** repId -> what the operator decided, per record version. */
  decisions: Record<string, RepDecisions>;
}

const INBOX_KEY = "starnet_rep_inbox_v1";
/** Fired when the inbox changed (the home banner and the review page refresh). */
export const REP_INBOX_EVENT = "starnet:rep-inbox";

export function loadRepInbox(): RepInbox {
  try {
    const raw = window.localStorage.getItem(INBOX_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<RepInbox>) : {};
    return { files: Array.isArray(parsed.files) ? parsed.files : [], decisions: parsed.decisions && typeof parsed.decisions === "object" ? parsed.decisions : {} };
  } catch {
    return { files: [], decisions: {} };
  }
}

export function saveRepInbox(inbox: RepInbox): boolean {
  try {
    window.localStorage.setItem(INBOX_KEY, JSON.stringify(inbox));
    window.dispatchEvent(new Event(REP_INBOX_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function repInboxCount(): number {
  return loadRepInbox().files.reduce((sum, f) => sum + f.pendingCount, 0);
}

/** The versions the operator rejected for a rep - his next copy drops them from his phone. */
export function repDecisions(repId: string): RepDecisions {
  return loadRepInbox().decisions[repId] ?? {};
}

