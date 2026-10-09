/**
 * 💸 «مصادر الأموال والتحصيلات» (his Oct 9 2026 brief, part 1): every amount that really moved in or
 * out of one of his money places - «الكاش», each bank / wallet of «حسابي», the KAST card - read from
 * the records that already exist, each one classified by what it IS:
 *
 *   sale-paid       money received at the sale itself (a store invoice paid at the till)
 *   collection      a customer paying what he owed (device payment, client «له», a rep's handover)
 *   advance         the part of a customer's payment beyond what he owed (a credit kept for him)
 *   supplier-in     money received from a supplier (money back)
 *   transfer        between two of his own places (cash ↔ app, app ↔ app, card top-up / withdrawal)
 *   expense         an operating expense (a manual «خارج», a card withdrawal to «خسارة»)
 *   supplier-pay    paying a supplier - store purchases, a supplier balance entry, Starlink's cost
 *                   from the card (the cost was already counted with the renewal: never a new cost)
 *   rep-payout      paying a rep his commission / a manual rep entry through an app
 *   client-out      money paid out to a customer (his credit given back, a loan)
 *   owner-out       a personal withdrawal: his own spending / lending (not a business expense)
 *   owner-in        money from outside the business: his personal income, money borrowed
 *   other-in        a manual «داخل» in الكاش with no other record (not counted as revenue)
 *   correction      «تصحيح الرصيد», a till closing difference, «تصفير» - no business meaning
 *
 * Nothing is stored: the list is derived every time, each movement keeps the id of the record it
 * came from, and a place's balance from these movements equals «حسابي»'s own figure (tested).
 * A refund is not modeled by the app (a store return reduces the customer's debt, no money moves),
 * so no movement is ever a refund. Pure.
 */

import type { CashEntryList } from "./cashStore";
import { invoiceTotal, type InvoiceList } from "./invoiceStore";
import { PAYMENT_METHOD_LABELS, type LedgerByAccount, type LedgerEntry, type PaymentMethod } from "./ledgerStore";
import { CASH_ACCOUNT_ID, countsFrom, devicePaymentAccountId, type AccountsBook, type MoneyAccount } from "./moneyAccounts";
import type { DebtBook, IncomeList } from "./myMoney";
import type { PartyAdjustmentList } from "./partyBalanceStore";
import type { PersonalExpense } from "./personalExpenses";
import type { RepSettlementList } from "./repStore";
import { toMru, type RatesFromUsd } from "./reportsView";
import { listCardPayments, type CardTopUpList } from "./starlinkDebt";

export type MovementKind =
  | "sale-paid"
  | "collection"
  | "advance"
  | "supplier-in"
  | "transfer"
  | "expense"
  | "supplier-pay"
  | "rep-payout"
  | "client-out"
  | "owner-out"
  | "owner-in"
  | "other-in"
  | "correction";

export const MOVEMENT_KINDS: { kind: MovementKind; label: string; icon: string }[] = [
  { kind: "sale-paid", label: "إيراد مقبوض عند البيع", icon: "🛍️" },
  { kind: "collection", label: "تحصيل دين من زبون", icon: "💵" },
  { kind: "advance", label: "دفعة مقدمة (رصيد للزبون)", icon: "⏩" },
  { kind: "supplier-in", label: "مبلغ مستلم من مورد", icon: "🏭" },
  { kind: "transfer", label: "تحويل بين حساباتك", icon: "🔁" },
  { kind: "expense", label: "مصروف تشغيلي", icon: "🧾" },
  { kind: "supplier-pay", label: "سداد مورد / ستارلينك", icon: "📤" },
  { kind: "rep-payout", label: "دفع لمندوب", icon: "🤝" },
  { kind: "client-out", label: "دفع لزبون (رد رصيد أو سلفة)", icon: "↩️" },
  { kind: "owner-out", label: "سحب شخصي (مصروفك الشخصي)", icon: "👤" },
  { kind: "owner-in", label: "دخل شخصي / تمويل من خارج النشاط", icon: "🏦" },
  { kind: "other-in", label: "قيد «داخل» يدوي", icon: "📥" },
  { kind: "correction", label: "تصحيح رصيد", icon: "✏️" },
];

