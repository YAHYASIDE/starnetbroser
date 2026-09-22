"use client";

import { FormEvent, useState } from "react";
import {
  computeBalanceByCurrency,
  createLedgerEntry,
  isLegacyShipmentEntry,
  LEDGER_CURRENCIES,
  LEDGER_CURRENCY_LABELS,
  LedgerCurrency,
  LedgerEntry,
  LedgerEntryKind,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PaymentMethod,
  removeEntry,
  sortEntriesNewestFirst,
  updateEntry,
} from "@/lib/ledgerStore";
import { computeShipmentProfit } from "@/lib/accountingStore";
import { Currency, CurrencyStore, getCurrency, toUsd, UpsertCurrencyInput } from "@/lib/currencyStore";
import { formatAmount } from "@/lib/formatAmount";
import {
  addAllocations,
  computeShipmentPaymentStatus,
  createAllocation,
  paidTowardShipment,
  PaymentAllocation,
  planFifoAllocation,
  removeAllocationsForEntry,
} from "@/lib/paymentAllocationStore";
import { StarlinkSettlementDialog } from "./StarlinkSettlementDialog";
import { PaymentAllocationDialog } from "./PaymentAllocationDialog";
import { LegacyEntryCompletionDialog } from "./LegacyEntryCompletionDialog";

interface Props {
  accountName: string;
  entries: LedgerEntry[];
  currencyStore: CurrencyStore;
  onUpsertCurrency: (input: UpsertCurrencyInput) => Currency;
  allocations: PaymentAllocation[];
  onChangeAllocations: (allocations: PaymentAllocation[]) => void;
  onClose: () => void;
  onChange: (entries: LedgerEntry[]) => void;
}

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(amount: number, currency: LedgerCurrency): string {
  return `${formatAmount(amount)} ${LEDGER_CURRENCY_LABELS[currency]}`;
}

