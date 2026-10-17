/**
 * ✉️ A device still called by the time it was added («📋 جهاز جديد 13:11», or a bare «13:11» - a pasted
 * session, a new device before its first sync) takes its email as its name once the email is known
 * (his Oct 17 2026 ask: «أجهزة مكتوب اسمها بالوقت… يجب أن يكون هناك شيء يغيّر اسمها ويضع مكانه الإيميل»).
 * A name he typed himself never changes. Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";

/** «📋 جهاز جديد 13:11», «جهاز جديد 9:05», «13:11», «13:11:40». */
export function isPlaceholderName(name: string | undefined): boolean {
  const text = (name ?? "").replace(/[📋]/gu, "").trim();
  return /^(جهاز جديد\s*)?\d{1,2}:\d{2}(:\d{2})?$/.test(text);
}

/** The new name for a device still named by the time, or null. */
export function placeholderRename(account: Pick<StarlinkAccountSummary, "name" | "expectedEmail" | "starlinkAccountEmail">): string | null {
  if (!isPlaceholderName(account.name)) return null;
  const email = (account.expectedEmail || account.starlinkAccountEmail || "").trim();
  return email ? email : null;
}
