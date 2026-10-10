/**
 * 🔍 The search at the top of الإعدادات: anything in the app - a setting (opens its line), a page,
 * or a device / customer / supplier / rep / store item (opens the home search on it). Pure.
 */

import { deviceMatchesQuery, normalizeSearchText, searchEverything, type SearchResultKind, type SearchSources } from "./homeInsights";
import { SETTINGS_GROUPS, SETTINGS_ITEMS, type SettingsItem } from "./settingsGroups";
import { PINNABLE_PAGES } from "./shortcuts";

export interface SearchDevice {
  id: string;
  name: string;
  kitNumber: string;
  serialNumber: string;
  expectedEmail?: string;
  starlinkAccountEmail?: string;
  starlinkId?: string;
  accountNumber?: string;
  subscriptionId?: string;
}

export type AppSearchHit =
  | { kind: "setting"; item: SettingsItem }
  | { kind: "page"; route: string; label: string }
  | { kind: "device" | SearchResultKind; id: string; title: string; subtitle?: string; route: string };

function includes(query: string, ...texts: string[]): boolean {
  const q = normalizeSearchText(query);
  return q.length > 0 && texts.some((t) => normalizeSearchText(t).includes(q));
}

/** Settings first, then pages, then the data (at most `limit` of each kind). */
export function searchApp(query: string, sources: SearchSources & { devices: SearchDevice[] }, limit = 5): AppSearchHit[] {
  if (!normalizeSearchText(query)) return [];
  const groupTitle = (id: string) => SETTINGS_GROUPS.find((g) => g.id === id)?.title ?? "";
  const settings: AppSearchHit[] = SETTINGS_ITEMS.filter((i) => includes(query, i.title, i.summary, groupTitle(i.group), ...i.keywords))
    .slice(0, limit)
    .map((item) => ({ kind: "setting", item }));
  const pages: AppSearchHit[] = PINNABLE_PAGES.filter((p) => includes(query, p.label))
    .slice(0, limit)
    .map((p) => ({ kind: "page", route: p.route, label: p.label }));
  const home = (text: string) => `/?q=${encodeURIComponent(text)}`;
  const devices: AppSearchHit[] = sources.devices
    .filter((d) => deviceMatchesQuery(query, d))
    .slice(0, limit)
    .map((d) => ({ kind: "device", id: d.id, title: d.name || "جهاز", subtitle: d.kitNumber || d.expectedEmail, route: home(d.name || query) }));
  const others: AppSearchHit[] = searchEverything(query, sources, limit).map((r) => ({ ...r, route: home(r.title) }));
  return [...settings, ...pages, ...devices, ...others];
}
