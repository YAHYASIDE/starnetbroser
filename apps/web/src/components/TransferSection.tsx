"use client";

import { useState } from "react";
import { DateInput } from "@/components/DateInput";
import { PartySheet } from "@/components/AccountsSection";
import { Money, PlacePicker } from "@/components/RemittanceSection";
import { cashCurrencyLabel } from "@/lib/cashCurrencies";
import { CASH_ACCOUNT_ID, transferCurrencyError, type AccountTransfer, type MoneyAccount } from "@/lib/moneyAccounts";
import { francToSifa, isFrancAccount } from "@/lib/payCurrency";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currencyCode: string;
  date: string;
  note?: string;
}

/** 🔁 «تحويل»: from an app to an app, an app to الكاش (سحب), or الكاش to an app (إيداع) - one
 * currency; between two currencies it's «💱 شراء عملة». */
export function TransferSection({
  accounts,
  transfers,
  onSave,
  onDelete,
}: {
  accounts: MoneyAccount[];
  transfers: AccountTransfer[];
  onSave: (input: TransferInput) => string | null;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="bank-inbox-open remittance-open transfer-open" data-tour="transfer" onClick={() => setOpen(true)}>
        <span>🔁 تحويل بين حساباتي والكاش</span>
        <small>من تطبيق إلى تطبيق، أو سحب وإيداع في الكاش</small>
      </button>
      {open && (
        <PartySheet title="🔁 تحويل" onClose={() => setOpen(false)}>
          <TransferBody accounts={accounts} transfers={transfers} onSave={onSave} onDelete={onDelete} />
        </PartySheet>
      )}
    </>
  );
}

function TransferBody({ accounts, transfers, onSave, onDelete }: { accounts: MoneyAccount[]; transfers: AccountTransfer[]; onSave: (input: TransferInput) => string | null; onDelete: (id: string) => void }) {
  const first = accounts.find((a) => a.currencyCode === "MRU");
  const [fromId, setFromId] = useState(first?.id ?? CASH_ACCOUNT_ID);
  const [fromCurrency, setFromCurrency] = useState(first?.currencyCode ?? "MRU");
  const [toId, setToId] = useState(CASH_ACCOUNT_ID);
  const [toCurrency, setToCurrency] = useState(first?.currencyCode ?? "MRU");
  const [amountText, setAmountText] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const accountOf = (id: string) => accounts.find((a) => a.id === id);
  // أورانج / نيتا: typed in فرانك, kept in سيفا.
  const franc = isFrancAccount(accountOf(fromId)) || isFrancAccount(accountOf(toId));
  const unit = franc ? "فرانك" : cashCurrencyLabel(fromCurrency);
  const place = (id: string) => (id === CASH_ACCOUNT_ID ? "💵 الكاش" : `${accountOf(id)?.icon ?? ""} ${accountOf(id)?.name ?? "حساب محذوف"}`);
  const currencyError = transferCurrencyError(fromCurrency, toCurrency);
  const recent = [...transfers].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1)).slice(0, 15);

  function submit() {
    if (currencyError) return setMessage(currencyError);
    const typed = Number(amountText.replace(/[\s,]/g, ""));
    const error = onSave({ fromAccountId: fromId, toAccountId: toId, amount: franc ? francToSifa(typed) : typed, currencyCode: fromCurrency, date, note });
    if (error) return setMessage(error);
    setMessage(`✓ حُوّل من ${place(fromId)} إلى ${place(toId)}`);
    setAmountText("");
    setNote("");
  }

  return (
    <div className="party-balance-form remittance-body">
      <div className="remittance-form">
        <PlacePicker label="من" accounts={accounts} value={fromId} currency={fromCurrency} onChange={(id, c) => (setFromId(id), setFromCurrency(c), setMessage(null))} />
        <PlacePicker label="إلى" accounts={accounts} value={toId} currency={toCurrency} onChange={(id, c) => (setToId(id), setToCurrency(c), setMessage(null))} />
        {currencyError && <p className="settings-hint">⚠️ {currencyError}</p>}
        <label className="form-field">
          <span>المبلغ ({unit})</span>
          <input className="search-input" inputMode="decimal" dir="ltr" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0" />
        </label>
        <div className="remittance-grid">
          <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
          <input className="search-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري)" />
        </div>
        {message && <p className="settings-hint">{message}</p>}
        <button type="button" className="dialog-primary" onClick={submit}>
          🔁 حوّل
        </button>
      </div>
      {recent.length > 0 && (
        <>
          <strong className="money-group-title">آخر التحويلات</strong>
          <ul className="money-recurring-list">
            {recent.map((t) => (
              <li key={t.id} className="money-account-row">
                <span>
                  {place(t.fromAccountId)} ← {place(t.toAccountId)}
                  <small>
                    {" "}
                    · <bdi dir="ltr">{t.date}</bdi>
                    {t.note ? ` · ${t.note}` : ""}
                  </small>
                </span>
                <Money amount={t.amount} currency={t.currencyCode} account={[accountOf(t.fromAccountId), accountOf(t.toAccountId)].find((a) => isFrancAccount(a))} />
                <button
                  type="button"
                  className="btn-icon"
                  aria-label="حذف التحويل"
                  onClick={() => {
                    if (window.confirm("حذف هذا التحويل؟ يرجع الرصيدان كما كانا.")) onDelete(t.id);
                  }}
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
