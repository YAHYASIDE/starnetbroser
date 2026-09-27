"use client";

import { useEffect } from "react";
import { isRunningInAndroidApp } from "@/lib/localBrowser";
import { isRepsBotConnected, isTelegramConnected, pollRepsBot, pollTelegram, telegramConnection } from "@/lib/telegram";
import { answerRepMessage, answerTelegramCommand } from "@/lib/telegramCommands";

/** While the app is open (and in front), checks for commands sent to the Telegram bots (yours and
 * the reps') every few seconds and answers them - the data lives only on this phone. */
export function TelegramBridge() {
  useEffect(() => {
    if (!isRunningInAndroidApp()) return;
    let busy = false;
    void telegramConnection();
    const tick = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        if (isTelegramConnected()) for (const text of await pollTelegram()) await answerTelegramCommand(text);
        if (isRepsBotConnected()) for (const message of await pollRepsBot()) await answerRepMessage(message);
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
