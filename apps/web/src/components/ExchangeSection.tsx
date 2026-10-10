"use client";

import { useMemo, useState } from "react";
import { DateInput } from "@/components/DateInput";
import { PartySheet } from "@/components/AccountsSection";
import { Money, PlacePicker } from "@/components/RemittanceSection";
import { cashCurrencyLabel } from "@/lib/cashCurrencies";
import { averageCost, CASH_ID, type Exchange, type ExchangeInput, type ExchangeList } from "@/lib/exchanges";
import { formatAmount } from "@/lib/formatAmount";
import type { MoneyAccount } from "@/lib/moneyAccounts";
import { francToSifa, isFrancAccount, sifaToFranc } from "@/lib/payCurrency";
import { rateQuote } from "@/lib/remittances";

const cur = cashCurrencyLabel;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const parse = (value: string) => Number(value.replace(/[\s,]/g, ""));

/** The rate his way: «1,000 سيفا = 3,600 أوقية» / «1 دولار = 430 أوقية»; other pairs «1 X = Y». */
export function exchangeRateLine(paid: number, fromCurrency: string, received: number, toCurrency: string): string {
  if (!(paid > 0) || !(received > 0)) return "";
  const q = rateQuote(fromCurrency, toCurrency);
  if (q) {
    const foreignAmount = q.foreign === toCurrency ? received : paid;
    const mru = q.foreign === toCurrency ? paid : received;
    return `${formatAmount(q.block)} ${cur(q.foreign)} = ${formatAmount(Math.round((mru / foreignAmount) * q.block * 100) / 100)} أوقية`;
  }
  return `1 ${cur(toCurrency)} = ${formatAmount(Math.round((paid / received) * 10000) / 10000)} ${cur(fromCurrency)}`;
}

interface Props {
  list: ExchangeList;
  accounts: MoneyAccount[];
  onSave: (input: ExchangeInput) => string | null;
  onEdit: (id: string, input: ExchangeInput) => string | null;
  onDelete: (id: string) => void;
}

/** 💱 «شراء عملة» in «حسابي»: what he bought, and what it cost him on average. */
export function ExchangeSection(props: Props) {
  const [open, setOpen] = useState(false);
  const day = today();
  const averages = useMemo(
    () => ["SIFA", "USD", "DZD"].map((code) => ({ code, avg: averageCost(props.list, code, day) })).filter((a) => a.avg),
    [props.list, day],
  );
  return (
    <>
      <button type="button" className="bank-inbox-open remittance-open exchange-open" data-tour="exchange" onClick={() => setOpen(true)}>
        <span>💱 شراء عملة</span>
        <small>
          {averages.length
            ? averages.map((a, i) => (
                <span key={a.code}>
                  {i ? " · " : ""}
                  <AverageText code={a.code} mruPerUnit={a.avg!.mruPerUnit} />
                </span>
              ))
            : "سجّل ما تشتريه من سيفا ودولار"}
        </small>
      </button>
      {open && (
        <PartySheet title="💱 شراء عملة" onClose={() => setOpen(false)}>
          <ExchangeBody {...props} />
        </PartySheet>
      )}
    </>
  );
}

/** «1,000 سيفا = 3,550 أوقية» - each number isolated so the line reads right in Arabic. */
function AverageText({ code, mruPerUnit }: { code: string; mruPerUnit: number }) {
  const q = rateQuote(code, "MRU");
  const block = q?.block ?? 1;
  return (
    <>
      <bdi dir="ltr">{formatAmount(block)}</bdi> {cur(code)} = <bdi dir="ltr">{formatAmount(Math.round(mruPerUnit * block * 100) / 100)}</bdi> أوقية
    </>
  );
}

