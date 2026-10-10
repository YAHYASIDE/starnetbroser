"use client";

import { FrancHint, FrancUnit } from "./FrancHint";
import { francToSifa, isFrancAccount } from "@/lib/payCurrency";
import { useMemo, useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { CategoryPicker } from "@/components/CategoryPicker";
import { DateInput } from "@/components/DateInput";
import {
  accountForApp,
  bankAppLabel,
  noticeDay,
  partyLabel,
  suggestionDirection,
  suggestionNote,
  type BankSuggestion,
} from "@/lib/bankNotices";
import type { SuggestionChoice } from "@/lib/bankSuggestionSave";
import { formatAmount } from "@/lib/formatAmount";
import { deviceMatchesQuery } from "@/lib/homeInsights";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "@/lib/ledgerStore";
import type { MoneyAccount } from "@/lib/moneyAccounts";
import { allIncomeCategories, debtRemaining, type DebtBook } from "@/lib/myMoney";
import { AIRTIME_CATEGORY_ID, type ExpenseCategory } from "@/lib/personalExpenses";
import type { RepSettlementKind } from "@/lib/repStore";

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

function timeText(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const KIND_ICON: Record<string, string> = { in: "⬇️", out: "⬆️", transfer: "🔁", unknown: "❔" };

function directionText(s: BankSuggestion): string {
  if (s.kind === "transfer") return `🔁 ${bankAppLabel(s.fromApp ?? "")} ← ${bankAppLabel(s.toApp ?? "")}`;
  if (s.kind === "airtime") return "📱 رصيد هاتف";
  if (s.kind === "in") return s.deposit ? "⬇️ إيداع" : "⬇️ وصلك";
  if (s.kind === "out") return "⬆️ خرج";
  return "❔ لم يُفهم";
}

/** أورانج / نيتا write «F CFA» = فرانك (5 فرانك = 1 سيفا) - never the app's سيفا as it is. */
function francNotice(s: BankSuggestion): boolean {
  return (s.app === "orange" || s.app === "nita") && s.currencyCode === "SIFA";
}

function amountText(s: BankSuggestion): string {
  if (s.amount === undefined) return "؟";
  if (francNotice(s)) return `${formatAmount(s.amount)} فرانك = ${formatAmount(francToSifa(s.amount))} سيفا`;
  return `${formatAmount(s.amount)} ${s.currencyCode ? currencyLabel(s.currencyCode) : ""}`.trim();
}

/** «📩 عمليات البنوك»: how many wait, and the switch to turn the reading on. */
export function BankInboxCard({
  pending,
  enabled,
  onOpen,
  onEnable,
}: {
  pending: number;
  /** null = not on the phone (nothing to turn on). */
  enabled: boolean | null;
  onOpen: () => void;
  onEnable: () => void;
}) {
  if (enabled === null && pending === 0) return null;
  return (
    <div className="bank-inbox-card" data-tour="bank-inbox">
      <button type="button" className={`bank-inbox-open${pending > 0 ? " bank-inbox-has" : ""}`} onClick={onOpen}>
        <span>📩 عمليات البنوك</span>
        <strong>{pending > 0 ? `${pending} بانتظار التأكيد` : "لا جديد"}</strong>
      </button>
      {enabled === false && (
        <button type="button" className="dialog-secondary bank-inbox-enable" onClick={onEnable}>
          🔔 فعّل قراءة إشعارات البنوك
        </button>
      )}
    </div>
  );
}

/** The waiting list, and what was already decided. */
export function BankInboxList({
  pending,
  decided,
  onPick,
  onReopen,
}: {
  pending: BankSuggestion[];
  decided: BankSuggestion[];
  onPick: (s: BankSuggestion) => void;
  onReopen: (s: BankSuggestion) => void;
}) {
  const [showDecided, setShowDecided] = useState(false);
  return (
    <div className="bank-inbox">
      {pending.length === 0 ? (
        <p className="party-empty">لا عمليات بانتظار التأكيد. كل إشعار من بنكيلي أو سداد أو نيتا أو بينانس يظهر هنا لتؤكّده.</p>
      ) : (
        <ul className="expenses-list">
          {pending.map((s) => (
            <li key={s.id}>
              <button type="button" className="expenses-row" onClick={() => onPick(s)}>
                <span aria-hidden="true">{KIND_ICON[suggestionDirection(s)]}</span>
                <span className="expenses-row-main">
                  <strong>{partyLabel(s.party) || directionText(s)}</strong>
                  <small>
                    {bankAppLabel(s.app)} · <bdi dir="ltr">{timeText(s.at)}</bdi>
                    {s.kind === "transfer" ? " · 🔁 تحويل بين حساباتك" : ""}
                    {s.kind === "airtime" ? " · 📱 رصيد" : ""}
                    {s.maybeDuplicate ? " · ⚠️ قد يكون مكررًا" : ""}
                  </small>
                </span>
                <bdi dir="ltr" className={`expenses-row-amount${suggestionDirection(s) === "in" ? " money-in" : suggestionDirection(s) === "out" ? "" : " bank-inbox-neutral"}`}>
                  {amountText(s)}
                </bdi>
              </button>
            </li>
          ))}
        </ul>
      )}
      {decided.length > 0 && (
        <>
          <button type="button" className="btn-icon" onClick={() => setShowDecided(!showDecided)}>
            {showDecided ? "إخفاء ما سُجّل" : `🗂️ ما سُجّل أو رُفض (${decided.length})`}
          </button>
          {showDecided && (
            <ul className="money-recurring-list">
              {decided.slice(0, 60).map((s) => (
                <li key={s.id} className="money-account-row">
                  <span>
                    {s.status === "done" ? "✓" : "✕"} {s.outcome ?? (s.status === "rejected" ? "رُفض" : "سُجّل")}
                    <small>
                      {" "}
                      · {partyLabel(s.party) || bankAppLabel(s.app)} · <bdi dir="ltr">{timeText(s.at)}</bdi>
                    </small>
                  </span>
                  <bdi dir="ltr">{amountText(s)}</bdi>
                  {s.status === "rejected" && (
                    <button type="button" className="btn-icon" onClick={() => onReopen(s)}>
                      ↩️
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

type ChoiceType = SuggestionChoice["type"];

const OUT_CHOICES: { type: ChoiceType; label: string }[] = [
  { type: "expense", label: "🧾 مصروف" },
  { type: "new-debt", label: "🤝 دين أعطيته" },
  { type: "debt-payment", label: "🤝 تسديد دين" },
  { type: "supplier", label: "🏭 لمورد" },
  { type: "rep", label: "🧑‍💼 لمندوب" },
  { type: "transfer", label: "🔁 لحسابي" },
  { type: "cash", label: "💵 سحب للكاش" },
];

const IN_CHOICES: { type: ChoiceType; label: string }[] = [
  { type: "income", label: "💵 دخل" },
  { type: "customer", label: "👤 دفعة زبون" },
  { type: "rep", label: "🧑‍💼 من مندوب" },
  { type: "new-debt", label: "🤝 دين أخذته" },
  { type: "debt-payment", label: "🤝 دين رُدّ لي" },
  { type: "transfer", label: "🔁 من حسابي" },
  { type: "cash", label: "💵 إيداع من الكاش" },
];

export interface ConfirmData {
  accounts: MoneyAccount[];
  expenseCustom: ExpenseCategory[];
  incomeCustom: ExpenseCategory[];
  debts: DebtBook;
  suppliers: { id: string; name: string }[];
  reps: { id: string; name: string }[];
  devices: StarlinkAccountSummary[];
  clients: Record<string, { name: string; phone?: string }>;
}

export interface ConfirmInput {
  account: MoneyAccount;
  direction: "in" | "out";
  amount: number;
  currencyCode: string;
  date: string;
  note: string;
  choice: SuggestionChoice;
}

/** One suggestion: what it was, in which account - then ✓ تسجيل or ✕ رفض. */
export function SuggestionConfirm({
  suggestion: s,
  data,
  onSave,
  onReject,
}: {
  suggestion: BankSuggestion;
  data: ConfirmData;
  onSave: (input: ConfirmInput) => string | null;
  onReject: () => void;
}) {
  const transfer = s.kind === "transfer";
  // A transfer is seen from the receiving account: «من حسابي» the sending one.
  const firstAccount = accountForApp(data.accounts, transfer ? s.toApp : s.app) ?? data.accounts[0];
  const [accountId, setAccountId] = useState(firstAccount?.id ?? "");
  const account = data.accounts.find((a) => a.id === accountId);
  const franc = isFrancAccount(account);
  const [direction, setDirection] = useState<"in" | "out">(transfer || s.kind === "in" ? "in" : "out");
  const [amount, setAmount] = useState(s.amount !== undefined ? String(s.amount) : "");
  const [currency, setCurrency] = useState(s.currencyCode ?? firstAccount?.currencyCode ?? "MRU");
  const [date, setDate] = useState(noticeDay(s.at));
  const [note, setNote] = useState(suggestionNote(s));
  const [choice, setChoice] = useState<ChoiceType>(transfer ? "transfer" : s.cashDeposit ? "cash" : s.kind === "in" ? "income" : "expense");
  const [expenseCat, setExpenseCat] = useState(s.kind === "airtime" ? AIRTIME_CATEGORY_ID : "other");
  const [incomeCat, setIncomeCat] = useState(allIncomeCategories(data.incomeCustom)[0]?.id ?? "other");
  const [person, setPerson] = useState(s.party?.name ?? s.party?.number ?? "");
  const [debtId, setDebtId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [repId, setRepId] = useState("");
  const [repKind, setRepKind] = useState<RepSettlementKind>("manualDebit");
  const [otherId, setOtherId] = useState(transfer ? accountForApp(data.accounts, s.fromApp)?.id ?? "" : "");
  const [query, setQuery] = useState(s.party?.name ?? "");
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const choices = (direction === "in" ? IN_CHOICES : OUT_CHOICES).filter((c) => c.type !== "customer" || Boolean(account?.method));
  const openDebts = data.debts.debts.filter((d) => d.kind === (direction === "out" ? "borrowed" : "lent") && debtRemaining(data.debts, d.id) > 0);
  const matches = useMemo(() => {
    if (choice !== "customer" || query.trim().length < 2) return [];
    return data.devices
      .filter((d) => !d.deletedAt && !d.archivedAt && deviceMatchesQuery(query, d, d.clientId ? data.clients[d.clientId] : undefined))
      .slice(0, 6);
  }, [choice, query, data.devices, data.clients]);
  const device = data.devices.find((d) => d.id === deviceId);

  function pickDirection(next: "in" | "out") {
    setDirection(next);
    setChoice(next === "in" ? "income" : "expense");
  }

  function save() {
    setError(null);
    if (!account) return setError("اختر الحساب");
    const value = Number(amount.replace(",", "."));
    if (!(value > 0)) return setError("أدخل المبلغ");
    let picked: SuggestionChoice;
    switch (choice) {
      case "expense":
        picked = { type: "expense", categoryId: expenseCat };
        break;
      case "income":
        picked = { type: "income", categoryId: incomeCat };
        break;
      case "new-debt":
        if (!person.trim()) return setError("اكتب اسم الشخص");
        picked = { type: "new-debt", person };
        break;
      case "debt-payment":
        if (!debtId) return setError("اختر الدين");
        picked = { type: "debt-payment", debtId };
        break;
      case "supplier": {
        const supplier = data.suppliers.find((x) => x.id === supplierId);
        if (!supplier) return setError("اختر المورد");
        picked = { type: "supplier", supplierId: supplier.id, supplierName: supplier.name };
        break;
      }
      case "rep": {
        const rep = data.reps.find((x) => x.id === repId);
        if (!rep) return setError("اختر المندوب");
        picked = { type: "rep", repId: rep.id, repName: rep.name, kind: direction === "in" ? "cashHandover" : repKind };
        break;
      }
      case "customer":
        if (!device) return setError("اختر جهاز الزبون");
        picked = { type: "customer", device: { id: device.id, name: device.name, email: device.expectedEmail || device.starlinkAccountEmail || undefined } };
        break;
      case "transfer": {
        const other = data.accounts.find((a) => a.id === otherId);
        if (!other || other.id === account.id) return setError("اختر الحساب الآخر");
        picked = { type: "transfer", otherAccount: other };
        break;
      }
      case "cash":
        picked = { type: "cash" };
        break;
    }
    // 🟠 أورانج / نيتا: the amount is in فرانك, kept in سيفا ÷5.
    setError(onSave({ account, direction, amount: franc ? francToSifa(value) : value, currencyCode: franc ? "SIFA" : currency, date, note, choice: picked }));
  }

  return (
    <div className="party-balance-form bank-confirm">
      <div className={`bank-confirm-head${direction === "in" && !transfer ? " is-in" : transfer ? "" : " is-out"}`}>
        <strong>
          <bdi dir="ltr">{amountText(s)}</bdi>
        </strong>
        <span>
          {directionText(s)} · {bankAppLabel(s.app)} · <bdi dir="ltr">{timeText(s.at)}</bdi>
        </span>
        {partyLabel(s.party) && <span>👤 {partyLabel(s.party)}</span>}
        {s.txId && (
          <small>
            رقم العملية <bdi dir="ltr">{s.txId}</bdi>
          </small>
        )}
        {s.maybeDuplicate && <small className="bank-confirm-warn">⚠️ نفس الإشعار وصل قبل قليل - قد يكون مكررًا، أو عملية ثانية حقيقية.</small>}
      </div>

      <details className="bank-confirm-raw">
        <summary>نص الإشعار كاملًا</summary>
        {s.notices.map((n) => (
          <p key={n.id}>
            <b>
              {bankAppLabel(n.app)} · {n.title}
            </b>
            <br />
            {n.text}
            <br />
            <small>
              <bdi dir="ltr">{timeText(n.at)}</bdi>
            </small>
          </p>
        ))}
      </details>

      {s.kind === "unknown" && (
        <div className="money-presets expenses-cats" role="group" aria-label="الاتجاه">
          <button type="button" className={`expenses-cat${direction === "in" ? " money-preset-active" : ""}`} onClick={() => pickDirection("in")}>
            <span aria-hidden="true">⬇️</span>
            <small>دخل لحسابي</small>
          </button>
          <button type="button" className={`expenses-cat${direction === "out" ? " money-preset-active" : ""}`} onClick={() => pickDirection("out")}>
            <span aria-hidden="true">⬆️</span>
            <small>خرج من حسابي</small>
          </button>
        </div>
      )}

      <label className="tool-field money-source">
        <span>{direction === "in" ? "دخل إلى" : "خرج من"}</span>
        <select className="search-input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.icon} {a.name}
            </option>
          ))}
        </select>
      </label>

      <div className="expenses-amount-row">
        <input className="search-input" type="text" lang="en" dir="ltr" inputMode="decimal" placeholder="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} />
        {franc ? (
          <FrancUnit />
        ) : (
          <select className="search-input" value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="العملة">
            {LEDGER_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {currencyLabel(code)}
              </option>
            ))}
          </select>
        )}
      </div>
      {franc && <FrancHint amount={amount} where={account?.name} />}
      <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />

      <strong className="bank-confirm-q">ماذا كانت؟</strong>
      <div className="money-presets expenses-cats" role="group" aria-label="ماذا كانت">
        {choices.map((c) => (
          <button key={c.type} type="button" className={`expenses-cat${choice === c.type ? " money-preset-active" : ""}`} onClick={() => setChoice(c.type)}>
            <small>{c.label}</small>
          </button>
        ))}
      </div>

      {choice === "expense" && <CategoryPicker label="نوع المصروف" tree={data.expenseCustom} selectedId={expenseCat} onPick={setExpenseCat} />}

      {choice === "income" && <CategoryPicker label="نوع الدخل" tree={data.incomeCustom} selectedId={incomeCat} onPick={setIncomeCat} />}

      {choice === "new-debt" && <input className="search-input" value={person} onChange={(e) => setPerson(e.target.value)} placeholder="اسم الشخص" />}

      {choice === "debt-payment" &&
        (openDebts.length === 0 ? (
          <p className="party-empty">{direction === "out" ? "لا دين أخذته باقٍ عليك." : "لا دين أعطيته باقٍ لك."} سجّله أولًا في «الديون».</p>
        ) : (
          <select className="search-input" value={debtId} onChange={(e) => setDebtId(e.target.value)} aria-label="الدين">
            <option value="">اختر الدين…</option>
            {openDebts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.person} - باقٍ {formatAmount(debtRemaining(data.debts, d.id))} {currencyLabel(d.currencyCode)}
              </option>
            ))}
          </select>
        ))}

      {choice === "supplier" && (
        <select className="search-input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label="المورد">
          <option value="">اختر المورد…</option>
          {data.suppliers.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      )}

      {choice === "rep" && (
        <>
          <select className="search-input" value={repId} onChange={(e) => setRepId(e.target.value)} aria-label="المندوب">
            <option value="">اختر المندوب…</option>
            {data.reps.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          {direction === "out" ? (
            <select className="search-input" value={repKind} onChange={(e) => setRepKind(e.target.value as RepSettlementKind)} aria-label="ماذا أعطيته">
              <option value="manualDebit">سلفة / مال أعطيته (عليه)</option>
              <option value="commissionPayout">دفع عمولته</option>
            </select>
          ) : (
            <small className="settings-hint">سلّمك ما جمعه - يُنقص ما عليه.</small>
          )}
        </>
      )}

      {choice === "customer" && (
        <>
          <input className="search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن الجهاز أو الزبون" />
          {device ? (
            <button type="button" className="expenses-row money-preset-active" onClick={() => setDeviceId("")}>
              <span aria-hidden="true">📡</span>
              <span className="expenses-row-main">
                <strong>{device.name}</strong>
                <small>{device.clientId ? data.clients[device.clientId]?.name : ""} · غيّر</small>
              </span>
            </button>
          ) : (
            <ul className="expenses-list">
              {matches.map((d) => (
                <li key={d.id}>
                  <button type="button" className="expenses-row" onClick={() => setDeviceId(d.id)}>
                    <span aria-hidden="true">📡</span>
                    <span className="expenses-row-main">
                      <strong>{d.name}</strong>
                      <small>{d.clientId ? data.clients[d.clientId]?.name : ""}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {choice === "transfer" && (
        <label className="tool-field money-source">
          <span>{direction === "in" ? "من حسابي" : "إلى حسابي"}</span>
          <select className="search-input" value={otherId} onChange={(e) => setOtherId(e.target.value)}>
            <option value="">اختر…</option>
            {data.accounts
              .filter((a) => a.id !== accountId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name}
                </option>
              ))}
          </select>
        </label>
      )}

      <input className="search-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة" />
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <div className="expenses-amount-row">
        <button type="button" className="dialog-primary" onClick={save}>
          ✓ تسجيل
        </button>
        <button type="button" className="dialog-danger" onClick={onReject}>
          ✕ رفض
        </button>
      </div>
    </div>
  );
}
