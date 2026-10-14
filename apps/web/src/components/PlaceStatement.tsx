"use client";

import { useState } from "react";
import { formatAmount } from "@/lib/formatAmount";
import { cashCurrencyLabel } from "@/lib/cashCurrencies";
import { accountDisplayUnit, toDisplayAmount, type MoneyAccount } from "@/lib/moneyAccounts";
import type { PlaceLedger, PlaceLedgerCurrency } from "@/lib/placeLedger";
import { balanceDifference, explainDifference, type PendingNotice } from "@/lib/balanceMatch";

const PAGE = 60;

function currencyLabel(code: string): string {
  return cashCurrencyLabel(code);
}

/** 📄 «كشف حساب» of one bank / wallet / الكاش: every movement, newest first, with the balance right
 * after it (lib/placeLedger.ts). Orange / Nita in فرانك, like everywhere else. */
export function PlaceStatement({
  ledger,
  account,
  pending = [],
  thresholds = {},
  onThreshold,
  onCorrect,
}: {
  ledger: PlaceLedger;
  account?: MoneyAccount;
  /** 📩 Bank notifications still waiting that touch this place. */
  pending?: PendingNotice[];
  /** 🔔 currency → the floor set for it. */
  thresholds?: Record<string, number>;
  onThreshold?: (currency: string, value: number | undefined) => void;
  /** Records «تسوية» so the balance becomes `actual`; returns an error or null. */
  onCorrect?: (currency: string, actual: number) => string | null;
}) {
  const [shown, setShown] = useState(PAGE);
  const unit = account ? accountDisplayUnit(account) : null;
  const fmt = (value: number, currency: string) => {
    const converted = unit && currency === account?.currencyCode;
    const n = converted ? toDisplayAmount(value, unit) : value;
    return { number: `${n < 0 ? "-" : ""}${formatAmount(Math.round(Math.abs(n) * 100) / 100)}`, label: converted ? unit.label : currencyLabel(currency) };
  };
  const Money = ({ value, currency, sign }: { value: number; currency: string; sign?: boolean }) => {
    const f = fmt(value, currency);
    return (
      <span className="place-ledger-money">
        <bdi dir="ltr">{sign && value > 0 ? `+${f.number}` : f.number}</bdi> {f.label}
      </span>
    );
  };

  return (
    <div className="place-ledger">
      {!ledger.place.balanceKnown && <p className="settings-hint">⚠️ لم يُكتب رصيد هذا الحساب بعد - الكشف يبدأ من 0.</p>}
      {ledger.currencies.map((c) => {
        const rows = [...c.rows].reverse();
        const sifaNote = unit && c.currency === account?.currencyCode;
        return (
          <section key={c.currency} className="place-ledger-currency">
            {ledger.currencies.length > 1 && <strong className="money-group-title">{currencyLabel(c.currency)}</strong>}
            <div className="place-ledger-totals">
              <span>
                الرصيد الآن <Money value={c.closing} currency={c.currency} />
                {sifaNote && (
                  <small>
                    {" "}
                    (= <bdi dir="ltr">{formatAmount(Math.round(c.closing * 100) / 100)}</bdi> سيفا)
                  </small>
                )}
              </span>
              <small>
                دخل <Money value={c.received} currency={c.currency} /> · خرج <Money value={c.paid} currency={c.currency} />
              </small>
            </div>
            <PlaceTools
              ledger={c}
              unitLabel={sifaNote && unit ? unit.label : currencyLabel(c.currency)}
              toShown={(v) => (sifaNote && unit ? toDisplayAmount(v, unit) : v)}
              fromShown={(v) => (sifaNote && unit ? v / unit.perCurrencyUnit : v)}
              Money={Money}
              pending={pending}
              threshold={thresholds[c.currency]}
              onThreshold={onThreshold ? (v) => onThreshold(c.currency, v) : undefined}
              onCorrect={onCorrect ? (actual) => onCorrect(c.currency, actual) : undefined}
            />
            {rows.length === 0 ? (
              <p className="settings-hint">لا حركات بعد.</p>
            ) : (
              <ul className="place-ledger-list">
                {rows.slice(0, shown).map((r) => (
                  <li key={r.id} className={`place-ledger-row ${r.direction}`}>
                    <span className="place-ledger-what">
                      <small>
                        <bdi dir="ltr">{r.date}</bdi> · {r.kindLabel}
                      </small>
                      {r.label}
                    </span>
                    <span className="place-ledger-figures">
                      <b className={r.direction === "in" ? "place-ledger-in" : "place-ledger-out"}>
                        <Money value={r.direction === "in" ? r.amount : -r.amount} currency={c.currency} sign />
                      </b>
                      <small>
                        الرصيد <Money value={r.balance} currency={c.currency} />
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {rows.length > shown && (
              <button type="button" className="btn-icon" onClick={() => setShown(shown + PAGE)}>
                عرض المزيد ({rows.length - shown})
              </button>
            )}
            <p className="place-ledger-opening">
              {ledger.from ? (
                <>
                  الرصيد الافتتاحي يوم <bdi dir="ltr">{ledger.from}</bdi>: <Money value={c.opening} currency={c.currency} />
                </>
              ) : (
                <>
                  البداية: <Money value={c.opening} currency={c.currency} />
                </>
              )}
            </p>
          </section>
        );
      })}
      {ledger.before > 0 && (
        <p className="settings-hint">
          {ledger.before} حركة قبل يوم الرصيد الافتتاحي لا تُحسب (الرصيد الذي كتبته يشملها).
        </p>
      )}
      <p className="settings-hint">حركة خاطئة؟ احذفها أو عدّلها من مكانها (الحوالات، المصاريف، الدخل، الزبون…) فيتصحّح الرصيد.</p>
    </div>
  );
}

const parseTyped = (text: string) => Number(text.replace(/[\s,]/g, ""));

/** 🔍 «مطابقة الرصيد» and 🔔 the low-balance floor, for one currency of the place. */
function PlaceTools({
  ledger,
  unitLabel,
  toShown,
  fromShown,
  Money,
  pending,
  threshold,
  onThreshold,
  onCorrect,
}: {
  ledger: PlaceLedgerCurrency;
  unitLabel: string;
  toShown: (v: number) => number;
  fromShown: (v: number) => number;
  Money: (props: { value: number; currency: string; sign?: boolean }) => React.ReactElement;
  pending: PendingNotice[];
  threshold?: number;
  onThreshold?: (value: number | undefined) => void;
  onCorrect?: (actual: number) => string | null;
}) {
  const [open, setOpen] = useState<"match" | "alert" | null>(null);
  const [actualText, setActualText] = useState("");
  const [floorText, setFloorText] = useState(threshold !== undefined ? String(Math.round(toShown(threshold))) : "");
  const [message, setMessage] = useState<string | null>(null);
  const typed = parseTyped(actualText);
  const actual = actualText.trim() !== "" && Number.isFinite(typed) ? fromShown(typed) : undefined;
  const diff = actual === undefined ? undefined : balanceDifference(ledger.closing, actual);
  const candidates = diff === undefined ? [] : explainDifference(ledger.rows, diff, pending, { mru: ledger.currency === "MRU" });
  const low = threshold !== undefined && ledger.closing < threshold;
  return (
    <div className="place-tools">
      <div className="place-tools-buttons">
        <button type="button" className={`btn-icon${open === "match" ? " is-active" : ""}`} onClick={() => setOpen(open === "match" ? null : "match")}>
          🔍 مطابقة الرصيد
        </button>
        {onThreshold && (
          <button type="button" className={`btn-icon${open === "alert" ? " is-active" : ""}${low ? " place-low" : ""}`} onClick={() => setOpen(open === "alert" ? null : "alert")}>
            🔔 {threshold !== undefined ? <>تنبيه تحت <Money value={threshold} currency={ledger.currency} /></> : "تنبيه الرصيد"}
          </button>
        )}
      </div>
      {open === "match" && (
        <div className="place-match">
          <label className="form-field">
            <span>الرصيد الحقيقي في التطبيق الآن ({unitLabel})</span>
            <input className="search-input" inputMode="decimal" dir="ltr" value={actualText} onChange={(e) => setActualText(e.target.value)} placeholder="0" />
          </label>
          {diff !== undefined && (
            <>
              <p className={`place-match-diff${diff === 0 ? " is-ok" : ""}`}>
                {diff === 0 ? (
                  "✓ مطابق تماماً"
                ) : (
                  <>
                    الفرق <Money value={diff} currency={ledger.currency} sign /> - {diff < 0 ? "التطبيق يُظهر أكثر من الحقيقي" : "التطبيق يُظهر أقل من الحقيقي"}
                  </>
                )}
              </p>
              {diff !== 0 && candidates.length === 0 && <p className="settings-hint">لم أجد حركة تفسّر الفرق وحدها - راجع الكشف تحته.</p>}
              {candidates.length > 0 && (
                <ul className="place-match-list">
                  {candidates.map((cand, i) => (
                    <li key={i}>
                      <strong>{cand.hint}</strong>
                      {cand.pending ? (
                        <small>
                          📩 <bdi dir="ltr">{cand.pending.date}</bdi> · {cand.pending.label} · <Money value={cand.pending.signed} currency={ledger.currency} sign />
                        </small>
                      ) : (
                        cand.rows.map((r) => (
                          <small key={r.id}>
                            <bdi dir="ltr">{r.date}</bdi> · {r.kindLabel} · {r.label} · <Money value={r.direction === "in" ? r.amount : -r.amount} currency={ledger.currency} sign />
                          </small>
                        ))
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {diff !== 0 && onCorrect && (
                <button
                  type="button"
                  className="dialog-primary"
                  onClick={() => {
                    if (!window.confirm(`تسجيل تسوية بالفرق حتى يصير الرصيد ${formatAmount(typed)} ${unitLabel}؟ (احذف أو صحّح الحركات الخاطئة أولاً إن وجدتها)`)) return;
                    const error = onCorrect(actual!);
                    setMessage(error ?? "✓ سُجّلت التسوية");
                    if (!error) setActualText("");
                  }}
                >
                  ✓ سجّل الفرق تسوية
                </button>
              )}
            </>
          )}
          {message && <p className="settings-hint">{message}</p>}
        </div>
      )}
      {open === "alert" && onThreshold && (
        <div className="place-match">
          <label className="form-field">
            <span>نبّهني إذا نزل الرصيد تحت ({unitLabel}) - فارغ = بلا تنبيه</span>
            <input className="search-input" inputMode="decimal" dir="ltr" value={floorText} onChange={(e) => setFloorText(e.target.value)} placeholder="مثلاً 100000" />
          </label>
          <button
            type="button"
            className="dialog-primary"
            onClick={() => {
              const v = parseTyped(floorText);
              onThreshold(floorText.trim() === "" || !(v > 0) ? undefined : fromShown(v));
              setMessage(floorText.trim() === "" ? "أُلغي التنبيه" : "✓ حُفظ التنبيه");
              setOpen(null);
            }}
          >
            حفظ
          </button>
        </div>
      )}
    </div>
  );
}
