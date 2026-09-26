"use client";

import { useMemo, useState } from "react";
import { LEDGER_CURRENCY_LABELS, LedgerCurrency } from "@/lib/ledgerStore";
import { InvoiceList } from "@/lib/invoiceStore";
import { CashEntryList, listStandaloneCashEntries } from "@/lib/cashStore";
import { StoreTransactionList } from "@/lib/storeStore";
import { computeStoreSalesSummary, computeTotalPayablesByCurrency, computeTotalReceivablesByCurrency } from "@/lib/storeReports";
import { isThisCalendarMonth } from "@/lib/reportPeriod";
import { formatAmount } from "@/lib/formatAmount";

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().slice(0, 10);
}

function mergeCurrencyKeys(...records: Record<string, number>[]): string[] {
  const keys = new Set<string>();
  for (const record of records) for (const key of Object.keys(record)) keys.add(key);
  return Array.from(keys);
}

interface CurrencyRowsProps {
  label: string;
  values: Record<string, number>;
  emptyText?: string;
}

function CurrencyTile({ label, values, emptyText = "—" }: CurrencyRowsProps) {
  const currencies = Object.keys(values);
  return (
    <div className="report-tile">
      <span className="report-tile-label">{label}</span>
      {currencies.length === 0 ? (
        <strong className="report-tile-value">{emptyText}</strong>
      ) : (
        <div className="report-tile-value-stack">
          {currencies.map((c) => (
            <strong key={c} dir="ltr">
              {formatAmount(values[c]!)} {currencyLabel(c)}
            </strong>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  transactions: StoreTransactionList;
  invoices: InvoiceList;
  cashEntries: CashEntryList;
}

/** أرباح المتجر والتقارير: today's and this month's sales, an estimated cost of goods sold, net
 * profit after standalone expenses (never double-counting an invoice-linked cash entry, see
 * cashStore.ts's listStandaloneCashEntries), and outstanding receivables/payables shown as their
 * own separate figures - debt and collection are never folded into the profit number itself. */
export function StoreReportsSection({ transactions, invoices, cashEntries }: Props) {
  const [expanded, setExpanded] = useState(false);

  const todayInvoices = useMemo(() => invoices.filter((inv) => inv.kind === "sale" && isToday(inv.date)), [invoices]);
  const monthInvoices = useMemo(
    () => invoices.filter((inv) => inv.kind === "sale" && isThisCalendarMonth(inv.date)),
    [invoices],
  );

  const todaySummary = useMemo(() => computeStoreSalesSummary(transactions, invoices, todayInvoices), [transactions, invoices, todayInvoices]);
  const monthSummary = useMemo(() => computeStoreSalesSummary(transactions, invoices, monthInvoices), [transactions, invoices, monthInvoices]);

  const monthExpenses = useMemo(() => {
    const standalone = listStandaloneCashEntries(cashEntries).filter((e) => e.kind === "out" && isThisCalendarMonth(e.date));
    const result: Record<string, number> = {};
    for (const entry of standalone) result[entry.currencyCode] = (result[entry.currencyCode] ?? 0) + entry.amount;
    return result;
  }, [cashEntries]);

  const monthNetProfit = useMemo(() => {
    const currencies = mergeCurrencyKeys(
      monthSummary.salesByCurrency,
      monthSummary.cogsByCurrency,
      monthSummary.shippingCostByCurrency,
      monthExpenses,
    );
    const result: Record<string, number> = {};
    for (const c of currencies) {
      result[c] =
        (monthSummary.salesByCurrency[c] ?? 0) -
        (monthSummary.cogsByCurrency[c] ?? 0) -
        (monthSummary.shippingCostByCurrency[c] ?? 0) -
        (monthExpenses[c] ?? 0);
    }
    return result;
  }, [monthSummary, monthExpenses]);

  const monthShippingProfit = useMemo(() => {
    const currencies = mergeCurrencyKeys(monthSummary.shippingChargeByCurrency, monthSummary.shippingCostByCurrency);
    const result: Record<string, number> = {};
    for (const c of currencies) {
      result[c] = (monthSummary.shippingChargeByCurrency[c] ?? 0) - (monthSummary.shippingCostByCurrency[c] ?? 0);
    }
    return result;
  }, [monthSummary]);

  const receivables = useMemo(() => computeTotalReceivablesByCurrency(invoices), [invoices]);
  const payables = useMemo(() => computeTotalPayablesByCurrency(invoices), [invoices]);

  return (
    <section className="section">
      <button type="button" className="report-collapse-toggle" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        أرباح المتجر والتقارير {expanded ? "▲" : "▼"}
      </button>

      {expanded && (
        <>
          <h2 className="report-section-title">مبيعات اليوم</h2>
          <div className="report-grid">
            <CurrencyTile label="المبيعات" values={todaySummary.salesByCurrency} />
            <CurrencyTile label="تكلفة البضاعة المباعة (تقديري)" values={todaySummary.cogsByCurrency} />
          </div>

          <h2 className="report-section-title">هذا الشهر</h2>
          <div className="report-grid">
            <CurrencyTile label="المبيعات" values={monthSummary.salesByCurrency} />
            <CurrencyTile label="تكلفة البضاعة المباعة (تقديري)" values={monthSummary.cogsByCurrency} />
          </div>
          <div className="report-grid">
            <CurrencyTile label="تكلفة الشحن الفعلية" values={monthSummary.shippingCostByCurrency} />
            <CurrencyTile label="ربح الشحن" values={monthShippingProfit} />
          </div>
          <div className="report-grid">
            <CurrencyTile label="المصاريف (غير مرتبطة بفاتورة)" values={monthExpenses} />
            <CurrencyTile label="صافي الربح التقديري" values={monthNetProfit} />
          </div>
          <p className="settings-hint">
            تكلفة البضاعة تقديرية بناءً على متوسط سعر شراء كل مادة - وليست تتبعًا دقيقًا لكل دفعة.
            تكلفة وربح الشحن مبنيان على ما أدخلته لكل فاتورة تحديدًا. صافي الربح يشملهما معًا.
            الديون والتحصيل (أدناه) منفصلة تمامًا عن الربح.
          </p>

          <h2 className="report-section-title">الديون والتحصيل</h2>
          <div className="report-grid">
            <CurrencyTile label="مستحق للمتجر من الزبائن" values={receivables} emptyText="لا يوجد" />
            <CurrencyTile label="مستحق على المتجر للموردين" values={payables} emptyText="لا يوجد" />
          </div>
        </>
      )}
    </section>
  );
}
