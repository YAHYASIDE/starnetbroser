"use client";

import { StarlinkAccountSummary } from "@starnet/shared";
import { presentStatus, isBalanceDueZero } from "@/lib/status";
import { daysRemainingLabel } from "@/lib/date";

export function AccountCard({ account }: { account: StarlinkAccountSummary }) {
  const dish = presentStatus(account.dishStatus);
  const wifi = presentStatus(account.wifiStatus);
  const remaining = daysRemainingLabel(account.rechargeDate || account.standbyDate);
  const balanceIsZero = isBalanceDueZero(account.balanceDue);

  return (
    <article className="account-card">
      <header className="account-card-header">
        <h3 className="account-card-name">{account.name}</h3>
        <div className="account-card-dots" aria-label="حالة الاتصال">
          <span className={`dot ${dish.className}`} title={`ستارلينك: ${dish.label}`} />
          <span className={`dot ${wifi.className}`} title={`واي فاي: ${wifi.label}`} />
        </div>
      </header>

      <div className="account-card-row">
        <span className="account-card-label">{account.rechargeDate ? "التجديد" : "الانتظار"}</span>
        <span className="account-card-value">
          {account.rechargeDate || account.standbyDate || "—"}
          {remaining ? ` · ${remaining}` : ""}
        </span>
      </div>

      <div className="account-card-row">
        <span className="account-card-label">الرصيد</span>
        {balanceIsZero ? (
          <span className="badge badge-green">لا يوجد رصيد مستحق</span>
        ) : (
          <span className="account-card-value">
            {account.currency}
            {account.balanceDue || "0"}
          </span>
        )}
      </div>

      {account.alertReason && <div className="account-card-alert">{account.alertReason}</div>}

      <div className="account-card-footer">
        <span className="account-card-updated">آخر تحديث: {account.lastUpdated || "—"}</span>
        <div className="account-card-actions">
          <button className="btn-icon" title="فتح">
            فتح
          </button>
          <button className="btn-icon" title="معلومات">
            معلومات
          </button>
          <button className="btn-icon" title="تعديل">
            تعديل
          </button>
        </div>
      </div>
    </article>
  );
}
