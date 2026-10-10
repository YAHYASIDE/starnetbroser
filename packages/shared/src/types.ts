/**
 * Domain types shared between services/api, apps/web, and
 * services/browser-worker. Nothing in this file has any business logic or
 * any dependency on a specific database/HTTP library - it exists so all
 * three can agree on shapes without importing each other directly.
 */

export enum DeviceStatus {
  UNKNOWN = "UNKNOWN",
  GREEN = "GREEN",
  YELLOW = "YELLOW",
  RED = "RED",
  GRAY = "GRAY",
}

export enum BrowserSessionStatus {
  STOPPED = "STOPPED",
  STARTING = "STARTING",
  RUNNING = "RUNNING",
  STOPPING = "STOPPING",
}

/** A STAR NET operator's own management-account login - NOT a Starlink account. */
export interface User {
  id: string;
  email: string;
  totpEnabled: boolean;
  createdAt: string;
}

export interface Device {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
}

/**
 * A billing-capable entity that can own more than one StarlinkAccount.
 * Deliberately separate from StarlinkAccount from day one - see
 * docs/ARCHITECTURE.md "Domain model, built for accounting later".
 */
export interface Customer {
  id: string;
  ownerUserId: string;
  name: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** «المعطلة»: ملغي اشتراك / محروق / منقول / إيميل غير رئيسي ("other" = an older "عطل آخر"). */
export type DeviceFaultReason = "canceled" | "burned" | "moved" | "secondary" | "other";

/** List-view shape - never includes decrypted secrets. */
export interface StarlinkAccountSummary {
  id: string;
  customerId: string;
  name: string;
  deviceName: string;
  kitNumber: string;
  serialNumber: string;
  standbyDate: string;
  rechargeDate: string;
  balanceDue: string;
  currency: string;
  dishStatus: DeviceStatus;
  wifiStatus: DeviceStatus;
  alertReason: string;
  lastUpdated: string;
  lastSuccessfulScanAt: string | null;
  planName: string;
  /**
   * Fields below this line come only from the local, on-device Starlink
   * sync (packages/local-browser-plugin's isolated WebView + "تحديث من
   * Starlink") - optional because most accounts won't have synced yet,
   * and because syncing must never invent a value for a field it didn't
   * actually find on the currently-open page/section.
   */
  /** Starts with "ACC-" - the account number, deliberately never confused with starlinkId. */
  accountNumber?: string;
  /** The dish's own internal identifier - not the account number. */
  starlinkId?: string;
  /** Normalized to "active" | "standby" | "canceled" | "suspended" - never left as raw page text. */
  serviceStatus?: string;
  /** Set only when Starlink shows a resumable pending cancellation ("من المقرر أن تنتهي خدمتك
   * في ..." with a "استئناف"/Resume option) - the service is still `serviceStatus: "active"`
   * right now, this is just the date it will actually stop unless resumed before then. Shown as
   * its own separate info note, never folded into the plan/status badge itself. */
  pendingCancellationDate?: string;
  /** ⏸️ Starlink's «will switch to Standby Mode on …» banner: the device moves to the Standby plan
   * (SIS) on this date - still a service, never «ملغي». */
  pendingStandbyDate?: string;
  /** 💳 Last 4 digits of the KAST card that pays this device's Starlink (kastCards.ts) - to guess
   * which device a refused payment was. */
  paymentCardLast4?: string;
  // `phone` below is manually-entered local customer contact number (like `name`), used only for
  // the "تواصل عبر واتساب" card action - never touched by Starlink sync, and unrelated to the
  // Settings page's own phone number, which sync deliberately never reads at all.
  /** Manually entered by the STAR NET operator - optional since older/existing accounts won't have one. */
  phone?: string;
  /** The account's registered login email, as read from Starlink's own Settings page - never the
   * phone number shown on that same page, which is unrelated to (and never confused with) `phone`. */
  starlinkAccountEmail?: string;
  /** The account holder's name as Starlink itself reports it - a SEPARATE field from `name`
   * (the operator's own manually-entered customer name), per explicit product decision: the card
   * shows both as two distinct name slots, one auto-synced and one hand-entered, never merging
   * them into one. */
  starlinkAccountHolderName?: string;
  /** Manually entered by the STAR NET operator - the login email they expect this account to use.
   * Compared against `starlinkAccountEmail` (see lib/emailMatch.ts) to warn when Starlink's synced
   * email doesn't match; never written by Starlink sync itself. */
  expectedEmail?: string;
  /** Manually entered by the STAR NET operator - the login password for `expectedEmail` (the
   * device's primary/main email address). Never touched by Starlink sync, never invented - absent
   * unless the operator actually typed one in. */
  expectedEmailPassword?: string;
  /** Up to two more emails also usable on/registered to this device besides the primary
   * `expectedEmail` above (so at most 3 emails total per device), each with its own optional
   * password. Manually entered by the operator, never touched by Starlink sync. */
  extraEmails?: { address: string; password?: string }[];
  /** Manually entered by the STAR NET operator - this device's own Wi-Fi network password (not
   * the Starlink account login password). Never touched by Starlink sync. */
  wifiPassword?: string;
  /** The Starlink sign-in password itself, when it differs from the codes above: kept by the
   * device's browser after Starlink said the saved one was wrong and the operator typed the right
   * one (StarlinkLoginWatch.java), or typed in «تعديل». Used first when signing in. */
  starlinkPassword?: string;
  /** Starts with "SL-" - the subscription's own identifier, a different value from `accountNumber`
   * (which starts with "ACC-"). */
  subscriptionId?: string;
  /** Every subscription's name on this one account, from the Subscriptions list page. A device can
   * legitimately carry more than one subscription (e.g. "DEDE SIDI VAL" and "ARAWANI DI"), each
   * with its own KIT and subscription number but one login email - a Starlink quirk, not an error.
   * Synced only; the card lists them so the operator sees both. */
  subscriptions?: string[];
  /** Just the number, e.g. "261" - always gigabytes, so callers append the unit themselves. */
  dataUsageGb?: string;
  /** The Kit has been used outside its registered country/region for too long, per Starlink's own
   * banner - independent of `serviceStatus` (a device can be "active" billing-wise and still
   * region-restricted). Undefined until the first sync that actually resolves it either way. */
  isRestricted?: boolean;
  /** 🛂 Home shows «Complete Travel Registration by …» (Oct 2026): the service stops outside the
   * home country after the deadline. Explicit true/false from a Home read. */
  travelRegistrationRequired?: boolean;
  /** Its deadline as Starlink prints it ("October 15"). */
  travelRegistrationDue?: string;
  /** ✅ «اكتمل التوثيق» pressed (his Oct 2026 request): the deadline it was done for - the device
   * leaves «الأجهزة التي تحتاج توثيق» until Starlink asks again with another date. */
  travelRegistrationDoneFor?: string | null;
  travelRegistrationDoneAt?: string | null;
  /** ✅ A Home read confirmed the banner is gone after it was there (set by the sync merge) - the
   * device is in «تم توثيقها». The deadline it was for is kept beside it. */
  travelRegistrationVerifiedAt?: string | null;
  travelRegistrationVerifiedDue?: string | null;
  /** 💰 What he charged for the registration (his record in «تم توثيقها», per currency). On a rep's
   * device it also LOCKS that rep and his travel percent at the moment it is saved
   * (apps/web/src/lib/travelBook.ts) - changing the percent later never rewrites it. */
  travelRegistrationPrice?: { amount: number; currency: string; repId?: string; repPercent?: number } | null;
  /** 🚗 "service is restricted because it is moving too fast" - a residential plan used while
   * moving; it works again once stopped. Explicit true/false; never the out-of-country restriction. */
  movingRestricted?: boolean;
  /** ISO two-letter code of the country in Starlink's "موقع الخدمة" address (e.g. "GR") - the
   * country the device is registered to, so also the currency Starlink bills it in. Synced only. */
  serviceCountry?: string;
  /** Starlink's "وضع المحيط" (Ocean Mode) switch is ON for this device: maritime per-GB billing
   * that can reach thousands of dollars - the app raises a full-screen alarm. Synced only. */
  oceanMode?: boolean;
  /** "باقة الأولوية نفدت" banner: the plan's priority data (e.g. 100 GB) is used up - the service
   * still works, at limited speed, until the next cycle. Explicit true/false like isRestricted. */
  /** The alerts Starlink lists under «الأجهزة» (as shown, e.g. "Starlink is partially obstructed.
   * …"), from the latest read of that section - empty when it showed none. */
  dishAlerts?: string[];
  priorityDataExhausted?: boolean;
  /** "لا توجد اشتراكات" on the subscriptions page: this email has no subscription (canceled or
   * moved away) - the device shows under «المعطلة» as ملغي اشتراك. Explicit true/false. */
  noSubscription?: boolean;
  /** Diagnostic from the last read of the "الأجهزة" section: what the dish/Wi-Fi dot reader saw. */
  dotTrace?: string;
  /** The saved email is a limited user on someone else's Starlink account (its menu has no
   * billing): billing, balance and billing suspension can't be read from it - check them from the
   * owner's account. Set by sync from the Home page; undefined until known. */
  limitedAccess?: boolean;
  /**
   * Links this device/card to a local Client record (see apps/web/src/lib/clientStore.ts) - a
   * single customer may own several devices, each with its own card. Optional and absent on every
   * account created before this field existed ("الزبون غير محدد" in the UI) - never inferred from
   * name/email similarity, only ever set explicitly by the operator through the client picker.
   * Deliberately NOT the same field as `customerId` above, which is the unrelated cloud-backend
   * billing entity from services/api - this is the local-only grouping key used in demo/local mode.
   */
  clientId?: string;
  /**
   * Links this device/card to a local Representative record (see apps/web/src/lib/repStore.ts) -
   * the sales rep who manages/represents this account, entirely independent of `clientId` above (a
   * device may have a client, a representative, both, or neither). Optional and absent on every
   * account created before this field existed. Never inferred - only ever set explicitly by the
   * operator through the representative picker, same rule as `clientId`. Used only to SEED a new
   * sale invoice's own representative choice with a sensible default (see InvoiceSection.tsx's
   * repFromClientDevice) - an invoice always keeps its own separate, changeable representativeId,
   * never a live reference to this field.
   */
  representativeId?: string;
  /** 📱 The rep who added this device from his app (his «تسجيلاتي», approved by the operator) -
   * shown on the card for good, and a home filter. */
  addedByRepId?: string;
  /** When the operator approved it (ISO). */
  addedByRepAt?: string;
  /** When the device was added in the app (ISO) - for «مزامنة الآن» → «أضفناها اليوم». Absent on
   * devices added before this existed. */
  addedAt?: string;
  /** Set only by an explicit operator action ("متعطل" on the card) - a hardware problem, entirely
   * independent of the Starlink subscription's own serviceStatus (a device can be active AND
   * broken, or suspended AND fine). Cleared (back to undefined/null) once the operator marks it
   * fixed. */
  deviceFault?: { reason: DeviceFaultReason; note: string; reportedAt: string } | null;
  /** Groups the app found by itself («ملغي اشتراك» / «إيميل غير رئيسي») that the operator removed
   * with «إزالة العطل»: Starlink's own flags stay as read, the device just leaves «المعطلة». A sync
   * that reads the flag cleared drops the dismissal, so a later real one shows again. */
  faultDismissed?: DeviceFaultReason[] | null;
  /** 🛠️ "قيد الإصلاح": a technical problem we're following with Starlink support - separate from
   * deviceFault (the device stays in renewals and lists), shown in its own home list. */
  underRepair?: { note: string; since: string } | null;
  /** 📌 The renewal (billing) day the operator locked (1-28): a sync may move the month but never
   * this day - a read on another day is kept aside as `renewalDayMismatch` for him to decide. */
  lockedRenewalDay?: number | null;
  /** ⚠️ A sync read a renewal date whose day differs from `lockedRenewalDay` (the date was kept). */
  renewalDayMismatch?: { date: string; day: number; at: string } | null;
  /** A read date he chose to ignore - the same read never raises the warning again. */
  renewalDayIgnored?: string | null;
  /** 🆕 "قيد الإنشاء": a brand-new Starlink account the operator is creating from the app (a new
   * Outlook email, then «تفعيل Starlink» with the KIT). The names typed into both forms are kept
   * here until the operator marks it done, or the first sync reads the new account. */
  creation?: { firstName: string; lastName: string; startedAt: string } | null;
  /** ISO timestamp set only by an explicit "أرشفة" action - an archived device is hidden from the
   * main list (see HomeView's "الأرشيف" view) but keeps every ledger entry, allocation and
   * exchange-rate link exactly as-is; null/undefined again once restored. Never implies deleted. */
  archivedAt?: string | null;
  /** ISO timestamp set only by an explicit "حذف" action - moves the device to a recoverable trash
   * (see HomeView's "سلة المحذوفات" view) instead of removing it outright; the underlying ledger
   * entries/allocations are never touched by this alone. Permanent removal is a separate, later
   * action taken from within the trash view itself. */
  deletedAt?: string | null;
  /** The device's fixed monthly price ("السعر الشهري الثابت"), set by the operator - lets "تجديد"
   * record the month's shipment in one tap. Only a default: every shipment still locks its own
   * amounts and rates when created, so editing this never changes past entries. */
  renewalPlan?: RenewalPlan;
}

export interface RenewalPlan {
  /** What the customer pays per renewal, in a ledger currency (USD/MRU/SIFA). */
  saleAmount: number;
  saleCurrency: string;
  /** What Starlink charges per renewal, in any registered currency. */
  costAmount: number;
  costCurrency: string;
  /** Whether a renewal starts with the Starlink cost unpaid (D - the usual case: the month is
   * borrowed from Starlink and paid when the device stops). Unset means D. */
  costPending?: boolean;
  /** 💱 He confirmed this price really is in another currency than the device's rep / customer. */
  currencyConfirmed?: boolean;
}

/** Detail-view shape - includes decrypted secrets, only ever returned to
 * the account's own owner over HTTPS. */
export interface StarlinkAccountDetail extends StarlinkAccountSummary {
  email: string;
  emailSecret: string;
  wifiCode: string;
  notes: string;
  accountNumber: string;
  subscriptionId: string;
  starlinkId: string;
  serviceStatus: string;
  serviceLocation: string;
  billingPeriod: string;
  paymentDueDate: string;
  softwareVersion: string;
  uptime: string;
}

export interface BrowserStatus {
  status: BrowserSessionStatus;
  lastStartedAt: string | null;
  lastStoppedAt: string | null;
  lastActivityAt: string | null;
}

/**
 * What the browser-worker returns from one read-only scan. Every field is
 * either an empty string / UNKNOWN or an actually-observed value - never
 * fabricated. See packages/shared/src/reader-fields.ts for the exact
 * semantics of "never overwrite a known value with a blank one".
 */
export interface ReadResult {
  balanceDue: string;
  currency: string;
  standbyDate: string;
  kitNumber: string;
  serialNumber: string;
  subscriptionId: string;
  accountNumber: string;
  starlinkId: string;
  deviceName: string;
  dishStatus: DeviceStatus;
  wifiStatus: DeviceStatus;
  alertReason: string;
  lastUpdated: string;
  planName: string;
  serviceStatus: string;
  serviceLocation: string;
  billingPeriod: string;
  paymentDueDate: string;
  softwareVersion: string;
  uptime: string;
  fieldsFound: string[];
}

export function emptyReadResult(): ReadResult {
  return {
    balanceDue: "",
    currency: "",
    standbyDate: "",
    kitNumber: "",
    serialNumber: "",
    subscriptionId: "",
    accountNumber: "",
    starlinkId: "",
    deviceName: "",
    dishStatus: DeviceStatus.UNKNOWN,
    wifiStatus: DeviceStatus.UNKNOWN,
    alertReason: "",
    lastUpdated: "",
    planName: "",
    serviceStatus: "",
    serviceLocation: "",
    billingPeriod: "",
    paymentDueDate: "",
    softwareVersion: "",
    uptime: "",
    fieldsFound: [],
  };
}
