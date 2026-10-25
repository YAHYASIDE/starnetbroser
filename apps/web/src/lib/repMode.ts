"use client";

import { loadRepMode, saveRepMode } from "./repDeviceTransfer";
import { loadRepCopy, saveRepCopy } from "./repCopy";
import { clearRepWorkspace, hasRepWorkspace } from "./repWorkspace";
import { allowedPaths, pathAllowed, repPermissions, SIMPLE_ADD_DEVICE } from "./repPermissions";

/** Pages the rep's full app shows: the ones the operator gave him (🔑 lib/repPermissions.ts - by
 * default home, clients, تقاريري, reminders, tools, reports, currencies, mailboxes, settings);
 * everything else goes back home. */
export function isRepAllowedPath(pathname: string): boolean {
  return pathAllowed(pathname, allowedPaths(repPermissions()));
}

/** 🔑 On the rep's phone: whether the operator gave him this feature. Always true on the operator's own. */
export function repCan(featureId: string): boolean {
  return !isRepWorkspace() || repPermissions().has(featureId);
}

/** ✂️ «إضافة جهاز مبسّطة»: the rep his new devices are fixed on (himself), or null when the form is the full one. */
export function simpleAddRepId(): string | null {
  if (!isRepWorkspace() || !repPermissions().has(SIMPLE_ADD_DEVICE)) return null;
  return loadRepCopy()?.repId ?? null;
}

/** The rep's phone runs the full app on his copy (📱 وضع المندوب + a copy with stores applied). */
export function isRepWorkspace(): boolean {
  return typeof window !== "undefined" && loadRepMode() !== null && hasRepWorkspace();
}

/** Opens «📱 أجهزة للإرسال» (the add-and-send screen) from inside the full app. */
export const REP_SENDER_EVENT = "starnet:rep-sender";

/** Leaving rep mode removes the operator's data from this phone. */
export function exitRepMode(): void {
  clearRepWorkspace();
  saveRepCopy(null);
  saveRepMode(null);
}
