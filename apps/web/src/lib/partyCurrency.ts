/**
 * 💱 عملة المندوب / الزبون (his Oct 2026 words «ان كنا نتعامل معه علي عملة فلتكن هي عملته الافتراضي
 * وعندما نغير احد اجهزته الي عملة اخرا … يجب ان يظهر لنا تنبيه واضح جدا»): every rep and customer
 * has a default currency - the one he chose on the rep / customer («💱 عملته»), else the one most of
 * his devices' shipments (and monthly prices) are in. An operation, a payment or a monthly price in
 * another currency is stopped by a clear window before saving; one he confirms there is stamped
 * `currencyConfirmed` and never flagged again; older ones show «⚠️ عملة مختلفة» and are listed in
 * «خطة اليوم». Nothing is converted - it only warns. Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import { formatAmount } from "./formatAmount";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, type LedgerByAccount, type LedgerCurrency, type LedgerEntry } from "./ledgerStore";
import { currentRepOfClient } from "./repClients";
import type { RepresentativeStore } from "./repStore";

export type PartyKind = "rep" | "client";

export interface PartyRef {
  kind: PartyKind;
  id: string;
  name: string;
}

/** The currency a party is dealt with in, and where it came from (`auto` = from his operations). */
export interface ExpectedCurrency extends PartyRef {
  currency: LedgerCurrency;
  auto: boolean;
}

export interface PartyCurrencyContext {
  accounts: StarlinkAccountSummary[];
  clients: ClientStore;
  reps: RepresentativeStore;
  ledger: LedgerByAccount;
  /** On the rep's own phone everything is his: the party is always the customer. */
  repWorkspace?: boolean;
}

type DeviceLink = Pick<StarlinkAccountSummary, "clientId" | "representativeId">;

export function isLedgerCurrency(code: string | undefined): code is LedgerCurrency {
  return LEDGER_CURRENCIES.includes(code as LedgerCurrency);
}

/** Whose money a device's operations are: its rep (on the device, or the customer's current rep),
 * else its customer. */
export function partyOf(device: DeviceLink, clients: ClientStore, reps: RepresentativeStore, repWorkspace = false): PartyRef | undefined {
  const client = device.clientId ? clients[device.clientId] : undefined;
  if (!repWorkspace) {
    const repId = device.representativeId || currentRepOfClient(client);
    const rep = repId ? reps[repId] : undefined;
    if (rep) return { kind: "rep", id: rep.id, name: rep.name };
  }
  return client ? { kind: "client", id: client.id, name: client.name } : undefined;
}

function partyKey(party: Pick<PartyRef, "kind" | "id">): string {
  return `${party.kind}:${party.id}`;
}

/** The currency with strictly the most votes, or undefined (none, or a tie - no clear default). */
export function dominantCurrency(votes: LedgerCurrency[]): LedgerCurrency | undefined {
  const counts = new Map<LedgerCurrency, number>();
  for (const vote of votes) counts.set(vote, (counts.get(vote) ?? 0) + 1);
  let best: LedgerCurrency | undefined;
  let bestCount = 0;
  let tie = false;
  for (const [currency, count] of counts) {
    if (count > bestCount) {
      best = currency;
      bestCount = count;
      tie = false;
    } else if (count === bestCount) tie = true;
  }
  return tie ? undefined : best;
}

function explicitCurrency(party: PartyRef, ctx: Pick<PartyCurrencyContext, "clients" | "reps">): LedgerCurrency | undefined {
  const chosen = party.kind === "rep" ? ctx.reps[party.id]?.defaultCurrency : ctx.clients[party.id]?.defaultCurrency;
  return isLedgerCurrency(chosen) ? chosen : undefined;
}

function liveDevices(accounts: StarlinkAccountSummary[]): StarlinkAccountSummary[] {
  return accounts.filter((a) => !a.deletedAt && !a.archivedAt);
}

/** Each party's votes: one per shipment (عليه) on his devices, plus each device's monthly price. */
function partyVotes(ctx: PartyCurrencyContext): Map<string, LedgerCurrency[]> {
  const votes = new Map<string, LedgerCurrency[]>();
  for (const account of liveDevices(ctx.accounts)) {
    const party = partyOf(account, ctx.clients, ctx.reps, ctx.repWorkspace);
    if (!party) continue;
    const list = votes.get(partyKey(party)) ?? [];
    for (const entry of ctx.ledger[account.id] ?? []) if (entry.kind === "debit" && isLedgerCurrency(entry.currency)) list.push(entry.currency);
    const plan = account.renewalPlan?.saleCurrency;
    if (isLedgerCurrency(plan)) list.push(plan);
    votes.set(partyKey(party), list);
  }
  return votes;
}

/** The party's currency: his chosen one, else the dominant one of his operations. */
export function partyCurrency(party: PartyRef, ctx: PartyCurrencyContext, votes: Map<string, LedgerCurrency[]> = partyVotes(ctx)): ExpectedCurrency | undefined {
  const explicit = explicitCurrency(party, ctx);
  if (explicit) return { ...party, currency: explicit, auto: false };
  const auto = dominantCurrency(votes.get(partyKey(party)) ?? []);
  return auto ? { ...party, currency: auto, auto: true } : undefined;
}

