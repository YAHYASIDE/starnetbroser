/**
 * A separate, purely local bookkeeping ledger: what a CUSTOMER owes the operator, or has paid in
 * credit toward - not to be confused with account.balanceDue, which is the Starlink SUBSCRIPTION's
 * own balance as synced from Starlink itself (see starlinkSync.ts). The two track debts to two
 * different parties (the operator vs. Starlink) and are deliberately never merged or conflated.
 */

export type LedgerEntryKind = "debit" | "credit";

/** Exactly the three currencies actually used for these transactions - never a free-text field. */
export type LedgerCurrency = "USD" | "MRU" | "SIFA";
export const LEDGER_CURRENCIES: LedgerCurrency[] = ["USD", "MRU", "SIFA"];
export const LEDGER_CURRENCY_LABELS: Record<LedgerCurrency, string> = {
  USD: "دولار",
  MRU: "أوقية",
  SIFA: "سيفا",
};

/** STAR NET's own payment-collection channels (same ones quoted to customers in
 * whatsapp.ts#buildBalanceReminderMessage) - recorded per "له" entry so it's clear which channel
 * a given payment actually came in on. Meaningless for a "عليه" entry (a charge, not a payment). */
export type PaymentMethod = "bankily" | "masrvi" | "sedad" | "orange" | "nita" | "cash";
export const PAYMENT_METHODS: PaymentMethod[] = ["bankily", "masrvi", "sedad", "orange", "nita", "cash"];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bankily: "بنكيلي",
  masrvi: "مصرفي",
  sedad: "سداد",
  orange: "أورانج موني",
  nita: "نيتا",
  cash: "نقدًا",
};

/** A locked-in snapshot of a currency's rate vs USD, taken at the moment a specific entry/cost was
 * recorded - never recomputed later, even if currencyStore.ts's own rate for that currency
 * changes afterward. `usdValue` is snapshotted alongside the rate for the same reason: re-deriving
 * it from a possibly-since-changed rate would silently rewrite history. */
export interface RateSnapshot {
  rateFromUsd: number;
  usdValue: number;
}

export type StarlinkCostStatus = "pending" | "settled";

/**
 * Starlink's own cost for the shipment this (debit) entry represents - entirely separate from what
 * the customer owes/has paid, which stays tracked purely via `kind`/`amount` above. `status`
 * starts "pending" ("D": the shipment was registered but Starlink hasn't been paid for yet, or
 * this field is simply absent on entries created before this feature existed - see
 * isLegacyShipmentEntry) and only ever moves to "settled" via a deliberate settlement action,
 * never automatically and never by paying off the customer's own debt.
 */
export interface StarlinkCost {
  status: StarlinkCostStatus;
  /** Currency code from currencyStore.ts's registry - NOT limited to LEDGER_CURRENCIES, since
   * Starlink's own cost for a device may be paid in a currency the customer never sees. */
  currencyCode?: string;
  amount?: number;
  rate?: RateSnapshot;
  /** yyyy-mm-dd - only set once status is "settled". */
  paidAt?: string;
  /** Settled from the operator's "كاش" card (starlinkDebt.ts) - its balance is debited by it. */
  paidVia?: "card";
  /** ISO time the D was settled - orders a payment against a "fresh start" made the same day. */
  settledAt?: string;
  note?: string;
}

