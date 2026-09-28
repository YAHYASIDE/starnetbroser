/**
 * The two Starlink dots (the dish "STARLINK" and its "WIFI" router) as the operator, the reps' bot
 * and the customer see them: 🟢 connected, 🔴 not connected (unplugged or switched off), 🟡 a
 * warning, ⚪ never read. Pure - reads the synced dishStatus/wifiStatus only.
 */

import { DeviceStatus, type StarlinkAccountSummary } from "@starnet/shared";

export interface ConnectionDot {
  /** CSS modifier: green / red / yellow / gray. */
  tone: "green" | "red" | "yellow" | "gray";
  emoji: string;
  word: string;
}

export function connectionDot(status: DeviceStatus | undefined): ConnectionDot {
  switch (status) {
    case DeviceStatus.GREEN:
      return { tone: "green", emoji: "🟢", word: "متصل" };
    case DeviceStatus.RED:
      return { tone: "red", emoji: "🔴", word: "غير متصل" };
    case DeviceStatus.YELLOW:
      return { tone: "yellow", emoji: "🟡", word: "تنبيه" };
    default:
      return { tone: "gray", emoji: "⚪", word: "غير معروف" };
  }
}

/** "🛰️ الطبق: 🟢 متصل · 📶 الواي فاي: 🔴 غير متصل" - one line for the bots' device card. */
export function connectionLine(account: Pick<StarlinkAccountSummary, "dishStatus" | "wifiStatus">): string {
  const dish = connectionDot(account.dishStatus);
  const wifi = connectionDot(account.wifiStatus);
  return `🛰️ الطبق: ${dish.emoji} ${dish.word} · 📶 الواي فاي: ${wifi.emoji} ${wifi.word}`;
}

/** What a red dot usually means, in the customer's words. */
const RED_HINT = "غير موصول بالكهرباء أو مطفأ";

/** WhatsApp answer to "is my device connected?" - the two dots as Starlink shows them now. */
export function connectionMessage(clientName: string | undefined, account: Pick<StarlinkAccountSummary, "name" | "dishStatus" | "wifiStatus">): string {
  const dish = connectionDot(account.dishStatus);
  const wifi = connectionDot(account.wifiStatus);
  const line = (label: string, dot: ConnectionDot) => `${dot.emoji} ${label}: ${dot.word}${dot.tone === "red" ? ` (${RED_HINT})` : ""}`;
  return [
    `مرحبًا${clientName ? ` ${clientName}` : ""}، حالة جهازك (${account.name}) حسب Starlink:`,
    "",
    line("الطبق (Starlink)", dish),
    line("الواي فاي", wifi),
    ...(dish.tone === "red" || wifi.tone === "red" ? ["", "تأكد أن الجهاز موصول بالكهرباء ومشغّل، ثم انتظر بضع دقائق."] : []),
    "",
    "- STAR NET",
  ].join("\n");
}
