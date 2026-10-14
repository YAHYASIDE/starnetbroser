"use client";

import { useMemo, useState } from "react";
import { calculateProfit, priceForProfit } from "@/lib/profitCalculator";
import { currencyLabelFor, currencyOptions, type ToolsData } from "./useToolsData";

function fmt(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** 🧮 What-if: Starlink's cost vs the price asked, with the rep's share - nothing is saved. */
export function CalculatorTool({ data }: { data: ToolsData }) {
  const currencies = currencyOptions(data.currencies);
  const has = (code: string) => currencies.some((c) => c.code === code);
  const [costAmount, setCostAmount] = useState("50");
  const [costCurrency, setCostCurrency] = useState(has("USD") ? "USD" : currencies[0]!.code);
  const [saleAmount, setSaleAmount] = useState("");
  const [saleCurrency, setSaleCurrency] = useState(has("MRU") ? "MRU" : currencies[0]!.code);
  const [extra, setExtra] = useState("");
  const [repPercent, setRepPercent] = useState("0");
  const [target, setTarget] = useState("");
  const label = currencyLabelFor(data.currencies);
  const rates = useMemo(() => Object.fromEntries(Object.values(data.currencies).map((c) => [c.code, c.rateFromUsd])), [data.currencies]);
  const input = { costAmount: Number(costAmount), costCurrency, saleCurrency, rates, repPercent: Number(repPercent), extraCost: Number(extra) || 0 };
  const result = calculateProfit({ ...input, saleAmount: Number(saleAmount) });
  const suggested = Number(target) > 0 ? priceForProfit(input, Number(target), saleCurrency === "USD" ? 1 : 100) : null;
  const reps = Object.values(data.reps);

  const select = (value: string, set: (v: string) => void, aria: string) => (
    <select value={value} onChange={(e) => set(e.target.value)} aria-label={aria}>
      {currencies.map((c) => (
        <option key={c.code} value={c.code}>
          {c.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="tool-body">
      <label className="tool-field">
        <span>تكلفة Starlink</span>
        <div className="tool-form-row">
          <input className="search-input" inputMode="decimal" dir="ltr" value={costAmount} onChange={(e) => setCostAmount(e.target.value)} />
          {select(costCurrency, setCostCurrency, "عملة التكلفة")}
        </div>
      </label>
      <label className="tool-field">
        <span>سعر البيع للزبون</span>
        <div className="tool-form-row">
          <input className="search-input" inputMode="decimal" dir="ltr" value={saleAmount} onChange={(e) => setSaleAmount(e.target.value)} placeholder="0" />
          {select(saleCurrency, setSaleCurrency, "عملة البيع")}
        </div>
      </label>
      <div className="tool-form-row">
        <label className="tool-field">
          <span>مصاريف أخرى ({label(saleCurrency)})</span>
          <input className="search-input" inputMode="decimal" dir="ltr" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0" />
        </label>
        <label className="tool-field">
          <span>نسبة المندوب %</span>
          <input className="search-input" inputMode="numeric" dir="ltr" value={repPercent} onChange={(e) => setRepPercent(e.target.value)} list="rep-percents" />
          <datalist id="rep-percents">
            {[...new Set(reps.map((r) => r.commissionPercent).filter((p) => typeof p === "number"))].map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
      </div>
      {result ? (
        <div className="tool-kpis">
          <div className="tool-kpi">
            <span>التكلفة</span>
            <strong>
              <bdi dir="ltr">{fmt(result.cost)}</bdi> {label(saleCurrency)}
            </strong>
          </div>
          <div className={`tool-kpi ${result.profit >= 0 ? "tool-kpi-good" : "tool-kpi-bad"}`}>
            <span>الربح</span>
            <strong>
              <bdi dir="ltr">{fmt(result.profit)}</bdi> {label(saleCurrency)}
            </strong>
            <small>
              هامش <bdi dir="ltr">{result.margin.toFixed(1)}%</bdi>
            </small>
          </div>
          {result.repShare > 0 && (
            <div className="tool-kpi">
              <span>حصة المندوب</span>
              <strong>
                <bdi dir="ltr">{fmt(result.repShare)}</bdi>
              </strong>
            </div>
          )}
          <div className="tool-kpi">
            <span>صافي لك</span>
            <strong>
              <bdi dir="ltr">{fmt(result.net)}</bdi> {label(saleCurrency)}
            </strong>
          </div>
        </div>
      ) : (
        <p className="settings-hint">اكتب سعر البيع لترى الربح. {Object.keys(rates).length === 0 ? "أضف أسعار الصرف من «العملات»." : ""}</p>
      )}
      <label className="tool-field">
        <span>🎯 أريد ربحاً قدره ({label(saleCurrency)})</span>
        <input className="search-input" inputMode="decimal" dir="ltr" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="مثلاً 1000" />
      </label>
      {suggested !== null && (
        <p className="tool-suggest">
          بِع بـ{" "}
          <strong>
            <bdi dir="ltr">{fmt(suggested)}</bdi> {label(saleCurrency)}
          </strong>{" "}
          <button type="button" className="text-action" onClick={() => setSaleAmount(String(suggested))}>
            استعمله
          </button>
        </p>
      )}
      <p className="settings-hint">يحسب بأسعار الصرف الحالية في «العملات» - للتقدير فقط، لا يُسجَّل شيء.</p>
    </div>
  );
}
