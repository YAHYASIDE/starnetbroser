/**
 * "تصدير Excel" from the reports page: one workbook with a summary, the period's profit shipment
 * by shipment, every device, who owes what, and each representative's balance. Amounts stay in
 * their own currency column; the أوقية column next to them is today's-rate display, like the page.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { computeShipmentProfit, shipmentProfitDate, starlinkCostUsd } from "./accountingStore";
import { computeBalanceByCurrency, LEDGER_CURRENCY_LABELS, type LedgerByAccount, type LedgerEntry } from "./ledgerStore";
import { shipmentRepShareUsd } from "./repStore";
import { presentServiceStatus } from "./status";
import type { RepBalance } from "./reportsView";
import type { XlsxCell, XlsxSheet } from "./xlsxWriter";

export interface DebtorRow {
  name: string;
  byCurrency: Record<string, number>;
  mru: number;
  oldestDays: number;
}

export interface BusinessExportInput {
  periodLabel: string;
  exportedAt: Date;
  accounts: StarlinkAccountSummary[];
  clientName: (clientId: string | undefined) => string | undefined;
  clientPhone: (clientId: string | undefined) => string | undefined;
  repName: (repId: string | undefined) => string | undefined;
  ledgerStore: LedgerByAccount;
  /** Each device's shipments whose profit falls in the period (after any fresh start). */
  profitByAccount: Record<string, LedgerEntry[]>;
  mruRate: number | undefined;
  openDUsdByAccount: Record<string, number>;
  previousDebtUsdByAccount: Record<string, number>;
  debtors: DebtorRow[];
  repBalances: RepBalance[];
  totals: {
    profitMru?: number;
    repSharesMru?: number;
    expectedMru?: number;
    debtorsMru: number;
    starlinkUsd: number;
    cardUsd: number;
  };
}

const round = (value: number | undefined, digits = 2): number | undefined =>
  value === undefined || !Number.isFinite(value) ? undefined : Math.round(value * 10 ** digits) / 10 ** digits;

const CURRENCIES = ["MRU", "USD", "SIFA"] as const;
const currencyLabel = (code: string) => LEDGER_CURRENCY_LABELS[code as keyof typeof LEDGER_CURRENCY_LABELS] ?? code;

