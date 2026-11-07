"use client";

/**
 * 🔴🟡 The app's side of the alerts while it is closed (lib/alertWatch.ts): it tells the background service what to
 * watch, and writes a sealed copy of each team alert made here for the others' background service.
 */

import { alertWatchConfig, staleAlertIds, teamAlertDocId, teamAlertPayload, teamAlertsPath } from "./alertWatch";
import { browserLinkStorage, loadLinkConfig } from "./deviceLink";
import { sealText } from "./deviceSyncCrypto";
import { deleteDocument, listDocuments, writeDocument } from "./firestoreRest";
import { loadLiveSyncConfig } from "./liveSyncConfig";
import { setAlertWatch } from "./localBrowser";
import { loadFlagChannels, ownerFirebase, type OwnerFlag } from "./repFlags";
import { loadRepresentativeStore } from "./repStore";

/** Hands the background service its watch list (Android only); the service's state, or null. */
export async function pushAlertWatch(): Promise<{ running: boolean } | null> {
  const link = loadLinkConfig(browserLinkStorage());
  const reps = loadRepresentativeStore();
  const config = alertWatchConfig({
    firebase: ownerFirebase({ link: () => link, live: loadLiveSyncConfig }),
    channels: loadFlagChannels(),
    repName: (id) => reps[id]?.name ?? "",
    link,
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
