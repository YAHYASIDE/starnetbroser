"use client";

import { useEffect } from "react";
import { isRunningInAndroidApp } from "@/lib/localBrowser";
import {
  isRepsBotConnected,
  isTelegramConnected,
  isTelegramInstant,
  pollRepsBot,
  pollTelegram,
  sendRepKeyboardOnce,
  setTelegramInstant,
  takeTelegramInbox,
  telegramConnection,
} from "@/lib/telegram";
import { answerRepMessage, answerTelegramCommand, refreshTelegramReplies } from "@/lib/telegramCommands";

const INBOX_EVERY_MS = 3000;
const POLL_EVERY_MS = 4000;
const REPLIES_EVERY_MS = 60000;

/**
 * The app's side of the Telegram bots (the data lives only on this phone).
 * - Replies with the app closed on (default): the native service reads the bots; while the app is
 *   in front it hands every message here to answer with live data, and when closed it answers
 *   from the texts prepared here (refreshed every minute and when the app goes to the background).
 * - Off: the app reads the bots itself, only while it's open.
 */
export function TelegramBridge() {
  useEffect(() => {
    if (!isRunningInAndroidApp()) return;
    let busy = false;
    let lastPoll = 0;
    let lastReplies = 0;
    const anyBot = () => isTelegramConnected() || isRepsBotConnected();

    void telegramConnection().then(() => {
      if (anyBot()) void setTelegramInstant(isTelegramInstant());
      void sendRepKeyboardOnce();
    });

    const tick = async () => {
      if (busy || document.visibilityState !== "visible" || !anyBot()) return;
      busy = true;
      try {
        // The service may be off (switched off, or Android refused to start it): then the app
        // reads the bots itself while open - never nobody answering.
        const inbox = isTelegramInstant() ? await takeTelegramInbox() : { messages: [], running: false };
        for (const message of inbox.messages) {
          if (message.bot === "reps") await answerRepMessage(message, message.replied);
          else await answerTelegramCommand(message.text);
        }
        if (inbox.running) {
          if (Date.now() - lastReplies >= REPLIES_EVERY_MS) {
            lastReplies = Date.now();
            await refreshTelegramReplies();
          }
        } else if (Date.now() - lastPoll >= POLL_EVERY_MS) {
          lastPoll = Date.now();
          if (isTelegramConnected()) for (const text of await pollTelegram()) await answerTelegramCommand(text);
          if (isRepsBotConnected()) for (const message of await pollRepsBot()) await answerRepMessage(message);
        }
      } finally {
        busy = false;
      }
    };

    // Leaving the app: hand over the freshest answers for while it's closed.
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && anyBot() && isTelegramInstant()) void refreshTelegramReplies();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const first = window.setTimeout(() => void tick(), 2000);
    const every = window.setInterval(() => void tick(), INBOX_EVERY_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);
  return null;
}
