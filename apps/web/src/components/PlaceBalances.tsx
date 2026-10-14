"use client";

import { createContext, useContext } from "react";
import { cashCurrencyLabel } from "@/lib/cashCurrencies";
import { formatAmount } from "@/lib/formatAmount";
import { isFrancAccount, sifaToFranc } from "@/lib/payCurrency";

/** 💰 Every money place's balance now (placeId → currency → amount; "cash" = الكاش) and the accounts
 * (for فرانك), provided once by «حسابي» so every account choice can show its current balance (his
 * Oct 10 2026 request «في كل مكان رصيد الحساب ظاهر»). */
export interface PlaceBalancesValue {
  balances: Record<string, Record<string, number>>;
  accounts: { id: string; currencyCode?: string; method?: string }[];
}

export const PlaceBalancesContext = createContext<PlaceBalancesValue | null>(null);

/** «الرصيد الآن: 312,500 فرانك» under an account choice; nothing outside «حسابي» or for «لا هذا ولا ذاك».
 * `currency`: only that currency (الكاش in a chosen currency). */
export function BalanceHint({ placeId, currency }: { placeId: string; currency?: string }) {
  const ctx = useContext(PlaceBalancesContext);
  if (!ctx || !placeId || placeId === "none") return null;
  const byCurrency = ctx.balances[placeId] ?? {};
  const account = ctx.accounts.find((a) => a.id === placeId);
  const franc = isFrancAccount(account);
  const codes = currency ? [currency] : Object.keys(byCurrency).filter((c) => Math.abs(byCurrency[c]!) > 0.004);
  const parts = (codes.length ? codes : [account?.currencyCode ?? "MRU"]).map((code) => {
    const v = byCurrency[code] ?? 0;
    const shown = franc && code === "SIFA" ? sifaToFranc(v) : v;
    return { code, text: `${shown < 0 ? "-" : ""}${formatAmount(Math.round(Math.abs(shown) * 100) / 100)}`, unit: franc && code === "SIFA" ? "فرانك" : cashCurrencyLabel(code), low: v < 0 };
  });
  return (
    <small className="balance-hint">
      💰 الرصيد الآن:{" "}
      {parts.map((p, i) => (
        <span key={p.code} className={p.low ? "money-out" : undefined}>
          {i ? " + " : ""}
          <bdi dir="ltr">{p.text}</bdi> {p.unit}
        </span>
      ))}
    </small>
  );
}
