"use client";

import { useEffect } from "react";
import { browserLinkStorage, loadLinkConfig, runLinkRound } from "@/lib/deviceLink";

/** Asks for one round now (Settings' «🔄 مزامنة الآن»). */
export const DEVICE_LINK_NOW_EVENT = "starnet:device-link-now";
/** Fired after each round (Settings shows the status). */
export const DEVICE_LINK_EVENT = "starnet:device-link";

const EVERY_MS = 20_000;

/** He isn't in the middle of something: no open sheet / dialog and no field being typed in. A round
 * that brings changes reloads the page, so it waits for this. */
function isIdle(): boolean {
  if (document.visibilityState !== "visible") return false;
  if (document.querySelector('[role="dialog"], .party-sheet-backdrop, .dialog-backdrop')) return false;
  const active = document.activeElement;
  return !(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement);
}

/**
 * 🔗 The phone ↔ laptop link (lib/deviceLink.ts): a round every 20 s while the app is open, idle and
 * in front, and at once when it comes back. When the other side's changes landed, the page reloads so
 * every screen reads them (a screen holding the old list would otherwise write it back).
 */
export function DeviceLinkRunner() {
  useEffect(() => {
    let running = false;
    const tick = async (force = false) => {
      if (running || !(force || isIdle())) return;
      const storage = browserLinkStorage();
      if (!loadLinkConfig(storage)?.enabled) return;
      running = true;
      try {
        const result = await runLinkRound(storage);
        window.dispatchEvent(new CustomEvent(DEVICE_LINK_EVENT, { detail: result }));
        if (result.changedKeys.length > 0) window.location.reload();
      } finally {
        running = false;
      }
    };
    const first = window.setTimeout(() => void tick(), 3000);
    const timer = window.setInterval(() => void tick(), EVERY_MS);
    const onVisible = () => document.visibilityState === "visible" && void tick();
    const onNow = () => void tick(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(DEVICE_LINK_NOW_EVENT, onNow);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(DEVICE_LINK_NOW_EVENT, onNow);
    };
  }, []);
  return null;
}
