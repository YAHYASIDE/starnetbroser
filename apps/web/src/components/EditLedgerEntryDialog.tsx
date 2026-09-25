"use client";

import { FormEvent, useState } from "react";
import {
  LedgerCurrency,
  LEDGER_CURRENCIES,
  LEDGER_CURRENCY_LABELS,
  LedgerEntry,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PaymentMethod,
  StarlinkCost,
} from "@/lib/ledgerStore";
import { Currency, CurrencyStore, getCurrency, UpsertCurrencyInput } from "@/lib/currencyStore";
import { COUNTRY_CURRENCIES, CountryCurrencyOption } from "@/lib/countryCurrencies";
import { formatAmount } from "@/lib/formatAmount";

interface Props {
  entry: LedgerEntry;
  currencyStore: CurrencyStore;
  /** True once any allocation record already touches this entry (as the shipment for a debit
   * entry, or as the payment for a credit one) - amount/currency then stay locked (everything
   * else remains editable) so a correction here can never silently desync the FIFO allocation
   * math, which assumes both were fixed at allocation time. */
  hasAllocations: boolean;
  onUpsertCurrency: (input: UpsertCurrencyInput) => Currency;
  onClose: () => void;
  onSave: (patch: Partial<LedgerEntry>) => void;
}

/**
 * Edits a previously-saved entry's own fields - same validation and field set as the "add
 * حركة" form in LedgerDialog (rate snapshot, Starlink cost with its country-search picker,
 * profit preview), just pre-filled and writing back via updateEntry instead of appending a new
 * entry. `kind` itself is never editable here - converting a shipment into a payment (or back)
 * would silently invalidate its allocations/cost/profit history, so that requires deleting and
 * re-adding instead.
 */
