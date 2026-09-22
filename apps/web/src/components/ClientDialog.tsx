"use client";

import { FormEvent, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";
import { Client } from "@/lib/clientStore";
import { computeClientAccountingSummary } from "@/lib/accountingStore";
import { getAccountEntries, LEDGER_CURRENCIES, LedgerByAccount, LedgerCurrency, LEDGER_CURRENCY_LABELS } from "@/lib/ledgerStore";
import { formatAmount } from "@/lib/formatAmount";
import { AllocationsByAccount, getAccountAllocations } from "@/lib/paymentAllocationStore";
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
}

/**
 * "صفحة الزبون" (rule XII), opened by tapping a client's name on any of their device cards -
 * client info/rename, every linked device with its own balance and net result (never mixed
 * together), and the aggregate totals across all of them. Each device's own full statement is one
 * tap away via the same DeviceStatementDialog used from the card itself.
 */
export function ClientDialog({ client, devices, ledgerStore, allocationStore, onClose, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(client.phone ?? "");
  const [statementAccount, setStatementAccount] = useState<StarlinkAccountSummary | null>(null);

  const summary = computeClientAccountingSummary(
    devices.map((account) => ({ accountId: account.id, accountName: account.name, entries: getAccountEntries(ledgerStore, account.id) })),
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), phone: phone.trim() || undefined });
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
    setName(client.name);
    setPhone(client.phone ?? "");
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
            <label className="form-field form-wide">
              <span>رقم الهاتف</span>
              <input dir="ltr" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
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
              <button className="dialog-secondary" type="button" onClick={() => setEditing(true)}>تعديل اسم الزبون</button>
              <button className="dialog-primary dialog-done" type="button" onClick={onClose}>تم</button>
            </div>
          </>
        )}
      </section>

      {statementAccount && (
        <DeviceStatementDialog
          accountName={statementAccount.name}
          entries={getAccountEntries(ledgerStore, statementAccount.id)}
          allocations={getAccountAllocations(allocationStore, statementAccount.id)}
          onClose={() => setStatementAccount(null)}
        />
      )}
    </div>
  );
}
