import type { StarlinkAccountSummary } from "@starnet/shared";
import { loadClientStore, type ClientStore } from "./clientStore";

/** 📸 The device's customer for its browser (the screenshot's ready messages greet him and go to his WhatsApp):
 * name and number only, nothing when the device has none. */
export function customerExtrasFor(account: Pick<StarlinkAccountSummary, "clientId">, store: ClientStore = loadClientStore()): { customerName?: string; customerPhone?: string } {
  const client = account.clientId ? store[account.clientId] : undefined;
  if (!client) return {};
  return { ...(client.name?.trim() ? { customerName: client.name.trim() } : {}), ...(client.phone?.trim() ? { customerPhone: client.phone.trim() } : {}) };
}
