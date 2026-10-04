"use client";

import { isRepWorkspace } from "@/lib/repMode";
import { deviceTwins, mergeDevices } from "@/lib/deviceMerge";
import { currentRepPending } from "@/lib/repWorkspace";
import { loadRepChangesSent, shareRepChanges, type RepChangesSent } from "@/lib/repChangesSend";
import { REP_INBOX_EVENT, repInboxCount } from "@/lib/repInbox";
import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import { expiryDay } from "@starnet/shared";
import { AccountCard, AccountCardContext } from "./AccountCard";
import { DayCircles } from "./DayCircles";
import { ConnectionStatus } from "./ConnectionStatus";
import { AccountDialog, AccountDialogMode } from "./AccountDialog";
import { HomeFab } from "./HomeFab";
import { HeaderMore } from "./BottomNav";
import { pruneOrphanProofs } from "@/lib/paymentProofStore";
import { buildAutoSyncList } from "@/lib/autoSyncList";
import { LedgerDialog } from "./LedgerDialog";
import { ClientDialog } from "./ClientDialog";
import { ClientsOverviewDialog } from "./ClientsOverviewDialog";
import { ourDebtLedgerForClients, autoMoveClientToRep } from "@/lib/repClients";
import { LedgerEntryEditor } from "./LedgerEntryEditor";
import { DeviceStatementDialog } from "./DeviceStatementDialog";
import { ToastMessage, ToastStack } from "./ToastStack";
import { HelpHint } from "./HelpHint";
import { daysRemainingNumber } from "@/lib/date";
import { computeDeviceDebtReminders, computeRenewalReminders, computeRestrictedDeviceReminders, isBackupOverdue } from "@/lib/reminders";
import { formatAmount } from "@/lib/formatAmount";
import { applyLedgerPaymentsToCash, loadCashEntries, saveCashEntries } from "@/lib/cashStore";
import { parseNewDevicePrefill } from "@/lib/deviceFromSale";
import { adoptRepDevice, repDeviceSecrets } from "@/lib/repDeviceAdopt";
import { bucketPromises, loadPromises } from "@/lib/paymentPromises";
import { HOME_ACTION_EVENT, HOME_SEARCH_EVENT, HomeAction, parseHomeAction, parseHomePayment, REMINDER_COUNT_EVENT, parseHomeSearch } from "@/lib/homeActions";
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
import { isTelegramConnected, rescheduleTelegramSummaries, sendTelegramText } from "@/lib/telegram";
import { loadPriorityAlerted, priorityAlertsToSend, priorityTelegramText, savePriorityAlerted } from "@/lib/priorityData";
import { loadOceanAlerted, oceanAlertsToSend, oceanModeAccounts, oceanTelegramText, saveOceanAlerted } from "@/lib/oceanMode";
import { OceanModeAlarm } from "./OceanModeAlarm";
import { cardShortfallForSuspended, currentCardBalanceUsd, listOpenShipmentDebts, listSuspendedWithDebt, settleShipmentCost } from "@/lib/starlinkDebt";
import { APK_DOWNLOAD_URL, checkForAppUpdate, shouldAutoCheck } from "@/lib/appUpdate";
import { deviceMatchesQuery, searchEverything, SearchResult } from "@/lib/homeInsights";
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
  saveClientStore,
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
} from "@/lib/repStore";
import { CurrencyStore, getCurrency, loadCurrencyStore, saveCurrencyStore, upsertCurrency, UpsertCurrencyInput } from "@/lib/currencyStore";
import { countFaultCategories, FAULT_CATEGORIES, faultCategory, isFaulty, isUnderRepair, openDebtEntries, restoreWaivedDebts, waiveOpenDebts } from "@/lib/deviceFault";
import type { DeviceFaultReason } from "@starnet/shared";
import { listOpenPreviousDebts, loadPreviousDebts, recordPreviousDebt, savePreviousDebts, type PreviousDebtList } from "@/lib/previousDebt";
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
import { loadDemoAccounts, saveDemoAccounts } from "@/lib/demoAccountStore";
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
import { loadSyncQueue, localToday, nextQueuedAccount, queueProgressLabel, saveSyncQueue, startSyncQueue, syncedOnlyByCommand, syncQueueFor, type SyncWindow } from "@/lib/syncQueue";
import { DayActionsSheet } from "./DayActionsSheet";
import { accountsForDay } from "@/lib/dayActions";
import { applyOutcomes, buildSyncReport, outcomeLabel, signedOutAlert } from "@/lib/syncReport";
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
import { PendingSyncLike, reapplyCachedSyncedFields, runSyncBatch } from "@/lib/starlinkSync";
import { getCachedSyncedFields, saveSyncedFieldsCache } from "@/lib/syncedFieldsCache";
import { resolveAccountDeletion } from "@starnet/local-browser-plugin";

