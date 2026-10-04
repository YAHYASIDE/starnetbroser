/**
 * كشف حساب الزبون / المورد بشكل فاتورة: the same layout for the shareable image (short: the last
 * operations) and the PDF (every operation). Pure - it returns an HTML string with inline styles
 * only, which imageExport.ts / pdfExport.ts rasterise with the WebView's own text engine.
 */

import qrcode from "qrcode-generator";
import { formatAmount } from "./formatAmount";
import type { PartyStatementRow, PartyStoreTotals } from "./invoiceStore";
import { LEDGER_CURRENCY_LABELS, LedgerCurrency } from "./ledgerStore";
import { BusinessProfile, escapeHtml } from "./pdfDocument";

const EPSILON = 0.0001;

/** How many operations the image shows (newest first); the PDF shows all of them. */
export const IMAGE_STATEMENT_ROWS = 15;

export interface StatementRowView {
  date: string;
  label: string;
  note?: string;
  /** Signed, with its currency - e.g. "+46,000 أوقية". */
  amount: string;
  /** Running balance after this row, with its currency. */
  balance: string;
  due: boolean;
}

export interface StatementTotalsView {
  currency: string;
  total: number;
  paid: number;
  returned: number;
  adjusted: number;
  remaining: number;
}

/** Everything the statement shows, already in display form (plain data - safe to keep on a
 * PrintableDocument and render later). */
export interface StatementData {
  isClient: boolean;
  partyName: string;
  partyPhone?: string;
  /** The client's devices (names), shown under the name. */
  devices?: string[];
  totals: StatementTotalsView[];
  /** Newest first. */
  rows: StatementRowView[];
}

export function statementKindLabel(row: PartyStatementRow, isClient: boolean): string {
  const adjustment = row.adjustment;
  return row.type === "return"
    ? "↩ مرتجع"
    : row.type === "adjustment" && adjustment
      ? adjustment.direction === "owesUs"
        ? "➕ رصيد عليه"
        : "➖ رصيد له"
      : row.type === "device-charge"
        ? `📡 شحن - ${row.deviceName ?? ""}`
        : row.type === "device-payment"
          ? `💵 دفعة - ${row.deviceName ?? ""}`
          : isClient
            ? "🧾 فاتورة بيع (المتجر)"
            : "🧾 فاتورة شراء";
}

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

export function buildStatementData(
  party: { name: string; phone?: string },
  isClient: boolean,
  totals: Record<string, PartyStoreTotals>,
  statement: PartyStatementRow[],
  devices: string[] = [],
): StatementData {
  return {
    isClient,
    partyName: party.name,
    partyPhone: party.phone?.trim() || undefined,
    devices: devices.length > 0 ? devices : undefined,
    totals: Object.entries(totals).map(([code, t]) => ({
      currency: currencyLabel(code),
      total: t.total,
      paid: t.paid,
      returned: t.returned,
      adjusted: t.adjusted,
      remaining: t.remaining,
    })),
    rows: statement.map((row) => ({
      date: row.date,
      label: statementKindLabel(row, isClient),
      note: row.note?.trim() || undefined,
      amount: `${row.delta < 0 ? "-" : "+"}${formatAmount(row.amount)} ${currencyLabel(row.currencyCode)}`,
      balance: `${formatAmount(row.balanceAfter)} ${currencyLabel(row.currencyCode)}`,
      due: row.balanceAfter > EPSILON,
    })),
  };
}

export interface WhatsAppContact {
  country: string;
  flag: string;
  dial: string;
  number: string;
  /** Opens a WhatsApp chat with that number - what the QR code encodes. */
  link: string;
}

/** The statement's WhatsApp numbers (Mauritania then Mali), skipping any left empty. */
export function whatsappContacts(business: BusinessProfile): WhatsAppContact[] {
  const entries = [
    { country: "موريتانيا", flag: "🇲🇷", dial: "222", number: business.whatsappMauritania },
    { country: "مالي", flag: "🇲🇱", dial: "223", number: business.whatsappMali },
  ];
  return entries.flatMap((entry) => {
    const number = (entry.number ?? "").replace(/\D/g, "");
    if (!number) return [];
    return [{ country: entry.country, flag: entry.flag, dial: entry.dial, number, link: `https://wa.me/${entry.dial}${number}` }];
  });
}

/** A QR code as an inline SVG, drawn at the given pixel size. */
export function qrSvg(text: string, size: number): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr
    .createSvgTag({ cellSize: 4, margin: 2, scalable: true })
    .replace("<svg ", `<svg width="${size}" height="${size}" style="display:block" `);
}

const C = {
  ink: "#14181f",
  muted: "#5b6472",
  line: "#e1e5ea",
  soft: "#f4f6f8",
  brand: "#075985",
  brand2: "#0284c7",
  due: "#d0332f",
  dueSoft: "#fdecec",
  clear: "#1a9e5c",
  clearSoft: "#e8f6ee",
};

