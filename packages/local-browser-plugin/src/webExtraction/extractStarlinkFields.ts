import type { SyncedStarlinkFields } from "../definitions";
import { extractDeviceStatus } from "./deviceStatus";
import {
  ACCOUNT_NUMBER_LABELS,
  KIT_NUMBER_LABELS,
  RENEWAL_DATE_LABELS,
  SERIAL_NUMBER_LABELS,
  SERVICE_STATUS_LABELS,
  STARLINK_ID_LABELS,
  extractAccountEmail,
  extractAccountHolderName,
  extractAccountNumber,
  extractBalance,
  extractBillingDueDay,
  extractDataUsageGb,
  extractLabeledValue,
  extractPhoneNumber,
  extractPlanBadgeStatus,
  extractPlanName,
  extractRenewalBadgeDate,
  extractSubscriptionId,
  extractSubscriptionInvoiceDueDay,
  hasBillingSuspensionBanner,
  hasRegionRestrictedBanner,
  hasScheduledEndBanner,
  isCompleteDate,
  isOnAccountHomePage,
  nextOccurrenceOfDay,
  normalizeDateLike,
  normalizeServiceStatus,
} from "./textFields";
import { toLines, toVisibleText } from "./visibleText";

// "starlink" (the real device-row label, e.g. "STARLINK") is deliberately included even though
// the same word also appears elsewhere on the page (the nav header logo, "معرف Starlink") -
// extractDeviceStatus tries every "starlink"-labeled element in DOM order and only returns a
// result for whichever one actually has a resolvable status (aria-label/title, or a colored dot
// within 3 ancestor hops); the header/identifier text never has either, so it's skipped over.
const DISH_LABELS = ["starlink dish", "dish", "starlink", "الطبق", "طبق ستارلينك", "الهوائي"];
const WIFI_LABELS = ["wi-fi", "wifi", "router", "واي فاي", "الراوتر"];

/**
 * Stage 1 Starlink data sync: reads whatever section of the account's own isolated WebView is
 * currently open and returns only the small set of fields it actually found - never raw HTML or
 * page text. Caller (AccountBrowserActivity) is responsible for the AllowedUrl gate before and
 * after calling this; this function only ever sees a Document it's already safe to read.
 */
