"use client";

import { useState, type ReactNode } from "react";
import { formatAmount } from "@/lib/formatAmount";
import { LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "@/lib/ledgerStore";
import { currencySourceText, currencyWarning, isCurrencyMismatch, isLedgerCurrency, type ExpectedCurrency } from "@/lib/partyCurrency";

/** 💱 The red line inside a form while the chosen currency isn't the rep's / customer's. */
export function CurrencyBanner({ expected, chosen, amount }: { expected?: ExpectedCurrency; chosen: string; amount?: number }) {
  if (!expected || !isLedgerCurrency(chosen) || !isCurrencyMismatch(expected, chosen)) return null;
  return (
    <div className="cur-guard-banner form-wide" role="alert">
      <strong>{currencyWarning(expected, chosen, amount)}</strong>
      <span>{currencySourceText(expected)}</span>
    </div>
  );
}

/** 🛑 «نافذة توقفك»: `ask` saves straight away when the currency is his; otherwise it opens a red
 * window first - «غيّر إلى X» switches the form, «متأكد، سجّل بـY» saves with `confirmed` = true. */
export function useCurrencyGuard(expected: ExpectedCurrency | undefined) {
  const [pending, setPending] = useState<{ chosen: LedgerCurrency; amount: number; proceed: () => void; switchTo?: (c: LedgerCurrency) => void } | null>(null);

  function ask(chosen: string, amount: number, proceed: (confirmed: boolean) => void, switchTo?: (currency: LedgerCurrency) => void): void {
    if (!expected || !isLedgerCurrency(chosen) || !isCurrencyMismatch(expected, chosen)) {
      proceed(false);
      return;
    }
    setPending({ chosen, amount, proceed: () => proceed(true), switchTo });
  }

  const modal: ReactNode =
    pending && expected ? (
      <div className="dialog-backdrop cur-guard-backdrop" role="presentation">
        <section className="cur-guard-modal" role="alertdialog" aria-modal="true" aria-labelledby="cur-guard-title">
          <div className="cur-guard-icon" aria-hidden="true">💱⚠️</div>
          <h2 id="cur-guard-title">عملة مختلفة!</h2>
          <p className="cur-guard-main">{currencyWarning(expected, pending.chosen, pending.amount)}</p>
          <p className="cur-guard-source">{currencySourceText(expected)}</p>
          <p className="cur-guard-note">العملات لا تُحوَّل تلقائيًا: ستبقى هذه العملية {LEDGER_CURRENCY_LABELS[pending.chosen]} في رصيده.</p>
          <div className="cur-guard-actions">
            {pending.switchTo && (
              <button
                type="button"
                className="dialog-primary"
                onClick={() => {
                  pending.switchTo!(expected.currency);
                  setPending(null);
                }}
              >
                غيّر إلى {LEDGER_CURRENCY_LABELS[expected.currency]}
              </button>
            )}
            <button
              type="button"
              className="cur-guard-confirm"
              onClick={() => {
                const go = pending.proceed;
                setPending(null);
                go();
              }}
            >
              متأكد، سجّل <bdi dir="ltr">{formatAmount(pending.amount)}</bdi> {LEDGER_CURRENCY_LABELS[pending.chosen]}
            </button>
            <button type="button" className="dialog-secondary" onClick={() => setPending(null)}>
              رجوع
            </button>
          </div>
        </section>
      </div>
    ) : null;

  return { ask, modal };
}

/** «⚠️ عملة مختلفة» on a saved operation in another currency than its rep's / customer's. */
export function CurrencyBadge({ expected, entry }: { expected?: ExpectedCurrency; entry: { currency: string; currencyConfirmed?: boolean } }) {
  if (entry.currencyConfirmed || !isCurrencyMismatch(expected, entry.currency)) return null;
  return (
    <span className="cur-badge" title={expected ? currencySourceText(expected) : undefined}>
      ⚠️ عملة مختلفة
    </span>
  );
}

/** «💱 عملته»: automatic (from most of his operations) or a fixed currency - on a rep or customer. */
export function DefaultCurrencyField({ value, auto, onChange }: { value?: LedgerCurrency; auto?: LedgerCurrency; onChange: (next: LedgerCurrency | undefined) => void }) {
  return (
    <label className="form-field cur-default-field">
      <span>💱 عملته (ينبّهك التطبيق إن سجّلت له بعملة أخرى)</span>
      <select className="search-input" value={value ?? ""} onChange={(e) => onChange(isLedgerCurrency(e.target.value) ? e.target.value : undefined)}>
        <option value="">تلقائي{auto ? ` (${LEDGER_CURRENCY_LABELS[auto]} - من أغلب عملياته)` : " - من أغلب عملياته"}</option>
        {(["MRU", "SIFA", "USD"] as LedgerCurrency[]).map((c) => (
          <option key={c} value={c}>
            {LEDGER_CURRENCY_LABELS[c]}
          </option>
        ))}
      </select>
    </label>
  );
}
