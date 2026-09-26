"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { confirmClosedMonthChange } from "@/lib/monthClosing";
import { StarlinkAccountSummary } from "@starnet/shared";
import { DateInput } from "@/components/DateInput";
import { PartySheet } from "@/components/AccountsSection";
import { loadCashEntries, saveCashEntries } from "@/lib/cashStore";
import { ClientStore, getClient, loadClientStore } from "@/lib/clientStore";
import { CurrencyStore, getCurrency, loadCurrencyStore } from "@/lib/currencyStore";
import { demoAccounts } from "@/lib/demoData";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { formatAmount } from "@/lib/formatAmount";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, LedgerByAccount, LedgerCurrency, loadLedgerStore, saveLedgerStore } from "@/lib/ledgerStore";
import { listAccounts } from "@/lib/apiClient";
import { isDemoMode, isLoggedIn } from "@/lib/settingsStore";
import { getRepresentative, loadRepresentativeStore, RepresentativeStore } from "@/lib/repStore";
import {
  buildCardStatement,
  cardShortfallForSuspended,
  CardTopUpList,
  deleteCardTopUp,
  listCardPayments,
  listOpenShipmentDebts,
  listSuspendedWithDebt,
  loadCardTopUps,
  OpenShipmentDebt,
  postCardTopUpToCash,
  recordCardTopUp,
  removeCardTopUpCash,
  saveCardTopUps,
  settleShipments,
  totalOpenDebtUsd,
} from "@/lib/starlinkDebt";

