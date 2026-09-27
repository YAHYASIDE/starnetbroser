"use client";

import { useMemo, useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "@/lib/clientStore";
import { formatAmount } from "@/lib/formatAmount";
import { LEDGER_CURRENCY_LABELS, LedgerByAccount, LedgerCurrency } from "@/lib/ledgerStore";
import { listPaymentTargets } from "@/lib/paymentTargets";
import { PartySheet } from "./AccountsSection";

interface Props {
  accounts: StarlinkAccountSummary[];
  clientStore: ClientStore;
  ledgerStore: LedgerByAccount;
  onAddDevice: () => void;
  /** Opens the chosen device's ledger ready for a payment ("له"). */
  onPayment: (account: StarlinkAccountSummary) => void;
}

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

/** The home page's floating "+" (bottom corner, above the nav bar): جهاز جديد and دفعة من زبون. */
export function HomeFab({ accounts, clientStore, ledgerStore, onAddDevice, onPayment }: Props) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const targets = useMemo(
    () => (picking ? listPaymentTargets(accounts, clientStore, ledgerStore, query) : []),
    [picking, accounts, clientStore, ledgerStore, query],
  );

  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <>
      {open && <div className="home-fab-layer" role="presentation" onClick={() => setOpen(false)} />}
      <div className={`home-fab${open ? " home-fab-open" : ""}`}>
        {open && (
          <ul className="home-fab-menu" role="menu" aria-label="إضافة جديد">
            <li>
              <button type="button" role="menuitem" className="home-fab-item home-fab-item-payment" onClick={() => choose(() => { setQuery(""); setPicking(true); })}>
                <span className="home-fab-item-label">دفعة من زبون</span>
                <span className="home-fab-item-icon" aria-hidden="true">💵</span>
              </button>
            </li>
            <li>
              <button type="button" role="menuitem" className="home-fab-item home-fab-item-device" onClick={() => choose(onAddDevice)}>
                <span className="home-fab-item-label">جهاز جديد</span>
                <span className="home-fab-item-icon" aria-hidden="true">📡</span>
              </button>
            </li>
          </ul>
        )}
        <button
          type="button"
          className="home-fab-button"
          aria-label={open ? "إغلاق" : "إضافة جديد"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>

      {picking && (
        <PartySheet title="💵 دفعة من زبون - اختر الجهاز" onClose={() => setPicking(false)}>
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
                    onClick={() => {
                      setPicking(false);
                      onPayment(account);
                    }}
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
      )}
    </>
  );
}
