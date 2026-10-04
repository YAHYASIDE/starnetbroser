"use client";

import { LocalBrowser } from "@starnet/local-browser-plugin";
import { homeSearchHref } from "./homeActions";
import { isRunningInAndroidApp } from "./localBrowser";
import { sendTelegramText } from "./telegram";

/** Where a tap on an event's notification lands. */
export const REPS_ROUTE = "/representatives";
export const REP_INBOX_ROUTE = "/representatives#rep-inbox";
export const PROMISES_ROUTE = "/tools#promises";
export const TELEGRAM_SETTINGS_ROUTE = "/settings";
export const KAST_ROUTE = "/starlink";
export const HOME_ROUTE = "/";

/** A device's card: the home screen searching for it. */
export function deviceRoute(deviceName: string): string {
  return deviceName.trim() ? homeSearchHref(deviceName.trim()) : HOME_ROUTE;
}

/** 🔔 The event in the phone's notification bar (first line = title); tapping it opens `route`.
 * Best effort - nothing happens outside the Android app or with notifications off. */
export async function notifyPhone(text: string, route: string = HOME_ROUTE): Promise<void> {
  if (!isRunningInAndroidApp() || !text.trim()) return;
  try {
    await LocalBrowser.postAppEvent({ text, route });
  } catch {
    // An old app build without postAppEvent, or notifications off - the event itself still happened.
  }
}

/** A rep's event for the operator: the Telegram bot and the phone's notification bar. */
export async function tellOwner(text: string, route: string = REPS_ROUTE): Promise<boolean> {
  void notifyPhone(text, route);
  return sendTelegramText(text);
}