function money(value: number): string {
  return formatAmount(Math.abs(value));
}

/** "-10,000 أوقية" as the number (kept left-to-right) followed by its currency word, so the sign
 * stays on the number and the word reads after it in the RTL row. */
function moneyCell(value: string): string {
  const space = value.indexOf(" ");
  if (space < 0) return `<bdi dir="ltr">${escapeHtml(value)}</bdi>`;
  return `<bdi dir="ltr">${escapeHtml(value.slice(0, space))}</bdi> ${escapeHtml(value.slice(space + 1))}`;
}

/** The contact block under the statement: the e-mail, then one QR code per WhatsApp number with
 * the number (and its country code) written under it. Empty when nothing is set. */
export function contactBlockHtml(business: BusinessProfile, qrSize = 112): string {
  const e = escapeHtml;
  const email = business.email?.trim();
  const contacts = whatsappContacts(business);
  if (!email && contacts.length === 0) return "";
  const cards = contacts
    .map(
      (c) =>
        `<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 8px;border:1px solid ${C.line};border-radius:12px;background:#fff">` +
        `<div style="padding:4px;background:#fff">${qrSvg(c.link, qrSize)}</div>` +
        `<div style="font-size:13px;font-weight:700;color:${C.ink}">${c.flag} واتساب ${e(c.country)}</div>` +
        `<div dir="ltr" style="font-size:16px;font-weight:800;color:${C.brand};letter-spacing:.5px">+${e(c.dial)} ${e(c.number)}</div>` +
        `</div>`,
    )
    .join("");
  return (
    `<div style="margin-top:18px;padding:14px;border-radius:14px;background:${C.soft};border:1px solid ${C.line}">` +
    `<div style="text-align:center;font-size:13px;font-weight:700;color:${C.muted};margin-bottom:10px">للتواصل والدفع - امسح الرمز لفتح واتساب</div>` +
    (cards ? `<div style="display:flex;gap:10px">${cards}</div>` : "") +
    (email
      ? `<div style="margin-top:10px;text-align:center;font-size:14px;color:${C.ink}">✉️ <span dir="ltr" style="font-weight:700">${e(email)}</span></div>`
      : "") +
    `</div>`
  );
}

export interface StatementHtmlOptions {
  /** Page width in CSS px - the image is phone-shaped, the PDF A4 (794). */
  width: number;
  /** Show at most this many operations (newest first); undefined = all. */
  maxRows?: number;
}

