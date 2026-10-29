/**
 * 🧾 The device's «دفعة» window in three tabs (his Oct 29 2026 ask «عندما أضغط زر دفعة يظهر فوق: 1 توثيق 2 إضافة
 * 3 دفعة»). His choices: the travel registration's cost **like Starlink's** (settled or D, or none), «إضافة» with an
 * **optional Starlink cost** (none = a plain balance), and each of them **on the device or on the customer**. Pure.
 */

import type { LedgerEntryKind, StarlinkCost } from "./ledgerStore";

export type LedgerMode = "travel" | "add" | "pay";
export type LedgerTarget = "device" | "client";

export const LEDGER_MODES: { id: LedgerMode; icon: string; label: string; hint: string }[] = [
  { id: "travel", icon: "🛂", label: "توثيق", hint: "مبلغ التوثيق على الزبون - بتكلفة أو بدونها، ويُحسب ربحه" },
  { id: "add", icon: "➕", label: "إضافة", hint: "له أو عليه - مع تكلفة Starlink أو رصيد فقط" },
  { id: "pay", icon: "💵", label: "دفعة", hint: "دفعة استلمتها من الزبون" },
];

/** What the operation is: a «توثيق» is always «عليه», a «دفعة» always «له», «إضافة» as he picks. */
export function modeKind(mode: LedgerMode, addKind: LedgerEntryKind): LedgerEntryKind {
  return mode === "travel" ? "debit" : mode === "pay" ? "credit" : addKind;
}

/** The Starlink-cost section shows: a «عليه» on the device with its cost ticked. */
export function showsCost(mode: LedgerMode, kind: LedgerEntryKind, withCost: boolean, target: LedgerTarget): boolean {
  return target === "device" && kind === "debit" && mode !== "pay" && withCost;
}

/** A plain «له / عليه» on the device (no renewal, no D, no profit, no cash): «إضافة» without a cost, or any «له». */
export function isPlainAdjustment(mode: LedgerMode, kind: LedgerEntryKind, withCost: boolean): boolean {
  return mode === "add" && (kind === "credit" || !withCost);
}

/** 🛂 A travel registration with no cost: settled at 0 on its day - the whole price is profit. */
export function noCost(date: string): StarlinkCost {
  return { status: "settled", currencyCode: "USD", amount: 0, paidAt: date, settledAt: new Date().toISOString() };
}

/** The note a customer-side record carries («🛂 توثيق - device · note»). */
export function clientRecordNote(mode: LedgerMode, deviceName: string, note: string): string {
  return [mode === "travel" ? "🛂 توثيق" : "➕ إضافة", deviceName, note.trim()].filter(Boolean).join(" · ");
}
