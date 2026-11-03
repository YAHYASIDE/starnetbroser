/**
 * 🚩 The warnings' trip over the operator's Firebase (repFlags.ts): the rep's app writes each one
 * sealed (AES-GCM, his channel's key) - the operator's app lists the channel, opens what it can,
 * keeps it, and deletes the document. A network problem just means "next round".
 */

import { deleteDocument, listDocuments, writeDocument, type FetchFn } from "./firestoreRest";
import { openText, sealText, type Sealed } from "./deviceSyncCrypto";
import { flagCollection, flagDocPath, parseFlagPayload, type FlagChannel, type FlagLink, type RepFlag } from "./repFlags";

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

/** Operator: every rep's channel read; what opened is returned, its document deleted. A document
 * that doesn't open with the channel's key (not ours, damaged) is left alone. */
export async function pullFlags(
  config: { apiKey: string; projectId: string },
  channels: Record<string, FlagChannel>,
  fetchFn: FetchFn = fetch,
): Promise<{ flags: RepFlag[]; message?: string }> {
  const flags: RepFlag[] = [];
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
      flags.push(flag);
      await deleteDocument(config, flagDocPath(channel.spaceId, doc.id), fetchFn);
    }
  }
  return { flags, ...(message ? { message } : {}) };
}
