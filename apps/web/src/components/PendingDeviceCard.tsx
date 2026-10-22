"use client";

import { useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { missingKit } from "@/lib/saleDevices";

function saleDateLabel(date: string): string {
  const [y, m, d] = date.split("-");
  return y && m && d ? `${Number(d)}/${Number(m)}/${y}` : date;
}

/**
 * ⏳ «غير مفعّل» (his Oct 22 2026 ask): a device sold by invoice that has no Starlink account /
 * subscription yet - so no renewal, no days left, no sync. Customer, type, KIT (copy), sale date, and
 * «⚡ شحن / تفعيل» (the account, then its first charge, on this same device).
 */
export function PendingDeviceCard({
  account,
  clientName,
  onActivate,
  onEdit,
}: {
  account: StarlinkAccountSummary;
  clientName?: string;
  onActivate?: (account: StarlinkAccountSummary) => void;
  onEdit?: (account: StarlinkAccountSummary) => void;
}) {
  const [copied, setCopied] = useState(false);
  const kit = (account.kitNumber || account.serialNumber || "").trim();
  const model = account.deviceModel;

  async function copyKit() {
    try {
      await navigator.clipboard.writeText(kit);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("انسخ رقم KIT:", kit);
    }
  }

  return (
    <article className="pending-device-card" data-pending="1">
      <header className="pending-device-head">
        <span className="pending-device-icon" aria-hidden="true">
          📡<small>⏳</small>
        </span>
        <div className="pending-device-title">
          <strong>{account.name}</strong>
          <span>
            👤 {clientName ?? "بدون زبون"}
            {model ? ` · ${model}` : ""}
          </span>
        </div>
        <span className="pending-device-badge">⏳ غير مفعّل</span>
      </header>
      <div className="pending-device-facts">
        {missingKit(account) ? (
          <span className="pending-device-kit is-missing">KIT ناقص</span>
        ) : (
          <button type="button" className="pending-device-kit" onClick={() => void copyKit()} aria-label={`نسخ رقم KIT ${kit}`}>
            <bdi dir="ltr">{kit}</bdi> <span aria-hidden="true">{copied ? "✓" : "📋"}</span>
          </button>
        )}
        {account.pendingActivation?.soldAt && <span>🧾 بِيع {saleDateLabel(account.pendingActivation.soldAt)}</span>}
      </div>
      <div className="pending-device-actions">
        {onActivate && (
          <button type="button" className="dialog-primary" onClick={() => onActivate(account)}>
            ⚡ شحن / تفعيل
          </button>
        )}
        {onEdit && (
          <button type="button" className="dialog-secondary" onClick={() => onEdit(account)}>
            ✎ تعديل
          </button>
        )}
      </div>
    </article>
  );
}
