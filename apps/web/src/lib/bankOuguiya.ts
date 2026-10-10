/**
 * 🏦 The bank apps (بنكيلي، سداد، مصرفي، أمانتي…) speak in the NEW ouguiya (MRU / «أوقية جديدة»);
 * the whole app works in the OLD ouguiya (his «أوقية», rate ≈430 per dollar). His Oct 10 2026 rule:
 * «100 MRU تساوي 1000 MRO» - every bank-notification amount in MRU is ×10 before it becomes a
 * suggestion. Suggestions and records made before that rule were 10× too small: they are fixed
 * once (his choice: «صحّحها كلها تلقائياً ×10»). A confirmed record has no link back to its
 * notification, so it's found by what the confirm sheet saved - amount, currency, day and the
 * note (suggestionNote) - and fixed only when exactly one record matches; anything else is left
 * as it is and counted for him. Every fix is listed in the inbox (`ouguiyaFix`). Pure.
 */

import { noticeDay, OLD_OUGUIYA_PER_MRU, suggestionNote, type BankInbox, type BankSuggestion } from "./bankNotices";
import type { CashEntryList } from "./cashStore";
import type { LedgerByAccount } from "./ledgerStore";
import type { AccountsBook } from "./moneyAccounts";
import type { DebtBook, IncomeList } from "./myMoney";
import type { PartyAdjustmentList } from "./partyBalanceStore";
import type { PersonalExpenseList } from "./personalExpenses";
import type { RepSettlementList } from "./repStore";

export { OLD_OUGUIYA_PER_MRU, toAppOuguiya } from "./bankNotices";

const round = (n: number) => Math.round(n * 100) / 100;

export type FixedStore = "expense" | "income" | "debt" | "debt-payment" | "supplier" | "rep" | "customer" | "transfer";

export interface OuguiyaFixLine {
  suggestionId: string;
  store: FixedStore;
  recordId: string;
  from: number;
  to: number;
}

export interface OuguiyaFix {
  at: string;
  /** Waiting suggestions whose amount was ×10. */
  pending: number;
  fixed: OuguiyaFixLine[];
  /** Confirmed suggestions whose record wasn't found for sure (left as they are). */
  unmatched: string[];
}

export interface MoneyStores {
  expenses: PersonalExpenseList;
  income: IncomeList;
  debts: DebtBook;
  party: PartyAdjustmentList;
  reps: RepSettlementList;
  ledger: LedgerByAccount;
  accounts: AccountsBook;
  cash: CashEntryList;
}

/** Read before the rule: an MRU amount still in new ouguiya. */
const isOldMru = (s: BankSuggestion) => s.currencyCode === "MRU" && s.amount !== undefined && !s.appOuguiya;

/** Whether the one-time fix still has to run. */
export function needsOuguiyaFix(inbox: Pick<BankInbox, "ouguiyaFix" | "suggestions">): boolean {
  return !inbox.ouguiyaFix && inbox.suggestions.some(isOldMru);
}

interface Candidate {
  store: FixedStore;
  id: string;
  amount: number;
  currency: string | undefined;
  date: string;
  note: string | undefined;
}

function candidates(stores: MoneyStores): Candidate[] {
  const list: Candidate[] = [];
  for (const e of stores.expenses) list.push({ store: "expense", id: e.id, amount: e.amount, currency: e.currencyCode, date: e.date, note: e.note });
  for (const e of stores.income) list.push({ store: "income", id: e.id, amount: e.amount, currency: e.currencyCode, date: e.date, note: e.note });
  for (const e of stores.debts.debts) list.push({ store: "debt", id: e.id, amount: e.amount, currency: e.currencyCode, date: e.date, note: e.note });
  for (const e of stores.party) list.push({ store: "supplier", id: e.id, amount: e.amount, currency: e.currencyCode, date: e.date, note: e.note });
  for (const e of stores.reps) list.push({ store: "rep", id: e.id, amount: e.amount, currency: e.currencyCode, date: e.date, note: e.note });
  for (const entries of Object.values(stores.ledger))
    for (const e of entries) if (e.kind === "credit") list.push({ store: "customer", id: e.id, amount: e.amount, currency: e.currency, date: e.date, note: e.note });
  for (const e of stores.accounts.transfers ?? []) list.push({ store: "transfer", id: e.id, amount: e.amount, currency: e.currencyCode, date: e.date, note: e.note });
  return list;
}

/** A debt repayment carries no note or currency: it's matched by amount and day, and only for a
 * suggestion that became one (its outcome says so). */
function paymentCandidates(stores: MoneyStores): Candidate[] {
  const currencyOf = new Map(stores.debts.debts.map((d) => [d.id, d.currencyCode]));
  return stores.debts.payments.map((p) => ({ store: "debt-payment" as const, id: p.id, amount: p.amount, currency: currencyOf.get(p.debtId), date: p.date, note: undefined }));
}