export function LedgerDialog({
  accountName,
  entries,
  currencyStore,
  onUpsertCurrency,
  allocations,
  onChangeAllocations,
  onClose,
  onChange,
}: Props) {
  const [kind, setKind] = useState<LedgerEntryKind>("debit");
  const [currency, setCurrency] = useState<LedgerCurrency>("USD");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("nita");
  const [date, setDate] = useState(todayDateInputValue());
  const [formError, setFormError] = useState<string | null>(null);

  // Only relevant while kind === "debit" - a shipment charge, never a plain payment. Starts empty
  // (not e.g. "1") whenever the currency's rate isn't already known, so a forgotten rate blocks
  // submission instead of silently defaulting to a wrong one.
  const [markD, setMarkD] = useState(false);
  const [saleRateInput, setSaleRateInput] = useState("");

  const [settlingEntry, setSettlingEntry] = useState<LedgerEntry | null>(null);
  const [pendingPayment, setPendingPayment] = useState<LedgerEntry | null>(null);
  const [completingEntry, setCompletingEntry] = useState<LedgerEntry | null>(null);

  const balances = computeBalanceByCurrency(entries);
  const sorted = sortEntriesNewestFirst(entries);
  const balanceRows = LEDGER_CURRENCIES.map((c) => ({ currency: c, balance: balances[c] })).filter(
    (row) => row.balance !== undefined,
  );

  // Extra informational total (rule 4's "الإجمالي بالدولار") using currencyStore's CURRENT rates -
  // never shown when any currency present has no known rate, so it's never silently partial. This
  // never replaces the per-currency rows above, which stay the authoritative balance display.
  const usdTotal = balanceRows.reduce((sum, { currency: c, balance }) => {
    const rate = c === "USD" ? 1 : getCurrency(currencyStore, c)?.rateFromUsd;
    return rate === undefined ? sum : sum + toUsd(balance!, rate);
  }, 0);
  const usdTotalKnown = balanceRows.every(({ currency: c }) => c === "USD" || getCurrency(currencyStore, c)?.rateFromUsd !== undefined);

  function selectCurrency(next: LedgerCurrency) {
    setCurrency(next);
    // Empty (not a guessed default like 1) whenever this currency's rate isn't already known -
    // forces an explicit entry instead of silently locking in a wrong rate.
    const known = getCurrency(currencyStore, next)?.rateFromUsd;
    setSaleRateInput(known !== undefined ? String(known) : "");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError("أدخل مبلغًا صحيحًا أكبر من صفر");
      return;
    }

    const needsSaleRate = kind === "debit" && currency !== "USD";
    const parsedRate = Number(saleRateInput);
    if (needsSaleRate && (!Number.isFinite(parsedRate) || parsedRate <= 0)) {
      setFormError("أدخل سعر صرف صحيح أكبر من صفر لهذه العملة");
      return;
    }
    setFormError(null);

    if (needsSaleRate) {
      // Keeps the registry's "last used" rate for this currency current (rule VI) - the entry's
      // own saleRate below is a separate, permanently locked snapshot, never re-derived from this.
      const existing = getCurrency(currencyStore, currency);
      onUpsertCurrency({
        code: currency,
        name: existing?.name ?? LEDGER_CURRENCY_LABELS[currency],
        symbol: existing?.symbol ?? currency,
        rateFromUsd: parsedRate,
      });
    }

    const entry = createLedgerEntry({
      kind,
      amount: parsedAmount,
      currency,
      note,
      email,
      paymentMethod: kind === "credit" ? paymentMethod : undefined,
      date,
      saleRate: needsSaleRate ? { rateFromUsd: parsedRate, usdValue: parsedAmount / parsedRate } : undefined,
      markStarlinkCostPending: kind === "debit" && markD,
    });

    setAmount("");
    setNote("");
    setEmail("");
    setMarkD(false);

    if (kind === "credit") {
      // A payment is never added directly - it first goes through the allocation dialog below
      // (rule 3: "يعرض النظام الشحنة التي ستُخصص لها الدفعة قبل الحفظ"), which is what actually
      // adds it (along with whatever allocation records the operator confirms).
      setPendingPayment(entry);
      return;
    }

    onChange([...entries, entry]);
  }

  function deleteEntry(entryId: string) {
    if (!window.confirm("هل تريد حذف هذه الحركة؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    onChange(removeEntry(entries, entryId));
    onChangeAllocations(removeAllocationsForEntry(allocations, entryId));
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog ledger-dialog" role="dialog" aria-modal="true" aria-labelledby="ledger-dialog-title">
        <header className="dialog-header">
          <div>
            <h2 id="ledger-dialog-title">حساب الزبون - {accountName}</h2>
            <p>سجل محلي لما يدين به الزبون لك أو له من رصيد - منفصل عن الرصيد المستحق لـ Starlink</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="إغلاق">×</button>
        </header>

        <div className="ledger-balance-rows">
          {balanceRows.length === 0 ? (
            <div className="ledger-balance-row">
              <span>الرصيد الحالي</span>
              <span className="badge badge-green">لا يوجد مستحق</span>
            </div>
          ) : (
            balanceRows.map(({ currency: c, balance }) => (
              <div className="ledger-balance-row" key={c}>
                <span>الرصيد ({LEDGER_CURRENCY_LABELS[c]})</span>
                {balance! > 0 ? (
                  <span className="badge badge-red">عليه {formatMoney(balance!, c)}</span>
                ) : (
                  <span className="badge badge-green">له {formatMoney(-balance!, c)}</span>
                )}
              </div>
            ))
          )}
          {balanceRows.length > 1 && usdTotalKnown && (
            <div className="ledger-balance-row ledger-balance-usd-total">
              <span>الإجمالي بالدولار</span>
              <span dir="ltr">{usdTotal >= 0 ? `عليه ${formatAmount(usdTotal)} USD` : `له ${formatAmount(-usdTotal)} USD`}</span>
            </div>
          )}
        </div>

        <form className="ledger-entry-form" onSubmit={submit}>
          <select className="search-input" value={kind} onChange={(e) => setKind(e.target.value as LedgerEntryKind)}>
            <option value="debit">عليه</option>
            <option value="credit">له</option>
          </select>
          <select className="search-input" value={currency} onChange={(e) => selectCurrency(e.target.value as LedgerCurrency)}>
            {LEDGER_CURRENCIES.map((c) => (
              <option key={c} value={c}>{LEDGER_CURRENCY_LABELS[c]}</option>
            ))}
          </select>
          <input
            className="search-input"
            type="number"
            min="0"
            step="0.01"
            dir="ltr"
            placeholder="المبلغ"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            className="search-input"
            type="date"
            dir="ltr"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {kind === "debit" && currency !== "USD" && (
            <input
              className="search-input"
              type="number"
              min="0"
              step="0.0001"
              dir="ltr"
              placeholder={`سعر الصرف (1 USD = ؟ ${currency})`}
              value={saleRateInput}
              onChange={(e) => setSaleRateInput(e.target.value)}
            />
          )}
          {kind === "debit" && (
            <label className="ledger-d-toggle">
              <input type="checkbox" checked={markD} onChange={(e) => setMarkD(e.target.checked)} />
              D - تكلفة Starlink غير مسددة بعد
            </label>
          )}
          {kind === "credit" && (
            <select
              className="search-input ledger-payment-method-input"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
              ))}
            </select>
          )}
          <input
            className="search-input ledger-note-input"
            type="text"
            placeholder="ملاحظة (اختياري)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <input
            className="search-input ledger-email-input"
            type="email"
            dir="ltr"
            placeholder="البريد الإلكتروني (اختياري)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {formError && <div className="account-card-alert ledger-form-error">{formError}</div>}
          <button className="dialog-primary" type="submit">إضافة حركة</button>
        </form>

        <ul className="ledger-entry-list">
          {sorted.length === 0 && <li className="ledger-entry-empty">لا توجد حركات بعد</li>}
          {sorted.map((entry) => (
            <li key={entry.id} className="ledger-entry-row">
              <div className="ledger-entry-row-top">
                <span className={`badge ${entry.kind === "debit" ? "badge-red" : "badge-green"}`}>
                  {entry.kind === "debit" ? "عليه" : "له"}
                </span>
                <span className="ledger-entry-amount" dir="ltr">{formatMoney(entry.amount, entry.currency)}</span>
                <span className="ledger-entry-date" dir="ltr">{entry.date}</span>
                <button
                  className="ledger-entry-delete"
                  type="button"
                  onClick={() => deleteEntry(entry.id)}
                  aria-label="حذف الحركة"
                  title="حذف الحركة"
                >
                  ×
                </button>
              </div>
              {(entry.note || entry.email || entry.paymentMethod) && (
                <div className="ledger-entry-row-bottom">
                  {entry.paymentMethod && <span className="ledger-entry-method">{PAYMENT_METHOD_LABELS[entry.paymentMethod]}</span>}
                  {entry.note && <span className="ledger-entry-note">{entry.note}</span>}
                  {entry.email && <span className="ledger-entry-email" dir="ltr">{entry.email}</span>}
                </div>
              )}
              {entry.kind === "debit" && (
                <ShipmentStatusRow
                  entry={entry}
                  allocations={allocations}
                  onSettle={() => setSettlingEntry(entry)}
                  onCompleteLegacy={() => setCompletingEntry(entry)}
                />
              )}
            </li>
          ))}
        </ul>

        <div className="dialog-actions form-wide">
          <button className="dialog-primary dialog-done" type="button" onClick={onClose}>تم</button>
        </div>
      </section>

      {settlingEntry && (
        <StarlinkSettlementDialog
          entry={settlingEntry}
          currencyStore={currencyStore}
          onUpsertCurrency={onUpsertCurrency}
          onClose={() => setSettlingEntry(null)}
          onSettle={(cost) => {
            onChange(updateEntry(entries, settlingEntry.id, { starlinkCost: cost }));
            setSettlingEntry(null);
          }}
        />
      )}

      {pendingPayment && (() => {
        const { plan } = planFifoAllocation(entries, allocations, pendingPayment.amount, pendingPayment.currency);
        const shipmentRows = entries
          .filter((e) => e.kind === "debit" && e.currency === pendingPayment.currency)
          .map((e) => ({ entry: e, remaining: e.amount - paidTowardShipment(allocations, e.id) }))
          .filter((row) => row.remaining > 0)
          .sort((a, b) => (a.entry.date !== b.entry.date ? (a.entry.date < b.entry.date ? -1 : 1) : (a.entry.createdAt < b.entry.createdAt ? -1 : 1)));

        return (
          <PaymentAllocationDialog
            amount={pendingPayment.amount}
            currency={pendingPayment.currency}
            shipments={shipmentRows}
            initialPlan={plan}
            onCancel={() => setPendingPayment(null)}
            onConfirm={(finalPlan) => {
              const newAllocations = finalPlan.map((item) =>
                createAllocation(pendingPayment.id, item.shipmentEntryId, item.amount, pendingPayment.currency),
              );
              onChange([...entries, pendingPayment]);
              onChangeAllocations(addAllocations(allocations, newAllocations));
              setPendingPayment(null);
            }}
          />
        );
      })()}

      {completingEntry && (
        <LegacyEntryCompletionDialog
          entry={completingEntry}
          currencyStore={currencyStore}
          onUpsertCurrency={onUpsertCurrency}
          onClose={() => setCompletingEntry(null)}
          onComplete={(patch) => {
            onChange(updateEntry(entries, completingEntry.id, patch));
            setCompletingEntry(null);
          }}
        />
      )}
    </div>
  );
}

