"use client";

import { useState } from "react";
import { formatAmount } from "@/lib/formatAmount";
import { LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "@/lib/ledgerStore";
import { accountDisplayUnit, toDisplayAmount, type MoneyAccount } from "@/lib/moneyAccounts";
import type { PlaceLedger } from "@/lib/placeLedger";

const PAGE = 60;

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

/** 📄 «كشف حساب» of one bank / wallet / الكاش: every movement, newest first, with the balance right
 * after it (lib/placeLedger.ts). Orange / Nita in فرانك, like everywhere else. */
export function PlaceStatement({ ledger, account }: { ledger: PlaceLedger; account?: MoneyAccount }) {
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
