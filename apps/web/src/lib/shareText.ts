"use client";

import { Share } from "@capacitor/share";
import { isRunningInAndroidApp } from "./localBrowser";

/** Opens the phone's share sheet with `text` (WhatsApp, Telegram, SMS...); on a browser without
 * one, copies it. Returns what happened, for a short message. */
export async function shareText(text: string, title: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (isRunningInAndroidApp()) {
      await Share.share({ title, text, dialogTitle: title });
      return "shared";
    }
    const nav: Navigator | undefined = typeof navigator === "undefined" ? undefined : navigator;
    if (nav && typeof nav.share === "function") {
      await nav.share({ title, text });
      return "shared";
    }
    if (!nav?.clipboard) return "failed";
    await nav.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
