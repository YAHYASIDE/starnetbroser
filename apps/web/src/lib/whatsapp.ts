/**
 * wa.me link building for the account card's "تواصل عبر واتساب" action. Deliberately pure/
 * framework-free (no window, no DOM) so the phone-number normalization and message wording are
 * directly testable.
 */

import { StarlinkAccountSummary } from "@starnet/shared";
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
import { Invoice, invoiceBalanceDue, invoicePaymentStatus, invoiceSubtotal, invoiceTotal } from "./invoiceStore";
import { getStoreItem, StoreItemRegistry } from "./storeStore";

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
 * the balance-reminder WhatsApp message so they know where to send payment. Built entirely from
 * the local customer ledger (see ledgerStore.ts), same as buildAccountStatementMessage below -
 * deliberately never account.balanceDue (Starlink's own synced subscription balance), which is an
 * unrelated, purely internal figure the customer has no reason to see. */
export function buildBalanceReminderMessage(accountName: string, entries: LedgerEntry[]): string {
  const balances = computeBalanceByCurrency(entries);
  const owedAmounts = LEDGER_CURRENCIES.filter((currency) => (balances[currency] ?? 0) > 0.0001).map(
    (currency) => `${formatAmount(balances[currency]!)} ${LEDGER_CURRENCY_LABELS[currency]}`,
  );

  if (owedAmounts.length === 0) {
    return (
      `مرحبًا ${accountName} 👋\n\n` +
      `نود إعلامك بأنه لا يوجد لديك أي رصيد مستحق حاليًا. شكرًا لتعاملك معنا 🙏\n\n` +
      `- STAR NET`
    );
  }

  return (
    `مرحبًا ${accountName} 👋\n\n` +
    `نود إعلامك بأن لديك رصيدًا مستحقًا حاليًا بقيمة ${owedAmounts.join(" و")}.\n` +
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

/**
 * "فاتورة بيع/شراء" sent directly to the customer/supplier over WhatsApp - built entirely from one
 * store invoice (invoiceStore.ts). Only ever sent for a sale (the customer is who reads it); a
 * purchase invoice has no WhatsApp action in the UI since the supplier didn't ask STAR NET for one.
 */
export function buildInvoiceMessage(invoice: Invoice, items: StoreItemRegistry, counterpartyName: string): string {
  const currencyLabel = LEDGER_CURRENCY_LABELS[invoice.currencyCode as keyof typeof LEDGER_CURRENCY_LABELS] ?? invoice.currencyCode;
  const title = invoice.kind === "sale" ? "فاتورة بيع" : "فاتورة شراء";

  const lineTexts = invoice.lines.map((line) => {
    const item = getStoreItem(items, line.itemId);
    const name = item?.name ?? "مادة";
    const unit = item?.unit ?? "";
    const lineTotal = line.quantity * line.unitPrice;
    return `• ${name}: ${formatAmount(line.quantity)} ${unit} × ${formatAmount(line.unitPrice)} ${currencyLabel} = ${formatAmount(lineTotal)} ${currencyLabel}`;
  });

  const subtotal = invoiceSubtotal(invoice);
  const total = invoiceTotal(invoice);
  const due = invoiceBalanceDue(invoice);
  const status = invoicePaymentStatus(invoice);
  const statusLine =
    status === "paid"
      ? "✅ مدفوعة بالكامل"
      : status === "partial"
        ? `⚠️ مدفوعة جزئيًا - المتبقي ${formatAmount(due)} ${currencyLabel}`
        : `❌ غير مدفوعة (دين) - ${formatAmount(due)} ${currencyLabel}`;

  return (
    `${invoice.returnOfInvoiceId ? "مرتجع - " : ""}${title} - ${counterpartyName} 🧾\n` +
    `${invoice.date}\n\n` +
    `${lineTexts.join("\n")}\n\n` +
    (invoice.discount > 0
      ? `المجموع الفرعي: ${formatAmount(subtotal)} ${currencyLabel}\nالخصم: ${formatAmount(invoice.discount)} ${currencyLabel}\n`
      : "") +
    `الإجمالي: ${formatAmount(total)} ${currencyLabel}\n` +
    `${statusLine}\n\n` +
    (invoice.note ? `ملاحظة: ${invoice.note}\n\n` : "") +
    `- STAR NET`
  );
}

/**
 * "معلومات الجهاز الكاملة" - everything the customer needs to actually use/manage the device
 * they were handed: its KIT/serial/subscription identifiers, the Wi-Fi password, and every email
 * registered on it (the primary one plus up to two extra) with each one's own password when
 * known. Built entirely from the operator's own manually-entered StarlinkAccountSummary fields -
 * never Starlink's own synced account fields (starlinkAccountEmail etc.), which are a separate,
 * read-only concern unrelated to what was handed to this customer.
 */
export function buildDeviceInfoMessage(account: StarlinkAccountSummary): string {
  const lines: string[] = [`معلومات الجهاز - ${account.name} 📋`, ""];

  const identifiers: string[] = [];
  if (account.kitNumber) identifiers.push(`KIT: ${account.kitNumber}`);
  if (account.serialNumber) identifiers.push(`Serial: ${account.serialNumber}`);
  if (account.subscriptionId) identifiers.push(`رقم الاشتراك: ${account.subscriptionId}`);
  if (identifiers.length > 0) lines.push(...identifiers, "");

  if (account.wifiPassword) lines.push(`كلمة سر Wi-Fi: ${account.wifiPassword}`, "");

  const emailLines: string[] = [];
  if (account.expectedEmail) {
    emailLines.push(
      `• البريد الرئيسي: ${account.expectedEmail}${
        account.expectedEmailPassword ? ` - كلمة السر: ${account.expectedEmailPassword}` : ""
      }`,
    );
  }
  (account.extraEmails ?? []).forEach((entry, index) => {
    if (!entry.address) return;
    emailLines.push(`• بريد إضافي ${index + 1}: ${entry.address}${entry.password ? ` - كلمة السر: ${entry.password}` : ""}`);
  });
  if (emailLines.length > 0) lines.push("البريد الإلكتروني:", ...emailLines, "");

  if (identifiers.length === 0 && !account.wifiPassword && emailLines.length === 0) {
    lines.push("لا توجد معلومات إضافية مسجلة لهذا الجهاز.", "");
  }

  lines.push("- STAR NET");
  return lines.join("\n");
}
