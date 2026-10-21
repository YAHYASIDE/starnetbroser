/**
 * 🖥️ The Windows app's devices table (his Oct 21 2026 brief: «جدول احترافي» with sorting, filters, columns
 * to show/hide and a details panel). Pure: the columns, how a device reads in each of them, the desk-only
 * filters (plan, expiry, category) and the sort. HomeView's own filters (status ring, day, customer,
 * search) run before this, so a device never appears here that the home page would hide.
 */
import { DeviceStatus, type StarlinkAccountSummary } from "@starnet/shared";
import { daysRemainingNumber } from "./date";

export type DeskColumnId = "name" | "client" | "email" | "plan" | "renewal" | "due" | "owed" | "dish" | "wifi" | "updated";

export interface DeskColumn {
  id: DeskColumnId;
  label: string;
  /** Can be sorted by clicking its header. */
  sortable: boolean;
  /** Shown when nothing was chosen yet. */
  byDefault: boolean;
}

export const DESK_COLUMNS: DeskColumn[] = [
  { id: "name", label: "الحساب", sortable: true, byDefault: true },
  { id: "client", label: "الزبون", sortable: true, byDefault: true },
  { id: "email", label: "البريد", sortable: false, byDefault: true },
  { id: "plan", label: "الباقة", sortable: true, byDefault: true },
  { id: "renewal", label: "ينتهي في", sortable: true, byDefault: true },
  { id: "due", label: "مستحق Starlink", sortable: true, byDefault: true },
  { id: "owed", label: "على الزبون", sortable: true, byDefault: false },
  { id: "dish", label: "الطبق", sortable: true, byDefault: true },
  { id: "wifi", label: "الواي فاي", sortable: true, byDefault: true },
  { id: "updated", label: "آخر قراءة", sortable: true, byDefault: true },
];

/** The column «الحساب» can never be hidden - a row must always say which device it is. */
export const LOCKED_COLUMN: DeskColumnId = "name";

export function defaultColumns(): DeskColumnId[] {
  return DESK_COLUMNS.filter((c) => c.byDefault).map((c) => c.id);
}

/** A saved choice back to a clean list in the table's own order (unknown ids dropped, «الحساب» kept). */
export function parseColumns(raw: unknown): DeskColumnId[] {
  if (!Array.isArray(raw)) return defaultColumns();
  const chosen = new Set(raw.filter((v): v is string => typeof v === "string"));
  chosen.add(LOCKED_COLUMN);
  return DESK_COLUMNS.map((c) => c.id).filter((id) => chosen.has(id));
}

export function toggleColumn(columns: DeskColumnId[], id: DeskColumnId): DeskColumnId[] {
  if (id === LOCKED_COLUMN) return columns;
  const next = columns.includes(id) ? columns.filter((c) => c !== id) : [...columns, id];
  return parseColumns(next);
}

// ---- how a device reads ----

export type StatusTone = "ok" | "weak" | "down" | "unknown";

/** A dish / Wi-Fi status as words and a sign as well as a color (the colors alone are not enough). */
export function statusView(status: DeviceStatus | string | undefined): { tone: StatusTone; label: string; sign: string } {
  switch (status) {
    case DeviceStatus.GREEN:
      return { tone: "ok", label: "متصل", sign: "●" };
    case DeviceStatus.YELLOW:
      return { tone: "weak", label: "ضعيف", sign: "◐" };
    case DeviceStatus.RED:
      return { tone: "down", label: "غير متصل", sign: "○" };
    default:
      return { tone: "unknown", label: "غير معروف", sign: "–" };
  }
}

/** The renewal (stop) date the card uses: the recharge date, else the standby date. */
export function renewalOf(account: Pick<StarlinkAccountSummary, "rechargeDate" | "standbyDate">): string {
  return (account.rechargeDate || account.standbyDate || "").trim();
}