/** The invoice-style statement page. */
export function buildStatementHtml(
  data: StatementData,
  business: BusinessProfile,
  generatedAt: string,
  options: StatementHtmlOptions,
): string {
  const e = escapeHtml;
  const title = data.isClient ? "كشف حساب زبون" : "كشف حساب مورد";
  const dueWord = data.isClient ? "المبلغ المستحق عليك" : "المبلغ المستحق لك";
  const owed = data.totals.filter((t) => t.remaining > EPSILON);
  const credit = data.totals.filter((t) => t.remaining < -EPSILON);

  const dueBox =
    owed.length > 0
      ? `<div style="margin:14px 0;padding:14px 16px;border-radius:14px;background:${C.dueSoft};border:2px solid ${C.due}">` +
        `<div style="font-size:14px;font-weight:700;color:${C.due}">${dueWord}</div>` +
        owed
          .map(
            (t) =>
              `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:4px">` +
              `<span style="font-size:15px;color:${C.ink}">${e(t.currency)}</span>` +
              `<span dir="ltr" style="font-size:28px;font-weight:800;color:${C.due}">${e(money(t.remaining))}</span></div>`,
          )
          .join("") +
        `</div>`
      : `<div style="margin:14px 0;padding:14px 16px;border-radius:14px;background:${C.clearSoft};border:2px solid ${C.clear};font-size:17px;font-weight:800;color:${C.clear};text-align:center">✓ لا يوجد مبلغ مستحق</div>`;
  const creditLine = credit
    .map(
      (t) =>
        `<div style="margin:-6px 0 12px;font-size:13px;color:${C.clear};font-weight:700">رصيد ${data.isClient ? "لك" : "لنا"}: <span dir="ltr">${e(money(t.remaining))}</span> ${e(t.currency)}</div>`,
    )
    .join("");

  const cell = (label: string, value: string, color = C.ink) =>
    `<td style="padding:8px 6px;border-bottom:1px solid ${C.line};text-align:center"><div style="font-size:11px;color:${C.muted}">${label}</div>` +
    `<div dir="ltr" style="font-size:15px;font-weight:700;color:${color}">${value}</div></td>`;
  const totalsTable = data.totals.length
    ? `<table style="width:100%;border-collapse:collapse;border:1px solid ${C.line};border-radius:10px;overflow:hidden;margin-bottom:14px">` +
      data.totals
        .map(
          (t) =>
            `<tr><td style="padding:8px 10px;border-bottom:1px solid ${C.line};background:${C.soft};font-weight:700;font-size:13px;white-space:nowrap">${e(t.currency)}</td>` +
            cell(data.isClient ? "المبيعات" : "المشتريات", e(money(t.total))) +
            cell("المدفوع", e(money(t.paid)), C.clear) +
            (Math.abs(t.returned) > EPSILON ? cell("المرتجع", e(money(t.returned))) : "") +
            (Math.abs(t.adjusted) > EPSILON ? cell("رصيد سابق", `${t.adjusted > 0 ? "+" : "-"}${e(money(t.adjusted))}`) : "") +
            cell(t.remaining < -EPSILON ? "رصيد له" : "المتبقي", e(money(t.remaining)), t.remaining > EPSILON ? C.due : C.clear) +
            `</tr>`,
        )
        .join("") +
      `</table>`
    : "";

  const shown = options.maxRows === undefined ? data.rows : data.rows.slice(0, options.maxRows);
  const rowsHtml = shown
    .map(
      (row, index) =>
        `<tr style="background:${index % 2 ? "#fafbfc" : "#fff"}">` +
        `<td dir="ltr" style="padding:7px 6px;border-bottom:1px solid ${C.line};font-size:12px;white-space:nowrap;text-align:right;color:${C.muted}">${e(row.date)}</td>` +
        `<td style="padding:7px 6px;border-bottom:1px solid ${C.line};font-size:12px;overflow-wrap:anywhere">${e(row.label)}` +
        (row.note ? `<div style="font-size:11px;color:${C.muted}">${e(row.note)}</div>` : "") +
        `</td>` +
        `<td style="padding:7px 6px;border-bottom:1px solid ${C.line};font-size:12px;white-space:nowrap;font-weight:700">${moneyCell(row.amount)}</td>` +
        `<td style="padding:7px 6px;border-bottom:1px solid ${C.line};font-size:12px;white-space:nowrap;font-weight:700;color:${row.due ? C.due : C.clear}">${moneyCell(row.balance)}</td>` +
        `</tr>`,
    )
    .join("");
  const th = (label: string) => `<th style="padding:8px 6px;text-align:right;font-size:12px;font-weight:700">${label}</th>`;
  const rowsTitle =
    shown.length < data.rows.length ? `آخر ${shown.length} عملية من أصل ${data.rows.length}` : `العمليات (${data.rows.length})`;
  const operations =
    data.rows.length === 0
      ? `<p style="text-align:center;color:${C.muted};padding:12px">لا توجد عمليات</p>`
      : `<div style="font-size:14px;font-weight:700;margin:4px 0 8px;color:${C.ink}">${rowsTitle}</div>` +
        `<table style="width:100%;border-collapse:collapse;table-layout:auto"><thead><tr style="background:${C.brand};color:#fff">` +
        th("التاريخ") + th("البيان") + th("المبلغ") + th("الرصيد") +
        `</tr></thead><tbody>${rowsHtml}</tbody></table>`;

  const devices = data.devices?.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">` +
      data.devices
        .map((d) => `<span dir="ltr" style="font-size:11px;padding:3px 9px;border-radius:999px;background:${C.soft};border:1px solid ${C.line};color:${C.ink}">📡 ${e(d)}</span>`)
        .join("") +
      `</div>`
    : "";
  const contact = [business.phone, business.address].filter(Boolean).map((v) => e(v!)).join(" · ");

  return (
    `<div dir="rtl" style="width:${options.width}px;box-sizing:border-box;padding:24px;background:#fff;color:${C.ink};font-family:Tahoma,Arial,sans-serif">` +
    `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 18px;border-radius:16px;background:linear-gradient(135deg,${C.brand2},${C.brand});color:#fff">` +
    `<div><div style="font-size:24px;font-weight:800">★ ${e(business.name)}</div>` +
    (contact ? `<div style="font-size:12px;opacity:.9;margin-top:4px">${contact}</div>` : "") +
    `</div><div style="text-align:left"><div style="font-size:18px;font-weight:800">${title}</div>` +
    `<div dir="ltr" style="font-size:12px;opacity:.9;margin-top:4px">${e(generatedAt)}</div></div></div>` +
    `<div style="margin-top:16px;padding:12px 14px;border:1px solid ${C.line};border-radius:12px">` +
    `<div style="font-size:12px;color:${C.muted}">${data.isClient ? "السيد/ة" : "المورد"}</div>` +
    `<div style="font-size:21px;font-weight:800;margin-top:2px">${e(data.partyName)}</div>` +
    (data.partyPhone ? `<div dir="ltr" style="font-size:13px;color:${C.muted};text-align:right;margin-top:2px">${e(data.partyPhone)}</div>` : "") +
    devices +
    `</div>` +
    dueBox +
    creditLine +
    totalsTable +
    operations +
    contactBlockHtml(business) +
    `<p style="font-size:11px;color:#8a94a3;margin-top:14px;text-align:center">${e(business.name)} - شكراً لتعاملكم معنا</p>` +
    `</div>`
  );
}
