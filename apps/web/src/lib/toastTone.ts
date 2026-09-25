/** How a notification looks: success (green check), error (red), or plain info - read from the
 * text itself so every caller keeps passing plain strings. */
export type ToastTone = "success" | "error" | "info";

export function toastTone(text: string): ToastTone {
  if (text.trimStart().startsWith("✓")) return "success";
  if (/تعذر|فشل|خطأ|غير صالح/.test(text)) return "error";
  return "info";
}

/** The text without a leading ✓ (the icon already says it). */
export function toastBody(text: string): string {
  return text.trimStart().replace(/^✓\s*/, "");
}
