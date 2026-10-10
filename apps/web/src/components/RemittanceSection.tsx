"use client";

import { useMemo, useState } from "react";
import { DateInput } from "@/components/DateInput";
import { PartySheet } from "@/components/AccountsSection";
import { PdfButton } from "@/components/PdfButton";
import { formatAmount } from "@/lib/formatAmount";
import { exportPrintableImage } from "@/lib/imageExport";
import type { PrintableDocument } from "@/lib/pdfDocument";
import { buildRemittanceReceipt, type ReceiptPlace } from "@/lib/remittanceReceipt";
import type { MoneyAccount } from "@/lib/moneyAccounts";
import { francToSifa, isFrancAccount, sifaToFranc } from "@/lib/payCurrency";
import type { RatesFromUsd } from "@/lib/reportsView";
import {
  CASH_ID,
  quoteFromRate,
  rateFromQuote,
  rateQuote,
  registryRate,
  remittanceFigures,
  remittanceMonth,
  remittanceProfitMru,
  remittanceRemaining,
  type CommissionMode,
  type CommissionWho,
  type Remittance,
  type RemittanceInput,
} from "@/lib/remittances";

const CURRENCY_NAMES: Record<string, string> = { MRU: "أوقية", SIFA: "سيفا", USD: "دولار" };
const cur = (code: string) => CURRENCY_NAMES[code] ?? code;
const CASH_CURRENCIES = ["MRU", "SIFA", "USD"];

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parse(value: string): number {
  const n = Number(value.replace(/[\s,]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/** An amount as he reads it: فرانك for أورانج / نيتا, the currency's name otherwise (only the
 * number is isolated left-to-right, so the unit stays after it in Arabic). */
function Money({ amount, currency, account }: { amount: number; currency: string; account?: MoneyAccount }) {
  const franc = Boolean(account && isFrancAccount(account));
  return (
    <span className="money-text">
      <bdi dir="ltr">{formatAmount(franc ? sifaToFranc(amount) : amount)}</bdi> {franc ? "فرانك" : cur(currency)}
    </span>
  );
}

interface Props {
  list: Remittance[];
  accounts: MoneyAccount[];
  rates: RatesFromUsd;
  month: string;
  since?: string;
  onSave: (input: RemittanceInput) => string | null;
  onPay: (id: string, input: { amount: number; date: string; accountId: string }) => string | null;
  onDelete: (id: string) => void;
  onEdit: (id: string, input: RemittanceInput) => string | null;
  onDeletePayment: (id: string, paymentId: string) => void;
}

/** 💸 «تحويل الأموال» in «حسابي»: the month's profit and who still owes, a tap opens it all. */
export function RemittanceSection(props: Props) {
  const [open, setOpen] = useState(false);
  const month = useMemo(() => remittanceMonth(props.list, props.month, props.since), [props.list, props.month, props.since]);
  const owing = props.list.filter((r) => remittanceRemaining(r) > 0).length;
  return (
    <>
      <button type="button" className="bank-inbox-open remittance-open" data-tour="remittance" onClick={() => setOpen(true)}>
        <span>💸 تحويل الأموال</span>
        <strong>
          {month.count > 0 ? (
            <>
              {month.count} حوالة · ربح <bdi dir="ltr">{formatAmount(Math.round(month.profitMru))}</bdi>
            </>
          ) : (
            "➕ حوالة جديدة"
          )}
          {owing > 0 ? ` · ${owing} عليهم باقٍ` : ""}
        </strong>
      </button>
      {open && (
        <PartySheet title="💸 تحويل الأموال" onClose={() => setOpen(false)}>
          <RemittanceBody {...props} />
        </PartySheet>
      )}
    </>
  );
}

function RemittanceBody({ list, accounts, rates, onSave, onPay, onDelete, onEdit, onDeletePayment }: Props) {
  const [adding, setAdding] = useState(list.length === 0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const receiptPlace = (id: string): ReceiptPlace | undefined =>
    id === CASH_ID ? { name: "الكاش" } : accountOf(id) ? { name: accountOf(id)!.name, franc: isFrancAccount(accountOf(id)) } : undefined;
  const receipt = (r: Remittance) => buildRemittanceReceipt(r, { in: receiptPlace(r.inAccountId), out: receiptPlace(r.outAccountId), of: receiptPlace });
  const sorted = [...list].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
  const accountOf = (id: string) => accounts.find((a) => a.id === id);
  const place = (id: string) => (id === CASH_ID ? "💵 الكاش" : `${accountOf(id)?.icon ?? ""} ${accountOf(id)?.name ?? "حساب محذوف"}`);
  return (
    <div className="party-balance-form remittance-body">
      {adding ? (
        <RemittanceForm
          accounts={accounts}
          rates={rates}
          onCancel={list.length > 0 ? () => setAdding(false) : undefined}
          onSave={(input) => {
            const message = onSave(input);
            if (!message) setAdding(false);
            return message;
          }}
        />
      ) : (
        <button type="button" className="dialog-primary" onClick={() => setAdding(true)}>
          ➕ حوالة جديدة
        </button>
      )}
      {sorted.length > 0 && (
        <ul className="money-recurring-list remittance-list">
          {sorted.map((r) => {
            const left = remittanceRemaining(r);
            const profit = remittanceProfitMru(r);
            return (
              <li key={r.id} className="remittance-row">
                <button type="button" className="remittance-row-head" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                  <span>
                    <strong>
                      {r.client}
                      {r.beneficiary ? ` ← ${r.beneficiary}` : ""}
                    </strong>
                    <small>
                      <bdi dir="ltr">{r.date}</bdi> · {place(r.inAccountId)} ← {place(r.outAccountId)}
                    </small>
                  </span>
                  <span className="remittance-row-figures">
                    <Money amount={r.sent} currency={r.outCurrency} account={accountOf(r.outAccountId)} />
                    {left > 0 ? (
                      <small className="money-out">
                        باقٍ <Money amount={left} currency={r.inCurrency} account={accountOf(r.inAccountId)} />
                      </small>
                    ) : (
                      <small className="money-in">مدفوعة ✓</small>
                    )}
                  </span>
                </button>
                {openId === r.id && (
                  <div className="remittance-detail">
                    <p>
                      استلمت <Money amount={r.owed} currency={r.inCurrency} account={accountOf(r.inAccountId)} /> (المبلغ <Money amount={r.amount} currency={r.inCurrency} account={accountOf(r.inAccountId)} />
                      {" "}+ عمولة <Money amount={r.commission} currency={r.inCurrency} account={accountOf(r.inAccountId)} />
                      {r.commissionWho === "deducted" ? " مخصومة من المرسَل" : " فوق المبلغ"}) · أرسلت <Money amount={r.sent} currency={r.outCurrency} account={accountOf(r.outAccountId)} />
                    </p>
                    <p>
                      ربحك:{" "}
                      {profit === undefined ? (
                        "سجّل سعر العملة"
                      ) : (
                        <span className={profit < 0 ? "money-out" : "money-in"}>
                          <bdi dir="ltr">{formatAmount(Math.round(profit))}</bdi> أوقية
                        </span>
                      )}
                      {r.beneficiaryNumber ? (
                        <>
                          {" "}
                          · رقم المستفيد <bdi dir="ltr">{r.beneficiaryNumber}</bdi>
                        </>
                      ) : null}
                      {r.note ? ` · ${r.note}` : ""}
                    </p>
                    {r.payments.length > 0 && (
                      <p>
                        دفعات:{" "}
                        {r.payments.map((p) => (
                          <span key={p.id} className="remittance-payment">
                            <bdi dir="ltr">{p.date}</bdi> <Money amount={p.amount} currency={r.inCurrency} account={accountOf(r.inAccountId)} /> ({place(p.accountId)})
                            <button
                              type="button"
                              className="btn-icon"
                              aria-label="حذف الدفعة"
                              onClick={() => {
                                if (window.confirm("حذف هذه الدفعة؟ يعود مبلغها دينًا على الزبون.")) onDeletePayment(r.id, p.id);
                              }}
                            >
                              ✕
                            </button>{" "}
                          </span>
                        ))}
                      </p>
                    )}
                    <div className="remittance-actions">
                      <PdfButton build={() => receipt(r)} label="🧾 وصل PDF" className="dialog-secondary" />
                      <ReceiptImageButton build={() => receipt(r)} />
                      <button type="button" className="dialog-secondary" onClick={() => setEditingId(editingId === r.id ? null : r.id)}>
                        ✎ تعديل
                      </button>
                    </div>
                    {editingId === r.id && (
                      <RemittanceForm
                        accounts={accounts}
                        rates={rates}
                        initial={r}
                        onCancel={() => setEditingId(null)}
                        onSave={(input) => {
                          const message = onEdit(r.id, input);
                          if (!message) setEditingId(null);
                          return message;
                        }}
                      />
                    )}
                    {left > 0 && editingId !== r.id && <PayForm remittance={r} accounts={accounts} onPay={(input) => onPay(r.id, input)} />}
                    <button
                      type="button"
                      className="dialog-danger"
                      onClick={() => {
                        if (window.confirm(`حذف حوالة «${r.client}»؟ تُحذف معها حركاتها في الكاش والحسابات.`)) onDelete(r.id);
                      }}
                    >
                      🗑️ حذف الحوالة
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** One place money can be: الكاش (in any of its currencies) or a bank / wallet account. */
function PlacePicker({ label, accounts, value, currency, onChange }: { label: string; accounts: MoneyAccount[]; value: string; currency: string; onChange: (id: string, currency: string) => void }) {
  return (
    <div className="remittance-place">
      <label className="form-field">
        <span>{label}</span>
        <select
          value={value}
          onChange={(e) => {
            const id = e.target.value;
            onChange(id, id === CASH_ID ? currency || "MRU" : accounts.find((a) => a.id === id)?.currencyCode ?? "MRU");
          }}
        >
          <option value={CASH_ID}>💵 الكاش</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.icon} {a.name} ({isFrancAccount(a) ? "فرانك" : cur(a.currencyCode)})
            </option>
          ))}
        </select>
      </label>
      {value === CASH_ID && (
        <label className="form-field">
          <span>العملة</span>
          <select value={currency} onChange={(e) => onChange(CASH_ID, e.target.value)}>
            {CASH_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {cur(c)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function RemittanceForm({ accounts, rates, onSave, onCancel, initial }: { accounts: MoneyAccount[]; rates: RatesFromUsd; onSave: (input: RemittanceInput) => string | null; onCancel?: () => void; initial?: Remittance }) {
  // ✎ Editing: the transfer's own figures, in the units he typed them (فرانك for أورانج / نيتا).
  const typedIn = (n: number, id: string) => String(Math.round((isFrancAccount(accounts.find((a) => a.id === id)) ? sifaToFranc(n) : n) * 100) / 100);
  const [client, setClient] = useState(initial?.client ?? "");
  const [clientPhone, setClientPhone] = useState(initial?.clientPhone ?? "");
  const [beneficiary, setBeneficiary] = useState(initial?.beneficiary ?? "");
  const [beneficiaryNumber, setBeneficiaryNumber] = useState(initial?.beneficiaryNumber ?? "");
  const [inId, setInId] = useState(initial?.inAccountId ?? CASH_ID);
  const [inCurrency, setInCurrency] = useState(initial?.inCurrency ?? "MRU");
  const firstOut = accounts.find((a) => a.currencyCode !== "MRU") ?? accounts[0];
  const [outId, setOutId] = useState(initial?.outAccountId ?? firstOut?.id ?? CASH_ID);
  const [outCurrency, setOutCurrency] = useState(initial?.outCurrency ?? firstOut?.currencyCode ?? "MRU");
  const [amountText, setAmountText] = useState(initial ? typedIn(initial.amount, initial.inAccountId) : "");
  const [mode, setMode] = useState<CommissionMode>(initial?.commissionMode ?? "percent");
  const [commissionText, setCommissionText] = useState(
    initial && initial.commissionValue > 0 ? (initial.commissionMode === "fixed" ? typedIn(initial.commissionValue, initial.inAccountId) : String(initial.commissionValue)) : "",
  );
  const [who, setWho] = useState<CommissionWho>(initial?.commissionWho ?? "onTop");
  const [rateText, setRateText] = useState(() => {
    if (!initial || initial.inCurrency === initial.outCurrency) return "";
    const quoted = rateQuote(initial.inCurrency, initial.outCurrency) ? quoteFromRate(initial.rate, initial.inCurrency, initial.outCurrency) : initial.rate;
    return quoted === undefined ? "" : String(Math.round(quoted * 10000) / 10000);
  });
  const [sentText, setSentText] = useState("");
  const [paidText, setPaidText] = useState(initial ? typedIn(initial.paidNow, initial.inAccountId) : "");
  const [date, setDate] = useState(initial?.date ?? today());
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const inAccount = accounts.find((a) => a.id === inId);
  const outAccount = accounts.find((a) => a.id === outId);
  const inFranc = isFrancAccount(inAccount);
  const outFranc = isFrancAccount(outAccount);
  const inUnit = inFranc ? "فرانك" : cur(inCurrency);
  const outUnit = outFranc ? "فرانك" : cur(outCurrency);
  // Amounts are typed in the unit he sees (فرانك for أورانج / نيتا) and kept in the currency.
  const toIn = (typed: number) => (inFranc ? francToSifa(typed) : typed);

  // The rate is typed his way: «سعر 1,000 سيفا بالأوقية» (3600) / «سعر الدولار بالأوقية» (430); between
  // two other currencies «1 X = ? Y». Or he types the amount sent and the rate follows from it.
  const offered = registryRate(inCurrency, outCurrency, rates);
  const same = inCurrency === outCurrency;
  const quote = rateQuote(inCurrency, outCurrency);
  const typedRate = parse(rateText);
  const rateFromTyped = quote ? rateFromQuote(typedRate, inCurrency, outCurrency) : typedRate;
  const rateHint = quote
    ? `سعر ${quote.block === 1000 ? "1,000 " : ""}${cur(quote.foreign)} بالأوقية`
    : `1 ${cur(inCurrency)} = ? ${cur(outCurrency)}`;
  const offeredShown = offered === undefined ? undefined : quote ? quoteFromRate(offered, inCurrency, outCurrency) : offered;
  const toOut = (typed: number) => (outFranc ? francToSifa(typed) : typed);

  const amount = toIn(parse(amountText));
  const commissionValue = mode === "fixed" ? toIn(parse(commissionText) || 0) : parse(commissionText) || 0;
  // What is converted: the amount, less the commission when it's taken from what is sent.
  const base = remittanceFigures({ amount, commissionMode: mode, commissionValue, commissionWho: who, rate: 1 });
  const baseIn = who === "onTop" ? amount : base.sent;
  const sentTyped = toOut(parse(sentText));
  const rate = same ? 1 : sentText.trim() !== "" && sentTyped > 0 && baseIn > 0 ? sentTyped / baseIn : rateText.trim() !== "" ? rateFromTyped : offered ?? NaN;
  const figures = remittanceFigures({ amount, commissionMode: mode, commissionValue, commissionWho: who, rate });
  const paidNow = paidText.trim() === "" ? undefined : toIn(parse(paidText));
  const shownIn = (n: number) => (
    <>
      <bdi dir="ltr">{formatAmount(inFranc ? sifaToFranc(n) : n)}</bdi> {inUnit}
    </>
  );
  const shownOut = (n: number) => (
    <>
      <bdi dir="ltr">{formatAmount(outFranc ? sifaToFranc(n) : n)}</bdi> {outUnit}
    </>
  );
  const preview = amount > 0 && rate > 0 ? remittanceProfitMru({ owed: figures.owed, sent: figures.sent, inCurrency, outCurrency, rates } as Remittance) : undefined;

  function submit() {
    setError(
      onSave({
        date,
        client,
        clientPhone,
        beneficiary,
        beneficiaryNumber,
        inAccountId: inId,
        inCurrency,
        amount,
        commissionMode: mode,
        commissionValue,
        commissionWho: who,
        outAccountId: outId,
        outCurrency,
        rate,
        ...(paidNow !== undefined ? { paidNow } : {}),
        rates,
        note,
      }),
    );
  }

  return (
    <div className="remittance-form">
      <div className="remittance-grid">
        <input className="search-input" value={client} onChange={(e) => setClient(e.target.value)} placeholder="الزبون (من دفع)" />
        <input className="search-input" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="هاتفه (اختياري)" inputMode="tel" />
        <input className="search-input" value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder="المستفيد (اختياري)" />
        <input className="search-input" value={beneficiaryNumber} onChange={(e) => setBeneficiaryNumber(e.target.value)} placeholder="رقم المستفيد" inputMode="tel" />
      </div>
      <PlacePicker
        label="📥 استلمت في"
        accounts={accounts}
        value={inId}
        currency={inCurrency}
        onChange={(id, c) => {
          setInId(id);
          setInCurrency(c);
          setRateText("");
          setSentText("");
        }}
      />
      <label className="form-field">
        <span>المبلغ المُحوَّل ({inUnit})</span>
        <input className="search-input" value={amountText} onChange={(e) => setAmountText(e.target.value)} inputMode="decimal" placeholder="0" />
      </label>
      <PlacePicker
        label="📤 أرسلت من"
        accounts={accounts}
        value={outId}
        currency={outCurrency}
        onChange={(id, c) => {
          setOutId(id);
          setOutCurrency(c);
          setRateText("");
          setSentText("");
        }}
      />
      {!same && (
        <div className="remittance-grid">
          <label className="form-field">
            <span>{rateHint}</span>
            <input
              className="search-input"
              value={rateText}
              onChange={(e) => {
                setRateText(e.target.value);
                setSentText("");
              }}
              inputMode="decimal"
              placeholder={(() => {
                // From the amount sent when he typed it, else the «العملات» rate.
                const shown = sentText.trim() !== "" && rate > 0 ? (quote ? quoteFromRate(rate, inCurrency, outCurrency) : rate) : offeredShown;
                return shown !== undefined ? formatAmount(Math.round(shown * 100) / 100) : "اكتب السعر";
              })()}
            />
          </label>
          <label className="form-field">
            <span>أو المبلغ المرسَل ({outUnit})</span>
            <input
              className="search-input"
              value={sentText}
              onChange={(e) => {
                setSentText(e.target.value);
                setRateText("");
              }}
              inputMode="decimal"
              placeholder={figures.sent > 0 ? formatAmount(outFranc ? sifaToFranc(figures.sent) : figures.sent) : "0"}
            />
          </label>
        </div>
      )}
      <div className="remittance-commission">
        <span>العمولة</span>
        <div className="report-period-row">
          <button type="button" className={`report-period-btn${mode === "percent" ? " report-period-btn-active" : ""}`} onClick={() => setMode("percent")}>
            نسبة %
          </button>
          <button type="button" className={`report-period-btn${mode === "fixed" ? " report-period-btn-active" : ""}`} onClick={() => setMode("fixed")}>
            مبلغ ({inUnit})
          </button>
        </div>
        <input className="search-input" value={commissionText} onChange={(e) => setCommissionText(e.target.value)} inputMode="decimal" placeholder={mode === "percent" ? "مثلاً 2" : "مثلاً 500"} />
        <div className="report-period-row">
          <button type="button" className={`report-period-btn${who === "onTop" ? " report-period-btn-active" : ""}`} onClick={() => setWho("onTop")}>
            يدفعها فوق المبلغ
          </button>
          <button type="button" className={`report-period-btn${who === "deducted" ? " report-period-btn-active" : ""}`} onClick={() => setWho("deducted")}>
            تُخصم من المرسَل
          </button>
        </div>
      </div>
      {amount > 0 && rate > 0 && (
        <p className="remittance-preview">
          يدفع الزبون {shownIn(figures.owed)} · يصل للمستفيد {shownOut(figures.sent)}
          {preview !== undefined && (
            <>
              {" "}
              · ربحك <bdi dir="ltr">{formatAmount(Math.round(preview))}</bdi> أوقية
            </>
          )}
        </p>
      )}
      <label className="form-field">
        <span>دفع الآن ({inUnit}) - فارغ = كل المبلغ، والباقي دين عليه</span>
        <input className="search-input" value={paidText} onChange={(e) => setPaidText(e.target.value)} inputMode="decimal" placeholder={amount > 0 ? formatAmount(inFranc ? sifaToFranc(figures.owed) : figures.owed) : "كل المبلغ"} />
      </label>
      <div className="remittance-grid">
        <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
        <input className="search-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة" />
      </div>
      {error && <p className="ledger-form-error">{error}</p>}
      <div className="dialog-actions">
        {onCancel && (
          <button type="button" className="dialog-secondary" onClick={onCancel}>
            إلغاء
          </button>
        )}
        <button type="button" className="dialog-primary" onClick={submit}>
          {initial ? "✓ حفظ التعديل" : "💸 سجّل الحوالة"}
        </button>
      </div>
    </div>
  );
}

function PayForm({ remittance, accounts, onPay }: { remittance: Remittance; accounts: MoneyAccount[]; onPay: (input: { amount: number; date: string; accountId: string }) => string | null }) {
  const left = remittanceRemaining(remittance);
  const inAccount = accounts.find((a) => a.id === remittance.inAccountId);
  const franc = isFrancAccount(inAccount);
  const [text, setText] = useState("");
  const [accountId, setAccountId] = useState(remittance.inAccountId);
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string | null>(null);
  // Only places holding the transfer's currency.
  const places = accounts.filter((a) => a.currencyCode === remittance.inCurrency);
  return (
    <div className="remittance-pay">
      <strong>💵 تسديد الباقي</strong>
      <div className="remittance-grid">
        <input className="search-input" value={text} onChange={(e) => setText(e.target.value)} inputMode="decimal" placeholder={formatAmount(franc ? sifaToFranc(left) : left)} />
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value={CASH_ID}>💵 الكاش</option>
          {places.map((a) => (
            <option key={a.id} value={a.id}>
              {a.icon} {a.name}
            </option>
          ))}
        </select>
        <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {error && <p className="ledger-form-error">{error}</p>}
      <button
        type="button"
        className="dialog-primary"
        onClick={() => {
          const typed = text.trim() === "" ? (franc ? sifaToFranc(left) : left) : parse(text);
          const amount = franc ? francToSifa(typed) : typed;
          setError(onPay({ amount, date, accountId }));
        }}
      >
        سجّل التسديد
      </button>
    </div>
  );
}

/** «🖼️ وصل صورة» - the same receipt as a picture, straight to the share sheet (WhatsApp…). */
function ReceiptImageButton({ build }: { build: () => PrintableDocument }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="dialog-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await exportPrintableImage(build(), "transfer-receipt");
          setBusy(false);
          if (!result.ok) setError(result.message);
        }}
      >
        {busy ? "⏳ جارِ التجهيز…" : "🖼️ وصل صورة"}
      </button>
      {error && <span className="ledger-form-error">{error}</span>}
    </>
  );
}

