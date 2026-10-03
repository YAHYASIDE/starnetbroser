/**
 * ⚠️ تنبيه التكرار - before a device or a customer is saved, is the same email, KIT, phone or name
 * already registered? Warns (while typing, and once more before saving) - never blocks, since two
 * customers can share a name and one customer a phone. Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";

export type DuplicateField = "email" | "kit" | "phone" | "name";

export interface DuplicateHit {
  field: DuplicateField;
  /** Who already has it: a device name, or a customer name. */
  owner: string;
  kind: "device" | "client";
  /** The existing customer's id (client hits) - lets the picker offer "use this one". */
  id?: string;
}

export const DUPLICATE_FIELD_LABELS: Record<DuplicateField, string> = {
  email: "الإيميل",
  kit: "رقم KIT",
  phone: "رقم الهاتف",
  name: "الاسم",
};

export function foldName(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

function email(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** The last 8 digits - "+222 4180 4013" and "41804013" are the same number. */
export function phoneKey(value: string | undefined): string {
  const digits = (value ?? "").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-8) : "";
}

function kit(value: string | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function deviceEmails(a: Pick<StarlinkAccountSummary, "expectedEmail" | "starlinkAccountEmail" | "extraEmails">): string[] {
  return [a.expectedEmail, a.starlinkAccountEmail, ...(a.extraEmails ?? []).map((e) => e.address)].map(email).filter(Boolean);
}

export interface DeviceDraft {
  id?: string;
  name: string;
  phone?: string;
  expectedEmail?: string;
  extraEmails?: { address: string }[];
  kitNumber?: string;
}

/** Other (non-deleted) devices already carrying this draft's email, KIT, phone or name. */
export function findDeviceDuplicates(draft: DeviceDraft, accounts: StarlinkAccountSummary[]): DuplicateHit[] {
  const others = accounts.filter((a) => a.id !== draft.id && !a.deletedAt);
  const hits: DuplicateHit[] = [];
  const add = (field: DuplicateField, owner: string) => {
    if (!hits.some((h) => h.field === field && h.owner === owner)) hits.push({ field, owner, kind: "device" });
  };
  const emails = new Set(deviceEmails(draft));
  const draftKit = kit(draft.kitNumber);
  const draftPhone = phoneKey(draft.phone);
  const draftName = foldName(draft.name);
  for (const a of others) {
    if (emails.size && deviceEmails(a).some((e) => emails.has(e))) add("email", a.name);
    if (draftKit.length >= 4 && kit(a.kitNumber) === draftKit) add("kit", a.name);
    if (draftPhone && phoneKey(a.phone) === draftPhone) add("phone", a.name);
    if (draftName.length >= 3 && foldName(a.name) === draftName) add("name", a.name);
  }
  return hits;
}

/** Other customers with the same phone or name. */
export function findClientDuplicates(draft: { id?: string; name: string; phone?: string }, clients: { id: string; name: string; phone?: string }[]): DuplicateHit[] {
  const hits: DuplicateHit[] = [];
  const draftPhone = phoneKey(draft.phone);
  const draftName = foldName(draft.name);
  for (const c of clients) {
    if (c.id === draft.id) continue;
    if (draftPhone && phoneKey(c.phone) === draftPhone) hits.push({ field: "phone", owner: c.name, kind: "client", id: c.id });
    else if (draftName.length >= 3 && foldName(c.name) === draftName) hits.push({ field: "name", owner: c.name, kind: "client", id: c.id });
  }
  return hits;
}

export function duplicateLine(hit: DuplicateHit): string {
  return `${DUPLICATE_FIELD_LABELS[hit.field]} مسجل من قبل ${hit.kind === "device" ? "على الجهاز" : "للزبون"} «${hit.owner}»`;
}

/** The question asked before saving anyway. */
export function duplicateQuestion(hits: DuplicateHit[]): string {
  return ["⚠️ انتبه - قد يكون هذا تسجيلاً مكرراً:", ...hits.slice(0, 6).map((h) => `• ${duplicateLine(h)}`), "", "هل تريد الحفظ رغم ذلك؟"].join("\n");
}
