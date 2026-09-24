"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StarlinkAccountSummary } from "@starnet/shared";
import { demoAccounts } from "@/lib/demoData";
import { isDemoMode, isLoggedIn } from "@/lib/settingsStore";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { listAccounts } from "@/lib/apiClient";
import { LEDGER_CURRENCY_LABELS, LedgerByAccount, LedgerCurrency, loadLedgerStore } from "@/lib/ledgerStore";
import { ClientStore, loadClientStore } from "@/lib/clientStore";
import { InvoiceList, loadInvoices } from "@/lib/invoiceStore";
import { loadStoreItems, loadStoreTransactions, StoreItemRegistry, StoreTransactionList } from "@/lib/storeStore";
import {
  computeDeviceDebtReminders,
  computeLowStockReminders,
  computeRenewalReminders,
  computeStoreDebtReminders,
} from "@/lib/reminders";
import { daysRemainingLabel } from "@/lib/date";
import { formatAmount } from "@/lib/formatAmount";
import { buildBalanceReminderMessage, buildExpiryReminderMessage, buildStoreDebtReminderMessage, buildWhatsAppLink } from "@/lib/whatsapp";

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

function urgencyClass(daysRemaining: number): string {
  return daysRemaining < 0 ? "date-expired" : daysRemaining <= 3 ? "date-warning" : "date-safe";
}

export default function RemindersPage() {
  const [accounts, setAccounts] = useState<StarlinkAccountSummary[]>(demoAccounts);
  const [ledgerStore, setLedgerStore] = useState<LedgerByAccount>({});
  const [clientStore, setClientStore] = useState<ClientStore>({});
  const [invoices, setInvoices] = useState<InvoiceList>([]);
  const [storeItems, setStoreItems] = useState<StoreItemRegistry>({});
  const [storeTransactions, setStoreTransactions] = useState<StoreTransactionList>([]);

  useEffect(() => {
    setLedgerStore(loadLedgerStore());
    setClientStore(loadClientStore());
    setInvoices(loadInvoices());
    setStoreItems(loadStoreItems());
    setStoreTransactions(loadStoreTransactions());
    if (isDemoMode()) {
      setAccounts(loadDemoAccounts(demoAccounts));
      return;
    }
    if (!isLoggedIn()) return;
    listAccounts().then(setAccounts).catch(() => {});
  }, []);

  const renewalReminders = useMemo(() => computeRenewalReminders(accounts), [accounts]);
  const deviceDebtReminders = useMemo(() => computeDeviceDebtReminders(accounts, ledgerStore), [accounts, ledgerStore]);
  const storeDebtReminders = useMemo(() => computeStoreDebtReminders(clientStore, invoices), [clientStore, invoices]);
  const lowStockReminders = useMemo(
    () => computeLowStockReminders(storeItems, storeTransactions),
    [storeItems, storeTransactions],
  );

  return (
    <main className="home">
      <div className="session-header">
        <Link href="/" className="btn-link">
          ← رجوع
        </Link>
        <h1 className="section-title">التذكيرات</h1>
      </div>

      <section className="section">
        <h2 className="report-section-title">تجديدات مستحقة ({renewalReminders.length})</h2>
        {renewalReminders.length === 0 ? (
          <p className="empty-state">لا توجد تجديدات مستحقة قريبًا 👍</p>
        ) : (
          <ul className="ledger-entry-list">
            {renewalReminders.map(({ account, daysRemaining }) => {
              const waLink = buildWhatsAppLink(account.phone, buildExpiryReminderMessage(account.name));
              const label = daysRemainingLabel(account.rechargeDate || account.standbyDate || "");
              return (
                <li key={account.id} className="ledger-entry-row">
                  <div className="ledger-entry-row-top">
                    <span className="store-item-name">{account.name}</span>
                    {label && <span className={`date-status ${urgencyClass(daysRemaining)}`}>{label}</span>}
                  </div>
                  <div className="ledger-entry-row-bottom">
                    {waLink ? (
                      <a className="text-action" href={waLink} target="_blank" rel="noreferrer">
                        إرسال تذكير عبر واتساب
                      </a>
                    ) : (
                      <span className="settings-hint">لا يوجد رقم واتساب مسجّل لهذا الحساب</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="report-section-title">ديون الأجهزة (اشتراكات Starlink) ({deviceDebtReminders.length})</h2>
        {deviceDebtReminders.length === 0 ? (
          <p className="empty-state">لا توجد ديون مستحقة على الأجهزة 👍</p>
        ) : (
          <ul className="ledger-entry-list">
            {deviceDebtReminders.map(({ account, balances }) => {
              const waLink = buildWhatsAppLink(account.phone, buildBalanceReminderMessage(account.name, ledgerStore[account.id] ?? []));
              const currencies = Object.keys(balances);
              return (
                <li key={account.id} className="ledger-entry-row">
                  <div className="ledger-entry-row-top">
                    <span className="store-item-name">{account.name}</span>
                    <div className="store-summary-value-stack">
                      {currencies.map((c) => (
                        <span key={c} className="badge badge-red" dir="ltr">
                          {formatAmount(balances[c as LedgerCurrency]!)} {currencyLabel(c)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="ledger-entry-row-bottom">
                    {waLink ? (
                      <a className="text-action" href={waLink} target="_blank" rel="noreferrer">
                        إرسال مطالبة عبر واتساب
                      </a>
                    ) : (
                      <span className="settings-hint">لا يوجد رقم واتساب مسجّل لهذا الحساب</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="report-section-title">ديون المتجر ({storeDebtReminders.length})</h2>
        {storeDebtReminders.length === 0 ? (
          <p className="empty-state">لا توجد ديون مستحقة في المتجر 👍</p>
        ) : (
          <ul className="ledger-entry-list">
            {storeDebtReminders.map(({ client, balances }) => {
              const waLink = buildWhatsAppLink(client.phone, buildStoreDebtReminderMessage(client.name, balances));
              const currencies = Object.keys(balances);
              return (
                <li key={client.id} className="ledger-entry-row">
                  <div className="ledger-entry-row-top">
                    <span className="store-item-name">{client.name}</span>
                    <div className="store-summary-value-stack">
                      {currencies.map((c) => (
                        <span key={c} className="badge badge-red" dir="ltr">
                          {formatAmount(balances[c]!)} {currencyLabel(c)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="ledger-entry-row-bottom">
                    {waLink ? (
                      <a className="text-action" href={waLink} target="_blank" rel="noreferrer">
                        إرسال مطالبة عبر واتساب
                      </a>
                    ) : (
                      <span className="settings-hint">لا يوجد رقم واتساب مسجّل لهذا الزبون</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="report-section-title">مواد قاربت على النفاد ({lowStockReminders.length})</h2>
        {lowStockReminders.length === 0 ? (
          <p className="empty-state">لا توجد مواد قاربت على النفاد 👍</p>
        ) : (
          <ul className="report-line-list">
            {lowStockReminders.map(({ item, stock }) => (
              <li key={item.id} className="report-line">
                <span>{item.name}</span>
                <strong dir="ltr" className="report-line-negative">
                  {formatAmount(stock)} {item.unit}
                </strong>
              </li>
            ))}
          </ul>
        )}
        <p className="settings-hint">
          <Link href="/store" className="btn-link">
            إدارة المخزون في المتجر ←
          </Link>
        </p>
      </section>
    </main>
  );
}
