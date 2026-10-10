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
  extractPaymentCardLast4,
  extractDishAlerts,
  extractPhoneNumber,
  extractAdminUserKeys,
  extractSubscriptionNames,
  extractPlanBadgeStatus,
  extractPlanName,
  extractRenewalBadgeDate,
  extractServiceCountry,
  isStandbyModePlan,
  hasServiceEndBanner,
  hasStandbyTransitionBanner,
  extractSubscriptionId,
  extractSubscriptionInvoiceDueDay,
  hasBillingSuspensionBanner,
  hasMovingRestrictedBanner,
  hasRegionRestrictedBanner,
  hasPriorityDataExhaustedBanner,
  hasNoSubscriptionsText,
  hasScheduledEndBanner,
  isCompleteDate,
  isPlausibleBillingDate,
  isOnAccountHomePage,
  nextOccurrenceOfDay,
  normalizeDateLike,
  normalizeServiceStatus,
  extractTravelRegistrationDue,
} from "./textFields";
import { readOceanMode } from "./oceanMode";
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
/** The "الأجهزة" / "Devices" section heading, if this page has one. */
function findDevicesHeading(doc: Document): Element | undefined {
  for (const el of Array.from(doc.body.querySelectorAll("*"))) {
    let own = "";
    for (const node of Array.from(el.childNodes)) if (node.nodeType === 3) own += node.textContent ?? "";
    const text = own.trim();
    if (text === "الأجهزة" || text.toLowerCase() === "devices") return el;
  }
  return undefined;
}

