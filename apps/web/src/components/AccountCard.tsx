"use client";

import { useEffect, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";
import { presentStatus, presentServiceStatus, isBalanceDueZero, planBadgeLabel } from "@/lib/status";
import { daysRemainingLabel, daysRemainingNumber, formatRelativeTime } from "@/lib/date";
import { emailsMismatch } from "@/lib/emailMatch";
import { computeBalanceByCurrency, LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, LedgerEntry } from "@/lib/ledgerStore";
import { computeDeviceAccountingSummary, computeShipmentProfit } from "@/lib/accountingStore";
import { CurrencyStore, getCurrency, toUsd } from "@/lib/currencyStore";
import { formatAmount } from "@/lib/formatAmount";
import { PaymentAllocation } from "@/lib/paymentAllocationStore";
import { Client } from "@/lib/clientStore";
import { isRunningInAndroidApp, openIsolatedAccountBrowser, triggerImmediateSync } from "@/lib/localBrowser";
import {
  buildAccountStatementMessage,
  buildBalanceReminderMessage,
  buildDeviceInfoMessage,
  buildExpiryReminderMessage,
  buildWhatsAppLink,
} from "@/lib/whatsapp";
import { DeviceFaultDialog } from "./DeviceFaultDialog";
import { RenewalConfirmDialog } from "./RenewalConfirmDialog";

/** Which list this card is currently shown in - changes which of the four circular actions apply.
 * "active" (the default, normal dashboard list) offers متعطل/أرشفة/تجديد/حذف; "archived" and
 * "trash" each offer only "استعادة" plus, for trash, a permanent-delete action - restoring one of
 * those views' own cards is never mixed with the normal four actions, to avoid archiving/deleting
 * a card that's already archived/deleted. */
export type AccountCardContext = "active" | "archived" | "trash";

interface Props {
  account: StarlinkAccountSummary;
  onEdit: (account: StarlinkAccountSummary) => void;
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
  /** The general currency registry (see currencyStore.ts) - used only to show a small "≈ X USD"
   * line under a non-USD Starlink balance, when that currency's rate happens to be registered
   * (e.g. via the /currencies page). Never guessed, and never shown at all when no rate is known -
   * account.balanceDue/account.currency themselves stay exactly as synced either way. */
  currencyStore: CurrencyStore;
  context?: AccountCardContext;
  /** Applies a new/updated fault record (or clears it, via a separate call with `null`). */
  onSetDeviceFault: (account: StarlinkAccountSummary, fault: StarlinkAccountSummary["deviceFault"]) => void;
  /** Moves the device to the archive ("active" context only). */
  onArchive: (account: StarlinkAccountSummary) => void;
  /** Moves the device to the recoverable trash ("active" context only). */
  onSoftDelete: (account: StarlinkAccountSummary) => void;
  /** Restores from whichever of archive/trash this card is currently shown in. */
  onRestore: (account: StarlinkAccountSummary) => void;
  /** Trash context only - the original permanent delete (with the Starlink-session prompt). */
  onPermanentDelete?: (account: StarlinkAccountSummary) => void;
  /** Applies the confirmed new renewal date, then opens the ledger dialog for this account so the
   * operator can record the actual shipment/payment. */
  onConfirmRenewal: (account: StarlinkAccountSummary, newRechargeDate: string, autoShipment: boolean) => void;
}

const STATUS_TILE_CLASS: Record<string, string> = {
  "dot-green": "mini-status-green",
  "dot-yellow": "mini-status-yellow",
  "dot-red": "mini-status-red",
  "dot-gray": "mini-status-gray",
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

function IconWrench() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.7 6.3a4 4 0 0 0-5.6 5.6L3 18l3 3 6.1-6.1a4 4 0 0 0 5.6-5.6l-2.5 2.5-2-2 2.5-2.5Z" />
    </svg>
  );
}

function IconArchive() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 13h4" />
    </svg>
  );
}

