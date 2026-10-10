/**
 * 📌 التثبيت والملاحظة البنفسجية (his Oct 2026 ask «ضغط مطول تاتيني خيارات تثبيت او اضافة ملاحظه،
 * والملاحظة تكون ظاهر فوق الجهاز بلون ارجواني… يسالني هل يوضع في تثبيتات ام فقط ملاحظات»; the
 * council's verdict + his choices «كما في التوصية», «⏰ تثبيت حتى تاريخ»):
 *  - one current note per DEVICE (about the dish, not the customer), shown as one purple line on top
 *    of its card;
 *  - a pin, with its age («منذ 6 أيام») and an optional «⏰ حتى تاريخ» that puts it in «خطة اليوم»
 *    on that day.
 * His private memory: its own store (backed up with everything else), never on the device record,
 * so it never reaches a rep (copy or live link) nor any customer message, statement or image. It is
 * keyed by the device id, so it follows the device to the trash and back. Pure + a small store.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";

export interface DeviceNote {
  /** The note's text - one current note, replaced when he edits it. */
  text?: string;
  /** ISO - when the text was last written. */
  noteAt?: string;
  /** ISO - present = pinned. */
  pinnedAt?: string;
  /** yyyy-mm-dd - «⏰ حتى تاريخ»: from this day on the pin is a task in «خطة اليوم». */
  pinUntil?: string;
  /** 📜 The device's earlier notes, newest first (his choice «سجل ملاحظات بالتاريخ»): a note that
   * is replaced or deleted moves here with its date. */
  history?: DeviceNoteLog[];
}

export interface DeviceNoteLog {
  text: string;
  /** ISO - when that note was written. */
  at: string;
}

export const MAX_NOTE_HISTORY = 30;

/** accountId -> its note / pin. */
export type DeviceNotesStore = Record<string, DeviceNote>;

const KEY = "starnet_device_notes_v1";
export const MAX_NOTE_LENGTH = 300;

export function loadDeviceNotes(): DeviceNotesStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as DeviceNotesStore) : {};
  } catch {
    return {};
  }
}

export function saveDeviceNotes(store: DeviceNotesStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(store));
}

/** The store with `id`'s entry replaced - an empty entry (no text, not pinned) is removed. */
function withEntry(store: DeviceNotesStore, id: string, entry: DeviceNote): DeviceNotesStore {
  const next = { ...store };
  const clean: DeviceNote = {};
  if (entry.history?.length) clean.history = entry.history.slice(0, MAX_NOTE_HISTORY);
  if (entry.text) {
    clean.text = entry.text;
    clean.noteAt = entry.noteAt;
  }
  if (entry.pinnedAt) {
    clean.pinnedAt = entry.pinnedAt;
    if (entry.pinUntil) clean.pinUntil = entry.pinUntil;
  }
  if (clean.text || clean.pinnedAt || clean.history) next[id] = clean;
  else delete next[id];
  return next;
}

/** Saves the note from the editor: «💾 ملاحظة فقط» (`pin` false keeps the pin as it was) or
 * «📌 حفظ وتثبيت» (`pin` true; `until` = «⏰ حتى تاريخ», empty = no date). Empty text deletes the
 * note itself. */
export function saveDeviceNote(
  store: DeviceNotesStore,
  id: string,
  input: { text: string; pin: boolean; until?: string },
  now: Date = new Date(),
): DeviceNotesStore {
  const current = store[id] ?? {};
  const text = input.text.trim().replace(/\s+/g, " ").slice(0, MAX_NOTE_LENGTH);
  const changed = text !== (current.text ?? "");
  // The replaced (or deleted) note goes to the log with its own date.
  const history = changed && current.text ? [{ text: current.text, at: current.noteAt ?? now.toISOString() }, ...(current.history ?? [])] : current.history;
  const entry: DeviceNote = { ...current, text: text || undefined, noteAt: text ? (changed ? now.toISOString() : current.noteAt) : undefined, history };
  if (input.pin) {
    entry.pinnedAt = current.pinnedAt ?? now.toISOString();
    entry.pinUntil = input.until || undefined;
  }
  return withEntry(store, id, entry);
}

/** 📌 تثبيت / إلغاء التثبيت from the long-press menu (the note stays). */
export function setDevicePinned(store: DeviceNotesStore, id: string, pinned: boolean, now: Date = new Date()): DeviceNotesStore {
  const current = store[id] ?? {};
  return withEntry(store, id, pinned ? { ...current, pinnedAt: current.pinnedAt ?? now.toISOString() } : { ...current, pinnedAt: undefined, pinUntil: undefined });
}

