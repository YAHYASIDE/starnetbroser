"use client";

import { FormEvent, useMemo, useState } from "react";
import { DateInput } from "@/components/DateInput";
import { getCurrency, loadCurrencyStore } from "@/lib/currencyStore";
import { formatAmount } from "@/lib/formatAmount";
import { LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "@/lib/ledgerStore";
import { loadAccountsBook } from "@/lib/moneyAccounts";
import { makeRepConverter, type RepConvert } from "@/lib/repAccount";
import type { RepStatementDay, RepStatementRow, UpdateRepSettlementInput } from "@/lib/repStore";
import { repProfitIn, repProfitSigned, repProfitZeroEntry, repWallets, repWalletTitle, repZeroEntry, type RepWallet } from "@/lib/repWallets";
import { cashCurrencyLabel, CASH_CURRENCIES } from "@/lib/cashCurrencies";
import { askDeleteCode } from "@/components/DeleteCodePrompt";
import { ledgerEntryIds, removeLedgerCash } from "@/lib/repLedgerDeposit";
import {
  addRepLedgerCurrency,
  addRepLedgerEntry,
  createRepLedger,
  deleteRepLedger,
  deleteRepLedgerEntry,
  loadRepLedgerBook,
  renameRepLedger,
  repLedgerBalance,
  repLedgerBalances,
  repLedgerKindMeta,
  repLedgerLines,
  repLedgersOf,
  repLedgerZeroEntry,
  removeRepLedgerCurrency,
  FRANC_CODE,
  FRANC_NAME_RE,
  REP_LEDGER_KINDS,
  repLedgerShown,
  repLedgerShownCode,
  repLedgerTyped,
  setRepLedgerFranc,
  saveRepLedgerBook,
  type RepLedger,
  type RepLedgerBook,
  type RepLedgerKind,
} from "@/lib/repLedgers";

/**
 * 📂 «حساباته» (his Oct 12 2026 ask): a full page with the rep's accounts side by side - سيفا وأورانج,
 * الربح, الأوقية - each with its balance and its own operations, and his profit's actions: into one of
 * his accounts, paid to him from «حسابي», or written off («تصفير الربح»). Logic: lib/repWallets.ts.
 */

const EPS = 0.005;

function label(code: string): string {
  if (code === FRANC_CODE) return "فرنك FCFA 🟠";
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? cashCurrencyLabel(code);
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

/** 📒 A named account's balance: one side when all its currencies agree, else each its own
 * («له 5,000 سيفا · عليه 20,000 أوقية») - never added together. */
function ledgerSide(balances: Record<string, number>): { text: string; tone: "due" | "clear" | "even" } {
  const values = Object.entries(balances).filter(([, v]) => Math.abs(v) > EPS);
  if (values.every(([, v]) => v > 0) || values.every(([, v]) => v < 0)) return sideText(balances);
  return { text: values.map(([c, v]) => `${v > 0 ? "له" : "عليه"} ${formatAmount(Math.abs(v))} ${label(c)}`).join(" · "), tone: "due" };
}

type Action = "toSIFA" | "toMRU" | "pay" | "zero" | "credit" | "debit";

type MoneyAction = "credit" | "debit" | "zero";

/** ➕ له / ➖ عليه / 🧹 تصفير on a money account (his Oct 12 2026 ask «اضف في كل حساب له أو عليه، لا عليه
 * فقط»): a له / عليه record in that account's currency - no money moves, deletable from the statement. */
const MONEY_ACTIONS: { id: MoneyAction; text: string; hint: string }[] = [
  { id: "credit", text: "➕ له", hint: "مبلغ لصالحه في هذا الحساب (يقلّ ما عليه) - لا يتحرك أي مال." },
  { id: "debit", text: "➖ عليه", hint: "مبلغ عليه في هذا الحساب - لا يتحرك أي مال." },
  { id: "zero", text: "🧹 تصفير الحساب", hint: "يضيف «له» أو «عليه» بقدر الرصيد ليصير الحساب 0 - يبقى سطرًا في الكشف ويمكن حذفه." },
];

const ACTIONS: { id: Action; text: string; hint: string }[] = [
  { id: "toSIFA", text: "↪️ إلى الحساب الشخصي", hint: "يخرج من ربحه ويدخل حسابه الشخصي (سيفا): يقلّ ما عليه، أو يبقى له عندك." },
  { id: "toMRU", text: "↪️ إلى حساب الأوقية", hint: "يخرج من ربحه ويدخل حساب الأوقية: يقلّ ما عليه، أو يبقى له عندك." },
  { id: "pay", text: "💸 دفعت له من حسابي", hint: "دفعت له ربحه من الكاش أو من أحد تطبيقاتك - يخرج من «حسابي»." },
  { id: "credit", text: "➕ له", hint: "مبلغ يُضاف إلى ربحه - لا يتحرك أي مال." },
  { id: "debit", text: "➖ عليه", hint: "مبلغ يُخصم من ربحه - لا يتحرك أي مال." },
  { id: "zero", text: "🧹 تصفير الربح", hint: "يصير ربحه 0 دون أن يتحرك أي مال - له أو عليه (يُضاف أو يُخصم بقدره)." },
];

interface Props {
  /** His named accounts (lib/repLedgers.ts) are read and saved here. */
  repId: string;
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

export function RepAccountsPage({ repId, repName, days, profitConvert, describe, readOnly = false, onSettle, onClose }: Props) {
  const { money: wallets, profit } = useMemo(() => repWallets(days, profitConvert), [days, profitConvert]);
  const all = useMemo(() => [wallets.find((w) => w.id === "SIFA"), profit, ...wallets.filter((w) => w.id !== "SIFA")].filter(Boolean) as RepWallet[], [wallets, profit]);
  const [open, setOpen] = useState("SIFA");
  // 📒 his named accounts (his Oct 12 2026 ask): their own store, never part of his profit.
  const [book, setBook] = useState<RepLedgerBook>(() => loadRepLedgerBook());
  const ledgers = useMemo(() => repLedgersOf(book, repId), [book, repId]);
  const storeBook = (next: RepLedgerBook) => {
    saveRepLedgerBook(next);
    setBook(next);
  };
  const openLedger = open.startsWith("ledger:") ? ledgers.find((l) => `ledger:${l.id}` === open) : undefined;
  const shown = all.find((w) => w.id === open) ?? all[0]!;
  const walletOpen = open !== "new" && !openLedger;
  const [action, setAction] = useState<Action | null>(null);
  const [moneyAction, setMoneyAction] = useState<MoneyAction | null>(null);

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
              className={`rep-accounts-tile rep-accounts-${side.tone}${walletOpen && w.id === shown.id ? " rep-accounts-tile-active" : ""}`}
              aria-pressed={walletOpen && w.id === shown.id}
              onClick={() => {
                setOpen(w.id);
                setAction(null);
                setMoneyAction(null);
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
        {ledgers.map((l) => {
          const side = ledgerSide(repLedgerShown(l, repLedgerBalances(book, l.id)));
          const active = open === `ledger:${l.id}`;
          return (
            <button
              key={l.id}
              type="button"
              className={`rep-accounts-tile rep-accounts-named rep-accounts-${side.tone}${active ? " rep-accounts-tile-active" : ""}`}
              aria-pressed={active}
              onClick={() => setOpen(`ledger:${l.id}`)}
            >
              <span>
                {repLedgerKindMeta(l.kind).icon} {l.name}
              </span>
              <strong>
                <bdi dir="ltr">{side.text}</bdi>
              </strong>
              <small>{repLedgerLines(book, l.id).length} عملية</small>
            </button>
          );
        })}
        {!readOnly && (
          <button type="button" className={`rep-accounts-tile rep-accounts-add${open === "new" ? " rep-accounts-tile-active" : ""}`} onClick={() => setOpen("new")}>
            <span>📒</span>
            <strong>➕ حساب</strong>
            <small>أمانة، سلفة، أو أي اسم</small>
          </button>
        )}
      </div>

      {open === "new" ? (
        <NewLedgerForm
          repId={repId}
          book={book}
          onCancel={() => setOpen("SIFA")}
          onSaved={(next, ledger) => {
            storeBook(next);
            setOpen(`ledger:${ledger.id}`);
          }}
        />
      ) : openLedger ? (
        <NamedLedger
          key={openLedger.id}
          ledger={openLedger}
          book={book}
          readOnly={readOnly}
          onChange={storeBook}
          onDeleted={(next) => {
            storeBook(next);
            setOpen("SIFA");
          }}
        />
      ) : (
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
        {shown.id !== "profit" && !readOnly && (
          <div className="rep-accounts-actions">
            {MONEY_ACTIONS.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`dialog-secondary${moneyAction === a.id ? " rep-accounts-action-on" : ""}`}
                onClick={() => setMoneyAction(moneyAction === a.id ? null : a.id)}
              >
                {a.text}
              </button>
            ))}
          </div>
        )}
        {shown.id !== "profit" && moneyAction && (
          <MoneyActionForm
            key={`${shown.id}-${moneyAction}`}
            action={moneyAction}
            currency={shown.id}
            balance={shown.balance[shown.id] ?? 0}
            onCancel={() => setMoneyAction(null)}
            onSettle={(input) => {
              const error = onSettle(input);
              if (!error) setMoneyAction(null);
              return error;
            }}
          />
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
      )}
    </div>
  );
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function MoneyActionForm({
  action,
  currency,
  balance,
  onCancel,
  onSettle,
}: {
  action: MoneyAction;
  currency: string;
  balance: number;
  onCancel: () => void;
  onSettle: (input: UpdateRepSettlementInput) => string | null;
}) {
  const zero = action === "zero" ? repZeroEntry(balance) : null;
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState(action === "zero" ? "🧹 تصفير الحساب" : "");
  const [error, setError] = useState<string | null>(null);
  const hint = MONEY_ACTIONS.find((a) => a.id === action)!.hint;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (action === "zero" && !zero) return setError("الحساب متوازن (0) - لا شيء لتصفيره");
    const value = action === "zero" ? zero!.amount : Number(amount);
    if (!(value > 0)) return setError("اكتب المبلغ");
    const kind = action === "zero" ? zero!.kind : action === "credit" ? "manualCredit" : "manualDebit";
    setError(onSettle({ kind, amount: value, currencyCode: currency, date, ...(note.trim() ? { note: note.trim() } : {}) }));
  }

  return (
    <form className="party-balance-form rep-accounts-form" onSubmit={submit}>
      <p className="settings-hint">{hint}</p>
      {action === "zero" ? (
        <p className="rep-accounts-zero">
          {zero ? (
            <>
              يُضاف «{zero.kind === "manualCredit" ? "له" : "عليه"}» <bdi dir="ltr">{formatAmount(zero.amount)}</bdi> {label(currency)} فيصير الحساب 0.
            </>
          ) : (
            "الحساب متوازن ✓"
          )}
        </p>
      ) : (
        <div className="party-balance-row">
          <input className="search-input" inputMode="decimal" dir="ltr" placeholder="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="المبلغ" autoFocus />
          <span className="search-input rep-accounts-currency">{label(currency)}</span>
        </div>
      )}
      <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
      <input className="search-input" placeholder="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <div className="settings-actions">
        <button type="submit" className="dialog-primary" disabled={action === "zero" && !zero}>
          حفظ
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
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
  // 🧹 the profit as it is now (له or عليه) - zeroing goes either way.
  const signed = useMemo(() => repProfitSigned(days, currency, makeRepConverter([currency], rates)), [days, currency, rates]);
  const zero = action === "zero" ? repProfitZeroEntry(signed) : null;
  const typed = action === "credit" || action === "debit";
  const [amount, setAmount] = useState("");
  const [place, setPlace] = useState("cash");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const places = useMemo(() => loadAccountsBook().accounts.filter((a) => a.currencyCode === currency), [currency]);
  const hint = ACTIONS.find((a) => a.id === action)!.hint;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (action === "zero" && !zero) return setError("ربحه 0 - لا شيء لتصفيره");
    const value = action === "zero" ? zero!.amount : Number(amount || (typed ? "" : suggested));
    if (!(value > 0)) return setError("اكتب المبلغ");
    const text = note.trim() || (action === "zero" ? "🧹 تصفير الربح" : "");
    const base = { amount: value, currencyCode: currency, date, ...(text ? { note: text } : {}) };
    const input: UpdateRepSettlementInput =
      action === "pay"
        ? { ...base, kind: "commissionPayout", ...(place !== "cash" ? { accountId: place } : {}) }
        : action === "credit" || (action === "zero" && zero!.kind === "profitCredit")
          ? { ...base, kind: "profitCredit" }
          : { ...base, kind: "profitTransfer", ...(action === "zero" || action === "debit" ? {} : { toDebt: true }) };
    setError(onSettle(input));
  }

  return (
    <form className="party-balance-form rep-accounts-form" onSubmit={submit}>
      <p className="settings-hint">{hint}</p>
      {action === "zero" && (
        <p className="rep-accounts-zero">
          {zero ? (
            <>
              ربحه الآن {signed > 0 ? "له" : "عليه"} <bdi dir="ltr">{formatAmount(Math.abs(signed))}</bdi> {label(currency)} - يُ{zero.kind === "profitCredit" ? "ضاف" : "خصم"} بقدره فيصير 0.
            </>
          ) : (
            "ربحه 0 ✓"
          )}
        </p>
      )}
      <div className="party-balance-row">
        <input
          className="search-input"
          inputMode="decimal"
          disabled={action === "zero"}
          placeholder={action === "zero" ? (zero ? String(zero.amount) : "0") : !typed && suggested > 0 ? String(suggested) : "المبلغ"}
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
      {!typed && action !== "zero" && suggested > 0 && <small className="settings-hint">ربحه الآن ≈ {formatAmount(suggested)} {label(currency)} - اتركه فارغًا لأخذه كله.</small>}
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

/** 📒 A new named account: a free name, its kind, its currencies (one or more), and the balance it
 * brings from his old ledger app («رصيد افتتاحي», له or عليه, in one of them). */
function NewLedgerForm({ repId, book, onCancel, onSaved }: { repId: string; book: RepLedgerBook; onCancel: () => void; onSaved: (book: RepLedgerBook, ledger: RepLedger) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<RepLedgerKind>("trust");
  const [currencies, setCurrencies] = useState<string[]>(["SIFA"]);
  const [openingCurrency, setOpeningCurrency] = useState("SIFA");
  const currency = currencies.includes(openingCurrency) ? openingCurrency : (currencies[0] ?? "SIFA");
  const [direction, setDirection] = useState<"credit" | "debit">("debit");
  const [opening, setOpening] = useState("");
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const amount = Number(opening || 0);
    if (opening && !(amount > 0)) return setError("الرصيد الافتتاحي غير صحيح");
    const result = createRepLedger(book, { repId, name, kind, currencies, ...(amount > 0 ? { opening: { direction, amount, date, currencyCode: currency } } : {}) });
    if (!result.ok) return setError(result.message);
    onSaved(result.book, result.ledger);
  }

  return (
    <form className="party-balance-form rep-accounts-form rep-ledger-new" onSubmit={submit}>
      <h3>📒 حساب جديد</h3>
      <input className="search-input" placeholder="اسم الحساب (مثال: اورانج، شهر 10، تنزيل دبو)" value={name} onChange={(e) => setName(e.target.value)} aria-label="اسم الحساب" autoFocus />
      <div className="rep-ledger-kinds" role="radiogroup" aria-label="نوع الحساب">
        {REP_LEDGER_KINDS.map((k) => (
          <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind} className={`dash-chip${kind === k.kind ? " dash-chip-on" : ""}`} onClick={() => setKind(k.kind)}>
            {k.icon} {k.label}
          </button>
        ))}
      </div>
      <small className="settings-hint">{repLedgerKindMeta(kind).hint}</small>
      <span className="settings-hint">عملات الحساب (واحدة أو أكثر - يمكن إضافة عملة لاحقًا):</span>
      <div className="rep-ledger-kinds" role="group" aria-label="عملات الحساب">
        {CASH_CURRENCIES.map((c) => {
          const on = currencies.includes(c);
          return (
            <button key={c} type="button" aria-pressed={on} className={`dash-chip${on ? " dash-chip-on" : ""}`} onClick={() => setCurrencies(on ? currencies.filter((x) => x !== c) : [...currencies, c])}>
              {on ? "✓ " : ""}
              {label(c)}
            </button>
          );
        })}
      </div>
      <span className="settings-hint">رصيد افتتاحي من دفترك القديم (اختياري):</span>
      <div className="party-direction">
        <button type="button" className={`party-direction-btn party-direction-we${direction === "credit" ? " party-direction-active" : ""}`} aria-pressed={direction === "credit"} onClick={() => setDirection("credit")}>
          <strong>له</strong>
        </button>
        <button type="button" className={`party-direction-btn party-direction-owes${direction === "debit" ? " party-direction-active" : ""}`} aria-pressed={direction === "debit"} onClick={() => setDirection("debit")}>
          <strong>عليه</strong>
        </button>
      </div>
      <div className="party-balance-row">
        <input className="search-input" inputMode="decimal" dir="ltr" placeholder="0" value={opening} onChange={(e) => setOpening(e.target.value)} aria-label="الرصيد الافتتاحي" />
        <CurrencyPick currencies={currencies.length ? currencies : [currency]} value={currency} onChange={setOpeningCurrency} />
      </div>
      <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <div className="settings-actions">
        <button type="submit" className="dialog-primary">
          إنشاء الحساب
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

type LedgerAction = "credit" | "debit" | "zero" | "rename" | "currencies";

/** The currency beside an amount: fixed text for one, a choice for several. */
function CurrencyPick({ currencies, value, onChange, labelOf = label }: { currencies: string[]; value: string; onChange: (code: string) => void; labelOf?: (code: string) => string }) {
  if (currencies.length <= 1) return <span className="search-input rep-accounts-currency">{labelOf(currencies[0] ?? value)}</span>;
  return (
    <select className="search-input rep-accounts-currency" value={value} onChange={(e) => onChange(e.target.value)} aria-label="العملة">
      {currencies.map((c) => (
        <option key={c} value={c}>
          {labelOf(c)}
        </option>
      ))}
    </select>
  );
}

/** 📒 One named account: its balance, له / عليه / تصفير, rename, delete, and its statement. */
function NamedLedger({ ledger, book, readOnly, onChange, onDeleted }: { ledger: RepLedger; book: RepLedgerBook; readOnly: boolean; onChange: (book: RepLedgerBook) => void; onDeleted: (book: RepLedgerBook) => void }) {
  const lines = repLedgerLines(book, ledger.id);
  const meta = repLedgerKindMeta(ledger.kind);
  const [action, setAction] = useState<LedgerAction | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [name, setName] = useState(ledger.name);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState(ledger.currencies[0]!);
  const currency = ledger.currencies.includes(picked) ? picked : ledger.currencies[0]!;
  const others = CASH_CURRENCIES.filter((c) => !ledger.currencies.includes(c));
  const [adding, setAdding] = useState("");
  const zero = repLedgerZeroEntry(repLedgerBalance(book, ledger.id, currency));
  const side = ledgerSide(repLedgerShown(ledger, repLedgerBalances(book, ledger.id)));
  const shownLabel = (code: string) => label(repLedgerShownCode(ledger, code));
  const shownAmount = (code: string, v: number) => repLedgerShown(ledger, { [code]: v })[repLedgerShownCode(ledger, code)]!;
  const travel = ledger.kind === "travel";
  // 🟠 An أورانج / نيتا account never asked yet: are its amounts in فرنك? (his Oct 19 2026 ask)
  const askFranc = !readOnly && ledger.franc === undefined && ledger.currencies.includes("SIFA") && FRANC_NAME_RE.test(ledger.name);

  function choose(next: LedgerAction) {
    setAction(action === next ? null : next);
    setError(null);
    setAmount("");
    setNote(next === "zero" ? "🧹 تصفير الحساب" : "");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (action === "rename") {
      const result = renameRepLedger(book, ledger.id, name);
      if (!result.ok) return setError(result.message);
      onChange(result.book);
      return setAction(null);
    }
    if (action === "currencies") {
      const code = adding || others[0];
      if (!code) return;
      const result = addRepLedgerCurrency(book, ledger.id, code);
      if (!result.ok) return setError(result.message);
      setError(null);
      setAdding("");
      return onChange(result.book);
    }
    if (action === "zero" && !zero) return setError("الحساب متوازن (0)");
    const entry = action === "zero" ? zero! : { direction: action as "credit" | "debit", amount: repLedgerTyped(ledger, currency, Number(amount)) };
    const result = addRepLedgerEntry(book, ledger.id, { ...entry, currencyCode: currency, date, note });
    if (!result.ok) return setError(result.message);
    onChange(result.book);
    setAction(null);
  }

  function removeCurrency(code: string) {
    const result = removeRepLedgerCurrency(book, ledger.id, code);
    if (!result.ok) return setError(result.message);
    setError(null);
    onChange(result.book);
  }

  async function removeLedger() {
    if (!(await askDeleteCode(`حذف الحساب «${ledger.name}» وكل عملياته (${lines.length})؟`))) return;
    removeLedgerCash(ledgerEntryIds(book, ledger.id));
    onDeleted(deleteRepLedger(book, ledger.id));
  }

  return (
    <section className="rep-accounts-body rep-ledger">
      <h3>
        {meta.icon} {ledger.name}
      </h3>
      <p className={`rep-ledger-balance rep-accounts-${side.tone}`}>
        <strong>
          <bdi dir="ltr">{side.text}</bdi>
        </strong>
        <small>
          {meta.label} · {ledger.currencies.map(shownLabel).join(" + ")} · {travel ? "يمتلئ من «💰 سعر التوثيق» لأجهزته" : "لا علاقة له بالربح ولا بالأجهزة"}
        </small>
      </p>
      {askFranc && (
        <div className="rep-ledger-franc">
          <p>🟠 هذا حساب أورانج: هل المبالغ التي كتبتها فيه بالفرنك (كما تظهر في تطبيق أورانج)؟</p>
          <div className="rep-accounts-actions">
            <button type="button" className="dialog-secondary" onClick={() => onChange(setRepLedgerFranc(book, ledger.id, true, true))}>
              نعم، بالفرنك
            </button>
            <button type="button" className="dialog-secondary" onClick={() => onChange(setRepLedgerFranc(book, ledger.id, true, false))}>
              لا، كانت بالسيفا
            </button>
            <button type="button" className="text-action" onClick={() => onChange(setRepLedgerFranc(book, ledger.id, false))}>
              اتركه بالسيفا
            </button>
          </div>
          <small className="settings-hint">بالفرنك: يظهر الحساب ويُكتب بالفرنك FCFA (5 فرنك = 1 سيفا)، ويُحسب في «حسابي» بالسيفا كأورانج موني.</small>
        </div>
      )}
      {!readOnly && (
        <div className="rep-accounts-actions">
          {(
            [
              ["credit", "➕ له"],
              ["debit", "➖ عليه"],
              ["zero", "🧹 تصفير"],
              ["rename", "✏️ الاسم"],
              ["currencies", "💱 العملات"],
            ] as const
          ).map(([id, text]) => (
            <button key={id} type="button" className={`dialog-secondary${action === id ? " rep-accounts-action-on" : ""}`} onClick={() => choose(id)}>
              {text}
            </button>
          ))}
        </div>
      )}
      {action && (
        <form className="party-balance-form rep-accounts-form" onSubmit={submit}>
          {action === "rename" ? (
            <input className="search-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="اسم الحساب" autoFocus />
          ) : action === "currencies" ? (
            <>
              <ul className="rep-ledger-currencies">
                {ledger.currencies.map((c) => {
                  const used = lines.some((l) => l.entry.currencyCode === c);
                  return (
                    <li key={c}>
                      <strong>{shownLabel(c)}</strong>
                      <small>{used ? `${lines.filter((l) => l.entry.currencyCode === c).length} عملية` : "لا عمليات"}</small>
                      {!used && ledger.currencies.length > 1 && (
                        <button type="button" className="text-action rep-ledger-remove" onClick={() => removeCurrency(c)}>
                          ✕ إزالة
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {others.length > 0 && (
                <select className="search-input" value={adding || others[0]} onChange={(e) => setAdding(e.target.value)} aria-label="عملة جديدة">
                  {others.map((c) => (
                    <option key={c} value={c}>
                      ➕ {label(c)}
                    </option>
                  ))}
                </select>
              )}
              {ledger.currencies.includes("SIFA") && (
                <button type="button" className="dialog-secondary" onClick={() => onChange(setRepLedgerFranc(book, ledger.id, !ledger.franc))}>
                  {ledger.franc ? "🟠 يظهر بالفرنك - اجعله بالسيفا" : "🟠 اجعل السيفا تظهر بالفرنك (أورانج / نيتا)"}
                </button>
              )}
              <small className="settings-hint">لكل عملة رصيدها وحدها - لا تُجمع ولا تُحوَّل. تُزال عملة فقط إذا لم تكن فيها عمليات.</small>
            </>
          ) : action === "zero" ? (
            <>
              {ledger.currencies.length > 1 && <CurrencyPick currencies={ledger.currencies} value={currency} onChange={setPicked} labelOf={shownLabel} />}
              <p className="rep-accounts-zero">
                {zero ? (
                  <>
                    يُضاف «{zero.direction === "credit" ? "له" : "عليه"}» <bdi dir="ltr">{formatAmount(shownAmount(currency, zero.amount))}</bdi> {shownLabel(currency)} فيصير رصيد {shownLabel(currency)} 0.
                  </>
                ) : (
                  `رصيد ${shownLabel(currency)} متوازن ✓`
                )}
              </p>
            </>
          ) : (
            <div className="party-balance-row">
              <input className="search-input" inputMode="decimal" dir="ltr" placeholder="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="المبلغ" autoFocus />
              <CurrencyPick currencies={ledger.currencies} value={currency} onChange={setPicked} labelOf={shownLabel} />
            </div>
          )}
          {action !== "rename" && action !== "currencies" && (
            <>
              <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
              <input className="search-input" placeholder="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
            </>
          )}
          {error && <div className="account-card-alert ledger-form-error">{error}</div>}
          <div className="settings-actions">
            {(action !== "currencies" || others.length > 0) && (
              <button type="submit" className="dialog-primary" disabled={action === "zero" && !zero}>
                {action === "currencies" ? "إضافة العملة" : "حفظ"}
              </button>
            )}
            <button type="button" className="text-action" onClick={() => setAction(null)}>
              إلغاء
            </button>
          </div>
        </form>
      )}
      {lines.length === 0 ? (
        <p className="empty-state">لا عمليات في هذا الحساب بعد.</p>
      ) : (
        <ul className="rep-accounts-lines">
          {lines.map((line) => (
            <li key={line.entry.id}>
              <div>
                <span>{line.entry.travelFor ? "🛂 توثيق" : line.entry.opening ? "📥 رصيد افتتاحي" : line.entry.botId ? "🤖 إيداع من البوت" : line.amount > 0 ? "➕ له" : "➖ عليه"}{line.entry.note && !line.entry.opening ? ` · ${line.entry.note}` : ""}</span>
                <small>
                  <bdi dir="ltr">{line.entry.date}</bdi> · الرصيد بعدها <Money values={repLedgerShown(ledger, { [line.entry.currencyCode]: line.after })} signed />
                </small>
              </div>
              <strong className={line.amount >= 0 ? "rep-accounts-plus" : "rep-accounts-minus"}>
                <Money values={repLedgerShown(ledger, { [line.entry.currencyCode]: line.amount })} signed />
              </strong>
              {!readOnly && !line.entry.travelFor && (
                <button
                  type="button"
                  className="btn-icon rep-ledger-delete"
                  aria-label="حذف العملية"
                  onClick={() => {
                    if (!window.confirm(line.entry.placeId ? "حذف هذه العملية؟ يُحذف معها المال من الكاش / التطبيق الذي دخله." : "حذف هذه العملية؟")) return;
                    removeLedgerCash([line.entry.id]);
                    onChange(deleteRepLedgerEntry(book, line.entry.id));
                  }}
                >
                  🗑
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <button type="button" className="text-action rep-ledger-remove" onClick={() => void removeLedger()}>
          🗑️ حذف هذا الحساب
        </button>
      )}
      {travel && <p className="settings-hint">🛂 كل جهاز له تضع له «💰 سعر التوثيق» (في «✅ تم توثيقها») يدخل هنا «عليه» باسمه بدل حسابه العادي، ويتغير ويُحذف مع السعر.</p>}
      <p className="settings-hint">«+» = له (لصالحه)، «-» = عليه. هذا الحساب وحده: لا يدخل ربحه، ولا يسدد أجهزة زبائنه، ولا يمس حسابه العادي. يُحسب في «حسابي» مع ما له وما عليه.</p>
    </section>
  );
}
