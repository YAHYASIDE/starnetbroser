"use client";

import { FormEvent, useState } from "react";
import {
  computeBalanceByCurrency,
  createLedgerEntry,
  isIncompletePaymentRateEntry,
  isLegacyShipmentEntry,
  lastUsedCostCurrency,
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
  StarlinkCost,
  updateEntry,
} from "@/lib/ledgerStore";
import { computeShipmentProfit } from "@/lib/accountingStore";
import { Currency, CurrencyStore, getCurrency, toUsd, UpsertCurrencyInput } from "@/lib/currencyStore";
import { COUNTRY_CURRENCIES, CountryCurrencyOption } from "@/lib/countryCurrencies";
import { formatAmount } from "@/lib/formatAmount";
import {
  allocatedFromPayment,
  AllocationPlanItem,
  computeShipmentPaymentStatus,
  createAllocation,
  paidTowardShipment,
  PaymentAllocation,
  planFifoAllocation,
} from "@/lib/paymentAllocationStore";
import { StarlinkSettlementDialog } from "./StarlinkSettlementDialog";
import { AllocationDeviceOption, AllocationShipmentRow, PaymentAllocationDialog } from "./PaymentAllocationDialog";
import { LegacyEntryCompletionDialog } from "./LegacyEntryCompletionDialog";
import { PaymentRateCompletionDialog } from "./PaymentRateCompletionDialog";
import { EditLedgerEntryDialog } from "./EditLedgerEntryDialog";
import { HelpHint } from "./HelpHint";

/** One other device linked to the same customer - siblings, never the account currently open in
 * this dialog. Lets a payment recorded here be allocated to a shipment on a DIFFERENT device
 * (rule 8: "إمكانية اختيار جهاز آخر يدويًا"), never automatically. */
export interface SiblingDevice {
  accountId: string;
  accountName: string;
  entries: LedgerEntry[];
}

interface Props {
  accountId: string;
  accountName: string;
  /** The device's own already-known email (AccountCard.tsx's identityEmail: expectedEmail ||
   * starlinkAccountEmail), if any - prefills a new entry's own email field so the operator isn't
   * forced to retype it every time; still a plain, freely-editable field, never locked to it. */
  accountEmail?: string;
  entries: LedgerEntry[];
  /** Every OTHER device belonging to the same customer, if any - empty when this account has no
   * client or the client has only this one device. */
  siblingDevices: SiblingDevice[];
  currencyStore: CurrencyStore;
  onUpsertCurrency: (input: UpsertCurrencyInput) => Currency;
  /** Every allocation in the whole store (paymentAllocationStore.ts's allStoredAllocations), not
   * just this device's own - a shipment here may have been paid via an allocation filed under a
   * different device (see SiblingDevice above), so payment status must always be computed against
   * the full picture, never a per-device slice. */
  allocations: PaymentAllocation[];
  /** Appends new allocation records under THIS device's own account key - always where they're
   * filed, regardless of which device's shipments they target (see paymentAllocationStore.ts's
   * allStoredAllocations doc comment). */
  onAddAllocations: (newAllocations: PaymentAllocation[]) => void;
  /** Removes every allocation touching one entry, wherever in the WHOLE store it's filed - used on
   * delete so a cross-device allocation never dangles (see removeAllocationsForEntryFromStore). */
  onRemoveEntryAllocations: (entryId: string) => void;
  onClose: () => void;
  onChange: (entries: LedgerEntry[]) => void;
}

/** Builds one device's own allocation-dialog data: its eligible (same-currency, not-yet-fully-
 * paid) shipments plus a FIFO suggestion for `amount` - used for both a brand-new payment and an
 * existing one's "تخصيص الدفعة" (whose `amount` is just its own unallocated remainder). */
