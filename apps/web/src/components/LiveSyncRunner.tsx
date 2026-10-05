"use client";

import { useEffect } from "react";
import { runLiveSyncOnce } from "@/lib/liveSync";
import { loadLiveSyncConfig } from "@/lib/liveSyncConfig";
import { listRepresentatives, loadRepresentativeStore } from "@/lib/repStore";

/** Asks for one round now (Settings' «🔄 مزامنة الآن»). */
export const LIVE_SYNC_NOW_EVENT = "starnet:live-sync-now";

const EVERY_MS = 30_000;

/** ☁️ Runs the live link with the reps (lib/liveSync.ts) every 30 s while the app is open and in
 * front, and at once when it comes back to the front. Silent: the status shows in Settings. */
export function LiveSyncRunner() {
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible" || !loadLiveSyncConfig()?.enabled) return;
      const reps = listRepresentatives(loadRepresentativeStore()).map((r) => ({ id: r.id, name: r.name }));
      void runLiveSyncOnce(fetch, reps);
    };
    const first = window.setTimeout(tick, 4000);
    const timer = window.setInterval(tick, EVERY_MS);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(LIVE_SYNC_NOW_EVENT, tick);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(LIVE_SYNC_NOW_EVENT, tick);
    };
  }, []);
  return null;
}
