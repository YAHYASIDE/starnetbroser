/**
 * 🧾 Every rep's payment / handover photo is read once, the moment it is here (his Nov 7 2026 ask): downloaded,
 * fingerprinted, its text read on the phone, its reference / amount / date kept on the request, the reference and the
 * picture registered - and a second use of either locks the approval and tells the rep in the bot at once.
 * Orchestration only, every step injected (tested with fakes); the reading itself is receiptCheck.ts.
 */

import { findReceiptUse, parseReceipt, receiptKeys, registerReceipt, type ReceiptRead, type ReceiptRegistry } from "./receiptCheck";
import type { RepRequest, RepRequestList } from "./repRequests";

export interface ReceiptReaderDeps {
  load(): RepRequestList;
  save(list: RepRequestList): void;
  loadRegistry(): ReceiptRegistry;
  saveRegistry(registry: ReceiptRegistry): void;
  download(fileId: string, bot: "reps" | "money"): Promise<string | null>;
  /** The picture's text, or null where the phone can't read text (the laptop). */
  readText(dataUrl: string): Promise<string | null>;
  hash(dataUrl: string): Promise<string>;
  /** Keeps the picture for the card's thumbnail. */
  keepImage(requestId: string, dataUrl: string): Promise<void>;
  tellRep(repId: string, text: string, bot: "reps" | "money"): Promise<void>;
  now?: () => Date;
}

const MAX_TRIES = 3;
/** Raised when the reading improves: a pending request read by an older one is read again (v2, Nov 10 2026: the
 * wallet's balance above a receipt sheet was taken for the amount). */
export const READER_VERSION = 2;

/** The requests whose photo is still to read. */
export function receiptsToRead(list: RepRequestList): RepRequest[] {
  return list.filter(
    (r) =>
      r.status === "pending" &&
      (r.kind === "payment" || r.kind === "handover") &&
      r.proofFileId &&
      (!r.receipt || (r.receipt.error ? (r.receipt.tries ?? 0) < MAX_TRIES : (r.receipt.v ?? 1) < READER_VERSION)),
  );
}

/** What the rep is told when he sends a receipt already used. */
export function duplicateReceiptMessage(dup: NonNullable<RepRequest["receiptDup"]>, read: ReceiptRead): string {
  const d = new Date(dup.at);
  const when = Number.isNaN(d.getTime()) ? "" : ` يوم ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  const what = dup.by === "ref" && read.ref ? `التحويل رقم ${read.ref}` : "هذه الصورة";
  return `⛔ ${what} أُرسل من قبل${when} - لن يُسجَّل مرة ثانية.\nإن كان تحويلًا جديدًا فأرسل صورته هو.`;
}

/** Reads every photo still to read; returns how many were read. Never throws. */
export async function readPendingReceipts(d: ReceiptReaderDeps): Promise<number> {
  let done = 0;
  for (const request of receiptsToRead(d.load())) {
    try {
      const bot = request.proofBot ?? "reps";
      const now = (d.now ?? (() => new Date()))();
      const dataUrl = await d.download(request.proofFileId!, bot);
      if (!dataUrl) {
        const tries = (request.receipt?.tries ?? 0) + 1;
        d.save(d.load().map((r) => (r.id === request.id ? { ...r, receipt: { readAt: now.toISOString(), tries, error: "download" } } : r)));
        continue;
      }
      const [hash, text] = await Promise.all([d.hash(dataUrl), d.readText(dataUrl).catch(() => null)]);
      await d.keepImage(request.id, dataUrl).catch(() => undefined);
      const read = text ? parseReceipt(text) : {};
      const list = d.load();
      const rejected = (id: string) => list.find((r) => r.id === id)?.status === "rejected";
      const keys = receiptKeys(read, hash);
      const registry = d.loadRegistry();
      const found = findReceiptUse(registry, keys, request.id, rejected);
      const dup = found ? { requestId: found.use.requestId, repId: found.use.repId, at: found.use.at, by: found.key.startsWith("ref:") ? ("ref" as const) : ("img" as const) } : undefined;
      d.saveRegistry(registerReceipt(registry, keys, { requestId: request.id, repId: request.repId, at: request.createdAt, ...(request.amount ? { amount: request.amount } : {}), ...(request.currency ? { currency: request.currency } : {}) }, rejected));
      d.save(
        d.load().map((r) => {
          if (r.id !== request.id) return r;
          const { error: _e, tries: _t, amount: _a, unit: _u, ref: _r, at: _at, ...was } = r.receipt ?? { readAt: "" };
          return { ...r, receipt: { ...was, ...read, hash, readAt: now.toISOString(), v: READER_VERSION }, ...(dup ? { receiptDup: dup } : {}) };
        }),
      );
      // (a re-read by a newer reader never tells him twice)
      if (dup && !request.receiptDup) await d.tellRep(request.repId, duplicateReceiptMessage(dup, read), bot).catch(() => undefined);
      done += 1;
    } catch {
      // the next run tries again
    }
  }
  return done;
}

/** ⛔ The approval waits: the same receipt as an earlier request, and he hasn't said «سجّله مع ذلك». */
export function receiptLocked(request: Pick<RepRequest, "receiptDup" | "receiptOverride">): boolean {
  return Boolean(request.receiptDup && !request.receiptOverride);
}