function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysSince(date: string): number {
  const then = new Date(date.replace(/\//g, "-"));
  if (Number.isNaN(then.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - then.getTime()) / 86400000));
}

function usd(value: number): string {
  return `${value < 0 ? "-" : ""}${formatAmount(Math.abs(value))} $`;
}

/**
 * "ستارلينك والبطاقة": what STAR NET currently owes Starlink (every open D, per device - we are
 * always borrowing the current month), paying it from the "كاش" card (one device or several at
 * once), and the card's own balance and statement. Paying a D is the moment its profit and the
 * representative's share become real (dated that day).
 */
export default function StarlinkPage() {
  const [ledgerStore, setLedgerStore] = useState<LedgerByAccount>({});
  const [accounts, setAccounts] = useState<StarlinkAccountSummary[]>(demoAccounts);
  const [clientStore, setClientStore] = useState<ClientStore>({});
  const [repStore, setRepStore] = useState<RepresentativeStore>({});
  const [currencyStore, setCurrencyStore] = useState<CurrencyStore>({});
  const [topUps, setTopUps] = useState<CardTopUpList>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<"pay" | "topup" | null>(null);
  const [payItems, setPayItems] = useState<OpenShipmentDebt[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setLedgerStore(loadLedgerStore());
    setClientStore(loadClientStore());
    setRepStore(loadRepresentativeStore());
    setCurrencyStore(loadCurrencyStore());
    setTopUps(loadCardTopUps());
    if (isDemoMode()) {
      setAccounts(loadDemoAccounts(demoAccounts));
      return;
    }
    if (!isLoggedIn()) return;
    listAccounts().then(setAccounts).catch(() => {});
  }, []);

  const mruRate = getCurrency(currencyStore, "MRU")?.rateFromUsd;
  const sifaRate = getCurrency(currencyStore, "SIFA")?.rateFromUsd;
  const debts = useMemo(() => listOpenShipmentDebts(ledgerStore), [ledgerStore]);
  const totalDebt = totalOpenDebtUsd(debts);
  const suspended = useMemo(() => listSuspendedWithDebt(accounts, debts), [accounts, debts]);
  const card = useMemo(() => buildCardStatement(topUps, listCardPayments(ledgerStore)), [topUps, ledgerStore]);
  const suspendedShortfall = cardShortfallForSuspended(suspended, card.balanceUsd);
  const selectedDebts = debts.filter((d) => selected.has(d.entry.id));

  const account = (id: string) => accounts.find((a) => a.id === id);
  const debtKey = (d: OpenShipmentDebt) => d.entry.id;

  function toggle(d: OpenShipmentDebt) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(debtKey(d))) next.delete(debtKey(d));
      else next.add(debtKey(d));
      return next;
    });
  }

  function openPay(items: OpenShipmentDebt[]) {
    if (items.length === 0) return;
    setPayItems(items);
    setSheet("pay");
  }

  function pay(date: string, fromCard: boolean) {
    if (!confirmClosedMonthChange([date])) return;
    const next = settleShipments(
      ledgerStore,
      payItems.map((d) => ({ accountId: d.accountId, entryId: d.entry.id })),
      { date, profitRates: { MRU: mruRate, SIFA: sifaRate }, fromCard },
    );
    setLedgerStore(next);
    saveLedgerStore(next);
    setSelected(new Set());
    setSheet(null);
    setToast(`✓ تم تسديد ${payItems.length} جهاز بـ ${usd(totalOpenDebtUsd(payItems))} - الربح وحصص المندوبين نزلت بتاريخ ${date}`);
  }

  function addTopUp(input: { amountUsd: number; paidAmount: number; paidCurrency: string; date: string; note: string }): string | null {
    const result = recordCardTopUp(topUps, input);
    if (!result.ok) return result.message;
    setTopUps(result.list);
    saveCardTopUps(result.list);
    saveCashEntries(postCardTopUpToCash(loadCashEntries(), result.topUp));
    setSheet(null);
    return null;
  }

  function removeTopUp(id: string) {
    if (!window.confirm("حذف عملية الشحن هذه؟ يُحذف قيدها من الصندوق أيضًا.")) return;
    const next = deleteCardTopUp(topUps, id);
    setTopUps(next);
    saveCardTopUps(next);
    saveCashEntries(removeCardTopUpCash(loadCashEntries(), id));
  }

  return (
    <main className="home">
      <div className="session-header">
        <Link href="/" className="btn-link">
          ← رجوع
        </Link>
        <h1 className="section-title">ستارلينك والبطاقة</h1>
      </div>

      {toast && (
        <button type="button" className="sl-toast" onClick={() => setToast(null)}>
          {toast}
        </button>
      )}

      <section className="sl-summary">
        <div className="sl-summary-item sl-summary-debt">
          <span>المتسلَّف عليه (عليّ لستارلينك)</span>
          <strong dir="ltr">{usd(totalDebt)}</strong>
          <small>{debts.length} جهاز عليه D</small>
        </div>
        <div className={`sl-summary-item sl-summary-card${card.balanceUsd < totalDebt ? " sl-summary-short" : ""}`}>
          <span>💳 رصيد بطاقة كاش</span>
          <strong dir="ltr">{usd(card.balanceUsd)}</strong>
          <small>{card.balanceUsd < totalDebt ? `ينقصها ${usd(totalDebt - card.balanceUsd)} لتسديد الكل` : "يكفي لتسديد الكل"}</small>
        </div>
      </section>

      {suspended.length > 0 && (
        <section className="section sl-alert">
          <h2 className="sl-title">⚠️ أجهزة توقفت وعليها D - ادفع لستارلينك الآن</h2>
          {suspendedShortfall > 0 && (
            <p className="sl-card-short">
              💳 رصيد البطاقة لا يكفي لها - ينقصها <bdi dir="ltr">{usd(suspendedShortfall)}</bdi>. اشحن البطاقة من الأسفل.
            </p>
          )}
          <ul className="sl-list">
            {suspended.map((s) => (
              <li key={s.account.id} className="sl-row sl-row-alert">
                <div className="sl-row-main">
                  <strong>{s.account.name}</strong>
                  <span>{getClient(clientStore, s.account.clientId)?.name ?? "بدون زبون"} · متوقف بسبب عدم دفع الفواتير</span>
                </div>
                <div className="sl-row-side">
                  <strong dir="ltr">{usd(s.costUsd)}</strong>
                  <button type="button" className="dialog-primary sl-pay-one" onClick={() => openPay(s.debts)}>
                    سدّدت
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <div className="sl-head">
          <h2 className="sl-title">📋 الأجهزة المتسلَّف عليها</h2>
          {debts.length > 0 && (
            <button
              type="button"
              className="text-action"
              onClick={() => setSelected(selected.size === debts.length ? new Set() : new Set(debts.map(debtKey)))}
            >
              {selected.size === debts.length ? "إلغاء التحديد" : "تحديد الكل"}
            </button>
          )}
        </div>
        {debts.length === 0 ? (
          <p className="empty-state">لا يوجد أي جهاز عليه D - لا شيء عليك لستارلينك الآن.</p>
        ) : (
          <ul className="sl-list">
            {debts.map((d) => {
              const acc = account(d.accountId);
              const client = getClient(clientStore, acc?.clientId)?.name;
              const rep = getRepresentative(repStore, d.entry.representativeId);
              const isSelected = selected.has(debtKey(d));
              return (
                <li key={debtKey(d)} className={`sl-row${isSelected ? " sl-row-selected" : ""}`}>
                  <label className="sl-check">
                    <input type="checkbox" checked={isSelected} onChange={() => toggle(d)} aria-label={`تحديد ${acc?.name ?? ""}`} />
                  </label>
                  <div className="sl-row-main">
                    <strong>
                      <span className="sl-d">D</span> {acc?.name ?? "جهاز محذوف"}
                      {acc?.serviceStatus === "suspended" && <span className="sl-stopped">متوقف</span>}
                    </strong>
                    <span>
                      {client ?? "بدون زبون"}
                      {rep ? ` · 🤝 ${rep.name}` : ""}
                    </span>
                    <span className="sl-meta">
                      منذ <bdi dir="ltr">{d.entry.date}</bdi> ({daysSince(d.entry.date)} يوم)
                      {d.expectedProfitUsd !== undefined && (
                        <>
                          {" "}· ربح متوقع{" "}
                          <bdi dir="ltr">
                            {mruRate ? `${formatAmount(Math.round(d.expectedProfitUsd * mruRate))} أوقية` : usd(d.expectedProfitUsd)}
                          </bdi>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="sl-row-side">
                    <strong dir="ltr">{usd(d.costUsd)}</strong>
                    <button type="button" className="text-action" onClick={() => openPay([d])}>
                      سدّدت
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {selectedDebts.length > 0 && (
          <div className="sl-batch-bar">
            <span>
              {selectedDebts.length} جهاز · <bdi dir="ltr">{usd(totalOpenDebtUsd(selectedDebts))}</bdi>
            </span>
            <button type="button" className="dialog-primary" onClick={() => openPay(selectedDebts)}>
              تسديد المحدد
            </button>
          </div>
        )}
      </section>

      <section className="section">
        <div className="sl-head">
          <h2 className="sl-title">💳 بطاقة كاش</h2>
          <button type="button" className="btn-icon" onClick={() => setSheet("topup")}>
            + شحن البطاقة
          </button>
        </div>
        {card.rows.length === 0 ? (
          <p className="empty-state">لا توجد حركات بعد. سجّل «شحن البطاقة» عندما تضع فيها مالًا.</p>
        ) : (
          <ul className="sl-list">
            {card.rows.map((row) => (
              <li key={`${row.type}-${row.id}`} className={`sl-row sl-card-row sl-card-${row.type}`}>
                <div className="sl-row-main">
                  {row.type === "topup" ? (
                    <>
                      <strong>⬆️ شحن البطاقة</strong>
                      <span>
                        من الصندوق <bdi dir="ltr">{formatAmount(row.topUp.paidAmount)}</bdi>{" "}
                        {LEDGER_CURRENCY_LABELS[row.topUp.paidCurrency as LedgerCurrency] ?? row.topUp.paidCurrency}
                        {row.topUp.note ? ` · ${row.topUp.note}` : ""}
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>⬇️ تسديد {account(row.payment.accountId)?.name ?? "جهاز"}</strong>
                      <span>{getClient(clientStore, account(row.payment.accountId)?.clientId)?.name ?? ""}</span>
                    </>
                  )}
                  <span className="sl-meta">
                    <bdi dir="ltr">{row.date}</bdi> · الرصيد بعدها <bdi dir="ltr">{usd(row.balanceAfter)}</bdi>
                  </span>
                </div>
                <div className="sl-row-side">
                  <strong dir="ltr" className={row.amountUsd >= 0 ? "sl-in" : "sl-out"}>
                    {row.amountUsd >= 0 ? "+" : "-"}
                    {formatAmount(Math.abs(row.amountUsd))} $
                  </strong>
                  {row.type === "topup" && (
                    <button type="button" className="text-action sl-delete" onClick={() => removeTopUp(row.id)}>
                      حذف
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sheet === "pay" && (
        <PartySheet title="تسديد D لستارلينك" onClose={() => setSheet(null)}>
          <PayForm items={payItems} accountName={(id) => account(id)?.name ?? "جهاز"} cardBalance={card.balanceUsd} onPay={pay} onCancel={() => setSheet(null)} />
        </PartySheet>
      )}

      {sheet === "topup" && (
        <PartySheet title="شحن بطاقة كاش" onClose={() => setSheet(null)}>
          <TopUpForm mruRate={mruRate} currencyStore={currencyStore} onSubmit={addTopUp} onCancel={() => setSheet(null)} />
        </PartySheet>
      )}
    </main>
  );
}

function PayForm({
  items,
  accountName,
  cardBalance,
  onPay,
  onCancel,
}: {
  items: OpenShipmentDebt[];
  accountName: (id: string) => string;
  cardBalance: number;
  onPay: (date: string, fromCard: boolean) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(todayInput());
  const [fromCard, setFromCard] = useState(true);
  const total = totalOpenDebtUsd(items);
  return (
    <div className="party-balance-form">
      <ul className="sl-pay-list">
        {items.map((d) => (
          <li key={d.entry.id}>
            <span>{accountName(d.accountId)}</span>
            <bdi dir="ltr">{usd(d.costUsd)}</bdi>
          </li>
        ))}
        <li className="sl-pay-total">
          <strong>المجموع</strong>
          <strong dir="ltr">{usd(total)}</strong>
        </li>
      </ul>
      <label className="rep-form-field">
        <span>تاريخ الدفع (يوم نزول الربح)</span>
        <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="ledger-d-toggle party-cash-toggle">
        <input type="checkbox" checked={fromCard} onChange={(e) => setFromCard(e.target.checked)} />
        <span>💳 من بطاقة كاش (الرصيد بعدها {usd(cardBalance - (fromCard ? total : 0))})</span>
      </label>
      {fromCard && cardBalance < total && <p className="account-card-alert">رصيد البطاقة لا يكفي - سجّل شحن البطاقة أولًا، أو تابع ويصبح رصيدها سالبًا.</p>}
      <p className="settings-hint">تزول D عن {items.length === 1 ? "الجهاز" : "هذه الأجهزة"}، وينزل الربح وحصة المندوب بتاريخ الدفع.</p>
      <div className="settings-actions">
        <button type="button" className="dialog-primary" disabled={!date} onClick={() => onPay(date, fromCard)}>
          تأكيد التسديد
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </div>
  );
}

function TopUpForm({
  mruRate,
  currencyStore,
  onSubmit,
  onCancel,
}: {
  mruRate: number | undefined;
  currencyStore: CurrencyStore;
  onSubmit: (input: { amountUsd: number; paidAmount: number; paidCurrency: string; date: string; note: string }) => string | null;
  onCancel: () => void;
}) {
  const [amountUsd, setAmountUsd] = useState("");
  const [paidCurrency, setPaidCurrency] = useState<string>("MRU");
  const [paidAmount, setPaidAmount] = useState("");
  const [paidTouched, setPaidTouched] = useState(false);
  const [date, setDate] = useState(todayInput());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Suggests what left الصندوق from today's rate until the operator types the real figure.
  const rate = paidCurrency === "USD" ? 1 : paidCurrency === "MRU" ? mruRate : getCurrency(currencyStore, paidCurrency)?.rateFromUsd;
  const suggested = Number(amountUsd) > 0 && rate ? Math.round(Number(amountUsd) * rate * 100) / 100 : undefined;
  const shownPaid = paidTouched ? paidAmount : suggested !== undefined ? String(suggested) : "";

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(onSubmit({ amountUsd: Number(amountUsd), paidAmount: Number(shownPaid), paidCurrency, date, note }));
  }

  return (
    <form className="party-balance-form" onSubmit={submit}>
      <label className="rep-form-field">
        <span>المبلغ الذي دخل البطاقة (دولار)</span>
        <input
          className="search-input"
          type="number"
          lang="en"
          min="0"
          step="0.01"
          dir="ltr"
          inputMode="decimal"
          placeholder="0"
          value={amountUsd}
          onChange={(e) => setAmountUsd(e.target.value)}
          autoFocus
        />
      </label>
      <label className="rep-form-field">
        <span>خرج من الصندوق</span>
        <div className="party-balance-row">
          <input
            className="search-input"
            type="number"
            lang="en"
            min="0"
            step="0.01"
            dir="ltr"
            inputMode="decimal"
            placeholder="0"
            value={shownPaid}
            onChange={(e) => {
              setPaidTouched(true);
              setPaidAmount(e.target.value);
            }}
          />
          <select className="search-input" value={paidCurrency} onChange={(e) => setPaidCurrency(e.target.value)}>
            {LEDGER_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {LEDGER_CURRENCY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </label>
      <label className="rep-form-field">
        <span>التاريخ</span>
        <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <input className="search-input" placeholder="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <div className="settings-actions">
        <button className="dialog-primary" type="submit" disabled={!amountUsd}>
          حفظ الشحن
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
}
