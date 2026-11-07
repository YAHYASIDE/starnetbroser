/**
 * 🚩📎 What a device's browser staged for the app - a team alert (with its screenshot) and a screenshot kept in the
 * device's record - taken on ANY page (his Nov 7 2026 report: «لقطات الشاشة… لا تأتي للمسؤول»: only the home page
 * took them, and coming back from the browser to another page left them waiting). Pure: the reads in, what to save and
 * which reads are done out. «✅ تم التوثيق» stays with the home page (it runs the card's own handler).
 */

import { addIncomingFlags, isBrowserTeamFlag, teamFlagsFromBrowser, type OwnerFlag, type OwnerFlagStore } from "./repFlags";
import { addDeviceShot, isShotImage, shotKey, type DeviceShotStore } from "./deviceShots";

export interface StagedRead {
  syncId: string;
  accountId: string;
  fields: Record<string, unknown>;
}

export function isKeptShot(sync: StagedRead): boolean {
  return Boolean((sync.fields as { deviceShot?: unknown }).deviceShot);
}

/** The alerts and kept shots among the reads: the stores after them, the pictures to keep, the reads done. */
export function takeBrowserActions(
  syncs: StagedRead[],
  input: { flags: OwnerFlagStore; shots: DeviceShotStore; devices: { id: string; name: string; email?: string }[]; by: string },
): { flags: OwnerFlagStore; shots: DeviceShotStore; pictures: { key: string; dataUrl: string }[]; done: string[]; added: number; addedFlags: OwnerFlag[] } {
  const flagReads = syncs.filter((s) => isBrowserTeamFlag(s));
  const { flags: newFlags, syncIds } = teamFlagsFromBrowser(flagReads as never, input.devices, input.by);
  const merged = addIncomingFlags(input.flags, newFlags);
  let shots = input.shots;
  const pictures: { key: string; dataUrl: string }[] = [];
  const done = [...syncIds];
  for (const s of syncs.filter(isKeptShot)) {
    done.push(s.syncId);
    const shot = (s.fields as { deviceShot?: { at?: unknown; image?: unknown } }).deviceShot;
    if (!shot || !isShotImage(shot.image) || !input.devices.some((d) => d.id === s.accountId)) continue;
    const at = typeof shot.at === "number" ? shot.at : Date.now();
    pictures.push({ key: shotKey(s.accountId, at), dataUrl: shot.image });
    shots = addDeviceShot(shots, s.accountId, at);
  }
  return { flags: merged.store, shots, pictures, done, added: merged.added.length, addedFlags: merged.added };
}
