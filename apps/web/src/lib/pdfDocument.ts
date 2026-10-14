/**
 * A printable, branded document (كشف حساب / فاتورة) described as plain data, and the pure HTML
 * builder that turns it into the page pdfExport.ts rasterises into a PDF. Kept free of the DOM so
 * the layout and escaping are unit-tested; the browser only ever renders the string this returns.
 */

import type { StatementData } from "./statementDocument";

export interface BusinessProfile {
  name: string;
  phone?: string;
  address?: string;
  /** "How to pay" lines in the WhatsApp debt reminders (one per line). */
  paymentInstructions?: string;
  /** Shown under the client statement (image + PDF). An empty string hides it. */
  email?: string;
  /** WhatsApp numbers (without the country code) shown under the client statement, each with its
   * own QR code. An empty string hides that one. */
  whatsappMauritania?: string;
  whatsappMali?: string;
}

/** The operator's own contact details - used until the operator changes them in settings. */
export const DEFAULT_CONTACT = {
  email: "starnet.om@gmail.com",
  whatsappMauritania: "22227268",
  whatsappMali: "74646158",
} as const;

export const DEFAULT_PAYMENT_INSTRUCTIONS = "• BANKILY - NITA : 22227268\n• ORANGE MONEY : 74646158";

/** The "how to pay" lines for reminder messages: the operator's own, or the original ones. */
export function paymentInstructions(): string {
  return loadBusinessProfile().paymentInstructions?.trim() || DEFAULT_PAYMENT_INSTRUCTIONS;
}

const PROFILE_KEY = "starnet_business_profile_v1";

export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = { name: "STAR NET", ...DEFAULT_CONTACT };

/** Stored under a starnet_ data key on purpose, so the full backup (accountBackup.ts) carries it. */
export function loadBusinessProfile(): BusinessProfile {
  if (typeof window === "undefined") return DEFAULT_BUSINESS_PROFILE;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return DEFAULT_BUSINESS_PROFILE;
    const parsed = JSON.parse(raw) as Partial<BusinessProfile>;
    return {
      ...DEFAULT_BUSINESS_PROFILE,
      ...parsed,
      name: parsed.name?.trim() || DEFAULT_BUSINESS_PROFILE.name,
      email: parsed.email ?? DEFAULT_CONTACT.email,
      whatsappMauritania: parsed.whatsappMauritania ?? DEFAULT_CONTACT.whatsappMauritania,
      whatsappMali: parsed.whatsappMali ?? DEFAULT_CONTACT.whatsappMali,
    };
  } catch {
    return DEFAULT_BUSINESS_PROFILE;
  }
}

export function saveBusinessProfile(profile: BusinessProfile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    PROFILE_KEY,
    JSON.stringify({
      name: profile.name.trim(),
      phone: profile.phone?.trim() || undefined,
      address: profile.address?.trim() || undefined,
      paymentInstructions: profile.paymentInstructions?.trim() || undefined,
      // Kept even when emptied (""), so clearing one really hides it instead of restoring the default.
      email: profile.email?.trim() ?? DEFAULT_CONTACT.email,
      whatsappMauritania: profile.whatsappMauritania?.trim() ?? DEFAULT_CONTACT.whatsappMauritania,
      whatsappMali: profile.whatsappMali?.trim() ?? DEFAULT_CONTACT.whatsappMali,
    }),
  );
}

export type PrintableTone = "due" | "clear" | "neutral";

export interface PrintableSummaryItem {
  label: string;
  value: string;
  tone?: PrintableTone;
}

/** An extra titled table after the main one (e.g. a rep's profit per device). */
export interface PrintableSection {
  title: string;
  columns: string[];
  rows: string[][];
  /** A totals line under the table. */
  note?: string;
}

export interface PrintableDocument {
  /** e.g. "كشف حساب زبون" or "فاتورة بيع". */
  title: string;
  partyName: string;
  partyPhone?: string;
  /** e.g. a period, or an invoice number. */
  subtitle?: string;
  summary: PrintableSummaryItem[];
  columns: string[];
  rows: string[][];
  /** Optional per-row tone (same length as rows) - colours that row's last cell. */
  rowTones?: PrintableTone[];
  footerNote?: string;
  /** Set for a client/supplier statement: rendered with the invoice-style statement layout
   * (statementDocument.ts) instead of the generic table above. */
  statement?: StatementData;
  sections?: PrintableSection[];
}

/** Wraps a left-to-right fragment (a date, a code, a number with a sign) in Unicode isolates so it
 * keeps its own order inside Arabic text - e.g. "2026-09-22" never renders as "22-09-2026". */