export function EditLedgerEntryDialog({ entry, currencyStore, hasAllocations, onUpsertCurrency, onClose, onSave }: Props) {
  const isDebit = entry.kind === "debit";

  const [currency, setCurrency] = useState<LedgerCurrency>(entry.currency);
  const [amount, setAmount] = useState(String(entry.amount));
  const [date, setDate] = useState(entry.date);
  const [note, setNote] = useState(entry.note);
  const [email, setEmail] = useState(entry.email);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(entry.paymentMethod ?? "nita");

  const existingRate = isDebit ? entry.saleRate : entry.paymentRate;
  const [rateInput, setRateInput] = useState(
    existingRate ? String(existingRate.rateFromUsd) : entry.currency !== "USD" ? String(getCurrency(currencyStore, entry.currency)?.rateFromUsd ?? "") : "",
  );

  const [markD, setMarkD] = useState(entry.starlinkCost?.status === "pending");
  const [costCurrencyCode, setCostCurrencyCode] = useState(entry.starlinkCost?.currencyCode ?? "");
  const [costAmount, setCostAmount] = useState(entry.starlinkCost?.amount !== undefined ? String(entry.starlinkCost.amount) : "");
  const [costRate, setCostRate] = useState(entry.starlinkCost?.rate ? String(entry.starlinkCost.rate.rateFromUsd) : "");
  const [costQuery, setCostQuery] = useState("");
  // Seeded from COUNTRY_CURRENCIES so the pre-selected chip shows a real name ("بيزو أرجنتيني")
  // instead of the bare code, for a cost currency that was picked but never explicitly registered
  // via "حفظ السعر في الإعدادات" (getCurrency below would otherwise find nothing for it either).
  const initialCostOption = entry.starlinkCost?.currencyCode
    ? COUNTRY_CURRENCIES.find((o) => o.code === entry.starlinkCost!.currencyCode)
    : undefined;
  const [costPendingName, setCostPendingName] = useState<string | undefined>(initialCostOption?.name);
  const [costPendingSymbol, setCostPendingSymbol] = useState<string | undefined>(initialCostOption?.symbol);

  const [formError, setFormError] = useState<string | null>(null);

  function selectCurrency(next: LedgerCurrency) {
    setCurrency(next);
    const known = getCurrency(currencyStore, next)?.rateFromUsd;
    setRateInput(known !== undefined ? String(known) : "");
  }

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

  const costQueryNormalized = costQuery.trim().toLowerCase();
  const costCountryMatches = COUNTRY_CURRENCIES.filter(
    (o) => o.country.includes(costQuery.trim()) || o.code.toLowerCase().includes(costQueryNormalized),
  );
  const selectedCostCurrency = getCurrency(currencyStore, costCurrencyCode);
  const selectedCostCurrencyName = selectedCostCurrency?.name ?? costPendingName ?? costCurrencyCode;

  const costIsUsd = costCurrencyCode === "USD";
  const parsedCostAmount = Number(costAmount);
  const parsedCostRate = Number(costRate);
  const costUsdValue =
    isDebit && Number.isFinite(parsedCostAmount) && parsedCostAmount > 0
      ? costIsUsd
        ? parsedCostAmount
        : Number.isFinite(parsedCostRate) && parsedCostRate > 0
          ? parsedCostAmount / parsedCostRate
          : undefined
      : undefined;

  const parsedSaleAmount = Number(amount);
  const parsedSaleRate = Number(rateInput);
  const saleUsdValue =
    isDebit && Number.isFinite(parsedSaleAmount) && parsedSaleAmount > 0
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

    let starlinkCostPatch: StarlinkCost | undefined = entry.starlinkCost;
    // Recomputed fresh from the CURRENT registry rates, same as a deliberate settlement - this is
    // an explicit correction the operator is making now, never a silent background recompute.
    let profitCurrencyRates: { MRU?: number; SIFA?: number } | undefined = entry.profitCurrencyRates;
    if (isDebit) {
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
      starlinkCostPatch = markD
        ? { status: "pending", currencyCode: costCurrencyCode, amount: parsedCostAmount, rate: costRateSnapshot }
        : {
            status: "settled",
            currencyCode: costCurrencyCode,
            amount: parsedCostAmount,
            rate: costRateSnapshot,
            paidAt: entry.starlinkCost?.paidAt ?? date,
            note: entry.starlinkCost?.note,
          };
      profitCurrencyRates = markD ? undefined : { MRU: mruRateKnown, SIFA: sifaRateKnown };
    }
    setFormError(null);

    if (needsRate) {
      const existing = getCurrency(currencyStore, currency);
      onUpsertCurrency({
        code: currency,
        name: existing?.name ?? LEDGER_CURRENCY_LABELS[currency],
        symbol: existing?.symbol ?? currency,
        rateFromUsd: parsedRate,
      });
    }

    const rateSnapshot = needsRate ? { rateFromUsd: parsedRate, usdValue: parsedAmount / parsedRate } : undefined;

    onSave({
      amount: parsedAmount,
      currency,
      note,
      email,
      paymentMethod: entry.kind === "credit" ? paymentMethod : undefined,
      date,
      saleRate: isDebit ? rateSnapshot : entry.saleRate,
      paymentRate: !isDebit ? rateSnapshot : entry.paymentRate,
      starlinkCost: starlinkCostPatch,
      profitCurrencyRates,
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog ledger-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-entry-title">
        <header className="dialog-header">
          <div>
            <h2 id="edit-entry-title">تعديل الحركة</h2>
            <p>{entry.kind === "debit" ? "عليه" : "له"} - {formatAmount(entry.amount)} {LEDGER_CURRENCY_LABELS[entry.currency]}</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="إغلاق">×</button>
        </header>

        <form className="ledger-entry-form" onSubmit={submit}>
          {hasAllocations ? (
            <div className="form-field form-wide">
              <span>المبلغ والعملة</span>
              <span dir="ltr">{formatAmount(entry.amount)} {LEDGER_CURRENCY_LABELS[entry.currency]}</span>
              <span className="ledger-cost-rate-hint">مقفلة لأن هذه الحركة مخصصة بالفعل لدفعة/شحنة أخرى</span>
            </div>
          ) : (
            <>
              <select className="search-input" value={currency} onChange={(e) => selectCurrency(e.target.value as LedgerCurrency)}>
                {LEDGER_CURRENCIES.map((c) => (
                  <option key={c} value={c}>{LEDGER_CURRENCY_LABELS[c]}</option>
                ))}
              </select>
              <input
                className="search-input"
                type="number" lang="en"
                min="0"
                step="0.01"
                dir="ltr"
                placeholder="المبلغ"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </>
          )}
          <input
            className="search-input"
            type="date" lang="en-GB"
            dir="ltr"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {currency !== "USD" && (
            <label className="form-field">
              <span>سعر عملة {isDebit ? "البيع" : "الدفعة"} (1 USD = ؟ {currency})</span>
              <input
                className="search-input"
                type="number" lang="en"
                min="0"
                step="0.0001"
                dir="ltr"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
              />
            </label>
          )}
          {isDebit && (
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
                    type="number" lang="en"
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
                      type="number" lang="en"
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
          {entry.kind === "credit" && (
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
            placeholder="ملاحظة (اختياري)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <input
            className="search-input ledger-email-input"
            dir="ltr"
            placeholder="البريد الإلكتروني (اختياري)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {formError && <div className="account-card-alert ledger-form-error">{formError}</div>}
          <div className="dialog-actions form-wide">
            <button className="dialog-secondary" type="button" onClick={onClose}>إلغاء</button>
            <button className="dialog-primary" type="submit">حفظ التعديل</button>
          </div>
        </form>
      </section>
    </div>
  );
}
