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
  /** "owner": on the operator's own list (the rep's app only knows it's there - KnownDevices). */
  kind: "device" | "client" | "owner";
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

/**
 * The operator's devices as the rep's app may know them: one-way fingerprints of each device's
 * emails and KIT (never the email or KIT itself), so a rep typing a device the operator already
 * has is warned without seeing the operator's other devices.
 */
export interface KnownDevices {
  emails: string[];
  kits: string[];
}

/** A short one-way fingerprint (not reversible to the email / KIT). */
export function deviceFingerprint(value: string): string {
  let h1 = 0xdeadbeef ^ 7;
  let h2 = 0x41c6ce57 ^ 7;
  const text = `starnet|${value}`;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Fingerprints of the operator's (non-deleted) devices, minus `except` (the rep's own). */
export function knownDevicesOf(accounts: StarlinkAccountSummary[], except: Set<string>): KnownDevices {
  const emails = new Set<string>();
  const kits = new Set<string>();
  for (const a of accounts) {
    if (a.deletedAt || except.has(a.id)) continue;
    for (const e of deviceEmails(a)) emails.add(deviceFingerprint(e));
    const k = kit(a.kitNumber);
    if (k.length >= 4) kits.add(deviceFingerprint(k));
  }
  return { emails: [...emails], kits: [...kits] };
}

/** Which of the operator's devices (non-deleted, not `id`) is the same device: same email or KIT. */
export function sameDeviceAs(
  draft: Pick<StarlinkAccountSummary, "expectedEmail" | "starlinkAccountEmail" | "extraEmails" | "kitNumber"> & { id?: string },
  accounts: StarlinkAccountSummary[],
): { account: StarlinkAccountSummary; field: "email" | "kit" } | null {
  const emails = new Set(deviceEmails(draft));
  const draftKit = kit(draft.kitNumber);
  for (const a of accounts) {
    if (a.id === draft.id || a.deletedAt) continue;
    if (emails.size && deviceEmails(a).some((e) => emails.has(e))) return { account: a, field: "email" };
    if (draftKit.length >= 4 && kit(a.kitNumber) === draftKit) return { account: a, field: "kit" };
  }
  return null;
}

/** Other (non-deleted) devices already carrying this draft's email, KIT, phone or name - and, in
 * the rep's app, the operator's devices it only knows by fingerprint. */
export function findDeviceDuplicates(draft: DeviceDraft, accounts: StarlinkAccountSummary[], known?: KnownDevices): DuplicateHit[] {
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
  // The rep's own devices aren't among the fingerprints, so editing one never warns.
  if (known) {
    const knownEmails = new Set(known.emails);
    if ([...emails].some((e) => knownEmails.has(deviceFingerprint(e)))) hits.push({ field: "email", owner: "المسؤول", kind: "owner" });
    if (draftKit.length >= 4 && known.kits.includes(deviceFingerprint(draftKit))) hits.push({ field: "kit", owner: "المسؤول", kind: "owner" });
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
  if (hit.kind === "owner") return `${DUPLICATE_FIELD_LABELS[hit.field]} مسجّل عند المسؤول على جهاز آخر - قد يكون الجهاز مسجّلاً من قبل`;
  return `${DUPLICATE_FIELD_LABELS[hit.field]} مسجل من قبل ${hit.kind === "device" ? "على الجهاز" : "للزبون"} «${hit.owner}»`;
}

/** The question asked before saving anyway. */
export function duplicateQuestion(hits: DuplicateHit[]): string {
  return ["⚠️ انتبه - قد يكون هذا تسجيلاً مكرراً:", ...hits.slice(0, 6).map((h) => `• ${duplicateLine(h)}`), "", "هل تريد الحفظ رغم ذلك؟"].join("\n");
}
