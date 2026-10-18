/**
 * 🕘 The home search's history (his Oct 18 2026 ask: «اجعل شريط البحث يحفظ كل الذي بحث عنه»):
 * the last searches, newest first, shown under the empty search bar - tap one to search it again,
 * ✕ to drop it. A phone setting (`starnet.`), not business data.
 */

import { normalizeSearchText } from "./homeInsights";

const KEY = "starnet.searchHistory";
export const SEARCH_HISTORY_LIMIT = 15;

/** Adds a search on top. Typing it letter by letter leaves one entry: an older one that the new
 * search starts with («سال» → «سالم») is replaced, and a repeat moves up. */
export function addSearch(history: string[], raw: string, limit = SEARCH_HISTORY_LIMIT): string[] {
  const term = raw.trim().replace(/\s+/g, " ");
  if (term.length < 2) return history;
  const key = normalizeSearchText(term);
  const kept = history.filter((h) => {
    const k = normalizeSearchText(h);
    return k !== key && !key.startsWith(k);
  });
  return [term, ...kept].slice(0, limit);
}

export function removeSearch(history: string[], term: string): string[] {
  return history.filter((h) => h !== term);
}

export function loadSearchHistory(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((h): h is string => typeof h === "string").slice(0, SEARCH_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

export function saveSearchHistory(history: string[]): void {
  try {
    if (history.length) window.localStorage.setItem(KEY, JSON.stringify(history));
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage unavailable
  }
}
