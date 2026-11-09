/**
 * 💬 Organising the conversations (his Nov 9 2026 brief, the chat list's part): 📌 pinned on top, 🔕 muted (no phone
 * notification), 🗄️ archived (out of the list, under «المؤرشفة»), filters (الكل / غير المقروءة / المندوبون / الفريق /
 * المؤرشفة) and a search over the names AND what was written. Kept on this phone (`starnet.chatListPrefs`). Pure + store.
 */

export interface ChatListPrefs {
  pinned: string[];
  muted: string[];
  archived: string[];
}

export type ChatFilter = "all" | "unread" | "reps" | "team" | "archived";

export const CHAT_FILTERS: { id: ChatFilter; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "unread", label: "غير المقروءة" },
  { id: "reps", label: "المندوبون" },
  { id: "team", label: "الفريق" },
  { id: "archived", label: "🗄️ المؤرشفة" },
];

export const EMPTY_PREFS: ChatListPrefs = { pinned: [], muted: [], archived: [] };

export function togglePref(prefs: ChatListPrefs, kind: keyof ChatListPrefs, conv: string): ChatListPrefs {
  const list = prefs[kind];
  const next = list.includes(conv) ? list.filter((c) => c !== conv) : [...list, conv];
  // an archived conversation is not pinned
  if (kind === "archived" && !list.includes(conv)) return { ...prefs, archived: next, pinned: prefs.pinned.filter((c) => c !== conv) };
  if (kind === "pinned" && !list.includes(conv)) return { ...prefs, pinned: next, archived: prefs.archived.filter((c) => c !== conv) };
  return { ...prefs, [kind]: next };
}

/** Arabic search folding: hamza forms, ta marbuta, alef maqsura, diacritics; case. */
export function foldSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ListRow {
  conv: string;
  title: string;
  lastAt: number;
  unread: number;
  /** What matched in the messages (the search). */
  hit?: string;
}

/**
 * The rows to show: the filter, the search (a name, or any message's words - the newest match shown), then 📌 pinned
 * first, then the newest conversation first. Archived ones only under «المؤرشفة» (or when a search finds them).
 */
export function chatRows(
  rows: (ListRow & { texts: string[] })[],
  prefs: ChatListPrefs,
  filter: ChatFilter,
  query: string,
): ListRow[] {
  const q = foldSearch(query);
  const out: ListRow[] = [];
  for (const r of rows) {
    const archived = prefs.archived.includes(r.conv);
    if (filter === "archived" ? !archived : archived && !q) continue;
    if (filter === "unread" && r.unread === 0) continue;
    if (filter === "reps" && !r.conv.startsWith("rep:")) continue;
    if (filter === "team" && r.conv !== "team") continue;
    let hit: string | undefined;
    if (q && !foldSearch(r.title).includes(q)) {
      hit = [...r.texts].reverse().find((t) => foldSearch(t).includes(q));
      if (!hit) continue;
    }
    out.push({ conv: r.conv, title: r.title, lastAt: r.lastAt, unread: r.unread, ...(hit ? { hit: hit.length > 80 ? `${hit.slice(0, 80)}…` : hit } : {}) });
  }
  const pinned = (c: string) => (prefs.pinned.includes(c) ? 1 : 0);
  return out.sort((a, b) => pinned(b.conv) - pinned(a.conv) || b.lastAt - a.lastAt);
}

const KEY = "starnet.chatListPrefs";
export const CHAT_PREFS_EVENT = "starnet:chat-prefs";

export function loadChatListPrefs(): ChatListPrefs {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<ChatListPrefs> | null;
    const arr = (x: unknown) => (Array.isArray(x) ? x.filter((c): c is string => typeof c === "string") : []);
    return v ? { pinned: arr(v.pinned), muted: arr(v.muted), archived: arr(v.archived) } : EMPTY_PREFS;
  } catch {
    return EMPTY_PREFS;
  }
}

export function saveChatListPrefs(prefs: ChatListPrefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
    window.dispatchEvent(new Event(CHAT_PREFS_EVENT));
  } catch {
    // storage full
  }
}
