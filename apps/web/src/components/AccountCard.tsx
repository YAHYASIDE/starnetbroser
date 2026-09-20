"use client";

import { useEffect, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";
import { presentStatus, isBalanceDueZero } from "@/lib/status";
import { daysRemainingLabel, daysRemainingNumber } from "@/lib/date";
import { isRunningInAndroidApp, openIsolatedAccountBrowser } from "@/lib/localBrowser";

interface Props {
  account: StarlinkAccountSummary;
  onEdit: (account: StarlinkAccountSummary) => void;
  onInfo: (account: StarlinkAccountSummary) => void;
}

export function AccountCard({ account, onEdit, onInfo }: Props) {
  const dish = presentStatus(account.dishStatus);
  const wifi = presentStatus(account.wifiStatus);
  const remaining = daysRemainingLabel(account.rechargeDate || account.standbyDate);
  const remainingDays = daysRemainingNumber(account.rechargeDate || account.standbyDate);
  const balanceIsZero = isBalanceDueZero(account.balanceDue);
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

  return (
    <article className="account-card">
      <header className="account-card-header">
        <div className="account-identity">
          <span className="account-avatar" aria-hidden="true">{account.name.trim().charAt(0) || "★"}</span>
          <div>
            <h3 className="account-card-name">{account.name}</h3>
            <p className="account-card-plan">{account.planName || account.deviceName || "حساب Starlink"}</p>
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

      {account.alertReason && <div className="account-card-alert">{account.alertReason}</div>}

      <div className="account-card-footer">
        <span className="account-card-updated">آخر تحديث: {account.lastUpdated || "—"}</span>
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
