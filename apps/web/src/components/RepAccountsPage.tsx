"use client";

import { FormEvent, useMemo, useState } from "react";
import { DateInput } from "@/components/DateInput";
import { getCurrency, loadCurrencyStore } from "@/lib/currencyStore";
import { formatAmount } from "@/lib/formatAmount";
import { LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "@/lib/ledgerStore";
import { loadAccountsBook } from "@/lib/moneyAccounts";
import { makeRepConverter, type RepConvert } from "@/lib/repAccount";
import type { RepStatementDay, RepStatementRow, UpdateRepSettlementInput } from "@/lib/repStore";
import { repProfitIn, repWallets, repWalletTitle, type RepWallet } from "@/lib/repWallets";

/**
 * 📂 «حساباته» (his Oct 12 2026 ask): a full page with the rep's accounts side by side - سيفا وأورانج,
 * الربح, الأوقية - each with its balance and its own operations, and his profit's actions: into one of
 * his accounts, paid to him from «حسابي», or written off («تصفير الربح»). Logic: lib/repWallets.ts.
 */

const EPS = 0.005;

function label(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

function money(values: Record<string, number>, signed = false): string {
  const parts = Object.entries(values)
    .filter(([, v]) => Math.abs(v) > EPS)
    .map(([c, v]) => `${signed && v > 0 ? "+" : v < 0 ? "-" : ""}${formatAmount(Math.abs(v))} ${label(c)}`);
  return parts.length ? parts.join(" · ") : "0";
}

/** Signed amounts with the number kept left-to-right and the currency word after it. */
function Money({ values, signed = false }: { values: Record<string, number>; signed?: boolean }) {
  const parts = Object.entries(values).filter(([, v]) => Math.abs(v) > EPS);
  if (!parts.length) return <>0</>;
  return (
    <>
      {parts.map(([c, v], i) => (
        <span key={c}>
          {i > 0 ? " · " : ""}
          <bdi dir="ltr">{`${signed && v > 0 ? "+" : v < 0 ? "-" : ""}${formatAmount(Math.abs(v))}`}</bdi> {label(c)}
        </span>
      ))}
    </>
  );
}

/** «له 6,000 سيفا» / «عليه 44,000 سيفا» / «متوازن». */
function sideText(balance: Record<string, number>): { text: string; tone: "due" | "clear" | "even" } {
  const values = Object.entries(balance).filter(([, v]) => Math.abs(v) > EPS);
  if (!values.length) return { text: "متوازن ✓", tone: "even" };
  const total = values.reduce((sum, [, v]) => sum + v, 0);
  const abs = Object.fromEntries(values.map(([c, v]) => [c, Math.abs(v)]));
  return total > 0 ? { text: `له ${money(abs)}`, tone: "clear" } : { text: `عليه ${money(abs)}`, tone: "due" };
}

type Action = "toSIFA" | "toMRU" | "pay" | "zero";

const ACTIONS: { id: Action; text: string; hint: string }[] = [
  { id: "toSIFA", text: "↪️ إلى حساب السيفا", hint: "يخرج من ربحه ويدخل حساب السيفا وأورانج: يقلّ ما عليه، أو يبقى له عندك." },
  { id: "toMRU", text: "↪️ إلى حساب الأوقية", hint: "يخرج من ربحه ويدخل حساب الأوقية: يقلّ ما عليه، أو يبقى له عندك." },
  { id: "pay", text: "💸 دفعت له من حسابي", hint: "دفعت له ربحه من الكاش أو من أحد تطبيقاتك - يخرج من «حسابي»." },
  { id: "zero", text: "🧹 تصفير الربح", hint: "يصير ربحه 0 دون أن يتحرك أي مال (مثلاً سوّيتماه خارج التطبيق)." },
];

interface Props {
  repName: string;
  /** His current account (after his reset), newest day first. */
  days: RepStatementDay[];
  /** The currencies his profit is shown in. */
  profitConvert: RepConvert;
  describe: (row: RepStatementRow) => string;
  readOnly?: boolean;
  onSettle: (input: UpdateRepSettlementInput) => string | null;
  onClose: () => void;
}

export function RepAccountsPage({ repName, days, profitConvert, describe, readOnly = false, onSettle, onClose }: Props) {
  const { money: wallets, profit } = useMemo(() => repWallets(days, profitConvert), [days, profitConvert]);
  const all = useMemo(() => [wallets.find((w) => w.id === "SIFA"), profit, ...wallets.filter((w) => w.id !== "SIFA")].filter(Boolean) as RepWallet[], [wallets, profit]);
  const [open, setOpen] = useState("SIFA");
  const shown = all.find((w) => w.id === open) ?? all[0]!;
  const [action, setAction] = useState<Action | null>(null);

  return (
    <div className="rep-accounts-page" role="dialog" aria-label={`حسابات ${repName}`}>
      <div className="rep-accounts-head">
        <h2>📂 حسابات {repName}</h2>
        <button type="button" className="btn-icon" onClick={onClose} aria-label="إغلاق">
          ✕
        </button>
      </div>

      <div className="rep-accounts-tiles">
        {all.map((w) => {
          const side = sideText(w.balance);
          return (
            <button
              key={w.id}
              type="button"
              className={`rep-accounts-tile rep-accounts-${side.tone}${w.id === shown.id ? " rep-accounts-tile-active" : ""}`}
              aria-pressed={w.id === shown.id}
              onClick={() => {
                setOpen(w.id);
                setAction(null);
              }}
            >
              <span>{repWalletTitle(w.id)}</span>
              <strong>
                <bdi dir="ltr">{side.text}</bdi>
              </strong>
              <small>{w.lines.length} عملية</small>
            </button>
          );
        })}
      </div>

      <section className="rep-accounts-body">
        <h3>{repWalletTitle(shown.id)}</h3>
        {shown.id === "profit" && !readOnly && (
          <div className="rep-accounts-actions">
            {ACTIONS.map((a) => (
              <button key={a.id} type="button" className={`dialog-secondary${action === a.id ? " rep-accounts-action-on" : ""}`} onClick={() => setAction(action === a.id ? null : a.id)}>
                {a.text}
              </button>
            ))}
          </div>
        )}
        {shown.id === "profit" && action && (
          <ProfitActionForm key={action} action={action} days={days} onCancel={() => setAction(null)} onSettle={(input) => {
            const error = onSettle(input);
            if (!error) setAction(null);
            return error;
          }} />
        )}
        {shown.lines.length === 0 ? (
          <p className="empty-state">لا عمليات في هذا الحساب بعد.</p>
        ) : (
          <ul className="rep-accounts-lines">
            {shown.lines.map((line) => (
              <li key={`${shown.id}-${line.key}`}>
                <div>
                  <span>{describe(line.row)}</span>
                  <small>
                    <bdi dir="ltr">{line.date}</bdi> · الرصيد بعدها <Money values={line.after} signed />
                  </small>
                </div>
                <strong className={Object.values(line.amount).reduce((s, v) => s + v, 0) >= 0 ? "rep-accounts-plus" : "rep-accounts-minus"}>
                  <Money values={line.amount} signed />
                </strong>
              </li>
            ))}
          </ul>
        )}
        <p className="settings-hint">«+» = له (لصالحه)، «-» = عليه. كل حساب بعملته - لا يُحوَّل ولا يُخلط.</p>
      </section>
    </div>
  );
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ProfitActionForm({
  action,
  days,
  onCancel,
  onSettle,
}: {
  action: Action;
  days: RepStatementDay[];
  onCancel: () => void;
  onSettle: (input: UpdateRepSettlementInput) => string | null;
}) {
  const fixed = action === "toSIFA" ? "SIFA" : action === "toMRU" ? "MRU" : null;
  const [currency, setCurrency] = useState<string>(fixed ?? "SIFA");
  const rates = useMemo(() => {
    const store = loadCurrencyStore();
    return { MRU: getCurrency(store, "MRU")?.rateFromUsd, SIFA: getCurrency(store, "SIFA")?.rateFromUsd };
  }, []);
  const suggested = useMemo(() => repProfitIn(days, currency, makeRepConverter([currency], rates)), [days, currency, rates]);
  const [amount, setAmount] = useState("");
  const [place, setPlace] = useState("cash");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const places = useMemo(() => loadAccountsBook().accounts.filter((a) => a.currencyCode === currency), [currency]);
  const hint = ACTIONS.find((a) => a.id === action)!.hint;

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount || suggested);
    if (!(value > 0)) return setError("اكتب المبلغ");
    const base = { amount: value, currencyCode: currency, date, ...(note.trim() ? { note: note.trim() } : {}) };
    const input: UpdateRepSettlementInput =
      action === "pay"
        ? { ...base, kind: "commissionPayout", ...(place !== "cash" ? { accountId: place } : {}) }
        : { ...base, kind: "profitTransfer", ...(action === "zero" ? {} : { toDebt: true }) };
    setError(onSettle(input));
  }

  return (
    <form className="party-balance-form rep-accounts-form" onSubmit={submit}>
      <p className="settings-hint">{hint}</p>
      <div className="party-balance-row">
        <input
          className="search-input"
          inputMode="decimal"
          placeholder={suggested > 0 ? String(suggested) : "المبلغ"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="المبلغ"
        />
        {fixed ? (
          <span className="search-input rep-accounts-currency">{label(fixed)}</span>
        ) : (
          <select className="search-input" value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="العملة">
            <option value="SIFA">{label("SIFA")}</option>
            <option value="MRU">{label("MRU")}</option>
          </select>
        )}
      </div>
      {suggested > 0 && <small className="settings-hint">ربحه الآن ≈ {formatAmount(suggested)} {label(currency)} - اتركه فارغًا لأخذه كله.</small>}
      {action === "pay" && (
        <label className="form-field party-source-field">
          <span>من أين دفعت له؟</span>
          <select className="search-input" value={place} onChange={(e) => setPlace(e.target.value)}>
            <option value="cash">💵 الكاش</option>
            {places.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon ? `${a.icon} ` : ""}
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
      <input className="search-input" placeholder="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <div className="settings-actions">
        <button type="submit" className="dialog-primary">
          حفظ
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
}
