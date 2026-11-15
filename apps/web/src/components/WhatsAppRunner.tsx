"use client";

import { useEffect } from "react";
import { isRunningInAndroidApp } from "@/lib/localBrowser";
import { isRepWorkspace } from "@/lib/repMode";
import { drainWhatsApp, pushWhatsAppAnswers, WHATSAPP_EVENT } from "@/lib/whatsappLink";
import { AGENT_EVENT, loadAgentSettings, pushAgentSetup, runWhatsAppAgent } from "@/lib/whatsappAgentLink";

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
        if (loadAgentSettings().on) await runWhatsAppAgent();
      } catch {
        // the next tick tries again
      }
    };
    const agentTimer = window.setInterval(() => void agent(), AGENT_EVERY_MS);
    const onAgent = () => void agent();
    window.addEventListener(AGENT_EVENT, onAgent);
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
    };
  }, []);
  return null;
}