/** The shipment/payment-status/D/profit line under one debit entry - never rendered for a
 * "credit" entry, which isn't a shipment and has nothing here to show. */
function ShipmentStatusRow({
  entry,
  allocations,
  onSettle,
  onCompleteLegacy,
}: {
  entry: LedgerEntry;
  allocations: PaymentAllocation[];
  onSettle: () => void;
  onCompleteLegacy: () => void;
}) {
  const paymentStatus = computeShipmentPaymentStatus(entry, allocations);
  const paymentBadge = (
    <span className={`badge ${paymentStatus === "paid" ? "badge-green" : paymentStatus === "partial" ? "badge-yellow" : "badge-red"}`}>
      {paymentStatus === "paid" ? "مدفوعة بالكامل" : paymentStatus === "partial" ? "مدفوعة جزئيًا" : "غير مدفوعة"}
    </span>
  );

  if (isLegacyShipmentEntry(entry)) {
    return (
      <div className="ledger-shipment-row">
        {paymentBadge}
        <span className="badge badge-gray">عملية قديمة - بيانات الربح غير مكتملة</span>
        <button type="button" className="text-action" onClick={onCompleteLegacy}>
          استكمال البيانات
        </button>
      </div>
    );
  }

  if (entry.starlinkCost?.status === "pending") {
    return (
      <div className="ledger-shipment-row">
        {paymentBadge}
        <button type="button" className="badge badge-yellow ledger-d-badge" onClick={onSettle}>
          D - تكلفة Starlink غير مسددة
        </button>
      </div>
    );
  }

  const profit = computeShipmentProfit(entry);
  if (profit.status !== "computed") {
    return (
      <div className="ledger-shipment-row">
        {paymentBadge}
        <span className="badge badge-gray">تم السداد لـ Starlink - تعذر حساب الربح</span>
      </div>
    );
  }

  const isProfit = profit.profitUsd! >= 0;
  return (
    <div className="ledger-shipment-row">
      {paymentBadge}
      <span className="badge badge-green">مسدد لـ Starlink</span>
      <span className={`ledger-shipment-profit ${isProfit ? "profit-positive" : "profit-negative"}`} dir="ltr">
        {isProfit ? `ربح +${formatAmount(profit.profitUsd!)} USD` : `خسارة ${formatAmount(profit.profitUsd!)} USD`}
      </span>
    </div>
  );
}
