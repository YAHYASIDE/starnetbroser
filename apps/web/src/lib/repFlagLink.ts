/**
 * 🚩 The warnings' trip over the operator's Firebase (repFlags.ts): the rep's app writes each one
 * sealed (AES-GCM, his channel's key) - every phone of the operator's team lists the channel, opens what it
 * can and keeps it; documents go after FLAG_KEEP_MS. A network problem just means "next round".
 */

import { deleteDocument, listDocuments, writeDocument, type FetchFn } from "./firestoreRest";
import { openText, sealText, type Sealed } from "./deviceSyncCrypto";
import { FLAG_KEEP_MS, flagCollection, flagDocPath, parseFlagPayload, type FlagChannel, type FlagLink, type RepFlag } from "./repFlags";

/** Rep: sends what isn't sent yet; returns the ids that arrived (and the first problem, if any). */
export async function pushFlags(link: FlagLink, flags: RepFlag[], fetchFn: FetchFn = fetch): Promise<{ sent: string[]; message?: string }> {
  const sent: string[] = [];
  for (const flag of flags) {
    const sealed = await sealText(JSON.stringify(flag), link.key);
    const r = await writeDocument(link, flagDocPath(link.spaceId, flag.id), { sealed: JSON.stringify(sealed) }, fetchFn);
    if (!r.ok) return { sent, message: r.message };
    sent.push(flag.id);
  }
  return { sent };
}

/**
 * Operator: every rep's channel read; what opened is returned with when it reached the server (`sentAt`). Since Nov 8
 * 2026 (his «تنبيهات المندوبين لا تأتي») a warning is NOT deleted on read: the first phone of the team that read it
 * (the laptop, another member) used to eat it and the others never saw it. Every phone reads it; it is deleted only
 * once older than FLAG_KEEP_MS. A document that doesn't open with the channel's key (not ours, damaged) is left alone.
 */
export async function pullFlags(
  config: { apiKey: string; projectId: string },
  channels: Record<string, FlagChannel>,
  fetchFn: FetchFn = fetch,
  now = Date.now(),
): Promise<{ flags: RepFlag[]; sentAt: Record<string, number>; message?: string }> {
  const flags: RepFlag[] = [];
  const sentAt: Record<string, number> = {};
  let message: string | undefined;
  for (const [repId, channel] of Object.entries(channels)) {
    const listed = await listDocuments(config, flagCollection(channel.spaceId), fetchFn);
    if (!listed.ok) {
      message ??= listed.message;
      continue;
    }
    for (const doc of listed.value) {
      let flag: RepFlag | null = null;
      try {
        flag = parseFlagPayload(await openText(JSON.parse(doc.fields.sealed ?? "") as Sealed, channel.key), repId);
      } catch {
        flag = null;
      }
      if (!flag) continue;
      const created = doc.createTime ? Date.parse(doc.createTime) : NaN;
      const at = Number.isFinite(created) ? created : flag.at;
      if (now - at > FLAG_KEEP_MS) {
        await deleteDocument(config, flagDocPath(channel.spaceId, doc.id), fetchFn);
        continue;
      }
      flags.push(flag);
      sentAt[flag.id] = at;
    }
  }
  return { flags, sentAt, ...(message ? { message } : {}) };
}