function IconRenew() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11A8 8 0 1 0 6.3 17.7" />
      <path d="M20 5v6h-6" />
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
  account, onEdit, ledgerEntries, allocations, onLedger, onDeviceStatement, client, onOpenClient, currencyStore,
  context = "active", onSetDeviceFault, onArchive, onSoftDelete, onRestore, onPermanentDelete, onConfirmRenewal,
}: Props) {
  const ledgerBalances = computeBalanceByCurrency(ledgerEntries);
  const dish = presentStatus(account.dishStatus);
  const wifi = presentStatus(account.wifiStatus);
  const serviceStatus = presentServiceStatus(account.serviceStatus);
  const planBadge = account.planName ? (planBadgeLabel(account.planName) ?? account.planName) : undefined;
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
  const urgencyClass = remainingDays === null
    ? "date-neutral"
    : remainingDays < 0
      ? "date-expired"
      : remainingDays <= 3
        ? "date-warning"
        : "date-safe";

  const accounting = computeDeviceAccountingSummary(ledgerEntries);
  const shipmentProfits = ledgerEntries.filter((e) => e.kind === "debit").map(computeShipmentProfit);
  const hasUnsettledCost = accounting.pendingShipmentCount > 0;
  let profitMruTotal: number | undefined;
  let profitSifaTotal: number | undefined;
  for (const profit of shipmentProfits) {
    if (profit.status !== "computed") continue;
    if (profit.profitMru !== undefined) profitMruTotal = (profitMruTotal ?? 0) + profit.profitMru;
    if (profit.profitSifa !== undefined) profitSifaTotal = (profitSifaTotal ?? 0) + profit.profitSifa;
  }

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

  // Everything not shown on the compact card sits one tap away behind "التفاصيل" at the bottom -
  // never a second toggle elsewhere on the same card.
  const [expanded, setExpanded] = useState(false);
  const [showFaultDialog, setShowFaultDialog] = useState(false);
  const [showRenewalDialog, setShowRenewalDialog] = useState(false);
  const identityEmail = account.expectedEmail || account.starlinkAccountEmail;

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

  function handleSoftDeleteClick() {
    if (!window.confirm(`نقل الجهاز "${account.name}" إلى سلة المحذوفات؟ يمكنك استعادته لاحقًا.`)) return;
    onSoftDelete(account);
  }

  function handlePermanentDeleteClick() {
    if (!onPermanentDelete) return;
    if (!window.confirm(`حذف الجهاز "${account.name}" نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
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
            <button type="button" role="menuitem" onClick={() => openWhatsApp(buildDeviceInfoMessage(account))}>
              معلومات الجهاز الكاملة
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <article className={`account-card${isSuspended ? " account-card-suspended" : ""}`}>
      {isSuspended && (
        <div className="account-card-suspended-banner">
          ⚠️ الخدمة موقوفة — تحقق من فواتير Starlink غير المسددة
        </div>
      )}

      {account.deviceFault && (
        <div className="account-card-fault-banner">
          🔧 الجهاز معطل ({account.deviceFault.reason === "burned" ? "محترق" : "عطل آخر"})
          {account.deviceFault.note && ` — ${account.deviceFault.note}`}
        </div>
      )}

      {account.isRestricted && (
        <div className="account-card-restricted-banner">
          🚫 الجهاز مقيّد — أعده إلى البلد المسجل ووصّله بالكهرباء لمدة 24 ساعة على الأقل لاستئناف الخدمة
        </div>
      )}

      <div className="account-card-top-row">
        <div className="account-card-avatar" aria-hidden="true">{initials(account.name)}</div>
        <div className="account-card-title-block">
          <h3 className="account-card-name">{account.name}</h3>
          {client ? (
            <button type="button" className="account-card-client-name" onClick={() => onOpenClient(client)} title="فتح بطاقة الزبون">
              {client.name}
            </button>
          ) : (
            <div className="account-card-client-missing">
              <span className="badge badge-gray">الزبون غير محدد</span>
              <button type="button" className="text-action" onClick={() => onEdit(account)}>ربط بزبون</button>
            </div>
          )}
        </div>
        {serviceStatus && <span className={`badge ${serviceStatus.className} account-card-status-badge`}>{serviceStatus.label}</span>}
      </div>

      <div className="account-card-starlink-balance-row">
        <span className="account-card-label">مستحق Starlink:</span>
        {balanceIsZero ? (
          <strong className="stat-tile-value-ok">لا يوجد</strong>
        ) : (
          <span dir="ltr">
            {balanceUsdEquivalent !== undefined && (
              <span className="stat-tile-value-usd">≈ {formatAmount(balanceUsdEquivalent)} USD · </span>
            )}
            <strong>{account.currency} {account.balanceDue || "0"}</strong>
          </span>
        )}
      </div>

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
        <span className="account-card-recharge-pill" dir="ltr">
          <span aria-hidden="true">📅</span> {account.rechargeDate || account.standbyDate || "—"}
        </span>
        {identityEmail && (
          <span className="account-card-recharge-pill" dir="ltr">
            <IconEnvelope /> {identityEmail}
          </span>
        )}
      </div>

      <div className="account-card-mini-row">
        {planBadge && (
          <span className="badge badge-mint account-card-plan-badge" title={account.planName}>
            {planBadge}
          </span>
        )}
        {remaining && <span className={`date-status ${urgencyClass}`}>{remaining}</span>}
        <span className={`mini-status ${STATUS_TILE_CLASS[dish.className]}`} title={`حالة الطبق: ${dish.label}`}>
          <IconDish /> {dish.className === "dot-gray" ? "غير معروف" : dish.label}
        </span>
        <span className={`mini-status ${STATUS_TILE_CLASS[wifi.className]}`} title={`حالة Wi-Fi: ${wifi.label}`}>
          <IconWifi /> {wifi.className === "dot-gray" ? "غير معروف" : wifi.label}
        </span>
        {hasUnsettledCost && <span className="badge badge-yellow account-card-d-mark" title="تكلفة شحن غير مسددة">D</span>}
      </div>

      <div className="account-card-main-actions">
        <button
          type="button"
          className="account-card-more-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "طي التفاصيل" : "التفاصيل"}
          <span className={`account-card-toggle-icon${expanded ? " is-open" : ""}`} aria-hidden="true">⌄</span>
        </button>
        {whatsAppButton}
        <button
          className="card-action card-action-primary"
          type="button"
          onClick={handleOpen}
          disabled={opening}
          title={isAndroidApp ? "فتح متصفح مستقل لهذا الحساب" : "متاح فقط داخل تطبيق STAR NET لنظام Android"}
        >
          <span aria-hidden="true">↗</span> {opening ? "جارِ الفتح…" : "فتح الحساب"}
        </button>
      </div>

      {context === "active" ? (
        <div className="account-card-quick-actions">
          <button type="button" className="quick-action" onClick={() => setShowFaultDialog(true)}>
            <span className="quick-action-icon quick-action-fault" aria-hidden="true"><IconWrench /></span>
            متعطل
          </button>
          <button type="button" className="quick-action" onClick={() => setShowRenewalDialog(true)}>
            <span className="quick-action-icon quick-action-renew" aria-hidden="true"><IconRenew /></span>
            تجديد
          </button>
          <button type="button" className="quick-action" onClick={handleArchiveClick}>
            <span className="quick-action-icon quick-action-archive" aria-hidden="true"><IconArchive /></span>
            أرشفة
          </button>
          <button type="button" className="quick-action" onClick={handleSoftDeleteClick}>
            <span className="quick-action-icon quick-action-delete" aria-hidden="true"><IconTrash /></span>
            حذف
          </button>
        </div>
      ) : (
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
              {account.dataUsageGb && <span>الاستهلاك: <strong dir="ltr">{account.dataUsageGb} GB</strong></span>}
            </div>
          )}

          {(hasUnsettledCost || profitMruTotal !== undefined || profitSifaTotal !== undefined) && (
            <div className="account-card-profit-row">
              <span className="account-card-label">الربح:</span>
              {hasUnsettledCost ? (
                <span className="badge badge-yellow">معلّق حتى تسديد تكلفة الشحن (D)</span>
              ) : (
                <span dir="ltr">
                  {profitMruTotal !== undefined && <strong>{formatAmount(profitMruTotal)} أوقية</strong>}
                  {profitMruTotal !== undefined && profitSifaTotal !== undefined && " · "}
                  {profitSifaTotal !== undefined && <strong>{formatAmount(profitSifaTotal)} سيفا</strong>}
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
          </div>

          <div className="account-card-footer">
            <button className="card-action" title="تعديل البيانات" onClick={() => onEdit(account)}>
              <span aria-hidden="true">✎</span> تعديل البيانات
            </button>
          </div>
        </div>
      )}

      {showFaultDialog && (
        <DeviceFaultDialog
          account={account}
          onSave={(fault) => { onSetDeviceFault(account, fault); setShowFaultDialog(false); }}
          onClear={() => { onSetDeviceFault(account, null); setShowFaultDialog(false); }}
          onClose={() => setShowFaultDialog(false)}
        />
      )}

      {showRenewalDialog && (
        <RenewalConfirmDialog
          account={account}
          onConfirm={(newDate, autoShipment) => { onConfirmRenewal(account, newDate, autoShipment); setShowRenewalDialog(false); }}
          onClose={() => setShowRenewalDialog(false)}
        />
      )}
    </article>
  );
}
