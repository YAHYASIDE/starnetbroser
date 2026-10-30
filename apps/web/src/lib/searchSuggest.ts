/**
 * 🔎 Suggestions under the home search while he types (his Oct 30 2026 ask «يظهر لك كل شيء مشابه لكتابتك - مثلًا
 * wifi lehsen»): devices, customers and reps, closest first. A field matches when it starts with the query, holds
 * it, holds it with the spaces taken out («wifi lehsen» ↔ «wifilehsen8589@gmail.com»), holds every word of it in
 * any order, or (last) is one or two typos away. Pure.
 */

import { fuzzyMatches, normalizeSearchText } from "./homeInsights";

export type SuggestKind = "device" | "client" | "rep";

export interface SuggestSource {
  kind: SuggestKind;
  id: string;
  title: string;
  /** Other fields searched (email, KIT, phone…), the first non-empty one shown under the title. */
  fields: (string | undefined)[];
}

export interface Suggestion {
  kind: SuggestKind;
  id: string;
  title: string;
  /** The field that matched (shown under the title), when it isn't the title. */
  hit?: string;
  score: number;
}

const compact = (text: string) => normalizeSearchText(text).replace(/[\s._\-+()/,]/g, "");

/** How close one field is to the query - 0 = no match. */
function fieldScore(query: string, field: string): number {
  const f = normalizeSearchText(field);
  if (!f) return 0;
  const q = normalizeSearchText(query);
  if (f.startsWith(q)) return 100;
  if (f.includes(q)) return 85;
  const cq = compact(query);
  const cf = compact(field);
  if (cq.length >= 3 && cf.startsWith(cq)) return 80;
  if (cq.length >= 3 && cf.includes(cq)) return 70;
  const words = q.split(" ").filter(Boolean);
  if (words.length > 1 && words.every((w) => cf.includes(compact(w)))) return 60;
  return 0;
}

export function suggestSearch(query: string, sources: SuggestSource[], limit = 8): Suggestion[] {
  if (normalizeSearchText(query).length < 2) return [];
  const out: Suggestion[] = [];
  for (const s of sources) {
    let best = 0;
    let hit: string | undefined;
    for (const [i, field] of [s.title, ...s.fields].entries()) {
      if (!field) continue;
      const score = fieldScore(query, field);
      if (score > best) {
        best = score;
        hit = i === 0 ? undefined : field;
      }
    }
    if (best === 0 && fuzzyMatches(query, s.title, ...s.fields)) best = 30;
    if (best > 0) out.push({ kind: s.kind, id: s.id, title: s.title, ...(hit ? { hit } : {}), score: best });
  }
  // closest first; then devices, customers, reps; then the shorter name
  const order: Record<SuggestKind, number> = { device: 0, client: 1, rep: 2 };
  return out.sort((a, b) => b.score - a.score || order[a.kind] - order[b.kind] || a.title.length - b.title.length).slice(0, limit);
}

/**
 * 📷 What a picture's text is searched by (his Oct 30 2026 choices: a KIT label, a screenshot with an email or a
 * name, a payment receipt): its emails, KIT / serial numbers, phone numbers, then its lines - most precise first.
 */
export function imageQueries(text: string, max = 12): string[] {
  const out: string[] = [];
  const add = (v: string | undefined) => {
    const t = v?.trim();
    if (t && t.length >= 3 && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  };
  for (const m of text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) add(m[0].toLowerCase());
  for (const m of text.matchAll(/\bKIT\s*[:#-]?\s*([A-Z0-9]{6,})/gi)) add(m[1]);
  for (const m of text.matchAll(/\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{8,}\b/g)) add(m[0]);
  for (const m of text.matchAll(/(?:\+?\d[\d\s-]{6,}\d)/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) add(digits.length > 8 ? digits.slice(-8) : digits);
  }
  for (const line of text.split(/\n+/)) {
    const clean = line.replace(/[^\p{L}\p{N}@._\s-]/gu, " ").replace(/\s+/g, " ").trim();
    if (clean.length >= 4 && clean.length <= 40) add(clean);
  }
  return out.slice(0, max);
}