export function movementKindLabel(kind: MovementKind): string {
  return MOVEMENT_KINDS.find((k) => k.kind === kind)?.label ?? kind;
}

/** Money that came from the business's customers (what «التحصيلات» counts). */
export const COLLECTION_KINDS: MovementKind[] = ["sale-paid", "collection", "advance"];

/** «الكاش», «بطاقة KAST», or a «حسابي» account id. */
export const CASH_PLACE = CASH_ACCOUNT_ID;
export const CARD_PLACE = "card";
/** A device payment recorded before payments were posted to الكاش, and not routed to an app: it
 * happened, but sits in no place's balance. Counted in collections, never in a place. */
export const NO_PLACE = "none";

export interface Movement {
  /** Stable: the place + the source record (+ a part suffix when one record is split). */
  id: string;
  kind: MovementKind;
  place: string;
  direction: "in" | "out";
  /** Always positive. */
  amount: number;
  currency: string;
  date: string;
  createdAt?: string;
  method?: PaymentMethod;
  /** Who it was with. */
  party?: { kind: "client" | "device" | "supplier" | "rep" | "person" | "starlink"; id?: string; name?: string };
  /** The record it came from - deleting it removes the movement. */
  ref: { kind: string; id: string };
  label: string;
  /** The other place of a transfer. */
  counterpart?: string;
}

export interface MovementInput {
  ledger: LedgerByAccount;
  invoices: InvoiceList;
  adjustments: PartyAdjustmentList;
  settlements: RepSettlementList;
  cash: CashEntryList;
  book: AccountsBook;
  cardTopUps: CardTopUpList;
  incomes: IncomeList;
  expenses: PersonalExpense[];
  debts: DebtBook;
  /** The customer a device belongs to (collections are judged against the customer's whole debt). */
  clientOf?: (accountId: string) => string | undefined;
  deviceName?: (accountId: string) => string | undefined;
  partyName?: (kind: "client" | "supplier" | "rep", id: string) => string | undefined;
}

const EPS = 0.005;

function byTime<T extends { date: string; createdAt?: string }>(a: T, b: T): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ca = a.createdAt ?? "";
  const cb = b.createdAt ?? "";
  return ca < cb ? -1 : ca > cb ? 1 : 0;
}

/**
 * For every customer payment (device «له», client «له»): how much of it paid a debt he had at that
 * moment, the rest being an advance. Judged on the customer's whole account (his devices + store
 * invoices + balance entries), per currency, in date order.
 */
export function collectedPart(input: Pick<MovementInput, "ledger" | "invoices" | "adjustments" | "clientOf">): Map<string, number> {
  type Row = { party: string; currency: string; date: string; createdAt?: string; delta: number; paymentId?: string; amount?: number };
  const rows: Row[] = [];
  for (const [accountId, entries] of Object.entries(input.ledger)) {
    const client = input.clientOf?.(accountId);
    const party = client ? `client:${client}` : `device:${accountId}`;
    for (const e of entries) {
      if (e.kind === "debit") rows.push({ party, currency: e.currency, date: e.date, createdAt: e.createdAt, delta: e.amount });
      else rows.push({ party, currency: e.currency, date: e.date, createdAt: e.createdAt, delta: -e.amount, paymentId: e.id, amount: e.amount });
    }
  }
  const byId = new Map(input.invoices.map((inv) => [inv.id, inv]));
  for (const inv of input.invoices) {
    if (inv.kind !== "sale") continue;
    const clientId = inv.returnOfInvoiceId ? byId.get(inv.returnOfInvoiceId)?.clientId : inv.clientId;
    if (!clientId) continue;
    const delta = inv.returnOfInvoiceId ? -invoiceTotal(inv) : invoiceTotal(inv) - inv.paidAmount;
    rows.push({ party: `client:${clientId}`, currency: inv.currencyCode, date: inv.date, createdAt: inv.createdAt, delta });
  }
  for (const a of input.adjustments) {
    if (a.partyKind !== "client") continue;
    const party = `client:${a.partyId}`;
    if (a.direction === "owesUs") rows.push({ party, currency: a.currencyCode, date: a.date, createdAt: a.createdAt, delta: a.amount });
    else rows.push({ party, currency: a.currencyCode, date: a.date, createdAt: a.createdAt, delta: -a.amount, paymentId: a.id, amount: a.amount });
  }
  rows.sort(byTime);
  const balance = new Map<string, number>();
  const out = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.party}|${r.currency}`;
    const before = balance.get(key) ?? 0;
    if (r.paymentId) out.set(r.paymentId, Math.max(0, Math.min(r.amount!, before)));
    balance.set(key, before + r.delta);
  }
  return out;
}

/** The movements one customer payment makes: a collection, an advance, or both (split). */
function paymentMovements(base: Omit<Movement, "kind" | "amount">, amount: number, collected: number | undefined): Movement[] {
  const paid = collected ?? amount;
  const rest = amount - paid;
  const id = base.id;
  if (rest <= EPS) return [{ ...base, id, kind: "collection", amount }];
  if (paid <= EPS) return [{ ...base, id, kind: "advance", amount }];
  return [
    { ...base, id: `${id}#1`, kind: "collection", amount: paid },
    { ...base, id: `${id}#2`, kind: "advance", amount: rest },
  ];
}

