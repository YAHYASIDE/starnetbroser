/**
 * 🤝 Which Telegram accounts (phones) are linked to which rep on the reps bots. A rep may have
 * several - e.g. his two phones (his Oct 2026 request: «بوت المندوب حسين اريد ربط فيه هاتفين»).
 * Messages to the rep go to each of them; a direct answer goes to the phone that asked. A phone
 * belongs to one rep only. Pure - stored by lib/telegram.ts.
 */

export interface RepChatPhone {
  chatId: string;
  /** The Telegram name, to recognise him in الإعدادات. */
  name: string;
}

/** The rep's first phone (the shape stored before several phones) plus the others. */
export interface RepChat extends RepChatPhone {
  more?: RepChatPhone[];
}

/** Every phone linked to the rep, the first one first. */
export function repChatPhones(chat: RepChat | undefined): RepChatPhone[] {
  if (!chat) return [];
  return [{ chatId: chat.chatId, name: chat.name }, ...(chat.more ?? [])];
}

function fromPhones(phones: RepChatPhone[]): RepChat | undefined {
  const [first, ...rest] = phones;
  if (!first) return undefined;
  return rest.length ? { ...first, more: rest } : { ...first };
}

/** Removes one phone from a rep; the rep is dropped when it was his last. */
export function removeRepChat(chats: Record<string, RepChat>, repId: string, chatId: string): Record<string, RepChat> {
  const next = { ...chats };
  const left = fromPhones(repChatPhones(next[repId]).filter((p) => p.chatId !== chatId));
  if (left) next[repId] = left;
  else delete next[repId];
  return next;
}

/** Links one more phone to a rep (taken from any rep it was linked to before). */
export function addRepChat(chats: Record<string, RepChat>, repId: string, phone: RepChatPhone): Record<string, RepChat> {
  let next = { ...chats };
  for (const [id, chat] of Object.entries(chats)) {
    if (repChatPhones(chat).some((p) => p.chatId === phone.chatId)) next = removeRepChat(next, id, phone.chatId);
  }
  next[repId] = fromPhones([...repChatPhones(next[repId]), phone])!;
  return next;
}

export function repIdOfChat(chats: Record<string, RepChat>, chatId: string): string | undefined {
  return Object.entries(chats).find(([, chat]) => repChatPhones(chat).some((p) => p.chatId === chatId))?.[0];
}

/** chatId -> repId, for the native bots (they answer with the app closed). */
export function chatRepsMap(chats: Record<string, RepChat>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [repId, chat] of Object.entries(chats)) for (const p of repChatPhones(chat)) out[p.chatId] = repId;
  return out;
}

/** Where a message to the rep goes: only `onlyChat` when it's one of his phones, else all of them. */
export function targetChatIds(chat: RepChat | undefined, onlyChat?: string): string[] {
  const ids = repChatPhones(chat).map((p) => p.chatId);
  return onlyChat && ids.includes(onlyChat) ? [onlyChat] : ids;
}
