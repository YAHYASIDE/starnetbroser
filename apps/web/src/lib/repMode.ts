"use client";

import { loadRepMode, saveRepMode } from "./repDeviceTransfer";
import { saveRepCopy } from "./repCopy";
import { clearRepWorkspace, hasRepWorkspace } from "./repWorkspace";

/** Pages the rep's full app shows (the operator's choice): everything else goes back home. */
export const REP_ALLOWED_PATHS = ["/", "/clients", "/currencies", "/reminders", "/mailboxes", "/tools", "/settings", "/representatives"];

export function isRepAllowedPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return REP_ALLOWED_PATHS.some((p) => (p === "/" ? path === "/" : path === p || path.startsWith(`${p}/`)));
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
