"use client";

import { isRepDevice } from "@/lib/repSeparation";
import { isRepWorkspace, repCan } from "@/lib/repMode";
import { deviceTwins, mergeDevices, notDuplicatePatches } from "@/lib/deviceMerge";
import { currentRepPending } from "@/lib/repWorkspace";
import { loadRepChangesSent, shareRepChanges, type RepChangesSent } from "@/lib/repChangesSend";
import { REP_INBOX_EVENT, repInboxCount } from "@/lib/repInbox";
import { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { rememberPayTarget } from "@/lib/payDeepLink";
import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import { AccountCard, AccountCardContext } from "./AccountCard";
import { DayCircles } from "./DayCircles";
import { ConnectionStatus } from "./ConnectionStatus";
import { AccountDialog, AccountDialogMode } from "./AccountDialog";
import { HomeFab } from "./HomeFab";
import { useDeskWide } from "./useDeskWide";
import { DeskTopBar } from "./desk/DeskTopBar";
import { DeskDevices } from "./desk/DeskDevices";
import { DeskDashboard, type DeskKpi } from "./desk/DeskDashboard";
import { followUp } from "@/lib/deskDashboard";
import { EXPIRY_FILTERS, type ExpiryFilter } from "@/lib/deskTable";
import { loadClientCategories } from "@/lib/clientCategories";
import { HeaderMore } from "./BottomNav";
import { pruneOrphanProofs } from "@/lib/paymentProofStore";
import { buildAutoSyncList } from "@/lib/autoSyncList";
import { pushScheduledSyncs, scheduleSyncRetry } from "@/lib/scheduledSyncs";
import { LedgerDialog } from "./LedgerDialog";
import { ClientDialog } from "./ClientDialog";
import { ClientsOverviewDialog } from "./ClientsOverviewDialog";
import { ourDebtLedgerForClients, autoMoveClientToRep, shipmentRepId } from "@/lib/repClients";
import { confirmAndDeleteLedgerEntry, LedgerEntryEditor } from "./LedgerEntryEditor";
import { DeviceStatementDialog } from "./DeviceStatementDialog";
import { ToastMessage, ToastStack } from "./ToastStack";
import { HelpHint } from "./HelpHint";
import { daysRemainingNumber, stoppedTodayNotRenewed } from "@/lib/date";
import { computeDeviceDebtReminders, computeRenewalReminders, computeRestrictedDeviceReminders, isBackupOverdue } from "@/lib/reminders";
import { formatAmount } from "@/lib/formatAmount";
import { isOutsideHome, outsideHomeDaysLeft, outsideHomeSchedule } from "@/lib/outsideHome";
import { OutsideHomePanel } from "./OutsideHomePanel";
import { DesktopWelcome } from "./DesktopWelcome";
import { isDesktopApp } from "@/lib/desktop";
import { buildAwaitingCharge, fillAwaitingBills } from "@/lib/awaitingBill";
import { syncBillChecks } from "@/lib/billChecks";
import { addLocalEvent } from "@/lib/eventLog";
import { applyLedgerPaymentsToCash, loadCashEntries, saveCashEntries } from "@/lib/cashStore";
import { parseNewDevicePrefill } from "@/lib/deviceFromSale";
import { isPendingActivation, markActivated } from "@/lib/saleDevices";
import { PendingDeviceCard } from "@/components/PendingDeviceCard";
import { adoptRepDevice, repDeviceSecrets } from "@/lib/repDeviceAdopt";
import { bucketPromises, loadPromises } from "@/lib/paymentPromises";
import { HOME_ACTION_EVENT, HOME_SEARCH_EVENT, HomeAction, parseHomeAction, parseHomePayment, parseActivateDevice, REMINDER_COUNT_EVENT, parseHomeSearch } from "@/lib/homeActions";
import { deviceRoute, HOME_ROUTE, KAST_ROUTE, notifyPhone } from "@/lib/appEvents";
import { buildRenewalShipment } from "@/lib/renewalPlan";
import { runAutoBackup } from "@/lib/autoBackupRunner";
import { runDriveBackup } from "@/lib/driveBackupRunner";
import {
  getEveningSummaryHour,
  getMorningDigestHour,
  notifySuspendedWithDebt,
  rescheduleEveningSummary,
  rescheduleMorningDigests,
} from "@/lib/morningNotifications";
import { isTelegramConnected, rescheduleTelegramSummaries, sendRepText, sendTelegramText } from "@/lib/telegram";
import { loadPriorityAlerted, priorityAlertsToSend, priorityTelegramText, savePriorityAlerted } from "@/lib/priorityData";
import { loadOceanAlerted, oceanAlertsToSend, oceanModeAccounts, oceanTelegramText, saveOceanAlerted } from "@/lib/oceanMode";
import { OceanModeAlarm } from "./OceanModeAlarm";
import { PartySheet } from "@/components/AccountsSection";
import { isUnregisteredCard } from "@/lib/cardDevices";
import { countDayKeys, deviceDayKeys, type DayKey } from "@/lib/dayBuckets";
import { countNoClient, matchesNoClientGroup, type NoClientGroup } from "@/lib/noClientDevices";
import { loadPaymentCards, type PaymentCard } from "@/lib/kastCards";
import { cardNeed, computeRenewalForecast } from "@/lib/renewalForecast";
import { computeDeviceMargins, WEAK_MARGIN_PERCENT } from "@/lib/deviceMargins";
import { cardShortfallForSuspended, currentCardBalanceUsd, listOpenShipmentDebts, listSuspendedWithDebt, loadCardTopUps, settleShipmentCost, unsettleShipmentCost } from "@/lib/starlinkDebt";
import { loadPartyAdjustments, recordPartyAdjustment, savePartyAdjustments } from "@/lib/partyBalanceStore";
import { checkForAppUpdate, shouldAutoCheck } from "@/lib/appUpdate";
import { UpdateBanner } from "@/components/UpdateBanner";
import { deviceMatchesQuery, searchEverything, searchTermOf, SearchResult } from "@/lib/homeInsights";
import { addSearch, loadSearchHistory, removeSearch, saveSearchHistory } from "@/lib/searchHistory";
import { listSuppliers, loadSupplierStore, SupplierStore } from "@/lib/supplierStore";
import { listStoreItems, loadStoreItems, StoreItemRegistry } from "@/lib/storeStore";
import {
  getAccountEntries,
  LEDGER_CURRENCY_LABELS,
  LedgerByAccount,
  LedgerEntry,
  loadLedgerStore,
  saveLedgerStore,
  totalOwedAcrossAccounts,
  withAccountEntries,
} from "@/lib/ledgerStore";
import {
  Client,
  ClientStore,
  createClient,
  CreateClientInput,
  deleteClient,
  getClient,
  listClients,
  loadClientStore,
  commitClientStore,
  updateClient,
} from "@/lib/clientStore";
import {
  createRepresentative,
  CreateRepresentativeInput,
  getRepresentative,
  listRepresentatives,
  loadRepresentativeStore,
  Representative,
  RepresentativeStore,
  saveRepresentativeStore,
  setRepTravelPercent,
} from "@/lib/repStore";
import { loadRepLedgerBook, saveRepLedgerBook } from "@/lib/repLedgers";
import { syncRepTravelLedgers, travelLedgerKeys } from "@/lib/repTravelLedger";
import { buildTravelBook, lockRepTravelPercent, lockTravelPrice, matchesTravelGroup, travelStateOf, type TravelGroup } from "@/lib/travelBook";
import { TravelBookPanel } from "@/components/TravelBookPanel";
import { CurrencyStore, getCurrency, loadCurrencyStore, saveCurrencyStore, upsertCurrency, UpsertCurrencyInput } from "@/lib/currencyStore";
import { countFaultCategories, FAULT_CATEGORIES, faultCategory, isFaulty, isUnderRepair, oldestOpenDebt, openDebtEntries, removeFaultPatch, restoreWaivedDebts, waiveOpenDebts } from "@/lib/deviceFault";
import type { DeviceFaultReason } from "@starnet/shared";
import { addToPreviousDebt, listOpenPreviousDebts, loadPreviousDebts, recordPreviousDebt, savePreviousDebts, type PreviousDebtList } from "@/lib/previousDebt";
import { dayKey as localDayKey } from "@/lib/financeDashboard";
import { buildCodeDevices } from "@/lib/codeDevices";
import { confirmClosedMonthChange, ledgerEntryMonthDates } from "@/lib/monthClosing";
import { deviceRecordsQuestion, deviceRecordsSummary, removeDeviceRecords } from "@/lib/deviceRemoval";
import { starlinkCostUsd } from "@/lib/accountingStore";
import {
  addAllocations,
  AllocationsByAccount,
  allStoredAllocations,
  getAccountAllocations,
  loadAllocationStore,
  PaymentAllocation,
  removeAllocationsForEntryFromStore,
  saveAllocationStore,
  withAccountAllocations,
} from "@/lib/paymentAllocationStore";
import { ApiError, listAccounts } from "@/lib/apiClient";
import { getLastBackupAt, isDemoMode, isLoggedIn, isRemindersBadgeEnabled } from "@/lib/settingsStore";
import { commitDemoAccounts, loadDemoAccounts } from "@/lib/demoAccountStore";
import { loadRecentLog, markDeviceTouched, RECENT_EVENT, recentDevices, touchedOn, type RecentLog } from "@/lib/recentDevices";
import { applyBrowserPins, isBrowserPin, isPinned, loadDeviceNotes, mergeDeviceNotes, noteMatchesQuery, pinnedDevices, saveDeviceNote, saveDeviceNotes, setDevicePinned, shouldAskUnpin, unpinAll, type DeviceNotesStore } from "@/lib/deviceNotes";
import { ACCOUNTS_CHANGED_EVENT } from "@/lib/repMenuRecords";
import { loadRepRequests, pendingRepRequests } from "@/lib/repRequests";
import {
  ackPendingAccountSyncs,
  checkAccountSession,
  deleteIsolatedAccountSession,
  isRunningInAndroidApp,
  listMailSessions,
  listPendingAccountSyncs,
  onAccountDataSynced,
  mailExtrasFor,
  openAccountCreation,
  openAutoSignIn,
  openIsolatedAccountBrowser,
  starlinkLoginFor,
  syncAutoSyncAccountList,
  setCodeDevices,
  pushFillCards,
  pushKastDevices,
  kastCheckNow,
  drainKastDeposits,
  openAutoSync,
  takeAutoSyncResults,
  isBackgroundSyncEnabled,
  startBackgroundSync,
  triggerImmediateSync,
} from "@/lib/localBrowser";
import { SyncChoiceSheet, SyncQueueBar } from "./SyncNowSheet";
import { devicesLeftAfterRateLimit, loadSyncQueue, localToday, nextQueuedAccount, pickSyncAccounts, queueProgressLabel, saveSyncQueue, startSyncQueue, syncedOnlyByCommand, syncQueueFor, type SyncWindow } from "@/lib/syncQueue";
import { DayActionsSheet } from "./DayActionsSheet";
import { TravelCheckSheet } from "./TravelCheckSheet";
import { NotificationsBell } from "./NotificationsBell";
import { hiddenRepIds, isHiddenRepDevice, repContact } from "@/lib/repSeparation";
import { absorbTravelResults, applyTravelFee, buildTravelCheckReport, isTravelVerified, loadTravelBgRun, markTravelDone, needsTravelRegistration, saveTravelBgRun, setTravelPrice, travelDoneRepMessage, travelEarnings, travelUncheckedCount, type TravelBgRun } from "@/lib/travelRegistration";
import { buildAccountStatementMessage, buildWhatsAppLink } from "@/lib/whatsapp";
import { accountsForDay, accountsOfOwner, type DayOwner } from "@/lib/dayActions";
import { applyOutcomes, buildSyncReport, outcomeLabel, signedOutAlert, QUEUE_GAP_SECONDS, RATE_LIMIT_NOTE } from "@/lib/syncReport";
import { depositLabel, kastDevicesSnapshot } from "@/lib/kastCards";
import {
  accountIdsNeedingLogin,
  loadSessionCheckResults,
  markSignedInFromSync,
  saveSessionCheckResults,
  SessionCheckResults,
  withSessionStatus,
} from "@/lib/sessionCheck";
import { createReadyGate } from "@/lib/readyGate";
import { runBalanceAlerts } from "@/lib/placeLedgerData";
import { PendingSyncLike, reapplyCachedSyncedFields, runSyncBatch } from "@/lib/starlinkSync";
import { getCachedSyncedFields, saveSyncedFieldsCache } from "@/lib/syncedFieldsCache";
import { resolveAccountDeletion } from "@starnet/local-browser-plugin";
import { confirmPaidD } from "@/lib/settledStillDue";
import { clearRepAddedPatch } from "@/lib/repAddedMark";
import {
  absorbRingResults,
  duplicatePairs,
  isCanceledDevice,
  loadRingCheck,
  renewedOn,
  ringCheckReport,
  saveRingCheck,
  type RingCheckRun,
  type RingQuestion,
} from "@/lib/deviceRings";
import { RingActionsSheet } from "@/components/RingActionsSheet";
import { ClientSearchSheet } from "@/components/ClientSearchSheet";
import { SyncRunLine } from "@/components/SyncRunLine";
import { endRun, isRunOver, loadSyncRun, saveSyncRun, startRun, withChanges, withCurrent, withOutcomes, type SyncRun } from "@/lib/syncRun";
import { changesTo, serviceBubbles } from "@/lib/serviceBubbles";
import { placeholderRename } from "@/lib/placeholderName";
import { isOnMailDomain, loadMailDomain, pushMailDomain } from "@/lib/mailDomain";

const NEAR_EXPIRY_THRESHOLD_DAYS = 3;

type DataState = "demo" | "loading" | "loaded" | "error";
type DialogState = {
  mode: AccountDialogMode;
  account?: StarlinkAccountSummary;
  prefill?: Partial<StarlinkAccountSummary>;
  startCreating?: boolean;
  /** ⚡ «شحن / تفعيل» of a «غير مفعّل» device: its account (new or existing), then its first charge. */
  activating?: boolean;
} | null;

/** Which dashboard summary card (see the "ملخص الحسابات" section) the account list is currently
 * narrowed to - tapping a card sets this, tapping it again (or "مسح التصفية") clears it. Mutually
 * exclusive with `selectedDay` (picking one clears the other, see toggleStatFilter) - both are
 * ways of narrowing the SAME list, and combining them silently would be confusing rather than
 * useful. `total` never appears as a value: tapping "كل الحسابات" is just `showAll`, not a real
 * per-account filter. */
type StatFilterKind =
  | "online" | "expiringSoon" | "expired" | "suspended" | "faulty" | "repair" | "fromRep" | "noClient" | "travel" | "travelDone" | "pinned" | "recent" | "notRenewed"
  // 🔵 his Oct 17 2026 circles (lib/deviceRings.ts); "rep" = one rep's devices (repRingId).
  | "notCanceled" | "canceled" | "renewed" | "sis" | "rom" | "g100" | "duplicate" | "rep" | "toSis" | "toStop"
  // 🌍 his Oct 21 2026 ask: outside the home country, day by day (lib/outsideHome.ts).
  | "outsideHome"
  // ⏳ sold by invoice, not activated yet (lib/saleDevices.ts).
  | "pending";

const STAT_FILTER_TITLES: Record<StatFilterKind, string> = {
  online: "الحسابات المتصلة الآن",
  expiringSoon: "الحسابات القريبة من الانتهاء",
  expired: "الحسابات المنتهية",
  suspended: "الحسابات المتوقفة (فوترة)",
  faulty: "الأجهزة المعطلة",
  repair: "قيد الإصلاح (مع الدعم الفني)",
  fromRep: "أجهزة أضافها المندوبون",
  noClient: "أجهزة بدون زبون",
  travel: "🛂 الأجهزة التي تحتاج توثيق",
  travelDone: "✅ الأجهزة التي تم توثيقها",
  pinned: "📌 الأجهزة المثبتة",
  recent: "🕘 آخر الأجهزة (الأحدث أولًا)",
  notRenewed: "⏰ لم تُجدَّد منذ بداية اليوم",
  notCanceled: "✅ الأجهزة غير الملغاة",
  canceled: "🚫 الأجهزة الملغاة",
  renewed: "🔄 جُدِّدت اليوم",
  sis: "⏸️ أجهزة SIS",
  rom: "🌍 أجهزة ROM",
  g100: "📦 أجهزة 100G",
  toSis: "← SIS بعد انتهاء الشهر",
  toStop: "← STOP بعد انتهاء الشهر",
  duplicate: "🔗 الأجهزة المكررة",
  rep: "🤝 أجهزة المندوب",
  outsideHome: "🌍 خارج البلد - فعّل التجوال العالمي قبل يومها",
  pending: "⏳ أجهزة بيعت ولم تُفعَّل بعد",
};

/** 🔍 A circle's check (long press): what it answers, in his words. Circles the sync can't change
 * (pinned, a rep's…) just report which devices were read. */
const RING_WORDS: Partial<Record<StatFilterKind, { question: string; yes: string; no: string }>> = {
  online: { question: "هل الجهاز متصل الآن؟ (الطبق والواي فاي)", yes: "متصل الآن", no: "غير متصل" },
  expiringSoon: { question: "هل ينتهي قريبًا؟ (تاريخ التجديد)", yes: "ينتهي قريبًا", no: "ليس قريبًا من الانتهاء" },
  expired: { question: "هل انتهى؟ (تاريخ التجديد)", yes: "منتهٍ", no: "لم يعد منتهيًا" },
  suspended: { question: "هل أوقفته ستارلينك بسبب الفوترة؟", yes: "موقوف", no: "لم يعد موقوفًا" },
  faulty: { question: "هل ما زال معطلًا؟", yes: "معطل", no: "لم يعد معطلًا" },
  notRenewed: { question: "هل جُدِّد بعد توقفه اليوم؟", yes: "لم يُجدَّد", no: "جُدِّد" },
  canceled: { question: "هل الجهاز ملغي فعلًا؟ (الاشتراك وموعد انتهائه)", yes: "ملغي فعلًا", no: "غير ملغي" },
  notCanceled: { question: "هل ما زال غير ملغي؟", yes: "غير ملغي", no: "صار ملغيًا" },
  sis: { question: "هل باقته SIS (وضع الاستعداد)؟", yes: "على SIS", no: "ليس SIS" },
  rom: { question: "هل باقته ROM (تجوال غير محدود)؟", yes: "على ROM", no: "ليس ROM" },
  g100: { question: "هل باقته 100G؟", yes: "على 100G", no: "ليس 100G" },
  toSis: { question: "هل سيتحوّل إلى SIS بعد انتهاء الشهر؟", yes: "سيتحوّل إلى SIS", no: "لن يتحوّل" },
  toStop: { question: "هل سيتوقف بعد انتهاء الشهر؟", yes: "سيتوقف", no: "لن يتوقف" },
  travelDone: { question: "هل ما زال موثّقًا؟", yes: "موثّق", no: "غير موثّق" },
  outsideHome: { question: "هل ما زال خارج بلده؟ (صفحة الاشتراك)", yes: "خارج بلده", no: "لم يعد خارج بلده" },
};

function ringQuestion(kind: string, label: string): RingQuestion & { question: string } {
  const words = RING_WORDS[kind as StatFilterKind];
  if (!words) return { label, question: "تحديث هذه الأجهزة من Starlink", test: () => true, yes: "تمت قراءته", no: "-" };
  return { label, question: words.question, yes: words.yes, no: words.no, test: (a) => matchesStatFilter(a, kind as StatFilterKind) };
}

function matchesStatFilter(account: StarlinkAccountSummary, kind: StatFilterKind): boolean {
  switch (kind) {
    case "online":
      return account.dishStatus === DeviceStatus.GREEN || account.wifiStatus === DeviceStatus.GREEN;
    case "suspended":
      return account.serviceStatus === "suspended";
    case "faulty":
      return isFaulty(account);
    case "repair":
      return isUnderRepair(account);
    case "fromRep":
      return Boolean(account.addedByRepId);
    case "travel":
      return needsTravelRegistration(account);
    case "travelDone":
      return isTravelVerified(account);
    case "outsideHome":
      return isOutsideHome(account) && account.serviceStatus !== "canceled";
    case "pending":
      return isPendingActivation(account);
    case "notRenewed":
      return !isFaulty(account) && stoppedTodayNotRenewed(account.rechargeDate || account.standbyDate);
    case "canceled":
      return isCanceledDevice(account);
    case "notCanceled":
      return !isCanceledDevice(account);
    // 🫧 The service NOW, as the card's first bubble shows it.
    case "sis":
      return serviceBubbles(account, localToday())?.now === "SIS";
    case "rom":
      return serviceBubbles(account, localToday())?.now === "ROM";
    case "g100":
      return serviceBubbles(account, localToday())?.now === "100G";
    case "toSis":
      return changesTo(account, localToday(), "SIS");
    case "toStop":
      return changesTo(account, localToday(), "STOP");
    case "renewed":
    case "duplicate":
    case "rep":
    case "noClient":
    case "pinned":
    case "recent":
      // Needs another store - narrowed in `filtered` (client list / 📌 device notes).
      return true;
    case "expiringSoon": {
      // A broken device isn't renewed until it's repaired (see "المعطلة").
      if (isFaulty(account)) return false;
      const days = daysRemainingNumber(account.rechargeDate || account.standbyDate);
      // The renewal date is the stop instant, so 0 is already expired (see daysRemainingLabel):
      // "expiring soon" starts at 1 ("ends tonight").
      return days !== null && days >= 1 && days <= NEAR_EXPIRY_THRESHOLD_DAYS;
    }
    case "expired": {
      if (isFaulty(account)) return false;
      const days = daysRemainingNumber(account.rechargeDate || account.standbyDate);
      return days !== null && days <= 0;
    }
  }
}

/** 👆 How long a newly shown banner ignores taps. */
const FRESH_BANNER_MS = 1200;

export function HomeView({
  accounts: demoAccounts,
  viewMode = "active",
  deskPage = "home",
}: {
  accounts: StarlinkAccountSummary[];
  /** Which of the three device lists this page shows - set once per route ("/" -> "active",
   * "/archive" -> "archived", "/trash" -> "trash", each its own bottom-nav destination) rather
   * than an in-page toggle, since switching between them is now a full navigation. Never mixed
   * into the normal dashboard list/filters/stat tiles below (those always operate on "active"
   * devices only). */
  viewMode?: AccountCardContext;
  /** 🖥️ The Windows app only: «/» is the dashboard, «/devices» the devices table (same data, same
   * dialogs). Ignored on the phone. */
  deskPage?: "home" | "devices";
}) {
  const router = useRouter();
  // 🖥️ The Windows app's own layout (his Oct 21 2026 brief) - the phone's stays exactly as it is.
  const deskWide = useDeskWide();
  const desk = deskWide && viewMode === "active";
  // «/devices?f=expired&day=5&exp=today&id=…&q=…» - what the dashboard's figures, follow-up and calendar open.
  const [deskInit, setDeskInit] = useState<{ id?: string; exp?: ExpiryFilter }>({});
  // 📧 Devices whose mailbox is signed in on this phone - their «البريد» button turns mint green.
  const [mailSignedIds, setMailSignedIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      listMailSessions().then((sessions) => {
        if (alive) setMailSignedIds(new Set(sessions.map((s) => s.accountId)));
      });
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  const [query, setQuery] = useState("");
  // 🕘 His Oct 18 2026 ask: every search is kept (lib/searchHistory.ts), shown under the empty bar.
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DayKey | null>(null);
  const [statFilter, setStatFilter] = useState<StatFilterKind | null>(null);
  // 🤝 Which rep's circle is open (statFilter "rep").
  const [repRingId, setRepRingId] = useState<string | null>(null);
  // 📌 His private pins + purple notes per device (lib/deviceNotes.ts) - never sent to a rep.
  const [deviceNotes, setDeviceNotes] = useState<DeviceNotesStore>({});
  useEffect(() => setDeviceNotes(loadDeviceNotes()), []);
  // 🕘 «آخر جهاز»: opened / edited on this phone (lib/recentDevices.ts) - syncs and له/عليه are derived.
  const [recentLog, setRecentLog] = useState<RecentLog>({});
  useEffect(() => {
    const reload = () => setRecentLog(loadRecentLog());
    reload();
    window.addEventListener(RECENT_EVENT, reload);
    return () => window.removeEventListener(RECENT_EVENT, reload);
  }, []);
  function commitDeviceNotes(next: DeviceNotesStore) {
    saveDeviceNotes(next);
    setDeviceNotes(next);
  }
  // 🧹 A renewal or payment on a pinned device asks «إزالة التثبيت؟» (once its dialog is closed).
  const [unpinAsk, setUnpinAsk] = useState<string | null>(null);
  /** 🛂 After a registration price became a debt: «💬 أرسل له كشفه» (the device id). */
  const [travelFeeSent, setTravelFeeSent] = useState<{ accountId: string; text: string } | null>(null);
  /** One group of «المعطلة» (ملغي / محروق / منقول / إيميل غير رئيسي), or all of them. */
  const [faultFilter, setFaultFilter] = useState<DeviceFaultReason | null>(null);
  /** «بدون زبون»: all of them, mine, or one representative's. */
  const [noClientGroup, setNoClientGroup] = useState<NoClientGroup>("all");
  /** 🛂 Which «✅ تم توثيقها» circle is open (lib/travelBook.ts). */
  const [travelGroup, setTravelGroup] = useState<TravelGroup>("all");

  function toggleStatFilter(kind: StatFilterKind) {
    setStatFilter((current) => (current === kind ? null : kind));
    setSelectedDay(null);
  }
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    if (deskPage !== "devices") return;
    setShowAll(true);
    const params = new URLSearchParams(window.location.search);
    const f = params.get("f");
    if (f && f in STAT_FILTER_TITLES && f !== "rep") setStatFilter(f as StatFilterKind);
    const day = Number(params.get("day"));
    if (Number.isInteger(day) && day >= 1 && day <= 28) setSelectedDay(day);
    const q = params.get("q");
    if (q) setQuery(q);
    const exp = params.get("exp");
    setDeskInit({
      ...(params.get("id") ? { id: params.get("id") ?? undefined } : {}),
      ...(exp && EXPIRY_FILTERS.some((e) => e.id === exp) ? { exp: exp as ExpiryFilter } : {}),
    });
  }, [deskPage]);
  const [dialog, setDialog] = useState<DialogState>(null);
  // 📱 The add-device dialog was opened for a device a rep sent from his app (repDeviceAdopt.ts).
  const repDeviceRequestRef = useRef<string | null>(null);
  // Arriving from a store sale of a Starlink kit (see deviceFromSale.ts): open the add-device
  // dialog already linked to that client/representative, then drop the query so a refresh or
  // back-navigation never reopens it.
  useEffect(() => {
    const prefill = parseNewDevicePrefill(window.location.search);
    if (!prefill) return;
    repDeviceRequestRef.current = prefill.repRequestId ?? null;
    const open = (secrets: { emailPassword?: string; wifiPassword?: string } = {}) =>
      setDialog({
        mode: "add",
        ...(prefill.create ? { startCreating: true } : {}),
        prefill: {
          ...(prefill.invoiceId ? { storeInvoiceId: prefill.invoiceId } : {}),
          clientId: prefill.clientId,
          representativeId: prefill.representativeId,
          name: prefill.name ?? "",
          ...(prefill.email ? { expectedEmail: prefill.email } : {}),
          ...(prefill.kit ? { kitNumber: prefill.kit } : {}),
          // 📱 A rep's device: the codes he typed come out of its encrypted file.
          ...(secrets.emailPassword ? { expectedEmailPassword: secrets.emailPassword } : {}),
          ...(secrets.wifiPassword ? { wifiPassword: secrets.wifiPassword } : {}),
        },
      });
    if (prefill.repRequestId) void repDeviceSecrets(prefill.repRequestId).then(open);
    else open();
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // A newer staging APK than this build (see appUpdate.ts) - checked in the Android app only, at
  // most every few hours, silently ignored when offline.
  const [updateAvailable, setUpdateAvailable] = useState(false);
  // النسخ الاحتياطي التلقائي (autoBackup.ts): once accounts are loaded, at most once a day.
  const autoBackupStartedRef = useRef(false);
  useEffect(() => {
    if (!isRunningInAndroidApp() || !shouldAutoCheck()) return;
    void checkForAppUpdate().then((result) => setUpdateAvailable(result.status === "update"));
  }, []);
  // 📥 requests reps sent through the bot (repRequests.ts) - they arrive while the app is open.
  const [pendingRepRequestCount, setPendingRepRequestCount] = useState(0);
  useEffect(() => {
    const refresh = () => {
      setPendingRepRequestCount(pendingRepRequests(loadRepRequests()).length);
      setRepInboxPending(repInboxCount());
    };
    refresh();
    const timer = window.setInterval(refresh, 10000);
    window.addEventListener(REP_INBOX_EVENT, refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(REP_INBOX_EVENT, refresh);
    };
  }, []);
  // 📝 reps' «تسجيلاتي» waiting for approval (repInbox.ts).
  const [repInboxPending, setRepInboxPending] = useState(0);

  // Small, non-blocking top-of-screen bubbles for background sync results - never window.alert,
  // which would interrupt the user with a modal for something that happened on its own.
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  function pushToast(text: string) {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `toast-${Date.now()}-${Math.random()}`;
    // The same message twice in a row (e.g. a repeated sync) is shown once.
    setToasts((current) => (current.some((toast) => toast.text === text) ? current : [...current, { id, text }]));
  }
  function dismissToast(id: string) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  // Purely local customer bookkeeping (see ledgerStore.ts) - starts empty (matches server render,
  // which never has localStorage) and loads after mount, to avoid a hydration mismatch.
  const [ledgerStore, setLedgerStore] = useState<LedgerByAccount>({});
  useEffect(() => setLedgerStore(loadLedgerStore()), []);
  // Payment photos whose payment was deleted anywhere (statements, device removal) - read from
  // storage itself, never from the not-yet-loaded state.
  useEffect(() => {
    const timer = window.setTimeout(
      () => void pruneOrphanProofs(loadLedgerStore(), [...loadPartyAdjustments().map((a) => a.id), ...loadCardTopUps().map((t) => t.id)]),
      4000,
    );
    return () => window.clearTimeout(timer);
  }, []);
  // Read-only here: the till (for the "اليوم" panel), suppliers and store items (for global search).
  const [supplierStore, setSupplierStore] = useState<SupplierStore>({});
  const [storeItems, setStoreItems] = useState<StoreItemRegistry>({});
  useEffect(() => {
    setSupplierStore(loadSupplierStore());
    setStoreItems(loadStoreItems());
  }, []);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  useEffect(() => setLastBackupAt(getLastBackupAt()), []);
  const [remindersBadgeEnabled, setRemindersBadgeEnabled] = useState(true);
  useEffect(() => setRemindersBadgeEnabled(isRemindersBadgeEnabled()), []);
  const [ledgerAccount, setLedgerAccount] = useState<StarlinkAccountSummary | null>(null);
  // True when the ledger was opened from the floating "+" → دفعة من زبون (starts on "له").
  const [ledgerForPayment, setLedgerForPayment] = useState(false);
  const [statementAccount, setStatementAccount] = useState<StarlinkAccountSummary | null>(null);
  const [editingStatementEntry, setEditingStatementEntry] = useState<LedgerEntry | null>(null);

  function updateLedgerEntries(accountId: string, entries: LedgerEntry[]) {
    markDeviceTouched(accountId); // 🕘 a balance added, edited or removed
    // Every device payment also moves money into الكاش - computed from the current (pre-edit)
    // entries, outside the state updater so it runs exactly once.
    if (shouldAskUnpin(deviceNotes, accountId, getAccountEntries(ledgerStore, accountId), entries)) setUnpinAsk(accountId);
    const deviceName = accounts.find((a) => a.id === accountId)?.name ?? "";
    // ⚡ a «غير مفعّل» device's first charge (عليه) makes it active.
    const target = accounts.find((a) => a.id === accountId);
    if (target?.pendingActivation && entries.filter((e) => e.kind === "debit").length > getAccountEntries(ledgerStore, accountId).filter((e) => e.kind === "debit").length) {
      patchAccount(accountId, markActivated(target, new Date().toISOString()));
    }
    const nextCash = applyLedgerPaymentsToCash(loadCashEntries(), getAccountEntries(ledgerStore, accountId), entries, deviceName);
    saveCashEntries(nextCash);
    setLedgerStore((current) => {
      const next = withAccountEntries(current, accountId, entries);
      saveLedgerStore(next);
      return next;
    });
  }

  // Every ledger entry across every device, flattened - used only to resolve a cross-device
  // payment's own info (e.g. its date) for display in DeviceStatementDialog's linked-payments
  // list, never to compute any one device's own totals.
  const allLedgerEntries = useMemo(() => Object.values(ledgerStore).flat(), [ledgerStore]);

  // Customer registry (see clientStore.ts) - same load-after-mount hydration-safety pattern as
  // the ledger store above. A device/account links here via its own clientId, never the other
  // way around, so this store never references accounts itself.
  const [clientStore, setClientStore] = useState<ClientStore>({});
  useEffect(() => setClientStore(loadClientStore()), []);
  const clients = useMemo(() => listClients(clientStore), [clientStore]);
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  // 👤 A customer tapped in the search: his options (ClientSearchSheet), and the list narrowed to him.
  const [clientMenuId, setClientMenuId] = useState<string | null>(null);
  const [clientFocus, setClientFocus] = useState<string | null>(null);
  const [showClientsOverview, setShowClientsOverview] = useState(false);

  function handleCreateClient(input: CreateClientInput): Client {
    const result = createClient(clientStore, input);
    setClientStore(commitClientStore(clientStore, result.store));
    return result.client;
  }

  function handleUpdateClient(clientId: string, patch: CreateClientInput) {
    setClientStore((current) => {
      return commitClientStore(current, updateClient(current, clientId, patch));
    });
  }

  /** Removes the client record and unlinks every device that pointed at it (back to "الزبون غير
   * محدد") - never touches ledger entries, allocations or exchange-rate snapshots on those
   * devices, which is exactly what patchAccount already guarantees for any other in-place field
   * edit. */
  function handleDeleteClient(clientId: string) {
    for (const account of accounts) {
      if (account.clientId === clientId) patchAccount(account.id, { clientId: undefined });
    }
    setClientStore((current) => {
      return commitClientStore(current, deleteClient(current, clientId));
    });
    setOpenClientId(null);
  }

  // Sales-representative registry (see repStore.ts) - same load-after-mount hydration-safety
  // pattern as the client registry above. A device/account links here via its own
  // representativeId, never the other way around; unlike clients, there is currently no delete-
  // representative flow anywhere in the app, so there's no orphan-on-delete case to handle here.
  const [representativeStore, setRepresentativeStore] = useState<RepresentativeStore>({});
  useEffect(() => setRepresentativeStore(loadRepresentativeStore()), []);
  const representatives = useMemo(() => listRepresentatives(representativeStore), [representativeStore]);
  // 🔒 «زبائنه عنده فقط» (repSeparation.ts): a hidden rep's device shows no customer - its messages
  // go to the rep.
  const hiddenReps = useMemo(() => hiddenRepIds(representativeStore), [representativeStore]);
  const hiddenRepsRef = useRef(hiddenReps);
  hiddenRepsRef.current = hiddenReps;
  const representativeStoreRef = useRef(representativeStore);
  representativeStoreRef.current = representativeStore;
  /** The customer the operator sees on a device (none for a hidden rep's device). */
  const visibleClientOf = (account: { clientId?: string; representativeId?: string }, store: ClientStore = clientStore) =>
    isHiddenRepDevice(account, hiddenRepsRef.current) ? undefined : getClient(store, account.clientId);
  /** Who a device's messages go to: its customer, or its rep when his customers are hidden. */
  const messagePhoneOf = (account: StarlinkAccountSummary, store: ClientStore = clientStore) =>
    isHiddenRepDevice(account, hiddenRepsRef.current)
      ? repContact(account, representativeStoreRef.current)?.phone
      : getClient(store, account.clientId)?.phone ?? account.phone;

  function handleCreateRepresentative(input: CreateRepresentativeInput): Representative {
    const result = createRepresentative(representativeStore, input);
    setRepresentativeStore(result.store);
    saveRepresentativeStore(result.store);
    return result.representative;
  }

  // Currency registry (see currencyStore.ts) - same load-after-mount pattern as the other local
  // stores above. LedgerDialog reads it to prefill/lock exchange rates for shipments and Starlink
  // cost settlements; the Settings page owns its own management UI for it, this is just a reader.
  const [currencyStore, setCurrencyStore] = useState<CurrencyStore>({});
  useEffect(() => setCurrencyStore(loadCurrencyStore()), []);
  // 📱 On a rep's phone: devices with something he recorded that the operator hasn't confirmed.
  const [repPendingIds, setRepPendingIds] = useState<Set<string>>(() => new Set());
  const [repWorkspace, setRepWorkspace] = useState(false);
  const [repPendingCount, setRepPendingCount] = useState(0);
  const [repSent, setRepSent] = useState<RepChangesSent | null>(null);
  const [repSending, setRepSending] = useState(false);

  function handleUpsertCurrency(input: UpsertCurrencyInput) {
    const next = upsertCurrency(currencyStore, input);
    setCurrencyStore(next);
    saveCurrencyStore(next);
    return next[input.code.trim().toUpperCase()];
  }

  // Payment-to-shipment allocations (see paymentAllocationStore.ts) - same load-after-mount
  // pattern, kept per-device exactly like the ledger store itself.
  const [allocationStore, setAllocationStore] = useState<AllocationsByAccount>({});
  useEffect(() => setAllocationStore(loadAllocationStore()), []);

  // Every allocation across every device, flattened - the correct input for any read that must
  // reflect a payment regardless of which device's own ledger it happens to be filed under (see
  // paymentAllocationStore.ts's allStoredAllocations doc comment).
  const allAllocations = useMemo(() => allStoredAllocations(allocationStore), [allocationStore]);

  /** 🛂 His Oct 19 2026 ask: a rep's «توثيق الأجهزة» account carries his devices' «سعر التوثيق»
   * (lib/repTravelLedger.ts). Kept in step whenever devices or operations change - read fresh from
   * storage so a half-loaded screen never moves anything. */
  const [travelInRepLedger, setTravelInRepLedger] = useState<Set<string>>(() => new Set());

  function addAllocationsToAccount(accountId: string, newOnes: PaymentAllocation[]) {
    setAllocationStore((current) => {
      const updated = withAccountAllocations(current, accountId, addAllocations(getAccountAllocations(current, accountId), newOnes));
      saveAllocationStore(updated);
      return updated;
    });
  }

  function removeAllocationsEverywhere(entryId: string) {
    setAllocationStore((current) => {
      const updated = removeAllocationsForEntryFromStore(current, entryId);
      saveAllocationStore(updated);
      return updated;
    });
  }

  // 🔄 «مزامنة الآن»: the operator picks today / 3 / 7 / 10 / 20 days / all, then each device's own
  // browser opens and runs «مزامنة» by itself (AccountBrowserActivity's auto-sync), one after another.
  // The queue is kept in starnet.syncQueue; each time the app comes back from a browser this bar
  // shows the next device with a short countdown and «إيقاف».
  const [syncChoiceOpen, setSyncChoiceOpen] = useState(false);
  const [queueStep, setQueueStep] = useState<{ label: string; progress: string; name: string; secondsLeft: number } | null>(null);
  // 🟩 The run's live line on the right edge (lib/syncRun.ts) - instead of one bubble per device.
  const [syncRun, setSyncRun] = useState<SyncRun | null>(null);
  const syncRunRef = useRef<SyncRun | null>(null);
  const [runNow, setRunNow] = useState(() => Date.now());

  function commitRun(next: SyncRun | null) {
    syncRunRef.current = next;
    saveSyncRun(next);
    setSyncRun(next);
  }

  /** The run on the phone, changed by `change` (nothing when there is none). */
  function updateRun(change: (run: SyncRun) => SyncRun) {
    const run = syncRunRef.current ?? loadSyncRun();
    if (run) commitRun(change(run));
  }

  function beginRun(ids: string[], label: string, mode: SyncRun["mode"]) {
    const devices = ids.map((id) => ({ id, name: accountsRef.current.find((a) => a.id === id)?.name ?? "جهاز" }));
    commitRun(startRun(devices, label, mode));
  }
  const QUEUE_COUNTDOWN_S = QUEUE_GAP_SECONDS;

  function handleSyncNow() {
    setSyncChoiceOpen(true);
  }

  /** The bot message (owner's Telegram) and a toast - the run's report or a sign-in alert. */
  function reportSync(text: string, route: string = HOME_ROUTE) {
    if (isTelegramConnected()) void sendTelegramText(text);
    void notifyPhone(text, route);
    pushToast(text.split("\n")[0]!);
  }

  async function refreshSyncQueue() {
    // How the devices' auto-syncs ended since last time (signed out, stuck, done...).
    // 🛂 A «كشف توثيق» in the background takes its own devices' outcomes first.
    const taken = await takeAutoSyncResults();
    if (taken.length > 0) updateRun((run) => withOutcomes(run, taken));
    // 🔍 A circle's check sees every outcome of its devices (they also go on to the queue below).
    const ringRun = loadRingCheck();
    if (ringRun) {
      const ring = absorbRingResults(ringRun, taken, Date.now());
      saveRingCheck(ring.run);
      if (ring.finished) finishRingCheck(ring.finished);
    }
    const absorbed = absorbTravelResults(loadTravelBgRun(), taken);
    saveTravelBgRun(absorbed.run);
    if (absorbed.finished) showTravelBgResult(absorbed.finished);
    const records = absorbed.rest;
    let queue = loadSyncQueue();
    if (!queue) {
      setQueueStep(null);
      // A single card's «تحديث من Starlink» that couldn't sync: say why.
      const run = syncRunRef.current;
      for (const record of records) {
        if (record.outcome === "ok") continue;
        // 🟩 A tracked run's device: its line shows it.
        if (run && run.ids.includes(record.accountId)) continue;
        const name = accountsRef.current.find((a) => a.id === record.accountId)?.name ?? "";
        pushToast(`${name}: ${outcomeLabel(record.outcome)}`);
      }
      return;
    }
    const applied = applyOutcomes(queue, records);
    queue = applied.queue;
    saveSyncQueue(queue);
    // ⏸ Starlink said «429 Too many requests»: the run stops here - opening more would only extend it.
    if (applied.rateLimited) {
      saveSyncQueue(null);
      setQueueStep(null);
      updateRun((run) => endRun(run));
      // queue.index = the devices already opened (it moves on before each one opens).
      if (queue.travelCheck) finishTravelCheck(queue, queue.ids.slice(0, Math.min(queue.index, queue.ids.length)));
      else reportSync(buildSyncReport(queue, accountsRef.current, true));
      flushRingCheck();
      pushToast(RATE_LIMIT_NOTE);
      // 🔁 «إكمال بعد 429»: the rest syncs by itself in the background once the 20 minutes are over.
      const left = devicesLeftAfterRateLimit(queue)
        .map((id) => accountsRef.current.find((a) => a.id === id))
        .filter((a): a is StarlinkAccountSummary => Boolean(a));
      const minutes = await scheduleSyncRetry(left, queue.label, queue.travelCheck === true);
      if (minutes > 0) pushToast(`🔁 سأكمل ${left.length} جهاز وحدي بعد ${minutes} دقيقة (في الخلفية)`);
      return;
    }
    for (const id of applied.newlySignedOut) {
      const account = accountsRef.current.find((a) => a.id === id);
      reportSync(signedOutAlert(account), deviceRoute(account?.name ?? ""));
    }
    const next = nextQueuedAccount(queue, accountsRef.current);
    if (!next) {
      saveSyncQueue(null);
      setQueueStep(null);
      updateRun((run) => endRun(run));
      if (queue.travelCheck) finishTravelCheck(queue, queue.ids);
      else reportSync(buildSyncReport({ ...queue, index: queue.ids.length }, accountsRef.current));
      // A device deleted meanwhile never gets an outcome - the circle reports without it.
      flushRingCheck();
      return;
    }
    setQueueStep({ label: queue.label, progress: queueProgressLabel(queue, next.index), name: next.account.name, secondsLeft: QUEUE_COUNTDOWN_S });
  }

  async function runNextQueued() {
    const queue = loadSyncQueue();
    if (!queue) {
      setQueueStep(null);
      return;
    }
    const next = nextQueuedAccount(queue, accountsRef.current);
    if (!next) {
      void refreshSyncQueue();
      return;
    }
    // Moved on before opening, so coming back (done or closed by hand) continues with the next one.
    saveSyncQueue({ ...queue, index: next.index + 1 });
    setQueueStep(null);
    updateRun((run) => withCurrent(run, next.account.id));
    const result = await openAutoSync(next.account, `${queue.label} · ${queueProgressLabel(queue, next.index)}`, queue.travelCheck === true);
    if (!result.ok) {
      saveSyncQueue(null);
      updateRun((run) => endRun(run));
      pushToast(result.message);
    }
  }

  /** 🌙 The operator chose the background sync (settings): the devices are read without opening
   * their pages. Returns false when it can't run (permission missing) - the visible run is used. */
  async function trySyncInBackground(ids: string[], label: string, travelCheck = false, force = false): Promise<boolean> {
    // `force`: a circle's «🌙 فحص في الخلفية» - background whatever the setting.
    if (!force && !isBackgroundSyncEnabled()) return false;
    // 🔑 A rep's phone syncs in the background only when the operator gave him that.
    if (!repCan("sync:background")) return false;
    const list = ids
      .map((id) => accountsRef.current.find((a) => a.id === id))
      .filter((a): a is StarlinkAccountSummary => Boolean(a))
      .map((a) => ({ id: a.id, name: a.name }));
    if (await startBackgroundSync(list, label, travelCheck)) {
      beginRun(list.map((a) => a.id), label, "background");
      if (travelCheck) {
        // Remembered so the app shows the result (with the WhatsApp buttons) when it comes back.
        const earlier = loadTravelBgRun();
        const listIds = list.map((a) => a.id);
        saveTravelBgRun(
          earlier
            ? { ...earlier, label, ids: [...new Set([...earlier.ids, ...listIds])], results: Object.fromEntries(Object.entries(earlier.results).filter(([id]) => !listIds.includes(id))) }
            : { label, ids: listIds, results: {}, startedAt: new Date().toISOString() },
        );
        pushToast(`🌙 بدأ «🛂 كشف التوثيق» في الخلفية (${list.length} جهاز) - تابعه في الإشعار، والنتيجة في البوت وهنا`);
      } else {
        pushToast(`🌙 بدأت المزامنة في الخلفية (${list.length} جهاز) - تابعها على الخط الأخضر يمين الشاشة`);
      }
      return true;
    }
    pushToast(`⚠️ اسمح بـ«الظهور فوق التطبيقات» من الإعدادات لتعمل ${travelCheck ? "«كشف التوثيق»" : "المزامنة"} في الخلفية - تعمل الآن بالطريقة العادية`);
    return false;
  }

  function startSyncRun(window: SyncWindow) {
    setSyncChoiceOpen(false);
    const queue = startSyncQueue(accountsRef.current, window, localToday());
    if (!queue) {
      pushToast("لا توجد أجهزة في هذا الاختيار");
      return;
    }
    void trySyncInBackground(queue.ids, queue.label).then((background) => {
      if (!background) startVisibleRun(queue);
    });
  }

  function startVisibleRun(queue: NonNullable<ReturnType<typeof loadSyncQueue>>) {
    // Results of earlier single syncs aren't this run's.
    beginRun(queue.ids, queue.label, "visible");
    void takeAutoSyncResults().then(() => {
      saveSyncQueue(queue);
      void runNextQueued();
    });
  }

  // 📅 Long press on a calendar day: that day's actions (DayActionsSheet).
  const [longPressDay, setLongPressDay] = useState<number | null>(null);
  /** 🛂 The last «كشف توثيق» result, shown in the app (and sent to the bot when connected). */
  const [travelResult, setTravelResult] = useState<{ label: string; ids: string[]; skipped: number; checked?: boolean } | null>(null);

  // 🔍 Long press on a home circle: its check (RingActionsSheet, lib/deviceRings.ts).
  const [ringMenu, setRingMenu] = useState<{ kind: StatFilterKind | "all"; label: string; repId?: string } | null>(null);

  function ringMembers(kind: StatFilterKind | "all", repId?: string): StarlinkAccountSummary[] {
    const list = activeAccountsRef.current;
    if (kind === "all") return list;
    const out = list.filter((a) => matchesStatFilter(a, kind));
    switch (kind) {
      case "noClient":
        return out.filter((a) => matchesNoClientGroup(a, clientStore, "all"));
      case "pinned":
        return pinnedDevices(loadDeviceNotes(), out);
      case "recent":
        return recentDevices(out, ledgerStore, recentLog);
      case "renewed":
        return out.filter((a) => renewedToday.has(a.id));
      case "duplicate":
        return out.filter((a) => deviceTwinMap.has(a.id));
      case "rep":
        return out.filter((a) => a.representativeId === repId);
      default:
        return out;
    }
  }

  async function runRingCheck(kind: StatFilterKind | "all", label: string, repId: string | undefined, background: boolean) {
    setRingMenu(null);
    // A faulty device or a limited email syncs only from its own choice - here, the «المعطلة» circle.
    const members = ringMembers(kind, repId).filter((a) => kind === "faulty" || !syncedOnlyByCommand(a));
    if (members.length === 0) {
      pushToast("لا أجهزة للفحص هنا (المعطلة والإيميل غير الرئيسي بأمرهما فقط)");
      return;
    }
    const ids = members.map((a) => a.id);
    const runLabel = `🔍 ${label}`;
    // 🛂 «تحتاج توثيق»: the travel check itself (Home only) - it has its own report.
    const travel = kind === "travel";
    if (!travel) {
      const question = ringQuestion(kind, label);
      saveRingCheck({ kind, label, ids, before: Object.fromEntries(members.map((a) => [a.id, question.test(a)])), results: {}, startedAt: Date.now() });
    }
    if (background && (await trySyncInBackground(ids, runLabel, travel, true))) return;
    const queue = syncQueueFor(ids, runLabel, travel);
    if (queue) startVisibleRun(queue);
  }

  /** 👤 The customer's devices, as the home list keeps them. */
  function clientDevices(clientId: string): StarlinkAccountSummary[] {
    return activeAccountsRef.current.filter((a) => a.clientId === clientId);
  }

  /** 👤 «عرض أجهزته» / «المنتهية فقط»: the list narrowed to him (the search is cleared). */
  function focusClient(clientId: string, expiredOnly: boolean) {
    setClientMenuId(null);
    setQuery("");
    setSelectedDay(null);
    setFaultFilter(null);
    setStatFilter(expiredOnly ? "expired" : null);
    setClientFocus(clientId);
    window.setTimeout(() => document.querySelector(".accounts-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  /** 👤 «تحديث أجهزته»: his devices one by one in their browsers, or in the background. */
  async function syncClient(clientId: string, background: boolean) {
    setClientMenuId(null);
    const ids = clientDevices(clientId).filter((a) => !syncedOnlyByCommand(a)).map((a) => a.id);
    if (ids.length === 0) {
      pushToast("لا أجهزة لتحديثها (المعطّلة والإيميل غير الرئيسي بأمرهما فقط)");
      return;
    }
    const label = `👤 ${getClient(clientStore, clientId)?.name ?? "زبون"}`;
    if (background && (await trySyncInBackground(ids, label, false, true))) return;
    const queue = syncQueueFor(ids, label);
    if (queue) startVisibleRun(queue);
  }

  /** 🔍 A circle's check ended: its own report (bot, notification, toast), then its list. */
  function finishRingCheck(run: RingCheckRun) {
    window.setTimeout(() => {
      const question = ringQuestion(run.kind, run.label);
      const report = ringCheckReport(question, run.ids, run.before, accountsRef.current, run.results);
      if (isTelegramConnected()) void sendTelegramText(report.text);
      void notifyPhone(report.text.split("\n").slice(0, 3).join(" · "), HOME_ROUTE);
      pushToast(report.text.split("\n").slice(0, 2).join(" · "));
    }, 2500);
  }

  /** The visible run stopped early (by hand, 429): its circle reports what it has. */
  function flushRingCheck() {
    const run = loadRingCheck();
    if (!run) return;
    saveRingCheck(null);
    if (Object.keys(run.results).length > 0) finishRingCheck(run);
  }

  /** 🔗 «مكرر» → «دمج كل المكرر»: each pair merged into the device kept (lib/deviceRings.ts). */
  function mergeAllDuplicates() {
    setRingMenu(null);
    const pairs = duplicatePairs(deviceTwinMap, activeAccounts, ledgerStore);
    if (pairs.length === 0) return;
    const lines = pairs.slice(0, 15).map((p) => `• «${p.drop.name}» ← في «${p.keep.name}»`).join("\n");
    if (!window.confirm(`دمج ${pairs.length} جهاز مكرر؟\n\n${lines}${pairs.length > 15 ? "\n…" : ""}\n\nكل عمليات المكرر تنتقل للجهاز الباقي، والمكرر يذهب للسلة (يمكن استرجاعه).`)) return;
    // One at a time, each on the store the previous one left.
    let ledger = ledgerStore;
    let allocations = allocationStore;
    let debts = previousDebts;
    let notes = loadDeviceNotes();
    let moved = 0;
    for (const { keep, drop } of pairs) {
      const result = mergeDevices({ keep, drop, ledger, allocations, previousDebts: debts });
      ledger = result.ledger;
      allocations = result.allocations;
      debts = result.previousDebts;
      moved += result.movedEntries;
      if (Object.keys(result.keepPatch).length > 0) patchAccount(keep.id, result.keepPatch);
      patchAccount(drop.id, { deletedAt: new Date().toISOString() });
      notes = mergeDeviceNotes(notes, drop.id, keep.id);
    }
    saveLedgerStore(ledger);
    setLedgerStore(ledger);
    saveAllocationStore(allocations);
    setAllocationStore(allocations);
    savePreviousDebts(debts);
    setPreviousDebts(debts);
    commitDeviceNotes(notes);
    if (statFilter === "duplicate") setStatFilter(null);
    pushToast(`🔗 دُمج ${pairs.length} جهاز مكرر${moved ? ` - انتقلت ${moved} عملية` : ""}، والمكررات في السلة`);
  }

  function syncDay(day: number, owner: DayOwner = "all", ownerLabel = "") {
    setLongPressDay(null);
    // A faulty device or a limited email is synced only from its own «مزامنة الآن» choice.
    const ids = accountsOfOwner(accountsForDay(activeAccountsRef.current, day), owner).filter((a) => !syncedOnlyByCommand(a)).map((a) => a.id);
    const queue = syncQueueFor(ids, `يوم ${day}${ownerLabel ? ` · ${ownerLabel}` : ""}`);
    if (!queue) pushToast("لا أجهزة للمزامنة في هذا اليوم (المعطلة والإيميل غير الرئيسي بأمر فقط)");
    if (!queue) return;
    void trySyncInBackground(queue.ids, queue.label).then((background) => {
      if (!background) startVisibleRun(queue);
    });
  }

  /** ✅ «تم التوثيق»: ⏳ until an update confirms (the device stays in the list); its rep hears it
   * on his bot at once (his choice). */
  function handleTravelDone(account: StarlinkAccountSummary) {
    patchAccount(account.id, markTravelDone(account));
    if (!account.representativeId) {
      pushToast(`⏳ «${account.name}» - اضغط «🔄 تحقق الآن» ليتأكد التحديث`);
      return;
    }
    void sendRepText(account.representativeId, travelDoneRepMessage(account)).then((sent) =>
      pushToast(sent ? `✅ «${account.name}» وُثّق - وصل الإشعار لمندوبه` : `✅ «${account.name}» وُثّق (المندوب غير مربوط بالبوت)`),
    );
  }

  /** 💰 «سعر التوثيق» saved / removed: the price on the device AND its debt on the device's owner
   * (his Oct 9 request), then «💬 أرسل له كشفه». */
  function handleTravelPrice(account: StarlinkAccountSummary, amount: number | null, currency: string, currencyConfirmed: boolean) {
    // A rep's device locks that rep and his travel percent on the price (lib/travelBook.ts).
    const patch = { travelRegistrationPrice: lockTravelPrice(account, setTravelPrice(amount, currency).travelRegistrationPrice ?? null, representativeStore) };
    const result = applyTravelFee(getAccountEntries(ledgerStore, account.id), { ...account, ...patch }, localToday());
    if (result.dates.length > 0 && !confirmClosedMonthChange(result.dates)) return;
    patchAccount(account.id, patch);
    if (result.change === "none") return;
    const entries = currencyConfirmed && result.entry
      ? result.entries.map((e) => (e.id === result.entry!.id ? { ...e, currencyConfirmed: true } : e))
      : result.entries;
    setLedgerStore((current) => {
      const next = withAccountEntries(current, account.id, entries);
      saveLedgerStore(next);
      return next;
    });
    if (result.change === "removed") {
      pushToast(`🗑 حُذف سعر التوثيق ودينه من كشف «${account.name}»`);
      return;
    }
    const price = `${formatAmount(result.entry!.amount)} ${LEDGER_CURRENCY_LABELS[result.entry!.currency]}`;
    setTravelFeeSent({ accountId: account.id, text: result.change === "added" ? `🧾 سُجّل عليه ${price} (🛂 توثيق السفر)` : `🧾 عُدّل دين التوثيق إلى ${price}` });
  }

  /** ⚙️ A rep's travel percent: kept on him for new prices, and locked now on his priced devices
   * that have none yet (the locked ones keep theirs). */
  function handleRepTravelPercent(repId: string, percent: number | undefined) {
    const next = setRepTravelPercent(representativeStore, repId, percent);
    setRepresentativeStore(next);
    saveRepresentativeStore(next);
    if (percent === undefined) return;
    const patches = lockRepTravelPercent(accountsRef.current, repId, percent);
    for (const { id, patch } of patches) patchAccount(id, patch);
    pushToast(`⚙️ نسبة التوثيق ${percent}% لـ«${next[repId]?.name ?? "المندوب"}»${patches.length ? ` - ثُبّتت على ${patches.length} جهاز` : ""}`);
  }

  /** 🧾 Prices saved before a price became a debt: post their debts now (one tap, his choice to make). */
  function postOldTravelDebts() {
    const today = localToday();
    if (!confirmClosedMonthChange([today])) return;
    let next = ledgerStore;
    let count = 0;
    for (const account of accountsRef.current) {
      if (!isTravelVerified(account) || !travelStateOf(account, next, allAllocations, travelInRepLedger).noDebt) continue;
      const result = applyTravelFee(getAccountEntries(next, account.id), account, today);
      if (result.change !== "added") continue;
      next = withAccountEntries(next, account.id, result.entries);
      count += 1;
    }
    if (count > 0) {
      saveLedgerStore(next);
      setLedgerStore(next);
    }
    pushToast(count ? `🧾 سُجّل دين التوثيق على ${count} جهاز - في كشف كل صاحب جهاز` : "لا أجهزة بلا دين");
  }

  /** 🛂 The «كشف توثيق» run ended: ONE bot message with the devices that need it. Waits a moment
   * so the last device's read (drained on resume) is on the device first. */
  function finishTravelCheck(queue: NonNullable<ReturnType<typeof loadSyncQueue>>, ids: string[]) {
    window.setTimeout(() => {
      // Home never answered (signed out, stuck, closed, page never loaded): «لم يُفحص», never «لا يحتاج».
      const skipped = travelUncheckedCount(ids, queue.results);
      const report = buildTravelCheckReport(queue.label, ids, accountsRef.current, (account) => messagePhoneOf(account, clientStoreRef.current), skipped);
      if (isTelegramConnected()) void sendTelegramText(report.text, report.replyMarkup);
      setTravelResult({ label: queue.label, ids, skipped });
      void notifyPhone(report.text.split("\n").slice(0, 2).join(" · "), HOME_ROUTE);
      pushToast(report.found ? `🛂 ${report.found} جهاز يحتاج توثيق` : "🛂 كشف التوثيق: لا جهاز يحتاج توثيقًا");
    }, 2500);
  }

  /** 🌙 A background «كشف توثيق» ended: the bot and the notification already have its report
   * (native), so the app only shows it with its WhatsApp buttons - once its reads are drained. */
  function showTravelBgResult(run: TravelBgRun) {
    window.setTimeout(() => {
      const skipped = travelUncheckedCount(run.ids, run.results);
      const found = run.ids.filter((id) => {
        const account = accountsRef.current.find((a) => a.id === id);
        return account && needsTravelRegistration(account);
      }).length;
      setTravelResult({ label: run.label, ids: run.ids, skipped });
      pushToast(`🛂 انتهى كشف التوثيق في الخلفية: ${found ? `${found} جهاز يحتاج توثيق` : "لا جهاز يحتاج توثيقًا"}${skipped ? ` · لم يُفحص ${skipped}` : ""}`);
    }, 2500);
  }

  /** 🛂 «كشف توثيق» of every device (his request): all but the faulty ones (المتعطلة / المحروقة…)
   * and the non-main emails - the same devices as «🔄 مزامنة الآن ← كل الأجهزة». */
  function travelCheckAll() {
    setSyncChoiceOpen(false);
    travelCheckIds(pickSyncAccounts(accountsRef.current, { kind: "all" }, localToday()).map((a) => a.id), "كل الأجهزة");
  }

  /** 🛂 «كشف توثيق» of a calendar day: each device's Home only, one by one, nothing else changes. */
  function travelCheckDay(day: number, owner: DayOwner = "all", ownerLabel = "") {
    setLongPressDay(null);
    const ids = accountsOfOwner(accountsForDay(activeAccountsRef.current, day), owner).filter((a) => !a.deviceFault).map((a) => a.id);
    travelCheckIds(ids, `يوم ${day}${ownerLabel ? ` · ${ownerLabel}` : ""}`);
  }

  /** 🛂 Reads these devices' Home only, one by one (a day, or one card's «🔄 تحقق الآن»). */
  function travelCheckIds(ids: string[], label: string) {
    const queue = syncQueueFor(ids, label, true);
    if (!queue) {
      pushToast("لا أجهزة للكشف");
      return;
    }
    // 🌙 With «المزامنة في الخلفية» on: the same Home-only check, without opening the pages.
    void trySyncInBackground(queue.ids, label, true).then((background) => {
      if (!background) startVisibleRun(queue);
    });
  }

  function stopSyncRun() {
    const queue = loadSyncQueue();
    saveSyncQueue(null);
    setQueueStep(null);
    flushRingCheck();
    if (queue?.travelCheck) {
      if (queue.index > 0) finishTravelCheck(queue, queue.ids.slice(0, queue.index));
      else pushToast("⏹ أُوقف كشف التوثيق");
      return;
    }
    if (queue && queue.index > 0) reportSync(buildSyncReport(queue, accountsRef.current, true));
    else pushToast("⏹ أُوقفت المزامنة");
  }

  useEffect(() => {
    if (!queueStep) return;
    if (queueStep.secondsLeft <= 0) {
      void runNextQueued();
      return;
    }
    const timer = setTimeout(() => setQueueStep((step) => (step ? { ...step, secondsLeft: step.secondsLeft - 1 } : step)), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueStep]);

  useEffect(() => {
    if (!isRunningInAndroidApp()) return;
    let cancelled = false;
    let handle: { remove: () => void } | undefined;
    const check = () => void accountsReadyGateRef.current.whenReady().then(() => {
      if (!cancelled) void refreshSyncQueue();
    });
    check();
    App.addListener("resume", check).then((h) => {
      if (cancelled) h.remove();
      else handle = h;
    });
    return () => {
      cancelled = true;
      handle?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Starts empty (the server-rendered output too, so no hydration mismatch) until his devices load
  // right after mount - never the 5 sample devices, which showed on a slow phone as if his data
  // were gone (his Oct 20 2026 report), and could be tapped by mistake.
  const [accounts, setAccounts] = useState<StarlinkAccountSummary[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  // 🖥️ The Windows app (desktop/): its first-run card.
  const [desktop, setDesktop] = useState(false);
  useEffect(() => setDesktop(isDesktopApp()), []);
  // 👆 A banner that has just appeared pushes the screen down under his finger: a tap in its first
  // moment was meant for what was there before (his Oct 20 2026 report - a search / «إزالة الدين»
  // tap on a slow phone opened «ستارلينك والبطاقة»).
  const bannerShownAt = useRef<Record<string, number>>({});
  const ignoreFreshTap = (id: string) => (event: ReactMouseEvent) => {
    if (Date.now() - (bannerShownAt.current[id] ?? 0) < FRESH_BANNER_MS) event.preventDefault();
  };
  useEffect(() => {
    const rep = isRepWorkspace();
    setRepWorkspace(rep);
    if (rep) {
      const pending = currentRepPending();
      setRepPendingIds(pending.accountIds);
      setRepPendingCount(pending.count);
      setRepSent(loadRepChangesSent());
    }
  }, [accounts, ledgerStore]);
  // 🚨 وضع المحيط: devices with the maritime switch ON. The full-screen alarm comes back on every
  // app open, and for any device that newly turns ON, until Starlink reads it OFF.
  const oceanDevices = useMemo(() => oceanModeAccounts(accounts), [accounts]);
  const [oceanDismissed, setOceanDismissed] = useState<string[]>([]);
  const oceanShown = oceanDevices.some((a) => !oceanDismissed.includes(a.id));
  useEffect(() => {
    const { send, keep } = oceanAlertsToSend(accounts, loadOceanAlerted());
    if (send.length === 0) {
      saveOceanAlerted(keep);
      return;
    }
    if (!isTelegramConnected()) return;
    void sendTelegramText(oceanTelegramText(send)).then((sent) => {
      if (sent) saveOceanAlerted(keep);
    });
  }, [accounts]);
  // ⚠️ باقة الأولوية: one Telegram alert per device when its priority data (e.g. 100 GB) runs out.
  useEffect(() => {
    const { send, keep } = priorityAlertsToSend(accounts, loadPriorityAlerted());
    if (send.length === 0) {
      savePriorityAlerted(keep);
      return;
    }
    if (!isTelegramConnected()) return;
    void sendTelegramText(priorityTelegramText(send)).then((sent) => {
      if (sent) savePriorityAlerted(keep);
    });
  }, [accounts]);
  const [dataState, setDataState] = useState<DataState>("demo");
  useEffect(() => {
    if (dataState !== "loaded") return;
    const book = loadRepLedgerBook();
    const synced = syncRepTravelLedgers(accounts, loadLedgerStore(), book, allStoredAllocations(loadAllocationStore()), localToday());
    if (synced.changed) {
      saveRepLedgerBook(synced.book);
      saveLedgerStore(synced.ledger);
      setLedgerStore(synced.ledger);
    }
    setTravelInRepLedger(travelLedgerKeys(synced.book));
  }, [accounts, ledgerStore, allocationStore, dataState]);
  const [errorMessage, setErrorMessage] = useState("");

  // Kept current for the Starlink-sync listener below, which is registered once on mount and
  // must never act on a stale snapshot of either value from that first render.
  const accountsRef = useRef(accounts);
  // ⏳ Each charge waiting for its invoice gets its background checks (from storage, never the empty first state).
  useEffect(() => {
    void syncBillChecks(loadLedgerStore(), accountsRef.current);
  }, [ledgerStore]);
  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);
  const clientStoreRef = useRef(clientStore);
  useEffect(() => {
    clientStoreRef.current = clientStore;
  }, [clientStore]);
  const dataStateRef = useRef(dataState);
  useEffect(() => {
    dataStateRef.current = dataState;
  }, [dataState]);
  // A rep's approved ✏️ edit / 📝 note (repMenuRecords.ts) changed the stored devices or customers.
  useEffect(() => {
    const reload = () => {
      setClientStore(loadClientStore());
      // A rep's «تسجيلاتي» (repChangesApply.ts) also adds operations.
      setLedgerStore(loadLedgerStore());
      setAllocationStore(loadAllocationStore());
      if (dataStateRef.current === "demo") setAccounts(loadDemoAccounts(demoAccounts));
    };
    window.addEventListener(ACCOUNTS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(ACCOUNTS_CHANGED_EVENT, reload);
  }, []);

  // "فحص جلسات الدخول" results (see settings) - a device found signed out gets a small "sign in"
  // bubble on its card. Whenever the app comes back to the front (typically right after signing
  // in through that bubble), only those flagged devices are checked again, so the bubble clears
  // by itself once the login worked.
  const [sessionResults, setSessionResults] = useState<SessionCheckResults>({});
  const sessionResultsRef = useRef(sessionResults);
  const recheckingSessionsRef = useRef(false);
  function updateSessionResults(next: SessionCheckResults) {
    sessionResultsRef.current = next;
    setSessionResults(next);
    saveSessionCheckResults(next);
  }
  useEffect(() => {
    const initial = loadSessionCheckResults();
    sessionResultsRef.current = initial;
    setSessionResults(initial);

    async function recheckFlagged() {
      if (recheckingSessionsRef.current || !isRunningInAndroidApp()) return;
      recheckingSessionsRef.current = true;
      try {
        const latest = loadSessionCheckResults();
        sessionResultsRef.current = latest;
        setSessionResults(latest);
        const flagged = accountIdsNeedingLogin(latest, accountsRef.current.map((a) => a.id));
        for (const id of flagged) {
          const status = await checkAccountSession(id);
          if (status === "unknown") continue; // offline or unclear - keep the bubble until sure
          updateSessionResults(withSessionStatus(sessionResultsRef.current, id, status));
        }
      } finally {
        recheckingSessionsRef.current = false;
      }
    }

    let resumeHandle: { remove: () => void } | undefined;
    let cancelled = false;
    App.addListener("resume", () => {
      void recheckFlagged();
    }).then((h) => {
      if (cancelled) h.remove();
      else resumeHandle = h;
    });
    return () => {
      cancelled = true;
      resumeHandle?.remove();
    };
  }, []);

  // Not ready until the initial account load (demo-from-localStorage or real-from-API) has
  // actually landed in `accounts`/accountsRef - see the Starlink-sync listener effect below for
  // why a pending-sync drain must never run before this, on pain of a real account like "mounay"
  // looking nonexistent (and its sync result being silently discarded) just because the load
  // hadn't finished yet.
  const accountsReadyGateRef = useRef(createReadyGate());

  async function loadRealAccounts() {
    setDataState("loading");
    setErrorMessage("");
    try {
      const real = await listAccounts(query || undefined);
      // Re-apply any previously-synced fields this device has cached for these accounts (see
      // syncedFieldsCache.ts) - without this, a successful Stage-1 sync would vanish the moment
      // this fetch runs again, since services/api has nothing written back to it for this feature.
      const loaded = reapplyCachedSyncedFields(real, getCachedSyncedFields);
      // Update the refs SYNCHRONOUSLY, before markReady() - setAccounts()/setDataState() only
      // schedule a re-render, they don't update accountsRef/dataStateRef until React's own
      // render -> effect cycle catches up later. markReady() resolves its promise immediately
      // (a microtask), which can run before that cycle completes - so anything awaiting the gate
      // must see the real, just-loaded accounts and dataState right away, not a render-cycle
      // behind. Never in a `finally` and never on failure: with no confirmed real account list,
      // there is nothing safe to drain a pending sync against yet (see the branches below).
      accountsRef.current = loaded;
      dataStateRef.current = "loaded";
      setAccounts(loaded);
      setDataState("loaded");
      setAccountsLoaded(true);
      accountsReadyGateRef.current.markReady();
      // 🔔 A wallet / الكاش below the floor he set: the phone is told (once per crossing).
      try {
        runBalanceAlerts(loaded, (text) => void notifyPhone(text, "/money"));
      } catch {
        // never in the way of the home screen
      }
    } catch (err) {
      setDataState("error");
      setErrorMessage(err instanceof ApiError ? err.message : "تعذّر تحميل الحسابات");
      // Deliberately no markReady() here: any pending sync result stays queued in
      // PendingSyncStore, never merged or acked, until a real load succeeds - including a later
      // "إعادة المحاولة" tap of this same function, whose success path above still opens the gate.
    }
  }

  useEffect(() => {
    if (isDemoMode()) {
      const loaded = loadDemoAccounts(demoAccounts);
      // Same synchronous-before-markReady() ordering as loadRealAccounts() above.
      accountsRef.current = loaded;
      dataStateRef.current = "demo";
      setAccounts(loaded);
      setDataState("demo");
      setAccountsLoaded(true);
      accountsReadyGateRef.current.markReady();
      return;
    }
    if (!isLoggedIn()) {
      setDataState("error");
      setErrorMessage("تم إعداد عنوان الخادم لكن لم يتم تسجيل الدخول بعد - افتح الإعدادات لتسجيل الدخول");
      // No markReady() here either - same reasoning as loadRealAccounts()' catch branch: there is
      // no real account list yet, so guessing would risk exactly the "mounay looks deleted" bug.
      return;
    }
    loadRealAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stage 1 of on-device Starlink sync. "تحديث من Starlink" persists its result in Android
  // SharedPreferences (packages/local-browser-plugin's PendingSyncStore) BEFORE
  // AccountBrowserActivity shows its own success toast, precisely because THIS Activity/Bridge
  // can be stopped at that moment - AccountBrowserActivity is a separate Activity on top of it,
  // and a live accountDataSynced event fired while stopped is simply dropped by Capacitor, with
  // no error and no retry. The live listener below is only a best-effort fast path for when the
  // app happens to be in the foreground; listPendingAccountSyncs - drained once on mount and
  // again on every native "resume" - is what actually guarantees a result is never lost, however
  // long the app stayed backgrounded. Both paths funnel through applyBatch, which first awaits
  // accountsReadyGateRef so it never runs against a not-yet-loaded `accounts` (see that ref's own
  // comment). A batch is only ever acknowledged after it has been merged AND saved, never before;
  // processedSyncIds (kept for this listener's whole lifetime, not just one batch) guarantees the
  // same syncId is never merged or messaged twice, whether it reached this effect live, via a
  // drain, or both - while unackedSyncIds tracks results that ARE already merged/messaged but
  // whose native ack hasn't been confirmed yet, so a failed ack is retried (without ever
  // re-merging or re-alerting) instead of being silently forgotten.
  useEffect(() => {
    let liveHandle: { remove: () => void } | undefined;
    let resumeHandle: { remove: () => void } | undefined;
    let cancelled = false;
    const processedSyncIds = new Set<string>();
    const unackedSyncIds = new Set<string>();

    async function retryAcks() {
      if (unackedSyncIds.size === 0) return;
      const ids = Array.from(unackedSyncIds);
      const acked = await ackPendingAccountSyncs(ids);
      if (acked) {
        for (const id of ids) unackedSyncIds.delete(id);
      }
      // A false result leaves every id in `unackedSyncIds` for the next retryAcks() call -
      // already merged/messaged, never re-applied, just not yet confirmed discarded natively.
    }

    async function applyBatch(batch: PendingSyncLike[]) {
      await accountsReadyGateRef.current.whenReady();

      // 📌 The device browser's «تثبيت - لم يُسجَّل الشحن بعد» tab: a pin + note, never a Starlink read.
      const browserPins = batch.filter((sync) => isBrowserPin(sync) && !processedSyncIds.has(sync.syncId));
      // ⏳ «شحن بانتظار الفاتورة»: the customer's price typed there - the charge is recorded with its D
      // waiting for the invoice (lib/awaitingBill.ts); pinned instead only when it can't be.
      const pins = browserPins.filter((sync) => !sync.fields.pinRequest?.charge);
      const charges = browserPins.filter((sync) => sync.fields.pinRequest?.charge);
      if (charges.length > 0) {
        let ledger = loadLedgerStore();
        const currencies = loadCurrencyStore();
        const done: string[] = [];
        const messages: string[] = [];
        for (const sync of charges) {
          const request = sync.fields.pinRequest!;
          const account = accountsRef.current.find((a) => a.id === sync.accountId && !a.deletedAt);
          if (!account) {
            done.push(sync.syncId);
            continue;
          }
          // Same id for the same staged charge: a drain after a restart never records it twice.
          const entryId = `browser-charge-${sync.syncId}`;
          if (getAccountEntries(ledger, account.id).some((e) => e.id === entryId)) {
            done.push(sync.syncId);
            continue;
          }
          const rep = getRepresentative(representativeStoreRef.current, shipmentRepId(account, getClient(clientStoreRef.current, account.clientId)));
          const built = buildAwaitingCharge({
            amount: Number(request.charge!.amount),
            currency: request.charge!.currency,
            at: typeof request.at === "number" && request.at > 0 ? new Date(request.at) : new Date(),
            billCurrency: account.currency,
            currencyStore: currencies,
            email: account.expectedEmail ?? "",
            representative: rep ? { id: rep.id, commissionPercent: rep.commissionPercent, sharesLosses: rep.sharesLosses, ratePlan: rep.usdRates } : undefined,
          });
          if (!built.ok) {
            pins.push(sync);
            messages.push(`⚠️ ${account.name}: ${built.message} - ثُبّت الجهاز لتسجّل الشحن بنفسك`);
            continue;
          }
          ledger = withAccountEntries(ledger, account.id, [...getAccountEntries(ledger, account.id), { ...built.entry, id: entryId }]);
          done.push(sync.syncId);
          messages.push(`⏳ سُجّل شحن ${account.name}: ${formatAmount(built.entry.amount)} ${LEDGER_CURRENCY_LABELS[built.entry.currency]} - D ينتظر فاتورة Starlink`);
        }
        let saved = true;
        try {
          saveLedgerStore(ledger);
        } catch {
          saved = false; // left pending: the next drain tries again
        }
        if (saved) {
          setLedgerStore(ledger);
          for (const id of done) {
            processedSyncIds.add(id);
            unackedSyncIds.add(id);
          }
          for (const m of messages) pushToast(m);
        }
      }
      if (pins.length > 0) {
        const live = new Set(accountsRef.current.filter((a) => !a.deletedAt).map((a) => a.id));
        const result = applyBrowserPins(loadDeviceNotes(), pins, live);
        let savedPins = true;
        try {
          saveDeviceNotes(result.store);
        } catch {
          savedPins = false; // left pending: the next drain tries again
        }
        if (savedPins) {
          setDeviceNotes(result.store);
          for (const id of result.syncIds) {
            processedSyncIds.add(id);
            unackedSyncIds.add(id);
          }
          for (const id of result.pinned) {
            const name = accountsRef.current.find((a) => a.id === id)?.name ?? "الجهاز";
            pushToast(`📌 ثُبّت ${name}: لم يُسجَّل الشحن بعد - سجّله مع D حين تنزل الفاتورة`);
          }
        }
      }
      const syncs = batch.filter((sync) => !isBrowserPin(sync));
      if (syncs.length === 0) {
        await retryAcks();
        return;
      }

      const signedIn = markSignedInFromSync(sessionResultsRef.current, syncs.map((sync) => sync.accountId));
      if (signedIn !== sessionResultsRef.current) updateSessionResults(signedIn);

      // runSyncBatch (starlinkSync.ts) is the pure, directly-tested implementation of "merge,
      // then save, then message - and never claim success or mark anything applied unless the
      // save genuinely succeeds." Only the native ack call itself (a separately-scheduled retry
      // concern, see retryAcks) stays out here.
      // 🔗 a Starlink read changes only the fields it read, on the latest stored list - an older
      // in-memory list never takes off a customer linked meanwhile (lib/storeMerge.ts)
      const base = accountsRef.current;
      const committed: { list: StarlinkAccountSummary[] | null } = { list: null };
      const outcome = runSyncBatch(base, syncs, processedSyncIds, {
        isDemoMode: dataStateRef.current === "demo",
        saveDemoAccounts: (next) => {
          committed.list = commitDemoAccounts(base, next, "sync");
        },
        saveSyncedFieldsCache,
        showAlert: pushToast,
        // 🟩 A running sync's own devices go on its line, not in a bubble each.
        absorbMessages: (messages) => {
          const run = syncRunRef.current;
          if (!run || isRunOver(run)) return false;
          const taken = withChanges(run, messages);
          if (taken.absorbed) commitRun(taken.run);
          return taken.absorbed;
        },
      });

      if (outcome.status !== "applied") return;

      for (const id of outcome.appliedSyncIds) {
        processedSyncIds.add(id);
        unackedSyncIds.add(id);
      }
      const applied = committed.list ?? outcome.accounts;
      setAccounts(applied);
      // ⏳ A read of a new bill fills the D of a charge recorded before it came down (his choice «وحده مع إشعار»).
      const billReads = syncs
        .filter((sync) => sync.fields.balanceDue !== undefined && !sync.fields.checkOnly && outcome.appliedSyncIds.includes(sync.syncId))
        .map((sync) => ({
          accountId: sync.accountId,
          balanceDue: sync.fields.balanceDue ?? "",
          currency: sync.fields.currency || applied.find((a) => a.id === sync.accountId)?.currency || "",
          at: sync.recordedAt ?? Date.now(),
        }));
      if (billReads.length > 0) {
        const currencies = loadCurrencyStore();
        const fill = fillAwaitingBills(loadLedgerStore(), billReads, (code) => getCurrency(currencies, code)?.rateFromUsd);
        if (fill.filled.length > 0) {
          try {
            saveLedgerStore(fill.ledger);
            setLedgerStore(fill.ledger);
            for (const f of fill.filled) {
              const name = applied.find((a) => a.id === f.accountId)?.name ?? "الجهاز";
              const text = `⏳ نزلت فاتورة ${name}: ${formatAmount(f.amount)} ${f.currencyCode} ← سُجّلت D`;
              pushToast(text);
              addLocalEvent(text, "/");
            }
          } catch {
            // storage full: the next read fills it
          }
        }
        for (const miss of fill.noRate) {
          const name = applied.find((a) => a.id === miss.accountId)?.name ?? "الجهاز";
          pushToast(`⏳ نزلت فاتورة ${name} بعملة ${miss.currencyCode} - أضف سعرها في «العملات» لتُسجَّل D`);
        }
      }
      // Keep this listener's own view of "current accounts" correct for the very next sync
      // without waiting for React's render -> effect cycle to catch up: a live event and a
      // resume-time drain (or two quick live events) can arrive back-to-back faster than that.
      accountsRef.current = applied;

      await retryAcks();
    }

    async function drainPending() {
      await accountsReadyGateRef.current.whenReady();
      await retryAcks(); // retry any ack left over from a previous drain before fetching more
      const pending = await listPendingAccountSyncs();
      if (pending.length > 0) await applyBatch(pending);
    }

    onAccountDataSynced((event) => {
      void applyBatch([event]);
    }).then((h) => {
      if (cancelled) {
        h.remove();
      } else {
        liveHandle = h;
      }
    });

    // Covers "opening the app": whatever was staged while it was closed/killed entirely.
    drainPending();

    // Covers "returning to it": AccountBrowserActivity closing (or the app being switched back
    // to) resumes this Activity, at which point any result staged while it was stopped is drained.
    App.addListener("resume", () => {
      drainPending();
    }).then((h) => {
      if (cancelled) {
        h.remove();
      } else {
        resumeHandle = h;
      }
    });

    return () => {
      cancelled = true;
      liveHandle?.remove();
      resumeHandle?.remove();
    };
  }, []);

  // Keeps the native background sync job (AutoSyncWorker, see localBrowser.ts) current with
  // whatever accounts actually exist right now, so a closed/killed app's next scheduled run still
  // reflects the latest add/edit/remove - not just whatever list happened to exist last time this
  // ran. This runs in "demo" (local-only, no backend yet) mode too: with no real API connected,
  // demo mode IS how accounts are actually stored on-device right now, real Starlink logins and
  // all (see openIsolatedAccountBrowser/"فتح") - excluding it here would silently leave every
  // real account this app currently manages unsynced. Archived/soft-deleted devices are excluded
  // (filtered inline, not via the activeAccounts memo below, to keep this effect independent of
  // that memo's own position in the hook order) - there is nothing useful to keep background-
  // syncing once a device has been set aside.
  // التنبيه الصباحي (morningDigest.ts): rescheduled whenever devices or balances change, once the
  // real account list is loaded; tapping one opens the reminders page.
  useEffect(() => {
    let cancelled = false;
    void accountsReadyGateRef.current.whenReady().then(() => {
      if (cancelled) return;
      void rescheduleMorningDigests(accounts, totalOwedAcrossAccounts(ledgerStore))
        .then(() => rescheduleEveningSummary(accounts, ledgerStore))
        .then(() =>
          rescheduleTelegramSummaries({
            accounts,
            ledgerStore,
            owedByCurrency: totalOwedAcrossAccounts(ledgerStore),
            morningHour: getMorningDigestHour(),
            eveningHour: getEveningSummaryHour(),
          }),
        );
    });
    return () => {
      cancelled = true;
    };
  }, [accounts, ledgerStore]);

  const driveReadyRef = useRef(false);
  useEffect(() => {
    if (autoBackupStartedRef.current) return;
    autoBackupStartedRef.current = true;
    // Only after the real account list is loaded (same gate the sync drain waits on), so a backup
    // never captures the placeholder list shown before loading finishes.
    void accountsReadyGateRef.current.whenReady().then(async () => {
      const outcome = await runAutoBackup(accountsRef.current);
      if (outcome.status === "saved") setLastBackupAt(new Date().toISOString());
      if (outcome.status === "failed") pushToast(`تعذر النسخ الاحتياطي التلقائي: ${outcome.message}`);
      // The off-phone copy (Settings → Google Drive). Silent: a failure (offline) is retried on the
      // next app open and shown in Settings, never a toast every time.
      await runDriveBackup(accountsRef.current);
      driveReadyRef.current = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⏰ Google Drive every hour (his Oct 12 2026 ask «كل ساعة نسخة»): checked every 5 minutes while the
  // app is open and when it comes back to the front; runDriveBackup uploads only once an hour is up.
  useEffect(() => {
    let busy = false;
    const tick = () => {
      // Only once the real list is loaded (after the first run above), never the placeholder list.
      if (busy || !driveReadyRef.current) return;
      busy = true;
      void runDriveBackup(accountsRef.current).finally(() => {
        busy = false;
      });
    };
    const timer = window.setInterval(tick, 5 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    // Each device's renewal date/status goes along - the phone uses them to check the important
    // ones (7/3/1 days, just expired, stopped) automatically; see autoSyncList.ts.
    void syncAutoSyncAccountList(buildAutoSyncList(accounts));
  }, [accounts]);

  // 🔑 «بوت الأكواد» sends each code with its device's name, customer, email and KIT.
  useEffect(() => {
    void setCodeDevices(buildCodeDevices(accounts, clientStore));
  }, [accounts, clientStore]);

  // ✉️ Devices still named by the time they were added take their email as their name.
  useEffect(() => {
    for (const account of accounts) {
      const renamed = placeholderRename(account);
      if (renamed) patchAccount(account.id, { name: renamed });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  // ⏰ «مزامنات مجدولة»: his choices reach the phone on every start (a reinstalled app forgets them).
  useEffect(() => {
    void pushScheduledSyncs();
    // 📮 «بريد على نطاقي» too.
    void pushMailDomain();
  }, []);

  // 💳 KAST card mail: each device's expected Starlink dollars and card go to the phone (it guesses
  // the device of a refused payment for the Telegram alert); never the demo devices.
  useEffect(() => {
    if (dataState !== "loaded") return;
    void pushKastDevices(kastDevicesSnapshot(accounts, ledgerStore, currencyStore));
  }, [accounts, ledgerStore, currencyStore, dataState]);

  // 💳 My completed cards to the device browsers (for filling Starlink's card form).
  useEffect(() => {
    void pushFillCards();
  }, []);

  // …and on opening / coming back: check the mail now, and tell about dollars received.
  useEffect(() => {
    if (!isRunningInAndroidApp()) return;
    let handle: PluginListenerHandle | undefined;
    let cancelled = false;
    const check = () => {
      void kastCheckNow();
      void drainKastDeposits().then((added) => {
        for (const d of added) {
          const text = d.kind === "spent" ? `💳 ${depositLabel(d)} - سدّد D الجهاز من «ستارلينك والبطاقة»` : `💵 ${depositLabel(d)} إلى KAST - سجّله من «ستارلينك والبطاقة»`;
          pushToast(text);
          void notifyPhone(text, KAST_ROUTE);
        }
      });
    };
    check();
    App.addListener("resume", check).then((h) => {
      if (cancelled) h.remove();
      else handle = h;
    });
    return () => {
      cancelled = true;
      handle?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saveAccount(saved: StarlinkAccountSummary) {
    // ⚡ «شحن / تفعيل»: the same device becomes active (no new device, no new customer), then its first charge.
    const activating = Boolean(dialog?.activating && saved.pendingActivation);
    const account = activating ? markActivated(saved, new Date().toISOString()) : saved;
    if (activating) window.setTimeout(() => {
      setLedgerForPayment(false);
      setLedgerAccount(account);
    }, 50);
    markDeviceTouched(account.id); // 🕘 edited
    const repRequestId = repDeviceRequestRef.current;
    repDeviceRequestRef.current = null;
    if (repRequestId && !accounts.some((item) => item.id === account.id)) {
      void adoptRepDevice(repRequestId, account.id).then((result) => {
        pushToast(result.ok ? `✅ نُقل دخول Starlink إلى ${result.name} - افتحه مباشرة` : result.message);
        if (result.ok) void triggerImmediateSync(account.id);
      });
    }
    setAccounts((current) => {
      const exists = current.some((item) => item.id === account.id);
      const next = exists
        ? current.map((item) => item.id === account.id ? account : item)
        : [account, ...current];

      // 🔗 only what this edit changed, onto the latest stored list (lib/storeMerge.ts)
      return dataState === "demo" ? commitDemoAccounts(current, next, "edit", { unlink: true }) : next;
    });
    // 🤝 Given to a rep: once all the customer's devices are that rep's, the customer is the rep's -
    // he owes us nothing, the rep owes us everything (repClients.ts).
    if (account.representativeId && account.clientId) {
      const exists = accounts.some((item) => item.id === account.id);
      const nextAccounts = exists ? accounts.map((item) => (item.id === account.id ? account : item)) : [account, ...accounts];
      const moved = autoMoveClientToRep(clientStore[account.clientId], nextAccounts, new Date().toISOString());
      if (moved) {
        setClientStore(commitClientStore(clientStore, { ...clientStore, [moved.id]: moved }));
        const repName = getRepresentative(representativeStore, account.representativeId)?.name ?? "المندوب";
        pushToast(`🤝 ${moved.name} صار زبون ${repName} - ديونه على ${repName}`);
      }
    }
    setShowAll(true);
    setSelectedDay(null);
    setQuery("");
    setDialog(null);
    // A brand-new device (not a rep's, whose login is already transferred): 🤖 its mailbox first,
    // signed in by itself, then its Starlink browser, signed in by itself (the code from the mailbox).
    const isNew = !accounts.some((item) => item.id === account.id);
    if ((isNew || activating) && account.creation && isRunningInAndroidApp()) {
      // 🆕 «إنشاء حساب جديد»: the new email's signup first, then «تفعيل Starlink» - 📮 an address on
      // his forwarded domain has no mailbox to make: «تفعيل Starlink» at once.
      void openAccountCreation(account, isOnMailDomain(account.expectedEmail, loadMailDomain()) ? "starlink" : "mail").then((result) => {
        if (!result.ok) pushToast(result.message);
      });
    } else if ((isNew || activating) && !repRequestId && isRunningInAndroidApp() && account.expectedEmail?.trim()) {
      void openAutoSignIn(account, accounts).then((result) => {
        if (!result.ok) pushToast(result.message);
      });
    }
  }

  function removeAccountCard(account: StarlinkAccountSummary) {
    setAccounts((current) => {
      const next = current.filter((item) => item.id !== account.id);
      return dataState === "demo" ? commitDemoAccounts(current, next, "remove") : next;
    });
    setDialog(null);
  }

  /** Every quick-action on a card (متعطل/أرشفة/تجديد/استعادة) goes through this one path - never
   * touches ledger entries, allocations, exchange rates or any other store, and never resets
   * dialog/filter state the way saveAccount does (these are quick, in-place edits, not a form
   * submission that should also close whatever dialog was open). */
  function patchAccount(accountId: string, patch: Partial<StarlinkAccountSummary>) {
    setAccounts((current) => {
      const next = current.map((item) => (item.id === accountId ? { ...item, ...patch } : item));
      return dataState === "demo" ? commitDemoAccounts(current, next, "patch", { unlink: "clientId" in patch }) : next;
    });
  }

  // "إضافة دين سابق": an earlier owner's unpaid Starlink debt, its own record until paid.
  function handleAddPreviousDebt(account: StarlinkAccountSummary, input: { date: string; amountUsd: number; note: string }): string | null {
    if (!confirmClosedMonthChange([input.date])) return "لم يُحفظ (الشهر مُقفل)";
    const result = recordPreviousDebt(loadPreviousDebts(), { accountId: account.id, ...input });
    if (!result.ok) return result.message;
    savePreviousDebts(result.list);
    setPreviousDebts(result.list);
    pushToast(`تم تسجيل دين سابق ${formatAmount(input.amountUsd)} $ على "${account.name}" - يظهر في قائمة D`);
    return null;
  }

  // ➕ «أضفه إلى الدين السابق» (his Oct 22 2026 ask): the gap grows the device's open previous debt.
  function handleAddToPreviousDebt(account: StarlinkAccountSummary, debtId: string, amountUsd: number): string | null {
    const day = localDayKey(new Date());
    if (!confirmClosedMonthChange([day])) return "لم يُحفظ (الشهر مُقفل)";
    const result = addToPreviousDebt(loadPreviousDebts(), debtId, amountUsd, day);
    if (!result.ok) return result.message;
    savePreviousDebts(result.list);
    setPreviousDebts(result.list);
    pushToast(`أُضيف ${formatAmount(amountUsd)} $ إلى الدين السابق على "${account.name}" - صار ${formatAmount(result.debt.amountUsd)} $`);
    return null;
  }

  // 👤 «على الزبون رصيد سابق»: the gap recorded on the device's customer (عليه), in his currency.
  function handleCustomerPreviousBalance(account: StarlinkAccountSummary, input: { amount: number; currencyCode: string; note: string }): string | null {
    if (!account.clientId) return "اربط الجهاز بزبون أولًا";
    const day = localDayKey(new Date());
    if (!confirmClosedMonthChange([day])) return "لم يُحفظ (الشهر مُقفل)";
    const result = recordPartyAdjustment(loadPartyAdjustments(), { partyKind: "client", partyId: account.clientId, direction: "owesUs", amount: input.amount, currencyCode: input.currencyCode, date: day, note: input.note });
    if (!result.ok) return result.message;
    savePartyAdjustments(result.list);
    pushToast(`سُجّل على ${clients.find((c) => c.id === account.clientId)?.name ?? "الزبون"} رصيد سابق ${formatAmount(input.amount)} ${input.currencyCode}`);
    return null;
  }

  function currentProfitRates() {
    return { MRU: getCurrency(currencyStore, "MRU")?.rateFromUsd, SIFA: getCurrency(currencyStore, "SIFA")?.rateFromUsd };
  }

  // "متعطل": marking a fault can drop the device's open D (never paid to Starlink - the whole sale
  // becomes profit today); "تم الإصلاح" brings any dropped D back to be paid normally.
  function handleSetDeviceFault(account: StarlinkAccountSummary, fault: StarlinkAccountSummary["deviceFault"], waiveDebts: boolean) {
    // «إزالة العطل» also dismisses a group the app found by itself (else the device stays listed).
    patchAccount(account.id, fault ? { deviceFault: fault } : removeFaultPatch(account));
    const entries = getAccountEntries(ledgerStore, account.id);
    if (fault && waiveDebts) {
      const today = new Date().toISOString().slice(0, 10);
      const result = waiveOpenDebts(entries, today, currentProfitRates());
      if (result.count > 0) {
        updateLedgerEntries(account.id, result.entries);
        pushToast(`🔥 "${account.name}" معطل - لن يُدفع D (${result.count}) لستارلينك وحُسب مبلغه ربحًا اليوم`);
      }
      return;
    }
    if (!fault) {
      const result = restoreWaivedDebts(entries);
      if (result.count > 0) {
        updateLedgerEntries(account.id, result.entries);
        pushToast(`🔧 تم إصلاح "${account.name}" - عاد عليه D (${result.count}) لتدفعه لستارلينك`);
      }
    }
  }

  function handleArchive(account: StarlinkAccountSummary) {
    patchAccount(account.id, { archivedAt: new Date().toISOString() });
  }

  // 🔗 The same device registered twice: everything on `drop` moves to `keep`, then `drop` goes to
  // the trash (lib/deviceMerge.ts).
  function handleMergeDevices(drop: StarlinkAccountSummary, keep: StarlinkAccountSummary) {
    const result = mergeDevices({ keep, drop, ledger: ledgerStore, allocations: allocationStore, previousDebts });
    saveLedgerStore(result.ledger);
    setLedgerStore(result.ledger);
    saveAllocationStore(result.allocations);
    setAllocationStore(result.allocations);
    savePreviousDebts(result.previousDebts);
    setPreviousDebts(result.previousDebts);
    if (Object.keys(result.keepPatch).length > 0) patchAccount(keep.id, result.keepPatch);
    patchAccount(drop.id, { deletedAt: new Date().toISOString() });
    commitDeviceNotes(mergeDeviceNotes(loadDeviceNotes(), drop.id, keep.id));
    pushToast(`🔗 دُمج «${drop.name}» في «${keep.name}»${result.movedEntries ? ` - انتقلت ${result.movedEntries} عملية` : ""}، والمكرّر في السلة`);
  }

  /** 🔗 «✕» on «⚠️ مكرّر» - two different devices: the mark goes from both, for good. */
  function handleNotDuplicate(account: StarlinkAccountSummary, twin: StarlinkAccountSummary) {
    for (const { id, patch } of notDuplicatePatches(account, twin)) patchAccount(id, patch);
    pushToast(`✓ «${account.name}» و«${twin.name}» ليسا مكرّرين`);
  }

  /** 🔗 Every «⚠️ مكرّر» mark away at once (the «مكرر» circle). */
  function clearAllDuplicates() {
    setRingMenu(null);
    const pairs = duplicatePairs(deviceTwinMap, activeAccounts, ledgerStore);
    if (pairs.length === 0) return;
    if (!window.confirm(`إزالة علامة «مكرّر» عن ${pairs.length * 2} جهاز؟\n\nلا يُحذف ولا يُدمج شيء - تُزال العلامة فقط ولا تعود لهذه الأزواج.`)) return;
    for (const { keep, drop } of pairs) for (const { id, patch } of notDuplicatePatches(keep, drop)) patchAccount(id, patch);
    if (statFilter === "duplicate") setStatFilter(null);
    pushToast(`✓ أُزيلت علامة «مكرّر» عن ${pairs.length * 2} جهاز`);
  }

  function handleSoftDelete(account: StarlinkAccountSummary) {
    patchAccount(account.id, { deletedAt: new Date().toISOString() });
  }

  function handleRestore(account: StarlinkAccountSummary) {
    patchAccount(account.id, { archivedAt: null, deletedAt: null });
  }

  // "تجديد": only ever updates rechargeDate - never talks to Starlink, never touches the ledger
  // itself. Opening the ledger dialog right after is what lets the operator record the actual
  // shipment/payment, reusing the existing "إضافة حركة" flow rather than a second, parallel one.
  // With a fixed monthly price (renewalPlan) and auto-shipment ticked, the month's shipment is
  // recorded right here (renewalPlan.ts) instead - falling back to the manual dialog, with the
  // reason, whenever a needed exchange rate isn't registered.
  function handleConfirmRenewal(
    account: StarlinkAccountSummary,
    newRechargeDate: string,
    autoShipment = false,
    costPending = false,
    settleFromCard: boolean | null = null,
    payOpenD = false,
  ) {
    patchAccount(account.id, { rechargeDate: newRechargeDate, lastUpdated: "الآن" });
    if (isPinned(deviceNotes, account.id)) setUnpinAsk(account.id);
    const today = new Date().toISOString().slice(0, 10);
    const entries = getAccountEntries(ledgerStore, account.id);
    const open = openDebtEntries(entries);
    // He said «دفعت D لستارلينك الآن»: that D is paid today - no new shipment. («📅 شهر جديد» keeps it.)
    if (open.length > 0 && payOpenD) {
      const ids = new Set(open.map((e) => e.id));
      const options = { date: today, profitRates: currentProfitRates(), fromCard: settleFromCard ?? true };
      updateLedgerEntries(account.id, entries.map((e) => (ids.has(e.id) ? settleShipmentCost(e, options) : e)));
      const usd = open.reduce((sum, e) => sum + (starlinkCostUsd(e) ?? 0), 0);
      pushToast(`✓ تم تجديد "${account.name}" ودفع D (${formatAmount(usd)} $) لستارلينك - نزل الربح اليوم`);
      return;
    }
    if (autoShipment && account.renewalPlan) {
      const rep = getRepresentative(representativeStore, shipmentRepId(account, getClient(clientStore, account.clientId)));
      const result = buildRenewalShipment(account.renewalPlan, currencyStore, new Date().toISOString().slice(0, 10), {
        email: account.expectedEmail || account.starlinkAccountEmail || "",
        representative: rep ? { id: rep.id, commissionPercent: rep.commissionPercent, sharesLosses: rep.sharesLosses, ratePlan: rep.usdRates } : undefined,
        costPending,
      });
      if (result.ok) {
        const entry =
          !costPending && settleFromCard && result.entry.starlinkCost?.status === "settled"
            ? { ...result.entry, starlinkCost: { ...result.entry.starlinkCost, paidVia: "card" as const, settledAt: new Date().toISOString() } }
            : result.entry;
        updateLedgerEntries(account.id, [...entries, entry]);
        pushToast(`✓ تم التجديد وتسجيل شحنة ${formatAmount(result.entry.amount)} ${LEDGER_CURRENCY_LABELS[result.entry.currency]} على "${account.name}"${costPending ? " (D)" : ""}`);
        return;
      }
      pushToast(`تعذر التسجيل التلقائي: ${result.message} - سجّل الشحنة يدويًا`);
    }
    setLedgerAccount({ ...account, rechargeDate: newRechargeDate });
  }

  /** ↩️ D's marked paid while Starlink still asks for them: back to D (nothing new on the customer). */
  function handleRestoreD(account: StarlinkAccountSummary, entryIds: string[]) {
    const ids = new Set(entryIds);
    const entries = getAccountEntries(ledgerStore, account.id);
    updateLedgerEntries(account.id, entries.map((e) => (ids.has(e.id) ? unsettleShipmentCost(e) : e)));
    pushToast(`↩️ رجع D (${ids.size}) على "${account.name}" - ادفعه لستارلينك حين تدفع`);
  }

  /** ✓ He really paid those D's - Starlink's bill after them is a new month. */
  // «✕» on «📱 أضافه …»: one card, or every card in the «من المندوبين» filter at once.
  function handleClearRepAdded(targets: StarlinkAccountSummary[]) {
    for (const account of targets) patchAccount(account.id, clearRepAddedPatch(account));
    if (statFilter === "fromRep" && targets.length >= fromRepCount) setStatFilter(null);
    pushToast(targets.length === 1 ? `أُزيلت علامة المندوب عن "${targets[0].name}"` : `أُزيلت علامة المندوب عن ${targets.length} جهاز`);
  }

  function handleConfirmPaidD(account: StarlinkAccountSummary, entryIds: string[]) {
    updateLedgerEntries(account.id, confirmPaidD(getAccountEntries(ledgerStore, account.id), new Set(entryIds)));
    pushToast(`✓ D مدفوع على "${account.name}" - سجّل الشهر الجديد بـ«🔄 تجديد» إن لم تسجّله`);
  }

  /** Removes a permanently-deleted device's operations and everything posted from them. */
  function removeAccountRecords(account: StarlinkAccountSummary) {
    const next = removeDeviceRecords(
      { ledger: ledgerStore, allocations: allocationStore, cash: loadCashEntries(), previousDebts: loadPreviousDebts() },
      account.id,
      account.name,
    );
    saveCashEntries(next.cash);
    saveLedgerStore(next.ledger);
    setLedgerStore(next.ledger);
    saveAllocationStore(next.allocations);
    setAllocationStore(next.allocations);
    savePreviousDebts(next.previousDebts);
    setPreviousDebts(next.previousDebts);
  }

  /** Asked before a permanent delete: the device's own operations go too, or stay in the
   * reports as "جهاز محذوف". */
  function askDeleteAccountRecords(account: StarlinkAccountSummary): boolean {
    const question = deviceRecordsQuestion(account.name, deviceRecordsSummary(account.id, ledgerStore, loadPreviousDebts()));
    if (question === null || !window.confirm(question)) return false;
    return confirmClosedMonthChange(getAccountEntries(ledgerStore, account.id).flatMap(ledgerEntryMonthDates));
  }

  async function deleteAccount(account: StarlinkAccountSummary) {
    const deleteRecords = askDeleteAccountRecords(account);
    // Deleting the account from STAR NET never implies deleting its saved Starlink login on this
    // phone - that is a separate, explicit choice, and only asked about at all when there could
    // be a session to delete. The card is never removed before that choice (and, if made, its
    // outcome) is known: a session delete that fails must leave the account exactly as it was,
    // so the user can retry instead of losing track of a still-logged-in local browser.
    if (!isRunningInAndroidApp()) {
      removeAccountCard(account);
      if (deleteRecords) removeAccountRecords(account);
      return;
    }

    const outcome = await resolveAccountDeletion({
      confirmSessionDelete: () =>
        window.confirm(
          `هل تريد أيضًا حذف جلسة المتصفح المحلية المرتبطة بحساب "${account.name}"؟\n` +
            "سيؤدي هذا إلى تسجيل الخروج نهائيًا من هذا الحساب على هذا الهاتف. لا يمكن التراجع عن هذا الإجراء.",
        ),
      deleteSession: () => deleteIsolatedAccountSession(account.id),
    });

    if (outcome.action === "keepAccount") {
      // Never claim success without real confirmation from the native side - the account stays
      // exactly as it was so the user can retry.
      window.alert(
        `تعذر حذف جلسة المتصفح المحلية لحساب "${account.name}". ` +
          "لم يتم حذف الحساب - حاول مرة أخرى.",
      );
      return;
    }

    removeAccountCard(account);
    if (deleteRecords) removeAccountRecords(account);
  }

  // The normal dashboard (overview cards, calendar, filters, "تحتاج إلى متابعة") only ever
  // operates on active devices - an archived or soft-deleted one is reached only through its own
  // dedicated view (see viewMode), never mixed into these counts/lists.
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archivedAt && !a.deletedAt), [accounts]);
  // 🤝 The reminders (bell count) leave the reps' devices to the reps (his Oct 2026 ask).
  const ownActiveAccounts = useMemo(() => (isRepWorkspace() ? activeAccounts : activeAccounts.filter((a) => !isRepDevice(a))), [activeAccounts]);
  const activeAccountsRef = useRef(activeAccounts);
  activeAccountsRef.current = activeAccounts;
  const archivedAccounts = useMemo(() => accounts.filter((a) => a.archivedAt), [accounts]);
  const trashAccounts = useMemo(() => accounts.filter((a) => a.deletedAt), [accounts]);
  // 🔗 Devices registered twice (same email or KIT) → their twin, for «⚠️ مكرّر · دمج».
  const deviceTwinMap = useMemo(() => deviceTwins(accounts), [accounts]);
  // 🔄 «تم تجديد»: a renewal recorded today.
  const renewedToday = useMemo(() => renewedOn(ledgerStore, localToday()), [ledgerStore]);
  const needsLoginIds = useMemo(
    () => new Set(accountIdsNeedingLogin(sessionResults, activeAccounts.map((a) => a.id))),
    [sessionResults, activeAccounts],
  );

  // Cheap header-badge count for /reminders - only the categories this page already has data for
  // loaded (renewals, device debts, backup) or that cost nothing extra to check (backup); the
  // page itself also covers store debts/low stock, which don't need a second data load just to
  // size a badge.
  // Devices Starlink stopped while we still owe their D - the signal to pay Starlink now.
  const [previousDebts, setPreviousDebts] = useState<PreviousDebtList>([]);
  useEffect(() => setPreviousDebts(loadPreviousDebts()), []);
  const openPreviousDebts = useMemo(() => listOpenPreviousDebts(previousDebts, ledgerStore), [previousDebts, ledgerStore]);
  const suspendedWithDebt = useMemo(
    () => listSuspendedWithDebt(activeAccounts, listOpenShipmentDebts(ledgerStore), openPreviousDebts),
    [activeAccounts, ledgerStore, openPreviousDebts],
  );
  const suspendedCardShortfall = useMemo(
    () => (suspendedWithDebt.length > 0 ? cardShortfallForSuspended(suspendedWithDebt, currentCardBalanceUsd(ledgerStore)) : 0),
    [suspendedWithDebt, ledgerStore],
  );
  // 👆 When each top banner appeared (ignoreFreshTap).
  const dAlertShown = suspendedWithDebt.length > 0;
  useEffect(() => {
    if (dAlertShown) bannerShownAt.current["d-alert"] = Date.now();
  }, [dAlertShown]);
  useEffect(() => {
    if (updateAvailable) bannerShownAt.current.update = Date.now();
  }, [updateAvailable]);
  // 🔻 / 💳 The council's money alerts (Oct 2026): losing or weak devices at today's rates, and
  // what the KAST card must cover for the next 7 days' renewals. Owner only (Starlink costs).
  const [ownerView, setOwnerView] = useState(false);
  useEffect(() => setOwnerView(!isRepWorkspace()), []);
  const [moneyAlertsOpen, setMoneyAlertsOpen] = useState(false);
  const [marginOpen, setMarginOpen] = useState<string | null>(null);
  const currencyLabel = (code: string) => (LEDGER_CURRENCY_LABELS as Record<string, string>)[code] ?? getCurrency(currencyStore, code)?.name ?? code;
  const [paymentCards, setPaymentCards] = useState<PaymentCard[]>([]);
  useEffect(() => setPaymentCards(loadPaymentCards()), []);
  const weekCardNeed = useMemo(
    () => (ownerView ? cardNeed(computeRenewalForecast(activeAccounts, new Date(), 7), currentCardBalanceUsd(ledgerStore)) : null),
    [ownerView, activeAccounts, ledgerStore],
  );
  const deviceMargins = useMemo(() => (ownerView ? computeDeviceMargins(activeAccounts, currencyStore) : null), [ownerView, activeAccounts, currencyStore]);
  const moneyAlertCount = (deviceMargins?.losing.length ?? 0) + (deviceMargins?.weak.length ?? 0);
  const showMoneyAlerts = Boolean((weekCardNeed && weekCardNeed.shortUsd > 0) || moneyAlertCount > 0);

  useEffect(() => {
    void notifySuspendedWithDebt(
      suspendedWithDebt.map((s) => ({
        accountName: s.account.name,
        entryIds: [...s.debts.map((d) => d.entry.id), ...s.previousDebts.map((d) => d.id)],
        costUsd: s.costUsd,
      })),
    );
  }, [suspendedWithDebt]);

  // "المزيد" (BottomNav) shows this count on التذكيرات and runs the home actions below.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(REMINDER_COUNT_EVENT, { detail: remindersBadgeEnabled ? reminderCount : 0 }));
  });
  // A "?pay=" device that wasn't loaded yet when the page opened - opened once it is.
  const pendingPaymentRef = useRef<string | null>(null);
  const pendingActivateRef = useRef<string | null>(null);
  useEffect(() => {
    const id = pendingActivateRef.current;
    if (!id) return;
    const target = accounts.find((a) => a.id === id);
    if (!target) return;
    pendingActivateRef.current = null;
    setDialog({ mode: "edit", account: target, activating: Boolean(target.pendingActivation) });
  }, [accounts]);
  useEffect(() => {
    const id = pendingPaymentRef.current;
    if (!id) return;
    const target = accounts.find((a) => a.id === id);
    if (!target) return;
    pendingPaymentRef.current = null;
    setLedgerForPayment(true);
    setLedgerAccount(target);
  }, [accounts]);
  const homeActionRef = useRef<(action: HomeAction) => void>(() => {});
  homeActionRef.current = (action) => {
    if (action === "add-account") setDialog({ mode: "add" });
    else if (action === "sync") void handleSyncNow();
    else setShowClientsOverview(true);
  };
  useEffect(() => {
    if (viewMode !== "active") return;
    const onAction = (event: Event) => homeActionRef.current((event as CustomEvent<HomeAction>).detail);
    window.addEventListener(HOME_ACTION_EVENT, onAction);
    // 🔔 A notification about a device, tapped while the home screen is already open.
    const onSearch = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      if (!value) return;
      setQuery(value);
      setShowAll(true);
      setSelectedDay(null);
      setStatFilter(null);
      setFaultFilter(null);
    };
    window.addEventListener(HOME_SEARCH_EVENT, onSearch);
    const searchFromUrl = parseHomeSearch(window.location.search);
    if (searchFromUrl) {
      window.history.replaceState(null, "", window.location.pathname);
      setQuery(searchFromUrl);
      setShowAll(true);
    }
    // "💵 دفعة من زبون" chosen on the clients page: that device's ledger, ready for a payment.
    // ⚡ the store's «شحن / تفعيل» for a device just sold, and «عرض الأجهزة غير المفعّلة».
    const activateFromUrl = parseActivateDevice(window.location.search);
    if (activateFromUrl) {
      window.history.replaceState(null, "", window.location.pathname);
      const target = accountsRef.current.find((a) => a.id === activateFromUrl);
      if (target) setDialog({ mode: "edit", account: target, activating: Boolean(target.pendingActivation) });
      else pendingActivateRef.current = activateFromUrl;
    }
    if (new URLSearchParams(window.location.search).get("pending") === "1") {
      window.history.replaceState(null, "", window.location.pathname);
      setShowAll(true);
      setSelectedDay(null);
      setStatFilter("pending");
    }
    const payFromUrl = parseHomePayment(window.location.search);
    if (payFromUrl) {
      window.history.replaceState(null, "", window.location.pathname);
      const target = accountsRef.current.find((a) => a.id === payFromUrl);
      if (target) {
        setLedgerForPayment(true);
        setLedgerAccount(target);
      } else {
        pendingPaymentRef.current = payFromUrl;
      }
    }
    const fromUrl = parseHomeAction(window.location.search);
    if (fromUrl) {
      window.history.replaceState(null, "", window.location.pathname);
      homeActionRef.current(fromUrl);
    }
    return () => {
      window.removeEventListener(HOME_ACTION_EVENT, onAction);
      window.removeEventListener(HOME_SEARCH_EVENT, onSearch);
    };
  }, [viewMode]);

  // 🤝 Payment promises due today or overdue (paymentPromises.ts) also count as reminders.
  const [duePromiseCount, setDuePromiseCount] = useState(0);
  useEffect(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const buckets = bucketPromises(loadPromises(), today);
    setDuePromiseCount(buckets.overdue.length + buckets.today.length);
  }, []);
  const reminderCount = useMemo(
    () =>
      suspendedWithDebt.length +
      computeRenewalReminders(ownActiveAccounts).length +
      computeDeviceDebtReminders(ownActiveAccounts, ledgerStore, clientStore).length +
      computeRestrictedDeviceReminders(ownActiveAccounts).length +
      (isBackupOverdue(lastBackupAt) ? 1 : 0) +
      duePromiseCount,
    [ownActiveAccounts, ledgerStore, clientStore, lastBackupAt, suspendedWithDebt, duePromiseCount],
  );

  const dayCounts = useMemo(() => countDayKeys(activeAccounts), [activeAccounts]);

  const expiredOrNearExpiry = useMemo(
    () =>
      activeAccounts.filter((account) => {
        if (isFaulty(account)) return false;
        const days = daysRemainingNumber(account.rechargeDate || account.standbyDate);
        return days !== null && days <= NEAR_EXPIRY_THRESHOLD_DAYS;
      }),
    [activeAccounts],
  );

  const overview = useMemo(() => {
    let online = 0;
    let expiringSoon = 0;
    let expired = 0;
    let suspended = 0;
    let faulty = 0;

    for (const account of activeAccounts) {
      if (isFaulty(account)) {
        faulty += 1;
        continue;
      }
      if (account.dishStatus === DeviceStatus.GREEN || account.wifiStatus === DeviceStatus.GREEN) {
        online += 1;
      }
      if (account.serviceStatus === "suspended") suspended += 1;

      const days = daysRemainingNumber(account.rechargeDate || account.standbyDate);
      if (days === null) continue;
      if (days <= 0) expired += 1; // renewal date = stop instant: 0 already stopped today
      else if (days <= NEAR_EXPIRY_THRESHOLD_DAYS) expiringSoon += 1;
    }

    return { total: activeAccounts.length, online, expiringSoon, expired, suspended, faulty };
  }, [activeAccounts]);


  const { list: filtered, fuzzy: fuzzySearch } = useMemo(() => {
    let list = activeAccounts;
    if (clientFocus) list = list.filter((a) => a.clientId === clientFocus);
    if (selectedDay !== null) {
      list = list.filter((a) => deviceDayKeys(a).includes(selectedDay));
    }
    if (statFilter) {
      list = list.filter((a) => matchesStatFilter(a, statFilter));
      if (statFilter === "faulty" && faultFilter) list = list.filter((a) => faultCategory(a) === faultFilter);
      if (statFilter === "noClient") list = list.filter((a) => matchesNoClientGroup(a, clientStore, noClientGroup));
      if (statFilter === "pinned") list = pinnedDevices(deviceNotes, list);
      if (statFilter === "recent") list = recentDevices(list, ledgerStore, recentLog);
      if (statFilter === "travelDone" && travelGroup !== "all") list = list.filter((a) => matchesTravelGroup(travelStateOf(a, ledgerStore, allAllocations, travelInRepLedger), travelGroup));
      if (statFilter === "renewed") list = list.filter((a) => renewedToday.has(a.id));
      if (statFilter === "duplicate") list = list.filter((a) => deviceTwinMap.has(a.id));
      if (statFilter === "rep") list = list.filter((a) => a.representativeId === repRingId);
      // 🌍 the soonest to run out first - the same order as the days above
      if (statFilter === "outsideHome") {
        const today = localToday();
        list = [...list].sort((a, b) => (outsideHomeDaysLeft(a, today) ?? 0) - (outsideHomeDaysLeft(b, today) ?? 0));
      }
    }
    if (query.trim()) {
      // A rep's name shows his devices too.
      const found = (fuzzy: boolean) =>
        list.filter(
          (a) =>
            deviceMatchesQuery(query, a, visibleClientOf(a), fuzzy) ||
            (!fuzzy && noteMatchesQuery(deviceNotes[a.id], query)) ||
            deviceMatchesQuery(query, { name: getRepresentative(representativeStore, a.representativeId)?.name ?? "", kitNumber: "", serialNumber: "" }, undefined, fuzzy),
        );
      const exact = found(false);
      // 🔤 Nothing exact: the devices one typo away («مخمد» → «محمد»), marked as such.
      if (exact.length > 0) return { list: exact, fuzzy: false };
      return { list: found(true), fuzzy: true };
    }
    return { list, fuzzy: false };
  }, [activeAccounts, clientFocus, selectedDay, statFilter, faultFilter, noClientGroup, travelGroup, ledgerStore, allAllocations, query, clientStore, representativeStore, deviceNotes, recentLog, renewedToday, deviceTwinMap, repRingId, travelInRepLedger]);

  const faultCounts = useMemo(() => countFaultCategories(activeAccounts), [activeAccounts]);
  const repairCount = useMemo(() => activeAccounts.filter(isUnderRepair).length, [activeAccounts]);
  const fromRepCount = useMemo(() => activeAccounts.filter((a) => a.addedByRepId).length, [activeAccounts]);
  // 🔵 His Oct 17 2026 circles.
  const ringCounts = useMemo(() => {
    const count = (kind: StatFilterKind) => activeAccounts.filter((a) => matchesStatFilter(a, kind)).length;
    return {
      canceled: count("canceled"),
      notCanceled: count("notCanceled"),
      sis: count("sis"),
      rom: count("rom"),
      g100: count("g100"),
      toSis: count("toSis"),
      toStop: count("toStop"),
      renewed: activeAccounts.filter((a) => renewedToday.has(a.id)).length,
      duplicate: activeAccounts.filter((a) => deviceTwinMap.has(a.id)).length,
    };
  }, [activeAccounts, renewedToday, deviceTwinMap]);
  // 🤝 One circle per rep with devices, in the rep's own color.
  const repRings = useMemo(
    () =>
      listRepresentatives(representativeStore)
        .map((rep) => ({ rep, count: activeAccounts.filter((a) => a.representativeId === rep.id).length }))
        .filter((r) => r.count > 0),
    [representativeStore, activeAccounts],
  );
  const pinnedCount = useMemo(() => pinnedDevices(deviceNotes, activeAccounts).length, [deviceNotes, activeAccounts]);
  // 🕘 «آخر جهاز»: how many devices were touched today (the list itself is newest first).
  // ⏰ «لم يُجدَّد»: stopped at the start of today and still not renewed.
  const notRenewedCount = useMemo(() => activeAccounts.filter((a) => matchesStatFilter(a, "notRenewed")).length, [activeAccounts]);
  const recentToday = useMemo(() => touchedOn(activeAccounts, ledgerStore, recentLog), [activeAccounts, ledgerStore, recentLog]);
  const travelCount = useMemo(() => activeAccounts.filter(needsTravelRegistration).length, [activeAccounts]);
  const outsideHomeDays = useMemo(
    () => outsideHomeSchedule(activeAccounts.filter((a) => matchesStatFilter(a, "outsideHome")), localToday()),
    [activeAccounts],
  );
  const outsideHomeCount = useMemo(() => outsideHomeDays.reduce((n, d) => n + d.accounts.length, 0), [outsideHomeDays]);
  const travelDone = useMemo(() => travelEarnings(activeAccounts), [activeAccounts]);
  const travelBook = useMemo(
    () => buildTravelBook(activeAccounts, representativeStore, ledgerStore, allAllocations, travelInRepLedger),
    [activeAccounts, representativeStore, ledgerStore, allAllocations],
  );
  const noClient = useMemo(() => countNoClient(activeAccounts, clientStore, representativeStore), [activeAccounts, clientStore, representativeStore]);
  // ⏳ «غير مفعّل»: sold by invoice, not activated yet (lib/saleDevices.ts).
  const pendingCount = useMemo(() => activeAccounts.filter(isPendingActivation).length, [activeAccounts]);

  useEffect(() => setSearchHistory(loadSearchHistory()), []);

  // 🟩 The run's line: back from the phone's storage, a clock for its «quiet = over», and - for a
  // 🌙 background run - its devices' outcomes fetched while the app is open.
  useEffect(() => {
    const run = loadSyncRun();
    syncRunRef.current = run;
    setSyncRun(run);
  }, []);
  const runActive = Boolean(syncRun && !isRunOver(syncRun, runNow));
  const runBackground = syncRun?.mode === "background";
  useEffect(() => {
    if (!syncRun) return;
    const timer = window.setInterval(() => setRunNow(Date.now()), runActive ? 5000 : 30000);
    return () => window.clearInterval(timer);
  }, [syncRun, runActive]);
  useEffect(() => {
    if (!runActive || !runBackground) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshSyncQueue();
    }, 8000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runActive, runBackground]);

  /** 🟩 «🔄 إعادة» from the line's details: the same way the run went (background or one by one). */
  async function retryRun(ids: string[]) {
    const run = syncRunRef.current;
    const live = ids.filter((id) => activeAccountsRef.current.some((a) => a.id === id));
    if (live.length === 0) {
      pushToast("الأجهزة لم تعد موجودة");
      return;
    }
    const label = `${run?.label ?? "المزامنة"} · إعادة`;
    if (run?.mode === "background" && (await trySyncInBackground(live, label, false, true))) return;
    const queue = syncQueueFor(live, label);
    if (queue) startVisibleRun(queue);
  }

  /** 🟩 «📍 إظهار الجهاز»: the home list searched for it. */
  function showRunDevice(id: string) {
    const device = accountsRef.current.find((a) => a.id === id);
    if (!device) return;
    startSearch(device.expectedEmail?.trim() || device.name);
    window.setTimeout(() => document.querySelector(".accounts-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  // A search counts once he stops typing for a moment.
  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = window.setTimeout(() => rememberSearch(query), 1500);
    return () => window.clearTimeout(timer);
  }, [query]);

  function rememberSearch(term: string) {
    setSearchHistory((current) => {
      const next = addSearch(current, term);
      if (next !== current) saveSearchHistory(next);
      return next;
    });
  }

  function forgetSearch(term: string) {
    setSearchHistory((current) => {
      const next = removeSearch(current, term);
      saveSearchHistory(next);
      return next;
    });
  }

  function startSearch(value: string) {
    // Typing searches ALL devices: starting a search clears the active chip/day so results
    // aren't confined to it; he can then tap a chip to narrow (his request).
    if (value.trim() && !query.trim()) {
      setStatFilter(null);
      setSelectedDay(null);
      setFaultFilter(null);
    }
    if (value.trim() && !query.trim()) setClientFocus(null);
    // ✉️ A pasted line holding an email searches the email alone (lib/homeInsights.ts).
    setQuery(searchTermOf(value));
  }

  const searchResults = useMemo(
    () =>
      searchEverything(query, {
        clients,
        suppliers: listSuppliers(supplierStore),
        representatives,
        items: listStoreItems(storeItems),
      }),
    [query, clients, supplierStore, representatives, storeItems],
  );


  const visible =
    viewMode === "archived" ? archivedAccounts
    : viewMode === "trash" ? trashAccounts
    : showAll || query || clientFocus !== null || selectedDay !== null || statFilter !== null ? filtered : expiredOrNearExpiry;

  const renderCard = (account: StarlinkAccountSummary) =>
    viewMode === "active" && isPendingActivation(account) ? (
      <PendingDeviceCard
        key={account.id}
        account={account}
        clientName={visibleClientOf(account)?.name}
        onActivate={(target) => setDialog({ mode: "edit", account: target, activating: true })}
        onEdit={(target) => setDialog({ mode: "edit", account: target })}
      />
    ) : (
    <AccountCard
      key={account.id}
      account={account}
      repPending={repPendingIds.has(account.id)}
      context={viewMode}
      onEdit={(selected) => setDialog({ mode: "edit", account: selected })}
      ledgerEntries={getAccountEntries(ledgerStore, account.id)}
      allocations={allAllocations}
      onLedger={(selected) => setLedgerAccount(selected)}
      onSettleD={(selected) => {
        // 💳 the card page's own payment form for its oldest D (his Oct 14 2026 ask: «ما خرج
        // من البطاقة», the real rate) - and back here once paid.
        // In place (router), never a full page load - that threw him out of the app (Oct 16 2026).
        const open = oldestOpenDebt(getAccountEntries(ledgerStore, selected.id));
        rememberPayTarget(open?.id ?? null);
        router.push("/starlink");
      }}
      onDeviceStatement={(selected) => setStatementAccount(selected)}
      client={visibleClientOf(account)}
      heldByRepName={isHiddenRepDevice(account, hiddenReps) ? repContact(account, representativeStore)?.name : undefined}
      repColor={getRepresentative(representativeStore, account.representativeId)?.color}
      addedByRepName={account.addedByRepId ? getRepresentative(representativeStore, account.addedByRepId)?.name ?? "مندوب" : undefined}
      repClientName={ownerView && account.representativeId ? account.repClientName : undefined}
      twin={viewMode === "active" ? deviceTwinMap.get(account.id) : undefined}
      onMergeInto={viewMode === "active" && !isRepWorkspace() ? handleMergeDevices : undefined}
      onNotDuplicate={viewMode === "active" && !isRepWorkspace() ? handleNotDuplicate : undefined}
      mailSignedIn={mailSignedIds.has(account.id)}
      onOpenClient={(selectedClient) => setOpenClientId(selectedClient.id)}
      currencyStore={currencyStore}
      onSetDeviceFault={handleSetDeviceFault}
      onSetRepair={(target, repair) => patchAccount(target.id, { underRepair: repair })}
      onPatch={viewMode === "active" ? (target, patch) => patchAccount(target.id, patch) : undefined}
      onTravelPrice={viewMode === "active" ? handleTravelPrice : undefined}
      onTravelDone={viewMode === "active" ? handleTravelDone : undefined}
      onTravelCheck={viewMode === "active" ? (target) => travelCheckIds([target.id], target.name) : undefined}
      showTravelVerified={statFilter === "travelDone"}
      unregisteredCard={viewMode === "active" && isUnregisteredCard(account, paymentCards)}
      onFinishCreation={(target) => patchAccount(target.id, { creation: null })}
      allAccounts={accounts}
      onArchive={handleArchive}
      onSoftDelete={ownerView ? handleSoftDelete : undefined}
      onRestore={handleRestore}
      onPermanentDelete={viewMode === "trash" && ownerView ? deleteAccount : undefined}
      onConfirmRenewal={handleConfirmRenewal}
      sessionNeedsLogin={viewMode === "active" && needsLoginIds.has(account.id)}
      previousDebts={openPreviousDebts.filter((d) => d.accountId === account.id)}
      onAddPreviousDebt={viewMode === "active" ? handleAddPreviousDebt : undefined}
      onAddToPreviousDebt={viewMode === "active" ? handleAddToPreviousDebt : undefined}
      onCustomerPreviousBalance={viewMode === "active" ? handleCustomerPreviousBalance : undefined}
      onRestoreD={viewMode === "active" ? handleRestoreD : undefined}
      onConfirmPaidD={viewMode === "active" ? handleConfirmPaidD : undefined}
      onClearRepAdded={viewMode === "active" ? (a) => handleClearRepAdded([a]) : undefined}
      deviceNote={deviceNotes[account.id]}
      onSaveNote={(target, input) => commitDeviceNotes(saveDeviceNote(loadDeviceNotes(), target.id, input))}
      onSetPinned={(target, pinned) => commitDeviceNotes(setDevicePinned(loadDeviceNotes(), target.id, pinned))}
    />
    );

  const ringsNode = (
    <>
      <section className="status-rings" aria-label="ملخص الحسابات">
        <StatusRing
          tone="total"
          value={overview.total}
          total={overview.total}
          label="كل الأجهزة"
          icon={<IconGrid />}
          onLongPress={() => setRingMenu({ kind: "all", label: "كل الأجهزة" })}
          onClick={() => { setShowAll(true); setSelectedDay(null); setStatFilter(null); }}
        />
        <StatusRing
          tone="online"
          value={overview.online}
          total={overview.total}
          label="متصلة الآن"
          icon={<IconSignal />}
          active={statFilter === "online"}
          onLongPress={() => setRingMenu({ kind: "online", label: "متصلة الآن" })}
          onClick={() => toggleStatFilter("online")}
        />
        <StatusRing
          tone="warning"
          value={overview.expiringSoon}
          total={overview.total}
          label="تنتهي قريبًا"
          icon={<IconClock />}
          active={statFilter === "expiringSoon"}
          onLongPress={() => setRingMenu({ kind: "expiringSoon", label: "تنتهي قريبًا" })}
          onClick={() => toggleStatFilter("expiringSoon")}
        />
        <StatusRing
          tone="expired"
          value={overview.expired}
          total={overview.total}
          label="منتهية"
          icon={<IconAlert />}
          active={statFilter === "expired"}
          onLongPress={() => setRingMenu({ kind: "expired", label: "منتهية" })}
          onClick={() => toggleStatFilter("expired")}
        />
        <StatusRing
          tone="suspended"
          value={overview.suspended}
          total={overview.total}
          label="موقوفة"
          icon={<IconPause />}
          active={statFilter === "suspended"}
          onLongPress={() => setRingMenu({ kind: "suspended", label: "موقوفة" })}
          onClick={() => toggleStatFilter("suspended")}
        />
        {/* 🔵 His Oct 17 2026 circles - each one filters, and a long press checks it. */}
        {([
          ["notCanceled", "غير ملغي", ringCounts.notCanceled, <IconSignal key="i" />],
          ["canceled", "ملغي", ringCounts.canceled, <IconAlert key="i" />],
          ["renewed", "تم تجديد", ringCounts.renewed, <IconClock key="i" />],
          ["sis", "SIS", ringCounts.sis, <IconPause key="i" />],
          ["rom", "ROM", ringCounts.rom, <IconSignal key="i" />],
          ["g100", "100G", ringCounts.g100, <IconGrid key="i" />],
          ["toSis", "← SIS", ringCounts.toSis, <IconClock key="i" />],
          ["toStop", "← STOP", ringCounts.toStop, <IconAlert key="i" />],
        ] as const).map(([kind, label, value, icon]) => (
          <StatusRing
            key={kind}
            tone={kind}
            value={value}
            total={overview.total}
            label={label}
            icon={icon}
            active={statFilter === kind}
            onLongPress={() => setRingMenu({ kind, label })}
            onClick={() => toggleStatFilter(kind)}
          />
        ))}
        {repRings.map(({ rep, count }) => (
          <StatusRing
            key={rep.id}
            tone="rep"
            color={rep.color}
            value={count}
            total={overview.total}
            label={rep.name}
            icon={<IconGrid />}
            active={statFilter === "rep" && repRingId === rep.id}
            onLongPress={() => setRingMenu({ kind: "rep", label: rep.name, repId: rep.id })}
            onClick={() => {
              const on = statFilter === "rep" && repRingId === rep.id;
              setRepRingId(on ? null : rep.id);
              setStatFilter(on ? null : "rep");
              setSelectedDay(null);
            }}
          />
        ))}
        {ringCounts.duplicate > 0 && (
          <StatusRing
            tone="duplicate"
            value={ringCounts.duplicate}
            total={overview.total}
            label="مكرر"
            icon={<IconAlert />}
            active={statFilter === "duplicate"}
            onLongPress={() => setRingMenu({ kind: "duplicate", label: "مكرر" })}
            onClick={() => toggleStatFilter("duplicate")}
          />
        )}
      </section>

      {/* 🕘 آخر جهاز, 📌 المثبتة, المعطلة… - round like the rings above, in the same grid (his Oct 12 2026 ask). */}
      <section className="status-rings status-rings-more" aria-label="قوائم الأجهزة">
        <StatusRing
          tone="recent"
          value={recentToday}
          total={overview.total}
          label="آخر جهاز"
          icon={<IconClock />}
          active={statFilter === "recent"}
          onLongPress={() => setRingMenu({ kind: "recent", label: "آخر جهاز" })}
          onClick={() => { toggleStatFilter("recent"); setSelectedDay(null); }}
        />
        <StatusRing
          tone="notRenewed"
          value={notRenewedCount}
          total={overview.total}
          label="لم يُجدَّد"
          icon={<IconClock />}
          active={statFilter === "notRenewed"}
          onLongPress={() => setRingMenu({ kind: "notRenewed", label: "لم يُجدَّد" })}
          onClick={() => { toggleStatFilter("notRenewed"); setSelectedDay(null); }}
        />
        <StatusRing
          tone="pinned"
          tour="pinned-chip"
          value={pinnedCount}
          total={overview.total}
          label="المثبتة"
          icon={<IconGrid />}
          active={statFilter === "pinned"}
          onLongPress={() => setRingMenu({ kind: "pinned", label: "المثبتة" })}
          onClick={() => { toggleStatFilter("pinned"); setSelectedDay(null); }}
        />
        <StatusRing
          tone="faulty"
          value={overview.faulty}
          total={overview.total}
          label="المعطلة"
          icon={<IconAlert />}
          active={statFilter === "faulty"}
          onLongPress={() => setRingMenu({ kind: "faulty", label: "المعطلة" })}
          onClick={() => { toggleStatFilter("faulty"); setFaultFilter(null); setSelectedDay(null); }}
        />
        <StatusRing
          tone="repair"
          value={repairCount}
          total={overview.total}
          label="قيد الإصلاح"
          icon={<IconPause />}
          active={statFilter === "repair"}
          onLongPress={() => setRingMenu({ kind: "repair", label: "قيد الإصلاح" })}
          onClick={() => { toggleStatFilter("repair"); setSelectedDay(null); }}
        />
        <StatusRing
          tone="travel"
          tour="travel-list"
          value={travelCount}
          total={overview.total}
          label="تحتاج توثيق"
          icon={<IconAlert />}
          active={statFilter === "travel"}
          onLongPress={() => setRingMenu({ kind: "travel", label: "تحتاج توثيق" })}
          onClick={() => { toggleStatFilter("travel"); setSelectedDay(null); }}
        />
        <StatusRing
          tone="travelDone"
          tour="travel-done"
          value={travelDone.count}
          total={overview.total}
          label="تم توثيقها"
          icon={<IconSignal />}
          active={statFilter === "travelDone"}
          onLongPress={() => setRingMenu({ kind: "travelDone", label: "تم توثيقها" })}
          onClick={() => { toggleStatFilter("travelDone"); setSelectedDay(null); }}
        />
        <StatusRing
          tone="outsideHome"
          tour="outside-home"
          value={outsideHomeCount}
          total={overview.total}
          label="خارج البلد"
          icon={<IconAlert />}
          active={statFilter === "outsideHome"}
          onLongPress={() => setRingMenu({ kind: "outsideHome", label: "خارج البلد" })}
          onClick={() => { toggleStatFilter("outsideHome"); setSelectedDay(null); }}
        />
        {fromRepCount > 0 && (
          <StatusRing
            tone="fromRep"
            value={fromRepCount}
            total={overview.total}
            label="من المندوبين"
            icon={<IconGrid />}
            active={statFilter === "fromRep"}
            onLongPress={() => setRingMenu({ kind: "fromRep", label: "من المندوبين" })}
            onClick={() => { toggleStatFilter("fromRep"); setSelectedDay(null); }}
          />
        )}
        {pendingCount > 0 && (
          <StatusRing
            tone="pending"
            value={pendingCount}
            total={overview.total}
            label="غير مفعّل"
            icon={<span aria-hidden="true">⏳</span>}
            active={statFilter === "pending"}
            onLongPress={() => toggleStatFilter("pending")}
            onClick={() => toggleStatFilter("pending")}
          />
        )}
        {noClient.total > 0 && (
          <StatusRing
            tone="noClient"
            tour="no-client"
            value={noClient.total}
            total={overview.total}
            label="بدون زبون"
            icon={<IconGrid />}
            active={statFilter === "noClient"}
            onLongPress={() => setRingMenu({ kind: "noClient", label: "بدون زبون" })}
            onClick={() => { toggleStatFilter("noClient"); setNoClientGroup("all"); setSelectedDay(null); }}
          />
        )}
      </section>

      {statFilter === "pinned" && pinnedCount > 1 && (
        <div className="status-chips">
          <button
            type="button"
            className="faulty-chip pinned-clear-chip"
            onClick={() => {
              if (!window.confirm(`إلغاء تثبيت كل الأجهزة (${pinnedCount})؟ تبقى الملاحظات كما هي.`)) return;
              commitDeviceNotes(unpinAll(loadDeviceNotes()));
              setStatFilter(null);
            }}
          >
            🧹 إلغاء كل التثبيتات
          </button>
        </div>
      )}
    </>
  );

  const noticesNode = (
    <>
    {desktop && viewMode === "active" && <DesktopWelcome empty={accountsLoaded && accounts.length === 0} />}

    {updateAvailable && (
      <UpdateBanner title="تحديث جديد للتطبيق متوفر" hint="اضغط لتنزيل النسخة الأحدث ثم ثبّتها - بياناتك تبقى كما هي" onTap={ignoreFreshTap("update")} />
    )}

    {suspendedWithDebt.length > 0 && (
      <Link href="/starlink" className="backup-banner d-alert-banner" onClick={ignoreFreshTap("d-alert")}>
        <span aria-hidden="true">⚠️</span>
        <span>
          <strong>
            {suspendedWithDebt.length === 1
              ? `${suspendedWithDebt[0]!.account.name} توقف وعليه D`
              : `${suspendedWithDebt.length} أجهزة توقفت وعليها D`}
          </strong>
          <small>
            ادفع لستارلينك <bdi dir="ltr">{formatAmount(suspendedWithDebt.reduce((sum, s) => sum + s.costUsd, 0))} $</bdi> ثم اضغط «سدّدت»
          </small>
          {suspendedCardShortfall > 0 && (
            <small className="d-alert-card-short">
              💳 رصيد البطاقة لا يكفي - ينقصها <bdi dir="ltr">{formatAmount(suspendedCardShortfall)} $</bdi>
            </small>
          )}
        </span>
      </Link>
    )}

    {showMoneyAlerts && (
      <button type="button" className="backup-banner money-alert-banner" data-tour="money-alerts" onClick={() => setMoneyAlertsOpen(true)}>
        <span aria-hidden="true">{weekCardNeed && weekCardNeed.shortUsd > 0 ? "💳" : "🔻"}</span>
        <span>
          {weekCardNeed && weekCardNeed.shortUsd > 0 && (
            <strong>
              تحتاج <bdi dir="ltr">{formatAmount(weekCardNeed.needUsd)} $</bdi> للتجديدات خلال 7 أيام · رصيد KAST <bdi dir="ltr">{formatAmount(weekCardNeed.balanceUsd)} $</bdi>
            </strong>
          )}
          {moneyAlertCount > 0 && deviceMargins && (
            <strong>
              {deviceMargins.losing.length > 0 && `🔻 ${deviceMargins.losing.length} ${deviceMargins.losing.length === 1 ? "جهاز خاسر" : "أجهزة خاسرة"}`}
              {deviceMargins.losing.length > 0 && deviceMargins.weak.length > 0 && " · "}
              {deviceMargins.weak.length > 0 && `🟡 ${deviceMargins.weak.length} ضعيفة الربح`}
            </strong>
          )}
          <small>اضغط لترى التفاصيل</small>
        </span>
      </button>
    )}

    {moneyAlertsOpen && deviceMargins && weekCardNeed && (
      <PartySheet title="💰 تنبيهات المال" onClose={() => setMoneyAlertsOpen(false)}>
        <div className="money-alerts">
          <section>
            <strong>💳 بطاقة KAST والأيام السبعة القادمة</strong>
            <p>
              {weekCardNeed.devices} {weekCardNeed.devices === 1 ? "جهاز يتجدد" : "أجهزة تتجدد"} وتكلفتها <bdi dir="ltr">{formatAmount(weekCardNeed.needUsd)} $</bdi> · رصيد البطاقة <bdi dir="ltr">{formatAmount(weekCardNeed.balanceUsd)} $</bdi>
            </p>
            {weekCardNeed.shortUsd > 0 ? (
              <p className="money-alerts-bad">
                ينقصها <bdi dir="ltr">{formatAmount(weekCardNeed.shortUsd)} $</bdi> - <Link href="/starlink">اشحن البطاقة</Link>
              </p>
            ) : (
              <p className="money-alerts-good">✓ الرصيد يكفي</p>
            )}
          </section>
          {(["losing", "weak"] as const).map((kind) =>
            deviceMargins[kind].length > 0 ? (
              <section key={kind}>
                <strong>{kind === "losing" ? "🔻 أجهزة خاسرة (تدفع لستارلينك أكثر مما تأخذ)" : `🟡 ربحها أقل من ${WEAK_MARGIN_PERCENT}% من سعر البيع`}</strong>
                <ul>
                  {deviceMargins[kind].map((d) => (
                    <li key={d.id}>
                      <button type="button" className="money-alerts-row" aria-expanded={marginOpen === d.id} onClick={() => setMarginOpen(marginOpen === d.id ? null : d.id)}>
                        <span>
                          {d.name}
                          {visibleClientOf(d) ? <small> · {visibleClientOf(d)!.name}</small> : null}
                        </span>
                        <small>
                          ربح{" "}
                          <bdi dir="ltr" className={d.profitUsd < 0 ? "money-alerts-bad" : undefined}>
                            {formatAmount(d.profitUsd)} $
                          </bdi>{" "}
                          في الشهر {marginOpen === d.id ? "▴" : "▾"}
                        </small>
                      </button>
                      {marginOpen === d.id && (
                        <div className="money-alerts-detail">
                          <p>
                            💵 يدفع لك الزبون شهريًا: <bdi dir="ltr">{formatAmount(d.sale.amount)}</bdi> {currencyLabel(d.sale.currency)}
                            {d.sale.currency !== "USD" && (
                              <>
                                {" "}
                                ÷ <bdi dir="ltr">{formatAmount(d.sale.rateFromUsd)}</bdi> (سعر الدولار اليوم) = <bdi dir="ltr">{formatAmount(d.saleUsd)} $</bdi>
                              </>
                            )}
                          </p>
                          <p>
                            🛰️ تدفع لستارلينك شهريًا: <bdi dir="ltr">{formatAmount(d.cost.amount)}</bdi> {currencyLabel(d.cost.currency)}
                            {d.cost.currency !== "USD" && (
                              <>
                                {" "}
                                ÷ <bdi dir="ltr">{formatAmount(d.cost.rateFromUsd)}</bdi> = <bdi dir="ltr">{formatAmount(d.costUsd)} $</bdi>
                              </>
                            )}
                          </p>
                          <p>
                            {d.profitUsd < 0 ? "🔻 خسارة" : "🟡 ربح"}: <bdi dir="ltr">{formatAmount(d.saleUsd)} $</bdi> − <bdi dir="ltr">{formatAmount(d.costUsd)} $</bdi> ={" "}
                            <bdi dir="ltr" className={d.profitUsd < 0 ? "money-alerts-bad" : undefined}>
                              {formatAmount(d.profitUsd)} $
                            </bdi>{" "}
                            في الشهر{d.suspicious ? "" : ` (${Math.round(d.percent)}% من سعر البيع)`}
                          </p>
                          {d.suspicious && (
                            <p className="money-alerts-bad">
                              ⚠️ هذه الأرقام غير منطقية: غالبًا السعر الشهري مكتوب خطأ (العملة أو المبلغ) في بطاقة الجهاز. صحّحه من «✏️ عدّل السعر الشهري».
                            </p>
                          )}
                          <div className="settings-actions">
                            <button
                              type="button"
                              className="dialog-primary"
                              onClick={() => {
                                const target = accounts.find((a) => a.id === d.id);
                                setMoneyAlertsOpen(false);
                                if (target) setDialog({ mode: "edit", account: target });
                              }}
                            >
                              ✏️ عدّل السعر الشهري
                            </button>
                            <button
                              type="button"
                              className="text-action"
                              onClick={() => {
                                setMoneyAlertsOpen(false);
                                setSelectedDay(null);
                                setStatFilter(null);
                                setQuery(d.name);
                                window.setTimeout(() => document.querySelector(".accounts-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                              }}
                            >
                              📡 افتح بطاقة الجهاز
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
          {(deviceMargins.unpriced > 0 || deviceMargins.noRate > 0) && (
            <p className="settings-hint">
              {deviceMargins.unpriced > 0 && `${deviceMargins.unpriced} ${deviceMargins.unpriced === 1 ? "جهاز" : "أجهزة"} بلا سعر شهري أو تكلفة ستارلينك - لا يُحكم عليها حتى تكتبه في بطاقة الجهاز. `}
              {deviceMargins.noRate > 0 && `${deviceMargins.noRate} بعملة ليس لها سعر صرف مسجّل - سجّله في العملات.`}
            </p>
          )}
          <p className="settings-hint">الربح محسوب بأسعار الصرف المسجّلة اليوم: إذا ارتفع الدولار أو سعر ستارلينك يظهر هنا دون أن تغيّر شيئًا.</p>
        </div>
      </PartySheet>
    )}

    {repInboxPending > 0 && (
      <Link href="/representatives#rep-inbox" className="backup-banner">
        <span aria-hidden="true">📝</span>
        <span>
          <strong>{repInboxPending} تسجيلاً من المندوبين بانتظار موافقتك</strong>
          <small>أجهزة ودفعات وزبائن من تطبيق المندوب - لا يدخل شيء قبل أن تثبّته</small>
        </span>
      </Link>
    )}

    {pendingRepRequestCount > 0 && (
      <Link href="/representatives" className="backup-banner">
        <span aria-hidden="true">📥</span>
        <span>
          <strong>{pendingRepRequestCount === 1 ? "طلب من مندوب بانتظار موافقتك" : `${pendingRepRequestCount} طلبات من المندوبين بانتظار موافقتك`}</strong>
          <small>دفعات أو زبائن جدد أرسلوها من تيليغرام - اضغط للمراجعة</small>
        </span>
      </Link>
    )}

    {repWorkspace && repPendingCount > 0 && (
      <button
        type="button"
        className="rep-send-banner"
        disabled={repSending}
        onClick={async () => {
          setRepSending(true);
          const result = await shareRepChanges();
          setRepSending(false);
          if (result.ok) setRepSent(loadRepChangesSent());
          else pushToast(result.message);
        }}
      >
        <span aria-hidden="true">📤</span>
        <span>
          <strong>{repSending ? "⏳ جارِ التجهيز…" : `إرسال تسجيلاتي للمسؤول (${repPendingCount})`}</strong>
          <small>
            {repSent
              ? `أُرسلت ${repSent.at.slice(0, 16).replace("T", " ")} - بانتظار موافقة المسؤول، ثم تصلك نسخة جديدة`
              : "أجهزتك الجديدة وأسماء أجهزتك وزبائنها - عملياتك وديونك تبقى عندك. اختر تيليغرام ثم بوت المندوبين"}
          </small>
        </span>
      </button>
    )}

    {!repWorkspace && isBackupOverdue(lastBackupAt, 2) && (
      <Link href="/settings#backup" className="backup-banner backup-banner-slim" title="كل بياناتك موجودة على هذا الهاتف فقط - اضغط لحفظ نسخة كاملة الآن">
        <span aria-hidden="true">🛡️</span>
        <strong>{lastBackupAt ? "لا نسخة احتياطية منذ أيام" : "لم تحفظ نسخة احتياطية بعد"}</strong>
        <span className="backup-banner-go">احفظ ‹</span>
      </Link>
    )}
    </>
  );

  // 🖥️ The Windows app: what its dashboard and devices table read (the same lists as the phone's).
  const deskFollow = useMemo(() => followUp(activeAccounts, needsLoginIds), [activeAccounts, needsLoginIds]);
  const deskKpis: DeskKpi[] = [
    { filter: "", label: "كل الأجهزة", value: overview.total, tone: "calm" },
    { filter: "online", label: "متصلة الآن", value: overview.online, tone: "ok" },
    { filter: "expiringSoon", label: "تنتهي قريبًا", value: overview.expiringSoon, tone: "soon" },
    { filter: "expired", label: "منتهية", value: overview.expired, tone: "down" },
    { filter: "suspended", label: "موقوفة", value: overview.suspended, tone: "down" },
    { filter: "faulty", label: "معطلة", value: overview.faulty, tone: "calm" },
  ];
  const deskStatusOptions = (Object.keys(STAT_FILTER_TITLES) as StatFilterKind[]).filter((k) => k !== "rep").map((k) => ({ id: k, label: STAT_FILTER_TITLES[k] }));
  const deskClientOptions = clients.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const deskCategories = useMemo(() => loadClientCategories().map((c) => ({ id: c.id, name: c.name })), []);
  const deskShowDevices = desk && (deskPage === "devices" || query.trim() !== "");
  function deskOpen(account: StarlinkAccountSummary) {
    void openIsolatedAccountBrowser(account.id, account.name || "حساب Starlink", { ...starlinkLoginFor(account), ...mailExtrasFor(account, accounts) }).then((result) => {
      if (!result.ok) window.alert(result.message);
    });
  }
  function deskClearAll() {
    setStatFilter(null);
    setSelectedDay(null);
    setClientFocus(null);
    setFaultFilter(null);
    setQuery("");
    setShowAll(true);
  }
  const deskTopBar = desk && (
    <DeskTopBar
      title={deskShowDevices ? "الأجهزة" : "الرئيسية"}
      subtitle={
        deskShowDevices ? (
          <>
            <bdi className="desk-num">{activeAccounts.length}</bdi> جهاز نشط
          </>
        ) : (
          new Date().toLocaleDateString("ar", { weekday: "long", day: "numeric", month: "long" })
        )
      }
      search={query}
      onSearch={startSearch}
      action={
        <button type="button" className="desk-btn desk-btn-primary" onClick={() => setDialog({ mode: "add" })}>
          ＋ إضافة جهاز
        </button>
      }
    />
  );
  return (
    <main className="home app-shell">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      {ringMenu && (
        <RingActionsSheet
          title={ringMenu.kind === "all" ? "كل الأجهزة" : ringMenu.kind === "rep" ? `🤝 ${ringMenu.label}` : ringMenu.label}
          count={ringMembers(ringMenu.kind, ringMenu.repId).length}
          question={ringMenu.kind === "travel" ? "هل يحتاج توثيق السفر؟ (الصفحة الرئيسية فقط)" : ringQuestion(ringMenu.kind, ringMenu.label).question}
          onCheck={() => void runRingCheck(ringMenu.kind, ringMenu.label, ringMenu.repId, false)}
          onBackground={() => void runRingCheck(ringMenu.kind, ringMenu.label, ringMenu.repId, true)}
          onClose={() => setRingMenu(null)}
        >
          {ringMenu.kind === "duplicate" && !isRepWorkspace() && (
            <button type="button" className="card-more-item" onClick={mergeAllDuplicates}>
              <span aria-hidden="true">🔗</span> دمج كل المكرر <small>المكرر يذهب للسلة</small>
            </button>
          )}
          {ringMenu.kind === "duplicate" && !isRepWorkspace() && (
            <button type="button" className="card-more-item" onClick={clearAllDuplicates}>
              <span aria-hidden="true">✕</span> إزالة علامة «مكرّر» عن الكل <small>ليست أجهزة مكررة</small>
            </button>
          )}
          {ringMenu.kind === "fromRep" && (
            <button
              type="button"
              className="card-more-item"
              onClick={() => {
                setRingMenu(null);
                const targets = ringMembers("fromRep");
                if (window.confirm(`إزالة علامة «📱 أضافه المندوب» عن ${targets.length} جهاز؟`)) handleClearRepAdded(targets);
              }}
            >
              <span aria-hidden="true">✕</span> إزالة علامة المندوب عن الكل
            </button>
          )}
        </RingActionsSheet>
      )}
      {longPressDay !== null && (
        <DayActionsSheet
          day={longPressDay}
          dayAccounts={accountsForDay(activeAccounts, longPressDay)}
          reps={representativeStore}
          phoneFor={(account) => messagePhoneOf(account)}
          onSync={(owner, ownerLabel) => syncDay(longPressDay, owner, ownerLabel)}
          onTravelCheck={(owner, ownerLabel) => travelCheckDay(longPressDay, owner, ownerLabel)}
          onClose={() => setLongPressDay(null)}
        />
      )}
      {travelResult && (
        <TravelCheckSheet
          {...travelResult}
          accounts={accounts}
          reps={representativeStore}
          phoneFor={(account) => messagePhoneOf(account)}
          onDone={handleTravelDone}
          onClose={() => setTravelResult(null)}
        />
      )}
      {syncChoiceOpen && <SyncChoiceSheet accounts={accounts} today={localToday()} onPick={startSyncRun} onTravelAll={travelCheckAll} onClose={() => setSyncChoiceOpen(false)} />}
      {queueStep && (
        <SyncQueueBar
          label={queueStep.label}
          progress={queueStep.progress}
          nextName={queueStep.name}
          secondsLeft={queueStep.secondsLeft}
          onNow={() => void runNextQueued()}
          onStop={stopSyncRun}
        />
      )}
      {oceanShown && (
        <OceanModeAlarm
          devices={oceanDevices}
          onOpen={(account) => {
            void openIsolatedAccountBrowser(account.id, account.name || "حساب Starlink", { ...starlinkLoginFor(account), ...mailExtrasFor(account, accounts) }).then((result) => {
              if (!result.ok) pushToast(result.message);
            });
          }}
          onDismiss={() => setOceanDismissed(oceanDevices.map((a) => a.id))}
        />
      )}
      {deskTopBar}

      {!desk && (
      <>
      <header className="app-header app-header-compact">
        <HeaderMore />
        <NotificationsBell />
        <div className="brand-lockup">
          <span className="brand-logo" aria-hidden="true">★</span>
          <span className="brand-mark">STAR NET</span>
        </div>
      </header>

      <nav className="home-shortcuts" aria-label="اختصارات">
        <Link href="/tools#today" className="home-shortcut">
          <span aria-hidden="true">✅</span>
          خطة اليوم
        </Link>
        <Link href="/tools#pay" className="home-shortcut">
          <span aria-hidden="true">💵</span>
          دفعة سريعة
        </Link>
        <Link href="/tools#promises" className="home-shortcut">
          <span aria-hidden="true">🤝</span>
          الوعود
          {duePromiseCount > 0 && <b className="home-shortcut-badge">{duePromiseCount}</b>}
        </Link>
        <Link href="/tools" className="home-shortcut">
          <span aria-hidden="true">🧰</span>
          الأدوات
        </Link>
      </nav>
      </>
      )}

      {!desk && noticesNode}

      {!desk && (
      <>
      <section className="search-panel" aria-label="البحث في الحسابات">
        <span className="search-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
        </span>
        <input
          className="search-input dashboard-search"
          type="search"
          inputMode="search"
          placeholder="ابحث: جهاز، Kit، اشتراك، زبون، هاتف، مندوب…"
          value={query}
          onChange={(e) => startSearch(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          // Later, so a tap on a past search lands before the list closes.
          onBlur={() => window.setTimeout(() => setSearchFocused(false), 200)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              rememberSearch(query);
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label="بحث"
        />
      </section>

      {searchFocused && !query.trim() && searchHistory.length > 0 && (
        <section className="search-history" aria-label="عمليات البحث السابقة">
          <div className="search-history-head">
            <span>🕘 بحثت عن</span>
            <button type="button" className="btn-link" onMouseDown={(e) => e.preventDefault()} onClick={() => { setSearchHistory([]); saveSearchHistory([]); }}>
              مسح الكل
            </button>
          </div>
          <ul>
            {searchHistory.map((term) => (
              <li key={term}>
                <button type="button" className="search-history-term" dir="auto" onMouseDown={(e) => e.preventDefault()} onClick={() => { startSearch(term); rememberSearch(term); }}>
                  {term}
                </button>
                <button type="button" className="search-history-drop" aria-label={`إزالة ${term}`} onMouseDown={(e) => e.preventDefault()} onClick={() => forgetSearch(term)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      </>
      )}

      {query.trim() && fuzzySearch && (
        <p className="search-fuzzy-note" role="status">
          {filtered.length > 0 ? <>🔤 لا شيء يطابق «<bdi>{query.trim()}</bdi>» تمامًا - هذه أقرب النتائج (ربما خطأ في الكتابة)</> : <>لا نتيجة لـ «<bdi>{query.trim()}</bdi>»</>}
        </p>
      )}

      {searchResults.length > 0 && (
        <section className="global-search-results" aria-label="نتائج أخرى">
          {searchResults.map((result) => (
            <SearchResultRow key={`${result.kind}-${result.id}`} result={result} onOpenClient={(id) => setClientMenuId(id)} />
          ))}
        </section>
      )}

      <div className="conn-row">
        <ConnectionStatus />
        {(dataState === "loading" || (dataState === "demo" && !accountsLoaded)) && <span className="conn-badge conn-checking">جارِ تحميل البيانات…</span>}
        {dataState === "error" && (
          <div className="account-card-alert conn-error-row">
            {errorMessage}
            <button className="btn-link" onClick={loadRealAccounts}>
              إعادة المحاولة
            </button>
          </div>
        )}
      </div>

      {!desk && (
      <HelpHint
        title="الصفحة الرئيسية"
        steps={[
          "اضغط على أي يوم في التقويم لعرض الحسابات المستحقة للتجديد في ذلك اليوم.",
          "اضغط 'التفاصيل' على أي حساب ثم 'إضافة دفعة' لتسجيل أول مبلغ - اختر 'عليه' لشحنة جديدة أو 'له' لدفعة استلمتها.",
          "استخدم زر + في الأسفل للوصول إلى العملات وسلة المحذوفات والأرشيف.",
        ]}
      />
      )}

      {desk && !deskShowDevices && (
        <DeskDashboard
          kpis={deskKpis}
          total={overview.total}
          follow={deskFollow}
          dayCounts={dayCounts}
          devicesOnDay={(day) => activeAccounts.filter((a) => deviceDayKeys(a).includes(day))}
          clientName={(a) => visibleClientOf(a)?.name ?? ""}
          customersOwe={totalOwedAcrossAccounts(ledgerStore)}
          stoppedWithD={suspendedWithDebt.length}
          allLists={ringsNode}
          notices={noticesNode}
        />
      )}

      {viewMode === "active" && !desk && (
        <>
          {ringsNode}

          <section className="section dashboard-section">
            <div className="section-heading">
              <div>
                <h2 className="section-title">التجديد حسب اليوم</h2>
                <p className="section-caption">اضغط على اليوم لعرض الحسابات</p>
              </div>
              {selectedDay !== null && (
                <button className="clear-filter" onClick={() => setSelectedDay(null)}>إلغاء التصفية</button>
              )}
            </div>
            <DayCircles
              counts={dayCounts}
              selectedDay={selectedDay}
              onSelectDay={(day) => { setSelectedDay(day); setStatFilter(null); }}
              onLongPressDay={setLongPressDay}
            />
          </section>
        </>
      )}

      {(!desk || deskShowDevices) && (
      <section className="section dashboard-section accounts-section">
        <div className="section-header-row">
          <div>
            <h2 className="section-title">
              {viewMode === "archived" ? "الأرشيف"
                : viewMode === "trash" ? "سلة المحذوفات"
                : clientFocus
                  ? `👤 أجهزة ${getClient(clientStore, clientFocus)?.name ?? "الزبون"}${statFilter ? ` · ${STAT_FILTER_TITLES[statFilter]}` : ""}`
                : statFilter
                  ? statFilter === "rep" ? `🤝 أجهزة ${getRepresentative(representativeStore, repRingId ?? undefined)?.name ?? "المندوب"}` : STAT_FILTER_TITLES[statFilter]
                  : showAll || query || selectedDay !== null ? "الحسابات" : "تحتاج إلى متابعة"}
            </h2>
            <p className="section-caption">
              {visible.length} حساب
              {clientFocus && viewMode === "active" && (
                <>
                  {" · "}
                  <button type="button" className="btn-link" onClick={() => { setClientFocus(null); setStatFilter(null); }}>
                    ✕ كل الأجهزة
                  </button>
                </>
              )}
            </p>
          </div>
          {viewMode === "active" && (
            statFilter ? (
              <div className="section-header-actions">
                {statFilter === "fromRep" && visible.length > 0 && (
                  <button
                    className="text-action"
                    onClick={() => {
                      if (window.confirm(`إزالة علامة «📱 أضافه المندوب» عن ${visible.length} جهاز؟\n\nتبقى الأجهزة عند مندوبيها كما هي - تُزال العلامة فقط.`)) handleClearRepAdded(visible);
                    }}
                  >
                    ✕ إزالة العلامة عن الكل
                  </button>
                )}
                {statFilter === "duplicate" && visible.length > 0 && !isRepWorkspace() && (
                  <>
                    <button className="text-action" onClick={mergeAllDuplicates}>
                      🔗 دمج كل المكرر
                    </button>
                    <button className="text-action" onClick={clearAllDuplicates}>
                      ✕ إزالة العلامة عن الكل
                    </button>
                  </>
                )}
                <button className="text-action" onClick={() => setStatFilter(null)}>مسح التصفية</button>
              </div>
            ) : (
              !query && selectedDay === null && (
                <button className="text-action" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "عرض المنتهية فقط" : "عرض كل الحسابات"}
                </button>
              )
            )
          )}
        </div>

        {viewMode === "active" && statFilter === "faulty" && (
          <div className="fault-groups" role="radiogroup" aria-label="نوع العطل">
            <button type="button" className={`fault-group${faultFilter === null ? " fault-group-active" : ""}`} onClick={() => setFaultFilter(null)}>
              الكل ({overview.faulty})
            </button>
            {FAULT_CATEGORIES.filter((c) => c.reason !== "other" || faultCounts.other > 0).map((c) => (
              <button
                key={c.reason}
                type="button"
                className={`fault-group${faultFilter === c.reason ? " fault-group-active" : ""}`}
                onClick={() => setFaultFilter(c.reason)}
              >
                {c.icon} {c.label} ({faultCounts[c.reason]})
              </button>
            ))}
          </div>
        )}

        {viewMode === "active" && statFilter === "outsideHome" && (
          <OutsideHomePanel
            days={outsideHomeDays}
            repName={(a) => getRepresentative(representativeStore, a.representativeId)?.name}
            onPick={(a) => document.querySelector(`[data-account-id="${a.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
          />
        )}

        {viewMode === "active" && statFilter === "travelDone" && (
          <TravelBookPanel
            book={travelBook}
            accounts={activeAccounts}
            group={travelGroup}
            onGroup={setTravelGroup}
            onRepPercent={handleRepTravelPercent}
            onPostOldDebts={postOldTravelDebts}
          />
        )}

        {viewMode === "active" && statFilter === "noClient" && (
          <div className="fault-groups" role="radiogroup" aria-label="بدون زبون: أجهزة من؟">
            <button type="button" className={`fault-group${noClientGroup === "all" ? " fault-group-active" : ""}`} onClick={() => setNoClientGroup("all")}>
              الكل ({noClient.total})
            </button>
            <button type="button" className={`fault-group${noClientGroup === "mine" ? " fault-group-active" : ""}`} onClick={() => setNoClientGroup("mine")}>
              🏠 أجهزتي ({noClient.mine})
            </button>
            {noClient.reps.map((r) => (
              <button
                key={r.repId}
                type="button"
                className={`fault-group${noClientGroup === r.repId ? " fault-group-active" : ""}`}
                onClick={() => setNoClientGroup(r.repId)}
              >
                📱 {r.name} ({r.count})
              </button>
            ))}
          </div>
        )}

        {visible.length === 0 ? (
          <p className="empty-state">
            {viewMode === "archived" ? "لا توجد أجهزة مؤرشفة."
              : viewMode === "trash" ? "سلة المحذوفات فارغة."
              : "لا توجد حسابات مطابقة."}
          </p>
        ) : (
          desk ? (
            <DeskDevices
              devices={visible}
              clientName={(a) => visibleClientOf(a)?.name ?? ""}
              clientCategories={(a) => visibleClientOf(a)?.categories ?? []}
              categories={deskCategories}
              entries={(a) => getAccountEntries(ledgerStore, a.id)}
              note={(a) => deviceNotes[a.id]}
              renderCard={renderCard}
              onOpen={deskOpen}
              onPay={(a) => {
                setLedgerForPayment(true);
                setLedgerAccount(a);
              }}
              onEdit={(a) => setDialog({ mode: "edit", account: a })}
              onStatement={(a) => setStatementAccount(a)}
              status={statFilter ?? ""}
              statusOptions={deskStatusOptions}
              onStatus={(id) => {
                setStatFilter(id ? (id as StatFilterKind) : null);
                setSelectedDay(null);
                setShowAll(true);
              }}
              clientId={clientFocus ?? ""}
              clientOptions={deskClientOptions}
              onClient={(id) => setClientFocus(id || null)}
              onClearAll={deskClearAll}
              initialSelectedId={deskInit.id ?? null}
              initialExpiry={deskInit.exp}
            />
          ) : (
          <div className="account-grid">
            {visible.map((account) => renderCard(account))}
          </div>
          )
        )}
      </section>
      )}

      {travelFeeSent && (() => {
        const device = accounts.find((a) => a.id === travelFeeSent.accountId);
        if (!device) return null;
        const hiddenRep = isHiddenRepDevice(device, hiddenReps);
        const owner = hiddenRep ? repContact(device, representativeStore)?.name : visibleClientOf(device)?.name;
        const message = buildAccountStatementMessage(device.name, getAccountEntries(ledgerStore, device.id), allAllocations);
        const phone = messagePhoneOf(device);
        // No number → WhatsApp opens on the statement and he picks the contact (as the travel message does).
        const link = buildWhatsAppLink(phone, message) ?? `https://wa.me/?text=${encodeURIComponent(message)}`;
        return (
          <PartySheet title={`🛂 ${device.name}`} onClose={() => setTravelFeeSent(null)}>
            <p className="settings-hint">
              {travelFeeSent.text}
              {owner ? ` على «${owner}»` : ""} - في كشف الجهاز.
            </p>
            <div className="party-sheet-options">
              <a
                className="dialog-primary travel-fee-send"
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setTravelFeeSent(null)}
              >
                💬 أرسل له كشفه{phone ? "" : " (اختر الرقم)"}
              </a>
              <button type="button" className="dialog-secondary" onClick={() => setTravelFeeSent(null)}>
                لاحقًا
              </button>
            </div>
          </PartySheet>
        );
      })()}

      {unpinAsk && !ledgerAccount && isPinned(deviceNotes, unpinAsk) && (() => {
        const device = accounts.find((a) => a.id === unpinAsk);
        const note = deviceNotes[unpinAsk];
        return (
          <PartySheet title={`📌 ${device?.name ?? "الجهاز"} مثبت`} onClose={() => setUnpinAsk(null)}>
            <p className="settings-hint">سجّلت له تجديدًا أو دفعة - هل انتهى سبب تثبيته؟</p>
            {note?.text && <p className="device-note-ask-text" dir="auto">📝 {note.text}</p>}
            <div className="party-sheet-options">
              <button
                type="button"
                className="dialog-primary"
                onClick={() => {
                  commitDeviceNotes(setDevicePinned(loadDeviceNotes(), unpinAsk, false));
                  setUnpinAsk(null);
                  pushToast("📌 أُزيل التثبيت - الملاحظة باقية");
                }}
              >
                🧹 إزالة التثبيت
              </button>
              <button type="button" className="dialog-secondary" onClick={() => setUnpinAsk(null)}>
                أبقِه مثبتًا
              </button>
            </div>
          </PartySheet>
        );
      })()}

      {viewMode === "active" && !dialog && !ledgerAccount && !desk && (
        <HomeFab onAddDevice={() => setDialog({ mode: "add" })} />
      )}

      {dialog && (
        <AccountDialog
          mode={dialog.mode}
          account={dialog.account}
          prefill={dialog.prefill}
          startCreating={dialog.startCreating}
          activating={dialog.activating}
          clients={clients}
          onCreateClient={handleCreateClient}
          representatives={representatives}
          onCreateRepresentative={handleCreateRepresentative}
          onClose={() => {
            repDeviceRequestRef.current = null;
            setDialog(null);
          }}
          onSave={saveAccount}
          onDelete={ownerView ? deleteAccount : undefined}
          existingAccounts={accounts}
        />
      )}

      {ledgerAccount && (
        <LedgerDialog
          accountId={ledgerAccount.id}
          accountName={ledgerAccount.name}
          accountEmail={ledgerAccount.expectedEmail || ledgerAccount.starlinkAccountEmail}
          entries={getAccountEntries(ledgerStore, ledgerAccount.id)}
          siblingDevices={
            ledgerAccount.clientId
              ? accounts
                  .filter((a) => a.clientId === ledgerAccount.clientId && a.id !== ledgerAccount.id)
                  .map((a) => ({ accountId: a.id, accountName: a.name, entries: getAccountEntries(ledgerStore, a.id) }))
              : []
          }
          currencyStore={currencyStore}
          onUpsertCurrency={handleUpsertCurrency}
          allocations={allAllocations}
          onAddAllocations={(newOnes) => addAllocationsToAccount(ledgerAccount.id, newOnes)}
          onRemoveEntryAllocations={removeAllocationsEverywhere}
          onClose={() => {
            setLedgerAccount(null);
            setLedgerForPayment(false);
          }}
          initialKind={ledgerForPayment ? "credit" : "debit"}
          onChange={(entries) => updateLedgerEntries(ledgerAccount.id, entries)}
          renewalPlan={ledgerAccount.renewalPlan}
          starlinkInfo={{
            serviceCountry: ledgerAccount.serviceCountry,
            currency: ledgerAccount.currency,
            balanceDue: ledgerAccount.balanceDue,
          }}
          clientName={visibleClientOf(ledgerAccount)?.name ?? (isHiddenRepDevice(ledgerAccount, hiddenReps) ? repContact(ledgerAccount, representativeStore)?.name : undefined)}
          clientPhone={messagePhoneOf(ledgerAccount)}
          representative={(() => {
            const rep = getRepresentative(representativeStore, shipmentRepId(ledgerAccount, getClient(clientStore, ledgerAccount.clientId)));
            return rep ? { id: rep.id, commissionPercent: rep.commissionPercent, sharesLosses: rep.sharesLosses, ratePlan: rep.usdRates } : undefined;
          })()}
        />
      )}

      {statementAccount && (
        <DeviceStatementDialog
          accountName={statementAccount.name}
          entries={getAccountEntries(ledgerStore, statementAccount.id)}
          allocations={allAllocations}
          allEntries={allLedgerEntries}
          onEditEntry={setEditingStatementEntry}
          onDeleteEntry={(entry) => {
            const result = confirmAndDeleteLedgerEntry(ledgerStore, statementAccount.id, entry, statementAccount.name);
            if (!result) return;
            setLedgerStore(result.ledgerStore);
            setAllocationStore(result.allocations);
            pushToast("🗑 حُذفت العملية");
          }}
          onClose={() => setStatementAccount(null)}
        />
      )}

      {statementAccount && editingStatementEntry && (
        <LedgerEntryEditor
          accountId={statementAccount.id}
          entry={editingStatementEntry}
          deviceName={statementAccount.name}
          ledgerStore={ledgerStore}
          onSaved={setLedgerStore}
          onClose={() => setEditingStatementEntry(null)}
        />
      )}

      {syncRun && (runActive || runNow - (syncRun.endedAt ?? syncRun.lastActivityAt) < 3 * 60_000) && (
        <SyncRunLine run={syncRun} now={runNow} onRetry={(ids) => void retryRun(ids)} onShowDevice={showRunDevice} onDismiss={() => commitRun(null)} />
      )}

      {clientMenuId && getClient(clientStore, clientMenuId) && (() => {
        const mine = activeAccounts.filter((a) => a.clientId === clientMenuId);
        return (
          <ClientSearchSheet
            name={getClient(clientStore, clientMenuId)!.name}
            deviceCount={mine.length}
            expiredCount={mine.filter((a) => matchesStatFilter(a, "expired")).length}
            syncCount={mine.filter((a) => !syncedOnlyByCommand(a)).length}
            onShowDevices={() => focusClient(clientMenuId, false)}
            onShowExpired={() => focusClient(clientMenuId, true)}
            onSync={() => void syncClient(clientMenuId, false)}
            onSyncBackground={() => void syncClient(clientMenuId, true)}
            onOpenFile={() => { setOpenClientId(clientMenuId); setClientMenuId(null); }}
            onClose={() => setClientMenuId(null)}
          />
        );
      })()}

      {openClientId && getClient(clientStore, openClientId) && (
        <ClientDialog
          client={getClient(clientStore, openClientId)!}
          devices={accounts.filter((account) => account.clientId === openClientId)}
          ledgerStore={ledgerStore}
          allocationStore={allocationStore}
          onClose={() => setOpenClientId(null)}
          onSave={(patch) => handleUpdateClient(openClientId, { ...patch, creditLimit: getClient(clientStore, openClientId)?.creditLimit })}
          onDelete={() => handleDeleteClient(openClientId)}
          onLedgerChange={setLedgerStore}
        />
      )}

      {showClientsOverview && (
        <ClientsOverviewDialog
          clientStore={clientStore}
          accounts={accounts}
          ledgerStore={ourDebtLedgerForClients(ledgerStore, accounts, Object.values(clientStore))}
          onClose={() => setShowClientsOverview(false)}
          onOpenLedger={(account) => {
            setShowClientsOverview(false);
            setLedgerAccount(account);
          }}
          onOpenClient={(client) => {
            setShowClientsOverview(false);
            setOpenClientId(client.id);
          }}
        />
      )}
    </main>
  );
}

const SEARCH_KIND_LABELS: Record<SearchResult["kind"], { icon: string; label: string; href?: string }> = {
  client: { icon: "👤", label: "زبون" },
  supplier: { icon: "🏭", label: "مورد", href: "/clients" },
  representative: { icon: "🤝", label: "مندوب", href: "/representatives" },
  item: { icon: "📦", label: "منتج", href: "/store" },
};

function SearchResultRow({ result, onOpenClient }: { result: SearchResult; onOpenClient: (id: string) => void }) {
  const meta = SEARCH_KIND_LABELS[result.kind];
  const body = (
    <>
      <span className="global-search-icon" aria-hidden="true">{meta.icon}</span>
      <span className="global-search-text">
        <strong>{result.title}</strong>
        {result.subtitle && <small dir="ltr">{result.subtitle}</small>}
      </span>
      <span className="global-search-kind">{meta.label}</span>
    </>
  );
  if (result.kind === "client") {
    return (
      <button type="button" className="global-search-row" onClick={() => onOpenClient(result.id)}>
        {body}
      </button>
    );
  }
  return (
    <Link href={meta.href!} className="global-search-row">
      {body}
    </Link>
  );
}

type StatusTone =
  | "total" | "online" | "warning" | "expired" | "suspended" | "recent" | "notRenewed" | "pinned" | "faulty" | "repair" | "travel" | "travelDone" | "fromRep" | "noClient"
  | "notCanceled" | "canceled" | "renewed" | "sis" | "rom" | "g100" | "duplicate" | "rep" | "toSis" | "toStop" | "outsideHome" | "pending";

const RING_LONG_PRESS_MS = 550;

/** One circular status counter: a ring filled by this status's share of all devices, its icon and
 * count inside, the label underneath. Tapping filters the list (or shows all, for the total). */
function StatusRing({
  tone,
  value,
  total,
  label,
  icon,
  active = false,
  tour,
  color,
  onClick,
  onLongPress,
}: {
  tone: StatusTone;
  value: number;
  total: number;
  label: string;
  icon: ReactNode;
  active?: boolean;
  /** «ما الجديد» points at it (data-tour). */
  tour?: string;
  /** 🤝 A rep's own color (his circle). */
  color?: string;
  onClick: () => void;
  /** 🔍 Long press: the circle's check (RingActionsSheet). */
  onLongPress?: () => void;
}) {
  const share = total > 0 ? Math.min(1, value / total) : 0;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The click that ends a long press must not also filter.
  const longPressed = useRef(false);
  const cancelPress = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <button
      type="button"
      className={`status-ring status-ring-${tone}${active ? " status-ring-active" : ""}`}
      style={color ? ({ "--tone": color } as CSSProperties) : undefined}
      aria-pressed={tone === "total" ? undefined : active}
      aria-label={`${label}: ${value}`}
      data-tour={tour}
      onPointerDown={() => {
        longPressed.current = false;
        if (!onLongPress) return;
        cancelPress();
        timer.current = setTimeout(() => {
          longPressed.current = true;
          onLongPress();
        }, RING_LONG_PRESS_MS);
      }}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onClick();
      }}
    >
      <span className="status-ring-dial" style={{ "--share": share } as CSSProperties}>
        <span className="status-ring-core">
          <span className="status-ring-icon" aria-hidden="true">{icon}</span>
          <span className="status-ring-value">{value}</span>
        </span>
      </span>
      <span className="status-ring-label">{label}</span>
    </button>
  );
}

const ringIconProps = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function IconGrid() {
  return (
    <svg {...ringIconProps}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </svg>
  );
}

function IconSignal() {
  return (
    <svg {...ringIconProps}>
      <path d="M5 12.5a10 10 0 0 1 14 0" />
      <path d="M8.2 15.6a5.5 5.5 0 0 1 7.6 0" />
      <circle cx="12" cy="19" r="1" fill="currentColor" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg {...ringIconProps}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 1.8" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg {...ringIconProps}>
      <path d="M12 4 21 19.5H3z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg {...ringIconProps}>
      <circle cx="12" cy="12" r="8" />
      <path d="M10 9v6M14 9v6" />
    </svg>
  );
}
