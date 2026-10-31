import type { SyncOp } from "./deviceSync";
import { formatAmount } from "./formatAmount";
import { LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "./ledgerStore";

/**
 * 👥 What came from the other members of the link team (his Oct 31 2026 choices for «المسؤول 2»): a mark «🔗 سجّله
 * <name>» on what one of them added or changed, a log «ماذا وصل منه», and a notification for every new device or money
 * operation. Pure: the round (lib/deviceLink.ts) hands the ops it applied, this says what they were.
 */

export interface TeamActivity {
  at: string;
  /** The member's name. */
  by: string;
  kind: "add" | "edit" | "del";
  /** The store key and record id (the mark's address). */
  k: string;
  r: string;
  /** «📡 جهاز DEMO» / «💵 5,000 أوقية» / … */
  label: string;
  /** A new device or a money operation - worth a notification. */
  notable: boolean;
}

export interface Origin {
  by: string;
  at: string;
}

const SEP = "\u001f";

/** Money stores: a new record is a money operation. */
const MONEY: Record<string, string> = {
  starnet_customer_ledger_v1: "💵 عملية",
  starnet_rep_settlements_v1: "🤝 عملية مندوب",
  starnet_cash_entries_v1: "💵 الكاش",
  starnet_store_invoices_v1: "🧾 فاتورة",
  starnet_party_adjustments_v1: "⚖️ رصيد",
  starnet_business_expenses_v1: "📉 مصروف عمل",
};

const NAMED: Record<string, string> = {
  starnet_demo_accounts_v1: "📡 جهاز",
  starnet_clients_v1: "👤 زبون",
  starnet_representatives_v1: "🤝 مندوب",
};

function parse(v: string | null | undefined): Record<string, unknown> | null {
  try {
    const x = v ? JSON.parse(v) : null;
    return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function money(rec: Record<string, unknown>): string {
  const amount = Number(rec.amount);
  const code = String(rec.currency ?? rec.currencyCode ?? "");
  if (!Number.isFinite(amount)) return "";
  return `${formatAmount(Math.abs(amount))} ${LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code}`.trim();
}

/** One applied op, said in his words. `before` = the record as it was here. */
export function describeOp(op: Pick<SyncOp, "k" | "r" | "v" | "at">, before: string | undefined, by: string): TeamActivity | null {
  if (op.r.endsWith(SEP)) return null; // an emptied device list, nothing to say
  const kind: TeamActivity["kind"] = op.v === null ? "del" : before === undefined ? "add" : "edit";
  const rec = parse(op.v ?? before);
  let label: string;
  let notable = false;
  if (NAMED[op.k]) {
    label = `${NAMED[op.k]} ${String(rec?.name ?? "")}`.trim();
    notable = op.k === "starnet_demo_accounts_v1" && kind === "add";
  } else if (MONEY[op.k]) {
    const amount = rec ? money(rec) : "";
    label = `${MONEY[op.k]}${amount ? ` ${amount}` : ""}`;
    notable = kind === "add";
  } else {
    return null; // settings-like stores: carried, not worth a line
  }
  return { at: op.at, by, kind, k: op.k, r: op.r, label, notable };
}

/** The marks after a round: added / changed by a member → his mark; deleted → gone. */
export function nextOrigins(origins: Record<string, Origin>, activity: TeamActivity[], limit = 5000): Record<string, Origin> {
  const out = { ...origins };
  for (const a of activity) {
    const id = `${a.k}|${a.r}`;
    if (a.kind === "del") delete out[id];
    else out[id] = { by: a.by, at: a.at };
  }
  const keys = Object.keys(out);
  if (keys.length > limit) for (const k of keys.sort((a, b) => (out[a]!.at < out[b]!.at ? -1 : 1)).slice(0, keys.length - limit)) delete out[k];
  return out;
}

/** The mark of a device («starnet_demo_accounts_v1» record) or of one of its operations. */
export function deviceOrigin(origins: Record<string, Origin>, accountId: string): Origin | undefined {
  return origins[`starnet_demo_accounts_v1|${accountId}`];
}

export function entryOrigin(origins: Record<string, Origin>, accountId: string, entryId: string): Origin | undefined {
  return origins[`starnet_customer_ledger_v1|${accountId}${SEP}${entryId}`];
}

const VERB: Record<TeamActivity["kind"], string> = { add: "أضاف", edit: "عدّل", del: "حذف" };

/** One line of the log / the notification. */
export function activityLine(a: TeamActivity): string {
  return `${VERB[a.kind]} ${a.label}`;
}

/** The notification for a round: per member, its new devices and money operations (3 lines, then «و N أخرى»). */
export function activityNotification(activity: TeamActivity[]): string | null {
  const notable = activity.filter((a) => a.notable);
  if (notable.length === 0) return null;
  const by = [...new Set(notable.map((a) => a.by))].join(" و");
  const lines = notable.slice(0, 3).map(activityLine);
  if (notable.length > 3) lines.push(`و ${notable.length - 3} أخرى`);
  return `🔗 ${by}\n${lines.join("\n")}`;
}
