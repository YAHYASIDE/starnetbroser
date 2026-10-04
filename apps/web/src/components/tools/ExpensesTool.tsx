"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { buildExpenseReport, previousMonth } from "@/lib/expenseReport";
import { currencyLabelFor, todayIso, type ToolsData } from "./useToolsData";

function monthLabel(month: string): string {
  return `${month.slice(5, 7)}/${month.slice(0, 4)}`;
}

/** 💸 This month's expenses by category, next to last month's. */
export function ExpensesTool({ data }: { data: ToolsData }) {
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const report = useMemo(() => buildExpenseReport(data.cash, month), [data.cash, month]);
  const label = currencyLabelFor(data.currencies);
  const currencies = Object.keys(report);
  const next = (() => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y!, m!, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  return (
    <div className="tool-body">
      <div className="tool-month">
        <button type="button" className="tool-chip" onClick={() => setMonth(previousMonth(month))} aria-label="الشهر السابق">
          →
        </button>
        <strong>
          <bdi dir="ltr">{monthLabel(month)}</bdi>
        </strong>
        <button type="button" className="tool-chip" onClick={() => setMonth(next)} disabled={next > todayIso().slice(0, 7)} aria-label="الشهر التالي">
          ←
        </button>
      </div>
      {currencies.length === 0 && (
        <p className="settings-hint">
          لا مصاريف مسجلة. سجّلها من <Link href="/store">المتجر ← الكاش</Link> كـ«خروج» مع فئة (إيجار، نقل…).
        </p>
      )}
      {currencies.map((code) => {
        const bucket = report[code]!;
        const max = Math.max(1, ...bucket.rows.map((r) => Math.max(r.amount, r.previous)));
        const change = bucket.previousTotal > 0 ? ((bucket.total - bucket.previousTotal) / bucket.previousTotal) * 100 : null;
        return (
          <div key={code} className="tool-goal">
            <div className="tool-goal-head">
              <strong>
                {Math.round(bucket.total).toLocaleString("en-US")} {label(code)}
              </strong>
              {change !== null && (
                <span className={change > 0 ? "telegram-stopped" : "telegram-running"}>
                  <bdi dir="ltr">
                    {change > 0 ? "+" : ""}
                    {Math.round(change)}%
                  </bdi>{" "}
                  عن الشهر السابق
                </span>
              )}
            </div>
            <ul className="tool-bars">
              {bucket.rows.map((row) => (
                <li key={row.category} className="expense-row">
                  <span className="tool-bar-label">{row.category}</span>
                  <span className="tool-bar-track">
                    <span className="tool-bar-fill" style={{ width: `${(row.amount / max) * 100}%` }} />
                  </span>
                  <span className="expense-value">
                    <bdi dir="ltr">{Math.round(row.amount).toLocaleString("en-US")}</bdi>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
