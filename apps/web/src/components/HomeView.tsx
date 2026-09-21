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
import { daysRemainingNumber } from "@/lib/date";
import { ApiError, listAccounts } from "@/lib/apiClient";
import { isDemoMode, isLoggedIn } from "@/lib/settingsStore";
import { loadDemoAccounts, saveDemoAccounts } from "@/lib/demoAccountStore";
import {
  ackPendingAccountSyncs,
  deleteIsolatedAccountSession,
  isRunningInAndroidApp,
  listPendingAccountSyncs,
  onAccountDataSynced,
} from "@/lib/localBrowser";
import { createReadyGate } from "@/lib/readyGate";
import { applyPendingSyncs, PendingSyncLike, reapplyCachedSyncedFields } from "@/lib/starlinkSync";
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
      setAccounts(reapplyCachedSyncedFields(real, getCachedSyncedFields));
      setDataState("loaded");
    } catch (err) {
      setDataState("error");
      setErrorMessage(err instanceof ApiError ? err.message : "تعذّر تحميل الحسابات");
    } finally {
      accountsReadyGateRef.current.markReady();
    }
  }

  useEffect(() => {
    if (isDemoMode()) {
      setDataState("demo");
      setAccounts(loadDemoAccounts(demoAccounts));
      accountsReadyGateRef.current.markReady();
      return;
    }
    if (!isLoggedIn()) {
      setDataState("error");
      setErrorMessage("تم إعداد عنوان الخادم لكن لم يتم تسجيل الدخول بعد - افتح الإعدادات لتسجيل الدخول");
      accountsReadyGateRef.current.markReady();
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

      const result = applyPendingSyncs(accountsRef.current, syncs, processedSyncIds);
      if (result.ackSyncIds.length === 0) return;

      let saved = true;
      try {
        if (dataStateRef.current === "demo") {
          saveDemoAccounts(result.accounts);
        } else {
          // No backend write-back exists for this feature yet (services/api has no
          // update-account endpoint, and adding one is out of this feature's scope) - this local
          // cache of just the synced fields is "the storage actually used" for that mode, and is
          // what lets loadRealAccounts() re-apply the result on the next fetch instead of the
          // server's stale value silently winning.
          for (const sync of syncs) {
            if (result.ackSyncIds.includes(sync.syncId)) {
              saveSyncedFieldsCache(sync.accountId, sync.fields);
            }
          }
        }
      } catch {
        saved = false;
      }

      if (!saved) {
        // Never claim success on an unsaved merge - leave every syncId in this batch
        // unacknowledged and unmarked-processed, so the next drain retries the whole batch.
        window.alert("تعذر حفظ بيانات المزامنة على هذا الجهاز. سيُعاد تجربة هذا التحديث لاحقًا.");
        return;
      }

      for (const id of result.ackSyncIds) {
        processedSyncIds.add(id);
        unackedSyncIds.add(id);
      }
      setAccounts(result.accounts);
      // Keep this listener's own view of "current accounts" correct for the very next sync
      // without waiting for React's render -> effect cycle to catch up: a live event and a
      // resume-time drain (or two quick live events) can arrive back-to-back faster than that.
      accountsRef.current = result.accounts;

      for (const { message } of result.messages) window.alert(message);
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
    </main>
  );
}
