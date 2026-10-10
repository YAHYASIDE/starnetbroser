/**
 * 🧠 Rules for «عمليات البنوك» (his Oct 10 2026 choice «يُجهّز وتؤكد بضغطة»): when he confirms a
 * notification from a number and keeps «تذكّر», the next ones from that number in the same direction
 * come out ready - same account, same choice (this customer's device, this supplier, this expense…).
 * Nothing is ever recorded by itself: «⚡ تأكيد الكل الجاهز» records them in one tap, each one exactly
 * as if he confirmed it. A suggestion flagged «قد يكون مكررًا» is never ready (he must look). Debt
 * repayments and transfers between his own apps aren't learned (they change each time). Pure + storage.
 */

import { localNumber, noticeDay, suggestionDirection, suggestionNote, type BankSuggestion } from "./bankNotices";
import type { SuggestionChoice, SuggestionSaveInput } from "./bankSuggestionSave";
import type { MoneyAccount } from "./moneyAccounts";

/** A choice as it's kept (the other account of a transfer by its id). */
export type StoredChoice = Exclude<SuggestionChoice, { type: "transfer" } | { type: "debt-payment" } | { type: "cash" }>;

export interface BankRule {
  /** The other person's number (local form). */
  number: string;
  direction: "in" | "out";
  accountId: string;
  choice: StoredChoice;
  /** What it becomes, in words («👤 دفعة زبون: جهاز»). */
  label: string;
  name?: string;
  createdAt: string;
}

export type BankRules = BankRule[];

const LEARNABLE = new Set<SuggestionChoice["type"]>(["expense", "income", "new-debt", "supplier", "rep", "customer"]);

export function canLearn(s: BankSuggestion, choice: SuggestionChoice): boolean {
  const dir = suggestionDirection(s);
  return Boolean(s.party?.number) && (dir === "in" || dir === "out") && LEARNABLE.has(choice.type);
}

/** Learns (or replaces) the rule for this suggestion's number + direction. */
export function learnRule(rules: BankRules, s: BankSuggestion, input: Pick<SuggestionSaveInput, "account" | "choice">, label: string, now = new Date()): BankRules {
  if (!canLearn(s, input.choice)) return rules;
  const number = localNumber(s.party!.number!);
  const direction = suggestionDirection(s) as "in" | "out";
  const rule: BankRule = {
    number,
    direction,
    accountId: input.account.id,
    choice: input.choice as StoredChoice,
    label,
    ...(s.party?.name ? { name: s.party.name } : {}),
    createdAt: now.toISOString(),
  };
  return [...rules.filter((r) => !(r.number === number && r.direction === direction)), rule];
}

export function deleteRule(rules: BankRules, number: string, direction: "in" | "out"): BankRules {
  return rules.filter((r) => !(r.number === number && r.direction === direction));
}

export function ruleFor(rules: BankRules, s: BankSuggestion): BankRule | undefined {
  const dir = suggestionDirection(s);
  if (!s.party?.number || (dir !== "in" && dir !== "out")) return undefined;
  const number = localNumber(s.party.number);
  return rules.find((r) => r.number === number && r.direction === dir);
}

export interface ReadySuggestion {
  suggestion: BankSuggestion;
  rule: BankRule;
  input: SuggestionSaveInput;
}

/** The waiting suggestions a rule can record as they are (account still there, amount known). */
export function readySuggestions(pending: BankSuggestion[], rules: BankRules, accounts: MoneyAccount[]): ReadySuggestion[] {
  const out: ReadySuggestion[] = [];
  for (const s of pending) {
    if (s.status !== "pending" || s.maybeDuplicate || s.amount === undefined || !(s.amount > 0)) continue;
    const rule = ruleFor(rules, s);
    const account = rule && accounts.find((a) => a.id === rule.accountId);
    if (!rule || !account) continue;
    out.push({
      suggestion: s,
      rule,
      input: { account, direction: rule.direction, amount: s.amount, currencyCode: s.currencyCode ?? account.currencyCode, date: noticeDay(s.at), note: suggestionNote(s), choice: rule.choice },
    });
  }
  return out;
}

const KEY = "starnet_bank_rules_v1";

export function loadBankRules(): BankRules {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as BankRules) : [];
  } catch {
    return [];
  }
}

export function saveBankRules(rules: BankRules): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(rules));
}
