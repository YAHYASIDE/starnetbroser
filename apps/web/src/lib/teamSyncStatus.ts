/**
 * 🟥 «الأجهزة غير المكتملة» (his Nov 7 2026 ask «خط أحمر مثل الذي يظهر في تحديث الأجهزة… يظهر لي الأجهزة التي لم
 * تتم مزامنتها كاملًا»): each member of the link team against YAHYA (the main one), from the counts every member
 * carries in its head (lib/deviceLink.ts). A difference shows only once it has lasted a while - right after a save the
 * numbers differ for a few seconds, that is not «ناقص». Pure.
 */

import { compareCounts, MAIN_MEMBER, type LinkState, type TeamMember } from "./deviceLink";

export interface MemberSync {
  id: string;
  name: string;
  isMe: boolean;
  /** Its numbers are known (its head carried them - an older app doesn't). */
  known: boolean;
  /** What differs from YAHYA: per store, its number and YAHYA's. */
  diffs: { label: string; theirs: number; main: number }[];
  /** When its numbers were last written (its last sync), ISO. */
  at?: string;
}

/** Every member but YAHYA, against YAHYA. Empty when YAHYA's own numbers aren't known here. */
export function teamSyncRows(state: Pick<LinkState, "counts" | "theirCounts"> | null, team: TeamMember[], myId: string): MemberSync[] {
  if (!state) return [];
  const main = myId === MAIN_MEMBER ? state.counts : state.theirCounts?.[MAIN_MEMBER]?.counts;
  if (!main || !team.some((m) => m.id === MAIN_MEMBER)) return [];
  return team
    .filter((m) => m.id !== MAIN_MEMBER)
    .map((m) => {
      const isMe = m.id === myId;
      const counts = isMe ? state.counts : state.theirCounts?.[m.id]?.counts;
      const at = isMe ? undefined : state.theirCounts?.[m.id]?.at;
      return {
        id: m.id,
        name: m.name,
        isMe,
        known: Boolean(counts),
        diffs: counts ? compareCounts(counts, main).map(({ label, mine, theirs }) => ({ label, theirs: mine, main: theirs })) : [],
        ...(at ? { at } : {}),
      };
    });
}

/** The members out of step for longer than `graceMs` - the red line's list; `since` remembers when each started. */
export function lastingOutOfSync(rows: MemberSync[], since: Record<string, number>, now: number, graceMs = 120_000): { ids: string[]; since: Record<string, number> } {
  const next: Record<string, number> = {};
  const ids: string[] = [];
  for (const r of rows) {
    if (r.known && r.diffs.length === 0) continue;
    next[r.id] = since[r.id] ?? now;
    if (now - next[r.id]! >= graceMs) ids.push(r.id);
  }
  return { ids, since: next };
}

/** «🔗 المسؤول 2 غير مكتمل» / «🔗 2 أجهزة غير مكتملة» */
export function teamLineCaption(names: string[]): string {
  return names.length === 1 ? `🔗 «${names[0]}» غير مكتمل` : `🔗 ${names.length} أجهزة غير مكتملة`;
}
