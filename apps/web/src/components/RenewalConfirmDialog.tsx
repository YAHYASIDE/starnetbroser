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
  onConfirm: (newRechargeDate: string, autoShipment: boolean, costPending: boolean, settleFromCard: boolean | null, payOpenD: boolean) => void;
  onClose: () => void;
  /** What Starlink's last read still asks («ALL 17714.00»), null when nothing is due. */
  starlinkDue?: string | null;
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
export function RenewalConfirmDialog({ account, openDebtUsd, openDebtCount, onConfirm, onClose, starlinkDue = null }: Props) {
  const hasOpenD = openDebtCount > 0;
  // 🅳 With an open D he says every time what this renewal is (his Oct 10 2026 choice «يسألني كل
  // مرة»): before, «تجديد» always meant «paid that D», so a new month quietly cleared the old D.
  const [dChoice, setDChoice] = useState<"paid" | "new" | null>(null);
  const settlesDebt = hasOpenD && dChoice === "paid";
  // Starlink's last read still asks for money: clearing the D needs a second yes.
  const [sureStillDue, setSureStillDue] = useState(false);
  const needsSure = settlesDebt && Boolean(starlinkDue);
  // Starlink is paid from the "كاش" card by default (starlinkDebt.ts).
  const [fromCard, setFromCard] = useState(true);
  const [date, setDate] = useState(toInputDate(account.rechargeDate || dateAfterDays(28)));
  const plan = account.renewalPlan;
  // With a fixed monthly price (renewalPlan) the shipment can be recorded in the same tap; the
  // operator can still untick this to type it by hand.
  const [autoShipment, setAutoShipment] = useState(plan !== undefined);
  // Renewing is paying Starlink, so a new month is recorded as paid (✓) unless switched to D.
  // A new month while the old D is still unpaid is most likely a D too.
  const [costPending, setCostPending] = useState(hasOpenD);
  const blocked = (hasOpenD && dChoice === null) || (needsSure && !sureStillDue);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    if (settlesDebt) {
      onConfirm(toStoredDate(date), false, false, fromCard, true);
      return;
    }
    onConfirm(toStoredDate(date), autoShipment && plan !== undefined, costPending, autoShipment && plan !== undefined && !costPending ? fromCard : null, false);
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

          {hasOpenD && (
            <div className="renewal-settle form-wide">
              <strong>
                على الجهاز D لم يُدفع لستارلينك: <bdi dir="ltr">{formatAmount(openDebtUsd)} $</bdi>
                {openDebtCount > 1 ? ` (${openDebtCount} شحنات)` : ""}
              </strong>
              <span>ما هذا التجديد؟</span>
              <div className="renewal-cost-status" role="radiogroup" aria-label="ما هذا التجديد">
                <button
                  type="button"
                  role="radio"
                  aria-checked={dChoice === "paid"}
                  className={`renewal-cost-option${dChoice === "paid" ? " renewal-cost-option-active" : ""}`}
                  onClick={() => setDChoice("paid")}
                >
                  ✓ دفعت D لستارلينك الآن
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={dChoice === "new"}
                  className={`renewal-cost-option renewal-cost-option-d${dChoice === "new" ? " renewal-cost-option-active" : ""}`}
                  onClick={() => setDChoice("new")}
                >
                  📅 شهر جديد على الزبون
                </button>
              </div>
              {dChoice === "paid" && <span>يُسجَّل أن D مدفوع اليوم: ينزل ربحه وحصة المندوب اليوم، ولا تُسجَّل شحنة جديدة على الزبون.</span>}
              {dChoice === "new" && <span>يبقى D القديم كما هو حتى تدفعه، ويُسجَّل الشهر الجديد على الزبون.</span>}
              {needsSure && (
                <label className="ledger-d-toggle renewal-still-due">
                  <input type="checkbox" checked={sureStillDue} onChange={(e) => setSureStillDue(e.target.checked)} />
                  <span>
                    ⚠️ آخر قراءة من ستارلينك ما زالت تطلب <bdi dir="ltr">{starlinkDue}</bdi> - نعم دفعت (القراءة قديمة)
                  </span>
                </label>
              )}
            </div>
          )}

          {!settlesDebt && (!hasOpenD || dChoice === "new") && plan && (
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

          {!settlesDebt && (!hasOpenD || dChoice === "new") && plan && autoShipment && (
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
            {hasOpenD && dChoice === null
              ? "اختر أولاً: دفعت D، أو شهر جديد."
              : settlesDebt
              ? "بعد التأكيد يُسجَّل أن ستارلينك مدفوع لهذا الجهاز ويُحدَّث موعد الانتهاء."
              : autoShipment && plan
              ? costPending
                ? "ستُسجَّل الشحنة بعلامة D (تكلفة Starlink غير مدفوعة) ويظهر ربحها متوقعًا حتى تسدّدها."
                : "ستُسجَّل الشحنة بأسعار الصرف الحالية وتظهر في كشف الجهاز والزبون مباشرة."
              : "بعد التأكيد سيُفتح سجل حركة الحساب لتسجيل الشحنة/الدفعة المرتبطة بهذا التجديد."}
          </p>

          <div className="dialog-actions form-wide">
            <button className="dialog-secondary" type="button" onClick={onClose}>إلغاء</button>
            <button className="dialog-primary" type="submit" disabled={blocked}>تأكيد التجديد</button>
          </div>
        </form>
      </section>
    </div>
  );
}
