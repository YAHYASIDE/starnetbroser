import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import type { SyncedStarlinkFields } from "@starnet/local-browser-plugin";

/**
 * Arabic labels for the success message - point 8's "show which fields were updated".
 * Keys match SyncedStarlinkFields, not StarlinkAccountSummary's own field names, since that's
 * the vocabulary the user actually asked for on the page (e.g. "renewal date", not "rechargeDate").
 */
const FIELD_LABELS_AR: Record<keyof SyncedStarlinkFields, string> = {
  dishStatus: "حالة الطبق",
  wifiStatus: "حالة Wi-Fi",
  planName: "الخطة",
  renewalDate: "تاريخ التجديد",
  balanceDue: "الرصيد المستحق",
  currency: "العملة",
  starlinkId: "معرف Starlink",
  serialNumber: "الرقم التسلسلي",
  kitNumber: "رقم KIT",
  serviceStatus: "حالة الخدمة",
  accountHolderName: "اسم صاحب حساب Starlink",
};

export interface MergeSyncResult {
  account: StarlinkAccountSummary;
  /** Arabic labels of the fields that actually changed - empty means nothing new was found. */
  updatedFieldLabels: string[];
}

function toDeviceStatus(onlineOffline: string): DeviceStatus {
  return onlineOffline === "online" ? DeviceStatus.GREEN : DeviceStatus.RED;
}

/**
 * Applies Stage-1 synced fields onto one account. Deliberately narrow: only ever writes the
 * fields this sync feature is actually responsible for - never `name`, `customerId`, `id`,
 * `deviceName`, `alertReason`, `standbyDate` or anything else a person entered by hand - and
 * skips any field the page didn't actually have (undefined/blank), so a partial read can never
 * blank out something the account already had.
 */
export function mergeSyncedFields(
  account: StarlinkAccountSummary,
  fields: SyncedStarlinkFields,
): MergeSyncResult {
  const next: StarlinkAccountSummary = { ...account };
  const updatedFieldLabels: string[] = [];

  function noteChange<K extends keyof SyncedStarlinkFields>(field: K, changed: boolean) {
    if (changed) updatedFieldLabels.push(FIELD_LABELS_AR[field]);
  }

  function trimmedOrNull(raw: string | undefined): string | null {
    if (raw === undefined) return null;
    const trimmed = raw.trim();
    return trimmed ? trimmed : null; // never overwrite local data with an empty/unconfirmed value
  }

  const dish = trimmedOrNull(fields.dishStatus);
  if (dish) {
    const value = toDeviceStatus(dish);
    noteChange("dishStatus", next.dishStatus !== value);
    next.dishStatus = value;
  }

  const wifi = trimmedOrNull(fields.wifiStatus);
  if (wifi) {
    const value = toDeviceStatus(wifi);
    noteChange("wifiStatus", next.wifiStatus !== value);
    next.wifiStatus = value;
  }

  const planName = trimmedOrNull(fields.planName);
  if (planName) {
    noteChange("planName", next.planName !== planName);
    next.planName = planName;
  }

  const renewalDate = trimmedOrNull(fields.renewalDate);
  if (renewalDate) {
    noteChange("renewalDate", next.rechargeDate !== renewalDate);
    next.rechargeDate = renewalDate;
  }

  const balanceDue = trimmedOrNull(fields.balanceDue);
  if (balanceDue) {
    noteChange("balanceDue", next.balanceDue !== balanceDue);
    next.balanceDue = balanceDue;
  }

  const currency = trimmedOrNull(fields.currency);
  if (currency) {
    noteChange("currency", next.currency !== currency);
    next.currency = currency;
  }

  const starlinkId = trimmedOrNull(fields.starlinkId);
  if (starlinkId) {
    noteChange("starlinkId", next.starlinkId !== starlinkId);
    next.starlinkId = starlinkId;
  }

  const serialNumber = trimmedOrNull(fields.serialNumber);
  if (serialNumber) {
    noteChange("serialNumber", next.serialNumber !== serialNumber);
    next.serialNumber = serialNumber;
  }

  const kitNumber = trimmedOrNull(fields.kitNumber);
  if (kitNumber) {
    noteChange("kitNumber", next.kitNumber !== kitNumber);
    next.kitNumber = kitNumber;
  }

  const serviceStatus = trimmedOrNull(fields.serviceStatus);
  if (serviceStatus) {
    noteChange("serviceStatus", next.serviceStatus !== serviceStatus);
    next.serviceStatus = serviceStatus;
  }

  const accountHolderName = trimmedOrNull(fields.accountHolderName);
  if (accountHolderName) {
    noteChange("accountHolderName", next.starlinkAccountHolderName !== accountHolderName);
    next.starlinkAccountHolderName = accountHolderName;
  }

  if (updatedFieldLabels.length > 0) {
    next.lastUpdated = "الآن";
  }

  return { account: next, updatedFieldLabels };
}
