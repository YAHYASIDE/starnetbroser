/**
 * 📄 «كشف حساب» of one money place - a bank / wallet of «حسابي» or الكاش (his Oct 10 2026 request:
 * «اجعل لنا كشف حساب كل حساب بنكي وكشف حساب كاش … عندما اضغط علي المحفظة تأتيني كشف حسابها»). Every
 * movement on it (moneyMovements.ts - the very records «حسابي» adds up), oldest first, with the
 * running balance after each one, per currency, from the opening balance he typed. Only what counts
 * in the balance is listed (from the account's opening day on), so the last line = the balance shown.
 */

import { movementKindLabel, placeBalance, type Movement, type PlaceInfo } from "./moneyMovements";

export interface PlaceLedgerRow {
  id: string;
  date: string;
  label: string;
  kindLabel: string;
  direction: "in" | "out";
  amount: number;
  /** The balance in this row's currency right after it. */
  balance: number;
}

export interface PlaceLedgerCurrency {
  currency: string;
  opening: number;
  rows: PlaceLedgerRow[];
  closing: number;
  received: number;
  paid: number;
}

export interface PlaceLedger {
  place: PlaceInfo;
  /** The day the balance starts («» = from the start). */
  from: string;
  currencies: PlaceLedgerCurrency[];
  /** Movements before the opening day (not in the balance - its typed balance already includes them). */
  before: number;
}

function byTime(a: Movement, b: Movement): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ca = a.createdAt ?? "";
  const cb = b.createdAt ?? "";
  return ca < cb ? -1 : ca > cb ? 1 : a.id < b.id ? -1 : 1;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function buildPlaceLedger(place: PlaceInfo, movements: Movement[]): PlaceLedger {
  const own = movements.filter((m) => m.place === place.id);
  const counted = own.filter((m) => m.date >= place.from).sort(byTime);
  const codes = [place.currency, ...new Set(counted.map((m) => m.currency).filter((c) => c !== place.currency))];
  const currencies = codes.map((currency) => {
    const opening = currency === place.currency ? place.openingBalance : 0;
    let balance = opening;
    let received = 0;
    let paid = 0;
    const rows: PlaceLedgerRow[] = [];
    for (const m of counted) {
      if (m.currency !== currency) continue;
      balance = round(balance + (m.direction === "in" ? m.amount : -m.amount));
      if (m.direction === "in") received += m.amount;
      else paid += m.amount;
      rows.push({ id: m.id, date: m.date, label: m.label, kindLabel: movementKindLabel(m.kind), direction: m.direction, amount: m.amount, balance });
    }
    return { currency, opening, rows, closing: round(balance), received: round(received), paid: round(paid) };
  });
  // Same figure as the balance everywhere else (placeBalance = accountBalance).
  const check = placeBalance(place, own, "9999-12-31");
  for (const c of currencies) if (check[c.currency] !== undefined) c.closing = check[c.currency]!;
  // A currency with nothing in it is left out (الكاش held only in dinars shows no empty أوقية part).
  const shown = currencies.filter((c) => c.rows.length > 0 || Math.abs(c.opening) >= 0.005);
  return { place, from: place.from, currencies: shown.length ? shown : currencies.slice(0, 1), before: own.length - counted.length };
}
