/**
 * 🆕 «إنشاء حساب جديد»: a brand-new Starlink account made from the app - first a new Outlook email
 * (Microsoft's signup page, filled with what the operator typed), then «تفعيل Starlink» with the
 * KIT/SN and the customer's name, email and phone. Pure: the device record to save and what each
 * of the two pages is filled with.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { splitPhoneNumber } from "./phoneCountryCodes";

export interface CreationInput {
  /** The customer's full name (Starlink wants it as first + family name). */
  fullName: string;
  /** Digits with the country code, the shape `account.phone` is stored in. */
  phone?: string;
  /** KIT… or the dish's serial number - whichever is on the box. */
  kit: string;
  /** The new Outlook address; a bare name gets "@outlook.com". */
  email: string;
  password: string;
}

/** «أحمد ولد سالم» -> first «أحمد», family «ولد سالم». One word: it is both. */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { firstName: "", lastName: "" };
  if (words.length === 1) return { firstName: words[0]!, lastName: words[0]! };
  return { firstName: words[0]!, lastName: words.slice(1).join(" ") };
}

/** A bare name becomes an Outlook address; anything with "@" is kept as typed (lower-cased). */
export function normalizeNewEmail(email: string): string {
  const trimmed = email.trim().replace(/\s+/g, "").toLowerCase();
  if (!trimmed) return "";
  return trimmed.includes("@") ? trimmed : `${trimmed}@outlook.com`;
}

/** KIT and serial numbers are written in capitals on the box. */
export function normalizeKit(kit: string): string {
  return kit.trim().replace(/\s+/g, "").toUpperCase();
}

/** The first problem with the form, in Arabic, or null when it can start. */
export function creationProblem(input: CreationInput): string | null {
  if (!input.fullName.trim()) return "اختر الزبون أولاً";
  if (normalizeKit(input.kit).length < 6) return "اكتب رقم KIT أو SN كما على الصندوق";
  const email = normalizeNewEmail(input.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "اكتب البريد الجديد (مثال: name@outlook.com)";
  // Microsoft refuses a shorter one.
  if (input.password.length < 8) return "كلمة مرور البريد 8 أحرف على الأقل";
  return null;
}

/** The device saved right away, marked «🆕 قيد الإنشاء» until the new account is done. */
export function buildCreatedAccount(
  base: StarlinkAccountSummary,
  input: CreationInput,
  now: Date = new Date(),
): StarlinkAccountSummary {
  const kit = normalizeKit(input.kit);
  const isKit = kit.startsWith("KIT");
  return {
    ...base,
    name: base.name.trim() || input.fullName.trim(),
    phone: input.phone?.trim() || base.phone || undefined,
    expectedEmail: normalizeNewEmail(input.email),
    expectedEmailPassword: input.password,
    kitNumber: isKit ? kit : base.kitNumber,
    serialNumber: isKit ? base.serialNumber : kit,
    creation: { ...splitFullName(input.fullName), startedAt: now.toISOString() },
  };
}

/** Microsoft's «Add an email address» (where it sends its codes) - always the shop's own. */
export const SIGNUP_RECOVERY_EMAIL = "starnet.om@gmail.com";

export interface OutlookSignup {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  recoveryEmail: string;
}

/** What Microsoft's «إنشاء حساب» pages are filled with. Null when the device isn't being created. */
export function outlookSignupFor(account: StarlinkAccountSummary): OutlookSignup | null {
  const email = account.expectedEmail?.trim();
  if (!account.creation || !email) return null;
  return {
    email,
    password: account.expectedEmailPassword ?? "",
    firstName: account.creation.firstName,
    lastName: account.creation.lastName,
    recoveryEmail: SIGNUP_RECOVERY_EMAIL,
  };
}

export interface StarlinkActivation {
  kit: string;
  firstName: string;
  lastName: string;
  email: string;
  /** With its country code (+222…), as the operator wants it on the account. */
  phone: string;
}

/** What «تفعيل Starlink» and «معلومات الاتصال» are filled with. Null when not being created. */
export function starlinkActivationFor(account: StarlinkAccountSummary): StarlinkActivation | null {
  if (!account.creation) return null;
  const kit = account.kitNumber?.trim() || account.serialNumber?.trim() || "";
  if (!kit) return null;
  // The names typed at creation; the device's own name if those were lost.
  const names = account.creation.firstName ? account.creation : splitFullName(account.name);
  const { dialCode, localNumber } = splitPhoneNumber(account.phone);
  return {
    kit,
    firstName: names.firstName,
    lastName: names.lastName,
    email: account.expectedEmail?.trim() ?? "",
    phone: localNumber ? `${dialCode}${localNumber}` : "",
  };
}
