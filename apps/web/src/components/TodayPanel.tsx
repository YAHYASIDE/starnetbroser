"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { CashEntryList } from "@/lib/cashStore";
import { formatAmount } from "@/lib/formatAmount";
import { computeTodaySummary } from "@/lib/homeInsights";
import { LEDGER_CURRENCY_LABELS, LedgerByAccount, LedgerCurrency } from "@/lib/ledgerStore";

export function AmountStack({ values, prefix = "", hideEmpty = false }: { values: Record<string, number>; prefix?: string; hideEmpty?: boolean }) {
  const codes = Object.keys(values).filter((c) => Math.abs(values[c]!) > 0.0001);
  if (codes.length === 0) return hideEmpty ? null : <strong>0</strong>;
  return (
    <>
      {codes.map((code) => (
        <strong key={code}>
          <bdi dir="ltr">
            {prefix}
            {formatAmount(values[code]!)}
          </bdi>{" "}
          {LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code}
        </strong>
      ))}
    </>
  );
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "📅 اليوم" - today's device collections, new shipments, cash in/out and renewals due. Lives on
 * the reports page (money belongs there, not on the home screen). */
export function TodayPanel({
  ledgerStore,
  cashEntries,
  renewalsToday,
}: {
  ledgerStore: LedgerByAccount;
  cashEntries: CashEntryList;
  renewalsToday: number;
}) {
  const todayIso = localToday();
  const today = useMemo(() => computeTodaySummary(ledgerStore, cashEntries, todayIso), [ledgerStore, cashEntries, todayIso]);
  return (
    <section className="today-panel" aria-label="اليوم">
      <div className="today-head">
        <strong>📅 اليوم</strong>
        <span dir="ltr">{todayIso}</span>
      </div>
      <div className="today-tiles">
        <div className="today-tile today-collected">
          <span>تحصيل الأجهزة</span>
          <AmountStack values={today.collected} />
        </div>
        <div className="today-tile today-charged">
          <span>شحنات جديدة</span>
          <AmountStack values={today.charged} />
        </div>
        <Link href="/store" className="today-tile today-cash">
          <span>الصندوق (دخل / خرج)</span>
          <AmountStack values={today.cashIn} prefix="+" />
          <AmountStack values={today.cashOut} prefix="-" hideEmpty />
        </Link>
        <Link href="/" className="today-tile today-renewals">
          <span>تجديد اليوم</span>
          <strong>{renewalsToday}</strong>
        </Link>
      </div>
    </section>
  );
}
