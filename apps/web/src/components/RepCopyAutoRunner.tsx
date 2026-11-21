"use client";

import { lowNetOn } from "@/lib/lowNet";
import { loadCurrencyStore } from "@/lib/currencyStore";
import { useEffect } from "react";
import { tellOwner } from "@/lib/appEvents";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { demoAccounts } from "@/lib/demoData";
import { isRunningInAndroidApp } from "@/lib/localBrowser";
import { AUTO_COPY_QUIET_MS, RATES_QUIET_MS, autoCopyKey, decideAutoCopy, loadAutoCopyStates, loadSentRates, markSentRates, ratesFingerprint, saveAutoCopyStates } from "@/lib/repCopyAuto";
import { flagFirebase, sendRepCopy } from "@/lib/repCopySend";
import { repNeedsFlagLink } from "@/lib/repFlags";
import { repPhoneKey } from "@/lib/repDeviceTransfer";
import { isRepWorkspace } from "@/lib/repMode";
import { listRepresentatives, loadRepresentativeStore } from "@/lib/repStore";
import { loadScheduledSyncs } from "@/lib/scheduledSyncs";
import { loadRepChats } from "@/lib/telegram";

/** Every 15 s: a rate change reaches the reps within about half a minute (RATES_QUIET_MS). */
const EVERY_MS = 15_000;

/** 📤 «نسخة المندوب تلقائيًا» (lib/repCopyAuto.ts): once a minute while the app is open, each rep
 * whose copy is out of date and unchanged for 10 minutes gets his copy through the reps bot. */
export function RepCopyAutoRunner() {
  useEffect(() => {
    if (!isRunningInAndroidApp() || isRepWorkspace()) return;
    let busy = false;
    // 🚩 a rep whose phone hasn't got his warnings' channel gets one copy at once (even with the
    // automatic copy off) - tried again at most every 10 minutes.
    const linkTried: Record<string, number> = {};
    const tick = async () => {
      if (busy) return;
      // 📶 weak internet (his button): the automatic copies wait
      if (lowNetOn()) return;
      busy = true;
      try {
        const hasFirebase = flagFirebase() !== null;
        const auto = loadScheduledSyncs().repCopy;
        if (!auto && !hasFirebase) return;
        const accounts = loadDemoAccounts(demoAccounts);
        const chats = loadRepChats();
        const states = loadAutoCopyStates();
        const next: typeof states = {};
        const now = Date.now();
        for (const rep of listRepresentatives(loadRepresentativeStore())) {
          // Only by the bot, to his own linked phone - never the share sheet.
          if (!chats[rep.id] || !repPhoneKey(rep.id)) continue;
          if (repNeedsFlagLink(rep.id, hasFirebase) && now - (linkTried[rep.id] ?? 0) > 10 * 60_000) {
            linkTried[rep.id] = now;
            const sent = await sendRepCopy(rep, accounts);
            if (sent.ok) await tellOwner(`🚩 أُرسلت نسخة ${rep.name} وحدها - تحذيراته تصلك الآن`);
            continue;
          }
          if (!auto) {
            if (states[rep.id]) next[rep.id] = states[rep.id]!;
            continue;
          }
          // 💱 a rate he changed goes out too (his Nov 18 2026 ask); the first time, today's rates are only recorded
          const sentRates = loadSentRates();
          const rates = ratesFingerprint(loadCurrencyStore());
          if (sentRates[rep.id] === undefined) markSentRates(rep.id, rates);
          // 💱 a rate / pin change goes out within seconds, a device change after 10 quiet minutes
          const ratesMoved = sentRates[rep.id] !== undefined && sentRates[rep.id] !== rates;
          const step = decideAutoCopy(states[rep.id], autoCopyKey(accounts, rep.id, undefined, rates, sentRates[rep.id] ?? rates), now, ratesMoved ? RATES_QUIET_MS : AUTO_COPY_QUIET_MS);
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
