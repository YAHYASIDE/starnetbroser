"use client";

import { FormEvent, useMemo, useState } from "react";
import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";

export type AccountDialogMode = "add" | "edit" | "view";

interface Props {
  mode: AccountDialogMode;
  account?: StarlinkAccountSummary;
  onClose: () => void;
  onSave: (account: StarlinkAccountSummary) => void;
}

const statusOptions = [
  { value: DeviceStatus.GREEN, label: "طبيعي" },
  { value: DeviceStatus.YELLOW, label: "تنبيه" },
  { value: DeviceStatus.RED, label: "غير متصل" },
  { value: DeviceStatus.GRAY, label: "لا توجد بيانات" },
];

function dateAfterDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function createBlankAccount(): StarlinkAccountSummary {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `local-${Date.now()}`;

  return {
    id,
    customerId: `customer-${id}`,
    name: "",
    deviceName: "Standard Kit",
    kitNumber: "",
    serialNumber: "",
    standbyDate: "",
    rechargeDate: dateAfterDays(28),
    balanceDue: "0",
    currency: "$",
    dishStatus: DeviceStatus.GRAY,
    wifiStatus: DeviceStatus.GRAY,
    alertReason: "",
    lastUpdated: "الآن",
    lastSuccessfulScanAt: null,
    planName: "Residential",
  };
}

function inputDate(date: string): string {
  return date.replace(/\//g, "-");
}

function displayValue(value: string | null): string {
  return value?.trim() || "—";
}

export function AccountDialog({ mode, account, onClose, onSave }: Props) {
  const initial = useMemo(() => account ?? createBlankAccount(), [account]);
  const [draft, setDraft] = useState(initial);
  const isView = mode === "view";
  const title = mode === "add" ? "إضافة حساب جديد" : mode === "edit" ? "تعديل الحساب" : "معلومات الحساب";

  function update<K extends keyof StarlinkAccountSummary>(key: K, value: StarlinkAccountSummary[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isView) return;

    onSave({
      ...draft,
      name: draft.name.trim(),
      kitNumber: draft.kitNumber.trim(),
      serialNumber: draft.serialNumber.trim(),
      rechargeDate: draft.rechargeDate.replace(/-/g, "/"),
      balanceDue: draft.balanceDue.trim() || "0",
      planName: draft.planName.trim(),
      alertReason: draft.alertReason.trim(),
      lastUpdated: "الآن",
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title">
        <header className="dialog-header">
          <div>
            <h2 id="account-dialog-title">{title}</h2>
            <p>{isView ? "بيانات الحساب المسجلة" : "تُحفظ البيانات على هذا الجهاز في الوضع التجريبي"}</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="إغلاق">×</button>
        </header>

        {isView ? (
          <div className="account-info-grid">
            <div><span>اسم العميل</span><strong>{displayValue(draft.name)}</strong></div>
            <div><span>الخطة</span><strong>{displayValue(draft.planName)}</strong></div>
            <div><span>KIT</span><strong dir="ltr">{displayValue(draft.kitNumber)}</strong></div>
            <div><span>Serial</span><strong dir="ltr">{displayValue(draft.serialNumber)}</strong></div>
            <div><span>موعد التجديد</span><strong dir="ltr">{displayValue(draft.rechargeDate)}</strong></div>
            <div><span>الرصيد المستحق</span><strong dir="ltr">{draft.currency}{displayValue(draft.balanceDue)}</strong></div>
            <div><span>حالة الجهاز</span><strong>{statusOptions.find((item) => item.value === draft.dishStatus)?.label ?? "—"}</strong></div>
            <div><span>حالة Wi-Fi</span><strong>{statusOptions.find((item) => item.value === draft.wifiStatus)?.label ?? "—"}</strong></div>
            <div className="info-wide"><span>التنبيه</span><strong>{displayValue(draft.alertReason)}</strong></div>
          </div>
        ) : (
          <form className="account-form" onSubmit={submit}>
            <label className="form-field form-wide">
              <span>اسم العميل *</span>
              <input required autoFocus value={draft.name} onChange={(e) => update("name", e.target.value)} placeholder="مثال: محمد أحمد" />
            </label>

            <label className="form-field">
              <span>الخطة</span>
              <input value={draft.planName} onChange={(e) => update("planName", e.target.value)} placeholder="Residential" />
            </label>

            <label className="form-field">
              <span>موعد التجديد *</span>
              <input required type="date" dir="ltr" value={inputDate(draft.rechargeDate)} onChange={(e) => update("rechargeDate", e.target.value)} />
            </label>

            <label className="form-field">
              <span>رقم KIT</span>
              <input dir="ltr" value={draft.kitNumber} onChange={(e) => update("kitNumber", e.target.value)} placeholder="KIT…" />
            </label>

            <label className="form-field">
              <span>Serial Number</span>
              <input dir="ltr" value={draft.serialNumber} onChange={(e) => update("serialNumber", e.target.value)} placeholder="Serial…" />
            </label>

            <label className="form-field">
              <span>الرصيد المستحق</span>
              <input type="number" min="0" step="0.01" dir="ltr" value={draft.balanceDue} onChange={(e) => update("balanceDue", e.target.value)} />
            </label>

            <label className="form-field">
              <span>العملة</span>
              <select value={draft.currency} onChange={(e) => update("currency", e.target.value)}>
                <option value="$">USD ($)</option>
                <option value="USDT ">USDT</option>
                <option value="MRU ">MRU</option>
                <option value="SIFA ">SIFA</option>
              </select>
            </label>

            <label className="form-field">
              <span>حالة الجهاز</span>
              <select value={draft.dishStatus} onChange={(e) => update("dishStatus", e.target.value as DeviceStatus)}>
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <label className="form-field">
              <span>حالة Wi-Fi</span>
              <select value={draft.wifiStatus} onChange={(e) => update("wifiStatus", e.target.value as DeviceStatus)}>
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <label className="form-field form-wide">
              <span>تنبيه أو ملاحظة</span>
              <textarea rows={2} value={draft.alertReason} onChange={(e) => update("alertReason", e.target.value)} placeholder="اختياري" />
            </label>

            <div className="dialog-actions form-wide">
              <button className="dialog-secondary" type="button" onClick={onClose}>إلغاء</button>
              <button className="dialog-primary" type="submit">{mode === "add" ? "إضافة الحساب" : "حفظ التعديل"}</button>
            </div>
          </form>
        )}

        {isView && <button className="dialog-primary dialog-done" type="button" onClick={onClose}>تم</button>}
      </section>
    </div>
  );
}
