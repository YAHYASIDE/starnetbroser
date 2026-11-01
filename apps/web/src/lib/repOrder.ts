/**
 * ↕️ The order of the reps' cards (his Nov 1 2026 choice «ترتيب بطاقات المندوبين»): ✋ his own order (▲ / ▼),
 * by name, the most devices first, or the most he owes us first. A view setting of this phone (`starnet.` - not
 * business data, not in the backup). Pure + two small savers.
 */

export type RepSort = "manual" | "name" | "devices" | "owed";

export const REP_SORTS: { id: RepSort; label: string }[] = [
  { id: "manual", label: "✋ ترتيبي" },
  { id: "name", label: "🔤 بالاسم" },
  { id: "devices", label: "📡 الأكثر أجهزة" },
  { id: "owed", label: "⚖️ الأكثر عليه" },
];

export interface RepOrderInfo {
  /** ✋ his order (rep ids); a rep not in it goes after, by name. */
  order: string[];
  devices: Record<string, number>;
  /** What he owes us now in one currency (+ = عليه). */
  owed: Record<string, number>;
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "ar");

export function orderReps<T extends { id: string; name: string }>(reps: T[], sort: RepSort, info: RepOrderInfo): T[] {
  const list = [...reps];
  if (sort === "name") return list.sort(byName);
  if (sort === "devices") return list.sort((a, b) => (info.devices[b.id] ?? 0) - (info.devices[a.id] ?? 0) || byName(a, b));
  if (sort === "owed") return list.sort((a, b) => (info.owed[b.id] ?? 0) - (info.owed[a.id] ?? 0) || byName(a, b));
  const at = new Map(info.order.map((id, i) => [id, i]));
  return list.sort((a, b) => (at.get(a.id) ?? Infinity) - (at.get(b.id) ?? Infinity) || byName(a, b));
}

/** ▲ / ▼ one rep in his order (`shown` = the cards as they are now, so a rep never in the order gets a place). */
export function moveRep(shown: string[], id: string, step: -1 | 1): string[] {
  const order = [...shown];
  const i = order.indexOf(id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= order.length) return order;
  [order[i], order[j]] = [order[j]!, order[i]!];
  return order;
}

const SORT_KEY = "starnet.repSort";
const ORDER_KEY = "starnet.repOrder";

export function loadRepSort(): { sort: RepSort; order: string[] } {
  try {
    const sort = window.localStorage.getItem(SORT_KEY);
    const order = JSON.parse(window.localStorage.getItem(ORDER_KEY) ?? "[]") as unknown;
    return {
      sort: REP_SORTS.some((s) => s.id === sort) ? (sort as RepSort) : "manual",
      order: Array.isArray(order) ? order.filter((x): x is string => typeof x === "string") : [],
    };
  } catch {
    return { sort: "manual", order: [] };
  }
}

export function saveRepSort(sort: RepSort, order: string[]): void {
  try {
    window.localStorage.setItem(SORT_KEY, sort);
    window.localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch {
    // this session only
  }
}
