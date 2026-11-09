"use client";

/**
 * 🔴🟡 The app's side of the alerts while it is closed (lib/alertWatch.ts): it tells the background service what to
 * watch, and writes a sealed copy of each team alert made here for the others' background service.
 */

import { loadChatListPrefs } from "./chatList";
import { alertWatchConfig, staleAlertIds, teamAlertDocId, teamAlertPayload, teamAlertsPath } from "./alertWatch";
import { TEAM_CONV } from "./chat";
import { chatTargets } from "./chatTransport";
import { browserLinkStorage, isMainMember, loadLinkConfig } from "./deviceLink";
import { isRepWorkspace } from "./repMode";
import { sealText } from "./deviceSyncCrypto";
import { deleteDocument, listDocuments, writeDocument } from "./firestoreRest";
import { loadLiveSyncConfig } from "./liveSyncConfig";
import { setAlertWatch } from "./localBrowser";
import { loadFlagChannels, ownerFirebase, type OwnerFlag } from "./repFlags";
import { loadRepresentativeStore } from "./repStore";

/** Hands the background service its watch list (Android only); the service's state, or null. The reps' channels
 * (warnings + chat) are watched by the main phone (YAHYA) or a phone without the team link only - the free Firebase
 * reads would not carry every phone reading every rep each minute; the team's alerts and chat by every member. A rep's
 * phone watches its own conversation with the operator. */
export async function pushAlertWatch(): Promise<{ running: boolean } | null> {
  if (isRepWorkspace()) {
    const target = chatTargets()[0];
    const config = target && !loadChatListPrefs().muted.includes(target.conv)
      ? alertWatchConfig({ firebase: target.firebase, channels: {}, repName: () => "", link: null, chats: [{ conv: target.conv, spaceId: target.spaceId, key: target.key, mine: "rep" }] })
      : "";
    return setAlertWatch(config);
  }
  const link = loadLinkConfig(browserLinkStorage());
  const reps = loadRepresentativeStore();
  const watchReps = !link || isMainMember(link.memberId);
  // 🔕 a muted conversation is not announced while the app is closed either
  const muted = new Set(loadChatListPrefs().muted);
  const chats = chatTargets()
    .filter((t) => (t.conv === TEAM_CONV || watchReps) && !muted.has(t.conv))
    .map((t) => ({ conv: t.conv, spaceId: t.spaceId, key: t.key, mine: "owner" as const }));
  const config = alertWatchConfig({
    firebase: ownerFirebase({ link: () => link, live: loadLiveSyncConfig }),
    channels: watchReps ? loadFlagChannels() : {},
    repName: (id) => reps[id]?.name ?? "",
    link,
    chats,
  });
  return setAlertWatch(config);
}

/** 👥 The team alerts made on this phone: a sealed copy each in `starnet/{team}/alerts` (the others' phones show it
 * even with the app closed); copies older than 3 days go. Best effort - the alert itself travels in the link. */
export async function announceTeamFlags(flags: OwnerFlag[]): Promise<void> {
  const link = loadLinkConfig(browserLinkStorage());
  if (!link || link.enabled === false) return;
  const mine = flags.filter((f) => f.by && !f.repId);
  if (mine.length === 0) return;
  try {
    for (const flag of mine) {
      const sealed = await sealText(teamAlertPayload(flag, link.memberId), link.key);
      await writeDocument(link, `${teamAlertsPath(link.spaceId)}/${teamAlertDocId(flag)}`, { sealed: JSON.stringify(sealed) });
    }
    const listed = await listDocuments(link, teamAlertsPath(link.spaceId));
    if (listed.ok) for (const id of staleAlertIds(listed.value, Date.now())) await deleteDocument(link, `${teamAlertsPath(link.spaceId)}/${id}`);
  } catch {
    // offline: the link still carries the alert
  }
}
