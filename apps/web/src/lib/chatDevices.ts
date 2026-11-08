/**
 * 📡 «أرفق جهازًا» in a conversation (his Nov 8 2026 ask «لكل مندوب أجهزته، يمكنه البحث عن زبونه باسمه أو إيميله أو
 * كيته»): in a rep's conversation only that rep's devices (on the rep's own phone his copy holds only his), searched
 * by the device's name, the customer's name, the emails and the KIT - the home search's matching (any order, a typo).
 * Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { suggestSearch } from "./searchSuggest";

export interface ChatDeviceChoice {
  id: string;
  name: string;
  /** The customer · the email (or what matched). */
  hint: string;
}

type Device = Pick<StarlinkAccountSummary, "id" | "name" | "kitNumber" | "expectedEmail" | "starlinkAccountEmail" | "clientId" | "representativeId" | "deletedAt" | "archivedAt">;

export function chatDeviceChoices(devices: Device[], clientName: (id: string) => string | undefined, query: string, repId: string | null, limit = 40): ChatDeviceChoice[] {
  const mine = devices.filter((d) => !d.deletedAt && !d.archivedAt && (!repId || d.representativeId === repId));
  const hintOf = (d: Device) => [d.clientId ? clientName(d.clientId) : undefined, d.expectedEmail || d.starlinkAccountEmail].filter(Boolean).join(" · ");
  if (!query.trim()) {
    return [...mine].sort((a, b) => a.name.localeCompare(b.name, "ar")).slice(0, limit).map((d) => ({ id: d.id, name: d.name, hint: hintOf(d) }));
  }
  const byId = new Map(mine.map((d) => [d.id, d]));
  const found = suggestSearch(
    query,
    mine.map((d) => ({ kind: "device" as const, id: d.id, title: d.name, fields: [d.clientId ? clientName(d.clientId) : undefined, d.expectedEmail, d.starlinkAccountEmail, d.kitNumber] })),
    limit,
  );
  return found.map((s) => {
    const d = byId.get(s.id)!;
    return { id: d.id, name: d.name, hint: hintOf(d) || s.hit || "" };
  });
}