export interface LedgerEntry {
  id: string;
  /** "debit" (عليه): the customer now owes more. "credit" (له): a payment that reduces what they
   * owe. */
  kind: LedgerEntryKind;
  /** Always positive - direction comes from `kind`, never a signed amount. */
  amount: number;
  currency: LedgerCurrency;
  note: string;
  /** The email a payment is tied to (e.g. the customer's e-wallet/bank login) - purely for the
   * operator's own traceability, never validated or used to contact anyone. */
  email: string;
  /** Only meaningful for a "credit" (له) entry - which of STAR NET's own payment channels the
   * money came in on. Left unset for a "debit" entry. */
  paymentMethod?: PaymentMethod;
  /** yyyy-mm-dd, user-editable (defaults to today, but a backdated entry is legitimate). */
  date: string;
  /** ISO timestamp - only used to order same-day entries relative to each other. */
  createdAt: string;
  /** Only ever set on a "debit" (shipment) entry whose `currency` isn't USD - the locked rate
   * snapshot used to convert `amount` to USD for profit accounting (see accountingStore.ts).
   * Absent for USD entries (rate is always 1, nothing to snapshot) and for every entry created
   * before this field existed. */
  saleRate?: RateSnapshot;
  /** Only ever set on a "debit" (shipment) entry - see StarlinkCost. Absent entirely (not merely
   * "pending") on an entry created before this feature existed - see isLegacyShipmentEntry, which
   * treats that as a third, distinct state from both "pending" and "settled". */
  starlinkCost?: StarlinkCost;
  /** Only ever set on a "credit" (payment) entry whose `currency` isn't USD - the locked rate
   * snapshot used to express what the customer actually paid in USD (rule XIII's "cash actually
   * collected"), entirely separate from accounting profit. Absent for USD entries and for every
   * entry created before this field existed - a payment with no paymentRate simply doesn't
   * contribute to the USD-converted total, it is never guessed at with today's rate. */
  paymentRate?: RateSnapshot;
  /** Locked USD->MRU and USD->SIFA rates, snapshotted the moment this shipment's profit first
   * became computable (entry creation if settled immediately, or settlement time if it was "D"
   * first) - so showing profit in these two ledger currencies never silently drifts if their
   * registry rate changes later (same locking rule as saleRate/starlinkCost.rate above). Either
   * key is absent when that currency has no registered rate at the moment of locking - the
   * profit is simply not shown in it, never guessed at with a later or assumed rate. Entirely
   * absent on a legacy/pending shipment, or one settled before this field existed. */
  profitCurrencyRates?: { MRU?: number; SIFA?: number };
  /** Only ever set on a "debit" (shipment) entry created on a device linked to a representative
   * (account.representativeId) - a LOCKED snapshot of who that rep was and their commission
   * percent at the moment of the operation, so reassigning the device or changing the rate later
   * never rewrites past shares. The rep earns this percent of the shipment's own profit once it is
   * computable (see repStore.ts's listRepDeviceCommissions). Absent on every entry created before
   * this field existed - those never earn a device commission. */
  representativeId?: string;
  representativeCommissionPercent?: number;
  /** Locked with the percent: whether this rep also carries their percent of a loss. */
  representativeSharesLosses?: boolean;
}

/** A "debit" entry with no starlinkCost info at all predates this feature - its profit can never
 * be computed (not even "pending"), and it must never be silently assigned a cost or a rate. A
 * "credit" entry is never a shipment, so it is never legacy in this sense either. */
export function isLegacyShipmentEntry(entry: LedgerEntry): boolean {
  return entry.kind === "debit" && !entry.starlinkCost;
}

/** A "credit" (payment) entry whose currency isn't USD but has no paymentRate - either predates
 * that field, or its rate was skipped for some other reason. Its USD value is simply unknown, not
 * zero - accountingStore.ts must never silently drop it from a total without flagging that total
 * as incomplete (see DeviceAccountingSummary.hasIncompletePaymentRates). Resolved only by
 * capturing the missing rate explicitly (see PaymentRateCompletionDialog), never guessed. */
export function isIncompletePaymentRateEntry(entry: LedgerEntry): boolean {
  return entry.kind === "credit" && entry.currency !== "USD" && !entry.paymentRate;
}

/** The currency code most recently used to settle a Starlink cost on THIS device (by `paidAt`,
 * newest wins) - purely a convenience default for the settlement form's currency picker, so an
 * operator who always pays this device's Starlink bill in the same currency doesn't have to
 * reselect it every time. Never affects the settlement itself: the rate is still always typed
 * fresh, never guessed (rule VI). Undefined when this device has no settled cost yet.
 *
 * `paidAt` is a plain yyyy-mm-dd date, not a timestamp, so two settlements made the same day tie -
 * `>=` (not `>`) breaks that tie in favor of whichever comes LATER in `entries`, since entries are
 * appended in creation order and the later one is the one actually settled most recently. */
export function lastUsedCostCurrency(entries: LedgerEntry[]): string | undefined {
  let latest: { currencyCode: string; paidAt: string } | undefined;
  for (const entry of entries) {
    const cost = entry.starlinkCost;
    if (entry.kind !== "debit" || cost?.status !== "settled" || !cost.currencyCode || !cost.paidAt) continue;
    if (!latest || cost.paidAt >= latest.paidAt) latest = { currencyCode: cost.currencyCode, paidAt: cost.paidAt };
  }
  return latest?.currencyCode;
}

export type LedgerByAccount = Record<string, LedgerEntry[]>;

/** A balance is never a single number once entries can be in different currencies - USD/MRU/SIFA
 * amounts are never summed together, only within their own currency. Absent key = no entries in
 * that currency. */
export type BalanceByCurrency = Partial<Record<LedgerCurrency, number>>;

const STORAGE_KEY = "starnet_customer_ledger_v1";

export function loadLedgerStore(): LedgerByAccount {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as LedgerByAccount;
  } catch {
    return {};
  }
}

export function saveLedgerStore(store: LedgerByAccount): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

// ---- Pure logic below - independent of localStorage, so this is what is actually unit-tested. ----

export function getAccountEntries(store: LedgerByAccount, accountId: string): LedgerEntry[] {
  return store[accountId] ?? [];
}

export function withAccountEntries(store: LedgerByAccount, accountId: string, entries: LedgerEntry[]): LedgerByAccount {
  return { ...store, [accountId]: entries };
}

