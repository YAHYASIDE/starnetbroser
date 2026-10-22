/**
 * 📄 «كشف حساب PDF» of the reports' chosen days (his Oct 22 2026 choice «PDF للمشاركة + Excel»):
 * the totals in his order (ستارلينك → المتجر → المصروفات → الصافي), then Starlink day by day, the store's
 * invoices, the expenses by type and what changed in the debts - one document to share. Pure.
 */

import type { DebtFlows } from "./debtFlows";
import { formatAmount } from "./formatAmount";
import { invoiceTotal, type Invoice } from "./invoiceStore";
import { LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "./ledgerStore";
import type { MonthNet } from "./netProfit";
import type { PrintableDocument, PrintableSection } from "./pdfDocument";
import type { ProfitRow } from "./profitStatement";
import type { DayWindow } from "./reportRange";

function cur(code: string | undefined): string {
  return code ? LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code : "";
}

function money(byCurrency: Record<string, number>): string {
  const parts = Object.entries(byCurrency).filter(([, v]) => Math.abs(v) > 0.005);
  return parts.length ? parts.map(([c, v]) => `${formatAmount(v)} ${cur(c)}`).join(" + ") : "0";
}

const mru = (value: number) => `${formatAmount(Math.round(value))} أوقية`;
const signed = (value: number) => `${value < 0 ? "-" : ""}${mru(Math.abs(value))}`;

export interface ReportsPdfInput {
  label: string;
  window: DayWindow;
  net: MonthNet;
  /** The operator's own spending (تبويب «المصروفات»), أوقية - only «يبقى لك». */
  personalMru: number;
  shipments: ProfitRow[];
  invoices: Invoice[];
  debts: DebtFlows;
  names: { device: (id: string) => string; client: (accountId: string) => string | undefined; clientById: (id: string | undefined) => string | undefined; item: (id: string) => string | undefined };
}

export function buildReportsPdf(input: ReportsPdfInput): PrintableDocument {
  const { net } = input;
  const summary: PrintableDocument["summary"] = [
    { label: `ربح ستارلينك (${net.starlinkShipments} شحنة)`, value: mru(net.starlinkProfitMru) },
    { label: "حصص المندوبين", value: signed(-net.starlinkRepSharesMru) },
    { label: "ربح المتجر", value: signed(net.storeNetMru) },
    { label: "المصروفات", value: signed(-net.expensesMru), tone: net.expensesMru > 0 ? "due" : "neutral" },
    { label: "الصافي", value: signed(net.netMru), tone: net.netMru < 0 ? "due" : "clear" },
  ];
  if (input.personalMru > 0) {
    summary.push({ label: "مصروفاتك الشخصية", value: signed(-input.personalMru), tone: "due" });
    summary.push({ label: "يبقى لك", value: signed(net.netMru - input.personalMru), tone: net.netMru - input.personalMru < 0 ? "due" : "clear" });
  }
  const shipments = [...input.shipments].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const sections: PrintableSection[] = [];
  const sales = input.invoices.filter((inv) => inv.kind === "sale").sort((a, b) => (a.date < b.date ? -1 : 1));
  sections.push({
    title: `🛒 المتجر (${sales.length} فاتورة)`,
    columns: ["التاريخ", "الزبون", "الأصناف", "المبلغ", "المدفوع"],
    rows: sales.map((inv) => [
      inv.date,
      input.names.clientById(inv.clientId) ?? "بدون زبون",
      `${inv.returnOfInvoiceId ? "↩️ مرتجع: " : ""}${inv.lines.map((l) => `${input.names.item(l.itemId) ?? "صنف"} ×${l.quantity}`).join("، ")}`,
      `${inv.returnOfInvoiceId ? "-" : ""}${formatAmount(invoiceTotal(inv))} ${cur(inv.currencyCode)}`,
      `${formatAmount(inv.paidAmount)} ${cur(inv.currencyCode)}`,
    ]),
    note: `المبيعات ${mru(net.storeSalesMru)} − البضاعة ${mru(net.storeCogsMru)} − الشحن ${mru(net.storeShippingMru)}${net.storeRepCommissionMru ? ` − العمولات ${mru(net.storeRepCommissionMru)}` : ""} = ${signed(net.storeNetMru)}${net.storeUnknownCostLines ? ` · ${net.storeUnknownCostLines} صنف بلا تكلفة مسجّلة` : ""}`,
  });
  sections.push({
    title: "🧾 المصروفات حسب النوع",
    columns: ["النوع", "عدد القيود", "المبلغ"],
    rows: net.expenses.map((e) => [e.category, String(e.count), mru(e.mru)]),
    note: `المجموع ${mru(net.expensesMru)}`,
  });
  const d = input.debts;
  sections.push({
    title: "📒 الديون في هذه الفترة",
    columns: ["البيان", "القيمة"],
    rows: [
      ["زاد على الزبائن (تجديدات وفواتير)", money(d.customers.added)],
      ["دفع الزبائن", money(d.customers.paid)],
      [`D جديد لستارلينك (${d.starlink.addedCount})`, `${formatAmount(d.starlink.addedUsd)}$`],
      [`سدّدت لستارلينك (${d.starlink.paidCount})`, `${formatAmount(d.starlink.paidUsd)}$`],
      ["سلّمه المندوبون", money(d.reps.handedOver)],
    ],
  });
  return {
    title: "كشف حساب الأرباح",
    partyName: input.label,
    subtitle: input.window.from === input.window.to ? input.window.from : `من ${input.window.from} إلى ${input.window.to}`,
    summary,
    columns: ["يوم الدفع", "الجهاز", "الزبون", "البيع", "تكلفة Starlink", "الربح"],
    rows: shipments.map((r) => [
      r.date,
      input.names.device(r.accountId),
      input.names.client(r.accountId) ?? "—",
      `${formatAmount(r.sale.amount)} ${cur(r.sale.currency)}`,
      r.cost.waived ? "معطّل (0)" : r.cost.amount !== undefined ? `${formatAmount(r.cost.amount)} ${cur(r.cost.currency)}` : "—",
      r.profitMru !== undefined ? `${r.mruExact ? "" : "≈ "}${signed(r.profitMru)}` : `${formatAmount(r.profitUsd)}$`,
    ]),
    rowTones: shipments.map((r) => ((r.profitMru ?? r.profitUsd) < 0 ? "due" : "clear")),
    footerNote: "الربح يُحسب يوم الدفع لستارلينك بسعره المثبّت. المتجر والمصروفات بغير الأوقية محوّلة بسعر اليوم للعرض فقط.",
    sections,
  };
}
