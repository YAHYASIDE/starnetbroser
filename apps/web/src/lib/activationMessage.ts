import type { StarlinkAccountSummary } from "@starnet/shared";
import { deviceEmail } from "./mailboxes";

/** STAR NET's support contacts printed at the end of «رسالة التفعيل» (his own message, Oct 22 2026). */
export const SUPPORT_WHATSAPP = "22374646158";
export const SUPPORT_EMAIL = "starnet.om@gmail.com";

type ActivationAccount = Pick<
  StarlinkAccountSummary,
  | "name"
  | "expectedEmail"
  | "starlinkAccountEmail"
  | "expectedEmailPassword"
  | "wifiPassword"
  | "kitNumber"
  | "serialNumber"
  | "subscriptionId"
  | "accountNumber"
  | "starlinkAccountHolderName"
>;

/** The three values only a Starlink sync reads - missing ones are synced first («مزامنة أولًا»). */
export type SyncedActivationField = "kit" | "subscription" | "account";

export const SYNCED_FIELD_LABELS: Record<SyncedActivationField, string> = {
  kit: "KIT",
  subscription: "رقم الاشتراك",
  account: "رقم الحساب ACC",
};

const PLACEHOLDERS: Record<SyncedActivationField, string> = {
  kit: "[ارسل صورة الـ KIT]",
  subscription: "[ارسل صورة الاشتراك]",
  account: "[ارسل صورة الحساب]",
};

function syncedValues(account: ActivationAccount): Record<SyncedActivationField, string> {
  return {
    kit: (account.kitNumber || account.serialNumber || "").trim(),
    subscription: (account.subscriptionId || "").trim(),
    account: (account.accountNumber || "").trim(),
  };
}

export function missingActivationFields(account: ActivationAccount): SyncedActivationField[] {
  const values = syncedValues(account);
  return (Object.keys(values) as SyncedActivationField[]).filter((key) => !values[key]);
}

/** «18 / 9 / 2026» - his date style. */
export function activationDateLabel(date: Date): string {
  return `${date.getDate()} / ${date.getMonth() + 1} / ${date.getFullYear()}`;
}

/**
 * 📨 «رسالة التفعيل» - the message he sends a customer once a device is activated, word for word
 * his own (WhatsApp *bold*). A value only Starlink knows that wasn't read yet keeps his
 * «[ارسل صورة …]»; a value he never entered (Wi-Fi, mail password) leaves its line out.
 */
export function buildActivationMessage(account: ActivationAccount, clientName: string | undefined, date: Date): string {
  const synced = syncedValues(account);
  const line = (label: string, value: string | undefined) => (value && value.trim() ? [`- *${label}*: ${value.trim()}`] : []);
  return [
    "*⭐ STAR NET*",
    `*تم تفعيل جهاز Starlink بنجاح بتاريخ: ${activationDateLabel(date)}*`,
    "",
    "*بيانات الحساب*",
    ...line("اسم العميل", clientName || account.starlinkAccountHolderName || account.name),
    ...line("البريد الإلكتروني", deviceEmail(account)),
    ...line("كلمة مرور البريد الإلكتروني", account.expectedEmailPassword),
    ...line("كلمة مرور شبكة Wi-Fi", account.wifiPassword),
    `- *الرقم التسلسلي KIT*: ${synced.kit || PLACEHOLDERS.kit}`,
    `- *رقم الاشتراك*: ${synced.subscription || PLACEHOLDERS.subscription}`,
    `- *رقم الحساب ACC*: ${synced.account || PLACEHOLDERS.account}`,
    "",
    "*في حال وجود خطأ في المعلومات تواصل مع فريق الدعم*",
    `*واتساب الدعم:* https://wa.me/${SUPPORT_WHATSAPP}`,
    "*البريد الإلكتروني للدعم:*",
    SUPPORT_EMAIL,
  ].join("\n");
}
