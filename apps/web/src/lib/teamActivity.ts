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
  /** A new device or a money operation - worth a notification. His Nov 26 2026: every deletion too. */
  notable: boolean;
  /** 🅳 A «عليه» (debit) operation of a device - the D (his Nov 26 2026 «إزالة D»). */
  d?: boolean;
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

/** 🚩 Warnings and team alerts (lib/repFlags.ts). */
const FLAGS_KEY = "starnet_rep_flags_v1";

const NAMED: Record<string, string> = {
  starnet_demo_accounts_v1: "📡 جهاز",
  starnet_clients_v1: "👤 زبون",
  starnet_representatives_v1: "🤝 مندوب",
};

/** A store whose records he sees as things (devices, customers, reps) or money - deleting one is worth asking about. */
export function isNotableStore(k: string): boolean {
  return Boolean(NAMED[k] || MONEY[k]);
}

/** «📡 الأجهزة» … - the stores the copy counts and compares with YAHYA. */
export const COUNTED_STORES: { k: string; label: string }[] = [
  { k: "starnet_demo_accounts_v1", label: "📡 الأجهزة" },
  { k: "starnet_clients_v1", label: "👤 الزبائن" },
  { k: "starnet_customer_ledger_v1", label: "💵 عمليات الأجهزة" },
  { k: "starnet_representatives_v1", label: "🤝 المندوبون" },
  { k: "starnet_rep_settlements_v1", label: "🤝 عمليات المندوبين" },
  { k: "starnet_cash_entries_v1", label: "💵 الكاش" },
  { k: "starnet_store_invoices_v1", label: "🧾 الفواتير" },
  { k: "starnet_party_adjustments_v1", label: "⚖️ الأرصدة" },
];

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
  if (op.k === FLAGS_KEY) {
    // 🚩 a team alert (his Nov 7 2026 ask): a new one, or YAHYA's «✓ راجعته» on it - both worth a notification
    if (!rec || typeof rec.by !== "string" || kind === "del") return null;
    const device = String(rec.deviceName ?? "");
    const reviewed = Boolean(rec.reviewedAt) && !parse(before ?? null)?.reviewedAt;
    if (kind === "add") label = `🚩 ${rec.level === "urgent" ? "🔴 عاجل - " : ""}تنبيه على ${device}: ${String(rec.note ?? "")}`;
    else if (reviewed) label = `✓ رُوجع التنبيه على ${device}`;
    else return null;
    return { at: op.at, by, kind, k: op.k, r: op.r, label, notable: true };
  }
  if (op.k === "starnet_currencies_v1") {
    // 🕵️ a rate / a pin changed on another phone (his Nov 21 2026 «أريد أن أعرف من غيّر السعر ومن أي جهاز»)
    if (kind === "del" || !rec) return null;
    const old = parse(before ?? null);
    const pinMoved = Boolean(rec.pinnedAt) !== Boolean(old?.pinnedAt);
    if (old && old.rateFromUsd === rec.rateFromUsd && !pinMoved) return null;
    label = `💱 ${String(rec.code ?? op.r)} = ${String(rec.rateFromUsd ?? "")}${pinMoved ? (rec.pinnedAt ? " 📌 ثبّته" : " 🔓 أزال التثبيت") : ""}`;
    return { at: op.at, by, kind, k: op.k, r: op.r, label, notable: true };
  }
  if (NAMED[op.k]) {
    label = `${NAMED[op.k]} ${String(rec?.name ?? "")}`.trim();
    notable = op.k === "starnet_demo_accounts_v1" && kind === "add";
  } else if (MONEY[op.k]) {
    const amount = rec ? money(rec) : "";
    // 🅳 a device's «عليه» operation is its D - said so in the log (his Nov 26 2026 «ازالة D»)
    const isD = op.k === "starnet_customer_ledger_v1" && rec?.kind === "debit";
    label = `${isD ? "🅳 D" : MONEY[op.k]}${amount ? ` ${amount}` : ""}`;
    notable = kind === "add" || kind === "del";
    return { at: op.at, by, kind, k: op.k, r: op.r, label, notable, ...(isD ? { d: true } : {}) };
  } else {
    return null; // settings-like stores: carried, not worth a line
  }
  // a deletion is never silent (his Nov 26 2026: «تنبيه واضح»)
  return { at: op.at, by, kind, k: op.k, r: op.r, label, notable: notable || kind === "del" };
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
  return a.kind === "del" ? `🗑️ حذف ${a.label}` : `${VERB[a.kind]} ${a.label}`;
}

