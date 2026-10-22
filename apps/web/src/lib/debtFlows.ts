/**
 * 📒 «الديون» for the reports' chosen days (his Oct 22 2026 choice «ما تغيّر في الفترة + الرصيد الآن»):
 * what was added and what was paid in the window, per currency (never mixed) - the open balances
 * themselves stay as they are today. Pure; dates are the records' own.
 * - الزبائن: their devices' renewals (عليه) and payments (له), store sales (their total) and what was
 *   paid on them at sale, and «له / عليه» typed on a customer;
 * - ستارلينك: the D added (each renewal's Starlink cost, on its day) and the D paid (on its pay day);
 * - المندوبون: what they handed over (a cash handover).
 */

import { starlinkCostUsd } from "./accountingStore";
import { inWindow, type DayWindow } from "./reportRange";
import { invoiceTotal, type InvoiceList } from "./invoiceStore";
import type { LedgerByAccount } from "./ledgerStore";
import type { PartyAdjustmentList } from "./partyBalanceStore";
import type { RepSettlementList } from "./repStore";

export type ByCurrency = Record<string, number>;

export interface DebtFlows {
  customers: { added: ByCurrency; paid: ByCurrency };
  /** USD, like the D everywhere. */
  starlink: { addedUsd: number; paidUsd: number; addedCount: number; paidCount: number };
  reps: { handedOver: ByCurrency };
}

function add(target: ByCurrency, code: string, amount: number) {
  if (!(Math.abs(amount) > 0.000001)) return;
  target[code] = Math.round(((target[code] ?? 0) + amount) * 100) / 100;
}

export function debtFlowsIn(
  window: DayWindow,
  input: { ledgerStore: LedgerByAccount; invoices: InvoiceList; adjustments: PartyAdjustmentList; settlements: RepSettlementList },
): DebtFlows {
  const flows: DebtFlows = { customers: { added: {}, paid: {} }, starlink: { addedUsd: 0, paidUsd: 0, addedCount: 0, paidCount: 0 }, reps: { handedOver: {} } };
  for (const entries of Object.values(input.ledgerStore)) {
    for (const entry of entries) {
      if (entry.kind === "debit") {
        if (inWindow(entry.date, window)) add(flows.customers.added, entry.currency, entry.amount);
        const cost = entry.starlinkCost;
        const usd = starlinkCostUsd(entry);
        if (!cost || usd === undefined || cost.waived) continue;
        if (inWindow(entry.date, window)) {
          flows.starlink.addedUsd += usd;
          flows.starlink.addedCount += 1;
        }
        if (cost.status === "settled" && inWindow(cost.paidAt ?? entry.date, window)) {
          flows.starlink.paidUsd += usd;
          flows.starlink.paidCount += 1;
        }
      } else if (inWindow(entry.date, window)) add(flows.customers.paid, entry.currency, entry.amount);
    }
  }
  for (const inv of input.invoices) {
    if (inv.kind !== "sale" || !inWindow(inv.date, window)) continue;
    const sign = inv.returnOfInvoiceId ? -1 : 1;
    add(flows.customers.added, inv.currencyCode, sign * invoiceTotal(inv));
    if (!inv.returnOfInvoiceId) add(flows.customers.paid, inv.currencyCode, inv.paidAmount);
  }
  for (const a of input.adjustments) {
    if (a.partyKind !== "client" || !inWindow(a.date, window)) continue;
    add(a.direction === "owesUs" ? flows.customers.added : flows.customers.paid, a.currencyCode, a.amount);
  }
  for (const s of input.settlements) {
    if (s.kind === "cashHandover" && inWindow(s.date, window)) add(flows.reps.handedOver, s.currencyCode, s.amount);
  }
  flows.starlink.addedUsd = Math.round(flows.starlink.addedUsd * 100) / 100;
  flows.starlink.paidUsd = Math.round(flows.starlink.paidUsd * 100) / 100;
  return flows;
}
