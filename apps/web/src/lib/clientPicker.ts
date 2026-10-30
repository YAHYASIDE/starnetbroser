import type { StarlinkAccountSummary } from "@starnet/shared";
import type { Client, CreateClientInput } from "./clientStore";
import { computeBalanceByCurrency, getAccountEntries, type LedgerByAccount, type LedgerCurrency } from "./ledgerStore";
import { PHONE_COUNTRY_CODES } from "./phoneCountryCodes";

/**
 * 👤 The customer field of a device (his Oct 30 2026 asks): edit the chosen customer, a customer with only his number
 * («بلا اسم»), a searched number added in one tap, the country code picked from what was typed, and each customer's
 * devices and balance in the list.
 */

const BY_LONGEST_CODE = [...PHONE_COUNTRY_CODES].sort((a, b) => b.dialCode.length - a.dialCode.length);

/** What was typed in the phone field → the country code and the local number. A number written with «+» / «00», or
 * 10 digits and more starting with a known code (212661722583, 22392507526), picks its country; a shorter one (a
 * local Mauritanian 8-digit number such as 22345678) stays local with `currentDial`. */
export function detectPhone(raw: string, currentDial: string): { dialCode: string; localNumber: string } {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  const international = trimmed.startsWith("+") || digits.startsWith("00");
  const rest = digits.startsWith("00") ? digits.slice(2) : digits;
  if (international || rest.length >= 10) {
    for (const entry of BY_LONGEST_CODE) {
      const code = entry.dialCode.slice(1);
      if (rest.startsWith(code) && rest.length > code.length + 5) return { dialCode: entry.dialCode, localNumber: rest.slice(code.length) };
    }
  }
  return { dialCode: currentDial, localNumber: digits };
}

/** The search is a phone number (digits, spaces, «+», «-»; 6 digits or more) - «➕ أضف هذا الرقم كزبون». */
export function isPhoneQuery(query: string): boolean {
  const q = query.trim();
  return /^[+\d][\d\s-]*$/.test(q) && q.replace(/\D/g, "").length >= 6;
}

/** A new customer from the form: his name, or - none typed - his number (digits) shown as his name and marked «بلا اسم».
 * Null when there is neither. `phone` is the stored digits (country code included). */
export function newClientInput(name: string, phone: string): CreateClientInput | null {
  const trimmed = name.trim();
  if (trimmed) return { name: trimmed, phone: phone || undefined, noName: false };
  if (!phone) return null;
  return { name: phone, phone, noName: true };
}

/** Phone search that ignores «+», spaces and dashes. */
export function clientMatches(client: Client, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (client.name.toLowerCase().includes(q)) return true;
  const digits = q.replace(/\D/g, "");
  return digits.length >= 3 && (client.phone ?? "").replace(/\D/g, "").includes(digits);
}

export interface ClientPickerInfo {
  devices: number;
  /** Per currency, what he owes (+) or has (−) on his devices, zero balances left out. */
  owed: [LedgerCurrency, number][];
}

/** 📊 His devices and their balance, for the picker's list. */
export function clientPickerInfo(clientId: string, accounts: StarlinkAccountSummary[], ledger: LedgerByAccount): ClientPickerInfo {
  const his = accounts.filter((a) => a.clientId === clientId && !a.deletedAt);
  const sum: Partial<Record<LedgerCurrency, number>> = {};
  for (const device of his) {
    for (const [code, value] of Object.entries(computeBalanceByCurrency(getAccountEntries(ledger, device.id)))) {
      if (value === undefined) continue;
      sum[code as LedgerCurrency] = (sum[code as LedgerCurrency] ?? 0) + value;
    }
  }
  const owed = (Object.entries(sum) as [LedgerCurrency, number][]).filter(([, v]) => Math.abs(v) > 0.0001);
  return { devices: his.length, owed };
}
