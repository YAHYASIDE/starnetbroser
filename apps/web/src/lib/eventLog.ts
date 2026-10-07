/**
 * 🔔 The app's notifications kept inside the app (his Oct 2026 rule: «أي إشعار يأتي يبقى هناك ولا
 * يُمحى»): every event the app posts to the phone's notification bar is also stored natively the
 * moment it happens (AppEventLog.java, even with the app closed); the app copies them here and they
 * stay until he deletes them himself. Phone-only (`starnet.eventLog`), like the phone's own bar.
 */

import { LocalBrowser } from "@starnet/local-browser-plugin";
import { isRunningInAndroidApp } from "./localBrowser";

export interface LoggedEvent {
  id: string;
  text: string;
  route: string;
  /** Epoch ms. */
  at: number;
  read?: boolean;
}

/** A busy phone keeps the newest this many. */
export const EVENT_LOG_MAX = 500;
/** Fired after a new event was saved, so the 🔔 badge updates at once. */
export const EVENT_LOG_CHANGED = "starnet:event-log";
const STORAGE_KEY = "starnet.eventLog";

/** New events added once each (by id), newest first, capped. */
export function mergeEvents(existing: LoggedEvent[], incoming: LoggedEvent[]): LoggedEvent[] {
  const ids = new Set(existing.map((e) => e.id));
  const fresh = incoming.filter((e) => e && e.id && e.text && !ids.has(e.id)).map((e) => ({ id: e.id, text: e.text, route: e.route || "/", at: Number(e.at) || 0 }));
  return [...existing, ...fresh].sort((a, b) => b.at - a.at).slice(0, EVENT_LOG_MAX);
}

export function unreadCount(events: LoggedEvent[]): number {
  return events.filter((e) => !e.read).length;
}

export function markRead(events: LoggedEvent[], id?: string): LoggedEvent[] {
  return events.map((e) => (id === undefined || e.id === id ? { ...e, read: true } : e));
}

export function removeEvent(events: LoggedEvent[], id: string): LoggedEvent[] {
  return events.filter((e) => e.id !== id);
}

/** "title" + "rest" - the first line is the title, like the phone's notification. */
export function eventTitle(event: Pick<LoggedEvent, "text">): { title: string; body: string } {
  const [title = "", ...rest] = event.text.split("\n");
  return { title: title.trim(), body: rest.join("\n").trim() };
}

export function loadEventLog(): LoggedEvent[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as LoggedEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveEventLog(events: LoggedEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    window.dispatchEvent(new Event(EVENT_LOG_CHANGED));
  } catch {
    // storage full / unavailable - the native copy is only dropped after a successful save
  }
}

/** An event the app itself notices (not posted to the phone's bar): kept in the 🔔 list. */
export function addLocalEvent(text: string, route = "/", now = Date.now()): void {
  const event: LoggedEvent = { id: `local-${now}-${Math.random().toString(36).slice(2, 8)}`, text, route, at: now };
  saveEventLog(mergeEvents(loadEventLog(), [event]));
}

/** Copies the events waiting on the native side into the list, then lets the native side forget them. */
export async function drainAppEvents(): Promise<LoggedEvent[]> {
  const current = loadEventLog();
  if (!isRunningInAndroidApp()) return current;
  try {
    const { events } = await LocalBrowser.appEventsPending();
    if (!events.length) return current;
    const next = mergeEvents(current, events);
    saveEventLog(next);
    if (JSON.stringify(loadEventLog()) === JSON.stringify(next)) await LocalBrowser.appEventsAck({ ids: events.map((e) => e.id) });
    return next;
  } catch {
    return current;
  }
}
