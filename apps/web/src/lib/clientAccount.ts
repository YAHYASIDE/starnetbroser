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
import { entriesOfClient, type ClientMove } from "./clientMoves";
import { deletedAmount, deletedDay, deletedText, type DeletedOp } from "./deletedOps";

type DeviceRef = Pick<StarlinkAccountSummary, "id" | "name"> & { deletedAt?: string | null; clientId?: string | null };

/** 🔀 This customer's operations on a device (clientMoves.ts): all of them when it never moved. */
function clientEntries(ledgerStore: LedgerByAccount, device: DeviceRef, clientId: string, moves: ClientMove[]) {
  const entries = getAccountEntries(ledgerStore, device.id);
  return moves.some((m) => m.accountId === device.id) ? entriesOfClient(entries, device, clientId, moves) : entries;
}

/** A device in the trash takes its operations with it (his Oct 31 2026 report: a deleted duplicate's
 * 45,000 stayed in «المتبقي عليه» though its rows were gone from the statement). Back from the trash = back here. */
const live = <T extends DeviceRef>(devices: T[]): T[] => devices.filter((d) => !d.deletedAt);

/** Store totals plus, per currency, every device charge (debit) added to `total` and every device
 * payment (credit) added to `paid` - so `remaining` is everything the client owes us. */
export function computeClientCombinedTotals(
  invoices: InvoiceList,
  adjustments: PartyAdjustment[],
  clientId: string,
  devices: DeviceRef[],
  ledgerStore: LedgerByAccount,
  /** 🔀 The devices' moves between customers - pass clientDevicesWithHistory's devices with them. */
  moves: ClientMove[] = [],
): Record<string, PartyStoreTotals> {
  const result = computePartyStoreTotals(invoices, "sale", clientId, adjustments);
  for (const device of live(devices)) {
    for (const entry of clientEntries(ledgerStore, device, clientId, moves)) {
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
  moves: ClientMove[] = [],
  /** 🗑️ Still-deleted operations (lib/deletedOps.ts stillDeleted) - his own show at the moment they were deleted. */
  deleted: DeletedOp[] = [],
): PartyStatementRow[] {
  const deviceRows: PartyStatementRowInput[] = live(devices).flatMap((device) =>
    clientEntries(ledgerStore, device, clientId, moves).map(
      (entry): PartyStatementRowInput => ({
        id: entry.id,
        type: entry.kind === "debit" ? "device-charge" : "device-payment",
        date: entry.date,
        createdAt: entry.createdAt,
        currencyCode: entry.currency,
        deviceName: device.name,
        accountId: device.id,
        note: entry.note || undefined,
        amount: entry.amount,
        paid: entry.kind === "credit" ? entry.amount : 0,
        delta: entry.kind === "debit" ? entry.amount : -entry.amount,
      }),
    ),
  );
  return withRunningBalance([...buildPartyStatementRows(invoices, "sale", clientId, adjustments), ...deviceRows, ...clientDeletedRows(deleted, clientId, devices, moves)]);
}

/** 🗑️ The deleted operations that were this customer's: a device operation he had (the device his then), or one of
 * his له / عليه amounts. Each sits at the moment it was deleted and changes nothing. */
export function clientDeletedRows(deleted: DeletedOp[], clientId: string, devices: DeviceRef[], moves: ClientMove[] = []): PartyStatementRowInput[] {
  const byId = new Map(live(devices).map((d) => [d.id, d]));
  const rows: PartyStatementRowInput[] = [];
  for (const d of deleted) {
    let deviceName: string | undefined;
    if (d.store === "ledger") {
      const device = byId.get(d.accountId);
      if (!device || clientEntries({ [d.accountId]: [d.record] }, device, clientId, moves).length === 0) continue;
      deviceName = device.name;
    } else if (d.store === "adjustment") {
      if (d.record.partyKind !== "client" || d.record.partyId !== clientId) continue;
    } else continue;
    const { amount, currency } = deletedAmount(d);
    rows.push({
      id: d.id,
      type: "deleted",
      date: deletedDay(d),
      createdAt: d.at,
      currencyCode: currency,
      ...(deviceName ? { deviceName } : {}),
      ...(d.store === "ledger" ? { accountId: d.accountId } : {}),
      note: deletedText(d, () => deviceName),
      amount,
      paid: 0,
      delta: 0,
    });
  }
  return rows;
}
