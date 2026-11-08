"use client";

import { useEffect } from "react";
import { addChatMessages, CHAT_EVENT, saveChatSeen, chatNotification, isMine, loadChat, messagesOf, saveChat, type ChatMessage } from "@/lib/chat";
import { chatTargets, listenChat, listenChatReads, sendChat, type ChatTarget } from "@/lib/chatTransport";
import { notifyPhone } from "@/lib/appEvents";
import { browserLinkStorage, loadLinkConfig } from "@/lib/deviceLink";
import { isRepWorkspace } from "@/lib/repMode";
import { CALL_INCOMING_EVENT, shouldRing } from "@/lib/callSignal";

/** The conversation open on the screen now (the chat page sets it) - no notification for it. */
export const chatView: { conv: string | null } = { conv: null };
/** Fired with { conv, live } when a conversation's listener goes live / fails. */
export const CHAT_LIVE_EVENT = "starnet:chat-live";

const UNSENT_KEY = "starnet.chatUnsent";
const MARGIN_MS = 10 * 60 * 1000;
const FIRST_LOOK_MS = 14 * 24 * 60 * 60 * 1000;

export function loadUnsent(): string[] {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(UNSENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveUnsent(ids: string[]): void {
  try {
    window.localStorage.setItem(UNSENT_KEY, JSON.stringify([...new Set(ids)].slice(-200)));
  } catch {
    // storage full
  }
}

/** 💬 Sends a message from this phone: kept here at once («⏳» until it reached Firebase). */
export async function postChat(target: ChatTarget, message: ChatMessage): Promise<boolean> {
  saveChat(addChatMessages(loadChat(), [message]).store);
  saveUnsent([...loadUnsent(), message.id]);
  const ok = await sendChat(target, message);
  if (ok) saveUnsent(loadUnsent().filter((id) => id !== message.id));
  window.dispatchEvent(new Event(CHAT_EVENT));
  return ok;
}

/**
 * 💬 The chat's listeners while the app is open (lib/chatTransport.ts): every conversation this phone holds, live;
 * what comes in is kept and announced (a phone notification, unless that conversation is on the screen); what
 * couldn't go out goes again every 15 s.
 */
export function ChatRunner() {
  useEffect(() => {
    const stops = new Map<string, () => void>();
    const side = { rep: isRepWorkspace(), memberId: loadLinkConfig(browserLinkStorage())?.memberId ?? "" };
    const start = () => {
      const targets = chatTargets();
      const wanted = new Set(targets.flatMap((t) => [`${t.conv}|${t.spaceId}`, `${t.conv}|${t.spaceId}|reads`]));
      for (const [k, stop] of stops) {
        if (wanted.has(k)) continue;
        stop();
        stops.delete(k);
      }
      for (const target of targets) {
        const k = `${target.conv}|${target.spaceId}`;
        if (stops.has(k)) continue;
        const last = messagesOf(loadChat(), target.conv).at(-1)?.at;
        const since = last ? last - MARGIN_MS : Date.now() - FIRST_LOOK_MS;
        const stopReads = listenChatReads(target, (who, at) => saveChatSeen(target.conv, who, at));
        stops.set(
          `${k}|reads`,
          stopReads,
        );
        stops.set(
          k,
          listenChat(
            target,
            since,
            (messages) => {
              const { store, added } = addChatMessages(loadChat(), messages);
              if (added.length === 0) return;
              saveChat(store);
              for (const m of added) {
                if (m.deleteOf) continue; // a «delete for everyone» - never announced
                // 📞 a call message rings here (CallManager: the phone's ringtone + a full-screen call notification)
                if (m.call && shouldRing(m, isMine(m, side), Date.now())) {
                  window.dispatchEvent(new CustomEvent(CALL_INCOMING_EVENT, { detail: { conv: m.conv, id: m.call.id, by: m.by } }));
                  continue;
                }
                if (isMine(m, side) || chatView.conv === m.conv || Date.now() - m.at > MARGIN_MS) continue;
                void notifyPhone(chatNotification(m), "/chat");
              }
            },
            (live) => window.dispatchEvent(new CustomEvent(CHAT_LIVE_EVENT, { detail: { conv: target.conv, live } })),
          ),
        );
      }
    };
    const retry = async () => {
      const unsent = loadUnsent();
      if (unsent.length === 0) return;
      const store = loadChat();
      const targets = chatTargets();
      const left: string[] = [];
      for (const id of unsent) {
        const m = store[id];
        const target = m && targets.find((t) => t.conv === m.conv);
        if (!m || !target) continue;
        if (!(await sendChat(target, m))) left.push(id);
      }
      saveUnsent(left);
      if (left.length !== unsent.length) window.dispatchEvent(new Event(CHAT_EVENT));
    };
    // 📞 back in the app: a call that came while it slept still rings if it's still ringing (CallManager checks)
    const ringMissed = () => {
      const now = Date.now();
      for (const m of Object.values(loadChat())) {
        if (m.call && !m.deleteOf && shouldRing(m, isMine(m, side), now)) {
          window.dispatchEvent(new CustomEvent(CALL_INCOMING_EVENT, { detail: { conv: m.conv, id: m.call.id, by: m.by } }));
        }
      }
    };
    start();
    void retry();
    const firstLook = window.setTimeout(ringMissed, 1500); // opened from the call notification: CallManager is listening by then
    const timer = window.setInterval(() => void retry(), 15_000);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      start();
      void retry();
      ringMissed();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(firstLook);
      document.removeEventListener("visibilitychange", onVisible);
      for (const stop of stops.values()) stop();
    };
  }, []);
  return null;
}