const NEAR_EXPIRY_THRESHOLD_DAYS = 3;

type DataState = "demo" | "loading" | "loaded" | "error";
type DialogState = { mode: AccountDialogMode; account?: StarlinkAccountSummary; prefill?: Partial<StarlinkAccountSummary> } | null;

/** Which dashboard summary card (see the "ملخص الحسابات" section) the account list is currently
 * narrowed to - tapping a card sets this, tapping it again (or "مسح التصفية") clears it. Mutually
 * exclusive with `selectedDay` (picking one clears the other, see toggleStatFilter) - both are
 * ways of narrowing the SAME list, and combining them silently would be confusing rather than
 * useful. `total` never appears as a value: tapping "كل الحسابات" is just `showAll`, not a real
 * per-account filter. */
type StatFilterKind = "online" | "expiringSoon" | "expired" | "suspended" | "faulty" | "repair" | "fromRep";

const STAT_FILTER_TITLES: Record<StatFilterKind, string> = {
  online: "الحسابات المتصلة الآن",
  expiringSoon: "الحسابات القريبة من الانتهاء",
  expired: "الحسابات المنتهية",
  suspended: "الحسابات المتوقفة (فوترة)",
  faulty: "الأجهزة المعطلة",
  repair: "قيد الإصلاح (مع الدعم الفني)",
  fromRep: "أجهزة أضافها المندوبون",
};

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