export function isPinned(store: DeviceNotesStore, id: string): boolean {
  return Boolean(store[id]?.pinnedAt);
}

/** The pinned devices among the live ones (archived / in the trash don't count), newest pin first. */
export function pinnedDevices<A extends Pick<StarlinkAccountSummary, "id" | "deletedAt" | "archivedAt">>(store: DeviceNotesStore, accounts: A[]): A[] {
  return accounts
    .filter((a) => !a.deletedAt && !a.archivedAt && isPinned(store, a.id))
    .sort((a, b) => (store[b.id]!.pinnedAt ?? "").localeCompare(store[a.id]!.pinnedAt ?? ""));
}

function dayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** «اليوم» / «منذ يوم» / «منذ يومين» / «منذ 6 أيام». */
export function pinAgeText(pinnedAt: string, now: Date = new Date()): string {
  const at = new Date(pinnedAt);
  if (Number.isNaN(at.getTime())) return "";
  const days = Math.max(0, Math.round((dayStart(now) - dayStart(at)) / 86_400_000));
  if (days === 0) return "اليوم";
  if (days === 1) return "منذ يوم";
  if (days === 2) return "منذ يومين";
  return days <= 10 ? `منذ ${days} أيام` : `منذ ${days} يومًا`;
}

export interface DuePin {
  accountId: string;
  name: string;
  text?: string;
  pinUntil: string;
}

/** ⏰ Pins whose date has come (today or earlier) - tasks in «خطة اليوم». */
export function duePins(
  store: DeviceNotesStore,
  accounts: Pick<StarlinkAccountSummary, "id" | "name" | "deletedAt" | "archivedAt">[],
  today: string,
): DuePin[] {
  return pinnedDevices(store, accounts)
    .filter((a) => store[a.id]!.pinUntil && store[a.id]!.pinUntil! <= today)
    .map((a) => ({ accountId: a.id, name: a.name, text: store[a.id]!.text, pinUntil: store[a.id]!.pinUntil! }))
    .sort((a, b) => a.pinUntil.localeCompare(b.pinUntil));
}

/** 🔗 Merging a duplicate: the dropped device's note joins the kept one's, the pin is kept if
 * either was pinned. */
export function mergeDeviceNotes(store: DeviceNotesStore, dropId: string, keepId: string): DeviceNotesStore {
  const drop = store[dropId];
  if (!drop) return store;
  const keep = store[keepId] ?? {};
  const text = [keep.text, drop.text].filter(Boolean).join(" · ").slice(0, MAX_NOTE_LENGTH) || undefined;
  const pinnedAt = [keep.pinnedAt, drop.pinnedAt].filter(Boolean).sort()[0];
  const until = [keep.pinUntil, drop.pinUntil].filter(Boolean).sort()[0];
  const history = [...(keep.history ?? []), ...(drop.history ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  const merged = withEntry(store, keepId, {
    text,
    noteAt: [keep.noteAt, drop.noteAt].filter(Boolean).sort().pop(),
    pinnedAt,
    pinUntil: until,
    history: history.length ? history : undefined,
  });
  return withEntry(merged, dropId, {});
}

/** 🧹 «إلغاء كل التثبيتات»: every pin off at once - the notes and their log stay. */
export function unpinAll(store: DeviceNotesStore): DeviceNotesStore {
  let next = store;
  for (const id of Object.keys(store)) if (store[id]!.pinnedAt) next = setDevicePinned(next, id, false);
  return next;
}

/** 🔍 Home search finds a device by its note (current or in the log). */
export function noteMatchesQuery(note: DeviceNote | undefined, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q || !note) return false;
  return [note.text, ...(note.history ?? []).map((h) => h.text)].some((t) => t?.toLowerCase().includes(q));
}

/** 🧹 After a renewal or a payment on a pinned device: ask «إزالة التثبيت؟» - its reason (a promise,
 * a pending renewal) is often done now. True when an operation was added to a pinned device. */
export function shouldAskUnpin(store: DeviceNotesStore, id: string, before: { id: string }[], after: { id: string }[]): boolean {
  if (!isPinned(store, id)) return false;
  const known = new Set(before.map((e) => e.id));
  return after.some((e) => !known.has(e.id));
}
