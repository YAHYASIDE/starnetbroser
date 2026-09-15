"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StarlinkAccountSummary } from "@starnet/shared";
import { expiryDay } from "@starnet/shared";
import { AccountCard } from "./AccountCard";
import { DayCircles } from "./DayCircles";
import { ConnectionStatus } from "./ConnectionStatus";
import { daysRemainingNumber } from "@/lib/date";
import { ApiError, listAccounts } from "@/lib/apiClient";
import { isDemoMode, isLoggedIn } from "@/lib/settingsStore";

const NEAR_EXPIRY_THRESHOLD_DAYS = 3;

type DataState = "demo" | "loading" | "loaded" | "error";

export function HomeView({ accounts: demoAccounts }: { accounts: StarlinkAccountSummary[] }) {
  const [query, setQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Starts identical to the server-rendered output (demo data, demo
  // state) so there's no hydration mismatch; real data replaces it after
  // mount, never leaving the screen blank in between.
  const [accounts, setAccounts] = useState(demoAccounts);
  const [dataState, setDataState] = useState<DataState>("demo");
  const [errorMessage, setErrorMessage] = useState("");

  async function loadRealAccounts() {
    setDataState("loading");
    setErrorMessage("");
    try {
      const real = await listAccounts(query || undefined);
      setAccounts(real);
      setDataState("loaded");
    } catch (err) {
      setDataState("error");
      setErrorMessage(err instanceof ApiError ? err.message : "تعذّر تحميل الحسابات");
    }
  }

  useEffect(() => {
    if (isDemoMode()) {
      setDataState("demo");
      setAccounts(demoAccounts);
      return;
    }
    if (!isLoggedIn()) {
      setDataState("error");
      setErrorMessage("تم إعداد عنوان الخادم لكن لم يتم تسجيل الدخول بعد - افتح الإعدادات لتسجيل الدخول");
      return;
    }
    loadRealAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <main className="home">
      <header className="home-header">
        <div className="brand">
          <span className="brand-mark">STAR NET</span>
        </div>
        <input
          className="search-input"
          type="search"
          inputMode="search"
          placeholder="ابحث بالاسم، الإيميل، KIT أو Serial…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="بحث"
        />
        <Link href="/settings" className="btn-link">
          الإعدادات
        </Link>
      </header>

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

      <section className="section">
        <h2 className="section-title">التجديد حسب اليوم</h2>
        <DayCircles counts={dayCounts} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
      </section>

      <section className="section">
        <div className="section-header-row">
          <h2 className="section-title">
            {showAll || query || selectedDay !== null ? "النتائج" : "منتهية أو قريبة من الانتهاء"}
          </h2>
          {!query && selectedDay === null && (
            <button className="btn-link" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "عرض المنتهية فقط" : "عرض كل الحسابات"}
            </button>
          )}
        </div>

        {visible.length === 0 ? (
          <p className="empty-state">لا توجد حسابات مطابقة.</p>
        ) : (
          <div className="account-grid">
            {visible.map((account) => (
              <AccountCard key={account.id} account={account} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
