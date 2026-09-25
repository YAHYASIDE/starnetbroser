/**
 * Manual balance entries ("إضافة رصيد") for a store client or supplier - an opening balance, a
 * payment received outside any invoice, a correction - recorded as its own reviewable, deletable
 * record rather than by editing an invoice. Every store balance (invoiceStore.ts) adds these on
 * top of the invoice-derived figure, per currency, never mixed.
 */

export type PartyKind = "client" | "supplier";

/** "owesUs" = عليه (the party owes us more), "weOwe" = له (we owe the party more). Stored in
 * these absolute terms so the same record reads the same way for a client or a supplier. */
export type PartyAdjustmentDirection = "owesUs" | "weOwe";

export interface PartyAdjustment {
  id: string;
  partyKind: PartyKind;
  partyId: string;
  direction: PartyAdjustmentDirection;
  amount: number;
  currencyCode: string;
  date: string;
  note?: string;
  createdAt: string;
}

export type PartyAdjustmentList = PartyAdjustment[];

const STORAGE_KEY = "starnet_party_adjustments_v1";

export function loadPartyAdjustments(): PartyAdjustmentList {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PartyAdjustmentList) : [];
  } catch {
    return [];
  }
}

export function savePartyAdjustments(list: PartyAdjustmentList): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// ---- Pure logic below - independent of localStorage, so this is what is actually unit-tested. ----

export interface RecordPartyAdjustmentInput {
  partyKind: PartyKind;
  partyId: string;
  direction: PartyAdjustmentDirection;
  amount: number;
  currencyCode: string;
  date: string;
  note?: string;
}

export type RecordPartyAdjustmentResult =
  | { ok: true; list: PartyAdjustmentList; adjustment: PartyAdjustment }
  | { ok: false; message: string };

export function recordPartyAdjustment(
  list: PartyAdjustmentList,
  input: RecordPartyAdjustmentInput,
): RecordPartyAdjustmentResult {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, message: "المبلغ يجب أن يكون أكبر من صفر" };
  }
  const adjustment: PartyAdjustment = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `party-adj-${Date.now()}-${Math.random()}`,
    partyKind: input.partyKind,
    partyId: input.partyId,
    direction: input.direction,
    amount: input.amount,
    currencyCode: input.currencyCode,
    date: input.date,
    note: input.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  return { ok: true, list: [...list, adjustment], adjustment };
}

export function deletePartyAdjustment(list: PartyAdjustmentList, id: string): PartyAdjustmentList {
  return list.filter((a) => a.id !== id);
}

export function listPartyAdjustments(list: PartyAdjustmentList, partyKind: PartyKind, partyId: string): PartyAdjustmentList {
  return list.filter((a) => a.partyKind === partyKind && a.partyId === partyId);
}

/** Signed effect on the party's own "remaining" figure, using the same convention as
 * invoiceStore.ts's balances: for a client positive = they owe us, for a supplier positive = we
 * owe them. */
export function adjustmentDelta(adjustment: PartyAdjustment): number {
  const owesUsSign = adjustment.partyKind === "client" ? 1 : -1;
  return adjustment.direction === "owesUs" ? owesUsSign * adjustment.amount : -owesUsSign * adjustment.amount;
}