export function ltr(value: string): string {
  return `\u2066${value}\u2069`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const TONE_COLORS: Record<PrintableTone, string> = { due: "#d0332f", clear: "#1a9e5c", neutral: "#14181f" };

/** A fixed-width (A4 at 96dpi = 794px) RTL page with inline styles only, so it renders the same
 * wherever it's captured, independent of the app's own theme (dark mode included). */
export function buildPrintableHtml(doc: PrintableDocument, business: BusinessProfile, generatedAt: string): string {
  const e = escapeHtml;
  const contact = [business.phone, business.address].filter(Boolean).map((v) => e(v!)).join(" · ");
  const summary = doc.summary
    .map(
      (item) =>
        `<div style="flex:1;min-width:150px;padding:10px 12px;border-radius:10px;background:#f4f6f8;border:1px solid #e1e5ea">` +
        `<div style="font-size:12px;color:#5b6472">${e(item.label)}</div>` +
        `<div dir="ltr" style="font-size:17px;font-weight:700;text-align:right;color:${TONE_COLORS[item.tone ?? "neutral"]}">${e(item.value)}</div>` +
        `</div>`,
    )
    .join("");
  const head = doc.columns.map((c) => `<th style="padding:8px 6px;text-align:right;font-size:12px">${e(c)}</th>`).join("");
  const body = doc.rows
    .map((row, index) => {
      const tone = doc.rowTones?.[index];
      const cells = row
        .map((cell, cellIndex) => {
          const color = tone && cellIndex === row.length - 1 ? `color:${TONE_COLORS[tone]};font-weight:700;` : "";
          return `<td style="padding:7px 6px;border-bottom:1px solid #e1e5ea;font-size:12px;${color}"><bdi>${e(cell)}</bdi></td>`;
        })
        .join("");
      return `<tr style="background:${index % 2 ? "#fafbfc" : "#ffffff"}">${cells}</tr>`;
    })
    .join("");
  const sections = (doc.sections ?? [])
    .map((section) => {
      const sHead = section.columns.map((c) => `<th style="padding:7px 6px;text-align:right;font-size:12px">${e(c)}</th>`).join("");
      const sBody = section.rows
        .map((row, index) => `<tr style="background:${index % 2 ? "#fafbfc" : "#ffffff"}">${row.map((cell) => `<td style="padding:6px;border-bottom:1px solid #e1e5ea;font-size:12px"><bdi>${e(cell)}</bdi></td>`).join("")}</tr>`)
        .join("");
      return (
        `<div style="font-size:15px;font-weight:700;margin:22px 0 8px">${e(section.title)}</div>` +
        (section.rows.length
          ? `<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#e8eef5;color:#14181f">${sHead}</tr></thead><tbody>${sBody}</tbody></table>`
          : `<p style="color:#5b6472;font-size:12px">لا شيء</p>`) +
        (section.note ? `<div style="font-size:12px;font-weight:700;margin-top:6px">${e(section.note)}</div>` : "")
      );
    })
    .join("");
  const empty = doc.rows.length === 0 ? `<p style="text-align:center;color:#5b6472;padding:16px">لا توجد حركات</p>` : "";
  return (
    `<div dir="rtl" style="width:794px;box-sizing:border-box;padding:36px 40px;background:#fff;color:#14181f;font-family:Tahoma,Arial,sans-serif">` +
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-radius:14px;background:linear-gradient(135deg,#0284c7,#075985);color:#fff">` +
    `<div><div style="font-size:24px;font-weight:800">★ ${e(business.name)}</div>` +
    (contact ? `<div style="font-size:12px;opacity:.9;margin-top:4px">${contact}</div>` : "") +
    `</div><div style="text-align:left"><div style="font-size:18px;font-weight:700">${e(doc.title)}</div>` +
    `<div dir="ltr" style="font-size:11px;opacity:.85;margin-top:4px">${e(generatedAt)}</div></div></div>` +
    `<div style="margin:18px 0 12px"><div style="font-size:20px;font-weight:700">${e(doc.partyName)}</div>` +
    (doc.partyPhone ? `<div dir="ltr" style="font-size:12px;color:#5b6472;text-align:right">${e(doc.partyPhone)}</div>` : "") +
    (doc.subtitle ? `<div style="font-size:12px;color:#5b6472;margin-top:2px">${e(doc.subtitle)}</div>` : "") +
    `</div>` +
    (summary ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">${summary}</div>` : "") +
    `<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#075985;color:#fff">${head}</tr></thead><tbody>${body}</tbody></table>` +
    empty +
    sections +
    (doc.footerNote ? `<p style="font-size:11px;color:#5b6472;margin-top:14px">${e(doc.footerNote)}</p>` : "") +
    `<p style="font-size:10px;color:#8a94a3;margin-top:24px;text-align:center">${e(business.name)} - مستند صادر من التطبيق</p>` +
    `</div>`
  );
}

/** An ASCII-only PDF file name (some share targets and browsers drop or mangle non-ASCII names):
 * the document kind plus date and time, e.g. "starnet-invoice-2026-09-25-1338.pdf". */
export function pdfFileName(title: string, stamp: string): string {
  const kind = title.includes("إقفال")
    ? "month-closing"
    : title.includes("حوالة")
      ? "transfer-receipt"
    : title.includes("سند")
      ? "receipt"
      : title.includes("فاتورة") || title.includes("مرتجع")
        ? "invoice"
        : title.includes("مندوب")
          ? "rep-statement"
          : "statement";
  return `starnet-${kind}-${stamp.replace(/[^0-9-]/g, "")}.pdf`;
}
