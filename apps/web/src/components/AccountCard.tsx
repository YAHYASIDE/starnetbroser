"use client";

import { askDeleteCode } from "@/components/DeleteCodePrompt";
import type React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { showsRestriction } from "@/lib/reminders";
import { PromiseQuickSheet } from "./PromiseQuickSheet";
import { useEffect, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";
import { priorityDataLine, priorityDataState } from "@/lib/priorityData";
import { presentServiceStatus, effectiveServiceStatus, isBalanceDueZero, planBadgeLabel, cleanPlanName } from "@/lib/status";
import { serviceBubbles } from "@/lib/serviceBubbles";
import { localToday } from "@/lib/syncQueue";
import { ServiceBubbles } from "./ServiceBubbles";
import { countryFlag, countryFromIso2 } from "@/lib/countryCurrencies";
import { connectionDot, connectionMessage } from "@/lib/deviceConnection";
import { daysRemainingLabel, daysRemainingNumber, formatRelativeTime, renewalDateLabel } from "@/lib/date";
import { emailsMismatch } from "@/lib/emailMatch";
import { computeBalanceByCurrency, LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, LedgerEntry } from "@/lib/ledgerStore";
import { starlinkCostUsd, summarizeDeviceProfit } from "@/lib/accountingStore";
import { faultCategory, faultLabel, isAutoFault, isWaivedCost, openDebtEntries, removeFaultQuestion } from "@/lib/deviceFault";
import { openDebtUsdToday, paidSinceLastSyncUsd, totalPreviousDebtUsd, unrecordedGapUsd, type PreviousDebt } from "@/lib/previousDebt";
import { computeDeviceMarks } from "@/lib/deviceMarks";
import { CurrencyStore, getCurrency, toUsd } from "@/lib/currencyStore";
import { formatAmount } from "@/lib/formatAmount";
import { PaymentAllocation } from "@/lib/paymentAllocationStore";
import { Client } from "@/lib/clientStore";
import { isGmail } from "@/lib/mailboxes";
import { markDeviceTouched } from "@/lib/recentDevices";
import { isRunningInAndroidApp, mailExtrasFor, mailLoginFor, openAccountCreation, openCancelSubscription, openIsolatedAccountBrowser, isBackgroundSyncEnabled, openAutoSync, openIsolatedMailbox, startBackgroundSync, starlinkLoginFor } from "@/lib/localBrowser";
import { cancelConfirmQuestion, cancellationState, cancelledMessage } from "@/lib/subscriptionCancel";
import {
  buildAccountStatementMessage,
  buildBalanceReminderMessage,
  buildDeviceInfoMessage,
  buildExpiryReminderMessage,
  buildWhatsAppLink,
} from "@/lib/whatsapp";
import { DeviceFaultDialog } from "./DeviceFaultDialog";
import { DeviceGmailButton } from "./DeviceGmailButton";
import { useCardGestures } from "./useCardGestures";
import { DeviceNoteSheet, type DeviceNoteSheetMode } from "./DeviceNoteSheet";
import { pinAgeText, type DeviceNote } from "@/lib/deviceNotes";
import { isTravelPending, isTravelVerified, needsTravelRegistration, setTravelPrice, travelDueArabic, travelWhatsAppLink, undoTravelDone } from "@/lib/travelRegistration";
import { TravelPriceSheet } from "./TravelPriceSheet";
import { describeDishAlerts } from "@/lib/dishAlerts";
import { CopySessionSheet } from "./CopySessionSheet";
import { PasteSessionSheet } from "./PasteSessionSheet";
import { RenewalLockSheet } from "./RenewalLockSheet";
import { RenewalConfirmDialog } from "./RenewalConfirmDialog";
import { PreviousDebtDialog } from "./PreviousDebtDialog";
import { settledButStillDue } from "@/lib/settledStillDue";

/** Which list this card is currently shown in - changes which of the four circular actions apply.
 * "active" (the default, normal dashboard list) offers متعطل/أرشفة/تجديد/حذف; "archived" and
 * "trash" each offer only "استعادة" plus, for trash, a permanent-delete action - restoring one of
 * those views' own cards is never mixed with the normal four actions, to avoid archiving/deleting
 * a card that's already archived/deleted. */
export type AccountCardContext = "active" | "archived" | "trash";

interface Props {
  account: StarlinkAccountSummary;
  /** 📌 His private pin / purple note on this device (lib/deviceNotes.ts). With `onSaveNote` a
   * long-press opens «تثبيت · ملاحظة · التفاصيل»; without it a long-press opens the details. */
  deviceNote?: DeviceNote;
  onSaveNote?: (account: StarlinkAccountSummary, input: { text: string; pin: boolean; until?: string }) => void;
  onSetPinned?: (account: StarlinkAccountSummary, pinned: boolean) => void;
  /** Earlier owners' unpaid Starlink debts on this device (previousDebt.ts). */
  previousDebts?: PreviousDebt[];
  /** Records a previous debt - returns an error message, or null once saved. */
  onAddPreviousDebt?: (account: StarlinkAccountSummary, input: { date: string; amountUsd: number; note: string }) => string | null;
  /** ↩️ Puts D's marked paid (while Starlink still asks for them) back to D (lib/settledStillDue.ts). */
  onRestoreD?: (account: StarlinkAccountSummary, entryIds: string[]) => void;
  /** ✓ «دفعته»: the D really was paid - Starlink's bill is a new month (settledStillDue.confirmPaidD). */
  onConfirmPaidD?: (account: StarlinkAccountSummary, entryIds: string[]) => void;
  /** «✕» on «📱 أضافه …»: drop the mark (the device keeps its rep). */
  onClearRepAdded?: (account: StarlinkAccountSummary) => void;
  /** The last "فحص جلسات الدخول" found this device signed out - shows a small "sign in" bubble
   * over the card's top edge that opens its browser. */
  sessionNeedsLogin?: boolean;
  onEdit: (account: StarlinkAccountSummary) => void;
  /** This account's local customer-ledger entries - see ledgerStore.ts. Never the same thing as
   * account.balanceDue (Starlink's own synced subscription balance). */
  ledgerEntries: LedgerEntry[];
  /** This account's payment-allocation records - see paymentAllocationStore.ts. Only used to mark
   * each shipment's own payment status (unpaid/partial/paid) in the WhatsApp statement message;
   * never anything Starlink-cost or profit related, which stays strictly internal. */
  allocations: PaymentAllocation[];
  onLedger: (account: StarlinkAccountSummary) => void;
  /** 💳 «D» tapped: pay this device's unpaid Starlink cost (his Oct 12 2026 ask). */
  onSettleD?: (account: StarlinkAccountSummary) => void;
  onDeviceStatement: (account: StarlinkAccountSummary) => void;
  /** The Client this device is linked to (via account.clientId) - undefined for a card never
   * linked to a customer yet ("الزبون غير محدد"). Resolved by the caller from clientStore, never
   * looked up here, so every card in a render pass sees the exact same store snapshot. */
  client?: Client;
  onOpenClient: (client: Client) => void;
  /** His rep's color (repStore REP_COLORS): the card gets a light tint of it. */
  repColor?: string;
  /** 🔒 The device's rep keeps his customers to himself (repSeparation.ts): his name instead of a customer. */
  heldByRepName?: string;
  /** 📱 The rep who added this device from his app (approved) - a lasting badge. */
  addedByRepName?: string;
  /** 👤 The rep's own customer on this device, as his «تسجيلاتي» said - for information only
   * (his Oct 13 2026 choice): not one of the operator's customers, no debt. */
  repClientName?: string;
  /** 🔗 The same device registered again (same email or KIT) - merge this one into it. */
  twin?: StarlinkAccountSummary;
  onMergeInto?: (drop: StarlinkAccountSummary, keep: StarlinkAccountSummary) => void;
  /** 🔗 «✕» on «⚠️ مكرّر»: they are two different devices - the mark goes from both. */
  onNotDuplicate?: (account: StarlinkAccountSummary, twin: StarlinkAccountSummary) => void;
  /** 🛂 «✅ تم التوثيق» (tells its rep). */
  onTravelDone?: (account: StarlinkAccountSummary) => void;
  /** 🛂 «🔄 تحقق الآن»: reads this device's Home only. */
  onTravelCheck?: (account: StarlinkAccountSummary) => void;
  /** ✅ In «تم توثيقها»: the registration line with its price. */
  showTravelVerified?: boolean;
  /** The general currency registry (see currencyStore.ts) - used only to show a small "≈ X USD"
   * line under a non-USD Starlink balance, when that currency's rate happens to be registered
   * (e.g. via the /currencies page). Never guessed, and never shown at all when no rate is known -
   * account.balanceDue/account.currency themselves stay exactly as synced either way. */
  currencyStore: CurrencyStore;
  context?: AccountCardContext;
  /** Applies a new/updated fault record (or clears it, via a separate call with `null`). */
  /** `waiveDebts`: drop the device's open D (deviceFault.ts) - only ever true when marking a fault. */
  onSetDeviceFault: (account: StarlinkAccountSummary, fault: StarlinkAccountSummary["deviceFault"], waiveDebts: boolean) => void;
  /** 🛠️ قيد الإصلاح on / off. */
  /** Every device - for the passwords «📧 البريد» offers (usedPasswords.ts). */
  allAccounts?: StarlinkAccountSummary[];
  /** 🆕 «✅ انتهى» on a device being created («إنشاء حساب جديد»). */
  onFinishCreation?: (account: StarlinkAccountSummary) => void;
  onSetRepair: (account: StarlinkAccountSummary, repair: StarlinkAccountSummary["underRepair"]) => void;
  /** 📌 Small changes to the device itself (the locked renewal day, RenewalLockSheet). */
  onPatch?: (account: StarlinkAccountSummary, patch: Partial<StarlinkAccountSummary>) => void;
  /** 💰 «سعر التوثيق» saved / removed - also the owner's debt (falls back to a plain patch). */
  onTravelPrice?: (account: StarlinkAccountSummary, amount: number | null, currency: string, currencyConfirmed: boolean) => void;
  /** ⚠️ Starlink bills this device to a card that isn't one of his registered cards. */
  unregisteredCard?: boolean;
  /** This device's mailbox (📧 البريد) is signed in on this phone - the button turns mint green. */
  mailSignedIn?: boolean;
  /** Moves the device to the archive ("active" context only). */
  onArchive: (account: StarlinkAccountSummary) => void;
  /** Moves the device to the recoverable trash ("active" context only). */
  /** Omitted on a rep's phone (his Oct 2026 rule: the rep can archive his devices, never delete them). */
  onSoftDelete?: (account: StarlinkAccountSummary) => void;
  /** Restores from whichever of archive/trash this card is currently shown in. */
  onRestore: (account: StarlinkAccountSummary) => void;
  /** Trash context only - the original permanent delete (with the Starlink-session prompt). */
  onPermanentDelete?: (account: StarlinkAccountSummary) => void;
  /** 📱 Rep's app: something on this device was recorded by the rep and awaits the operator. */
  repPending?: boolean;
  /** Applies the confirmed new renewal date, then opens the ledger dialog for this account so the
   * operator can record the actual shipment/payment. */
  /** `payOpenD`: he chose «دفعت D لستارلينك» on a device with open D's - they're settled (from the
   * card when `settleFromCard`), no new shipment. Otherwise `settleFromCard` is for the new month's cost. */
  onConfirmRenewal: (
    account: StarlinkAccountSummary,
    newRechargeDate: string,
    autoShipment: boolean,
    costPending: boolean,
    settleFromCard: boolean | null,
    payOpenD: boolean,
  ) => void;
}

function IconDish() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 14a9 9 0 0 1 13-8" />
      <path d="M3 17l7-7 8 8-3 3a11 11 0 0 1-12-4Z" />
      <path d="M18 6l3-3M15 15v6M13 19h4" />
    </svg>
  );
}

