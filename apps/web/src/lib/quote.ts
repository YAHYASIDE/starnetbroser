import type { PrintableDocument } from "./pdfDocument";

/**
 * 🧾 عرض سعر - a price offer for a prospective customer (kit, months of service, shipping,
 * installation...), totalled per currency (never converted) and sent as a WhatsApp message.
 * Nothing is recorded: when he accepts, the sale goes through the store / add-device as usual.
 * Pure.
 */

export interface QuoteLine {
  label: string;
  qty: number;
  unitPrice: number;
  currency: string;
}

export interface Quote {
  customerName?: string;
  lines: QuoteLine[];
  /** Per currency. */
  discount?: Record<string, number>;
  validDays?: number;
  note?: string;
}

export const QUOTE_PRESETS: Omit<QuoteLine, "currency" | "unitPrice">[] = [
  { label: "جهاز Starlink Standard", qty: 1 },
  { label: "جهاز Starlink Mini", qty: 1 },
  { label: "اشتراك شهري", qty: 1 },
  { label: "تركيب وتشغيل", qty: 1 },
  { label: "شحن", qty: 1 },
  { label: "كابل إضافي", qty: 1 },
];

export function quoteTotals(quote: Quote): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const line of quote.lines) {
    if (!(line.qty > 0) || !(line.unitPrice >= 0) || !line.label.trim()) continue;
    totals[line.currency] = (totals[line.currency] ?? 0) + line.qty * line.unitPrice;
  }
  for (const [code, amount] of Object.entries(quote.discount ?? {})) {
    if (amount > 0 && totals[code] !== undefined) totals[code] = Math.max(0, totals[code]! - amount);
  }
  return totals;
}

function money(amount: number, label: string): string {
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${label}`;
}

export function buildQuoteMessage(quote: Quote, currencyLabel: (code: string) => string, today: Date): string {
  const lines = quote.lines.filter((l) => l.qty > 0 && l.label.trim());
  const out = [`🧾 عرض سعر${quote.customerName ? ` - ${quote.customerName}` : ""}`, ""];
  for (const line of lines) {
    const total = line.qty * line.unitPrice;
    out.push(`• ${line.label.trim()}${line.qty !== 1 ? ` × ${line.qty}` : ""}: ${money(total, currencyLabel(line.currency))}`);
  }
  const discount = Object.entries(quote.discount ?? {}).filter(([, v]) => v > 0);
  for (const [code, amount] of discount) out.push(`🎁 خصم: ${money(amount, currencyLabel(code))}`);
  out.push("");
  const totals = Object.entries(quoteTotals(quote));
  out.push(`💰 المجموع: ${totals.map(([code, amount]) => money(amount, currencyLabel(code))).join(" + ") || "0"}`);
  if (quote.validDays && quote.validDays > 0) {
    const until = new Date(today);
    until.setDate(until.getDate() + quote.validDays);
    const pad = (n: number) => String(n).padStart(2, "0");
    out.push(`⏳ العرض صالح حتى ${pad(until.getDate())}/${pad(until.getMonth() + 1)}/${until.getFullYear()}`);
  }
  if (quote.note?.trim()) out.push("", quote.note.trim());
  out.push("", "- STAR NET");
  return out.join("\n");
}

/** The same offer as a printable PDF (عرض سعر). */
export function buildQuotePdf(quote: Quote, currencyLabel: (code: string) => string, today: Date, phone?: string): PrintableDocument {
  const lines = quote.lines.filter((l) => l.qty > 0 && l.label.trim());
  const pad = (n: number) => String(n).padStart(2, "0");
  const until = new Date(today);
  until.setDate(until.getDate() + (quote.validDays ?? 0));
  const totals = quoteTotals(quote);
  return {
    title: "عرض سعر",
    partyName: quote.customerName?.trim() || "زبون",
    partyPhone: phone?.trim() || undefined,
    subtitle: quote.validDays ? `صالح حتى ${pad(until.getDate())}/${pad(until.getMonth() + 1)}/${until.getFullYear()}` : undefined,
    summary: Object.entries(totals).map(([code, amount]) => ({ label: `المجموع (${currencyLabel(code)})`, value: money(amount, currencyLabel(code)) })),
    columns: ["البند", "الكمية", "سعر الوحدة", "المبلغ"],
    rows: [
      ...lines.map((l) => [l.label.trim(), String(l.qty), money(l.unitPrice, currencyLabel(l.currency)), money(l.qty * l.unitPrice, currencyLabel(l.currency))]),
      ...Object.entries(quote.discount ?? {})
        .filter(([, v]) => v > 0)
        .map(([code, v]) => ["خصم", "", "", `-${money(v, currencyLabel(code))}`]),
    ],
    footerNote: quote.note?.trim() || undefined,
  };
}
