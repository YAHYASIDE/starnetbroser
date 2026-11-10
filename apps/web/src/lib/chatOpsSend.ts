"use client";

/**
 * 💳 The operator's side of the operation cards (lib/chatOps.ts): every new operation of a rep with a chat channel goes
 * to his conversation as a card - the operations «كشفي» lists, the first look only remembers what is there (like the
 * money bot). Only on the reference phone (YAHYA, his Nov 9 2026 choice) or a phone without the team link. A card's id
 * comes from its operation: sent twice, it is one message. And the rep's «✅ / ❌» from the chat lands in the same ratings
 * as the bot's buttons (repOpRatings.ts).
 */

import { chatOpFrom } from "./chatOps";
import { newChatMessage, repIdOfConv, type ChatMessage } from "./chat";
import { chatTargets, type ChatTarget } from "./chatTransport";
import { accountEmail } from "./dayActions";
import { browserLinkStorage, isMainMember, loadLinkConfig } from "./deviceLink";
import { botOperationIds, newBotOperations } from "./repBotStatement";
import { mergeHandoverOps, moneyWords, opsToSend } from "./repOpMessage";
import { loadOpLog } from "./repOpLog";
import { applyRating, loadOpRatings, saveOpRatings } from "./repOpRatings";
import { isRepWorkspace } from "./repMode";
import { loadAccounts, repBotAccountsNow } from "./telegramCommands";

const SEEN_KEY = "starnet.chatOpsSeen";
const MAX_CARDS = 10;

function loadSeen(): Record<string, string[]> {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

function saveSeen(seen: Record<string, string[]>): void {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // tried again next time
  }
}

/** This phone posts the cards: the reference phone, or one not in a team. */
export function postsOpCards(): boolean {
  if (isRepWorkspace()) return false;
  const link = loadLinkConfig(browserLinkStorage());
  return !link?.enabled || isMainMember(link.memberId);
}

let running = false;
/** ⚡ The business data as it was at the last complete look (his Nov 10 2026 «بطء شديد»: every rep's statement was
 * rebuilt every minute though nothing had changed). A new operation always adds text to a store. */
let lastLook = "";

/** A cheap fingerprint of the business data (every `starnet_` store but the chat): how many stores and their sizes. */
export function businessDataSize(storage: Pick<Storage, "length" | "key" | "getItem">): string {
  let count = 0;
  let size = 0;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith("starnet_") || key.startsWith("starnet_chat")) continue;
    count += 1;
    size += storage.getItem(key)?.length ?? 0;
  }
  return `${count}:${size}`;
}

/** New operations → cards in each rep's conversation. `post` saves + sends (ChatRunner's postChat). */
export async function postNewOpCards(post: (target: ChatTarget, message: ChatMessage) => Promise<boolean>, by: string, member?: string): Promise<number> {
  if (running || !postsOpCards()) return 0;
  const look = `${chatTargets().length}|${businessDataSize(window.localStorage)}`;
  if (look === lastLook) return 0;
  running = true;
  let posted = 0;
  let allDone = true;
  try {
    const seen = loadSeen();
    const devices = new Map((await loadAccounts()).map((a) => [a.id, a]));
    const serials = new Map<string, number>();
    for (const log of Object.values(loadOpLog())) for (const op of log.ops) serials.set(op.token, op.serial);
    for (const target of chatTargets()) {
      const repId = repIdOfConv(target.conv);
      if (!repId) continue;
      const found = await repBotAccountsNow(repId);
      if (!found) continue;
      const prior = seen[repId] ?? null;
      const now = botOperationIds(found.accounts);
      if (!prior) {
        // the first look only remembers what is there (no flood of old operations)
        seen[repId] = now;
        saveSeen(seen);
        continue;
      }
      const fresh = newBotOperations(found.accounts, prior);
      if (!fresh.length) continue;
      const merged = mergeHandoverOps(fresh, (line, code, amount) =>
        line.accountId ? `${moneyWords(amount, code)} عن جهاز ${devices.get(line.accountId)?.name || "زبونك"}` : `${moneyWords(amount, code)} في حسابك`,
      );
      const { send } = opsToSend(merged, MAX_CARDS);
      const done = new Set(prior);
      let ok = true;
      for (const { account, line, ids } of send) {
        const device = line.accountId ? devices.get(line.accountId) : undefined;
        const op = chatOpFrom(repId, account, line, device ? { email: accountEmail(device), name: device.name } : undefined);
        const serial = serials.get(op.token);
        const message = newChatMessage({ conv: target.conv, from: "owner", by, ...(member ? { member } : {}), text: "", op: serial ? { ...op, serial } : op });
        if (!message || !(await post(target, message))) {
          ok = false;
          break;
        }
        posted += 1;
        for (const id of ids) done.add(id);
        seen[repId] = [...done];
        saveSeen(seen);
      }
      // older ones beyond the 10 shown: remembered (the statement has them)
      if (ok) {
        seen[repId] = now;
        saveSeen(seen);
      } else allDone = false;
    }
  } catch (e) {
    allDone = false;
    throw e;
  } finally {
    running = false;
    // the next minute looks again only when something changed (or this look didn't finish)
    if (allDone) lastLook = look;
  }
  return posted;
}

/** The rep's «✅ / ❌» from the chat → the same ratings as the money bot's buttons. True when it changed something. */
export function recordChatRating(m: ChatMessage): boolean {
  const repId = repIdOfConv(m.conv);
  if (!repId || m.from !== "rep" || !m.opRate) return false;
  const { store, change } = applyRating(loadOpRatings(), {
    token: m.opRate.token,
    repId,
    verdict: m.opRate.verdict,
    by: m.by,
    at: m.at,
    ...(m.opRate.note ? { note: m.opRate.note } : {}),
  });
  if (change === "same") return false;
  saveOpRatings(store);
  return true;
}

