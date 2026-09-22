"use client";

import { useEffect, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";
import { presentStatus, presentServiceStatus, isBalanceDueZero } from "@/lib/status";
import { daysRemainingLabel, daysRemainingNumber, formatRelativeTime } from "@/lib/date";
import { emailsMismatch } from "@/lib/emailMatch";
import { computeBalanceByCurrency, LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, LedgerEntry } from "@/lib/ledgerStore";
import { Client } from "@/lib/clientStore";
import { isRunningInAndroidApp, openIsolatedAccountBrowser, triggerImmediateSync } from "@/lib/localBrowser";
import {
  buildAccountStatementMessage,
  buildBalanceReminderMessage,
  buildExpiryReminderMessage,
  buildWhatsAppLink,
} from "@/lib/whatsapp";

interface Props {
  account: StarlinkAccountSummary;
  onEdit: (account: StarlinkAccountSummary) => void;
  onInfo: (account: StarlinkAccountSummary) => void;
  /** This account's local customer-ledger entries - see ledgerStore.ts. Never the same thing as
   * account.balanceDue (Starlink's own synced subscription balance). */
  ledgerEntries: LedgerEntry[];
  onLedger: (account: StarlinkAccountSummary) => void;
  /** The Client this device is linked to (via account.clientId) - undefined for a card never
   * linked to a customer yet ("الزبون غير محدد"). Resolved by the caller from clientStore, never
   * looked up here, so every card in a render pass sees the exact same store snapshot. */
  client?: Client;
  onOpenClient: (client: Client) => void;
}

export function AccountCard({ account, onEdit, onInfo, ledgerEntries, onLedger, client, onOpenClient }: Props) {
  const ledgerBalances = computeBalanceByCurrency(ledgerEntries);
  const dish = presentStatus(account.dishStatus);
  const wifi = presentStatus(account.wifiStatus);
  const serviceStatus = presentServiceStatus(account.serviceStatus);
  const lastSynced = formatRelativeTime(account.lastSuccessfulScanAt);
  const remaining = daysRemainingLabel(account.rechargeDate || account.standbyDate);
  const remainingDays = daysRemainingNumber(account.rechargeDate || account.standbyDate);
  const balanceIsZero = isBalanceDueZero(account.balanceDue);
  const emailMismatch = emailsMismatch(account.expectedEmail, account.starlinkAccountEmail);
  const urgencyClass = remainingDays === null
    ? "date-neutral"
    : remainingDays < 0
      ? "date-expired"
      : remainingDays <= 3
        ? "date-warning"
        : "date-safe";

  // Defaults to "not the Android app" (matches server render, which never
  // has a native bridge) and only reflects reality after mount, to avoid a
  // hydration mismatch between server and client render.
  const [isAndroidApp, setIsAndroidApp] = useState(false);
  useEffect(() => setIsAndroidApp(isRunningInAndroidApp()), []);
  const [opening, setOpening] = useState(false);

  async function handleOpen() {
    if (opening) return;
    setOpening(true);
    try {
      const result = await openIsolatedAccountBrowser(account.id, account.name || "حساب Starlink");
      if (!result.ok) {
        window.alert(result.message);
      }
    } finally {
      setOpening(false);
    }
  }

  // Scoped to just this one account (see localBrowser.ts#triggerImmediateSync) - a quick way to
  // refresh a single card without waiting for the hourly schedule or syncing every other account
  // via the header's own "مزامنة الآن". The actual sync result still surfaces through the normal
  // accountDataSynced/listPendingAccountSyncs pipeline (see HomeView) - this only starts the job.
  const [syncingCard, setSyncingCard] = useState(false);

  async function handleCardSync() {
    if (syncingCard) return;
    setSyncingCard(true);
    try {
      const result = await triggerImmediateSync(account.id);
      if (!result.ok) {
        window.alert(result.message);
      }
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

  return (
    <article className="account-card">
      <div className="account-card-client-row">
        {client ? (
          <button
            type="button"
            className="account-card-client-name"
            onClick={() => onOpenClient(client)}
            title="فتح بطاقة الزبون"
          >
            {client.name}
          </button>
        ) : (
          <div className="account-card-client-missing">
            <span className="badge badge-gray">الزبون غير محدد</span>
            <button type="button" className="text-action" onClick={() => onEdit(account)}>
              ربط بزبون
            </button>
          </div>
        )}
      </div>
      <header className="account-card-header">
        <div className="account-identity">
          <div>
            <h3 className="account-card-name">حساب الجهاز: {account.name}</h3>
            {account.starlinkAccountHolderName && (
              <p className="account-card-starlink-name">الاسم من Starlink: {account.starlinkAccountHolderName}</p>
            )}
            <div className="account-card-plan-row">
              <p className="account-card-plan">{account.planName || account.deviceName || "حساب Starlink"}</p>
              {serviceStatus && <span className={`badge ${serviceStatus.className}`}>{serviceStatus.label}</span>}
            </div>
          </div>
        </div>
        <div className="account-statuses" aria-label="حالة الاتصال">
          <span className="device-status" title={`ستارلينك: ${dish.label}`}>
            <span className={`dot ${dish.className}`} />
            الجهاز
          </span>
          <span className="device-status" title={`واي فاي: ${wifi.label}`}>
            <span className={`dot ${wifi.className}`} />
            Wi-Fi
          </span>
          {isAndroidApp && (
            <button
              type="button"
              className={`card-sync-btn${syncingCard ? " syncing" : ""}`}
              title="تحديث هذا الحساب"
              aria-label="تحديث هذا الحساب"
              onClick={handleCardSync}
              disabled={syncingCard}
            >
              <span aria-hidden="true">⟳</span>
            </button>
          )}
          {whatsappAvailable && (
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
                      onClick={() => openWhatsApp(buildBalanceReminderMessage(account.name, account.balanceDue || "0", account.currency))}
                    >
                      تذكير بالرصيد المستحق
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => openWhatsApp(buildAccountStatementMessage(account.name, ledgerEntries))}
                    >
                      كشف الحساب بالتفاصيل
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="account-card-details">
        <div className="account-detail-block">
          <span className="account-card-label">{account.rechargeDate ? "موعد التجديد" : "نهاية الانتظار"}</span>
          <span className="account-card-value account-date">{account.rechargeDate || account.standbyDate || "—"}</span>
          {remaining && <span className={`date-status ${urgencyClass}`}>{remaining}</span>}
        </div>

        <div className="account-detail-block balance-block">
          <span className="account-card-label">الرصيد المستحق</span>
          {balanceIsZero ? (
            <span className="badge badge-green">لا يوجد مستحق</span>
          ) : (
            <span className="account-card-value balance-value">
              {account.currency}{account.balanceDue || "0"}
            </span>
          )}
        </div>
      </div>

      {(account.subscriptionId || account.kitNumber || account.serialNumber || account.dataUsageGb) && (
        <div className="account-card-identifiers">
          {account.subscriptionId && <span>الاشتراك: <strong dir="ltr">{account.subscriptionId}</strong></span>}
          {account.kitNumber && <span>KIT: <strong dir="ltr">{account.kitNumber}</strong></span>}
          {account.serialNumber && <span>SN: <strong dir="ltr">{account.serialNumber}</strong></span>}
          {account.dataUsageGb && <span>الاستهلاك: <strong dir="ltr">{account.dataUsageGb} GB</strong></span>}
        </div>
      )}

      <div className="account-card-ledger-row">
        <span className="account-card-label">حساب الزبون</span>
        {LEDGER_CURRENCIES.every((c) => !ledgerBalances[c]) ? (
          <span className="badge badge-green">لا يوجد مستحق</span>
        ) : (
          LEDGER_CURRENCIES.map((c) => {
            const balance = ledgerBalances[c];
            if (!balance) return null;
            return balance > 0 ? (
              <span key={c} className="badge badge-red">عليه {balance.toFixed(2)} {LEDGER_CURRENCY_LABELS[c]}</span>
            ) : (
              <span key={c} className="badge badge-green">له {(-balance).toFixed(2)} {LEDGER_CURRENCY_LABELS[c]}</span>
            );
          })
        )}
        <button className="ledger-open-btn" type="button" onClick={() => onLedger(account)}>
          السجل
        </button>
      </div>

      {emailMismatch && (
        <div className="account-card-alert">
          ⚠️ البريد الإلكتروني من Starlink لا يطابق المتوقع
        </div>
      )}

      {account.alertReason && <div className="account-card-alert">{account.alertReason}</div>}

      <div className="account-card-footer">
        {lastSynced && <span className="account-card-synced">آخر مزامنة من Starlink: {lastSynced}</span>}
        <div className="account-card-actions">
          <button
            className="card-action card-action-primary"
            type="button"
            onClick={handleOpen}
            disabled={opening}
            title={isAndroidApp ? "فتح متصفح مستقل لهذا الحساب" : "متاح فقط داخل تطبيق STAR NET لنظام Android"}
          >
            <span aria-hidden="true">↗</span> {opening ? "جارِ الفتح…" : "فتح"}
          </button>
          <button className="card-action" title="معلومات" onClick={() => onInfo(account)}>
            <span aria-hidden="true">ⓘ</span> معلومات
          </button>
          <button className="card-action" title="تعديل" onClick={() => onEdit(account)}>
            <span aria-hidden="true">✎</span> تعديل
          </button>
        </div>
      </div>
    </article>
  );
}
