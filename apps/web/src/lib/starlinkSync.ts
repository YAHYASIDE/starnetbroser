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
  pendingCancellationDate: { label: "موعد إيقاف الاشتراك", section: "subscriptions" },
  accountHolderName: { label: "اسم صاحب الحساب (Starlink)", section: "identifiers" },
  accountEmail: { label: "البريد الإلكتروني (Starlink)", section: "identifiers" },
  phone: { label: "رقم الهاتف", section: "identifiers" },
  balanceDue: { label: "الرصيد المستحق", section: "billing" },
  currency: { label: "العملة", section: "billing" },
  accountNumber: { label: "رقم الحساب", section: "identifiers" },
  subscriptionId: { label: "رقم الاشتراك", section: "identifiers" },
  starlinkId: { label: "معرف Starlink", section: "identifiers" },
  serialNumber: { label: "الرقم التسلسلي", section: "identifiers" },
  kitNumber: { label: "رقم KIT", section: "identifiers" },
  dataUsageGb: { label: "إجمالي استهلاك الباقة", section: "subscriptions" },
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
 * `deviceName`, `alertReason`, `standbyDate` or anything else a person entered by hand. Per
 * explicit product decision, the Starlink-reported account holder name is its own separate field
 * (`starlinkAccountHolderName`) - the card shows it alongside the operator's own `name` as two
 * distinct slots, never merging or overwriting one with the other. Skips any field the
 * currently-open page didn't actually have, so reading one section (e.g. just Devices) never
 * blanks out data a previous tap already found on another section (e.g. Billing) - results
 * accumulate across taps. `phone` is the one exception to "never a person entered by hand": it IS
 * synced (each isolated account session has its own Starlink login, so the Settings page's phone
 * genuinely is this customer's own number), but only ever fills in a currently-empty phone, never
 * overwriting one the operator already typed in.
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

  const pendingCancellationDate = fields.pendingCancellationDate?.trim();
  if (pendingCancellationDate) {
    note("pendingCancellationDate", next.pendingCancellationDate !== pendingCancellationDate);
    next.pendingCancellationDate = pendingCancellationDate;
  }

  const accountHolderName = fields.accountHolderName?.trim();
  if (accountHolderName) {
    note("accountHolderName", next.starlinkAccountHolderName !== accountHolderName);
    next.starlinkAccountHolderName = accountHolderName;
  }

  const accountEmail = fields.accountEmail?.trim();
  if (accountEmail) {
    note("accountEmail", next.starlinkAccountEmail !== accountEmail);
    next.starlinkAccountEmail = accountEmail;
  }

  // Unlike every other field here, `phone` is also a manually-editable operator field (the
  // WhatsApp contact number, see AccountDialog) - a sync must never silently overwrite one the
  // operator already typed in by hand, so this only ever fills in a currently-empty phone.
  const phone = fields.phone?.trim();
  if (phone && !next.phone?.trim()) {
    note("phone", true);
    next.phone = phone;
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

  const subscriptionId = fields.subscriptionId?.trim();
  if (subscriptionId) {
    note("subscriptionId", next.subscriptionId !== subscriptionId);
    next.subscriptionId = subscriptionId;
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

  const dataUsageGb = fields.dataUsageGb?.trim();
  if (dataUsageGb) {
    note("dataUsageGb", next.dataUsageGb !== dataUsageGb);
    next.dataUsageGb = dataUsageGb;
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

/** The subset of AccountDataSyncedEvent/PendingAccountSync this module actually needs - avoids a
 * hard dependency on which of the two (live event vs. pending-list entry) a caller has. */
export interface PendingSyncLike {
  syncId: string;
  accountId: string;
  fields: SyncedStarlinkFields;
}

export interface SyncOutcomeMessage {
  accountId: string;
  message: string;
}

export interface ApplyPendingSyncsResult {
  accounts: StarlinkAccountSummary[];
  /** One message per sync actually applied to a known account, in the same order as `syncs`. */
  messages: SyncOutcomeMessage[];
  /** Every syncId that was applied (or found to be safely discardable) - ack all of these. */
  ackSyncIds: string[];
}

/**
 * Applies zero or more pending sync results to `accounts` in order, folding each one through
 * mergeSyncedFields sequentially so results for the same account accumulate across sections
 * (Devices, then Subscriptions, then Billing, ...) without an earlier result ever being erased by
 * a later one - this is what makes it safe to apply several consecutive results at once (e.g. a
 * resume-time drain after the app was backgrounded for a while, or two quick taps that both
 * landed before the app was reopened), not just one at a time.
 *
 * Deliberately a pure function of its arguments (accounts, syncs, alreadyProcessed) - no React
 * state, no localStorage, no native calls - so both "one live event" and "N pending results
 * fetched after the live event was lost entirely" go through exactly the same, directly testable
 * code path. `alreadyProcessed` is what guarantees a syncId is never applied (or messaged) twice,
 * whether it reached the caller once via the live event and again via a pending-list drain before
 * its ack round-tripped, or appears twice in the same `syncs` batch for any other reason.
 */
export function applyPendingSyncs(
  accounts: StarlinkAccountSummary[],
  syncs: PendingSyncLike[],
  alreadyProcessed: ReadonlySet<string>,
): ApplyPendingSyncsResult {
  let current = accounts;
  const messages: SyncOutcomeMessage[] = [];
  const ackSyncIds: string[] = [];
  const seenThisBatch = new Set<string>();

  for (const sync of syncs) {
    if (alreadyProcessed.has(sync.syncId) || seenThisBatch.has(sync.syncId)) {
      continue;
    }
    seenThisBatch.add(sync.syncId);

    const target = current.find((item) => item.id === sync.accountId);
    if (!target) {
      // No matching account (e.g. deleted since this result was recorded) - nothing to apply,
      // but the record is still safe to discard rather than being retried forever.
      ackSyncIds.push(sync.syncId);
      continue;
    }

    const { account: merged, updatedFields, scanned } = mergeSyncedFields(target, sync.fields);
    current = current.map((item) => (item.id === sync.accountId ? merged : item));
    messages.push({ accountId: sync.accountId, message: formatSyncMessage(merged.name, updatedFields, scanned) });
    ackSyncIds.push(sync.syncId);
  }

  return { accounts: current, messages, ackSyncIds };
}

export interface SyncBatchDeps {
  isDemoMode: boolean;
  /** May throw - a thrown save is what makes runSyncBatch report "save-failed". */
  saveDemoAccounts: (accounts: StarlinkAccountSummary[]) => void;
  /** Same contract - the "storage used" for a non-demo account (see syncedFieldsCache.ts). */
  saveSyncedFieldsCache: (accountId: string, fields: SyncedStarlinkFields) => void;
  showAlert: (message: string) => void;
}

export type SyncBatchOutcome =
  | { status: "nothing-to-apply" }
  | { status: "save-failed" }
  | { status: "applied"; accounts: StarlinkAccountSummary[]; appliedSyncIds: string[] };

/**
 * Runs one merge + save + message cycle for a batch of pending syncs - deliberately everything
 * BUT the native ack call itself (that stays a separate, stateful retry concern owned by the
 * caller, since it can legitimately need retrying minutes later on its own schedule). save/alert
 * are dependency-injected specifically so the one guarantee that matters most - a success message
 * is never shown, and nothing is ever marked applied, before the save has actually succeeded - is
 * directly testable without mocking window.alert, localStorage or a native bridge.
 */
export function runSyncBatch(
  accounts: StarlinkAccountSummary[],
  syncs: PendingSyncLike[],
  alreadyProcessed: ReadonlySet<string>,
  deps: SyncBatchDeps,
): SyncBatchOutcome {
  const result = applyPendingSyncs(accounts, syncs, alreadyProcessed);
  if (result.ackSyncIds.length === 0) {
    return { status: "nothing-to-apply" };
  }

  let saved = true;
  try {
    if (deps.isDemoMode) {
      deps.saveDemoAccounts(result.accounts);
    } else {
      // No backend write-back exists for this feature yet (services/api has no update-account
      // endpoint, and adding one is out of this feature's scope) - this local cache of just the
      // synced fields is "the storage actually used" for that mode.
      for (const sync of syncs) {
        if (result.ackSyncIds.includes(sync.syncId)) {
          deps.saveSyncedFieldsCache(sync.accountId, sync.fields);
        }
      }
    }
  } catch {
    saved = false;
  }

  if (!saved) {
    // Never show a success message and never report anything as applied over an unsaved merge -
    // the caller must leave every syncId in this batch unprocessed so it's retried in full.
    deps.showAlert("تعذر حفظ بيانات المزامنة على هذا الجهاز. سيُعاد تجربة هذا التحديث لاحقًا.");
    return { status: "save-failed" };
  }

  for (const { message } of result.messages) deps.showAlert(message);
  return { status: "applied", accounts: result.accounts, appliedSyncIds: result.ackSyncIds };
}

/**
 * Re-applies cached Stage-1 synced fields (see syncedFieldsCache.ts) onto freshly-fetched real
 * accounts, via the exact same mergeSyncedFields() every other sync path uses. This is what makes
 * a real (non-demo) account's last synced result survive the next listAccounts() re-fetch instead
 * of the server's (unsynced) value silently winning - `getCached` is injected so this stays a pure
 * function of its arguments, directly testable without touching localStorage.
 */
export function reapplyCachedSyncedFields(
  accounts: StarlinkAccountSummary[],
  getCached: (accountId: string) => SyncedStarlinkFields | undefined,
): StarlinkAccountSummary[] {
  return accounts.map((account) => {
    const cached = getCached(account.id);
    if (!cached) return account;
    return mergeSyncedFields(account, cached).account;
  });
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
