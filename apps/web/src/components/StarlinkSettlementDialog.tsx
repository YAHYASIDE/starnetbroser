"use client";

import { DateInput } from "./DateInput";
import { FormEvent, useState } from "react";
import { Currency, CurrencyStore, getCurrency, listCurrencies, UpsertCurrencyInput } from "@/lib/currencyStore";
import { formatAmount } from "@/lib/formatAmount";
import { LedgerEntry, StarlinkCost } from "@/lib/ledgerStore";

interface Props {
  entry: LedgerEntry;
  currencyStore: CurrencyStore;
  /** The currency code last used to settle a Starlink cost on this same device, if any - just a
   * convenience default for the picker below, never a guess at this settlement's own rate. */
  defaultCurrencyCode?: string;
  onUpsertCurrency: (input: UpsertCurrencyInput) => Currency;
  onClose: () => void;
  onSettle: (cost: StarlinkCost) => void;
}

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * "تسوية تكلفة Starlink" - settles the "D" mark on one shipment entry (see rule III). Never
 * touches the customer's own balance/debt: this only records what STAR NET paid Starlink, in
 * whatever currency it was actually paid in, with a locked rate snapshot so a later change to
 * that currency's rate in Settings never rewrites this settlement's numbers.
 */
export function StarlinkSettlementDialog({ entry, currencyStore, defaultCurrencyCode, onUpsertCurrency, onClose, onSettle }: Props) {
  const registered = listCurrencies(currencyStore);

  const [showNewCurrency, setShowNewCurrency] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newSymbol, setNewSymbol] = useState("");

  // The pending shipment's own amount/currency/rate, captured up front when it was marked D
  // (rather than left blank) - reviewable and editable here, never re-typed from scratch.
  const [currencyCode, setCurrencyCode] = useState(
    entry.starlinkCost?.currencyCode ??
      ((defaultCurrencyCode && getCurrency(currencyStore, defaultCurrencyCode) ? defaultCurrencyCode : registered[0]?.code) ?? "USD"),
  );
  const [amount, setAmount] = useState(entry.starlinkCost?.amount !== undefined ? String(entry.starlinkCost.amount) : "");
  const [rate, setRate] = useState(
    String(entry.starlinkCost?.rate?.rateFromUsd ?? getCurrency(currencyStore, currencyCode)?.rateFromUsd ?? 1),
  );
  const [date, setDate] = useState(todayDateInputValue());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isUsd = currencyCode === "USD";
  const parsedAmount = Number(amount);
  const parsedRate = Number(rate);
  const usdValue = isUsd
    ? (Number.isFinite(parsedAmount) ? parsedAmount : undefined)
    : Number.isFinite(parsedAmount) && Number.isFinite(parsedRate) && parsedRate > 0
      ? parsedAmount / parsedRate
      : undefined;

  function selectCurrency(code: string) {
    setCurrencyCode(code);
    setRate(String(getCurrency(currencyStore, code)?.rateFromUsd ?? 1));
  }

  function handleCurrencyChange(value: string) {
    if (value === "__new__") {
      setShowNewCurrency(true);
      return;
    }
    setShowNewCurrency(false);
    selectCurrency(value);
  }

  function submitNewCurrency() {
    if (!newCode.trim() || !newName.trim() || !newSymbol.trim()) return;
    const created = onUpsertCurrency({ code: newCode, name: newName, symbol: newSymbol, rateFromUsd: 1 });
    setCurrencyCode(created.code);
    setRate("1");
    setShowNewCurrency(false);
    setNewCode("");
    setNewName("");
    setNewSymbol("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("أدخل مبلغ تكلفة صحيح أكبر من صفر");
      return;
    }
    if (!isUsd && (!Number.isFinite(parsedRate) || parsedRate <= 0)) {
      setError("أدخل سعر صرف صحيح أكبر من صفر");
      return;
    }
    setError(null);

    const currency = getCurrency(currencyStore, currencyCode);
    if (!isUsd) {
      // Keeps the registry's own rate current for next time (rule VI) - the LOCKED snapshot below
      // is what this settlement itself is permanently based on, never re-derived from this later.
      onUpsertCurrency({
        code: currencyCode,
        name: currency?.name ?? currencyCode,
        symbol: currency?.symbol ?? currencyCode,
        rateFromUsd: parsedRate,
      });
    }

    onSettle({
      status: "settled",
      currencyCode,
      amount: parsedAmount,
      rate: isUsd ? undefined : { rateFromUsd: parsedRate, usdValue: usdValue! },
      paidAt: date,
      note: note.trim() || undefined,
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="settle-dialog-title">
        <header className="dialog-header">
          <div>
            <h2 id="settle-dialog-title">تسوية تكلفة Starlink</h2>
            <p dir="ltr">شحنة عليه {entry.amount} {entry.currency}</p>
            <p>هذا لا يُسدد دين الزبون - رصيده يبقى كما هو حتى تُسجَّل دفعة منفصلة له.</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="إغلاق">×</button>
        </header>

        <form className="account-form" onSubmit={submit}>
          <label className="form-field">
            <span>العملة</span>
            <select
              className="search-input"
              value={showNewCurrency ? "__new__" : currencyCode}
              onChange={(e) => handleCurrencyChange(e.target.value)}
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
            <input className="search-input" type="number" lang="en" min="0" step="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>

          {!isUsd && (
            <label className="form-field">
              <span>سعر الصرف (1 USD = ؟ {currencyCode})</span>
              <input className="search-input" type="number" lang="en" min="0" step="0.0001" dir="ltr" value={rate} onChange={(e) => setRate(e.target.value)} />
            </label>
          )}

          <div className="form-field">
            <span>القيمة بالدولار</span>
            <strong dir="ltr">{usdValue !== undefined ? `${formatAmount(usdValue)} USD` : "—"}</strong>
          </div>

          <label className="form-field">
            <span>تاريخ الدفع</span>
            <DateInput className="search-input"  value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <label className="form-field form-wide">
            <span>ملاحظة (اختياري)</span>
            <input className="search-input" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          {error && <div className="account-card-alert form-wide">{error}</div>}

          <div className="dialog-actions form-wide">
            <button className="dialog-secondary" type="button" onClick={onClose}>إلغاء</button>
            <button className="dialog-primary" type="submit">تأكيد الدفع لـ Starlink</button>
          </div>
        </form>
      </section>
    </div>
  );
}
