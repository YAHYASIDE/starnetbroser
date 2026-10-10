"use client";

import { useMemo, useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "@/lib/clientStore";
import { formatAmount } from "@/lib/formatAmount";
import { LEDGER_CURRENCY_LABELS, LedgerByAccount, LedgerCurrency } from "@/lib/ledgerStore";
import { listPaymentTargets } from "@/lib/paymentTargets";
import { PartySheet } from "./AccountsSection";

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

/** The home page's floating "+": one tap starts a new device. */
export function HomeFab({ onAddDevice }: { onAddDevice: () => void }) {
  return (
    <div className="home-fab">
      <button type="button" className="home-fab-button" aria-label="إضافة جهاز جديد" title="إضافة جهاز جديد" onClick={onAddDevice}>
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}

/** "💵 دفعة من زبون": pick the device (search by device, customer or phone), then pay it. */
export function PaymentPickerSheet({
  accounts,
  clientStore,
  ledgerStore,
  onPick,
  onClose,
}: {
  accounts: StarlinkAccountSummary[];
  clientStore: ClientStore;
  ledgerStore: LedgerByAccount;
  onPick: (account: StarlinkAccountSummary) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const targets = useMemo(() => listPaymentTargets(accounts, clientStore, ledgerStore, query), [accounts, clientStore, ledgerStore, query]);
  return (
    <PartySheet title="💵 دفعة من زبون - اختر الجهاز" onClose={onClose}>
      <input
        className="search-input payment-search"
        placeholder="ابحث بالجهاز أو الزبون أو الهاتف"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {targets.length === 0 ? (
        <p className="party-empty">{query ? "لا توجد نتائج مطابقة." : "لا توجد أجهزة بعد."}</p>
      ) : (
        <ul className="payment-targets">
          {targets.map(({ account, clientName, owed }) => (
            <li key={account.id}>
              <button
                type="button"
                className="payment-target"
                onClick={() => onPick(account)}
              >
                <span className="payment-target-names">
                  <strong>{account.name}</strong>
                  <span>{clientName ?? "بدون زبون"}</span>
                </span>
                {Object.keys(owed).length === 0 ? (
                  <span className="payment-target-clear">مسدَّد ✓</span>
                ) : (
                  <span className="payment-target-due">
                    عليه{" "}
                    {Object.entries(owed).map(([code, v], i) => (
                      <span key={code}>
                        {i > 0 && " · "}
                        <bdi dir="ltr">{formatAmount(v)}</bdi> {currencyLabel(code)}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </PartySheet>
  );
}
