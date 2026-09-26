"use client";

import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App } from "@capacitor/app";
import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import { expiryDay } from "@starnet/shared";
import { AccountCard, AccountCardContext } from "./AccountCard";
import { DayCircles } from "./DayCircles";
import { ConnectionStatus } from "./ConnectionStatus";
import { AccountDialog, AccountDialogMode } from "./AccountDialog";
import { LedgerDialog } from "./LedgerDialog";
import { ClientDialog } from "./ClientDialog";
import { ClientsOverviewDialog } from "./ClientsOverviewDialog";
import { LedgerEntryEditor } from "./LedgerEntryEditor";
import { DeviceStatementDialog } from "./DeviceStatementDialog";
import { ToastMessage, ToastStack } from "./ToastStack";
import { HelpHint } from "./HelpHint";
import { daysRemainingNumber } from "@/lib/date";
import { computeDeviceDebtReminders, computeRenewalReminders, computeRestrictedDeviceReminders, isBackupOverdue } from "@/lib/reminders";
import { formatAmount } from "@/lib/formatAmount";
import { applyLedgerPaymentsToCash, loadCashEntries, saveCashEntries } from "@/lib/cashStore";
import { parseNewDevicePrefill } from "@/lib/deviceFromSale";
import { buildRenewalShipment } from "@/lib/renewalPlan";
import { runAutoBackup } from "@/lib/autoBackupRunner";
import { notifySuspendedWithDebt, onDigestTapped, rescheduleMorningDigests } from "@/lib/morningNotifications";
import { listOpenShipmentDebts, listSuspendedWithDebt } from "@/lib/starlinkDebt";
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
import { CurrencyStore, loadCurrencyStore, saveCurrencyStore, upsertCurrency, UpsertCurrencyInput } from "@/lib/currencyStore";
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
import {
  ackPendingAccountSyncs,
  deleteIsolatedAccountSession,
  isRunningInAndroidApp,
  listPendingAccountSyncs,
  onAccountDataSynced,
  syncAutoSyncAccountList,
  triggerImmediateSync,
} from "@/lib/localBrowser";
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
type StatFilterKind = "online" | "expiringSoon" | "expired" | "suspended";

const STAT_FILTER_TITLES: Record<StatFilterKind, string> = {
  online: "الحسابات المتصلة الآن",
  expiringSoon: "الحسابات القريبة من الانتهاء",
  expired: "الحسابات المنتهية",
  suspended: "الحسابات المتوقفة (فوترة)",
};