export function buildMovements(input: MovementInput): Movement[] {
  const out: Movement[] = [];
  const accounts = input.book.accounts;
  const accountName = (id: string) => (id === CASH_ACCOUNT_ID ? "الكاش" : accounts.find((a) => a.id === id)?.name ?? "حساب محذوف");
  const collected = collectedPart(input);
  const ledgerById = new Map<string, { accountId: string; entry: LedgerEntry }>();
  for (const [accountId, entries] of Object.entries(input.ledger)) for (const entry of entries) ledgerById.set(entry.id, { accountId, entry });
  const adjustmentById = new Map(input.adjustments.map((a) => [a.id, a]));
  const settlementById = new Map(input.settlements.map((s) => [s.id, s]));
  const invoiceById = new Map(input.invoices.map((i) => [i.id, i]));
  const cashSources = new Set(input.cash.map((c) => c.sourceId).filter(Boolean) as string[]);

  const devicePayment = (accountId: string, e: LedgerEntry, place: string, id = `${place}:device-payment:${e.id}`): Movement[] => {
    const client = input.clientOf?.(accountId);
    return paymentMovements(
      {
        id,
        place,
        direction: "in",
        currency: e.currency,
        date: e.date,
        createdAt: e.createdAt,
        method: e.paymentMethod,
        party: e.heldByRepId
          ? { kind: "rep", id: e.heldByRepId, name: input.partyName?.("rep", e.heldByRepId) }
          : client
            ? { kind: "client", id: client, name: input.partyName?.("client", client) }
            : { kind: "device", id: accountId, name: input.deviceName?.(accountId) },
        ref: { kind: "device-payment", id: e.id },
        label: `${e.heldByRepId ? "تسليم مندوب عن جهاز" : "دفعة جهاز"}${input.deviceName?.(accountId) ? ` - ${input.deviceName(accountId)}` : ""}${e.paymentMethod ? ` · ${PAYMENT_METHOD_LABELS[e.paymentMethod]}` : ""}`,
      },
      e.amount,
      collected.get(e.id),
    );
  };

  // ---- Device payments: in the app of their method, else in الكاش (their cash entry), else nowhere. ----
  for (const [accountId, entries] of Object.entries(input.ledger)) {
    for (const e of entries) {
      if (e.kind !== "credit") continue;
      const routed = devicePaymentAccountId(e, accounts);
      if (routed) {
        const account = accounts.find((a) => a.id === routed)!;
        // Before its balance was typed, the money is inside the typed opening - not a movement of it.
        out.push(...devicePayment(accountId, e, e.date >= countsFrom(account) ? routed : NO_PLACE));
      } else if (!cashSources.has(e.id)) {
        out.push(...devicePayment(accountId, e, NO_PLACE));
      }
      // else: the cash entry below carries it (same classification).
    }
  }

  // ---- الكاش: every cash entry is a movement of الكاش (its balance is their sum). ----
  for (const c of input.cash) {
    const base = { place: CASH_PLACE, direction: c.kind, amount: c.amount, currency: c.currencyCode, date: c.date, createdAt: c.createdAt } as const;
    const id = `${CASH_PLACE}:cash:${c.id}`;
    const ref = { kind: c.sourceKind ?? (c.invoiceId ? "invoice" : "cash"), id: c.sourceId ?? c.invoiceId ?? c.id };
    const label = [c.category, c.note].filter(Boolean).join(" - ") || "قيد في الكاش";
    if (c.invoiceId) {
      const inv = invoiceById.get(c.invoiceId);
      const sale = (inv?.kind ?? "sale") === "sale";
      out.push({ ...base, id, kind: sale ? (c.kind === "in" ? "sale-paid" : "client-out") : c.kind === "out" ? "supplier-pay" : "supplier-in", ref, label, party: inv?.clientId ? { kind: "client", id: inv.clientId, name: input.partyName?.("client", inv.clientId) } : inv?.supplierId ? { kind: "supplier", id: inv.supplierId, name: input.partyName?.("supplier", inv.supplierId) } : undefined });
      continue;
    }
    switch (c.sourceKind) {
      case "device-payment": {
        const found = c.sourceId ? ledgerById.get(c.sourceId) : undefined;
        if (found && devicePaymentAccountId(found.entry, accounts)) break; // its money is in the app (cashInHandEntries)
        if (found && c.kind === "in") {
          out.push(...devicePayment(found.accountId, { ...found.entry, amount: c.amount, currency: c.currencyCode as LedgerEntry["currency"], date: c.date }, CASH_PLACE, id));
        } else out.push({ ...base, id, kind: c.kind === "in" ? "collection" : "client-out", ref, label });
        break;
      }
      case "party-balance": {
        const a = c.sourceId ? adjustmentById.get(c.sourceId) : undefined;
        if (a?.partyKind === "client" && c.kind === "in") {
          out.push(...paymentMovements({ ...base, id, ref, label, method: a.paymentMethod, party: { kind: "client", id: a.partyId, name: input.partyName?.("client", a.partyId) } }, c.amount, collected.get(a.id)));
        } else if (a?.partyKind === "client") out.push({ ...base, id, kind: "client-out", ref, label, party: { kind: "client", id: a.partyId, name: input.partyName?.("client", a.partyId) } });
        else out.push({ ...base, id, kind: c.kind === "in" ? "supplier-in" : "supplier-pay", ref, label, ...(a ? { party: { kind: "supplier" as const, id: a.partyId, name: input.partyName?.("supplier", a.partyId) } } : {}) });
        break;
      }
      case "rep-settlement": {
        const s = c.sourceId ? settlementById.get(c.sourceId) : undefined;
        const party = s ? { kind: "rep" as const, id: s.representativeId, name: input.partyName?.("rep", s.representativeId) } : undefined;
        out.push({ ...base, id, kind: c.kind === "in" ? "collection" : "rep-payout", ref, label, party });
        break;
      }
      case "card-topup":
      case "account-transfer":
        out.push({ ...base, id, kind: "transfer", ref, label, counterpart: c.sourceKind === "card-topup" ? CARD_PLACE : undefined });
        break;
      case "personal-expense":
      case "personal-income":
      case "personal-debt":
        out.push({ ...base, id, kind: c.kind === "in" ? "owner-in" : "owner-out", ref, label });
        break;
      case "closing":
      case "cash-reset":
        out.push({ ...base, id, kind: "correction", ref, label });
        break;
      default:
        out.push({ ...base, id, kind: c.kind === "in" ? "other-in" : "expense", ref, label });
    }
  }

  // ---- Banks / wallets: everything with their accountId (the same flows «حسابي» adds up). ----
  for (const a of input.adjustments) {
    if (!a.accountId) continue;
    const incoming = a.direction === "weOwe";
    const base = { id: `${a.accountId}:party-balance:${a.id}`, place: a.accountId, direction: incoming ? ("in" as const) : ("out" as const), currency: a.currencyCode, date: a.date, createdAt: a.createdAt, method: a.paymentMethod, ref: { kind: "party-balance", id: a.id }, label: a.note || (a.partyKind === "client" ? "دفعة زبون" : "دفعة مورد") };
    if (a.partyKind === "client") {
      const party = { kind: "client" as const, id: a.partyId, name: input.partyName?.("client", a.partyId) };
      if (incoming) out.push(...paymentMovements({ ...base, party }, a.amount, collected.get(a.id)));
      else out.push({ ...base, kind: "client-out", amount: a.amount, party });
    } else {
      out.push({ ...base, kind: incoming ? "supplier-in" : "supplier-pay", amount: a.amount, party: { kind: "supplier", id: a.partyId, name: input.partyName?.("supplier", a.partyId) } });
    }
  }
  for (const s of input.settlements) {
    if (!s.accountId) continue;
    const handover = s.kind === "cashHandover";
    out.push({ id: `${s.accountId}:rep-settlement:${s.id}`, kind: handover ? "collection" : "rep-payout", place: s.accountId, direction: handover ? "in" : "out", amount: s.amount, currency: s.currencyCode, date: s.date, createdAt: s.createdAt, party: { kind: "rep", id: s.representativeId, name: input.partyName?.("rep", s.representativeId) }, ref: { kind: "rep-settlement", id: s.id }, label: s.note || (handover ? "تسليم مندوب" : "دفع لمندوب") });
  }
  for (const i of input.incomes) {
    if (i.accountId) out.push({ id: `${i.accountId}:personal-income:${i.id}`, kind: "owner-in", place: i.accountId, direction: "in", amount: i.amount, currency: i.currencyCode, date: i.date, createdAt: i.createdAt, ref: { kind: "personal-income", id: i.id }, label: i.note || "دخل شخصي" });
  }
  for (const e of input.expenses) {
    if (e.accountId) out.push({ id: `${e.accountId}:personal-expense:${e.id}`, kind: "owner-out", place: e.accountId, direction: "out", amount: e.amount, currency: e.currencyCode, date: e.date, createdAt: e.createdAt, ref: { kind: "personal-expense", id: e.id }, label: e.note || "مصروف شخصي" });
  }
  const debtById = new Map(input.debts.debts.map((d) => [d.id, d]));
  for (const d of input.debts.debts) {
    if (!d.accountId) continue;
    const lent = d.kind === "lent";
    out.push({ id: `${d.accountId}:personal-debt:${d.id}`, kind: lent ? "owner-out" : "owner-in", place: d.accountId, direction: lent ? "out" : "in", amount: d.amount, currency: d.currencyCode, date: d.date, createdAt: d.createdAt, party: { kind: "person", name: d.person }, ref: { kind: "personal-debt", id: d.id }, label: lent ? `سلفة لـ ${d.person}` : `دين من ${d.person}` });
  }
  for (const p of input.debts.payments) {
    const d = debtById.get(p.debtId);
    if (!d || !p.accountId) continue;
    const back = d.kind === "lent";
    out.push({ id: `${p.accountId}:personal-debt:${p.id}`, kind: back ? "owner-in" : "owner-out", place: p.accountId, direction: back ? "in" : "out", amount: p.amount, currency: d.currencyCode, date: p.date, createdAt: p.createdAt, party: { kind: "person", name: d.person }, ref: { kind: "personal-debt", id: p.id }, label: back ? `رُدّ من ${d.person}` : `سداد لـ ${d.person}` });
  }
  for (const t of input.book.transfers ?? []) {
    // The الكاش side is its cash entry (above); the app sides come from the transfer.
    if (t.fromAccountId !== CASH_ACCOUNT_ID) out.push({ id: `${t.fromAccountId}:transfer:${t.id}`, kind: "transfer", place: t.fromAccountId, direction: "out", amount: t.amount, currency: t.currencyCode, date: t.date, createdAt: t.createdAt, ref: { kind: "transfer", id: t.id }, counterpart: t.toAccountId, label: `تحويل إلى ${accountName(t.toAccountId)}` });
    if (t.toAccountId !== CASH_ACCOUNT_ID) out.push({ id: `${t.toAccountId}:transfer:${t.id}`, kind: "transfer", place: t.toAccountId, direction: "in", amount: t.amount, currency: t.currencyCode, date: t.date, createdAt: t.createdAt, ref: { kind: "transfer", id: t.id }, counterpart: t.fromAccountId, label: `تحويل من ${accountName(t.fromAccountId)}` });
  }
  for (const adj of input.book.adjustments) {
    const account = accounts.find((a) => a.id === adj.accountId);
    if (!account || Math.abs(adj.amount) < EPS) continue;
    // «حسابي» counts every correction whatever its date: one dated before the opening counts on it.
    const date = adj.date < countsFrom(account) ? countsFrom(account) : adj.date;
    out.push({ id: `${adj.accountId}:account-adjustment:${adj.id}`, kind: "correction", place: adj.accountId, direction: adj.amount > 0 ? "in" : "out", amount: Math.abs(adj.amount), currency: adj.currencyCode ?? account.currencyCode, date, createdAt: adj.createdAt, ref: { kind: "account-adjustment", id: adj.id }, label: adj.note || "تصحيح الرصيد" });
  }

  // ---- The KAST card (dollars): its top-ups / withdrawals and the Starlink costs paid from it. ----
  for (const t of input.cardTopUps) {
    const outward = t.direction === "out";
    const via = t.via ?? "cash";
    const kind: MovementKind = via === "loss" ? "expense" : via === "reset" ? "correction" : "transfer";
    out.push({ id: `${CARD_PLACE}:card-move:${t.id}`, kind, place: CARD_PLACE, direction: outward ? "out" : "in", amount: t.amountUsd, currency: "USD", date: t.date, createdAt: t.createdAt, ref: { kind: "card-move", id: t.id }, counterpart: via === "account" ? t.accountId : via === "cash" ? CASH_PLACE : undefined, label: t.note || (outward ? (via === "loss" ? "سحب من البطاقة - خسارة" : "سحب رصيد من البطاقة") : "شحن البطاقة") });
    if (via === "account" && t.accountId && t.paidAmount > 0) {
      out.push({ id: `${t.accountId}:card-move:${t.id}`, kind: "transfer", place: t.accountId, direction: outward ? "in" : "out", amount: t.paidAmount, currency: t.paidCurrency, date: t.date, createdAt: t.createdAt, ref: { kind: "card-move", id: t.id }, counterpart: CARD_PLACE, label: outward ? "سحب من بطاقة KAST" : "شحن بطاقة KAST" });
    }
  }
  for (const p of listCardPayments(input.ledger)) {
    out.push({ id: `${CARD_PLACE}:starlink-cost:${p.entry.id}`, kind: "supplier-pay", place: CARD_PLACE, direction: "out", amount: p.amountUsd, currency: "USD", date: p.date, createdAt: p.entry.starlinkCost?.settledAt ?? p.entry.createdAt, party: { kind: "starlink", name: "ستارلينك" }, ref: { kind: "starlink-cost", id: p.entry.id }, label: `تكلفة ستارلينك${input.deviceName?.(p.accountId) ? ` - ${input.deviceName(p.accountId)}` : ""}` });
  }

  return out.sort((a, b) => byTime(b, a));
}

