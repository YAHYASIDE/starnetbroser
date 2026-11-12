"use client";

import { useEffect } from "react";
import { isRunningInAndroidApp } from "@/lib/localBrowser";
import { isRepWorkspace } from "@/lib/repMode";
import { drainWhatsApp, pushWhatsAppAnswers, WHATSAPP_EVENT } from "@/lib/whatsappLink";

const EVERY_MS = 60_000;

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
    };
  }, []);
  return null;
}
