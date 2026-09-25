"use client";

import { formatProfitMru, sumProfitMru } from "@/lib/profitMru";
import { useMruRate } from "@/lib/useMruRate";
import { CSSProperties, FormEvent, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";
import { Client } from "@/lib/clientStore";
import { combinePhoneNumber, PHONE_COUNTRY_CODES, splitPhoneNumber } from "@/lib/phoneCountryCodes";
import { computeClientAccountingSummary } from "@/lib/accountingStore";
import { BalanceByCurrency, getAccountEntries, LEDGER_CURRENCIES, LedgerByAccount, LEDGER_CURRENCY_LABELS } from "@/lib/ledgerStore";
import { formatAmount } from "@/lib/formatAmount";
import { partyHue, partyInitials } from "@/lib/partyColor";
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

  const mruRate = useMruRate();
  // Profit is shown in أوقية at each shipment's locked rate (profitMru.ts).
  const clientProfitMru = mruRate
    ? devices.reduce((sum, a) => sum + sumProfitMru(getAccountEntries(ledgerStore, a.id), mruRate).confirmedMru, 0)
    : undefined;
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

  // Devices in credit (negative balance) are shown as their own "له رصيد" figure, never netted
  // against another device's debt - same no-mixing rule as totalDebt itself.
  const creditByCurrency: BalanceByCurrency = {};
  for (const device of summary.devices) {
    for (const c of LEDGER_CURRENCIES) {
      const b = device.balances[c];
      if (b !== undefined && b < -0.0001) creditByCurrency[c] = (creditByCurrency[c] ?? 0) - b;
    }
  }
  const currencies = LEDGER_CURRENCIES.filter(
    (c) =>
      summary.totalDebt[c] !== undefined ||
      summary.totalPaid[c] !== undefined ||
      creditByCurrency[c] !== undefined ||
      unallocatedByCurrency[c] !== undefined,
  );
  const hasDue = LEDGER_CURRENCIES.some((c) => (summary.totalDebt[c] ?? 0) > 0.0001);
  const hasCredit = !hasDue && LEDGER_CURRENCIES.some((c) => (creditByCurrency[c] ?? 0) > 0.0001);
  const status = hasDue
    ? { className: "party-status-due", label: "عليه دين" }
    : hasCredit
      ? { className: "party-status-credit", label: "له رصيد" }
      : { className: "party-status-clear", label: "مسدَّد ✓" };

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
            <div
              className="party-card party-card-client party-hero"
              style={{ "--party-hue": partyHue(client.id) } as CSSProperties}
            >
              <div className="party-card-head">
                <span className="party-avatar" aria-hidden="true">{partyInitials(client.name)}</span>
                <div className="party-card-title">
                  <strong>{client.name}</strong>
                  <span dir="ltr">{client.phone || "بدون هاتف"}</span>
                </div>
                <span className={`party-status ${status.className}`}>{status.label}</span>
              </div>

              {currencies.length === 0 ? (
                <p className="party-empty">لا توجد حركات بعد</p>
              ) : (
                currencies.map((c) => (
                  <div key={c} className="party-stats">
                    <span className="party-stats-currency">{LEDGER_CURRENCY_LABELS[c]}</span>
                    <div className="party-stat party-stat-paid">
                      <span>المدفوع</span>
                      <strong dir="ltr">{formatAmount(summary.totalPaid[c] ?? 0)}</strong>
                    </div>
                    <div className={`party-stat ${(summary.totalDebt[c] ?? 0) > 0.0001 ? "party-stat-due" : "party-stat-clear"}`}>
                      <span>المتبقي عليه</span>
                      <strong dir="ltr">{formatAmount(summary.totalDebt[c] ?? 0)}</strong>
                    </div>
                    {(creditByCurrency[c] ?? 0) > 0.0001 && (
                      <div className="party-stat party-stat-returned">
                        <span>له رصيد</span>
                        <strong dir="ltr">{formatAmount(creditByCurrency[c] ?? 0)}</strong>
                      </div>
                    )}
                    {(unallocatedByCurrency[c] ?? 0) > 0.0001 && (
                      <div className="party-stat">
                        <span>غير مخصص</span>
                        <strong dir="ltr">{formatAmount(unallocatedByCurrency[c] ?? 0)}</strong>
                      </div>
                    )}
                  </div>
                ))
              )}

              <div className="party-chips">
                <span className="party-chip">📡 {devices.length} جهاز</span>
              </div>
            </div>

            <div className="party-insights">
              <div className="party-insight">
                <span>نتيجة جميع الأجهزة</span>
                {summary.netResult.status === "no-data" || summary.netResult.netUsd === undefined ? (
                  <strong>لا توجد بيانات كافية</strong>
                ) : (
                  <strong className={summary.netResult.netUsd >= 0 ? "profit-positive" : "profit-negative"}>
                    {summary.netResult.netUsd >= 0 ? "ربح" : "خسارة"} {formatProfitMru(summary.netResult.netUsd, mruRate, clientProfitMru)}
                  </strong>
                )}
                {summary.netResult.status === "incomplete" && (
                  <span className="badge badge-yellow">غير مكتمل - أحد الأجهزة لديه عمليات D غير مسددة</span>
                )}
              </div>
              <div className="party-insight">
                <span>المحصَّل فعليًا (بالدولار)</span>
                <strong dir="ltr">{formatAmount(summary.totalPaidUsd)} USD</strong>
                <span className={summary.cashFlowUsd >= 0 ? "profit-positive" : "profit-negative"} dir="ltr">
                  التدفق النقدي: {summary.cashFlowUsd >= 0 ? "+" : "-"}
                  {formatAmount(Math.abs(summary.cashFlowUsd))} USD
                </span>
                {summary.hasIncompletePaymentRates && (
                  <span className="badge badge-yellow">غير مكتمل - دفعات قديمة بلا سعر صرف</span>
                )}
              </div>
            </div>

            <div className="party-panel">
              <p className="party-panel-note">📡 الأجهزة المرتبطة بهذا الزبون</p>
              {summary.devices.length === 0 ? (
                <p className="party-empty">لا توجد أجهزة مرتبطة بعد</p>
              ) : (
                <ul className="party-devices">
                  {summary.devices.map((device) => {
                    const balanceRows = LEDGER_CURRENCIES.map((c) => ({ c, balance: device.balances[c] })).filter(
                      (row) => row.balance !== undefined && Math.abs(row.balance) > 0.0001,
                    );
                    const account = devices.find((a) => a.id === device.accountId);
                    const net = device.accounting.netResult;

                    return (
                      <li key={device.accountId} className="party-device">
                        <div className="party-device-top">
                          <strong>{device.accountName}</strong>
                          {account && (
                            <button className="text-action" type="button" onClick={() => setStatementAccount(account)}>
                              📄 كشف الحساب
                            </button>
                          )}
                        </div>
                        {account?.rechargeDate && (
                          <span className="party-device-date" dir="ltr">📅 {account.rechargeDate}</span>
                        )}
                        <div className="party-device-balances">
                          {balanceRows.length === 0 ? (
                            <span className="badge badge-green">لا يوجد مستحق</span>
                          ) : (
                            balanceRows.map(({ c, balance }) =>
                              balance! > 0 ? (
                                <span key={c} className="badge badge-red" dir="ltr">عليه {formatAmount(balance!)} {LEDGER_CURRENCY_LABELS[c]}</span>
                              ) : (
                                <span key={c} className="badge badge-green" dir="ltr">له {formatAmount(-balance!)} {LEDGER_CURRENCY_LABELS[c]}</span>
                              ),
                            )
                          )}
                          <span
                            className={`badge ${net.netUsd === undefined ? "badge-gray" : net.netUsd >= 0 ? "badge-green" : "badge-red"}`}
                            dir="ltr"
                          >
                            {net.netUsd !== undefined
                              ? `${net.netUsd >= 0 ? "ربح" : "خسارة"} ${formatProfitMru(
                                  net.netUsd,
                                  mruRate,
                                  mruRate ? sumProfitMru(getAccountEntries(ledgerStore, device.accountId), mruRate).confirmedMru : undefined,
                                )}`
                              : "الربح غير محسوب"}
                            {net.status === "incomplete" && " (غير مكتمل)"}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

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