const isDebtPaymentOutcome = (outcome: string | undefined) => Boolean(outcome && /سدّدت|ردّ دينه/.test(outcome));

/** The one-time fix: waiting MRU suggestions ×10, and each confirmed one's record ×10 when found
 * for sure. Returns the new inbox (with `ouguiyaFix`) and the stores to save. */
export function applyOuguiyaFix(inbox: BankInbox, stores: MoneyStores, now: Date = new Date()): { inbox: BankInbox; stores: MoneyStores; fix: OuguiyaFix } {
  const isMru = isOldMru;
  let pending = 0;
  const confirmed: BankSuggestion[] = [];
  const suggestions = inbox.suggestions.map((s) => {
    if (!isMru(s)) return s;
    if (s.status === "pending") {
      pending += 1;
      return { ...s, amount: round(s.amount! * OLD_OUGUIYA_PER_MRU), appOuguiya: true };
    }
    if (s.status === "done") confirmed.push(s);
    // A rejected one is only shown in the list - its figure is corrected too.
    return { ...s, amount: round(s.amount! * OLD_OUGUIYA_PER_MRU), appOuguiya: true };
  });

  const all = candidates(stores);
  const payments = paymentCandidates(stores);
  const used = new Set<string>();
  const targets = new Map<string, { line: OuguiyaFixLine }>();
  const unmatched: string[] = [];
  for (const s of confirmed) {
    const day = noticeDay(s.at);
    const note = suggestionNote(s);
    const pool = isDebtPaymentOutcome(s.outcome) ? payments : all;
    const found = pool.filter(
      (c) =>
        !used.has(`${c.store}:${c.id}`) &&
        Math.abs(c.amount - s.amount!) < 0.005 &&
        c.currency === "MRU" &&
        c.date === day &&
        (c.store === "debt-payment" || (c.note ?? "").trim() === note),
    );
    if (found.length !== 1) {
      unmatched.push(s.id);
      continue;
    }
    const c = found[0]!;
    used.add(`${c.store}:${c.id}`);
    targets.set(`${c.store}:${c.id}`, { line: { suggestionId: s.id, store: c.store, recordId: c.id, from: c.amount, to: round(c.amount * OLD_OUGUIYA_PER_MRU) } });
  }

  const hit = (store: FixedStore, id: string) => targets.get(`${store}:${id}`)?.line;
  const times = (n: number) => round(n * OLD_OUGUIYA_PER_MRU);
  const fixedTransfers = new Set<string>();
  const next: MoneyStores = {
    expenses: stores.expenses.map((e) => (hit("expense", e.id) ? { ...e, amount: times(e.amount) } : e)),
    income: stores.income.map((e) => (hit("income", e.id) ? { ...e, amount: times(e.amount) } : e)),
    debts: {
      ...stores.debts,
      debts: stores.debts.debts.map((e) => (hit("debt", e.id) ? { ...e, amount: times(e.amount) } : e)),
      payments: stores.debts.payments.map((e) => (hit("debt-payment", e.id) ? { ...e, amount: times(e.amount) } : e)),
    },
    party: stores.party.map((e) => (hit("supplier", e.id) ? { ...e, amount: times(e.amount) } : e)),
    reps: stores.reps.map((e) => (hit("rep", e.id) ? { ...e, amount: times(e.amount) } : e)),
    ledger: Object.fromEntries(
      Object.entries(stores.ledger).map(([accountId, entries]) => [
        accountId,
        entries.map((e) =>
          hit("customer", e.id)
            ? { ...e, amount: times(e.amount), ...(e.paymentRate ? { paymentRate: { ...e.paymentRate, usdValue: e.paymentRate.usdValue * OLD_OUGUIYA_PER_MRU } } : {}) }
            : e,
        ),
      ]),
    ),
    accounts: {
      ...stores.accounts,
      ...(stores.accounts.transfers
        ? {
            transfers: stores.accounts.transfers.map((e) => {
              if (!hit("transfer", e.id)) return e;
              fixedTransfers.add(e.id);
              return { ...e, amount: times(e.amount) };
            }),
          }
        : {}),
    },
    cash: stores.cash,
  };
  // A cash deposit / withdrawal posted from a fixed transfer moves with it.
  next.cash = stores.cash.map((e) => (e.sourceKind === "account-transfer" && e.sourceId && fixedTransfers.has(e.sourceId) ? { ...e, amount: times(e.amount) } : e));

  const fix: OuguiyaFix = { at: now.toISOString(), pending, fixed: [...targets.values()].map((t) => t.line), unmatched };
  return { inbox: { ...inbox, suggestions, ouguiyaFix: fix }, stores: next, fix };
}
