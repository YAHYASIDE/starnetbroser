"use client";

/**
 * 🧾 The rep's statement for his chat conversation (his Nov 8 2026 choices: a summary + a PDF; the operator sends it,
 * the rep asks for it): «كشفي»'s accounts (lib/repBotStatement.ts) made into the summary text and one PDF small enough
 * for a chat message (tried at a lower quality when too big; never more than MAX_CHAT_FILE).
 */

import { MAX_CHAT_FILE } from "./chat";
import { renderPrintablePdf } from "./pdfExport";
import { repChatStatement } from "./repBotStatement";
import { repBotAccountsNow } from "./telegramCommands";

const TRIES = [
  { pixelRatio: 1.5, quality: 0.7 },
  { pixelRatio: 1, quality: 0.5 },
];

export async function buildRepChatStatement(repId: string): Promise<{ text: string; file: { name: string; data: string } | null } | null> {
  const found = await repBotAccountsNow(repId);
  if (!found) return null;
  const { text, doc } = repChatStatement(found.rep.name, found.accounts, found.since);
  for (const t of TRIES) {
    try {
      const pdf = await renderPrintablePdf(doc, t);
      const data = `data:application/pdf;base64,${pdf.base64}`;
      if (data.length <= MAX_CHAT_FILE) return { text, file: { name: `كشف ${found.rep.name} ${new Date().toISOString().slice(0, 10)}.pdf`, data } };
    } catch {
      break;
    }
  }
  return { text: `${text}\n⚠️ الملف أكبر من أن يُرسل في الدردشة - اطلب «📄 PDF» من بوت الأموال.`, file: null };
}
