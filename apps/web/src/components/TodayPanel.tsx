"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PartySheet } from "@/components/AccountsSection";
import { homeSearchHref } from "@/lib/homeActions";
import type { CashEntryList } from "@/lib/cashStore";
import { formatAmount } from "@/lib/formatAmount";
import { computeTodaySummary, listTodayLines, TodayLine } from "@/lib/homeInsights";
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

type TileKey = "collected" | "charged" | "cash" | "renewals";

const TILE_TITLES: Record<TileKey, string> = {
  collected: "💵 تحصيل الأجهزة اليوم",
  charged: "📦 شحنات اليوم",
  cash: "🧾 الكاش اليوم",
  renewals: "🔁 تجديد اليوم",
};

export interface TodayNames {
  device: (accountId: string) => string;
  client: (accountId: string) => string | undefined;
}

/** "📅 اليوم" - today's device collections, new shipments, cash in/out and renewals due. Lives on
 * the reports page (money belongs there, not on the home screen). Each tile opens the operations
 * behind its number. */
export function TodayPanel({
  ledgerStore,
  cashEntries,
  renewalsToday,
  names,
}: {
  ledgerStore: LedgerByAccount;
  cashEntries: CashEntryList;
  /** Devices whose renewal falls today. */
  renewalsToday: { id: string; name: string }[];
  names: TodayNames;
}) {
  const todayIso = localToday();
  const today = useMemo(() => computeTodaySummary(ledgerStore, cashEntries, todayIso), [ledgerStore, cashEntries, todayIso]);
  const lines = useMemo(() => listTodayLines(ledgerStore, cashEntries, todayIso), [ledgerStore, cashEntries, todayIso]);
  const [open, setOpen] = useState<TileKey | null>(null);
  return (
    <section className="today-panel" aria-label="اليوم">
      <div className="today-head">
        <strong>📅 اليوم</strong>
        <Link href="/tools#today" className="today-plan-link">
          ✅ خطة اليوم
        </Link>
        <span dir="ltr">{todayIso}</span>
      </div>
      <div className="today-tiles">
        <button type="button" className="today-tile today-collected" onClick={() => setOpen("collected")}>
          <span>تحصيل الأجهزة · {lines.collected.length}</span>
          <AmountStack values={today.collected} />
        </button>
        <button type="button" className="today-tile today-charged" onClick={() => setOpen("charged")}>
          <span>شحنات جديدة · {lines.charged.length}</span>
          <AmountStack values={today.charged} />
        </button>
        <button type="button" className="today-tile today-cash" onClick={() => setOpen("cash")}>
          <span>الكاش (دخل / خرج)</span>
          <AmountStack values={today.cashIn} prefix="+" />
          <AmountStack values={today.cashOut} prefix="-" hideEmpty />
        </button>
        <button type="button" className="today-tile today-renewals" onClick={() => setOpen("renewals")}>
          <span>تجديد اليوم</span>
          <strong>{renewalsToday.length}</strong>
        </button>
      </div>
      {open && (
        <PartySheet title={TILE_TITLES[open]} onClose={() => setOpen(null)}>
          {open === "renewals" ? (
            renewalsToday.length === 0 ? (
              <p className="party-empty">لا يوجد جهاز يتجدد اليوم.</p>
            ) : (
              <ul className="today-lines">
                {renewalsToday.map((device) => (
                  <li key={device.id}>
                    <Link href={homeSearchHref(device.name)} className="today-line">
                      <span className="today-line-main">
                        <strong>{device.name}</strong>
                        <small>{names.client(device.id) ?? "بدون زبون"}</small>
                      </span>
                      <span className="today-line-go">فتح ←</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <TodayLineList lines={lines[open]} names={names} />
          )}
        </PartySheet>
      )}
    </section>
  );
}

function TodayLineList({ lines, names }: { lines: TodayLine[]; names: TodayNames }) {
  if (lines.length === 0) return <p className="party-empty">لا توجد عمليات اليوم.</p>;
  return (
    <ul className="today-lines">
      {lines.map((line) => {
        const title = line.accountId ? names.device(line.accountId) : line.label || (line.kind === "in" ? "دخل" : "خرج");
        const sub = line.accountId ? [names.client(line.accountId) ?? "بدون زبون", line.label].filter(Boolean).join(" · ") : line.kind === "in" ? "دخل" : "خرج";
        const body = (
          <>
            <span className="today-line-main">
              <strong>{title}</strong>
              <small>
                {sub}
                {line.pendingD ? " · D غير مدفوعة لـ Starlink" : ""}
              </small>
            </span>
            <strong className={line.kind === "in" ? "report-good" : "report-bad"}>
              <bdi dir="ltr">
                {line.accountId ? "" : line.kind === "in" ? "+" : "-"}
                {formatAmount(line.amount)}
              </bdi>{" "}
              {LEDGER_CURRENCY_LABELS[line.currency as LedgerCurrency] ?? line.currency}
            </strong>
          </>
        );
        return (
          <li key={line.id}>
            {line.accountId ? (
              <Link href={homeSearchHref(names.device(line.accountId))} className="today-line">
                {body}
              </Link>
            ) : (
              <div className="today-line">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
