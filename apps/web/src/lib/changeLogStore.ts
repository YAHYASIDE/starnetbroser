/**
 * 🔔 The impure side of changeLog.ts: each store's save calls `noteChanges` with the value that was
 * stored before it and the one being written; what a person changed lands in the 🔔 list. Never
 * throws - a notice must not break a save.
 */

import { clientChangeEvents, collapseEvents, deviceChangeEvents, ledgerChangeEvents, rateChangeEvents, type ChangeEvent } from "./changeLog";

const ACCOUNTS_KEY = "starnet_demo_accounts_v1";

export type WatchedStore = "devices" | "clients" | "ledger" | "rates";

function readStored(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

/** The stored value right now - call it before writing the new one. */
export function storedBefore(key: string): unknown {
  if (typeof window === "undefined") return undefined;
  return readStored(key);
}

function deviceNames(): (accountId: string) => string {
  const list = readStored(ACCOUNTS_KEY);
  const names = new Map<string, string>();
  if (Array.isArray(list)) {
    for (const d of list) if (d && typeof d === "object") names.set(String((d as { id?: unknown }).id), String((d as { name?: unknown }).name ?? ""));
  }
  return (id) => names.get(id) ?? "";
}

export function changeEventsFor(store: WatchedStore, before: unknown, after: unknown): ChangeEvent[] {
  if (before === undefined) return [];
  switch (store) {
    case "devices":
      return deviceChangeEvents(before, after);
    case "clients":
      return clientChangeEvents(before, after);
    case "ledger":
      return ledgerChangeEvents(before, after, deviceNames());
    case "rates":
      return rateChangeEvents(before, after);
  }
}

export function noteChanges(store: WatchedStore, before: unknown, after: unknown): void {
  if (typeof window === "undefined") return;
  try {
    const events = collapseEvents(changeEventsFor(store, before, after));
    if (!events.length) return;
    // eventLog pulls in the native plugin - loaded only when there is something to say.
    void import("./eventLog")
      .then(({ addLocalEvent }) => {
        let at = Date.now();
        for (const e of events) addLocalEvent(e.text, e.route, at++);
      })
      .catch(() => {});
  } catch {
    // a notice never breaks a save
  }
}