export function HomeView({
  accounts: demoAccounts,
  viewMode = "active",
}: {
  accounts: StarlinkAccountSummary[];
  /** Which of the three device lists this page shows - set once per route ("/" -> "active",
   * "/archive" -> "archived", "/trash" -> "trash", each its own bottom-nav destination) rather
   * than an in-page toggle, since switching between them is now a full navigation. Never mixed
   * into the normal dashboard list/filters/stat tiles below (those always operate on "active"
   * devices only). */
  viewMode?: AccountCardContext;
}) {
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
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [statFilter, setStatFilter] = useState<StatFilterKind | null>(null);
  /** One group of «المعطلة» (ملغي / محروق / منقول / إيميل غير رئيسي), or all of them. */
  const [faultFilter, setFaultFilter] = useState<DeviceFaultReason | null>(null);

  function toggleStatFilter(kind: StatFilterKind) {
    setStatFilter((current) => (current === kind ? null : kind));
    setSelectedDay(null);
  }
  const [showAll, setShowAll] = useState(false);
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
        prefill: {
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
    const timer = window.setTimeout(() => void pruneOrphanProofs(loadLedgerStore()), 4000);
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
    // Every device payment also moves money into الكاش - computed from the current (pre-edit)
    // entries, outside the state updater so it runs exactly once.
    const deviceName = accounts.find((a) => a.id === accountId)?.name ?? "";
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
  const [showClientsOverview, setShowClientsOverview] = useState(false);

  function handleCreateClient(input: CreateClientInput): Client {
    const result = createClient(clientStore, input);
    setClientStore(result.store);
    saveClientStore(result.store);
    return result.client;
  }

  function handleUpdateClient(clientId: string, patch: CreateClientInput) {
    setClientStore((current) => {
      const next = updateClient(current, clientId, patch);
      saveClientStore(next);
      return next;
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
      const next = deleteClient(current, clientId);
      saveClientStore(next);
      return next;
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
  const QUEUE_COUNTDOWN_S = 1;

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
    const records = await takeAutoSyncResults();
    let queue = loadSyncQueue();
    if (!queue) {
      setQueueStep(null);
      // A single card's «تحديث من Starlink» that couldn't sync: say why.
      for (const record of records) {
        if (record.outcome === "ok") continue;
        const name = accountsRef.current.find((a) => a.id === record.accountId)?.name ?? "";
        pushToast(`${name}: ${outcomeLabel(record.outcome)}`);
      }
      return;
    }
    const applied = applyOutcomes(queue, records);
    queue = applied.queue;
    saveSyncQueue(queue);
    for (const id of applied.newlySignedOut) {
      const account = accountsRef.current.find((a) => a.id === id);
      reportSync(signedOutAlert(account), deviceRoute(account?.name ?? ""));
    }
    const next = nextQueuedAccount(queue, accountsRef.current);
    if (!next) {
      saveSyncQueue(null);
      setQueueStep(null);
      reportSync(buildSyncReport({ ...queue, index: queue.ids.length }, accountsRef.current));
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
    const result = await openAutoSync(next.account, `${queue.label} · ${queueProgressLabel(queue, next.index)}`);
    if (!result.ok) {
      saveSyncQueue(null);
      pushToast(result.message);
    }
  }

  /** 🌙 The operator chose the background sync (settings): the devices are read without opening
   * their pages. Returns false when it can't run (permission missing) - the visible run is used. */
  async function trySyncInBackground(ids: string[], label: string): Promise<boolean> {
    if (!isBackgroundSyncEnabled()) return false;
    const list = ids
      .map((id) => accountsRef.current.find((a) => a.id === id))
      .filter((a): a is StarlinkAccountSummary => Boolean(a))
      .map((a) => ({ id: a.id, name: a.name }));
    if (await startBackgroundSync(list, label)) {
      pushToast(`🌙 بدأت المزامنة في الخلفية (${list.length} جهاز) - تابعها في الإشعار، والنتيجة في البوت`);
      return true;
    }
    pushToast("⚠️ اسمح بـ«الظهور فوق التطبيقات» من الإعدادات لتعمل المزامنة في الخلفية - تعمل الآن بالطريقة العادية");
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
    void takeAutoSyncResults().then(() => {
      saveSyncQueue(queue);
      void runNextQueued();
    });
  }

  // 📅 Long press on a calendar day: that day's actions (DayActionsSheet).
  const [longPressDay, setLongPressDay] = useState<number | null>(null);

  function syncDay(day: number) {
    setLongPressDay(null);
    // A faulty device or a limited email is synced only from its own «مزامنة الآن» choice.
    const ids = accountsForDay(activeAccountsRef.current, day).filter((a) => !syncedOnlyByCommand(a)).map((a) => a.id);
    const queue = syncQueueFor(ids, `يوم ${day}`);
    if (!queue) pushToast("لا أجهزة للمزامنة في هذا اليوم (المعطلة والإيميل غير الرئيسي بأمر فقط)");
    if (!queue) return;
    void trySyncInBackground(queue.ids, queue.label).then((background) => {
      if (!background) startVisibleRun(queue);
    });
  }

  function stopSyncRun() {
    const queue = loadSyncQueue();
    saveSyncQueue(null);
    setQueueStep(null);
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

  // Starts identical to the server-rendered output (demo data, demo
  // state) so there's no hydration mismatch; real data replaces it after
  // mount, never leaving the screen blank in between.
  const [accounts, setAccounts] = useState(demoAccounts);
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
  const [errorMessage, setErrorMessage] = useState("");

  // Kept current for the Starlink-sync listener below, which is registered once on mount and
  // must never act on a stale snapshot of either value from that first render.
  const accountsRef = useRef(accounts);
  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);
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
      accountsReadyGateRef.current.markReady();
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

    async function applyBatch(syncs: PendingSyncLike[]) {
      await accountsReadyGateRef.current.whenReady();

      const signedIn = markSignedInFromSync(sessionResultsRef.current, syncs.map((sync) => sync.accountId));
      if (signedIn !== sessionResultsRef.current) updateSessionResults(signedIn);

      // runSyncBatch (starlinkSync.ts) is the pure, directly-tested implementation of "merge,
      // then save, then message - and never claim success or mark anything applied unless the
      // save genuinely succeeds." Only the native ack call itself (a separately-scheduled retry
      // concern, see retryAcks) stays out here.
      const outcome = runSyncBatch(accountsRef.current, syncs, processedSyncIds, {
        isDemoMode: dataStateRef.current === "demo",
        saveDemoAccounts,
        saveSyncedFieldsCache,
        showAlert: pushToast,
      });

      if (outcome.status !== "applied") return;

      for (const id of outcome.appliedSyncIds) {
        processedSyncIds.add(id);
        unackedSyncIds.add(id);
      }
      setAccounts(outcome.accounts);
      // Keep this listener's own view of "current accounts" correct for the very next sync
      // without waiting for React's render -> effect cycle to catch up: a live event and a
      // resume-time drain (or two quick live events) can arrive back-to-back faster than that.
      accountsRef.current = outcome.accounts;

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
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Each device's renewal date/status goes along - the phone uses them to check the important
    // ones (7/3/1 days, just expired, stopped) automatically; see autoSyncList.ts.
    void syncAutoSyncAccountList(buildAutoSyncList(accounts));
  }, [accounts]);

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

  function saveAccount(account: StarlinkAccountSummary) {
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

      if (dataState === "demo") saveDemoAccounts(next);
      return next;
    });
    // 🤝 Given to a rep: once all the customer's devices are that rep's, the customer is the rep's -
    // he owes us nothing, the rep owes us everything (repClients.ts).
    if (account.representativeId && account.clientId) {
      const exists = accounts.some((item) => item.id === account.id);
      const nextAccounts = exists ? accounts.map((item) => (item.id === account.id ? account : item)) : [account, ...accounts];
      const moved = autoMoveClientToRep(clientStore[account.clientId], nextAccounts, new Date().toISOString());
      if (moved) {
        const nextClients = { ...clientStore, [moved.id]: moved };
        setClientStore(nextClients);
        saveClientStore(nextClients);
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
    if (isNew && account.creation && isRunningInAndroidApp()) {
      // 🆕 «إنشاء حساب جديد»: the new email's signup first, then «تفعيل Starlink».
      void openAccountCreation(account, "mail").then((result) => {
        if (!result.ok) pushToast(result.message);
      });
    } else if (isNew && !repRequestId && isRunningInAndroidApp() && account.expectedEmail?.trim()) {
      void openAutoSignIn(account, accounts).then((result) => {
        if (!result.ok) pushToast(result.message);
      });
    }
  }

  function removeAccountCard(account: StarlinkAccountSummary) {
    setAccounts((current) => {
      const next = current.filter((item) => item.id !== account.id);
      if (dataState === "demo") saveDemoAccounts(next);
      return next;
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
      if (dataState === "demo") saveDemoAccounts(next);
      return next;
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

  function currentProfitRates() {
    return { MRU: getCurrency(currencyStore, "MRU")?.rateFromUsd, SIFA: getCurrency(currencyStore, "SIFA")?.rateFromUsd };
  }

  // "متعطل": marking a fault can drop the device's open D (never paid to Starlink - the whole sale
  // becomes profit today); "تم الإصلاح" brings any dropped D back to be paid normally.
  function handleSetDeviceFault(account: StarlinkAccountSummary, fault: StarlinkAccountSummary["deviceFault"], waiveDebts: boolean) {
    patchAccount(account.id, { deviceFault: fault });
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
    pushToast(`🔗 دُمج «${drop.name}» في «${keep.name}»${result.movedEntries ? ` - انتقلت ${result.movedEntries} عملية` : ""}، والمكرّر في السلة`);
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
  ) {
    patchAccount(account.id, { rechargeDate: newRechargeDate, lastUpdated: "الآن" });
    const today = new Date().toISOString().slice(0, 10);
    const entries = getAccountEntries(ledgerStore, account.id);
    const open = openDebtEntries(entries);
    // The device still owes Starlink: renewing it is paying that D today - no new shipment.
    if (open.length > 0 && settleFromCard !== null) {
      const ids = new Set(open.map((e) => e.id));
      const options = { date: today, profitRates: currentProfitRates(), fromCard: settleFromCard };
      updateLedgerEntries(account.id, entries.map((e) => (ids.has(e.id) ? settleShipmentCost(e, options) : e)));
      const usd = open.reduce((sum, e) => sum + (starlinkCostUsd(e) ?? 0), 0);
      pushToast(`✓ تم تجديد "${account.name}" ودفع D (${formatAmount(usd)} $) لستارلينك - نزل الربح اليوم`);
      return;
    }
    if (autoShipment && account.renewalPlan) {
      const rep = getRepresentative(representativeStore, account.representativeId);
      const result = buildRenewalShipment(account.renewalPlan, currencyStore, new Date().toISOString().slice(0, 10), {
        email: account.expectedEmail || account.starlinkAccountEmail || "",
        representative: rep ? { id: rep.id, commissionPercent: rep.commissionPercent, sharesLosses: rep.sharesLosses } : undefined,
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
  const activeAccountsRef = useRef(activeAccounts);
  activeAccountsRef.current = activeAccounts;
  const archivedAccounts = useMemo(() => accounts.filter((a) => a.archivedAt), [accounts]);
  const trashAccounts = useMemo(() => accounts.filter((a) => a.deletedAt), [accounts]);
  // 🔗 Devices registered twice (same email or KIT) → their twin, for «⚠️ مكرّر · دمج».
  const deviceTwinMap = useMemo(() => deviceTwins(accounts), [accounts]);
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
    };
    window.addEventListener(HOME_SEARCH_EVENT, onSearch);
    const searchFromUrl = parseHomeSearch(window.location.search);
    if (searchFromUrl) {
      window.history.replaceState(null, "", window.location.pathname);
      setQuery(searchFromUrl);
      setShowAll(true);
    }
    // "💵 دفعة من زبون" chosen on the clients page: that device's ledger, ready for a payment.
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
      computeRenewalReminders(activeAccounts).length +
      computeDeviceDebtReminders(activeAccounts, ledgerStore, clientStore).length +
      computeRestrictedDeviceReminders(activeAccounts).length +
      (isBackupOverdue(lastBackupAt) ? 1 : 0) +
      duePromiseCount,
    [activeAccounts, ledgerStore, clientStore, lastBackupAt, suspendedWithDebt, duePromiseCount],
  );

  const dayCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const account of activeAccounts) {
      const day = expiryDay(account.rechargeDate || account.standbyDate);
      if (day) counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return counts;
  }, [activeAccounts]);

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


  const filtered = useMemo(() => {
    let list = activeAccounts;
    if (selectedDay !== null) {
      list = list.filter((a) => expiryDay(a.rechargeDate || a.standbyDate) === selectedDay);
    }
    if (statFilter) {
      list = list.filter((a) => matchesStatFilter(a, statFilter));
      if (statFilter === "faulty" && faultFilter) list = list.filter((a) => faultCategory(a) === faultFilter);
    }
    if (query.trim()) {
      // A rep's name shows his devices too.
      list = list.filter(
        (a) =>
          deviceMatchesQuery(query, a, a.clientId ? clientStore[a.clientId] : undefined) ||
          deviceMatchesQuery(query, { name: getRepresentative(representativeStore, a.representativeId)?.name ?? "", kitNumber: "", serialNumber: "" }),
      );
    }
    return list;
  }, [activeAccounts, selectedDay, statFilter, faultFilter, query, clientStore, representativeStore]);

  const faultCounts = useMemo(() => countFaultCategories(activeAccounts), [activeAccounts]);
  const repairCount = useMemo(() => activeAccounts.filter(isUnderRepair).length, [activeAccounts]);
  const fromRepCount = useMemo(() => activeAccounts.filter((a) => a.addedByRepId).length, [activeAccounts]);

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
    : showAll || query || selectedDay !== null || statFilter !== null ? filtered : expiredOrNearExpiry;

  return (
    <main className="home app-shell">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      {longPressDay !== null && (
        <DayActionsSheet
          day={longPressDay}
          dayAccounts={accountsForDay(activeAccounts, longPressDay)}
          reps={representativeStore}
          phoneFor={(account) => getClient(clientStore, account.clientId)?.phone ?? account.phone}
          onSync={() => syncDay(longPressDay)}
          onClose={() => setLongPressDay(null)}
        />
      )}
      {syncChoiceOpen && <SyncChoiceSheet accounts={accounts} today={localToday()} onPick={startSyncRun} onClose={() => setSyncChoiceOpen(false)} />}
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
      <header className="app-header app-header-compact">
        <HeaderMore />
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

      {updateAvailable && (
        <a href={APK_DOWNLOAD_URL} target="_blank" rel="noreferrer" className="backup-banner update-banner">
          <span aria-hidden="true">🆕</span>
          <span>
            <strong>تحديث جديد للتطبيق متوفر</strong>
            <small>اضغط لتنزيل النسخة الأحدث ثم ثبّتها - بياناتك تبقى كما هي</small>
          </span>
        </a>
      )}

      {suspendedWithDebt.length > 0 && (
        <Link href="/starlink" className="backup-banner d-alert-banner">
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
                : "دفعاتك وأجهزتك وزبائنك الجدد - اختر تيليغرام ثم بوت المندوبين"}
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
          onChange={(e) => setQuery(e.target.value)}
          aria-label="بحث"
        />
      </section>

      {searchResults.length > 0 && (
        <section className="global-search-results" aria-label="نتائج أخرى">
          {searchResults.map((result) => (
            <SearchResultRow key={`${result.kind}-${result.id}`} result={result} onOpenClient={(id) => setOpenClientId(id)} />
          ))}
        </section>
      )}

      <div className="conn-row">
        <ConnectionStatus />
        {dataState === "loading" && <span className="conn-badge conn-checking">جارِ تحميل البيانات…</span>}
        {dataState === "error" && (
          <div className="account-card-alert conn-error-row">
            {errorMessage}
            <button className="btn-link" onClick={loadRealAccounts}>
              إعادة المحاولة
            </button>
          </div>
        )}
      </div>

      <HelpHint
        title="الصفحة الرئيسية"
        steps={[
          "اضغط على أي يوم في التقويم لعرض الحسابات المستحقة للتجديد في ذلك اليوم.",
          "اضغط 'التفاصيل' على أي حساب ثم 'إضافة دفعة' لتسجيل أول مبلغ - اختر 'عليه' لشحنة جديدة أو 'له' لدفعة استلمتها.",
          "استخدم زر + في الأسفل للوصول إلى العملات وسلة المحذوفات والأرشيف.",
        ]}
      />

      {viewMode === "active" && (
        <>
          <section className="status-rings" aria-label="ملخص الحسابات">
            <StatusRing
              tone="total"
              value={overview.total}
              total={overview.total}
              label="كل الأجهزة"
              icon={<IconGrid />}
              onClick={() => { setShowAll(true); setSelectedDay(null); setStatFilter(null); }}
            />
            <StatusRing
              tone="online"
              value={overview.online}
              total={overview.total}
              label="متصلة الآن"
              icon={<IconSignal />}
              active={statFilter === "online"}
              onClick={() => toggleStatFilter("online")}
            />
            <StatusRing
              tone="warning"
              value={overview.expiringSoon}
              total={overview.total}
              label="تنتهي قريبًا"
              icon={<IconClock />}
              active={statFilter === "expiringSoon"}
              onClick={() => toggleStatFilter("expiringSoon")}
            />
            <StatusRing
              tone="expired"
              value={overview.expired}
              total={overview.total}
              label="منتهية"
              icon={<IconAlert />}
              active={statFilter === "expired"}
              onClick={() => toggleStatFilter("expired")}
            />
            <StatusRing
              tone="suspended"
              value={overview.suspended}
              total={overview.total}
              label="موقوفة"
              icon={<IconPause />}
              active={statFilter === "suspended"}
              onClick={() => toggleStatFilter("suspended")}
            />
          </section>

          <div className="status-chips">
            <button
              type="button"
              className={`faulty-chip${statFilter === "faulty" ? " faulty-chip-active" : ""}`}
              onClick={() => { toggleStatFilter("faulty"); setFaultFilter(null); setSelectedDay(null); }}
            >
              🔧 المعطلة ({overview.faulty})
            </button>
            <button
              type="button"
              className={`faulty-chip repair-chip${statFilter === "repair" ? " faulty-chip-active" : ""}`}
              onClick={() => { toggleStatFilter("repair"); setSelectedDay(null); }}
            >
              🛠️ قيد الإصلاح ({repairCount})
            </button>
            {fromRepCount > 0 && (
              <button
                type="button"
                className={`faulty-chip from-rep-chip${statFilter === "fromRep" ? " faulty-chip-active" : ""}`}
                onClick={() => { toggleStatFilter("fromRep"); setSelectedDay(null); }}
              >
                📱 من المندوبين ({fromRepCount})
              </button>
            )}
          </div>

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

      <section className="section dashboard-section accounts-section">
        <div className="section-header-row">
          <div>
            <h2 className="section-title">
              {viewMode === "archived" ? "الأرشيف"
                : viewMode === "trash" ? "سلة المحذوفات"
                : statFilter
                  ? STAT_FILTER_TITLES[statFilter]
                  : showAll || query || selectedDay !== null ? "الحسابات" : "تحتاج إلى متابعة"}
            </h2>
            <p className="section-caption">{visible.length} حساب</p>
          </div>
          {viewMode === "active" && (
            statFilter ? (
              <button className="text-action" onClick={() => setStatFilter(null)}>مسح التصفية</button>
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

        {visible.length === 0 ? (
          <p className="empty-state">
            {viewMode === "archived" ? "لا توجد أجهزة مؤرشفة."
              : viewMode === "trash" ? "سلة المحذوفات فارغة."
              : "لا توجد حسابات مطابقة."}
          </p>
        ) : (
          <div className="account-grid">
            {visible.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                repPending={repPendingIds.has(account.id)}
                context={viewMode}
                onEdit={(selected) => setDialog({ mode: "edit", account: selected })}
                ledgerEntries={getAccountEntries(ledgerStore, account.id)}
                allocations={allAllocations}
                onLedger={(selected) => setLedgerAccount(selected)}
                onDeviceStatement={(selected) => setStatementAccount(selected)}
                client={getClient(clientStore, account.clientId)}
                repColor={getRepresentative(representativeStore, account.representativeId)?.color}
                addedByRepName={account.addedByRepId ? getRepresentative(representativeStore, account.addedByRepId)?.name ?? "مندوب" : undefined}
                twin={viewMode === "active" ? deviceTwinMap.get(account.id) : undefined}
                onMergeInto={viewMode === "active" && !isRepWorkspace() ? handleMergeDevices : undefined}
                mailSignedIn={mailSignedIds.has(account.id)}
                onOpenClient={(selectedClient) => setOpenClientId(selectedClient.id)}
                currencyStore={currencyStore}
                onSetDeviceFault={handleSetDeviceFault}
                onSetRepair={(target, repair) => patchAccount(target.id, { underRepair: repair })}
                onFinishCreation={(target) => patchAccount(target.id, { creation: null })}
                allAccounts={accounts}
                onArchive={handleArchive}
                onSoftDelete={handleSoftDelete}
                onRestore={handleRestore}
                onPermanentDelete={viewMode === "trash" ? deleteAccount : undefined}
                onConfirmRenewal={handleConfirmRenewal}
                sessionNeedsLogin={viewMode === "active" && needsLoginIds.has(account.id)}
                previousDebts={openPreviousDebts.filter((d) => d.accountId === account.id)}
                onAddPreviousDebt={viewMode === "active" ? handleAddPreviousDebt : undefined}
              />
            ))}
          </div>
        )}
      </section>

      {viewMode === "active" && !dialog && !ledgerAccount && (
        <HomeFab onAddDevice={() => setDialog({ mode: "add" })} />
      )}

      {dialog && (
        <AccountDialog
          mode={dialog.mode}
          account={dialog.account}
          prefill={dialog.prefill}
          clients={clients}
          onCreateClient={handleCreateClient}
          representatives={representatives}
          onCreateRepresentative={handleCreateRepresentative}
          onClose={() => {
            repDeviceRequestRef.current = null;
            setDialog(null);
          }}
          onSave={saveAccount}
          onDelete={deleteAccount}
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
          clientName={getClient(clientStore, ledgerAccount.clientId)?.name}
          clientPhone={getClient(clientStore, ledgerAccount.clientId)?.phone ?? ledgerAccount.phone}
          representative={(() => {
            const rep = getRepresentative(representativeStore, ledgerAccount.representativeId);
            return rep ? { id: rep.id, commissionPercent: rep.commissionPercent, sharesLosses: rep.sharesLosses } : undefined;
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

type StatusTone = "total" | "online" | "warning" | "expired" | "suspended";

/** One circular status counter: a ring filled by this status's share of all devices, its icon and
 * count inside, the label underneath. Tapping filters the list (or shows all, for the total). */
function StatusRing({
  tone,
  value,
  total,
  label,
  icon,
  active = false,
  onClick,
}: {
  tone: StatusTone;
  value: number;
  total: number;
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  const share = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <button
      type="button"
      className={`status-ring status-ring-${tone}${active ? " status-ring-active" : ""}`}
      aria-pressed={tone === "total" ? undefined : active}
      aria-label={`${label}: ${value}`}
      onClick={onClick}
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