// ---- One place over a period ----

export interface PlaceInfo {
  id: string;
  name: string;
  icon: string;
  currency: string;
  method?: PaymentMethod;
  /** The first day its balance counts (an account's typed opening day; "" = from the start). */
  from: string;
  /** The balance on `from` (0 for الكاش and the card, which add up from their first record). */
  openingBalance: number;
  /** False while an account's real balance was never typed - no balance is claimed for it. */
  balanceKnown: boolean;
}

export function moneyPlaces(book: AccountsBook): PlaceInfo[] {
  return [
    { id: CASH_PLACE, name: "الكاش", icon: "💵", currency: "MRU", from: "", openingBalance: 0, balanceKnown: true },
    ...book.accounts.map((a: MoneyAccount) => ({ id: a.id, name: a.name, icon: a.icon, currency: a.currencyCode, method: a.method, from: countsFrom(a), openingBalance: a.openingBalance, balanceKnown: a.balanceSet !== false })),
    { id: CARD_PLACE, name: "بطاقة KAST", icon: "💳", currency: "USD", from: "", openingBalance: 0, balanceKnown: true },
  ];
}

export interface PlaceFigures {
  /** The balance when the period starts - undefined when it can't be known (never typed, or typed
   * after the period started): then only the period's net movement is shown. */
  opening?: number;
  received: number;
  paid: number;
  transfersIn: number;
  transfersOut: number;
  corrections: number;
  count: number;
  /** opening + received + transfersIn − paid − transfersOut + corrections. */
  closing?: number;
  /** received + transfersIn − paid − transfersOut + corrections. */
  net: number;
}

