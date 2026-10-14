"use client";

import { useMemo, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";
import { Client, ClientStore, searchClients } from "@/lib/clientStore";
import { BalanceByCurrency, computeBalanceByCurrency, getAccountEntries, LedgerByAccount, LedgerCurrency, LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS } from "@/lib/ledgerStore";
import { formatAmount } from "@/lib/formatAmount";

interface Props {
  clientStore: ClientStore;
  /** Every account in the app - filtered per client below (account.clientId === client.id), never
   * pre-filtered by the caller since a client's own device count decides this row's action. */
  accounts: StarlinkAccountSummary[];
  ledgerStore: LedgerByAccount;
  onClose: () => void;
  /** A client with exactly one linked device jumps straight into that device's own LedgerDialog -
   * the same "إضافة حركة" form used from the account card itself, just one tap away from here. */
  onOpenLedger: (account: StarlinkAccountSummary) => void;
  /** A client with zero or several linked devices opens the existing ClientDialog instead, where
   * each device's own statement/ledger stays reachable - there's no single device here to jump
   * into directly. */
  onOpenClient: (client: Client) => void;
}

/**
 * "كل العملاء" - a flat, searchable list of every client with their aggregate balance across all
 * linked devices (never per-device here, see ClientDialog for that breakdown), and one tap to
 * either add a transaction directly (single-device client) or open the full client card.
 */
export function ClientsOverviewDialog({ clientStore, accounts, ledgerStore, onClose, onOpenLedger, onOpenClient }: Props) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => searchClients(clientStore, query), [clientStore, query]);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="clients-overview-title">
        <header className="dialog-header">
          <div>
            <h2 id="clients-overview-title">العملاء</h2>
            <p>{Object.keys(clientStore).length} زبون - المبلغ المستحق من كل زبون عبر كل أجهزته</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="إغلاق">×</button>
        </header>

        <input
          className="search-input"
          placeholder="ابحث عن زبون بالاسم أو الهاتف"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <ul className="ledger-entry-list">
          {matches.length === 0 && <li className="ledger-entry-empty">لا يوجد زبائن بعد</li>}
          {matches.map((client) => {
            const devices = accounts.filter((a) => a.clientId === client.id);
            const balances: BalanceByCurrency = {};
            for (const device of devices) {
              const deviceBalances = computeBalanceByCurrency(getAccountEntries(ledgerStore, device.id));
              for (const currency of LEDGER_CURRENCIES) {
                const b = deviceBalances[currency];
                if (b !== undefined) balances[currency] = (balances[currency] ?? 0) + b;
              }
            }
            const balanceRows = LEDGER_CURRENCIES.map((c) => ({ c, balance: balances[c] })).filter(
              (row): row is { c: LedgerCurrency; balance: number } => row.balance !== undefined && Math.abs(row.balance) > 0.0001,
            );

            return (
              <li key={client.id} className="ledger-entry-row">
                <div className="ledger-entry-row-top">
                  <span className="ledger-entry-amount">{client.name}</span>
                  <button
                    className="text-action"
                    type="button"
                    onClick={() => (devices.length === 1 ? onOpenLedger(devices[0]) : onOpenClient(client))}
                  >
                    {devices.length === 1 ? "إضافة حركة" : "فتح البطاقة"}
                  </button>
                </div>
                <div className="ledger-entry-row-bottom">
                  {balanceRows.length === 0 ? (
                    <span className="badge badge-green">لا يوجد مستحق</span>
                  ) : (
                    balanceRows.map(({ c, balance }) =>
                      balance > 0 ? (
                        <span key={c} className="badge badge-red" dir="ltr">عليه {formatAmount(balance)} {LEDGER_CURRENCY_LABELS[c]}</span>
                      ) : (
                        <span key={c} className="badge badge-green" dir="ltr">له {formatAmount(-balance)} {LEDGER_CURRENCY_LABELS[c]}</span>
                      ),
                    )
                  )}
                  {devices.length === 0 && <span className="badge badge-gray">لا يوجد جهاز مرتبط</span>}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="dialog-actions form-wide">
          <button className="dialog-primary dialog-done" type="button" onClick={onClose}>تم</button>
        </div>
      </section>
    </div>
  );
}
