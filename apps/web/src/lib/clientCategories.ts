/**
 * 🏷️ The customers' categories (his Oct 19 2026 design): «📡 ستارلينك» - he has devices -, «👤 عام» - sales,
 * debts and transfers not tied to a device (no device, store invoices, or tagged by hand) - and categories of his
 * own («＋ تصنيف»: a name and a color). A customer keeps ONE account whatever his categories: a category only
 * groups, it never splits his balance or his records. Stored with the business data (`starnet_`, backed up).
 */

export const STARLINK = "starlink";
export const GENERAL = "general";

export interface ClientCategory {
  id: string;
  name: string;
  /** A CSS color (one of CATEGORY_COLORS). */
  color: string;
}

export const CATEGORY_COLORS = ["#2a78d6", "#1baf7a", "#eb6834", "#eda100", "#e87ba4", "#7c3aed", "#0891b2", "#e34948"];

export const BUILT_IN_CATEGORIES: (ClientCategory & { icon: string })[] = [
  { id: STARLINK, name: "ستارلينك", color: "#2a78d6", icon: "📡" },
  { id: GENERAL, name: "عام", color: "#56627a", icon: "👤" },
];

export interface CategoryFacts {
  /** His live devices. */
  deviceCount: number;
  /** Store invoices of his. */
  hasStoreRecords: boolean;
  /** What he was tagged with by hand (STARLINK, GENERAL and own categories' ids). */
  tags?: string[];
}

/** Every category he is in: 📡 when he has devices, 👤 when he has no device, store records or the tag, and his own. */
export function categoriesOf(facts: CategoryFacts, known: ClientCategory[] = []): string[] {
  const tags = new Set(facts.tags ?? []);
  const out: string[] = [];
  // 📡 also a customer added inside «ستارلينك» before his first device is registered.
  const starlink = facts.deviceCount > 0 || tags.has(STARLINK);
  if (starlink) out.push(STARLINK);
  if (!starlink || facts.hasStoreRecords || tags.has(GENERAL)) out.push(GENERAL);
  for (const c of known) if (tags.has(c.id)) out.push(c.id);
  return out;
}

/** How many customers in each category («الكل» = all of them). */
export function categoryCounts(rows: { categories: string[] }[]): Record<string, number> {
  const counts: Record<string, number> = { all: rows.length };
  for (const r of rows) for (const c of r.categories) counts[c] = (counts[c] ?? 0) + 1;
  return counts;
}

export type StandingFilter = "all" | "owes" | "credit" | "even";

export const STANDING_FILTERS: { id: StandingFilter; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "owes", label: "مدينون لنا" },
  { id: "credit", label: "لهم رصيد" },
  { id: "even", label: "حساب متوازن" },
];

export function matchesStanding(standing: "due" | "credit" | "clear", filter: StandingFilter): boolean {
  if (filter === "all") return true;
  if (filter === "owes") return standing === "due";
  if (filter === "credit") return standing === "credit";
  return standing === "clear";
}

/** A new category: a name no other one has (built-in included); null with the reason otherwise. */
export function addCategory(list: ClientCategory[], name: string, color: string, id = `cat-${Date.now().toString(36)}`): { ok: true; list: ClientCategory[] } | { ok: false; message: string } {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return { ok: false, message: "اكتب اسم التصنيف" };
  const taken = [...BUILT_IN_CATEGORIES, ...list].some((c) => c.name === clean);
  if (taken) return { ok: false, message: "هذا التصنيف موجود" };
  return { ok: true, list: [...list, { id, name: clean, color: CATEGORY_COLORS.includes(color) ? color : CATEGORY_COLORS[0]! }] };
}

export function removeCategory(list: ClientCategory[], id: string): ClientCategory[] {
  return list.filter((c) => c.id !== id);
}

const KEY = "starnet_client_categories_v1";

export function loadClientCategories(): ClientCategory[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((c): c is ClientCategory => Boolean(c && typeof c.id === "string" && typeof c.name === "string")) : [];
  } catch {
    return [];
  }
}

export function saveClientCategories(list: ClientCategory[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage unavailable
  }
}