function IconWifi() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 8.5a16 16 0 0 1 20 0" />
      <path d="M5.5 12.5a11 11 0 0 1 13 0" />
      <path d="M9 16.3a6 6 0 0 1 6 0" />
      <circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

/* 🎨 The card's buttons: one icon set, one size (his Oct 18 2026 ask «متناسقة وملوّنة وحجمها واحد»). */
function ActionIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg className="card-act-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
function IconOpen() {
  return <ActionIcon><path d="M7 17 17 7" /><path d="M9 7h8v8" /></ActionIcon>;
}
function IconCash() {
  return <ActionIcon><rect x="3" y="6" width="18" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6.5 9.5v5M17.5 9.5v5" /></ActionIcon>;
}
function IconSync() {
  return <ActionIcon><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20v-4h-4" /></ActionIcon>;
}
function IconMore() {
  return <ActionIcon><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></ActionIcon>;
}

function IconEnvelope() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
    </svg>
  );
}

function IconUndo() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 11A8 8 0 1 1 6.3 17.7" />
      <path d="M4 5v6h6" />
    </svg>
  );
}

export function AccountCard({
  account, onEdit, ledgerEntries, allocations, onLedger, onSettleD, onDeviceStatement, client, onOpenClient, currencyStore,
  context = "active", onSetDeviceFault, onSetRepair, onPatch, onTravelPrice, unregisteredCard = false, onFinishCreation, allAccounts = [], mailSignedIn = false, onArchive, onSoftDelete, onRestore, onPermanentDelete, onConfirmRenewal,
  sessionNeedsLogin = false,
  repPending = false,
  previousDebts = [],
  onAddPreviousDebt,
  onRestoreD,
  onConfirmPaidD,
  onClearRepAdded,
  repColor,
  heldByRepName,
  addedByRepName,
  repClientName,
  twin,
  onMergeInto,
  onNotDuplicate,
  onTravelDone,
  onTravelCheck,
  showTravelVerified = false,
  deviceNote,
  onSaveNote,
  onSetPinned,
}: Props) {
  const router = useRouter();
  const [travelPriceOpen, setTravelPriceOpen] = useState(false);
  const travelPending = isTravelPending(account);
  const ledgerBalances = computeBalanceByCurrency(ledgerEntries);
  // 🫧 [الآن] ← [بعد الشهر] replaces «✅ نشط» (his Oct 17 2026 choice); «موقوف» / «بانتظار التفعيل» stay.
  const bubbles = serviceBubbles(account, localToday());
  const rawStatus = presentServiceStatus(effectiveServiceStatus(account));
  const serviceStatus = bubbles && (rawStatus?.label === "نشط" || effectiveServiceStatus(account) === "canceled") ? null : rawStatus;
  const cancellation = cancellationState(account);
  const deviceCountry = countryFromIso2(account.serviceCountry);
  const dishDot = connectionDot(account.dishStatus);
  const wifiDot = connectionDot(account.wifiStatus);
  const planName = cleanPlanName(account.planName);
  const planBadge = planName && !account.noSubscription && !bubbles ? (planBadgeLabel(planName) ?? planName) : undefined;
  const priorityState = priorityDataState(account);
  const fault = faultCategory(account);
  const lastSynced = formatRelativeTime(account.lastSuccessfulScanAt);
  // Single shared source for both the badge label and its urgency color - never computed twice
  // from two different date fields, which is exactly what produced a real, confirmed bug: two
  // contradictory messages ("5 days left" and "expired") for the same account.
  const remaining = daysRemainingLabel(account.rechargeDate || account.standbyDate);
  const remainingDays = daysRemainingNumber(account.rechargeDate || account.standbyDate);
  const balanceIsZero = isBalanceDueZero(account.balanceDue);
  // "$"/"US$"/"$US"/"USD" are all already USD itself - never worth converting to itself. Every
  // other currency only gets a "≈ X USD" line when its rate actually happens to be registered
  // (via the /currencies page). Never a guess, and silently absent otherwise.
  const isUsdBalance = ["$", "US$", "$US", "USD"].includes(account.currency.toUpperCase());
  const balanceRate = !isUsdBalance ? getCurrency(currencyStore, account.currency)?.rateFromUsd : undefined;
  const balanceNumeric = Number(account.balanceDue);
  const balanceUsdEquivalent =
    balanceRate !== undefined && Number.isFinite(balanceNumeric) ? toUsd(balanceNumeric, balanceRate) : undefined;
  const emailMismatch = emailsMismatch(account.expectedEmail, account.starlinkAccountEmail);
  // A suspended service is almost always a real, urgent problem (usually an unpaid Starlink
  // invoice) - the whole card turns red rather than just the small status badge, so it's
  // impossible to miss while scanning a list of cards.
  const isSuspended = account.serviceStatus === "suspended";
  // The renewal date is the stop instant, so 0 (stops today) is already expired, 1 is "ends
  // tonight" (still a red-hot warning), and the safe zone starts further out.
  const urgencyClass = remainingDays === null
    ? "date-neutral"
    : remainingDays <= 0
      ? "date-expired"
      : remainingDays <= 3
        ? "date-warning"
        : "date-safe";

  const marks = computeDeviceMarks(ledgerEntries, allocations);
  const profit = summarizeDeviceProfit(ledgerEntries);
  // An expected (still-D) profit has no locked MRU rate yet - today's registered rate, marked ≈.
  const currentMruRate = getCurrency(currencyStore, "MRU")?.rateFromUsd;
  const openDebtUsd = openDebtEntries(ledgerEntries).reduce((sum, e) => sum + (starlinkCostUsd(e) ?? 0), 0);
  const previousDebtUsd = totalPreviousDebtUsd(previousDebts);
  const unpaidStarlinkUsd = openDebtUsd + previousDebtUsd;
  // 💲 Starlink's bill and what's unpaid to Starlink are the same amount: one line (his Oct 17 2026 choice).
  const balanceUsd = isUsdBalance ? (Number.isFinite(balanceNumeric) ? balanceNumeric : undefined) : balanceUsdEquivalent;
  const unpaidIsBalance = unpaidStarlinkUsd > 0 && balanceUsd !== undefined && Math.abs(balanceUsd - unpaidStarlinkUsd) < 0.01;
  // What Starlink shows as due beyond everything recorded - offered as a previous debt. A D in
  // the bill's own currency is compared at today's rate (only the rate moved), and a small drift
  // over an open D is part of that D (previousDebt.ts unrecordedGapUsd).
  const openDebtTodayUsd = openDebtUsdToday(
    openDebtEntries(ledgerEntries).map((e) => ({ currencyCode: e.starlinkCost?.currencyCode, amount: e.starlinkCost?.amount, lockedUsd: starlinkCostUsd(e) ?? 0 })),
    account.currency,
    balanceRate,
  );
  const unrecordedUsd = balanceIsZero
    ? 0
    : unrecordedGapUsd(
        isUsdBalance ? balanceNumeric : balanceUsdEquivalent,
        openDebtTodayUsd + previousDebtUsd + paidSinceLastSyncUsd(ledgerEntries, account.lastSuccessfulScanAt),
        openDebtTodayUsd,
      );
  // ↩️ D's marked paid while a later Starlink read still asks for them.
  const dueUsdNow = balanceIsZero ? undefined : isUsdBalance ? balanceNumeric : balanceUsdEquivalent;
  const stillDueDs =
    onRestoreD && dueUsdNow !== undefined && Number.isFinite(dueUsdNow)
      ? settledButStillDue(ledgerEntries, {
          gapUsd: dueUsdNow - (openDebtTodayUsd + previousDebtUsd),
          billCurrency: account.currency,
          billRateFromUsd: balanceRate,
          lastScanAt: account.lastSuccessfulScanAt,
        })
      : [];
  const [previousDebtDialog, setPreviousDebtDialog] = useState<{ suggestedUsd?: number } | null>(null);
  const [renewalSheet, setRenewalSheet] = useState(false);
  // «الدين» on the unrecorded-difference line: choose an old (inherited) debt or a normal D charge.
  const [debtChoiceUsd, setDebtChoiceUsd] = useState<number | null>(null);
  const expectedMru = currentMruRate !== undefined ? profit.expectedUsd * currentMruRate : undefined;

  // Defaults to "not the Android app" (matches server render, which never
  // has a native bridge) and only reflects reality after mount, to avoid a
  // hydration mismatch between server and client render.
  const [isAndroidApp, setIsAndroidApp] = useState(false);
  useEffect(() => setIsAndroidApp(isRunningInAndroidApp()), []);
  const [opening, setOpening] = useState(false);

  async function handleOpen() {
    if (opening) return;
    setOpening(true);
    markDeviceTouched(account.id); // 🕘 «آخر جهاز»
    try {
      const result = await openIsolatedAccountBrowser(account.id, account.name || "حساب Starlink", {
        ...starlinkLoginFor(account),
        ...mailExtrasFor(account, allAccounts),
      });
      if (!result.ok) {
        window.alert(result.message);
      }
    } finally {
      setOpening(false);
    }
  }

  /** 🛑 «إلغاء الاشتراك»: green = ask, then the device's browser cancels by itself; red = already
   * cancelled, a message only. */
  async function handleCancelSubscription() {
    const state = cancellationState(account);
    if (state.cancelled) {
      window.alert(cancelledMessage(state));
      return;
    }
    if (opening || !window.confirm(cancelConfirmQuestion(account))) return;
    setOpening(true);
    try {
      const result = await openCancelSubscription(account, allAccounts);
      if (!result.ok) window.alert(result.message);
    } finally {
      setOpening(false);
    }
  }

  /** 🆕 Continues «إنشاء حساب جديد» from one of its two pages. */
  async function handleCreationStep(step: "mail" | "starlink") {
    if (opening) return;
    setOpening(true);
    try {
      const result = await openAccountCreation(account, step);
      if (!result.ok) window.alert(result.message);
    } finally {
      setOpening(false);
    }
  }

  /** 📧 البريد: this device's Outlook mailbox, inside the app (its own isolated window). */
  async function handleOpenMail() {
    if (opening) return;
    setOpening(true);
    try {
      const result = await openIsolatedMailbox(account.id, account.name || "البريد", mailLoginFor(account, allAccounts));
      if (!result.ok) window.alert(result.message);
    } finally {
      setOpening(false);
    }
  }

  // 🔄 The device's own browser opens and runs «مزامنة» by itself, then closes back here (the
  // operator's choice: the hidden background read did nothing for him). The result arrives through
  // the normal accountDataSynced/listPendingAccountSyncs pipeline (see HomeView).
  const [syncingCard, setSyncingCard] = useState(false);

  async function handleCardSync() {
    if (syncingCard) return;
    setSyncingCard(true);
    try {
      // 🌙 In the background when the operator chose it (settings) - a notification shows it; else
      // (or without the permission) the device's browser opens and syncs by itself.
      if (isBackgroundSyncEnabled() && (await startBackgroundSync([{ id: account.id, name: account.name }], account.name || ""))) return;
      markDeviceTouched(account.id); // 🕘 synced by hand
      const result = await openAutoSync(account);
      if (!result.ok) {
        window.alert(result.message);
      }
    } finally {
      setSyncingCard(false);
    }
  }

  /** 🔄 The card's «تحديث» (his Oct 18 2026 choice, after the background read fell short): the
   * normal sync - the device's browser opens, syncs by itself and closes back here. */
  async function handleQuickSync() {
    if (syncingCard) return;
    setSyncingCard(true);
    try {
      markDeviceTouched(account.id);
      const result = await openAutoSync(account);
      if (!result.ok) window.alert(result.message);
    } finally {
      setSyncingCard(false);
    }
  }

  // Only offered when a usable phone number was actually entered for this account - never a
  // link to a broken wa.me URL.
  const whatsappAvailable = buildWhatsAppLink(account.phone) !== null;
  const [showWhatsAppMenu, setShowWhatsAppMenu] = useState(false);

  function openWhatsApp(message?: string) {
    const link = buildWhatsAppLink(account.phone, message);
    if (!link) return;
    window.open(link, "_blank", "noopener,noreferrer");
    setShowWhatsAppMenu(false);
  }

  // Everything not shown on the compact card sits one tap away behind "التفاصيل" at the bottom -
  // never a second toggle elsewhere on the same card.
  const [expanded, setExpanded] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showDishAlerts, setShowDishAlerts] = useState(false);
  const [showPasteSession, setShowPasteSession] = useState(false);
  const [showCopySession, setShowCopySession] = useState(false);
  const dishAlerts = describeDishAlerts(account.dishAlerts);
  // No "التفاصيل" button: one tap (or holding) opens the details, two taps a payment, 3 edit.
  const [noteSheet, setNoteSheet] = useState<DeviceNoteSheetMode | null>(null);
  const gestures = useCardGestures((gesture) => {
    if (gesture === "menu") {
      if (onSaveNote && onSetPinned) setNoteSheet("menu");
      else setExpanded((v) => !v);
    } else if (gesture === "details") setExpanded((v) => !v);
    else if (gesture === "payment") onLedger(account);
    else if (context === "active") onEdit(account);
  });
  const [showFaultDialog, setShowFaultDialog] = useState(false);
  const [showRenewalDialog, setShowRenewalDialog] = useState(false);
  const [showPromise, setShowPromise] = useState(false);
  const identityEmail = account.expectedEmail || account.starlinkAccountEmail;
  const [emailCopied, setEmailCopied] = useState(false);
  // ✉️ The device is named by its email: shown once (his Oct 17 2026 choice) - the name copies it.
  const nameIsEmail = Boolean(identityEmail && account.name.trim().toLowerCase() === identityEmail.trim().toLowerCase());

  async function copyToClipboard(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API can be unavailable (non-secure context, permission denied) - a purely
      // convenience action, so it silently no-ops rather than alerting the operator.
    }
  }

  function handleArchiveClick() {
    if (!window.confirm(`أرشفة الجهاز "${account.name}"؟ يمكنك استعادته لاحقًا من الأرشيف.`)) return;
    onArchive(account);
  }

  async function handleSoftDeleteClick() {
    if (!(await askDeleteCode(`نقل الجهاز "${account.name}" إلى سلة المحذوفات؟ يمكنك استعادته لاحقًا.`))) return;
    onSoftDelete?.(account);
  }

  async function handlePermanentDeleteClick() {
    if (!onPermanentDelete) return;
    if (!(await askDeleteCode(`حذف الجهاز "${account.name}" نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.`))) return;
    onPermanentDelete(account);
  }

  const whatsAppButton = whatsappAvailable && (
    <div className="whatsapp-menu-wrapper">
      <button
        type="button"
        className="whatsapp-btn"
        title="تواصل عبر واتساب"
        aria-label="تواصل عبر واتساب"
        onClick={() => setShowWhatsAppMenu((v) => !v)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="currentColor">
          <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm0 18.2a8.1 8.1 0 0 1-4.1-1.1l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-2-1.2 7.4 7.4 0 0 1-1.4-1.7c-.1-.2 0-.4.1-.5l.4-.4.2-.4c.1-.1 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.1c0 1.2.9 2.4 1 2.6.1.2 1.8 2.8 4.5 3.8.6.3 1.1.4 1.5.6.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.4-.3Z" />
        </svg>
      </button>
      {showWhatsAppMenu && (
        <>
          <div className="whatsapp-menu-backdrop" onClick={() => setShowWhatsAppMenu(false)} />
          <div className="whatsapp-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => openWhatsApp(buildExpiryReminderMessage(account.name))}>
              تذكير بانتهاء الشحن الليلة
            </button>
            <button type="button" role="menuitem" onClick={() => openWhatsApp()}>
              تواصل فقط
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => openWhatsApp(buildBalanceReminderMessage(account.name, ledgerEntries))}
            >
              تذكير بالرصيد المستحق
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => openWhatsApp(buildAccountStatementMessage(account.name, ledgerEntries, allocations))}
            >
              كشف الحساب بالتفاصيل
            </button>
            <button type="button" role="menuitem" onClick={() => openWhatsApp(connectionMessage(client?.name, account))}>
              📡 حالة الجهاز الآن (متصل؟)
            </button>
            <button type="button" role="menuitem" onClick={() => openWhatsApp(buildDeviceInfoMessage(account))}>
              معلومات الجهاز الكاملة
            </button>
          </div>
        </>
      )}
    </div>
  );

  const notePinned = Boolean(deviceNote?.pinnedAt);
  return (
    <>
    <article
      className={`account-card${bubbles ? ` account-card-svc-${bubbles.billing ? "billing" : bubbles.now.toLowerCase()}` : ""}${isSuspended ? " account-card-suspended" : ""}${sessionNeedsLogin ? " account-card-has-bubble" : ""}${repColor ? " account-card-rep-tint" : ""}${expanded ? " account-card-expanded" : ""}`}
      style={repColor ? ({ "--rep-tint": repColor } as React.CSSProperties) : undefined}
      {...gestures}
    >
      {(deviceNote?.text || notePinned) && (
        <button
          type="button"
          className="device-note-line"
          onClick={() => (onSaveNote ? setNoteSheet(deviceNote?.text ? "note" : "menu") : undefined)}
          title={deviceNote?.text}
        >
          {notePinned && (
            <span className="device-note-pin">
              📌 {pinAgeText(deviceNote!.pinnedAt!)}
              {deviceNote?.pinUntil && <> · ⏰ <bdi dir="ltr">{deviceNote.pinUntil}</bdi></>}
            </span>
          )}
          {deviceNote?.text && (
            <span className="device-note-text-line" dir="auto">
              📝 {deviceNote.text}
            </span>
          )}
        </button>
      )}
      {sessionNeedsLogin && (
        <button type="button" className="session-bubble" onClick={handleOpen} disabled={opening} title="الجلسة خرجت - افتح وسجّل الدخول">
          <span aria-hidden="true">🔒</span> سجّل الدخول
        </button>
      )}
      {isSuspended && (
        <div className="account-card-suspended-banner">
          ⚠️ الخدمة موقوفة — تحقق من فواتير Starlink غير المسددة
        </div>
      )}

      {account.underRepair && (
        <div className="account-card-repair-banner">
          🛠️ قيد الإصلاح مع الدعم الفني{account.underRepair.note && ` — ${account.underRepair.note}`}
        </div>
      )}
      {fault && (
        <div className="account-card-fault-banner" data-tour="fault-remove">
          {context === "active" && (
            <button
              type="button"
              className="fault-remove-button"
              onClick={() => window.confirm(removeFaultQuestion(ledgerEntries.filter(isWaivedCost).length)) && onSetDeviceFault(account, null, false)}
            >
              ✓ إزالة العطل
            </button>
          )}
          {faultLabel(fault)}
          {isAutoFault(account)
            ? fault === "secondary"
              ? " — الإيميل لا يعرض الاشتراكات والإعدادات والفوترة (اكتُشف تلقائياً)"
              : account.noSubscription
                ? " — لا يوجد اشتراك على هذا الإيميل (اكتُشف تلقائياً)"
                : " — الاشتراك ملغى في Starlink (اكتُشف تلقائياً)"
            : account.deviceFault?.note && ` — ${account.deviceFault.note}`}
        </div>
      )}

      {account.oceanMode && (
        <div className="account-card-ocean-banner">🚨 وضع المحيط مفعّل - فاتورة بحرية قد تصل لآلاف الدولارات. أوقفه فوراً!</div>
      )}
      {priorityState?.kind === "exhausted" && account.serviceStatus !== "canceled" && (
        <div className="account-card-priority-banner">
          ⚠️ نفدت باقة الأولوية{priorityState.limitGb !== undefined && <> <bdi dir="ltr">{priorityState.limitGb}G</bdi></>}
          {priorityState.usedGb !== undefined && <> (الاستهلاك <bdi dir="ltr">{priorityState.usedGb} GB</bdi>)</>} - يعمل بسرعة محدودة حتى الدورة القادمة
        </div>
      )}
      {account.creation && context === "active" && (
        <div className="account-card-creation-banner">
          <span>🆕 قيد الإنشاء - أكمل الخطوات ثم اضغط «انتهى»</span>
          <button type="button" onClick={() => void handleCreationStep("mail")} disabled={opening}>📧 ١. البريد</button>
          <button type="button" onClick={() => void handleCreationStep("starlink")} disabled={opening}>🛰️ ٢. التفعيل</button>
          {onFinishCreation && <button type="button" onClick={() => onFinishCreation(account)}>✅ انتهى</button>}
        </div>
      )}
      {account.movingRestricted && account.serviceStatus !== "canceled" && (
        <div className="account-card-moving-banner">🚗 متوقف بسبب الحركة - يعمل عند توقف الجهاز (باقة المنازل)</div>
      )}
      {needsTravelRegistration(account) && account.serviceStatus !== "canceled" && (
        <div className={`account-card-travel-banner${travelPending ? " account-card-travel-pending" : ""}`} data-tour="travel-badge">
          <span>
            {travelPending
              ? "⏳ وُثّق - بانتظار أن يؤكّد التحديث اختفاء رسالة ستارلينك"
              : `🛂 يجب توثيق السفر قبل ${travelDueArabic(account.travelRegistrationDue)} - وإلا تتوقف الخدمة خارج البلد`}
          </span>
          {context === "active" && (
            <span className="account-card-travel-actions">
              {!travelPending && (
                <a href={travelWhatsAppLink(account, client?.phone ?? account.phone)} target="_blank" rel="noopener noreferrer">
                  💬 واتساب
                </a>
              )}
              {!travelPending && onTravelDone && (
                <button type="button" onClick={() => onTravelDone(account)}>
                  ✅ تم التوثيق
                </button>
              )}
              {travelPending && onTravelCheck && (
                <button type="button" onClick={() => onTravelCheck(account)}>
                  🔄 تحقق الآن
                </button>
              )}
              {travelPending && onPatch && (
                <button type="button" onClick={() => onPatch(account, undoTravelDone())}>
                  ↩️ لم يتم
                </button>
              )}
            </span>
          )}
        </div>
      )}
      {showTravelVerified && isTravelVerified(account) && (
        <div className="account-card-travel-banner account-card-travel-verified">
          <span>
            ✅ وُثّق السفر{account.travelRegistrationVerifiedDue ? ` (موعد ${travelDueArabic(account.travelRegistrationVerifiedDue)})` : ""}
            {" · "}
            {account.travelRegistrationPrice ? (
              <bdi dir="ltr">
                {formatAmount(account.travelRegistrationPrice.amount)} {account.travelRegistrationPrice.currency}
              </bdi>
            ) : (
              "بلا سعر"
            )}
          </span>
          {onPatch && (
            <span className="account-card-travel-actions">
              <button type="button" onClick={() => setTravelPriceOpen(true)}>
                💰 {account.travelRegistrationPrice ? "تعديل السعر" : "السعر"}
              </button>
            </span>
          )}
        </div>
      )}
      {travelPriceOpen && onPatch && (
        <TravelPriceSheet
          account={account}
          onSave={(amount, currency, confirmed) =>
            onTravelPrice ? onTravelPrice(account, amount, currency, confirmed) : onPatch(account, setTravelPrice(amount, currency))
          }
          onClose={() => setTravelPriceOpen(false)}
        />
      )}
      {showsRestriction(account) && (
        <div className="account-card-restricted-banner">
          🚫 الجهاز مقيّد — أعده إلى البلد المسجل ووصّله بالكهرباء لمدة 24 ساعة على الأقل لاستئناف الخدمة
        </div>
      )}

      <div className="account-card-top-row account-card-head">
        <div className="account-card-title-block">
          {nameIsEmail ? (
            <button
              type="button"
              className="account-card-name account-card-name-copy"
              dir="ltr"
              aria-label="نسخ البريد"
              onClick={() => {
                void copyToClipboard(identityEmail ?? "");
                setEmailCopied(true);
                window.setTimeout(() => setEmailCopied(false), 1500);
              }}
            >
              {emailCopied ? "✓ نُسخ" : account.name}
            </button>
          ) : (
            <h3 className="account-card-name">{account.name}</h3>
          )}
          {/* ✉️ His Oct 18 2026 order: the name and the email on top, always in the same place. */}
          {identityEmail && !nameIsEmail && (
            <button
              type="button"
              className="account-card-head-email"
              dir="ltr"
              data-tour="email-copy"
              aria-label="نسخ البريد"
              onClick={() => {
                void copyToClipboard(identityEmail);
                setEmailCopied(true);
                window.setTimeout(() => setEmailCopied(false), 1500);
              }}
            >
              <IconEnvelope /> {emailCopied ? "✓ نُسخ" : identityEmail}
            </button>
          )}
          {client ? (
            <button type="button" className="account-card-client-name" onClick={() => onOpenClient(client)} title="فتح بطاقة الزبون">
              {client.name}
            </button>
          ) : heldByRepName ? (
            <div className="account-card-client-missing">
              <span className="badge account-card-held-by-rep">🔒 زبون {heldByRepName}</span>
            </div>
          ) : (
            <div className="account-card-client-missing">
              <span className="badge badge-gray">الزبون غير محدد</span>
            </div>
          )}
          {repClientName && (
            <div className="account-card-rep-client" title="زبون المندوب على هذا الجهاز - للعلم فقط">
              👤 زبون المندوب: {repClientName}
            </div>
          )}
        </div>
      </div>

      {/* 🫧 One fixed line (his Oct 18 2026 order): the two service bubbles, D and ✓ - never moving. */}
      <div className="account-card-status-row">
        {bubbles && <ServiceBubbles bubbles={bubbles} />}
        {/* ⏸️ Moving to the Standby plan (SIS) - still a service, not «ملغي» (the bubbles show it when known). */}
        {account.pendingStandbyDate && !cancellation.cancelled && !bubbles && (
          <span className="standby-pending-chip" title={`ينتقل إلى وضع الاستعداد (SIS) في ${account.pendingStandbyDate}`}>
            ⏸️ SIS من <bdi dir="ltr">{account.pendingStandbyDate}</bdi>
          </span>
        )}
        {/* 🫧 The STOP bubble already says it (his Oct 17 2026 ask «ملغى لماذا هنا»). */}
        {context === "active" && !account.creation && cancellation.cancelled && !bubbles && (
          <button type="button" className="cancel-subscription-button is-cancelled" onClick={() => void handleCancelSubscription()} title={cancelledMessage(cancellation)}>
            ملغى
          </button>
        )}
        {(marks.d || marks.p || previousDebts.length > 0) && (
          <span className="device-marks" aria-label="حالة الدفع">
            {/* 💳 his Oct 12 2026 ask «عندما أضغط على D تظهر لي مكان تسديد الفاتورة» */}
            {marks.d === "pending" && (
              <button
                type="button"
                className="device-mark device-mark-d device-mark-button"
                title="تكلفة Starlink لم تُدفع بعد - اضغط للتسديد"
                aria-label="تسديد تكلفة Starlink"
                onClick={(e) => {
                  e.stopPropagation();
                  if (openDebtEntries(ledgerEntries).length && onSettleD) onSettleD(account);
                  else router.push("/starlink");
                }}
              >
                D
              </button>
            )}
            {previousDebts.length > 0 && (
              <Link href="/starlink" className="device-mark device-mark-d-previous device-mark-button" title="دين سابق على Starlink لم يُدفع - اضغط للتسديد" aria-label="تسديد الدين السابق" onClick={(e) => e.stopPropagation()}>
                D
              </Link>
            )}
            {marks.d === "settled" && <span className="device-mark device-mark-ok" title="تكلفة Starlink مدفوعة">✓</span>}
            {marks.p && (
              <span
                className={`device-mark ${marks.p === "paid" ? "device-mark-p" : "device-mark-p-partial"}`}
                title={marks.p === "paid" ? "الزبون دفع آخر شحنة" : "الزبون دفع جزءًا من آخر شحنة"}
              >
                P
              </span>
            )}
          </span>
        )}
        {serviceStatus && <span className={`badge ${serviceStatus.className} account-card-status-badge`}>{serviceStatus.label}</span>}
      </div>

      {(addedByRepName || twin || repPending) && (
        <div className="account-card-flags-row">
          {addedByRepName && (
            <span className="rep-added-chip" title="أضافه المندوب من تطبيقه وثبّتّه أنت">
              📱 أضافه {addedByRepName}
              {account.addedByRepAt && <> · <bdi dir="ltr">{account.addedByRepAt.slice(0, 10)}</bdi></>}
              {onClearRepAdded && (
                <button
                  type="button"
                  className="rep-added-chip-clear"
                  aria-label={`إزالة «أضافه ${addedByRepName}»`}
                  onClick={() => {
                    if (window.confirm(`إزالة «📱 أضافه ${addedByRepName}» عن «${account.name}»؟\n\nيبقى الجهاز عند مندوبه كما هو - تُزال العلامة فقط.`)) onClearRepAdded(account);
                  }}
                >
                  ✕
                </button>
              )}
            </span>
          )}
          {twin && onMergeInto && (
            <button
              type="button"
              className="duplicate-chip"
              title="نفس الجهاز مسجّل مرتين"
              onClick={() => {
                const same = (twin.expectedEmail ?? "").trim().toLowerCase() && (twin.expectedEmail ?? "").trim().toLowerCase() === (account.expectedEmail ?? "").trim().toLowerCase();
                if (
                  window.confirm(
                    `⚠️ هذا الجهاز مكرّر مع «${twin.name}» (${same ? "نفس الإيميل" : "نفس رقم KIT"}).\n\nدمج «${account.name}» في «${twin.name}»؟\n• تنتقل شحناته ودفعاته وديونه السابقة إلى «${twin.name}»\n• وما ينقص «${twin.name}» (الزبون، المندوب، الهاتف، الكلمات…) يؤخذ منه\n• ثم يُنقل «${account.name}» إلى سلة المحذوفات\n\nلتبقي هذا بدل الآخر: اضغط «مكرّر» على البطاقة الأخرى.`,
                  )
                )
                  onMergeInto(account, twin);
              }}
            >
              ⚠️ مكرّر · دمج
            </button>
          )}
          {twin && onNotDuplicate && (
            <button
              type="button"
              className="duplicate-chip-clear"
              aria-label={`ليس مكرّرًا مع «${twin.name}»`}
              title="ليسا نفس الجهاز - أزل علامة التكرار"
              onClick={() => {
                if (window.confirm(`«${account.name}» و«${twin.name}» جهازان مختلفان؟\n\nتُزال علامة «مكرّر» عن الاثنين ولا تعود. لا يُحذف ولا يُدمج شيء.`)) onNotDuplicate(account, twin);
              }}
            >
              ✕
            </button>
          )}
          {repPending && (
            <span className="rep-pending-chip" title="سجّلته أنت - ينتظر تثبيت المسؤول">
              ⏳ بانتظار المسؤول
            </span>
          )}
        </div>
      )}

      {/* 💲 Starlink's bill and the unrecorded gap side by side (his Oct 18 2026 order). */}
      <div className="account-card-starlink-balance-row account-card-money-row">
        <span className="account-card-label" title="مستحق Starlink">Starlink:</span>
        {account.limitedAccess ? (
          <span className="account-card-limited-note" title="الإيميل ليس صاحب الحساب - لا تظهر له الفوترة؛ تحقق من الحساب الرئيسي">
            👤 إيميل غير رئيسي - الفوترة لا تظهر
          </span>
        ) : balanceIsZero ? (
          // A device suspended for billing owes money by definition, so "لا يوجد" (nothing due)
          // there is misleading - it just means the amount hasn't been read yet. Prompt to read it
          // instead, and keep showing the real figure the moment a sync captures it.
          isSuspended ? (
            <span className="account-card-limited-note" title="الجهاز موقوف بسبب الفوترة - حدّث من Starlink أو افتح الحساب لقراءة المبلغ المستحق">
              ⚠️ موقوف للفوترة - حدّث لقراءة المبلغ
            </span>
          ) : (
            <strong className="stat-tile-value-ok">لا يوجد</strong>
          )
        ) : (
          <span dir="ltr">
            {/* The bill itself first - on a narrow line only the ≈ USD part may be cut. */}
            <strong>{account.currency} {account.balanceDue || "0"}</strong>
            {unpaidIsBalance && <span className="account-card-unpaid-tag"> · غير مدفوع</span>}
            {balanceUsdEquivalent !== undefined && (
              <span className="stat-tile-value-usd"> ≈ {formatAmount(balanceUsdEquivalent)} USD</span>
            )}
          </span>
        )}
        {unrecordedUsd > 0 && onAddPreviousDebt && stillDueDs.length === 0 && (
          <button type="button" className="account-card-gap-chip" onClick={() => setDebtChoiceUsd(unrecordedUsd)} title={`فرق ${formatAmount(unrecordedUsd)} $ غير مسجّل - اضغط لتسجيله`}>
            فرق <bdi dir="ltr">{formatAmount(unrecordedUsd)} $</bdi> · الدين
          </button>
        )}
      </div>

      {unpaidStarlinkUsd > 0 && !unpaidIsBalance && (
        <div className="account-card-unpaid-starlink">
          <span>غير مدفوع لستارلينك:</span>
          <strong dir="ltr">{formatAmount(unpaidStarlinkUsd)} $</strong>
          {openDebtUsd > 0 && previousDebtUsd > 0 && (
            <small>
              (D منك <bdi dir="ltr">{formatAmount(openDebtUsd)} $</bdi> · سابق <bdi dir="ltr">{formatAmount(previousDebtUsd)} $</bdi>)
            </small>
          )}
        </div>
      )}
      {stillDueDs.length > 0 && onRestoreD && (
        <div className="account-card-still-due" role="alert">
          <span>
            ⚠️ D سُدّد في <bdi dir="ltr">{stillDueDs.map((e) => e.starlinkCost?.paidAt ?? "").filter(Boolean).join("، ")}</bdi> وستارلينك ما زال يطلب{" "}
            <bdi dir="ltr">{account.currency} {account.balanceDue}</bdi> - فاتورة شهر جديد، أم لم تدفعه؟
          </span>
          <span className="account-card-still-due-actions">
            <button type="button" className="text-action" onClick={() => setShowRenewalDialog(true)}>
              📅 شهر جديد
            </button>
            {onConfirmPaidD && (
              <button type="button" className="text-action" onClick={() => onConfirmPaidD(account, stillDueDs.map((e) => e.id))}>
                ✓ دفعته
              </button>
            )}
            <button
              type="button"
              className="text-action"
              onClick={() => {
                if (
                  window.confirm(
                    `لم تدفع D القديم فعلاً؟\n\nسيُلغى تسجيل دفعه (${stillDueDs.map((e) => e.starlinkCost?.paidAt ?? "").join("، ")}) ويرجع D غير مدفوع - ولا يُسجَّل أي دين جديد على الزبون.\nإذا كنت دفعته وهذه فاتورة شهر جديد، اضغط «إلغاء» ثم «📅 شهر جديد».`,
                  )
                )
                  onRestoreD(account, stillDueDs.map((e) => e.id));
              }}
            >
              ↩️ لم أدفعه
            </button>
          </span>
        </div>
      )}

      <div className="account-card-pill-row">
        {LEDGER_CURRENCIES.every((c) => !ledgerBalances[c]) ? (
          <span className="badge badge-green">لا يوجد مستحق</span>
        ) : (
          LEDGER_CURRENCIES.map((c) => {
            const balance = ledgerBalances[c];
            if (!balance) return null;
            return balance > 0 ? (
              <span key={c} className="badge badge-red">{formatAmount(balance)} {LEDGER_CURRENCY_LABELS[c]}</span>
            ) : (
              <span key={c} className="badge badge-green">للزبون: {formatAmount(-balance)} {LEDGER_CURRENCY_LABELS[c]}</span>
            );
          })
        )}
        {(account.rechargeDate || account.standbyDate) ? (
          onPatch ? (
            <button
              type="button"
              className="account-card-recharge-pill account-card-recharge-btn"
              dir="ltr"
              data-tour="renewal-lock"
              aria-label={account.lockedRenewalDay ? `يوم التجديد مثبّت على ${account.lockedRenewalDay}` : "ثبّت يوم التجديد"}
              onClick={() => setRenewalSheet(true)}
            >
              <span aria-hidden="true">{account.lockedRenewalDay ? "📌" : "📅"}</span> {account.rechargeDate || account.standbyDate}
              {remaining && <span className={`account-card-days ${urgencyClass}`} dir="rtl"> · {remaining}</span>}
            </button>
          ) : (
            <span className="account-card-recharge-pill" dir="ltr">
              <span aria-hidden="true">{account.lockedRenewalDay ? "📌" : "📅"}</span> {account.rechargeDate || account.standbyDate}
              {remaining && <span className={`account-card-days ${urgencyClass}`} dir="rtl"> · {remaining}</span>}
            </span>
          )
        ) : (
          <span className="account-card-recharge-pill account-card-recharge-pill-unread">
            <span aria-hidden="true">📅</span> {renewalDateLabel("")}
          </span>
        )}
        {unregisteredCard && (
          <Link href="/starlink" className="badge badge-red" title="بطاقة الدفع في ستارلينك ليست من بطاقاتك المسجّلة">
            💳 <bdi dir="ltr">•{account.paymentCardLast4}</bdi> غير مسجّلة
          </Link>
        )}
        {account.renewalDayMismatch && onPatch && (
          <button type="button" className="badge badge-red account-card-recharge-btn" onClick={() => setRenewalSheet(true)}>
            ⚠️ قرأ يوم {account.renewalDayMismatch.day} بدل {account.lockedRenewalDay}
          </button>
        )}
        {renewalSheet && onPatch && (
          <RenewalLockSheet account={account} onPatch={(patch) => onPatch(account, patch)} onClose={() => setRenewalSheet(false)} />
        )}
      </div>

      {/* 🛰️ Dish · Wi-Fi · country on one line (his Oct 18 2026 order). */}
      <div className="account-card-mini-row account-card-device-row">
        <span className="device-dots device-dots-compact" title={`الطبق (STARLINK): ${dishDot.word} · الواي فاي: ${wifiDot.word}`}>
          <button
            type="button"
            className={`device-dot device-dot-${dishDot.tone} device-dot-button`}
            onClick={() => setShowDishAlerts(true)}
            aria-label="تنبيهات الطبق"
          >
            <i aria-hidden="true" /> <IconDish /> <span className="device-dot-label">الطبق: </span>{dishDot.word}
            {dishAlerts.length > 0 && <span className="device-dot-count">⚠️{dishAlerts.length}</span>}
          </button>
          <span className={`device-dot device-dot-${wifiDot.tone}`}>
            <i aria-hidden="true" /> <IconWifi /> <span className="device-dot-label">واي فاي: </span>{wifiDot.word}
          </span>
        </span>
        {bubbles && priorityState && (priorityState.kind === "exhausted" || priorityState.kind === "near") && (
          <span className={`badge ${priorityState.kind === "exhausted" ? "badge-red" : "badge-yellow"} account-card-plan-badge`} title={`${planName ?? ""} - ${priorityDataLine(priorityState)}`}>
            ⚠️ {priorityState.usedGb !== undefined ? <bdi dir="ltr">{priorityState.usedGb}GB</bdi> : "البيانات"}
          </span>
        )}
        {planBadge && (
          <span
            className={`badge ${priorityState?.kind === "exhausted" ? "badge-red" : priorityState?.kind === "near" ? "badge-yellow" : "badge-mint"} account-card-plan-badge`}
            title={priorityState ? `${planName ?? ""} - ${priorityDataLine(priorityState)}` : planName}
          >
            {planBadge}
            {priorityState?.usedGb !== undefined && <> ⚠️ <bdi dir="ltr">{priorityState.usedGb}GB</bdi></>}
          </span>
        )}
        {deviceCountry && (
          <span className="mini-status account-card-country" title={`دولة الجهاز: ${deviceCountry.country} (${deviceCountry.code})`}>
            {countryFlag(account.serviceCountry)} {deviceCountry.country}
          </span>
        )}
      </div>

      {/* One row: فتح الحساب · دفعة · 🔄 تحديث · ⋯ - the mailbox and «تجديد» are in ⋯. */}
      <div className="account-card-main-actions account-card-one-row">
        {whatsAppButton}
        <button
          className="card-action card-action-primary"
          type="button"
          onClick={handleOpen}
          disabled={opening}
          title={isAndroidApp ? "فتح متصفح مستقل لهذا الحساب" : "متاح فقط داخل تطبيق STAR NET لنظام Android"}
        >
          <IconOpen /> {opening ? "جارِ الفتح…" : "فتح الحساب"}
        </button>
        {context === "active" && (
          <>
            <button type="button" className="card-action card-daily-action card-act-pay" onClick={() => onLedger(account)}>
              <IconCash /> دفعة
            </button>
            {/* 🔄 «تحديث» where «تجديد» was (التجديد in ⋯) - the normal sync, his Oct 18 2026 choice. */}
            <button type="button" className="card-action card-daily-action card-act-sync" onClick={() => void handleQuickSync()} disabled={syncingCard} title="تحديث هذا الجهاز من Starlink">
              <IconSync /> {syncingCard ? "جارٍ…" : "تحديث"}
            </button>
            <button type="button" className="card-action card-daily-action card-daily-more card-act-more" onClick={() => setShowMore(true)} aria-label="المزيد">
              <IconMore />
            </button>
          </>
        )}
      </div>

      {context === "active" ? null : (
        <div className="account-card-quick-actions">
          <button type="button" className="quick-action" onClick={() => onRestore(account)}>
            <span className="quick-action-icon quick-action-renew" aria-hidden="true"><IconUndo /></span>
            استعادة
          </button>
          {context === "trash" && onPermanentDelete && (
            <button type="button" className="quick-action" onClick={handlePermanentDeleteClick}>
              <span className="quick-action-icon quick-action-delete" aria-hidden="true"><IconTrash /></span>
              حذف نهائي
            </button>
          )}
        </div>
      )}

      {expanded && (
        <div className="account-card-expanded">
          <div className="account-card-device-name-row">
            <button type="button" className="account-card-copy-btn" onClick={() => copyToClipboard(account.name)} title="نسخ اسم الحساب" aria-label="نسخ اسم الحساب">
              <IconCopy />
            </button>
            <span className="account-card-label">اسم الحساب:</span>
            <strong dir="ltr">{account.name}</strong>
          </div>

          {identityEmail && (
            <div className="account-card-email-row" dir="ltr">
              <span>{identityEmail}</span>
              <button type="button" className="account-card-copy-btn" onClick={() => copyToClipboard(identityEmail)} title="نسخ البريد" aria-label="نسخ البريد">
                <IconCopy />
              </button>
              <span className="account-card-email-icon" aria-hidden="true"><IconEnvelope /></span>
            </div>
          )}

          {(account.subscriptionId || account.dataUsageGb) && (
            <div className="account-card-identifiers">
              {account.subscriptionId && (
                <span>
                  الاشتراك: <strong dir="ltr">{account.subscriptionId}</strong>
                  <button type="button" className="account-card-copy-btn" onClick={() => copyToClipboard(account.subscriptionId!)} title="نسخ" aria-label="نسخ رقم الاشتراك"><IconCopy /></button>
                </span>
              )}
              {account.dataUsageGb && (
                <span className={priorityState ? `account-card-usage-${priorityState.kind}` : undefined}>
                  الاستهلاك: <strong dir="ltr">{account.dataUsageGb}{priorityState?.limitGb !== undefined ? ` / ${priorityState.limitGb}` : ""} GB</strong>
                  {priorityState?.kind === "near" && " ⚠️ قاربت على النفاد"}
                </span>
              )}
            </div>
          )}

          {account.subscriptions && account.subscriptions.length >= 2 && (
            <div className="account-card-subscriptions">
              <span className="account-card-label">الاشتراكات ({account.subscriptions.length}):</span>
              <span className="account-card-subscription-chips">
                {account.subscriptions.map((name, i) => (
                  <span key={`${name}-${i}`} className="account-card-subscription-chip">{name}</span>
                ))}
              </span>
            </div>
          )}

          {(profit.confirmedCount > 0 || profit.expectedCount > 0) && (
            <div className="account-card-profit-row">
              <span className="account-card-label">الربح:</span>
              {profit.confirmedCount > 0 && (
                <strong className={profit.confirmedUsd >= 0 ? "profit-positive" : "profit-negative"}>
                  <bdi dir="ltr">{formatAmount(profit.confirmedMru ?? profit.confirmedUsd)}</bdi>{" "}
                  {profit.confirmedMru !== undefined ? "أوقية" : "USD"}
                </strong>
              )}
              {profit.expectedCount > 0 && (
                <span className="badge badge-yellow" title="محسوب من تكلفة Starlink المسجلة - يتأكد عند التسديد">
                  متوقع (D): ≈ <bdi dir="ltr">{formatAmount(expectedMru ?? profit.expectedUsd)}</bdi>{" "}
                  {expectedMru !== undefined ? "أوقية" : "USD"}
                </span>
              )}
            </div>
          )}

          {lastSynced && (
            <div className="account-card-last-update">
              <IconClock />
              <span>آخر تحديث: {lastSynced}</span>
            </div>
          )}

          {isAndroidApp && (
            <button
              type="button"
              className={`card-sync-btn-labeled${syncingCard ? " syncing" : ""}`}
              title="تحديث هذا الحساب"
              aria-label="تحديث هذا الحساب"
              onClick={handleCardSync}
              disabled={syncingCard}
            >
              <span aria-hidden="true">⟳</span> تحديث من Starlink
            </button>
          )}

          {emailMismatch && (
            <div className="account-card-alert">
              ⚠️ البريد الإلكتروني من Starlink لا يطابق المتوقع
            </div>
          )}

          {account.alertReason && <div className="account-card-alert">{account.alertReason}</div>}

          <div className="account-card-expanded-grid">
            <button className="card-action" type="button" onClick={() => onLedger(account)}>إضافة دفعة</button>
            <button className="card-action" type="button" disabled={!client} onClick={() => client && onOpenClient(client)}>كشف حساب الزبون</button>
            <button className="card-action" type="button" onClick={() => onDeviceStatement(account)}>كشف حساب الجهاز</button>
            <button className="card-action" type="button" onClick={() => onDeviceStatement(account)}>سجل التجديدات</button>
            {onAddPreviousDebt && (
              <button className="card-action" type="button" onClick={() => setPreviousDebtDialog({})}>إضافة دين سابق</button>
            )}
            <button className="card-action" type="button" onClick={() => setShowPromise(true)}>🤝 وعد دفع</button>
          </div>

          <div className="account-card-footer">
            <button className="card-action" title="تعديل البيانات" onClick={() => onEdit(account)}>
              <span aria-hidden="true">✎</span> تعديل البيانات
            </button>
          </div>
        </div>
      )}

      {showPasteSession && (
        <PasteSessionSheet accountId={account.id} accountName={account.name || "الجهاز"} onOpen={() => void handleOpen()} onClose={() => setShowPasteSession(false)} />
      )}
      {showCopySession && <CopySessionSheet accountId={account.id} accountName={account.name || "الجهاز"} onClose={() => setShowCopySession(false)} />}

      {showDishAlerts && (
        <div className="party-sheet-backdrop" role="presentation" onClick={() => setShowDishAlerts(false)}>
          <div className="party-sheet" role="dialog" aria-modal="true" aria-label="تنبيهات الطبق" onClick={(e) => e.stopPropagation()}>
            <div className="party-sheet-head">
              <strong>📡 الطبق: {dishDot.word}</strong>
              <button type="button" className="dialog-close" onClick={() => setShowDishAlerts(false)} aria-label="إغلاق">
                ×
              </button>
            </div>
            {dishAlerts.length === 0 ? (
              <p className="settings-hint">
                {account.dishAlerts ? "لا تنبيهات على الطبق في آخر قراءة." : "لم تُقرأ تنبيهات الطبق بعد - اضغط «مزامنة» داخل متصفح الجهاز."}
              </p>
            ) : (
              <ul className="dish-alert-list">
                {dishAlerts.map((alert) => (
                  <li key={alert.original} className="dish-alert">
                    <strong>
                      <span aria-hidden="true">{alert.icon}</span> {alert.title}
                    </strong>
                    {alert.advice && <span>{alert.advice}</span>}
                    {alert.title !== alert.original && (
                      <small dir="ltr" lang="en">
                        {alert.original}
                      </small>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {lastSynced && <p className="settings-hint">آخر قراءة: {lastSynced}</p>}
          </div>
        </div>
      )}

      {showMore && (
        <div className="party-sheet-backdrop" role="presentation" onClick={() => setShowMore(false)}>
          <div className="party-sheet" role="dialog" aria-modal="true" aria-label={account.name} onClick={(e) => e.stopPropagation()}>
            <div className="party-sheet-head">
              <strong>{account.name}</strong>
              <button type="button" className="dialog-close" onClick={() => setShowMore(false)} aria-label="إغلاق">
                ×
              </button>
            </div>
            <div className="card-more-list">
              {/* 📧 The device's mailbox moved here from the card (one row of buttons). */}
              {isGmail(mailLoginFor(account).email) && isAndroidApp && <DeviceGmailButton email={mailLoginFor(account).email ?? ""} disabled={opening} />}
              {[
                ...(!isGmail(mailLoginFor(account).email)
                  ? [{ icon: "📧", label: mailSignedIn ? "البريد (مسجّل)" : "البريد", run: () => void handleOpenMail() }]
                  : []),
                { icon: "📅", label: "تجديد", run: () => setShowRenewalDialog(true) },
                { icon: "📋", label: expanded ? "إخفاء التفاصيل" : "التفاصيل", run: () => setExpanded((v) => !v) },
                { icon: client ? "✎" : "🔗", label: client ? "تعديل البيانات" : "ربط بزبون", run: () => onEdit(account) },
                { icon: "📋", label: "لصق جلسة (من متصفح آخر)", run: () => setShowPasteSession(true) },
                { icon: "📤", label: "نسخ الجلسة (لمتصفح آخر)", run: () => setShowCopySession(true) },
                { icon: "🔧", label: "متعطل", run: () => setShowFaultDialog(true) },
                { icon: "🤝", label: "وعد دفع", run: () => setShowPromise(true) },
                ...(!account.creation
                  ? [{ icon: "🛑", label: cancellation.cancelled ? "الاشتراك ملغى" : "إلغاء الاشتراك", run: () => void handleCancelSubscription(), tone: "bad" }]
                  : []),
                { icon: "🗄️", label: "أرشفة", run: () => void handleArchiveClick() },
                ...(onSoftDelete ? [{ icon: "🗑️", label: "حذف", run: () => void handleSoftDeleteClick(), tone: "bad" }] : []),
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={`card-more-item${item.tone === "bad" ? " card-more-item-bad" : ""}`}
                  disabled={opening}
                  onClick={() => {
                    setShowMore(false);
                    item.run();
                  }}
                >
                  <span aria-hidden="true">{item.icon}</span> {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {debtChoiceUsd !== null && (
        <div className="party-sheet-backdrop" role="presentation" onClick={() => setDebtChoiceUsd(null)}>
          <div className="party-sheet" role="dialog" aria-modal="true" aria-label="الدين" onClick={(e) => e.stopPropagation()}>
            <div className="party-sheet-head">
              <strong>
                الدين · <bdi dir="ltr">{formatAmount(debtChoiceUsd)} $</bdi>
              </strong>
              <button type="button" className="dialog-close" onClick={() => setDebtChoiceUsd(null)} aria-label="إغلاق">
                ×
              </button>
            </div>
            <div className="card-more-list">
              <button
                type="button"
                className="card-more-item"
                onClick={() => {
                  const suggestedUsd = debtChoiceUsd;
                  setDebtChoiceUsd(null);
                  setPreviousDebtDialog({ suggestedUsd });
                }}
              >
                <span aria-hidden="true">📜</span> دين سابق <small>من قبلك، على Starlink</small>
              </button>
              <button
                type="button"
                className="card-more-item"
                onClick={() => {
                  setDebtChoiceUsd(null);
                  onLedger(account);
                }}
              >
                <span aria-hidden="true">🅳</span> دين D عادي <small>نحن سجّلناه عليه</small>
              </button>
            </div>
          </div>
        </div>
      )}

      {showPromise && <PromiseQuickSheet account={account} client={client} onClose={() => setShowPromise(false)} />}

      {previousDebtDialog && onAddPreviousDebt && (
        <PreviousDebtDialog
          account={account}
          suggestedUsd={previousDebtDialog.suggestedUsd}
          onSave={(input) => {
            const message = onAddPreviousDebt(account, input);
            if (!message) setPreviousDebtDialog(null);
            return message;
          }}
          onClose={() => setPreviousDebtDialog(null)}
        />
      )}

      {showFaultDialog && (
        <DeviceFaultDialog
          account={account}
          openDebtUsd={openDebtUsd}
          waivedCount={ledgerEntries.filter(isWaivedCost).length}
          onSave={(fault, waiveDebts) => { onSetDeviceFault(account, fault, waiveDebts); setShowFaultDialog(false); }}
          onClear={() => { onSetDeviceFault(account, null, false); setShowFaultDialog(false); }}
          onSaveRepair={(note) => { onSetRepair(account, { note, since: account.underRepair?.since ?? new Date().toISOString() }); setShowFaultDialog(false); }}
          onClearRepair={() => { onSetRepair(account, null); setShowFaultDialog(false); }}
          onClose={() => setShowFaultDialog(false)}
        />
      )}

      {showRenewalDialog && (
        <RenewalConfirmDialog
          account={account}
          openDebtUsd={openDebtUsd}
          openDebtCount={openDebtEntries(ledgerEntries).length}
          starlinkDue={balanceIsZero ? null : `${account.currency} ${account.balanceDue}`}
          onConfirm={(newDate, autoShipment, costPending, settleFromCard, payOpenD) => { onConfirmRenewal(account, newDate, autoShipment, costPending, settleFromCard, payOpenD); setShowRenewalDialog(false); }}
          onClose={() => setShowRenewalDialog(false)}
        />
      )}
    </article>
    {noteSheet && onSaveNote && onSetPinned && (
      <DeviceNoteSheet
        deviceName={account.name}
        note={deviceNote}
        mode={noteSheet}
        onSave={(input) => onSaveNote(account, input)}
        onSetPinned={(pinned) => onSetPinned(account, pinned)}
        onDetails={() => setExpanded(true)}
        onClose={() => setNoteSheet(null)}
      />
    )}
    </>
  );
}
