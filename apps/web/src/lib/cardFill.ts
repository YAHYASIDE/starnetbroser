/**
 * 💳 The full details of the operator's own payment cards (the KAST cards of «ستارلينك والبطاقة»),
 * to fill Starlink's card form in a device's browser with one tap: number, name on the card,
 * expiry, security code, postal code and address. His choices: kept on his phone and in his
 * backup (`starnet_` key), the code is filled too, no fingerprint. Never in the rep's copy, never
 * sent anywhere else; the device browser gets them through `setFillCards` (this phone only).
 */

import type { PaymentCard } from "./kastCards";

export interface CardFillData {
  /** Digits only. */
  number: string;
  holderName: string;
  /** "MM/YY" */
  expiry: string;
  cvc: string;
  postalCode?: string;
  address?: string;
  updatedAt: string;
}

/** By the card's id (kastCards.PaymentCard). */
export type CardFillBook = Record<string, CardFillData>;

export interface CardFillInput {
  number: string;
  holderName: string;
  expiry: string;
  cvc: string;
  postalCode?: string;
  address?: string;
}

/** The standard check digit every real card number passes. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
}

/** "3/30", "03/30", "0330", "03/2030" → "03/30", or null. */
export function normalizeExpiry(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  let month: string;
  let year: string;
  if (/^\d{1,2}\D+\d{2,4}$/.test(raw.trim())) {
    const [m, y] = raw.trim().split(/\D+/);
    month = m!;
    year = y!;
  } else if (digits.length === 4) {
    month = digits.slice(0, 2);
    year = digits.slice(2);
  } else if (digits.length === 6) {
    month = digits.slice(0, 2);
    year = digits.slice(2);
  } else return null;
  const m = Number(month);
  if (!(m >= 1 && m <= 12)) return null;
  const yy = year.length === 4 ? year.slice(2) : year;
  if (!/^\d{2}$/.test(yy)) return null;
  return `${String(m).padStart(2, "0")}/${yy}`;
}

export type CardFillResult = { ok: true; data: CardFillData } | { ok: false; message: string };

export function validateCardFill(input: CardFillInput, card: Pick<PaymentCard, "last4">, now = new Date()): CardFillResult {
  const number = input.number.replace(/\D/g, "");
  if (number.length < 12 || number.length > 19 || !luhnValid(number)) return { ok: false, message: "رقم البطاقة غير صحيح - راجعه" };
  if (!number.endsWith(card.last4)) return { ok: false, message: `آخر 4 أرقام لا توافق هذه البطاقة (${card.last4})` };
  const holderName = input.holderName.trim().replace(/\s+/g, " ");
  if (!holderName) return { ok: false, message: "اكتب الاسم كما يظهر على البطاقة" };
  const expiry = normalizeExpiry(input.expiry);
  if (!expiry) return { ok: false, message: "اكتب تاريخ الانتهاء هكذا 03/30" };
  const cvc = input.cvc.replace(/\D/g, "");
  if (cvc.length < 3 || cvc.length > 4) return { ok: false, message: "رمز التحقق 3 أو 4 أرقام" };
  const postalCode = input.postalCode?.trim();
  const address = input.address?.trim();
  return {
    ok: true,
    data: { number, holderName, expiry, cvc, ...(postalCode ? { postalCode } : {}), ...(address ? { address } : {}), updatedAt: now.toISOString() },
  };
}

export function setCardFill(book: CardFillBook, cardId: string, data: CardFillData): CardFillBook {
  return { ...book, [cardId]: data };
}

export function removeCardFill(book: CardFillBook, cardId: string): CardFillBook {
  const next = { ...book };
  delete next[cardId];
  return next;
}

/** «•••• 1234» - the number as the app shows it. */
export function maskedNumber(number: string): string {
  return `•••• ${number.slice(-4)}`;
}

/** What the device browser's card list shows, and the card each item fills the form with. */
export function fillItems(cards: PaymentCard[], book: CardFillBook): { label: string; payload: string }[] {
  return cards
    .filter((c) => book[c.id])
    .map((c) => {
      const d = book[c.id]!;
      const [expMonth, expYear] = d.expiry.split("/");
      return {
        label: `${c.name} ${maskedNumber(d.number)} · ${d.expiry}`,
        payload: JSON.stringify({ number: d.number, name: d.holderName, expMonth, expYear, cvc: d.cvc, postal: d.postalCode ?? "", address: d.address ?? "" }),
      };
    });
}

const KEY = "starnet_card_fill_v1";

export function loadCardFillBook(): CardFillBook {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as CardFillBook) : {};
  } catch {
    return {};
  }
}

export function saveCardFillBook(book: CardFillBook): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(book));
}
