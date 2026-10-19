/**
 * 📄 A customer's statement, movement by movement, the way he designed it (Oct 19 2026): the kind and the
 * device (its email on a line of its own) on top, «19 أكتوبر 2026» with the time smaller, then three fixed
 * columns - الرصيد قبل · المضاف للدين / المسدَّد · الرصيد بعد - in the currency said once, and a quiet profit
 * line («الربح: 2,500 أوقية» / «الربح غير محسوب»). Filters الكل / الشحن / التسديد / التعديلات and a search by
 * email or device. Pure.
 */

import type { LedgerEntry } from "./ledgerStore";
import type { PartyStatementRow } from "./invoiceStore";
import { computeShipmentProfit } from "./accountingStore";

export type MovementFilter = "all" | "charge" | "payment" | "adjust";

export const MOVEMENT_FILTERS: { id: MovementFilter; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "charge", label: "الشحن" },
  { id: "payment", label: "التسديد" },
  { id: "adjust", label: "التعديلات" },
];

export interface MovementView {
  id: string;
  filter: Exclude<MovementFilter, "all">;
  icon: string;
  title: string;
  /** The device's name, unless it is the email itself. */
  device?: string;
  /** Its email - shown on its own line with a copy button. */
  email?: string;
  note?: string;
  /** «19 أكتوبر 2026». */
  dateLabel: string;
  /** «14:05», when the moment is known. */
  time?: string;
  before: number;
  /** Always positive; its label says which way. */
  middle: number;
  middleLabel: "المضاف للدين" | "المسدَّد" | "المخصوم";
  /** debt = red (adds to what he owes), pay = green. */
  tone: "debt" | "pay";
  after: number;
  /** A shipment's profit: computed, not computable yet, or none (not a shipment). */
  profit?: { amount: number } | "uncomputed";
}

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/** "2026-10-19" → «19 أكتوبر 2026»; anything else as it is. */
export function arabicDate(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return date;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : date;
}

/** The local time of a record's moment («14:05»); none for a date-only record. */
export function movementTime(createdAt: string, timeZoneOffsetMinutes = new Date().getTimezoneOffset()): string | undefined {
  if (!/T\d{2}:\d{2}/.test(createdAt)) return undefined;
  const ms = Date.parse(createdAt);
  if (Number.isNaN(ms)) return undefined;
  const local = new Date(ms - timeZoneOffsetMinutes * 60_000);
  return `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface MovementContext {
  isClient: boolean;
  /** The device's email (expectedEmail / Starlink's), by account id. */
  emailOf?: (accountId: string) => string | undefined;
  /** The ledger entry behind a device row, for its profit. */
  entryOf?: (accountId: string, entryId: string) => LedgerEntry | undefined;
  timeZoneOffsetMinutes?: number;
}

function profitIn(entry: LedgerEntry, currency: string): MovementView["profit"] {
  const p = computeShipmentProfit(entry);
  if (p.status !== "computed" || p.profitUsd === undefined) return "uncomputed";
  const amount = currency === "USD" ? p.profitUsd : currency === "MRU" ? p.profitMru : currency === "SIFA" ? p.profitSifa : undefined;
  return amount === undefined ? "uncomputed" : { amount: Math.round(amount * 100) / 100 };
}

export function movementView(row: PartyStatementRow, ctx: MovementContext): MovementView {
  const before = row.balanceAfter - row.delta;
  const adds = row.delta > 0;
  const base = {
    id: row.id,
    dateLabel: arabicDate(row.date),
    time: movementTime(row.createdAt, ctx.timeZoneOffsetMinutes),
    before,
    middle: Math.abs(row.delta),
    after: row.balanceAfter,
    tone: (adds ? "debt" : "pay") as MovementView["tone"],
    ...(row.note?.trim() ? { note: row.note.trim() } : {}),
  };
  if (row.type === "device-charge" || row.type === "device-payment") {
    const name = row.deviceName?.trim() ?? "";
    const email = (row.accountId ? ctx.emailOf?.(row.accountId)?.trim() : undefined) || (EMAIL.test(name) ? name : undefined);
    const device = name && name !== email ? name : undefined;
    const charge = row.type === "device-charge";
    const entry = charge && row.accountId ? ctx.entryOf?.(row.accountId, row.id) : undefined;
    return {
      ...base,
      filter: charge ? "charge" : "payment",
      icon: charge ? "📡" : "💳",
      title: charge ? "شحن ستارلينك" : "تسديد رصيد",
      ...(device ? { device } : {}),
      ...(email ? { email } : {}),
      middleLabel: adds ? "المضاف للدين" : "المسدَّد",
      ...(charge ? { profit: entry ? profitIn(entry, row.currencyCode) : "uncomputed" } : {}),
    };
  }
  if (row.type === "adjustment") {
    return {
      ...base,
      filter: "adjust",
      icon: adds ? "➕" : "➖",
      title: adds ? (ctx.isClient ? "تسوية رصيد · عليه" : "تسوية رصيد · لنا") : ctx.isClient ? "تسوية رصيد · له" : "تسوية رصيد · عليه",
      middleLabel: adds ? "المضاف للدين" : "المخصوم",
    };
  }
  if (row.type === "return") return { ...base, filter: "adjust", icon: "↩", title: "مرتجع", middleLabel: adds ? "المضاف للدين" : "المخصوم" };
  return {
    ...base,
    filter: adds ? "charge" : "payment",
    icon: "🧾",
    title: ctx.isClient ? "فاتورة بيع (المتجر)" : "فاتورة شراء",
    middleLabel: adds ? "المضاف للدين" : "المسدَّد",
  };
}

/** What the filter and the search keep (the search: email, device, note, kind - any part, any case). */
export function filterMovements(views: MovementView[], filter: MovementFilter, query = ""): MovementView[] {
  const q = query.trim().toLowerCase();
  return views.filter(
    (v) => (filter === "all" || v.filter === filter) && (!q || [v.email, v.device, v.note, v.title].some((t) => t?.toLowerCase().includes(q))),
  );
}
