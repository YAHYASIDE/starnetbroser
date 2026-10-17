"use client";

import { useEffect } from "react";
import { tellOwner } from "@/lib/appEvents";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { demoAccounts } from "@/lib/demoData";
import { isRunningInAndroidApp } from "@/lib/localBrowser";
import { autoCopyKey, decideAutoCopy, loadAutoCopyStates, saveAutoCopyStates } from "@/lib/repCopyAuto";
import { sendRepCopy } from "@/lib/repCopySend";
import { repPhoneKey } from "@/lib/repDeviceTransfer";
import { isRepWorkspace } from "@/lib/repMode";
import { listRepresentatives, loadRepresentativeStore } from "@/lib/repStore";
import { loadScheduledSyncs } from "@/lib/scheduledSyncs";
import { loadRepChats } from "@/lib/telegram";

const EVERY_MS = 60_000;

/** 📤 «نسخة المندوب تلقائيًا» (lib/repCopyAuto.ts): once a minute while the app is open, each rep
 * whose copy is out of date and unchanged for 10 minutes gets his copy through the reps bot. */
export function RepCopyAutoRunner() {
  useEffect(() => {
    if (!isRunningInAndroidApp() || isRepWorkspace()) return;
    let busy = false;
    const tick = async () => {
      if (busy || !loadScheduledSyncs().repCopy) return;
      busy = true;
      try {
        const accounts = loadDemoAccounts(demoAccounts);
        const chats = loadRepChats();
        const states = loadAutoCopyStates();
        const next: typeof states = {};
        const now = Date.now();
        for (const rep of listRepresentatives(loadRepresentativeStore())) {
          // Only by the bot, to his own linked phone - never the share sheet.
          if (!chats[rep.id] || !repPhoneKey(rep.id)) continue;
          const step = decideAutoCopy(states[rep.id], autoCopyKey(accounts, rep.id), now);
          if (step.state) next[rep.id] = step.state;
          if (!step.send) continue;
          const sent = await sendRepCopy(rep, accounts);
          if (sent.ok) {
            delete next[rep.id];
            await tellOwner(`📤 أُرسلت نسخة ${rep.name} وحدها (${sent.devices} جهاز)`);
          } else if (step.state) {
            next[rep.id] = { ...step.state, failedAt: now };
          }
        }
        saveAutoCopyStates(next);
      } finally {
        busy = false;
      }
    };
    const first = window.setTimeout(() => void tick(), 8000);
    const timer = window.setInterval(() => void tick(), EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);
  return null;
}
