/**
 * 💳 Which registered card pays which device (his Oct 2026 request): each card lists the devices
 * whose Starlink «Payment Method» (read by sync, or chosen in the device's dialog) ends with its 4
 * digits; a device paid by a card that isn't registered is flagged; and each card gets its own
 * statement - the D's paid for its devices, plus KAST payment notices that carry its digits. Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { CardDeposit, PaymentCard } from "./kastCards";
import { renewalDayOf } from "./renewalDayLock";

const live = (a: StarlinkAccountSummary) => !a.deletedAt && !a.archivedAt;
const last4Of = (a: Pick<StarlinkAccountSummary, "paymentCardLast4">) => (a.paymentCardLast4 ?? "").replace(/\D/g, "").slice(-4);

export interface CardDeviceGroups {
  /** card last4 -> its live devices (registered cards only, every card present even when empty). */
  byCard: Record<string, StarlinkAccountSummary[]>;
  /** ⚠️ Live devices paid by a card that isn't one of his registered cards. */
  unregistered: StarlinkAccountSummary[];
  /** Live devices whose card isn't known yet (never synced Billing, or no card on Starlink). */
  unknown: number;
}

export function groupDevicesByCard(accounts: StarlinkAccountSummary[], cards: Pick<PaymentCard, "last4">[]): CardDeviceGroups {
  const byCard: Record<string, StarlinkAccountSummary[]> = Object.fromEntries(cards.map((c) => [c.last4, []]));
  const out: CardDeviceGroups = { byCard, unregistered: [], unknown: 0 };
  for (const account of accounts) {
    if (!live(account)) continue;
    const last4 = last4Of(account);
    if (last4.length !== 4) out.unknown += 1;
    else if (byCard[last4]) byCard[last4]!.push(account);
    else out.unregistered.push(account);
  }
  return out;
}

/** Whether a device's card is one he didn't register (a card on the card itself: «💳 •1468 غير مسجّلة»). */
export function isUnregisteredCard(account: Pick<StarlinkAccountSummary, "paymentCardLast4">, cards: Pick<PaymentCard, "last4">[]): boolean {
  const last4 = last4Of(account);
  return last4.length === 4 && cards.length > 0 && !cards.some((c) => c.last4 === last4);
}

export interface CardStatementRow {
  date: string;
  kind: "paid" | "notice";
  amountUsd: number;
  /** The device paid (a D), or the merchant of a KAST notice not matched yet. */
  label: string;
  accountId?: string;
}

export interface CardStatement {
  rows: CardStatementRow[];
  /** "yyyy-mm" -> dollars paid for this card's devices that month. */
  months: Record<string, number>;
  totalPaidUsd: number;
}

/**
 * One card's statement, newest first: the D's settled for its devices (the money really paid) and
 * the KAST notices with its digits still waiting to be matched (shown, never counted twice).
 */
export function buildCardStatementFor(
  last4: string,
  accounts: StarlinkAccountSummary[],
  payments: { accountId: string; amountUsd: number; date: string }[],
  deposits: Pick<CardDeposit, "kind" | "cardLast4" | "amountUsd" | "at" | "status" | "merchant">[],
): CardStatement {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const rows: CardStatementRow[] = [];
  const months: Record<string, number> = {};
  let totalPaidUsd = 0;
  for (const p of payments) {
    const account = byId.get(p.accountId);
    if (!account || last4Of(account) !== last4) continue;
    rows.push({ date: p.date, kind: "paid", amountUsd: p.amountUsd, label: account.name || "جهاز", accountId: account.id });
    const month = p.date.slice(0, 7);
    months[month] = (months[month] ?? 0) + p.amountUsd;
    totalPaidUsd += p.amountUsd;
  }
  for (const d of deposits) {
    if (d.kind !== "spent" || d.status !== "pending" || (d.cardLast4 ?? "") !== last4) continue;
    rows.push({ date: new Date(d.at).toISOString().slice(0, 10), kind: "notice", amountUsd: d.amountUsd, label: d.merchant || "Starlink" });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  return { rows, months, totalPaidUsd };
}

/** One device under its card (his Oct 2026 ask «أضف لي كل بطاقة البريد واليوم الذي يشحن فيه
 * الجهاز»): its Starlink email and the day of the month it renews (when the card is charged). */
export interface CardDeviceRow {
  id: string;
  name: string;
  email?: string;
  /** 1-28: the locked renewal day, else the day of its renewal date; undefined when not read yet. */
  day?: number;
}

/** A card's devices with email and renewal day, the soonest day of the month first (unknown last). */
export function cardDeviceRows(devices: StarlinkAccountSummary[]): CardDeviceRow[] {
  return devices
    .map((d) => {
      const day = d.lockedRenewalDay ?? renewalDayOf(d.rechargeDate);
      const email = d.starlinkAccountEmail?.trim() || d.expectedEmail?.trim() || undefined;
      return { id: d.id, name: d.name, ...(email ? { email } : {}), ...(day ? { day } : {}) };
    })
    .sort((a, b) => (a.day ?? 99) - (b.day ?? 99) || a.name.localeCompare(b.name));
}
