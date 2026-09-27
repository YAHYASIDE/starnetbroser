"use client";

import { useEffect } from "react";
import { isRunningInAndroidApp } from "@/lib/localBrowser";
import { isTelegramConnected, pollTelegram, telegramConnection } from "@/lib/telegram";
import { answerTelegramCommand } from "@/lib/telegramCommands";

/** While the app is open (and in front), checks for commands sent to the Telegram bot every few
 * seconds and answers them - the data lives only on this phone, so there's no one else to. */
export function TelegramBridge() {
  useEffect(() => {
    if (!isRunningInAndroidApp()) return;
    let busy = false;
    void telegramConnection();
    const tick = async () => {
      if (busy || document.visibilityState !== "visible" || !isTelegramConnected()) return;
      busy = true;
      try {
        for (const text of await pollTelegram()) await answerTelegramCommand(text);
      } finally {
        busy = false;
      }
    };
    const first = window.setTimeout(() => void tick(), 3000);
    const every = window.setInterval(() => void tick(), 15000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);
  return null;
}