export interface PlaceStatement {
  place: PlaceInfo;
  /** Per currency, its own currency first. */
  byCurrency: Record<string, PlaceFigures>;
  previous: Record<string, { received: number; paid: number }>;
  movements: Movement[];
  /** Why no opening balance is shown, when it isn't. */
  note?: string;
}

const signed = (m: Movement) => (m.direction === "in" ? m.amount : -m.amount);

function figuresOf(list: Movement[]): Omit<PlaceFigures, "opening" | "closing"> {
  const f = { received: 0, paid: 0, transfersIn: 0, transfersOut: 0, corrections: 0, count: list.length, net: 0 };
  for (const m of list) {
    if (m.kind === "transfer") m.direction === "in" ? (f.transfersIn += m.amount) : (f.transfersOut += m.amount);
    else if (m.kind === "correction") f.corrections += signed(m);
    else if (m.direction === "in") f.received += m.amount;
    else f.paid += m.amount;
  }
  f.net = f.received + f.transfersIn - f.paid - f.transfersOut + f.corrections;
  return f;
}

/** A place's balance per currency at the end of `day` (only movements it counts). */
export function placeBalance(place: PlaceInfo, movements: Movement[], day: string): Record<string, number> {
  const out: Record<string, number> = { [place.currency]: place.openingBalance };
  for (const m of movements) {
    if (m.place !== place.id || m.date < place.from || m.date > day) continue;
    out[m.currency] = (out[m.currency] ?? 0) + signed(m);
  }
  for (const code of Object.keys(out)) out[code] = Math.round(out[code]! * 100) / 100;
  return out;
}