/** The notification for a round: per member, its new devices and money operations (3 lines, then «و N أخرى»). */
export function activityNotification(activity: TeamActivity[]): string | null {
  // deletions first, and the title says so
  const notable = [...activity.filter((a) => a.notable)].sort((a, b) => Number(b.kind === "del") - Number(a.kind === "del"));
  if (notable.length === 0) return null;
  const by = [...new Set(notable.map((a) => a.by))].join(" و");
  const lines = notable.slice(0, 3).map(activityLine);
  if (notable.length > 3) lines.push(`و ${notable.length - 3} أخرى`);
  const dels = notable.filter((a) => a.kind === "del").length;
  return `${dels ? `🗑️ حذف من الفريق (${dels}) - ` : "🔗 "}${by}\n${lines.join("\n")}`;
}

// ---- 📜 «سجل العمليات»: search by day, kind, type and words (his Nov 26 2026) ----

export type LogCategory = "all" | "d" | "money" | "device" | "party" | "rate" | "alert";

export const LOG_CATEGORIES: { id: LogCategory; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "d", label: "🅳 D" },
  { id: "money", label: "💵 المال" },
  { id: "device", label: "📡 الأجهزة" },
  { id: "party", label: "👤 الزبائن والمندوبون" },
  { id: "rate", label: "💱 الأسعار" },
  { id: "alert", label: "🚩 التنبيهات" },
];

/** The kind of thing an entry is about. */
export function logCategory(a: TeamActivity): Exclude<LogCategory, "all"> | "other" {
  if (a.k === FLAGS_KEY) return "alert";
  if (a.k === "starnet_currencies_v1") return "rate";
  if (a.d) return "d";
  if (MONEY[a.k]) return "money";
  if (a.k === "starnet_demo_accounts_v1") return "device";
  if (NAMED[a.k]) return "party";
  return "other";
}

/** yyyy-mm-dd in the phone's own time (the day he means when he picks a day). */
export function dayKey(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Text for matching: Arabic digits → Latin, thousand separators dropped, lower case. */
export function normalizeQuery(text: string): string {
  return text
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[,٬،]/g, "")
    .replace(/[إأآ]/g, "ا")
    .toLowerCase()
    .trim();
}

export interface LogFilter {
  /** yyyy-mm-dd, or empty = every day. */
  day?: string;
  kind?: TeamActivity["kind"] | "all";
  cat?: LogCategory;
  /** Words: the member, the name, an amount… */
  q?: string;
}

export function filterLog(log: TeamActivity[], f: LogFilter): TeamActivity[] {
  const q = normalizeQuery(f.q ?? "");
  return log.filter((a) => {
    if (f.day && dayKey(a.at) !== f.day) return false;
    if (f.kind && f.kind !== "all" && a.kind !== f.kind) return false;
    if (f.cat && f.cat !== "all" && logCategory(a) !== f.cat) return false;
    if (q && !normalizeQuery(`${a.by} ${activityLine(a)}`).includes(q)) return false;
    return true;
  });
}

/** «12 عملية: 3 إضافة · 2 تعديل · 1 حذف». */
export function logSummary(list: TeamActivity[]): string {
  const n = (k: TeamActivity["kind"]) => list.filter((a) => a.kind === k).length;
  return `${list.length} عملية: ${n("add")} إضافة · ${n("edit")} تعديل · ${n("del")} حذف`;
}