export function extractStarlinkFields(doc: Document): SyncedStarlinkFields {
  const fields: SyncedStarlinkFields = {};

  const text = toVisibleText(doc.body);
  const lines = toLines(text);

  // The dish/Wi-Fi dots live only under the subscription page's "الأجهزة" heading. Real,
  // confirmed flip: the Home page (no dots at all) read Wi-Fi green right after the devices page
  // had read it red - so with the heading, only what follows it counts; on the Home page, nothing.
  const devicesHeading = findDevicesHeading(doc);
  if (devicesHeading || !isOnAccountHomePage(lines)) {
    const trace: string[] = [];
    const rowLabels = [...DISH_LABELS, ...WIFI_LABELS];
    const dishStatus = extractDeviceStatus(doc, DISH_LABELS, { after: devicesHeading, trace, rowLabels });
    if (dishStatus) fields.dishStatus = dishStatus;
    const wifiStatus = extractDeviceStatus(doc, WIFI_LABELS, { after: devicesHeading, trace, rowLabels });
    if (wifiStatus) fields.wifiStatus = wifiStatus;
    if (devicesHeading && trace.length > 0) fields.dotTrace = trace.join(" · ").slice(0, 700);
    // The alerts listed with the devices («Learn More» boxes). Set (even empty) only while the
    // devices section is on screen with its dish read - an empty list then clears old alerts.
    if (devicesHeading && dishStatus) fields.dishAlerts = extractDishAlerts(lines);
  }

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
  // The billing-suspension banner says the service is stopped RIGHT NOW - it wins over any
  // "نشط" badge on the same page (real, confirmed case: a limited-access email's pages kept the
  // plan's "نشط" badge while this banner said the service was disabled). Only "canceled" stays.
  if (serviceStatus !== "canceled" && hasBillingSuspensionBanner(lines)) serviceStatus = "suspended";
  if (!serviceStatus && hasScheduledEndBanner(lines)) serviceStatus = "active";
  // "لا توجد اشتراكات": nothing to renew on this email - the device counts as canceled.
  const noSubscription = hasNoSubscriptionsText(lines);
  if (noSubscription) serviceStatus = "canceled";
  if (!serviceStatus && isOnAccountHomePage(lines)) serviceStatus = "active";
  // A device on Starlink's paid Standby Mode plan (sold as SIS) is kept active on purpose - its
  // "وضع الاستعداد" badge is the plan, not a paused service waiting for activation.
  const planName = extractPlanName(lines);
  const onStandbyPlan = isStandbyModePlan(planName);
  if (serviceStatus === "standby" && onStandbyPlan) serviceStatus = "active";
  if (serviceStatus) fields.serviceStatus = serviceStatus;

  // Independent of serviceStatus entirely (see REGION_RESTRICTED_BANNER_LABELS' own doc) - a
  // device can be "active" and region-restricted at the same time. Once confirmed to be looking at
  // the account Home page with no such banner, actively correct a stale "restricted" left over from
  // an earlier sync (the kit may have already been returned to its home country) - the exact same
  // reasoning isOnAccountHomePage already applies to a stale "suspended" serviceStatus above.
  // Only the Home page may clear it: the banner is printed there alone. Real, confirmed bug: a
  // restricted device on the Standby Mode plan (SIS) read "restricted" on Home, then the next page of
  // the same sync (its subscription, "standby" plan, no banner there) cleared it again. A standby /
  // canceled device's restriction is hidden by the app anyway (reminders.ts showsRestriction).
  if (hasRegionRestrictedBanner(lines)) fields.isRestricted = true;
  else if (isOnAccountHomePage(lines)) fields.isRestricted = false;

  // 🛂 «Complete Travel Registration by …»: printed on Home only, so only Home may clear it.
  const travelDue = extractTravelRegistrationDue(lines);
  if (travelDue !== undefined) {
    fields.travelRegistrationRequired = true;
    if (travelDue) fields.travelRegistrationDue = travelDue;
  } else if (isOnAccountHomePage(lines)) fields.travelRegistrationRequired = false;

  // 🚗 Stopped for moving too fast: the banner sits under the subscription's Devices, so only a
  // page showing Devices may clear it (never Home, which never prints it).
  if (hasMovingRestrictedBanner(lines)) fields.movingRestricted = true;
  else if (devicesHeading) fields.movingRestricted = false;

  // "إيميل غير رئيسي" is decided on the Settings → Users table only (the operator's confirmed
  // signal): the web merge sets limitedAccess from whether this account's own login email carries
  // the Admin role there. The old Home-page icon-rail heuristic (no billing icon = limited) was a
  // real, confirmed false positive - a primary/admin email whose billing simply hadn't rendered
  // that moment got flagged - so it no longer drives the flag at all.

  if (planName) fields.planName = planName;

  const renewalDate = extractLabeledValue(lines, RENEWAL_DATE_LABELS) ?? extractRenewalBadgeDate(lines);
  let labeledRenewalDate: string | undefined;
  if (renewalDate) {
    const normalized = normalizeDateLike(renewalDate);
    // A real page can split a date's year/month from its day across separate text nodes, so the
    // label match only ever captures a truncated "٢٠٢٦/٩" - normalizeDateLike can't complete
    // that, so it comes back unchanged instead of a real date. Never store that: a corrupted
    // renewal date is worse than none, since expiryDay's fallback parsing can misread a bare
    // month digit as if it were the day.
    // Starlink's billing day is 1-28 (the operator's rule): a "31" is a misread (real, confirmed: a
    // device showed 2026/10/31) - drop it and fall through to the other signals below.
    if (isCompleteDate(normalized) && isPlausibleBillingDate(normalized)) labeledRenewalDate = normalized;
  }
  // The operator's rule (real, confirmed): the latest «Subscription» invoice at the bottom of
  // Billing carries the TRUE billing day, so it wins over everything else on the page. A stopped
  // account's Billing page still shows a "Payment due" date at the top - the retry of the failed
  // payment (10/1), not the subscription day (24) - which made a device read 2026/11/01.
  const invoiceDueDay = extractSubscriptionInvoiceDueDay(lines);
  let resolvedRenewalDate: string | undefined = invoiceDueDay !== undefined ? nextOccurrenceOfDay(invoiceDueDay) : labeledRenewalDate;
  // The Billing page's "دورة الفوترة" section: only a bare recurring due DAY, with no year in the
  // text to normalize - used when neither an invoice nor a real dated signal is on the page.
  if (!resolvedRenewalDate) {
    const billingDueDay = extractBillingDueDay(lines);
    if (billingDueDay !== undefined) resolvedRenewalDate = nextOccurrenceOfDay(billingDueDay);
  }
  if (resolvedRenewalDate) fields.renewalDate = resolvedRenewalDate;
  // Reuses the very same resolved date (no separate parse) - the "scheduled to end" banner and
  // the "خطة الخدمة" card's "النهاية <date>" badge describe the same one date, just from two
  // different spots on the page. Only ever set alongside the banner itself, never inferred from
  // an ordinary renewal date alone (an account can have a real upcoming renewal with no
  // cancellation pending at all).
  // «scheduled to end» = a real cancellation (ملغي); «will switch/transition to Standby Mode» =
  // the device moves to the Standby plan (SIS) and keeps a service - its own field.
  const bannerDate = labeledRenewalDate ?? resolvedRenewalDate;
  if (bannerDate && hasServiceEndBanner(lines)) fields.pendingCancellationDate = bannerDate;
  else if (bannerDate && hasStandbyTransitionBanner(lines)) fields.pendingStandbyDate = bannerDate;

  const balance = extractBalance(lines);
  if (balance) {
    fields.balanceDue = balance.amount;
    fields.currency = balance.currency;
  }

  const paymentCardLast4 = extractPaymentCardLast4(lines);
  if (paymentCardLast4) fields.paymentCardLast4 = paymentCardLast4;

  const accountNumber = extractAccountNumber(lines, text);
  if (accountNumber) fields.accountNumber = accountNumber;

  const accountHolderName = extractAccountHolderName(lines);
  if (accountHolderName) fields.accountHolderName = accountHolderName;

  const accountEmail = extractAccountEmail(lines);
  if (accountEmail) fields.accountEmail = accountEmail;

  const phone = extractPhoneNumber(lines);
  if (phone) fields.phone = phone;

  // Settings → Users: the login email is "primary" when it's an account Admin there (the operator's
  // confirmed signal). Emitted as the admin emails' keys; the web side matches them to this
  // account's own login email.
  const adminEmails = extractAdminUserKeys(lines);
  if (adminEmails.length > 0) fields.adminEmails = adminEmails;

  // Subscriptions list page: every subscription's name on this one account (a device can have
  // more than one, each its own KIT/number).
  const subscriptionNames = extractSubscriptionNames(lines);
  if (subscriptionNames.length > 0) fields.subscriptionNames = subscriptionNames;

  const subscriptionId = extractSubscriptionId(text);
  if (subscriptionId) fields.subscriptionId = subscriptionId;

  // Explicit true/false: a page listing a subscription (its SL- number or plan) clears it.
  if (noSubscription) fields.noSubscription = true;
  else if (subscriptionId || planName) fields.noSubscription = false;

  const dataUsageGb = extractDataUsageGb(lines);
  if (dataUsageGb) fields.dataUsageGb = dataUsageGb;

  // Explicit true/false: the banner sits on the same page as the usage figure, so a page showing
  // the usage without it means the priority data is back (a new cycle) and clears the alert.
  if (hasPriorityDataExhaustedBanner(lines)) fields.priorityDataExhausted = true;
  else if (dataUsageGb) fields.priorityDataExhausted = false;

  const starlinkId = extractLabeledValue(lines, STARLINK_ID_LABELS);
  if (starlinkId) fields.starlinkId = starlinkId;

  const serialNumber = extractLabeledValue(lines, SERIAL_NUMBER_LABELS);
  if (serialNumber) fields.serialNumber = serialNumber;

  const kitNumber = extractLabeledValue(lines, KIT_NUMBER_LABELS);
  if (kitNumber) fields.kitNumber = kitNumber;

  // Explicit true/false whenever the switch is on the page - false clears an earlier alarm.
  const oceanMode = readOceanMode(doc);
  if (oceanMode !== undefined) fields.oceanMode = oceanMode;

  const serviceCountry = extractServiceCountry(lines);
  if (serviceCountry) fields.serviceCountry = serviceCountry;

  return fields;
}

// Re-exported so ACCOUNT_NUMBER_LABELS etc. stay a single source of truth for anything that
// wants to know what this module looks for (e.g. tests), without reaching into ./textFields directly.
export { ACCOUNT_NUMBER_LABELS, DISH_LABELS, WIFI_LABELS };
