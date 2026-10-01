"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { demoAccounts } from "@/lib/demoData";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { listAccounts } from "@/lib/apiClient";
import { isDemoMode, isLoggedIn } from "@/lib/settingsStore";
import { ClientStore, loadClientStore } from "@/lib/clientStore";
import { isRunningInAndroidApp, listMailSessions, mailLoginFor, openIsolatedMailbox } from "@/lib/localBrowser";
import { buildMailboxRows, gmailCount, MailboxFilter, MailboxSession, signedInCount } from "@/lib/mailboxes";

function formatSince(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

/** 📧 البريد المسجّل: every device email, the signed-in ones first, searchable, one tap to open. */
export default function MailboxesPage() {
  const [accounts, setAccounts] = useState<StarlinkAccountSummary[]>(demoAccounts);
  const [clientStore, setClientStore] = useState<ClientStore>({});
  const [sessions, setSessions] = useState<MailboxSession[]>([]);
  const [filter, setFilter] = useState<MailboxFilter>("signed");
  const [query, setQuery] = useState("");
  const [inApp, setInApp] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    setInApp(isRunningInAndroidApp());
    setClientStore(loadClientStore());
    if (isDemoMode()) setAccounts(loadDemoAccounts(demoAccounts));
    else if (isLoggedIn()) listAccounts().then(setAccounts).catch(() => {});
    let alive = true;
    const refresh = () => {
      listMailSessions().then((list) => {
        if (alive) setSessions(list);
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

  const rows = useMemo(() => buildMailboxRows(accounts, clientStore, sessions, query, filter), [accounts, clientStore, sessions, query, filter]);
  const signed = signedInCount(accounts, sessions);
  const total = useMemo(() => buildMailboxRows(accounts, clientStore, sessions, "", "all").length, [accounts, clientStore, sessions]);

  async function open(accountId: string) {
    const account = accounts.find((a) => a.id === accountId);
    if (!account || opening) return;
    setOpening(accountId);
    try {
      const result = await openIsolatedMailbox(account.id, account.name || "البريد", mailLoginFor(account, accounts));
      if (!result.ok) window.alert(result.message);
    } finally {
      setOpening(null);
    }
  }

  return (
    <main className="home mailboxes-page">
      <div className="session-header">
        <Link href="/" className="btn-link">
          ← رجوع
        </Link>
        <h1 className="section-title">📧 البريد المسجّل</h1>
      </div>

      <section className="section">
        <p className="mailbox-summary">
          <span className="mailbox-summary-on">
            ✓ <bdi dir="ltr">{signed}</bdi> مسجّل
          </span>
          <span>
            من <bdi dir="ltr">{total}</bdi> إيميل
          </span>
        </p>
        {!inApp && <p className="settings-hint">حالة التسجيل وفتح البريد متاحان داخل تطبيق Android فقط.</p>}
        {gmailCount(accounts) > 0 && (
          <p className="settings-hint">
            إيميلات Gmail (<bdi dir="ltr">{gmailCount(accounts)}</bdi>) غير معروضة: Google تمنع فتحها داخل التطبيق.
          </p>
        )}

        <div className="mailbox-tabs" role="tablist">
          {(["signed", "all"] as MailboxFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              className={`mailbox-tab${filter === f ? " mailbox-tab-active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "signed" ? `✓ المسجّلة (${signed})` : `كل الإيميلات (${total})`}
            </button>
          ))}
        </div>

        <input
          className="search-input"
          placeholder="ابحث بالإيميل أو اسم الجهاز أو الزبون أو KIT"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {rows.length === 0 ? (
          <p className="empty-state">
            {filter === "signed" && !query
              ? "لا يوجد بريد مسجّل بعد - افتح «📧 البريد» في بطاقة جهاز وسجّل الدخول مرة واحدة."
              : "لا توجد نتائج مطابقة."}
          </p>
        ) : (
          <ul className="mailbox-list">
            {rows.map((row) => (
              <li key={row.accountId} className={`mailbox-row${row.signedIn ? " mailbox-row-on" : ""}`}>
                <span className="mailbox-dot" aria-hidden="true">
                  {row.signedIn ? "✓" : "✉"}
                </span>
                <div className="mailbox-main">
                  <bdi dir="ltr" className="mailbox-email">
                    {row.email || "—"}
                  </bdi>
                  <span className="mailbox-sub">
                    {row.deviceName}
                    {row.clientName ? ` · ${row.clientName}` : ""}
                    {row.signedIn && row.signedInAt ? (
                      <>
                        {" · منذ "}
                        <bdi dir="ltr">{formatSince(row.signedInAt)}</bdi>
                      </>
                    ) : null}
                  </span>
                </div>
                <button
                  type="button"
                  className={`card-action card-action-mail${row.signedIn ? " card-action-mail-on" : ""}`}
                  onClick={() => open(row.accountId)}
                  disabled={opening !== null}
                >
                  {opening === row.accountId ? "…" : row.signedIn ? "📧 فتح" : "📧 تسجيل"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
