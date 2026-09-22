"use client";

import { FormEvent, useState } from "react";
import { Currency, CurrencyStore, getCurrency, UpsertCurrencyInput } from "@/lib/currencyStore";
import { formatAmount } from "@/lib/formatAmount";
import { LEDGER_CURRENCY_LABELS, LedgerEntry, RateSnapshot } from "@/lib/ledgerStore";

interface Props {
  /** Must be isIncompletePaymentRateEntry(entry) === true - a "credit" entry whose currency isn't
   * USD but has no paymentRate yet. */
  entry: LedgerEntry;
  currencyStore: CurrencyStore;
  onUpsertCurrency: (input: UpsertCurrencyInput) => Currency;
  onClose: () => void;
  /** Applies the paymentRate via ledgerStore's existing updateEntry - never touches this entry's
   * own kind/amount/currency/date/note/email/paymentMethod. */
  onComplete: (paymentRate: RateSnapshot) => void;
}

/**
 * "استكمال سعر الصرف" for an old, non-USD "له" (payment) entry recorded before paymentRate
 * existed. Without this rate the payment's USD value is unknown, not zero - accountingStore.ts
 * flags every total that depends on it as incomplete (hasIncompletePaymentRates) rather than
 * silently excluding the payment. Resolving that requires exactly one explicit, validated rate -
 * never guessed at with today's registry rate (rule XV) - which is then locked onto this entry
 * exactly like a freshly-recorded payment's own paymentRate.
 */
export function PaymentRateCompletionDialog({ entry, currencyStore, onUpsertCurrency, onClose, onComplete }: Props) {
  const [rateInput, setRateInput] = useState(String(getCurrency(currencyStore, entry.currency)?.rateFromUsd ?? ""));
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedRate = Number(rateInput);
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      setError("أدخل سعر صرف صحيح أكبر من صفر");
      return;
    }
    setError(null);

    const existing = getCurrency(currencyStore, entry.currency);
    onUpsertCurrency({
      code: entry.currency,
      name: existing?.name ?? LEDGER_CURRENCY_LABELS[entry.currency],
      symbol: existing?.symbol ?? entry.currency,
      rateFromUsd: parsedRate,
    });

    onComplete({ rateFromUsd: parsedRate, usdValue: entry.amount / parsedRate });
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-rate-completion-title">
        <header className="dialog-header">
          <div>
            <h2 id="payment-rate-completion-title">استكمال سعر الصرف</h2>
            <p dir="ltr">دفعة له {formatAmount(entry.amount)} {entry.currency} - {entry.date}</p>
            <p>لن يتغيّر مبلغ هذه الدفعة أو تاريخها - هذا يضيف فقط سعر الصرف المقفل الناقص، لاحتساب قيمتها بالدولار ضمن المبلغ المحصَّل والتدفق النقدي الفعلي.</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="إغلاق">×</button>
        </header>

        <form className="account-form" onSubmit={submit}>
          <label className="form-field form-wide">
            <span>سعر صرف الدفعة (1 USD = ؟ {entry.currency})</span>
            <input
              className="search-input"
              type="number"
              min="0"
              step="0.0001"
              dir="ltr"
              autoFocus
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
            />
          </label>

          {error && <div className="account-card-alert form-wide">{error}</div>}

          <div className="dialog-actions form-wide">
            <button className="dialog-secondary" type="button" onClick={onClose}>إلغاء</button>
            <button className="dialog-primary" type="submit">حفظ السعر</button>
          </div>
        </form>
      </section>
    </div>
  );
}
