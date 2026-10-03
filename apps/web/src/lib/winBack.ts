/**
 * 🔁 زبائن للاسترجاع - devices whose renewal date passed and nobody renewed: the customers most
 * likely to be lost. Longest-lapsed last (the freshest are the easiest to win back), each with a
 * ready WhatsApp message. Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import { parseRenewalDate } from "./renewalForecast";

export interface LapsedDevice {
  id: string;
  name: string;
  clientId?: string;
  clientName?: string;
  phone?: string;
  /** Days since the renewal date. */
  daysLapsed: number;
}

export function listLapsedDevices(
  accounts: StarlinkAccountSummary[],
  clients: ClientStore,
  today: Date,
  options: { minDays?: number; maxDays?: number } = {},
): LapsedDevice[] {
  const minDays = options.minDays ?? 3;
  const maxDays = options.maxDays ?? 120;
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const out: LapsedDevice[] = [];
  for (const account of accounts) {
    if (account.deletedAt || account.archivedAt || account.deviceFault) continue;
    const date = parseRenewalDate(account.rechargeDate || account.standbyDate);
    if (!date) continue;
    const daysLapsed = Math.round((start.getTime() - date.getTime()) / 86_400_000);
    if (daysLapsed < minDays || daysLapsed > maxDays) continue;
    const client = account.clientId ? clients[account.clientId] : undefined;
    out.push({
      id: account.id,
      name: account.name,
      clientId: account.clientId,
      clientName: client?.name,
      phone: account.phone || client?.phone,
      daysLapsed,
    });
  }
  return out.sort((a, b) => a.daysLapsed - b.daysLapsed);
}

export function buildWinBackMessage(device: Pick<LapsedDevice, "name" | "clientName" | "daysLapsed">): string {
  const who = device.clientName ? ` ${device.clientName}` : "";
  return [
    `مرحباً${who} 👋`,
    `اشتراك Starlink لجهازك (${device.name}) متوقف منذ ${device.daysLapsed} يوماً.`,
    "نحن جاهزون لتجديده لك اليوم بسرعة - فقط أرسل لنا رسالة وسنتكفل بالباقي 📡",
    "",
    "- STAR NET",
  ].join("\n");
}
