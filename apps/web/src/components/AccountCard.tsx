"use client";

import { useEffect, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";
import { presentStatus, presentServiceStatus, isBalanceDueZero } from "@/lib/status";
import { daysRemainingLabel, daysRemainingNumber, formatRelativeTime } from "@/lib/date";
import { emailsMismatch } from "@/lib/emailMatch";
import { computeBalanceByCurrency, LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, LedgerEntry } from "@/lib/ledgerStore";
import { formatAmount } from "@/lib/formatAmount";
import { PaymentAllocation } from "@/lib/paymentAllocationStore";
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
  /** This account's payment-allocation records - see paymentAllocationStore.ts. Only used to mark
   * each shipment's own payment status (unpaid/partial/paid) in the WhatsApp statement message;
   * never anything Starlink-cost or profit related, which stays strictly internal. */
  allocations: PaymentAllocation[];
  onLedger: (account: StarlinkAccountSummary) => void;
  onDeviceStatement: (account: StarlinkAccountSummary) => void;
  /** The Client this device is linked to (via account.clientId) - undefined for a card never
   * linked to a customer yet ("الزبون غير محدد"). Resolved by the caller from clientStore, never
   * looked up here, so every card in a render pass sees the exact same store snapshot. */
  client?: Client;
  onOpenClient: (client: Client) => void;
}

const STATUS_TILE_CLASS: Record<string, string> = {
  "dot-green": "stat-tile-icon-green",
  "dot-yellow": "stat-tile-icon-yellow",
  "dot-red": "stat-tile-icon-red",
  "dot-gray": "stat-tile-icon-gray",
};

