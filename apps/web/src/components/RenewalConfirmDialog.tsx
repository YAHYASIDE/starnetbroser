"use client";

import { DateInput } from "./DateInput";
import { FormEvent, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";
import { formatAmount } from "@/lib/formatAmount";

interface Props {
  account: StarlinkAccountSummary;
  /** The device's open D's (Starlink cost still owed), USD and count. */
  openDebtUsd: number;
  openDebtCount: number;
  /** Applies the new renewal date. With open D's the renewal IS paying Starlink for them
   * (`settleFromCard` set, no new shipment). Otherwise `autoShipment` asks the caller to record
   * the month's shipment from the device's renewalPlan - paid to Starlink now unless `costPending`
   * - or it opens the ledger dialog for a manual entry. This dialog itself never touches the
   * ledger or Starlink. */
  onConfirm: (newRechargeDate: string, autoShipment: boolean, costPending: boolean, settleFromCard: boolean | null) => void;
  onClose: () => void;
}

function dateAfterDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function toInputDate(date: string): string {
  return date.replace(/\//g, "-");
}

function toStoredDate(date: string): string {
  return date.replace(/-/g, "/");
}

/**
 * "تجديد" - records that the operator has actually shipped/renewed this device. Only ever updates
 * `rechargeDate` on confirm; it never talks to Starlink itself. The financial side is either the
 * one-tap shipment from the device's fixed monthly price (renewalPlan.ts, done by the caller) or
 * the existing "إضافة حركة" flow (LedgerDialog) opened right after.
 */
export function RenewalConfirmDialog({ account, openDebtUsd, openDebtCount, onConfirm, onClose }: Props) {
  const settlesDebt = openDebtCount > 0;
  // Starlink is paid from the "كاش" card by default (starlinkDebt.ts).
  const [fromCard, setFromCard] = useState(true);
  const [date, setDate] = useState(toInputDate(account.rechargeDate || dateAfterDays(28)));
  const plan = account.renewalPlan;
  // With a fixed monthly price (renewalPlan) the shipment can be recorded in the same tap; the
  // operator can still untick this to type it by hand.
  const [autoShipment, setAutoShipment] = useState(plan !== undefined);
  // Renewing is paying Starlink, so a new month is recorded as paid (✓) unless switched to D.
  const [costPending, setCostPending] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (settlesDebt) {
      onConfirm(toStoredDate(date), false, false, fromCard);
      return;
    }
    onConfirm(toStoredDate(date), autoShipment && plan !== undefined, costPending, autoShipment && plan !== undefined && !costPending ? fromCard : null);
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog renewal-dialog" role="dialog" aria-modal="true" aria-labelledby="renewal-dialog-title">
        <header className="dialog-header">
          <div>
            <h2 id="renewal-dialog-title">تأكيد التجديد</h2>
            <p>حساب "{account.name}" - سجّل أنك شحنت/جددت الجهاز فعليًا</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="إغلاق">×</button>
        </header>

        <form className="account-form" onSubmit={submit}>
          <label className="form-field form-wide">
            <span>موعد الانتهاء الجديد *</span>
            <DateInput required  value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          {settlesDebt && (
            <div className="renewal-settle form-wide">
              <strong>
                لم يُدفع لستارلينك (D): <bdi dir="ltr">{formatAmount(openDebtUsd)} $</bdi>
                {openDebtCount > 1 ? ` (${openDebtCount} شحنات)` : ""}
              </strong>
              <span>التجديد الآن = دفعها لستارلينك اليوم. ينزل ربحها وحصة المندوب اليوم، ولا تُسجَّل شحنة جديدة على الزبون.</span>
            </div>
          )}

          {!settlesDebt && plan && (
            <label className="ledger-d-toggle renewal-auto-toggle form-wide">
              <input type="checkbox" checked={autoShipment} onChange={(e) => setAutoShipment(e.target.checked)} />
              <span>
                ⚡ سجّل الشحنة تلقائيًا:{" "}
                <bdi dir="ltr">
                  {formatAmount(plan.saleAmount)} {plan.saleCurrency}
                </bdi>{" "}
                للزبون، وتكلفة Starlink{" "}
                <bdi dir="ltr">
                  {formatAmount(plan.costAmount)} {plan.costCurrency}
                </bdi>
              </span>
            </label>
          )}

          {!settlesDebt && plan && autoShipment && (
            <div className="renewal-cost-status form-wide" role="radiogroup" aria-label="تكلفة Starlink">
              <button
                type="button"
                role="radio"
                aria-checked={!costPending}
                className={`renewal-cost-option${!costPending ? " renewal-cost-option-active" : ""}`}
                onClick={() => setCostPending(false)}
              >
                ✓ دفعت التكلفة
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={costPending}
                className={`renewal-cost-option renewal-cost-option-d${costPending ? " renewal-cost-option-active" : ""}`}
                onClick={() => setCostPending(true)}
              >
                D لم أدفع بعد
              </button>
            </div>
          )}

          {(settlesDebt || (plan && autoShipment && !costPending)) && (
            <label className="ledger-d-toggle form-wide">
              <input type="checkbox" checked={fromCard} onChange={(e) => setFromCard(e.target.checked)} />
              <span>💳 دُفعت من بطاقة كاش</span>
            </label>
          )}

          <p className="renewal-dialog-note">
            {settlesDebt
              ? "بعد التأكيد يُسجَّل أن ستارلينك مدفوع لهذا الجهاز ويُحدَّث موعد الانتهاء."
              : autoShipment && plan
              ? costPending
                ? "ستُسجَّل الشحنة بعلامة D (تكلفة Starlink غير مدفوعة) ويظهر ربحها متوقعًا حتى تسدّدها."
                : "ستُسجَّل الشحنة بأسعار الصرف الحالية وتظهر في كشف الجهاز والزبون مباشرة."
              : "بعد التأكيد سيُفتح سجل حركة الحساب لتسجيل الشحنة/الدفعة المرتبطة بهذا التجديد."}
          </p>

          <div className="dialog-actions form-wide">
            <button className="dialog-secondary" type="button" onClick={onClose}>إلغاء</button>
            <button className="dialog-primary" type="submit">تأكيد التجديد</button>
          </div>
        </form>
      </section>
    </div>
  );
}