export function extractStarlinkFields(doc: Document): SyncedStarlinkFields {
  const fields: SyncedStarlinkFields = {};

  const dishStatus = extractDeviceStatus(doc, DISH_LABELS);
  if (dishStatus) fields.dishStatus = dishStatus;

  const wifiStatus = extractDeviceStatus(doc, WIFI_LABELS);
  if (wifiStatus) fields.wifiStatus = wifiStatus;

  const text = toVisibleText(doc.body);
  const lines = toLines(text);

  // The real page never prints a labeled "الحالة: ..." line for most states - the status badge
  // shown right on the "خطة الخدمة" card itself (see extractPlanBadgeStatus's own doc) is tried
  // when a labeled status wasn't found. Two page-wide banners are tried after that, in priority
  // order: a billing-suspension banner (hasBillingSuspensionBanner's own doc) means the service is
  // ALREADY stopped right now - checked first, since it can appear on a page (e.g. Billing) that
  // has no "خطة الخدمة" card at all for the badge check above to have found anything. A
  // "scheduled to end" banner alone (see hasScheduledEndBanner's own doc) never sets "standby" -
  // the service is still active right now, only a future renewal is being canceled - handled last,
  // alongside pendingCancellationDate below, once serviceStatus has already been resolved. Last of
  // all, isOnAccountHomePage's own doc: a confirmed Home page with no suspension banner actively
  // corrects a stale "suspended" left over from an earlier sync, which additive merging alone could
  // never fix on its own (the Home page has neither a "خطة الخدمة" card nor a labeled status line).
  let serviceStatus = normalizeServiceStatus(extractLabeledValue(lines, SERVICE_STATUS_LABELS));
  if (!serviceStatus) serviceStatus = extractPlanBadgeStatus(lines);
  // A "standby" read off the badge alone can still be wrong: see SCHEDULED_END_BANNER_LABELS' own
  // doc for the real, confirmed case where the exact same badge text appeared on a still-active
  // account, right alongside this banner. The banner is the more specific, dated signal and always
  // wins over a bare "standby" badge reading - never over "suspended"/"canceled" though, which are
  // unrelated states this banner says nothing about.
  if (serviceStatus === "standby" && hasScheduledEndBanner(lines)) serviceStatus = "active";
  if (!serviceStatus && hasBillingSuspensionBanner(lines)) serviceStatus = "suspended";
  if (!serviceStatus && hasScheduledEndBanner(lines)) serviceStatus = "active";
  if (!serviceStatus && isOnAccountHomePage(lines)) serviceStatus = "active";
  if (serviceStatus) fields.serviceStatus = serviceStatus;

  // Independent of serviceStatus entirely (see REGION_RESTRICTED_BANNER_LABELS' own doc) - a
  // device can be "active" and region-restricted at the same time. Once confirmed to be looking at
  // the account Home page with no such banner, actively correct a stale "restricted" left over from
  // an earlier sync (the kit may have already been returned to its home country) - the exact same
  // reasoning isOnAccountHomePage already applies to a stale "suspended" serviceStatus above.
  if (hasRegionRestrictedBanner(lines)) fields.isRestricted = true;
  else if (isOnAccountHomePage(lines)) fields.isRestricted = false;

  const planName = extractPlanName(lines);
  if (planName) fields.planName = planName;

  const renewalDate = extractLabeledValue(lines, RENEWAL_DATE_LABELS) ?? extractRenewalBadgeDate(lines);
  let resolvedRenewalDate: string | undefined;
  if (renewalDate) {
    const normalized = normalizeDateLike(renewalDate);
    // A real page can split a date's year/month from its day across separate text nodes, so the
    // label match only ever captures a truncated "٢٠٢٦/٩" - normalizeDateLike can't complete
    // that, so it comes back unchanged instead of a real date. Never store that: a corrupted
    // renewal date is worse than none, since expiryDay's fallback parsing can misread a bare
    // month digit as if it were the day.
    if (isCompleteDate(normalized)) resolvedRenewalDate = normalized;
  }
  // The Billing page's "دورة الفوترة" section has no other date signal on it at all (once the
  // account is active, the standby banner and "النهاية" badge are both gone) - only a bare
  // recurring due DAY, with no year in the text to normalize. Tried last, since a real full date
  // found elsewhere is always more specific/trustworthy than a computed "next occurrence".
  if (!resolvedRenewalDate) {
    const billingDueDay = extractBillingDueDay(lines);
    if (billingDueDay !== undefined) resolvedRenewalDate = nextOccurrenceOfDay(billingDueDay);
  }
  // Once suspended for non-payment, even the "دورة الفوترة" section above goes blank (see
  // extractSubscriptionInvoiceDueDay's own doc) - the "الفواتير" invoice list is the only date
  // signal left on the Billing page at all. Tried last of all: both a real dated signal and the
  // recurring billing-cycle day are always more specific/trustworthy when either is present.
  if (!resolvedRenewalDate) {
    const invoiceDueDay = extractSubscriptionInvoiceDueDay(lines);
    if (invoiceDueDay !== undefined) resolvedRenewalDate = nextOccurrenceOfDay(invoiceDueDay);
  }
  if (resolvedRenewalDate) fields.renewalDate = resolvedRenewalDate;
  // Reuses the very same resolved date (no separate parse) - the "scheduled to end" banner and
  // the "خطة الخدمة" card's "النهاية <date>" badge describe the same one date, just from two
  // different spots on the page. Only ever set alongside the banner itself, never inferred from
  // an ordinary renewal date alone (an account can have a real upcoming renewal with no
  // cancellation pending at all).
  if (hasScheduledEndBanner(lines) && resolvedRenewalDate) fields.pendingCancellationDate = resolvedRenewalDate;

  const balance = extractBalance(lines);
  if (balance) {
    fields.balanceDue = balance.amount;
    fields.currency = balance.currency;
  }

  const accountNumber = extractAccountNumber(lines, text);
  if (accountNumber) fields.accountNumber = accountNumber;

  const accountHolderName = extractAccountHolderName(lines);
  if (accountHolderName) fields.accountHolderName = accountHolderName;

  const accountEmail = extractAccountEmail(lines);
  if (accountEmail) fields.accountEmail = accountEmail;

  const phone = extractPhoneNumber(lines);
  if (phone) fields.phone = phone;

  const subscriptionId = extractSubscriptionId(text);
  if (subscriptionId) fields.subscriptionId = subscriptionId;

  const dataUsageGb = extractDataUsageGb(lines);
  if (dataUsageGb) fields.dataUsageGb = dataUsageGb;

  const starlinkId = extractLabeledValue(lines, STARLINK_ID_LABELS);
  if (starlinkId) fields.starlinkId = starlinkId;

  const serialNumber = extractLabeledValue(lines, SERIAL_NUMBER_LABELS);
  if (serialNumber) fields.serialNumber = serialNumber;

  const kitNumber = extractLabeledValue(lines, KIT_NUMBER_LABELS);
  if (kitNumber) fields.kitNumber = kitNumber;

  return fields;
}

// Re-exported so ACCOUNT_NUMBER_LABELS etc. stay a single source of truth for anything that
// wants to know what this module looks for (e.g. tests), without reaching into ./textFields directly.
export { ACCOUNT_NUMBER_LABELS, DISH_LABELS, WIFI_LABELS };
