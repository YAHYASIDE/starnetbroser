"use client";

import { useEffect } from "react";
import { isRunningInAndroidApp, readImageText } from "@/lib/localBrowser";
import { putProof } from "@/lib/paymentProofStore";
import { loadReceiptRegistry, saveReceiptRegistry } from "@/lib/receiptCheck";
import { readPendingReceipts, receiptsToRead } from "@/lib/receiptReader";
import { loadRepRequests, REP_REQUESTS_CHANGED, saveRepRequests } from "@/lib/repRequests";
import { downloadRepImage, isRepsBotConnected, repBotNames, sendRepText } from "@/lib/telegram";

/** The proofs store's key for a request's photo (its card's thumbnail). */
export function requestProofKey(requestId: string): string {
  return `req:${requestId}`;
}

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text.slice(text.indexOf(",") + 1)));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

const EVERY_MS = 20_000;

/**
 * 🧾 Reads every rep's payment / handover photo as it arrives (lib/receiptReader.ts) - only on the phone that has the
 * bots (it alone can download Telegram's photos); the other phones get the result through the team link.
 */
export function ReceiptReaderRunner() {
  useEffect(() => {
    if (!isRunningInAndroidApp()) return;
    let running = false;
    const run = async () => {
      if (running || !(isRepsBotConnected() || repBotNames().money)) return;
      if (receiptsToRead(loadRepRequests()).length === 0) return;
      running = true;
      try {
        await readPendingReceipts({
          load: loadRepRequests,
          save: saveRepRequests,
          loadRegistry: loadReceiptRegistry,
          saveRegistry: saveReceiptRegistry,
          download: downloadRepImage,
          readText: async (dataUrl) => {
            const r = await readImageText(dataUrl);
            return r.ok ? r.text : null;
          },
          hash: sha256,
          keepImage: async (id, dataUrl) => void (await putProof(requestProofKey(id), dataUrl)),
          tellRep: async (repId, text, bot) => void (await sendRepText(repId, text, undefined, bot)),
        });
        window.dispatchEvent(new Event(REP_REQUESTS_CHANGED));
      } finally {
        running = false;
      }
    };
    const first = window.setTimeout(() => void run(), 4000);
    const timer = window.setInterval(() => void run(), EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);
  return null;
}
