"use client";

import { useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { PartySheet } from "./AccountsSection";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS } from "@/lib/ledgerStore";
import { setTravelPrice } from "@/lib/travelRegistration";

/** 💰 What he charged for a device's travel registration (shown in «تم توثيقها»). */
export function TravelPriceSheet({
  account,
  onPatch,
  onClose,
}: {
  account: StarlinkAccountSummary;
  onPatch: (patch: Partial<StarlinkAccountSummary>) => void;
  onClose: () => void;
}) {
  const current = account.travelRegistrationPrice;
  const [amount, setAmount] = useState(current ? String(current.amount) : "");
  const [currency, setCurrency] = useState(current?.currency ?? "MRU");
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
        <div className="settings-actions">
          <button
            type="button"
            className="dialog-primary"
            disabled={!(value > 0)}
            onClick={() => {
              onPatch(setTravelPrice(value, currency));
              onClose();
            }}
          >
            💾 حفظ
          </button>
          {current && (
            <button
              type="button"
              className="text-action"
              onClick={() => {
                onPatch(setTravelPrice(null, currency));
                onClose();
              }}
            >
              حذف السعر
            </button>
          )}
        </div>
      </div>
    </PartySheet>
  );
}
