"use client";

import { useEffect } from "react";
import { isRepWorkspace } from "@/lib/repMode";
import { loadCloudConfig, pullCloudEvents, pushCloudPack } from "@/lib/waCloud";
import { TRAINING_EVENT } from "@/lib/agentTraining";
import { MENUS_EVENT } from "@/lib/agentMenus";
import { DESK_EVENT } from "@/lib/agentDesk";
import { AGENT_EVENT } from "@/lib/whatsappAgentLink";

/** Every 20 s while the app is open: what the Worker did comes in. */
const PULL_EVERY_MS = 20_000;

/**
 * ☁️ «واتساب الرسمي» (lib/waCloud.ts): on the phone that holds its settings, the Worker gets the agent's pack when
 * something changes (a lesson, the menus, a person's conversation) and at least every minute, and what it did comes in
 * every 20 seconds. Any platform (the Worker answers alone - the app only keeps it informed).
 */
export function WaCloudRunner() {
  useEffect(() => {
    if (isRepWorkspace()) return;
    const on = () => Boolean(loadCloudConfig()?.on);
    const tick = async () => {
      if (!on() || document.visibilityState !== "visible") return;
      await pullCloudEvents();
      await pushCloudPack();
    };
    const first = window.setTimeout(() => void tick(), 5000);
    const timer = window.setInterval(() => void tick(), PULL_EVERY_MS);
    const changed = () => on() && void pushCloudPack(true);
    for (const ev of [TRAINING_EVENT, MENUS_EVENT, DESK_EVENT]) window.addEventListener(ev, changed);
    const onAgent = () => on() && void pushCloudPack();
    window.addEventListener(AGENT_EVENT, onAgent);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      for (const ev of [TRAINING_EVENT, MENUS_EVENT, DESK_EVENT]) window.removeEventListener(ev, changed);
      window.removeEventListener(AGENT_EVENT, onAgent);
    };
  }, []);
  return null;
}