function dayBefore(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function buildPlaceStatement(place: PlaceInfo, movements: Movement[], range: { from: string; to: string }, previous: { from: string; to: string }): PlaceStatement {
  const own = movements.filter((m) => m.place === place.id);
  const inPeriod = own.filter((m) => m.date >= range.from && m.date <= range.to && m.date >= place.from);
  const openingKnown = place.balanceKnown && place.from <= range.from;
  const opening = openingKnown ? placeBalance(place, own, dayBefore(range.from)) : undefined;
  const codes = new Set<string>([place.currency, ...inPeriod.map((m) => m.currency), ...Object.keys(opening ?? {})]);
  const byCurrency: Record<string, PlaceFigures> = {};
  for (const code of codes) {
    const f = figuresOf(inPeriod.filter((m) => m.currency === code));
    const o = opening ? opening[code] ?? 0 : undefined;
    if (o === undefined && f.count === 0 && code !== place.currency) continue;
    if (o !== undefined && Math.abs(o) < EPS && f.count === 0 && code !== place.currency) continue;
    byCurrency[code] = { ...f, opening: o, closing: o !== undefined ? Math.round((o + f.net) * 100) / 100 : undefined };
  }
  const prev: Record<string, { received: number; paid: number }> = {};
  for (const m of own) {
    if (m.date < previous.from || m.date > previous.to || m.kind === "transfer" || m.kind === "correction") continue;
    const p = (prev[m.currency] ??= { received: 0, paid: 0 });
    if (m.direction === "in") p.received += m.amount;
    else p.paid += m.amount;
  }
  const note = !place.balanceKnown
    ? "رصيده الحقيقي لم يُكتب بعد في «حسابي» - يظهر صافي حركة الفترة فقط."
    : !openingKnown
      ? `رصيده مضبوط منذ ${place.from} - بعد بداية الفترة، فلا يُعرف رصيد البداية.`
      : undefined;
  return { place, byCurrency, previous: prev, movements: inPeriod, ...(note ? { note } : {}) };
}

// ---- The period by kind, and collections over time ----

export interface KindRow {
  kind: MovementKind;
  label: string;
  icon: string;
  inMru: number;
  outMru: number;
  count: number;
}

export interface KindSummary {
  rows: KindRow[];
  /** Customers' money in (sales paid + collections + advances) - transfers never count. */
  collectedMru: number;
  approx: boolean;
  missing: string[];
}

/** Every movement of the period grouped by what it is. A transfer moves money between two of his
 * own places: it is listed apart and never counted as money in or out of the business. */
export function summarizeByKind(movements: Movement[], range: { from: string; to: string }, rates: RatesFromUsd): KindSummary {
  const rows = new Map<MovementKind, KindRow>();
  let collectedMru = 0;
  let approx = false;
  const missing = new Set<string>();
  for (const m of movements) {
    if (m.date < range.from || m.date > range.to) continue;
    const value = toMru(m.amount, m.currency, rates);
    if (value === undefined) {
      missing.add(m.currency);
      continue;
    }
    if (m.currency !== "MRU") approx = true;
    const meta = MOVEMENT_KINDS.find((k) => k.kind === m.kind)!;
    const row = rows.get(m.kind) ?? { kind: m.kind, label: meta.label, icon: meta.icon, inMru: 0, outMru: 0, count: 0 };
    // A transfer shows up twice (out of one place, into the other) - count it once, by its out side
    // (or its in side when the other side is in no place).
    if (m.kind === "transfer") {
      if (m.direction === "out" || !m.counterpart) {
        row.count += 1;
        row.outMru += value;
      }
    } else {
      row.count += 1;
      if (m.direction === "in") row.inMru += value;
      else row.outMru += value;
      if (COLLECTION_KINDS.includes(m.kind) && m.direction === "in") collectedMru += value;
    }
    rows.set(m.kind, row);
  }
  return { rows: MOVEMENT_KINDS.map((k) => rows.get(k.kind)).filter((r): r is KindRow => Boolean(r)), collectedMru, approx, missing: [...missing] };
}

export interface SeriesBucket {
  key: string;
  label: string;
  mru: number;
  count: number;
}

/** «التحصيلات» over the period: by day (≤ 31 days), by week (≤ 120 days), else by month. */
export function collectionSeries(movements: Movement[], range: { from: string; to: string }, rates: RatesFromUsd): { unit: "day" | "week" | "month"; buckets: SeriesBucket[] } {
  const span = Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000) + 1;
  const unit = span <= 31 ? "day" : span <= 120 ? "week" : "month";
  const keyOf = (day: string): string => {
    if (unit === "day") return day;
    if (unit === "month") return day.slice(0, 7);
    const offset = Math.floor((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / (7 * 86_400_000));
    const start = new Date(Date.parse(`${range.from}T00:00:00Z`) + offset * 7 * 86_400_000);
    return start.toISOString().slice(0, 10);
  };
  const buckets = new Map<string, SeriesBucket>();
  // Every bucket of the range, so a day without money shows as 0 (not skipped).
  for (let t = Date.parse(`${range.from}T00:00:00Z`); t <= Date.parse(`${range.to}T00:00:00Z`); t += 86_400_000) {
    const key = keyOf(new Date(t).toISOString().slice(0, 10));
    if (!buckets.has(key)) buckets.set(key, { key, label: unit === "month" ? key : key.slice(5).replace("-", "/"), mru: 0, count: 0 });
  }
  for (const m of movements) {
    if (m.date < range.from || m.date > range.to || m.direction !== "in" || !COLLECTION_KINDS.includes(m.kind)) continue;
    const value = toMru(m.amount, m.currency, rates);
    const b = buckets.get(keyOf(m.date));
    if (value === undefined || !b) continue;
    b.mru += value;
    b.count += 1;
  }
  return { unit, buckets: [...buckets.values()] };
}
