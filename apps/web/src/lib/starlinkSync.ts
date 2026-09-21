import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import type { SyncedDeviceStatus, SyncedStarlinkFields } from "@starnet/local-browser-plugin";

type Section = "devices" | "subscriptions" | "billing" | "identifiers";

const SECTION_LABELS_AR: Record<Section, string> = {
  devices: "الأجهزة",
  subscriptions: "الاشتراك",
  billing: "الفوترة",
  identifiers: "المعرّفات",
};

/**
 * Arabic labels + section for the success message - point 6's "show which section and fields
 * were updated". Keys match SyncedStarlinkFields, not StarlinkAccountSummary's own field names,
 * since that's the vocabulary the user actually asked for (e.g. "renewal date", not "rechargeDate").
 */
const FIELD_INFO: Record<keyof SyncedStarlinkFields, { label: string; section: Section }> = {
  dishStatus: { label: "حالة الطبق", section: "devices" },
  wifiStatus: { label: "حالة Wi-Fi", section: "devices" },
  serviceStatus: { label: "حالة الاشتراك", section: "subscriptions" },
  planName: { label: "الخطة", section: "subscriptions" },
  renewalDate: { label: "تاريخ التجديد", section: "subscriptions" },
  balanceDue: { label: "الرصيد المستحق", section: "billing" },
  currency: { label: "العملة", section: "billing" },
  accountNumber: { label: "رقم الحساب", section: "identifiers" },
  starlinkId: { label: "معرف Starlink", section: "identifiers" },
  serialNumber: { label: "الرقم التسلسلي", section: "identifiers" },
  kitNumber: { label: "رقم KIT", section: "identifiers" },
};

export interface UpdatedField {
  field: keyof SyncedStarlinkFields;
  label: string;
  section: Section;
}

export interface MergeSyncResult {
  account: StarlinkAccountSummary;
  /** Empty means nothing changed - but see `scanned` for whether anything was even found. */
  updatedFields: UpdatedField[];
  /**
   * True when the read actually found at least one recognized field on the page, whether or not
   * any of them differed from what was already saved. Distinguishes "found fields, but they
   * already matched" from "found nothing on this page at all" - the two look identical from
   * `updatedFields.length === 0` alone, but call for different messages.
   */
  scanned: boolean;
}

function toDeviceStatus(value: SyncedDeviceStatus): DeviceStatus {
  switch (value) {
    case "online":
      return DeviceStatus.GREEN;
    case "offline":
      return DeviceStatus.RED;
    case "warning":
      return DeviceStatus.YELLOW;
    case "unknown":
      return DeviceStatus.GRAY;
  }
}

/**
 * Applies Stage-1 synced fields onto one account. Deliberately narrow: only ever writes the
 * fields this sync feature is actually responsible for - never `name`, `customerId`, `id`,
 * `deviceName`, `alertReason`, `standbyDate` or anything a person entered by hand, and never a
 * person's name/email/phone (explicitly deferred). Skips any field the currently-open page
 * didn't actually have, so reading one section (e.g. just Devices) never blanks out data a
 * previous tap already found on another section (e.g. Billing) - results accumulate across taps.
 */
export function mergeSyncedFields(
  account: StarlinkAccountSummary,
  fields: SyncedStarlinkFields,
): MergeSyncResult {
  const next: StarlinkAccountSummary = { ...account };
  const updatedFields: UpdatedField[] = [];

  function note(field: keyof SyncedStarlinkFields, changed: boolean) {
    if (changed) updatedFields.push({ field, ...FIELD_INFO[field] });
  }

  if (fields.dishStatus) {
    const value = toDeviceStatus(fields.dishStatus);
    note("dishStatus", next.dishStatus !== value);
    next.dishStatus = value;
  }

  if (fields.wifiStatus) {
    const value = toDeviceStatus(fields.wifiStatus);
    note("wifiStatus", next.wifiStatus !== value);
    next.wifiStatus = value;
  }

  if (fields.serviceStatus) {
    note("serviceStatus", next.serviceStatus !== fields.serviceStatus);
    next.serviceStatus = fields.serviceStatus;
  }

  const planName = fields.planName?.trim();
  if (planName) {
    note("planName", next.planName !== planName);
    next.planName = planName;
  }

  const renewalDate = fields.renewalDate?.trim();
  if (renewalDate) {
    note("renewalDate", next.rechargeDate !== renewalDate);
    next.rechargeDate = renewalDate;
  }

  // "0.00" is a real, confirmed zero balance, not an absent value - only check for undefined,
  // never falsiness, or a genuine zero balance would be silently dropped.
  if (fields.balanceDue !== undefined) {
    note("balanceDue", next.balanceDue !== fields.balanceDue);
    next.balanceDue = fields.balanceDue;
  }

  const currency = fields.currency?.trim();
  if (currency) {
    note("currency", next.currency !== currency);
    next.currency = currency;
  }

  const accountNumber = fields.accountNumber?.trim();
  if (accountNumber) {
    note("accountNumber", next.accountNumber !== accountNumber);
    next.accountNumber = accountNumber;
  }

  const starlinkId = fields.starlinkId?.trim();
  if (starlinkId) {
    note("starlinkId", next.starlinkId !== starlinkId);
    next.starlinkId = starlinkId;
  }

  const serialNumber = fields.serialNumber?.trim();
  if (serialNumber) {
    note("serialNumber", next.serialNumber !== serialNumber);
    next.serialNumber = serialNumber;
  }

  const kitNumber = fields.kitNumber?.trim();
  if (kitNumber) {
    note("kitNumber", next.kitNumber !== kitNumber);
    next.kitNumber = kitNumber;
  }

  const scanned = Object.keys(fields).length > 0;

  if (scanned) {
    // A scan that found fields is a confirmed, successful read of the page - record it even when
    // every value it found already matched what was saved, since "checked and nothing changed" is
    // still real information, not a no-op.
    next.lastSuccessfulScanAt = new Date().toISOString();
  }
  if (updatedFields.length > 0) {
    next.lastUpdated = "الآن";
  }

  return { account: next, updatedFields, scanned };
}

/**
 * Groups updated fields under their Arabic section headers, for the "what changed" message.
 * `scanned` (see MergeSyncResult) is what separates "found nothing on this page at all" from
 * "found fields, but they already matched" - the two must never share one message, or a
 * successful confirming scan would look identical to a failed one.
 */
export function formatSyncMessage(accountName: string, updatedFields: UpdatedField[], scanned: boolean): string {
  if (updatedFields.length === 0) {
    if (scanned) {
      return "تم الفحص بنجاح ولا توجد تغييرات";
    }
    return `لم يتم العثور على بيانات جديدة لتحديث حساب "${accountName}".`;
  }

  const bySection = new Map<Section, string[]>();
  for (const { section, label } of updatedFields) {
    const labels = bySection.get(section) ?? [];
    labels.push(label);
    bySection.set(section, labels);
  }

  const sections = Array.from(bySection.entries())
    .map(([section, labels]) => `${SECTION_LABELS_AR[section]}:\n- ${labels.join("\n- ")}`)
    .join("\n\n");

  return `تم تحديث حساب "${accountName}" من Starlink\n\n${sections}`;
}
