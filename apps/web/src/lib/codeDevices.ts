/**
 * 🔑 What «بوت الأكواد» says about a code's device (his Oct 22 2026 ask «معه تفاصيل الجهاز»): its name,
 * customer, email and KIT - pushed to the phone's native side, which sends each code as it reads it. Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import { deviceEmail } from "./mailboxes";

export type CodeDevices = Record<string, { name?: string; client?: string; email?: string; kit?: string }>;

export function buildCodeDevices(accounts: StarlinkAccountSummary[], clients: ClientStore): CodeDevices {
  const out: CodeDevices = {};
  for (const a of accounts) {
    if (a.deletedAt) continue;
    const client = a.clientId ? clients[a.clientId]?.name : undefined;
    const email = deviceEmail(a);
    const kit = a.kitNumber?.trim() || a.serialNumber?.trim();
    out[a.id] = {
      ...(a.name?.trim() ? { name: a.name.trim() } : {}),
      ...(client ? { client } : {}),
      ...(email ? { email } : {}),
      ...(kit ? { kit } : {}),
    };
  }
  return out;
}
