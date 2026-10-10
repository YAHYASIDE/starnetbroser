/**
 * ✅ What the rep reads after the operator records his payment. For a rep whose customers are his
 * alone («🔒 زبائنه عنده فقط»), the debt is HIS: the message says what he still owes for his
 * devices - never «لم يبقَ على الزبون شيء», which told him he was clear (his Oct 2026 council).
 * Pure apart from reading his book / invoices / settlements from the phone.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import { loadInvoices } from "./invoiceStore";
import type { LedgerByAccount } from "./ledgerStore";
import { keepCurrency } from "./repAccount";
import { loadRepBook } from "./repClients";
import { repPosition } from "./repPosition";
import { loadRepSettlements, type Representative } from "./repStore";
import { formatMoneyShort } from "./telegramRepMessages";

export function repPaymentConfirmationText(input: {
  value: number;
  currency: string;
  deviceName: string;
  clientName?: string;
  /** His own debt for his devices after this payment, per currency - only for «زبائنه عنده فقط». */
  repOwes?: Record<string, number>;
  /** What the device's customer still owes (the old wording, for other reps). */
  balanceAfter: number;
}): string {
  const head = `✅ سُجّلت دفعتك ${formatMoneyShort(input.value, input.currency)} عن ${input.deviceName}${input.clientName ? ` (${input.clientName})` : ""}`;
  if (input.repOwes) {
    const left = Object.entries(input.repOwes).filter(([, v]) => v > 0.005);
    return [head, left.length ? `🧾 الباقي عليك عن أجهزتك: ${left.map(([c, v]) => formatMoneyShort(v, c)).join(" + ")}` : "✓ لم يبقَ عليك شيء عن أجهزتك"].join("\n");
  }
  return [head, input.balanceAfter > 0.005 ? `المتبقي على الزبون: ${formatMoneyShort(input.balanceAfter, input.currency)}` : "✓ لم يبقَ على الزبون شيء"].join("\n");
}

export function repPaymentConfirmation(input: {
  rep?: Representative;
  value: number;
  currency: string;
  device: StarlinkAccountSummary;
  clientName?: string;
  balanceAfter: number;
  accounts: StarlinkAccountSummary[];
  clientStore: ClientStore;
  ledgerStore: LedgerByAccount;
}): string {
  const { rep } = input;
  const repOwes = rep?.customersHidden
    ? repPosition({ rep, clients: input.clientStore, accounts: input.accounts, ledgerStore: input.ledgerStore, book: loadRepBook(), invoices: loadInvoices(), settlements: loadRepSettlements(), convert: keepCurrency }).owed
    : undefined;
  return repPaymentConfirmationText({
    value: input.value,
    currency: input.currency,
    deviceName: input.device.name,
    clientName: rep?.customersHidden ? undefined : input.clientName,
    balanceAfter: input.balanceAfter,
    ...(repOwes ? { repOwes } : {}),
  });
}