function ExchangeBody({ list, accounts, onSave, onEdit, onDelete }: Props) {
  const [adding, setAdding] = useState(list.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const sorted = [...list].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
  const accountOf = (id: string) => accounts.find((a) => a.id === id);
  const place = (id: string) => (id === CASH_ID ? "💵 الكاش" : `${accountOf(id)?.icon ?? ""} ${accountOf(id)?.name ?? "حساب محذوف"}`);
  const day = today();
  return (
    <div className="party-balance-form remittance-body">
      {["SIFA", "USD", "DZD"].map((code) => {
        const avg = averageCost(list, code, day);
        return avg ? (
          <p key={code} className="settings-hint">
            💱 متوسط شرائك: <AverageText code={code} mruPerUnit={avg.mruPerUnit} /> ({avg.basis === "30d" ? `آخر 30 يوماً، ${avg.count} عملية` : "آخر عملية"}) - ربح الحوالات يُحسب مقابله.
          </p>
        ) : null;
      })}
      {adding ? (
        <ExchangeForm
          accounts={accounts}
          onCancel={list.length > 0 ? () => setAdding(false) : undefined}
          onSave={(input) => {
            const message = onSave(input);
            if (!message) setAdding(false);
            return message;
          }}
        />
      ) : (
        <button type="button" className="dialog-primary" onClick={() => setAdding(true)}>
          ➕ عملية شراء
        </button>
      )}
      {sorted.length > 0 && (
        <ul className="money-recurring-list remittance-list">
          {sorted.map((e) => (
            <li key={e.id} className="remittance-row">
              <div className="remittance-row-head">
                <span>
                  <strong>
                    <Money amount={e.received} currency={e.toCurrency} account={accountOf(e.toAccountId)} /> ← <Money amount={e.paid} currency={e.fromCurrency} account={accountOf(e.fromAccountId)} />
                  </strong>
                  <small>
                    <bdi dir="ltr">{e.date}</bdi> · {place(e.fromAccountId)} ← {place(e.toAccountId)}
                    {e.seller ? ` · ${e.seller}` : ""} · {exchangeRateLine(e.paid, e.fromCurrency, e.received, e.toCurrency)}
                  </small>
                </span>
              </div>
              <div className="remittance-actions">
                <button type="button" className="btn-icon" onClick={() => setEditingId(editingId === e.id ? null : e.id)}>
                  ✎ تعديل
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  aria-label="حذف"
                  onClick={() => {
                    if (window.confirm("حذف عملية الشراء؟ يرجع الحسابان كما كانا.")) onDelete(e.id);
                  }}
                >
                  🗑
                </button>
              </div>
              {editingId === e.id && (
                <ExchangeForm
                  accounts={accounts}
                  initial={e}
                  onCancel={() => setEditingId(null)}
                  onSave={(input) => {
                    const message = onEdit(e.id, input);
                    if (!message) setEditingId(null);
                    return message;
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExchangeForm({ accounts, onSave, onCancel, initial }: { accounts: MoneyAccount[]; onSave: (input: ExchangeInput) => string | null; onCancel?: () => void; initial?: Exchange }) {
  const firstMru = accounts.find((a) => a.currencyCode === "MRU");
  const firstForeign = accounts.find((a) => a.currencyCode !== "MRU");
  const [fromId, setFromId] = useState(initial?.fromAccountId ?? firstMru?.id ?? CASH_ID);
  const [fromCurrency, setFromCurrency] = useState(initial?.fromCurrency ?? "MRU");
  const [toId, setToId] = useState(initial?.toAccountId ?? firstForeign?.id ?? CASH_ID);
  const [toCurrency, setToCurrency] = useState(initial?.toCurrency ?? firstForeign?.currencyCode ?? "SIFA");
  const fromFranc = isFrancAccount(accounts.find((a) => a.id === fromId));
  const toFranc = isFrancAccount(accounts.find((a) => a.id === toId));
  const shown = (v: number, franc: boolean) => String(franc ? sifaToFranc(v) : v);
  const [paidText, setPaidText] = useState(initial ? shown(initial.paid, isFrancAccount(accounts.find((a) => a.id === initial.fromAccountId))) : "");
  const [receivedText, setReceivedText] = useState(initial ? shown(initial.received, isFrancAccount(accounts.find((a) => a.id === initial.toAccountId))) : "");
  const [seller, setSeller] = useState(initial?.seller ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [date, setDate] = useState(initial?.date ?? today());
  const [error, setError] = useState<string | null>(null);
  const paid = fromFranc ? francToSifa(parse(paidText)) : parse(paidText);
  const received = toFranc ? francToSifa(parse(receivedText)) : parse(receivedText);
  const rateLine = exchangeRateLine(paid, fromCurrency, received, toCurrency);

  function submit() {
    setError(
      onSave({ date, fromAccountId: fromId, fromCurrency, paid, toAccountId: toId, toCurrency, received, seller, note }),
    );
  }

  return (
    <div className="remittance-form">
      <PlacePicker label="دفعت من" accounts={accounts} value={fromId} currency={fromCurrency} onChange={(id, c) => (setFromId(id), setFromCurrency(c))} />
      <label className="form-field">
        <span>المبلغ الذي دفعته ({fromFranc ? "فرانك" : cur(fromCurrency)})</span>
        <input className="search-input" inputMode="decimal" dir="ltr" value={paidText} onChange={(e) => setPaidText(e.target.value)} placeholder="36000" />
      </label>
      <PlacePicker label="استلمت في" accounts={accounts} value={toId} currency={toCurrency} onChange={(id, c) => (setToId(id), setToCurrency(c))} />
      <label className="form-field">
        <span>المبلغ الذي استلمته ({toFranc ? "فرانك" : cur(toCurrency)})</span>
        <input className="search-input" inputMode="decimal" dir="ltr" value={receivedText} onChange={(e) => setReceivedText(e.target.value)} placeholder="10000" />
      </label>
      {rateLine && <p className="remittance-preview">السعر: {rateLine}</p>}
      <div className="remittance-grid">
        <input className="search-input" value={seller} onChange={(e) => setSeller(e.target.value)} placeholder="البائع (اختياري)" />
        <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <input className="search-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري)" />
      {error && <p className="form-error">{error}</p>}
      <div className="remittance-actions">
        <button type="button" className="dialog-primary" onClick={submit}>
          {initial ? "حفظ التعديل" : "💱 سجّل الشراء"}
        </button>
        {onCancel && (
          <button type="button" className="btn-icon" onClick={onCancel}>
            إلغاء
          </button>
        )}
      </div>
    </div>
  );
}