function buildDeviceOption(
  accountId: string,
  accountName: string,
  deviceEntries: LedgerEntry[],
  amount: number,
  currency: LedgerCurrency,
  allAllocations: PaymentAllocation[],
): AllocationDeviceOption {
  const shipments: AllocationShipmentRow[] = deviceEntries
    .filter((e) => e.kind === "debit" && e.currency === currency)
    .map((e) => ({ entry: e, remaining: e.amount - paidTowardShipment(allAllocations, e.id) }))
    .filter((row) => row.remaining > 0)
    .sort((a, b) => (a.entry.date !== b.entry.date ? (a.entry.date < b.entry.date ? -1 : 1) : (a.entry.createdAt < b.entry.createdAt ? -1 : 1)));
  const { plan } = planFifoAllocation(deviceEntries, allAllocations, amount, currency);
  return { accountId, accountName, shipments, initialPlan: plan };
}

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(amount: number, currency: LedgerCurrency): string {
  return `${formatAmount(amount)} ${LEDGER_CURRENCY_LABELS[currency]}`;
}

export function LedgerDialog({
  accountId,
  accountName,
  accountEmail,
  entries,
  siblingDevices,
  currencyStore,
  onUpsertCurrency,
  allocations,
  onAddAllocations,
  onRemoveEntryAllocations,
  onClose,
  onChange,
}: Props) {
  const [kind, setKind] = useState<LedgerEntryKind>("debit");
  // أوقية (MRU) is the actual day-to-day currency this business sells in - USD is only the
  // internal reference currency, never what a new entry should default to.
  const [currency, setCurrency] = useState<LedgerCurrency>("MRU");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  // Prefilled from the device's own already-known email when available - still a plain field the
  // operator can freely clear or change per entry, never locked to it.
  const [email, setEmail] = useState(accountEmail ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("nita");
  const [date, setDate] = useState(todayDateInputValue());
  const [formError, setFormError] = useState<string | null>(null);

  // Only relevant while kind === "debit" - a shipment charge, never a plain payment.
  const [markD, setMarkD] = useState(false);
  // The locked rate snapshot input, shared by both directions: a "debit" entry locks it as
  // saleRate, a "credit" entry as paymentRate (rule XIII's "cash actually collected" in USD).
  // Starts empty (not e.g. "1") whenever the currency's rate isn't already known, so a forgotten
  // rate blocks submission instead of silently defaulting to a wrong one - pre-filled here for the
  // default MRU currency above, same as selectCurrency does when switching currencies later.
  const [rateInput, setRateInput] = useState(() => {
    const known = getCurrency(currencyStore, "MRU")?.rateFromUsd;
    return known !== undefined ? String(known) : "";
  });

  // Starlink's own cost for this shipment, captured right here instead of a later separate step
  // (see StarlinkCost) - defaults to whatever currency this device last used, same convenience as
  // the settlement dialogs below.
  const [costCurrencyCode, setCostCurrencyCode] = useState(() => lastUsedCostCurrency(entries) ?? "");
  const [costAmount, setCostAmount] = useState("");
  const [costRate, setCostRate] = useState(() => {
    const code = lastUsedCostCurrency(entries);
    const known = code ? getCurrency(currencyStore, code)?.rateFromUsd : undefined;
    return known !== undefined ? String(known) : "";
  });
  const [costQuery, setCostQuery] = useState("");
  // The picked-but-not-yet-registered country's own name/symbol (see selectCostCurrency) - only
  // needed as a fallback for display/for "حفظ السعر في الإعدادات" until that button (or nothing)
  // actually adds this currency to the shared registry.
  const [costPendingName, setCostPendingName] = useState<string | undefined>(undefined);
  const [costPendingSymbol, setCostPendingSymbol] = useState<string | undefined>(undefined);

  const [settlingEntry, setSettlingEntry] = useState<LedgerEntry | null>(null);
  const [pendingPayment, setPendingPayment] = useState<LedgerEntry | null>(null);
  const [completingEntry, setCompletingEntry] = useState<LedgerEntry | null>(null);
  const [completingPayment, setCompletingPayment] = useState<LedgerEntry | null>(null);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  // An already-saved payment being (re)allocated via "تخصيص الدفعة" - only its own unallocated
  // remainder is proposed, existing allocation records for it are never touched here.
  const [allocatingPayment, setAllocatingPayment] = useState<LedgerEntry | null>(null);

  /** Every device this payment could be allocated into - this one first, then any sibling. */
  function devicesForAllocation(amount: number, currency: LedgerCurrency): AllocationDeviceOption[] {
    return [
      buildDeviceOption(accountId, accountName, entries, amount, currency, allocations),
      ...siblingDevices.map((d) => buildDeviceOption(d.accountId, d.accountName, d.entries, amount, currency, allocations)),
    ];
  }

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
    setRateInput(known !== undefined ? String(known) : "");
  }

  // Picking any country registers nothing by itself (same as the /currencies page's own add
  // form) - just fills the code/rate fields. It only actually joins the shared registry via
  // "حفظ السعر في الإعدادات" below, or implicitly once this entry itself is saved.
  function selectCostCurrency(option: CountryCurrencyOption) {
    setCostQuery("");
    setCostCurrencyCode(option.code);
    setCostPendingName(option.name);
    setCostPendingSymbol(option.symbol);
    const known = getCurrency(currencyStore, option.code)?.rateFromUsd;
    setCostRate(known !== undefined ? String(known) : "");
  }

  function changeCostCurrency() {
    setCostCurrencyCode("");
    setCostQuery("");
    setCostPendingName(undefined);
    setCostPendingSymbol(undefined);
  }

  // Same source and search behavior as the /currencies page's own "إضافة عملة جديدة" - every
  // country (USD included, since Starlink is a perfectly normal currency to pay it in directly),
  // searchable by country name or currency code.
  const costQueryNormalized = costQuery.trim().toLowerCase();
  const costCountryMatches = COUNTRY_CURRENCIES.filter(
    (o) => o.country.includes(costQuery.trim()) || o.code.toLowerCase().includes(costQueryNormalized),
  );
  const selectedCostCurrency = getCurrency(currencyStore, costCurrencyCode);
  const selectedCostCurrencyName = selectedCostCurrency?.name ?? costPendingName ?? costCurrencyCode;

  // Deliberately NOT run automatically on submit (unlike the sale/payment rate above) - the cost
  // rate typed here is scoped to THIS transaction only, per the operator's own explicit request;
  // only this dedicated action pushes it into the shared registry.
  function saveCostRateToSettings() {
    const rate = Number(costRate);
    if (!Number.isFinite(rate) || rate <= 0 || !costCurrencyCode) return;
    const existing = getCurrency(currencyStore, costCurrencyCode);
    onUpsertCurrency({
      code: costCurrencyCode,
      name: existing?.name ?? costPendingName ?? costCurrencyCode,
      symbol: existing?.symbol ?? costPendingSymbol ?? costCurrencyCode,
      rateFromUsd: rate,
    });
  }

  // Live preview, recomputed every render from the raw string inputs above - never stored state,
  // so it can never drift out of sync with what's actually about to be saved. undefined at any
  // stage (unfilled/invalid input, or MRU/SIFA not yet registered) just means "not shown yet",
  // never a guessed placeholder number.
  const isDebitForm = kind === "debit";
  const costIsUsd = costCurrencyCode === "USD";
  const parsedCostAmount = Number(costAmount);
  const parsedCostRate = Number(costRate);
  const costUsdValue =
    isDebitForm && Number.isFinite(parsedCostAmount) && parsedCostAmount > 0
      ? costIsUsd
        ? parsedCostAmount
        : Number.isFinite(parsedCostRate) && parsedCostRate > 0
          ? parsedCostAmount / parsedCostRate
          : undefined
      : undefined;

  const parsedSaleAmount = Number(amount);
  const parsedSaleRate = Number(rateInput);
  const saleUsdValue =
    isDebitForm && Number.isFinite(parsedSaleAmount) && parsedSaleAmount > 0
      ? currency === "USD"
        ? parsedSaleAmount
        : Number.isFinite(parsedSaleRate) && parsedSaleRate > 0
          ? parsedSaleAmount / parsedSaleRate
          : undefined
      : undefined;

  const mruRateKnown = getCurrency(currencyStore, "MRU")?.rateFromUsd;
  const sifaRateKnown = getCurrency(currencyStore, "SIFA")?.rateFromUsd;
  const costMruPreview = costUsdValue !== undefined && mruRateKnown !== undefined ? costUsdValue * mruRateKnown : undefined;
  const costSifaPreview = costUsdValue !== undefined && sifaRateKnown !== undefined ? costUsdValue * sifaRateKnown : undefined;

  const previewProfitUsd = costUsdValue !== undefined && saleUsdValue !== undefined ? saleUsdValue - costUsdValue : undefined;
  const previewProfitMru = previewProfitUsd !== undefined && mruRateKnown !== undefined ? previewProfitUsd * mruRateKnown : undefined;
  const previewProfitSifa = previewProfitUsd !== undefined && sifaRateKnown !== undefined ? previewProfitUsd * sifaRateKnown : undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError("أدخل مبلغًا صحيحًا أكبر من صفر");
      return;
    }

    const needsRate = currency !== "USD";
    const parsedRate = Number(rateInput);
    if (needsRate && (!Number.isFinite(parsedRate) || parsedRate <= 0)) {
      setFormError("أدخل سعر صرف صحيح أكبر من صفر لهذه العملة");
      return;
    }

    let starlinkCostInput: StarlinkCost | undefined;
    let profitCurrencyRates: { MRU?: number; SIFA?: number } | undefined;
    if (kind === "debit") {
      if (!costCurrencyCode) {
        setFormError("اختر عملة دفع Starlink");
        return;
      }
      if (!Number.isFinite(parsedCostAmount) || parsedCostAmount <= 0) {
        setFormError("أدخل مبلغ تكلفة Starlink أكبر من صفر");
        return;
      }
      if (!costIsUsd && (!Number.isFinite(parsedCostRate) || parsedCostRate <= 0)) {
        setFormError("أدخل سعر صرف صحيح لعملة الدفع لـ Starlink");
        return;
      }
      if (!markD) {
        if (mruRateKnown === undefined) {
          setFormError("سعر الأوقية مقابل الدولار غير موجود في الإعدادات");
          return;
        }
        if (sifaRateKnown === undefined) {
          setFormError("سعر السيفا مقابل الدولار غير موجود في الإعدادات");
          return;
        }
      }

      const costRateSnapshot = costIsUsd ? undefined : { rateFromUsd: parsedCostRate, usdValue: costUsdValue! };
      starlinkCostInput = markD
        ? { status: "pending", currencyCode: costCurrencyCode, amount: parsedCostAmount, rate: costRateSnapshot }
        : { status: "settled", currencyCode: costCurrencyCode, amount: parsedCostAmount, rate: costRateSnapshot, paidAt: date };
      profitCurrencyRates = markD ? undefined : { MRU: mruRateKnown, SIFA: sifaRateKnown };
    }
    setFormError(null);

    if (needsRate) {
      // Keeps the registry's "last used" rate for this currency current (rule VI) - the entry's
      // own saleRate/paymentRate below is a separate, permanently locked snapshot, never
      // re-derived from this.
      const existing = getCurrency(currencyStore, currency);
      onUpsertCurrency({
        code: currency,
        name: existing?.name ?? LEDGER_CURRENCY_LABELS[currency],
        symbol: existing?.symbol ?? currency,
        rateFromUsd: parsedRate,
      });
    }

    const rateSnapshot = needsRate ? { rateFromUsd: parsedRate, usdValue: parsedAmount / parsedRate } : undefined;
    const entry = createLedgerEntry({
      kind,
      amount: parsedAmount,
      currency,
      note,
      email,
      paymentMethod: kind === "credit" ? paymentMethod : undefined,
      date,
      saleRate: kind === "debit" ? rateSnapshot : undefined,
      paymentRate: kind === "credit" ? rateSnapshot : undefined,
      starlinkCost: starlinkCostInput,
      profitCurrencyRates,
    });

    setAmount("");
    setNote("");
    setEmail(accountEmail ?? "");
    setMarkD(false);
    setCostAmount("");

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
    onRemoveEntryAllocations(entryId);
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

        <HelpHint
          title="كشف الحساب"
          steps={[
            "اختر 'عليه' لتسجيل شحنة/مبلغ جديد على الزبون، أو 'له' لتسجيل دفعة استلمتها منه.",
            "عند تسجيل شحنة، أدخل تكلفة Starlink الحقيقية ليُحسب الربح تلقائيًا - أو فعّل 'D' إن لم تُسدَّد بعد.",
            "الدفعة (له) تُخصَّص تلقائيًا لأقدم شحنة غير مدفوعة، ويمكنك تغيير الجهاز أو الشحنة يدويًا قبل الحفظ.",
          ]}
        />

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
          {currency !== "USD" && (
            <label className="form-field">
              <span>سعر عملة {kind === "debit" ? "البيع" : "الدفعة"} (1 USD = ؟ {currency})</span>
              <input
                className="search-input"
                type="number"
                min="0"
                step="0.0001"
                dir="ltr"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
              />
            </label>
          )}
          {kind === "debit" && (
            <div className="ledger-cost-section">
              <div className="ledger-cost-section-title">
                <strong>تكلفة اشتراك Starlink</strong>
                <span>أدخل تكلفة اشتراك Starlink بعملة الدفع للجهاز</span>
              </div>

              <div className="form-field form-wide">
                <span>عملة الدفع للجهاز</span>
                {costCurrencyCode ? (
                  <div className="client-picker-selected">
                    <span className="client-picker-selected-name">{selectedCostCurrencyName} ({costCurrencyCode})</span>
                    <button type="button" className="text-action" onClick={changeCostCurrency}>تغيير</button>
                  </div>
                ) : (
                  <div className="client-picker">
                    <input
                      className="search-input"
                      placeholder="ابحث عن الدولة"
                      value={costQuery}
                      onChange={(e) => setCostQuery(e.target.value)}
                    />
                    <div className="client-picker-list">
                      {costCountryMatches.length === 0 && <p className="client-picker-empty">لا توجد دولة مطابقة</p>}
                      {costCountryMatches.map((o) => (
                        <button key={o.country} type="button" className="client-picker-option" onClick={() => selectCostCurrency(o)}>
                          <span>{o.country}</span>
                          <span dir="ltr">{o.code}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="ledger-cost-row">
                <label className="form-field">
                  <span>المبلغ المدفوع لـ Starlink</span>
                  <input
                    className="search-input"
                    type="number"
                    min="0"
                    step="0.01"
                    dir="ltr"
                    value={costAmount}
                    onChange={(e) => setCostAmount(e.target.value)}
                  />
                </label>
                {!costIsUsd && (
                  <label className="form-field">
                    <span>سعر العملة (1 USD = ؟ {costCurrencyCode || "عملة"})</span>
                    <input
                      className="search-input"
                      type="number"
                      min="0"
                      step="0.0001"
                      dir="ltr"
                      value={costRate}
                      onChange={(e) => setCostRate(e.target.value)}
                    />
                  </label>
                )}
              </div>
              {!costIsUsd && costCurrencyCode && (
                <div className="ledger-cost-rate-hint">
                  <span>مأخوذ من الإعدادات - يمكن تعديله لهذه الحركة فقط</span>
                  <button type="button" className="text-action" onClick={saveCostRateToSettings}>حفظ السعر في الإعدادات</button>
                </div>
              )}

              {costUsdValue !== undefined && (
                <div className="ledger-cost-convert">
                  <div className="ledger-cost-convert-usd">
                    {!costIsUsd && <span dir="ltr">{formatAmount(parsedCostAmount)} {costCurrencyCode} ÷ {formatAmount(parsedCostRate)}</span>}
                    <strong dir="ltr">{formatAmount(costUsdValue)} USD</strong>
                  </div>
                  <div className="ledger-cost-convert-rows">
                    <span dir="ltr">{costMruPreview !== undefined ? `${formatAmount(costMruPreview)} أوقية` : "أوقية: — (سجّل سعر الأوقية في الإعدادات)"}</span>
                    <span dir="ltr">{costSifaPreview !== undefined ? `${formatAmount(costSifaPreview)} سيفا` : "سيفا: — (سجّل سعر السيفا في الإعدادات)"}</span>
                  </div>
                </div>
              )}

              <label className="ledger-d-toggle">
                <input type="checkbox" checked={markD} onChange={(e) => setMarkD(e.target.checked)} />
                D - تكلفة Starlink غير مسددة بعد
              </label>

              {markD ? (
                <div className="ledger-profit-section ledger-profit-pending">
                  <strong>ربح العملية</strong>
                  <span>الربح معلّق حتى تسديد تكلفة Starlink</span>
                </div>
              ) : previewProfitUsd !== undefined ? (
                <div className={`ledger-profit-section ${previewProfitUsd >= 0 ? "ledger-profit-positive" : "ledger-profit-negative"}`}>
                  <strong>{previewProfitUsd >= 0 ? "ربح العملية" : "خسارة العملية"}</strong>
                  <div className="ledger-cost-convert-rows">
                    <span dir="ltr">{previewProfitMru !== undefined ? `${formatAmount(previewProfitMru)} أوقية` : "أوقية: —"}</span>
                    <span dir="ltr">{previewProfitSifa !== undefined ? `${formatAmount(previewProfitSifa)} سيفا` : "سيفا: —"}</span>
                  </div>
                  <span className="ledger-profit-hint">المبلغ المستلم − تكلفة Starlink</span>
                </div>
              ) : (
                <div className="ledger-profit-section ledger-profit-pending">
                  <strong>ربح العملية</strong>
                  <span>أكمل بيانات المبلغ والتكلفة أعلاه لحساب الربح</span>
                </div>
              )}
            </div>
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
                  className="text-action"
                  type="button"
                  onClick={() => setEditingEntry(entry)}
                  aria-label="تعديل الحركة"
                  title="تعديل الحركة"
                >
                  تعديل
                </button>
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
              {entry.kind === "credit" && (() => {
                const unallocated = entry.amount - allocatedFromPayment(allocations, entry.id);
                const showUnallocated = unallocated > 0.0001;
                const showRateIncomplete = isIncompletePaymentRateEntry(entry);
                if (!showUnallocated && !showRateIncomplete) return null;
                return (
                  <div className="ledger-entry-row-bottom">
                    {showRateIncomplete && (
                      <>
                        <span className="badge badge-yellow">سعر الصرف غير مكتمل</span>
                        <button className="text-action" type="button" onClick={() => setCompletingPayment(entry)}>
                          استكمال سعر الصرف
                        </button>
                      </>
                    )}
                    {showUnallocated && (
                      <>
                        <span className="badge badge-yellow" dir="ltr">
                          رصيد غير مخصص للزبون: {formatAmount(unallocated)} {LEDGER_CURRENCY_LABELS[entry.currency]}
                        </span>
                        <button className="text-action" type="button" onClick={() => setAllocatingPayment(entry)}>
                          تخصيص الدفعة
                        </button>
                      </>
                    )}
                  </div>
                );
              })()}
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
          defaultCurrencyCode={settlingEntry.starlinkCost?.currencyCode ?? lastUsedCostCurrency(entries)}
          onUpsertCurrency={onUpsertCurrency}
          onClose={() => setSettlingEntry(null)}
          onSettle={(cost) => {
            // Locked now, at the moment this shipment's profit first becomes computable - never
            // re-derived later even if MRU/SIFA's registry rate changes afterward (rule VI).
            const profitCurrencyRates = {
              MRU: getCurrency(currencyStore, "MRU")?.rateFromUsd,
              SIFA: getCurrency(currencyStore, "SIFA")?.rateFromUsd,
            };
            onChange(updateEntry(entries, settlingEntry.id, { starlinkCost: cost, profitCurrencyRates }));
            setSettlingEntry(null);
          }}
        />
      )}

      {pendingPayment && (
        <PaymentAllocationDialog
          amount={pendingPayment.amount}
          currency={pendingPayment.currency}
          devices={devicesForAllocation(pendingPayment.amount, pendingPayment.currency)}
          initialDeviceId={accountId}
          onCancel={() => setPendingPayment(null)}
          onConfirm={(plan: AllocationPlanItem[]) => {
            const newAllocations = plan.map((item) =>
              createAllocation(pendingPayment.id, item.shipmentEntryId, item.amount, pendingPayment.currency),
            );
            onChange([...entries, pendingPayment]);
            onAddAllocations(newAllocations);
            setPendingPayment(null);
          }}
        />
      )}

      {allocatingPayment && (() => {
        const unallocated = allocatingPayment.amount - allocatedFromPayment(allocations, allocatingPayment.id);
        return (
          <PaymentAllocationDialog
            amount={unallocated}
            currency={allocatingPayment.currency}
            devices={devicesForAllocation(unallocated, allocatingPayment.currency)}
            initialDeviceId={accountId}
            onCancel={() => setAllocatingPayment(null)}
            onConfirm={(plan: AllocationPlanItem[]) => {
              const newAllocations = plan.map((item) =>
                createAllocation(allocatingPayment.id, item.shipmentEntryId, item.amount, allocatingPayment.currency),
              );
              onAddAllocations(newAllocations);
              setAllocatingPayment(null);
            }}
          />
        );
      })()}

      {completingEntry && (
        <LegacyEntryCompletionDialog
          entry={completingEntry}
          currencyStore={currencyStore}
          defaultCostCurrencyCode={lastUsedCostCurrency(entries)}
          onUpsertCurrency={onUpsertCurrency}
          onClose={() => setCompletingEntry(null)}
          onComplete={(patch) => {
            onChange(updateEntry(entries, completingEntry.id, patch));
            setCompletingEntry(null);
          }}
        />
      )}

      {completingPayment && (
        <PaymentRateCompletionDialog
          entry={completingPayment}
          currencyStore={currencyStore}
          onUpsertCurrency={onUpsertCurrency}
          onClose={() => setCompletingPayment(null)}
          onComplete={(paymentRate) => {
            onChange(updateEntry(entries, completingPayment.id, { paymentRate }));
            setCompletingPayment(null);
          }}
        />
      )}

      {editingEntry && (
        <EditLedgerEntryDialog
          entry={editingEntry}
          currencyStore={currencyStore}
          hasAllocations={
            editingEntry.kind === "debit"
              ? paidTowardShipment(allocations, editingEntry.id) > 0
              : allocatedFromPayment(allocations, editingEntry.id) > 0
          }
          onUpsertCurrency={onUpsertCurrency}
          onClose={() => setEditingEntry(null)}
          onSave={(patch) => {
            onChange(updateEntry(entries, editingEntry.id, patch));
            setEditingEntry(null);
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
        <span className="ledger-profit-pending-hint">الربح معلّق حتى تسديد تكلفة Starlink</span>
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
      {(profit.profitMru !== undefined || profit.profitSifa !== undefined) && (
        <span className={`ledger-shipment-profit ${isProfit ? "profit-positive" : "profit-negative"}`} dir="ltr">
          {profit.profitMru !== undefined && `${formatAmount(profit.profitMru)} أوقية`}
          {profit.profitMru !== undefined && profit.profitSifa !== undefined && " / "}
          {profit.profitSifa !== undefined && `${formatAmount(profit.profitSifa)} سيفا`}
        </span>
      )}
    </div>
  );
}