export function buildBusinessWorkbook(input: BusinessExportInput): XlsxSheet[] {
  const accountById = new Map(input.accounts.map((a) => [a.id, a]));
  const day = input.exportedAt.toISOString().slice(0, 10);

  const summary: XlsxCell[][] = [
    ["البند", "القيمة", "ملاحظة"],
    ["الفترة", input.periodLabel, `تاريخ التصدير ${day}`],
    ["ربح الفترة", round(input.totals.profitMru, 0), "أوقية - يوم دفع ستارلينك"],
    ["حصص المندوبين", round(input.totals.repSharesMru, 0), "أوقية"],
    [
      "صافي ربحي",
      input.totals.profitMru !== undefined && input.totals.repSharesMru !== undefined ? round(input.totals.profitMru - input.totals.repSharesMru, 0) : undefined,
      "أوقية",
    ],
    ["ربح متوقع (D)", round(input.totals.expectedMru, 0), "أوقية - لم تُدفع لستارلينك بعد"],
    ["على الزبائن لي", round(input.totals.debtorsMru, 0), "≈ أوقية بسعر اليوم"],
    ["عليّ لستارلينك", round(input.totals.starlinkUsd), "دولار - D منّي + ديون سابقة"],
    ["رصيد بطاقة كاش", round(input.totals.cardUsd), "دولار"],
  ];

  const profitRows: XlsxCell[][] = [
    ["يوم الدفع لستارلينك", "تاريخ الشحنة", "الجهاز", "الزبون", "المندوب", "مبلغ البيع", "العملة", "تكلفة ستارلينك $", "الربح $", "الربح أوقية", "حصة المندوب أوقية"],
  ];
  const shipments: { accountId: string; entry: LedgerEntry }[] = [];
  for (const [accountId, entries] of Object.entries(input.profitByAccount)) {
    for (const entry of entries) if (entry.kind === "debit" && computeShipmentProfit(entry).status === "computed") shipments.push({ accountId, entry });
  }
  shipments.sort((a, b) => (shipmentProfitDate(a.entry) < shipmentProfitDate(b.entry) ? -1 : 1));
  for (const { accountId, entry } of shipments) {
    const account = accountById.get(accountId);
    const profit = computeShipmentProfit(entry);
    const lockedMru = entry.profitCurrencyRates?.MRU ?? input.mruRate;
    const share = shipmentRepShareUsd(entry);
    profitRows.push([
      shipmentProfitDate(entry),
      entry.date,
      account?.name ?? "جهاز محذوف",
      input.clientName(account?.clientId),
      input.repName(entry.representativeId),
      entry.amount,
      currencyLabel(entry.currency),
      round(starlinkCostUsd(entry)),
      round(profit.profitUsd),
      round(profit.profitMru ?? (lockedMru ? (profit.profitUsd ?? 0) * lockedMru : undefined), 0),
      share !== undefined && lockedMru ? round(share * lockedMru, 0) : undefined,
    ]);
  }

  const deviceRows: XlsxCell[][] = [
    [
      "الجهاز", "الزبون", "هاتف الزبون", "المندوب", "Kit", "Serial", "الاشتراك", "رقم الحساب", "موعد الانتهاء", "حالة الخدمة", "معطل",
      "مستحق Starlink", "عملة Starlink", "D منّي $", "دين سابق $", ...CURRENCIES.map((c) => `رصيد الزبون ${currencyLabel(c)}`),
    ],
  ];
  for (const account of input.accounts) {
    if (account.deletedAt) continue;
    const balances = computeBalanceByCurrency(input.ledgerStore[account.id] ?? []);
    deviceRows.push([
      account.name,
      input.clientName(account.clientId),
      input.clientPhone(account.clientId),
      input.repName(account.representativeId),
      account.kitNumber,
      account.serialNumber,
      account.subscriptionId ?? account.starlinkId,
      account.accountNumber,
      account.rechargeDate || account.standbyDate,
      presentServiceStatus(account.serviceStatus)?.label ?? account.serviceStatus,
      account.deviceFault ? (account.deviceFault.reason === "burned" ? "محترق" : "عطل") : undefined,
      Number.isFinite(Number(account.balanceDue)) && Number(account.balanceDue) !== 0 ? Number(account.balanceDue) : undefined,
      account.currency,
      round(input.openDUsdByAccount[account.id]),
      round(input.previousDebtUsdByAccount[account.id]),
      ...CURRENCIES.map((c) => round(balances[c])),
    ]);
  }

  const otherCurrencies = Array.from(new Set(input.debtors.flatMap((d) => Object.keys(d.byCurrency)))).filter(
    (c) => !(CURRENCIES as readonly string[]).includes(c),
  );
  const debtColumns = [...CURRENCIES, ...otherCurrencies];
  const debtRows: XlsxCell[][] = [["الزبون / الجهاز", ...debtColumns.map(currencyLabel), "≈ المجموع أوقية", "أقدم دين (يوم)"]];
  for (const d of input.debtors) {
    debtRows.push([d.name, ...debtColumns.map((c) => round(d.byCurrency[c])), round(d.mru, 0), d.oldestDays]);
  }

  const repRows: XlsxCell[][] = [["المندوب", "الهاتف", "النسبة %", "الرصيد أوقية", "الحالة"]];
  for (const { rep, balanceMru } of input.repBalances) {
    repRows.push([rep.name, rep.phone, rep.commissionPercent, round(Math.abs(balanceMru), 0), balanceMru >= 0 ? "مستحق له" : "عليه"]);
  }

  return [
    { name: "ملخص", rows: summary },
    { name: "الأرباح", rows: profitRows },
    { name: "الأجهزة", rows: deviceRows },
    { name: "الديون", rows: debtRows },
    { name: "المندوبون", rows: repRows },
  ];
}

/** ASCII-only name, like the PDFs: "starnet-report-2026-09-26-1415.xlsx". */
export function xlsxFileName(now: Date): string {
  const stamp = `${now.toISOString().slice(0, 10)}-${now.toTimeString().slice(0, 5).replace(":", "")}`;
  return `starnet-report-${stamp}.xlsx`;
}
