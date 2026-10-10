"use client";

import { useMemo, useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { PartySheet } from "./AccountsSection";
import { CurrencyBanner, useCurrencyGuard } from "./CurrencyGuard";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS } from "@/lib/ledgerStore";
import { loadExpectedCurrency } from "@/lib/partyCurrencyData";

/** 💰 What he charged for a device's travel registration (shown in «تم توثيقها»). Saving it also
 * puts the debt on the device's owner (HomeView → travelRegistration.ts `applyTravelFee`). */
export function TravelPriceSheet({
  account,
  onSave,
  onClose,
}: {
  account: StarlinkAccountSummary;
  /** `amount` null = «حذف السعر»; `currencyConfirmed` = he kept a currency other than the owner's. */
  onSave: (amount: number | null, currency: string, currencyConfirmed: boolean) => void;
  onClose: () => void;
}) {
  const current = account.travelRegistrationPrice;
  const expected = useMemo(() => loadExpectedCurrency({ accountId: account.id }), [account.id]);
  const guard = useCurrencyGuard(expected);
  const [amount, setAmount] = useState(current ? String(current.amount) : "");
  const [currency, setCurrency] = useState(current?.currency ?? expected?.currency ?? "MRU");
  const value = Number(amount.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(",", "."));

  return (
    <PartySheet title={`💰 سعر التوثيق - ${account.name}`} onClose={onClose}>
      <div className="renewal-lock">
        <label className="renewal-lock-day">
          <span>المبلغ</span>
          <input className="search-input" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="renewal-lock-day">
          <span>العملة</span>
          <select className="search-input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {LEDGER_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {(LEDGER_CURRENCY_LABELS as Record<string, string>)[code] ?? code}
              </option>
            ))}
          </select>
        </label>
        <CurrencyBanner expected={expected} chosen={currency} amount={value > 0 ? value : undefined} />
        <p className="settings-hint">🧾 يُسجَّل «عليه» على صاحب الجهاز في كشفه (🛂 توثيق السفر) - ليس تجديدًا ولا يُحسب ربح شحنة.</p>
        <div className="settings-actions">
          <button
            type="button"
            className="dialog-primary"
            disabled={!(value > 0)}
            onClick={() =>
              guard.ask(
                currency,
                value,
                (confirmed) => {
                  onSave(value, currency, confirmed);
                  onClose();
                },
                (next) => setCurrency(next),
              )
            }
          >
            💾 حفظ
          </button>
          {current && (
            <button
              type="button"
              className="text-action"
              onClick={() => {
                onSave(null, currency, false);
                onClose();
              }}
            >
              حذف السعر
            </button>
          )}
        </div>
      </div>
      {guard.modal}
    </PartySheet>
  );
}
