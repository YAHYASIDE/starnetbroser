/**
 * 🔴🟡 The alerts while the app is closed (his Nov 7 2026 question «هل تأتي والتطبيق مقفول؟» and his choice «نعم، عبر خدمة
 * الخلفية»). The phone's background service («رد البوت والتطبيق مغلق», AlertWatch.java) reads about once a minute:
 *  - every rep's warnings channel (`starnet/{space}/flags` - the rep's app already writes there);
 *  - the team's alerts (`starnet/{team space}/alerts`): a small sealed copy of each team member's alert (device, note,
 *    level, who), written by the member who made it - the alert itself still travels in the team link as before.
 * It only shows a notification; the app takes everything when it opens. Pure, plus the write of a team alert.
 */

import type { LinkConfig } from "./deviceLink";
import type { FlagChannel, OwnerFlag } from "./repFlags";

export function teamAlertsPath(spaceId: string): string {
  return `starnet/${spaceId}/alerts`;
}

/** A team alert's copy for the others' background service - no picture, the note kept short. */
export function teamAlertPayload(flag: Pick<OwnerFlag, "id" | "deviceName" | "note" | "level" | "by" | "at">, memberId: string): string {
  return JSON.stringify({
    id: flag.id,
    deviceName: flag.deviceName,
    note: flag.note.slice(0, 300),
    level: flag.level === "urgent" ? "urgent" : "normal",
    by: flag.by ?? "",
    member: memberId,
    at: flag.at,
  });
}

/** A Firestore document id for it (letters, digits, - only). */
export function teamAlertDocId(flag: Pick<OwnerFlag, "id" | "at">): string {
  return `${flag.at}-${flag.id}`.replace(/[^A-Za-z0-9-]/g, "").slice(0, 120);
}

/** What the background service watches on this phone (JSON), or "" when there is nothing (no Firebase, no channel,
 * no team). The reps' channels are read only where they live (the phone that sends the copies). */
export function alertWatchConfig(input: {
  firebase: { apiKey: string; projectId: string } | null;
  channels: Record<string, FlagChannel>;
  repName: (repId: string) => string;
  link: Pick<LinkConfig, "spaceId" | "key" | "memberId" | "enabled"> | null;
  /** 💬 The conversations to announce (lib/chat.ts): `mine` = this phone's side («owner» / «rep»). */
  chats?: { conv: string; spaceId: string; key: string; mine: "owner" | "rep" }[];
}): string {
  if (!input.firebase) return "";
  const channels = Object.entries(input.channels).map(([repId, c]) => ({ spaceId: c.spaceId, key: c.key, repName: input.repName(repId) }));
  const team = input.link && input.link.enabled !== false ? { spaceId: input.link.spaceId, key: input.link.key } : null;
  const chats = input.chats ?? [];
  if (channels.length === 0 && !team && chats.length === 0) return "";
  return JSON.stringify({ apiKey: input.firebase.apiKey, projectId: input.firebase.projectId, me: input.link?.memberId ?? "", channels, team, chats });
}

/** Older than this, a team alert's copy is removed (by the member who writes the next one). */
export const TEAM_ALERT_KEEP_MS = 3 * 24 * 60 * 60 * 1000;

export function staleAlertIds(docs: { id: string; createTime?: string }[], now: number): string[] {
  return docs.filter((d) => d.createTime && now - Date.parse(d.createTime) > TEAM_ALERT_KEEP_MS).map((d) => d.id);
}
