"use client";

import { FormEvent, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";
import { Client } from "@/lib/clientStore";
import { combinePhoneNumber, PHONE_COUNTRY_CODES, splitPhoneNumber } from "@/lib/phoneCountryCodes";
import { computeClientAccountingSummary } from "@/lib/accountingStore";
import { BalanceByCurrency, getAccountEntries, LEDGER_CURRENCIES, LedgerByAccount, LedgerCurrency, LEDGER_CURRENCY_LABELS } from "@/lib/ledgerStore";
import { formatAmount } from "@/lib/formatAmount";
import { allocatedFromPayment, allStoredAllocations, AllocationsByAccount } from "@/lib/paymentAllocationStore";
import { DeviceStatementDialog } from "./DeviceStatementDialog";

interface Props {
  client: Client;
  /** This client's own linked devices/accounts - already filtered by the caller (account.clientId
   * === client.id), never re-derived here. */
  devices: StarlinkAccountSummary[];
  ledgerStore: LedgerByAccount;
  allocationStore: AllocationsByAccount;
  onClose: () => void;
  onSave: (patch: { name: string; phone?: string }) => void;
  /** Absent (never rendered) when the caller doesn't offer deletion here - never assume every
   * caller wants it. */
  onDelete?: () => void;
}

/**
 * "صفحة الزبون" (rule XII), opened by tapping a client's name on any of their device cards -
 * client info/rename, every linked device with its own balance and net result (never mixed
 * together), and the aggregate totals across all of them. Each device's own full statement is one
 * tap away via the same DeviceStatementDialog used from the card itself.
 */
export function ClientDialog({ client, devices, ledgerStore, allocationStore, onClose, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(client.name);
  const [statementAccount, setStatementAccount] = useState<StarlinkAccountSummary | null>(null);

  // Tracked as its OWN state, never re-derived from a combined phone string on every render - real,
  // confirmed bug this fixes: combinePhoneNumber intentionally returns "" while the local number is
  // still empty (never persists a bare country code with no digits), which - if the dial code were
  // instead derived fresh from a single phone string each time - silently forgot the operator's
  // just-picked country the moment they picked it BEFORE typing any digits (a completely natural
  // order).
  const [phoneDialCode, setPhoneDialCode] = useState(() => splitPhoneNumber(client.phone).dialCode);
  const [phoneLocalNumber, setPhoneLocalNumber] = useState(() => splitPhoneNumber(client.phone).localNumber);

  const summary = computeClientAccountingSummary(
    devices.map((account) => ({ accountId: account.id, accountName: account.name, entries: getAccountEntries(ledgerStore, account.id) })),
  );

  const allAllocations = allStoredAllocations(allocationStore);
  const allLedgerEntries = Object.values(ledgerStore).flat();

  // Rule 12's "رصيد غير مخصص للزبون" at the client level - the sum, per currency, of every
  // linked device's own payments that still have an unallocated remainder (see
  // paymentAllocationStore.ts's allocatedFromPayment). Never converted/summed across currencies.
  const unallocatedByCurrency: BalanceByCurrency = {};
  for (const account of devices) {
    for (const entry of getAccountEntries(ledgerStore, account.id)) {
      if (entry.kind !== "credit") continue;
      const unallocated = entry.amount - allocatedFromPayment(allAllocations, entry.id);
      if (unallocated > 0.0001) {
        unallocatedByCurrency[entry.currency] = (unallocatedByCurrency[entry.currency] ?? 0) + unallocated;
      }
    }
  }
  const unallocatedRows = Object.entries(unallocatedByCurrency) as [LedgerCurrency, number][];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), phone: combinePhoneNumber(phoneDialCode, phoneLocalNumber) || undefined });
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
    setName(client.name);
    setPhoneDialCode(splitPhoneNumber(client.phone).dialCode);
    setPhoneLocalNumber(splitPhoneNumber(client.phone).localNumber);
  }

  function confirmDelete() {
    if (!onDelete) return;
    const suffix = devices.length > 0
      ? ` سيتم فك ارتباط ${devices.length} جهاز عن هذا الزبون، دون حذف أي بيانات عن هذه الأجهزة.`
      : "";
    if (window.confirm(`هل أنت متأكد من حذف الزبون "${client.name}"؟${suffix}`)) {
      onDelete();
    }
  }

  const totalDebtRows = Object.entries(summary.totalDebt) as [LedgerCurrency, number][];
  const totalPaidRows = Object.entries(summary.totalPaid) as [LedgerCurrency, number][];

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog client-dialog" role="dialog" aria-modal="true" aria-labelledby="client-dialog-title">
        <header className="dialog-header">
          <div>
            <h2 id="client-dialog-title">بطاقة الزبون</h2>
            <p>{devices.length} جهاز مرتبط بهذا الزبون</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="إغلاق">×</button>
        </header>

        {editing ? (
          <form className="account-form" onSubmit={submit}>
            <label className="form-field form-wide">
              <span>اسم الزبون *</span>
              <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="form-field form-wide">
              <span>رقم الهاتف</span>
              <div className="phone-input-row">
                <select
                  className="phone-country-select"
                  dir="ltr"
                  value={phoneDialCode}
                  onChange={(e) => setPhoneDialCode(e.target.value)}
                  aria-label="رمز الدولة"
                >
                  {PHONE_COUNTRY_CODES.map((c) => (
                    <option key={c.dialCode} value={c.dialCode}>{c.country} {c.dialCode}</option>
                  ))}
                </select>
                <input
                  className="phone-local-input"
                  dir="ltr"
                  type="tel"
                  value={phoneLocalNumber}
                  onChange={(e) => setPhoneLocalNumber(e.target.value)}
                  placeholder="رقم الهاتف بدون رمز الدولة"
                />
              </div>
            </div>
            <div className="dialog-actions form-wide">
              <button className="dialog-secondary" type="button" onClick={cancelEdit}>إلغاء</button>
              <button className="dialog-primary" type="submit">حفظ</button>
            </div>
          </form>
        ) : (
          <>
            <div className="account-info-grid">
              <div><span>اسم الزبون</span><strong>{client.name}</strong></div>
              <div><span>رقم الهاتف</span><strong dir="ltr">{client.phone || "—"}</strong></div>
              <div><span>عدد الأجهزة</span><strong>{devices.length}</strong></div>
            </div>

            <div className="statement-summary-grid">
              {totalDebtRows.length === 0 && totalPaidRows.length === 0 ? (
                <div className="statement-summary-item"><span>مجموع الديون</span><strong>لا يوجد مستحق</strong></div>
              ) : (
                <>
                  {totalDebtRows.map(([c, v]) => (
                    <div className="statement-summary-item" key={`debt-${c}`}>
                      <span>مجموع ديون الزبون ({LEDGER_CURRENCY_LABELS[c]})</span>
                      <strong dir="ltr">{formatAmount(v)}</strong>
                    </div>
                  ))}
                  {totalPaidRows.map(([c, v]) => (
                    <div className="statement-summary-item" key={`paid-${c}`}>
                      <span>مجموع دفعات الزبون ({LEDGER_CURRENCY_LABELS[c]})</span>
                      <strong dir="ltr">{formatAmount(v)}</strong>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="statement-net-result">
              {summary.netResult.status === "no-data" ? (
                <span className="badge badge-gray">لا توجد بيانات كافية</span>
              ) : (
                <>
                  <span
                    className={`statement-net-value ${summary.netResult.netUsd === undefined ? "" : summary.netResult.netUsd >= 0 ? "profit-positive" : "profit-negative"}`}
                    dir="ltr"
                  >
                    إجمالي نتيجة جميع الأجهزة:{" "}
                    {summary.netResult.netUsd !== undefined
                      ? `${summary.netResult.netUsd >= 0 ? "ربح" : "خسارة"} ${formatAmount(Math.abs(summary.netResult.netUsd))} USD`
                      : "—"}
                  </span>
                  {summary.netResult.status === "incomplete" && (
                    <span className="badge badge-yellow">غير مكتمل - أحد الأجهزة لديه عمليات D غير مسددة</span>
                  )}
                </>
              )}
            </div>

            <div className="statement-cash-flow">
              <span>المحصَّل فعليًا من الزبون (بالدولار)</span>
              <strong dir="ltr">{formatAmount(summary.totalPaidUsd)} USD</strong>
              <span
                className={`statement-cash-flow-value ${summary.cashFlowUsd >= 0 ? "profit-positive" : "profit-negative"}`}
                dir="ltr"
              >
                التدفق النقدي الفعلي: {summary.cashFlowUsd >= 0 ? "+" : "-"}
                {formatAmount(Math.abs(summary.cashFlowUsd))} USD
              </span>
              {summary.hasIncompletePaymentRates && (
                <span className="badge badge-yellow">النتيجة النقدية غير مكتملة بسبب وجود دفعات قديمة بلا سعر صرف</span>
              )}
            </div>

            {unallocatedRows.length > 0 && (
              <div className="statement-summary-grid">
                {unallocatedRows.map(([c, v]) => (
                  <div className="statement-summary-item" key={`unallocated-${c}`}>
                    <span>رصيد غير مخصص للزبون ({LEDGER_CURRENCY_LABELS[c]})</span>
                    <strong dir="ltr">{formatAmount(v)}</strong>
                  </div>
                ))}
              </div>
            )}

            <ul className="statement-shipment-list">
              {summary.devices.length === 0 && <li className="ledger-entry-empty">لا توجد أجهزة مرتبطة بعد</li>}
              {summary.devices.map((device) => {
                const balanceRows = LEDGER_CURRENCIES.map((c) => ({ c, balance: device.balances[c] })).filter(
                  (row) => row.balance !== undefined,
                );
                const account = devices.find((a) => a.id === device.accountId);
                const net = device.accounting.netResult;

                return (
                  <li key={device.accountId} className="statement-shipment-row">
                    <div className="statement-shipment-top">
                      <span>{device.accountName}</span>
                      {account && (
                        <button className="text-action" type="button" onClick={() => setStatementAccount(account)}>
                          كشف الحساب
                        </button>
                      )}
                    </div>
                    <div className="statement-shipment-badges">
                      {balanceRows.length === 0 ? (
                        <span className="badge badge-green">لا يوجد مستحق</span>
                      ) : (
                        balanceRows.map(({ c, balance }) =>
                          balance! > 0 ? (
                            <span key={c} className="badge badge-red">عليه {formatAmount(balance!)} {LEDGER_CURRENCY_LABELS[c]}</span>
                          ) : (
                            <span key={c} className="badge badge-green">له {formatAmount(-balance!)} {LEDGER_CURRENCY_LABELS[c]}</span>
                          ),
                        )
                      )}
                    </div>
                    <div dir="ltr" className={net.netUsd === undefined ? "" : net.netUsd >= 0 ? "profit-positive" : "profit-negative"}>
                      {net.netUsd !== undefined
                        ? `${net.netUsd >= 0 ? "ربح" : "خسارة"} ${formatAmount(Math.abs(net.netUsd))} USD`
                        : "الربح غير محسوب"}
                      {net.status === "incomplete" && " (غير مكتمل)"}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="dialog-actions form-wide">
              {onDelete && <button className="dialog-danger" type="button" onClick={confirmDelete}>حذف الزبون</button>}
              <button className="dialog-secondary" type="button" onClick={() => setEditing(true)}>تعديل بيانات الزبون</button>
              <button className="dialog-primary dialog-done" type="button" onClick={onClose}>تم</button>
            </div>
          </>
        )}
      </section>

      {statementAccount && (
        <DeviceStatementDialog
          accountName={statementAccount.name}
          entries={getAccountEntries(ledgerStore, statementAccount.id)}
          allocations={allAllocations}
          allEntries={allLedgerEntries}
          onClose={() => setStatementAccount(null)}
        />
      )}
    </div>
  );
}