/** What his operations show as «تلقائي (…)» in the picker - ignores his chosen currency. */
export function autoCurrencyOf(kind: PartyKind, id: string, ctx: PartyCurrencyContext): LedgerCurrency | undefined {
  return dominantCurrency(partyVotes(ctx).get(partyKey({ kind, id })) ?? []);
}

/** The currency a device's operations are expected in, or undefined (no party / no clear one). */
export function expectedCurrencyFor(device: DeviceLink, ctx: PartyCurrencyContext): ExpectedCurrency | undefined {
  const party = partyOf(device, ctx.clients, ctx.reps, ctx.repWorkspace);
  return party ? partyCurrency(party, ctx) : undefined;
}

/** True when an amount in `chosen` doesn't match the party's currency. */
export function isCurrencyMismatch(expected: ExpectedCurrency | undefined, chosen: string): boolean {
  return Boolean(expected && isLedgerCurrency(chosen) && chosen !== expected.currency);
}

const PARTY_WORD: Record<PartyKind, string> = { rep: "المندوب", client: "الزبون" };

function currencyWord(code: LedgerCurrency): string {
  return LEDGER_CURRENCY_LABELS[code];
}

/** «بالسيفا» / «بالأوقية» / «بالدولار». */
export const IN_CURRENCY: Record<LedgerCurrency, string> = { MRU: "بالأوقية", SIFA: "بالسيفا", USD: "بالدولار" };

/** «⚠️ المندوب «X» يتعامل بالسيفا، وأنت تسجّل 6,000 أوقية» - the red line in a form. */
export function currencyWarning(expected: ExpectedCurrency, chosen: LedgerCurrency, amount?: number): string {
  const what = amount !== undefined && Number.isFinite(amount) && amount > 0 ? `${formatAmount(amount)} ${currencyWord(chosen)}` : IN_CURRENCY[chosen];
  return `⚠️ ${PARTY_WORD[expected.kind]} «${expected.name}» يتعامل ${IN_CURRENCY[expected.currency]}، وأنت تسجّل ${what}`;
}

/** Where his currency came from, for the window: «عملته المحددة» / «من أغلب عملياته». */
export function currencySourceText(expected: ExpectedCurrency): string {
  return expected.auto ? `عملته تلقائيًا من أغلب عملياته: ${currencyWord(expected.currency)}` : `عملته المحددة: ${currencyWord(expected.currency)}`;
}

export interface CurrencyMismatch {
  accountId: string;
  deviceName: string;
  /** Absent for a device's monthly price. */
  entry?: LedgerEntry;
  expected: ExpectedCurrency;
  currency: LedgerCurrency;
  amount: number;
}

/** Every saved operation (and monthly price) in another currency than its party's, newest first -
 * those he confirmed in the window are left out. */
export function currencyMismatches(ctx: PartyCurrencyContext): CurrencyMismatch[] {
  const votes = partyVotes(ctx);
  const cache = new Map<string, ExpectedCurrency | undefined>();
  const out: CurrencyMismatch[] = [];
  for (const account of liveDevices(ctx.accounts)) {
    const party = partyOf(account, ctx.clients, ctx.reps, ctx.repWorkspace);
    if (!party) continue;
    const key = partyKey(party);
    if (!cache.has(key)) cache.set(key, partyCurrency(party, ctx, votes));
    const expected = cache.get(key);
    if (!expected) continue;
    for (const entry of ctx.ledger[account.id] ?? []) {
      if (entry.currencyConfirmed || !isCurrencyMismatch(expected, entry.currency)) continue;
      out.push({ accountId: account.id, deviceName: account.name, entry, expected, currency: entry.currency, amount: entry.amount });
    }
    const plan = account.renewalPlan;
    if (plan && !plan.currencyConfirmed && isLedgerCurrency(plan.saleCurrency) && isCurrencyMismatch(expected, plan.saleCurrency)) {
      out.push({ accountId: account.id, deviceName: account.name, expected, currency: plan.saleCurrency, amount: plan.saleAmount });
    }
  }
  return out.sort((a, b) => (b.entry?.date ?? "9999").localeCompare(a.entry?.date ?? "9999") || (b.entry?.createdAt ?? "").localeCompare(a.entry?.createdAt ?? ""));
}

/** Ids of the saved operations shown with «⚠️ عملة مختلفة». */
export function mismatchedEntryIds(ctx: PartyCurrencyContext): Set<string> {
  return new Set(currencyMismatches(ctx).flatMap((m) => (m.entry ? [m.entry.id] : [])));
}

/** One line of the list: «جهاز X · 6,000 أوقية · 2026-10-01 - المندوب «Y» يتعامل بالسيفا». */
export function mismatchLine(m: CurrencyMismatch): { label: string; detail: string } {
  const what = m.entry ? (m.entry.kind === "credit" ? "دفعة" : "شحنة") : "السعر الشهري";
  const date = m.entry ? ` · ${m.entry.date}` : "";
  return {
    label: m.deviceName,
    detail: `${what} ${formatAmount(m.amount)} ${currencyWord(m.currency)}${date} - ${PARTY_WORD[m.expected.kind]} «${m.expected.name}» يتعامل ${IN_CURRENCY[m.expected.currency]}`,
  };
}
