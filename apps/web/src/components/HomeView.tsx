"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { App } from "@capacitor/app";
import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import { expiryDay } from "@starnet/shared";
import { AccountCard } from "./AccountCard";
import { DayCircles } from "./DayCircles";
import { ConnectionStatus } from "./ConnectionStatus";
import { AccountDialog, AccountDialogMode } from "./AccountDialog";
import { LedgerDialog } from "./LedgerDialog";
import { daysRemainingNumber } from "@/lib/date";
import {
  computeBalance,
  getAccountEntries,
  LedgerByAccount,
  LedgerEntry,
  loadLedgerStore,
  saveLedgerStore,
  totalOwedAcrossAccounts,
  withAccountEntries,
} from "@/lib/ledgerStore";
import { ApiError, listAccounts } from "@/lib/apiClient";
import { isDemoMode, isLoggedIn } from "@/lib/settingsStore";
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
type DialogState = { mode: AccountDialogMode; account?: StarlinkAccountSummary } | null;

export function HomeView({ accounts: demoAccounts }: { accounts: StarlinkAccountSummary[] }) {
  const [query, setQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);

  // Defaults to "not the Android app" (matches server render) and only reflects reality after
  // mount, to avoid a hydration mismatch - same pattern as AccountCard's own isAndroidApp state.
  const [isAndroidApp, setIsAndroidApp] = useState(false);
  useEffect(() => setIsAndroidApp(isRunningInAndroidApp()), []);
  const [syncingNow, setSyncingNow] = useState(false);

  // Purely local customer bookkeeping (see ledgerStore.ts) - starts empty (matches server render,
  // which never has localStorage) and loads after mount, same hydration-safety reasoning as
  // isAndroidApp above.
  const [ledgerStore, setLedgerStore] = useState<LedgerByAccount>({});
  useEffect(() => setLedgerStore(loadLedgerStore()), []);
  const [ledgerAccount, setLedgerAccount] = useState<StarlinkAccountSummary | null>(null);

  function updateLedgerEntries(accountId: string, entries: LedgerEntry[]) {
    setLedgerStore((current) => {
      const next = withAccountEntries(current, accountId, entries);
      saveLedgerStore(next);
      return next;
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
        showAlert: (message) => window.alert(message),
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
  // real account this app currently manages unsynced.
  useEffect(() => {
    void syncAutoSyncAccountList(accounts.map((account) => ({ id: account.id, name: account.name })));
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

  const dayCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const account of accounts) {
      const day = expiryDay(account.rechargeDate || account.standbyDate);
      if (day) counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return counts;
  }, [accounts]);

  const expiredOrNearExpiry = useMemo(
    () =>
      accounts.filter((account) => {
        const days = daysRemainingNumber(account.rechargeDate || account.standbyDate);
        return days !== null && days <= NEAR_EXPIRY_THRESHOLD_DAYS;
      }),
    [accounts],
  );

  const overview = useMemo(() => {
    let online = 0;
    let expiringSoon = 0;
    let expired = 0;

    for (const account of accounts) {
      if (account.dishStatus === DeviceStatus.GREEN || account.wifiStatus === DeviceStatus.GREEN) {
        online += 1;
      }

      const days = daysRemainingNumber(account.rechargeDate || account.standbyDate);
      if (days === null) continue;
      if (days < 0) expired += 1;
      else if (days <= NEAR_EXPIRY_THRESHOLD_DAYS) expiringSoon += 1;
    }

    return { total: accounts.length, online, expiringSoon, expired };
  }, [accounts]);

  const totalOwedByCustomers = useMemo(() => totalOwedAcrossAccounts(ledgerStore), [ledgerStore]);

  const filtered = useMemo(() => {
    let list = accounts;
    if (selectedDay !== null) {
      list = list.filter((a) => expiryDay(a.rechargeDate || a.standbyDate) === selectedDay);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.kitNumber.toLowerCase().includes(q) ||
          a.serialNumber.toLowerCase().includes(q),
      );
    }
    return list;
  }, [accounts, selectedDay, query]);

  const visible = showAll || query || selectedDay !== null ? filtered : expiredOrNearExpiry;

  return (
    <main className="home app-shell">
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
          <Link href="/settings" className="header-settings" aria-label="فتح الإعدادات">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.57 15 1.7 1.7 0 0 0 3 14H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 8.97 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08a1.7 1.7 0 0 0 1.06 1.52 1.7 1.7 0 0 0 1.88-.34L17 4.2 19.83 7l-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
            </svg>
          </Link>
        </div>
      </header>

      <section className="search-panel" aria-label="البحث في الحسابات">
        <span className="search-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
        </span>
        <input
          className="search-input dashboard-search"
          type="search"
          inputMode="search"
          placeholder="ابحث بالاسم، KIT أو Serial"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="بحث"
        />
      </section>

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

      <section className="overview-grid" aria-label="ملخص الحسابات">
        <article className="overview-card overview-total">
          <span className="overview-icon" aria-hidden="true">◎</span>
          <span className="overview-value">{overview.total}</span>
          <span className="overview-label">كل الحسابات</span>
        </article>
        <article className="overview-card overview-online">
          <span className="overview-icon" aria-hidden="true">●</span>
          <span className="overview-value">{overview.online}</span>
          <span className="overview-label">متصل الآن</span>
        </article>
        <article className="overview-card overview-warning">
          <span className="overview-icon" aria-hidden="true">◷</span>
          <span className="overview-value">{overview.expiringSoon}</span>
          <span className="overview-label">قريب الانتهاء</span>
        </article>
        <article className="overview-card overview-expired">
          <span className="overview-icon" aria-hidden="true">!</span>
          <span className="overview-value">{overview.expired}</span>
          <span className="overview-label">منتهي</span>
        </article>
        <article className="overview-card overview-owed">
          <span className="overview-icon" aria-hidden="true">₋</span>
          <span className="overview-value">{totalOwedByCustomers.toFixed(2)}</span>
          <span className="overview-label">مستحق من العملاء</span>
        </article>
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
        <DayCircles counts={dayCounts} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
      </section>

      <section className="section dashboard-section accounts-section">
        <div className="section-header-row">
          <div>
            <h2 className="section-title">
              {showAll || query || selectedDay !== null ? "الحسابات" : "تحتاج إلى متابعة"}
            </h2>
            <p className="section-caption">{visible.length} حساب</p>
          </div>
          {!query && selectedDay === null && (
            <button className="text-action" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "عرض المنتهية فقط" : "عرض كل الحسابات"}
            </button>
          )}
        </div>

        {visible.length === 0 ? (
          <p className="empty-state">لا توجد حسابات مطابقة.</p>
        ) : (
          <div className="account-grid">
            {visible.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onInfo={(selected) => setDialog({ mode: "view", account: selected })}
                onEdit={(selected) => setDialog({ mode: "edit", account: selected })}
                ledgerBalance={computeBalance(getAccountEntries(ledgerStore, account.id))}
                onLedger={(selected) => setLedgerAccount(selected)}
              />
            ))}
          </div>
        )}
      </section>

      {dialog && (
        <AccountDialog
          mode={dialog.mode}
          account={dialog.account}
          onClose={() => setDialog(null)}
          onSave={saveAccount}
          onDelete={deleteAccount}
        />
      )}

      {ledgerAccount && (
        <LedgerDialog
          accountName={ledgerAccount.name}
          currency={ledgerAccount.currency}
          entries={getAccountEntries(ledgerStore, ledgerAccount.id)}
          onClose={() => setLedgerAccount(null)}
          onChange={(entries) => updateLedgerEntries(ledgerAccount.id, entries)}
        />
      )}
    </main>
  );
}
