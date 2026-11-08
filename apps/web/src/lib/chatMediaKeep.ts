"use client";

/**
 * 💾 The chat's pictures / voices / files leave localStorage for the chat media store (lib/chatMediaStore.ts) - his Nov 8
 * 2026 «لا تحذف شيئًا من الهاتف أبدًا»: everything is kept, so the heavy part must not sit next to the business data.
 * A message keeps `stored` and is made whole again when shown, forwarded or sent again.
 */

import { chatMediaKey, loadChat, saveChat, stripChatMedia, withChatMedia, type ChatMediaPayload, type ChatMessage } from "./chat";
import { getChatMedia, putChatMedia } from "./chatMediaStore";

let running: Promise<void> | null = null;

/** Moves every message's inline media to the media store (only what was really saved there is taken out). */
export function stashChatMedia(): Promise<void> {
  running ??= (async () => {
    try {
      const moved = new Map<string, ChatMessage>();
      for (const m of Object.values(loadChat())) {
        const split = stripChatMedia(m);
        if (!split) continue;
        const previous = await chatMediaOf(m.stored?.length ? m : null);
        if (await putChatMedia(chatMediaKey(m.id), JSON.stringify({ ...(previous ?? {}), ...split.payload }))) moved.set(m.id, split.message);
      }
      if (moved.size === 0) return;
      const store = loadChat();
      for (const [id, message] of moved) if (store[id]) store[id] = message;
      saveChat(store);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** The picture / voice / file of a message (inline, else from the media store). */
export async function chatMediaOf(m: ChatMessage | null): Promise<ChatMediaPayload | null> {
  if (!m) return null;
  const inline: ChatMediaPayload = { ...(m.image ? { image: m.image } : {}), ...(m.audio ? { audio: m.audio } : {}), ...(m.file?.data ? { file: m.file.data } : {}) };
  if (!m.stored?.length) return Object.keys(inline).length ? inline : null;
  try {
    const kept = JSON.parse((await getChatMedia(chatMediaKey(m.id))) ?? "null") as ChatMediaPayload | null;
    return { ...(kept ?? {}), ...inline };
  } catch {
    return Object.keys(inline).length ? inline : null;
  }
}

/** The whole message (to forward or send again). */
export async function fullChatMessage(m: ChatMessage): Promise<ChatMessage> {
  return m.stored?.length ? withChatMedia(m, await chatMediaOf(m)) : m;
}
