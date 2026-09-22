/**
 * wa.me link building for the account card's "تواصل عبر واتساب" action. Deliberately pure/
 * framework-free (no window, no DOM) so the phone-number normalization and message wording are
 * directly testable.
 */

import {
  computeBalanceByCurrency,
  LEDGER_CURRENCIES,
  LEDGER_CURRENCY_LABELS,
  LedgerEntry,
  PAYMENT_METHOD_LABELS,
  sortEntriesNewestFirst,
} from "./ledgerStore";
import { computeShipmentPaymentStatus, PaymentAllocation } from "./paymentAllocationStore";
import { formatAmount } from "./formatAmount";

/** Strips everything but digits and a leading "00" international-dialing prefix - wa.me wants a
 * bare digit string with the country code, no "+", no "00", no spaces/dashes. Returns null for
 * anything too short to plausibly be a real number (an empty/placeholder phone field), so callers
 * can hide the WhatsApp action entirely rather than link to an unusable "wa.me/123". */
export function normalizePhoneForWhatsApp(phone: string | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length >= 8 ? digits : null;
}

/** null when the account has no usable phone number - callers must hide the action, never link
 * to a broken wa.me URL. */
export function buildWhatsAppLink(phone: string | undefined, message?: string): string | null {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  const base = `https://wa.me/${normalized}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** The three canned messages the card's WhatsApp menu offers - kept together so their exact
 * wording is reviewable and testable in one place. */
export function buildExpiryReminderMessage(accountName: string): string {
  return `مرحبًا ${accountName}، نود تذكيرك بأن اشتراك Starlink الخاص بك سينتهي الليلة. يرجى التجديد لتفادي انقطاع الخدمة.\n\n- STAR NET`;
}

/** STAR NET's own payment-collection numbers (not customer data) - shown to the customer inside
 * the balance-reminder WhatsApp message so they know where to send payment. */
export function buildBalanceReminderMessage(accountName: string, balanceDue: string, currency: string): string {
  return (
    `مرحبًا ${accountName} 👋\n\n` +
    `نود إعلامك بأن لديك رصيدًا مستحقًا حاليًا بقيمة ${currency}${balanceDue}.\n` +
    `نرجو منك التكرم بتسديد المبلغ في أقرب وقت ممكن لتفادي انقطاع الخدمة.\n\n` +
    `يمكنكم الدفع عبر إحدى الوسائل التالية:\n` +
    `• بنكيلي / سداد / نيتا: 22227268\n` +
    `• أورانج موني: 74646158\n\n` +
    `شكرًا لتعاونكم معنا 🙏\n` +
    `- STAR NET`
  );
}

const PAYMENT_STATUS_SUFFIX: Record<"unpaid" | "partial" | "paid", string> = {
  unpaid: "",
  partial: " (مدفوعة جزئيًا)",
  paid: " (مدفوعة بالكامل)",
};

/**
 * "كشف الحساب" - a detailed statement built entirely from the local customer ledger (see
 * ledgerStore.ts): the current balance per currency, followed by every recorded transaction
 * newest-first. Deliberately never mentions account.balanceDue (Starlink's own synced
 * subscription balance) - this statement is only about what the customer owes/is owed by the
 * operator, a separate concern.
 *
 * `allocations` (optional, defaults to none) only ever adds each shipment's own PAYMENT status
 * (unpaid/partial/paid) - this message is sent directly to the customer over WhatsApp, so it must
 * never include Starlink's own cost, the D mark, or profit/loss, all of which are the operator's
 * internal business figures, never the customer's business.
 */
export function buildAccountStatementMessage(
  accountName: string,
  entries: LedgerEntry[],
  allocations: PaymentAllocation[] = [],
): string {
  const balances = computeBalanceByCurrency(entries);
  const balanceLines = LEDGER_CURRENCIES.filter((currency) => balances[currency]).map((currency) => {
    const balance = balances[currency]!;
    return balance > 0
      ? `• عليه ${formatAmount(balance)} ${LEDGER_CURRENCY_LABELS[currency]}`
      : `• له ${formatAmount(-balance)} ${LEDGER_CURRENCY_LABELS[currency]}`;
  });

  const entryLines = sortEntriesNewestFirst(entries).map((entry) => {
    const kindLabel = entry.kind === "debit" ? "عليه" : "له";
    const amount = `${formatAmount(entry.amount)} ${LEDGER_CURRENCY_LABELS[entry.currency]}`;
    const method = entry.paymentMethod ? ` (${PAYMENT_METHOD_LABELS[entry.paymentMethod]})` : "";
    const note = entry.note ? ` - ${entry.note}` : "";
    const paymentStatus = entry.kind === "debit" ? PAYMENT_STATUS_SUFFIX[computeShipmentPaymentStatus(entry, allocations)] : "";
    return `${entry.date}: ${kindLabel} ${amount}${method}${note}${paymentStatus}`;
  });

  return (
    `كشف حساب - ${accountName} 📋\n\n` +
    (balanceLines.length > 0
      ? `الرصيد الحالي:\n${balanceLines.join("\n")}\n\n`
      : `لا يوجد رصيد مستحق حاليًا.\n\n`) +
    (entryLines.length > 0 ? `تفاصيل الحركات:\n${entryLines.join("\n")}\n\n` : "") +
    `- STAR NET`
  );
}
