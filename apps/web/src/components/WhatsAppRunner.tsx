"use client";

import { useEffect } from "react";
import { isRunningInAndroidApp } from "@/lib/localBrowser";
import { isRepWorkspace } from "@/lib/repMode";
import { drainWhatsApp, pushWhatsAppAnswers, WHATSAPP_EVENT } from "@/lib/whatsappLink";
import { AGENT_EVENT, agentAway, agentHeartbeat, importNativeAgent, loadAgentSettings, pushAgentPack, pushAgentSetup, runWhatsAppAgent } from "@/lib/whatsappAgentLink";
import { TRAINING_EVENT } from "@/lib/agentTraining";

const EVERY_MS = 60_000;
/** 🤖 How often the agent looks for waiting messages (a customer on WhatsApp expects an answer within seconds). */
const AGENT_EVERY_MS = 5_000;

/** 💬 WhatsApp Business (lib/whatsappLink.ts): emails → devices, answers → the phone's reader. Owner's Android only. */
export function WhatsAppRunner() {
  useEffect(() => {
    if (!isRunningInAndroidApp() || isRepWorkspace()) return;
    let busy = false;
    const run = async () => {
      if (busy) return;
      busy = true;
      try {
        await drainWhatsApp();
        await pushWhatsAppAnswers();
      } catch {
        // the next minute tries again
      } finally {
        busy = false;
      }
    };
    // 🤖 the agent: its settings to the phone, and the waiting messages every few seconds while it is on
    const agent = async () => {
      try {
        await pushAgentSetup();
        if (loadAgentSettings().on) {
          // 🤖 «I'm here» first (the reader leaves the messages to the app), then what it answered while the app was
          // closed, then the waiting messages; the pack for the next time the app is closed
          await agentHeartbeat();
          await importNativeAgent();
          await runWhatsAppAgent();
          await pushAgentPack();
        }
      } catch {
        // the next tick tries again
      }
    };
    const agentTimer = window.setInterval(() => void agent(), AGENT_EVERY_MS);
    const onAgent = () => void agent();
    window.addEventListener(AGENT_EVENT, onAgent);
    // a new lesson / answer: the reader's pack at once
    const onTraining = () => void pushAgentPack(true).catch(() => undefined);
    window.addEventListener(TRAINING_EVENT, onTraining);
    // 📴 off the screen: the reader takes over at once; back: the app again
    const onAgentVisible = () => {
      if (document.visibilityState === "visible") void agent();
      else void agentAway().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onAgentVisible);
    const first = window.setTimeout(() => void run(), 4000);
    const timer = window.setInterval(() => void run(), EVERY_MS);
    const onVisible = () => document.visibilityState === "visible" && void run();
    const onNow = () => void run();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(WHATSAPP_EVENT, onNow);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(WHATSAPP_EVENT, onNow);
      window.clearInterval(agentTimer);
      window.removeEventListener(AGENT_EVENT, onAgent);
      window.removeEventListener(TRAINING_EVENT, onTraining);
      document.removeEventListener("visibilitychange", onAgentVisible);
    };
  }, []);
  return null;
}
