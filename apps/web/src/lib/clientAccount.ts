/**
 * A client's full account: the store (invoices, returns, manual balance entries - invoiceStore.ts)
 * plus every Starlink device linked to them (account.clientId, ledgerStore.ts) - so an operation
 * recorded on one of the client's devices shows up in the client's own totals and statement, per
 * currency, never mixed across currencies.
 */

import { StarlinkAccountSummary } from "@starnet/shared";
import { getAccountEntries, LedgerByAccount } from "./ledgerStore";
import {
  buildPartyStatementRows,
  computePartyStoreTotals,
  InvoiceList,
  PartyStatementRow,
  PartyStatementRowInput,
  PartyStoreTotals,
  withRunningBalance,
} from "./invoiceStore";
import { PartyAdjustment } from "./partyBalanceStore";

type DeviceRef = Pick<StarlinkAccountSummary, "id" | "name">;

/** Store totals plus, per currency, every device charge (debit) added to `total` and every device
 * payment (credit) added to `paid` - so `remaining` is everything the client owes us. */
export function computeClientCombinedTotals(
  invoices: InvoiceList,
  adjustments: PartyAdjustment[],
  clientId: string,
  devices: DeviceRef[],
  ledgerStore: LedgerByAccount,
): Record<string, PartyStoreTotals> {
  const result = computePartyStoreTotals(invoices, "sale", clientId, adjustments);
  for (const device of devices) {
    for (const entry of getAccountEntries(ledgerStore, device.id)) {
      const totals = (result[entry.currency] ??= { total: 0, paid: 0, returned: 0, adjusted: 0, remaining: 0 });
      if (entry.kind === "debit") {
        totals.total += entry.amount;
        totals.remaining += entry.amount;
      } else {
        totals.paid += entry.amount;
        totals.remaining -= entry.amount;
      }
    }
  }
  return result;
}

/** كشف حساب الزبون الكامل: store rows and device rows together, with one running balance per
 * currency. Newest first. */
export function buildClientCombinedStatement(
  invoices: InvoiceList,
  adjustments: PartyAdjustment[],
  clientId: string,
  devices: DeviceRef[],
  ledgerStore: LedgerByAccount,
): PartyStatementRow[] {
  const deviceRows: PartyStatementRowInput[] = devices.flatMap((device) =>
    getAccountEntries(ledgerStore, device.id).map(
      (entry): PartyStatementRowInput => ({
        id: entry.id,
        type: entry.kind === "debit" ? "device-charge" : "device-payment",
        date: entry.date,
        createdAt: entry.createdAt,
        currencyCode: entry.currency,
        deviceName: device.name,
        note: entry.note || undefined,
        amount: entry.amount,
        paid: entry.kind === "credit" ? entry.amount : 0,
        delta: entry.kind === "debit" ? entry.amount : -entry.amount,
      }),
    ),
  );
  return withRunningBalance([...buildPartyStatementRows(invoices, "sale", clientId, adjustments), ...deviceRows]);
}