/** First letter of the first two words (e.g. "محمد لمين" -> "م ل") - never more than that, so a
 * long name never overflows the small avatar circle. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 1);
  return `${parts[0].slice(0, 1)} ${parts[1].slice(0, 1)}`;
}

function IconDish() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 14a9 9 0 0 1 13-8" />
      <path d="M3 17l7-7 8 8-3 3a11 11 0 0 1-12-4Z" />
      <path d="M18 6l3-3M15 15v6M13 19h4" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function IconWallet() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3" />
      <path d="M3 7v10a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1h-4a2 2 0 1 0 0 4h5" />
    </svg>
  );
}

function IconWifi() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

export function AccountCard({ account, onEdit, onInfo, ledgerEntries, allocations, onLedger, onDeviceStatement, client, onOpenClient }: Props) {
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

  // Everything not shown on the main card (KIT/Serial/subscription/data usage, the customer
  // ledger, alerts, تعديل, per-card sync) sits one tap away behind "عرض المزيد" at the bottom.
  const [expanded, setExpanded] = useState(false);
  const identityEmail = account.expectedEmail || account.starlinkAccountEmail;
  const identityName = client?.name || account.starlinkAccountHolderName || account.name;

  async function handleCopyDeviceName() {
    try {
      await navigator.clipboard.writeText(account.name);
    } catch {
      // Clipboard API can be unavailable (non-secure context, permission denied) - a purely
      // convenience action, so it silently no-ops rather than alerting the operator.
    }
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
          </div>
        </>
      )}
    </div>
  );

  return (
    <article className="account-card">
      <div className="account-card-identity-row">
        <div className="account-card-starlink-chip">
          <IconDish />
          <span>Starlink</span>
        </div>

        <div className="account-card-identity-name">
          {client ? (
            <button type="button" className="account-card-client-name" onClick={() => onOpenClient(client)} title="فتح بطاقة الزبون">
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
          {serviceStatus && <span className={`badge ${serviceStatus.className}`}>{serviceStatus.label}</span>}
        </div>

        <div className="account-card-avatar" aria-hidden="true">{initials(identityName)}</div>
      </div>

      <div className="account-card-divider" />

      <div className="account-card-device-row">
        <span className="account-card-label">حساب الجهاز:</span>
        <div className="account-card-device-name-row">
          <button type="button" className="account-card-copy-btn" onClick={handleCopyDeviceName} title="نسخ اسم الحساب" aria-label="نسخ اسم الحساب">
            <IconCopy />
          </button>
          <h3 className="account-card-name">{account.name}</h3>
        </div>
        {account.planName && <p className="account-card-plan">{account.planName}</p>}
      </div>

      {identityEmail && (
        <div className="account-card-email-row" dir="ltr">
          <span>{identityEmail}</span>
          <span className="account-card-email-icon" aria-hidden="true"><IconEnvelope /></span>
        </div>
      )}

      <div className="account-card-stat-grid">
        <div className="stat-tile">
          <span className="stat-tile-icon stat-tile-icon-blue"><IconCalendar /></span>
          <span className="stat-tile-label">{account.rechargeDate ? "تاريخ التجديد" : "نهاية الانتظار"}</span>
          <span className="stat-tile-value" dir="ltr">{account.rechargeDate || account.standbyDate || "—"}</span>
          {remaining && <span className={`date-status ${urgencyClass}`}>{remaining}</span>}
        </div>
        <div className="stat-tile">
          <span className="stat-tile-icon stat-tile-icon-orange"><IconWallet /></span>
          <span className="stat-tile-label">الرصيد المستحق</span>
          {balanceIsZero ? (
            <span className="stat-tile-value stat-tile-value-ok">لا يوجد</span>
          ) : (
            <span className="stat-tile-value" dir="ltr">{account.currency}{account.balanceDue || "0"}</span>
          )}
        </div>
        <div className="stat-tile">
          <span className={`stat-tile-icon ${STATUS_TILE_CLASS[wifi.className]}`}><IconWifi /></span>
          <span className="stat-tile-label">حالة Wi-Fi</span>
          <span className="stat-tile-value">{wifi.label}</span>
        </div>
        <div className="stat-tile">
          <span className={`stat-tile-icon ${STATUS_TILE_CLASS[dish.className]}`}><IconDish /></span>
          <span className="stat-tile-label">حالة الطبق</span>
          <span className="stat-tile-value">{dish.label}</span>
        </div>
      </div>

      {lastSynced && (
        <div className="account-card-last-update">
          <IconClock />
          <span>آخر تحديث: {lastSynced}</span>
        </div>
      )}

      <div className="account-card-main-actions">
        <button className="card-action" type="button" onClick={() => onInfo(account)} title="تفاصيل">
          <IconInfo /> تفاصيل
        </button>
        {whatsAppButton}
        <button
          className="card-action card-action-primary"
          type="button"
          onClick={handleOpen}
          disabled={opening}
          title={isAndroidApp ? "فتح متصفح مستقل لهذا الحساب" : "متاح فقط داخل تطبيق STAR NET لنظام Android"}
        >
          <span aria-hidden="true">↗</span> {opening ? "جارِ الفتح…" : "فتح حساب Starlink"}
        </button>
      </div>

      <button
        type="button"
        className="account-card-more-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? "إخفاء التفاصيل الإضافية" : "عرض المزيد"}
        <span className={`account-card-toggle-icon${expanded ? " is-open" : ""}`} aria-hidden="true">⌄</span>
      </button>

      {expanded && (
        <div className="account-card-expanded">
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
                  <span key={c} className="badge badge-red">عليه {formatAmount(balance)} {LEDGER_CURRENCY_LABELS[c]}</span>
                ) : (
                  <span key={c} className="badge badge-green">له {formatAmount(-balance)} {LEDGER_CURRENCY_LABELS[c]}</span>
                );
              })
            )}
            <button className="ledger-open-btn" type="button" onClick={() => onLedger(account)}>
              السجل
            </button>
            <button className="ledger-open-btn" type="button" onClick={() => onDeviceStatement(account)}>
              كشف حساب الجهاز
            </button>
          </div>

          {emailMismatch && (
            <div className="account-card-alert">
              ⚠️ البريد الإلكتروني من Starlink لا يطابق المتوقع
            </div>
          )}

          {account.alertReason && <div className="account-card-alert">{account.alertReason}</div>}

          <div className="account-card-footer">
            <button className="card-action" title="تعديل" onClick={() => onEdit(account)}>
              <span aria-hidden="true">✎</span> تعديل
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
