/**
 * The assistant marks each WhatsApp message it drafts as
 *   [[whatsapp:+22212345678|اسم الزبون]]
 *   نص الرسالة
 *   [[/whatsapp]]
 * so the chat can show it as a card with a «فتح واتساب» button (the operator still presses send
 * in WhatsApp - nothing is ever sent automatically). Everything else is plain text.
 */

export type AiSegment = { type: "text"; text: string } | { type: "whatsapp"; phone: string | null; name: string; message: string };

const DRAFT = /\[\[whatsapp:([^|\]]*)(?:\|([^\]]*))?\]\]([\s\S]*?)\[\[\/whatsapp\]\]/g;

export function parseAssistantReply(text: string): AiSegment[] {
  const segments: AiSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(DRAFT)) {
    const before = text.slice(last, match.index).trim();
    if (before) segments.push({ type: "text", text: before });
    const phone = match[1].trim();
    segments.push({ type: "whatsapp", phone: phone || null, name: (match[2] ?? "").trim(), message: match[3].trim() });
    last = (match.index ?? 0) + match[0].length;
  }
  const rest = text.slice(last).trim();
  if (rest) segments.push({ type: "text", text: rest });
  return segments;
}