/** Starlink's own balance as a number (0 for empty / unreadable). */
export function starlinkDue(account: Pick<StarlinkAccountSummary, "balanceDue">): number {
  const n = Number(String(account.balanceDue ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** A read older than this is shown as old («قديمة») - the device wasn't synced for two days. */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export function isStale(lastSuccessfulScanAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!lastSuccessfulScanAt) return true;
  const t = Date.parse(lastSuccessfulScanAt);
  return Number.isNaN(t) || now - t > STALE_AFTER_MS;
}

// ---- desk-only filters ----

export type ExpiryFilter = "all" | "expired" | "today" | "tomorrow" | "week" | "unread";

export const EXPIRY_FILTERS: { id: ExpiryFilter; label: string }[] = [
  { id: "all", label: "كل التواريخ" },
  { id: "expired", label: "منتهية" },
  { id: "today", label: "تنتهي الليلة" },
  { id: "tomorrow", label: "تنتهي غدًا" },
  { id: "week", label: "خلال 7 أيام" },
  { id: "unread", label: "التاريخ لم يُقرأ" },
];

/** Days as the card counts them: the renewal date is the stop instant, so 0 = stopped today,
 * 1 = tonight is the last night, 2 = tomorrow night. */
export function matchesExpiry(account: Pick<StarlinkAccountSummary, "rechargeDate" | "standbyDate">, filter: ExpiryFilter): boolean {
  if (filter === "all") return true;
  const date = renewalOf(account);
  const days = date ? daysRemainingNumber(date) : null;
  if (filter === "unread") return days === null;
  if (days === null) return false;
  if (filter === "expired") return days <= 0;
  if (filter === "today") return days === 1;
  if (filter === "tomorrow") return days === 2;
  return days >= 1 && days <= 7;
}

export interface DeskFilters {
  plan: string;
  expiry: ExpiryFilter;
  /** A customer category id ("" = all). */
  category: string;
}

export const NO_DESK_FILTERS: DeskFilters = { plan: "", expiry: "all", category: "" };

/** The plans present in this list, most used first - the «الباقة» choices. */
export function planChoices(accounts: Pick<StarlinkAccountSummary, "planName">[]): string[] {
  const counts = new Map<string, number>();
  for (const a of accounts) {
    const plan = a.planName?.trim();
    if (plan) counts.set(plan, (counts.get(plan) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([plan]) => plan);
}

export function applyDeskFilters<T extends StarlinkAccountSummary>(accounts: T[], filters: DeskFilters, categoriesOf: (account: T) => string[] = () => []): T[] {
  return accounts.filter(
    (a) =>
      (!filters.plan || a.planName?.trim() === filters.plan) &&
      matchesExpiry(a, filters.expiry) &&
      (!filters.category || categoriesOf(a).includes(filters.category)),
  );
}

/** How many desk filters are on (the badge on «تصفية»). */
export function activeDeskFilters(filters: DeskFilters): number {
  return (filters.plan ? 1 : 0) + (filters.expiry !== "all" ? 1 : 0) + (filters.category ? 1 : 0);
}

// ---- sort ----

export type SortKey = Exclude<DeskColumnId, "email">;
export interface DeskSort {
  key: SortKey;
  dir: "asc" | "desc";
}

export const DEFAULT_SORT: DeskSort = { key: "renewal", dir: "asc" };

const STATUS_ORDER: Record<StatusTone, number> = { down: 0, weak: 1, unknown: 2, ok: 3 };

export interface SortContext<T> {
  clientName: (account: T) => string;
  /** What the customer owes on this device, in one number (for ordering only). */
  owed: (account: T) => number;
}

/** A click on a header: the same column flips the direction, another one starts ascending. */
export function nextSort(current: DeskSort, key: SortKey): DeskSort {
  return current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" };
}

export function sortDevices<T extends StarlinkAccountSummary>(accounts: T[], sort: DeskSort, ctx: SortContext<T>): T[] {
  const text = (v: string) => v.trim();
  const value = (a: T): number | string | null => {
    switch (sort.key) {
      case "name":
        return text(a.name || a.starlinkAccountHolderName || "");
      case "client":
        return text(ctx.clientName(a));
      case "plan":
        return text(a.planName || "");
      case "renewal": {
        const d = renewalOf(a);
        return d ? daysRemainingNumber(d) : null;
      }
      case "due":
        return starlinkDue(a);
      case "owed":
        return ctx.owed(a);
      case "dish":
        return STATUS_ORDER[statusView(a.dishStatus).tone];
      case "wifi":
        return STATUS_ORDER[statusView(a.wifiStatus).tone];
      case "updated": {
        const t = a.lastSuccessfulScanAt ? Date.parse(a.lastSuccessfulScanAt) : NaN;
        return Number.isNaN(t) ? null : t;
      }
    }
  };
  const sign = sort.dir === "asc" ? 1 : -1;
  return accounts
    .map((a, i) => ({ a, i, v: value(a) }))
    .sort((x, y) => {
      // Missing values (no date, no name) always go last, whichever the direction.
      const xMissing = x.v === null || x.v === "";
      const yMissing = y.v === null || y.v === "";
      if (xMissing !== yMissing) return xMissing ? 1 : -1;
      if (!xMissing && !yMissing && x.v !== y.v) {
        const c = typeof x.v === "number" && typeof y.v === "number" ? x.v - y.v : String(x.v).localeCompare(String(y.v), "ar");
        if (c !== 0) return c * sign;
      }
      return x.i - y.i;
    })
    .map((r) => r.a);
}