/** Per currency: positive = the customer owes this much (مدين) in that currency. Negative = the
 * customer has this much credit (دائن) in that currency. A currency with no entries is simply
 * absent from the result, not zero. */
export function computeBalanceByCurrency(entries: LedgerEntry[]): BalanceByCurrency {
  const balances: BalanceByCurrency = {};
  for (const entry of entries) {
    const delta = entry.kind === "debit" ? entry.amount : -entry.amount;
    balances[entry.currency] = (balances[entry.currency] ?? 0) + delta;
  }
  return balances;
}

/** Newest first: by `date`, then by `createdAt` to order same-day entries deterministically. */
export function sortEntriesNewestFirst(entries: LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export function addEntry(entries: LedgerEntry[], entry: LedgerEntry): LedgerEntry[] {
  return [...entries, entry];
}

/** Replaces one entry by id with `patch` merged in - e.g. settling a "D" shipment's starlinkCost.
 * Never used to touch amount/kind/currency (the customer-facing side of an entry, which a
 * Starlink-cost settlement must never affect) - callers settling a cost should only ever pass
 * `{ starlinkCost: ... }`. A no-op if entryId isn't found. */
export function updateEntry(entries: LedgerEntry[], entryId: string, patch: Partial<LedgerEntry>): LedgerEntry[] {
  return entries.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry));
}

export function removeEntry(entries: LedgerEntry[], entryId: string): LedgerEntry[] {
  return entries.filter((entry) => entry.id !== entryId);
}

export interface CreateLedgerEntryInput {
  kind: LedgerEntryKind;
  amount: number;
  currency: LedgerCurrency;
  note: string;
  email: string;
  /** Ignored (never stored) for a "debit" entry - a charge has no payment channel. */
  paymentMethod?: PaymentMethod;
  date: string;
  /** Ignored for a "credit" entry. The caller (which has access to currencyStore.ts) computes this
   * snapshot before calling in - omit for a USD entry or when the amount isn't a shipment sale. */
  saleRate?: RateSnapshot;
  /** Ignored for a "debit" entry. The caller computes this snapshot before calling in - omit for a
   * USD entry or when the payment's USD value isn't being tracked. */
  paymentRate?: RateSnapshot;
  /** Ignored for a "credit" entry. The caller (which has access to currencyStore.ts) builds the
   * full cost record up front - status "pending" for a still-"D" shipment (its amount/currency/
   * rate are captured now regardless, so a later settlement doesn't start from blank), "settled"
   * when the operator already knows it's paid. Omit entirely for a debit entry with no Starlink
   * cost info at all (isLegacyShipmentEntry stays true for it, same as before this field existed). */
  starlinkCost?: StarlinkCost;
  /** Ignored unless `starlinkCost.status === "settled"` - see LedgerEntry.profitCurrencyRates. */
  profitCurrencyRates?: { MRU?: number; SIFA?: number };
  /** Ignored for a "credit" entry - the device's current representative and their current rate,
   * locked onto the new shipment (see LedgerEntry.representativeId). */
  representative?: { id: string; commissionPercent: number; sharesLosses?: boolean };
}

export function createLedgerEntry(input: CreateLedgerEntryInput): LedgerEntry {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ledger-${Date.now()}-${Math.random()}`;
  const isDebit = input.kind === "debit";
  return {
    id,
    kind: input.kind,
    amount: input.amount,
    currency: input.currency,
    note: input.note.trim(),
    email: input.email.trim(),
    paymentMethod: input.kind === "credit" ? input.paymentMethod : undefined,
    date: input.date,
    createdAt: new Date().toISOString(),
    saleRate: isDebit ? input.saleRate : undefined,
    starlinkCost: isDebit ? input.starlinkCost : undefined,
    paymentRate: !isDebit ? input.paymentRate : undefined,
    profitCurrencyRates: isDebit && input.starlinkCost?.status === "settled" ? input.profitCurrencyRates : undefined,
    representativeId: isDebit ? input.representative?.id : undefined,
    representativeCommissionPercent: isDebit ? input.representative?.commissionPercent : undefined,
    representativeSharesLosses: isDebit && input.representative?.sharesLosses ? true : undefined,
  };
}

/** Per currency, the sum of every account's positive balance (what customers owe) - accounts in
 * credit don't offset this total, since that would understate how much is actually outstanding. */
export function totalOwedAcrossAccounts(store: LedgerByAccount): BalanceByCurrency {
  const totals: BalanceByCurrency = {};
  for (const entries of Object.values(store)) {
    const balances = computeBalanceByCurrency(entries);
    for (const currency of LEDGER_CURRENCIES) {
      const balance = balances[currency];
      if (balance !== undefined && balance > 0) {
        totals[currency] = (totals[currency] ?? 0) + balance;
      }
    }
  }
  return totals;
}
