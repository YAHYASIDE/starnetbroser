"use client";

import { FormEvent, useState } from "react";
import { Currency, CurrencyStore, getCurrency, listCurrencies, UpsertCurrencyInput } from "@/lib/currencyStore";
import { formatAmount } from "@/lib/formatAmount";
import { LedgerEntry, RateSnapshot, StarlinkCost } from "@/lib/ledgerStore";

interface Props {
  /** Must be a legacy shipment entry (isLegacyShipmentEntry(entry) === true) - a debit entry
   * created before starlinkCost/saleRate existed. */
  entry: LedgerEntry;
  currencyStore: CurrencyStore;
  /** The currency code last used to settle a Starlink cost on this same device, if any - just a
   * convenience default for the picker below, never a guess at this settlement's own rate. */
  defaultCostCurrencyCode?: string;
  onUpsertCurrency: (input: UpsertCurrencyInput) => Currency;
  onClose: () => void;
  /** Applies the completed fields via ledgerStore's updateEntry - never touches
   * kind/amount/currency/date/note/email, only ever adds saleRate/starlinkCost. */
  onComplete: (patch: { saleRate?: RateSnapshot; starlinkCost: StarlinkCost }) => void;
}

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * "استكمال البيانات" for a legacy shipment (rule VI) - the device and customer name are already
 * known (a legacy entry still lives under its own account/client, nothing missing there); the
 * only things actually missing are the sale-side exchange rate (if the sale wasn't in USD) and
 * Starlink's own cost for this shipment, which the operator can now supply either as still-D
 * (pending) or as already paid. Never invents a rate or a cost on its own - both require an
 * explicit, validated entry before this can be saved (rule XV).
 */
export function LegacyEntryCompletionDialog({ entry, currencyStore, defaultCostCurrencyCode, onUpsertCurrency, onClose, onComplete }: Props) {
  const needsSaleRate = entry.currency !== "USD";
  const [saleRateInput, setSaleRateInput] = useState(
    needsSaleRate ? String(getCurrency(currencyStore, entry.currency)?.rateFromUsd ?? "") : "",
  );

  const [costStatus, setCostStatus] = useState<"pending" | "settled">("pending");

  const registered = listCurrencies(currencyStore);
  const [showNewCurrency, setShowNewCurrency] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newSymbol, setNewSymbol] = useState("");

  const [costCurrencyCode, setCostCurrencyCode] = useState(
    (defaultCostCurrencyCode && getCurrency(currencyStore, defaultCostCurrencyCode) ? defaultCostCurrencyCode : registered[0]?.code) ?? "USD",
  );
  const [costAmount, setCostAmount] = useState("");
  const [costRate, setCostRate] = useState(String(getCurrency(currencyStore, costCurrencyCode)?.rateFromUsd ?? 1));
  const [costDate, setCostDate] = useState(todayDateInputValue());
  const [costNote, setCostNote] = useState("");

  const [error, setError] = useState<string | null>(null);

  const costIsUsd = costCurrencyCode === "USD";
  const parsedCostAmount = Number(costAmount);
  const parsedCostRate = Number(costRate);
  const costUsdValue = costIsUsd
    ? (Number.isFinite(parsedCostAmount) ? parsedCostAmount : undefined)
    : Number.isFinite(parsedCostAmount) && Number.isFinite(parsedCostRate) && parsedCostRate > 0
      ? parsedCostAmount / parsedCostRate
      : undefined;

  function selectCostCurrency(code: string) {
    setCostCurrencyCode(code);
    setCostRate(String(getCurrency(currencyStore, code)?.rateFromUsd ?? 1));
  }

  function handleCostCurrencyChange(value: string) {
    if (value === "__new__") {
      setShowNewCurrency(true);
      return;
    }
    setShowNewCurrency(false);
    selectCostCurrency(value);
  }

  function submitNewCurrency() {
    if (!newCode.trim() || !newName.trim() || !newSymbol.trim()) return;
    const created = onUpsertCurrency({ code: newCode, name: newName, symbol: newSymbol, rateFromUsd: 1 });
    setCostCurrencyCode(created.code);
    setCostRate("1");
    setShowNewCurrency(false);
    setNewCode("");
    setNewName("");
    setNewSymbol("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedSaleRate = Number(saleRateInput);
    if (needsSaleRate && (!Number.isFinite(parsedSaleRate) || parsedSaleRate <= 0)) {
      setError("أدخل سعر صرف صحيح أكبر من صفر لعملة البيع");
      return;
    }

    if (costStatus === "settled") {
      if (!Number.isFinite(parsedCostAmount) || parsedCostAmount <= 0) {
        setError("أدخل مبلغ تكلفة صحيح أكبر من صفر");
        return;
      }
      if (!costIsUsd && (!Number.isFinite(parsedCostRate) || parsedCostRate <= 0)) {
        setError("أدخل سعر صرف صحيح أكبر من صفر لعملة التكلفة");
        return;
      }
    }
    setError(null);

    if (needsSaleRate) {
      const existing = getCurrency(currencyStore, entry.currency);
      onUpsertCurrency({
        code: entry.currency,
        name: existing?.name ?? entry.currency,
        symbol: existing?.symbol ?? entry.currency,
        rateFromUsd: parsedSaleRate,
      });
    }

    if (costStatus === "settled" && !costIsUsd) {
      const existing = getCurrency(currencyStore, costCurrencyCode);
      onUpsertCurrency({
        code: costCurrencyCode,
        name: existing?.name ?? costCurrencyCode,
        symbol: existing?.symbol ?? costCurrencyCode,
        rateFromUsd: parsedCostRate,
      });
    }

    onComplete({
      saleRate: needsSaleRate ? { rateFromUsd: parsedSaleRate, usdValue: entry.amount / parsedSaleRate } : undefined,
      starlinkCost:
        costStatus === "pending"
          ? { status: "pending" }
          : {
              status: "settled",
              currencyCode: costCurrencyCode,
              amount: parsedCostAmount,
              rate: costIsUsd ? undefined : { rateFromUsd: parsedCostRate, usdValue: costUsdValue! },
              paidAt: costDate,
              note: costNote.trim() || undefined,
            },
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="legacy-completion-title">
        <header className="dialog-header">
          <div>
            <h2 id="legacy-completion-title">استكمال بيانات عملية قديمة</h2>
            <p dir="ltr">شحنة عليه {formatAmount(entry.amount)} {entry.currency} - {entry.date}</p>
            <p>لن تُحذف هذه العملية أو تُعدَّل قيمتها الأصلية - هذا يضيف فقط سعر الصرف وحالة تكلفة Starlink الناقصين.</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="إغلاق">×</button>
        </header>

        <form className="account-form" onSubmit={submit}>
          {needsSaleRate && (
            <label className="form-field form-wide">
              <span>سعر صرف قيمة البيع (1 USD = ؟ {entry.currency})</span>
              <input
                className="search-input"
                type="number" lang="en"
                min="0"
                step="0.0001"
                dir="ltr"
                value={saleRateInput}
                onChange={(e) => setSaleRateInput(e.target.value)}
              />
            </label>
          )}

          <label className="form-field form-wide">
            <span>حالة تكلفة Starlink</span>
            <select className="search-input" value={costStatus} onChange={(e) => setCostStatus(e.target.value as "pending" | "settled")}>
              <option value="pending">D - لم تُسدد بعد</option>
              <option value="settled">تم سداد التكلفة بالفعل</option>
            </select>
          </label>

          {costStatus === "settled" && (
            <>
              <label className="form-field">
                <span>عملة التكلفة</span>
                <select
                  className="search-input"
                  value={showNewCurrency ? "__new__" : costCurrencyCode}
                  onChange={(e) => handleCostCurrencyChange(e.target.value)}
                >
                  {registered.map((c) => (
                    <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
                  ))}
                  <option value="__new__">+ عملة جديدة…</option>
                </select>
              </label>

              {showNewCurrency && (
                <div className="form-field form-wide client-picker-new-form">
                  <input className="search-input" dir="ltr" placeholder="الرمز الدولي، مثال: EUR" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
                  <input className="search-input" placeholder="اسم العملة" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <input className="search-input" dir="ltr" placeholder="رمز العرض" value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} />
                  <button type="button" className="dialog-primary" onClick={submitNewCurrency}>إضافة واستخدام</button>
                </div>
              )}

              <label className="form-field">
                <span>مبلغ التكلفة</span>
                <input className="search-input" type="number" lang="en" min="0" step="0.01" dir="ltr" value={costAmount} onChange={(e) => setCostAmount(e.target.value)} />
              </label>

              {!costIsUsd && (
                <label className="form-field">
                  <span>سعر الصرف (1 USD = ؟ {costCurrencyCode})</span>
                  <input className="search-input" type="number" lang="en" min="0" step="0.0001" dir="ltr" value={costRate} onChange={(e) => setCostRate(e.target.value)} />
                </label>
              )}

              <div className="form-field">
                <span>القيمة بالدولار</span>
                <strong dir="ltr">{costUsdValue !== undefined ? `${formatAmount(costUsdValue)} USD` : "—"}</strong>
              </div>

              <label className="form-field">
                <span>تاريخ الدفع</span>
                <input className="search-input" type="date" lang="en-GB" dir="ltr" value={costDate} onChange={(e) => setCostDate(e.target.value)} />
              </label>

              <label className="form-field form-wide">
                <span>ملاحظة (اختياري)</span>
                <input className="search-input" value={costNote} onChange={(e) => setCostNote(e.target.value)} />
              </label>
            </>
          )}

          {error && <div className="account-card-alert form-wide">{error}</div>}

          <div className="dialog-actions form-wide">
            <button className="dialog-secondary" type="button" onClick={onClose}>إلغاء</button>
            <button className="dialog-primary" type="submit">حفظ الاستكمال</button>
          </div>
        </form>
      </section>
    </div>
  );
}