function matchesStatFilter(account: StarlinkAccountSummary, kind: StatFilterKind): boolean {
  switch (kind) {
    case "online":
      return account.dishStatus === DeviceStatus.GREEN || account.wifiStatus === DeviceStatus.GREEN;
    case "suspended":
      return account.serviceStatus === "suspended";
    case "expiringSoon": {
      const days = daysRemainingNumber(account.rechargeDate || account.standbyDate);
      return days !== null && days >= 0 && days <= NEAR_EXPIRY_THRESHOLD_DAYS;
    }
    case "expired": {
      const days = daysRemainingNumber(account.rechargeDate || account.standbyDate);
      return days !== null && days < 0;
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
  const [query, setQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [statFilter, setStatFilter] = useState<StatFilterKind | null>(null);

  function toggleStatFilter(kind: StatFilterKind) {
    setStatFilter((current) => (current === kind ? null : kind));
    setSelectedDay(null);
  }
  const [showAll, setShowAll] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  // Arriving from a store sale of a Starlink kit (see deviceFromSale.ts): open the add-device
  // dialog already linked to that client/representative, then drop the query so a refresh or
  // back-navigation never reopens it.
  useEffect(() => {
    const prefill = parseNewDevicePrefill(window.location.search);
    if (!prefill) return;
    setDialog({
      mode: "add",
      prefill: { clientId: prefill.clientId, representativeId: prefill.representativeId, name: prefill.name ?? "" },
    });
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // Defaults to "not the Android app" (matches server render) and only reflects reality after
  // mount, to avoid a hydration mismatch - same pattern as AccountCard's own isAndroidApp state.
  const [isAndroidApp, setIsAndroidApp] = useState(false);
  useEffect(() => setIsAndroidApp(isRunningInAndroidApp()), []);
  // A newer staging APK than this build (see appUpdate.ts) - checked in the Android app only, at
  // most every few hours, silently ignored when offline.
  const [updateAvailable, setUpdateAvailable] = useState(false);
  // النسخ الاحتياطي التلقائي (autoBackup.ts): once accounts are loaded, at most once a day.
  const autoBackupStartedRef = useRef(false);
  const router = useRouter();
  useEffect(() => {
    if (!isRunningInAndroidApp() || !shouldAutoCheck()) return;
    void checkForAppUpdate().then((result) => setUpdateAvailable(result.status === "update"));
  }, []);
  const [syncingNow, setSyncingNow] = useState(false);

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
  // which never has localStorage) and loads after mount, same hydration-safety reasoning as
  // isAndroidApp above.
  const [ledgerStore, setLedgerStore] = useState<LedgerByAccount>({});
  useEffect(() => setLedgerStore(loadLedgerStore()), []);
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
  const [statementAccount, setStatementAccount] = useState<StarlinkAccountSummary | null>(null);
  const [editingStatementEntry, setEditingStatementEntry] = useState<LedgerEntry | null>(null);

  function updateLedgerEntries(accountId: string, entries: LedgerEntry[]) {
    // Every device payment also moves money into الصندوق - computed from the current (pre-edit)
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

  async function handleSyncNow() {
    if (syncingNow) return;
    setSyncingNow(true);
    try {
      const result = await triggerImmediateSync();
      if (!result.ok) {
        window.alert(result.message);
      }
      // On success this only means the background job was scheduled, not that it finished - the
      // normal accountDataSynced/listPendingAccountSyncs pipeline below picks up its results
      // whenever they land, same as the hourly automatic run.
    } finally {
      setSyncingNow(false);
    }
  }

  // Starts identical to the server-rendered output (demo data, demo
  // state) so there's no hydration mismatch; real data replaces it after
  // mount, never leaving the screen blank in between.
  const [accounts, setAccounts] = useState(demoAccounts);
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
  useEffect(() => onDigestTapped((route) => router.push(route)), [router]);
  useEffect(() => {
    let cancelled = false;
    void accountsReadyGateRef.current.whenReady().then(() => {
      if (!cancelled) void rescheduleMorningDigests(accounts, totalOwedAcrossAccounts(ledgerStore));
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
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const activeOnly = accounts.filter((account) => !account.archivedAt && !account.deletedAt);
    void syncAutoSyncAccountList(activeOnly.map((account) => ({ id: account.id, name: account.name })));
  }, [accounts]);

  function saveAccount(account: StarlinkAccountSummary) {
    setAccounts((current) => {
      const exists = current.some((item) => item.id === account.id);
      const next = exists
        ? current.map((item) => item.id === account.id ? account : item)
        : [account, ...current];

      if (dataState === "demo") saveDemoAccounts(next);
      return next;
    });
    setShowAll(true);
    setSelectedDay(null);
    setQuery("");
    setDialog(null);
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

  function handleSetDeviceFault(account: StarlinkAccountSummary, fault: StarlinkAccountSummary["deviceFault"]) {
    patchAccount(account.id, { deviceFault: fault });
  }

  function handleArchive(account: StarlinkAccountSummary) {
    patchAccount(account.id, { archivedAt: new Date().toISOString() });
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
  function handleConfirmRenewal(account: StarlinkAccountSummary, newRechargeDate: string, autoShipment = false, costPending = false) {
    patchAccount(account.id, { rechargeDate: newRechargeDate, lastUpdated: "الآن" });
    if (autoShipment && account.renewalPlan) {
      const rep = getRepresentative(representativeStore, account.representativeId);
      const result = buildRenewalShipment(account.renewalPlan, currencyStore, new Date().toISOString().slice(0, 10), {
        email: account.expectedEmail || account.starlinkAccountEmail || "",
        representative: rep ? { id: rep.id, commissionPercent: rep.commissionPercent, sharesLosses: rep.sharesLosses } : undefined,
        costPending,
      });
      if (result.ok) {
        updateLedgerEntries(account.id, [...getAccountEntries(ledgerStore, account.id), result.entry]);
        pushToast(`✓ تم التجديد وتسجيل شحنة ${formatAmount(result.entry.amount)} ${LEDGER_CURRENCY_LABELS[result.entry.currency]} على "${account.name}"${costPending ? " (D)" : ""}`);
        return;
      }
      pushToast(`تعذر التسجيل التلقائي: ${result.message} - سجّل الشحنة يدويًا`);
    }
    setLedgerAccount({ ...account, rechargeDate: newRechargeDate });
  }

  async function deleteAccount(account: StarlinkAccountSummary) {
    // Deleting the account from STAR NET never implies deleting its saved Starlink login on this
    // phone - that is a separate, explicit choice, and only asked about at all when there could
    // be a session to delete. The card is never removed before that choice (and, if made, its
    // outcome) is known: a session delete that fails must leave the account exactly as it was,
    // so the user can retry instead of losing track of a still-logged-in local browser.
    if (!isRunningInAndroidApp()) {
      removeAccountCard(account);
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
  }

  // The normal dashboard (overview cards, calendar, filters, "تحتاج إلى متابعة") only ever
  // operates on active devices - an archived or soft-deleted one is reached only through its own
  // dedicated view (see viewMode), never mixed into these counts/lists.
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archivedAt && !a.deletedAt), [accounts]);
  const archivedAccounts = useMemo(() => accounts.filter((a) => a.archivedAt), [accounts]);
  const trashAccounts = useMemo(() => accounts.filter((a) => a.deletedAt), [accounts]);

  // Cheap header-badge count for /reminders - only the categories this page already has data for
  // loaded (renewals, device debts, backup) or that cost nothing extra to check (backup); the
  // page itself also covers store debts/low stock, which don't need a second data load just to
  // size a badge.
  // Devices Starlink stopped while we still owe their D - the signal to pay Starlink now.
  const suspendedWithDebt = useMemo(
    () => listSuspendedWithDebt(activeAccounts, listOpenShipmentDebts(ledgerStore)),
    [activeAccounts, ledgerStore],
  );
  useEffect(() => {
    void notifySuspendedWithDebt(
      suspendedWithDebt.map((s) => ({ accountName: s.account.name, entryIds: s.debts.map((d) => d.entry.id), costUsd: s.costUsd })),
    );
  }, [suspendedWithDebt]);

  const reminderCount = useMemo(
    () =>
      suspendedWithDebt.length +
      computeRenewalReminders(activeAccounts).length +
      computeDeviceDebtReminders(activeAccounts, ledgerStore).length +
      computeRestrictedDeviceReminders(activeAccounts).length +
      (isBackupOverdue(lastBackupAt) ? 1 : 0),
    [activeAccounts, ledgerStore, lastBackupAt, suspendedWithDebt],
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

    for (const account of activeAccounts) {
      if (account.dishStatus === DeviceStatus.GREEN || account.wifiStatus === DeviceStatus.GREEN) {
        online += 1;
      }
      if (account.serviceStatus === "suspended") suspended += 1;

      const days = daysRemainingNumber(account.rechargeDate || account.standbyDate);
      if (days === null) continue;
      if (days < 0) expired += 1;
      else if (days <= NEAR_EXPIRY_THRESHOLD_DAYS) expiringSoon += 1;
    }

    return { total: activeAccounts.length, online, expiringSoon, expired, suspended };
  }, [activeAccounts]);


  const filtered = useMemo(() => {
    let list = activeAccounts;
    if (selectedDay !== null) {
      list = list.filter((a) => expiryDay(a.rechargeDate || a.standbyDate) === selectedDay);
    }
    if (statFilter) {
      list = list.filter((a) => matchesStatFilter(a, statFilter));
    }
    if (query.trim()) {
      list = list.filter((a) => deviceMatchesQuery(query, a, a.clientId ? clientStore[a.clientId] : undefined));
    }
    return list;
  }, [activeAccounts, selectedDay, statFilter, query, clientStore]);

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
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-logo" aria-hidden="true">★</span>
          <div>
            <span className="brand-mark">STAR NET</span>
            <span className="brand-subtitle">إدارة حسابات Starlink</span>
          </div>
        </div>
        <div className="header-actions">
          {isAndroidApp && (
            <button
              className={`header-sync${syncingNow ? " syncing" : ""}`}
              type="button"
              onClick={handleSyncNow}
              disabled={syncingNow}
              title="مزامنة الآن"
              aria-label="مزامنة الآن"
            >
              <span aria-hidden="true">⟳</span>
            </button>
          )}
          <button className="header-add" type="button" onClick={() => setDialog({ mode: "add" })}>
            <span aria-hidden="true">＋</span> إضافة حساب
          </button>
          <button className="header-clients" type="button" onClick={() => setShowClientsOverview(true)} aria-label="العملاء">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="9" cy="8" r="3.3" />
              <path d="M3.5 19.5c0-3 2.5-5.3 5.5-5.3s5.5 2.3 5.5 5.3" strokeLinecap="round" />
              <circle cx="17" cy="9" r="2.6" />
              <path d="M15.5 14.6c2.4.2 4.3 2.2 4.5 4.9" strokeLinecap="round" />
            </svg>
          </button>
          <Link href="/reminders" className="header-reminders" aria-label="التذكيرات">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3.5c-3 0-5 2.2-5 5.2v3.4c0 1-.4 2-1.1 2.7L5 15.7c-.5.5-.2 1.3.5 1.3h13c.7 0 1-.8.5-1.3l-.9-.9c-.7-.7-1.1-1.7-1.1-2.7V8.7c0-3-2-5.2-5-5.2Z" strokeLinejoin="round" />
              <path d="M10 19.5a2 2 0 0 0 4 0" strokeLinecap="round" />
            </svg>
            {remindersBadgeEnabled && reminderCount > 0 && (
              <span className="header-reminders-badge">{reminderCount > 9 ? "9+" : reminderCount}</span>
            )}
          </Link>
          <Link href="/currencies" className="header-currencies" aria-label="العملات وأسعار الصرف">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="9" cy="9" r="5.5" />
              <circle cx="15" cy="15" r="5.5" />
              <path d="M9 6.5v5M6.5 9h5" strokeLinecap="round" />
            </svg>
          </Link>
          <Link href="/settings" className="header-settings" aria-label="فتح الإعدادات">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.57 15 1.7 1.7 0 0 0 3 14H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 8.97 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08a1.7 1.7 0 0 0 1.06 1.52 1.7 1.7 0 0 0 1.88-.34L17 4.2 19.83 7l-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
            </svg>
          </Link>
        </div>
      </header>

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
          </span>
        </Link>
      )}

      {isBackupOverdue(lastBackupAt, 2) && (
        <Link href="/settings#backup" className="backup-banner">
          <span aria-hidden="true">🛡️</span>
          <span>
            <strong>{lastBackupAt ? "لم تحفظ نسخة احتياطية منذ أيام" : "لم تحفظ أي نسخة احتياطية بعد"}</strong>
            <small>كل بياناتك موجودة على هذا الهاتف فقط - اضغط لحفظ نسخة كاملة الآن</small>
          </span>
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
          placeholder="ابحث: جهاز، زبون، هاتف، مورد، مندوب، منتج…"
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
                context={viewMode}
                onEdit={(selected) => setDialog({ mode: "edit", account: selected })}
                ledgerEntries={getAccountEntries(ledgerStore, account.id)}
                allocations={allAllocations}
                onLedger={(selected) => setLedgerAccount(selected)}
                onDeviceStatement={(selected) => setStatementAccount(selected)}
                client={getClient(clientStore, account.clientId)}
                onOpenClient={(selectedClient) => setOpenClientId(selectedClient.id)}
                currencyStore={currencyStore}
                onSetDeviceFault={handleSetDeviceFault}
                onArchive={handleArchive}
                onSoftDelete={handleSoftDelete}
                onRestore={handleRestore}
                onPermanentDelete={viewMode === "trash" ? deleteAccount : undefined}
                onConfirmRenewal={handleConfirmRenewal}
              />
            ))}
          </div>
        )}
      </section>

      {dialog && (
        <AccountDialog
          mode={dialog.mode}
          account={dialog.account}
          prefill={dialog.prefill}
          clients={clients}
          onCreateClient={handleCreateClient}
          representatives={representatives}
          onCreateRepresentative={handleCreateRepresentative}
          onClose={() => setDialog(null)}
          onSave={saveAccount}
          onDelete={deleteAccount}
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
          onClose={() => setLedgerAccount(null)}
          onChange={(entries) => updateLedgerEntries(ledgerAccount.id, entries)}
          renewalPlan={ledgerAccount.renewalPlan}
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
          ledgerStore={ledgerStore}
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
